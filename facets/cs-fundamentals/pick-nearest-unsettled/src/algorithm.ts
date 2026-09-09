/**
 * pickNearestUnsettled — 가장 가까운 것부터 굳힌다 (다익스트라의 확정).
 *
 * 주장 하나: **지금 가장 작은 수를 이고 있는 것은 더 줄어들 수 없다.** 그래서
 * 그 자리에서 굳혀도 되고, 굳은 뒤에는 무엇이 닿아도 다시 흔들리지 않는다.
 * 수가 내려가는 일 자체는 다른 조각의 몫이라, 여기서는 **아직 흔들리는 것과
 * 이미 굳은 것의 차이**만 말한다.
 *
 * ── 식별자
 *   node:<id>   정점
 *
 * ── 이벤트 (전부 facet 고유)
 *   표준 어휘로는 "흔들림 → 굳음" 의 전이를 말할 수 없다. `state-changed` 는
 *   "어떤 항목의 상태가 바뀌었다" 라는 일반 어휘라, 굳음의 단호함(다시는 안
 *   바뀐다)이 그 이름에 담기지 않는다 (C2).
 *
 *   seed    { nodeId: string; value: number }
 *           출발점이 0 을 인다. 이때부터 그 정점은 흔들리는 후보다.
 *           target: `node:<id>`
 *
 *   harden  { nodeId: string; value: number; order: number }
 *           흔들리는 것 중 가장 작은 수를 인 정점이 굳는다. order 는 굳은 차례(1부터).
 *           target: `node:<id>`
 *
 *   spread  { from: string; probes: Probe[] }
 *           방금 굳은 정점에서 이웃 전부로 수가 한꺼번에 건너간다. 한 걸음에
 *           묶는 것은 **동시에 일어나는 일**이기 때문이고, 그래야 한 화면 안에서
 *           "굳은 이웃은 튕겨내고 흔들리는 이웃은 받는다" 가 나란히 보인다
 *           (C2 의 집합 이벤트와 같은 취지). probes 는 인접 간선을 훑은 결과이지
 *           사람이 적은 걸음표가 아니다.
 *           target: `node:<from>`
 *
 *   rewind  {}
 *           한 걸음씩 다시 볼 때 처음으로 되감는다.
 *
 *   done    { hardened: string[] }  (표준)
 *           모두 굳었다. `hardened` 는 굳은 차례다.
 *
 *   Probe = {
 *     to: string;                 이웃 정점
 *     weight: number;             건너가는 간선의 무게
 *     offered: number;            굳은 수 + 무게 = 내미는 수
 *     before: number | null;      이웃이 이고 있던 수. 아직 닿지 않았으면 null (∞)
 *     after: number | null;       이 걸음 뒤 이웃이 이게 될 수
 *     outcome: 'lower' | 'keep' | 'blocked';
 *              lower   더 작아서 받는다 (∞ 에 처음 닿는 것도 포함)
 *              keep    이 길로는 나아지지 않아 그대로 둔다
 *              blocked 이미 굳어서 받지 않는다 — 이 조각의 주장이 서는 자리
 *   }
 *
 * silent 이벤트 없음 — 모든 걸음이 화면을 바꾼다.
 * metric 없음 (조각은 셀 것이 없다, S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 정점. x/y 는 0~1 로 정규화한 배치 — 픽셀 환산은 stage 가 캔버스 크기에서 한다. */
export type PickNearestUnsettledNode = { id: string; x: number; y: number };

/** 무방향 간선. from/to 의 순서는 선언 편의일 뿐 방향이 아니다. */
export type PickNearestUnsettledEdge = { from: string; to: string; weight: number };

export type PickNearestUnsettledProbeOutcome = 'lower' | 'keep' | 'blocked';

export type PickNearestUnsettledProbe = {
  to: string;
  weight: number;
  offered: number;
  before: number | null;
  after: number | null;
  outcome: PickNearestUnsettledProbeOutcome;
};

export type PickNearestUnsettledData = {
  type: 'weighted-graph';
  nodes: PickNearestUnsettledNode[];
  edges: PickNearestUnsettledEdge[];
  /** 출발 정점 id. */
  source: string;
  /** 걸음 간격 (S-piece — 읽을 시간을 주는 저작 결정이라 선언에 둔다). */
  stepMs: number;
};

const FALLBACK_STEP_MS = 900;

export async function pickNearestUnsettledAlgorithm(
  ctx: FacetContext<PickNearestUnsettledData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<PickNearestUnsettledData>;
  const nodes = ctx.data.nodes;
  const edges = ctx.data.edges;
  const source = ctx.data.source;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : FALLBACK_STEP_MS;
  if (nodes.length === 0) return;

  /** 자동 재생을 마친 뒤에는 한 걸음씩 짚는다. */
  let manual = false;
  /** 되감기 직후의 첫 문은 그냥 통과시킨다 — 눌러도 반응 없는 것으로 읽히지 않게 (S-piece). */
  let freeStep = false;

  /** `advance` 하나를 기다린다. 러너가 접었으면 false. */
  const nextAdvance = async (): Promise<boolean> => {
    for (;;) {
      let input: { type: string };
      try {
        input = await rctx.waitForInput();
      } catch {
        // 기다리는 중에 러너가 접었다 (reset / destroy). 조용히 끝낸다.
        return false;
      }
      if (rctx.cancelled) return false;
      // advance 만 걸음으로 센다. 지금은 메커니즘이 그것만 흘려보내지만,
      // 위젯 입력이 하나라도 붙으면 아무 dispatch 나 걸음이 되어 버린다.
      if (input.type !== 'advance') continue;
      return true;
    }
  };

  /** 다음 걸음까지의 문. 자동 재생이면 시간이, 손으로 짚는 중이면 입력이 연다. */
  const gate = async (): Promise<boolean> => {
    if (rctx.cancelled) return false;
    if (!manual) return await rctx.sleep(stepMs);
    if (freeStep) {
      freeStep = false;
      return true;
    }
    return await nextAdvance();
  };

  const neighborsOf = (id: string): Array<{ other: string; weight: number }> => {
    const out: Array<{ other: string; weight: number }> = [];
    for (const e of edges) {
      if (e.from === id) out.push({ other: e.to, weight: e.weight });
      else if (e.to === id) out.push({ other: e.from, weight: e.weight });
    }
    return out;
  };

  const dist = new Map<string, number>();
  const stone = new Set<string>();

  /** 한 바퀴 — 모두 굳을 때까지. 러너가 접으면 false. */
  const runPass = async (): Promise<boolean> => {
    dist.clear();
    stone.clear();

    if (!(await gate())) return false;
    dist.set(source, 0);
    await ctx.emit({
      type: 'seed',
      target: `node:${source}`,
      payload: { nodeId: source, value: 0 },
    });

    let order = 0;
    for (;;) {
      // 흔들리는 것 중 가장 작은 수. 없으면 더 굳힐 것이 없다.
      let pick: string | null = null;
      let smallest = Number.POSITIVE_INFINITY;
      for (const n of nodes) {
        if (stone.has(n.id)) continue;
        const d = dist.get(n.id);
        if (d === undefined || d >= smallest) continue;
        smallest = d;
        pick = n.id;
      }
      if (pick === null) break;

      if (!(await gate())) return false;
      stone.add(pick);
      order += 1;
      await ctx.emit({
        type: 'harden',
        target: `node:${pick}`,
        payload: { nodeId: pick, value: smallest, order },
      });

      // 굳은 자리에서 이웃 전부로 수를 내민다. 굳은 이웃도 건너뛰지 않고 훑는다 —
      // 닿아도 꿈쩍하지 않는 장면이 이 조각의 주장이라, 그것을 생략하면 주장이 사라진다.
      const probes: PickNearestUnsettledProbe[] = [];
      for (const { other, weight } of neighborsOf(pick)) {
        const offered = smallest + weight;
        const before = dist.get(other) ?? null;
        if (stone.has(other)) {
          probes.push({ to: other, weight, offered, before, after: before, outcome: 'blocked' });
          continue;
        }
        if (before === null || offered < before) {
          dist.set(other, offered);
          probes.push({ to: other, weight, offered, before, after: offered, outcome: 'lower' });
          continue;
        }
        probes.push({ to: other, weight, offered, before, after: before, outcome: 'keep' });
      }

      if (probes.length > 0) {
        if (!(await gate())) return false;
        await ctx.emit({ type: 'spread', target: `node:${pick}`, payload: { from: pick, probes } });
      }
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: { hardened: order } });
    return true;
  };

  for (;;) {
    if (!(await runPass())) return;
    // 자동 재생이 끝났다. 곱씹고 싶은 사람을 위해 처음부터 한 걸음씩 다시 짚는다.
    if (!(await nextAdvance())) return;
    await ctx.emit({ type: 'rewind' });
    manual = true;
    freeStep = true;
  }
}
