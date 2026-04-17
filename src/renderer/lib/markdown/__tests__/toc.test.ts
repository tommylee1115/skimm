import { describe, it, expect } from 'vitest'
import { extractHeadings } from '../toc'

describe('extractHeadings', () => {
  it('returns [] for empty markdown', () => {
    expect(extractHeadings('')).toEqual([])
    expect(extractHeadings('just a paragraph')).toEqual([])
  })

  it('extracts h1-h6 with correct depth', () => {
    const md = [
      '# One',
      '## Two',
      '### Three',
      '#### Four',
      '##### Five',
      '###### Six'
    ].join('\n')
    const entries = extractHeadings(md)
    expect(entries.map((e) => e.depth)).toEqual([1, 2, 3, 4, 5, 6])
    expect(entries.map((e) => e.text)).toEqual(['One', 'Two', 'Three', 'Four', 'Five', 'Six'])
  })

  it('assigns ids via github-slugger (lowercased, hyphens, unique)', () => {
    const md = ['# Hello World', '# Intro', '# Intro', '# Intro'].join('\n')
    const entries = extractHeadings(md)
    expect(entries.map((e) => e.id)).toEqual([
      'hello-world',
      'intro',
      'intro-1',
      'intro-2'
    ])
  })

  it('ignores # inside fenced code blocks', () => {
    const md = [
      '# Real heading',
      '```',
      '# not a heading, just a comment',
      '## also not',
      '```',
      '## Another real heading'
    ].join('\n')
    const entries = extractHeadings(md)
    expect(entries.map((e) => e.text)).toEqual(['Real heading', 'Another real heading'])
  })

  it('strips inline formatting from heading text', () => {
    const md = [
      '# **Bold** heading',
      '## *Italic* heading',
      '### `code` in heading',
      '#### [Linked](https://example.com) heading'
    ].join('\n')
    const entries = extractHeadings(md)
    expect(entries.map((e) => e.text)).toEqual([
      'Bold heading',
      'Italic heading',
      'code in heading',
      'Linked heading'
    ])
  })

  it('handles ATX-closed headings (trailing #)', () => {
    const md = '## My section ##'
    const entries = extractHeadings(md)
    expect(entries[0]).toMatchObject({ depth: 2, text: 'My section', id: 'my-section' })
  })

  it('skips empty-text heading lines', () => {
    const md = ['#   ', '# real'].join('\n')
    const entries = extractHeadings(md)
    expect(entries.map((e) => e.text)).toEqual(['real'])
  })

  it('requires at least one space after the hashes', () => {
    // "#no-space" is not a valid ATX heading.
    expect(extractHeadings('#no-space')).toEqual([])
    expect(extractHeadings('# yes space')).toHaveLength(1)
  })
})
