import { readFileSync, existsSync } from 'fs'
import { secrets } from '../secrets'

/**
 * Lookup order (first match wins):
 *   1. User-provided key saved via Settings → safeStorage-encrypted on disk
 *   2. `OPENAI_API_KEY` environment variable
 *   3. `C:\MGT4170\ClassKeys\classkey.env` — classroom-shared fallback
 *
 * The classroom path exists for the original course cohort and is bundled
 * into the build only by convention — it will be removed once every user
 * of Skimm outside that classroom has provided their own key via Settings.
 *
 * Values are never persisted anywhere outside the encrypted secrets store
 * and are never logged. The classroom-file path is cached after first read
 * for perf (avoids a disk hit per TTS call); the user-key path re-reads
 * from the secrets store every time so Settings changes take effect
 * immediately without a restart.
 */
const CLASSROOM_KEY_FILE_PATH = 'C:\\MGT4170\\ClassKeys\\classkey.env'

let classroomKeyCache: string | null = null
let classroomKeyChecked = false

function parseKey(contents: string): string | null {
  const lines = contents.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^\s*OPENAI_API_KEY\s*=\s*(.+?)\s*$/)
    if (!match) continue
    let value = match[1]
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

function loadClassroomKey(): string | null {
  if (classroomKeyChecked) return classroomKeyCache
  classroomKeyChecked = true
  try {
    if (!existsSync(CLASSROOM_KEY_FILE_PATH)) {
      console.log(`[OpenAI] no classroom key file at ${CLASSROOM_KEY_FILE_PATH}`)
      classroomKeyCache = null
      return null
    }
    const contents = readFileSync(CLASSROOM_KEY_FILE_PATH, 'utf-8')
    const key = parseKey(contents)
    if (!key) {
      console.warn('[OpenAI] classroom key file present but OPENAI_API_KEY not found')
      classroomKeyCache = null
      return null
    }
    classroomKeyCache = key
    console.log(
      `[OpenAI] classroom key loaded from ${CLASSROOM_KEY_FILE_PATH} (${key.length} chars)`
    )
    return classroomKeyCache
  } catch (err) {
    console.error(
      '[OpenAI] failed to read classroom key file:',
      err instanceof Error ? err.message : err
    )
    classroomKeyCache = null
    return null
  }
}

/**
 * Resolve the OpenAI API key for the current TTS / Whisper call. Returns
 * `null` if none of the three sources produced one — the renderer then
 * falls back to Web Speech.
 */
export function loadOpenAIKey(): string | null {
  // 1. User-provided (Settings → OpenAI API Key). Re-read every call so
  //    Save/Remove in Settings takes effect without a restart.
  const userKey = secrets.getOpenaiKey()
  if (userKey && userKey.length > 0) return userKey

  // 2. Environment variable — for developers / power users.
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0) {
    return process.env.OPENAI_API_KEY
  }

  // 3. Classroom-shared file. Cached after first read.
  return loadClassroomKey()
}

export function hasOpenAIKey(): boolean {
  return loadOpenAIKey() !== null
}
