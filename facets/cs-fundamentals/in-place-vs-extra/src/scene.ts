/**
 * inPlaceVsExtra 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에는 **일곱 자리**에 흩어져 있었고 그중 어느 것도 payload 로 오지
 * 않았다. `let` 은 열둘이었지만 대부분 DOM 손잡이라 grep 만으로는 가려지지 않는다.
 *
 * - **`let tempClaimed`** — 제자리 쪽이 들고 있을 자리를 **이미 얻었나.** 이 조각의
 *   결론 절반("한 번 얻고 라운드마다 다시 쓴다")이 boolean 하나에만 적혀 있었고,
 *   `claimHeldSlot` 이 그것으로 갈리는 암묵 분기였다.
 * - **`Lane.borrowedCells`** — 지금까지 빌린 칸 수. `root`·`slotLayer`·`chipLayer`·
 *   `gaugeBar`·`gaugeLabel` 이라는 **DOM 손잡이와 한 객체에 묶여** 있었고 담는
 *   그릇이 `const lanes: Lane[]` 이라 `let` grep 을 통과했다. 게이지 보간의
 *   출발값이자 이 조각이 재는 수 그 자체다.
 * - **`inPlaceSlots: (Chip | null)[]`** — 제자리 띠의 **어느 칸에 어느 값이 앉았나.**
 *   `inPlaceAfter` 는 payload 에 실려 있었지만 projector 가 좁혀 버려 stage 에
 *   닿지 않았고, 배열의 지금 모습은 오직 이 손잡이 배열에만 있었다.
 * - **`const copiedChips: Chip[]`** — 빌린 띠에 적힌 값들. `const` 인데 `push` 로
 *   제자리에서 자란다. 결론의 나머지 절반이 여기 쌓였다.
 * - **원본에서 옮겨진 칸** — `paintChip(source, 'spent')` 의 **칠에만** 있었다.
 *   어느 칸이 이미 나갔나를 말하는 자리가 코드 어디에도 없다.
 * - **`Chip = { g, box, label, x, y }`** — DOM 손잡이와 **지금 좌표**가 한 객체.
 *   `moveChip` 이 다음 운동의 출발값을 `chip.x`/`chip.y` 에서 되읽었다.
 * - **`type ChipState`** — 선언만 있고 저장되는 곳이 없다. 칠에만 쓰인다.
 *
 * 여기서는 그 일곱이 `inPlace` 와 `takenCells` **둘**이다. 빌린 칸 수도, 얻은
 * 자리도, 옮겨 적힌 값도, 원본에서 나간 칸도 전부 그 둘에서 나온다.
 *
 * ── `round` 가 겸하던 뜻을 가른다
 *
 * 옛 `round` payload 는 필드가 열둘인데 말하는 것은 다섯이었고, 그중 둘은 같은
 * 수를 여러 이름으로 적어 둔 것이었다.
 *
 * | payload 가 싣던 것 | 실은 무엇인가 | 지금 |
 * | --- | --- | --- |
 * | `round` · `liftFrom` · `outSlot` | **셋이 같은 수** — 몇 번째 라운드인가 | `takenCells.length` 가 센다 |
 * | `shiftFrom` · `dropTo` | **둘이 같은 수** — 들고 있던 값이 앉을 칸 | `dropTo` 하나만 싣는다 |
 * | `heldValue` · `inPlaceAfter` | 든 값과 그 뒤의 배열 | `inPlace` 에서 셈한다 |
 * | `takenValue` · `outAfter` | 옮겨 적은 값과 그 뒤의 띠 | `values` + `takenCells` |
 * | `inPlaceExtra` · `extraExtra` | **이 조각이 재는 두 수** | `extraCellsOf` 한 함수 |
 *
 * 남는 것은 **걸음이 내리는 판정 둘**뿐이다 — 들고 있던 값을 어느 칸에 내려놓을
 * 것인가(`dropTo`), 남은 값 중 어느 것을 다음에 옮겨 적을 것인가(`takeFrom`).
 * 나머지는 화면의 구조에서 세지므로 싣지 않는다. 특히 두 넓이는 **화면에 나란히
 * 뜨는 수**라 갈리면 그림이 제 안에서 거짓이 된다 — `extraCellsOf` 하나를 게이지
 * 막대도 게이지 숫자도 캡션도 함께 부른다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 칸의 차례와 값의 배열이라는 **구조**만 담고, 칸 폭도 띠의
 * 자리도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지
 * 않는다 — 무엇을 말할지만 담고 수와 문자는 그리는 쪽이 `params.t` 로 만든다
 * (C10). 그래서 캡션에 인자가 하나도 없다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 띠 둘. 이름이 곧 두 방식이다. */
export type InPlaceVsExtraLaneKey = 'inPlace' | 'copy';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 출발 자리는 전부 `at`·`dropTo`·`takeFrom` 과 장면에서
 * 되셈된다. 그러니 그리는 쪽이 `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type InPlaceVsExtraStep =
  /** 두 띠에 같은 값이 놓인다. */
  | { kind: 'place' }
  /**
   * 한 라운드. 두 띠가 같은 걸음에서 함께 움직인다.
   *
   * `at` 은 **양쪽이 함께 다루는 칸 번호**다 — 제자리 띠가 들어 올릴 칸이자
   * 빌린 띠가 새로 여는 칸이다. 한 라운드에 값 하나씩이라는 사실이 이 한
   * 필드에 들어 있고, 그래서 세 이름으로 갈려 있던 수가 하나가 됐다.
   */
  | { kind: 'round'; at: number; dropTo: number; takeFrom: number }
  /** 다 끝났다. 두 넓이를 나란히 견준다. */
  | { kind: 'compare' };

/** 캡션이 말할 것. 인자가 없다 — 수는 전부 `extraCellsOf` 가 낸다. */
export type InPlaceVsExtraCaption =
  | { kind: 'begin' }
  | { kind: 'claim' }
  | { kind: 'reuseVsGrow' }
  | { kind: 'done' };

export type InPlaceVsExtraScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 정렬할 값. 두 방식이 같은 것을 받는다. 빌린 띠의 원본 줄이기도 하다. */
  values: readonly number[];

  // ── 자취. 걸음이 쌓고 `begin`·`rewind` 가 턴다.
  /**
   * 제자리 띠의 지금 배열. 차례가 곧 칸 번호다.
   *
   * 값이 놓이기 전에는 비어 있다 — 아직 없는 것은 숨기지 않고 짓지 않는다.
   */
  inPlace: readonly number[];
  /**
   * 빌린 띠가 원본에서 가져간 칸, 가져간 차례대로.
   *
   * **이 조각의 자취가 여기 한 배열에 모인다.** 빌린 칸 수도(`length`), 그 칸에
   * 적힌 값도(`values[i]`), 원본에서 이미 나간 칸도 전부 여기서 나온다. 셋을
   * 따로 두면 언젠가 갈린다.
   */
  takenCells: readonly number[];
  /** 재생이 끝났나. 두 결과가 나란히 선 채로 남는다. */
  finished: boolean;

  step: InPlaceVsExtraStep | null;
  caption: InPlaceVsExtraCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * 값 목록뿐이다. 배열도 넓이도 걸어오며 쌓은 자취라 여기 들지 않는다 — 넣으면
 * 되감은 화면이 이미 다 정렬된 채로 서고 그 위에 algorithm 이 새로 밟는 걸음이
 * 겹친다 (S-scene).
 */
type InPlaceVsExtraBase = Pick<InPlaceVsExtraScene, 'values'>;

/**
 * 값이 아직 놓이지 않은 처음 화면. 띠의 틀만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: InPlaceVsExtraBase): InPlaceVsExtraScene {
  return {
    values: base.values,
    inPlace: [],
    takenCells: [],
    finished: false,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 값 목록을 좁힌다. **값만 베껴 담아** 넘겨받은 배열을 쥐지 않는다 (S-scene). */
function nums(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 게이지 막대도 게이지 숫자도 캡션도 같은
// 함수를 부르므로 갈릴 자리가 없다.

/**
 * 두 방식이 지금까지 **원본 밖에 더 쓴 칸 수**. 이 조각이 재는 그 수다.
 *
 * 한 줄에 조각의 주장이 다 들어 있다 — 제자리 쪽은 값을 들고 있을 자리 하나가
 * 전부라 라운드가 몇 번이든 1 에서 멈추고, 빌리는 쪽은 옮겨 적은 만큼 늘어 끝내
 * 원본과 같은 수가 된다. 첫 라운드 전에는 양쪽 다 0 이다.
 */
export function extraCellsOf(
  scene: InPlaceVsExtraScene,
): Record<InPlaceVsExtraLaneKey, number> {
  const rounds = scene.takenCells.length;
  return { inPlace: rounds > 0 ? 1 : 0, copy: rounds };
}

/**
 * 값이 두 띠에 놓였나. `begin` 이 오기 전에는 틀만 서 있다.
 *
 * 제자리 띠가 찼는지로 가린다 — 두 띠가 같은 걸음에 같은 값을 받으므로 둘을
 * 따로 적어 두면 어긋날 자리만 생긴다.
 */
export function isPlacedOf(scene: InPlaceVsExtraScene): boolean {
  return scene.inPlace.length > 0;
}

/** 빌린 띠에 적힌 값들, 적힌 차례대로. 원본 칸 번호로 되짚어 낸다. */
export function copiedValuesOf(scene: InPlaceVsExtraScene): number[] {
  return scene.takenCells.map((i) => scene.values[i] ?? 0);
}

/** 원본의 각 칸이 이미 옮겨졌나. `spent` 칠이 말하던 것을 장면이 말한다. */
export function takenFlagsOf(scene: InPlaceVsExtraScene): boolean[] {
  const flags = scene.values.map(() => false);
  for (const i of scene.takenCells) if (i >= 0 && i < flags.length) flags[i] = true;
  return flags;
}

/**
 * 한 라운드를 얹은 제자리 띠.
 *
 * `at` 번 칸의 값을 들어 올리고, `dropTo`..`at-1` 의 값들을 오른쪽으로 한 칸씩
 * 건너뛰게 한 뒤, 빈자리에 내려놓는다. 자리를 늘리지 않는 대가가 이 건너뛰기다.
 */
function afterInsert(row: readonly number[], at: number, dropTo: number): number[] {
  const next = [...row];
  const held = next[at];
  if (held === undefined) return next;
  for (let j = at; j > dropTo; j -= 1) {
    const left = next[j - 1];
    if (left === undefined) break;
    next[j] = left;
  }
  next[dropTo] = held;
  return next;
}

export const inPlaceVsExtraScene: ScenePlan<InPlaceVsExtraScene> = {
  /**
   * 첫 장면은 틀만 세운다. 값은 `begin` 이 놓는다.
   *
   * 넘겨받은 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게
   * 된다 (S-scene). `nums` 가 값만 베껴 새 배열을 만든다.
   */
  initial(initialData: unknown): InPlaceVsExtraScene {
    const d = (initialData ?? {}) as { values?: unknown };
    return atStart({ values: nums(d.values) });
  },

  reduce(scene: InPlaceVsExtraScene, event: FacetRuntimeEvent): InPlaceVsExtraScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 두 띠에 같은 값이 놓인다. 여기서부터 나란히 간다.
      case 'begin':
        return {
          ...atStart({ values: scene.values }),
          inPlace: [...scene.values],
          step: { kind: 'place' },
          caption: { kind: 'begin' },
        };

      // 한 라운드. 두 띠가 함께 움직인다 — 그것이 이 조각의 주장이다.
      case 'round': {
        const dropTo = num(p.dropTo);
        const takeFrom = num(p.takeFrom);
        if (dropTo === null || takeFrom === null) return scene;
        // 차례는 발신이 오는 순서가 이미 말한다. 옮겨 적은 칸 수가 곧 라운드 번호다.
        const at = scene.takenCells.length;
        if (at >= scene.inPlace.length) return scene;
        return {
          ...scene,
          inPlace: afterInsert(scene.inPlace, at, dropTo),
          takenCells: [...scene.takenCells, takeFrom],
          step: { kind: 'round', at, dropTo, takeFrom },
          // 첫 라운드는 두 방식이 각자 자리를 얻는 순간이고, 그 뒤로는 한쪽만 는다.
          caption: at === 0 ? { kind: 'claim' } : { kind: 'reuseVsGrow' },
        };
      }

      // 결과는 같고 넓이는 다르다. 견줄 것이 다 서 있어야 하므로 아무것도 걷지 않는다.
      case 'done':
        return { ...scene, finished: true, step: { kind: 'compare' }, caption: { kind: 'done' } };

      case 'rewind':
        return atStart({ values: scene.values });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
