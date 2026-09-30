import { MAX_PLAYERS } from '../room/settings'

/** 방 코드(목). 실제로는 서버가 방을 만들 때 발급한다. */
export const ROOM_CODE = 'BWP-7K2Q'

export type LobbyRole = 'host' | 'guest'

/**
 * 대기실 참가자. D2에 따라 다른 참가자의 마이크 상태는 모델에 두지 않고
 * 준비 여부와 연결 상태만 가진다.
 */
export interface LobbyParticipant {
  id: string
  name: string
  seatNumber?: number
  ready: boolean
  connection: 'connected' | 'disconnected'
  isHost?: boolean
}

/** 초대 링크로 들어온 참가자 시점의 대기실. 민수가 방장이다. */
export const lobbyParticipants: LobbyParticipant[] = [
  { id: 'eugene', name: '유진', seatNumber: 1, ready: true, connection: 'connected' },
  { id: 'seojun', name: '서준', seatNumber: 2, ready: false, connection: 'connected' },
  { id: 'minsu', name: '민수', seatNumber: 3, ready: true, connection: 'connected', isHost: true },
  { id: 'jihun', name: '지훈', seatNumber: 4, ready: false, connection: 'disconnected' },
  { id: 'subin', name: '수빈', ready: false, connection: 'connected' },
]

/**
 * 역할별 대기실 참가자 목록.
 * 방장 시점에서는 내가 방장이므로 민수의 방장 표시를 떼고, 내 좌석과 겹치는 친구는 빈 좌석으로 옮긴다.
 */
export function participantsFor(role: LobbyRole, selfSeat?: number): LobbyParticipant[] {
  if (role === 'guest') return lobbyParticipants

  const taken = new Set<number>(selfSeat ? [selfSeat] : [])
  lobbyParticipants.forEach((participant) => {
    if (participant.seatNumber && participant.seatNumber !== selfSeat) taken.add(participant.seatNumber)
  })

  return lobbyParticipants.map((participant) => {
    const moved = { ...participant, isHost: false }
    if (participant.seatNumber !== undefined && participant.seatNumber === selfSeat) {
      const free = Array.from({ length: MAX_PLAYERS }, (_, index) => index + 1).find((seat) => !taken.has(seat))
      moved.seatNumber = free
      if (free) taken.add(free)
    }
    return moved
  })
}

/** 방장 시점의 좌석 선택 화면에는 아직 아무도 앉아 있지 않다. */
export function seatOccupantFor(role: LobbyRole, seatNumber: number) {
  if (role === 'host') return undefined
  return lobbyParticipants.find((participant) => participant.seatNumber === seatNumber)
}

/** 게임을 시작하면 바로 앉는 인원: 좌석에 앉아 준비를 마치고 연결된 참가자 + 나 */
export function readyHeadcount(role: LobbyRole, selfSeat?: number) {
  const others = participantsFor(role, selfSeat).filter(
    (participant) => participant.seatNumber && participant.ready && participant.connection === 'connected',
  )
  return others.length + 1
}

/** 준비를 마치지 않아 다음 핸드부터 참여할 참가자 */
export function lateJoiners(role: LobbyRole, selfSeat?: number) {
  return participantsFor(role, selfSeat).filter(
    (participant) => !participant.seatNumber || !participant.ready || participant.connection !== 'connected',
  )
}

/** 대기실 인원(나 포함) */
export function headcount(role: LobbyRole) {
  return participantsFor(role).length + 1
}

export const NICKNAME_MAX_LENGTH = 8

export function validateNickname(value: string): string | undefined {
  const nickname = value.trim()
  if (nickname.length === 0) return '닉네임을 입력하세요.'
  if (nickname.length < 2) return '닉네임은 2자 이상이어야 합니다.'
  if (nickname.length > NICKNAME_MAX_LENGTH) return `닉네임은 ${NICKNAME_MAX_LENGTH}자 이하로 입력하세요.`
  if (nickname === '나' || lobbyParticipants.some((participant) => participant.name === nickname)) {
    return '이미 방에 있는 닉네임입니다.'
  }
  return undefined
}
