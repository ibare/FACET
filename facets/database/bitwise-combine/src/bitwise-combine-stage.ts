/**
 * bitwise-combine stage — 비트 줄들이 아래로 내려와 한 자리에 포개지고, 1 로 남은 자리에서
 * 표의 줄까지 선이 내려가 그 줄만 열린다.
 *
 * 세로 차례: 질의 → 조건마다의 비트 줄 → 포개는 자리 → 표의 줄 (자리마다 같은 세로 칸).
 * 비트 한 자리와 표의 줄 하나가 같은 세로 칸에 서므로 "1 의 자리 → 그 줄" 이 곧은 선이 된다.
 *
 * 정적 그리기가 정본이다. 운동은 그 위에서 아직 못 온 만큼만 그리고, 끝나면 정적으로 다시 세운다.
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
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { BitwiseCombineSceneState } from './scene.js';

const H = 380;
const PAD = 16;
const CELL_GAP = 4;
const CELL_H_MAX = 30;
const QUERY_TOP = 22;
const STRIPS_TOP = 50;
const STRIPS_BOTTOM = 236;
const STRIP_PITCH_MAX = 58;
const TABLE_LABEL_Y = 262;
const BOX_TOP = 270;
const BOX_CLOSED_H = 26;
const BOX_OPEN_H = 62;
const CAPTION_Y = 362;

const COMBINE_SLIDE_MS = 650;
const COMBINE_MS = 1000;
const READ_LINK_MS = 500;
const READ_MS = 1000;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Box = { rect: SVGRectElement; values: SVGTextElement[] };
type Handles = {
  resultCells: SVGGElement;
  ghosts: SVGGElement;
  links: Map<number, SVGLineElement>;
  boxes: Map<number, Box>;
};

type Geometry = {
  count: number;
  cellW: number;
  cellH: number;
  stripPitch: number;
  colX(i: number): number;
  stripLabelY(i: number): number;
  stripTop(i: number): number;
  resultLabelY: number;
  resultTop: number;
};

function geometry(scene: BitwiseCombineSceneState): Geometry {
  const count = scene.bits[0]?.length ?? 0;
  const inner = PIECE_CANVAS_W - 2 * PAD;
  const cellW = count > 0 ? (inner - CELL_GAP * (count - 1)) / count : inner;
  const rowsOfBits = Math.max(1, scene.conditions.length) + 1;
  const stripPitch = Math.min(STRIP_PITCH_MAX, (STRIPS_BOTTOM - STRIPS_TOP) / rowsOfBits);
  const cellH = Math.min(CELL_H_MAX, stripPitch - 22);
  const stripLabelY = (i: number): number => STRIPS_TOP + 14 + i * stripPitch;
  const stripTop = (i: number): number => stripLabelY(i) + 6;
  const resultRow = Math.max(1, scene.conditions.length);
  return {
    count,
    cellW,
    cellH,
    stripPitch,
    colX: (i) => round(PAD + i * (cellW + CELL_GAP)),
    stripLabelY,
    stripTop,
    resultLabelY: stripLabelY(resultRow) + 8,
    resultTop: stripTop(resultRow) + 8,
  };
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
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
  content: string,
  style: { family: string; size: string; fill: string; anchor?: string; weight?: string },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': style.family,
    'font-size': style.size,
    fill: style.fill,
    'text-anchor': style.anchor ?? 'start',
  });
  if (style.weight !== undefined) node.setAttribute('font-weight', style.weight);
  node.textContent = content;
  return node;
}

/** 질의가 폭을 넘으면 WHERE 앞에서 한 번 줄을 바꾼다. 글자는 바꾸지 않는다. */
function queryLines(query: string): string[] {
  const charW = parseFloat(fontSizes.sm) * 0.6;
  if (query.length * charW <= PIECE_CANVAS_W - 2 * PAD) return [query];
  const at = query.indexOf(' WHERE ');
  if (at < 0) return [query];
  return [query.slice(0, at), query.slice(at + 1)];
}

function captionOf(scene: BitwiseCombineSceneState, t: Translate): string {
  switch (scene.step.kind) {
    case 'start':
      return t('caption.start', 'One bit string per condition. The leftmost bit is the first row.');
    case 'combine':
      return t('caption.combine', 'The strings are laid over each other in a single AND. Bits still 1: {n}', {
        n: scene.ones,
      });
    case 'read':
      return t('caption.read', 'Only the rows under a 1 are read: {rows}', {
        rows: scene.read.map((r) => 'r' + String(r.index + 1)).join(', '),
      });
    case 'done': {
      const tally = scene.tally;
      if (tally === null) return '';
      return t('caption.done', 'Rows read: {read} / {total} · Rows never opened: {skipped}', {
        read: tally.read,
        total: tally.total,
        skipped: tally.skipped,
      });
    }
  }
}

function drawStatic(
  svg: SVGSVGElement,
  scene: BitwiseCombineSceneState,
  colors: Palette,
  t: Translate,
): Handles {
  svg.textContent = '';
  const g = geometry(scene);
  const stripColors = categorical(Math.max(2, scene.conditions.length));
  const handles: Handles = {
    resultCells: document.createElementNS(SVG_NS, 'g'),
    ghosts: document.createElementNS(SVG_NS, 'g'),
    links: new Map(),
    boxes: new Map(),
  };

  // 질의
  queryLines(scene.query).forEach((line, i) => {
    label(svg, PAD, QUERY_TOP + i * 16, line, { family: fonts.mono, size: fontSizes.sm, fill: colors.text });
  });

  // 조건마다의 비트 줄 — 이미 있는 인덱스
  scene.conditions.forEach((cond, ci) => {
    label(svg, PAD, g.stripLabelY(ci), cond.column + " = '" + cond.value + "'", {
      family: fonts.mono,
      size: fontSizes.xs,
      fill: colors.textMuted,
    });
    const bits = scene.bits[ci];
    if (bits === undefined) return;
    const fill1 = stripColors[ci] ?? colors.primary;
    for (let i = 0; i < bits.length; i += 1) {
      const on = bits[i] === '1';
      const x = g.colX(i);
      el(svg, 'rect', {
        x,
        y: g.stripTop(ci),
        width: g.cellW,
        height: g.cellH,
        rx: 3,
        fill: on ? fill1 : colors.bgSubtle,
        stroke: on ? fill1 : colors.border,
      });
      label(svg, x + g.cellW / 2, g.stripTop(ci) + g.cellH / 2 + 4, on ? '1' : '0', {
        family: fonts.mono,
        size: fontSizes.sm,
        fill: on ? colors.textInverse : colors.textMuted,
        anchor: 'middle',
      });
    }
  });

  // 포개는 자리 — 빈 자리는 점선으로 먼저 서 있다
  label(svg, PAD, g.resultLabelY, t('label.and', 'AND'), {
    family: fonts.mono,
    size: fontSizes.xs,
    fill: colors.textMuted,
    weight: '600',
  });
  for (let i = 0; i < g.count; i += 1) {
    el(svg, 'rect', {
      x: g.colX(i),
      y: g.resultTop,
      width: g.cellW,
      height: g.cellH,
      rx: 3,
      fill: 'none',
      stroke: colors.border,
      'stroke-dasharray': '3 3',
    });
  }

  // 1 의 자리 → 줄 로 잇는 선 (상자보다 먼저, 뒤에 깔린다)
  const opened = new Set(scene.read.map((r) => r.index));
  const linkLayer = el(svg, 'g', {});
  for (const r of scene.read) {
    const cx = g.colX(r.index) + g.cellW / 2;
    const line = el(linkLayer, 'line', {
      x1: cx,
      y1: g.resultTop + g.cellH,
      x2: cx,
      y2: BOX_TOP,
      stroke: colors.accent,
      'stroke-width': 2,
    });
    handles.links.set(r.index, line);
  }

  // 포갠 결과
  svg.appendChild(handles.resultCells);
  const result = scene.result;
  if (result !== null) {
    for (let i = 0; i < result.length; i += 1) {
      const on = result[i] === '1';
      const x = g.colX(i);
      el(handles.resultCells, 'rect', {
        x,
        y: g.resultTop,
        width: g.cellW,
        height: g.cellH,
        rx: 3,
        fill: on ? colors.accent : colors.bgSubtle,
        stroke: on ? colors.accent : colors.border,
      });
      label(handles.resultCells, x + g.cellW / 2, g.resultTop + g.cellH / 2 + 4, on ? '1' : '0', {
        family: fonts.mono,
        size: fontSizes.sm,
        fill: on ? colors.stateInk : colors.textMuted,
        anchor: 'middle',
        weight: on ? '700' : '400',
      });
    }
  }
  svg.appendChild(handles.ghosts);

  // 표의 줄 — 열리지 않은 줄은 닫힌 채로
  if (scene.table !== '') {
    label(svg, PAD, TABLE_LABEL_Y, scene.table, { family: fonts.mono, size: fontSizes.xs, fill: colors.textMuted });
  }
  const valuesByIndex = new Map(scene.read.map((r) => [r.index, r.values] as const));
  for (let i = 0; i < scene.total; i += 1) {
    const x = g.colX(i);
    const isOpen = opened.has(i);
    const rect = el(svg, 'rect', {
      x,
      y: BOX_TOP,
      width: g.cellW,
      height: isOpen ? BOX_OPEN_H : BOX_CLOSED_H,
      rx: 3,
      fill: isOpen ? colors.bg : colors.bgSubtle,
      stroke: isOpen ? colors.accent : colors.border,
      'stroke-width': isOpen ? 2 : 1,
    });
    if (!isOpen) rect.setAttribute('stroke-dasharray', '3 3');
    label(svg, x + g.cellW / 2, BOX_TOP + 17, 'r' + String(i + 1), {
      family: fonts.mono,
      size: fontSizes.xs,
      fill: isOpen ? colors.text : colors.textMuted,
      anchor: 'middle',
      weight: isOpen ? '700' : '400',
    });
    const values = valuesByIndex.get(i);
    const texts: SVGTextElement[] = [];
    if (values !== undefined) {
      values.forEach((v, vi) => {
        texts.push(
          label(svg, x + g.cellW / 2, BOX_TOP + 35 + vi * 14, v, {
            family: fonts.mono,
            size: fontSizes.xs,
            fill: colors.text,
            anchor: 'middle',
          }),
        );
      });
      handles.boxes.set(i, { rect, values: texts });
    }
  }

  label(svg, PAD, CAPTION_Y, captionOf(scene, t), { family: fonts.body, size: fontSizes.md, fill: colors.text });
  return handles;
}

export const bitwiseCombineStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    const live = (mine: number): boolean => mine === gen && !destroyed;

    /** ms 동안 프레임마다 frame(p) 를 부른다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!live(mine)) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function animateCombine(mine: number, scene: BitwiseCombineSceneState, h: Handles): Promise<void> {
      const g = geometry(scene);
      const stripColors = categorical(Math.max(2, scene.conditions.length));
      const ghosts: { rect: SVGRectElement; from: number; stays: boolean }[] = [];
      const result = scene.result ?? '';
      scene.bits.forEach((bits, ci) => {
        const fill1 = stripColors[ci] ?? colors.primary;
        for (let i = 0; i < bits.length; i += 1) {
          if (bits[i] !== '1') continue;
          const rect = el(h.ghosts, 'rect', {
            x: g.colX(i),
            y: g.stripTop(ci),
            width: g.cellW,
            height: g.cellH,
            rx: 3,
            fill: fill1,
            'fill-opacity': 0.55,
          });
          ghosts.push({ rect, from: g.stripTop(ci), stays: result[i] === '1' });
        }
      });
      h.resultCells.setAttribute('opacity', '0');
      await tween(mine, COMBINE_MS, (p) => {
        const slide = ease(Math.min(1, (p * COMBINE_MS) / COMBINE_SLIDE_MS));
        const settle = Math.max(0, (p * COMBINE_MS - COMBINE_SLIDE_MS) / (COMBINE_MS - COMBINE_SLIDE_MS));
        for (const gh of ghosts) {
          const y = gh.from + (g.resultTop - gh.from) * slide;
          // 둘 다 1 이 아닌 자리는 포개진 뒤 눌려 사라진다 — 1 로 남는 자리만 남는다
          const squeeze = gh.stays ? 1 : 1 - settle;
          const hgt = g.cellH * squeeze;
          gh.rect.setAttribute('y', String(round(y + (g.cellH - hgt) / 2)));
          gh.rect.setAttribute('height', String(round(hgt)));
        }
        h.resultCells.setAttribute('opacity', String(round(settle)));
      });
    }

    async function animateRead(mine: number, scene: BitwiseCombineSceneState, h: Handles): Promise<void> {
      const g = geometry(scene);
      const y1 = g.resultTop + g.cellH;
      for (const [, line] of h.links) line.setAttribute('y2', String(round(y1)));
      for (const [, box] of h.boxes) {
        box.rect.setAttribute('height', String(BOX_CLOSED_H));
        for (const v of box.values) v.setAttribute('opacity', '0');
      }
      await tween(mine, READ_MS, (p) => {
        const ms = p * READ_MS;
        const reach = ease(Math.min(1, ms / READ_LINK_MS));
        const open = ease(Math.max(0, (ms - READ_LINK_MS) / (READ_MS - READ_LINK_MS)));
        for (const [, line] of h.links) line.setAttribute('y2', String(round(y1 + (BOX_TOP - y1) * reach)));
        for (const [, box] of h.boxes) {
          box.rect.setAttribute('height', String(round(BOX_CLOSED_H + (BOX_OPEN_H - BOX_CLOSED_H) * open)));
          for (const v of box.values) v.setAttribute('opacity', String(round(open)));
        }
      });
    }

    const instance = {
      async render(
        next: BitwiseCombineSceneState,
        _prev: BitwiseCombineSceneState | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(svg, next, colors, t);
        if (!opts.animate) return;
        if (next.step.kind === 'combine' && next.result !== null) {
          await animateCombine(mine, next, h);
        } else if (next.step.kind === 'read' && next.read.length > 0) {
          await animateRead(mine, next, h);
        } else {
          return;
        }
        if (!live(mine)) return;
        drawStatic(svg, next, colors, t);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return instance;
  },
};
