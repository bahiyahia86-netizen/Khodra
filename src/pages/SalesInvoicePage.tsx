import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
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
  formatDateTime,
  formatMoney,
  formatQty,
  paymentLabel,
  unitLabel,
} from '../lib/api'
import { useToast } from '../lib/toast'
import type { Customer, PaymentMethod, Product, Sale } from '../types'

type InvoiceLine = {
  product: Product
  quantity: number
}

function parseAmount(value: string): number {
  return Number.parseFloat(value.replace(',', '.'))
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function SalesInvoicePage({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [recentSales, setRecentSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [amountPaid, setAmountPaid] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true)
      try {
        const [productsRes, customersRes, salesRes] = await Promise.all([
          api.listProducts({ activeOnly: true }),
          api.listCustomers({ activeOnly: true }),
          api.listSales({ limit: 10 }),
        ])

        if (productsRes.ok && productsRes.data) setProducts(productsRes.data)
        else toast.error(productsRes.error || 'تعذر تحميل المنتجات')

        if (customersRes.ok && customersRes.data) setCustomers(customersRes.data)
        else toast.error(customersRes.error || 'تعذر تحميل الزبائن')

        if (salesRes.ok && salesRes.data) setRecentSales(salesRes.data)
        else toast.error(salesRes.error || 'تعذر تحميل سجل المبيعات')
      } catch {
        toast.error('تعذر الاتصال بقاعدة البيانات')
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    void load()
  }, [load])

  const selectedCustomer = customers.find((customer) => String(customer.id) === customerId)
  const filteredCustomers = useMemo(() => {
    const search = customerSearch.trim().toLocaleLowerCase()
    if (!search) return customers
    const matches = customers.filter(
      (customer) =>
        customer.name.toLocaleLowerCase().includes(search) ||
        (customer.phone || '').toLocaleLowerCase().includes(search),
    )
    if (selectedCustomer && !matches.some((customer) => customer.id === selectedCustomer.id)) {
      return [selectedCustomer, ...matches]
    }
    return matches
  }, [customers, customerSearch, selectedCustomer])
  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLocaleLowerCase()
    if (!search) return products
    return products.filter(
      (product) =>
        product.name.toLocaleLowerCase().includes(search) ||
        (product.barcode || '').toLocaleLowerCase().includes(search),
    )
  }, [products, productSearch])
  const selectedProduct = products.find((product) => String(product.id) === productId)

  const total = useMemo(
    () =>
      roundMoney(
        lines.reduce((sum, line) => sum + line.quantity * line.product.salePrice, 0),
      ),
    [lines],
  )
  const paidValue = amountPaid.trim() === '' ? total : parseAmount(amountPaid)
  const balanceDue = Number.isFinite(paidValue) ? roundMoney(total - paidValue) : total
  const paidInvalid =
    !Number.isFinite(paidValue) || paidValue < 0 || paidValue > total + 0.001

  function resetInvoice() {
    setCustomerId('')
    setCustomerSearch('')
    setProductSearch('')
    setProductId('')
    setQuantity('1')
    setLines([])
    setPaymentMethod('CASH')
    setAmountPaid('')
    setNotes('')
  }

  function addProduct() {
    if (!selectedProduct) {
      toast.error('اختر منتجاً أولاً')
      return
    }
    const qty = roundQuantity(parseAmount(quantity))
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('أدخل كمية صحيحة')
      return
    }
    if (selectedProduct.unit !== 'KG' && !Number.isInteger(qty)) {
      toast.error('الكمية يجب أن تكون عدداً صحيحاً لهذا المنتج')
      return
    }
    if (selectedProduct.stockQty <= 0) {
      toast.error('المنتج غير متوفر في المخزون')
      return
    }

    const currentQuantity =
      lines.find((line) => line.product.id === selectedProduct.id)?.quantity || 0
    const nextQuantity = roundQuantity(currentQuantity + qty)
    if (nextQuantity > selectedProduct.stockQty) {
      toast.error(
        `المخزون المتاح من ${selectedProduct.name}: ${formatQty(selectedProduct.stockQty)} ${unitLabel(selectedProduct.unit)}`,
      )
      return
    }

    setLines((current) => {
      const existing = current.find((line) => line.product.id === selectedProduct.id)
      if (existing) {
        return current.map((line) =>
          line.product.id === selectedProduct.id
            ? { ...line, quantity: nextQuantity }
            : line,
        )
      }
      return [...current, { product: selectedProduct, quantity: qty }]
    })
    setProductSearch('')
    setProductId('')
    setQuantity('1')
  }

  function updateLineQuantity(productIdToUpdate: number, rawValue: string) {
    const value = rawValue === '' ? 0 : roundQuantity(parseAmount(rawValue))
    setLines((current) =>
      current.map((line) =>
        line.product.id === productIdToUpdate
          ? { ...line, quantity: Number.isFinite(value) ? value : 0 }
          : line,
      ),
    )
  }

  function removeLine(productIdToRemove: number) {
    setLines((current) => current.filter((line) => line.product.id !== productIdToRemove))
  }

  function validateInvoice(): number | null {
    if (!customerId || !selectedCustomer) {
      toast.error('اختر الزبون لإصدار الفاتورة')
      return null
    }
    if (!lines.length) {
      toast.error('أضف منتجاً واحداً على الأقل إلى الفاتورة')
      return null
    }
    for (const line of lines) {
      if (
        !(line.quantity > 0) ||
        (line.product.unit !== 'KG' && !Number.isInteger(line.quantity))
      ) {
        toast.error(`أدخل كمية صحيحة للمنتج ${line.product.name}`)
        return null
      }
      if (line.quantity > line.product.stockQty) {
        toast.error(`المخزون غير كافٍ للمنتج ${line.product.name}`)
        return null
      }
    }

    const paid = amountPaid.trim() === '' ? total : parseAmount(amountPaid)
    if (!Number.isFinite(paid) || paid < 0) {
      toast.error('قيمة المبلغ المدفوع غير صالحة')
      return null
    }
    if (paid > total + 0.001) {
      toast.error('المبلغ المدفوع أكبر من إجمالي الفاتورة')
      return null
    }
    return roundMoney(paid)
  }

  async function issueInvoice() {
    if (saving) return
    const paid = validateInvoice()
    if (paid == null) return

    setSaving(true)
    try {
      const result = await api.completeSale({
        customerId: Number(customerId),
        amountPaid: paid,
        paymentMethod,
        notes: notes.trim() || undefined,
        items: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      })
      if (!result.ok || !result.data) {
        toast.error(result.error || 'تعذر إصدار الفاتورة')
        return
      }

      setLastSale(result.data)
      resetInvoice()
      toast.success(
        result.data.balanceDue > 0
          ? `تم حفظ الفاتورة — المتبقي ${formatMoney(result.data.balanceDue)}`
          : 'تم حفظ الفاتورة بنجاح',
      )
      await load(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إصدار الفاتورة')
    } finally {
      setSaving(false)
    }
  }

  async function createCustomer() {
    if (!newCustomerName.trim()) {
      toast.error('اسم الزبون مطلوب')
      return
    }
    setSavingCustomer(true)
    try {
      const result = await api.createCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
      })
      if (!result.ok || !result.data) {
        toast.error(result.error || 'تعذرت إضافة الزبون')
        return
      }
      const createdCustomer = result.data
      setCustomers((current) =>
        [...current.filter((customer) => customer.id !== createdCustomer.id), createdCustomer].sort(
          (first, second) => first.name.localeCompare(second.name, 'ar'),
        ),
      )
      setCustomerId(String(createdCustomer.id))
      setNewCustomerName('')
      setNewCustomerPhone('')
      setNewCustomerOpen(false)
      toast.success('تمت إضافة الزبون واختياره للفاتورة')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذرت إضافة الزبون')
    } finally {
      setSavingCustomer(false)
    }
  }

  async function printSale(saleId: number) {
    try {
      const result = await api.printReceipt(saleId)
      if (!result.ok) toast.error(result.error || 'تعذرت طباعة الوصل')
      else toast.success('تم إرسال الوصل للطباعة')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذرت طباعة الوصل')
    }
  }

  return (
    <div className="invoice-page">
      <PageHeader
        title="فاتورة بيع"
        subtitle="اختر الزبون والمنتجات، ثم أصدر الفاتورة واحفظها دون المرور بنقطة البيع"
        onBack={onBack}
        actions={
          <>
            <Button variant="outline" onClick={resetInvoice} disabled={saving}>
              فاتورة جديدة
            </Button>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}>
              تحديث البيانات
            </Button>
          </>
        }
      />

      {loading ? (
        <Spinner label="جاري تحميل بيانات الفاتورة..." />
      ) : (
        <>
          <div className="invoice-layout">
            <div className="invoice-main">
              <section className="section-card">
                <h3>بيانات الفاتورة والزبون</h3>
                <div className="invoice-customer-row">
                  <Input
                    label="بحث عن زبون"
                    placeholder="الاسم أو رقم الهاتف..."
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                  />
                  <Select
                    label="الزبون *"
                    value={customerId}
                    onChange={(event) => {
                      setCustomerId(event.target.value)
                      setCustomerSearch('')
                    }}
                  >
                    <option value="">اختر الزبون</option>
                    {filteredCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}{customer.phone ? ` — ${customer.phone}` : ''}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="secondary"
                    onClick={() => setNewCustomerOpen(true)}
                    className="invoice-new-customer"
                  >
                    + زبون جديد
                  </Button>
                </div>
                {selectedCustomer ? (
                  <div className="invoice-customer-summary">
                    <span className="invoice-customer-avatar" aria-hidden="true">
                      {selectedCustomer.name.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{selectedCustomer.name}</strong>
                      <span className="muted">
                        {selectedCustomer.phone || 'لا يوجد رقم هاتف'}
                        {selectedCustomer.balance > 0
                          ? ` · رصيد سابق ${formatMoney(selectedCustomer.balance)}`
                          : ''}
                      </span>
                    </div>
                  </div>
                ) : customers.length === 0 ? (
                  <p className="invoice-help-text">لا يوجد زبائن بعد. أضف زبوناً للبدء بإصدار الفاتورة.</p>
                ) : (
                  <p className="invoice-help-text">يجب تحديد الزبون قبل حفظ الفاتورة.</p>
                )}
              </section>

              <section className="section-card">
                <h3>إضافة المنتجات</h3>
                {products.length === 0 ? (
                  <EmptyState
                    title="لا توجد منتجات متاحة للبيع"
                    description="أضف منتجاتك الفعلية من قسم المنتجات، ثم عد إلى الفاتورة."
                  />
                ) : (
                  <>
                    <div className="invoice-product-picker">
                      <Input
                        label="بحث بالاسم أو الباركود"
                        placeholder="اكتب اسم المنتج..."
                        value={productSearch}
                        onChange={(event) => {
                          setProductSearch(event.target.value)
                          setProductId('')
                        }}
                      />
                      <Select
                        label="المنتج"
                        value={productId}
                        onChange={(event) => setProductId(event.target.value)}
                      >
                        <option value="">اختر المنتج</option>
                        {filteredProducts.map((product) => (
                          <option
                            key={product.id}
                            value={product.id}
                            disabled={product.stockQty <= 0}
                          >
                            {product.name} · {formatMoney(product.salePrice)} · المتاح {formatQty(product.stockQty)} {unitLabel(product.unit)}
                          </option>
                        ))}
                      </Select>
                      <Input
                        label="الكمية"
                        type="number"
                        min={selectedProduct?.unit === 'KG' ? '0.001' : '1'}
                        step={selectedProduct?.unit === 'KG' ? '0.001' : '1'}
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                      />
                      <Button
                        variant="primary"
                        onClick={addProduct}
                        disabled={!selectedProduct || selectedProduct.stockQty <= 0}
                        className="invoice-add-product"
                      >
                        + إضافة للفاتورة
                      </Button>
                    </div>
                    {selectedProduct && (
                      <div className="invoice-product-hint">
                        السعر: <strong>{formatMoney(selectedProduct.salePrice)}</strong> / {unitLabel(selectedProduct.unit)}
                        <span>المخزون المتاح: {formatQty(selectedProduct.stockQty)} {unitLabel(selectedProduct.unit)}</span>
                      </div>
                    )}
                  </>
                )}
              </section>

              <section className="section-card">
                <div className="invoice-section-heading">
                  <h3>تفاصيل الفاتورة</h3>
                  {lines.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setLines([])}>
                      تفريغ المنتجات
                    </Button>
                  )}
                </div>
                {lines.length === 0 ? (
                  <EmptyState
                    title="الفاتورة فارغة"
                    description="اختر المنتجات أعلاه لإضافتها إلى الفاتورة."
                  />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table invoice-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>المنتج</th>
                          <th>سعر الوحدة</th>
                          <th>الكمية</th>
                          <th>الإجمالي</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => {
                          const lineTotal = roundMoney(line.quantity * line.product.salePrice)
                          const quantityInvalid =
                            line.quantity <= 0 ||
                            line.quantity > line.product.stockQty ||
                            (line.product.unit !== 'KG' && !Number.isInteger(line.quantity))
                          return (
                            <tr key={line.product.id}>
                              <td>{index + 1}</td>
                              <td>
                                <strong>{line.product.name}</strong>
                                <div className="muted invoice-unit">
                                  {unitLabel(line.product.unit)} · المتاح {formatQty(line.product.stockQty)}
                                </div>
                              </td>
                              <td>{formatMoney(line.product.salePrice)}</td>
                              <td>
                                <input
                                  className={`input invoice-quantity-input ${quantityInvalid ? 'input-error' : ''}`}
                                  aria-label={`كمية ${line.product.name}`}
                                  type="number"
                                  min={line.product.unit === 'KG' ? '0.001' : '1'}
                                  max={line.product.stockQty}
                                  step={line.product.unit === 'KG' ? '0.001' : '1'}
                                  value={line.quantity || ''}
                                  onChange={(event) => updateLineQuantity(line.product.id, event.target.value)}
                                />
                              </td>
                              <td className="strong">{formatMoney(lineTotal)}</td>
                              <td>
                                <button
                                  className="invoice-remove-line"
                                  type="button"
                                  onClick={() => removeLine(line.product.id)}
                                  aria-label={`حذف ${line.product.name} من الفاتورة`}
                                  title="حذف المنتج"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="section-card">
                <h3>ملاحظات الفاتورة</h3>
                <Textarea
                  label="ملاحظات (اختياري)"
                  maxLength={255}
                  placeholder="أضف ملاحظة تظهر مع بيانات البيع..."
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </section>
            </div>

            <aside className="invoice-sidebar">
              <section className="section-card invoice-checkout-card">
                <h3>ملخص وإصدار الفاتورة</h3>
                <div className="invoice-checkout-customer">
                  <span>الزبون</span>
                  <strong>{selectedCustomer?.name || 'لم يتم الاختيار'}</strong>
                </div>
                <div className="invoice-summary-row">
                  <span>عدد الأصناف</span>
                  <strong>{lines.length}</strong>
                </div>
                <div className="invoice-total-row">
                  <span>الإجمالي</span>
                  <strong>{formatMoney(total)}</strong>
                </div>

                <div className="invoice-payment-field">
                  <Input
                    label="المدفوع الآن (اتركه فارغاً لسداد الإجمالي)"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={String(total)}
                    value={amountPaid}
                    onChange={(event) => setAmountPaid(event.target.value)}
                  />
                  {paidInvalid && (
                    <span className="field-error">يجب أن يكون المدفوع بين صفر وإجمالي الفاتورة.</span>
                  )}
                </div>
                <div className={`invoice-due-row ${balanceDue > 0 ? 'is-due' : ''}`}>
                  <span>{balanceDue > 0 ? 'المتبقي على الزبون' : 'المتبقي'}</span>
                  <strong>
                    {Number.isFinite(balanceDue) ? formatMoney(Math.max(0, balanceDue)) : '—'}
                  </strong>
                </div>

                <div className="payment-row invoice-payment-method">
                  <button
                    type="button"
                    className={`pay-btn ${paymentMethod === 'CASH' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('CASH')}
                  >
                    💵 نقداً
                  </button>
                  <button
                    type="button"
                    className={`pay-btn ${paymentMethod === 'CARD' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('CARD')}
                  >
                    💳 بطاقة / CCP
                  </button>
                </div>

                <Button
                  variant="success"
                  size="lg"
                  className="w-full invoice-issue-button"
                  disabled={saving || !lines.length}
                  onClick={() => void issueInvoice()}
                >
                  {saving ? 'جاري حفظ الفاتورة...' : 'إصدار وحفظ الفاتورة'}
                </Button>
                <p className="invoice-save-note">
                  عند الحفظ يُخصم المخزون تلقائياً وتظهر الفاتورة ضمن سجل المبيعات.
                </p>
              </section>
            </aside>
          </div>

          <section className="section-card invoice-history">
            <div className="invoice-section-heading">
              <div>
                <h3>آخر فواتير المبيعات</h3>
                <p className="muted">آخر 10 عمليات محفوظة، وتشمل مبيعات الفاتورة ونقطة البيع.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void load(true)}>
                تحديث السجل
              </Button>
            </div>
            {!recentSales.length ? (
              <EmptyState title="لا توجد مبيعات بعد" description="ستظهر الفواتير المحفوظة هنا." />
            ) : (
              <div className="table-wrap">
                <table className="data-table invoice-history-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>رقم الفاتورة</th>
                      <th>الزبون</th>
                      <th>طريقة الدفع</th>
                      <th>الإجمالي</th>
                      <th>المدفوع</th>
                      <th>المتبقي</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.map((sale) => (
                      <tr key={sale.id}>
                        <td>{formatDateTime(sale.createdAt)}</td>
                        <td className="strong">{sale.invoiceNumber}</td>
                        <td>{sale.customerName || 'زبون نقدي'}</td>
                        <td>{paymentLabel(sale.paymentMethod)}</td>
                        <td className="strong">{formatMoney(sale.totalAmount)}</td>
                        <td>{formatMoney(sale.amountPaid)}</td>
                        <td>
                          {sale.balanceDue > 0 ? (
                            <Badge tone="warning">{formatMoney(sale.balanceDue)}</Badge>
                          ) : (
                            <Badge tone="success">مسدد</Badge>
                          )}
                        </td>
                        <td>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void printSale(sale.id)}
                          >
                            طباعة الوصل
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <QuickPanel
        open={newCustomerOpen}
        title="إضافة زبون للفاتورة"
        onClose={() => setNewCustomerOpen(false)}
      >
        <div className="stack-gap">
          <Input
            label="اسم الزبون"
            value={newCustomerName}
            onChange={(event) => setNewCustomerName(event.target.value)}
            autoFocus
            required
          />
          <Input
            label="رقم الهاتف (اختياري)"
            type="tel"
            value={newCustomerPhone}
            onChange={(event) => setNewCustomerPhone(event.target.value)}
          />
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setNewCustomerOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={() => void createCustomer()} disabled={savingCustomer}>
              {savingCustomer ? 'جاري الحفظ...' : 'حفظ واختيار الزبون'}
            </Button>
          </div>
        </div>
      </QuickPanel>

      <QuickPanel
        open={!!lastSale}
        title="تم إصدار الفاتورة"
        onClose={() => setLastSale(null)}
      >
        {lastSale && (
          <div>
            <div className="success-banner">
              <h3>✅ تم حفظ البيع</h3>
              <p>
                {lastSale.invoiceNumber} — {formatMoney(lastSale.totalAmount)}
              </p>
              {lastSale.customerName && <p className="muted">الزبون: {lastSale.customerName}</p>}
              {lastSale.balanceDue > 0 && (
                <p className="invoice-success-due">المتبقي: {formatMoney(lastSale.balanceDue)}</p>
              )}
            </div>
            <div className="stack-gap">
              {lastSale.items.map((item) => (
                <div key={item.id} className="invoice-success-item">
                  <span>
                    {item.productName} · {formatQty(item.quantity)} {unitLabel(item.unit)}
                  </span>
                  <strong>{formatMoney(item.lineTotal)}</strong>
                </div>
              ))}
            </div>
            <div className="form-actions">
              <Button variant="outline" onClick={() => setLastSale(null)}>
                متابعة
              </Button>
              <Button variant="primary" onClick={() => void printSale(lastSale.id)}>
                طباعة الوصل
              </Button>
            </div>
          </div>
        )}
      </QuickPanel>
    </div>
  )
}
