/** Brand mark variants matching the خضرة identity board. */

type Size = number | string

interface BrandMarkProps {
  size?: Size
  className?: string
  /** app = rounded green square icon; mark = leaves only SVG; mono = white leaves */
  variant?: 'app' | 'mark' | 'mono'
  /** Prefer raster app icon when available */
  useImage?: boolean
}

export function BrandMark({
  size = 40,
  className = '',
  variant = 'app',
  useImage = true,
}: BrandMarkProps) {
  const s = typeof size === 'number' ? `${size}px` : size
  const px = typeof size === 'number' ? size : undefined

  if (variant === 'app' && useImage) {
    return (
      <img
        src="/icons/icon.png"
        alt=""
        width={px}
        height={px}
        className={`brand-mark-img ${className}`}
        style={{ width: s, height: s, objectFit: 'cover' }}
        draggable={false}
      />
    )
  }

  if (variant === 'mono') {
    return (
      <svg
        viewBox="0 0 64 64"
        width={s}
        height={s}
        className={className}
        aria-hidden
        fill="none"
      >
        <path
          d="M18 44c2-18 14-32 24-36-2 16-8 30-18 38-3-1-5-2-6-2z"
          fill="currentColor"
          opacity="0.95"
        />
        <path
          d="M46 44c-2-18-14-32-24-36 2 16 8 30 18 38 3-1 5-2 6-2z"
          fill="currentColor"
          opacity="0.72"
        />
      </svg>
    )
  }

  // Inline SVG mark (leaves + tomato) — matches board / app icon
  return (
    <svg viewBox="0 0 64 64" width={s} height={s} className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="baBg" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="45%" stopColor="#16A34A" />
          <stop offset="100%" stopColor="#14532D" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#baBg)" />
      {/* left leaf */}
      <path
        d="M18 44c1.5-16 12-28 22-32-1.5 14-7 26-17 34-2.5-1-4-2-5-2z"
        fill="#FFFFFF"
      />
      <path
        d="M22 42c7-9 14-16 18-22"
        stroke="#16A34A"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity=".28"
      />
      {/* right leaf */}
      <path
        d="M46 44c-1.5-16-12-28-22-32 1.5 14 7 26 17 34 2.5-1 4-2 5-2z"
        fill="#D1FAE5"
      />
      <path
        d="M42 42c-7-9-14-16-18-22"
        stroke="#14532D"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity=".2"
      />
      {/* tomato */}
      <circle cx="32" cy="22" r="6" fill="#EF4444" />
      <circle cx="30" cy="20" r="1.6" fill="#FECACA" opacity=".9" />
      <path
        d="M30 16.5c1 .8 2 .8 3.2 0M32 15.5c.2 1.2.6 2 .6 2.8"
        stroke="#166534"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BrandLockup({
  className = '',
  tagline = true,
  compact = false,
}: {
  className?: string
  tagline?: boolean
  compact?: boolean
}) {
  return (
    <span className={`brand-lockup ${compact ? 'is-compact' : ''} ${className}`}>
      <BrandMark size={compact ? 36 : 44} variant="app" />
      <span className="brand-text-stack">
        <span className="brand-name">خضرة</span>
        {tagline && <span className="brand-tag">إدارة محلك ببساطة</span>}
      </span>
    </span>
  )
}
