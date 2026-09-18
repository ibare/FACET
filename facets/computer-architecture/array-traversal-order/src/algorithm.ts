/**
 * 배열 순회 순서 — 같은 합을 내는 두 걸음이 캐시에서 얼마나 다른 값을 치르는가.
 *
 * 행 우선으로 저장된 R×8 int 배열을 행 우선(r 바깥 · c 안) 또는 열 우선(c 바깥 · r 안)으로
 * 걸으며 원소를 더한다. 캐시는 완전 연관 · LRU · 줄 여덟 개 · 줄 하나에 원소 넷이고
 * 판마다 빈 채로 시작한다. 행 우선은 가져온 줄의 넷을 다 쓰고 떠나 미스가 25 % 이고,
 * 열 우선은 행 수가 캐시 줄 수 이하면 다음 열에서 그 줄들이 아직 남아 있어 버티다가
 * 넘는 순간 줄마다 다시 쓰기 전에 밀려나 미스가 전부가 된다. 합은 어느 쪽이든 같다.
 *
 * ── 손잡이 (reactive 입력)
 *   order  payload.value ∈ 0..orders.length-1  (0 행 우선 · 1 열 우선)
 *   rows   payload.value ∈ rowLadder            (4 · 8 · 12 · 16)
 *   판을 도는 도중에 들어온 손잡이는 그 판을 끊고 새 값으로 처음부터 다시 돈다.
 *
 * ── 이벤트 (전부 비silent, phase 만 silent)
 *   run-start  payload { rows: number, cols: number, order: number, lineElems: number, cacheLines: number }
 *   visit      payload { step: number, total: number, r: number, c: number, elem: number, value: number, sum: number }
 *   lookup     payload { r: number, c: number, elem: number, line: number }
 *   access     payload { step: number, total: number, r: number, c: number, elem: number, line: number,
 *                        value: number, sum: number, hit: boolean, evicted: number (-1 = 없음),
 *                        refetch: boolean, cache: number[] (최근에 쓴 줄부터),
 *                        misses: number (이 판의 누적 미스), percent: number (누적 미스 %) }
 *   run-end    payload { rows: number, order: number, accesses: number, misses: number,
 *                        missPercent: number, sum: number }
 *   phase      payload { phase } — silent
 *
 * ── phase 어휘
 *   'clear-cache' | 'accumulate' | 'lookup' | 'hit' | 'miss' | 'report'
 *   접근 하나가 세 걸음이다 — accumulate(walkSum 본문) · lookup(countMisses 의 주소와 찾기) ·
 *   hit 또는 miss. 걸음마다 phase 하나만 켜지므로 코드 패널의 모든 줄이 재생 중 한 번은 켜진다.
 *
 * ── 메트릭 (판마다 0 에서 다시 센다)
 *   access-count   이 판에서 읽은 원소 수
 *   miss-count     이 판의 캐시 미스 수
 *   miss-percent   (미스*100 + 접근//2) // 접근
 *   element-sum    지금까지 더한 원소의 합 — 두 순서가 끝에서 늘 같다 (안 갈리는 계기)
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ArrayTraversalOrderData = {
  type: 'array-traversal-order';
  /** 한 행의 원소 수. */
  cols: number;
  /** 캐시 줄 하나에 드는 원소 수 (int 4 바이트 × 4 = 16 B). */
  lineElems: number;
  /** 캐시가 담는 줄 수. */
  cacheLines: number;
  /** `rows` 손잡이의 사다리. segments[].value 와 같다. */
  rowLadder: number[];
  /** `order` 손잡이의 식별자 목록. 순번이 segments[].value 다. */
  orders: string[];
  /** 처음 판의 행 수 — rows 손잡이의 기본 구간과 같다. */
  rows: number;
  /** 처음 판의 순서 번호 — order 손잡이의 기본 구간과 같다. */
  order: number;
  /** 접근 한 번의 걸음 간격 (ms). */
  stepMs: number;
};

/** 접근 한 번의 결과. */
export type TraversalAccess = {
  r: number;
  c: number;
  elem: number;
  line: number;
  value: number;
  /** 이 접근까지의 누적 합. */
  sum: number;
  hit: boolean;
  /** 이번 미스로 밀려난 줄. 없으면 -1. */
  evicted: number;
  /** 이 판에서 이미 한 번 가져왔던 줄을 다시 가져오는 미스인가. */
  refetch: boolean;
  /** 이 접근 뒤 캐시에 든 줄들 — 최근에 쓴 줄부터. */
  cache: number[];
};

export type TraversalResult = {
  accesses: TraversalAccess[];
  misses: number;
  missPercent: number;
  sum: number;
};

/** 백분율 반올림 — IR 의 `missPercent` 와 같은 식. */
export function roundPercent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.floor((part * 100 + Math.floor(whole / 2)) / whole);
}

/**
 * 한 판을 끝까지 셈한다. 순수 함수 — 알고리즘과 검사가 함께 쓴다.
 *
 * order 0 은 r 바깥 · c 안, order 1 은 c 바깥 · r 안.
 */
export function computeArrayTraversalOrderResult(
  rows: number,
  order: number,
  cols: number,
  lineElems: number,
  cacheLines: number,
): TraversalResult {
  const outerN = order === 1 ? cols : rows;
  const innerN = order === 1 ? rows : cols;
  /** 최근에 쓴 줄이 앞. */
  const lru: number[] = [];
  const seen = new Set<number>();
  const accesses: TraversalAccess[] = [];
  let misses = 0;
  let sum = 0;
  for (let a = 0; a < outerN; a++) {
    for (let b = 0; b < innerN; b++) {
      const r = order === 1 ? b : a;
      const c = order === 1 ? a : b;
      const elem = r * cols + c;
      const line = Math.floor(elem / lineElems);
      const value = elem + 1;
      sum += value;
      const at = lru.indexOf(line);
      let evicted = -1;
      let refetch = false;
      const hit = at >= 0;
      if (hit) {
        lru.splice(at, 1);
      } else {
        misses += 1;
        refetch = seen.has(line);
        if (lru.length >= cacheLines) evicted = lru.pop() ?? -1;
      }
      lru.unshift(line);
      seen.add(line);
      accesses.push({ r, c, elem, line, value, sum, hit, evicted, refetch, cache: [...lru] });
    }
  }
  return { accesses, misses, missPercent: roundPercent(misses, accesses.length), sum };
}

function isInLadder(v: unknown, ladder: readonly number[]): v is number {
  return typeof v === 'number' && ladder.includes(v);
}

/** 손잡이 입력 하나를 읽는다. 우리 것이 아니면 null. */
function readKnob(
  input: { type: string; payload?: unknown },
  data: ArrayTraversalOrderData,
): { rows?: number; order?: number } | null {
  const p = input.payload;
  const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
  if (input.type === 'rows' && isInLadder(value, data.rowLadder)) return { rows: value };
  const orderIds = data.orders.map((_, i) => i);
  if (input.type === 'order' && isInLadder(value, orderIds)) return { order: value };
  return null;
}

export async function arrayTraversalOrderAlgorithm(
  ctx: FacetContext<ArrayTraversalOrderData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<ArrayTraversalOrderData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 더하기만 하는 채널이다 — 지금 보이는 값을 들고 차이만 보낸다.
  // 처음 한 번은 차이가 0 이어도 보내 이름을 싣는다.
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev === value) return;
    shown.set(name, value);
    ctx.metric(name, value - (prev ?? 0));
  };

  let rows = data.rows;
  let order = data.order;

  /** 한 판. 'done' 끝까지 돌았다 · 'knob' 손잡이가 들어와 끊었다 · 'cancelled'. */
  async function playRun(): Promise<'done' | 'knob' | 'cancelled'> {
    const result = computeArrayTraversalOrderResult(rows, order, data.cols, data.lineElems, data.cacheLines);
    const total = result.accesses.length;

    gauge('access-count', 0);
    gauge('miss-count', 0);
    gauge('miss-percent', 0);
    gauge('element-sum', 0);

    await phase('clear-cache');
    await ctx.emit({
      type: 'run-start',
      payload: { rows, cols: data.cols, order, lineElems: data.lineElems, cacheLines: data.cacheLines },
    });
    if (!(await rctx.sleep(data.stepMs * 10))) return 'cancelled';

    let misses = 0;
    for (let i = 0; i < total; i++) {
      if (ctx.cancelled) return 'cancelled';
      const knob = rctx.pollInput();
      if (knob) {
        const k = readKnob(knob, data);
        if (k) {
          if (k.rows !== undefined) rows = k.rows;
          if (k.order !== undefined) order = k.order;
          return 'knob';
        }
      }

      const a = result.accesses[i]!;
      // 접근 하나를 세 걸음으로 나눈다. 걸음 경계는 sleep 뿐이고 코드 패널은 마지막
      // phase 에 머물므로, 보여야 할 줄(합 · 찾기 · 적중/미스)마다 걸음을 하나씩 준다.

      // 1) 측정되는 프로그램 — 커서가 칸으로 옮겨 가고 합에 더한다.
      await phase('accumulate');
      await ctx.emit({
        type: 'visit',
        payload: { step: i + 1, total, r: a.r, c: a.c, elem: a.elem, value: a.value, sum: a.sum },
      });
      gauge('access-count', i + 1);
      gauge('element-sum', a.sum);
      if (!(await rctx.sleep(data.stepMs))) return 'cancelled';

      // 2) 측정하는 셈 — 그 원소가 든 줄을 캐시에서 찾는다.
      await phase('lookup');
      await ctx.emit({ type: 'lookup', payload: { r: a.r, c: a.c, elem: a.elem, line: a.line } });
      if (!(await rctx.sleep(data.stepMs))) return 'cancelled';

      // 3) 적중이면 시각만 고치고, 미스면 가장 오래 안 쓰인 줄을 내보내고 들인다.
      if (a.hit) await phase('hit');
      else {
        await phase('miss');
        misses += 1;
      }
      await ctx.emit({
        type: 'access',
        payload: {
          step: i + 1,
          total,
          r: a.r,
          c: a.c,
          elem: a.elem,
          line: a.line,
          value: a.value,
          sum: a.sum,
          hit: a.hit,
          evicted: a.evicted,
          refetch: a.refetch,
          cache: a.cache,
          misses,
          percent: roundPercent(misses, i + 1),
        },
      });
      gauge('miss-count', misses);
      gauge('miss-percent', roundPercent(misses, i + 1));
      if (!(await rctx.sleep(data.stepMs))) return 'cancelled';
    }

    await phase('report');
    await ctx.emit({
      type: 'run-end',
      payload: {
        rows,
        order,
        accesses: total,
        misses: result.misses,
        missPercent: result.missPercent,
        sum: result.sum,
      },
    });
    return 'done';
  }

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const outcome = await playRun();
      if (outcome === 'cancelled') return;
      if (outcome === 'knob') continue;

      // 한 판을 마쳤다 — 손잡이를 기다린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const k = readKnob(input, data);
        if (!k) continue;
        if (k.rows !== undefined) rows = k.rows;
        if (k.order !== undefined) order = k.order;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
