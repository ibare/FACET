/**
 * RowTimesColumn 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 변수가 하나도 없었고 stage 의 `let` 도 둘뿐이었다. 그런데도 화면이
 * 아는 것은 많았다 — **전부 칠과 글자에 있었다.**
 *
 * - **한 칸에 쌓인 곱들이 어디에도 없었다.** `cell.sum.textContent` 에 누적 합만
 *   덮어써서, 굳은 칸을 보면 `58` 은 있는데 그 58 이 `7 + 18 + 33` 이었다는 것은
 *   사라졌다. 이 조각의 주장이 바로 그 덧셈이다. 이제 `cells[row][col]` 이 쌓인 곱을
 *   그대로 들고 있고 정적 그리기가 항과 합을 함께 세운다 (아래 "이행이 고친 것").
 * - **칸이 굳었나가 `cell.rect` 의 `fill`·`stroke`·`stroke-dasharray` 에만 있었다.**
 *   `dressCell(cell, sealed)` 가 쓰기만 하고 아무 변수도 그것을 말하지 않았다. 이제
 *   `terms.length === b.length` 가 말한다 — 굳음은 따로 적어 둘 것이 아니라 항이 다
 *   찬 것이다.
 * - `let lit: Tile[]` — **지금 어느 짝을 맞대고 있나.** 다음 걸음이 `paintTile(false)`
 *   로 지우는 명령형 되돌림이 딸려 있었다. 이제 `meet` 가 말하고 그 코드가 사라졌다.
 * - **띠 둘(`bandRow`·`bandCol`)의 `opacity` 와 `x`/`y`** 가 "어느 행과 어느 열이
 *   만나는 중인가" 를 쥐고 있었다. 재건 밖 요소라 `close()` 가 `opacity` 만 되돌리고
 *   자리는 앞 걸음 값으로 남았다. 이제 `meet` 가 있을 때만 **짓는다** (숨기지 않는다).
 * - **`chipFromCol` 한 알갱이에 두 뜻이 실려 있었다.** 처음에는 B 쪽 수(주황)였다가
 *   맞닿은 뒤 곱(노랑)으로 글자와 칠이 갈아 끼워졌다. 어느 단계인지가 그 칠에만
 *   있었다. 이제 알갱이는 운동 안에서만 살고 정지 화면에는 없다.
 * - stage 의 `type Scene = { a, b }` · `readScene` 이 이 이름과 부딪혔다. 화면을 세우는
 *   바탕을 읽는 일이 곧 장면의 첫 걸음이므로 여기로 옮겨 왔다.
 *
 * ── 무엇을 싣고 무엇을 세나
 *
 * 옛 발신은 `{ row, col, k, a, b, product, sum }` 일곱을 실었다. 셋만 남는다.
 *
 * | 무엇 | 어디서 | 왜 |
 * | --- | --- | --- |
 * | `row` · `col` | **싣는다** | 어느 칸을 짓고 있는가는 걸음이 내리는 판정이다 |
 * | `product` | **싣는다** | 짝을 맞대어 곱한다는 것이 이 조각의 알고리즘 그 자체다 |
 * | `k` | 장면이 센다 | 그 칸에 쌓인 항의 수가 곧 몇 번째 짝인가다 |
 * | `a` · `b` | 장면이 바탕을 읽는다 | `a[row][k]` · `b[k][col]` — 번호로 읽는 것뿐이다 |
 * | `sum` | 장면이 센다 | 쌓인 항의 합. 화면의 항과 합이 한 자료에서 나와야 한다 |
 *
 * `product` 를 내주지 않고 싣는 것이 경계다. `a[row][k] * b[k][col]` 을 장면이
 * 셈하게 하면 **장면이 이 조각의 알고리즘을 통째로 되풀이하고 발신은 장식이 된다** —
 * `bottom-up-table` 이 피보나치 점화식 앞에서 멈춘 것과 같은 자리다 (프로토콜 4 절의
 * 잣대 표). 잣대는 "그 함수만 떼어 내도 조각이 말하려는 바가 남아 있나" 인데, 행과
 * 열을 맞대어 곱하는 일을 떼면 이 조각에는 아무것도 안 남는다.
 *
 * 반대로 `sum` 은 반드시 걷어내야 했다. 화면이 항을 늘어놓는 이상 합은 그 항들에서
 * 나와야 하고, 발신이 함께 실어 오면 **같은 물음에 답이 둘**이 된다.
 *
 * `pair-meet` 과 `cell-formed` 을 나눠 받지 않는 것도 같은 까닭이다 — 굳었나는
 * `terms.length === b.length` 로 드러나므로 두 발신을 한 갈래로 처리한다. 어휘를
 * 가르는 것은 algorithm 의 몫이고 (C2) 화면에서 갈리는 것은 항의 수다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 행 번호와 열 번호라는 **구조**만 담고 칸 폭도 띠의 자리도
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 *
 * 문안도 담지 않는다. 캡션이 무엇을 말할지는 `meet` · `cells` · `finished` 셋에서
 * 곧바로 파생하므로 캡션 필드를 따로 두지 않는다 — 나란히 두면 같은 것을 두 자리에
 * 적는 꼴이다. 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 바탕 행렬. 값만 담는다 — 러너가 준 객체를 참조로 쥐지 않는다 (S-scene). */
export type Matrix = readonly (readonly number[])[];

/** 한 칸에 지금까지 쌓인 곱들. 자리 번호가 곧 그 항의 차례(k)다. */
export type CellTerms = readonly number[];

/** 결과 행렬의 칸들. 바깥이 행, 안이 열. */
export type ProductGrid = readonly (readonly CellTerms[])[];

/** 지금 맞대고 있는 자리. 몇 번째 짝인지는 그 칸의 항 수가 말한다. */
export type Meet = { row: number; col: number };

export type RowTimesColumnScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 왼쪽 행렬 — 행이 눕는다. */
  a: Matrix;
  /** 오른쪽 행렬 — 열이 선다. */
  b: Matrix;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 칸마다 쌓인 곱들.
   *
   * 옛 화면은 누적 합만 `textContent` 에 덮어써서 **무엇을 더해 그 수가 되었는지**를
   * 걸음마다 지웠다. 이 조각이 하려는 말이 그 덧셈이라 여기 남긴다.
   */
  cells: ProductGrid;
  /** 지금 맞대고 있는 짝. 없으면 아무 데도 짚고 있지 않다. */
  meet: Meet | null;
  /** 모든 칸이 찼다. 띠를 거두고 결과만 남는다. */
  finished: boolean;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `cells` · `meet` · `finished` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은
 * 화면이 다 찬 칸을 단 채로 서고 그 위에 algorithm 이 처음부터 다시 쌓는 항이
 * 겹친다 (S-scene).
 */
type RowTimesColumnBase = Pick<RowTimesColumnScene, 'a' | 'b'>;

const EMPTY: RowTimesColumnScene = {
  a: [],
  b: [],
  cells: [],
  meet: null,
  finished: false,
};

/** B 의 열 수. 결과 행렬의 가로가 여기서 나온다. */
export function colsOf(b: Matrix): number {
  return b[0]?.length ?? 0;
}

/** 맞물리는 안쪽 치수. 한 칸이 받을 항의 수이기도 하다. */
export function innerOf(scene: RowTimesColumnScene): number {
  return scene.b.length;
}

/** 그 칸에 쌓인 항들. 칸이 없으면 빈 목록. */
export function termsAt(scene: RowTimesColumnScene, row: number, col: number): CellTerms {
  return scene.cells[row]?.[col] ?? [];
}

/** 항들의 합 — 그 칸에 지금 적혀 있는 수. */
export function sumOf(terms: CellTerms): number {
  let total = 0;
  for (const term of terms) total += term;
  return total;
}

/**
 * 그 칸이 굳었나.
 *
 * 따로 적어 두지 않는다 — 항이 안쪽 치수만큼 차면 그것이 곧 굳은 것이다. 옛 화면은
 * 이것을 `rect` 의 칠에만 두고 있었다.
 */
export function isSealed(scene: RowTimesColumnScene, row: number, col: number): boolean {
  const inner = innerOf(scene);
  return inner > 0 && termsAt(scene, row, col).length === inner;
}

/** 아무 칸도 차지 않은 처음 화면. */
function atStart(base: RowTimesColumnBase): RowTimesColumnScene {
  const cols = colsOf(base.b);
  const cells: CellTerms[][] = [];
  for (let row = 0; row < base.a.length; row += 1) {
    const line: CellTerms[] = [];
    for (let col = 0; col < cols; col += 1) line.push([]);
    cells.push(line);
  }
  return { a: base.a, b: base.b, cells, meet: null, finished: false };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 수의 행렬인지 보고 **값을 복사해** 돌려준다. 참조를 쥐지 않는다 (S-scene). */
function matrix(value: unknown): number[][] | null {
  if (!Array.isArray(value)) return null;
  const out: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) return null;
    const line: number[] = [];
    for (const cell of row) {
      const n = num(cell);
      if (n === null) return null;
      line.push(n);
    }
    out.push(line);
  }
  return out;
}

/**
 * 선언의 두 행렬을 읽는다.
 *
 * 맞물리지 않는 두 행렬은 이 조각이 할 말이 없다 — 그때는 빈 장면이 되어 화면이
 * 아무것도 세우지 않는다. 옛 stage 의 `readScene` 이 하던 일이고, 화면을 세우는
 * 바탕을 정하는 것이 장면의 첫 걸음이므로 여기로 옮겨 왔다.
 */
function readBase(data: unknown): RowTimesColumnBase | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const a = matrix(d.a);
  const b = matrix(d.b);
  if (!a || !b || a.length === 0 || b.length === 0) return null;
  const inner = a[0]?.length ?? 0;
  const cols = colsOf(b);
  if (inner === 0 || cols === 0) return null;
  if (inner !== b.length) return null;
  if (a.some((row) => row.length !== inner)) return null;
  if (b.some((row) => row.length !== cols)) return null;
  return { a, b };
}

export const rowTimesColumnScene: ScenePlan<RowTimesColumnScene> = {
  /**
   * 첫 장면은 빈 칸만 세운다.
   *
   * 이 조각은 `init` 을 발신하지 않으므로 바탕을 여기서 정한다. 넘겨받은 배열을
   * 참조로 쥐지 않고 값만 옮겨 담는다 (S-scene).
   */
  initial(initialData: unknown): RowTimesColumnScene {
    const base = readBase(initialData);
    return base === null ? EMPTY : atStart(base);
  },

  reduce(scene: RowTimesColumnScene, event: FacetRuntimeEvent): RowTimesColumnScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 한 짝이 칸에서 맞물린다.
       *
       * `cell-formed` 을 따로 받지 않는다 — 마지막 짝인지는 항이 다 찼나로 드러나고
       * (`isSealed`), 그 물음에 답이 둘이면 갈린다. 두 어휘를 나누는 것은 걸음의
       * 경계를 말하는 algorithm 의 몫이다 (C2).
       */
      case 'pair-meet':
      case 'cell-formed': {
        const row = num(p.row);
        const col = num(p.col);
        const product = num(p.product);
        if (row === null || col === null || product === null) return scene;
        // 없는 칸을 가리키는 발신은 조용히 흘린다 (C2).
        if (scene.cells[row]?.[col] === undefined) return scene;
        return {
          ...scene,
          // 앞 장면을 제자리에서 고치지 않는다 — 되짚기가 지나온 장면을 그대로 쓴다.
          cells: scene.cells.map((line, r) =>
            r !== row ? line : line.map((terms, c) => (c !== col ? terms : [...terms, product])),
          ),
          meet: { row, col },
        };
      }

      // 다 찼다. 짚던 자리를 놓고 결과만 남긴다.
      case 'done':
        return { ...scene, meet: null, finished: true };

      // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
      case 'rewind':
        return atStart({ a: scene.a, b: scene.b });

      default:
        // 이 algorithm 이 발신하는 것은 위 넷이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
