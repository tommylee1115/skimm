/**
 * Slim drop target for moving files back to root. Visible only while a
 * custom file drag is in progress. Drop handling lives in the parent's
 * mouseup — this component is purely visual and acts as a probe target
 * for elementFromPoint (via the data-skimm-root-zone attribute).
 */
export function RootDropZone({
  isFileDragging,
  isHighlighted
}: {
  isFileDragging: boolean
  isHighlighted: boolean
}) {
  if (!isFileDragging) return null

  return (
    <div
      data-skimm-root-zone=""
      className="mx-2 my-1 px-2 py-1.5 rounded text-[11px] text-center"
      style={{
        border: '1px dashed var(--border-primary)',
        color: isHighlighted ? 'var(--text-primary)' : 'var(--text-muted)',
        background: isHighlighted ? 'var(--bg-active)' : 'transparent'
      }}
    >
      Drop here to move to root
    </div>
  )
}
