/**
 * squareAndHalve 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 축
 *
 * **어느 자리를 답으로 보냈고 어느 자리를 건너뛰었나.** 그 대조가 이 조각의
 * 알맹이다 — "지수를 반씩 접으면서 비트가 1 인 자리만 곱한다". 그래서 장면의
 * 중심은 줄의 모양이 아니라 `rows` 와 `places` 두 벌이고, 나머지는 거기서 센다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * ① projector 의 `let` 은 **0 건**, ③ 조회 분기도 **0 건**, ④ DOM 되읽기도
 * `textContent` 쓰기뿐이었다. 그러니 "숨은 상태가 없다" 가 아니라 **화면이 통째로
 * 상태**였다는 뜻이다 (프로토콜 3-1).
 *
 * - **`let factors: number[]` · `let landed: SVGGElement[]`** — **어느 자리를 답으로
 *   보냈나.** 이 조각의 결론인데 하나는 payload 로 받아 쌓은 배열이고 하나는 DOM
 *   손잡이 배열이었다. 이제 `places` 가 그것을 말하고 값은 `rows` 에서 나온다.
 * - **`let cellUnits`** — 지금 줄의 칸 하나가 덮는 지수 폭. 그런데 **같은 수가
 *   `take`/`skip` 의 `place` 로도 실려 왔다.** 같은 물음에 답이 둘이라 우연히 맞고
 *   있었을 뿐이다 (프로토콜 4 절 25 번). 이제 줄 번호 하나에서 `unitsAt` 이 낸다.
 * - **`let rowIndex`** — 몇 번째 줄인가. 이것도 `fold` 의 `row` 와 두 벌이었고
 *   `foldRow` 가 `rowY(a.row) - rowY(rowIndex)` 로 둘을 견주고 있었다. 줄은 올
 *   때마다 하나씩 쌓이므로 `rows.length` 가 그 번호다.
 * - **`let rowCells: Cell[]`** — 지금 줄에 선 칸들. DOM 손잡이면서 동시에 **남은 칸
 *   수**였다. `takeCell` 이 `rowCells.pop()` 한 뒤 `cellBox(rowCells.length, …)` 로
 *   떠난 칸의 출발 자리를 되읽었다 — 화면의 거울을 운동의 출발값으로 삼는 자리다
 *   (프로토콜 4 절 28 번). 이제 `rows[r].count` 가 말한다.
 * - **⑤ `digitLayer` · `chipLayer` 의 자식들** — 어느 자리가 1 이고 어느 자리가
 *   0 인가, 곧 **지수의 이진 표기**가 `<g>` 의 자식으로만 쌓이고 있었다. 어떤
 *   `let` 에도 `Map` 에도 없어 grep 다섯 줄 중 어느 것에도 안 걸린다.
 *
 * ── 화면에 나란히 뜨는 수는 한 자로 잰다
 *
 * 걸음이 실어 오던 `place` · `count` · `factor` · `product` · `row` · `naive` ·
 * `squarings` · `multiplies` · `total` · `bits` 를 전부 걷어냈다. 전부 아래에서
 * 센다 — **곱셈 횟수가 이 조각의 자랑인데 그것이 화면의 자취와 다른 출처를 갖고
 * 있었다** (프로토콜 4 절 10 번).
 *
 * - **제곱 횟수**는 줄의 수다 — `squaringsOf` 는 `rows.length - 1`. 화면에서도
 *   센다: 줄이 하나 늘어난 것이 곧 제곱 한 번이다.
 * - **답곱 횟수**는 자리표에 앉은 칩의 수다 — `takenOf(…).length`.
 * - **누적 곱**은 그 칩들의 값을 곱한 것이다 — `productOf`.
 * - **이진 표기**는 자리마다의 판정을 큰 자리부터 읽은 것이다 — `bitsOf`.
 * - **하나씩 곱을 때의 횟수**는 처음 줄의 칸 수에서 하나를 뺀 것이다 — `naiveOf`.
 *
 * ── 싣는 것은 제곱 하나뿐이다
 *
 * `fold` 의 `value` 만 남겼다. 접었을 때 칸의 새 값은 **이 알고리즘 그 자체**라
 * 함수로 내주면 장면이 알고리즘을 되풀이한다. 게다가 이 조각에서는 그 위험이 한
 * 겹 더 있다 — 밑과 자릿값만 있으면 `Math.pow(base, place)` 로도 같은 수가 나오는데,
 * 그러면 화면이 "이렇게 안 해도 된다" 고 말하면서 정작 **그렇게 해서 얻은 수**를
 * 띄우게 된다. 그래서 싣는다 (프로토콜 4 절의 가운데 줄 경계).
 *
 * 반대로 **칸 수가 반이 되는 것은 장면이 센다.** 그것은 셈이 아니라 그림이 이미
 * 하고 있는 일이다 — 새 줄의 칸 하나는 앞 줄의 짝 하나에서 나오므로 새 줄의 칸
 * 수는 **앞 줄에 선 짝의 수**다. 지수를 좁히는 잣대만은 두 곳에 적히면 갈리므로
 * algorithm 이 `exponentOf` 를 내주고 여기서 부른다 (B 갈래).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 줄 번호와 칸 번호라는 **구조**만 담고 칸 폭도 자리표의
 * 자리도 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — `step` 이 무엇을
 * 말할지만 말하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10). 캡션 필드를 따로
 * 두지 않는 까닭은 `step` 과 캡션의 갈래가 정확히 1 대 1 이고, 캡션이 읽는 수는
 * 전부 위 함수들을 지나기 때문이다 — 나란히 두면 같은 것을 두 자리에 적는 꼴이다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { exponentOf } from './algorithm.js';

/**
 * 줄 하나.
 *
 * 줄 번호가 곧 그 줄의 칸이 덮는 지수 폭을 정하므로(`unitsAt`) 여기에는 적지 않는다.
 */
export type SquareAndHalveRow = {
  /** 칸에 적힌 값. 줄 0 은 밑이고 그 뒤는 앞 줄 값의 제곱 — `fold` 가 실어 온다. */
  readonly value: number;
  /** 이 줄에 **아직 서 있는** 칸 수. 답으로 보낸 칸은 빠져 있다. */
  readonly count: number;
};

/**
 * 한 자리의 판정. 줄 번호와 1 대 1 이다 — 자리 `r` 은 줄 `r` 에서 갈린다.
 *
 * **이 목록이 이 조각의 결론이다.** 취한 자리와 건너뛴 자리가 한 화면에 함께
 * 서 있어야 "이만큼만 곱했다" 가 남는다. 걸음마다 지우면 건너뛴 자리가 지나가는
 * 운동으로만 보이고 끝난다 (프로토콜 4 절 7 번·23 번).
 */
export type SquareAndHalvePlace = 'take' | 'skip';

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 계기값을 싣지 않는다 — 흐르게 할 것이 출발하는 자리는 전부 장면이 이미 말한다.
 * 떠나는 칸은 제 줄의 끝 자리에서 출발하고, 새 줄의 칸은 제 짝 위에서 내려온다.
 * `prev` 를 들출 일이 없다 (S-scene).
 */
export type SquareAndHalveStep = {
  readonly kind: 'begin' | 'take' | 'skip' | 'fold' | 'done';
};

export type SquareAndHalveScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 밑. 처음 줄의 칸마다 적히는 값. */
  readonly base: number;
  /** 지수. 처음 줄의 칸 수이자 자리표의 폭을 정하는 수. */
  readonly exponent: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 접을 때마다 하나씩 쌓이는 줄들. `length - 1` 이 곧 제곱 횟수다. */
  readonly rows: readonly SquareAndHalveRow[];
  /** 자리마다의 판정. `length` 가 지금까지 지나온 자리 수다. */
  readonly places: readonly SquareAndHalvePlace[];
  /** 다 셌다. */
  readonly finished: boolean;
  readonly step: SquareAndHalveStep | null;
};

/**
 * 걸음이 **고치지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `rows` · `places` · `finished` 는 걸어오며 쌓은 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 다 접힌 줄과 앉은 칩을 단 채로 서고 그 위에 algorithm 이
 * 처음부터 다시 밟는다 (프로토콜 4 절 14 번).
 */
type SquareAndHalveBase = Pick<SquareAndHalveScene, 'base' | 'exponent'>;

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (프로토콜 4 절 15 번).
 */
function atStart(base: SquareAndHalveBase): SquareAndHalveScene {
  return {
    base: base.base,
    exponent: base.exponent,
    rows: [],
    places: [],
    finished: false,
    step: null,
  };
}

// ── 화면에 나란히 뜨는 수는 전부 아래를 지난다 ───────────────────────────────

/**
 * 줄 `r` 의 칸 하나가 덮는 지수 폭. 이진수의 자릿값이기도 하다.
 *
 * 줄이 하나 내려갈 때마다 칸은 두 배의 지수를 덮는다. 옛 화면은 이 수를 stage 의
 * `cellUnits` 와 payload 의 `place` **두 곳**에 두고 있었다.
 */
export function unitsAt(row: number): number {
  return Math.pow(2, Math.max(0, row));
}

/** 자리표의 자리 수. 지수를 이진수로 적었을 때의 자릿수다. */
export function slotCountOf(scene: SquareAndHalveScene): number {
  let bits = 0;
  let v = scene.exponent;
  while (v > 0) {
    bits += 1;
    v = Math.floor(v / 2);
  }
  return Math.max(1, bits);
}

/**
 * 줄 `r` 이 처음 섰을 때의 칸 수.
 *
 * 답으로 보낸 칸이 빠지기 전의 수라, 그 줄의 캡션이 말하는 "칸 열셋" 이 이것이다.
 * 떠난 자리를 빈 테로 남겨 두므로 **그리는 쪽의 칸 수**이기도 하다.
 */
export function enteringCountOf(scene: SquareAndHalveScene, row: number): number {
  const here = scene.rows[row];
  if (here === undefined) return 0;
  return here.count + (scene.places[row] === 'take' ? 1 : 0);
}

/** 답으로 보낸 칸들. 자리표에 앉은 칩이 곧 이것이다. */
export function takenOf(
  scene: SquareAndHalveScene,
): readonly { row: number; place: number; factor: number }[] {
  const out: { row: number; place: number; factor: number }[] = [];
  scene.places.forEach((place, row) => {
    const here = scene.rows[row];
    if (place !== 'take' || here === undefined) return;
    out.push({ row, place: unitsAt(row), factor: here.value });
  });
  return out;
}

/**
 * 지금까지의 누적 곱 — **이 조각의 답**.
 *
 * 자리표에 앉은 칩의 값을 곱한 것이다. 옛 발신은 `product` 를 실어 보냈는데,
 * 그러면 화면에 뜨는 곱셈식과 그 결과가 서로 다른 출처가 된다.
 */
export function productOf(scene: SquareAndHalveScene): number {
  let product = 1;
  for (const taken of takenOf(scene)) product *= taken.factor;
  return product;
}

/**
 * 제곱 횟수 — 접은 횟수다.
 *
 * 줄이 하나 늘어나는 것이 곧 제곱 한 번이라 **화면에서도 세어진다.** 옛 화면은
 * 접을 때마다 앞 줄을 지워 이 수가 완주 화면에 남지 않았다 (프로토콜 4 절 7 번).
 */
export function squaringsOf(scene: SquareAndHalveScene): number {
  return Math.max(0, scene.rows.length - 1);
}

/** 답에 곱한 횟수 — 자리표에 앉은 칩의 수다. */
export function multipliesOf(scene: SquareAndHalveScene): number {
  return takenOf(scene).length;
}

/** 곱셈 횟수. 제곱과 답곱을 더한 것이고, 이 조각이 자랑하는 수다. */
export function totalOf(scene: SquareAndHalveScene): number {
  return squaringsOf(scene) + multipliesOf(scene);
}

/** 하나씩 곱을 때의 곱셈 횟수. 칸 열셋을 잇는 데 드는 곱셈은 열둘이다. */
export function naiveOf(scene: SquareAndHalveScene): number {
  return Math.max(0, scene.exponent - 1);
}

/**
 * 지수의 이진 표기 — 큰 자리부터.
 *
 * 자리마다의 판정을 뒤집어 읽은 것이다. 취한 자리가 1 이고 건너뛴 자리가 0 이라,
 * 화면의 칩·빈 자리와 같은 자료에서 나온다.
 */
export function bitsOf(scene: SquareAndHalveScene): readonly number[] {
  return [...scene.places].reverse().map((place) => (place === 'take' ? 1 : 0));
}

export const squareAndHalveScene: ScenePlan<SquareAndHalveScene> = {
  /**
   * 첫 장면은 빈 자리표만 세운다. 줄은 `begin` 이 세운다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 넘겨받는
   * 것이 수 둘이라 참조를 쥘 일이 없고, 지수를 좁히는 잣대는 algorithm 이 내주는
   * 함수 하나를 부른다 (S-scene).
   */
  initial(initialData: unknown): SquareAndHalveScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    return atStart({
      base: num(raw.base) ?? 0,
      exponent: exponentOf(raw.exponent),
    });
  },

  reduce(scene: SquareAndHalveScene, event: FacetRuntimeEvent): SquareAndHalveScene {
    switch (event.type) {
      /*
       * 줄이 처음 선다. 칸 수도 칸의 값도 선언이 이미 말하므로 받을 것이 없다.
       *
       * 자취를 털고 시작한다 — 되감기 없이 다시 재생해도 줄이 두 벌로 서지 않는다.
       */
      case 'begin': {
        const fresh = atStart({ base: scene.base, exponent: scene.exponent });
        return {
          ...fresh,
          rows: [{ value: scene.base, count: scene.exponent }],
          step: { kind: 'begin' },
        };
      }

      /*
       * 칸 수가 홀수라 짝 없는 한 칸이 남는다. 그 칸을 답으로 보낸다.
       *
       * 어느 칸을 얼마에 보냈는지는 받지 않는다 — 떠나는 것은 늘 그 줄의 **끝
       * 칸**이고 값은 그 줄에 적혀 있다. 판정은 발신의 type 그 자체다.
       */
      case 'take': {
        const row = scene.rows.length - 1;
        const here = scene.rows[row];
        // 한 줄에서 자리는 한 번만 갈린다. 겹쳐 오면 조용히 버린다 (C2).
        if (here === undefined || here.count <= 0 || scene.places.length !== row) return scene;
        return {
          ...scene,
          rows: scene.rows.map((r, i) => (i === row ? { value: r.value, count: r.count - 1 } : r)),
          places: [...scene.places, 'take'],
          step: { kind: 'take' },
        };
      }

      /* 칸 수가 짝수라 답으로 갈 것이 없다. 줄은 온전히 남는다. */
      case 'skip': {
        const row = scene.rows.length - 1;
        if (scene.rows[row] === undefined || scene.places.length !== row) return scene;
        return {
          ...scene,
          places: [...scene.places, 'skip'],
          step: { kind: 'skip' },
        };
      }

      /*
       * 반으로 접는다. 앞 줄의 짝 하나가 새 줄의 칸 하나가 된다.
       *
       * 새 칸의 값(`value`)만 받는다 — 제곱은 이 알고리즘 그 자체다. 칸 수는 받지
       * 않는다: 새 줄의 칸 수는 **앞 줄에 선 짝의 수**이고 그것은 그림이 이미 하고
       * 있는 셈이다.
       */
      case 'fold': {
        const value = num((event.payload as Record<string, unknown> | undefined)?.value);
        const here = scene.rows[scene.rows.length - 1];
        if (value === null || here === undefined) return scene;
        return {
          ...scene,
          rows: [...scene.rows, { value, count: Math.floor(here.count / 2) }],
          step: { kind: 'fold' },
        };
      }

      /* 다 셌다. 곱셈 횟수도 이진 표기도 자취에서 나오므로 받을 것이 없다. */
      case 'done':
        return { ...scene, finished: true, step: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ base: scene.base, exponent: scene.exponent });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
