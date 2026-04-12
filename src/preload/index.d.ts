import type { SkimmApi } from './index'

declare global {
  interface Window {
    api: SkimmApi
  }
}
