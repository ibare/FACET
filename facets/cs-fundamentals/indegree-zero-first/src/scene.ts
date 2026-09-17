/**
 * indegreeZeroFirst 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 위에는 그래프가, 아래에는 나온 차례를 담는 줄이 있다. 정점이 이고 있는 화살의
 * 수가 머리 위 배지로 보이고, 그 수가 0 이 되어야 정점이 아래 줄로 떨어진다.
 *
 * ── 진입 차수는 어디에도 적어 두지 않는다
 *
 * **이 조각의 알맹이는 배지의 수이고, 그것이 가장 위험한 자리였다.** 옮기기 전에는
 * 그 수가 오직 배지의 `textContent` 에만 있었고, 다음 수는 `arrows-dropped` 가
 * 실어 오는 `was`/`now` 에서 왔다 — **같은 물음에 답이 둘**이었다.
 *
 * 여기서는 아예 담지 않는다. 진입 차수는 **구조에서 세진다** —
 * `indegreeOf(edges, droppedFrom, id)` 가 바탕 간선에서 "아직 안 떨어진 화살" 만
 * 센다. 그래서 어느 걸음에서 보든 답이 하나다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었고 stage 의 `let` 은 전부 DOM 손잡이와
 * 배치 상수였다. 상태는 **타입 선언** 안에 있었다 (프로토콜 3-1 의 ⑤).
 *
 * - **`NodeVisual.taken: boolean`** — 이 정점이 이미 떨어졌나. DOM 손잡이
 *   (`g`·`circle`·`label`) 와 한 객체에 묶여 있었고, `markReady` 가 `!n.taken`
 *   으로 갈렸다. 이제 `order` 가 말한다 — 차례까지 함께.
 * - **`NodeVisual.at: Pt`** — 좌표처럼 생겼지만 실은 **어느 단계에 있나**였다.
 *   `takeVertex` 가 `node.at = landing` 으로 제자리에서 고쳤고, `finish` 가 그
 *   값을 도로 읽어 흔들 자리를 정했다. 이제 자리는 `order` 에서 파생된다.
 * - **`NodeVisual.badge: BadgeVisual | null`** — `null` 이 곧 "이미 꺼내져 배지가
 *   없다" 였다. `dropArrows` 가 `if (!node?.badge) continue` 로 갈렸다.
 * - **`BadgeVisual.label.textContent`** — 위에 적은 거리표 그 자체.
 * - **`edgeMap` 에 남아 있는 것** — 아직 안 떨어진 화살. `dropArrows` 가
 *   `edgeMap.delete` 로 지웠다. 진입 차수의 출처가 DOM 컬렉션이었다.
 *   이제 `droppedFrom` 이 말한다.
 * - **`badge.g.style.opacity`** — 배지가 이미 떴나. 이제 `counted` 가 말한다.
 *
 * ── 층의 경계를 화면에 남긴다
 *
 * `layer-discovered` 는 "같은 순간에 꺼낼 수 있게 된 집합" 인데, 옮기기 전에는 그
 * 집합을 노란 칠로 잠깐 말하고 정점이 떨어지면 그 칠이 덮여 **완주 화면에 층의
 * 자취가 하나도 남지 않았다.** 이 조각의 주장이 바로 그 층이다. 그래서 `layers`
 * 를 장면에 두고, 아래 줄에서 층이 바뀌는 자리에 칸막이를 세운다.
 *
 * 좌표는 담지 않는다. 정점과 간선 같은 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 방향 간선 하나. `from` 에서 `to` 로 들어간다. */
export type IndegreeZeroFirstSceneEdge = { from: string; to: string };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 계기값을 싣지 않는다 — 이 조각은 출발 그림을 전부 `next` 에서 되셈할 수 있다.
 * 떨어지기 전의 자리는 그래프 자리이고, 줄기 전의 수는 "지금 수 + 이번에 떨어진
 * 화살의 수" 다. 둘 다 장면에 있다. 그래서 `render` 가 `prev` 를 들추지 않는다.
 */
export type IndegreeZeroFirstStep =
  | { kind: 'count' }
  | { kind: 'ready'; nodes: readonly string[] }
  | { kind: 'take'; id: string }
  | { kind: 'drop'; from: string }
  | { kind: 'done' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type IndegreeZeroFirstCaption =
  | { kind: 'count' }
  | { kind: 'startReady'; ids: readonly string[] }
  | { kind: 'newReady'; ids: readonly string[] }
  | { kind: 'take'; id: string }
  | { kind: 'drop'; from: string }
  | { kind: 'done' };

export type IndegreeZeroFirstScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 정점 이름. 층과 자리는 그리는 쪽이 간선을 보고 셈한다. */
  nodes: readonly string[];
  /** 방향 간선. 진입 차수가 여기서 나온다. */
  edges: readonly IndegreeZeroFirstSceneEdge[];

  // ── 걸어온 자취.
  /** 머리 위 배지가 떴나. 첫 걸음이 세기 전에는 아직 아무 수도 보이지 않는다. */
  counted: boolean;
  /** 걸어 두었던 화살이 이미 떨어진 정점. **진입 차수는 여기서 셈해진다.** */
  droppedFrom: readonly string[];
  /** 아래 줄에 내려앉은 차례. 칸 번호가 곧 이 배열의 인덱스다. */
  order: readonly string[];
  /** 드러난 차례대로의 층 — 같은 순간에 꺼낼 수 있게 된 집합. 남는 자취다. */
  layers: readonly (readonly string[])[];
  step: IndegreeZeroFirstStep | null;
  caption: IndegreeZeroFirstCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * `counted`·`droppedFrom`·`order`·`layers` 는 여기 들지 않는다 — 전부 걸어오며
 * 쌓은 것이라 되감기에 그대로 넘기면 되감은 화면이 이미 다 굴러간 채로 선다.
 * 특히 **진입 차수는 걸음이 고치는 것이라 바탕이 아니다.** 바탕은 간선뿐이고,
 * 되감은 뒤의 수는 그 간선에서 다시 세진다.
 */
type IndegreeZeroFirstBase = Pick<IndegreeZeroFirstScene, 'nodes' | 'edges'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: IndegreeZeroFirstBase): IndegreeZeroFirstScene {
  return {
    nodes: base.nodes,
    edges: base.edges,
    counted: false,
    droppedFrom: [],
    order: [],
    layers: [],
    step: null,
    caption: null,
  };
}

/**
 * 그 정점이 아직 이고 있는 화살의 수.
 *
 * 바탕 간선에서 "떨어져 나간 것" 을 뺀다. 화면과 캡션과 판정이 전부 이 한 함수를
 * 지나므로 같은 물음에 답이 둘일 수 없다.
 */
export function indegreeOf(
  edges: readonly IndegreeZeroFirstSceneEdge[],
  droppedFrom: readonly string[],
  id: string,
): number {
  let count = 0;
  for (const edge of edges) {
    if (edge.to !== id) continue;
    if (droppedFrom.includes(edge.from)) continue;
    count += 1;
  }
  return count;
}

/** 아직 걸려 있는 화살. 떨어진 정점이 걸어 두었던 것은 빠진다. */
export function liveEdges(
  scene: Pick<IndegreeZeroFirstScene, 'edges' | 'droppedFrom'>,
): IndegreeZeroFirstSceneEdge[] {
  return scene.edges.filter((edge) => !scene.droppedFrom.includes(edge.from));
}

/** 그 정점이 몇 번째 층에서 드러났나. 아직 안 드러났으면 `null`. */
export function layerOf(
  layers: readonly (readonly string[])[],
  id: string,
): number | null {
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].includes(id)) return i;
  }
  return null;
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** 넘겨받은 선언에서 간선 목록을 좁힌다. 값만 베껴 담아 참조를 쥐지 않는다. */
function readEdges(value: unknown): IndegreeZeroFirstSceneEdge[] {
  if (!Array.isArray(value)) return [];
  const edges: IndegreeZeroFirstSceneEdge[] = [];
  for (const item of value) {
    const edge = item as { from?: unknown; to?: unknown };
    if (typeof edge?.from !== 'string' || typeof edge?.to !== 'string') continue;
    edges.push({ from: edge.from, to: edge.to });
  }
  return edges;
}

export const indegreeZeroFirstScene: ScenePlan<IndegreeZeroFirstScene> = {
  /**
   * 첫 장면은 그래프만 세운다. 배지도 차례도 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 그 안의 객체를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): IndegreeZeroFirstScene {
    const d = (initialData ?? {}) as { nodes?: unknown; edges?: unknown };
    return atStart({ nodes: names(d.nodes), edges: readEdges(d.edges) });
  },

  reduce(scene: IndegreeZeroFirstScene, event: FacetRuntimeEvent): IndegreeZeroFirstScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 머리 위에 수가 얹힌다. 수 자체는 싣지 않는다 — 간선에서 세진다.
      case 'indegrees-counted':
        return {
          ...scene,
          counted: true,
          step: { kind: 'count' },
          caption: { kind: 'count' },
        };

      // 같은 순간에 꺼낼 수 있게 된 집합 하나. 몇 번째 층인가는 장면이 센다.
      case 'layer-discovered': {
        const nodes = names(p.nodes);
        if (nodes.length === 0) return scene;
        const first = scene.layers.length === 0;
        return {
          ...scene,
          layers: [...scene.layers, nodes],
          step: { kind: 'ready', nodes },
          caption: first ? { kind: 'startReady', ids: nodes } : { kind: 'newReady', ids: nodes },
        };
      }

      // 이고 있는 것이 없으니 아래 줄로 떨어진다. 칸 번호는 자취의 길이가 말한다.
      case 'dequeue': {
        const id = str(p.id);
        if (id === '') return scene;
        return {
          ...scene,
          order: [...scene.order, id],
          step: { kind: 'take', id },
          caption: { kind: 'take', id },
        };
      }

      // 빠진 정점이 걸어 두었던 화살이 한꺼번에 떨어진다. 어느 화살인지는
      // 바탕이 이미 안다 — `from` 에서 나가는 것 전부다.
      case 'arrows-dropped': {
        const from = str(p.from);
        if (from === '') return scene;
        return {
          ...scene,
          droppedFrom: [...scene.droppedFrom, from],
          step: { kind: 'drop', from },
          caption: { kind: 'drop', from },
        };
      }

      // 다 나왔다. 아래 줄에 다섯이 층의 경계와 함께 남는다.
      case 'done':
        return { ...scene, step: { kind: 'done' }, caption: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 거둔다. 좁힌 타입이 실제로 막게 객체 리터럴로 넘긴다.
        return atStart({ nodes: scene.nodes, edges: scene.edges });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
