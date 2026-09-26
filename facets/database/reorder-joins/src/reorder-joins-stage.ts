/**
 * reorder-joins 무대.
 *
 * 왼쪽에 바탕 표, 오른쪽에 차례마다 두 칸(중간 결과 · 끝 결과). 조인이 만든 줄은 왼쪽 몫의 줄 자리에서
 * 떠나 제 칸으로 옮겨 앉는다 — 한 차례에서는 다섯 줄이 스무 줄로 부풀어 칸이 길게 쌓이고, 다음 조인에서
 * 두 줄만 끝 칸으로 건너가며 나머지는 흐려진다. 만든 줄은 칸에 남는다 (견줄 짝을 지우지 않는다).
 *
 * 정적 그리기가 정본이다. 운동은 "아직 못 온 만큼" 만 그리고, 끝나면 정적 그리기를 한 번 더 한다.
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
} from '@ffacet/core/runtime';
import type { ReorderJoinsScene, SceneLane } from './scene.js';

const H = 570;
const NS = 'http://www.w3.org/2000/svg';
const PAD = 10;
const LANE_GAP = 18;
const ROW_H_MAX = 18;
const JOIN_MS = 950;
const TRAVEL_MS = 500;
const BAR_MS = 700;

type Pt = { x: number; y: number };

type Layout = {
  cw: number;
  rowH: number;
  sqlTop: number;
  titleY: number;
  headY1: number;
  headY2: number;
  rowsTop: number;
  rowsBottom: number;
  barY: number;
  captionY: number;
  /** 표 이름 → 칸 x 와 첫 줄의 칸 번호 · 머리글 y */
  tables: Map<string, { x: number; firstSlot: number; headY: number }>;
};

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return 1 - (1 - p) ** 3;
}

function laneX(layout: Layout, lane: number): number {
  return PAD + 2 * layout.cw + LANE_GAP + lane * (2 * layout.cw + LANE_GAP);
}

function computeLayout(scene: ReorderJoinsScene): Layout {
  const xs = parseFloat(fontSizes.xs);
  const cw = (PIECE_CANVAS_W - 2 * PAD - 2 * LANE_GAP) / 6;
  const lineH = xs * 1.35;
  const sqlTop = 8 + xs;
  const titleY = sqlTop + (scene.sql.length - 1) * lineH + 28;
  const headY1 = titleY + 18;
  const headY2 = headY1 + lineH;
  const rowsTop = headY2 + 10;
  const rowsBottom = H - 100;

  // 가장 긴 표가 첫 칸, 나머지는 둘째 칸에 차례로 쌓는다
  let longest = 0;
  scene.tables.forEach((tb, i) => {
    if (tb.rows.length > (scene.tables[longest]?.rows.length ?? -1)) longest = i;
  });
  let col1Slots = 0;
  const others = scene.tables.filter((_, i) => i !== longest);
  others.forEach((tb, i) => {
    col1Slots += tb.rows.length + (i > 0 ? 1 : 0);
  });
  let slots = Math.max(scene.tables[longest]?.rows.length ?? 0, col1Slots, 1);
  for (const l of scene.lanes) slots = Math.max(slots, l.mid?.length ?? 0, l.end?.length ?? 0);
  const rowH = Math.min(ROW_H_MAX, (rowsBottom - rowsTop) / slots);

  const tables = new Map<string, { x: number; firstSlot: number; headY: number }>();
  const first = scene.tables[longest];
  if (first) tables.set(first.name, { x: PAD, firstSlot: 0, headY: headY2 });
  let slot = 0;
  others.forEach((tb, i) => {
    if (i === 0) {
      tables.set(tb.name, { x: PAD + cw, firstSlot: 0, headY: headY2 });
    } else {
      const headY = rowsTop + slot * rowH + rowH * 0.7;
      slot += 1;
      tables.set(tb.name, { x: PAD + cw, firstSlot: slot, headY });
    }
    slot += tb.rows.length;
  });

  return {
    cw,
    rowH,
    sqlTop,
    titleY,
    headY1,
    headY2,
    rowsTop,
    rowsBottom,
    barY: rowsBottom + 26,
    captionY: H - 16,
    tables,
  };
}

function tableRowPos(layout: Layout, name: string, i: number): Pt {
  const place = layout.tables.get(name);
  if (!place) throw new Error(`reorder-joins 무대: 표 '${name}' 의 자리가 없다`);
  return { x: place.x, y: layout.rowsTop + (place.firstSlot + i) * layout.rowH };
}

function laneRowPos(layout: Layout, lane: number, col: 'mid' | 'end', i: number): Pt {
  const x = laneX(layout, lane) + (col === 'end' ? layout.cw : 0);
  return { x, y: layout.rowsTop + i * layout.rowH };
}

function laneTitle(t: Translate, lane: SceneLane): string {
  if (lane.id === 'students-first') return t('label.studentsFirst', 'Students first');
  if (lane.id === 'exams-first') return t('label.examsFirst', 'Exams first');
  throw new Error(`reorder-joins 무대: 모르는 차례 '${lane.id}'`);
}

export const reorderJoinsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const xs = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 운동이 만질 손잡이 — 정적 그리기가 매번 새로 채운다
    type Mover = { g: SVGGElement; dx: number; dy: number; delay: number };
    let movers: Mover[] = [];
    let fading: SVGGElement[] = [];
    let bars: { rect: SVGRectElement; w: number }[] = [];

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { size?: string; mono?: boolean; fill?: string; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.xs,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = str;
      return node;
    }

    type ChipLook = { stroke: string; strokeWidth: number; dashed: boolean; dim: boolean };
    const plain: ChipLook = { stroke: colors.border, strokeWidth: 1, dashed: false, dim: false };

    function chip(parent: Element, layout: Layout, at: Pt, str: string, look: ChipLook): SVGGElement {
      const g = el('g', {}, parent);
      const h = Math.max(4, layout.rowH - 3);
      el(
        'rect',
        {
          x: at.x + 4,
          y: at.y,
          width: layout.cw - 8,
          height: h,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: look.stroke,
          'stroke-width': look.strokeWidth,
          ...(look.dashed ? { 'stroke-dasharray': '3 2' } : {}),
        },
        g,
      );
      label(g, at.x + 9, at.y + h / 2 + xs * 0.36, str, {
        mono: true,
        fill: look.dim ? colors.textMuted : colors.text,
      });
      if (look.dim) g.setAttribute('opacity', '0.35');
      return g;
    }

    function caption(scene: ReorderJoinsScene): string {
      const step = scene.step;
      if (step.kind === 'start') return t('caption.start', 'Which pair of tables to join first?');
      if (step.kind === 'join') {
        const lane = scene.lanes[step.lane];
        if (!lane) throw new Error(`reorder-joins 무대: 차례 ${step.lane} 이 없다`);
        const mid = lane.mid;
        if (!mid) throw new Error('reorder-joins 무대: 중간 결과가 없다');
        if (step.stage === 1) {
          return t('caption.first', '{left} ⋈ {right} first. Intermediate rows: {n}', {
            left: lane.tables[0],
            right: lane.tables[1],
            n: mid.length,
          });
        }
        const end = lane.end;
        if (!end) throw new Error('reorder-joins 무대: 끝 결과가 없다');
        return t('caption.second', 'Then ⋈ {right}. Rows: {before} → {n}', {
          right: lane.tables[2],
          before: mid.length,
          n: end.length,
        });
      }
      const [a, b] = scene.lanes;
      if (!a || !b || a.made === null || b.made === null || !scene.answer) {
        throw new Error('reorder-joins 무대: 견줄 차례 둘의 만든 줄이 없다');
      }
      return t('caption.compare', 'Answer in both orders: {names}. Rows made: {a} · {b}', {
        names: scene.answer.join(', '),
        a: a.made,
        b: b.made,
      });
    }

    function drawStatic(scene: ReorderJoinsScene): void {
      svg.textContent = '';
      movers = [];
      fading = [];
      bars = [];
      const layout = computeLayout(scene);
      const step = scene.step;
      const cw = layout.cw;

      // SQL — 자료 그대로
      scene.sql.forEach((line, i) => {
        label(svg, PAD, layout.sqlTop + i * xs * 1.35, line, { mono: true });
      });

      // 이번 조인이 쓴 줄 (왼쪽 몫 · 오른쪽 표)
      const fedTable = new Map<string, Set<number>>();
      let fedMid: { lane: number; rows: Set<number> } | null = null;
      if (step.kind === 'join') {
        const lane = scene.lanes[step.lane];
        if (!lane) throw new Error(`reorder-joins 무대: 차례 ${step.lane} 이 없다`);
        const made = step.stage === 1 ? lane.mid : lane.end;
        if (!made) throw new Error('reorder-joins 무대: 이번 조인의 결과가 없다');
        const rightName = step.stage === 1 ? lane.tables[1] : lane.tables[2];
        fedTable.set(rightName, new Set(made.map((r) => r.with)));
        if (step.stage === 1) fedTable.set(lane.tables[0], new Set(made.map((r) => r.from)));
        else fedMid = { lane: step.lane, rows: new Set(made.map((r) => r.from)) };
      }
      const fedLook: ChipLook = { stroke: colors.itemComparing, strokeWidth: 1.5, dashed: false, dim: false };
      const newLook: ChipLook = { stroke: colors.itemActive, strokeWidth: 2, dashed: false, dim: false };
      const answerLook: ChipLook = { stroke: colors.accent, strokeWidth: 2.5, dashed: false, dim: false };
      const droppedLook: ChipLook = { stroke: colors.border, strokeWidth: 1, dashed: true, dim: true };

      // 바탕 표
      label(svg, PAD, layout.titleY, t('label.tables', 'Tables'), {
        size: fontSizes.sm,
        weight: 'bold',
      });
      for (const tb of scene.tables) {
        const place = layout.tables.get(tb.name);
        if (!place) throw new Error(`reorder-joins 무대: 표 '${tb.name}' 의 자리가 없다`);
        label(svg, place.x + cw / 2, place.headY, tb.name, { mono: true, fill: colors.textMuted, anchor: 'middle' });
        const fed = fedTable.get(tb.name);
        tb.rows.forEach((row, i) => {
          chip(svg, layout, tableRowPos(layout, tb.name, i), row.join(' '), fed?.has(i) ? fedLook : plain);
        });
      }

      // 차례마다 두 칸
      const maxMade = Math.max(1, ...scene.lanes.map((l) => l.made ?? 0));
      scene.lanes.forEach((lane, li) => {
        const x0 = laneX(layout, li);
        el(
          'line',
          {
            x1: x0 - LANE_GAP / 2,
            y1: layout.titleY - 14,
            x2: x0 - LANE_GAP / 2,
            y2: layout.rowsBottom + 20,
            stroke: colors.border,
            'stroke-width': 1,
          },
          svg,
        );
        label(svg, x0 + cw, layout.titleY, laneTitle(t, lane), {
          size: fontSizes.sm,
          weight: 'bold',
          anchor: 'middle',
        });
        label(svg, x0 + cw / 2, layout.headY1, lane.tables[0], { mono: true, fill: colors.textMuted, anchor: 'middle' });
        label(svg, x0 + cw / 2, layout.headY2, `⋈ ${lane.tables[1]}`, { mono: true, fill: colors.textMuted, anchor: 'middle' });
        label(svg, x0 + cw + cw / 2, layout.headY2, `⋈ ${lane.tables[2]}`, {
          mono: true,
          fill: colors.textMuted,
          anchor: 'middle',
        });

        const isNow = step.kind === 'join' && step.lane === li;
        const survived = lane.end ? new Set(lane.end.map((r) => r.from)) : null;
        const n = lane.mid?.length ?? 0;

        lane.mid?.forEach((row, i) => {
          const at = laneRowPos(layout, li, 'mid', i);
          let look = plain;
          if (survived && !survived.has(i)) look = droppedLook;
          else if (isNow && step.kind === 'join' && step.stage === 1) look = newLook;
          else if (fedMid && fedMid.lane === li && fedMid.rows.has(i)) look = fedLook;
          const g = chip(svg, layout, at, row.values.join(' '), look);
          if (isNow && step.kind === 'join' && step.stage === 1) {
            const from = tableRowPos(layout, lane.tables[0], row.from);
            movers.push({ g, dx: from.x - at.x, dy: from.y - at.y, delay: n > 1 ? (i / (n - 1)) * (JOIN_MS - TRAVEL_MS) : 0 });
          }
          if (isNow && step.kind === 'join' && step.stage === 2 && look === droppedLook) fading.push(g);
        });

        const m = lane.end?.length ?? 0;
        lane.end?.forEach((row, i) => {
          const at = laneRowPos(layout, li, 'end', i);
          let look = plain;
          if (scene.answer) look = answerLook;
          else if (isNow && step.kind === 'join' && step.stage === 2) look = newLook;
          const g = chip(svg, layout, at, row.values.join(' '), look);
          if (isNow && step.kind === 'join' && step.stage === 2) {
            const from = laneRowPos(layout, li, 'mid', row.from);
            movers.push({ g, dx: from.x - at.x, dy: from.y - at.y, delay: m > 1 ? (i / (m - 1)) * (JOIN_MS - TRAVEL_MS) : 0 });
          }
        });

        const footY = layout.rowsBottom + 12;
        if (lane.mid) {
          label(svg, x0 + cw / 2, footY, t('label.rows', 'Rows: {n}', { n: lane.mid.length }), {
            fill: colors.textMuted,
            anchor: 'middle',
          });
        }
        if (lane.end) {
          label(svg, x0 + cw + cw / 2, footY, t('label.rows', 'Rows: {n}', { n: lane.end.length }), {
            fill: colors.textMuted,
            anchor: 'middle',
          });
        }

        if (lane.made !== null) {
          const w = (lane.made / maxMade) * (2 * cw - 8);
          const rect = el(
            'rect',
            { x: x0 + 4, y: layout.barY, width: w, height: 8, rx: 2, fill: colors.primary },
            svg,
          );
          bars.push({ rect, w });
          label(svg, x0 + 4, layout.barY + 24, t('label.made', 'Rows made: {n}', { n: lane.made }), {
            size: fontSizes.sm,
          });
        }
      });

      label(svg, PAD, layout.captionY, caption(scene), { size: fontSizes.md });
    }

    function tween(mine: number, ms: number, frame: (elapsed: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
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
          const elapsed = Math.min(ms, Date.now() - start);
          frame(elapsed);
          if (elapsed >= ms) {
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

    async function render(next: ReorderJoinsScene, _prev: ReorderJoinsScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate) return;

      if (next.step.kind === 'join' && movers.length > 0) {
        const ms = movers.reduce((mx, m) => Math.max(mx, m.delay + TRAVEL_MS), 0);
        const mv = movers;
        const fd = fading;
        await tween(mine, ms, (elapsed) => {
          for (const m of mv) {
            const p = ease(Math.max(0, Math.min(1, (elapsed - m.delay) / TRAVEL_MS)));
            if (p >= 1) m.g.removeAttribute('transform');
            else m.g.setAttribute('transform', `translate(${round(m.dx * (1 - p))} ${round(m.dy * (1 - p))})`);
          }
          const q = ease(elapsed / ms);
          for (const g of fd) g.setAttribute('opacity', String(round(1 - 0.65 * q)));
        });
      } else if (next.step.kind === 'compare' && bars.length > 0) {
        const bs = bars;
        await tween(mine, BAR_MS, (elapsed) => {
          const p = ease(elapsed / BAR_MS);
          for (const b of bs) b.rect.setAttribute('width', String(round(b.w * p)));
        });
      }
      if (mine === gen && !destroyed) drawStatic(next);
    }

    return {
      render,
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
  },
};
