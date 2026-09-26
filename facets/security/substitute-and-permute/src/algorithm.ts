/**
 * 바꾸기와 섞기 — 한 비트만 다른 두 평문이 장난감 치환-순열 망(SPN)을 나란히 지난다.
 *
 * 모형은 Stinson 예제 3.1 의 장난감 SPN 이다. 덩어리 16 비트(니블 넷), 4 비트 S-상자 하나를
 * 네 칸에 따로 걸고, 순열 π 는 4×4 전치다. 라운드 넷: r = 1..3 은 열쇠 섞기 → 바꾸기 → 섞기,
 * r = 4 는 열쇠 섞기 → 바꾸기 → 마지막 열쇠 섞기. 이 조각의 주 열쇠는 0 이라 열쇠 섞기가
 * 아무것도 바꾸지 않는다 — 셈은 그대로 하되 걸음에 두지 않는다 (열쇠 섞기는 이웃 조각의 말이다).
 *
 * 이벤트 (모두 target 없음):
 *   init        silent. 바탕과 걸음 0 의 두 평문.
 *               payload { a: number[16], b: number[16], perm: number[16], movedBits: number, flipPos: number,
 *                         diffBits: number[], diffCells: number[] }
 *                 a · b     평문 A · B 의 비트 (왼쪽 = 자리 1, 값 0 / 1)
 *                 perm      π — perm[i − 1] = 자리 i 의 비트가 가는 자리 (1..16)
 *                 movedBits 섞기에서 자리를 옮기는 비트 수 (π(i) ≠ i 인 i 의 수)
 *                 flipPos   B 가 A 에서 뒤집은 자리 (1..16)
 *                 diffBits  A ⊕ B 가 1 인 자리 (1..16, 오름차순)
 *                 diffCells A ⊕ B 의 니블 가운데 0 이 아닌 칸 (1..4, 오름차순)
 *   substitute  걸음. 라운드 r 의 바꾸기(S) 층을 지난 뒤의 두 상태.
 *               payload { round: number, a: number[16], b: number[16], diffBits: number[], diffCells: number[] }
 *   permute     걸음. 라운드 r 의 섞기(P) 층을 지난 뒤의 두 상태 (r = 1..3 — 마지막 라운드에는 없다).
 *               payload { round: number, a: number[16], b: number[16], diffBits: number[], diffCells: number[] }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Bits = number[];

export type SubstituteAndPermuteFacetData = {
  type: 'substitute-and-permute';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 평문 A — 16 진 네 자리 (대문자) */
  a: string;
  /** B 는 A 에서 이 자리(1..16, 왼쪽부터) 한 비트만 뒤집은 것 */
  flipPos: number;
  /** 주 열쇠 32 비트 — 16 진 여덟 자리. 이 조각은 0 만 받는다 */
  key: string;
};

/** 덩어리 비트 수 */
export const BLOCK_BITS = 16;
/** 칸(니블) 하나의 비트 수 */
export const CELL_BITS = 4;
/** 라운드 수 */
export const ROUNDS = 4;

/** S-상자 — 입력 0..F 의 출력 (Stinson 예제 3.1) */
const SBOX = [0xe, 0x4, 0xd, 0x1, 0x2, 0xf, 0xb, 0x8, 0x3, 0xa, 0x6, 0xc, 0x5, 0x9, 0x0, 0x7];

/** π(i) — 칸 j 의 k 번째 비트가 칸 k 의 j 번째 자리로 (1 부터 센 자리) */
export function permDest(pos: number): number {
  const j = Math.floor((pos - 1) / CELL_BITS);
  const k = (pos - 1) % CELL_BITS;
  return k * CELL_BITS + j + 1;
}

/** 16 진 문자열을 비트 배열로. 폭이 어긋나거나 16 진이 아니면 던진다. */
export function hexToBits(hex: string, width: number, field: string): Bits {
  if (!/^[0-9A-F]+$/.test(hex) || hex.length * 4 !== width) {
    throw new Error(`substitute-and-permute: ${field} 는 대문자 16 진 ${width / 4} 자리여야 한다 — '${hex}'`);
  }
  const bits: Bits = [];
  for (const ch of hex) {
    const v = parseInt(ch, 16);
    for (let k = 3; k >= 0; k--) bits.push((v >> k) & 1);
  }
  return bits;
}

/** 비트 배열을 16 진 대문자로 (네 비트씩). */
export function bitsToHex(bits: readonly number[]): string {
  if (bits.length % 4 !== 0) throw new Error(`substitute-and-permute: 비트 수 ${bits.length} 가 4 의 배수가 아니다`);
  let out = '';
  for (let i = 0; i < bits.length; i += 4) {
    const v = bits[i]! * 8 + bits[i + 1]! * 4 + bits[i + 2]! * 2 + bits[i + 3]!;
    out += v.toString(16).toUpperCase();
  }
  return out;
}

/** 자료 좁히개 — 알고리즘과 장면이 같이 부른다. */
export function narrowSubstituteAndPermuteData(raw: unknown): SubstituteAndPermuteFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('substitute-and-permute: initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'substitute-and-permute') throw new Error(`substitute-and-permute: type 이 어긋났다 — ${String(r.type)}`);
  if (typeof r.stepMs !== 'number' || !Number.isFinite(r.stepMs) || r.stepMs < 800) {
    throw new Error('substitute-and-permute: stepMs 는 800 이상의 수여야 한다');
  }
  if (typeof r.a !== 'string') throw new Error('substitute-and-permute: a 가 문자열이 아니다');
  hexToBits(r.a, BLOCK_BITS, 'a');
  if (typeof r.flipPos !== 'number' || !Number.isInteger(r.flipPos) || r.flipPos < 1 || r.flipPos > BLOCK_BITS) {
    throw new Error(`substitute-and-permute: flipPos 는 1..${BLOCK_BITS} 의 정수여야 한다`);
  }
  if (typeof r.key !== 'string') throw new Error('substitute-and-permute: key 가 문자열이 아니다');
  const keyBits = hexToBits(r.key, 32, 'key');
  if (keyBits.some((b) => b !== 0)) {
    // 열쇠 섞기를 걸음에 두지 않으므로 0 이 아닌 열쇠는 화면과 셈을 가른다
    throw new Error('substitute-and-permute: 이 조각은 주 열쇠 0 만 받는다 — 열쇠 섞기를 걸음에 두지 않는다');
  }
  return { type: r.type, stepMs: r.stepMs, a: r.a, flipPos: r.flipPos, key: r.key };
}

function substitute(bits: Bits): Bits {
  const out: Bits = [];
  for (let j = 0; j < BLOCK_BITS / CELL_BITS; j++) {
    const v = bits[4 * j]! * 8 + bits[4 * j + 1]! * 4 + bits[4 * j + 2]! * 2 + bits[4 * j + 3]!;
    const s = SBOX[v]!;
    for (let k = 3; k >= 0; k--) out.push((s >> k) & 1);
  }
  return out;
}

function permute(bits: Bits): Bits {
  const out: Bits = new Array<number>(BLOCK_BITS).fill(0);
  for (let pos = 1; pos <= BLOCK_BITS; pos++) out[permDest(pos) - 1] = bits[pos - 1]!;
  return out;
}

function xorBits(x: Bits, y: Bits): Bits {
  return x.map((v, i) => v ^ y[i]!);
}

/** K^r = K 의 자리 4r−3 부터 이어진 16 비트 */
function roundKey(key: Bits, r: number): Bits {
  return key.slice(4 * r - 4, 4 * r - 4 + BLOCK_BITS);
}

function diffOf(a: Bits, b: Bits): { diffBits: number[]; diffCells: number[] } {
  const diffBits: number[] = [];
  const cells = new Set<number>();
  for (let i = 0; i < BLOCK_BITS; i++) {
    if (a[i] !== b[i]) {
      diffBits.push(i + 1);
      cells.add(Math.floor(i / CELL_BITS) + 1);
    }
  }
  return { diffBits, diffCells: [...cells].sort((x, y) => x - y) };
}

export async function substituteAndPermute(
  ctxIn: FacetContext<SubstituteAndPermuteFacetData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<SubstituteAndPermuteFacetData>;
  const data = narrowSubstituteAndPermuteData(ctx.data);
  const stepMs = data.stepMs;
  const key = hexToBits(data.key, 32, 'key');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let a = hexToBits(data.a, BLOCK_BITS, 'a');
  let b = a.slice();
  b[data.flipPos - 1] = 1 - b[data.flipPos - 1]!;

  const perm: number[] = [];
  for (let pos = 1; pos <= BLOCK_BITS; pos++) perm.push(permDest(pos));
  // 섞기에서 자리를 옮기는 비트 수 (π(i) ≠ i)
  const movedBits = perm.filter((dest, i) => dest !== i + 1).length;

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { a: a.slice(), b: b.slice(), perm, movedBits, flipPos: data.flipPos, ...diffOf(a, b) },
  });

  for (let r = 1; r <= ROUNDS; r++) {
    // 걸음 0 이 이미 읽을 화면이라 첫 바꾸기 앞에도 머문다
    if (!(await pause())) return;
    const k = roundKey(key, r);
    a = substitute(xorBits(a, k));
    b = substitute(xorBits(b, k));
    await ctx.emit({ type: 'substitute', payload: { round: r, a: a.slice(), b: b.slice(), ...diffOf(a, b) } });

    if (r === ROUNDS) break;
    if (!(await pause())) return;
    a = permute(a);
    b = permute(b);
    await ctx.emit({ type: 'permute', payload: { round: r, a: a.slice(), b: b.slice(), ...diffOf(a, b) } });
  }
  // 마지막 열쇠 K^5 를 섞으면 암호문이다 — 주 열쇠 0 이라 마지막 상태와 같다
  const k5 = roundKey(key, ROUNDS + 1);
  if (bitsToHex(xorBits(a, k5)) !== bitsToHex(a) || bitsToHex(xorBits(b, k5)) !== bitsToHex(b)) {
    throw new Error('substitute-and-permute: 마지막 열쇠 섞기가 상태를 바꿨다 — 주 열쇠 0 전제가 깨졌다');
  }
}
