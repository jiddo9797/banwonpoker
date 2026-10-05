/* tslint:disable */
/* eslint-disable */

/**
 * 브라우저(Web Worker)에서 쓰는 감싸개
 */
export class WasmSpot {
    free(): void;
    [Symbol.dispose](): void;
    exploitability(): number;
    iterations(): number;
    /**
     * 실제로 잡은 메모리(바이트)
     */
    memory_bytes(compressed: boolean): number;
    constructor(config_json: string);
    report(request_json: string): string;
    run(count: number): void;
    starting_pot(): number;
    step(count: number): number;
}

export function initThreadPool(num_threads: number): Promise<any>;

export class wbg_rayon_PoolBuilder {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    build(): void;
    numThreads(): number;
    receiver(): number;
}

export function wbg_rayon_start_worker(receiver: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly __wbg_wasmspot_free: (a: number, b: number) => void;
    readonly __wbg_wbg_rayon_poolbuilder_free: (a: number, b: number) => void;
    readonly initThreadPool: (a: number) => any;
    readonly wasmspot_exploitability: (a: number) => number;
    readonly wasmspot_iterations: (a: number) => number;
    readonly wasmspot_memory_bytes: (a: number, b: number) => number;
    readonly wasmspot_new: (a: number, b: number) => [number, number, number];
    readonly wasmspot_report: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmspot_run: (a: number, b: number) => void;
    readonly wasmspot_starting_pot: (a: number) => number;
    readonly wasmspot_step: (a: number, b: number) => number;
    readonly wbg_rayon_poolbuilder_build: (a: number) => void;
    readonly wbg_rayon_poolbuilder_numThreads: (a: number) => number;
    readonly wbg_rayon_poolbuilder_receiver: (a: number) => number;
    readonly wbg_rayon_start_worker: (a: number) => void;
    readonly memory: WebAssembly.Memory;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_thread_destroy: (a?: number, b?: number, c?: number) => void;
    readonly __wbindgen_start: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number }} module - Passing `SyncInitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number } | SyncInitInput, memory?: WebAssembly.Memory): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number }} module_or_path - Passing `InitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number } | InitInput | Promise<InitInput>, memory?: WebAssembly.Memory): Promise<InitOutput>;
