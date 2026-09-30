import { useId, useState } from 'react'
import { MAX_PLAYERS } from '../room/settings'
import { seatOccupantFor } from './fixtures'
import { PrepLayout } from './PrepLayout'
import type { PrepContext } from './PrepLayout'

interface SeatScreenProps {
  context: PrepContext
  nickname: string
  initialSeat?: number
  onBack: () => void
  onSelect: (seatNumber: number) => void
}

const seatNumbers = Array.from({ length: MAX_PLAYERS }, (_, index) => index + 1)

export function SeatScreen({ context, nickname, initialSeat, onBack, onSelect }: SeatScreenProps) {
  const [selectedSeat, setSelectedSeat] = useState(initialSeat)
  const [showHint, setShowHint] = useState(false)
  const hintId = useId()

  const confirm = () => {
    if (selectedSeat === undefined) {
      setShowHint(true)
      return
    }
    onSelect(selectedSeat)
  }

  return (
    <PrepLayout {...context} nickname={nickname} screen="seat" seatNumber={selectedSeat} title="앉을 좌석을 고르세요">
      <div className="prep-panel">
        <p className="prep-lead">
          빈 좌석 중 하나를 고르세요. 어떤 좌석을 골라도 테이블 화면에서는 내 좌석이 항상 하단 가운데에 표시됩니다.
        </p>

        <div aria-label="좌석 배치" className="seat-map" role="group">
          <div aria-hidden="true" className="seat-map-felt" />
          {seatNumbers.map((seatNumber) => {
            const occupant = seatOccupantFor(context.role, seatNumber)
            const selected = selectedSeat === seatNumber
            const closed = seatNumber > context.room.maxPlayers

            if (closed) {
              return (
                <div
                  aria-label={`${seatNumber}번 좌석, 최대 인원 밖이라 닫힘`}
                  className={`seat-map-seat seat-map-seat--${seatNumber} is-taken is-closed`}
                  key={seatNumber}
                  role="group"
                >
                  <span className="seat-map-number">{seatNumber}</span>
                  <strong>닫힌 좌석</strong>
                  <span>최대 {context.room.maxPlayers}명</span>
                </div>
              )
            }

            if (occupant) {
              return (
                <div
                  aria-label={`${seatNumber}번 좌석, ${occupant.name} 사용 중`}
                  className={`seat-map-seat seat-map-seat--${seatNumber} is-taken`}
                  key={seatNumber}
                  role="group"
                >
                  <span className="seat-map-number">{seatNumber}</span>
                  <strong>{occupant.name}</strong>
                  <span>사용 중</span>
                </div>
              )
            }

            return (
              <button
                aria-label={`${seatNumber}번 좌석, 빈 좌석`}
                aria-pressed={selected}
                className={`seat-map-seat seat-map-seat--${seatNumber} ${selected ? 'is-selected' : ''}`}
                key={seatNumber}
                onClick={() => {
                  setSelectedSeat(seatNumber)
                  setShowHint(false)
                }}
                type="button"
              >
                <span className="seat-map-number">{seatNumber}</span>
                <strong>{selected ? nickname : '빈 좌석'}</strong>
                <span>{selected ? '선택됨' : '선택 가능'}</span>
              </button>
            )
          })}
        </div>

        {showHint ? (
          <p className="field-error" id={hintId} role="alert">
            빈 좌석을 먼저 선택하세요.
          </p>
        ) : null}

        <div className="prep-actions">
          <button className="btn btn--secondary" onClick={onBack} type="button">
            이전
          </button>
          <button
            aria-describedby={showHint ? hintId : undefined}
            className="btn btn--primary"
            onClick={confirm}
            type="button"
          >
            {selectedSeat ? `${selectedSeat}번 좌석에 앉기` : '좌석에 앉기'}
          </button>
        </div>
      </div>
    </PrepLayout>
  )
}
