import bcrypt from 'bcryptjs'
import { execute, query } from '../db/pool'
import type { RowDataPacket } from 'mysql2'
import type { ApiResult, SessionUser, UserRole } from './types'
import { logAudit } from './audit.service'

let currentUser: SessionUser | null = null

export function getCurrentUser(): SessionUser | null {
  return currentUser
}

export function requireUser(): SessionUser {
  if (!currentUser) throw new Error('يجب تسجيل الدخول أولاً')
  return currentUser
}

export async function login(
  username: string,
  password: string,
): Promise<ApiResult<SessionUser>> {
  try {
    const rows = await query<RowDataPacket[]>(
      `SELECT id, username, password_hash AS passwordHash, full_name AS fullName, role, is_active AS isActive
       FROM users WHERE username = ? LIMIT 1`,
      [username.trim()],
    )
    const user = rows[0]
    if (!user || !(user.isActive === true || user.isActive === 1 || user.isActive === '1')) {
      return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }
    }
    const valid = await bcrypt.compare(password, String(user.passwordHash))
    if (!valid) {
      return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }
    }
    currentUser = {
      id: Number(user.id),
      username: String(user.username),
      fullName: String(user.fullName),
      role: user.role as UserRole,
    }
    await logAudit(currentUser, 'تسجيل الدخول', 'user', currentUser.id)
    return { ok: true, data: currentUser }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ في تسجيل الدخول' }
  }
}

export async function logout(): Promise<ApiResult> {
  if (currentUser) {
    await logAudit(currentUser, 'تسجيل الخروج', 'user', currentUser.id)
  }
  currentUser = null
  return { ok: true }
}

export async function getSession(): Promise<ApiResult<SessionUser | null>> {
  return { ok: true, data: currentUser }
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<ApiResult> {
  try {
    const user = requireUser()
    if (newPassword.length < 4) {
      return { ok: false, error: 'كلمة المرور الجديدة قصيرة جداً' }
    }
    const rows = await query<RowDataPacket[]>(
      `SELECT password_hash AS passwordHash FROM users WHERE id = ?`,
      [user.id],
    )
    if (!rows[0]) return { ok: false, error: 'المستخدم غير موجود' }
    const valid = await bcrypt.compare(oldPassword, String(rows[0].passwordHash))
    if (!valid) return { ok: false, error: 'كلمة المرور الحالية غير صحيحة' }
    const hash = await bcrypt.hash(newPassword, 10)
    await execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, user.id])
    await logAudit(user, 'تغيير كلمة المرور', 'user', user.id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}
