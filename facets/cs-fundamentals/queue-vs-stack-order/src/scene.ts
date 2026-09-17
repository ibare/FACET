/**
 * queueVsStackOrder 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 왼쪽에 그래프 하나가 처음부터 끝까지 그대로 서 있다. 출발 정점에서 줄기가 뻗다가
 * 두 갈래로 갈린다 — 위는 앞뒤가 뚫린 통(fifo), 아래는 위만 뚫린 우물(lifo). 두
 * 갈래는 같은 그래프를 같은 이웃 순서로 밟으며 각자 방문 순서를 오른쪽으로 늘리고,
 * 두 순서가 처음 어긋나는 칸에 갈림 표시가 선다.
 *
 * ── 한 걸음에 **두 곳**이 움직인다
 *
 * 앞선 열 조각은 "한 걸음에 흐르게 할 것은 하나" 였다. 이 조각은 그 전제가 깨지는
 * 첫 조각이다 — `take` 하나에 통에서 하나가 나가고 우물에서 하나가 나가며, `offer`
 * 하나에 양쪽 그릇이 동시에 채워진다. **그것이 이 조각의 주장 그 자체다.** 두
 * 그릇을 lockstep 으로 돌려야 갈리는 순간이 한 화면에서 보인다.
 *
 * 장면은 그래서 갈래를 `lanes` 로 **둘 다** 쥔다. 한쪽만 쥐고 다른 쪽을 파생시키는
 * 길은 없다 — 두 그릇의 내용이 걸음마다 갈라지는 것이 보여 줄 것이다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 projector 에는 `let` 이 하나도 없었다. 상태는 전부 stage 안에 있었고,
 * 그중 둘은 **어느 이벤트에도 실리지 않아** 걸음을 처음부터 다시 밟아야만 복원됐다.
 *
 * - **`lanes[lane].order`** — 꺼낸 차례, 곧 방문 순서. **이 조각의 주장 그 자체인데
 *   payload 에 없었다.** algorithm 은 `*Pending` (그릇에 남은 것) 만 실어 보냈고,
 *   꺼낸 것은 `fifoTaken` / `lifoTaken` 하나씩이라 자취는 stage 의 배열에만 쌓였다.
 *   되짚으면 오른쪽 순서 줄이 통째로 비어 버린다. 이제 장면이 말한다.
 * - **갈림 표시의 칸(`splitAt`)** — `showSplit(index)` 가 그린 점선. `diverged` 는
 *   *그 걸음에만* true 로 오는 지나가는 신호인데, 화면에서는 **남는 강조**다.
 *   지난 걸음의 신호를 stage 가 DOM 으로 기억하고 있었다. 정적 그리기에 들어가야
 *   되짚었을 때 남는다 (S-scene PREFER).
 * - **고리(`ringed`)** — `showRing` 이 opacity 0↔1 로 켜고 끄던 것. `offer` 에서
 *   켜져 다음 `take` 까지 남는다. 켜짐/꺼짐이 `circle` 의 속성에만 있었다.
 * - **`chips: Map<string, Chip>` 와 `chip.at`** — 칩의 DOM 핸들과 **지금 자리**.
 *   다음 운동의 출발점을 이 `at` 에서 되읽었다 (프로토콜 3-1 의 ④). 이제 칩은
 *   `pending`·`order` 에서 파생되고 (그릇에 넣어 본 적 있는 정점 = 둘의 합집합),
 *   출발 자리는 장면이 말하는 것으로 **셈해서** 얻는다.
 * - **`chips.get(...) ?? createChip(...)`** — "이 칩이 이미 있나" 로 갈리던 암묵
 *   분기 (③). 정적 그리기가 매번 전부 새로 만들므로 그 분기가 사라진다.
 *
 * 좌표는 담지 않는다. 정점과 간선, 그릇의 내용 같은 **구조**만 담고 자리는 그리는
 * 쪽이 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 그릇 둘. `fifo` 는 앞에서, `lifo` 는 위에서 꺼낸다. 이 한 글자가 전부다. */
export type QueueVsStackOrderLaneKey = 'fifo' | 'lifo';

/**
 * 그릇 하나의 지금.
 *
 * `pending` 의 **앞(0번)이 fifo 가 꺼낼 자리, 끝이 lifo 가 꺼낼 자리**다. 넣는
 * 자리는 양쪽 다 끝이다 — 그래서 이 배열 하나로 두 그릇을 같게 적을 수 있고,
 * 다른 것은 꺼내는 끝 하나뿐이라는 조각의 말이 자료 모양에도 드러난다.
 */
export type QueueVsStackOrderLane = {
  /** 그릇에 든 것. */
  pending: readonly number[];
  /** 꺼낸 차례 = 방문 순서. 걸어온 자취라 남는다. */
  order: readonly number[];
};

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 출발 그림은 `prev` 에서 꺼내지 않는다 (S-scene). 이 조각은 출발 자리를 전부
 * `next` 에서 되셈할 수 있어 계기값을 따로 실을 것이 없다 — 꺼내기 전의 그릇은
 * "지금 그릇 + 꺼낸 것" 이고, 그 둘이 다 장면에 있다.
 */
export type QueueVsStackOrderStep =
  | { kind: 'seed'; vertex: number }
  | { kind: 'take'; fifo: number; lifo: number }
  | { kind: 'offer'; fifoAdded: number[]; lifoAdded: number[] }
  | { kind: 'done' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type QueueVsStackOrderCaption =
  | { kind: 'ready' }
  | { kind: 'seed'; vertex: number }
  | { kind: 'take'; fifo: number; lifo: number }
  | { kind: 'diverge'; fifo: number; lifo: number }
  | { kind: 'offer' }
  | { kind: 'done' };

export type QueueVsStackOrderScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 정점 번호. 층과 자리는 그리는 쪽이 간선을 보고 셈한다. */
  vertices: readonly number[];
  /** 무방향 간선. */
  edges: readonly (readonly number[])[];
  /** 출발 정점. */
  start: number;

  // ── 걸어온 자취.
  /** 두 그릇. 같은 걸음에 둘 다 움직인다. */
  lanes: Record<QueueVsStackOrderLaneKey, QueueVsStackOrderLane>;
  /** 두 순서가 처음 어긋난 칸. **남는 강조**라 정적으로도 그린다. */
  splitAt: number | null;
  /** 이웃을 내놓은 정점 — 그래프 위에 고리를 씌운다. 다음 걸음에 벗겨진다. */
  ringed: Record<QueueVsStackOrderLaneKey, number> | null;
  step: QueueVsStackOrderStep | null;
  caption: QueueVsStackOrderCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * 그릇도 순서도 갈림도 **여기 들지 않는다** — 전부 걸어오며 쌓은 것이라 되감기에
 * 그대로 넘기면 되감은 화면이 이미 다 돌아간 채로 선다. 바탕은 그래프뿐이고,
 * 그래프는 이 조각에서 유일하게 변하지 않는 것이다.
 */
type QueueVsStackOrderBase = Pick<QueueVsStackOrderScene, 'vertices' | 'edges' | 'start'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: QueueVsStackOrderBase): QueueVsStackOrderScene {
  return {
    vertices: base.vertices,
    edges: base.edges,
    start: base.start,
    lanes: {
      fifo: { pending: [], order: [] },
      lifo: { pending: [], order: [] },
    },
    splitAt: null,
    ringed: null,
    step: null,
    caption: { kind: 'ready' },
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nums(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/** 간선 목록을 좁힌다. 값만 베껴 담아 넘겨받은 배열을 쥐지 않는다. */
function readEdges(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  const edges: number[][] = [];
  for (const entry of value) {
    const pair = nums(entry);
    if (pair.length >= 2) edges.push([pair[0], pair[1]]);
  }
  return edges;
}

export const queueVsStackOrderScene: ScenePlan<QueueVsStackOrderScene> = {
  /**
   * 첫 장면은 그래프만 세운다. 그릇은 비어 있고 `seed` 가 채운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 그 안의 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): QueueVsStackOrderScene {
    const d = (initialData ?? {}) as { vertices?: unknown; edges?: unknown; start?: unknown };
    const vertices = nums(d.vertices);
    return atStart({
      vertices,
      edges: readEdges(d.edges),
      start: num(d.start) ?? vertices[0] ?? 0,
    });
  },

  reduce(scene: QueueVsStackOrderScene, event: FacetRuntimeEvent): QueueVsStackOrderScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 출발 정점이 두 그릇에 동시에 들어간다. 여기서부터 두 갈래가 나란히 간다.
      case 'seed': {
        const vertex = num(p.vertex);
        if (vertex === null) return scene;
        return {
          ...scene,
          lanes: {
            fifo: { pending: nums(p.fifoPending), order: [] },
            lifo: { pending: nums(p.lifoPending), order: [] },
          },
          ringed: null,
          step: { kind: 'seed', vertex },
          caption: { kind: 'seed', vertex },
        };
      }

      // 두 그릇이 각자 하나씩 내놓는다. **한 걸음에 두 곳이 움직이는 자리.**
      case 'take': {
        const fifo = num(p.fifoTaken);
        const lifo = num(p.lifoTaken);
        if (fifo === null || lifo === null) return scene;
        // 갈림 표시가 설 칸 = 이 걸음이 채우는 칸. 앞 장면의 자취 길이가 그 번호다.
        const column = scene.lanes.fifo.order.length;
        return {
          ...scene,
          lanes: {
            fifo: {
              pending: nums(p.fifoPending),
              order: [...scene.lanes.fifo.order, fifo],
            },
            lifo: {
              pending: nums(p.lifoPending),
              order: [...scene.lanes.lifo.order, lifo],
            },
          },
          // `diverged` 는 그 걸음에만 오는 지나가는 신호이고 화면에서는 남는다.
          splitAt: p.diverged === true ? column : scene.splitAt,
          ringed: null,
          step: { kind: 'take', fifo, lifo },
          caption:
            p.diverged === true ? { kind: 'diverge', fifo, lifo } : { kind: 'take', fifo, lifo },
        };
      }

      // 방금 꺼낸 정점의 이웃이 번호 오름차순으로 양쪽 그릇에 들어간다.
      case 'offer': {
        const fifoFrom = num(p.fifoFrom);
        const lifoFrom = num(p.lifoFrom);
        if (fifoFrom === null || lifoFrom === null) return scene;
        return {
          ...scene,
          lanes: {
            fifo: { pending: nums(p.fifoPending), order: scene.lanes.fifo.order },
            lifo: { pending: nums(p.lifoPending), order: scene.lanes.lifo.order },
          },
          ringed: { fifo: fifoFrom, lifo: lifoFrom },
          step: { kind: 'offer', fifoAdded: nums(p.fifoAdded), lifoAdded: nums(p.lifoAdded) },
          caption: { kind: 'offer' },
        };
      }

      // 재생이 끝났다. 두 순서가 다 자란 채로 나란히 남는다.
      case 'done':
        return { ...scene, ringed: null, step: { kind: 'done' }, caption: { kind: 'done' } };

      case 'rewind':
        return atStart(scene);

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
