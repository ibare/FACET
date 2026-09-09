/**
 * grow-one-tree — 나무 하나를 키워 나가기 (프림).
 *
 * 주장 하나: **고를 수 있는 것이 걸음마다 달라진다.** 그림 전체에서 가장 가벼운
 * 간선을 고르는 것이 아니라, 이미 자란 나무 밖으로 나가는 간선 — 나무에 발이 한쪽만
 * 닿은 것 — 중에서 고른다. 무게가 더 가벼운 간선이 그림 어딘가에 있어도 나무에
 * 닿지 않았으면 그 걸음에서는 후보가 아니다.
 *
 * ── 식별자
 *   node:<name>   정점
 *   edge:<id>     간선. id 는 데이터에 적힌 그대로다 (`A-B`).
 *
 * ── 이벤트 (`done` 만 표준 어휘, 나머지 넷은 이 facet 고유)
 *   tree-seeded     { node: string }
 *       시작 정점 하나가 나무가 된다.
 *   frontier-shown  { candidates: string[] }
 *       지금 나무 밖으로 나가는 간선 id 들. 여기 없는 간선은 고를 수 없다 —
 *       양쪽 다 나무 안이거나(더 이을 것이 없다), 양쪽 다 나무 밖이거나(아직
 *       닿지 않았다).
 *   edge-chosen     { edgeId: string; from: string; to: string; weight: number;
 *                     blockedEdge?: string; blockedWeight?: number }
 *       후보 중 가장 가벼운 것을 골라 나무가 한 자리 자란다. `from` 은 나무 쪽 끝,
 *       `to` 는 새로 붙는 정점이다. `blocked*` 는 "더 가벼운데 아직 나무에 닿지
 *       않아 고를 수 없는" 간선이 있을 때만 실린다 — 이 조각의 요점이 되는 걸음.
 *   rewind          (payload 없음)
 *       자동 재생을 다 본 뒤 advance 를 눌러 처음으로 돌아간다.
 *   done            { edgeCount: number; total: number }
 *       나무가 다 자랐다. 두 값 모두 이 실행에서 센 것이다.
 *
 * silent 이벤트는 없다 — 다섯 모두 화면이 바뀌는 걸음이다.
 * 화면 문안은 싣지 않는다 (C10). 캡션은 projector 가 이벤트 종류로 고른다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GrowOneTreeEdge = {
  /** `<u>-<v>`. 화면 이름은 view 가 u·v 로 짓는다. */
  id: string;
  u: string;
  v: string;
  /** 무게 */
  w: number;
};

export type GrowOneTreeData = {
  type: 'grow-one-tree';
  nodes: string[];
  edges: GrowOneTreeEdge[];
  /** 나무의 첫 자리 */
  start: string;
  /** 걸음 간격 (저작 결정, S-piece) */
  stepMs: number;
};

const DEFAULT_STEP_MS = 850;

/** 한쪽 끝만 나무 안 — 나무 밖으로 나가는 간선. 고를 수 있는 것은 이것뿐이다. */
function leavesTree(tree: ReadonlySet<string>, e: GrowOneTreeEdge): boolean {
  return tree.has(e.u) !== tree.has(e.v);
}

/** 양쪽 끝 모두 나무 밖 — 그 자리에 있지만 아직 나무에 발이 닿지 않았다. */
function outsideTree(tree: ReadonlySet<string>, e: GrowOneTreeEdge): boolean {
  return !tree.has(e.u) && !tree.has(e.v);
}

/** 무게가 가장 작은 간선. 같으면 먼저 적힌 것. */
function lightest(edges: GrowOneTreeEdge[]): GrowOneTreeEdge | undefined {
  let best: GrowOneTreeEdge | undefined;
  for (const e of edges) {
    if (best === undefined || e.w < best.w) best = e;
  }
  return best;
}

export const growOneTreeAlgorithm = async (
  base: FacetContext<GrowOneTreeData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<GrowOneTreeData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  /** 자동 재생을 마쳤는가. 마친 뒤로는 advance 한 번에 한 걸음씩 간다. */
  let manual = false;
  /** 되감기 직후의 첫 문만 그냥 통과시킨다 — 눌렀는데 아무 일도 없어 보이지 않게 (S-piece). */
  let freeGate = false;

  /** advance 를 기다린다. 러너가 접으면 false. */
  const waitAdvance = async (): Promise<boolean> => {
    for (;;) {
      if (ctx.cancelled) return false;
      let type: string;
      try {
        type = (await ctx.waitForInput()).type;
      } catch {
        // 기다리는 중에 러너가 접었다 — reset / destroy 가 대기를 깨운다.
        return false;
      }
      if (type === 'advance') return true;
      // 그 밖의 dispatch 는 걸음이 아니다. 계속 기다린다.
    }
  };

  /** 걸음 사이의 문. 자동 재생이면 stepMs 만큼 쉬고, 손으로 볼 때는 advance 를 기다린다. */
  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    return waitAdvance();
  };

  /** 한 회차 — 씨앗부터 나무가 다 자랄 때까지. 도중에 접히면 false. */
  const play = async (): Promise<boolean> => {
    const { nodes, edges, start } = ctx.data;
    const tree = new Set<string>([start]);

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'tree-seeded',
      target: `node:${start}`,
      payload: { node: start },
    });

    let total = 0;
    let edgeCount = 0;

    while (tree.size < nodes.length) {
      if (ctx.cancelled) return false;
      const candidates = edges.filter((e) => leavesTree(tree, e));
      const pick = lightest(candidates);
      // 후보가 없으면 나무는 더 자랄 수 없다 (끊긴 그림).
      if (pick === undefined) break;

      if (!(await gate())) return false;
      await ctx.emit({
        type: 'frontier-shown',
        target: candidates.map((e) => `edge:${e.id}`),
        payload: { candidates: candidates.map((e) => e.id) },
      });

      const from = tree.has(pick.u) ? pick.u : pick.v;
      const to = from === pick.u ? pick.v : pick.u;
      // 고른 것보다 가벼운데 아직 나무에 닿지 않은 간선. 있으면 그 걸음이 요점이다.
      const blocked = lightest(edges.filter((e) => outsideTree(tree, e) && e.w < pick.w));

      if (!(await gate())) return false;
      tree.add(to);
      total += pick.w;
      edgeCount += 1;
      await ctx.emit({
        type: 'edge-chosen',
        target: `edge:${pick.id}`,
        payload: {
          edgeId: pick.id,
          from,
          to,
          weight: pick.w,
          ...(blocked === undefined ? {} : { blockedEdge: blocked.id, blockedWeight: blocked.w }),
        },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: { edgeCount, total } });
    return true;
  };

  for (;;) {
    if (ctx.cancelled) return;
    if (!(await play())) return;
    // 다 자랐다. 여기서부터는 누를 때마다 한 걸음씩 — 먼저 처음으로 되감는다.
    manual = true;
    if (!(await waitAdvance())) return;
    await ctx.emit({ type: 'rewind' });
    freeGate = true;
  }
};
