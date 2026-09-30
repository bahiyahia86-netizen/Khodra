/**
 * End-to-end smoke test against the real services using an isolated SQLite database.
 */
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { register } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.chdir(path.join(__dirname, '..'))

// Keep test records and backups out of the application database and repository.
const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'khodra-smoke-'))
process.env.KHODRA_TEST_USER_DATA = testDataDirectory
process.env.KHODRA_DB = 'sqlite'

// Resolve 'electron' imports to our shim.
register('./electron-loader.mjs', pathToFileURL(path.join(__dirname, 'electron-loader.mjs')))

async function main() {
  let disconnectDatabase: (() => Promise<void>) | undefined
  let stopDatabase: (() => Promise<void>) | undefined

  try {
    const { startMySqlServer, stopMySqlServer } = await import('../electron/db/mysql-manager')
    const { runMigrations, dumpDatabase } = await import('../electron/db/migrate')
    const { initPrisma, disconnectPrisma } = await import('../electron/db/prisma')
    const auth = await import('../electron/services/auth.service')
    const products = await import('../electron/services/product.service')
    const sales = await import('../electron/services/sale.service')
    const customers = await import('../electron/services/customer.service')
    const purchases = await import('../electron/services/purchase.service')
    const wastage = await import('../electron/services/wastage.service')
    const expenses = await import('../electron/services/expense.service')
    const reports = await import('../electron/services/report.service')
    const database = await import('../electron/db/pool')

    disconnectDatabase = disconnectPrisma
    stopDatabase = stopMySqlServer

    console.log('1) Start isolated database')
    const mode = await startMySqlServer()
    console.log('   engine mode:', mode)
    await initPrisma()
    await runMigrations()

    console.log('2) Login')
    const login = await auth.login('admin', 'admin123')
    if (!login.ok) throw new Error(login.error)
    console.log('   OK', login.data?.fullName)

    console.log('3) Remove untouched legacy sample products and demo cashier')
    await database.execute(`DELETE FROM settings WHERE \`key\` = ?`, [
      'migration_legacy_demo_data_removed_v1',
    ])
    await database.execute(
      `INSERT INTO products (name, unit, purchase_price, sale_price, stock_qty, min_stock, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      ['طماطم', 'KG', 130, 180, 35, 10],
    )
    await database.execute(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES (?, ?, ?, ?)`,
      ['cashier', 'unused-test-hash', 'أمين الصندوق', 'CASHIER'],
    )
    await runMigrations()
    const cleanedProducts = await products.listProducts({ activeOnly: true })
    const remainingCashier = await database.query(
      `SELECT id FROM users WHERE username = 'cashier' AND full_name = 'أمين الصندوق'`,
    )
    if (!cleanedProducts.ok || cleanedProducts.data?.length) {
      throw new Error('legacy sample product was not removed from the empty test catalog')
    }
    if (remainingCashier.length) throw new Error('unused demo cashier was not removed')

    console.log('4) Add a test product')
    const createdProduct = await products.createProduct({
      name: 'منتج اختبار',
      unit: 'KG',
      purchasePrice: 100,
      salePrice: 150,
      stockQty: 20,
      minStock: 1,
    })
    if (!createdProduct.ok || !createdProduct.data) throw new Error(createdProduct.error)
    const product = createdProduct.data
    console.log('   OK', product.name, product.stockQty)

    console.log('5) Purchase + stock increase')
    const purchase = await purchases.createPurchase({
      supplierName: 'مورد اختبار',
      items: [{ productId: product.id, quantity: 5, unitCost: product.purchasePrice }],
    })
    if (!purchase.ok) throw new Error(purchase.error)
    const afterPurchase = await products.getProduct(product.id)
    if (!afterPurchase.ok || !afterPurchase.data) throw new Error(afterPurchase.error)
    const expectedAfterPurchase = 25
    if (afterPurchase.data.stockQty !== expectedAfterPurchase) {
      throw new Error(
        `stock after purchase expected ${expectedAfterPurchase} got ${afterPurchase.data.stockQty}`,
      )
    }
    console.log('   OK stock', product.stockQty, '->', afterPurchase.data.stockQty)

    console.log('6) POS sale + fractional stock decrease')
    const sale = await sales.completeSale({
      items: [{ productId: product.id, quantity: 1.5 }],
      paymentMethod: 'CASH',
    })
    if (!sale.ok || !sale.data) throw new Error(sale.error)
    const afterSale = await products.getProduct(product.id)
    const expectedAfterSale = 23.5
    if (!afterSale.ok || afterSale.data?.stockQty !== expectedAfterSale) {
      throw new Error(`stock after sale expected ${expectedAfterSale} got ${afterSale.data?.stockQty}`)
    }
    console.log('   OK sale', sale.data.invoiceNumber, sale.data.totalAmount)

    console.log('7) Customer invoice + partial payment')
    const customer = await customers.createCustomer({ name: 'زبون اختبار' })
    if (!customer.ok || !customer.data) throw new Error(customer.error)
    const invoice = await sales.completeSale({
      items: [{ productId: product.id, quantity: 1 }],
      paymentMethod: 'CARD',
      customerId: customer.data.id,
      amountPaid: 50,
    })
    if (!invoice.ok || !invoice.data) throw new Error(invoice.error)
    if (invoice.data.amountPaid !== 50 || invoice.data.balanceDue !== 100) {
      throw new Error('invoice partial payment was not recorded correctly')
    }
    console.log('   OK invoice', invoice.data.invoiceNumber, 'due', invoice.data.balanceDue)

    const oversell = await sales.completeSale({
      items: [
        { productId: product.id, quantity: 12 },
        { productId: product.id, quantity: 12 },
      ],
      paymentMethod: 'CASH',
    })
    if (oversell.ok) throw new Error('duplicate invoice rows unexpectedly oversold stock')
    console.log('   OK duplicate product rows are checked against combined stock')

    console.log('8) Wastage')
    const waste = await wastage.createWastage({
      productId: product.id,
      quantity: 0.5,
      reason: 'ROTTEN',
    })
    if (!waste.ok) throw new Error(waste.error)
    console.log('   OK wastage cost', waste.data!.totalCost)

    console.log('9) Expense + reports')
    const expense = await expenses.createExpense({
      description: 'مصروف اختبار',
      amount: 500,
      category: 'أكياس',
    })
    if (!expense.ok) throw new Error(expense.error)
    const day = await reports.getDaySummary()
    if (!day.ok) throw new Error(day.error)
    console.log('   OK day sales', day.data!.totalSales, 'expenses', day.data!.totalExpenses)

    console.log('10) Backup dump')
    const backupPath = path.join(testDataDirectory, 'smoke_backup.sql')
    await dumpDatabase(backupPath)
    const size = fs.statSync(backupPath).size
    if (size < 100) throw new Error('backup too small')
    console.log('   OK backup', size, 'bytes')

    console.log('\n✅ جميع اختبارات المنطق نجحت')
  } finally {
    await disconnectDatabase?.()
    await stopDatabase?.()
    fs.rmSync(testDataDirectory, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('\n❌ فشل الاختبار:', err)
  process.exitCode = 1
})
