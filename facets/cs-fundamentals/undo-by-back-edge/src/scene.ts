/**
 * undoByBackEdge 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 관 하나의 굵기가 곧 용량이고 그 안은 용량만큼의 차선으로 나뉜다. 찬 차선이
 * 흘린 양, 빈 차선이 앞으로 더 흘릴 폭이다. 그래서 관 하나가 잔여 그래프 양쪽을
 * 동시에 그린다 — 머리 화살은 빈 폭만큼, 꼬리 화살은 찬 폭만큼 크다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * - **`flowByKey`** — 관마다 흘린 양. stage 의 `new Map<string, number>()` 한 줄에
 *   있었고 `let` 에도 `Set.has` 에도 안 걸렸다. 더 나쁜 것은 **같은 물음에 답이
 *   둘**이었다는 것이다 — `flow-pushed` 가 흐름표를 통째로 실어 오는데 stage 는
 *   제 맵의 값을 `before` 로 읽어 운동의 출발 그림을 셈했다. 이제 `flow` 하나다.
 * - **`EdgeArt.headHalf` / `backHalf`** — 지금 그려져 있는 화살촉 반높이. DOM
 *   손잡이(`body`·`lanes`·`head`)와 한 객체에 묶여 있어 어떤 grep 에도 안 걸리는데,
 *   실은 "지금 화면이 말하는 잔여 폭" 그 자체였다. 이제 `flow` 에서 파생된다.
 * - **`received`** — 나가는 곳에 닿은 누적량. `total` 로도 실려 와 두 벌이었다.
 *   이제 `totalAt` 이 흐름표에서 센다 (나가는 곳으로 들어온 것 − 나간 것).
 * - **`paintEdge(art, 'idle' | 'active' | 'blocked')`** — 관의 형편이 인자로만
 *   살고 어디에도 저장되지 않았다. `stroke` 와 `stroke-width` 에만 있던 값이다.
 *   이제 길(`path`)과 막은 목(`saturatedFrontier`)에서 파생된다.
 *
 * ── 아예 없던 상태 — 되돌린 자국과 막혔던 자리
 *
 * 이 조각이 말하려는 것은 "되돌릴 수 있다" 인데, 옮기기 전 화면에는 **되돌린
 * 흔적이 남지 않았다.** 가운데 관은 둘이 찼다가 밀려 나가 도로 비고, 완주 화면은
 * 처음과 똑같이 빈 관을 보인다 — 그래서 "다른 길로 흘렸다" 와 구별되지 않았다.
 * 막혔던 자리도 마찬가지다. 넷에서 막혔다는 것이 그 걸음의 캡션에만 있었고 다
 * 끝난 화면에는 여섯만 남았다. **그 둘의 순서가 이 조각의 논증**인데 완주 화면이
 * 그것을 말하지 않았다.
 *
 * `undone` 과 `stuck` 이 그 자리다. 둘 다 지워지지 않고 끝까지 남는다.
 *
 * **어휘를 가른다.** 되돌린 양을 살아 있는 흐름과 같은 모양(찬 차선)으로 그리면
 * "아직 흐르고 있다" 로 읽혀 조각이 말하려는 것의 정반대가 된다. 그래서 흐름은
 * 관 **안**의 채움이고, 되돌린 자국은 관 **바깥** 꼬리 곁의 작은 빈 네모다.
 *
 * ── 싣지 않는 것
 *
 * 되돌릴 폭도, 흐름표도, 누적량도, 몇 번째 길인지도 싣지 않는다. 전부 `flow` 와
 * `edges` 에서 나온다. 싣는 것은 **어느 길을 찾았나** 하나뿐이고 그것은 이 조각의
 * 알고리즘이 내리는 판정이라 장면이 되풀이하지 않는다. 어디까지 닿고 무엇이 막고
 * 있는지는 그 흐름표에 순수 함수를 먹여 여기서 셈한다 — **화면의 자취와 멈춤의
 * 근거가 같은 자료에서 나와야** 둘이 갈릴 자리가 없다.
 *
 * 좌표는 담지 않는다 (S-piece). 문안도 담지 않고 무엇을 말할지와 인자만 담는다 (C10).
 */

import { parseTarget, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

import type { UndoByBackEdgeEdge } from './algorithm.js';

/** 길의 한 걸음. `edge` 는 `scene.edges` 의 차례. */
export type UndoPathStep = { edge: number; reverse: boolean };

/**
 * 이번에 찾은 늘릴 길.
 *
 * `amount` 는 **찾은 그때의** 가장 좁은 목이다. 흘리고 나면 그 목이 이미 메워져
 * 다시 셈할 수 없으므로 계기값으로 쥔다 — 운동의 출발 그림을 앞 장면을 들추지
 * 않고 얻는 자리이기도 하다 (S-scene).
 */
export type UndoPath = {
  /** 길을 이루는 정점 차례. */
  nodes: string[];
  /** 걸음마다 역방향 화살을 탔는지. 길이 = `nodes.length - 1`. */
  reverse: boolean[];
  amount: number;
};

/** 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데 쓴다. */
export type UndoStepKind = 'path' | 'push' | 'blocked' | 'done';

export type UndoByBackEdgeScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  nodes: string[];
  edges: UndoByBackEdgeEdge[];
  source: string;
  sink: string;

  // ── 걸음이 고치는 것.
  /** 관마다 흘린 양. `edges` 와 같은 차례. **이 장면의 본체다.** */
  flow: number[];
  /** 지금 짚고 있는 길. 막히거나 끝나면 없다. */
  path: UndoPath | null;
  /** 관마다 되돌려 나간 누적량. `edges` 와 같은 차례. **지워지지 않는 자취다.** */
  undone: number[];
  /** 앞으로 난 화살만으로 막혔던 자리의 누적량. 역시 남는다. */
  stuck: number[];
  /** 흘린 횟수. 걸음이 오는 대로 센다 — 첫 흘림의 캡션이 다른 자리다. */
  pushes: number;
  finished: boolean;
  step: UndoStepKind | null;
};

/**
 * 되감기가 딛는 바탕.
 *
 * 흐름표도 자취도 넣지 않는다. 걸음이 고치는 것을 바탕과 같은 급으로 묶으면
 * 되감은 화면이 **이미 다 흘린 관**으로 서고, 그 위에 algorithm 이 새로 시작한
 * 첫 걸음이 겹쳐 화면 안에서 두 수가 어긋난다.
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다 — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다.
 */
type Base = Pick<UndoByBackEdgeScene, 'nodes' | 'edges' | 'source' | 'sink'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: Base): UndoByBackEdgeScene {
  return {
    nodes: base.nodes,
    edges: base.edges,
    source: base.source,
    sink: base.sink,
    flow: base.edges.map(() => 0),
    path: null,
    undone: base.edges.map(() => 0),
    stuck: [],
    pushes: 0,
    finished: false,
    step: null,
  };
}

// ── unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9) ──

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function flags(value: unknown): boolean[] {
  return Array.isArray(value) ? value.map((v) => v === true) : [];
}

/** 넘겨받은 선언에서 관을 좁힌다. 값만 베껴 담아 참조를 쥐지 않는다 (S-scene). */
function readEdges(value: unknown): UndoByBackEdgeEdge[] {
  if (!Array.isArray(value)) return [];
  const edges: UndoByBackEdgeEdge[] = [];
  for (const item of value) {
    const e = item as { from?: unknown; to?: unknown; capacity?: unknown };
    if (typeof e?.from !== 'string' || typeof e?.to !== 'string') continue;
    if (typeof e?.capacity !== 'number' || !Number.isFinite(e.capacity) || e.capacity <= 0) continue;
    edges.push({ from: e.from, to: e.to, capacity: e.capacity });
  }
  return edges;
}

/** `node:S` 들만 골라 정점 이름으로. 식별자 파싱은 `parseTarget` 을 경유한다 (원칙 4). */
function pathNodes(target: unknown): string[] {
  const arr = Array.isArray(target) ? target : target === undefined ? [] : [target];
  const out: string[] = [];
  for (const raw of arr) {
    if (typeof raw !== 'string') continue;
    const parsed = parseTarget(raw);
    if (parsed?.prefix === 'node' && parsed.id.length > 0) out.push(parsed.id);
  }
  return out;
}

// ── 구조에서 나오는 것들 ────────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 이 아래를 지난다. 되돌릴 폭도, 닿는 데까지의 경계도,
// 나가는 곳에 닿은 양도 payload 가 아니라 `flow` 와 `edges` 하나에서 풀린다.

/** `from → to` 로 난 관의 차례. 없으면 −1. */
function edgeAt(edges: UndoByBackEdgeEdge[], from: string, to: string): number {
  for (let i = 0; i < edges.length; i += 1) {
    if (edges[i].from === from && edges[i].to === to) return i;
  }
  return -1;
}

/**
 * 길을 관 차례로 편다. 한 걸음이라도 가리키는 관이 없으면 빈 목록이다.
 *
 * 역방향 걸음은 `nodes[i+1] → nodes[i]` 로 난 관을 거슬러 타는 것이다.
 */
export function pathSteps(
  edges: UndoByBackEdgeEdge[],
  path: { nodes: string[]; reverse: boolean[] },
): UndoPathStep[] {
  const out: UndoPathStep[] = [];
  for (let i = 0; i + 1 < path.nodes.length; i += 1) {
    const back = path.reverse[i] === true;
    const at = back
      ? edgeAt(edges, path.nodes[i + 1], path.nodes[i])
      : edgeAt(edges, path.nodes[i], path.nodes[i + 1]);
    if (at < 0) return [];
    out.push({ edge: at, reverse: back });
  }
  return out;
}

/** 그 걸음이 아직 통과시킬 수 있는 폭. 거슬러 가는 걸음은 찬 만큼이 폭이다. */
export function roomOf(
  edges: UndoByBackEdgeEdge[],
  flow: number[],
  step: UndoPathStep,
): number {
  return step.reverse ? flow[step.edge] : edges[step.edge].capacity - flow[step.edge];
}

/** 그 길에서 가장 좁은 목. 길이 비면 0. */
export function bottleneck(
  edges: UndoByBackEdgeEdge[],
  flow: number[],
  steps: UndoPathStep[],
): number {
  if (steps.length === 0) return 0;
  let least = Number.POSITIVE_INFINITY;
  for (const step of steps) {
    const room = roomOf(edges, flow, step);
    if (room < least) least = room;
  }
  return Number.isFinite(least) ? Math.max(0, least) : 0;
}

/**
 * 앞으로 난 화살만 타고 들어오는 곳에서 닿을 수 있는 정점들 (닿은 차례대로).
 *
 * 멈춤의 근거가 화면의 자취와 **같은 자료**에서 나오게 하는 자리다. 걸음이
 * 실어 오는 수로 받으면 되감아 세운 직후에 옛 화면의 것이 되어 어긋난다.
 */
export function forwardReachable(scene: UndoByBackEdgeScene): string[] {
  const seen = new Set<string>([scene.source]);
  const reached = [scene.source];
  const queue = [scene.source];
  while (queue.length > 0) {
    const u = queue.shift() as string;
    for (let i = 0; i < scene.edges.length; i += 1) {
      const e = scene.edges[i];
      if (e.from !== u || seen.has(e.to)) continue;
      if (e.capacity - scene.flow[i] <= 0) continue;
      seen.add(e.to);
      reached.push(e.to);
      queue.push(e.to);
    }
  }
  return reached;
}

/** 닿은 곳에서 못 닿은 곳으로 나가는데 꽉 차 버린 관들 — 앞을 막고 있는 것. */
export function saturatedFrontier(
  scene: UndoByBackEdgeScene,
  reachable: string[],
): number[] {
  const inside = new Set(reachable);
  const blocked: number[] = [];
  for (let i = 0; i < scene.edges.length; i += 1) {
    const e = scene.edges[i];
    if (!inside.has(e.from) || inside.has(e.to)) continue;
    if (e.capacity - scene.flow[i] > 0) continue;
    blocked.push(i);
  }
  return blocked;
}

/** 나가는 곳에 닿은 양 — 그리로 들어온 것에서 도로 나간 것을 뺀다. */
export function totalAt(scene: UndoByBackEdgeScene): number {
  let sum = 0;
  for (let i = 0; i < scene.edges.length; i += 1) {
    if (scene.edges[i].to === scene.sink) sum += scene.flow[i];
    if (scene.edges[i].from === scene.sink) sum -= scene.flow[i];
  }
  return sum;
}

/** 들어오는 곳에서 나갈 수 있는 최대치 — 눈금의 칸 수다. */
export function outCapacity(scene: UndoByBackEdgeScene): number {
  let sum = 0;
  for (const e of scene.edges) if (e.from === scene.source) sum += e.capacity;
  return sum;
}

/** 이 길이 되돌릴 폭을 타는가. */
export function usesReverse(path: UndoPath): boolean {
  return path.reverse.includes(true);
}

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type UndoCaption =
  | { kind: 'none' }
  | { kind: 'pathForward'; amount: number }
  | { kind: 'pathReverse'; amount: number }
  | { kind: 'pushFirst'; amount: number }
  | { kind: 'push'; amount: number; total: number }
  | { kind: 'pushReverse'; total: number }
  | { kind: 'blocked'; total: number }
  | { kind: 'done'; total: number };

/**
 * 지금 화면이 말할 것.
 *
 * 걸음과 따로 쥐지 않는다 — 같은 것을 두 자리에 적으면 언젠가 갈린다.
 */
export function captionOf(scene: UndoByBackEdgeScene): UndoCaption {
  switch (scene.step) {
    case 'path': {
      if (scene.path === null) break;
      return usesReverse(scene.path)
        ? { kind: 'pathReverse', amount: scene.path.amount }
        : { kind: 'pathForward', amount: scene.path.amount };
    }
    case 'push': {
      if (scene.path === null) break;
      const total = totalAt(scene);
      if (usesReverse(scene.path)) return { kind: 'pushReverse', total };
      if (scene.pushes <= 1) return { kind: 'pushFirst', amount: scene.path.amount };
      return { kind: 'push', amount: scene.path.amount, total };
    }
    case 'blocked':
      return { kind: 'blocked', total: totalAt(scene) };
    case 'done':
      return { kind: 'done', total: totalAt(scene) };
    default:
      break;
  }
  return { kind: 'none' };
}

export const undoByBackEdgeScene: ScenePlan<UndoByBackEdgeScene> = {
  /**
   * 첫 화면은 아무것도 흐르지 않은 관들이다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 그 안의 객체를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): UndoByBackEdgeScene {
    const d = (initialData ?? {}) as {
      nodes?: unknown;
      edges?: unknown;
      source?: unknown;
      sink?: unknown;
    };
    return atStart({
      nodes: names(d.nodes),
      edges: readEdges(d.edges),
      source: str(d.source),
      sink: str(d.sink),
    });
  },

  reduce(scene: UndoByBackEdgeScene, event: FacetRuntimeEvent): UndoByBackEdgeScene {
    switch (event.type) {
      // 늘릴 길을 하나 찾았다. 아직 흘리기 전이다.
      case 'path-found': {
        const p = (event.payload ?? {}) as { reverse?: unknown };
        const nodes = pathNodes(event.target);
        const reverse = flags(p.reverse);
        if (nodes.length < 2) return scene;
        const steps = pathSteps(scene.edges, { nodes, reverse });
        if (steps.length !== nodes.length - 1) return scene;
        return {
          ...scene,
          path: { nodes, reverse, amount: bottleneck(scene.edges, scene.flow, steps) },
          step: 'path',
        };
      }

      // 그 길로 흘린다. 거슬러 가는 걸음에서는 앞서 찬 것이 그만큼 밀려 나간다.
      case 'flow-pushed': {
        const path = scene.path;
        if (path === null || path.amount <= 0) return scene;
        const steps = pathSteps(scene.edges, path);
        if (steps.length === 0) return scene;
        const flow = [...scene.flow];
        const undone = [...scene.undone];
        for (const step of steps) {
          if (step.reverse) {
            flow[step.edge] -= path.amount;
            undone[step.edge] += path.amount;
          } else {
            flow[step.edge] += path.amount;
          }
        }
        return { ...scene, flow, undone, pushes: scene.pushes + 1, step: 'push' };
      }

      // 앞으로 난 화살로는 더 갈 데가 없다. 그 자리를 눈금에 남긴다.
      case 'search-blocked':
        return {
          ...scene,
          path: null,
          stuck: [...scene.stuck, totalAt(scene)],
          step: 'blocked',
        };

      // 되돌릴 폭으로도 남은 길이 없다.
      case 'done':
        return { ...scene, path: null, finished: true, step: 'done' };

      // 바탕만 남기고 처음으로. 흐름표도 자취도 선언에서 다시 셈한다.
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
