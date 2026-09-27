/**
 * 미적분의 기본 정리 — 오른쪽 끝을 밀며 쌓인 넓이가 늘어나는 빠르기는 그 자리의 높이다.
 *
 * 곡선 f(t) 는 항 목록 `[[계수, 지수], …]` 로 온다. 오른쪽 끝 x 가 데이터의 자리들을
 * 차례로 밟는다. 자리마다 셈하는 것:
 *   - 쌓인 넓이 A(x) = 가운데 점 표본 합 Σ f((k + ½)w) · w, k = 0..x/w − 1 (역도함수 식을 쓰지 않는다)
 *   - 쌓이는 빠르기 = (A(x + δ) − A(x)) / δ — 차분으로 잰다 (도함수로 셈하지 않는다)
 *   - 높이 f(x)
 *
 * 이벤트 (payload 스키마):
 *
 *   init    silent: true — 걸음 0 을 갈아 끼운다
 *           { curve: Pt[]            곡선을 그릴 표본점 (t, y)
 *             domain: [number, number]
 *             fRange: [number, number]   곡선 높이의 범위
 *             aRange: [number, number]   A 자취 · 빠르기 끝점의 범위
 *             edges: number[]            오른쪽 끝이 서는 자리 전부
 *             first: Stop }              걸음 0 의 자리 (edges[0])
 *
 *   edge    걸음 — 오른쪽 끝이 다음 자리로 밀려 간다
 *           Stop = { x: number; area: number; rate: number; height: number;
 *                    from: number;            앞 자리의 x (걸음 0 은 x 자신)
 *                    was: number;             앞 자리의 A (걸음 0 은 A 자신)
 *                    path: { x: number; a: number }[]   앞 자리부터 이 자리까지 A 의 표본
 *                    rise: { x: number; a: number } }   (x + 1, A + 빠르기) — 한 칸 갈 때 A 가 닿는 곳
 *
 *   compare 걸음 — 빠르기 차례와 높이 차례를 나란히
 *           { rates: number[]; heights: number[]; tolerance: number; match: boolean }
 *           match = 모든 자리에서 |빠르기 − 높이| ≤ tolerance
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Term = readonly [number, number];

export type FundamentalTheoremFacetData = {
  type: 'fundamental-theorem';
  stepMs: number;
  /** f(t) = Σ 계수 · t^지수 */
  terms: Term[];
  /** 곡선의 정의역 */
  domain: [number, number];
  /** 오른쪽 끝 x 가 서는 자리 (차례대로) */
  edges: number[];
  /** 쌓는 폭 w */
  width: number;
  /** 빠르기를 재는 폭 δ */
  delta: number;
  /** 빠르기와 높이의 같음 판정 허용 오차 */
  tolerance: number;
};

export type Pt = { t: number; y: number };
export type APt = { x: number; a: number };

export type Stop = {
  x: number;
  area: number;
  rate: number;
  height: number;
  from: number;
  was: number;
  path: APt[];
  rise: APt;
};

export type InitPayload = {
  curve: Pt[];
  domain: [number, number];
  fRange: [number, number];
  aRange: [number, number];
  edges: number[];
  first: Stop;
};

export type ComparePayload = {
  rates: number[];
  heights: number[];
  tolerance: number;
  match: boolean;
};

/** 화면의 수식 기호 — 자료다. 번역하지 않는다 */
export const SYMBOLS = { curve: 'f(t)', t: 't', x: 'x', area: 'A(x)' } as const;

/** 곡선 표본점 간격 · A 자취 표본 간격 (그림의 해상도 — 셈의 도구 w 와 다르다) */
const CURVE_STEP = 0.1;
const PATH_STEP = 0.1;
/** 빠르기를 "한 칸 갈 때 오르는 만큼" 으로 보일 때의 한 칸 */
const RISE_RUN = 1;

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 초기 데이터 좁히개 — 알고리즘과 장면이 같은 것을 부른다. */
export function narrowData(raw: unknown): FundamentalTheoremFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('fundamental-theorem: initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'fundamental-theorem') throw new Error(`fundamental-theorem: initialData.type 이 어긋났다 (${String(d.type)})`);
  if (!isNum(d.stepMs) || d.stepMs <= 0) throw new Error('fundamental-theorem: initialData.stepMs 가 양수가 아니다');
  if (!Array.isArray(d.terms) || d.terms.length === 0) throw new Error('fundamental-theorem: initialData.terms 가 비었다');
  const terms: Term[] = d.terms.map((tm, i) => {
    if (!Array.isArray(tm) || tm.length !== 2 || !isNum(tm[0]) || !isNum(tm[1])) {
      throw new Error(`fundamental-theorem: initialData.terms[${i}] 가 [계수, 지수] 가 아니다`);
    }
    return [tm[0], tm[1]] as const;
  });
  if (!Array.isArray(d.domain) || d.domain.length !== 2 || !isNum(d.domain[0]) || !isNum(d.domain[1]) || d.domain[0] >= d.domain[1]) {
    throw new Error('fundamental-theorem: initialData.domain 이 [작은 값, 큰 값] 이 아니다');
  }
  const domain: [number, number] = [d.domain[0], d.domain[1]];
  if (!Array.isArray(d.edges) || d.edges.length < 2) throw new Error('fundamental-theorem: initialData.edges 가 둘보다 적다');
  const edges = d.edges.map((e, i) => {
    if (!isNum(e)) throw new Error(`fundamental-theorem: initialData.edges[${i}] 가 수가 아니다`);
    if (e < domain[0] || e > domain[1]) throw new Error(`fundamental-theorem: initialData.edges[${i}] = ${e} 가 정의역 밖이다`);
    if (i > 0 && e <= (d.edges as number[])[i - 1]) throw new Error(`fundamental-theorem: initialData.edges[${i}] 가 앞 자리보다 크지 않다`);
    return e;
  });
  if (!isNum(d.width) || d.width <= 0) throw new Error('fundamental-theorem: initialData.width 가 양수가 아니다');
  if (!isNum(d.delta) || d.delta <= 0) throw new Error('fundamental-theorem: initialData.delta 가 양수가 아니다');
  if (!isNum(d.tolerance) || d.tolerance <= 0) throw new Error('fundamental-theorem: initialData.tolerance 가 양수가 아니다');
  return { type: 'fundamental-theorem', stepMs: d.stepMs, terms, domain, edges, width: d.width, delta: d.delta, tolerance: d.tolerance };
}

/** f(t) = Σ 계수 · t^지수 */
function evalCurve(terms: readonly Term[], t: number): number {
  let s = 0;
  for (const [c, p] of terms) s += c * Math.pow(t, p);
  return s;
}

/** x 가 폭 w 의 몇 칸인가 — 칸에 딱 떨어지지 않으면 던진다. */
function cellsOf(x: number, w: number, what: string): number {
  const n = Math.round(x / w);
  if (Math.abs(n * w - x) > w * 1e-6) throw new Error(`fundamental-theorem: ${what} = ${x} 가 쌓는 폭 ${w} 의 칸에 떨어지지 않는다`);
  return n;
}

/** 화면에 뜨는 수 — 소수 둘째 자리, 음의 영 없이, 빼기는 U+2212. */
export function formatNum(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`fundamental-theorem: 보일 수가 유한하지 않다 (${v})`);
  let s = v.toFixed(2);
  if (/^-0\.0+$/.test(s)) s = s.slice(1);
  return s.replace('-', '−');
}

/** 1차 데이터의 수 — 적힌 그대로, 빼기만 U+2212. */
export function formatRaw(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`fundamental-theorem: 보일 수가 유한하지 않다 (${v})`);
  return String(v).replace('-', '−');
}

type Plan = { init: InitPayload; stops: Stop[]; compare: ComparePayload };

/** 모든 걸음을 먼저 셈한다 — 범위를 걸음 0 에 실어야 하기 때문이다. */
function plan(data: FundamentalTheoremFacetData): Plan {
  const { terms, domain, edges, width: w, delta } = data;
  const [d0, d1] = domain;
  const n0 = cellsOf(d0, w, 'domain[0]');
  if (n0 !== 0) throw new Error('fundamental-theorem: 넓이는 0 에서 쌓는다 — domain[0] 이 0 이 아니다');
  if (edges[0] !== d0) throw new Error('fundamental-theorem: 첫 자리가 정의역의 왼쪽 끝이 아니다');
  const last = edges[edges.length - 1];
  const nMax = cellsOf(last + delta, w, 'x + δ');

  // prefix[k] = 앞 k 칸의 가운데 점 표본 합 = A(k · w)
  const prefix = new Float64Array(nMax + 1);
  for (let k = 0; k < nMax; k += 1) {
    prefix[k + 1] = prefix[k] + evalCurve(terms, (k + 0.5) * w) * w;
  }
  const areaAt = (x: number, what: string): number => prefix[cellsOf(x, w, what)];

  const curve: Pt[] = [];
  const curveCount = Math.round((d1 - d0) / CURVE_STEP);
  for (let i = 0; i <= curveCount; i += 1) {
    const t = i === curveCount ? d1 : d0 + i * CURVE_STEP;
    curve.push({ t, y: evalCurve(terms, t) });
  }

  const stops: Stop[] = [];
  for (let i = 0; i < edges.length; i += 1) {
    const x = edges[i];
    const from = i === 0 ? x : edges[i - 1];
    const area = areaAt(x, `edges[${i}]`);
    const rate = (areaAt(x + delta, `edges[${i}] + δ`) - area) / delta;
    const height = evalCurve(terms, x);
    const path: APt[] = [];
    if (i === 0) {
      path.push({ x, a: area });
    } else {
      const span = x - from;
      const count = Math.max(1, Math.round(span / PATH_STEP));
      for (let j = 0; j <= count; j += 1) {
        const px = j === count ? x : from + (span * j) / count;
        // 표본 자리를 칸에 맞춰 읽는다 (칸 사이면 가장 가까운 칸)
        const k = Math.round(px / w);
        path.push({ x: px, a: prefix[k] });
      }
    }
    const was = i === 0 ? area : stops[i - 1].area;
    stops.push({ x, area, rate, height, from, was, path, rise: { x: x + RISE_RUN, a: area + rate * RISE_RUN } });
  }

  let fLo = Infinity;
  let fHi = -Infinity;
  for (const p of curve) {
    fLo = Math.min(fLo, p.y);
    fHi = Math.max(fHi, p.y);
  }
  fLo = Math.min(fLo, 0);
  fHi = Math.max(fHi, 0);
  let aLo = 0;
  let aHi = 0;
  for (const s of stops) {
    for (const p of s.path) {
      aLo = Math.min(aLo, p.a);
      aHi = Math.max(aHi, p.a);
    }
    aLo = Math.min(aLo, s.rise.a);
    aHi = Math.max(aHi, s.rise.a);
  }

  const rates = stops.map((s) => s.rate);
  const heights = stops.map((s) => s.height);
  const match = stops.every((s) => Math.abs(s.rate - s.height) <= data.tolerance);

  return {
    init: { curve, domain: [d0, d1], fRange: [fLo, fHi], aRange: [aLo, aHi], edges: [...edges], first: stops[0] },
    stops,
    compare: { rates, heights, tolerance: data.tolerance, match },
  };
}

export async function fundamentalTheorem(ctx: FacetContext<FundamentalTheoremFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<FundamentalTheoremFacetData>;
  const data = narrowData(ctx.data);
  const { init, stops, compare } = plan(data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !rctx.cancelled;
  }

  // 걸음 0 — 곡선 · 오른쪽 끝 x 0 · 빠르기와 높이가 이미 읽을 것이라 첫 발신 뒤에 읽을 틈을 준다
  await ctx.emit({ type: 'init', silent: true, payload: init });

  for (let i = 1; i < stops.length; i += 1) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'edge', payload: stops[i] });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'compare', payload: compare });
}
