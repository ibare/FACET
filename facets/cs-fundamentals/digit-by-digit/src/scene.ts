/**
 * digitByDigit 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신하되 stage 의 메서드를 부르지 않고 다음 장면을
 * 돌려줄 뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다 (S-scene).
 *
 * ── 이 조각의 화면
 *
 * 위에 줄(lane), 가운데 통 열 개(0..9), 아래 장부. 라운드마다 세 걸음이 돈다 —
 * 보는 자리를 한 칸 왼쪽으로 옮기고(`focus-place`), 줄 전체가 통으로 내려가고
 * (`scatter`), 통을 0 부터 읽어 다시 줄로 올린다(`gather`). 올라온 줄이 장부에
 * 한 줄씩 쌓여 **"한 자리만 봤는데 그만큼 줄이 섰다"** 가 끝까지 남는다.
 *
 * ── 축은 "지금 몇째 자리인가" 다
 *
 * 옮기기 전 그것은 stage 의 `let focusColumn` 하나와 막대의 `x` 속성에만 있었다.
 * 라운드 번호는 아예 어디에도 없었고 payload 의 `round` 로 걸음마다 실려 왔다.
 * 이제 `round` 가 장면의 축이고 `column` 이 그 귀결이다 — 차례는 발신이 오는
 * 순서가 말하므로 발신은 아무것도 싣지 않는다.
 *
 * ── 걸음이 내리는 판정이 하나도 없다
 *
 * 어느 통으로 가는지도, 통을 이어 붙인 다음 줄도, 자리값도 전부 **바탕 자료에
 * 순수 함수를 먹이면 나오는 것**이다. 그래서 algorithm 은 그 함수를 내주고
 * (`computeDigitByDigitRounds`) 장면이 그것을 부른다 — payload 로 받으면 같은
 * 수를 두 자리에서 세는 문이 열린다. 값끼리 견주는 곳이 한 군데도 없다는 것이
 * 이 조각의 주장이라, 판정이 없다는 사실 자체가 조각의 성질이다.
 *
 * 좌표는 담지 않는다. 줄 순서와 통 번호 같은 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { computeDigitByDigitRounds, type DigitRound } from './algorithm.js';

/**
 * 한 수가 지금 통 어디에 앉아 있나.
 *
 * algorithm 의 `DigitPlacement` 와 같은 모양이되 여기서 다시 선언한다 — 그리는
 * 쪽(View)이 algorithm 을 참조하지 않게 하려면 이 이름이 장면 쪽에 있어야 한다
 * (원칙 1).
 */
export type DigitByDigitSeat = { id: number; bin: number; slot: number };

/** 장부의 한 줄 — 라운드 하나가 끝나고 남는 것. */
export type DigitByDigitLedgerRow = {
  /** 그 라운드가 읽은 자리값 (1 · 10 · 100). */
  place: number;
  /** 그 라운드가 읽은 글자 칸. 줄에서 또렷하게 그릴 칸이다. */
  column: number;
  /** 라운드를 마친 줄 순서 (id). */
  ids: readonly number[];
};

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * `gather` 만 계기값을 싣는다 — 통에서 줄로 올라오는 운동은 출발 그림이
 * "올라오기 직전의 통" 인데 그 걸음이 통을 비우기 때문이다. `prev` 에서 꺼내는
 * 대신 그때의 자리를 표식으로 남긴다 (S-scene).
 */
export type DigitByDigitStep =
  | { kind: 'focus' }
  | { kind: 'scatter' }
  | { kind: 'gather'; from: readonly DigitByDigitSeat[] }
  | { kind: 'done' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type DigitByDigitCaption =
  | { kind: 'start'; count: number }
  | { kind: 'focus'; round: number; total: number; place: number }
  | { kind: 'scatter'; place: number }
  | { kind: 'gather' }
  | { kind: 'done'; rounds: number };

export type DigitByDigitScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 줄 세울 수. id 는 이 배열에서의 자리(0..n-1)이고 줄이 흩어져도 안 바뀐다. */
  values: readonly number[];
  /** 가장 긴 수의 자릿수. 글자 칸 수이자 라운드 수다. */
  width: number;

  // ── 걸어온 자취.
  /** 몇째 라운드를 보고 있나. 0 이면 아직 아무 자리도 보지 않았다. */
  round: number;
  /** 지금 또렷한 글자 칸. 아직이거나 다 마쳤으면 null (그때는 전부 또렷하다). */
  column: number | null;
  /** 지금 통에 내려가 있는 자리. 줄에 있으면 null. */
  bins: readonly DigitByDigitSeat[] | null;
  /** 라운드마다 한 줄씩 쌓인다. 이 조각의 주장이 남는 자리다. */
  ledger: readonly DigitByDigitLedgerRow[];
  /** 마지막 자리까지 마쳤다. */
  done: boolean;
  step: DigitByDigitStep | null;
  caption: DigitByDigitCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면과 되감기가 함께 쓴다.
 *
 * 줄 순서도 장부도 여기 들지 않는다 — 전부 걸어오며 쌓은 것이라 되감기에 그대로
 * 넘기면 되감은 화면이 이미 다 돌아간 채로 선다.
 */
type DigitByDigitBase = Pick<DigitByDigitScene, 'values' | 'width'>;

function atStart(base: DigitByDigitBase): DigitByDigitScene {
  return {
    values: base.values,
    width: base.width,
    round: 0,
    column: null,
    bins: null,
    ledger: [],
    done: false,
    step: null,
    caption: { kind: 'start', count: base.values.length },
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function nums(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/**
 * 그 라운드가 어떻게 흩어지고 모이는가 — algorithm 이 내준 **같은 함수**로 센다.
 *
 * 걸음이 실어 오는 것이 아니라 여기서 부른다. 바탕이 그대로면 결과도 그대로라
 * 되짚어 다시 셈해도 같은 답이 나온다 (순수).
 */
function roundAt(scene: DigitByDigitScene, round: number): DigitRound | null {
  if (round < 1) return null;
  return computeDigitByDigitRounds([...scene.values])[round - 1] ?? null;
}

export const digitByDigitScene: ScenePlan<DigitByDigitScene> = {
  /**
   * 첫 장면은 줄만 세운다.
   *
   * 이 조각은 `init` 을 발신하지 않으므로 바탕을 여기서 좁힌다. 넘겨받은 배열을
   * **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한
   * 객체다 (S-scene). 라운드 수는 자릿수가 정하므로 같은 함수에게 묻는다.
   */
  initial(initialData: unknown): DigitByDigitScene {
    const d = (initialData ?? {}) as { values?: unknown };
    const values = nums(d.values);
    return atStart({
      values,
      width: Math.max(1, computeDigitByDigitRounds([...values]).length),
    });
  },

  reduce(scene: DigitByDigitScene, event: FacetRuntimeEvent): DigitByDigitScene {
    switch (event.type) {
      // 보는 자리가 한 칸 왼쪽으로 옮겨 간다. 이 조각의 시계.
      case 'focus-place': {
        const round = scene.round + 1;
        const info = roundAt(scene, round);
        if (!info) return scene;
        return {
          ...scene,
          round,
          column: info.column,
          bins: null,
          step: { kind: 'focus' },
          caption: { kind: 'focus', round, total: scene.width, place: info.place },
        };
      }

      // 줄 전체가 통으로 내려간다. 견주는 곳은 한 군데도 없다.
      case 'scatter': {
        const info = roundAt(scene, scene.round);
        if (!info) return scene;
        return {
          ...scene,
          bins: info.scatter,
          step: { kind: 'scatter' },
          caption: { kind: 'scatter', place: info.place },
        };
      }

      // 통을 0 부터 9 까지 읽어 다시 줄로 올린다. 그 줄이 장부에 남는다.
      case 'gather': {
        const info = roundAt(scene, scene.round);
        if (!info) return scene;
        return {
          ...scene,
          bins: null,
          ledger: [
            ...scene.ledger,
            { place: info.place, column: info.column, ids: info.order },
          ],
          step: { kind: 'gather', from: scene.bins ?? info.scatter },
          caption: { kind: 'gather' },
        };
      }

      // 마지막 자리까지 마쳤다. 흐려 두었던 자릿수가 전부 돌아온다.
      case 'done':
        return {
          ...scene,
          column: null,
          bins: null,
          done: true,
          step: { kind: 'done' },
          // 라운드 수는 장부가 센다 — 구조에서 세지는 것을 싣지 않는다.
          caption: { kind: 'done', rounds: scene.ledger.length },
        };

      case 'rewind':
        // 걸음이 쌓은 것만 거둔다. 바탕은 선언에서 다시 셈한 그대로다.
        return atStart({ values: scene.values, width: scene.width });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
