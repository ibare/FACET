/**
 * ancestor-as-referee 의 stage.
 *
 * 세 칸 — 왼쪽 우리 쪽, 가운데 조상, 오른쪽 그쪽. 조상 칸은 들어오기 전엔 비어 있다.
 * 두 쪽을 견주면 다른 자리마다 양쪽 사이에 "?" 가 둘 선다 (어느 쪽이 고쳤는지 이야기가 둘).
 * 조상이 위에서 내려와 가운데에 앉고, 자리마다 조상과 같은 쪽의 "?" 는 "=" 가 되며
 * 다른 쪽의 "?" 는 그 칸을 가로질러 바깥으로 나가 판정 표(바꿈 · 지움 · 넣음)로 선다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { refereeLayout, type Edit, type RefereeLayout, type Side } from './algorithm';
import type { AncestorAsRefereeScene } from './scene';

const H = 300;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 8;
const TOP = 10;
const HEADER_H = 20;
const ROWS_TOP = TOP + HEADER_H + 6;
const FOOT_H = 56;
const ROW_H_MAX = 36;
const GAP_W = 28;
const MARK_R = 9;
const TAG_H = 20;

const SCAN_MS = 650;
const SLIDE_MS = 700;
const VERDICT_MS = 650;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function sideName(t: Translate, side: Side | 'base'): string {
  if (side === 'ours') return t('label.ours', 'ours');
  if (side === 'theirs') return t('label.theirs', 'theirs');
  return t('label.base', 'ancestor');
}

function editName(t: Translate, edit: Edit): string {
  if (edit === 'change') return t('label.change', 'changed');
  if (edit === 'delete') return t('label.delete', 'deleted');
  return t('label.insert', 'added');
}

function ease(e: number): number {
  return e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
}

/** 가로 배치 — 폭에서 역산한다. 판정 표 폭은 가장 긴 손질 이름에서. */
type Geo = {
  tagW: number;
  cellW: number;
  x: Record<Side | 'base', number>;
  markX: Record<Side, number>;
  tagX: Record<Side, number>;
  rowH: number;
  codePx: number;
  numW: number;
};

function geometry(t: Translate, rows: number): Geo {
  const xs = parseFloat(fontSizes.xs);
  const longest = Math.max(...(['change', 'delete', 'insert'] as const).map((e) => editName(t, e).length));
  const tagW = Math.min(84, Math.max(44, longest * xs * 0.62 + 14));
  const cellW = (W - 2 * PAD - 2 * (tagW + 6) - 2 * GAP_W) / 3;
  const oursX = PAD + tagW + 6;
  const baseX = oursX + cellW + GAP_W;
  const theirsX = baseX + cellW + GAP_W;
  const avail = H - ROWS_TOP - FOOT_H;
  const rowH = Math.min(ROW_H_MAX, avail / Math.max(rows, 1));
  return {
    tagW,
    cellW,
    x: { ours: oursX, base: baseX, theirs: theirsX },
    markX: { ours: oursX + cellW + GAP_W / 2, theirs: baseX + cellW + GAP_W / 2 },
    tagX: { ours: PAD, theirs: W - PAD - tagW },
    rowH,
    codePx: parseFloat(fontSizes.sm),
    numW: parseFloat(fontSizes.xs) * 1.6,
  };
}

/** 정적 그리기가 돌려주는 손잡이 — 운동이 만질 요소들. */
type Handles = {
  baseLayer: SVGGElement | null;
  marks: Map<number, SVGGElement[]>;
  bands: Map<number, SVGRectElement>;
  tags: Map<number, { g: SVGGElement; dx: number }>;
  eqs: Map<number, SVGTextElement>;
  rowsBottom: number;
};

function drawScene(
  svg: SVGSVGElement,
  scene: AncestorAsRefereeScene,
  layout: RefereeLayout,
  t: Translate,
  c: Palette,
): Handles {
  svg.textContent = '';
  const geo = geometry(t, layout.rows.length);
  const { rowH, cellW } = geo;
  const cellH = rowH - 8;
  const rowY = (r: number): number => ROWS_TOP + r * rowH;
  if (scene.spots !== null && scene.spots !== layout.spots.length) {
    throw new Error(`ancestor-as-referee-stage: 장면의 다른 자리 ${scene.spots} 이 배치의 자리 ${layout.spots.length} 과 다르다`);
  }
  for (const v of scene.verdicts) {
    const spot = layout.spots[v.spot];
    if (!spot) throw new Error(`ancestor-as-referee-stage: 판정의 자리 ${v.spot} 이 배치에 없다`);
    if (spot.changer !== v.changer || spot.edit !== v.edit) {
      throw new Error(`ancestor-as-referee-stage: 자리 ${v.spot} 의 판정이 배치의 셈과 다르다`);
    }
  }
  const verdictOf = new Map(scene.verdicts.map((v) => [v.spot, v]));
  const handles: Handles = {
    baseLayer: null,
    marks: new Map(),
    bands: new Map(),
    tags: new Map(),
    eqs: new Map(),
    rowsBottom: rowY(layout.rows.length),
  };

  // 다른 자리의 띠 — 견준 뒤에만
  if (scene.spots !== null) {
    layout.spots.forEach((spot, k) => {
      const y0 = rowY(spot.rows[0]);
      const h = spot.rows.length * rowH;
      handles.bands.set(
        k,
        el('rect', { x: geo.x.ours - 4, y: y0 + 1, width: geo.x.theirs + cellW - geo.x.ours + 8, height: h - 2, rx: 4, fill: c.bgSubtle }, svg),
      );
    });
  }

  const header = (side: Side | 'base', parent: Element): void => {
    const txt = el('text', {
      x: geo.x[side] + cellW / 2,
      y: TOP + HEADER_H / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      'font-weight': 600,
      fill: side === 'base' ? c.text : c.textMuted,
    }, parent);
    txt.textContent = sideName(t, side);
  };

  const cell = (side: Side | 'base', r: number, lineNo: number | null, text: string | null, parent: Element, strong: boolean): void => {
    const x = geo.x[side];
    const y = rowY(r) + 4;
    if (lineNo === null || text === null) {
      el('rect', {
        x, y, width: cellW, height: cellH, rx: 4,
        fill: 'none',
        stroke: strong ? c.accent : c.border,
        'stroke-width': strong ? 2 : 1,
        'stroke-dasharray': '4 3',
      }, parent);
      return;
    }
    el('rect', {
      x, y, width: cellW, height: cellH, rx: 4,
      fill: side === 'base' ? c.bgSubtle : c.bg,
      stroke: strong ? c.accent : c.border,
      'stroke-width': strong ? 2 : 1,
    }, parent);
    const num = el('text', {
      x: x + 6 + geo.numW / 2,
      y: y + cellH / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    }, parent);
    num.textContent = String(lineNo + 1);
    const code = el('text', {
      x: x + 6 + geo.numW + 6,
      y: y + cellH / 2,
      'dominant-baseline': 'central',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: c.text,
      style: 'white-space: pre',
    }, parent);
    code.textContent = text;
  };

  header('ours', svg);
  header('theirs', svg);

  layout.rows.forEach((row, r) => {
    const v = row.spot === null ? undefined : verdictOf.get(row.spot);
    cell('ours', r, row.ours, row.ours === null ? null : scene.ours[row.ours], svg, v?.changer === 'ours');
    cell('theirs', r, row.theirs, row.theirs === null ? null : scene.theirs[row.theirs], svg, v?.changer === 'theirs');
  });

  // 조상 칸 — 들어온 뒤에만
  if (scene.ancestorIn) {
    const layer = el('g', {}, svg);
    header('base', layer);
    layout.rows.forEach((row, r) => {
      cell('base', r, row.base, row.base === null ? null : scene.base[row.base], layer, false);
    });
    handles.baseLayer = layer;
  }

  // 자리마다 — 판정 전엔 "?" 둘, 판정 뒤엔 "=" 하나와 판정 표 하나
  if (scene.spots !== null) {
    layout.spots.forEach((spot, k) => {
      const cy = rowY(spot.rows[0]) + (spot.rows.length * rowH) / 2;
      const v = verdictOf.get(k);
      if (!v) {
        const pair: SVGGElement[] = [];
        for (const side of ['ours', 'theirs'] as const) {
          const g = el('g', { transform: `translate(${r2(geo.markX[side])} ${r2(cy)})` }, svg);
          el('circle', { cx: 0, cy: 0, r: MARK_R, fill: c.bg, stroke: c.itemComparing, 'stroke-width': 1.5 }, g);
          const q = el('text', {
            x: 0, y: 0,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: c.itemComparing,
          }, g);
          q.textContent = t('mark.unknown', '?');
          pair.push(g);
        }
        handles.marks.set(k, pair);
        return;
      }
      const same: Side = v.changer === 'ours' ? 'theirs' : 'ours';
      const eq = el('text', {
        x: geo.markX[same],
        y: cy,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': 700,
        fill: c.textMuted,
      }, svg);
      eq.textContent = t('mark.same', '=');
      handles.eqs.set(k, eq);

      const tx = geo.tagX[v.changer];
      const g = el('g', {}, svg);
      el('rect', { x: tx, y: cy - TAG_H / 2, width: geo.tagW, height: TAG_H, rx: TAG_H / 2, fill: c.accent }, g);
      const label = el('text', {
        x: tx + geo.tagW / 2,
        y: cy,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: c.stateInk,
      }, g);
      label.textContent = editName(t, v.edit);
      // 운동의 출발 — 판정 전 "?" 가 서 있던 자리 (고친 쪽 칸과 조상 사이)
      handles.tags.set(k, { g, dx: geo.markX[v.changer] - (tx + geo.tagW / 2) });
    });
  }

  // 캡션 — 지금 일어나는 일
  const caption = el('text', {
    x: W / 2,
    y: H - FOOT_H + 20,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-family': fonts.body,
    'font-size': fontSizes.md,
    fill: c.text,
  }, svg);
  caption.textContent = captionOf(scene, layout, t);

  if (scene.spots !== null) {
    const ours = scene.verdicts.filter((v) => v.changer === 'ours').length;
    const theirs = scene.verdicts.filter((v) => v.changer === 'theirs').length;
    const tally = el('text', {
      x: W / 2,
      y: H - FOOT_H + 42,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    }, svg);
    tally.textContent = t('caption.tally', 'Ours changed: {ours} · Theirs changed: {theirs} · Undecided: {open}', {
      ours,
      theirs,
      open: scene.spots - scene.verdicts.length,
    });
  }
  return handles;
}

function captionOf(scene: AncestorAsRefereeScene, layout: RefereeLayout, t: Translate): string {
  const step = scene.step;
  if (step.kind === 'start') return t('caption.start', 'Ours and theirs: one file, edited apart.');
  if (step.kind === 'compare') {
    if (scene.spots === null) throw new Error('ancestor-as-referee-stage: 견준 걸음인데 다른 자리의 수가 없다');
    return t('caption.compare', 'Ours against theirs — differing spots: {n}. Who changed each: unknown.', {
      n: scene.spots,
    });
  }
  if (step.kind === 'ancestor') return t('caption.ancestor', 'The common ancestor comes in: the file before the split.');
  const v = scene.verdicts.find((x) => x.spot === step.spot);
  if (!v) throw new Error(`ancestor-as-referee-stage: 자리 ${step.spot} 의 판정이 장면에 없다`);
  return t('caption.verdict', 'Spot {k} of {n}: the ancestor matches {same}, so {changer} changed it — {edit}.', {
    k: step.spot + 1,
    n: layout.spots.length,
    same: sideName(t, v.changer === 'ours' ? 'theirs' : 'ours'),
    changer: sideName(t, v.changer),
    edit: editName(t, v.edit),
  });
}

export const ancestorAsRefereeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;
    let cached: { key: AncestorAsRefereeScene['base']; layout: RefereeLayout } | null = null;

    const layoutOf = (scene: AncestorAsRefereeScene): RefereeLayout => {
      if (cached && cached.key === scene.base) return cached.layout;
      const layout = refereeLayout(scene.base, scene.ours, scene.theirs);
      cached = { key: scene.base, layout };
      return layout;
    };

    /** 한 시계로 흐르는 운동. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    const tween = (ms: number, mine: number, frame: (e: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        const total = Math.max(1, Math.round(ms / FRAME_MS));
        let k = 0;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          k += 1;
          frame(Math.min(1, k / total));
          if (k >= total) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });

    const live = (mine: number): boolean => mine === gen && !destroyed;

    return {
      async render(next: AncestorAsRefereeScene, prev: AncestorAsRefereeScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        const layout = layoutOf(next);
        const h = drawScene(svg, next, layout, t, c);
        if (!opts.animate || prev === null) return;

        if (next.step.kind === 'compare' && prev.spots === null) {
          // 위에서 아래로 두 쪽을 훑는다 — 지나간 자리에 "?" 둘이 선다
          const rowsTop = ROWS_TOP;
          const span = h.rowsBottom - rowsTop;
          const scan = el('line', { x1: PAD, x2: W - PAD, y1: rowsTop, y2: rowsTop, stroke: c.itemComparing, 'stroke-width': 1.5 }, svg);
          const spotTop = new Map<number, number>();
          layout.spots.forEach((s, k) => spotTop.set(k, rowsTop + (s.rows[0] + s.rows.length / 2) * (span / layout.rows.length)));
          const hideUntil = (k: number, y: number): void => {
            const top = spotTop.get(k);
            if (top === undefined) throw new Error(`ancestor-as-referee-stage: 자리 ${k} 의 높이가 없다`);
            const on = y >= top;
            const marks = h.marks.get(k);
            if (!marks) throw new Error(`ancestor-as-referee-stage: 자리 ${k} 의 "?" 가 그려지지 않았다`);
            for (const m of marks) {
              if (on) m.removeAttribute('opacity');
              else m.setAttribute('opacity', '0');
            }
            const band = h.bands.get(k);
            if (!band) throw new Error(`ancestor-as-referee-stage: 자리 ${k} 의 띠가 그려지지 않았다`);
            if (on) band.removeAttribute('opacity');
            else band.setAttribute('opacity', '0');
          };
          await tween(SCAN_MS, mine, (e) => {
            const y = r2(rowsTop + span * e);
            scan.setAttribute('y1', String(y));
            scan.setAttribute('y2', String(y));
            for (const k of spotTop.keys()) hideUntil(k, y);
          });
        } else if (next.step.kind === 'ancestor' && !prev.ancestorIn) {
          // 조상 칸이 위에서 내려와 가운데에 앉는다
          const layer = h.baseLayer;
          if (!layer) throw new Error('ancestor-as-referee-stage: 조상 걸음인데 조상 칸이 그려지지 않았다');
          const drop = h.rowsBottom;
          await tween(SLIDE_MS, mine, (e) => {
            layer.setAttribute('transform', `translate(0 ${r2(-drop * (1 - ease(e)))})`);
          });
        } else if (next.step.kind === 'verdict' && prev.verdicts.length < next.verdicts.length) {
          // 고친 쪽의 "?" 가 그 칸을 가로질러 바깥으로 나가 판정 표로 선다. 같은 쪽의 "?" 는 "=" 가 된다
          const spot = next.step.spot;
          const tag = h.tags.get(spot);
          const eq = h.eqs.get(spot);
          if (!tag || !eq) throw new Error(`ancestor-as-referee-stage: 자리 ${spot} 의 판정 표가 그려지지 않았다`);
          await tween(VERDICT_MS, mine, (e) => {
            const k = ease(e);
            tag.g.setAttribute('transform', `translate(${r2(tag.dx * (1 - k))} 0)`);
            eq.setAttribute('opacity', String(r2(k)));
          });
        } else {
          return;
        }
        if (live(mine)) drawScene(svg, next, layout, t, c);
      },
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
