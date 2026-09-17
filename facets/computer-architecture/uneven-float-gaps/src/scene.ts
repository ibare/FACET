/**
 * 고르지 않은 눈금 — 장면 설계. 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * - `let gapPx` — **이웃 눈금이 지금 서 있는 자리.** `widen` 이 `const from = gapPx`
 *   로 이것을 보간의 출발값으로 삼았다. `getAttribute` 를 쓰지 않을 뿐 화면의 지금
 *   모습을 따로 적어 둔 **거울**이라, 되짚어 세운 직후에는 옛 화면의 자리에서 칸이
 *   출발한다. 지금은 멎은 화면의 이웃이 언제나 칸의 오른쪽 끝이므로 거울이 필요
 *   없고, 물러섬의 출발 그림은 **앞 지점**에서 셈한다.
 * - `let teeth: Array<{ node, x }>` — DOM 손잡이와 좌표가 한 객체. 어느 빗살이
 *   드러났나가 `tooth.x <= nx` 라는 **조회**로만 있었다.
 * - `nextText.textContent` 의 유무 — 이웃의 값을 이미 아는가. 운동이 끝난 뒤에만
 *   채워졌고 어떤 변수도 그것을 말하지 않았다.
 * - `octaveLabel.textContent` 의 유무 — 구간에 드는 개수를 말했나. 지금은 `counted`.
 * - `sweep` 의 `x` — 훑기가 어디까지 갔나. `opacity` 만 0 으로 되돌려 **앞 걸음의
 *   `x` 가 그대로 남았다** (재건 밖 요소). 지금은 훑는 동안에만 짓는다.
 * - `type Scene = { samples }` · `readScene` — 이름이 새 어휘와 부딪힌다. 좁히개가
 *   `initial` 로 옮겨 가며 통째로 없어졌다.
 *
 * ── 벌어짐이 완주 화면에 남아야 "고르지 않다" 가 보인다
 *
 * 이 조각의 주장은 "수가 클수록 이웃이 멀다" 다. 그런데 옛 화면은 걸음마다 카메라가
 * 물러서며 **앞 지점의 빗살을 통째로 지웠다.** 멎은 화면만 보면 어느 걸음이든
 * 이웃이 칸의 오른쪽 끝에 서 있어, 다섯 걸음이 값·표기·빗살 개수만 다른 **같은
 * 그림**이었다. 벌어짐은 운동을 지켜본 사람에게만 보였다.
 *
 * 그래서 **자취 사다리**를 장면에 올렸다. 지나온 지점마다 눈금이 하나씩 남고,
 * 막대의 높이가 **처음 눈금의 몇 배인가**를 말한다. 다 끝난 화면에 1 · 2 · 16 ·
 * 1,024 · 65,536 이 한 줄에 서고 막대가 오른쪽으로 갈수록 자란다 — 옮기기가 화면을
 * 고치는 자리다 (프로토콜 4 절).
 *
 * **척도는 한 번만 정한다.** 사다리의 가로 한 칸은 "눈금이 배로 벌어지는 한 번"
 * 이고 그 전체 길이는 **바탕의 마지막 지점**이 정한다 — 지나온 지점 수로 정하면
 * 걸음마다 축이 다시 잡혀 앞 눈금의 자리가 바뀐다 (프로토콜 4 절의 `coin-flip-height`).
 *
 * ── 수는 한 출처에서만 나온다 — 걸음이 실어 오는 것이 없다
 *
 * 화면에는 사이 거리 · 배수 · 빗살 개수 · 구간에 드는 값의 개수가 그림과 **나란히**
 * 뜬다. 그 수와 그림이 다른 출처에서 오면 그림이 제 안에서 거짓이 된다. 그래서
 * **다섯 발신 모두 payload 가 비어 있다.**
 *
 * - **바탕 + 순수 함수로 나오는 것은 `algorithm.ts` 의 함수를 부른다** (프로토콜
 *   4 절의 B 갈래). 지점 하나가 정해지면 사이 거리도 배수도 구간 개수도 결정되므로
 *   `gapAt` · `gapExponentAt` · `valuesPerSpan` 을 부른다. 장면이 `algorithm.ts` 를
 *   import 하는 방향은 원칙 1 이 허용한다 — 장면이 projector 자리를 잇는다.
 *
 *   **경계를 넘지 않는다.** `gapAt` 은 이 조각이 *피하려는 셈*이 아니라 **재는
 *   자**다 — 비트열을 1 올려 빼는 한 줄이고, 떼어 내도 "수가 클수록 이웃이 멀다"
 *   는 주장은 그대로 남는다. `bottom-up-table` 의 점화식과 갈리는 자리다.
 *   게다가 사다리의 축은 **아직 가 보지 않은 마지막 지점**의 사이 거리를 알아야
 *   정해진다 — 걸음에 실어서는 얻을 수 없는 값이라 B 갈래 말고는 길이 없다.
 * - **몇 번째 지점인가는 발신이 온 차례가 말한다.** 지점은 올 때마다 하나씩 쌓이
 *   므로 `visited` 가 곧 그 자리이고, 그 자리의 값은 바탕의 `samples` 가 쥔다.
 * - **구간에 드는 값의 개수도 잰다.** 옛 발신은 `2 ** mantissaBits` 를 실어 보냈다
 *   — 선언에 적힌 23 에서 나온 수라 **그림과 다른 출처**였다. 지금은 `x` 에서 `2x`
 *   까지의 폭을 그 자리의 사이 거리로 나눈다. 화면의 빗살과 같은 자를 쓴다
 *   (프로토콜 4 절 "조각의 결론이 상수로 박혀 있을 수 있다").
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 사다리의 자리도 칸의 폭도 캔버스에서 역산하는 값이라 그리는
 * 쪽의 몫이다 (S-piece). 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { gapAt, gapExponentAt, nextFloat32, sampleLadder, valuesPerSpan } from './algorithm.js';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 물러섬이 출발하는 자리는 **앞 지점**이 말하고 그 앞 지점은
 * `samples` 에 그대로 있다. `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type UnevenFloatGapsStep =
  /** 첫 칸이 열린다 — 이웃이 기준 눈금에서 칸 끝까지 나아간다. */
  | { kind: 'anchor' }
  /** 카메라가 물러서고 새 이웃이 다시 달아난다. */
  | { kind: 'widen' }
  /** 이런 칸이 몇 개 모여 한 구간이 되는지 칸 위를 훑는다. */
  | { kind: 'count' }
  /** 지나온 사다리를 왼쪽에서 오른쪽으로 되짚는다. */
  | { kind: 'close' };

/** 캡션이 말할 것과 그 인자. 문자는 그리는 쪽이 만든다 (C10). */
export type UnevenFloatGapsCaption =
  /** 첫 지점 — 이 사이 거리를 한 눈금으로 삼는다. */
  | { kind: 'anchor' }
  /** 다음 지점 — 이웃까지가 앞 눈금 몇 개인가. */
  | { kind: 'widen'; value: number; k: number }
  /** 어느 구간이든 담는 값의 개수는 같다. */
  | { kind: 'count'; count: number }
  /** 닫는 말 — 눈금은 고르지 않다. */
  | { kind: 'close' };

export type UnevenFloatGapsScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /**
   * 볼 지점. 사다리의 축도 걸음 수도 여기서 나온다.
   *
   * 몇 번째 걸음이 어느 지점인가를 이 배열이 정하고, algorithm 도 같은 좁히개를
   * 지난 목록을 걸어가므로 걸음 수와 화면의 지점이 갈릴 수 없다.
   */
  samples: readonly number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 지금까지 선 지점 수. `samples` 의 앞에서부터 그만큼이 사다리에 남아 있다.
   *
   * **남는 자취**다 — 앞 지점의 눈금이 뒤 지점의 눈금과 한 화면에서 견줘지는 것이
   * 이 조각의 주장 자체이므로 정적 그리기에도 들어간다 (S-scene).
   */
  visited: number;
  /** 한 구간에 드는 값의 개수를 말했나. */
  counted: boolean;
  /** 닫는 말을 했나. */
  closed: boolean;

  step: UnevenFloatGapsStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `visited` 아래 셋은 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 다 오른
 * 사다리를 단 채로 서고 그 위에 algorithm 이 처음부터 다시 오르는 지점이 겹친다
 * (S-scene).
 */
type Base = Pick<UnevenFloatGapsScene, 'samples'>;

/**
 * 아무 지점도 밟지 않은 처음 화면. 빈 자와 빈 사다리만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): UnevenFloatGapsScene {
  return { samples: base.samples, visited: 0, counted: false, closed: false, step: null };
}

// ── 장면에서 셈해지는 수들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 캡션도 사다리도 빗살도 같은 함수를 부르므로
// 갈릴 자리가 없다.

/** `index` 번째 지점. 범위 밖이면 null. */
export function sampleAt(scene: UnevenFloatGapsScene, index: number): number | null {
  return scene.samples[index] ?? null;
}

/** 지금 짚고 있는 지점의 자리. 아직 아무 지점도 안 섰으면 -1. */
export function currentIndex(scene: UnevenFloatGapsScene): number {
  return scene.visited - 1;
}

/** `index` 번째 지점의 사이 거리. **잰 값**이다 — 지수에서 셈하지 않는다. */
export function gapOf(scene: UnevenFloatGapsScene, index: number): number | null {
  const value = sampleAt(scene, index);
  return value === null ? null : gapAt(value);
}

/** `index` 번째 지점의 이웃. 화면에 그대로 뜨는 수라 재서 얻는다. */
export function neighbourOf(scene: UnevenFloatGapsScene, index: number): number | null {
  const value = sampleAt(scene, index);
  return value === null ? null : nextFloat32(value);
}

/** 사이 거리를 2 의 거듭제곱으로 적을 때의 지수. 표기가 이것을 쓴다. */
export function notchExponentOf(scene: UnevenFloatGapsScene, index: number): number | null {
  const value = sampleAt(scene, index);
  return value === null ? null : gapExponentAt(value);
}

/** 처음 눈금의 몇 배인가. 잰 두 거리의 비라 지어낸 수가 끼지 않는다. */
export function multipleOf(scene: UnevenFloatGapsScene, index: number): number | null {
  const gap = gapOf(scene, index);
  const first = gapOf(scene, 0);
  return gap === null || first === null || first === 0 ? null : gap / first;
}

/** 앞 지점의 눈금 몇 개가 이 칸에 들어가는가. 빗살 개수이자 캡션의 `k` 다. */
export function ratioOf(scene: UnevenFloatGapsScene, index: number): number | null {
  const gap = gapOf(scene, index);
  const before = gapOf(scene, index - 1);
  return gap === null || before === null || before === 0 ? null : gap / before;
}

/**
 * 처음 눈금에서 이 지점까지 **배로 벌어진 횟수.** 사다리의 가로 자리이자 막대 높이다.
 *
 * 배수에서 파생시킨다 — 자리와 배수를 각자 셈하면 사다리와 그 위에 적힌 수가 갈린다.
 */
export function doublingsOf(scene: UnevenFloatGapsScene, index: number): number | null {
  const multiple = multipleOf(scene, index);
  return multiple === null || multiple <= 0 ? null : Math.round(Math.log2(multiple));
}

/**
 * 사다리 전체가 담는 배로 벌어짐의 횟수 — **축척의 정본.**
 *
 * 지나온 지점이 아니라 **바탕의 마지막 지점**이 정한다. 지나온 것으로 정하면 지점이
 * 늘 때마다 축이 다시 잡혀 앞 눈금의 자리가 바뀐다 (프로토콜 4 절).
 * 지점이 하나뿐이면 나눌 것이 없으므로 1 로 둔다.
 */
export function totalDoublings(scene: UnevenFloatGapsScene): number {
  const last = doublingsOf(scene, scene.samples.length - 1);
  return last === null || last <= 0 ? 1 : last;
}

/** 개수를 말하는 구간 — 마지막 지점에서 그 두 배까지. */
export function spanOf(scene: UnevenFloatGapsScene): { from: number; to: number } | null {
  const last = sampleAt(scene, scene.samples.length - 1);
  return last === null ? null : { from: last, to: last * 2 };
}

/**
 * 그 구간에 드는 값의 개수.
 *
 * 선언의 가수 비트 수에서 셈하지 않는다 — 구간의 폭을 **그 자리의 사이 거리**로
 * 나눈다. 화면의 빗살과 같은 자를 쓰는 자리다 (프로토콜 4 절).
 */
export function spanCountOf(scene: UnevenFloatGapsScene): number | null {
  const last = sampleAt(scene, scene.samples.length - 1);
  return last === null ? null : valuesPerSpan(last);
}

/**
 * 지금 화면이 할 말. 아직 아무 말도 없으면 null.
 *
 * 장면에 캡션 필드를 따로 두지 않는다 — 네 필드가 이미 온전히 정하므로 필드를 두면
 * 같은 물음에 답이 둘이 되고, 둘이 어긋나는 장면을 `reduce` 가 만들 수 있게 된다.
 */
export function captionFor(scene: UnevenFloatGapsScene): UnevenFloatGapsCaption | null {
  if (scene.closed) return { kind: 'close' };
  if (scene.counted) {
    const count = spanCountOf(scene);
    return count === null ? null : { kind: 'count', count };
  }
  const index = currentIndex(scene);
  if (index < 0) return null;
  if (index === 0) return { kind: 'anchor' };
  const value = sampleAt(scene, index);
  const k = ratioOf(scene, index);
  return value === null || k === null ? null : { kind: 'widen', value, k };
}

export const unevenFloatGapsScene: ScenePlan<UnevenFloatGapsScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene). `sampleLadder` 가 새 배열을 낸다. 좁히는 규칙이 두 벌이 되지 않게
   * algorithm 과 같은 함수를 지난다 (S-piece).
   */
  initial(initialData: unknown): UnevenFloatGapsScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({ samples: sampleLadder(d.samples) });
  },

  reduce(scene: UnevenFloatGapsScene, event: FacetRuntimeEvent): UnevenFloatGapsScene {
    switch (event.type) {
      /*
       * 첫 지점에 선다. 어느 지점인지 실어 오지 않는다 — 첫 지점은 바탕의 첫 칸이다.
       */
      case 'anchor':
        if (scene.visited !== 0 || scene.samples.length === 0) return scene;
        return { ...scene, visited: 1, step: { kind: 'anchor' } };

      /*
       * 다음 지점으로 간다.
       *
       * 사이 거리도 배수도 빗살 개수도 실어 오지 않는다 — 지점이 하나씩 쌓이므로
       * `visited` 가 곧 그 자리이고, 그 자리의 모든 수는 바탕의 `samples` 에서
       * 잰다. algorithm 도 같은 목록을 걸어가므로 어긋날 수 없다.
       */
      case 'widen':
        // 선언된 지점보다 많이 오면 갈 자리가 없다. 조용히 흘린다 (C2).
        if (scene.visited === 0 || scene.visited >= scene.samples.length) return scene;
        return { ...scene, visited: scene.visited + 1, step: { kind: 'widen' } };

      case 'count':
        if (scene.visited === 0) return scene;
        return { ...scene, counted: true, step: { kind: 'count' } };

      case 'done':
        if (scene.visited === 0) return scene;
        return { ...scene, closed: true, step: { kind: 'close' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ samples: scene.samples });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
