/**
 * Markdown processing pipeline.
 * Raw markdown → mdast → hast → React elements
 */
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeReact from 'rehype-react'
import { createElement, Fragment } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { remarkChunk, type ChunkingLevel } from './remark-chunk'
import { rehypeClickable } from './rehype-clickable'
import { rehypeBeeline } from './rehype-beeline'
import type { ReactElement } from 'react'

interface PipelineOptions {
  chunkingLevel: ChunkingLevel
  beelineEnabled: boolean
  onWordClick?: (word: string, offset: number, context: string, altKey: boolean) => void
}

export function processMarkdown(
  markdown: string,
  options: PipelineOptions
): ReactElement {
  const { chunkingLevel, beelineEnabled, onWordClick } = options

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkChunk, { level: chunkingLevel })
    .use(remarkRehype)
    .use(rehypeClickable)

  if (beelineEnabled) {
    processor.use(rehypeBeeline)
  }

  processor.use(rehypeReact, {
    Fragment,
    jsx,
    jsxs,
    components: {
      span: (props: Record<string, unknown>) => {
        const {
          children,
          className,
          node: _node, // rehype-react passes this — discard it
          ...domProps
        } = props as {
          children?: React.ReactNode
          className?: string
          node?: unknown
          [key: string]: unknown
        }

        const isClickableWord = domProps['dataWord'] !== undefined ||
                                domProps['data-word'] !== undefined

        if (isClickableWord) {
          const offset = Number(domProps['dataOffset'] ?? domProps['data-offset'] ?? 0)
          const wordText = extractText(children)

          return createElement(
            'span',
            {
              className,
              'data-word': true,
              'data-offset': offset,
              onClick: (e: React.MouseEvent) => {
                if (onWordClick) {
                  const el = document.querySelector(
                    `[data-offset="${offset}"]`
                  ) as HTMLElement | null
                  const context = el?.closest('p, div, blockquote')?.textContent ?? ''
                  onWordClick(wordText, offset, context, e.altKey)
                }
              }
            },
            children
          )
        }

        return createElement('span', { className }, children)
      }
    }
  } as Parameters<typeof rehypeReact>[0])

  try {
    const result = processor.processSync(markdown)
    return (result.result as ReactElement) ?? createElement(Fragment)
  } catch (err) {
    console.error('Markdown pipeline error:', err)
    return createElement('pre', { style: { whiteSpace: 'pre-wrap' } }, markdown)
  }
}

function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(extractText).join('')
  return String(children ?? '')
}
