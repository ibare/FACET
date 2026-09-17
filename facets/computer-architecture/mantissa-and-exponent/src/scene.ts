/**
 * 가수와 지수 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 아무것도 쥐지 않았다 (`let` 0 건 · 조회 분기 0 건). 전부 stage 의
 * **타입 선언과 DOM 되읽기**에 있었다.
 *
 * - `Group.resultCx` — **DOM 의 거울.** `placeReading` 이 적어 두고 `assemble` 이
 *   `cxSign - signG.resultCx` 로 **운동의 출발값**을 셈했다. `getAttribute` 도
 *   `textContent` 도 안 지나니 ④ 의 grep 을 통과하고, `const groups` 안이라 ② 도
 *   통과한다. 되짚어 `assemble` 만 세우면 그 거울이 옛 화면의 것이라 읽은 값 셋이
 *   엉뚱한 자리에서 출발한다 (프로토콜 함정 28).
 * - `assemble` 의 `signG.result.textContent` · `settle` 의 `valueNode.textContent`
 *   와 `valueNode.getAttribute('x')` — **화면이 제 글자를 도로 읽어** 조립 폭과
 *   밑줄 길이를 정했다. 같은 물음에 답이 둘이고, 되짚어 세운 직후에는 그 글자가
 *   아직 옛 화면의 것이다 (④ · 함정 25).
 * - `Group = { cells, rects, digits, …, tile, ink, bracket, name, count, result,
 *   note, resultCx }` — **DOM 손잡이와 뜻·수치가 한 객체.** `rects`/`digits` 는
 *   `const groups` 안에서 제자리로 갈아 끼워졌고, "어느 토막이 이미 갈렸나" 는
 *   `rect` 의 `fill` 속성에만 있었다.
 * - `g.result.style.fontSize` — **한 속성이 국면을 말한다.** 조립되었나(어깨 글자
 *   크기)와 아직인가(읽는 크기)가 거기서만 갈렸다.
 * - `const animated: SVGElement[]` 와 `track()` — 되감을 때 되돌릴 목록. 무엇을
 *   건드렸는지를 손으로 적어 둔 표다.
 * - `ghost`/`ghostLabel` 의 `opacity`, `cuts` 의 `opacity`, `g.note.textContent` —
 *   숨은 1 이 들어왔나 · 줄이 끊겼나 · 가수를 어디까지 읽었나가 전부 속성에 있었다.
 *
 * 여기서는 그 전부가 `phase` 하나에서 파생된다. 국면이 단조로 나아가므로 어느
 * 토막이 갈렸고 어느 값이 읽혔고 숨은 1 이 붙었는지가 그 하나로 정해진다.
 *
 * ── 화면에 나란히 뜨는 수가 한 함수를 지난다
 *
 * 걸음은 **아무것도 실어 오지 않는다**. 비트열 · 부호 · 읽은 지수 · 치우침 · 실제
 * 지수 · 가수의 이진 표기와 십진값 · 숨은 1 을 붙인 값 · 그 셋이 이루는 수가 전부
 * `readFloat32Parts` 하나에서 나온다 — algorithm 이 내주는 것과 글자 그대로 같은
 * 함수다 (프로토콜 4 절의 B 갈래).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 칸 폭 · 토막이 밀려나는 거리 · 읽은 값이 앉는 자리는 전부
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * 무엇을 말할지는 `phase` 가 이미 가르므로 캡션 필드를 따로 두지 않고, 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 *
 * `step` 필드도 두지 않는다. 걸음마다 국면이 정확히 하나씩 나아가므로 "방금 무슨
 * 걸음을 밟았나" 가 `phase` 와 같은 말이 된다 — 따로 두면 같은 것을 두 자리에서
 * 말하는 꼴이다. 그래서 그리는 쪽은 `prev` 를 아예 들추지 않는다 (S-scene).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  positiveCount,
  readFloat32Parts,
  readSourceValue,
  type Float32Parts,
} from './algorithm.js';

/**
 * 그림이 지나는 국면. **단조로 나아간다** — 뒤로 가는 길은 `rewind` 뿐이다.
 *
 * 배열의 차례가 곧 순서이고 `phaseRank` 가 그것을 읽는다. 어느 토막이 이미
 * 갈렸나 · 어느 값이 이미 섰나를 이 하나가 정하므로, 옛 stage 가 `fill` 속성과
 * `opacity` 로 알던 것이 전부 여기로 올라왔다.
 */
export const MANTISSA_AND_EXPONENT_PHASES = [
  /** 비트가 한 줄로 붙어 있다. */
  'laid',
  /** 세 토막으로 갈려 제 이름을 달았다. */
  'split',
  /** 첫 비트를 부호로 읽었다. */
  'sign',
  /** 지수 비트를 그냥 수로 읽었다. */
  'exponent',
  /** 치우침을 뺐다. 뺀 자취가 토막 밑에 남는다. */
  'debiased',
  /** 가수 비트를 소수 자리로 읽었다. */
  'fraction',
  /** 저장되지 않는 앞자리 1 이 줄 위로 들어와 붙었다. */
  'hidden',
  /** 읽은 값 셋이 한 줄로 모여 식이 되었다. */
  'assembled',
  /** 위의 수와 아래의 수가 같다는 것을 두 밑줄이 긋는다. */
  'settled',
] as const;

export type MantissaAndExponentPhase = (typeof MANTISSA_AND_EXPONENT_PHASES)[number];

/** 국면의 차례. 견줄 때 쓴다 — `rank(phase) >= rank('split')` 이면 이미 갈렸다. */
export function phaseRank(phase: MantissaAndExponentPhase): number {
  return MANTISSA_AND_EXPONENT_PHASES.indexOf(phase);
}

export type MantissaAndExponentScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 쪼개 볼 값. */
  value: number;
  /** 비트 배분 셋. 치우침도 토막의 폭도 여기서 나온다. */
  signLen: number;
  expLen: number;
  manLen: number;

  // ── 자취. 걸음이 나아가고 `rewind` 가 턴다.
  /**
   * 지금 국면. `null` 이면 아직 아무 걸음도 밟지 않았다 — 처음과 되감은 뒤.
   *
   * **이 하나가 화면 전체를 정한다.** 줄이 갈렸나, 어느 토막이 값을 읽었나,
   * 숨은 1 이 들어왔나, 식이 섰나, 밑줄이 그어졌나가 모두 국면의 차례에서
   * 파생된다.
   */
  phase: MantissaAndExponentPhase | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `phase` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 식을
 * 세운 채로 서고 그 위에 algorithm 이 처음부터 다시 밟는 것이 겹친다
 * (S-scene · 프로토콜 함정 14).
 */
type Base = Pick<MantissaAndExponentScene, 'value' | 'signLen' | 'expLen' | 'manLen'>;

/**
 * 되돌린 뒤의 장면 — 캔버스가 비어 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (프로토콜 함정 15).
 */
function atStart(base: Base): MantissaAndExponentScene {
  return {
    value: base.value,
    signLen: base.signLen,
    expLen: base.expLen,
    manLen: base.manLen,
    phase: null,
  };
}

/**
 * `initialData` 를 좁힌다. 받는 자리가 `initial` 이므로 좁히개도 여기 있다.
 *
 * 원시값 넷만 꺼내므로 넘겨받은 객체를 참조로 쥐지 않는다 (S-scene MUST).
 * 좁히는 잣대는 algorithm 이 내준 것을 그대로 쓴다 — 두 자리에서 다르게 좁히면
 * 셈과 화면이 서로 다른 배분을 쓴다.
 */
function readBase(data: unknown): Base {
  const d =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  return {
    value: readSourceValue(d.value, 6.25),
    signLen: positiveCount(d.signBits, 1),
    expLen: positiveCount(d.exponentBits, 8),
    manLen: positiveCount(d.mantissaBits, 23),
  };
}

/**
 * 화면이 쓰는 수를 전부 낸다 — algorithm 과 **같은 함수**다.
 *
 * 걸음이 아무것도 실어 오지 않으므로 화면에 나란히 뜨는 수가 두 출처에서 나올
 * 길이 없다.
 */
export function partsOf(scene: MantissaAndExponentScene): Float32Parts {
  return readFloat32Parts(scene.value, scene.signLen, scene.expLen, scene.manLen);
}

export const mantissaAndExponentScene: ScenePlan<MantissaAndExponentScene> = {
  /**
   * 첫 장면은 무엇을 그릴지만 알고 아직 아무것도 그리지 않았다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다.
   */
  initial(initialData: unknown): MantissaAndExponentScene {
    return atStart(readBase(initialData));
  },

  reduce(
    scene: MantissaAndExponentScene,
    event: FacetRuntimeEvent,
  ): MantissaAndExponentScene {
    /*
     * 발신 아홉이 국면 아홉과 하나씩 맞물린다. **payload 를 읽지 않는다** —
     * 읽을 payload 자체가 없다. 비트열도 치우침도 가수의 값도 `partsOf` 가
     * 바탕에서 낸다 (프로토콜 4 절 "payload 가 친절하면 오히려 위험하다").
     */
    switch (event.type) {
      case 'lay-bits':
        return { ...scene, phase: 'laid' };
      case 'split':
        return { ...scene, phase: 'split' };
      case 'read-sign':
        return { ...scene, phase: 'sign' };
      case 'read-exponent':
        return { ...scene, phase: 'exponent' };
      case 'debias':
        return { ...scene, phase: 'debiased' };
      case 'read-mantissa':
        return { ...scene, phase: 'fraction' };
      case 'hidden-one':
        return { ...scene, phase: 'hidden' };
      case 'assemble':
        return { ...scene, phase: 'assembled' };
      case 'done':
        return { ...scene, phase: 'settled' };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다.
        return atStart({
          value: scene.value,
          signLen: scene.signLen,
          expLen: scene.expLen,
          manLen: scene.manLen,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 열이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
