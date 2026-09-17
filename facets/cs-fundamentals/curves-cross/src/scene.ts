/**
 * CurvesCross 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에는 **네 자리**에 흩어져 있었다.
 *
 * - `let tilt` — 저울대가 지금 몇 도 기울어 있나. 다음 걸음의 회전 출발값이자
 *   표가 날아오르는 접시의 자리를 정하는 값이라, **화면의 지금 모습을 따로 적어
 *   둔 거울**이었다. 되짚어 세운 직후에는 그 거울이 옛 화면의 것이라 표가 엉뚱한
 *   접시에서 출발한다.
 * - `let slotW` / `let slotCount` — 사다리가 몇 칸인가. `setBoard` 가 지나가야만
 *   정해져서, 되짚어 그 뒤 걸음으로 곧장 뛰면 칸 폭이 0 이었다. `slotCount` 는
 *   대입만 되고 어디서도 읽히지 않는 **죽은 변수**였다.
 * - `chipLayer` · `regionLayer` · `noteLayer` 의 **자식 유무** — 몇 칸을 견줬나,
 *   경계를 그었나, 실무 규칙을 적었나. 코드 어디에도 변수가 없고 `textContent = ''`
 *   로 비우고 채우는 식이라 걸음 밖에서는 알 길이 없었다.
 * - `nBadgeText.textContent` · `panL.value` 의 글자 — 지금 저울에 오른 n 과 두 비용.
 *
 * 여기서는 그 넷이 `board` · `weighed` 두 수로 줄었다. 사다리는 바탕이 쥐고,
 * 기울기는 `weighed` 가 가리키는 줄에서 그리는 쪽이 셈하며, 앉은 표의 수도
 * `weighed` 다.
 *
 * ── 수는 한 출처에서만 나온다 — 걸음이 실어 오는 것이 없다
 *
 * 이 조각은 **두 비용을 화면에 나란히 띄우고 그 둘을 견준 판정까지 함께 그린다.**
 * 접시의 수와 표의 색이 갈리면 그림이 제 안에서 거짓이 된다. 그래서 **다섯 발신
 * 모두 payload 가 비어 있다.**
 *
 * 프로토콜 4 절의 잣대로 갈랐다.
 *
 * - **바탕 + 순수 함수로 나오는 것은 `algorithm.ts` 의 함수를 부른다.** 두 비용도
 *   싼 쪽 판정도 교차 칸도 전부 `computeCurvesCrossRows` · `findCrossingIndex` 가
 *   낸다. 선언이 주는 것은 두 비용 식의 **모양**과 n 사다리뿐이고 거기서 표 전체가
 *   결정되므로 걸음이 판정할 것이 하나도 없다. 장면이 `algorithm.ts` 를 import
 *   하는 방향은 원칙 1 이 허용한다 — 장면이 projector 자리를 잇는다.
 * - **몇 번째 칸인가는 발신이 온 차례가 말한다.** `weigh` 가 올 때마다 하나씩
 *   쌓이므로 `weighed` 가 곧 그 칸의 번호다. 그래서 `CostRow` 에서 `index` 를
 *   걷어냈다 — 배열의 자리가 곧 번호이고, 자리를 두 곳에 적어 두면 갈린다.
 *
 * ── 국면을 따로 담지 않는다
 *
 * 무엇을 말할 걸음인가는 `board` · `weighed` · `threshold` · `rule` 넷이 이미
 * 온전히 정한다 (`phaseOf`). 따로 `step` 필드를 두면 같은 물음에 답이 둘이 되고,
 * 둘이 어긋나는 장면을 `reduce` 가 만들 수 있게 된다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 칸 폭도 저울의 각도도 캔버스에서 역산하는 값이라 그리는
 * 쪽의 몫이다 (S-piece). 문안도 담지 않는다. 무엇을 말할지만 담고 수와 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import {
  computeCurvesCrossRows,
  findCrossingIndex,
  type CostRow,
  type CurvesCrossData,
} from './algorithm.js';

export type CurvesCrossScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /**
   * 사다리 한 칸마다 두 비용과 싼 쪽. 차례가 곧 아래 가로줄의 칸 번호다.
   *
   * 걸음이 실어 오지 않는다 — 선언의 모양에서 결정되는 표라 `algorithm.ts` 가
   * 내준 `computeCurvesCrossRows` 하나를 지난다 (프로토콜 4 절 B 갈래).
   */
  rows: readonly CostRow[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 저울과 가로줄이 섰나. 서기 전에는 캔버스가 비어 있다. */
  board: boolean;
  /** 지금까지 저울에 올린 칸 수. `rows` 의 앞에서부터 그만큼이 아래에 앉아 있다. */
  weighed: number;
  /** 앞뒤가 뒤집히는 자리에 선을 긋고 좌우를 갈랐나. */
  threshold: boolean;
  /** 왼쪽 구간에 괄호를 치고 실무의 선택을 적었나. */
  rule: boolean;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `board` 이후 넷은 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 앞
 * 주행의 표와 경계선을 단 채로 서고 그 위에 새 주행이 겹친다 (S-scene).
 */
type Base = Pick<CurvesCrossScene, 'rows'>;

/**
 * 아무것도 서지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): CurvesCrossScene {
  return { rows: base.rows, board: false, weighed: 0, threshold: false, rule: false };
}

/** 이 장면이 하는 말. 네 필드가 온전히 정하므로 따로 담지 않는다. */
export type CurvesCrossPhase = 'blank' | 'board' | 'weigh' | 'threshold' | 'rule';

export function phaseOf(scene: CurvesCrossScene): CurvesCrossPhase {
  if (!scene.board) return 'blank';
  if (scene.rule) return 'rule';
  if (scene.threshold) return 'threshold';
  return scene.weighed > 0 ? 'weigh' : 'board';
}

/** 지금 저울에 올라 있는 줄. 아직 아무것도 안 올랐으면 null. */
export function currentRow(scene: CurvesCrossScene): CostRow | null {
  return scene.weighed > 0 ? (scene.rows[scene.weighed - 1] ?? null) : null;
}

/** 이미 견줘 아래 가로줄에 앉은 줄들. 표와 자취가 같은 목록에서 나온다. */
export function settledRows(scene: CurvesCrossScene): readonly CostRow[] {
  return scene.rows.slice(0, scene.weighed);
}

/**
 * 앞뒤가 뒤집히는 칸의 번호.
 *
 * 경계선도 구간 색도 실무 규칙의 괄호도 이 한 수를 쓴다 — 조각의 결론이 표의
 * 색과 같은 자료에서 나오게 하는 자리다 (프로토콜 4 절).
 */
export function crossingIndexOf(scene: CurvesCrossScene): number | null {
  return scene.rows.length > 0 ? findCrossingIndex(scene.rows) : null;
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nums(v: unknown): number[] {
  return Array.isArray(v)
    ? (v as unknown[]).map((n) => num(n)).filter((n): n is number => n !== null && n > 0)
    : [];
}

/**
 * 선언을 비용 식의 모양으로 좁힌다.
 *
 * 넘겨받은 것을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
 * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게
 * 된다 (S-scene). `nums` 가 새 배열을 내고 두 모양도 새 객체로 짓는다.
 */
function shapeOf(initialData: unknown): CurvesCrossData {
  const d = (initialData ?? {}) as Record<string, unknown>;
  const ins = (d.insertion ?? {}) as Record<string, unknown>;
  const mrg = (d.merge ?? {}) as Record<string, unknown>;
  const sizes = nums(d.sizes);
  const divisor = num(ins.divisor) ?? 1;
  const logBase = num(mrg.logBase) ?? 2;
  return {
    type: 'curves-cross',
    // 사다리가 하나도 안 왔으면 칸 하나로 둔다 — 칸 폭 역산이 0 으로 나눌 수 없게.
    sizes: sizes.length > 0 ? sizes : [1],
    insertion: { exponent: num(ins.exponent) ?? 2, divisor: divisor > 0 ? divisor : 1 },
    // 밑이 1 이하면 로그가 무너진다. 선언이 이상해도 그림은 서야 한다.
    merge: { logBase: logBase > 1 ? logBase : 2 },
    stepMs: num(d.stepMs) ?? 800,
  };
}

export const curvesCrossScene: ScenePlan<CurvesCrossScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다.
   */
  initial(initialData: unknown): CurvesCrossScene {
    return atStart({ rows: computeCurvesCrossRows(shapeOf(initialData)) });
  },

  reduce(scene: CurvesCrossScene, event: FacetRuntimeEvent): CurvesCrossScene {
    switch (event.type) {
      // 저울과 아래 가로줄이 선다. 사다리는 이미 바탕이 쥐고 있다.
      case 'board-set':
        return { ...scene, board: true, weighed: 0, threshold: false, rule: false };

      /*
       * 다음 칸을 저울에 올린다.
       *
       * 어느 칸인지도 그 칸의 두 비용도 실어 오지 않는다 — 칸이 하나씩 쌓이므로
       * `weighed` 가 곧 그 번호이고, 그 번호의 두 비용은 바탕의 `rows` 가 쥔다.
       * algorithm 도 같은 사다리를 걸어가므로 어긋날 수 없다.
       */
      case 'weigh': {
        // 사다리보다 많이 오면 올릴 칸이 없다. 조용히 흘린다 (C2).
        if (!scene.board || scene.weighed >= scene.rows.length) return scene;
        return { ...scene, weighed: scene.weighed + 1 };
      }

      case 'mark-threshold':
        return scene.board ? { ...scene, threshold: true } : scene;

      case 'library-rule':
        return scene.board && scene.threshold ? { ...scene, rule: true } : scene;

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ rows: scene.rows });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 흘린다 (C2).
        return scene;
    }
  },
};
