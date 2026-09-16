/**
 * circularBufferWrap 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신하되 stage 의 메서드를 부르지 않고 다음 장면을 돌려준다.
 * 그래서 어느 걸음의 화면이든 셈으로 얻는다 (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 무엇을 상태로 쥐는가
 *
 * 옛 방식에서는 **화면이 통째로 상태였다.** projector 는 처음 배치의 그림자 사본
 * 하나만 쥐었고, 지금 어느 칸이 차 있고 head / tail 이 어디인지는 오직 DOM 에만
 * 있었다 — 값은 `text.textContent`, 표식의 자리는 `g` 의 `transform`, 걸음의 셈은
 * 수식 줄의 문자열. 실제로 `calmSlot` 은 칸이 찼는지를 **화면을 되읽어**
 * (`cell.value.textContent !== ''`) 판정했다. 되감아 세운 직후에는 그 값이 아직 옛
 * 화면의 것이라 셈이 틀어지는 자리다 (프로토콜 3-1 ④).
 *
 * ── 머리와 꼬리가 몇 바퀴째인가
 *
 * 이 조각에서 가장 숨기 쉬운 것이다. **칸 번호 둘만 쥐면 한 바퀴 돈 것과 안 돈 것이
 * 구별되지 않는다** — `head = 3, tail = 0` 은 두 칸이 찬 것일 수도, 일곱 칸이 찬
 * 것일 수도 있다. 그 차이를 세우는 것은 바퀴 수가 아니라 **칸의 내용**이다. 그래서
 * 장면은 `head` / `tail` 과 함께 `slots` 를 통째로 쥔다.
 *
 * 거꾸로 **바퀴 수를 장면에 담으면 안 된다.** 트랙은 닫힌 고리이고 그리는 쪽이
 * 자리를 둘레로 접어 셈하므로, 같은 칸을 가리키는 두 장면이 바퀴 수만큼 달라지면
 * 똑같은 그림이 서로 다른 장면이 된다. 감김은 **자리**가 아니라 **걸음**의 성질이라
 * `step.wrapped` 가 말한다.
 *
 * ── 머무는 것과 지나가는 것
 *
 *   머무는 것  `slots` · `head` · `tail`   — 걸어 온 자취
 *              `rule`                      — 수식 줄. 걸음이 끝나도 남고 `done` 에서도 남는다
 *   지나가는 것 `step`                      — 방금 밟은 걸음. 무엇을 흐르게 할지 고르는 데만 쓴다
 *
 * `rule` 과 `step` 이 겹쳐 보이지만 사는 길이가 다르다. `done` 은 수식을 그대로 두고
 * 캡션만 바꾸므로, 둘을 하나로 묶으면 `done` 에서 앞 걸음의 운동이 다시 흐른다.
 *
 * ── 바탕과 자취를 가른다
 *
 * `start` 만이 바탕이다. `slots` · `head` · `tail` 은 걸음이 고치는 자취이므로
 * `rewind` 가 그것들을 그대로 넘기면 되감은 화면에 이미 다 굴러간 배치가 선다.
 * `rewind` 는 `start` 에서 처음 장면을 **다시 셈한다** (S-scene · 프로토콜 4 절).
 *
 * 좌표는 담지 않는다 — 칸 번호가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10). 수식의 `(i + 1) % n` 은 문안이 아니라 표식이라 수만
 * 담는다 (C10 판정 3).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 표식 둘. 빼는 쪽과 넣는 쪽. */
export type BufferPointer = 'head' | 'tail';

/** 칸의 내용. `null` 은 빈 자리. 길이가 곧 칸 수이며 실행 중 늘어나지 않는다. */
export type BufferSlots = (number | null)[];

/** 버퍼의 한 순간 — 칸의 내용과 두 표식의 자리. */
export type BufferState = {
  slots: BufferSlots;
  head: number;
  tail: number;
};

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `from` 을 싣는 것이 중요하다. 끝 칸에서 첫 칸으로 **건너뛰는 운동**은 출발 그림이
 * 있어야 그릴 수 있는데, 정적 그리기는 이미 표식을 `to` 에 세워 둔 뒤다. `prev` 를
 * 들추면 "`prev` 는 고르는 데만" 을 어기므로 계기값을 걸음이 싣는다 (S-scene).
 */
export type BufferStep = {
  /** `put` 은 tail 이 값을 앉히는 걸음, `take` 는 head 가 값을 내보내는 걸음. */
  kind: 'put' | 'take';
  value: number;
  /** 값이 앉거나 떠난 칸. */
  slot: number;
  /** 표식이 떠난 자리. */
  from: number;
  /** 표식이 닿은 자리. */
  to: number;
  /** `to` 가 `from + 1` 이 아니라 감겨서 온 자리인가. */
  wrapped: boolean;
};

/**
 * 수식 줄이 말하는 것. 걸음이 끝나도 남는다.
 *
 * `null` 이면 걸음별 셈 대신 `(i + 1) % n` 이라는 규칙 자체를 조용히 보인다.
 */
export type BufferRule = { pointer: BufferPointer; from: number; to: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type BufferCaption =
  | { kind: 'start'; count: number; head: number; tail: number }
  | { kind: 'put'; value: number; slot: number; to: number }
  | { kind: 'take'; slot: number; value: number; to: number }
  | { kind: 'takeWrap'; slot: number; to: number }
  | { kind: 'done'; count: number };

export type CircularBufferWrapScene = {
  /**
   * 처음 배치. 걸음이 고치지 않는 **바탕**이고 `rewind` 가 여기서 다시 셈한다.
   *
   * 아무도 고치지 않으므로 장면끼리 그대로 나눠 쓴다 (S-scene Exception).
   */
  start: BufferState;
  /** 지금 칸의 내용. 두 표식이 몇 바퀴 어긋나 있는지를 말하는 것이 이것이다. */
  slots: BufferSlots;
  /** 다음 뺄 자리. */
  head: number;
  /** 다음 넣을 자리. */
  tail: number;
  step: BufferStep | null;
  rule: BufferRule | null;
  caption: BufferCaption | null;
};

const EMPTY_START: BufferState = { slots: [], head: 0, tail: 0 };

/**
 * unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).
 *
 * **값을 복사한다.** 러너가 주는 `initialData` 는 mechanism 과 view 가 함께 쓰는 한
 * 객체라, 참조를 쥐면 되짚을 때 이미 다 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readStart(raw: unknown): BufferState {
  const p = raw as { slots?: unknown; head?: unknown; tail?: unknown } | undefined;
  if (!Array.isArray(p?.slots)) return EMPTY_START;
  if (typeof p.head !== 'number' || typeof p.tail !== 'number') return EMPTY_START;
  const slots: BufferSlots = [];
  for (const v of p.slots) slots.push(typeof v === 'number' ? v : null);
  return { slots, head: p.head, tail: p.tail };
}

type RawMove = { value: number; slot: number; from: number; to: number; wrapped: boolean };

function readMove(raw: unknown): RawMove | null {
  const p = raw as
    | { value?: unknown; slot?: unknown; from?: unknown; to?: unknown; wrapped?: unknown }
    | undefined;
  if (typeof p?.value !== 'number' || typeof p.slot !== 'number') return null;
  if (typeof p.from !== 'number' || typeof p.to !== 'number') return null;
  return { value: p.value, slot: p.slot, from: p.from, to: p.to, wrapped: p.wrapped === true };
}

/** 처음 배치로 되돌린 장면. `initial` 과 `rewind` 가 같은 길로 간다. */
function atStart(start: BufferState): CircularBufferWrapScene {
  const count = start.slots.length;
  return {
    start,
    // 자취는 바탕에서 새로 뜬다 — 바탕 배열을 그대로 넘기면 나중 걸음이 그것을 고친다.
    slots: [...start.slots],
    head: start.head,
    tail: start.tail,
    step: null,
    rule: null,
    caption: count > 0 ? { kind: 'start', count, head: start.head, tail: start.tail } : null,
  };
}

export const circularBufferWrapScene: ScenePlan<CircularBufferWrapScene> = {
  /**
   * 첫 장면은 `initialData` 가 곧바로 정한다.
   *
   * 이 algorithm 은 처음 배치를 emit 하지 않는다 — 옛 projector 의 `onInit` 이 그리던
   * 자리다. 그러니 여기서 읽되 **값만 복사해** 쥔다.
   */
  initial(initialData: unknown): CircularBufferWrapScene {
    return atStart(readStart(initialData));
  },

  reduce(
    scene: CircularBufferWrapScene,
    event: FacetRuntimeEvent,
  ): CircularBufferWrapScene {
    switch (event.type) {
      case 'enqueue': {
        const m = readMove(event.payload);
        if (!m || m.slot < 0 || m.slot >= scene.slots.length) return scene;
        const slots = [...scene.slots];
        slots[m.slot] = m.value;
        return {
          ...scene,
          slots,
          tail: m.to,
          step: { kind: 'put', ...m },
          rule: { pointer: 'tail', from: m.from, to: m.to },
          caption: { kind: 'put', value: m.value, slot: m.slot, to: m.to },
        };
      }

      case 'dequeue': {
        const m = readMove(event.payload);
        if (!m || m.slot < 0 || m.slot >= scene.slots.length) return scene;
        const slots = [...scene.slots];
        slots[m.slot] = null;
        return {
          ...scene,
          slots,
          head: m.to,
          step: { kind: 'take', ...m },
          rule: { pointer: 'head', from: m.from, to: m.to },
          // 감기는 걸음은 운동이 같고 할 말만 다르다.
          caption: m.wrapped
            ? { kind: 'takeWrap', slot: m.slot, to: m.to }
            : { kind: 'take', slot: m.slot, value: m.value, to: m.to },
        };
      }

      /**
       * 손으로 짚어 보기가 처음으로 되감는다.
       *
       * 칸의 내용과 두 표식은 **걸음이 고치는 자취**다. 바탕인 척 넘기면 되감은
       * 화면에 이미 다 굴러간 배치가 선다 (프로토콜 4 절 마지막 함정).
       */
      case 'rewind':
        return atStart(scene.start);

      // 할 말을 마치고 결론만 말한다. 수식 줄은 마지막 걸음의 셈을 그대로 둔다.
      case 'done':
        return {
          ...scene,
          step: null,
          caption: { kind: 'done', count: scene.start.slots.length },
        };

      // 이 algorithm 은 위 넷만 발신한다. 그 밖의 것은 조용히 버린다 (C2).
      default:
        return scene;
    }
  },
};
