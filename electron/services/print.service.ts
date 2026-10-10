import { BrowserWindow } from 'electron'
import type { RowDataPacket } from 'mysql2'
import { query } from '../db/pool'
import type { ApiResult, SaleDTO } from './types'
import { toNum } from './types'
import { getSale } from './sale.service'

function unitLabel(unit: string): string {
  switch (unit) {
    case 'KG':
      return 'كغ'
    case 'PIECE':
      return 'حبة'
    case 'BOX':
      return 'صندوق'
    default:
      return 'وحدة'
  }
}

function formatMoney(n: number): string {
  return n.toLocaleString('ar-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatQty(n: number): string {
  return n.toLocaleString('ar-DZ', { maximumFractionDigits: 3 })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ar-DZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function getPrintData(saleId: number) {
  const saleRes = await getSale(saleId)
  if (!saleRes.ok || !saleRes.data) throw new Error('الفاتورة غير موجودة')
  const sale = saleRes.data

  const settings = await query<RowDataPacket[]>(`SELECT \`key\`, value FROM settings`)
  const map: Record<string, string> = {}
  for (const s of settings) map[String(s.key)] = String(s.value)

  const shopName = map.shop_name || 'خضرة'
  const shopTagline = map.shop_tagline || 'إدارة محلك ببساطة'
  const shopPhone = map.shop_phone || ''
  const shopAddress = map.shop_address || ''
  const footer = map.receipt_footer || 'شكراً لزيارتكم — خضرة'
  const currency = map.currency || 'دج'
  const printerName = map.printer_name || ''

  const customers = sale.customerId
    ? await query<RowDataPacket[]>(
        `SELECT phone, address FROM customers WHERE id = ?`,
        [sale.customerId],
      )
    : []

  return {
    sale,
    settings: { shopName, shopTagline, shopPhone, shopAddress, footer, currency, printerName },
    customer: customers[0]
      ? { phone: String(customers[0].phone || ''), address: String(customers[0].address || '') }
      : null,
  }
}

function renderItems(sale: SaleDTO, currency: string): string {
  return sale.items
    .map(
      (item) => `
      <tr>
        <td class="item-name">${escapeHtml(item.productName)}</td>
        <td class="item-unit">${escapeHtml(unitLabel(item.unit))}</td>
        <td class="item-quantity">${formatQty(toNum(item.quantity))}</td>
        <td class="number">${formatMoney(toNum(item.unitPrice))} ${escapeHtml(currency)}</td>
        <td class="number">${formatMoney(toNum(item.lineTotal))} ${escapeHtml(currency)}</td>
      </tr>`,
    )
    .join('')
}

export async function buildReceiptHtml(saleId: number): Promise<string> {
  return renderReceiptHtml(await getPrintData(saleId))
}

function renderReceiptHtml({ sale, settings }: Awaited<ReturnType<typeof getPrintData>>): string {
  const { shopName, shopTagline, shopPhone, shopAddress, footer, currency } = settings
  const paymentLabel = sale.paymentMethod === 'CASH' ? 'نقداً' : 'بطاقة / CCP'
  const itemsHtml = renderItems(sale, currency)

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>وصل البيع السريع ${escapeHtml(sale.invoiceNumber)}</title>
<style>
  @page { margin: 4mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Tahoma, Arial, sans-serif;
    width: 72mm;
    font-size: 12px;
    color: #000;
    direction: rtl;
    line-height: 1.45;
  }
  .center { text-align: center; }
  .receipt-header { padding-bottom: 7px; border-bottom: 1px solid #000; }
  .shop-name { font-size: 19px; font-weight: 800; margin-bottom: 2px; }
  .document-type { display: inline-block; margin-top: 7px; padding: 2px 10px; border: 1px solid #000; border-radius: 12px; font-size: 10px; font-weight: 700; }
  .shop-detail { margin-top: 2px; font-size: 10px; }
  .meta { margin: 8px 0; font-size: 10px; line-height: 1.65; }
  .meta-row { display: flex; justify-content: space-between; gap: 5px; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9px; }
  th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 1px; font-size: 8px; }
  td { padding: 4px 1px; vertical-align: top; border-bottom: 1px dotted #777; }
  .item-name { width: 30%; text-align: right; overflow-wrap: anywhere; }
  .item-unit { width: 13%; text-align: center; white-space: nowrap; }
  .item-quantity { width: 11%; text-align: center; white-space: nowrap; }
  .number { width: 23%; text-align: left; white-space: nowrap; direction: ltr; font-size: 8px; }
  .receipt-summary { margin-top: 7px; padding: 6px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
  .total { display: flex; justify-content: space-between; gap: 5px; font-size: 14px; font-weight: 800; }
  .payment { margin-top: 5px; line-height: 1.65; font-size: 10px; }
  .due { font-weight: 800; }
  .footer { margin-top: 9px; text-align: center; font-size: 10px; line-height: 1.5; }
</style>
</head>
<body>
  <header class="receipt-header center">
  <div class="center shop-name">${escapeHtml(shopName)}</div>
  <div class="center shop-detail">${escapeHtml(shopTagline)}</div>
  ${shopAddress ? `<div class="center shop-detail">${escapeHtml(shopAddress)}</div>` : ''}
  ${shopPhone ? `<div class="center shop-detail">${escapeHtml(shopPhone)}</div>` : ''}
  <div class="center document-type">وصل البيع السريع</div>
  </header>
  <div class="meta">
    <div class="meta-row"><span>رقم الوصل</span><strong>${escapeHtml(sale.invoiceNumber)}</strong></div>
    <div class="meta-row"><span>التاريخ</span><span>${escapeHtml(formatDate(sale.createdAt))}</span></div>
    <div class="meta-row"><span>البائع</span><span>${escapeHtml(sale.userName || '')}</span></div>
    ${sale.customerName ? `<div class="meta-row"><span>الزبون</span><span>${escapeHtml(sale.customerName)}</span></div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:right;width:30%">المنتج</th>
        <th style="width:13%">الوحدة</th>
        <th style="width:11%">الكمية</th>
        <th>السعر</th>
        <th>المجموع</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>
  <section class="receipt-summary">
    <div class="total"><span>الإجمالي</span><span>${formatMoney(toNum(sale.totalAmount))} ${escapeHtml(currency)}</span></div>
  </section>
  <div class="payment">
    <div>طريقة الدفع: ${paymentLabel}</div>
    <div>المدفوع: ${formatMoney(toNum(sale.amountPaid))} ${escapeHtml(currency)}</div>
    ${sale.balanceDue > 0 ? `<div class="due">المتبقي: ${formatMoney(toNum(sale.balanceDue))} ${escapeHtml(currency)}</div>` : ''}
  </div>
  <div class="footer">${escapeHtml(footer)}</div>
</body>
</html>`
}

export async function buildInvoiceHtml(saleId: number): Promise<string> {
  return renderInvoiceHtml(await getPrintData(saleId))
}

function renderInvoiceHtml({
  sale,
  settings,
  customer,
}: Awaited<ReturnType<typeof getPrintData>>): string {
  const { shopName, shopTagline, shopPhone, shopAddress, footer, currency } = settings
  const paymentLabel = sale.paymentMethod === 'CASH' ? 'نقداً' : 'بطاقة / CCP'
  const customerDetails = [customer?.phone, customer?.address]
    .filter(Boolean)
    .map((value) => `<div>${escapeHtml(value)}</div>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>فاتورة بيع ${escapeHtml(sale.invoiceNumber)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Tahoma, Arial, sans-serif; color: #17241b; font-size: 12px; line-height: 1.6; }
  .invoice { min-height: 265mm; display: flex; flex-direction: column; }
  .masthead { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid #187447; }
  .shop-name { color: #14532d; font-size: 24px; font-weight: 800; }
  .shop-detail { color: #58675d; }
  .document-title { text-align: left; color: #14532d; font-size: 23px; font-weight: 800; }
  .document-number { margin-top: 5px; font-size: 13px; direction: ltr; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0; }
  .meta-card { border: 1px solid #d7e3da; border-radius: 8px; padding: 12px 14px; min-height: 82px; }
  .meta-label { color: #64746a; font-size: 10px; font-weight: 700; }
  .meta-value { font-size: 13px; font-weight: 700; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead { display: table-header-group; }
  th { padding: 10px 8px; background: #edf5ef; color: #244c34; text-align: right; border-bottom: 1px solid #c9d9ce; font-size: 11px; }
  td { padding: 9px 8px; border-bottom: 1px solid #e4ebe5; vertical-align: top; }
  tbody tr { break-inside: avoid; }
  .number { text-align: left; white-space: nowrap; direction: ltr; }
  .item-name { font-weight: 700; }
  .item-unit { text-align: center; white-space: nowrap; }
  .summary { width: 48%; margin: 18px 0 0 auto; }
  .summary-row { display: flex; justify-content: space-between; gap: 18px; padding: 6px 0; border-bottom: 1px solid #e4ebe5; }
  .summary-total { border: 0; color: #14532d; font-size: 17px; font-weight: 800; }
  .summary-due { color: #a34b00; font-weight: 800; }
  .notes { margin-top: 20px; padding: 12px 14px; background: #f6f9f6; border-right: 3px solid #7ab58e; white-space: pre-wrap; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: auto; padding-top: 42px; }
  .signature { padding-top: 8px; border-top: 1px solid #aab8ad; text-align: center; color: #5f6e63; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #d7e3da; text-align: center; color: #53655a; font-size: 10px; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
  <main class="invoice">
    <header class="masthead">
      <div>
        <div class="shop-name">${escapeHtml(shopName)}</div>
        ${shopTagline ? `<div class="shop-detail">${escapeHtml(shopTagline)}</div>` : ''}
        ${shopAddress ? `<div class="shop-detail">${escapeHtml(shopAddress)}</div>` : ''}
        ${shopPhone ? `<div class="shop-detail">الهاتف: ${escapeHtml(shopPhone)}</div>` : ''}
      </div>
      <div class="document-title">
        فاتورة بيع
        <div class="document-number">${escapeHtml(sale.invoiceNumber)}</div>
      </div>
    </header>

    <section class="meta-grid">
      <div class="meta-card">
        <div class="meta-label">بيانات الزبون</div>
        <div class="meta-value">${escapeHtml(sale.customerName || 'زبون نقدي')}</div>
        ${customerDetails}
      </div>
      <div class="meta-card">
        <div class="meta-label">بيانات الفاتورة</div>
        <div>التاريخ: <strong>${escapeHtml(formatDate(sale.createdAt))}</strong></div>
        <div>البائع: <strong>${escapeHtml(sale.userName || '')}</strong></div>
        <div>طريقة الدفع: <strong>${paymentLabel}</strong></div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th style="width:7%">#</th>
          <th>البيان</th>
          <th style="width:12%;text-align:center">الوحدة</th>
          <th style="width:12%;text-align:left">الكمية</th>
          <th style="width:18%;text-align:left">سعر الوحدة</th>
          <th style="width:18%;text-align:left">المجموع</th>
        </tr>
      </thead>
      <tbody>
        ${sale.items.map((item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td class="item-name">${escapeHtml(item.productName)}</td>
            <td class="item-unit">${escapeHtml(unitLabel(item.unit))}</td>
            <td class="item-quantity">${formatQty(toNum(item.quantity))}</td>
            <td class="number">${formatMoney(toNum(item.unitPrice))} ${escapeHtml(currency)}</td>
            <td class="number">${formatMoney(toNum(item.lineTotal))} ${escapeHtml(currency)}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <section class="summary">
      <div class="summary-row summary-total"><span>إجمالي الفاتورة</span><span>${formatMoney(toNum(sale.totalAmount))} ${escapeHtml(currency)}</span></div>
      <div class="summary-row"><span>المدفوع</span><span>${formatMoney(toNum(sale.amountPaid))} ${escapeHtml(currency)}</span></div>
      <div class="summary-row ${sale.balanceDue > 0 ? 'summary-due' : ''}"><span>المتبقي</span><span>${formatMoney(toNum(sale.balanceDue))} ${escapeHtml(currency)}</span></div>
    </section>
    ${sale.notes ? `<section class="notes"><strong>ملاحظات:</strong> ${escapeHtml(sale.notes)}</section>` : ''}
    <section class="signatures">
      <div class="signature">توقيع الزبون</div>
      <div class="signature">ختم وتوقيع المحل</div>
    </section>
    <footer class="footer">${escapeHtml(footer)}</footer>
  </main>
</body>
</html>`
}

async function printHtml(
  html: string,
  parentWin: BrowserWindow | null,
  isInvoice: boolean,
  printerName: string,
): Promise<void> {
  const printWin = new BrowserWindow({
    width: isInvoice ? 900 : 360,
    height: isInvoice ? 1200 : 700,
    show: false,
    parent: parentWin ?? undefined,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  try {
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    let pageSize: 'A4' | { width: number; height: number } = 'A4'
    if (!isInvoice) {
      const measuredHeight: unknown = await printWin.webContents.executeJavaScript(`
        const height = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        )
        Math.min(2032000, Math.max(60000, Math.ceil(height * 25400 / 96 + 12000)))
      `)
      if (typeof measuredHeight !== 'number' || !Number.isFinite(measuredHeight)) {
        throw new Error('تعذر تحديد طول وصل الطباعة')
      }
      pageSize = { width: 80000, height: measuredHeight }
    }
    await new Promise<void>((resolve, reject) => {
      printWin.webContents.print(
        {
          silent: true,
          printBackground: true,
          pageSize,
          ...(printerName ? { deviceName: printerName } : {}),
        },
        (success, failureReason) => {
          if (!success) reject(new Error(failureReason || 'تعذرت الطباعة'))
          else resolve()
        },
      )
    })
  } finally {
    if (!printWin.isDestroyed()) printWin.close()
  }
}

export async function printReceipt(
  saleId: number,
  parentWin: BrowserWindow | null,
): Promise<ApiResult> {
  try {
    const data = await getPrintData(saleId)
    await printHtml(renderReceiptHtml(data), parentWin, false, data.settings.printerName)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ في الطباعة' }
  }
}

export async function printInvoice(
  saleId: number,
  parentWin: BrowserWindow | null,
): Promise<ApiResult> {
  try {
    const data = await getPrintData(saleId)
    await printHtml(renderInvoiceHtml(data), parentWin, true, data.settings.printerName)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ في الطباعة' }
  }
}

export async function getReceiptPreview(
  saleId: number,
): Promise<ApiResult<{ html: string; sale: SaleDTO }>> {
  try {
    const html = await buildReceiptHtml(saleId)
    const saleRes = await getSale(saleId)
    if (!saleRes.ok || !saleRes.data) return { ok: false, error: 'الفاتورة غير موجودة' }
    return { ok: true, data: { html, sale: saleRes.data } }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}
