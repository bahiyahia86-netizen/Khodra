import { useCallback, useEffect, useState } from 'react'
import { PageHeader, Spinner, StatCard } from '../components/ui'
import { api, formatMoney, formatQty, paymentLabel, todayISO } from '../lib/api'
import type { DaySummary, ProductStats, SalesReport } from '../types'

type Tab = 'today' | 'sales' | 'products'

function rangePreset(preset: 'today' | 'week' | 'month'): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  if (preset === 'week') from.setDate(from.getDate() - 6)
  if (preset === 'month') from.setDate(from.getDate() - 29)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export function ReportsPage({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('today')
  const [loading, setLoading] = useState(true)
  const [day, setDay] = useState<DaySummary | null>(null)
  const [sales, setSales] = useState<SalesReport | null>(null)
  const [stats, setStats] = useState<ProductStats | null>(null)
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())

  const loadToday = useCallback(async () => {
    setLoading(true)
    const res = await api.daySummary()
    if (res.ok && res.data) setDay(res.data)
    setLoading(false)
  }, [])

  const loadSales = useCallback(async () => {
    setLoading(true)
    const res = await api.salesReport(from, to)
    if (res.ok && res.data) setSales(res.data)
    setLoading(false)
  }, [from, to])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const res = await api.productStats(from, to)
    if (res.ok && res.data) setStats(res.data)
    setLoading(false)
  }, [from, to])

  useEffect(() => {
    if (tab === 'today') void loadToday()
    if (tab === 'sales') void loadSales()
    if (tab === 'products') void loadProducts()
  }, [tab, loadToday, loadSales, loadProducts])

  return (
    <div>
      <PageHeader title="التقارير" subtitle="ملخصات واضحة من البيانات الحقيقية" onBack={onBack} />

      <div className="reports-tabs">
        <button type="button" className={`tab-btn ${tab === 'today' ? 'active' : ''}`} onClick={() => setTab('today')}>
          تقرير اليوم
        </button>
        <button type="button" className={`tab-btn ${tab === 'sales' ? 'active' : ''}`} onClick={() => setTab('sales')}>
          المبيعات
        </button>
        <button type="button" className={`tab-btn ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>
          المنتجات
        </button>
      </div>

      {tab !== 'today' && (
        <div className="toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const r = rangePreset('today'); setFrom(r.from); setTo(r.to) }}>
            اليوم
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const r = rangePreset('week'); setFrom(r.from); setTo(r.to) }}>
            أسبوع
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const r = rangePreset('month'); setFrom(r.from); setTo(r.to) }}>
            شهر
          </button>
          <input className="input" style={{ maxWidth: 160 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input" style={{ maxWidth: 160 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : tab === 'today' && day ? (
        <div>
          <div className="home-summary" style={{ marginTop: 0 }}>
            <StatCard label="إجمالي المبيعات" value={formatMoney(day.totalSales)} tone="green" hint={`${day.salesCount} عملية`} />
            <StatCard label="نقداً" value={formatMoney(day.cashSales)} tone="blue" />
            <StatCard label="بطاقة / CCP" value={formatMoney(day.cardSales)} />
            <StatCard label="المشتريات" value={formatMoney(day.totalPurchases)} />
            <StatCard label="المصاريف" value={formatMoney(day.totalExpenses)} tone="orange" />
            <StatCard label="الهالك" value={formatMoney(day.totalWastage)} tone="red" />
            <StatCard label="صافي تقريبي" value={formatMoney(day.netAmount)} tone={day.netAmount >= 0 ? 'green' : 'red'} />
            <StatCard label="حالة اليوم" value={day.isClosed ? 'مغلق' : 'مفتوح'} tone={day.isClosed ? 'orange' : 'green'} />
          </div>
        </div>
      ) : tab === 'sales' && sales ? (
        <div>
          <div className="home-summary" style={{ marginTop: 0, marginBottom: 16 }}>
            <StatCard label="إجمالي المبيعات" value={formatMoney(sales.totalSales)} tone="green" />
            <StatCard label="عدد العمليات" value={String(sales.salesCount)} tone="blue" />
            <StatCard label="متوسط الفاتورة" value={formatMoney(sales.averageSale)} />
            <StatCard label="نقداً / بطاقة" value={`${formatMoney(sales.cashSales)} / ${formatMoney(sales.cardSales)}`} />
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>الوقت</th>
                  <th>المبلغ</th>
                  <th>الدفع</th>
                  <th>البائع</th>
                </tr>
              </thead>
              <tbody>
                {sales.sales.map((s) => (
                  <tr key={s.id}>
                    <td>{s.invoiceNumber}</td>
                    <td>{new Date(s.createdAt).toLocaleString('ar-DZ')}</td>
                    <td className="strong">{formatMoney(s.totalAmount)}</td>
                    <td>{paymentLabel(s.paymentMethod)}</td>
                    <td>{s.userName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'products' && stats ? (
        <div className="form-grid">
          <div className="section-card">
            <h3>الأكثر مبيعاً</h3>
            {!stats.topSelling.length ? (
              <p className="muted">لا بيانات</p>
            ) : (
              <div className="stack-gap">
                {stats.topSelling.map((p) => (
                  <div key={p.productId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{p.name}</span>
                    <span className="strong">
                      {formatQty(p.quantity)} · {formatMoney(p.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="section-card">
            <h3>الأقل مبيعاً</h3>
            {!stats.leastSelling.length ? (
              <p className="muted">لا بيانات</p>
            ) : (
              <div className="stack-gap">
                {stats.leastSelling.map((p) => (
                  <div key={p.productId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{p.name}</span>
                    <span>{formatQty(p.quantity)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="section-card">
            <h3>منخفضة المخزون</h3>
            {!stats.lowStock.length ? (
              <p className="muted">لا يوجد نقص</p>
            ) : (
              <div className="stack-gap">
                {stats.lowStock.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{p.name}</span>
                    <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
                      {formatQty(p.stockQty)} / حد {formatQty(p.minStock)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="section-card">
            <h3>الأكثر هلاكاً</h3>
            {!stats.mostWasted.length ? (
              <p className="muted">لا بيانات</p>
            ) : (
              <div className="stack-gap">
                {stats.mostWasted.map((p) => (
                  <div key={p.productId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{p.name}</span>
                    <span>
                      {formatQty(p.quantity)} · {formatMoney(p.cost)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
