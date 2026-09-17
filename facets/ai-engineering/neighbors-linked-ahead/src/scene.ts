/**
 * neighborsLinkedAhead 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었고 조회로 갈리는 분기도, 화면을 되읽는 자리도
 * 없었다. **상태는 전부 stage 에 있었고 네 자리였다.**
 *
 * - **`let trailD = ''` — SVG 경로 문자열이 곧 자취였다.** 지나온 길이
 *   `"M 120.4 88.1 L … L …"` 이라는 **글자에만** 쌓였다. `stepTo` 가 그 글자를 읽어
 *   (`const base = trailD === '' ? … : trailD`) 뒤에 새 도막을 이어 붙이고 도로 적는,
 *   자기 글자를 되읽어 덧붙이는 짜임이다. 같은 걸음을 두 번 그리면 도막이 두 벌
 *   쌓이고, 되짚어 세운 직후에는 그 글자가 옛 화면의 것이라 엉뚱한 자리에서 길이
 *   뻗는다. `let` grep 에는 걸리지만 그것이 **이 조각의 자취 그 자체**라는 것은 눈으로만
 *   보인다. 지금은 `path`(밟은 자리들)가 그것을 쥐고, 경로 문자열은 `path` 에서
 *   매번 다시 만들어지는 **파생값**이다.
 * - **`let settleRing: SVGElement | null` — `null` 이냐 아니냐가 "멎었나" 였다.**
 *   `resetWalk()` 의 분기(`if (settleRing !== null)`)가 오직 여기 있었고, 되감을 때
 *   손으로 떼어 내야 했다. 지금은 `settled` 가 말한다.
 * - **`dotEls[i]` 의 `stroke` 칠 — 어느 점을 밟았나.** `placeFoot` 과 `stepTo` 가
 *   밟은 점의 테두리를 `itemActive` 로 갈아 끼우는 것이 밟은 자리의 유일한 기록이었고,
 *   `resetWalk` 이 열둘을 전부 되돌려야 했다. 지금은 `path` 가 그 목록이다.
 * - **`gProbe` 의 자식 유무 — 지금 이웃을 살펴본 자리에 서 있나.** `clear(gProbe)` 가
 *   `stepTo`·`settle`·`probe` 첫머리마다 돌아 그 층을 비웠다. 자식이 있느냐가 곧
 *   국면이었다. 지금은 `probes.length === path.length` 가 그 답이다.
 *
 * ── 무엇을 싣고 무엇을 세는가 (프로토콜 2-4 절의 갈래)
 *
 * **이웃 중에서 질의에 더 가까운 것을 고르는 셈은 이 조각의 알고리즘 그 자체**라
 * 내주지 않는다. 그래서 걸음이 싣는 것은 **판정 하나**뿐이다 — `probe.best`.
 *
 * 반대로 **미리 이어 둔 길은 이 조각이 말하는 바가 아니라 그 앞의 전제**다.
 * description 이 "이 조각이 말하지 않는 것" 으로 그래프 짓기를 못박고 있으므로,
 * 잣대("그 함수만 떼어 내도 조각이 말하려는 바가 남아 있는가")에 걸리지 않는다.
 * `nearestNeighbors` 와 `undirectedLinks` 를 algorithm 이 내주고 여기서 부른다 —
 * 같은 규칙이 두 벌이 되지 않게.
 *
 * 나머지는 전부 걷어냈다.
 *
 * - `graph-ready.links` · `.k` · `.start` — 길도 이웃 수도 출발점도 바탕에서 나온다.
 * - `probe.from` — 선 자리는 자취의 끝(`path` 의 마지막 칸)이다.
 * - `probe.candidates` — 선 자리의 이웃 목록은 `adjacency[from]` 이다.
 * - `step-to.from` · `.to` — 어디서 어디로 가는지는 **바로 앞 probe 가 이미 말했다.**
 *   판정은 한 번만 실린다.
 * - `settle.at` — 멎은 자리도 자취의 끝이다.
 *
 * 그래서 화면의 길과 캡션의 수와 "여기가 답이다" 라는 결론이 **한 자취를 지난다.**
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 점의 화면 자리는 캔버스에서 역산하는 값이라 그리는 쪽의
 * 몫이다 (S-piece). 담는 것은 **값의 자리**다. 문안도 담지 않는다 — `phaseOf` 가
 * 무엇을 말할지와 그 인자만 내고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { nearestNeighbors, undirectedLinks } from './algorithm.js';

/** 자리 하나. 화면 좌표가 아니라 데이터 좌표다. */
export type ScenePt = { x: number; y: number };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 발이 어디서 떠나는지도, 살이 어디서 뻗는지도 전부
 * 자취 한 칸을 물려 셈하므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type NeighborsStep =
  /** 미리 이어 둔 길이 놓이고 첫 발이 오른다. */
  | { kind: 'lay' }
  /** 선 자리의 이웃을 본다 — 이웃마다 질의까지 줄을 뻗어 견준다. */
  | { kind: 'probe' }
  /** 발을 옮긴다. 활을 그리며 자취가 한 도막 늘어난다. */
  | { kind: 'walk' }
  /** 나아갈 데가 없어 멎는다. */
  | { kind: 'settle' };

/**
 * 지금 화면이 서 있는 국면. 걸음이 아니라 **자취**에서 나온다.
 *
 * 같은 걸음을 몇 번 다시 그려도 같은 국면이 나와야 하고, 장면에 국면 필드를 따로
 * 두면 같은 것을 두 자리에 적는 꼴이다.
 */
export type NeighborsPhase =
  /** 아직 길도 안 놓였다. 점과 질의만 서 있다. */
  | { kind: 'idle' }
  /** `at` 에 서 있고 아직 이웃을 안 봤다. `first` 면 막 길이 놓인 참이다. */
  | { kind: 'stood'; at: number; first: boolean }
  /** `at` 에 서서 이웃을 봤다. `best` 가 더 가까운 이웃이고, 없으면 null. */
  | { kind: 'probed'; at: number; best: number | null }
  /** 멎었다. `hops` 는 건너뛴 걸음 수다. */
  | { kind: 'done'; at: number; hops: number };

export type NeighborsLinkedAheadScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 평면 위의 점들. 차례가 곧 발신과 이웃 목록이 가리키는 번호다. */
  points: readonly ScenePt[];
  /** 찾아갈 자리. */
  query: ScenePt;
  /** 점 하나가 들고 있는 이웃의 수. 길이 여기서 나온다. */
  k: number;
  /** 걸음을 시작하는 점의 번호. */
  start: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 밟은 자리들, 밟은 차례대로. 비어 있으면 아직 길도 안 놓였다.
   *
   * **지나온 길이 여기 그대로 남는다** — 그래서 완주 화면에 "이만큼 건너뛰었다" 가
   * 보인다. 옛 화면은 이것을 SVG 경로 글자에만 쌓아 두고 있었다.
   */
  path: readonly number[];
  /**
   * 걸음마다의 판정. `probes[i]` 는 `path[i]` 에 서서 고른 이웃이고, 나아질 데가
   * 없었으면 null 이다.
   *
   * 길이가 `path` 와 같으면 **지금 선 자리에서 이웃을 본 참**이고, 하나 적으면
   * 막 발을 옮겨 아직 안 본 참이다. 국면이 여기서 갈린다.
   */
  probes: readonly (number | null)[];
  /** 멎었나. 자취의 끝이 곧 답이 된다. */
  settled: boolean;

  step: NeighborsStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `path` · `probes` · `settled` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은
 * 화면이 이미 다 걸어간 길을 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 걷는 것이 겹친다 (S-scene).
 */
type Base = Pick<NeighborsLinkedAheadScene, 'points' | 'query' | 'k' | 'start'>;

/**
 * 되돌린 뒤의 장면 — 점과 질의만 제자리에 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): NeighborsLinkedAheadScene {
  return {
    points: base.points,
    query: base.query,
    k: base.k,
    start: base.start,
    path: [],
    probes: [],
    settled: false,
    step: null,
  };
}

// ── 선언 좁히기 ─────────────────────────────────────────────────────────────
//
// 생산자가 같은 패키지라도 경계는 경계다 (C9). 좁히는 자리는 여기 하나이고 그리는
// 쪽은 장면만 받는다 — 두 벌이 되면 점의 수와 이웃 수가 갈린다.

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPt(value: unknown): ScenePt | null {
  const p = fields(value);
  const x = num(p?.x);
  const y = num(p?.y);
  return x === null || y === null ? null : { x, y };
}

/** 자리 목록. 값만 베껴 새 배열로 돌려준다 — 넘겨받은 것을 참조로 쥐지 않는다. */
function readPts(raw: unknown): ScenePt[] {
  if (!Array.isArray(raw)) return [];
  const out: ScenePt[] = [];
  for (const item of raw) {
    const p = readPt(item);
    if (p !== null) out.push(p);
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 길도 표식도 캡션의 수도 전부 여기를 지난다. 갈릴 자리가 없다.

/** 미리 이어 둔 길. 바탕에서 매번 셈한다 — 장면이 쥐는 것은 점과 이웃 수다. */
export type NeighborsGraph = {
  /** 점마다 가장 가까운 k 개. */
  adjacency: number[][];
  /** 그릴 변 한 벌. 같은 변이 두 번 오지 않는다. */
  links: [number, number][];
};

/**
 * 바탕에서 길을 셈한다.
 *
 * algorithm 이 내준 함수를 그대로 부른다 — 여기서 다시 적으면 좌표를 고쳤을 때
 * 걷는 길과 그린 길이 갈린다.
 */
export function graphOf(scene: NeighborsLinkedAheadScene): NeighborsGraph {
  const adjacency = nearestNeighbors(
    scene.points.map((p) => ({ x: p.x, y: p.y })),
    scene.k,
  );
  return { adjacency, links: undirectedLinks(adjacency) };
}

/** 지금 발이 선 자리. 아직 안 올랐으면 null. */
export function standing(scene: NeighborsLinkedAheadScene): number | null {
  return scene.path.length === 0 ? null : (scene.path[scene.path.length - 1] ?? null);
}

/**
 * 지금 선 자리에서 본 이웃들. 아직 안 봤으면 null.
 *
 * `probes` 가 `path` 만큼 찼을 때만 있다 — 발을 옮기면 살은 옮긴 자리의 것이
 * 아니므로 사라진다. **정적 그리기가 `step` 이 아니라 이것을 본다.**
 */
export function probeNow(
  scene: NeighborsLinkedAheadScene,
  graph: NeighborsGraph,
): { from: number; candidates: number[]; best: number | null } | null {
  const from = standing(scene);
  if (from === null) return null;
  if (scene.probes.length !== scene.path.length) return null;
  return {
    from,
    candidates: graph.adjacency[from] ?? [],
    best: scene.probes[scene.probes.length - 1] ?? null,
  };
}

/**
 * **재 보고 안 간 자리들.** 한 번이라도 이웃으로 짚였는데 끝내 밟지 않은 점들이다.
 *
 * 옛 화면은 발을 옮기는 순간 `clear(gProbe)` 로 살을 통째로 지워, 어느 이웃을 재
 * 보았는지가 한 걸음마다 사라졌다. 완주 화면이 "다 봤다" 와 구별되지 않던 자리다.
 * 남기되 **어휘를 가른다** — 이것은 살아 있는 자국(밟은 자리)이 아니라 헛걸음이라
 * 채움이 아니라 테두리에, 그것도 점선으로 선다.
 */
export function strayMarks(
  scene: NeighborsLinkedAheadScene,
  graph: NeighborsGraph,
): number[] {
  const walked = new Set(scene.path);
  const seen = new Set<number>();
  for (let i = 0; i < scene.probes.length; i += 1) {
    const at = scene.path[i];
    if (at === undefined) continue;
    for (const c of graph.adjacency[at] ?? []) {
      if (!walked.has(c)) seen.add(c);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * 지금 화면이 선 국면.
 *
 * 밟은 자리가 본 자리보다 하나 많으면 막 발을 옮긴 참이고, 같으면 서서 이웃을 본
 * 참이다. 그 둘만으로 넷이 갈린다 — 국면을 장면에 따로 적어 둘 까닭이 없다.
 */
export function phaseOf(scene: NeighborsLinkedAheadScene): NeighborsPhase {
  const at = standing(scene);
  if (at === null) return { kind: 'idle' };
  if (scene.settled) return { kind: 'done', at, hops: scene.path.length - 1 };
  if (scene.probes.length < scene.path.length) {
    return { kind: 'stood', at, first: scene.path.length === 1 };
  }
  return { kind: 'probed', at, best: scene.probes[scene.probes.length - 1] ?? null };
}

export const neighborsLinkedAheadScene: ScenePlan<NeighborsLinkedAheadScene> = {
  /**
   * 첫 장면은 점과 질의만 세우고 비어 있다 — 길은 `graph-ready` 가 놓는다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은
   * 것을 참조로 쥐지 않는다** — 점 배열은 러너가 mechanism 과 view 에 함께 주는 한
   * 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): NeighborsLinkedAheadScene {
    const d = fields(initialData) ?? {};
    const points = readPts(d.points);
    const k = Math.max(0, Math.trunc(num(d.neighborCount) ?? 0));
    const raw = Math.trunc(num(d.start) ?? 0);
    const start = raw >= 0 && raw < points.length ? raw : 0;
    return atStart({ points, query: readPt(d.query) ?? { x: 0, y: 0 }, k, start });
  },

  reduce(
    scene: NeighborsLinkedAheadScene,
    event: FacetRuntimeEvent,
  ): NeighborsLinkedAheadScene {
    const p = fields(event.payload);

    switch (event.type) {
      /*
       * 길이 놓이고 첫 발이 오른다. 길도 출발점도 바탕에서 나오므로 실려 오는 것이
       * 없다 — 이 발신이 말하는 것은 "이제 시작한다" 하나다.
       */
      case 'graph-ready': {
        if (scene.path.length > 0) return scene;
        if (scene.points[scene.start] === undefined) return scene;
        return { ...scene, path: [scene.start], step: { kind: 'lay' } };
      }

      /*
       * 이웃을 본다. 고른 이웃이 이 조각의 판정이라 그것만 실려 온다. 고른 것이
       * 선 자리의 이웃이 아니면 짝이 어긋난 발신이라 조용히 흘린다 (C2).
       */
      case 'probe': {
        const at = standing(scene);
        if (at === null || scene.settled) return scene;
        if (scene.probes.length !== scene.path.length - 1) return scene;
        const best = num(p?.best);
        if (best !== null && !(graphOf(scene).adjacency[at] ?? []).includes(best)) return scene;
        return { ...scene, probes: [...scene.probes, best], step: { kind: 'probe' } };
      }

      /*
       * 발을 옮긴다. 어디로 가는지는 바로 앞 probe 가 이미 말했으므로 자취에서
       * 꺼낸다 — 같은 판정을 두 번 싣지 않는다.
       */
      case 'step-to': {
        if (scene.settled) return scene;
        if (scene.probes.length !== scene.path.length) return scene;
        const to = scene.probes[scene.probes.length - 1] ?? null;
        if (to === null) return scene;
        return { ...scene, path: [...scene.path, to], step: { kind: 'walk' } };
      }

      /*
       * 멎는다. 멎을 수 있는 것은 바로 앞 probe 가 "나아질 데가 없다" 고 말한
       * 뒤뿐이라, 그 조건을 여기서 본다.
       */
      case 'settle': {
        if (scene.settled) return scene;
        if (scene.probes.length !== scene.path.length) return scene;
        if ((scene.probes[scene.probes.length - 1] ?? null) !== null) return scene;
        return { ...scene, settled: true, step: { kind: 'settle' } };
      }

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          points: scene.points,
          query: scene.query,
          k: scene.k,
          start: scene.start,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
