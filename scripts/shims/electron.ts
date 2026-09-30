import path from 'node:path'

export const app = {
  getPath: (name: string) => {
    if (name === 'userData') {
      return process.env.KHODRA_TEST_USER_DATA || path.join(process.cwd(), 'data', 'userData')
    }
    return path.join(process.cwd(), 'data')
  },
  getAppPath: () => process.cwd(),
  whenReady: () => Promise.resolve(),
  on: () => undefined,
  quit: () => undefined,
}

export const dialog = {
  showSaveDialog: async () => ({ canceled: true as const, filePath: undefined }),
  showOpenDialog: async () => ({ canceled: true as const, filePaths: [] as string[] }),
  showMessageBox: async () => ({ response: 0 }),
}

export class BrowserWindow {
  webContents = {
    print: (_o: unknown, cb: (ok: boolean, reason?: string) => void) => cb(true),
    send: () => undefined,
    setWindowOpenHandler: () => undefined,
  }
  once = () => undefined
  on = () => undefined
  loadURL = async () => undefined
  loadFile = async () => undefined
  show = () => undefined
  focus = () => undefined
  close = () => undefined
  static getAllWindows = () => []
}

export const ipcMain = { handle: () => undefined }
export const globalShortcut = { register: () => true, unregisterAll: () => undefined }
export const shell = { openExternal: async () => undefined }
export const contextBridge = { exposeInMainWorld: () => undefined }
export const ipcRenderer = {
  invoke: async () => undefined,
  on: () => undefined,
  removeListener: () => undefined,
}

export default {
  app,
  dialog,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  shell,
  contextBridge,
  ipcRenderer,
}
