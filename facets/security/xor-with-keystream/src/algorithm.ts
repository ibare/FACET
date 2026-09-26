/**
 * xor-with-keystream — 스트림 암호는 왜 잠그는 일과 푸는 일이 같은가.
 *
 * 평문 바이트마다 키스트림 바이트를 겹쳐(XOR) 암호문을 만들고, 같은 키스트림을
 * 처음부터 다시 겹쳐 평문을 되찾는다. 키스트림은 1차 데이터다 (생성기를 두지 않는다).
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (평문 · 키스트림). 첫 발신 앞에
 * stepMs 만큼 머문다 — 걸음 0 이 이미 읽을 것이 있는 화면이라서다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 *   lock    잠금 한 바이트. C_i = P_i ⊕ S_i
 *     payload: {
 *       index: number        바이트 자리 (0 부터)
 *       before: number       겹치기 전 바이트 (평문 P_i)
 *       key: number          키스트림 바이트 S_i
 *       after: number        겹친 뒤 바이트 (암호문 C_i)
 *       flipped: number      뒤집힌 비트 수 = popcount(before ⊕ after)
 *       passFlipped: number  이번 바퀴(잠금)에서 지금까지 뒤집힌 비트 합
 *       bits: number         메시지 전체 비트 수
 *       same: number         이 걸음 뒤 처음 평문과 같은 바이트 수
 *     }
 *
 *   unlock  풀기 한 바이트. P_i = C_i ⊕ S_i — payload 모양은 lock 과 같다
 *     (before 는 암호문 C_i, after 는 되찾은 바이트)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** facet.ts 의 initialData 모양. */
export type XorWithKeystreamFacetData = {
  type: 'xor-with-keystream';
  /** 평문 — ASCII 글자. 글자가 곧 바이트 값이라 번역하지 않는 자료다 */
  plaintext: string;
  /** 키스트림 — 16 진 두 자리 바이트, 평문과 같은 길이 */
  keystream: string[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** 좁힌 자료 — 알고리즘과 장면이 같은 좁히개로 읽는다. */
export type XorStream = {
  plain: number[];
  key: number[];
  stepMs: number;
};

const HEX_BYTE = /^[0-9A-F]{2}$/;

/** initialData 를 좁힌다. 모양이 어긋나면 필드 경로를 담아 던진다. */
export function readXorData(raw: unknown): XorStream {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('xor-with-keystream: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'xor-with-keystream') {
    throw new Error(`xor-with-keystream: initialData.type 이 어긋났다 (${String(r.type)})`);
  }
  const text = r.plaintext;
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('xor-with-keystream: initialData.plaintext 가 빈 글자열이거나 글자열이 아니다');
  }
  const plain: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      throw new Error(`xor-with-keystream: initialData.plaintext[${i}] 가 인쇄 가능한 ASCII 가 아니다`);
    }
    plain.push(code);
  }
  const ks = r.keystream;
  if (!Array.isArray(ks)) {
    throw new Error('xor-with-keystream: initialData.keystream 이 배열이 아니다');
  }
  if (ks.length !== plain.length) {
    throw new Error(
      `xor-with-keystream: initialData.keystream 길이 ${ks.length} 가 평문 길이 ${plain.length} 와 다르다`,
    );
  }
  const key: number[] = [];
  ks.forEach((h: unknown, i: number) => {
    if (typeof h !== 'string' || !HEX_BYTE.test(h)) {
      throw new Error(`xor-with-keystream: initialData.keystream[${i}] 가 16 진 두 자리 대문자가 아니다`);
    }
    key.push(parseInt(h, 16));
  });
  const stepMs = r.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error('xor-with-keystream: initialData.stepMs 가 양수가 아니다');
  }
  return { plain, key, stepMs };
}

/** 1 인 비트의 수. */
export function popcount(byte: number): number {
  let n = 0;
  for (let b = byte; b > 0; b >>= 1) n += b & 1;
  return n;
}

function byteAt(list: readonly number[], i: number, what: string): number {
  const v = list[i];
  if (v === undefined) throw new Error(`xor-with-keystream: ${what}[${i}] 가 없다`);
  return v;
}

function countSame(current: readonly number[], plain: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < plain.length; i += 1) {
    if (byteAt(current, i, 'current') === byteAt(plain, i, 'plain')) n += 1;
  }
  return n;
}

export async function xorWithKeystream(
  context: FacetContext<XorWithKeystreamFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<XorWithKeystreamFacetData>;
  const { plain, key, stepMs } = readXorData(ctx.data);
  const bits = plain.length * 8;
  const current = [...plain];

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 잠금 — 키스트림이 바이트 하나씩 흘러와 평문을 뒤집는다
  let passFlipped = 0;
  for (let i = 0; i < plain.length; i += 1) {
    if (!(await pause())) return;
    const before = byteAt(current, i, 'current');
    const k = byteAt(key, i, 'key');
    const after = before ^ k;
    current[i] = after;
    const flipped = popcount(before ^ after);
    passFlipped += flipped;
    await ctx.emit({
      type: 'lock',
      payload: {
        index: i,
        before,
        key: k,
        after,
        flipped,
        passFlipped,
        bits,
        same: countSame(current, plain),
      },
    });
  }

  // 풀기 — 같은 키스트림이 처음부터 다시 흘러와 같은 자리를 뒤집는다
  passFlipped = 0;
  for (let i = 0; i < plain.length; i += 1) {
    if (!(await pause())) return;
    const before = byteAt(current, i, 'current');
    const k = byteAt(key, i, 'key');
    const after = before ^ k;
    current[i] = after;
    const flipped = popcount(before ^ after);
    passFlipped += flipped;
    await ctx.emit({
      type: 'unlock',
      payload: {
        index: i,
        before,
        key: k,
        after,
        flipped,
        passFlipped,
        bits,
        same: countSame(current, plain),
      },
    });
  }
}
