/**
 * facet:hyperloglog — 전부 기억하지 않고 "서로 다른 것이 몇 개였나" 를 센다.
 *
 * 열쇠를 murmur3 32bit (seed 0) 로 해시한다. 통이 m 개면 앞 log2(m) 비트가 통
 * 번호이고, 나머지 비트의 앞자리 0 개수 + 1 이 ρ 다. 통마다 들어온 ρ 중 가장 큰
 * 것만 남기고, 마지막에 조화평균으로 모은다 — `α·m² / Σ 2^(−ρ_i)`.
 *
 * **손잡이가 있는 완제품이다.** 독자가 통 수를 1 · 2 · 4 · 8 · 16 으로 밀면
 * 알고리즘이 그 통 수로 96 개를 처음부터 다시 흘려 보내고, 오차가 줄어드는 것을
 * 화면의 축에 한 점씩 쌓는다.
 *
 * ── 1차 데이터 (facet.ts 의 initialData)
 *   keys        host-0001 … host-0096 (서로 다른 96 개)
 *   bucketCount 통 수의 시작값 (4)
 *   stepMs      한 열쇠가 흐르는 간격
 * 통 번호 · ρ · 통별 최댓값 · 추정값은 여기서 셈한다. 선언에 적지 않는다.
 *
 * ── 이벤트 어휘 (C2) — 전부 이 facet 고유 확장이다.
 *   'hll-config'
 *     { m: number; p: number; keyCount: number }
 *     통 수가 정해졌다. 통이 다시 세워지는 시각 변화가 있으므로 silent 가 아니다.
 *   'key-hashed'
 *     { index: number; key: string; bits: string; p: number; bucket: number;
 *       rho: number; raised: boolean; kept: number; registers: number[] }
 *     열쇠 하나가 제 통에 닿았다. silent 아님.
 *   'estimate-ready'
 *     { m: number; estimate: number; truth: number; errPct: number;
 *       registers: number[]; smallRange: boolean }
 *     이번 통 수의 답이 나왔다. silent 아님.
 *   'done'
 *     { m: number; errPct: number }
 *     한 바퀴가 끝나고 손잡이를 기다린다. silent 아님.
 *
 * ── 메트릭 (C5) — facet.ts 의 metrics[] 에 같은 이름으로 선언되어 있다.
 *   'key-count'    이번 바퀴에서 해시한 열쇠의 수
 *   'raise-count'  통의 최댓값이 실제로 올라선 횟수
 *   두 값은 바퀴마다 0 에서 다시 센다 — 통 수를 바꾼 것은 같은 물음을 다시 묻는
 *   일이지 이어 세는 일이 아니다. 메커니즘의 metric 은 누적이므로 새 바퀴를 돌기
 *   전에 지금까지의 값을 음수 delta 로 상쇄한다.
 *
 * ── 사용자 입력 (reactive)
 *   { type: 'buckets', payload: { value: 1|2|4|8|16, … } }
 *   control-bar 의 segmented-slider 가 onAction 으로 내고 러너가 dispatch 로 넘긴다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HyperLogLogData = {
  type: 'hyperloglog';
  /** 한 열쇠가 흐르는 간격 (ms). speed 슬라이더가 여기에 곱해진다. */
  stepMs: number;
  /** 지금 몇 통으로 재고 있는가. 손잡이가 이 값을 바꾼다. */
  bucketCount: number;
  /** 서로 다른 열쇠들. 이것의 길이가 곧 참값이다. */
  keys: string[];
};

/** 손잡이가 낼 수 있는 통 수. facet.ts 의 segments 와 같은 다섯이다. */
const BUCKET_CHOICES: readonly number[] = [1, 2, 4, 8, 16];

const HASH_BITS = 32;

// ── murmur3 32bit (seed 0) ─────────────────────────────────────────────────
//
// HyperLogLog 는 비트가 고르게 퍼지는 해시를 전제한다. 이 전제가 깨지면 셈법이
// 아니라 해시가 결과를 무너뜨린다 — 같은 열쇠 96 개로 실측하면 추정 오차가
// Java `String.hashCode` 는 −97%, FNV-1a 는 −91%, murmur3 는 −8% 다.

/** 문자열의 UTF-8 바이트. 알고리즘은 환경 전역(TextEncoder 등)에 기대지 않는다. */
function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    let code = s.charCodeAt(i);
    // 서로게이트 쌍은 한 부호점으로 합친다.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

function rotl32(x: number, r: number): number {
  return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function murmur3x86_32(key: string): number {
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const bytes = utf8Bytes(key);
  let h1 = 0;

  const blocks = bytes.length >> 2;
  for (let i = 0; i < blocks; i += 1) {
    const o = i * 4;
    let k = (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
    k = Math.imul(k, c1) >>> 0;
    k = rotl32(k, 15);
    k = Math.imul(k, c2) >>> 0;
    h1 = (h1 ^ k) >>> 0;
    h1 = rotl32(h1, 13);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;
  }

  // 꼬리. `noFallthroughCasesInSwitch` 가 켜져 있어 고전적인 switch fallthrough 를
  // 쓸 수 없으므로 같은 뜻을 if 로 편다.
  const tail = blocks * 4;
  const rest = bytes.length & 3;
  if (rest > 0) {
    let k = 0;
    if (rest === 3) k ^= bytes[tail + 2] << 16;
    if (rest >= 2) k ^= bytes[tail + 1] << 8;
    k ^= bytes[tail];
    k = Math.imul(k >>> 0, c1) >>> 0;
    k = rotl32(k, 15);
    k = Math.imul(k, c2) >>> 0;
    h1 = (h1 ^ k) >>> 0;
  }

  h1 = (h1 ^ bytes.length) >>> 0;
  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  h1 = Math.imul(h1, 0x85ebca6b) >>> 0;
  h1 = (h1 ^ (h1 >>> 13)) >>> 0;
  h1 = Math.imul(h1, 0xc2b2ae35) >>> 0;
  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  return h1 >>> 0;
}

// ── HyperLogLog 의 셈 ──────────────────────────────────────────────────────

/** 32비트를 앞자리 0 을 채운 이진 문자열로. 화면이 이것을 그대로 보인다. */
function toBitString(h: number): string {
  let s = '';
  for (let i = HASH_BITS - 1; i >= 0; i -= 1) s += (h >>> i) & 1 ? '1' : '0';
  return s;
}

/** 통 수 m 에서 통 번호가 차지하는 비트 수. m 은 2 의 거듭제곱이다. */
function prefixBitsFor(m: number): number {
  let p = 0;
  let n = m;
  while (n > 1) {
    n >>= 1;
    p += 1;
  }
  return p;
}

/** 나머지 비트의 앞자리 0 개수 + 1. 통이 하나면 32비트 전체를 센다. */
function rhoOf(bits: string, p: number): number {
  let zeros = 0;
  while (p + zeros < bits.length && bits.charAt(p + zeros) === '0') zeros += 1;
  return zeros + 1;
}

/**
 * 치우침 보정 상수.
 *
 * 표준이 통 16 이하에 0.673, 32 에 0.697, 그보다 크면 0.709 를 둔다. 이 화면은
 * 16 까지만 가므로 실제로는 늘 0.673 이지만, 식을 반쪽만 적으면 다음 사람이
 * 그것이 전부인 줄 안다.
 */
function alphaFor(m: number): number {
  if (m <= 16) return 0.673;
  if (m === 32) return 0.697;
  return 0.709;
}

/**
 * 통별 최댓값에서 추정값을 낸다.
 *
 * 조화평균 기반이다 — 역수의 합으로 나누므로 큰 ρ 의 몫이 작아지고, 그래서
 * 튄 통 하나가 전체를 끌고 가지 못한다. 추정이 2.5·m 이하이고 빈 통이 있으면
 * 작은 범위 보정으로 갈아탄다.
 */
function estimateFrom(registers: readonly number[]): { estimate: number; smallRange: boolean } {
  const m = registers.length;
  let inverseSum = 0;
  let empty = 0;
  for (const r of registers) {
    inverseSum += Math.pow(2, -r);
    if (r === 0) empty += 1;
  }
  const raw = (alphaFor(m) * m * m) / inverseSum;
  if (raw <= 2.5 * m && empty > 0) {
    return { estimate: m * Math.log(m / empty), smallRange: true };
  }
  return { estimate: raw, smallRange: false };
}

/** 참값에서 얼마나 빗나갔는가. 대조표와 같은 부호 없는 백분율. */
function relativeErrorPct(estimate: number, truth: number): number {
  if (truth === 0) return 0;
  return Math.round((Math.abs(estimate - truth) / truth) * 100);
}

/** 손잡이가 보낸 입력에서 통 수를 읽는다. 아니면 null. */
function readBucketCount(input: { type: string; payload?: unknown }): number | null {
  if (input.type !== 'buckets') return null;
  const p = input.payload;
  if (typeof p !== 'object' || p === null) return null;
  // 가드가 뒤따르는 좁히개다 — 꺼낸 값을 아래에서 하나씩 거른다 (C9).
  const raw = (p as Record<string, unknown>)['value'];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return BUCKET_CHOICES.includes(n) ? n : null;
}

// ── 알고리즘 ───────────────────────────────────────────────────────────────

/** 이번 바퀴에서 메트릭에 얼마를 실었는지. 다음 바퀴 전에 그만큼 되돌린다. */
type Tally = { keys: number; raises: number };

/**
 * 지금 통 수로 96 개를 흘려 보내고 답을 낸다.
 *
 * @returns 끝까지 갔으면 true, 도중에 취소됐으면 false.
 */
async function runPass(ctx: ReactiveContext<HyperLogLogData>, tally: Tally): Promise<boolean> {
  const data = ctx.data;
  const m = data.bucketCount;
  const p = prefixBitsFor(m);
  const truth = data.keys.length;

  const registers: number[] = new Array<number>(m).fill(0);
  await ctx.emit({ type: 'hll-config', payload: { m, p, keyCount: truth } });
  if (!(await ctx.sleep(data.stepMs))) return false;

  for (let i = 0; i < data.keys.length; i += 1) {
    if (ctx.cancelled) return false;
    const key = data.keys[i];
    const bits = toBitString(murmur3x86_32(key));
    // 통 번호는 앞 p 비트. 통이 하나면 p = 0 이라 번호 비트가 없다.
    const bucket = p === 0 ? 0 : parseInt(bits.slice(0, p), 2);
    const rho = rhoOf(bits, p);
    const raised = rho > registers[bucket];
    if (raised) registers[bucket] = rho;

    tally.keys += 1;
    ctx.metric('key-count', 'inc');
    if (raised) {
      tally.raises += 1;
      ctx.metric('raise-count', 'inc');
    }

    await ctx.emit({
      type: 'key-hashed',
      target: `index:${i}`,
      payload: {
        index: i,
        key,
        bits,
        p,
        bucket,
        rho,
        raised,
        kept: registers[bucket],
        registers: [...registers],
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;
  }

  const { estimate, smallRange } = estimateFrom(registers);
  const errPct = relativeErrorPct(estimate, truth);
  await ctx.emit({
    type: 'estimate-ready',
    payload: { m, estimate, truth, errPct, registers: [...registers], smallRange },
  });
  if (!(await ctx.sleep(data.stepMs * 2))) return false;

  await ctx.emit({ type: 'done', payload: { m, errPct } });
  return true;
}

export const hyperloglogAlgorithm = async (ctx: FacetContext<HyperLogLogData>): Promise<void> => {
  // reactive 메커니즘이 주입하는 확장 컨텍스트. registerAlgorithm 의 시그니처는
  // FacetContext 그대로라 여기서 단언한다 (context.ts 의 규약).
  const rctx = ctx as ReactiveContext<HyperLogLogData>;
  const tally: Tally = { keys: 0, raises: 0 };

  try {
    for (;;) {
      if (rctx.cancelled) return;

      // 새 바퀴는 0 에서 센다. 메커니즘의 metric 은 누적이므로 상쇄해 둔다.
      if (tally.keys > 0) rctx.metric('key-count', -tally.keys);
      if (tally.raises > 0) rctx.metric('raise-count', -tally.raises);
      tally.keys = 0;
      tally.raises = 0;

      if (!(await runPass(rctx, tally))) return;

      // 입력 대기 — 여기서부터는 되돌리기와 손잡이만 남는다.
      for (;;) {
        if (rctx.cancelled) return;
        const input = await rctx.waitForInput();
        const next = readBucketCount(input);
        if (next === null) continue;
        rctx.data.bucketCount = next;
        break;
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6/C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!rctx.cancelled) throw err;
  }
};
