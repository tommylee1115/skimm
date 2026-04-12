/**
 * remark-chunk: splits text nodes at sentence/clause boundaries
 * and inserts visual gap markers between them.
 *
 * Uses Intl.Segmenter for sentence detection.
 * For clause-level splitting, additionally splits on semicolons,
 * em dashes, and colons followed by text.
 */
import type { Root, Text, PhrasingContent } from 'mdast'
import { visit } from 'unist-util-visit'

export type ChunkingLevel = 'none' | 'sentence' | 'clause'

interface Options {
  level?: ChunkingLevel
}

const CLAUSE_SPLIT_PATTERN = /(?<=[;:—–])\s+/

function splitIntoSentences(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
    return Array.from(segmenter.segment(text), (s) => s.segment)
  }
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean)
}

function splitIntoClauses(text: string): string[] {
  const sentences = splitIntoSentences(text)
  const clauses: string[] = []
  for (const sentence of sentences) {
    const parts = sentence.split(CLAUSE_SPLIT_PATTERN).filter(Boolean)
    clauses.push(...parts)
  }
  return clauses
}

export function remarkChunk(options: Options = {}) {
  const level = options.level ?? 'sentence'

  return (tree: Root) => {
    if (level === 'none') return

    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return
      if (parent.type !== 'paragraph') return

      const text = node.value
      const chunks = level === 'clause' ? splitIntoClauses(text) : splitIntoSentences(text)

      if (chunks.length <= 1) return

      // Build replacement nodes: text, break, text, break, ...
      // Use a text node with just a newline as the gap marker.
      // The gap styling is handled via CSS on paragraphs.
      const newNodes: PhrasingContent[] = []
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) {
          // Insert a break element as a chunk separator
          newNodes.push({
            type: 'break'
          } as PhrasingContent)
        }
        newNodes.push({ type: 'text', value: chunks[i] })
      }

      parent.children.splice(index, 1, ...newNodes)
      return index + newNodes.length
    })
  }
}
