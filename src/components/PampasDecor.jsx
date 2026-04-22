/** Siluetas de pampas: manojos, plumas en abanico y hierbas finas (decoración de marca). */
function PlumeFan({ cx, cy, angle = 0, baseW = 28, n = 16, className = '' }) {
  const rad = (deg) => (deg * Math.PI) / 180
  return (
    <g
      className={className}
      transform={`translate(${cx} ${cy}) rotate(${angle})`}
    >
      {Array.from({ length: n }, (_, i) => {
        const t = n <= 1 ? 0.5 : i / (n - 1)
        const spread = rad(-42 + t * 84)
        const len = 55 + (i % 4) * 6 + Math.sin(t * Math.PI) * 12
        const wx = Math.sin(spread) * (baseW + t * 8)
        const hx = -Math.cos(spread) * len
        return (
          <path
            key={i}
            d={`M0 0 Q ${wx * 0.4} ${hx * 0.45} ${wx} ${hx}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.75 + (i % 3) * 0.15}
            strokeLinecap="round"
            opacity={0.18 + t * 0.22 + (i % 2) * 0.04}
          />
        )
      })}
    </g>
  )
}

function BunnyTails({ x, y, n = 5 }) {
  return (
    <g className="pampas-bunny" transform={`translate(${x} ${y})`}>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${i * 14 - (n * 7)} 0) rotate(${(i - 2) * 4})`}>
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="-32"
            stroke="currentColor"
            strokeWidth="0.5"
            opacity={0.35}
          />
          <ellipse
            cx="0"
            cy="-36"
            rx="5"
            ry="7"
            fill="currentColor"
            opacity={0.12 + i * 0.03}
            transform="rotate(-8)"
          />
        </g>
      ))}
    </g>
  )
}

function FineReeds({ x, y, count = 18 }) {
  return (
    <g className="pampas-reeds" transform={`translate(${x} ${y})`}>
      {Array.from({ length: count }, (_, i) => {
        const spread = -55 + (i / (count - 1)) * 110
        const h = 70 + (i % 4) * 12
        return (
          <path
            key={i}
            d={`M0 0 Q ${spread * 0.2} ${-h * 0.4} ${Math.sin((spread * Math.PI) / 180) * 30} ${-h}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.45"
            strokeLinecap="round"
            opacity={0.08 + (i % 5) * 0.04}
          />
        )
      })}
    </g>
  )
}

/**
 * @param {object} props
 * @param {'default' | 'dense'} [props.density] — `dense` añade más manojos, reeds y capas (p. ej. login).
 */
export default function PampasDecor({ density = 'default' }) {
  const dense = density === 'dense'

  return (
    <svg
      className={dense ? 'pampas-decor pampas-decor--dense' : 'pampas-decor'}
      viewBox="0 0 520 680"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id="pamp-plume-soft" cx="50%" cy="70%" r="65%">
          <stop offset="0%" stopColor="#c9a88c" stopOpacity="0.35" />
          <stop offset="55%" stopColor="#a08068" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#6b4f3e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pamp-plume-terracotta" cx="50%" cy="75%" r="60%">
          <stop offset="0%" stopColor="#b5654c" stopOpacity="0.28" />
          <stop offset="70%" stopColor="#8c4a38" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#5c3d32" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pamp-stem" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5c4a3d" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3d2f28" stopOpacity="0.25" />
        </linearGradient>
      </defs>

      {/* Cúmulo lejero (profundidad) */}
      <ellipse
        cx="120"
        cy="240"
        rx="100"
        ry="32"
        fill="url(#pamp-plume-soft)"
        opacity="0.9"
        transform="rotate(-8 120 240)"
      />
      <ellipse
        cx="380"
        cy="200"
        rx="85"
        ry="28"
        fill="url(#pamp-plume-terracotta)"
        opacity="0.75"
        transform="rotate(6 380 200)"
      />

      {dense ? (
        <>
          <ellipse
            cx="260"
            cy="150"
            rx="72"
            ry="24"
            fill="url(#pamp-plume-soft)"
            opacity="0.7"
            transform="rotate(4 260 150)"
          />
          <ellipse
            cx="60"
            cy="300"
            rx="78"
            ry="26"
            fill="url(#pamp-plume-terracotta)"
            opacity="0.45"
            transform="rotate(-12 60 300)"
          />
          <ellipse
            cx="300"
            cy="90"
            rx="55"
            ry="16"
            fill="url(#pamp-plume-soft)"
            opacity="0.5"
            transform="rotate(15 300 90)"
          />
        </>
      ) : null}

      <FineReeds x={32} y={420} count={dense ? 28 : 20} />
      <BunnyTails x={100} y={460} n={dense ? 6 : 4} />

      {dense ? (
        <>
          <FineReeds x={180} y={360} count={24} />
          <FineReeds x={300} y={390} count={20} />
          <FineReeds x={8} y={340} count={16} />
          <BunnyTails x={220} y={390} n={5} />
          <BunnyTails x={40} y={300} n={4} />
        </>
      ) : null}

      {/* Tallos y plumas — manojo principal (derecha) */}
      <g className="pampas-bunch pampas-bunch--main" transform="translate(280 600)">
        {(
          dense
            ? [
                { x: 0, h: 280, w: 1.1, op: 0.28 },
                { x: -32, h: 255, w: 0.95, op: 0.22 },
                { x: 40, h: 265, w: 1, op: 0.24 },
                { x: -64, h: 220, w: 0.8, op: 0.18 },
                { x: 88, h: 210, w: 0.75, op: 0.16 },
                { x: -100, h: 195, w: 0.72, op: 0.17 },
                { x: 120, h: 185, w: 0.7, op: 0.15 },
              ]
            : [
                { x: 0, h: 280, w: 1.1, op: 0.28 },
                { x: -32, h: 255, w: 0.95, op: 0.22 },
                { x: 40, h: 265, w: 1, op: 0.24 },
                { x: -64, h: 220, w: 0.8, op: 0.18 },
                { x: 88, h: 210, w: 0.75, op: 0.16 },
              ]
        ).map((stem, i) => (
          <g key={i}>
            <line
              x1={stem.x}
              y1="0"
              x2={stem.x * 0.85}
              y2={-stem.h}
              stroke="url(#pamp-stem)"
              strokeWidth={stem.w}
              strokeLinecap="round"
              opacity={stem.op}
            />
            <PlumeFan
              cx={stem.x * 0.85 - 2}
              cy={-stem.h - 4}
              angle={(stem.x - 8) * 0.12}
              baseW={26 + (i % 2) * 4 + (dense ? 2 : 0)}
              n={14 + (i % 3) + (dense ? 2 : 0)}
            />
          </g>
        ))}
      </g>

      {/* Manojo mediano (centro) */}
      <g className="pampas-bunch pampas-bunch--mid" transform="translate(140 640)">
        {(
          dense
            ? [
                { x: 0, h: 195 },
                { x: 36, h: 175 },
                { x: -28, h: 160 },
                { x: 64, h: 148 },
                { x: -56, h: 138 },
              ]
            : [
                { x: 0, h: 195 },
                { x: 36, h: 175 },
                { x: -28, h: 160 },
              ]
        ).map((stem, i) => (
          <g key={i}>
            <line
              x1={stem.x}
              y1="0"
              x2={stem.x * 0.9}
              y2={-stem.h}
              stroke="url(#pamp-stem)"
              strokeWidth="0.85"
              strokeLinecap="round"
              opacity={0.2}
            />
            <PlumeFan
              cx={stem.x * 0.9}
              cy={-stem.h - 2}
              angle={(stem.x - 4) * 0.1}
              baseW={22 + (dense && i < 2 ? 2 : 0)}
              n={12 + (dense ? 3 : 0)}
            />
          </g>
        ))}
      </g>

      {/* Manojo terracota (toque cálido) */}
      <g
        className="pampas-bunch pampas-bunch--terra"
        transform="translate(400 650)"
        style={{ color: 'rgba(140, 74, 56, 0.55)' }}
      >
        <line
          x1="0"
          y1="0"
          x2="6"
          y2="-200"
          stroke="currentColor"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity={0.35}
        />
        <PlumeFan
          cx={4}
          cy={-198}
          angle={-6}
          baseW={20 + (dense ? 4 : 0)}
          n={12 + (dense ? 4 : 0)}
        />
      </g>

      {dense ? (
        <>
          <g className="pampas-bunch pampas-bunch--back" transform="translate(50 500)">
            {[
              { x: 0, h: 140 },
              { x: 28, h: 125 },
              { x: -20, h: 115 },
            ].map((stem, i) => (
              <g key={`back-${i}`}>
                <line
                  x1={stem.x}
                  y1="0"
                  x2={stem.x * 0.92}
                  y2={-stem.h}
                  stroke="url(#pamp-stem)"
                  strokeWidth="0.65"
                  strokeLinecap="round"
                  opacity={0.12}
                />
                <PlumeFan
                  cx={stem.x * 0.92}
                  cy={-stem.h - 1}
                  angle={-4 + i * 2}
                  baseW={18}
                  n={10}
                />
              </g>
            ))}
          </g>

          <g
            className="pampas-bunch pampas-bunch--terra"
            transform="translate(195 635)"
            style={{ color: 'rgba(150, 82, 62, 0.48)' }}
          >
            <line
              x1="0"
              y1="0"
              x2="-4"
              y2="-165"
              stroke="currentColor"
              strokeWidth="0.55"
              strokeLinecap="round"
              opacity={0.3}
            />
            <PlumeFan cx={-3} cy={-162} angle={4} baseW={18} n={11} />
          </g>
        </>
      ) : null}

      {/* Detalle: plumas al viento (trazos ligeros) */}
      <g
        className="pampas-wisps"
        style={{ color: 'rgba(107, 79, 62, 0.45)' }}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
      >
        {(
          dense
            ? [
                'M40 500 Q 80 380 200 300',
                'M55 520 Q 100 400 180 320',
                'M420 120 Q 360 200 300 300',
                'M10 200 Q 60 100 150 40',
                'M140 480 Q 200 300 320 200',
                'M300 500 Q 260 400 200 250',
                'M380 400 Q 340 300 300 200',
                'M20 400 Q 80 280 160 200',
                'M200 30 Q 240 100 300 200',
                'M450 200 Q 400 300 360 400',
              ]
            : [
                'M40 500 Q 80 380 200 300',
                'M55 520 Q 100 400 180 320',
                'M420 120 Q 360 200 300 300',
              ]
        ).map((d, i) => (
          <path
            key={i}
            d={d}
            strokeWidth="0.55"
            opacity={0.2 + (i % 4) * 0.04}
          />
        ))}
      </g>
    </svg>
  )
}
