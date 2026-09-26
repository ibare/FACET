/**
 * frame-budget 의 stage — 박자마다 상자가 옮겨 가는 자리, 렌더 파이프라인(rAF → 스타일 →
 * 레이아웃 → 페인트 → 합성)의 진행, 초당 장 수 계기판을 그린다.
 *
 * 운동: 상자(들)가 새 장이 나온 박자에만 자리를 옮기고(되풀이 박자에는 멈춰 있다), 파이프라인
 * 단계가 그 박자의 실제 몫(ms)에 비례한 길이로 차례로 켜진다. 길이는 매 호출마다
 * `speedMul` 을 다시 읽어 재생 속도를 따라간다.
 */
import type { CanvasView, Palette, Theme, Translate, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

export type FrameBudgetBeatPayload = {
  beat: number;
  position: number;
  isNewFrame: boolean;
  newFrames: number;
  repeats: number;
  fps: number;
  frameCost: number;
  /** 0 transform | 1 left */
  prop: number;
  boxCount: number;
};

const NS = 'http://www.w3.org/2000/svg';
const WIDTH = 640;
const HEIGHT = 360;

const TOTAL_BEATS = 12;
const TRACK_X = 40;
const TRACK_Y = 70;
const TRACK_W = 280;
const BOX_W = 40;
const BOX_H = 22;
const BOX_STACK_STEP = 3;
const MAX_BOXES = 20;

const PIPELINE_Y = 150;
const PIPELINE_CELL_W = 108;
const PIPELINE_CELL_H = 34;
const PIPELINE_GAP = 12;
const PIPELINE_NAMES = ['raf', 'style', 'layout', 'paint', 'composite'] as const;
type PipelineName = (typeof PIPELINE_NAMES)[number];

const FPS_Y = 220;
const FPS_BAR_W = 240;
const FPS_MAX = 60;

const CAPTION_Y0 = 260;
const CAPTION_LINE_H = 20;
const CODE_Y = 340;

/** 파이프라인 단계 하나의 애니메이션 길이 몫 — 실제 ms(라벨용 아님, 길이 배분용)와 같은 비중. */
function pipelineWeights(prop: number, boxCount: number): Record<PipelineName, number> {
  const withLayout = prop === 1; // left
  return {
    raf: 1,
    style: 1,
    layout: withLayout ? boxCount : 0,
    paint: withLayout ? boxCount : 0,
    composite: 2,
  };
}

function cssFor(prop: number, position: number, templates: { left: string; transform: string }): string {
  const template = prop === 1 ? templates.left : templates.transform;
  return template.split('{x}').join(String(position));
}

export const frameBudgetStageView: CanvasView = {
  canvas: { width: WIDTH, height: HEIGHT, fit: 'fill' },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const theme: Theme | undefined = params.theme;
    const colors: Palette = getColors(theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);

    const initial = params.initialData as Record<string, unknown> | undefined;
    const cssLeft = typeof initial?.cssLeft === 'string' ? initial.cssLeft : '.box { position: absolute; width: 40px; left: {x}px; }';
    const cssTransform = typeof initial?.cssTransform === 'string' ? initial.cssTransform : '.box { transform: translateX({x}px); }';

    const el = (tag: string, attrs: Record<string, string>): SVGElement => {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      return node;
    };

    // ── 트랙
    svg.appendChild(el('line', { x1: String(TRACK_X), y1: String(TRACK_Y + BOX_H + 30), x2: String(TRACK_X + TRACK_W), y2: String(TRACK_Y + BOX_H + 30), stroke: colors.border, 'stroke-width': '1' }));

    // ── 상자 그룹(같은 transform 을 공유 — 상자 수만큼 같은 자리로 함께 움직인다)
    const boxGroup = el('g', { transform: 'translate(0,0)' });
    const boxRects: SVGElement[] = [];
    for (let i = 0; i < MAX_BOXES; i += 1) {
      const rect = el('rect', {
        x: String(TRACK_X),
        y: String(TRACK_Y - i * BOX_STACK_STEP),
        width: String(BOX_W),
        height: String(BOX_H),
        rx: '3',
        fill: colors.itemDefault,
        stroke: colors.primary,
        'stroke-width': '1',
      });
      boxRects.push(rect);
      boxGroup.appendChild(rect);
    }
    svg.appendChild(boxGroup);

    // ── 파이프라인
    const pipelineCells = new Map<PipelineName, { rect: SVGElement; label: SVGElement }>();
    PIPELINE_NAMES.forEach((name, i) => {
      const x = TRACK_X + i * (PIPELINE_CELL_W + PIPELINE_GAP);
      const rect = el('rect', {
        x: String(x),
        y: String(PIPELINE_Y),
        width: String(PIPELINE_CELL_W),
        height: String(PIPELINE_CELL_H),
        rx: '4',
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': '1',
      });
      const label = el('text', {
        x: String(x + PIPELINE_CELL_W / 2),
        y: String(PIPELINE_Y + PIPELINE_CELL_H / 2 + 4),
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      label.textContent =
        name === 'raf'
          ? 'rAF'
          : name === 'style'
            ? t('label.style', 'Style')
            : name === 'layout'
              ? t('label.layout', 'Layout')
              : name === 'paint'
                ? t('label.paint', 'Paint')
                : t('label.composite', 'Composite');
      svg.appendChild(rect);
      svg.appendChild(label);
      pipelineCells.set(name, { rect, label });
    });

    // ── 초당 장 수 계기판
    const fpsTrack = el('rect', { x: String(TRACK_X), y: String(FPS_Y), width: String(FPS_BAR_W), height: '14', rx: '3', fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': '1' });
    const fpsBar = el('rect', { x: String(TRACK_X), y: String(FPS_Y), width: '0', height: '14', rx: '3', fill: colors.accent });
    fpsBar.style.transition = 'width 200ms linear';
    const fpsText = el('text', { x: String(TRACK_X + FPS_BAR_W + 10), y: String(FPS_Y + 12), 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text });
    svg.appendChild(fpsTrack);
    svg.appendChild(fpsBar);
    svg.appendChild(fpsText);

    // ── 캡션들
    const makeCaption = (line: number): SVGElement => {
      const text = el('text', { x: String(TRACK_X), y: String(CAPTION_Y0 + line * CAPTION_LINE_H), 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text });
      svg.appendChild(text);
      return text;
    };
    const beatCaption = makeCaption(0);
    const positionCaption = makeCaption(1);
    const costCaption = makeCaption(2);
    const stateCaption = makeCaption(3);

    const codeText = el('text', { x: String(TRACK_X), y: String(CODE_Y), 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.textMuted });
    svg.appendChild(codeText);

    boxGroup.style.transition = 'transform 200ms linear';

    let timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = (): void => {
      for (const id of timers) clearTimeout(id);
      timers = [];
    };

    function setBoxCount(n: number): void {
      boxRects.forEach((rect, i) => {
        rect.setAttribute('display', i < n ? 'inline' : 'none');
      });
    }

    function idlePipeline(): void {
      for (const { rect } of pipelineCells.values()) rect.setAttribute('fill', colors.itemDefault);
    }

    function onBeat(payload: FrameBudgetBeatPayload, speedMul: number): void {
      clearTimers();
      const speed = speedMul > 0 ? speedMul : 1;
      setBoxCount(payload.boxCount);

      const moveMs = Math.max(60, 200 / speed);
      boxGroup.style.transitionDuration = `${moveMs}ms`;
      boxGroup.setAttribute('transform', `translate(${payload.position},0)`);
      boxRects.forEach((rect) => rect.setAttribute('fill', payload.isNewFrame ? colors.itemActive : colors.itemDefault));
      if (payload.isNewFrame) {
        const revert = setTimeout(() => {
          boxRects.forEach((rect) => rect.setAttribute('fill', colors.itemDefault));
        }, moveMs);
        timers.push(revert);
      }

      idlePipeline();
      if (payload.isNewFrame) {
        const weights = pipelineWeights(payload.prop, payload.boxCount);
        const order: PipelineName[] = ['raf', 'style', 'layout', 'paint', 'composite'];
        const active = order.filter((name) => weights[name] > 0);
        const sumW = active.reduce((s, name) => s + weights[name], 0);
        const totalMs = Math.max(120, Math.min(380, payload.frameCost * 8)) / speed;
        let acc = 0;
        for (const name of active) {
          const dur = Math.max(20, Math.round((totalMs * weights[name]) / sumW));
          const at = acc;
          const cell = pipelineCells.get(name);
          if (cell) {
            const id = setTimeout(() => cell.rect.setAttribute('fill', colors.itemComparing), at);
            timers.push(id);
          }
          acc += dur;
        }
        const clearId = setTimeout(idlePipeline, acc + 10);
        timers.push(clearId);
      }

      const fpsW = Math.max(0, Math.min(FPS_BAR_W, Math.round((payload.fps / FPS_MAX) * FPS_BAR_W)));
      fpsBar.setAttribute('width', String(fpsW));
      fpsText.textContent = t('caption.fps', 'FPS {fps}', { fps: payload.fps });

      beatCaption.textContent = t('caption.beat', 'Beat {beat} / {total}', { beat: payload.beat, total: TOTAL_BEATS });
      positionCaption.textContent = t('caption.position', 'Position {position}px', { position: payload.position });
      costCaption.textContent = t('caption.frameCost', 'Frame cost {cost}ms', { cost: payload.frameCost });
      stateCaption.textContent = payload.isNewFrame
        ? `${t('caption.newFrame', 'New frame')} · ${t('caption.newFrameCount', 'New frames so far {n}', { n: payload.newFrames })}`
        : `${t('caption.repeat', 'Repeat')} · ${t('caption.repeatCount', 'Repeats so far {n}', { n: payload.repeats })}`;

      codeText.textContent = cssFor(payload.prop, payload.position, { left: cssLeft, transform: cssTransform });
    }

    setBoxCount(typeof initial?.boxCount === 'number' ? initial.boxCount : 1);

    return {
      onBeat,
      destroy(): void {
        clearTimers();
      },
    };
  },
};
