/**
 * diveThenBacktrack 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * ── 이 조각이 말하려는 것과, 옛 화면이 그것을 지우던 자리
 *
 * 주장은 "한 줄기를 끝까지 파고들었다가 왔던 길을 거슬러 나온다" 이고, 그것이
 * 보이려면 **어디까지 파고들었다가 어디서 물러났는지**가 완주 화면에 남아야 한다.
 * 옛 명령형 무대에서는 셋 다 남지 않았다.
 *
 * - **지나온 자국**이 물러나는 걸음마다 줄어들어, 다 끝나면 모든 간선이 똑같이
 *   "닫힌 길" 이 되었다. 내려간 걸음과 올라온 걸음이 화면에서 구별되지 않는다.
 * - **가장 깊이 내려간 깊이**는 `done` 의 payload 로 실려 오는데 projector 가
 *   읽지도 않았다 — 설명글이 "필요한 기억 공간은 가장 깊이 내려간 깊이를 따른다"
 *   고 못박는데 그 수가 화면 어디에도 없었다.
 * - **되짚은 횟수**는 캡션의 문장에만 있었고 그림의 자료와 아무 관계가 없었다.
 *
 * 그래서 자취를 셋으로 갈라 둔다. 어휘를 먼저 가르지 않으면 "물러난 길" 과 "아직
 * 살아 있는 길" 이 같은 모양이 되어 *자국이 안 지워졌다* 로 읽히고, 그것은 이
 * 조각이 말하려는 것의 정반대다.
 *
 * - `path` — **지금 살아 있는 길.** 뿌리부터 지금 자리까지. 물러나면 줄어든다.
 *   줄어드는 것이 옳다 — 이것이 곧 스택이고, 스택이 줄어드는 것이 물러남이다.
 * - `retreated` — **되짚어 나온 간선.** 재생 내내 쌓이고 한 번도 지워지지 않는다.
 *   길이가 곧 되짚은 횟수라 캡션의 수와 그림의 자취가 같은 배열에서 나온다.
 * - `deepest` — **가장 깊이 내려간 깊이.** 물러나도 줄지 않는다. 깊이 축에
 *   남아 "파고든 만큼 되짚을 길을 들고 있어야 한다" 를 말한다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 projector 에는 `let` 이 하나도 없었다. 상태는 전부 무대 안에, 그것도
 * 타입 선언에 얹혀 있었다.
 *
 * - **`NodeVisual.state` 와 `type NodeState`** — 마디가 네 형편 중 어디인가.
 *   선언은 있는데 값은 DOM 손잡이와 한 객체에 묶여 칠에만 쓰였다. 이제 `path` ·
 *   `visited` 에서 파생된다 (`nodeStateOf`).
 * - **`NodeVisual.wall: SVGPathElement | null`** — 지금 막힘이 드러난 자리인가.
 *   부품 이름이라 어떤 낱말 목록에도 안 든다. 이제 `blocked` 다.
 * - **`EdgeVisual.trail` 의 `stroke-dashoffset`·`display`** — 이 간선이 지금 길
 *   위에 있나. **`base` 의 `stroke-dasharray '3 6'`** — 되짚어 나온 길인가.
 *   조각의 결론이 SVG 속성 두 개에만 적혀 있었다.
 * - **`needle` 의 `transform`** — 좌표가 아니라 *지금 어느 깊이에 있나*. 이제
 *   `path.length - 1` 이다.
 * - **`nodes.get(step.from)?.state === 'current'`** — 화면의 지금 칠로 갈리던
 *   암묵 분기. 길이 곧 상태가 되면서 사라졌다.
 *
 * ── 좌표도 문안도 담지 않는다
 *
 * 마디는 이름으로 부른다. 어느 층 어디에 놓일지는 간선이 정하므로 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 캡션도 무엇을 말할지와 그 인자만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데 쓴다.
 *
 * 자리를 거의 싣지 않는다 — 어디서 일어난 일인지는 길이 이미 말한다. 들어선
 * 자리는 길의 끝이고, 파고든 자리도 길의 끝이며, 막힌 자리는 `blocked` 다.
 * 물러남만 예외다: 떠나온 마디는 이미 길에서 빠졌으므로 계기값으로 싣는다
 * (`step.from` 관용구 — 출발 그림을 앞 장면을 들추지 않고 얻는다, S-scene).
 */
export type DiveThenBacktrackStep =
  | { readonly kind: 'enter' }
  | { readonly kind: 'descend' }
  | { readonly kind: 'dead-end' }
  | { readonly kind: 'retreat'; readonly from: string }
  | { readonly kind: 'done' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type DiveThenBacktrackCaption =
  | { readonly kind: 'start'; readonly node: string }
  | { readonly kind: 'dive'; readonly node: string }
  | { readonly kind: 'deadEnd'; readonly node: string }
  | { readonly kind: 'retreat'; readonly node: string }
  | { readonly kind: 'done'; readonly visited: number; readonly backtracks: number };

export type DiveThenBacktrackScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 정점 이름. 화면의 글자가 되는 값. */
  readonly vertices: readonly string[];
  /** 무방향 간선. 층과 자리는 그리는 쪽이 여기서 셈한다. */
  readonly edges: readonly (readonly [string, string])[];
  /** 출발 정점. */
  readonly start: string;

  // ── 걸어온 자취.
  /** 뿌리부터 지금 자리까지의 **살아 있는 길**. 곧 스택이다. 물러나면 줄어든다. */
  readonly path: readonly string[];
  /** 밟아 본 마디. 처음 밟은 차례로 쌓이고 지워지지 않는다. */
  readonly visited: readonly string[];
  /** 되짚어 나온 간선(`edgeKeyOf`). 길이가 곧 되짚은 횟수다. **쌓이기만 한다.** */
  readonly retreated: readonly string[];
  /** 지금 막힘이 드러난 자리. 물러나면 거둔다 — 그 순간의 신호이지 결과가 아니다. */
  readonly blocked: string | null;
  /** 가장 깊이 내려간 깊이. **물러나도 줄지 않는다.** */
  readonly deepest: number;
  /** 답사가 끝났나. */
  readonly done: boolean;
  readonly step: DiveThenBacktrackStep | null;
};

/**
 * 되감기가 딛는 바탕.
 *
 * 그래프 말고는 아무것도 넘기지 않는다. 걸음이 고치는 것(`path`·`visited`·
 * `retreated`·`deepest`)을 바탕과 같은 급으로 묶으면 되감은 화면이 **이미 다
 * 돌아간 채**로 서고, 그 위에 algorithm 이 새로 시작한 첫 걸음이 겹친다.
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다 — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다.
 */
type Base = Pick<DiveThenBacktrackScene, 'vertices' | 'edges' | 'start'>;

/** 무방향 간선의 이름. 어느 쪽을 먼저 적었든 같은 키가 된다. */
export function edgeKeyOf(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ── 구조에서 나오는 것들 ────────────────────────────────────────────────────
//
// 화면에 뜨는 것은 전부 이 아래를 지난다. 마디의 형편도, 간선의 형편도, 깊이
// 바늘이 선 자리도, 캡션의 수도 payload 가 아니라 위 자취에서 풀린다.

/** 마디의 형편. **채움이 말하는 것** — 값의 형편이지 짚음의 표식이 아니다. */
export type DiveThenBacktrackNodeState = 'untouched' | 'current' | 'onPath' | 'exhausted';

export function nodeStateOf(
  scene: DiveThenBacktrackScene,
  name: string,
): DiveThenBacktrackNodeState {
  // 끝난 화면에서는 모든 자리가 소진이다 — 답사가 전부를 훑고 나왔다.
  if (scene.done) return scene.visited.includes(name) ? 'exhausted' : 'untouched';
  const i = scene.path.indexOf(name);
  if (i >= 0) return i === scene.path.length - 1 ? 'current' : 'onPath';
  return scene.visited.includes(name) ? 'exhausted' : 'untouched';
}

/** 지금 길 위에 있는 간선. 스택에 들어 있는 만큼이라 물러나면 줄어든다. */
export function livePathEdges(scene: DiveThenBacktrackScene): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < scene.path.length; i += 1) {
    out.push(edgeKeyOf(scene.path[i] ?? '', scene.path[i + 1] ?? ''));
  }
  return out;
}

/**
 * 한 번이라도 **내려간** 간선.
 *
 * 따로 쌓아 두지 않는다 — 내려간 간선은 지금 길 위에 있거나 이미 되짚어 나왔거나
 * 둘 중 하나다. 그래서 이 조각의 "내려간 걸음 수 = 되짚은 걸음 수" 가 자료 모양에
 * 그대로 드러난다.
 */
export function descendedEdges(scene: DiveThenBacktrackScene): string[] {
  const out = [...scene.retreated];
  for (const key of livePathEdges(scene)) if (!out.includes(key)) out.push(key);
  return out;
}

/** 깊이 바늘이 설 자리. 아직 들어서기 전이거나 다 끝났으면 물러난다. */
export function depthNow(scene: DiveThenBacktrackScene): number | null {
  if (scene.done || scene.path.length === 0) return null;
  return scene.path.length - 1;
}

/** 지금 서 있는 마디. 표식(고리)이 씌워질 자리다. */
export function standingAt(scene: DiveThenBacktrackScene): string | null {
  if (scene.done || scene.path.length === 0) return null;
  return scene.path[scene.path.length - 1] ?? null;
}

/**
 * 캡션이 말할 것.
 *
 * `done` 의 두 수는 이 장면이 센 것을 그대로 내보낸다 — 화면에 나란히 뜨는 수가
 * 한 자리에서 나와야 갈리지 않는다. 옛 발신은 셋을 payload 로 실어 보냈고, 그
 * 셋이 화면의 자취와 다른 출처였다.
 */
export function captionOf(scene: DiveThenBacktrackScene): DiveThenBacktrackCaption | null {
  const step = scene.step;
  if (step === null) return null;
  switch (step.kind) {
    case 'enter':
      return { kind: 'start', node: scene.path[0] ?? scene.start };
    case 'descend':
      return { kind: 'dive', node: scene.path[scene.path.length - 1] ?? scene.start };
    case 'dead-end':
      return {
        kind: 'deadEnd',
        node: scene.blocked ?? scene.path[scene.path.length - 1] ?? scene.start,
      };
    case 'retreat':
      return { kind: 'retreat', node: scene.path[scene.path.length - 1] ?? scene.start };
    case 'done':
      return { kind: 'done', visited: scene.visited.length, backtracks: scene.retreated.length };
  }
}

// ── 선언 읽기 ───────────────────────────────────────────────────────────────

/**
 * 선언에서 그래프를 **베껴** 온다.
 *
 * 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한 객체다. 참조를 쥐면 되짚을
 * 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readBase(raw: unknown): Base {
  const d = (raw ?? {}) as { vertices?: unknown; edges?: unknown; start?: unknown };
  const vertices = Array.isArray(d.vertices)
    ? d.vertices.filter((v): v is string => typeof v === 'string')
    : [];
  const edges: [string, string][] = [];
  if (Array.isArray(d.edges)) {
    for (const raw2 of d.edges) {
      if (!Array.isArray(raw2) || raw2.length < 2) continue;
      const [a, b] = raw2 as unknown[];
      if (typeof a !== 'string' || typeof b !== 'string') continue;
      edges.push([a, b]);
    }
  }
  const start = typeof d.start === 'string' ? d.start : (vertices[0] ?? '');
  return { vertices, edges, start };
}

/** 아무 걸음도 밟지 않은 화면 — 아직 아무도 밟지 않은 나무뿐이다. */
function atStart(b: Base): DiveThenBacktrackScene {
  return {
    vertices: b.vertices,
    edges: b.edges,
    start: b.start,
    path: [],
    visited: [],
    retreated: [],
    blocked: null,
    deepest: 0,
    done: false,
    step: null,
  };
}

export const diveThenBacktrackScene: ScenePlan<DiveThenBacktrackScene> = {
  initial(initialData: unknown): DiveThenBacktrackScene {
    return atStart(readBase(initialData));
  },

  reduce(scene: DiveThenBacktrackScene, event: FacetRuntimeEvent): DiveThenBacktrackScene {
    switch (event.type) {
      // 출발점에 선다. 자취를 처음으로 되돌리고 길을 연다.
      case 'enter-root': {
        // 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌
        // 타입이 아무것도 막지 못한다.
        return {
          ...atStart({ vertices: scene.vertices, edges: scene.edges, start: scene.start }),
          path: [scene.start],
          visited: [scene.start],
          step: { kind: 'enter' },
        };
      }

      // 한 칸 파고든다. 어느 이웃으로 갈지는 **걸음이 내리는 판정**이라 싣는다.
      // 어디서 가는지(길의 끝)와 몇 번째 깊이인지(길의 길이)는 장면이 안다.
      case 'descend': {
        const p = (event.payload ?? {}) as { to?: unknown };
        const to = typeof p.to === 'string' ? p.to : null;
        if (to === null || scene.path.length === 0) return scene;
        const path = [...scene.path, to];
        return {
          ...scene,
          path,
          visited: scene.visited.includes(to) ? scene.visited : [...scene.visited, to],
          blocked: null,
          deepest: Math.max(scene.deepest, path.length - 1),
          step: { kind: 'descend' },
        };
      }

      // 더 갈 곳이 없음이 드러난다. 어느 자리인지는 길의 끝이 말한다.
      case 'dead-end': {
        const here = scene.path[scene.path.length - 1];
        if (here === undefined) return scene;
        return { ...scene, blocked: here, step: { kind: 'dead-end' } };
      }

      // 왔던 길을 거슬러 한 칸 물러난다. 길에서 하나를 덜면 화면이 선다 —
      // 자국을 지우는 명령이 여기서 통째로 사라졌다.
      case 'retreat': {
        if (scene.path.length < 2) return scene;
        const from = scene.path[scene.path.length - 1] ?? '';
        const to = scene.path[scene.path.length - 2] ?? '';
        const key = edgeKeyOf(from, to);
        return {
          ...scene,
          path: scene.path.slice(0, -1),
          // 되짚은 자취는 지우지 않는다. 이 조각이 말하려는 것이 거기 쌓인다.
          retreated: scene.retreated.includes(key) ? scene.retreated : [...scene.retreated, key],
          // 막힘 표시는 빠져나오면 거둔다 — 남겨 두면 "지금 막혔다" 가 배경이 된다.
          blocked: null,
          step: { kind: 'retreat', from },
        };
      }

      case 'done':
        return { ...scene, blocked: null, done: true, step: { kind: 'done' } };

      // 손으로 짚기 시작 — 아무도 밟지 않은 나무로 돌아간다.
      //
      // 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌
      // 타입이 아무것도 막지 못한다.
      case 'rewind':
        return atStart({ vertices: scene.vertices, edges: scene.edges, start: scene.start });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
