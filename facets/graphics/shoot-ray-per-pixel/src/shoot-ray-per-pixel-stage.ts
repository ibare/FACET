/**
 * shoot-ray-per-pixel-stage — 칸마다 광선 하나가 나가고, 돌아온 답이 칸을 채운다.
 *
 * 비스듬히 선 구경꾼의 눈으로 3 차원 장면을 본다 — 눈 · 화면 판(격자) · 공.
 * 한 걸음에 한 줄: 그 줄의 광선 여덟이 눈에서 뻗어 칸 한가운데를 지나 공에 닿거나
 * 멀리 빠져나가고, 닿은 자리의 답(공의 색 · 바탕 색)이 광선을 거슬러 칸으로 돌아와
 * 칸이 가운데서부터 채워진다. 앞 줄들의 칸은 채워진 채로 남는다.
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
import { cellCenter, pixelSize, type Vec3 } from './algorithm.js';
import type { ShootRayRow, ShootRayScene } from './scene.js';

const H = 400;
const NS = 'http://www.w3.org/2000/svg';

/** 구경꾼의 자리와 보는 곳 — 그림의 틀이지 자료가 아니다 */
const VIEW_AT: Vec3 = [0.1, 0, -2];
const VIEW_FROM: Vec3 = [1.3, 1.0, 2.2];

const RAY_MS = 420;
const RETURN_MS = 360;
const FILL_MS = 220;

type Pt = readonly [number, number];

type Projection = {
  at(p: Vec3): Pt;
  radius(center: Vec3, r: number): number;
};

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function unit(a: Vec3): Vec3 {
  const n = Math.sqrt(dot(a, a));
  if (n === 0) throw new Error('shoot-ray-per-pixel-stage: 길이 0 벡터');
  return [a[0] / n, a[1] / n, a[2] / n];
}
function along(o: Vec3, d: Vec3, s: number): Vec3 {
  return [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
}
function mix(a: Vec3, b: Vec3, k: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
function r2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}
/** 선형 0..1 색을 그대로 화면 색으로 (감마 없음 — 자료의 값이 곧 색이다) */
function rgbOf(c: Vec3): string {
  const b = (x: number): number => Math.round(x * 255);
  return `rgb(${b(c[0])}, ${b(c[1])}, ${b(c[2])})`;
}
function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

/** 빗나간 광선을 그릴 끝 — 공 중심의 깊이까지. 그리는 길이일 뿐 화면에 수로 뜨지 않는다 */
function missEnd(base: ShootRayScene['base'], dir: Vec3): Vec3 {
  const farZ = base.sphere.center[2];
  if (dir[2] >= 0) throw new Error('shoot-ray-per-pixel-stage: 광선이 판 쪽으로 가지 않는다');
  return along(base.eye, dir, (farZ - base.eye[2]) / dir[2]);
}

function rayEnd(base: ShootRayScene['base'], cell: ShootRayRow['cells'][number]): Vec3 {
  return cell.tHit === null ? missEnd(base, cell.dir) : along(base.eye, cell.dir, cell.tHit);
}

/** 바탕에서 정해지는 투영 — 눈 · 판 네 귀 · 공 · 판 네 귀를 지나는 광선의 그리는 끝이 상자에 들게 */
function makeProjection(base: ShootRayScene['base'], box: { x: number; y: number; w: number; h: number }): Projection {
  const f = unit(sub(VIEW_AT, VIEW_FROM));
  const right = unit(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const raw = (p: Vec3): Pt => {
    const v = sub(p, VIEW_FROM);
    const z = dot(v, f);
    if (z <= 0) throw new Error('shoot-ray-per-pixel-stage: 구경꾼 뒤의 점');
    return [dot(v, right) / z, -dot(v, up) / z];
  };
  const { plane, sphere, eye } = base;
  const corners: Vec3[] = [
    [-plane.halfWidth, plane.halfHeight, plane.z],
    [plane.halfWidth, plane.halfHeight, plane.z],
    [plane.halfWidth, -plane.halfHeight, plane.z],
    [-plane.halfWidth, -plane.halfHeight, plane.z],
  ];
  const pts: Pt[] = [raw(eye), ...corners.map(raw)];
  for (const c of corners) pts.push(raw(missEnd(base, unit(sub(c, eye)))));
  for (const s of [-1, 1]) {
    pts.push(raw(along(sphere.center, right, s * sphere.radius)));
    pts.push(raw(along(sphere.center, up, s * sphere.radius)));
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const scale = Math.min(box.w / (x1 - x0), box.h / (y1 - y0));
  const ox = box.x + (box.w - (x1 - x0) * scale) / 2 - x0 * scale;
  const oy = box.y + (box.h - (y1 - y0) * scale) / 2 - y0 * scale;
  return {
    at(p: Vec3): Pt {
      const q = raw(p);
      return [r2(ox + q[0] * scale), r2(oy + q[1] * scale)];
    },
    radius(center: Vec3, r: number): number {
      const z = dot(sub(center, VIEW_FROM), f);
      return r2((r / z) * scale);
    },
  };
}

type RowHandles = {
  /** 광선 하나 = 눈→칸 가운데(판 앞) + 칸 가운데→끝(판 뒤) */
  rays: { near: SVGLineElement; far: SVGLineElement; eye: Vec3; mid: Vec3; end: Vec3 }[];
  tips: SVGCircleElement[];
  answers: { dot: SVGCircleElement; from: Vec3; to: Vec3 }[];
  cells: { poly: SVGPolygonElement; center: Vec3; corners: Vec3[] }[];
  proj: Projection;
};

export const shootRayPerPixelStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const PAD = Math.min(20, W * 0.03);
    const SM = parseFloat(fontSizes.sm);
    const MD = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(text: string, x: number, y: number, size: number, fill: string, anchor: string, parent: Element): SVGTextElement {
      const node = el('text', {
        x: r2(x), y: r2(y), fill, 'font-family': fonts.body, 'font-size': size, 'text-anchor': anchor,
      }, parent);
      node.textContent = text;
      return node;
    }

    function polyPoints(proj: Projection, pts: Vec3[]): string {
      return pts.map((p) => proj.at(p).join(',')).join(' ');
    }

    function cellCorners(base: ShootRayScene['base'], i: number, j: number): { center: Vec3; corners: Vec3[] } {
      const c = cellCenter(base, i, j);
      const h = pixelSize(base) / 2;
      return {
        center: c,
        corners: [
          [c[0] - h, c[1] + h, c[2]],
          [c[0] + h, c[1] + h, c[2]],
          [c[0] + h, c[1] - h, c[2]],
          [c[0] - h, c[1] - h, c[2]],
        ],
      };
    }

    /** 그 장면의 화면 전체. 이번 걸음 줄의 손잡이를 돌려준다 */
    function drawStatic(scene: ShootRayScene): RowHandles | null {
      svg.textContent = '';
      const { base, filled, step } = scene;
      const total = base.cols * base.rows;
      const hits = filled.reduce((n, r) => n + r.cells.filter((c) => c.hitId !== null).length, 0);
      const done = filled.length * base.cols;

      // 머리 줄 — 지금 일어나는 일
      const capY = PAD + MD;
      if (step.kind === 'start') {
        label(t('caption.start', 'Grid {cols} × {rows} · no rays yet', { cols: base.cols, rows: base.rows }),
          PAD, capY, MD, colors.text, 'start', svg);
      } else {
        const row = filled[filled.length - 1];
        if (row === undefined || row.row !== step.row) throw new Error('shoot-ray-per-pixel-stage: 이번 줄이 자취에 없다');
        const rowHits = row.cells.filter((c) => c.hitId !== null).length;
        label(t('caption.row', 'Row {row}: {n} rays · hits {hits}', { row: step.row, n: row.cells.length, hits: rowHits }),
          PAD, capY, MD, colors.text, 'start', svg);
      }

      // 오른쪽 기둥 — 채운 칸과, 돌아온 두 색의 칸 수
      const colX = r2(W * 0.72);
      const midY = H / 2;
      label(t('tally.filled', 'Filled cells: {filled} / {total}', { filled: done, total }),
        colX, midY - MD * 1.6, MD, colors.text, 'start', svg);
      const sw = MD;
      const legend: { color: Vec3; name: string; n: number }[] = [
        { color: base.sphere.color, name: t('label.ball', 'Ball'), n: hits },
        { color: base.background, name: t('label.background', 'Background'), n: done - hits },
      ];
      legend.forEach((item, k) => {
        const y = midY + k * MD * 1.9;
        el('rect', {
          x: colX, y: r2(y - sw + 2), width: sw, height: sw,
          fill: rgbOf(item.color), stroke: colors.border,
        }, svg);
        label(t('legend.count', '{name}: {n}', { name: item.name, n: item.n }),
          colX + sw + 8, y, MD, colors.text, 'start', svg);
      });

      // 장면 — 왼쪽, 머리 줄 아래 전부
      const top = capY + PAD;
      const proj = makeProjection(base, { x: PAD, y: top, w: W * 0.7 - PAD, h: H - PAD - top });

      // 공 — 가장 멀다
      const ballC = proj.at(base.sphere.center);
      el('circle', {
        cx: ballC[0], cy: ballC[1], r: proj.radius(base.sphere.center, base.sphere.radius),
        fill: rgbOf(base.sphere.color), 'fill-opacity': 0.28, stroke: rgbOf(base.sphere.color), 'stroke-width': 2,
      }, svg);
      const ballTop = proj.at(along(base.sphere.center, [0, 1, 0], base.sphere.radius));
      label(t('label.ball', 'Ball'), ballC[0], ballTop[1] - 8, SM, colors.textMuted, 'middle', svg);

      // 이번 줄의 광선 — 판 뒤 토막과 끝점은 판보다 먼저 그린다
      const eyeP = proj.at(base.eye);
      const behind = el('g', {}, svg);
      const handles: RowHandles = { rays: [], tips: [], answers: [], cells: [], proj };
      const current = step.kind === 'row' ? filled[filled.length - 1] : undefined;
      const rayLines: { near: Vec3; mid: Vec3; end: Vec3; hit: boolean; col: number }[] = [];
      if (current !== undefined) {
        for (const c of current.cells) {
          const mid = cellCenter(base, c.col, current.row);
          const end = rayEnd(base, c);
          const hit = c.hitId !== null;
          rayLines.push({ near: base.eye, mid, end, hit, col: c.col });
        }
      }
      const farLines = rayLines.map((r) => {
        const a = proj.at(r.mid);
        const b = proj.at(r.end);
        const far = el('line', {
          x1: a[0], y1: a[1], x2: b[0], y2: b[1],
          stroke: r.hit ? colors.text : colors.textMuted, 'stroke-width': r.hit ? 1.4 : 1,
          'stroke-dasharray': r.hit ? 'none' : '4 3',
        }, behind);
        if (r.hit) {
          handles.tips.push(el('circle', {
            cx: b[0], cy: b[1], r: 3.5, fill: rgbOf(base.sphere.color), stroke: colors.text, 'stroke-width': 1,
          }, behind));
        }
        return far;
      });

      // 화면 판 — 격자. 빈 칸은 비쳐 보이고, 채운 칸은 돌아온 색
      const sheet = el('g', {}, svg);
      const answered = new Map<string, Vec3>();
      for (const r of filled) {
        for (const c of r.cells) answered.set(`${c.col},${r.row}`, c.hitId === null ? base.background : base.sphere.color);
      }
      for (let j = 0; j < base.rows; j += 1) {
        for (let i = 0; i < base.cols; i += 1) {
          const { center, corners } = cellCorners(base, i, j);
          el('polygon', {
            points: polyPoints(proj, corners), fill: colors.bg, 'fill-opacity': 0.35,
            stroke: colors.border, 'stroke-width': 1,
          }, sheet);
          const col = answered.get(`${i},${j}`);
          if (col !== undefined) {
            const poly = el('polygon', {
              points: polyPoints(proj, corners), fill: rgbOf(col), stroke: colors.border, 'stroke-width': 1,
            }, sheet);
            if (current !== undefined && j === current.row) handles.cells.push({ poly, center, corners });
          }
        }
      }
      const pc = base.plane;
      el('polygon', {
        points: polyPoints(proj, [
          [-pc.halfWidth, pc.halfHeight, pc.z], [pc.halfWidth, pc.halfHeight, pc.z],
          [pc.halfWidth, -pc.halfHeight, pc.z], [-pc.halfWidth, -pc.halfHeight, pc.z],
        ]),
        fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.5,
      }, sheet);
      const sheetCorner = proj.at([-pc.halfWidth, pc.halfHeight, pc.z]);
      label(t('label.screen', 'Screen'), sheetCorner[0], sheetCorner[1] - 8, SM, colors.textMuted, 'middle', svg);

      // 판 앞 토막과 돌아온 답
      const front = el('g', {}, svg);
      rayLines.forEach((r, k) => {
        const m = proj.at(r.mid);
        const near = el('line', {
          x1: eyeP[0], y1: eyeP[1], x2: m[0], y2: m[1],
          stroke: r.hit ? colors.text : colors.textMuted, 'stroke-width': r.hit ? 1.4 : 1,
          'stroke-dasharray': r.hit ? 'none' : '4 3',
        }, front);
        const far = farLines[k]!;
        handles.rays.push({ near, far, eye: r.near, mid: r.mid, end: r.end });
        const answer = el('circle', {
          cx: m[0], cy: m[1], r: 3,
          fill: rgbOf(r.hit ? base.sphere.color : base.background), stroke: colors.text, 'stroke-width': 1,
        }, front);
        handles.answers.push({ dot: answer, from: r.end, to: r.mid });
      });

      // 눈 — 판 가운데를 바로 보는 축을 옅게 그어 판 앞에 서 있음을 보인다
      const axisEnd = proj.at([base.eye[0], base.eye[1], base.plane.z]);
      el('line', {
        x1: eyeP[0], y1: eyeP[1], x2: axisEnd[0], y2: axisEnd[1],
        stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '1 3',
      }, svg);
      el('circle', { cx: eyeP[0], cy: eyeP[1], r: 5, fill: colors.text }, svg);
      // 눈은 판 앞에 떠 있어 판 위에 겹쳐 보인다 — 이름은 바탕색 테두리로 떼어 읽힌다
      const eyeName = label(t('label.eye', 'Eye'), eyeP[0] - 9, eyeP[1] + SM + 2, SM, colors.text, 'end', svg);
      eyeName.setAttribute('stroke', colors.bg);
      eyeName.setAttribute('stroke-width', '3');
      eyeName.setAttribute('paint-order', 'stroke');

      return step.kind === 'row' ? handles : null;
    }

    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return wake();
          const k = Math.min(1, (Date.now() - start) / ms);
          frame(ease(k));
          if (k >= 1) return wake();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function playRow(h: RowHandles, mine: number): Promise<void> {
      const live = (): boolean => mine === gen && !destroyed;
      if (h.rays.length === 0) throw new Error('shoot-ray-per-pixel-stage: 이번 줄에 광선이 없다');
      if (h.cells.length !== h.rays.length) throw new Error('shoot-ray-per-pixel-stage: 칸과 광선 수가 다르다');
      // 아직 못 온 만큼 — 광선은 눈에, 답과 끝점은 숨고, 칸은 비었다
      const put = (line: SVGLineElement, a: Vec3, b: Vec3): void => {
        const pa = h.proj.at(a);
        const pb = h.proj.at(b);
        line.setAttribute('x1', String(pa[0]));
        line.setAttribute('y1', String(pa[1]));
        line.setAttribute('x2', String(pb[0]));
        line.setAttribute('y2', String(pb[1]));
      };
      // 광선은 눈에서 뻗어 판을 지나 끝까지 — 한 걸음의 길이로 앞 토막 · 뒤 토막을 차례로 민다
      const setRay = (k: number): void => {
        for (const r of h.rays) {
          const nearLen = Math.hypot(r.mid[0] - r.eye[0], r.mid[1] - r.eye[1], r.mid[2] - r.eye[2]);
          const farLen = Math.hypot(r.end[0] - r.mid[0], r.end[1] - r.mid[1], r.end[2] - r.mid[2]);
          const reach = k * (nearLen + farLen);
          put(r.near, r.eye, mix(r.eye, r.mid, Math.min(1, reach / nearLen)));
          if (reach <= nearLen) r.far.setAttribute('visibility', 'hidden');
          else {
            r.far.removeAttribute('visibility');
            put(r.far, r.mid, mix(r.mid, r.end, (reach - nearLen) / farLen));
          }
        }
      };
      const setAnswer = (k: number): void => {
        for (const a of h.answers) {
          const p = h.proj.at(mix(a.from, a.to, k));
          a.dot.setAttribute('cx', String(p[0]));
          a.dot.setAttribute('cy', String(p[1]));
        }
      };
      // 칸은 한가운데서 네 귀로 번져 채워진다
      const setCells = (k: number): void => {
        for (const c of h.cells) {
          c.poly.setAttribute('points', c.corners.map((q) => h.proj.at(mix(c.center, q, k)).join(',')).join(' '));
        }
      };
      setRay(0);
      for (const tip of h.tips) tip.setAttribute('visibility', 'hidden');
      for (const a of h.answers) a.dot.setAttribute('visibility', 'hidden');
      setCells(0);

      await tween(RAY_MS, mine, setRay);
      if (!live()) return;
      for (const tip of h.tips) tip.removeAttribute('visibility');
      for (const a of h.answers) a.dot.removeAttribute('visibility');
      setAnswer(0);
      await tween(RETURN_MS, mine, setAnswer);
      if (!live()) return;
      await tween(FILL_MS, mine, setCells);
    }

    return {
      async render(next: ShootRayScene, prev: ShootRayScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        const moves = opts.animate && handles !== null && prev !== null && prev.filled.length === next.filled.length - 1;
        if (!moves) return;
        await playRow(handles, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
