import type {
  ActionOption,
  Card,
  ScenarioKey,
  Seat,
  TableSnapshot,
} from './model'

const flopBoard: TableSnapshot['board'] = [
  { rank: 'K', suit: 'spade' },
  { rank: '9', suit: 'heart' },
  { rank: '4', suit: 'heart' },
  null,
  null,
]

const turnBoard: TableSnapshot['board'] = [
  ...flopBoard.slice(0, 3),
  { rank: '2', suit: 'club' },
  null,
] as TableSnapshot['board']

const riverBoard: TableSnapshot['board'] = [
  ...turnBoard.slice(0, 4),
  { rank: 'J', suit: 'heart' },
] as TableSnapshot['board']

const heroCards: TableSnapshot['heroCards'] = [
  { rank: 'A', suit: 'heart' },
  { rank: 'K', suit: 'heart' },
]

const baseSeats: Seat[] = [
  {
    id: 'eugene',
    name: '유진',
    stack: 9_950,
    position: 'bottom-left',
    badge: 'SB',
    bet: 50,
    status: 'active',
  },
  {
    id: 'seojun',
    name: '서준',
    stack: 9_700,
    position: 'top-left',
    badge: 'BB',
    bet: 300,
    status: 'active',
  },
  {
    id: 'minsu',
    name: '민수',
    stack: 9_700,
    position: 'top-center',
    bet: 300,
    status: 'active',
  },
  {
    id: 'jihun',
    name: '지훈',
    stack: 10_000,
    position: 'top-right',
    status: 'active',
  },
  {
    id: 'subin',
    name: '수빈',
    stack: 10_000,
    position: 'bottom-right',
    status: 'active',
  },
]

const waitingActions: ActionOption[] = [
  {
    id: 'call',
    label: '콜',
    detail: '내 차례에 사용 가능',
    enabled: false,
    tone: 'neutral',
  },
  {
    id: 'raise',
    label: '레이즈',
    detail: '내 차례에 사용 가능',
    enabled: false,
    tone: 'accent',
  },
  {
    id: 'check',
    label: '체크',
    detail: '내 차례에 사용 가능',
    enabled: false,
    tone: 'neutral',
  },
  {
    id: 'fold',
    label: '폴드',
    detail: '내 차례에 사용 가능',
    enabled: false,
    tone: 'danger',
  },
]

const activeActions: ActionOption[] = [
  {
    id: 'call',
    label: '콜',
    detail: '900',
    enabled: true,
    tone: 'neutral',
  },
  {
    id: 'raise',
    label: '레이즈',
    detail: '2,400',
    enabled: true,
    tone: 'accent',
  },
  {
    id: 'check',
    label: '체크',
    detail: '베팅이 있어 불가',
    enabled: false,
    tone: 'neutral',
  },
  {
    id: 'fold',
    label: '폴드',
    detail: '핸드 포기',
    enabled: true,
    tone: 'danger',
  },
]

const pendingActions: ActionOption[] = [
  {
    id: 'call',
    label: '콜',
    detail: '입력 잠금',
    enabled: false,
    tone: 'neutral',
  },
  {
    id: 'raise',
    label: '처리 중…',
    detail: '레이즈 2,400',
    enabled: false,
    tone: 'accent',
  },
  {
    id: 'check',
    label: '체크',
    detail: '입력 잠금',
    enabled: false,
    tone: 'neutral',
  },
  {
    id: 'fold',
    label: '폴드',
    detail: '입력 잠금',
    enabled: false,
    tone: 'danger',
  },
]

const showdownActions: ActionOption[] = waitingActions.map((action) => ({
  ...action,
  detail: '다음 핸드 준비 중',
}))

function copyCard(card: Card): Card {
  return { ...card }
}

function copyBoard(board: TableSnapshot['board']): TableSnapshot['board'] {
  return board.map((card) => (card ? copyCard(card) : null)) as TableSnapshot['board']
}

function copySeat(seat: Seat): Seat {
  return {
    ...seat,
    showdownCards: seat.showdownCards
      ? [copyCard(seat.showdownCards[0]), copyCard(seat.showdownCards[1])]
      : undefined,
  }
}

function seatsWith(updates: Record<string, Partial<Seat>>): Seat[] {
  return baseSeats.map((seat) => ({
    ...copySeat(seat),
    ...updates[seat.id],
  }))
}

const baseSnapshot: TableSnapshot = {
  key: 'opp',
  label: '상대 차례',
  description: '지훈의 액션을 기다리는 기본 테이블 상태',
  handNumber: 24,
  gameType: '노리밋 홀덤',
  smallBlind: 50,
  bigBlind: 100,
  street: '플랍',
  board: flopBoard,
  pots: [{ label: '팟', amount: 1_450 }],
  seats: seatsWith({
    jihun: { isTurn: true, remainingSeconds: 38 },
  }),
  heroId: 'hero',
  heroCards,
  heroBadge: 'D',
  heroStack: 9_750,
  recordingState: 'hidden',
  actionHint: '지훈 차례를 기다리는 중',
  actions: waitingActions,
  callAmount: 900,
  minRaise: 1_500,
  maxRaise: 9_750,
  selectedBetAmount: 2_400,
  logs: ['민수가 300 콜', '서준 300 베팅', '유진 체크'],
  connection: 'connected',
}

type SnapshotOverrides = Partial<Omit<TableSnapshot, 'key'>>

function createScenario(key: ScenarioKey, overrides: SnapshotOverrides): TableSnapshot {
  const board = overrides.board ?? baseSnapshot.board
  const pots = overrides.pots ?? baseSnapshot.pots
  const seats = overrides.seats ?? baseSnapshot.seats
  const actions = overrides.actions ?? baseSnapshot.actions
  const logs = overrides.logs ?? baseSnapshot.logs
  const cards = overrides.heroCards ?? baseSnapshot.heroCards

  return {
    ...baseSnapshot,
    ...overrides,
    key,
    board: copyBoard(board),
    pots: pots.map((pot) => ({ ...pot })),
    seats: seats.map(copySeat),
    heroCards: cards ? [copyCard(cards[0]), copyCard(cards[1])] : null,
    actions: actions.map((action) => ({ ...action })),
    logs: [...logs],
    waitingPlayers: overrides.waitingPlayers ? [...overrides.waitingPlayers] : undefined,
    toast: overrides.toast ? { ...overrides.toast } : undefined,
  }
}

export const tableFixtures = {
  opp: createScenario('opp', {}),
  my: createScenario('my', {
    label: '내 차례',
    description: '내 차례가 시작되어 액션과 베팅을 선택할 수 있는 상태',
    seats: seatsWith({
      jihun: { status: 'folded' },
      subin: { stack: 9_100, bet: 900 },
    }),
    heroRemainingSeconds: 42,
    recordingState: 'recording',
    actionHint: '액션과 베팅 금액을 선택하세요',
    actions: activeActions,
    logs: ['수빈이 900으로 레이즈', '지훈 폴드', '민수가 300 콜', '서준 300 베팅'],
  }),
  pending: createScenario('pending', {
    label: '처리 대기',
    description: '레이즈 요청을 보낸 뒤 서버 확인을 기다리는 상태',
    seats: seatsWith({
      jihun: { status: 'folded' },
      subin: { stack: 9_100, bet: 900 },
    }),
    heroRemainingSeconds: 42,
    recordingState: 'processing',
    actionHint: '서버 확인을 기다리는 중 · 중복 입력 잠금',
    actions: pendingActions,
    logs: ['수빈이 900으로 레이즈', '지훈 폴드', '민수가 300 콜', '서준 300 베팅'],
  }),
  fold: createScenario('fold', {
    label: '폴드 직후',
    description: '지훈의 폴드가 반영되고 수빈에게 차례가 이동한 상태',
    seats: seatsWith({
      jihun: { status: 'folded' },
      subin: { isTurn: true, remainingSeconds: 57 },
    }),
    actionHint: '수빈 차례를 기다리는 중',
    logs: ['지훈 폴드', '민수가 300 콜', '서준 300 베팅', '유진 체크'],
    toast: { kind: 'info', message: '지훈 폴드' },
  }),
  allin: createScenario('allin', {
    label: '올인과 사이드 팟',
    description: '서준의 올인으로 메인 팟과 사이드 팟이 나뉜 상태',
    street: '턴',
    board: turnBoard,
    pots: [
      { label: '메인 팟', amount: 4_850 },
      { label: '사이드 팟', amount: 1_800 },
    ],
    potNote: '서준은 메인 팟까지만 참여',
    seats: seatsWith({
      seojun: { stack: 0, bet: 2_150, status: 'all-in' },
      jihun: { status: 'folded' },
      subin: { isTurn: true, remainingSeconds: 31 },
    }),
    actionHint: '수빈 차례를 기다리는 중',
    logs: [
      '사이드 팟 생성 · 1,800',
      '서준 올인 2,150',
      '지훈 폴드',
      '민수가 300 콜',
      '서준 300 베팅',
    ],
  }),
  showdown: createScenario('showdown', {
    label: '쇼다운',
    description: '모든 커뮤니티 카드와 참가자의 패가 공개된 결과 상태',
    street: '쇼다운',
    board: riverBoard,
    pots: [{ label: '팟', amount: 6_650 }],
    seats: seatsWith({
      seojun: {
        showdownCards: [
          { rank: '7', suit: 'club' },
          { rank: '7', suit: 'diamond' },
        ],
        handRank: '세븐 원 페어',
      },
      subin: {
        showdownCards: [
          { rank: 'K', suit: 'diamond' },
          { rank: '9', suit: 'diamond' },
        ],
        handRank: '투 페어',
      },
      jihun: { status: 'folded' },
    }),
    tableMessage: '나 승리 · 에이스 하이 플러시 +6,650',
    actionHint: '다음 핸드 준비 중',
    actions: showdownActions,
    callAmount: 0,
    minRaise: 0,
    selectedBetAmount: 0,
    logs: [
      '나 승리 · 에이스 하이 플러시 +6,650',
      '사이드 팟 생성 · 1,800',
      '서준 올인 2,150',
    ],
  }),
  disc: createScenario('disc', {
    label: '연결 끊김',
    description: '차례 중인 민수의 연결이 끊겨 재접속을 기다리는 상태',
    seats: seatsWith({
      minsu: {
        status: 'disconnected',
        isTurn: true,
        remainingSeconds: 24,
      },
    }),
    actionHint: '민수의 재접속을 기다리는 중',
    logs: ['민수가 300 콜', '서준 300 베팅', '유진 체크'],
    toast: {
      kind: 'warning',
      message: '민수 연결이 끊겼습니다. 시간 안에 돌아오지 않으면 자동으로 처리됩니다.',
    },
  }),
  micfail: createScenario('micfail', {
    label: '마이크 실패',
    description: '음성 기록 재시도 중에도 게임 액션은 정상적으로 가능한 상태',
    seats: seatsWith({
      jihun: { status: 'folded' },
      subin: { stack: 9_100, bet: 900 },
    }),
    heroRemainingSeconds: 39,
    recordingState: 'failed',
    actionHint: '음성 기록 재시도 중 · 게임은 계속 진행됩니다',
    actions: activeActions,
    logs: ['수빈이 900으로 레이즈', '지훈 폴드', '민수가 300 콜', '서준 300 베팅'],
  }),
  elim: createScenario('elim', {
    label: '탈락과 다음 핸드 참가',
    description: '서준이 칩을 모두 잃어 탈락하고, 게임 중 들어온 도윤이 다음 핸드를 기다리는 상태',
    handNumber: 25,
    street: '프리플랍',
    board: [null, null, null, null, null],
    pots: [{ label: '팟', amount: 150 }],
    seats: seatsWith({
      eugene: { badge: 'D', bet: undefined },
      seojun: { status: 'eliminated', stack: 0, badge: undefined, bet: undefined },
      minsu: { badge: 'SB', bet: 50, stack: 12_300 },
      jihun: { badge: 'BB', bet: 100, stack: 7_300 },
      subin: { isTurn: true, remainingSeconds: 45, stack: 8_950 },
    }),
    heroBadge: 'none',
    heroStack: 16_400,
    actionHint: '수빈 차례를 기다리는 중',
    logs: ['핸드 #25 시작', '서준 탈락 · 칩 0', '나 승리 · 에이스 하이 플러시 +6,650'],
    waitingPlayers: ['도윤'],
    toast: { kind: 'info', message: '서준이 칩을 모두 잃어 탈락했습니다' },
  }),
} satisfies Record<ScenarioKey, TableSnapshot>

function copySnapshot(snapshot: TableSnapshot): TableSnapshot {
  return {
    ...snapshot,
    board: copyBoard(snapshot.board),
    pots: snapshot.pots.map((pot) => ({ ...pot })),
    seats: snapshot.seats.map(copySeat),
    heroCards: snapshot.heroCards ? [copyCard(snapshot.heroCards[0]), copyCard(snapshot.heroCards[1])] : null,
    actions: snapshot.actions.map((action) => ({ ...action })),
    logs: [...snapshot.logs],
    waitingPlayers: snapshot.waitingPlayers ? [...snapshot.waitingPlayers] : undefined,
    toast: snapshot.toast ? { ...snapshot.toast } : undefined,
  }
}

export function getTableSnapshot(scenarioKey: ScenarioKey): TableSnapshot {
  return copySnapshot(tableFixtures[scenarioKey])
}
