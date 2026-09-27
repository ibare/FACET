/**
 * rasterization 무대 — 왼쪽 넓게 칸 격자, 오른쪽 좁게 깊이 막대(0 가까움 위 · 1 멂 아래).
 *
 * 무대는 셈하지 않는다 — projector 가 좁혀 넘긴 payload(덮는 칸 · 보간 깊이 · 넣은 결과 · 이긴 쪽 · 만나는 선)만 그린다.
 * 운동:
 *   - init 에서 손잡이 꼭짓점의 깊이 표지가 앞 판 깊이에서 새 깊이로 미끄러진다
 *   - interpolate 에서 B 칸의 깊이 음영이 손잡이 꼭짓점 쪽부터 번진다 · 깊이 범위 띠가 꼭짓점 깊이에서 벌어진다
 *   - order 에서 두 무게중심 표지가 막대 위로 내려앉는다
 *   - paint 에서 한 삼각형이 제 칸 전부를 한꺼번에 덮는다
 *   - count 에서 만나는 선이 앞 판 자리(점선)에서 새 자리로 옮겨 간다
 * 운동 길이는 motionMs / 재생 속도 — 부를 때마다 projector 가 지금 속도를 넘긴다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  shiftLightness,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type RasterLine = { x1: number; y1: number; x2: number; y2: number };
export type RasterTri = { id: string; vertices: [number, number][]; depths: number[] };

export type RasterInit = {
  mode: 'depth-buffer' | 'painter';
  width: number;
  height: number;
  motionMs: number;
  triangles: RasterTri[];
  knob: { triangle: string; vertex: number; depth: number; previousDepth: number | null };
  nearDepth: number;
  clearDepth: number;
  ticks: number[];
  previousLine: RasterLine | null;
};
export type RasterCover = { triangles: { id: string; cells: number[] }[]; overlap: number[] };
export type RasterInterpolate = {
  triangle: string;
  cells: { k: number; z: number }[];
  min: number;
  max: number;
  other: { id: string; min: number; max: number; flat: boolean };
};
export type RasterOrder = { centroids: { id: string; depth: number }[]; first: string; second: string };
export type RasterInsert = { triangle: string; empty: number[]; overwritten: number[]; discarded: number[] };
export type RasterPaint = { triangle: string; rank: 'far' | 'near'; cells: number[]; covered: number[] };
export type RasterCount = {
  mode: 'depth-buffer' | 'painter';
  counted: string;
  other: string;
  countedWins: number;
  /** 깊이 버퍼(참)에서 손잡이 삼각형이 이긴 겹친 칸 */
  truthCountedWins: number;
  otherWins: number;
  overlap: number;
  owners: { k: number; id: string }[];
  wrong: number[];
  line: RasterLine | null;
};

/** projector 가 부르는 무대 표면 */
export type RasterizationStage = {
  init(p: RasterInit, speed: number): void;
  cover(p: RasterCover, speed: number): void;
  interpolate(p: RasterInterpolate, speed: number): void;
  order(p: RasterOrder, speed: number): void;
  depthInsert(p: RasterInsert, speed: number): void;
  paint(p: RasterPaint, speed: number): void;
  count(p: RasterCount, speed: number): void;
  reset(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 470;
const GRID_X = 16;
const GRID_Y = 44;
const GRID_W = 464;
const GRID_H = 348;
const BAR_X = 566;
const BAR_W = 14;
const BAR_Y = GRID_Y + 6;
const BAR_H = GRID_H - 12;
const CENTROID_X = 704;
const CENTROID_GAP = 28;
const CAPTION_Y = GRID_Y + GRID_H + 24;
const CAPTION_LINES = 3;

const f3 = (v: number) => {
  const s = v.toFixed(3);
  return s === '-0.000' ? '0.000' : s;
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/** 글자 폭 어림 — 넓은 글자(한중일)는 둘로 센다 */
function wrapText(text: string, maxUnits: number): string[] {
  const unit = (ch: string) => (/[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(ch) ? 1.8 : 1);
  const width = (s: string) => [...s].reduce((a, ch) => a + unit(ch), 0);
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  const pushLong = (w: string) => {
    let part = '';
    for (const ch of w) {
      if (width(part + ch) > maxUnits) {
        lines.push(part);
        part = ch;
      } else part += ch;
    }
    return part;
  };
  for (const w of words) {
    const next = cur === '' ? w : `${cur} ${w}`;
    if (width(next) <= maxUnits) cur = next;
    else if (cur === '') cur = pushLong(w);
    else {
      lines.push(cur);
      cur = width(w) > maxUnits ? pushLong(w) : w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

let mountSeq = 0;

export const rasterizationStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const pal = getColors(params.theme);
    const vivid = categorical(2, 'vivid');
    const pastel = categorical(2, 'pastel');
    const isInstant = params.isInstant ?? (() => false);
    const svg = params.canvas;
    const uid = `raster-${(mountSeq += 1)}`;
    const small = parseFloat(fontSizes.xs);
    const body = parseFloat(fontSizes.sm);

    // 빗금 무늬 — 겹친 칸
    const defs = el('defs', {}, svg);
    const hatch = el('pattern', { id: `${uid}-hatch`, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: pal.text, 'stroke-width': 1.4, 'stroke-opacity': 0.55 }, hatch);

    const root = el('g', {}, svg);

    const frames = new Map<string, number>();
    const cancelAll = () => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
    };
    params.onScrubStart?.(cancelAll);

    /** key 하나에 운동 하나 — 새 운동이 오면 앞 것을 끊는다 */
    const tween = (key: string, dur: number, draw: (p: number) => void) => {
      const prev = frames.get(key);
      if (prev !== undefined) cancelAnimationFrame(prev);
      frames.delete(key);
      if (dur <= 0 || isInstant()) {
        draw(1);
        return;
      }
      draw(0);
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        draw(easeInOut(p));
        if (p < 1) frames.set(key, requestAnimationFrame(step));
        else frames.delete(key);
      };
      frames.set(key, requestAnimationFrame(step));
    };

    // ── 판 상태 (init 이 세운다) ──
    let state: RasterInit | null = null;
    let cell = 0;
    let cells: SVGRectElement[] = [];
    let layers: {
      cells: SVGGElement;
      hatch: SVGGElement;
      marks: SVGGElement;
      outline: SVGGElement;
      line: SVGGElement;
      bar: SVGGElement;
      caption: SVGGElement;
      legend: SVGGElement;
    } | null = null;
    let solidLine: SVGLineElement | null = null;

    const need = (): { s: RasterInit; l: NonNullable<typeof layers> } => {
      if (!state || !layers) throw new Error('rasterization-stage: init 전에 걸음이 왔다');
      return { s: state, l: layers };
    };
    const triIndex = (id: string): number => {
      const { s } = need();
      const i = s.triangles.findIndex((tr) => tr.id === id);
      if (i < 0) throw new Error(`rasterization-stage: 삼각형 ${id} 가 판에 없다`);
      return i;
    };
    const cellRect = (k: number): SVGRectElement => {
      const r = cells[k];
      if (!r) throw new Error(`rasterization-stage: 칸 ${k} 가 격자에 없다`);
      return r;
    };
    const gx = (x: number) => GRID_X + x * cell;
    const gy = (y: number) => GRID_Y + y * cell;
    const cellCenter = (k: number): [number, number] => {
      const { s } = need();
      return [gx((k % s.width) + 0.5), gy(Math.floor(k / s.width) + 0.5)];
    };
    const barY = (z: number) => {
      const { s } = need();
      return BAR_Y + ((z - s.nearDepth) / (s.clearDepth - s.nearDepth)) * BAR_H;
    };
    const motion = (speed: number) => {
      const { s } = need();
      if (!(speed > 0)) throw new Error(`rasterization-stage: 재생 속도 ${speed} 가 양수가 아니다`);
      return s.motionMs / speed;
    };
    const fillCell = (k: number, color: string, dur: number, delay = 0) => {
      const r = cellRect(k);
      r.style.transition = isInstant() || dur <= 0 ? 'none' : `fill ${dur}ms ease ${delay}ms`;
      r.style.fill = color;
    };

    const setCaption = (text: string) => {
      const { l } = need();
      l.caption.replaceChildren();
      const lines = wrapText(text, 96);
      if (lines.length > CAPTION_LINES) throw new Error(`rasterization-stage: 캡션이 ${lines.length} 줄이다`);
      lines.forEach((line, i) => {
        const node = el('text', { x: GRID_X, y: CAPTION_Y + i * (body + 6), 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text }, l.caption);
        node.textContent = line;
      });
    };

    const clear = () => {
      cancelAll();
      root.replaceChildren();
      state = null;
      layers = null;
      cells = [];
      solidLine = null;
    };

    const drawLegend = (g: SVGGElement, s: RasterInit) => {
      let x = GRID_X;
      const y = 20;
      s.triangles.forEach((tr, i) => {
        el('rect', { x, y: y - 10, width: 12, height: 12, fill: vivid[i], rx: 2 }, g);
        const lab = el('text', { x: x + 17, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text, 'font-weight': 600 }, g);
        lab.textContent = tr.id;
        x += 40;
      });
      el('rect', { x, y: y - 10, width: 12, height: 12, fill: `url(#${uid}-hatch)`, stroke: pal.border }, g);
      const sh = el('text', { x: x + 17, y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      sh.textContent = t('label.shared', 'shared cells');
      x += 24 + sh.textContent.length * small * 0.6 + 14;
      el('line', { x1: x, y1: y - 4, x2: x + 18, y2: y - 4, stroke: pal.text, 'stroke-width': 2.5 }, g);
      const ml = el('text', { x: x + 24, y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      ml.textContent = t('label.meet-line', 'meeting line');
      x += 30 + ml.textContent.length * small * 0.6 + 14;
      if (s.mode === 'painter') {
        el('circle', { cx: x + 6, cy: y - 4, r: 5, fill: 'none', stroke: pal.danger, 'stroke-width': 2 }, g);
        const wl = el('text', { x: x + 16, y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
        wl.textContent = t('label.wrong', 'wrong cell');
      }
      const mode = el('text', { x: W - 12, y, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text, 'font-weight': 600 }, g);
      mode.textContent = s.mode === 'depth-buffer' ? t('label.depth-buffer', 'Depth buffer') : t('label.painter', 'Painter’s algorithm');
    };

    const drawBar = (g: SVGGElement, s: RasterInit, speed: number) => {
      const title = el('text', { x: BAR_X + BAR_W / 2, y: BAR_Y - 26, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      title.textContent = t('label.depth', 'Depth');
      el('rect', { x: BAR_X, y: BAR_Y, width: BAR_W, height: BAR_H, fill: pal.bgSubtle, stroke: pal.border }, g);
      for (const tick of s.ticks) {
        const y = barY(tick);
        el('line', { x1: BAR_X - 4, y1: y, x2: BAR_X, y2: y, stroke: pal.border }, g);
        const lab = el('text', { x: BAR_X - 7, y: y + 4, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
        lab.textContent = f3(tick);
      }
      const near = el('text', { x: BAR_X - 7, y: BAR_Y - 12, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      near.textContent = t('label.near', 'near');
      const far = el('text', { x: BAR_X - 7, y: BAR_Y + BAR_H + 16, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      far.textContent = t('label.far', 'far');

      // 꼭짓점 깊이 표지 — 한 삼각형의 세 깊이가 같으면 평면 선 하나, 다르면 꼭짓점마다
      s.triangles.forEach((tr, ti) => {
        const color = vivid[ti];
        const flat = tr.depths[0] === tr.depths[1] && tr.depths[1] === tr.depths[2];
        if (flat) {
          const y = barY(tr.depths[0]);
          el('line', { x1: BAR_X - 2, y1: y, x2: BAR_X + BAR_W + 2, y2: y, stroke: color, 'stroke-width': 3 }, g);
          const lab = el('text', { x: BAR_X + BAR_W + 12, y: y + 4, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: pal.text }, g);
          lab.textContent = `${tr.id} ${f3(tr.depths[0])}`;
          return;
        }
        tr.depths.forEach((z, vi) => {
          const isKnob = tr.id === s.knob.triangle && vi === s.knob.vertex;
          const mark = el('g', {}, g);
          el('path', { d: `M ${BAR_X + BAR_W + 1} 0 l 7 -5 l 0 10 z`, fill: color, stroke: isKnob ? pal.text : 'none', 'stroke-width': 1 }, mark);
          const lab = el('text', { x: BAR_X + BAR_W + 12, y: 4, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: pal.text, 'font-weight': isKnob ? 700 : 400 }, mark);
          lab.textContent = `${tr.id} ${t('label.vertex', 'v{n}', { n: vi + 1 })} ${f3(z)}`;
          if (isKnob && s.knob.previousDepth !== null && s.knob.previousDepth !== z) {
            const from = barY(s.knob.previousDepth);
            const to = barY(z);
            tween('knob', motion(speed), (p) => mark.setAttribute('transform', `translate(0 ${from + (to - from) * p})`));
          } else {
            mark.setAttribute('transform', `translate(0 ${barY(z)})`);
          }
        });
      });
    };

    const drawOutlines = (g: SVGGElement, s: RasterInit) => {
      s.triangles.forEach((tr, ti) => {
        const pts = tr.vertices.map(([x, y]) => `${gx(x)},${gy(y)}`).join(' ');
        el('polygon', { points: pts, fill: 'none', stroke: vivid[ti], 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
        tr.vertices.forEach(([x, y], vi) => {
          const isKnob = tr.id === s.knob.triangle && vi === s.knob.vertex;
          el('circle', { cx: gx(x), cy: gy(y), r: isKnob ? 5 : 3, fill: vivid[ti], stroke: isKnob ? pal.text : 'none', 'stroke-width': 1.5 }, g);
          if (isKnob) {
            const lab = el('text', { x: gx(x) + 9, y: gy(y) + 4, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: pal.text, 'font-weight': 700 }, g);
            lab.textContent = `${tr.id} ${t('label.vertex', 'v{n}', { n: vi + 1 })}`;
          }
        });
      });
    };

    const drawLine = (g: SVGGElement, ln: RasterLine, dashed: boolean): SVGLineElement =>
      el(
        'line',
        {
          x1: gx(ln.x1),
          y1: gy(ln.y1),
          x2: gx(ln.x2),
          y2: gy(ln.y2),
          stroke: pal.text,
          'stroke-width': dashed ? 1.5 : 3,
          'stroke-linecap': 'round',
          ...(dashed ? { 'stroke-dasharray': '4 4', 'stroke-opacity': 0.6 } : {}),
        },
        g,
      );

    const stage: RasterizationStage & ViewInstance = {
      init(p, speed) {
        // 멱등 — 들어오면 비우고 다시 짓는다 (되짚기 · 새 판)
        clear();
        state = p;
        cell = Math.min(GRID_W / p.width, GRID_H / p.height);
        const l = {
          legend: el('g', {}, root),
          cells: el('g', {}, root),
          hatch: el('g', {}, root),
          outline: el('g', {}, root),
          marks: el('g', {}, root),
          line: el('g', {}, root),
          bar: el('g', {}, root),
          caption: el('g', {}, root),
        };
        layers = l;
        for (let r = 0; r < p.height; r += 1) {
          for (let c = 0; c < p.width; c += 1) {
            const rect = el('rect', { x: gx(c), y: gy(r), width: cell, height: cell, stroke: pal.border, 'stroke-width': 0.5 }, l.cells);
            rect.style.fill = pal.bg;
            cells.push(rect);
          }
        }
        drawLegend(l.legend, p);
        drawOutlines(l.outline, p);
        drawBar(l.bar, p, speed);
        // 앞 판의 만나는 선 — 자리만 남긴다 (점선)
        if (p.previousLine) drawLine(l.line, p.previousLine, true);
        triIndex(p.knob.triangle);
        setCaption(
          p.mode === 'depth-buffer'
            ? t('caption.init.depth-buffer', 'Every cell of the depth buffer starts at {clear}. Marked vertex of {tri}: depth {depth}.', {
                clear: f3(p.clearDepth),
                tri: p.knob.triangle,
                depth: f3(p.knob.depth),
              })
            : t('caption.init.painter', 'No buffer: whole triangles are ordered by depth. Marked vertex of {tri}: depth {depth}.', {
                tri: p.knob.triangle,
                depth: f3(p.knob.depth),
              }),
        );
      },

      cover(p, speed) {
        const { s, l } = need();
        const dur = motion(speed);
        if (p.triangles.length !== 2) throw new Error('rasterization-stage: 덮는 칸이 두 삼각형 것이 아니다');
        for (const tr of p.triangles) {
          const ti = triIndex(tr.id);
          for (const k of tr.cells) fillCell(k, pastel[ti], dur);
        }
        l.hatch.replaceChildren();
        for (const k of p.overlap) {
          cellRect(k);
          el('rect', { x: gx(k % s.width), y: gy(Math.floor(k / s.width)), width: cell, height: cell, fill: `url(#${uid}-hatch)`, 'pointer-events': 'none' }, l.hatch);
        }
        const [a, b] = p.triangles;
        setCaption(
          t('caption.cover', 'Cells whose centre lies inside: {a} {na} · {b} {nb} · both {nov} (hatched).', {
            a: a.id,
            na: a.cells.length,
            b: b.id,
            nb: b.cells.length,
            nov: p.overlap.length,
          }),
        );
      },

      interpolate(p, speed) {
        const { s, l } = need();
        const dur = motion(speed);
        const ti = triIndex(p.triangle);
        const tr = s.triangles[ti];
        const [kx, ky] = tr.id === s.knob.triangle ? tr.vertices[s.knob.vertex] : tr.vertices[0];
        const maxDist = Math.hypot(s.width, s.height);
        // 가까울수록 짙게 — 손잡이 꼭짓점에서 멀수록 늦게 번진다
        for (const { k, z } of p.cells) {
          const [cx, cy] = cellCenter(k);
          const dist = Math.hypot((cx - gx(kx)) / cell, (cy - gy(ky)) / cell);
          fillCell(k, shiftLightness(vivid[ti], (z - 0.5) * 0.45), dur * 0.6, (dist / maxDist) * dur * 0.8);
        }
        // 깊이 범위 띠 — 손잡이 깊이에서 벌어진다
        const band = el('rect', { x: BAR_X + 2, width: BAR_W - 4, fill: vivid[ti], 'fill-opacity': 0.55 }, l.bar);
        const from = barY(s.knob.depth);
        const y0 = barY(p.min);
        const y1 = barY(p.max);
        tween('band', dur, (q) => {
          const top = from + (y0 - from) * q;
          const bot = from + (y1 - from) * q;
          band.setAttribute('y', String(top));
          band.setAttribute('height', String(Math.max(0, bot - top)));
        });
        const flat = p.other.flat;
        setCaption(
          flat
            ? t('caption.interpolate.flat', 'Depth of {tri} is blended from its three vertices in every cell: {min} to {max}. {other} is flat at {odepth}.', {
                tri: p.triangle,
                min: f3(p.min),
                max: f3(p.max),
                other: p.other.id,
                odepth: f3(p.other.min),
              })
            : t('caption.interpolate.slope', 'Depth of {tri} is blended from its three vertices in every cell: {min} to {max}. {other} spans {omin} to {omax}.', {
                tri: p.triangle,
                min: f3(p.min),
                max: f3(p.max),
                other: p.other.id,
                omin: f3(p.other.min),
                omax: f3(p.other.max),
              }),
        );
      },

      order(p, speed) {
        const { l } = need();
        const dur = motion(speed);
        const head = el('text', { x: CENTROID_X + CENTROID_GAP / 2, y: BAR_Y - 12, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, l.bar);
        head.textContent = t('label.centroid', 'centroid');
        // 삼각형마다 제 칸 — 두 깊이가 가까워도 표지가 겹치지 않는다. 값 글자는 캡션이 말한다
        for (const c of p.centroids) {
          const ti = triIndex(c.id);
          const cx = CENTROID_X + ti * CENTROID_GAP;
          const g = el('g', {}, l.bar);
          el('line', { x1: CENTROID_X - 34, y1: 0, x2: cx - 8, y2: 0, stroke: vivid[ti], 'stroke-dasharray': '2 3' }, g);
          el('circle', { cx, cy: 0, r: 8, fill: vivid[ti] }, g);
          const lab = el('text', { x: cx, y: 4, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textInverse, 'font-weight': 700 }, g);
          lab.textContent = c.id;
          const to = barY(c.depth);
          const from = BAR_Y - 30;
          tween(`centroid-${c.id}`, dur, (q) => g.setAttribute('transform', `translate(0 ${from + (to - from) * q})`));
        }
        if (p.centroids.length !== 2) throw new Error('rasterization-stage: 무게중심이 둘이 아니다');
        const [a, b] = p.centroids;
        setCaption(
          t('caption.order', 'Centroid depth {a} {ca} · {b} {cb}. The farther one, {first}, is painted first.', {
            a: a.id,
            ca: f3(a.depth),
            b: b.id,
            cb: f3(b.depth),
            first: p.first,
          }),
        );
      },

      depthInsert(p, speed) {
        const { l } = need();
        const dur = motion(speed);
        const ti = triIndex(p.triangle);
        for (const k of [...p.empty, ...p.overwritten]) fillCell(k, vivid[ti], dur);
        // 버린 칸 — 진 쪽 색의 작은 점
        for (const k of p.discarded) {
          const [cx, cy] = cellCenter(k);
          el('circle', { cx, cy, r: Math.max(2, cell * 0.12), fill: vivid[ti], stroke: pal.bg, 'stroke-width': 1 }, l.marks);
        }
        setCaption(
          t('caption.insert', 'Insert {tri}: written to empty cells {empty} · overwritten {over} · discarded {disc}.', {
            tri: p.triangle,
            empty: p.empty.length,
            over: p.overwritten.length,
            disc: p.discarded.length,
          }),
        );
      },

      paint(p, speed) {
        const dur = motion(speed);
        const ti = triIndex(p.triangle);
        // 한꺼번에 덮는다 — 지연 없이 같은 운동
        for (const k of p.cells) fillCell(k, vivid[ti], dur);
        setCaption(
          p.rank === 'far'
            ? t('caption.paint.far', 'Paint the farther triangle {tri}: {n} cells.', { tri: p.triangle, n: p.cells.length })
            : t('caption.paint.near', 'Paint the nearer triangle {tri}: {n} cells, covering all {covered} shared cells without comparing depth.', {
                tri: p.triangle,
                n: p.cells.length,
                covered: p.covered.length,
              }),
        );
      },

      count(p, speed) {
        const { s, l } = need();
        const dur = motion(speed);
        for (const o of p.owners) fillCell(o.k, vivid[triIndex(o.id)], 0);
        for (const k of p.wrong) {
          const [cx, cy] = cellCenter(k);
          el('circle', { 'data-mark': 'wrong', cx, cy, r: cell * 0.3, fill: 'none', stroke: pal.danger, 'stroke-width': 2.2 }, l.marks);
        }
        if (solidLine) solidLine.remove();
        solidLine = null;
        if (p.line) {
          const to = p.line;
          const mid = { x: (to.x1 + to.x2) / 2, y: (to.y1 + to.y2) / 2 };
          const from = s.previousLine ?? { x1: mid.x, y1: mid.y, x2: mid.x, y2: mid.y };
          const line = drawLine(l.line, from, false);
          solidLine = line;
          tween('line', dur, (q) => {
            line.setAttribute('x1', String(gx(from.x1 + (to.x1 - from.x1) * q)));
            line.setAttribute('y1', String(gy(from.y1 + (to.y1 - from.y1) * q)));
            line.setAttribute('x2', String(gx(from.x2 + (to.x2 - from.x2) * q)));
            line.setAttribute('y2', String(gy(from.y2 + (to.y2 - from.y2) * q)));
          });
        }
        const first = t('caption.count', 'Shared cells won by {other}: {wins}.', { other: p.other, wins: p.otherWins });
        // 화가 판은 틀린 칸 수로 가른다 — 선이 가른다는 말은 깊이 버퍼에서 B 가 이긴 칸이 있고 선이 있을 때만
        const second =
          p.mode === 'painter'
            ? p.wrong.length === 0
              ? t('caption.line.painter.agree', 'No shared cell differs from the depth buffer.')
              : p.truthCountedWins > 0 && p.line !== null
                ? t('caption.line.painter', 'The solid line is where the depth buffer splits them; marked cells disagree with it.')
                : t('caption.line.painter.marks', 'Marked cells differ from the depth buffer.')
            : p.line === null
              ? t('caption.line.none', 'Inside the overlap the two depths are never equal.')
              : t('caption.line.cross', 'The meeting line, where the two depths are equal, crosses the overlap.');
        setCaption(`${first} ${second}`);
      },

      reset() {
        clear();
      },

      destroy() {
        clear();
      },
    };
    return stage;
  },
};
