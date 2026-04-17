import { resolve } from 'path'
import { readFile, stat } from 'fs/promises'
import type Store from 'electron-store'

/**
 * Path allow-list + safe reader for Skimm's markdown workspace.
 *
 * The renderer cannot freely ask main to read any path. Only files the
 * user has explicitly opened (via dialog, drag-drop, or a previously
 * persisted workspace entry) are read. This closes the arbitrary-path
 * traversal gap — a compromised renderer cannot ask for SSH keys,
 * browser cookies, or %APPDATA% configs.
 *
 * Hard size cap (10 MB) on every read. Extension gate accepts
 * .md / .markdown / .txt only.
 */

const READ_ALLOWED_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

const allowedReadPaths = new Set<string>()

function normalize(p: string): string {
  // Absolute-resolve + case-fold so `.`/`..` and mixed slashes can't smuggle
  // a mismatch between allow-list entry and read request.
  return resolve(p).toLowerCase()
}

export function registerAllowedPath(p: string): void {
  if (!p) return
  allowedReadPaths.add(normalize(p))
}

export function isPathAllowed(p: string): boolean {
  return allowedReadPaths.has(normalize(p))
}

export function hasAllowedExtension(p: string): boolean {
  const lower = p.toLowerCase()
  for (const ext of READ_ALLOWED_EXTENSIONS) {
    if (lower.endsWith(ext)) return true
  }
  return false
}

/**
 * Seed the allow-list from persisted workspace state so session restore
 * (which fires file:read for each saved path) can succeed before the user
 * interacts with any dialog this session.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function seedAllowedPathsFromStore(store: Store<any>): void {
  const persistedRoot = store.get('workspace.files') as string[] | undefined
  if (Array.isArray(persistedRoot)) {
    for (const p of persistedRoot) if (typeof p === 'string') registerAllowedPath(p)
  }
  const persistedFolders = store.get('workspace.folders') as
    | Array<{ files?: string[] }>
    | undefined
  if (Array.isArray(persistedFolders)) {
    for (const folder of persistedFolders) {
      if (!folder || !Array.isArray(folder.files)) continue
      for (const p of folder.files) if (typeof p === 'string') registerAllowedPath(p)
    }
  }
  const persistedOpen = store.get('session.openFiles') as string[] | undefined
  if (Array.isArray(persistedOpen)) {
    for (const p of persistedOpen) if (typeof p === 'string') registerAllowedPath(p)
  }
  // Future-proof: the Phase 3.6 combined session blob (`session`) may
  // include openFiles nested inside.
  const session = store.get('session') as { openFiles?: string[] } | undefined
  if (session && Array.isArray(session.openFiles)) {
    for (const p of session.openFiles) if (typeof p === 'string') registerAllowedPath(p)
  }
}

export async function safeReadFile(
  filePath: string
): Promise<{ path: string; content: string }> {
  if (!isPathAllowed(filePath)) {
    throw new Error(
      'File not authorized. Open via the file dialog or drag-and-drop first.'
    )
  }
  if (!hasAllowedExtension(filePath)) {
    throw new Error('Only .md, .markdown, and .txt files can be opened.')
  }
  const s = await stat(filePath)
  if (!s.isFile()) throw new Error('Path is not a regular file.')
  if (s.size > MAX_FILE_BYTES) {
    throw new Error(
      `File too large (${(s.size / 1024 / 1024).toFixed(1)} MB). Skimm limits reads to ${MAX_FILE_BYTES / 1024 / 1024} MB.`
    )
  }
  const content = await readFile(filePath, 'utf-8')
  return { path: filePath, content }
}
