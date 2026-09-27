import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  QuickPanel,
  Select,
  Spinner,
} from '../components/ui'
import { api, formatDate, formatMoney, todayISO } from '../lib/api'
import { useToast } from '../lib/toast'
import type { Expense } from '../types'

export function ExpensesPage({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const [list, setList] = useState<Expense[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('نقل')
  const [expenseDate, setExpenseDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [eRes, cRes] = await Promise.all([api.listExpenses({ limit: 100 }), api.expenseCategories()])
    if (eRes.ok && eRes.data) setList(eRes.data)
    if (cRes.ok && cRes.data) {
      setCategories(cRes.data)
      if (cRes.data[0]) setCategory(cRes.data[0])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!description.trim() || !(parseFloat(amount) > 0)) {
      toast.error('أدخل الوصف والمبلغ')
      return
    }
    setSaving(true)
    const res = await api.createExpense({
      description: description.trim(),
      amount: parseFloat(amount),
      category,
      expenseDate,
      notes: notes || undefined,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'فشل الحفظ')
      return
    }
    toast.success('تم إضافة المصروف')
    setOpen(false)
    setDescription('')
    setAmount('')
    setNotes('')
    setExpenseDate(todayISO())
    await load()
  }

  async function confirmDelete() {
    if (deleteId == null) return
    const res = await api.deleteExpense(deleteId)
    setDeleteId(null)
    if (!res.ok) toast.error(res.error || 'فشل الحذف')
    else {
      toast.success('تم حذف المصروف')
      await load()
    }
  }

  return (
    <div>
      <PageHeader
        title="المصاريف"
        subtitle="تسجيل مصاريف المحل اليومية"
        onBack={onBack}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            + إضافة مصروف
          </Button>
        }
      />

      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <EmptyState title="لا توجد مصاريف" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الوصف</th>
                <th>التصنيف</th>
                <th>المبلغ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.expenseDate)}</td>
                  <td>
                    <div className="strong">{e.description}</div>
                    {e.notes && <div className="muted" style={{ fontSize: '0.8rem' }}>{e.notes}</div>}
                  </td>
                  <td>{e.category}</td>
                  <td className="strong">{formatMoney(e.amount)}</td>
                  <td>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(e.id)}>
                      حذف
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickPanel open={open} title="مصروف جديد" onClose={() => setOpen(false)}>
        <div className="stack-gap">
          <Input
            label="الوصف"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مثال: أكياس"
            autoFocus
          />
          <div className="form-grid">
            <Input
              label="المبلغ"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Select label="التصنيف" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Input
              label="التاريخ"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>
          <Input label="ملاحظة" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setOpen(false)}>
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
        title="حذف المصروف"
        message="هل أنت متأكد من حذف هذا المصروف؟"
        danger
        confirmLabel="حذف"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
