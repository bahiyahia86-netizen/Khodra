import { app, BrowserWindow, globalShortcut, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startMySqlServer, stopMySqlServer } from './db/mysql-manager'
import { runMigrations } from './db/migrate'
import { initPrisma, disconnectPrisma } from './db/prisma'
import { registerIpcHandlers } from './ipc'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let isReady = false

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(process.env.APP_ROOT || '', 'public/icons/icon.png'),
    path.join(process.cwd(), 'public/icons/icon.png'),
    path.join(RENDERER_DIST, 'icons/icon.png'),
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  return undefined
}

function createWindow(): void {
  const icon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    title: 'خضرة — إدارة محلك ببساطة',
    backgroundColor: '#f5f7f4',
    show: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function bootstrap(): Promise<void> {
  console.log('[App] بدء التشغيل...')

  try {
    const mode = await startMySqlServer()
    await initPrisma()
    await runMigrations()
    isReady = true
    console.log('[App] قاعدة البيانات جاهزة — المحرك:', mode)
  } catch (err) {
    console.error('[App] فشل تهيئة قاعدة البيانات:', err)
    // Still show window so user sees error
  }

  registerIpcHandlers(getMainWindow)
  createWindow()

  // Global shortcuts (can be customized later via settings)
  globalShortcut.register('F1', () => {
    mainWindow?.webContents.send('shortcut', 'pos')
  })
  globalShortcut.register('F2', () => {
    mainWindow?.webContents.send('shortcut', 'search')
  })
  globalShortcut.register('F3', () => {
    mainWindow?.webContents.send('shortcut', 'products')
  })
  globalShortcut.register('F4', () => {
    mainWindow?.webContents.send('shortcut', 'purchases')
  })
  globalShortcut.register('F5', () => {
    mainWindow?.webContents.send('shortcut', 'refresh')
  })
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(bootstrap)

app.on('window-all-closed', async () => {
  globalShortcut.unregisterAll()
  await disconnectPrisma()
  await stopMySqlServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', async () => {
  globalShortcut.unregisterAll()
  await disconnectPrisma()
  await stopMySqlServer()
})

export { isReady }
