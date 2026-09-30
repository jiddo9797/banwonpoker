import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 앱은 1440×900 캔버스를 기준으로 한다. jsdom 기본값(1024×768)은 좁은 화면으로 취급되어 패널이 접힌다.
Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 })
Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 900 })

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})
