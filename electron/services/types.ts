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

export interface ProductDTO {
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

export interface CartItemInput {
  productId: number
  quantity: number
}

export interface SaleDTO {
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
  items: SaleItemDTO[]
}

export interface SaleItemDTO {
  id: number
  productId: number
  productName: string
  unit: ProductUnit
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface PurchaseItemInput {
  productId: number
  quantity: number
  unitCost: number
}

export interface PurchaseDTO {
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

export interface ExpenseDTO {
  id: number
  description: string
  amount: number
  category: string
  expenseDate: string
  notes: string | null
  userId: number
  createdAt: string
}

export interface WastageDTO {
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

export interface DailyClosingDTO {
  id: number
  closingDate: string
  totalSales: number
  cashSales: number
  cardSales: number
  totalPurchases: number
  totalExpenses: number
  totalWastage: number
  netAmount: number
  salesCount: number
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
  closing?: DailyClosingDTO
}

export interface ReportRange {
  from: string
  to: string
}

export interface SalesReport {
  totalSales: number
  cashSales: number
  cardSales: number
  salesCount: number
  averageSale: number
  sales: SaleDTO[]
}

export interface ProductStats {
  topSelling: { productId: number; name: string; quantity: number; revenue: number }[]
  leastSelling: { productId: number; name: string; quantity: number; revenue: number }[]
  lowStock: ProductDTO[]
  mostWasted: { productId: number; name: string; quantity: number; cost: number }[]
}

export interface ApiResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseFloat(v) || 0
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber()
  }
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    return parseFloat(String(v)) || 0
  }
  return Number(v) || 0
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000
}
