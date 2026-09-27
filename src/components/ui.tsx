import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

export function Input({
  className = '',
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <input className={`input ${error ? 'input-error' : ''}`} {...props} />
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export function Select({
  className = '',
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; children: ReactNode }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <select className="input select" {...props}>
        {children}
      </select>
    </label>
  )
}

export function Textarea({
  className = '',
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <textarea className="input textarea" {...props} />
    </label>
  )
}

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div className={`card ${className}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
  onBack,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  onBack?: () => void
}) {
  return (
    <header className="page-header">
      <div className="page-header-right">
        {onBack && (
          <button type="button" className="back-btn" onClick={onBack} title="رجوع">
            ←
          </button>
        )}
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">🌿</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  )
}

export function Spinner({ label = 'جاري التحميل...' }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'green' | 'orange' | 'red' | 'blue'
}) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function QuickPanel({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="overlay" onClick={onClose}>
      <div className="quick-panel" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="quick-panel-header">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </div>
        <div className="quick-panel-body">{children}</div>
      </div>
    </div>
  )
}
