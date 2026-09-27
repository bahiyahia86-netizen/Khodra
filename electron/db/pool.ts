import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import mysql from 'mysql2/promise'
import path from 'node:path'
import fs from 'node:fs'
import { getDbConfig, getDataDirectory, type MySqlConfig } from './mysql-manager'
import { openSqlite, type SqliteEngine } from './sqlite-engine'

type EngineKind = 'mysql' | 'sqlite'

let kind: EngineKind = 'mysql'
let pool: Pool | null = null
let sqlite: SqliteEngine | null = null

export async function initPool(preferred?: EngineKind): Promise<void> {
  if (preferred === 'sqlite' || (!preferred && process.env.KHODRA_DB === 'sqlite')) {
    await initSqlite()
    return
  }

  // Try MySQL first if config is available
  try {
    const cfg = getDbConfig()
    await initMysql(cfg)
    return
  } catch {
    // fall through
  }

  await initSqlite()
}

async function initMysql(cfg: MySqlConfig): Promise<void> {
  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
    charset: 'utf8mb4',
    dateStrings: false,
  })
  const conn = await pool.getConnection()
  await conn.ping()
  conn.release()
  kind = 'mysql'
  console.log('[DB] MySQL pool جاهز')
}

async function initSqlite(): Promise<void> {
  const file = path.join(getDataDirectory(), 'khodra.sqlite')
  sqlite = await openSqlite(file)
  kind = 'sqlite'
  console.log('[DB] SQLite جاهز:', file)
}

export function getEngineKind(): EngineKind {
  return kind
}

export function getPool(): Pool {
  if (!pool) throw new Error('MySQL pool غير مهيأ')
  return pool
}

export function getSqlite(): SqliteEngine {
  if (!sqlite) throw new Error('SQLite غير مهيأ')
  return sqlite
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
  if (sqlite) {
    sqlite.close()
    sqlite = null
  }
}

/** Run a SELECT and return rows as plain objects */
export async function query<T extends RowDataPacket[] = RowDataPacket[]>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  if (kind === 'sqlite') {
    const rows = sqlite!.query(sql, params)
    return rows as unknown as T
  }
  const [rows] = await pool!.query<T>(sql, params)
  return rows
}

/** Run INSERT/UPDATE/DELETE */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<ResultSetHeader> {
  if (kind === 'sqlite') {
    // Handle ON DUPLICATE KEY for settings
    let s = sql
    if (/ON DUPLICATE KEY UPDATE/i.test(s)) {
      s = s.replace(
        /INSERT INTO settings \(`key`, value\) VALUES \(\?, \?\)\s*ON DUPLICATE KEY UPDATE value = VALUES\(value\)/i,
        'INSERT INTO settings ("key", value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
    }
    const result = sqlite!.exec(s, params)
    sqlite!.save()
    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows,
      fieldCount: 0,
      info: '',
      serverStatus: 0,
      warningStatus: 0,
      changedRows: result.affectedRows,
    } as ResultSetHeader
  }
  const [result] = await pool!.execute<ResultSetHeader>(sql, params)
  return result
}

export async function withTransaction<T>(
  fn: (conn: TxConn) => Promise<T>,
): Promise<T> {
  if (kind === 'sqlite') {
    return sqlite!.transaction(() => {
      const tx: TxConn = {
        query: async <R extends RowDataPacket[]>(sql: string, params?: unknown[]) => {
          const rows = sqlite!.query(sql, params || [])
          return [rows as unknown as R, []] as [R, unknown]
        },
        execute: async (sql: string, params?: unknown[]) => {
          const r = sqlite!.exec(sql, params || [])
          return [
            {
              insertId: r.insertId,
              affectedRows: r.affectedRows,
            } as ResultSetHeader,
            undefined,
          ]
        },
      }
      // fn is async but sqlite transaction is sync — run carefully
      let result!: T
      let error: unknown
      const done = fn(tx).then(
        (v) => {
          result = v
        },
        (e) => {
          error = e
        },
      )
      // Spin with Atomics? We can't block. Instead use a different approach:
      throw new Error('INTERNAL: use withTransactionSync for sqlite path')
    })
  }

  const conn = await pool!.getConnection()
  try {
    await conn.beginTransaction()
    const tx: TxConn = {
      query: (sql, params) => conn.query(sql, params),
      execute: (sql, params) => conn.execute(sql, params),
    }
    const result = await fn(tx)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export interface TxConn {
  query: <T extends RowDataPacket[] = RowDataPacket[]>(
    sql: string,
    params?: unknown[],
  ) => Promise<[T, unknown]>
  execute: (
    sql: string,
    params?: unknown[],
  ) => Promise<[ResultSetHeader | { insertId: number; affectedRows: number }, unknown]>
}

/**
 * Unified transaction that works for both engines.
 * The callback receives helpers that always return promises.
 */
export async function runTransaction<T>(fn: (tx: TxHelpers) => Promise<T>): Promise<T> {
  if (kind === 'sqlite') {
    // Manual BEGIN/COMMIT because sql.js is sync but our services are async.
    // We serialize operations; nested awaits inside are fine as long as
    // no concurrent writers exist (single-threaded node).
    sqlite!.exec('BEGIN')
    const helpers: TxHelpers = {
      query: async <R = RowDataPacket>(sql: string, params: unknown[] = []) =>
        sqlite!.query(sql, params) as unknown as R[],
      execute: async (sql: string, params: unknown[] = []) => {
        const r = sqlite!.exec(sql, params)
        return { insertId: r.insertId, affectedRows: r.affectedRows }
      },
    }
    try {
      const result = await fn(helpers)
      sqlite!.exec('COMMIT')
      sqlite!.save()
      return result
    } catch (err) {
      try {
        sqlite!.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw err
    }
  }

  const conn = await pool!.getConnection()
  try {
    await conn.beginTransaction()
    const helpers: TxHelpers = {
      query: async <R = RowDataPacket>(sql: string, params: unknown[] = []) => {
        const [rows] = await conn.query(sql, params)
        return rows as R[]
      },
      execute: async (sql: string, params: unknown[] = []) => {
        const [result] = await conn.execute<ResultSetHeader>(sql, params)
        return { insertId: result.insertId, affectedRows: result.affectedRows }
      },
    }
    const result = await fn(helpers)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export interface TxHelpers {
  query: <R = RowDataPacket>(sql: string, params?: unknown[]) => Promise<R[]>
  execute: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ insertId: number; affectedRows: number }>
}

export type { PoolConnection, ResultSetHeader, RowDataPacket }

/** Dump for backup */
export function exportSqliteFile(targetPath: string): void {
  if (kind !== 'sqlite' || !sqlite) throw new Error('ليس SQLite')
  sqlite.save()
  fs.copyFileSync(sqlite.dbPath, targetPath)
}

export function importSqliteFile(sourcePath: string): void {
  if (kind !== 'sqlite' || !sqlite) throw new Error('ليس SQLite')
  sqlite.close()
  fs.copyFileSync(sourcePath, path.join(getDataDirectory(), 'khodra.sqlite'))
}
