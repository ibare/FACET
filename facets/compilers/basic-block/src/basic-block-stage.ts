/**
 * basic-block 무대 — 한 줄로 이어진 명령 띠에 규칙마다 리더가 짚이고,
 * 마지막 걸음에서 리더 앞이 잘려 토막(블록)들이 서로 떨어져 나간다.
 *
 * 간선은 그리지 않는다. 토막 안의 화살은 "위에서 아래로만 흐른다" 는 토막 자신의 모양이다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, Translate, ViewInstance } from '@ffacet/core/runtime';
import type { Instruction, LeaderRule, Operand } from './algorithm.js';
import type { BasicBlockScene } from './scene.js';

const H = 400;
const W = PIECE_CANVAS_W;
const SVG = 'http://www.w3.org/2000/svg';

const CHIP_MS = 320;
const CUT_MS = 620;
/** 자르는 걸음에서 칼금이 가로지르는 몫. 나머지 몫에 토막이 벌어진다 */
const CUT_SPLIT = 0.4;

const CODE_PX = parseFloat(fontSizes.md);
/** 고정폭 글꼴의 글자 폭 비 */
const CHAR_RATIO = 0.6;

const TOP = 84;
const BOTTOM = H - 44;
/** 띠 높이 가운데 자른 틈에 내주는 몫 */
const GAP_SHARE = 0.16;
const ROW_MAX = 34;

function opnd(o: Operand): string {
  return 'var' in o ? o.var : String(o.num);
}

/** 명령 몸 글자 (라벨 제외). 모르는 모양은 알고리즘의 readCode 가 이미 걸렀다 */
function bodyText(ins: Instruction): string {
  switch (ins.k) {
    case 'bin':
      return `${ins.dst} = ${opnd(ins.l)} ${ins.op} ${opnd(ins.r)}`;
    case 'copy':
      return `${ins.dst} = ${opnd(ins.src)}`;
    case 'ifnot':
      return `ifnot ${ins.cond} goto ${ins.target}`;
    case 'goto':
      return `goto ${ins.target}`;
    case 'return':
      return `return ${opnd(ins.value)}`;
  }
}

function insAt(code: Instruction[], i: number): Instruction {
  const ins = code[i];
  if (!ins) throw new Error(`basic-block 무대: 줄 ${i + 1} 이 코드에 없다`);
  return ins;
}

function cutBlocks(scene: BasicBlockScene): NonNullable<BasicBlockScene['blocks']> {
  if (!scene.blocks) throw new Error('basic-block 무대: 자른 걸음인데 블록이 없다');
  return scene.blocks;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

type Motion = { kind: 'none' } | { kind: 'chip'; p: number } | { kind: 'cut'; p: number };

type Layout = {
  rowH: number;
  gap: number;
  charW: number;
  numX: number;
  notchX: number;
  stripX: number;
  stripR: number;
  labelX: number;
  bodyX: number;
  frameR: number;
  arrowX: number;
  nameX: number;
  chipR: number;
  chipX(rule: LeaderRule): number;
};

function layout(scene: BasicBlockScene): Layout {
  const n = Math.max(1, scene.code.length);
  const avail = BOTTOM - TOP;
  const rowH = Math.min(ROW_MAX, (avail * (1 - GAP_SHARE)) / n);
  const nb = scene.blocks ? scene.blocks.length : 1;
  const gap = nb > 1 ? Math.min(rowH * 0.9, (avail - rowH * n) / (nb - 1)) : 0;
  const charW = CODE_PX * CHAR_RATIO;
  const maxLabel = scene.code.reduce((m, ins) => Math.max(m, ins.label ? ins.label.length + 1 : 0), 0);
  const stripX = W * 0.12;
  const labelX = stripX + 14;
  const bodyX = labelX + (maxLabel > 0 ? (maxLabel + 1) * charW : 0);
  const chipStep = W * 0.05;
  const chip0 = W * 0.65;
  return {
    rowH,
    gap,
    charW,
    numX: W * 0.075,
    notchX: W * 0.1,
    stripX,
    stripR: W * 0.61,
    labelX,
    bodyX,
    frameR: chip0 + chipStep * 2 + W * 0.035,
    arrowX: W * 0.83,
    nameX: W * 0.87,
    chipR: Math.min(9, rowH * 0.32),
    chipX: (rule) => chip0 + chipStep * (rule - 1),
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
  parent.appendChild(node);
  return node;
}

function lineList(lines: number[]): string {
  return lines.map((l) => String(l + 1)).join(' · ');
}

function ruleCaption(t: Translate, rule: LeaderRule): string {
  if (rule === 1) return t('caption.rule1', 'Rule 1: the first instruction is a leader.');
  if (rule === 2) return t('caption.rule2', 'Rule 2: a line that some jump lands on is a leader.');
  return t('caption.rule3', 'Rule 3: the line right after a jump or return is a leader.');
}

function ruleLabel(t: Translate, rule: LeaderRule): string {
  if (rule === 1) return t('label.rule1', 'first instruction');
  if (rule === 2) return t('label.rule2', 'jump target');
  return t('label.rule3', 'after a jump or return');
}

function draw(svg: SVGSVGElement, scene: BasicBlockScene, c: Palette, t: Translate, motion: Motion): void {
  svg.textContent = '';
  const L = layout(scene);
  const code = scene.code;
  const step = scene.step;

  // ── 캡션 — 지금 일어나는 일만 ──
  const lines: Array<{ text: string; main: boolean }> = [];
  if (step.kind === 'start') {
    lines.push({ text: t('caption.start', 'Instructions: {n}. Still one unbroken run.', { n: code.length }), main: true });
  } else if (step.kind === 'rule') {
    lines.push({ text: ruleCaption(t, step.rule), main: true });
    if (step.hits.length === 0) {
      lines.push({ text: t('caption.none', 'No line matches.'), main: false });
    } else {
      lines.push({
        text: t('caption.hits', 'Leader lines: {lines}', { lines: lineList(step.hits.map((h) => h.line)) }),
        main: false,
      });
    }
    if (step.rule === 2 && step.hits.length > 0) {
      const from = [...new Set(step.hits.flatMap((h) => h.from))].sort((a, b) => a - b);
      lines.push({ text: t('caption.from', 'Jumping from line: {from}', { from: lineList(from) }), main: false });
    }
    if (step.again.length > 0) {
      lines.push({
        text: t('caption.again', 'Already a leader — line: {lines} · Leaders so far: {n}', {
          lines: lineList(step.again),
          n: step.leaders,
        }),
        main: false,
      });
    }
  } else {
    lines.push({ text: t('caption.cut', 'Cut in front of every leader.'), main: true });
    lines.push({
      text: t('caption.blocks', 'Leader lines: {leaders} · Blocks: {n}', {
        leaders: lineList(step.leaders),
        n: cutBlocks(scene).length,
      }),
      main: false,
    });
  }
  lines.forEach((ln, i) => {
    const txt = el(
      'text',
      {
        x: W * 0.05,
        y: 24 + i * 19,
        fill: ln.main ? c.text : c.textMuted,
        'font-family': fonts.body,
        'font-size': ln.main ? fontSizes.md : fontSizes.sm,
        'font-weight': ln.main ? 600 : 400,
      },
      svg,
    );
    txt.textContent = ln.text;
  });

  if (code.length === 0) return;

  // ── 줄의 자리: 자르기 전에는 한 띠, 자른 뒤에는 토막마다 틈만큼 내려간다 ──
  const blocks = scene.blocks;
  /** 자르기 전에는 띠가 하나라 모든 줄이 0 번 토막 자리에 있다 */
  const blockOf = (i: number): number => {
    if (!blocks) return 0;
    const k = blocks.findIndex((b) => i >= b.start && i < b.end);
    if (k < 0) throw new Error(`basic-block 무대: 줄 ${i + 1} 이 어느 블록에도 없다`);
    return k;
  };
  let spread = blocks ? 1 : 0;
  let knife = 0; // 칼금이 가로지른 몫
  if (motion.kind === 'cut' && blocks) {
    const p = motion.p;
    knife = p < CUT_SPLIT ? p / CUT_SPLIT : 1;
    spread = p < CUT_SPLIT ? 0 : ease((p - CUT_SPLIT) / (1 - CUT_SPLIT));
  }
  const rowY = (i: number): number => TOP + i * L.rowH + blockOf(i) * L.gap * spread;

  const current = step.kind === 'rule' ? step : null;
  const hitLines = new Set(current ? current.hits.map((h) => h.line) : []);

  // 띠 · 토막 바탕
  if (!blocks || (motion.kind === 'cut' && spread === 0)) {
    el(
      'rect',
      {
        x: L.stripX,
        y: TOP,
        width: L.frameR - L.stripX,
        height: L.rowH * code.length,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      },
      svg,
    );
  } else {
    const settled = motion.kind === 'none';
    blocks.forEach((b) => {
      el(
        'rect',
        {
          x: L.stripX,
          y: rowY(b.start),
          width: L.frameR - L.stripX,
          height: L.rowH * (b.end - b.start),
          rx: 6,
          fill: c.bgSubtle,
          stroke: settled ? c.text : c.border,
          'stroke-width': settled ? 1.5 : 1,
        },
        svg,
      );
    });
  }

  // 이번 걸음에 짚인 줄
  for (const line of hitLines) {
    el(
      'rect',
      {
        x: L.stripX + 1,
        y: rowY(line) + 1,
        width: L.stripR - L.stripX - 2,
        height: L.rowH - 2,
        rx: 4,
        fill: c.accent,
        'fill-opacity': 0.35,
      },
      svg,
    );
  }

  // 까닭이 되는 글자 — ② 는 뜀이 가리키는 라벨과 그 라벨, ③ 은 앞 줄의 뜀 · return 낱말
  const marks: Array<{ line: number; x: number; len: number }> = [];
  if (current && current.rule === 2) {
    for (const h of current.hits) {
      const target = insAt(code, h.line).label;
      if (target === null) throw new Error(`basic-block 무대: 규칙 2 가 짚은 줄 ${h.line + 1} 에 라벨이 없다`);
      marks.push({ line: h.line, x: L.labelX, len: target.length + 1 });
      for (const f of h.from) {
        const body = bodyText(insAt(code, f));
        marks.push({ line: f, x: L.bodyX + (body.length - target.length) * L.charW, len: target.length });
      }
    }
  } else if (current && current.rule === 3) {
    for (const h of current.hits) {
      for (const f of h.from) marks.push({ line: f, x: L.bodyX, len: insAt(code, f).k.length });
    }
  }
  for (const m of marks) {
    el(
      'rect',
      {
        x: m.x - 2,
        y: rowY(m.line) + L.rowH * 0.2,
        width: m.len * L.charW + 4,
        height: L.rowH * 0.6,
        rx: 3,
        fill: c.itemComparing,
        'fill-opacity': 0.4,
      },
      svg,
    );
  }

  // 줄 번호 · 라벨 · 명령
  code.forEach((ins, i) => {
    const mid = rowY(i) + L.rowH / 2;
    const num = el(
      'text',
      {
        x: L.numX,
        y: mid,
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      },
      svg,
    );
    num.textContent = String(i + 1);
    if (ins.label) {
      const lab = el(
        'text',
        {
          x: L.labelX,
          y: mid,
          'dominant-baseline': 'central',
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 600,
        },
        svg,
      );
      lab.textContent = `${ins.label}:`;
    }
    const body = el(
      'text',
      {
        x: L.bodyX,
        y: mid,
        'dominant-baseline': 'central',
        fill: c.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      },
      svg,
    );
    body.textContent = bodyText(ins);
  });

  // 리더 표 — 줄 앞의 쐐기와 규칙 방울. 이번 걸음 것은 밖에서 미끄러져 들어온다
  // 한 걸음이 규칙 하나라, 이번 걸음 규칙의 표가 곧 새로 짚인 표다
  const isFresh = (rule: LeaderRule): boolean => current !== null && current.rule === rule;
  const chipP = motion.kind === 'chip' ? ease(motion.p) : 1;
  const leaderLines = new Set(scene.marks.map((m) => m.line));
  for (const line of leaderLines) {
    const isNew = scene.marks.every((m) => m.line !== line || isFresh(m.rule));
    const dx = isNew ? (1 - chipP) * -W * 0.05 : 0;
    const mid = rowY(line) + L.rowH / 2;
    const s = Math.min(7, L.rowH * 0.24);
    const x = L.notchX + dx;
    el(
      'path',
      {
        d: `M${round(x - s)},${round(mid - s)} L${round(x + s * 0.6)},${round(mid)} L${round(x - s)},${round(mid + s)} Z`,
        fill: c.accent,
        stroke: c.text,
        'stroke-width': 1,
        opacity: isNew ? round(chipP) : 1,
      },
      svg,
    );
  }
  scene.marks.forEach((m) => {
    const isNew = isFresh(m.rule);
    const dx = isNew ? (1 - chipP) * W * 0.12 : 0;
    const cx = L.chipX(m.rule) + dx;
    const cy = rowY(m.line) + L.rowH / 2;
    el(
      'circle',
      {
        cx,
        cy,
        r: L.chipR,
        fill: isNew ? c.accent : c.bg,
        stroke: c.text,
        'stroke-width': 1,
      },
      svg,
    );
    const d = el(
      'text',
      {
        x: cx,
        y: cy,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: isNew ? c.stateInk : c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 700,
      },
      svg,
    );
    d.textContent = String(m.rule);
  });

  // 칼금 — 리더 앞(첫 줄 제외)을 왼쪽에서 오른쪽으로 가로지른다
  if (motion.kind === 'cut' && blocks && spread < 1) {
    const x0 = L.stripX - 16;
    const x1 = L.frameR + 16;
    blocks.slice(1).forEach((b) => {
      const y = round(TOP + b.start * L.rowH + (blockOf(b.start) - 0.5) * L.gap * spread);
      el(
        'line',
        {
          x1: x0,
          y1: y,
          x2: x0 + (x1 - x0) * knife,
          y2: y,
          stroke: c.text,
          'stroke-width': 2,
          'stroke-dasharray': '6 4',
          opacity: round(1 - spread),
        },
        svg,
      );
    });
  }

  // 토막마다: 위에서 아래로만 흐르는 화살과 이름
  if (blocks && motion.kind === 'none') {
    blocks.forEach((b, k) => {
      const y0 = rowY(b.start) + 6;
      const y1 = rowY(b.end - 1) + L.rowH - 6;
      el('line', { x1: L.arrowX, y1: y0, x2: L.arrowX, y2: y1 - 5, stroke: c.text, 'stroke-width': 1.5 }, svg);
      el(
        'path',
        { d: `M${round(L.arrowX - 4)},${round(y1 - 6)} L${round(L.arrowX + 4)},${round(y1 - 6)} L${round(L.arrowX)},${round(y1)} Z`, fill: c.text },
        svg,
      );
      el('circle', { cx: L.arrowX, cy: y0, r: 2.5, fill: c.text }, svg);
      const name = el(
        'text',
        {
          x: L.nameX,
          y: (y0 + y1) / 2,
          'dominant-baseline': 'central',
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
        },
        svg,
      );
      name.textContent = `B${k + 1}`;
    });
  }

  // 범례 — 지금까지 댄 규칙만
  const used = new Set(scene.marks.map((m) => m.rule));
  if (current) used.add(current.rule);
  const ly = H - 18;
  ([1, 2, 3] as const).forEach((rule, i) => {
    if (!used.has(rule)) return;
    const x = W * (0.07 + i * 0.3);
    el('circle', { cx: x, cy: ly, r: 7, fill: c.bg, stroke: c.text, 'stroke-width': 1 }, svg);
    const d = el(
      'text',
      {
        x,
        y: ly,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 700,
      },
      svg,
    );
    d.textContent = String(rule);
    const lab = el(
      'text',
      {
        x: x + 12,
        y: ly,
        'dominant-baseline': 'central',
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      },
      svg,
    );
    lab.textContent = ruleLabel(t, rule);
  });
}

export const basicBlockStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        let t0: number | null = null;
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) return wake();
          if (t0 === null) t0 = now;
          const p = Math.min(1, (now - t0) / ms);
          frame(p);
          if (p >= 1) return wake();
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        frame(0);
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });
    }

    return {
      async render(next: BasicBlockScene, prev: BasicBlockScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || !prev || next.step === prev.step) {
          draw(svg, next, c, t, { kind: 'none' });
          return;
        }
        if (next.step.kind === 'rule') {
          await tween(CHIP_MS, mine, (p) => draw(svg, next, c, t, { kind: 'chip', p }));
        } else if (next.step.kind === 'cut') {
          await tween(CUT_MS, mine, (p) => draw(svg, next, c, t, { kind: 'cut', p }));
        }
        if (destroyed || mine !== gen) return;
        draw(svg, next, c, t, { kind: 'none' });
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
