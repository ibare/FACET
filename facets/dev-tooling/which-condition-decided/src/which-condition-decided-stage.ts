/**
 * which-condition-decided 의 stage.
 *
 * 동사는 "짝지어진다". 왼쪽은 돌린 시험의 조건값 줄, 오른쪽은 조건마다의 짝 자리다.
 * 짝이 찾아지면 두 시험의 줄이 **사본으로 떨어져 나와** 그 조건의 짝 자리로 날아가
 * 나란히 묶인다. 짝이 없으면 자리는 비어 있고, 표에서 그 조건 값이 모두 같은 칸을
 * 한 울타리로 두른다. 시험을 돌리는 걸음에는 조건값이 조건 머리에서 그 줄로 내려온다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import { argsText, locateCondition } from './algorithm';
import {
  confirmedCount,
  outcomesSeen,
  type WhichConditionDecidedScene,
} from './scene';

const H = 360;
const NS = 'http://www.w3.org/2000/svg';

const RUN_MS = 450;
const PAIR_MS = 650;
const FENCE_MS = 420;

/** 참 · 거짓 두 결정 결과의 가짓수 */
const OUTCOMES = 2;

type Mover = { el: SVGGElement; dx: number; dy: number };

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const whichConditionDecidedStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    const SM = parseFloat(fontSizes.sm);
    const XS = parseFloat(fontSizes.xs);
    const MD = parseFloat(fontSizes.md);
    const CHAR = SM * 0.6;

    const PAD = 16;
    // 코드
    const CODE_Y = 26;
    const CODE_LH = 18;
    // 표
    const HEAD_Y = 122;
    const ROW_Y0 = 152;
    const ROW_STEP = 38;
    const CHIP_W = 48;
    const CHIP_H = 22;
    const COL_ID = PAD;
    const COL_IN = PAD + 30;
    // 짝 자리 — 표의 오른쪽 나머지 폭을 쓴다
    const BX = Math.round(W * 0.53);
    const BW = W - PAD - BX;
    const COL_GAP = Math.min(62, (BW - 90) / 3);
    const BOX_COL0 = BX + 86;
    // 표의 첫 조건 칸은 가장 긴 입력 글자 뒤에 선다 — drawStatic 이 장면에서 정한다
    let tableCol0 = COL_IN + CHIP_W;
    const BOX_TOP0 = HEAD_Y - 22;
    const BOX_H = 98;
    const BOX_GAP = 10;
    const CAP_Y = H - 34;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      o: { size: number; fill: string; mono?: boolean; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono === true ? fonts.mono : fonts.body,
          'font-size': o.size,
          fill: o.fill,
          'text-anchor': o.anchor ?? 'start',
          'dominant-baseline': 'middle',
          ...(o.weight !== undefined ? { 'font-weight': o.weight } : {}),
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function tableColX(k: number): number {
      return tableCol0 + k * COL_GAP;
    }
    function boxColX(k: number): number {
      return BOX_COL0 + k * COL_GAP;
    }
    function rowY(i: number): number {
      return ROW_Y0 + i * ROW_STEP;
    }
    function boxTop(k: number): number {
      return BOX_TOP0 + k * (BOX_H + BOX_GAP);
    }
    function boxRowY(k: number, r: number): number {
      return boxTop(k) + 48 + r * 30;
    }

    /** 참 · 거짓 값 칩. 참은 먹색 채움, 거짓은 빈 칸 — 색 하나에 기대지 않고 채움으로 가른다. */
    function chip(parent: Element, cx: number, cy: number, value: boolean | null, ring: string | null): void {
      const x = cx - CHIP_W / 2;
      const y = cy - CHIP_H / 2;
      if (value === null) {
        el('rect', { x, y, width: CHIP_W, height: CHIP_H, rx: 4, fill: 'none', stroke: c.border, 'stroke-dasharray': '3 3' }, parent);
      } else {
        el(
          'rect',
          {
            x,
            y,
            width: CHIP_W,
            height: CHIP_H,
            rx: 4,
            fill: value ? c.primary : c.bg,
            stroke: value ? c.primary : c.textMuted,
          },
          parent,
        );
        label(parent, cx, cy + 0.5, String(value), {
          size: XS,
          fill: value ? c.textInverse : c.text,
          mono: true,
          anchor: 'middle',
        });
      }
      if (ring !== null) {
        el(
          'rect',
          { x: x - 3, y: y - 3, width: CHIP_W + 6, height: CHIP_H + 6, rx: 6, fill: 'none', stroke: ring, 'stroke-width': 2.5 },
          parent,
        );
      }
    }

    function letter(parent: Element, cx: number, cy: number, id: string, fill: string): void {
      el('rect', { x: cx - 11, y: cy - 10, width: 22, height: 20, rx: 4, fill }, parent);
      label(parent, cx, cy + 0.5, id, { size: SM, fill: c.stateInk, anchor: 'middle', weight: '700' });
    }

    /** 글자 폭 짐작 — 한글 · 한자권 글자는 온 칸, 나머지는 반 칸 남짓. */
    function textWidth(s: string, size: number): number {
      let w = 0;
      for (const ch of s) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? size : size * 0.56;
      return w;
    }

    function wrap(s: string, size: number, max: number): string[] {
      const words = s.split(' ');
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const tryLine = cur === '' ? w : `${cur} ${w}`;
        if (cur !== '' && textWidth(tryLine, size) > max) {
          lines.push(cur);
          cur = w;
        } else {
          cur = tryLine;
        }
      }
      if (cur !== '') lines.push(cur);
      return lines;
    }

    function captionText(s: WhichConditionDecidedScene): string {
      const step = s.step;
      if (step.kind === 'start') {
        return t('caption.start', 'Not run yet. Tests: {n}', { n: s.tests.length });
      }
      if (step.kind === 'run') {
        const run = s.runs[step.test];
        const test = s.tests[step.test];
        if (run === null || run === undefined || test === undefined) throw new Error('돌리지 않은 시험을 말하려 한다');
        return t('caption.run', 'Ran {id} {args}. Decision: {d}', {
          id: test.id,
          args: argsText(test.args),
          d: String(run.decision),
        });
      }
      const cond = s.conditions[step.cond];
      const pair = s.pairs[step.cond];
      if (cond === undefined || pair === null || pair === undefined) throw new Error('찾지 않은 짝을 말하려 한다');
      if (pair.state === 'found') {
        return t('caption.pair', 'Pair for {c}: {x} and {y} differ only in {c}, and the decision flips.', {
          c: cond.id,
          x: s.tests[pair.first]!.id,
          y: s.tests[pair.second]!.id,
        });
      }
      if (pair.same !== null) {
        return t('caption.noneSame', 'No pair for {c}: every test so far has {c} = {v}.', {
          c: cond.id,
          v: String(pair.same),
        });
      }
      return t('caption.none', 'No pair for {c}: no two tests differ in {c} alone with the decision flipped.', {
        c: cond.id,
      });
    }

    type Handles = { movers: Mover[]; fence: { rect: SVGRectElement; y: number; h: number } | null };

    function drawStatic(s: WhichConditionDecidedScene): Handles {
      svg.textContent = '';
      const handles: Handles = { movers: [], fence: null };
      const condColors = categorical(s.conditions.length);
      const colorOf = (k: number): string => condColors[k]!;
      const step = s.step;
      const longest = Math.max(0, ...s.tests.map((x) => argsText(x.args).length));
      tableCol0 = COL_IN + longest * CHAR + 12 + CHIP_W / 2;

      // ── 코드 · 조건 글자에 밑줄
      const code = el('g', {}, svg);
      s.code.forEach((line, i) => {
        label(code, PAD, CODE_Y + i * CODE_LH, line.replace(/ /g, ' '), { size: SM, fill: c.text, mono: true });
      });
      s.conditions.forEach((cond, k) => {
        const at = locateCondition(s.code, cond.text);
        const x0 = PAD + at.col * CHAR;
        const y = CODE_Y + at.line * CODE_LH + SM * 0.62;
        el('line', { x1: x0, y1: y, x2: x0 + cond.text.length * CHAR, y2: y, stroke: colorOf(k), 'stroke-width': 3, 'stroke-linecap': 'butt' }, code);
      });

      // ── 곁의 수
      const conf = confirmedCount(s);
      label(svg, W - PAD, CODE_Y, t('label.confirmed', 'Shown to decide: {k}/{n}', { k: conf, n: s.conditions.length }), {
        size: MD,
        fill: c.text,
        anchor: 'end',
        weight: '700',
      });
      label(svg, W - PAD, CODE_Y + 24, t('label.outcomes', 'Decision outcomes: {k}/{n}', { k: outcomesSeen(s), n: OUTCOMES }), {
        size: SM,
        fill: c.textMuted,
        anchor: 'end',
      });

      // ── 표 머리
      s.conditions.forEach((cond, k) => letter(svg, tableColX(k), HEAD_Y, cond.id, colorOf(k)));
      const dCol = s.conditions.length;
      label(svg, tableColX(dCol), HEAD_Y, t('label.decision', 'decision'), {
        size: SM,
        fill: c.textMuted,
        anchor: 'middle',
      });

      // ── 표 줄
      s.tests.forEach((test, i) => {
        const y = rowY(i);
        const run = s.runs[i] ?? null;
        const current = step.kind === 'run' && step.test === i;
        if (current) {
          el('rect', { x: PAD - 6, y: y - ROW_STEP / 2 + 2, width: tableColX(dCol) + CHIP_W / 2 + 8 - PAD, height: ROW_STEP - 4, rx: 6, fill: c.bgSubtle, stroke: c.border }, svg);
        }
        label(svg, COL_ID, y, test.id, { size: SM, fill: run === null ? c.textMuted : c.text, mono: true, weight: '700' });
        label(svg, COL_IN, y, argsText(test.args), { size: SM, fill: c.textMuted, mono: true });
        const cells: { x: number; v: boolean | null }[] = [
          ...s.conditions.map((_, k) => ({ x: tableColX(k), v: run === null ? null : run.conds[k]! })),
          { x: tableColX(dCol), v: run === null ? null : run.decision },
        ];
        for (const cell of cells) {
          if (current && cell.v !== null) {
            chip(svg, cell.x, y, null, null);
            const g = el('g', {}, svg);
            chip(g, cell.x, y, cell.v, null);
            handles.movers.push({ el: g, dx: 0, dy: HEAD_Y - y });
          } else {
            chip(svg, cell.x, y, cell.v, null);
          }
        }
      });

      // ── 짝이 없을 때 — 그 조건 값이 모두 같은 칸을 한 울타리로 두른다 (그 걸음에만)
      if (step.kind === 'pair') {
        const pair = s.pairs[step.cond];
        if (pair !== null && pair !== undefined && pair.state === 'none' && pair.same !== null) {
          const ranRows = s.runs.map((r, i) => (r === null ? -1 : i)).filter((i) => i >= 0);
          const top = rowY(ranRows[0]!) - CHIP_H / 2 - 6;
          const bottom = rowY(ranRows[ranRows.length - 1]!) + CHIP_H / 2 + 6;
          const x = tableColX(step.cond) - CHIP_W / 2 - 6;
          const rect = el(
            'rect',
            { x, y: top, width: CHIP_W + 12, height: bottom - top, rx: 8, fill: 'none', stroke: colorOf(step.cond), 'stroke-width': 2.5, 'stroke-dasharray': '6 4' },
            svg,
          );
          const eq = el('g', {}, svg);
          const ey = (rowY(ranRows[0]!) + rowY(ranRows[ranRows.length - 1]!)) / 2;
          el('circle', { cx: x + CHIP_W + 12, cy: ey, r: 9, fill: c.bg, stroke: colorOf(step.cond), 'stroke-width': 2 }, eq);
          label(eq, x + CHIP_W + 12, ey + 0.5, '=', { size: MD, fill: c.text, anchor: 'middle', weight: '700' });
          handles.fence = { rect, y: top, h: bottom - top };
        }
      }

      // ── 짝 자리
      s.conditions.forEach((cond, k) => {
        const top = boxTop(k);
        const pair = s.pairs[k] ?? null;
        const current = step.kind === 'pair' && step.cond === k;
        const found = pair !== null && pair.state === 'found';
        el(
          'rect',
          {
            x: BX,
            y: top,
            width: BW,
            height: BOX_H,
            rx: 8,
            fill: current ? c.bgSubtle : c.bg,
            stroke: found ? colorOf(k) : c.border,
            'stroke-width': found ? 2 : 1.2,
            ...(pair !== null && pair.state === 'none' ? { 'stroke-dasharray': '6 4' } : {}),
          },
          svg,
        );
        letter(svg, BX + 22, top + 20, cond.id, colorOf(k));
        label(svg, BX + 40, top + 20, cond.text, { size: SM, fill: c.text, mono: true });
        if (pair === null) return;
        if (pair.state === 'none') {
          label(svg, BX + BW - 12, top + 20, t('label.noPair', 'no pair'), { size: SM, fill: c.textMuted, anchor: 'end' });
          return;
        }
        // 가름 표지 — accent 채움에 stateInk 글자
        const badge = t('label.decides', 'decides');
        const bw = textWidth(badge, SM) + 16;
        el('rect', { x: BX + BW - 10 - bw, y: top + 10, width: bw, height: 20, rx: 10, fill: c.accent }, svg);
        label(svg, BX + BW - 10 - bw / 2, top + 20.5, badge, { size: SM, fill: c.stateInk, anchor: 'middle', weight: '700' });

        [pair.first, pair.second].forEach((ti, r) => {
          const run = s.runs[ti];
          if (run === null || run === undefined) throw new Error('돌리지 않은 시험이 짝에 들었다');
          const y = boxRowY(k, r);
          const dy = rowY(ti) - y;
          const idG = el('g', {}, svg);
          label(idG, BX + 16, y, s.tests[ti]!.id, { size: SM, fill: c.text, mono: true, weight: '700' });
          const rowG = el('g', {}, svg);
          s.conditions.forEach((_, q) => {
            const g = el('g', q === k ? {} : { opacity: 0.45 }, rowG);
            chip(g, boxColX(q), y, run.conds[q]!, q === k ? colorOf(k) : null);
          });
          chip(rowG, boxColX(dCol), y, run.decision, c.accent);
          if (current) {
            handles.movers.push({ el: idG, dx: COL_ID - (BX + 16), dy });
            handles.movers.push({ el: rowG, dx: tableColX(0) - boxColX(0), dy });
          }
        });
      });

      // ── 캡션 — 지금 일어난 일만
      const lines = wrap(captionText(s), MD, W - 2 * PAD).slice(0, 2);
      lines.forEach((line, i) => {
        label(svg, PAD, CAP_Y + i * 20, line, { size: MD, fill: c.text });
      });

      return handles;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
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
            wake();
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

    function place(m: Mover, left: number): void {
      m.el.setAttribute('transform', `translate(${round(m.dx * left)} ${round(m.dy * left)})`);
    }

    return {
      render(next: WhichConditionDecidedScene, prev: WhichConditionDecidedScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        const handles = drawStatic(next);
        if (!opts.animate || prev === null) return;
        const step = next.step;
        if (step.kind === 'start') return;

        if (handles.fence !== null) {
          const f = handles.fence;
          f.rect.setAttribute('height', '0');
          return tween(FENCE_MS, mine, (e) => {
            f.rect.setAttribute('height', String(round(f.h * e)));
          }).then(() => {
            if (mine === gen && !destroyed) drawStatic(next);
          });
        }
        if (handles.movers.length === 0) return;
        for (const m of handles.movers) place(m, 1);
        const ms = step.kind === 'run' ? RUN_MS : PAIR_MS;
        return tween(ms, mine, (e) => {
          for (const m of handles.movers) place(m, 1 - e);
        }).then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
        });
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
