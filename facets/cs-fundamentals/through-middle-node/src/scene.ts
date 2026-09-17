/**
 * throughMiddleNode 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 왼쪽에 정점이 타원을 이루고, 아는 거리마다 곧은 줄 하나가 걸려 있다. 가운데로
 * 세운 정점 하나가 일어서 있고, 물음이 갈 때마다 점 하나가 `from → 가운데 → to`
 * 를 짚어 간다. 오른쪽 장부는 물은 자리를 칸 하나씩 채워 "이만큼 물어 이만큼만
 * 그렇다" 를 남긴다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 화면은 상태를 다섯 자리에 숨겨 두었다. 전부 stage 의 `let` 과 `Map`
 * 이었고 — projector 에는 `let` 이 하나도 없었다 — 그래서 한 자리만 봤다면 다
 * 놓쳤다.
 *
 * - **`chords: Map<string, Chord>`** — 이것이 곧 **거리표**였다. 지금 아는
 *   `from→to` 거리가 `chord.label` 이라는 **문자열**로 DOM 곁에 얹혀 있었고,
 *   다시 세울 때 `Number(known.label)` 로 도로 수를 꺼내 썼다. 어느 이벤트도
 *   거리표 전체를 말하지 않으므로 지나온 걸음을 다 밟아야만 복원되었다. 이제
 *   `roads` 가 그것을 말한다.
 * - **`chord.improved`** — 가운데를 거쳐 고쳐진 길인가. **머무는 강조**이고 끝에
 *   한 번씩 짚어 주는 대상이기도 한데 어느 이벤트에도 실리지 않았다. `roads` 의
 *   필드로 올린다.
 * - **`slots: SVGRectElement[][]`** — 장부 스물넷의 칠. 물은 자리가 쌓이는 것이
 *   이 조각의 주장 그 자체인데, 그 자취가 rect 의 `fill` 속성에만 있었다. 이제
 *   `marks` 가 말한다.
 * - **`middleNow: string \| null`** — 지금 가운데로 선 정점. `setMiddle` 이
 *   "앞서 서 있던 것을 찾아 도로 앉히는" 명령형 코드를 달고 있었고, 그 코드가
 *   장면으로 올리자 통째로 없어졌다 — 정적 그리기가 `middle` 하나만 보고 전부
 *   세우기 때문이다.
 * - **`walkDot: ((u) => void) \| null`** — 물음이 짚어 간 길. 재 보고 물러나는
 *   운동이 그것을 거꾸로 밟았다. 걸음 안에서만 살던 값이라 이제 `runProbe` 가
 *   돌려주고 부른 쪽이 받는다.
 *
 * `Map.get` 으로 갈리던 암묵 분기도 함께 사라진다 — `chords.get(key) ?? 유령`
 * 이 "이 짝에 길이 있었나" 를 물었는데, 그 답이 이제 `step.before` 에 실려 온다.
 *
 * 좌표는 담지 않는다. 정점 이름과 짝, 무게 같은 **구조**만 담고 자리는 그리는
 * 쪽이 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 한쪽으로 난 길 하나. 무게가 곧 거리다. */
export type ThroughMiddleNodeLink = {
  from: string;
  to: string;
  weight: number;
};

/**
 * 지금 아는 `from→to` 거리 하나. 거리표의 한 줄이다.
 *
 * `improved` 는 가운데를 거쳐 고쳐진 길인가 — 한 번 참이면 끝까지 참이다.
 * **머무는 강조**라 정적 그리기에도 들어간다. 빠뜨리면 되짚었을 때 고쳐진 길이
 * 도로 평범한 회색 줄이 되어 화면이 주장을 잃는다.
 */
export type ThroughMiddleNodeRoad = ThroughMiddleNodeLink & { improved: boolean };

/**
 * 장부 한 칸에 남는 답.
 *
 * "아니다" 를 둘로 가른다 — `no` 는 길이 끊겨 재 볼 것도 없던 자리이고,
 * `weighed` 는 길이 다 있어 재 보았는데 더 멀던 자리다. 같은 칠로 두면 장부가
 * 그 구분을 지우고, 그러면 이 조각의 물음이 "길이 있는가" 로만 읽힌다.
 */
export type ThroughMiddleNodeVerdict = 'no' | 'weighed' | 'yes';

/** 장부의 칸 하나. 열은 가운데 후보, 줄은 그 안에서 몇 번째 물음인가. */
export type ThroughMiddleNodeMark = {
  column: number;
  row: number;
  verdict: ThroughMiddleNodeVerdict;
};

/** 지금 던진 물음. 걸음의 수식 줄이 이 값들로 짜인다. */
export type ThroughMiddleNodeAsk = {
  from: string;
  to: string;
  middle: string;
  /** 장부에서 이 물음이 앉을 칸. */
  middleIndex: number;
  pairIndex: number;
  /** from→가운데. 길이 없으면 `null` (화면에서 ∞). */
  legA: number | null;
  /** 가운데→to. */
  legB: number | null;
  /** 둘의 합. 한쪽이라도 끊겼으면 `null`. */
  sum: number | null;
  /** 지금 아는 from→to. */
  current: number | null;
  /** 이 걸음에서 from→to 가 `sum` 으로 고쳐지는가. */
  shorter: boolean;
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type ThroughMiddleNodeCaption =
  | { kind: 'roads'; count: number }
  | { kind: 'middle'; middle: string }
  | { kind: 'opened'; from: string; to: string; sum: number }
  | { kind: 'shorter'; from: string; to: string; current: number; sum: number }
  | { kind: 'noWayIn'; from: string; middle: string }
  | { kind: 'noWayOut'; middle: string; to: string }
  | { kind: 'notShorter'; sum: number; current: number }
  | { kind: 'done'; asked: number; improved: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 계기값을 함께 싣는 까닭 — 운동은 지나간 그림에서 출발하는데, 그것을 `prev`
 * 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene). 그래서 출발 그림을
 * 셈으로 되세울 표식을 장면에 남긴다.
 *
 * - `middle.leaving` — 도로 앉을 앞 가운데. 없으면 첫 가운데다.
 * - `ask.before` — 물음을 받기 **전**의 그 짝. `null` 이면 길이 없어 유령
 *   (∞ 점선) 으로 서 있었다는 뜻이다.
 */
export type ThroughMiddleNodeStep =
  | { kind: 'roads' }
  | { kind: 'middle'; leaving: string | null }
  | { kind: 'ask'; before: { weight: number; improved: boolean } | null }
  | { kind: 'finish' };

export type ThroughMiddleNodeScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 정점 이름. 원둘레에 놓을 차례는 그리는 쪽이 간선을 보고 정한다. */
  nodes: string[];
  /** 선언에 적힌 길. 반대 방향 짝이 있는지 보아 줄을 비켜 앉히는 데 쓴다. */
  edges: ThroughMiddleNodeLink[];

  /** 지금 아는 거리표. 걸음이 고치는 유일한 바탕이다. */
  roads: ThroughMiddleNodeRoad[];
  /** 물음 장부의 크기. 아직 열리기 전이면 `null`. */
  ledger: { middles: string[]; rows: number } | null;
  /** 이미 답이 난 칸들. 쌓이는 것이 이 조각의 주장이라 남는다. */
  marks: ThroughMiddleNodeMark[];
  /** 가운데로 세운 정점. 남는 강조라 정적으로도 그린다. */
  middle: { id: string; index: number } | null;
  /** 지금 던진 물음. 가운데가 바뀌거나 끝나면 비워진다. */
  ask: ThroughMiddleNodeAsk | null;
  step: ThroughMiddleNodeStep | null;
  caption: ThroughMiddleNodeCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * `roads` 는 여기 들지 않는다 — 걸음이 고치는 유일한 바탕이라 그대로 넘기면
 * 되감아도 고쳐진 거리가 남는다.
 */
type ThroughMiddleNodeBase = Pick<ThroughMiddleNodeScene, 'nodes' | 'edges'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: ThroughMiddleNodeBase): ThroughMiddleNodeScene {
  return {
    nodes: base.nodes,
    edges: base.edges,
    // 선언에 적힌 길에서 다시 셈한다. 걸어오며 고친 거리를 물려받지 않는 자리다.
    roads: openingRoads(base.edges),
    ledger: null,
    marks: [],
    middle: null,
    ask: null,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 길이 없는 자리는 null 로 온다. 수가 아닌 것도 없는 것으로 본다. */
function dist(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * 선언에 적힌 길만으로 만든 첫 거리표.
 *
 * 같은 짝이 둘이면 작은 무게가 이긴다 — algorithm 의 첫 거리표와 같은 규칙이다.
 * 옮기기 전에는 이 골라내기가 stage 안에서 `Number(chord.label)` 로 벌어졌다.
 */
function openingRoads(edges: ThroughMiddleNodeLink[]): ThroughMiddleNodeRoad[] {
  const roads: ThroughMiddleNodeRoad[] = [];
  for (const edge of edges) {
    const known = roads.find((r) => r.from === edge.from && r.to === edge.to);
    if (!known) {
      roads.push({ from: edge.from, to: edge.to, weight: edge.weight, improved: false });
      continue;
    }
    if (edge.weight < known.weight) known.weight = edge.weight;
  }
  return roads;
}

/** 넘겨받은 선언에서 길 목록을 좁힌다. 값만 베껴 담아 참조를 쥐지 않는다. */
function readEdges(value: unknown): ThroughMiddleNodeLink[] {
  if (!Array.isArray(value)) return [];
  const edges: ThroughMiddleNodeLink[] = [];
  for (const item of value) {
    const edge = item as { from?: unknown; to?: unknown; weight?: unknown };
    if (typeof edge?.from !== 'string' || typeof edge?.to !== 'string') continue;
    if (typeof edge?.weight !== 'number' || !Number.isFinite(edge.weight)) continue;
    edges.push({ from: edge.from, to: edge.to, weight: edge.weight });
  }
  return edges;
}

/** 거리표에서 그 짝을 찾는다. 없으면 `null` — 아직 길이 없다는 뜻이다. */
function roadAt(
  roads: ThroughMiddleNodeRoad[],
  from: string,
  to: string,
): ThroughMiddleNodeRoad | null {
  return roads.find((r) => r.from === from && r.to === to) ?? null;
}

/**
 * 고쳐진 거리를 얹은 새 거리표.
 *
 * 앞 장면의 배열을 제자리에서 고치지 않는다 — 되짚기는 지나온 장면들을 그대로
 * 다시 쓰므로, 고치면 과거가 함께 바뀐다.
 */
function withRoad(
  roads: ThroughMiddleNodeRoad[],
  from: string,
  to: string,
  weight: number,
): ThroughMiddleNodeRoad[] {
  if (roadAt(roads, from, to) === null) return [...roads, { from, to, weight, improved: true }];
  return roads.map((r) => (r.from === from && r.to === to ? { ...r, weight, improved: true } : r));
}

/**
 * 물음 하나가 받은 답을 캡션으로 옮긴다.
 *
 * 옮기기 전에는 projector 가 같은 갈래를 타 문자열을 만들었다. 여기서는 타입이
 * 갈라지는 갈래로 바꿔 두어, 그리는 쪽이 인자를 빠뜨리면 tsc 가 잡게 한다.
 */
function verdictOf(ask: ThroughMiddleNodeAsk): ThroughMiddleNodeCaption {
  if (ask.shorter && ask.current === null) {
    return { kind: 'opened', from: ask.from, to: ask.to, sum: ask.sum ?? 0 };
  }
  if (ask.shorter) {
    return {
      kind: 'shorter',
      from: ask.from,
      to: ask.to,
      current: ask.current ?? 0,
      sum: ask.sum ?? 0,
    };
  }
  if (ask.legA === null) return { kind: 'noWayIn', from: ask.from, middle: ask.middle };
  if (ask.legB === null) return { kind: 'noWayOut', middle: ask.middle, to: ask.to };
  return { kind: 'notShorter', sum: ask.sum ?? 0, current: ask.current ?? 0 };
}

/** 길이 다 있어 재 보기는 했는가. 장부의 `weighed` 와 `no` 를 가른다. */
function weighed(ask: ThroughMiddleNodeAsk): boolean {
  return ask.legA !== null && ask.legB !== null;
}

export const throughMiddleNodeScene: ScenePlan<ThroughMiddleNodeScene> = {
  /**
   * 첫 장면은 주어진 길만 세우고 장부는 아직 없다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 그 안의 객체를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): ThroughMiddleNodeScene {
    const d = (initialData ?? {}) as { nodes?: unknown; edges?: unknown };
    const edges = readEdges(d.edges);
    return atStart({ nodes: names(d.nodes), edges });
  },

  reduce(scene: ThroughMiddleNodeScene, event: FacetRuntimeEvent): ThroughMiddleNodeScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 주어진 길을 다 그렸다. 오른쪽에 물음 장부가 열린다.
      case 'roads-ready':
        return {
          ...scene,
          ledger: { middles: names(p.middles), rows: num(p.pairCount) },
          step: { kind: 'roads' },
          caption: { kind: 'roads', count: num(p.edgeCount) },
        };

      // 가운데에 세울 정점이 바뀐다. 앞 가운데는 도로 앉는다.
      case 'middle-set': {
        const middle = str(p.middle);
        if (middle === '') return scene;
        return {
          ...scene,
          middle: { id: middle, index: num(p.order) },
          ask: null,
          step: { kind: 'middle', leaving: scene.middle?.id ?? null },
          caption: { kind: 'middle', middle },
        };
      }

      // 물음 하나. 답이 "그렇다" 면 이 걸음에서 거리표가 고쳐진다.
      case 'ask': {
        const from = str(p.from);
        const to = str(p.to);
        const middle = str(p.middle);
        if (from === '' || to === '' || middle === '') return scene;

        const ask: ThroughMiddleNodeAsk = {
          from,
          to,
          middle,
          middleIndex: num(p.middleIndex),
          pairIndex: num(p.pairIndex),
          legA: dist(p.legA),
          legB: dist(p.legB),
          sum: dist(p.sum),
          current: dist(p.current),
          shorter: p.shorter === true,
        };

        // 고치기 **전**의 그 짝. 운동의 출발 그림이 여기서 나온다.
        const was = roadAt(scene.roads, from, to);
        const before = was === null ? null : { weight: was.weight, improved: was.improved };
        const roads =
          ask.shorter && ask.sum !== null ? withRoad(scene.roads, from, to, ask.sum) : scene.roads;

        return {
          ...scene,
          roads,
          marks: [
            ...scene.marks,
            {
              column: ask.middleIndex,
              row: ask.pairIndex,
              verdict: ask.shorter ? 'yes' : weighed(ask) ? 'weighed' : 'no',
            },
          ],
          ask,
          step: { kind: 'ask', before },
          caption: verdictOf(ask),
        };
      }

      // 쓸어보기가 끝났다. 가운데를 도로 앉히고 고쳐진 길만 한 번씩 짚는다.
      case 'done':
        return {
          ...scene,
          middle: null,
          ask: null,
          step: { kind: 'finish' },
          caption: { kind: 'done', asked: num(p.asked), improved: num(p.improved) },
        };

      case 'rewind':
        // 변수가 아니라 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지
        // 않아 `roads` 를 넣지 않으려고 좁혀 둔 타입이 아무것도 막지 못한다.
        return atStart({ nodes: scene.nodes, edges: scene.edges });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
