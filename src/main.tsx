import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class RootErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unknown error' }
  }

  componentDidCatch(error: Error) {
    console.error('[RootErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
          <h2 style={{ marginBottom: 8 }}>Ошибка загрузки интерфейса</h2>
          <p style={{ opacity: 0.8, marginBottom: 12 }}>Встроенный браузер VS Code может блокировать часть API.</p>
          <p style={{ opacity: 0.8, marginBottom: 8 }}>Подробности: {this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', cursor: 'pointer' }}
          >
            Перезагрузить
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
