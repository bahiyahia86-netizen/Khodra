import { useCallback, useEffect, useState } from 'react'
import { Button, ConfirmDialog, PageHeader, Spinner, StatCard } from '../components/ui'
import { api, formatMoney } from '../lib/api'
import { useToast } from '../lib/toast'
import type { DaySummary } from '../types'

export function CloseDayPage({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [closing, setClosing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.daySummary()
    if (res.ok && res.data) setSummary(res.data)
    else toast.error(res.error || 'خطأ')
    setLoading(false)
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function doClose() {
    setConfirm(false)
    setClosing(true)
    const res = await api.closeDay()
    setClosing(false)
    if (!res.ok) {
      toast.error(res.error || 'فشل إغلاق اليوم')
      return
    }
    toast.success('تم إغلاق اليوم بنجاح')
    await load()
  }

  return (
    <div>
      <PageHeader
        title="إغلاق اليوم"
        subtitle="راجع الملخص ثم أغلق يوم العمل"
        onBack={onBack}
      />

      {loading || !summary ? (
        <Spinner />
      ) : (
        <>
          <div className="home-summary" style={{ marginTop: 0 }}>
            <StatCard label="المبيعات" value={formatMoney(summary.totalSales)} tone="green" hint={`${summary.salesCount} عملية`} />
            <StatCard label="نقداً" value={formatMoney(summary.cashSales)} tone="blue" />
            <StatCard label="CCP / بطاقة" value={formatMoney(summary.cardSales)} />
            <StatCard label="المصاريف" value={formatMoney(summary.totalExpenses)} tone="orange" />
            <StatCard label="المشتريات" value={formatMoney(summary.totalPurchases)} />
            <StatCard label="الهالك" value={formatMoney(summary.totalWastage)} tone="red" />
            <StatCard label="صافي تقريبي" value={formatMoney(summary.netAmount)} tone={summary.netAmount >= 0 ? 'green' : 'red'} />
          </div>

          <div className="section-card" style={{ marginTop: 20, textAlign: 'center' }}>
            {summary.isClosed ? (
              <div className="success-banner" style={{ margin: 0 }}>
                <h3>🔐 اليوم مغلق</h3>
                <p>تم إنشاء سجل إغلاق لهذا اليوم</p>
              </div>
            ) : (
              <>
                <p className="muted" style={{ marginBottom: 16 }}>
                  بعد الإغلاق يتم حفظ ملخص اليوم في السجلات. يمكنك الاستمرار في البيع غداً بشكل طبيعي.
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  disabled={closing}
                  onClick={() => setConfirm(true)}
                >
                  {closing ? 'جاري الإغلاق...' : 'إغلاق اليوم'}
                </Button>
              </>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm}
        title="تأكيد إغلاق اليوم"
        message="هل أنت متأكد من إغلاق يوم العمل الحالي؟"
        confirmLabel="إغلاق اليوم"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void doClose()}
      />
    </div>
  )
}
