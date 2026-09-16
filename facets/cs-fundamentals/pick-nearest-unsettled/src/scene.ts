/**
 * pickNearestUnsettled 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 정점 다섯이 흩어져 있고 저마다 수 하나를 인다. 아직 닿지 않은 것은 ∞ 를 이고
 * 비어 있고, 잠정 거리를 받은 것은 옅게 물들고, 굳은 것은 꽉 차고 **굳은 차례**를
 * 딱지로 단다. 굳은 자리에서 이웃으로 수가 한꺼번에 건너가는 걸음에서는 그 간선들이
 * 함께 짚이고, 굳은 이웃에 닿은 자리에는 튕긴 자국이 선다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 화면은 상태를 stage 안에 숨겨 두었다. projector 에는 `let` 이 하나도
 * 없었으므로 그쪽만 봤다면 다 놓쳤다.
 *
 * - **`states: Map<string, NodeState>`** — 이것이 곧 **거리표**였다. 각 정점이 인 수
 *   (`value`)와 형편(`kind: far | loose | stone`)이 DOM 곁의 이 표에만 있었고, 어느
 *   이벤트도 표 전체를 말하지 않으므로 지나온 걸음을 다 밟아야만 복원되었다. 이제
 *   `dist` 와 `settled` 가 그것을 말한다.
 * - **굳은 차례가 아무 데도 없었다.** algorithm 은 `order` 를 실어 보냈지만 projector
 *   가 그것을 버렸고, 화면에는 "굳었다" 만 남고 **몇 번째로 굳었나** 는 남지 않았다.
 *   굳는 순서가 곧 이 조각의 주장이라 `settled` 를 **차례가 있는 배열**로 둔다.
 * - **`swapValue` 가 화면을 도로 읽었다** — `e.valueText.textContent` 와 `getAttribute`
 *   로 지금 걸려 있는 수를 꺼내 옛 수의 유령을 지었다. 되감아 세운 직후에는 그 글자가
 *   아직 옛 화면의 것이라 셈이 틀어진다. 이제 `reach.was` 가 그 계기값을 싣는다.
 * - **`edgeLines` 의 `stroke` 칠** — 이번에 어느 간선으로 폈나. 걸음 안에서 물들였다
 *   되돌리는 명령형 코드에만 있었다. `spread` 가 말한다.
 *
 * 좌표는 담지 않는다. 정점 이름과 간선, 무게 같은 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 무방향 간선. from/to 의 순서는 선언 편의일 뿐 방향이 아니다. */
export type PickNearestUnsettledSceneEdge = { from: string; to: string; weight: number };

/**
 * 이웃 하나가 받은 답. **걸음이 내리는 판정**이라 발신이 싣는다.
 *
 *   lower   더 작아서 받는다 (∞ 에 처음 닿는 것도 포함)
 *   keep    이 길로는 나아지지 않아 그대로 둔다
 *   blocked 이미 굳어서 받지 않는다 — 이 조각의 주장이 서는 자리
 */
export type PickNearestUnsettledOutcome = 'lower' | 'keep' | 'blocked';

/**
 * 이번 걸음에 간선 하나를 타고 이웃까지 건너간 수.
 *
 * `weight` · `offered` · `was` · `now` 는 전부 **장면이 셈한다** — 바탕의 간선과
 * 지금 거리표에서 나오는 값이라 발신이 실어 오면 화면과 수가 두 출처를 갖게 된다.
 * 실려 오는 것은 `to` 와 `outcome` 뿐이다.
 *
 * `was` 는 건너오기 **전**에 이웃이 이고 있던 수다. 운동의 출발 그림이 여기서
 * 나온다 — `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 */
export type PickNearestUnsettledReach = {
  to: string;
  /** 건너가는 간선의 무게. */
  weight: number;
  /** 굳은 수 + 무게 = 내미는 수. */
  offered: number;
  /** 건너오기 전 이웃이 이고 있던 수. 아직 닿지 않았으면 `null` (∞). */
  was: number | null;
  /** 이 걸음 뒤 이웃이 이게 될 수. */
  now: number | null;
  outcome: PickNearestUnsettledOutcome;
};

/**
 * 이번 걸음에 편 자리. 다음 걸음이 오면 비워진다 — **짚음의 표식**이다.
 *
 * 채움이 값의 형편을 말하고 테두리가 짚음을 말하도록 갈라 두었으므로, 이것이
 * 테두리 쪽 어휘 전부를 정한다 (어느 간선을 폈나 · 어느 이웃에 닿았나).
 */
export type PickNearestUnsettledSpread = {
  from: string;
  reaches: PickNearestUnsettledReach[];
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type PickNearestUnsettledCaption =
  | { kind: 'start' }
  | { kind: 'seed'; node: string }
  | { kind: 'harden'; node: string; value: number }
  | { kind: 'spreadBoth' }
  | { kind: 'spreadReach'; node: string }
  | { kind: 'spreadBlocked' }
  | { kind: 'spreadNone' }
  | { kind: 'done' };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 수치를 싣지 않는다 — 흐르게 할 값은 전부 `dist` · `settled` · `spread` 에 있다.
 */
export type PickNearestUnsettledStep =
  | { kind: 'seed'; node: string }
  | { kind: 'harden'; node: string }
  | { kind: 'spread' }
  | { kind: 'done' };

export type PickNearestUnsettledScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 정점 이름. 자리는 그리는 쪽이 정한다. */
  nodes: string[];
  edges: PickNearestUnsettledSceneEdge[];
  /** 출발 정점. */
  source: string;

  // ── 걸어온 자취.
  /** 지금 각 정점이 이고 있는 수. 없는 것은 아직 닿지 않았다는 뜻이다 (∞). */
  dist: Record<string, number>;
  /**
   * 굳은 차례. 몇 번째로 굳었나가 곧 이 조각의 주장이라 **순서 있는 배열**이다.
   * 굳은 개수도 여기서 센다 (`settled.length`).
   */
  settled: string[];
  /** 이번 걸음에 편 자리. 다음 걸음에 비워진다. */
  spread: PickNearestUnsettledSpread | null;
  step: PickNearestUnsettledStep | null;
  caption: PickNearestUnsettledCaption;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * `dist` 와 `settled` 는 여기 들지 않는다 — 걸음이 고치는 것을 바탕에 섞어 되감기에
 * 넘기면, 되감은 화면이 이미 굴러간 거리표를 인 채로 서고 그 위에 algorithm 이 새로
 * 셈한 처음 거리가 겹친다 (프로토콜 4 절).
 */
type PickNearestUnsettledBase = Pick<PickNearestUnsettledScene, 'nodes' | 'edges' | 'source'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: PickNearestUnsettledBase): PickNearestUnsettledScene {
  return {
    nodes: base.nodes,
    edges: base.edges,
    source: base.source,
    // 걸어오며 얹은 거리와 굳음을 물려받지 않는 자리다.
    dist: {},
    settled: [],
    spread: null,
    step: null,
    caption: { kind: 'start' },
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 넘겨받은 선언에서 정점 이름을 좁힌다. 값만 베껴 담아 참조를 쥐지 않는다. */
function readNodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    const node = item as { id?: unknown };
    if (typeof node?.id !== 'string') continue;
    names.push(node.id);
  }
  return names;
}

/** 넘겨받은 선언에서 간선을 좁힌다. 여기서도 값만 베낀다 (S-scene 의 `initial`). */
function readEdges(value: unknown): PickNearestUnsettledSceneEdge[] {
  if (!Array.isArray(value)) return [];
  const edges: PickNearestUnsettledSceneEdge[] = [];
  for (const item of value) {
    const edge = item as { from?: unknown; to?: unknown; weight?: unknown };
    if (typeof edge?.from !== 'string' || typeof edge?.to !== 'string') continue;
    if (typeof edge?.weight !== 'number' || !Number.isFinite(edge.weight)) continue;
    edges.push({ from: edge.from, to: edge.to, weight: edge.weight });
  }
  return edges;
}

/** 걸음이 실어 오는 것은 짝과 판정뿐이다. 나머지 수는 장면이 셈한다. */
type ReadProbe = { to: string; outcome: PickNearestUnsettledOutcome };

function readProbes(value: unknown): ReadProbe[] {
  if (!Array.isArray(value)) return [];
  const probes: ReadProbe[] = [];
  for (const item of value) {
    const probe = item as { to?: unknown; outcome?: unknown };
    if (typeof probe?.to !== 'string') continue;
    const outcome =
      probe.outcome === 'lower' || probe.outcome === 'keep' || probe.outcome === 'blocked'
        ? probe.outcome
        : 'keep';
    probes.push({ to: probe.to, outcome });
  }
  return probes;
}

/**
 * 두 정점을 잇는 간선의 무게. 없으면 `null`.
 *
 * 같은 짝이 둘이면 작은 쪽이 이긴다 — 그 짝으로 건너갈 때 실제로 드는 값이다.
 */
function weightBetween(
  edges: PickNearestUnsettledSceneEdge[],
  a: string,
  b: string,
): number | null {
  let best: number | null = null;
  for (const edge of edges) {
    const joins = (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a);
    if (!joins) continue;
    if (best === null || edge.weight < best) best = edge.weight;
  }
  return best;
}

/**
 * 한 걸음에 무엇이 함께 일어났나를 캡션으로 옮긴다.
 *
 * 무엇이 한 화면에 같이 있느냐가 그 걸음이 하는 말이다 — "모두 굳었다" 는 흔들리는
 * 이웃이 하나라도 섞여 있으면 거짓이 된다. 옮기기 전에는 projector 가 같은 갈래를
 * 타 문자열을 만들었다.
 */
function spreadCaption(
  from: string,
  reaches: PickNearestUnsettledReach[],
): PickNearestUnsettledCaption {
  const blocked = reaches.some((r) => r.outcome === 'blocked');
  const lowered = reaches.some((r) => r.outcome === 'lower');
  const kept = reaches.some((r) => r.outcome === 'keep');
  if (blocked && lowered) return { kind: 'spreadBoth' };
  if (lowered) return { kind: 'spreadReach', node: from };
  if (blocked && !kept) return { kind: 'spreadBlocked' };
  return { kind: 'spreadNone' };
}

export const pickNearestUnsettledScene: ScenePlan<PickNearestUnsettledScene> = {
  /**
   * 첫 장면은 구조만 세운다 — 아무것도 닿지 않았고 아무것도 굳지 않았다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 그 안의 객체를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): PickNearestUnsettledScene {
    const d = (initialData ?? {}) as { nodes?: unknown; edges?: unknown; source?: unknown };
    return atStart({
      nodes: readNodes(d.nodes),
      edges: readEdges(d.edges),
      source: str(d.source),
    });
  },

  reduce(
    scene: PickNearestUnsettledScene,
    event: FacetRuntimeEvent,
  ): PickNearestUnsettledScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 출발점이 0 을 인다. 여기서부터 그 정점은 흔들리는 후보다.
      case 'seed': {
        const node = str(p.nodeId);
        if (node === '') return scene;
        return {
          ...scene,
          // 한 바퀴가 여기서 시작한다 (algorithm 의 `runPass` 가 표를 비우고 든다).
          dist: { [node]: 0 },
          settled: [],
          spread: null,
          step: { kind: 'seed', node },
          caption: { kind: 'seed', node },
        };
      }

      // 흔들리는 것 중 가장 작은 수를 인 정점이 굳는다. 차례는 배열이 센다.
      case 'harden': {
        const node = str(p.nodeId);
        if (node === '') return scene;
        return {
          ...scene,
          settled: [...scene.settled, node],
          spread: null,
          step: { kind: 'harden', node },
          caption: { kind: 'harden', node, value: scene.dist[node] ?? 0 },
        };
      }

      // 굳은 자리에서 이웃 전부로 수가 한꺼번에 건너간다.
      case 'spread': {
        const from = str(p.from);
        if (from === '') return scene;
        const base = scene.dist[from] ?? 0;
        // 앞 장면의 거리표를 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
        const dist = { ...scene.dist };
        const reaches: PickNearestUnsettledReach[] = [];
        for (const probe of readProbes(p.probes)) {
          const weight = weightBetween(scene.edges, from, probe.to);
          // 바탕에 없는 짝은 그릴 간선이 없다.
          if (weight === null) continue;
          const offered = base + weight;
          const was = scene.dist[probe.to] ?? null;
          const now = probe.outcome === 'lower' ? offered : was;
          if (probe.outcome === 'lower') dist[probe.to] = offered;
          reaches.push({ to: probe.to, weight, offered, was, now, outcome: probe.outcome });
        }
        if (reaches.length === 0) return scene;
        return {
          ...scene,
          dist,
          spread: { from, reaches },
          step: { kind: 'spread' },
          caption: spreadCaption(from, reaches),
        };
      }

      // 모두 굳었다. 남는 것은 굳은 차례뿐이다.
      case 'done':
        return {
          ...scene,
          spread: null,
          step: { kind: 'done' },
          caption: { kind: 'done' },
        };

      case 'rewind':
        // 걸음이 고치는 것(거리표·굳음)을 넘기지 않으려 바탕만 골라 객체로 넘긴다.
        // 변수를 그대로 넘기면 초과 속성 검사가 돌지 않아 좁힌 타입이 아무것도 못 막는다.
        return atStart({ nodes: scene.nodes, edges: scene.edges, source: scene.source });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
