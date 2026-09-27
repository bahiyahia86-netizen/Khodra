import type { ApiResult } from '../types'

declare global {
  interface Window {
    khodra?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void
      platform: string
    }
  }
}

/** In-browser mock store for development without Electron */
type MockStore = {
  ready: boolean
}

const mockState: MockStore = { ready: false }

async function invokeElectron<T>(channel: string, ...args: unknown[]): Promise<ApiResult<T>> {
  if (window.khodra?.invoke) {
    return (await window.khodra.invoke(channel, ...args)) as ApiResult<T>
  }
  // Fallback: try HTTP bridge if running in web-dev mode
  if (import.meta.env.DEV) {
    try {
      const res = await fetch('/api/ipc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, args }),
      })
      if (res.ok) {
        return (await res.json()) as ApiResult<T>
      }
    } catch {
      // no bridge
    }
  }
  return {
    ok: false,
    error: 'التطبيق غير متصل بمحرك سطح المكتب. شغّل البرنامج عبر Electron.',
  }
}

export const api = {
  invoke: invokeElectron,

  // Auth
  login: (username: string, password: string) =>
    invokeElectron<import('../types').SessionUser>('auth:login', username, password),
  logout: () => invokeElectron('auth:logout'),
  session: () => invokeElectron<import('../types').SessionUser | null>('auth:session'),
  changePassword: (oldP: string, newP: string) =>
    invokeElectron('auth:changePassword', oldP, newP),

  // Products
  listProducts: (opts?: { search?: string; status?: string; activeOnly?: boolean }) =>
    invokeElectron<import('../types').Product[]>('products:list', opts),
  getProduct: (id: number) => invokeElectron<import('../types').Product>('products:get', id),
  createProduct: (input: unknown) =>
    invokeElectron<import('../types').Product>('products:create', input),
  updateProduct: (id: number, input: unknown) =>
    invokeElectron<import('../types').Product>('products:update', id, input),
  deleteProduct: (id: number) => invokeElectron('products:delete', id),

  // Sales
  completeSale: (input: unknown) =>
    invokeElectron<import('../types').Sale>('sales:complete', input),
  listSales: (opts?: unknown) => invokeElectron<import('../types').Sale[]>('sales:list', opts),
  getSale: (id: number) => invokeElectron<import('../types').Sale>('sales:get', id),

  // Customers
  listCustomers: (opts?: { search?: string; status?: string; activeOnly?: boolean }) =>
    invokeElectron<import('../types').Customer[]>('customers:list', opts),
  getCustomer: (id: number) =>
    invokeElectron<import('../types').CustomerDetail>('customers:get', id),
  createCustomer: (input: unknown) =>
    invokeElectron<import('../types').Customer>('customers:create', input),
  updateCustomer: (id: number, input: unknown) =>
    invokeElectron<import('../types').Customer>('customers:update', id, input),
  deleteCustomer: (id: number) =>
    invokeElectron<{ deactivated?: boolean }>('customers:delete', id),
  payCustomer: (input: unknown) =>
    invokeElectron<import('../types').CustomerDetail>('customers:pay', input),

  // Purchases
  createPurchase: (input: unknown) =>
    invokeElectron<import('../types').Purchase>('purchases:create', input),
  listPurchases: (opts?: unknown) =>
    invokeElectron<import('../types').Purchase[]>('purchases:list', opts),

  // Wastage
  createWastage: (input: unknown) =>
    invokeElectron<import('../types').Wastage>('wastage:create', input),
  listWastage: (opts?: unknown) =>
    invokeElectron<import('../types').Wastage[]>('wastage:list', opts),

  // Expenses
  createExpense: (input: unknown) =>
    invokeElectron<import('../types').Expense>('expenses:create', input),
  listExpenses: (opts?: unknown) =>
    invokeElectron<import('../types').Expense[]>('expenses:list', opts),
  deleteExpense: (id: number) => invokeElectron('expenses:delete', id),
  expenseCategories: () => invokeElectron<string[]>('expenses:categories'),

  // Reports
  daySummary: (date?: string) =>
    invokeElectron<import('../types').DaySummary>('reports:daySummary', date),
  closeDay: (notes?: string) => invokeElectron('reports:closeDay', notes),
  listClosings: (limit?: number) => invokeElectron('reports:closings', limit),
  salesReport: (from: string, to: string) =>
    invokeElectron<import('../types').SalesReport>('reports:sales', from, to),
  productStats: (from?: string, to?: string) =>
    invokeElectron<import('../types').ProductStats>('reports:products', from, to),

  // Settings
  getSettings: () => invokeElectron<Record<string, string>>('settings:get'),
  updateSettings: (updates: Record<string, string>) =>
    invokeElectron<Record<string, string>>('settings:update', updates),
  createBackup: () => invokeElectron<{ path: string }>('backup:create'),
  restoreBackup: () => invokeElectron('backup:restore'),

  // Print
  printReceipt: (saleId: number) => invokeElectron('print:receipt', saleId),
  receiptPreview: (saleId: number) => invokeElectron('print:preview', saleId),

  // Audit
  auditLogs: (limit?: number) => invokeElectron('audit:list', limit),

  onShortcut: (cb: (action: string) => void) => {
    if (window.khodra?.on) {
      return window.khodra.on('shortcut', (...args) => cb(String(args[0] ?? '')))
    }
    return () => undefined
  },

  isElectron: () => !!window.khodra?.invoke,
  mockReady: () => mockState.ready,
}

export function unitLabel(unit: string): string {
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

export function formatMoney(n: number, currency = 'دج'): string {
  const formatted = n.toLocaleString('ar-DZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return `${formatted} ${currency}`
}

export function formatQty(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toLocaleString('ar-DZ', { maximumFractionDigits: 3 })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ar-DZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-DZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function reasonLabel(reason: string): string {
  switch (reason) {
    case 'DAMAGED':
      return 'تالف'
    case 'ROTTEN':
      return 'فاسد'
    case 'TRANSPORT':
      return 'تلف أثناء النقل'
    default:
      return 'سبب آخر'
  }
}

export function paymentLabel(method: string): string {
  return method === 'CASH' ? 'نقداً' : 'بطاقة / CCP'
}
