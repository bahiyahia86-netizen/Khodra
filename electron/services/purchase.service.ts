import type { RowDataPacket } from 'mysql2'
import { query, runTransaction } from '../db/pool'
import { requireUser } from './auth.service'
import { logAudit } from './audit.service'
import type { ApiResult, PurchaseDTO, PurchaseItemInput } from './types'
import { roundMoney, roundQty, toNum } from './types'

function mapPurchase(p: RowDataPacket, items: RowDataPacket[]): PurchaseDTO {
  return {
    id: Number(p.id),
    supplierName: (p.supplierName as string | null) ?? null,
    totalAmount: toNum(p.totalAmount),
    userId: Number(p.userId),
    notes: (p.notes as string | null) ?? null,
    createdAt: new Date(p.createdAt as string | Date).toISOString(),
    items: items.map((i) => ({
      id: Number(i.id),
      productId: Number(i.productId),
      productName: String(i.productName),
      unit: i.unit as PurchaseDTO['items'][0]['unit'],
      quantity: toNum(i.quantity),
      unitCost: toNum(i.unitCost),
      lineTotal: toNum(i.lineTotal),
    })),
  }
}

async function loadPurchase(id: number): Promise<PurchaseDTO | null> {
  const rows = await query<RowDataPacket[]>(
    `SELECT id, supplier_name AS supplierName, total_amount AS totalAmount,
            user_id AS userId, notes, created_at AS createdAt
     FROM purchases WHERE id = ?`,
    [id],
  )
  if (!rows[0]) return null
  const items = await query<RowDataPacket[]>(
    `SELECT id, product_id AS productId, product_name AS productName, unit,
            quantity, unit_cost AS unitCost, line_total AS lineTotal
     FROM purchase_items WHERE purchase_id = ?`,
    [id],
  )
  return mapPurchase(rows[0], items)
}

export async function createPurchase(input: {
  supplierName?: string
  notes?: string
  items: PurchaseItemInput[]
}): Promise<ApiResult<PurchaseDTO>> {
  try {
    const user = requireUser()
    if (!input.items?.length) return { ok: false, error: 'أضف منتجاً واحداً على الأقل' }
    for (const item of input.items) {
      // !(x > 0) يرفض أيضًا NaN/undefined
      if (!item.productId || !(Number(item.quantity) > 0)) {
        return { ok: false, error: 'كمية غير صالحة' }
      }
      if (!Number.isFinite(Number(item.unitCost)) || Number(item.unitCost) < 0) {
        return { ok: false, error: 'تكلفة غير صالحة' }
      }
    }

    const purchaseId = await runTransaction(async (tx) => {
      const productIds = input.items.map((i) => i.productId)
      const placeholders = productIds.map(() => '?').join(',')
      const products = await tx.query<RowDataPacket>(
        `SELECT id, name, unit FROM products WHERE id IN (${placeholders})`,
        productIds,
      )
      const productMap = new Map(products.map((p) => [Number(p.id), p]))

      const lines: {
        productId: number
        productName: string
        unit: string
        quantity: number
        unitCost: number
        lineTotal: number
      }[] = []
      let total = 0

      for (const item of input.items) {
        const product = productMap.get(item.productId)
        if (!product) throw new Error(`المنتج #${item.productId} غير موجود`)
        const qty = roundQty(item.quantity)
        const unitCost = roundMoney(item.unitCost)
        const lineTotal = roundMoney(qty * unitCost)
        total = roundMoney(total + lineTotal)
        lines.push({
          productId: Number(product.id),
          productName: String(product.name),
          unit: String(product.unit),
          quantity: qty,
          unitCost,
          lineTotal,
        })
      }

      const result = await tx.execute(
        `INSERT INTO purchases (supplier_name, total_amount, user_id, notes) VALUES (?, ?, ?, ?)`,
        [input.supplierName?.trim() || null, total, user.id, input.notes?.trim() || null],
      )
      const insertId = result.insertId

      for (const line of lines) {
        await tx.execute(
          `INSERT INTO purchase_items (purchase_id, product_id, product_name, unit, quantity, unit_cost, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            insertId,
            line.productId,
            line.productName,
            line.unit,
            line.quantity,
            line.unitCost,
            line.lineTotal,
          ],
        )
        await tx.execute(
          `UPDATE products SET stock_qty = stock_qty + ?, purchase_price = ? WHERE id = ?`,
          [line.quantity, line.unitCost, line.productId],
        )
      }
      return insertId
    })

    const purchase = await loadPurchase(purchaseId)
    if (!purchase) return { ok: false, error: 'تعذر تحميل المشتريات' }
    await logAudit(user, 'إضافة مشتريات', 'purchase', purchase.id, `${purchase.totalAmount} دج`)
    return { ok: true, data: purchase }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function listPurchases(opts?: {
  from?: string
  to?: string
  limit?: number
}): Promise<ApiResult<PurchaseDTO[]>> {
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
      `SELECT id, supplier_name AS supplierName, total_amount AS totalAmount,
              user_id AS userId, notes, created_at AS createdAt
       FROM purchases ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT ?`,
      params,
    )
    const result: PurchaseDTO[] = []
    for (const p of rows) {
      const items = await query<RowDataPacket[]>(
        `SELECT id, product_id AS productId, product_name AS productName, unit,
                quantity, unit_cost AS unitCost, line_total AS lineTotal
         FROM purchase_items WHERE purchase_id = ?`,
        [p.id],
      )
      result.push(mapPurchase(p, items))
    }
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}
