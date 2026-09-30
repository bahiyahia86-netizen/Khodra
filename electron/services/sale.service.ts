import type { RowDataPacket } from 'mysql2'
import { query, runTransaction } from '../db/pool'
import { requireUser } from './auth.service'
import { logAudit } from './audit.service'
import type {
  ApiResult,
  CartItemInput,
  PaymentMethod,
  SaleDTO,
  SaleItemDTO,
} from './types'
import { roundMoney, roundQty, toNum } from './types'

function mapSale(s: RowDataPacket, items: RowDataPacket[]): SaleDTO {
  const total = toNum(s.totalAmount)
  const amountPaid =
    s.amountPaid != null ? toNum(s.amountPaid) : total
  const balanceDue =
    s.balanceDue != null ? toNum(s.balanceDue) : roundMoney(total - amountPaid)
  return {
    id: Number(s.id),
    invoiceNumber: String(s.invoiceNumber),
    totalAmount: total,
    amountPaid,
    balanceDue,
    paymentMethod: s.paymentMethod as PaymentMethod,
    customerId: s.customerId != null ? Number(s.customerId) : null,
    customerName: s.customerName ? String(s.customerName) : null,
    userId: Number(s.userId),
    userName: s.userName ? String(s.userName) : undefined,
    notes: (s.notes as string | null) ?? null,
    createdAt: new Date(s.createdAt as string | Date).toISOString(),
    items: items.map((i) => ({
      id: Number(i.id),
      productId: Number(i.productId),
      productName: String(i.productName),
      unit: i.unit as SaleItemDTO['unit'],
      quantity: toNum(i.quantity),
      unitPrice: toNum(i.unitPrice),
      lineTotal: toNum(i.lineTotal),
    })),
  }
}

async function loadSale(id: number): Promise<SaleDTO | null> {
  const sales = await query<RowDataPacket[]>(
    `SELECT s.id, s.invoice_number AS invoiceNumber, s.total_amount AS totalAmount,
            s.amount_paid AS amountPaid, s.balance_due AS balanceDue,
            s.payment_method AS paymentMethod, s.customer_id AS customerId,
            s.user_id AS userId, s.notes, s.created_at AS createdAt,
            u.full_name AS userName, c.name AS customerName
     FROM sales s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.id = ?`,
    [id],
  )
  if (!sales[0]) return null
  const items = await query<RowDataPacket[]>(
    `SELECT id, product_id AS productId, product_name AS productName, unit,
            quantity, unit_price AS unitPrice, line_total AS lineTotal
     FROM sale_items WHERE sale_id = ?`,
    [id],
  )
  return mapSale(sales[0], items)
}

export async function completeSale(input: {
  items: CartItemInput[]
  paymentMethod: PaymentMethod
  notes?: string
  customerId?: number | null
  amountPaid?: number
}): Promise<ApiResult<SaleDTO>> {
  try {
    const user = requireUser()
    if (!input.items?.length) return { ok: false, error: 'السلة فارغة' }
    if (!['CASH', 'CARD'].includes(input.paymentMethod)) {
      return { ok: false, error: 'طريقة الدفع غير صالحة' }
    }
    for (const item of input.items) {
      // !(x > 0) يرفض أيضًا القيم غير الرقمية (NaN/undefined) لا الصفر والسالب فقط
      if (!item.productId || !(Number(item.quantity) > 0)) {
        return { ok: false, error: 'كمية غير صالحة' }
      }
    }
    if (input.amountPaid != null && !Number.isFinite(Number(input.amountPaid))) {
      return { ok: false, error: 'المبلغ المدفوع غير صالح' }
    }

    const customerId = input.customerId && input.customerId > 0 ? input.customerId : null
    if (customerId) {
      const cust = await query<RowDataPacket[]>(
        `SELECT id, status FROM customers WHERE id = ?`,
        [customerId],
      )
      if (!cust[0]) return { ok: false, error: 'الزبون غير موجود' }
      if (String(cust[0].status) !== 'ACTIVE') {
        return { ok: false, error: 'الزبون غير نشط' }
      }
    }

    const saleId = await runTransaction(async (tx) => {
      const productIds = input.items.map((i) => i.productId)
      const placeholders = productIds.map(() => '?').join(',')
      const products = await tx.query<RowDataPacket>(
        `SELECT id, name, unit, sale_price AS salePrice, stock_qty AS stockQty, status
         FROM products WHERE id IN (${placeholders})`,
        productIds,
      )
      const productMap = new Map(products.map((p) => [Number(p.id), p]))

      const lines: {
        productId: number
        productName: string
        unit: string
        quantity: number
        unitPrice: number
        lineTotal: number
      }[] = []
      let total = 0

      for (const item of input.items) {
        const product = productMap.get(item.productId)
        if (!product || product.status !== 'ACTIVE') {
          throw new Error(`المنتج #${item.productId} غير موجود أو غير نشط`)
        }
        const qty = roundQty(item.quantity)
        const stock = toNum(product.stockQty)
        if (qty > stock) {
          throw new Error(`المخزون غير كافٍ للمنتج: ${product.name} (المتاح: ${stock})`)
        }
        const unitPrice = toNum(product.salePrice)
        const lineTotal = roundMoney(qty * unitPrice)
        total = roundMoney(total + lineTotal)
        lines.push({
          productId: Number(product.id),
          productName: String(product.name),
          unit: String(product.unit),
          quantity: qty,
          unitPrice,
          lineTotal,
        })
      }

      // amount paid / balance
      let amountPaid =
        input.amountPaid != null ? roundMoney(input.amountPaid) : total
      if (amountPaid < 0) throw new Error('المبلغ المدفوع غير صالح')
      if (amountPaid > total + 0.001) {
        throw new Error('المبلغ المدفوع أكبر من إجمالي الفاتورة')
      }
      // Walk-in cash customer must pay in full
      if (!customerId) {
        amountPaid = total
      }
      const balanceDue = roundMoney(total - amountPaid)
      if (balanceDue > 0 && !customerId) {
        throw new Error('لا يمكن تسجيل متبقي بدون اختيار زبون')
      }

      const today = new Date()
      const prefix = `INV${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      const lastRows = await tx.query<RowDataPacket>(
        `SELECT invoice_number AS invoiceNumber FROM sales
         WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1`,
        [`${prefix}%`],
      )
      let seq = 1
      if (lastRows[0]) {
        const part = String(lastRows[0].invoiceNumber).slice(prefix.length)
        seq = (parseInt(part, 10) || 0) + 1
      }
      const invoiceNumber = `${prefix}${String(seq).padStart(4, '0')}`

      const saleResult = await tx.execute(
        `INSERT INTO sales (invoice_number, total_amount, amount_paid, balance_due, payment_method, customer_id, user_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNumber,
          total,
          amountPaid,
          balanceDue,
          input.paymentMethod,
          customerId,
          user.id,
          input.notes?.trim() || null,
        ],
      )
      const insertId = saleResult.insertId

      for (const line of lines) {
        await tx.execute(
          `INSERT INTO sale_items (sale_id, product_id, product_name, unit, quantity, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            insertId,
            line.productId,
            line.productName,
            line.unit,
            line.quantity,
            line.unitPrice,
            line.lineTotal,
          ],
        )
        await tx.execute(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?`, [
          line.quantity,
          line.productId,
        ])
      }

      return insertId
    })

    const sale = await loadSale(saleId)
    if (!sale) return { ok: false, error: 'تعذر تحميل الفاتورة' }
    await logAudit(
      user,
      'إتمام بيع',
      'sale',
      sale.id,
      `${sale.invoiceNumber} - ${sale.totalAmount} دج` +
        (sale.balanceDue > 0 ? ` (متبقي ${sale.balanceDue})` : ''),
    )
    return { ok: true, data: sale }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ في إتمام البيع' }
  }
}

export async function listSales(opts?: {
  from?: string
  to?: string
  limit?: number
  customerId?: number
}): Promise<ApiResult<SaleDTO[]>> {
  try {
    const where: string[] = []
    const params: unknown[] = []
    if (opts?.from) {
      where.push('s.created_at >= ?')
      params.push(opts.from)
    }
    if (opts?.to) {
      where.push('s.created_at <= ?')
      params.push(opts.to + ' 23:59:59')
    }
    if (opts?.customerId) {
      where.push('s.customer_id = ?')
      params.push(opts.customerId)
    }
    params.push(opts?.limit ?? 200)
    const sales = await query<RowDataPacket[]>(
      `SELECT s.id, s.invoice_number AS invoiceNumber, s.total_amount AS totalAmount,
              s.amount_paid AS amountPaid, s.balance_due AS balanceDue,
              s.payment_method AS paymentMethod, s.customer_id AS customerId,
              s.user_id AS userId, s.notes, s.created_at AS createdAt,
              u.full_name AS userName, c.name AS customerName
       FROM sales s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = s.customer_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY s.created_at DESC LIMIT ?`,
      params,
    )

    const result: SaleDTO[] = []
    for (const s of sales) {
      const items = await query<RowDataPacket[]>(
        `SELECT id, product_id AS productId, product_name AS productName, unit,
                quantity, unit_price AS unitPrice, line_total AS lineTotal
         FROM sale_items WHERE sale_id = ?`,
        [s.id],
      )
      result.push(mapSale(s, items))
    }
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function getSale(id: number): Promise<ApiResult<SaleDTO>> {
  try {
    const sale = await loadSale(id)
    if (!sale) return { ok: false, error: 'الفاتورة غير موجودة' }
    return { ok: true, data: sale }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}
