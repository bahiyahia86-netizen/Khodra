import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, Input, PageHeader, QuickPanel, Select, Spinner } from '../components/ui'
import { api, formatDateTime, formatMoney, formatQty, reasonLabel, unitLabel } from '../lib/api'
import { useToast } from '../lib/toast'
import type { Product, Wastage, WastageReason } from '../types'

export function WastagePage({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const [list, setList] = useState<Wastage[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState<WastageReason>('DAMAGED')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [wRes, pRes] = await Promise.all([
      api.listWastage({ limit: 50 }),
      api.listProducts({ activeOnly: true }),
    ])
    if (wRes.ok && wRes.data) setList(wRes.data)
    if (pRes.ok && pRes.data) setProducts(pRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!productId || !(parseFloat(quantity) > 0)) {
      toast.error('اختر المنتج والكمية')
      return
    }
    setSaving(true)
    const res = await api.createWastage({
      productId: parseInt(productId, 10),
      quantity: parseFloat(quantity),
      reason,
      notes: notes || undefined,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'فشل التسجيل')
      return
    }
    toast.success('تم تسجيل الهالك وخصم المخزون')
    setOpen(false)
    setProductId('')
    setQuantity('')
    setNotes('')
    setReason('DAMAGED')
    await load()
  }

  return (
    <div>
      <PageHeader
        title="الهالك"
        subtitle="تسجيل التالف والفاسد — يُخصم من المخزون فوراً"
        onBack={onBack}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            + تسجيل هالك
          </Button>
        }
      />

      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <EmptyState title="لا يوجد هالك مسجّل" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المنتج</th>
                <th>الكمية</th>
                <th>السبب</th>
                <th>التكلفة</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id}>
                  <td>{formatDateTime(w.createdAt)}</td>
                  <td className="strong">{w.productName}</td>
                  <td>
                    {formatQty(w.quantity)} {unitLabel(w.unit)}
                  </td>
                  <td>{reasonLabel(w.reason)}</td>
                  <td>{formatMoney(w.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickPanel open={open} title="تسجيل هالك" onClose={() => setOpen(false)}>
        <div className="stack-gap">
          <Select
            label="المنتج"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">اختر المنتج...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — المتاح {formatQty(p.stockQty)} {unitLabel(p.unit)}
              </option>
            ))}
          </Select>
          <Input
            label="الكمية"
            type="number"
            min="0"
            step="0.001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Select
            label="السبب"
            value={reason}
            onChange={(e) => setReason(e.target.value as WastageReason)}
          >
            <option value="DAMAGED">تالف</option>
            <option value="ROTTEN">فاسد</option>
            <option value="TRANSPORT">تلف أثناء النقل</option>
            <option value="OTHER">سبب آخر</option>
          </Select>
          <Input label="ملاحظة (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button variant="danger" disabled={saving} onClick={() => void save()}>
              {saving ? 'جاري الحفظ...' : 'حفظ وخصم المخزون'}
            </Button>
          </div>
        </div>
      </QuickPanel>
    </div>
  )
}
