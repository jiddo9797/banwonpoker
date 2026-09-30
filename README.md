# banwonpoker

Private multiplayer poker with turn-based voice replay

친구끼리 비공개 방에서 2~6인 노리밋 텍사스 홀덤을 하고, 내 차례에만 기록된 음성으로 세션이 끝난 뒤 함께 복기하는 서비스입니다.

> **현재 단계: 녹음 없이 친구들과 실제로 한 판을 둘 수 있습니다.**
> - `backend/engine/`: 노리밋 홀덤 규칙 엔진(완료)
> - `backend/server/`: 게임 서버(완료). 방·좌석·준비·차례 타이머를 관리하고 WebSocket으로 참가자별 화면을 보냅니다.
> - `frontend/`: 실제 게임 화면(서버 연결 완료)과, 검토용 목업 클릭 프로토타입
> - 아직 없음: 차례별 녹음, 저장·복기(세션 기록은 서버를 끄면 사라집니다), 인터넷 배포
> - 다음: 녹음 → 저장·복기 → 배포

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
    live/                 실제 게임: 서버 연결(client.ts), 서버 상태 → 화면 변환(adapt.ts), 화면 전환(LiveApp)
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
  server/                 게임 서버 (@banwonpoker/server)
    src/
      protocol.ts         브라우저와 주고받는 메시지 타입과 입력 검증(프론트가 그대로 가져다 씀)
      settings.ts         방 설정 검증, 블라인드 일정
      room.ts             방 하나: 대기실·좌석·준비·게임 시작·차례 타이머·다음 핸드·탈락·세션 종료·재접속
      manager.ts          방 코드 발급과 방 목록
      server.ts           HTTP(헬스 체크)와 WebSocket(/ws)
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

**프론트엔드**

- 테이블·흐름·복기 reducer와 fixture 불변 조건: 상대 좌석에 녹음 필드가 없음, 액션 버튼 순서, 차례는 한 명, 칩 합계 등
- 다이얼로그 포커스 가두기와 포커스 복귀, 탭·타임라인 방향키 이동
- 입장부터 복기까지 전체 클릭 흐름

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
- `e2e/live.spec.ts`: **실제 게임 서버(8788)를 띄우고** 저장소가 분리된 브라우저 두 개로 방 만들기 → 초대 링크 입장 → 가짜 마이크로 점검 → 게임 시작 → 콜·체크·베팅·폴드 → 정산 → 다음 핸드 → 세션 종료, 새로고침 재접속, 없는 방 코드, 화면별 axe 검사

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

## 게임 서버

```bash
pnpm dev:server
```

| 환경 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `8787` | 포트 |
| `HOST` | `127.0.0.1` | 같은 와이파이의 다른 기기에서 접속하려면 `0.0.0.0` |
| `ALLOWED_ORIGINS` | 없음 | 접속을 허용할 웹 주소(쉼표로 구분). 비우면 localhost만 허용 |

- 주소: WebSocket `ws://호스트:포트/ws`, 헬스 체크 `http://호스트:포트/health`
- 메시지는 JSON 한 줄이고, 타입은 `backend/server/src/protocol.ts`에 있습니다.
  - 보내는 것: `room.create`·`room.join`·`room.resume`(토큰 재접속)·`seat.take`·`ready.set`·`settings.update`·`game.start`·`action`·`session.end`·`room.leave`·`ping`
  - 받는 것: `joined`(참가자 id와 재접속 토큰)·`state`(나에게 보이는 전체 상태)·`events`(엔진 이벤트 + `sessionTimeMs`)·`action.result`·`error`·`pong`
- 서버가 모든 판정을 합니다. `state`에는 내 홀카드와 쇼다운에서 공개된 카드만 들어 있습니다.
- 계정은 없습니다. 입장하면 받은 토큰을 브라우저에 저장해 두었다가 연결이 끊기면 `room.resume`으로 같은 자리에 돌아옵니다.
- 방은 서버 메모리에만 있습니다. 서버를 다시 시작하면 사라집니다(저장은 5단계).

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
