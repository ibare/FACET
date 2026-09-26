import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { countStepped, countTaken, parseProgram, type BranchId, type FlowEdge, type Program } from './algorithm.js';
import type { LinesCoveredBranchNotScene } from './scene.js';

/**
 * 그림 — 코드 줄마다 오른쪽 길 기둥에 마디가 하나씩 선다. 마디 사이에 실행이 갈 수 있는
 * 길이 흐리게 깔려 있고, 실행이 줄에서 줄로 건너갈 때마다 그 길이 위에서 아래로 그어진다.
 * if 마디에서 두 갈래가 갈린다 — 참 쪽은 왼쪽으로 휘어 바로 아랫줄에, 거짓 쪽은 오른쪽으로
 * 크게 휘어 한 줄을 건너뛰고 내려앉는다. 아래에 두 계기가 나란히 선다.
 */

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 24;
const HEAD_Y = 22;
const CODE_TOP = 84;
const CODE_BOTTOM = 236;
const LINE_H_MAX = 40;
const NODE_R = 7;
const METER_TOP = 270;
const CELL_H = 30;
const CELL_GAP = 6;
const MOVE_MS = 520;
const FRAME_MS = 16;

type Geometry = {
  lineH: number;
  charW: number;
  codeX: number;
  px: number;
  rowY: (line: number) => number;
};

function geometry(program: Program, code: readonly string[]): Geometry {
  const n = code.length;
  const lineH = n > 1 ? Math.min(LINE_H_MAX, (CODE_BOTTOM - CODE_TOP) / (n - 1)) : LINE_H_MAX;
  const charW = parseFloat(fontSizes.md) * 0.6;
  const codeX = MARGIN + 30;
  const widest = Math.max(...code.map((l) => l.length));
  // 길 기둥은 가장 긴 줄 뒤에 선다. 거짓 쪽 활과 그 이름이 캔버스 안에 들도록 상한을 둔다
  const room = PIECE_CANVAS_W - MARGIN - bulgeOf(program, 'false', lineH) - 90;
  const px = Math.round(Math.min(codeX + widest * charW + 72, room));
  return { lineH, charW, codeX, px, rowY: (line) => Math.round(CODE_TOP + (line - 1) * lineH) };
}

/** 갈래 길이 옆으로 휘는 폭. 참 쪽은 왼쪽(음수), 거짓 쪽은 오른쪽 */
function bulge(edge: FlowEdge, lineH: number): number {
  const span = Math.abs(edge.to - edge.from);
  if (edge.branch === 'true') return -Math.round(18 + 16 * span * (lineH / LINE_H_MAX));
  if (edge.branch === 'false') return Math.round(40 + 40 * span * (lineH / LINE_H_MAX));
  return span > 1 ? Math.round(30 * span * (lineH / LINE_H_MAX)) : 0;
}

function bulgeOf(program: Program, branch: BranchId, lineH: number): number {
  let widest = 0;
  for (const e of program.flow) if (e.branch === branch) widest = Math.max(widest, Math.abs(bulge(e, lineH)));
  return widest;
}

type Pt = { x: number; y: number };

/** 길 하나의 모양 — 곧은 선이거나 옆으로 휜 삼차 곡선 */
function edgeShape(edge: FlowEdge, g: Geometry): { d: string; at: (u: number) => Pt; length: number } {
  const y1 = g.rowY(edge.from);
  const y2 = g.rowY(edge.to);
  const b = bulge(edge, g.lineH);
  if (b === 0) {
    const a = { x: g.px, y: y1 + NODE_R + 2 };
    const z = { x: g.px, y: y2 - NODE_R - 2 };
    return {
      d: `M ${a.x} ${a.y} L ${z.x} ${z.y}`,
      at: (u) => ({ x: a.x, y: a.y + (z.y - a.y) * u }),
      length: Math.abs(z.y - a.y),
    };
  }
  const s = Math.sign(b);
  const p0 = { x: g.px + s * (NODE_R + 1), y: y1 };
  const p1 = { x: g.px + b, y: y1 };
  const p2 = { x: g.px + b, y: y2 };
  const p3 = { x: g.px + s * (NODE_R + 1), y: y2 };
  const at = (u: number): Pt => {
    const v = 1 - u;
    return {
      x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x,
      y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y,
    };
  };
  let length = 0;
  let prev = at(0);
  for (let i = 1; i <= 32; i += 1) {
    const q = at(i / 32);
    length += Math.hypot(q.x - prev.x, q.y - prev.y);
    prev = q;
  }
  return {
    d: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`,
    at,
    length: Math.round(length * 10) / 10,
  };
}

function r1(v: number): string {
  const n = Math.round(v * 10) / 10;
  return String(Object.is(n, -0) ? 0 : n);
}

export const linesCoveredBranchNotStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 바탕(코드)이 같으면 셈을 다시 하지 않는다
    let shapeOf: readonly string[] | null = null;
    let program: Program | null = null;

    function programFor(code: readonly string[]): Program {
      if (program === null || shapeOf !== code) {
        program = parseProgram(code);
        shapeOf = code;
      }
      return program;
    }

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? r1(v) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      o: { size: string; fill: string; mono?: boolean; anchor?: 'start' | 'middle' | 'end'; weight?: string },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        fill: o.fill,
        'font-family': o.mono ? fonts.mono : fonts.body,
        'font-size': o.size,
        'text-anchor': o.anchor ?? 'start',
        'dominant-baseline': 'middle',
      });
      if (o.weight) node.setAttribute('font-weight', o.weight);
      if (o.mono) node.setAttribute('xml:space', 'preserve');
      node.textContent = content;
      return node;
    }

    function sideName(id: BranchId): string {
      return id === 'true' ? t('label.true', 'true side') : t('label.false', 'false side');
    }

    type Handles = { lead: SVGPathElement | null; landing: SVGCircleElement | null; g: Geometry; edge: FlowEdge | null };

    function drawStatic(scene: LinesCoveredBranchNotScene): Handles {
      svg.textContent = '';
      const prog = programFor(scene.code);
      const g = geometry(prog, scene.code);
      const step = scene.step;
      const ended = step.kind === 'end';
      const missing = ended ? step.missing : [];
      const isMissing = (e: FlowEdge): boolean =>
        e.branch !== null && missing.some((m) => m.line === e.from && m.branch === e.branch);
      const isWalked = (e: FlowEdge): boolean => scene.walked.some((w) => w.from === e.from && w.to === e.to);
      const isChosen = (e: FlowEdge): boolean =>
        e.branch !== null && scene.taken.some((k) => k.line === e.from && k.branch === e.branch);

      // 시험
      label(svg, MARGIN, HEAD_Y, t('label.test', 'Test'), { size: fontSizes.sm, fill: c.textMuted });
      label(svg, MARGIN, HEAD_Y + 22, scene.test, { size: fontSizes.md, fill: c.text, mono: true });
      if (ended) {
        label(svg, MARGIN + (scene.test.length + 1) * g.charW, HEAD_Y + 22, `→ ${step.returned}`, {
          size: fontSizes.md,
          fill: c.text,
          mono: true,
          weight: '600',
        });
      }

      // 이번 걸음의 줄
      if (step.kind === 'line') {
        const y = g.rowY(step.line);
        el(svg, 'rect', {
          x: MARGIN - 6,
          y: y - g.lineH / 2 + 4,
          width: g.px + NODE_R + 8 - (MARGIN - 6),
          height: g.lineH - 8,
          rx: 4,
          fill: c.accent,
          'fill-opacity': 0.3,
        });
      }

      // 코드 줄과 줄 번호
      scene.code.forEach((text, i) => {
        const line = i + 1;
        const y = g.rowY(line);
        label(svg, g.codeX - 12, y, String(line), { size: fontSizes.xs, fill: c.textMuted, anchor: 'end', mono: true });
        label(svg, g.codeX, y, text, { size: fontSizes.md, fill: c.text, mono: true });
        const end = g.codeX + text.length * g.charW + 10;
        const stop = g.px - 44;
        if (stop > end) {
          el(svg, 'line', { x1: end, y1: y, x2: stop, y2: y, stroke: c.border, 'stroke-width': 1, 'stroke-dasharray': '1 4' });
        }
      });

      // 길 — 흐린 지도, 고른 갈래, 그어진 길, 안 간 갈래
      const lastWalk = step.kind === 'line' ? { from: step.from, to: step.line } : null;
      let lead: SVGPathElement | null = null;
      let leadEdge: FlowEdge | null = null;
      for (const e of prog.flow) {
        const shape = edgeShape(e, g);
        if (isMissing(e)) {
          el(svg, 'path', { d: shape.d, fill: 'none', stroke: c.danger, 'stroke-width': 2.5, 'stroke-dasharray': '6 5' });
        } else if (isWalked(e)) {
          const p = el(svg, 'path', { d: shape.d, fill: 'none', stroke: c.primary, 'stroke-width': 3.5, 'stroke-linecap': 'round' });
          if (lastWalk && lastWalk.from === e.from && lastWalk.to === e.to) {
            lead = p;
            leadEdge = e;
          }
        } else if (isChosen(e)) {
          el(svg, 'path', { d: shape.d, fill: 'none', stroke: c.accent, 'stroke-width': 3, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' });
        } else {
          el(svg, 'path', { d: shape.d, fill: 'none', stroke: c.border, 'stroke-width': 1.5, 'stroke-dasharray': '3 4' });
        }
        if (e.branch !== null) {
          const b = bulge(e, g.lineH);
          const mid = shape.at(0.5);
          const off = b < 0 ? -10 : 10;
          const tone = isMissing(e) ? c.danger : isWalked(e) || isChosen(e) ? c.text : c.textMuted;
          label(svg, mid.x + off, mid.y, sideName(e.branch), {
            size: fontSizes.xs,
            fill: tone,
            anchor: b < 0 ? 'end' : 'start',
            weight: isMissing(e) || isChosen(e) ? '600' : '400',
          });
        }
      }

      // 마디 — function 줄은 들어오는 자리, 문 줄은 밟히면 찬다
      let landing: SVGCircleElement | null = null;
      const hy = g.rowY(prog.headerLine);
      el(svg, 'rect', { x: g.px - 4, y: hy - 4, width: 8, height: 8, fill: 'none', stroke: c.textMuted, 'stroke-width': 1.5 });
      for (const line of prog.counted) {
        const y = g.rowY(line);
        const on = scene.stepped.includes(line);
        const node = el(svg, 'circle', {
          cx: g.px,
          cy: y,
          r: NODE_R,
          fill: on ? c.primary : c.bg,
          stroke: on ? c.primary : c.border,
          'stroke-width': 2,
        });
        if (step.kind === 'line' && step.line === line) {
          el(svg, 'circle', { cx: g.px, cy: y, r: NODE_R + 4, fill: 'none', stroke: c.accent, 'stroke-width': 2.5 });
          landing = node;
        }
      }

      // 두 계기
      const pw = (PIECE_CANVAS_W - 2 * MARGIN - 24) / 2;
      const lineCount = countStepped(prog, scene.stepped);
      const branchEdges = prog.flow.filter((e) => e.branch !== null);
      const branchCount = countTaken(prog, scene.taken);
      const meters: { x: number; title: string; count: number; of: number; pct: number | null }[] = [
        {
          x: MARGIN,
          title: t('meter.lines', 'Lines stepped on'),
          count: ended ? step.lines : lineCount,
          of: ended ? step.linesOf : prog.counted.length,
          pct: ended ? step.linesPct : null,
        },
        {
          x: MARGIN + pw + 24,
          title: t('meter.branches', 'Branches taken'),
          count: ended ? step.branches : branchCount,
          of: ended ? step.branchesOf : branchEdges.length,
          pct: ended ? step.branchesPct : null,
        },
      ];
      for (const m of meters) {
        label(svg, m.x, METER_TOP, m.title, { size: fontSizes.sm, fill: c.textMuted });
        const figure =
          m.pct === null
            ? t('meter.count', '{n}/{of}', { n: m.count, of: m.of })
            : t('meter.percent', '{n}/{of} = {pct}%', { n: m.count, of: m.of, pct: m.pct });
        label(svg, m.x + pw, METER_TOP, figure, { size: fontSizes.md, fill: c.text, anchor: 'end', mono: true, weight: '600' });
      }
      const cellY = METER_TOP + 14;
      const lineCellW = (pw - (prog.counted.length - 1) * CELL_GAP) / prog.counted.length;
      prog.counted.forEach((line, i) => {
        const x = MARGIN + i * (lineCellW + CELL_GAP);
        const on = scene.stepped.includes(line);
        el(svg, 'rect', {
          x,
          y: cellY,
          width: lineCellW,
          height: CELL_H,
          rx: 3,
          fill: on ? c.primary : c.bg,
          stroke: on ? c.primary : c.border,
          'stroke-width': 1.5,
        });
        label(svg, x + lineCellW / 2, cellY + CELL_H / 2, String(line), {
          size: fontSizes.sm,
          fill: on ? c.textInverse : c.textMuted,
          anchor: 'middle',
          mono: true,
        });
      });
      const bx = meters[1]?.x ?? MARGIN;
      const branchCellW = (pw - (branchEdges.length - 1) * CELL_GAP) / branchEdges.length;
      branchEdges.forEach((e, i) => {
        if (e.branch === null) return;
        const x = bx + i * (branchCellW + CELL_GAP);
        const on = isChosen(e);
        const gone = isMissing(e);
        el(svg, 'rect', {
          x,
          y: cellY,
          width: branchCellW,
          height: CELL_H,
          rx: 3,
          fill: on ? c.primary : c.bg,
          stroke: on ? c.primary : gone ? c.danger : c.border,
          'stroke-width': gone ? 2 : 1.5,
          ...(gone ? { 'stroke-dasharray': '6 4' } : {}),
        });
        label(svg, x + branchCellW / 2, cellY + CELL_H / 2, sideName(e.branch), {
          size: fontSizes.sm,
          fill: on ? c.textInverse : gone ? c.danger : c.textMuted,
          anchor: 'middle',
          weight: gone ? '600' : '400',
        });
      });

      // 지금 일어나는 일
      const capY = H - 46;
      const caps: string[] = [];
      if (step.kind === 'start') {
        caps.push(t('caption.start', 'The test has not run yet'));
      } else if (step.kind === 'line') {
        caps.push(
          step.from === prog.headerLine
            ? t('caption.enter', 'Enters the function: line {to}', { to: step.line })
            : t('caption.walk', 'Walks: line {from} → line {to}', { from: step.from, to: step.line }),
        );
        if (step.branch !== null) {
          caps.push(t('caption.choose', 'Branch picked: {side} (line {line})', { side: sideName(step.branch), line: step.line }));
        }
      } else {
        caps.push(
          t('caption.end', 'Lines {lines}/{linesOf} = {linesPct}% · branches {branches}/{branchesOf} = {branchesPct}%', {
            lines: step.lines,
            linesOf: step.linesOf,
            linesPct: step.linesPct,
            branches: step.branches,
            branchesOf: step.branchesOf,
            branchesPct: step.branchesPct,
          }),
        );
        for (const m of step.missing) {
          caps.push(t('caption.missing', 'Never walked: line {line} → line {to} ({side})', { line: m.line, to: m.to, side: sideName(m.branch) }));
        }
      }
      caps.forEach((text, i) => {
        label(svg, MARGIN, capY + i * 22, text, { size: fontSizes.md, fill: i === 0 ? c.text : c.textMuted, weight: i === 0 ? '600' : '400' });
      });

      return { lead, landing, g, edge: leadEdge };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function render(
      next: LinesCoveredBranchNotScene,
      _prev: LinesCoveredBranchNotScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || h.lead === null || h.edge === null) return;

      // 새로 그어지는 길 — 아직 못 온 만큼 비워 두고 위에서 아래로 긋는다
      const shape = edgeShape(h.edge, h.g);
      const lead = h.lead;
      const L = shape.length;
      lead.setAttribute('stroke-dasharray', `${r1(L)} ${r1(L)}`);
      lead.setAttribute('stroke-dashoffset', r1(L));
      const landing = h.landing;
      if (landing) {
        landing.setAttribute('fill', c.bg);
        landing.setAttribute('stroke', c.border);
      }
      const start = shape.at(0);
      const dot = el(svg, 'circle', { cx: start.x, cy: start.y, r: 5, fill: c.accent, stroke: c.text, 'stroke-width': 1 });

      const frames = Math.max(1, Math.round(MOVE_MS / FRAME_MS));
      for (let i = 1; i <= frames; i += 1) {
        if (mine !== gen || destroyed) return;
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const u = i / frames;
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        lead.setAttribute('stroke-dashoffset', r1(L * (1 - e)));
        const p = shape.at(e);
        dot.setAttribute('cx', r1(p.x));
        dot.setAttribute('cy', r1(p.y));
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
