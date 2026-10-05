// 한글 글리프를 유니코드 범위별 작은 woff2로 나눈 가변 폰트. 화면에 쓰인 글자 범위만 내려받는다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
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
