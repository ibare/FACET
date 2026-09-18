/**
 * 구조체 정렬 — 같은 필드 다섯이 정렬 상한과 늘어놓는 차례에 따라 16 바이트도 되고
 * 32 바이트도 된다.
 *
 * ── 규약
 *   필드의 정렬   = min(크기, pack). 오프셋은 그 배수로 올린다 (밀려남 → 빈틈).
 *   구조체 정렬   = 필드 정렬의 최댓값. 끝을 그 배수로 올린다 (꼬리).
 *   빈틈          = 크기 − 필드 크기 합. 꼬리를 포함한다.
 *   어긋남        = 오프셋이 제 형 크기(자연 정렬)의 배수가 아닌 필드 수.
 *   큰 것부터     = 크기 내림차순, 같은 크기는 선언 순서.
 *
 * ── 짜임 (reactive)
 *   한 판 = 필드를 하나씩 놓고(어긋나면 한 걸음 더) 꼬리를 붙인 뒤 요약한다.
 *   판이 끝나면 손잡이 입력을 기다리고, 받은 값으로 다음 판을 돈다.
 *
 * ── 이벤트 (payload 는 projector 가 typeof 로 가려 읽는다)
 *   layout-begin  { pack: number, order: number }
 *   place         { slot: number, field: number, name: string, ctype: string, size: number,
 *                   align: number, from: number, offset: number, gap: number, misaligned: boolean }
 *                 slot = 놓는 차례, field = 선언 차례(필드의 정체), from = 놓기 전의 끝
 *   misalign      { field: number, name: string, offset: number, size: number }
 *   tail          { from: number, size: number, tail: number, structAlign: number }
 *   summary       { size: number, padding: number, misaligned: number, data: number, moved: number }
 *                 moved = 앞 판과 오프셋이 달라진 필드 수 (첫 판은 -1)
 *   phase         { phase } — silent
 *
 * ── phase 어휘 (irs.ts 와 같은 집합)
 *   'begin' | 'place' | 'misalign' | 'tail'
 *
 * ── 메트릭
 *   struct-size       지금까지의 끝 → 판이 끝나면 구조체 크기
 *   padding-size      지금까지 벌어진 빈틈(꼬리 포함)
 *   misaligned-count  어긋난 필드 수
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type StructField = {
  /** 필드 이름 (자료 — 번역하지 않는다). */
  name: string;
  /** C 형 이름 (자료 — 번역하지 않는다). */
  ctype: string;
  /** 바이트 크기. 2 의 거듭제곱. */
  size: number;
};

export type StructAlignmentData = {
  type: 'struct-alignment';
  /** 선언 순서의 필드. */
  fields: StructField[];
  /** pack 손잡이의 사다리. facet.ts 의 segments[].value 와 같다. */
  packLadder: number[];
  /** order 손잡이의 식별자 목록. segments[].value 는 이 색인이다. */
  orders: string[];
  /** 처음 pack. */
  pack: number;
  /** 처음 order 색인. */
  order: number;
  /** 한 걸음 간격 (ms). */
  stepMs: number;
};

export type PlacedField = {
  slot: number;
  field: number;
  name: string;
  ctype: string;
  size: number;
  align: number;
  from: number;
  offset: number;
  gap: number;
  misaligned: boolean;
};

export type StructLayout = {
  placed: PlacedField[];
  /** 마지막 필드 끝 (꼬리 전). */
  end: number;
  structAlign: number;
  tail: number;
  size: number;
  padding: number;
  misaligned: number;
  /** 필드 크기 합. */
  data: number;
};

/** order 색인 1 = 큰 것부터. 0 = 선언 순서. */
export const ORDER_LARGEST_FIRST = 1;

function alignUp(value: number, align: number): number {
  return Math.floor((value + align - 1) / align) * align;
}

/** 놓는 차례 — 선언 색인의 배열. 큰 것부터는 크기 내림차순, 같은 크기는 선언 순서. */
export function arrangeFields(fields: readonly StructField[], order: number): number[] {
  const idx = fields.map((_, i) => i);
  if (order !== ORDER_LARGEST_FIRST) return idx;
  return idx.sort((x, y) => fields[y]!.size - fields[x]!.size || x - y);
}

/** 순수 계산 — 한 판의 배치를 통째로 셈한다. 알고리즘과 검사가 같이 쓴다. */
export function computeStructLayout(
  fields: readonly StructField[],
  order: number,
  pack: number,
): StructLayout {
  const placed: PlacedField[] = [];
  let cursor = 0;
  let structAlign = 1;
  let padding = 0;
  let misaligned = 0;
  let data = 0;
  arrangeFields(fields, order).forEach((fi, slot) => {
    const f = fields[fi]!;
    const align = Math.min(f.size, pack);
    const offset = alignUp(cursor, align);
    const gap = offset - cursor;
    const off = offset % f.size !== 0;
    placed.push({
      slot, field: fi, name: f.name, ctype: f.ctype, size: f.size,
      align, from: cursor, offset, gap, misaligned: off,
    });
    padding += gap;
    if (off) misaligned += 1;
    data += f.size;
    structAlign = Math.max(structAlign, align);
    cursor = offset + f.size;
  });
  const size = alignUp(cursor, structAlign);
  const tail = size - cursor;
  return { placed, end: cursor, structAlign, tail, size, padding: padding + tail, misaligned, data };
}

type Choice = { pack: number; order: number };

function readValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as { value?: unknown }).value;
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

export async function structAlignmentAlgorithm(
  base: FacetContext<StructAlignmentData>,
): Promise<void> {
  const ctx = base as ReactiveContext<StructAlignmentData>;
  const data = ctx.data;
  const fields = data.fields;
  const ladder = data.packLadder;
  const stepMs = data.stepMs;

  let pack = data.pack;
  let order = data.order;
  let previous: number[] | null = null;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 다음 손잡이 값. null 은 취소뿐이다. */
  const nextChoice = async (): Promise<Choice | null> => {
    for (;;) {
      if (ctx.cancelled) return null;
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return null;
      const v = readValue(input.payload);
      if (v === null) continue;
      if (input.type === 'pack') {
        if (!ladder.includes(v)) continue;
        return { pack: v, order };
      }
      if (input.type === 'order') {
        if (v < 0 || v >= data.orders.length) continue;
        return { pack, order: v };
      }
    }
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const layout = computeStructLayout(fields, order, pack);

      await phase('begin');
      gauge('struct-size', 0);
      gauge('padding-size', 0);
      gauge('misaligned-count', 0);
      await ctx.emit({ type: 'layout-begin', payload: { pack, order } });
      if (!(await ctx.sleep(stepMs))) return;

      let end = 0;
      let padding = 0;
      let misaligned = 0;
      for (const p of layout.placed) {
        if (ctx.cancelled) return;
        await phase('place');
        end = p.offset + p.size;
        padding += p.gap;
        gauge('struct-size', end);
        gauge('padding-size', padding);
        await ctx.emit({ type: 'place', payload: { ...p } });
        if (!(await ctx.sleep(stepMs))) return;

        if (p.misaligned) {
          await phase('misalign');
          misaligned += 1;
          gauge('misaligned-count', misaligned);
          await ctx.emit({
            type: 'misalign',
            payload: { field: p.field, name: p.name, offset: p.offset, size: p.size },
          });
          if (!(await ctx.sleep(stepMs))) return;
        }
      }

      await phase('tail');
      padding += layout.tail;
      gauge('struct-size', layout.size);
      gauge('padding-size', padding);
      await ctx.emit({
        type: 'tail',
        payload: { from: end, size: layout.size, tail: layout.tail, structAlign: layout.structAlign },
      });
      if (!(await ctx.sleep(stepMs))) return;

      const offsets = new Array<number>(fields.length).fill(0);
      for (const p of layout.placed) offsets[p.field] = p.offset;
      const moved = previous === null ? -1 : offsets.filter((o, i) => o !== previous![i]).length;
      previous = offsets;
      await ctx.emit({
        type: 'summary',
        payload: {
          size: layout.size,
          padding,
          misaligned,
          data: layout.data,
          moved,
        },
      });

      const next = await nextChoice();
      if (next === null) return;
      pack = next.pack;
      order = next.order;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다.
    if (!ctx.cancelled) throw err;
  }
}
