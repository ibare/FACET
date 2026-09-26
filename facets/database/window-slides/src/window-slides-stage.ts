/**
 * window-slides stage — 틀이 표를 따라 미끄러진다.
 *
 * 틀은 늘 앞 p 줄 · 현재 줄 · 뒤 f 줄 크기다. 점선 윤곽이 그 크기 전체이고, 실선 윤곽과
 * 옅은 바탕은 **표 안쪽으로 잘린** 틀이다 — 양 끝에서 점선만 표 밖으로 나가고 실선은 두 줄을
 * 감싼다. 틀이 머물면 틀 안 amount 값의 복사본이 그 줄의 near 칸으로 날아가 합이 된다.
 * 원래 값은 제자리에 남고, 줄은 하나도 사라지지 않는다.
 *
 * 운동: 틀 미끄러짐 → 복사본이 near 칸으로 모임. 한 시계(`tween`)로 차례로 흘린다.
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
import type { WindowSlidesScene } from './scene.js';

const H = 460;
const MARGIN = 24;
/** 한 칸 폭의 상한 */
const COL_MAX = 150;
/** 줄 높이의 상한 — 실제 높이는 남은 세로에서 역산 */
const ROW_MAX = 36;
/** 캡션 · 줄 수가 서는 아래 몫 */
const FOOT = 64;
const SLIDE_MS = 380;
const GATHER_MS = 420;
/** 복사본이 날며 떠오르는 높이 (줄 높이에 대한 몫) */
const LIFT = 0.45;

const SVG_NS = 'http://www.w3.org/2000/svg';

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? fmt(v) : v);
  }
  parent.appendChild(node);
  return node;
}

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

type Geometry = {
  tableX: number;
  tableW: number;
  colW: number;
  sqlPx: number;
  sqlLine: number;
  headerY: number;
  bodyTop: number;
  rowH: number;
};

function geometry(scene: WindowSlidesScene): Geometry {
  const { base } = scene;
  const tableW = Math.min(PIECE_CANVAS_W - 2 * MARGIN, COL_MAX * (base.columns.length + 1));
  const tableX = (PIECE_CANVAS_W - tableW) / 2;
  const longest = base.sql.reduce((m, s) => Math.max(m, s.length), 1);
  // 고정폭 글자는 폭이 글꼴 크기의 0.6 안팎이다 — 가장 긴 줄이 캔버스에 들게 줄인다
  const sqlPx = Math.min(parseFloat(fontSizes.sm), (PIECE_CANVAS_W - 2 * MARGIN) / (longest * 0.6));
  const sqlLine = sqlPx * 1.5;
  const sqlTop = 18;
  const headerY = sqlTop + base.sql.length * sqlLine + 18;
  const headH = parseFloat(fontSizes.md) * 1.9;
  const bodyTop = headerY + headH;
  const slots = base.rows.length + base.preceding + base.following;
  const rowH = Math.min(ROW_MAX, (H - FOOT - bodyTop) / Math.max(1, slots));
  return {
    tableX,
    tableW,
    colW: tableW / (base.columns.length + 1),
    sqlPx,
    sqlLine,
    headerY,
    bodyTop,
    rowH,
  };
}

/** 줄 i 의 윗변 y. 표 위쪽에 틀이 나갈 자리(p 줄)를 비워 둔다. */
function rowTop(g: Geometry, scene: WindowSlidesScene, i: number): number {
  return g.bodyTop + (scene.base.preceding + i) * g.rowH;
}

type Handles = {
  /** 틀과 함께 미끄러지는 것들 */
  sliders: SVGGElement[];
  /** 잘린 틀을 윗변이 dy 비껴 있는 자리에 맞춘다 */
  fitSolid: (dy: number) => void;
  /** 이번 걸음의 near 글자 — 복사본이 다 모인 뒤에 선다 */
  nearNow: SVGTextElement | null;
  /** 틀 안 amount 글자 — 틀이 닿은 뒤에 물든다 */
  inside: SVGTextElement[];
  overlay: SVGGElement;
};

export const windowSlidesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tween(ms: number, mine: number, frame: (u: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        const start = performance.now();
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
          const u = Math.min(1, (performance.now() - start) / ms);
          frame(ease(u));
          if (u >= 1) {
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

    function caption(scene: WindowSlidesScene): string {
      const { base, step } = scene;
      if (step.kind === 'start') {
        return t('caption.start', 'Before the query runs, the near column is empty.');
      }
      const dayOf = (i: number): number => {
        const r = base.rows[i];
        if (r === undefined) throw new Error(`window-slides: 없는 줄 ${i}`);
        const v = r[base.orderAt];
        if (v === undefined) throw new Error(`window-slides: ${i} 번 줄에 차례 칸이 없다`);
        return v;
      };
      const sum = scene.near[step.row];
      if (sum === null || sum === undefined) throw new Error(`window-slides: ${step.row} 번 줄의 near 가 없다`);
      const vars = { day: dayOf(step.row), from: dayOf(step.lo), to: dayOf(step.hi), sum };
      return step.cut
        ? t('caption.edge', 'day {day}: the frame runs past the table · inside: day {from}–{to} · sum {sum}', vars)
        : t('caption.frame', 'day {day}: the frame holds day {from}–{to} · sum {sum}', vars);
    }

    function drawStatic(scene: WindowSlidesScene): Handles {
      svg.textContent = '';
      const { base, step } = scene;
      const g = geometry(scene);
      const bodyH = base.rows.length * g.rowH;
      const bodyTopY = rowTop(g, scene, 0);
      const cols = [...base.columns, base.alias];
      const nearCol = cols.length - 1;
      const cx = (c: number): number => g.tableX + (c + 0.5) * g.colW;
      const cy = (i: number): number => rowTop(g, scene, i) + g.rowH / 2;
      const valuePx = Math.min(parseFloat(fontSizes.lg), g.rowH * 0.5);

      // SQL
      const sqlG = make('g', {}, svg);
      base.sql.forEach((line, i) => {
        const node = make(
          'text',
          {
            x: g.tableX,
            y: 18 + (i + 0.75) * g.sqlLine,
            'font-family': fonts.mono,
            'font-size': g.sqlPx,
            fill: colors.text,
          },
          sqlG,
        );
        node.setAttribute('xml:space', 'preserve');
        node.textContent = line;
      });

      // 머리줄
      cols.forEach((name, c) => {
        const node = make(
          'text',
          {
            x: cx(c),
            y: g.bodyTop - parseFloat(fontSizes.md) * 0.6,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': c === nearCol ? 700 : 400,
            fill: c === nearCol ? colors.text : colors.textMuted,
          },
          svg,
        );
        node.textContent = name;
      });

      // 표 몸 — 틀이 나갈 위아래 자리는 비워 둔다
      make(
        'rect',
        {
          x: g.tableX,
          y: bodyTopY,
          width: g.tableW,
          height: bodyH,
          fill: colors.bgSubtle,
          stroke: colors.border,
        },
        svg,
      );
      for (let i = 1; i < base.rows.length; i += 1) {
        const y = rowTop(g, scene, i);
        make('line', { x1: g.tableX, x2: g.tableX + g.tableW, y1: y, y2: y, stroke: colors.border }, svg);
      }
      make(
        'line',
        {
          x1: g.tableX + nearCol * g.colW,
          x2: g.tableX + nearCol * g.colW,
          y1: bodyTopY,
          y2: bodyTopY + bodyH,
          stroke: colors.border,
        },
        svg,
      );

      // 틀 — 실선과 바탕은 표 안쪽으로 잘린다
      const sliders: SVGGElement[] = [];
      let fitSolid: (dy: number) => void = () => undefined;
      const framing = step.kind === 'frame';
      if (framing) {
        const span = (base.preceding + base.following + 1) * g.rowH;
        const top = rowTop(g, scene, step.row - base.preceding);
        const pad = 6;

        // 표 안쪽으로 잘린 틀 — 틀의 윗변이 dy 만큼 비껴 있을 때의 자리
        const solid = make('rect', {
          x: g.tableX - pad,
          width: g.tableW + 2 * pad,
          fill: colors.primary,
          'fill-opacity': 0.07,
          stroke: colors.primary,
          'stroke-width': 2.5,
          rx: 6,
        }, svg);
        fitSolid = (dy: number): void => {
          const y0 = Math.max(bodyTopY, top + dy);
          const y1 = Math.min(bodyTopY + bodyH, top + dy + span);
          solid.setAttribute('y', fmt(y0));
          solid.setAttribute('height', fmt(Math.max(0, y1 - y0)));
        };
        fitSolid(0);
        const outline = make('g', {}, svg);
        make(
          'rect',
          {
            x: g.tableX - pad,
            y: top,
            width: g.tableW + 2 * pad,
            height: span,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 4',
            rx: 6,
          },
          outline,
        );
        // 틀이 머무는 줄을 가리키는 쐐기
        const py = cy(step.row);
        const px = g.tableX - pad - 6;
        make(
          'path',
          { d: `M ${fmt(px - 10)} ${fmt(py - 7)} L ${fmt(px)} ${fmt(py)} L ${fmt(px - 10)} ${fmt(py + 7)} Z`, fill: colors.itemActive },
          outline,
        );
        sliders.push(outline);
      }

      // 칸
      let nearNow: SVGTextElement | null = null;
      const inside: SVGTextElement[] = [];
      base.rows.forEach((r, i) => {
        const within = framing && i >= step.lo && i <= step.hi;
        r.forEach((v, c) => {
          const lit = within && c === base.sumAt;
          const node = make(
            'text',
            {
              x: cx(c),
              y: cy(i),
              'dominant-baseline': 'central',
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': valuePx,
              'font-weight': lit ? 700 : 400,
              fill: lit ? colors.itemComparing : colors.text,
            },
            svg,
          );
          node.textContent = String(v);
          if (lit) inside.push(node);
        });
        const near = scene.near[i];
        const here = framing && i === step.row;
        if (here) {
          make(
            'rect',
            {
              x: g.tableX + nearCol * g.colW + 6,
              y: rowTop(g, scene, i) + 4,
              width: g.colW - 12,
              height: g.rowH - 8,
              fill: 'none',
              stroke: colors.itemActive,
              'stroke-width': 2,
              rx: 4,
            },
            svg,
          );
        }
        if (near === null || near === undefined) {
          // 아직 셈하지 않은 칸 — 비어 있음을 빈 자리로 보인다
          make(
            'rect',
            {
              x: cx(nearCol) - g.colW * 0.18,
              y: cy(i) - g.rowH * 0.22,
              width: g.colW * 0.36,
              height: g.rowH * 0.44,
              fill: 'none',
              stroke: colors.border,
              'stroke-dasharray': '3 3',
              rx: 3,
            },
            svg,
          );
          return;
        }
        const node = make(
          'text',
          {
            x: cx(nearCol),
            y: cy(i),
            'dominant-baseline': 'central',
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': valuePx,
            'font-weight': 700,
            fill: here ? colors.itemActive : colors.text,
          },
          svg,
        );
        node.textContent = String(near);
        if (here) nearNow = node;
      });

      // 캡션 · 줄 수
      const cap = make(
        'text',
        {
          x: PIECE_CANVAS_W / 2,
          y: H - 36,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        svg,
      );
      cap.textContent = caption(scene);
      const count = make(
        'text',
        {
          x: PIECE_CANVAS_W / 2,
          y: H - 14,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        svg,
      );
      count.textContent = t('label.rows', 'Rows: {n}', { n: base.rows.length });

      const overlay = make('g', {}, svg);
      return { sliders, fitSolid, nearNow, inside, overlay };
    }

    async function play(scene: WindowSlidesScene, mine: number): Promise<void> {
      const { base, step } = scene;
      if (step.kind !== 'frame') return;
      const handles = drawStatic(scene);
      const g = geometry(scene);
      const nearCol = base.columns.length;
      const cx = (c: number): number => g.tableX + (c + 0.5) * g.colW;
      const cy = (i: number): number => rowTop(g, scene, i) + g.rowH / 2;

      // 아직 못 온 만큼으로 세운다 — 틀은 떠나온 줄에, 합은 아직 없다
      const from = step.from;
      const entering = from === null;
      const dy = from === null ? -g.rowH : (from - step.row) * g.rowH;
      const place = (u: number): void => {
        handles.fitSolid(dy * (1 - u));
        for (const s of handles.sliders) {
          s.setAttribute('transform', `translate(0 ${fmt(dy * (1 - u))})`);
          if (entering) s.setAttribute('opacity', fmt(u));
        }
      };
      place(0);
      handles.nearNow?.setAttribute('opacity', '0');
      for (const node of handles.inside) {
        node.setAttribute('fill', colors.text);
        node.setAttribute('font-weight', '400');
      }

      if (!(await tween(SLIDE_MS, mine, place))) return;
      for (const node of handles.inside) {
        node.setAttribute('fill', colors.itemComparing);
        node.setAttribute('font-weight', '700');
      }

      // 틀 안 amount 의 복사본이 이 줄의 near 칸으로 모인다 — 원래 값은 제자리에 남는다
      const valuePx = Math.min(parseFloat(fontSizes.lg), g.rowH * 0.5);
      const copies: Array<{ node: SVGTextElement; x0: number; y0: number }> = [];
      for (let k = step.lo; k <= step.hi; k += 1) {
        const r = base.rows[k];
        const v = r?.[base.sumAt];
        if (v === undefined) throw new Error(`window-slides: ${k} 번 줄에 더할 칸이 없다`);
        const node = make(
          'text',
          {
            x: cx(base.sumAt),
            y: cy(k),
            'dominant-baseline': 'central',
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': valuePx,
            'font-weight': 700,
            fill: colors.itemComparing,
          },
          handles.overlay,
        );
        node.textContent = String(v);
        copies.push({ node, x0: cx(base.sumAt), y0: cy(k) });
      }
      const x1 = cx(nearCol);
      const y1 = cy(step.row);
      const gathered = await tween(GATHER_MS, mine, (u) => {
        for (const c of copies) {
          const x = c.x0 + (x1 - c.x0) * u;
          const y = c.y0 + (y1 - c.y0) * u - Math.sin(Math.PI * u) * g.rowH * LIFT;
          c.node.setAttribute('x', fmt(x));
          c.node.setAttribute('y', fmt(y));
          c.node.setAttribute('opacity', fmt(1 - 0.6 * u));
        }
        handles.nearNow?.setAttribute('opacity', fmt(u > 0.85 ? (u - 0.85) / 0.15 : 0));
      });
      if (!gathered) return;
      drawStatic(scene);
    }

    return {
      render(next: WindowSlidesScene, _prev: WindowSlidesScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step.kind !== 'frame') {
          drawStatic(next);
          return;
        }
        return play(next, mine);
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
