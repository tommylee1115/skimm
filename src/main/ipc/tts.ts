import { ipcMain } from 'electron'
import { hasOpenAIKey } from '../services/tts/openai-key'
import { openAiSynthesize } from '../services/tts/openai-tts.service'
import { openAiTranscribe } from '../services/tts/whisper-transcribe.service'
import type { OpenAIModel, OpenAIVoice } from '../../shared/tts.types'

export function registerTtsIpc(): void {
  ipcMain.handle('tts:openai-available', () => hasOpenAIKey())

  ipcMain.handle(
    'tts:openai-synthesize',
    async (
      _event,
      text: string,
      voice: OpenAIVoice,
      speed: number,
      model: OpenAIModel
    ) => {
      return await openAiSynthesize(text, voice, speed, model)
    }
  )

  ipcMain.handle('tts:openai-transcribe', async (_event, audioBase64: string) => {
    return await openAiTranscribe(audioBase64)
  })
}
