/**
 * drop-random-units — 뽑힌 마스크 하나로 앞먹임을 한 번씩 한다 (뒤집은 드롭아웃).
 *
 * 칸 i 의 몫 = mᵢ · hᵢ · vᵢ / (1 − p). 출력 y = Σ 몫. 걸음 0 은 마스크 없이 모두 켠
 * 모습이라 몫 = hᵢ · vᵢ (나누기 없음). 무게는 바뀌지 않는다.
 *
 * 이벤트
 *   init  (silent)  { contribs: number[]; y: number; scale: number; lo: number; hi: number }
 *                   걸음 0 — 모두 켠 몫 · 출력, 켜진 칸이 몫에 곱하는 배율 1/(1−p),
 *                   화면 축의 범위(모든 걸음의 몫 · 출력과 0 을 담는 최소 · 최대)
 *   drop            { n: number; mask: number[]; contribs: number[]; y: number;
 *                     off: number[]; rested: number }
 *                   걸음 n(1 부터) — 마스크, 칸마다의 몫, 출력, 쉬는 칸의 번호(0 부터),
 *                   지금까지 한 번 이상 쉰 칸의 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DropRandomUnitsFacetData = {
  type: 'drop-random-units';
  stepMs: number;
  /** 칸 식별자 (u1 …) */
  ids: string[];
  /** 칸의 출력 — 입력 하나에 대한 값, 걸음마다 같다 */
  h: number[];
  /** 출력으로 가는 무게 */
  v: number[];
  /** 쉴 확률 */
  p: number;
  /** 뽑힌 마스크 (1 = 켜짐, 0 = 쉼). 걸음 1 부터 차례로 */
  masks: number[][];
};

function numberList(raw: unknown, path: string): number[] {
  if (!Array.isArray(raw)) throw new Error(`drop-random-units: ${path} 는 배열이어야 한다`);
  return raw.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`drop-random-units: ${path}[${i}] 가 수가 아니다`);
    }
    return x;
  });
}

/** initialData 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 장면의 initial 도 이것을 부른다. */
export function narrowDropRandomUnitsData(raw: unknown): DropRandomUnitsFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('drop-random-units: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'drop-random-units') throw new Error('drop-random-units: type 이 다르다');
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('drop-random-units: stepMs 가 양수가 아니다');
  if (!Array.isArray(r.ids)) throw new Error('drop-random-units: ids 는 배열이어야 한다');
  const ids = r.ids.map((x, i) => {
    if (typeof x !== 'string' || x === '') throw new Error(`drop-random-units: ids[${i}] 가 이름이 아니다`);
    return x;
  });
  const n = ids.length;
  if (n === 0) throw new Error('drop-random-units: 칸이 없다');
  const h = numberList(r.h, 'h');
  const v = numberList(r.v, 'v');
  if (h.length !== n) throw new Error('drop-random-units: h 의 길이가 칸 수와 다르다');
  if (v.length !== n) throw new Error('drop-random-units: v 의 길이가 칸 수와 다르다');
  if (typeof r.p !== 'number' || !(r.p >= 0 && r.p < 1)) throw new Error('drop-random-units: p 는 [0, 1) 안이어야 한다');
  if (!Array.isArray(r.masks) || r.masks.length === 0) throw new Error('drop-random-units: masks 가 비었다');
  const masks = r.masks.map((m, k) => {
    const row = numberList(m, `masks[${k}]`);
    if (row.length !== n) throw new Error(`drop-random-units: masks[${k}] 의 길이가 칸 수와 다르다`);
    row.forEach((b, i) => {
      if (b !== 0 && b !== 1) throw new Error(`drop-random-units: masks[${k}][${i}] 는 0 또는 1 이어야 한다`);
    });
    return row;
  });
  return { type: 'drop-random-units', stepMs: r.stepMs, ids, h, v, p: r.p, masks };
}

function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export async function dropRandomUnits(context: FacetContext<DropRandomUnitsFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<DropRandomUnitsFacetData>;
  const data = narrowDropRandomUnitsData(ctx.data);
  const { h, v, p, masks, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const scale = 1 / (1 - p);
  const full = h.map((hi, i) => hi * v[i]!);
  const y0 = sum(full);

  // 걸음마다의 몫 · 출력을 먼저 셈해 축 범위를 정한다 — 그림이 셈을 다시 돌리지 않게
  const steps = masks.map((m) => {
    const contribs = m.map((mi, i) => mi * h[i]! * v[i]! * scale);
    return { mask: m, contribs, y: sum(contribs) };
  });
  let lo = Math.min(0, y0, ...full);
  let hi = Math.max(0, y0, ...full);
  for (const s of steps) {
    lo = Math.min(lo, s.y, ...s.contribs);
    hi = Math.max(hi, s.y, ...s.contribs);
  }

  await ctx.emit({ type: 'init', silent: true, payload: { contribs: full, y: y0, scale, lo, hi } });

  const restedEver = masks[0]!.map(() => false);
  for (let k = 0; k < steps.length; k++) {
    // 걸음 0 은 이미 읽을 것이 있는 화면이라 첫 마스크 앞에도 머문다
    if (!(await pause())) return;
    const s = steps[k]!;
    const off: number[] = [];
    s.mask.forEach((mi, i) => {
      if (mi === 0) {
        off.push(i);
        restedEver[i] = true;
      }
    });
    const rested = restedEver.filter(Boolean).length;
    await ctx.emit({
      type: 'drop',
      payload: { n: k + 1, mask: [...s.mask], contribs: s.contribs, y: s.y, off, rested },
    });
  }
}
