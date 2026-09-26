/**
 * gated-cells — 첫 시각에 적은 값이 방해 입력을 건너가는가 (RNN · GRU · LSTM).
 *
 * 한 판: 시각 1 에 쓰기 입력 x 를 넣고, 시각 2..gap+1 에 방해 입력 gap 개를 넣는다.
 * 시각 t ≥ 2 마다 셀이 들고 가는 상태에 곱해지는 몫(한 시각 기울기)을 셈하고,
 * 그 곱(남은 몫 = ∂상태_끝 / ∂상태_1)을 쌓는다.
 *
 * 셀의 식 (IR 과 같은 차례 · 같은 식 — `cellStep` 하나를 IR 이 그대로 옮긴다):
 *   σ(z) = 1 / (1 + exp(−z)) · tanhExp(a) = e = exp(−2|a|), (1 − e)/(1 + e), a < 0 이면 부호를 뒤집는다
 *   RNN   h = tanhExp(w_x·x + w_h·h + b)                           곱한 몫 w_h·(1 − h²)
 *   GRU   z = σ(·) · r = σ(·) · h̃ = tanhExp(w_x·x + w_h·(r·h) + b)   곱한 몫 z + (1 − z)·(1 − h̃²)·w_h·r
 *         h = z·h + (1 − z)·h̃   (z · r · h̃ 는 이전 h 로 셈한다)
 *   LSTM  f · i · o = σ(·) · g = tanhExp(·) · c = f·c + i·g · h = o·tanhExp(c)   곱한 몫 f (c 길을 잰다)
 * 문(f i o · z r)과 LSTM 후보 g 는 x 만 본다 — 그 w_h 가 0 이 아니면 던진다 (곱한 몫의 식이 그 위에 있다).
 * 무작위는 없다. 동률 판정도 없다 (셈한 값을 그대로 보인다).
 *
 * 이벤트 (payload 는 전부 배정도 그대로 — 자르는 것은 무대의 표시뿐):
 *   init        silent  { cell: string, lanes: { id: string, value: number }[], carried: string,
 *                         gateIds: string[], candidateId: string | null, xs: number[] }
 *                         — 걸음 0 을 갈아 끼운다. xs 길이 = gap + 1 (시각의 자리 수)
 *   phase       silent  { phase: string }
 *   cell-step           { step: number (1 부터), x: number, gates: { id: string, value: number }[],
 *                         candidate: number | null, lanes: { id: string, value: number }[],
 *                         factor: number | null (시각 1 은 null), kept: number }
 *   kept-share          { kept: number, count: number, lo: number, hi: number }
 *                         — count = 곱한 몫의 개수(gap), lo · hi = 곱한 몫의 가장 작은 값 · 가장 큰 값
 *
 * phase 어휘 (irs.ts 와 같다): `rnn-step` · `gru-step` · `lstm-step` (그 셀일 때 걸음 1..gap+1) · `kept-share` (끝 걸음).
 * 걸음 0 에는 phase 가 없다 — projector 가 init 에서 코드 강조를 끈다.
 *
 * 계기 (정수만):
 *   kept-percent  남은 몫의 정수 % — (kept·100).toFixed(0). 걸음 0 에 0 · 걸음 1 에 100 · 이후 그 걸음의 남은 몫
 *   gates         문의 수 (role `gate` 의 개수 — RNN 0 · GRU 2 · LSTM 3). 걸음 0 에 보낸다
 *
 * 손잡이 (reactive): `cell` = 셀 순번 (cells 의 자리) · `gap` = 방해 입력 수 (gapLadder 의 값).
 * 한 판을 끝까지 재생 → 입력 대기 → 받은 값으로 처음 상태에서 다시 재생.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CellWeight = { id: string; role: 'gate' | 'candidate'; w: number[] };

export type GatedCellsData = {
  type: 'gated-cells';
  stepMs: number;
  write: number;
  distract: number[];
  cells: string[];
  cell: number;
  gapLadder: number[];
  gap: number;
  weights: Record<string, CellWeight[]>;
};

/** 셀의 종류 — 순번 0 · 1 · 2 가 IR 의 `cell` 갈래와 같다. */
export const CELL_KINDS = ['RNN', 'GRU', 'LSTM'] as const;
export type CellKind = (typeof CELL_KINDS)[number];

/** IR 에 건네는 평평한 무게 목록의 차례 — (셀, 식별자, 역할, x 만 보는가). */
const FLAT_ORDER: readonly { cell: CellKind; id: string; role: 'gate' | 'candidate'; xOnly: boolean }[] = [
  { cell: 'RNN', id: 'h', role: 'candidate', xOnly: false },
  { cell: 'GRU', id: 'z', role: 'gate', xOnly: true },
  { cell: 'GRU', id: 'r', role: 'gate', xOnly: true },
  { cell: 'GRU', id: 'h', role: 'candidate', xOnly: false },
  { cell: 'LSTM', id: 'f', role: 'gate', xOnly: true },
  { cell: 'LSTM', id: 'i', role: 'gate', xOnly: true },
  { cell: 'LSTM', id: 'g', role: 'candidate', xOnly: true },
  { cell: 'LSTM', id: 'o', role: 'gate', xOnly: true },
];

// ── 좁히개 ─────────────────────────────────────────────────────────────

function numberList(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`gated-cells: ${what} 는 수의 목록이어야 한다`);
  return v.map((n, k) => {
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`gated-cells: ${what}[${k}] 가 수가 아니다`);
    return n;
  });
}

function finite(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`gated-cells: ${what} 가 수가 아니다`);
  return v;
}

export function readData(raw: unknown): GatedCellsData {
  if (typeof raw !== 'object' || raw === null) throw new Error('gated-cells: 데이터가 없다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'gated-cells') throw new Error('gated-cells: type 이 gated-cells 가 아니다');
  const stepMs = finite(d.stepMs, 'stepMs');
  const write = finite(d.write, 'write');
  const distract = numberList(d.distract, 'distract');
  const gapLadder = numberList(d.gapLadder, 'gapLadder');
  for (const g of gapLadder) {
    if (!Number.isInteger(g) || g < 1 || g > distract.length) {
      throw new Error(`gated-cells: 사이 ${g} 가 방해 입력 ${distract.length} 개에 맞지 않는다`);
    }
  }
  if (!Array.isArray(d.cells) || d.cells.length !== CELL_KINDS.length) {
    throw new Error('gated-cells: cells 는 RNN · GRU · LSTM 셋이어야 한다');
  }
  const cells = d.cells.map((c, k) => {
    if (c !== CELL_KINDS[k]) throw new Error(`gated-cells: cells[${k}] 는 ${CELL_KINDS[k]} 여야 한다`);
    return c as string;
  });
  const cell = finite(d.cell, 'cell');
  if (!Number.isInteger(cell) || cell < 0 || cell >= cells.length) throw new Error(`gated-cells: cell ${cell} 가 사다리 밖`);
  const gap = finite(d.gap, 'gap');
  if (!gapLadder.includes(gap)) throw new Error(`gated-cells: gap ${gap} 가 사다리 밖`);
  if (typeof d.weights !== 'object' || d.weights === null) throw new Error('gated-cells: weights 가 없다');
  const rawW = d.weights as Record<string, unknown>;
  const weights: Record<string, CellWeight[]> = {};
  for (const kind of CELL_KINDS) {
    const list = rawW[kind];
    if (!Array.isArray(list)) throw new Error(`gated-cells: weights.${kind} 가 목록이 아니다`);
    weights[kind] = list.map((item, k) => {
      if (typeof item !== 'object' || item === null) throw new Error(`gated-cells: weights.${kind}[${k}] 모양`);
      const it = item as Record<string, unknown>;
      if (typeof it.id !== 'string') throw new Error(`gated-cells: weights.${kind}[${k}].id`);
      if (it.role !== 'gate' && it.role !== 'candidate') throw new Error(`gated-cells: weights.${kind}[${k}].role`);
      const w = numberList(it.w, `weights.${kind}[${k}].w`);
      if (w.length !== 3) throw new Error(`gated-cells: weights.${kind}[${k}].w 는 (w_x, w_h, b) 셋`);
      return { id: it.id, role: it.role, w };
    });
  }
  return { type: 'gated-cells', stepMs, write, distract, cells, cell, gapLadder, gap, weights };
}

/** 데이터의 weights 를 IR 매개변수 차례(스물넷)로 편다. 모양이 어긋나면 던진다. */
export function flattenWeights(weights: Record<string, CellWeight[]>): number[] {
  const out: number[] = [];
  for (const kind of CELL_KINDS) {
    const expected = FLAT_ORDER.filter((e) => e.cell === kind).map((e) => e.id);
    const got = weights[kind].map((e) => e.id);
    if (got.length !== expected.length || got.some((id) => !expected.includes(id))) {
      throw new Error(`gated-cells: weights.${kind} 는 ${expected.join(' · ')} 여야 한다`);
    }
  }
  for (const e of FLAT_ORDER) {
    const found = weights[e.cell].find((w) => w.id === e.id);
    if (!found) throw new Error(`gated-cells: weights.${e.cell} 에 ${e.id} 가 없다`);
    if (found.role !== e.role) throw new Error(`gated-cells: ${e.cell}.${e.id} 의 역할은 ${e.role}`);
    if (e.xOnly && found.w[1] !== 0) throw new Error(`gated-cells: ${e.cell}.${e.id} 는 x 만 본다 — w_h 가 0 이어야 한다`);
    out.push(found.w[0], found.w[1], found.w[2]);
  }
  return out;
}

/** 문의 수 — role `gate` 의 개수. */
export function gateCount(weights: Record<string, CellWeight[]>, kind: CellKind): number {
  return weights[kind].filter((w) => w.role === 'gate').length;
}

// ── 셈 (IR 과 같은 식) ─────────────────────────────────────────────────

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function tanhExp(a: number): number {
  const e = Math.exp(-2 * Math.abs(a));
  const th = (1 - e) / (1 + e);
  if (a < 0) return -th;
  return th;
}

export type CellStepResult = {
  h: number;
  c: number;
  factor: number;
  gates: { id: string; value: number }[];
  candidate: number | null;
};

/** 한 시각. w 는 평평한 스물넷 (차례는 FLAT_ORDER). */
export function cellStep(kind: CellKind, x: number, h: number, c: number, w: readonly number[]): CellStepResult {
  if (w.length !== 24) throw new Error(`gated-cells: 무게 목록 길이 ${w.length} ≠ 24`);
  if (kind === 'RNN') {
    const nh = tanhExp(w[0] * x + w[1] * h + w[2]);
    return { h: nh, c: 0, factor: w[1] * (1 - nh * nh), gates: [], candidate: null };
  }
  if (kind === 'GRU') {
    const z = sigmoid(w[3] * x + w[4] * h + w[5]);
    const r = sigmoid(w[6] * x + w[7] * h + w[8]);
    const ht = tanhExp(w[9] * x + w[10] * (r * h) + w[11]);
    const factor = z + (1 - z) * (1 - ht * ht) * w[10] * r;
    const nh = z * h + (1 - z) * ht;
    return {
      h: nh,
      c: 0,
      factor,
      gates: [
        { id: 'z', value: z },
        { id: 'r', value: r },
      ],
      candidate: ht,
    };
  }
  const f = sigmoid(w[12] * x + w[13] * h + w[14]);
  const i = sigmoid(w[15] * x + w[16] * h + w[17]);
  const g = tanhExp(w[18] * x + w[19] * h + w[20]);
  const o = sigmoid(w[21] * x + w[22] * h + w[23]);
  const nc = f * c + i * g;
  const nh = o * tanhExp(nc);
  return {
    h: nh,
    c: nc,
    factor: f,
    gates: [
      { id: 'f', value: f },
      { id: 'i', value: i },
      { id: 'o', value: o },
    ],
    candidate: g,
  };
}

/** 한 판 전부 — 걸음 1..n 의 결과와 남은 몫. 무대 · 검사가 같은 셈을 본다. */
export function runCell(kind: CellKind, xs: readonly number[], w: readonly number[]) {
  let h = 0;
  let c = 0;
  let kept = 1;
  const steps: (CellStepResult & { x: number; kept: number })[] = [];
  for (let s = 0; s < xs.length; s += 1) {
    const r = cellStep(kind, xs[s], h, c, w);
    h = r.h;
    c = r.c;
    if (s >= 1) kept = kept * r.factor;
    steps.push({ ...r, x: xs[s], kept });
  }
  return { steps, kept };
}

/** 정수 백분율 — (x·100).toFixed(0). */
export function percent(x: number): number {
  return Number((x * 100).toFixed(0));
}

// ── 알고리즘 ───────────────────────────────────────────────────────────

type MetricName = 'kept-percent' | 'gates';

export async function gatedCellsAlgorithm(ctx: FacetContext<GatedCellsData>): Promise<void> {
  const rctx = ctx as ReactiveContext<GatedCellsData>;
  const data = readData(ctx.data);
  const flat = flattenWeights(data.weights);
  const cellLadder = data.cells.map((_, k) => k);

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다.
  const shown: Record<MetricName, number> = { 'kept-percent': 0, gates: 0 };
  const show = (name: MetricName, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRound = async (cellIdx: number, gap: number): Promise<boolean> => {
    const kind = CELL_KINDS[cellIdx];
    const xs = [data.write, ...data.distract.slice(0, gap)];
    const lanesOf = (h: number, c: number) =>
      kind === 'LSTM'
        ? [
            { id: 'c', value: c },
            { id: 'h', value: h },
          ]
        : [{ id: 'h', value: h }];
    const gateIds = data.weights[kind].filter((w) => w.role === 'gate').map((w) => w.id);
    const candidate = data.weights[kind].find((w) => w.role === 'candidate');
    if (!candidate) throw new Error(`gated-cells: ${kind} 에 후보가 없다`);

    // 걸음 0 — 빈 사슬 · 상태 0
    show('kept-percent', 0);
    show('gates', gateCount(data.weights, kind));
    await ctx.emit({
      type: 'init',
      payload: {
        cell: kind,
        lanes: lanesOf(0, 0),
        carried: kind === 'LSTM' ? 'c' : 'h',
        gateIds,
        candidateId: gateIds.length === 0 ? null : candidate.id,
        xs,
      },
      silent: true,
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    const run = runCell(kind, xs, flat);
    let lo = Infinity;
    let hi = -Infinity;
    for (let s = 0; s < run.steps.length; s += 1) {
      if (ctx.cancelled) return false;
      const r = run.steps[s];
      if (s >= 1) {
        lo = Math.min(lo, r.factor);
        hi = Math.max(hi, r.factor);
      }
      if (kind === 'RNN') await phase('rnn-step');
      else if (kind === 'GRU') await phase('gru-step');
      else await phase('lstm-step');
      await ctx.emit({
        type: 'cell-step',
        payload: {
          step: s + 1,
          x: r.x,
          gates: r.gates,
          candidate: gateIds.length === 0 ? null : r.candidate,
          lanes: lanesOf(r.h, r.c),
          factor: s >= 1 ? r.factor : null,
          kept: r.kept,
        },
      });
      show('kept-percent', percent(r.kept));
      if (!(await rctx.sleep(data.stepMs))) return false;
    }

    // 끝 — 첫 시각 뒤 상태가 끝 상태에 남긴 몫
    await phase('kept-share');
    await ctx.emit({ type: 'kept-share', payload: { kept: run.kept, count: gap, lo, hi } });
    show('kept-percent', percent(run.kept));
    return true;
  };

  let cell = data.cell;
  let gap = data.gap;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(cell, gap))) return;
      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'cell' && input.type !== 'gap') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) throw new Error('gated-cells: 손잡이 payload 가 없다');
        const value = (p as { value?: unknown }).value;
        if (typeof value !== 'number') throw new Error('gated-cells: 손잡이 값이 수가 아니다');
        if (input.type === 'cell') {
          if (!cellLadder.includes(value)) throw new Error(`gated-cells: 셀 ${value} 가 사다리 밖`);
          cell = value;
        } else {
          if (!data.gapLadder.includes(value)) throw new Error(`gated-cells: 사이 ${value} 가 사다리 밖`);
          gap = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
