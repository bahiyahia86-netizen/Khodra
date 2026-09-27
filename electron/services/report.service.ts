import type { RowDataPacket } from 'mysql2'
import { execute, query } from '../db/pool'
import { requireUser } from './auth.service'
import { logAudit } from './audit.service'
import type {
  ApiResult,
  DailyClosingDTO,
  DaySummary,
  ProductDTO,
  ProductStats,
  SalesReport,
} from './types'
import { roundMoney, toNum } from './types'
import { listProducts } from './product.service'
import { listSales } from './sale.service'

function startOfDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function dateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toSqlDateTime(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
}

function mapClosing(c: RowDataPacket): DailyClosingDTO {
  const cd = c.closingDate as Date | string
  return {
    id: Number(c.id),
    closingDate: typeof cd === 'string' ? cd.slice(0, 10) : new Date(cd).toISOString().slice(0, 10),
    totalSales: toNum(c.totalSales),
    cashSales: toNum(c.cashSales),
    cardSales: toNum(c.cardSales),
    totalPurchases: toNum(c.totalPurchases),
    totalExpenses: toNum(c.totalExpenses),
    totalWastage: toNum(c.totalWastage),
    netAmount: toNum(c.netAmount),
    salesCount: Number(c.salesCount),
    notes: (c.notes as string | null) ?? null,
    userId: Number(c.userId),
    createdAt: new Date(c.createdAt as Date).toISOString(),
  }
}

export async function getDaySummary(dateStr?: string): Promise<ApiResult<DaySummary>> {
  try {
    const day = dateStr ? new Date(dateStr) : new Date()
    const from = startOfDay(day)
    const to = endOfDay(day)
    const dayKey = dateOnly(from)
    // Use ISO strings so both MySQL and SQLite compare correctly
    const fromIso = toSqlDateTime(from)
    const toIso = toSqlDateTime(to)

    const [salesAgg] = await query<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(total_amount),0) AS totalSales,
         COALESCE(SUM(CASE WHEN payment_method='CASH' THEN COALESCE(amount_paid, total_amount) ELSE 0 END),0) AS cashSales,
         COALESCE(SUM(CASE WHEN payment_method='CARD' THEN COALESCE(amount_paid, total_amount) ELSE 0 END),0) AS cardSales,
         COUNT(*) AS salesCount
       FROM sales WHERE created_at >= ? AND created_at <= ?`,
      [fromIso, toIso],
    )
    const [purchasesAgg] = await query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_amount),0) AS total FROM purchases WHERE created_at >= ? AND created_at <= ?`,
      [fromIso, toIso],
    )
    const [expensesAgg] = await query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date >= ? AND expense_date <= ?`,
      [dayKey, dayKey],
    )
    const [wastageAgg] = await query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_cost),0) AS total FROM wastage WHERE created_at >= ? AND created_at <= ?`,
      [fromIso, toIso],
    )
    const closings = await query<RowDataPacket[]>(
      `SELECT id, closing_date AS closingDate, total_sales AS totalSales, cash_sales AS cashSales,
              card_sales AS cardSales, total_purchases AS totalPurchases, total_expenses AS totalExpenses,
              total_wastage AS totalWastage, net_amount AS netAmount, sales_count AS salesCount,
              notes, user_id AS userId, created_at AS createdAt
       FROM daily_closings WHERE closing_date = ?`,
      [dayKey],
    )

    const totalSales = toNum(salesAgg.totalSales)
    const cashSales = toNum(salesAgg.cashSales)
    const cardSales = toNum(salesAgg.cardSales)
    const salesCount = Number(salesAgg.salesCount)
    const totalPurchases = toNum(purchasesAgg.total)
    const totalExpenses = toNum(expensesAgg.total)
    const totalWastage = toNum(wastageAgg.total)
    const netAmount = roundMoney(totalSales - totalExpenses - totalWastage)

    return {
      ok: true,
      data: {
        totalSales,
        cashSales,
        cardSales,
        salesCount,
        totalPurchases,
        totalExpenses,
        totalWastage,
        netAmount,
        isClosed: closings.length > 0,
        closing: closings[0] ? mapClosing(closings[0]) : undefined,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function closeDay(notes?: string): Promise<ApiResult<DailyClosingDTO>> {
  try {
    const user = requireUser()
    const today = dateOnly(startOfDay())
    const existing = await query<RowDataPacket[]>(
      `SELECT id FROM daily_closings WHERE closing_date = ?`,
      [today],
    )
    if (existing.length) return { ok: false, error: 'تم إغلاق هذا اليوم مسبقاً' }

    const summaryRes = await getDaySummary()
    if (!summaryRes.ok || !summaryRes.data) {
      return { ok: false, error: summaryRes.error || 'تعذر حساب ملخص اليوم' }
    }
    const s = summaryRes.data

    const result = await execute(
      `INSERT INTO daily_closings
       (closing_date, total_sales, cash_sales, card_sales, total_purchases, total_expenses,
        total_wastage, net_amount, sales_count, notes, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        today,
        s.totalSales,
        s.cashSales,
        s.cardSales,
        s.totalPurchases,
        s.totalExpenses,
        s.totalWastage,
        s.netAmount,
        s.salesCount,
        notes?.trim() || null,
        user.id,
      ],
    )

    const rows = await query<RowDataPacket[]>(
      `SELECT id, closing_date AS closingDate, total_sales AS totalSales, cash_sales AS cashSales,
              card_sales AS cardSales, total_purchases AS totalPurchases, total_expenses AS totalExpenses,
              total_wastage AS totalWastage, net_amount AS netAmount, sales_count AS salesCount,
              notes, user_id AS userId, created_at AS createdAt
       FROM daily_closings WHERE id = ?`,
      [result.insertId],
    )
    const closing = mapClosing(rows[0])
    await logAudit(user, 'إغلاق اليوم', 'daily_closing', closing.id, `${s.totalSales} دج`)
    return { ok: true, data: closing }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function listClosings(limit = 30): Promise<ApiResult<DailyClosingDTO[]>> {
  try {
    const rows = await query<RowDataPacket[]>(
      `SELECT id, closing_date AS closingDate, total_sales AS totalSales, cash_sales AS cashSales,
              card_sales AS cardSales, total_purchases AS totalPurchases, total_expenses AS totalExpenses,
              total_wastage AS totalWastage, net_amount AS netAmount, sales_count AS salesCount,
              notes, user_id AS userId, created_at AS createdAt
       FROM daily_closings ORDER BY closing_date DESC LIMIT ?`,
      [limit],
    )
    return { ok: true, data: rows.map(mapClosing) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function getSalesReport(from: string, to: string): Promise<ApiResult<SalesReport>> {
  try {
    const salesRes = await listSales({ from, to, limit: 1000 })
    if (!salesRes.ok || !salesRes.data) return { ok: false, error: salesRes.error }
    const sales = salesRes.data
    const totalSales = roundMoney(sales.reduce((s, x) => s + x.totalAmount, 0))
    const cashSales = roundMoney(
      sales.filter((x) => x.paymentMethod === 'CASH').reduce((s, x) => s + x.totalAmount, 0),
    )
    const cardSales = roundMoney(
      sales.filter((x) => x.paymentMethod === 'CARD').reduce((s, x) => s + x.totalAmount, 0),
    )
    return {
      ok: true,
      data: {
        totalSales,
        cashSales,
        cardSales,
        salesCount: sales.length,
        averageSale: sales.length ? roundMoney(totalSales / sales.length) : 0,
        sales,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function getProductStats(from?: string, to?: string): Promise<ApiResult<ProductStats>> {
  try {
    const where: string[] = []
    const params: unknown[] = []
    if (from) {
      where.push('s.created_at >= ?')
      params.push(toSqlDateTime(startOfDay(new Date(from))))
    }
    if (to) {
      where.push('s.created_at <= ?')
      params.push(toSqlDateTime(endOfDay(new Date(to))))
    }
    const saleItems = await query<RowDataPacket[]>(
      `SELECT si.product_id AS productId, si.product_name AS name,
              SUM(si.quantity) AS quantity, SUM(si.line_total) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       GROUP BY si.product_id, si.product_name
       ORDER BY quantity DESC`,
      params,
    )

    const ranked = saleItems.map((r) => ({
      productId: Number(r.productId),
      name: String(r.name),
      quantity: toNum(r.quantity),
      revenue: toNum(r.revenue),
    }))

    const wasteWhere: string[] = []
    const wasteParams: unknown[] = []
    if (from) {
      wasteWhere.push('created_at >= ?')
      wasteParams.push(toSqlDateTime(startOfDay(new Date(from))))
    }
    if (to) {
      wasteWhere.push('created_at <= ?')
      wasteParams.push(toSqlDateTime(endOfDay(new Date(to))))
    }
    const wasteRows = await query<RowDataPacket[]>(
      `SELECT product_id AS productId, product_name AS name,
              SUM(quantity) AS quantity, SUM(total_cost) AS cost
       FROM wastage
       ${wasteWhere.length ? 'WHERE ' + wasteWhere.join(' AND ') : ''}
       GROUP BY product_id, product_name
       ORDER BY quantity DESC LIMIT 10`,
      wasteParams,
    )

    const productsRes = await listProducts({ status: 'ACTIVE' })
    const products = productsRes.data || []
    const lowStock = products.filter((p: ProductDTO) => p.stockQty <= p.minStock)

    return {
      ok: true,
      data: {
        topSelling: ranked.slice(0, 10),
        leastSelling: [...ranked].reverse().slice(0, 10),
        lowStock,
        mostWasted: wasteRows.map((r) => ({
          productId: Number(r.productId),
          name: String(r.name),
          quantity: toNum(r.quantity),
          cost: toNum(r.cost),
        })),
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}
