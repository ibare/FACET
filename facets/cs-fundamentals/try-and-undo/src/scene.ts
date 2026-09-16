/**
 * tryAndUndo 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * ── 되돌림이 주제인 조각을 상태로 옮기면 되돌림 코드가 사라진다
 *
 * 명령형 stage 는 물릴 때 말을 지우고(`piece.group.remove()`), 짝지어 둔 손잡이를
 * 지우고(`pieces.delete`), 그은 선을 걷고(`purgeLinks`), 표시를 통째로 다시 맞추고
 * (`applyMarks`), 띠와 지시자를 되돌렸다. 그 다섯이 전부 **되돌리는 명령**이었다.
 *
 * 여기서는 물림이 `queens.slice(0, -1)` 한 줄이다. 놓인 것들의 목록 하나면 판이
 * 서므로, 물린 뒤의 화면은 "그 자리가 빈 장면" 일 뿐이고 지울 것이 없다.
 *
 * ── 다만 물림은 이 조각이 *말하려는 것*이다
 *
 * 되돌림을 상태로 옮기면 자취까지 함께 깨끗해지는데, 이 조각에서는 그것이 손실이다.
 * 무른 자리가 아무 흔적 없이 처음으로 돌아가면 "몇 번을 헛짚었나" 가 화면에서
 * 사라진다. 그래서 자취를 둘로 갈라 둔다.
 *
 * - `abandoned` — **지금 살아 있는 자국.** 그 행에서 이미 가 봤다가 물러난 자리라
 *   탐색이 다시 짚지 않는다. 더 위에서 물리면 아래 행의 자국은 함께 지워진다 —
 *   판이 정확히 이전 상태로 돌아간다는 것이 이 조각의 매듭이다.
 * - `tried` — **재생 내내 쌓이는 헛걸음.** 한 번도 지워지지 않는다. 마지막 화면에
 *   남아 "여기를 시도했다 물렀다" 를 말한다.
 *
 * 항목 하나가 물림 한 번이라 `tried.length` 가 곧 물리기 횟수다. 캡션의 수와
 * 화면의 자취가 같은 배열에서 나오므로 둘이 갈릴 자리가 없다.
 *
 * ── 좌표도 문안도 담지 않는다
 *
 * 칸은 `row * size + col` 한 숫자로 부른다. 격자의 자리 번호이지 화면의 좌표가
 * 아니다 — 픽셀은 그리는 쪽이 캔버스에서 역산한다 (S-piece). 캡션도 무엇을 말할지와
 * 그 인자만 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 *
 * ── 못 쓰는 칸과 막은 짝은 장면이 센다
 *
 * 둘 다 놓인 말들에서 순수하게 나온다. 그래서 payload 로 받지 않고 여기서 셈하되,
 * 판의 규칙(`hits`)만은 algorithm 이 내준 것을 부른다 — 규칙이 두 곳에 적히면
 * 언젠가 갈린다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { hits } from './algorithm.js';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데 쓴다.
 *
 * 행도 열도 싣지 않는다 — 어느 자리에서 일어난 일인지는 판이 이미 말한다.
 * 놓은 자리는 마지막 말이고, 물린 자리는 마지막 자국이며, 막힌 행은 지금 채우려던
 * 행이다.
 */
export type TryAndUndoStep =
  | { readonly kind: 'place' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'undo' }
  | { readonly kind: 'done' };

export type TryAndUndoScene = {
  /** 판의 한 변. 재생 내내 바뀌지 않는다. */
  readonly size: number;
  /** `queens[row] = col`. 길이가 곧 지금 채운 행 수다. **이 장면의 본체다.** */
  readonly queens: readonly number[];
  /** 지금 판에 남은 자국 (칸 번호). 위에서 물리면 아래 행 것이 함께 지워진다. */
  readonly abandoned: readonly number[];
  /** 재생 내내 쌓이는 헛걸음. 물림 한 번이 항목 하나라 길이가 곧 물리기 횟수다. */
  readonly tried: readonly number[];
  /** 놓기 횟수. 걸음이 오는 대로 센다. */
  readonly placed: number;
  readonly step: TryAndUndoStep | null;
};

/**
 * 되감기가 딛는 바탕.
 *
 * 판 크기 말고는 아무것도 넘기지 않는다. 걸음이 고치는 것을 바탕과 같은 급으로
 * 묶으면 되감은 화면이 **이미 다 놓인 판**으로 서고, 그 위에 algorithm 이 새로
 * 시작한 첫 걸음이 겹친다.
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다 — 변수를 넘기면
 * 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다.
 */
type Base = Pick<TryAndUndoScene, 'size'>;

const DEFAULT_BOARD_SIZE = 4;

// ── 구조에서 나오는 것들 ────────────────────────────────────────────────────
//
// 화면에 뜨는 것은 전부 이 아래를 지난다. 못 쓰는 칸도, 막은 짝도, 지시자가 선
// 행도 payload 가 아니라 `queens` 하나에서 풀린다.

/** 칸 번호가 가리키는 행. */
export function rowOf(scene: TryAndUndoScene, cell: number): number {
  return Math.floor(cell / scene.size);
}

/** 칸 번호가 가리키는 열. */
export function colOf(scene: TryAndUndoScene, cell: number): number {
  return cell % scene.size;
}

/**
 * 아직 채우지 않은 행들 가운데 놓인 말들이 못 쓰게 만든 칸.
 *
 * 이미 채운 행은 답이 정해졌으므로 셈에서 뺀다. 이 조각이 보이려는 것은 "이미
 * 놓인 것들이 **앞으로 갈 자리**를 어떻게 줄이는가" 이고, 지나온 행까지 칠하면
 * 그 줄어듦이 판 전체의 얼룩에 묻힌다.
 *
 * 놓인 말 목록을 밖에서 받는다 — 놓기 직전 · 물리기 직전의 판이 어땠는지도 같은
 * 함수로 셈해야 운동의 출발 그림을 앞 장면을 들추지 않고 얻는다 (S-scene).
 */
export function forbiddenFor(size: number, queens: readonly number[]): number[] {
  const out: number[] = [];
  for (let row = queens.length; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (queens.some((queenCol, queenRow) => hits(queenRow, queenCol, row, col))) {
        out.push(row * size + col);
      }
    }
  }
  return out;
}

/** 지금 판에서 못 쓰는 칸. */
export function forbiddenCells(scene: TryAndUndoScene): number[] {
  return forbiddenFor(scene.size, scene.queens);
}

/**
 * 지시자와 살아 있는 행 띠가 서는 자리. 판이 다 찼으면 물러난다.
 *
 * 명령형 stage 에서는 이것이 `caret` 의 `transform` 과 띠의 `fill-opacity` 에만
 * 적혀 있었다 — 좌표가 아니라 **어느 단계에 있나** 를 화면이 혼자 쥔 자리였다.
 */
export function activeRow(scene: TryAndUndoScene): number | null {
  if (scene.step?.kind === 'done') return null;
  return scene.queens.length < scene.size ? scene.queens.length : null;
}

/** 방금 놓은 자리. 놓기 걸음에서만 뜻이 있다. */
export function justPlaced(scene: TryAndUndoScene): number | null {
  if (scene.step?.kind !== 'place' || scene.queens.length === 0) return null;
  const row = scene.queens.length - 1;
  return row * scene.size + scene.queens[row];
}

/** 방금 걷어낸 자리. 물림 걸음에서만 뜻이 있다 — 마지막 자국이 곧 그 자리다. */
export function justLifted(scene: TryAndUndoScene): number | null {
  if (scene.step?.kind !== 'undo' || scene.abandoned.length === 0) return null;
  return scene.abandoned[scene.abandoned.length - 1];
}

/**
 * 막힌 행의 칸마다 그것을 막고 있는 말을 짝지어 준다.
 *
 * 물림이 임의로 보이지 않으려면 까닭이 화면에 있어야 한다 — 그래서 이 짝은
 * 애니메이션에만 있는 것이 아니라 막힘 걸음의 **정적 그림**에 선다.
 *
 * 이미 가 봤다가 물려 나온 자리는 말이 막은 것이 아니다 — 자국이 그 까닭을 말한다.
 */
export function blockedLinks(scene: TryAndUndoScene): { from: number; to: number }[] {
  if (scene.step?.kind !== 'blocked') return [];
  const { size, queens } = scene;
  const row = queens.length;
  if (row >= size) return [];
  const out: { from: number; to: number }[] = [];
  for (let col = 0; col < size; col += 1) {
    const target = row * size + col;
    if (scene.abandoned.includes(target)) continue;
    const queenRow = queens.findIndex((queenCol, r) => hits(r, queenCol, row, col));
    if (queenRow >= 0) out.push({ from: queenRow * size + queens[queenRow], to: target });
  }
  return out;
}

/**
 * 캡션이 말할 것. 문안도 아니고 수도 따로 세지 않는다 (C10).
 *
 * `solved` 의 두 수는 이 장면이 센 것을 그대로 내보낸다 — 화면에 나란히 뜨는 수가
 * 한 함수를 지나야 갈리지 않는다.
 */
export type TryAndUndoCaption =
  | { readonly kind: 'start' }
  | { readonly kind: 'place'; readonly row: number; readonly col: number }
  | { readonly kind: 'blocked'; readonly row: number }
  | { readonly kind: 'undo'; readonly row: number }
  | { readonly kind: 'undoRoot' }
  | { readonly kind: 'solved'; readonly placed: number; readonly undone: number };

export function captionOf(scene: TryAndUndoScene): TryAndUndoCaption {
  const step = scene.step;
  if (step === null) return { kind: 'start' };
  switch (step.kind) {
    case 'place': {
      const row = scene.queens.length - 1;
      return { kind: 'place', row, col: scene.queens[row] ?? 0 };
    }
    case 'blocked':
      return { kind: 'blocked', row: scene.queens.length };
    case 'undo':
      // 첫 수까지 물린 순간은 이 화면의 큰 마디라 따로 말한다.
      return scene.queens.length === 0
        ? { kind: 'undoRoot' }
        : { kind: 'undo', row: scene.queens.length };
    case 'done':
      return { kind: 'solved', placed: scene.placed, undone: scene.tried.length };
  }
}

// ── 선언 읽기 ───────────────────────────────────────────────────────────────

function readBoardSize(raw: unknown): number {
  const d = (raw ?? {}) as { boardSize?: unknown };
  const n = d.boardSize;
  return typeof n === 'number' && Number.isFinite(n) && n >= 1
    ? Math.floor(n)
    : DEFAULT_BOARD_SIZE;
}

/** 아무 걸음도 밟지 않은 화면 — 빈 판과 첫 행의 지시자뿐이다. */
function atStart(b: Base): TryAndUndoScene {
  return { size: b.size, queens: [], abandoned: [], tried: [], placed: 0, step: null };
}

export const tryAndUndoScene: ScenePlan<TryAndUndoScene> = {
  /**
   * 첫 장면은 빈 판이다.
   *
   * 선언에서 꺼내는 것은 판 한 변이라는 **수 하나**뿐이라 참조를 쥘 일이 없다
   * (S-scene).
   */
  initial(initialData: unknown): TryAndUndoScene {
    return atStart({ size: readBoardSize(initialData) });
  },

  reduce(scene: TryAndUndoScene, event: FacetRuntimeEvent): TryAndUndoScene {
    switch (event.type) {
      // 놓는다. 고른 열만 싣고 행은 지금 채운 행 수가 말한다.
      case 'place': {
        const p = (event.payload ?? {}) as { col?: unknown };
        const col = typeof p.col === 'number' && Number.isFinite(p.col) ? p.col : -1;
        if (col < 0 || col >= scene.size || scene.queens.length >= scene.size) return scene;
        return {
          ...scene,
          queens: [...scene.queens, col],
          placed: scene.placed + 1,
          step: { kind: 'place' },
        };
      }

      // 막혔다. 어느 말이 어느 칸을 막는지는 `blockedLinks` 가 판에서 푼다.
      case 'blocked':
        return { ...scene, step: { kind: 'blocked' } };

      // 걷어낸다. 놓인 것들의 목록에서 마지막 하나를 덜어 내면 화면이 선다 —
      // 지울 것을 지우는 명령이 여기서 통째로 사라졌다.
      case 'undo': {
        if (scene.queens.length === 0) return scene;
        const row = scene.queens.length - 1;
        const cell = row * scene.size + scene.queens[row];
        return {
          ...scene,
          queens: scene.queens.slice(0, -1),
          // 물린 행보다 아래의 자국은 함께 지워진다. 판이 정확히 이전 상태로 돌아간다.
          abandoned: [...scene.abandoned.filter((c) => Math.floor(c / scene.size) <= row), cell],
          // 헛걸음 자취는 지우지 않는다. 이 조각이 말하려는 것이 거기 쌓인다.
          tried: [...scene.tried, cell],
          step: { kind: 'undo' },
        };
      }

      case 'done':
        return { ...scene, step: { kind: 'done' } };

      // 손으로 짚기 시작 — 빈 판으로 돌아간다. 자취도 셈도 함께 처음으로 간다.
      //
      // 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌
      // 타입이 아무것도 막지 못한다.
      case 'rewind':
        return atStart({ size: scene.size });

      default:
        // 이 algorithm 이 발신하는 이벤트는 위 다섯이 전부다. 그 밖의 것은 조용히
        // 버린다 (C2).
        return scene;
    }
  },
};
