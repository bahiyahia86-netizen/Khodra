import type { RowDataPacket } from 'mysql2'
import { execute, query } from '../db/pool'
import { requireUser } from './auth.service'
import { logAudit } from './audit.service'
import type { ApiResult, ProductDTO, ProductStatus, ProductUnit } from './types'
import { toNum } from './types'

function mapProduct(p: RowDataPacket): ProductDTO {
  return {
    id: Number(p.id),
    name: String(p.name),
    barcode: (p.barcode as string | null) ?? null,
    imagePath: (p.imagePath as string | null) ?? null,
    unit: p.unit as ProductUnit,
    purchasePrice: toNum(p.purchasePrice),
    salePrice: toNum(p.salePrice),
    stockQty: toNum(p.stockQty),
    minStock: toNum(p.minStock),
    status: p.status as ProductStatus,
    createdAt: new Date(p.createdAt as Date).toISOString(),
    updatedAt: new Date(p.updatedAt as Date).toISOString(),
  }
}

const SELECT_PRODUCT = `
  SELECT id, name, barcode, image_path AS imagePath, unit,
         purchase_price AS purchasePrice, sale_price AS salePrice,
         stock_qty AS stockQty, min_stock AS minStock, status,
         created_at AS createdAt, updated_at AS updatedAt
  FROM products`

export interface ProductInput {
  name: string
  barcode?: string | null
  imagePath?: string | null
  unit: ProductUnit
  purchasePrice: number
  salePrice: number
  stockQty?: number
  minStock?: number
  status?: ProductStatus
}

function validateProduct(input: ProductInput): string | null {
  if (!input.name?.trim()) return 'اسم المنتج مطلوب'
  if (!Number.isFinite(Number(input.purchasePrice)) || Number(input.purchasePrice) < 0) {
    return 'سعر الشراء غير صالح'
  }
  if (!Number.isFinite(Number(input.salePrice)) || Number(input.salePrice) < 0) {
    return 'سعر البيع غير صالح'
  }
  if (
    input.stockQty !== undefined &&
    (!Number.isFinite(Number(input.stockQty)) || Number(input.stockQty) < 0)
  ) {
    return 'الكمية غير صالحة'
  }
  if (
    input.minStock !== undefined &&
    (!Number.isFinite(Number(input.minStock)) || Number(input.minStock) < 0)
  ) {
    return 'الحد الأدنى غير صالح'
  }
  if (!['KG', 'PIECE', 'BOX', 'OTHER'].includes(input.unit)) return 'وحدة غير صالحة'
  return null
}

export async function listProducts(opts?: {
  search?: string
  status?: ProductStatus | 'ALL'
  activeOnly?: boolean
}): Promise<ApiResult<ProductDTO[]>> {
  try {
    const where: string[] = []
    const params: unknown[] = []
    if (opts?.activeOnly || opts?.status === 'ACTIVE') {
      where.push(`status = 'ACTIVE'`)
    } else if (opts?.status && opts.status !== 'ALL') {
      where.push(`status = ?`)
      params.push(opts.status)
    }
    if (opts?.search?.trim()) {
      where.push(`(name LIKE ? OR barcode LIKE ?)`)
      const q = `%${opts.search.trim()}%`
      params.push(q, q)
    }
    const sql = `${SELECT_PRODUCT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name ASC`
    const rows = await query<RowDataPacket[]>(sql, params)
    return { ok: true, data: rows.map(mapProduct) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function getProduct(id: number): Promise<ApiResult<ProductDTO>> {
  try {
    const rows = await query<RowDataPacket[]>(`${SELECT_PRODUCT} WHERE id = ?`, [id])
    if (!rows[0]) return { ok: false, error: 'المنتج غير موجود' }
    return { ok: true, data: mapProduct(rows[0]) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function createProduct(input: ProductInput): Promise<ApiResult<ProductDTO>> {
  try {
    const user = requireUser()
    const err = validateProduct(input)
    if (err) return { ok: false, error: err }

    const result = await execute(
      `INSERT INTO products (name, barcode, image_path, unit, purchase_price, sale_price, stock_qty, min_stock, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name.trim(),
        input.barcode?.trim() || null,
        input.imagePath || null,
        input.unit,
        input.purchasePrice,
        input.salePrice,
        input.stockQty ?? 0,
        input.minStock ?? 0,
        input.status ?? 'ACTIVE',
      ],
    )
    await logAudit(user, 'إضافة منتج', 'product', result.insertId, input.name.trim())
    return getProduct(result.insertId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'خطأ'
    if (msg.includes('Duplicate') || msg.includes('UNIQUE')) {
      return { ok: false, error: 'الباركود مستخدم مسبقاً' }
    }
    return { ok: false, error: msg }
  }
}

export async function updateProduct(
  id: number,
  input: Partial<ProductInput>,
): Promise<ApiResult<ProductDTO>> {
  try {
    const user = requireUser()
    const existingRes = await getProduct(id)
    if (!existingRes.ok || !existingRes.data) return { ok: false, error: 'المنتج غير موجود' }
    const existing = existingRes.data

    const merged: ProductInput = {
      name: input.name ?? existing.name,
      barcode: input.barcode !== undefined ? input.barcode : existing.barcode,
      imagePath: input.imagePath !== undefined ? input.imagePath : existing.imagePath,
      unit: input.unit ?? existing.unit,
      purchasePrice: input.purchasePrice ?? existing.purchasePrice,
      salePrice: input.salePrice ?? existing.salePrice,
      stockQty: input.stockQty ?? existing.stockQty,
      minStock: input.minStock ?? existing.minStock,
      status: input.status ?? existing.status,
    }
    const err = validateProduct(merged)
    if (err) return { ok: false, error: err }

    await execute(
      `UPDATE products SET name=?, barcode=?, image_path=?, unit=?, purchase_price=?, sale_price=?,
       stock_qty=?, min_stock=?, status=? WHERE id=?`,
      [
        merged.name.trim(),
        merged.barcode?.trim() || null,
        merged.imagePath || null,
        merged.unit,
        merged.purchasePrice,
        merged.salePrice,
        merged.stockQty,
        merged.minStock,
        merged.status,
        id,
      ],
    )
    await logAudit(user, 'تعديل منتج', 'product', id, merged.name)
    return getProduct(id)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}

export async function deleteProduct(id: number): Promise<ApiResult> {
  try {
    const user = requireUser()
    const existingRes = await getProduct(id)
    if (!existingRes.ok || !existingRes.data) return { ok: false, error: 'المنتج غير موجود' }

    const [sales] = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM sale_items WHERE product_id = ?`,
      [id],
    )
    const [purchases] = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM purchase_items WHERE product_id = ?`,
      [id],
    )
    const [wastage] = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM wastage WHERE product_id = ?`,
      [id],
    )
    const total = Number(sales.c) + Number(purchases.c) + Number(wastage.c)

    if (total > 0) {
      await execute(`UPDATE products SET status='INACTIVE' WHERE id=?`, [id])
      await logAudit(user, 'تعطيل منتج', 'product', id, existingRes.data.name)
      return { ok: true }
    }

    await execute(`DELETE FROM products WHERE id=?`, [id])
    await logAudit(user, 'حذف منتج', 'product', id, existingRes.data.name)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ' }
  }
}
