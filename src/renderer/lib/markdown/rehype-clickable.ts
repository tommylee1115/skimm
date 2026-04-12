/**
 * rehype-clickable: wraps each word in text nodes into
 * <span data-word data-offset="N"> elements so they can be
 * clicked for AI explanations and highlighted for TTS.
 *
 * Uses a post-order traversal to avoid re-visiting new nodes.
 */
import type { Root, Element, Text, ElementContent } from 'hast'

// Tags whose text content should NOT be made clickable
const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'a'])

export function rehypeClickable() {
  return (tree: Root) => {
    let globalOffset = 0

    function processNode(node: Root | Element): void {
      if (node.type === 'element' && SKIP_TAGS.has((node as Element).tagName)) {
        // Still count the text length for offset tracking
        globalOffset += getTextLength(node)
        return
      }

      const newChildren: ElementContent[] = []
      let changed = false

      for (const child of node.children) {
        if (child.type === 'text') {
          const wrapped = wrapWords(child)
          if (wrapped.length > 0) {
            newChildren.push(...wrapped)
            changed = true
          } else {
            newChildren.push(child)
          }
        } else if (child.type === 'element') {
          // Recurse into child elements first
          processNode(child)
          newChildren.push(child)
        } else {
          newChildren.push(child as ElementContent)
        }
      }

      if (changed) {
        node.children = newChildren as typeof node.children
      }
    }

    function wrapWords(textNode: Text): ElementContent[] {
      const text = textNode.value
      if (!text.trim()) {
        globalOffset += text.length
        return []
      }

      const result: ElementContent[] = []
      const parts = text.split(/(\s+)/)

      for (const part of parts) {
        if (!part) continue

        if (/^\s+$/.test(part)) {
          result.push({ type: 'text', value: part })
          globalOffset += part.length
        } else {
          const span: Element = {
            type: 'element',
            tagName: 'span',
            properties: {
              dataWord: true,
              dataOffset: globalOffset,
              className: ['clickable-word']
            },
            children: [{ type: 'text', value: part }]
          }
          result.push(span)
          globalOffset += part.length
        }
      }

      return result
    }

    // Process the tree manually (no `visit`) to avoid re-visiting new nodes
    processNode(tree)
  }
}

function getTextLength(node: Element): number {
  let len = 0
  for (const child of node.children) {
    if (child.type === 'text') len += child.value.length
    else if (child.type === 'element') len += getTextLength(child)
  }
  return len
}
