import type { RowDataPacket } from 'mysql2'
import { execute, query } from '../db/pool'
import { requireUser } from './auth.service'
import { logAudit } from './audit.service'
import type { ApiResult, ExpenseDTO } from './types'
import { roundMoney, toNum } from './types'

function mapExpense(e: RowDataPacket): ExpenseDTO {
  const d = e.expenseDate as Date | string
  const expenseDate =
    typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)
  return {
    id: Number(e.id),
    description: String(e.description),
    amount: toNum(e.amount),
    category: String(e.category),
    expenseDate,
    notes: (e.notes as string | null) ?? null,
    userId: Number(e.userId),
    createdAt: new Date(e.createdAt as Date).toISOString(),
  }
}

const SELECT = `
  SELECT id, description, amount, category, expense_date AS expenseDate, notes,
         user_id AS userId, created_at AS createdAt
  FROM expenses`

export async function createExpense(input: {
  description: string
  amount: number
  category: string
  expenseDate?: string
  notes?: string
}): Promise<ApiResult<ExpenseDTO>> {
  try {
    const user = requireUser()
    if (!input.description?.trim()) return { ok: false, error: 'الوصف مطلوب' }
    if (input.amount <= 0) return { ok: false, error: 'المبلغ غير صالح' }
    if (!input.category?.trim()) return { ok: false, error: 'التصنيف مطلوب' }

    const date = input.expenseDate || new Date().toISOString().slice(0, 10)
    const result = await execute(
      `INSERT INTO expenses (description, amount, category, expense_date, notes, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.description.trim(),
        roundMoney(input.amount),
        input.category.trim(),
        date,
        input.notes?.trim() || null,
        user.id,
      ],
    )
    const rows = await query<RowDataPacket[]>(`${SELECT} WHERE id = ?`, [result.insertId])
    const expense = mapExpense(rows[0])
    await logAudit(
      user,
      'إضافة مصروف',
      'expense',
      expense.id,
      `${expense.description} - ${expense.amount} دج`,
    )
    return { ok: true, data: expense }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function listExpenses(opts?: {
  from?: string
  to?: string
  limit?: number
}): Promise<ApiResult<ExpenseDTO[]>> {
  try {
    const where: string[] = []
    const params: unknown[] = []
    if (opts?.from) {
      where.push('expense_date >= ?')
      params.push(opts.from)
    }
    if (opts?.to) {
      where.push('expense_date <= ?')
      params.push(opts.to)
    }
    params.push(opts?.limit ?? 100)
    const rows = await query<RowDataPacket[]>(
      `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY expense_date DESC, id DESC LIMIT ?`,
      params,
    )
    return { ok: true, data: rows.map(mapExpense) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function deleteExpense(id: number): Promise<ApiResult> {
  try {
    const user = requireUser()
    const rows = await query<RowDataPacket[]>(`${SELECT} WHERE id = ?`, [id])
    if (!rows[0]) return { ok: false, error: 'المصروف غير موجود' }
    await execute(`DELETE FROM expenses WHERE id = ?`, [id])
    await logAudit(user, 'حذف مصروف', 'expense', id, String(rows[0].description))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export const EXPENSE_CATEGORIES = [
  'نقل',
  'أكياس',
  'كهرباء',
  'إيجار',
  'صيانة',
  'رواتب',
  'أخرى',
]
