import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { createRawConnection } from './mysql-manager'
import {
  execute,
  exportSqliteFile,
  getEngineKind,
  query,
  getSqlite,
} from './pool'
import type { RowDataPacket } from 'mysql2'

const MYSQL_SCHEMA = fs.existsSync(path.join(process.cwd(), 'electron/db/schema-mysql.sql'))
  ? fs.readFileSync(path.join(process.cwd(), 'electron/db/schema-mysql.sql'), 'utf8')
  : ''

// Inline MySQL schema (same as before)
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('ADMIN', 'CASHIER') NOT NULL DEFAULT 'CASHIER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  barcode VARCHAR(50) NULL UNIQUE,
  image_path VARCHAR(500) NULL,
  unit ENUM('KG', 'PIECE', 'BOX', 'OTHER') NOT NULL DEFAULT 'KG',
  purchase_price DECIMAL(12,2) NOT NULL,
  sale_price DECIMAL(12,2) NOT NULL,
  stock_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  min_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_products_name (name),
  INDEX idx_products_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NULL,
  national_id VARCHAR(40) NULL,
  address VARCHAR(255) NULL,
  notes VARCHAR(255) NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_customers_name (name),
  INDEX idx_customers_phone (phone),
  INDEX idx_customers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(30) NOT NULL UNIQUE,
  total_amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method ENUM('CASH', 'CARD') NOT NULL,
  customer_id INT NULL,
  user_id INT NOT NULL,
  notes VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_sales_created (created_at),
  INDEX idx_sales_user (user_id),
  INDEX idx_sales_payment (payment_method),
  INDEX idx_sales_customer (customer_id),
  CONSTRAINT fk_sales_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  sale_id INT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('CASH', 'CARD') NOT NULL,
  notes VARCHAR(255) NULL,
  user_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_customer_payments_customer (customer_id),
  CONSTRAINT fk_cp_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_cp_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_cp_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  unit ENUM('KG', 'PIECE', 'BOX', 'OTHER') NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  INDEX idx_sale_items_sale (sale_id),
  INDEX idx_sale_items_product (product_id),
  CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_name VARCHAR(120) NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  user_id INT NOT NULL,
  notes VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_purchases_created (created_at),
  INDEX idx_purchases_user (user_id),
  CONSTRAINT fk_purchases_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  unit ENUM('KG', 'PIECE', 'BOX', 'OTHER') NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  INDEX idx_purchase_items_purchase (purchase_id),
  INDEX idx_purchase_items_product (product_id),
  CONSTRAINT fk_purchase_items_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_items_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  description VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category VARCHAR(80) NOT NULL,
  expense_date DATE NOT NULL,
  notes VARCHAR(255) NULL,
  user_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_expenses_date (expense_date),
  INDEX idx_expenses_category (category),
  INDEX idx_expenses_user (user_id),
  CONSTRAINT fk_expenses_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wastage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit ENUM('KG', 'PIECE', 'BOX', 'OTHER') NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  total_cost DECIMAL(12,2) NOT NULL,
  reason ENUM('DAMAGED', 'ROTTEN', 'TRANSPORT', 'OTHER') NOT NULL,
  notes VARCHAR(255) NULL,
  user_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_wastage_created (created_at),
  INDEX idx_wastage_product (product_id),
  INDEX idx_wastage_user (user_id),
  CONSTRAINT fk_wastage_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_wastage_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_closings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  closing_date DATE NOT NULL UNIQUE,
  total_sales DECIMAL(12,2) NOT NULL,
  cash_sales DECIMAL(12,2) NOT NULL,
  card_sales DECIMAL(12,2) NOT NULL,
  total_purchases DECIMAL(12,2) NOT NULL,
  total_expenses DECIMAL(12,2) NOT NULL,
  total_wastage DECIMAL(12,2) NOT NULL,
  net_amount DECIMAL(12,2) NOT NULL,
  sales_count INT NOT NULL,
  notes VARCHAR(255) NULL,
  user_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_closings_date (closing_date),
  CONSTRAINT fk_closings_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  \`key\` VARCHAR(80) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  username VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id INT NULL,
  details TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_user (user_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`

const DEFAULT_SETTINGS: Record<string, string> = {
  shop_name: 'خضرة',
  shop_tagline: 'إدارة محلك ببساطة',
  shop_phone: '',
  shop_address: '',
  currency: 'دج',
  receipt_footer: 'شكراً لزيارتكم — خضرة',
  low_stock_alert: 'true',
  shortcuts: JSON.stringify({
    pos: 'F1',
    search: 'F2',
    products: 'F3',
    purchases: 'F4',
    refresh: 'F5',
    close: 'Escape',
    completeSale: 'Control+Enter',
  }),
}

const SEED_PRODUCTS = [
  { name: 'طماطم', unit: 'KG', purchasePrice: 130, salePrice: 180, stockQty: 35, minStock: 10 },
  { name: 'بطاطا', unit: 'KG', purchasePrice: 90, salePrice: 120, stockQty: 80, minStock: 20 },
  { name: 'بصل', unit: 'KG', purchasePrice: 110, salePrice: 140, stockQty: 40, minStock: 10 },
  { name: 'جزر', unit: 'KG', purchasePrice: 120, salePrice: 160, stockQty: 25, minStock: 8 },
  { name: 'خيار', unit: 'KG', purchasePrice: 100, salePrice: 150, stockQty: 20, minStock: 5 },
  { name: 'فلفل', unit: 'KG', purchasePrice: 200, salePrice: 280, stockQty: 15, minStock: 5 },
  { name: 'ثوم', unit: 'KG', purchasePrice: 400, salePrice: 550, stockQty: 10, minStock: 3 },
  { name: 'ليمون', unit: 'KG', purchasePrice: 250, salePrice: 350, stockQty: 12, minStock: 4 },
  { name: 'تفاح', unit: 'KG', purchasePrice: 280, salePrice: 380, stockQty: 30, minStock: 8 },
  { name: 'موز', unit: 'KG', purchasePrice: 220, salePrice: 300, stockQty: 25, minStock: 8 },
  { name: 'برتقال', unit: 'KG', purchasePrice: 180, salePrice: 250, stockQty: 40, minStock: 10 },
  { name: 'عنب', unit: 'KG', purchasePrice: 350, salePrice: 480, stockQty: 18, minStock: 5 },
]

async function seedData(): Promise<void> {
  const users = await query<RowDataPacket[]>('SELECT id FROM users LIMIT 1')
  if (users.length === 0) {
    const hash = await bcrypt.hash('admin123', 10)
    await execute(
      `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`,
      ['admin', hash, 'المدير', 'ADMIN'],
    )
    const cashHash = await bcrypt.hash('cashier123', 10)
    await execute(
      `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`,
      ['cashier', cashHash, 'أمين الصندوق', 'CASHIER'],
    )
    console.log('[DB] مستخدمون افتراضيون: admin/admin123 , cashier/cashier123')
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (getEngineKind() === 'sqlite') {
      await execute(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value])
    } else {
      await execute(`INSERT IGNORE INTO settings (\`key\`, value) VALUES (?, ?)`, [key, value])
    }
  }

  const products = await query<RowDataPacket[]>('SELECT id FROM products LIMIT 1')
  if (products.length === 0) {
    for (const p of SEED_PRODUCTS) {
      await execute(
        `INSERT INTO products (name, unit, purchase_price, sale_price, stock_qty, min_stock, status)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [p.name, p.unit, p.purchasePrice, p.salePrice, p.stockQty, p.minStock],
      )
    }
    console.log('[DB] منتجات تجريبية')
  }
}

async function ensureColumn(
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  try {
    const rows = await query<RowDataPacket[]>(`PRAGMA table_info(${table})`)
    const exists = rows.some((r) => String(r.name) === column)
    if (!exists) {
      await execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      console.log(`[DB] أُضيف العمود ${table}.${column}`)
    }
  } catch (err) {
    // MySQL path
    try {
      await execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      console.log(`[DB] أُضيف العمود ${table}.${column}`)
    } catch {
      // already exists or unsupported
      void err
    }
  }
}

async function upgradeSchema(): Promise<void> {
  // customers + customer_payments created via schema IF NOT EXISTS
  // sales columns for partial payments / customer link
  if (getEngineKind() === 'sqlite') {
    await ensureColumn('sales', 'customer_id', 'INTEGER')
    await ensureColumn('sales', 'amount_paid', 'REAL NOT NULL DEFAULT 0')
    await ensureColumn('sales', 'balance_due', 'REAL NOT NULL DEFAULT 0')
    // Backfill older fully-paid sales
    await execute(
      `UPDATE sales SET amount_paid = total_amount, balance_due = 0
       WHERE amount_paid IS NULL OR (amount_paid = 0 AND balance_due = 0 AND total_amount > 0
         AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = sales.customer_id))`,
    )
    // Safer backfill: if amount_paid is 0 and balance_due is 0 and no customer, treat as fully paid
    await execute(
      `UPDATE sales SET amount_paid = total_amount
       WHERE customer_id IS NULL AND amount_paid = 0 AND balance_due = 0 AND total_amount > 0`,
    )
  } else {
    await ensureColumn('sales', 'customer_id', 'INT NULL')
    await ensureColumn('sales', 'amount_paid', 'DECIMAL(12,2) NOT NULL DEFAULT 0')
    await ensureColumn('sales', 'balance_due', 'DECIMAL(12,2) NOT NULL DEFAULT 0')
  }
}

export async function runMigrations(): Promise<void> {
  if (getEngineKind() === 'sqlite') {
    const schemaPath = path.join(process.cwd(), 'electron/db/schema-sqlite.sql')
    const sql = fs.readFileSync(schemaPath, 'utf8')
    const engine = getSqlite()
    // Run statement-by-statement so CREATE INDEX on new columns
    // doesn't abort the whole script when upgrading an older DB.
    for (const stmt of sql.split(';')) {
      const s = stmt.trim()
      if (!s) continue
      try {
        engine.runRaw(s)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Ignore "already exists" / missing-column index errors; upgradeSchema fixes columns
        if (
          /already exists/i.test(msg) ||
          /duplicate/i.test(msg) ||
          /no such column/i.test(msg)
        ) {
          continue
        }
        console.warn('[DB] sqlite stmt:', msg.slice(0, 120))
      }
    }
    engine.save()
    console.log('[DB] جداول SQLite جاهزة')
    await upgradeSchema()
    // Re-create indexes that may have failed before columns existed
    try {
      engine.runRaw('CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id)')
      engine.runRaw(
        'CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id)',
      )
      engine.runRaw('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)')
      engine.runRaw('CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)')
      engine.save()
    } catch {
      /* ignore */
    }
    await seedData()
    return
  }

  // MySQL path
  const conn = await createRawConnection()
  try {
    await conn.query(SCHEMA_SQL || MYSQL_SCHEMA)
    console.log('[DB] جداول MySQL جاهزة')
  } finally {
    await conn.end()
  }
  await upgradeSchema()
  await seedData()
}

export async function dumpDatabase(outputPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  if (getEngineKind() === 'sqlite') {
    // Prefer .sqlite copy; also write a JSON dump for portability
    const sqliteTarget = outputPath.endsWith('.sql')
      ? outputPath.replace(/\.sql$/, '.sqlite')
      : outputPath
    exportSqliteFile(sqliteTarget)

    // Also write a simple SQL-ish dump for readability
    const tables = [
      'users',
      'products',
      'customers',
      'sales',
      'sale_items',
      'customer_payments',
      'purchases',
      'purchase_items',
      'expenses',
      'wastage',
      'daily_closings',
      'settings',
      'audit_logs',
    ]
    let sql = `-- Khodra SQLite Backup ${new Date().toISOString()}\n-- Binary copy: ${path.basename(sqliteTarget)}\n\n`
    for (const table of tables) {
      const rows = await query<RowDataPacket[]>(`SELECT * FROM ${table}`)
      sql += `-- table ${table} (${rows.length} rows)\n`
      for (const row of rows) {
        sql += `-- ${JSON.stringify(row)}\n`
      }
      sql += '\n'
    }
    fs.writeFileSync(outputPath, sql, 'utf8')
    return
  }

  const conn = await createRawConnection()
  try {
    const tables = [
      'users',
      'products',
      'customers',
      'sales',
      'sale_items',
      'customer_payments',
      'purchases',
      'purchase_items',
      'expenses',
      'wastage',
      'daily_closings',
      'settings',
      'audit_logs',
    ]
    let sql = `-- Khodra Backup\n-- ${new Date().toISOString()}\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`
    for (const table of tables) {
      sql += `DROP TABLE IF EXISTS \`${table}\`;\n`
    }
    sql += '\n' + SCHEMA_SQL + '\n'
    for (const table of tables) {
      const [rows] = await conn.query(`SELECT * FROM \`${table}\``)
      const data = rows as Record<string, unknown>[]
      for (const row of data) {
        const cols = Object.keys(row)
        const vals = cols.map((c) => {
          const v = row[c]
          if (v === null || v === undefined) return 'NULL'
          if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`
          if (typeof v === 'boolean') return v ? '1' : '0'
          if (typeof v === 'number') return String(v)
          return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
        })
        sql += `INSERT INTO \`${table}\` (\`${cols.join('`,`')}\`) VALUES (${vals.join(',')});\n`
      }
      sql += '\n'
    }
    sql += 'SET FOREIGN_KEY_CHECKS=1;\n'
    fs.writeFileSync(outputPath, sql, 'utf8')
  } finally {
    await conn.end()
  }
}

export async function restoreDatabase(sqlPath: string): Promise<void> {
  if (getEngineKind() === 'sqlite') {
    const sqlitePath = sqlPath.endsWith('.sqlite')
      ? sqlPath
      : sqlPath.replace(/\.sql$/, '.sqlite')
    if (!fs.existsSync(sqlitePath)) {
      throw new Error('ملف النسخة الاحتياطية SQLite غير موجود. استخدم ملف .sqlite')
    }
    const { importSqliteFile } = await import('./pool')
    importSqliteFile(sqlitePath)
    return
  }

  const sql = fs.readFileSync(sqlPath, 'utf8')
  const conn = await createRawConnection()
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0')
    await conn.query(sql)
    await conn.query('SET FOREIGN_KEY_CHECKS=1')
  } finally {
    await conn.end()
  }
}
