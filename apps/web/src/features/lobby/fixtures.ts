export interface RoomInfo {
  name: string
  code: string
  hostName: string
  gameType: string
  smallBlind: number
  bigBlind: number
  startingStack: number
  turnSeconds: number
  maxPlayers: number
}

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

export const roomInfo: RoomInfo = {
  name: '금요일 밤 홀덤',
  code: 'BWP-7K2Q',
  hostName: '민수',
  gameType: '노리밋 홀덤',
  smallBlind: 50,
  bigBlind: 100,
  startingStack: 10_000,
  turnSeconds: 60,
  maxPlayers: 6,
}

export const lobbyParticipants: LobbyParticipant[] = [
  { id: 'eugene', name: '유진', seatNumber: 1, ready: true, connection: 'connected' },
  { id: 'seojun', name: '서준', seatNumber: 2, ready: false, connection: 'connected' },
  { id: 'minsu', name: '민수', seatNumber: 3, ready: true, connection: 'connected', isHost: true },
  { id: 'jihun', name: '지훈', seatNumber: 4, ready: false, connection: 'disconnected' },
  { id: 'subin', name: '수빈', ready: false, connection: 'connected' },
]

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

export function seatOccupant(seatNumber: number) {
  return lobbyParticipants.find((participant) => participant.seatNumber === seatNumber)
}
