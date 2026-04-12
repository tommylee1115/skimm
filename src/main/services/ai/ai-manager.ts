import { ClaudeProvider } from './claude.provider'
import type { AIProvider } from './provider.interface'

class AIManager {
  private provider: AIProvider
  private claudeProvider: ClaudeProvider

  constructor() {
    this.claudeProvider = new ClaudeProvider()
    this.provider = this.claudeProvider
  }

  setApiKey(key: string): void {
    this.claudeProvider.setApiKey(key)
  }

  getProvider(): AIProvider {
    return this.provider
  }
}

export const aiManager = new AIManager()
