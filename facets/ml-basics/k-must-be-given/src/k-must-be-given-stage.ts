/**
 * k-must-be-given stage — 같은 점 열둘이 k 마다 다르게 갈리는 것을 보이는 화면.
 *
 * ── 무엇이 어디에 있는가
 *
 *   왼쪽 좁고 긴 칸   점 열둘. 자료는 그대로고 **자르는 선만** 바뀐다. k 를 정할 때
 *                     테두리가 한 덩이로 되돌아오고, 답이 나오면 그 한 덩이가 k 조각
 *                     으로 찢어진다. 점은 움직이지 않는다 — 움직이는 것은 나눔이다.
 *   오른쪽 위 세 줄   k 마다의 답이 쌓인다. 열두 칸이 열두 점의 소속이고 무리마다
 *                     크기를 얹는다. **먼저 나온 답을 지우지 않는다.**
 *   오른쪽 아래       흩어짐 합. k 가 커질수록 늘 내려간다. 줄어든 폭을 계단으로 재고,
 *                     첫 점과 끝 점을 잇는 곧은 선을 그어 가운데 점이 그 선 위에
 *                     놓이는 것을 보인다 — 꺾이는 자리가 없다.
 *
 * 세로 축척은 마운트 뒤에 다시 재지 않는다 (S-view). 흩어짐 눈금은 첫 걸음이 준
 * `scatterMax` 로 한 번만 정한다.
 *
 * 테두리의 여백은 k 가 클수록 좁고 선 모양(점선 간격)도 k 마다 다르다. 마지막에 세
 * 답을 겹쳐 그릴 때 큰 k 가 안쪽으로 들어와 서로를 가리지 않게 하려는 것이고, 그
 * 선 모양이 줄 머리의 견본과 짝이 된다.
 *
 * 타이머는 두지 않고 프레임만 쓴다. 걸어 둔 프레임과 기다리던 promise 는 `destroy`
 * 가 일괄로 거둔다 (S-piece).
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 정한다 (S-piece). */
const H = 380;

// ── 왼쪽: 점 무리
const PLOT_X = 16;
const PLOT_W = 150;
const PLOT_TOP = 34;
const PLOT_BOT = 336;
const DIVIDER_X = 176;
const POINT_R = 5;
const SEED_R = 9;
const CENTRE_R = 5.5;
const HULL_PAD_WIDEST = 22;
const HULL_PAD_STEP = 8;
const HULL_PAD_MIN = 6;

// ── 오른쪽 위: 답이 쌓이는 줄
const LX = 188;
const HEAD_Y = 24;
const ROWS_TOP = 34;
const ROW_PITCH = 42;
const CELL_H = 20;
const CELL_GAP = 3;
const CELL_MAX_W = 30;
const SWATCH_W = 26;
const STRIP_X = 226;
const CURSOR_X = 180;
const BADGE_W = 17;
const BADGE_H = 15;

// ── 오른쪽 아래: 흩어짐 합
const AXIS_X = 194;
const ELBOW_L = 250;
const ELBOW_R = 584;
const AXIS_HEADROOM = 6;
const MARK_R = 4.5;

const CAPTION_Y = 362;

// ── 걸음마다의 움직임 길이 (ms)
const CLOUD_MS = 480;
const MERGE_MS = 340;
const SEED_MS = 320;
const SPLIT_MS = 560;
const DROP_MS = 420;
const CHORD_MS = 420;
const BLOOM_MS = 560;

type Rect = { x: number; y: number; w: number; h: number };
type Spot = { x: number; y: number };
type Scene = { points: Spot[]; ks: number[] };

/** 한 k 가 남긴 답. 마지막에 셋을 겹쳐 그리려면 지우지 않고 들고 있어야 한다. */
type LoggedRun = { k: number; assign: number[]; scatter: number; slots: number[] };

export type SettleStep = {
  k: number;
  assign: number[];
  sizes: number[];
  centers: Spot[];
  scatter: number;
};

export type KMustBeGivenStage = ViewInstance & {
  showCloud(scatterMax: number): Promise<void>;
  chooseK(k: number, seeds: number[]): Promise<void>;
  settle(step: SettleStep): Promise<void>;
  markDrops(drops: number[]): Promise<void>;
  drawChord(): Promise<void>;
  overlayAll(): Promise<void>;
  rewind(): void;
  setCaption(text: string): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function spotsOf(raw: unknown): Spot[] {
  if (!Array.isArray(raw)) return [];
  const out: Spot[] = [];
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [x, y] = pair as unknown[];
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    out.push({ x, y });
  }
  return out;
}

/** initialData 를 좁히는 자리는 여기 하나다 (S-piece). */
function readScene(raw: unknown): Scene {
  if (typeof raw !== 'object' || raw === null) return { points: [], ks: [] };
  const data = raw as Record<string, unknown>;
  const ks = Array.isArray(data.ks)
    ? data.ks.filter((v): v is number => typeof v === 'number' && v >= 1)
    : [];
  return { points: spotsOf(data.points), ks };
}

/** k 가 클수록 테두리가 바짝 붙는다 — 겹쳐 그릴 때 안쪽으로 들어오게. */
function hullPad(k: number): number {
  return Math.max(HULL_PAD_MIN, HULL_PAD_WIDEST - (k - 2) * HULL_PAD_STEP);
}

/**
 * 무리마다의 색 자리.
 *
 * 색은 무리 **번호**가 아니라 그 무리가 자료의 어디쯤에서 시작하는가로 정한다.
 * 번호로 정하면 k=2 의 둘째 무리(위쪽 여섯)와 k=3 의 둘째 무리(오른아래 셋)가
 * 같은 색을 얻어, 줄이 서로 다른 답인데 같은 것을 가리키는 것처럼 읽힌다.
 * 자리로 정하면 위쪽은 k 가 무엇이든 같은 색이다.
 *
 * 자리가 겹치면 빈 자리로 밀어 준다 — 무리 수가 자리 수를 넘지 않으므로 반드시 빈다.
 */
function hueSlots(assign: number[], groups: number, slots: number): number[] {
  const taken = new Set<number>();
  const out: number[] = [];
  const span = Math.max(assign.length, 1);
  for (let g = 0; g < groups; g += 1) {
    const first = assign.indexOf(g);
    let slot = first < 0 ? g % slots : Math.floor((first * slots) / span);
    while (taken.has(slot)) slot = (slot + 1) % slots;
    taken.add(slot);
    out.push(slot);
  }
  return out;
}

/** k 마다의 선 모양. 줄 머리의 견본과 마지막 겹침이 이것으로 짝을 짓는다. */
function dashOf(index: number, total: number): string {
  if (index >= total - 1) return 'none';
  return index <= 0 ? '7 4' : '3 3';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function rectOf(node: SVGRectElement): Rect {
  return {
    x: Number(node.getAttribute('x')),
    y: Number(node.getAttribute('y')),
    w: Number(node.getAttribute('width')),
    h: Number(node.getAttribute('height')),
  };
}

export const kMustBeGivenStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const colors = getColors(params.theme ?? 'light');
    const tr = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 러너가 캔버스를 먼저 붙였다 (S-view).
    svg.textContent = '';

    const W = PIECE_CANVAS_W;
    const RX = W - 20;
    const rowCount = Math.max(scene.ks.length, 1);
    const ruleY = ROWS_TOP + (rowCount - 1) * ROW_PITCH + CELL_H + 16;
    const elbowHeadY = ruleY + 20;
    const axisTop = ruleY + 36;
    const kAxisY = CAPTION_Y - 24;
    const axisBase = kAxisY - 18;
    const palette = categorical(Math.max(2, ...scene.ks), 'vivid');
    const hue = (group: number): string => palette[Math.abs(group) % palette.length] ?? colors.text;

    // ── 점 자리. 가로세로 축척을 하나로 두어 거리가 뒤틀리지 않게 한다.
    const widestPad = scene.ks.length > 0 ? hullPad(Math.min(...scene.ks)) : HULL_PAD_WIDEST;
    const xs = scene.points.map((p) => p.x);
    const ys = scene.points.map((p) => p.y);
    const xMin = xs.length > 0 ? Math.min(...xs) : 0;
    const xMax = xs.length > 0 ? Math.max(...xs) : 1;
    const yMax = ys.length > 0 ? Math.max(...ys) : 1;
    const yMin = ys.length > 0 ? Math.min(...ys) : 0;
    const spanX = Math.max(xMax - xMin, 1e-6);
    const spanY = Math.max(yMax - yMin, 1e-6);
    const scale = Math.min(
      (PLOT_W - 2 * widestPad) / spanX,
      (PLOT_BOT - PLOT_TOP - 2 * widestPad) / spanY,
    );
    const originX = PLOT_X + (PLOT_W - spanX * scale) / 2;
    const originY = PLOT_TOP + (PLOT_BOT - PLOT_TOP - spanY * scale) / 2;
    const sx = (x: number): number => originX + (x - xMin) * scale;
    const sy = (y: number): number => originY + (yMax - y) * scale;

    function hullOf(members: number[], pad: number): Rect {
      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      for (const i of members) {
        if (i < 0 || i >= scene.points.length) continue;
        const p = scene.points[i];
        x1 = Math.min(x1, sx(p.x));
        x2 = Math.max(x2, sx(p.x));
        y1 = Math.min(y1, sy(p.y));
        y2 = Math.max(y2, sy(p.y));
      }
      if (!Number.isFinite(x1)) return { x: PLOT_X, y: PLOT_TOP, w: 0, h: 0 };
      return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad };
    }

    function membersOf(assign: number[], group: number): number[] {
      const out: number[] = [];
      assign.forEach((g, i) => {
        if (g === group) out.push(i);
      });
      return out;
    }

    // ── 칸 폭은 남는 자리에서 역산하고 상수로는 상한만 둔다 (S-piece).
    const cellCount = Math.max(scene.points.length, 1);
    const stripSpan = RX - STRIP_X;
    const cellW = Math.min(
      CELL_MAX_W,
      Math.floor((stripSpan - (cellCount - 1) * CELL_GAP) / cellCount),
    );
    const stripW = cellCount * cellW + (cellCount - 1) * CELL_GAP;
    const stripX = STRIP_X + Math.round((stripSpan - stripW) / 2);
    const rowTop = (index: number): number => ROWS_TOP + Math.max(index, 0) * ROW_PITCH;
    const cellX = (index: number): number => stripX + index * (cellW + CELL_GAP);

    const elbowX = (index: number): number =>
      rowCount <= 1
        ? (ELBOW_L + ELBOW_R) / 2
        : ELBOW_L + ((ELBOW_R - ELBOW_L) * Math.max(index, 0)) / (rowCount - 1);

    let scatterTop = 1;
    const elbowY = (value: number): number =>
      axisBase - (value / scatterTop) * (axisBase - axisTop - AXIS_HEADROOM);

    // ── 움직임. destroy 가 기다리던 것을 전부 깨운다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    function animate(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        let id = 0;
        const frame = (): void => {
          frames.delete(id);
          if (destroyed) return; // destroy 가 waiters 를 이미 깨웠다
          const raw = clamp01((Date.now() - started) / ms);
          apply(raw >= 1 ? 1 : easeInOut(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        apply(0);
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    // ── 켜. 그리는 차례가 곧 겹치는 차례다.
    const root = el('g', {});
    svg.appendChild(root);
    const frameLayer = el('g', {});
    const hullLayer = el('g', {});
    const pointLayer = el('g', {});
    const centreLayer = el('g', {});
    const rowLayer = el('g', {});
    const elbowLayer = el('g', {});
    const captionLayer = el('g', {});
    const layers = [frameLayer, hullLayer, pointLayer, centreLayer, rowLayer, elbowLayer, captionLayer];
    for (const layer of layers) root.appendChild(layer);

    function write(
      x: number,
      y: number,
      content: string,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
      family: string,
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-size': size,
        'font-family': family,
        fill,
        'text-anchor': anchor,
      });
      node.textContent = content;
      return node;
    }

    function setRect(node: SVGRectElement, r: Rect): void {
      node.setAttribute('x', String(r.x));
      node.setAttribute('y', String(r.y));
      node.setAttribute('width', String(Math.max(0, r.w)));
      node.setAttribute('height', String(Math.max(0, r.h)));
    }

    function tweenRect(node: SVGRectElement, from: Rect, to: Rect, t: number): void {
      setRect(node, {
        x: lerp(from.x, to.x, t),
        y: lerp(from.y, to.y, t),
        w: lerp(from.w, to.w, t),
        h: lerp(from.h, to.h, t),
      });
    }

    // ── 화면 상태
    const logged: LoggedRun[] = [];
    let dots: SVGCircleElement[] = [];
    let hulls: SVGRectElement[] = [];
    let rings: SVGCircleElement[] = [];
    let ringSeeds: number[] = [];
    let cursor: SVGRectElement | null = null;
    let captionNode: SVGTextElement | null = null;

    function paintDots(assign: number[] | null, slots: number[]): void {
      dots.forEach((dot, i) => {
        const group = assign === null || i >= assign.length ? -1 : assign[i];
        const grouped = group >= 0 && group < slots.length;
        dot.setAttribute('fill', grouped ? hue(slots[group]) : colors.bgSubtle);
        dot.setAttribute('stroke', grouped ? colors.stateInk : colors.textMuted);
      });
    }

    function buildScaffold(): void {
      frameLayer.appendChild(
        el('line', {
          x1: DIVIDER_X,
          y1: PLOT_TOP - 14,
          x2: DIVIDER_X,
          y2: PLOT_BOT,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      frameLayer.appendChild(
        write(
          LX,
          HEAD_Y,
          tr('label.membership', 'group of each point'),
          fontSizes.xs,
          colors.textMuted,
          'start',
          fonts.body,
        ),
      );
      // 답이 들어올 자리를 미리 비워 둔다 — 셋이 쌓인다는 것을 첫 걸음에서 알린다.
      scene.ks.forEach((_, i) => {
        frameLayer.appendChild(
          el('rect', {
            x: stripX,
            y: rowTop(i),
            width: stripW,
            height: CELL_H,
            rx: 3,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 4',
          }),
        );
      });
      frameLayer.appendChild(
        el('line', { x1: LX, y1: ruleY, x2: RX, y2: ruleY, stroke: colors.border, 'stroke-width': 1 }),
      );
      frameLayer.appendChild(
        write(
          LX,
          elbowHeadY,
          tr('label.scatterSum', 'scatter sum'),
          fontSizes.xs,
          colors.textMuted,
          'start',
          fonts.body,
        ),
      );
      // 흩어짐 축. 밑변이 0 이고 위로 갈수록 흩어짐이 크다.
      frameLayer.appendChild(
        el('line', { x1: AXIS_X, y1: axisTop, x2: AXIS_X, y2: axisBase, stroke: colors.border, 'stroke-width': 1 }),
      );
      frameLayer.appendChild(
        el('line', { x1: AXIS_X, y1: axisBase, x2: RX, y2: axisBase, stroke: colors.border, 'stroke-width': 1 }),
      );
      scene.ks.forEach((k, i) => {
        // 수식 표기는 표식이라 키를 두지 않는다 (C10).
        frameLayer.appendChild(
          write(elbowX(i), kAxisY, `k = ${k}`, fontSizes.xs, colors.textMuted, 'middle', fonts.mono),
        );
      });
      const bar = el('rect', {
        x: CURSOR_X,
        y: ROWS_TOP,
        width: 3,
        height: CELL_H,
        rx: 1.5,
        fill: colors.accent,
        opacity: 0,
      });
      frameLayer.appendChild(bar);
      cursor = bar;
    }

    return {
      setCaption(text: string): void {
        if (captionNode === null) {
          const node = write(W / 2, CAPTION_Y, text, fontSizes.md, colors.text, 'middle', fonts.body);
          captionLayer.appendChild(node);
          captionNode = node;
          return;
        }
        captionNode.textContent = text;
      },

      async showCloud(scatterMax: number): Promise<void> {
        scatterTop = scatterMax > 0 ? scatterMax : 1;
        buildScaffold();
        dots = scene.points.map((p) =>
          el('circle', {
            cx: sx(p.x),
            cy: sy(p.y),
            r: 0,
            fill: colors.bgSubtle,
            stroke: colors.textMuted,
            'stroke-width': 1.2,
          }),
        );
        for (const dot of dots) pointLayer.appendChild(dot);
        const n = Math.max(dots.length, 1);
        await animate(CLOUD_MS, (p) => {
          dots.forEach((dot, i) => {
            dot.setAttribute('r', String(POINT_R * clamp01(p * (n + 3) - i)));
          });
        });
      },

      async chooseK(k: number, seeds: number[]): Promise<void> {
        const index = scene.ks.indexOf(k);
        const whole = hullOf(
          scene.points.map((_, i) => i),
          hullPad(k),
        );

        // 앞선 답의 테두리가 한 덩이로 되돌아온다 — 이 k 는 처음부터 다시 도는 것이다.
        centreLayer.textContent = '';
        rings = [];
        ringSeeds = [];
        paintDots(null, []);

        if (hulls.length === 0) {
          const grown: Rect = { x: whole.x - 16, y: whole.y - 16, w: whole.w + 32, h: whole.h + 32 };
          const only = el('rect', {
            x: grown.x,
            y: grown.y,
            width: grown.w,
            height: grown.h,
            rx: 12,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 2,
            'stroke-dasharray': '4 4',
          });
          hullLayer.appendChild(only);
          hulls = [only];
          await animate(MERGE_MS, (p) => tweenRect(only, grown, whole, p));
        } else {
          const from = hulls.map(rectOf);
          const merging = hulls;
          await animate(MERGE_MS, (p) => {
            merging.forEach((node, i) => {
              tweenRect(node, from[i], whole, p);
              node.setAttribute('stroke', colors.border);
              node.setAttribute('stroke-dasharray', '4 4');
              if (i > 0) node.setAttribute('opacity', String(1 - p));
            });
          });
          merging.slice(1).forEach((node) => node.remove());
          hulls = merging.slice(0, 1);
        }

        if (cursor !== null && index >= 0) {
          cursor.setAttribute('y', String(rowTop(index)));
          cursor.setAttribute('opacity', '1');
        }
        if (index >= 0) {
          // 수식 표기는 표식이라 키를 두지 않는다 (C10). 아래 견본은 마지막에
          // 겹쳐 그릴 테두리의 선 모양이라, 그때 어느 줄이 어느 테두리인지 잇는다.
          rowLayer.appendChild(
            write(LX, rowTop(index) + 11, `k = ${k}`, fontSizes.sm, colors.text, 'start', fonts.mono),
          );
          rowLayer.appendChild(
            el('line', {
              x1: LX,
              y1: rowTop(index) + 18,
              x2: LX + SWATCH_W,
              y2: rowTop(index) + 18,
              stroke: colors.textMuted,
              'stroke-width': 2,
              'stroke-dasharray': dashOf(index, rowCount),
            }),
          );
        }

        // 시작 중심으로 고른 점에 고리를 씌운다. 고른 차례대로 하나씩.
        ringSeeds = seeds.filter((i) => i >= 0 && i < scene.points.length);
        rings = ringSeeds.map((i) => {
          const p = scene.points[i];
          const ring = el('circle', {
            cx: sx(p.x),
            cy: sy(p.y),
            r: SEED_R,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 2,
            opacity: 0,
          });
          centreLayer.appendChild(ring);
          return ring;
        });
        const shown = rings;
        const count = shown.length;
        await animate(SEED_MS, (p) => {
          shown.forEach((ring, j) => {
            const local = clamp01(p * (count + 1) - j);
            ring.setAttribute('r', String(SEED_R + 7 * (1 - local)));
            ring.setAttribute('opacity', String(local));
          });
        });
      },

      async settle(step: SettleStep): Promise<void> {
        const index = scene.ks.indexOf(step.k);
        const pad = hullPad(step.k);
        const merged = hulls.length > 0 ? hulls[0] : null;
        const wholeRect =
          merged === null
            ? hullOf(
                scene.points.map((_, i) => i),
                pad,
              )
            : rectOf(merged);

        // 한 덩이가 k 조각으로 찢어진다. 조각마다 제 무리를 감싸는 자리로 간다.
        const slots = hueSlots(step.assign, step.sizes.length, palette.length);
        const targets = step.sizes.map((_, g) => hullOf(membersOf(step.assign, g), pad));
        const pieces = targets.map((_, g) => {
          const node = el('rect', {
            x: wholeRect.x,
            y: wholeRect.y,
            width: wholeRect.w,
            height: wholeRect.h,
            rx: 10,
            fill: 'none',
            stroke: hue(slots[g]),
            'stroke-width': 2,
            'stroke-dasharray': dashOf(index, rowCount),
          });
          hullLayer.appendChild(node);
          return node;
        });
        paintDots(step.assign, slots);

        // 중심이 시작 자리에서 제 무리의 무게중심으로 옮겨 간다.
        const travelling = rings;
        const ringFrom = travelling.map((ring) => ({
          x: Number(ring.getAttribute('cx')),
          y: Number(ring.getAttribute('cy')),
        }));
        const ringTo = travelling.map((_, j) => {
          const seed = j < ringSeeds.length ? ringSeeds[j] : -1;
          if (seed < 0 || seed >= step.assign.length) return ringFrom[j];
          const group = step.assign[seed];
          if (group < 0 || group >= step.centers.length) return ringFrom[j];
          const centre = step.centers[group];
          return { x: sx(centre.x), y: sy(centre.y) };
        });

        // 답을 줄에 적는다. 열두 칸이 열두 점의 소속이다.
        const rowY = rowTop(index);
        const cells = step.assign.map((g, i) => {
          const node = el('rect', {
            x: cellX(i),
            y: rowY + CELL_H / 2,
            width: cellW,
            height: 0,
            rx: 3,
            fill: hue(slots[g]),
          });
          rowLayer.appendChild(node);
          return node;
        });
        // 무리 크기는 칸 위에 얹지 않고 작은 배지에 담는다 — 그냥 얹으면 칸에
        // 적힌 값처럼 읽힌다.
        const counts = step.sizes.map((size, g) => {
          const members = membersOf(step.assign, g);
          const first = members.length > 0 ? members[0] : 0;
          const last = members.length > 0 ? members[members.length - 1] : 0;
          const midX = (cellX(first) + cellX(last) + cellW) / 2;
          const badge = el('g', { opacity: 0 });
          badge.appendChild(
            el('rect', {
              x: midX - BADGE_W / 2,
              y: rowY + (CELL_H - BADGE_H) / 2,
              width: BADGE_W,
              height: BADGE_H,
              rx: BADGE_H / 2,
              fill: colors.bg,
            }),
          );
          const digits = write(
            midX,
            rowY + CELL_H / 2 + 4,
            String(size),
            fontSizes.sm,
            colors.text,
            'middle',
            fonts.mono,
          );
          digits.setAttribute('font-weight', '600');
          badge.appendChild(digits);
          rowLayer.appendChild(badge);
          return badge;
        });

        // 흩어짐 합을 눈금 위에 찍는다. 축에서 제 k 자리까지 미끄러져 온다.
        const markY = elbowY(step.scatter);
        const markX = elbowX(index);
        const mark = el('circle', { cx: AXIS_X, cy: markY, r: MARK_R, fill: colors.text });
        const markLabel = write(
          markX,
          markY + 17,
          step.scatter.toFixed(2),
          fontSizes.xs,
          colors.text,
          'middle',
          fonts.mono,
        );
        markLabel.setAttribute('opacity', '0');
        elbowLayer.appendChild(mark);
        elbowLayer.appendChild(markLabel);

        const cells0 = Math.max(cells.length, 1);
        await animate(SPLIT_MS, (p) => {
          pieces.forEach((node, g) => tweenRect(node, wholeRect, targets[g], p));
          if (merged !== null) merged.setAttribute('opacity', String(1 - p));
          travelling.forEach((ring, j) => {
            ring.setAttribute('cx', String(lerp(ringFrom[j].x, ringTo[j].x, p)));
            ring.setAttribute('cy', String(lerp(ringFrom[j].y, ringTo[j].y, p)));
            ring.setAttribute('r', String(lerp(SEED_R, CENTRE_R, p)));
          });
          cells.forEach((node, i) => {
            const local = clamp01(p * (cells0 + 4) - i);
            node.setAttribute('height', String(CELL_H * local));
            node.setAttribute('y', String(rowY + (CELL_H * (1 - local)) / 2));
          });
          for (const node of counts) node.setAttribute('opacity', String(clamp01(p * 2 - 1)));
          mark.setAttribute('cx', String(lerp(AXIS_X, markX, p)));
          markLabel.setAttribute('opacity', String(clamp01(p * 2 - 1)));
        });

        if (merged !== null) merged.remove();
        hulls = pieces;
        logged.push({ k: step.k, assign: step.assign, scatter: step.scatter, slots });
      },

      async markDrops(drops: number[]): Promise<void> {
        type DropMark = {
          ledge: SVGLineElement;
          fall: SVGLineElement;
          tag: SVGTextElement;
          x0: number;
          x1: number;
          y0: number;
          y1: number;
        };
        const marks: DropMark[] = [];
        drops.forEach((amount, i) => {
          if (i + 1 >= logged.length) return;
          const x0 = elbowX(i);
          const x1 = elbowX(i + 1);
          const y0 = elbowY(logged[i].scatter);
          const y1 = elbowY(logged[i + 1].scatter);
          const ledge = el('line', {
            x1: x0,
            y1: y0,
            x2: x0,
            y2: y0,
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          });
          const fall = el('line', { x1, y1: y0, x2: x1, y2: y0, stroke: colors.danger, 'stroke-width': 2 });
          const tag = write(
            x1 - 8,
            (y0 + y1) / 2 + 4,
            amount.toFixed(2),
            fontSizes.xs,
            colors.danger,
            'end',
            fonts.mono,
          );
          tag.setAttribute('opacity', '0');
          elbowLayer.appendChild(ledge);
          elbowLayer.appendChild(fall);
          elbowLayer.appendChild(tag);
          marks.push({ ledge, fall, tag, x0, x1, y0, y1 });
        });
        await animate(DROP_MS, (p) => {
          for (const m of marks) {
            m.ledge.setAttribute('x2', String(lerp(m.x0, m.x1, clamp01(p * 2))));
            m.fall.setAttribute('y2', String(lerp(m.y0, m.y1, clamp01(p * 2 - 1))));
            m.tag.setAttribute('opacity', String(clamp01(p * 3 - 2)));
          }
        });
      },

      async drawChord(): Promise<void> {
        if (logged.length < 2) return;
        const x0 = elbowX(0);
        const y0 = elbowY(logged[0].scatter);
        const x1 = elbowX(logged.length - 1);
        const y1 = elbowY(logged[logged.length - 1].scatter);
        const chord = el('line', {
          x1: x0,
          y1: y0,
          x2: x0,
          y2: y0,
          stroke: colors.accent,
          'stroke-width': 2.5,
          'stroke-dasharray': '6 4',
        });
        elbowLayer.appendChild(chord);
        const halos = logged.slice(1, -1).map((run, i) => {
          const node = el('circle', {
            cx: elbowX(i + 1),
            cy: elbowY(run.scatter),
            r: MARK_R,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 2,
            opacity: 0,
          });
          elbowLayer.appendChild(node);
          return node;
        });
        await animate(CHORD_MS, (p) => {
          chord.setAttribute('x2', String(lerp(x0, x1, p)));
          chord.setAttribute('y2', String(lerp(y0, y1, p)));
          const late = clamp01(p * 2 - 1);
          for (const halo of halos) {
            halo.setAttribute('r', String(MARK_R + 8 * (1 - late)));
            halo.setAttribute('opacity', String(late));
          }
        });
      },

      async overlayAll(): Promise<void> {
        // 어느 답도 화면을 차지하지 않는다 — 점은 색을 놓고 테두리 셋이 함께 남는다.
        centreLayer.textContent = '';
        rings = [];
        ringSeeds = [];
        paintDots(null, []);
        for (const node of hulls) node.remove();
        hulls = [];
        if (cursor !== null) cursor.setAttribute('opacity', '0');

        const blooms: Array<{ node: SVGRectElement; seed: Rect; full: Rect; phase: number }> = [];
        logged.forEach((run, index) => {
          const pad = hullPad(run.k);
          const groups = run.slots.length;
          for (let g = 0; g < groups; g += 1) {
            const full = hullOf(membersOf(run.assign, g), pad);
            const seed: Rect = { x: full.x + full.w / 2, y: full.y + full.h / 2, w: 0, h: 0 };
            const node = el('rect', {
              x: seed.x,
              y: seed.y,
              width: 0,
              height: 0,
              rx: 10,
              fill: 'none',
              stroke: hue(run.slots[g]),
              'stroke-width': 2,
              'stroke-dasharray': dashOf(index, rowCount),
            });
            hullLayer.appendChild(node);
            hulls.push(node);
            // 안쪽(큰 k)부터 피어나 바깥으로 번진다.
            blooms.push({ node, seed, full, phase: logged.length - 1 - index });
          }
        });
        const phases = Math.max(logged.length, 1);
        await animate(BLOOM_MS, (p) => {
          for (const b of blooms) tweenRect(b.node, b.seed, b.full, clamp01(p * (phases + 1) - b.phase));
        });
      },

      rewind(): void {
        for (const layer of layers) layer.textContent = '';
        logged.length = 0;
        dots = [];
        hulls = [];
        rings = [];
        ringSeeds = [];
        cursor = null;
        captionNode = null;
        scatterTop = 1;
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    } satisfies KMustBeGivenStage;
  },
};
