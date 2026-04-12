import { useEffect, useRef, useState, type CSSProperties } from 'react'
import skimmIcon from '@/assets/brand/skimm_icon_512.png'
import petal01 from '@/assets/brand/petals/petal_01.png'
import petal03 from '@/assets/brand/petals/petal_03.png'
import petal04 from '@/assets/brand/petals/petal_04.png'
import petal05 from '@/assets/brand/petals/petal_05.png'
import petal06 from '@/assets/brand/petals/petal_06.png'
import petal07 from '@/assets/brand/petals/petal_07.png'
import petal08 from '@/assets/brand/petals/petal_08.png'

const PETAL_SOURCES = [petal01, petal03, petal04, petal05, petal06, petal07, petal08]
const pickPetal = () => PETAL_SOURCES[Math.floor(Math.random() * PETAL_SOURCES.length)]

type Phase = 'idle' | 'hover' | 'splash'

interface HoverPetal {
  id: number
  src: string
  left: number       // vw % (0-100)
  delay: number      // s
  duration: number   // s
  size: number       // px
  drift: number      // horizontal drift in px
  rotate: number     // initial rotation
}

interface BurstPetal {
  id: number
  src: string
  x: number          // target offset from center
  y: number
  size: number
  duration: number
}

const HOVER_COUNT = 16
const BURST_COUNT = 18
const SPLASH_MS = 1500

function makeHoverPetals(): HoverPetal[] {
  return Array.from({ length: HOVER_COUNT }, (_, i) => {
    const duration = 5.5 + Math.random() * 4
    // Negative delay so each petal starts mid-cycle — at mount time the screen
    // is already filled with petals at different vertical positions instead of
    // all clumping at the top and falling together.
    const delay = -Math.random() * duration
    return {
      id: i,
      src: pickPetal(),
      left: Math.random() * 100,
      delay,
      duration,
      size: 38 + Math.random() * 22,
      drift: (Math.random() - 0.5) * 200,
      rotate: Math.random() * 360
    }
  })
}

function makeBurstPetals(): BurstPetal[] {
  return Array.from({ length: BURST_COUNT }, (_, i) => {
    // Evenly distribute around a circle with some jitter so it feels organic
    const angle = (i / BURST_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
    const dist = 220 + Math.random() * 240
    return {
      id: i,
      src: pickPetal(),
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * 0.7,
      size: 42 + Math.random() * 22,
      duration: 1.05 + Math.random() * 0.35
    }
  })
}

function Petal({ src, size }: { src: string; size: number }) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      style={{
        display: 'block',
        filter: 'drop-shadow(0 1px 2px rgba(219, 112, 147, 0.18))',
        userSelect: 'none'
      }}
    />
  )
}

export function DragDropOverlay() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [hoverPetals, setHoverPetals] = useState<HoverPetal[]>([])
  const [burstPetals, setBurstPetals] = useState<BurstPetal[]>([])
  const counterRef = useRef(0)
  const splashTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const isFileDrag = (e: DragEvent) =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')

    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      counterRef.current += 1
      if (counterRef.current === 1) {
        setHoverPetals(makeHoverPetals())
        setPhase('hover')
      }
    }

    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      counterRef.current = Math.max(0, counterRef.current - 1)
      if (counterRef.current === 0) {
        setPhase((p) => (p === 'hover' ? 'idle' : p))
      }
    }

    const onOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
    }

    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      counterRef.current = 0
      setHoverPetals((prev) => (prev.length > 0 ? prev : makeHoverPetals()))
      setBurstPetals(makeBurstPetals())
      setPhase('splash')
      if (splashTimerRef.current !== null) window.clearTimeout(splashTimerRef.current)
      splashTimerRef.current = window.setTimeout(() => {
        setPhase('idle')
        setBurstPetals([])
        setHoverPetals([])
        splashTimerRef.current = null
      }, SPLASH_MS)
    }

    document.addEventListener('dragenter', onEnter)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('dragover', onOver)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onEnter)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('drop', onDrop)
      if (splashTimerRef.current !== null) window.clearTimeout(splashTimerRef.current)
    }
  }, [])

  if (phase === 'idle') return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--drag-overlay-bg)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        animation: 'skimm-overlay-fade-in 220ms ease-out'
      }}
    >
      {/* Drifting background petals */}
      {hoverPetals.map((p) => (
        <div
          key={`h-${p.id}`}
          style={
            {
              position: 'absolute',
              top: 0,
              left: `${p.left}%`,
              animation: `skimm-petal-fall ${p.duration}s linear ${p.delay}s infinite`,
              '--petal-drift': `${p.drift}px`,
              '--petal-rot': `${p.rotate}deg`
            } as CSSProperties
          }
        >
          <Petal src={p.src} size={p.size} />
        </div>
      ))}

      {/* Center card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          padding: '32px 52px',
          borderRadius: 22,
          background: 'var(--drag-overlay-card-bg)',
          border: '1.5px dashed var(--border-primary)',
          boxShadow: 'var(--drag-overlay-card-shadow)',
          zIndex: 1
        }}
      >
        <img
          src={skimmIcon}
          alt=""
          width={88}
          height={88}
          style={{
            animation:
              phase === 'splash'
                ? 'skimm-icon-boom 520ms ease-out'
                : 'skimm-icon-pulse 2.4s ease-in-out infinite',
            transformOrigin: 'center'
          }}
        />
        <div
          style={{
            fontFamily: "'Nanum Brush Script', cursive",
            fontSize: 32,
            color: 'var(--text-primary)',
            letterSpacing: '0.02em',
            lineHeight: 1
          }}
        >
          {phase === 'splash' ? 'Reading…' : 'Drop to read'}
        </div>
      </div>

      {/* Splash burst — petals shoot outward from the center */}
      {burstPetals.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 0,
            height: 0,
            zIndex: 2
          }}
        >
          {burstPetals.map((b) => (
            <div
              key={`b-${b.id}`}
              style={
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  animation: `skimm-petal-burst ${b.duration}s cubic-bezier(0.22, 0.61, 0.36, 1) forwards`,
                  '--burst-x': `${b.x}px`,
                  '--burst-y': `${b.y}px`
                } as CSSProperties
              }
            >
              <Petal src={b.src} size={b.size} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
