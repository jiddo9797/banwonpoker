import { bigBlindIndex, postflopOrder, smallBlindIndex } from './positions'

/**
 * 프리플랍 게임 트리.
 *
 * 금액은 모두 BB 단위이고 모든 플레이어의 스택은 같다(유효 스택).
 * 트리가 감당할 만한 크기가 되도록 다음처럼 단순화한다.
 * - 팟을 다투는 사람(콜·레이즈한 사람)은 최대 두 명이다. 오픈과 콜로 둘이 들어온 뒤에는
 *   다른 사람은 폴드하거나 스퀴즈만 할 수 있고, 스퀴즈하면 먼저 들어온 둘 중
 *   먼저 계속하는 한 명만 남고 나머지는 폴드한다. 3벳 뒤의 콜드 4벳은 없다.
 * - 오픈 전 림프는 스몰 블라인드만 할 수 있다(블라인드 대 블라인드).
 * - 레이즈는 오픈 → 3벳 → 4벳 → 올인까지.
 * - 스택이 짧으면 푸시/폴드만 남긴다.
 */

export type ActionKind = 'fold' | 'check' | 'call' | 'limp' | 'raise' | 'allin'

export interface TreeAction {
  kind: ActionKind
  /** 이 행동 뒤 이 플레이어가 낸 총액(BB) */
  to: number
}

export interface LineStep {
  player: number
  kind: ActionKind
  to: number
}

export interface DecisionNode {
  type: 'decision'
  id: number
  player: number
  /** 이 시점까지 각자 낸 금액 */
  contrib: number[]
  /** 지금까지의 폴드가 아닌 행동 */
  line: LineStep[]
  /** 스퀴즈 정리 규칙 때문에 누군가 자동으로 폴드한 적이 있는지 */
  autoFolded: boolean
  actions: TreeAction[]
  children: TreeNode[]
}

export interface TerminalNode {
  type: 'terminal'
  id: number
  contrib: number[]
  pot: number
  /** 모두 폴드해 팟을 가져간 사람. 둘이 다투면 -1 */
  winner: number
  /** 다투는 두 사람 [플랍에서 먼저 행동하는 쪽(OOP), 포지션(IP)] */
  contestants: [number, number] | null
  /** 올인과 콜로 끝나 보드를 끝까지 펼치는지 */
  allIn: boolean
  /** 플랍에서의 스택 대 팟 비율 */
  spr: number
}

export type TreeNode = DecisionNode | TerminalNode

export interface TreeOptions {
  players: number
  stack: number
}

export interface Sizing {
  pushFold: boolean
  open: number
  sbOpen: number
  iso: number
  threeBetIp: number
  threeBetOop: number
  fourBetIp: number
  fourBetOop: number
  /** 레이즈가 스택의 이 비율을 넘으면 올인으로 바꾼다. */
  jamFraction: number
  /** 오픈·3벳 단계에서도 올인을 고를 수 있는지 */
  earlyShove: boolean
}

export const PUSH_FOLD_MAX_STACK = 15

export function sizingFor(stack: number): Sizing {
  return {
    pushFold: stack <= PUSH_FOLD_MAX_STACK,
    open: stack <= 25 ? 2 : stack <= 40 ? 2.2 : 2.5,
    sbOpen: stack <= 40 ? 2.5 : 3,
    iso: stack <= 40 ? 3 : 3.5,
    threeBetIp: 3,
    threeBetOop: stack <= 40 ? 3.5 : 4,
    fourBetIp: 2.2,
    fourBetOop: 2.4,
    jamFraction: 0.4,
    earlyShove: stack <= 40,
  }
}

export interface GameTree {
  players: number
  stack: number
  sizing: Sizing
  root: TreeNode
  decisions: DecisionNode[]
  terminals: TerminalNode[]
}

interface State {
  contrib: number[]
  folded: boolean[]
  acted: boolean[]
  contestants: number[]
  level: number
  currentBet: number
  lastRaiser: number
  lastActor: number
  /** 스퀴즈 뒤 아직 답해야 하는 먼저 들어온 사람들 */
  resolving: number[]
  line: LineStep[]
  autoFolded: boolean
}

const round = (value: number) => Math.round(value * 100) / 100

export function buildTree({ players, stack }: TreeOptions): GameTree {
  const sizing = sizingFor(stack)
  const decisions: DecisionNode[] = []
  const terminals: TerminalNode[] = []
  const sb = smallBlindIndex(players)
  const bb = bigBlindIndex(players)
  let nextId = 0

  const activeContestants = (state: State) => state.contestants.filter((p) => !state.folded[p])

  function terminal(state: State): TerminalNode {
    const pot = state.contrib.reduce((sum, value) => sum + value, 0)
    const alive = state.folded.flatMap((folded, p) => (folded ? [] : [p]))
    let node: TerminalNode
    if (alive.length === 1) {
      node = { type: 'terminal', id: nextId++, contrib: [...state.contrib], pot, winner: alive[0], contestants: null, allIn: false, spr: 0 }
    } else {
      if (alive.length !== 2) throw new Error(`다투는 사람이 ${alive.length}명입니다.`)
      const [a, b] = alive
      const pair: [number, number] = postflopOrder(players, a) < postflopOrder(players, b) ? [a, b] : [b, a]
      const behind = stack - state.contrib[a]
      node = {
        type: 'terminal',
        id: nextId++,
        contrib: [...state.contrib],
        pot,
        winner: -1,
        contestants: pair,
        allIn: behind <= 1e-9,
        spr: round(behind / pot),
      }
    }
    terminals.push(node)
    return node
  }

  function nextActor(state: State): number {
    for (let step = 1; step <= players; step += 1) {
      const p = (state.lastActor + step) % players
      if (state.folded[p] || state.contrib[p] >= stack) continue
      if (!state.acted[p] || state.contrib[p] < state.currentBet) return p
    }
    return -1
  }

  function raiseTo(state: State, actor: number, facingLimp: boolean): number | null {
    if (state.level >= 3) return null
    let to: number
    if (state.level === 0) {
      to = facingLimp ? sizing.iso : actor === sb ? sizing.sbOpen : sizing.open
    } else {
      const ip = postflopOrder(players, actor) > postflopOrder(players, state.lastRaiser)
      // 스퀴즈는 먼저 콜한 사람 수만큼 키운다.
      const callers = activeContestants(state).filter((p) => p !== state.lastRaiser && p !== actor).length
      const multiplier =
        state.level === 1 ? (ip ? sizing.threeBetIp : sizing.threeBetOop) : ip ? sizing.fourBetIp : sizing.fourBetOop
      to = state.currentBet * multiplier + callers * state.currentBet
    }
    to = round(to)
    if (to >= stack * sizing.jamFraction) return null
    return to
  }

  function actionsFor(state: State, actor: number): TreeAction[] {
    const contestants = activeContestants(state)
    const isContestant = contestants.includes(actor)
    const facingAllIn = state.currentBet >= stack
    const actions: TreeAction[] = []
    const add = (kind: ActionKind, to: number) => actions.push({ kind, to: round(to) })

    // 둘이 이미 다투는데 정리 중(셋)이면 끼어들 수 없다.
    if (!isContestant && contestants.length >= 3) return []
    // 오픈과 3벳이 오간 뒤의 콜드 4벳은 넣지 않는다. 정리 규칙상 오프너가 콜만 해도
    // 3벳한 사람이 밀려나 3벳 자체가 부당하게 불리해진다.
    if (!isContestant && contestants.length === 2 && state.level >= 2) return []

    if (sizing.pushFold) {
      add('fold', state.contrib[actor])
      if (facingAllIn) {
        if (!isContestant && contestants.length >= 2) return []
        add('call', stack)
        return actions
      }
      add('allin', stack)
      return actions
    }

    const facingLimp = state.level === 0 && contestants.length === 1
    if (contestants.length === 0) {
      add('fold', state.contrib[actor])
      if (actor === sb) add('limp', 1)
      const open = raiseTo(state, actor, false)
      if (open !== null) add('raise', open)
      if (sizing.earlyShove || open === null) add('allin', stack)
      return actions
    }

    if (facingLimp) {
      // 스몰 블라인드가 림프하면 빅 블라인드는 체크하거나 아이솔레이션 레이즈한다.
      add('check', 1)
      const iso = raiseTo(state, actor, true)
      if (iso !== null) add('raise', iso)
      if (sizing.earlyShove || iso === null) add('allin', stack)
      return actions
    }

    add('fold', state.contrib[actor])
    if (isContestant || contestants.length === 1) add('call', Math.min(stack, state.currentBet))
    if (facingAllIn) return actions.length > 1 ? actions : []
    const raise = raiseTo(state, actor, false)
    if (raise !== null) add('raise', raise)
    if (raise === null || sizing.earlyShove || state.level >= 2) add('allin', stack)
    return actions.length > 1 ? actions : []
  }

  function apply(state: State, actor: number, action: TreeAction): State {
    const next: State = {
      ...state,
      contrib: [...state.contrib],
      folded: [...state.folded],
      acted: [...state.acted],
      contestants: [...state.contestants],
      resolving: [...state.resolving],
      line: [...state.line],
      lastActor: actor,
    }
    next.acted[actor] = true
    if (action.kind === 'fold') {
      next.folded[actor] = true
      next.resolving = next.resolving.filter((p) => p !== actor)
      return next
    }
    next.line.push({ player: actor, kind: action.kind, to: action.to })
    const wasContestant = next.contestants.includes(actor)
    const othersBefore = activeContestants(state).filter((p) => p !== actor)
    if (!wasContestant) next.contestants.push(actor)
    next.contrib[actor] = action.to

    if (action.to > state.currentBet) {
      // 레이즈(올인 포함)
      next.level = state.level + 1
      next.currentBet = action.to
      next.lastRaiser = actor
      for (let p = 0; p < players; p += 1) if (p !== actor) next.acted[p] = false
      if (!wasContestant && othersBefore.length >= 2) next.resolving = othersBefore
    }

    // 정리 중인 사람이 계속하면 남은 사람은 폴드한다.
    if (state.resolving.includes(actor)) {
      for (const p of next.resolving) {
        if (p !== actor && !next.folded[p]) {
          next.folded[p] = true
          next.autoFolded = true
        }
      }
      next.resolving = []
    }
    return next
  }

  function build(state: State): TreeNode {
    const alive = state.folded.filter((folded) => !folded).length
    if (alive === 1) return terminal(state)
    let actor = nextActor(state)
    while (actor >= 0) {
      const actions = actionsFor(state, actor)
      if (actions.length > 1) break
      // 고를 것이 폴드뿐이면 자동으로 폴드한다.
      state = apply(state, actor, { kind: 'fold', to: state.contrib[actor] })
      if (state.folded.filter((folded) => !folded).length === 1) return terminal(state)
      actor = nextActor(state)
    }
    if (actor < 0) return terminal(state)

    const node: DecisionNode = {
      type: 'decision',
      id: nextId++,
      player: actor,
      contrib: [...state.contrib],
      line: state.line,
      autoFolded: state.autoFolded,
      actions: actionsFor(state, actor),
      children: [],
    }
    decisions.push(node)
    node.children = node.actions.map((action) => build(apply(state, actor, action)))
    return node
  }

  const contrib = Array.from({ length: players }, () => 0)
  contrib[sb] = 0.5
  contrib[bb] = 1
  const root = build({
    contrib,
    folded: Array.from({ length: players }, () => false),
    acted: Array.from({ length: players }, () => false),
    contestants: [],
    level: 0,
    currentBet: 1,
    lastRaiser: bb,
    lastActor: bb,
    resolving: [],
    line: [],
    autoFolded: false,
  })
  return { players, stack, sizing, root, decisions, terminals }
}
