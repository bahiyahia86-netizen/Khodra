import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
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
function findPortableMariaDbRoot(): string | null {
  const candidates = [
    path.join(process.cwd(), 'mariadb-10.11.7-winx64'),
    path.join(process.cwd(), 'database', 'mariadb'),
    path.join(process.cwd(), 'app', 'database', 'mariadb'),
    path.join(process.cwd(), '..', 'mariadb-10.11.7-winx64'),
    'E:\\mariadb-10.11.7-winx64',
    'E:\\mariadb-10.11.7-winx64\\mariadb-10.11.7-winx64',
  ]

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    const serverBin = path.join(resolved, 'bin', 'mysqld.exe')
    if (fs.existsSync(serverBin)) return resolved
  }

  return null
}

async function waitForMariaDb(host: string, port: number, timeoutMs = 60000): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const conn = await createConnection({ host, port, user: 'root', password: '', connectTimeout: 1500 })
      await conn.end()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  throw new Error(`MariaDB على ${host}:${port} لم يصبح جاهزًا خلال ${timeoutMs}ms`)
}

async function tryPortableMariaDb(): Promise<MySqlConfig> {
  const root = findPortableMariaDbRoot()
  if (!root) {
    throw new Error('portable mariadb not found')
  }

  const packageRoot = path.dirname(root)
  const datadir = fs.existsSync(path.join(packageRoot, 'data'))
    ? path.join(packageRoot, 'data')
    : path.join(root, 'data')
  const configPath = path.join(packageRoot, 'my.ini')

  fs.mkdirSync(datadir, { recursive: true })

  if (!fs.existsSync(configPath)) {
    const ini = [
      '[mysqld]',
      `basedir=${root.replace(/\\/g, '/')}`,
      `datadir=${datadir.replace(/\\/g, '/')}`,
      'port=3307',
      'bind-address=127.0.0.1',
      'skip-networking=0',
      'character-set-server=utf8mb4',
      'collation-server=utf8mb4_unicode_ci',
      '',
    ].join('\n')
    fs.writeFileSync(configPath, ini, 'utf8')
  }

  const configExists = fs.existsSync(path.join(root, 'my.ini'))
  if (configExists && !fs.existsSync(configPath)) {
    fs.copyFileSync(path.join(root, 'my.ini'), configPath)
  }

  const binary = path.join(root, 'bin', 'mysqld.exe')
  const isRunning = await isPortOpen('127.0.0.1', 3307)
  if (!isRunning) {
    const child = spawn(binary, ['--defaults-file=' + configPath, '--console', '--standalone'], {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    })
    child.unref()
    await waitForMariaDb('127.0.0.1', 3307)
  }

  const conn = await createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: '',
    connectTimeout: 2000,
  })

  await conn.query('CREATE DATABASE IF NOT EXISTS `khodra` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  await conn.end()

  dbConfig = {
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: '',
    database: 'khodra',
  }
  console.log('[MySQL] متصل بـ MariaDB Portable على 127.0.0.1:3307 | db=khodra')
  return dbConfig
}

async function isPortOpen(host: string, port: number): Promise<boolean> {
  try {
    const conn = await createConnection({ host, port, user: 'root', password: '', connectTimeout: 1000 })
    await conn.end()
    return true
  } catch {
    return false
  }
}

export async function startMySqlServer(): Promise<'mysql' | 'sqlite'> {
  if (engineMode) return engineMode

  if (process.env.KHODRA_DB === 'sqlite') {
    engineMode = 'sqlite'
    console.log('[DB] وضع SQLite مفروض عبر KHODRA_DB')
    return 'sqlite'
  }

  fs.mkdirSync(getDataDirectory(), { recursive: true })
  console.log('[MySQL] محاولة تشغيل خادم MySQL المحلي...')

  try {
    await tryPortableMariaDb()
    engineMode = 'mysql'
    return 'mysql'
  } catch (err) {
    console.warn('[MySQL] MariaDB portable غير متاح:', (err as Error).message?.slice(0, 140))
  }

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
