/**
 * registers-are-few 의 그림.
 *
 * 위 — 명령 열 전체. 아직 안 본 줄은 할당 전 글자(t), 마친 줄은 레지스터 글자(r).
 * 가운데 — 레지스터 자리 셋. 값이 자리에 앉아 있다. 그 아래에는 앞서 앉았다 떠난 값.
 * 아래 — 줄을 마친 뒤 산 값의 수와 레지스터 수의 천장.
 *
 * 운동 (동사: 비운 자리에 들어앉는다)
 *   1. 마지막으로 읽힌 값이 자리에서 일어나 아래 "앞서 앉았던 값" 줄로 내려간다
 *   2. 이 줄이 정의한 값이 명령 칸에서 떨어져 나와 빈 자리로 날아가 앉는다
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import { formatInstr } from './algorithm.js';
import type { RegistersAreFewScene } from './scene.js';

const H = 390;
const W = PIECE_CANVAS_W;
const PAD = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 명령 칸
const CHIP_GAP = 6;
const CHIP_H = 24;
const CHIP_TOP = 16; // 첫 줄 칸의 위 (줄 번호는 그 위에)
const CHIP_ROW = 44; // 칸 줄 사이
const CHIP_MAX_COLS = 5;

// 레지스터 자리
const SEAT_TOP = 108;
const SEAT_H = 58;
const SEAT_GAP = 24;
const TOKEN_W = 48;
const TOKEN_H = 30;

// 앞서 앉았던 값
const PAST_LABEL_Y = 186;
const PAST_TOP = 194;
const TAG_W_MAX = 36;
const TAG_H = 20;
const TAG_GAP = 6;

// 캡션
const CAPTION_Y = 238;
const CAPTION_LEAD = 18;
/** 본문 글꼴의 글자 폭 어림 (글자 크기에 곱한다) */
const BODY_CHAR = 0.52;

// 산 값 띠
const LIVE_LABEL_Y = 292;
const BASE_Y = 364;
const UNIT_MAX = 18;
const BAR_W_MAX = 24;
const TICK_Y = 380;

// 운동
const LEAVE_MS = 300;
const SIT_MS = 400;

type Point = { x: number; y: number };

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function node<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  parent.appendChild(e);
  return e;
}

function label(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number>): SVGTextElement {
  const e = node(parent, 'text', { x, y, ...attrs });
  e.textContent = s;
  return e;
}

/**
 * 캡션이 폭을 넘으면 가운데에 가장 가까운 빈칸에서 두 줄로 가른다.
 * 폭은 어림이다 — 글자 수 × 글자 크기 × BODY_CHAR.
 */
function wrap(s: string, px: number): string[] {
  if (s === '') return [];
  const room = W - 2 * PAD;
  if (s.length * px * BODY_CHAR <= room) return [s];
  const mid = s.length / 2;
  // 문장 틈(— , . 뒤)을 먼저, 없으면 목록 가운데(·)가 아닌 빈칸
  const nearest = (ok: (i: number) => boolean): number => {
    let best = -1;
    for (let i = 1; i < s.length - 1; i += 1) {
      if (s[i] !== ' ' || !ok(i)) continue;
      if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
    }
    return best;
  };
  let cut = nearest((i) => /[—,.。،]/.test(s[i - 1] ?? ''));
  if (cut < 0) cut = nearest((i) => s[i - 1] !== '·' && s[i + 1] !== '·');
  if (cut < 0) return [s];
  return [s.slice(0, cut), s.slice(cut + 1)];
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 자리 셈 — 전부 캔버스 폭과 장면의 크기에서 나온다 */
function geometry(scene: RegistersAreFewScene) {
  const n = scene.program.length;
  const cols = Math.min(CHIP_MAX_COLS, n);
  const chipW = (W - 2 * PAD - (cols - 1) * CHIP_GAP) / cols;
  const chip = (line: number): { x: number; y: number; w: number } => {
    const i = line - 1;
    return { x: PAD + (i % cols) * (chipW + CHIP_GAP), y: CHIP_TOP + Math.floor(i / cols) * CHIP_ROW, w: chipW };
  };
  const k = scene.regs.length;
  const seatW = (W - 2 * PAD - (k - 1) * SEAT_GAP) / k;
  const seatX = (i: number): number => PAD + i * (seatW + SEAT_GAP);
  const seatCenter = (i: number): Point => ({ x: seatX(i) + seatW / 2, y: SEAT_TOP + SEAT_H / 2 + 2 });
  const colW = (W - 2 * PAD) / n;
  const unit = Math.min(UNIT_MAX, (BASE_Y - LIVE_LABEL_Y - 22) / k);
  return { cols, chipW, chip, seatW, seatX, seatCenter, colW, unit };
}

function tagWidth(seatW: number, count: number): number {
  if (count === 0) return TAG_W_MAX;
  return Math.min(TAG_W_MAX, (seatW - 16 - (count - 1) * TAG_GAP) / count);
}

export const registersAreFewStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const monoXs = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /** 장면 전체를 세운다. 움직일 수 있는 값 조각의 손잡이와 끝 자리를 돌려준다. */
    function drawStatic(scene: RegistersAreFewScene) {
      svg.textContent = '';
      const g = geometry(scene);
      const step = scene.step;
      const current = step.kind === 'line' ? step.line : 0;
      const doneByLine = new Map(scene.done.map((d) => [d.line, d]));
      const pieces = new Map<string, { el: SVGGElement; at: Point; scale: number }>();

      // ── 명령 열 ──
      scene.program.forEach((ins, idx) => {
        const line = idx + 1;
        const box = g.chip(line);
        const done = doneByLine.get(line);
        const isNow = line === current;
        label(svg, box.x + 2, box.y - 4, `L${line}`, {
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: isNow ? c.text : c.textMuted,
          'font-weight': isNow ? 600 : 400,
        });
        node(svg, 'rect', {
          x: box.x,
          y: box.y,
          width: box.w,
          height: CHIP_H,
          rx: 4,
          fill: isNow ? c.accent : done ? c.bgSubtle : c.bg,
          stroke: isNow ? c.accent : c.border,
          'stroke-dasharray': done ? 'none' : '3 3',
        });
        const text = done
          ? formatInstr(ins, (v) => {
              const r = done.names[v];
              if (r === undefined) throw new Error(`L${line}: ${v} 의 레지스터가 없다`);
              return r;
            })
          : formatInstr(ins, (v) => v);
        label(svg, box.x + box.w / 2, box.y + CHIP_H / 2 + monoXs * 0.36, text, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          fill: isNow ? c.stateInk : done ? c.text : c.textMuted,
        });
      });

      // ── 레지스터 자리 ──
      scene.regs.forEach((reg, i) => {
        const x = g.seatX(i);
        node(svg, 'rect', { x, y: SEAT_TOP, width: g.seatW, height: SEAT_H, rx: 8, fill: c.bgSubtle, stroke: c.border });
        label(svg, x + 10, SEAT_TOP + 16, reg, {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: c.text,
        });
        const at = g.seatCenter(i);
        const who = scene.seats[i];
        if (who === undefined) throw new Error(`${reg} 의 자리가 장면에 없다`);
        if (who === null) {
          node(svg, 'rect', {
            x: at.x - TOKEN_W / 2,
            y: at.y - TOKEN_H / 2,
            width: TOKEN_W,
            height: TOKEN_H,
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '4 3',
          });
          label(svg, at.x, SEAT_TOP + SEAT_H - 6, t('label.empty', 'empty'), {
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            fill: c.textMuted,
          });
        } else {
          const fresh = step.kind === 'line' && step.got !== null && step.got.v === who;
          const el = node(svg, 'g', { transform: `translate(${r2(at.x)},${r2(at.y)})` });
          node(el, 'rect', {
            x: -TOKEN_W / 2,
            y: -TOKEN_H / 2,
            width: TOKEN_W,
            height: TOKEN_H,
            rx: 6,
            fill: fresh ? c.accent : c.primary,
          });
          label(el, 0, parseFloat(fontSizes.md) * 0.36, who, {
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 600,
            'text-anchor': 'middle',
            fill: fresh ? c.stateInk : c.textInverse,
          });
          pieces.set(who, { el, at, scale: 1 });
        }
      });

      // ── 앞서 앉았던 값 ──
      label(svg, PAD, PAST_LABEL_Y, t('label.tenants', 'Sat here before'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      const leftNow = new Set(step.kind === 'line' ? step.freed.map((m) => m.v) : []);
      scene.regs.forEach((_reg, i) => {
        const row = scene.past[i];
        if (row === undefined) throw new Error(`${scene.regs[i]} 의 자취가 장면에 없다`);
        const w = tagWidth(g.seatW, row.length);
        row.forEach((v, j) => {
          const at = { x: g.seatX(i) + 8 + j * (w + TAG_GAP) + w / 2, y: PAST_TOP + TAG_H / 2 };
          const just = leftNow.has(v);
          const el = node(svg, 'g', { transform: `translate(${r2(at.x)},${r2(at.y)})` });
          node(el, 'rect', {
            x: -w / 2,
            y: -TAG_H / 2,
            width: w,
            height: TAG_H,
            rx: 4,
            fill: c.bg,
            stroke: just ? c.itemActive : c.border,
            'stroke-width': just ? 1.5 : 1,
          });
          label(el, 0, monoXs * 0.36, v, {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            fill: just ? c.text : c.textMuted,
          });
          pieces.set(v, { el, at, scale: w / TOKEN_W });
        });
      });

      // ── 캡션 ──
      const k = scene.regs.length;
      const capAttrs = {
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'text-anchor': 'middle',
        fill: c.text,
      };
      let caption = '';
      if (step.kind === 'start') {
        if (scene.values !== null) caption = t('caption.start', 'Values: {values} · Registers: {k}', { values: scene.values, k });
      } else {
        const freed = step.freed.map((m) => m.v).join(' · ');
        const regs = step.freed.map((m) => m.r).join(' · ');
        if (step.got !== null && step.freed.length === 0) {
          caption = t('caption.take', 'L{line}: new value {v} sits in {reg}, the lowest-numbered free register.', {
            line: step.line,
            v: step.got.v,
            reg: step.got.r,
          });
        } else if (step.got !== null) {
          caption = t('caption.freeTake', 'L{line}: last read of {freed} empties {regs} — new value {v} sits in {reg}.', {
            line: step.line,
            freed,
            regs,
            v: step.got.v,
            reg: step.got.r,
          });
        } else if (step.freed.length > 0) {
          caption = t('caption.free', 'L{line}: last read of {freed} empties {regs}. Live values: {n}', {
            line: step.line,
            freed,
            regs,
            n: step.live,
          });
        } else {
          throw new Error(`L${step.line}: 풀린 값도 새 값도 없는 걸음`);
        }
      }
      let y = CAPTION_Y;
      for (const row of wrap(caption, parseFloat(fontSizes.md))) {
        label(svg, W / 2, y, row, capAttrs);
        y += CAPTION_LEAD;
      }
      if (step.kind === 'line' && step.line === scene.program.length) {
        const summary = t('caption.summary', 'Most live at once: {peak} · Registers: {k} · Instructions: {before} → {after}', {
          peak: step.peak,
          k,
          before: scene.program.length,
          after: step.emitted,
        });
        for (const row of wrap(summary, parseFloat(fontSizes.sm))) {
          label(svg, W / 2, y + 2, row, { ...capAttrs, 'font-size': fontSizes.sm, 'font-weight': 600 });
          y += CAPTION_LEAD - 2;
        }
      }

      // ── 산 값 띠 ──
      label(svg, PAD, LIVE_LABEL_Y, t('label.live', 'Live values after each line'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      const ceilY = BASE_Y - k * g.unit;
      node(svg, 'line', {
        x1: PAD,
        x2: W - PAD,
        y1: ceilY,
        y2: ceilY,
        stroke: c.textMuted,
        'stroke-dasharray': '5 4',
      });
      label(svg, W - PAD, ceilY - 5, t('label.ceiling', 'Registers: {k}', { k }), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'text-anchor': 'end',
        fill: c.textMuted,
      });
      node(svg, 'line', { x1: PAD, x2: W - PAD, y1: BASE_Y, y2: BASE_Y, stroke: c.border });
      const barW = Math.min(BAR_W_MAX, g.colW * 0.5);
      for (let line = 1; line <= scene.program.length; line += 1) {
        const cx = PAD + (line - 0.5) * g.colW;
        const isNow = line === current;
        label(svg, cx, TICK_Y, `L${line}`, {
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          fill: isNow ? c.text : c.textMuted,
          'font-weight': isNow ? 600 : 400,
        });
        const d = doneByLine.get(line);
        if (d === undefined) continue; // 아직 오지 않은 줄 — 셀 것이 없다
        const h = d.live * g.unit;
        if (h > 0) {
          node(svg, 'rect', {
            x: cx - barW / 2,
            y: BASE_Y - h,
            width: barW,
            height: h,
            fill: isNow ? c.accent : c.textMuted,
          });
        }
        label(svg, cx, BASE_Y - h - 4, String(d.live), {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          fill: c.text,
        });
      }

      return { g, pieces };
    }

    function place(el: SVGGElement, to: Point, from: Point, s0: number, s1: number, p: number): void {
      const x = to.x + (from.x - to.x) * (1 - p);
      const y = to.y + (from.y - to.y) * (1 - p);
      const s = s1 + (s0 - s1) * (1 - p);
      el.setAttribute('transform', `translate(${r2(x)},${r2(y)}) scale(${r2(s)})`);
    }

    function tween(mine: number, ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        let id = 0;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          frames.delete(id);
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let t0: number | null = null;
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) return finish();
          if (t0 === null) t0 = now;
          const p = Math.min(1, (now - t0) / ms);
          draw(p);
          if (p >= 1) return finish();
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    async function render(
      next: RegistersAreFewScene,
      prev: RegistersAreFewScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const { g, pieces } = drawStatic(next);
      const step = next.step;
      // prev 는 흘릴지 고르는 데만 — 바로 앞 걸음에서 온 것일 때만 운동한다
      const follows = prev !== null && prev.done.length + 1 === next.done.length;
      if (!opts.animate || step.kind !== 'line' || !follows) return;

      // 떠나는 값: 자리 가운데 → 앞서 앉았던 값 줄
      const leaving = step.freed.map((m) => {
        const i = next.regs.indexOf(m.r);
        const piece = pieces.get(m.v);
        if (i < 0 || piece === undefined) throw new Error(`L${step.line}: 떠난 ${m.v} 의 자리를 찾지 못했다`);
        return { piece, from: g.seatCenter(i) };
      });
      // 들어앉는 값: 명령 칸 → 빈 자리
      let sitting: { piece: { el: SVGGElement; at: Point; scale: number }; from: Point } | null = null;
      if (step.got !== null) {
        const piece = pieces.get(step.got.v);
        if (piece === undefined) throw new Error(`L${step.line}: ${step.got.v} 의 조각이 없다`);
        const box = g.chip(step.line);
        sitting = { piece, from: { x: box.x + box.w / 2, y: box.y + CHIP_H / 2 } };
      }

      // 아직 못 온 만큼으로 먼저 세운다 — 첫 프레임에 끝 자리가 번쩍이지 않게
      for (const l of leaving) place(l.piece.el, l.piece.at, l.from, 1, l.piece.scale, 0);
      if (sitting !== null) place(sitting.piece.el, sitting.piece.at, sitting.from, 0.7, 1, 0);

      const leaveMs = leaving.length > 0 ? LEAVE_MS : 0;
      const sitMs = sitting !== null ? SIT_MS : 0;
      const total = leaveMs + sitMs;
      await tween(mine, total, (p) => {
        const ms = p * total;
        const pl = leaveMs > 0 ? Math.min(1, ms / leaveMs) : 1;
        const ps = sitMs > 0 ? Math.max(0, Math.min(1, (ms - leaveMs) / sitMs)) : 1;
        for (const l of leaving) place(l.piece.el, l.piece.at, l.from, 1, l.piece.scale, ease(pl));
        if (sitting !== null) place(sitting.piece.el, sitting.piece.at, sitting.from, 0.7, 1, ease(ps));
      });
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
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
