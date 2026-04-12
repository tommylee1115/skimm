/**
 * Lightweight inline markdown renderer for explanation text.
 * Handles: **bold**, *italic*, `code`, and line breaks.
 * Not a full markdown parser — just enough for LLM responses.
 */

interface MarkdownTextProps {
  text: string
}

export function MarkdownText({ text }: MarkdownTextProps) {
  const parts = parseInlineMarkdown(text)

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'bold') return <strong key={i}>{part.text}</strong>
        if (part.type === 'italic') return <em key={i}>{part.text}</em>
        if (part.type === 'code') {
          return (
            <code
              key={i}
              style={{
                background: 'var(--bg-tertiary)',
                padding: '0.1em 0.3em',
                borderRadius: 3,
                fontSize: '0.9em'
              }}
            >
              {part.text}
            </code>
          )
        }
        if (part.type === 'newline') return <br key={i} />
        return <span key={i}>{part.text}</span>
      })}
    </>
  )
}

interface Part {
  type: 'text' | 'bold' | 'italic' | 'code' | 'newline'
  text: string
}

function parseInlineMarkdown(text: string): Part[] {
  const parts: Part[] = []
  // Pattern: **bold**, *italic*, `code`, \n
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\n)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }

    if (match[0] === '\n') {
      parts.push({ type: 'newline', text: '' })
    } else if (match[2]) {
      parts.push({ type: 'bold', text: match[2] })
    } else if (match[3]) {
      parts.push({ type: 'italic', text: match[3] })
    } else if (match[4]) {
      parts.push({ type: 'code', text: match[4] })
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) })
  }

  return parts
}
