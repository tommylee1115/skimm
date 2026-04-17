import { safeStorage } from 'electron'
import type Store from 'electron-store'
import { log } from './log'

/**
 * Encrypted-at-rest storage for sensitive values. Uses Electron's safeStorage,
 * which on Windows is backed by DPAPI — the ciphertext can only be decrypted
 * by the same Windows user account on the same machine, so copying config.json
 * elsewhere yields an opaque blob.
 *
 * Secrets tracked here:
 *   - `apiKey`        — Claude API key (had a legacy plaintext field, migrated)
 *   - `openaiApiKey`  — OpenAI API key for TTS (new in 0.6.0; no migration)
 *
 * On-disk shape (inside electron-store) for each name N:
 *   - `${N}Encrypted` — base64-encoded ciphertext (new path, safeStorage result)
 *   - `${N}`          — plaintext (legacy; migrated and deleted on first launch)
 *
 * If safeStorage.isEncryptionAvailable() is false (happens on some Linux
 * configurations with no keyring, never on Windows in practice), we fall
 * back to plaintext so the app stays usable — and warn once in the log so
 * the issue is visible.
 */

type SecretStore = Store<{
  apiKey?: string
  apiKeyEncrypted?: string
  openaiApiKey?: string
  openaiApiKeyEncrypted?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}>

type SecretName = 'apiKey' | 'openaiApiKey'

interface Secrets {
  // Claude
  getApiKey(): string | null
  setApiKey(raw: string): void
  clearApiKey(): void
  hasApiKey(): boolean

  // OpenAI (TTS + Whisper)
  getOpenaiKey(): string | null
  setOpenaiKey(raw: string): void
  clearOpenaiKey(): void
  hasOpenaiKey(): boolean
}

let initialized = false
let encryptionAvailable = false
let storeRef: SecretStore | null = null

export function initSecrets(store: SecretStore): void {
  if (initialized) return
  initialized = true
  storeRef = store
  encryptionAvailable = safeStorage.isEncryptionAvailable()

  if (!encryptionAvailable) {
    log.warn(
      '[secrets] safeStorage.isEncryptionAvailable() === false. ' +
        'Secrets will be stored in plaintext. This should not happen on Windows.'
    )
  }

  // One-shot migration: any legacy plaintext `apiKey` (Claude) gets
  // re-stored as `apiKeyEncrypted` and the plaintext field deleted.
  // OpenAI keys had no plaintext field before 0.6.0, so nothing to migrate.
  const legacy = store.get('apiKey') as string | undefined
  if (typeof legacy === 'string' && legacy.length > 0) {
    log.info('[secrets] migrating legacy plaintext apiKey → apiKeyEncrypted')
    writeSecret('apiKey', legacy)
    store.delete('apiKey')
  }
}

function requireStore(): SecretStore {
  if (!storeRef) {
    throw new Error('secrets.ts used before initSecrets() — call from main startup first.')
  }
  return storeRef
}

function writeSecret(name: SecretName, raw: string): void {
  const store = requireStore()
  const encKey = `${name}Encrypted`
  if (!raw) {
    store.delete(encKey)
    store.delete(name)
    return
  }
  if (encryptionAvailable) {
    const encrypted = safeStorage.encryptString(raw)
    store.set(encKey, encrypted.toString('base64'))
    store.delete(name)
  } else {
    // No safeStorage → plaintext fallback. Already warned once in init.
    store.set(name, raw)
  }
}

function readSecret(name: SecretName): string | null {
  const store = requireStore()
  const encrypted = store.get(`${name}Encrypted`) as string | undefined
  if (typeof encrypted === 'string' && encrypted.length > 0 && encryptionAvailable) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch (err) {
      log.error(
        `[secrets] decrypt failed for ${name} — keychain entry may be bound to a different user`,
        err
      )
      return null
    }
  }
  const plaintext = store.get(name) as string | undefined
  return typeof plaintext === 'string' && plaintext.length > 0 ? plaintext : null
}

export const secrets: Secrets = {
  getApiKey: () => readSecret('apiKey'),
  setApiKey: (raw) => writeSecret('apiKey', raw),
  clearApiKey: () => writeSecret('apiKey', ''),
  hasApiKey: () => readSecret('apiKey') !== null,

  getOpenaiKey: () => readSecret('openaiApiKey'),
  setOpenaiKey: (raw) => writeSecret('openaiApiKey', raw),
  clearOpenaiKey: () => writeSecret('openaiApiKey', ''),
  hasOpenaiKey: () => readSecret('openaiApiKey') !== null
}
