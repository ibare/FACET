/**
 * interference-graph 의 그림.
 *
 * 왼쪽은 명령 열이고, 줄 사이 틈에 훑는 선이 걸린다. 그 틈에서 산 값이 조각으로 선 위에 올라탄다.
 * 한 걸음에 훑는 선이 한 줄 위로 오르고, 그 줄이 정의하는 값의 조각은 오른쪽 마디로 날아가
 * 거기서 같이 산 값의 마디마다 선을 뻗는다. 읽는 값은 명령 글자의 그 자리에서 떠올라 무리에 낀다.
 * 다 훑은 뒤에는 아래 레지스터 줄에서 레지스터 조각이 마디로 옮겨 가 마디를 칠한다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { insParts } from './algorithm.js';
import type { InterferenceScene, Painted } from './scene.js';

const H = 345;
const MOTION_MS = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

const round = (v: number): number => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
};
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export const interferenceGraphStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    const codePx = parseFloat(fontSizes.sm);
    const charW = codePx * 0.6;
    const captionY = 26;
    const subY = 46;
    const codeTop = 80;
    const codeX = 54;
    const leftW = Math.round(W * 0.5);
    const liveX0 = leftW - 120;
    const livePitch = 36;
    const chipW = 30;
    const chipH = 20;
    const graphX0 = leftW + 10;
    const graphCx = Math.round(graphX0 + (W - graphX0) / 2);
    const graphCy = 178;
    const graphR = Math.min(92, Math.round((W - graphX0) / 2 - 50));
    const nodeR = 18;
    const regY = H - 20;
    const regX0 = graphX0 + 80;
    const regPitch = 44;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          clearTimeout(id);
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    /** 틈 k 의 세로 자리 (k = 0 이 L1 위, n 이 Ln 아래). 줄 수가 늘면 간격을 줄여 담는다 */
    function geometry(scene: InterferenceScene) {
      const n = scene.program.length;
      const lineH = Math.min(34, (regY - 8 - codeTop) / n);
      const gapY = (k: number): number => codeTop + k * lineH;
      const lineY = (line: number): number => codeTop + (line - 0.5) * lineH;
      const nodes = new Map<string, Pt>();
      const count = scene.values.length;
      scene.values.forEach((v, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
        nodes.set(v, { x: round(graphCx + graphR * Math.cos(a)), y: round(graphCy + graphR * Math.sin(a)) });
      });
      const node = (v: string): Pt => {
        const p = nodes.get(v);
        if (p === undefined) throw new Error(`마디가 없는 값 ${v}`);
        return p;
      };
      /** 명령 글자 안에서 값 v 가 적힌 자리 (읽는 칸) */
      const operand = (line: number, v: string): Pt => {
        const ins = scene.program[line - 1];
        if (ins === undefined) throw new Error(`L${line}: 명령이 없다`);
        let col = 0;
        let found: number | null = null;
        for (const part of insParts(ins, line)) {
          // 쓰는 칸(dst)이 아니라 읽는 칸에서 떠오른다 — dst 는 늘 첫 값 토막이다
          if (part.value === v && v !== ins.dst) found = col + part.text.length / 2;
          col += part.text.length;
        }
        if (found === null) throw new Error(`L${line}: 읽는 칸에 ${v} 가 없다`);
        return { x: codeX + found * charW, y: lineY(line) };
      };
      return { gapY, lineY, node, operand, lineH };
    }

    const regColors = (scene: InterferenceScene): readonly string[] => categorical(Math.max(1, scene.values.length));
    const regColor = (scene: InterferenceScene, reg: number): string => {
      const col = regColors(scene)[reg - 1];
      if (col === undefined) throw new Error(`색이 없는 레지스터 r${reg}`);
      return col;
    };

    function chip(at: Pt, label: string, fill: string, stroke: string, ink: string, layer: Element): void {
      el('rect', { x: at.x - chipW / 2, y: at.y - chipH / 2, width: chipW, height: chipH, rx: 4, fill, stroke, 'stroke-width': 1.5 }, layer);
      el(
        'text',
        { x: at.x, y: at.y + 4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: ink },
        layer,
        label,
      );
    }

    function captionFor(scene: InterferenceScene): string {
      const s = scene.step;
      switch (s.kind) {
        case 'start':
          return t('caption.start', 'Scan from the end, one line up at a time. Nothing is live after L{last}.', {
            last: scene.program.length,
          });
        case 'scan':
          if (s.def === null) {
            return t('caption.use', 'L{line} defines nothing. Its reads come alive: {values}.', {
              line: s.line,
              values: s.entered.join(', '),
            });
          }
          if (s.added.length === 0) {
            return t('caption.defAlone', 'L{line} defines {value}. Nothing else is live beside it, so no edge.', {
              line: s.line,
              value: s.def,
            });
          }
          return t('caption.def', 'L{line} defines {value}. One new edge to each value live beside it: {others}.', {
            line: s.line,
            value: s.def,
            others: s.added.map(([a, b]) => (a === s.def ? b : a)).join(', '),
          });
        case 'color':
          if (s.neighbors.length === 0) {
            return t('caption.colorFree', '{value}: no colored neighbor. Lowest register: {reg}.', {
              value: s.value,
              reg: `r${s.reg}`,
            });
          }
          return t('caption.color', '{value}: colored neighbors hold {taken}. Lowest free: {reg}.', {
            value: s.value,
            taken: s.neighbors.map((nb) => `${nb.value} r${nb.reg}`).join(' · '),
            reg: `r${s.reg}`,
          });
      }
    }

    /** 장면 전체를 세운다. p = 1 이 정본(끝 자리), p < 1 은 운동 도중 */
    function draw(scene: InterferenceScene, p: number): void {
      svg.textContent = '';
      const g = geometry(scene);
      const step = scene.step;
      const move = ease(clamp01(p / 0.55));
      const grow = ease(clamp01((p - 0.45) / 0.55));

      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
      el(
        'text',
        { x: 20, y: captionY, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text },
        svg,
        captionFor(scene),
      );
      if (scene.painted.length === scene.values.length) {
        const used = new Set(scene.painted.map((q) => q.reg)).size;
        el(
          'text',
          { x: 20, y: subY, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
          svg,
          t('summary', 'Values: {n} · Registers used: {k}', { n: scene.values.length, k: used }),
        );
      }

      // ── 명령 열
      if (step.kind === 'scan') {
        el('rect', { x: 14, y: g.gapY(step.line - 1) + 2, width: liveX0 - 34, height: g.lineH - 4, rx: 4, fill: c.bgSubtle }, svg);
      }
      scene.program.forEach((ins, i) => {
        const y = g.lineY(i + 1) + 4;
        el('text', { x: 20, y, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, svg, `L${i + 1}`);
        el(
          'text',
          { x: codeX, y, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text },
          svg,
          insParts(ins, i + 1)
            .map((part) => part.text)
            .join(''),
        );
      });

      // ── 훑는 선 — 틈에 걸려 위로 오른다
      el(
        'text',
        { x: liveX0 - chipW / 2, y: codeTop - 18, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        svg,
        t('label.live', 'Live'),
      );
      const scanning = scene.gap > 0 || step.kind === 'scan';
      const cursorY = step.kind === 'scan' ? lerp(g.gapY(step.line), g.gapY(step.line - 1), move) : g.gapY(scene.gap);
      const cursorInk = scanning ? c.itemActive : c.border;
      el('line', { x1: 16, y1: cursorY, x2: leftW - 16, y2: cursorY, stroke: cursorInk, 'stroke-width': 2 }, svg);
      el('path', { d: `M 6 ${round(cursorY + 5)} L 11 ${round(cursorY - 4)} L 16 ${round(cursorY + 5)} Z`, fill: cursorInk }, svg);

      const slot = (i: number, y: number): Pt => ({ x: liveX0 + i * livePitch, y });

      // ── 그래프 선
      const edgeLayer = el('g', {}, svg);
      const addedKeys = new Set(step.kind === 'scan' ? step.added.map(([a, b]) => `${a}|${b}`) : []);
      const blockedWith = new Set(step.kind === 'color' ? step.neighbors.map((nb) => nb.value) : []);
      for (const [a, b] of scene.edges) {
        const pa = g.node(a);
        const pb = g.node(b);
        if (step.kind === 'scan' && addedKeys.has(`${a}|${b}`)) {
          if (grow <= 0) continue;
          const from = a === step.def ? pa : pb;
          const to = a === step.def ? pb : pa;
          el(
            'line',
            {
              x1: from.x,
              y1: from.y,
              x2: lerp(from.x, to.x, grow),
              y2: lerp(from.y, to.y, grow),
              stroke: c.itemActive,
              'stroke-width': 3,
            },
            edgeLayer,
          );
          continue;
        }
        const hot = step.kind === 'color' && ((a === step.value && blockedWith.has(b)) || (b === step.value && blockedWith.has(a)));
        el(
          'line',
          { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: hot ? c.text : c.textMuted, 'stroke-width': hot ? 2.5 : 1.5 },
          edgeLayer,
        );
      }
      el(
        'text',
        { x: graphX0, y: codeTop - 18, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        svg,
        t('label.edges', 'Edges: {n}', { n: scene.edges.length }),
      );

      // ── 마디
      const paintedOf = new Map<string, Painted>(scene.painted.map((q) => [q.value, q]));
      const liveSet = new Set(scene.live);
      const current = step.kind === 'scan' ? step.def : step.kind === 'color' ? step.value : null;
      const arriving = step.kind === 'color' && move < 1 ? step.value : null;
      for (const v of scene.values) {
        const at = g.node(v);
        const paint = paintedOf.get(v);
        const filled = paint !== undefined && v !== arriving;
        if (v === current) {
          el('circle', { cx: at.x, cy: at.y, r: nodeR + 5, fill: 'none', stroke: c.itemActive, 'stroke-width': 3 }, svg);
        }
        el(
          'circle',
          {
            cx: at.x,
            cy: at.y,
            r: nodeR,
            fill: filled ? regColor(scene, paint.reg) : c.bg,
            stroke: filled ? c.text : liveSet.has(v) ? c.text : c.border,
            'stroke-width': filled ? 1 : liveSet.has(v) ? 2.5 : 1.5,
          },
          svg,
        );
        el(
          'text',
          {
            x: at.x,
            y: at.y + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: filled ? c.stateInk : c.text,
          },
          svg,
          v,
        );
        if (filled) {
          const dx = at.x - graphCx;
          const dy = at.y - graphCy;
          const len = Math.hypot(dx, dy) || 1;
          el(
            'text',
            {
              x: graphCx + (dx / len) * (graphR + 32),
              y: graphCy + (dy / len) * (graphR + 32) + 4,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: c.text,
            },
            svg,
            `r${paint.reg}`,
          );
        }
      }

      // ── 산 값 조각 — 훑는 선 위에 올라탄다
      const liveY = g.gapY(scene.gap);
      scene.live.forEach((v, i) => {
        const end = slot(i, liveY);
        let from = end;
        if (step.kind === 'scan') {
          const was = step.after.indexOf(v);
          from = step.entered.includes(v) ? g.operand(step.line, v) : was >= 0 ? slot(was, g.gapY(step.line)) : end;
        }
        chip({ x: lerp(from.x, end.x, move), y: lerp(from.y, end.y, move) }, v, c.bg, c.text, c.text, svg);
      });
      // 정의된 값의 조각은 무리를 떠나 제 마디로 간다
      if (step.kind === 'scan' && step.def !== null && move < 1) {
        const was = step.after.indexOf(step.def);
        if (was < 0) throw new Error(`L${step.line}: 정의하는 값 ${step.def} 이 뒤에 살아 있지 않다`);
        const from = slot(was, g.gapY(step.line));
        const to = g.node(step.def);
        chip({ x: lerp(from.x, to.x, move), y: lerp(from.y, to.y, move) }, step.def, c.bg, c.itemActive, c.text, svg);
      }

      // ── 레지스터 줄
      const regs = [...new Set(scene.painted.map((q) => q.reg))].sort((a, b) => a - b);
      if (regs.length > 0 || step.kind === 'color') {
        el(
          'text',
          { x: regX0 - 30, y: regY + 4, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
          svg,
          t('label.registers', 'Registers'),
        );
      }
      const regAt = (reg: number): Pt => ({ x: regX0 + (reg - 1) * regPitch, y: regY });
      const takenRegs = new Set(step.kind === 'color' ? step.neighbors.map((nb) => nb.reg) : []);
      for (const reg of regs) {
        const at = regAt(reg);
        el(
          'rect',
          { x: at.x - 18, y: at.y - 11, width: 36, height: 22, rx: 4, fill: regColor(scene, reg), stroke: c.text, 'stroke-width': 1 },
          svg,
        );
        el(
          'text',
          { x: at.x, y: at.y + 4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.stateInk },
          svg,
          `r${reg}`,
        );
        if (takenRegs.has(reg)) {
          el('line', { x1: at.x - 20, y1: at.y + 13, x2: at.x + 20, y2: at.y - 13, stroke: c.danger, 'stroke-width': 2.5 }, svg);
        }
      }
      // 받은 레지스터의 조각이 마디로 옮겨 간다
      if (step.kind === 'color' && move < 1) {
        const from = regAt(step.reg);
        const to = g.node(step.value);
        chip(
          { x: lerp(from.x, to.x, move), y: lerp(from.y, to.y, move) },
          `r${step.reg}`,
          regColor(scene, step.reg),
          c.text,
          c.stateInk,
          svg,
        );
      }
    }

    async function flow(mine: number, scene: InterferenceScene): Promise<void> {
      const frame = 16;
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const k = clamp01((Date.now() - start) / MOTION_MS);
        draw(scene, k);
        if (k >= 1) break;
        await wait(frame);
      }
    }

    return {
      async render(next: InterferenceScene, prev: InterferenceScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || prev === null || next.step.kind === 'start') {
          draw(next, 1);
          return;
        }
        await flow(mine, next);
        if (mine !== gen || destroyed) return;
        draw(next, 1);
      },
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
