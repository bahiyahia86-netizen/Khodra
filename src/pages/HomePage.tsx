import { useEffect, useState, type ReactNode } from 'react'
import { api, formatMoney, formatQty, unitLabel } from '../lib/api'
import type { DaySummary, PageId, Sale } from '../types'

const NAV_TOP: {
  id: PageId
  title: string
  desc: string
  tone: string
  icon: ReactNode
}[] = [
  {
    id: 'pos',
    title: 'البيع',
    desc: 'إتمام عمليات البيع وإدارة السلة',
    tone: 'green',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="28" height="28">
        <circle cx="9" cy="20" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="18" cy="20" r="1.5" fill="currentColor" stroke="none" />
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.5L21 8H7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'products',
    title: 'المنتجات',
    desc: 'إدارة المنتجات والأسعار',
    tone: 'amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="28" height="28">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" strokeLinejoin="round" />
        <path d="M3.3 7 12 12l8.7-5M12 22V12" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'purchases',
    title: 'المشتريات',
    desc: 'إضافة البضاعة من الموردين',
    tone: 'blue',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="28" height="28">
        <path d="M3 17h13v-6H3zM16 17h4l1-4h-5z" strokeLinejoin="round" />
        <circle cx="7.5" cy="18.5" r="1.5" />
        <circle cx="17.5" cy="18.5" r="1.5" />
        <path d="M3 11V8h8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'wastage',
    title: 'الهالك',
    desc: 'تسجيل الكميات التالفة',
    tone: 'red',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="28" height="28">
        <path d="M4 7h16M9 7V5h6v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

const NAV_BOTTOM: typeof NAV_TOP = [
  {
    id: 'customers',
    title: 'الزبائن',
    desc: 'إدارة الزبائن والأرصدة',
    tone: 'indigo',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="28" height="28">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" />
        <circle cx="9" cy="7" r="3" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'expenses',
    title: 'المصاريف',
    desc: 'تسجيل المصاريف اليومية',
    tone: 'purple',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="28" height="28">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M8 14h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'reports',
    title: 'التقارير',
    desc: 'عرض التقارير والإحصائيات',
    tone: 'cyan',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="28" height="28">
        <path d="M4 19V5M4 19h16" strokeLinecap="round" />
        <path d="M8 16v-5M12 16V8M16 16v-3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'settings',
    title: 'الإعدادات',
    desc: 'إعدادات النظام والمحل',
    tone: 'slate',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="28" height="28">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
      </svg>
    ),
  },
]

const PRODUCT_EMOJI: Record<string, string> = {
  طماطم: '🍅',
  بطاطا: '🥔',
  بصل: '🧅',
  جزر: '🥕',
  خيار: '🥒',
  فلفل: '🌶️',
  ثوم: '🧄',
  ليمون: '🍋',
  تفاح: '🍎',
  موز: '🍌',
  برتقال: '🍊',
  عنب: '🍇',
}

function emojiFor(name: string): string {
  for (const [k, v] of Object.entries(PRODUCT_EMOJI)) {
    if (name.includes(k)) return v
  }
  return '🥬'
}

function arabicDate(d = new Date()): string {
  const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  const months = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ]
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function HomePage({
  onNavigate,
}: {
  onNavigate: (page: PageId) => void
}) {
  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [recent, setRecent] = useState<Sale[]>([])

  useEffect(() => {
    void (async () => {
      const [dayRes, salesRes] = await Promise.all([
        api.daySummary(),
        api.listSales({ limit: 5 }),
      ])
      if (dayRes.ok && dayRes.data) setSummary(dayRes.data)
      if (salesRes.ok && salesRes.data) setRecent(salesRes.data.slice(0, 3))
    })()
  }, [])

  const net = summary?.netAmount ?? 0
  const expenses = summary?.totalExpenses ?? 0
  const purchases = summary?.totalPurchases ?? 0
  const salesCount = summary?.salesCount ?? 0

  return (
    <div className="home-screen">
      {/* Decorative leaves */}
      <div className="home-bg-leaves" aria-hidden />
      <div className="home-bg-glow" aria-hidden />

      {/* Watermark */}
      <div className="home-watermark" aria-hidden>
        خُضرة … لمحلك اليومي
      </div>

      {/* Hero */}
      <div className="home-hero-block">
        <h1>
          مرحباً بك في <span className="brand-hero-name">خضرة</span>{' '}
          <span className="leaf-inline" aria-hidden>
            🌿
          </span>
        </h1>
        <p>إدارة محلك ببساطة — اختر القسم الذي تريد العمل عليه</p>
      </div>

      {/* Nav cards */}
      <div className="home-nav-area">
        <div className="home-nav-row home-nav-row-4">
          {NAV_TOP.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`home-nav-card tone-${item.tone}`}
              onClick={() => onNavigate(item.id)}
            >
              <div className="home-nav-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
              <span className="home-nav-arrow" aria-hidden>
                ←
              </span>
            </button>
          ))}
        </div>
        <div className="home-nav-row home-nav-row-4">
          {NAV_BOTTOM.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`home-nav-card tone-${item.tone}`}
              onClick={() => onNavigate(item.id)}
            >
              <div className="home-nav-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
              <span className="home-nav-arrow" aria-hidden>
                ←
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Vegetable hero image */}
      <img
        className="home-veggies"
        src="/images/veggies-hero.png"
        alt=""
        draggable={false}
      />

      {/* Bottom dashboard strip */}
      <div className="home-bottom-bar">
        <div className="home-stats-panel">
          <div className="home-panel-title home-panel-title-row">
            <span>
              <span className="panel-ico">📅</span>
              أرقام اليوم
            </span>
            <button
              type="button"
              className="home-close-day-link"
              onClick={() => onNavigate('close-day')}
            >
              إغلاق اليوم
            </button>
          </div>
          <div className="home-stats-grid">
            <div className="home-stat">
              <div className="home-stat-label">صافي المبيعات</div>
              <div className="home-stat-value green">
                <span className="stat-ico">💰</span>
                {formatMoney(net)}
              </div>
            </div>
            <div className="home-stat">
              <div className="home-stat-label">المصاريف</div>
              <div className="home-stat-value red">
                <span className="stat-ico">🗑️</span>
                {formatMoney(expenses)}
              </div>
            </div>
            <div className="home-stat">
              <div className="home-stat-label">المشتريات</div>
              <div className="home-stat-value blue">
                <span className="stat-ico">🚚</span>
                {formatMoney(purchases)}
              </div>
            </div>
            <div className="home-stat">
              <div className="home-stat-label">عدد العمليات</div>
              <div className="home-stat-value slate">
                <span className="stat-ico">🛒</span>
                {salesCount}
              </div>
            </div>
          </div>
        </div>

        <div className="home-recent-panel">
          <div className="home-panel-title">
            <span className="panel-ico">🕐</span>
            آخر المبيعات
          </div>
          <div className="home-recent-list">
            {recent.length === 0 ? (
              <div className="home-recent-empty">لا مبيعات بعد اليوم</div>
            ) : (
              recent.map((sale) => {
                const first = sale.items[0]
                return (
                  <div key={sale.id} className="home-recent-row">
                    <span className="recent-emoji">{first ? emojiFor(first.productName) : '🧾'}</span>
                    <span className="recent-name">
                      {first ? first.productName : sale.invoiceNumber}
                      {sale.items.length > 1 ? ` +${sale.items.length - 1}` : ''}
                    </span>
                    <span className="recent-qty">
                      {first
                        ? `${formatQty(first.quantity)} ${unitLabel(first.unit)}`
                        : '—'}
                    </span>
                    <span className="recent-price">{formatMoney(sale.totalAmount)}</span>
                    <span className="recent-time">{timeOnly(sale.createdAt)}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="home-fresh-card">
          <div className="fresh-leaf">🌿</div>
          <div className="fresh-title">الطازج دائماً</div>
          <div className="fresh-sub">أفضل خيار</div>
          <div className="fresh-line" />
        </div>
      </div>
    </div>
  )
}

export { arabicDate }
