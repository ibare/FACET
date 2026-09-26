/**
 * parser-stops 의 화면 — 읽는 자리가 줄마다 내려가다가 script 줄에서 멈춘 채 남고,
 * 시각만 흐르는 것을 보인다. 자원이 도착해 실행을 마치면 다시 내려간다.
 */
import type {
  CanvasView,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { LineStatus, ParserStopsScene, ParserStopsStep } from './scene.js';

const H = 340;
const MARGIN_X = 20;
const CLOCK_Y = 26;
const LEGEND_Y = 46;
const LINE_Y0 = 68;
const LINE_GAP = 28;
const DOT_R = 4;
const CODE_X_OFFSET = 16;
const CURSOR_X_OFFSET = -14;
const PANEL_LABEL_Y = 236;
const BAR_Y = 250;
const BAR_H = 12;
const BAR_W = 220;
const NUM_Y = 282;
const CAPTION_Y = 320;
const ANIM_MS = 400;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

/** hex → rgba 문자열. 순수 변환이라 색 리터럴이 아니다 (입력은 언제나 토큰 경유). */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lineY(i: number): number {
  return LINE_Y0 + i * LINE_GAP;
}

/** -0 과 부동소수 끝자리를 정리한 반올림. */
function roundClean(n: number): number {
  const r = Math.round(n);
  return r === 0 ? 0 : r;
}

function lerp(a: number, b: number, p: number): number {
  return roundClean(a + (b - a) * p);
}

/** 지금까지 손댄 줄 가운데 가장 아래 것의 인덱스. 하나도 없으면 -1. */
function cursorIndex(statuses: readonly LineStatus[]): number {
  let idx = -1;
  for (let i = 0; i < statuses.length; i += 1) if (statuses[i] !== 'pending') idx = i;
  return idx;
}

type Panel = { readonly src: string; readonly dur: number; readonly received: number };

type PaintArgs = {
  readonly lines: readonly { readonly id: string; readonly code: string }[];
  readonly statuses: readonly LineStatus[];
  readonly atMs: number;
  readonly cursorIdx: number;
  readonly cursorY: number;
  readonly panel: Panel | null;
  readonly caption: string;
};

function captionFor(step: ParserStopsStep, t: Translate): string {
  switch (step.kind) {
    case 'start':
      return t('caption.start', 'The document has six lines and none are read yet.');
    case 'read':
      return step.final
        ? t('caption.parseEnd', 'The parser read the last line — parsing is done.')
        : t('caption.read', 'The parser read the next line.');
    case 'stop':
      return t(
        'caption.stop',
        'A script tag with no attribute stopped the parser and sent a request for {file}.',
        { file: step.src },
      );
    case 'wait':
      return t('caption.wait', 'The reading position stays put while time passes.');
    case 'arrive':
      return t('caption.arrive', 'The resource arrived and its script started running.');
    case 'resume':
      return t('caption.resume', 'The script finished running. Stalled for {ms} ms in total.', {
        ms: String(step.stalledForMs),
      });
  }
}

function sceneToPaintArgs(scene: ParserStopsScene, t: Translate): PaintArgs {
  const idx = cursorIndex(scene.statuses);
  const cursorY = idx >= 0 ? lineY(idx) : lineY(0) - LINE_GAP;
  const panel = scene.stall ? { src: scene.stall.src, dur: scene.stall.dur, received: scene.stall.received } : null;
  return {
    lines: scene.lines,
    statuses: scene.statuses,
    atMs: scene.atMs,
    cursorIdx: idx,
    cursorY,
    panel,
    caption: captionFor(scene.step, t),
  };
}

function interpArgs(prevA: PaintArgs, nextA: PaintArgs, progress: number, step: ParserStopsStep): PaintArgs {
  const atMs = lerp(prevA.atMs, nextA.atMs, progress);
  let cursorY = nextA.cursorY;
  let panel = nextA.panel;
  if (step.kind === 'read' || step.kind === 'stop') {
    cursorY = lerp(prevA.cursorY, nextA.cursorY, progress);
  }
  if ((step.kind === 'wait' || step.kind === 'arrive') && prevA.panel && nextA.panel) {
    panel = { ...nextA.panel, received: lerp(prevA.panel.received, nextA.panel.received, progress) };
  }
  if (step.kind === 'resume' && prevA.panel) {
    panel = prevA.panel;
  }
  return { ...nextA, atMs, cursorY, panel };
}

export const parserStopsStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const w = svg.viewBox.baseVal.width || PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    /** 걸어 둔 rAF 요청. destroy 가 일괄 취소한다. */
    const frames = new Set<number>();
    /** 기다리는 render() 의 Promise 를 풀 콜백. destroy 가 일괄 깨운다. */
    const waiters = new Set<() => void>();

    function paint(args: PaintArgs): void {
      svg.textContent = '';
      const colors = getColors(params.theme);

      const clock = el('text');
      clock.setAttribute('x', String(MARGIN_X));
      clock.setAttribute('y', String(CLOCK_Y));
      clock.setAttribute('font-family', fonts.body);
      clock.setAttribute('font-size', fontSizes.lg);
      clock.setAttribute('fill', colors.text);
      clock.textContent = t('label.elapsed', 'Elapsed: {ms} ms', { ms: String(roundClean(args.atMs)) });
      svg.appendChild(clock);

      const pendingCount = args.statuses.filter((s) => s === 'pending').length;
      const unread = el('text');
      unread.setAttribute('x', String(w - MARGIN_X));
      unread.setAttribute('y', String(CLOCK_Y));
      unread.setAttribute('text-anchor', 'end');
      unread.setAttribute('font-family', fonts.body);
      unread.setAttribute('font-size', fontSizes.sm);
      unread.setAttribute('fill', colors.textMuted);
      unread.textContent = t('label.unread', 'Unread lines: {n}', { n: String(pendingCount) });
      svg.appendChild(unread);

      const legend: Array<[LineStatus, string, string]> = [
        ['pending', colors.itemDefault, t('legend.pending', 'not read')],
        ['active', colors.itemActive, t('legend.active', 'stalled here')],
        ['done', colors.itemSorted, t('legend.done', 'read')],
      ];
      legend.forEach(([, fill, label], i) => {
        const x = MARGIN_X + i * 110;
        const dot = el('circle');
        dot.setAttribute('cx', String(x));
        dot.setAttribute('cy', String(LEGEND_Y - 4));
        dot.setAttribute('r', String(DOT_R));
        dot.setAttribute('fill', fill);
        dot.setAttribute('stroke', colors.border);
        svg.appendChild(dot);
        const text = el('text');
        text.setAttribute('x', String(x + 8));
        text.setAttribute('y', String(LEGEND_Y));
        text.setAttribute('font-family', fonts.body);
        text.setAttribute('font-size', fontSizes.xs);
        text.setAttribute('fill', colors.textMuted);
        text.textContent = label;
        svg.appendChild(text);
      });

      args.lines.forEach((line, i) => {
        const y = lineY(i);
        const status = args.statuses[i];
        if (status === 'active') {
          const highlight = el('rect');
          highlight.setAttribute('x', String(MARGIN_X - 6));
          highlight.setAttribute('y', String(y - 15));
          highlight.setAttribute('width', String(w - (MARGIN_X - 6) * 2));
          highlight.setAttribute('height', '20');
          highlight.setAttribute('rx', '4');
          highlight.setAttribute('fill', hexToRgba(colors.itemActive, 0.12));
          highlight.setAttribute('stroke', colors.itemActive);
          svg.appendChild(highlight);
        }

        const dot = el('circle');
        dot.setAttribute('cx', String(MARGIN_X));
        dot.setAttribute('cy', String(y - 4));
        dot.setAttribute('r', String(DOT_R));
        dot.setAttribute(
          'fill',
          status === 'done' ? colors.itemSorted : status === 'active' ? colors.itemActive : colors.itemDefault,
        );
        dot.setAttribute('stroke', colors.border);
        svg.appendChild(dot);

        const code = el('text');
        code.setAttribute('x', String(MARGIN_X + CODE_X_OFFSET));
        code.setAttribute('y', String(y));
        code.setAttribute('font-family', fonts.mono);
        code.setAttribute('font-size', fontSizes.sm);
        code.setAttribute('fill', status === 'pending' ? colors.textMuted : colors.text);
        code.textContent = line.code;
        svg.appendChild(code);
      });

      if (args.cursorIdx >= 0) {
        const cx = MARGIN_X + CURSOR_X_OFFSET;
        const cy = args.cursorY - 4;
        const cursor = el('path');
        cursor.setAttribute('d', `M ${cx} ${cy - 6} L ${cx + 10} ${cy} L ${cx} ${cy + 6} Z`);
        cursor.setAttribute('fill', colors.itemActive);
        svg.appendChild(cursor);
      }

      if (args.panel) {
        const label = el('text');
        label.setAttribute('x', String(MARGIN_X));
        label.setAttribute('y', String(PANEL_LABEL_Y));
        label.setAttribute('font-family', fonts.body);
        label.setAttribute('font-size', fontSizes.sm);
        label.setAttribute('fill', colors.textMuted);
        label.textContent = t('label.request', 'Request: {file}', { file: args.panel.src });
        svg.appendChild(label);

        const track = el('rect');
        track.setAttribute('x', String(MARGIN_X));
        track.setAttribute('y', String(BAR_Y));
        track.setAttribute('width', String(BAR_W));
        track.setAttribute('height', String(BAR_H));
        track.setAttribute('rx', '3');
        track.setAttribute('fill', colors.bgSubtle);
        track.setAttribute('stroke', colors.border);
        svg.appendChild(track);

        const ratio = Math.max(0, Math.min(1, args.panel.received / args.panel.dur));
        const fillW = Math.round(BAR_W * ratio);
        if (fillW > 0) {
          const fill = el('rect');
          fill.setAttribute('x', String(MARGIN_X));
          fill.setAttribute('y', String(BAR_Y));
          fill.setAttribute('width', String(fillW));
          fill.setAttribute('height', String(BAR_H));
          fill.setAttribute('rx', '3');
          fill.setAttribute('fill', colors.itemActive);
          svg.appendChild(fill);
        }

        const nums = el('text');
        nums.setAttribute('x', String(MARGIN_X));
        nums.setAttribute('y', String(NUM_Y));
        nums.setAttribute('font-family', fonts.body);
        nums.setAttribute('font-size', fontSizes.sm);
        nums.setAttribute('fill', colors.textMuted);
        nums.textContent = t('label.received', 'Received: {n}/{total}', {
          n: String(roundClean(args.panel.received)),
          total: String(args.panel.dur),
        });
        svg.appendChild(nums);
      }

      const caption = el('text');
      caption.setAttribute('x', String(MARGIN_X));
      caption.setAttribute('y', String(CAPTION_Y));
      caption.setAttribute('font-family', fonts.body);
      caption.setAttribute('font-size', fontSizes.md);
      caption.setAttribute('fill', colors.text);
      caption.textContent = args.caption;
      svg.appendChild(caption);
    }

    async function doRender(
      next: ParserStopsScene,
      prev: ParserStopsScene | null,
      animate: boolean,
    ): Promise<void> {
      const mine = (gen += 1);
      const nextArgs = sceneToPaintArgs(next, t);
      if (!animate || prev === null) {
        paint(nextArgs);
        return;
      }
      const prevArgs = sceneToPaintArgs(prev, t);
      const start = performance.now();
      await new Promise<void>((resolve) => {
        let rafId = 0;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        const frame = (now: number): void => {
          frames.delete(rafId);
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const progress = Math.min(1, (now - start) / ANIM_MS);
          paint(interpArgs(prevArgs, nextArgs, progress, next.step));
          if (progress >= 1) {
            finish();
            return;
          }
          rafId = requestAnimationFrame(frame);
          frames.add(rafId);
        };
        waiters.add(finish);
        rafId = requestAnimationFrame(frame);
        frames.add(rafId);
      });
      if (destroyed || mine !== gen) return;
      paint(nextArgs);
    }

    return {
      render(next: ParserStopsScene, prev: ParserStopsScene | null, opts: { animate: boolean }): Promise<void> {
        return doRender(next, prev, opts.animate);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
