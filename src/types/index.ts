export type UserRole = 'ADMIN' | 'CASHIER'
export type ProductUnit = 'KG' | 'PIECE' | 'BOX' | 'OTHER'
export type ProductStatus = 'ACTIVE' | 'INACTIVE'
export type PaymentMethod = 'CASH' | 'CARD'
export type WastageReason = 'DAMAGED' | 'ROTTEN' | 'TRANSPORT' | 'OTHER'

export interface SessionUser {
  id: number
  username: string
  fullName: string
  role: UserRole
}

export interface Product {
  id: number
  name: string
  barcode: string | null
  imagePath: string | null
  unit: ProductUnit
  purchasePrice: number
  salePrice: number
  stockQty: number
  minStock: number
  status: ProductStatus
  createdAt: string
  updatedAt: string
}

export interface CartItem {
  productId: number
  name: string
  unit: ProductUnit
  unitPrice: number
  quantity: number
  stockQty: number
  lineTotal: number
}

export interface CompleteSaleInput {
  items: { productId: number; quantity: number }[]
  paymentMethod: PaymentMethod
  notes?: string
  customerId?: number | null
  amountPaid?: number
}

export interface Sale {
  id: number
  invoiceNumber: string
  totalAmount: number
  amountPaid: number
  balanceDue: number
  paymentMethod: PaymentMethod
  customerId: number | null
  customerName?: string | null
  userId: number
  userName?: string
  notes: string | null
  createdAt: string
  items: {
    id: number
    productId: number
    productName: string
    unit: ProductUnit
    quantity: number
    unitPrice: number
    lineTotal: number
  }[]
}

export type CustomerStatus = 'ACTIVE' | 'INACTIVE'

export interface Customer {
  id: number
  name: string
  phone: string | null
  nationalId: string | null
  address: string | null
  notes: string | null
  status: CustomerStatus
  createdAt: string
  updatedAt: string
  salesCount: number
  totalPurchases: number
  totalPaid: number
  balance: number
  lastSaleAt: string | null
}

export interface CustomerDetail extends Customer {
  sales: {
    id: number
    invoiceNumber: string
    totalAmount: number
    amountPaid: number
    balanceDue: number
    paymentMethod: PaymentMethod
    createdAt: string
  }[]
  payments: {
    id: number
    amount: number
    paymentMethod: PaymentMethod
    notes: string | null
    saleId: number | null
    createdAt: string
  }[]
}

export interface Purchase {
  id: number
  supplierName: string | null
  totalAmount: number
  userId: number
  notes: string | null
  createdAt: string
  items: {
    id: number
    productId: number
    productName: string
    unit: ProductUnit
    quantity: number
    unitCost: number
    lineTotal: number
  }[]
}

export interface Expense {
  id: number
  description: string
  amount: number
  category: string
  expenseDate: string
  notes: string | null
  userId: number
  createdAt: string
}

export interface Wastage {
  id: number
  productId: number
  productName: string
  quantity: number
  unit: ProductUnit
  unitCost: number
  totalCost: number
  reason: WastageReason
  notes: string | null
  userId: number
  createdAt: string
}

export interface DaySummary {
  totalSales: number
  cashSales: number
  cardSales: number
  salesCount: number
  totalPurchases: number
  totalExpenses: number
  totalWastage: number
  netAmount: number
  isClosed: boolean
}

export interface SalesReport {
  totalSales: number
  cashSales: number
  cardSales: number
  salesCount: number
  averageSale: number
  sales: Sale[]
}

export interface ProductStats {
  topSelling: { productId: number; name: string; quantity: number; revenue: number }[]
  leastSelling: { productId: number; name: string; quantity: number; revenue: number }[]
  lowStock: Product[]
  mostWasted: { productId: number; name: string; quantity: number; cost: number }[]
}

export interface ApiResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export type PageId =
  | 'home'
  | 'pos'
  | 'invoice'
  | 'products'
  | 'purchases'
  | 'wastage'
  | 'expenses'
  | 'reports'
  | 'settings'
  | 'close-day'
  | 'customers'
