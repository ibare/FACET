/**
 * Scene — 걸음의 화면을 **상태로** 잡는다.
 *
 * 지금까지 projector 는 이벤트를 받아 stage 의 메서드를 불렀다 (`revealInputs()`,
 * `markDiff()` …). 화면이 "이전 화면 + 명령"으로 만들어지는 짜임이라, 상태가 DOM
 * 안에만 있고 명령에는 역이 없다. `revealInputs()` 의 반대가 정의되지 않는다.
 *
 * 그래서 임의의 걸음으로 가려면 처음부터 명령을 다시 밟는 수밖에 없었고, 그 과정이
 * 조각마다 다른 사정을 탔다.
 *
 * 여기서는 그것을 뒤집는다.
 *
 * ```
 * 걸음 i   →  Scene(i)      순수 데이터. DOM 을 모른다.
 * Scene(i) →  화면          render 가 그린다.
 * ```
 *
 * `Scene(i)` 는 이벤트로부터 순수하게 셈해진다 — `reduce(scene, event)`. 그러니
 * 어느 걸음의 화면이든 **계산으로** 얻는다. 되짚기가 앞으로 가기와 같은 연산이 되고,
 * 방향이라는 개념이 사라진다.
 *
 * ## 그림의 자유는 묶지 않는다
 *
 * `render(next, prev)` 는 두 상태를 받는다. 그래서 무엇에서 무엇으로 가는지가 늘
 * 분명하고, 그 사이를 어떻게 건널지는 stage 마음이다 — CSS transition 이든 rAF
 * 보간이든. 오히려 지금보다 쓰기 쉽다. 지금은 보간할 `from` 이 "명령 실행 중
 * 어딘가"라 stage 가 스스로 기억해야 했다.
 *
 * ## 함께 따라오는 것
 *
 * - **걸음 계약이 저절로 선다.** `render` 가 상태를 세우고 끝나므로 "끝났다고 해
 *   놓고 더 그리는" 일이 구조적으로 없다.
 * - **되돌림이 필요 없다.** 지울 것을 지우는 대신 목표 상태를 통째로 그린다.
 * - **검사가 싸진다.** Scene 은 순수 데이터라 화면을 띄우지 않고 견줄 수 있다.
 */

import type { FacetRuntimeEvent } from '../types/event.js';

/**
 * 조각이 내놓는 장면 설계.
 *
 * `S` 는 그 조각만의 장면 모양이다. 프레임워크는 안을 들여다보지 않는다 — 만들고,
 * 이어 붙이고, stage 에 건넬 뿐이다.
 */
export type ScenePlan<S = unknown> = {
  /** 첫 장면. `initialData` 로부터 셈한다. */
  initial(initialData: unknown): S;
  /**
   * 걸음 하나를 얹은 다음 장면.
   *
   * **앞 장면을 고치지 않는다.** 되짚기는 지나온 장면들을 그대로 다시 쓰므로,
   * 제자리에서 고치면 과거가 함께 바뀐다.
   */
  reduce(scene: S, event: FacetRuntimeEvent): S;
};

/**
 * 장면을 그리는 View.
 *
 * 빌트인 View 와 같은 자리에 등록되지만 `render` 하나로 산다. 걸음마다 부르는
 * 메서드를 따로 두지 않는다 — 그 메서드들이 곧 되돌릴 수 없는 명령이었다.
 */
export type SceneRenderer<S = unknown> = {
  /**
   * 장면을 그린다.
   *
   * @param next 그려야 할 장면.
   * @param prev 직전 장면. 처음이거나 이어지지 않는 건너뜀이면 `null`.
   * @param opts `animate` 가 거짓이면 사이를 건너뛰고 곧바로 `next` 를 세운다.
   *   되짚기와 첫 그림에서 그렇게 부른다.
   *
   * 돌려주는 Promise 는 **그 장면이 다 선 뒤에** 풀려야 한다. 이것이 바깥이 걸음의
   * 끝을 아는 유일한 통로다.
   */
  render(next: S, prev: S | null, opts: { animate: boolean }): void | Promise<void>;
  destroy(): void;
};

/** 장면 설계 + 그리는 이. 조각이 이 둘을 짝지어 등록한다. */
export type SceneFacet<S = unknown> = {
  plan: ScenePlan<S>;
  /** 장면을 그릴 View 의 등록 이름. `blocks` 의 stage 블록 type 과 같다. */
  view: string;
};

/**
 * 장면들을 쥐고 걸음을 오간다.
 *
 * 러너가 조각마다 하나씩 만든다. 걸음마다 장면을 이어 붙여 쌓아 두므로, 어느 걸음의
 * 화면이든 다시 셈하지 않고 곧바로 꺼낸다 — 장면은 순수 데이터라 쥐고 있어도 가볍다.
 */
export class SceneTrack<S = unknown> {
  /** 걸음 0(첫 장면) 부터 차례로. 인덱스가 곧 걸음 수다. */
  private readonly scenes: S[] = [];

  constructor(
    private readonly plan: ScenePlan<S>,
    initialData: unknown,
  ) {
    this.scenes.push(plan.initial(initialData));
  }

  /** 걸어 온 걸음 수 (첫 장면은 0 걸음). */
  get length(): number {
    return this.scenes.length - 1;
  }

  /** 걸음 i 의 장면. 범위 밖이면 양 끝으로 잘린다. */
  at(step: number): S {
    const i = Math.max(0, Math.min(this.scenes.length - 1, step));
    return this.scenes[i];
  }

  /**
   * 걸음 하나를 얹고 그 장면을 돌려준다.
   *
   * **`silent` 발신은 걸음을 늘리지 않고 지금 걸음의 장면을 갈아 끼운다.** 걸음의
   * 경계를 가르는 잣대가 `silent` 가 아닌 발신이기 때문이다 (`timeline.ts` 의 `ends`,
   * S-runtime 의 silent 규약). 여기서 함께 늘리면 **걸음 번호와 장면 번호가 한 칸씩
   * 어긋나** 띠가 옆 걸음의 장면을 세운다.
   *
   * 조용한 발신도 화면 상태는 바꾸므로 장면에는 반영한다 — 늘리지 않을 뿐이다.
   *
   * 눈으로는 거의 안 보이는 어긋남이다. 조용한 발신 자체는 대개 화면을 바꾸지 않아
   * 그 걸음은 멀쩡해 보이고, 어긋나는 것은 **그 뒤의 모든 걸음**이다.
   */
  push(event: FacetRuntimeEvent): S {
    const next = this.plan.reduce(this.scenes[this.scenes.length - 1], event);
    if (event.silent === true) {
      this.scenes[this.scenes.length - 1] = next;
      return next;
    }
    this.scenes.push(next);
    return next;
  }

  /** 첫 장면만 남기고 지운다. 되돌리기(replay) 때. */
  reset(initialData: unknown): void {
    this.scenes.length = 0;
    this.scenes.push(this.plan.initial(initialData));
  }
}
