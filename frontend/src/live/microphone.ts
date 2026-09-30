import type { MicOutcome } from '../app/flow'

/**
 * 실제 마이크 권한을 요청해 쓸 수 있는지만 확인하고 바로 끈다. 소리는 저장하지 않는다.
 * 브라우저는 HTTPS나 localhost에서만 마이크를 허용하므로, 그 밖에서는 `장치 없음`으로 본다.
 */
export async function checkMicrophone(mediaDevices: MediaDevices | undefined = navigator.mediaDevices): Promise<MicOutcome> {
  if (!mediaDevices?.getUserMedia) return 'not-found'
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
    return 'ready'
  } catch (error) {
    const name = error instanceof DOMException || error instanceof Error ? error.name : ''
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'not-found'
    return 'denied'
  }
}
