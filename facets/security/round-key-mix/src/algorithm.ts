/**
 * roundKeyMix — 주 열쇠에서 라운드 열쇠를 잘라 내 상태에 겹친다.
 *
 * 장난감 치환-순열 망(16 비트 덩어리 · 라운드 넷). 라운드 열쇠 K^r 는 주 열쇠(32 비트)의
 * 자리 4r−3 부터 이어진 16 비트다 — 16 비트 창이 라운드마다 4 비트씩 미끄러진다.
 * 라운드 r(1..4)에서 u = w ⊕ K^r, 다음 w 는 S(u) 를 P 에 건 것(r = 4 에서는 S 만).
 * 마지막 걸음에서 S(u_4) 에 K^5 가 겹쳐 암호문이 된다.
 *
 * 이벤트 (silent 없음 — 걸음 0 은 장면의 initial() 이 initialData 에서 세운다)
 *
 *   mix  한 걸음 = 열쇠 하나가 잘려 나와 상태에 겹치는 일
 *     payload: {
 *       round: number;          // 1..5 (열쇠 번호)
 *       start: number;          // 주 열쇠에서 잘라 낸 첫 자리 (1 기준, 4r−3)
 *       key: string;            // 잘린 라운드 열쇠, 16 진 네 자리
 *       pass: 'none' | 'sp' | 's'; // 이 걸음 첫머리에 상태가 지난 층 (없음 · 바꾸기와 섞기 · 바꾸기)
 *       before: string;         // 층을 지나기 전 상태 (앞 걸음의 결과, 걸음 1 은 평문)
 *       enter: string;          // 층을 지나 들어온 상태 (열쇠가 겹칠 상태)
 *       result: string;         // enter ⊕ key
 *       flipped: number;        // 뒤집힌 비트 수 = key 의 1 인 비트 수
 *       last: boolean;          // 마지막 열쇠인가 (result 가 암호문)
 *       flippedSum: number;     // 지금까지 뒤집힌 비트 합
 *       distinct: number;       // 지금까지 잘린 열쇠 가운데 서로 다른 것의 수
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 라운드 수. 열쇠는 하나 더 많다. */
export const ROUNDS = 4;
/** 덩어리 비트 수. */
export const BLOCK_BITS = 16;
/** 창이 라운드마다 미끄러지는 비트 수. */
export const SLIDE_BITS = 4;
/** 주 열쇠 비트 수 = 덩어리 + 미끄러짐 × 라운드. */
export const MASTER_BITS = BLOCK_BITS + SLIDE_BITS * ROUNDS;

/** 4 비트 S-상자 (입력 0..F → 출력). */
const SBOX: readonly number[] = [0xe, 0x4, 0xd, 0x1, 0x2, 0xf, 0xb, 0x8, 0x3, 0xa, 0x6, 0xc, 0x5, 0x9, 0x0, 0x7];
/** 순열 — 자리 i(1 기준) 의 비트가 자리 PERM[i−1] 로 간다. */
const PERM: readonly number[] = [1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16];

export type RoundKeyMixFacetData = {
  type: 'round-key-mix';
  /** 주 열쇠 — 16 진 여덟 자리 (32 비트) */
  masterKey: string;
  /** 평문 덩어리 — 16 진 네 자리 (16 비트) */
  plaintext: string;
  stepMs: number;
};

export type PassKind = 'none' | 'sp' | 's';

export type MixPayload = {
  round: number;
  start: number;
  key: string;
  pass: PassKind;
  before: string;
  enter: string;
  result: string;
  flipped: number;
  last: boolean;
  flippedSum: number;
  distinct: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkHex(value: unknown, digits: number, path: string): string {
  if (typeof value !== 'string') throw new Error(`round-key-mix: ${path} 는 문자열이어야 한다`);
  if (!new RegExp(`^[0-9A-F]{${digits}}$`).test(value)) {
    throw new Error(`round-key-mix: ${path} 는 대문자 16 진 ${digits} 자리여야 한다 (받은 값 ${value})`);
  }
  return value;
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 던진다. */
export function narrowRoundKeyMixData(raw: unknown): RoundKeyMixFacetData {
  if (!isRecord(raw)) throw new Error('round-key-mix: initialData 가 객체가 아니다');
  if (raw.type !== 'round-key-mix') throw new Error(`round-key-mix: initialData.type 이 어긋났다 (${String(raw.type)})`);
  const masterKey = checkHex(raw.masterKey, MASTER_BITS / 4, 'initialData.masterKey');
  const plaintext = checkHex(raw.plaintext, BLOCK_BITS / 4, 'initialData.plaintext');
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 0) {
    throw new Error('round-key-mix: initialData.stepMs 는 0 이상의 수여야 한다');
  }
  return { type: 'round-key-mix', masterKey, plaintext, stepMs };
}

/** 16 진 문자열 → 비트 배열 (큰 자리부터). 그림이 칸을 세울 때도 부른다. */
export function hexToBits(hex: string): number[] {
  const bits: number[] = [];
  for (const ch of hex) {
    const nibble = parseInt(ch, 16);
    if (Number.isNaN(nibble)) throw new Error(`round-key-mix: 16 진 글자가 아니다 (${ch})`);
    for (let k = 3; k >= 0; k -= 1) bits.push((nibble >> k) & 1);
  }
  return bits;
}

function bitsToHex(bits: readonly number[]): string {
  if (bits.length % 4 !== 0) throw new Error(`round-key-mix: 비트 수가 4 의 배수가 아니다 (${bits.length})`);
  let out = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i]! << 3) | (bits[i + 1]! << 2) | (bits[i + 2]! << 1) | bits[i + 3]!;
    out += nibble.toString(16).toUpperCase();
  }
  return out;
}

/** 라운드 열쇠 K^r 의 첫 자리 (1 기준). */
export function keyStart(round: number): number {
  return SLIDE_BITS * round - (SLIDE_BITS - 1);
}

/** 주 열쇠에서 라운드 열쇠 K^r 를 잘라 낸다. */
function cutRoundKey(masterBits: readonly number[], round: number): number[] {
  const from = keyStart(round) - 1;
  const piece = masterBits.slice(from, from + BLOCK_BITS);
  if (piece.length !== BLOCK_BITS) throw new Error(`round-key-mix: 라운드 ${round} 의 창이 주 열쇠 밖으로 나간다`);
  return piece;
}

function xorBits(a: readonly number[], b: readonly number[]): number[] {
  if (a.length !== b.length) throw new Error('round-key-mix: 겹칠 두 비트 줄의 길이가 다르다');
  return a.map((bit, i) => bit ^ b[i]!);
}

function substitute(bits: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i]! << 3) | (bits[i + 1]! << 2) | (bits[i + 2]! << 1) | bits[i + 3]!;
    const s = SBOX[nibble]!;
    for (let k = 3; k >= 0; k -= 1) out.push((s >> k) & 1);
  }
  return out;
}

function permute(bits: readonly number[]): number[] {
  const out: number[] = new Array<number>(bits.length).fill(0);
  bits.forEach((bit, i) => {
    out[PERM[i]! - 1] = bit;
  });
  return out;
}

function popcount(bits: readonly number[]): number {
  return bits.reduce((n, b) => n + b, 0);
}

export async function roundKeyMix(ctx: FacetContext<unknown>): Promise<void> {
  const rctx = ctx as ReactiveContext<unknown>;
  const data = narrowRoundKeyMixData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const masterBits = hexToBits(data.masterKey);
  const seen = new Set<string>();
  let state = hexToBits(data.plaintext);
  let flippedSum = 0;

  for (let round = 1; round <= ROUNDS + 1; round += 1) {
    // 걸음 0(주 열쇠 · 평문)을 읽을 틈도 이 문이 준다
    if (!(await pause())) return;

    const before = state;
    let pass: PassKind = 'none';
    let enter = before;
    if (round > 1 && round <= ROUNDS) {
      pass = 'sp';
      enter = permute(substitute(before));
    } else if (round === ROUNDS + 1) {
      pass = 's';
      enter = substitute(before);
    }
    const key = cutRoundKey(masterBits, round);
    const result = xorBits(enter, key);
    const keyHex = bitsToHex(key);
    const flipped = popcount(key);
    flippedSum += flipped;
    seen.add(keyHex);
    state = result;

    const payload: MixPayload = {
      round,
      start: keyStart(round),
      key: keyHex,
      pass,
      before: bitsToHex(before),
      enter: bitsToHex(enter),
      result: bitsToHex(result),
      flipped,
      last: round === ROUNDS + 1,
      flippedSum,
      distinct: seen.size,
    };
    await ctx.emit({ type: 'mix', payload });
  }
}
