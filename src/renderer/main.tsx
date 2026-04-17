import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'
// KaTeX renders equations into spans that use these layout rules and fonts.
// Vite bundles the referenced font files automatically.
import 'katex/dist/katex.min.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
