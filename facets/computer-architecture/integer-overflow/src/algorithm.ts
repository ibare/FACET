/**
 * 오버플로 — 자라는 수열이 그릇을 넘는 자리.
 *
 * 주장: 자라는 수열은 언젠가 그릇을 넘는다. **어디서 넘는지가 그릇 크기에 달렸고**,
 * 넘는 순간 값은 크게 틀리는 것이 아니라 **말이 안 되는 것이 된다**. 그리고
 * **아무도 알려 주지 않는다.**
 *
 * ── 메커니즘
 *
 * `reactive` 다. 손잡이(비트 폭 · 수열)가 논증을 지므로 그 입력이 알고리즘까지
 * 닿아야 하는데, `CoroutineMechanism` 은 `supportedControls` 가
 * `['play','pause','step','reset','speed']` 뿐이라 facet 고유 액션을 받지 못한다
 * (러너의 `assertControlsSupported` 가 mount 전에 throw 하고, 통과하더라도
 * `onControl` 의 `default` 에서 조용히 버려진다). 저장소의 segmented-slider facet
 * 서른넷이 모두 reactive 인 것이 같은 까닭이다.
 *
 * ── 이벤트 어휘 (C2)
 *
 * | type            | payload                                   | silent |
 * |-----------------|-------------------------------------------|--------|
 * | `phase`         | `{ phase: string }`                       | true   |
 * | `state-changed` | `{ width, limit, sequence, maxSteps }`    | false  |
 * | `append`        | `{ index: number, value: number }`        | false  |
 * | `mark`          | `{ index, truth, wrapped }`               | false  |
 * | `done`          | `{ survived: number }`                    | false  |
 *
 * `state-changed` 는 한 회차의 시작이다 — projector 는 이것을 받으면 화면을 비운다.
 * `append` 는 그릇에 담긴 항, `mark` 는 넘치는 항 하나다. target 식별자는 쓰지
 * 않는다 (항의 자리는 payload 의 `index` 가 진다).
 *
 * ── phase 어휘 (C3) — `irs.ts` 와 집합이 정확히 같다
 *
 *   'init' | 'check' | 'grow' | 'overflow'
 *
 * ── 메트릭 (C5)
 *
 *   'survived-count'  그릇에 담긴 항의 수. 폭을 올리면 단조로 는다.
 *   'limit-size'      그 폭이 담는 최대값.
 *
 * 둘을 나란히 두는 것이 이 완제품의 논증이다 — 폭 4 → 32 에서 담는 최대값은
 * 7 → 2,147,483,647 로 3억 배가 되는데 팩토리얼이 버티는 걸음은 3 → 12 로
 * 아홉 걸음 늘 뿐이다. 그릇을 키우는 것이 답이 아니라는 것이 여기서 나온다.
 *
 * ── 넘친 뒤의 값
 *
 * 화면에 보이므로 참이어야 한다. 첫 넘침의 순간에는 누산기가 아직 참값을 들고
 * 있으므로, 그 항의 참값을 두의 보수로 감은 것이 실제 기계가 내놓는 값과 같다.
 * (폭 8 의 `6! = 720` → `720 mod 256 = 208` → 부호 있는 해석으로 −48.)
 * 첫 넘침에서 멈추는 까닭이기도 하다 — 그 뒤로는 누산기 자체가 이미 거짓이라
 * 참값을 감는 것으로는 기계를 흉내 낼 수 없다.
 */

import type {
  FacetContext,
  ReactiveContext,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';

export type IntegerOverflowData = {
  type: 'integer-overflow';
  /** 고를 수 있는 비트 폭 사다리. */
  widths: number[];
  /** 지금 고른 폭. */
  width: number;
  /** 고를 수 있는 수열의 식별자. 사람이 읽는 이름은 messages 의 label.* 이다. */
  sequences: string[];
  /** 지금 고른 수열의 식별자. */
  sequence: string;
  /** 한 회차에서 시도하는 걸음의 상한. */
  maxSteps: number;
};

/** 한 걸음의 길이. */
const STEP_MS = 260;

/**
 * 부호 있는 `width` 비트가 담는 최대값 = 2^(width-1) − 1.
 *
 * **2^(width-1) 을 거치지 않는다.** 폭 32 에서 그것은 2,147,483,648 이라 int 를
 * 이미 넘는다. 2^(width-2) 까지만 만들고 `(half − 1) + half` 로 접는다 —
 * `irs.ts` 가 쓰는 짜임과 같다. 여기(TS)는 배정도라 그러지 않아도 되지만, 화면과
 * 코드 패널이 같은 셈을 보이는 편이 읽는 사람에게 정직하다.
 */
export function limitOf(width: number): number {
  let half = 1;
  for (let i = 1; i <= width - 2; i += 1) half *= 2;
  return half - 1 + half;
}

/**
 * 참값을 `width` 비트 두의 보수로 감는다.
 *
 * `bigint` 를 쓰는 까닭은 `13! = 6,227,020,800` 이 2^32 를 넘기 때문이다.
 * 배정도로도 정확히 표현되지만, 나머지 연산을 정수 의미 그대로 두려면 bigint 가
 * 군더더기 없다.
 */
export function wrapSigned(value: bigint, width: number): number {
  const mod = 1n << BigInt(width);
  let r = ((value % mod) + mod) % mod;
  if (r >= mod >> 1n) r -= mod;
  return Number(r);
}

/**
 * 수열의 항을 하나씩 내놓는 발생기. 1 번째 항부터 센다.
 *
 * 피보나치는 `F1 = 1, F2 = 1` 로 센다.
 */
export function makeSequence(id: string): () => bigint {
  if (id === 'fibonacci') {
    let a = 0n;
    let b = 1n;
    return () => {
      const cur = b;
      const nxt = a + b;
      a = b;
      b = nxt;
      return cur;
    };
  }
  let acc = 1n;
  let i = 0n;
  return () => {
    i += 1n;
    acc *= i;
    return acc;
  };
}

/** 한 회차가 어떻게 끝났는가. 취소와 갈림을 boolean 하나로 겹치지 않는다 (C8). */
type Outcome = 'ended' | 'interrupted' | 'cancelled';

export const integerOverflowAlgorithm = async (
  ctx: FacetContext<IntegerOverflowData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<IntegerOverflowData>;

  /**
   * 계기는 더하기로만 갱신된다 (`metric` 이 delta 를 더한다). 회차가 바뀌어도
   * 러너의 reset 이 끼지 않으므로, 지금 보이는 값을 기억해 두고 그 차이를 보낸다.
   * 호출부에는 이름이 리터럴로 남으므로 C5 의 취지가 지켜진다.
   */
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const was = shown.get(name) ?? 0;
    if (value === was) return;
    ctx.metric(name, value - was);
    shown.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 손잡이 입력을 데이터에 반영한다. 모르는 것은 그냥 흘린다. */
  const applyInput = (ev: ReactiveInputEvent): void => {
    const p = ev.payload as { value?: unknown; segmentIndex?: unknown } | undefined;
    if (ev.type === 'width') {
      const v = p?.value;
      if (typeof v === 'number' && ctx.data.widths.includes(v)) ctx.data.width = v;
      return;
    }
    if (ev.type === 'sequence') {
      const idx = p?.segmentIndex;
      if (typeof idx !== 'number') return;
      const id = ctx.data.sequences[idx];
      if (typeof id === 'string') ctx.data.sequence = id;
    }
  };

  async function play(): Promise<Outcome> {
    const width = ctx.data.width;
    const sequence = ctx.data.sequence;
    const maxSteps = ctx.data.maxSteps;
    const limit = limitOf(width);
    const limitBig = BigInt(limit);

    await phase('init');
    if (ctx.cancelled) return 'cancelled';
    await ctx.emit({
      type: 'state-changed',
      payload: { width, limit, sequence, maxSteps },
    });
    setMetric('limit-size', limit);
    setMetric('survived-count', 0);

    const nextTerm = makeSequence(sequence);
    let survived = 0;

    for (let step = 1; step <= maxSteps; step += 1) {
      // 이 루프에는 문(gate)이 없다 — 걸음의 끝에서 `sleep` 이 취소와 멈춤을
      // 함께 지므로, 진입 검사는 여기서 직접 진다 (C8).
      if (ctx.cancelled) return 'cancelled';

      // 손잡이가 회차 도중에 바뀌면 하던 것을 접고 곧바로 다시 그린다.
      const pending = rc.pollInput();
      if (pending !== null) {
        applyInput(pending);
        return 'interrupted';
      }

      const value = nextTerm();
      await phase('check');
      if (ctx.cancelled) return 'cancelled';

      if (value > limitBig) {
        await phase('overflow');
        await ctx.emit({
          type: 'mark',
          payload: {
            index: step,
            truth: Number(value),
            wrapped: wrapSigned(value, width),
          },
        });
        await ctx.emit({ type: 'done', payload: { survived } });
        return 'ended';
      }

      await phase('grow');
      survived += 1;
      setMetric('survived-count', survived);
      await ctx.emit({ type: 'append', payload: { index: step, value: Number(value) } });

      if (!(await rc.sleep(STEP_MS))) return 'cancelled';
    }

    await ctx.emit({ type: 'done', payload: { survived } });
    return 'ended';
  }

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const outcome = await play();
      if (outcome === 'cancelled') return;
      // 손잡이가 바뀐 것이면 기다리지 않고 바로 다시 그린다.
      if (outcome === 'interrupted') continue;
      const input = await rc.waitForInput();
      if (ctx.cancelled) return;
      applyInput(input);
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
