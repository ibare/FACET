/**
 * 포워딩 조각의 그림.
 *
 * 위 — 다섯 단계 칸. 명령어 카드가 사이클마다 한 칸씩 오른쪽으로 옮겨 간다. 카드에는 EX
 *      입구의 두 피연산자와 결과가 있다.
 * 아래 — 가져올 명령어 목록(IF 밑)과 레지스터 파일(ID 밑). WB 에서 레지스터 파일로 돌아오는
 *      긴 쓰기 길이 바닥을 가로지른다.
 *
 * 동사 "건너간다" — 사이클 4 에 I1 이 쥔 12 가 EX/MEM 에서 짧은 호를 타고 I2 의 EX 입구로
 * 옮겨 간다. 레지스터 파일의 r1 은 그동안 옛 값으로 남아 있고, 바닥의 긴 길은 사이클 5
 * 에야 탄다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

import {
  crossingNow,
  readsOld,
  staleRegs,
  type Caption,
  type Instr,
  type Lane,
  type OperandForwardingScene,
  type Slot,
  type StageName,
  type Where,
} from './scene.js';

const H = 400;
const SVG = 'http://www.w3.org/2000/svg';

/** 운동 길이 (ms). */
const MOVE_MS = 450;
const WRITE_MS = 650;
const CROSS_MS = 700;
const ALU_MS = 380;
const GHOST_MS = 650;

const HEAD_Y = 16;
const CARD_Y = 30;
const CARD_H = 86;
const REG_TITLE_Y = 184;
const REG_TOP = 192;
const RULER_Y = 330;
const CAP1_Y = 366;
const CAP2_Y = 388;

type Pt = { x: number; y: number };

/** -0 과 부동소수 끝자리를 걷는다. */
function rd(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
}

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

function quad(a: Pt, c: Pt, b: Pt, p: number): Pt {
  const q = 1 - p;
  return { x: q * q * a.x + 2 * q * p * c.x + p * p * b.x, y: q * q * a.y + 2 * q * p * c.y + p * p * b.y };
}

/** 꺾은선 위의 한 점 — 마디 길이에 비례해 나눈다. */
function along(pts: readonly Pt[], p: number): Pt {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const l = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    lens.push(l);
    total += l;
  }
  let d = total * p;
  for (let i = 1; i < pts.length; i += 1) {
    const l = lens[i - 1]!;
    if (d <= l || i === pts.length - 1) return lerp(pts[i - 1]!, pts[i]!, l === 0 ? 1 : Math.min(1, d / l));
    d -= l;
  }
  return pts[pts.length - 1]!;
}

function fmt(v: number | null): string {
  return v === null ? '—' : String(v);
}

function asm(ins: Instr): string {
  return `${ins.op} ${ins.rd}, ${ins.rs}, ${ins.rt}`;
}

function opSymbol(op: Instr['op']): string {
  return op === 'add' ? '+' : '−';
}

/** 운동 한 마디가 얹는 것. 정적 그리기는 이것 없이 부른다. */
type Chip = { at: Pt; text: string; tone: 'read' | 'cross' | 'write' | 'alu' };
type Fx = {
  /** 명령어 카드의 끝 자리에서 아직 못 온 만큼. */
  shift?: Map<number, Pt>;
  /** 정적 그리기에는 없는(이미 빠져나간) 카드를 이 자리에 그린다. */
  leaving?: { i: number; at: Pt; fade: number }[];
  chips?: Chip[];
  /** 건너가는 호를 여기까지만 그린다 (0..1). */
  arc?: { from: number; to: number; slot: Slot; p: number };
  /** 사이클 표지의 자리 (사이클 단위, 소수 허용). */
  marker?: number;
  /** 포워딩이 없었을 때의 끝 표지 (사이클 단위). */
  ghost?: number;
};

export const operandForwardingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<OperandForwardingScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const W = PIECE_CANVAS_W;
    const pad = 8;
    const symW = 10;
    // 칸 너비는 장면의 단계 수에서 역산한다 (`fit`).
    let stages: readonly StageName[] = [];
    let colW = W;
    let cardW = Math.min(112, colW - 12);
    let cellW = Math.min(26, (cardW - 2 * pad - 2 * symW) / 3);
    const cellH = 20;
    const rulerX0 = 78;
    const rulerX1 = W - 34;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // ── 기하 ─────────────────────────────────────────────

    function fit(s: OperandForwardingScene): void {
      stages = s.stages;
      colW = W / Math.max(1, stages.length);
      cardW = Math.min(112, colW - 12);
      cellW = Math.min(26, (cardW - 2 * pad - 2 * symW) / 3);
    }
    function colX(where: Where): number {
      const k = stages.findIndex((x) => x === where);
      return k < 0 ? 0 : k * colW;
    }
    function stageLabel(name: StageName): string {
      switch (name) {
        case 'IF':
          return t('stage.if', 'IF');
        case 'ID':
          return t('stage.id', 'ID');
        case 'EX':
          return t('stage.ex', 'EX');
        case 'MEM':
          return t('stage.mem', 'MEM');
        case 'WB':
          return t('stage.wb', 'WB');
      }
    }
    function cardOrigin(where: Where): Pt {
      return { x: colX(where) + (colW - cardW) / 2, y: CARD_Y };
    }
    function cellBox(origin: Pt, which: 'a' | 'b' | 'r'): { x: number; y: number } {
      const ax = origin.x + pad;
      const x = which === 'a' ? ax : which === 'b' ? ax + cellW + symW : ax + 2 * (cellW + symW);
      return { x, y: origin.y + 48 };
    }
    function cellCenter(origin: Pt, which: 'a' | 'b' | 'r'): Pt {
      const b = cellBox(origin, which);
      return { x: b.x + cellW / 2, y: b.y + cellH / 2 };
    }
    function rowH(n: number): number {
      return Math.min(22, (RULER_Y - 34 - REG_TOP) / Math.max(1, n));
    }
    function regBox(): { x: number; w: number } {
      return { x: colW + (colW - cardW) / 2, w: cardW };
    }
    function regValueCenter(s: OperandForwardingScene, name: string): Pt {
      const k = Math.max(0, s.regs.findIndex((r) => r.name === name));
      const b = regBox();
      const h = rowH(s.regs.length);
      return { x: b.x + b.w - 8 - 17, y: REG_TOP + k * h + h / 2 };
    }
    function programLine(s: OperandForwardingScene, i: number): Pt {
      const h = rowH(s.program.length);
      return { x: (colW - cardW) / 2, y: REG_TOP + i * h + h / 2 };
    }
    function busY(s: OperandForwardingScene): number {
      return REG_TOP + (s.regs.length * rowH(s.regs.length)) / 2;
    }
    function tickX(s: OperandForwardingScene, c: number): number {
      const n = Math.max(2, s.slowEnd);
      return rulerX0 + ((c - 1) * (rulerX1 - rulerX0)) / (n - 1);
    }
    function arcPoints(s: OperandForwardingScene, from: number, to: number, slot: Slot): [Pt, Pt, Pt] {
      const src = cellCenter(cardOrigin(s.lanes[from]!.where), 'r');
      const dst = cellCenter(cardOrigin(s.lanes[to]!.where), slot);
      const y0 = CARD_Y + CARD_H;
      const a = { x: src.x, y: y0 };
      const b = { x: dst.x, y: y0 };
      return [a, { x: (a.x + b.x) / 2, y: y0 + 46 }, b];
    }
    function writePath(s: OperandForwardingScene, reg: string): Pt[] {
      const from = cellCenter(cardOrigin('WB'), 'r');
      const y = busY(s);
      const box = regBox();
      const end = regValueCenter(s, reg);
      return [from, { x: from.x, y }, { x: box.x + box.w + 10, y }, { x: box.x + box.w + 10, y: end.y }, end];
    }

    // ── 그리기 ───────────────────────────────────────────

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(rd(v)) : v);
      parent.appendChild(node);
      return node;
    }
    function text(
      x: number,
      y: number,
      s: string,
      o: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: number } = {},
      parent: Element = svg,
    ): SVGTextElement {
      const n = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size ?? fontSizes.xs,
          fill: o.fill ?? colors.text,
          'text-anchor': o.anchor ?? 'start',
          'font-weight': o.weight ?? 400,
        },
        parent,
      );
      n.textContent = s;
      return n;
    }

    function instrLabel(i: number): string {
      return t('label.instr', 'I{n}', { n: i + 1 });
    }

    function drawCard(s: OperandForwardingScene, i: number, origin: Pt, fade = 1): void {
      const ins = s.program[i]!;
      const lane: Lane = s.lanes[i]!;
      const g = el('g', fade < 1 ? { opacity: fade } : {});
      el('rect', { x: origin.x, y: origin.y, width: cardW, height: CARD_H, rx: 6, fill: colors.bgSubtle, stroke: colors.border }, g);
      text(origin.x + pad, origin.y + 14, instrLabel(i), { fill: colors.textMuted, weight: 600 }, g);
      text(origin.x + pad, origin.y + 30, asm(ins), { mono: true }, g);

      const slots: ['a' | 'b' | 'r', string, number | null][] = [
        ['a', ins.rs, lane.a],
        ['b', ins.rt, lane.b],
        ['r', ins.rd, lane.result],
      ];
      for (const [which, reg, value] of slots) {
        const box = cellBox(origin, which);
        const crossed = lane.fwd !== null && which === lane.fwd.slot;
        // 레지스터 파일에서 읽은 값이 아직 쓰이지 않은 앞 명령어의 것이면 옛 값이다.
        const old = which !== 'r' && !crossed && value !== null && readsOld(s, i, reg);
        el(
          'rect',
          {
            x: box.x,
            y: box.y,
            width: cellW,
            height: cellH,
            rx: 3,
            fill: crossed ? colors.accent : colors.bg,
            stroke: crossed ? colors.accent : old ? colors.itemComparing : colors.border,
            'stroke-width': old ? 2 : 1,
          },
          g,
        );
        text(box.x + cellW / 2, box.y - 3, reg, { mono: true, fill: colors.textMuted, anchor: 'middle', size: '10px' }, g);
        if (value !== null) {
          text(box.x + cellW / 2, box.y + 14, String(value), {
            mono: true,
            anchor: 'middle',
            fill: crossed ? colors.stateInk : old ? colors.itemComparing : colors.text,
            weight: 600,
          }, g);
        }
      }
      const a = cellBox(origin, 'a');
      const b = cellBox(origin, 'b');
      text(a.x + cellW + symW / 2, a.y + 14, opSymbol(ins.op), { anchor: 'middle', fill: colors.textMuted }, g);
      text(b.x + cellW + symW / 2, b.y + 14, '=', { anchor: 'middle', fill: colors.textMuted }, g);

      // 건네받아 밀려난 옛 값 — 레지스터 파일에서 읽어 두었던 것.
      if (lane.fwd && lane.fwd.replaced !== null) {
        const box = cellBox(origin, lane.fwd.slot);
        const cx = box.x + cellW / 2;
        const y = box.y + cellH + 12;
        text(cx, y, String(lane.fwd.replaced), { mono: true, anchor: 'middle', fill: colors.itemComparing }, g);
        el('line', { x1: cx - 7, y1: y - 4, x2: cx + 7, y2: y - 4, stroke: colors.itemComparing, 'stroke-width': 1.5 }, g);
      }
    }

    function drawChip(c: Chip): void {
      const w = Math.max(cellW, 8 + c.text.length * 7);
      const fill = c.tone === 'cross' ? colors.accent : c.tone === 'write' ? colors.success : colors.bg;
      const ink = c.tone === 'cross' ? colors.stateInk : c.tone === 'write' ? colors.textInverse : colors.text;
      const stroke = c.tone === 'cross' ? colors.accent : c.tone === 'write' ? colors.success : colors.text;
      el('rect', { x: c.at.x - w / 2, y: c.at.y - cellH / 2, width: w, height: cellH, rx: 3, fill, stroke, 'stroke-width': 1.5 });
      text(c.at.x, c.at.y + 4, c.text, { mono: true, anchor: 'middle', fill: ink, weight: 600 });
    }

    function drawArc(s: OperandForwardingScene, from: number, to: number, slot: Slot, p: number): void {
      const [a, c, b] = arcPoints(s, from, to, slot);
      const n = 24;
      const pts: string[] = [];
      for (let k = 0; k <= n; k += 1) {
        const q = quad(a, c, b, (k / n) * p);
        pts.push(`${rd(q.x)},${rd(q.y)}`);
      }
      el('polyline', { points: pts.join(' '), fill: 'none', stroke: colors.accent, 'stroke-width': 2.5, 'stroke-linecap': 'round' });
      if (p >= 1) {
        // 화살촉 — 위를 향한다 (EX 입구로 들어간다).
        el('path', { d: `M ${rd(b.x - 5)} ${rd(b.y + 8)} L ${rd(b.x)} ${rd(b.y + 1)} L ${rd(b.x + 5)} ${rd(b.y + 8)} Z`, fill: colors.accent });
        text(c.x, (a.y + c.y) / 2 + 12, t('label.forward', 'forward'), { anchor: 'middle', fill: colors.textMuted });
      }
    }

    function captionLines(c: Caption): [string, string] {
      switch (c.kind) {
        case 'none':
          return ['', ''];
        case 'init':
          return [
            t('caption.init', '{to} reads {reg}, which {from} writes.', { to: instrLabel(c.to), reg: c.reg, from: instrLabel(c.from) }),
            '',
          ];
        case 'fetch':
          return [t('caption.fetch', 'Cycle {c}: {who} is fetched.', { c: c.c, who: instrLabel(c.i) }), ''];
        case 'read':
          return [
            t('caption.read', 'Cycle {c}: {who} reads {ra} = {va} and {rb} = {vb} from the register file.', {
              c: c.c,
              who: instrLabel(c.i),
              ra: c.ra,
              va: fmt(c.va),
              rb: c.rb,
              vb: fmt(c.vb),
            }),
            '',
          ];
        case 'alu':
          return [
            t('caption.alu', 'Cycle {c}: {who} computes {a} {op} {b} = {v} in EX.', {
              c: c.c,
              who: instrLabel(c.i),
              a: c.a,
              op: opSymbol(c.op),
              b: c.b,
              v: c.value,
            }),
            '',
          ];
        case 'stale':
          return [
            t('caption.stale', 'Cycle {c}: {from} gets {v} in EX.', { c: c.c, from: instrLabel(c.from), v: c.value }),
            t('caption.stale.note', 'At the same time {to} reads {reg} = {old} from the register file, the old value.', {
              to: instrLabel(c.to),
              reg: c.reg,
              old: fmt(c.old),
            }),
          ];
        case 'forward':
          return [
            t('caption.forward', "Cycle {c}: {v} crosses from EX/MEM straight into {to}'s EX.", {
              c: c.c,
              v: c.value,
              to: instrLabel(c.to),
            }),
            t('caption.forward.note', 'The register file still holds {reg} = {old}.', { reg: c.reg, old: fmt(c.old) }),
          ];
        case 'write':
          return [
            t('caption.write', 'Cycle {c}: {who} writes {reg} = {v} into the register file.', {
              c: c.c,
              who: instrLabel(c.i),
              reg: c.reg,
              v: c.value,
            }),
            '',
          ];
        case 'done':
          return [
            t('caption.done', '{count} instructions, {stalls} stall cycles: they finish at cycle {end}.', {
              count: c.count,
              stalls: c.stalls,
              end: c.end,
            }),
            t('caption.done.note', 'Without forwarding, {to} waits {stall} more cycles and they finish at cycle {slow}.', {
              to: instrLabel(c.to),
              stall: c.stall,
              slow: c.slow,
            }),
          ];
      }
    }

    function draw(s: OperandForwardingScene, fx: Fx): void {
      svg.textContent = '';
      fit(s);
      if (s.program.length === 0) return;

      // 단계 머리
      stages.forEach((name, k) => {
        text(k * colW + colW / 2, HEAD_Y, stageLabel(name), {
          anchor: 'middle',
          size: fontSizes.sm,
          weight: 600,
          fill: colors.textMuted,
        });
      });

      // 단계 레지스터 (칸 사이의 막대). EX/MEM 은 건네는 길의 출발점이다.
      const crossing = fx.arc !== undefined || crossingNow(s).length > 0;
      const exMem = stages.indexOf('MEM');
      for (let k = 1; k < stages.length; k += 1) {
        const hot = k === exMem && crossing;
        el('rect', {
          x: k * colW - 1.5,
          y: CARD_Y - 2,
          width: 3,
          height: CARD_H + 6,
          fill: hot ? colors.accent : colors.border,
        });
      }
      text(exMem * colW, HEAD_Y + 8, t('label.exmem', 'EX/MEM'), { anchor: 'middle', size: '10px', fill: colors.textMuted });

      // 명령어 목록 (IF 밑) — 원본은 남는다.
      text(colW / 2, REG_TITLE_Y, t('label.program', 'program'), { anchor: 'middle', fill: colors.textMuted });
      const ph = rowH(s.program.length);
      s.program.forEach((ins, i) => {
        const p = programLine(s, i);
        el('rect', { x: p.x, y: p.y - ph / 2 + 1, width: cardW, height: ph - 2, rx: 3, fill: colors.bgSubtle, stroke: colors.border });
        text(p.x + 6, p.y + 4, asm(ins), { mono: true, fill: colors.textMuted });
      });

      // 레지스터 파일 (ID 밑)
      const box = regBox();
      const h = rowH(s.regs.length);
      const stale = staleRegs(s);
      const justWritten = new Set(
        s.lanes.flatMap((l, i) => (l.writtenAt !== null && l.writtenAt === s.cycle ? [s.program[i]!.rd] : [])),
      );
      text(box.x + box.w / 2, REG_TITLE_Y, t('label.regfile', 'register file'), { anchor: 'middle', fill: colors.textMuted });
      el('rect', { x: box.x, y: REG_TOP, width: box.w, height: s.regs.length * h, rx: 4, fill: colors.bgSubtle, stroke: colors.border });

      // WB → 레지스터 파일, 바닥의 긴 쓰기 길
      const wbX = cellCenter(cardOrigin('WB'), 'r').x;
      const by = busY(s);
      el('polyline', {
        points: [
          `${rd(wbX)},${rd(CARD_Y + CARD_H)}`,
          `${rd(wbX)},${rd(by)}`,
          `${rd(box.x + box.w)},${rd(by)}`,
        ].join(' '),
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 2,
        'stroke-dasharray': '5 4',
      });
      text(wbX - 6, by - 6, t('label.writeback', 'write back'), { anchor: 'end', fill: colors.textMuted });

      s.regs.forEach((r, k) => {
        const y = REG_TOP + k * h;
        const vc = regValueCenter(s, r.name);
        text(box.x + 10, y + h / 2 + 4, r.name, { mono: true, fill: colors.textMuted });
        const isStale = stale.has(r.name) && r.value !== null;
        const fresh = justWritten.has(r.name);
        el('rect', {
          x: vc.x - 17,
          y: y + 2,
          width: 34,
          height: h - 4,
          rx: 3,
          fill: colors.bg,
          stroke: isStale ? colors.itemComparing : fresh ? colors.success : colors.border,
          'stroke-width': isStale || fresh ? 2 : 1,
        });
        text(vc.x, y + h / 2 + 4, fmt(r.value), {
          mono: true,
          anchor: 'middle',
          weight: 600,
          fill: isStale ? colors.itemComparing : colors.text,
        });
        if (isStale) {
          text(box.x + box.w + 22, y + h / 2 + 4, t('label.stale', 'old value'), { fill: colors.itemComparing });
        }
      });

      // 사이클 자
      text(8, RULER_Y + 4, t('label.cycle', 'cycle'), { fill: colors.textMuted });
      el('line', { x1: rulerX0, y1: RULER_Y, x2: rulerX1, y2: RULER_Y, stroke: colors.border, 'stroke-width': 2 });
      for (let c = 1; c <= s.slowEnd; c += 1) {
        const x = tickX(s, c);
        const beyond = c > s.end;
        el('line', { x1: x, y1: RULER_Y - 4, x2: x, y2: RULER_Y + 4, stroke: beyond ? colors.border : colors.textMuted, 'stroke-width': 1.5 });
        text(x, RULER_Y + 18, String(c), { anchor: 'middle', mono: true, fill: beyond ? colors.textMuted : colors.text });
      }
      const ghost = fx.ghost ?? (s.finished ? s.slowEnd : null);
      if (ghost !== null) {
        const gx = tickX(s, ghost);
        el('line', {
          x1: tickX(s, s.end),
          y1: RULER_Y - 12,
          x2: gx,
          y2: RULER_Y - 12,
          stroke: colors.itemComparing,
          'stroke-width': 2,
          'stroke-dasharray': '4 3',
        });
        el('circle', { cx: gx, cy: RULER_Y, r: 6, fill: colors.bg, stroke: colors.itemComparing, 'stroke-width': 2 });
        text(gx, RULER_Y - 18, t('label.noForward', 'without forwarding'), { anchor: 'end', fill: colors.itemComparing });
      }
      const marker = fx.marker ?? s.cycle;
      if (marker >= 1) {
        el('circle', { cx: tickX(s, marker), cy: RULER_Y, r: 6, fill: colors.primary });
      }

      // 건너가는 호
      if (fx.arc) drawArc(s, fx.arc.from, fx.arc.to, fx.arc.slot, fx.arc.p);
      else {
        for (const f of crossingNow(s)) {
          if (s.lanes[f.from]!.where !== 'out' && s.lanes[f.to]!.where !== 'out') drawArc(s, f.from, f.to, f.slot, 1);
        }
      }

      // 명령어 카드
      s.lanes.forEach((lane, i) => {
        if (lane.where === 'wait' || lane.where === 'out') return;
        const o = cardOrigin(lane.where);
        const d = fx.shift?.get(i);
        drawCard(s, i, d ? { x: o.x + d.x, y: o.y + d.y } : o);
      });
      for (const l of fx.leaving ?? []) drawCard(s, l.i, l.at, l.fade);

      for (const c of fx.chips ?? []) drawChip(c);

      // 캡션
      const [c1, c2] = captionLines(s.caption);
      if (c1) text(W / 2, CAP1_Y, c1, { anchor: 'middle', size: fontSizes.sm, weight: 600 });
      if (c2) text(W / 2, CAP2_Y, c2, { anchor: 'middle', size: fontSizes.sm, fill: colors.textMuted });
    }

    function drawStatic(s: OperandForwardingScene): void {
      draw(s, {});
    }

    // ── 운동 ─────────────────────────────────────────────

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        const start = Date.now();
        let settled = false;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    /** 이번 사이클이 한 일을 되돌린 장면 — 운동이 아직 그 일에 이르지 못한 동안의 바탕. */
    function before(
      s: OperandForwardingScene,
      undo: { writes: boolean; reads: boolean; forwards: boolean; alu: boolean },
    ): OperandForwardingScene {
      if (s.step.kind !== 'cycle') return s;
      const step = s.step;
      const lanes = s.lanes.map((l) => ({ ...l }));
      const regs = s.regs.map((r) => ({ ...r }));
      if (undo.alu) for (const x of step.alu) lanes[x.i]!.result = null;
      if (undo.forwards) {
        for (const f of step.forwards) {
          lanes[f.to]![f.slot] = f.replaced;
          lanes[f.to]!.fwd = null;
        }
      }
      if (undo.reads) for (const r of step.reads) lanes[r.i]![r.slot] = null;
      if (undo.writes) {
        for (const w of step.writes) {
          const row = regs.find((r) => r.name === w.reg);
          if (row) row.value = w.was;
          lanes[w.i]!.writtenAt = null;
        }
      }
      return { ...s, lanes, regs };
    }

    async function playCycle(s: OperandForwardingScene, mine: number): Promise<void> {
      if (s.step.kind !== 'cycle') return;
      const step = s.step;
      const alive = (): boolean => !destroyed && mine === gen;

      // 1. 카드가 한 칸씩 옮겨 간다. 사이클 표지도 한 눈금.
      const base0 = before(s, { writes: true, reads: true, forwards: true, alu: true });
      const ok0 = await tween(MOVE_MS, mine, (p) => {
        const shift = new Map<number, Pt>();
        const leaving: { i: number; at: Pt; fade: number }[] = [];
        for (const m of step.moves) {
          if (m.to === 'out') {
            const o = cardOrigin('WB');
            leaving.push({ i: m.i, at: { x: o.x + colW * p, y: o.y }, fade: 1 - p });
            continue;
          }
          const end = cardOrigin(m.to);
          const start =
            m.from === 'wait'
              ? { x: programLine(s, m.i).x, y: programLine(s, m.i).y - CARD_H / 2 }
              : cardOrigin(m.from);
          shift.set(m.i, { x: (start.x - end.x) * (1 - p), y: (start.y - end.y) * (1 - p) });
        }
        draw(base0, { shift, leaving, marker: Math.max(1, step.cycle - 1 + p) });
      });
      if (!ok0 || !alive()) return;

      // 2. 앞 반 — WB 의 값이 바닥의 긴 길을 따라 레지스터 파일로 간다.
      if (step.writes.length > 0) {
        const ok = await tween(WRITE_MS, mine, (p) => {
          const chips: Chip[] = step.writes.map((w) => ({
            at: along(writePath(s, w.reg), p),
            text: String(w.value),
            tone: 'write',
          }));
          draw(base0, { chips });
        });
        if (!ok || !alive()) return;
      }

      // 3. 뒤 반 — ID 가 파일에서 읽고, EX 입구로 EX/MEM 의 값이 건너간다.
      if (step.reads.length > 0 || step.forwards.length > 0) {
        const base = before(s, { writes: false, reads: true, forwards: true, alu: true });
        const f = step.forwards[0];
        const ok = await tween(CROSS_MS, mine, (p) => {
          const chips: Chip[] = step.reads.map((r) => {
            const from = regValueCenter(s, r.reg);
            const to = cellCenter(cardOrigin(s.lanes[r.i]!.where), r.slot);
            return { at: lerp(from, to, p), text: fmt(r.value), tone: 'read' };
          });
          for (const x of step.forwards) {
            const [a, c, b] = arcPoints(s, x.from, x.to, x.slot);
            const src = cellCenter(cardOrigin(s.lanes[x.from]!.where), 'r');
            const dst = cellCenter(cardOrigin(s.lanes[x.to]!.where), x.slot);
            // 결과 칸에서 내려와 호를 타고 EX 입구로 올라간다.
            const at = p < 0.15 ? lerp(src, a, p / 0.15) : p > 0.85 ? lerp(b, dst, (p - 0.85) / 0.15) : quad(a, c, b, (p - 0.15) / 0.7);
            chips.push({ at, text: String(x.value), tone: 'cross' });
          }
          draw(base, {
            chips,
            arc: f ? { from: f.from, to: f.to, slot: f.slot, p: Math.min(1, Math.max(0, (p - 0.15) / 0.7)) } : undefined,
          });
        });
        if (!ok || !alive()) return;
      }

      // 4. EX — 두 피연산자 사이에서 결과가 나와 결과 칸으로 간다.
      if (step.alu.length > 0) {
        const base = before(s, { writes: false, reads: false, forwards: false, alu: true });
        const ok = await tween(ALU_MS, mine, (p) => {
          const chips: Chip[] = step.alu.map((x) => {
            const o = cardOrigin(s.lanes[x.i]!.where);
            const from = lerp(cellCenter(o, 'a'), cellCenter(o, 'b'), 0.5);
            return { at: lerp(from, cellCenter(o, 'r'), p), text: String(x.value), tone: 'alu' };
          });
          draw(base, { chips });
        });
        if (!ok || !alive()) return;
      }
    }

    async function playDone(s: OperandForwardingScene, mine: number): Promise<void> {
      // 포워딩이 없었다면 — 끝 표지가 더 가야 할 만큼 밀려 간다.
      await tween(GHOST_MS, mine, (p) => draw(s, { ghost: s.end + (s.slowEnd - s.end) * p }));
    }

    function wakeAll(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
    }

    return {
      async render(next, prev, opts): Promise<void> {
        wakeAll();
        const mine = (gen += 1);
        if (destroyed) return;
        fit(next);
        if (!opts.animate || prev === null) {
          drawStatic(next);
          return;
        }
        if (next.step.kind === 'cycle') await playCycle(next, mine);
        else if (next.step.kind === 'done') await playDone(next, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        wakeAll();
        svg.textContent = '';
      },
    };
  },
};
