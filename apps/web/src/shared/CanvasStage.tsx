import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export const CANVAS_WIDTH = 1440
export const CANVAS_HEIGHT = 900

function getCanvasScale() {
  if (typeof window === 'undefined') return 1
  return Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT, 1)
}

export function isCompactViewport() {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= 1280 || window.innerHeight <= 720
}

function useCanvasScale() {
  const [scale, setScale] = useState(getCanvasScale)

  useEffect(() => {
    const updateScale = () => setScale(getCanvasScale())
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  return scale
}

interface CanvasStageProps {
  children: ReactNode
}

/** 1440×900 고정 캔버스를 뷰포트에 맞춰 비율을 유지하며 축소한다. */
export function CanvasStage({ children }: CanvasStageProps) {
  const scale = useCanvasScale()

  return (
    <div className="prototype-viewport">
      <div className="canvas-stage" style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
        <div className="table-canvas" data-testid="canvas" style={{ transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
      <p className="small-screen-note">이 프로토타입은 최소 1280×720 PC 화면을 기준으로 설계되었습니다.</p>
    </div>
  )
}
