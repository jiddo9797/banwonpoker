import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

/**
 * 실제 게임 서버(8788)와 프로덕션 빌드를 붙여, 저장소가 분리된 브라우저 두 개로 한 판을 둔다.
 * 가짜 마이크를 붙여 실제 마이크 점검(getUserMedia)까지 거친다.
 */
test.use({
  viewport: { width: 1440, height: 900 },
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
})

async function newPlayer(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    permissions: ['microphone'],
  })
  return context.newPage()
}

/** 좌석 → 동의 → 마이크 점검 → 준비 완료 */
async function prepare(page: Page, seat: number) {
  await page.getByRole('button', { name: `${seat}번 좌석, 빈 좌석` }).click()
  await page.getByRole('button', { name: `${seat}번 좌석에 앉기` }).click()
  await page.getByRole('checkbox', { name: /내 차례 음성 기록에 동의합니다/ }).check()
  await page.getByRole('checkbox', { name: /전체 패 공개에 동의합니다/ }).check()
  await page.getByRole('button', { name: '다음: 마이크 점검' }).click()
  await page.getByRole('button', { name: '마이크 점검 시작' }).click()
  await expect(page.getByRole('heading', { name: '마이크가 정상입니다' })).toBeVisible()
  await page.getByRole('button', { name: '준비 완료' }).click()
}

const dock = (page: Page) => page.getByRole('region', { name: '포커 액션' })

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
  expect(results.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target.join(' ')) }))).toEqual([])
}

test('방장과 친구가 실제 서버에서 방을 만들고 한 판을 둔 뒤 세션을 끝낸다', async ({ browser }) => {
  test.setTimeout(90_000)
  const host = await newPlayer(browser)
  const guest = await newPlayer(browser)

  // 방장: 방 만들기
  await host.goto('/')
  await expect(host.getByRole('heading', { level: 1, name: '친구들과 포커 한 판' })).toBeVisible()
  await expectAccessible(host)
  await host.getByRole('button', { name: '방 만들기' }).click()
  await host.getByLabel('내 닉네임 (방장)').fill('하늘')
  await host.getByLabel('방 이름').fill('E2E 홀덤')
  await host.getByRole('button', { name: '방 만들기' }).click()
  await expect(host).toHaveURL(/\?room=[A-Z0-9]{6}$/)
  const roomCode = new URL(host.url()).searchParams.get('room')!
  await prepare(host, 1)
  await expect(host.getByRole('heading', { level: 1, name: '친구들이 준비되면 시작하세요' })).toBeVisible()
  await expect(host.getByText(`?room=${roomCode}`)).toBeVisible()
  await expect(host.getByRole('button', { name: '게임 시작 · 1명' })).toHaveAttribute('aria-disabled', 'true')
  await expectAccessible(host)

  // 친구: 초대 링크로 입장
  await guest.goto(`/?room=${roomCode}`)
  await expect(guest.getByLabel('방 코드')).toHaveValue(roomCode)
  await guest.getByLabel('닉네임').fill('하늘')
  await guest.getByRole('button', { name: '입장하기' }).click()
  await expect(guest.getByRole('alert')).toHaveText('이미 방에 있는 닉네임입니다.')
  await guest.getByLabel('닉네임').fill('민수')
  await guest.getByRole('button', { name: '입장하기' }).click()
  // 방장이 앉은 1번 좌석은 고를 수 없다.
  await expect(guest.getByRole('group', { name: '1번 좌석, 하늘 사용 중' })).toBeVisible()
  await prepare(guest, 2)
  await expect(guest.getByRole('heading', { name: /방장 하늘이\(가\) 게임을 시작하기를 기다리는 중/ })).toBeVisible()

  // 방장: 게임 시작
  await host.getByRole('button', { name: '게임 시작 · 2명' }).click()
  await expect(host.getByRole('heading', { level: 1, name: /핸드 #1 포커 테이블/ })).toBeAttached()
  await expect(guest.getByRole('heading', { level: 1, name: /핸드 #1 포커 테이블/ })).toBeAttached()

  // 서로의 홀카드는 보이지 않는다.
  await expect(host.getByRole('group', { name: '민수의 비공개 홀카드 2장' })).toBeVisible()
  await expect(guest.getByRole('group', { name: '하늘의 비공개 홀카드 2장' })).toBeVisible()
  // 내 차례에는 나에게만 녹음 표시가 보인다. 상대 화면에는 어떤 녹음 표시도 없다.
  await expect(host.getByText('내 차례 · 음성 기록 중')).toBeVisible()
  await expect(guest.getByText(/음성 기록|녹음/)).toHaveCount(0)
  await expectAccessible(host)
  await expectAccessible(guest)

  // 헤즈업: 딜러(하늘)가 스몰 블라인드로 먼저 행동한다.
  await expect(dock(host).getByRole('button', { name: /^콜/ })).toHaveAttribute('aria-disabled', 'false')
  await expect(dock(guest).getByRole('button', { name: /^콜/ })).toHaveAttribute('aria-disabled', 'true')
  await expect(guest.getByText('하늘 차례를 기다리는 중')).toBeVisible()
  // 가짜 마이크 소리가 조금 녹음되도록 잠깐 기다렸다가 행동한다.
  await host.waitForTimeout(1_500)
  await dock(host).getByRole('button', { name: /^콜/ }).click()

  // 빅 블라인드(민수) 체크 → 플랍
  await expect(guest.getByText('내 차례 · 음성 기록 중')).toBeVisible()
  await guest.waitForTimeout(1_500)
  await dock(guest).getByRole('button', { name: /^체크/ }).click()
  await expect(guest.getByRole('group', { name: '플랍 커뮤니티 카드' }).getByRole('img')).toHaveCount(3)

  // 플랍: 민수가 먼저 베팅, 하늘 폴드
  await dock(guest).getByRole('button', { name: /^베팅 100/ }).click()
  await dock(host).getByRole('button', { name: /^폴드/ }).click()
  await expect(host.getByText('민수 승리 +300')).toBeVisible()
  await expect(guest.getByText('나 승리 +300')).toBeVisible()
  await expect(guest.locator('.game-log')).toContainText('하늘 폴드')
  await expect(guest.locator('.hero-stack')).toHaveText('10,100')

  // 잠깐 쉬고 다음 핸드
  await expect(host.getByRole('heading', { level: 1, name: /핸드 #2 포커 테이블/ })).toBeAttached({ timeout: 10_000 })

  // 방장이 세션을 끝낸다. 진행 중인 핸드는 무효다.
  await host.getByRole('button', { name: '메뉴' }).click()
  await host.getByRole('button', { name: /세션 종료/ }).click()
  await host.getByRole('dialog').getByRole('button', { name: '세션 종료' }).click()
  for (const page of [host, guest]) {
    await expect(page.getByRole('heading', { level: 1, name: 'E2E 홀덤' })).toBeVisible()
    await expect(page.getByRole('row', { name: /민수.*10,100/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /하늘.*9,900/ })).toBeVisible()
  }

  // 복기: 전체 패와 차례별 음성
  await host.getByRole('button', { name: '복기 보기' }).click()
  await expect(host.getByRole('heading', { level: 1, name: '복기 · 핸드 #1' })).toBeVisible()
  await expect(host.getByRole('group', { name: '민수의 홀카드' }).getByRole('img')).toHaveCount(2)
  const timeline = host.getByRole('group', { name: '액션 타임라인' })
  await expect(timeline.getByRole('button', { name: /^3번째 액션, 나 콜 100, 음성 \d+초/ })).toBeVisible()
  // 가짜 마이크는 1초마다 삑 소리만 내서 짧은 차례는 무발언으로 잡힐 수 있다. 둘 다 기록된 것이다.
  await expect(timeline.getByRole('button', { name: /^4번째 액션, 민수 체크, (음성 \d+초|무발언)/ })).toBeVisible()
  // 곧바로 행동한 차례도 누락이 아니다.
  await expect(timeline.getByRole('button', { name: /누락|기록 실패/ })).toHaveCount(0)
  await expectAccessible(host)

  // 재생하면 음성이 있는 칸을 틀며 넘어간다.
  await host.getByRole('button', { name: '재생' }).click()
  await expect(timeline.getByRole('button', { name: /^5번째 액션/ })).toHaveAttribute('aria-current', 'step', { timeout: 15_000 })
  await host.getByRole('button', { name: '일시정지' }).click()

  // 내보내기: 음성(WAV)과 기록(텍스트)
  await host.getByRole('button', { name: '영상 내보내기' }).click()
  await expect(host.getByRole('dialog', { name: '음성과 기록 내보내기' })).toBeVisible()
  await host.getByRole('button', { name: '내보내기 시작' }).click()
  const files = host.getByRole('list', { name: '만든 파일' })
  await expect(files).toContainText('banwonpoker-hand1.wav', { timeout: 15_000 })
  await expect(files).toContainText('banwonpoker-hand1.txt')
  const download = host.waitForEvent('download')
  await files.getByRole('link', { name: '다운로드' }).first().click()
  expect((await download).suggestedFilename()).toBe('banwonpoker-hand1.wav')

  await host.getByRole('dialog').getByRole('button', { name: '닫기' }).click()

  // 방을 나간 뒤에도 첫 화면에서 다시 복기할 수 있다.
  await host.getByRole('button', { name: '세션 요약' }).click()
  await host.getByRole('button', { name: '처음 화면으로' }).click()
  await host.getByRole('button', { name: /E2E 홀덤/ }).click()
  await expect(host.getByRole('heading', { level: 1, name: '복기 · 핸드 #1' })).toBeVisible()
})

test('연결이 끊겨도 새로고침하면 같은 자리로 돌아온다', async ({ browser }) => {
  const host = await newPlayer(browser)
  await host.goto('/')
  await host.getByRole('button', { name: '방 만들기' }).click()
  await host.getByLabel('내 닉네임 (방장)').fill('하늘')
  await host.getByRole('button', { name: '방 만들기' }).click()
  await host.getByRole('button', { name: '3번 좌석, 빈 좌석' }).click()
  await host.getByRole('button', { name: '3번 좌석에 앉기' }).click()
  await expect(host.getByRole('checkbox', { name: /내 차례 음성 기록에 동의합니다/ })).toBeVisible()

  await host.reload()
  // 같은 방, 같은 자리(3번)로 돌아와 다음 단계부터 이어간다.
  await expect(host.getByRole('checkbox', { name: /내 차례 음성 기록에 동의합니다/ })).toBeVisible()
  await expect(host.getByRole('complementary', { name: '방 정보' })).toContainText('3번 좌석')
})

test('서버에 없는 방 코드는 알려준다', async ({ browser }) => {
  const page = await newPlayer(browser)
  await page.goto('/?room=ZZZZZZ')
  await page.getByLabel('닉네임').fill('민수')
  await page.getByRole('button', { name: '입장하기' }).click()
  await expect(page.getByRole('alert')).toHaveText('방을 찾을 수 없습니다. 초대 링크를 확인하세요.')
})
