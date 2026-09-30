import { useRef } from 'react'
import { Dialog } from '../shared/Dialog'

export interface KickTarget {
  id: string
  name: string
}

/** 방장이 참가자를 내보내기 전에 한 번 더 묻는다. */
export function KickDialog({ target, onCancel, onConfirm }: { target: KickTarget | null; onCancel: () => void; onConfirm: (target: KickTarget) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      description={<p>게임 중이면 이번 핸드는 폴드 처리되고, 같은 자리로 다시 들어올 수 없습니다.</p>}
      initialFocusRef={cancelRef}
      onClose={onCancel}
      open={target !== null}
      title={`${target?.name ?? ''}을(를) 내보낼까요?`}
    >
      <div className="dialog-actions">
        <button onClick={onCancel} ref={cancelRef} type="button">
          취소
        </button>
        <button className="danger-button" onClick={() => target && onConfirm(target)} type="button">
          내보내기
        </button>
      </div>
    </Dialog>
  )
}
