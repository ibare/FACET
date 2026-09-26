import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { ruleText, terminalOf, type Rule } from './algorithm.js';
import type { ShiftOrReduceScene, StackCell } from './scene.js';

const H = 360;
const MOVE_MS = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 좌표 끝자리와 -0 을 정리한다 — 흘림과 곧바로의 글자가 갈리지 않게. */
function r(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

type Box = { x: number; y: number; w: number; h: number };

/** 자리 셈 — 캔버스 폭에서 역산한다. */
function layout(stackLen: number, inputLen: number) {
  const W = PIECE_CANVAS_W;
  const margin = 20;
  const stackX = 40;
  const stackW = Math.min(170, Math.round(W * 0.26));
  const rightX = stackX + stackW + 60;
  const rightW = W - margin - rightX;
  const floorY = 294;
  const maxPitch = 40;
  const pitch = Math.min(maxPitch, (floorY - 24) / Math.max(1, stackLen));
  const cellH = pitch - 4;
  const slot = (i: number): Box => ({ x: stackX, y: floorY - (i + 1) * pitch + 2, w: stackW, h: cellH });
  const chipPitch = Math.min(64, rightW / Math.max(1, inputLen));
  const chipY = 196;
  const chip = (i: number): Box => ({ x: rightX + i * chipPitch, y: chipY, w: chipPitch - 8, h: 40 });
  return { W, margin, stackX, stackW, rightX, rightW, floorY, pitch, slot, chip, chipPitch, chipY };
}

export const shiftOrReduceStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.md,
        fill: opts.fill ?? c.text,
        'text-anchor': opts.anchor ?? 'start',
      }, parent);
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = content;
      return node;
    }

    function drawCell(parent: Element, box: Box, cell: StackCell, mode: 'plain' | 'fresh' | 'accepted', terminal: boolean): SVGGElement {
      const g = el('g', {}, parent);
      el('rect', {
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rx: 4,
        fill: mode === 'accepted' ? c.accent : terminal ? c.bg : c.bgSubtle,
        stroke: mode === 'fresh' ? c.primary : c.border,
        'stroke-width': mode === 'fresh' ? 2 : 1,
      }, g);
      const ink = mode === 'accepted' ? c.stateInk : c.text;
      const midY = box.y + box.h / 2 + smPx * 0.4;
      label(g, box.x + box.w / 2, midY, cell.sym, { mono: true, fill: ink, anchor: 'middle', weight: terminal ? '400' : '600' });
      if (cell.text !== null) {
        label(g, box.x + box.w - 10, midY, cell.text, { mono: true, size: fontSizes.sm, fill: c.textMuted, anchor: 'end' });
      }
      return g;
    }

    function drawRules(parent: Element, rules: Rule[], rightX: number, W: number, margin: number, lit: string | null, dashed: string[]): void {
      rules.forEach((rule, i) => {
        const y = 40 + i * 26;
        if (rule.id === lit) {
          el('rect', { x: rightX - 8, y: y - 17, width: W - margin - rightX + 8, height: 24, rx: 4, fill: c.accent }, parent);
        } else if (dashed.includes(rule.id)) {
          el('rect', {
            x: rightX - 8, y: y - 17, width: W - margin - rightX + 8, height: 24, rx: 4,
            fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '4 3',
          }, parent);
        }
        const ink = rule.id === lit ? c.stateInk : c.text;
        label(parent, rightX, y, rule.id, { mono: true, size: fontSizes.sm, fill: rule.id === lit ? c.stateInk : c.textMuted });
        label(parent, rightX + 34, y, ruleText(rule), { mono: true, fill: ink });
      });
    }

    function drawBracket(parent: Element, lo: Box, hi: Box, side: 'left' | 'right', id: string): void {
      const top = hi.y + 2;
      const bot = lo.y + lo.h - 2;
      const x = side === 'left' ? lo.x - 12 : lo.x + lo.w + 12;
      const hook = side === 'left' ? 6 : -6;
      el('path', {
        d: `M ${r(x + hook)} ${r(top)} H ${r(x)} V ${r(bot)} H ${r(x + hook)}`,
        fill: 'none',
        stroke: c.textMuted,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 3',
      }, parent);
      label(parent, side === 'left' ? x - 4 : x + 4, (top + bot) / 2 + smPx * 0.35, id, {
        mono: true,
        size: fontSizes.sm,
        fill: c.textMuted,
        anchor: side === 'left' ? 'end' : 'start',
      });
    }

    /** 비단말 = 규칙 왼쪽에 나오는 이름. */
    function isNonterm(scene: ShiftOrReduceScene, sym: string): boolean {
      return scene.rules.some((x) => x.lhs === sym);
    }

    type Handles = { top: SVGGElement | null; chips: SVGGElement[] };

    function drawStatic(scene: ShiftOrReduceScene): Handles {
      svg.textContent = '';
      const L = layout(scene.stack.length, scene.input.length);
      const root = el('g', {}, svg);
      const step = scene.step;

      // 문법
      const lit = step.kind === 'reduce' ? step.rule : null;
      const dashed = step.kind === 'shift' ? step.matches : [];
      drawRules(root, scene.rules, L.rightX, L.W, L.margin, lit, dashed);

      // 남은 입력
      label(root, L.rightX - 8, L.chipY - 12, t('label.input', 'Remaining input: {n}', { n: scene.input.length }), {
        size: fontSizes.sm,
        fill: c.textMuted,
      });
      const chips: SVGGElement[] = [];
      scene.input.forEach((tok, i) => {
        const b = L.chip(i);
        const g = el('g', {}, root);
        const next = i === 0;
        el('rect', {
          x: b.x, y: b.y, width: b.w, height: b.h, rx: 4,
          fill: c.bg,
          stroke: next ? c.itemComparing : c.border,
          'stroke-width': next ? 2 : 1,
        }, g);
        if (terminalOf(tok) === 'EOF') {
          label(g, b.x + b.w / 2, b.y + b.h / 2 + smPx * 0.4, tok.kind, { mono: true, size: fontSizes.sm, anchor: 'middle' });
        } else {
          label(g, b.x + b.w / 2, b.y + 14, tok.kind, { mono: true, size: fontSizes.xs, fill: c.textMuted, anchor: 'middle' });
          label(g, b.x + b.w / 2, b.y + 32, tok.text, { mono: true, anchor: 'middle' });
        }
        chips.push(g);
      });
      if (scene.input.length > 0) {
        const b = L.chip(0);
        label(root, b.x + b.w / 2, b.y + b.h + 18, t('label.next', 'Next'), {
          size: fontSizes.sm,
          fill: c.itemComparing,
          anchor: 'middle',
          weight: '600',
        });
      }

      // 스택
      el('line', {
        x1: L.stackX - 6, y1: L.floorY, x2: L.stackX + L.stackW + 6, y2: L.floorY,
        stroke: c.text, 'stroke-width': 2, 'stroke-linecap': 'round',
      }, root);
      label(root, L.stackX + L.stackW / 2, L.floorY + 22, t('label.stack', 'Stack: {n}', { n: scene.stack.length }), {
        size: fontSizes.sm,
        fill: c.textMuted,
        anchor: 'middle',
      });
      let top: SVGGElement | null = null;
      scene.stack.forEach((cell, i) => {
        const isTop = i === scene.stack.length - 1;
        const mode = scene.accepted && isTop ? 'accepted' : isTop && step.kind !== 'start' ? 'fresh' : 'plain';
        const g = drawCell(root, L.slot(i), cell, mode, !isNonterm(scene, cell.sym));
        if (isTop) top = g;
      });

      // 밀기 앞 꼭대기가 몸과 맞던 자리 — 방금 올라앉은 칸 아래
      if (step.kind === 'shift' && step.matches.length > 0) {
        if (step.matches.length > 2) throw new Error('shift-or-reduce 그림: 몸 괄호를 셋 이상 그릴 자리가 없다');
        const beforeLen = scene.stack.length - 1;
        step.matches.forEach((id, k) => {
          const rule = scene.rules.find((x) => x.id === id);
          if (!rule) throw new Error(`shift-or-reduce 그림: 규칙 ${id} 가 없다`);
          const n = rule.rhs.length;
          if (n > beforeLen) throw new Error(`shift-or-reduce 그림: ${id} 의 몸이 스택보다 길다`);
          drawBracket(root, L.slot(beforeLen - n), L.slot(beforeLen - 1), k === 0 ? 'left' : 'right', id);
        });
      }

      // 캡션 — 지금 일어난 일만
      label(root, L.margin, H - 14, caption(scene), { size: fontSizes.md });
      return { top, chips };
    }

    function caption(scene: ShiftOrReduceScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        const head = scene.input[0];
        if (!head) throw new Error('shift-or-reduce 그림: 시작인데 입력이 없다');
        return t('caption.start', 'The stack is empty. Next: {la}.', { la: terminalOf(head) });
      }
      if (step.kind === 'shift') {
        if (step.matches.length > 0) {
          return t('caption.shiftOver', 'Before the shift, the top matched the body of {rules}, but next: {la}. Shift.', {
            rules: step.matches.join(', '),
            la: step.la,
          });
        }
        return t('caption.shift', 'Next: {la}. Shift it onto the stack.', { la: step.la });
      }
      if (step.kind === 'reduce') {
        return t('caption.reduce', 'Next: {la}. Reduce by {rule}: the top {body} folds into one {lhs}.', {
          la: step.la,
          rule: step.rule,
          body: step.popped.map((p) => p.sym).join(' '),
          lhs: step.lhs,
        });
      }
      return t('caption.accept', 'Next: {la}. Only {start} is left on the stack. Accept.', {
        la: step.la,
        start: step.start,
      });
    }

    /** 한 시계 — 첫 프레임은 곧바로, 끝나면 참. 세대가 바뀌거나 거두면 거짓. */
    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
      frame(0);
      return new Promise<boolean>((resolve) => {
        const began = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            waiters.delete(wake);
            resolve(false);
            return;
          }
          const p = Math.min(1, (Date.now() - began) / ms);
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
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, 16);
        timers.add(id);
      });
    }

    async function animateShift(mine: number, scene: ShiftOrReduceScene, h: Handles): Promise<boolean> {
      const L = layout(scene.stack.length, scene.input.length + 1);
      const Lnow = layout(scene.stack.length, scene.input.length);
      const from = L.chip(0);
      const to = Lnow.slot(scene.stack.length - 1);
      const cell = scene.stack[scene.stack.length - 1];
      if (!cell || !h.top) throw new Error('shift-or-reduce 그림: 밀린 칸이 없다');
      h.top.setAttribute('opacity', '0');
      const ghost = el('g', {}, svg);
      const shiftBy = L.chipPitch;
      return tween(mine, MOVE_MS, (p) => {
        ghost.textContent = '';
        const box: Box = {
          x: lerp(from.x, to.x, p),
          y: lerp(from.y, to.y, p),
          w: lerp(from.w, to.w, p),
          h: lerp(from.h, to.h, p),
        };
        drawCell(ghost, box, cell, 'fresh', !isNonterm(scene, cell.sym));
        const dx = r(shiftBy * (1 - p));
        for (const chip of h.chips) chip.setAttribute('transform', `translate(${dx} 0)`);
      });
    }

    async function animateReduce(mine: number, scene: ShiftOrReduceScene, h: Handles): Promise<boolean> {
      const step = scene.step;
      if (step.kind !== 'reduce') throw new Error('shift-or-reduce 그림: 접기 걸음이 아니다');
      const k = step.popped.length;
      if (k === 0) throw new Error(`shift-or-reduce 그림: ${step.rule} 의 몸이 비었다 — 빈 몸 접기는 그리지 않는다`);
      if (!h.top) throw new Error('shift-or-reduce 그림: 접힌 칸이 없다');
      const base = scene.stack.length - 1;
      const Lbefore = layout(base + k, scene.input.length);
      const Lnow = layout(scene.stack.length, scene.input.length);
      const target = Lnow.slot(base);
      h.top.setAttribute('opacity', '0');
      const ghost = el('g', {}, svg);
      const lhsCell: StackCell = { sym: step.lhs, text: null };
      return tween(mine, MOVE_MS, (p) => {
        ghost.textContent = '';
        // 앞 절반: 꼭대기 칸들이 한 칸 자리로 눌려 내려앉는다. 뒤 절반: 그 자리에 왼쪽 이름 하나가 선다.
        const q = Math.min(1, p / 0.7);
        const sub = target.h / k;
        step.popped.forEach((cell, j) => {
          const a = Lbefore.slot(base + j);
          const bY = target.y + target.h - (j + 1) * sub;
          const box: Box = { x: a.x, y: lerp(a.y, bY, q), w: a.w, h: lerp(a.h, sub, q) };
          const g = el('g', { opacity: r(1 - Math.max(0, (p - 0.7) / 0.3)) }, ghost);
          el('rect', {
            x: box.x, y: box.y, width: box.w, height: Math.max(1, box.h), rx: 4,
            fill: isNonterm(scene, cell.sym) ? c.bgSubtle : c.bg, stroke: c.border,
          }, g);
          if (q < 0.6) {
            label(g, box.x + box.w / 2, box.y + box.h / 2 + smPx * 0.4, cell.sym, { mono: true, anchor: 'middle' });
          }
        });
        if (p > 0.7) {
          const g = drawCell(ghost, target, lhsCell, 'fresh', false);
          g.setAttribute('opacity', String(r((p - 0.7) / 0.3)));
        }
      });
    }

    async function render(next: ShiftOrReduceScene, prev: ShiftOrReduceScene | null, opts: { animate: boolean }): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const h = drawStatic(next);
      if (!opts.animate) return;
      // prev 는 무엇을 흐르게 할지 고르는 데만 쓴다 — 바로 앞 걸음에서 왔을 때만 흘린다.
      const fromPrev = prev !== null && prev.input.length - next.input.length <= 1;
      if (!fromPrev) return;
      let ran = false;
      if (next.step.kind === 'shift' && prev !== null && prev.input.length === next.input.length + 1) {
        ran = await animateShift(mine, next, h);
      } else if (next.step.kind === 'reduce' && prev !== null && prev.stack.length === next.stack.length - 1 + next.step.popped.length) {
        ran = await animateReduce(mine, next, h);
      } else {
        return;
      }
      if (!ran || destroyed || mine !== gen) return;
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
