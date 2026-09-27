import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, EmptyState, Input, PageHeader, QuickPanel, Select, Spinner } from '../components/ui'
import { api, formatDateTime, formatMoney, formatQty, unitLabel } from '../lib/api'
import { useToast } from '../lib/toast'
import type { Product, Purchase } from '../types'

interface Line {
  productId: string
  quantity: string
  unitCost: string
}

export function PurchasesPage({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const [list, setList] = useState<Purchase[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: '', unitCost: '' }])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [pRes, prRes] = await Promise.all([
      api.listPurchases({ limit: 50 }),
      api.listProducts({ status: 'ACTIVE' }),
    ])
    if (pRes.ok && pRes.data) setList(pRes.data)
    if (prRes.ok && prRes.data) setProducts(prRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const total = useMemo(() => {
    return Math.round(
      lines.reduce((s, l) => {
        const q = parseFloat(l.quantity) || 0
        const c = parseFloat(l.unitCost) || 0
        return s + q * c
      }, 0) * 100,
    ) / 100
  }, [lines])

  function addLine() {
    setLines((prev) => [...prev, { productId: '', quantity: '', unitCost: '' }])
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l
        const next = { ...l, ...patch }
        if (patch.productId) {
          const p = products.find((x) => String(x.id) === patch.productId)
          if (p && !next.unitCost) next.unitCost = String(p.purchasePrice)
        }
        return next
      }),
    )
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  async function save() {
    const items = lines
      .filter((l) => l.productId && parseFloat(l.quantity) > 0)
      .map((l) => ({
        productId: parseInt(l.productId, 10),
        quantity: parseFloat(l.quantity),
        unitCost: parseFloat(l.unitCost) || 0,
      }))
    if (!items.length) {
      toast.error('أضف منتجاً واحداً على الأقل')
      return
    }
    setSaving(true)
    const res = await api.createPurchase({
      supplierName: supplier || undefined,
      notes: notes || undefined,
      items,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'فشل الحفظ')
      return
    }
    toast.success(`تم تسجيل المشتريات — ${formatMoney(res.data!.totalAmount)}`)
    setOpen(false)
    setSupplier('')
    setNotes('')
    setLines([{ productId: '', quantity: '', unitCost: '' }])
    await load()
  }

  return (
    <div>
      <PageHeader
        title="المشتريات"
        subtitle="عند وصول بضاعة جديدة — يزيد المخزون تلقائياً"
        onBack={onBack}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            + إضافة مشتريات
          </Button>
        }
      />

      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <EmptyState title="لا توجد مشتريات بعد" description="سجّل أول عملية شراء" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المورد</th>
                <th>الأصناف</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>{formatDateTime(p.createdAt)}</td>
                  <td>{p.supplierName || '—'}</td>
                  <td>
                    {p.items
                      .map((i) => `${i.productName} (${formatQty(i.quantity)} ${unitLabel(i.unit)})`)
                      .join(' · ')}
                  </td>
                  <td className="strong">{formatMoney(p.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickPanel open={open} title="إضافة مشتريات" onClose={() => setOpen(false)}>
        <div className="stack-gap">
          <Input
            label="المورد (اختياري)"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="اسم المورد"
          />

          <div className="line-items-editor">
            {lines.map((line, idx) => (
              <div key={idx} className="line-item-row">
                <Select
                  label={idx === 0 ? 'المنتج' : undefined}
                  value={line.productId}
                  onChange={(e) => updateLine(idx, { productId: e.target.value })}
                >
                  <option value="">اختر...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Input
                  label={idx === 0 ? 'الكمية' : undefined}
                  type="number"
                  min="0"
                  step="0.001"
                  value={line.quantity}
                  onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                />
                <Input
                  label={idx === 0 ? 'سعر الشراء' : undefined}
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitCost}
                  onChange={(e) => updateLine(idx, { unitCost: e.target.value })}
                />
                <Button variant="ghost" size="sm" onClick={() => removeLine(idx)}>
                  ✕
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={addLine}>
              + سطر
            </Button>
          </div>

          <Input
            label="ملاحظة"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="qty-total">الإجمالي: {formatMoney(total)}</div>

          <div className="form-actions">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'جاري الحفظ...' : 'حفظ وزيادة المخزون'}
            </Button>
          </div>
        </div>
      </QuickPanel>
    </div>
  )
}
