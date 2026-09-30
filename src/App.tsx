import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './lib/toast'
import { api } from './lib/api'
import type { PageId } from './types'
import { LoginPage } from './pages/LoginPage'
import { HomePage, arabicDate } from './pages/HomePage'
import { PosPage } from './pages/PosPage'
import { SalesInvoicePage } from './pages/SalesInvoicePage'
import { ProductsPage } from './pages/ProductsPage'
import { PurchasesPage } from './pages/PurchasesPage'
import { WastagePage } from './pages/WastagePage'
import { ExpensesPage } from './pages/ExpensesPage'
import { ReportsPage } from './pages/ReportsPage'
import { CloseDayPage } from './pages/CloseDayPage'
import { SettingsPage } from './pages/SettingsPage'
import { CustomersPage } from './pages/CustomersPage'
import { BrandLockup } from './components/BrandMark'
import { Spinner } from './components/ui'

function Shell() {
  const { user, loading, logout } = useAuth()
  const [page, setPage] = useState<PageId>('home')

  useEffect(() => {
    const off = api.onShortcut((action) => {
      if (action === 'pos') setPage('pos')
      if (action === 'products') setPage('products')
      if (action === 'purchases') setPage('purchases')
      if (action === 'refresh') window.location.reload()
    })

    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }
      if (e.key === 'F1') {
        e.preventDefault()
        setPage('pos')
      }
      if (e.key === 'F3') {
        e.preventDefault()
        setPage('products')
      }
      if (e.key === 'F4') {
        e.preventDefault()
        setPage('purchases')
      }
      if (e.key === 'Escape' && page !== 'home') {
        setPage('home')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [page])

  if (loading) {
    return (
      <div className="app-shell">
        <Spinner label="جاري تجهيز البرنامج..." />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  const goHome = () => setPage('home')
  const isHome = page === 'home'

  return (
    <div className={`app-shell ${isHome ? 'shell-home' : 'shell-page'}`}>
      <header className="app-topbar topbar-pro">
        {/* Right side (RTL start): brand */}
        <div className="topbar-start">
          <button type="button" className="brand-pro" onClick={goHome} title="الرئيسية">
            <BrandLockup compact />
          </button>
          <span className="topbar-divider" />
        </div>

        {/* Center: date */}
        <div className="topbar-center">
          <span className="topbar-date">
            <span className="date-ico">📅</span>
            {arabicDate()}
          </span>
        </div>

        {/* Left side (RTL end): actions + user */}
        <div className="topbar-end">
          {!isHome && (
            <button type="button" className="topbar-pill" onClick={goHome}>
              الرئيسية
            </button>
          )}
          <button
            type="button"
            className="topbar-icon-btn"
            title="الإعدادات"
            onClick={() => setPage('settings')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="topbar-user" onClick={() => void logout()} title="تسجيل الخروج">
            <span className="user-avatar">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z" />
              </svg>
            </span>
            <span className="user-name">{user.fullName}</span>
            <span className="user-caret">▾</span>
          </button>
        </div>
      </header>

      <main className={`app-content ${isHome ? 'content-home' : 'content-page'}`}>
        {page === 'home' && <HomePage onNavigate={setPage} />}
        {page === 'pos' && <PosPage onBack={goHome} />}
        {page === 'invoice' && <SalesInvoicePage onBack={goHome} />}
        {page === 'products' && <ProductsPage onBack={goHome} />}
        {page === 'purchases' && <PurchasesPage onBack={goHome} />}
        {page === 'wastage' && <WastagePage onBack={goHome} />}
        {page === 'expenses' && <ExpensesPage onBack={goHome} />}
        {page === 'reports' && <ReportsPage onBack={goHome} />}
        {page === 'close-day' && <CloseDayPage onBack={goHome} />}
        {page === 'settings' && <SettingsPage onBack={goHome} />}
        {page === 'customers' && <CustomersPage onBack={goHome} />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ToastProvider>
  )
}
