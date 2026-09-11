/**
 * constant-fades — 상수 배수는 만나는 자리를 미룰 뿐 결과를 뒤집지 못한다.
 *
 * 답하는 질문 하나: **상수 배수를 왜 지우는가.**
 *
 * 100·n 과 n² 를 견준다. 작은 n 에서는 100·n 이 압도적으로 크고, 어느 한 자리에서
 * 정확히 만나고, 그 뒤로는 n² 가 영영 앞선다. 상수를 열 배로 키워도 만나는 자리가
 * 한 눈금 오른쪽으로 밀릴 뿐이다 — 그래서 상수를 지운다.
 *
 * **1차 데이터는 상수 하나 · 배율 하나 · 두 식의 차수뿐이다.** 만나는 자리도, 짚어
 * 볼 n 도, 눈금 자리도 전부 여기서 셈한다. 사다리를 선언에 옮겨 적으면 선언의
 * 오타가 그대로 화면에 뜬다.
 *
 * 발신 이벤트 (facet 고유 확장 — C2):
 *   axis            { ticks: number[] }
 *                     n 의 눈금 자리. 오름차순이며 첫 값이 1, 끝 값이 축의 끝이다.
 *   probe           { n, coefficient, linear, quad, lead, ratio }
 *                     한 자리에서 두 값을 짚는다. lead 는 'linear' | 'quad' | 'tie',
 *                     ratio 는 큰 쪽을 작은 쪽으로 나눈 값 (tie 면 1).
 *   boundary        { coefficient, meeting, value }
 *                     경계 기둥을 세운다. value 는 그 자리에서 두 식이 함께 갖는 값.
 *   boundary-move   { coefficient, meeting, value, previous }
 *                     상수를 바꿔 기둥을 옮긴다. previous 는 직전 기둥이 서 있던 n.
 *   spacing         { factor, marks: { coefficient, meeting }[] }
 *                     기둥 셋 사이의 간격을 잰다. marks 는 n 오름차순.
 *   constant-erased (payload 없음)
 *                     상수를 지운다. 셋이 한 말이 된다.
 *   rewind          (payload 없음)
 *                     되감는다. advance 로 다시 볼 때 첫 걸음 앞에 온다.
 *
 * 전부 silent 가 아니다 — 걸음마다 화면이 실제로 움직인다.
 * 조각이므로 `ctx.metric` 은 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type ConstantFadesData = {
  type: 'constant-fades';
  /** 1차식에 붙은 상수 배수. 이 조각이 견주는 두 식은 constant·n 과 n² 다. */
  constant: number;
  /** 상수를 바꿔 볼 때의 배율. 이 배수로 줄이고 키운다. 눈금도 이 배수로 벌어진다. */
  factor: number;
  /** 상수가 붙은 쪽의 차수. */
  linearDegree: number;
  /** 상수가 없는 쪽의 차수. */
  quadraticDegree: number;
  /** 걸음 사이에 쉬는 시간. 읽을 틈을 주는 것은 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

/** 어느 쪽이 큰가. 'tie' 는 두 값이 정확히 같은 자리다. */
type Lead = 'linear' | 'quad' | 'tie';

/**
 * 걸음과 걸음 사이의 문. 자동 재생은 `ctx.sleep`, 한 걸음씩 짚을 때는 `advance`.
 * false 를 돌려주면 취소된 것이다.
 */
type Gate = () => Promise<boolean>;

function linearAt(d: ConstantFadesData, coefficient: number, n: number): number {
  return coefficient * n ** d.linearDegree;
}

function quadAt(d: ConstantFadesData, n: number): number {
  return n ** d.quadraticDegree;
}

/**
 * 두 식이 만나는 자리를 그 자리에서 찾는다.
 *
 * 닫힌 꼴(차수가 1 과 2 면 n = 상수)을 적어 두지 않는 것은 차수를 데이터로 받기
 * 때문이다 — 차수가 바뀌면 답도 바뀌어야 하고, 그때 적어 둔 꼴은 조용히 거짓이 된다.
 */
function meetingOf(d: ConstantFadesData, coefficient: number): number {
  const cap = Math.max(2, Math.ceil(coefficient * d.factor));
  for (let n = 2; n <= cap; n += 1) {
    if (quadAt(d, n) >= linearAt(d, coefficient, n)) return n;
  }
  return cap;
}

/** 눈금은 배율을 거듭 곱해 얻는다. 1 부터 가장 먼 기둥의 한 눈금 바깥까지. */
function ticksUpTo(d: ConstantFadesData, farthest: number): number[] {
  if (d.factor <= 1) return [1];
  const topmost = farthest * d.factor;
  const out: number[] = [];
  for (let v = 1; v <= topmost; v *= d.factor) out.push(v);
  return out;
}

/** 한 자리를 짚어 두 값을 함께 낸다. */
async function probeAt(
  ctx: ReactiveContext<ConstantFadesData>,
  d: ConstantFadesData,
  coefficient: number,
  n: number,
): Promise<void> {
  const linear = linearAt(d, coefficient, n);
  const quad = quadAt(d, n);
  const lead: Lead = linear === quad ? 'tie' : linear > quad ? 'linear' : 'quad';
  const ratio = lead === 'tie' ? 1 : Math.max(linear, quad) / Math.min(linear, quad);
  await ctx.emit({ type: 'probe', payload: { n, coefficient, linear, quad, lead, ratio } });
}

/**
 * 논증 한 벌. 문제(작은 n 에서는 상수가 이긴다) → 장치(만나는 자리에 기둥을 세운다)
 * → 결과(상수를 바꿔도 기둥이 옮겨 앉을 뿐이다) 순으로 간다.
 *
 * 걸음의 문은 **emit 뒤**에 둔다. 마운트 직후의 첫 걸음은 기다릴 앞걸음이 없으므로
 * 문을 지나지 않는다 (S-piece).
 */
async function sequence(
  ctx: ReactiveContext<ConstantFadesData>,
  d: ConstantFadesData,
  gate: Gate,
): Promise<boolean> {
  const base = d.constant;
  const smaller = Math.round(base / d.factor);
  const larger = Math.round(base * d.factor);

  const meetBase = meetingOf(d, base);
  const meetSmall = meetingOf(d, smaller);
  const meetLarge = meetingOf(d, larger);

  await ctx.emit({
    type: 'axis',
    payload: { ticks: ticksUpTo(d, Math.max(meetBase, meetSmall, meetLarge)) },
  });
  if (!(await gate())) return false;

  // 짚어 볼 자리는 만나는 자리가 정한다 — 그 한 눈금 앞, 만나는 자리, 한 눈금 뒤.
  await probeAt(ctx, d, base, Math.round(meetBase / d.factor));
  if (!(await gate())) return false;

  await probeAt(ctx, d, base, meetBase);
  if (!(await gate())) return false;

  await probeAt(ctx, d, base, Math.round(meetBase * d.factor));
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'boundary',
    payload: { coefficient: base, meeting: meetBase, value: linearAt(d, base, meetBase) },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'boundary-move',
    payload: {
      coefficient: smaller,
      meeting: meetSmall,
      value: linearAt(d, smaller, meetSmall),
      previous: meetBase,
    },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'boundary-move',
    payload: {
      coefficient: larger,
      meeting: meetLarge,
      value: linearAt(d, larger, meetLarge),
      previous: meetSmall,
    },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'spacing',
    payload: {
      factor: d.factor,
      marks: [
        { coefficient: smaller, meeting: meetSmall },
        { coefficient: base, meeting: meetBase },
        { coefficient: larger, meeting: meetLarge },
      ],
    },
  });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'constant-erased' });
  // 마지막 걸음 뒤에는 문을 두지 않는다. 자동 재생은 여기서 멎고 화면이 그대로
  // 남으므로 읽을 틈이 따로 필요하지 않고, 한 걸음씩 짚는 길에서는 이 자리의 문이
  // 아무 일도 일어나지 않는 헛누름이 된다.
  return true;
}

/** 다음 `advance` 를 기다린다. 취소로 깨어났으면 false. */
async function nextAdvance(ctx: ReactiveContext<ConstantFadesData>): Promise<boolean> {
  for (;;) {
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
      if (!ctx.cancelled) throw err;
      return false;
    }
    if (ctx.cancelled) return false;
    // 받은 것의 종류를 본다 — 위젯 입력이 붙는 날 걸음으로 잘못 세지 않도록 (S-piece).
    if (input.type === 'advance') return true;
  }
}

export async function constantFades(ctx: FacetContext<ConstantFadesData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ConstantFadesData>;
  const d = rctx.data;

  // 자동 재생. 아무것도 누르지 않아도 조각은 할 말을 마친다.
  if (!(await sequence(rctx, d, () => rctx.sleep(d.stepMs)))) return;

  // 끝난 뒤 — 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 짚는다. 처음 누르는 advance 는
  // 되감고 **첫 걸음까지** 간다 (S-piece).
  for (;;) {
    if (!(await nextAdvance(rctx))) return;
    if (rctx.cancelled) return;
    await rctx.emit({ type: 'rewind' });
    if (!(await sequence(rctx, d, () => nextAdvance(rctx)))) return;
  }
}
