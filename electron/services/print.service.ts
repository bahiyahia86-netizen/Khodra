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

export async function buildReceiptHtml(saleId: number): Promise<string> {
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

  const paymentLabel = sale.paymentMethod === 'CASH' ? 'نقداً' : 'بطاقة / CCP'
  const customerLine = sale.customerName
    ? `<div>الزبون: ${sale.customerName}</div>`
    : ''
  const paidLine =
    sale.amountPaid != null
      ? `<div>المدفوع: ${formatMoney(toNum(sale.amountPaid))} ${currency}</div>`
      : ''
  const dueLine =
    sale.balanceDue && sale.balanceDue > 0
      ? `<div>المتبقي: ${formatMoney(toNum(sale.balanceDue))} ${currency}</div>`
      : ''
  const itemsHtml = sale.items
    .map(
      (i) => `
      <tr>
        <td style="text-align:right">${i.productName}</td>
        <td style="text-align:center">${toNum(i.quantity)} ${unitLabel(i.unit)}</td>
        <td style="text-align:left">${formatMoney(toNum(i.unitPrice))}</td>
        <td style="text-align:left">${formatMoney(toNum(i.lineTotal))}</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>وصل ${sale.invoiceNumber}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', 'Tahoma', sans-serif;
    width: 72mm;
    font-size: 12px;
    color: #000;
    direction: rtl;
  }
  .center { text-align: center; }
  .shop-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .meta { margin: 8px 0; font-size: 11px; line-height: 1.5; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { border-bottom: 1px solid #000; padding: 3px 0; font-size: 10px; }
  td { padding: 3px 0; vertical-align: top; }
  .total { font-size: 14px; font-weight: 700; margin-top: 6px; }
  .footer { margin-top: 12px; text-align: center; font-size: 11px; }
</style>
</head>
<body>
  <div class="center shop-name">${shopName}</div>
  <div class="center" style="font-size:11px;margin-bottom:6px;opacity:.8">${shopTagline}</div>
  ${shopAddress ? `<div class="center">${shopAddress}</div>` : ''}
  ${shopPhone ? `<div class="center">${shopPhone}</div>` : ''}
  <div class="divider"></div>
  <div class="meta">
    <div>رقم الوصل: <strong>${sale.invoiceNumber}</strong></div>
    <div>التاريخ: ${formatDate(sale.createdAt)}</div>
    <div>البائع: ${sale.userName || ''}</div>
    ${customerLine}
    <div>الدفع: ${paymentLabel}</div>
    ${paidLine}
    ${dueLine}
  </div>
  <div class="divider"></div>
  <table>
    <thead>
      <tr>
        <th style="text-align:right">المنتج</th>
        <th>الكمية</th>
        <th style="text-align:left">السعر</th>
        <th style="text-align:left">المجموع</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>
  <div class="divider"></div>
  <div class="total center">الإجمالي: ${formatMoney(toNum(sale.totalAmount))} ${currency}</div>
  <div class="footer">${footer}</div>
</body>
</html>`
}

export async function printReceipt(
  saleId: number,
  parentWin: BrowserWindow | null,
): Promise<ApiResult> {
  try {
    const html = await buildReceiptHtml(saleId)
    const printWin = new BrowserWindow({
      width: 320,
      height: 600,
      show: false,
      parent: parentWin ?? undefined,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    await new Promise<void>((resolve, reject) => {
      printWin.webContents.print(
        { silent: false, printBackground: true },
        (success, failureReason) => {
          if (!success && failureReason) reject(new Error(failureReason))
          else resolve()
        },
      )
    })

    printWin.close()
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
