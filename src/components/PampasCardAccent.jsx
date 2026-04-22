/** Franja de pampas sobre la tarjeta; `dense` añade más trazos (p. ej. login). */
export default function PampasCardAccent({ variant = 'default' }) {
  const dense = variant === 'dense'

  return (
    <div
      className={
        dense
          ? 'pampas-card-accent pampas-card-accent--dense'
          : 'pampas-card-accent'
      }
      aria-hidden
    >
      <svg
        viewBox={dense ? '0 0 400 44' : '0 0 400 32'}
        className="pampas-card-accent__svg"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="0.5"
        >
          <path d="M20 30 Q40 8 64 2" opacity="0.34" />
          <path d="M52 32 Q80 4 120 0" opacity="0.28" />
          <path d="M100 30 Q150 0 200 0" opacity="0.24" />
          <path d="M180 32 Q240 0 300 0" opacity="0.22" />
          <path d="M280 30 Q320 4 360 0" opacity="0.28" />
          <path d="M320 30 Q360 6 380 2" opacity="0.22" />
          {dense ? (
            <>
              <path d="M0 20 Q 50 0 100 0" opacity="0.2" />
              <path d="M120 12 Q 200 -4 300 0" opacity="0.2" />
              <path d="M220 8 Q 300 0 400 0" opacity="0.18" />
              <path d="M40 36 Q 120 8 200 2" opacity="0.22" />
            </>
          ) : null}
        </g>
        <g fill="currentColor" opacity={dense ? 0.18 : 0.14}>
          <ellipse cx="68" cy="3" rx="8" ry="2.2" transform="rotate(-5 68 3)" />
          <ellipse cx="200" cy="2" rx="10" ry="2.4" transform="rotate(3 200 2)" />
          <ellipse cx="300" cy="3" rx="7" ry="1.8" transform="rotate(-3 300 3)" />
          {dense ? (
            <>
              <ellipse cx="140" cy="2" rx="6" ry="1.6" transform="rotate(6 140 2)" />
              <ellipse cx="250" cy="1" rx="7" ry="2" transform="rotate(-2 250 1)" />
            </>
          ) : null}
        </g>
      </svg>
    </div>
  )
}
