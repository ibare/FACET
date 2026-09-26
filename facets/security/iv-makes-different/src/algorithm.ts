/**
 * iv-makes-different — 같은 메시지를 같은 열쇠로 두 번 잠글 때, IV 하나만 다르면
 * 두 암호문이 덩어리마다 얼마나 갈라지는가.
 *
 * 블록 암호 E_K 는 장난감 치환-순열 망(덩어리 16 비트 · 라운드 넷)이다. 두 쪽(a · b)
 * 모두 CBC 로 잠근다: C_0 = IV · C_i = E_K(P_i ⊕ C_{i−1}).
 *
 * 이벤트 (발신 순서):
 *   init   silent: true — 걸음 0 을 세운다. 바탕 전부
 *          payload { key: number (32 비트), blocks: number[] (16 비트 덩어리),
 *                    chars: string[] (덩어리마다 평문 바이트 두 글자),
 *                    ivA: number, ivB: number, ivMask: number (ivA ⊕ ivB),
 *                    ivDiff: number (두 IV 의 다른 비트 수),
 *                    width: number (덩어리 비트 수 16) }
 *   block  덩어리 하나 — 두 쪽이 함께 겹치고 잠근다
 *          payload { index: number (1 부터), a: number, b: number (두 쪽의 암호문),
 *                    mask: number (a ⊕ b), diff: number (popcount(mask)),
 *                    diffBlocks: number (지금까지 다른 덩어리 수),
 *                    sumBits: number (지금까지 다른 비트 합) }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 덩어리 비트 수. */
export const BLOCK_BITS = 16;

export type IvMakesDifferentSide = { id: 'a' | 'b'; iv: string };

export type IvMakesDifferentFacetData = {
  type: 'iv-makes-different';
  stepMs: number;
  /** 메시지 바이트 (ASCII). 번역하지 않는 자료. 길이는 덩어리(2 바이트)의 배수 */
  message: string;
  /** 주 열쇠 32 비트, 16 진 여덟 자리 */
  key: string;
  /** 두 쪽. 차례는 a · b */
  sides: IvMakesDifferentSide[];
};

const HEX4 = /^[0-9A-F]{4}$/;
const HEX8 = /^[0-9A-F]{8}$/;

/** `ctx.data` · 장면의 `initial` 이 함께 쓰는 좁히개. 어긋나면 필드 경로를 담아 던진다. */
export function narrowIvMakesDifferentData(raw: unknown): IvMakesDifferentFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('iv-makes-different: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'iv-makes-different') throw new Error(`iv-makes-different: data.type 이 어긋났다 (${String(d.type)})`);
  // 가장 얇은 걸음이 800ms 아래면 읽을 틈이 없다
  if (typeof d.stepMs !== 'number' || !Number.isFinite(d.stepMs) || d.stepMs < 800) {
    throw new Error('iv-makes-different: data.stepMs 는 800 이상이어야 한다');
  }
  if (typeof d.message !== 'string' || d.message.length === 0 || d.message.length % 2 !== 0) {
    throw new Error('iv-makes-different: data.message 는 길이가 2 의 배수인 문자열이어야 한다');
  }
  for (let i = 0; i < d.message.length; i += 1) {
    const c = d.message.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) throw new Error(`iv-makes-different: data.message[${i}] 가 인쇄 가능한 ASCII 가 아니다`);
  }
  if (typeof d.key !== 'string' || !HEX8.test(d.key)) throw new Error('iv-makes-different: data.key 는 16 진 여덟 자리여야 한다');
  if (!Array.isArray(d.sides) || d.sides.length !== 2) throw new Error('iv-makes-different: data.sides 는 둘이어야 한다');
  const ids = ['a', 'b'] as const;
  const sides: IvMakesDifferentSide[] = [];
  d.sides.forEach((s: unknown, i: number) => {
    if (typeof s !== 'object' || s === null) throw new Error(`iv-makes-different: data.sides[${i}] 가 객체가 아니다`);
    const side = s as Record<string, unknown>;
    if (side.id !== ids[i]) throw new Error(`iv-makes-different: data.sides[${i}].id 는 ${ids[i]} 여야 한다`);
    if (typeof side.iv !== 'string' || !HEX4.test(side.iv)) {
      throw new Error(`iv-makes-different: data.sides[${i}].iv 는 16 진 네 자리여야 한다`);
    }
    sides.push({ id: ids[i]!, iv: side.iv });
  });
  return { type: 'iv-makes-different', stepMs: d.stepMs, message: d.message, key: d.key, sides };
}

// ── 장난감 SPN ──────────────────────────────────────────────

const SBOX = [0xe, 0x4, 0xd, 0x1, 0x2, 0xf, 0xb, 0x8, 0x3, 0xa, 0x6, 0xc, 0x5, 0x9, 0x0, 0x7];

/** 네 칸에 같은 S-상자를 따로 건다. */
function substitute(u: number): number {
  let v = 0;
  for (let j = 0; j < 4; j += 1) {
    const shift = 12 - 4 * j;
    v |= SBOX[(u >>> shift) & 0xf]! << shift;
  }
  return v;
}

/** 4×4 전치 — 칸 j 의 k 번째 비트가 칸 k 의 j 번째 자리로 (자리는 왼쪽부터). */
function permute(v: number): number {
  let w = 0;
  for (let j = 0; j < 4; j += 1) {
    for (let k = 0; k < 4; k += 1) {
      const from = 15 - (4 * j + k);
      const to = 15 - (4 * k + j);
      if ((v >>> from) & 1) w |= 1 << to;
    }
  }
  return w;
}

/** K^r = 주 열쇠의 자리 4r−3 부터 이어진 16 비트 (r = 1..5). */
function roundKey(key: number, r: number): number {
  return (key >>> (20 - 4 * r)) & 0xffff;
}

/** E_K — 라운드 넷. 마지막 라운드는 순열 없이 열쇠가 하나 더 붙는다. */
export function encryptBlock(x: number, key: number): number {
  let w = x;
  for (let r = 1; r <= 3; r += 1) w = permute(substitute(w ^ roundKey(key, r)));
  return substitute(w ^ roundKey(key, 4)) ^ roundKey(key, 5);
}

export function popcount(x: number): number {
  let n = 0;
  let v = x >>> 0;
  while (v !== 0) {
    n += v & 1;
    v >>>= 1;
  }
  return n;
}

/** 메시지 바이트를 2 바이트 덩어리로 (큰 자리가 앞 바이트). */
function toBlocks(message: string): { blocks: number[]; chars: string[] } {
  const blocks: number[] = [];
  const chars: string[] = [];
  for (let i = 0; i < message.length; i += 2) {
    blocks.push((message.charCodeAt(i) << 8) | message.charCodeAt(i + 1));
    chars.push(message.slice(i, i + 2));
  }
  return { blocks, chars };
}

export async function ivMakesDifferent(ctx: FacetContext<IvMakesDifferentFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<IvMakesDifferentFacetData>;
  const data = narrowIvMakesDifferentData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const key = Number.parseInt(data.key, 16) >>> 0;
  const [sideA, sideB] = data.sides;
  if (!sideA || !sideB) throw new Error('iv-makes-different: 쪽이 둘이 아니다');
  const ivA = Number.parseInt(sideA.iv, 16);
  const ivB = Number.parseInt(sideB.iv, 16);
  const { blocks, chars } = toBlocks(data.message);

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { key, blocks, chars, ivA, ivB, ivMask: ivA ^ ivB, ivDiff: popcount(ivA ^ ivB), width: BLOCK_BITS },
  });

  let prevA = ivA;
  let prevB = ivB;
  let diffBlocks = 0;
  let sumBits = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    // 걸음 0 에 평문 · 열쇠 · IV 가 이미 놓여 있다 — 첫 덩어리 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    const p = blocks[i]!;
    const a = encryptBlock(p ^ prevA, key);
    const b = encryptBlock(p ^ prevB, key);
    const mask = a ^ b;
    const diff = popcount(mask);
    if (diff > 0) diffBlocks += 1;
    sumBits += diff;
    await ctx.emit({ type: 'block', payload: { index: i + 1, a, b, mask, diff, diffBlocks, sumBits } });
    prevA = a;
    prevB = b;
  }
}
