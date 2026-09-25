/**
 * beladyAnomaly 의 무대 — 같은 참조가 두 쪽 프레임에 같은 걸음에 떨어지고,
 * 쪽마다 폴트 수가 경주 선 위의 말로 한 칸씩 나아간다. 두 말을 잇는 줄이
 * 뒤로 기울었다가 곧게 섰다가 앞으로 기우는 것이 "앞지른다" 이다.
 *
 * 화면은 늘 장면 전체에서 새로 세운다. 운동은 진행값 p (0→1) 로 같은 그리기를
 * 여러 번 부르는 것이고, p = 1 이 정적 그리기다.
 */
import {
  categorical,
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
import type { BeladyScene, SideState } from './scene.js';

const H = 330;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const M = 16;
/** 왼쪽 이름 칸의 폭 */
const LABEL_COL = 84;
const REF_TOP = 16;
const CELL_MAX = 34;
const MARK_GAP = 14;
const BLOCK_TOPS = [118, 204] as const;
const FRAME_MAX = 36;
const FRAME_GAP = 8;
const RUNNER_R = 13;
const MOTION_MS = 420;
/** 페이지가 떨어지는 몫 — 진행값 0 에서 여기까지 */
const DROP_END = 0.6;
/** 말이 나아가기 시작하는 진행값 */
const RUN_START = 0.4;

type Geometry = {
  refPitch: number;
  refCell: number;
  refX0: number;
  frameSize: number;
  trackX0: number;
  unit: number;
};

function geometry(scene: BeladyScene): Geometry {
  const n = scene.refs.length;
  const refX0 = M + LABEL_COL;
  const refPitch = (W - M - refX0) / n;
  const refCell = Math.min(CELL_MAX, refPitch - 6);
  const maxFrames = Math.max(...scene.sides.map((s) => s.size));
  const frameSize = Math.min(FRAME_MAX, (W * 0.34 - M - FRAME_GAP * (maxFrames - 1)) / maxFrames);
  const trackX0 = M + maxFrames * (frameSize + FRAME_GAP) + 24 + RUNNER_R;
  const trackX1 = W - M - RUNNER_R;
  return { refPitch, refCell, refX0, frameSize, trackX0, unit: (trackX1 - trackX0) / n };
}

function r2(v: number): string {
  const x = Math.round(v * 100) / 100;
  return String(Object.is(x, -0) ? 0 : x);
}

function ease(p: number): number {
  const c = Math.max(0, Math.min(1, p));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function el(tag: string, attrs: Record<string, string>, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  opts: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
): void {
  const node = el(
    'text',
    {
      x: r2(x),
      y: r2(y),
      'font-family': opts.mono === true ? fonts.mono : fonts.body,
      'font-size': opts.size,
      fill: opts.fill,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'middle',
    },
    parent,
  );
  if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
  node.textContent = content;
}

/** 페이지 한 칸 (네모 + 번호). 가운데가 (cx, cy). */
function pageBox(
  parent: Element,
  cx: number,
  cy: number,
  size: number,
  page: number,
  c: Palette,
  stroke: string,
  strokeWidth: number,
): SVGElement {
  const g = el('g', {}, parent);
  el(
    'rect',
    {
      x: r2(cx - size / 2),
      y: r2(cy - size / 2),
      width: r2(size),
      height: r2(size),
      rx: '4',
      fill: c.bgSubtle,
      stroke,
      'stroke-width': String(strokeWidth),
    },
    g,
  );
  label(g, cx, cy + 1, String(page), { size: fontSizes.md, fill: c.text, anchor: 'middle', mono: true });
  return g;
}

function sideSign(side: SideState): string {
  return String(side.size);
}

type Caption = { first: string; second: string };

function caption(scene: BeladyScene, t: Translate): Caption {
  const [sa, sb] = scene.sides;
  if (sa === undefined || sb === undefined) return { first: '', second: '' };
  const a = sideSign(sa);
  const b = sideSign(sb);
  const step = scene.step;
  if (step === null) {
    return {
      first: t('caption.start', 'Same references go to both sides. Both start empty.'),
      second: '',
    };
  }
  const [oa, ob] = step.sides;
  if (oa === undefined || ob === undefined) return { first: '', second: '' };
  const page = String(step.page);
  let first: string;
  if (oa.kind === 'fault' && ob.kind === 'fault') {
    first = t('caption.bothFault', 'Page {page}: fault on both sides.', { page });
  } else if (oa.kind === 'hit' && ob.kind === 'hit') {
    first = t('caption.bothHit', 'Page {page}: hit on both sides.', { page });
  } else if (oa.kind === 'hit') {
    first = t('caption.hitFault', 'Page {page}: hit on the {a}-frame side, fault on the {b}-frame side.', {
      page,
      a,
      b,
    });
  } else {
    first = t('caption.faultHit', 'Page {page}: fault on the {a}-frame side, hit on the {b}-frame side.', {
      page,
      a,
      b,
    });
  }
  const diff = sb.faults - sa.faults;
  const before = ob.from - oa.from;
  const gap = String(Math.abs(diff));
  let second: string;
  if (diff < 0) {
    second = t('caption.fewer', 'Fewer faults on the {b}-frame side. Gap: {n}.', { b, n: gap });
  } else if (diff === 0 && before < 0) {
    second = t('caption.catchUp', 'The {b}-frame side catches up. Faults on each: {n}.', {
      b,
      n: String(sb.faults),
    });
  } else if (diff === 0) {
    second = t('caption.tied', 'Faults on each: {n}.', { n: String(sb.faults) });
  } else if (before <= 0) {
    second = t('caption.overtake', 'The {b}-frame side overtakes — more faults than the {a}-frame side. Gap: {n}.', {
      a,
      b,
      n: gap,
    });
  } else {
    second = t('caption.more', 'More faults on the {b}-frame side. Gap: {n}.', { b, n: gap });
  }
  return { first, second };
}

export const beladyAnomalyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const sideColors = categorical(2, 'vivid');

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function refCenter(g: Geometry, i: number): { x: number; y: number } {
      return { x: g.refX0 + g.refPitch * (i + 0.5), y: REF_TOP + g.refCell / 2 };
    }

    function frameCenter(g: Geometry, block: number, f: number): { x: number; y: number } {
      const top = BLOCK_TOPS[block] ?? 0;
      return { x: M + f * (g.frameSize + FRAME_GAP) + g.frameSize / 2, y: top + 20 + g.frameSize / 2 };
    }

    function runnerX(g: Geometry, faults: number): number {
      return g.trackX0 + faults * g.unit;
    }

    /** 장면 하나를 진행값 p 로 그린다. p = 1 이 정적 그리기. */
    function draw(scene: BeladyScene, p: number): void {
      svg.textContent = '';
      const g = geometry(scene);
      const step = scene.step;
      const drop = ease(p / DROP_END);
      const run = ease((p - RUN_START) / (1 - RUN_START));
      const done = step === null ? 0 : step.index + 1;

      // 참조 열
      label(svg, M, REF_TOP + g.refCell / 2, t('label.refs', 'References'), {
        size: fontSizes.sm,
        fill: c.textMuted,
      });
      scene.refs.forEach((page, i) => {
        const { x, y } = refCenter(g, i);
        const current = step !== null && step.index === i;
        const box = pageBox(svg, x, y, g.refCell, page, c, current ? c.accent : c.border, current ? 2.5 : 1);
        if (i >= done) box.setAttribute('opacity', '0.55');
      });

      // 참조마다 두 쪽의 결과 — 폴트는 채운 네모, 적중은 빈 동그라미
      scene.sides.forEach((side, s) => {
        const y = REF_TOP + g.refCell + MARK_GAP * (s + 1);
        label(svg, g.refX0 - 8, y, sideSign(side), {
          size: fontSizes.xs,
          fill: c.textMuted,
          anchor: 'end',
          mono: true,
        });
        side.marks.forEach((mark, i) => {
          const { x } = refCenter(g, i);
          if (mark === 'fault') {
            el('rect', { x: r2(x - 4), y: r2(y - 4), width: '8', height: '8', fill: c.danger }, svg);
          } else {
            el('circle', { cx: r2(x), cy: r2(y), r: '4', fill: 'none', stroke: c.success, 'stroke-width': '1.5' }, svg);
          }
        });
      });

      // 두 쪽 — 프레임과 경주 선
      const runners: { x: number; y: number }[] = [];
      scene.sides.forEach((side, s) => {
        const top = BLOCK_TOPS[s] ?? 0;
        const color = sideColors[s] ?? c.primary;
        const o = step?.sides[s];
        label(svg, M, top + 6, t('label.side', '{n}-frame side', { n: sideSign(side) }), {
          size: fontSizes.sm,
          fill: c.text,
          weight: '600',
        });

        // 프레임 칸
        const full = side.frames.every((f) => f !== null);
        side.frames.forEach((page, f) => {
          const home = frameCenter(g, s, f);
          el(
            'rect',
            {
              x: r2(home.x - g.frameSize / 2),
              y: r2(home.y - g.frameSize / 2),
              width: r2(g.frameSize),
              height: r2(g.frameSize),
              rx: '5',
              fill: 'none',
              stroke: c.border,
              'stroke-width': '1',
              'stroke-dasharray': '3 3',
            },
            svg,
          );
          if (page === null) return;
          const touched = o !== undefined && o.frame === f;
          const stroke = touched ? (o.kind === 'fault' ? c.danger : c.success) : c.border;
          let at = home;
          if (touched && o.kind === 'fault' && step !== null) {
            const from = refCenter(g, step.index);
            at = { x: home.x + (from.x - home.x) * (1 - drop), y: home.y + (from.y - home.y) * (1 - drop) };
          }
          pageBox(svg, at.x, at.y, g.frameSize - 4, page, c, stroke, touched ? 2.5 : 1);
        });

        // 적중 — 참조 칸에서 윤곽만 내려와 그 자리에 닿는다
        if (o !== undefined && o.kind === 'hit' && step !== null && drop < 1) {
          const from = refCenter(g, step.index);
          const home = frameCenter(g, s, o.frame);
          const size = g.frameSize - 4;
          el(
            'rect',
            {
              x: r2(home.x + (from.x - home.x) * (1 - drop) - size / 2),
              y: r2(home.y + (from.y - home.y) * (1 - drop) - size / 2),
              width: r2(size),
              height: r2(size),
              rx: '4',
              fill: 'none',
              stroke: c.success,
              'stroke-width': '2',
            },
            svg,
          );
        }

        // 내보낸 페이지 — 프레임 밑으로 빠져나간다
        if (o !== undefined && o.victim !== null && drop < 1) {
          const home = frameCenter(g, s, o.frame);
          const out = pageBox(svg, home.x, home.y + drop * (g.frameSize + 10), g.frameSize - 4, o.victim, c, c.textMuted, 1);
          out.setAttribute('opacity', r2(1 - drop));
        }

        // 다음에 나갈 페이지 — 들어온 줄의 맨 앞
        const oldest = side.queue[0];
        if (full && oldest !== undefined) {
          const f = side.frames.indexOf(oldest);
          if (f >= 0) {
            const home = frameCenter(g, s, f);
            label(svg, home.x, home.y + g.frameSize / 2 + 10, t('label.nextOut', 'next out'), {
              size: fontSizes.xs,
              fill: c.textMuted,
              anchor: 'middle',
            });
          }
        }

        // 경주 선
        const trackY = frameCenter(g, s, 0).y;
        label(svg, runnerX(g, scene.refs.length), top + 6, t('label.faults', 'Faults'), {
          size: fontSizes.xs,
          fill: c.textMuted,
          anchor: 'end',
        });
        el(
          'line',
          {
            x1: r2(g.trackX0),
            y1: r2(trackY),
            x2: r2(runnerX(g, scene.refs.length)),
            y2: r2(trackY),
            stroke: c.border,
            'stroke-width': '2',
          },
          svg,
        );
        for (let k = 0; k <= scene.refs.length; k += 1) {
          const x = runnerX(g, k);
          el('line', { x1: r2(x), y1: r2(trackY - 4), x2: r2(x), y2: r2(trackY + 4), stroke: c.border, 'stroke-width': '1' }, svg);
        }
        const from = o !== undefined ? o.from : side.faults;
        const shown = from + (side.faults - from) * run;
        const x = runnerX(g, shown);
        if (x > g.trackX0) {
          el(
            'line',
            {
              x1: r2(g.trackX0),
              y1: r2(trackY),
              x2: r2(x),
              y2: r2(trackY),
              stroke: color,
              'stroke-width': '6',
              'stroke-linecap': 'butt',
              opacity: '0.45',
            },
            svg,
          );
        }
        runners.push({ x, y: trackY });
      });

      // 두 말을 잇는 줄 — 기울기가 앞섬과 뒤처짐이다
      const [ra, rb] = runners;
      if (ra !== undefined && rb !== undefined) {
        el(
          'line',
          {
            x1: r2(ra.x),
            y1: r2(ra.y),
            x2: r2(rb.x),
            y2: r2(rb.y),
            stroke: c.textMuted,
            'stroke-width': '1.5',
            'stroke-dasharray': '4 3',
          },
          svg,
        );
      }
      scene.sides.forEach((side, s) => {
        const r = runners[s];
        if (r === undefined) return;
        el('circle', { cx: r2(r.x), cy: r2(r.y), r: String(RUNNER_R), fill: sideColors[s] ?? c.primary }, svg);
        label(svg, r.x, r.y + 1, String(side.faults), {
          size: fontSizes.sm,
          fill: c.stateInk,
          anchor: 'middle',
          mono: true,
          weight: '700',
        });
      });

      // 캡션
      const cap = caption(scene, t);
      label(svg, W / 2, H - 38, cap.first, { size: fontSizes.md, fill: c.text, anchor: 'middle' });
      if (cap.second !== '') {
        label(svg, W / 2, H - 16, cap.second, { size: fontSizes.md, fill: c.text, anchor: 'middle', weight: '600' });
      }
    }

    function animate(next: BeladyScene, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (performance.now() - start) / MOTION_MS);
          draw(next, p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next: BeladyScene, _prev: BeladyScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step === null) {
          draw(next, 1);
          return;
        }
        await animate(next, mine);
        if (destroyed || mine !== gen) return;
        draw(next, 1);
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
