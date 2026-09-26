/**
 * never-reuse-keystream 무대.
 *
 * 위는 보내는 쪽(P1 · 키스트림 S · P2), 아래는 공격자(C1 · C2 · 겹침 · 짐작 · 풀린 것).
 * 줄마다 왼쪽에 그 줄을 이루는 항(P1 · P2 · S)을 딱지로 붙인다.
 *
 * 운동 — 동사 "지워지고 드러난다":
 *  - lock    키스트림 줄의 사본이 평문 줄로 올라가(내려가) 겹치고, 겹친 암호문이 선을 넘어 공격자 칸으로 간다
 *  - overlay C1 · C2 두 줄이 겹침 칸으로 모여 포개지고, 양쪽의 S 딱지가 마주 오므라들어 사라진다
 *  - recover 짐작 줄이 들어와 겹침과 함께 아래 칸으로 모이고, P1 딱지 둘이 오므라든다
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
import { bin8, hex2, type Term } from './algorithm.js';
import type { NeverReuseKeystreamScene } from './scene.js';

const H = 480;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 12;
const LABEL_W = 150;
const CELL_GAP = 8;
const CELL_MAX = 120;
const ROW_H = 36;

/** 줄의 세로 자리 (윗변). */
const ROW_Y = {
  p1: 34,
  s: 78,
  p2: 122,
  c1: 206,
  c2: 250,
  x: 294,
  g: 338,
  r: 382,
} as const;
type RowId = keyof typeof ROW_Y;

const SENDER_HEAD_Y = 22;
const ATTACKER_TOP = 176;
const ATTACKER_HEAD_Y = 194;
const ATTACKER_BOTTOM = 426;
const CAPTION_Y = 448;
const CAPTION_Y2 = 468;

const CHIP_W = 24;
const CHIP_H = 12;
const CHIP_GAP = 4;

/** 항의 색 — categorical(3) 안의 자리. */
const TERM_INDEX: Record<Term, number> = { p1: 0, p2: 1, s: 2 };

const LOCK_MS = 700;
const OVERLAY_MS = 760;
const RECOVER_MS = 960;

type RowSpec = {
  label: string;
  bytes: readonly number[] | null;
  glyphs: boolean;
  terms: readonly Term[];
  cancelled: readonly Term[];
  border: string | null;
  zeros: readonly number[];
  samePos: readonly boolean[];
};

type RowHandle = { g: SVGGElement; chips: Map<string, SVGGElement> };

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function clamp01(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

export const neverReuseKeystreamStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const termPalette = categorical(3, 'vivid');
    const W = PIECE_CANVAS_W;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      parent.appendChild(node);
      return node;
    }

    function text(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number>): SVGTextElement {
      const node = el('text', { x, y, ...attrs }, parent);
      node.textContent = s;
      return node;
    }

    function termColor(term: Term): string {
      const c = termPalette[TERM_INDEX[term]];
      if (c === undefined) throw new Error(`never-reuse-keystream stage: 항 ${term} 의 색이 없다`);
      return c;
    }

    function cellGeom(n: number): { x0: number; w: number } {
      const avail = W - PAD - (PAD + LABEL_W);
      const w = Math.min(CELL_MAX, (avail - CELL_GAP * (n - 1)) / n);
      return { x0: PAD + LABEL_W, w };
    }

    function termNames(): Record<Term, string> {
      return {
        p1: t('term.p1', 'P1'),
        p2: t('term.p2', 'P2'),
        s: t('term.s', 'S'),
      };
    }

    /** 한 줄을 (0, 0) 기준으로 그린다. 세로 자리는 부르는 쪽이 transform 으로 준다. */
    function drawRow(
      parent: Element,
      n: number,
      spec: RowSpec,
      names: Record<Term, string>,
      withLabel: boolean,
    ): RowHandle {
      const g = el('g', {}, parent);
      const chips = new Map<string, SVGGElement>();
      if (withLabel) {
        text(g, PAD, 14, spec.label, {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: spec.bytes === null ? colors.textMuted : colors.text,
        });
      }
      let cx = PAD;
      const chipY = 20;
      spec.terms.forEach((term, i) => {
        const cg = el('g', {}, g);
        el('rect', { x: cx, y: chipY, width: CHIP_W, height: CHIP_H, rx: 3, fill: termColor(term) }, cg);
        text(cg, cx + CHIP_W / 2, chipY + CHIP_H - 2.5, names[term], {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          fill: colors.stateInk,
        });
        chips.set(`${term}:${i}`, cg);
        cx += CHIP_W + CHIP_GAP;
      });
      for (const term of spec.cancelled) {
        // 짝으로 지워진 항 — 빈 테두리 둘에 가로줄
        for (let k = 0; k < 2; k += 1) {
          const cg = el('g', {}, g);
          el(
            'rect',
            {
              x: cx,
              y: chipY,
              width: CHIP_W,
              height: CHIP_H,
              rx: 3,
              fill: 'none',
              stroke: termColor(term),
              'stroke-dasharray': '2 2',
            },
            cg,
          );
          text(cg, cx + CHIP_W / 2, chipY + CHIP_H - 2.5, names[term], {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            fill: colors.textMuted,
          });
          el(
            'line',
            { x1: cx + 2, y1: chipY + CHIP_H / 2, x2: cx + CHIP_W - 2, y2: chipY + CHIP_H / 2, stroke: colors.textMuted },
            cg,
          );
          cx += CHIP_W + CHIP_GAP;
        }
      }

      const { x0, w } = cellGeom(n);
      for (let i = 0; i < n; i += 1) {
        const x = x0 + i * (w + CELL_GAP);
        if (spec.bytes === null) {
          el(
            'rect',
            { x, y: 0, width: w, height: ROW_H, rx: 4, fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 3' },
            g,
          );
          continue;
        }
        const byte = spec.bytes[i];
        if (byte === undefined) throw new Error(`never-reuse-keystream stage: ${spec.label} 의 바이트 ${i} 가 없다`);
        const zero = spec.zeros.includes(i);
        const same = spec.samePos[i] === true;
        const stroke = same ? termColor('p2') : spec.border;
        el(
          'rect',
          {
            x,
            y: 0,
            width: w,
            height: ROW_H,
            rx: 4,
            fill: zero ? colors.accent : colors.bg,
            stroke: stroke ?? colors.border,
            'stroke-width': stroke === null ? 1 : 2,
          },
          g,
        );
        const ink = zero ? colors.stateInk : colors.text;
        if (spec.glyphs) {
          text(g, x + 12, 16, String.fromCharCode(byte), {
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: ink,
          });
        }
        text(g, x + w / 2, 16, hex2(byte), {
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'text-anchor': 'middle',
          fill: ink,
        });
        text(g, x + w / 2, 30, bin8(byte), {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          fill: zero ? colors.stateInk : colors.textMuted,
        });
      }
      return { g, chips };
    }

    function place(h: RowHandle, x: number, y: number): void {
      h.g.setAttribute('transform', `translate(${round(x)},${round(y)})`);
    }

    function shrinkChip(chip: SVGGElement, k: number): void {
      const box = chip.firstElementChild;
      if (box === null) throw new Error('never-reuse-keystream stage: 딱지에 상자가 없다');
      const cx = Number(box.getAttribute('x')) + CHIP_W / 2;
      const cy = Number(box.getAttribute('y')) + CHIP_H / 2;
      chip.setAttribute('transform', `translate(${round(cx)},${round(cy)}) scale(${round(k)},1) translate(${round(-cx)},${round(-cy)})`);
    }

    function hexLine(bytes: readonly number[]): string {
      return bytes.map(hex2).join(' ');
    }

    function glyphLine(bytes: readonly number[]): string {
      return bytes.map((b) => String.fromCharCode(b)).join('');
    }

    type Rows = Record<RowId, RowSpec>;

    /** 장면에서 줄 명세 전부를 세운다. */
    function rowSpecs(scene: NeverReuseKeystreamScene): Rows {
      const { p1, p2, s } = scene.base;
      const none: readonly number[] = [];
      const blank = (label: string): RowSpec => ({
        label,
        bytes: null,
        glyphs: false,
        terms: [],
        cancelled: [],
        border: null,
        zeros: none,
        samePos: [],
      });
      const r = scene.r;
      return {
        p1: { label: t('label.p1', 'P1'), bytes: p1, glyphs: true, terms: ['p1'], cancelled: [], border: termColor('p1'), zeros: none, samePos: [] },
        s: { label: t('label.keystream', 'Keystream S'), bytes: s, glyphs: false, terms: ['s'], cancelled: [], border: termColor('s'), zeros: none, samePos: [] },
        p2: { label: t('label.p2', 'P2'), bytes: p2, glyphs: true, terms: ['p2'], cancelled: [], border: termColor('p2'), zeros: none, samePos: [] },
        c1:
          scene.c1 === null
            ? blank(t('label.c1', 'C1'))
            : { label: t('label.c1', 'C1'), bytes: scene.c1.bytes, glyphs: false, terms: scene.c1.terms, cancelled: [], border: null, zeros: none, samePos: [] },
        c2:
          scene.c2 === null
            ? blank(t('label.c2', 'C2'))
            : { label: t('label.c2', 'C2'), bytes: scene.c2.bytes, glyphs: false, terms: scene.c2.terms, cancelled: [], border: null, zeros: none, samePos: [] },
        x:
          scene.x === null
            ? blank(t('label.x', 'C1 ⊕ C2'))
            : {
                label: t('label.x', 'C1 ⊕ C2'),
                bytes: scene.x.bytes,
                glyphs: false,
                terms: scene.x.terms,
                cancelled: scene.x.cancelled,
                border: null,
                zeros: scene.x.zeros,
                samePos: [],
              },
        g:
          r === null
            ? blank(t('label.guess', 'Guess'))
            : { label: t('label.guess', 'Guess'), bytes: r.guess, glyphs: true, terms: ['p1'], cancelled: [], border: null, zeros: none, samePos: [] },
        r:
          r === null
            ? blank(t('label.result', 'Guess ⊕ (C1 ⊕ C2)'))
            : {
                label: t('label.result', 'Guess ⊕ (C1 ⊕ C2)'),
                bytes: r.bytes,
                glyphs: true,
                terms: r.terms,
                cancelled: r.cancelled,
                border: null,
                zeros: none,
                samePos: r.samePos,
              },
      };
    }

    function captions(scene: NeverReuseKeystreamScene): [string, string] {
      const step = scene.step;
      if (step === null) {
        return [t('caption.start', 'Sender: two plaintexts, one keystream'), t('caption.startS', 'S = {hex}', { hex: hexLine(scene.base.s) })];
      }
      if (step.kind === 'lock') {
        const row = scene[step.row];
        if (row === null) throw new Error(`never-reuse-keystream stage: ${step.row} 가 장면에 없다`);
        const uses = (scene.c1 === null ? 0 : 1) + (scene.c2 === null ? 0 : 1);
        return [
          t('caption.lock', 'Sender: C{n} = P{n} ⊕ S = {hex}', { n: step.row === 'c1' ? 1 : 2, hex: hexLine(row.bytes) }),
          t('caption.lockUses', 'Times the keystream was used: {uses}', { uses }),
        ];
      }
      if (step.kind === 'overlay') {
        const x = scene.x;
        if (x === null) throw new Error('never-reuse-keystream stage: 겹침이 장면에 없다');
        const left = x.terms.filter((term) => term === 's').length;
        const first = t('caption.overlay', 'Attacker: C1 ⊕ C2 = {hex}', { hex: hexLine(x.bytes) });
        if (x.zeros.length === 0) return [first, t('caption.overlayLeft', 'S terms left: {left}', { left })];
        return [
          first,
          t('caption.overlayZeros', 'S terms left: {left} · Zero byte at position: {zeros}', {
            left,
            zeros: x.zeros.map((z) => z + 1).join(', '),
          }),
        ];
      }
      const r = scene.r;
      if (r === null) throw new Error('never-reuse-keystream stage: 풀린 줄이 장면에 없다');
      return [
        t('caption.recover', 'Attacker: {guess} ⊕ (C1 ⊕ C2) = {text} ({hex})', {
          guess: glyphLine(r.guess),
          text: glyphLine(r.bytes),
          hex: hexLine(r.bytes),
        }),
        t('caption.recoverSame', 'Bytes equal to P2: {same} / {total} · Times the attacker used the keystream: {uses}', {
          same: r.same,
          total: r.total,
          uses: r.keystreamUses,
        }),
      ];
    }

    type Drawn = { rows: Record<RowId, RowHandle>; motion: SVGGElement };

    function drawStatic(scene: NeverReuseKeystreamScene): Drawn {
      svg.textContent = '';
      const n = scene.base.p1.length;
      const names = termNames();
      el('rect', { x: 0, y: ATTACKER_TOP, width: W, height: ATTACKER_BOTTOM - ATTACKER_TOP, fill: colors.bgSubtle }, svg);
      el('line', { x1: 0, y1: ATTACKER_TOP, x2: W, y2: ATTACKER_TOP, stroke: colors.border, 'stroke-dasharray': '4 4' }, svg);
      text(svg, PAD, SENDER_HEAD_Y, t('label.sender', 'Sender'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: colors.textMuted,
      });
      text(svg, PAD, ATTACKER_HEAD_Y, t('label.attacker', 'Attacker'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: colors.textMuted,
      });
      const specs = rowSpecs(scene);
      const rowLayer = el('g', {}, svg);
      const ids = Object.keys(ROW_Y) as RowId[];
      const rows = {} as Record<RowId, RowHandle>;
      for (const id of ids) {
        const h = drawRow(rowLayer, n, specs[id], names, true);
        place(h, 0, ROW_Y[id]);
        rows[id] = h;
      }
      const [c1, c2] = captions(scene);
      text(svg, PAD, CAPTION_Y, c1, { 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text });
      text(svg, PAD, CAPTION_Y2, c2, { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted });
      const motion = el('g', {}, svg);
      return { rows, motion };
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (mine !== gen || destroyed) {
            done();
            return;
          }
          const p = clamp01((performance.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            done();
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

    function alive(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    function ghost(drawn: Drawn, scene: NeverReuseKeystreamScene, id: RowId): RowHandle {
      const specs = rowSpecs(scene);
      return drawRow(drawn.motion, scene.base.p1.length, specs[id], termNames(), false);
    }

    function chipsOf(h: RowHandle, term: Term): SVGGElement[] {
      const out = [...h.chips.entries()].filter(([key]) => key.startsWith(`${term}:`)).map(([, v]) => v);
      if (out.length === 0) throw new Error(`never-reuse-keystream stage: 딱지 ${term} 를 못 찾았다`);
      return out;
    }

    async function animateLock(
      next: NeverReuseKeystreamScene,
      drawn: Drawn,
      row: 'c1' | 'c2',
      from: 'p1' | 'p2',
      mine: number,
    ): Promise<void> {
      const target = drawn.rows[row];
      target.g.setAttribute('visibility', 'hidden');
      const sCopy = ghost(drawn, next, 's');
      const locked = ghost(drawn, next, row);
      locked.g.setAttribute('visibility', 'hidden');
      place(sCopy, 0, ROW_Y.s);
      await tween(LOCK_MS, mine, (p) => {
        const a = ease(clamp01(p / 0.45));
        const b = ease(clamp01((p - 0.5) / 0.5));
        if (p < 0.5) {
          place(sCopy, 0, ROW_Y.s + (ROW_Y[from] - ROW_Y.s) * a);
        } else {
          sCopy.g.setAttribute('visibility', 'hidden');
          locked.g.removeAttribute('visibility');
          place(locked, 0, ROW_Y[from] + (ROW_Y[row] - ROW_Y[from]) * b);
        }
      });
    }

    async function animateOverlay(next: NeverReuseKeystreamScene, drawn: Drawn, mine: number): Promise<void> {
      drawn.rows.x.g.setAttribute('visibility', 'hidden');
      const a = ghost(drawn, next, 'c1');
      const b = ghost(drawn, next, 'c2');
      place(a, 0, ROW_Y.c1);
      place(b, 0, ROW_Y.c2);
      const sChips = [...chipsOf(a, 's'), ...chipsOf(b, 's')];
      await tween(OVERLAY_MS, mine, (p) => {
        const m = ease(clamp01(p / 0.6));
        place(a, 0, ROW_Y.c1 + (ROW_Y.x - ROW_Y.c1) * m);
        place(b, 0, ROW_Y.c2 + (ROW_Y.x - ROW_Y.c2) * m);
        const k = 1 - ease(clamp01((p - 0.6) / 0.4));
        for (const chip of sChips) shrinkChip(chip, k);
      });
    }

    async function animateRecover(next: NeverReuseKeystreamScene, drawn: Drawn, mine: number): Promise<void> {
      drawn.rows.g.g.setAttribute('visibility', 'hidden');
      drawn.rows.r.g.setAttribute('visibility', 'hidden');
      const guess = ghost(drawn, next, 'g');
      const x = ghost(drawn, next, 'x');
      place(guess, W, ROW_Y.g);
      place(x, 0, ROW_Y.x);
      const p1Chips = [...chipsOf(guess, 'p1'), ...chipsOf(x, 'p1')];
      await tween(RECOVER_MS, mine, (p) => {
        const enter = ease(clamp01(p / 0.35));
        const join = ease(clamp01((p - 0.4) / 0.35));
        place(guess, W * (1 - enter), ROW_Y.g + (ROW_Y.r - ROW_Y.g) * join);
        place(x, 0, ROW_Y.x + (ROW_Y.r - ROW_Y.x) * join);
        const k = 1 - ease(clamp01((p - 0.78) / 0.22));
        for (const chip of p1Chips) shrinkChip(chip, k);
      });
    }

    async function render(
      next: NeverReuseKeystreamScene,
      prev: NeverReuseKeystreamScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const drawn = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step === null || prev === null || prev.step === step) return;
      if (step.kind === 'lock') await animateLock(next, drawn, step.row, step.from, mine);
      else if (step.kind === 'overlay') await animateOverlay(next, drawn, mine);
      else await animateRecover(next, drawn, mine);
      if (!alive(mine)) return;
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
