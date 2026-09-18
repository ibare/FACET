/**
 * branch-flush stage — 짐작으로 채운 칸이 비워지고, 옳은 갈래가 그 자리로 들어온다.
 *
 * 위에는 명령어 목록(가져올 자리 표시)과 레지스터, 아래에는 다섯 칸짜리 파이프.
 * 움직이는 것은 명령어다 — 사이클마다 한 칸씩 오른쪽으로 밀리고, 가져올 때는 목록에서
 * 내려와 첫 칸으로 들어간다. 짐작이 틀리면 EX 앞 두 칸의 명령어가 파이프 밖 아래로
 * 떨어지고 칸은 빈 채로 남아 파이프를 따라 흘러간다.
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
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { BranchFlushScene, Instr, Slot } from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const PAD = 16;

/** 명령어 목록 */
const LIST_HEAD_Y = 20;
const LIST_TOP = 42;
const ROW_H = 21;
const COL_LABEL = PAD + 12;
const COL_ID = PAD + 32;
const COL_TEXT = PAD + 60;
/** 12px 고정폭 글자 하나의 대략 폭 */
const MONO_SM = 7.2;

/** 레지스터 — 캔버스 오른쪽 절반 조금 안쪽부터 */
const REG_X = Math.round(W * 0.53);
const REG_HEAD_Y = 20;
const REG_Y = 30;
const REG_H = 40;
const REG_GAP = 6;

/** 파이프 */
const CYCLE_Y = 144;
const STAGE_LABEL_Y = 160;
const SLOT_Y = 168;
const SLOT_H = 46;
const SLOT_GAP = 10;
const TOKEN_INSET = 4;

/** 버린 것 */
const TRAY_LABEL_Y = 246;
const TRAY_Y = 254;

const CAPTION_Y = 314;
const CAPTION_LH = 18;
/** 14px 본문 글자 하나의 대략 폭 — 캡션을 줄로 나눌 때만 쓴다 */
const BODY_MD = 7.4;

const MOVE_MS = 600;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
  parent.appendChild(node);
  return node;
}

function text(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number>): SVGElement {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = s;
  return node;
}

function place(g: Element, x: number, y: number): void {
  g.setAttribute('transform', `translate(${num(x)} ${num(y)})`);
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 낱말 경계에서 줄을 나눈다. 띄어 쓰지 않는 글은 한 줄로 둔다 */
function wrap(s: string, max: number): string[] {
  if (s.length <= max) return [s];
  const lines: string[][] = [[]];
  let width = 0;
  for (const word of s.split(' ')) {
    const line = lines[lines.length - 1] ?? [];
    if (line.length > 0 && width + 1 + word.length > max) {
      lines.push([word]);
      width = word.length;
    } else {
      line.push(word);
      width += (line.length > 1 ? 1 : 0) + word.length;
    }
  }
  return lines.map((l) => l.join(' '));
}

function keyOf(s: Slot): string | null {
  if (s === null) return null;
  return 'i' in s ? `i${s.i}` : `b${s.b}`;
}

/** 파이프 칸 폭 — 캔버스 폭에서 역산한다 */
function slotW(depth: number): number {
  return (W - 2 * PAD - (depth - 1) * SLOT_GAP) / depth;
}

function slotX(k: number, depth: number): number {
  return PAD + k * (slotW(depth) + SLOT_GAP);
}

function rowY(k: number): number {
  return LIST_TOP + k * ROW_H;
}

type TokenHandle = { g: SVGElement; x: number; y: number };

type Handles = {
  tokens: Map<string, TokenHandle>;
  bubbles: SVGElement[];
  pc: TokenHandle | null;
  arrow: { path: SVGElement; head: SVGElement; label: SVGElement; len: number } | null;
  badge: SVGElement | null;
  regMarks: Map<string, { mark: SVGElement; cx: number; cy: number }>;
  overlay: SVGElement | null;
};

export const branchFlushStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & {
    render(next: BranchFlushScene, prev: BranchFlushScene | null, opts: { animate: boolean }): Promise<void>;
  } {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 단계 이름 — en 원본은 호출부 리터럴이어야 하므로 갈래로 푼다 */
    function stageName(k: number): string {
      switch (k) {
        case 0:
          return t('stage.if', 'IF');
        case 1:
          return t('stage.id', 'ID');
        case 2:
          return t('stage.ex', 'EX');
        case 3:
          return t('stage.mem', 'MEM');
        default:
          return t('stage.wb', 'WB');
      }
    }

    /** 목록 오른쪽 끝 — 가장 긴 명령어 글자 뒤 */
    function listRight(program: Instr[]): number {
      const longest = program.reduce((m, p) => Math.max(m, p.text.length), 0);
      return COL_TEXT + longest * MONO_SM + 12;
    }

    function tokenBox(depth: number): { w: number; h: number } {
      return { w: slotW(depth) - 2 * TOKEN_INSET, h: SLOT_H - 2 * TOKEN_INSET };
    }

    type TokenLook = 'normal' | 'branch' | 'right' | 'doomed' | 'dropped';

    function drawInstrToken(parent: Element, ins: Instr, x: number, y: number, depth: number, look: TokenLook): SVGElement {
      const { w, h } = tokenBox(depth);
      const g = el('g', {}, parent);
      place(g, x, y);
      const fill = look === 'right' ? c.accent : look === 'dropped' ? c.bgSubtle : c.itemDefault;
      const stroke = look === 'doomed' || look === 'dropped' ? c.danger : look === 'branch' ? c.primary : c.text;
      const rect: Record<string, string | number> = {
        x: 0,
        y: 0,
        width: w,
        height: h,
        rx: 6,
        fill,
        stroke,
        'stroke-width': look === 'normal' || look === 'right' ? 1.2 : 2,
      };
      if (look === 'dropped') rect['stroke-dasharray'] = '4 3';
      el('rect', rect, g);
      const ink = look === 'dropped' ? c.textMuted : look === 'right' ? c.stateInk : c.text;
      text(g, 8, 15, ins.id, {
        fill: ink,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
      });
      const size = Math.min(11, Math.round(((w - 12) / (ins.text.length * 0.62)) * 10) / 10);
      text(g, 8, h - 8, ins.text, {
        fill: ink,
        'font-family': fonts.mono,
        'font-size': `${num(size)}px`,
      });
      if (look === 'dropped') {
        el('line', { x1: 4, y1: h / 2, x2: w - 4, y2: h / 2, stroke: c.danger, 'stroke-width': 1.5 }, g);
      }
      return g;
    }

    function drawBubble(parent: Element, x: number, y: number, depth: number): SVGElement {
      const { w, h } = tokenBox(depth);
      const g = el('g', {}, parent);
      place(g, x, y);
      el(
        'rect',
        { x: 0, y: 0, width: w, height: h, rx: 6, fill: 'none', stroke: c.ghostOutline, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' },
        g,
      );
      text(g, w / 2, h / 2 + 4, t('label.empty', 'empty'), {
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
      });
      return g;
    }

    function lookOf(s: BranchFlushScene, i: number, k: number): TokenLook {
      const ins = s.program[i];
      if (s.rightPath.includes(i)) return 'right';
      if (s.verdict?.taken && s.dropped.length === 0 && k < 2 && s.verdict.at !== i) return 'doomed';
      if (ins && ins.target !== null) return 'branch';
      return 'normal';
    }

    function drawSlot(parent: Element, s: BranchFlushScene, slot: Slot, k: number, h: Handles): TokenHandle | null {
      if (slot === null) return null;
      const x = slotX(k, s.depth) + TOKEN_INSET;
      const y = SLOT_Y + TOKEN_INSET;
      if ('i' in slot) {
        const ins = s.program[slot.i];
        if (!ins) return null;
        return { g: drawInstrToken(parent, ins, x, y, s.depth, lookOf(s, slot.i, k)), x, y };
      }
      const g = drawBubble(parent, x, y, s.depth);
      h.bubbles.push(g);
      return { g, x, y };
    }

    function caption(s: BranchFlushScene): string {
      const st = s.step;
      if (!st || st.kind === 'init') {
        return t('caption.init', 'The pipeline is empty. The first fetch is {id}.', { id: s.program[s.pc]?.id ?? '' });
      }
      if (st.kind === 'cycle') {
        const n = st.n;
        if (st.wrote) {
          return t('caption.write', 'Cycle {n}: {id} writes {reg}.', {
            n,
            id: s.program[st.wrote.by]?.id ?? '',
            reg: st.wrote.reg,
          });
        }
        const got = st.fetched === null ? undefined : s.program[st.fetched];
        if (got && st.redirected) {
          return t('caption.redirect', 'Cycle {n}: {id} comes in from {label}, the path actually taken.', {
            n,
            id: got.id,
            label: got.label ?? '',
          });
        }
        if (got) {
          const pending = s.slots.some(
            (sl, k) => k > 0 && sl !== null && 'i' in sl && s.program[sl.i]?.target !== null && s.verdict?.at !== sl.i,
          );
          if (pending) return t('caption.guess', 'Cycle {n}: fetch {id}, guessing the branch is not taken.', { n, id: got.id });
          return t('caption.fetch', 'Cycle {n}: fetch {id}.', { n, id: got.id });
        }
        if (s.slots.some((sl) => sl !== null && 'b' in sl)) {
          return t('caption.bubble', 'Cycle {n}: the emptied slots move on; nothing is done in them.', { n });
        }
        return t('caption.cycle', 'Cycle {n}.', { n });
      }
      if (st.kind === 'resolve') {
        const ins = s.program[st.at];
        const vars = { n: st.cycle, ra: ins?.srcs[0] ?? '', a: st.a, rb: ins?.srcs[1] ?? '', b: st.b };
        if (st.taken) {
          return t('caption.taken', 'End of cycle {n}: {ra} = {a}, {rb} = {b}. Equal, so the branch is taken. The guess was wrong.', vars);
        }
        return t('caption.notTaken', 'End of cycle {n}: {ra} = {a}, {rb} = {b}. Not equal, so not taken. The guess was right.', vars);
      }
      if (st.kind === 'flush') {
        const ids = [...st.dropped]
          .sort((a, b) => a.i - b.i)
          .map((d) => s.program[d.i]?.id ?? '')
          .join(' · ');
        const stages = [...st.bubbles]
          .sort((a, b) => a.slot - b.slot)
          .map((b) => stageName(b.slot))
          .join(' · ');
        const label = s.program[s.pc]?.label ?? s.program[s.pc]?.id ?? '';
        return t('caption.flush', '{ids} thrown out. {stages} are now empty, and the next fetch jumps to {label}.', {
          ids,
          stages,
          label,
        });
      }
      const last = s.program[st.last]?.id ?? '';
      // 버린 명령어가 쓰려던 레지스터 가운데 끝까지 아무도 쓰지 않은 것만 말한다
      const kept = [...s.dropped]
        .sort((a, b) => a.i - b.i)
        .map((d) => s.program[d.i]?.dest)
        .filter((r): r is string => typeof r === 'string' && !s.written.some((w) => w.reg === r))
        .join(' · ');
      if (kept) {
        return t('caption.done', '{id} finished in cycle {finish}. Cycles lost: {lost}. {regs} never changed.', {
          id: last,
          finish: st.finish,
          lost: st.lost,
          regs: kept,
        });
      }
      return t('caption.doneNone', '{id} finished in cycle {finish}. Cycles lost: {lost}.', {
        id: last,
        finish: st.finish,
        lost: st.lost,
      });
    }

    function drawStatic(s: BranchFlushScene): Handles {
      svg.textContent = '';
      const h: Handles = {
        tokens: new Map(),
        bubbles: [],
        pc: null,
        arrow: null,
        badge: null,
        regMarks: new Map(),
        overlay: null,
      };
      if (s.program.length === 0) return h;
      const root = el('g', {}, svg);
      const small = { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted };

      // ── 명령어 목록
      text(root, PAD, LIST_HEAD_Y, t('label.program', 'Program'), small);
      const droppedSet = new Set(s.dropped.map((d) => d.i));
      // 틀린 짐작을 걷어 낸 뒤 가져오지도 않고 건너뛴 줄
      const jumpFrom = s.dropped.length > 0 && s.verdict?.taken ? s.verdict.at : null;
      const jumpTo = jumpFrom === null ? null : (s.program[jumpFrom]?.target ?? null);
      s.program.forEach((ins, k) => {
        const y = rowY(k);
        const gone = droppedSet.has(k);
        const skipped = !gone && jumpFrom !== null && jumpTo !== null && k > jumpFrom && k < jumpTo;
        const ink = gone || skipped ? c.textMuted : c.text;
        if (ins.label) {
          text(root, COL_LABEL, y + 4, `${ins.label}:`, { fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.sm });
        }
        text(root, COL_ID, y + 4, ins.id, {
          fill: ink,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 700,
        });
        text(root, COL_TEXT, y + 4, ins.text, { fill: ink, 'font-family': fonts.mono, 'font-size': fontSizes.sm });
        if (gone) {
          el(
            'line',
            { x1: COL_ID - 2, y1: y, x2: COL_TEXT + ins.text.length * MONO_SM, y2: y, stroke: c.danger, 'stroke-width': 1.5 },
            root,
          );
        }
      });
      if (s.pc < s.program.length) {
        const g = el('g', {}, root);
        const y = rowY(s.pc);
        place(g, PAD, y);
        el('path', { d: 'M0 -5 L8 0 L0 5 Z', fill: c.text }, g);
        h.pc = { g, x: PAD, y };
      }

      // ── 판정이 가리킨 갈래
      const v = s.verdict;
      const at = v ? s.program[v.at] : undefined;
      if (v && v.taken && at && at.target !== null) {
        const x0 = listRight(s.program);
        const y0 = rowY(v.at);
        const y1 = rowY(at.target);
        const bulge = 34;
        const d = `M${num(x0)} ${num(y0)} C${num(x0 + bulge)} ${num(y0)} ${num(x0 + bulge)} ${num(y1)} ${num(x0 + 6)} ${num(y1)}`;
        let len = 0;
        let px = x0;
        let py = y0;
        for (let k = 1; k <= 24; k += 1) {
          const u = k / 24;
          const a0 = (1 - u) ** 3;
          const a1 = 3 * (1 - u) ** 2 * u;
          const a2 = 3 * (1 - u) * u * u;
          const a3 = u ** 3;
          const qx = a0 * x0 + a1 * (x0 + bulge) + a2 * (x0 + bulge) + a3 * (x0 + 6);
          const qy = a0 * y0 + a1 * y0 + a2 * y1 + a3 * y1;
          len += Math.hypot(qx - px, qy - py);
          px = qx;
          py = qy;
        }
        const path = el('path', { d, fill: 'none', stroke: c.primary, 'stroke-width': 1.6 }, root);
        const head = el('path', { d: `M${num(x0 + 6)} ${num(y1)} l7 -4 l0 8 Z`, fill: c.primary }, root);
        const label = text(root, x0 + bulge + 4, (y0 + y1) / 2 + 4, t('label.taken', 'taken'), {
          fill: c.primary,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        });
        h.arrow = { path, head, label, len };
      }

      // ── 레지스터
      text(root, REG_X, REG_HEAD_Y, t('label.registers', 'Registers'), small);
      const cells: { name: string; value: number | null }[] = s.registers.map((r) => ({ name: r.name, value: r.value }));
      for (const ins of s.program) {
        if (ins.dest && !cells.some((cell) => cell.name === ins.dest)) cells.push({ name: ins.dest, value: null });
      }
      const regW = (W - PAD - REG_X - (cells.length - 1) * REG_GAP) / Math.max(1, cells.length);
      const droppedDest = new Set(s.dropped.map((d) => s.program[d.i]?.dest).filter((r) => typeof r === 'string'));
      cells.forEach((cell, k) => {
        const x = REG_X + k * (regW + REG_GAP);
        const written = s.written.some((w) => w.reg === cell.name);
        el('rect', { x, y: REG_Y, width: regW, height: REG_H, rx: 4, fill: c.bgSubtle, stroke: c.border }, root);
        if (written) {
          const mark = el('rect', { x, y: REG_Y, width: regW, height: REG_H, rx: 4, fill: c.accent, stroke: c.text }, root);
          h.regMarks.set(cell.name, { mark, cx: x + regW / 2, cy: REG_Y + REG_H / 2 });
        }
        const ink = written ? c.stateInk : c.text;
        text(root, x + regW / 2, REG_Y + 15, cell.name, {
          fill: ink,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          'text-anchor': 'middle',
        });
        let second = '';
        if (cell.value !== null) second = String(cell.value);
        else if (written) second = t('label.written', 'written');
        else if (droppedDest.has(cell.name)) second = t('label.kept', 'unchanged');
        if (second) {
          const size = Math.min(11, Math.round(((regW - 6) / (second.length * 0.6)) * 10) / 10);
          text(root, x + regW / 2, REG_Y + 32, second, {
            fill: cell.value !== null ? c.text : ink,
            'font-family': cell.value !== null ? fonts.mono : fonts.body,
            'font-size': `${num(size)}px`,
            'text-anchor': 'middle',
          });
        }
      });

      // ── 파이프
      if (s.cycle > 0) {
        text(root, W - PAD, CYCLE_Y, t('label.cycle', 'Cycle {n}', { n: s.cycle }), {
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          'text-anchor': 'end',
        });
      }
      const sw = slotW(s.depth);
      for (let k = 0; k < s.depth; k += 1) {
        const x = slotX(k, s.depth);
        text(root, x + sw / 2, STAGE_LABEL_Y, stageName(k), {
          fill: c.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          'text-anchor': 'middle',
        });
        el('rect', { x, y: SLOT_Y, width: sw, height: SLOT_H, rx: 8, fill: c.bgSubtle, stroke: c.border }, root);
      }
      const tokenLayer = el('g', {}, root);
      s.slots.forEach((slot, k) => {
        const key = keyOf(slot);
        const hd = drawSlot(tokenLayer, s, slot, k, h);
        if (key && hd) h.tokens.set(key, hd);
      });

      // ── 판정 (분기가 EX 에 있는 동안)
      const exSlot = s.slots[2] ?? null;
      if (v && at && exSlot !== null && 'i' in exSlot && exSlot.i === v.at) {
        const cx = slotX(2, s.depth) + sw / 2;
        const g = el('g', {}, root);
        text(g, cx, TRAY_LABEL_Y, t('label.compare', '{ra} = {a} · {rb} = {b}', {
          ra: at.srcs[0] ?? '',
          a: v.a,
          rb: at.srcs[1] ?? '',
          b: v.b,
        }), { fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'text-anchor': 'middle' });
        text(g, cx, TRAY_LABEL_Y + 20, v.taken ? t('label.taken', 'taken') : t('label.notTaken', 'not taken'), {
          fill: v.taken ? c.danger : c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          'text-anchor': 'middle',
        });
        h.badge = g;
      }

      // ── 버린 것
      if (s.dropped.length > 0) {
        text(root, PAD, TRAY_LABEL_Y, t('label.discarded', 'Thrown out'), small);
        for (const d of s.dropped) {
          const ins = s.program[d.i];
          if (!ins) continue;
          const x = slotX(d.slot, s.depth) + TOKEN_INSET;
          const g = drawInstrToken(root, ins, x, TRAY_Y, s.depth, 'dropped');
          h.tokens.set(`x${d.i}`, { g, x, y: TRAY_Y });
        }
      }

      // ── 캡션
      wrap(caption(s), Math.floor((W - 2 * PAD) / BODY_MD)).forEach((line, k) => {
        text(root, PAD, CAPTION_Y + k * CAPTION_LH, line, {
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
        });
      });
      return h;
    }

    function tween(mine: number, ms: number, frame: (e: number) => void): Promise<void> {
      const total = Math.max(1, Math.ceil(ms / FRAME_MS));
      return new Promise<void>((resolve) => {
        let over = false;
        let k = 0;
        const finish = (): void => {
          if (over) return;
          over = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (over) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          frame(ease(k / total));
          if (k >= total) {
            finish();
            return;
          }
          k += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    /** 이번 걸음의 운동을 한 시계의 프레임 함수 하나로 묶는다. 흐를 것이 없으면 null */
    function plan(s: BranchFlushScene, h: Handles): ((e: number) => void) | null {
      const st = s.step;
      if (!st) return null;
      const frames: ((e: number) => void)[] = [];
      const tokenY = SLOT_Y + TOKEN_INSET;

      if (st.kind === 'cycle') {
        for (const [key, tk] of h.tokens) {
          if (key.startsWith('x')) continue;
          const k = st.before.findIndex((b) => keyOf(b) === key);
          let fx: number;
          let fy: number;
          if (k >= 0) {
            fx = slotX(k, s.depth) + TOKEN_INSET;
            fy = tokenY;
          } else if (key.startsWith('i')) {
            const i = Number(key.slice(1));
            fx = COL_ID - 4;
            fy = rowY(i) - tokenBox(s.depth).h / 2;
          } else {
            continue;
          }
          const dx = fx - tk.x;
          const dy = fy - tk.y;
          if (dx === 0 && dy === 0) continue;
          frames.push((e) => place(tk.g, tk.x + dx * (1 - e), tk.y + dy * (1 - e)));
        }
        // WB 를 지나 떠나는 것 — 정적 그림에는 없으니 잠시 겹쳐 그린다
        const overlay = el('g', {}, svg);
        h.overlay = overlay;
        const left = st.left;
        if (left !== null) {
          const x = slotX(s.depth - 1, s.depth) + TOKEN_INSET;
          let ghost: SVGElement | null = null;
          if ('i' in left) {
            const ins = s.program[left.i];
            if (ins) ghost = drawInstrToken(overlay, ins, x, tokenY, s.depth, ins.target !== null ? 'branch' : 'normal');
          } else {
            ghost = drawBubble(overlay, x, tokenY, s.depth);
          }
          if (ghost) {
            const g = ghost;
            const run = PAD + 8;
            frames.push((e) => {
              place(g, x + run * e, tokenY);
              g.setAttribute('opacity', num(1 - e));
            });
          }
        }
        if (h.pc && st.pcBefore < s.program.length && st.pcBefore !== s.pc) {
          const pc = h.pc;
          const dy = rowY(st.pcBefore) - pc.y;
          frames.push((e) => place(pc.g, pc.x, pc.y + dy * (1 - e)));
        }
        if (st.wrote) {
          const cell = h.regMarks.get(st.wrote.reg);
          const wb = h.tokens.get(`i${st.wrote.by}`);
          if (cell && wb) {
            const { w, h: th } = tokenBox(s.depth);
            const sx = wb.x + w / 2;
            const sy = wb.y + th / 2;
            const chip = el('g', {}, overlay);
            el('circle', { cx: 0, cy: 0, r: 13, fill: c.accent, stroke: c.text }, chip);
            text(chip, 0, 4, st.wrote.reg, {
              fill: c.stateInk,
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              'text-anchor': 'middle',
            });
            const mark = cell.mark;
            frames.push((e) => {
              place(chip, sx + (cell.cx - sx) * e, sy + (cell.cy - sy) * e);
              chip.setAttribute('opacity', num(e < 1 ? 1 : 0));
              mark.setAttribute('opacity', num(e));
            });
          }
        }
      } else if (st.kind === 'resolve') {
        const arrow = h.arrow;
        if (arrow) {
          const len = Math.round(arrow.len * 10) / 10;
          arrow.path.setAttribute('stroke-dasharray', `${num(len)} ${num(len)}`);
          frames.push((e) => {
            arrow.path.setAttribute('stroke-dashoffset', num(len * (1 - e)));
            arrow.head.setAttribute('opacity', num(e));
            arrow.label.setAttribute('opacity', num(e));
          });
        }
        const badge = h.badge;
        if (badge) frames.push((e) => badge.setAttribute('opacity', num(e)));
      } else if (st.kind === 'flush') {
        for (const d of st.dropped) {
          const tk = h.tokens.get(`x${d.i}`);
          if (!tk) continue;
          const dx = slotX(d.slot, s.depth) + TOKEN_INSET - tk.x;
          const dy = tokenY - tk.y;
          frames.push((e) => place(tk.g, tk.x + dx * (1 - e), tk.y + dy * (1 - e)));
        }
        for (const b of h.bubbles) frames.push((e) => b.setAttribute('opacity', num(e)));
        // 가져올 자리가 건너뛰어 목표로 튄다
        if (h.pc && st.pcBefore < s.program.length && st.pcBefore !== s.pc) {
          const pc = h.pc;
          const dy = rowY(st.pcBefore) - pc.y;
          frames.push((e) => place(pc.g, pc.x, pc.y + dy * (1 - e)));
        }
      }

      if (frames.length === 0) return null;
      return (e) => {
        for (const f of frames) f(e);
      };
    }

    async function render(next: BranchFlushScene, _prev: BranchFlushScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const s = next;
      const h = drawStatic(s);
      if (!opts.animate) return;
      const frame = plan(s, h);
      if (!frame) return;
      await tween(mine, MOVE_MS, frame);
      if (mine !== gen || destroyed) return;
      drawStatic(s);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
