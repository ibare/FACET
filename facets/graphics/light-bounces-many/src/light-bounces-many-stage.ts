/**
 * light-bounces-many 무대.
 *
 * 위: 방 안의 한 경로. 토막마다 굵기가 지나온 몫에 비례해 튈수록 가늘어진다.
 * 가운데: 이번 꼭짓점의 직접광 막대 — 지나온 몫이 곱해져 더하는 몫으로 줄어든다.
 * 아래: 픽셀 밝기 0..1 막대 — 더하는 몫이 내려와 끝에 붙어 합이 모인다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SurfaceId, Vec2, Vertex } from './algorithm.js';
import type { LightBouncesManyScene } from './scene.js';

const NS = 'http://www.w3.org/2000/svg';
const H = 450;
const PAD = 20;
/** 방 좌우에 벽 이름을 둘 자리 */
const SIDE = 90;
const ROOM_TOP = 34;
const ROOM_MAX_H = 220;
const ROW_TITLE_Y = 294;
const ROW_Y = 302;
const ROW_H = 16;
const SUM_TITLE_Y = 342;
const SUM_Y = 350;
const SUM_H = 20;
const CAPTION_Y = 436;
/** 지나온 몫 1 일 때 경로 토막의 굵기 상한 */
const PATH_W_MAX = 6;
const GROW_MS = 420;
const SHRINK_MS = 420;
const DROP_MS = 460;

type Handles = {
  segment: SVGLineElement;
  /** 광선이 닿은 뒤 드러나는 것 — 빛 선 · 꼭짓점 · 직접광 막대 */
  reveal: SVGElement[];
  /** 몫이 내려와 붙은 뒤 드러나는 것 — 합 막대의 새 토막 · 그 글자 */
  arrive: SVGElement[];
  sumLabel: SVGTextElement;
};

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

function r2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function f3(x: number): string {
  const v = Math.round(x * 1000) / 1000;
  return (Object.is(v, -0) ? 0 : v).toFixed(3);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const lightBouncesManyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const BAR_W = W - 2 * PAD;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function surfaceName(id: SurfaceId): string {
      switch (id) {
        case 'floor':
          return t('label.floor', 'Floor');
        case 'ceiling':
          return t('label.ceiling', 'Ceiling');
        case 'left':
          return t('label.left', 'Left wall');
        case 'right':
          return t('label.right', 'Right wall');
      }
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    }

    function valueX(v: number, path: string): number {
      if (!(v >= 0 && v <= 1)) throw new Error(`light-bounces-many 무대: ${path} 가 0..1 밖이다 (${v})`);
      return PAD + v * BAR_W;
    }

    /** 그 장면의 화면 전체를 세운다. 이번 걸음의 손잡이를 돌려준다. */
    function drawStatic(scene: LightBouncesManyScene): Handles | null {
      svg.textContent = '';
      const { base } = scene;
      const sc = Math.min((W - 2 * SIDE) / base.room.width, ROOM_MAX_H / base.room.height);
      const rx0 = (W - base.room.width * sc) / 2;
      const X = (x: number): number => r2(rx0 + x * sc);
      const Y = (y: number): number => r2(ROOM_TOP + (base.room.height - y) * sc);
      const current = scene.step
        ? scene.vertices.find((v) => v.k === scene.step?.k)
        : undefined;
      if (scene.step && !current) throw new Error(`light-bounces-many 무대: 꼭짓점 ${scene.step.k} 가 자취에 없다`);

      // 방
      const room = el('g', {}, svg);
      el(
        'rect',
        { x: X(0), y: Y(base.room.height), width: r2(base.room.width * sc), height: r2(base.room.height * sc), fill: colors.bgSubtle },
        room,
      );
      const wallEnds: Record<SurfaceId, [Vec2, Vec2]> = {
        floor: [[0, 0], [base.room.width, 0]],
        ceiling: [[0, base.room.height], [base.room.width, base.room.height]],
        left: [[0, 0], [0, base.room.height]],
        right: [[base.room.width, 0], [base.room.width, base.room.height]],
      };
      const reveal: SVGElement[] = [];
      const arrive: SVGElement[] = [];
      for (const s of base.surfaces) {
        const [a, b] = wallEnds[s.id];
        const hit = current?.surface === s.id;
        const wall = el(
          'line',
          {
            x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]),
            stroke: colors.text, 'stroke-width': 2.5, 'stroke-linecap': 'square',
          },
          room,
        );
        if (hit) {
          const glow = el(
            'line',
            {
              x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]),
              stroke: colors.accent, 'stroke-width': 6, 'stroke-opacity': 0.8,
            },
            room,
          );
          room.insertBefore(glow, wall);
          reveal.push(glow);
        }
      }
      const midX = X(base.room.width / 2);
      const midY = Y(base.room.height / 2);
      text(room, midX, Y(0) + 17, surfaceName('floor'), { anchor: 'middle', fill: colors.textMuted });
      text(room, midX, Y(base.room.height) - 9, surfaceName('ceiling'), { anchor: 'middle', fill: colors.textMuted });
      text(room, X(0) - 10, midY + 4, surfaceName('left'), { anchor: 'end', fill: colors.textMuted });
      text(room, X(base.room.width) + 10, midY + 4, surfaceName('right'), { anchor: 'start', fill: colors.textMuted });

      // 빛에서 꼭짓점으로 곧장 오는 선
      const lx = X(base.light.at[0]);
      const ly = Y(base.light.at[1]);
      for (const v of scene.vertices) {
        const isNow = v === current;
        const line = el(
          'line',
          {
            x1: lx, y1: ly, x2: X(v.point[0]), y2: Y(v.point[1]),
            stroke: isNow ? colors.accent : colors.ghostOutline,
            'stroke-width': isNow ? 2 : 1,
            'stroke-dasharray': '4 4',
          },
          room,
        );
        if (isNow) reveal.push(line);
      }

      // 첫 방향 — 꼭짓점이 없을 때만
      if (scene.dir && scene.vertices.length === 0) {
        const ex = X(base.eye[0]);
        const ey = Y(base.eye[1]);
        const len = 0.5 * sc;
        const tx = r2(ex + scene.dir[0] * len);
        const ty = r2(ey - scene.dir[1] * len);
        el('line', { x1: ex, y1: ey, x2: tx, y2: ty, stroke: colors.text, 'stroke-width': 2 }, room);
        const ux = scene.dir[0];
        const uy = -scene.dir[1];
        const head = 8;
        const p1 = `${r2(tx + ux * 2)},${r2(ty + uy * 2)}`;
        const p2 = `${r2(tx - ux * head - uy * head * 0.5)},${r2(ty - uy * head + ux * head * 0.5)}`;
        const p3 = `${r2(tx - ux * head + uy * head * 0.5)},${r2(ty - uy * head - ux * head * 0.5)}`;
        el('polygon', { points: `${p1} ${p2} ${p3}`, fill: colors.text }, room);
      }

      // 경로 토막 — 굵기가 지나온 몫
      let segment: SVGLineElement | null = null;
      for (const v of scene.vertices) {
        const line = el(
          'line',
          {
            x1: X(v.from[0]), y1: Y(v.from[1]), x2: X(v.point[0]), y2: Y(v.point[1]),
            stroke: colors.text,
            'stroke-width': r2(Math.max(0.8, PATH_W_MAX * v.through)),
            'stroke-linecap': 'round',
          },
          room,
        );
        if (v === current) segment = line;
      }

      // 빛 · 눈
      el('circle', { cx: lx, cy: ly, r: 8, fill: colors.accent, stroke: colors.text, 'stroke-width': 1.5 }, room);
      text(room, lx + 12, ly - 8, t('label.light', 'Light'), { fill: colors.text });
      const ex = X(base.eye[0]);
      const ey = Y(base.eye[1]);
      el('circle', { cx: ex, cy: ey, r: 5, fill: colors.text }, room);
      text(room, ex, ey - 11, t('label.eye', 'Eye'), { anchor: 'middle', fill: colors.text });

      // 꼭짓점
      for (const v of scene.vertices) {
        const isNow = v === current;
        const normal = base.surfaces.find((s) => s.id === v.surface)?.normal;
        if (!normal) throw new Error(`light-bounces-many 무대: 면 ${v.surface} 가 바탕에 없다`);
        const cx = X(v.point[0]);
        const cy = Y(v.point[1]);
        const dotNode = el(
          'circle',
          {
            cx, cy, r: isNow ? 5.5 : 4,
            fill: isNow ? colors.accent : colors.bg,
            stroke: colors.text, 'stroke-width': 1.5,
          },
          room,
        );
        const num = text(room, cx + normal[0] * 15, cy - normal[1] * 15 + 4, String(v.k), {
          anchor: 'middle',
          size: fontSizes.xs,
          mono: true,
          fill: isNow ? colors.text : colors.textMuted,
          weight: isNow ? '700' : '400',
        });
        if (isNow) reveal.push(dotNode, num);
      }

      // 이번 꼭짓점 막대 — 직접광의 자리
      text(svg, PAD, ROW_TITLE_Y, t('label.row', 'This vertex'), { size: fontSizes.xs, fill: colors.textMuted });
      if (current) {
        const ghostW = r2(valueX(current.direct, 'direct') - PAD);
        const ghost = el(
          'rect',
          {
            x: PAD, y: ROW_Y, width: ghostW, height: ROW_H,
            fill: 'none', stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 3',
          },
          svg,
        );
        const rowLabel = text(
          svg,
          PAD + ghostW + 8,
          ROW_Y + ROW_H - 4,
          t('label.direct', 'Direct {direct} × carried {through}', {
            direct: f3(current.direct),
            through: f3(current.through),
          }),
          { size: fontSizes.xs, mono: true, fill: colors.text },
        );
        reveal.push(ghost, rowLabel);
      }

      // 픽셀 밝기 막대 0..1
      // 합 글자가 막대 끝을 따라 왼쪽에서 오므로 막대 이름은 오른쪽 끝에 둔다
      text(svg, W - PAD, SUM_TITLE_Y, t('label.pixel', 'Pixel brightness'), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'end' });
      el('rect', { x: PAD, y: SUM_Y, width: BAR_W, height: SUM_H, fill: 'none', stroke: colors.border, 'stroke-width': 1 }, svg);
      for (const edge of [0, 1]) {
        const x = valueX(edge, 'axis');
        el('line', { x1: x, y1: SUM_Y - 4, x2: x, y2: SUM_Y + SUM_H + 4, stroke: colors.textMuted, 'stroke-width': 1 }, svg);
      }
      text(svg, W - PAD, SUM_Y + SUM_H + 16, '1', { size: fontSizes.xs, mono: true, anchor: 'middle', fill: colors.textMuted });
      text(svg, PAD, SUM_Y + SUM_H + 16, '0', { size: fontSizes.xs, mono: true, anchor: 'middle', fill: colors.textMuted });
      for (const v of scene.vertices) {
        const isNow = v === current;
        const x0 = r2(valueX(v.before, 'before'));
        const x1 = r2(valueX(v.total, 'total'));
        const piece = el(
          'rect',
          {
            x: x0, y: SUM_Y, width: r2(x1 - x0), height: SUM_H,
            fill: isNow ? colors.accent : colors.primary,
            stroke: isNow ? colors.text : colors.bg, 'stroke-width': 1,
          },
          svg,
        );
        // 몫 글자 — 0 · 1 눈금 글자 아래 줄에
        const lab = text(svg, (x0 + x1) / 2, SUM_Y + SUM_H + 30, f3(v.add), {
          size: fontSizes.xs,
          mono: true,
          anchor: 'middle',
          fill: isNow ? colors.text : colors.textMuted,
          weight: isNow ? '700' : '400',
        });
        if (isNow) arrive.push(piece, lab);
      }
      let sumLabel: SVGTextElement | null = null;
      const sumNow = current ? current.total : scene.start?.total;
      if (sumNow !== undefined) {
        sumLabel = text(
          svg,
          valueX(sumNow, 'sum') + 8,
          SUM_TITLE_Y,
          t('label.sum', 'Sum: {sum}', { sum: f3(sumNow) }),
          { size: fontSizes.sm, mono: true, fill: colors.text, weight: '700' },
        );
      }

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (!current) {
        caption = t('caption.start', 'One ray leaves the eye into the room.');
      } else if (current.last) {
        caption = t('caption.last', 'Vertex {k} · {surface} · adds {add} · the path stops here', {
          k: current.k,
          surface: surfaceName(current.surface),
          add: f3(current.add),
        });
      } else {
        caption = t('caption.vertex', 'Vertex {k} · {surface} · adds {add}', {
          k: current.k,
          surface: surfaceName(current.surface),
          add: f3(current.add),
        });
      }
      text(svg, W / 2, CAPTION_Y, caption, { anchor: 'middle', size: fontSizes.md, fill: colors.text });

      if (!current) return null;
      if (!segment || !sumLabel) throw new Error('light-bounces-many 무대: 이번 꼭짓점의 손잡이를 세우지 못했다');
      return { segment, reveal, arrive, sumLabel };
    }

    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        const start = performance.now();
        let timer: ReturnType<typeof setTimeout> | null = null;
        const wake = (): void => {
          waiters.delete(wake);
          if (timer !== null) timers.delete(timer);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (timer !== null) timers.delete(timer);
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          draw(ease(p));
          if (p >= 1) {
            wake();
            return;
          }
          timer = setTimeout(tick, 16);
          timers.add(timer);
        };
        tick();
      });
    }

    async function animateVertex(scene: LightBouncesManyScene, v: Vertex, handles: Handles, mine: number): Promise<void> {
      const { base } = scene;
      const sc = Math.min((W - 2 * SIDE) / base.room.width, ROOM_MAX_H / base.room.height);
      const rx0 = (W - base.room.width * sc) / 2;
      const X = (x: number): number => rx0 + x * sc;
      const Y = (y: number): number => ROOM_TOP + (base.room.height - y) * sc;

      // 아직 오지 않은 것은 숨기고, 합 글자는 더하기 전 값으로
      for (const h of [...handles.reveal, ...handles.arrive]) h.setAttribute('visibility', 'hidden');
      handles.sumLabel.setAttribute('x', String(r2(valueX(v.before, 'before') + 8)));
      handles.sumLabel.textContent = t('label.sum', 'Sum: {sum}', { sum: f3(v.before) });
      const fx = X(v.from[0]);
      const fy = Y(v.from[1]);
      const px = X(v.point[0]);
      const py = Y(v.point[1]);
      handles.segment.setAttribute('x2', String(r2(fx)));
      handles.segment.setAttribute('y2', String(r2(fy)));

      // 1. 광선이 다음 면까지 뻗는다
      await tween(GROW_MS, mine, (p) => {
        handles.segment.setAttribute('x2', String(r2(fx + (px - fx) * p)));
        handles.segment.setAttribute('y2', String(r2(fy + (py - fy) * p)));
      });
      if (destroyed || mine !== gen) return;

      // 2. 꼭짓점이 빛을 받는다 — 직접광 막대가 지나온 몫만큼 줄어든다
      for (const h of handles.reveal) h.removeAttribute('visibility');
      const directW = valueX(v.direct, 'direct') - PAD;
      const addW = valueX(v.add, 'add') - PAD;
      const chip = el(
        'rect',
        { x: PAD, y: ROW_Y, width: r2(directW), height: ROW_H, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 },
        svg,
      );
      await tween(SHRINK_MS, mine, (p) => {
        chip.setAttribute('width', String(r2(directW + (addW - directW) * p)));
      });
      if (destroyed || mine !== gen) return;

      // 3. 더하는 몫이 픽셀 막대 끝으로 내려가 붙는다
      const toX = valueX(v.before, 'before');
      await tween(DROP_MS, mine, (p) => {
        chip.setAttribute('x', String(r2(PAD + (toX - PAD) * p)));
        chip.setAttribute('y', String(r2(ROW_Y + (SUM_Y - ROW_Y) * p)));
        chip.setAttribute('height', String(r2(ROW_H + (SUM_H - ROW_H) * p)));
      });
    }

    const renderer: SceneRenderer<LightBouncesManyScene> & ViewInstance = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || !handles || !next.step) return;
        const v = next.vertices[next.vertices.length - 1];
        if (!v || v.k !== next.step.k) throw new Error('light-bounces-many 무대: 이번 꼭짓점이 자취의 끝이 아니다');
        await animateVertex(next, v, handles, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
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

    return renderer;
  },
};
