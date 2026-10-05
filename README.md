# banwonpoker

Private multiplayer poker with turn-based voice replay

친구끼리 비공개 방에서 2~6인 노리밋 텍사스 홀덤을 하고, 내 차례에만 기록된 음성으로 세션이 끝난 뒤 함께 복기하는 서비스입니다.

**서비스 주소: <https://banwonpoker.fly.dev>** — 방을 만들고 대기실의 초대 링크를 친구에게 보내면 됩니다. 설치할 것은 없고, 폰·PC 브라우저에서 마이크 권한만 허용하면 됩니다.

> **현재 단계: 기능 완성 · 배포 완료.** 방 만들기부터 게임, 내 차례 녹음, 세션 종료, 전체 패·음성 복기, 음성·기록 내보내기까지 실제로 동작하고, Fly.io(도쿄 `nrt`)에서 서버 한 대가 항상 켜져 있습니다.
> - `backend/engine/`: 노리밋 홀덤 규칙 엔진
> - `backend/gto/`: 프리플랍 GTO 솔버와 차트 생성(처음 화면의 `GTO 차트 보기`)
> - `backend/server/`: 게임 서버(WebSocket), 세션 기록 저장(SQLite + 음성 파일), 녹음 업로드·복기 API, 배포 시 화면 제공
> - `frontend/`: 실제 게임 화면과 검토용 목업 클릭 프로토타입
> - 배포: `Dockerfile`, `fly.toml`. 코드를 고친 뒤 다시 올리는 방법은 아래 `배포`의 `업데이트`를 봅니다.

### 알려진 한계

- 진행 중인 방은 서버 메모리에만 있어서, 서버가 재시작되거나 새로 배포하면 그때 하던 게임은 끊깁니다(끝난 세션의 기록·음성은 남습니다). 친구들과 게임하는 중에는 배포하지 않습니다.
- 지난 세션 목록은 그 브라우저에만 저장됩니다. 다른 기기에서는 보이지 않습니다.
- 기록은 서버 한 대의 볼륨(1GB)에만 있고 따로 백업하지 않습니다.
- 자동 테스트는 PC 브라우저(Chromium)로만 합니다. 실제 폰, 특히 아이폰 사파리의 녹음은 아직 확인하지 않았습니다.
- 내보내기는 WAV 음성과 텍스트 기록입니다. MP4 영상은 없습니다.

## 폴더 구조

```
frontend/                 웹 앱 (@banwonpoker/web)
  src/
    app/                  App, 화면 흐름 reducer(flow.ts), URL 동기화
    shared/               1440×900 캔버스, 포커스를 가두는 Dialog, 숫자 포맷
    features/
      room/               방 설정 모델·검증, 설정 폼, 읽기 전용 규칙
      lobby/              방 만들기·입장·좌석·동의·마이크 점검·대기실
      table/              메인 테이블(9개 시나리오 fixture, reducer, 컴포넌트)
      replay/             세션 요약, 복기, 타임라인, 참가자 음량, ExportModal
      gto/                프리플랍 GTO 차트 화면(13×13 표), charts/에 미리 계산한 차트 JSON
    live/                 실제 게임: 서버 연결(client.ts), 서버 상태 → 화면 변환(adapt.ts), 화면 전환(LiveApp),
                          내 차례 녹음(recorder.ts), 복기 변환·재생·내보내기(replayAdapt.ts, replayMedia.ts)
    dev/                  개발 전용 상태 선택기(프로덕션 빌드 제외)
  e2e/                    Playwright 테스트와 기준 이미지
backend/
  engine/                 포커 규칙 엔진 (@banwonpoker/engine)
    src/
      cards.ts            카드·덱
      rng.ts              시드 고정 난수, 암호학적 난수, 셔플
      evaluator.ts        족보 판정과 한국어 족보 이름
      pots.ts             메인·사이드 팟 계산, 팟 나누기
      blinds.ts           블라인드 레벨(고정·시간마다 인상)
      table.ts            좌석·핸드 진행·베팅 규칙·정산·탈락
      view.ts             참가자별 화면 데이터(남의 패 숨김)
  gto/                    프리플랍 GTO (@banwonpoker/gto)
    src/
      cards.ts            핸드 169종과 13×13 표 칸, 카드 겹침 조건부 확률
      evaluator.ts        승률표·멀티웨이 참고 분석용 빠른 족보 계산(5~7장)
      equity.ts           핸드 대 핸드 올인 승률(몬테카를로)
      tree.ts             프리플랍 게임 트리(레이즈 사이즈, 단순화 규칙)
      realization.ts      플랍 이후를 대신하는 에퀴티 실현 모델
      solver.ts           벡터형 Discounted CFR, 균형 오차(NashConv), 행동별 EV
      build.ts, chart.ts  차트 파일 만들기와 형식
    scripts/              승률표(tables/equity.json)와 차트 생성 스크립트
  server/                 게임 서버 (@banwonpoker/server)
    src/
      protocol.ts         브라우저와 주고받는 메시지 타입과 입력 검증(프론트가 그대로 가져다 씀)
      settings.ts         방 설정 검증, 블라인드 일정
      room.ts             방 하나: 대기실·좌석·준비·게임 시작·차례 타이머·다음 핸드·탈락·세션 종료·재접속
      manager.ts          방 코드 발급과 방 목록
      server.ts           HTTP(헬스 체크)와 WebSocket(/ws)
      api.ts              음성 조각 업로드·녹음 결과·복기·차례 음성 HTTP API, 배포용 화면 제공
      store.ts            세션 기록 저장소(node:sqlite + 음성 파일 폴더)
      replay.ts           저장된 기록으로 복기 데이터 만들기, 차례별 음성 상태 판정
      clock.ts            시계·타이머(테스트에서는 가짜 시계)
      index.ts            실행 진입점
```

## 요구 사항

- Node.js 22.12 이상(개발 환경은 Node 24)
- pnpm 11.19.0(`packageManager`로 고정). Corepack을 쓰면 버전이 자동으로 맞춰집니다.

```bash
corepack enable
```

## 설치와 실행

```bash
pnpm install
```

터미널 두 개에서 게임 서버와 화면을 각각 켭니다.

```bash
pnpm dev:server
```

```bash
pnpm dev
```

<http://localhost:5173>을 열면 실제 게임이 시작됩니다.

- **방장**: `방 만들기` → 방 설정 → 좌석 → 동의 → 마이크 점검 → 대기실에서 초대 링크 복사 → 친구들이 준비되면 `게임 시작`
- **친구**: 초대 링크(`?room=방코드`)를 열거나 방 코드를 입력 → 좌석 → 동의 → 마이크 점검 → 대기실에서 방장을 기다림
- 새로고침하거나 연결이 잠깐 끊겨도 같은 자리로 돌아옵니다. 한 브라우저의 여러 탭은 각각 다른 참가자로 들어갈 수 있고, 같은 자리를 다른 탭에서 열면 이전 탭은 멈추고 알려줍니다.

### 같은 와이파이의 친구와 하기

내 PC의 IP(예: `192.168.0.12`)로 서버와 화면을 열어 둡니다. PowerShell 기준입니다.

```bash
$env:HOST='0.0.0.0'; $env:ALLOWED_ORIGINS='http://192.168.0.12:5173'; pnpm dev:server
```

```bash
pnpm --filter @banwonpoker/web dev --host
```

친구는 `http://192.168.0.12:5173`을 엽니다. 브라우저는 HTTPS나 localhost가 아니면 마이크를 막기 때문에, 친구 화면의 마이크 점검은 `장치 없음`으로 나옵니다. 아직 녹음 기능이 없으니 `음성 없이 참여`를 고르면 됩니다. Windows 방화벽이 물어보면 Node.js의 사설 네트워크 접근을 허용해야 합니다.

### 목업 클릭 프로토타입

화면 검토용 목업은 주소에 `?screen=` 또는 `?scenario=`를 붙이면 열립니다(예: <http://localhost:5173/?screen=entry>). 서버가 필요 없습니다.

- **방장 흐름**: 입장 화면의 `새 방 만들기` → 방 설정 → 좌석 → 동의 → 마이크 점검 → 대기실(설정 수정, 게임 시작) → 테이블 → 세션 종료 → 요약 → 복기
- **참가자 흐름**: 입장 → 좌석 → 동의 → 마이크 점검 → 대기실(방장이 시작하기를 기다림) → 테이블

PowerShell에서 `pnpm`이 실행 정책 오류로 막히면 `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`를 한 번 실행하거나 `pnpm.cmd`로 실행합니다.

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 프론트엔드 Vite 개발 서버. 게임 서버는 `ws://(페이지 호스트):8787/ws`로 찾고, `VITE_SERVER_URL`로 바꿀 수 있습니다 |
| `pnpm dev:server` | 게임 서버 개발 모드(파일이 바뀌면 다시 시작). 기본 `ws://127.0.0.1:8787/ws` |
| `pnpm start:server` | 게임 서버 실행 |
| `pnpm build` | 타입 검사 후 프론트엔드 프로덕션 빌드(`frontend/dist`) |
| `pnpm typecheck` | 모든 패키지 TypeScript 타입 검사 |
| `pnpm lint` | 모든 패키지 OXLint(경고도 실패로 처리) |
| `pnpm test` | 모든 패키지 Vitest 테스트(프론트 단위·컴포넌트, 엔진 규칙, 서버) |
| `pnpm test:e2e` | Playwright 시각 회귀·axe 접근성·클릭 흐름 테스트 |
| `pnpm test:e2e:update` | 시각 회귀 기준 이미지 다시 만들기 |

## 목업 화면과 URL

주소창의 쿼리로 목업 프로토타입의 원하는 화면과 상태를 바로 열 수 있습니다. 화면을 옮기면 URL도 따라 바뀝니다. 쿼리가 없거나 `?room=`만 있으면 실제 게임이 열립니다.

### 화면(`?screen=`)

| 값 | 화면 |
| --- | --- |
| `create` | 방 만들기(방장): 방 이름, 최대 인원, 시작 칩, 블라인드 고정·인상과 레벨 표 |
| `entry` | 방 입장(닉네임) |
| `seat` | 좌석 선택 |
| `consent` | 녹음·전체 패 공개 동의 |
| `mic` | 마이크 점검, `음성 없이 참여` |
| `lobby` | 대기실. 방장은 설정을 고치고 게임을 시작하고, 참가자는 규칙을 보며 기다림 |
| `table` | 메인 테이블 |
| `summary` | 세션 종료 요약 |
| `replay` | 복기(전체 패 공개, 액션 단위 타임라인, 참가자 음량) |

### 메인 테이블 상태(`?scenario=`)

`?scenario=`만 붙이면 테이블 화면으로 바로 열립니다.

| 값 | 상태 | 예시 |
| --- | --- | --- |
| `opp` | 상대 차례 | <http://localhost:5173/?scenario=opp> |
| `my` | 내 차례(음성 기록 중) | <http://localhost:5173/?scenario=my> |
| `pending` | 액션 처리 중 | <http://localhost:5173/?scenario=pending> |
| `fold` | 폴드 직후 | <http://localhost:5173/?scenario=fold> |
| `allin` | 올인과 사이드 팟 | <http://localhost:5173/?scenario=allin> |
| `showdown` | 쇼다운 | <http://localhost:5173/?scenario=showdown> |
| `disc` | 연결 끊김 | <http://localhost:5173/?scenario=disc> |
| `micfail` | 마이크 실패 | <http://localhost:5173/?scenario=micfail> |
| `elim` | 탈락과 다음 핸드 참가 | <http://localhost:5173/?scenario=elim> |

`my`나 `micfail`에서 액션을 누르면 `처리 중`(1.2초) → `액션 확정` → `유진 차례`로 넘어갑니다. `voiceless=1`을 붙이면 `음성 없이 참여`로 들어온 상태를 볼 수 있습니다.

### 목 결과 지정

| 파라미터 | 값 | 설명 |
| --- | --- | --- |
| `role` | `host`, `guest` | 방장·참가자 시점. 준비 화면은 참가자, 테이블 이후는 방장이 기본 |
| `blinds` | `increasing` | 블라인드가 시간마다 오르는 방으로 열기 |
| `mic` | `ready`, `denied`, `not-found` | 마이크 점검 결과. `screen=mic`과 함께 쓰면 그 결과가 보이는 상태로 엽니다. |
| `exportResult` | `success`, `failure` | 다음 영상 내보내기가 성공할지 실패할지 |
| `hand` | `23`, `24` | 복기할 핸드 |
| `action` | `1`부터 | 복기 타임라인의 처음 위치(몇 번째 액션) |
| `export` | `options`, `generating`, `done`, `failed` | 영상 내보내기 창을 해당 상태로 열기 |
| `devtools` | `0` | 개발 도구 숨기기(스크린숏용) |

예시:

- <http://localhost:5173/?screen=create&blinds=increasing> 블라인드 인상 방식으로 방 만들기
- <http://localhost:5173/?screen=lobby&role=host> 방장 대기실
- <http://localhost:5173/?screen=lobby&role=guest> 참가자 대기실
- <http://localhost:5173/?scenario=opp&blinds=increasing> 테이블 헤더의 다음 블라인드 레벨 안내
- <http://localhost:5173/?screen=mic&mic=denied> 마이크 권한 거부
- <http://localhost:5173/?screen=replay&hand=24&action=13> 플랍에서 내가 콜한 칸
- <http://localhost:5173/?screen=replay&export=failed> 내보내기 실패
- <http://localhost:5173/?screen=replay&exportResult=failure> 내보내기를 누르면 60%에서 실패

## 개발 도구

개발 서버(`pnpm dev`)에서는 화면 위쪽 가운데에 **개발 도구** 버튼이 뜹니다. 화면, 테이블 상태, 마이크 점검 결과, 영상 내보내기 결과, 내 역할(방장·참가자), `음성 없이 참여`를 바로 바꿀 수 있습니다.

개발 도구는 1440×900 제품 캔버스 밖에 떠 있고, 프로덕션 빌드에서는 코드째 빠집니다. 검토용 배포에 넣어야 하면 `VITE_DEVTOOLS=true pnpm build`로 빌드합니다.

## 테스트

### 단위·컴포넌트 테스트

```bash
pnpm test
```

엔진만 돌리려면 `pnpm --filter @banwonpoker/engine test`, 프론트만 돌리려면 `pnpm --filter @banwonpoker/web test`를 씁니다.

**포커 엔진**
- 족보 판정 전 종류와 비교(휠 스트레이트, 키커, 무승부), 한국어 족보 이름
- 사이드 팟 계산, 나누어떨어지지 않는 칩 배분, 블라인드 레벨, 셔플 분포
- 블라인드 위치와 헤즈업 규칙, 빅 블라인드 옵션, 최소 레이즈, 모자란 올인 레이즈가 레이즈 기회를 다시 열지 않는 규칙
- 쇼다운·무승부·올인 런아웃·사이드 팟 정산, 시간 초과(체크 또는 폴드), 탈락 순위, 게임 중 입장은 다음 핸드부터, 퇴장
- 남의 홀카드와 덱이 화면 데이터에 새지 않는지
- 무작위 참가자 6명으로 20게임을 끝까지 두며 매 행동마다 칩 보존·이벤트 순번 검사

**게임 서버**
- 입장·닉네임·좌석·준비(동의 필수)·방 설정(방장, 대기실에서만)·게임 시작 조건
- 각자 자기 홀카드만 받는지, 다른 사람의 음성 선택이 공개되지 않는지
- 거절 이유 문구, 같은 `clientActionId` 중복 처리 방지, 60초 시간 초과(연결이 끊겨도 동작)
- 다음 핸드 자동 시작과 딜러 이동, 게임 중 입장은 다음 핸드부터, 블라인드 인상
- 방장의 세션 종료(진행 중인 핸드 무효), 한 명 남으면 자동 종료와 순위, 퇴장·방장 위임, 토큰 재접속, 빈 방 정리
- 실제 WebSocket 서버에 클라이언트 3개를 붙여 한 판 진행과 재접속, 잘못된 메시지·Origin 거부

**프리플랍 GTO**
- 빠른 족보 계산이 엔진 족보 비교와 무작위 3,000판에서 같은 승패를 내는지, 승률표가 알려진 값(AA 대 KK 81.9%)과 맞는지
- 트리의 모든 끝에서 다투는 사람 두 명 이하·칩 보존, 15BB 이하 푸시/폴드
- 2인 10BB 푸시/폴드가 알려진 내시 균형에 수렴, 6인 100BB 오픈 폭이 뒤 포지션일수록 넓어짐

**프론트엔드**

- 테이블·흐름·복기 reducer와 fixture 불변 조건: 상대 좌석에 녹음 필드가 없음, 액션 버튼 순서, 차례는 한 명, 칩 합계 등
- 다이얼로그 포커스 가두기와 포커스 복귀, 탭·타임라인 방향키 이동
- 입장부터 복기까지 전체 클릭 흐름
- 멀티웨이 참고 분석: 3인 팟의 레인지 근사(오프너·콜러·오버콜러·림프), 좁히기 비율, 팟 오즈·±3% 경계, AA 대 KK 대 QQ 승률(보드를 모두 센 66.98%와 비교), 리버 정확 계산과 몬테카를로 비교

### E2E·시각 회귀·접근성

E2E는 프론트엔드만 대상으로 합니다. 처음 한 번은 Playwright 브라우저를 설치합니다.

```bash
pnpm --filter @banwonpoker/web exec playwright install chromium
```

```bash
pnpm test:e2e
```

- `e2e/visual.spec.ts`: 테이블 9개 상태 × 1440×900·1280×720, 방 만들기·대기실·준비·복기·내보내기 화면, 다이얼로그 스크린숏 비교
- `e2e/a11y.spec.ts`: 모든 화면과 다이얼로그를 axe(WCAG 2.2 AA + best-practice)로 검사, 키보드 Tab 순회와 포커스 링 확인
- `e2e/flow.spec.ts`: 목업의 방장(방 만들기 → 복기 → 내보내기)과 참가자(입장 → 대기실 → 테이블) 클릭 흐름
- `e2e/live.spec.ts`: **실제 게임 서버(8788)를 띄우고** 저장소가 분리된 브라우저 두 개로 방 만들기 → 초대 링크 입장 → 가짜 마이크로 점검 → 게임 시작 → 내 차례 녹음 → 콜·체크·베팅·폴드 → 정산 → 다음 핸드 → 세션 종료 → 복기(전체 패·차례 음성) → 재생 → 음성·기록 내보내기와 다운로드 → 지난 세션 다시 열기, 3인이 플랍을 본 핸드의 참고 분석, 새로고침 재접속, 없는 방 코드, 화면별 axe 검사
- 배포 구성(서버 하나가 화면까지 제공)에 대고 돌리려면 서버를 띄운 뒤 `E2E_BASE_URL=http://127.0.0.1:8790 pnpm --filter @banwonpoker/web exec playwright test e2e/live.spec.ts`

E2E는 프로덕션 빌드(`vite preview`, 포트 4173)를 대상으로 돌기 때문에 개발 도구가 스크린숏에 들어가지 않습니다. 기준 이미지는 `frontend/e2e/__screenshots__`에 OS별 이름(`-win32` 등)으로 저장됩니다. 다른 OS나 CI에서 처음 돌릴 때는 `pnpm test:e2e:update`로 그 환경의 기준 이미지를 만듭니다. 화면을 의도적으로 바꿨을 때도 같은 명령으로 갱신하고, 바뀐 이미지를 확인한 뒤 커밋합니다.

## 포커 엔진

`@banwonpoker/engine`은 네트워크·DB·시간에 의존하지 않는 순수 TypeScript입니다. 서버가 판정하고, 각 참가자에게는 `playerView`로 자기 패만 보냅니다.

```ts
import { act, createTable, cryptoRng, playerView, seatPlayer, startHand } from '@banwonpoker/engine'

// 모든 함수는 { ok: true, table, events } 또는 { ok: false, error }를 돌려준다.
let table = createTable({ startingStack: 10_000 })
for (const [seat, name] of ['하늘', '민수', '유진'].entries()) {
  const seated = seatPlayer(table, { id: name, name, seat })
  if (seated.ok) table = seated.table
}

const started = startHand(table, { blinds: { smallBlind: 50, bigBlind: 100 }, rng: cryptoRng() })
if (started.ok) {
  const result = act(started.table, '하늘', { type: 'raise', amount: 150 }) // amount는 이번 스트리트 총액
  if (!result.ok) console.log(result.error.message) // '최소 레이즈는 200입니다.'
  const view = playerView(started.table, '민수') // 민수에게 보낼 화면: 남의 홀카드는 null
}
```

- 모든 함수는 입력 상태를 바꾸지 않고 새 상태와 이벤트를 돌려줍니다.
- 이벤트에는 1씩 늘어나는 `seq`가 붙습니다. 녹음·복기 동기화의 기준이 됩니다.
- `turn-started` 이벤트가 차례 시작, 그 참가자의 `action` 이벤트가 차례 끝입니다. 내 차례 녹음은 이 두 이벤트로 시작·종료합니다.
- 규칙: 노리밋 홀덤, 헤즈업은 딜러가 스몰 블라인드, 최소 레이즈는 직전 레이즈 폭, 모자란 올인 레이즈는 이미 행동한 사람에게 레이즈 기회를 다시 주지 않음, 시간 초과는 체크 가능하면 체크·아니면 폴드(D4), 칩 0이면 탈락, 핸드 중에 앉으면 다음 핸드부터, 남는 칩은 딜러 왼쪽에 가까운 승자에게.
- 블라인드 인상은 `blindLevelAt(schedule, 경과 시간)`으로 핸드를 시작할 때의 레벨을 구해 `startHand`에 넘깁니다.

## 프리플랍 GTO 차트

처음 화면의 `GTO 차트 보기`로 엽니다. 인원(2~6인), 유효 스택(10~300BB), 내 포지션, 상황(오픈, 오픈·림프·올인에 답하기, 3벳·4벳에 답하기)을 고르면 13×13 표에 핸드마다 폴드·콜·레이즈·올인 빈도를 색 막대로, 그 상황까지 올 확률(범위 가중치)을 막대 높이로 보여줍니다. 핸드를 고르면 행동별 빈도와 EV(그 결정부터의 기대 칩 증감)가 나옵니다. 시작 30,000칩에 50/100 → 400/800으로 오르는 구조는 레벨 버튼으로 바로 해당 스택(300·150·100·60·40BB)을 고를 수 있습니다.

- **15BB 이하: 푸시/폴드 내시 균형.** 2인은 정확한 균형이고(10BB에서 SB 58% 푸시, BB 37% 콜), 3인 이상은 올인에 두 명 이상이 콜하는 경우를 뺀 근사입니다.
- **20BB 이상: 근사 GTO.** 프리플랍 트리(오픈 → 3벳 → 4벳 → 올인)를 CFR로 풀고, 플랍 이후는 직접 풀지 않고 포지션과 핸드 특성(수티드·커넥터·페어)에 따른 에퀴티 실현으로 대신합니다. 상용 솔버 차트와 핸드 몇 개는 다를 수 있습니다.
- 단순화: 모두 같은 유효 스택, 앤티·레이크 없음, 팟을 다투는 사람은 두 명까지(스퀴즈는 있고 오버콜·콜드 4벳은 없음), 림프는 블라인드 대 블라인드의 스몰 블라인드만, 레이즈 사이즈 고정.
- **복기에서 바로 비교:** 복기의 프리플랍 결정 칸에서 `이 지점 GTO 분석`을 누르면 그 상황(인원, 유효 스택, 포지션, 앞사람들의 행동)을 차트에서 찾아 그 핸드의 GTO 빈도·EV와 실제 행동, GTO 선호 행동, EV 손실을 보여줍니다. 사이즈나 스택이 차트와 다르면 가장 가까운 것으로 보고 그렇게 했다고 적습니다. `전체 차트에서 보기`로 같은 상황의 13×13 표를 열고 `복기로` 돌아오면 보던 칸이 그대로입니다. 플랍 이후 결정은 아래 포스트플랍 분석과 멀티웨이 참고 분석으로 봅니다. 프리플랍 결정 중 스몰 블라인드가 아닌 림프와 세 명 이상 들어온 팟은 차트에 없어 분석하지 않습니다.
- 차트는 미리 계산해 `frontend/src/features/gto/charts/`에 커밋하고 화면은 필요한 파일만 불러옵니다. 모델을 바꾸면 다시 만듭니다.

```bash
pnpm --filter @banwonpoker/gto charts        # 65개 차트(약 4분, 코어 수만큼 병렬)
pnpm --filter @banwonpoker/gto charts 3000 6 100   # 6인 100BB만 다시
pnpm --filter @banwonpoker/gto equity        # 승률표를 처음부터(약 1분, 보통은 필요 없음)
```

## 포스트플랍 GTO 분석

복기에서 두 명이 플랍을 본 핸드의 플랍·턴·리버 결정 칸에서 `이 지점 GTO 분석`을 누르면, 브라우저 안에서 솔버를 돌려 그 결정의 GTO 빈도·EV와 실제 행동, GTO 선호 행동, EV 손실, 이 핸드의 승률을 보여줍니다.

- 솔버는 [b-inary/postflop-solver](https://github.com/b-inary/postflop-solver)(AGPL-3.0)를 `backend/postflop`에서 WASM으로 감싸 Web Worker에서 돌립니다. 서버는 계산하지 않습니다.
- 두 사람의 레인지는 프리플랍 차트에서 그 라인으로 플랍까지 오는 빈도로 만들고, 플랍부터 리버까지 한 번에 풉니다. 같은 핸드의 다른 결정은 다시 풀지 않습니다.
- 트리는 브라우저 메모리에 맞게 플랍 33%, 턴·리버 75% 베팅과 올인 레이즈만 둡니다. 실제 사이즈는 가장 가까운 것으로 보고 그렇다고 적습니다.
- 팟의 1%까지 풀거나 2분이 지나면 멈추고 그때의 균형 오차를 보여줍니다. 균형 오차는 한 번 재는 데 걸린 시간의 약 10배 간격(1.5~8초)으로 재서, 작은 상황은 다 풀리면 바로 멈춥니다. 교차 출처 격리(COOP/COEP 헤더)가 되면 멀티스레드 빌드를 써서 훨씬 빠릅니다(12스레드에서 넓은 림프 팟이 약 35초). 안 되면 스레드 하나로 풉니다.
- 세 명 이상이 플랍을 본 팟은 솔버 대신 아래 멀티웨이 참고 분석을 보여줍니다.

WASM은 빌드해서 `frontend/src/features/gto/postflop-wasm*/`에 커밋합니다. 솔버 코드를 고쳤을 때만 다시 만듭니다(Rust stable과 nightly, `wasm32-unknown-unknown`, `rust-src`, `wasm-bindgen-cli` 0.2.129 필요).

```bash
pnpm --filter @banwonpoker/postflop build:wasm
```

## 멀티웨이 참고 분석

세 명 이상이 플랍을 본 핸드의 플랍·턴·리버 결정 칸에서 `이 지점 GTO 분석`을 누르면 `참고 분석` 창이 열립니다. 쓰는 솔버가 2인 전용이고, 3인 이상은 GTO가 깔끔하게 정의되지 않으며 브라우저에서 풀기엔 계산량이 너무 커서, GTO 대신 "이 결정이 수학적으로 맞았나"를 판단할 근거를 보여줍니다. 창 제목과 본문에 GTO가 아니라고 적습니다.

- **내 승률**: 남은 상대 전원을 동시에 이길 확률(비기면 나눠 갖는 몫 포함). **상대별 승률**: 각 상대와 일대일로 붙었을 때의 승률.
- **콜 결정**: 필요 승률(팟 오즈) = 콜 금액 ÷ (지금 팟 + 콜 금액)과 비교해 `콜이 이득`(승률 ≥ 필요 + 3%), `폴드가 이득`(≤ 필요 − 3%), `비슷함`을 보여주고, 콜의 단순 기대값(승률 × (팟 + 콜) − 콜)을 BB로 적습니다. 콜하면 올인이 되거나 상대가 모두 올인이면 앞으로의 베팅이 없어 이 판단이 거의 정확하다고 안내합니다.
- **베팅·체크 결정**: 승률과, 베팅·레이즈했으면 그 크기로 상대가 콜하려면 필요한 승률을 보여줍니다.
- **상대 레인지(프리플랍)**: 차트에 그 라인이 있으면 그대로(오픈, 오픈에 콜, 3벳 등) 쓰고, 오버콜러는 앞사람들의 콜을 뺀 같은 레이즈에 대한 레인지로, 차트에 없는 림프·콜은 그 포지션 오픈 레인지의 아래쪽 절반(레이즈면 위쪽 3분의 1)으로, 오픈 레인지가 없는 BB는 모든 핸드로 대신하고 그렇게 했다고 적습니다.
- **상대 레인지(플랍 이후)**: 상대 행동마다 그 시점 보드에서의 핸드 강도(리버는 족보, 플랍·턴은 무작위 핸드 상대 승률이라 드로우가 반영됨) 순으로 줄 세워 베팅은 위쪽 55% + 아래쪽 10%, 레이즈는 위쪽 30% + 아래쪽 5%, 콜은 위쪽 70%를 남기고, 체크는 가장 강한 10%를 절반만 남깁니다. 비율은 `frontend/src/features/gto/equity.ts`의 `NARROWING`에 모여 있습니다.
- **계산**: 리버에서 상대가 두 명 이하면 레인지 대 레인지를 정확히 세고, 그 밖에는 상대 핸드와 남은 보드를 40,000번 뽑습니다(오차 ±0.5% 안팎). 족보는 `backend/gto`의 빠른 7장 계산기를 쓰고, 솔버와 별도인 가벼운 Web Worker에서 1초 안팎에 끝납니다.
- **한계(창에 항상 표시)**: GTO가 아닙니다. 앞으로의 베팅(임플라이드 오즈), 포지션, 블러프는 반영하지 않습니다. 상대 레인지는 근사입니다.

## 녹음과 복기

- 내 차례가 시작되면 **내 브라우저에서만** 마이크를 열어 녹음하고, 액션을 누르면 멈추고, 차례가 끝나면 마이크를 끕니다. 음성은 3초 조각으로 서버에 올라갑니다.
- 게임 중에는 누구도 음성을 들을 수 없습니다. 서버는 세션이 끝난 뒤, 그 세션 참가자에게만 전체 패와 음성을 줍니다.
- 차례별 음성 상태: `음성`, `무발언`(말이 없었거나 곧바로 행동함), `기록 실패`(마이크 권한 없음 등), `누락`(올린 조각이 빠짐), `음성 없이 참여`
- 업로드가 실패하면 다시 시도하며 `음성 기록 실패 · 재시도 중`을 보여줍니다. 게임은 멈추지 않습니다.
- 세션이 끝나면 요약의 `복기 보기`로 전체 패, 액션 단위 타임라인, 차례별 음성을 재생하고, 참가자별 음량·음소거를 조절할 수 있습니다. 이 브라우저의 첫 화면에서도 지난 세션을 다시 열 수 있습니다.
- `영상 내보내기`는 차례별 음성을 이어 붙인 오디오(WAV)와 액션 기록(텍스트)을 만듭니다. MP4 영상은 아직 없습니다.
- 브라우저는 HTTPS나 localhost에서만 마이크를 허용합니다. 같은 와이파이(`http://내IP:5173`)로 접속한 친구는 녹음할 수 없고, 배포한 주소(HTTPS)에서는 모두 녹음할 수 있습니다.

## 배포 (Fly.io)

게임 서버 하나가 화면·WebSocket·API를 `https://앱이름.fly.dev` 한 주소로 제공합니다. 세션 기록(SQLite)과 음성은 Fly 볼륨(`/data`)에 저장됩니다.

1. [Fly.io](https://fly.io)에 가입하고 결제 수단을 등록합니다(직접 해야 합니다).
2. flyctl을 설치하고 로그인합니다. PowerShell 기준입니다.

   ```bash
   iwr https://fly.io/install.ps1 -useb | iex
   ```

   ```bash
   fly auth login
   ```

3. 저장소 폴더에서 앱을 만듭니다. 앱 이름은 전 세계에서 하나뿐이어야 해서 `banwonpoker`가 이미 있으면 다른 이름을 고릅니다. `fly.toml`을 그대로 쓰겠냐고 물으면 예로 답합니다.

   ```bash
   fly launch --no-deploy --copy-config
   ```

4. 기록을 저장할 볼륨(1GB)을 만들고 배포합니다.

   ```bash
   fly volumes create banwonpoker_data --region nrt --size 1
   ```

   ```bash
   fly deploy
   ```

5. `https://앱이름.fly.dev`를 열어 방을 만들고, 대기실의 초대 링크를 친구에게 보냅니다.

### 업데이트

이미 배포한 앱에 바뀐 코드를 올릴 때는 저장소 폴더에서 이것만 실행합니다. 진행 중인 게임이 끊기므로 아무도 게임하지 않을 때 합니다.

```bash
fly deploy
```

### 운영

- 현재 배포: 앱 `banwonpoker`, 리전 `nrt`, 볼륨 `banwonpoker_data`(1GB), 머신 한 대(shared-cpu-1x, 512MB).
- 상태 확인: `fly status --app banwonpoker`, 로그: `fly logs --app banwonpoker`, 헬스 체크: <https://banwonpoker.fly.dev/health>
- 서버가 꺼져 있으면 `fly machine list --app banwonpoker`로 머신 ID를 보고 `fly machine start <ID> --app banwonpoker`로 켭니다.
- Fly.io 무료 체험 계정은 머신을 5분마다 끕니다. 카드를 등록해야 계속 켜져 있습니다.
- 진행 중인 방은 서버 메모리에 있으므로, 배포(재시작)하면 그때 진행 중이던 게임은 끊깁니다. 끝난 세션의 기록과 복기는 볼륨에 남습니다.
- 서버를 항상 한 대 켜 두도록(`auto_stop_machines = "off"`) 설정했습니다. 비용은 Fly.io 요금표를 확인하세요.
- 로컬에서 같은 구성을 확인하려면 `docker build -t banwonpoker .` 후 `docker run -p 8080:8080 banwonpoker`로 실행하고 <http://localhost:8080>을 엽니다.

## 게임 서버

```bash
pnpm dev:server
```

| 환경 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `8787` | 포트 |
| `HOST` | `127.0.0.1` | 같은 와이파이의 다른 기기에서 접속하려면 `0.0.0.0` |
| `ALLOWED_ORIGINS` | 없음 | 다른 주소의 화면에서 접속을 허용할 웹 주소(쉼표로 구분). 서버가 준 화면(같은 주소)과 localhost는 늘 허용 |
| `DATA_DIR` | `data` | 세션 기록(SQLite)과 음성 파일을 둘 폴더 |
| `STATIC_DIR` | 없음 | 빌드된 화면 폴더. 주면 같은 주소에서 화면도 제공(배포용) |

- 주소: WebSocket `ws://호스트:포트/ws`, 헬스 체크 `http://호스트:포트/health`
- 메시지는 JSON 한 줄이고, 타입은 `backend/server/src/protocol.ts`에 있습니다.
  - 보내는 것: `room.create`·`room.join`·`room.resume`(토큰 재접속)·`seat.take`·`ready.set`·`settings.update`·`game.start`·`action`·`session.end`·`room.leave`·`ping`
  - 받는 것: `joined`(참가자 id와 재접속 토큰)·`state`(나에게 보이는 전체 상태)·`events`(엔진 이벤트 + `sessionTimeMs`)·`action.result`·`error`·`pong`
- 서버가 모든 판정을 합니다. `state`에는 내 홀카드와 쇼다운에서 공개된 카드만 들어 있습니다.
- 계정은 없습니다. 입장하면 받은 토큰을 브라우저에 저장해 두었다가 연결이 끊기면 `room.resume`으로 같은 자리에 돌아옵니다.
- 진행 중인 방은 서버 메모리에 있습니다. 서버를 다시 시작하면 진행 중이던 게임은 사라지고, 끝난 세션 기록은 `DATA_DIR`에 남습니다.
- `pnpm --filter @banwonpoker/server build`는 서버를 `backend/server/dist/server.mjs` 파일 하나로 묶습니다(배포용, `node server.mjs`로 실행).

## 기술 스택

- 프론트엔드: React 19.3, TypeScript 6, Vite 8.3, Tailwind CSS 4.3, Fluent System Icons, Pretendard(가변 폰트, 유니코드 범위별 동적 서브셋)·Inter 자체 호스팅
- 백엔드: TypeScript 6, Node.js, `ws`(WebSocket), `tsx`로 실행
- 공통: pnpm 워크스페이스, OXLint, Vitest, React Testing Library, Playwright, axe-core

## 방 규칙

방장이 방을 만들 때 정하고, **게임을 시작하기 전 대기실에서만** 바꿀 수 있습니다. 게임 중 `설정` 버튼은 규칙을 읽기 전용으로 보여줍니다.

| 항목 | 규칙 |
| --- | --- |
| 블라인드 | 고정, 또는 시간마다 인상. 인상이면 간격(5~30분)과 레벨별 금액을 방장이 정합니다(2~15레벨, 빅 블라인드는 스몰의 2배, 레벨은 계속 커져야 함). 마지막 레벨에 닿으면 그대로 유지합니다. |
| 시작 칩 | 첫 빅 블라인드의 20배 이상, 1,000,000 이하 |
| 최대 인원 | 2~6명. 대기실에 이미 들어온 인원보다 적게 줄일 수 없습니다. |
| 차례 제한 | 60초 고정 |
| 칩 소진 | 칩을 모두 잃으면 탈락합니다. |
| 중간 참가 | 게임 중에 들어오거나 준비가 늦은 참가자는 다음 핸드부터 참여합니다. |
| 게임 시작 | 방장만 할 수 있고, 준비를 마친 인원이 2명 이상이어야 합니다. |
| 세션 종료 | 방장만 할 수 있습니다(D10). |

## 설계 원칙

- 녹음은 **내 브라우저에서 내 차례에만** 일어납니다. 상대 좌석과 참가자 목록에는 마이크·녹음·업로드 상태를 모델에서부터 두지 않습니다.
- 녹음·전체 패 공개 동의는 준비 완료의 필수 조건입니다. 마이크 문제는 필수 조건이 아니며 `음성 없이 참여`를 명시적으로 고르면 준비할 수 있습니다.
- 상태는 색만으로 구분하지 않고 문구·아이콘·테두리 형태를 함께 씁니다.
- 액션 버튼은 콜·레이즈·체크·폴드 네 자리를 고정하고, 누를 수 없는 버튼은 이유를 표시합니다.

## 라이선스

[GNU Affero General Public License v3.0 이상](LICENSE)(AGPL-3.0-or-later)입니다. 이 코드를 고쳐 서비스로 운영하면, 그 서비스를 쓰는 사람에게도 고친 소스를 받을 수 있게 해야 합니다. 배포한 서비스는 처음 화면 아래의 `소스 코드` 링크로 이 저장소를 알려줍니다.
