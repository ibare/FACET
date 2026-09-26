/**
 * value-flows-to-use 의 stage — 넣은 자리에서 읽는 자리로 값이 뻗어 간다.
 *
 * 코드 줄 왼쪽에 넣기마다 제 길(세로 줄기)이 있다. 넣는 이름에서 나온 값이 줄기를 타고 아래로 내려가며, 읽는
 * 줄의 바로 위에서 가지를 쳐 그 줄의 읽는 칸으로 들어간다. 같은 이름이 다시 넣어지는 줄에 이르면 줄기는
 * 거기서 가로막대로 끊기고 더 내려가지 않는다. 이름 글자는 바뀌지 않는다 — 누구에게서 온 값인지는 길의 색이 말한다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import {
  defCount,
  instrSegments,
  type Flow,
  type ReadSlot as Slot,
  type ValueFlowsToUseScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 380;
const W = PIECE_CANVAS_W;

/** 고정폭 글꼴의 글자 폭 / 글자 크기 — 칸 자리를 셈하는 데 쓴다. */
const MONO_RATIO = 0.6;
const CAPTION_Y = [24, 48, 72] as const;
const ROWS_TOP = 96;
const ROWS_BOTTOM = 14;
const ROW_H_MAX = 46;
const LANE_GAP_MAX = 54;
const NUM_COL = 36;
const LANE_TO_CODE = 30;
const SIDE_MARGIN = 24;
/** 가지가 읽는 줄 위 틈을 지나는 높이 — 칸마다 한 층씩 올린다. */
const BRANCH_LIFT = 5;
const BRANCH_LEVEL = 7;
const CUT_HALF = 8;
const MOTION_MS = 400;
const FRAME_MS = 16;

type Seg = { x1: number; y1: number; x2: number; y2: number; d0: number };
type Mark = { kind: 'arrow' | 'cut'; x: number; y: number; d0: number };
type FlowShape = { segs: Seg[]; marks: Mark[]; total: number };

type Layout = {
  numX: number;
  codeX: number;
  charW: number;
  codePx: number;
  rowY: (line: number) => number;
  laneX: (defIdx: number) => number;
  slotX: (line: number, slot: Slot) => number;
  slotLevel: (line: number, slot: Slot) => number;
};

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function layoutOf(scene: ValueFlowsToUseScene): Layout {
  const code = scene.code;
  const n = Math.max(1, code.length);
  const codePx = parseFloat(fontSizes.xl);
  const charW = codePx * MONO_RATIO;
  const maxChars = code.reduce((m, ins) => Math.max(m, instrSegments(ins).reduce((s, g) => s + g.text.length, 0)), 0);
  const codeW = maxChars * charW;
  const lanes = Math.max(1, defCount(code));
  const laneRoom = (W - 2 * SIDE_MARGIN - NUM_COL - LANE_TO_CODE - codeW) / lanes;
  const laneGap = Math.max(0, Math.min(LANE_GAP_MAX, laneRoom));
  // 줄기 · 코드 · 줄 번호 차례로 한 무리를 가운데에 둔다. 줄 번호는 길과 엇갈리지 않게 코드 오른쪽에.
  const groupW = lanes * laneGap + LANE_TO_CODE + codeW + NUM_COL;
  const left = (W - groupW) / 2;
  const codeX = left + lanes * laneGap + LANE_TO_CODE;
  const rowH = Math.min(ROW_H_MAX, (H - ROWS_TOP - ROWS_BOTTOM) / n);

  // 줄마다 읽는 칸의 글자 자리 (칸 가운데)와 칸 차례.
  const slotCol = new Map<string, number>();
  const slotRank = new Map<string, number>();
  code.forEach((ins, i) => {
    let col = 0;
    const reads: Slot[] = [];
    for (const g of instrSegments(ins)) {
      if (g.role === 'read') {
        slotCol.set(`${i + 1}:${g.slot}`, col + g.text.length / 2);
        reads.push(g.slot);
      }
      col += g.text.length;
    }
    // 오른쪽 칸일수록 높은 층 — 먼 칸으로 가는 가지가 가까운 칸의 내림줄과 엇갈리지 않는다.
    reads.forEach((s, k) => slotRank.set(`${i + 1}:${s}`, k));
  });

  return {
    numX: codeX + codeW + NUM_COL - 6,
    codeX,
    charW,
    codePx,
    rowY: (line) => ROWS_TOP + rowH * (line - 0.5),
    laneX: (defIdx) => codeX - LANE_TO_CODE - laneGap * (defIdx + 0.5),
    slotX: (line, slot) => {
      const c = slotCol.get(`${line}:${slot}`);
      if (c === undefined) throw new Error(`줄 ${line}: 읽는 칸 ${slot} 이 없다`);
      return codeX + c * charW;
    },
    slotLevel: (line, slot) => {
      const k = slotRank.get(`${line}:${slot}`);
      if (k === undefined) throw new Error(`줄 ${line}: 읽는 칸 ${slot} 이 없다`);
      return k;
    },
  };
}

/** 넣기 하나의 길 — 넣는 이름 → 제 줄기 → 읽는 칸마다 가지, 다시 넣는 줄에서 끊김. 길이는 출발에서 잰 거리. */
function flowShape(flow: Flow, defIdx: number, L: Layout): FlowShape {
  const segs: Seg[] = [];
  const marks: Mark[] = [];
  const y0 = L.rowY(flow.line);
  const lx = L.laneX(defIdx);
  const sx = L.codeX - 4;
  const lenA = sx - lx;
  segs.push({ x1: sx, y1: y0, x2: lx, y2: y0, d0: 0 });
  const textTop = (line: number): number => L.rowY(line) - L.codePx * 0.5;
  let bottom = y0;
  for (const u of flow.uses) {
    const gy = textTop(u.line) - BRANCH_LIFT - BRANCH_LEVEL * L.slotLevel(u.line, u.slot);
    const ox = L.slotX(u.line, u.slot);
    const dBranch = lenA + (gy - y0);
    segs.push({ x1: lx, y1: gy, x2: ox, y2: gy, d0: dBranch });
    const dDrop = dBranch + (ox - lx);
    const tipY = textTop(u.line) + 1;
    segs.push({ x1: ox, y1: gy, x2: ox, y2: tipY - 5, d0: dDrop });
    marks.push({ kind: 'arrow', x: ox, y: tipY, d0: dDrop + (tipY - 5 - gy) });
    bottom = Math.max(bottom, gy);
  }
  if (flow.cut !== null) {
    const cy = L.rowY(flow.cut);
    bottom = Math.max(bottom, cy);
    marks.push({ kind: 'cut', x: lx, y: cy, d0: lenA + (cy - y0) });
  }
  // 줄기는 가장 아래 가지(또는 끊김)까지 — 그 밑으로는 내려가지 않는다.
  segs.splice(1, 0, { x1: lx, y1: y0, x2: lx, y2: bottom, d0: lenA });
  const ends = [
    ...segs.map((s) => s.d0 + Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1)),
    ...marks.map((m) => m.d0),
  ];
  return { segs, marks, total: Math.max(0, ...ends) };
}

function drawFlow(g: SVGGElement, shape: FlowShape, color: string, reach: number, current: boolean): void {
  const width = current ? 3 : 2;
  const layer = el(g, 'g', current ? {} : { opacity: 0.5 });
  for (const s of shape.segs) {
    const len = Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1);
    const got = Math.min(len, reach - s.d0);
    if (got <= 0 || len === 0) continue;
    const f = got / len;
    el(layer, 'line', {
      x1: s.x1,
      y1: s.y1,
      x2: s.x1 + (s.x2 - s.x1) * f,
      y2: s.y1 + (s.y2 - s.y1) * f,
      stroke: color,
      'stroke-width': width,
      'stroke-linecap': 'round',
    });
  }
  for (const m of shape.marks) {
    if (reach < m.d0) continue;
    if (m.kind === 'arrow') {
      el(layer, 'path', { d: `M${r2(m.x - 4)} ${r2(m.y - 6)} L${r2(m.x + 4)} ${r2(m.y - 6)} L${r2(m.x)} ${r2(m.y)} Z`, fill: color });
    } else {
      el(layer, 'line', {
        x1: m.x - CUT_HALF,
        y1: m.y,
        x2: m.x + CUT_HALF,
        y2: m.y,
        stroke: color,
        'stroke-width': width + 2,
        'stroke-linecap': 'butt',
      });
    }
  }
}

/** 읽는 칸 → 그 값을 넣은 넣기의 자리. `reach` 가 모자라면 아직 닿지 않았다. */
function reachedReads(scene: ValueFlowsToUseScene, shapes: FlowShape[], reachOf: (i: number) => number): Map<string, number> {
  const out = new Map<string, number>();
  scene.flows.forEach((f, i) => {
    const shape = shapes[i];
    if (shape === undefined) throw new Error(`줄 ${f.line}: 길 모양이 없다`);
    const arrows = shape.marks.filter((m) => m.kind === 'arrow');
    f.uses.forEach((u, k) => {
      const a = arrows[k];
      if (a === undefined) throw new Error(`줄 ${u.line}: 읽는 칸 ${u.slot} 의 화살이 없다`);
      if (reachOf(i) >= a.d0) out.set(`${u.line}:${u.slot}`, i);
    });
  });
  return out;
}

function draw(
  svg: SVGSVGElement,
  scene: ValueFlowsToUseScene,
  c: Palette,
  t: Translate,
  progress: number,
): void {
  svg.textContent = '';
  const code = scene.code;
  if (code.length === 0) return;
  const L = layoutOf(scene);
  const nDefs = defCount(code);
  const hues = categorical(Math.max(1, nDefs));
  const colorOf = (i: number): string => {
    const hue = hues[i];
    if (hue === undefined) throw new Error(`넣기 ${i + 1} 의 색이 없다 (넣는 줄 ${nDefs})`);
    return hue;
  };
  const outside = new Set((scene.outside ?? []).map((u) => `${u.line}:${u.slot}`));
  const shapes = scene.flows.map((f, i) => flowShape(f, i, L));
  const cur = scene.step === null ? -1 : scene.step.at;
  const reachOf = (i: number): number => {
    const s = shapes[i];
    if (s === undefined) throw new Error(`넣기 ${i + 1} 의 길 모양이 없다`);
    return i === cur ? s.total * progress : s.total;
  };

  // 캡션 — 지금 일어나는 일.
  const cap = el(svg, 'g', { 'font-family': fonts.body, fill: c.text });
  const lines: { text: string; muted: boolean }[] = [];
  const flow = cur >= 0 ? scene.flows[cur] : undefined;
  if (flow === undefined) {
    lines.push({
      text: t('caption.start', 'Lines: {lines} · Lines that assign: {defs}', { lines: code.length, defs: nDefs }),
      muted: false,
    });
  } else {
    lines.push({
      text: t('caption.flow', 'Line {line} assigns {name} → reads reached: {n}', {
        line: flow.line,
        name: flow.name,
        n: flow.uses.length,
      }),
      muted: false,
    });
    if (flow.cut !== null) {
      lines.push({
        text: t('caption.cut', 'Line {cut} assigns {name} again — this value stops there', { cut: flow.cut, name: flow.name }),
        muted: false,
      });
    }
    if (scene.end !== null) {
      if (scene.outside === null) throw new Error('끝 걸음인데 바깥 값 읽기를 받지 못했다');
      lines.push({
        text: t('caption.total', 'Chains: {chains} · Reads of outside values: {outside}', {
          chains: scene.end.chains,
          outside: scene.outside.length,
        }),
        muted: true,
      });
    }
  }
  lines.forEach((ln, i) => {
    const node = el(cap, 'text', {
      x: W / 2,
      y: CAPTION_Y[i] ?? CAPTION_Y[2],
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': i === 0 ? fontSizes.lg : fontSizes.md,
      fill: ln.muted ? c.textMuted : c.text,
    });
    node.textContent = ln.text;
  });

  // 길 — 지난 넣기는 옅게, 이번 넣기는 굵게 (나중에 그려 위에 선다).
  const paths = el(svg, 'g', {});
  shapes.forEach((s, i) => {
    if (i !== cur) drawFlow(paths, s, colorOf(i), reachOf(i), false);
  });
  const curShape = cur >= 0 ? shapes[cur] : undefined;
  if (curShape !== undefined) drawFlow(paths, curShape, colorOf(cur), reachOf(cur), true);

  // 코드 — 이름 글자는 그대로, 누구의 값인지는 색이 말한다.
  const reached = reachedReads(scene, shapes, reachOf);
  const defIdxOfLine = new Map(scene.flows.map((f, i) => [f.line, i] as const));
  const codeG = el(svg, 'g', { 'font-family': fonts.mono, 'font-size': `${L.codePx}px` });
  code.forEach((ins, i) => {
    const line = i + 1;
    const y = L.rowY(line);
    const num = el(codeG, 'text', {
      x: L.numX,
      y,
      'text-anchor': 'end',
      'dominant-baseline': 'central',
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    num.textContent = String(line);
    let col = 0;
    for (const g of instrSegments(ins)) {
      if (g.text.trim() !== '') {
        let fill = c.text;
        let weight = 'normal';
        if (g.role === 'dst') {
          const di = defIdxOfLine.get(line);
          if (di !== undefined) {
            fill = colorOf(di);
            weight = 'bold';
          }
        } else if (g.role === 'read') {
          const from = reached.get(`${line}:${g.slot}`);
          if (from !== undefined) {
            fill = colorOf(from);
            weight = 'bold';
          } else if (outside.has(`${line}:${g.slot}`)) {
            fill = c.textMuted;
          }
        } else if (g.role === 'plain') {
          fill = c.textMuted;
        }
        const node = el(codeG, 'text', {
          x: L.codeX + col * L.charW,
          y,
          'dominant-baseline': 'central',
          'xml:space': 'preserve',
          fill,
          'font-weight': weight,
        });
        node.textContent = g.text;
      }
      col += g.text.length;
    }
  });
}

export const valueFlowsToUseStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function frame(): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function render(
      next: ValueFlowsToUseScene,
      prev: ValueFlowsToUseScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      // 새 넣기가 붙은 걸음만 흘린다. 되짚기 · 처음은 곧바로.
      const grew = next.step !== null && (prev === null || next.flows.length > prev.flows.length);
      if (!opts.animate || !grew) {
        draw(svg, next, c, t, 1);
        return;
      }
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / MOTION_MS);
        const eased = 1 - (1 - p) * (1 - p);
        draw(svg, next, c, t, eased);
        if (p >= 1) break;
        await frame();
      }
      if (mine !== gen || destroyed) return;
      draw(svg, next, c, t, 1);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
