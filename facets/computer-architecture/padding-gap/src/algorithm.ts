/**
 * 정렬과 패딩 — 필드가 차례로 들어와 제 정렬 자리까지 밀려 앉는다.
 *
 * 모형: 크기 단위는 바이트. char 1 · short 2 · int 4 · double 8. 기본형의 정렬은 제
 * 크기와 같다. 필드 오프셋은 앞 끝을 제 정렬의 배수로 올린 자리이고, 전체 크기는 끝을
 * 필드 정렬 중 최댓값의 배수로 올린 값이다. 오프셋 · 빈틈 · 크기는 전부 여기서 셈한다.
 *
 * 이벤트 (전부 걸음이다. silent 없음):
 *
 * - `init`  payload `{ fields: { name: string; type: string; size: number; align: number }[];
 *                      span: number }`
 *     필드 목록과 각 필드의 크기·정렬. `span` 은 완성된 구조체의 크기로, 그림이 바이트 한
 *     칸의 폭을 처음부터 고정하는 데만 쓴다 (칸이 걸음마다 줄어들지 않게).
 * - `place` payload `{ index: number; from: number; offset: number }`
 *     `index` 번째 필드가 앞 끝 `from` 에 닿았다가 제 정렬의 배수인 `offset` 에 앉는다.
 *     `offset - from` 이 그 앞의 빈틈이다.
 * - `tail`  payload `{ end: number; size: number; align: number }`
 *     마지막 필드의 끝 `end` 를 가장 큰 정렬 `align` 의 배수 `size` 로 올린다.
 *     `size - end` 가 꼬리 빈틈이다.
 * - `total` payload `{ size: number; sum: number; gaps: number }`
 *     구조체 크기 = 필드 크기의 합 + 빈틈의 합.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PaddingGapField = { name: string; type: string };

export type PaddingGapFacetData = {
  type: 'padding-gap';
  stepMs: number;
  fields: PaddingGapField[];
};

/** 모형의 기본형 크기. 정렬은 크기와 같다. */
const SIZE_OF: Readonly<Record<string, number>> = {
  char: 1,
  short: 2,
  int: 4,
  double: 8,
};

/** `n` 을 `align` 의 배수로 올린다. */
function roundUp(n: number, align: number): number {
  return Math.ceil(n / align) * align;
}

/**
 * 필드 오프셋과 구조체 크기를 셈한다. ctx 를 받지 않는 순수 셈이다.
 * 오프셋 = 앞 끝을 제 정렬의 배수로 올린 자리. 크기 = 끝을 정렬 최댓값의 배수로 올린 값.
 */
function layoutStruct(fields: readonly { size: number; align: number }[]): {
  offsets: number[];
  maxAlign: number;
  size: number;
} {
  const offsets: number[] = [];
  let end = 0;
  for (const f of fields) {
    const offset = roundUp(end, f.align);
    offsets.push(offset);
    end = offset + f.size;
  }
  const maxAlign = fields.reduce((m, f) => Math.max(m, f.align), 1);
  return { offsets, maxAlign, size: roundUp(end, maxAlign) };
}

export async function paddingGap(context: FacetContext<PaddingGapFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<PaddingGapFacetData>;
  const { stepMs } = ctx.data;

  const fields = ctx.data.fields.map((f) => {
    const size = SIZE_OF[f.type];
    if (size === undefined) throw new Error(`padding-gap: 모형에 없는 형 '${f.type}'`);
    return { name: f.name, type: f.type, size, align: size };
  });

  // 오프셋을 먼저 다 셈한다 — 걸음은 이 셈을 차례로 보일 뿐이다.
  const { offsets, maxAlign, size } = layoutStruct(fields);
  const sum = fields.reduce((s, f) => s + f.size, 0);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 첫 걸음은 문 밖에서 곧바로 — 마운트 직후 빈 화면을 두지 않는다.
  await ctx.emit({ type: 'init', payload: { fields, span: size } });

  let cursor = 0;
  for (let i = 0; i < fields.length; i += 1) {
    if (!(await pause())) return;
    const offset = offsets[i]!;
    await ctx.emit({ type: 'place', payload: { index: i, from: cursor, offset } });
    cursor = offset + fields[i]!.size;
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'tail', payload: { end: cursor, size, align: maxAlign } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'total', payload: { size, sum, gaps: size - sum } });
}
