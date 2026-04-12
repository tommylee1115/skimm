import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  onResize: (delta: number) => void
}

export function ResizeHandle({ onResize }: ResizeHandleProps) {
  const startX = useRef(0)
  const active = useRef(false)
  const handleRef = useRef<HTMLDivElement>(null)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startX.current = e.clientX
      active.current = true
      handleRef.current?.classList.add('active')

      const onMouseMove = (ev: MouseEvent) => {
        if (!active.current) return
        const delta = ev.clientX - startX.current
        startX.current = ev.clientX
        onResize(delta)
      }

      const onMouseUp = () => {
        active.current = false
        handleRef.current?.classList.remove('active')
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [onResize]
  )

  return <div ref={handleRef} className="resize-handle" onMouseDown={onMouseDown} />
}
