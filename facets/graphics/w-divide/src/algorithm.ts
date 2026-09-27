/**
 * wDivide — 동차 묶음 (x, y, w) 를 w 로 나누어 평면의 점 (x/w, y/w) 로 되돌린다.
 *
 * 묶음을 자료의 차례대로 하나씩 본다. w 가 0 이 아니면 나누어 떨어진 점을 보내고,
 * w 가 0 이면 **나누기 전에 가려** 방향으로 보낸다 — 나눗셈 함수 `divideByW` 는
 * w = 0 을 받으면 던진다 (0 으로 나눔을 Infinity · NaN 으로 흘리지 않는다).
 *
 * 이벤트 (걸음 하나 = 묶음 하나, 모두 silent 아님):
 *
 *   land       { id: string; index: number; w: number; px: number; py: number }
 *              — 묶음 id(자료 차례 index)를 w 로 나눈 점 (px, py). 반올림하지 않은 값이다
 *   direction  { id: string; index: number; dx: number; dy: number }
 *              — w = 0 이라 나누지 않은 묶음. (dx, dy) 는 묶음의 (x, y) 그대로
 *
 * 걸음 0 은 장면의 `initial()` 이 자료의 묶음 다섯으로 채운다 (읽을 것이 있는 화면이라
 * 첫 발신 앞에 stepMs 를 둔다). init 이벤트는 없다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Bundle = { id: string; x: number; y: number; w: number };

export type WDivideFacetData = {
  type: 'w-divide';
  stepMs: number;
  bundles: Bundle[];
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 자료 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 알고리즘 · 장면 · 그림이 함께 쓴다. */
export function narrowWDivideData(raw: unknown): WDivideFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('wDivide: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'w-divide') throw new Error(`wDivide: data.type 이 'w-divide' 가 아니다 (${String(r.type)})`);
  if (!isFiniteNumber(r.stepMs) || r.stepMs < 0) throw new Error('wDivide: data.stepMs 가 0 이상의 수가 아니다');
  if (!Array.isArray(r.bundles) || r.bundles.length === 0) throw new Error('wDivide: data.bundles 가 비었거나 배열이 아니다');
  const seen = new Set<string>();
  const bundles = r.bundles.map((b: unknown, i: number): Bundle => {
    if (typeof b !== 'object' || b === null) throw new Error(`wDivide: data.bundles[${i}] 가 객체가 아니다`);
    const o = b as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id === '') throw new Error(`wDivide: data.bundles[${i}].id 가 빈 글자다`);
    if (seen.has(o.id)) throw new Error(`wDivide: data.bundles[${i}].id '${o.id}' 가 겹친다`);
    seen.add(o.id);
    for (const k of ['x', 'y', 'w'] as const) {
      if (!isFiniteNumber(o[k])) throw new Error(`wDivide: data.bundles[${i}].${k} 가 수가 아니다`);
    }
    return { id: o.id, x: o.x as number, y: o.y as number, w: o.w as number };
  });
  return { type: 'w-divide', stepMs: r.stepMs, bundles };
}

/** (x, y, w) → (x/w, y/w). w = 0 이면 던진다 — 점이 되지 못하는 묶음이다. */
export function divideByW(b: Bundle): { px: number; py: number } {
  if (b.w === 0) throw new Error(`wDivide: 묶음 ${b.id} 의 w 가 0 이라 나눌 수 없다 (방향이다)`);
  return { px: b.x / b.w, py: b.y / b.w };
}

export async function wDivide(context: FacetContext<WDivideFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<WDivideFacetData>;
  const data = narrowWDivideData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  for (let index = 0; index < data.bundles.length; index += 1) {
    // 걸음 0 이 묶음 다섯을 보이므로 첫 발신 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    const b = data.bundles[index];
    if (b === undefined) throw new Error(`wDivide: data.bundles[${index}] 가 없다`);
    if (b.w === 0) {
      await ctx.emit({ type: 'direction', payload: { id: b.id, index, dx: b.x, dy: b.y } });
      continue;
    }
    const { px, py } = divideByW(b);
    await ctx.emit({ type: 'land', payload: { id: b.id, index, w: b.w, px, py } });
  }
}
