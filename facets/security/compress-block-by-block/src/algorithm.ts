/**
 * compress-block-by-block — 메시지를 같은 폭의 덩어리로 자르고, 덩어리마다 상태 안으로 접어 넣는다.
 *
 * 장난감 해시 H (상태 16 비트 · IV 6a09 · 덩어리 2 바이트 · 압축 f 세 라운드 + 앞 상태 더하기).
 * 패딩: 메시지 뒤에 0x80 → 0x00 을 z 개(전체가 짝수 바이트가 되는 가장 작은 z) → 길이(비트) 16 비트 큰 쪽 먼저.
 *
 * 이벤트 (발신 순서):
 *   init  (silent) { bytes: number[]; state: number; stateBits: number; blockBytes: number; paddedLength: number }
 *         — 메시지의 ASCII 바이트, 출발 상태(IV), 상태 폭(비트), 덩어리 폭(바이트), 패딩까지 붙인 전체 바이트 수.
 *           걸음 0 을 갈아 끼운다
 *   cut          { padded: number[]; messageLength: number; zeroCount: number; lengthBits: number; blocks: number[] }
 *         — 메시지 + 패딩 전체 바이트, 메시지 바이트 수, 0x00 개수, 길이 필드 값(비트), 덩어리 값(큰 쪽 먼저)
 *   fold         { index: number; block: number; from: number; to: number; remaining: number }
 *         — index 번째 덩어리 block 을 상태 from 에 접어 넣어 to 가 됨. remaining 은 접은 뒤 남은 덩어리 수.
 *           remaining 0 인 fold 가 마지막 걸음이고 to 가 해시값이다
 *
 * ctx.metric 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 상태 폭 (비트) */
export const STATE_BITS = 16;
/** 덩어리 폭 (바이트) */
export const BLOCK_BYTES = 2;
/** 출발 상태 — SHA-256 의 첫 IV 단어 0x6a09e667 의 앞 16 비트 */
export const IV = 0x6a09;

const MASK = 0xffff;
const MULTIPLIER = 0x9e37;
const ROTATE = 5;
const ROUNDS = 3;
const MARKER = 0x80;

export type CompressBlockByBlockFacetData = {
  type: 'compress-block-by-block';
  /** 메시지 (ASCII, 번역하지 않는 자료) */
  message: string;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 던진다. */
export function narrowCompressData(raw: unknown): CompressBlockByBlockFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('compress-block-by-block: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'compress-block-by-block') {
    throw new Error(`compress-block-by-block: initialData.type 이 어긋났다 (${String(r.type)})`);
  }
  if (typeof r.message !== 'string' || r.message.length === 0) {
    throw new Error('compress-block-by-block: initialData.message 가 빈 문자열이거나 문자열이 아니다');
  }
  for (let i = 0; i < r.message.length; i += 1) {
    const code = r.message.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      throw new Error(`compress-block-by-block: initialData.message[${i}] 가 인쇄 가능한 ASCII 가 아니다`);
    }
  }
  if (typeof r.stepMs !== 'number' || !Number.isFinite(r.stepMs) || r.stepMs <= 0) {
    throw new Error('compress-block-by-block: initialData.stepMs 가 양수가 아니다');
  }
  return { type: 'compress-block-by-block', message: r.message, stepMs: r.stepMs };
}

/** 메시지의 ASCII 바이트 */
export function asciiBytes(message: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < message.length; i += 1) out.push(message.charCodeAt(i));
  return out;
}

export type Padding = { padded: number[]; zeroCount: number; lengthBits: number };

/** 패딩 — 0x80 · 0x00 × z · 길이(비트) 16 비트 큰 쪽 먼저 */
export function pad(bytes: readonly number[]): Padding {
  const lengthBits = bytes.length * 8;
  if (lengthBits > MASK) {
    throw new Error(`compress-block-by-block: 메시지 길이 ${lengthBits} 비트가 16 비트 길이 필드를 넘는다`);
  }
  // 0x80 한 바이트 + 길이 두 바이트를 더하고도 짝수가 되는 가장 작은 z
  const zeroCount = (BLOCK_BYTES - ((bytes.length + 3) % BLOCK_BYTES)) % BLOCK_BYTES;
  const padded = [...bytes, MARKER];
  for (let i = 0; i < zeroCount; i += 1) padded.push(0);
  padded.push((lengthBits >>> 8) & 0xff, lengthBits & 0xff);
  return { padded, zeroCount, lengthBits };
}

/** 덩어리 값 — (앞 바이트 << 8) | 뒤 바이트 */
export function toBlocks(padded: readonly number[]): number[] {
  if (padded.length % BLOCK_BYTES !== 0) {
    throw new Error(`compress-block-by-block: 채운 바이트 ${padded.length} 가 덩어리 폭으로 나눠지지 않는다`);
  }
  const blocks: number[] = [];
  for (let i = 0; i < padded.length; i += BLOCK_BYTES) {
    const hi = padded[i];
    const lo = padded[i + 1];
    if (hi === undefined || lo === undefined) {
      throw new Error(`compress-block-by-block: padded[${i}] 가 비었다`);
    }
    blocks.push((hi << 8) | lo);
  }
  return blocks;
}

function rotl16(x: number, n: number): number {
  return ((x << n) | (x >>> (STATE_BITS - n))) & MASK;
}

/** 압축 f(h, m) — 세 라운드 (XOR · 곱 · 돌리기) 뒤 앞 상태를 더해 넘긴다 */
export function compress(h: number, m: number): number {
  let x = h;
  for (let r = 0; r < ROUNDS; r += 1) {
    x = (x ^ m) & MASK;
    x = Math.imul(x, MULTIPLIER) & MASK;
    x = rotl16(x, ROTATE);
  }
  return (x + h) & MASK;
}

/** 16진 4자리 소문자 */
export function hex4(v: number): string {
  return v.toString(16).padStart(4, '0');
}

/** 16진 2자리 소문자 */
export function hex2(v: number): string {
  return v.toString(16).padStart(2, '0');
}

export async function compressBlockByBlock(
  ctx: FacetContext<CompressBlockByBlockFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<CompressBlockByBlockFacetData>;
  const data = narrowCompressData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const bytes = asciiBytes(data.message);
  const padding = pad(bytes);
  const blocks = toBlocks(padding.padded);

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: {
      bytes,
      state: IV,
      stateBits: STATE_BITS,
      blockBytes: BLOCK_BYTES,
      paddedLength: padding.padded.length,
    },
  });

  // 걸음 0 은 메시지 통째와 IV — 읽을 틈을 준다
  if (!(await pause())) return;
  await rctx.emit({
    type: 'cut',
    payload: {
      padded: padding.padded,
      messageLength: bytes.length,
      zeroCount: padding.zeroCount,
      lengthBits: padding.lengthBits,
      blocks,
    },
  });

  let h = IV;
  for (let i = 0; i < blocks.length; i += 1) {
    if (!(await pause())) return;
    const block = blocks[i];
    if (block === undefined) throw new Error(`compress-block-by-block: blocks[${i}] 가 비었다`);
    const to = compress(h, block);
    await rctx.emit({
      type: 'fold',
      payload: { index: i, block, from: h, to, remaining: blocks.length - i - 1 },
    });
    h = to;
  }
}
