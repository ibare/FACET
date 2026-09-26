/**
 * order-must-be-added — 셀프 어텐션은 줄의 차례를 모른다. 위치 표시를 더해야 갈린다.
 *
 * 투영을 생략한다 (q = k = v = 입력). 따라가는 토큰(track) 하나가 묻는 줄 하나만 셈한다.
 *   점수 s_j = (입력_track · 입력_j) / √d · 무게 = softmax(s) · 결과 = Σ 무게_j · 입력_j
 *   위치 표시 PE(p, 2i) = sin(p / 10000^(2i/d)) · PE(p, 2i+1) = cos(p / 10000^(2i/d))
 *   표시를 더한 입력 = x + PE(p) (p 는 0 부터)
 *   차이 = 두 결과 벡터의 유클리드 거리
 *
 * 이벤트
 *   init      { extent: { x0: number, x1: number, y0: number, y1: number } }   silent
 *             결과 평면에 찍힐 수 있는 점(두 줄 × 표시 유무의 결과와 따라가는 토큰의 입력)을 감싸는 범위.
 *             걸음 0 을 갈아 끼운다. 그림이 셈을 다시 돌리지 않게 알고리즘이 셈해 보낸다
 * 이하 silent 아님 — 걸음 하나씩
 *   attend    { row: 'first', weights: number[], result: number[] }
 *             첫 줄에서 track 의 결과. weights 는 줄의 차례대로
 *   swap      { row: 'second', weights: number[], result: number[], diff: number }
 *             뒤바꾼 줄에서 track 의 결과. diff 는 첫 줄 결과와의 거리
 *   marks     { marks: number[][] }
 *             자리 0 … n-1 의 위치 표시 PE(p)
 *   addMarks  { row: 'first' | 'second', inputs: number[][], weights: number[], result: number[] }
 *             그 줄의 입력에 PE 를 더한 값(줄의 차례대로)과 다시 셈한 결과
 *   distance  { diff: number, was: number }
 *             표시를 더한 두 결과의 거리 · 표시 없을 때의 거리
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RowId = 'first' | 'second';

export type OrderMustBeAddedFacetData = {
  type: 'order-must-be-added';
  stepMs: number;
  tokens: { id: string; x: number[] }[];
  orders: Record<RowId, string[]>;
  track: string;
};

/** 좁히개 — 모양이 어긋나면 던진다. 자리 표시자 값을 지어내지 않는다. */
export function narrowOrderData(raw: unknown): OrderMustBeAddedFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('order-must-be-added: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'order-must-be-added') throw new Error(`order-must-be-added: type 이 다르다 (${String(r.type)})`);
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('order-must-be-added: stepMs 가 양수가 아니다');
  if (!Array.isArray(r.tokens) || r.tokens.length === 0) throw new Error('order-must-be-added: tokens 가 비었다');
  const tokens = r.tokens.map((tk, i) => {
    if (typeof tk !== 'object' || tk === null) throw new Error(`order-must-be-added: tokens[${i}] 가 객체가 아니다`);
    const o = tk as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id === '') throw new Error(`order-must-be-added: tokens[${i}].id 가 없다`);
    if (!Array.isArray(o.x) || o.x.length === 0 || !o.x.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      throw new Error(`order-must-be-added: 토큰 ${o.id} 의 x 가 수의 배열이 아니다`);
    }
    return { id: o.id, x: (o.x as number[]).slice() };
  });
  const d = tokens[0]!.x.length;
  for (const tk of tokens) {
    if (tk.x.length !== d) throw new Error(`order-must-be-added: 토큰 ${tk.id} 의 길이 ${tk.x.length} 가 ${d} 와 다르다`);
  }
  if (d % 2 !== 0) throw new Error(`order-must-be-added: 사인 · 코사인 표시는 짝수 차원이어야 한다 (d ${d})`);
  const ids = new Set(tokens.map((tk) => tk.id));
  if (ids.size !== tokens.length) throw new Error('order-must-be-added: 토큰 id 가 겹친다');
  if (typeof r.orders !== 'object' || r.orders === null) throw new Error('order-must-be-added: orders 가 없다');
  const ord = r.orders as Record<string, unknown>;
  const readOrder = (key: RowId): string[] => {
    const v = ord[key];
    if (!Array.isArray(v) || !v.every((s) => typeof s === 'string')) throw new Error(`order-must-be-added: orders.${key} 가 문자열 배열이 아니다`);
    const list = v as string[];
    for (const s of list) if (!ids.has(s)) throw new Error(`order-must-be-added: orders.${key} 에 모르는 토큰 ${s}`);
    if (new Set(list).size !== list.length || list.length !== tokens.length) {
      throw new Error(`order-must-be-added: orders.${key} 는 토큰 전부를 한 번씩 담아야 한다`);
    }
    return list.slice();
  };
  const orders = { first: readOrder('first'), second: readOrder('second') };
  if (typeof r.track !== 'string' || !ids.has(r.track)) throw new Error(`order-must-be-added: 따라가는 토큰 ${String(r.track)} 을 모른다`);
  return { type: 'order-must-be-added', stepMs: r.stepMs, tokens, orders, track: r.track };
}

/** 자리 p 의 사인 · 코사인 위치 표시 (d 는 짝수). */
export function positionMark(p: number, d: number): number[] {
  if (d % 2 !== 0) throw new Error(`positionMark: d ${d} 가 짝수가 아니다`);
  const out: number[] = [];
  for (let i = 0; i < d / 2; i += 1) {
    const angle = p / Math.pow(10000, (2 * i) / d);
    out.push(Math.sin(angle), Math.cos(angle));
  }
  return out;
}

function dot(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`dot: 길이 ${a.length} 와 ${b.length} 가 다르다`);
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i]! * b[i]!;
  return s;
}

/** 줄 입력 inputs 에서 자리 q 의 토큰이 묻는 셀프 어텐션 한 줄. 투영 없음. */
export function attendOne(inputs: number[][], q: number): { weights: number[]; result: number[] } {
  const query = inputs[q];
  if (!query) throw new Error(`attendOne: 자리 ${q} 가 줄에 없다`);
  const d = query.length;
  const scale = Math.sqrt(d);
  const scores = inputs.map((k) => dot(query, k) / scale);
  const top = Math.max(...scores);
  const ex = scores.map((s) => Math.exp(s - top));
  const sum = ex.reduce((a, b) => a + b, 0);
  const weights = ex.map((e) => e / sum);
  const result = new Array<number>(d).fill(0);
  inputs.forEach((v, j) => {
    for (let c = 0; c < d; c += 1) result[c]! += weights[j]! * v[c]!;
  });
  return { weights, result };
}

export function distanceOf(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`distanceOf: 길이 ${a.length} 와 ${b.length} 가 다르다`);
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(s);
}

function inputsOf(data: OrderMustBeAddedFacetData, row: RowId, marks: number[][] | null): number[][] {
  return data.orders[row].map((id, p) => {
    const tk = data.tokens.find((k) => k.id === id);
    if (!tk) throw new Error(`order-must-be-added: 토큰 ${id} 가 없다`);
    if (!marks) return tk.x.slice();
    const m = marks[p];
    if (!m) throw new Error(`order-must-be-added: 자리 ${p} 의 표시가 없다`);
    return tk.x.map((v, c) => v + m[c]!);
  });
}

function trackAt(data: OrderMustBeAddedFacetData, row: RowId): number {
  const q = data.orders[row].indexOf(data.track);
  if (q < 0) throw new Error(`order-must-be-added: ${row} 줄에 ${data.track} 가 없다`);
  return q;
}

export async function orderMustBeAdded(context: FacetContext<OrderMustBeAddedFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<OrderMustBeAddedFacetData>;
  const data = narrowOrderData(ctx.data);
  const stepMs = data.stepMs;
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const d = data.tokens[0]!.x.length;
  if (d !== 2) throw new Error(`order-must-be-added: 결과 평면은 2 차원만 그린다 (d ${d})`);
  const marks = data.orders.first.map((_, p) => positionMark(p, d));
  const plotted: number[][] = [];
  for (const row of ['first', 'second'] as const) {
    for (const m of [null, marks]) {
      const inputs = inputsOf(data, row, m);
      const q = trackAt(data, row);
      plotted.push(attendOne(inputs, q).result, inputs[q]!);
    }
  }
  const xs = plotted.map((v) => v[0]!);
  const ys = plotted.map((v) => v[1]!);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { extent: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } },
  });

  // 걸음 0 은 이미 줄이 선 화면이라 읽을 틈을 먼저 둔다.
  if (!(await pause())) return;
  const plainFirst = attendOne(inputsOf(data, 'first', null), trackAt(data, 'first'));
  await ctx.emit({ type: 'attend', payload: { row: 'first', weights: plainFirst.weights, result: plainFirst.result } });

  if (!(await pause())) return;
  const plainSecond = attendOne(inputsOf(data, 'second', null), trackAt(data, 'second'));
  const plainDiff = distanceOf(plainFirst.result, plainSecond.result);
  await ctx.emit({
    type: 'swap',
    payload: { row: 'second', weights: plainSecond.weights, result: plainSecond.result, diff: plainDiff },
  });

  if (!(await pause())) return;
  await ctx.emit({ type: 'marks', payload: { marks } });

  const marked: Partial<Record<RowId, number[]>> = {};
  for (const row of ['first', 'second'] as const) {
    if (!(await pause())) return;
    const inputs = inputsOf(data, row, marks);
    const out = attendOne(inputs, trackAt(data, row));
    marked[row] = out.result;
    await ctx.emit({ type: 'addMarks', payload: { row, inputs, weights: out.weights, result: out.result } });
  }

  if (!(await pause())) return;
  const a = marked.first;
  const b = marked.second;
  if (!a || !b) throw new Error('order-must-be-added: 표시를 더한 결과가 둘 다 있어야 한다');
  await ctx.emit({ type: 'distance', payload: { diff: distanceOf(a, b), was: plainDiff } });
}
