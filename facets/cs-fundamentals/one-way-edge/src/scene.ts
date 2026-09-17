/**
 * oneWayEdge 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 무엇으로 정해지나
 *
 * 다섯 정점이 고리 위에 놓이고 선마다 **차선 둘**이 나란히 눕는다. 논증은 세
 * 마디다 — 화살 없이 걸어 전부 닿는 것을 보이고, 같은 다섯 선에 화살이 붙으며
 * 거스르는 차선이 떨어져 나가고, 다시 걸으면 한 정점이 남는다.
 *
 * 그러니 걸음마다 달라지는 것은 넷이다 — **어느 모드인가**, **어디까지 닿았나**,
 * **어느 자리에서 되튀었나**, **무엇이 고리 밖으로 밀려났나**.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었다 (①③ 0 건). 상태는 전부 stage 쪽이었고,
 * 그중 가장 무거운 것은 **모드를 말하는 변수가 아예 없다**는 사실이었다.
 *
 * - **`lanes: Lane[]` 의 길이와 구성이 곧 모드였다.** `Lane` 은
 *   `{ from, to, off, opacity, cut, line, head }` — DOM 손잡이(`line`·`head`)와
 *   뜻·수치(`off`·`cut`)가 한 객체에 묶여 있고, `cutEdge` 가 끝나면
 *   `lanes = lanes.filter(l => l !== drop)` 로 **배열에서 지웠다.** 즉 "화살이
 *   붙었나" 를 화면이 *차선이 열 개냐 다섯 개냐* 로 기억했다. 되돌릴 길이 없다.
 *   이제 `mode` 가 말하고 차선은 거기서 파생된다.
 * - **`state: Map<string, NodeState>`** — 어느 정점에 닿았나. `walk()` 명령의
 *   부수 효과로만 켜졌고 되돌리는 길은 `build()` 로 통째로 다시 짓는 것뿐이었다.
 *   이제 `reached` 가 **밟은 차례대로** 쥔다 — 차례가 뜻을 갖는다 (맨 앞이 출발점).
 * - **`pos: Map<string, Point>`** — `const` 로 묶인 Map 인데 `pushOut()` 이
 *   `pos.set(node, …)` 로 **제자리에서 고쳤다.** 밀려난 거리가 여기 쌓여 있어
 *   `let` grep 을 통과한다. 이제 `pushed` 만 담고 자리는 그리는 쪽이 셈한다.
 * - **`findLane(from, to)` 의 `!l.cut`** — "이 차선이 아직 살아 있나" 로 갈리던
 *   암묵 분기. 정적 그리기가 매번 전부 새로 만들므로 그 분기가 사라진다.
 * - **`walk()` 의 `if (state.get(to) !== 'source')`** — 같은 자리. 이제 출발점은
 *   `reached[0]` 이라 견줄 것이 없다.
 *
 * ── 이행이 고치는 화면 결함 — 되튄 자리가 남지 않았다
 *
 * 이 조각의 주장은 "화살이 붙으면 되돌아오는 길이 사라진다" 이고, 그것이 화면에
 * 드러나는 자리는 **막혀서 못 들어간 곳**이다. 그런데 옛 `probe()` 는 점과 막이
 * 나갔다 되튀고 `dot.remove(); wall.remove()` 로 **둘 다 지웠다.** 완주 화면에는
 * C 가 밖으로 밀려나 있을 뿐, *왜* 못 들어가는지를 말하는 표식이 하나도 없었다
 * (되짚기 이전에 이미 주장이 안 보였다).
 *
 * 그래서 `blocked` 를 장면이 쥐고 정적 그리기가 **막음 표식을 세운다.** 되튀는
 * 점은 지나가고 막음 표식은 남는다.
 *
 * ── 수는 한 자리에서만 센다
 *
 * 화면에 뜨는 수는 전부 이 장면의 구조에서 나온다 — 닿은 정점 수는
 * `reached.length`, 전체는 `nodes.length`, 선 수는 `edges.length`, 남은 정점은
 * `strandedOf`. algorithm 이 한때 `source` · `lines` · `reached` · `total` ·
 * `stranded` · `from` 을 payload 에 실었는데, 장면이 하나도 안 읽는데 실려 있으면
 * 다음 사람이 "있으니 쓰자" 고 집는 순간 출처가 둘이 되므로 **발신 쪽에서
 * 걷어냈다.** 이제 payload 에 오는 것은 걸음이 내리는 판정뿐이다
 * (`mode` · `from`/`to` · `node`).
 *
 * 좌표는 담지 않는다. 고리 위의 차례와 밀려났는지 여부만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { directedEnds, type OneWayEdgeLine } from './algorithm.js';

/** 그림 전체의 국면. 화살이 없는 동안과 붙은 뒤. */
export type OneWayEdgeMode = 'undirected' | 'directed';

/**
 * 들어가려다 되튄 자리. **남는 표식**이라 정적 그리기에도 들어간다.
 *
 * `from` 은 그 정점과 선을 나눠 갖지만 화살이 반대라 들어갈 수 없는, 이미 닿은
 * 정점들이다. 걸음이 실어 오지 않는다 — 바탕(`edges`)과 자취(`reached`) 에서
 * 나오므로 여기서 한 번 센다.
 */
export type OneWayEdgeBlock = { node: string; from: readonly string[] };

/**
 * 이번 걸음에 달라진 것. 무엇을 흐르게 할지 **고르는 데만** 쓴다.
 *
 * 출발 그림은 `prev` 에서 꺼내지 않는다 (S-scene). 이 조각은 출발 자리를 전부
 * `next` 에서 되셈할 수 있어 계기값을 따로 실을 것이 없다 — 밀려나는 정점의
 * 출발 자리는 고리 위 제자리이고, 끊기는 차선의 출발 자리는 무방향 배치이며,
 * 둘 다 장면의 구조가 말한다.
 */
export type OneWayEdgeStep =
  | { kind: 'mode'; mode: OneWayEdgeMode }
  | { kind: 'walk'; from: string; to: string }
  | { kind: 'blocked'; node: string }
  | { kind: 'push'; node: string };

/**
 * 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다.
 *
 * `openReach` 와 `stranded` 는 인자를 담지 않는다 — 거기 들어갈 수는 전부 그
 * 장면의 구조에서 나오므로, 담아 두면 같은 수를 두 자리에서 세게 된다.
 */
export type OneWayEdgeCaption =
  | { kind: 'undirected' }
  | { kind: 'openReach' }
  | { kind: 'directed' }
  | { kind: 'blocked'; node: string }
  | { kind: 'stranded' };

export type OneWayEdgeScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 정점 이름. 고리 위의 차례가 이 순서다. */
  nodes: readonly string[];
  /** 선 다섯. `dir` 은 화살이 붙었을 때 이 선이 어디로 향하는가다. */
  edges: readonly OneWayEdgeLine[];
  /** 답사의 출발점. */
  source: string;

  // ── 걸어온 자취.
  /** 화살이 붙었나. 차선이 몇 개인지는 여기서 파생된다. */
  mode: OneWayEdgeMode;
  /** 닿은 정점, **밟은 차례대로**. 맨 앞이 출발점이다. 비었으면 아직 답사 전. */
  reached: readonly string[];
  /** 되튄 자리. **남는 표식**이라 정적으로도 그린다 (S-scene PREFER). */
  blocked: readonly OneWayEdgeBlock[];
  /** 고리 밖으로 밀려난 정점. */
  pushed: readonly string[];
  step: OneWayEdgeStep | null;
  caption: OneWayEdgeCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면과 되감기가 함께 쓴다.
 *
 * 모드도 자취도 **여기 들지 않는다** — 걸어오며 쌓은 것이라 되감기에 그대로
 * 넘기면 되감은 화면이 이미 화살이 붙은 채로 선다. 타입으로 좁혀 두고 호출부는
 * 객체 리터럴로 넘겨 초과 속성 검사가 실제로 돌게 한다.
 */
type OneWayEdgeBase = Pick<OneWayEdgeScene, 'nodes' | 'edges' | 'source'>;

/** 처음 자리로 돌아간 장면. 화살도 자취도 없는 고리 하나. */
function atStart(base: OneWayEdgeBase): OneWayEdgeScene {
  return {
    nodes: base.nodes,
    edges: base.edges,
    source: base.source,
    mode: 'undirected',
    reached: [],
    blocked: [],
    pushed: [],
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 정점 명부를 **값으로 복사**한다. 참조를 쥐지 않는다 (S-scene). */
function nodeList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.length > 0) out.push(item);
  }
  return out;
}

/** 선 목록을 좁힌다. 값만 베껴 담아 넘겨받은 배열을 쥐지 않는다. */
function edgeList(v: unknown, nodes: string[]): OneWayEdgeLine[] {
  if (!Array.isArray(v)) return [];
  const known = new Set(nodes);
  const out: OneWayEdgeLine[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const e = raw as { u?: unknown; v?: unknown; dir?: unknown };
    if (typeof e.u !== 'string' || typeof e.v !== 'string') continue;
    if (e.dir !== 'uv' && e.dir !== 'vu') continue;
    if (!known.has(e.u) || !known.has(e.v)) continue;
    out.push({ u: e.u, v: e.v, dir: e.dir });
  }
  return out;
}

/**
 * 화살이 붙었을 때 **살아남는 차선**. 거스르는 차선은 이것의 반대다.
 *
 * 방향을 화면에서 도로 읽지 않기 위한 유일한 통로다. `dir` 을 푸는 셈은
 * algorithm 의 `directedEnds` 하나뿐이고 그리는 쪽도 그것을 부른다 — 두 자리에서
 * 풀면 화살이 가리키는 쪽과 걸어가는 쪽이 언젠가 갈린다.
 */
export function keptLane(line: OneWayEdgeLine): { from: string; to: string } {
  return directedEnds(line);
}

/**
 * `node` 와 선을 나눠 갖지만 화살이 반대라 들어올 수 없는, 이미 닿은 정점들.
 *
 * 바탕과 자취만 보는 순수 함수다. 한때 algorithm 이 같은 셈을 해 payload 에
 * 실었는데, 그 문을 열어 두면 화면과 발신이 두 자리에서 세게 된다.
 */
export function blockedNeighborsOf(
  edges: readonly OneWayEdgeLine[],
  node: string,
  reached: readonly string[],
): string[] {
  const out: string[] = [];
  for (const line of edges) {
    const other = line.u === node ? line.v : line.v === node ? line.u : null;
    if (other === null || !reached.includes(other)) continue;
    if (!out.includes(other)) out.push(other);
  }
  return out;
}

/** 이 답사에서 닿지 못한 정점들. 캡션의 수도 밀려날 자리도 여기서 나온다. */
export function strandedOf(scene: OneWayEdgeScene): string[] {
  return scene.nodes.filter((n) => !scene.reached.includes(n));
}

export const oneWayEdgeScene: ScenePlan<OneWayEdgeScene> = {
  /**
   * 첫 장면은 고리만 세운다. 화살도 없고 아직 아무 데도 밟지 않았다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 그 안의 객체를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체다 (S-scene).
   */
  initial(initialData: unknown): OneWayEdgeScene {
    const d = (initialData ?? {}) as { nodes?: unknown; edges?: unknown; source?: unknown };
    const nodes = nodeList(d.nodes);
    const source = str(d.source);
    return atStart({
      nodes,
      edges: edgeList(d.edges, nodes),
      source: nodes.includes(source) ? source : (nodes[0] ?? ''),
    });
  },

  reduce(scene: OneWayEdgeScene, event: FacetRuntimeEvent): OneWayEdgeScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 그림 전체가 국면을 옮긴다. 답사는 출발점 하나만 밟은 자리에서 다시 선다.
      case 'mode-changed': {
        const mode: OneWayEdgeMode = p.mode === 'directed' ? 'directed' : 'undirected';
        return {
          ...scene,
          mode,
          reached: scene.source.length === 0 ? [] : [scene.source],
          blocked: [],
          pushed: [],
          step: { kind: 'mode', mode },
          caption: mode === 'directed' ? { kind: 'directed' } : { kind: 'undirected' },
        };
      }

      // 한 걸음 건너가 `to` 를 처음 밟는다. 자취가 하나 자란다.
      case 'walk-step': {
        const from = str(p.from);
        const to = str(p.to);
        if (from.length === 0 || to.length === 0) return scene;
        if (scene.reached.includes(to)) return scene;
        return {
          ...scene,
          reached: [...scene.reached, to],
          step: { kind: 'walk', from, to },
        };
      }

      // 한 차례 답사가 끝났다. 화면은 그대로 두고 캡션이 셈을 말한다.
      case 'walk-done':
        return { ...scene, step: null, caption: { kind: 'openReach' } };

      // 들어가려던 시도가 되튄다. 막음 표식이 여기서부터 남는다.
      case 'walk-blocked': {
        const node = str(p.node);
        if (node.length === 0) return scene;
        const from = blockedNeighborsOf(scene.edges, node, scene.reached);
        return {
          ...scene,
          blocked: [...scene.blocked.filter((b) => b.node !== node), { node, from }],
          step: { kind: 'blocked', node },
          caption: { kind: 'blocked', node },
        };
      }

      // 닿지 못한 정점이 고리 밖으로 밀려난다. 나가는 화살은 늘어난 채 남는다.
      case 'push-out': {
        const node = str(p.node);
        if (node.length === 0 || scene.pushed.includes(node)) return scene;
        return {
          ...scene,
          pushed: [...scene.pushed, node],
          step: { kind: 'push', node },
        };
      }

      // 할 말을 마쳤다. 화면은 그대로 두고 캡션만 갈린다.
      case 'done':
        return { ...scene, step: null, caption: { kind: 'stranded' } };

      // 처음 자리로. 화살도 자취도 막음 표식도 함께 사라진다.
      case 'rewind':
        return atStart({ nodes: scene.nodes, edges: scene.edges, source: scene.source });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
