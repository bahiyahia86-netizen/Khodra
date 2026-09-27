import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { createConnection, type Connection } from 'mysql2/promise'

export interface MySqlConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

let serverInstance: {
  stop: () => Promise<void>
  port: number
  username: string
  dbName: string
} | null = null

let dbConfig: MySqlConfig | null = null
let engineMode: 'mysql' | 'sqlite' | null = null

function getUserDataPath(): string {
  try {
    return app.getPath('userData')
  } catch {
    return path.join(process.cwd(), 'data')
  }
}

export function getDataDirectory(): string {
  const dir = path.join(getUserDataPath(), 'khodra-db')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getBackupsDirectory(): string {
  const dir = path.join(getUserDataPath(), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getDatabaseUrl(): string {
  if (!dbConfig) {
    throw new Error('قاعدة البيانات غير مهيأة بعد')
  }
  const { user, password, host, port, database } = dbConfig
  return `mysql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`
}

export function getDbConfig(): MySqlConfig {
  if (!dbConfig) {
    throw new Error('قاعدة البيانات غير مهيأة بعد')
  }
  return dbConfig
}

export function getEngineMode(): 'mysql' | 'sqlite' | null {
  return engineMode
}

/**
 * يبدأ MySQL إن أمكن، وإلا يفعّل وضع SQLite المحلي (Offline-first).
 */
export async function startMySqlServer(): Promise<'mysql' | 'sqlite'> {
  if (engineMode) return engineMode

  // Force sqlite for CI / restricted environments
  if (process.env.KHODRA_DB === 'sqlite') {
    engineMode = 'sqlite'
    console.log('[DB] وضع SQLite مفروض عبر KHODRA_DB')
    return 'sqlite'
  }

  fs.mkdirSync(getDataDirectory(), { recursive: true })
  console.log('[MySQL] محاولة تشغيل خادم MySQL المحلي...')

  try {
    const { createDB } = await import('mysql-memory-server')
    const db = await createDB({
      dbName: 'khodra',
      version: '8.0.x',
      username: 'khodra',
      ignoreUnsupportedSystemVersion: true,
      logLevel: 'WARN',
      downloadBinaryOnce: true,
      downloadRetries: 2,
    })

    serverInstance = {
      stop: () => db.stop(),
      port: db.port,
      username: db.username,
      dbName: db.dbName,
    }

    dbConfig = {
      host: '127.0.0.1',
      port: db.port,
      user: db.username,
      password: '',
      database: db.dbName || 'khodra',
    }
    engineMode = 'mysql'
    console.log(
      `[MySQL] يعمل على المنفذ ${db.port} | user=${db.username} | db=${db.dbName}`,
    )
    return 'mysql'
  } catch (err) {
    console.warn('[MySQL] تعذر التشغيل المدمج:', (err as Error).message?.slice(0, 120))
  }

  // Try system MySQL
  try {
    await tryLocalMySql()
    engineMode = 'mysql'
    return 'mysql'
  } catch {
    console.warn('[MySQL] لا يوجد خادم محلي — التبديل إلى SQLite Offline')
  }

  engineMode = 'sqlite'
  return 'sqlite'
}

async function tryLocalMySql(): Promise<MySqlConfig> {
  const candidates: Array<{ port: number; user: string; password: string }> = [
    { port: 3306, user: 'root', password: '' },
    { port: 3306, user: 'root', password: 'root' },
    { port: 3307, user: 'root', password: '' },
  ]

  for (const c of candidates) {
    try {
      const conn = await createConnection({
        host: '127.0.0.1',
        port: c.port,
        user: c.user,
        password: c.password,
        connectTimeout: 1500,
      })
      await conn.query(
        `CREATE DATABASE IF NOT EXISTS \`khodra\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      )
      await conn.end()
      dbConfig = {
        host: '127.0.0.1',
        port: c.port,
        user: c.user,
        password: c.password,
        database: 'khodra',
      }
      console.log(`[MySQL] متصل بخادم محلي على المنفذ ${c.port}`)
      return dbConfig
    } catch {
      // try next
    }
  }

  throw new Error('no local mysql')
}

export async function stopMySqlServer(): Promise<void> {
  if (serverInstance) {
    try {
      await serverInstance.stop()
    } catch (err) {
      console.error('[MySQL] خطأ أثناء الإيقاف:', err)
    }
    serverInstance = null
  }
  dbConfig = null
  engineMode = null
}

export async function createRawConnection(database?: string): Promise<Connection> {
  const cfg = getDbConfig()
  return createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: database ?? cfg.database,
    multipleStatements: true,
    charset: 'utf8mb4',
  })
}
