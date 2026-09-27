/**
 * 광선 추적 무대 — 위에서 본 평면 하나(눈 아래 · 벽 위)와 그 밑에 크게 편 영상 줄 12 칸.
 *
 * 무대는 projector 가 넘긴 값만 그린다 (알고리즘의 셈 · 좁히개를 부르지 않는다 — 원칙 1).
 * 평면의 범위 · 벽 띠 · 유리 · 빛 · 픽셀 중심 · 곧은 자리는 모두 판 머리(`setScene`)가 준다.
 *
 * 운동 (길이는 projector 가 재생 속도를 읽어 넘긴다):
 * - 판 머리: 앞 판의 광선 · 그림자 광선이 끝에서부터 눈 쪽(그림자 광선은 벽 쪽)으로 거둬진다
 * - 걸음 1: 광선이 눈에서 첫 닿음까지 자란다
 * - 걸음 2: 유리 안의 토막이 나올 점까지 자란다
 * - 걸음 3: 나온 광선이 곧게 갔다면 닿을 자리(점선 눈금)로 뻗었다가 실제 자리로 돌며 벽 위를 미끄러진다
 * - 걸음 4: 벽의 점에서 빛 쪽으로 그림자 광선이 자라고, 막히면 유리에 닿은 점에서 멈춘다
 * - 걸음 5: 칸 색 조각이 광선을 거슬러 벽에서 영상 줄로 돌아와 칸을 칠한다
 */
import {
  type CanvasView,
  type Translate,
  type ViewInstance,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

export type StageVec = { x: number; y: number };

export type StageScene = {
  n: string;
  eye: StageVec;
  row: { y: number; left: number; right: number; count: number };
  glass: { cx: number; cy: number; r: number };
  light: StageVec;
  wall: { y: number; left: number; right: number; bandWidth: number; bands: [number, number, number][] };
  pixels: { k: number; x: number; straightX: number }[];
};

export type StageShot = { k: number; from: StageVec; to: StageVec; hit: 'glass' | 'wall' };
export type StageSegment = { k: number; to: StageVec };
export type StageExit = { k: number; straightX: number; wallX: number };
export type StageShadow = { k: number; from: StageVec; to: StageVec; blocked: boolean };
export type StageCell = { k: number; color: [number, number, number] };

export type RayTracingBaseStage = ViewInstance & {
  setScene(scene: StageScene, ms: number): void;
  shoot(rays: StageShot[], ms: number): void;
  enter(rays: StageSegment[], focusK: number, ms: number): void;
  exit(rays: StageExit[], ms: number): void;
  shadow(rays: StageShadow[], ms: number): void;
  shade(cells: StageCell[], ms: number): void;
  setCaption(title: string, stat: string): void;
  reset(): void;
  /** 검사용 — 무대에 그려진 요소 수 */
  countElements(): number;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 640;
const PLANE_W = 612;
const PLANE_H = 408;
const PLANE_TOP = 96;
const BAND_H = 20;
const STRIP_TOP = 560;
const STRIP_CELL = 40;
const STRIP_H = 36;

type Tween = { start: number | null; dur: number; draw: (u: number) => void; done?: () => void };

type RayEl = { line: SVGPolylineElement; pts: StageVec[]; shown: number };

function pathLength(pts: StageVec[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return total;
}

/** 꺾은선을 앞에서부터 길이 `upto` 까지 자른다 */
function truncate(pts: StageVec[], upto: number): StageVec[] {
  if (pts.length === 0) return [];
  const out: StageVec[] = [pts[0]!];
  let left = upto;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left >= seg) {
      out.push(b);
      left -= seg;
      continue;
    }
    const f = seg === 0 ? 0 : Math.max(0, left) / seg;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    break;
  }
  return out;
}

/** 꺾은선 위 길이 비율 u 의 점 */
function pointAlong(pts: StageVec[], u: number): StageVec {
  const cut = truncate(pts, pathLength(pts) * u);
  return cut[cut.length - 1]!;
}

const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

/** 자료의 선형 0..1 RGB → 칠할 색. 1 을 넘으면 채널마다 1 로 자른다 */
function paint(c: [number, number, number]): string {
  const ch = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${ch(c[0])}, ${ch(c[1])}, ${ch(c[2])})`;
}

export const rayTracingBaseStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, s: string, attrs: Record<string, string | number>, parent: Element): SVGTextElement => {
      const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...attrs }, parent);
      node.textContent = s;
      return node;
    };

    const gStatic = el('g', {}, svg);
    const gRays = el('g', {}, svg);
    const gShadow = el('g', {}, svg);
    const gMarks = el('g', {}, svg);
    const gChips = el('g', {}, svg);
    const titleEl = text(W / 2, 24, '', { 'text-anchor': 'middle', 'font-size': fontSizes.md }, svg);
    const statEl = text(W / 2, 46, '', { 'text-anchor': 'middle', 'font-family': fonts.mono, fill: c.textMuted }, svg);

    let scene: StageScene | null = null;
    let scale = 1;
    let ox = 0;
    let rays = new Map<number, RayEl>();
    let shadows = new Map<number, RayEl>();
    const wallDots = new Map<number, SVGCircleElement>();
    let cells = new Map<number, SVGRectElement>();

    // ── 운동
    const tweens = new Set<Tween>();
    let frame: number | null = null;
    const tick = (now: number): void => {
      frame = null;
      for (const tw of [...tweens]) {
        if (tw.start === null) tw.start = now;
        const u = tw.dur <= 0 ? 1 : Math.min(1, (now - tw.start) / tw.dur);
        tw.draw(u);
        if (u >= 1) {
          tweens.delete(tw);
          tw.done?.();
        }
      }
      if (tweens.size > 0) frame = requestAnimationFrame(tick);
    };
    const animate = (dur: number, draw: (u: number) => void, done?: () => void): void => {
      if (isInstant() || dur <= 0 || typeof requestAnimationFrame !== 'function') {
        draw(1);
        done?.();
        return;
      }
      draw(0);
      tweens.add({ start: null, dur, draw, done });
      if (frame === null) frame = requestAnimationFrame(tick);
    };
    /** 도는 운동을 끝 자리로 붙인다 (걸음이 바뀌거나 되짚기가 올 때) */
    const finishAll = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const all = [...tweens];
      tweens.clear();
      for (const tw of all) {
        tw.draw(1);
        tw.done?.();
      }
    };
    params.onScrubStart?.(finishAll);

    // ── 좌표 (평면 → 화면, y 뒤집기)
    const px = (x: number): number => ox + (x - (scene?.wall.left ?? 0)) * scale;
    const py = (y: number): number => PLANE_TOP + ((scene?.wall.y ?? 0) - y) * scale;
    const toScreen = (p: StageVec): StageVec => ({ x: px(p.x), y: py(p.y) });
    const stripX = (k: number): number => {
      const count = scene?.row.count ?? 0;
      return W / 2 - (count * STRIP_CELL) / 2 + k * STRIP_CELL;
    };

    const drawRay = (r: RayEl): void => {
      const cut = truncate(r.pts, r.shown).map(toScreen);
      r.line.setAttribute('points', cut.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
    };
    const newRay = (parent: Element, pts: StageVec[], attrs: Record<string, string | number>): RayEl => {
      const line = el('polyline', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...attrs }, parent);
      return { line, pts, shown: 0 };
    };
    const rayOf = (k: number): RayEl => {
      const r = rays.get(k);
      if (!r) throw new Error(`ray-tracing-base-stage: 픽셀 ${k + 1} 의 광선이 무대에 없다`);
      return r;
    };
    const needScene = (): StageScene => {
      if (!scene) throw new Error('ray-tracing-base-stage: 판 머리(setScene) 전에 걸음이 왔다');
      return scene;
    };

    function buildStatic(s: StageScene): void {
      gStatic.replaceChildren();
      cells = new Map();
      // 벽 띠
      s.wall.bands.forEach((b, i) => {
        const x0 = px(s.wall.left + i * s.wall.bandWidth);
        el('rect', { x: x0, y: PLANE_TOP - BAND_H, width: s.wall.bandWidth * scale, height: BAND_H, fill: paint(b) }, gStatic);
        text(x0 + (s.wall.bandWidth * scale) / 2, PLANE_TOP - 6, String(i + 1), { 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: c.stateInk }, gStatic);
      });
      el('line', { x1: px(s.wall.left), y1: PLANE_TOP, x2: px(s.wall.right), y2: PLANE_TOP, stroke: c.text, 'stroke-width': 1.5 }, gStatic);
      text(px(s.wall.left) - 6, PLANE_TOP - 6, t('label.wall', 'wall'), { 'text-anchor': 'end', fill: c.textMuted }, gStatic);
      // 곧게 갔다면 닿을 자리 — n 과 무관한 자리
      for (const p of s.pixels) {
        el('line', { x1: px(p.straightX), y1: PLANE_TOP + 2, x2: px(p.straightX), y2: PLANE_TOP + 14, stroke: c.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '2 2' }, gStatic);
      }
      // 유리
      el('circle', { cx: px(s.glass.cx), cy: py(s.glass.cy), r: s.glass.r * scale, fill: c.bgSubtle, stroke: c.textMuted, 'stroke-width': 1.5 }, gStatic);
      const gx = px(s.glass.cx) + s.glass.r * scale + 8;
      text(gx, py(s.glass.cy) - 4, t('label.glass', 'glass'), { fill: c.textMuted }, gStatic);
      text(gx, py(s.glass.cy) + 14, t('stage.index', 'n {n}', { n: s.n }), { 'font-family': fonts.mono, 'font-size': fontSizes.md }, gStatic);
      // 영상 줄 (평면 안 · 픽셀 칸 눈금)
      const rl = px(s.row.left);
      const rr = px(s.row.right);
      el('line', { x1: rl, y1: py(s.row.y), x2: rr, y2: py(s.row.y), stroke: c.text, 'stroke-width': 1.2 }, gStatic);
      for (let k = 0; k <= s.row.count; k += 1) {
        const x = rl + ((rr - rl) * k) / s.row.count;
        el('line', { x1: x, y1: py(s.row.y) - 3, x2: x, y2: py(s.row.y) + 3, stroke: c.text, 'stroke-width': 0.8 }, gStatic);
      }
      // 크게 편 영상 줄 — 평면 안의 줄과 점선으로 잇는다
      const s0 = stripX(0);
      const s1 = stripX(s.row.count);
      el('line', { x1: rl, y1: py(s.row.y), x2: s0, y2: STRIP_TOP, stroke: c.border, 'stroke-dasharray': '3 4' }, gStatic);
      el('line', { x1: rr, y1: py(s.row.y), x2: s1, y2: STRIP_TOP, stroke: c.border, 'stroke-dasharray': '3 4' }, gStatic);
      for (let k = 0; k < s.row.count; k += 1) {
        const cell = el('rect', { x: stripX(k), y: STRIP_TOP, width: STRIP_CELL, height: STRIP_H, fill: c.bg, stroke: c.border }, gStatic);
        cells.set(k, cell);
        text(stripX(k) + STRIP_CELL / 2, STRIP_TOP + STRIP_H + 16, String(k + 1), { 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: c.textMuted }, gStatic);
      }
      text(s0 - 8, STRIP_TOP + STRIP_H / 2 + 4, t('label.row', 'image row'), { 'text-anchor': 'end', fill: c.textMuted }, gStatic);
      // 눈 · 빛
      el('circle', { cx: px(s.eye.x), cy: py(s.eye.y), r: 5, fill: c.text }, gStatic);
      text(px(s.eye.x), py(s.eye.y) + 20, t('label.eye', 'eye'), { 'text-anchor': 'middle', fill: c.textMuted }, gStatic);
      el('circle', { cx: px(s.light.x), cy: py(s.light.y), r: 8, fill: c.accent, stroke: c.text, 'stroke-width': 1 }, gStatic);
      text(px(s.light.x), py(s.light.y) + 22, t('label.light', 'light'), { 'text-anchor': 'middle', fill: c.textMuted }, gStatic);
      // 범례 — 평면 오른쪽 아래 빈 자리
      const lx = px(s.wall.right) - 190;
      const ly = py(s.eye.y) - 64;
      el('line', { x1: lx, y1: ly, x2: lx + 18, y2: ly, stroke: c.primary, 'stroke-width': 1.4 }, gStatic);
      text(lx + 24, ly + 4, t('label.ray', 'ray'), { 'font-size': fontSizes.xs, fill: c.textMuted }, gStatic);
      el('line', { x1: lx, y1: ly + 18, x2: lx + 18, y2: ly + 18, stroke: c.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, gStatic);
      text(lx + 24, ly + 22, t('label.shadowRay', 'shadow ray'), { 'font-size': fontSizes.xs, fill: c.textMuted }, gStatic);
      el('line', { x1: lx + 9, y1: ly + 30, x2: lx + 9, y2: ly + 42, stroke: c.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '2 2' }, gStatic);
      text(lx + 24, ly + 40, t('label.straight', 'straight-line landing'), { 'font-size': fontSizes.xs, fill: c.textMuted }, gStatic);
    }

    function clearConclusions(): void {
      gMarks.replaceChildren();
      gChips.replaceChildren();
      wallDots.clear();
    }

    const stage: RayTracingBaseStage = {
      setScene(s, ms) {
        finishAll();
        const yLow = Math.min(s.eye.y, s.light.y, s.row.y, 0);
        scale = Math.min(PLANE_W / (s.wall.right - s.wall.left), PLANE_H / (s.wall.y - yLow));
        ox = (W - (s.wall.right - s.wall.left) * scale) / 2;
        scene = s;
        buildStatic(s);
        clearConclusions();
        // 앞 판의 광선을 끝에서부터 거둔다 — 목록에서 떼어 낸 뒤 운동 끝에 지운다 (되짚기면 곧장 지운다)
        const leaving = [...rays.values(), ...shadows.values()];
        rays = new Map();
        shadows = new Map();
        if (leaving.length > 0) {
          const from = leaving.map((r) => r.shown);
          animate(
            ms,
            (u) => {
              const e = ease(u);
              leaving.forEach((r, i) => {
                r.shown = from[i]! * (1 - e);
                drawRay(r);
              });
            },
            () => {
              for (const r of leaving) r.line.remove();
            },
          );
        }
      },
      shoot(list, ms) {
        finishAll();
        needScene();
        const fresh: RayEl[] = [];
        for (const r of list) {
          if (rays.has(r.k)) throw new Error(`ray-tracing-base-stage: 픽셀 ${r.k + 1} 의 광선이 이미 있다`);
          const ray = newRay(gRays, [r.from, r.to], { stroke: c.primary, 'stroke-width': 1.4, opacity: 0.85 });
          rays.set(r.k, ray);
          fresh.push(ray);
        }
        const ends = fresh.map((r) => pathLength(r.pts));
        const direct = list.filter((r) => r.hit === 'wall');
        animate(
          ms,
          (u) => {
            const e = ease(u);
            fresh.forEach((r, i) => {
              r.shown = ends[i]! * e;
              drawRay(r);
            });
          },
          () => {
            for (const r of direct) {
              wallDots.set(r.k, el('circle', { cx: px(r.to.x), cy: py(r.to.y), r: 3.5, fill: c.primary }, gMarks));
            }
          },
        );
      },
      enter(list, focusK, ms) {
        finishAll();
        needScene();
        const moving = list.map((r) => {
          const ray = rayOf(r.k);
          ray.pts = [...ray.pts, r.to];
          return { ray, from: ray.shown, to: pathLength(ray.pts) };
        });
        rayOf(focusK).line.setAttribute('stroke', c.itemComparing);
        rayOf(focusK).line.setAttribute('stroke-width', '2');
        animate(ms, (u) => {
          const e = ease(u);
          for (const m of moving) {
            m.ray.shown = m.from + (m.to - m.from) * e;
            drawRay(m.ray);
          }
        });
      },
      exit(list, ms) {
        finishAll();
        const s = needScene();
        const moving = list.map((r) => {
          const ray = rayOf(r.k);
          const end: StageVec = { x: r.straightX, y: s.wall.y };
          ray.pts = [...ray.pts, end];
          const dot = el('circle', { cx: px(end.x), cy: py(end.y), r: 3.5, fill: c.primary, opacity: 0 }, gMarks);
          wallDots.set(r.k, dot);
          return { ray, end, dot, from: ray.shown, straightX: r.straightX, wallX: r.wallX };
        });
        const GROW = 0.4;
        animate(ms, (u) => {
          for (const m of moving) {
            if (u < GROW) {
              m.end.x = m.straightX;
              m.ray.shown = m.from + (pathLength(m.ray.pts) - m.from) * ease(u / GROW);
            } else {
              // 곧은 자리에서 실제 자리로 돌며 미끄러진다
              m.end.x = m.straightX + (m.wallX - m.straightX) * ease((u - GROW) / (1 - GROW));
              m.ray.shown = pathLength(m.ray.pts);
              m.dot.setAttribute('opacity', '1');
            }
            m.dot.setAttribute('cx', String(px(m.end.x)));
            drawRay(m.ray);
          }
        });
      },
      shadow(list, ms) {
        finishAll();
        needScene();
        const fresh = list.map((r) => {
          if (!wallDots.has(r.k)) throw new Error(`ray-tracing-base-stage: 픽셀 ${r.k + 1} 의 벽 점이 없다`);
          const ray = r.blocked
            ? newRay(gShadow, [r.from, r.to], { stroke: c.danger, 'stroke-width': 1.3 })
            : newRay(gShadow, [r.from, r.to], { stroke: c.textMuted, 'stroke-width': 1.1, 'stroke-dasharray': '4 3' });
          shadows.set(r.k, ray);
          return { r, ray, total: pathLength(ray.pts) };
        });
        animate(
          ms,
          (u) => {
            const e = ease(u);
            for (const f of fresh) {
              f.ray.shown = f.total * e;
              drawRay(f.ray);
            }
          },
          () => {
            for (const f of fresh) {
              if (!f.r.blocked) continue;
              const p = toScreen(f.r.to);
              el('line', { x1: p.x - 5, y1: p.y - 5, x2: p.x + 5, y2: p.y + 5, stroke: c.danger, 'stroke-width': 2 }, gMarks);
              el('line', { x1: p.x - 5, y1: p.y + 5, x2: p.x + 5, y2: p.y - 5, stroke: c.danger, 'stroke-width': 2 }, gMarks);
              wallDots.get(f.r.k)?.setAttribute('fill', c.danger);
            }
          },
        );
      },
      shade(list, ms) {
        finishAll();
        const s = needScene();
        const chips = list.map((cell) => {
          const ray = rayOf(cell.k);
          const pixel = s.pixels.find((p) => p.k === cell.k);
          const box = cells.get(cell.k);
          if (!pixel || !box) throw new Error(`ray-tracing-base-stage: 칸 ${cell.k + 1} 이 무대에 없다`);
          // 벽에서 광선을 거슬러 픽셀 중심까지 (화면 좌표), 그다음 크게 편 칸으로
          const back = [...ray.pts].reverse().slice(0, -1).map(toScreen);
          back.push(toScreen({ x: pixel.x, y: s.row.y }));
          back.push({ x: stripX(cell.k) + STRIP_CELL / 2, y: STRIP_TOP + STRIP_H / 2 });
          const chip = el('rect', { width: 10, height: 10, fill: paint(cell.color), stroke: c.text, 'stroke-width': 0.8 }, gChips);
          return { chip, back, box, color: paint(cell.color) };
        });
        animate(
          ms,
          (u) => {
            const e = ease(u);
            for (const ch of chips) {
              const p = pointAlong(ch.back, e);
              ch.chip.setAttribute('x', String(p.x - 5));
              ch.chip.setAttribute('y', String(p.y - 5));
            }
          },
          () => {
            for (const ch of chips) {
              ch.box.setAttribute('fill', ch.color);
              ch.chip.remove();
            }
          },
        );
      },
      setCaption(title, stat) {
        titleEl.textContent = title;
        statEl.textContent = stat;
      },
      reset() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        tweens.clear();
        gStatic.replaceChildren();
        gRays.replaceChildren();
        gShadow.replaceChildren();
        clearConclusions();
        rays = new Map();
        shadows = new Map();
        cells = new Map();
        scene = null;
        titleEl.textContent = '';
        statEl.textContent = '';
      },
      countElements() {
        return svg.querySelectorAll('*').length;
      },
      destroy() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        tweens.clear();
        svg.replaceChildren();
      },
    };
    return stage;
  },
};
