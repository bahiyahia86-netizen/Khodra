import type { RowDataPacket } from 'mysql2'
import path from 'node:path'
import { dialog, BrowserWindow } from 'electron'
import { execute, query } from '../db/pool'
import { requireUser } from './auth.service'
import { logAudit } from './audit.service'
import type { ApiResult } from './types'
import { dumpDatabase, restoreDatabase } from '../db/migrate'
import { getBackupsDirectory } from '../db/mysql-manager'

export async function getSettings(): Promise<ApiResult<Record<string, string>>> {
  try {
    const rows = await query<RowDataPacket[]>(`SELECT \`key\`, value FROM settings`)
    const map: Record<string, string> = {}
    for (const r of rows) map[String(r.key)] = String(r.value)
    return { ok: true, data: map }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function updateSettings(
  updates: Record<string, string>,
): Promise<ApiResult<Record<string, string>>> {
  try {
    const user = requireUser()
    for (const [key, value] of Object.entries(updates)) {
      const { getEngineKind } = await import('../db/pool')
      if (getEngineKind() === 'sqlite') {
        await execute(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, value],
        )
      } else {
        await execute(
          `INSERT INTO settings (\`key\`, value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value)`,
          [key, value],
        )
      }
    }
    await logAudit(user, 'تحديث الإعدادات', 'settings', undefined, Object.keys(updates).join(', '))
    return getSettings()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function createBackup(
  win: BrowserWindow | null,
): Promise<ApiResult<{ path: string }>> {
  try {
    requireUser()
    const defaultName = `backup_${new Date().toISOString().slice(0, 10)}.sql`
    const defaultPath = path.join(getBackupsDirectory(), defaultName)

    let savePath = defaultPath
    if (win) {
      const result = await dialog.showSaveDialog(win, {
        title: 'حفظ النسخة الاحتياطية',
        defaultPath: defaultPath,
        filters: [{ name: 'SQL Backup', extensions: ['sql'] }],
      })
      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'تم الإلغاء' }
      }
      savePath = result.filePath
    }

    await dumpDatabase(savePath)
    const user = requireUser()
    await logAudit(user, 'إنشاء نسخة احتياطية', 'backup', undefined, savePath)
    return { ok: true, data: { path: savePath } }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ في النسخ الاحتياطي' }
  }
}

export async function restoreBackup(win: BrowserWindow | null): Promise<ApiResult> {
  try {
    requireUser()
    if (!win) return { ok: false, error: 'لا توجد نافذة' }

    const result = await dialog.showOpenDialog(win, {
      title: 'استرجاع نسخة احتياطية',
      defaultPath: getBackupsDirectory(),
      filters: [{ name: 'SQL Backup', extensions: ['sql'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, error: 'تم الإلغاء' }
    }

    const confirm = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['إلغاء', 'استرجاع'],
      defaultId: 0,
      cancelId: 0,
      title: 'تأكيد الاسترجاع',
      message: 'سيتم استبدال جميع البيانات الحالية بالنسخة المحددة. هل أنت متأكد؟',
      detail: result.filePaths[0],
    })
    if (confirm.response !== 1) {
      return { ok: false, error: 'تم الإلغاء' }
    }

    await restoreDatabase(result.filePaths[0])
    const user = requireUser()
    await logAudit(user, 'استرجاع نسخة احتياطية', 'backup', undefined, result.filePaths[0])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ في الاسترجاع' }
  }
}
