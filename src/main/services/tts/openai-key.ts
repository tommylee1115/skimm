import { readFileSync, existsSync } from 'fs'

/**
 * Where Skimm looks for an OpenAI API key. Read once at startup, cached in
 * memory, never persisted to electron-store, never logged.
 */
const KEY_FILE_PATH = 'C:\\MGT4170\\ClassKeys\\classkey.env'

let cachedKey: string | null = null
let loaded = false

/**
 * Parse a dotenv-style line for OPENAI_API_KEY=... (quoted or unquoted).
 * Does not parse the whole env format — we only need this one key.
 */
function parseKey(contents: string): string | null {
  const lines = contents.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^\s*OPENAI_API_KEY\s*=\s*(.+?)\s*$/)
    if (!match) continue
    let value = match[1]
    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value.length > 0) return value
  }
  return null
}

/**
 * Load the OpenAI API key from the env file (or process.env as a fallback).
 * Idempotent — only reads the file once per app run.
 */
export function loadOpenAIKey(): string | null {
  if (loaded) return cachedKey
  loaded = true

  // 1. Check process.env first (lets users override without touching the file)
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0) {
    cachedKey = process.env.OPENAI_API_KEY
    console.log('[OpenAI] key loaded from process.env')
    return cachedKey
  }

  // 2. Fall back to the hardcoded classkey.env path
  try {
    if (!existsSync(KEY_FILE_PATH)) {
      console.log(`[OpenAI] no key file at ${KEY_FILE_PATH}`)
      return null
    }
    const contents = readFileSync(KEY_FILE_PATH, 'utf-8')
    const key = parseKey(contents)
    if (!key) {
      console.warn(`[OpenAI] key file present but OPENAI_API_KEY not found`)
      return null
    }
    cachedKey = key
    console.log(`[OpenAI] key loaded from ${KEY_FILE_PATH} (${key.length} chars)`)
    return cachedKey
  } catch (err) {
    console.error('[OpenAI] failed to read key file:', err instanceof Error ? err.message : err)
    return null
  }
}

export function hasOpenAIKey(): boolean {
  return loadOpenAIKey() !== null
}
