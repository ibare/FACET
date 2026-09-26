/**
 * preload-hint stage — 문서 패널 + 요청 시간표(waterfall) + hero 자리 미리보기.
 *
 * 동사("앞질러 간다")는 시간표의 두 막대가 자란다: hero.jpg 막대는 t=10 부터 계속
 * 자라고, site.css 가 도착해 그 규칙이 hero.jpg 를 "필요로" 하는 순간(점선)이
 * hero.jpg 막대의 한복판에 떨어진다 — 이미 그만큼 받아 둔 채로.
 */
import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { PIECE_CANVAS_W, categorical, fonts, fontSizes, getColors, makeTranslator, radii } from '@ffacet/core/runtime';
import type { PreloadHintScene, ResourceLane } from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
}

function set(node: Element, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
}

// ── 레이아웃 ────────────────────────────────────────────────────────────────
const W = PIECE_CANVAS_W;
const PAD = 20;
const CONTENT_W = W - PAD * 2;
const SEC_GAP = 16;

const FS_XS = parseFloat(fontSizes.xs);
const FS_SM = parseFloat(fontSizes.sm);
const FS_MD = parseFloat(fontSizes.md);
const RADIUS_SM = parseFloat(radii.sm);

const CAPTION_GAP = 6;
const CAPTION_H = FS_MD + CAPTION_GAP + FS_SM;

const DOC_LINE_COUNT = 4;
const DOC_TITLE_H = FS_XS + 6;
const DOC_LINE_H = 20;
const DOC_BLOCK_H = DOC_TITLE_H + DOC_LINE_H * DOC_LINE_COUNT;

const RESOURCE_COUNT = 2;
const TL_TITLE_H = FS_XS + 6;
const TL_AXIS_H = 22;
const LANE_H = 24;
const LANE_GAP = 10;
const TL_LANES_H = LANE_H * RESOURCE_COUNT + LANE_GAP * (RESOURCE_COUNT - 1);
const TL_BLOCK_H = TL_TITLE_H + TL_AXIS_H + TL_LANES_H;

const HERO_TITLE_H = FS_XS + 6;
const HERO_RULE_H = 16;
const HERO_GAP_INNER = 8;
const HERO_BOX_H = 54;
const HERO_BOX_W = 160;
const HERO_BLOCK_H = HERO_TITLE_H + HERO_RULE_H + HERO_GAP_INNER + HERO_BOX_H;

const CANVAS_H = PAD * 2 + CAPTION_H + SEC_GAP + DOC_BLOCK_H + SEC_GAP + TL_BLOCK_H + SEC_GAP + HERO_BLOCK_H;

const CAPTION_Y0 = PAD;
const DOC_Y0 = CAPTION_Y0 + CAPTION_H + SEC_GAP;
const TL_Y0 = DOC_Y0 + DOC_BLOCK_H + SEC_GAP;
const HERO_Y0 = TL_Y0 + TL_BLOCK_H + SEC_GAP;

const LANE_LABEL_W = 74;
const TIMELINE_X0 = PAD + LANE_LABEL_W;
const TIMELINE_AXIS_W = CONTENT_W - LANE_LABEL_W;
const TIME_MAX = 330;
const PX_PER_MS = TIMELINE_AXIS_W / TIME_MAX;
const TICKS = [0, 100, 200, 300];

const AXIS_LINE_Y = TL_Y0 + TL_TITLE_H + 6;
const LANES_Y0 = TL_Y0 + TL_TITLE_H + TL_AXIS_H;
const NEEDED_Y1 = LANES_Y0 - 6;
const NEEDED_Y2 = LANES_Y0 + TL_LANES_H + 6;
const BAR_H = 12;
const DOT_R = 4;

const HERO_TITLE_Y = HERO_Y0 + FS_XS;
const HERO_RULE_Y = HERO_Y0 + HERO_TITLE_H + FS_SM;
const HERO_BOX_Y = HERO_Y0 + HERO_TITLE_H + HERO_RULE_H + HERO_GAP_INNER;
const HERO_BOX_CX = PAD + HERO_BOX_W / 2;
const HERO_BOX_CY = HERO_BOX_Y + HERO_BOX_H / 2;

function xForMs(ms: number): number {
  return TIMELINE_X0 + ms * PX_PER_MS;
}

const LANE_COLORS = categorical(RESOURCE_COUNT, 'vivid');

function laneColorOf(index: number): string {
  const color = LANE_COLORS[index];
  if (!color) throw new Error(`preload-hint-stage: lane 색 인덱스 ${index} 가 범위 밖이다`);
  return color;
}

/** lane 이 nowMs 까지 그려야 할 막대의 끝 ms (요청 전이면 null). */
function barEndMs(lane: ResourceLane, nowMs: number): number | null {
  if (lane.requestMs === null) return null;
  const cap = lane.arriveMs !== null ? Math.min(nowMs, lane.arriveMs) : nowMs;
  return Math.max(lane.requestMs, cap);
}

const ANIM_MS = 320;
const PULSE_MS = 420;

/** rAF 기반 트윈. `isDead()` 가 참이면 그 프레임에서 곧바로 끝맺는다. */
function tween(
  durationMs: number,
  onFrame: (p: number) => void,
  frames: Set<number>,
  resolvers: Set<() => void>,
  isDead: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      resolvers.delete(finish);
      resolve();
    };
    resolvers.add(finish);
    const start = performance.now();
    const step = (now: number): void => {
      if (isDead()) {
        finish();
        return;
      }
      const p = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
      onFrame(p);
      if (p >= 1) {
        finish();
        return;
      }
      frames.add(requestAnimationFrame(step));
    };
    frames.add(requestAnimationFrame(step));
  });
}

type LaneRefs = {
  label: SVGTextElement;
  bar: SVGRectElement;
  dot: SVGCircleElement;
  requestTag: SVGTextElement;
  arriveTag: SVGTextElement;
};

type DocLineRefs = {
  rect: SVGRectElement;
  text: SVGTextElement;
  swatch: SVGRectElement | null;
};

type CaptionOf = { main: string; note: string };

function captionOf(scene: PreloadHintScene, t: Translate): CaptionOf {
  const step = scene.step;
  if (!step) {
    const preload = scene.lines.find((l) => l.kind === 'preload');
    return {
      main: t('caption.initial', 'Four document lines are about to be parsed.'),
      note: t('caption.initialNote', 'One line already asks for {file} ahead of time.', {
        file: preload?.resource ?? '',
      }),
    };
  }
  switch (step.kind) {
    case 'line-read': {
      const line = scene.lines.find((l) => l.id === step.id);
      const file = step.resource ?? '';
      if (line?.kind === 'preload') {
        return { main: t('caption.preloadRequest', 'The preload line is read — its request for {file} departs.', { file }), note: '' };
      }
      return { main: t('caption.styleRequest', 'The stylesheet line is read — its request for {file} departs.', { file }), note: '' };
    }
    case 'parse-end':
      return {
        main: t('caption.parseEnd', 'The remaining lines are read — parsing ends.'),
        note: t('caption.parseEndNote', 'Two requests are already in flight.'),
      };
    case 'resource-needed':
      return {
        main: t('caption.needed', 'The stylesheet arrives, and its rule calls {file} for the first time.', { file: step.file }),
        note: t('caption.neededNote', 'It is already {percent}% received.', { percent: step.percent }),
      };
    case 'first-paint':
      return {
        main: t('caption.firstPaint', 'The page paints for the first time — the background-image area stays empty.'),
        note: t('caption.firstPaintNote', 'The rule already fired — only the image is still on the way.'),
      };
    case 'resource-arrived': {
      if (!scene.needed) throw new Error('preload-hint-stage: resource-arrived 인데 needed 가 없다');
      return {
        main: t('caption.arrived', '{file} arrives, and the area fills in.', { file: step.file }),
        note: t('caption.arrivedNote', 'It departed {leadMs}ms before this moment was needed.', {
          leadMs: scene.needed.receivedMs,
        }),
      };
    }
    default:
      throw new Error(`preload-hint-stage: 모르는 step '${(step as { kind: string }).kind}'`);
  }
}

export const preloadHintStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const palette: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${W} ${CANVAS_H}`);
    svg.textContent = '';

    // ── 캡션 ──
    const captionMain = el('text');
    set(captionMain, { x: PAD, y: CAPTION_Y0 + FS_MD, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: palette.text });
    svg.appendChild(captionMain);
    const captionNote = el('text');
    set(captionNote, { x: PAD, y: CAPTION_Y0 + FS_MD + CAPTION_GAP + FS_SM, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: palette.textMuted });
    svg.appendChild(captionNote);

    // ── 문서 패널 ──
    const docTitle = el('text');
    set(docTitle, { x: PAD, y: DOC_Y0 + FS_XS, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: palette.textMuted });
    docTitle.textContent = t('label.document', 'Document');
    svg.appendChild(docTitle);

    const docLines: DocLineRefs[] = [];
    for (let i = 0; i < DOC_LINE_COUNT; i += 1) {
      const rowY = DOC_Y0 + DOC_TITLE_H + i * DOC_LINE_H;
      const rect = el('rect');
      set(rect, { x: PAD, y: rowY, width: CONTENT_W, height: DOC_LINE_H - 4, rx: RADIUS_SM, fill: palette.bgSubtle });
      svg.appendChild(rect);
      const text = el('text');
      set(text, { x: PAD + 8, y: rowY + DOC_LINE_H - 8, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: palette.textMuted });
      svg.appendChild(text);
      const swatch = el('rect');
      set(swatch, { x: PAD + CONTENT_W - 16, y: rowY + (DOC_LINE_H - 4 - 8) / 2, width: 8, height: 8, rx: 2, fill: palette.border, opacity: 0 });
      svg.appendChild(swatch);
      docLines.push({ rect, text, swatch });
    }

    // ── 시간표 패널 ──
    const tlTitle = el('text');
    set(tlTitle, { x: PAD, y: TL_Y0 + FS_XS, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: palette.textMuted });
    tlTitle.textContent = t('label.timeline', 'Requests over time');
    svg.appendChild(tlTitle);

    const axisLine = el('line');
    set(axisLine, { x1: TIMELINE_X0, x2: TIMELINE_X0 + TIMELINE_AXIS_W, y1: AXIS_LINE_Y, y2: AXIS_LINE_Y, stroke: palette.border, 'stroke-width': 1 });
    svg.appendChild(axisLine);
    for (const ms of TICKS) {
      const x = xForMs(ms);
      const tick = el('line');
      set(tick, { x1: x, x2: x, y1: AXIS_LINE_Y - 3, y2: AXIS_LINE_Y + 3, stroke: palette.border, 'stroke-width': 1 });
      svg.appendChild(tick);
      const label = el('text');
      set(label, { x, y: AXIS_LINE_Y + 12, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: palette.textMuted, 'text-anchor': 'middle' });
      label.textContent = String(ms);
      svg.appendChild(label);
    }

    const lanes: LaneRefs[] = [];
    for (let i = 0; i < RESOURCE_COUNT; i += 1) {
      const laneY = LANES_Y0 + i * (LANE_H + LANE_GAP);
      const label = el('text');
      set(label, { x: PAD, y: laneY + LANE_H / 2 + FS_SM / 2 - 2, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: palette.text });
      svg.appendChild(label);
      const bar = el('rect');
      set(bar, { x: TIMELINE_X0, y: laneY + (LANE_H - BAR_H) / 2, width: 0, height: BAR_H, rx: 2, fill: laneColorOf(i), opacity: 0 });
      svg.appendChild(bar);
      const dot = el('circle');
      set(dot, { cx: TIMELINE_X0, cy: laneY + LANE_H / 2, r: 0, fill: laneColorOf(i) });
      svg.appendChild(dot);
      const requestTag = el('text');
      set(requestTag, { x: TIMELINE_X0, y: laneY - 3, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: palette.textMuted, 'text-anchor': 'middle', opacity: 0 });
      svg.appendChild(requestTag);
      const arriveTag = el('text');
      set(arriveTag, { x: TIMELINE_X0, y: laneY + LANE_H + 10, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: palette.textMuted, 'text-anchor': 'middle', opacity: 0 });
      svg.appendChild(arriveTag);
      lanes.push({ label, bar, dot, requestTag, arriveTag });
    }

    const neededLine = el('line');
    set(neededLine, { x1: TIMELINE_X0, x2: TIMELINE_X0, y1: NEEDED_Y1, y2: NEEDED_Y1, stroke: palette.accent, 'stroke-width': 2, 'stroke-dasharray': '4 3', opacity: 0 });
    svg.appendChild(neededLine);
    const neededPercent = el('text');
    set(neededPercent, { x: TIMELINE_X0, y: NEEDED_Y1 - 4, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: palette.accent, 'text-anchor': 'middle', opacity: 0 });
    svg.appendChild(neededPercent);

    // ── hero 패널 ──
    const heroTitle = el('text');
    set(heroTitle, { x: PAD, y: HERO_TITLE_Y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: palette.textMuted });
    heroTitle.textContent = t('label.heroArea', 'Where the background image lands');
    svg.appendChild(heroTitle);

    const heroRule = el('text');
    set(heroRule, { x: PAD, y: HERO_RULE_Y, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: palette.textMuted });
    svg.appendChild(heroRule);

    const heroBox = el('rect');
    set(heroBox, { x: PAD, y: HERO_BOX_Y, width: HERO_BOX_W, height: HERO_BOX_H, rx: RADIUS_SM, fill: palette.bgSubtle, stroke: palette.border, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' });
    svg.appendChild(heroBox);

    const heroIcon = el('g');
    heroIcon.setAttribute('opacity', '0');
    const iconColor = palette.textInverse;
    const peakLeft = el('path');
    set(peakLeft, {
      d: `M ${HERO_BOX_CX - 44} ${HERO_BOX_CY + 14} L ${HERO_BOX_CX - 16} ${HERO_BOX_CY - 14} L ${HERO_BOX_CX + 6} ${HERO_BOX_CY + 14} Z`,
      fill: iconColor,
    });
    heroIcon.appendChild(peakLeft);
    const peakRight = el('path');
    set(peakRight, {
      d: `M ${HERO_BOX_CX - 6} ${HERO_BOX_CY + 14} L ${HERO_BOX_CX + 20} ${HERO_BOX_CY - 6} L ${HERO_BOX_CX + 44} ${HERO_BOX_CY + 14} Z`,
      fill: iconColor,
    });
    heroIcon.appendChild(peakRight);
    const sun = el('circle');
    set(sun, { cx: HERO_BOX_CX + 30, cy: HERO_BOX_CY - 16, r: 5, fill: iconColor });
    heroIcon.appendChild(sun);
    svg.appendChild(heroIcon);

    const paintPulse = el('circle');
    set(paintPulse, { cx: HERO_BOX_CX, cy: HERO_BOX_CY, r: 0, fill: 'none', stroke: palette.accent, 'stroke-width': 2, opacity: 0 });
    svg.appendChild(paintPulse);

    // ── 상태 ──
    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const resolvers = new Set<() => void>();

    function setCaptionText(scene: PreloadHintScene): void {
      const c = captionOf(scene, t);
      captionMain.textContent = c.main;
      captionNote.textContent = c.note;
    }

    function drawLaneStatic(scene: PreloadHintScene, i: number): void {
      const lane = scene.resources[i];
      const ref = lanes[i];
      if (!lane || !ref) return;
      ref.label.textContent = lane.file;
      const endMs = barEndMs(lane, scene.nowMs);
      if (endMs === null) {
        set(ref.bar, { x: TIMELINE_X0, width: 0, opacity: 0, 'fill-opacity': 0.55 });
        set(ref.dot, { cx: TIMELINE_X0, r: 0 });
        set(ref.requestTag, { x: TIMELINE_X0, opacity: 0 });
        set(ref.arriveTag, { x: TIMELINE_X0, opacity: 0 });
        ref.requestTag.textContent = '';
        ref.arriveTag.textContent = '';
        return;
      }
      const x0 = xForMs(lane.requestMs as number);
      const w = (endMs - (lane.requestMs as number)) * PX_PER_MS;
      set(ref.bar, { x: x0, width: Math.max(0, w), opacity: 1, 'fill-opacity': lane.arrived ? 1 : 0.55 });
      set(ref.dot, { cx: x0, r: DOT_R });
      set(ref.requestTag, { x: x0, opacity: 1 });
      ref.requestTag.textContent = String(lane.requestMs);
      if (lane.arrived) {
        set(ref.arriveTag, { x: xForMs(lane.arriveMs as number), opacity: 1 });
        ref.arriveTag.textContent = String(lane.arriveMs);
      } else {
        set(ref.arriveTag, { x: x0, opacity: 0 });
        ref.arriveTag.textContent = '';
      }
    }

    function heroColorOf(scene: PreloadHintScene): string {
      const idx = scene.resources.findIndex((r) => r.file === scene.cssRule.refResource);
      return laneColorOf(idx < 0 ? 0 : idx);
    }

    function drawStatic(scene: PreloadHintScene): void {
      setCaptionText(scene);

      scene.lines.forEach((line, i) => {
        const ref = docLines[i];
        if (!ref) return;
        ref.rect.setAttribute('fill', line.read ? palette.bg : palette.bgSubtle);
        ref.text.setAttribute('fill', line.read ? palette.text : palette.textMuted);
        ref.text.textContent = line.code;
        if (ref.swatch) {
          const idx = scene.resources.findIndex((r) => r.file === line.resource);
          ref.swatch.setAttribute('fill', idx >= 0 ? laneColorOf(idx) : palette.border);
          ref.swatch.setAttribute('opacity', line.read && idx >= 0 ? '1' : '0');
        }
      });

      for (let i = 0; i < RESOURCE_COUNT; i += 1) drawLaneStatic(scene, i);

      const showNeeded = scene.needed !== null;
      const neededX = scene.firstPaintMs !== null ? xForMs(scene.firstPaintMs) : TIMELINE_X0;
      set(neededLine, { x1: neededX, x2: neededX, y1: NEEDED_Y1, y2: showNeeded ? NEEDED_Y2 : NEEDED_Y1, opacity: showNeeded ? 1 : 0 });
      set(neededPercent, { x: neededX, opacity: showNeeded ? 1 : 0 });
      neededPercent.textContent = scene.needed ? `${scene.needed.percent}%` : '';

      set(paintPulse, { r: 0, opacity: 0 });

      heroRule.textContent = scene.cssRule.code;
      const filled = scene.heroFilled;
      const color = heroColorOf(scene);
      set(heroBox, {
        fill: filled ? color : palette.bgSubtle,
        stroke: filled ? color : palette.border,
        'stroke-dasharray': filled ? '0 0' : '5 4',
      });
      heroIcon.setAttribute('opacity', filled ? '1' : '0');
      heroIcon.setAttribute(
        'transform',
        `translate(${HERO_BOX_CX} ${HERO_BOX_CY}) scale(${filled ? 1 : 0}) translate(${-HERO_BOX_CX} ${-HERO_BOX_CY})`,
      );
    }

    function animateLane(i: number, prevScene: PreloadHintScene, nextScene: PreloadHintScene): Promise<void> | null {
      const prevLane = prevScene.resources[i];
      const nextLane = nextScene.resources[i];
      const ref = lanes[i];
      if (!prevLane || !nextLane || !ref) return null;
      const wasRequested = prevLane.requestMs !== null;
      const nowRequested = nextLane.requestMs !== null;
      if (!nowRequested) return null;
      const x0 = xForMs(nextLane.requestMs as number);
      const fromEnd = wasRequested ? barEndMs(prevLane, prevScene.nowMs) : null;
      const fromW = fromEnd !== null ? (fromEnd - (nextLane.requestMs as number)) * PX_PER_MS : 0;
      const toEnd = barEndMs(nextLane, nextScene.nowMs) as number;
      const toW = (toEnd - (nextLane.requestMs as number)) * PX_PER_MS;
      if (wasRequested && Math.abs(toW - fromW) < 0.5) return null;
      const mine = gen;
      const isDead = (): boolean => destroyed || gen !== mine;
      set(ref.bar, { x: x0, opacity: 1 });
      if (!wasRequested) set(ref.dot, { cx: x0 });
      return tween(
        ANIM_MS,
        (p) => {
          const w = fromW + (toW - fromW) * p;
          ref.bar.setAttribute('width', String(Math.max(0, w)));
          if (!wasRequested) ref.dot.setAttribute('r', String(DOT_R * p));
        },
        frames,
        resolvers,
        isDead,
      );
    }

    function animateNeeded(nextScene: PreloadHintScene): Promise<void> | null {
      if (nextScene.firstPaintMs === null) return null;
      const x = xForMs(nextScene.firstPaintMs);
      const mine = gen;
      const isDead = (): boolean => destroyed || gen !== mine;
      set(neededLine, { x1: x, x2: x, y1: NEEDED_Y1, y2: NEEDED_Y1, opacity: 1 });
      set(neededPercent, { x, opacity: 0 });
      return tween(
        ANIM_MS,
        (p) => {
          neededLine.setAttribute('y2', String(NEEDED_Y1 + (NEEDED_Y2 - NEEDED_Y1) * p));
          if (p >= 1) neededPercent.setAttribute('opacity', '1');
        },
        frames,
        resolvers,
        isDead,
      );
    }

    function animatePulse(): Promise<void> {
      const mine = gen;
      const isDead = (): boolean => destroyed || gen !== mine;
      set(paintPulse, { cx: HERO_BOX_CX, cy: HERO_BOX_CY, opacity: 1 });
      return tween(
        PULSE_MS,
        (p) => {
          paintPulse.setAttribute('r', String(6 + 26 * p));
          paintPulse.setAttribute('opacity', String(Math.max(0, 0.7 * (1 - p))));
        },
        frames,
        resolvers,
        isDead,
      );
    }

    function animateHeroFill(nextScene: PreloadHintScene): Promise<void> {
      const mine = gen;
      const isDead = (): boolean => destroyed || gen !== mine;
      const color = heroColorOf(nextScene);
      set(heroBox, { fill: color, stroke: color, 'stroke-dasharray': '0 0' });
      heroIcon.setAttribute('opacity', '1');
      return tween(
        ANIM_MS,
        (p) => {
          heroIcon.setAttribute(
            'transform',
            `translate(${HERO_BOX_CX} ${HERO_BOX_CY}) scale(${p}) translate(${-HERO_BOX_CX} ${-HERO_BOX_CY})`,
          );
        },
        frames,
        resolvers,
        isDead,
      );
    }

    return {
      render(next: unknown, prev: unknown, opts: { animate: boolean }): void | Promise<void> {
        const nextScene = next as PreloadHintScene;
        const prevScene = prev as PreloadHintScene | null;
        gen += 1;
        const mine = gen;

        if (!opts.animate || destroyed || prevScene === null) {
          drawStatic(nextScene);
          return;
        }

        return (async (): Promise<void> => {
          setCaptionText(nextScene);
          const tasks: Promise<void>[] = [];
          for (let i = 0; i < RESOURCE_COUNT; i += 1) {
            const task = animateLane(i, prevScene, nextScene);
            if (task) tasks.push(task);
          }
          if (nextScene.needed !== null && prevScene.needed === null) {
            const task = animateNeeded(nextScene);
            if (task) tasks.push(task);
          }
          if (nextScene.firstPaintMs !== null && prevScene.firstPaintMs === null) {
            tasks.push(animatePulse());
          }
          if (nextScene.heroFilled && !prevScene.heroFilled) {
            tasks.push(animateHeroFill(nextScene));
          }
          await Promise.all(tasks);
          if (gen !== mine || destroyed) return;
          drawStatic(nextScene);
        })();
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const fin of [...resolvers]) fin();
        resolvers.clear();
        svg.textContent = '';
      },
    };
  },
};
