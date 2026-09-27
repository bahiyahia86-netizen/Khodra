/**
 * SQLite (sql.js) engine — offline local database.
 * Production Windows installs prefer MySQL; this keeps the app fully functional offline.
 */
import fs from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js'

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>
type Database = InstanceType<SqlJsStatic['Database']>

export interface SqliteEngine {
  kind: 'sqlite'
  exec: (sql: string, params?: unknown[]) => { insertId: number; affectedRows: number }
  runRaw: (sql: string) => void
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  transaction: <T>(fn: () => T) => T
  save: () => void
  close: () => void
  dbPath: string
}

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let dbPath = ''
let dirty = false

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL
  const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const wasmBinary = fs.readFileSync(wasmPath)
  SQL = await initSqlJs({ wasmBinary })
  return SQL
}

/** Light cleanup of MySQL-only syntax for runtime queries */
function normalizeSql(sql: string): string {
  let s = sql
  s = s.replace(/\s+FOR UPDATE\b/gi, '')
  s = s.replace(/`/g, '"')
  s = s.replace(/\bINSERT\s+IGNORE\b/gi, 'INSERT OR IGNORE')
  s = s.replace(/\bTRUE\b/gi, '1')
  s = s.replace(/\bFALSE\b/gi, '0')
  // settings upsert
  s = s.replace(
    /INSERT\s+INTO\s+settings\s*\(\s*"?key"?\s*,\s*value\s*\)\s*VALUES\s*\(\s*\?\s*,\s*\?\s*\)\s*ON\s+DUPLICATE\s+KEY\s+UPDATE\s+value\s*=\s*VALUES\s*\(\s*value\s*\)/gi,
    'INSERT INTO settings ("key", value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  return s
}

export async function openSqlite(filePath: string): Promise<SqliteEngine> {
  const sqljs = await loadSqlJs()
  dbPath = filePath
  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath)
    db = new sqljs.Database(fileBuffer)
  } else {
    db = new sqljs.Database()
  }

  db.run('PRAGMA foreign_keys = ON;')

  const engine: SqliteEngine = {
    kind: 'sqlite',
    dbPath: filePath,

    runRaw(sql: string) {
      if (!db) throw new Error('SQLite closed')
      db.run(sql)
      dirty = true
    },

    exec(sql: string, params: unknown[] = []) {
      if (!db) throw new Error('SQLite closed')
      const normalized = normalizeSql(sql)

      if (!params.length) {
        db.run(normalized)
        dirty = true
        const idRow = db.exec('SELECT last_insert_rowid() AS id')
        const insertId = idRow[0]?.values[0]?.[0] ? Number(idRow[0].values[0][0]) : 0
        return { insertId, affectedRows: db.getRowsModified() }
      }

      const stmt = db.prepare(normalized)
      try {
        stmt.run(params as never[])
      } finally {
        stmt.free()
      }
      dirty = true
      const idRow = db.exec('SELECT last_insert_rowid() AS id')
      const insertId = idRow[0]?.values[0]?.[0] ? Number(idRow[0].values[0][0]) : 0
      return { insertId, affectedRows: db.getRowsModified() }
    },

    query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
      if (!db) throw new Error('SQLite closed')
      const normalized = normalizeSql(sql)
      const stmt = db.prepare(normalized)
      try {
        if (params.length) stmt.bind(params as never[])
        const rows: T[] = []
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as T)
        }
        return rows
      } finally {
        stmt.free()
      }
    },

    transaction<T>(fn: () => T): T {
      if (!db) throw new Error('SQLite closed')
      db.run('BEGIN')
      try {
        const result = fn()
        db.run('COMMIT')
        dirty = true
        return result
      } catch (err) {
        db.run('ROLLBACK')
        throw err
      }
    },

    save() {
      if (!db || !dirty) return
      const data = db.export()
      fs.writeFileSync(dbPath, Buffer.from(data))
      dirty = false
    },

    close() {
      if (db) {
        engine.save()
        db.close()
        db = null
      }
    },
  }

  const timer = setInterval(() => {
    try {
      engine.save()
    } catch {
      /* ignore */
    }
  }, 3000)
  if (typeof timer === 'object' && 'unref' in timer) timer.unref()

  return engine
}

export function isSqliteOpen(): boolean {
  return db !== null
}
