/**
 * sift-down — 하향 재배치.
 *
 * 최소 힙에서 꼭대기를 뺀 뒤, 맨 끝 값을 빈 자리로 올리고, 두 자식 중 앞선
 * (더 작은) 쪽과 견주어 지면 그쪽과 맞바꾸며 한 칸씩 내려간다. 두 자식보다
 * 앞서거나 자식이 없으면 멈춘다.
 *
 * mechanismKind: 'reactive' — mount 시 자동으로 한 번 재생하고, 끝나면
 * advance 입력을 기다려 처음부터 한 걸음씩 짚어 보인다 (S-piece).
 *
 * 이벤트 목록 (facet 고유 확장, 표준 어휘 아님. C2):
 *
 *   extract  payload 없음                                              target: 'index:0'
 *     꼭대기 값을 힙에서 뺀다. 자리가 빈다. silent: false.
 *
 *   fill     { from: number; to: number }                              target: 'index:<to>'
 *     맨 끝 자리(from)의 값을 빈 자리(to)로 옮긴다. from 은 옮기기 전 맨 끝
 *     자리이자 옮긴 뒤의 새 크기와 같다(size === from). silent: false.
 *
 *   compare  { parent: number; left: number; right: number | null; winner: number }
 *                                                                       target: 'index:<parent>'
 *     현재 자리(parent)의 두 자식을 견준다. 자식이 하나뿐이면 right 는 null.
 *     winner 는 더 작은(앞선) 쪽의 자리. silent: false.
 *
 *   swap     { a: number; b: number }                                  target: ['index:<a>', 'index:<b>']
 *     a(부모)와 b(이긴 자식) 자리의 값을 맞바꾼다. silent: false.
 *
 *   settle   { index: number }                                         target: 'index:<index>'
 *     이 자리에서 멈춘다 — 두 자식보다 앞서거나 자식이 없다. silent: false.
 *
 *   rewind   payload 없음, target 없음
 *     자동 재생이 끝난 뒤 첫 advance 입력에서 처음 배치로 되돌린다. silent: false.
 *
 * `done` 은 쓰지 않는다 — 이 조각은 한 번의 추출-하강을 보여주고 advance 로
 * 되풀이하는 반응형이라 "완주" 개념이 없다. 매 회차가 settle 로 끝나고 다음
 * advance 입력을 기다릴 뿐이다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type SiftDownData = {
  type: 'sift-down';
  /** 빼기 전 최소 힙 배열. 0 번이 꼭대기, i 번의 자식은 2i+1, 2i+2. */
  values: number[];
  /** 걸음 사이 간격(ms). */
  stepMs: number;
};

type Step =
  | { kind: 'extract' }
  | { kind: 'fill'; from: number; to: number }
  | { kind: 'compare'; parent: number; left: number; right: number | null; winner: number }
  | { kind: 'swap'; a: number; b: number }
  | { kind: 'settle'; index: number };

/**
 * 실측 배열을 실제로 순회해 걸음을 계산한다. 어느 자식으로 내려가는지는
 * 여기서 값을 견줘 정해지는 결과이지, 미리 적어 둔 표가 아니다.
 */
function computeSteps(values: number[]): Step[] {
  const arr = values.slice();
  const steps: Step[] = [];

  steps.push({ kind: 'extract' });

  const from = arr.length - 1;
  const lastValue = arr[from];
  arr.splice(from, 1);
  arr[0] = lastValue;
  steps.push({ kind: 'fill', from, to: 0 });

  const size = arr.length;
  let i = 0;
  for (;;) {
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    if (left >= size) {
      steps.push({ kind: 'settle', index: i });
      break;
    }
    const rightIdx = right < size ? right : null;
    const winner = rightIdx !== null && arr[rightIdx] < arr[left] ? rightIdx : left;
    steps.push({ kind: 'compare', parent: i, left, right: rightIdx, winner });
    if (arr[i] <= arr[winner]) {
      steps.push({ kind: 'settle', index: i });
      break;
    }
    const tmp = arr[i];
    arr[i] = arr[winner];
    arr[winner] = tmp;
    steps.push({ kind: 'swap', a: i, b: winner });
    i = winner;
  }
  return steps;
}

async function emitStep(ctx: FacetContext<SiftDownData>, step: Step): Promise<void> {
  switch (step.kind) {
    case 'extract':
      await ctx.emit({ type: 'extract', target: 'index:0' });
      return;
    case 'fill':
      await ctx.emit({
        type: 'fill',
        target: `index:${step.to}`,
        payload: { from: step.from, to: step.to },
      });
      return;
    case 'compare':
      await ctx.emit({
        type: 'compare',
        target: `index:${step.parent}`,
        payload: { parent: step.parent, left: step.left, right: step.right, winner: step.winner },
      });
      return;
    case 'swap':
      await ctx.emit({
        type: 'swap',
        target: [`index:${step.a}`, `index:${step.b}`],
        payload: { a: step.a, b: step.b },
      });
      return;
    case 'settle':
      await ctx.emit({
        type: 'settle',
        target: `index:${step.index}`,
        payload: { index: step.index },
      });
      return;
  }
}

/** 취소 검사와 sleep 을 한 번에 (S-piece). */
async function pause(ctx: ReactiveContext<SiftDownData>, ms: number): Promise<boolean> {
  if (ctx.cancelled) return false;
  return ctx.sleep(ms);
}

export async function siftDownAlgorithm(ctx: FacetContext<SiftDownData>): Promise<void> {
  // registerAlgorithm 시그니처는 FacetContext 그대로 받고, mechanismKind:
  // 'reactive' 로 등록되므로 실제로는 ReactiveMechanism 이 주입한 확장
  // 컨텍스트다 (packages/core/src/runtime/context.ts 주석 참조).
  const reactive = ctx as ReactiveContext<SiftDownData>;
  const steps = computeSteps(ctx.data.values);

  // 자동 재생 — mount 직후 처음부터 끝까지 한 번 보여준다.
  for (const step of steps) {
    if (ctx.cancelled) return;
    await emitStep(ctx, step);
    const ok = await pause(reactive, ctx.data.stepMs);
    if (!ok) return;
  }

  // 자동 재생이 끝난 뒤 — advance 로 처음부터 한 걸음씩 짚어 본다.
  let idx = 0;
  for (;;) {
    if (ctx.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await reactive.waitForInput();
    } catch {
      return;
    }
    if (input.type !== 'advance') continue;
    if (idx === 0) {
      // 처음으로 돌아가는 첫 advance — 되감고 첫 걸음까지 같은 누름에서 보인다.
      if (ctx.cancelled) return;
      await ctx.emit({ type: 'rewind' });
    }
    if (ctx.cancelled) return;
    await emitStep(ctx, steps[idx]);
    idx = (idx + 1) % steps.length;
  }
}
