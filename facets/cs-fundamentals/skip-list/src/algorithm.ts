/**
 * facet:skipList — 스킵 리스트. 무작위가 균형 잡는 일을 대신한다.
 *
 * 손잡이는 **원소 수 n** 하나다. 조각 둘이 따로 말한 것 — 동전이 높이를 정하고
 * 층이 반씩 준다(`facet:coinFlipHeight`), 위에서 멀리 뛰고 아래에서 좁힌다
 * (`facet:skipALayer`) — 을 한 화면에서 이어, 그 둘이 합쳐지면 무엇이 나오는지를
 * 보인다. 아무도 모양을 관리하지 않았는데 걸음이 log n 으로 자란다.
 *
 * ── 1차 데이터
 *
 *   값    `(i+1)·3` 을 n 개, 오름차순. 값의 분포는 이 facet 의 관심사가 아니다 —
 *         층 구성을 정하는 것은 값이 아니라 동전이다.
 *
 *   높이  씨앗 161 을 못박은 선형 합동 생성기로 던진 동전. 손잡이는 원소 수이지
 *         무작위가 아니므로 같은 n 에서는 언제나 같은 모양이 나온다.
 *
 *           s ← (1103515245·s + 12345) mod 2³²
 *           반환값 = (s >>> 16) & 0x7FFF
 *           앞면   = (반환값 mod 2 == 0)
 *
 *         높이는 1 에서 시작해 앞면이면 한 층 더 쌓고 뒷면이면 멈춘다. 최대 층은
 *         `ceil(log2 n) + 1`. 값 하나마다 이 과정을 차례로 한 번씩 하며 난수열은
 *         이어서 쓴다.
 *
 *   탐색  가장 높은 층에서 출발해 다음 값을 본다. 찾는 값보다 작으면 그리로 옮겨
 *         가고, 크면 지나친 것이니 한 층 내려선다. 같으면 찾은 것이다.
 *
 *   높이 · 층별 노드 수 · 걸음 수는 전부 여기서 셈한다. 화면에 박아 둔 수는 없다.
 *
 * ── 이벤트 (전부 facet 고유 확장. C2)
 *
 *   built         { n, maxLevels, values: number[], heights: number[],
 *                   levelCounts: number[] }        구조가 지어졌다
 *   level-filled  { level, count, ratio }          층 하나가 눈금으로 채워졌다
 *   search-begin  { target, targetIndex }          찾기 시작
 *   probe         { level, index, value,
 *                   verdict: 'less' | 'greater' }  값 하나를 봤다 (걸음 하나)
 *   lane-end      { level }                        이 층에는 더 없다 — 내려선다
 *   found         { level, index, value, steps }   찾았다
 *   contrast      { points: { n, skip, flat, log2 }[], current }   대조 곡선
 *   done          { n, steps, skip, flat, log2 }   마무리 (표준 어휘)
 *
 *   `silent` 인 이벤트는 없다. reactive 메커니즘의 emit 은 걸음의 경계를 긋지
 *   않으며(그 일은 `ctx.sleep` 이 한다), 위 여덟은 모두 화면을 바꾼다.
 *
 * ── 메트릭 (C5)
 *
 *   step-count · level-count · avg-step-count — 셋 다 facet.ts 의 metrics 에 선언.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SkipListData = {
  type: 'skip-list';
  /** 원소 수. 손잡이가 바꾼다. */
  n: number;
  /** 동전의 씨앗. 손잡이가 아니라 상수다 — 같은 n 이면 같은 모양이 나와야 한다. */
  seed: number;
  /** 층 하나가 채워지는 사이 (ms). */
  buildMs: number;
  /** 한 번 보는 사이 (ms). */
  stepMs: number;
};

/** 손잡이가 고를 수 있는 원소 수. 대조 곡선의 가로축도 이것이다. */
export const SKIP_LIST_NS: readonly number[] = [8, 16, 32, 64, 128];

const DEFAULT_N = 16;
const DEFAULT_SEED = 161;
const DEFAULT_BUILD_MS = 260;
const DEFAULT_STEP_MS = 520;

export type SkipListShape = {
  n: number;
  maxLevels: number;
  values: number[];
  heights: number[];
  /** 층마다 선 노드의 수. levelCounts[0] 은 언제나 n. */
  levelCounts: number[];
};

export type SkipListPoint = { n: number; skip: number; flat: number; log2: number };

/** 한 걸음 또는 한 번의 층 내려서기. */
export type SkipListStep =
  | { kind: 'probe'; level: number; index: number; value: number; verdict: 'less' | 'greater' | 'equal' }
  | { kind: 'lane-end'; level: number };

/**
 * 선형 합동 생성기로 동전을 던진다.
 *
 * `Math.imul` 은 곱의 하위 32 비트를 그대로 주므로 `mod 2³²` 이 공짜다. 그냥
 * 곱하면 1103515245·s 가 2⁵³ 을 넘겨 배정밀도에서 하위 비트가 뭉개진다 — 그러면
 * 수열이 조용히 달라지고, 화면의 수가 사양의 대조와 어긋난다.
 */
function makeCoin(seed: number): () => boolean {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1103515245, s) + 12345) >>> 0;
    return (((s >>> 16) & 0x7fff) % 2) === 0;
  };
}

/** 값과 높이를 짓는다. 난수열은 값 하나에서 다음 값으로 이어서 쓴다. */
export function buildSkipList(n: number, seed: number): SkipListShape {
  const maxLevels = Math.ceil(Math.log2(n)) + 1;
  const coin = makeCoin(seed);
  const values: number[] = [];
  const heights: number[] = [];
  for (let i = 0; i < n; i += 1) {
    values.push((i + 1) * 3);
    let h = 1;
    // 앞면이면 한 층 더. 최대 층에 닿으면 더 던지지 않는다.
    while (h < maxLevels && coin()) h += 1;
    heights.push(h);
  }
  const levelCounts: number[] = [];
  for (let lv = 0; lv < maxLevels; lv += 1) {
    let c = 0;
    for (const h of heights) if (h > lv) c += 1;
    levelCounts.push(c);
  }
  return { n, maxLevels, values, heights, levelCounts };
}

/** 한 값을 찾는 동안 일어나는 일을 차례대로 적는다. */
export function searchSkipList(shape: SkipListShape, targetIndex: number): SkipListStep[] {
  const { values, heights, maxLevels } = shape;
  const target = values[targetIndex] ?? 0;
  const out: SkipListStep[] = [];
  let level = maxLevels - 1;
  let pos = -1;

  for (;;) {
    // 이 층에서 지금 자리 다음에 선 노드.
    let next = -1;
    for (let i = pos + 1; i < values.length; i += 1) {
      if ((heights[i] ?? 0) > level) {
        next = i;
        break;
      }
    }

    if (next === -1) {
      if (level === 0) return out;
      out.push({ kind: 'lane-end', level });
      level -= 1;
      continue;
    }

    const value = values[next] ?? 0;
    if (value === target) {
      out.push({ kind: 'probe', level, index: next, value, verdict: 'equal' });
      return out;
    }
    if (value < target) {
      out.push({ kind: 'probe', level, index: next, value, verdict: 'less' });
      pos = next;
      continue;
    }
    // 지나쳤다 — 한 층 내려선다.
    out.push({ kind: 'probe', level, index: next, value, verdict: 'greater' });
    if (level === 0) return out;
    level -= 1;
  }
}

/** 한 값을 찾기까지 **본 것**의 수. 층을 내려서는 것은 걸음이 아니다. */
export function looksFor(shape: SkipListShape, targetIndex: number): number {
  let n = 0;
  for (const s of searchSkipList(shape, targetIndex)) if (s.kind === 'probe') n += 1;
  return n;
}

/** 모든 원소를 하나씩 찾을 때의 평균 걸음. */
export function averageLooks(shape: SkipListShape): number {
  let sum = 0;
  for (let i = 0; i < shape.n; i += 1) sum += looksFor(shape, i);
  return sum / shape.n;
}

/** 가장 오래 걸리는 값의 자리. 화면에서 걸어 보일 하나를 데이터가 고르게 한다. */
function hardestIndex(shape: SkipListShape): number {
  let best = 0;
  let bestLooks = -1;
  for (let i = 0; i < shape.n; i += 1) {
    const k = looksFor(shape, i);
    if (k > bestLooks) {
      bestLooks = k;
      best = i;
    }
  }
  return best;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

function pickN(value: unknown, fallback: number): number {
  return typeof value === 'number' && SKIP_LIST_NS.includes(value) ? value : fallback;
}

/** 손잡이가 보낸 입력에서 원소 수를 읽는다. 알아볼 수 없으면 null. */
function readN(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.value === 'number' && SKIP_LIST_NS.includes(p.value)) return p.value;
  if (typeof p.n === 'string') {
    const v = Number(p.n);
    if (SKIP_LIST_NS.includes(v)) return v;
  }
  return null;
}

export const skipListAlgorithm = async (base: FacetContext<SkipListData>): Promise<void> => {
  const ctx = base as ReactiveContext<SkipListData>;
  const data = ctx.data;

  const seed = typeof data.seed === 'number' ? data.seed : DEFAULT_SEED;
  const buildMs = typeof data.buildMs === 'number' ? data.buildMs : DEFAULT_BUILD_MS;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : DEFAULT_STEP_MS;

  /**
   * `ctx.metric` 은 **더하는** 채널이라 값을 그대로 앉힐 수 없다. 지금 화면에
   * 걸린 값을 따로 들고 그 차이만 보낸다 — 손잡이를 움직여 다시 돌 때 걸음 수가
   * 앞 회차 위에 쌓이면 안 되기 때문이다.
   */
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const cur = shown.get(name) ?? 0;
    if (value === cur) return;
    ctx.metric(name, value - cur);
    shown.set(name, value);
  };

  // 대조 곡선은 손잡이와 무관한 고정값이라 한 번만 셈해 둔다.
  const points: SkipListPoint[] = SKIP_LIST_NS.map((m) => {
    const s = buildSkipList(m, seed);
    return { n: m, skip: round1(averageLooks(s)), flat: (m + 1) / 2, log2: round1(Math.log2(m)) };
  });

  let n = pickN(data.n, DEFAULT_N);

  for (;;) {
    data.n = n;
    const shape = buildSkipList(n, seed);

    setMetric('level-count', shape.maxLevels);
    setMetric('step-count', 0);
    setMetric('avg-step-count', 0);

    await ctx.emit({
      type: 'built',
      payload: {
        n,
        maxLevels: shape.maxLevels,
        values: shape.values,
        heights: shape.heights,
        levelCounts: shape.levelCounts,
      },
    });
    if (!(await ctx.sleep(buildMs))) return;

    // 위에서 아래로 채운다. 한 층 내려올 때마다 눈금이 대략 두 배로 는다.
    for (let lv = shape.maxLevels - 1; lv >= 0; lv -= 1) {
      const count = shape.levelCounts[lv] ?? 0;
      await ctx.emit({ type: 'level-filled', payload: { level: lv, count, ratio: count / n } });
      if (!(await ctx.sleep(buildMs))) return;
    }

    const targetIndex = hardestIndex(shape);
    await ctx.emit({
      type: 'search-begin',
      payload: { target: shape.values[targetIndex] ?? 0, targetIndex },
    });
    if (!(await ctx.sleep(stepMs))) return;

    let steps = 0;
    for (const s of searchSkipList(shape, targetIndex)) {
      if (s.kind === 'lane-end') {
        await ctx.emit({ type: 'lane-end', payload: { level: s.level } });
      } else {
        steps += 1;
        setMetric('step-count', steps);
        if (s.verdict === 'equal') {
          await ctx.emit({
            type: 'found',
            payload: { level: s.level, index: s.index, value: s.value, steps },
          });
        } else {
          await ctx.emit({
            type: 'probe',
            payload: { level: s.level, index: s.index, value: s.value, verdict: s.verdict },
          });
        }
      }
      if (!(await ctx.sleep(stepMs))) return;
    }

    const skip = round1(averageLooks(shape));
    const flat = (n + 1) / 2;
    setMetric('avg-step-count', skip);

    await ctx.emit({ type: 'contrast', payload: { points, current: n } });
    if (!(await ctx.sleep(stepMs))) return;

    await ctx.emit({
      type: 'done',
      payload: { n, steps, skip, flat, log2: round1(Math.log2(n)) },
    });

    // 입력 대기. 여기서 재생·한 걸음이 꺼지고 되돌리기와 손잡이만 남는다.
    let next = n;
    try {
      for (;;) {
        if (ctx.cancelled) return;
        const ev = await ctx.waitForInput();
        const v = readN(ev.payload);
        if (v !== null) {
          next = v;
          break;
        }
      }
    } catch (err) {
      // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6/C8).
      // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
      if (!ctx.cancelled) throw err;
      return;
    }
    if (ctx.cancelled) return;
    n = next;
  }
};
