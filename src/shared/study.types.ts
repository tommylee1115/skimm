/**
 * Study card types shared across main (SQLite layer), preload (IPC), and
 * renderer (UI). Same shape as the SQLite row so no mapping is needed.
 */

export interface StudyCard {
  id: string
  selected_text: string
  selection_type: 'word' | 'phrase' | 'sentence'
  explanation: string
  language: string
  context: string
  source_file: string
  saved_at: string
}
