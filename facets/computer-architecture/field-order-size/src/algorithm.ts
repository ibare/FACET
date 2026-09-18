/**
 * 순서가 크기를 바꾼다 — 같은 필드 넷을 선언한 차례대로 늘어놓고, 큰 것부터 다시
 * 늘어놓는다. 오프셋과 크기는 규칙에서 셈한다.
 *
 * 규칙
 *   - 기본형의 크기: char 1 · short 2 · int 4 · double 8. 정렬은 제 크기와 같다
 *   - 필드 오프셋 = 앞 끝을 제 정렬의 배수로 올린 자리
 *   - 전체 크기 = 마지막 끝을 가장 큰 정렬의 배수로 올린 값
 *   - 다시 늘어놓는 차례 = 크기 내림차순, 같은 크기는 처음 차례를 지킨다
 *
 * 이벤트 (silent 없음 — 전부 걸음이다)
 *   init    { fields: { name: string; type: string; size: number }[]; span: number }
 *           span = 두 배치 크기 중 큰 것. 그림이 바이트 축척을 처음부터 고정하는 데 쓴다
 *   place   { field: number; from: number; offset: number }
 *           처음 차례의 배치. from = 앞 필드의 끝, offset = 제 정렬로 올린 자리
 *   close   { row: 'before' | 'after'; end: number; size: number }
 *           한 줄을 닫는다. end = 마지막 끝, size = 가장 큰 정렬로 올린 크기
 *   reorder { order: number[] }
 *           큰 것부터의 새 차례 (필드 번호)
 *   move    { field: number; from: number; offset: number }
 *           새 차례의 배치. from = 새 줄에서 앞 필드의 끝
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FieldOrderSizeField = { name: string; type: string };

export type FieldOrderSizeFacetData = {
  type: 'field-order-size';
  fields: FieldOrderSizeField[];
  stepMs: number;
};

/** 기본형 크기 (바이트). 정렬도 이 값이다. */
const PRIMITIVE_SIZE: Record<string, number> = { char: 1, short: 2, int: 4, double: 8 };

function sizeOf(type: string): number {
  const size = PRIMITIVE_SIZE[type];
  if (size === undefined) throw new Error(`field-order-size: 모르는 기본형 ${type}`);
  return size;
}

function alignUp(at: number, align: number): number {
  return Math.ceil(at / align) * align;
}

type Placement = { field: number; from: number; offset: number };

/** 주어진 차례로 늘어놓는다. */
function layout(order: number[], sizes: number[]): { slots: Placement[]; end: number; size: number } {
  const slots: Placement[] = [];
  let end = 0;
  let maxAlign = 1;
  for (const field of order) {
    const size = sizes[field] as number;
    maxAlign = Math.max(maxAlign, size);
    const offset = alignUp(end, size);
    slots.push({ field, from: end, offset });
    end = offset + size;
  }
  return { slots, end, size: alignUp(end, maxAlign) };
}

export async function fieldOrderSize(ctx: FacetContext<FieldOrderSizeFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<FieldOrderSizeFacetData>;
  const { fields, stepMs } = ctx.data;
  const sizes = fields.map((f) => sizeOf(f.type));

  const declared = fields.map((_, i) => i);
  // 안정 정렬 — 같은 크기는 처음 차례를 지킨다
  const largestFirst = [...declared].sort((x, y) => (sizes[y] as number) - (sizes[x] as number));

  const before = layout(declared, sizes);
  const after = layout(largestFirst, sizes);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: {
      fields: fields.map((f, i) => ({ name: f.name, type: f.type, size: sizes[i] as number })),
      span: Math.max(before.size, after.size),
    },
  });

  for (const slot of before.slots) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'place', payload: { ...slot } });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'close', payload: { row: 'before', end: before.end, size: before.size } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'reorder', payload: { order: [...largestFirst] } });

  for (const slot of after.slots) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'move', payload: { ...slot } });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'close', payload: { row: 'after', end: after.end, size: after.size } });
}
