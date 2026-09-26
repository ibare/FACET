import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
  shiftLightness,
} from '@ffacet/core/runtime';
import type { WhatFirstPaintNeedsScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 자리 (이 조각의 자료 모양 — 머리 넷 — 에 맞춘 고정 값. S-piece: 세로는 마운트 뒤 안 바뀐다) ──
const PAD = 14;
const CAPTION_H = 36;
const GAP_S = 10;
const CODE_ROW_H = 20;
const LANE_COUNT = 4;
const CODE_BLOCK_H = CODE_ROW_H * LANE_COUNT;
const MARKER_HEADER_H = 28;
const LANE_H = 28;
const LANE_GAP = 8;
const LANES_BLOCK_H = LANE_COUNT * LANE_H + (LANE_COUNT - 1) * LANE_GAP;
const AXIS_GAP = 6;
const AXIS_H = 24;

const CANVAS_HEIGHT =
  PAD + CAPTION_H + GAP_S + CODE_BLOCK_H + GAP_S + MARKER_HEADER_H + LANES_BLOCK_H + AXIS_GAP + AXIS_H + PAD;

const LEFT_LABEL_W = 100;
const RIGHT_LABEL_W = 56;

const ANIM_MS = 480;
const BAR_H = 12;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node;
}

function textEl(
  x: number,
  y: number,
  content: string,
  attrs?: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', { x, y, ...attrs });
  node.textContent = content;
  return node;
}

function round1(n: number): number {
  // -0 과 부동소수 끝자리가 좌표 문자열을 가른다 (자주 걸린 함정)
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

export const whatFirstPaintNeedsStageView: CanvasView = {
  canvas: { height: CANVAS_HEIGHT },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const theme = params.theme ?? 'light';
    const colors: Palette = getColors(theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const laneColors = categorical(LANE_COUNT, 'vivid');

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function waitFrame(cb: (now: number) => void): void {
      const id = requestAnimationFrame((now) => {
        frames.delete(id);
        cb(now);
      });
      frames.add(id);
    }

    function laneY(i: number): number {
      return PAD + CAPTION_H + GAP_S + CODE_BLOCK_H + GAP_S + MARKER_HEADER_H + i * (LANE_H + LANE_GAP);
    }
    const lanesTopY = laneY(0);
    const axisLineY = lanesTopY + LANES_BLOCK_H + AXIS_GAP;
    const axisX0 = PAD + LEFT_LABEL_W;
    const axisX1 = 620 - PAD - RIGHT_LABEL_W; // PIECE_CANVAS_W 는 mount 가 넘긴 viewBox 폭과 같다(생략 시 기본값)

    function axisMaxMs(scene: WhatFirstPaintNeedsScene): number {
      // 실제 시각 어디에도 못 미치지 않는 안전한 상한 — 화면에 뜨는 값이 아니라 자 눈금 폭을 정하는 데만 쓴다.
      const requestSpan = scene.base.parseMs * (scene.base.lanes.length + scene.base.bodyCount);
      const durs = Object.values(scene.base.resources).map((r) => r.dur);
      const execs = Object.values(scene.base.resources)
        .map((r) => r.exec ?? 0)
        .reduce((a, b) => a + b, 0);
      const maxDur = durs.length > 0 ? Math.max(...durs) : 0;
      return Math.ceil((requestSpan + maxDur + execs) * 1.1);
    }

    function caption(scene: WhatFirstPaintNeedsScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        return t('caption.start', 'Nothing in the head has been requested yet.');
      }
      if (step.kind === 'headParsed') {
        const blocking = step.entries
          .filter((e) => e.blocking)
          .map((e) => e.src)
          .join(', ');
        return t(
          'caption.headParsed',
          'All four head resources are requested; only {blocking} blocks the first paint.',
          { blocking },
        );
      }
      if (step.kind === 'bodyParsed') {
        return t('caption.bodyParsed', 'Parsing finishes at {at} ms; the screen is still blank.', {
          at: step.at,
        });
      }
      if (step.kind === 'resourceArrived') {
        if (step.afterPaintMs === null) {
          return t('caption.resourceArrived', '{src} arrives at {at} ms.', { src: step.src, at: step.at });
        }
        return t(
          'caption.resourceArrivedAfterPaint',
          '{src} arrives at {at} ms — {afterPaintMs} ms after the first paint.',
          { src: step.src, at: step.at, afterPaintMs: step.afterPaintMs },
        );
      }
      if (step.kind === 'firstPaint') {
        return t(
          'caption.firstPaint',
          'First paint at {at} ms; {count} head resources are still unfinished.',
          { at: step.at, count: step.unfinished.length },
        );
      }
      if (step.kind === 'scriptStarted') {
        if (step.afterPaintMs === null) throw new Error('scriptStarted 인데 첫 장이 아직 없다');
        return t(
          'caption.scriptStarted',
          '{src} arrives and starts running — {afterPaintMs} ms after the first paint.',
          { src: step.src, afterPaintMs: step.afterPaintMs },
        );
      }
      // scriptFinished
      if (step.afterPaintMs === null) throw new Error('scriptFinished 인데 첫 장이 아직 없다');
      if (step.domContentLoaded) {
        return t(
          'caption.scriptFinishedDcl',
          '{src} finishes running at {at} ms, and DOMContentLoaded fires.',
          { src: step.src, at: step.at },
        );
      }
      return t('caption.scriptFinished', '{src} finishes running at {at} ms.', {
        src: step.src,
        at: step.at,
      });
    }

    function draw(scene: WhatFirstPaintNeedsScene, frac: number): void {
      svg.textContent = '';
      const frag = document.createDocumentFragment();
      const axisMax = axisMaxMs(scene);
      const timeX = (ms: number): number => axisX0 + (ms / axisMax) * (axisX1 - axisX0);

      frag.appendChild(el('rect', { x: 0, y: 0, width: 620, height: CANVAS_HEIGHT, fill: colors.bg }));

      // 문안
      frag.appendChild(
        textEl(PAD, PAD + 16, caption(scene), {
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
          'font-weight': '600',
        }),
      );

      // 문서 머리 — 실제 태그 글자 (native)
      const codeTop = PAD + CAPTION_H + GAP_S;
      scene.base.lanes.forEach((lane, i) => {
        const y = codeTop + i * CODE_ROW_H;
        frag.appendChild(
          el('rect', { x: PAD, y: y + 3, width: 4, height: CODE_ROW_H - 6, fill: laneColors[i] }),
        );
        frag.appendChild(
          textEl(PAD + 10, y + 14, lane.tag, {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          }),
        );
        const requested = scene.trace.requested[lane.src];
        if (requested) {
          const label = requested.blocking
            ? t('label.blocks', 'blocks first paint')
            : t('label.doesNotBlock', "doesn't block");
          frag.appendChild(
            textEl(620 - PAD, y + 14, label, {
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
              'text-anchor': 'end',
            }),
          );
        }
      });

      // 표식(파싱 끝 · 첫 장) 자리 — 세로선 + 위 라벨
      function markerLine(x: number, color: string, active: boolean, dashed: boolean): void {
        const bottom = active ? lanesTopY + (axisLineY - lanesTopY) * frac : axisLineY;
        const line = el('line', {
          x1: round1(x),
          y1: lanesTopY,
          x2: round1(x),
          y2: round1(bottom),
          stroke: color,
          'stroke-width': dashed ? 1.5 : 2.5,
        });
        if (dashed) line.setAttribute('stroke-dasharray', '3,3');
        frag.appendChild(line);
      }

      // 두 표식 라벨은 서로 다른 줄에 둔다 — 때가 가까우면 가로로 겹친다.
      const markerLabelTop = codeTop + CODE_BLOCK_H + GAP_S + 10;
      const markerLabelBottom = codeTop + CODE_BLOCK_H + GAP_S + 24;
      if (scene.trace.bodyParsedAt !== null) {
        const x = timeX(scene.trace.bodyParsedAt);
        markerLine(x, colors.border, scene.step.kind === 'bodyParsed', true);
        frag.appendChild(
          textEl(x, markerLabelTop, t('label.parseEnd', 'Parse end {at} ms', { at: scene.trace.bodyParsedAt }), {
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
            'text-anchor': 'middle',
          }),
        );
      }
      if (scene.trace.paint !== null) {
        const x = timeX(scene.trace.paint.at);
        markerLine(x, colors.accent, scene.step.kind === 'firstPaint', false);
        frag.appendChild(
          textEl(x, markerLabelBottom, t('label.firstPaint', 'First paint {at} ms', { at: scene.trace.paint.at }), {
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.text,
            'text-anchor': 'middle',
            'font-weight': '700',
          }),
        );
      }

      // 자 (axis)
      frag.appendChild(
        el('line', { x1: axisX0, y1: axisLineY, x2: axisX1, y2: axisLineY, stroke: colors.border, 'stroke-width': 1 }),
      );

      // 자원 넷 — 차선
      const rx = parseFloat(radii.sm);
      scene.base.lanes.forEach((lane, i) => {
        const y = laneY(i);
        const cy = y + LANE_H / 2;
        frag.appendChild(
          textEl(PAD, cy + 4, lane.src, {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }),
        );

        const requested = scene.trace.requested[lane.src];
        if (requested) {
          const tickFrac = scene.step.kind === 'headParsed' ? frac : 1;
          const tx = round1(timeX(requested.at));
          frag.appendChild(
            el('line', {
              x1: tx,
              y1: y,
              x2: tx,
              y2: round1(y + LANE_H * tickFrac),
              stroke: colors.border,
              'stroke-width': 2,
            }),
          );
        }

        const downloadEnd =
          lane.kind === 'css' ? (scene.trace.arrived[lane.src] ?? null) : (scene.trace.scriptRuns[lane.src]?.start ?? null);
        if (requested && downloadEnd !== null) {
          const isActiveDownload =
            (scene.step.kind === 'resourceArrived' && scene.step.src === lane.src) ||
            (scene.step.kind === 'scriptStarted' && scene.step.src === lane.src);
          const growFrac = isActiveDownload ? frac : 1;
          const x0 = timeX(requested.at);
          const x1 = timeX(requested.at + (downloadEnd - requested.at) * growFrac);
          frag.appendChild(
            el('rect', {
              x: round1(x0),
              y: round1(cy - BAR_H / 2),
              width: round1(Math.max(0, x1 - x0)),
              height: BAR_H,
              rx,
              fill: laneColors[i],
            }),
          );
        }

        const run = scene.trace.scriptRuns[lane.src];
        if (run && run.end !== null) {
          const isActiveExec = scene.step.kind === 'scriptFinished' && scene.step.src === lane.src;
          const growFrac = isActiveExec ? frac : 1;
          const x0 = timeX(run.start);
          const x1 = timeX(run.start + (run.end - run.start) * growFrac);
          frag.appendChild(
            el('rect', {
              x: round1(x0),
              y: round1(cy - BAR_H / 2),
              width: round1(Math.max(0, x1 - x0)),
              height: BAR_H,
              rx,
              fill: shiftLightness(laneColors[i], -0.16),
            }),
          );
        }

        const endValue =
          lane.kind === 'css' ? (scene.trace.arrived[lane.src] ?? null) : (scene.trace.scriptRuns[lane.src]?.end ?? scene.trace.scriptRuns[lane.src]?.start ?? null);
        if (endValue !== null) {
          frag.appendChild(
            textEl(axisX1 + 8, cy + 4, String(endValue), {
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            }),
          );
        }
      });

      svg.appendChild(frag);
    }

    function animate(scene: WhatFirstPaintNeedsScene): Promise<void> {
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
        const started = performance.now();
        const mine = gen;
        function tick(now: number): void {
          if (destroyed || mine !== gen) return;
          const frac = Math.min(1, (now - started) / ANIM_MS);
          draw(scene, frac);
          if (frac >= 1) {
            finish();
            return;
          }
          waitFrame(tick);
        }
        waitFrame(tick);
      });
    }

    return {
      async render(
        next: WhatFirstPaintNeedsScene,
        prev: WhatFirstPaintNeedsScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        gen += 1;
        if (destroyed) return;
        if (!opts.animate || prev === null) {
          draw(next, 1);
          return;
        }
        draw(next, 0);
        await animate(next);
        if (destroyed) return;
        draw(next, 1);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
