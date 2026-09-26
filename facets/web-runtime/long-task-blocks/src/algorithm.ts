/**
 * long-task-blocks 알고리즘 — 긴 태스크 하나가 도는 동안 쌓이는 클릭 줄을 재생한다.
 *
 * 이벤트
 *   longStart { durationMs: number }                    — 긴 일이 시작한다
 *   arrive    { id: string }                             — 클릭 하나가 태스크 줄 뒤에 선다
 *   longEnd   {}                                         — 긴 일이 끝나고 태스크 줄이 확정된다
 *   process   { id: string; waitMs: number }             — 클릭 하나를 처리한다 (기다림 = 처리 시작 − 도착)
 * 전부 silent 가 아니다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LongTaskBlocksFacetData = {
  type: 'long-task-blocks';
  stepMs: number;
  long: { id: string; durationMs: number };
  clicks: { id: string; arrivalMs: number }[];
  handlerMs: number;
};

export async function longTaskBlocks(context: FacetContext<LongTaskBlocksFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<LongTaskBlocksFacetData>;
  const { long, clicks, handlerMs, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const sorted = [...clicks].sort((a, b) => a.arrivalMs - b.arrivalMs);
  for (let i = 0; i < sorted.length; i += 1) {
    const click = sorted[i]!;
    if (click.arrivalMs < 0 || click.arrivalMs >= long.durationMs) {
      throw new Error(
        `long-task-blocks: ${click.id} 의 도착 시각 ${click.arrivalMs} 이 긴 일의 구간 [0, ${long.durationMs}) 밖이다`,
      );
    }
    if (i > 0 && click.arrivalMs === sorted[i - 1]!.arrivalMs) {
      throw new Error(`long-task-blocks: 클릭 도착 시각이 겹친다: ${click.id}`);
    }
  }

  await ctx.emit({ type: 'longStart', payload: { durationMs: long.durationMs } });
  if (!(await pause())) return;

  const queue: typeof sorted = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (ctx.cancelled) return;
    const click = sorted[i]!;
    queue.push(click);
    await ctx.emit({ type: 'arrive', payload: { id: click.id } });
    if (!(await pause())) return;
  }

  await ctx.emit({ type: 'longEnd' });
  if (!(await pause())) return;

  let now = long.durationMs;
  for (let i = 0; i < queue.length; i += 1) {
    if (ctx.cancelled) return;
    const click = queue[i]!;
    const startMs = now;
    const waitMs = startMs - click.arrivalMs;
    if (waitMs < 0) throw new Error(`long-task-blocks: ${click.id} 의 기다림이 음수다`);
    now += handlerMs;
    await ctx.emit({ type: 'process', payload: { id: click.id, waitMs } });
    if (!(await pause())) return;
  }
}
