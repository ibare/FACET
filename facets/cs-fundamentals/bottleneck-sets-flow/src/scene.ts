/**
 * bottleneckSetsFlow 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 정점 사이에 관이 걸려 있고 굵기가 곧 용량이다. 흘려보낸 양은 관 한가운데를
 * 차지하는 심으로 그린다. 심이 관 벽에 닿으면 꽉 찬 것이다. 길을 하나 고르면 그
 * 길의 관들에 테가 서고, 그중 여유가 가장 적은 관에 조임쇠가 물린다. 그 조임쇠가
 * 정한 만큼만 물이 흐른다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 도 `Map` 조회도 하나 없었고 stage 가 화면을 도로 읽는
 * 자리도 없었다. 그래서 ①③④ 가 전부 0 건이다 — 숨은 상태가 없다는 뜻이 아니라
 * **화면이 통째로 상태**라는 뜻이고, 실제로 전부 stage 의 구조체와 칠에 있었다.
 *
 * - **`PipeView.flow`** — 그 관에 지금까지 흘린 양 그 자체. DOM 손잡이
 *   (`tube` · `core` · `seal` · `jawA` · `jawB` · `numLabel` · `noteLabel`) 와 한
 *   객체에 묶여 있어 어떤 grep 에도 안 걸린다. 꽉 찼는가(`tubeTone`), 눈금에 무엇을
 *   적는가(`setNum`), 한 바퀴 끝에 무엇을 남기는가(`clearRoundMarks`), 그리고
 *   **차오르는 운동의 출발 높이**(`const before = pipe.flow`) 가 전부 여기서 나왔다.
 *   이제 `rounds` 가 말하고 `flowsOf` 가 셈한다.
 * - **조임쇠(`jawA`/`jawB`)의 `opacity` 와 벌어짐** — *어느 관이 병목이었나.*
 *   이 조각이 말하려는 것 그 자체인데 어느 상태에도 적혀 있지 않았고, 다음 길을
 *   찾을 때 `clearRoundMarks()` 가 통째로 지웠다. **완주 화면에는 마지막 한 바퀴의
 *   조임쇠만 남았다.** 증가 경로마다 병목이 다른 것이 곧 "왜 여기서 멈췄나" 의
 *   근거인데 그 이력이 사라지고 있었다. 이제 `rounds[].narrowest` 가 끝까지 쥔다.
 * - **`noteLabel` 의 글자** — `여유 {n}` 과 `꽉 참` 이 한 자리에 번갈아 실렸다.
 *   짚음의 표식과 값의 형편이 같은 어휘를 다투던 자리다.
 * - **`tube` 의 `stroke`/`stroke-width`** — `border`/1.4(그냥) · `itemSorted`/2.2(꽉
 *   참) · `itemComparing`/2.6(이번 길) **세 뜻이 한 속성에** 실려, 이번 길에 든
 *   관은 꽉 찼다는 표시를 잃었다. 이제 테두리는 짚음만, 채움은 형편만 말한다.
 * - **`total`** — stage 의 유일한 `let`. 도착 총량. `totalOf` 가 자취에서 센다.
 *
 * ── 무엇을 싣고 무엇을 세는가
 *
 * 잔여 용량은 **구조에서 세진다** — 용량에서 지금까지 흘린 양을 빼면 나온다. 그래서
 * `rooms` · `flows` · `full` · `total` 을 싣지 않는다. 길의 정점 차례도 간선에서
 * 펴지므로 `nodes` 를 싣지 않는다.
 *
 * 싣는 것은 둘뿐이다.
 *
 * - **`path-found` 의 `edges`** — 어느 길을 찾았나. 너비 우선 탐색의 판정이라
 *   구조에서 셀 수 없다.
 * - **`narrowest-marked` 의 `narrowest`** — 그 길에서 여유가 가장 적은 관은 어느
 *   것인가. `Math.min` 한 줄이라 장면이 셀 수도 있지만 **그것이 이 조각의 알고리즘
 *   그 자체**다 — 떼어 내면 "가장 좁은 곳이 정한다" 는 주장이 남지 않고 발신이
 *   장식이 된다 (프로토콜 2-4 절 경계). 그래서 판정으로 싣고, **흘릴 양은 그 관의
 *   여유를 읽어** 장면이 셈한다. 수를 따로 싣지 않으므로 화면과 갈릴 자리가 없다.
 *
 * 좌표는 담지 않는다. 정점·관·용량 같은 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * `captionOf` 가 내주고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import type { FlowPipe } from './algorithm.js';

/**
 * 증가 경로 한 바퀴. 길을 찾고 → 병목을 짚고 → 그만큼 흘린다.
 *
 * 한 바퀴가 세 걸음에 걸쳐 채워진다. 지워지지 않고 쌓이는 것이 요점이다 —
 * **바퀴마다 병목이 어디였나가 곧 "왜 더는 못 가나" 의 근거**다.
 */
export type FlowRound = {
  /** 이번에 찾은 길. `scene.edges` 의 차례로, 들어오는 곳에서 나가는 곳 순서. */
  route: number[];
  /** 그 길에서 여유가 가장 적은 관. 아직 짚기 전이면 빈 목록. */
  narrowest: number[];
  /** 그 관의 여유 = 이 길로 흘릴 수 있는 양. 짚기 전이면 `null`. */
  amount: number | null;
  /** 이미 흘렸나. `flowsOf` 는 흘린 바퀴만 센다. */
  pushed: boolean;
};

/** 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다. */
export type FlowStepKind = 'path' | 'narrowest' | 'push' | 'blocked' | 'done';

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type FlowCaption =
  | { kind: 'path'; nodes: string[] }
  | { kind: 'narrowest'; amount: number }
  | { kind: 'pushed'; amount: number; total: number }
  | { kind: 'blocked' }
  | { kind: 'done'; total: number };

export type BottleneckSetsFlowScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  nodes: string[];
  edges: FlowPipe[];
  /** 들어오는 곳. */
  source: string;
  /** 나가는 곳. */
  sink: string;

  // ── 걸음이 고치는 것.
  /** 지나온 증가 경로. 흘린 양도 병목의 이력도 전부 여기서 나온다. */
  rounds: FlowRound[];
  /** 들어오는 곳에서 나가는 관이 모두 꽉 찼다. */
  blocked: boolean;
  /** 끝. 도착 총량에 힘이 들어간다. */
  finished: boolean;
  step: FlowStepKind | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면과 되감기가 함께 쓴다.
 *
 * `rounds` 는 여기 들지 않는다 — 걸음이 고치는 유일한 자리라 그대로 넘기면
 * 되감아도 흘린 물이 관에 남는다.
 */
type FlowBase = Pick<BottleneckSetsFlowScene, 'nodes' | 'edges' | 'source' | 'sink'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. */
function atStart(base: FlowBase): BottleneckSetsFlowScene {
  return {
    nodes: base.nodes,
    edges: base.edges,
    source: base.source,
    sink: base.sink,
    rounds: [],
    blocked: false,
    finished: false,
    step: null,
  };
}

// ── unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** 넘겨받은 선언에서 관을 좁힌다. 값만 베껴 담아 참조를 쥐지 않는다 (S-scene). */
function readPipes(value: unknown): FlowPipe[] {
  if (!Array.isArray(value)) return [];
  const pipes: FlowPipe[] = [];
  for (const item of value) {
    const pipe = item as { id?: unknown; from?: unknown; to?: unknown; capacity?: unknown };
    if (typeof pipe?.id !== 'string') continue;
    if (typeof pipe?.from !== 'string' || typeof pipe?.to !== 'string') continue;
    if (typeof pipe?.capacity !== 'number' || !Number.isFinite(pipe.capacity)) continue;
    if (pipe.capacity <= 0) continue;
    pipes.push({ id: pipe.id, from: pipe.from, to: pipe.to, capacity: pipe.capacity });
  }
  return pipes;
}

/** `edge:` 식별자 없이 온 관 이름들을 `scene.edges` 의 차례로 옮긴다. */
function indicesOf(scene: BottleneckSetsFlowScene, ids: string[]): number[] {
  const found: number[] = [];
  for (const id of ids) {
    const at = scene.edges.findIndex((pipe) => pipe.id === id);
    if (at >= 0 && !found.includes(at)) found.push(at);
  }
  return found;
}

// ── 구조에서 세지는 것들. 화면과 캡션이 같은 함수를 지난다.

/**
 * 관마다 지금까지 흘린 양.
 *
 * 흘린 바퀴만 센다 — 길을 찾아 놓고 아직 흘리지 않은 바퀴는 관을 채우지 않는다.
 * 그래서 병목을 짚는 걸음에서 재는 여유가 **흘리기 전의 여유**가 된다.
 */
export function flowsOf(scene: BottleneckSetsFlowScene): number[] {
  const flows = scene.edges.map(() => 0);
  for (const round of scene.rounds) {
    if (!round.pushed || round.amount === null) continue;
    for (const at of round.route) flows[at] += round.amount;
  }
  return flows;
}

/** 관마다 남은 여유. 용량에서 흘린 양을 뺀 것이다. */
export function roomsOf(scene: BottleneckSetsFlowScene): number[] {
  const flows = flowsOf(scene);
  return scene.edges.map((pipe, i) => Math.max(0, pipe.capacity - flows[i]));
}

/** 나가는 곳에 도착한 총량. 흘린 바퀴의 합이다. */
export function totalOf(scene: BottleneckSetsFlowScene): number {
  let sum = 0;
  for (const round of scene.rounds) {
    if (round.pushed && round.amount !== null) sum += round.amount;
  }
  return sum;
}

/** 지금 보고 있는 바퀴. 없으면 `null`. */
export function currentRound(scene: BottleneckSetsFlowScene): FlowRound | null {
  return scene.rounds.length > 0 ? scene.rounds[scene.rounds.length - 1] : null;
}

/** 들어오는 곳에서 나가는 관. `no-more-room` 이 찔러 보는 것들이다. */
export function exitEdges(scene: BottleneckSetsFlowScene): number[] {
  const found: number[] = [];
  scene.edges.forEach((pipe, i) => {
    if (pipe.from === scene.source) found.push(i);
  });
  return found;
}

/** 그 길이 지나는 정점 차례. 간선에서 편다 — 따로 싣지 않는다. */
export function routeNodes(scene: BottleneckSetsFlowScene, route: number[]): string[] {
  if (route.length === 0) return [];
  const first = scene.edges[route[0]];
  if (first === undefined) return [];
  return [first.from, ...route.map((at) => scene.edges[at]?.to ?? '')];
}

/**
 * 지금 화면이 말할 것.
 *
 * 걸음과 따로 쥐지 않는다 — 같은 것을 두 자리에 적으면 언젠가 갈린다. 걸음의
 * 종류와 장면이 쥔 자취만으로 전부 나온다.
 */
export function captionOf(scene: BottleneckSetsFlowScene): FlowCaption | null {
  const round = currentRound(scene);
  switch (scene.step) {
    case 'path':
      return round === null ? null : { kind: 'path', nodes: routeNodes(scene, round.route) };
    case 'narrowest':
      return round === null ? null : { kind: 'narrowest', amount: round.amount ?? 0 };
    case 'push':
      return round === null
        ? null
        : { kind: 'pushed', amount: round.amount ?? 0, total: totalOf(scene) };
    case 'blocked':
      return { kind: 'blocked' };
    case 'done':
      return { kind: 'done', total: totalOf(scene) };
    default:
      return null;
  }
}

/** 마지막 바퀴를 갈아 끼운 새 목록. 앞 장면의 배열을 제자리에서 고치지 않는다. */
function replaceLast(rounds: FlowRound[], next: FlowRound): FlowRound[] {
  return rounds.map((round, i) => (i === rounds.length - 1 ? next : round));
}

export const bottleneckSetsFlowScene: ScenePlan<BottleneckSetsFlowScene> = {
  /**
   * 첫 화면은 물이 한 방울도 흐르지 않은 관 그림이다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 그 안의 객체를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체다 (S-scene).
   */
  initial(initialData: unknown): BottleneckSetsFlowScene {
    const d = (initialData ?? {}) as {
      nodes?: unknown;
      edges?: unknown;
      source?: unknown;
      sink?: unknown;
    };
    return atStart({
      nodes: names(d.nodes),
      edges: readPipes(d.edges),
      source: str(d.source),
      sink: str(d.sink),
    });
  },

  reduce(scene: BottleneckSetsFlowScene, event: FacetRuntimeEvent): BottleneckSetsFlowScene {
    switch (event.type) {
      // 아직 여유가 남은 길을 찾았다. 새 바퀴가 열린다.
      case 'path-found': {
        const p = (event.payload ?? {}) as { edges?: unknown };
        const route = indicesOf(scene, names(p.edges));
        if (route.length === 0) return scene;
        return {
          ...scene,
          rounds: [...scene.rounds, { route, narrowest: [], amount: null, pushed: false }],
          step: 'path',
        };
      }

      // 그 길에서 여유가 가장 적은 관을 짚는다. 흘릴 양은 그 관의 여유를 읽어 안다.
      case 'narrowest-marked': {
        const round = currentRound(scene);
        if (round === null || round.pushed) return scene;
        const p = (event.payload ?? {}) as { narrowest?: unknown };
        const marked = indicesOf(scene, names(p.narrowest)).filter((at) =>
          round.route.includes(at),
        );
        if (marked.length === 0) return scene;
        const rooms = roomsOf(scene);
        return {
          ...scene,
          rounds: replaceLast(scene.rounds, {
            ...round,
            narrowest: marked,
            amount: rooms[marked[0]] ?? 0,
          }),
          step: 'narrowest',
        };
      }

      // 그만큼 흘린다. 관이 차오르는 것도 꽉 차는 것도 여기서 파생된다.
      case 'flow-pushed': {
        const round = currentRound(scene);
        if (round === null || round.pushed || round.amount === null) return scene;
        return {
          ...scene,
          rounds: replaceLast(scene.rounds, { ...round, pushed: true }),
          step: 'push',
        };
      }

      // 들어오는 곳에서 나가는 관이 모두 꽉 찼다.
      case 'no-more-room':
        return { ...scene, blocked: true, step: 'blocked' };

      case 'done':
        return { ...scene, finished: true, step: 'done' };

      // 바탕만 남기고 처음으로. 흘린 물은 자취라 여기서 거둔다.
      case 'rewind':
        return atStart({
          nodes: scene.nodes,
          edges: scene.edges,
          source: scene.source,
          sink: scene.sink,
        });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
