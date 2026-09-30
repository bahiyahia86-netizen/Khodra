import type { RowDataPacket } from 'mysql2'
import { query, runTransaction } from '../db/pool'
import { requireUser } from './auth.service'
import { logAudit } from './audit.service'
import type { ApiResult, WastageDTO, WastageReason } from './types'
import { roundMoney, roundQty, toNum } from './types'

function mapWastage(w: RowDataPacket): WastageDTO {
  return {
    id: Number(w.id),
    productId: Number(w.productId),
    productName: String(w.productName),
    quantity: toNum(w.quantity),
    unit: w.unit as WastageDTO['unit'],
    unitCost: toNum(w.unitCost),
    totalCost: toNum(w.totalCost),
    reason: w.reason as WastageReason,
    notes: (w.notes as string | null) ?? null,
    userId: Number(w.userId),
    createdAt: new Date(w.createdAt as string | Date).toISOString(),
  }
}

const SELECT = `
  SELECT id, product_id AS productId, product_name AS productName, quantity, unit,
         unit_cost AS unitCost, total_cost AS totalCost, reason, notes,
         user_id AS userId, created_at AS createdAt
  FROM wastage`

export async function createWastage(input: {
  productId: number
  quantity: number
  reason: WastageReason
  notes?: string
}): Promise<ApiResult<WastageDTO>> {
  try {
    const user = requireUser()
    if (!input.productId || !(Number(input.quantity) > 0)) {
      return { ok: false, error: 'بيانات غير صالحة' }
    }
    if (!['DAMAGED', 'ROTTEN', 'TRANSPORT', 'OTHER'].includes(input.reason)) {
      return { ok: false, error: 'سبب غير صالح' }
    }

    const id = await runTransaction(async (tx) => {
      const products = await tx.query<RowDataPacket>(
        `SELECT id, name, unit, purchase_price AS purchasePrice, stock_qty AS stockQty
         FROM products WHERE id = ?`,
        [input.productId],
      )
      const product = products[0]
      if (!product) throw new Error('المنتج غير موجود')

      const qty = roundQty(input.quantity)
      const stock = toNum(product.stockQty)
      if (qty > stock) throw new Error(`المخزون غير كافٍ (المتاح: ${stock})`)

      const unitCost = toNum(product.purchasePrice)
      const totalCost = roundMoney(qty * unitCost)

      const result = await tx.execute(
        `INSERT INTO wastage (product_id, product_name, quantity, unit, unit_cost, total_cost, reason, notes, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id,
          product.name,
          qty,
          product.unit,
          unitCost,
          totalCost,
          input.reason,
          input.notes?.trim() || null,
          user.id,
        ],
      )
      await tx.execute(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?`, [
        qty,
        product.id,
      ])
      return result.insertId
    })

    const rows = await query<RowDataPacket[]>(`${SELECT} WHERE id = ?`, [id])
    const wastage = mapWastage(rows[0])
    await logAudit(
      user,
      'تسجيل هالك',
      'wastage',
      wastage.id,
      `${wastage.productName} - ${wastage.quantity}`,
    )
    return { ok: true, data: wastage }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function listWastage(opts?: {
  from?: string
  to?: string
  limit?: number
}): Promise<ApiResult<WastageDTO[]>> {
  try {
    const where: string[] = []
    const params: unknown[] = []
    if (opts?.from) {
      where.push('created_at >= ?')
      params.push(opts.from)
    }
    if (opts?.to) {
      where.push('created_at <= ?')
      params.push(opts.to + ' 23:59:59')
    }
    params.push(opts?.limit ?? 100)
    const rows = await query<RowDataPacket[]>(
      `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT ?`,
      params,
    )
    return { ok: true, data: rows.map(mapWastage) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}
