import { useId } from 'react'
import type { ThemeId } from '../types'
import { useStore } from '../store'

export const THEMES: { id: ThemeId; name: string; blurb: string }[] = [
  { id: 'nobles', name: 'Nobles', blurb: 'Clean white, Nobles blue' },
  { id: 'sleek', name: 'Sleek Modern', blurb: 'Glass, mono, one accent' },
  { id: 'fantasy', name: 'Fantasy Grunge', blurb: 'Moss, plum, parchment' },
  { id: 'urban', name: 'Urban / Performative', blurb: 'Concrete, stickers, matcha' },
  { id: 'fleur', name: 'Fleur', blurb: 'Pressed flowers, pastel' },
  { id: 'hyperpop', name: 'Hyperpop', blurb: 'Neon, chrome, Y2K' },
  { id: 'emo', name: 'Alternative Emo', blurb: 'Black, red, safety pins' },
]

/** The "Aux" wordmark. Styling comes entirely from theme tokens (see themes.css `.wordmark`). */
export function Wordmark({ size = 30 }: { size?: number }) {
  return <span className="wordmark" style={{ fontSize: size }} data-text="Aux" aria-label="Aux">Aux</span>
}

/**
 * The Golden Bulldog trophy. Base colours come from theme tokens (--trophy-a/b/line);
 * each theme also adds its own accessory so the trophy feels native to the skin.
 */
export function Trophy({ size = 64, theme: forced }: { size?: number; theme?: ThemeId }) {
  const current = useStore((s) => s.theme)
  const theme = forced ?? current
  const g = useId().replace(/:/g, '')
  return (
    <svg className="trophy" width={size} height={size * 1.25} viewBox="0 0 120 150" role="img" aria-label="Golden Bulldog trophy">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--trophy-a)" />
          <stop offset=".5" stopColor="var(--trophy-b)" />
          <stop offset="1" stopColor="var(--trophy-c, var(--trophy-a))" />
        </linearGradient>
      </defs>
      <g fill={`url(#${g})`} stroke="var(--trophy-line)" strokeWidth="var(--trophy-stroke, 2.5)" strokeLinejoin="round" strokeLinecap="round">
        {/* plinth */}
        <rect x="26" y="130" width="68" height="14" rx="3" />
        <rect x="38" y="118" width="44" height="12" rx="2" />
        <path d="M52 104h16l3 14H49z" />
        {/* ears */}
        <path d="M27 40c-9-3-15 4-12 14 2 6 7 9 12 8z" />
        <path d="M93 40c9-3 15 4 12 14-2 6-7 9-12 8z" />
        {/* head */}
        <path d="M60 22c22 0 37 14 37 36 0 10-3 19-8 26-6 13-17 21-29 21s-23-8-29-21c-5-7-8-16-8-26 0-22 15-36 37-36z" />
        {/* jowls */}
        <path d="M60 74c-5-5-14-6-20-1-7 6-6 18 2 23 7 4 14 1 18-4 4 5 11 8 18 4 8-5 9-17 2-23-6-5-15-4-20 1z" />
        {/* collar */}
        <path d="M40 101c12 6 28 6 40 0" fill="none" strokeWidth="5" />
      </g>
      <g fill="none" stroke="var(--trophy-line)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M48 36c8-4 16-4 24 0M52 43c5-2 11-2 16 0" />
        <path d="M60 78v9" />
        <path d="M49 97l3-5 3 5M65 97l3-5 3 5" fill="var(--bg)" />
      </g>
      <g fill="var(--trophy-eye, var(--trophy-line))">
        <ellipse cx="60" cy="72" rx="8" ry="5.5" />
        <circle cx="44" cy="57" r="4.2" />
        <circle cx="76" cy="57" r="4.2" />
      </g>
      <circle cx="45.4" cy="55.6" r="1.3" fill="#fff" />
      <circle cx="77.4" cy="55.6" r="1.3" fill="#fff" />
      <text x="60" y="141" textAnchor="middle" className="trophy-label">NMA</text>

      {theme === 'nobles' && <path d="M52 119h16v7l-8 4-8-4z" fill="var(--accent)" stroke="var(--trophy-line)" strokeWidth="1.5" />}
      {theme === 'fantasy' && (
        <g fill="var(--accent-2)" stroke="none">
          <path d="M60 4a9 9 0 1 0 6 16 7 7 0 1 1-6-16z" />
          <path d="M20 22l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5zM100 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM104 78l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
          <path d="M26 130c-6-8-4-18 2-22M94 130c6-8 4-18-2-22" fill="none" stroke="var(--accent)" strokeWidth="2" />
        </g>
      )}
      {theme === 'fleur' && (
        <g>
          {[[36, 26], [48, 19], [60, 16], [72, 19], [84, 26]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              {[0, 72, 144, 216, 288].map((r) => <ellipse key={r} cx="0" cy="-4.5" rx="3" ry="4.5" transform={`rotate(${r})`} fill={i % 2 ? 'var(--accent-2)' : 'var(--surface-2)'} stroke="var(--trophy-line)" strokeWidth=".8" />)}
              <circle r="2.2" fill="var(--trophy-a)" />
            </g>
          ))}
        </g>
      )}
      {theme === 'hyperpop' && (
        <g fill="var(--accent-2)" stroke="var(--trophy-line)" strokeWidth="1.2">
          <path d="M14 14l3 8 8 3-8 3-3 8-3-8-8-3 8-3zM104 86l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" />
          <path d="M100 10l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="var(--accent-3)" />
        </g>
      )}
      {theme === 'emo' && (
        <g fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round">
          <path d="M96 34l14 14a3 3 0 0 1-4 4L92 38" />
          <circle cx="111" cy="52" r="2.5" />
          <path d="M40 50l8 3M80 50l-8 3" stroke="var(--trophy-line)" strokeWidth="2.5" />
        </g>
      )}
      {theme === 'urban' && (
        <g transform="rotate(-14 22 108)">
          <rect x="2" y="100" width="44" height="15" fill="var(--accent)" stroke="var(--trophy-line)" strokeWidth="2" />
          <text x="24" y="111" textAnchor="middle" className="trophy-sticker">WINNER</text>
        </g>
      )}
      {theme === 'sleek' && <path d="M26 148h68" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  )
}

/** Small per-theme motif shown in the home header (celestial, floral, sticker, safety pin…). */
export function ThemeDecor() {
  const theme = useStore((s) => s.theme)
  const common = { className: 'decor', width: 76, height: 40, viewBox: '0 0 76 40', 'aria-hidden': true } as const
  switch (theme) {
    case 'fantasy':
      return (
        <svg {...common}>
          <path d="M22 6a14 14 0 1 0 10 25A11 11 0 1 1 22 6z" fill="var(--accent-2)" />
          <path d="M50 8l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM66 24l1.2 3.5 3.5 1.2-3.5 1.2L66 33.4l-1.2-3.5-3.5-1.2 3.5-1.2z" fill="var(--accent)" />
          <path d="M40 36c6-8 14-8 20-2" stroke="var(--accent)" strokeWidth="1.4" fill="none" />
        </svg>
      )
    case 'fleur':
      return (
        <svg {...common}>
          {[[20, 18, 1], [44, 24, 0.75], [62, 14, 0.6]].map(([x, y, sc], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${sc})`}>
              {[0, 60, 120, 180, 240, 300].map((r) => <ellipse key={r} cx="0" cy="-8" rx="4.5" ry="8" transform={`rotate(${r})`} fill={i === 1 ? 'var(--accent-2)' : 'var(--surface-2)'} stroke="var(--accent)" strokeWidth=".8" />)}
              <circle r="3.5" fill="var(--trophy-a)" />
            </g>
          ))}
        </svg>
      )
    case 'urban':
      return (
        <svg {...common}>
          <g transform="rotate(-8 38 20)">
            <circle cx="20" cy="20" r="16" fill="#0b0b0b" /><circle cx="20" cy="20" r="6" fill="var(--accent)" /><circle cx="20" cy="20" r="1.5" fill="#0b0b0b" />
            <circle cx="20" cy="20" r="11" fill="none" stroke="#444" strokeWidth=".8" />
            <rect x="40" y="10" width="34" height="18" fill="var(--accent)" stroke="#0b0b0b" strokeWidth="2" />
            <text x="57" y="23" textAnchor="middle" fontFamily="var(--font-head)" fontSize="11" fill="#0b0b0b">MATCHA</text>
          </g>
        </svg>
      )
    case 'hyperpop':
      return (
        <svg {...common}>
          <path d="M18 4l4 11 11 4-11 4-4 11-4-11-11-4 11-4z" fill="var(--accent-2)" />
          <path d="M50 10l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z" fill="var(--accent-3)" />
          <circle cx="68" cy="10" r="5" fill="var(--accent)" />
        </svg>
      )
    case 'emo':
      return (
        <svg {...common}>
          <g fill="none" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round">
            <path d="M10 28L52 10a4 4 0 0 1 4 7L22 32" /><circle cx="14" cy="30" r="4" /><path d="M56 17c4 2 8 0 9-3" />
          </g>
          <path d="M62 24l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z" fill="var(--accent)" />
        </svg>
      )
    case 'sleek':
      return <svg {...common}><circle cx="58" cy="20" r="12" fill="none" stroke="var(--text)" strokeWidth="1" /><circle cx="46" cy="20" r="12" fill="var(--accent)" opacity=".85" /></svg>
    default:
      return (
        <svg {...common}>
          <path d="M48 4h22v18c0 8-5 12-11 14-6-2-11-6-11-14z" fill="var(--accent)" />
          <text x="59" y="24" textAnchor="middle" fontFamily="var(--font-head)" fontWeight="700" fontSize="16" fill="#fff">N</text>
        </svg>
      )
  }
}
