/**
 * Timeline — 걸어간 자취를 적어 두었다가 임의의 걸음으로 되돌리는 장치.
 *
 * 조각의 알고리즘은 코루틴이라 뒤로 감기지 않는다. 그런데 조각은 자료가 고정된
 * 순수 함수라 **같은 걸음은 언제나 같은 이벤트를 낸다.** 그러니 걸을 때 발신을
 * 적어 두면, 되감은 뒤 앞에서부터 다시 먹이는 것만으로 그 걸음의 화면을 되살릴
 * 수 있다. 알고리즘을 다시 돌릴 필요가 없다.
 *
 * 그 전제는 `packages/core/test/scrub-replay.test.ts` 가 잰다 — 되감고 다시 먹인
 * 화면이 순방향으로 거기까지 걸어간 화면과 같은가. 조각 72 종에서 65 (90%) 가
 * 같았고, 어긋난 일곱은 stage 의 되돌림이 그 걸음이 바꾼 것을 다 되돌리지 않는
 * 경우다 (`tasks/scrub-timeline-experiment.md`). 그 파일은 통과 바를 세우는 검사가
 * 아니라 **셈을 찍는 계측 하네스**이고, 회귀를 막는 것은 `timeline-scrub.test.ts` 다.
 *
 * ## 방향마다 다르게 간다
 *
 * **앞으로** 는 걸음마다 차례로 먹인다. 걸음 하나하나의 애니메이션이 그대로
 * 살아 있고, 목표가 멀면 화면이 뒤처진 채 쫓아온다. 그 뒤처짐이 스크럽의 질감이다.
 *
 * 다만 뒤처짐을 stage 에 맡길 수는 없다. projector 가 애니메이션 promise 를
 * 돌려주는 조각은 그것이 리듬을 만들지만, 속성만 세팅하고 CSS transition 에
 * 맡기는 조각은 `onEvent` 가 곧바로 돌아와 다섯 걸음이 한 프레임에 끝난다.
 * 저장소의 stage 273 중 그런 것이 다수다. 그래서 걸음의 리듬은 여기서 준다 —
 * 이미 애니메이션으로 쓴 시간은 빼고 **모자란 만큼만** 채운다 (`STEP_BEAT_MS`).
 *
 * **뒤로** 는 되감고 목표까지 한 묶음으로 먹인다. stage 의 애니메이션을 즉시
 * 모드로 돌려 두고 (`onInstant`) 걸음을 차례로 `await` 하는데, 즉시 모드에서는
 * 타이머도 프레임도 걸리지 않아 그 기다림이 마이크로태스크로만 끝난다. 브라우저는
 * 그 묶음을 한 프레임으로 합치므로 중간 상태가 화면에 나오지 않고, stage 의 CSS
 * transition 이 지금 화면에서 목표 화면으로 곧장 보간한다. 처음으로 튕겼다가
 * 다시 채우는 것이 아니라 일곱에서 셋으로 곧장 간다.
 *
 * 한때 여기서 `await` 를 빼고 던져 두었다. 동기 stage 에서는 같은 결과였지만
 * 비동기 stage 에서는 걸음들의 **`await` 뒤쪽이 뒤섞여** 실행돼, 앞 걸음이 지울
 * 임시 노드를 뒷 걸음이 이미 그린 뒤였다. 화면에 지난 걸음의 라벨이 겹쳐 남았다.
 *
 * ## 목표를 쫓아간다
 *
 * `seek` 은 즉시 도달하지 않고 **목표만 갱신**한다. 화면은 자기 걸음으로 쫓아가고,
 * 쫓아가는 중에 목표가 다시 바뀌면 그리로 방향을 튼다. 손이 핸들을 끄는 동안
 * 화면이 늦게 따라오는 것은 지연이 아니라 이 모델의 당연한 귀결이다.
 */

import type { FacetRuntimeEvent } from '../types/event.js';
import type { ProjectorInstance } from './projector.js';

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export type TimelineHooks = {
  /** 적어 둔 걸음 수가 늘었다. 첫 재생 동안 스크럽 띠가 이것으로 채워진다. */
  onLength?(steps: number): void;
  /** 화면이 실제로 선 걸음. 핸들이 아니라 화면 쪽이다. */
  onCursor?(step: number): void;
  /**
   * 되짚는 동안 stage 의 애니메이션을 즉시 끝내라는 신호.
   *
   * 애니메이션을 CSS transition 에 맡기는 stage 는 이것이 필요 없다 — 속성만
   * 덮어쓰면 마지막 값이 이긴다. 그러나 `animate(ms, draw)` 로 진행률을 직접
   * 그리는 stage (저장소의 273 중 60) 는 되짚기가 몰아 먹인 걸음마다 tween 을
   * 하나씩 띄우고, 그것들이 같은 요소에 서로 다른 값을 쓰며 화면을 엉킨 채로
   * 남긴다. 되짚은 직후에는 멀쩡해 보이다가 1초쯤 뒤 무너지므로 눈으로도 늦게야
   * 잡힌다 — 실제로 그렇게 잡았다.
   */
  onInstant?(on: boolean): void;
  /**
   * 장면 기반 조각의 걸음 그리기.
   *
   * 있으면 자취를 다시 먹이는 대신 이것을 부른다. 장면은 걸음마다 통째로 쥐고
   * 있으므로 **어느 걸음이든 한 번에 그린다** — 되짚기가 앞으로 가기와 같은
   * 연산이 되고, 몰아 먹이기도 즉시 모드도 필요 없다 (`runtime/scene.ts`).
   */
  renderStep?(step: number, from: number, animate: boolean): void | Promise<void>;
};

/**
 * 자취를 적고 되짚는다.
 *
 * projector 를 감싸 발신을 가로채므로 algorithm 도 projector 도 자기가 감싸였다는
 * 것을 모른다 (원칙 1 의 층 분리 — 조각 쪽 코드는 한 줄도 바뀌지 않는다).
 */
export class Timeline {
  /** 발신 전부. `silent` 도 화면 상태를 바꾸므로 함께 적는다. */
  private log: FacetRuntimeEvent[] = [];
  /**
   * 걸음 s (1부터) 가 끝나는 로그 인덱스(배타).
   *
   * 걸음의 경계는 `silent` 가 아닌 발신이다 — mechanism 이 step boundary 를
   * 가르는 잣대와 같은 것을 쓴다 (S-runtime 의 silent 규약).
   */
  private ends: number[] = [];
  private inner: ProjectorInstance | null = null;
  /**
   * `onInit` 이 받았던 자료의 **사본**.
   *
   * 되감기는 `onReset` 다음에 `onInit` 을 부른다 — S-runtime 이 못박은 순서이고,
   * projector 가 `onInit` 에서 stage 의 바탕(축·눈금·라벨)을 그리기 때문이다.
   * `onReset` 만 부르고 로그를 먹이면 그 바탕이 사라진 채로 걸음만 얹힌다.
   *
   * **참조를 쥐면 안 된다.** 러너가 넘기는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체이고, algorithm 이 그것을 제자리에서 고친다 (`values[i] = …`). 참조를
   * 쥐고 있으면 되짚을 때 **이미 다 굴러간 자료**로 바탕을 다시 그리게 된다 —
   * 정렬 조각이 되짚은 뒤 정렬된 배열을 처음 배치라고 그리는 식이다. 조각 181 을
   * 전수로 재어 어긋난 14 중 여럿이 이 하나였다.
   */
  private initialData: unknown = undefined;

  /** 화면이 선 걸음. */
  private cursorStep = 0;
  /** 쫓아갈 걸음. `seek` 이 이것만 바꾼다. */
  private targetStep = 0;

  /** 자취를 적는 중인가. 되짚는 동안에는 적지 않는다. */
  private recording = true;
  /** 자동 재생이 완주해 자취가 닫혔는가. */
  private sealed = false;
  /** 쫓아가는 루프가 도는 중인가. */
  private pumping = false;
  private destroyed = false;
  /** 걸음 사이의 쉼에 걸어 둔 것. 접을 때 일괄로 거둔다 (S-piece 의 destroy 규약). */
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  /**
   * 쉼을 기다리는 것들.
   *
   * 타이머를 거두는 것만으로는 모자라다 — **취소된 `setTimeout` 은 아예 불리지
   * 않으므로** resolve 하는 길이 지나가지 않고, `pump` 의 `await rest(...)` 가
   * 영영 돌아오지 않는다. 그 클로저가 자취와 projector 를 통째로 붙든다.
   */
  private readonly waiters = new Set<() => void>();

  constructor(private readonly hooks: TimelineHooks = {}) {}

  /** 적어 둔 걸음 수. */
  get length(): number {
    return this.ends.length;
  }

  /** 화면이 선 걸음. */
  get cursor(): number {
    return this.cursorStep;
  }

  /** 자취가 닫혔는가 — 닫혀야 스크럽을 열 수 있다. */
  get complete(): boolean {
    return this.sealed;
  }

  /**
   * projector 를 감싼다.
   *
   * 되짚기는 여기서 잡아 둔 **안쪽** 인스턴스로 직접 먹인다. 감싼 것으로 먹이면
   * 되짚은 발신이 다시 자취에 쌓인다.
   */
  wrap(projector: ProjectorInstance): ProjectorInstance {
    this.inner = projector;
    const self = this;
    return {
      onInit(initialData: unknown) {
        self.initialData = deepClone(initialData);
        projector.onInit?.(initialData);
      },
      async onEvent(event: FacetRuntimeEvent) {
        if (self.recording && !self.sealed) {
          self.log.push(event);
          if (event.silent !== true) {
            self.ends.push(self.log.length);
            self.cursorStep = self.ends.length;
            self.targetStep = self.cursorStep;
            self.hooks.onLength?.(self.ends.length);
            self.hooks.onCursor?.(self.cursorStep);
          }
        }
        await projector.onEvent(event);
      },
      onReset() {
        projector.onReset?.();
      },
      onDestroy() {
        projector.onDestroy?.();
      },
    };
  }

  /**
   * 자취를 닫는다. 자동 재생이 완주한 뒤 러너가 부른다.
   *
   * 닫지 않으면 조각이 `advance` 를 받아 다시 걸을 때 같은 걸음이 두 번 쌓인다 —
   * 조각의 손짚기 루프는 끝까지 간 뒤 되감고 처음부터 다시 걷기 때문이다 (S-piece).
   */
  seal(): void {
    if (this.ends.length > 0) this.sealed = true;
  }

  /** 자취를 버린다. 되돌리기(replay) 로 처음부터 다시 걸을 때. */
  clear(): void {
    // 처음부터 다시 걷는다 — 즉시 모드를 붙들고 있으면 자동 재생이 순식간에 지나간다.
    this.hooks.onInstant?.(false);
    this.log = [];
    this.ends = [];
    this.cursorStep = 0;
    this.targetStep = 0;
    this.recording = true;
    this.sealed = false;
    this.hooks.onLength?.(0);
    this.hooks.onCursor?.(0);
  }

  destroy(): void {
    this.destroyed = true;
    for (const id of this.timers) clearTimeout(id);   // 걸어 둔 것을 먼저 거두고
    this.timers.clear();
    for (const wake of [...this.waiters]) wake();     // 기다리던 것을 깨운다
    this.waiters.clear();
  }

  /**
   * 목표 걸음을 정한다. 도달을 기다리지 않는다.
   *
   * 끄는 동안 여러 번 불려도 좋다 — 마지막 목표가 이긴다.
   */
  seek(step: number): void {
    if (!this.sealed || this.ends.length === 0) return;
    const t = Math.max(0, Math.min(this.ends.length, Math.round(step)));
    if (t === this.targetStep) return;
    this.targetStep = t;
    if (!this.pumping) void this.pump();
  }

  /**
   * 한 걸음에 들이는 시간의 바탕.
   *
   * 자동 재생의 `stepMs` (700~900 이 대종) 보다 훨씬 짧다. 스크럽은 이미 본 것을
   * 다시 지나가는 일이라 읽을 시간을 줄 까닭이 없고, 멀리 끌었을 때 그 간격이
   * 그대로 곱해지면 손을 놓고 한참을 기다리게 된다.
   */
  private static readonly STEP_BEAT_MS = 220;
  /** 남은 걸음이 많을수록 짧게 — 많이 늘어난 고무줄이 더 세게 당기는 것과 같다. */
  private static readonly STEP_BEAT_MIN_MS = 45;

  /** 목표에 닿을 때까지 쫓아간다. */
  private async pump(): Promise<void> {
    this.pumping = true;
    this.recording = false;
    try {
      while (!this.destroyed && this.cursorStep !== this.targetStep) {
        if (this.targetStep > this.cursorStep) await this.forwardOne();
        else await this.rewindTo(this.targetStep);
      }
    } finally {
      this.pumping = false;
      this.recording = true;
    }
  }

  /**
   * 한 걸음 앞으로. 그 걸음의 애니메이션을 그대로 기다리고, 모자라면 채운다.
   *
   * 채우는 몫은 **남은 거리에 반비례**한다. 멀리 끌면 화면이 빠르게 쫓아오고
   * 목표에 가까워질수록 느긋해져, 당긴 만큼 세게 당겨지는 고무줄로 읽힌다.
   */
  private async forwardOne(): Promise<void> {
    const inner = this.inner;
    if (!inner) return;
    // 되짚은 뒤로 켜져 있던 즉시 모드를 여기서 내린다 (`rewindTo` 참고).
    this.hooks.onInstant?.(false);
    const s = this.cursorStep + 1;
    if (this.hooks.renderStep) {
      const startedAt = Date.now();
      await this.hooks.renderStep(s, this.cursorStep, true);
      this.cursorStep = s;
      this.hooks.onCursor?.(s);
      const remaining = Math.max(1, this.targetStep - this.cursorStep);
      const beat = Math.max(Timeline.STEP_BEAT_MIN_MS, Timeline.STEP_BEAT_MS / remaining);
      const owed = beat - (Date.now() - startedAt);
      if (owed > 0) await this.rest(owed);
      return;
    }
    const from = s === 1 ? 0 : this.ends[s - 2];
    const to = this.ends[s - 1];
    const startedAt = Date.now();
    for (let i = from; i < to; i++) {
      if (this.destroyed) return;
      await inner.onEvent(this.log[i]);
    }
    this.cursorStep = s;
    this.hooks.onCursor?.(s);

    const remaining = Math.max(1, this.targetStep - this.cursorStep);
    const beat = Math.max(Timeline.STEP_BEAT_MIN_MS, Timeline.STEP_BEAT_MS / remaining);
    const owed = beat - (Date.now() - startedAt);
    if (owed > 0) await this.rest(owed);
  }

  /** 걸음 사이의 쉼. 접히면 곧바로 깨어난다. */
  private rest(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.destroyed) return resolve();
      const finish = (): void => {
        this.waiters.delete(finish);
        resolve();
      };
      this.waiters.add(finish);
      const id = setTimeout(() => {
        this.timers.delete(id);
        finish();
      }, ms);
      this.timers.add(id);
    });
  }

  /**
   * 되감고 목표까지 한 묶음으로 다시 먹인다.
   *
   * 즉시 모드를 켠 채로 걸음을 차례로 기다린다. 즉시 모드의 stage 는 타이머도
   * 프레임도 걸지 않으므로 이 기다림은 마이크로태스크로 끝나고, 브라우저는 묶음
   * 전체를 한 프레임으로 합친다 — 중간 상태가 화면에 나오지 않는다.
   *
   * 차례를 지키는 것이 요점이다. 기다리지 않고 던져 두면 비동기 stage 에서
   * 걸음들의 뒷부분이 뒤섞여, 앞 걸음이 지울 임시 노드를 뒷 걸음이 이미 그린
   * 뒤가 된다.
   */
  private async rewindTo(target: number): Promise<void> {
    // 즉시 모드는 여기서 켜고 **끄지 않는다.** 되짚기가 언제 끝났는지 알 수 없기
    // 때문이다 — projector 가 stage 를 기다리지 않는 조각에서는 아직 돌아오지 않은
    // 걸음 흐름이 남고, 그것이 깃발이 내려간 뒤 `wait` 를 새로 걸면 1 초쯤 뒤에
    // 깨어나 화면을 고친다. 활성으로 세워 둔 행이 슬그머니 꺼지는 식이다.
    //
    // 되짚은 뒤는 멈춰 있는 자리라 깃발이 켜져 있어도 보이는 차이가 없다. 앞으로
    // 끌 때(`forwardOne`)와 되돌릴 때(`clear`) 내린다.
    const inner = this.inner;
    if (!inner) return;
    if (this.hooks.renderStep) {
      // 장면을 쥐고 있으면 한 번에 그린다. 되감고 다시 먹일 일이 없다.
      const from = this.cursorStep;
      this.cursorStep = target;
      this.hooks.onCursor?.(target);
      // 뒤로는 흐르지 않고 곧바로 그 장면에 세운다. 장면을 쥐고 있으므로 지나온
      // 걸음을 되밟을 까닭이 없고, 되밟으면 그 애니메이션이 되짚기보다 오래 남는다.
      await this.hooks.renderStep(target, from, false);
      return;
    }
    this.hooks.onInstant?.(true);
    try {
      inner.onReset?.();
      // 사본을 또 복제해 넘긴다. 그대로 주면 stage 가 그것을 고쳐 다음 되짚기가
      // 어긋난다 — 쥔 것이 원본이 아니게 되는 같은 덫이다.
      inner.onInit?.(deepClone(this.initialData));
      const to = target === 0 ? 0 : this.ends[target - 1];
      for (let i = 0; i < to; i++) {
        if (this.destroyed) return;
        await inner.onEvent(this.log[i]);
      }
      this.cursorStep = target;
      this.hooks.onCursor?.(target);
    } catch {
      this.hooks.onInstant?.(false);
    }
  }
}
