/**
 * relaxShorterPath 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 열마다 세로 레일이 하나씩 서 있고, 정점이 이고 있는 수를 적은 패가 그 수의
 * 높이에 붙는다. 큰 수는 위, 작은 수는 아래. 완화가 일어나면 패는 레일을 따라
 * 아래로 미끄러지고 옛 수가 취소선이 그어진 채 제자리에 남는다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 화면은 상태를 stage 의 구조체 하나에 거의 다 숨겨 두고 있었다.
 *
 * - **`VertexUI.value`** — 그 정점이 지금 이고 있는 **거리** 그 자체. DOM 손잡이
 *   (`token` · `box` · `text` · `circle`)와 한 객체에 묶여 있어 `let` 을 훑어도
 *   `Map.has` 를 훑어도 안 걸렸다. 이제 `dist` 가 말한다.
 * - **`VertexUI.opened`** — 굳었는가. `paint(ui, ui.opened ? 'final' : 'written')`
 *   한 줄로만 읽혀 칠에서만 살던 값이다. 이제 `settled` 가 말한다.
 * - **`tick`** — 지금 견주고 있는 후보 눈금. 이것이 `keep` 의 증거였는데, 다음
 *   `probe` 의 `clearTick()` 과 다음 `settle` 의 `arcLayer.textContent = ''` 가
 *   지워 버려 **완주 화면에는 아무 표식도 남지 않았다.** 이제 `tried` 가 끝까지
 *   쥐고 있고 정적 그리기가 매번 다시 세운다.
 * - **`liveArc`** — 방금 그린 호 하나. "이번에 짚은 간선" 이라는 뜻이 DOM 참조에
 *   실려 있었고, `keep` 이 그것을 `querySelectorAll('path')` 로 도로 뒤졌다.
 *   이제 `arcs` 의 마지막 항목이 그 자리다.
 * - **`spec`** — projector 와 stage 두 곳에 같은 것이 한 벌씩. 되감기(`rewind`)가
 *   projector 쪽 사본을 stage 로 도로 밀어 넣는 경로였다.
 *
 * ── 차례는 발신이 말한다
 *
 * 어느 간선을 짚는 중인지는 싣지 않는다. 한 정점을 펴는 동안 나가는 간선을
 * 선언된 차례대로 하나씩 짚으므로, **이번 라운드에 이미 짚은 수**가 곧 지금
 * 간선의 번호다 (`arcs.length`). 후보 거리도 `dist[from] + weight` 라 장면이
 * 셈한다. 실어 오는 것은 `settle` 의 `vertex` 하나뿐이고, 그것은 "지금까지 적힌
 * 수가 가장 작은 정점" 이라는 **조각의 알고리즘 자체**라 장면이 되풀이하지 않는다.
 *
 * 좌표는 담지 않는다. 정점·간선·무게 같은 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * `captionOf` 가 내주고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import type { RelaxEdge } from './algorithm.js';

/** 이번 라운드에 짚은 간선 하나. */
export type RelaxArc = {
  /** `scene.edges` 의 차례. from · to · 무게를 여기서 꺼낸다. */
  edge: number;
  /** 이 간선을 거쳐 온 수. 짚을 때 `dist[from] + weight` 로 셈해 둔 것이다. */
  candidate: number;
  /**
   * - `open` — 그어 놓고 아직 답이 나지 않았다.
   * - `taken` — 그 길로 수가 적혔다.
   * - `refused` — 더 짧지 않아 물러났다. 그리는 것은 `tried` 쪽이고 여기 남는 것은
   *   **간선 번호를 세기 위해서**다.
   */
  outcome: 'open' | 'taken' | 'refused';
};

/**
 * 짚어 보았으나 더 짧지 않았던 간선. **끝까지 남는다.**
 *
 * 완화는 고치는 것만이 아니라 **고치지 않기로 한 판정**이 있어야 뜻이 선다.
 * 옮기기 전에는 이 자국이 다음 걸음에 지워져, 완주 화면이 "짚어 본 길은 전부
 * 더 짧았다" 고 말하고 있었다.
 */
export type RelaxTried = { edge: number; candidate: number };

/** 수 하나가 내려간 자취. `was` 자리에 취소선이 남고 `now` 까지 줄이 그어진다. */
export type RelaxFall = { vertex: string; was: number; now: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 계기값을 따로 싣지 않는 까닭 — 운동의 출발 그림이 전부 장면 안에 이미 있다.
 * 내려가기의 출발 높이는 `falls` 의 마지막 `was` 이고, 날아오는 패의 출발점은
 * `arcs` 의 마지막 간선이 말한다. 그래서 `prev` 를 들출 일이 없다 (S-scene).
 */
export type RelaxStepKind = 'settle' | 'write' | 'probe' | 'descend' | 'keep' | 'done';

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type RelaxCaption =
  | { kind: 'start'; source: string }
  | { kind: 'settle'; vertex: string; dist: number }
  | { kind: 'write'; vertex: string; from: string; value: number }
  | { kind: 'probe'; from: string; to: string; candidate: number; current: number }
  | { kind: 'descend'; vertex: string; fromValue: number; toValue: number }
  | { kind: 'keep'; candidate: number; current: number }
  | { kind: 'done' };

export type RelaxShorterPathScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 화면의 열 순서이기도 하다. */
  vertices: string[];
  edges: RelaxEdge[];
  source: string;
  /** 세로 눈금의 위 끝. */
  scaleMax: number;

  // ── 걸음이 고치는 것.
  /** 적어 둔 거리. `vertices` 와 같은 차례. `null` 은 아직 모름(∞). */
  dist: (number | null)[];
  /** 편 차례대로 굳은 정점. 남는 강조라 정적 그리기에도 들어간다. */
  settled: string[];
  /** 지금 펴고 있는 정점. 이 정점에서 나가는 간선을 차례로 짚는다. */
  open: string | null;
  /** 이번 라운드에 짚은 간선. 다음 `settle` 이 비운다. */
  arcs: RelaxArc[];
  /** 내려간 자취. 쌓이는 것이 이 조각의 주장이라 남는다. */
  falls: RelaxFall[];
  /** 헛짚음의 자국. 역시 남는다. */
  tried: RelaxTried[];
  /** 다 폈다. 나가는 간선이 없어 한 번도 펴지 않은 정점까지 이때 굳는다. */
  finished: boolean;
  step: RelaxStepKind | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * `dist` 는 여기 들지 않는다 — 걸음이 고치는 유일한 바탕이라 그대로 넘기면
 * 되감아도 내려간 거리가 남아, 새로 셈한 첫 거리와 화면 안에서 어긋난다.
 */
type RelaxBase = Pick<RelaxShorterPathScene, 'vertices' | 'edges' | 'source' | 'scaleMax'>;

/** 선언만으로 나오는 첫 거리표. 출발점만 0 이고 나머지는 아직 모름이다. */
function openingDistances(base: RelaxBase): (number | null)[] {
  return base.vertices.map((name) => (name === base.source ? 0 : null));
}

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: RelaxBase): RelaxShorterPathScene {
  return {
    vertices: base.vertices,
    edges: base.edges,
    source: base.source,
    scaleMax: base.scaleMax,
    dist: openingDistances(base),
    settled: [],
    open: null,
    arcs: [],
    falls: [],
    tried: [],
    finished: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** 눈금의 위 끝. 0 이하면 자가 뒤집히므로 1 로 받친다. */
function scale(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 1;
}

/** 넘겨받은 선언에서 간선을 좁힌다. 값만 베껴 담아 참조를 쥐지 않는다 (S-scene). */
function readEdges(value: unknown): RelaxEdge[] {
  if (!Array.isArray(value)) return [];
  const edges: RelaxEdge[] = [];
  for (const item of value) {
    const edge = item as { from?: unknown; to?: unknown; weight?: unknown };
    if (typeof edge?.from !== 'string' || typeof edge?.to !== 'string') continue;
    if (typeof edge?.weight !== 'number' || !Number.isFinite(edge.weight)) continue;
    edges.push({ from: edge.from, to: edge.to, weight: edge.weight });
  }
  return edges;
}

/** 그 정점에 적힌 수. 아직 모르면 `null`. */
export function distOf(scene: RelaxShorterPathScene, name: string): number | null {
  const at = scene.vertices.indexOf(name);
  return at < 0 ? null : scene.dist[at];
}

/** 그 정점에서 나가는 간선을 선언된 차례대로. */
function outgoing(scene: RelaxShorterPathScene, from: string): number[] {
  const found: number[] = [];
  scene.edges.forEach((edge, i) => {
    if (edge.from === from) found.push(i);
  });
  return found;
}

/**
 * 지금 짚을 간선. **차례는 발신이 오는 순서가 이미 말한다** — 이번 라운드에 이미
 * 짚은 수가 곧 이 간선의 번호다.
 */
function nextArc(scene: RelaxShorterPathScene): { edge: number; candidate: number } | null {
  if (scene.open === null) return null;
  const outs = outgoing(scene, scene.open);
  if (scene.arcs.length >= outs.length) return null;
  const edge = outs[scene.arcs.length];
  const base = distOf(scene, scene.open);
  if (base === null) return null;
  return { edge, candidate: base + scene.edges[edge].weight };
}

/** 마지막으로 그은 호. 없으면 `null`. */
export function lastArc(scene: RelaxShorterPathScene): RelaxArc | null {
  return scene.arcs.length > 0 ? scene.arcs[scene.arcs.length - 1] : null;
}

/** 마지막으로 남긴 내려감. 없으면 `null`. */
export function lastFall(scene: RelaxShorterPathScene): RelaxFall | null {
  return scene.falls.length > 0 ? scene.falls[scene.falls.length - 1] : null;
}

/** 마지막으로 남긴 헛짚음. 없으면 `null`. */
export function lastTried(scene: RelaxShorterPathScene): RelaxTried | null {
  return scene.tried.length > 0 ? scene.tried[scene.tried.length - 1] : null;
}

/** 답을 기다리는 호. `descend` · `keep` 이 이것을 마무리한다. */
function liveArc(scene: RelaxShorterPathScene): RelaxArc | null {
  const last = lastArc(scene);
  return last !== null && last.outcome === 'open' ? last : null;
}

/** 마지막 호의 판정을 갈아 끼운 새 목록. 앞 장면의 배열을 제자리에서 고치지 않는다. */
function settleArc(arcs: RelaxArc[], outcome: RelaxArc['outcome']): RelaxArc[] {
  return arcs.map((arc, i) => (i === arcs.length - 1 ? { ...arc, outcome } : arc));
}

/** 이번 걸음이 짚고 있는 간선의 도착 정점. */
export function arcTarget(scene: RelaxShorterPathScene): string | null {
  const last = lastArc(scene);
  return last === null ? null : scene.edges[last.edge].to;
}

/**
 * 지금 화면이 말할 것.
 *
 * 걸음과 따로 쥐지 않는다 — 같은 것을 두 자리에 적으면 언젠가 갈린다. 걸음의
 * 종류와 장면이 쥔 수만으로 전부 나온다.
 */
export function captionOf(scene: RelaxShorterPathScene): RelaxCaption {
  switch (scene.step) {
    case 'settle': {
      const vertex = scene.open ?? '';
      return { kind: 'settle', vertex, dist: distOf(scene, vertex) ?? 0 };
    }
    case 'write': {
      const last = lastArc(scene);
      if (last === null) break;
      const edge = scene.edges[last.edge];
      return { kind: 'write', vertex: edge.to, from: edge.from, value: last.candidate };
    }
    case 'probe': {
      const last = lastArc(scene);
      if (last === null) break;
      const edge = scene.edges[last.edge];
      return {
        kind: 'probe',
        from: edge.from,
        to: edge.to,
        candidate: last.candidate,
        current: distOf(scene, edge.to) ?? 0,
      };
    }
    case 'descend': {
      const fall = lastFall(scene);
      if (fall === null) break;
      return { kind: 'descend', vertex: fall.vertex, fromValue: fall.was, toValue: fall.now };
    }
    case 'keep': {
      const tried = lastTried(scene);
      if (tried === null) break;
      const edge = scene.edges[tried.edge];
      return {
        kind: 'keep',
        candidate: tried.candidate,
        current: distOf(scene, edge.to) ?? 0,
      };
    }
    case 'done':
      return { kind: 'done' };
    default:
      break;
  }
  return { kind: 'start', source: scene.source };
}

export const relaxShorterPathScene: ScenePlan<RelaxShorterPathScene> = {
  /**
   * 첫 화면은 출발점에만 0 이 적힌 판이다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 그 안의 객체를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): RelaxShorterPathScene {
    const d = (initialData ?? {}) as {
      vertices?: unknown;
      edges?: unknown;
      source?: unknown;
      scaleMax?: unknown;
    };
    return atStart({
      vertices: names(d.vertices),
      edges: readEdges(d.edges),
      source: str(d.source),
      scaleMax: scale(d.scaleMax),
    });
  },

  reduce(scene: RelaxShorterPathScene, event: FacetRuntimeEvent): RelaxShorterPathScene {
    switch (event.type) {
      // 지금까지 적힌 수가 가장 작은 정점. 여기서 나가는 간선을 차례로 편다.
      case 'settle': {
        const p = (event.payload ?? {}) as { vertex?: unknown };
        const vertex = str(p.vertex);
        if (!scene.vertices.includes(vertex)) return scene;
        return {
          ...scene,
          open: vertex,
          settled: scene.settled.includes(vertex) ? scene.settled : [...scene.settled, vertex],
          arcs: [],
          step: 'settle',
        };
      }

      // 적힌 수가 없던 열에 처음 적는다. 견줄 것이 없으니 곧장 앉는다.
      case 'write': {
        const arc = nextArc(scene);
        if (arc === null) return scene;
        const at = scene.vertices.indexOf(scene.edges[arc.edge].to);
        if (at < 0) return scene;
        const dist = [...scene.dist];
        dist[at] = arc.candidate;
        return {
          ...scene,
          dist,
          arcs: [...scene.arcs, { ...arc, outcome: 'taken' as const }],
          step: 'write',
        };
      }

      // 이미 적힌 수와 견준다. 답은 다음 걸음이 낸다.
      case 'probe': {
        const arc = nextArc(scene);
        if (arc === null) return scene;
        return {
          ...scene,
          arcs: [...scene.arcs, { ...arc, outcome: 'open' as const }],
          step: 'probe',
        };
      }

      // 더 짧다. 적어 둔 수를 지우고 낮은 수로 다시 적는다.
      case 'descend': {
        const live = liveArc(scene);
        if (live === null) return scene;
        const to = scene.edges[live.edge].to;
        const at = scene.vertices.indexOf(to);
        const was = at < 0 ? null : scene.dist[at];
        if (at < 0 || was === null) return scene;
        const dist = [...scene.dist];
        dist[at] = live.candidate;
        return {
          ...scene,
          dist,
          arcs: settleArc(scene.arcs, 'taken'),
          falls: [...scene.falls, { vertex: to, was, now: live.candidate }],
          step: 'descend',
        };
      }

      // 더 짧지 않다. 아무것도 지우지 않되 짚어 보았다는 자국은 남긴다.
      case 'keep': {
        const live = liveArc(scene);
        if (live === null) return scene;
        return {
          ...scene,
          arcs: settleArc(scene.arcs, 'refused'),
          tried: [...scene.tried, { edge: live.edge, candidate: live.candidate }],
          step: 'keep',
        };
      }

      // 다 폈다. 나가는 간선이 없어 한 번도 펴지 않은 정점까지 여기서 굳는다.
      case 'done':
        return { ...scene, open: null, arcs: [], finished: true, step: 'done' };

      // 바탕만 남기고 처음으로. 거리표는 선언에서 다시 셈한다.
      case 'rewind':
        return atStart({
          vertices: scene.vertices,
          edges: scene.edges,
          source: scene.source,
          scaleMax: scene.scaleMax,
        });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
