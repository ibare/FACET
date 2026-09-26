/**
 * yield-to-render 의 stage.
 *
 * 움직이는 것 둘 — ① 태스크 하나가 실행되며 DOM 행 수 막대가 늘어나고, 그 조각의
 * 자리가 시간축 위에 칠해진다 ② 렌더가 끼어들며 화면 행 수 막대가 DOM 을 따라잡고,
 * 그 순간이 축 위에 점으로 남는다. 코드 다섯 줄은 지금 도는 줄을 강조해 둘의
 * 인과를 잇는다.
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { YieldToRenderScene } from './scene.js';

const H = 300;
const MARGIN = 30;
const X0 = MARGIN;
const X1 = PIECE_CANVAS_W - MARGIN;
const PLOT_W = X1 - X0;

const CODE_X = MARGIN;
const CODE_Y0 = 34;
const CODE_LINE_H = 16;

const TICK_LABEL_Y = 122;
const TASK_TRACK_TOP = 132;
const TASK_TRACK_H = 20;
const AXIS_Y = 160;
const TICK_BOTTOM = 168;

const DOM_LABEL_Y = 192;
const DOM_BAR_Y = 198;
const BAR_H = 16;

const SCREEN_LABEL_Y = 234;
const SCREEN_BAR_Y = 240;

const CAPTION_Y = H - 20;

const MARKER_R = 5;
const ANIM_MS = 450;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number> = {},
): SVGTextElement {
  const node = el('text', { x, y, ...attrs });
  node.textContent = content;
  return node;
}

function barLen(rows: number, totalRows: number): number {
  return (rows / totalRows) * PLOT_W;
}

function xForT(ms: number, totalMs: number): number {
  const clamped = Math.max(0, Math.min(totalMs, ms));
  return X0 + (clamped / totalMs) * PLOT_W;
}

/** 이번 걸음에서 강조할 코드 줄. 실행 중인 몸통(1·2)과, 첫 호출이면 마지막 줄(4). */
function activeLines(scene: YieldToRenderScene): ReadonlySet<number> {
  if (scene.step.kind !== 'run') return new Set();
  const lines = new Set([1, 2]);
  if (scene.step.from === 0) lines.add(4);
  return lines;
}

function drawStatic(canvas: SVGSVGElement, scene: YieldToRenderScene, colors: Palette, t: Translate): void {
  canvas.textContent = '';
  const active = activeLines(scene);

  // ── 코드 다섯 줄
  scene.code.forEach((line, i) => {
    const y = CODE_Y0 + i * CODE_LINE_H;
    if (active.has(i)) {
      canvas.appendChild(
        el('rect', { x: CODE_X - 10, y: y - 11, width: 3, height: 14, fill: colors.accent }),
      );
    }
    canvas.appendChild(
      text(CODE_X, y, line, {
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: active.has(i) ? colors.text : colors.textMuted,
      }),
    );
  });

  // ── 시간축과 프레임 경계 눈금
  canvas.appendChild(
    el('line', { x1: X0, y1: AXIS_Y, x2: X1, y2: AXIS_Y, stroke: colors.border, 'stroke-width': 1 }),
  );
  scene.boundaries.forEach((b, i) => {
    const x = xForT(b, scene.totalMs);
    const passed = i < scene.passedCount;
    const line = el('line', {
      x1: x,
      y1: TICK_LABEL_Y + 4,
      x2: x,
      y2: TICK_BOTTOM,
      stroke: passed ? colors.accent : colors.border,
      'stroke-width': passed ? 2 : 1,
    });
    if (!passed) line.setAttribute('stroke-dasharray', '2 3');
    canvas.appendChild(line);
    canvas.appendChild(
      text(x, TICK_LABEL_Y, t('label.boundaryMark', '{n} ms', { n: b.toFixed(1) }), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: passed ? colors.text : colors.textMuted,
      }),
    );
  });

  // ── 실행된 조각들 (태스크 track)
  scene.runs.forEach((run, i) => {
    const start = run.t - scene.workMs;
    const x = xForT(start, scene.totalMs);
    const w = xForT(run.t, scene.totalMs) - x;
    canvas.appendChild(
      el('rect', {
        id: `task-${i}`,
        x,
        y: TASK_TRACK_TOP,
        width: w,
        height: TASK_TRACK_H,
        fill: colors.primary,
        stroke: colors.border,
      }),
    );
    canvas.appendChild(
      text(x + w / 2, TASK_TRACK_TOP + TASK_TRACK_H / 2 + 4, `chunk(${run.from})`, {
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: colors.textInverse,
      }),
    );
  });

  // ── 태스크 줄에 선 다음 조각 (아직 실행되지 않음)
  if (scene.pending) {
    const startMs = scene.t;
    const endMs = scene.t + scene.workMs;
    const x = xForT(startMs, scene.totalMs);
    const w = xForT(endMs, scene.totalMs) - x;
    canvas.appendChild(
      el('rect', {
        x,
        y: TASK_TRACK_TOP,
        width: w,
        height: TASK_TRACK_H,
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-dasharray': '3 3',
      }),
    );
    canvas.appendChild(
      text(x + w / 2, TASK_TRACK_TOP + TASK_TRACK_H / 2 + 4, `chunk(${scene.pending.from})`, {
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: colors.textMuted,
      }),
    );
  }

  // ── 렌더 이력 (끼어든 자리)
  scene.renders.forEach((r, i) => {
    canvas.appendChild(
      el('circle', {
        id: `render-${i}`,
        cx: xForT(r.t, scene.totalMs),
        cy: AXIS_Y,
        r: MARKER_R,
        fill: colors.accent,
        stroke: colors.bg,
        'stroke-width': 2,
      }),
    );
  });

  // ── DOM 행 수
  canvas.appendChild(
    text(X0, DOM_LABEL_Y, t('label.dom', 'DOM rows: {n}', { n: scene.domRows }), {
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    }),
  );
  canvas.appendChild(el('rect', { x: X0, y: DOM_BAR_Y, width: PLOT_W, height: BAR_H, fill: 'none', stroke: colors.border }));
  canvas.appendChild(
    el('rect', {
      id: 'dom-bar',
      x: X0,
      y: DOM_BAR_Y,
      width: barLen(scene.domRows, scene.totalRows),
      height: BAR_H,
      fill: colors.primary,
    }),
  );

  // ── 화면 행 수
  canvas.appendChild(
    text(X0, SCREEN_LABEL_Y, t('label.screen', 'Screen rows: {n}', { n: scene.screenRows }), {
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    }),
  );
  canvas.appendChild(
    el('rect', { x: X0, y: SCREEN_BAR_Y, width: PLOT_W, height: BAR_H, fill: 'none', stroke: colors.border }),
  );
  canvas.appendChild(
    el('rect', {
      id: 'screen-bar',
      x: X0,
      y: SCREEN_BAR_Y,
      width: barLen(scene.screenRows, scene.totalRows),
      height: BAR_H,
      fill: colors.accent,
    }),
  );

  // ── 캡션
  const caption =
    scene.step.kind === 'start'
      ? t('caption.start', 'Script starts at t=0. DOM rows: {dom}. Screen rows: {screen}.', {
          dom: scene.domRows,
          screen: scene.screenRows,
        })
      : scene.step.kind === 'run'
        ? t('caption.run', 'Runs {name}. DOM rows: {n}.', { name: scene.step.name, n: scene.step.domRows })
        : t('caption.render', 'Render cuts in. Screen rows: {n}.', { n: scene.step.screenRows });
  canvas.appendChild(
    text(X0, CAPTION_Y, caption, { 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text }),
  );
}

function mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
  const { canvas } = params;
  const t = params.t ?? makeTranslator(params.locale);
  const colors = getColors(params.theme);

  let destroyed = false;
  let gen = 0;
  const frames = new Set<number>();
  const waiters = new Set<() => void>();

  function tween(getEl: () => Element | null, attr: string, from: number, to: number, mine: number): Promise<void> {
    return new Promise((resolve) => {
      if (destroyed || mine !== gen) {
        resolve();
        return;
      }
      const target = getEl();
      if (!target) {
        resolve();
        return;
      }
      const startedAt = performance.now();
      let done = false;
      let frameId = 0;
      const wake = (): void => finish();
      function finish(): void {
        if (done) return;
        done = true;
        waiters.delete(wake);
        frames.delete(frameId);
        resolve();
      }
      waiters.add(wake);
      const step = (now: number): void => {
        if (destroyed || mine !== gen) {
          finish();
          return;
        }
        const p = Math.min(1, (now - startedAt) / ANIM_MS);
        // p===1 은 `to` 를 그대로 쓴다 — 보간식으로 되짚으면 부동소수 끝자리가
        // 곧바로 세운 화면과 한 글자 어긋날 수 있다 (자체 검증 축 1).
        target.setAttribute(attr, String(p >= 1 ? to : from + (to - from) * p));
        if (p >= 1) {
          finish();
          return;
        }
        frameId = requestAnimationFrame(step);
        frames.add(frameId);
      };
      frameId = requestAnimationFrame(step);
      frames.add(frameId);
    });
  }

  async function render(
    next: YieldToRenderScene,
    prev: YieldToRenderScene | null,
    opts: { animate: boolean },
  ): Promise<void> {
    const mine = (gen += 1);
    drawStatic(canvas, next, colors, t);
    if (!opts.animate || prev === null || destroyed) return;

    const jobs: Promise<void>[] = [];
    if (next.step.kind === 'run') {
      const fromLen = barLen(prev.domRows, next.totalRows);
      const toLen = barLen(next.domRows, next.totalRows);
      jobs.push(tween(() => canvas.querySelector('#dom-bar'), 'width', fromLen, toLen, mine));
      const idx = next.runs.length - 1;
      const start = next.runs[idx]!.t - next.workMs;
      const end = next.runs[idx]!.t;
      const fullW = xForT(end, next.totalMs) - xForT(start, next.totalMs);
      jobs.push(tween(() => canvas.querySelector(`#task-${idx}`), 'width', 0, fullW, mine));
    } else if (next.step.kind === 'render') {
      const fromLen = barLen(prev.screenRows, next.totalRows);
      const toLen = barLen(next.screenRows, next.totalRows);
      jobs.push(tween(() => canvas.querySelector('#screen-bar'), 'width', fromLen, toLen, mine));
      const idx = next.renders.length - 1;
      jobs.push(tween(() => canvas.querySelector(`#render-${idx}`), 'r', 0, MARKER_R, mine));
    }
    await Promise.all(jobs);
  }

  function destroy(): void {
    destroyed = true;
    gen += 1;
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
    for (const wake of [...waiters]) wake();
    waiters.clear();
    canvas.textContent = '';
  }

  void container;
  return { render, destroy };
}

export const yieldToRenderStageView: CanvasView = {
  canvas: { height: H },
  mount,
};
