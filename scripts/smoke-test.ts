/**
 * End-to-end smoke test against real MySQL services (no UI).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.chdir(path.join(__dirname, '..'))

// Resolve 'electron' imports to our shim
register('./electron-loader.mjs', pathToFileURL(path.join(__dirname, 'electron-loader.mjs')))

async function main() {
  const { startMySqlServer, stopMySqlServer } = await import('../electron/db/mysql-manager')
  const { runMigrations, dumpDatabase } = await import('../electron/db/migrate')
  const { initPrisma, disconnectPrisma } = await import('../electron/db/prisma')
  const auth = await import('../electron/services/auth.service')
  const products = await import('../electron/services/product.service')
  const sales = await import('../electron/services/sale.service')
  const purchases = await import('../electron/services/purchase.service')
  const wastage = await import('../electron/services/wastage.service')
  const expenses = await import('../electron/services/expense.service')
  const reports = await import('../electron/services/report.service')
  const fs = await import('node:fs')

  console.log('1) Start database')
  process.env.KHODRA_DB = process.env.KHODRA_DB || 'sqlite'
  const mode = await startMySqlServer()
  console.log('   engine mode:', mode)
  await initPrisma()
  await runMigrations()

  console.log('2) Login')
  const login = await auth.login('admin', 'admin123')
  if (!login.ok) throw new Error(login.error)
  console.log('   OK', login.data?.fullName)

  console.log('3) List products')
  const list = await products.listProducts({ activeOnly: true })
  if (!list.ok || !list.data?.length) throw new Error('no products')
  const tomato = list.data.find((p) => p.name.includes('طماطم')) || list.data[0]
  console.log('   OK', list.data.length, 'products, sample:', tomato.name, tomato.stockQty)

  console.log('4) Purchase + stock increase')
  const before = tomato.stockQty
  const purchase = await purchases.createPurchase({
    supplierName: 'مورد تجريبي',
    items: [{ productId: tomato.id, quantity: 5, unitCost: tomato.purchasePrice }],
  })
  if (!purchase.ok) throw new Error(purchase.error)
  const afterPurchase = await products.getProduct(tomato.id)
  if (!afterPurchase.ok) throw new Error(afterPurchase.error)
  const expectedAfterPurchase = Math.round((before + 5) * 1000) / 1000
  if (afterPurchase.data!.stockQty !== expectedAfterPurchase) {
    throw new Error(
      `stock after purchase expected ${expectedAfterPurchase} got ${afterPurchase.data!.stockQty}`,
    )
  }
  console.log('   OK stock', before, '->', afterPurchase.data!.stockQty)

  console.log('5) Sale + stock decrease (fractional)')
  const sale = await sales.completeSale({
    items: [{ productId: tomato.id, quantity: 1.5 }],
    paymentMethod: 'CASH',
  })
  if (!sale.ok) throw new Error(sale.error)
  const afterSale = await products.getProduct(tomato.id)
  const expectedAfterSale = Math.round((expectedAfterPurchase - 1.5) * 1000) / 1000
  if (afterSale.data!.stockQty !== expectedAfterSale) {
    throw new Error(`stock after sale expected ${expectedAfterSale} got ${afterSale.data!.stockQty}`)
  }
  console.log(
    '   OK sale',
    sale.data!.invoiceNumber,
    sale.data!.totalAmount,
    'stock',
    afterSale.data!.stockQty,
  )

  console.log('6) Wastage')
  const waste = await wastage.createWastage({
    productId: tomato.id,
    quantity: 0.5,
    reason: 'ROTTEN',
  })
  if (!waste.ok) throw new Error(waste.error)
  console.log('   OK wastage cost', waste.data!.totalCost)

  console.log('7) Expense')
  const exp = await expenses.createExpense({
    description: 'أكياس تجريبية',
    amount: 500,
    category: 'أكياس',
  })
  if (!exp.ok) throw new Error(exp.error)
  console.log('   OK expense', exp.data!.amount)

  console.log('8) Reports')
  const day = await reports.getDaySummary()
  if (!day.ok) throw new Error(day.error)
  console.log('   OK day sales', day.data!.totalSales, 'expenses', day.data!.totalExpenses)

  console.log('9) Backup dump')
  const backupPath = path.join(process.cwd(), 'backups', 'smoke_backup.sql')
  fs.mkdirSync(path.dirname(backupPath), { recursive: true })
  await dumpDatabase(backupPath)
  const size = fs.statSync(backupPath).size
  if (size < 100) throw new Error('backup too small')
  console.log('   OK backup', size, 'bytes')

  await disconnectPrisma()
  await stopMySqlServer()
  console.log('\n✅ جميع اختبارات المنطق نجحت')
}

main().catch(async (err) => {
  console.error('\n❌ فشل الاختبار:', err)
  process.exit(1)
})
