import { ipcMain } from 'electron'
import {
  saveCard,
  getAllCards,
  deleteCard,
  searchCards
} from '../services/study-cards'
import type { StudyCard } from '../../shared/study.types'

export function registerCardsIpc(): void {
  ipcMain.handle('cards:save', (_event, card: StudyCard) => saveCard(card))
  ipcMain.handle('cards:list', () => getAllCards())
  ipcMain.handle('cards:delete', (_event, id: string) => deleteCard(id))
  ipcMain.handle('cards:search', (_event, query: string) => searchCards(query))
}
