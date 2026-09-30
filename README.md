# banwonpoker

Private multiplayer poker with turn-based voice replay

친구끼리 비공개 방에서 2~6인 노리밋 텍사스 홀덤을 하고, 내 차례에만 기록된 음성으로 세션이 끝난 뒤 함께 복기하는 서비스입니다.

> **현재 단계: 프론트엔드 클릭 프로토타입.** 모든 화면은 목(mock) 데이터로 움직입니다. 백엔드, 실제 포커 규칙, 실제 녹음·업로드, WebSocket, DB는 아직 없습니다. 프로토타입 검토가 끝나면 별도의 M1 녹음 실험으로 넘어갑니다.

## 요구 사항

- Node.js 22.12 이상(개발 환경은 Node 24)
- pnpm 11.19.0(`packageManager`로 고정). Corepack을 쓰면 버전이 자동으로 맞춰집니다.

```bash
corepack enable
```

## 설치와 실행

```bash
pnpm install
pnpm dev
```

개발 서버가 뜨면 <http://localhost:5173>을 엽니다. 처음 화면은 입장 화면이고, 입장 → 좌석 선택 → 동의 → 마이크 점검 → 테이블 → 세션 종료 → 복기 순서로 클릭해 이어 볼 수 있습니다.

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | Vite 개발 서버 |
| `pnpm build` | 타입 검사 후 프로덕션 빌드(`apps/web/dist`) |
| `pnpm typecheck` | TypeScript 타입 검사 |
| `pnpm lint` | OXLint(경고도 실패로 처리) |
| `pnpm test` | Vitest + React Testing Library 단위·컴포넌트 테스트 |
| `pnpm test:e2e` | Playwright 시각 회귀·axe 접근성·클릭 흐름 테스트 |
| `pnpm test:e2e:update` | 시각 회귀 기준 이미지 다시 만들기 |

## 화면과 URL

주소창의 쿼리로 원하는 화면과 상태를 바로 열 수 있습니다. 화면을 옮기면 URL도 따라 바뀝니다.

### 화면(`?screen=`)

| 값 | 화면 |
| --- | --- |
| `entry` | 방 입장(닉네임) |
| `seat` | 좌석 선택 |
| `consent` | 녹음·전체 패 공개 동의 |
| `mic` | 마이크 점검, `음성 없이 참여` |
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

`my`나 `micfail`에서 액션을 누르면 `처리 중`(1.2초) → `액션 확정` → `유진 차례`로 넘어갑니다. `voiceless=1`을 붙이면 `음성 없이 참여`로 들어온 상태를 볼 수 있습니다.

### 목 결과 지정

| 파라미터 | 값 | 설명 |
| --- | --- | --- |
| `mic` | `ready`, `denied`, `not-found` | 마이크 점검 결과. `screen=mic`과 함께 쓰면 그 결과가 보이는 상태로 엽니다. |
| `exportResult` | `success`, `failure` | 다음 영상 내보내기가 성공할지 실패할지 |
| `hand` | `23`, `24` | 복기할 핸드 |
| `action` | `1`부터 | 복기 타임라인의 처음 위치(몇 번째 액션) |
| `export` | `options`, `generating`, `done`, `failed` | 영상 내보내기 창을 해당 상태로 열기 |
| `devtools` | `0` | 개발 도구 숨기기(스크린숏용) |

예시:

- <http://localhost:5173/?screen=mic&mic=denied> 마이크 권한 거부
- <http://localhost:5173/?screen=replay&hand=24&action=13> 플랍에서 내가 콜한 칸
- <http://localhost:5173/?screen=replay&export=failed> 내보내기 실패
- <http://localhost:5173/?screen=replay&exportResult=failure> 내보내기를 누르면 60%에서 실패

## 개발 도구

개발 서버(`pnpm dev`)에서는 화면 위쪽 가운데에 **개발 도구** 버튼이 뜹니다. 화면, 테이블 상태, 마이크 점검 결과, 영상 내보내기 결과, `음성 없이 참여`를 바로 바꿀 수 있습니다.

개발 도구는 1440×900 제품 캔버스 밖에 떠 있고, 프로덕션 빌드에서는 코드째 빠집니다. 검토용 배포에 넣어야 하면 `VITE_DEVTOOLS=true pnpm build`로 빌드합니다.

## 테스트

### 단위·컴포넌트 테스트

```bash
pnpm test
```

- 테이블·흐름·복기 reducer와 fixture 불변 조건: 상대 좌석에 녹음 필드가 없음, 액션 버튼 순서, 차례는 한 명, 칩 합계 등
- 다이얼로그 포커스 가두기와 포커스 복귀, 탭·타임라인 방향키 이동
- 입장부터 복기까지 전체 클릭 흐름

### E2E·시각 회귀·접근성

처음 한 번은 Playwright 브라우저를 설치합니다.

```bash
pnpm --filter @banwonpoker/web exec playwright install chromium
```

```bash
pnpm test:e2e
```

- `e2e/visual.spec.ts`: 테이블 8개 상태 × 1440×900·1280×720, 준비·복기·내보내기 화면, 다이얼로그 스크린숏 비교
- `e2e/a11y.spec.ts`: 모든 화면과 다이얼로그를 axe(WCAG 2.2 AA + best-practice)로 검사, 키보드 Tab 순회와 포커스 링 확인
- `e2e/flow.spec.ts`: 입장 → 복기 → 내보내기 클릭 흐름

E2E는 프로덕션 빌드(`vite preview`, 포트 4173)를 대상으로 돌기 때문에 개발 도구가 스크린숏에 들어가지 않습니다. 기준 이미지는 `apps/web/e2e/__screenshots__`에 OS별 이름(`-win32` 등)으로 저장됩니다. 다른 OS나 CI에서 처음 돌릴 때는 `pnpm test:e2e:update`로 그 환경의 기준 이미지를 만듭니다. 화면을 의도적으로 바꿨을 때도 같은 명령으로 갱신하고, 바뀐 이미지를 확인한 뒤 커밋합니다.

## 구조

```
apps/web/
  src/
    app/            App, 화면 흐름 reducer(flow.ts), URL 동기화
    shared/         1440×900 캔버스, 포커스를 가두는 Dialog, 숫자 포맷
    features/
      table/        메인 테이블(8개 시나리오 fixture, reducer, 컴포넌트)
      lobby/        입장·좌석·동의·마이크 점검
      replay/       세션 요약, 복기, 타임라인, 참가자 음량, ExportModal
    dev/            개발 전용 상태 선택기(프로덕션 빌드 제외)
  e2e/              Playwright 테스트와 기준 이미지
```

## 기술 스택

React 19.3, TypeScript 6, Vite 8.3, Tailwind CSS 4.3, OXLint, Fluent System Icons, Pretendard(가변 폰트, 유니코드 범위별 동적 서브셋)·Inter 자체 호스팅, Vitest, React Testing Library, Playwright, axe-core.

## 설계 원칙

- 녹음은 **내 브라우저에서 내 차례에만** 일어납니다. 상대 좌석과 참가자 목록에는 마이크·녹음·업로드 상태를 모델에서부터 두지 않습니다.
- 녹음·전체 패 공개 동의는 준비 완료의 필수 조건입니다. 마이크 문제는 필수 조건이 아니며 `음성 없이 참여`를 명시적으로 고르면 준비할 수 있습니다.
- 상태는 색만으로 구분하지 않고 문구·아이콘·테두리 형태를 함께 씁니다.
- 액션 버튼은 콜·레이즈·체크·폴드 네 자리를 고정하고, 누를 수 없는 버튼은 이유를 표시합니다.
