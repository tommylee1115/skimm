/**
 * Shared types for the TTS hook family.
 *
 * The coordinator (index.ts) owns all state; the per-engine files
 * (web-speech-engine.ts, openai-engine.ts) are pure functions that
 * report progress via EngineCallbacks and expose control via
 * EngineHandle. Tokens let the coordinator atomically invalidate
 * in-flight engine callbacks — any event with ourToken !== getToken()
 * is stale and must no-op.
 */

export interface TtsChunk {
  /** Exact string passed to the TTS engine. */
  text: string
  /** DOM spans in document order whose text makes up `text`. */
  spans: HTMLElement[]
  /** Char offset of each span's first char in `text`. */
  spanCharStarts: number[]
  /** Global span index of this chunk's first span across the whole doc. */
  startGlobalIndex: number
  /** Rough duration at rate 1.0 for scrubber display. */
  estimatedDurationMs: number
}

export interface EngineCallbacks {
  /** The playToken captured when this engine run was started. */
  ourToken: number
  /** Getter so the engine can re-read the live token on each callback. */
  getToken: () => number

  onLoadingEnd(): void
  onPlaybackStart(): void
  /** Fires when a new word within the chunk becomes active. */
  onWordAdvance(localSpanIdx: number): void
  /** Fires on scrubber time updates; `elapsedInChunkMs` is chunk-local. */
  onTimeUpdate(elapsedInChunkMs: number): void
  /** Fires when the chunk finishes naturally (not cancelled). */
  onChunkEnd(): void
  onError(msg: string): void
}

/**
 * Handle returned by engine start functions. Coordinator calls these
 * to control the currently active chunk.
 */
export interface EngineHandle {
  pause(): void
  resume(): void
  /** Tear down this engine run. Idempotent. */
  cancel(): void
  /**
   * Try to seek to a span inside the currently loaded chunk without
   * re-synthesising. Returns true if the engine handled the seek
   * in-place; false means the coordinator must cancel + restart.
   */
  seekWithinChunk(targetChunkIdx: number, currentChunkIdx: number, targetSpanLocalIdx: number): boolean
}
