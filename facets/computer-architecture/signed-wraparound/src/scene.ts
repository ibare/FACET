/**
 * signedWraparound 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신하되 stage 의 메서드를 부르지 않고 다음 장면을
 * 돌려준다. 그래서 어느 걸음의 화면이든 셈으로 얻는다 (`runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * - **projector 의 `let wrapped`** — 이미 한 바퀴 넘었는가. 같은 `advance` 를
 *   "한 칸 오른쪽" 과 "여기서부터 다시 오른쪽" 으로 가르던 유일한 자리다.
 * - **고리 경로의 `stroke-dashoffset`** — 넘어갔는가를 화면이 따로 쥐고 있었다.
 *   `wrapped` 와 같은 물음에 답이 둘이었다.
 * - **레일 셋의 `stroke` 색** — 결론에 이르렀는가. `conclude()` 가 칠하고
 *   `restore()` 만이 되돌렸다.
 * - **칸의 `stroke` 와 이름표의 `fill`** — 어느 끝을 이미 짚었는가.
 *   `setEndEmphasis(slot, on)` 의 `on` 이 저장되는 곳은 어디에도 없었다.
 * - **표식의 `transform` · 값 글자 · 비트 글자** — 지금 값과 그 비트열.
 *
 * 여기서는 그것들이 `visited` · `wrapped` · `concluded` · `step` 넷이다. 어느
 * 끝을 짚었나는 자취에서 세고 (`visited` 가 양 끝을 품었나), 지금 값은 자취의
 * 마지막이며, 비트열은 `toBits` 가 값에서 셈한다.
 *
 * ── 지워지던 자취를 남긴다
 *
 * 옛 화면에는 **지나온 값의 자취가 없었다.** 표식이 칸에서 칸으로 미끄러지면
 * 앞 칸은 아무 자국도 남기지 않아, 다 끝난 화면이 "여기까지 올라왔다가 끝을
 * 지나 저쪽 끝에서 나왔다" 를 말하지 못했다. 이 조각의 주장이 바로 그것인데도
 * 그렇다 (프로토콜 4 절 "조각의 주장이 마지막 화면에 안 남아 있는 수가 있다").
 * 이제 `visited` 가 그것을 쥐고 정적 그리기가 매번 세운다.
 *
 * 마찬가지로 **부호 자리가 켜지는 순간**도 운동 중에만 있었다. 뒤집히는 비트를
 * 잠깐 강조했다 걸음 끝에 거뒀으니, 멎은 화면에는 "맨 윗자리가 이번에 0 에서
 * 1 로 넘어갔다" 가 남지 않았다. 2의 보수에서 넘어감의 정체가 그것인데도.
 * 이제 `step` 이 그 걸음을 말하고 뒤집힌 자리는 `carryOrder` 가 센다.
 *
 * ── 수는 싣지 않고 셈한다
 *
 * 걸음이 싣는 것은 **닿은 값 하나**뿐이다. 떠난 값은 자취의 마지막이고, 비트열은
 * `toBits`, 양 끝은 `signedMin` / `signedMax` 가 값에서 셈한다 — 셋 다
 * algorithm 이 내주는 순수 함수라 화면과 알고리즘이 같은 셈을 쓴다 (프로토콜
 * 4 절 "바탕에서 결정되는 셈은 싣지 말고 같은 함수를 부르게 한다").
 *
 * 좌표는 담지 않는다 — 값이 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { signedMax, signedMin, toBits } from './algorithm.js';

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `from` 을 싣는 것이 중요하다. 정적 그리기는 이미 표식을 `to` 에 세워 둔 뒤라
 * 출발 그림이 없으면 흐를 수 없는데, `prev` 를 들추면 "`prev` 는 고르는 데만"
 * 을 어긴다 (S-scene). 그래서 계기값을 걸음이 싣는다.
 */
export type WraparoundStep = {
  /** 옆 칸으로 미끄러지는 걸음인가, 오른쪽 끝을 지나 고리를 도는 걸음인가. */
  kind: 'walk' | 'wrap';
  /** 떠난 값. */
  from: number;
  /** 닿은 값. */
  to: number;
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type WraparoundCaption =
  | { kind: 'step'; to: number }
  | { kind: 'atMax'; to: number }
  | { kind: 'wrap'; to: number }
  | { kind: 'afterWrap'; to: number }
  | { kind: 'conclusion' };

export type SignedWraparoundScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 셈에 쓰는 비트 폭. 맨 앞 한 자리가 부호 자리다. */
  bitWidth: number;
  /** 1 을 더하기 시작한 값. */
  start: number;

  // ── 자취. 걸음이 밀고 `rewind` 가 되돌린다.
  /**
   * 지나온 값들. 첫 자리가 `start` 이고 마지막이 지금 값이다.
   *
   * 밟은 칸의 자취도, 어느 끝을 이미 짚었나도 전부 여기서 센다.
   */
  visited: readonly number[];
  /** 오른쪽 끝을 지나 고리를 돌았는가. 고리가 그어진 채로 남는다. */
  wrapped: boolean;
  /** 할 말을 마쳤는가. 레일 전체가 한 줄기 고리로 묶인다. */
  concluded: boolean;
  step: WraparoundStep | null;
  caption: WraparoundCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `visited` · `wrapped` · `concluded` 는 걸어온 자취라 여기 넣지 않는다 —
 * 넣으면 되감은 화면이 이미 다 걸어간 채로 서고 그 위에 algorithm 이 새로
 * 걷는 것이 겹친다 (S-scene · 프로토콜 4 절).
 */
type Base = Pick<SignedWraparoundScene, 'bitWidth' | 'start'>;

const FALLBACK_BIT_WIDTH = 8;

/**
 * `initialData` 를 좁힌다. 장면 방식에서는 여기가 그 자리다 — 러너가 첫 장면을
 * 셈할 때 딱 한 번 부른다 (C9).
 *
 * **값을 복사한다.** 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한 객체라
 * 참조를 쥐면 되짚을 때 이미 다 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readBase(raw: unknown): Base {
  const p = raw as { bitWidth?: unknown; start?: unknown } | undefined;
  const bitWidth =
    typeof p?.bitWidth === 'number' && p.bitWidth >= 4
      ? Math.floor(p.bitWidth)
      : FALLBACK_BIT_WIDTH;
  const min = signedMin(bitWidth);
  const max = signedMax(bitWidth);
  const start =
    typeof p?.start === 'number' ? Math.min(max, Math.max(min, Math.trunc(p.start))) : max - 2;
  return { bitWidth, start };
}

/** 걸음이 실어 오는 것은 닿은 값 하나뿐이다. */
function readTo(raw: unknown): number | null {
  const p = raw as { to?: unknown } | undefined;
  return typeof p?.to === 'number' ? p.to : null;
}

/**
 * 되돌린 뒤의 장면 — 시작값에 표식 하나만 서 있다.
 *
 * 바탕 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.**
 * 변수를 넘기면 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다
 * (프로토콜 4 절).
 */
function atStart(base: Base): SignedWraparoundScene {
  return {
    bitWidth: base.bitWidth,
    start: base.start,
    visited: [base.start],
    wrapped: false,
    concluded: false,
    step: null,
    caption: null,
  };
}

/** 지금 값. 자취의 마지막이다 — 따로 쥐면 같은 물음에 답이 둘이 된다. */
export function nowValue(scene: SignedWraparoundScene): number {
  return scene.visited[scene.visited.length - 1] ?? scene.start;
}

/**
 * 이번 걸음에 뒤집히는 비트 자리를, 자리올림이 번지는 차례대로 (오른쪽 → 왼쪽).
 *
 * 흐르는 그림도 멎은 그림도 이 한 셈을 쓴다 — 번짐의 차례를 두 군데서 정하면
 * 갈린다.
 */
export function carryOrder(step: WraparoundStep, bitWidth: number): number[] {
  const from = toBits(step.from, bitWidth);
  const to = toBits(step.to, bitWidth);
  const out: number[] = [];
  for (let i = bitWidth - 1; i >= 0; i -= 1) {
    if (from[i] !== to[i]) out.push(i);
  }
  return out;
}

export const signedWraparoundScene: ScenePlan<SignedWraparoundScene> = {
  initial(initialData: unknown): SignedWraparoundScene {
    return atStart(readBase(initialData));
  },

  reduce(scene: SignedWraparoundScene, event: FacetRuntimeEvent): SignedWraparoundScene {
    switch (event.type) {
      // 옆 칸으로 한 걸음. 넘어가기 전과 후는 운동이 같고 하는 말만 다르다.
      case 'advance':
      case 'reach-max': {
        const to = readTo(event.payload);
        if (to === null) return scene;
        const from = nowValue(scene);
        return {
          ...scene,
          visited: [...scene.visited, to],
          step: { kind: 'walk', from, to },
          caption:
            event.type === 'reach-max'
              ? { kind: 'atMax', to }
              : scene.wrapped
                ? { kind: 'afterWrap', to }
                : { kind: 'step', to },
        };
      }

      // 오른쪽 끝을 지난다. 자리올림이 부호 자리까지 번져 가장 작은 수가 된다.
      case 'wrap': {
        const to = readTo(event.payload);
        if (to === null) return scene;
        const from = nowValue(scene);
        return {
          ...scene,
          visited: [...scene.visited, to],
          wrapped: true,
          step: { kind: 'wrap', from, to },
          caption: { kind: 'wrap', to },
        };
      }

      // 할 말을 마치고 결론만 말한다. 걸어 온 자취는 그대로 둔다.
      case 'done':
        return { ...scene, concluded: true, step: null, caption: { kind: 'conclusion' } };

      /**
       * 손으로 짚어 보기가 처음으로 되감는다.
       *
       * 자취를 바탕인 척 넘기면 되감은 화면에 이미 다 걸어간 길이 선다.
       * 바탕에서 처음 장면을 다시 셈한다 (S-scene).
       */
      case 'rewind':
        return atStart({ bitWidth: scene.bitWidth, start: scene.start });

      // 이 algorithm 은 위 다섯만 발신한다. 그 밖의 것은 조용히 버린다 (C2).
      default:
        return scene;
    }
  },
};
