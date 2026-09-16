/**
 * GrowthOutpaces 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * - `let widths: [number, number, number]` — **막대가 지금 그려져 있는 폭.**
 *   `showStep` 이 이것을 보간의 출발값으로 삼았다. `getAttribute` 를 쓰지 않을
 *   뿐 화면의 지금 자리를 따로 적어 둔 **거울**이라, 되짚어 세운 직후에는 옛
 *   화면의 폭에서 몫이 출발했다. 지금은 **앞 단이 사다리 어디였나**에서 셈한다.
 * - `let current: Step | null` — 마지막으로 그린 단. `collapse` 가 무엇을 접을지
 *   여기서 알았다. 지금은 `rungs` 의 마지막이 그것이다.
 * - `trailLayer` 의 **자식 유무** — 발자국을 몇 개 떨궜나. 어떤 변수도 그것을
 *   말하지 않았고 `clearAll` 이 지우는 것이 전부였다. 지금은 `rungs.length` 다.
 * - `Step = { n, terms, sum, topIndex, pctText, caption }` — **뜻과 수치와 문안이
 *   한 객체**였다. 화면에 뜨는 수가 전부 걸음의 payload 에서 왔으므로 그림과
 *   수의 출처가 둘이었다.
 *
 * ── 자취가 남아야 *결국*이 보인다
 *
 * 이 조각의 주장은 "최고차항이 **결국** 나머지를 앞지른다" 다. 앞지르는 것을
 * 보이려면 **앞서 뒤처져 있던 것**이 화면에 남아 있어야 하는데, 명령형 stage 는
 * 단마다 막대를 통째로 갈아 끼웠다. 남는 것은 최고차항의 경계를 떨군 발자국
 * 하나뿐이었고, 그 발자국은 **여섯이 다 같은 색**이라 *어느 단까지 상수가 가장
 * 컸는지* 도, *어디가 갈림목인지* 도 다 끝난 화면에 남지 않았다.
 *
 * 그래서 발자국을 장면의 자취로 올리고 두 축을 갈랐다 (프로토콜 4 절).
 *
 * - **채움(눈금의 색) = 값의 형편** — 그 단에서 가장 컸던 항의 색.
 * - **표식(테를 두른 고리) = 갈림목** — 세 항이 정확히 같아진 단.
 *
 * 다 끝난 화면에 왼쪽 눈금 둘이 상수의 색으로, 그 뒤가 최고차항의 색으로 서고
 * 가운데에 고리가 하나 남는다 — *뒤집혔다* 가 한 화면에 보인다.
 *
 * ── 수는 한 출처에서만 나온다 — 걸음이 실어 오는 것이 없다
 *
 * 화면에는 항의 값 셋 · 합 · 몫(%)이 막대와 **나란히** 뜬다. 그 수와 막대의 폭이
 * 다른 출처에서 오면 그림이 제 안에서 거짓이 된다. 그래서 **다섯 발신 모두
 * payload 가 비어 있다.**
 *
 * - **바탕 + 순수 함수로 나오는 것은 `algorithm.ts` 의 함수를 부른다.** 계수 셋과
 *   n 하나가 정해지면 그 단의 모든 수가 결정되므로 `computeRung` 을 부르고,
 *   사다리를 좁히는 잣대도 `ladderOf` 하나다 (프로토콜 4 절의 B 갈래). 장면이
 *   `algorithm.ts` 를 import 하는 방향은 원칙 1 이 허용한다 — 장면이 projector
 *   자리를 잇는다.
 *
 *   **내주어도 조각이 피하려는 셈을 장면이 대신 하게 되지 않는다.** 이 조각은
 *   피하는 셈이 없다 — `f(n)` 을 실제로 셈해 보이는 것이 그림 자체이고,
 *   `computeRung` 을 떼어 내도 "사다리를 올라가며 몫이 한쪽으로 쏠린다" 는
 *   주장은 남는다. 그래서 `bottom-up-table` 의 점화식과 달리 경계를 넘지 않는다.
 * - **몇 번째 단인가는 발신이 온 차례가 말한다.** 단은 올 때마다 하나씩 쌓이므로
 *   `rungs.length` 가 곧 사다리의 자리이고, 그 자리의 n 은 바탕의 `ladder` 가 쥔다.
 * - **걸음이 내리는 판정만 발신이 나른다.** 이 단이 갈림목인가 · 첫 단인가는
 *   수에서 파생시키지 않고 발신의 **type** 이 말한다 (payload 가 아니라 어휘다).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 몫(0~1)이라는 **구조**만 담고 막대의 가로도 라벨이 밀리는
 * 자리도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 축척을 둘로
 * 두지도 않는다 — 막대는 언제나 몫 0~1 을 통째로 채우므로 눈금자의 양 끝이
 * 곧 0% 와 100% 이고, 그 잣대는 `sharesOf` 하나를 지난다.
 *
 * 문안도 담지 않는다. `captionFor` 가 **무엇을 말할지와 그 인자**만 내고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { computeRung, ladderOf, type GrowthCoeffs, type GrowthRung } from './algorithm.js';

/**
 * 밟은 단이 무슨 단이었나. **걸음이 내리는 판정**이라 발신의 type 에서 온다.
 *
 * `tie` 를 수에서 파생시키지 않는 까닭은 어휘를 살려 두기 위해서다 — 발신이
 * 갈림목을 가리키는데 장면이 그것을 무시하면 그 어휘가 장식이 된다.
 */
export type GrowthRungKind = 'begin' | 'rung' | 'tie';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 몫이 출발하는 자리는 **앞 단**이 말하고 그 앞 단은
 * `rungs` 에 그대로 있다. `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type GrowthStep =
  /** 사다리를 한 단 오른다. 경계가 미끄러지고 발자국이 자 위로 떨어진다. */
  | { kind: 'climb' }
  /** 작은 항 둘을 지우고 최고차항만 남긴다. */
  | { kind: 'settle' };

/** 캡션이 말할 것과 그 인자. 문자는 그리는 쪽이 만든다 (C10). */
export type GrowthCaption =
  /** 첫 단 — 가장 큰 항이 막대의 얼마를 쥐고 있나. */
  | { kind: 'begin'; n: number; pct: number }
  /** 다음 단 — 최고차항이 막대의 얼마를 쥐었나. */
  | { kind: 'rung'; n: number; pct: number }
  /** 갈림목 — 세 항이 모두 이 값이다. */
  | { kind: 'tie'; n: number; each: number }
  /** 마무리 — 최고차항만 남는다. */
  | { kind: 'settle' };

export type GrowthOutpacesScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 최고차항(n²) 의 계수. */
  quadratic: number;
  /** 일차항(n) 의 계수. */
  linear: number;
  /** 상수항. */
  constant: number;
  /**
   * 걸어갈 n 사다리. `ladderOf` 를 지난 값이라 그리는 쪽이 다시 자르지 않는다.
   *
   * 몇 번째 걸음이 어느 n 인가를 이 배열이 정하고, algorithm 도 같은 함수로
   * 좁힌 목록을 걸어가므로 걸음 수와 화면의 n 이 갈릴 수 없다.
   */
  ladder: readonly number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 밟은 단들, 낮은 것부터. 자리 번호가 곧 `ladder` 의 자리이고 마지막이 지금
   * 막대가 선 단이다.
   *
   * **남는 자취**다 — 어느 단까지 상수가 가장 컸고 어디가 갈림목이었나가 자 위에
   * 눈금으로 쌓이는 것이 이 조각의 주장 자체이므로 정적 그리기에도 들어간다
   * (S-scene).
   */
  rungs: readonly GrowthRungKind[];
  /** 작은 항 둘을 지우고 최고차항만 남겼나. */
  settled: boolean;

  step: GrowthStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `rungs` · `settled` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 다 오른 사다리와 눈금 여섯을 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 오르는 단이 겹친다 (S-scene).
 */
type GrowthBase = Pick<GrowthOutpacesScene, 'quadratic' | 'linear' | 'constant' | 'ladder'>;

/**
 * 아무 단도 밟지 않은 처음 화면. 빈 막대와 빈 자만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: GrowthBase): GrowthOutpacesScene {
  return {
    quadratic: base.quadratic,
    linear: base.linear,
    constant: base.constant,
    ladder: base.ladder,
    rungs: [],
    settled: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// ── 장면에서 셈해지는 수들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 캡션도 막대도 눈금도 같은 함수를 부르므로
// 갈릴 자리가 없다.

/** 셈에 드는 계수 셋. `computeRung` 에 넘기는 것은 이것뿐이다. */
export function coeffsOf(scene: GrowthOutpacesScene): GrowthCoeffs {
  return { quadratic: scene.quadratic, linear: scene.linear, constant: scene.constant };
}

/**
 * 사다리 `index` 번째 단의 셈. 범위 밖이면 null.
 *
 * 걸음이 실어 오지 않는다 — 계수 셋과 n 이 정해지면 결정되는 셈이라
 * `algorithm.ts` 가 내준 함수를 부른다 (프로토콜 4 절의 B 갈래).
 */
export function rungAt(scene: GrowthOutpacesScene, index: number): GrowthRung | null {
  const n = scene.ladder[index];
  if (n === undefined) return null;
  return computeRung(coeffsOf(scene), n);
}

/** 지금 막대가 선 단. 아직 아무 단도 밟지 않았으면 null. */
export function currentRung(scene: GrowthOutpacesScene): GrowthRung | null {
  return rungAt(scene, scene.rungs.length - 1);
}

/**
 * 지금 단 바로 앞의 단. 몫이 출발하는 자리다.
 *
 * `prev` 장면에서 꺼내지 않는다 — 출발 그림은 이 장면이 스스로 말한다 (S-scene).
 */
export function previousRung(scene: GrowthOutpacesScene): GrowthRung | null {
  return rungAt(scene, scene.rungs.length - 2);
}

/**
 * 세 항이 막대에서 차지하는 몫 — **축척의 정본.**
 *
 * 0 번은 `computeRung` 이 낸 `share` 를 그대로 쓴다. 같은 수를 두 자리에서
 * 셈하지 않으려는 것이다.
 */
export function sharesOf(rung: GrowthRung): [number, number, number] {
  const total = rung.sum > 0 ? rung.sum : 1;
  return [rung.share, rung.lin / total, rung.cons / total];
}

/** 가장 큰 항이 쥔 몫. 첫 단의 캡션이 말하는 것은 n² 가 아니라 **이것**이다. */
export function topShareOf(rung: GrowthRung): number {
  return sharesOf(rung)[rung.topIndex] ?? 0;
}

/** 몫을 소수 한 자리까지. 캡션과 막대가 같은 수를 말하도록 한 자리에서 만든다. */
export function pctOf(share: number): string {
  return (share * 100).toFixed(1);
}

/**
 * 지금 화면이 할 말. 아직 아무 말도 없으면 null.
 *
 * `step` 과 1 대 1 이 아니므로 (사다리 세 갈래가 한 `climb` 이다) 마지막 단의
 * 갈래에서 낸다. 장면에 캡션 필드를 따로 두면 같은 것을 두 자리에 적는 꼴이다.
 */
export function captionFor(scene: GrowthOutpacesScene): GrowthCaption | null {
  if (scene.settled) return { kind: 'settle' };
  const rung = currentRung(scene);
  const kind = scene.rungs[scene.rungs.length - 1];
  if (rung === null || kind === undefined) return null;
  switch (kind) {
    case 'begin':
      // "가장 큰 항" 이라고 말하므로 n² 의 몫이 아니라 가장 큰 항의 몫이다.
      return { kind: 'begin', n: rung.n, pct: topShareOf(rung) };
    case 'tie':
      // 세 항이 정확히 같은 단이라 어느 항을 읽어도 같은 값이다.
      return { kind: 'tie', n: rung.n, each: rung.quad };
    case 'rung':
      return { kind: 'rung', n: rung.n, pct: rung.share };
  }
}

export const growthOutpacesScene: ScenePlan<GrowthOutpacesScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만
   * 넘겨받은 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게
   * 된다 (S-scene). `ladderOf` 가 새 배열을 낸다.
   */
  initial(initialData: unknown): GrowthOutpacesScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({
      quadratic: num(d.quadratic, 1),
      linear: num(d.linear, 0),
      constant: num(d.constant, 0),
      // 자르는 잣대는 algorithm 이 내준 하나다 — 두 군데서 자르면 갈린다.
      ladder: ladderOf(d.ladder),
    });
  },

  reduce(scene: GrowthOutpacesScene, event: FacetRuntimeEvent): GrowthOutpacesScene {
    switch (event.type) {
      /*
       * 사다리를 한 단 오른다.
       *
       * 몇 번째 단인가는 **이 발신이 온 차례**가 말하고 (단이 하나씩 쌓이므로
       * `rungs.length` 가 곧 그 자리다), 그 자리의 n 은 바탕이 쥐고 있다.
       * algorithm 도 같은 목록을 걸어가므로 어긋날 수 없다.
       */
      case 'begin':
      case 'rung':
      case 'tie': {
        // 선언된 사다리보다 많이 오면 오를 단이 없다. 조용히 흘린다 (C2).
        if (scene.ladder[scene.rungs.length] === undefined) return scene;
        const kind: GrowthRungKind = event.type;
        return { ...scene, rungs: [...scene.rungs, kind], step: { kind: 'climb' } };
      }

      /*
       * 작은 항 둘을 지운다. 막대는 그대로 두고 최고차항이 벽까지 밀고 간다 —
       * 자 위의 눈금은 지우지 않는다. 지우면 *결국*이 함께 사라진다.
       */
      case 'settle':
        if (scene.rungs.length === 0) return scene;
        return { ...scene, settled: true, step: { kind: 'settle' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          quadratic: scene.quadratic,
          linear: scene.linear,
          constant: scene.constant,
          ladder: scene.ladder,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
