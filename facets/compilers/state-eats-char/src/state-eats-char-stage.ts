/**
 * state-eats-char 의 무대.
 *
 * 위에 입력 글줄이 칸으로 늘어서고, 아래에 기계가 나무꼴로 선다 (시작 자리가 왼쪽,
 * 옮김을 따라 오른쪽으로). 한 걸음마다 입력의 맨 앞 글자가 칸을 떠나 자기가 적힌
 * 옮김의 이름표로 날아가 박히고, 남은 글자는 한 칸씩 당겨진다. 그다음 지금 자리를
 * 두른 둥근 표시가 그 옮김을 따라 다음 자리로 미끄러진다. 나가는 길이 여럿인 자리에서는
 * 고르지 않은 길의 이름표가 점선으로 남는다.
 *
 * 자리(좌표)는 여기서 셈한다 — 장면은 기계의 구조와 자취만 준다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { MachineEdge } from './algorithm.js';
import type { StateEatsCharScene } from './scene.js';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 한 걸음의 길이 — 글자가 날아가는 몫과 자리가 옮는 몫을 한 시계로 */
const MOVE_MS = 700;
/** 그중 글자가 날아가는 몫 */
const FLY_SHARE = 0.45;

const MARGIN_L = 48;
const MARGIN_R = 30;
const TAPE_LABEL_Y = 18;
const TAPE_TOP = 28;
const MACHINE_TOP = 100;
const MACHINE_BOTTOM = 228;
const CAPTION_Y = 292;
const CAPTION2_Y = 314;

function num(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? num(v) : v);
  }
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type Point = { x: number; y: number };

type Layout = {
  pos: Map<string, Point>;
  r: number;
  cell: number;
  cellGap: number;
};

/**
 * 나무꼴 자리 — 깊이가 가로, 잎의 차례가 세로. 부모는 첫 자식과 끝 자식의 가운데.
 * 한 자리에 두 길로 닿으면 나무가 아니다 — 그 기계는 이 그림으로 그릴 수 없어 던진다.
 */
function layoutMachine(start: string, edges: readonly MachineEdge[]): Layout {
  const children = new Map<string, string[]>();
  for (const e of edges) {
    const list = children.get(e.from) ?? [];
    list.push(e.to);
    children.set(e.from, list);
  }
  const depth = new Map<string, number>();
  const row = new Map<string, number>();
  let nextRow = 0;
  let maxDepth = 0;
  const visit = (s: string, d: number): number => {
    if (depth.has(s)) throw new Error(`state-eats-char: 자리 ${s} 에 닿는 길이 둘이다`);
    depth.set(s, d);
    maxDepth = Math.max(maxDepth, d);
    const kids = children.get(s) ?? [];
    if (kids.length === 0) {
      row.set(s, nextRow);
      nextRow += 1;
      return nextRow - 1;
    }
    const rows = kids.map((k) => visit(k, d + 1));
    const first = Math.min(...rows);
    const last = Math.max(...rows);
    const mine = (first + last) / 2;
    row.set(s, mine);
    return mine;
  };
  visit(start, 0);
  for (const e of edges) {
    if (!depth.has(e.from)) throw new Error(`state-eats-char: 자리 ${e.from} 에 닿는 길이 없다`);
  }
  const width = PIECE_CANVAS_W - MARGIN_L - MARGIN_R;
  const colGap = maxDepth > 0 ? Math.min(90, width / maxDepth) : 0;
  const rowCount = Math.max(1, nextRow);
  const rowGap = rowCount > 1 ? Math.min(64, (MACHINE_BOTTOM - MACHINE_TOP) / (rowCount - 1)) : 0;
  const top = MACHINE_TOP + (MACHINE_BOTTOM - MACHINE_TOP - rowGap * (rowCount - 1)) / 2;
  const pos = new Map<string, Point>();
  for (const [s, d] of depth) {
    const rw = row.get(s);
    if (rw === undefined) throw new Error(`state-eats-char: 자리 ${s} 의 줄이 없다`);
    pos.set(s, { x: MARGIN_L + d * colGap, y: top + rw * rowGap });
  }
  const r = Math.min(14, Math.max(9, colGap * 0.2), rowGap > 0 ? rowGap * 0.3 : 14);
  return { pos, r, cell: 26, cellGap: 4 };
}

function place(layout: Layout, s: string): Point {
  const p = layout.pos.get(s);
  if (!p) throw new Error(`state-eats-char: 자리 ${s} 가 그림에 없다`);
  return p;
}

/** 옮김 이름표의 자리 — 선의 가운데 */
function labelPoint(layout: Layout, e: MachineEdge): Point {
  const a = place(layout, e.from);
  const b = place(layout, e.to);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** 입력 칸 i (남은 글자 중 i 번째) 의 가운데 */
function cellCenter(layout: Layout, i: number): Point {
  return {
    x: MARGIN_L + i * (layout.cell + layout.cellGap) + layout.cell / 2,
    y: TAPE_TOP + layout.cell / 2,
  };
}

type Handles = {
  tape: SVGGElement;
  marker: SVGCircleElement;
  chosenBox: SVGRectElement | null;
  chosenText: SVGTextElement | null;
};

export const stateEatsCharStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let layoutKey: StateEatsCharScene['base'] | null = null;
    let layout: Layout | null = null;

    const layoutFor = (scene: StateEatsCharScene): Layout => {
      if (layout && layoutKey === scene.base) return layout;
      layout = layoutMachine(scene.base.start, scene.base.edges);
      layoutKey = scene.base;
      return layout;
    };

    const text = (
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size: string; fill: string; family?: string; anchor?: string; weight?: string },
    ): SVGTextElement => {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'central',
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = content;
      return node;
    };

    const arrowHead = (parent: Element, tip: Point, dx: number, dy: number, fill: string): void => {
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const back = 7;
      const half = 4;
      const bx = tip.x - ux * back;
      const by = tip.y - uy * back;
      const pts = [
        `${num(tip.x)},${num(tip.y)}`,
        `${num(bx - uy * half)},${num(by + ux * half)}`,
        `${num(bx + uy * half)},${num(by - ux * half)}`,
      ].join(' ');
      el('polygon', { points: pts, fill }, parent);
    };

    const drawStatic = (scene: StateEatsCharScene): Handles => {
      svg.textContent = '';
      const lay = layoutFor(scene);
      const { r } = lay;
      const walked = new Set(scene.walked);
      const visited = new Set(scene.trail);
      const accept = new Map(scene.base.accept.map((a) => [a.state, a.kind]));
      const step = scene.step;

      // 입력 글줄 — 남은 글자만. 먹은 글자는 기계로 들어가 사라졌다
      text(svg, MARGIN_L, TAPE_LABEL_Y, t('label.input', 'Input'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'start',
      });
      const tape = el('g', {}, svg);
      const rest = scene.base.input.slice(scene.pos);
      rest.forEach((ch, i) => {
        const c = cellCenter(lay, i);
        el(
          'rect',
          {
            x: c.x - lay.cell / 2,
            y: c.y - lay.cell / 2,
            width: lay.cell,
            height: lay.cell,
            rx: 4,
            fill: colors.bgSubtle,
            stroke: i === 0 ? colors.text : colors.border,
            'stroke-width': i === 0 ? 1.5 : 1,
          },
          tape,
        );
        text(tape, c.x, c.y, ch, { size: fontSizes.md, fill: colors.text, family: fonts.mono });
      });

      const edgeLayer = el('g', {}, svg);
      const markerLayer = el('g', {}, svg);
      const nodeLayer = el('g', {}, svg);

      // 시작 표시 — 왼쪽에서 들어오는 짧은 화살
      const s0 = place(lay, scene.base.start);
      el(
        'line',
        { x1: s0.x - r - 22, y1: s0.y, x2: s0.x - r - 6, y2: s0.y, stroke: colors.text, 'stroke-width': 1.5 },
        edgeLayer,
      );
      arrowHead(edgeLayer, { x: s0.x - r - 1, y: s0.y }, 1, 0, colors.text);

      let chosenBox: SVGRectElement | null = null;
      let chosenText: SVGTextElement | null = null;
      scene.base.edges.forEach((e, i) => {
        const a = place(lay, e.from);
        const b = place(lay, e.to);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const on = walked.has(i);
        const ink = on ? colors.text : colors.border;
        el(
          'line',
          {
            x1: a.x + ux * r,
            y1: a.y + uy * r,
            x2: b.x - ux * (r + 6),
            y2: b.y - uy * (r + 6),
            stroke: ink,
            'stroke-width': on ? 2 : 1.25,
          },
          edgeLayer,
        );
        arrowHead(edgeLayer, { x: b.x - ux * (r + 1), y: b.y - uy * (r + 1) }, dx, dy, ink);

        const lp = labelPoint(lay, e);
        const chosen = step !== null && step.from === e.from && step.ch === e.ch;
        const passed = step !== null && step.from === e.from && !chosen;
        const box = el(
          'rect',
          {
            x: lp.x - 8,
            y: lp.y - 9,
            width: 16,
            height: 18,
            rx: 3,
            fill: chosen ? colors.accent : colors.bg,
            stroke: chosen ? colors.accent : passed ? colors.textMuted : 'none',
            'stroke-width': 1,
          },
          edgeLayer,
        );
        if (passed) box.setAttribute('stroke-dasharray', '3 2');
        const label = text(edgeLayer, lp.x, lp.y, e.ch, {
          size: fontSizes.sm,
          fill: chosen ? colors.stateInk : on ? colors.text : colors.textMuted,
          family: fonts.mono,
          weight: chosen ? '700' : '400',
        });
        if (chosen) {
          chosenBox = box;
          chosenText = label;
        }
      });

      // 지금 자리를 두르는 표시 — 자리를 옮길 때 이것이 옮김을 따라 미끄러진다
      const here = place(lay, scene.at);
      const marker = el('circle', { cx: here.x, cy: here.y, r: r + 6, fill: colors.accent }, markerLayer);

      for (const [s, p] of lay.pos) {
        const seen = visited.has(s);
        const ink = seen ? colors.text : colors.border;
        el(
          'circle',
          { cx: p.x, cy: p.y, r, fill: colors.bg, stroke: ink, 'stroke-width': seen ? 2 : 1.25 },
          nodeLayer,
        );
        const kind = accept.get(s);
        if (kind !== undefined) {
          el(
            'circle',
            { cx: p.x, cy: p.y, r: r - 3.5, fill: 'none', stroke: ink, 'stroke-width': 1 },
            nodeLayer,
          );
          text(nodeLayer, p.x, p.y + r + 12, kind, {
            size: fontSizes.xs,
            fill: colors.textMuted,
            family: fonts.mono,
          });
        }
        text(nodeLayer, p.x, p.y, s, {
          size: fontSizes.sm,
          fill: seen ? colors.text : colors.textMuted,
          family: fonts.mono,
          weight: s === scene.at ? '700' : '400',
        });
      }

      // 캡션 — 지금 일어난 일만
      if (step === null) {
        text(svg, PIECE_CANVAS_W / 2, CAPTION_Y, t('caption.start', 'Start state: {state}', { state: scene.at }), {
          size: fontSizes.md,
          fill: colors.text,
        });
      } else {
        text(
          svg,
          PIECE_CANVAS_W / 2,
          CAPTION_Y,
          t('caption.eat', 'Ate: {ch} · state {from} → {to}', { ch: step.ch, from: step.from, to: step.to }),
          { size: fontSizes.md, fill: colors.text },
        );
        text(
          svg,
          PIECE_CANVAS_W / 2,
          CAPTION2_Y,
          t('caption.ways', 'Ways out: {n} · taken: {ch}', { n: step.outs.length, ch: step.ch }),
          { size: fontSizes.sm, fill: colors.textMuted },
        );
      }

      return { tape, marker, chosenBox, chosenText };
    };

    const clock = (mine: number, ms: number, frame: (p: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        const began = Date.now();
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
          const p = Math.min(1, (Date.now() - began) / ms);
          frame(p);
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

    const animateEat = async (next: StateEatsCharScene, mine: number): Promise<void> => {
      const step = next.step;
      if (step === null) return;
      const lay = layoutFor(next);
      const handles = drawStatic(next);
      const edge = next.base.edges.find((e) => e.from === step.from && e.ch === step.ch);
      if (!edge) throw new Error(`state-eats-char: 옮김 ${step.from} -${step.ch}-> 이 그림에 없다`);
      const from = place(lay, step.from);
      const to = place(lay, step.to);
      const land = labelPoint(lay, edge);
      const front = cellCenter(lay, 0);
      const shift = lay.cell + lay.cellGap;

      // 날아가는 글자 — 정적 그림에는 없다. 운동이 끝나면 정적 그림이 거둔다
      const flyer = el('g', {}, svg);
      el(
        'rect',
        {
          x: -lay.cell / 2,
          y: -lay.cell / 2,
          width: lay.cell,
          height: lay.cell,
          rx: 4,
          fill: colors.accent,
          stroke: colors.accent,
        },
        flyer,
      );
      text(flyer, 0, 0, step.ch, {
        size: fontSizes.md,
        fill: colors.stateInk,
        family: fonts.mono,
        weight: '700',
      });

      const frame = (p: number): void => {
        const fly = ease(Math.min(1, p / FLY_SHARE));
        const walk = ease(Math.max(0, (p - FLY_SHARE) / (1 - FLY_SHARE)));
        // 남은 글자는 한 칸 뒤에서 당겨져 온다
        handles.tape.setAttribute('transform', `translate(${num(shift * (1 - fly))},0)`);
        if (fly < 1) {
          const x = front.x + (land.x - front.x) * fly;
          const y = front.y + (land.y - front.y) * fly;
          const s = 1 - 0.35 * fly;
          flyer.setAttribute('transform', `translate(${num(x)},${num(y)}) scale(${num(s)})`);
          handles.chosenBox?.setAttribute('fill', colors.bg);
          handles.chosenText?.setAttribute('fill', colors.textMuted);
        } else {
          flyer.setAttribute('display', 'none');
          handles.chosenBox?.setAttribute('fill', colors.accent);
          handles.chosenText?.setAttribute('fill', colors.stateInk);
        }
        // 지금 자리 표시는 아직 못 온 만큼 뒤에 있다
        handles.marker.setAttribute('cx', num(from.x + (to.x - from.x) * walk));
        handles.marker.setAttribute('cy', num(from.y + (to.y - from.y) * walk));
      };
      frame(0);
      await clock(mine, MOVE_MS, frame);
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    };

    return {
      render(
        next: StateEatsCharScene,
        prev: StateEatsCharScene | null,
        opts: { animate: boolean },
      ): Promise<void> | void {
        const mine = (gen += 1);
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (destroyed) return;
        const stepped =
          opts.animate && next.step !== null && prev !== null && prev.pos === next.pos - 1;
        if (!stepped) {
          drawStatic(next);
          return;
        }
        return animateEat(next, mine);
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
