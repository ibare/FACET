/**
 * 퍼셉트론 학습 규칙 — 끝나는가.
 *
 * 점 열을 적힌 차례로 한 바퀴 보는 것이 에폭 하나다. 점마다 합 s = w0 + w1·x1 + w2·x2 를 셈해
 * s > 0 이면 켜짐(ŷ = 1), 아니면 꺼짐(ŷ = 0) — **합이 0 이면 꺼짐**이다. 틀리면 d = y − ŷ 로
 * w0 += d · w1 += d·x1 · w2 += d·x2 (η 1). 에폭 끝에서 두 가지를 본다.
 *
 *   - 멈춤   그 에폭의 틀린 수가 0
 *   - 되풀이 에폭 끝의 무게 셋이 앞선 에폭 끝(에폭 0 = 첫 무게) 무게 셋과 모두 같다 — 차례가
 *            고정이라 같은 무게에서 시작한 에폭은 같은 에폭이 되므로, 그 뒤로 끝없이 되풀이된다
 *
 * 셈은 `perceptronTrain` 하나다 — IR `perceptronTrain` 과 한 줄씩 같고, 걸음은 갈고리(점 하나 봄 ·
 * 갱신 하나)로 모은다. 정수뿐이라 여섯 언어가 끝자리까지 같다. 경계선의 두 끝점 · 켜짐 쪽 다각형 ·
 * 식 글자 · 눈금 · 에폭 칸 수처럼 IR 이 셈하지 않는 화면 값만 여기서 따로 셈한다.
 *
 * 동률 규칙: 합 s = 0 이면 꺼짐 (이 데이터에서 판마다 1 · 4 · 3 · 3 · 5 번 실제로 걸린다).
 *
 * ── 이벤트 (발신 차례: init → [start → (phase sweep → epoch)×E → phase stop|repeat → verdict] 판마다)
 *   init     silent. 무대의 자리 — 첫 판 앞에 한 번
 *            { points: {id, x1, x2, y}[] (p3 의 좌표는 지금 손잡이 자리), movingId: string,
 *              ladder: {x1, x2}[], lo: number, hi: number, grid: number[], ticks: number[],
 *              epochColumns: number, errorMax: number, errorTicks: number[], axisNames: string[2] }
 *   start    걸음 #0. 판 머리 — 옮긴 점의 새 자리와 첫 무게
 *            { value: number, position: {x1, x2}, w: number[3], wText: string, formula: string,
 *              side: 'split' | 'allOff' | 'allOn' }
 *   epoch    걸음 #1 … #E. 에폭 하나
 *            { epoch: number, errors: number, updates: number, w: number[3], wText: string,
 *              visits: { index: number, s: number, on: number, wrong: boolean,
 *                        w: number[3], formula: string,
 *                        line: number[4] | null, region: number[] (x1, x2 쌍의 평탄 배열),
 *                        side: 'split' | 'allOff' | 'allOn' }[] }
 *            visits[].w · line · region · formula 는 그 점을 본 **뒤**(틀렸으면 갱신 뒤) 의 값
 *   verdict  걸음 #E+1. 판정
 *            { kind: 'stop' | 'repeat', epoch: number, errors: number, pair: number (멈춤이면 −1),
 *              w: number[3], wText: string, pairLine: number[4] | null }
 *   phase    silent. { phase: 'sweep' | 'stop' | 'repeat' } — 그 걸음의 발신 **앞에** 보낸다
 *
 * ── phase 어휘 (irs.ts 와 같다): sweep · stop · repeat. 걸음 #0 에는 켜지는 phase 가 없다
 *    (projector 가 start 에서 코드 패널 강조를 끈다)
 *
 * ── 계기: `epochs` (지금까지 돈 에폭) · `updates` (지금까지 한 갱신). 판 머리(#0)에서 둘 다 0 으로.
 *
 * ── 손잡이: `movedPoint` — 사다리(`ladder`)의 순번 0 … 4. 판 하나를 끝까지 재생한 뒤 입력을 기다린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PerceptronPoint = { id: string; x1: number | null; x2: number | null; y: number };
export type PerceptronSpot = { x1: number; x2: number };

export type PerceptronData = {
  type: 'perceptron';
  stepMs: number;
  /** 점 열 — 적힌 차례가 곧 에폭 안에서 보는 차례. 옮기는 점의 좌표는 null (사다리에서 온다). */
  points: PerceptronPoint[];
  /** 손잡이로 옮기는 점의 식별자 */
  movingId: string;
  /** 옮기는 점의 자리 사다리 — 손잡이 값 = 순번 */
  ladder: PerceptronSpot[];
  /** 손잡이 기본값 */
  movedPoint: number;
  /** 평면 범위 [lo, hi] × [lo, hi] */
  lo: number;
  hi: number;
  /** 에폭 상한 */
  maxEpochs: number;
};

export type Weights = [number, number, number];

/** 갈고리 — 점 하나를 본 직후(`look`)와 갱신 하나 직후(`update`). */
export type TrainHook = (kind: 'look' | 'update', epoch: number, index: number, s: number, value: number) => void;

/**
 * IR `perceptronTrain` 과 한 줄씩 같은 셈. 정수만.
 * 돌려줌: ep > 0 = 에폭 ep 에서 틀린 점 0 (멈춤) · −ep = 에폭 ep 끝의 무게가 에폭 hit[0] 끝의 무게와 같음
 * (되풀이) · 0 = 상한. 버퍼 길이: w 3 · seen* maxEpochs + 1 · errs maxEpochs · hit 1.
 */
export function perceptronTrain(
  xs1: number[],
  xs2: number[],
  ys: number[],
  w: number[],
  seen0: number[],
  seen1: number[],
  seen2: number[],
  errs: number[],
  hit: number[],
  maxEpochs: number,
  hook?: TrainHook,
): number {
  const n = ys.length;
  w[0] = 0;
  w[1] = 0;
  w[2] = 0;
  seen0[0] = 0;
  seen1[0] = 0;
  seen2[0] = 0;
  for (let ep = 1; ep <= maxEpochs; ep += 1) {
    let e = 0;
    for (let i = 0; i < n; i += 1) {
      const s = w[0]! + w[1]! * xs1[i]! + w[2]! * xs2[i]!;
      let yh = 0;
      if (s > 0) yh = 1; // 같으면 꺼짐
      hook?.('look', ep, i, s, yh);
      if (yh !== ys[i]) {
        e += 1;
        const d = ys[i]! - yh;
        w[0] = w[0]! + d;
        w[1] = w[1]! + d * xs1[i]!;
        w[2] = w[2]! + d * xs2[i]!;
        hook?.('update', ep, i, s, d);
      }
    }
    errs[ep - 1] = e;
    if (e === 0) return ep;
    for (let k = 0; k < ep; k += 1) {
      if (seen0[k] === w[0] && seen1[k] === w[1] && seen2[k] === w[2]) {
        hit[0] = k;
        return -ep;
      }
    }
    seen0[ep] = w[0]!;
    seen1[ep] = w[1]!;
    seen2[ep] = w[2]!;
  }
  return 0;
}

// ── 1차 데이터 읽기 ───────────────────────────────────────────────────────

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** ctx.data 를 좁힌다. 모양이 틀리면 던진다 (C6). */
export function readPerceptronData(raw: unknown): PerceptronData {
  if (typeof raw !== 'object' || raw === null) throw new Error('perceptron: 데이터가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'perceptron') throw new Error('perceptron: type 이 perceptron 이 아니다');
  const { stepMs, movingId, movedPoint, lo, hi, maxEpochs } = d;
  if (typeof stepMs !== 'number' || stepMs <= 0) throw new Error('perceptron: stepMs');
  if (typeof movingId !== 'string') throw new Error('perceptron: movingId');
  if (!isInt(movedPoint) || !isInt(lo) || !isInt(hi) || !isInt(maxEpochs) || hi <= lo || maxEpochs < 1) {
    throw new Error('perceptron: movedPoint · lo · hi · maxEpochs 는 정수');
  }
  if (!Array.isArray(d.points) || d.points.length === 0) throw new Error('perceptron: points 가 비었다');
  const points: PerceptronPoint[] = d.points.map((p: unknown) => {
    if (typeof p !== 'object' || p === null) throw new Error('perceptron: 점이 객체가 아니다');
    const q = p as Record<string, unknown>;
    if (typeof q.id !== 'string' || (q.y !== 0 && q.y !== 1)) throw new Error('perceptron: 점의 id · y');
    const moving = q.id === movingId;
    if (moving ? q.x1 !== null || q.x2 !== null : !isInt(q.x1) || !isInt(q.x2)) {
      throw new Error(`perceptron: 점 ${q.id} 의 좌표`);
    }
    return { id: q.id, x1: moving ? null : (q.x1 as number), x2: moving ? null : (q.x2 as number), y: q.y };
  });
  if (points.filter((p) => p.id === movingId).length !== 1) throw new Error('perceptron: 옮기는 점이 하나가 아니다');
  if (!Array.isArray(d.ladder) || d.ladder.length === 0) throw new Error('perceptron: ladder 가 비었다');
  const ladder: PerceptronSpot[] = d.ladder.map((s: unknown) => {
    const q = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>;
    if (!isInt(q.x1) || !isInt(q.x2)) throw new Error('perceptron: 사다리 자리는 정수 좌표');
    return { x1: q.x1, x2: q.x2 };
  });
  if (movedPoint < 0 || movedPoint >= ladder.length) throw new Error('perceptron: 기본값이 사다리 밖');
  return { type: 'perceptron', stepMs, points, movingId, ladder, movedPoint, lo, hi, maxEpochs };
}

/** 손잡이 값 하나로 점 열의 좌표를 채운다. */
export function placePoints(data: PerceptronData, value: number): { xs1: number[]; xs2: number[]; ys: number[] } {
  const spot = data.ladder[value];
  if (!spot) throw new Error(`perceptron: 손잡이 값 ${value} 이 사다리 밖`);
  const xs1: number[] = [];
  const xs2: number[] = [];
  const ys: number[] = [];
  for (const p of data.points) {
    const moving = p.id === data.movingId;
    const x1 = moving ? spot.x1 : p.x1;
    const x2 = moving ? spot.x2 : p.x2;
    if (x1 === null || x2 === null) throw new Error(`perceptron: 점 ${p.id} 의 좌표가 없다`);
    xs1.push(x1);
    xs2.push(x2);
    ys.push(p.y);
  }
  return { xs1, xs2, ys };
}

/** 한 판의 셈 — 버퍼를 만들어 `perceptronTrain` 을 부르고, 갈고리로 걸음을 모은다. */
export type Visit = { index: number; s: number; on: number; wrong: boolean; w: Weights };
export type EpochRecord = { epoch: number; errors: number; visits: Visit[]; w: Weights };
export type Run = {
  result: number;
  kind: 'stop' | 'repeat' | 'cap';
  endEpoch: number;
  pair: number;
  epochs: EpochRecord[];
  /** 에폭 k 끝의 무게 (0 = 첫 무게) */
  seen: Weights[];
  updates: number;
  ties: number;
};

export function runPerceptron(data: PerceptronData, value: number, order?: number[]): Run {
  const placed = placePoints(data, value);
  const idx = order ?? placed.ys.map((_, i) => i);
  const xs1 = idx.map((i) => placed.xs1[i]!);
  const xs2 = idx.map((i) => placed.xs2[i]!);
  const ys = idx.map((i) => placed.ys[i]!);
  const m = data.maxEpochs;
  const w = [0, 0, 0];
  const seen0 = new Array<number>(m + 1).fill(0);
  const seen1 = new Array<number>(m + 1).fill(0);
  const seen2 = new Array<number>(m + 1).fill(0);
  const errs = new Array<number>(m).fill(0);
  const hit = [0];
  const epochs: EpochRecord[] = [];
  let updates = 0;
  let ties = 0;
  const cur = (): Weights => [w[0]!, w[1]!, w[2]!];
  const result = perceptronTrain(xs1, xs2, ys, w, seen0, seen1, seen2, errs, hit, m, (kind, ep, i, s, v) => {
    if (epochs.length < ep) epochs.push({ epoch: ep, errors: 0, visits: [], w: cur() });
    const rec = epochs[ep - 1]!;
    if (kind === 'look') {
      if (s === 0) ties += 1;
      rec.visits.push({ index: idx[i]!, s, on: v, wrong: v !== ys[i], w: cur() });
    } else {
      const last = rec.visits[rec.visits.length - 1];
      if (!last || last.index !== idx[i]) throw new Error('perceptron: 갱신 갈고리가 봄 갈고리 뒤에 오지 않았다');
      last.w = cur();
      rec.errors += 1;
      updates += 1;
    }
    rec.w = cur();
  });
  const endEpoch = Math.abs(result);
  for (const rec of epochs) {
    if (rec.errors !== errs[rec.epoch - 1]) throw new Error('perceptron: 갈고리가 센 틀린 수와 errs 가 다르다');
  }
  const seen: Weights[] = [];
  for (let k = 0; k < endEpoch; k += 1) seen.push([seen0[k]!, seen1[k]!, seen2[k]!]);
  return {
    result,
    kind: result > 0 ? 'stop' : result < 0 ? 'repeat' : 'cap',
    endEpoch: result === 0 ? m : endEpoch,
    pair: result < 0 ? hit[0]! : -1,
    epochs,
    seen,
    updates,
    ties,
  };
}

// ── 화면 값 (IR 이 셈하지 않는 것) ───────────────────────────────────────

/** 경계선 s = 0 을 평면 [lo, hi]² 로 자른 두 끝점 [x1a, x2a, x1b, x2b]. 선이 없거나 평면에 닿지 않으면 null. */
export function boundarySegment(w: readonly number[], lo: number, hi: number): number[] | null {
  const [w0, w1, w2] = [w[0]!, w[1]!, w[2]!];
  if (w1 === 0 && w2 === 0) return null;
  const pts: [number, number][] = [];
  const add = (a: number, b: number): void => {
    if (a < lo - 1e-9 || a > hi + 1e-9 || b < lo - 1e-9 || b > hi + 1e-9) return;
    if (pts.some(([p, q]) => Math.abs(p - a) < 1e-9 && Math.abs(q - b) < 1e-9)) return;
    pts.push([a, b]);
  };
  if (w2 !== 0) {
    add(lo, -(w0 + w1 * lo) / w2);
    add(hi, -(w0 + w1 * hi) / w2);
  }
  if (w1 !== 0) {
    add(-(w0 + w2 * lo) / w1, lo);
    add(-(w0 + w2 * hi) / w1, hi);
  }
  if (pts.length < 2) return null;
  return [pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1]];
}

/** 켜짐 쪽(s > 0)을 평면 [lo, hi]² 로 자른 다각형 — x1, x2 쌍의 평탄 배열. 없으면 빈 배열. */
export function onRegion(w: readonly number[], lo: number, hi: number): number[] {
  const [w0, w1, w2] = [w[0]!, w[1]!, w[2]!];
  const sOf = (p: [number, number]): number => w0 + w1 * p[0] + w2 * p[1];
  const square: [number, number][] = [[lo, lo], [hi, lo], [hi, hi], [lo, hi]];
  const out: [number, number][] = [];
  for (let i = 0; i < square.length; i += 1) {
    const a = square[i]!;
    const b = square[(i + 1) % square.length]!;
    const sa = sOf(a);
    const sb = sOf(b);
    if (sa > 0) out.push(a);
    if ((sa > 0) !== (sb > 0) && sa !== sb) {
      const r = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]);
    }
  }
  if (out.length < 3) return [];
  return out.flat();
}

/** 경계선의 모양 — 평면을 가르는가, 평면 전체가 꺼짐 · 켜짐 쪽인가. */
export type Side = 'split' | 'allOff' | 'allOn';

export function sideOf(w: readonly number[], lo: number, hi: number): Side {
  if (onRegion(w, lo, hi).length === 0) return 'allOff';
  if (boundarySegment(w, lo, hi) === null) return 'allOn';
  return 'split';
}

// ── 무대가 받는 모양 (projector 가 payload 를 좁혀 만든다) ─────────────────

export type InitView = {
  points: { id: string; x1: number; x2: number; y: number }[];
  movingId: string;
  ladder: PerceptronSpot[];
  lo: number;
  hi: number;
  grid: number[];
  ticks: number[];
  epochColumns: number;
  errorMax: number;
  errorTicks: number[];
  axisNames: string[];
};
export type StartView = { position: PerceptronSpot; wText: string; formula: string; side: Side };
export type VisitView = { index: number; wrong: boolean; formula: string; line: number[] | null; region: number[]; side: Side };
export type EpochView = { epoch: number; errors: number; wText: string; visits: VisitView[] };
export type VerdictView = { kind: 'stop' | 'repeat'; epoch: number; errors: number; pair: number; wText: string; pairLine: number[] | null };

/** 수 하나 — 음수는 수학 빼기 기호로. */
function num(v: number): string {
  return v < 0 ? `−${-v}` : `${v}`;
}

/** 무게 셋을 (w0, w1, w2) 꼴로. */
export function weightsText(w: readonly number[]): string {
  return `(${num(w[0]!)}, ${num(w[1]!)}, ${num(w[2]!)})`;
}

/** 합의 식 s = w0 + w1·x1 + w2·x2 에 무게를 넣은 글자. */
export function sumFormula(w: readonly number[]): string {
  const term = (v: number, x: string): string => `${v < 0 ? ' − ' : ' + '}${Math.abs(v)}·${x}`;
  return `s = ${num(w[0]!)}${term(w[1]!, 'x1')}${term(w[2]!, 'x2')}`;
}

/** lo … hi 를 step 간격으로. */
function ladderOf(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi; v += step) out.push(v);
  return out;
}

// ── 알고리즘 ─────────────────────────────────────────────────────────────

type Input = { type: string; payload?: unknown };

export async function perceptronAlgorithm(ctx0: FacetContext<PerceptronData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<PerceptronData>;
  const data = readPerceptronData(ctx.data);
  const phase = (name: string): Promise<void> => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다 (누적 채널). 처음 한 번은 차이 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    shown.set(name, value);
    if (prev === undefined || prev !== value) ctx.metric(name, value - (prev ?? 0));
  };

  // 에폭 칸 수 — 사다리 전체에서 가장 긴 판의 끝 에폭 (판 사이에 칸이 바뀌지 않게)
  let epochColumns = 0;
  for (let v = 0; v < data.ladder.length; v += 1) epochColumns = Math.max(epochColumns, runPerceptron(data, v).endEpoch);
  const n = data.points.length;

  const pointsAt = (value: number): { id: string; x1: number; x2: number; y: number }[] => {
    const placed = placePoints(data, value);
    return data.points.map((p, i) => ({ id: p.id, x1: placed.xs1[i]!, x2: placed.xs2[i]!, y: p.y }));
  };

  await ctx.emit({
    type: 'init',
    payload: {
      points: pointsAt(data.movedPoint),
      movingId: data.movingId,
      ladder: data.ladder.map((s) => ({ x1: s.x1, x2: s.x2 })),
      lo: data.lo,
      hi: data.hi,
      grid: ladderOf(data.lo, data.hi, 1),
      ticks: ladderOf(data.lo, data.hi, 3),
      epochColumns,
      errorMax: n,
      errorTicks: ladderOf(0, n, 5),
      axisNames: ['x1', 'x2'],
    },
    silent: true,
  });

  const playRound = async (value: number): Promise<boolean> => {
    const run = runPerceptron(data, value);
    if (run.kind === 'cap') throw new Error(`perceptron: 에폭 상한 ${data.maxEpochs} 에 닿았다 — 이 데이터에는 없어야 한다`);
    const spot = data.ladder[value]!;
    const w0: Weights = [0, 0, 0];

    // 걸음 #0 — 판 머리. 켜지는 phase 없음
    setMetric('epochs', 0);
    setMetric('updates', 0);
    await ctx.emit({
      type: 'start',
      payload: {
        value,
        position: { x1: spot.x1, x2: spot.x2 },
        w: w0,
        wText: weightsText(w0),
        formula: sumFormula(w0),
        side: sideOf(w0, data.lo, data.hi),
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // 걸음 #1 … #E — 에폭 하나씩
    let updates = 0;
    for (const rec of run.epochs) {
      if (ctx.cancelled) return false;
      updates += rec.errors;
      await phase('sweep');
      setMetric('epochs', rec.epoch);
      setMetric('updates', updates);
      await ctx.emit({
        type: 'epoch',
        payload: {
          epoch: rec.epoch,
          errors: rec.errors,
          updates,
          w: rec.w,
          wText: weightsText(rec.w),
          visits: rec.visits.map((v) => ({
            index: v.index,
            s: v.s,
            on: v.on,
            wrong: v.wrong,
            w: v.w,
            formula: sumFormula(v.w),
            line: boundarySegment(v.w, data.lo, data.hi),
            region: onRegion(v.w, data.lo, data.hi),
            side: sideOf(v.w, data.lo, data.hi),
          })),
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return false;
    }

    // 걸음 #E+1 — 판정
    const last = run.epochs[run.epochs.length - 1]!;
    if (run.kind === 'stop') {
      await phase('stop');
      await ctx.emit({
        type: 'verdict',
        payload: { kind: 'stop', epoch: run.endEpoch, errors: last.errors, pair: -1, w: last.w, wText: weightsText(last.w), pairLine: null },
      });
    } else {
      const pairW = run.seen[run.pair]!;
      await phase('repeat');
      await ctx.emit({
        type: 'verdict',
        payload: {
          kind: 'repeat',
          epoch: run.endEpoch,
          errors: last.errors,
          pair: run.pair,
          w: last.w,
          wText: weightsText(last.w),
          pairLine: boundarySegment(pairW, data.lo, data.hi),
        },
      });
    }
    return true;
  };

  let current = data.movedPoint;
  try {
    while (!ctx.cancelled) {
      if (!(await playRound(current))) return;
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input: Input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'movedPoint') continue;
        const p = input.payload;
        const v = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= data.ladder.length) {
          throw new Error(`perceptron: movedPoint 값이 사다리 밖이다 — ${String(v)}`);
        }
        next = v;
      }
      current = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
