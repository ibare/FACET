/**
 * growOneTree 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 위에 정점과 간선이 놓이고, 아래 칸판에 간선마다 칸 하나가 선다. 칸은 세 줄
 * (나무 / 고를 수 있다 / 고를 수 없다) 사이를 오르내린다. 걸음마다 달라지는 것은
 * 둘이다 — **어느 간선이 나무에 붙었는가**, 그리고 **이번 걸음에 무엇이 후보로
 * 올랐는가.**
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었고 stage 의 `let` 셋도 전부 DOM 손잡이거나
 * 바탕이었다. 상태는 **타입 선언과 `new Map` 한 줄들**에 있었다.
 *
 * - `edgeState: Map<string, EdgeVisual>` — **이 조각의 주장 그 자체**다. 어느
 *   간선이 나무이고 어느 것이 이번 후보인가를 말하는 유일한 자리인데,
 *   `showFrontier()` · `grow()` 명령의 부수 효과로만 갈렸고 되돌리는 길은
 *   `applyStart()` 로 통째로 지우는 것뿐이었다. 게다가 `EdgeVisual` 은 세 값을
 *   한 축에 욱여넣어 **"나무에 들었나" 와 "이번에 후보였나" 가 서로를 덮었다** —
 *   고른 간선이 `tree` 가 되는 순간 그것이 후보 중에서 골라졌다는 사실이 화면에서
 *   사라졌다. 여기서는 두 축으로 가른다 (`joins` · `round.candidates`).
 * - `treeNodes: Set<string>` — 어느 정점이 나무에 들었나. `joins` 에서 파생한다.
 *   따로 담으면 같은 물음에 답이 둘이 된다.
 * - `chipLane: Map<string, number>` — 칸이 선 줄. `edgeState` 와 **같은 것을 두 번**
 *   적어 둔 자리였다. 지금은 그리는 쪽이 `lanesOf` 한 함수로 셈한다.
 * - `chipNowY` / `chipTargetY` — 칸의 지금 세로. `tweenChips` 가 `new Map(chipNowY)`
 *   로 **화면의 현재 자리를 도로 읽어** 운동의 출발값으로 삼았다. 되짚어 세운
 *   직후에는 그것이 옛 화면의 것이라 칸이 엉뚱한 줄에서 출발한다. 지금은 출발 줄을
 *   `step.wasShowing` 이 싣고 그리는 쪽이 같은 `lanesOf` 로 셈한다.
 * - `markDone()` 의 `grown = specs.filter((e) => edgeState.get(e.id) === 'tree')` —
 *   **조각의 결론을 제 칠에서 도로 읽던 자리**다. 지금은 `joins` 하나가 그림도
 *   결론도 낳는다.
 *
 * ── 수는 한 자리에서만 센다
 *
 * 화면에 뜨는 수는 전부 `joins` 와 `round` 에서 파생된다 — 후보가 몇인가도, 간선이
 * 몇 개 붙었나도, 무게 합도. algorithm 은 한때 `node` · `candidates` · `from` ·
 * `to` · `weight` · `blockedEdge` · `blockedWeight` · `edgeCount` · `total` 을
 * payload 에 실었다. 전부 **바탕과 판정에서 파생되는 것**이라 걷어냈고, 지금 payload
 * 에 오는 것은 `edge-chosen` 의 `edgeId` 하나뿐이다 — 어느 것을 고를 것인가만이
 * 걸음의 판정이기 때문이다.
 *
 * 좌표는 담지 않는다. 정점 이름과 간선의 짝·무게 같은 **구조**만 담고 자리는 그리는
 * 쪽이 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { frontierOf, lightest, outsideTree, type GrowOneTreeEdge } from './algorithm.js';

/** 간선 하나. 선언에 적힌 그대로다. */
export type GrowOneTreeSceneEdge = GrowOneTreeEdge;

/**
 * 나무에 붙은 간선 하나. **붙은 차례대로** 쌓인다.
 *
 * `from` 은 이미 나무에 있던 끝, `to` 는 새로 붙는 정점이다. 둘 다 붙일 때의
 * 나무에서 셈해 둔다 — 나중에는 양쪽 다 나무 안이라 다시 가릴 수 없다.
 *
 * 나무의 정점도 가지도 **이 목록에서만** 나온다. 가지를 따로 담아 두면 되감았을 때
 * 그 가지가 조용히 남거나 사라진다.
 */
export type GrowOneTreeJoin = { id: string; from: string; to: string };

/**
 * 이번 걸음의 견줌. **후보로 올랐다가 안 뽑힌 간선이 화면에 남는 자리**다.
 *
 * `candidates` 는 후보가 드러난 그 시점의 나무에서 셈한 것이라 걸음이 지나도
 * 다시 셈할 수 없다 — 고르고 나면 나무가 자라 경계가 달라지기 때문이다. 그래서
 * 파생이 아니라 장면이 쥐는 상태다.
 */
export type GrowOneTreeRound = {
  /** 이번에 나무 밖으로 나가던 간선 id 들. 선언 차례. */
  candidates: string[];
  /** 그중 골라진 것. 아직 고르기 전이면 `null`. */
  picked: string | null;
  /** 고른 것보다 가벼운데 나무에 닿지 않아 못 고른 간선. 없으면 `null`. */
  blocked: string | null;
};

/**
 * 캡션이 말할 것. 문안이 아니라 무엇을 말할지다.
 *
 * 인자를 하나도 담지 않는다 — 거기 들어갈 수(후보가 몇인가 · 무게 · 간선 수 ·
 * 무게 합)는 전부 그 장면의 `joins` 와 `round` 에서 나오므로, 담아 두면 같은 수를
 * 두 자리에서 세게 된다.
 */
export type GrowOneTreeCaption =
  | { kind: 'seed' }
  | { kind: 'frontier' }
  | { kind: 'pick' }
  | { kind: 'done' };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * `wasShowing` 은 이 걸음 **전에** 후보 줄에 서 있던 간선들이다. 칸이 어느 줄에서
 * 출발하는지를 앞 장면에서 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene),
 * 출발 배치를 셈할 계기값을 장면이 싣는다.
 */
export type GrowOneTreeStep =
  | { kind: 'seed' }
  | { kind: 'frontier'; wasShowing: string[] }
  | { kind: 'pick'; edgeId: string }
  | { kind: 'done'; wasShowing: string[] };

export type GrowOneTreeScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 정점 이름. 자리는 그리는 쪽이 정한다. */
  nodes: string[];
  /** 간선과 무게. 칸판의 차례도 이 차례다. */
  edges: GrowOneTreeSceneEdge[];
  /** 나무의 첫 자리. 선언에 적혀 있고 걸음이 고르지 않는다. */
  start: string;

  // ── 걸음이 고치는 것.
  /** 씨앗이 놓였는가. 놓이기 전에는 나무가 비어 있다. */
  seeded: boolean;
  /** 나무에 붙은 간선들. 나무의 정점·가지·간선 수·무게 합이 모두 여기서 나온다. */
  joins: GrowOneTreeJoin[];
  /** 이번 걸음의 견줌. 씨앗 자리와 다 자란 뒤에는 `null`. */
  round: GrowOneTreeRound | null;
  /** 나무가 다 자랐는가. 남은 간선이 흐려지는 것이 여기 달렸다 (머무는 형편). */
  finished: boolean;
  step: GrowOneTreeStep | null;
  caption: GrowOneTreeCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * `joins` · `round` · `seeded` · `finished` 는 여기 들지 않는다 — 걸음이 고치는
 * 것을 바탕으로 넘기면 되감아도 자란 나무가 그대로 남는다.
 */
type GrowOneTreeBase = Pick<GrowOneTreeScene, 'nodes' | 'edges' | 'start'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: GrowOneTreeBase): GrowOneTreeScene {
  return {
    nodes: base.nodes,
    edges: base.edges,
    start: base.start,
    seeded: false,
    joins: [],
    round: null,
    finished: false,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 정점 명부. 값만 베껴 담아 참조를 쥐지 않는다 (S-scene). */
function readNodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) out.push(item);
  }
  return out;
}

/** 간선 목록. 양 끝이 정점 명부에 있어야 한다. 값만 베껴 담는다. */
function readEdges(value: unknown, nodes: string[]): GrowOneTreeSceneEdge[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(nodes);
  const out: GrowOneTreeSceneEdge[] = [];
  for (const raw of value) {
    const e = raw as { id?: unknown; u?: unknown; v?: unknown; w?: unknown };
    if (typeof e?.id !== 'string' || typeof e.u !== 'string' || typeof e.v !== 'string') continue;
    if (typeof e.w !== 'number' || !Number.isFinite(e.w)) continue;
    if (!known.has(e.u) || !known.has(e.v)) continue;
    out.push({ id: e.id, u: e.u, v: e.v, w: e.w });
  }
  return out;
}

/**
 * 지금 나무에 든 정점. **`joins` 에서만 나온다.**
 *
 * 붙은 간선의 새 끝(`to`)이 곧 새로 나무에 든 정점이므로 따로 담을 것이 없다.
 */
export function treeNodesOf(scene: GrowOneTreeScene): Set<string> {
  const tree = new Set<string>();
  if (!scene.seeded) return tree;
  tree.add(scene.start);
  for (const j of scene.joins) tree.add(j.to);
  return tree;
}

/** 나무에 붙은 간선 id 들. 그림의 가지가 이것으로만 그려진다. */
export function treeEdgesOf(scene: GrowOneTreeScene): Set<string> {
  return new Set(scene.joins.map((j) => j.id));
}

/** 그 간선의 선언. 없으면 `null`. */
function edgeAt(edges: readonly GrowOneTreeSceneEdge[], id: string): GrowOneTreeSceneEdge | null {
  return edges.find((e) => e.id === id) ?? null;
}

export const growOneTreeScene: ScenePlan<GrowOneTreeScene> = {
  /**
   * 첫 장면은 그림만 세운다. 아직 나무가 없다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 그 안의 객체를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체다 (S-scene).
   */
  initial(initialData: unknown): GrowOneTreeScene {
    const d = (initialData ?? {}) as { nodes?: unknown; edges?: unknown; start?: unknown };
    const nodes = readNodes(d.nodes);
    const start = str(d.start);
    return atStart({
      nodes,
      edges: readEdges(d.edges, nodes),
      start: start.length > 0 ? start : (nodes[0] ?? ''),
    });
  },

  reduce(scene: GrowOneTreeScene, event: FacetRuntimeEvent): GrowOneTreeScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 시작 정점 하나가 나무가 된다. 어느 정점인지는 바탕에 적혀 있다.
      case 'tree-seeded':
        return {
          ...scene,
          seeded: true,
          round: null,
          step: { kind: 'seed' },
          caption: { kind: 'seed' },
        };

      // 지금 나무 밖으로 나가는 간선들이 드러난다. 구조에서 그대로 세어진다.
      case 'frontier-shown': {
        const candidates = frontierOf(treeNodesOf(scene), scene.edges).map((e) => e.id);
        return {
          ...scene,
          round: { candidates, picked: null, blocked: null },
          step: { kind: 'frontier', wasShowing: scene.round?.candidates ?? [] },
          caption: { kind: 'frontier' },
        };
      }

      // 후보 중 하나가 골라져 나무가 한 자리 자란다. 나머지 후보는 그대로 서 있다 —
      // "가장 가벼운 것" 의 *가장* 이 그 견줌에서만 읽힌다.
      case 'edge-chosen': {
        const edgeId = str(p.edgeId);
        const round = scene.round;
        if (round === null || !round.candidates.includes(edgeId)) return scene;
        const spec = edgeAt(scene.edges, edgeId);
        if (spec === null) return scene;

        // 고치기 **전**의 나무. 나무 쪽 끝과 "못 고른 더 가벼운 것" 이 여기서 갈린다.
        const tree = treeNodesOf(scene);
        const from = tree.has(spec.u) ? spec.u : spec.v;
        const to = from === spec.u ? spec.v : spec.u;
        const blocked = lightest(scene.edges.filter((e) => outsideTree(tree, e) && e.w < spec.w));

        return {
          ...scene,
          joins: [...scene.joins, { id: edgeId, from, to }],
          round: { ...round, picked: edgeId, blocked: blocked?.id ?? null },
          step: { kind: 'pick', edgeId },
          caption: { kind: 'pick' },
        };
      }

      // 나무가 다 자랐다. 고를 것이 남지 않으므로 후보 줄이 빈다.
      case 'done':
        return {
          ...scene,
          round: null,
          finished: true,
          step: { kind: 'done', wasShowing: scene.round?.candidates ?? [] },
          caption: { kind: 'done' },
        };

      // 처음 자리로. 자란 나무도 후보도 함께 사라진다.
      case 'rewind':
        return atStart({ nodes: scene.nodes, edges: scene.edges, start: scene.start });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
