/**
 * HashAvalanche 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * 이 조각의 걸음은 앞으로만 흐르고 갈래가 없다. 그래서 장면의 변하는 부분이
 * **`phase` 하나**로 잡힌다 — 무엇을 보였는지 낱낱이 담을 까닭이 없다.
 *
 * 문안은 담지 않는다. 장면은 자료이고 문안은 그리는 쪽의 몫이다 — 같은 장면을
 * 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의 `params.t` 로만
 * 온다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 어디까지 보였나. 걸음이 하나씩 올린다. */
export type AvalanchePhase = 0 | 1 | 2 | 3 | 4;

export type AvalancheScene = {
  /** 화면에 인쇄할 해시 함수 이름. */
  algorithmLabel: string;
  inputA: string;
  inputB: string;
  inputBitsA: boolean[];
  inputBitsB: boolean[];
  /** 입력에서 두 항이 다른 자리. */
  inputFlipped: boolean[];
  outputBitsA: boolean[];
  outputBitsB: boolean[];
  /** 출력에서 두 항이 다른 자리. */
  outputFlipped: boolean[];
  inputTotalBits: number;
  inputFlippedBits: number;
  outputTotalBits: number;
  outputFlippedBits: number;
  /**
   * 0 아직 아무것도 · 1 두 입력 · 2 입력의 차이 · 3 두 출력 · 4 출력의 차이.
   *
   * 이 조각은 걸음이 앞으로만 흐르므로 수 하나면 화면이 정해진다.
   */
  phase: AvalanchePhase;
};

const EMPTY: AvalancheScene = {
  algorithmLabel: '',
  inputA: '',
  inputB: '',
  inputBitsA: [],
  inputBitsB: [],
  inputFlipped: [],
  outputBitsA: [],
  outputBitsB: [],
  outputFlipped: [],
  inputTotalBits: 0,
  inputFlippedBits: 0,
  outputTotalBits: 0,
  outputFlippedBits: 0,
  phase: 0,
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function bits(v: unknown): boolean[] {
  return Array.isArray(v) ? v.map((b) => b === true) : [];
}

export const hashAvalancheScene: ScenePlan<AvalancheScene> = {
  /**
   * 첫 장면은 비어 있다.
   *
   * 이 조각은 비트 셈을 algorithm 이 하고 `init` 이벤트로 실어 보낸다. 여기서
   * `initialData` 를 다시 셈하면 같은 계산이 두 곳에 살게 된다.
   */
  initial(): AvalancheScene {
    return EMPTY;
  },

  reduce(scene: AvalancheScene, event: FacetRuntimeEvent): AvalancheScene {
    switch (event.type) {
      case 'init': {
        const p = (event.payload ?? {}) as Record<string, unknown>;
        return {
          algorithmLabel: str(p.algorithmLabel),
          inputA: str(p.inputA),
          inputB: str(p.inputB),
          inputBitsA: bits(p.inputBitsA),
          inputBitsB: bits(p.inputBitsB),
          inputFlipped: bits(p.inputFlipped),
          outputBitsA: bits(p.outputBitsA),
          outputBitsB: bits(p.outputBitsB),
          outputFlipped: bits(p.outputFlipped),
          inputTotalBits: num(p.inputTotalBits),
          inputFlippedBits: num(p.inputFlippedBits),
          outputTotalBits: num(p.outputTotalBits),
          outputFlippedBits: num(p.outputFlippedBits),
          phase: 0,
        };
      }
      // 손으로 짚기 시작 — 자료는 그대로 두고 보인 것만 거둔다.
      case 'rewind':
        return { ...scene, phase: 0 };
      case 'reveal-inputs':
        return { ...scene, phase: 1 };
      case 'mark-input-diff':
        return { ...scene, phase: 2 };
      case 'reveal-outputs':
        return { ...scene, phase: 3 };
      case 'mark-output-diff':
        return { ...scene, phase: 4 };
      default:
        return scene;
    }
  },
};
