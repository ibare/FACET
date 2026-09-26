/**
 * convolution 무대 — 왼쪽에 두를 자리까지 잡은 입력 격자, 가운데 창, 오른쪽에 출력 격자.
 *
 * 운동 (손잡이를 돌리면 옮겨 가는 것):
 *   - 입력 위의 창 자리 표지들이 앞 판의 자리에서 새 판의 자리로 옮겨 간다 (촘촘히 ↔ 성기게)
 *   - 출력 격자가 한 변 o 로 접히고 펼쳐진다 (8×8 ↔ 2×2)
 *   - 두른 0 한 겹이 바깥에서 밀려 들어오고 걷힌다
 *   - 줄 걸음마다 창 틀이 그 줄의 자리를 차례로 옮겨 다니며 표지를 찍고 출력 칸을 적는다
 *   - 끝 걸음에 창이 닿지 못한 행 · 열 위로 띠가 그어지고 그 칸이 흐려진다
 * 무대는 셈하지 않는다 — 출력 값 · 창 자리 · 쓰임 · 버린 줄은 projector 가 넘긴 payload 그대로 그린다.
 * 화면 좌표로 옮기는 것(두른 격자 기준 좌표 + 두를 자리 여백)만 여기서 한다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

/** projector 가 부르는 무대의 표면 */
export type ConvolutionStartArgs = {
  stride: number;
  padding: number;
  n: number;
  k: number;
  o: number;
  paddedSide: number;
  input: number[][];
  kernel: number[][];
  anchors: [number, number][];
};
export type ConvolutionPadArgs = { padValue: number; paddedSide: number; paddedCells: number };
export type ConvolutionRowArgs = {
  row: number;
  anchors: [number, number][];
  values: number[];
  cover: number[][];
  placed: number;
  touched: number;
};
export type ConvolutionSummaryArgs = {
  dropped: number;
  droppedRows: number[];
  droppedCols: number[];
  cornerUse: number;
  maxUse: number;
  cover: number[][];
};
export type ConvolutionStage = {
  start(args: ConvolutionStartArgs, ms: number): void;
  pad(args: ConvolutionPadArgs, ms: number): void;
  row(args: ConvolutionRowArgs, ms: number): void;
  summary(args: ConvolutionSummaryArgs, ms: number): void;
  reset(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 414;
/** 칸 한 변 */
const C = 30;
/** 두르는 겹 수의 최대 — 사다리 [0, 1] */
const MAX_PAD = 1;
/** 입력 한 변의 최대 — 두른 격자 10×10 · 출력 8×8 이 들어갈 자리 */
const MAX_N = 8;
const PX = 40;
const PY = 84;
const KC = 24;
const KX = 372;
const KY = PY + C;
const OX = 470;
const OY = PY + C;
const RING_OUT = 14;
/** 창 자리 표지 — 칸 왼위 모서리에 붙여 칸 글자를 가리지 않는다 */
const MARK_R = 3.5;
const MARK_IN = 5;

const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);

/** 음수는 U+2212 빼기 기호로 */
function signed(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

type Pt = { x: number; y: number };

export const convolutionStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement = svg,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, size: number, fill: string, parent?: SVGElement, anchor = 'start', family: string = fonts.body) =>
      el('text', { x, y, 'font-size': size, 'font-family': family, fill, 'text-anchor': anchor }, parent);

    // ── 애니메이션 — 한 번에 하나. 새 운동이 오면 앞 운동을 끝 상태로 마친다
    let active: { id: number; draw: (k: number) => void } | null = null;
    let destroyed = false;
    const finishActive = (): void => {
      if (!active) return;
      const a = active;
      active = null;
      cancelAnimationFrame(a.id);
      a.draw(1);
    };
    const animate = (ms: number, draw: (k: number) => void): void => {
      finishActive();
      if (ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return;
      }
      const t0 = performance.now();
      const tick = (now: number): void => {
        if (destroyed || !active) return;
        const k = Math.min(1, (now - t0) / ms);
        if (k >= 1) {
          active = null;
          draw(1);
          return;
        }
        draw(k);
        active.id = requestAnimationFrame(tick);
      };
      active = { id: requestAnimationFrame(tick), draw };
    };
    params.onScrubStart?.(() => finishActive());

    // ── 머리 캡션 두 줄 · 구역 이름
    const caption1 = text(20, 24, MD, colors.text);
    const caption2 = text(20, 46, SM, colors.textMuted);
    const inputLabel = text(PX, 66, SM, colors.textMuted);
    inputLabel.textContent = t('label.input', 'Input');
    const kernelLabel = text(KX, KY - 10, SM, colors.textMuted);
    kernelLabel.textContent = t('label.kernel', 'Window');
    const outputLabel = text(OX, OY - 10, SM, colors.textMuted);
    outputLabel.textContent = t('label.output', 'Output');

    // ── 범례
    const legend = el('g', {});
    el('rect', { x: PX, y: H - 22, width: 12, height: 12, fill: colors.itemComparing, 'fill-opacity': 0.5, stroke: colors.border }, legend);
    text(PX + 18, H - 12, XS, colors.textMuted, legend).textContent = t('legend.use', 'Shade: times inside the window');
    el('circle', { cx: PX + 236, cy: H - 16, r: MARK_R + 1, fill: colors.itemActive }, legend);
    text(PX + 246, H - 12, XS, colors.textMuted, legend).textContent = t('legend.anchor', 'Window position (its top-left cell)');

    // ── 층: 두른 겹 · 입력 · 띠 · 표지 · 창 틀 · 창 · 출력
    const ringLayer = el('g', {});
    const inputLayer = el('g', {});
    const bandLayer = el('g', {});
    const markerLayer = el('g', {});
    const windowLayer = el('g', {});
    const kernelLayer = el('g', {});
    const outputLayer = el('g', {});

    type InputCell = { g: SVGGElement; shade: SVGRectElement; value: SVGTextElement; use: SVGTextElement; shadeOp: number };
    let inputCells: InputCell[][] = [];
    const rowLabels: SVGTextElement[] = [];
    const colLabels: SVGTextElement[] = [];
    type RingCell = { g: SVGGElement; value: SVGTextElement; dx: number; dy: number; home: Pt };
    let ring: RingCell[] = [];
    let ringShown = 0; // 0 = 걷힘, 1 = 둘림
    type Marker = { node: SVGCircleElement; pos: Pt; op: number; stamped: boolean };
    let markers: Marker[] = [];
    let markerIndex = new Map<string, number>();
    let windowFrame: SVGRectElement | null = null;
    let windowPos: Pt = { x: PX, y: PY };
    let windowOp = 0;
    type OutCell = { g: SVGGElement; value: SVGTextElement; pos: Pt; op: number };
    const outCells: OutCell[][] = [];
    let outFrame: SVGRectElement | null = null;
    let outSide = 0;
    type Band = { node: SVGRectElement; full: number; vertical: boolean };
    let bands: Band[] = [];
    let n = 0;
    let k = 0;
    let padding = 0;

    const inputCellPos = (ir: number, ic: number): Pt => ({ x: PX + (ic + MAX_PAD) * C, y: PY + (ir + MAX_PAD) * C });
    /** 두른 격자 기준 좌표 → 화면. 패딩이 없으면 입력 칸과 같은 자리 */
    const paddedPos = (pr: number, pc: number): Pt => ({
      x: PX + (pc + MAX_PAD - padding) * C,
      y: PY + (pr + MAX_PAD - padding) * C,
    });
    const outPos = (i: number, j: number): Pt => ({ x: OX + j * C, y: OY + i * C });

    const buildInput = (): void => {
      while (inputLayer.firstChild) inputLayer.removeChild(inputLayer.firstChild);
      while (ringLayer.firstChild) ringLayer.removeChild(ringLayer.firstChild);
      inputCells = [];
      rowLabels.length = 0;
      colLabels.length = 0;
      for (let ir = 0; ir < n; ir += 1) {
        const line: InputCell[] = [];
        for (let ic = 0; ic < n; ic += 1) {
          const p = inputCellPos(ir, ic);
          const g = el('g', { transform: `translate(${p.x},${p.y})` }, inputLayer);
          el('rect', { x: 0, y: 0, width: C, height: C, fill: colors.bg, stroke: colors.border }, g);
          const shade = el('rect', { x: 0, y: 0, width: C, height: C, fill: colors.itemComparing, 'fill-opacity': 0 }, g);
          const value = text(C / 2, C / 2 + 5, MD, colors.text, g, 'middle', fonts.mono);
          const use = text(C - 3, C - 3, XS - 2, colors.textMuted, g, 'end', fonts.mono);
          line.push({ g, shade, value, use, shadeOp: 0 });
        }
        inputCells.push(line);
      }
      for (let i = 0; i < n; i += 1) {
        const pr = inputCellPos(i, 0);
        const rl = text(PX - 6, pr.y + C / 2 + 4, XS, colors.textMuted, inputLayer, 'end');
        rl.textContent = String(i + 1);
        rowLabels.push(rl);
        const pc = inputCellPos(0, i);
        const cl = text(pc.x + C / 2, PY - 4, XS, colors.textMuted, inputLayer, 'middle');
        cl.textContent = String(i + 1);
        colLabels.push(cl);
      }
      // 두를 자리 — 입력 둘레 한 겹
      ring = [];
      const side = n + 2 * MAX_PAD;
      for (let r = 0; r < side; r += 1) {
        for (let c = 0; c < side; c += 1) {
          if (r > 0 && r < side - 1 && c > 0 && c < side - 1) continue;
          const home = { x: PX + c * C, y: PY + r * C };
          const dx = c === 0 ? -RING_OUT : c === side - 1 ? RING_OUT : 0;
          const dy = r === 0 ? -RING_OUT : r === side - 1 ? RING_OUT : 0;
          const g = el('g', { transform: `translate(${home.x + dx},${home.y + dy})`, opacity: 0 }, ringLayer);
          el('rect', { x: 1, y: 1, width: C - 2, height: C - 2, fill: colors.bgSubtle, stroke: colors.textMuted, 'stroke-dasharray': '3 2' }, g);
          const value = text(C / 2, C / 2 + 5, MD, colors.textMuted, g, 'middle', fonts.mono);
          ring.push({ g, value, dx, dy, home });
        }
      }
      ringShown = 0;
      // 창 틀
      while (windowLayer.firstChild) windowLayer.removeChild(windowLayer.firstChild);
      windowFrame = el('rect', { x: 0, y: 0, width: k * C, height: k * C, fill: 'none', stroke: colors.primary, 'stroke-width': 2.5, rx: 2, opacity: 0 }, windowLayer);
      windowOp = 0;
    };

    const buildKernel = (kernel: number[][]): void => {
      while (kernelLayer.firstChild) kernelLayer.removeChild(kernelLayer.firstChild);
      kernel.forEach((line, i) => {
        line.forEach((w, j) => {
          el('rect', { x: KX + j * KC, y: KY + i * KC, width: KC, height: KC, fill: colors.bgSubtle, stroke: colors.primary }, kernelLayer);
          text(KX + j * KC + KC / 2, KY + i * KC + KC / 2 + 4, SM, colors.text, kernelLayer, 'middle', fonts.mono).textContent = signed(w);
        });
      });
    };

    const buildOutput = (): void => {
      while (outputLayer.firstChild) outputLayer.removeChild(outputLayer.firstChild);
      outCells.length = 0;
      outFrame = el('rect', { x: OX - 3, y: OY - 3, width: 6, height: 6, fill: 'none', stroke: colors.textMuted, rx: 3, opacity: 0 }, outputLayer);
      for (let i = 0; i < MAX_N; i += 1) {
        const line: OutCell[] = [];
        for (let j = 0; j < MAX_N; j += 1) {
          const pos = outPos(0, 0);
          const g = el('g', { transform: `translate(${pos.x},${pos.y})`, opacity: 0 }, outputLayer);
          el('rect', { x: 0, y: 0, width: C, height: C, fill: colors.bg, stroke: colors.border }, g);
          const value = text(C / 2, C / 2 + 5, MD, colors.text, g, 'middle', fonts.mono);
          line.push({ g, value, pos, op: 0 });
        }
        outCells.push(line);
      }
      outSide = 0;
    };
    buildOutput();

    const place = (g: SVGGElement, p: Pt, op: number): void => {
      g.setAttribute('transform', `translate(${p.x},${p.y})`);
      g.setAttribute('opacity', String(op));
    };
    const setShade = (cell: InputCell, op: number): void => {
      cell.shadeOp = op;
      cell.shade.setAttribute('fill-opacity', String(op));
    };
    const shadeOf = (use: number): number => (use <= 0 ? 0 : 0.12 + (0.6 * use) / (k * k));

    const ringDraw = (from: number, to: number) => (e: number): void => {
      const s = lerp(from, to, e);
      for (const cell of ring) {
        place(cell.g, { x: cell.home.x + cell.dx * (1 - s), y: cell.home.y + cell.dy * (1 - s) }, s);
      }
    };

    const clearConclusions = (): void => {
      for (const line of inputCells) {
        for (const cell of line) {
          cell.use.textContent = '';
          cell.g.setAttribute('opacity', '1');
        }
      }
      for (const label of [...rowLabels, ...colLabels]) label.setAttribute('fill', colors.textMuted);
      for (const line of outCells) for (const cell of line) cell.value.textContent = '';
    };

    const stage: ConvolutionStage & ViewInstance = {
      start(args, ms) {
        if (args.padding > MAX_PAD || args.padding < 0) throw new Error(`convolution 무대: 패딩 ${args.padding} 은 그릴 자리가 없다`);
        if (args.n > MAX_N || args.o > MAX_N) throw new Error('convolution 무대: 입력이나 출력이 8×8 보다 크다');
        if (args.input.length !== args.n) throw new Error('convolution 무대: 입력 격자의 줄 수가 n 과 다르다');
        finishActive();
        if (args.n !== n || args.k !== k || inputCells.length === 0) {
          n = args.n;
          k = args.k;
          padding = args.padding;
          buildInput();
          markers = [];
          while (markerLayer.firstChild) markerLayer.removeChild(markerLayer.firstChild);
        }
        buildKernel(args.kernel);
        args.input.forEach((line, ir) => {
          line.forEach((value, ic) => {
            const cell = inputCells[ir]?.[ic];
            if (!cell) throw new Error(`convolution 무대: 입력 칸 (${ir}, ${ic}) 이 없다`);
            cell.value.textContent = signed(value);
          });
        });

        // 앞 판의 결론을 걷는다 — 출력 값 · 쓰임 글자 · 흐린 칸 · 띠 · 코드 강조는 projector 가
        clearConclusions();
        const oldBands = bands;
        bands = [];

        // 표지 — 앞 판 자리에서 새 판 자리로
        padding = args.padding;
        const targets = args.anchors.map(([r, c]) => paddedPos(r, c));
        const oldMarkers = markers;
        const moves: { m: Marker; from: Pt; to: Pt; fromOp: number; toOp: number; drop: boolean }[] = [];
        const fallback = oldMarkers.length > 0 ? oldMarkers[oldMarkers.length - 1]!.pos : targets[0];
        const next: Marker[] = [];
        const count = Math.max(oldMarkers.length, targets.length);
        for (let i = 0; i < count; i += 1) {
          const old = oldMarkers[i];
          const to = targets[i];
          if (old && to) {
            moves.push({ m: old, from: { ...old.pos }, to, fromOp: old.op, toOp: 1, drop: false });
            next.push(old);
          } else if (old && !to) {
            const last = targets[targets.length - 1] ?? old.pos;
            moves.push({ m: old, from: { ...old.pos }, to: last, fromOp: old.op, toOp: 0, drop: true });
          } else if (to) {
            const node = el('circle', { cx: 0, cy: 0, r: MARK_R }, markerLayer);
            const from = fallback ?? to;
            const m: Marker = { node, pos: { ...from }, op: 0, stamped: false };
            moves.push({ m, from: { ...from }, to, fromOp: 0, toOp: 1, drop: false });
            next.push(m);
          }
        }
        markers = next;
        markerIndex = new Map(args.anchors.map(([r, c], i) => [`${r},${c}`, i]));
        for (const mv of moves) {
          mv.m.stamped = false;
          mv.m.node.setAttribute('fill', colors.bg);
          mv.m.node.setAttribute('stroke', colors.textMuted);
          mv.m.node.setAttribute('stroke-width', '1.2');
        }

        // 출력 격자 — 한 변 o 로 접히고 펼쳐진다
        const o = args.o;
        const prevSide = outSide;
        outSide = o;
        const outMoves: { cell: OutCell; from: Pt; to: Pt; fromOp: number; toOp: number }[] = [];
        for (let i = 0; i < MAX_N; i += 1) {
          for (let j = 0; j < MAX_N; j += 1) {
            const cell = outCells[i]![j]!;
            const inside = i < o && j < o;
            const to = inside ? outPos(i, j) : outPos(Math.min(i, o - 1), Math.min(j, o - 1));
            outMoves.push({ cell, from: { ...cell.pos }, to, fromOp: cell.op, toOp: inside ? 1 : 0 });
          }
        }
        const frameFrom = prevSide * C;
        const frameTo = o * C;

        // 쓰임 음영은 0 으로
        const shadeFrom = inputCells.map((line) => line.map((cell) => cell.shadeOp));
        const ringFrom = ringShown;
        ringShown = 0;
        const winFrom = windowOp;
        windowOp = 0;

        caption1.textContent = t('caption.start', 'Output side: ⌊({n} + 2·{p} − {k}) / {s}⌋ + 1 = {o}', {
          n: args.n,
          p: args.padding,
          k: args.k,
          s: args.stride,
          o,
        });
        caption2.textContent = t('caption.startSub', 'Stride {s} · padding {p} · window positions: {count}', {
          s: args.stride,
          p: args.padding,
          count: args.anchors.length,
        });
        outputLabel.textContent = t('label.outputSize', 'Output {o}×{o}', { o });

        animate(ms, (raw) => {
          const e = ease(raw);
          for (const mv of moves) {
            mv.m.pos = { x: lerp(mv.from.x, mv.to.x, e), y: lerp(mv.from.y, mv.to.y, e) };
            mv.m.op = lerp(mv.fromOp, mv.toOp, e);
            mv.m.node.setAttribute('cx', String(mv.m.pos.x + MARK_IN));
            mv.m.node.setAttribute('cy', String(mv.m.pos.y + MARK_IN));
            mv.m.node.setAttribute('opacity', String(mv.m.op));
            if (raw >= 1 && mv.drop && mv.m.node.parentNode) mv.m.node.parentNode.removeChild(mv.m.node);
          }
          for (const mv of outMoves) {
            mv.cell.pos = { x: lerp(mv.from.x, mv.to.x, e), y: lerp(mv.from.y, mv.to.y, e) };
            mv.cell.op = lerp(mv.fromOp, mv.toOp, e);
            place(mv.cell.g, mv.cell.pos, mv.cell.op);
          }
          if (outFrame) {
            const side = lerp(frameFrom, frameTo, e);
            outFrame.setAttribute('width', String(side + 6));
            outFrame.setAttribute('height', String(side + 6));
            outFrame.setAttribute('opacity', String(lerp(frameFrom > 0 ? 1 : 0, 1, e)));
          }
          inputCells.forEach((line, ir) => line.forEach((cell, ic) => setShade(cell, lerp(shadeFrom[ir]![ic]!, 0, e))));
          ringDraw(ringFrom, 0)(e);
          windowFrame?.setAttribute('opacity', String(lerp(winFrom, 0, e)));
          for (const band of oldBands) {
            const len = lerp(band.full, 0, e);
            band.node.setAttribute(band.vertical ? 'height' : 'width', String(len));
            if (raw >= 1 && band.node.parentNode) band.node.parentNode.removeChild(band.node);
          }
        });
      },

      pad(args, ms) {
        if (ring.length === 0) throw new Error('convolution 무대: 판 머리 전에 두르기가 왔다');
        for (const cell of ring) cell.value.textContent = signed(args.padValue);
        caption1.textContent = t('caption.pad', 'Wrap one ring of {v} — grid {side}×{side}', { v: signed(args.padValue), side: args.paddedSide });
        caption2.textContent = t('caption.padSub', 'Padded cells: {cells}', { cells: args.paddedCells });
        const from = ringShown;
        ringShown = 1;
        animate(ms, (raw) => ringDraw(from, 1)(ease(raw)));
      },

      row(args, ms) {
        if (!windowFrame) throw new Error('convolution 무대: 판 머리 전에 줄이 왔다');
        if (args.anchors.length !== args.values.length) throw new Error('convolution 무대: 창 자리 수와 출력 값 수가 다르다');
        if (args.cover.length !== n) throw new Error('convolution 무대: 쓰임 격자의 줄 수가 n 과 다르다');
        const frame = windowFrame;
        const stops = args.anchors.map(([r, c]) => paddedPos(r, c));
        const idx = args.anchors.map(([r, c]) => {
          const i = markerIndex.get(`${r},${c}`);
          if (i === undefined) throw new Error(`convolution 무대: 창 자리 (${r}, ${c}) 의 표지가 없다`);
          return i;
        });
        const cellsOut = args.values.map((_, j) => {
          const cell = outCells[args.row]?.[j];
          if (!cell) throw new Error(`convolution 무대: 출력 칸 (${args.row}, ${j}) 이 없다`);
          return cell;
        });
        const shadeFrom = inputCells.map((line) => line.map((cell) => cell.shadeOp));
        const shadeTo = args.cover.map((line, ir) => {
          if (line.length !== n) throw new Error(`convolution 무대: 쓰임 격자 ${ir + 1} 번째 줄의 길이가 n 과 다르다`);
          return line.map((use) => shadeOf(use));
        });
        const start = windowOp > 0 ? { ...windowPos } : stops[0]!;
        const winFrom = windowOp;
        windowOp = 1;
        const m = stops.length;

        caption1.textContent = t('caption.row', 'Output row {row}: {values}', {
          row: args.row + 1,
          values: args.values.map(signed).join('  '),
        });
        caption2.textContent = t('caption.rowSub', 'Positions: {placed} · input cells reached: {touched}', {
          placed: args.placed,
          touched: args.touched,
        });

        let reached = 0;
        animate(ms, (raw) => {
          const seg = raw * m;
          const q = Math.min(m - 1, Math.floor(seg));
          const local = raw >= 1 ? 1 : ease(seg - q);
          const a = q === 0 ? start : stops[q - 1]!;
          const b = stops[q]!;
          windowPos = { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) };
          frame.setAttribute('x', String(windowPos.x));
          frame.setAttribute('y', String(windowPos.y));
          frame.setAttribute('opacity', String(Math.max(winFrom, Math.min(1, raw * 4))));
          const done = raw >= 1 ? m : Math.floor(seg);
          for (; reached < done; reached += 1) {
            const marker = markers[idx[reached]!];
            if (!marker) throw new Error('convolution 무대: 표지가 모자란다');
            marker.stamped = true;
            marker.node.setAttribute('fill', colors.itemActive);
            marker.node.setAttribute('stroke', colors.itemActive);
            cellsOut[reached]!.value.textContent = signed(args.values[reached]!);
          }
          inputCells.forEach((line, ir) => line.forEach((cell, ic) => setShade(cell, lerp(shadeFrom[ir]![ic]!, shadeTo[ir]![ic]!, raw))));
        });
      },

      summary(args, ms) {
        if (args.cover.length !== n) throw new Error('convolution 무대: 쓰임 격자의 줄 수가 n 과 다르다');
        finishActive();
        args.cover.forEach((line, ir) => {
          line.forEach((use, ic) => {
            const cell = inputCells[ir]?.[ic];
            if (!cell) throw new Error(`convolution 무대: 입력 칸 (${ir}, ${ic}) 이 없다`);
            cell.use.textContent = String(use);
            setShade(cell, shadeOf(use));
          });
        });
        const dimRows = new Set(args.droppedRows);
        const dimCols = new Set(args.droppedCols);
        const newBands: Band[] = [];
        const full = n * C;
        for (const r of args.droppedRows) {
          const p = inputCellPos(r, 0);
          const node = el('rect', { x: p.x, y: p.y + 2, width: 0, height: C - 4, fill: 'none', stroke: colors.danger, 'stroke-width': 2, 'stroke-dasharray': '5 3', rx: 3 }, bandLayer);
          newBands.push({ node, full, vertical: false });
          rowLabels[r]?.setAttribute('fill', colors.danger);
        }
        for (const c of args.droppedCols) {
          const p = inputCellPos(0, c);
          const node = el('rect', { x: p.x + 2, y: p.y, width: C - 4, height: 0, fill: 'none', stroke: colors.danger, 'stroke-width': 2, 'stroke-dasharray': '5 3', rx: 3 }, bandLayer);
          newBands.push({ node, full, vertical: true });
          colLabels[c]?.setAttribute('fill', colors.danger);
        }
        bands = newBands;
        const winFrom = windowOp;
        windowOp = 0;

        caption1.textContent = t('caption.end', 'Dropped input cells: {dropped} · corner use: {corner} · max use: {max}', {
          dropped: args.dropped,
          corner: args.cornerUse,
          max: args.maxUse,
        });
        caption2.textContent =
          args.droppedRows.length === 0 && args.droppedCols.length === 0
            ? t('caption.noneDropped', 'The window reaches every input row and column')
            : t('caption.dropped', 'Rows never reached: {rows} · columns never reached: {cols}', {
                rows: args.droppedRows.length === 0 ? '—' : args.droppedRows.map((r) => r + 1).join(', '),
                cols: args.droppedCols.length === 0 ? '—' : args.droppedCols.map((c) => c + 1).join(', '),
              });

        animate(ms, (raw) => {
          const e = ease(raw);
          for (const band of newBands) band.node.setAttribute(band.vertical ? 'height' : 'width', String(lerp(0, band.full, e)));
          inputCells.forEach((line, ir) =>
            line.forEach((cell, ic) => {
              if (dimRows.has(ir) || dimCols.has(ic)) cell.g.setAttribute('opacity', String(lerp(1, 0.3, e)));
            }),
          );
          windowFrame?.setAttribute('opacity', String(lerp(winFrom, 0, e)));
        });
      },

      reset() {
        finishActive();
        clearConclusions();
        for (const band of bands) band.node.parentNode?.removeChild(band.node);
        bands = [];
        for (const line of inputCells) for (const cell of line) setShade(cell, 0);
        for (const m of markers) m.node.parentNode?.removeChild(m.node);
        markers = [];
        ringDraw(ringShown, 0)(1);
        ringShown = 0;
        windowOp = 0;
        windowFrame?.setAttribute('opacity', '0');
        caption1.textContent = '';
        caption2.textContent = '';
      },

      destroy() {
        destroyed = true;
        if (active) cancelAnimationFrame(active.id);
        active = null;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
    return stage;
  },
};
