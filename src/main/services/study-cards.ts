import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { StudyCard } from '../../shared/study.types'

export type { StudyCard }

let db: Database.Database | null = null

export function initDatabase(): void {
  const dbDir = join(app.getPath('userData'))
  mkdirSync(dbDir, { recursive: true })
  const dbPath = join(dbDir, 'study-cards.db')

  db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS study_cards (
      id TEXT PRIMARY KEY,
      selected_text TEXT NOT NULL,
      selection_type TEXT NOT NULL,
      explanation TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'ko',
      context TEXT NOT NULL DEFAULT '',
      source_file TEXT NOT NULL DEFAULT '',
      saved_at TEXT NOT NULL
    )
  `)
}

export function saveCard(card: StudyCard): void {
  if (!db) return
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO study_cards
    (id, selected_text, selection_type, explanation, language, context, source_file, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    card.id,
    card.selected_text,
    card.selection_type,
    card.explanation,
    card.language,
    card.context,
    card.source_file,
    card.saved_at
  )
}

export function getAllCards(): StudyCard[] {
  if (!db) return []
  return db.prepare('SELECT * FROM study_cards ORDER BY saved_at DESC').all() as StudyCard[]
}

export function deleteCard(id: string): void {
  if (!db) return
  db.prepare('DELETE FROM study_cards WHERE id = ?').run(id)
}

export function searchCards(query: string): StudyCard[] {
  if (!db) return []
  return db.prepare(
    `SELECT * FROM study_cards
     WHERE selected_text LIKE ? OR explanation LIKE ? OR context LIKE ?
     ORDER BY saved_at DESC`
  ).all(`%${query}%`, `%${query}%`, `%${query}%`) as StudyCard[]
}
