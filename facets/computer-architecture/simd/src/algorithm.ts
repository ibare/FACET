/**
 * SIMD — 한 명령어가 여러 원소를 함께 민다. 차선을 넓힐수록 꼬리의 몫이 커진다.
 *
 * c = a + b 를 원소 열여덟에 대해 셈한다. 차선이 w 면 덧셈 명령 하나가 c[i..i+w) 를
 * 한꺼번에 채우고(묶음), w 로 나누어떨어지지 않고 남은 원소는 하나씩 더한다(꼬리).
 * 덧셈 명령 수 = n // w + n % w.
 *
 * 이 화면은 메모리 대역폭을 다루지 않는다 — 적재 · 저장은 덧셈 하나에 딸린 것으로 보고
 * 세지 않는다. 빨라짐은 덧셈 명령 수만으로 셈한다.
 *
 * ── 짜임 (reactive)
 *
 * 한 판(차선 w 로 열여덟을 다 더함)을 걸음마다 재생하고, 끝나면 손잡이를 기다린다.
 * 재생 도중 손잡이를 돌리면 다음 걸음 경계에서 받아 그 판을 버리고 새 차선으로 다시 돈다.
 *
 * ── 이벤트
 *
 * - `phase` (silent) — `{ phase: string }`
 * - `round-start` — `{ lanes: number, packs: number, tail: number, ops: number, n: number }`
 *     한 판의 시작. packs = n // lanes, tail = n % lanes, ops = packs + tail (셈한 값).
 * - `pack-add` — `{ start: number, width: number, sums: number[], op: number }`
 *     덧셈 명령 하나가 c[start..start+width) 를 한꺼번에 채웠다. op 는 0 부터의 명령 번호.
 * - `tail-add` — `{ index: number, sum: number, op: number }`
 *     꼬리의 덧셈 명령 하나가 c[index] 하나를 채웠다.
 * - `round-done` — `{ lanes: number, ops: number, tailOps: number, pct: number, n: number }`
 *     한 판의 끝. ops · tailOps 는 걸으며 센 값, pct 는 빨라짐 %.
 *
 * ── phase 어휘
 *
 * `'plan' | 'bundle-add' | 'tail-add' | 'speedup'`
 *
 * ── 메트릭 (판마다 0 에서 다시 센다 — 누적이 아니다)
 *
 * - `add-op-count` — 이 판의 덧셈 명령 수 (묶음 + 꼬리)
 * - `tail-op-count` — 이 판의 꼬리 덧셈 명령 수
 * - `speedup-percent` — 차선 하나 대비 빨라짐 %. `(n*100 + ops//2) // ops` (반올림)
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type SimdData = {
  type: 'simd';
  /** 왼쪽 피연산자 열. */
  a: number[];
  /** 오른쪽 피연산자 열. a 와 길이가 같다. */
  b: number[];
  /** 손잡이 사다리 — 차선 수. 첫 값이 시작값이다. */
  laneLadder: number[];
  /** 덧셈 명령 하나의 걸음 간격 (ms). */
  stepMs: number;
};

/** 빨라짐 % — 반올림 정수 나눗셈. IR 의 `speedupPercent` 와 같은 식. */
export function speedupPercentOf(n: number, ops: number): number {
  return Math.floor((n * 100 + Math.floor(ops / 2)) / ops);
}

type Gate = { kind: 'go' } | { kind: 'switch'; lanes: number } | { kind: 'cancelled' };
type Round = { kind: 'done' } | { kind: 'switch'; lanes: number } | { kind: 'cancelled' };

export async function simdAlgorithm(ctx: FacetContext<SimdData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SimdData>;
  const data = ctx.data;
  const a = data.a;
  const b = data.b;
  const ladder = data.laneLadder;
  const n = a.length;
  const stepMs = data.stepMs;

  /** 지금 보이는 계기 값. 차이만 보내고, 처음 한 번은 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 우리 손잡이 입력이면 차선 값을, 아니면 null. */
  const readLanes = (input: ReactiveInputEvent): number | null => {
    if (input.type !== 'lanes') return null;
    const p = input.payload;
    if (typeof p !== 'object' || p === null) return null;
    const v = (p as { value?: unknown }).value;
    if (typeof v !== 'number' || !ladder.includes(v)) return null;
    return v;
  };

  /** 걸음 사이의 문. 도중에 손잡이가 돌았으면 그 값을 들고 나온다. */
  const gate = async (): Promise<Gate> => {
    if (ctx.cancelled) return { kind: 'cancelled' };
    const alive = await rctx.sleep(stepMs);
    if (!alive) return { kind: 'cancelled' };
    for (let polled = rctx.pollInput(); polled !== null; polled = rctx.pollInput()) {
      if (ctx.cancelled) return { kind: 'cancelled' };
      const lanes = readLanes(polled);
      if (lanes !== null) return { kind: 'switch', lanes };
    }
    return { kind: 'go' };
  };

  const playRound = async (lanes: number): Promise<Round> => {
    gauge('add-op-count', 0);
    gauge('tail-op-count', 0);
    gauge('speedup-percent', 0);

    await phase('plan');
    const tail = n % lanes;
    const packs = Math.floor(n / lanes);
    await ctx.emit({ type: 'round-start', payload: { lanes, packs, tail, ops: packs + tail, n } });

    let ops = 0;
    let tailOps = 0;
    let i = 0;
    while (i + lanes <= n) {
      const g = await gate();
      if (g.kind !== 'go') return g;
      await phase('bundle-add');
      const start = i;
      const sums = a.slice(start, start + lanes).map((x, k) => x + b[start + k]!);
      await ctx.emit({ type: 'pack-add', payload: { start, width: lanes, sums, op: ops } });
      ops += 1;
      gauge('add-op-count', ops);
      i += lanes;
    }
    while (i < n) {
      const g = await gate();
      if (g.kind !== 'go') return g;
      await phase('tail-add');
      await ctx.emit({ type: 'tail-add', payload: { index: i, sum: a[i]! + b[i]!, op: ops } });
      ops += 1;
      tailOps += 1;
      gauge('add-op-count', ops);
      gauge('tail-op-count', tailOps);
      i += 1;
    }
    const g = await gate();
    if (g.kind !== 'go') return g;
    await phase('speedup');
    const pct = speedupPercentOf(n, ops);
    gauge('speedup-percent', pct);
    await ctx.emit({ type: 'round-done', payload: { lanes, ops, tailOps, pct, n } });
    return { kind: 'done' };
  };

  let lanes = ladder[0] ?? 1;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      const round = await playRound(lanes);
      if (round.kind === 'cancelled') return;
      if (round.kind === 'switch') {
        lanes = round.lanes;
        continue;
      }
      // 한 판이 끝났다 — 손잡이를 기다린다.
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        next = readLanes(input);
      }
      lanes = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
