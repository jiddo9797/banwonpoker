import '@fontsource-variable/inter/wght.css'
import '@fontsource/pretendard/400.css'
import '@fontsource/pretendard/500.css'
import '@fontsource/pretendard/600.css'
import '@fontsource/pretendard/700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('애플리케이션 루트 요소를 찾을 수 없습니다.')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
