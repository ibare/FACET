/**
 * 같은 답, 다른 길 — 그림.
 *
 * 동사는 "갈라졌다가 포개진다". SQL 한 문장에서 두 길이 갈라져 내려가고, 길마다 줄이 연산 상자에서
 * 흘러나와 제자리로 내려온다. 끝에서 두 길의 답의 줄이 가운데로 미끄러져 서로 포개진다.
 * 길마다의 검사 수는 제 길에 남는다 — 포개지지 않는 것이 그것뿐이다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { Cell, LaneScene, SameAnswerDifferentPlanScene } from './scene.js';

const H = 470;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 글자 한 칸 폭을 글꼴 크기에서 짐작하는 비율 (고정폭) */
const MONO_RATIO = 0.6;
/** 운동 한 걸음의 상한 (ms) */
const MOVE_MS = 520;
const STAGGER_MS = 50;
const OVERLAY_STAGGER_MS = 190;

// 세로 자리 — 위에서 아래로
const SQL_TOP = 22;
const SQL_LINE = 18;
const FORK_TOP = 70;
const FORK_BOTTOM = 102;
const LANE_TITLE_Y = 118;
const NODE1_Y = 146;
const NODE_H = 26;
const MIDDLE_TOP = 184;
const MIDDLE_SLOTS = 4;
const MIDDLE_BOTTOM = 280;
const NODE2_Y = 300;
const ANSWER_TOP = 340;
const ANSWER_BOTTOM = 412;
const TOTAL_Y = 432;
const CAPTION_Y = 458;

const MARGIN = 16;
const LANE_GAP = 20;

type Mover = { el: SVGGElement; dx: number; dy: number; delay: number };
type Grower = { el: SVGLineElement; x1: number; x2: number; delay: number };

function round(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function laneX0(i: number): number {
  const w = laneWidth();
  return MARGIN + i * (w + LANE_GAP);
}

function laneWidth(): number {
  return (PIECE_CANVAS_W - MARGIN * 2 - LANE_GAP) / 2;
}

function laneCx(i: number): number {
  return laneX0(i) + laneWidth() / 2;
}

function rowText(cells: Cell[]): string {
  return cells.map((c) => String(c)).join('  ');
}

/** 가운데 줄의 자리 — 세로 칸 넷씩 채우고 넘치면 옆 열로 */
function middleSlots(lane: number, rows: { cells: Cell[] }[], charW: number): { x: number; y: number; w: number; h: number }[] {
  const n = rows.length;
  if (n === 0) return [];
  const cols = Math.ceil(n / MIDDLE_SLOTS);
  const need = Math.max(...rows.map((r) => rowText(r.cells).length)) * charW + 16;
  const colGap = 10;
  const w = Math.min(need, (laneWidth() - (cols - 1) * colGap) / cols);
  const pitch = (MIDDLE_BOTTOM - MIDDLE_TOP) / MIDDLE_SLOTS;
  const h = Math.min(20, pitch - 3);
  const total = cols * w + (cols - 1) * colGap;
  const left = laneCx(lane) - total / 2;
  return rows.map((_, i) => ({
    x: round(left + Math.floor(i / MIDDLE_SLOTS) * (w + colGap)),
    y: round(MIDDLE_TOP + (i % MIDDLE_SLOTS) * pitch),
    w: round(w),
    h: round(h),
  }));
}

/** 답의 줄의 자리 — 포갰으면 가운데, 아니면 제 길 가운데 */
function answerSlots(
  lane: number,
  rows: { cells: Cell[] }[],
  charW: number,
  same: boolean[] | null,
): { x: number; y: number; w: number; h: number; cx: number }[] {
  const n = rows.length;
  if (n === 0) return [];
  const w = Math.max(...rows.map((r) => rowText(r.cells).length)) * charW + 20;
  const pitch = Math.min(24, (ANSWER_BOTTOM - ANSWER_TOP) / n);
  const h = Math.min(20, pitch - 3);
  return rows.map((_, i) => {
    const cx = same !== null && same[i] === true ? PIECE_CANVAS_W / 2 : laneCx(lane);
    return { x: round(cx - w / 2), y: round(ANSWER_TOP + i * pitch), w: round(w), h: round(h), cx };
  });
}

/** 연산 상자 곁에 적는 들어오는 표 — 흘러내려 오는 줄 말고 새로 들어오는 표만 */
function nodeInputs(scene: SameAnswerDifferentPlanScene, lane: LaneScene, level: number): string[] {
  const op = lane.ops[level];
  const before = lane.ops.slice(0, level);
  if (op === 'join') {
    return before.length === 0 ? [scene.ordersTable, scene.customersTable] : [scene.ordersTable];
  }
  if (op === 'filter') {
    return before.length === 0 ? [scene.customersTable] : [];
  }
  throw new Error(`그림: 길 ${lane.id} 의 연산 ${level} 가 없다`);
}

export const sameAnswerDifferentPlanStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const laneColors = categorical(2, 'vivid');
    const xsPx = parseFloat(fontSizes.xs);
    const charW = xsPx * MONO_RATIO;
    const sqlCharW = parseFloat(fontSizes.sm) * MONO_RATIO;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 한 장면을 그릴 때 움직일 손잡이
    let middleEls: SVGGElement[][] = [];
    let answerEls: SVGGElement[][] = [];
    let strikeEls: (SVGLineElement | null)[][] = [];

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

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; mono?: boolean; fill?: string; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.xs,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    function laneName(id: string): string {
      if (id === 'join-first') return t('path.joinFirst', 'Join, then filter');
      if (id === 'filter-first') return t('path.filterFirst', 'Filter, then join');
      throw new Error(`그림: 모르는 길 ${id}`);
    }

    function roleName(op: string): string {
      if (op === 'join') return t('role.join', 'Join');
      if (op === 'filter') return t('role.filter', 'Filter');
      throw new Error(`그림: 모르는 연산 ${op}`);
    }

    function laneColor(i: number): string {
      const c = laneColors[i];
      if (c === undefined) throw new Error(`그림: 길 ${i} 의 색이 없다`);
      return c;
    }

    /** 줄 하나 — 첫 길은 채운 칩, 둘째 길은 테두리 칩. 포개면 둘이 겹쳐 보인다 */
    function chip(
      parent: Element,
      lane: number,
      box: { x: number; y: number; w: number; h: number },
      cells: Cell[],
      dropped: boolean,
    ): { g: SVGGElement; strike: SVGLineElement | null } {
      const g = el('g', {}, parent);
      const color = laneColor(lane);
      if (lane === 0) {
        el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 4, fill: color, 'fill-opacity': dropped ? 0.07 : 0.22 }, g);
      } else {
        el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 4, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-opacity': dropped ? 0.35 : 1 }, g);
      }
      label(g, box.x + box.w / 2, box.y + box.h / 2 + 0.5, rowText(cells), {
        mono: true,
        anchor: 'middle',
        fill: dropped ? colors.textMuted : colors.text,
      });
      let strike: SVGLineElement | null = null;
      if (dropped) {
        strike = el(
          'line',
          { x1: box.x + 4, y1: box.y + box.h / 2, x2: box.x + box.w - 4, y2: box.y + box.h / 2, stroke: colors.textMuted, 'stroke-width': 1.2 },
          g,
        );
      }
      return { g, strike };
    }

    function node(
      parent: Element,
      scene: SameAnswerDifferentPlanScene,
      laneIx: number,
      level: number,
      y: number,
      active: boolean,
    ): void {
      const lane = scene.lanes[laneIx];
      if (lane === undefined) throw new Error(`그림: 길 ${laneIx} 가 없다`);
      const op = lane.ops[level];
      if (op === undefined) throw new Error(`그림: 길 ${laneIx} 의 연산 ${level} 가 없다`);
      const x0 = laneX0(laneIx);
      const w = laneWidth();
      const color = laneColor(laneIx);
      const inputs = nodeInputs(scene, lane, level);
      if (inputs.length > 0) label(parent, x0 + 6, y - 9, inputs.join(' × '), { mono: true, fill: colors.textMuted });
      const checks = lane.checks[level];
      if (checks !== null && checks !== undefined) {
        label(parent, x0 + w - 4, y - 9, t('label.checks', 'Checks: {n}', { n: checks }), {
          anchor: 'end',
          fill: active ? colors.text : colors.textMuted,
          weight: active ? '600' : '400',
        });
      }
      el(
        'rect',
        { x: x0, y, width: w, height: NODE_H, rx: 5, fill: colors.bgSubtle, stroke: active ? color : colors.border, 'stroke-width': active ? 2 : 1 },
        parent,
      );
      label(parent, x0 + 10, y + NODE_H / 2, roleName(op), { size: fontSizes.sm, fill: color, weight: '600' });
      const cond = op === 'join' ? scene.joinOn : scene.where;
      label(parent, x0 + w - 10, y + NODE_H / 2, cond, { mono: true, anchor: 'end' });
    }

    function drawStatic(scene: SameAnswerDifferentPlanScene): void {
      svg.textContent = '';
      middleEls = [];
      answerEls = [];
      strikeEls = [];
      const root = el('g', {}, svg);

      // SQL 한 문장
      const sqlW = Math.max(...scene.sql.map((l) => l.length), 1) * sqlCharW;
      const sqlX = (PIECE_CANVAS_W - sqlW) / 2;
      el('rect', { x: sqlX - 12, y: SQL_TOP - 12, width: sqlW + 24, height: scene.sql.length * SQL_LINE + 6, rx: 6, fill: colors.bgSubtle, stroke: colors.border }, root);
      scene.sql.forEach((line, i) => {
        label(root, sqlX, SQL_TOP + i * SQL_LINE, line, { mono: true, size: fontSizes.sm });
      });

      // 갈라지는 자리
      const mid = PIECE_CANVAS_W / 2;
      const split = FORK_TOP + 10;
      el('line', { x1: mid, y1: FORK_TOP, x2: mid, y2: split, stroke: colors.border, 'stroke-width': 2 }, root);
      scene.lanes.forEach((_, i) => {
        el(
          'path',
          { d: `M ${mid} ${split} C ${mid} ${FORK_BOTTOM - 8}, ${round(laneCx(i))} ${split + 4}, ${round(laneCx(i))} ${FORK_BOTTOM}`, fill: 'none', stroke: laneColor(i), 'stroke-width': 2 },
          root,
        );
      });

      const step = scene.step;
      const allMerged = scene.same !== null && scene.same.length > 0 && scene.same.every((s) => s);

      scene.lanes.forEach((lane, li) => {
        const color = laneColor(li);
        const cx = laneCx(li);
        const overlayStep = step.kind === 'overlay';
        label(root, cx, LANE_TITLE_Y, laneName(lane.id), { size: fontSizes.sm, anchor: 'middle', fill: color, weight: '600' });

        node(root, scene, li, 0, NODE1_Y, step.kind === 'op' && step.lane === li && step.level === 0);
        node(root, scene, li, 1, NODE2_Y, step.kind === 'op' && step.lane === li && step.level === 1);

        const mSlots = middleSlots(li, lane.middle, charW);
        const mEls: SVGGElement[] = [];
        const sEls: (SVGLineElement | null)[] = [];
        lane.middle.forEach((row, i) => {
          const box = mSlots[i];
          if (box === undefined) throw new Error(`그림: 가운데 줄 ${i} 의 자리가 없다`);
          const { g, strike } = chip(root, li, box, row.cells, row.dropped);
          mEls.push(g);
          sEls.push(strike);
        });
        middleEls.push(mEls);
        strikeEls.push(sEls);

        if (lane.answer.length > 0 && !allMerged) {
          label(root, laneX0(li) + 6, ANSWER_TOP + 10, t('label.answer', 'Answer'), { fill: colors.textMuted });
        }

        if (lane.total !== null) {
          label(root, cx, TOTAL_Y, t('label.total', 'Total checks: {n}', { n: lane.total }), {
            size: fontSizes.sm,
            anchor: 'middle',
            fill: overlayStep ? color : colors.text,
            weight: overlayStep ? '700' : '500',
          });
        }
      });

      // 답의 줄은 두 길을 다 그린 뒤 — 포갤 때 둘째 길의 테두리가 첫째 길의 칩 위에 온다
      scene.lanes.forEach((lane, li) => {
        const aSlots = answerSlots(li, lane.answer, charW, scene.same);
        const aEls: SVGGElement[] = [];
        lane.answer.forEach((row, i) => {
          const box = aSlots[i];
          if (box === undefined) throw new Error(`그림: 답의 줄 ${i} 의 자리가 없다`);
          aEls.push(chip(root, li, box, row.cells, false).g);
        });
        answerEls.push(aEls);
      });

      if (allMerged) {
        const first = scene.lanes[0];
        if (first !== undefined) {
          const slots = answerSlots(0, first.answer, charW, scene.same);
          const s0 = slots[0];
          if (s0 !== undefined) label(root, s0.x - 10, ANSWER_TOP + 10, t('label.answer', 'Answer'), { anchor: 'end', fill: colors.textMuted });
        }
      }

      // 캡션 — 지금 일어나는 일
      label(root, PIECE_CANVAS_W / 2, CAPTION_Y, caption(scene), { size: fontSizes.md, anchor: 'middle' });
    }

    function caption(scene: SameAnswerDifferentPlanScene): string {
      const step = scene.step;
      if (step.kind === 'start') return t('caption.start', 'One SQL statement splits into two plans.');
      if (step.kind === 'overlay') {
        const same = scene.same ?? [];
        return t('caption.overlay', 'Answer rows laid on each other: {same} / {total}', {
          same: same.filter((s) => s).length,
          total: same.length,
        });
      }
      const lane = scene.lanes[step.lane];
      if (lane === undefined) throw new Error(`그림: 길 ${step.lane} 가 없다`);
      const checks = lane.checks[step.level];
      if (checks === null || checks === undefined) throw new Error(`그림: 길 ${step.lane} 의 연산 ${step.level} 검사 수가 없다`);
      const last = step.level === lane.ops.length - 1;
      if (step.op === 'join') {
        const rows = last ? lane.answer.length : lane.middle.length;
        return t('caption.join', '{path} — join. Checks: {checks} · Rows out: {rows}', { path: laneName(lane.id), checks, rows });
      }
      const rows = last ? lane.answer.length : lane.middle.filter((r) => !r.dropped).length;
      return t('caption.filter', '{path} — filter. Checks: {checks} · Rows kept: {rows}', { path: laneName(lane.id), checks, rows });
    }

    /** 이번 걸음에 움직일 것 — 요소는 이미 끝 자리에 있다. 아직 못 온 만큼(dx, dy)으로 뒤에서 당긴다 */
    function motion(scene: SameAnswerDifferentPlanScene): { movers: Mover[]; growers: Grower[] } {
      const movers: Mover[] = [];
      const growers: Grower[] = [];
      const step = scene.step;
      if (step.kind === 'start') return { movers, growers };
      if (step.kind === 'overlay') {
        const same = scene.same ?? [];
        scene.lanes.forEach((lane, li) => {
          const home = laneCx(li);
          lane.answer.forEach((_, i) => {
            const g = answerEls[li]?.[i];
            if (g === undefined || same[i] !== true) return;
            movers.push({ el: g, dx: home - PIECE_CANVAS_W / 2, dy: 0, delay: i * OVERLAY_STAGGER_MS });
          });
        });
        return { movers, growers };
      }
      const lane = scene.lanes[step.lane];
      if (lane === undefined) return { movers, growers };
      const cx = laneCx(step.lane);
      const last = step.level === lane.ops.length - 1;
      const nodeY = (last ? NODE2_Y : NODE1_Y) + NODE_H / 2;
      if (!last) {
        // 첫 연산 — 가운데 줄이 상자에서 흘러나와 제자리로 내려온다
        const slots = middleSlots(step.lane, lane.middle, charW);
        lane.middle.forEach((_, i) => {
          const g = middleEls[step.lane]?.[i];
          const box = slots[i];
          if (g === undefined || box === undefined) return;
          movers.push({ el: g, dx: cx - (box.x + box.w / 2), dy: nodeY - (box.y + box.h / 2), delay: i * STAGGER_MS });
        });
        return { movers, growers };
      }
      // 마지막 연산 — 답의 줄이 내려온다. 거르기라면 가운데 줄의 제자리에서, 잇기라면 상자에서
      const aSlots = answerSlots(step.lane, lane.answer, charW, null);
      const mSlots = middleSlots(step.lane, lane.middle, charW);
      lane.answer.forEach((row, i) => {
        const g = answerEls[step.lane]?.[i];
        const box = aSlots[i];
        if (g === undefined || box === undefined) return;
        let fromX = cx;
        let fromY = nodeY;
        if (row.from !== null) {
          const src = mSlots[row.from];
          if (src === undefined) throw new Error(`그림: 답의 줄 ${i} 가 온 가운데 줄 ${row.from} 가 없다`);
          fromX = src.x + src.w / 2;
          fromY = src.y + src.h / 2;
        }
        movers.push({ el: g, dx: fromX - box.cx, dy: fromY - (box.y + box.h / 2), delay: i * STAGGER_MS * 2 });
      });
      if (step.op === 'filter') {
        // 떨어진 줄에 금이 그어진다
        lane.middle.forEach((row, i) => {
          const line = strikeEls[step.lane]?.[i];
          const box = mSlots[i];
          if (!row.dropped || line === null || line === undefined || box === undefined) return;
          growers.push({ el: line, x1: box.x + 4, x2: box.x + box.w - 4, delay: i * STAGGER_MS });
        });
      }
      return { movers, growers };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) return resolve();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    function paint(movers: Mover[], growers: Grower[], elapsed: number): void {
      for (const m of movers) {
        const p = Math.max(0, Math.min(1, (elapsed - m.delay) / MOVE_MS));
        const e = 1 - (1 - p) * (1 - p) * (1 - p);
        const k = 1 - e;
        m.el.setAttribute('transform', `translate(${round(m.dx * k)} ${round(m.dy * k)})`);
      }
      for (const gr of growers) {
        const p = Math.max(0, Math.min(1, (elapsed - gr.delay) / MOVE_MS));
        gr.el.setAttribute('x2', String(round(gr.x1 + (gr.x2 - gr.x1) * p)));
      }
    }

    async function render(next: SameAnswerDifferentPlanScene, _prev: SameAnswerDifferentPlanScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate) return;
      const { movers, growers } = motion(next);
      if (movers.length === 0 && growers.length === 0) return;
      const span =
        Math.max(0, ...movers.map((m) => m.delay), ...growers.map((g) => g.delay)) + MOVE_MS;
      paint(movers, growers, 0);
      const start = Date.now();
      for (;;) {
        await wait(16);
        if (mine !== gen || destroyed) return;
        const elapsed = Date.now() - start;
        paint(movers, growers, elapsed);
        if (elapsed >= span) break;
      }
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
