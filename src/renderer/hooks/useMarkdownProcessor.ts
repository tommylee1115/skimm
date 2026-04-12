import { useMemo } from 'react'
import { processMarkdown } from '@/lib/markdown/pipeline'
import { useReaderStore } from '@/stores/reader.store'
import type { ReactElement } from 'react'

export function useMarkdownProcessor(
  markdown: string,
  onWordClick?: (word: string, offset: number, context: string, altKey: boolean) => void
): ReactElement | null {
  const chunkingLevel = useReaderStore((s) => s.chunkingLevel)
  const beelineEnabled = useReaderStore((s) => s.beelineEnabled)

  return useMemo(() => {
    if (!markdown) return null
    return processMarkdown(markdown, {
      chunkingLevel,
      beelineEnabled,
      onWordClick
    })
  }, [markdown, chunkingLevel, beelineEnabled, onWordClick])
}
