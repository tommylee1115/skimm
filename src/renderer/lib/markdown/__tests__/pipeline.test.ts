import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { processMarkdown } from '../pipeline'

/**
 * Pipeline-level regression tests. We render the produced React tree
 * to HTML (SSR) and inspect the actual DOM-level output — that is what
 * the reader pane ultimately mounts, so it catches any prop dropped by
 * the custom `span` component wiring in rehype-react.
 */

function renderMarkdown(md: string): string {
  const tree = processMarkdown(md, {
    chunkingLevel: 'none',
    beelineEnabled: false,
    onWordClick: () => undefined
  })
  return renderToStaticMarkup(tree)
}

describe('processMarkdown → KaTeX', () => {
  it('preserves inline styles on KaTeX-generated spans', () => {
    // Display math with a fraction, a subscript, an accent, and a sum.
    // Each construct relies on inline `style="top:...;height:...;
    // margin-right:...;vertical-align:..."` emitted by KaTeX. Stripping
    // those (e.g. by forwarding only className through rehype-react)
    // makes fractions and subscripts collapse to the baseline.
    const md = String.raw`$$\hat{\beta}_1 = \beta_1 + \frac{\sum(x_i-\bar{x})u_i}{\sum(x_i-\bar{x})^2}$$`
    const html = renderMarkdown(md)

    // Fraction bar — rendered via <span class="frac-line"
    // style="border-bottom-width:0.04em"/>. Without the inline style,
    // the bar vanishes.
    expect(html).toMatch(/class="frac-line"[^>]*style="[^"]*border-bottom-width/)

    // vlist rows carry their row heights inline — they drive the
    // numerator/denominator vertical stacking.
    expect(html).toMatch(/class="vlist"[^>]*style="[^"]*height/)

    // Stretched struts anchor each row's baseline.
    expect(html).toMatch(/class="strut"[^>]*style="[^"]*vertical-align/)

    // Subscript/superscript and accent offsets use top positioning.
    expect(html).toMatch(/style="[^"]*top:\s*-?\d/)
  })

  it('marks the KaTeX MathML twin as aria-hidden off of the HTML pane', () => {
    const md = '$x=1$'
    const html = renderMarkdown(md)
    // The visual .katex-html subtree should carry aria-hidden so screen
    // readers use the MathML twin instead.
    expect(html).toMatch(/class="katex-html"[^>]*aria-hidden="true"/)
  })
})
