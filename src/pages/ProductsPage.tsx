import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  QuickPanel,
  Select,
  Spinner,
} from '../components/ui'
import { api, formatMoney, formatQty, unitLabel } from '../lib/api'
import { useToast } from '../lib/toast'
import type { Product, ProductStatus, ProductUnit } from '../types'

interface FormState {
  name: string
  barcode: string
  unit: ProductUnit
  purchasePrice: string
  salePrice: string
  stockQty: string
  minStock: string
  status: ProductStatus
}

const emptyForm: FormState = {
  name: '',
  barcode: '',
  unit: 'KG',
  purchasePrice: '',
  salePrice: '',
  stockQty: '0',
  minStock: '0',
  status: 'ACTIVE',
}

export function ProductsPage({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.listProducts({ search: search || undefined, status: 'ALL' })
    if (res.ok && res.data) setProducts(res.data)
    else toast.error(res.error || 'خطأ')
    setLoading(false)
  }, [search, toast])

  useEffect(() => {
    const t = setTimeout(() => void load(), 200)
    return () => clearTimeout(t)
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: p.name,
      barcode: p.barcode || '',
      unit: p.unit,
      purchasePrice: String(p.purchasePrice),
      salePrice: String(p.salePrice),
      stockQty: String(p.stockQty),
      minStock: String(p.minStock),
      status: p.status,
    })
    setFormOpen(true)
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error('اسم المنتج مطلوب')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      unit: form.unit,
      purchasePrice: parseFloat(form.purchasePrice) || 0,
      salePrice: parseFloat(form.salePrice) || 0,
      stockQty: parseFloat(form.stockQty) || 0,
      minStock: parseFloat(form.minStock) || 0,
      status: form.status,
    }
    const res = editing
      ? await api.updateProduct(editing.id, payload)
      : await api.createProduct(payload)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'فشل الحفظ')
      return
    }
    toast.success(editing ? 'تم تعديل المنتج' : 'تم إضافة المنتج')
    setFormOpen(false)
    await load()
  }

  async function confirmDelete() {
    if (deleteId == null) return
    const res = await api.deleteProduct(deleteId)
    setDeleteId(null)
    if (!res.ok) toast.error(res.error || 'فشل الحذف')
    else {
      toast.success('تم حذف/تعطيل المنتج')
      await load()
    }
  }

  return (
    <div>
      <PageHeader
        title="المنتجات"
        subtitle="إدارة الأصناف والأسعار والمخزون"
        onBack={onBack}
        actions={
          <Button variant="primary" onClick={openCreate}>
            + منتج جديد
          </Button>
        }
      />

      <div className="toolbar">
        <input
          className="input"
          placeholder="بحث بالاسم أو الباركود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="secondary" onClick={() => void load()}>
          تحديث
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : !products.length ? (
        <EmptyState title="لا توجد منتجات" description="أضف أول منتج للبدء" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الوحدة</th>
                <th>سعر الشراء</th>
                <th>سعر البيع</th>
                <th>المخزون</th>
                <th>الحد الأدنى</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="strong">{p.name}</div>
                    {p.barcode && <div className="muted" style={{ fontSize: '0.8rem' }}>{p.barcode}</div>}
                  </td>
                  <td>{unitLabel(p.unit)}</td>
                  <td>{formatMoney(p.purchasePrice)}</td>
                  <td className="strong" style={{ color: 'var(--green-800)' }}>
                    {formatMoney(p.salePrice)}
                  </td>
                  <td>
                    {formatQty(p.stockQty)} {unitLabel(p.unit)}
                    {p.stockQty <= p.minStock && (
                      <>
                        {' '}
                        <Badge tone="warning">منخفض</Badge>
                      </>
                    )}
                  </td>
                  <td>
                    {formatQty(p.minStock)} {unitLabel(p.unit)}
                  </td>
                  <td>
                    <Badge tone={p.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {p.status === 'ACTIVE' ? 'نشط' : 'معطّل'}
                    </Badge>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                        تعديل
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(p.id)}>
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickPanel
        open={formOpen}
        title={editing ? 'تعديل منتج' : 'منتج جديد'}
        onClose={() => setFormOpen(false)}
      >
        <div className="stack-gap">
          <Input
            label="اسم المنتج"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
          <Input
            label="الباركود (اختياري)"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          />
          <div className="form-grid">
            <Select
              label="الوحدة"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUnit })}
            >
              <option value="KG">كغ</option>
              <option value="PIECE">حبة</option>
              <option value="BOX">صندوق</option>
              <option value="OTHER">أخرى</option>
            </Select>
            <Select
              label="الحالة"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ProductStatus })}
            >
              <option value="ACTIVE">نشط</option>
              <option value="INACTIVE">معطّل</option>
            </Select>
            <Input
              label="سعر الشراء"
              type="number"
              min="0"
              step="0.01"
              value={form.purchasePrice}
              onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
            />
            <Input
              label="سعر البيع"
              type="number"
              min="0"
              step="0.01"
              value={form.salePrice}
              onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
            />
            <Input
              label="الكمية الحالية"
              type="number"
              min="0"
              step="0.001"
              value={form.stockQty}
              onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
            />
            <Input
              label="الحد الأدنى للمخزون"
              type="number"
              min="0"
              step="0.001"
              value={form.minStock}
              onChange={(e) => setForm({ ...form, minStock: e.target.value })}
            />
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </div>
        </div>
      </QuickPanel>

      <ConfirmDialog
        open={deleteId != null}
        title="حذف المنتج"
        message="هل تريد حذف هذا المنتج؟ إذا كان له سجل مبيعات سيتم تعطيله فقط."
        danger
        confirmLabel="حذف"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
