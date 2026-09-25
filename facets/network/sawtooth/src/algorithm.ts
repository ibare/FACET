/**
 * sawtooth — 여러 왕복에 걸친 혼잡 창의 톱니 모양.
 *
 * 모형 (값은 모두 예로 정한 것이다 — 용량 · 처음 창 · 왕복 수):
 * - 창은 조각 수로 센다 (실제 TCP 는 바이트다).
 * - 한 걸음 = 한 왕복. 왕복마다: 창 > 용량 이면 그 왕복에서 잃고 다음 창 = ⌊창 / 2⌋,
 *   아니면 다음 창 = 창 + 1.
 * - 처음 창은 앞서 한 번 줄어든 뒤의 값이라고 친다. 슬로 스타트는 없다.
 * - 잃음을 어떻게 알아채는가(중복 확인)는 셈하지 않는다.
 * - 톱니 하나 = 앞 톱니가 끝난 다음 왕복부터 잃은 왕복까지. 잃을 때마다 그 톱니의
 *   평균 창과 평균 ÷ 용량을 셈한다.
 *
 * 이벤트 (모두 silent 아님):
 * - `rise` — 잃음 없는 왕복.
 *   payload `{ round: number; window: number; next: number }`
 * - `drop` — 창이 용량을 넘어 잃은 왕복. 이 왕복이 톱니 하나를 닫는다.
 *   payload `{ round: number; window: number; next: number;
 *              tooth: { from: number; to: number; mean: number; ratio: number } }`
 *
 * 셈할 수 없는 자료(양의 정수가 아닌 용량 · 창 · 왕복 수)는 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SawtoothFacetData = {
  type: 'sawtooth';
  /** 망의 용량 — 한 왕복에 잃지 않고 지나가는 조각 수 */
  capacity: number;
  /** 처음 창 (조각 수) */
  startWindow: number;
  /** 왕복 수 */
  rounds: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

function positiveInt(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new Error(`sawtooth: ${name} 는 양의 정수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

export async function sawtooth(ctxIn: FacetContext<SawtoothFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<SawtoothFacetData>;
  const data = ctx.data;
  const capacity = positiveInt(data.capacity, 'capacity');
  const rounds = positiveInt(data.rounds, 'rounds');
  let window = positiveInt(data.startWindow, 'startWindow');
  const stepMs = positiveInt(data.stepMs, 'stepMs');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 축 · 용량 · 처음 창이 이미 선 화면이라 첫 발신 앞에도 읽을 틈을 둔다.
  let toothFrom = 1;
  let toothSum = 0;
  for (let round = 1; round <= rounds; round++) {
    if (!(await pause())) return;
    toothSum += window;
    if (window > capacity) {
      const next = Math.floor(window / 2);
      const count = round - toothFrom + 1;
      const mean = toothSum / count;
      await ctx.emit({
        type: 'drop',
        payload: {
          round,
          window,
          next,
          tooth: { from: toothFrom, to: round, mean, ratio: mean / capacity },
        },
      });
      toothFrom = round + 1;
      toothSum = 0;
      window = next;
    } else {
      const next = window + 1;
      await ctx.emit({ type: 'rise', payload: { round, window, next } });
      window = next;
    }
  }
}
