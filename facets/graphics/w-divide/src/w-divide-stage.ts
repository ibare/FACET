/**
 * wDivide 무대 — 위에는 동차 묶음 다섯의 선반, 아래에는 평면.
 *
 * 걸음마다 그 묶음의 (x, y) 가 선반에서 평면으로 내려와 w 로 나뉘며 원점을 지나는 곧은 길을 따라
 * (x/w, y/w) 로 미끄러진다. 도착한 묶음은 그 점 곁에 하나씩 쌓인다. w = 0 인 묶음은 떨어질 자리가
 * 없어 원점에서 평면 끝까지 뻗는 화살(방향)이 된다.
 *
 * 화면은 늘 장면 전체에서 세운다. 운동은 이번 걸음의 진행률 하나로 같은 그리기를 되풀이한다.
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
} from '@ffacet/core/runtime';
import type { Bundle } from './algorithm.js';
import type { WDivideScene } from './scene.js';

const H = 470;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD_X = 20;
const SHELF_TOP = 12;
const CARD_H = 46;
const CARD_GAP = 10;
const PLANE_TOP = SHELF_TOP + CARD_H + 18;
const CAPTION_H = 54;
const PLANE_BOTTOM = H - CAPTION_H - 8;
/** 한 칸 길이의 상한 (px) — 자료가 작아도 격자가 부풀지 않게 */
const UNIT_MAX = 64;

const LAND_MS = 780;
const DROP_SHARE = 0.4;
const DIRECTION_MS = 700;
const FRAME_MS = 16;

const CHIP_H = 18;
const CHIP_GAP = 3;

/** 수 자료 표시 — 자료 그대로 (정수 · 0.5 등), 음수는 긴 빼기표 */
function rawNum(v: number): string {
  return String(v).replace('-', '−');
}

/** 셈한 좌표 표시 — 소수 둘째 자리, −0.00 은 0.00 */
function coord(v: number): string {
  const s = v.toFixed(2);
  return (Number(s) === 0 ? '0.00' : s).replace('-', '−');
}

function tuple(b: Bundle): string {
  return `(${rawNum(b.x)}, ${rawNum(b.y)}, ${rawNum(b.w)})`;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

type Frame = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  unit: number;
  left: number;
  top: number;
};

/** 평면의 범위는 바탕(묶음의 x, y 와 원점)에서 정한다 */
function frameOf(bundles: Bundle[]): Frame {
  let xMin = 0;
  let xMax = 0;
  let yMin = 0;
  let yMax = 0;
  for (const b of bundles) {
    xMin = Math.min(xMin, b.x);
    xMax = Math.max(xMax, b.x);
    yMin = Math.min(yMin, b.y);
    yMax = Math.max(yMax, b.y);
  }
  xMin = Math.floor(xMin) - 1;
  xMax = Math.ceil(xMax) + 1;
  yMin = Math.floor(yMin) - 1;
  yMax = Math.ceil(yMax) + 2;
  const availW = PIECE_CANVAS_W - PAD_X * 2;
  const availH = PLANE_BOTTOM - PLANE_TOP;
  const unit = Math.min(UNIT_MAX, availW / (xMax - xMin), availH / (yMax - yMin));
  const left = (PIECE_CANVAS_W - unit * (xMax - xMin)) / 2;
  const top = PLANE_TOP + (availH - unit * (yMax - yMin)) / 2;
  return { xMin, xMax, yMin, yMax, unit, left, top };
}

function sx(f: Frame, x: number): number {
  return f.left + (x - f.xMin) * f.unit;
}

function sy(f: Frame, y: number): number {
  return f.top + (f.yMax - y) * f.unit;
}

function inside(f: Frame, x: number, y: number, what: string): void {
  if (x < f.xMin || x > f.xMax || y < f.yMin || y > f.yMax) {
    throw new Error(`w-divide-stage: ${what} (${x}, ${y}) 가 평면 밖이다`);
  }
}

/** 원점에서 (dx, dy) 쪽으로 가다 평면 테두리에 닿는 자리 */
function edgeHit(f: Frame, dx: number, dy: number): { x: number; y: number } {
  if (dx === 0 && dy === 0) throw new Error('w-divide-stage: 방향 (0, 0) 은 그릴 수 없다');
  let k = Infinity;
  if (dx > 0) k = Math.min(k, f.xMax / dx);
  if (dx < 0) k = Math.min(k, f.xMin / dx);
  if (dy > 0) k = Math.min(k, f.yMax / dy);
  if (dy < 0) k = Math.min(k, f.yMin / dy);
  return { x: dx * k, y: dy * k };
}

function cardBox(i: number, n: number): { x: number; y: number; w: number; h: number } {
  const w = (PIECE_CANVAS_W - PAD_X * 2 - CARD_GAP * (n - 1)) / n;
  return { x: PAD_X + i * (w + CARD_GAP), y: SHELF_TOP, w, h: CARD_H };
}

export const wDivideStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const monoPx = parseFloat(fontSizes.xs);
    const charW = monoPx * 0.62;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function drawGrid(root: Element, f: Frame): void {
      const g = el(root, 'g', {});
      for (let x = f.xMin; x <= f.xMax; x += 1) {
        el(g, 'line', { x1: sx(f, x), y1: sy(f, f.yMax), x2: sx(f, x), y2: sy(f, f.yMin), stroke: colors.border, 'stroke-width': x === 0 ? 1.4 : 0.6 });
        if (x !== 0 && x % 2 === 0) {
          el(g, 'text', { x: sx(f, x), y: sy(f, 0) + 13, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, rawNum(x));
        }
      }
      for (let y = f.yMin; y <= f.yMax; y += 1) {
        el(g, 'line', { x1: sx(f, f.xMin), y1: sy(f, y), x2: sx(f, f.xMax), y2: sy(f, y), stroke: colors.border, 'stroke-width': y === 0 ? 1.4 : 0.6 });
        if (y !== 0 && y % 2 === 0) {
          el(g, 'text', { x: sx(f, 0) - 6, y: sy(f, y) + 4, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, rawNum(y));
        }
      }
      el(g, 'line', { x1: sx(f, f.xMin), y1: sy(f, 0), x2: sx(f, f.xMax), y2: sy(f, 0), stroke: colors.textMuted, 'stroke-width': 1.2 });
      el(g, 'line', { x1: sx(f, 0), y1: sy(f, f.yMin), x2: sx(f, 0), y2: sy(f, f.yMax), stroke: colors.textMuted, 'stroke-width': 1.2 });
      el(g, 'text', { x: sx(f, f.xMax) - 4, y: sy(f, 0) - 6, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted }, t('label.x', 'x'));
      el(g, 'text', { x: sx(f, 0) + 6, y: sy(f, f.yMax) + 12, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted }, t('label.y', 'y'));
    }

    function bundleById(scene: WDivideScene, id: string): { b: Bundle; i: number } {
      const i = scene.bundles.findIndex((b) => b.id === id);
      const b = scene.bundles[i];
      if (b === undefined) throw new Error(`w-divide-stage: 묶음 '${id}' 가 바탕에 없다`);
      return { b, i };
    }

    /**
     * 장면 전체를 세운다. `progress` 는 이번 걸음 운동의 진행률 (1 이면 멈춘 화면).
     */
    function draw(scene: WDivideScene, progress: number): void {
      svg.textContent = '';
      const f = frameOf(scene.bundles);
      const n = scene.bundles.length;
      const currentId = scene.step.kind === 'start' ? null : scene.step.id;
      const root = el(svg, 'g', {});

      drawGrid(root, f);

      // 방향 — 원점에서 평면 끝까지 (이번 걸음이면 진행률만큼 자란다)
      const arrows = el(root, 'g', {});
      for (const o of scene.outcomes) {
        if (o.kind !== 'direction') continue;
        const hit = edgeHit(f, o.dx, o.dy);
        const p = o.id === currentId ? ease(progress) : 1;
        const x2 = sx(f, hit.x * p);
        const y2 = sy(f, hit.y * p);
        const x1 = sx(f, 0);
        const y1 = sy(f, 0);
        el(arrows, 'line', { x1, y1, x2, y2, stroke: colors.text, 'stroke-width': 2.4, 'stroke-dasharray': '7 5' });
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len > 1) {
          const ux = (x2 - x1) / len;
          const uy = (y2 - y1) / len;
          const s = 11;
          const pts = [
            [x2, y2],
            [x2 - ux * s - uy * s * 0.55, y2 - uy * s + ux * s * 0.55],
            [x2 - ux * s + uy * s * 0.55, y2 - uy * s - ux * s * 0.55],
          ]
            .map(([a, b]) => `${a},${b}`)
            .join(' ');
          el(arrows, 'polygon', { points: pts, fill: colors.text });
        }
        if (p === 1) {
          el(
            arrows,
            'text',
            { x: x2 - 12, y: y2 - 12, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: colors.text },
            t('label.direction', 'direction'),
          );
        }
      }

      // 나뉜 묶음 — (x, y) 자리의 고리, 그 자리에서 떨어진 점까지의 길, 떨어진 점
      const trails = el(root, 'g', {});
      const dots = el(root, 'g', {});
      const stacks = new Map<string, Bundle[]>();
      for (const o of scene.outcomes) {
        if (o.kind !== 'point') continue;
        const { b, i } = bundleById(scene, o.id);
        inside(f, o.px, o.py, `묶음 ${b.id} 의 떨어진 점`);
        const isCur = o.id === currentId && progress < 1;
        const ink = o.id === currentId ? colors.itemActive : colors.primary;
        const rx = sx(f, b.x);
        const ry = sy(f, b.y);
        const lx = sx(f, o.px);
        const ly = sy(f, o.py);
        let dotX = lx;
        let dotY = ly;
        let slide = 1;
        if (isCur) {
          const card = cardBox(i, n);
          const cx = card.x + card.w / 2;
          const cy = card.y + card.h;
          if (progress < DROP_SHARE) {
            const q = ease(progress / DROP_SHARE);
            dotX = cx + (rx - cx) * q;
            dotY = cy + (ry - cy) * q;
            slide = 0;
          } else {
            slide = ease((progress - DROP_SHARE) / (1 - DROP_SHARE));
            dotX = rx + (lx - rx) * slide;
            dotY = ry + (ly - ry) * slide;
          }
        }
        if (!isCur || progress >= DROP_SHARE) {
          el(trails, 'circle', { cx: rx, cy: ry, r: 6, fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.4 });
          el(trails, 'line', { x1: rx, y1: ry, x2: dotX, y2: dotY, stroke: colors.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '3 3' });
        }
        el(dots, 'circle', { cx: dotX, cy: dotY, r: 5.5, fill: ink, stroke: colors.bg, 'stroke-width': 1.5 });
        if (!isCur) {
          const key = `${coord(o.px)},${coord(o.py)}`;
          const pile = stacks.get(key) ?? [];
          pile.push(b);
          stacks.set(key, pile);
        }
      }

      // 도착한 묶음 더미 — 떨어진 점 왼편에 아래에서 위로 쌓인다
      const pileG = el(root, 'g', {});
      for (const [key, pile] of stacks) {
        const [pxs, pys] = key.split(',');
        const px = sx(f, Number(pxs));
        const py = sy(f, Number(pys));
        pile.forEach((b, k) => {
          const label = tuple(b);
          const w = label.length * charW + 12;
          const top = py - CHIP_H / 2 - k * (CHIP_H + CHIP_GAP);
          const right = px - 12;
          const cur = b.id === currentId;
          el(pileG, 'rect', { x: right - w, y: top, width: w, height: CHIP_H, rx: 3, fill: colors.bg, stroke: cur ? colors.itemActive : colors.primary, 'stroke-width': cur ? 1.6 : 1 });
          el(pileG, 'text', { x: right - w / 2, y: top + CHIP_H / 2 + monoPx * 0.36, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.text }, label);
        });
      }

      // 선반 — 묶음 다섯, 아래 줄은 그 묶음이 어떻게 되었는가
      const shelf = el(root, 'g', {});
      const outcomeById = new Map(scene.outcomes.map((o) => [o.id, o] as const));
      scene.bundles.forEach((b, i) => {
        const box = cardBox(i, n);
        const o = outcomeById.get(b.id);
        const cur = b.id === currentId;
        el(shelf, 'rect', {
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rx: 5,
          fill: o && !cur ? colors.bgSubtle : colors.bg,
          stroke: cur ? colors.itemActive : colors.border,
          'stroke-width': cur ? 2 : 1,
        });
        el(shelf, 'text', { x: box.x + box.w / 2, y: box.y + 18, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: o && !cur ? colors.textMuted : colors.text }, tuple(b));
        if (o === undefined) return;
        const below =
          o.kind === 'point'
            ? t('label.landed', '→ ({px}, {py})', { px: coord(o.px), py: coord(o.py) })
            : t('label.direction', 'direction');
        el(shelf, 'text', { x: box.x + box.w / 2, y: box.y + 36, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, below);
      });

      // 캡션 — 지금 일어나는 일
      const landedCount = scene.outcomes.filter((o) => o.kind === 'point').length;
      const cap = el(root, 'g', {});
      const capY = H - CAPTION_H + 16;
      const line = (y: number, text: string, weight: number, fill: string): void => {
        el(cap, 'text', { x: PIECE_CANVAS_W / 2, y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': weight, fill }, text);
      };
      const step = scene.step;
      if (step.kind === 'start') {
        line(capY, t('caption.start', 'Homogeneous triples (x, y, w): {n}', { n: scene.bundles.length }), 600, colors.text);
        return;
      }
      const { b } = bundleById(scene, step.id);
      const o = outcomeById.get(step.id);
      if (o === undefined) throw new Error(`w-divide-stage: 이번 걸음의 묶음 '${step.id}' 에 결과가 없다`);
      if (o.kind === 'point') {
        line(
          capY,
          t('caption.divide', '({x}, {y}, {w}) ÷ {w} → ({px}, {py})', {
            x: rawNum(b.x),
            y: rawNum(b.y),
            w: rawNum(b.w),
            px: coord(o.px),
            py: coord(o.py),
          }),
          600,
          colors.text,
        );
      } else {
        line(
          capY,
          t('caption.direction', 'w is 0: no division. ({x}, {y}, {w}) → direction ({dx}, {dy})', {
            x: rawNum(b.x),
            y: rawNum(b.y),
            w: rawNum(b.w),
            dx: rawNum(o.dx),
            dy: rawNum(o.dy),
          }),
          600,
          colors.text,
        );
      }
      line(capY + 22, t('caption.arrived', 'Landed on the plane: {n}', { n: landedCount }), 400, colors.textMuted);
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    async function play(scene: WDivideScene, ms: number, mine: number): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (destroyed || mine !== gen) return;
        const p = Math.min(1, (Date.now() - start) / ms);
        draw(scene, p);
        if (p >= 1) return;
        await wait(FRAME_MS);
      }
    }

    return {
      async render(next: WDivideScene, _prev: WDivideScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step.kind === 'start') {
          draw(next, 1);
          return;
        }
        await play(next, next.step.kind === 'land' ? LAND_MS : DIRECTION_MS, mine);
        if (destroyed || mine !== gen) return;
        draw(next, 1);
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
    } as ViewInstance;
  },
};
