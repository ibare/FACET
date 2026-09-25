/**
 * 순수와 차례 — 같은 셈 `change(slot, mul, add)` 의 부르기 셋을 차례만 바꿔 부른다.
 *
 * 받은 목록을 **고치는** 쪽(`changeInPlace`)은 부르는 차례에 따라 각 부르기가 돌려주는 합이 갈리고,
 * **사본에 쓰는** 쪽(`changeCopy`)은 어느 차례로 불러도 같은 합을 돌려준다. 한 판은 손잡이의 차례로
 * 부르기 셋을 끝까지 부르고, 끝의 원본을 보인 뒤 입력을 기다린다.
 *
 * 셈 (IR 의 `runCalls` 와 같다):
 *   xs[slot] = xs[slot] * mul + add, 그리고 바뀐 목록의 합을 돌려준다.
 *   고치기는 원본 xs 에 쓰고, 새로 만들기는 원본을 사본 fresh 에 베낀 뒤 사본에 쓴다.
 *   판마다 원본은 initialData.cart 에서 새로 시작한다.
 *   동률 규칙 — 견주는 자리가 없다(정수 합을 그대로 보인다). 이 데이터에서 걸리는 동률 없음.
 *
 * 손잡이 (reactive — `waitForInput` 로 받는다):
 *   order  value = initialData.orders 의 색인 (0..5). 부르기 번호의 차례
 *   mode   value ∈ initialData.modes (0 고치기 · 1 새로 만들기)
 *   value 가 number 가 아니거나 사다리 밖이면 던진다. 우리 것이 아닌 입력은 흘린다.
 *
 * 이벤트 (silent 가 아니면 모두 걸음 경계 `sleep(stepMs)` 가 뒤따른다. 판의 마지막 걸음 뒤 경계는 입력 대기):
 *   round  { order: number[]; orderLabel: string; copyMode: boolean; values: number[]; peak: number;
 *            calls: { name: string; slot: number; mul: number; add: number }[] }
 *          판의 시작 — 원본을 cart 로 되돌리고 상자 셋을 이 판의 차례로 세운다. peak 는 모든 차례 ·
 *          모든 다루는 법에서 목록 칸이 닿는 가장 큰 값 (막대 눈금용)
 *   call   { call: number; name: string; position: number; copyMode: boolean }
 *          call 은 부르기 번호(0..), position 은 이 판에서 몇 번째 부르기인지(0..)
 *   copy   { call: number; values: number[] }       새로 만들기에서만 — 원본을 베낀 사본
 *   write  { call: number; slot: number; before: number; after: number; values: number[]; copyMode: boolean }
 *          values 는 쓰기 뒤 그 목록(고치기면 원본, 새로 만들기면 사본)
 *   sum    { call: number; name: string; sum: number }   그 부르기가 돌려준 합
 *   done   { values: number[]; sum: number }             끝의 원본과 그 합 (`return total(xs)`)
 *   phase  { phase } — silent
 *
 * phase 어휘 (irs.ts 와 정확히 같다): call · copy · write-in-place · write-copy · sum · result
 *   write-in-place 는 고치기의 쓰기(changeInPlace), write-copy 는 사본에 쓰기(changeCopy),
 *   sum 은 부르기마다 돌려주는 합(total), result 는 판 끝의 `return total(xs)`.
 *   round 는 phase 없이 시작한다 (projector 가 코드 패널을 비운다).
 *
 * 계기 (그 판 하나의 값 — 판이 바뀌는 자리에서 차이로 0 으로 되돌린다):
 *   writes-to-original  원본 칸에 쓴 횟수 (고치기 3 · 새로 0)
 *   copies              만든 사본 수 (고치기 0 · 새로 3)
 *   original-sum        지금 원본의 합 (판 끝 — 고치기 50 또는 35 · 새로 11)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PureFunctionCall = { name: string; slot: number; mul: number; add: number };

export type PureFunctionData = {
  type: 'pure-function';
  stepMs: number;
  cart: number[];
  calls: PureFunctionCall[];
  orders: number[][];
  modes: number[];
};

type MetricName = 'writes-to-original' | 'copies' | 'original-sum';

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** 데이터 모양을 확인한다. 셈할 수 없는 모양은 조용히 지나치지 않고 던진다 (C6). */
function checkData(d: PureFunctionData): void {
  if (!Array.isArray(d.cart) || d.cart.length === 0 || !d.cart.every(isInt)) {
    throw new Error('pure-function: cart must be a non-empty list of integers');
  }
  if (!Array.isArray(d.calls) || d.calls.length === 0) {
    throw new Error('pure-function: calls must be a non-empty list');
  }
  for (const c of d.calls) {
    if (!isInt(c.slot) || c.slot < 0 || c.slot >= d.cart.length) {
      throw new Error(`pure-function: slot out of range in call ${String(c.name)}`);
    }
    if (!isInt(c.mul) || !isInt(c.add)) {
      throw new Error(`pure-function: mul and add must be integers in call ${String(c.name)}`);
    }
  }
  if (!Array.isArray(d.orders) || d.orders.length === 0) {
    throw new Error('pure-function: orders must be a non-empty list');
  }
  for (const o of d.orders) {
    if (!Array.isArray(o) || o.length !== d.calls.length) {
      throw new Error('pure-function: every order must name each call once');
    }
    const seen = new Set<number>();
    for (const k of o) {
      if (!isInt(k) || k < 0 || k >= d.calls.length || seen.has(k)) {
        throw new Error(`pure-function: bad call number ${String(k)} in order`);
      }
      seen.add(k);
    }
  }
  if (!Array.isArray(d.modes) || d.modes.length === 0 || !d.modes.every((m) => m === 0 || m === 1)) {
    throw new Error('pure-function: modes must be a non-empty list of 0 and 1');
  }
}

function total(xs: readonly number[]): number {
  let acc = 0;
  for (const x of xs) acc += x;
  return acc;
}

/** 모든 차례 · 모든 다루는 법에서 목록 칸이 닿는 가장 큰 값. 막대 눈금을 판마다 바꾸지 않으려고 셈한다. */
function peakOf(d: PureFunctionData): number {
  let peak = Math.max(...d.cart);
  for (const o of d.orders) {
    for (const copyMode of [false, true]) {
      const xs = [...d.cart];
      for (const k of o) {
        const c = d.calls[k]!;
        const buf = copyMode ? [...xs] : xs;
        buf[c.slot] = buf[c.slot]! * c.mul + c.add;
        peak = Math.max(peak, buf[c.slot]!);
      }
    }
  }
  return peak;
}

export async function pureFunctionAlgorithm(
  context: FacetContext<PureFunctionData>,
): Promise<void> {
  const ctx = context as ReactiveContext<PureFunctionData>;
  const d = ctx.data;
  checkData(d);

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => ctx.sleep(d.stepMs);

  // 계기는 누적 채널이라 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<MetricName, number>();
  const setMetric = (name: MetricName, value: number) => {
    const before = shown.get(name);
    if (before === undefined || before !== value) {
      ctx.metric(name, value - (before ?? 0));
      shown.set(name, value);
    }
  };

  const peak = peakOf(d);
  let orderIndex = 0;
  const firstMode = d.modes[0];
  if (firstMode === undefined) throw new Error('pure-function: modes must not be empty');
  let mode = firstMode;

  /** 한 판. 끝까지 돌면 true, 취소되면 false. */
  const playRound = async (): Promise<boolean> => {
    const order = d.orders[orderIndex];
    if (order === undefined) throw new Error(`pure-function: order ${orderIndex} is off the ladder`);
    const copyMode = mode === 1;
    const xs = [...d.cart];
    const fresh = new Array<number>(xs.length).fill(0);
    if (fresh.length !== xs.length) throw new Error('pure-function: copy buffer length mismatch');

    let writes = 0;
    let copies = 0;
    setMetric('writes-to-original', 0);
    setMetric('copies', 0);
    setMetric('original-sum', total(xs));

    await ctx.emit({
      type: 'round',
      payload: {
        order: [...order],
        orderLabel: order.map((k) => d.calls[k]!.name).join(''),
        copyMode,
        values: [...xs],
        peak,
        calls: d.calls.map((c) => ({ name: c.name, slot: c.slot, mul: c.mul, add: c.add })),
      },
    });
    if (!(await pause())) return false;

    for (let position = 0; position < order.length; position += 1) {
      if (ctx.cancelled) return false;
      const k = order[position]!;
      const c = d.calls[k];
      if (c === undefined) throw new Error(`pure-function: call number ${k} out of range`);

      await phase('call');
      await ctx.emit({ type: 'call', payload: { call: k, name: c.name, position, copyMode } });
      if (!(await pause())) return false;

      let target = xs;
      if (copyMode) {
        for (let i = 0; i < xs.length; i += 1) fresh[i] = xs[i]!;
        target = fresh;
        copies += 1;
        setMetric('copies', copies);
        await phase('copy');
        await ctx.emit({ type: 'copy', payload: { call: k, values: [...fresh] } });
        if (!(await pause())) return false;
      }

      if (c.slot < 0 || c.slot >= target.length) {
        throw new Error(`pure-function: slot ${c.slot} out of range`);
      }
      const before = target[c.slot]!;
      const after = before * c.mul + c.add;
      target[c.slot] = after;
      if (!copyMode) {
        writes += 1;
        setMetric('writes-to-original', writes);
        setMetric('original-sum', total(xs));
      }
      if (copyMode) await phase('write-copy');
      else await phase('write-in-place');
      await ctx.emit({
        type: 'write',
        payload: { call: k, slot: c.slot, before, after, values: [...target], copyMode },
      });
      if (!(await pause())) return false;

      const sum = total(target);
      await phase('sum');
      await ctx.emit({ type: 'sum', payload: { call: k, name: c.name, sum } });
      if (!(await pause())) return false;
    }

    if (ctx.cancelled) return false;
    await phase('result');
    await ctx.emit({ type: 'done', payload: { values: [...xs], sum: total(xs) } });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;

      // 한 판을 끝냈다 — 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const type = input.type;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>).value
            : undefined;
        if (type === 'order') {
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= d.orders.length) {
            throw new Error(`pure-function: order ${String(value)} is off the ladder`);
          }
          orderIndex = value;
          break;
        }
        if (type === 'mode') {
          if (typeof value !== 'number' || !d.modes.includes(value)) {
            throw new Error(`pure-function: mode ${String(value)} is off the ladder`);
          }
          mode = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
