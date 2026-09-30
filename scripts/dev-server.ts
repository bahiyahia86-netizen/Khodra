/**
 * HTTP bridge that exposes the same IPC services without Electron.
 * Useful for browser preview while keeping real MySQL logic.
 */
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { register } from 'node:module'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.chdir(path.join(__dirname, '..'))

register('./electron-loader.mjs', pathToFileURL(path.join(__dirname, 'electron-loader.mjs')))

async function main() {
  const { startMySqlServer } = await import('../electron/db/mysql-manager')
  const { runMigrations, dumpDatabase } = await import('../electron/db/migrate')
  const { initPrisma } = await import('../electron/db/prisma')
  const { getBackupsDirectory } = await import('../electron/db/mysql-manager')

  console.log('[dev-server] بدء قاعدة البيانات...')
  // Windows: جرّب MariaDB/MySQL المحلي أولًا · غير ذلك: SQLite فورًا (بدون انتظار)
  process.env.KHODRA_DB =
    process.env.KHODRA_DB || (process.platform === 'win32' ? 'mysql' : 'sqlite')
  const mode = await startMySqlServer()
  console.log('[dev-server] المحرك:', mode)
  await initPrisma()
  console.log('[dev-server] ترحيل الجداول...')
  await runMigrations()

  const auth = await import('../electron/services/auth.service')
  const products = await import('../electron/services/product.service')
  const sales = await import('../electron/services/sale.service')
  const customers = await import('../electron/services/customer.service')
  const purchases = await import('../electron/services/purchase.service')
  const wastage = await import('../electron/services/wastage.service')
  const expenses = await import('../electron/services/expense.service')
  const reports = await import('../electron/services/report.service')
  const settings = await import('../electron/services/settings.service')
  const print = await import('../electron/services/print.service')
  const { getAuditLogs } = await import('../electron/services/audit.service')
  const { EXPENSE_CATEGORIES } = await import('../electron/services/expense.service')

  type AnyFn = (...args: unknown[]) => Promise<unknown>
  const routes: Record<string, AnyFn> = {
    'auth:login': (u, p) => auth.login(String(u), String(p)),
    'auth:logout': () => auth.logout(),
    'auth:session': () => auth.getSession(),
    'auth:changePassword': (a, b) => auth.changePassword(String(a), String(b)),
    'products:list': (opts) => products.listProducts(opts as never),
    'products:get': (id) => products.getProduct(Number(id)),
    'products:create': (input) => products.createProduct(input as never),
    'products:update': (id, input) => products.updateProduct(Number(id), input as never),
    'products:delete': (id) => products.deleteProduct(Number(id)),
    'sales:complete': (input) => sales.completeSale(input as never),
    'sales:list': (opts) => sales.listSales(opts as never),
    'sales:get': (id) => sales.getSale(Number(id)),
    'customers:list': (opts) => customers.listCustomers(opts as never),
    'customers:get': (id) => customers.getCustomer(Number(id)),
    'customers:create': (input) => customers.createCustomer(input as never),
    'customers:update': (id, input) => customers.updateCustomer(Number(id), input as never),
    'customers:delete': (id) => customers.deleteCustomer(Number(id)),
    'customers:pay': (input) => customers.payCustomerBalance(input as never),
    'purchases:create': (input) => purchases.createPurchase(input as never),
    'purchases:list': (opts) => purchases.listPurchases(opts as never),
    'wastage:create': (input) => wastage.createWastage(input as never),
    'wastage:list': (opts) => wastage.listWastage(opts as never),
    'expenses:create': (input) => expenses.createExpense(input as never),
    'expenses:list': (opts) => expenses.listExpenses(opts as never),
    'expenses:delete': (id) => expenses.deleteExpense(Number(id)),
    'expenses:categories': async () => ({ ok: true, data: EXPENSE_CATEGORIES }),
    'reports:daySummary': (date) => reports.getDaySummary(date ? String(date) : undefined),
    'reports:closeDay': (notes) => reports.closeDay(notes ? String(notes) : undefined),
    'reports:closings': (limit) => reports.listClosings(limit ? Number(limit) : undefined),
    'reports:sales': (from, to) => reports.getSalesReport(String(from), String(to)),
    'reports:products': (from, to) =>
      reports.getProductStats(from ? String(from) : undefined, to ? String(to) : undefined),
    'settings:get': () => settings.getSettings(),
    'settings:update': (updates) => settings.updateSettings(updates as never),
    'backup:create': async () => {
      const out = path.join(
        getBackupsDirectory(),
        `backup_${new Date().toISOString().slice(0, 10)}.sql`,
      )
      fs.mkdirSync(path.dirname(out), { recursive: true })
      await dumpDatabase(out)
      return { ok: true, data: { path: out } }
    },
    'backup:restore': async () => ({
      ok: false,
      error: 'الاسترجاع عبر المتصفح غير متاح — استخدم تطبيق سطح المكتب',
    }),
    'print:receipt': async () => ({
      ok: false,
      error: 'الطباعة متاحة في تطبيق سطح المكتب فقط',
    }),
    'print:preview': (id) => print.getReceiptPreview(Number(id)),
    'audit:list': async (limit) => ({ ok: true, data: await getAuditLogs(Number(limit) || 100) }),
    'app:ready': async () => ({ ok: true, data: { ready: true } }),
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (req.method === 'POST' && (req.url === '/api/ipc' || req.url === '/ipc')) {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', async () => {
        try {
          const { channel, args = [] } = JSON.parse(body) as {
            channel: string
            args?: unknown[]
          }
          const handler = routes[channel]
          if (!handler) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: `قناة غير معروفة: ${channel}` }))
            return
          }
          const result = await handler(...args)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(result))
        } catch (err) {
          console.error(err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : 'خطأ',
            }),
          )
        }
      })
      return
    }

    // صفحة توضيحية: هذا المنفذ للـ API فقط — واجهة البرنامج على منفذ Vite
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8" />
<title>خضرة — خادم الـ API</title></head>
<body style="font-family:system-ui,Segoe UI,Tahoma,sans-serif;padding:32px;line-height:1.9">
<h1>خضرة — خادم الـ API يعمل ✅</h1>
<p>هذا المنفذ (<code>${PORT}</code>) مخصص للـ API فقط، وليس لواجهة البرنامج.</p>
<p>افتح واجهة البرنامج على منفذ Vite: <strong>5173</strong>.</p>
<ul><li><a href="/health">/health</a> — فحص الجاهزية</li>
<li><code>POST /api/ipc</code> — قناة الأوامر</li></ul>
</body></html>`)
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        ok: false,
        error: 'NOT_FOUND',
        message: 'المسار غير موجود على خادم الـ API',
        hint: 'واجهة البرنامج تعمل على منفذ Vite (5173)',
      }),
    )
  })

  const PORT = Number(process.env.API_PORT || 8787)
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[dev-server] API جاهز على http://0.0.0.0:${PORT}`)
  })
}

main().catch((err) => {
  console.error('[dev-server] فشل التشغيل:', err)
  process.exit(1)
})
