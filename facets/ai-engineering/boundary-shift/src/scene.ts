/**
 * BoundaryShift 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 쌍마다 줄이 하나씩 있고, 줄은 **선다 · 바뀐다 · 갈라진다** 셋을 차례로 겪는다.
 * 앞 줄은 걷히지 않는다 — 다음 줄이 시작해도 이미 갈라진 줄은 갈라진 채로 남아,
 * 마지막에 두 쌍을 나란히 견주는 것이 이 조각의 결론이다. 그러니 장면은 줄마다의
 * 상태를 낱낱이 쥔다.
 *
 * 한 줄에서 **머무는 것**은 셋이다 — 지금 서 있는 글자, 그 글자를 어떻게 나눴나,
 * 바뀐 자리에 남는 표시. **지나가는 것**은 방금 무슨 걸음을 밟았나 하나뿐이고
 * (`step`), 그리는 쪽은 그것을 보고 무엇을 흐르게 할지 고른다.
 *
 * 좌표는 담지 않는다. 값과 조각 나눔이 자리를 정하므로 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/**
 * 낱말 끝표식. algorithm 이 배운 어휘의 일부라 이 자리에서만 다룬다 — 그리는 쪽은
 * 알고리즘의 어휘를 몰라야 하므로 (원칙 1), 표식을 떼어 `end` 로 옮겨 담는다.
 */
const END_MARK = '</w>';

/** 조각 하나 — 글자와, 그 조각이 낱말의 끝을 물고 있는지. */
export type BoundaryPiece = { text: string; end: boolean };

/** 줄 하나의 상태. 쌍 하나가 줄 하나를 쓴다. */
export type LaneScene = {
  /** 지금 서 있는 글자들. 걸음 둘에서 한 자리가 바뀐다. */
  word: string;
  /** 지금 서 있는 조각 나눔. 걸음 셋에서 갈라진 쪽으로 바뀐다. */
  pieces: BoundaryPiece[];
  /**
   * 바뀐 글자의 자리와 그 앞 글자.
   *
   * 표시는 갈라진 뒤에도 **남는다** — 어느 한 자리 때문에 경계가 무너졌는지가
   * 이 조각의 주장이라, 정적으로 그릴 때도 넣어야 되짚었을 때 사라지지 않는다.
   * `prevLetter` 는 글자가 갈리는 운동에만 쓰인다.
   */
  swapped: { index: number; prevLetter: string } | null;
  /** 경계가 갈라졌나. 통째로 서 있던 자리를 점선으로 남긴다. */
  broken: boolean;
};

/** 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다. */
export type BoundaryStep = {
  lane: number;
  kind: 'stands' | 'swapped' | 'broken';
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type BoundaryCaption =
  | { kind: 'whole'; word: string; pieces: number }
  | { kind: 'swap'; from: string; to: string }
  | { kind: 'shatter'; pieces: number }
  | { kind: 'done' };

export type BoundaryShiftScene = {
  /** 줄 번호가 곧 자리. 아직 서지 않은 줄은 `null`. */
  lanes: (LaneScene | null)[];
  step: BoundaryStep | null;
  caption: BoundaryCaption | null;
};

const EMPTY: BoundaryShiftScene = { lanes: [], step: null, caption: null };

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function readPieces(v: unknown): BoundaryPiece[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is string => typeof item === 'string')
    .map((raw) => ({
      text: raw.split(END_MARK).join(''),
      end: raw.endsWith(END_MARK),
    }));
}

/**
 * 줄 하나를 갈아 끼운 새 목록.
 *
 * 앞 장면의 배열을 제자리에서 고치지 않는다 — 되짚기는 지나온 장면들을 그대로 다시
 * 쓰므로, 고치면 과거가 함께 바뀐다.
 */
function withLane(
  lanes: (LaneScene | null)[],
  index: number,
  lane: LaneScene,
): (LaneScene | null)[] {
  const next = lanes.slice();
  while (next.length <= index) next.push(null);
  next[index] = lane;
  return next;
}

export const boundaryShiftScene: ScenePlan<BoundaryShiftScene> = {
  /**
   * 첫 장면은 비어 있다.
   *
   * 어휘도 분할도 algorithm 이 셈해 걸음마다 실어 보낸다. 여기서 `initialData` 를
   * 다시 셈하면 같은 계산이 두 곳에 살게 된다.
   */
  initial(): BoundaryShiftScene {
    return EMPTY;
  },

  reduce(scene: BoundaryShiftScene, event: FacetRuntimeEvent): BoundaryShiftScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      case 'word-stands': {
        const lane = num(p.lane);
        const word = str(p.word);
        const pieces = readPieces(p.pieces);
        return {
          lanes: withLane(scene.lanes, lane, {
            word,
            pieces,
            swapped: null,
            broken: false,
          }),
          step: { lane, kind: 'stands' },
          caption: { kind: 'whole', word, pieces: pieces.length },
        };
      }

      case 'letter-swapped': {
        const lane = num(p.lane);
        const current = scene.lanes[lane];
        // 선 적이 없는 줄의 글자는 바꿀 수 없다. 조용히 흘린다 (C2).
        if (!current) return scene;
        const index = num(p.index);
        const from = str(p.from);
        const to = str(p.to);
        return {
          lanes: withLane(scene.lanes, lane, {
            ...current,
            // 바뀐 뒤의 낱말은 payload 가 통째로 준다. 글자를 여기서 이어 붙이면
            // 같은 셈이 algorithm 과 두 곳에 살게 된다.
            word: to,
            swapped: { index, prevLetter: from.slice(index, index + 1) },
          }),
          step: { lane, kind: 'swapped' },
          caption: { kind: 'swap', from, to },
        };
      }

      case 'boundary-broken': {
        const lane = num(p.lane);
        const current = scene.lanes[lane];
        if (!current) return scene;
        const pieces = readPieces(p.pieces);
        return {
          lanes: withLane(scene.lanes, lane, {
            ...current,
            word: str(p.word),
            pieces,
            broken: true,
          }),
          step: { lane, kind: 'broken' },
          caption: { kind: 'shatter', pieces: pieces.length },
        };
      }

      // 다 갈라 놓고 결론만 말한다. 줄은 그대로 두고 캡션만 바뀐다.
      case 'done':
        return { ...scene, step: null, caption: { kind: 'done' } };

      case 'rewind':
        return EMPTY;

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
