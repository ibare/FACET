/**
 * variable-size-segments-stage — 뜻대로 잘려 제 길이로 놓인다.
 *
 * 위 줄은 프로그램, 가운데 줄은 메모리, 아래는 세그먼트 표다. 두 줄은 같은 축척(KiB 당
 * 가로 길이)을 써서, 덩어리가 옮겨져도 제 길이를 그대로 지닌다.
 *
 *   잘림  통째였던 프로그램이 경계에서 갈라져 서로 벌어진다
 *   넣기  덩어리가 프로그램 줄에서 떠나 틈 위를 지나다가(짧은 틈은 지나친다) 맞는 틈에
 *         내려앉고, 그 시작 · 길이가 표의 한 줄로 내려가 적힌다
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import type { SegHole, SegPiece, VariableSizeSegmentsScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 410;
const W = PIECE_CANVAS_W;
const MARGIN = 24;
const BAR_H = 34;
const PROG_Y = 44;
const MEM_Y = 156;
/** 넣기 운동에서 덩어리가 틈 위에 떠 있는 높이 (메모리 줄 기준) */
const HOVER_DY = -58;
/** 잘린 덩어리 사이 벌어짐의 상한 */
const SPREAD_GAP = 28;
const TABLE_W = 360;
const TABLE_TITLE_Y = 242;
const TABLE_HEAD_Y = 264;
const TABLE_ROW_Y0 = 286;
const TABLE_ROW_DY = 22;
const CAPTION_Y1 = 380;
const CAPTION_Y2 = 400;

const CUT_MS = 620;
const TRAVEL_MS = 560;
const HOP_MS = 420;
const DWELL_MS = 280;
const DROP_MS = 260;
const WRITE_MS = 380;
const FRAME_MS = 16;

const XS_PX = parseFloat(fontSizes.xs);

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  fill: string,
  opts: { size?: string; anchor?: string; mono?: boolean; weight?: string } = {},
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    fill,
    'font-family': opts.mono === true ? fonts.mono : fonts.body,
    'font-size': opts.size ?? fontSizes.xs,
    'text-anchor': opts.anchor ?? 'start',
  });
  if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
  node.textContent = text;
  return node;
}

function translate(node: Element, dx: number, dy: number): void {
  node.setAttribute('transform', `translate(${r2(dx)},${r2(dy)})`);
}

/** 그린 요소 가운데 운동이 붙잡는 손잡이. drawStatic 이 매번 새로 만든다. */
type Handles = {
  progPieces: Map<string, SVGGElement>;
  memPieces: Map<string, SVGGElement>;
  rows: Map<string, { row: SVGGElement; start: SVGTextElement; len: SVGTextElement }>;
};

export const variableSizeSegmentsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function settle(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    function segName(id: string): string {
      const names: Record<string, string> = {
        code: t('label.code', 'code'),
        data: t('label.data', 'data'),
        heap: t('label.heap', 'heap'),
        stack: t('label.stack', 'stack'),
      };
      const name = names[id];
      if (name === undefined) throw new Error(`variable-size-segments-stage: 세그먼트 '${id}' 의 표시 이름이 없다`);
      return name;
    }

    function usedName(kind: 'os' | 'process'): string {
      const names: Record<'os' | 'process', string> = {
        os: t('label.os', 'OS'),
        process: t('label.used', 'in use'),
      };
      return names[kind];
    }

    function kib(n: number): string {
      return t('unit.kib', '{n} KiB', { n });
    }

    /** 장면에서 자리를 셈한다. 좌표는 장면에 담지 않는다. */
    function geometry(scene: VariableSizeSegmentsScene) {
      const px = (W - 2 * MARGIN) / scene.total;
      const memX = (addr: number): number => MARGIN + addr * px;
      const progKiB = scene.segments.reduce((s, g) => s + g.size, 0);
      const n = scene.segments.length;
      const room = W - 2 * MARGIN - progKiB * px;
      const gap = n > 1 ? Math.max(0, Math.min(SPREAD_GAP, room / (n - 1))) : 0;
      const joinedX0 = (W - progKiB * px) / 2;
      const spreadX0 = (W - progKiB * px - gap * (n - 1)) / 2;
      const joinedX = new Map<string, number>();
      const spreadX = new Map<string, number>();
      let acc = 0;
      scene.segments.forEach((g, i) => {
        joinedX.set(g.id, joinedX0 + acc * px);
        spreadX.set(g.id, spreadX0 + acc * px + i * gap);
        acc += g.size;
      });
      return { px, memX, progKiB, joinedX0, joinedX, spreadX };
    }

    function colorOf(scene: VariableSizeSegmentsScene): Map<string, string> {
      const palette = categorical(scene.segments.length, 'vivid');
      const out = new Map<string, string>();
      scene.segments.forEach((g, i) => {
        const c = palette[i];
        if (c === undefined) throw new Error('variable-size-segments-stage: 색이 모자란다');
        out.set(g.id, c);
      });
      return out;
    }

    function drawPiece(
      parent: Element,
      seg: SegPiece,
      x: number,
      y: number,
      w: number,
      fill: string,
      current: boolean,
    ): SVGGElement {
      const g = el(parent, 'g', {});
      label(g, x + w / 2, y - 7, segName(seg.id), colors.text, { anchor: 'middle', size: fontSizes.sm });
      el(g, 'rect', {
        x,
        y,
        width: w,
        height: BAR_H,
        rx: 3,
        fill,
        stroke: current ? colors.accent : fill,
        'stroke-width': current ? 3 : 1,
      });
      label(g, x + w / 2, y + BAR_H / 2 + 4, kib(seg.size), colors.stateInk, { anchor: 'middle', mono: true });
      return g;
    }

    function holeRect(parent: Element, h: SegHole, memX: (a: number) => number, px: number, stroke: string, width: number): void {
      el(parent, 'rect', {
        x: memX(h.start) + 1,
        y: MEM_Y + 1,
        width: Math.max(0, h.size * px - 2),
        height: BAR_H - 2,
        fill: 'none',
        stroke,
        'stroke-width': width,
        'stroke-dasharray': '4 3',
      });
    }

    function drawStatic(scene: VariableSizeSegmentsScene): Handles {
      svg.textContent = '';
      const handles: Handles = { progPieces: new Map(), memPieces: new Map(), rows: new Map() };
      const geo = geometry(scene);
      const segColor = colorOf(scene);
      const segById = new Map(scene.segments.map((g) => [g.id, g] as const));
      const placedIds = new Set(scene.placed.map((p) => p.id));
      const step = scene.step;

      // ── 프로그램 줄
      label(svg, MARGIN, PROG_Y - 26, t('label.program', 'Program: {n} KiB', { n: geo.progKiB }), colors.textMuted);
      if (!scene.cut) {
        el(svg, 'rect', {
          x: geo.joinedX0,
          y: PROG_Y,
          width: geo.progKiB * geo.px,
          height: BAR_H,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: colors.textMuted,
          'stroke-width': 1.5,
        });
      } else {
        for (const seg of scene.segments) {
          const x = geo.spreadX.get(seg.id);
          const fill = segColor.get(seg.id);
          if (x === undefined || fill === undefined) throw new Error('variable-size-segments-stage: 조각 자리를 못 셈했다');
          const w = seg.size * geo.px;
          if (placedIds.has(seg.id)) {
            el(svg, 'rect', {
              x,
              y: PROG_Y,
              width: w,
              height: BAR_H,
              rx: 3,
              fill: 'none',
              stroke: colors.border,
              'stroke-dasharray': '4 3',
            });
          } else {
            handles.progPieces.set(seg.id, drawPiece(svg, seg, x, PROG_Y, w, fill, false));
          }
        }
      }

      // ── 메모리 줄
      label(svg, MARGIN, MEM_Y - 30, t('label.memory', 'Memory: {n} KiB', { n: scene.total }), colors.textMuted);
      el(svg, 'rect', {
        x: MARGIN,
        y: MEM_Y,
        width: W - 2 * MARGIN,
        height: BAR_H,
        fill: colors.bg,
        stroke: colors.border,
      });
      for (const u of scene.used) {
        const x = geo.memX(u.start);
        const w = u.size * geo.px;
        el(svg, 'rect', { x, y: MEM_Y, width: w, height: BAR_H, fill: colors.bgSubtle, stroke: colors.border });
        label(svg, x + w / 2, MEM_Y + BAR_H / 2 + 4, usedName(u.kind), colors.textMuted, { anchor: 'middle' });
      }
      for (const h of scene.holes) {
        holeRect(svg, h, geo.memX, geo.px, colors.textMuted, 1);
        const text = kib(h.size);
        if (text.length * XS_PX * 0.62 + 4 <= h.size * geo.px) {
          label(svg, geo.memX(h.start) + (h.size * geo.px) / 2, MEM_Y + BAR_H / 2 + 4, text, colors.textMuted, {
            anchor: 'middle',
            mono: true,
          });
        }
      }
      if (step.kind === 'place') {
        holeRect(svg, step.into, geo.memX, geo.px, colors.textMuted, 1);
        for (const h of step.skipped) holeRect(svg, h, geo.memX, geo.px, colors.danger, 2);
      }
      for (const p of scene.placed) {
        const seg = segById.get(p.id);
        const fill = segColor.get(p.id);
        if (seg === undefined || fill === undefined) throw new Error(`variable-size-segments-stage: 모르는 세그먼트 '${p.id}'`);
        const current = step.kind === 'place' && step.id === p.id;
        handles.memPieces.set(p.id, drawPiece(svg, seg, geo.memX(p.start), MEM_Y, p.size * geo.px, fill, current));
      }

      // 경계 주소
      const bounds = new Set<number>([0, scene.total]);
      for (const b of [...scene.used, ...scene.placed, ...scene.holes]) {
        bounds.add(b.start);
        bounds.add(b.start + b.size);
      }
      for (const a of [...bounds].sort((x, y) => x - y)) {
        const x = geo.memX(a);
        el(svg, 'line', { x1: x, y1: MEM_Y + BAR_H, x2: x, y2: MEM_Y + BAR_H + 5, stroke: colors.textMuted });
        label(svg, x, MEM_Y + BAR_H + 17, String(a), colors.textMuted, { anchor: 'middle', mono: true });
      }

      // ── 세그먼트 표
      const tx = (W - TABLE_W) / 2;
      const colStart = tx + TABLE_W * 0.68;
      const colLen = tx + TABLE_W;
      label(svg, tx, TABLE_TITLE_Y, t('table.title', 'Segment table'), colors.text, { size: fontSizes.sm, weight: '600' });
      label(svg, tx + 18, TABLE_HEAD_Y, t('table.segment', 'Segment'), colors.textMuted);
      label(svg, colStart, TABLE_HEAD_Y, t('table.start', 'Start'), colors.textMuted, { anchor: 'end' });
      label(svg, colLen, TABLE_HEAD_Y, t('table.length', 'Length'), colors.textMuted, { anchor: 'end' });
      el(svg, 'line', { x1: tx, y1: TABLE_HEAD_Y + 7, x2: tx + TABLE_W, y2: TABLE_HEAD_Y + 7, stroke: colors.border });
      scene.placed.forEach((p, i) => {
        const y = TABLE_ROW_Y0 + i * TABLE_ROW_DY;
        const row = el(svg, 'g', {});
        const current = step.kind === 'place' && step.id === p.id;
        if (current) {
          el(row, 'rect', {
            x: tx - 6,
            y: y - 15,
            width: TABLE_W + 12,
            height: TABLE_ROW_DY - 2,
            rx: 3,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 2,
          });
        }
        const fill = segColor.get(p.id);
        if (fill === undefined) throw new Error(`variable-size-segments-stage: 모르는 세그먼트 '${p.id}'`);
        el(row, 'rect', { x: tx, y: y - 10, width: 11, height: 11, rx: 2, fill });
        label(row, tx + 18, y, segName(p.id), colors.text, { size: fontSizes.sm });
        const start = label(row, colStart, y, String(p.start), colors.text, { anchor: 'end', mono: true, size: fontSizes.sm });
        const len = label(row, colLen, y, kib(p.size), colors.text, { anchor: 'end', mono: true, size: fontSizes.sm });
        handles.rows.set(p.id, { row, start, len });
      });

      // ── 캡션 (지금 일어나는 일)
      const cap: string[] = [];
      if (step.kind === 'start') {
        cap.push(t('caption.start', 'Not cut yet. Free gaps in memory: {n}', { n: scene.holes.length }));
      } else if (step.kind === 'cut') {
        cap.push(t('caption.cut', 'Cut at meaning boundaries — segments: {n}', { n: scene.segments.length }));
      } else {
        cap.push(
          t('caption.place', '{seg}, {len} KiB → first gap that fits, start {start}', {
            seg: segName(step.id),
            len: step.size,
            start: step.start,
          }),
        );
        if (step.skipped.length > 0) {
          cap.push(t('caption.skip', 'Too short, passed over — gaps: {n}', { n: step.skipped.length }));
        }
      }
      cap.forEach((line, i) => {
        label(svg, W / 2, i === 0 ? CAPTION_Y1 : CAPTION_Y2, line, i === 0 ? colors.text : colors.danger, {
          anchor: 'middle',
          size: fontSizes.md,
        });
      });

      return handles;
    }

    /** 프레임 수로 흐르는 한 토막. 세대가 바뀌거나 거둬지면 곧바로 풀린다. */
    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const total = Math.max(1, Math.round(ms / FRAME_MS));
        let i = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const k = i / total;
          frame(ease(k));
          if (i >= total) {
            finish();
            return;
          }
          i += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    const live = (mine: number): boolean => mine === gen && !destroyed;

    async function playCut(scene: VariableSizeSegmentsScene, h: Handles, mine: number): Promise<void> {
      const geo = geometry(scene);
      const moves: { g: SVGGElement; dx: number }[] = [];
      for (const [id, g] of h.progPieces) {
        const from = geo.joinedX.get(id);
        const to = geo.spreadX.get(id);
        if (from === undefined || to === undefined) continue;
        moves.push({ g, dx: from - to });
      }
      await tween(CUT_MS, mine, (k) => {
        for (const m of moves) translate(m.g, m.dx * (1 - k), 0);
      });
    }

    async function playPlace(scene: VariableSizeSegmentsScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'place') return;
      const g = h.memPieces.get(step.id);
      const row = h.rows.get(step.id);
      const geo = geometry(scene);
      const fromX = geo.spreadX.get(step.id);
      if (g === undefined || row === undefined || fromX === undefined) return;
      const home = geo.memX(step.start);

      // 첫 프레임부터 아직 못 온 자리에 둔다 — 끝 자리가 번쩍이지 않게.
      row.row.setAttribute('visibility', 'hidden');
      const points: [number, number][] = [[fromX - home, PROG_Y - MEM_Y]];
      for (const s of step.skipped) points.push([geo.memX(s.start) - home, HOVER_DY]);
      points.push([0, HOVER_DY]);
      translate(g, points[0]![0], points[0]![1]);

      for (let i = 1; i < points.length; i += 1) {
        const [ax, ay] = points[i - 1]!;
        const [bx, by] = points[i]!;
        await tween(i === 1 ? TRAVEL_MS : HOP_MS, mine, (k) => translate(g, ax + (bx - ax) * k, ay + (by - ay) * k));
        if (!live(mine)) return;
        // 지나칠 틈 위에서는 잠시 머문다 — 길이가 모자란 것이 보이게.
        if (i < points.length - 1) {
          await tween(DWELL_MS, mine, () => undefined);
          if (!live(mine)) return;
        }
      }
      await tween(DROP_MS, mine, (k) => translate(g, 0, HOVER_DY * (1 - k)));
      if (!live(mine)) return;

      // 표에 한 줄 — 시작은 메모리의 주소 자리에서, 길이는 덩어리에서 내려온다.
      row.row.removeAttribute('visibility');
      const sx = Number(row.start.getAttribute('x'));
      const sy = Number(row.start.getAttribute('y'));
      const lx = Number(row.len.getAttribute('x'));
      const ly = Number(row.len.getAttribute('y'));
      const startFrom: [number, number] = [home - sx, MEM_Y + BAR_H + 17 - sy];
      const lenFrom: [number, number] = [home + (step.size * geo.px) / 2 - lx, MEM_Y + BAR_H / 2 + 4 - ly];
      await tween(WRITE_MS, mine, (k) => {
        translate(row.start, startFrom[0] * (1 - k), startFrom[1] * (1 - k));
        translate(row.len, lenFrom[0] * (1 - k), lenFrom[1] * (1 - k));
      });
    }

    return {
      async render(next: VariableSizeSegmentsScene, _prev: VariableSizeSegmentsScene | null, opts: { animate: boolean }) {
        settle();
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate) return;
        if (next.step.kind === 'cut') await playCut(next, handles, mine);
        else if (next.step.kind === 'place') await playPlace(next, handles, mine);
        else return;
        if (live(mine)) drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        settle();
        svg.textContent = '';
      },
    };
  },
};
