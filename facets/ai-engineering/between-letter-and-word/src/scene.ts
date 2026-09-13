/**
 * BetweenLetterAndWord 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * 이 조각의 화면은 세 줄이고, 줄마다 상태가 둘뿐이다 — 아직 문장 한 덩이인가,
 * 아니면 이렇게 갈라졌는가. 그래서 장면은 **줄마다의 자른 결과**로 잡힌다. 자른
 * 결과가 곧 조각 수이고 타일의 경계이므로 수를 따로 싣지 않는다 — 두 자리에 두면
 * 언젠가 어긋난다 (algorithm 의 이벤트 주석과 같은 까닭).
 *
 * 마지막 걸음의 이음매 표시는 **남는 강조**다. 돋아났다 사라지는 것이 아니라 그
 * 자리에 서 있으므로 장면에 담아 정적으로도 그린다 — 빠뜨리면 되짚었을 때
 * 사라진다 (S-scene).
 *
 * 좌표는 담지 않는다. 글자 칸 폭도 자른 자리의 픽셀도 캔버스에서 역산되는 값이라
 * stage 의 몫이고, 여기에는 **무엇이 어떻게 갈렸는지**만 둔다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다
 * (C10 의 조회는 View 의 `params.t` 로).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 세 가지 크기. 화면의 세 줄과 하나씩 짝을 이룬다. */
export type RowKey = 'word' | 'piece' | 'letter';

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type BetweenCaption =
  | { kind: 'cut'; row: RowKey; n: number }
  | { kind: 'between'; word: number; piece: number; letter: number };

/** 줄마다 자른 결과. `null` 이면 아직 자르기 전 — 문장 한 덩이다. */
export type CutRows = {
  word: string[] | null;
  piece: string[] | null;
  letter: string[] | null;
};

export type BetweenScene = {
  rows: CutRows;
  /**
   * 조각 줄에서 낱말 안쪽이 갈린 자리 — 그 자리에서 시작하는 글자의 index.
   *
   * `null` 은 "아직 짚지 않았다" 이고 빈 배열은 "짚었는데 갈린 자리가 없다" 이다.
   * 둘을 섞으면 마지막 걸음에 이르렀는지를 장면이 말하지 못한다.
   */
  seams: number[] | null;
  caption: BetweenCaption | null;
};

const EMPTY: BetweenScene = {
  rows: { word: null, piece: null, letter: null },
  seams: null,
  caption: null,
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}
function readRow(v: unknown): RowKey | null {
  return v === 'word' || v === 'piece' || v === 'letter' ? v : null;
}

/**
 * 한 줄만 바꾼 새 `rows`.
 *
 * 계산된 키로 얹지 않고 세 자리를 그대로 적는다 — 키가 셋뿐이라 길지 않고, 이쪽이
 * 타입이 좁아진다. 앞 장면의 `rows` 는 건드리지 않는다 (S-scene).
 */
function withRow(rows: CutRows, row: RowKey, segments: string[]): CutRows {
  return {
    word: row === 'word' ? segments : rows.word,
    piece: row === 'piece' ? segments : rows.piece,
    letter: row === 'letter' ? segments : rows.letter,
  };
}

export const betweenLetterAndWordScene: ScenePlan<BetweenScene> = {
  /**
   * 첫 장면은 비어 있다.
   *
   * 자를 문장은 `initialData` 에 있지만 여기서 쥐지 않는다 — 그것은 stage 가
   * mount 할 때 한 번 읽어 글자 칸을 짓는 바탕이고, 장면이 말하는 것은 그 문장이
   * **어떻게 갈렸는가** 뿐이다. 러너가 주는 객체를 참조로 담지 않는 규율과도
   * 맞는다 (S-scene).
   */
  initial(): BetweenScene {
    return EMPTY;
  },

  reduce(scene: BetweenScene, event: FacetRuntimeEvent): BetweenScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'cut': {
        const row = readRow(p.row);
        const segments = strings(p.segments);
        if (row === null || segments.length === 0) return scene;
        return {
          ...scene,
          rows: withRow(scene.rows, row, segments),
          caption: { kind: 'cut', row, n: segments.length },
        };
      }

      case 'between': {
        const { word, piece, letter } = p;
        if (typeof word !== 'number' || typeof piece !== 'number' || typeof letter !== 'number') {
          return scene;
        }
        return {
          ...scene,
          seams: nums(p.seams),
          caption: { kind: 'between', word: num(word), piece: num(piece), letter: num(letter) },
        };
      }

      // 손으로 짚기 시작 — 세 줄이 다시 문장 한 덩이로 돌아간다.
      case 'rewind':
        return EMPTY;

      default:
        // 그 밖의 이벤트는 조용히 흘린다 (C2).
        return scene;
    }
  },
};
