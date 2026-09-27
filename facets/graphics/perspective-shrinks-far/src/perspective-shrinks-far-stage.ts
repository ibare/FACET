/**
 * perspective-shrinks-far 무대.
 *
 * 왼쪽은 옆에서 본 모습 — 눈 · 눈에서 f 떨어진 화면(세로 선) · 거리마다 선 기둥. 오른쪽은 눈이 보는
 * 화면 그 자체다. 두 쪽은 세로 축척이 같아서, 옆모습의 화면 선 위에 맺힌 기둥의 상이 그 높이
 * 그대로 오른쪽 화면으로 옮겨 간다.
 *
 * 한 걸음의 운동: 기둥의 꼭대기와 밑에서 눈으로 빛줄기 둘이 뻗고(화면 선을 지나며 상이 맺힌다),
 * 맺힌 상이 오른쪽 화면의 제 x' 자리로 미끄러져 간다. 상은 앞의 것보다 작고 가운데 한 점에 더 가깝다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { depthOf, type ShrinkProjection } from './algorithm.js';
import type { PerspectiveShrinksFarScene } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 16;
/** 옆모습과 화면 사이 틈 */
const GAP = 40;
/** 세로 축척(한 단위의 px) 상한 */
const V_MAX = 90;
/** 그림이 시작하는 세로 자리 (캡션 두 줄과 판 제목 아래) */
const TOP = 100;
/** 기둥 아래 거리 글자 줄의 몫 */
const FOOT = 44;
/** 눈 그림이 차지하는 왼쪽 몫 */
const EYE_ROOM = 34;
const RAY_MS = 380;
const SLIDE_MS = 460;
const FRAME_MS = 16;
const POST_W = 5;

type Attrs = Record<string, string | number>;

function put<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
  content?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (content !== undefined) node.textContent = content;
  parent.appendChild(node);
  return node;
}

/** 표시 반올림 — 소수 셋째 자리, -0 은 0 으로 */
function fix3(v: number): string {
  const s = v.toFixed(3);
  if (s === '-0.000') return '0.000';
  // 음수 부호는 빼기 기호(U+2212)로 보인다
  return s.startsWith('-') ? `\u2212${s.slice(1)}` : s;
}

/** 거리 · f 같은 자료값 — 정수면 그대로, 아니면 셋째 자리 */
function plain(v: number): string {
  return Number.isInteger(v) ? String(v) : fix3(v);
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** 캔버스와 바탕에서 정해지는 자리 */
type Frame = {
  v: number;
  y0: number;
  eyeX: number;
  planeX: number;
  depthScale: number;
  sideRight: number;
  screenCx: number;
  screenHalf: number;
  footY: number;
};

function frameOf(scene: PerspectiveShrinksFarScene): Frame {
  const W = PIECE_CANVAS_W;
  let yExtent = scene.focal;
  let dMax = scene.focal;
  for (const p of scene.posts) {
    yExtent = Math.max(yExtent, Math.abs(p.yTop), Math.abs(p.yBottom));
    dMax = Math.max(dMax, depthOf(p.z));
  }
  const v = Math.min(V_MAX, (H - TOP - FOOT) / (2 * yExtent));
  const y0 = TOP + yExtent * v;
  const screenHalf = scene.focal * v;
  const screenCx = W - PAD - screenHalf;
  const sideRight = W - PAD - 2 * screenHalf - GAP;
  const eyeX = PAD + EYE_ROOM;
  const depthScale = (sideRight - 12 - eyeX) / dMax;
  return {
    v,
    y0,
    eyeX,
    planeX: eyeX + scene.focal * depthScale,
    depthScale,
    sideRight,
    screenCx,
    screenHalf,
    footY: y0 + yExtent * v + 20,
  };
}

/** 이번 걸음의 운동이 만질 손잡이 */
type Handles = {
  rays: SVGLineElement[];
  /** 빛줄기가 떠나는 자리(기둥의 꼭대기 · 밑)와 닿는 자리(눈) */
  rayFrom: { x: number; y: number }[];
  eye: { x: number; y: number };
  /** 상이 미끄러지는 가로 구간 — 화면 선에서 화면의 x' 자리로 */
  fromX: number;
  toX: number;
  planeSeg: SVGLineElement;
  screenSeg: SVGLineElement;
  guides: SVGLineElement[];
};

export const perspectiveShrinksFarStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function drawStatic(scene: PerspectiveShrinksFarScene): Handles | null {
      svg.textContent = '';
      const f = frameOf(scene);
      const hues = categorical(scene.posts.length);
      const hueOf = (index: number): string => {
        const hue = hues[index];
        if (hue === undefined) throw new Error(`perspective-shrinks-far-stage: 기둥 ${index} 의 색이 없다`);
        return hue;
      };
      const postX = (d: number): number => f.eyeX + d * f.depthScale;
      const sy = (y: number): number => f.y0 - y * f.v;
      const screenX = (x: number): number => f.screenCx + x * f.v;
      const step = scene.step;
      const currentIndex = step.kind === 'project' ? step.index : -1;

      // 캡션
      const first = scene.posts[0];
      if (!first) throw new Error('perspective-shrinks-far-stage: 기둥이 없다');
      const cap1 = put(svg, 'text', {
        x: PAD,
        y: 24,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      const cap2 = put(svg, 'text', {
        x: PAD,
        y: 46,
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      if (step.kind === 'start') {
        cap1.textContent = t('caption.start', 'Posts of the same height: {height}', {
          height: plain(first.yTop - first.yBottom),
        });
        cap2.textContent = t('caption.screen', 'Screen distance from the eye: {f}', { f: plain(scene.focal) });
      } else {
        const shot = scene.projected.find((p) => p.index === step.index);
        if (!shot) throw new Error(`perspective-shrinks-far-stage: 기둥 ${step.index} 를 비친 값이 장면에 없다`);
        cap1.textContent = t('caption.project', 'Distance {d} → screen x {x} · y {yBottom} to {yTop} · height {height}', {
          d: plain(shot.d),
          x: fix3(shot.x),
          yBottom: fix3(shot.yBottom),
          yTop: fix3(shot.yTop),
          height: fix3(shot.height),
        });
        cap2.textContent =
          shot.ratio === null
            ? t('caption.product', 'Height × distance: {product}', { product: fix3(shot.product) })
            : t('caption.productRatio', 'Height × distance: {product} · previous height ÷ this height: {ratio}', {
                product: fix3(shot.product),
                ratio: fix3(shot.ratio),
              });
      }

      // 판 제목
      put(
        svg,
        'text',
        { x: PAD, y: 74, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm },
        t('label.side', 'Side view'),
      );
      put(
        svg,
        'text',
        {
          x: f.screenCx,
          y: 74,
          'text-anchor': 'middle',
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        },
        t('label.front', 'What the eye sees'),
      );

      // 옆모습 — 시선
      put(svg, 'line', {
        x1: f.eyeX,
        y1: f.y0,
        x2: f.sideRight,
        y2: f.y0,
        stroke: colors.border,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });

      // 옆모습 — 화면 선
      put(svg, 'line', {
        x1: f.planeX,
        y1: sy(scene.focal),
        x2: f.planeX,
        y2: sy(-scene.focal),
        stroke: colors.textMuted,
        'stroke-width': 2,
      });
      put(
        svg,
        'text',
        {
          x: f.planeX,
          y: sy(scene.focal) - 6,
          'text-anchor': 'middle',
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        },
        t('label.screen', 'Screen'),
      );

      // 오른쪽 — 화면 틀 · 눈높이 · 소실점
      put(svg, 'rect', {
        x: f.screenCx - f.screenHalf,
        y: f.y0 - f.screenHalf,
        width: 2 * f.screenHalf,
        height: 2 * f.screenHalf,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      });
      put(svg, 'line', {
        x1: f.screenCx - f.screenHalf,
        y1: f.y0,
        x2: f.screenCx + f.screenHalf,
        y2: f.y0,
        stroke: colors.border,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });
      put(svg, 'path', {
        d: `M ${f.screenCx - 5} ${f.y0 - 5} L ${f.screenCx + 5} ${f.y0 + 5} M ${f.screenCx - 5} ${f.y0 + 5} L ${f.screenCx + 5} ${f.y0 - 5}`,
        stroke: colors.text,
        'stroke-width': 1.5,
        fill: 'none',
      });
      put(
        svg,
        'text',
        {
          x: f.screenCx - 9,
          y: f.y0 - 8,
          'text-anchor': 'end',
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        },
        t('label.vanishing', 'Vanishing point'),
      );

      // 소실점으로 모이는 안내선 — 가장 먼저 비춘(가장 큰) 상의 꼭대기와 밑에서
      const guides: SVGLineElement[] = [];
      const nearest: ShrinkProjection | undefined = scene.projected[0];
      if (nearest) {
        for (const y of [nearest.yTop, nearest.yBottom]) {
          guides.push(
            put(svg, 'line', {
              x1: f.screenCx,
              y1: f.y0,
              x2: screenX(nearest.x),
              y2: sy(y),
              stroke: colors.textMuted,
              'stroke-width': 1,
              'stroke-dasharray': '3 3',
            }),
          );
        }
      }

      // 옆모습 — 기둥과 거리 글자
      scene.posts.forEach((post, index) => {
        const d = depthOf(post.z);
        const x = postX(d);
        const lit = scene.projected.some((p) => p.index === index);
        put(svg, 'line', {
          x1: x,
          y1: sy(post.yTop),
          x2: x,
          y2: sy(post.yBottom),
          stroke: hueOf(index),
          'stroke-width': POST_W,
        });
        put(
          svg,
          'text',
          {
            x,
            y: f.footY,
            'text-anchor': 'middle',
            fill: lit ? colors.text : colors.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'font-weight': index === currentIndex ? 700 : 400,
          },
          t('label.distance', 'd {d}', { d: plain(d) }),
        );
      });

      // 빛줄기 · 화면 선 위의 상 · 오른쪽 화면의 상 (비춘 차례대로 — 작은 것이 위에 온다)
      let handles: Handles | null = null;
      for (const shot of scene.projected) {
        const post = scene.posts[shot.index];
        if (!post) throw new Error(`perspective-shrinks-far-stage: 기둥 ${shot.index} 가 바탕에 없다`);
        const hue = hueOf(shot.index);
        const isNow = shot.index === currentIndex;
        const px = postX(shot.d);
        const rays = [post.yTop, post.yBottom].map((y) =>
          put(svg, 'line', {
            x1: px,
            y1: sy(y),
            x2: f.eyeX,
            y2: f.y0,
            stroke: hue,
            'stroke-width': isNow ? 1.5 : 1,
            'stroke-opacity': isNow ? 1 : 0.5,
          }),
        );
        const planeSeg = put(svg, 'line', {
          x1: f.planeX,
          y1: sy(shot.yTop),
          x2: f.planeX,
          y2: sy(shot.yBottom),
          stroke: hue,
          'stroke-width': POST_W,
        });
        const screenSeg = put(svg, 'line', {
          x1: screenX(shot.x),
          y1: sy(shot.yTop),
          x2: screenX(shot.x),
          y2: sy(shot.yBottom),
          stroke: hue,
          'stroke-width': POST_W,
        });
        if (isNow) {
          handles = {
            rays,
            rayFrom: [post.yTop, post.yBottom].map((y) => ({ x: px, y: sy(y) })),
            eye: { x: f.eyeX, y: f.y0 },
            fromX: f.planeX,
            toX: screenX(shot.x),
            planeSeg,
            screenSeg,
            guides,
          };
        }
      }

      // 눈
      put(svg, 'circle', {
        cx: f.eyeX,
        cy: f.y0,
        r: 6,
        fill: colors.bg,
        stroke: colors.text,
        'stroke-width': 1.5,
      });
      put(svg, 'circle', { cx: f.eyeX, cy: f.y0, r: 2.5, fill: colors.text });
      put(
        svg,
        'text',
        {
          x: f.eyeX,
          y: f.y0 + 22,
          'text-anchor': 'middle',
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        },
        t('label.eye', 'Eye'),
      );

      return handles;
    }

    /** 한 시계로 흘린다 — 세대가 바뀌거나 거두면 곧바로 풀린다 */
    function tween(mine: number, ms: number, onFrame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let elapsed = 0;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          elapsed += FRAME_MS;
          const u = Math.min(1, elapsed / ms);
          onFrame(ease(u));
          if (u >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        onFrame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function render(
      next: PerspectiveShrinksFarScene,
      prev: PerspectiveShrinksFarScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const handles = drawStatic(next);
      const flows =
        opts.animate &&
        next.step.kind === 'project' &&
        prev !== null &&
        prev.projected.length + 1 === next.projected.length;
      if (!flows) return;
      if (!handles) throw new Error('perspective-shrinks-far-stage: 이번 걸음의 기둥 손잡이가 없다');

      // 정적 그리기가 끝 자리에 세워 둔 것을 아직 못 온 만큼으로 되돌린다
      const firstShot = next.projected.length === 1;
      const { rayFrom, eye, fromX, toX } = handles;
      handles.planeSeg.setAttribute('visibility', 'hidden');
      handles.screenSeg.setAttribute('visibility', 'hidden');
      if (firstShot) for (const g of handles.guides) g.setAttribute('visibility', 'hidden');

      // 1. 꼭대기와 밑에서 눈으로 빛줄기가 뻗는다
      await tween(mine, RAY_MS, (u) => {
        handles.rays.forEach((ray, i) => {
          const s = rayFrom[i];
          if (!s) throw new Error('perspective-shrinks-far-stage: 빛줄기가 떠나는 자리가 없다');
          ray.setAttribute('x2', String(lerp(s.x, eye.x, u)));
          ray.setAttribute('y2', String(lerp(s.y, eye.y, u)));
        });
      });
      if (mine !== gen || destroyed) return;

      // 2. 화면 선 위에 맺힌 상이 오른쪽 화면의 제 자리로 미끄러져 간다
      handles.planeSeg.removeAttribute('visibility');
      handles.screenSeg.removeAttribute('visibility');
      await tween(mine, SLIDE_MS, (u) => {
        const x = String(lerp(fromX, toX, u));
        handles.screenSeg.setAttribute('x1', x);
        handles.screenSeg.setAttribute('x2', x);
      });
      if (mine !== gen || destroyed) return;
      drawStatic(next);
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
