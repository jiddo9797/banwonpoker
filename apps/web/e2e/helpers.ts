import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export const scenarios = ['opp', 'my', 'pending', 'fold', 'allin', 'showdown', 'disc', 'micfail'] as const

export const viewports = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x720', width: 1280, height: 720 },
] as const

/** 페이지를 열고 폰트 로딩이 끝날 때까지 기다린다. */
export async function openPage(page: Page, query: string) {
  await page.goto(`/${query}`)
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

/** 가로·세로 스크롤이 생기지 않는지 확인한다. */
export async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - window.innerWidth,
    vertical: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(overflow).toEqual({ horizontal: 0, vertical: 0 })
}

/** 타이머가 흐르지 않도록 시계를 멈춘다. 생성 중처럼 시간에 따라 바뀌는 화면을 찍을 때 쓴다. */
export async function freezeClock(page: Page) {
  const start = new Date('2026-09-30T12:00:00+09:00')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1_000))
}
