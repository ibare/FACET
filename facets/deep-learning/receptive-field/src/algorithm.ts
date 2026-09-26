/**
 * 수용 영역과 풀링 — 3×3 합성곱을 층층이 쌓을 때 맨 위 한 칸이 입력의 몇 칸에 기대는가.
 *
 * 쌓는 법: 입력 위에 합성곱을 L 번. 풀링 손잡이가 켜져 있으면 **합성곱 사이에만** 풀링을 끼운다
 * (맨 위 합성곱 뒤에는 두지 않는다 — 그래서 L 1 은 풀링 유무가 같은 쌓임이다).
 * 층 한 변 = (아래 층 한 변 − k) / s + 1. 나머지가 남으면 던진다.
 * 맨 위 칸 = 맨 위 층의 가운데 칸 — 행 · 열 모두 ⌊(o − 1) / 2⌋.
 * 기대는 칸 = 위 층 칸 (r, c) 을 셈하는 데 쓰이는 아래 층 칸 (r·s + i, c·s + j), i · j ∈ 0..k−1 의 합집합.
 * 이 합집합을 2 차원으로 실제로 모으고, 그것이 꽉 찬 직사각형인지 확인한 뒤 행 · 열 범위를 싣는다.
 * 칸의 값은 없다 — 자리만 셈한다. 동률 판정은 없다.
 *
 * ── 이벤트 (알고리즘 → projector)
 *   stack     silent  판 머리. { round, layers: LayerInfo[], weights, extent: { layerCount, sideSum }, motionMs }
 *                     LayerInfo = { id, kind: 'input'|'conv'|'pool', number, side, k, s } — 입력은 k · s 가 0.
 *                     layers 는 입력부터 위로. extent 는 사다리의 모든 조합에서 가장 많은 층 수 · 가장 큰 한 변 합
 *                     (무대가 마운트 뒤 세로를 바꾸지 않고 한 자리에 두기 위한 것)
 *   top-cell  걸음 0. { layer, row, col, side: 1, cells: 1, weights } — row · col 은 0 부터
 *   field     걸음 1… 한 층 아래로. { layer, from, window: 'conv'|'pool', k, s,
 *                     rowLo, rowHi, colLo, colHi, side, cells, last } — 범위는 0 부터 · 양끝 포함
 *   phase     silent  { phase }
 *
 * ── phase 어휘 (irs.ts 와 정확히 같다)
 *   top-cell   걸음 0
 *   descend    입력이 아닌 층으로 내려간 걸음
 *   field-size 입력에 닿은 마지막 걸음
 *
 * ── 계기 (판 머리에서 0 으로 되돌리고 차이만 보낸다)
 *   field-side   지금 걸음의 층에서 기대는 한 변 (걸음 0 에 1)
 *   field-cells  그 칸 수
 *   weights      배우는 무게 수 — 합성곱 층마다 k·k, 풀링 0 (걸음 0 에 선다)
 *
 * ── 입력
 *   { type: 'layers' | 'pool', payload: { value } } — value 가 수가 아니거나 사다리 밖이면 던진다. 다른 type 은 흘린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WindowSpec = { k: number; s: number };

export type ReceptiveFieldData = {
  type: 'receptive-field';
  stepMs: number;
  motionMs: number;
  inputSize: number;
  conv: WindowSpec;
  pool: WindowSpec;
  layers: number;
  usePool: number;
  layersLadder: number[];
  poolLadder: number[];
};

export type LayerKind = 'input' | 'conv' | 'pool';

export type LayerInfo = {
  id: string;
  kind: LayerKind;
  number: number;
  side: number;
  k: number;
  s: number;
};

export type FieldStep = {
  layer: string;
  from: string;
  window: 'conv' | 'pool';
  k: number;
  s: number;
  rowLo: number;
  rowHi: number;
  colLo: number;
  colHi: number;
  side: number;
  cells: number;
  last: boolean;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function positiveInt(x: unknown, where: string): number {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 1) {
    throw new Error(`receptive-field: ${where} 는 1 이상의 정수여야 한다`);
  }
  return x;
}

function windowOf(x: unknown, where: string): WindowSpec {
  if (!isRecord(x)) throw new Error(`receptive-field: ${where} 는 { k, s } 여야 한다`);
  return { k: positiveInt(x.k, `${where}.k`), s: positiveInt(x.s, `${where}.s`) };
}

function ladderOf(x: unknown, where: string): number[] {
  if (!Array.isArray(x) || x.length === 0) throw new Error(`receptive-field: ${where} 가 비었다`);
  return x.map((v, i) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      throw new Error(`receptive-field: ${where}[${i}] 가 0 이상의 정수가 아니다`);
    }
    return v;
  });
}

/** ctx.data 좁히개 — 모양이 어긋나면 던진다. */
export function narrowData(x: unknown): ReceptiveFieldData {
  if (!isRecord(x)) throw new Error('receptive-field: 데이터가 객체가 아니다');
  if (x.type !== 'receptive-field') throw new Error('receptive-field: type 이 receptive-field 가 아니다');
  const layersLadder = ladderOf(x.layersLadder, 'layersLadder');
  const poolLadder = ladderOf(x.poolLadder, 'poolLadder');
  for (const v of layersLadder) if (v < 1) throw new Error('receptive-field: 합성곱 층 수는 1 이상이다');
  for (const v of poolLadder) if (v !== 0 && v !== 1) throw new Error('receptive-field: 풀링 사다리는 0 · 1 뿐이다');
  const layers = positiveInt(x.layers, 'layers');
  if (!layersLadder.includes(layers)) throw new Error('receptive-field: layers 가 사다리에 없다');
  const usePool = x.usePool;
  if (typeof usePool !== 'number' || !poolLadder.includes(usePool)) {
    throw new Error('receptive-field: usePool 이 사다리에 없다');
  }
  return {
    type: 'receptive-field',
    stepMs: positiveInt(x.stepMs, 'stepMs'),
    motionMs: positiveInt(x.motionMs, 'motionMs'),
    inputSize: positiveInt(x.inputSize, 'inputSize'),
    conv: windowOf(x.conv, 'conv'),
    pool: windowOf(x.pool, 'pool'),
    layers,
    usePool,
    layersLadder,
    poolLadder,
  };
}

/** 한 층 크기 — (아래 한 변 − k) / s + 1. 나머지가 남거나 0 이하가 되면 던진다. */
export function outSide(below: number, w: WindowSpec): number {
  const span = below - w.k;
  if (span < 0) throw new Error(`receptive-field: 한 변 ${below} 위에 창 ${w.k} 이 앉지 못한다`);
  if (span % w.s !== 0) throw new Error(`receptive-field: 한 변 ${below} · k ${w.k} · s ${w.s} 에서 나머지가 남는다`);
  return span / w.s + 1;
}

/** 쌓임 — 입력부터 위로. 풀링은 합성곱 사이에만. */
export function buildStack(d: ReceptiveFieldData, layers: number, usePool: number): LayerInfo[] {
  const out: LayerInfo[] = [{ id: 'input', kind: 'input', number: 0, side: d.inputSize, k: 0, s: 0 }];
  let poolNo = 0;
  for (let n = 1; n <= layers; n += 1) {
    if (n > 1 && usePool === 1) {
      poolNo += 1;
      const below = out[out.length - 1]!;
      out.push({ id: `pool${poolNo}`, kind: 'pool', number: poolNo, side: outSide(below.side, d.pool), k: d.pool.k, s: d.pool.s });
    }
    const below = out[out.length - 1]!;
    out.push({ id: `conv${n}`, kind: 'conv', number: n, side: outSide(below.side, d.conv), k: d.conv.k, s: d.conv.s });
  }
  return out;
}

/** 맨 위 칸 — 가운데 (o 짝수면 가운데 둘 중 앞). */
export function topIndex(side: number): number {
  return Math.floor((side - 1) / 2);
}

/** 배우는 무게 수 — 합성곱 층마다 k·k (채널 하나 · 편향 없음), 풀링 0. */
export function weightCount(stack: LayerInfo[]): number {
  let sum = 0;
  for (const l of stack) if (l.kind === 'conv') sum += l.k * l.k;
  return sum;
}

/** 맨 위 칸에서 입력까지 층마다 기대는 칸을 2 차원 합집합으로 모은다. 위에서 아래 차례. */
export function descendFields(stack: LayerInfo[]): FieldStep[] {
  const topLayer = stack[stack.length - 1]!;
  const mid = topIndex(topLayer.side);
  let cells: Array<[number, number]> = [[mid, mid]];
  const steps: FieldStep[] = [];
  for (let li = stack.length - 1; li >= 1; li -= 1) {
    const upper = stack[li]!;
    const lower = stack[li - 1]!;
    const seen = new Set<number>();
    const next: Array<[number, number]> = [];
    for (const [r, c] of cells) {
      for (let i = 0; i < upper.k; i += 1) {
        for (let j = 0; j < upper.k; j += 1) {
          const rr = r * upper.s + i;
          const cc = c * upper.s + j;
          if (rr >= lower.side || cc >= lower.side) {
            throw new Error(`receptive-field: ${upper.id} 의 창이 ${lower.id} 밖으로 나갔다`);
          }
          const key = rr * lower.side + cc;
          if (!seen.has(key)) {
            seen.add(key);
            next.push([rr, cc]);
          }
        }
      }
    }
    let rowLo = Infinity;
    let rowHi = -Infinity;
    let colLo = Infinity;
    let colHi = -Infinity;
    for (const [r, c] of next) {
      rowLo = Math.min(rowLo, r);
      rowHi = Math.max(rowHi, r);
      colLo = Math.min(colLo, c);
      colHi = Math.max(colHi, c);
    }
    const rows = rowHi - rowLo + 1;
    const cols = colHi - colLo + 1;
    if (rows * cols !== next.length) throw new Error(`receptive-field: ${lower.id} 의 기대는 칸이 꽉 찬 직사각형이 아니다`);
    if (rows !== cols) throw new Error(`receptive-field: ${lower.id} 의 기대는 칸이 정사각형이 아니다`);
    steps.push({
      layer: lower.id,
      from: upper.id,
      window: upper.kind === 'pool' ? 'pool' : 'conv',
      k: upper.k,
      s: upper.s,
      rowLo,
      rowHi,
      colLo,
      colHi,
      side: rows,
      cells: next.length,
      last: li === 1,
    });
    cells = next;
  }
  return steps;
}

/** 사다리의 모든 조합에서 가장 많은 층 수 · 가장 큰 한 변 합 — 무대 자리 잡기용. */
export function stackExtent(d: ReceptiveFieldData): { layerCount: number; sideSum: number } {
  let layerCount = 0;
  let sideSum = 0;
  for (const l of d.layersLadder) {
    for (const p of d.poolLadder) {
      const st = buildStack(d, l, p);
      layerCount = Math.max(layerCount, st.length);
      sideSum = Math.max(sideSum, st.reduce((a, x) => a + x.side, 0));
    }
  }
  return { layerCount, sideSum };
}

export async function receptiveFieldAlgorithm(ctx0: FacetContext<ReceptiveFieldData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<ReceptiveFieldData>;
  const d = narrowData(ctx.data);
  const extent = stackExtent(d);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 누적 채널 — 지금 값을 들고 차이만 보낸다. 처음 한 번은 차이 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev === undefined || prev !== value) ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  let layers = d.layers;
  let usePool = d.usePool;
  let round = 0;
  const pause = () => ctx.sleep(d.stepMs + d.motionMs);

  try {
    for (;;) {
      if (ctx.cancelled) return;
      round += 1;
      const stack = buildStack(d, layers, usePool);
      const top = stack[stack.length - 1]!;
      const mid = topIndex(top.side);
      const weights = weightCount(stack);
      const steps = descendFields(stack);

      setMetric('field-side', 0);
      setMetric('field-cells', 0);
      setMetric('weights', 0);
      await ctx.emit({
        type: 'stack',
        payload: { round, layers: stack, weights, extent, motionMs: d.motionMs },
        silent: true,
      });

      // 걸음 0 — 맨 위 칸 하나
      await phase('top-cell');
      await ctx.emit({ type: 'top-cell', payload: { layer: top.id, row: mid, col: mid, side: 1, cells: 1, weights } });
      setMetric('field-side', 1);
      setMetric('field-cells', 1);
      setMetric('weights', weights);
      if (!(await pause())) return;

      // 걸음 1… — 한 층씩 아래로
      for (const st of steps) {
        if (ctx.cancelled) return;
        if (st.last) await phase('field-size');
        else await phase('descend');
        await ctx.emit({ type: 'field', payload: st });
        setMetric('field-side', st.side);
        setMetric('field-cells', st.cells);
        if (!(await pause())) return;
      }

      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        // 우리 것이 아닌 입력은 흘린다
        if (input.type !== 'layers' && input.type !== 'pool') continue;
        const p = input.payload;
        const value = isRecord(p) ? p.value : undefined;
        if (typeof value !== 'number') throw new Error(`receptive-field: ${input.type} 입력의 value 가 수가 아니다`);
        const ladder = input.type === 'layers' ? d.layersLadder : d.poolLadder;
        if (!ladder.includes(value)) throw new Error(`receptive-field: ${input.type} 값 ${value} 이 사다리에 없다`);
        if (input.type === 'layers') layers = value;
        else usePool = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
