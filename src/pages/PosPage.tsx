import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, PageHeader, QuickPanel, Spinner } from '../components/ui'
import { api, formatMoney, formatQty, unitLabel } from '../lib/api'
import { useToast } from '../lib/toast'
import type { CartItem, Customer, PaymentMethod, Product, Sale } from '../types'

const EMOJI_MAP: Record<string, string> = {
  طماطم: '🍅',
  بطاطا: '🥔',
  بصل: '🧅',
  جزر: '🥕',
  خيار: '🥒',
  فلفل: '🌶️',
  ثوم: '🧄',
  ليمون: '🍋',
  تفاح: '🍎',
  موز: '🍌',
  برتقال: '🍊',
  عنب: '🍇',
}

function productEmoji(name: string): string {
  for (const [k, v] of Object.entries(EMOJI_MAP)) {
    if (name.includes(k)) return v
  }
  return '🥬'
}

export function PosPage({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const searchRef = useRef<HTMLInputElement>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [payment, setPayment] = useState<PaymentMethod>('CASH')
  const [submitting, setSubmitting] = useState(false)
  const [picker, setPicker] = useState<Product | null>(null)
  const [qty, setQty] = useState('1')
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customerLoading, setCustomerLoading] = useState(false)
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [amountPaid, setAmountPaid] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.listProducts({ activeOnly: true })
    if (res.ok && res.data) setProducts(res.data)
    else toast.error(res.error || 'تعذر تحميل المنتجات')
    setLoading(false)
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!customerOpen) return
    const t = setTimeout(async () => {
      setCustomerLoading(true)
      const res = await api.listCustomers({
        search: customerSearch || undefined,
        activeOnly: true,
      })
      setCustomerLoading(false)
      if (res.ok && res.data) setCustomerResults(res.data)
    }, 150)
    return () => clearTimeout(t)
  }, [customerOpen, customerSearch])

  useEffect(() => {
    // When total changes and no custom paid amount, keep paid = total for walk-in
    if (!customer) setAmountPaid('')
  }, [customer, cart])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        if (newCustomerOpen) setNewCustomerOpen(false)
        else if (customerOpen) setCustomerOpen(false)
        else if (picker) setPicker(null)
        else if (lastSale) setLastSale(null)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void handleComplete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, lastSale, cart, payment, submitting, customerOpen, newCustomerOpen, customer])

  const filtered = useMemo(() => {
    const q = search.trim()
    if (!q) return products
    return products.filter(
      (p) => p.name.includes(q) || (p.barcode && p.barcode.includes(q)),
    )
  }, [products, search])

  const total = useMemo(
    () => Math.round(cart.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100,
    [cart],
  )

  const paidValue = useMemo(() => {
    if (!customer) return total
    if (amountPaid === '') return total
    const n = parseFloat(amountPaid.replace(',', '.'))
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : total
  }, [customer, amountPaid, total])

  const balancePreview = useMemo(
    () => Math.round((total - paidValue) * 100) / 100,
    [total, paidValue],
  )

  function openPicker(p: Product) {
    if (p.stockQty <= 0) {
      toast.error('المنتج غير متوفر في المخزون')
      return
    }
    setPicker(p)
    setQty(p.unit === 'KG' ? '1' : '1')
  }

  function addToCart() {
    if (!picker) return
    const quantity = parseFloat(qty.replace(',', '.'))
    if (!quantity || quantity <= 0) {
      toast.error('أدخل كمية صحيحة')
      return
    }
    const existing = cart.find((c) => c.productId === picker.id)
    const newQty = Math.round(((existing?.quantity || 0) + quantity) * 1000) / 1000
    if (newQty > picker.stockQty) {
      toast.error(`المخزون المتاح: ${formatQty(picker.stockQty)} ${unitLabel(picker.unit)}`)
      return
    }
    const lineTotal = Math.round(newQty * picker.salePrice * 100) / 100
    setCart((prev) => {
      if (existing) {
        return prev.map((c) =>
          c.productId === picker.id
            ? { ...c, quantity: newQty, lineTotal, unitPrice: picker.salePrice }
            : c,
        )
      }
      return [
        ...prev,
        {
          productId: picker.id,
          name: picker.name,
          unit: picker.unit,
          unitPrice: picker.salePrice,
          quantity: newQty,
          stockQty: picker.stockQty,
          lineTotal,
        },
      ]
    })
    setPicker(null)
    searchRef.current?.focus()
  }

  function updateCartQty(productId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.productId !== productId) return c
          const step = c.unit === 'KG' ? 0.25 : 1
          let quantity = Math.round((c.quantity + delta * step) * 1000) / 1000
          if (quantity <= 0) return { ...c, quantity: 0, lineTotal: 0 }
          if (quantity > c.stockQty) quantity = c.stockQty
          return {
            ...c,
            quantity,
            lineTotal: Math.round(quantity * c.unitPrice * 100) / 100,
          }
        })
        .filter((c) => c.quantity > 0),
    )
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((c) => c.productId !== productId))
  }

  async function handleComplete() {
    if (submitting) return
    if (!cart.length) {
      toast.error('السلة فارغة')
      return
    }
    if (customer && paidValue > total + 0.001) {
      toast.error('المبلغ المدفوع أكبر من إجمالي الفاتورة')
      return
    }
    if (customer && paidValue < 0) {
      toast.error('المبلغ المدفوع غير صالح')
      return
    }
    if (!customer && balancePreview > 0) {
      toast.error('لا يمكن تسجيل متبقي بدون اختيار زبون')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.completeSale({
        items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        paymentMethod: payment,
        customerId: customer?.id ?? null,
        amountPaid: customer ? paidValue : total,
      })
      if (!res.ok || !res.data) {
        toast.error(res.error || 'فشل إتمام البيع')
        return
      }
      setLastSale(res.data)
      setCart([])
      setAmountPaid('')
      toast.success(
        res.data.balanceDue > 0
          ? `تم البيع — متبقي ${formatMoney(res.data.balanceDue)}`
          : `تم البيع — ${formatMoney(res.data.totalAmount)}`,
      )
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  async function createQuickCustomer() {
    if (!newCustomerName.trim()) {
      toast.error('الاسم الكامل مطلوب')
      return
    }
    const res = await api.createCustomer({
      name: newCustomerName.trim(),
      phone: newCustomerPhone.trim() || null,
    })
    if (!res.ok || !res.data) {
      toast.error(res.error || 'فشل إضافة الزبون')
      return
    }
    setCustomer(res.data)
    setNewCustomerOpen(false)
    setCustomerOpen(false)
    setNewCustomerName('')
    setNewCustomerPhone('')
    setAmountPaid(String(total))
    toast.success('تم إضافة الزبون')
  }

  async function handlePrint() {
    if (!lastSale) return
    const res = await api.printReceipt(lastSale.id)
    if (!res.ok) toast.error(res.error || 'تعذر الطباعة')
    else toast.success('تم إرسال الوصل للطابعة')
  }

  return (
    <div>
      <PageHeader
        title="نقطة البيع"
        subtitle="بحث سريع · وزن كسري · اختصارات لوحة المفاتيح"
        onBack={onBack}
        actions={
          <>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              <span className="kbd">Ctrl+Enter</span> إتمام · <span className="kbd">F2</span> بحث
            </span>
            <Button variant="secondary" onClick={load}>
              تحديث
            </Button>
          </>
        }
      />

      <div className="pos-layout">
        <div className="pos-main">
          <div className="pos-search-bar">
            <input
              ref={searchRef}
              className="input"
              placeholder="ابحث بالاسم أو الباركود..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length === 1) {
                  openPicker(filtered[0])
                }
              }}
              autoFocus
            />
          </div>

          {loading ? (
            <Spinner />
          ) : (
            <div className="product-grid">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`product-tile ${p.stockQty <= 0 ? 'out-of-stock' : ''} ${p.stockQty <= p.minStock ? 'low-stock' : ''}`}
                  onClick={() => openPicker(p)}
                  disabled={p.stockQty <= 0}
                >
                  <div className="product-emoji">{productEmoji(p.name)}</div>
                  <div className="product-tile-name">{p.name}</div>
                  <div className="product-tile-price">
                    {formatMoney(p.salePrice)} / {unitLabel(p.unit)}
                  </div>
                  <div className="product-tile-stock">
                    المتاح: {formatQty(p.stockQty)} {unitLabel(p.unit)}
                  </div>
                </button>
              ))}
              {!filtered.length && (
                <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                  <h3>لا توجد منتجات مطابقة</h3>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="cart-panel">
          <div className="cart-header">
            <h2>السلة</h2>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setCart([])}>
                تفريغ
              </Button>
            )}
          </div>

          <div className="cart-items">
            {!cart.length ? (
              <div className="cart-empty">
                <div style={{ fontSize: '2rem' }}>🧺</div>
                <p>اضغط على منتج لإضافته</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.productId} className="cart-line">
                  <div>
                    <div className="cart-line-name">{item.name}</div>
                    <div className="cart-line-meta">
                      {formatQty(item.quantity)} {unitLabel(item.unit)} × {formatMoney(item.unitPrice)}
                    </div>
                  </div>
                  <div>
                    <div className="cart-line-total">{formatMoney(item.lineTotal)}</div>
                    <div className="cart-line-actions">
                      <div className="qty-mini">
                        <button type="button" onClick={() => updateCartQty(item.productId, -1)}>−</button>
                        <span>{formatQty(item.quantity)}</span>
                        <button type="button" onClick={() => updateCartQty(item.productId, 1)}>+</button>
                      </div>
                      <button type="button" className="icon-btn" onClick={() => removeFromCart(item.productId)} title="حذف">
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="cart-footer">
            <button
              type="button"
              className="pos-customer-btn"
              onClick={() => {
                setCustomerSearch('')
                setCustomerOpen(true)
              }}
            >
              <span className="muted">الزبون</span>
              <strong>{customer ? customer.name : 'زبون نقدي'}</strong>
              <span className="pos-customer-caret">▼</span>
            </button>
            {customer && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', marginBottom: 8 }}
                onClick={() => {
                  setCustomer(null)
                  setAmountPaid('')
                }}
              >
                إعادة لزبون نقدي
              </button>
            )}

            <div className="cart-total-row">
              <span className="label">الإجمالي</span>
              <span className="value">{formatMoney(total)}</span>
            </div>

            {customer && (
              <div className="pos-paid-row">
                <label className="field">
                  <span className="field-label">المدفوع الآن</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountPaid === '' ? String(total) : amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                  />
                </label>
                {balancePreview > 0 && (
                  <div className="pos-balance-hint">
                    متبقي على الزبون: <strong>{formatMoney(balancePreview)}</strong>
                  </div>
                )}
              </div>
            )}

            <div className="payment-row">
              <button
                type="button"
                className={`pay-btn ${payment === 'CASH' ? 'active' : ''}`}
                onClick={() => setPayment('CASH')}
              >
                💵 نقداً
              </button>
              <button
                type="button"
                className={`pay-btn ${payment === 'CARD' ? 'active' : ''}`}
                onClick={() => setPayment('CARD')}
              >
                💳 بطاقة / CCP
              </button>
            </div>
            <Button
              variant="success"
              size="lg"
              className="w-full"
              disabled={!cart.length || submitting}
              onClick={() => void handleComplete()}
            >
              {submitting ? 'جاري الحفظ...' : 'إتمام البيع'}
            </Button>
          </div>
        </aside>
      </div>

      <QuickPanel open={!!picker} title="اختيار الكمية" onClose={() => setPicker(null)}>
        {picker && (
          <div className="qty-picker">
            <div className="qty-picker-product">
              <div className="emoji">{productEmoji(picker.name)}</div>
              <h4>{picker.name}</h4>
              <div className="price">
                {formatMoney(picker.salePrice)} / {unitLabel(picker.unit)}
              </div>
              <div className="muted" style={{ marginTop: 4 }}>
                المتاح: {formatQty(picker.stockQty)} {unitLabel(picker.unit)}
              </div>
            </div>

            <div className="qty-controls">
              <button
                type="button"
                onClick={() => {
                  const v = parseFloat(qty.replace(',', '.')) || 0
                  const step = picker.unit === 'KG' ? 0.25 : 1
                  setQty(String(Math.max(step, Math.round((v - step) * 1000) / 1000)))
                }}
              >
                −
              </button>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addToCart()
                }}
                inputMode="decimal"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  const v = parseFloat(qty.replace(',', '.')) || 0
                  const step = picker.unit === 'KG' ? 0.25 : 1
                  setQty(String(Math.round((v + step) * 1000) / 1000))
                }}
              >
                +
              </button>
            </div>

            {picker.unit === 'KG' && (
              <div className="quick-qty">
                {['0.25', '0.5', '0.75', '1', '1.5', '2', '2.5', '3'].map((q) => (
                  <button key={q} type="button" onClick={() => setQty(q)}>
                    {q} كغ
                  </button>
                ))}
              </div>
            )}

            <div className="qty-total">
              الإجمالي:{' '}
              {formatMoney(
                Math.round((parseFloat(qty.replace(',', '.')) || 0) * picker.salePrice * 100) / 100,
              )}
            </div>

            <Button variant="primary" size="lg" className="w-full" onClick={addToCart}>
              إضافة للسلة
            </Button>
          </div>
        )}
      </QuickPanel>

      <QuickPanel open={!!lastSale} title="تم إتمام البيع" onClose={() => setLastSale(null)}>
        {lastSale && (
          <div>
            <div className="success-banner">
              <h3>✅ بيع ناجح</h3>
              <p>
                {lastSale.invoiceNumber} — {formatMoney(lastSale.totalAmount)}
              </p>
              {lastSale.customerName && (
                <p className="muted">الزبون: {lastSale.customerName}</p>
              )}
              {lastSale.balanceDue > 0 && (
                <p style={{ color: '#d97706', fontWeight: 700, marginTop: 6 }}>
                  متبقي: {formatMoney(lastSale.balanceDue)}
                </p>
              )}
            </div>
            <div className="stack-gap">
              {lastSale.items.map((i) => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    {i.productName} · {formatQty(i.quantity)} {unitLabel(i.unit)}
                  </span>
                  <strong>{formatMoney(i.lineTotal)}</strong>
                </div>
              ))}
            </div>
            <div className="form-actions">
              <Button variant="outline" onClick={() => setLastSale(null)}>
                متابعة
              </Button>
              <Button variant="primary" onClick={() => void handlePrint()}>
                طباعة الوصل
              </Button>
            </div>
          </div>
        )}
      </QuickPanel>

      <QuickPanel
        open={customerOpen}
        title="اختيار الزبون"
        onClose={() => setCustomerOpen(false)}
      >
        <div className="stack-gap">
          <input
            className="input"
            placeholder="ابحث عن الزبون..."
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            autoFocus
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setNewCustomerName(customerSearch)
              setNewCustomerPhone('')
              setNewCustomerOpen(true)
            }}
          >
            + إضافة زبون جديد
          </Button>
          <button
            type="button"
            className="pos-customer-option"
            onClick={() => {
              setCustomer(null)
              setAmountPaid('')
              setCustomerOpen(false)
            }}
          >
            <strong>زبون نقدي</strong>
            <span className="muted">بدون رصيد</span>
          </button>
          {customerLoading ? (
            <Spinner label="جاري البحث..." />
          ) : (
            customerResults.map((c) => (
              <button
                key={c.id}
                type="button"
                className="pos-customer-option"
                onClick={() => {
                  setCustomer(c)
                  setAmountPaid(String(total))
                  setCustomerOpen(false)
                }}
              >
                <strong>{c.name}</strong>
                <span className="muted">
                  {c.phone || '—'}
                  {c.balance > 0 ? ` · عليه ${formatMoney(c.balance)}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
      </QuickPanel>

      <QuickPanel
        open={newCustomerOpen}
        title="إضافة زبون جديد"
        onClose={() => setNewCustomerOpen(false)}
      >
        <div className="stack-gap">
          <Input
            label="الاسم الكامل *"
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            autoFocus
          />
          <Input
            label="رقم الهاتف"
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
          />
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setNewCustomerOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={() => void createQuickCustomer()}>
              حفظ واختيار
            </Button>
          </div>
        </div>
      </QuickPanel>
    </div>
  )
}
