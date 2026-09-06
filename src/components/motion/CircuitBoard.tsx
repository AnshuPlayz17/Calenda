import type { ReactNode } from 'react'
import { useId } from 'react'
import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/cn'

/**
 * Nodes joined by traces, with a pulse travelling along each one.
 *
 * SVG rather than canvas: the whole thing is a few dozen elements, it stays
 * crisp at any density without a devicePixelRatio dance, and the pulses are
 * CSS animations on the compositor rather than a per-frame redraw. Nothing here
 * touches the main thread after mount.
 *
 * Under reduced motion the traces are drawn and the pulses simply do not run --
 * the diagram is the information, the electricity was decoration.
 */

export type CircuitNode = {
  id: string
  x: number
  y: number
  label?: string
  size?: number
  icon?: ReactNode
}

export type CircuitConnection = {
  from: string
  to: string
  animated?: boolean
  bidirectional?: boolean
}

export function CircuitBoard({
  nodes,
  connections,
  width = 600,
  height = 400,
  showGrid = true,
  pulseSpeed = 2,
  traceWidth = 2,
  className,
}: {
  nodes: CircuitNode[]
  connections: CircuitConnection[]
  width?: number
  height?: number
  showGrid?: boolean
  pulseSpeed?: number
  traceWidth?: number
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const reduce = useReducedMotion()
  const at = (id: string) => nodes.find((n) => n.id === id)

  return (
    <div className={cn('w-full', className)} aria-hidden>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="presentation"
      >
        <defs>
          <pattern id={`${uid}-grid`} width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--border)" />
          </pattern>
        </defs>

        {showGrid && <rect width={width} height={height} fill={`url(#${uid}-grid)`} opacity="0.65" />}

        {connections.map((c, i) => {
          const a = at(c.from)
          const b = at(c.to)
          if (!a || !b) return null
          // An elbow with a rounded corner, so traces read as routed rather
          // than as straight lines that happen to meet.
          const midX = (a.x + b.x) / 2
          const d = `M ${a.x} ${a.y} L ${midX - 12} ${a.y} Q ${midX} ${a.y} ${midX} ${a.y + Math.sign(b.y - a.y) * 12} L ${midX} ${b.y - Math.sign(b.y - a.y) * 12} Q ${midX} ${b.y} ${midX + 12} ${b.y} L ${b.x} ${b.y}`
          const straight = Math.abs(a.y - b.y) < 1
          const path = straight ? `M ${a.x} ${a.y} L ${b.x} ${b.y}` : d
          return (
            <g key={`${c.from}-${c.to}-${i}`}>
              <path d={path} fill="none" stroke="var(--border-strong)" strokeWidth={traceWidth} strokeLinecap="round" />
              {c.animated && !reduce && (
                <path
                  d={path}
                  fill="none"
                  stroke="var(--brand)"
                  strokeWidth={traceWidth}
                  strokeLinecap="round"
                  strokeDasharray="14 260"
                  className="circuit-pulse"
                  style={{
                    animationDuration: `${pulseSpeed}s`,
                    animationDelay: `${(i * pulseSpeed) / Math.max(1, connections.length)}s`,
                    animationDirection: c.bidirectional ? 'alternate' : 'normal',
                  }}
                />
              )}
            </g>
          )
        })}

        {nodes.map((n) => {
          const r = n.size ?? 22
          return (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
              <circle r={r} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="1.5" />
              {n.icon && (
                <foreignObject x={-r / 2} y={-r / 2} width={r} height={r}>
                  <div className="flex h-full w-full items-center justify-center text-text-muted">
                    {n.icon}
                  </div>
                </foreignObject>
              )}
              {n.label && (
                <text
                  y={r + 16}
                  textAnchor="middle"
                  className="fill-text-muted"
                  style={{ font: "500 11px var(--font-sans)" }}
                >
                  {n.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
