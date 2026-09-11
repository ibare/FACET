/**
 * bloom-filter — 적은 자리로 "없다" 를 확실히 말한다.
 *
 * 손잡이 둘을 독자가 직접 민다. 자리 수 m 이 적으면 해시 수 k 를 적게 써야 하고,
 * 넉넉하면 더 써도 된다 — 하나가 다른 하나의 최적점을 옮긴다. 그래서 reactive 다.
 *
 * ── 셈 (1차 데이터는 h1 · h2 뿐이다. 자리와 비트열과 거짓 양성률은 여기서 센다)
 *   자리_i = (mask(h1) + mask(i·h2)) mod m,  i = 0 … k-1,  mask(x) = x & 0x7FFFFFFF
 *   h1 은 Java `String.hashCode` 를 마스크한 값, h2 는 FNV-1a 32bit 를 마스크한 뒤
 *   `| 1` 로 홀수로 만든 값이다. 홀수로 만드는 까닭은 짝수면 여러 i 가 같은 칸을
 *   짚기 때문이다. 곱셈 결과에도 마스크를 씌운다 — 그것이 Java int 의 셈과 같다.
 *
 * ── 식별자
 *   index:<n>   비트 배열의 n 번 자리
 *
 * ── 이벤트 (표준은 `done` 뿐. 나머지는 이 facet 고유 — C2)
 *   setup          { m, k, keys }                              비트 배열을 새로 짓는다
 *   hash-computed  { key, keyIndex, h1, h2, slots }            한 값의 자리를 다 셈했다
 *   bit-set        { slot, keyIndex, shared }   target index:<n>   자리 하나를 켠다
 *   measured       { onBits, m, falsePositives, queries, percent }
 *   done           { onBits, m, percent }
 *   phase          { phase }                                   silent: true
 *
 * ── phase 어휘 (irs.ts 와 집합이 완전히 일치한다 — C3)
 *   'hash' | 'set-bit' | 'probe' | 'absent' | 'present'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *   hash-count · bit-on-count · collision-count · false-positive-count
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 양수로 만드는 마스크. 자리 셈은 전부 이것을 지난다. */
const MASK = 0x7fffffff;

/** 자리 수 m 의 선택지. facet.ts 의 segmented-slider 와 같아야 한다. */
export const BLOOM_SLOT_CHOICES: readonly number[] = [16, 32, 64];

/** 해시 수 k 의 선택지. */
export const BLOOM_HASH_CHOICES: readonly number[] = [1, 2, 3, 4, 5, 6];

export type BloomFilterHash = { h1: number; h2: number };

export type BloomFilterData = {
  type: string;
  /** 자리 수. 손잡이가 민다. */
  m: number;
  /** 해시 수. 손잡이가 민다. */
  k: number;
  /** 넣는 것. 이 순서로 넣는다. */
  keys: string[];
  /** 넣는 것의 바탕 해시 둘. 1차 데이터다. */
  hashes: Record<string, BloomFilterHash>;
  /** 거짓 양성률을 재는 데 쓰는, 넣지 않은 키의 수. */
  queryCount: number;
  /** 한 걸음의 길이 (ms). */
  stepMs: number;
};

/** 자리_i = (mask(h1) + mask(i·h2)) mod m. */
export function bloomSlots(h1: number, h2: number, m: number, k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < k; i += 1) {
    out.push((h1 + ((i * h2) & MASK)) % m);
  }
  return out;
}

/** Java `String.hashCode` 를 양수로. */
function javaHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h & MASK;
}

/** FNV-1a 32bit 를 양수로 만든 뒤 홀수로. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h ^ s.charCodeAt(i)) | 0;
    h = Math.imul(h, 0x01000193) | 0;
  }
  return (h & MASK) | 1;
}

/** 거짓 양성률을 재는 질의 키. 넣은 여섯과 겹치지 않는다. */
export function bloomQueryKey(i: number): string {
  return `q-${i.toString(36)}`;
}

/**
 * 넣지 않은 키를 전부 물어 "있다" 로 답한 수를 센다.
 *
 * 넣은 것을 "없다" 로 답하는 일은 없으므로 (그것이 이 자료구조의 약속이다) 틀린
 * 답은 이쪽 한 방향뿐이다.
 */
function countFalsePositives(bits: number[], m: number, k: number, queries: number): number {
  let wrong = 0;
  for (let i = 0; i < queries; i += 1) {
    const key = bloomQueryKey(i);
    const h1 = javaHashCode(key);
    const h2 = fnv1a32(key);
    let all = true;
    for (let j = 0; j < k; j += 1) {
      if (bits[(h1 + ((j * h2) & MASK)) % m] !== 1) {
        all = false;
        break;
      }
    }
    if (all) wrong += 1;
  }
  return wrong;
}

function pick(value: number, choices: readonly number[], fallback: number): number {
  return choices.includes(value) ? value : fallback;
}

/** 손잡이가 보낸 값을 데이터에 반영한다. 모르는 값이면 그대로 둔다. */
function applyInput(data: BloomFilterData, input: ReactiveInputEvent): void {
  const p = input.payload as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null) return;
  const raw = p.value;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return;
  if (input.type === 'slots') data.m = pick(value, BLOOM_SLOT_CHOICES, data.m);
  else if (input.type === 'hashes') data.k = pick(value, BLOOM_HASH_CHOICES, data.k);
}

export const bloomFilterAlgorithm = async (ctx: FacetContext<BloomFilterData>): Promise<void> => {
  const rc = ctx as ReactiveContext<BloomFilterData>;

  /**
   * 메트릭을 절대값으로 맞춘다.
   *
   * `ctx.metric` 은 누적이고 메커니즘은 되돌릴 때만 비운다. 손잡이를 밀어 다시
   * 짓는 것은 되돌리기가 아니므로, 그냥 더하면 두 번째 판부터 수가 불어난다.
   * 지난번에 알린 값과의 차만 보내 화면이 늘 이번 판의 수를 보이게 한다.
   */
  const reported = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = reported.get(name) ?? 0;
    if (value === prev) return;
    ctx.metric(name, value - prev);
    reported.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const beat = (ratio: number): Promise<boolean> =>
    rc.sleep(Math.max(40, ctx.data.stepMs * ratio));

  /** 한 판. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  const runOnce = async (): Promise<boolean> => {
    const data = ctx.data;
    const m = pick(data.m, BLOOM_SLOT_CHOICES, 32);
    const k = pick(data.k, BLOOM_HASH_CHOICES, 3);
    const bits = new Array<number>(m).fill(0);

    let hashes = 0;
    let onBits = 0;
    let overlaps = 0;
    setMetric('hash-count', 0);
    setMetric('bit-on-count', 0);
    setMetric('collision-count', 0);
    setMetric('false-positive-count', 0);

    await ctx.emit({ type: 'setup', payload: { m, k, keys: [...data.keys] } });
    if (!(await beat(1))) return false;

    for (let keyIndex = 0; keyIndex < data.keys.length; keyIndex += 1) {
      const key = data.keys[keyIndex];
      const base = data.hashes[key];
      if (base === undefined) continue;
      const slots = bloomSlots(base.h1, base.h2, m, k);

      await phase('hash');
      await ctx.emit({
        type: 'hash-computed',
        payload: { key, keyIndex, h1: base.h1, h2: base.h2, slots },
      });
      hashes += k;
      setMetric('hash-count', hashes);
      if (!(await beat(1))) return false;

      for (const slot of slots) {
        const shared = bits[slot] === 1;
        bits[slot] = 1;
        if (shared) {
          overlaps += 1;
          setMetric('collision-count', overlaps);
        } else {
          onBits += 1;
          setMetric('bit-on-count', onBits);
        }
        await phase('set-bit');
        await ctx.emit({
          type: 'bit-set',
          target: `index:${slot}`,
          payload: { slot, keyIndex, shared },
        });
        if (!(await beat(0.55))) return false;
      }
    }

    // 넣기가 끝났다. 이제 넣지 않은 것들을 물어 한쪽으로만 틀리는 그 비율을 잰다.
    await phase('probe');
    const queries = data.queryCount;
    const falsePositives = countFalsePositives(bits, m, k, queries);
    const percent = queries > 0 ? (falsePositives / queries) * 100 : 0;
    setMetric('false-positive-count', falsePositives);
    await ctx.emit({
      type: 'measured',
      payload: { onBits, m, falsePositives, queries, percent },
    });
    if (!(await beat(1.4))) return false;

    // 물어본 것들이 지난 두 갈래. 꺼진 칸을 만난 쪽이 "없다" 이고, 셋이 다 켜져
    // 있던 쪽이 "있다" 다 — 뒤쪽이 곧 틀린 답이다.
    await phase('absent');
    if (falsePositives > 0) await phase('present');
    await ctx.emit({ type: 'done', payload: { onBits, m, percent } });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await runOnce())) return;
      // 손잡이를 밀 때까지 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와
      // 위젯만 남는다 (메커니즘의 입력 대기 상태).
      const input = await rc.waitForInput();
      if (ctx.cancelled) return;
      applyInput(ctx.data, input);
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6/C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
