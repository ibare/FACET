/**
 * oneMoreRoundDrops 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 주장은 "쌓인 것" 에 있다
 *
 * "n−1 바퀴를 다 돌고 한 번 더 돌렸는데 또 내려간다" 를 말하려면 **바퀴마다의 값이
 * 다 남아 있어야 한다.** 마지막 값 하나만 들고 있으면 "지금 얼마인가" 는 말해도
 * "계속 내려가고 있다" 는 말하지 못한다. 그래서 이 장면의 알맹이는 `rounds` —
 * 바퀴가 올 때마다 그 바퀴를 마친 값 한 줄이 쌓이는 배열이다. 화면의 눈금 사다리도,
 * 낙폭도, 바닥이 뚫렸나도, 마지막에 어느 정점이 화면 밖으로 화살을 내미나도 전부
 * 여기서 파생한다.
 *
 * ── 화면이 어디에 상태를 숨겨 두었나
 *
 * projector 에는 `let` 도 `Map` 조회 분기도 없었다 (①③ 0 건). DOM 되읽기도 없었다
 * (④ 0 건). **화면이 통째로 상태였다는 뜻**이고, 실제로 stage 의 `let` 과 모듈
 * 스코프 선언에서 다섯이 나왔다.
 *
 * - **`current: Map<string, number | null>`** — 지금 각 정점의 값. 이것이 거리표
 *   그 자체였는데 **한 줄밖에 없었다.** 앞 바퀴의 값은 `applyRound` 가 `was` 로
 *   한 번 읽고 버렸다. 이제 `rounds` 가 바퀴마다 한 줄씩 쥔다.
 * - **눈금(`layerTicks` 의 자식들)** — 떠난 자리에 남던 선. `dropTick` 이 붙이기만
 *   하고 거두는 명령이 없어 **쌓이던 것이 곧 정보**였다 (프로토콜 4 절). 어느
 *   변수도 그것을 말하지 않아 되짚으면 사다리가 통째로 사라질 자리였다. 이제
 *   `rounds` 의 값 이력에서 매번 다시 세운다.
 * - **`floors: Map<string, SVGLineElement>`** — 바닥 파선의 DOM 손잡이인데,
 *   `beyond` 바퀴에서 `setAttribute('stroke', danger)` 로 **제자리에서 고쳐졌다.**
 *   "이 정점의 바닥이 뚫렸다" 가 속성에만 있었다. 이제 `floored` 와 바퀴 이력에서
 *   `지금 값 < 바닥 값` 으로 파생한다.
 * - **`lastMovers: string[]`** — 마지막 바퀴에 움직인 정점. `markKeepsFalling` 이
 *   어느 궤도에 화살을 내밀지 정하는 값인데 **어느 발신에도 실려 있지 않았다.**
 *   이제 마지막 바퀴의 값과 그 앞 바퀴의 값을 견주어 센다 — 이 조각의 결론이
 *   화면에 남은 눈금과 **같은 자료**를 쓰게 되는 자리다.
 * - **`vMax`/`vMin`/`unit`/`pillW`** — 눈금의 척도. 앞의 둘은 재생 전체를 굴려야
 *   나오는 값이라 바탕으로 싣고, 뒤의 둘은 그것과 캔버스에서 나오는 **좌표**라
 *   장면에 담지 않는다 (S-piece).
 *
 * ── 싣지 않는 것
 *
 * 몇 바퀴째인가는 받지 않는다 — 바퀴는 올 때마다 하나씩 쌓이므로 `rounds.length`
 * 가 곧 그 번호다. bound(n−1)를 넘겼는가도 받지 않는다 —
 * `oneMoreRoundDropsBound` 가 유일한 잣대이고 양쪽이 그 하나를 부른다. 낙폭도
 * 받지 않는다 — 앞 바퀴의 값이 여기 남아 있어 견주면 나온다. 마지막 바퀴에 걸린
 * 간선도 받지 않는다 — 그 바퀴의 `relaxed` 가 이미 그것이다.
 *
 * 좌표는 담지 않는다. 정점 이름과 값이라는 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import { parseTarget } from '@ffacet/core/runtime';
import type { FacetEventTarget, FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { oneMoreRoundDropsBound, oneMoreRoundDropsOpening } from './algorithm.js';

/** 방향 간선 하나. 무게는 음수를 허용한다. */
export type OneMoreRoundDropsLink = { from: string; to: string; weight: number };

/**
 * 한 바퀴를 마친 자리.
 *
 * `values` 는 `nodes` 와 같은 차례이고 `null` 이 ∞ 다. `relaxed` 는 그 바퀴에 값을
 * 낮춘 간선 — 왼쪽 그래프에서 켜지는 줄이자, 마지막에 붉게 남는 고리다.
 */
export type OneMoreRoundDropsRound = {
  values: readonly (number | null)[];
  relaxed: readonly string[];
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type OneMoreRoundDropsCaption =
  | { kind: 'start' }
  | { kind: 'round'; n: number }
  | { kind: 'beyond'; n: number }
  | { kind: 'floor'; n: number }
  | { kind: 'never' };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 흐르게 할 것이 출발하는 자리를 장면이 이미 다 말한다.
 * 알갱이는 앞 바퀴의 값에서 출발하고 (`rounds` 의 바로 앞 줄), 바닥 파선은 제
 * 가운데에서 펴지며, 화살은 알갱이 밑에서 뻗는다. `prev` 를 들출 일이 없다
 * (S-scene).
 */
export type OneMoreRoundDropsStep =
  | { kind: 'graph' }
  | { kind: 'round' }
  | { kind: 'floor' }
  | { kind: 'fall' };

export type OneMoreRoundDropsScene = {
  // ── 바탕. `graph-ready` 가 한 번 세우고 그 뒤의 걸음이 고치지 않는다.
  /** 정점 이름. 오른쪽 궤도 하나가 정점 하나다. */
  nodes: readonly string[];
  edges: readonly OneMoreRoundDropsLink[];
  /** 출발 정점. 이 정점만 0 에서 시작한다. */
  source: string;
  /**
   * 세로 눈금의 위아래 끝.
   *
   * **재생 전체를 굴려야 나오는 값이라 장면이 셀 수 없다.** 자취에서 세면 바퀴마다
   * 축이 따라 늘어나 알갱이가 제자리에 있는 것처럼 보이고, 그러면 이 조각이
   * 말하려는 것이 통째로 사라진다. 그래서 발신이 싣는 몇 안 되는 수다.
   */
  vMax: number;
  vMin: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 바퀴마다 한 줄. `rounds.length` 가 곧 지금 몇 바퀴째인가다. */
  rounds: readonly OneMoreRoundDropsRound[];
  /** n−1 바퀴를 마쳤다 — 바닥 파선이 그어진다. */
  floored: boolean;
  /** 마지막 바퀴에도 또 걸렸다 — 화살이 궤도 아래로 뻗는다. 남는 강조다. */
  falling: boolean;

  step: OneMoreRoundDropsStep | null;
  caption: OneMoreRoundDropsCaption | null;
};

/**
 * 아무것도 서지 않은 처음 화면.
 *
 * 바탕까지 통째로 비운다. 이 조각은 `graph-ready` 가 첫 걸음이라 바탕도 걸음이
 * 세우기 때문이다 — 되감기에 넘길 바탕이 아예 없으므로 "걸음이 고치는 바탕을
 * `rewind` 갈래에 넘기지 않는다" 를 넘길 것을 없애는 쪽으로 지킨다 (S-scene).
 */
function atStart(): OneMoreRoundDropsScene {
  return {
    nodes: [],
    edges: [],
    source: '',
    vMax: 0,
    vMin: 0,
    rounds: [],
    floored: false,
    falling: false,
    step: null,
    caption: null,
  };
}

// ── unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 값이 없는 자리는 `null` 로 온다 (∞). 수가 아닌 것도 없는 것으로 본다. */
function dist(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function names(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function readEdges(value: unknown): readonly OneMoreRoundDropsLink[] {
  if (!Array.isArray(value)) return [];
  const edges: OneMoreRoundDropsLink[] = [];
  for (const item of value) {
    const edge = item as { from?: unknown; to?: unknown; w?: unknown };
    if (typeof edge?.from !== 'string' || typeof edge?.to !== 'string') continue;
    edges.push({ from: edge.from, to: edge.to, weight: num(edge?.w, 0) });
  }
  return edges;
}

/** `edge:A-B` 목록에서 간선 키만 꺼낸다. 파싱은 `parseTarget` 경유다 (C1). */
function readEdgeKeys(target: FacetEventTarget | undefined): readonly string[] {
  if (target === undefined) return [];
  const list = Array.isArray(target) ? target : [target];
  const keys: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const parsed = parseTarget(item);
    if (parsed?.prefix !== 'edge' || parsed.id === '') continue;
    keys.push(parsed.id);
  }
  return keys;
}

/**
 * 발신이 실어 온 값을 `nodes` 차례로 세운다.
 *
 * 빠진 정점은 앞 바퀴의 값을 물려받는다 — 이 바퀴에 아무 말도 없었다는 것은
 * 안 움직였다는 뜻이다.
 */
function readValues(
  raw: unknown,
  nodes: readonly string[],
  before: readonly (number | null)[],
): readonly (number | null)[] {
  const said = new Map<string, number | null>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const row = item as { node?: unknown; value?: unknown };
      if (typeof row?.node !== 'string') continue;
      said.set(row.node, dist(row?.value));
    }
  }
  return nodes.map((node, i) => (said.has(node) ? (said.get(node) ?? null) : (before[i] ?? null)));
}

// ── 화면에 뜨는 수는 전부 아래를 지난다 ──────────────────────────────────────

/**
 * 다 정해졌어야 할 바퀴 수. **잣대는 algorithm 이 내주는 하나뿐이다** — 여기서
 * `nodes.length - 1` 을 다시 적으면 두 답이 갈린다.
 */
export function boundOf(scene: OneMoreRoundDropsScene): number {
  return oneMoreRoundDropsBound(scene.nodes);
}

/**
 * 바퀴별 값의 이력. 0 번째가 아직 한 바퀴도 돌기 전이고, k 번째가 k 바퀴를 마친 뒤다.
 *
 * 눈금 사다리도 낙폭도 바닥이 뚫렸나도 전부 이 하나에서 나온다.
 */
export function historyOf(scene: OneMoreRoundDropsScene): readonly (readonly (number | null)[])[] {
  const opening = oneMoreRoundDropsOpening(scene.nodes, scene.source);
  return [opening, ...scene.rounds.map((round) => round.values)];
}

/** 지금 각 정점의 값. */
export function valuesNow(scene: OneMoreRoundDropsScene): readonly (number | null)[] {
  const history = historyOf(scene);
  return history[history.length - 1];
}

/** bound 를 넘긴 바퀴인가 — 다 끝났어야 할 자리를 지나 또 돌고 있는가. */
export function beyondBound(scene: OneMoreRoundDropsScene): boolean {
  return scene.rounds.length > boundOf(scene);
}

/**
 * 바닥 파선이 앉는 값. 아직 n−1 바퀴를 못 마쳤으면 `null`.
 *
 * `null` 인 자리(∞)에는 바닥을 긋지 않는다 — 닿지도 못한 정점에 바닥이 있을 수 없다.
 */
export function floorValues(scene: OneMoreRoundDropsScene): readonly (number | null)[] | null {
  if (!scene.floored) return null;
  const history = historyOf(scene);
  return history[Math.min(boundOf(scene), history.length - 1)];
}

/** 그 바퀴(1 부터)에 값이 내려간 정점의 자리 번호. 0 이면 아직 안 돈 것이다. */
export function moversOf(scene: OneMoreRoundDropsScene, round: number): readonly number[] {
  const history = historyOf(scene);
  if (round < 1 || round >= history.length) return [];
  const was = history[round - 1];
  const now = history[round];
  const out: number[] = [];
  now.forEach((value, i) => {
    if (value !== was[i]) out.push(i);
  });
  return out;
}

/**
 * 지금 바퀴에 그 정점이 내려간 폭. 안 움직였거나 ∞ 에서 처음 정해졌으면 `null`.
 *
 * 옛 화면은 이 수를 발신에서 받아 알갱이 곁에 적었는데, **안 움직인 정점의 낙폭을
 * 지우는 명령이 없어** 앞 바퀴의 수가 그대로 남았다. 여기서 매번 파생하면 그 자리가
 * 저절로 빈다.
 */
export function dropOf(scene: OneMoreRoundDropsScene, index: number): number | null {
  const history = historyOf(scene);
  if (history.length < 2) return null;
  const was = history[history.length - 2][index] ?? null;
  const now = history[history.length - 1][index] ?? null;
  if (was === null || now === null || was === now) return null;
  return now - was;
}

/** 그 정점이 제 바닥을 뚫고 내려갔나 — 이 조각의 결론이 정점마다 서는 자리. */
export function brokeFloor(scene: OneMoreRoundDropsScene, index: number): boolean {
  const floor = floorValues(scene);
  if (floor === null) return false;
  const base = floor[index] ?? null;
  const now = valuesNow(scene)[index] ?? null;
  return base !== null && now !== null && now < base;
}

/**
 * 마지막 바퀴에 값을 낮춘 간선 — 음수 고리.
 *
 * 옛 발신은 이것을 `keeps-falling` 의 `target` 으로 다시 실어 보냈다. 조각의 결론이
 * 화면의 자취와 다른 출처를 갖던 자리라, 지금은 쌓인 바퀴에서 그대로 꺼낸다.
 */
export function guiltyEdges(scene: OneMoreRoundDropsScene): readonly string[] {
  const last = scene.rounds[scene.rounds.length - 1];
  return last?.relaxed ?? [];
}

export const oneMoreRoundDropsScene: ScenePlan<OneMoreRoundDropsScene> = {
  /**
   * 첫 화면은 비어 있다.
   *
   * 바탕은 `graph-ready` 가 채우므로 넘겨받은 선언을 여기서 쥐지 않는다 — 러너가
   * 주는 것은 mechanism 과 view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미
   * 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(): OneMoreRoundDropsScene {
    return atStart();
  },

  reduce(scene: OneMoreRoundDropsScene, event: FacetRuntimeEvent): OneMoreRoundDropsScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 그래프와 궤도가 선다. 출발점만 0 이고 나머지는 아직 ∞ 다.
      case 'graph-ready': {
        const nodes = names(p.nodes);
        return {
          ...atStart(),
          nodes,
          edges: readEdges(p.edges),
          source: str(p.source),
          vMax: num(p.vMax, 0),
          vMin: num(p.vMin, 0),
          step: { kind: 'graph' },
          caption: { kind: 'start' },
        };
      }

      // 한 바퀴. 값 한 줄이 쌓이고, 그 줄이 곧 이 조각의 주장을 쌓는 일이다.
      case 'round-dropped': {
        if (scene.nodes.length === 0) return scene;
        const values = readValues(p.entries, scene.nodes, valuesNow(scene));
        const rounds = [...scene.rounds, { values, relaxed: readEdgeKeys(event.target) }];
        const n = rounds.length;
        return {
          ...scene,
          rounds,
          step: { kind: 'round' },
          caption: n > boundOf(scene) ? { kind: 'beyond', n } : { kind: 'round', n },
        };
      }

      // n−1 바퀴를 마쳤다. 어느 바퀴인지도 그 값들도 이미 쌓여 있으므로 받지 않는다.
      case 'bound-marked':
        return {
          ...scene,
          floored: true,
          step: { kind: 'floor' },
          caption: { kind: 'floor', n: boundOf(scene) },
        };

      // 바닥을 지나고도 또 걸렸다. 걸린 간선은 마지막 바퀴의 자취가 말한다.
      case 'keeps-falling':
        return {
          ...scene,
          falling: true,
          step: { kind: 'fall' },
          caption: { kind: 'never' },
        };

      case 'rewind':
        // 바탕째 턴다. 다음 걸음이 `graph-ready` 라 다시 세워진다.
        return atStart();

      default:
        // 이 algorithm 이 발신하는 것은 위가 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
