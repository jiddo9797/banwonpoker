import { Speaker220Regular, SpeakerMute20Regular } from '@fluentui/react-icons'
import type { AudioStatus, MixerChannel, ReplayHand } from '../model'
import { audioStatusOrder, audioStatusLabel } from './AudioTrackStatus'

function trackSummary(hand: ReplayHand, playerId: string) {
  const counts = new Map<AudioStatus, number>()
  hand.actions
    .filter((action) => action.playerId === playerId && action.audio.status !== 'none')
    .forEach((action) => counts.set(action.audio.status, (counts.get(action.audio.status) ?? 0) + 1))

  return audioStatusOrder
    .filter((status) => counts.has(status))
    .map((status) => ({ status, count: counts.get(status) ?? 0 }))
}

interface ParticipantMixerProps {
  hand: ReplayHand
  mixer: Record<string, MixerChannel>
  onVolumeChange: (playerId: string, volume: number) => void
  onToggleMute: (playerId: string) => void
}

export function ParticipantMixer({ hand, mixer, onVolumeChange, onToggleMute }: ParticipantMixerProps) {
  return (
    <section aria-labelledby="mixer-title" className="replay-card mixer">
      <div className="replay-card-header">
        <h2 id="mixer-title">참가자 음량</h2>
        <span className="prep-caption">이 핸드 기준</span>
      </div>
      <ul className="mixer-list">
        {hand.players.map((player) => {
          const channel = mixer[player.id]
          const summary = trackSummary(hand, player.id)
          const voiceless = summary.length > 0 && summary.every((item) => item.status === 'voiceless')

          return (
            <li className={channel.muted ? 'is-muted' : ''} key={player.id}>
              <div className="mixer-name">
                <strong>{player.name}</strong>
                <span>
                  {summary.length === 0
                    ? '차례 없음'
                    : summary.map((item) => `${audioStatusLabel(item.status)} ${item.count}`).join(' · ')}
                </span>
              </div>
              {voiceless ? (
                <span className="mixer-note">음성 트랙 없음</span>
              ) : (
                <>
                  <button
                    aria-label={`${player.name} 음소거`}
                    aria-pressed={channel.muted}
                    className="icon-button"
                    onClick={() => onToggleMute(player.id)}
                    type="button"
                  >
                    {channel.muted ? <SpeakerMute20Regular aria-hidden="true" /> : <Speaker220Regular aria-hidden="true" />}
                  </button>
                  <input
                    aria-label={`${player.name} 음량`}
                    aria-valuetext={channel.muted ? `음소거, ${channel.volume}` : `${channel.volume}`}
                    max={100}
                    min={0}
                    onChange={(event) => onVolumeChange(player.id, Number(event.target.value))}
                    step={5}
                    type="range"
                    value={channel.volume}
                  />
                  <span className="mixer-value numeric">{channel.muted ? '음소거' : channel.volume}</span>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
