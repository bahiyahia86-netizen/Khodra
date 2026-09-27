import { ipcMain, BrowserWindow } from 'electron'
import * as auth from './services/auth.service'
import * as products from './services/product.service'
import * as sales from './services/sale.service'
import * as purchases from './services/purchase.service'
import * as wastage from './services/wastage.service'
import * as expenses from './services/expense.service'
import * as reports from './services/report.service'
import * as settings from './services/settings.service'
import * as print from './services/print.service'
import * as customers from './services/customer.service'
import { getAuditLogs } from './services/audit.service'
import { EXPENSE_CATEGORIES } from './services/expense.service'

type Handler = (win: BrowserWindow | null, ...args: never[]) => Promise<unknown>

const handlers: Record<string, Handler> = {
  // Auth
  'auth:login': async (_w, username: string, password: string) => auth.login(username, password),
  'auth:logout': async () => auth.logout(),
  'auth:session': async () => auth.getSession(),
  'auth:changePassword': async (_w, oldP: string, newP: string) => auth.changePassword(oldP, newP),

  // Products
  'products:list': async (_w, opts?: Parameters<typeof products.listProducts>[0]) =>
    products.listProducts(opts),
  'products:get': async (_w, id: number) => products.getProduct(id),
  'products:create': async (_w, input: Parameters<typeof products.createProduct>[0]) =>
    products.createProduct(input),
  'products:update': async (_w, id: number, input: Parameters<typeof products.updateProduct>[1]) =>
    products.updateProduct(id, input),
  'products:delete': async (_w, id: number) => products.deleteProduct(id),

  // Sales
  'sales:complete': async (_w, input: Parameters<typeof sales.completeSale>[0]) =>
    sales.completeSale(input),
  'sales:list': async (_w, opts?: Parameters<typeof sales.listSales>[0]) => sales.listSales(opts),
  'sales:get': async (_w, id: number) => sales.getSale(id),

  // Customers
  'customers:list': async (_w, opts?: Parameters<typeof customers.listCustomers>[0]) =>
    customers.listCustomers(opts),
  'customers:get': async (_w, id: number) => customers.getCustomer(id),
  'customers:create': async (_w, input: Parameters<typeof customers.createCustomer>[0]) =>
    customers.createCustomer(input),
  'customers:update': async (
    _w,
    id: number,
    input: Parameters<typeof customers.updateCustomer>[1],
  ) => customers.updateCustomer(id, input),
  'customers:delete': async (_w, id: number) => customers.deleteCustomer(id),
  'customers:pay': async (_w, input: Parameters<typeof customers.payCustomerBalance>[0]) =>
    customers.payCustomerBalance(input),

  // Purchases
  'purchases:create': async (_w, input: Parameters<typeof purchases.createPurchase>[0]) =>
    purchases.createPurchase(input),
  'purchases:list': async (_w, opts?: Parameters<typeof purchases.listPurchases>[0]) =>
    purchases.listPurchases(opts),

  // Wastage
  'wastage:create': async (_w, input: Parameters<typeof wastage.createWastage>[0]) =>
    wastage.createWastage(input),
  'wastage:list': async (_w, opts?: Parameters<typeof wastage.listWastage>[0]) =>
    wastage.listWastage(opts),

  // Expenses
  'expenses:create': async (_w, input: Parameters<typeof expenses.createExpense>[0]) =>
    expenses.createExpense(input),
  'expenses:list': async (_w, opts?: Parameters<typeof expenses.listExpenses>[0]) =>
    expenses.listExpenses(opts),
  'expenses:delete': async (_w, id: number) => expenses.deleteExpense(id),
  'expenses:categories': async () => ({ ok: true, data: EXPENSE_CATEGORIES }),

  // Reports
  'reports:daySummary': async (_w, date?: string) => reports.getDaySummary(date),
  'reports:closeDay': async (_w, notes?: string) => reports.closeDay(notes),
  'reports:closings': async (_w, limit?: number) => reports.listClosings(limit),
  'reports:sales': async (_w, from: string, to: string) => reports.getSalesReport(from, to),
  'reports:products': async (_w, from?: string, to?: string) => reports.getProductStats(from, to),

  // Settings & Backup
  'settings:get': async () => settings.getSettings(),
  'settings:update': async (_w, updates: Record<string, string>) => settings.updateSettings(updates),
  'backup:create': async (win) => settings.createBackup(win),
  'backup:restore': async (win) => settings.restoreBackup(win),

  // Print
  'print:receipt': async (win, saleId: number) => print.printReceipt(saleId, win),
  'print:preview': async (_w, saleId: number) => print.getReceiptPreview(saleId),

  // Audit
  'audit:list': async (_w, limit?: number) => ({ ok: true, data: await getAuditLogs(limit) }),

  // App
  'app:ready': async () => ({ ok: true, data: { ready: true } }),
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        const win = getMainWindow()
        // eslint-disable-next-line @typescript-eslint/no-explicit-eslint
        return await (handler as (win: BrowserWindow | null, ...a: unknown[]) => Promise<unknown>)(
          win,
          ...args,
        )
      } catch (err) {
        console.error(`[IPC] ${channel}`, err)
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'خطأ غير متوقع',
        }
      }
    })
  }
}
