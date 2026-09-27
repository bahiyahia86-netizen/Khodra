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
  Textarea,
} from '../components/ui'
import {
  api,
  formatDate,
  formatDateTime,
  formatMoney,
  paymentLabel,
} from '../lib/api'
import { useToast } from '../lib/toast'
import type { Customer, CustomerDetail, CustomerStatus, PaymentMethod } from '../types'

interface FormState {
  name: string
  phone: string
  nationalId: string
  address: string
  notes: string
  status: CustomerStatus
}

const emptyForm: FormState = {
  name: '',
  phone: '',
  nationalId: '',
  address: '',
  notes: '',
  status: 'ACTIVE',
}

export function CustomersPage({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const [list, setList] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH')
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.listCustomers({
      search: search || undefined,
      status: showInactive ? 'ALL' : 'ACTIVE',
    })
    if (res.ok && res.data) setList(res.data)
    else toast.error(res.error || 'تعذر تحميل الزبائن')
    setLoading(false)
  }, [search, showInactive, toast])

  useEffect(() => {
    const t = setTimeout(() => void load(), 180)
    return () => clearTimeout(t)
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  function openEdit(c: Customer) {
    setEditing(c)
    setForm({
      name: c.name,
      phone: c.phone || '',
      nationalId: c.nationalId || '',
      address: c.address || '',
      notes: c.notes || '',
      status: c.status,
    })
    setFormOpen(true)
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error('الاسم الكامل مطلوب')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      nationalId: form.nationalId.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
    }
    const res = editing
      ? await api.updateCustomer(editing.id, payload)
      : await api.createCustomer(payload)
    setSaving(false)
    if (!res.ok || !res.data) {
      toast.error(res.error || 'فشل الحفظ')
      return
    }
    toast.success(editing ? 'تم تعديل الزبون' : 'تم حفظ الزبون')
    setFormOpen(false)
    await load()
    if (detail && res.data.id === detail.id) {
      void openDetail(res.data.id)
    }
  }

  async function openDetail(id: number) {
    setDetailLoading(true)
    const res = await api.getCustomer(id)
    setDetailLoading(false)
    if (!res.ok || !res.data) {
      toast.error(res.error || 'تعذر التحميل')
      return
    }
    setDetail(res.data)
  }

  async function confirmDelete() {
    if (deleteId == null) return
    const id = deleteId
    setDeleteId(null)
    const res = await api.deleteCustomer(id)
    if (!res.ok) {
      toast.error(res.error || 'فشل الحذف')
      return
    }
    if (res.data?.deactivated) {
      toast.success('تم تعطيل الزبون (مرتبط بعمليات سابقة)')
    } else {
      toast.success('تم حذف الزبون')
    }
    if (detail?.id === id) setDetail(null)
    await load()
  }

  function openPay() {
    if (!detail) return
    setPayAmount(detail.balance > 0 ? String(detail.balance) : '')
    setPayMethod('CASH')
    setPayOpen(true)
  }

  async function confirmPay() {
    if (!detail) return
    const amount = parseFloat(payAmount.replace(',', '.'))
    if (!(amount > 0)) {
      toast.error('أدخل مبلغاً صحيحاً')
      return
    }
    if (amount > detail.balance + 0.001) {
      toast.error('مبلغ التسديد أكبر من الرصيد المستحق.')
      return
    }
    setPaying(true)
    const res = await api.payCustomer({
      customerId: detail.id,
      amount,
      paymentMethod: payMethod,
    })
    setPaying(false)
    if (!res.ok || !res.data) {
      toast.error(res.error || 'فشل التسديد')
      return
    }
    toast.success('تم تسديد الرصيد')
    setPayOpen(false)
    setDetail(res.data)
    await load()
  }

  // Detail view
  if (detail) {
    return (
      <div>
        <PageHeader
          title={detail.name}
          subtitle={detail.phone ? `الهاتف: ${detail.phone}` : 'لا يوجد هاتف'}
          onBack={() => setDetail(null)}
          actions={
            <>
              <Button variant="outline" onClick={() => openEdit(detail)}>
                تعديل
              </Button>
              {detail.balance > 0 && (
                <Button variant="primary" onClick={openPay}>
                  تسديد الرصيد
                </Button>
              )}
            </>
          }
        />

        {detailLoading ? (
          <Spinner />
        ) : (
          <>
            <div className="home-summary" style={{ marginTop: 0, marginBottom: 16 }}>
              <div className="stat-card tone-blue">
                <div className="stat-label">عدد العمليات</div>
                <div className="stat-value">{detail.salesCount}</div>
              </div>
              <div className="stat-card tone-green">
                <div className="stat-label">إجمالي المشتريات</div>
                <div className="stat-value">{formatMoney(detail.totalPurchases)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">إجمالي المدفوع</div>
                <div className="stat-value">{formatMoney(detail.totalPaid)}</div>
              </div>
              <div className={`stat-card ${detail.balance > 0 ? 'tone-orange' : 'tone-green'}`}>
                <div className="stat-label">الرصيد الحالي</div>
                <div className="stat-value">{formatMoney(detail.balance)}</div>
                <div className="stat-hint">
                  {detail.balance > 0 ? 'مستحق على الزبون' : 'مسدد بالكامل'}
                </div>
              </div>
            </div>

            {(detail.nationalId || detail.address || detail.notes) && (
              <div className="section-card">
                <h3>معلومات إضافية</h3>
                <div className="form-grid">
                  {detail.nationalId && (
                    <div>
                      <div className="muted">الرقم الوطني</div>
                      <div className="strong">{detail.nationalId}</div>
                    </div>
                  )}
                  {detail.address && (
                    <div>
                      <div className="muted">العنوان</div>
                      <div className="strong">{detail.address}</div>
                    </div>
                  )}
                  {detail.notes && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div className="muted">ملاحظات</div>
                      <div>{detail.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="section-card">
              <h3>آخر العمليات</h3>
              {!detail.sales.length ? (
                <p className="muted">لا عمليات بعد</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>رقم العملية</th>
                        <th>الإجمالي</th>
                        <th>المدفوع</th>
                        <th>المتبقي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.sales.map((s) => (
                        <tr key={s.id}>
                          <td>{formatDateTime(s.createdAt)}</td>
                          <td className="strong">#{s.invoiceNumber}</td>
                          <td>{formatMoney(s.totalAmount)}</td>
                          <td>{formatMoney(s.amountPaid)}</td>
                          <td>
                            {s.balanceDue > 0 ? (
                              <Badge tone="warning">{formatMoney(s.balanceDue)}</Badge>
                            ) : (
                              <Badge tone="success">0</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {detail.payments.length > 0 && (
              <div className="section-card">
                <h3>سجل التسديدات</h3>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>المبلغ</th>
                        <th>الطريقة</th>
                        <th>ملاحظة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.payments.map((p) => (
                        <tr key={p.id}>
                          <td>{formatDateTime(p.createdAt)}</td>
                          <td className="strong">{formatMoney(p.amount)}</td>
                          <td>{paymentLabel(p.paymentMethod)}</td>
                          <td>{p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* shared modals below */}
        <CustomerFormModal
          open={formOpen}
          title={editing ? 'تعديل زبون' : 'إضافة زبون'}
          form={form}
          setForm={setForm}
          saving={saving}
          showStatus
          onClose={() => setFormOpen(false)}
          onSave={() => void save()}
        />
        <PayModal
          open={payOpen}
          balance={detail.balance}
          amount={payAmount}
          setAmount={setPayAmount}
          method={payMethod}
          setMethod={setPayMethod}
          paying={paying}
          onClose={() => setPayOpen(false)}
          onConfirm={() => void confirmPay()}
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="الزبائن"
        subtitle="إدارة بيانات الزبائن ومتابعة تعاملاتهم"
        onBack={onBack}
        actions={
          <Button variant="primary" onClick={openCreate}>
            + إضافة زبون
          </Button>
        }
      />

      <div className="toolbar">
        <input
          className="input"
          placeholder="بحث بالاسم أو الهاتف أو الرقم الوطني أو الملاحظة..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          إظهار غير النشطين
        </label>
        <Button variant="secondary" onClick={() => void load()}>
          تحديث
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <EmptyState title="لا يوجد زبائن" description="أضف أول زبون للبدء" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>الزبون</th>
                <th>الهاتف</th>
                <th>عدد المبيعات</th>
                <th>إجمالي المشتريات</th>
                <th>الرصيد</th>
                <th>آخر تعامل</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => void openDetail(c.id)}>
                  <td>
                    <div className="strong">{c.name}</div>
                    {c.status === 'INACTIVE' && <Badge tone="neutral">غير نشط</Badge>}
                    {c.notes && (
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        {c.notes}
                      </div>
                    )}
                  </td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.salesCount} عملية</td>
                  <td className="strong">{formatMoney(c.totalPurchases)}</td>
                  <td>
                    {c.balance > 0 ? (
                      <Badge tone="warning">عليه {formatMoney(c.balance)}</Badge>
                    ) : (
                      <Badge tone="success">مسدد</Badge>
                    )}
                  </td>
                  <td>{c.lastSaleAt ? formatDate(c.lastSaleAt) : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" variant="outline" onClick={() => void openDetail(c.id)}>
                        عرض
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                        تعديل
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(c.id)}>
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

      <CustomerFormModal
        open={formOpen}
        title={editing ? 'تعديل زبون' : 'إضافة زبون'}
        form={form}
        setForm={setForm}
        saving={saving}
        showStatus={!!editing}
        onClose={() => setFormOpen(false)}
        onSave={() => void save()}
      />

      <ConfirmDialog
        open={deleteId != null}
        title="حذف الزبون"
        message="هل تريد حذف هذا الزبون؟ إذا كان لديه عمليات سيتم تعطيله فقط."
        danger
        confirmLabel="حذف"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

function CustomerFormModal({
  open,
  title,
  form,
  setForm,
  saving,
  showStatus,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  form: FormState
  setForm: (f: FormState) => void
  saving: boolean
  showStatus?: boolean
  onClose: () => void
  onSave: () => void
}) {
  return (
    <QuickPanel open={open} title={title} onClose={onClose}>
      <div className="stack-gap">
        <div className="muted" style={{ fontWeight: 700 }}>
          المعلومات الشخصية
        </div>
        <Input
          label="الاسم الكامل *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
        <div className="form-grid">
          <Input
            label="رقم الهاتف"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="05xxxxxxxx"
          />
          <Input
            label="الرقم الوطني"
            value={form.nationalId}
            onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
          />
        </div>
        <Input
          label="العنوان"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <div className="muted" style={{ fontWeight: 700, marginTop: 4 }}>
          معلومات إضافية
        </div>
        <Textarea
          label="ملاحظات"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        {showStatus && (
          <Select
            label="الحالة"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as CustomerStatus })}
          >
            <option value="ACTIVE">نشط</option>
            <option value="INACTIVE">غير نشط</option>
          </Select>
        )}
        <div className="form-actions">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={saving} onClick={onSave}>
            {saving ? 'جاري الحفظ...' : 'حفظ الزبون'}
          </Button>
        </div>
      </div>
    </QuickPanel>
  )
}

function PayModal({
  open,
  balance,
  amount,
  setAmount,
  method,
  setMethod,
  paying,
  onClose,
  onConfirm,
}: {
  open: boolean
  balance: number
  amount: string
  setAmount: (v: string) => void
  method: PaymentMethod
  setMethod: (m: PaymentMethod) => void
  paying: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <QuickPanel open={open} title="تسديد الرصيد" onClose={onClose}>
      <div className="stack-gap">
        <div className="qty-total">الرصيد الحالي: {formatMoney(balance)}</div>
        <Input
          label="المبلغ المدفوع"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        <div className="payment-row">
          <button
            type="button"
            className={`pay-btn ${method === 'CASH' ? 'active' : ''}`}
            onClick={() => setMethod('CASH')}
          >
            💵 نقداً
          </button>
          <button
            type="button"
            className={`pay-btn ${method === 'CARD' ? 'active' : ''}`}
            onClick={() => setMethod('CARD')}
          >
            💳 CCP / بطاقة
          </button>
        </div>
        <div className="form-actions">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={paying} onClick={onConfirm}>
            {paying ? 'جاري التأكيد...' : 'تأكيد التسديد'}
          </Button>
        </div>
      </div>
    </QuickPanel>
  )
}
