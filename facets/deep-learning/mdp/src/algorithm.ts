/**
 * mdp — 마르코프 결정 과정과 가치 반복. 모형(전이 · 상)을 다 아는 **계획자**가 격자의 값 표를 바퀴마다 채운다.
 * 행위자가 격자를 걷는 이야기가 아니다 — 끝의 길은 "화살표를 뜻대로 따라가면" 이다.
 *
 * ── 손잡이 (reactive) ──────────────────────────────────────────────────────
 *   `gamma` — 할인율 γ, 사다리 `data.gammaLadder`
 *   `slip`  — 미끄러짐 p, 사다리 `data.slipLadder`
 *   한 판 = 처음 상태(V 모두 0)에서 바퀴 `data.sweeps` 번 + 길 긋기. 손잡이를 돌리면 처음부터 다시 셈한다.
 *
 * ── 셈 (IR `sweep` · `actionValue` · `outcome` · `moveTo` · `followPolicy` 와 한 벌) ──
 *   방향 차례 0 위 · 1 오른 · 2 아래 · 3 왼. 이동은 한 칸, 격자 밖이면 제자리.
 *   결과(d) = 들어간 칸 종류 k 가 0 이면 rewards[k] + γ·V[다음], 끝 칸이면 rewards[k].
 *   q(칸, a) = (1 − 2p)·결과(a) → + p·결과((a + 3) % 4) → + p·결과((a + 1) % 4). p = 0 이어도 셋을 이 차례로 더한다.
 *   한 바퀴는 야코비 — 옛 V 에서 읽어 nextValues 에 쓰고 끝에 V 로 옮긴다. 끝 칸은 V 0 · 화살표 −1.
 *   동률 규칙: 엄격한 `>` 로 견주어 동률이면 차례 앞 방향. 네 q 가 모두 같으면 화살표 없음(−1).
 *   이 데이터에서 "네 q 가 모두 같음" 은 바퀴 1..2 의 먼 칸(q 가 모두 정확히 0)에서 실제로 걸린다.
 *   고른 q 와 다른 q 의 0 아닌 가장 작은 차는 0.00102 (아홉 조합 · 모든 바퀴) — 실수 동률 걱정 없음.
 *   길: 출발에서 화살표를 뜻대로 따라가 끝 칸에 든 이동 수. 한도 안에 못 들면 −1, 화살표 없는 칸이면 −2 (던진다).
 *   무작위는 쓰지 않는다 — 가치 반복은 기댓값으로 셈한다.
 *
 * ── 이벤트 ────────────────────────────────────────────────────────────────
 *   phase      { phase: 'init' | 'backup' | 'path' }                      silent
 *   run-start  { gamma, slip, rows, cols, kinds: number[], rewards: number[],
 *                start, sweeps, valueScale, stepMs }                                silent (걸음 0 — 뒤의 sleep 이 경계)
 *   sweep      { sweep, values: number[], policy: number[], turned: number[],
 *                change, startValue, nonZero }                              걸음 (바퀴 하나)
 *   path       { moves, cells: number[], arrows: string, endKind }          걸음 (끝 걸음)
 *   run-start 는 판 머리의 걸음 0 을 세운다 (silent). 재생의 경계는 `sleep` 과 `waitForInput` 이다. valueScale = 상의 절댓값 가운데 가장 큰 것 (음영 막대의 축척).
 *   turned = 이번 바퀴에 화살표가 바뀐 칸 번호, nonZero = 값이 0 아닌 빈 칸 수.
 *
 * ── phase 어휘 (irs.ts 와 같다) ─────────────────────────────────────────────
 *   init (resetValues) · backup (sweep 과 그 아래) · path (followPolicy)
 *   걸음 0 은 init, 바퀴 걸음은 backup, 끝 걸음은 path 가 마지막 phase 다.
 *
 * ── 계기 (이번 판의 지금 값 — 판 머리에서 0) ─────────────────────────────────
 *   sweeps        지난 바퀴 수
 *   arrows-turned 이번 바퀴에 화살표가 바뀐 칸 수
 *   path-moves    끝 걸음의 길 이동 수 (그 전 0)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MdpData = {
  type: 'mdp';
  stepMs: number;
  rows: number;
  cols: number;
  /** 칸 종류 — 0 빈 칸 · 1 작은 목표 · 2 큰 목표 · 3 구덩이 (1..3 은 끝 칸). 칸 번호 = 행·cols + 열, 행 0 이 위 */
  cells: number[];
  start: number;
  /** 종류별 그 칸에 들어가는 이동의 상 */
  rewards: number[];
  sweeps: number;
  pathLimit: number;
  gammaLadder: number[];
  slipLadder: number[];
  /** 손잡이의 처음 값 (segments 의 default 와 같다) */
  gamma: number;
  slip: number;
};

const ARROWS = ['↑', '→', '↓', '←'] as const;

function numberList(v: unknown, name: string): number[] {
  if (!Array.isArray(v)) throw new Error(`[mdp] ${name} 은 수의 배열이어야 한다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`[mdp] ${name}[${i}] 가 수가 아니다`);
    return x;
  });
}

function intField(o: Record<string, unknown>, name: string): number {
  const v = o[name];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`[mdp] ${name} 은 정수여야 한다`);
  return v;
}

function numField(o: Record<string, unknown>, name: string): number {
  const v = o[name];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`[mdp] ${name} 은 수여야 한다`);
  return v;
}

/** ctx.data 좁히개 — 모양이 어긋나면 던진다. */
export function readMdpData(raw: unknown): MdpData {
  if (typeof raw !== 'object' || raw === null) throw new Error('[mdp] initialData 가 없다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'mdp') throw new Error('[mdp] initialData.type 은 mdp 여야 한다');
  const rows = intField(o, 'rows');
  const cols = intField(o, 'cols');
  const cells = numberList(o.cells, 'cells');
  const rewards = numberList(o.rewards, 'rewards');
  if (rows < 1 || cols < 1 || cells.length !== rows * cols) throw new Error('[mdp] cells 의 길이가 rows × cols 가 아니다');
  for (const k of cells) {
    if (!Number.isInteger(k) || k < 0 || k >= rewards.length) throw new Error(`[mdp] 모르는 칸 종류 ${k}`);
  }
  const start = intField(o, 'start');
  if (start < 0 || start >= cells.length || cells[start] !== 0) throw new Error('[mdp] 출발은 빈 칸이어야 한다');
  const sweeps = intField(o, 'sweeps');
  const pathLimit = intField(o, 'pathLimit');
  if (sweeps < 1 || pathLimit < 1) throw new Error('[mdp] sweeps · pathLimit 은 1 이상');
  const gammaLadder = numberList(o.gammaLadder, 'gammaLadder');
  const slipLadder = numberList(o.slipLadder, 'slipLadder');
  const gamma = numField(o, 'gamma');
  const slip = numField(o, 'slip');
  if (!gammaLadder.includes(gamma)) throw new Error('[mdp] gamma 가 사다리에 없다');
  if (!slipLadder.includes(slip)) throw new Error('[mdp] slip 이 사다리에 없다');
  for (const g of gammaLadder) if (!(g > 0 && g < 1)) throw new Error('[mdp] γ 는 0 과 1 사이');
  for (const p of slipLadder) if (!(p >= 0 && p <= 0.5)) throw new Error('[mdp] 미끄러짐은 0 과 0.5 사이');
  const stepMs = numField(o, 'stepMs');
  return { type: 'mdp', stepMs, rows, cols, cells, start, rewards, sweeps, pathLimit, gammaLadder, slipLadder, gamma, slip };
}

// ── 셈 — IR 과 한 벌 ──────────────────────────────────────────────────────

export function moveTo(r: number, c: number, d: number, rows: number, cols: number): number {
  let nr = r;
  let nc = c;
  if (d === 0) nr = r - 1;
  if (d === 1) nc = c + 1;
  if (d === 2) nr = r + 1;
  if (d === 3) nc = c - 1;
  if (nr < 0) nr = r;
  if (nr >= rows) nr = r;
  if (nc < 0) nc = c;
  if (nc >= cols) nc = c;
  return nr * cols + nc;
}

function at(xs: readonly number[], i: number): number {
  const v = xs[i];
  if (v === undefined) throw new Error(`[mdp] 색인 ${i} 가 범위 밖`);
  return v;
}

export function outcome(
  kinds: readonly number[], rewards: readonly number[], values: readonly number[],
  r: number, c: number, d: number, rows: number, cols: number, gamma: number,
): number {
  const j = moveTo(r, c, d, rows, cols);
  const k = at(kinds, j);
  if (k === 0) return at(rewards, k) + gamma * at(values, j);
  return at(rewards, k);
}

export function actionValue(
  kinds: readonly number[], rewards: readonly number[], values: readonly number[],
  r: number, c: number, a: number, rows: number, cols: number, gamma: number, slip: number,
): number {
  const leftDir = (a + 3) % 4;
  const rightDir = (a + 1) % 4;
  let q = (1 - 2 * slip) * outcome(kinds, rewards, values, r, c, a, rows, cols, gamma);
  q = q + slip * outcome(kinds, rewards, values, r, c, leftDir, rows, cols, gamma);
  q = q + slip * outcome(kinds, rewards, values, r, c, rightDir, rows, cols, gamma);
  return q;
}

export function resetValues(values: number[]): void {
  for (let i = 0; i < values.length; i++) values[i] = 0;
}

/** 한 바퀴 (야코비). values · policy 를 고쳐 쓰고 가장 큰 |바뀜| 을 돌려준다. */
export function sweep(
  kinds: readonly number[], rewards: readonly number[], values: number[], nextValues: number[], policy: number[],
  rows: number, cols: number, gamma: number, slip: number,
): number {
  let change = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (at(kinds, i) !== 0) {
        nextValues[i] = 0;
        policy[i] = -1;
      } else {
        let best = actionValue(kinds, rewards, values, r, c, 0, rows, cols, gamma, slip);
        let worst = best;
        let arg = 0;
        for (let a = 1; a < 4; a++) {
          const q = actionValue(kinds, rewards, values, r, c, a, rows, cols, gamma, slip);
          if (q > best) {
            best = q;
            arg = a;
          }
          worst = Math.min(worst, q);
        }
        nextValues[i] = best;
        if (best > worst) policy[i] = arg;
        else policy[i] = -1;
        change = Math.max(change, Math.abs(best - at(values, i)));
      }
    }
  }
  for (let i = 0; i < values.length; i++) values[i] = at(nextValues, i);
  return change;
}

/** 출발에서 화살표를 뜻대로 따라간다. 지난 칸 번호를 path 에 쓰고 끝 칸에 든 이동 수를 돌려준다. */
export function followPolicy(
  policy: readonly number[], kinds: readonly number[], start: number,
  rows: number, cols: number, limit: number, path: number[],
): number {
  let i = start;
  path[0] = i;
  for (let n = 1; n <= limit; n++) {
    const a = at(policy, i);
    if (a < 0) return -2;
    i = moveTo(Math.floor(i / cols), i % cols, a, rows, cols);
    path[n] = i;
    if (at(kinds, i) !== 0) return n;
  }
  return -1;
}

// ── 한 판의 셈 ────────────────────────────────────────────────────────────

export type MdpSweepFrame = {
  sweep: number;
  values: number[];
  policy: number[];
  turned: number[];
  change: number;
  startValue: number;
  nonZero: number;
};

export type MdpRun = {
  gamma: number;
  slip: number;
  frames: MdpSweepFrame[];
  moves: number;
  cells: number[];
  arrows: string;
  endKind: number;
};

/** 손잡이 값 하나의 판 전체를 셈한다 (처음 상태에서). */
export function planMdp(data: MdpData, gamma: number, slip: number): MdpRun {
  const { rows, cols, cells: kinds, rewards, start } = data;
  const n = rows * cols;
  const values = new Array<number>(n).fill(1);
  resetValues(values);
  const nextValues = new Array<number>(n).fill(0);
  const policy = new Array<number>(n).fill(-1);
  const frames: MdpSweepFrame[] = [];
  for (let k = 1; k <= data.sweeps; k++) {
    const before = policy.slice();
    const change = sweep(kinds, rewards, values, nextValues, policy, rows, cols, gamma, slip);
    const turned: number[] = [];
    for (let i = 0; i < n; i++) if (policy[i] !== before[i]) turned.push(i);
    let nonZero = 0;
    for (let i = 0; i < n; i++) if (kinds[i] === 0 && values[i] !== 0) nonZero++;
    frames.push({
      sweep: k,
      values: values.slice(),
      policy: policy.slice(),
      turned,
      change,
      startValue: at(values, start),
      nonZero,
    });
  }
  const path = new Array<number>(data.pathLimit + 1).fill(-1);
  const moves = followPolicy(policy, kinds, start, rows, cols, data.pathLimit, path);
  if (moves < 0) throw new Error(`[mdp] 길이 끝 칸에 들지 못했다 (${moves})`);
  const cells = path.slice(0, moves + 1);
  let arrows = '';
  for (let s = 0; s < moves; s++) {
    const a = at(cells, s);
    const b = at(cells, s + 1);
    const d = at(policy, a);
    if (moveTo(Math.floor(a / cols), a % cols, d, rows, cols) !== b) throw new Error('[mdp] 길과 화살표가 어긋난다');
    arrows += ARROWS[d];
  }
  return { gamma, slip, frames, moves, cells, arrows, endKind: at(kinds, at(cells, moves)) };
}

// ── 재생 ──────────────────────────────────────────────────────────────────

export async function mdpAlgorithm(ctx: FacetContext<MdpData>): Promise<void> {
  const rctx = ctx as ReactiveContext<MdpData>;
  const data = readMdpData(ctx.data);
  let gamma = data.gamma;
  let slip = data.slip;
  const valueScale = Math.max(...data.rewards.map((x) => Math.abs(x)));

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    ctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRun = async (): Promise<boolean> => {
    const run = planMdp(data, gamma, slip);
    setMetric('sweeps', 0);
    setMetric('arrows-turned', 0);
    setMetric('path-moves', 0);
    await phase('init');
    await ctx.emit({
      type: 'run-start',
      payload: {
        gamma, slip, rows: data.rows, cols: data.cols, kinds: data.cells.slice(), rewards: data.rewards.slice(),
        start: data.start, sweeps: data.sweeps, valueScale, stepMs: data.stepMs,
      },
      silent: true,
    });
    if (!(await rctx.sleep(data.stepMs))) return false;
    for (const f of run.frames) {
      if (ctx.cancelled) return false;
      await phase('backup');
      await ctx.emit({
        type: 'sweep',
        payload: {
          sweep: f.sweep, values: f.values, policy: f.policy, turned: f.turned,
          change: f.change, startValue: f.startValue, nonZero: f.nonZero,
        },
      });
      setMetric('sweeps', f.sweep);
      setMetric('arrows-turned', f.turned.length);
      if (!(await rctx.sleep(data.stepMs))) return false;
    }
    await phase('path');
    await ctx.emit({
      type: 'path',
      payload: { moves: run.moves, cells: run.cells, arrows: run.arrows, endKind: run.endKind },
    });
    setMetric('path-moves', run.moves);
    return true;
  };

  try {
    while (true) {
      if (ctx.cancelled) return;
      if (!(await playRun())) return;
      // 한 판이 끝났다 — 손잡이를 기다린다.
      let changed = false;
      while (!changed) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'gamma' && input.type !== 'slip') continue;
        // 우리 손잡이의 입력인데 모양이 어긋나면 던진다 (C6) — 다른 입력만 흘린다
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) throw new Error(`[mdp] ${input.type} 입력의 payload 가 객체가 아니다`);
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') throw new Error(`[mdp] ${input.type} 입력의 value 가 수가 아니다`);
        if (input.type === 'gamma') {
          if (!data.gammaLadder.includes(value)) throw new Error(`[mdp] γ ${value} 가 사다리에 없다`);
          gamma = value;
        } else {
          if (!data.slipLadder.includes(value)) throw new Error(`[mdp] 미끄러짐 ${value} 가 사다리에 없다`);
          slip = value;
        }
        changed = true;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
