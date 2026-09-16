/**
 * markVisitedOrLoop 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 밟은 자리를 밟은 차례대로 적은 줄 하나 — `trail` — 가 거의 전부다. 지금 서 있는
 * 자리도, 어느 길을 몇 번 밟았나도, 어디에 표시가 남았나도, 끝내 닿지 못한 자리가
 * 어디인가도 전부 그 줄에서 나온다. 걸음이 따로 실어 올 것이 아니다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었다. 상태는 전부 stage 의 mount 스코프에 있었고,
 * 그중 둘은 **이 조각의 주장 그 자체**인데 되돌리는 길이 `resetState()` 뿐이었다.
 *
 * - **`wear: Map<간선, 횟수>`** — 같은 길을 몇 번 밟았나. 표시 없는 회차가 고리 셋만
 *   네 겹으로 닳게 하고 바깥으로 난 길은 새것으로 남기는 것이 이 조각의 주장인데,
 *   그 셈이 `moveToken()` 의 부수 효과로만 쌓였다. 되짚으면 자국이 통째로 사라진다.
 *   이제 `trail` 의 이웃한 두 자리에서 파생한다 (`wearOf`) — 따로 담으면 같은 것을
 *   두 자리에서 세는 꼴이 된다.
 * - **`strikeEdges: string[]`** — 짚어 보고 건너뛴 이웃. `clearStrikes()` 가 다음
 *   걸음마다, 그리고 **맺는 걸음에서도** 걷어 냈다. 그래서 "C 에서 A 를 건너뛰고
 *   D 로 나갔다" 가 완주 화면에 남지 않았다 — 표시를 읽는 회차의 결론이 바로 그
 *   건너뜀인데 그것이 지워지고 있었다. 이제 `skipped` 가 회차 내내 쌓아 둔다.
 * - **`markEls: Map<자리, 고리>`** — DOM 손잡이와 "이 자리에 표시가 있나" 가 한
 *   객체에 묶여 있었고, `markEls.has(node)` 가 그것을 묻는 유일한 자리였다. 표시는
 *   다녀간 자리의 기록이므로 `marks` 와 `trail` 에서 파생한다 (`markedOf`).
 * - **`missed: Set<string>`** · **`current`** · **`lastEdge`** — 셋 다 `trail` 과
 *   바탕에서 나온다. 걸음이 실어 오던 것을 장면이 센다.
 *
 * ── 좌표도 문안도 담지 않는다
 *
 * 고리를 어디에 그릴지는 `adjacency` 가 정하는 것이라 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 캡션은 무엇을 말할지와 인자만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 그림의 바탕. 걸음이 고치지 않는다. */
export type MarkVisitedOrLoopGraph = {
  nodes: readonly string[];
  /** 이웃을 보는 순서. 배열 순서가 곧 규칙이다. */
  adjacency: Readonly<Record<string, readonly string[]>>;
  start: string;
  /** 표시 없는 회차를 끊는 걸음 상한. 자국 띠의 칸 수도 이것이 정한다. */
  maxSteps: number;
};

/** 짚어 보고 건너뛴 이웃 하나. 회차가 끝날 때까지 쌓인다. */
export type MarkVisitedOrLoopSkip = { from: string; to: string };

/**
 * 방금 밟은 걸음의 종류. **무엇을 흐르게 할지 고르는 데만** 쓴다 (S-scene).
 *
 * 인자를 달지 않는다 — 어디서 어디로 갔는지도, 무엇을 건너뛰었는지도 `trail` 과
 * `skipped` 의 끝자리가 이미 말한다. 걸음에 도로 실으면 방금 걷어낸 "두 출처" 를
 * 운동 쪽으로 다시 들이는 꼴이 된다.
 */
export type MarkVisitedOrLoopStep = 'begin' | 'move' | 'skip' | 'stalled' | 'escaped';

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type MarkVisitedOrLoopCaption =
  | { kind: 'noMarks' }
  | { kind: 'marksOn' }
  | { kind: 'alreadyMarked'; to: string }
  /** 인자를 담지 않는다 — 걸음 수도 밟은 자리도 닿지 못한 자리도 `trail` 에서 나온다. */
  | { kind: 'stillInside' }
  | { kind: 'wentOut' };

export type MarkVisitedOrLoopScene = {
  graph: MarkVisitedOrLoopGraph;
  /** 이 회차가 표시를 읽는가. 걸음이 내리는 판정이라 `walk-begin` 이 싣는다. */
  marks: boolean;
  /**
   * 밟은 자리를 밟은 차례대로. **이 조각이 화면에 대해 아는 거의 전부.**
   *
   * 비어 있으면 아직 아무도 걷기 전이다.
   */
  trail: readonly string[];
  /** 짚어 보고 건너뛴 이웃들. 회차 안에서 지우지 않는다 — 쌓이는 것이 곧 주장이다. */
  skipped: readonly MarkVisitedOrLoopSkip[];
  /** 회차의 결말. `null` 이면 아직 걷는 중이다. */
  ending: 'stalled' | 'escaped' | null;
  step: MarkVisitedOrLoopStep | null;
  caption: MarkVisitedOrLoopCaption | null;
};

/**
 * 걸음이 고치지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * `trail` · `skipped` · `marks` · `ending` 은 **여기 들지 않는다** — 전부 걸어오며
 * 쌓은 것이라 되감기에 그대로 넘기면 되감은 화면이 이미 다 돌아간 채로 선다.
 */
type MarkVisitedOrLoopBase = Pick<MarkVisitedOrLoopScene, 'graph'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: MarkVisitedOrLoopBase): MarkVisitedOrLoopScene {
  return {
    graph: base.graph,
    marks: false,
    trail: [],
    skipped: [],
    ending: null,
    step: null,
    caption: null,
  };
}

// ── 좁히개. 생산자가 같은 패키지라도 경계는 경계다 (C9). ──────────────────────

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 초기 자료의 정점 목록을 **값으로 복사**한다. 참조를 쥐지 않는다 (S-scene). */
function nodeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) out.push(item);
  }
  return out;
}

/** 이웃표도 값으로 복사한다. 알고리즘이 쥔 객체와 같은 것을 가리키면 안 된다. */
function adjacencyOf(value: unknown, nodes: string[]): Record<string, string[]> {
  const known = new Set(nodes);
  const out: Record<string, string[]> = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
    if (!known.has(key)) continue;
    out[key] = Array.isArray(list)
      ? list.filter((v): v is string => typeof v === 'string' && known.has(v))
      : [];
  }
  return out;
}

// ── 장면에서 파생하는 것들. **수는 한 자리에서만 센다.** ──────────────────────

/** 무방향 간선의 이름. 어느 쪽에서 밟았든 같은 길이다. */
export function edgeKeyOf(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 지금 서 있는 자리. 아직 걷기 전이면 `null`. */
export function currentOf(scene: MarkVisitedOrLoopScene): string | null {
  return scene.trail.length === 0 ? null : (scene.trail[scene.trail.length - 1] ?? null);
}

/** 방금 옮겨 온 마디. 걸음 수가 0 이면 `null`. */
export function lastMoveOf(scene: MarkVisitedOrLoopScene): MarkVisitedOrLoopSkip | null {
  const n = scene.trail.length;
  if (n < 2) return null;
  const from = scene.trail[n - 2];
  const to = scene.trail[n - 1];
  if (from === undefined || to === undefined) return null;
  return { from, to };
}

/** 걸음 수. 밟은 자리가 하나 늘 때마다 하나다. */
export function stepsOf(scene: MarkVisitedOrLoopScene): number {
  return Math.max(0, scene.trail.length - 1);
}

/** 밟은 자리 — 처음 밟은 차례대로, 중복 없이. */
export function reachedOf(scene: MarkVisitedOrLoopScene): string[] {
  return [...new Set(scene.trail)];
}

/** 끝내 닿지 못한 자리. **결말이 난 뒤에만 뜻이 있다** — 걷는 중에는 아직 닿을 수 있다. */
export function missedOf(scene: MarkVisitedOrLoopScene): string[] {
  const reached = new Set(scene.trail);
  return scene.graph.nodes.filter((n) => !reached.has(n));
}

/**
 * 표시가 남은 자리.
 *
 * 표시란 다녀간 자리의 기록이고, 표시를 읽는 회차에서만 그것이 화면에 선다. 그래서
 * 따로 담을 것이 없다 — algorithm 도 같은 이유로 `marked` 를 따로 두지 않는다.
 */
export function markedOf(scene: MarkVisitedOrLoopScene): string[] {
  return scene.marks ? reachedOf(scene) : [];
}

/** 길마다 몇 번 밟혔나. 자국의 깊이가 이 셈에서 나온다. */
export function wearOf(scene: MarkVisitedOrLoopScene): Map<string, number> {
  const wear = new Map<string, number>();
  for (let i = 1; i < scene.trail.length; i += 1) {
    const from = scene.trail[i - 1];
    const to = scene.trail[i];
    if (from === undefined || to === undefined) continue;
    const key = edgeKeyOf(from, to);
    wear.set(key, (wear.get(key) ?? 0) + 1);
  }
  return wear;
}

export const markVisitedOrLoopScene: ScenePlan<MarkVisitedOrLoopScene> = {
  /**
   * 첫 장면은 그래프만 세운다. 걷는 이는 아직 없다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 이웃표를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게
   * 된다 (S-scene).
   */
  initial(initialData: unknown): MarkVisitedOrLoopScene {
    const d = (initialData ?? {}) as {
      nodes?: unknown;
      adjacency?: unknown;
      start?: unknown;
      maxSteps?: unknown;
    };
    const nodes = nodeList(d.nodes);
    const start = str(d.start);
    const maxSteps =
      typeof d.maxSteps === 'number' && d.maxSteps > 0 ? Math.floor(d.maxSteps) : nodes.length;
    return atStart({
      graph: {
        nodes,
        adjacency: adjacencyOf(d.adjacency, nodes),
        start: nodes.includes(start) ? start : (nodes[0] ?? ''),
        maxSteps,
      },
    });
  },

  reduce(scene: MarkVisitedOrLoopScene, event: FacetRuntimeEvent): MarkVisitedOrLoopScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 회차가 열린다. 앞 회차의 자취를 통째로 거두고 출발 자리에 선다.
      case 'walk-begin': {
        if (scene.graph.start === '') return scene;
        const marks = p.marks === true;
        return {
          ...atStart({ graph: scene.graph }),
          marks,
          trail: [scene.graph.start],
          step: 'begin',
          caption: marks ? { kind: 'marksOn' } : { kind: 'noMarks' },
        };
      }

      // 한 자리 옮긴다. 출발 자리는 `trail` 의 끝자리라 실어 올 것이 없다.
      case 'step-move': {
        const to = str(p.to);
        if (to === '' || scene.trail.length === 0) return scene;
        return {
          ...scene,
          trail: [...scene.trail, to],
          step: 'move',
          // 걸음 자체는 말이 없다 — 회차를 연 캡션이 그대로 남는다.
          caption: scene.caption,
        };
      }

      // 이미 표시가 있는 이웃을 짚어 보고 건너뛴다. 어디서 짚었는지는 지금 자리다.
      case 'skip-neighbor': {
        const to = str(p.to);
        const from = currentOf(scene);
        if (to === '' || from === null) return scene;
        return {
          ...scene,
          skipped: [...scene.skipped, { from, to }],
          step: 'skip',
          caption: { kind: 'alreadyMarked', to },
        };
      }

      // 고리에 갇힌 채 상한에 걸렸다. 닿지 못한 자리가 남는다.
      case 'walk-stalled':
        return { ...scene, ending: 'stalled', step: 'stalled', caption: { kind: 'stillInside' } };

      // 갈 곳이 없어 멈췄는데 모든 자리를 밟았다 — 고리 바깥으로 나간 것이다.
      case 'walk-escaped':
        return { ...scene, ending: 'escaped', step: 'escaped', caption: { kind: 'wentOut' } };

      // 자동 재생의 끝. 화면은 그대로이고 흐를 것만 없앤다.
      case 'done':
        return { ...scene, step: null };

      // 한 걸음씩 보기로 되감는다. 걸어온 자취를 전부 거두고 바탕만 남긴다.
      case 'rewind':
        return atStart({ graph: scene.graph });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
