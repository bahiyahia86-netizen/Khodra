import type { RowDataPacket } from 'mysql2'
import { execute, query, runTransaction } from '../db/pool'
import { requireUser } from './auth.service'
import { logAudit } from './audit.service'
import type { ApiResult, PaymentMethod } from './types'
import { roundMoney, toNum } from './types'

export type CustomerStatus = 'ACTIVE' | 'INACTIVE'

export interface CustomerDTO {
  id: number
  name: string
  phone: string | null
  nationalId: string | null
  address: string | null
  notes: string | null
  status: CustomerStatus
  createdAt: string
  updatedAt: string
  salesCount: number
  totalPurchases: number
  totalPaid: number
  balance: number
  lastSaleAt: string | null
}

export interface CustomerSaleRow {
  id: number
  invoiceNumber: string
  totalAmount: number
  amountPaid: number
  balanceDue: number
  paymentMethod: PaymentMethod
  createdAt: string
}

export interface CustomerPaymentRow {
  id: number
  amount: number
  paymentMethod: PaymentMethod
  notes: string | null
  saleId: number | null
  createdAt: string
}

export interface CustomerDetail extends CustomerDTO {
  sales: CustomerSaleRow[]
  payments: CustomerPaymentRow[]
}

export interface CustomerInput {
  name: string
  phone?: string | null
  nationalId?: string | null
  address?: string | null
  notes?: string | null
  status?: CustomerStatus
}

function mapBase(r: RowDataPacket): Omit<
  CustomerDTO,
  'salesCount' | 'totalPurchases' | 'totalPaid' | 'balance' | 'lastSaleAt'
> {
  return {
    id: Number(r.id),
    name: String(r.name),
    phone: (r.phone as string | null) ?? null,
    nationalId: (r.nationalId as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    status: (r.status as CustomerStatus) || 'ACTIVE',
    createdAt: new Date(r.createdAt as string | Date).toISOString(),
    updatedAt: new Date(r.updatedAt as string | Date).toISOString(),
  }
}

const SELECT_BASE = `
  SELECT id, name, phone, national_id AS nationalId, address, notes, status,
         created_at AS createdAt, updated_at AS updatedAt
  FROM customers`

async function computeStats(customerId: number): Promise<{
  salesCount: number
  totalPurchases: number
  totalPaidOnSales: number
  balanceFromSales: number
  paymentsTotal: number
  lastSaleAt: string | null
}> {
  const [salesAgg] = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS salesCount,
            COALESCE(SUM(total_amount), 0) AS totalPurchases,
            COALESCE(SUM(amount_paid), 0) AS totalPaidOnSales,
            COALESCE(SUM(balance_due), 0) AS balanceFromSales,
            MAX(created_at) AS lastSaleAt
     FROM sales WHERE customer_id = ?`,
    [customerId],
  )
  const [payAgg] = await query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) AS paymentsTotal
     FROM customer_payments WHERE customer_id = ?`,
    [customerId],
  )

  return {
    salesCount: Number(salesAgg?.salesCount || 0),
    totalPurchases: toNum(salesAgg?.totalPurchases),
    totalPaidOnSales: toNum(salesAgg?.totalPaidOnSales),
    balanceFromSales: toNum(salesAgg?.balanceFromSales),
    paymentsTotal: toNum(payAgg?.paymentsTotal),
    lastSaleAt: salesAgg?.lastSaleAt
      ? new Date(salesAgg.lastSaleAt as string | Date).toISOString()
      : null,
  }
}

function withStats(
  base: ReturnType<typeof mapBase>,
  stats: Awaited<ReturnType<typeof computeStats>>,
): CustomerDTO {
  // balance_due on sales is kept up-to-date when settling (payCustomerBalance
  // also bumps amount_paid). So:
  //   balance   = SUM(balance_due)
  //   totalPaid = SUM(amount_paid)  — already includes later settlements
  // Do NOT add customer_payments again (would double-count).
  const balance = roundMoney(stats.balanceFromSales)
  const totalPaid = roundMoney(stats.totalPaidOnSales)
  return {
    ...base,
    salesCount: stats.salesCount,
    totalPurchases: roundMoney(stats.totalPurchases),
    totalPaid,
    balance,
    lastSaleAt: stats.lastSaleAt,
  }
}

export async function listCustomers(opts?: {
  search?: string
  status?: CustomerStatus | 'ALL'
  activeOnly?: boolean
}): Promise<ApiResult<CustomerDTO[]>> {
  try {
    const where: string[] = []
    const params: unknown[] = []

    if (opts?.activeOnly || opts?.status === 'ACTIVE') {
      where.push(`status = 'ACTIVE'`)
    } else if (opts?.status && opts.status !== 'ALL') {
      where.push(`status = ?`)
      params.push(opts.status)
    }

    if (opts?.search?.trim()) {
      const q = `%${opts.search.trim()}%`
      where.push(
        `(name LIKE ? OR COALESCE(phone,'') LIKE ? OR COALESCE(national_id,'') LIKE ? OR COALESCE(notes,'') LIKE ?)`,
      )
      params.push(q, q, q, q)
    }

    // SQLite doesn't have IFNULL the same... actually it does. Good.
    const sql = `${SELECT_BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name ASC`
    const rows = await query<RowDataPacket[]>(sql, params)

    const result: CustomerDTO[] = []
    for (const r of rows) {
      const base = mapBase(r)
      const stats = await computeStats(base.id)
      result.push(withStats(base, stats))
    }
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function getCustomer(id: number): Promise<ApiResult<CustomerDetail>> {
  try {
    const rows = await query<RowDataPacket[]>(`${SELECT_BASE} WHERE id = ?`, [id])
    if (!rows[0]) return { ok: false, error: 'الزبون غير موجود' }
    const base = mapBase(rows[0])
    const stats = await computeStats(id)

    const sales = await query<RowDataPacket[]>(
      `SELECT id, invoice_number AS invoiceNumber, total_amount AS totalAmount,
              amount_paid AS amountPaid, balance_due AS balanceDue,
              payment_method AS paymentMethod, created_at AS createdAt
       FROM sales WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100`,
      [id],
    )
    const payments = await query<RowDataPacket[]>(
      `SELECT id, amount, payment_method AS paymentMethod, notes, sale_id AS saleId,
              created_at AS createdAt
       FROM customer_payments WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100`,
      [id],
    )

    return {
      ok: true,
      data: {
        ...withStats(base, stats),
        sales: sales.map((s) => ({
          id: Number(s.id),
          invoiceNumber: String(s.invoiceNumber),
          totalAmount: toNum(s.totalAmount),
          amountPaid: toNum(s.amountPaid),
          balanceDue: toNum(s.balanceDue),
          paymentMethod: s.paymentMethod as PaymentMethod,
          createdAt: new Date(s.createdAt as string | Date).toISOString(),
        })),
        payments: payments.map((p) => ({
          id: Number(p.id),
          amount: toNum(p.amount),
          paymentMethod: p.paymentMethod as PaymentMethod,
          notes: (p.notes as string | null) ?? null,
          saleId: p.saleId != null ? Number(p.saleId) : null,
          createdAt: new Date(p.createdAt as string | Date).toISOString(),
        })),
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function createCustomer(input: CustomerInput): Promise<ApiResult<CustomerDTO>> {
  try {
    const user = requireUser()
    if (!input.name?.trim()) return { ok: false, error: 'الاسم الكامل مطلوب' }

    const result = await execute(
      `INSERT INTO customers (name, phone, national_id, address, notes, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.name.trim(),
        input.phone?.trim() || null,
        input.nationalId?.trim() || null,
        input.address?.trim() || null,
        input.notes?.trim() || null,
        input.status || 'ACTIVE',
      ],
    )
    await logAudit(user, 'إضافة زبون', 'customer', result.insertId, input.name.trim())
    const detail = await getCustomer(result.insertId)
    if (!detail.ok || !detail.data) return { ok: false, error: detail.error || 'تعذر التحميل' }
    const { sales: _s, payments: _p, ...dto } = detail.data
    return { ok: true, data: dto }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function updateCustomer(
  id: number,
  input: Partial<CustomerInput>,
): Promise<ApiResult<CustomerDTO>> {
  try {
    const user = requireUser()
    const existing = await getCustomer(id)
    if (!existing.ok || !existing.data) return { ok: false, error: 'الزبون غير موجود' }

    const name = (input.name ?? existing.data.name).trim()
    if (!name) return { ok: false, error: 'الاسم الكامل مطلوب' }

    await execute(
      `UPDATE customers SET name=?, phone=?, national_id=?, address=?, notes=?, status=? WHERE id=?`,
      [
        name,
        input.phone !== undefined ? input.phone?.trim() || null : existing.data.phone,
        input.nationalId !== undefined
          ? input.nationalId?.trim() || null
          : existing.data.nationalId,
        input.address !== undefined ? input.address?.trim() || null : existing.data.address,
        input.notes !== undefined ? input.notes?.trim() || null : existing.data.notes,
        input.status ?? existing.data.status,
        id,
      ],
    )
    await logAudit(user, 'تعديل زبون', 'customer', id, name)
    const detail = await getCustomer(id)
    if (!detail.ok || !detail.data) return { ok: false, error: detail.error || 'تعذر التحميل' }
    const { sales: _s, payments: _p, ...dto } = detail.data
    return { ok: true, data: dto }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function deleteCustomer(id: number): Promise<ApiResult<{ deactivated?: boolean }>> {
  try {
    const user = requireUser()
    const existing = await getCustomer(id)
    if (!existing.ok || !existing.data) return { ok: false, error: 'الزبون غير موجود' }

    const [cnt] = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM sales WHERE customer_id = ?`,
      [id],
    )
    if (Number(cnt.c) > 0) {
      await execute(`UPDATE customers SET status='INACTIVE' WHERE id=?`, [id])
      await logAudit(user, 'تعطيل زبون', 'customer', id, existing.data.name)
      return {
        ok: true,
        data: { deactivated: true },
      }
    }

    await execute(`DELETE FROM customers WHERE id = ?`, [id])
    await logAudit(user, 'حذف زبون', 'customer', id, existing.data.name)
    return { ok: true, data: { deactivated: false } }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

/**
 * Apply a payment against a customer's outstanding balances (oldest first).
 */
export async function payCustomerBalance(input: {
  customerId: number
  amount: number
  paymentMethod: PaymentMethod
  notes?: string
}): Promise<ApiResult<CustomerDetail>> {
  try {
    const user = requireUser()
    if (!input.customerId) return { ok: false, error: 'الزبون مطلوب' }
    if (!['CASH', 'CARD'].includes(input.paymentMethod)) {
      return { ok: false, error: 'طريقة الدفع غير صالحة' }
    }
    const amount = roundMoney(input.amount)
    if (!(amount > 0)) return { ok: false, error: 'المبلغ غير صالح' }

    const existing = await getCustomer(input.customerId)
    if (!existing.ok || !existing.data) return { ok: false, error: 'الزبون غير موجود' }

    if (amount > existing.data.balance + 0.001) {
      return { ok: false, error: 'مبلغ التسديد أكبر من الرصيد المستحق.' }
    }

    await runTransaction(async (tx) => {
      let remaining = amount
      const openSales = await tx.query<RowDataPacket>(
        `SELECT id, balance_due AS balanceDue FROM sales
         WHERE customer_id = ? AND balance_due > 0
         ORDER BY created_at ASC, id ASC`,
        [input.customerId],
      )

      for (const sale of openSales) {
        if (remaining <= 0) break
        const due = toNum(sale.balanceDue)
        if (due <= 0) continue
        const apply = roundMoney(Math.min(due, remaining))
        await tx.execute(
          `UPDATE sales SET balance_due = balance_due - ?, amount_paid = amount_paid + ? WHERE id = ?`,
          [apply, apply, sale.id],
        )
        remaining = roundMoney(remaining - apply)
      }

      if (remaining > 0.001) {
        throw new Error('مبلغ التسديد أكبر من الرصيد المستحق.')
      }

      await tx.execute(
        `INSERT INTO customer_payments (customer_id, sale_id, amount, payment_method, notes, user_id)
         VALUES (?, NULL, ?, ?, ?, ?)`,
        [
          input.customerId,
          amount,
          input.paymentMethod,
          input.notes?.trim() || null,
          user.id,
        ],
      )
    })

    await logAudit(
      user,
      'تسديد رصيد زبون',
      'customer',
      input.customerId,
      `${amount} دج`,
    )
    return getCustomer(input.customerId)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}
