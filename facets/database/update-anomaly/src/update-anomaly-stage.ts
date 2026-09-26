/**
 * update-anomaly 무대 — 한 사실의 사본 셋이 한 점으로 모였다가, 한 줄만 고친 뒤 두 갈래로 갈라진다.
 *
 * 왼쪽은 표, 오른쪽은 물음이 닿는 자리다. 사본 줄마다 실이 한 점(물음)으로 모인다. 고치기는 SQL 줄의
 * 새 값이 떨어져 WHERE 에 맞는 줄 하나에만 내려앉는다. 물음을 던지면 한 점이 답 둘로 갈라져 위아래로
 * 벌어지고, 실은 제 값을 따라간다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { UpdateAnomalyScene } from './scene.js';

const H = 300;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const CODE_Y = 26;
const HEAD_TOP = 48;
const HEAD_H = 28;
const ROWS_BOTTOM = 250;
const ROW_H_MAX = 36;
const CAPTION_Y = H - 18;
/** 표가 차지하는 가로 몫. 나머지는 물음이 닿는 자리. */
const TABLE_SHARE = 0.6;
/** 물음 자리 안에서 점(갈림목)이 서는 곳 — 자리 폭에 대한 몫. */
const FORK_SHARE = 0.36;
const CELL_PAD = 10;
const PILL_H = 24;
/** 답 알약 사이 세로 간격 (중심 사이). */
const ANSWER_GAP = 58;
const DOT_R = 5;

const GROW_MS = 600;
const DROP_MS = 750;
const SPLIT_MS = 650;

const CODE_PX = parseFloat(fontSizes.sm);
/** 고정폭 글자의 폭 — 글꼴 크기에 대한 몫. */
const MONO_RATIO = 0.6;
const CHAR_W = CODE_PX * MONO_RATIO;

type Motion =
  | { readonly kind: 'grow'; readonly p: number }
  | { readonly kind: 'drop'; readonly p: number }
  | { readonly kind: 'split'; readonly p: number };

type Layout = {
  readonly colX: readonly number[];
  readonly colW: readonly number[];
  readonly tableRight: number;
  readonly rowH: number;
  readonly rowsTop: number;
  readonly dotX: number;
  readonly pillW: number;
};

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function layoutOf(scene: UpdateAnomalyScene): Layout {
  const tableRight = W * TABLE_SHARE;
  const tableW = tableRight - PAD;
  const setAt = scene.columns.indexOf(scene.update.set);
  const need = scene.columns.map((name, j) => {
    let n = name.length;
    for (const r of scene.initialRows) n = Math.max(n, (r[j] as string).length);
    if (j === setAt) n = Math.max(n, scene.update.value.length);
    return n * CHAR_W + CELL_PAD * 2;
  });
  const total = need.reduce((s, v) => s + v, 0);
  const colW = need.map((v) => (v / total) * tableW);
  const colX: number[] = [];
  let x = PAD;
  for (const w of colW) {
    colX.push(x);
    x += w;
  }
  const rowsTop = HEAD_TOP + HEAD_H;
  const rowH = Math.min(ROW_H_MAX, (ROWS_BOTTOM - rowsTop) / scene.rows.length);
  const askAt = scene.columns.indexOf(scene.ask.column);
  let longest = scene.update.value.length;
  for (const r of scene.initialRows) longest = Math.max(longest, (r[askAt] as string).length);
  const pillW = longest * CHAR_W + CELL_PAD * 2;
  const dotX = tableRight + (W - PAD - tableRight) * FORK_SHARE;
  return { colX, colW, tableRight, rowH, rowsTop, dotX, pillW };
}

function rowCy(l: Layout, i: number): number {
  return l.rowsTop + l.rowH * i + l.rowH / 2;
}

export const updateAnomalyStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      }
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function thread(parent: Element, x0: number, y0: number, x1: number, y1: number, color: string): void {
      const mx = r2((x0 + x1) / 2);
      el(parent, 'path', {
        d: `M ${r2(x0)} ${r2(y0)} C ${mx} ${r2(y0)}, ${mx} ${r2(y1)}, ${r2(x1)} ${r2(y1)}`,
        fill: 'none',
        stroke: color,
        'stroke-width': 1.5,
      });
    }

    function pill(parent: Element, x: number, cy: number, w: number, value: string, color: string): void {
      el(parent, 'rect', {
        x,
        y: cy - PILL_H / 2,
        width: w,
        height: PILL_H,
        rx: PILL_H / 2,
        fill: c.bg,
        stroke: color,
        'stroke-width': 1.5,
      });
      el(
        parent,
        'text',
        {
          x: x + w / 2,
          y: cy,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.text,
        },
        value,
      );
    }

    /** SQL 줄의 세 토막 — 새 값 앞, 새 값, 뒤. 코드 글자라 번역하지 않는다. */
    function sqlParts(s: UpdateAnomalyScene): readonly [string, string, string] {
      const u = s.update;
      return [
        ['UPDATE', s.table, 'SET', u.set, '= '].join(' '),
        ["'", u.value, "'"].join(''),
        [' WHERE', u.where, '=', ["'", u.equals, "'"].join('')].join(' '),
      ];
    }

    function captionOf(s: UpdateAnomalyScene): string {
      switch (s.step.kind) {
        case 'table':
          return t('caption.table', 'Table {table}. Rows: {n}.', { table: s.table, n: s.rows.length });
        case 'copies':
          return t('caption.copies', 'Copies of {column} for {member}: {n}.', {
            column: s.ask.column,
            member: s.ask.equals,
            n: s.copies ? s.copies.length : 0,
          });
        case 'update':
          return t('caption.update', 'Rows changed: {hit}. Copies still holding the old value: {stale}.', {
            hit: s.updated ? s.updated.length : 0,
            stale: s.stale ? s.stale.length : 0,
          });
        case 'ask':
          return t('caption.ask', 'Asking for {column} of {member}. Distinct answers: {n}.', {
            column: s.ask.column,
            member: s.ask.equals,
            n: s.answers ? s.answers.length : 0,
          });
      }
    }

    /** 장면 하나의 화면 전체. `m` 이 있으면 그 운동이 아직 못 온 만큼으로 그린다. */
    function draw(s: UpdateAnomalyScene, m: Motion | null): void {
      svg.textContent = '';
      const l = layoutOf(s);
      const root = el(svg, 'g', {});
      const keyAt = s.columns.indexOf(s.key);
      const askAt = s.columns.indexOf(s.ask.column);
      const setAt = s.columns.indexOf(s.update.set);
      const whereAt = s.columns.indexOf(s.update.where);
      const copies = s.copies ?? [];
      const updated = s.updated ?? [];
      const tableW = l.tableRight - PAD;
      const dropStep = s.step.kind === 'update' ? s.step : null;
      const dropping = m !== null && m.kind === 'drop' && dropStep !== null;

      // SQL 줄 — 고치기가 온 뒤로.
      const parts = sqlParts(s);
      if (s.updated !== null) {
        const code = el(root, 'text', {
          x: PAD,
          y: CODE_Y,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.text,
          'xml:space': 'preserve',
        });
        el(code, 'tspan', {}, parts[0]);
        el(code, 'tspan', { fill: c.accent, 'font-weight': 600 }, parts[1]);
        el(code, 'tspan', {}, parts[2]);
      }

      // 머리줄.
      el(root, 'rect', { x: PAD, y: HEAD_TOP, width: tableW, height: HEAD_H, fill: c.bgSubtle });
      s.columns.forEach((name, j) => {
        const x = (l.colX[j] as number) + CELL_PAD;
        el(
          root,
          'text',
          {
            x,
            y: HEAD_TOP + HEAD_H / 2,
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          },
          name,
        );
        if (j === keyAt) {
          el(root, 'line', {
            x1: x,
            x2: x + name.length * CHAR_W,
            y1: HEAD_TOP + HEAD_H - 6,
            y2: HEAD_TOP + HEAD_H - 6,
            stroke: c.textMuted,
            'stroke-width': 1,
          });
        }
      });

      // 줄.
      s.rows.forEach((row, i) => {
        const top = l.rowsTop + l.rowH * i;
        const isCopy = copies.includes(i);
        const isHit = updated.includes(i);
        if (isCopy) {
          el(root, 'rect', {
            x: PAD,
            y: top,
            width: tableW,
            height: l.rowH,
            fill: isHit ? c.accent : c.primary,
            'fill-opacity': 0.1,
          });
        }
        el(root, 'line', {
          x1: PAD,
          x2: l.tableRight,
          y1: top + l.rowH,
          y2: top + l.rowH,
          stroke: c.border,
          'stroke-width': 1,
        });
        const quiet = s.copies !== null && !isCopy;
        row.forEach((cell, j) => {
          const cx = l.colX[j] as number;
          const cw = l.colW[j] as number;
          const cy = top + l.rowH / 2;
          const landing = dropping && isHit && j === setAt;
          if (!landing) {
            el(
              root,
              'text',
              {
                x: cx + CELL_PAD,
                y: cy,
                'dominant-baseline': 'central',
                'font-family': fonts.mono,
                'font-size': fontSizes.sm,
                fill: quiet ? c.textMuted : c.text,
              },
              cell,
            );
          }
          const box = (color: string, dash: boolean): void => {
            el(root, 'rect', {
              x: cx + 3,
              y: top + 4,
              width: cw - 6,
              height: l.rowH - 8,
              rx: 4,
              fill: 'none',
              stroke: color,
              'stroke-width': 1.5,
              ...(dash ? { 'stroke-dasharray': '4 3' } : {}),
            });
          };
          if (isHit && j === setAt) box(c.accent, false);
          else if (isHit && j === whereAt) box(c.accent, true);
          else if (isCopy && j === askAt) box(c.primary, false);
        });
      });
      el(root, 'line', {
        x1: PAD,
        x2: l.tableRight,
        y1: l.rowsTop,
        y2: l.rowsTop,
        stroke: c.border,
        'stroke-width': 1,
      });

      // 고치기가 내려앉는 중 — 옛 값이 빠지고 새 값이 SQL 줄에서 떨어진다.
      if (dropping && m !== null && dropStep !== null) {
        const p = m.p;
        dropStep.rows.forEach((i, k) => {
          const cx = l.colX[setAt] as number;
          const cy = rowCy(l, i);
          const was = dropStep.was[k] as string;
          const out = Math.min(1, p * 2);
          el(
            root,
            'text',
            {
              x: cx + CELL_PAD,
              y: cy + out * l.rowH * 0.4,
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: c.textMuted,
              opacity: 1 - out,
            },
            was,
          );
          const valW = parts[1].length * CHAR_W;
          const fromX = PAD + parts[0].length * CHAR_W + valW / 2;
          const toX = cx + CELL_PAD + valW / 2;
          const chipW = valW + CELL_PAD;
          const x = lerp(fromX, toX, p) - chipW / 2;
          const y = lerp(CODE_Y, cy, p);
          el(root, 'rect', {
            x,
            y: y - PILL_H / 2 + 2,
            width: chipW,
            height: PILL_H - 4,
            rx: 4,
            fill: c.bg,
            stroke: c.accent,
            'stroke-width': 1.5,
          });
          el(
            root,
            'text',
            {
              x: x + chipW / 2,
              y,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: c.text,
            },
            parts[1],
          );
        });
      }

      // 물음 자리 — 사본 줄의 실이 한 점으로 모이거나, 답으로 갈라진다.
      if (s.copies !== null) {
        const ys = s.copies.map((i) => rowCy(l, i));
        const factY = ys.reduce((a, b) => a + b, 0) / ys.length;
        const splitP = m !== null && m.kind === 'split' ? m.p : 1;
        const growP = m !== null && m.kind === 'grow' ? m.p : 1;
        const colorOf = (i: number): string => (updated.includes(i) ? c.accent : c.primary);
        if (s.answers === null) {
          for (const i of s.copies) {
            const y0 = rowCy(l, i);
            thread(root, l.tableRight, y0, lerp(l.tableRight, l.dotX, growP), lerp(y0, factY, growP), colorOf(i));
          }
          el(root, 'circle', { cx: l.dotX, cy: factY, r: DOT_R * growP, fill: c.text });
        } else {
          const n = s.answers.length;
          s.answers.forEach((a, k) => {
            const target = factY + (k - (n - 1) / 2) * ANSWER_GAP;
            const y = lerp(factY, target, splitP);
            const color = a.rows.every((i) => updated.includes(i)) ? c.accent : c.primary;
            for (const i of a.rows) thread(root, l.tableRight, rowCy(l, i), l.dotX, y, colorOf(i));
            pill(root, l.dotX, y, l.pillW, a.value, color);
          });
          if (splitP < 1) {
            el(root, 'circle', { cx: l.dotX, cy: factY, r: DOT_R * (1 - splitP), fill: c.text });
          }
        }
        const labelX = s.answers === null ? l.dotX + DOT_R + 8 : l.dotX + CELL_PAD;
        el(
          root,
          'text',
          {
            x: labelX,
            y: factY,
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
            opacity: s.answers === null ? growP : splitP,
          },
          t('label.fact', '{member} · {column}', { member: s.ask.equals, column: s.ask.column }),
        );
      }

      el(
        root,
        'text',
        {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        },
        captionOf(s),
      );
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish();
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

    async function render(
      next: UpdateAnomalyScene,
      prev: UpdateAnomalyScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const kind = next.step.kind;
      const moving =
        opts.animate &&
        prev !== null &&
        ((kind === 'copies' && prev.copies === null) ||
          (kind === 'update' && prev.updated === null) ||
          (kind === 'ask' && prev.answers === null));
      if (!moving) {
        draw(next, null);
        return;
      }
      const motionKind = kind === 'copies' ? 'grow' : kind === 'update' ? 'drop' : 'split';
      const ms = motionKind === 'grow' ? GROW_MS : motionKind === 'drop' ? DROP_MS : SPLIT_MS;
      await tween(ms, mine, (p) => draw(next, { kind: motionKind, p }));
      if (destroyed || mine !== gen) return;
      draw(next, null);
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
