/**
 * editTableFill 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 발신이 셋뿐인데 stage 가 450 줄이었다. 변수는 거의 없고 **화면이 통째로 상태**였다.
 *
 * - **표의 값이 `number.textContent` 에만 있었다.** 코드 어디에도 "표" 라는 자료가
 *   없었고 algorithm 쪽 `value[][]` 는 발신에 실어 보내는 데만 쓰였다. 되짚어 세운
 *   화면에는 표가 없다는 뜻이다. 이제 `waves` 가 그것이다.
 * - `let landed: WaveCell[]` — **방금 내려앉은 칸들.** 다음 걸음의 `settle()` 이
 *   되돌렸다. 이제 `waves.length - 1` 이 그 반대각선이라 되돌릴 명령이 없다.
 * - `const marked = new Set<SVGRectElement>()` — **이번 걸음에 견주어 본 이웃들.**
 *   `const` 라 `let` grep 을 통과하고, DOM 손잡이 집합이라 어떤 낱말 목록에도 안
 *   든다. 게다가 `spread` 가 끝날 때 `clearMarks()` 로 지워, 그 표식이 **날아가는
 *   360ms 동안만** 살아 있었다 — 조각이 답하는 질문("한 칸의 값은 어디에서 오는가")이
 *   정지 화면에는 없었다. 이제 `waves` 에서 매번 파생해 그 걸음 내내 머문다.
 * - **다 찼나가 `waveLine.style.opacity` 와 답 칸의 칠에만 있었다.** 어떤 변수도
 *   그것을 말하지 않았다. 이제 `answered` 다.
 * - `type Scene = { source, target }` — stage 가 이미 `Scene` 이라는 이름을 쓰고
 *   있었다. 장면 타입과 부딪혀 stage 쪽을 `Words` 로 갈랐다 (프로토콜 함정 21).
 *
 * ── 싣는 것은 점화식뿐이다
 *
 * `from` 과 `value` 는 걸음이 내리는 판정이라 싣는다. 자리(`i` · `j`)와 차례(`k`)와
 * 손질 값(`cost`)은 표의 모양과 바탕 낱말에서 나오므로 algorithm 이 내주는 함수를
 * 부른다 — `editTableDiagonal` · `editLetterMatch` · `editStepCost`. 자르는 잣대가
 * 한 자리에만 있다 (`algorithm.ts` 의 "싣는 것과 싣지 않는 것").
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 칸 번호라는 **구조**만 담고 칸 폭도 물결선의 기울기도 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 *
 * 문안도 담지 않는다. `step` 이 **무엇을 말할지**만 말하고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10). 캡션 필드를 따로 두지 않는 까닭은 캡션의 갈래가
 * `step` 과 `waves.length` 에서 그대로 나오기 때문이다 — 나란히 두면 같은 것을 두
 * 자리에 적는 꼴이다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import {
  editLetterMatch,
  editStepCost,
  editTableCols,
  editTableDiagonal,
  editTableRows,
  type EditCellFrom,
  type EditFill,
} from './algorithm.js';

export type EditTableFillScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 고치는 쪽 낱말. 표의 세로. */
  source: string;
  /** 맞출 쪽 낱말. 표의 가로. */
  target: string;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 채워진 반대각선들. 자리 번호가 곧 `k` 이고 `length` 가 다음 반대각선이다.
   *
   * 표의 값도, 어느 칸이 어느 이웃에서 왔나도 여기 있다. 옛 화면은 앞의 것을
   * `textContent` 에, 뒤의 것을 360ms 짜리 테두리에 두고 있었다.
   */
  waves: readonly (readonly EditFill[])[];
  /** 답까지 말했나. 참이면 물결선을 거두고 오른쪽 아래 칸에 표식이 선다. */
  answered: boolean;

  step: EditStep | null;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 흐르게 할 것이 출발하는 자리는 전부 장면이 이미 말한다.
 * 값 알갱이는 골라 온 이웃 칸에서 출발하고, 물결선은 바로 앞 반대각선에서 밀려오고,
 * 답의 테는 표 전체에서 오므린다. `prev` 를 들출 일이 없다 (S-scene).
 */
export type EditStep = { kind: 'wave' } | { kind: 'answer' };

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `waves` · `answered` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 다
 * 채워진 표를 단 채로 서고 그 위에 algorithm 이 처음부터 다시 놓는 값이 겹친다
 * (S-scene).
 */
type EditTableFillBase = Pick<EditTableFillScene, 'source' | 'target'>;

/**
 * 아무것도 채워지지 않은 처음 화면. 빈 칸과 낱말 글자만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: EditTableFillBase): EditTableFillScene {
  return { source: base.source, target: base.target, waves: [], answered: false, step: null };
}

// ── 좁히개. 생산자가 같은 패키지라도 경계는 경계다 (C9) ──────────────────────

function isFrom(v: unknown): v is EditCellFrom {
  return v === 'origin' || v === 'up' || v === 'left' || v === 'diag';
}

/**
 * 반대각선 하나의 판정 목록으로 좁힌다.
 *
 * 한 칸이라도 어긋나면 통째로 물린다 — 칸의 자리를 차례에서 되찾으므로 가운데를
 * 건너뛰면 그 뒤가 전부 한 칸씩 밀린다.
 */
function readWave(payload: unknown, expected: number): readonly EditFill[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.cells) || p.cells.length !== expected) return null;

  const cells: EditFill[] = [];
  for (const raw of p.cells) {
    if (typeof raw !== 'object' || raw === null) return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.value !== 'number' || !Number.isFinite(c.value) || !isFrom(c.from)) return null;
    cells.push({ value: c.value, from: c.from });
  }
  return cells;
}

// ── 화면에 나란히 뜨는 수는 전부 아래를 지난다 ───────────────────────────────

/** 표의 세로 칸 수. */
export function rowsOf(scene: EditTableFillScene): number {
  return editTableRows(scene.source);
}

/** 표의 가로 칸 수. */
export function colsOf(scene: EditTableFillScene): number {
  return editTableCols(scene.target);
}

/** 반대각선 `k` 위의 칸들. algorithm 이 채운 차례와 같은 함수를 지난다. */
export function diagonalOf(
  scene: EditTableFillScene,
  k: number,
): readonly { i: number; j: number }[] {
  return editTableDiagonal(rowsOf(scene), colsOf(scene), k);
}

/** 그 칸의 판정. 아직 안 찼으면 `null`. */
export function fillAt(scene: EditTableFillScene, i: number, j: number): EditFill | null {
  const wave = scene.waves[i + j];
  if (wave === undefined) return null;
  const at = diagonalOf(scene, i + j).findIndex((c) => c.i === i);
  return at < 0 ? null : (wave[at] ?? null);
}

/** 그 칸에 적혀 있는 값. 아직 안 찼으면 `null`. */
export function valueAt(scene: EditTableFillScene, i: number, j: number): number | null {
  return fillAt(scene, i, j)?.value ?? null;
}

/**
 * 방금 찬 반대각선. 아직 아무것도 안 찼거나 답까지 말했으면 `null`.
 *
 * 답을 말한 걸음에서는 견줌의 표식도 물결선도 서지 않는다 — 그 화면이 하는 말은
 * "표가 다 찼고 이 한 칸이 답이다" 하나다.
 */
export function freshWave(scene: EditTableFillScene): number | null {
  if (scene.answered || scene.waves.length === 0) return null;
  return scene.waves.length - 1;
}

/** 오른쪽 아래 구석 — 두 낱말 전체의 답이 앉는 칸. */
export function answerCell(scene: EditTableFillScene): { i: number; j: number } {
  return { i: rowsOf(scene) - 1, j: colsOf(scene) - 1 };
}

/** 그 칸이 견주는 두 글자가 같은가. 같으면 공짜로 지나간 자리다. */
export function letterMatchAt(scene: EditTableFillScene, i: number, j: number): boolean {
  return editLetterMatch(scene.source, scene.target, i, j);
}

/** 그 칸이 골라 온 이웃. 구석이면 `null` — 표 안에 올 데가 없다. */
export function sourceCellOf(
  i: number,
  j: number,
  from: EditCellFrom,
): { i: number; j: number } | null {
  if (from === 'up') return { i: i - 1, j };
  if (from === 'left') return { i, j: j - 1 };
  if (from === 'diag') return { i: i - 1, j: j - 1 };
  return null;
}

/** 그 칸을 채울 때 견주어 본 이웃 셋. 표 밖으로 나가는 것은 빼고 준다. */
export function neighborsOf(
  scene: EditTableFillScene,
  i: number,
  j: number,
): readonly { i: number; j: number }[] {
  const rows = rowsOf(scene);
  const cols = colsOf(scene);
  const out: { i: number; j: number }[] = [];
  for (const n of [
    { i: i - 1, j },
    { i, j: j - 1 },
    { i: i - 1, j: j - 1 },
  ]) {
    if (n.i >= 0 && n.i < rows && n.j >= 0 && n.j < cols) out.push(n);
  }
  return out;
}

/** 그 칸에 붙은 손질 수. 0 이면 글자가 같아 공짜로 지나간 것이다. */
export function stepCostAt(scene: EditTableFillScene, i: number, j: number): 0 | 1 | null {
  const fill = fillAt(scene, i, j);
  if (fill === null) return null;
  return editStepCost(fill.from, letterMatchAt(scene, i, j));
}

export const editTableFillScene: ScenePlan<EditTableFillScene> = {
  /**
   * 첫 장면은 빈 표만 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 정한다. 넘겨받는 것이
   * 문자열 둘이라 참조를 쥘 일이 없다 (S-scene).
   */
  initial(initialData: unknown): EditTableFillScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({
      source: typeof d.source === 'string' ? d.source : '',
      target: typeof d.target === 'string' ? d.target : '',
    });
  },

  reduce(scene: EditTableFillScene, event: FacetRuntimeEvent): EditTableFillScene {
    switch (event.type) {
      /*
       * 다음 반대각선이 이웃에서 값을 받아 채워진다.
       *
       * 어느 반대각선인지도 어느 칸들인지도 받지 않는다 — 다음 것은 늘
       * `waves.length` 이고 그 위의 칸들은 표의 모양이 정한다.
       */
      case 'diagonal-filled': {
        const k = scene.waves.length;
        if (k >= rowsOf(scene) + colsOf(scene) - 1) return scene;
        const cells = readWave(event.payload, diagonalOf(scene, k).length);
        if (cells === null) return scene;
        return { ...scene, waves: [...scene.waves, cells], step: { kind: 'wave' } };
      }

      /*
       * 표가 다 찼다. 어느 칸이 답인지도 그 값이 얼마인지도 받지 않는다 —
       * 오른쪽 아래 구석이고 그 값은 이미 표 안에 있다.
       */
      case 'done':
        return { ...scene, answered: true, step: { kind: 'answer' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ source: scene.source, target: scene.target });

      default:
        // 이 algorithm 이 발신하는 것은 위 셋이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
