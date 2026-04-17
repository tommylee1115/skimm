import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Wrap a pane (MainPane, AiPanel, etc.) in this boundary so a thrown error
 * in one subtree doesn't blank the entire window. The fallback offers a
 * "Reload pane" button that resets the boundary's state — the child subtree
 * re-mounts and (hopefully) rehydrates from stores.
 *
 * Errors are logged to console.error; in the main process they're
 * spy-captured by electron-log into %APPDATA%/skimm/logs/main.log, so
 * stacks survive across restarts.
 */

interface Props {
  label?: string
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}] render crashed`,
      error,
      info.componentStack
    )
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center"
        style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
      >
        <AlertTriangle size={32} style={{ color: '#e57373' }} strokeWidth={1.5} />
        <div>
          <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>
            {this.props.label ? `${this.props.label} crashed` : 'Something crashed'}
          </div>
          <div
            className="mt-2"
            style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 400 }}
          >
            {this.state.error.message || String(this.state.error)}
          </div>
        </div>
        <button
          onClick={this.reset}
          className="flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer transition-colors"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            fontSize: 12
          }}
        >
          <RotateCcw size={12} />
          Reload {this.props.label ?? 'pane'}
        </button>
        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Details are in %APPDATA%\skimm\logs\main.log
        </div>
      </div>
    )
  }
}
