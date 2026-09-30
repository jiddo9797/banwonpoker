import { expect, test } from '@playwright/test'
import { expectNoOverflow, freezeClock, openPage, scenarios, viewports } from './helpers'

test.describe('메인 테이블 시각 회귀', () => {
  for (const viewport of viewports) {
    test.describe(viewport.name, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } })

      for (const scenario of scenarios) {
        test(`${scenario}`, async ({ page }) => {
          await openPage(page, `?scenario=${scenario}`)
          await expectNoOverflow(page)
          await expect(page).toHaveScreenshot(`table-${scenario}-${viewport.name}.png`)
        })
      }
    })
  }

  test('1280×720에서는 캔버스를 0.8배로 줄이고 로그 패널을 접는다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await openPage(page, '?scenario=my')

    const box = await page.getByTestId('canvas').boundingBox()
    expect(box?.width).toBeCloseTo(1152, 0)
    expect(box?.height).toBeCloseTo(720, 0)
    await expect(page.getByRole('button', { name: /펼치기/ })).toHaveAttribute('aria-expanded', 'false')

    // 액션 영역이 화면 밖으로 잘리지 않는다.
    const actions = await page.getByRole('region', { name: '포커 액션' }).boundingBox()
    expect(actions).not.toBeNull()
    expect(actions!.y + actions!.height).toBeLessThanOrEqual(720)
    expect(actions!.x + actions!.width).toBeLessThanOrEqual(1280)
  })
})

test.describe('준비·복기 화면 시각 회귀', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  const screens = [
    ['entry', '?screen=entry'],
    ['seat', '?screen=seat'],
    ['consent', '?screen=consent'],
    ['mic-idle', '?screen=mic'],
    ['mic-ready', '?screen=mic&mic=ready'],
    ['mic-denied', '?screen=mic&mic=denied'],
    ['mic-not-found', '?screen=mic&mic=not-found'],
    ['summary', '?screen=summary'],
    ['replay', '?screen=replay&hand=24&action=13'],
    ['replay-showdown', '?screen=replay&hand=24&action=23'],
    ['export-options', '?screen=replay&hand=24&export=options'],
    ['export-generating', '?screen=replay&hand=24&export=generating'],
    ['export-done', '?screen=replay&hand=24&export=done'],
    ['export-failed', '?screen=replay&hand=24&export=failed'],
  ] as const

  for (const [name, query] of screens) {
    test(name, async ({ page }) => {
      await freezeClock(page)
      await openPage(page, query)
      await expectNoOverflow(page)
      await expect(page).toHaveScreenshot(`${name}.png`)
    })
  }

  test('나가기 확인창', async ({ page }) => {
    await openPage(page, '?scenario=my')
    await page.getByRole('button', { name: '나가기' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page).toHaveScreenshot('dialog-leave.png')
  })

  test('세션 종료 메뉴와 확인창', async ({ page }) => {
    await openPage(page, '?scenario=opp')
    await page.getByRole('button', { name: '메뉴' }).click()
    await expect(page).toHaveScreenshot('menu-open.png')
    await page.getByRole('button', { name: /세션 종료/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page).toHaveScreenshot('dialog-end-session.png')
  })
})
