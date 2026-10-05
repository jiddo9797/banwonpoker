/**
 * 포스트플랍 솔버를 브라우저용 WASM 두 가지로 빌드해 frontend/src/features/gto 아래에 둔다.
 * - postflop-wasm/     스레드 하나(stable). 교차 출처 격리가 안 된 브라우저용
 * - postflop-wasm-mt/  멀티스레드(nightly + atomics + wasm-bindgen-rayon)
 * 결과물은 커밋하므로 배포·다른 PC에는 Rust가 없어도 된다.
 *
 *   node build-wasm.mjs        (Rust stable·nightly, wasm32-unknown-unknown, rust-src, wasm-bindgen-cli 0.2.129 필요)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const gto = join(here, '..', '..', 'frontend', 'src', 'features', 'gto')
// MinGW 링커가 한글 경로를 다루지 못하므로 빌드 결과는 ASCII 경로에 둔다.
const targetRoot = process.env.CARGO_TARGET_DIR ?? join(homedir(), '.cache', 'banwonpoker-postflop')
const cargo = (args, env = {}) => execFileSync('cargo', args, { cwd: here, stdio: 'inherit', env: { ...process.env, ...env } })
const bindgen = (wasm, out) =>
  execFileSync('wasm-bindgen', ['--target', 'web', '--out-dir', join(gto, out), '--out-name', 'postflop', wasm], { stdio: 'inherit' })

const single = join(targetRoot, 'single')
cargo(['+stable', 'build', '--release', '--lib', '--target', 'wasm32-unknown-unknown'], { CARGO_TARGET_DIR: single })
bindgen(join(single, 'wasm32-unknown-unknown', 'release', 'banwonpoker_postflop.wasm'), 'postflop-wasm')

const threaded = join(targetRoot, 'threads')
const flags = [
  '-C target-feature=+atomics,+bulk-memory',
  '-C link-arg=--shared-memory',
  // 넓은 레인지(림프 팟)는 압축해도 0.7GB쯤 쓴다.
  '-C link-arg=--max-memory=2147483648',
  '-C link-arg=--import-memory',
  '-C link-arg=--export=__wasm_init_tls',
  '-C link-arg=--export=__tls_size',
  '-C link-arg=--export=__tls_align',
  '-C link-arg=--export=__tls_base',
].join(' ')
cargo(
  ['+nightly', 'build', '--release', '--lib', '--target', 'wasm32-unknown-unknown', '--features', 'threads', '-Z', 'build-std=panic_abort,std'],
  { CARGO_TARGET_DIR: threaded, RUSTFLAGS: flags },
)
bindgen(join(threaded, 'wasm32-unknown-unknown', 'release', 'banwonpoker_postflop.wasm'), 'postflop-wasm-mt')
// wasm-bindgen-rayon의 스레드 워커가 import('../../..')로 이 폴더를 불러오므로 진입 파일을 알려준다.
writeFileSync(
  join(gto, 'postflop-wasm-mt', 'package.json'),
  JSON.stringify({ name: 'postflop-wasm-mt', private: true, type: 'module', main: 'postflop.js', module: 'postflop.js', types: 'postflop.d.ts' }, null, 2) + '
',
)
// 스레드 워커가 자기 파일을 다시 띄우는 new Worker(new URL('./workerHelpers.js', import.meta.url))를 Vite가
// 묶으면서 self.location.href(=솔버 워커 파일)로 바꿔 버려 스레드가 뜨지 않는다. 모듈 자신의 주소를 쓰게 고친다.
const snippets = join(gto, 'postflop-wasm-mt', 'snippets')
for (const dir of readdirSync(snippets)) {
  const file = join(snippets, dir, 'src', 'workerHelpers.js')
  const source = readFileSync(file, 'utf8')
  const patched = source.replace("new Worker(new URL('./workerHelpers.js', import.meta.url), {", 'new Worker(import.meta.url, {')
  if (patched === source) throw new Error('workerHelpers.js의 new Worker 위치를 찾지 못했습니다.')
  writeFileSync(file, patched)
}
console.log('WASM 빌드 완료')
