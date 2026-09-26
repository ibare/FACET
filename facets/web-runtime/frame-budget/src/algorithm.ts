/**
 * frame-budget — 프레임 예산과 합성.
 *
 * 화면은 60Hz 로 박자를 친다(박자 b 의 시각 = b × 1000/60ms). 한 장(프레임)은 그 장이
 * 시작한 박자에서 얼마의 몫(ms)을 쓰는가에 따라, 끝난 시각보다 뒤의 첫 박자에 나온다.
 * 다음 장은 앞 장이 나온 그 박자에서 시작한다 — 앞 장이 늦으면 다음 장도 그만큼 밀린다.
 * 한 장의 몫은 손잡이 둘(속성 · 상자 수)에서 고정으로 정해진다.
 *
 * ── 이벤트
 *   'phase'  silent. payload { phase: 'cost' | 'schedule' | 'position' }
 *            'cost'     한 장의 몫(ms)을 읽는 줄
 *            'schedule' 이 장이 그 박자에 나오는지 판정하는 줄
 *            'position' 장이 나와 자리(px)와 다음 장의 시작 박자를 갱신하는 줄
 *   'beat'   payload {
 *              beat: number;        // 0..FB_BEATS
 *              position: number;    // 이 박자에 화면에 보이는 자리(px)
 *              isNewFrame: boolean; // 이 박자에 새 장이 나왔는가
 *              newFrames: number;   // 지금까지 새 장 수(누적, 1..beat 구간)
 *              repeats: number;     // 지금까지 되풀이 수(beat - newFrames)
 *              fps: number;         // 지금까지 구간 기준 초당 장 수(반올림)
 *              frameCost: number;   // 한 장의 몫(ms) — 이 판 내내 고정
 *              prop: number;        // 0 transform | 1 left
 *              boxCount: number;
 *            }
 *
 * ── phase 어휘: cost, schedule, position (셋뿐)
 * ── 계기: 'new-frames'(누적 새 장 수), 'fps'(누적 구간 기준 초당 장 수) — 둘 다
 *          지금 보이는 값을 그대로 들고 차이만 보내는 델타 헬퍼를 거친다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export const PROP_TRANSFORM = 0;
export const PROP_LEFT = 1;

/** 화면 60Hz — 박자 0..FB_BEATS(포함, 13 걸음)만 본다. */
export const FB_BEATS = 12;
/** 속도 1.2px/ms = 박자마다 20px(1.2 × 1000/60). */
export const FB_SPEED = 20;

export const BOX_COUNTS = [2, 4, 7, 8, 12, 16, 20] as const;

export type FrameBudgetData = {
  type: 'frameBudget';
  stepMs: number;
  /** 0 transform | 1 left */
  prop: number;
  boxCount: number;
};

function frameCostOf(prop: number, boxCount: number): number {
  if (prop === PROP_LEFT) return 2 + 2 * boxCount;
  if (prop === PROP_TRANSFORM) return 2;
  throw new Error(`알 수 없는 속성 값: ${prop}`);
}

/** count/beat 를 반올림한 정수 비율로 — floor((count*60*2 + beat) / (2*beat)). beat > 0 이어야 한다. */
function roundRate(count: number, beat: number): number {
  const numerator = count * 60;
  return Math.floor((numerator * 2 + beat) / (2 * beat));
}

/** ctx.metric 은 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. */
function makeMetricTracker(ctx: FacetContext<FrameBudgetData>) {
  const prev = new Map<string, number>();
  return (name: string, value: number): void => {
    const before = prev.get(name) ?? 0;
    ctx.metric(name, value - before);
    prev.set(name, value);
  };
}

export async function frameBudgetAlgorithm(ctx: FacetContext<FrameBudgetData>): Promise<void> {
  const rc = ctx as ReactiveContext<FrameBudgetData>;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const sendMetric = makeMetricTracker(ctx);

  try {
    while (true) {
      if (ctx.cancelled) return;
      const prop = ctx.data.prop;
      const n = ctx.data.boxCount;
      if (!BOX_COUNTS.includes(n as (typeof BOX_COUNTS)[number])) throw new Error(`알 수 없는 상자 수: ${n}`);
      const cost = frameCostOf(prop, n);

      for (let beat = 0; beat <= FB_BEATS; beat += 1) {
        if (ctx.cancelled) return;

        // "그 박자에 무엇이 보이는가" 를 그 박자마다 다시 셈한다 — 박자 0 부터 다시 돈다.
        await phase('cost');
        let b = 0;
        let position = 0;
        let hits = 0;
        let isNewFrame = false;
        for (let j = 1; j <= beat; j += 1) {
          if (ctx.cancelled) return;
          const end60 = b * 1000 + cost * 60;
          const p = Math.floor(end60 / 1000) + 1;
          await phase('schedule');
          if (p === j) {
            position = FB_SPEED * b;
            b = p;
            hits += 1;
            isNewFrame = j === beat;
            await phase('position');
          }
        }
        const repeats = beat - hits;
        const fps = beat === 0 ? 0 : roundRate(hits, beat);

        sendMetric('new-frames', hits);
        sendMetric('fps', fps);

        await ctx.emit({
          type: 'beat',
          payload: { beat, position, isNewFrame, newFrames: hits, repeats, fps, frameCost: cost, prop, boxCount: n },
        });

        if (!(await rc.sleep(ctx.data.stepMs))) return;
      }

      // 한 판을 끝까지 재생했다 — 손잡이 입력을 기다린다. 우리 것이 아닌 입력은 흘린다.
      while (true) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload as { value?: unknown } | undefined;
        const value = payload?.value;
        if (input.type === 'prop' && typeof value === 'number' && (value === PROP_TRANSFORM || value === PROP_LEFT)) {
          ctx.data.prop = value;
          break;
        }
        if (input.type === 'boxCount' && typeof value === 'number' && BOX_COUNTS.includes(value as (typeof BOX_COUNTS)[number])) {
          ctx.data.boxCount = value;
          break;
        }
        // 알지 못하는 입력 — 계속 기다린다.
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
