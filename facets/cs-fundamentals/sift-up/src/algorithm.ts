/**
 * siftUp — 상향 재배치 조각(piece) 알고리즘.
 *
 * 최소 힙에 값을 하나 넣고, 그 값이 맨 끝자리에서 시작해 부모와 견주며 한
 * 칸씩 올라가다 **자기 자리를 찾으면 멈추는** 과정을 배열로 계산해 걸음마다
 * 발신한다. 꼭대기까지 가는 것이 목적이 아니라 멈추는 지점이 계산의 결과다.
 *
 * ── 이벤트 어휘 (C2) ──────────────────────────────────────────────────
 *
 *   'insert'   payload: { index: number; value: number }
 *              새 값이 맨 끝자리(배열의 마지막 인덱스)에 앉는다. silent: false.
 *
 *   'compare'  payload: {
 *                childIndex: number; parentIndex: number;
 *                childValue: number; parentValue: number;
 *                precedes: boolean;   // 자식이 부모보다 앞서는가 (교환 여부)
 *              }
 *              target: ['index:<childIndex>', 'index:<parentIndex>']
 *              지금 자리와 부모 자리를 견준다. silent: false.
 *
 *   'swap'     payload: { childIndex: number; parentIndex: number }
 *              target: ['index:<childIndex>', 'index:<parentIndex>']
 *              두 자리의 값이 실제로 자리를 맞바꾼다 (childIndex 의 값이 위로,
 *              parentIndex 의 값이 아래로). silent: false.
 *
 *   'settle'   payload: { index: number }
 *              더 앞서지 못하는 부모를 만나 멈춘 자리. silent: false.
 *
 *   'rewind'   payload 없음.
 *              advance 컨트롤을 자동 재생이 끝난 뒤 처음 누르면, 삽입 이전
 *              상태로 화면을 되돌린 뒤 곧바로 첫 걸음(insert)을 보인다.
 *              visual reset 이 실제로 일어나므로 silent 아님 (C2).
 *
 * ── 진행 ──────────────────────────────────────────────────────────────
 *
 * mechanismKind: 'reactive'. mount 되면 스스로 걸음을 계산해 `initialData.stepMs`
 * 간격으로 자동 재생한다. 자동 재생이 끝나면 `waitForInput` 루프로 들어가
 * `advance` 입력마다 다음 걸음을 하나씩 보인다 — 끝까지 보였으면 다음 누름은
 * 되감아(rewind) 처음부터 다시 짚는다 (S-piece).
 */

import type { FacetContext } from '@ffacet/core/runtime';
import type { ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type SiftUpData = {
  type: 'sift-up';
  /** 넣기 전 힙 배열 (0 번이 꼭대기, i 번의 부모는 ⌊(i-1)/2⌋ 번). */
  values: number[];
  /** 맨 끝자리에 새로 넣는 값. */
  insertValue: number;
  /** 걸음 사이 자동 재생 간격 (ms). */
  stepMs: number;
};

type DomainStep = () => Promise<void>;

/**
 * 데이터를 실제로 시뮬레이션해 걸음을 계산한다 — 표에 적어 둔 값이 아니라
 * `values`/`insertValue` 를 그대로 밀어 넣어 나온 결과다.
 */
function buildSteps(ctx: FacetContext<SiftUpData>, values: number[], insertValue: number): DomainStep[] {
  const arr = values.slice();
  const insertIndex = arr.length;
  arr.push(insertValue);

  const steps: DomainStep[] = [
    async () => {
      await ctx.emit({
        type: 'insert',
        target: `index:${insertIndex}`,
        payload: { index: insertIndex, value: insertValue },
      });
    },
  ];

  let cursor = insertIndex;
  let settledIndex = insertIndex;
  while (cursor > 0) {
    const parentIndex = Math.floor((cursor - 1) / 2);
    const childIndex = cursor;
    const childValue = arr[childIndex]!;
    const parentValue = arr[parentIndex]!;
    const precedes = childValue < parentValue;

    steps.push(async () => {
      await ctx.emit({
        type: 'compare',
        target: [`index:${childIndex}`, `index:${parentIndex}`],
        payload: { childIndex, parentIndex, childValue, parentValue, precedes },
      });
    });

    if (!precedes) {
      settledIndex = childIndex;
      break;
    }

    steps.push(async () => {
      await ctx.emit({
        type: 'swap',
        target: [`index:${childIndex}`, `index:${parentIndex}`],
        payload: { childIndex, parentIndex },
      });
    });

    const tmp = arr[childIndex]!;
    arr[childIndex] = arr[parentIndex]!;
    arr[parentIndex] = tmp;
    cursor = parentIndex;
    settledIndex = cursor;
  }

  steps.push(async () => {
    await ctx.emit({ type: 'settle', target: `index:${settledIndex}`, payload: { index: settledIndex } });
  });

  return steps;
}

/** 취소 검사와 sleep 을 한데 묶는다 (S-piece). */
async function pause(rc: ReactiveContext<SiftUpData>, ms: number): Promise<boolean> {
  if (rc.cancelled) return false;
  return rc.sleep(ms);
}

export async function siftUpAlgorithm(ctx: FacetContext<SiftUpData>): Promise<void> {
  const rc = ctx as ReactiveContext<SiftUpData>;
  const { values, insertValue, stepMs } = ctx.data;
  const steps = buildSteps(ctx, values, insertValue);

  // 자동 재생 — 걸음마다 읽을 시간을 준 뒤 발신한다.
  for (let i = 0; i < steps.length; i += 1) {
    if (ctx.cancelled) return;
    const ok = await pause(rc, stepMs);
    if (!ok) return;
    if (ctx.cancelled) return;
    await steps[i]!();
  }

  // 자동 재생 종료 — advance 로 한 걸음씩 되짚는다.
  let cursor = steps.length;
  while (!ctx.cancelled) {
    let input: ReactiveInputEvent;
    try {
      input = await rc.waitForInput();
    } catch {
      return;
    }
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;

    if (cursor >= steps.length) {
      // 처음으로 되돌아간 뒤 문(gate) 없이 첫 걸음까지 곧바로 보인다.
      await ctx.emit({ type: 'rewind' });
      cursor = 0;
    }
    await steps[cursor]!();
    cursor += 1;
  }
}
