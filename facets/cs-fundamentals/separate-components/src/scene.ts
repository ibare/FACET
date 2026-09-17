/**
 * separateComponents 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 정점이 한 줄로 서고 간선이 그 사이를 잇는다. 걸음마다 달라지는 것은 둘이다 —
 * **어느 정점이 어느 무리에 들었는가**, 그리고 탐색 커서가 어디에 앉았는가.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었다. 상태는 전부 stage 쪽, 그것도 DOM 의 칠과
 * 속성에 있었다.
 *
 * - `NodeVisual.component` — **이 조각의 주장 그 자체**다. 어느 것이 한 무리인가를
 *   말하는 유일한 자리인데 `seed()` · `spread()` 명령의 부수 효과로만 켜졌고,
 *   되돌리는 길은 `build()` 로 통째로 다시 짓는 것뿐이었다. 즉 소속이 화면의 칠에만
 *   있어 되짚으면 주장이 사라진다. 이제 `lit` 이 쥐고 정적 그리기도 그것으로 칠한다.
 * - `gMarks` 에 쌓이던 **도장** — 몇 번 출발했는가. 되돌리는 명령이 없어 칠이
 *   쌓이던 자리인데, 그 누적이 곧 정보였다 (덩어리 수). 이제 `lit` 에서 파생한다
 *   (`groupsOf`) — 따로 담으면 소속과 두 자리에서 세는 꼴이 된다.
 * - `cursorX` · `cursorR` — 커서가 어디에 얼마만큼 벌어져 있나. `spread()` 는
 *   `cursorStart = cursorX` 로, `sweepEnd()` 는 `startR = cursorR` 로 **화면을 도로
 *   읽어** 운동의 출발값을 삼았다. 되짚어 세운 직후에는 그 값이 옛 화면의 것이라
 *   운동이 엉뚱한 데서 출발한다. 이제 커서가 앉은 **정점**을 `cursor` 가 말하고,
 *   운동의 출발 자리는 `step` 이 계기값(`cursorWas`)으로 싣는다.
 * - `NodeVisual.dy` — 출렁임 오프셋. 간선의 끝점 셈(`nodeYOf` → `pathOf`)이 이것을
 *   타서 **애니메이션 진행도가 화면 기하를 정했다.** 장면에는 담지 않는다 — 지나가는
 *   몸짓이라 그리는 쪽이 프레임 안에서만 쥔다.
 * - `renderEdges()` 의 `bothLit` — 간선이 켜졌나를 두 끝의 소속에서 갈랐다. 파생이
 *   옳은 모양이라 그대로 두되, 같은 무리인지까지 본다 (`ca === cb`).
 *
 * ── 수는 한 자리에서만 센다
 *
 * 화면에 뜨는 수는 전부 소속(`lit`)에서 파생된다 — 몇 번 출발했나도, 몇 개가
 * 켜졌나도, 무리의 크기도. "무리 셋" 이라는 글과 실제로 갈린 덩어리가 나란히
 * 보이는 조각이라 두 출처를 쓰면 언젠가 갈린다.
 *
 * algorithm 도 한때 `round` · `component` · `lit` · `remaining` · `size` · `sizes` ·
 * `starts` · `total` 을 payload 에 실었다. 장면이 하나도 쓰지 않는데 실려 있으면
 * 다음 사람이 "있으니 쓰자" 고 집는 순간 출처가 둘이 되므로, **발신 쪽에서 걷어냈다.**
 * 이제 payload 에 오는 것은 **누가 켜졌나**뿐이다 (`node` · `from` · `to`).
 *
 * 좌표는 담지 않는다. 정점의 차례만 담고 자리는 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 무방향 간선 하나. */
export type ComponentEdge = { a: string; b: string };

/** 그림의 바탕. 걸음이 고치지 않는다. */
export type ComponentGraph = {
  nodes: string[];
  edges: ComponentEdge[];
};

/**
 * 켜진 정점 하나. **켜진 차례대로** 쌓인다.
 *
 * 차례가 뜻을 갖는다 — 한 무리에서 맨 앞에 선 것이 곧 그 무리의 출발점이고,
 * 출발점의 수가 곧 덩어리의 수다 (`groupsOf`).
 */
export type LitNode = { id: string; component: number };

/**
 * 이번 걸음에 달라진 것. 흐르게 할 것을 고르는 표식이자 **출발 그림의 계기값**이다.
 *
 * `cursorWas` 는 커서가 이 걸음 전에 앉아 있던 정점이다. 앞 장면을 그리기 재료로
 * 쓰면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), 출발 자리를 장면이 싣는다.
 *
 * 되짚기(`animate` 거짓)에서는 쳐다보지 않는다.
 */
export type SeparateComponentsStep =
  | { kind: 'seed'; node: string }
  | { kind: 'spread'; from: string; to: string; cursorWas: string | null }
  | { kind: 'sweepEnd'; cursorWas: string | null };

/**
 * 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다.
 *
 * `remains` 와 `done` 은 인자를 담지 않는다 — 거기 들어갈 수는 전부 그 장면의
 * 소속에서 나오므로, 담아 두면 같은 수를 두 자리에서 세게 된다.
 */
export type SeparateComponentsCaption =
  | { kind: 'start'; node: string }
  | { kind: 'restart' }
  | { kind: 'remains' }
  | { kind: 'done' };

export type SeparateComponentsScene = {
  /** 정점과 간선. 걸음이 고치지 않는 바탕이고 되감기가 여기로 돌아간다. */
  graph: ComponentGraph;
  /**
   * 켜진 정점들. 이 조각이 화면에 대해 아는 **거의 전부**다.
   *
   * 어느 것이 한 무리인가가 주장이라, 소속이 칠에만 남으면 되짚었을 때 주장이
   * 사라진다. 그래서 장면이 직접 쥐고 정적 그리기도 이것으로 칠한다. 색은 그리는
   * 쪽이 `component` 에서 정한다 — 여기에 색은 없다.
   */
  lit: LitNode[];
  /** 탐색 커서가 앉은 정점. 한 번의 탐색이 끝나면 `null` 이다. */
  cursor: string | null;
  step: SeparateComponentsStep | null;
  caption: SeparateComponentsCaption | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 초기 자료의 정점 목록을 **값으로 복사**한다. 참조를 쥐지 않는다 (S-scene). */
function nodeList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.length > 0) out.push(item);
  }
  return out;
}

/** `[a, b]` 두 칸짜리 배열들을 간선 목록으로. 양 끝이 정점 명부에 있어야 한다. */
function edgeList(v: unknown, nodes: string[]): ComponentEdge[] {
  if (!Array.isArray(v)) return [];
  const known = new Set(nodes);
  const out: ComponentEdge[] = [];
  for (const raw of v) {
    if (!Array.isArray(raw)) continue;
    const a = str(raw[0]);
    const b = str(raw[1]);
    if (a.length === 0 || b.length === 0) continue;
    if (!known.has(a) || !known.has(b)) continue;
    out.push({ a, b });
  }
  return out;
}

/** 정점 → 무리 번호. 켜지지 않은 정점은 들어 있지 않다. */
export function componentOf(lit: LitNode[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of lit) map.set(n.id, n.component);
  return map;
}

/** 무리 하나 — 어디서 출발했고, 몇 번 무리이고, 몇이 켜졌나. */
export type ComponentGroup = {
  /** 이 무리에서 맨 먼저 켜진 정점. 출발선의 도장이 여기 찍힌다. */
  start: string;
  component: number;
  size: number;
};

/**
 * 켜진 차례를 무리별로 접는다. **화면에 뜨는 수는 전부 여기서 나온다** —
 * 몇 번 출발했나(`length`) · 무리의 크기(`size`) · 도장이 설 자리(`start`).
 *
 * 한때 출발점을 세는 함수와 크기를 세는 함수가 따로 있었다. 둘이 언제나 같은 수를
 * 내놓긴 했지만 크기 쪽이 무리 번호 `0..last` 를 채우는 식이라, **번호에 구멍이
 * 나면 0 짜리 칸이 끼어 갈린다.** 한 번 훑어 한 목록을 내놓으면 갈릴 자리가 없다.
 */
export function groupsOf(lit: LitNode[]): ComponentGroup[] {
  const out: ComponentGroup[] = [];
  /** 무리 번호 → `out` 의 자리. 번호가 띄엄띄엄해도 그대로 접힌다. */
  const at = new Map<number, number>();
  for (const n of lit) {
    const i = at.get(n.component);
    if (i === undefined) {
      at.set(n.component, out.length);
      out.push({ start: n.id, component: n.component, size: 1 });
      continue;
    }
    out[i].size += 1;
  }
  return out;
}

/**
 * 처음 자리로 돌아간 장면. `initial` 과 되감기가 같은 자리를 쓴다.
 *
 * 바탕은 `graph` **하나뿐**이다. 걸음이 고치는 것(`lit` · `cursor`)을 여기로 넘기면
 * 되감은 화면에 지난 주행의 소속이 남는다 — 되감기 갈래가 걸음의 결과를 바탕으로
 * 삼는 그 함정이다. 타입으로 좁혀 두고 호출부는 객체 리터럴로 넘겨 초과 속성
 * 검사가 실제로 돌게 한다.
 */
function atStart(base: Pick<SeparateComponentsScene, 'graph'>): SeparateComponentsScene {
  return {
    graph: base.graph,
    lit: [],
    cursor: null,
    step: null,
    caption: null,
  };
}

export const separateComponentsScene: ScenePlan<SeparateComponentsScene> = {
  /**
   * 첫 장면은 바탕만 세운다. 아직 아무것도 켜지지 않았다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체다 (S-scene).
   */
  initial(initialData: unknown): SeparateComponentsScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const nodes = nodeList(d.nodes);
    return atStart({ graph: { nodes, edges: edgeList(d.edges, nodes) } });
  },

  reduce(scene: SeparateComponentsScene, event: FacetRuntimeEvent): SeparateComponentsScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 아직 켜지지 않은 곳에서 새로 출발한다. 새 무리가 열린다.
      case 'seed': {
        const node = str(p.node);
        if (node.length === 0) return scene;
        if (scene.lit.some((n) => n.id === node)) return scene;
        // 무리 번호는 payload 가 아니라 지금까지 열린 무리 수에서 나온다.
        const component = groupsOf(scene.lit).length;
        return {
          ...scene,
          lit: [...scene.lit, { id: node, component }],
          cursor: node,
          step: { kind: 'seed', node },
          caption: component === 0 ? { kind: 'start', node } : { kind: 'restart' },
        };
      }

      // 불빛이 간선을 타고 건너간다. 도착한 정점은 **출발한 쪽의 무리**에 든다.
      case 'spread': {
        const from = str(p.from);
        const to = str(p.to);
        if (from.length === 0 || to.length === 0) return scene;
        const component = componentOf(scene.lit).get(from);
        if (component === undefined) return scene;
        if (scene.lit.some((n) => n.id === to)) return scene;
        return {
          ...scene,
          lit: [...scene.lit, { id: to, component }],
          cursor: from,
          step: { kind: 'spread', from, to, cursorWas: scene.cursor },
          caption: scene.caption,
        };
      }

      // 한 번의 탐색이 끝났다. 커서를 걷는다. 켜지지 않은 것들은 그대로 남는다.
      case 'sweep-end': {
        const remaining = scene.graph.nodes.length - scene.lit.length;
        return {
          ...scene,
          cursor: null,
          step: { kind: 'sweepEnd', cursorWas: scene.cursor },
          // 남은 것이 있을 때만 말한다. 그것이 이 조각의 주장이다.
          caption: remaining > 0 ? { kind: 'remains' } : scene.caption,
        };
      }

      // 할 말을 마쳤다. 화면은 그대로 두고 캡션만 갈린다.
      case 'done':
        return { ...scene, step: null, caption: { kind: 'done' } };

      // 처음 자리로. 켜진 것도 커서도 도장도 함께 사라진다.
      case 'rewind':
        return atStart({ graph: scene.graph });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
