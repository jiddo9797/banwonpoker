import { CheckmarkCircle20Filled, Video20Regular, Warning20Filled } from '@fluentui/react-icons'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Dialog } from '../../../shared/Dialog'
import type { ExportScope, ExportStatus } from '../model'
import type { ExportFile } from '../ReplayScreen'

function progressStep(progress: number, audioOnly: boolean) {
  if (audioOnly) {
    if (progress < 60) return '차례별 음성을 받는 중'
    if (progress < 90) return '음성을 순서대로 이어 붙이는 중'
    return '파일을 만드는 중'
  }
  if (progress < 35) return '카드와 액션 화면을 합성하는 중'
  if (progress < 70) return '차례별 음성 트랙을 맞추는 중'
  return 'MP4로 인코딩하는 중'
}

function DownloadActions({ primaryRef, onClose }: { primaryRef: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const [noted, setNoted] = useState(false)

  return (
    <>
      {noted ? (
        <p className="export-note" role="status">
          프로토타입에서는 실제 파일이 저장되지 않습니다.
        </p>
      ) : null}
      <div className="dialog-actions">
        <button onClick={onClose} type="button">
          닫기
        </button>
        <button className="primary-button" onClick={() => setNoted(true)} ref={primaryRef} type="button">
          다운로드
        </button>
      </div>
    </>
  )
}

interface ExportModalProps {
  /** 실제 게임: 만든 파일. 없으면 목 데이터 문구를 보여준다. */
  files?: ExportFile[]
  errorMessage?: string
  sessionInfo: { handCount: number; durationMinutes: number }
  /** audio: 실제 게임의 음성·기록 파일 내보내기 */
  variant?: 'video' | 'audio'
  status: ExportStatus
  progress: number
  scope: ExportScope
  handNumber: number
  mutedNames: string[]
  onScopeChange: (scope: ExportScope) => void
  onStart: () => void
  onClose: () => void
}

export function ExportModal({
  files,
  errorMessage,
  sessionInfo,
  variant = 'video',
  status,
  progress,
  scope,
  handNumber,
  mutedNames,
  onScopeChange,
  onStart,
  onClose,
}: ExportModalProps) {
  const primaryRef = useRef<HTMLButtonElement>(null)
  const fileName = scope === 'hand' ? `banwonpoker-hand${handNumber}.mp4` : 'banwonpoker-session.mp4'
  // 실제 게임은 음성(WAV)과 기록(텍스트)을 내보낸다. 목 데이터는 MP4 영상 시안을 보여준다.
  const audioOnly = files !== undefined || errorMessage !== undefined || variant === 'audio'

  // 상태가 바뀌면 이전 버튼이 사라지므로 새 상태의 주요 버튼으로 포커스를 옮긴다.
  useEffect(() => {
    if (status !== 'closed') primaryRef.current?.focus()
  }, [status])

  const title =
    status === 'generating'
      ? '영상을 만드는 중'
      : status === 'done'
        ? '영상이 준비되었습니다'
        : status === 'failed'
          ? '영상을 만들지 못했습니다'
          : audioOnly
            ? '음성과 기록 내보내기'
            : '복기 영상 내보내기'

  return (
    <Dialog
      className="export-dialog"
      initialFocusRef={primaryRef}
      onClose={onClose}
      open={status !== 'closed'}
      title={title}
    >
      <div className="export-body" data-status={status}>
        {status === 'options' ? (
          <>
            <fieldset className="radio-list">
              <legend>내보낼 범위</legend>
              <label>
                <input checked={scope === 'hand'} name="export-scope" onChange={() => onScopeChange('hand')} type="radio" />
                <span>
                  <strong>이 핸드만</strong>
                  <span>핸드 #{handNumber} · 약 4분</span>
                </span>
              </label>
              <label>
                <input
                  checked={scope === 'session'}
                  name="export-scope"
                  onChange={() => onScopeChange('session')}
                  type="radio"
                />
                <span>
                  <strong>세션 전체</strong>
                  <span>
                    핸드 {sessionInfo.handCount}개 · 약 {sessionInfo.durationMinutes}분
                  </span>
                </span>
              </label>
            </fieldset>
            <p className="export-note">
              {audioOnly
                ? '차례별 음성을 순서대로 이어 붙인 오디오(WAV)와 액션 기록(텍스트)을 만듭니다.'
                : 'MP4 · 1080p. 테이블 화면과 차례별 음성을 합칩니다.'}{' '}
              {mutedNames.length > 0
                ? `음소거한 참가자(${mutedNames.join(', ')})의 음성은 영상에서도 빠집니다.`
                : '현재 참가자 음량 설정이 그대로 적용됩니다.'}
            </p>
            <div className="dialog-actions">
              <button onClick={onClose} type="button">
                취소
              </button>
              <button className="primary-button" onClick={onStart} ref={primaryRef} type="button">
                <Video20Regular aria-hidden="true" />
                내보내기 시작
              </button>
            </div>
          </>
        ) : null}

        {status === 'generating' ? (
          <>
            <div
              aria-label={audioOnly ? '파일 생성 진행률' : '영상 생성 진행률'}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progress}
              aria-valuetext={`${progress}%, ${progressStep(progress, audioOnly)}`}
              className="progress"
              role="progressbar"
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className="export-progress-text">
              <strong className="numeric">{progress}%</strong>
              <span>{progressStep(progress, audioOnly)}</span>
            </p>
            <p className="export-note">생성하는 동안 복기는 계속 볼 수 있습니다. 취소하면 처음부터 다시 만들어야 합니다.</p>
            <div className="dialog-actions">
              <button onClick={onClose} ref={primaryRef} type="button">
                생성 취소
              </button>
            </div>
          </>
        ) : null}

        {status === 'done' && files ? (
          <>
            <ul aria-label="만든 파일" className="export-files">
              {files.map((file) => (
                <li key={file.name}>
                  <span>
                    <strong>{file.name}</strong>
                    <span>{file.sizeLabel}</span>
                  </span>
                  <a className="btn btn--secondary btn--sm" download={file.name} href={file.url}>
                    다운로드
                  </a>
                </li>
              ))}
            </ul>
            <div className="dialog-actions">
              <button onClick={onClose} ref={primaryRef} type="button">
                닫기
              </button>
            </div>
          </>
        ) : null}

        {status === 'done' && !files ? (
          <>
            <div className="export-result is-ok" role="status">
              <CheckmarkCircle20Filled aria-hidden="true" />
              <span>
                <strong>{fileName}</strong>
                <span>{scope === 'hand' ? '38.2MB · 4분 12초' : '612MB · 1시간 12분'}</span>
              </span>
            </div>
            <DownloadActions onClose={onClose} primaryRef={primaryRef} />
          </>
        ) : null}

        {status === 'failed' ? (
          <>
            <div className="export-result is-warning" role="alert">
              <Warning20Filled aria-hidden="true" />
              <span>
                <strong>{errorMessage ?? '일부 음성 트랙을 불러오지 못했습니다'}</strong>
                <span>{progress}%에서 중단되었습니다. 게임 기록과 복기 화면은 영향을 받지 않습니다.</span>
              </span>
            </div>
            <div className="dialog-actions">
              <button onClick={onClose} type="button">
                닫기
              </button>
              <button className="primary-button" onClick={onStart} ref={primaryRef} type="button">
                다시 시도
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  )
}
