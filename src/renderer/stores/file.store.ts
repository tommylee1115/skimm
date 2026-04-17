import { create } from 'zustand'

export interface OpenFile {
  id: string
  path: string
  name: string
  content: string
}

export interface VirtualFolder {
  id: string
  name: string
  files: string[]          // absolute md paths stored in this folder
  collapsed: boolean
}

interface FileStore {
  // Root-level files in the Explorer (not inside any virtual folder).
  workspaceFiles: string[]
  // App-internal folders that group md paths. Not real directories on disk.
  folders: VirtualFolder[]
  // Files currently open as tabs in the reading pane.
  openFiles: OpenFile[]
  activeFileId: string | null

  openFile: (path: string, content: string) => void
  openFromPath: (path: string) => Promise<void>
  closeFile: (id: string) => void
  setActiveFile: (id: string) => void
  setContent: (id: string, content: string) => void
  addToWorkspace: (path: string) => void
  removeFromWorkspace: (path: string) => void

  createFolder: (name: string) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  toggleFolderCollapsed: (id: string) => void
  moveFileToFolder: (path: string, folderId: string | null) => void

  restoreSession: () => Promise<void>
}

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

// Combined session blob. One IPC round-trip per tab operation instead of
// two. Main's settings handler and file-access allow-list both accept the
// new `session` key and the legacy `session.openFiles` / `session.activeFile`
// keys, so old persisted state still restores cleanly on first run.
interface SessionBlob {
  openFiles: string[]
  activeFile: string | null
}

function persistOpenFiles(files: OpenFile[], activeId: string | null): void {
  const session: SessionBlob = {
    openFiles: files.map((f) => f.path),
    activeFile: files.find((f) => f.id === activeId)?.path ?? null
  }
  window.api.settings.set('session', session)
}

function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) =>
    fileNameFromPath(a).localeCompare(fileNameFromPath(b), undefined, { sensitivity: 'base' })
  )
}

function persistWorkspace(paths: string[]): void {
  window.api.settings.set('workspace.files', paths)
}

function persistFolders(folders: VirtualFolder[]): void {
  window.api.settings.set('workspace.folders', folders)
}

export const useFileStore = create<FileStore>((set, get) => ({
  workspaceFiles: [],
  folders: [],
  openFiles: [],
  activeFileId: null,

  openFile: (path, content) => {
    const existing = get().openFiles.find((f) => f.path === path)
    if (existing) {
      set({ activeFileId: existing.id })
      persistOpenFiles(get().openFiles, existing.id)
      get().addToWorkspace(path)
      return
    }
    const id = crypto.randomUUID()
    const file: OpenFile = { id, path, name: fileNameFromPath(path), content }
    set((s) => {
      const openFiles = [...s.openFiles, file]
      persistOpenFiles(openFiles, id)
      return { openFiles, activeFileId: id }
    })
    get().addToWorkspace(path)
  },

  openFromPath: async (path) => {
    const existing = get().openFiles.find((f) => f.path === path)
    if (existing) {
      get().setActiveFile(existing.id)
      return
    }
    try {
      const result = await window.api.file.read(path)
      get().openFile(result.path, result.content)
    } catch {
      // File may have been moved/deleted — leave workspace entry alone for now
    }
  },

  closeFile: (id) => {
    set((s) => {
      const openFiles = s.openFiles.filter((f) => f.id !== id)
      const activeFileId =
        s.activeFileId === id ? (openFiles[openFiles.length - 1]?.id ?? null) : s.activeFileId
      persistOpenFiles(openFiles, activeFileId)
      return { openFiles, activeFileId }
    })
  },

  setActiveFile: (id) => {
    set({ activeFileId: id })
    persistOpenFiles(get().openFiles, id)
  },

  setContent: (id, content) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) => (f.id === id ? { ...f, content } : f))
    }))
  },

  addToWorkspace: (path) => {
    set((s) => {
      if (s.workspaceFiles.includes(path)) return s
      if (s.folders.some((f) => f.files.includes(path))) return s
      const workspaceFiles = sortPaths([...s.workspaceFiles, path])
      persistWorkspace(workspaceFiles)
      return { workspaceFiles }
    })
  },

  removeFromWorkspace: (path) => {
    set((s) => {
      const workspaceFiles = s.workspaceFiles.filter((p) => p !== path)
      const folders = s.folders.map((f) =>
        f.files.includes(path) ? { ...f, files: f.files.filter((p) => p !== path) } : f
      )

      const tab = s.openFiles.find((f) => f.path === path)
      let openFiles = s.openFiles
      let activeFileId = s.activeFileId
      if (tab) {
        openFiles = openFiles.filter((f) => f.id !== tab.id)
        activeFileId =
          activeFileId === tab.id ? (openFiles[openFiles.length - 1]?.id ?? null) : activeFileId
        persistOpenFiles(openFiles, activeFileId)
      }

      persistWorkspace(workspaceFiles)
      persistFolders(folders)
      return { workspaceFiles, folders, openFiles, activeFileId }
    })
  },

  createFolder: (name) => {
    const id = crypto.randomUUID()
    set((s) => {
      const folders = [...s.folders, { id, name: name.trim() || 'New folder', files: [], collapsed: false }]
      persistFolders(folders)
      return { folders }
    })
    return id
  },

  renameFolder: (id, name) => {
    set((s) => {
      const folders = s.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f))
      persistFolders(folders)
      return { folders }
    })
  },

  deleteFolder: (id) => {
    set((s) => {
      const folder = s.folders.find((f) => f.id === id)
      if (!folder) return s
      // Files inside the deleted folder return to root
      const workspaceFiles = [...s.workspaceFiles]
      for (const path of folder.files) {
        if (!workspaceFiles.includes(path)) workspaceFiles.push(path)
      }
      const folders = s.folders.filter((f) => f.id !== id)
      const sorted = sortPaths(workspaceFiles)
      persistFolders(folders)
      persistWorkspace(sorted)
      return { folders, workspaceFiles: sorted }
    })
  },

  toggleFolderCollapsed: (id) => {
    set((s) => {
      const folders = s.folders.map((f) =>
        f.id === id ? { ...f, collapsed: !f.collapsed } : f
      )
      persistFolders(folders)
      return { folders }
    })
  },

  moveFileToFolder: (path, folderId) => {
    set((s) => {
      // Remove path from root and from every folder first
      let workspaceFiles = s.workspaceFiles.filter((p) => p !== path)
      let folders = s.folders.map((f) =>
        f.files.includes(path) ? { ...f, files: f.files.filter((p) => p !== path) } : f
      )

      if (folderId === null) {
        if (!workspaceFiles.includes(path)) workspaceFiles = sortPaths([...workspaceFiles, path])
      } else {
        folders = folders.map((f) =>
          f.id === folderId ? { ...f, files: [...f.files, path] } : f
        )
      }

      persistWorkspace(workspaceFiles)
      persistFolders(folders)
      return { workspaceFiles, folders }
    })
  },

  restoreSession: async () => {
    // One batch hydration. Also reads legacy `session.openFiles` /
    // `session.activeFile` so existing installs still restore after the
    // Phase 3.6 upgrade.
    const persisted = await window.api.settings.getMany([
      'workspace.files',
      'workspace.folders',
      'session',
      'session.openFiles',
      'session.activeFile'
    ])

    const workspacePaths = persisted['workspace.files'] as string[] | undefined
    const savedFolders = persisted['workspace.folders'] as VirtualFolder[] | undefined
    const sessionBlob = persisted['session'] as
      | { openFiles?: string[]; activeFile?: string | null }
      | undefined
    const openPaths =
      (sessionBlob?.openFiles as string[] | undefined) ??
      (persisted['session.openFiles'] as string[] | undefined)
    const activePath =
      (sessionBlob?.activeFile ?? undefined) ??
      (persisted['session.activeFile'] as string | undefined)

    if (workspacePaths && workspacePaths.length > 0) {
      set({ workspaceFiles: sortPaths(workspacePaths) })
    }

    if (savedFolders && savedFolders.length > 0) {
      // Defensive: normalize in case older saved shape is missing fields
      const normalized = savedFolders.map((f) => ({
        id: f.id ?? crypto.randomUUID(),
        name: f.name ?? 'Untitled',
        files: Array.isArray(f.files) ? f.files : [],
        collapsed: typeof f.collapsed === 'boolean' ? f.collapsed : false
      }))
      set({ folders: normalized })
    }

    if (openPaths && openPaths.length > 0) {
      for (const path of openPaths) {
        try {
          const result = await window.api.file.read(path)
          get().openFile(result.path, result.content)
        } catch {
          // File may have been moved/deleted — skip it
        }
      }
    }

    if (activePath) {
      const file = get().openFiles.find((f) => f.path === activePath)
      if (file) set({ activeFileId: file.id })
    }
  }
}))
