import { expect, test } from '@playwright/test'
import { openPage } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })

test('방장: 방 만들기 → 착석 → 동의 → 마이크 → 대기실 → 게임 시작 → 세션 종료 → 복기 → 내보내기', async ({ page }) => {
  await openPage(page, '')

  // 방 만들기
  await page.getByRole('button', { name: '새 방 만들기' }).click()
  await page.getByLabel('내 닉네임 (방장)').fill('하늘')
  await page.getByRole('radio', { name: '시간마다 인상' }).check()
  await page.getByRole('combobox', { name: '인상 간격' }).selectOption('10')
  await page.getByRole('button', { name: '방 만들기' }).click()

  // 좌석
  await page.getByRole('button', { name: '6번 좌석, 빈 좌석' }).click()
  await page.getByRole('button', { name: '6번 좌석에 앉기' }).click()

  // 동의
  await page.getByRole('checkbox', { name: /내 차례 음성 기록에 동의합니다/ }).check()
  await page.getByRole('checkbox', { name: /전체 패 공개에 동의합니다/ }).check()
  await page.getByRole('button', { name: '다음: 마이크 점검' }).click()

  // 마이크 점검
  await page.getByRole('button', { name: '마이크 점검 시작' }).click()
  await expect(page.getByRole('heading', { name: '마이크가 정상입니다' })).toBeVisible()
  await page.getByRole('button', { name: '준비 완료' }).click()

  // 대기실 → 게임 시작
  await expect(page.getByRole('complementary', { name: '방 정보' })).toContainText('50 / 100부터 10분마다 인상')
  await page.getByRole('button', { name: '게임 시작 · 3명' }).click()
  await expect(page).toHaveURL(/screen=table&blinds=increasing&scenario=opp/)
  await expect(page.getByRole('banner')).toContainText('레벨 1 · 12분 뒤 100 / 200')

  // 세션 종료 → 요약
  await page.getByRole('button', { name: '메뉴' }).click()
  await page.getByRole('button', { name: /세션 종료/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: '세션 종료' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '금요일 밤 홀덤' })).toBeFocused()

  // 복기
  await page.getByRole('button', { name: /복기 시작/ }).click()
  await expect(page).toHaveURL(/screen=replay&hand=24/)
  await page.getByRole('button', { name: '재생' }).click()
  await expect(page.getByRole('button', { name: /^2번째 액션/ })).toHaveAttribute('aria-current', 'step')
  await page.getByRole('button', { name: '일시정지' }).click()

  // 내보내기
  await page.getByRole('button', { name: '영상 내보내기' }).click()
  await page.getByRole('button', { name: '내보내기 시작' }).click()
  await expect(page.getByRole('progressbar')).toBeVisible()
  await expect(page.getByRole('dialog', { name: '영상이 준비되었습니다' })).toBeVisible()
})

test('참가자: 입장 → 대기실에서 방장을 기다렸다가 테이블로 들어간다', async ({ page }) => {
  await openPage(page, '')
  await page.getByLabel('닉네임').fill('하늘')
  await page.getByRole('button', { name: '입장하기' }).click()
  await page.getByRole('button', { name: '5번 좌석, 빈 좌석' }).click()
  await page.getByRole('button', { name: '5번 좌석에 앉기' }).click()
  await page.getByRole('checkbox', { name: /내 차례 음성 기록에 동의합니다/ }).check()
  await page.getByRole('checkbox', { name: /전체 패 공개에 동의합니다/ }).check()
  await page.getByRole('button', { name: '다음: 마이크 점검' }).click()
  await page.getByRole('button', { name: '마이크 점검 시작' }).click()
  await page.getByRole('button', { name: '준비 완료' }).click()

  await expect(page.getByRole('heading', { name: /게임을 시작하기를 기다리는 중/ })).toBeVisible()
  await expect(page).toHaveURL(/screen=table&role=guest&scenario=opp/, { timeout: 8_000 })
  await expect(page.getByRole('banner')).toContainText('참가자')
})

test('내 차례 → 처리 중 → 액션 확정 → 다음 차례', async ({ page }) => {
  await openPage(page, '?scenario=my')
  const dock = page.getByRole('region', { name: '포커 액션' })

  await dock.getByRole('button', { name: /레이즈 2,400/ }).click()
  await expect(dock.getByRole('button', { name: /처리 중…/ })).toBeVisible()
  await expect(page.getByText('액션 처리 중')).toBeVisible()

  await expect(page.getByRole('status').filter({ hasText: '레이즈 액션이 확정되었습니다' })).toBeVisible()
  await expect(page.getByText('유진 차례를 기다리는 중')).toBeVisible()
  await expect(page.getByText(/음성 기록 중/)).toHaveCount(0)
})

test('내보내기 실패를 흉내 내면 실패 상태와 다시 시도가 보인다', async ({ page }) => {
  await openPage(page, '?screen=replay&hand=24&exportResult=failure')

  await page.getByRole('button', { name: '영상 내보내기' }).click()
  await page.getByRole('button', { name: '내보내기 시작' }).click()
  await expect(page.getByRole('dialog', { name: '영상을 만들지 못했습니다' })).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeFocused()
})

test('프로덕션 빌드에는 개발 도구가 없다', async ({ page }) => {
  await openPage(page, '?scenario=opp')
  await expect(page.getByRole('complementary', { name: '프로토타입 개발 도구' })).toHaveCount(0)
})
