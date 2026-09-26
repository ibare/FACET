/**
 * convolution — 같은 3×3 창을 같은 8×8 입력에 대되, 보폭과 패딩이 창이 앉는 자리 · 출력의 크기 ·
 * 창이 끝내 닿지 못하는 가장자리를 어떻게 가르는지 한 판씩 돈다.
 *
 * 모형: 교차 상관(창을 뒤집지 않는다) · 편향 없음 · 채널 하나.
 *   출력 (r, c) = Σᵢ Σⱼ 두른격자[r·s + i][c·s + j] × 창[i][j]
 *   출력 한 변 o = ⌊(n + 2p − k) / s⌋ + 1
 * 좌표는 (행, 열) · 0 부터 · 행은 위에서 아래로. 창의 자리 = 창 왼위 칸(두른 격자 기준). 앉는 차례는 행 우선.
 * 알고리즘은 두른 격자를 명시적으로 만들고 창을 2 차원으로 돈다. 입력 칸마다 창에 든 횟수(쓰임)도
 * 창이 앉을 때마다 2 차원으로 센다. 버린 칸 = 쓰임이 0 인 입력 칸.
 * 동률 규칙 — 이 셈에는 견주어 고르는 자리가 없다(가장 큰 쓰임은 값만 쓰고 자리를 고르지 않는다).
 *
 * 한 판 = 창이 모든 자리를 한 번씩 도는 것. 걸음(`ctx.sleep` 하나) 차례:
 *   0            round-start — 입력 · 창 · 크기만 잡힌 빈 출력                [output-size]
 *   1 (p = 1)    pad          — 0 한 겹을 두른다                            [pad-zero]
 *   줄마다 한 걸음 row        — 그 줄의 창 자리가 차례로 앉고 출력 한 줄이 적힌다 [window-sum]
 *   끝           cover-summary — 버린 칸과 쓰임을 센다                       [cover-count]
 * 판 끝에서 `waitForInput` 으로 손잡이를 기다리고, 받은 값으로 다음 판을 처음부터 돈다.
 *
 * 이벤트 (payload 스키마):
 *   round-start   (걸음 0 의 발신이라 silent 가 아니다 — 자취는 silent 아닌 발신에서 걸음을 끊는다)
 *     { stride, padding, n, k, o, paddedSide, motionMs,
 *       input: number[][] (n×n), kernel: number[][] (k×k), anchors: [r, c][] (판의 모든 창 자리, 두른 격자 기준) }
 *   pad           { padValue, paddedSide, paddedCells }
 *   row           { row (0 부터), anchors: [r, c][], values: number[], cover: number[][] (n×n, 누적),
 *                   placed (지금까지 앉은 자리), touched (쓰임 > 0 인 입력 칸 수) }
 *   cover-summary { dropped, droppedRows: number[], droppedCols: number[] (0 부터),
 *                   cornerUse, maxUse, cover: number[][] }
 *   phase         silent: true · { phase } — 그 걸음의 발신 **앞에** 보낸다. 뒤에 보내면 자취에서 다음 걸음에 묶여
 *                 되짚기 때 코드 패널이 한 걸음씩 밀린다
 *
 * phase 어휘 (irs.ts 와 정확히 같다): output-size · pad-zero · window-sum · cover-count
 *
 * 계기:
 *   positions      앉은 자리 — 줄 걸음마다 그 줄의 자리 수만큼 오른다
 *   weights        무게 수 — 걸음 0 에 k·k(= 9), 이후 그대로
 *   dropped-cells  버린 입력 칸 — 끝 걸음에 선다, 그 전엔 0
 *   판 머리에서 셋 모두 0 으로 되돌리고, 지금 값과의 차이만 보낸다(처음 한 번은 차이 0 이어도 보낸다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ConvolutionData = {
  type: 'convolution';
  stepMs: number;
  /** 한 걸음 안에서 창이 옮겨 다니는 운동의 길이 (재생 속도 1 기준) */
  motionMs: number;
  input: number[][];
  kernel: number[][];
  /** 두르는 값 */
  padValue: number;
  strideLadder: number[];
  paddingLadder: number[];
  /** 첫 판의 손잡이 값 — facet.ts 의 segments 기본값과 같다 (테스트가 잠근다) */
  initialStride: number;
  initialPadding: number;
};

/** 한 줄 걸음의 셈 */
export type ConvolutionRow = {
  row: number;
  anchors: [number, number][];
  values: number[];
  cover: number[][];
  placed: number;
  touched: number;
};

/** 한 판의 셈 전부 */
export type ConvolutionRound = {
  stride: number;
  padding: number;
  n: number;
  k: number;
  o: number;
  paddedSide: number;
  paddedCells: number;
  padded: number[][];
  anchors: [number, number][];
  rows: ConvolutionRow[];
  output: number[][];
  cover: number[][];
  dropped: number;
  droppedRows: number[];
  droppedCols: number[];
  cornerUse: number;
  maxUse: number;
};

function isIntGrid(v: unknown, rows: number, cols: number): v is number[][] {
  return (
    Array.isArray(v) &&
    v.length === rows &&
    v.every((row) => Array.isArray(row) && row.length === cols && row.every((x) => Number.isInteger(x)))
  );
}

function isIntList(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => Number.isInteger(x));
}

/** ctx.data 를 좁힌다. 모양이 어긋나면 던진다. */
export function readConvolutionData(raw: unknown): ConvolutionData {
  if (typeof raw !== 'object' || raw === null) throw new Error('convolution: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'convolution') throw new Error(`convolution: 자료의 type 이 'convolution' 이 아니다 (${String(d.type)})`);
  if (typeof d.stepMs !== 'number' || d.stepMs < 800) throw new Error('convolution: stepMs 가 800 이상의 수가 아니다');
  if (typeof d.motionMs !== 'number' || d.motionMs < 0) throw new Error('convolution: motionMs 가 0 이상의 수가 아니다');
  const input = d.input;
  if (!Array.isArray(input) || input.length === 0) throw new Error('convolution: input 이 비었거나 목록이 아니다');
  const n = input.length;
  if (!isIntGrid(input, n, n)) throw new Error(`convolution: input 이 ${n}×${n} 정수 격자가 아니다`);
  const kernel = d.kernel;
  if (!Array.isArray(kernel) || kernel.length === 0) throw new Error('convolution: kernel 이 비었거나 목록이 아니다');
  const k = kernel.length;
  if (!isIntGrid(kernel, k, k)) throw new Error(`convolution: kernel 이 ${k}×${k} 정수 격자가 아니다`);
  if (k > n) throw new Error('convolution: 창이 입력보다 크다');
  if (!Number.isInteger(d.padValue)) throw new Error('convolution: padValue 가 정수가 아니다');
  const strideLadder = d.strideLadder;
  const paddingLadder = d.paddingLadder;
  if (!isIntList(strideLadder) || strideLadder.some((s) => s < 1)) throw new Error('convolution: strideLadder 가 1 이상의 정수 목록이 아니다');
  if (!isIntList(paddingLadder) || paddingLadder.some((p) => p < 0)) throw new Error('convolution: paddingLadder 가 0 이상의 정수 목록이 아니다');
  if (typeof d.initialStride !== 'number' || !strideLadder.includes(d.initialStride)) throw new Error('convolution: initialStride 가 사다리에 없다');
  if (typeof d.initialPadding !== 'number' || !paddingLadder.includes(d.initialPadding)) throw new Error('convolution: initialPadding 이 사다리에 없다');
  return {
    type: 'convolution',
    stepMs: d.stepMs,
    motionMs: d.motionMs,
    input,
    kernel,
    padValue: d.padValue as number,
    strideLadder,
    paddingLadder,
    initialStride: d.initialStride,
    initialPadding: d.initialPadding,
  };
}

/** 출력 한 변 o = ⌊(n + 2p − k) / s⌋ + 1 */
export function outputSide(n: number, k: number, stride: number, padding: number): number {
  const span = n + 2 * padding - k;
  if (span < 0) throw new Error('convolution: 창이 두른 격자보다 크다');
  return Math.floor(span / stride) + 1;
}

/** 두른 격자를 명시적으로 만든다 */
function padGrid(input: number[][], padding: number, padValue: number): number[][] {
  const n = input.length;
  const side = n + 2 * padding;
  const grid: number[][] = [];
  for (let r = 0; r < side; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < side; c += 1) {
      const ir = r - padding;
      const ic = c - padding;
      const inside = ir >= 0 && ir < n && ic >= 0 && ic < n;
      row.push(inside ? input[ir]![ic]! : padValue);
    }
    grid.push(row);
  }
  return grid;
}

function countTouched(cover: number[][]): number {
  let touched = 0;
  for (const row of cover) for (const x of row) if (x > 0) touched += 1;
  return touched;
}

/** 한 판을 끝까지 셈한다 — 두른 격자를 만들고 창을 2 차원으로 돌며 쓰임도 2 차원으로 센다 */
export function computeRound(data: ConvolutionData, stride: number, padding: number): ConvolutionRound {
  const n = data.input.length;
  const k = data.kernel.length;
  const o = outputSide(n, k, stride, padding);
  const padded = padGrid(data.input, padding, data.padValue);
  const paddedSide = n + 2 * padding;
  const cover: number[][] = data.input.map((row) => row.map(() => 0));
  const output: number[][] = [];
  const anchors: [number, number][] = [];
  const rows: ConvolutionRow[] = [];
  let placed = 0;
  for (let r = 0; r < o; r += 1) {
    const rowAnchors: [number, number][] = [];
    const values: number[] = [];
    for (let c = 0; c < o; c += 1) {
      const top = r * stride;
      const left = c * stride;
      let acc = 0;
      for (let i = 0; i < k; i += 1) {
        for (let j = 0; j < k; j += 1) {
          const pr = top + i;
          const pc = left + j;
          const cell = padded[pr]?.[pc];
          if (cell === undefined) throw new Error(`convolution: 창이 두른 격자 밖 (${pr}, ${pc}) 에 닿는다`);
          acc += cell * data.kernel[i]![j]!;
          const ir = pr - padding;
          const ic = pc - padding;
          if (ir >= 0 && ir < n && ic >= 0 && ic < n) cover[ir]![ic]! += 1;
        }
      }
      rowAnchors.push([top, left]);
      anchors.push([top, left]);
      values.push(acc);
      placed += 1;
    }
    output.push(values);
    rows.push({
      row: r,
      anchors: rowAnchors,
      values,
      cover: cover.map((line) => [...line]),
      placed,
      touched: countTouched(cover),
    });
  }
  let dropped = 0;
  let maxUse = 0;
  for (const line of cover) {
    for (const x of line) {
      if (x === 0) dropped += 1;
      if (x > maxUse) maxUse = x;
    }
  }
  const droppedRows: number[] = [];
  const droppedCols: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (cover[i]!.every((x) => x === 0)) droppedRows.push(i);
    if (cover.every((line) => line[i] === 0)) droppedCols.push(i);
  }
  return {
    stride,
    padding,
    n,
    k,
    o,
    paddedSide,
    paddedCells: paddedSide * paddedSide - n * n,
    padded,
    anchors,
    rows,
    output,
    cover,
    dropped,
    droppedRows,
    droppedCols,
    cornerUse: cover[0]![0]!,
    maxUse,
  };
}

export async function convolutionAlgorithm(rawCtx: FacetContext<ConvolutionData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<ConvolutionData>;
  const data = readConvolutionData(ctx.data);
  const n = data.input.length;
  const k = data.kernel.length;
  const stepWait = data.stepMs + data.motionMs;

  const shown = new Map<string, number>();
  const showMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    shown.set(name, value);
    ctx.metric(name, prev === undefined ? value : value - prev);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let stride = data.initialStride;
  let padding = data.initialPadding;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const round = computeRound(data, stride, padding);

      // 걸음 0 — 입력 · 창 · 크기만 잡힌 빈 출력
      showMetric('positions', 0);
      showMetric('weights', k * k);
      showMetric('dropped-cells', 0);
      await phase('output-size');
      await ctx.emit({
        type: 'round-start',
        payload: {
          stride,
          padding,
          n,
          k,
          o: round.o,
          paddedSide: round.paddedSide,
          motionMs: data.motionMs,
          input: data.input.map((row) => [...row]),
          kernel: data.kernel.map((row) => [...row]),
          anchors: round.anchors.map(([r, c]) => [r, c]),
        },
      });
      if (!(await ctx.sleep(stepWait))) return;

      // 걸음 1 — 두른다 (패딩이 있을 때만)
      if (padding > 0) {
        await phase('pad-zero');
        await ctx.emit({
          type: 'pad',
          payload: { padValue: data.padValue, paddedSide: round.paddedSide, paddedCells: round.paddedCells },
        });
        if (!(await ctx.sleep(stepWait))) return;
      }

      // 줄마다 한 걸음
      for (const row of round.rows) {
        if (ctx.cancelled) return;
        showMetric('positions', row.placed);
        await phase('window-sum');
        await ctx.emit({
          type: 'row',
          payload: {
            row: row.row,
            anchors: row.anchors.map(([r, c]) => [r, c]),
            values: [...row.values],
            cover: row.cover.map((line) => [...line]),
            placed: row.placed,
            touched: row.touched,
          },
        });
        if (!(await ctx.sleep(stepWait))) return;
      }

      // 끝 — 버린 칸과 쓰임
      showMetric('dropped-cells', round.dropped);
      await phase('cover-count');
      await ctx.emit({
        type: 'cover-summary',
        payload: {
          dropped: round.dropped,
          droppedRows: [...round.droppedRows],
          droppedCols: [...round.droppedCols],
          cornerUse: round.cornerUse,
          maxUse: round.maxUse,
          cover: round.cover.map((line) => [...line]),
        },
      });
      if (!(await ctx.sleep(stepWait))) return;

      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'stride' && data.strideLadder.includes(value)) {
          stride = value;
          break;
        }
        if (input.type === 'padding' && data.paddingLadder.includes(value)) {
          padding = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
