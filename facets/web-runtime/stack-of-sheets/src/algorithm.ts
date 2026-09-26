/**
 * 따로 칠하고 겹쳐 한 장으로 — 층마다 제 장에 칠한 뒤, 합성이 장들을 아래부터 포갠다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음이다):
 *   paint   { layer: string; ops: number; total: number }
 *           층 하나를 제 장에 칠했다. ops 는 그 층의 칠하기 동작 수, total 은 지금까지의 누적.
 *           칠하는 차례는 initialData.layers 의 차례다.
 *   compose { layer: string; covered: string[] }
 *           장 하나를 합성에 얹었다. 차례는 z 오름차순(아래부터). covered 는 이번에 얹은 장의
 *           요소가 덮는 아래 요소 — initialData.covers 에서 고른다. 합성은 칠하지 않는다.
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (층 · 요소 · 칠하기 동작). 읽을 것이
 * 있는 화면이라 첫 발신 앞에도 stepMs 를 둔다.
 *
 * 셈할 수 없는 데이터는 던진다 — 모르는 칠하기 동작, 겹치는 z, 두 번 나온 요소, 없는 겹침 대상,
 * 아래가 아니라 같거나 위에 있는 요소를 덮는다는 겹침.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PaintOpName = 'fillRect' | 'drawText';

export type SheetOp = { el: string; op: PaintOpName };

export type SheetLayer = { id: string; z: number; ops: SheetOp[] };

export type SheetCover = { top: string; under: string[] };

export type StackOfSheetsFacetData = {
  type: 'stack-of-sheets';
  stepMs: number;
  layers: SheetLayer[];
  covers: SheetCover[];
};

const PAINT_OPS: readonly string[] = ['fillRect', 'drawText'];

/** 요소 → 그 요소를 가진 층의 z. 데이터가 틀리면 던진다. */
function ownerZ(data: StackOfSheetsFacetData): Map<string, number> {
  const zs = new Set<number>();
  const owner = new Map<string, number>();
  for (const layer of data.layers) {
    if (zs.has(layer.z)) throw new Error(`stack-of-sheets: z ${layer.z} 가 두 층에 있다 (${layer.id})`);
    zs.add(layer.z);
    for (const item of layer.ops) {
      if (!PAINT_OPS.includes(item.op)) {
        throw new Error(`stack-of-sheets: 모르는 칠하기 동작 ${String(item.op)} (${layer.id}/${item.el})`);
      }
      if (owner.has(item.el)) throw new Error(`stack-of-sheets: 요소 ${item.el} 가 두 번 나온다`);
      owner.set(item.el, layer.z);
    }
  }
  return owner;
}

/** 이번에 얹는 장의 요소가 덮는 아래 요소들 (겹침 데이터의 차례). */
function coveredBy(
  layer: SheetLayer,
  covers: SheetCover[],
  owner: Map<string, number>,
): string[] {
  const mine = new Set(layer.ops.map((o) => o.el));
  const out: string[] = [];
  for (const cover of covers) {
    const topZ = owner.get(cover.top);
    if (topZ === undefined) throw new Error(`stack-of-sheets: 겹침의 위 요소 ${cover.top} 가 어느 층에도 없다`);
    if (!mine.has(cover.top)) continue;
    for (const under of cover.under) {
      const underZ = owner.get(under);
      if (underZ === undefined) throw new Error(`stack-of-sheets: 겹침의 아래 요소 ${under} 가 어느 층에도 없다`);
      if (underZ >= topZ) throw new Error(`stack-of-sheets: ${cover.top} 가 아래 장에 있지 않은 ${under} 를 덮는다`);
      out.push(under);
    }
  }
  return out;
}

export async function stackOfSheets(ctx: FacetContext<StackOfSheetsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<StackOfSheetsFacetData>;
  const data = rctx.data;
  const stepMs = data.stepMs;
  const owner = ownerZ(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 칠하기 — 층 차례로, 층 하나가 한 걸음
  let total = 0;
  for (const layer of data.layers) {
    if (!(await pause())) return;
    let ops = 0;
    for (const item of layer.ops) {
      if (ctx.cancelled) return;
      if (item.el === '') throw new Error(`stack-of-sheets: 이름 없는 요소 (${layer.id})`);
      ops += 1;
    }
    total += ops;
    await ctx.emit({ type: 'paint', target: `layer:${layer.id}`, payload: { layer: layer.id, ops, total } });
  }

  // 합성 — z 차례(아래부터)로, 장 하나를 얹는 것이 한 걸음. 칠하지 않는다
  const byZ = [...data.layers].sort((a, b) => a.z - b.z);
  for (const layer of byZ) {
    if (!(await pause())) return;
    const covered = coveredBy(layer, data.covers, owner);
    await ctx.emit({ type: 'compose', target: `layer:${layer.id}`, payload: { layer: layer.id, covered } });
  }
}
