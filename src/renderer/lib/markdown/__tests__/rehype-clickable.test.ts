import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import { toHtml } from 'hast-util-to-html'
import { rehypeClickable } from '../rehype-clickable'

/**
 * Integration-ish tests: run a small slice of the production pipeline
 * and verify rehype-clickable wraps words, skips code/pre/etc., and —
 * critically for the v0.4.0 math fix — skips KaTeX-rendered subtrees.
 */

async function renderHtml(md: string, withMath: boolean): Promise<string> {
  const pipeline = unified().use(remarkParse)
  if (withMath) pipeline.use(remarkMath)
  pipeline.use(remarkRehype)
  if (withMath) pipeline.use(rehypeKatex)
  pipeline.use(rehypeClickable)
  // Use compile step to get a hast tree then stringify.
  const file = await pipeline.run(pipeline.parse(md))
  // The runner mutates in place — cast to a hast root.
  return toHtml(file as never)
}

describe('rehypeClickable', () => {
  it('wraps each word in a <span data-word>', async () => {
    const html = await renderHtml('Hello world', false)
    // Each word gets its own span with data-word.
    const spans = html.match(/<span[^>]*data-word[^>]*>/g) ?? []
    expect(spans).toHaveLength(2)
  })

  it('does not wrap text inside <code> blocks', async () => {
    const html = await renderHtml('Use `fetch` please', false)
    // "fetch" stays inside the code element without its own data-word span.
    expect(html).toContain('<code>fetch</code>')
    // "Use" and "please" should still be clickable words.
    const wordSpans = html.match(/<span[^>]*data-word[^>]*>/g) ?? []
    expect(wordSpans.length).toBe(2)
  })

  it('does not wrap text inside fenced code blocks', async () => {
    const md = '```\nconst x = 1\n```'
    const html = await renderHtml(md, false)
    // No data-word spans anywhere — pre/code are both skip tags.
    expect(html).not.toMatch(/data-word/)
  })

  it('does not wrap text inside <a> tags', async () => {
    const html = await renderHtml('See [the docs](https://example.com) now', false)
    // "docs" is inside the link — must not be clickable.
    expect(html).toContain('>the docs<')
    // But "See" and "now" should be.
    const wordSpans = html.match(/<span[^>]*data-word[^>]*>/g) ?? []
    expect(wordSpans.length).toBe(2)
  })

  it('assigns monotonically increasing data-offset values', async () => {
    const html = await renderHtml('Hello brave world', false)
    const offsets = Array.from(html.matchAll(/data-offset="(\d+)"/g)).map((m) =>
      Number(m[1])
    )
    // Strictly increasing, matching char positions of word starts.
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1])
    }
    expect(offsets).toEqual([0, 6, 12])
  })

  it('skips KaTeX-rendered subtrees entirely', async () => {
    const html = await renderHtml('Before $x=1$ after', true)
    // KaTeX emits spans with class "katex". rehype-clickable must not
    // inject data-word spans inside any element with a katex- class.
    const katexIdx = html.indexOf('class="katex"')
    expect(katexIdx).toBeGreaterThan(-1)
    const openKatex = html.indexOf('class="katex"')
    const closeKatex = html.lastIndexOf('</span>', html.indexOf('after')) + '</span>'.length
    const katexSlice = html.slice(openKatex, closeKatex)
    // No clickable-word spans inside the katex subtree.
    expect(katexSlice).not.toMatch(/data-word/)
    // But "Before" and "after" (outside the math) should be clickable.
    const outsideWordSpans = (
      html.slice(0, openKatex) + html.slice(closeKatex)
    ).match(/<span[^>]*data-word[^>]*>/g) ?? []
    expect(outsideWordSpans.length).toBeGreaterThanOrEqual(2)
  })
})
