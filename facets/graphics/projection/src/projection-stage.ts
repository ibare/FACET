/**
 * 카메라와 투영 — 무대.
 *
 * 왼쪽: 위에서 본 모습(세계 x–z) — 눈 · 시야 쐐기(원근) 또는 평행 띠(직교) · 가까운 면 · 상자 둘 · 깊이 막대.
 * 가운데: 앞 상자 곁 확대 — 같은 장면을 크게, 가까운 면이 앞 상자를 가르는 자리를 본다.
 * 오른쪽: 화면(NDC ±1 틀) — 두 상의 선틀 · 앞 판 상의 점선 틀(자리) · 폭 글자. 그 아래 앞/뒤 비 눈금 막대.
 *
 * 운동 (재생 속도를 따라간다):
 *   판 머리  눈이 앞 판 자리에서 새 거리로 옮겨 가고, 쐐기 ↔ 띠가 펴지거나 좁혀진다 · 앞 판 상은 점선 틀로만 남는다
 *   걸음 1   눈에서 두 상자까지 깊이 막대가 뻗는다
 *   걸음 2   버릴 모서리가 걷히고, 잘릴 모서리의 끝이 가까운 면 위 새 꼭짓점까지 미끄러진다
 *   걸음 3   두 상이 앞 판 크기에서 새 크기로 저마다의 비율로 커지거나 작아진다
 *   걸음 4   비 눈금의 표지가 앞 판의 비에서 새 비로 옮겨 간다
 * 무대는 셈하지 않는다 — 좌표 · 폭 · 비 · 잘림은 모두 payload 로 받는다. 여기서 하는 것은 그리기 변환뿐이다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { CameraView, ClipView, CompareView, ProjectView, RoundView } from './projector.js';

type V3 = [number, number, number];

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 470;

// 자리 (px)
const TX = 16;
const TY = 58;
const TW = 290;
const TH = 396;
const IX = 322;
const IY = 58;
const IW = 140;
const IH = 210;
const IU = 88;
const SX = 486;
const SY = 58;
const SS = 216;
const GX0 = 496;
const GX1 = 700;
const GY = 420;

let clipSeq = 0;

type CamState = { eye: V3; sx: number; slope: number };

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** 표시할 때만 반올림 — `−0.00` 은 `0.00` */
function fmt(x: number, digits: number): string {
  const s = x.toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : s;
}

export const projectionStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const [frontColor, backColor] = categorical(2, 'vivid');
    if (!frontColor || !backColor) throw new Error('projection-stage: 상자 색 둘을 얻지 못했다');
    const smPx = parseFloat(fontSizes.sm);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const el = (tag: string, attrs: Record<string, string | number>, parent: Element, text?: string): SVGElement => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    };
    const label = (x: number, y: number, text: string, parent: Element, extra: Record<string, string | number> = {}) =>
      el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...extra }, parent, text);

    const root = el('g', { class: 'projection-stage' }, svg);
    const uid = `projection-clip-${clipSeq++}`;
    const defs = el('defs', {}, root);
    const topClip = el('clipPath', { id: `${uid}-top` }, defs);
    el('rect', { x: TX, y: TY, width: TW, height: TH }, topClip);
    const insetClip = el('clipPath', { id: `${uid}-inset` }, defs);
    el('rect', { x: IX, y: IY, width: IW, height: IH }, insetClip);

    // 틀 (판과 상관없이 한 번)
    const frame = el('g', {}, root);
    el('rect', { x: TX, y: TY, width: TW, height: TH, fill: c.bgSubtle, stroke: c.border }, frame);
    label(TX, TY - 8, t('label.top', 'Seen from above'), frame, { fill: c.textMuted });
    el('rect', { x: IX, y: IY, width: IW, height: IH, fill: c.bgSubtle, stroke: c.border }, frame);
    label(IX, IY - 8, t('label.zoom', 'Around the front box'), frame, { fill: c.textMuted });
    el('rect', { x: SX, y: SY, width: SS, height: SS, fill: c.bg, stroke: c.text }, frame);
    el('line', { x1: SX + SS / 2, y1: SY, x2: SX + SS / 2, y2: SY + SS, stroke: c.border }, frame);
    el('line', { x1: SX, y1: SY + SS / 2, x2: SX + SS, y2: SY + SS / 2, stroke: c.border }, frame);
    label(SX, SY - 8, t('label.screen', 'Screen'), frame, { fill: c.textMuted });
    const legendY = IY + IH + 26;
    el('rect', { x: IX, y: legendY - 10, width: 12, height: 12, fill: 'none', stroke: frontColor, 'stroke-width': 2 }, frame);
    label(IX + 18, legendY, t('label.front', 'Front box'), frame);
    el('rect', { x: IX, y: legendY + 10, width: 12, height: 12, fill: 'none', stroke: backColor, 'stroke-width': 2 }, frame);
    label(IX + 18, legendY + 20, t('label.back', 'Back box'), frame);

    const captionEl = label(TX, 24, '', root, { 'font-size': fontSizes.md });
    const dyn = el('g', {}, root);

    // ─── 상태 ────────────────────────────────────────────────────────────────
    let round: RoundView | null = null;
    let camFrom: CamState | null = null;
    let camTo: CamState | null = null;
    let camK = 1;
    let bars: CameraView | null = null;
    let barK = 1;
    let clip: ClipView | null = null;
    let clipK = 1;
    let images: ProjectView | null = null;
    let imgFrom = new Map<string, number>();
    let imgK = 1;
    let frames: { id: string; bounds: { xMin: number; xMax: number; yMin: number; yMax: number } }[] = [];
    const prevWidth = new Map<string, number>();
    let ratio: CompareView | null = null;
    let ratioFrom = 0;
    let ratioK = 1;
    let markerAt: number | null = null;
    let caption = '';

    // ─── 운동 ────────────────────────────────────────────────────────────────
    const active = new Map<string, { start: number; dur: number; set: (k: number) => void }>();
    let raf: number | null = null;
    let destroyed = false;

    const tick = (now: number) => {
      raf = null;
      if (destroyed) return;
      for (const [key, m] of active) {
        const k = Math.min(1, (now - m.start) / m.dur);
        m.set(ease(Math.max(0, k)));
        if (k >= 1) active.delete(key);
      }
      render();
      if (active.size > 0) raf = requestAnimationFrame(tick);
    };
    const tween = (key: string, ms: number, set: (k: number) => void) => {
      if (isInstant() || typeof requestAnimationFrame !== 'function') {
        set(1);
        render();
        return;
      }
      set(0);
      active.set(key, { start: performance.now(), dur: ms, set });
      render();
      if (raf === null) raf = requestAnimationFrame(tick);
    };
    const stopAll = (finish: boolean) => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      if (finish) for (const m of active.values()) m.set(1);
      active.clear();
    };
    const motionMs = (speed: number): number => {
      if (!round) throw new Error('projection-stage: 판 머리 전에 걸음이 왔다');
      if (!(speed > 0)) throw new Error(`projection-stage: 재생 속도 ${speed} 가 양수가 아니다`);
      return round.motionMs / speed;
    };

    // ─── 그리기 ──────────────────────────────────────────────────────────────
    const boxColor = (id: string): string => {
      if (id === 'front') return frontColor;
      if (id === 'back') return backColor;
      throw new Error(`projection-stage: 모르는 상자 ${id}`);
    };
    const boxName = (id: string): string => {
      if (id === 'front') return t('label.front', 'Front box');
      if (id === 'back') return t('label.back', 'Back box');
      throw new Error(`projection-stage: 모르는 상자 ${id}`);
    };
    const camNow = (): CamState | null => {
      if (!camFrom || !camTo) return null;
      return { eye: lerp3(camFrom.eye, camTo.eye, camK), sx: lerp(camFrom.sx, camTo.sx, camK), slope: lerp(camFrom.slope, camTo.slope, camK) };
    };

    type Mapper = (p: V3) => [number, number];

    /** 위에서 본 장면 하나 — 큰 그림과 확대가 같은 것을 저마다의 축척으로 */
    const drawScene = (g: Element, map: Mapper, r: RoundView, cam: CamState, detail: boolean) => {
      const along = (depth: number, lateral: number): V3 => [
        cam.eye[0] + r.forward[0] * depth + r.right[0] * lateral,
        cam.eye[1] + r.forward[1] * depth + r.right[1] * lateral,
        cam.eye[2] + r.forward[2] * depth + r.right[2] * lateral,
      ];
      const far = (r.topRange.zMax - r.topRange.zMin) * 2;
      // 쐐기 / 띠의 두 변
      for (const s of [-1, 1]) {
        const [x1, y1] = map(along(0, s * cam.sx));
        const [x2, y2] = map(along(far, s * (cam.sx + cam.slope * far)));
        el('line', { x1, y1, x2, y2, stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '5 4' }, g);
      }
      if (cam.sx > 0) {
        const [x1, y1] = map(along(0, -cam.sx));
        const [x2, y2] = map(along(0, cam.sx));
        el('line', { x1, y1, x2, y2, stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '5 4' }, g);
      }
      // 가까운 면
      const nh = cam.sx + cam.slope * r.near;
      const [n1x, n1y] = map(along(r.near, -nh));
      const [n2x, n2y] = map(along(r.near, nh));
      el('line', { x1: n1x, y1: n1y, x2: n2x, y2: n2y, stroke: c.text, 'stroke-width': 2 }, g);
      if (detail) label(n1x - 4, n1y + 4, t('label.near', 'Near plane'), g, { 'font-size': fontSizes.xs, 'text-anchor': 'end' });
      // 상자 둘의 선틀 (x–z 로 눕힌 모습)
      for (const box of r.boxes) {
        const col = boxColor(box.id);
        const cb = clip?.boxes.find((b) => b.id === box.id);
        box.edges.forEach(([a, b], i) => {
          const pa = box.corners[a];
          const pb = box.corners[b];
          if (!pa || !pb) throw new Error(`projection-stage: ${box.id} 의 모서리 (${a}, ${b}) 꼭짓점이 없다`);
          let from: V3 = pa;
          let to: V3 = pb;
          let opacity = 1;
          if (cb) {
            const ce = cb.edges[i];
            if (!ce || ce.a !== a || ce.b !== b) throw new Error(`projection-stage: ${box.id} 의 자른 모서리 ${i} 가 맞지 않는다`);
            if (ce.status === 'dropped') {
              const mid = lerp3(pa, pb, 0.5);
              from = lerp3(pa, mid, clipK);
              to = lerp3(pb, mid, clipK);
              opacity = 1 - clipK;
            } else if (ce.status === 'cut') {
              from = lerp3(pa, ce.from, clipK);
              to = lerp3(pb, ce.to, clipK);
            }
          }
          if (opacity <= 0) return;
          const [x1, y1] = map(from);
          const [x2, y2] = map(to);
          el('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 2, 'stroke-linecap': 'butt', opacity }, g);
        });
        if (cb) {
          for (const ce of cb.edges) {
            if (ce.status !== 'cut') continue;
            for (const [end, orig] of [
              [ce.from, box.corners[ce.a]],
              [ce.to, box.corners[ce.b]],
            ] as [V3, V3 | undefined][]) {
              if (!orig) throw new Error(`projection-stage: ${box.id} 의 꼭짓점이 없다`);
              if (end[0] === orig[0] && end[1] === orig[1] && end[2] === orig[2]) continue;
              const [x, y] = map(lerp3(orig, end, clipK));
              el('circle', { cx: x, cy: y, r: detail ? 3.5 : 2, fill: c.itemComparing }, g);
            }
          }
        }
      }
      // 깊이 막대
      if (bars) {
        bars.boxes.forEach((b, i) => {
          const col = boxColor(b.id);
          const lateral = 1.2 + 0.7 * i;
          const reach = b.depthMax * barK;
          const [ex, ey] = map(along(0, lateral));
          const [fx, fy] = map(along(reach, lateral));
          el('line', { x1: ex, y1: ey, x2: fx, y2: fy, stroke: col, 'stroke-width': 1.5 }, g);
          if (reach > b.depthMin) {
            const [ax, ay] = map(along(b.depthMin, lateral));
            el('line', { x1: ax, y1: ay, x2: fx, y2: fy, stroke: col, 'stroke-width': 5 }, g);
          }
          if (detail && barK >= 1) {
            const [mx, my] = map(along((b.depthMin + b.depthMax) / 2, lateral));
            label(mx + 6, my + 4, t('label.depth', 'depth {min}..{max}', { min: fmt(b.depthMin, 2), max: fmt(b.depthMax, 2) }), g, {
              fill: col,
              'font-size': fontSizes.xs,
            });
          }
        });
      }
      // 눈
      const [ex, ey] = map(cam.eye);
      el('circle', { cx: ex, cy: ey, r: detail ? 5 : 4, fill: c.text }, g);
      if (detail) label(ex + 8, ey + 4, t('label.eye', 'Eye'), g, { 'font-size': fontSizes.xs });
    };

    const render = () => {
      while (dyn.firstChild) dyn.removeChild(dyn.firstChild);
      captionEl.textContent = caption;
      const cam = camNow();
      if (round && cam) {
        const r = round;
        const u = TH / (r.topRange.zMax - r.topRange.zMin);
        const topMap: Mapper = (p) => [TX + TW / 2 + p[0] * u, TY + (p[2] - r.topRange.zMin) * u];
        const gTop = el('g', { 'clip-path': `url(#${uid}-top)` }, dyn);
        drawScene(gTop, topMap, r, cam, true);
        const front = r.boxes.find((b) => b.id === 'front');
        if (!front) throw new Error('projection-stage: 앞 상자가 없다');
        const z0 = Math.min(...front.corners.map((p) => p[2])) - 0.3;
        const insetMap: Mapper = (p) => [IX + IW / 2 + p[0] * IU, IY + (p[2] - z0) * IU];
        const gIn = el('g', { 'clip-path': `url(#${uid}-inset)` }, dyn);
        drawScene(gIn, insetMap, r, cam, false);
      }
      // 화면
      const ndc = (x: number, y: number): [number, number] => [SX + ((x + 1) * SS) / 2, SY + ((1 - y) * SS) / 2];
      for (const f of frames) {
        const [x1, y1] = ndc(f.bounds.xMin, f.bounds.yMax);
        const [x2, y2] = ndc(f.bounds.xMax, f.bounds.yMin);
        el('rect', { x: x1, y: y1, width: x2 - x1, height: y2 - y1, fill: 'none', stroke: boxColor(f.id), 'stroke-dasharray': '3 3', opacity: 0.7 }, dyn);
      }
      if (images) {
        images.boxes.forEach((b, i) => {
          const col = boxColor(b.id);
          const from = imgFrom.get(b.id);
          if (from === undefined) throw new Error(`projection-stage: ${b.id} 상의 처음 크기가 없다`);
          const s = lerp(from, 1, imgK);
          const cx = (b.bounds.xMin + b.bounds.xMax) / 2;
          const cy = (b.bounds.yMin + b.bounds.yMax) / 2;
          for (const [x1, y1, x2, y2] of b.segments) {
            const [p1x, p1y] = ndc(cx + s * (x1 - cx), cy + s * (y1 - cy));
            const [p2x, p2y] = ndc(cx + s * (x2 - cx), cy + s * (y2 - cy));
            el('line', { x1: p1x, y1: p1y, x2: p2x, y2: p2y, stroke: col, 'stroke-width': 2 }, dyn);
          }
          label(SX, SY + SS + 22 + i * 20, t('label.width', '{box} width {w}', { box: boxName(b.id), w: fmt(b.width, 3) }), dyn, {
            fill: col,
            'font-family': fonts.mono,
          });
        });
      }
      // 비 눈금
      if (round) {
        const { min, max } = round.ratioScale;
        if (!(max > min)) throw new Error(`projection-stage: 비 눈금 ${min}..${max} 가 비었다`);
        const gx = (v: number) => GX0 + ((v - min) / (max - min)) * (GX1 - GX0);
        el('line', { x1: GX0, y1: GY, x2: GX1, y2: GY, stroke: c.text, 'stroke-width': 2 }, dyn);
        for (let v = min; v <= max; v += 1) {
          el('line', { x1: gx(v), y1: GY - 4, x2: gx(v), y2: GY + 4, stroke: c.text }, dyn);
          label(gx(v), GY + 8 + smPx, String(v), dyn, { 'text-anchor': 'middle', fill: c.textMuted });
        }
        if (ratio) {
          const x = gx(lerp(ratioFrom, ratio.ratio, ratioK));
          el('path', { d: `M ${x} ${GY - 2} l -6 -10 l 12 0 z`, fill: c.text }, dyn);
          label(Math.min(Math.max(x, GX0 + 40), W - 44), GY - 16, t('label.ratio', 'Front/back {r}', { r: fmt(ratio.ratio, 3) }), dyn, {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
          });
        } else if (markerAt !== null) {
          const x = gx(markerAt);
          el('path', { d: `M ${x} ${GY - 2} l -6 -10 l 12 0 z`, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '2 2' }, dyn);
        }
      }
    };

    const projectionName = (p: 'perspective' | 'orthographic'): string =>
      p === 'perspective' ? t('label.perspective', 'Perspective') : t('label.orthographic', 'Orthographic');

    const instance = {
      showRound(p: RoundView, speed: number) {
        stopAll(true);
        const target: CamState =
          p.projection === 'perspective' ? { eye: p.eye, sx: 0, slope: p.halfTan } : { eye: p.eye, sx: p.orthoHalf, slope: 0 };
        const shown = camNow();
        round = p;
        camFrom = shown ?? target;
        camTo = target;
        bars = null;
        clip = null;
        if (images) frames = images.boxes.map((b) => ({ id: b.id, bounds: b.bounds }));
        images = null;
        if (ratio) markerAt = ratio.ratio;
        ratio = null;
        caption = t('caption.round', 'Eye distance {d} · {projection}', { d: String(p.distance), projection: projectionName(p.projection) });
        tween('cam', motionMs(speed), (k) => {
          camK = k;
        });
      },
      showCamera(p: CameraView, speed: number) {
        stopAll(true);
        bars = p;
        caption = t('caption.camera', 'Camera coordinates — depth from the eye to each box');
        tween('bars', motionMs(speed), (k) => {
          barK = k;
        });
      },
      showClip(p: ClipView, speed: number) {
        stopAll(true);
        clip = p;
        caption = t(
          'caption.clip',
          'Near plane {near} — vertices behind {behind} · edges cut {cut} · edges dropped {dropped} · new vertices {added}',
          { near: String(p.near), behind: p.behind, cut: p.cut, dropped: p.dropped, added: p.added },
        );
        tween('clip', motionMs(speed), (k) => {
          clipK = k;
        });
      },
      showProject(p: ProjectView, speed: number) {
        stopAll(true);
        images = p;
        imgFrom = new Map();
        for (const b of p.boxes) {
          if (!(b.width > 0)) throw new Error(`projection-stage: ${b.id} 상의 폭 ${b.width} 가 양수가 아니다`);
          const before = prevWidth.get(b.id);
          imgFrom.set(b.id, before === undefined ? 0 : before / b.width);
          prevWidth.set(b.id, b.width);
        }
        caption = t('caption.project', '{projection} — the image width of each box', { projection: projectionName(p.projection) });
        tween('images', motionMs(speed), (k) => {
          imgK = k;
        });
      },
      showCompare(p: CompareView, speed: number) {
        stopAll(true);
        if (!round) throw new Error('projection-stage: 판 머리 전에 비가 왔다');
        ratioFrom = markerAt ?? round.ratioScale.min;
        ratio = p;
        caption = t('caption.compare', 'Front image width ÷ back image width');
        tween('ratio', motionMs(speed), (k) => {
          ratioK = k;
        });
      },
      reset() {
        stopAll(false);
        round = null;
        camFrom = null;
        camTo = null;
        camK = 1;
        bars = null;
        barK = 1;
        clip = null;
        clipK = 1;
        images = null;
        imgFrom = new Map();
        imgK = 1;
        frames = [];
        prevWidth.clear();
        ratio = null;
        ratioK = 1;
        markerAt = null;
        caption = '';
        render();
      },
      destroy() {
        destroyed = true;
        stopAll(false);
        root.remove();
      },
    };
    render();
    void container;
    return instance;
  },
};
