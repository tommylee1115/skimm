import GithubSlugger from 'github-slugger'

/**
 * Extract headings from a raw markdown string into a flat list suitable
 * for rendering a clickable outline. IDs are produced with the same
 * `github-slugger` algorithm `rehype-slug` uses inside the render
 * pipeline, so clicking a TOC entry with `document.getElementById(id)`
 * resolves to the real DOM heading.
 *
 * Duplicate-heading uniqueness (`intro`, `intro-1`, `intro-2`…) is
 * handled per-document by a fresh Slugger instance, matching
 * rehype-slug's per-file behaviour.
 */

export interface TocEntry {
  /** Header level 1-6 (h1=1, h6=6). */
  depth: number
  /** Stable slug assigned by github-slugger; matches the DOM id. */
  id: string
  /** Text content with inline markdown stripped. */
  text: string
}

const FENCE_RE = /^\s{0,3}(```|~~~)/

/** Strip the inline markdown formatting that commonly shows up in
 *  headings (`**bold**`, `*italic*`, `_italic_`, `` `code` ``,
 *  `[text](url)`, `\1` escapes). Good-enough — not a full parser. */
function stripInline(raw: string): string {
  let s = raw
  // Links: [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Bold / italic / strike wrappers
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/\*([^*]+)\*/g, '$1')
  s = s.replace(/_([^_]+)_/g, '$1')
  s = s.replace(/~~([^~]+)~~/g, '$1')
  // Inline code
  s = s.replace(/`([^`]+)`/g, '$1')
  // Leading/trailing `#` (closed ATX headers: `## Heading ##`)
  s = s.replace(/\s+#+\s*$/, '')
  return s.trim()
}

export function extractHeadings(markdown: string): TocEntry[] {
  if (!markdown) return []
  const slugger = new GithubSlugger()
  const entries: TocEntry[] = []
  const lines = markdown.split(/\r?\n/)
  let inFence = false

  for (const line of lines) {
    // Skip fenced code blocks so `# inside backticks` isn't parsed.
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const m = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/)
    if (!m) continue

    const depth = m[1].length
    const text = stripInline(m[2])
    if (!text) continue

    const id = slugger.slug(text)
    entries.push({ depth, id, text })
  }

  return entries
}
