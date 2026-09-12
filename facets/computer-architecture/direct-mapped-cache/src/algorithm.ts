/**
 * 직접 사상 캐시 — 자리를 주소가 정한다.
 *
 * 여덟 줄짜리 캐시를 두고 배열을 세 바퀴 돈다. 줄 `L` 은 언제나 `L % 8` 번
 * 자리에 앉으므로 찾을 곳이 한 군데뿐이라 빠르다. 그런데 배열이 캐시보다
 * 커지는 순간 `L` 과 `L + 8` 이 같은 자리를 두고 번갈아 밀어내고, 미스율이
 * 조금씩 나빠지는 것이 아니라 **절벽처럼** 무너진다.
 *
 * 손잡이는 배열의 줄 수 하나다 (`segmented-slider`, 4·6·8·9·12·16).
 *
 * ── 이벤트 어휘 (C2)
 *
 * | type | target | payload | silent |
 * | --- | --- | --- | --- |
 * | `phase` | — | `{ phase: string }` | 예 |
 * | `state-changed` | — | `{ lineCount, slotCount, sweeps, lineBytes }` | 아니오 |
 * | `sweep-begin` | — | `{ sweep: number, sweeps: number }` | 아니오 |
 * | `highlight` | `index:<줄번호>` | `{ slot, tag, sweep }` | 아니오 |
 * | `mark` | `slot:<자리번호>` | `{ lineNo, tag, outcome, evictedLine }` | 아니오 |
 * | `done` | — | `{ lineCount, accessCount, missCount, coldCount, conflictCount, missRatePct }` | 아니오 |
 *
 * `state-changed` 는 손잡이가 돌아 배열이 새로 놓일 때. `sweep-begin` 은 facet
 * 고유 확장이며 한 바퀴의 시작을 알린다. `outcome` 은 `'hit' | 'cold' |
 * 'conflict'`, `evictedLine` 은 이 접근이 밀어낸 줄 번호 (아무도 안 밀렸으면 -1).
 *
 * **식별자 prefix `slot:` 은 이 facet 이 더한 것이다.** 캐시의 자리는 배열
 * 인덱스도 노드도 아니라 표준 prefix 로 덮이지 않는다. 파싱은 `parseTarget`
 * 경유 (C1).
 *
 * ── phase 어휘 (irs.ts 와 집합이 정확히 같다 — C3)
 *
 *   index · probe · hit · miss · sweep · split · rate
 *
 * ── 메트릭 (C5)
 *
 *   access-count · cold-miss-count · conflict-miss-count · miss-rate-pct
 *
 * 앞의 둘을 갈라 세는 것이 이 화면의 요점이다. "첫 바퀴의 어쩔 수 없는 미스"
 * 는 배열이 커져도 배열 크기만큼만 늘고, **절벽을 만드는 것은 밀려서 난 미스**다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type DirectMappedCacheData = {
  type: 'direct-mapped-cache';
  /** 캐시의 줄 수. 여덟으로 고정한다 — 움직이는 것은 배열 쪽이다. */
  slotCount: number;
  /** 한 줄의 바이트 수. */
  lineBytes: number;
  /** 손잡이가 고를 수 있는 배열 크기 사다리 (라인 단위). */
  sizes: number[];
  /** 지금 도는 배열의 줄 수. 손잡이가 갈아 끼운다. */
  lineCount: number;
  /** 배열을 몇 바퀴 도는가. */
  sweeps: number;
  /** 걸음 사이의 기다림 (ms). */
  stepMs: number;
};

export type CacheOutcome = 'hit' | 'cold' | 'conflict';

export type CacheAccess = {
  /** 0-based 바퀴 번호. */
  sweep: number;
  lineNo: number;
  slot: number;
  tag: number;
  outcome: CacheOutcome;
  /** 이 접근이 밀어낸 줄 번호. 아무도 안 밀렸으면 -1. */
  evictedLine: number;
};

export type CacheTrace = {
  accesses: CacheAccess[];
  accessCount: number;
  missCount: number;
  coldCount: number;
  conflictCount: number;
  missRatePct: number;
};

/**
 * 미스율을 백분율 정수로. `irs.ts` 의 `missRate` 와 **같은 셈**이어야 한다 —
 * 실수를 거치지 않고 반올림한다.
 */
function ratePct(misses: number, accesses: number): number {
  if (accesses === 0) return 0;
  return Math.floor((misses * 100 + Math.floor(accesses / 2)) / accesses);
}

/**
 * 화면이 보이는 값을 한 번에 셈한다. 알고리즘은 이 결과를 따라 걸으며 발신할
 * 뿐이고, 검사는 이것과 IR 을 맞대 본다 — 둘이 갈리면 코드 패널이 화면과 다른
 * 말을 하게 된다.
 */
export function computeDirectMappedCacheTrace(
  lineCount: number,
  slotCount: number,
  sweeps: number,
): CacheTrace {
  const slots: number[] = new Array<number>(slotCount).fill(-1);
  /** 그 자리에 앉아 있는 줄 번호. 캡션이 "누가 밀려났는가" 를 말하려면 필요하다. */
  const seated: number[] = new Array<number>(slotCount).fill(-1);
  const touched: boolean[] = new Array<boolean>(lineCount).fill(false);

  const accesses: CacheAccess[] = [];
  let missCount = 0;
  let coldCount = 0;

  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    for (let lineNo = 0; lineNo < lineCount; lineNo += 1) {
      const slot = lineNo % slotCount;
      const tag = Math.floor(lineNo / slotCount);
      if (slots[slot] === tag) {
        accesses.push({ sweep, lineNo, slot, tag, outcome: 'hit', evictedLine: -1 });
        continue;
      }
      const evictedLine = seated[slot];
      const outcome: CacheOutcome = touched[lineNo] ? 'conflict' : 'cold';
      if (outcome === 'cold') coldCount += 1;
      missCount += 1;
      touched[lineNo] = true;
      slots[slot] = tag;
      seated[slot] = lineNo;
      accesses.push({ sweep, lineNo, slot, tag, outcome, evictedLine });
    }
  }

  const accessCount = accesses.length;
  return {
    accesses,
    accessCount,
    missCount,
    coldCount,
    conflictCount: missCount - coldCount,
    missRatePct: ratePct(missCount, accessCount),
  };
}

/** 손잡이가 보낸 새 배열 크기. 이 facet 이 받는 유일한 입력이다. */
function readSize(input: ReactiveInputEvent, sizes: number[]): number | null {
  if (input.type !== 'arraySize') return null;
  const p = input.payload as { value?: unknown } | undefined;
  const v = p?.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (!sizes.includes(v)) return null;
  return v;
}

/** 한 걸음이 끝나고 다음으로 넘어갈 때 무엇이 일어났는가. */
type Step = 'go' | 'restart' | 'cancelled';

export async function directMappedCacheAlgorithm(
  ctxIn: FacetContext<DirectMappedCacheData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<DirectMappedCacheData>;
  const d = ctx.data;
  const slotCount = d.slotCount;
  const sweeps = d.sweeps;
  const sizes = Array.isArray(d.sizes) ? d.sizes : [d.lineCount];
  const stepMs = typeof d.stepMs === 'number' ? d.stepMs : 420;

  /**
   * 지금 화면에 떠 있는 메트릭 값.
   *
   * `ctx.metric` 은 **더하는** 채널이라 절대값을 놓을 길이 없다. 그런데 손잡이를
   * 돌려 다시 도는 것은 되감기가 아니라서 러너가 메트릭을 비워 주지 않는다 —
   * 그대로 두면 바퀴가 돌 때마다 수가 쌓여 배열 크기와 무관한 값이 뜬다.
   * 여기서 차이를 내어 보내면 화면은 늘 이번 판의 값을 보인다.
   */
  const shown = new Map<string, number>();
  function setMetric(name: string, value: number): void {
    const prev = shown.get(name) ?? 0;
    if (value !== prev) ctx.metric(name, value - prev);
    shown.set(name, value);
  }

  /** phase 는 이름이 호출부에 리터럴로 남아야 한다 (C3). */
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 손잡이가 새로 고른 값. 걸음 사이의 문과 기다림이 여기에 적어 둔다. */
  let pendingSize: number | null = null;

  /**
   * 걸음 사이의 문. `ctx.sleep` 이 곧 취소 검사이자 멈춤 지점이다 —
   * `ReactiveMechanism` 의 재생·멈춤·한 걸음이 이 안에서 걸린다.
   */
  async function gate(): Promise<Step> {
    if (ctx.cancelled) return 'cancelled';
    const polled = ctx.pollInput();
    if (polled) {
      const n = readSize(polled, sizes);
      if (n !== null) {
        pendingSize = n;
        return 'restart';
      }
    }
    const alive = await ctx.sleep(stepMs);
    if (!alive || ctx.cancelled) return 'cancelled';
    return 'go';
  }

  /**
   * 한 판을 다 보이고 나서 손잡이를 기다린다.
   *
   * `waitForInput` 둘레는 앞뒤로 모두 본다. 취소가 reject 로 오더라도 그 규약에
   * 기대지 않는다 — 여기가 알고리즘의 가장 바깥이라 새면 아무도 못 잡는다 (C8).
   */
  async function waitForSize(): Promise<Step> {
    for (;;) {
      if (ctx.cancelled) return 'cancelled';
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다.
        if (!ctx.cancelled) throw err;
        return 'cancelled';
      }
      if (ctx.cancelled) return 'cancelled';
      const n = readSize(input, sizes);
      if (n === null) continue;
      pendingSize = n;
      return 'restart';
    }
  }

  /** 한 판. 끝까지 보였으면 `'go'`, 손잡이가 돌았으면 `'restart'`. */
  async function runOnce(lineCount: number): Promise<Step> {
    const trace = computeDirectMappedCacheTrace(lineCount, slotCount, sweeps);

    setMetric('access-count', 0);
    setMetric('cold-miss-count', 0);
    setMetric('conflict-miss-count', 0);
    setMetric('miss-rate-pct', 0);

    await phase('sweep');
    await ctx.emit({
      type: 'state-changed',
      payload: { lineCount, slotCount, sweeps, lineBytes: d.lineBytes },
    });
    if (ctx.cancelled) return 'cancelled';

    let sweep = -1;
    let done = 0;
    let misses = 0;
    let cold = 0;

    for (const a of trace.accesses) {
      // 문이 루프 바디의 첫 줄이다 — 이것이 곧 진입 검사다 (C8).
      const step = await gate();
      if (step !== 'go') return step;

      if (a.sweep !== sweep) {
        sweep = a.sweep;
        await phase('sweep');
        await ctx.emit({ type: 'sweep-begin', payload: { sweep: sweep + 1, sweeps } });
        if (ctx.cancelled) return 'cancelled';
      }

      await phase('index');
      await ctx.emit({
        type: 'highlight',
        target: `index:${a.lineNo}`,
        payload: { slot: a.slot, tag: a.tag, sweep: a.sweep + 1 },
      });
      if (ctx.cancelled) return 'cancelled';

      await phase('probe');
      if (a.outcome === 'hit') await phase('hit');
      else await phase('miss');

      await ctx.emit({
        type: 'mark',
        target: `slot:${a.slot}`,
        payload: {
          lineNo: a.lineNo,
          tag: a.tag,
          outcome: a.outcome,
          evictedLine: a.evictedLine,
        },
      });
      if (ctx.cancelled) return 'cancelled';

      done += 1;
      if (a.outcome !== 'hit') misses += 1;
      if (a.outcome === 'cold') cold += 1;
      setMetric('access-count', done);
      setMetric('cold-miss-count', cold);
      setMetric('conflict-miss-count', misses - cold);
      setMetric('miss-rate-pct', ratePct(misses, done));
    }

    await phase('split');
    await phase('rate');
    await ctx.emit({
      type: 'done',
      payload: {
        lineCount,
        accessCount: trace.accessCount,
        missCount: trace.missCount,
        coldCount: trace.coldCount,
        conflictCount: trace.conflictCount,
        missRatePct: trace.missRatePct,
      },
    });
    return ctx.cancelled ? 'cancelled' : 'go';
  }

  let lineCount = sizes.includes(d.lineCount) ? d.lineCount : sizes[0];

  try {
    for (;;) {
      if (ctx.cancelled) return;

      const outcome = await runOnce(lineCount);
      if (outcome === 'cancelled') return;

      if (outcome === 'go') {
        // 다 보였다. 손잡이가 돌 때까지 기다린다.
        const waited = await waitForSize();
        if (waited === 'cancelled') return;
      }

      if (pendingSize !== null) {
        lineCount = pendingSize;
        pendingSize = null;
        d.lineCount = lineCount;
      }
    }
  } catch (err) {
    // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
    // 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
}
