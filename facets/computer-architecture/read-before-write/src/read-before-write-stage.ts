/**
 * 아직 안 나온 값 — 무대.
 *
 * 위에는 다섯 단계 칸에 선 명령어 카드, 아래에는 레지스터 파일. 사이클마다 카드가
 * 한 칸씩 옮겨 가고, 붙들린 카드는 앞으로 쏠렸다가 제자리로 끌려 돌아온다. 붙들린
 * 카드와 기다리는 레지스터 사이에 끈이 걸리고, 그 끈 위에 "지금 읽었다면" 의 옛 값이
 * 떠 있다. 앞 명령어의 값이 WB 에서 레지스터로 떨어져 내려앉은 뒤에야 값이 ID 로
 * 올라가고 끈이 풀린다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Op } from './algorithm.js';
import { tokenKey, type ReadBeforeWriteScene } from './scene.js';

const H = 300;
const W = PIECE_CANVAS_W;
const M = 16;
const STAGES = 5;
const CARD_Y = 60;
const CARD_H = 58;
const REG_Y = 200;
const REG_H = 44;
const CAPTION_Y = 284;
const CHIP_W = 30;
const CHIP_H = 20;
const LURCH = 20;
const SLIDE_MS = 450;
const DROP_MS = 500;
const RISE_MS = 500;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SYM: Record<Op, string> = { add: '+', sub: '−', and: '&', or: '|', xor: '^' };

/** 소수 끝자리와 -0 을 걷어낸 좌표 */
function r2(v: number): number {
  return Math.round(v * 100) / 100 + 0;
}

/** 수 표기. 음수는 빼기 기호, 모르는 값은 줄표. */
function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v < 0 ? `−${-v}` : String(v);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

export const readBeforeWriteStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);

    const slotW = (W - 2 * M) / STAGES;
    const cardW = Math.min(slotW - 10, 124);
    const slotX = (k: number): number => M + slotW * k + slotW / 2;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 남기는 손잡이 — drawStatic 마다 새로 채운다 */
    let cards = new Map<string, SVGGElement>();
    let valueTexts = new Map<number, SVGTextElement>();
    let regTexts: SVGTextElement[] = [];
    let regRects: SVGRectElement[] = [];
    let ghost: { g: SVGGElement; label: SVGTextElement; dx: number; dy: number } | null = null;
    let anim: SVGGElement | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    const instrName = (i: number): string => t('label.instr', 'I{n}', { n: i + 1 });
    const regCount = (sc: ReadBeforeWriteScene): number => Math.max(1, sc.regNames.length);
    const regX = (sc: ReadBeforeWriteScene, k: number): number => {
      const cw = (W - 2 * M) / regCount(sc);
      return M + cw * k + cw / 2;
    };
    const regW = (sc: ReadBeforeWriteScene): number => Math.min((W - 2 * M) / regCount(sc) - 8, 80);

    function valueLine(sc: ReadBeforeWriteScene, i: number, withResult: boolean): string {
      const vals = sc.reads[i];
      if (!vals) return '';
      const sym = SYM[sc.program[i]!.op];
      const base = `${fmt(vals[0])} ${sym} ${fmt(vals[1])}`;
      const res = sc.results[i];
      return withResult && res !== null && res !== undefined ? `${base} = ${fmt(res)}` : base;
    }

    function drawCard(parent: Element, sc: ReadBeforeWriteScene, i: number, x: number, colors: readonly string[]): SVGGElement {
      const g = el('g', { transform: `translate(${r2(x)}, ${CARD_Y})` }, parent);
      el(
        'rect',
        { x: -cardW / 2, y: 0, width: cardW, height: CARD_H, rx: 6, fill: c.bg, stroke: colors[i] ?? c.border, 'stroke-width': 2 },
        g,
      );
      label(g, -cardW / 2 + 8, 14, instrName(i), { size: fontSizes.xs, fill: c.textMuted, anchor: 'start', weight: '600' });
      label(g, 0, 32, sc.program[i]!.text, { mono: true });
      valueTexts.set(i, label(g, 0, 50, valueLine(sc, i, true), { mono: true, fill: c.textMuted }));
      return g;
    }

    function drawBubble(parent: Element, x: number): SVGGElement {
      const g = el('g', { transform: `translate(${r2(x)}, ${CARD_Y})` }, parent);
      el(
        'rect',
        {
          x: -cardW / 2,
          y: 0,
          width: cardW,
          height: CARD_H,
          rx: 6,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        },
        g,
      );
      label(g, 0, CARD_H / 2 + 4, t('label.bubble', 'bubble'), { fill: c.textMuted, size: fontSizes.xs });
      return g;
    }

    function drawChip(parent: Element, value: number | null, stroke: string, dashed: boolean): SVGGElement {
      const g = el('g', {}, parent);
      const rect = el(
        'rect',
        { x: -CHIP_W / 2, y: -CHIP_H / 2, width: CHIP_W, height: CHIP_H, rx: 4, fill: c.bg, stroke, 'stroke-width': 1.5 },
        g,
      );
      if (dashed) rect.setAttribute('stroke-dasharray', '3 3');
      label(g, 0, 4, fmt(value), { mono: true, fill: stroke, weight: '600' });
      return g;
    }

    function captionOf(sc: ReadBeforeWriteScene): string | null {
      const s = sc.step;
      if (s.kind !== 'cycle') return null;
      if (s.released) {
        const k = sc.regNames.indexOf(s.released.reg);
        return t('caption.release', 'First half: {reg} ← {value}. Second half: {instr} reads it and is released.', {
          reg: s.released.reg,
          value: fmt(sc.regs[k]),
          instr: instrName(s.released.i),
        });
      }
      if (sc.stall && s.stallNew) {
        return t('caption.hold', '{instr} needs {reg}, not yet written by {writer}. Held in ID.', {
          instr: instrName(sc.stall.i),
          reg: sc.stall.reg,
          writer: instrName(sc.stall.writer),
        });
      }
      if (sc.stall) {
        return t('caption.holdAgain', '{reg} is still unwritten. {instr} stays in ID; a bubble goes into EX.', {
          reg: sc.stall.reg,
          instr: instrName(sc.stall.i),
        });
      }
      if (s.write) {
        const wrong = sc.wrongs[s.write.i];
        if (wrong !== null && wrong !== undefined) {
          return t('caption.writeHeld', '{instr} writes {reg} ← {value}, not {wrong}.', {
            instr: instrName(s.write.i),
            reg: s.write.reg,
            value: fmt(s.write.value),
            wrong: fmt(wrong),
          });
        }
        return t('caption.write', '{instr} writes {reg} ← {value}.', {
          instr: instrName(s.write.i),
          reg: s.write.reg,
          value: fmt(s.write.value),
        });
      }
      if (s.exec) {
        return t('caption.exec', '{instr} computes {dst} = {value} in EX.', {
          instr: instrName(s.exec.i),
          dst: sc.program[s.exec.i]!.dst,
          value: fmt(s.exec.value),
        });
      }
      if (s.read) {
        const ins = sc.program[s.read.i]!;
        return t('caption.read', '{instr} reads {a} = {av} and {b} = {bv} in ID.', {
          instr: instrName(s.read.i),
          a: ins.srcs[0]!,
          av: fmt(s.read.values[0]),
          b: ins.srcs[1]!,
          bv: fmt(s.read.values[1]),
        });
      }
      const entered = s.moves.find((mv) => mv.from < 0 && mv.token.kind === 'instr');
      if (entered && entered.token.kind === 'instr') {
        return t('caption.fetch', '{instr} enters IF.', { instr: instrName(entered.token.i) });
      }
      return null;
    }

    function drawStatic(sc: ReadBeforeWriteScene): void {
      svg.textContent = '';
      cards = new Map();
      valueTexts = new Map();
      regTexts = [];
      regRects = [];
      ghost = null;
      const colors = categorical(Math.max(1, sc.program.length), 'vivid');
      const base = el('g', {}, svg);

      if (sc.cycle > 0) {
        label(base, M, 22, t('label.cycle', 'Cycle {n}', { n: sc.cycle }), {
          anchor: 'start',
          size: fontSizes.md,
          weight: '600',
        });
      }

      // 단계 칸
      const stageNames = [
        t('stage.if', 'IF'),
        t('stage.id', 'ID'),
        t('stage.ex', 'EX'),
        t('stage.mem', 'MEM'),
        t('stage.wb', 'WB'),
      ];
      for (let k = 0; k < STAGES; k += 1) {
        label(base, slotX(k), CARD_Y - 10, stageNames[k]!, { fill: c.textMuted, weight: '600', size: fontSizes.xs });
        el(
          'rect',
          { x: slotX(k) - slotW / 2 + 2, y: CARD_Y - 4, width: slotW - 4, height: CARD_H + 8, rx: 8, fill: c.bgSubtle },
          base,
        );
      }

      // 레지스터 파일
      const rw = regW(sc);
      label(base, M, REG_Y - 10, t('label.regs', 'registers'), { anchor: 'start', fill: c.textMuted, size: fontSizes.xs, weight: '600' });
      const waitK = sc.stall ? sc.regNames.indexOf(sc.stall.reg) : -1;
      // 기다리는 칸의 테두리는 머무는 표식이라 여기서 그린다. 방금 쓰인 칸의 반짝임은
      // 지나가는 것이라 흘림(flow)에서만 켠다.
      sc.regNames.forEach((name, k) => {
        const x = regX(sc, k);
        const stroke = k === waitK ? c.itemComparing : c.border;
        regRects.push(
          el(
            'rect',
            { x: x - rw / 2, y: REG_Y, width: rw, height: REG_H, rx: 5, fill: c.bg, stroke, 'stroke-width': k === waitK ? 2 : 1 },
            base,
          ),
        );
        label(base, x, REG_Y + 14, name, { mono: true, size: fontSizes.xs, fill: c.textMuted });
        const v = sc.regs[k];
        regTexts.push(label(base, x, REG_Y + 35, fmt(v), { mono: true, size: fontSizes.md, fill: v === null ? c.textMuted : c.text, weight: '600' }));
        // 붙들렸던 명령어가 쓴 칸에는 일찍 읽었다면 들어갔을 값을 지운 채로 남긴다.
        const by = sc.writtenBy[k];
        const wrong = by === null || by === undefined ? null : sc.wrongs[by];
        if (wrong !== null && wrong !== undefined) {
          const wt = label(base, x, REG_Y + REG_H + 15, fmt(wrong), { mono: true, size: fontSizes.xs, fill: c.danger });
          wt.setAttribute('text-decoration', 'line-through');
        }
      });

      // 명령어 카드와 빈 칸
      const cardLayer = el('g', {}, svg);
      sc.slots.forEach((tok, k) => {
        if (!tok) return;
        const g = tok.kind === 'instr' ? drawCard(cardLayer, sc, tok.i, slotX(k), colors) : drawBubble(cardLayer, slotX(k));
        cards.set(tokenKey(tok), g);
      });

      // 붙들림 — 끈 · 옛 값 · 표
      if (sc.stall && waitK >= 0) {
        const idSlot = sc.slots.findIndex((tok) => tok?.kind === 'instr' && tok.i === sc.stall!.i);
        const ax = slotX(idSlot);
        const ay = CARD_Y + CARD_H;
        const bx = regX(sc, waitK);
        const by = REG_Y;
        el(
          'line',
          { x1: ax, y1: ay, x2: bx, y2: by, stroke: c.itemComparing, 'stroke-width': 2, 'stroke-dasharray': '6 4' },
          base,
        );
        for (let k = 0; k < 2; k += 1) {
          const tok = sc.slots[k];
          if (tok?.kind === 'instr') {
            label(cardLayer, slotX(k), CARD_Y + CARD_H + 18, t('label.held', 'held'), {
              fill: c.itemComparing,
              size: fontSizes.xs,
              weight: '600',
            });
          }
        }
        const gx = lerp(bx, ax, 0.5);
        const gy = lerp(by, ay, 0.5);
        const g = drawChip(el('g', {}, svg), sc.stall.stale, c.danger, true);
        g.setAttribute('transform', `translate(${r2(gx)}, ${r2(gy)})`);
        const gl = label(
          g,
          CHIP_W / 2 + 8,
          4,
          t('label.stale', 'read now: {dst} = {wrong}', { dst: sc.program[sc.stall.i]!.dst, wrong: fmt(sc.stall.wrong) }),
          { anchor: 'start', fill: c.danger, size: fontSizes.xs },
        );
        ghost = { g, label: gl, dx: r2(gx), dy: r2(gy) };
      }

      // 캡션
      const cap = captionOf(sc);
      if (cap) {
        const wide = [...cap].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.56), 0);
        const size = Math.max(11, Math.min(14, Math.floor((W - 2 * M) / wide)));
        const ct = label(base, W / 2, CAPTION_Y, cap, { size: `${size}px` });
        if (wide * size > W - 2 * M) {
          ct.setAttribute('textLength', String(W - 2 * M));
          ct.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
      }

      anim = el('g', {}, svg);
    }

    /** 한 시계. 세대가 바뀌거나 거두면 false 로 풀린다. */
    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            waiters.delete(wake);
            resolve(true);
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

    async function flow(sc: ReadBeforeWriteScene, mine: number): Promise<void> {
      const s = sc.step;
      if (s.kind !== 'cycle' || !anim) return;
      const layer = anim;
      const colors = categorical(Math.max(1, sc.program.length), 'vivid');

      // 아직 못 온 것 — 읽은 값 · 셈한 값 · 쓴 값은 운동이 닿기 전까지 감춘다.
      if (s.read) valueTexts.get(s.read.i)?.setAttribute('opacity', '0');
      if (s.exec) {
        const vt = valueTexts.get(s.exec.i);
        if (vt) vt.textContent = valueLine(sc, s.exec.i, false);
      }
      const wk = s.write ? sc.regNames.indexOf(s.write.reg) : -1;
      if (s.write && wk >= 0) regTexts[wk]!.textContent = fmt(s.write.was);
      if (s.stallNew && ghost) {
        ghost.label.setAttribute('opacity', '0');
      }
      const ghostFrom = s.stallNew && ghost && sc.stall ? { x: regX(sc, sc.regNames.indexOf(sc.stall.reg)), y: REG_Y + REG_H / 2 } : null;
      if (ghostFrom && ghost) ghost.g.setAttribute('transform', `translate(${r2(ghostFrom.x)}, ${r2(ghostFrom.y)})`);

      // 풀려날 끈은 값이 내려앉을 때까지 걸어 둔다.
      let tether: SVGLineElement | null = null;
      if (s.released) {
        const k = sc.regNames.indexOf(s.released.reg);
        tether = el(
          'line',
          {
            x1: slotX(1),
            y1: CARD_Y + CARD_H,
            x2: regX(sc, k),
            y2: REG_Y,
            stroke: c.itemComparing,
            'stroke-width': 2,
            'stroke-dasharray': '6 4',
          },
          layer,
        );
      }

      // 1. 옮겨 간다 — 붙들린 카드는 앞으로 쏠렸다가 끌려 돌아온다.
      const xOf = (k: number): number => (k < 0 ? slotX(0) - slotW * 0.7 : k > 4 ? slotX(4) + slotW * 0.7 : slotX(k));
      const parts: { g: SVGGElement; from: number; to: number; fade: 'in' | 'out' | null; lurch: boolean }[] = [];
      for (const mv of s.moves) {
        if (mv.to > 4) {
          if (mv.token.kind !== 'instr') {
            parts.push({ g: drawBubble(layer, xOf(mv.from)), from: xOf(mv.from), to: xOf(5), fade: 'out', lurch: false });
          } else {
            const g = drawCard(layer, sc, mv.token.i, xOf(mv.from), colors);
            parts.push({ g, from: xOf(mv.from), to: xOf(5), fade: 'out', lurch: false });
          }
          continue;
        }
        const g = cards.get(tokenKey(mv.token));
        if (!g) continue;
        // 빈 칸은 ID 와 EX 사이에서 생겨 EX 로 밀려 들어간다.
        const from = mv.from < 0 ? (mv.token.kind === 'bubble' ? slotX(1) + slotW * 0.35 : xOf(-1)) : xOf(mv.from);
        parts.push({ g, from, to: xOf(mv.to), fade: mv.from < 0 ? 'in' : null, lurch: mv.from === mv.to });
      }
      const frameA = (p: number): void => {
        for (const part of parts) {
          const off = part.lurch ? LURCH * 4 * p * (1 - p) : 0;
          part.g.setAttribute('transform', `translate(${r2(lerp(part.from, part.to, p) + off)}, ${CARD_Y})`);
          if (part.fade === 'in') part.g.setAttribute('opacity', String(r2(p)));
          if (part.fade === 'out') part.g.setAttribute('opacity', String(r2(1 - p)));
        }
      };
      frameA(0);
      if (!(await tween(mine, SLIDE_MS, frameA))) return;
      for (const part of parts) part.g.removeAttribute('opacity');
      if (s.exec) {
        const vt = valueTexts.get(s.exec.i);
        if (vt) vt.textContent = valueLine(sc, s.exec.i, true);
      }

      // 2. 앞 반 — 값이 WB 에서 레지스터로 떨어져 내려앉는다.
      if (s.write && wk >= 0) {
        const chip = drawChip(layer, s.write.value, c.accent, false);
        const x0 = slotX(4);
        const y0 = CARD_Y + CARD_H - CHIP_H / 2;
        const x1 = regX(sc, wk);
        const y1 = REG_Y + REG_H / 2 + 5;
        const frameB = (p: number): void => {
          chip.setAttribute('transform', `translate(${r2(lerp(x0, x1, p))}, ${r2(lerp(y0, y1, p))})`);
        };
        frameB(0);
        if (!(await tween(mine, DROP_MS, frameB))) return;
        chip.remove();
        regTexts[wk]!.textContent = fmt(s.write.value);
        // 내려앉은 칸이 반짝인다 — 흘림이 끝나 정적 그리기가 다시 서면 걷힌다.
        regRects[wk]!.setAttribute('stroke', c.accent);
        regRects[wk]!.setAttribute('stroke-width', '2');
      }

      // 3. 뒤 반 — 값이 레지스터에서 ID 로 올라간다. 붙들린 것은 끈이 풀린다.
      const rising: { g: SVGGElement; x0: number; y0: number; x1: number; y1: number }[] = [];
      if (s.read) {
        tether?.remove();
        const ins = sc.program[s.read.i]!;
        const n = ins.srcs.length;
        ins.srcs.forEach((reg, j) => {
          const k = sc.regNames.indexOf(reg);
          const g = drawChip(layer, s.read!.values[j] ?? null, c.primary, false);
          rising.push({
            g,
            x0: regX(sc, k),
            y0: REG_Y + REG_H / 2,
            x1: slotX(1) + (j - (n - 1) / 2) * (CHIP_W + 6),
            y1: CARD_Y + CARD_H - CHIP_H / 2,
          });
        });
      }
      if (rising.length > 0 || ghostFrom) {
        const frameC = (p: number): void => {
          for (const r of rising) r.g.setAttribute('transform', `translate(${r2(lerp(r.x0, r.x1, p))}, ${r2(lerp(r.y0, r.y1, p))})`);
          if (ghostFrom && ghost) {
            ghost.g.setAttribute('transform', `translate(${r2(lerp(ghostFrom.x, ghost.dx, p))}, ${r2(lerp(ghostFrom.y, ghost.dy, p))})`);
          }
        };
        frameC(0);
        if (!(await tween(mine, RISE_MS, frameC))) return;
      }
    }

    const view: ViewInstance & SceneRenderer<ReadBeforeWriteScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || !prev || next.step.kind !== 'cycle') return;
        await flow(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return view;
  },
};
