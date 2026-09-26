/**
 * internal-state-carries — 접힌 끝 값이 다음 접기의 출발점으로 건너간다.
 *
 * 장난감 해시 H (상태 16 비트 · IV 6a09 · 덩어리 2 바이트 · 세 라운드 압축)로 M 을 접어
 * 끝 값 D 를 얻고, D 와 M 의 길이만 받은 쪽이 그 D 에서 X 를 이어 접는다. 끝으로
 * M ‖ pad(M) ‖ X 를 처음부터 통째로 다시 접어 두 토막의 상태와 칸마다 견준다.
 *
 * 이벤트 (발신 순서):
 *   init        silent  { holderCells: Cell[], holderChunks: number[], columns: number }
 *                       M ‖ pad(M) 의 바이트 칸과 덩어리 값, 상태 칸 수(통째 접기의 상태 수).
 *                       걸음 0 을 갈아 끼운다
 *   foldHolder          { states: number[] }
 *                       IV 에서 M 의 덩어리를 차례로 접은 상태 넷 (IV 포함). 끝이 D
 *   carry               { d: number, mLen: number, prefixCells: Cell[], cells: Cell[], chunks: number[] }
 *                       건너간 D 와 M 의 길이(바이트). 이어 접는 쪽이 길이에서 셈한
 *                       앞자리 칸(글자는 null) · 제 덩어리 칸 X ‖ pad′ · 그 덩어리 값
 *   extend  ×3          { index: number, from: number, chunk: number, to: number }
 *                       이어 접는 쪽의 접기 하나. to = f(from, chunk)
 *   whole               { msgLen: number, cells: Cell[], chunks: number[], states: number[], match: boolean[], equal: boolean }
 *                       처음부터 다시 셈한 통째 접기 (msgLen 은 M ‖ pad(M) ‖ X 의 바이트 수).
 *                       match[i] 는 칸 i 의 상태가 위 토막의
 *                       같은 칸 상태와 같은가 (칸 0–3 은 holder, 칸 3–6 은 extender).
 *                       equal 은 통째 끝 = 이어 접은 끝 D′ 인가
 *
 * Cell = { v: number | null, kind: 'char' | 'pad' | 'unknown' }
 *   char    메시지 글자 바이트 (ASCII 로 보인다)
 *   pad     패딩 바이트 (16진으로 보인다)
 *   unknown 이어 접는 쪽이 모르는 글자 바이트 (v 는 null)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type InternalStateCarriesFacetData = {
  type: 'internal-state-carries';
  /** 먼저 접는 메시지 M (ASCII, 번역하지 않는 자료) */
  m: string;
  /** 이어 접는 글 X (ASCII, 번역하지 않는 자료) */
  x: string;
  stepMs: number;
};

export type CellKind = 'char' | 'pad' | 'unknown';
export type Cell = { v: number | null; kind: CellKind };

/** 장난감 H 의 IV — SHA-256 의 첫 IV 단어 0x6a09e667 의 앞 16 비트 */
export const IV = 0x6a09;

/** 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 알고리즘과 장면이 함께 부른다. */
export function narrowInternalStateCarriesData(raw: unknown): InternalStateCarriesFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData: 객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'internal-state-carries') throw new Error(`initialData.type: 'internal-state-carries' 가 아니다 (${String(o.type)})`);
  if (typeof o.m !== 'string' || o.m.length === 0) throw new Error('initialData.m: 비어 있지 않은 문자열이어야 한다');
  if (typeof o.x !== 'string' || o.x.length === 0) throw new Error('initialData.x: 비어 있지 않은 문자열이어야 한다');
  if (typeof o.stepMs !== 'number' || !(o.stepMs > 0)) throw new Error('initialData.stepMs: 양수여야 한다');
  asciiBytes(o.m, 'initialData.m');
  asciiBytes(o.x, 'initialData.x');
  return { type: 'internal-state-carries', m: o.m, x: o.x, stepMs: o.stepMs };
}

function asciiBytes(s: string, where: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c > 0x7f) throw new Error(`${where}[${i}]: ASCII 가 아니다`);
    out.push(c);
  }
  return out;
}

/** 길이 len 바이트 뒤에 붙는 패딩 — 0x80 · 0x00 z 개 · 길이(비트) 16 비트 큰 쪽 먼저 */
export function padFor(len: number): number[] {
  const bits = len * 8;
  if (bits > 0xffff) throw new Error(`padFor: 길이 ${len} 바이트는 16 비트 길이 필드에 담기지 않는다`);
  const z = len % 2 === 1 ? 0 : 1;
  const out = [0x80];
  for (let i = 0; i < z; i += 1) out.push(0x00);
  out.push((bits >>> 8) & 0xff, bits & 0xff);
  return out;
}

function chunksOf(bytes: readonly number[]): number[] {
  if (bytes.length % 2 !== 0) throw new Error(`chunksOf: 바이트 수 ${bytes.length} 가 덩어리 폭 2 로 나뉘지 않는다`);
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) out.push(((bytes[i] as number) << 8) | (bytes[i + 1] as number));
  return out;
}

function rotl16(x: number, k: number): number {
  return ((x << k) | (x >>> (16 - k))) & 0xffff;
}

/** 압축 f(h, m) — 세 라운드 (XOR · × 0x9e37 · rotl 5) 뒤 앞 상태를 더해 넘긴다 */
export function compress(h: number, m: number): number {
  let x = h;
  for (let r = 0; r < 3; r += 1) {
    x = (x ^ m) & 0xffff;
    x = Math.imul(x, 0x9e37) & 0xffff;
    x = rotl16(x, 5);
  }
  return (x + h) & 0xffff;
}

/** h0 에서 덩어리를 차례로 접은 상태 줄 (h0 포함) */
function foldFrom(h0: number, chunks: readonly number[]): number[] {
  const states = [h0];
  let h = h0;
  for (const c of chunks) {
    h = compress(h, c);
    states.push(h);
  }
  return states;
}

function charCells(bytes: readonly number[]): Cell[] {
  return bytes.map((v) => ({ v, kind: 'char' as const }));
}
function padCells(bytes: readonly number[]): Cell[] {
  return bytes.map((v) => ({ v, kind: 'pad' as const }));
}

/**
 * 이어 접는 쪽이 할 수 있는 셈 — D 와 M 의 길이만 받는다 (M 의 글자는 넘겨받지 않는다).
 * 길이에서 pad(M) 을 셈해 앞자리 모양을 알고, 이어 붙인 전체 길이로 pad′ 를 만든다.
 */
function extenderLayout(mLen: number, x: readonly number[]) {
  const glue = padFor(mLen);
  const prefixCells: Cell[] = [
    ...Array.from({ length: mLen }, () => ({ v: null, kind: 'unknown' as const })),
    ...padCells(glue),
  ];
  const total = mLen + glue.length + x.length;
  const padPrime = padFor(total);
  const cells = [...charCells(x), ...padCells(padPrime)];
  const bytes = [...x, ...padPrime];
  return { prefixCells, cells, chunks: chunksOf(bytes) };
}

export async function internalStateCarries(rawCtx: FacetContext<InternalStateCarriesFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<InternalStateCarriesFacetData>;
  const data = narrowInternalStateCarriesData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const mBytes = asciiBytes(data.m, 'initialData.m');
  const xBytes = asciiBytes(data.x, 'initialData.x');

  // 바탕 — M ‖ pad(M) 의 칸과 덩어리
  const glueM = padFor(mBytes.length);
  const holderCells = [...charCells(mBytes), ...padCells(glueM)];
  const holderChunks = chunksOf([...mBytes, ...glueM]);
  const columns = holderChunks.length + extenderLayout(mBytes.length, xBytes).chunks.length + 1;
  await ctx.emit({ type: 'init', silent: true, payload: { holderCells, holderChunks, columns } });

  // 걸음 0 은 M 과 IV 가 이미 서 있는 화면이라 읽을 틈을 둔다
  if (!(await pause())) return;

  // 걸음 1 — holder 가 M 을 접는다
  const holderStates = foldFrom(IV, holderChunks);
  await ctx.emit({ type: 'foldHolder', payload: { states: holderStates } });
  if (!(await pause())) return;

  // 걸음 2 — D 와 길이만 건너간다
  const d = holderStates[holderStates.length - 1] as number;
  const mLen = mBytes.length;
  const ext = extenderLayout(mLen, xBytes);
  await ctx.emit({
    type: 'carry',
    payload: { d, mLen, prefixCells: ext.prefixCells, cells: ext.cells, chunks: ext.chunks },
  });

  // 걸음 3–5 — extender 가 D 에서 이어 접는다
  const extStates = [d];
  let h = d;
  for (let index = 0; index < ext.chunks.length; index += 1) {
    if (!(await pause())) return;
    const chunk = ext.chunks[index] as number;
    const to = compress(h, chunk);
    await ctx.emit({ type: 'extend', payload: { index, from: h, chunk, to } });
    extStates.push(to);
    h = to;
  }
  if (!(await pause())) return;

  // 걸음 6 — 처음부터 통째로 다시 셈한다 (앞 걸음의 값을 옮겨 적지 않는다)
  const glueW = padFor(mBytes.length);
  const wholeMsg = [...mBytes, ...glueW, ...xBytes];
  const padW = padFor(wholeMsg.length);
  const cells = [...charCells(mBytes), ...padCells(glueW), ...charCells(xBytes), ...padCells(padW)];
  const chunks = chunksOf([...wholeMsg, ...padW]);
  const states = foldFrom(IV, chunks);
  const split = holderStates.length - 1;
  if (states.length !== split + extStates.length) {
    throw new Error(`whole: 통째 상태 ${states.length} 개가 두 토막(${holderStates.length} + ${extStates.length} − 1)과 칸 수가 다르다`);
  }
  const match = states.map((s, i) => {
    const up = i <= split ? holderStates[i] === s : true;
    const down = i >= split ? extStates[i - split] === s : true;
    return up && down;
  });
  const equal = states[states.length - 1] === h;
  await ctx.emit({ type: 'whole', payload: { msgLen: wholeMsg.length, cells, chunks, states, match, equal } });
}
