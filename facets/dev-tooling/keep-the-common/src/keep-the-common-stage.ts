/**
 * keep-the-common stage — 짝이 이어지고, 고칠 것이 둘씩 줄어든다.
 *
 * 왼쪽에 A(고치기 전), 오른쪽에 B(고친 뒤) 의 줄이 선다. 줄마다 바깥 쪽에 고칠 것 표 하나가
 * 붙어 있다 (A 는 지움 표식, B 는 넣음 표식) — 처음에는 그 표가 줄 수만큼, 곧 고칠 것 전부다.
 * 짝 걸음에서 두 줄 사이에 선이 A 에서 B 로 뻗어 이어지고, 두 줄의 표가 그 선으로 빨려 들어가
 * 사라진다. 위의 셈판이 그 둘만큼 깎인다. 떨어짐 걸음에서 남은 표가 아래 제 몫의 칸으로 떨어진다.
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
import type { KeepTheCommonScene } from './scene.js';

const H = 372;
const SVG = 'http://www.w3.org/2000/svg';

const PAD = 10;
const TOKEN_COL = 26;
const GAP_MAX = 110;
const ROW_TOP = 92;
const ROW_H_MAX = 26;
const TRAY_Y = 276;
const TRAY_H = 48;
const CAPTION_Y = 352;
const PAIR_MS = 620;
const DROP_MS = 720;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function easeIn(p: number): number {
  return p * p;
}

type Layout = {
  aX: number;
  bX: number;
  colW: number;
  rowH: number;
  boxH: number;
  tokA: number;
  tokB: number;
  rowY(i: number): number;
};

function layoutFor(scene: KeepTheCommonScene): Layout {
  const W = PIECE_CANVAS_W;
  const gap = Math.min(GAP_MAX, W * 0.16);
  const colW = (W - 2 * PAD - 2 * TOKEN_COL - gap) / 2;
  const aX = PAD + TOKEN_COL;
  const bX = aX + colW + gap;
  const rows = Math.max(scene.a.length, scene.b.length, 1);
  const rowH = Math.min(ROW_H_MAX, (TRAY_Y - 14 - ROW_TOP) / rows);
  const boxH = rowH * 0.78;
  return {
    aX,
    bX,
    colW,
    rowH,
    boxH,
    tokA: PAD + TOKEN_COL / 2,
    tokB: bX + colW + TOKEN_COL / 2,
    rowY: (i: number) => ROW_TOP + i * rowH + rowH / 2,
  };
}

export const keepTheCommonStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 남기는 손잡이 — 운동이 잡는다. drawStatic 마다 새로 선다. */
    let links = new Map<string, SVGLineElement>();
    let trayPills = new Map<string, { g: SVGGElement; x: number; y: number }>();
    let counter: SVGTextElement | null = null;
    let overlay: SVGGElement | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      }
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function pill(parent: Element, kind: 'del' | 'ins', scene: KeepTheCommonScene, x: number, y: number): SVGGElement {
      const g = el(parent, 'g', { transform: `translate(${r2(x)} ${r2(y)})` });
      el(g, 'rect', {
        x: -9,
        y: -8,
        width: 18,
        height: 16,
        rx: 4,
        fill: kind === 'del' ? c.danger : c.primary,
      });
      el(
        g,
        'text',
        {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: kind === 'del' ? c.stateInk : c.textInverse,
        },
        kind === 'del' ? scene.marks.del : scene.marks.ins,
      );
      return g;
    }

    function captionFor(scene: KeepTheCommonScene): string {
      const s = scene.step;
      if (s.kind === 'start') {
        return t('caption.start', 'Nothing kept yet: every line of A is deleted, every line of B inserted.');
      }
      if (s.kind === 'pair') {
        return t('caption.pair', 'Same text, kept: A{a} = B{b}. Edits: {from} → {to}', {
          a: s.a + 1,
          b: s.b + 1,
          from: s.from,
          to: s.to,
        });
      }
      if (s.kind === 'delete') {
        return t('caption.delete', 'Unpaired lines of A fall out as deletions: {n}', { n: s.rows.length });
      }
      return t('caption.insert', 'Unpaired lines of B fall out as insertions: {n}. Edits: {del} + {n} = {total}', {
        n: s.rows.length,
        del: s.del,
        total: s.total,
      });
    }

    function drawStatic(scene: KeepTheCommonScene): void {
      svg.textContent = '';
      links = new Map();
      trayPills = new Map();
      const L = layoutFor(scene);
      const W = PIECE_CANVAS_W;
      const pairedA = new Set(scene.pairs.map((p) => p.a));
      const pairedB = new Set(scene.pairs.map((p) => p.b));
      const deleted = new Set(scene.deleted);
      const inserted = new Set(scene.inserted);

      // 셈판 — 고칠 것
      el(
        svg,
        'text',
        {
          x: W / 2,
          y: 18,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        t('label.edits', 'Edits'),
      );
      counter = el(
        svg,
        'text',
        {
          x: W / 2,
          y: 46,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 700,
          fill: c.text,
        },
        String(scene.edits),
      );

      // 쪽 머리
      const head = { 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text };
      el(svg, 'text', { ...head, x: L.aX, y: 76 }, t('label.before', 'A · before'));
      el(svg, 'text', { ...head, x: L.bX, y: 76 }, t('label.after', 'B · after'));

      // 짝 선 — 줄 상자 아래에 깐다
      const linkLayer = el(svg, 'g', {});
      for (const p of scene.pairs) {
        const line = el(linkLayer, 'line', {
          x1: L.aX + L.colW,
          y1: L.rowY(p.a),
          x2: L.bX,
          y2: L.rowY(p.b),
          stroke: c.accent,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
        links.set(`${p.a}-${p.b}`, line);
      }

      const drawRows = (
        lines: string[],
        x: number,
        paired: Set<number>,
        fell: Set<number>,
        kind: 'del' | 'ins',
        tokX: number,
      ): void => {
        lines.forEach((text, i) => {
          const cy = L.rowY(i);
          const kept = paired.has(i);
          const gone = fell.has(i);
          el(svg, 'rect', {
            x,
            y: cy - L.boxH / 2,
            width: L.colW,
            height: L.boxH,
            rx: 3,
            fill: c.bgSubtle,
            stroke: kept ? c.accent : c.border,
            'stroke-width': kept ? 2 : 1,
          });
          if (gone) {
            el(svg, 'rect', {
              x,
              y: cy - L.boxH / 2,
              width: 4,
              height: L.boxH,
              fill: kind === 'del' ? c.danger : c.primary,
            });
          }
          el(
            svg,
            'text',
            {
              x: x + 16,
              y: cy + smPx * 0.35,
              'text-anchor': 'end',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
            },
            String(i + 1),
          );
          const code = el(
            svg,
            'text',
            {
              x: x + 24,
              y: cy + smPx * 0.35,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: gone && kind === 'del' ? c.textMuted : c.text,
              style: 'white-space: pre',
            },
            text,
          );
          if (gone && kind === 'del') code.setAttribute('text-decoration', 'line-through');
          if (!kept && !gone) pill(svg, kind, scene, tokX, cy);
        });
      };
      drawRows(scene.a, L.aX, pairedA, deleted, 'del', L.tokA);
      drawRows(scene.b, L.bX, pairedB, inserted, 'ins', L.tokB);

      // 제 몫의 칸 — 지움 · 넣음
      const drawTray = (x: number, label: string, rows: number[], kind: 'del' | 'ins', side: string): void => {
        el(svg, 'rect', {
          x,
          y: TRAY_Y,
          width: L.colW,
          height: TRAY_H,
          rx: 4,
          fill: 'none',
          stroke: c.border,
          'stroke-dasharray': '4 3',
        });
        el(
          svg,
          'text',
          {
            x: x + 8,
            y: TRAY_Y + 14,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          label,
        );
        const step = Math.min(44, (L.colW - 20) / Math.max(rows.length, 1));
        rows.forEach((row, k) => {
          const px = x + 18 + k * step;
          const g = pill(svg, kind, scene, px, TRAY_Y + 32);
          el(
            g,
            'text',
            {
              x: 13,
              y: 4,
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
            },
            String(row + 1),
          );
          trayPills.set(`${side}${row}`, { g, x: px, y: TRAY_Y + 32 });
        });
      };
      drawTray(L.aX, t('label.delete', 'Delete'), scene.deleted, 'del', 'a');
      drawTray(L.bX, t('label.insert', 'Insert'), scene.inserted, 'ins', 'b');

      // 캡션 — 지금 일어나는 일
      const caption = captionFor(scene);
      const room = W - 2 * PAD;
      const px = Math.min(smPx + 1, room / Math.max(caption.length * 0.56, 1));
      el(
        svg,
        'text',
        {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': `${r2(px)}px`,
          fill: c.text,
        },
        caption,
      );

      overlay = el(svg, 'g', {});
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let start = -1;
        const tick = (now: number): void => {
          frames.delete(id);
          if (done) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          if (start < 0) start = now;
          const p = clamp01((now - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    async function animatePair(mine: number, scene: KeepTheCommonScene, a: number, b: number, from: number): Promise<void> {
      const L = layoutFor(scene);
      const link = links.get(`${a}-${b}`);
      if (!link || !overlay || !counter) throw new Error(`keep-the-common stage: 짝 ${a}-${b} 의 선이 그려지지 않았다`);
      const num = counter;
      const x1 = L.aX + L.colW;
      const y1 = L.rowY(a);
      const x2 = L.bX;
      const y2 = L.rowY(b);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const tokA = pill(overlay, 'del', scene, L.tokA, y1);
      const tokB = pill(overlay, 'ins', scene, L.tokB, y2);
      const place = (g: SVGGElement, sx: number, sy: number, q: number): void => {
        const e = easeInOut(q);
        const x = sx + (mx - sx) * e;
        const y = sy + (my - sy) * e;
        g.setAttribute('transform', `translate(${r2(x)} ${r2(y)}) scale(${r2(1 - q)})`);
      };
      const frame = (p: number): void => {
        const grow = easeInOut(clamp01(p / 0.55));
        link.setAttribute('x2', String(r2(x1 + (x2 - x1) * grow)));
        link.setAttribute('y2', String(r2(y1 + (y2 - y1) * grow)));
        const q = clamp01((p - 0.45) / 0.55);
        place(tokA, L.tokA, y1, q);
        place(tokB, L.tokB, y2, q);
        num.textContent = String(q < 1 ? from : scene.edits);
      };
      frame(0);
      await tween(mine, PAIR_MS, frame);
    }

    async function animateDrop(mine: number, scene: KeepTheCommonScene, side: 'a' | 'b', rows: number[]): Promise<void> {
      const L = layoutFor(scene);
      const tokX = side === 'a' ? L.tokA : L.tokB;
      const moves = rows.map((row) => {
        const spot = trayPills.get(`${side}${row}`);
        if (!spot) throw new Error(`keep-the-common stage: ${side}${row} 의 칸 표가 그려지지 않았다`);
        return { g: spot.g, px: spot.x, py: spot.y, sx: tokX, sy: L.rowY(row) };
      });
      const lag = 0.12;
      const span = 1 - lag * Math.max(moves.length - 1, 0);
      const frame = (p: number): void => {
        moves.forEach((mv, k) => {
          const e = easeIn(clamp01((p - k * lag) / span));
          const x = mv.px + (mv.sx - mv.px) * (1 - e);
          const y = mv.py + (mv.sy - mv.py) * (1 - e);
          mv.g.setAttribute('transform', `translate(${r2(x)} ${r2(y)})`);
        });
      };
      frame(0);
      await tween(mine, DROP_MS, frame);
    }

    return {
      async render(next: KeepTheCommonScene, _prev: KeepTheCommonScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        const s = next.step;
        if (s.kind === 'pair') await animatePair(mine, next, s.a, s.b, s.from);
        else if (s.kind === 'delete') await animateDrop(mine, next, 'a', s.rows);
        else if (s.kind === 'insert') await animateDrop(mine, next, 'b', s.rows);
        if (mine === gen && !destroyed) drawStatic(next);
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
