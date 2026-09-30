import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientState } from '@banwonpoker/server/protocol'
import type { ConsentState, MicCheckStatus } from '../app/flow'
import { ConsentScreen } from '../features/lobby/ConsentScreen'
import { LobbyScreen } from '../features/lobby/LobbyScreen'
import type { LiveLobbyInfo } from '../features/lobby/LobbyScreen'
import { MicCheckScreen, micStatusLabel } from '../features/lobby/MicCheckScreen'
import type { PrepContext } from '../features/lobby/PrepLayout'
import { SeatScreen } from '../features/lobby/SeatScreen'
import { hasErrors, validateRoomSettings } from '../features/room/settings'
import type { RoomSettings } from '../features/room/settings'
import { toLobbyParticipants } from './adapt'
import type { LiveClient, LiveError } from './client'
import { checkMicrophone } from './microphone'

const SETTINGS_DEBOUNCE_MS = 400

export function inviteUrlFor(roomCode: string, location: Pick<Location, 'origin' | 'pathname'> = window.location) {
  return `${location.origin}${location.pathname}?room=${roomCode}`
}

interface LivePrepProps {
  client: LiveClient
  state: ClientState
  lastError: LiveError | null
}

/** 방에 들어온 뒤 좌석 → 동의 → 마이크 점검 → 대기실. 준비를 마치면 대기실을 보여준다. */
export function LivePrep({ client, state, lastError }: LivePrepProps) {
  const { you, room } = state
  const [step, setStep] = useState<'seat' | 'consent' | 'mic'>(you.seat === null ? 'seat' : 'consent')
  const [consent, setConsent] = useState<ConsentState>({ recording: false, reveal: false })
  const [micStatus, setMicStatus] = useState<MicCheckStatus>('idle')
  const [voiceless, setVoiceless] = useState(you.voiceless)
  const [seatError, setSeatError] = useState<string>()
  const [draft, setDraft] = useState<RoomSettings>(room.settings)
  const lastSentSettings = useRef(JSON.stringify(room.settings))

  // 좌석을 거절당하면 좌석 선택으로 돌아가 이유를 보여준다.
  const [seenError, setSeenError] = useState(lastError?.id)
  if (lastError?.id !== seenError) {
    setSeenError(lastError?.id)
    if (lastError?.requestType === 'seat.take') {
      setStep('seat')
      setSeatError(lastError.error.message)
    }
  }

  // 방장이 아닌 사람, 또는 서버에서 설정이 바뀐 뒤에는 서버 값을 따른다.
  const serverSettings = JSON.stringify(room.settings)
  const [seenSettings, setSeenSettings] = useState(serverSettings)
  if (serverSettings !== seenSettings) {
    setSeenSettings(serverSettings)
    if (!you.isHost || serverSettings === JSON.stringify(draft)) setDraft(room.settings)
  }

  // 방장이 설정을 고치면 잠깐 기다렸다가 올바른 값만 서버에 보낸다.
  useEffect(() => {
    if (!you.isHost) return
    const serialized = JSON.stringify(draft)
    if (serialized === lastSentSettings.current || hasErrors(validateRoomSettings(draft))) return
    const timer = window.setTimeout(() => {
      lastSentSettings.current = serialized
      client.send({ type: 'settings.update', settings: draft })
    }, SETTINGS_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [client, draft, you.isHost])

  const startCheck = useCallback(() => {
    setMicStatus('checking')
    void checkMicrophone().then((outcome) => {
      setMicStatus(outcome)
      if (outcome === 'ready') setVoiceless(false)
    })
  }, [])
  // 목 화면은 정해진 시간 뒤 결과를 알려 주지만, 실제 점검은 권한 요청이 끝날 때 결과가 정해진다.
  const noop = useCallback(() => undefined, [])

  const host = room.participants.find((participant) => participant.isHost)
  const others = toLobbyParticipants(room.participants, you.playerId)
  const context: PrepContext = {
    role: you.isHost ? 'host' : 'guest',
    room: you.isHost ? draft : room.settings,
    hostName: host?.nickname ?? '',
    participants: others,
    roomCode: room.code,
  }
  const nickname = room.participants.find((participant) => participant.id === you.playerId)?.nickname ?? ''
  const seatNumber = you.seat === null ? undefined : you.seat + 1

  if (you.ready) {
    const active = room.participants.filter((participant) => participant.status !== 'left')
    const isReady = (participant: (typeof active)[number]) => participant.ready && participant.seat !== null && participant.connected
    const lobbyError =
      lastError && (lastError.requestType === 'game.start' || lastError.requestType === 'settings.update')
        ? lastError.error.message
        : undefined
    const live: LiveLobbyInfo = {
      inviteUrl: inviteUrlFor(room.code),
      headcount: active.length,
      readyCount: active.filter(isReady).length,
      lateNames: active.filter((participant) => participant.id !== you.playerId && !isReady(participant)).map((participant) => participant.nickname),
      errorMessage: lobbyError,
    }
    return (
      <LobbyScreen
        context={context}
        live={live}
        nickname={nickname}
        onBack={() => {
          client.send({ type: 'ready.set', ready: false, consent, voiceless })
          setStep('mic')
        }}
        onSettingsChange={setDraft}
        onStart={() => {
          client.dismissError()
          client.send({ type: 'game.start' })
        }}
        seatNumber={seatNumber}
        selfMicLabel={you.voiceless ? '음성 없이 참여' : micStatus === 'idle' ? '확인됨' : micStatusLabel(micStatus, you.voiceless)}
      />
    )
  }

  if (step === 'seat') {
    return (
      <SeatScreen
        context={context}
        errorMessage={seatError}
        initialSeat={seatNumber}
        nickname={nickname}
        occupantOf={(number) => others.find((participant) => participant.seatNumber === number)}
        onBack={() => client.leave()}
        onSelect={(number) => {
          setSeatError(undefined)
          if (number - 1 !== you.seat) client.send({ type: 'seat.take', seat: number - 1 })
          setStep('consent')
        }}
      />
    )
  }

  if (step === 'consent') {
    return (
      <ConsentScreen
        consent={consent}
        context={context}
        nickname={nickname}
        onBack={() => setStep('seat')}
        onChange={(key, value) => setConsent((current) => ({ ...current, [key]: value }))}
        onNext={() => setStep('mic')}
        seatNumber={seatNumber}
      />
    )
  }

  return (
    <MicCheckScreen
      consent={consent}
      context={context}
      micStatus={micStatus}
      nickname={nickname}
      onBack={() => setStep('consent')}
      onCheckFinished={noop}
      onReady={() => client.send({ type: 'ready.set', ready: true, consent, voiceless: micStatus === 'ready' ? false : voiceless })}
      onStartCheck={startCheck}
      onVoicelessChange={setVoiceless}
      seatNumber={seatNumber}
      voiceless={voiceless}
    />
  )
}
