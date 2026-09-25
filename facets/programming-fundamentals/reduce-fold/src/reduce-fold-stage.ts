/**
 * reduce-fold 무대 — 누적값 하나가 원소를 삼키며 자란다.
 *
 * 목록의 원소가 하나씩 떨어져 나와 누적값 막대의 끝에 붙고, 붙은 만큼 막대가 자란다. 붙은 원소는
 * 막대 안으로 녹아 사라지고 막대에는 이음 자국이 남지 않는다 — 누적값은 늘 값 하나다. 지나온
 * 누적값은 막대 아래 눈금으로만 남는다. 끝의 출력 칸에는 목록이 아니라 수 하나가 선다.
 *
 * 무대는 장면만 읽는다. 셈은 알고리즘이 끝냈고, 좌표는 여기서 캔버스 폭으로부터 셈한다.
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
} from '@ffacet/core/runtime';
import type { ReduceFoldScene, ReduceFoldValue } from './scene.js';

const H = 320;
const NS = 'http://www.w3.org/2000/svg';

/** 가로 여백과 이름 칸 폭 */
const PAD = 20;
const LABEL_W = 96;
/** 코드 칸 — 위아래 한계와 한 줄 높이의 상한 */
const CODE_TOP = 12;
const CODE_BOTTOM = 80;
const CODE_LINE_MAX = 20;
/** 목록 줄 */
const LIST_TOP = 108;
const CELL_H = 38;
const CELL_W_MAX = 64;
const CELL_GAP = 10;
/** 누적값 줄 */
const LANE_Y = 204;
const BAR_H = 32;
/** 막대 끝 값 글자가 들어설 몫 */
const VALUE_ROOM = 44;
/** 출력 줄 */
const OUT_TOP = 262;
const OUT_H = 30;
const CAPTION_Y = H - 10;

/** 운동 길이 (ms) */
const LIST_MS = 360;
const LIST_STAGGER = 60;
const ABSORB_MS = 560;
const ABSORB_SPLIT = 0.6;
const SHOW_MS = 400;
const FRAME_MS = 16;

function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function fmt(v: ReduceFoldValue): string {
  return Array.isArray(v) ? `[${v.join(', ')}]` : String(v);
}

type Handles = {
  cells: SVGGElement[];
  bar: SVGRectElement | null;
  valueLabel: SVGTextElement | null;
  outputs: SVGTextElement[];
  motion: SVGGElement;
};

export const reduceFoldStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const codePx = parseFloat(fontSizes.sm);
    const codeCharW = codePx * 0.6;
    const valuePx = parseFloat(fontSizes.lg);
    const valueCharW = valuePx * 0.6;
    const contentX = PAD + LABEL_W;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
      if (text !== undefined) e.textContent = text;
      parent.appendChild(e);
      return e;
    };

    // ── 자리 셈 ──────────────────────────────────────────
    const codeLineH = (s: ReduceFoldScene): number =>
      Math.min(CODE_LINE_MAX, (CODE_BOTTOM - CODE_TOP) / Math.max(1, s.lines.length));
    const codeBaseline = (s: ReduceFoldScene, i: number): number => CODE_TOP + (i + 0.75) * codeLineH(s);
    const codeTextX = (indent: number): number => PAD + 24 + indent * 4 * codeCharW;

    const cellW = (n: number): number =>
      Math.min(CELL_W_MAX, (W - contentX - PAD - CELL_GAP * Math.max(0, n - 1)) / Math.max(1, n));
    const cellX = (n: number, i: number): number => contentX + i * (cellW(n) + CELL_GAP);

    const unit = (s: ReduceFoldScene): number => (W - contentX - PAD - VALUE_ROOM) / s.peak;
    const barW = (s: ReduceFoldScene, v: number): number => Math.max(0, v) * unit(s);

    const outputX = (s: ReduceFoldScene, k: number): number => {
      let x = contentX;
      for (let j = 0; j < k; j += 1) x += fmt(s.outputs[j] ?? 0).length * valueCharW + 36;
      return x;
    };

    // ── 정적 그리기 (정본) ────────────────────────────────
    function drawStatic(s: ReduceFoldScene): Handles {
      svg.textContent = '';
      const root = el('g', {}, svg);
      const step = s.step;
      const motion0 = el('g', {}, root);
      // init 전(마운트 직후)에는 그릴 것이 없다
      if (s.lines.length === 0) return { cells: [], bar: null, valueLabel: null, outputs: [], motion: motion0 };

      // 코드
      const lh = codeLineH(s);
      s.lines.forEach((ln, i) => {
        const y = codeBaseline(s, i);
        const current = step !== null && step.line === i;
        if (current) {
          el('rect', { x: PAD - 6, y: y - lh * 0.75, width: 3, height: lh, fill: c.accent }, root);
        }
        el('text', { x: PAD, y, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, root, String(i + 1));
        el(
          'text',
          {
            x: codeTextX(ln.indent),
            y,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': current ? 600 : 400,
            fill: current ? c.text : c.textMuted,
          },
          root,
          ln.text,
        );
      });

      // 목록
      const cells: SVGGElement[] = [];
      const list = s.list;
      el('text', { x: PAD, y: LIST_TOP + 12, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, root, t('label.list', 'list'));
      if (list) {
        el('text', { x: PAD, y: LIST_TOP + 30, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text }, root, list.name);
        const n = list.items.length;
        const w = cellW(n);
        list.items.forEach((v, i) => {
          const x = cellX(n, i);
          const active = step !== null && step.kind === 'absorb' && step.index === i;
          const taken = i < s.taken && !active;
          el('text', { x: x + w / 2, y: LIST_TOP - 6, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, root, String(i));
          const g = el('g', {}, root);
          el(
            'rect',
            {
              x,
              y: LIST_TOP,
              width: w,
              height: CELL_H,
              rx: 4,
              fill: taken ? c.bg : c.bgSubtle,
              stroke: active ? c.itemActive : c.border,
              'stroke-width': active ? 2 : 1,
            },
            g,
          );
          el(
            'text',
            {
              x: x + w / 2,
              y: LIST_TOP + CELL_H / 2 + 5,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              fill: taken ? c.textMuted : c.text,
            },
            g,
            String(v),
          );
          cells.push(g);
        });
      }

      // 누적값
      const bound = s.boundTo !== null;
      el(
        'text',
        { x: PAD, y: LANE_Y - 4, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        root,
        bound ? t('label.result', 'result') : t('label.acc', 'accumulator'),
      );
      el(
        'text',
        { x: PAD, y: LANE_Y + 14, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: s.acc === null ? c.textMuted : c.text },
        root,
        s.boundTo ?? s.accName,
      );
      el('line', { x1: contentX, y1: LANE_Y - BAR_H / 2 - 6, x2: contentX, y2: LANE_Y + BAR_H / 2 + 6, stroke: c.border, 'stroke-width': 1 }, root);
      for (const v of s.trail) {
        const x = contentX + barW(s, v);
        el('line', { x1: x, y1: LANE_Y + BAR_H / 2 + 3, x2: x, y2: LANE_Y + BAR_H / 2 + 9, stroke: c.textMuted, 'stroke-width': 1 }, root);
        el('text', { x, y: LANE_Y + BAR_H / 2 + 21, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, root, String(v));
      }
      let bar: SVGRectElement | null = null;
      let valueLabel: SVGTextElement | null = null;
      if (s.acc !== null) {
        const w = barW(s, s.acc);
        bar = el('rect', { x: contentX, y: LANE_Y - BAR_H / 2, width: w, height: BAR_H, rx: 3, fill: c.primary }, root);
        valueLabel = el(
          'text',
          { x: contentX + w + 8, y: LANE_Y + 6, 'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700, fill: c.text },
          root,
          String(s.acc),
        );
      }

      // 출력
      el('text', { x: PAD, y: OUT_TOP + OUT_H / 2 + 4, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, root, t('label.output', 'output'));
      const outputs: SVGTextElement[] = [];
      s.outputs.forEach((v, k) => {
        const text = fmt(v);
        const x = outputX(s, k);
        el('rect', { x, y: OUT_TOP, width: text.length * valueCharW + 24, height: OUT_H, rx: 4, fill: c.bg, stroke: c.border }, root);
        outputs.push(
          el(
            'text',
            { x: x + 12, y: OUT_TOP + OUT_H / 2 + 6, 'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700, fill: c.text },
            root,
            text,
          ),
        );
      });

      // 캡션 — 지금 일어난 일만
      el('text', { x: PAD, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, root, caption(s));

      const motion = el('g', {}, root);
      return { cells, bar, valueLabel, outputs, motion };
    }

    function caption(s: ReduceFoldScene): string {
      const step = s.step;
      if (s.lines.length === 0) return '';
      if (step === null) return t('caption.start', 'Start: no line has run yet.');
      if (step.kind === 'assign') {
        return t('caption.assign', 'Line {line}: list {name} made. Items: {n}', {
          line: step.line + 1,
          name: step.name,
          n: s.list?.items.length ?? 0,
        });
      }
      if (step.kind === 'absorb') {
        const vars = { i: step.index, before: step.before, x: step.x, after: step.after };
        if (s.boundTo !== null && s.list !== null && step.index === s.list.items.length - 1) {
          return t('caption.absorbLast', 'Index {i}: accumulator {before}, element {x} → {after}, stored in {name}', {
            ...vars,
            name: s.boundTo,
          });
        }
        return t('caption.absorb', 'Index {i}: accumulator {before}, element {x} → accumulator {after}', vars);
      }
      return t('caption.show', 'Line {line}: output {value}', { line: step.line + 1, value: fmt(step.value) });
    }

    // ── 시계 ─────────────────────────────────────────────
    /** 프레임을 세어 흘린다 — 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const total = Math.max(1, Math.ceil(ms / FRAME_MS));
        let k = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          k += 1;
          frame(Math.min(1, k / total));
          if (k >= total) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    // ── 운동 ─────────────────────────────────────────────
    /** 목록이 코드 줄의 `[` 자리에서 나와 제자리로 내려앉는다. */
    function listOut(s: ReduceFoldScene, h: Handles, mine: number): Promise<void> {
      const list = s.list;
      if (!list) return Promise.resolve();
      const ln = s.lines[list.line];
      const col = Math.max(0, ln ? ln.text.indexOf('[') : 0);
      const srcX = codeTextX(ln?.indent ?? 0) + col * codeCharW;
      const srcY = codeBaseline(s, list.line) - codePx * 0.8;
      const n = list.items.length;
      const s0 = codePx / CELL_H;
      const place = (i: number, p: number): void => {
        const g = h.cells[i];
        if (!g) return;
        const e = ease(p);
        const dx = cellX(n, i);
        const sx = srcX + i * codeCharW * 3;
        const px = lerp(sx, dx, e);
        const py = lerp(srcY, LIST_TOP, e);
        const sc = lerp(s0, 1, e);
        g.setAttribute('transform', `translate(${r(px - dx * sc)},${r(py - LIST_TOP * sc)}) scale(${Math.round(sc * 1000) / 1000})`);
      };
      for (let i = 0; i < n; i += 1) place(i, 0);
      const span = LIST_MS + LIST_STAGGER * Math.max(0, n - 1);
      return tween(span, mine, (p) => {
        const now = p * span;
        for (let i = 0; i < n; i += 1) place(i, Math.min(1, Math.max(0, (now - i * LIST_STAGGER) / LIST_MS)));
      });
    }

    /** 원소가 칸을 떠나 막대 끝에 붙고, 막대가 그만큼 자라며 원소를 삼킨다. */
    function absorb(s: ReduceFoldScene, h: Handles, mine: number, index: number, x: number, before: number, after: number): Promise<void> {
      const list = s.list;
      const bar = h.bar;
      const label = h.valueLabel;
      if (!list || !bar || !label) return Promise.resolve();
      const n = list.items.length;
      const from = { x: cellX(n, index), y: LIST_TOP, w: cellW(n), h: CELL_H };
      const to = { x: contentX + barW(s, before), y: LANE_Y - BAR_H / 2, w: Math.max(2, barW(s, x)), h: BAR_H };
      const chip = el('g', {}, h.motion);
      const box = el('rect', { x: from.x, y: from.y, width: from.w, height: from.h, rx: 4, fill: c.itemActive }, chip);
      const txt = el(
        'text',
        { x: from.x + from.w / 2, y: from.y + from.h / 2 + 5, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.stateInk },
        chip,
        String(x),
      );
      const setBar = (v: number): void => {
        const w = barW(s, v);
        bar.setAttribute('width', String(r(w)));
        label.setAttribute('x', String(r(contentX + w + 8)));
      };
      setBar(before);
      label.textContent = String(before);
      return tween(ABSORB_MS, mine, (p) => {
        if (p < ABSORB_SPLIT) {
          const e = ease(p / ABSORB_SPLIT);
          const bx = lerp(from.x, to.x, e);
          const by = lerp(from.y, to.y, e);
          const bw = lerp(from.w, to.w, e);
          const bh = lerp(from.h, to.h, e);
          box.setAttribute('x', String(r(bx)));
          box.setAttribute('y', String(r(by)));
          box.setAttribute('width', String(r(bw)));
          box.setAttribute('height', String(r(bh)));
          txt.setAttribute('x', String(r(bx + bw / 2)));
          txt.setAttribute('y', String(r(by + bh / 2 + 5)));
          return;
        }
        const q = ease((p - ABSORB_SPLIT) / (1 - ABSORB_SPLIT));
        box.setAttribute('x', String(r(to.x)));
        box.setAttribute('y', String(r(to.y)));
        box.setAttribute('width', String(r(to.w)));
        box.setAttribute('height', String(r(to.h)));
        txt.setAttribute('x', String(r(to.x + to.w / 2)));
        txt.setAttribute('y', String(r(to.y + to.h / 2 + 5)));
        chip.setAttribute('opacity', String(r(1 - q)));
        setBar(lerp(before, after, q));
        label.textContent = String(q >= 1 ? after : before);
      });
    }

    /** 누적값의 수가 막대 끝에서 출력 칸으로 건너간다. */
    function showOut(s: ReduceFoldScene, h: Handles, mine: number): Promise<void> {
      const k = s.outputs.length - 1;
      const out = h.outputs[k];
      if (!out || s.acc === null) return Promise.resolve();
      const fromX = contentX + barW(s, s.acc) + 8;
      const fromY = LANE_Y + 6;
      const toX = outputX(s, k) + 12;
      const toY = OUT_TOP + OUT_H / 2 + 6;
      const move = (p: number): void => {
        const e = ease(p);
        out.setAttribute('x', String(r(lerp(fromX, toX, e))));
        out.setAttribute('y', String(r(lerp(fromY, toY, e))));
      };
      move(0);
      return tween(SHOW_MS, mine, move);
    }

    return {
      async render(next: ReduceFoldScene, _prev: ReduceFoldScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const h = drawStatic(next);
        const step = next.step;
        if (!opts.animate || step === null) return;
        if (step.kind === 'assign') {
          if (next.list?.line !== step.line) return;
          await listOut(next, h, mine);
        }
        else if (step.kind === 'absorb') await absorb(next, h, mine, step.index, step.x, step.before, step.after);
        else await showOut(next, h, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
