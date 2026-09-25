/**
 * pure-same-output stage — 같은 자리에 같은 답이 쌓이고, 바깥을 읽는 함수의 답은 흔들린다.
 *
 * 왼쪽에 프로그램, 오른쪽에 함수마다 한 줄기. 부를 때 인자가 코드 줄에서 함수 상자로 들어가고,
 * 돌려받은 출력이 상자에서 나와 **값의 자리**(출력 축 위 그 값의 가로 위치)에 부른 차례대로 쌓인다.
 * 같은 출력은 같은 가로 자리에 탑으로 서고, 다른 출력은 옆으로 비껴 선다. 바깥 이름을 읽는 함수는
 * 부를 때마다 바깥 칸에서 값의 사본이 상자로 내려간다.
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
import type { PureSameOutputScene } from './scene.js';

const H = 340;
const NS = 'http://www.w3.org/2000/svg';
const PAD = 16;
const CAPTION_H = 44;
const MOTION_MS = 400;
/** 운동 가운데 들어가는 몫 — 나머지가 출력이 나와 자리에 앉는 몫. */
const IN_SHARE = 0.45;
const ROW_MAX = 26;
const LINE_MAX = 20;
const CELL_BLOCK = 34;
const LANE_FOOT = 22;
const LANE_GAP = 10;

type Attrs = Record<string, string | number>;

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: SVGElement,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
}

type LaneGeo = {
  bandTop: number;
  baseline: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  axL: number;
  axR: number;
};

type CellGeo = { name: string; x: number; y: number; nameW: number; valX: number; valW: number; h: number };

type Geo = {
  codeX: number;
  lineH: number;
  lineY: (i: number) => number;
  lineEndX: (i: number) => number;
  lanes: LaneGeo[];
  cells: CellGeo[];
  rowH: number;
  chipW: number;
  chipH: number;
  xv: (lane: number, v: number) => number;
  chipY: (lane: number, row: number) => number;
};

function layout(scene: PureSameOutputScene): Geo {
  const W = PIECE_CANVAS_W;
  const sm = parseFloat(fontSizes.sm);
  const md = parseFloat(fontSizes.md);
  const charSm = sm * 0.6;
  const charMd = md * 0.6;

  const n = Math.max(1, scene.lines.length);
  const codeTop = PAD + 4;
  const codeBottom = H - CAPTION_H - 8;
  const lineH = Math.min(LINE_MAX, (codeBottom - codeTop) / n);
  const codeX = PAD + 10;
  const widest = Math.max(0, ...scene.lines.map((l) => l.indent * 4 + l.text.length));
  const codeRight = codeX + widest * charSm;
  const lineY = (i: number): number => codeTop + lineH * (i + 0.5);
  const lineEndX = (i: number): number => {
    const l = scene.lines[i];
    return l ? codeX + (l.indent * 4 + l.text.length) * charSm : codeX;
  };

  const rx0 = codeRight + 28;
  const rx1 = W - PAD;
  const boxW = Math.max(0, ...scene.lanes.map((l) => l.name.length)) * charMd + 28;

  // 바깥 이름 칸 — 그 이름을 처음 읽는 함수 줄기 바로 위에 선다
  const cellOwner = new Map<string, number>();
  scene.lanes.forEach((lane, k) => {
    for (const name of lane.outer) if (!cellOwner.has(name)) cellOwner.set(name, k);
  });
  const lanesWithCells = new Set(cellOwner.values());

  const rows = Math.max(1, scene.rows);
  const laneCount = Math.max(1, scene.lanes.length);
  const avail = codeBottom - PAD;
  const fixed = lanesWithCells.size * CELL_BLOCK + laneCount * (LANE_FOOT + LANE_GAP);
  const rowH = Math.max(8, Math.min(ROW_MAX, (avail - fixed) / (laneCount * rows)));
  const digits = Math.max(1, String(Math.round(scene.maxOut)).length);
  const chipW = Math.max(26, digits * charSm + 14);
  const chipH = Math.max(6, rowH - 6);

  const lanes: LaneGeo[] = [];
  const cells: CellGeo[] = [];
  let y = PAD;
  scene.lanes.forEach((_, k) => {
    if (lanesWithCells.has(k)) {
      let cx = rx0;
      for (const [name, owner] of cellOwner) {
        if (owner !== k) continue;
        const nameW = name.length * charSm + 6;
        const valW = chipW + 6;
        cells.push({ name, x: cx, y: y + 4, nameW, valX: cx + nameW, valW, h: 22 });
        cx += nameW + valW + 16;
      }
      y += CELL_BLOCK;
    }
    const bandTop = y;
    const bandH = rows * rowH;
    const boxH = Math.min(40, bandH - 4);
    lanes.push({
      bandTop,
      baseline: bandTop + bandH + 2,
      boxX: rx0,
      boxY: bandTop + (bandH - boxH) / 2,
      boxW,
      boxH,
      axL: rx0 + boxW + 30,
      axR: rx1,
    });
    y = bandTop + bandH + LANE_FOOT + LANE_GAP;
  });

  const xv = (lane: number, v: number): number => {
    const g = lanes[lane];
    const span = g.axR - g.axL - chipW;
    const f = scene.maxOut > 0 ? Math.max(0, Math.min(1, v / scene.maxOut)) : 0;
    return g.axL + chipW / 2 + f * span;
  };
  const chipY = (lane: number, row: number): number =>
    lanes[lane].baseline - rowH / 2 - row * rowH;

  return { codeX, lineH, lineY, lineEndX, lanes, cells, rowH, chipW, chipH, xv, chipY };
}

/** 정적 그리기가 운동에 넘기는 손잡이. */
type Handles = {
  outChip: SVGGElement | null;
  lastSeg: SVGLineElement | null;
  cellValue: Map<string, SVGGElement>;
};

function drawChip(
  parent: SVGElement,
  cx: number,
  cy: number,
  w: number,
  h: number,
  label: string,
  stroke: string,
  fill: string,
  ink: string,
  strokeW: number,
): SVGGElement {
  const g = make('g', {}, parent);
  make('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 5, fill, stroke, 'stroke-width': strokeW }, g);
  const tx = make(
    'text',
    {
      x: cx,
      y: cy,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: ink,
    },
    g,
  );
  tx.textContent = label;
  return g;
}

function drawStatic(
  svg: SVGSVGElement,
  scene: PureSameOutputScene,
  geo: Geo,
  c: Palette,
  t: Translate,
): Handles {
  svg.textContent = '';
  const handles: Handles = { outChip: null, lastSeg: null, cellValue: new Map() };
  const step = scene.step;
  const laneColors = categorical(scene.lanes.length);

  // 프로그램 — 지금 밟는 맨 위의 줄과, 부르기라면 그 함수 몸의 줄
  const code = make('g', {}, svg);
  scene.lines.forEach((ln, i) => {
    const y = geo.lineY(i);
    let bar: string | null = null;
    if (step.kind !== 'start' && step.line === i) bar = c.accent;
    if (step.kind === 'call') {
      const lane = scene.lanes[step.lane];
      if (lane && lane.body.includes(i)) bar = laneColors[step.lane];
    }
    if (bar !== null) {
      make('rect', { x: PAD - 2, y: y - geo.lineH / 2 + 1, width: geo.lineEndX(i) - PAD + 10, height: geo.lineH - 2, rx: 3, fill: c.bgSubtle }, code);
      make('rect', { x: PAD - 2, y: y - geo.lineH / 2 + 1, width: 3, height: geo.lineH - 2, fill: bar }, code);
    }
    const tx = make(
      'text',
      {
        x: geo.codeX + ln.indent * 4 * parseFloat(fontSizes.sm) * 0.6,
        y,
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      },
      code,
    );
    tx.textContent = ln.text;
  });

  // 바깥 이름 칸
  const outerLayer = make('g', {}, svg);
  for (const cell of geo.cells) {
    const now = scene.outer.find((o) => o.name === cell.name);
    if (!now) continue;
    const readers = scene.lanes
      .map((lane, k) => ({ lane, k }))
      .filter(({ lane }) => lane.outer.includes(cell.name));
    for (const { k } of readers) {
      const g = geo.lanes[k];
      const wx = Math.max(g.boxX + 8, Math.min(g.boxX + g.boxW - 8, cell.valX + cell.valW / 2));
      make('line', { x1: wx, y1: cell.y + cell.h, x2: wx, y2: g.boxY, stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, outerLayer);
    }
    const nameTx = make(
      'text',
      { x: cell.x, y: cell.y + cell.h / 2, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text },
      outerLayer,
    );
    nameTx.textContent = cell.name;
    make('rect', { x: cell.valX, y: cell.y, width: cell.valW, height: cell.h, rx: 4, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1 }, outerLayer);
    const valG = make('g', {}, outerLayer);
    const valTx = make(
      'text',
      {
        x: cell.valX + cell.valW / 2,
        y: cell.y + cell.h / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      },
      valG,
    );
    valTx.textContent = String(now.value);
    handles.cellValue.set(cell.name, valG);
    const tag = make(
      'text',
      { x: cell.valX + cell.valW + 6, y: cell.y + cell.h / 2, 'dominant-baseline': 'central', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
      outerLayer,
    );
    tag.textContent = t('label.outer', 'outside');
  }

  // 함수 줄기 — 상자 · 출력 축 · 부른 차례대로 쌓인 출력
  scene.lanes.forEach((lane, k) => {
    const g = geo.lanes[k];
    const color = laneColors[k];
    const layer = make('g', {}, svg);
    const active = step.kind === 'call' && step.lane === k;
    make('rect', { x: g.boxX, y: g.boxY, width: g.boxW, height: g.boxH, rx: 6, fill: c.bgSubtle, stroke: color, 'stroke-width': active ? 2.5 : 1.2 }, layer);
    const nm = make(
      'text',
      {
        x: g.boxX + g.boxW / 2,
        y: g.boxY + g.boxH / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: c.text,
      },
      layer,
    );
    nm.textContent = lane.name;

    // 상자에서 축으로 나가는 길
    const midY = g.boxY + g.boxH / 2;
    make('line', { x1: g.boxX + g.boxW, y1: midY, x2: g.axL - 6, y2: midY, stroke: c.border, 'stroke-width': 1 }, layer);
    make('line', { x1: g.axL, y1: g.baseline, x2: g.axR, y2: g.baseline, stroke: c.border, 'stroke-width': 1.5 }, layer);
    const zero = make(
      'text',
      { x: g.axL - 4, y: g.baseline, 'text-anchor': 'end', 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted },
      layer,
    );
    zero.textContent = '0';

    const pile = scene.piles[k] ?? [];
    if (pile.length > 0) {
      const distinct = new Set(pile).size;
      const lab = make(
        'text',
        { x: g.axL, y: g.baseline + 13, 'dominant-baseline': 'central', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        layer,
      );
      lab.textContent = t('label.distinct', 'different outputs: {n}', { n: distinct });
    }

    const pts = pile.map((v, r) => ({ x: geo.xv(k, v), y: geo.chipY(k, r) }));
    const newest = active ? pile.length - 1 : -1;
    for (let r = 1; r < pts.length; r += 1) {
      const seg = make('line', { x1: pts[r - 1].x, y1: pts[r - 1].y, x2: pts[r].x, y2: pts[r].y, stroke: color, 'stroke-width': 1.5, 'stroke-opacity': 0.6 }, layer);
      if (r === newest) handles.lastSeg = seg;
    }
    pile.forEach((v, r) => {
      const chip = drawChip(layer, pts[r].x, pts[r].y, geo.chipW, geo.chipH, String(v), color, c.bg, c.text, r === newest ? 2.5 : 1.5);
      if (r === newest) handles.outChip = chip;
    });
  });

  // 캡션 — 지금 일어난 일만
  const cap = make(
    'text',
    { x: PAD, y: H - CAPTION_H / 2, 'dominant-baseline': 'central', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text },
    svg,
  );
  cap.textContent = caption(scene, t);

  return handles;
}

function caption(scene: PureSameOutputScene, t: Translate): string {
  const step = scene.step;
  if (step.kind === 'start') return t('caption.start', 'Nothing has run yet.');
  if (step.kind === 'assign') {
    if (step.was === null) {
      return t('caption.declare', 'A top-level line creates an outside name: {name} = {value}.', {
        name: step.name,
        value: step.value,
      });
    }
    return t('caption.assign', 'A top-level line changes an outside value: {name} = {was} → {value}.', {
      name: step.name,
      was: step.was,
      value: step.value,
    });
  }
  const lane = scene.lanes[step.lane];
  const call = `${lane ? lane.name : ''}(${step.args.join(', ')})`;
  if (step.reads.length === 0) {
    return t('caption.call', '{call} → {out}. The body read nothing from outside.', { call, out: step.out });
  }
  const reads = step.reads.map((r) => `${r.name} = ${r.value}`).join(', ');
  return t('caption.callRead', '{call} → {out}. The body read from outside: {reads}.', {
    call,
    out: step.out,
    reads,
  });
}

export const pureSameOutputStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const t0 = Date.now();
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
          const p = Math.min(1, (Date.now() - t0) / ms);
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
    }

    async function render(
      next: PureSameOutputScene,
      _prev: PureSameOutputScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const geo = layout(next);
      const h = drawStatic(svg, next, geo, c, t);
      const step = next.step;
      if (!opts.animate || step.kind === 'start') return;

      const moving = make('g', {}, svg);

      if (step.kind === 'call') {
        const g = geo.lanes[step.lane];
        if (!g) return;
        const boxMidY = g.boxY + g.boxH / 2;
        // 인자 — 코드 줄 끝에서 상자 왼쪽으로
        const argFrom = { x: geo.lineEndX(step.line) + geo.chipW / 2 + 4, y: geo.lineY(step.line) };
        const argTo = { x: g.boxX + geo.chipW / 2, y: boxMidY };
        const argChip = drawChip(moving, 0, 0, geo.chipW, geo.chipH, step.args.join(', '), c.textMuted, c.bg, c.text, 1.2);
        // 바깥 값의 사본 — 칸에서 상자 위쪽으로 (원본은 칸에 남는다)
        const readChips = step.reads.map((rd) => {
          const cell = geo.cells.find((cc) => cc.name === rd.name);
          const from = cell ? { x: cell.valX + cell.valW / 2, y: cell.y + cell.h / 2 } : argFrom;
          const to = { x: Math.max(g.boxX + 8, Math.min(g.boxX + g.boxW - 8, from.x)), y: g.boxY + 4 };
          const chip = drawChip(moving, 0, 0, geo.chipW, geo.chipH, String(rd.value), c.accent, c.bg, c.text, 1.5);
          return { chip, from, to };
        });
        // 출력 — 상자 오른쪽에서 값의 자리로
        const pileLen = next.piles[step.lane]?.length ?? 0;
        const outTo = { x: geo.xv(step.lane, step.out), y: geo.chipY(step.lane, pileLen - 1) };
        const outFrom = { x: g.boxX + g.boxW + geo.chipW / 2, y: boxMidY };
        const seg = h.lastSeg;

        await tween(mine, MOTION_MS, (p) => {
          const a = ease(p / IN_SHARE);
          const inside = p < IN_SHARE;
          argChip.setAttribute('transform', `translate(${r1(argFrom.x + (argTo.x - argFrom.x) * a)} ${r1(argFrom.y + (argTo.y - argFrom.y) * a)})`);
          argChip.setAttribute('visibility', inside ? 'visible' : 'hidden');
          for (const rc of readChips) {
            rc.chip.setAttribute('transform', `translate(${r1(rc.from.x + (rc.to.x - rc.from.x) * a)} ${r1(rc.from.y + (rc.to.y - rc.from.y) * a)})`);
            rc.chip.setAttribute('visibility', inside ? 'visible' : 'hidden');
          }
          const b = ease((p - IN_SHARE) / (1 - IN_SHARE));
          const dx = (outFrom.x - outTo.x) * (1 - b);
          const dy = (outFrom.y - outTo.y) * (1 - b);
          if (h.outChip) {
            h.outChip.setAttribute('transform', `translate(${r1(dx)} ${r1(dy)})`);
            h.outChip.setAttribute('visibility', inside ? 'hidden' : 'visible');
          }
          if (seg) {
            seg.setAttribute('x2', String(r1(outTo.x + dx)));
            seg.setAttribute('y2', String(r1(outTo.y + dy)));
            seg.setAttribute('visibility', inside ? 'hidden' : 'visible');
          }
        });
      } else {
        // 넣기 — 새 값이 코드 줄에서 바깥 칸으로 들어가고, 옛 값은 칸에서 밀려 내려간다
        const cell = geo.cells.find((cc) => cc.name === step.name);
        const valG = h.cellValue.get(step.name);
        if (!cell || !valG) return;
        const to = { x: cell.valX + cell.valW / 2, y: cell.y + cell.h / 2 };
        const from = { x: geo.lineEndX(step.line) + geo.chipW / 2 + 4, y: geo.lineY(step.line) };
        const newChip = drawChip(moving, 0, 0, geo.chipW, geo.chipH, String(step.value), c.accent, c.bg, c.text, 1.5);
        const was = step.was;
        const oldTx =
          was === null
            ? null
            : make(
                'text',
                {
                  x: to.x,
                  y: to.y,
                  'text-anchor': 'middle',
                  'dominant-baseline': 'central',
                  'font-family': fonts.mono,
                  'font-size': fontSizes.sm,
                  fill: c.textMuted,
                },
                moving,
              );
        if (oldTx) oldTx.textContent = String(was);

        await tween(mine, MOTION_MS, (p) => {
          const a = ease(p);
          newChip.setAttribute('transform', `translate(${r1(from.x + (to.x - from.x) * a)} ${r1(from.y + (to.y - from.y) * a)})`);
          valG.setAttribute('visibility', 'hidden');
          if (oldTx) {
            oldTx.setAttribute('transform', `translate(0 ${r1(18 * a)})`);
            oldTx.setAttribute('opacity', String(r1(1 - a)));
          }
        });
      }

      if (destroyed || mine !== gen) return;
      drawStatic(svg, next, geo, c, t);
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
