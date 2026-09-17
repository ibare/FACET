/**
 * adjacencyListVsMatrix 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 왼쪽에 인접 리스트, 오른쪽에 인접 행렬이 나란히 선다. 간선이 놓일 때마다 목록은
 * 칸을 하나씩 붙여 자라고, 표는 이미 잡아 둔 칸의 값만 0 에서 1 로 뒤집는다.
 * 물음이 시작되면 커서가 칸을 하나씩 짚고 **짚은 자리마다 표식이 남는다** — 그
 * 표식의 수가 곧 그 물음의 비용이다. 물음이 끝나면 그 자취가 아래 결과 줄로
 * 굳고, 다음 물음의 줄이 그 아래 앉는다. **끝 화면에 네 수가 나란히 남는다** —
 * 물음 1 은 표가 싸고(2 대 1), 물음 2 는 목록이 싸다(2 대 5).
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 도 조회 분기도 하나도 없었다 (①③ 0 건). ④ 도 0 건이었다.
 * 숨은 자리는 전부 stage 의 `let` 과 **타입 선언**에 있었다.
 *
 * - **`LayoutState.matrixCells: Map<string, { rect, text }>`** — 표에 무엇이 들어
 *   있나가 **`text.textContent` 의 글자 '0'/'1' 에만** 있었다. DOM 손잡이와 값이
 *   한 객체에 묶여 `const` 도 `let` 도 아닌 채 판의 형편을 통째로 쥐고 있었다.
 *   이제 `placed` 가 그것을 말하고 표와 목록이 **같은 인접 리스트**에서 나온다.
 * - **목록 칸은 적히는 자리조차 없었다.** `addEdge` 가 `content` 에 rect 와 label 을
 *   붙이고 손잡이를 버렸다 — "목록에 무엇이 들어 있나" 를 말하는 변수가 코드
 *   어디에도 없었다. 화면이 통째로 상태였던 자리다.
 * - **`let cursor` / `let cursorCount`** — 커서 하나가 옮겨 다니며 짚었고, 짚은
 *   자취는 아무 데도 남지 않았다. 그래서 "몇 번 봤나" 가 화면에서 세어지지
 *   않았고, 커서의 **출발 자리**는 DOM 의 지금 x/y (CSS transition 이 읽는 값) 였다.
 *   이제 `current.probes` 가 자취를 쥐고 `step.from` 이 출발 자리를 싣는다.
 * - **`AdjacencyScanArgs.matched` 가 커서 테두리 색 한 축에 두 뜻을 실었다** —
 *   `accent`(이 칸이 답이다) 와 `itemComparing`(지금 보는 중)이 같은 속성을 다퉜다.
 *   이제 **채움 = 값의 형편 · 테두리 = 짚음의 표식**으로 축을 가른다.
 * - **`showResult` 의 배지가 같은 y 에 두 번 그려졌다** — 물음 2 의 두 배지가
 *   물음 1 의 것을 덮어, 이 조각이 자랑하려던 네 수 중 둘이 완주 화면에서
 *   사라지고 있었다. 이제 `runs` 가 물음마다 줄을 하나씩 쌓는다.
 *
 * 비용 두 수는 이제 **자취를 센 것**이다. 옛 `query-done` 은 `listCost` ·
 * `matrixCost` 를 실어 왔는데, 그것이 이 조각의 결론이면서 화면의 자취와 다른
 * 출처였다. 지금은 `costOf(run, side)` 하나가 살아 있는 눈금과 굳은 결과 줄을
 * 함께 센다.
 *
 * 좌표는 담지 않는다. 정점의 차례와 칸의 **번호**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { adjacencyOf } from './algorithm.js';

/** 두 그릇 중 어느 쪽인가. */
export type AdjacencySide = 'list' | 'matrix';

/** 짚은 칸 하나. 어느 그릇의 몇 번째 칸인가 — 자리는 그리는 쪽이 셈한다. */
export type AdjacencyProbe = { side: AdjacencySide; cellIndex: number };

/**
 * 물음 하나와 그 물음이 남긴 자취.
 *
 * 비용을 수로 담지 않는다 — `probes` 가 곧 비용이고, 그것을 세는 자리는
 * `costOf` 하나뿐이다. `query-done` 은 이 객체를 **그대로** `runs` 에 얹으므로
 * 굳은 줄과 살아 있는 눈금이 같은 객체를 본다.
 */
export type AdjacencyRun = { question: 1 | 2; probes: AdjacencyProbe[] };

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * `scan` 의 `from` 이 커서의 **출발 자리**다. 그것을 `prev` 에서 꺼내면 "`prev` 는
 * 고르는 데만" 을 어기고 (S-scene), 화면의 지금 자리를 되읽으면 되짚어 세운
 * 직후에 옛 자리에서 출발한다.
 */
export type AdjacencySceneStep =
  | { kind: 'edge' }
  | { kind: 'ask' }
  | { kind: 'scan'; from: AdjacencyProbe | null }
  | { kind: 'settle' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). 수는 장면이 센다. */
export type AdjacencySceneCaption =
  | { kind: 'init' }
  | { kind: 'ask'; question: 1 | 2 }
  | { kind: 'result' };

export type AdjacencyListVsMatrixScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 정점 이름. 차례가 곧 표의 행/열 차례다. 선언에서 값으로 베껴 온다. */
  vertices: string[];
  /**
   * 선언된 간선 전체에서 가장 큰 이웃 수.
   *
   * 목록 칸의 **폭**을 정하는 데만 쓴다 — 지금까지 놓인 칸에서 내면 간선이 하나
   * 늘 때마다 폭이 갈려 이미 앉은 칸들이 흔들린다. 간선 목록 자체를 바탕에
   * 두지 않는 것은, 두면 아직 놓이지 않은 간선까지 그릴 문이 열리기 때문이다.
   */
  maxDegree: number;

  // ── 걸음이 고치는 것.
  /** 지금까지 두 그릇에 놓인 간선. 놓인 차례대로. 목록도 표도 이것에서 나온다. */
  placed: [string, string][];
  /** 지금 묻고 있는 물음과 그 자취. 아직 안 물었으면 null. */
  current: AdjacencyRun | null;
  /** 매듭지어진 물음들. 끝 화면에 줄로 나란히 남는다. */
  runs: AdjacencyRun[];
  step: AdjacencySceneStep | null;
  caption: AdjacencySceneCaption;
};

/**
 * 걸음이 바꾸지 않는 부분.
 *
 * 걸음이 고치는 것(`placed` · `current` · `runs` · `step` · `caption`)은 들지
 * 않는다 — 그대로 넘기면 되감아도 걸어온 자취가 남는다. 호출부는 **객체
 * 리터럴**로 넘겨야 초과 속성 검사가 돌아 이 좁히기가 실제로 막는다.
 */
type AdjacencyBase = Pick<AdjacencyListVsMatrixScene, 'vertices' | 'maxDegree'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: AdjacencyBase): AdjacencyListVsMatrixScene {
  return {
    vertices: base.vertices,
    maxDegree: base.maxDegree,
    placed: [],
    current: null,
    runs: [],
    step: null,
    caption: { kind: 'init' },
  };
}

/**
 * 한 물음이 그 그릇에서 짚은 칸의 수 — 곧 그 물음의 비용.
 *
 * 화면의 눈금도 결과 줄도 이것 하나를 부른다. 걸음이 실어 오던 `listCost` ·
 * `matrixCost` 가 하던 말이고, 이제 자취를 센 것이다.
 */
export function costOf(run: AdjacencyRun | null, side: AdjacencySide): number {
  if (!run) return 0;
  let n = 0;
  for (const probe of run.probes) {
    if (probe.side === side) n += 1;
  }
  return n;
}

/** 표가 처음부터 잡아 두는 칸의 수. 정점 수의 제곱 — 구조에서 센다. */
export function reservedCells(scene: AdjacencyListVsMatrixScene): number {
  return scene.vertices.length * scene.vertices.length;
}

/**
 * 지금까지 놓인 간선이 만드는 인접 리스트.
 *
 * 목록 패널의 칸도, 표에서 켜진 칸도 전부 여기서 나온다 — 두 그릇이 같은 사실을
 * 담는다는 것이 이 조각의 전제이므로 출처도 하나여야 한다. algorithm 이 걸음을
 * 짤 때 쓰는 함수를 그대로 부른다.
 */
export function listsOf(scene: AdjacencyListVsMatrixScene): Map<string, string[]> {
  return adjacencyOf(scene.vertices, scene.placed);
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') out.push(item);
  }
  return out;
}

function pairs(value: unknown): [string, string][] {
  if (!Array.isArray(value)) return [];
  const out: [string, string][] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [a, b] = item;
    if (typeof a === 'string' && typeof b === 'string') out.push([a, b]);
  }
  return out;
}

function question(value: unknown): 1 | 2 {
  return value === 2 ? 2 : 1;
}

function side(value: unknown): AdjacencySide | null {
  return value === 'list' || value === 'matrix' ? value : null;
}

function cellIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const i = Math.trunc(value);
  return i >= 0 ? i : null;
}

export const adjacencyListVsMatrixScene: ScenePlan<AdjacencyListVsMatrixScene> = {
  /**
   * 첫 장면은 빈 목록과 다 잡혀 있는 표다.
   *
   * 넘겨받은 선언을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene). 정점은 값으로 베껴 두고, 간선 목록은 아예 쥐지 않고 목록 칸의
   * 폭을 정하는 수 하나로만 접어 둔다.
   */
  initial(initialData: unknown): AdjacencyListVsMatrixScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const vertices = strings(d.vertices);
    const declared = adjacencyOf(vertices, pairs(d.edges));
    let maxDegree = 1;
    for (const list of declared.values()) maxDegree = Math.max(maxDegree, list.length);
    return atStart({ vertices, maxDegree });
  },

  reduce(
    scene: AdjacencyListVsMatrixScene,
    event: FacetRuntimeEvent,
  ): AdjacencyListVsMatrixScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 간선 하나가 두 그릇에 동시에 놓인다. 목록에서 몇 번째 칸인가는 놓인
      // 차례가 이미 말하므로 여기서 다시 세지 않는다.
      case 'edge-added': {
        const a = typeof p.a === 'string' ? p.a : null;
        const b = typeof p.b === 'string' ? p.b : null;
        if (a === null || b === null) return scene;
        return { ...scene, placed: [...scene.placed, [a, b]], step: { kind: 'edge' } };
      }

      // 새 물음. 앞 물음의 자취는 여기서 걷힌다 — 물음마다 제 비용을 세야
      // 하므로 표식이 넘어오면 안 된다. 굳은 줄(`runs`)은 그대로 남는다.
      case 'query-begin': {
        const q = question(p.question);
        return {
          ...scene,
          current: { question: q, probes: [] },
          step: { kind: 'ask' },
          caption: { kind: 'ask', question: q },
        };
      }

      // 칸 하나를 짚는다. 출발 자리는 바로 앞의 표식이다.
      case 'scan-step': {
        const s = side(p.side);
        const i = cellIndex(p.cellIndex);
        const run = scene.current;
        if (s === null || i === null || run === null) return scene;
        const from = run.probes[run.probes.length - 1] ?? null;
        return {
          ...scene,
          current: { question: run.question, probes: [...run.probes, { side: s, cellIndex: i }] },
          step: { kind: 'scan', from },
        };
      }

      // 물음이 매듭지어진다. 자취를 그대로 줄로 얹는다 — 세는 일은 `costOf` 가
      // 그릴 때 한 번만 한다.
      case 'query-done': {
        const run = scene.current;
        if (run === null) return scene;
        return {
          ...scene,
          runs: [...scene.runs, run],
          step: { kind: 'settle' },
          caption: { kind: 'result' },
        };
      }

      case 'rewind':
        return atStart({ vertices: scene.vertices, maxDegree: scene.maxDegree });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
