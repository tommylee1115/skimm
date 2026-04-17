import { useEffect, useRef, useState } from 'react'

export function FolderNameInput({
  initialValue,
  placeholder,
  onSubmit,
  onCancel
}: {
  initialValue: string
  placeholder?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="px-2 py-1">
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(value)
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => onSubmit(value)}
        onClick={(e) => e.stopPropagation()}
        className="w-full text-[13px] px-2 py-1 rounded outline-none"
        style={{
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--accent-primary)'
        }}
      />
    </div>
  )
}
