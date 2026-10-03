import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openPage, scenarios } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }))
  expect(summary).toEqual([])
}

test.describe('axe 접근성 검사', () => {
  for (const scenario of scenarios) {
    test(`테이블 ${scenario}`, async ({ page }) => {
      await openPage(page, `?scenario=${scenario}`)
      await expectNoAxeViolations(page)
    })
  }

  test('테이블 참가자 탭', async ({ page }) => {
    await openPage(page, '?scenario=disc')
    await page.getByRole('tab', { name: '참가자' }).click()
    await expectNoAxeViolations(page)
  })

  const screens = [
    '?screen=create',
    '?screen=create&blinds=increasing',
    '?screen=entry',
    '?screen=seat',
    '?screen=consent',
    '?screen=mic',
    '?screen=mic&mic=ready',
    '?screen=mic&mic=denied',
    '?screen=lobby&role=host',
    '?screen=lobby&role=host&blinds=increasing',
    '?screen=lobby&role=guest',
    '?screen=summary',
    '?screen=replay&hand=24&action=13',
    '?screen=replay&hand=24&export=options',
    // 생성 중 상태는 타이머로 계속 바뀐다. 시계를 멈추면 axe도 멈추므로 시각 회귀와 단위 테스트로 확인한다.
    '?screen=replay&hand=24&export=done',
    '?screen=replay&hand=24&export=failed',
  ]

  for (const query of screens) {
    test(query, async ({ page }) => {
      await openPage(page, query)
      await expectNoAxeViolations(page)
    })
  }

  test('방 만들기 오류 상태', async ({ page }) => {
    await openPage(page, '?screen=create&blinds=increasing')
    await page.getByLabel('방 이름').fill('')
    await page.getByRole('button', { name: '방 만들기' }).click()
    await expect(page.getByText('방 이름을 입력하세요.')).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('게임 중 설정 창', async ({ page }) => {
    await openPage(page, '?scenario=opp&blinds=increasing')
    await page.getByRole('button', { name: '설정' }).click()
    await expectNoAxeViolations(page)
  })

  test('입장 화면 오류 상태', async ({ page }) => {
    await openPage(page, '?screen=entry')
    await page.getByRole('button', { name: '입장하기' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('나가기·세션 종료 확인창', async ({ page }) => {
    await openPage(page, '?scenario=my')
    await page.getByRole('button', { name: '나가기' }).click()
    await expectNoAxeViolations(page)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: '메뉴' }).click()
    await expectNoAxeViolations(page)
    await page.getByRole('button', { name: /세션 종료/ }).click()
    await expectNoAxeViolations(page)
  })
})

test.describe('키보드 접근', () => {
  test('테이블의 모든 조작 요소에 Tab으로 닿고 포커스 링이 보인다', async ({ page }) => {
    await openPage(page, '?scenario=my')
    const reached = new Set<string>()

    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null
        if (!element || element === document.body) return null
        const style = getComputedStyle(element)
        return {
          name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
          outline: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
        }
      })
      if (!info) continue
      expect(info.outline, `${info.name} 포커스 링`).toBe(true)
      reached.add(info.name)
    }

    for (const name of ['메뉴', '나가기', '초대', '채팅', '채팅 입력', '최소', '올인', '레이즈 총액', '100 내리기', '100 올리기']) {
      expect([...reached].some((item) => item.includes(name)), name).toBe(true)
    }
    expect([...reached].some((item) => item.startsWith('레이즈 2,400'))).toBe(true)
    expect([...reached].some((item) => item.startsWith('폴드'))).toBe(true)
  })
})
