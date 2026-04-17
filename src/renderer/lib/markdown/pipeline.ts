/**
 * Markdown processing pipeline.
 * Raw markdown → mdast → hast → React elements
 *
 * Math: `$...$` (inline) and `$$...$$` (block) are parsed by remark-math
 * into mdast math nodes, lowered to hast by remark-rehype, and rendered
 * into KaTeX HTML by rehype-katex. KaTeX's stylesheet is imported once
 * in main.tsx so the fonts and layout rules are available.
 */
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeSanitize from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'
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

  // Order matters:
  //   remarkMath     — recognise $...$ / $$...$$ in mdast
  //   remarkChunk    — optional paragraph/clause splitter
  //   remarkRehype   — lower to hast (drops raw HTML by default)
  //   rehypeSlug     — add stable id="..." to every heading (used by the
  //                    TOC sidebar's click-to-scroll)
  //   rehypeSanitize — defense-in-depth: even though remark-rehype already
  //                    strips raw HTML, this also rejects javascript:/data:
  //                    URLs in href/src that React's url-sanitizer might
  //                    miss. Runs BEFORE rehype-katex so the trusted KaTeX
  //                    HTML (with inline styles + non-default classes) is
  //                    not subjected to the schema.
  //   rehypeKatex    — expand math nodes into full KaTeX HTML
  //   rehypeClickable — wrap words in <span data-word> for clicks+TTS
  //                    (skips katex subtrees so math spans stay intact)
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkChunk, { level: chunkingLevel })
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeSanitize)
    .use(rehypeKatex)
    .use(rehypeClickable)

  if (beelineEnabled) {
    processor.use(rehypeBeeline)
  }

  processor.use(rehypeReact, {
    Fragment,
    jsx,
    jsxs,
    components: {
      // KaTeX reaches us as a tree of <span> elements whose layout
      // depends on inline `style` attributes (vlist heights, vertical
      // shifts, negative margin-right, the fraction-bar border width,
      // strut vertical-align, etc.). rehype-react parses those into a
      // React-shaped `style` object and passes it through `props`, so
      // we must forward it — dropping it collapses vlists to the
      // baseline and makes fractions, subscripts, and accents land in
      // the wrong rows. The click-to-explain wrapping lives on its own
      // clickable-word spans (emitted by rehype-clickable, which skips
      // katex subtrees) so we can keep that branch separate.
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

        return createElement('span', { className, ...domProps }, children)
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
