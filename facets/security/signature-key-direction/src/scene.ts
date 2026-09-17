/**
 * signatureKeyDirection 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * `let` 은 stage 에 둘뿐이었고(`rows` · `crossLines`) projector 에는 하나도 없었으며,
 * 조회로 갈리는 분기도 DOM 되읽기도 0 건이었다. 곧 **화면이 통째로 상태**였다는
 * 뜻이고, 실제로 알맹이는 전부 SVG 속성 셋에 얹혀 있었다.
 *
 * - **`group.style.opacity`** — 그 흐름이 세워졌나. `showEncryption()` / `showSignature()`
 *   의 반대가 정의되지 않아 되짚을 길이 없었다. 지금은 `flows` 가 말한다.
 * - **`line.style.opacity`** — 두 키가 교차했음을 이었나. 지금은 `keysCrossed`.
 * - **`whoStart` · `whoEnd` 의 `fill`** — "그 한 사람" 이 어느 쪽에 서 있나.
 *   두 행이 서로 다른 끝을 물들이는 것이 이 조각의 결론인데, 그 결론이 글자 색
 *   하나에만 있었다. 지금은 `whoMarked` 가 말하고 그리는 쪽이 어느 끝을 물들일지
 *   **행의 뜻에서** 정한다.
 * - **`type Labels` (문안 열 가지)** — projector 가 `tr()` 로 만들어 stage 로 밀어
 *   넣던 자리다. 장면이 문안을 지고 다니면 같은 장면을 다른 locale 로 그릴 수 없다
 *   (C10). 타입째 없앴고 문자는 `render` 가 `params.t` 로 만든다.
 * - **`Row.keyBox`** — 손잡이로 묶어 두고 **아무 데서도 읽지 않던** 필드.
 *   DOM 손잡이와 뜻이 한 객체에 묶인 자리라 눈으로만 잡힌다.
 *
 * ── 무엇을 싣고 무엇을 셈하나 (프로토콜 4 절)
 *
 * 실을 것이 없다. 이 조각은 값을 다루지 않고 **배치**를 말하므로 `initialData` 가
 * `stepMs` 하나뿐이고, 네 발신이 전부 빈 몸이다. 화면이 아는 것은 "어디까지
 * 세웠나" 뿐이라 그것만 담는다.
 *
 * 좌표는 담지 않는다. 두 행의 열 좌표도 교차선의 끝점도 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는 쪽의 몫이다
 * (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 흐름 하나. 이 조각의 주장은 **둘이 한 화면에 함께 설 때만** 선다.
 *
 * 좌표가 아니라 뜻이다 — 어느 행에 그릴지는 그리는 쪽이 이 뜻에서 정한다.
 */
export type KeyDirectionFlow = 'encryption' | 'signature';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 흐름이 어디서 드러나는지도, 교차선이 어디서 자라는지도,
 * 표식이 어떤 칠에서 물드는지도 전부 이 파일 밖의 상수와 배치에서 나오므로
 * `prev` 를 들출 일이 없다 (S-scene).
 */
export type KeyDirectionStep =
  /** 흐름 한 줄이 왼쪽에서 오른쪽으로 놓인다. */
  | { readonly kind: 'flow'; readonly flow: KeyDirectionFlow }
  /** 두 키 칸 사이에 X 자가 그어진다. */
  | { readonly kind: 'keys' }
  /** "그 한 사람" 이 선 자리가 두 행에서 물든다. */
  | { readonly kind: 'who' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). */
export type KeyDirectionCaption =
  | { readonly kind: 'encryption' }
  | { readonly kind: 'signature' }
  | { readonly kind: 'crossed' }
  | { readonly kind: 'who' };

export type KeyDirectionScene = {
  /**
   * 세워진 흐름들, 온 차례대로.
   *
   * 차례는 그리는 자리를 정하지 않는다 — 행은 흐름의 뜻이 정하므로 순회 순서가
   * 숨은 상태가 되지 않는다 (프로토콜 4 절 13).
   */
  readonly flows: readonly KeyDirectionFlow[];
  /** 두 키가 자리를 바꾸었음을 이었나. 한 번 그어지면 머문다. */
  readonly keysCrossed: boolean;
  /** "그 한 사람" 의 자리를 물들였나. 한 번 물들면 머문다. */
  readonly whoMarked: boolean;
  readonly step: KeyDirectionStep | null;
  readonly caption: KeyDirectionCaption | null;
};

/**
 * 아직 아무 흐름도 서지 않은 처음 화면.
 *
 * 이 조각에는 걸음이 고치지 않는 바탕이 없다 — 행의 문안도 색도 전부 그리는 쪽의
 * 상수와 `params.t` 에서 나온다. 그래서 `rewind` 가 이것을 그대로 쓴다.
 */
function atStart(): KeyDirectionScene {
  return {
    flows: [],
    keysCrossed: false,
    whoMarked: false,
    step: null,
    caption: null,
  };
}

/** 같은 흐름이 두 번 와도 목록이 불어나지 않게 한다. `reduce` 는 새 객체를 돌려준다. */
function withFlow(
  scene: KeyDirectionScene,
  flow: KeyDirectionFlow,
): readonly KeyDirectionFlow[] {
  return scene.flows.includes(flow) ? scene.flows : [...scene.flows, flow];
}

export const signatureKeyDirectionScene: ScenePlan<KeyDirectionScene> = {
  /**
   * 첫 장면은 빈 장면이다.
   *
   * 넘겨받은 자료를 참조로 쥐지 않는다 — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene). 여기서는 애초에 베낄 값이 없어 빈 장면으로 족하다.
   */
  initial(): KeyDirectionScene {
    return atStart();
  },

  reduce(scene: KeyDirectionScene, event: FacetRuntimeEvent): KeyDirectionScene {
    switch (event.type) {
      // 판이 선다. 실려 오는 값이 없어 빈 장면 그대로다.
      case 'init':
        return atStart();

      // 누구나 잠그고 주인만 여는 흐름.
      case 'encryption-flow':
        return {
          ...scene,
          flows: withFlow(scene, 'encryption'),
          step: { kind: 'flow', flow: 'encryption' },
          caption: { kind: 'encryption' },
        };

      // 주인만 만들고 누구나 확인하는 흐름. 앞 흐름을 지우지 않는다 —
      // 두 방향이 한 화면에 함께 서야 "반대다" 가 읽힌다.
      case 'signature-flow':
        return {
          ...scene,
          flows: withFlow(scene, 'signature'),
          step: { kind: 'flow', flow: 'signature' },
          caption: { kind: 'signature' },
        };

      // 두 키의 자리가 바뀌었음을 잇는다.
      case 'mark-keys':
        return {
          ...scene,
          keysCrossed: true,
          step: { kind: 'keys' },
          caption: { kind: 'crossed' },
        };

      // 키와 함께 "그 한 사람" 이 선 자리도 앞뒤로 바뀌었음을 물들인다.
      case 'mark-who':
        return {
          ...scene,
          whoMarked: true,
          step: { kind: 'who' },
          caption: { kind: 'who' },
        };

      // 손으로 짚기 시작 — 세운 것을 전부 거둔다. 바탕이 없어 빈 장면이 곧 처음이다.
      case 'rewind':
        return atStart();

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
