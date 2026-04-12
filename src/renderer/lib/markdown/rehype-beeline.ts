/**
 * rehype-beeline: assigns rotating gradient colors to sentences
 * to help eyes track from line to line (BeeLine Reader-style).
 *
 * Each sentence-level text block gets a CSS custom property
 * --line-hue that cycles through a palette.
 */
import type { Root, Element } from 'hast'
import { visit } from 'unist-util-visit'

const PALETTE_SIZE = 6
const BASE_HUE = 210 // start from blue-ish
const HUE_STEP = 40

let sentenceIndex = 0

export function rehypeBeeline() {
  return (tree: Root) => {
    sentenceIndex = 0

    visit(tree, 'element', (node: Element) => {
      // Apply to paragraph-level elements
      if (node.tagName === 'p') {
        const hue = BASE_HUE + (sentenceIndex % PALETTE_SIZE) * HUE_STEP
        node.properties = node.properties || {}
        node.properties.style = `--line-hue: ${hue};`
        node.properties.className = [
          ...((node.properties.className as string[]) || []),
          'beeline-line'
        ]
        sentenceIndex++
      }
    })
  }
}
