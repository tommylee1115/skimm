export function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

/** Last path segment before the filename. Empty string when the path is
 *  just a bare name with no parent (edge case). */
export function parentFolderFromPath(path: string): string {
  const parts = path.split(/[/\\]/)
  // [..., parent, file] — parent is parts[parts.length - 2].
  if (parts.length < 2) return ''
  return parts[parts.length - 2]
}

/**
 * Tab label that disambiguates on basename collision across the open
 * tab set. If two tabs share a basename, both get a `·` parent-folder
 * suffix so the user can tell them apart.
 *
 *   chapter-04.md         — unique
 *   chapter-04.md · ECO-3137  — collides with another tab
 */
export function displayNameForTab(path: string, allOpenPaths: string[]): string {
  const name = fileNameFromPath(path)
  const collides =
    allOpenPaths.filter((p) => p !== path && fileNameFromPath(p) === name).length > 0
  if (!collides) return name
  const parent = parentFolderFromPath(path)
  return parent ? `${name} · ${parent}` : name
}
