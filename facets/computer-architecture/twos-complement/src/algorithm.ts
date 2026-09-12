/**
 * 2의 보수 — 같은 비트열이 두 가지 수로 읽힌다.
 *
 * ── 주장
 *
 * 비트열은 자기가 무슨 수인지 말해 주지 않는다. 부호 없이 읽으면 한 수이고 2의
 * 보수로 읽으면 다른 수다. 어느 쪽인지 정하는 것은 비트가 아니라 **약속**이고,
 * 그 약속을 바꾸는 손잡이가 비트 폭이다. 폭이 커지면 앞이 0 으로 채워져 같은
 * 비트열의 2의 보수 값이 음수에서 양수로 넘어간다 — 폭은 약속의 일부다.
 *
 * ── 이벤트 (facet 고유, C2)
 *
 * | type            | target    | payload                                                 | silent |
 * | --------------- | --------- | ------------------------------------------------------- | ------ |
 * | `board-set`     | —         | `{ width, widths, patternCount }`                        | 아니다 |
 * | `span-set`      | —         | `{ width, lowest, highest, valueCount, negativeCount }`   | 아니다 |
 * | `bits-laid`     | `index:i` | `{ index, value, width, bits }`                          | 아니다 |
 * | `read-unsigned` | `index:i` | `{ index, value, width, reading, terms }`                | 아니다 |
 * | `read-twos`     | `index:i` | `{ index, value, width, reading, terms }`                | 아니다 |
 * | `done`          | —         | `{ width }`                                              | 아니다 |
 * | `phase`         | —         | `{ phase }`                                              | 그렇다 |
 *
 * `bits[p]` 는 자리 `p` 의 비트다 (`p = 0` 이 맨 아랫자리). `terms` 는 1 인 자리의
 * 무게를 높은 자리부터 늘어놓은 것이며, `read-twos` 쪽은 맨 윗자리의 무게만 음수다 —
 * 화면이 `−8 + 2 + 1 = −5` 를 그대로 적을 수 있게 하려는 것이다.
 *
 * 화면 문안은 하나도 싣지 않는다. 수와 자리만 보내고 문장은 projector 가 짓는다 (C10).
 *
 * ── phase 어휘 (C3 — `irs.ts` 와 집합이 정확히 같다)
 *
 *   'unfold' | 'read-unsigned' | 'read-twos' | 'span'
 *
 * ── 메트릭 (C5 — `facet.ts` 의 선언과 이름이 같다)
 *
 *   'sign-flip-count'  두 약속이 서로 다른 수를 내는 비트열의 개수
 *   'bit-count'        지금 폭에서 늘어놓은 자리의 총수
 *
 * 둘 다 누적 횟수가 아니라 **지금 판의 상태**를 말한다. `ctx.metric` 은 더하기만
 * 하므로 직전에 보인 값과의 차이를 보낸다 (`show`). 손잡이를 밀면 판이 새로 서는데,
 * 누적값이 남으면 배지가 화면과 다른 말을 하게 된다.
 *
 * ── 진행
 *
 * 손잡이가 논증을 지므로 `reactive` 다. 걸음 사이는 `ctx.sleep` 이 잇고 (그 자리에서
 * 멈춤·한 걸음이 먹는다), 한 판을 마치면 `ctx.waitForInput` 으로 손잡이를 기다린다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TwosComplementData = {
  type: string;
  /** 손잡이가 고르는 비트 폭 사다리. */
  widths: number[];
  /** 지금 폭. 손잡이가 이 값을 바꾼다. */
  width: number;
  /**
   * 보여 줄 비트열.
   *
   * 비트열을 직접 적지 않고 **부호 없이 읽은 값**으로 적는다 — 같은 비트열이라도
   * 폭에 따라 앞에 붙는 0 의 수가 달라지므로, 폭에 매이지 않는 쪽을 선언에 둔다.
   */
  patterns: number[];
  /** 걸음 사이의 간격 (ms). */
  stepMs: number;
};

// ── 순수 셈 (ctx 를 받지 않는다, C8 Exception) ────────────────────────────────

/** 자리 `place` 의 비트. 비트 연산 없이 반씩 줄여 꺼낸다 — IR 과 같은 셈이다. */
const bitAt = (value: number, place: number): number => {
  let rest = value;
  for (let left = place; left > 0; left -= 1) rest = Math.floor(rest / 2);
  return rest % 2;
};

/** 값을 폭 `width` 의 비트 배열로 편다. 앞은 0 으로 채워진다. */
const bitsOf = (value: number, width: number): number[] => {
  const out: number[] = [];
  for (let place = 0; place < width; place += 1) out.push(bitAt(value, place));
  return out;
};

/** 부호 없이 읽는다 — 모든 자리의 무게가 양수다. */
const readUnsigned = (bits: number[]): number => {
  let sum = 0;
  for (let place = 0; place < bits.length; place += 1) sum += bits[place] * 2 ** place;
  return sum;
};

/**
 * 2의 보수로 읽는다 — 맨 윗자리의 무게가 `+2^(w−1)` 이 아니라 `−2^(w−1)` 이다.
 *
 * 그 한 자리의 무게만 뒤집으면 되므로, 부호 없이 읽은 값에서 `2^w` 를 한 번 빼는
 * 것과 같다.
 */
const readTwos = (bits: number[], width: number): number =>
  readUnsigned(bits) - bits[width - 1] * 2 ** width;

/** 1 인 자리의 무게를 높은 자리부터 늘어놓는다. `signed` 면 맨 윗자리만 음수다. */
const termsOf = (bits: number[], width: number, signed: boolean): number[] => {
  const out: number[] = [];
  for (let place = width - 1; place >= 0; place -= 1) {
    if (bits[place] !== 1) continue;
    out.push(signed && place === width - 1 ? -(2 ** place) : 2 ** place);
  }
  return out;
};

// ── 알고리즘 ────────────────────────────────────────────────────────────────

export const twosComplementAlgorithm = async (
  ctx: FacetContext<TwosComplementData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<TwosComplementData>;
  const data = ctx.data;

  /** phase 는 걸음의 경계가 아니다 (C3 · C8). 호출부에 이름이 리터럴로 남는다. */
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /**
   * 배지가 늘 지금을 가리키게 한다. `ctx.metric` 은 더하기만 하므로 직전에 보인
   * 값과의 차이를 보낸다. 이름은 호출부에 리터럴로 남는다 (C5).
   */
  const shown: Record<string, number> = {};
  const show = (name: string, target: number): void => {
    const seen = shown[name];
    const delta = target - (seen ?? 0);
    shown[name] = target;
    // 처음 한 번은 값이 0 이어도 보낸다. 안 보내면 그 판에서 계기가 아예 실리지
    // 않아, 선언한 이름이 조용히 빠진 것과 구별되지 않는다.
    if (seen === undefined || delta !== 0) ctx.metric(name, delta);
  };

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  const step = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return rc.sleep(data.stepMs);
  };

  /** 손잡이가 보낸 폭. 사다리에 없는 값은 받지 않는다 (C9). */
  const widthFrom = (input: { type: string; payload?: unknown }): number | null => {
    if (input.type !== 'width') return null;
    const p = input.payload as { value?: unknown } | undefined;
    const picked = typeof p?.value === 'number' ? p.value : Number.NaN;
    if (!Number.isFinite(picked)) return null;
    return data.widths.includes(picked) ? picked : null;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;

      const width = data.width;
      const patterns = data.patterns;

      await ctx.emit({
        type: 'board-set',
        payload: { width, widths: data.widths, patternCount: patterns.length },
      });

      // 이 폭이 담는 범위. 값의 개수와 음수의 개수는 폭 32 에서 int 를 넘으므로
      // 여기서만 셈한다 — IR 은 그 수에 닿지 않는다 (irs.ts 머리 주석).
      await phase('span');
      await ctx.emit({
        type: 'span-set',
        payload: {
          width,
          lowest: -(2 ** (width - 1)),
          highest: 2 ** (width - 1) - 1,
          valueCount: 2 ** width,
          negativeCount: 2 ** (width - 1),
        },
      });

      show('bit-count', width * patterns.length);
      let flips = 0;
      show('sign-flip-count', flips);

      for (let index = 0; index < patterns.length; index += 1) {
        // 이 한 줄이 루프 진입의 취소 검사를 겸한다 (C8).
        if (!(await step())) return;

        const value = patterns[index];
        const bits = bitsOf(value, width);
        const target = `index:${index}`;

        await phase('unfold');
        await ctx.emit({ type: 'bits-laid', target, payload: { index, value, width, bits } });

        if (!(await step())) return;
        const plain = readUnsigned(bits);
        await phase('read-unsigned');
        await ctx.emit({
          type: 'read-unsigned',
          target,
          payload: { index, value, width, reading: plain, terms: termsOf(bits, width, false) },
        });

        if (!(await step())) return;
        const signed = readTwos(bits, width);
        await phase('read-twos');
        await ctx.emit({
          type: 'read-twos',
          target,
          payload: { index, value, width, reading: signed, terms: termsOf(bits, width, true) },
        });

        if (signed !== plain) flips += 1;
        show('sign-flip-count', flips);
      }

      await ctx.emit({ type: 'done', payload: { width } });

      // 손잡이를 밀 때까지 기다린다. 앞뒤로 취소를 본다 — throw 규약에 기대지 않는다 (C8).
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        const next = widthFrom(input);
        if (next === null) continue;
        data.width = next;
        break;
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다.
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다 (C8 정본).
    if (!ctx.cancelled) throw err;
  }
};
