/**
 * learned-filter — 0 에서 시작한 3×3 창 하나를 로지스틱 분류기로 배운다. 가려낼 무늬(과제)를
 * 바꾸면 같은 자료 · 같은 처음 무게에서 다시 배우고, 창이 그 무늬의 모양으로 깎인다.
 *
 * 모형:
 *   - 자료 = 무늬 넷(`patterns`, 행 우선 3×3 밝기 0/1)마다 잡음 섞인 벌 `copies` → 조각 열여섯.
 *     생성기는 Park–Miller (x ← 48271·x mod 2147483647, u = x / 2147483647, 첫 u 는 한 번 굴린 뒤).
 *     뽑는 차례: 무늬 차례 → 벌 → 칸 0..8. 칸 값 = min(1, max(0, t + (u − 0.5) · noise)).
 *     자료는 손잡이와 무관하다 — 과제만 바뀐다 (y = 고른 무늬의 조각 1, 나머지 0).
 *   - 한 판 = 조각 전부로 한 번 고친다 (전체 묶음 경사 하강). z_d = Σ w_i x_{d,i} + b (칸 0 부터, b 는 마지막),
 *     p_d = σ(z_d). 모든 p_d 를 셈한 **뒤에** w_i ← w_i − lr · Σ_d (p_d − y_d) x_{d,i} / 16, b 도 같은 꼴.
 *     이 차례가 IR `trainEpoch` 와 같아 값이 비트까지 같다.
 *   - 닮음 = 창 w 와 (무늬 − 평균) 의 코사인. 부호 맞는 칸 = 밝은 칸에서 w > 0 · 어두운 칸에서 w < 0 인 칸 수.
 *     w 가 정확히 0 인 칸을 만나면 던진다 (걸음 1 부터 없다).
 *   - 응답 = 깨끗한 무늬 t 의 z = Σ w_i t_i + b. 가장 큰 하나를 짚는다.
 *     **동률 규칙**: 가장 큰 응답이 둘 이상이면 던진다 (이 데이터에는 없다 — 맨 앞과 둘째의 차 4.30 ~ 4.50).
 *
 * 걸음 (판 하나 = 재생 한 판, 걸음 열):
 *   걸음 0     `round`     창 0 · b 0 · 닮음 셈하지 않음 (코드 패널 끔)
 *   걸음 1..8  `window`    판 5 · 10 · … · 40 의 창
 *   걸음 9     `responses` 깨끗한 무늬 넷의 응답과 가장 큰 하나
 *   그 뒤 손잡이 입력을 기다리고, 받은 과제로 처음 무게에서 다시 배운다 (앞 판의 학습을 잇지 않는다).
 *
 * 이벤트 (payload 스키마 · silent 여부):
 *   `setup`     silent — 마운트 뒤 한 번. {
 *                  patterns: { id: string; cells: number[9] }[],     // 1차 자료 그대로
 *                  pieces: { pattern: number; cells: number[9] }[],  // 생성기로 뽑은 조각 열여섯 (pattern = 무늬 번호)
 *                  epochs: number,                                  // 판 수
 *                  shadeScale: number,                              // 창 음영 축척 = 모든 과제의 보일 판 창에서 |w| 의 최댓값
 *                  similarityRange: [number, number]                // 닮음 축의 끝 (−1, 1)
 *               }
 *   `round`     걸음 0. { target: number (사다리 번호), pattern: number (무늬 번호), ys: number[16],
 *                         weights: number[9], bias: number }
 *   `window`    걸음 1..8. { epoch: number, weights: number[9], bias: number, similarity: number,
 *                         signMatch: number, matches: boolean[9] }
 *   `responses` 걸음 9. { values: number[4] (무늬 차례), strongest: number (무늬 번호) }
 *   `phase`     silent. { phase: 'update' | 'strongest' }
 *
 * phase 어휘 (irs.ts 와 정확히 같다):
 *   `update`    — trainEpoch 의 w[i] 고침 줄과 bias 고침 줄 · 걸음 1..8
 *   `strongest` — strongest 의 비교 `if` · 걸음 9
 *
 * 계기 (판 머리에서 0 으로 되돌리고 지금 값과의 차이만 보낸다):
 *   `epoch`       지난 판 (걸음마다 5 씩 · 40 까지)
 *   `similarity`  닮음 정수 백분율 = floor(닮음 · 100 + 0.5)
 *   `sign-match`  부호 맞는 칸 0..9
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LearnedFilterPattern = { id: string; cells: number[] };

export type LearnedFilterData = {
  type: 'learned-filter';
  stepMs: number;
  patterns: LearnedFilterPattern[];
  targetLadder: string[];
  target: number;
  copies: number;
  noise: number;
  seed: number;
  epochs: number;
  learningRate: number;
  showEvery: number;
  initialWeights: number[];
  initialBias: number[];
};

export const CELLS = 9;
const PM_MODULUS = 2147483647;
const PM_MULTIPLIER = 48271;

function fail(msg: string): never {
  throw new Error(`[learned-filter] ${msg}`);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function numList(v: unknown, len: number, name: string): number[] {
  if (!Array.isArray(v) || v.length !== len) fail(`${name} 는 길이 ${len} 의 수 목록이어야 한다`);
  return v.map((x, i) => (isNum(x) ? x : fail(`${name}[${i}] 가 수가 아니다`)));
}

/** ctx.data 를 좁힌다 — 모양이 어긋나면 던진다. */
export function readLearnedFilterData(raw: unknown): LearnedFilterData {
  if (typeof raw !== 'object' || raw === null) fail('자료가 객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'learned-filter') fail('type 이 learned-filter 가 아니다');
  const int = (k: string, min: number): number => {
    const v = o[k];
    if (!isNum(v) || !Number.isInteger(v) || v < min) fail(`${k} 는 ${min} 이상의 정수여야 한다`);
    return v;
  };
  const stepMs = int('stepMs', 800);
  const copies = int('copies', 1);
  const seed = int('seed', 1);
  if (seed >= PM_MODULUS) fail('seed 가 생성기 범위 밖이다');
  const epochs = int('epochs', 1);
  const showEvery = int('showEvery', 1);
  if (epochs % showEvery !== 0) fail('epochs 가 showEvery 로 나누어떨어지지 않는다');
  const noise = o.noise;
  if (!isNum(noise) || noise < 0) fail('noise 는 0 이상의 수여야 한다');
  const learningRate = o.learningRate;
  if (!isNum(learningRate) || learningRate <= 0) fail('learningRate 는 양수여야 한다');

  if (!Array.isArray(o.patterns) || o.patterns.length === 0) fail('patterns 가 비었다');
  const patterns = o.patterns.map((p, j): LearnedFilterPattern => {
    if (typeof p !== 'object' || p === null) fail(`patterns[${j}] 가 객체가 아니다`);
    const q = p as Record<string, unknown>;
    if (typeof q.id !== 'string' || q.id === '') fail(`patterns[${j}].id 가 없다`);
    const cells = numList(q.cells, CELLS, `patterns[${j}].cells`);
    if (cells.some((c) => c !== 0 && c !== 1)) fail(`patterns[${j}].cells 는 0 과 1 만 담는다`);
    return { id: q.id, cells };
  });
  const ids = patterns.map((p) => p.id);
  if (new Set(ids).size !== ids.length) fail('무늬 식별자가 겹친다');

  if (!Array.isArray(o.targetLadder) || o.targetLadder.length === 0) fail('targetLadder 가 비었다');
  const targetLadder = o.targetLadder.map((v, i) =>
    typeof v === 'string' && ids.includes(v) ? v : fail(`targetLadder[${i}] 가 무늬 식별자가 아니다`),
  );
  const target = int('target', 0);
  if (target >= targetLadder.length) fail('target 이 사다리 밖이다');

  return {
    type: 'learned-filter',
    stepMs,
    patterns,
    targetLadder,
    target,
    copies,
    noise,
    seed,
    epochs,
    learningRate,
    showEvery,
    initialWeights: numList(o.initialWeights, CELLS, 'initialWeights'),
    initialBias: numList(o.initialBias, 1, 'initialBias'),
  };
}

/** 뽑힌 조각들 — xs 는 조각마다 칸 아홉을 이어 붙인 것, kinds 는 조각의 무늬 번호. */
export type LearnedFilterPieces = { xs: number[]; kinds: number[] };

/** Park–Miller 생성기로 조각을 뽑는다. 곱은 2⁴⁷ 안쪽이라 배정도에서 정확하다. */
export function makePieces(d: LearnedFilterData): LearnedFilterPieces {
  let x = d.seed;
  const xs: number[] = [];
  const kinds: number[] = [];
  for (let j = 0; j < d.patterns.length; j += 1) {
    for (let copy = 0; copy < d.copies; copy += 1) {
      for (let i = 0; i < CELLS; i += 1) {
        x = (PM_MULTIPLIER * x) % PM_MODULUS;
        const u = x / PM_MODULUS;
        xs.push(Math.min(1, Math.max(0, d.patterns[j].cells[i] + (u - 0.5) * d.noise)));
      }
      kinds.push(j);
    }
  }
  return { xs, kinds };
}

/** 한 판 — IR `trainEpoch` 와 문 하나하나가 같다. w · bias · ps 를 제자리에서 고친다. */
export function trainEpoch(
  xs: number[],
  ys: number[],
  count: number,
  w: number[],
  bias: number[],
  ps: number[],
  lr: number,
): void {
  for (let d = 0; d < count; d += 1) {
    let z = 0.0;
    for (let i = 0; i < CELLS; i += 1) z = z + w[i] * xs[d * CELLS + i];
    z = z + bias[0];
    ps[d] = 1 / (1 + Math.exp(-z));
  }
  for (let i = 0; i < CELLS; i += 1) {
    let g = 0.0;
    for (let d = 0; d < count; d += 1) g = g + (ps[d] - ys[d]) * xs[d * CELLS + i];
    w[i] = w[i] - (lr * g) / count;
  }
  let gb = 0.0;
  for (let d = 0; d < count; d += 1) gb = gb + (ps[d] - ys[d]);
  bias[0] = bias[0] - (lr * gb) / count;
}

/** 닮음 — 창과 (무늬 − 평균) 의 코사인. 창이 0 이면 셈할 수 없어 던진다. */
export function similarity(w: number[], tmpl: number[]): number {
  let m = 0.0;
  for (let i = 0; i < CELLS; i += 1) m = m + tmpl[i];
  m = m / CELLS;
  let dot = 0.0;
  let nw = 0.0;
  let nt = 0.0;
  for (let i = 0; i < CELLS; i += 1) {
    dot = dot + w[i] * (tmpl[i] - m);
    nw = nw + w[i] * w[i];
    nt = nt + (tmpl[i] - m) * (tmpl[i] - m);
  }
  if (nw === 0 || nt === 0) fail('창이나 무늬가 고르게 0 이라 닮음을 셈할 수 없다');
  return dot / (Math.sqrt(nw) * Math.sqrt(nt));
}

/** 칸마다 부호가 무늬와 맞는가 — 밝은 칸은 w > 0, 어두운 칸은 w < 0. w 가 정확히 0 이면 던진다. */
export function signMatches(w: number[], tmpl: number[]): boolean[] {
  return w.map((v, i) => {
    if (v === 0) fail(`창 칸 ${i + 1} 이 정확히 0 이다`);
    return v > 0 === (tmpl[i] === 1);
  });
}

/** 닮음의 정수 백분율 — floor(닮음 · 100 + 0.5). */
export function similarityPercent(sim: number): number {
  return Math.floor(sim * 100 + 0.5);
}

/** 깨끗한 무늬 넷의 응답 z = Σ w_i t_i + b (칸 0 부터, b 는 마지막). */
export function responses(w: number[], b: number, patterns: LearnedFilterPattern[]): number[] {
  return patterns.map((p) => {
    let z = 0.0;
    for (let i = 0; i < CELLS; i += 1) z = z + w[i] * p.cells[i];
    return z + b;
  });
}

/** 가장 큰 응답의 무늬 번호. 동률이면 던진다. */
export function strongestOf(values: number[]): number {
  let best = 0;
  for (let j = 1; j < values.length; j += 1) if (values[j] > values[best]) best = j;
  if (values.some((v, j) => j !== best && v === values[best])) fail('가장 큰 응답이 둘 이상이다');
  return best;
}

export type LearnedFilterShot = {
  epoch: number;
  weights: number[];
  bias: number;
  similarity: number;
  signMatch: number;
  matches: boolean[];
};

export type LearnedFilterRun = {
  pattern: number;
  ys: number[];
  shots: LearnedFilterShot[];
  weights: number[];
  bias: number;
  responses: number[];
  strongest: number;
};

/** 과제 하나로 처음 무게에서 판 epochs 를 배운다. 같은 과제면 같은 결과. */
export function trainFor(d: LearnedFilterData, pieces: LearnedFilterPieces, target: number): LearnedFilterRun {
  const id = d.targetLadder[target];
  if (id === undefined) fail(`과제 번호 ${target} 가 사다리 밖이다`);
  const pattern = d.patterns.findIndex((p) => p.id === id);
  if (pattern < 0) fail(`과제 ${id} 가 무늬에 없다`);
  const tmpl = d.patterns[pattern].cells;
  const ys = pieces.kinds.map((k) => (k === pattern ? 1 : 0));
  const count = ys.length;
  const w = [...d.initialWeights];
  const bias = [...d.initialBias];
  const ps = new Array<number>(count).fill(0);
  const shots: LearnedFilterShot[] = [];
  for (let epoch = 1; epoch <= d.epochs; epoch += 1) {
    trainEpoch(pieces.xs, ys, count, w, bias, ps, d.learningRate);
    if (epoch % d.showEvery === 0) {
      const matches = signMatches(w, tmpl);
      shots.push({
        epoch,
        weights: [...w],
        bias: bias[0],
        similarity: similarity(w, tmpl),
        signMatch: matches.filter(Boolean).length,
        matches,
      });
    }
  }
  const values = responses(w, bias[0], d.patterns);
  return { pattern, ys, shots, weights: [...w], bias: bias[0], responses: values, strongest: strongestOf(values) };
}

/** 창 음영의 축척 — 사다리의 모든 과제에서 보일 판 창의 |w| 가운데 가장 큰 값. 손잡이를 돌려도 같은 자로 잰다. */
export function shadeScaleOf(d: LearnedFilterData, pieces: LearnedFilterPieces): number {
  let scale = 0;
  for (let target = 0; target < d.targetLadder.length; target += 1) {
    for (const shot of trainFor(d, pieces, target).shots) {
      for (const v of shot.weights) scale = Math.max(scale, Math.abs(v));
    }
  }
  if (scale === 0) fail('모든 창이 0 이라 음영 축척을 셈할 수 없다');
  return scale;
}

export async function learnedFilterAlgorithm(ctx: FacetContext<LearnedFilterData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LearnedFilterData>;
  const d = readLearnedFilterData(ctx.data);
  const pieces = makePieces(d);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name);
    ctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  try {
    await ctx.emit({
      type: 'setup',
      payload: {
        patterns: d.patterns.map((p) => ({ id: p.id, cells: [...p.cells] })),
        pieces: pieces.kinds.map((k, n) => ({ pattern: k, cells: pieces.xs.slice(n * CELLS, (n + 1) * CELLS) })),
        epochs: d.epochs,
        shadeScale: shadeScaleOf(d, pieces),
        similarityRange: [-1, 1],
      },
      silent: true,
    });

    let target = d.target;
    for (;;) {
      if (ctx.cancelled) return;
      const run = trainFor(d, pieces, target);

      // 걸음 0 — 창과 b 가 처음 값으로 가라앉는다
      gauge('epoch', 0);
      gauge('similarity', 0);
      gauge('sign-match', 0);
      await ctx.emit({
        type: 'round',
        payload: { target, pattern: run.pattern, ys: run.ys, weights: [...d.initialWeights], bias: d.initialBias[0] },
      });
      if (!(await rctx.sleep(d.stepMs))) return;

      // 걸음 1..8 — 판 5 마다 창
      for (const shot of run.shots) {
        if (ctx.cancelled) return;
        await phase('update');
        await ctx.emit({
          type: 'window',
          payload: {
            epoch: shot.epoch,
            weights: shot.weights,
            bias: shot.bias,
            similarity: shot.similarity,
            signMatch: shot.signMatch,
            matches: shot.matches,
          },
        });
        gauge('epoch', shot.epoch);
        gauge('similarity', similarityPercent(shot.similarity));
        gauge('sign-match', shot.signMatch);
        if (!(await rctx.sleep(d.stepMs))) return;
      }

      // 걸음 9 — 깨끗한 무늬 넷을 창에 댄다
      await phase('strongest');
      await ctx.emit({ type: 'responses', payload: { values: run.responses, strongest: run.strongest } });
      if (!(await rctx.sleep(d.stepMs))) return;

      // 손잡이 입력을 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'target') continue;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= d.targetLadder.length) {
          fail(`손잡이 값 ${String(value)} 가 사다리에 없다`);
        }
        target = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
