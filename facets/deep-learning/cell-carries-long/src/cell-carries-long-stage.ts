/**
 * cell-carries-long 의 무대 — 셀 c 가 긴 길을 따라 실려 간다.
 *
 * 가운데 가로로 곧은 길(셀의 길)이 걸음 0 부터 끝 걸음까지 놓인다. 길 위에는 걸음 사이마다
 * 잊는 문 f 하나만 있다. c 의 값은 길 위의 짐(높이 = c)으로 서고, 걸음마다 짐이 다음
 * 자리로 **옮겨 가며** f 를 지나 조금 줄고, 위에서 들이는 몫이 떨어져 조금 더해진다.
 * 짐이 떠난 자리에는 그 걸음의 c 가 흐리게 남아 여섯 자리가 거의 한 높이로 늘어선다.
 *
 * 길 아래로는 걸음마다 내보내는 문 o 를 지나 h 가 흘러내린다. h 막대는 걸음마다 길이가
 * 크게 달라 출렁인다 — 곧은 c 의 줄과 한 화면에서 견준다.
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
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { CarryRecord, CellCarriesLongScene } from './scene';

const H = 352;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로 자리 */
const Y_STEP = 16;
const Y_X = 38;
const Y_ROAD = 142;
const Y_O = 206;
const Y_H = 228;
const Y_CAP1 = 322;
const Y_CAP2 = 342;

/** 크기의 상한 — 실제 크기는 폭에서 역산한다 */
const LEFT_MAX = 92;
const CARRIAGE_W_MAX = 30;
/** c 가 1 일 때 짐의 높이 */
const C_SCALE = 88;
/** h 가 1 일 때 막대의 길이 */
const H_SCALE = 80;

/** 운동 시간 */
const MS_SLIDE = 380;
const MS_TAKE = 160;
const MS_DROP = 260;

function fmt(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

/** c 의 짐 높이. 이 조각의 c 는 음수가 될 수 없는 모형이라 음수면 던진다. 0 은 보이도록 2 로 둔다. */
function cLen(c: number): number {
  if (!(c >= 0)) throw new Error(`cell-carries-long 무대: c 가 음수이거나 수가 아니다 — ${c}`);
  return Math.max(2, c * C_SCALE);
}

/** h 막대 길이. 음수면 던진다. 0 은 보이도록 2 로 둔다. */
function hLenOf(h: number): number {
  if (!(h >= 0)) throw new Error(`cell-carries-long 무대: h 가 음수이거나 수가 아니다 — ${h}`);
  return Math.max(2, h * H_SCALE);
}

type Handles = {
  carriage: SVGRectElement;
  cLabel: SVGTextElement;
  inflow: SVGLineElement;
  inflowLabel: SVGTextElement;
  fGate: SVGCircleElement;
  hBar: SVGRectElement;
  hLabel: SVGTextElement;
  oLabel: SVGTextElement;
  stem: SVGLineElement;
};

export const cellCarriesLongStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const cats = categorical(2, 'vivid');
    const C_COLOR = cats[0] ?? colors.primary;
    const H_COLOR = cats[1] ?? colors.accent;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'middle',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = body;
      return node;
    }

    /** 가로 자리 — 폭에서 역산한다 */
    function layout(n: number): { left: number; x0: number; gap: number; cw: number } {
      const left = Math.min(LEFT_MAX, PIECE_CANVAS_W * 0.14);
      const x0 = left + 24;
      const right = PIECE_CANVAS_W - 46;
      const gap = (right - x0) / n;
      const cw = Math.min(CARRIAGE_W_MAX, gap * 0.38);
      return { left, x0, gap, cw };
    }

    function drawStatic(scene: CellCarriesLongScene): Handles | null {
      svg.textContent = '';
      const { base, trail, summary, step } = scene;
      const n = base.xs.length;
      const { x0, gap, cw } = layout(n);
      const sx = (s: number): number => x0 + s * gap;
      const done = trail.length;
      const cur = step.kind === 'carry' ? step.k : 0;

      el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: colors.bg }, svg);

      // 왼쪽 머리
      text(svg, 12, Y_STEP + 4, t('label.step', 'Step'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'start',
      });
      text(svg, 12, Y_X + 4, base.names.input, { size: fontSizes.md, anchor: 'start', mono: true });
      text(svg, 12, Y_ROAD + 4, base.names.cell, {
        size: fontSizes.lg,
        anchor: 'start',
        fill: C_COLOR,
        weight: '700',
        mono: true,
      });
      text(svg, 12, Y_ROAD + 20, t('label.cell', 'Cell state'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'start',
      });
      text(svg, 12, Y_H + 10, base.names.hidden, {
        size: fontSizes.lg,
        anchor: 'start',
        fill: H_COLOR,
        weight: '700',
        mono: true,
      });
      text(svg, 12, Y_H + 26, t('label.hidden', 'Hidden state'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'start',
      });

      // 걸음 번호와 입력
      for (let s = 0; s <= n; s += 1) {
        text(svg, sx(s), Y_STEP + 4, String(s), {
          size: fontSizes.xs,
          fill: s === cur ? colors.text : colors.textMuted,
          weight: s === cur ? '700' : '400',
        });
        if (s >= 1) {
          const x = base.xs[s - 1];
          if (x === undefined) throw new Error(`cell-carries-long 무대: 입력 ${s} 가 없다`);
          text(svg, sx(s), Y_X + 4, String(x), {
            size: fontSizes.md,
            mono: true,
            fill: s <= done ? colors.text : colors.textMuted,
          });
        }
      }

      // 셀의 길 — 처음부터 끝까지 곧게
      el(
        'line',
        {
          x1: r2(sx(0) - cw),
          y1: Y_ROAD,
          x2: r2(sx(n) + cw * 0.9),
          y2: Y_ROAD,
          stroke: colors.border,
          'stroke-width': 6,
          'stroke-linecap': 'round',
        },
        svg,
      );

      // 걸음 1 의 c 높이 — 긴 길 끝까지 잰다
      const first = trail[0];
      if (first !== undefined) {
        const yRef = r2(Y_ROAD - (first.c * C_SCALE) / 2);
        el(
          'line',
          {
            x1: r2(sx(1) - cw / 2),
            y1: yRef,
            x2: r2(sx(n) + cw / 2 + 6),
            y2: yRef,
            stroke: C_COLOR,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
            opacity: 0.7,
          },
          svg,
        );
      }

      // 걸음 사이의 잊는 문 f
      let fGate: SVGCircleElement | null = null;
      const fR = Math.min(11, gap * 0.13);
      for (let s = 1; s <= n; s += 1) {
        const gx = r2((sx(s - 1) + sx(s)) / 2);
        const rec = trail[s - 1];
        const circle = el(
          'circle',
          {
            cx: gx,
            cy: Y_ROAD,
            r: r2(fR),
            fill: colors.bg,
            stroke: rec !== undefined ? C_COLOR : colors.border,
            'stroke-width': s === cur ? 2.5 : 1.5,
          },
          svg,
        );
        if (s === cur) fGate = circle;
        text(svg, gx, Y_ROAD + 4, base.gateIds.f, {
          size: fontSizes.xs,
          mono: true,
          fill: rec !== undefined ? colors.text : colors.textMuted,
        });
        if (rec !== undefined) {
          text(svg, gx, Y_ROAD + fR + 13, t('value.times', '×{v}', { v: fmt(rec.f) }), {
            size: fontSizes.xs,
            mono: true,
            fill: colors.textMuted,
          });
        }
      }

      // 짐 — 지나간 자리는 흐리게, 지금 자리는 짙게
      const cHeights: Array<{ s: number; c: number }> = [{ s: 0, c: base.c0 }];
      for (const rec of trail) cHeights.push({ s: rec.k, c: rec.c });
      let carriage: SVGRectElement | null = null;
      let cLabel: SVGTextElement | null = null;
      for (const { s, c } of cHeights) {
        const hh = cLen(c);
        const isCur = s === cur;
        const rect = el(
          'rect',
          {
            x: r2(sx(s) - cw / 2),
            y: r2(Y_ROAD - hh / 2),
            width: r2(cw),
            height: r2(hh),
            rx: 3,
            fill: C_COLOR,
            'fill-opacity': isCur ? 1 : 0.28,
            stroke: C_COLOR,
            'stroke-width': 1.5,
          },
          svg,
        );
        const lbl = text(svg, sx(s), r2(Y_ROAD - hh / 2 - 6), fmt(c), {
          size: fontSizes.xs,
          mono: true,
          weight: isCur ? '700' : '400',
          fill: isCur ? colors.text : colors.textMuted,
        });
        if (isCur) {
          carriage = rect;
          cLabel = lbl;
        }
      }

      // 위에서 들이는 몫
      let inflow: SVGLineElement | null = null;
      let inflowLabel: SVGTextElement | null = null;
      for (const rec of trail) {
        const x = sx(rec.k);
        const top = Y_ROAD - cLen(rec.c) / 2;
        const isCur = rec.k === cur;
        const line = el(
          'line',
          {
            x1: r2(x),
            y1: Y_X + 10,
            x2: r2(x),
            y2: r2(top - 18),
            stroke: isCur ? colors.text : colors.border,
            'stroke-width': 1.5,
          },
          svg,
        );
        const lbl = text(svg, x + 5, Y_X + 34, t('value.plus', '+{v}', { v: fmt(rec.added) }), {
          size: fontSizes.xs,
          mono: true,
          anchor: 'start',
          fill: isCur ? colors.text : colors.textMuted,
        });
        if (isCur) {
          inflow = line;
          inflowLabel = lbl;
        }
      }

      // 아래로 내보내는 h — o 를 지나 흘러내린다
      const hRows: Array<{ s: number; h: number; c: number; o: number | null }> = [
        { s: 0, h: base.h0, c: base.c0, o: null },
      ];
      for (const rec of trail) hRows.push({ s: rec.k, h: rec.h, c: rec.c, o: rec.o });
      let hBar: SVGRectElement | null = null;
      let hLabel: SVGTextElement | null = null;
      let oLabel: SVGTextElement | null = null;
      let stem: SVGLineElement | null = null;
      const oR = Math.min(10, gap * 0.12);
      for (const row of hRows) {
        const x = sx(row.s);
        const isCur = row.s === cur;
        if (row.o !== null) {
          const cBottom = Y_ROAD + cLen(row.c) / 2;
          const ln = el(
            'line',
            {
              x1: r2(x),
              y1: r2(cBottom),
              x2: r2(x),
              y2: r2(Y_O - oR),
              stroke: isCur ? H_COLOR : colors.border,
              'stroke-width': 1.5,
            },
            svg,
          );
          text(svg, x + 4, r2((cBottom + Y_O - oR) / 2 + 4), base.names.squash, {
            size: fontSizes.xs,
            mono: true,
            anchor: 'start',
            fill: colors.textMuted,
          });
          el(
            'circle',
            {
              cx: r2(x),
              cy: Y_O,
              r: r2(oR),
              fill: colors.bg,
              stroke: isCur ? H_COLOR : colors.border,
              'stroke-width': 1.5,
            },
            svg,
          );
          text(svg, x, Y_O + 4, base.gateIds.o, { size: fontSizes.xs, mono: true });
          const ol = text(svg, x + oR + 3, Y_O + 4, t('value.times', '×{v}', { v: fmt(row.o) }), {
            size: fontSizes.xs,
            mono: true,
            anchor: 'start',
            fill: isCur ? colors.text : colors.textMuted,
          });
          if (isCur) {
            stem = ln;
            oLabel = ol;
          }
        }
        const len = hLenOf(row.h);
        const bar = el(
          'rect',
          {
            x: r2(x - cw / 2),
            y: Y_H,
            width: r2(cw),
            height: r2(len),
            rx: 2,
            fill: H_COLOR,
            'fill-opacity': isCur ? 1 : 0.35,
            stroke: H_COLOR,
            'stroke-width': 1,
          },
          svg,
        );
        const hl = text(svg, x, r2(Y_H + len + 13), fmt(row.h), {
          size: fontSizes.xs,
          mono: true,
          weight: isCur ? '700' : '400',
          fill: isCur ? colors.text : colors.textMuted,
        });
        if (isCur) {
          hBar = bar;
          hLabel = hl;
        }
      }
      // h 의 바닥줄
      el(
        'line',
        {
          x1: r2(sx(0) - cw),
          y1: Y_H,
          x2: r2(sx(n) + cw),
          y2: Y_H,
          stroke: colors.border,
          'stroke-width': 1,
        },
        svg,
      );

      // 캡션 — 지금 일어나는 일만
      const cap = (y: number, body: string): void => {
        text(svg, PIECE_CANVAS_W / 2, y, body, { size: fontSizes.sm });
      };
      const sym = {
        cSym: base.names.cell,
        hSym: base.names.hidden,
        fSym: base.gateIds.f,
        oSym: base.gateIds.o,
        squash: base.names.squash,
      };
      if (step.kind === 'start') {
        cap(Y_CAP1, t('caption.start', 'Inputs to feed: {n}. The cell starts at {cSym} = {c0}.', {
          n,
          cSym: sym.cSym,
          c0: fmt(base.c0),
        }));
      } else if (summary !== null) {
        cap(
          Y_CAP1,
          t('caption.kept', 'Step {first} → step {last}: {cSym} {c1} → {cN}. Remaining ratio: {ratio} · product of {fSym}: {fProd}', {
            first: 1,
            last: n,
            cSym: sym.cSym,
            c1: fmt(summary.c1),
            cN: fmt(summary.cN),
            ratio: fmt(summary.ratio),
            fSym: sym.fSym,
            fProd: fmt(summary.fProd),
          }),
        );
        cap(
          Y_CAP2,
          t('caption.swing', 'Over the same steps, range of {hSym}: {hMin} ~ {hMax}', {
            hSym: sym.hSym,
            hMin: fmt(summary.hMin),
            hMax: fmt(summary.hMax),
          }),
        );
      } else {
        const rec = trail[step.k - 1];
        if (rec === undefined) throw new Error(`cell-carries-long 무대: 걸음 ${step.k} 의 기록이 없다`);
        cap(Y_CAP1, cellLine(rec, sym));
        cap(
          Y_CAP2,
          t('caption.hidden', 'Out: {hSym} = {oSym} {o} × {squash}({cSym}) = {h}', {
            hSym: sym.hSym,
            oSym: sym.oSym,
            o: fmt(rec.o),
            squash: sym.squash,
            cSym: sym.cSym,
            h: fmt(rec.h),
          }),
        );
      }

      if (step.kind === 'start') return null;
      if (
        carriage !== null &&
        cLabel !== null &&
        inflow !== null &&
        inflowLabel !== null &&
        fGate !== null &&
        hBar !== null &&
        hLabel !== null &&
        oLabel !== null &&
        stem !== null
      ) {
        return { carriage, cLabel, inflow, inflowLabel, fGate, hBar, hLabel, oLabel, stem };
      }
      throw new Error(`cell-carries-long 무대: 걸음 ${step.k} 의 그림 요소를 세우지 못했다`);
    }

    function cellLine(
      rec: CarryRecord,
      sym: { cSym: string; fSym: string },
    ): string {
      return t('caption.cell', 'Step {k} cell: {prev} × {fSym} {f} = {kept}, + {added} → {cSym} {c}', {
        k: rec.k,
        prev: fmt(rec.cPrev),
        fSym: sym.fSym,
        f: fmt(rec.f),
        kept: fmt(rec.kept),
        added: fmt(rec.added),
        cSym: sym.cSym,
        c: fmt(rec.c),
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    /** 진행률 p 를 0 에서 1 로 흘린다. 도중에 세대가 바뀌면 거짓. */
    async function tween(mine: number, ms: number, draw: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const p = Math.min(1, (Date.now() - start) / ms);
        draw(p);
        if (p >= 1) return true;
        await wait(16);
      }
    }

    async function animateCarry(mine: number, scene: CellCarriesLongScene, hd: Handles): Promise<void> {
      const { base, trail, step } = scene;
      if (step.kind !== 'carry') {
        throw new Error('cell-carries-long 무대: carry 걸음이 아닌데 운동을 부탁받았다');
      }
      const rec = trail[step.k - 1];
      if (rec === undefined) throw new Error(`cell-carries-long 무대: 걸음 ${step.k} 의 기록이 없다`);
      const { x0, gap, cw } = layout(base.xs.length);
      const fromX = x0 + (rec.k - 1) * gap;
      const toX = x0 + rec.k * gap;
            const place = (cx: number, c: number): void => {
        const hh = cLen(c);
        hd.carriage.setAttribute('x', String(r2(cx - cw / 2)));
        hd.carriage.setAttribute('y', String(r2(Y_ROAD - hh / 2)));
        hd.carriage.setAttribute('height', String(r2(hh)));
        hd.cLabel.setAttribute('x', String(r2(cx)));
        hd.cLabel.setAttribute('y', String(r2(Y_ROAD - hh / 2 - 6)));
      };
      const cTop = Y_ROAD - cLen(rec.c) / 2 - 18;

      // 아직 못 온 만큼 — 짐은 앞 자리에서, 들이는 몫 · h 는 아직 없다
      place(fromX, rec.cPrev);
      hd.cLabel.textContent = fmt(rec.cPrev);
      hd.inflow.setAttribute('y2', String(Y_X + 10));
      hd.inflowLabel.setAttribute('opacity', '0');
      hd.hBar.setAttribute('height', '0');
      hd.hLabel.setAttribute('opacity', '0');
      hd.oLabel.setAttribute('opacity', '0');
      hd.stem.setAttribute('opacity', '0');

      // 1. 길을 따라 옮겨 간다 — f 를 지나며 f 만큼 곱해진다
      const slid = await tween(mine, MS_SLIDE, (p) => {
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const cx = fromX + (toX - fromX) * e;
        const passed = Math.min(1, Math.max(0, (e - 0.35) / 0.3));
        const c = rec.cPrev + (rec.kept - rec.cPrev) * passed;
        place(cx, c);
        hd.cLabel.textContent = fmt(passed >= 1 ? rec.kept : rec.cPrev);
        hd.fGate.setAttribute('stroke-width', passed > 0 && passed < 1 ? '4' : '2.5');
      });
      if (!slid) return;

      // 2. 위에서 들이는 몫이 떨어진다
      const took = await tween(mine, MS_TAKE, (p) => {
        hd.inflow.setAttribute('y2', String(r2(Y_X + 10 + (cTop - Y_X - 10) * p)));
        hd.inflowLabel.setAttribute('opacity', String(r2(p)));
        place(toX, rec.kept + rec.added * p);
        hd.cLabel.textContent = fmt(p >= 1 ? rec.c : rec.kept);
      });
      if (!took) return;

      // 3. o 를 지나 h 가 흘러내린다
      const hLen = hLenOf(rec.h);
      await tween(mine, MS_DROP, (p) => {
        hd.stem.setAttribute('opacity', String(r2(Math.min(1, p * 2))));
        hd.oLabel.setAttribute('opacity', String(r2(Math.min(1, p * 2))));
        hd.hBar.setAttribute('height', String(r2(hLen * p)));
        hd.hLabel.setAttribute('y', String(r2(Y_H + hLen * p + 13)));
        hd.hLabel.setAttribute('opacity', p >= 1 ? '1' : '0');
      });
    }

    return {
      render(
        next: CellCarriesLongScene,
        _prev: CellCarriesLongScene | null,
        opts: { animate: boolean },
      ): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const hd = drawStatic(next);
        if (!opts.animate || hd === null) return;
        return animateCarry(mine, next, hd).then(() => {
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
