/**
 * PushPopTop 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 값 상자 셋이 왼쪽 기록줄(IN)에 줄여 놓인 채 시작해, 하나씩 통의 문으로 들어가
 * 쌓이고, 다시 문으로 솟아 나와 오른쪽 기록줄(OUT)에 줄여 놓인다. 그러니 상자
 * 하나가 있을 수 있는 자리는 셋뿐이다 — **아직 안 들어갔다 · 통 안 몇 번째 · 몇
 * 번째로 나갔다.**
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었다. 상태는 전부 stage 의 DOM 안에 있었다.
 *
 * - **쌓인 높이와 꼭대기** — 상자의 `transform` 과 `BlockEl.slot` 필드, 그리고
 *   `findAtSlot()` 이라는 조회가 전부였다. 무엇이 몇 번째에 쌓였나를 말하는 자리가
 *   없어 되감으면 통이 옛 높이로 남았다. 이제 `stack` 이 말한다. **길이가 곧
 *   top 지표**라 눈금 위 표식도 여기서 나온다.
 * - **몇 개가 나갔나** — stage 의 `let outCount` 하나. 나간 상자를 오른쪽 기록줄
 *   어느 칸에 놓을지와 마지막 활을 몇 개 그릴지를 함께 쥐고 있었다. 이제 `out` 이
 *   말하고, **나간 차례**까지 담으므로 활이 이을 두 끝이 장면에서 나온다.
 * - **막힘 표식** — 깔린 상자 `rect` 의 `stroke` · `stroke-dasharray` 와 `stopBar`
 *   의 `display`. `clearBlockedMark()` 가 "모든 상자를 훑어 되돌리는" 명령형 코드로
 *   그것을 거뒀다. 이제 `blocked` 가 말하고 그 함수는 사라진다. 탐침이 왔다 가는
 *   것은 지나가지만 **띠와 붉은 테두리는 그 걸음 끝에 남으므로** 정적으로도 그린다.
 * - **활이 그어졌나** — `arcLayer` 에 덧붙인 path 들. 이제 `linked` 가 말한다.
 *   **남는 강조**라 정적 그리기에 들어간다.
 *
 * 좌표는 담지 않는다. 자리 번호와 나간 차례라는 **구조**만 담고 통의 높이도 기록줄
 * 칸도 그리는 쪽이 캔버스에서 셈한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 `params.t`
 * 로 만든다 — 같은 장면을 다른 locale 로 그릴 수 있어야 한다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 걸음마다 **출발 그림을 셈할 계기값을 스스로 싣는다.** 정적 그리기는 상자를 이미
 * 끝 자리에 세워 두므로, 흐르게 하려면 "어디서 왔나" 를 알아야 한다. 그것을
 * `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene). 그래서 `pop` 은
 * 떠나온 자리 `fromSlot` 을, `push` 는 들어온 차례 `order` 를 함께 싣는다.
 */
export type PushPopTopStep =
  /** 문이 하나뿐임을 두 방향의 갈매기표가 같은 자리에서 숨 쉬어 보인다. */
  | { kind: 'opening' }
  /** 상자가 기록줄에서 문 위로 날아와 아래로 내려가 얹힌다. */
  | { kind: 'push'; order: number; slot: number }
  /** 깔린 값을 꺼내려는 탐침이 꼭대기에서 막혀 되돌아간다. */
  | { kind: 'probe'; slot: number; topSlot: number }
  /** 꼭대기 상자가 솟아 문을 나가 기록줄에 놓인다. */
  | { kind: 'pop'; order: number; fromSlot: number; outIndex: number }
  /** 들어온 차례와 나간 차례를 잇는 활이 하나씩 자라난다. */
  | { kind: 'link' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type PushPopTopCaption =
  | { kind: 'oneOpening' }
  | { kind: 'push'; value: number; top: number }
  | { kind: 'blocked'; value: number; blocker: number }
  | { kind: 'pop'; value: number; top: number }
  | { kind: 'popUnblocked'; value: number; blocker: number }
  | { kind: 'lifo' };

/** 막힘 표식. 걸음 끝에 남으므로 정적으로도 그린다. */
export type PushPopTopBlocked = {
  /** 깔려서 손이 닿지 않는 자리. */
  slot: number;
  /** 막고 선 꼭대기 자리. 띠가 그 윗면에 걸린다. */
  topSlot: number;
};

export type PushPopTopScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 넣을 값들. 인덱스가 곧 들어온 차례이자 상자의 정체다. */
  readonly values: readonly number[];

  // ── 걸어온 자취. `rewind` 가 여기를 거둔다.
  /**
   * 통 안에 쌓인 상자들의 들어온 차례. **바닥부터** 적는다.
   *
   * 인덱스가 곧 통의 자리 번호이고, **길이가 곧 top 지표**다. 이 조각의 주장이
   * "문이 하나" 이므로 넣고 빼는 일이 전부 이 배열의 끝에서만 일어난다.
   */
  readonly stack: readonly number[];
  /** 이미 나간 상자들의 들어온 차례. **나간 차례대로** 적는다. */
  readonly out: readonly number[];
  /** 지금 걸려 있는 막힘 표식. 없으면 `null`. */
  readonly blocked: PushPopTopBlocked | null;
  /** 들어온 차례와 나간 차례를 잇는 활이 그어졌나. **남는다.** */
  readonly linked: boolean;

  readonly step: PushPopTopStep | null;
  readonly caption: PushPopTopCaption | null;
};

/** 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다. */
type PushPopTopBase = Pick<PushPopTopScene, 'values'>;

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다.
 *
 * **걸음이 고치는 것은 바탕에 넣지 않는다.** `stack` · `out` · `blocked` · `linked`
 * 를 바탕으로 묶어 되감기에 넘기면 되감은 화면이 이미 쌓인 채로 서고 그 위에
 * algorithm 이 처음부터 다시 쌓아 두 셈이 어긋난다.
 */
function atStart(base: PushPopTopBase): PushPopTopScene {
  return {
    values: base.values,
    stack: [],
    out: [],
    blocked: null,
    linked: false,
    step: null,
    caption: null,
  };
}

/**
 * 넣을 값들을 셈한다.
 *
 * 값을 **복사해** 담는다. 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한
 * 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readValues(raw: unknown): number[] {
  const d = (raw ?? {}) as { pushes?: unknown };
  return Array.isArray(d.pushes) ? d.pushes.map(num) : [];
}

export const pushPopTopScene: ScenePlan<PushPopTopScene> = {
  /**
   * 첫 장면은 빈 통이다.
   *
   * 상자들은 아직 왼쪽 기록줄에 줄여 놓인 채고 (`stack` 도 `out` 도 비어 있으면
   * 그 뜻이다), 통은 세 면이 닫힌 채 위만 열려 있다.
   */
  initial(initialData: unknown): PushPopTopScene {
    return atStart({ values: readValues(initialData) });
  },

  reduce(scene: PushPopTopScene, event: FacetRuntimeEvent): PushPopTopScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 문제 — 드나드는 자리가 한쪽 끝뿐이다.
      case 'stage-ready':
        return {
          ...scene,
          step: { kind: 'opening' },
          caption: { kind: 'oneOpening' },
        };

      // 장치 — 그 하나뿐인 문으로 넣으면 위로 쌓인다.
      case 'push-enter': {
        const slot = Math.trunc(num(p.slot));
        // 이 조각은 빈 통에서 시작해 한 번씩만 쌓으므로 자리 번호가 곧 들어온
        // 차례다 (algorithm 의 이벤트 표에 그렇게 적혀 있다).
        return {
          ...scene,
          stack: [...scene.stack, slot],
          blocked: null,
          step: { kind: 'push', order: slot, slot },
          caption: { kind: 'push', value: num(p.value), top: Math.trunc(num(p.top)) },
        };
      }

      // 막힘 — 깔린 것에는 손이 닿지 않는다. 띠와 붉은 테두리가 걸음 끝에 남는다.
      case 'probe-blocked': {
        const slot = Math.trunc(num(p.slot));
        const topSlot = Math.trunc(num(p.topSlot));
        return {
          ...scene,
          blocked: { slot, topSlot },
          step: { kind: 'probe', slot, topSlot },
          caption: { kind: 'blocked', value: num(p.value), blocker: num(p.blocker) },
        };
      }

      // 장치 — 나갈 수 있는 것도 꼭대기뿐이다.
      case 'pop-exit': {
        const fromSlot = Math.trunc(num(p.slot));
        const order = scene.stack[scene.stack.length - 1];
        // 쌓인 것이 없으면 걷힐 것도 없다. 장면을 건드리지 않는다.
        if (order === undefined) return scene;
        const outIndex = scene.out.length;
        const blocker = typeof p.blocker === 'number' ? p.blocker : null;
        return {
          ...scene,
          stack: scene.stack.slice(0, -1),
          out: [...scene.out, order],
          blocked: null,
          step: { kind: 'pop', order, fromSlot, outIndex },
          caption:
            blocker === null
              ? { kind: 'pop', value: num(p.value), top: Math.trunc(num(p.top)) }
              : { kind: 'popUnblocked', value: num(p.value), blocker },
        };
      }

      // 결과 — 나간 차례는 들어온 차례를 뒤집은 것이다.
      case 'done':
        return {
          ...scene,
          blocked: null,
          linked: true,
          step: { kind: 'link' },
          caption: { kind: 'lifo' },
        };

      // 손으로 짚기 시작 — 빈 통으로 돌아간다.
      case 'rewind':
        return atStart(scene);

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
