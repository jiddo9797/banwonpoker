import type { ReactNode } from 'react'
import { Avatar } from '../../../shared/Avatar'
import { formatChips, formatSignedChips } from '../../../shared/format'

/** 세션 요약 맨 위: `세션 종료` 라벨, 방 이름, 알약, 오른쪽 버튼 */
export function SummaryHeading({ eyebrow, title, pills, actions }: { eyebrow: string; title: string; pills: ReactNode[]; actions: ReactNode }) {
  return (
    <div className="summary-heading">
      <div className="summary-heading-text">
        <p className="micro-label">{eyebrow}</p>
        <h1>{title}</h1>
        <ul aria-label="세션 정보" className="summary-pills">
          {pills.map((pill, index) => (
            <li className="top-bar-pill" key={index}>
              {pill}
            </li>
          ))}
        </ul>
      </div>
      <div className="summary-heading-actions">{actions}</div>
    </div>
  )
}

export interface SummaryRow {
  playerId: string
  place: number
  name: string
  isSelf: boolean
  finalStack: number
  delta: number
  eliminatedAtHand?: number | null
  /** 아바타 색 순서(좌석 순서) */
  avatarIndex: number
}

const PODIUM_ORDER = [2, 1, 3]

function Podium({ rows }: { rows: SummaryRow[] }) {
  const byPlace = new Map(rows.map((row) => [row.place, row]))
  const shown = PODIUM_ORDER.map((place) => byPlace.get(place)).filter((row): row is SummaryRow => row !== undefined)
  if (shown.length === 0) return null

  return (
    <ol aria-label="1~3위" className="summary-podium">
      {shown.map((row) => (
        <li className={`podium-place podium-place--${row.place}`} key={row.playerId}>
          <Avatar
            className="podium-avatar"
            index={row.avatarIndex}
            me={row.isSelf}
            name={row.name}
            size={row.place === 1 ? 64 : 52}
          />
          <span className="podium-name">
            {row.name}
            {row.place === 1 ? <span className="numeric"> · {formatChips(row.finalStack)}</span> : null}
          </span>
          <span className={`podium-delta numeric ${row.delta >= 0 ? 'is-up' : 'is-down'}`}>{formatSignedChips(row.delta)}</span>
          <span className="podium-step">
            <span className="visually-hidden">{row.place}위</span>
            <span aria-hidden="true">{row.place}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** 시상대 + 최종 결과 표 */
export function SummaryResults({ rows, titleId }: { rows: SummaryRow[]; titleId: string }) {
  return (
    <section aria-labelledby={titleId} className="replay-card summary-results">
      <h2 className="visually-hidden" id={titleId}>
        최종 결과 (가상 칩 기준)
      </h2>
      <Podium rows={rows} />
      <table>
        <colgroup>
          <col className="summary-col-rank" />
          <col />
          <col className="summary-col-num" />
          <col className="summary-col-num" />
          <col className="summary-col-status" />
        </colgroup>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">순위</th>
            <th scope="col">참가자</th>
            <th scope="col">최종 칩</th>
            <th scope="col">증감</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className={row.isSelf ? 'is-self' : ''} key={row.playerId}>
              <td className="summary-rank numeric">{row.place}</td>
              <th scope="row">
                <span className="summary-player">
                  <Avatar index={row.avatarIndex} me={row.isSelf} name={row.name} size={28} />
                  {row.name}
                  {row.isSelf && row.name !== '나' ? <span className="summary-self-tag"> (나)</span> : null}
                </span>
              </th>
              <td className="numeric">{formatChips(row.finalStack)}</td>
              <td className={`numeric delta ${row.delta >= 0 ? 'is-up' : 'is-down'}`}>
                {formatSignedChips(row.delta)}
                <span className="visually-hidden">{row.delta >= 0 ? ' 이익' : ' 손실'}</span>
              </td>
              <td className={row.eliminatedAtHand ? 'status-cell is-out' : 'status-cell'}>
                {row.eliminatedAtHand ? `탈락 · 핸드 #${row.eliminatedAtHand}` : '끝까지 참여'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
