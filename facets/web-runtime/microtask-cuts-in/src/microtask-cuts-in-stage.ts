/**
 * microtask-cuts-in-stage — 코드 여섯 줄 + 태스크 줄 + 마이크로태스크 줄 + 출력 줄.
 *
 * 동사(사양) — "앞질러 비워진다": 마이크로태스크 줄이 태스크 줄보다 먼저, 그리고
 * 통째로 비워진다. 그리는 것은 그 앞지르기(줄 사이의 상자 이동)와 자라는 출력
 * 줄(A E C D B)이다. 시각은 셈하지 않는다.
 *
 * 걸음마다 장면 전체를 다시 그린다(drawStatic). `animate:true` 일 때만 이 걸음에서
 * 실제로 움직인 상자(그리고 코드 강조 띠)를 이전 자리에서 다음 자리로 흘려 그린다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { MicrotaskCutsInScene, MicrotaskCutsInStep } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 레이아웃 상수 (S-piece: 캔버스에서 역산, 세로는 상수 상한) ──────────────
const MARGIN = 16;
const CONTENT_W = PIECE_CANVAS_W - 2 * MARGIN;

const CAPTION_TOP = 16;
const CAPTION_LINE_H = 16;
const CAPTION_LINES = 5;

const CODE_TOP = CAPTION_TOP + CAPTION_LINES * CAPTION_LINE_H + 14;
const LINE_H = 20;
const CODE_LINE_COUNT = 6;
const CODE_BOTTOM = CODE_TOP + CODE_LINE_COUNT * LINE_H;

const LANE_LABEL_H = 14;
const LANE_GAP = 16;
const BOX_H = 26;
const BOX_W = 34;
const WBOX_H = 22;
const WBOX_W = 34;
const BOX_GAP = 10;

const TASK_LABEL_Y = CODE_BOTTOM + LANE_GAP;
const TASK_BOX_Y = TASK_LABEL_Y + LANE_LABEL_H;

const MICRO_LABEL_Y = TASK_BOX_Y + BOX_H + LANE_GAP;
const MICRO_BOX_Y = MICRO_LABEL_Y + LANE_LABEL_H;

const WAITING_LABEL_Y = MICRO_BOX_Y + BOX_H + LANE_GAP;
const WAITING_BOX_Y = WAITING_LABEL_Y + LANE_LABEL_H;

const OUTPUT_LABEL_Y = WAITING_BOX_Y + WBOX_H + LANE_GAP;
const OUTPUT_BOX_Y = OUTPUT_LABEL_Y + LANE_LABEL_H;

const H = OUTPUT_BOX_Y + BOX_H + MARGIN;

const ANIM_MS = 400;

type Lane = 'task' | 'micro' | 'waiting' | 'output';
type Point = { x: number; y: number };
type Band = { min: number; max: number };

function laneY(lane: Lane): number {
  if (lane === 'task') return TASK_BOX_Y;
  if (lane === 'micro') return MICRO_BOX_Y;
  if (lane === 'waiting') return WAITING_BOX_Y;
  return OUTPUT_BOX_Y;
}

function laneBoxSize(lane: Lane): { w: number; h: number } {
  return lane === 'waiting' ? { w: WBOX_W, h: WBOX_H } : { w: BOX_W, h: BOX_H };
}

function slotPixel(lane: Lane, index: number): Point {
  const { w } = laneBoxSize(lane);
  return { x: MARGIN + index * (w + BOX_GAP), y: laneY(lane) };
}

function codeOrigin(line: number): Point {
  const { h } = laneBoxSize('task');
  return { x: MARGIN, y: CODE_TOP + (line - 1) * LINE_H + LINE_H / 2 - h / 2 };
}

function locate(scene: MicrotaskCutsInScene): Map<string, { lane: Lane; index: number }> {
  const m = new Map<string, { lane: Lane; index: number }>();
  scene.taskQueue.forEach((id, i) => m.set(id, { lane: 'task', index: i }));
  scene.microQueue.forEach((id, i) => m.set(id, { lane: 'micro', index: i }));
  scene.waiting.forEach((w, i) => m.set(w.id, { lane: 'waiting', index: i }));
  scene.output.forEach((id, i) => m.set(id, { lane: 'output', index: i }));
  return m;
}

function bandOf(lines: readonly number[]): Band | null {
  if (lines.length === 0) return null;
  return { min: Math.min(...lines), max: Math.max(...lines) };
}

function highlightBand(step: MicrotaskCutsInStep): Band | null {
  switch (step.kind) {
    case 'init':
      return null;
    case 'log':
    case 'scheduleTimer':
    case 'scheduleChain':
      return bandOf(step.lines);
    case 'runMicrotask':
    case 'runTask':
      return { min: step.line, max: step.line };
  }
}

/** 새로 등장하는 id 가 어느 코드 줄에서 나오는지. 기존 자리에서 옮겨 오는 이동은 이 함수를 쓰지 않는다. */
function originLineFor(step: MicrotaskCutsInStep, id: string): number | null {
  if (step.kind === 'log' && step.id === id) return step.lines[0] ?? null;
  if (step.kind === 'scheduleTimer' && step.id === id) return step.lines[0] ?? null;
  if (step.kind === 'scheduleChain') {
    if (step.first === id) return step.firstLine;
    const w = step.waiting.find((x) => x.id === id);
    if (w) return w.line;
  }
  return null;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function lerpBand(a: Band, b: Band, t: number): Band {
  return { min: lerp(a.min, b.min, t), max: lerp(a.max, b.max, t) };
}

/**
 * 한 글자의 어림 폭(px). 한중일 글자는 정사각형에 가까워 라틴 문자보다 훨씬 넓다 —
 * 같은 배율을 쓰면 한국어·일본어·중국어 캡션이 칸을 넘어 잘린다 (2026-09 실측).
 */
function estCharPx(s: string, sizePx: number): number {
  const wide = (s.match(/[ᄀ-ᇿ⺀-꓏가-퟿豈-﫿＀-￯]/g) ?? []).length;
  const factor = wide / Math.max(1, s.length) > 0.25 ? 1.05 : 0.62;
  return sizePx * factor;
}

function wrapText(src: string, maxChars: number): string[] {
  if (src.length <= maxChars) return [src];
  const out: string[] = [];
  let rest = src;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut <= 0) cut = maxChars;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

export const microtaskCutsInStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    const idOrder = idsFromInitialData(params.initialData);
    const palette = categorical(Math.max(idOrder.length, 1));
    const colorFor = (id: string): string => {
      const i = idOrder.indexOf(id);
      return i >= 0 ? (palette[i] ?? colors.itemDefault) : colors.itemDefault;
    };

    const svg = params.canvas;
    const root = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(root);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function makeText(
      x: number,
      y: number,
      s: string,
      opts: { size?: string; family?: string; fill?: string; anchor?: string; weight?: string } = {},
    ): SVGTextElement {
      const el = document.createElementNS(SVG_NS, 'text');
      el.setAttribute('x', String(x));
      el.setAttribute('y', String(y));
      el.setAttribute('font-family', opts.family ?? fonts.body);
      el.setAttribute('font-size', opts.size ?? fontSizes.sm);
      el.setAttribute('fill', opts.fill ?? colors.text);
      el.setAttribute('text-anchor', opts.anchor ?? 'start');
      if (opts.weight) el.setAttribute('font-weight', opts.weight);
      el.textContent = s;
      return el;
    }

    function makeBox(pos: Point, lane: Lane, id: string, dashed: boolean): SVGGElement {
      const { w, h } = laneBoxSize(lane);
      const g = document.createElementNS(SVG_NS, 'g');
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(pos.x));
      rect.setAttribute('y', String(pos.y));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(h));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', colorFor(id));
      rect.setAttribute('stroke', colors.border);
      if (dashed) rect.setAttribute('stroke-dasharray', '3 3');
      g.appendChild(rect);
      g.appendChild(
        makeText(pos.x + w / 2, pos.y + h / 2 + 4, id, {
          anchor: 'middle',
          family: fonts.mono,
          fill: colors.stateInk,
          weight: 'bold',
        }),
      );
      return g;
    }

    function captionText(step: MicrotaskCutsInStep): string {
      switch (step.kind) {
        case 'init':
          return t('caption.init', 'Nothing has run yet. Both queues are empty.');
        case 'log':
          return t('caption.log', 'A synchronous log adds a value to the output: {id}', { id: step.id });
        case 'scheduleTimer':
          return t(
            'caption.scheduleTimer',
            'The timer callback is already due, so it joins the back of the task queue: {id}',
            { id: step.id },
          );
        case 'scheduleChain': {
          const next = step.waiting[0];
          if (!next) throw new Error('microtask-cuts-in-stage: scheduleChain 걸음에 대기 콜백이 없다');
          return t(
            'caption.scheduleChain',
            'The promise is already settled, so its first callback joins the microtask queue right away: {first}. The next callback waits for that promise instead of queueing: {next}',
            { first: step.first, next: next.id },
          );
        }
        case 'runMicrotask': {
          const promoted = step.promoted[0];
          return promoted
            ? t(
                'caption.runMicrotaskPromote',
                'The stack is empty, so the front of the microtask queue runs: {id}. Finishing it settles the next promise, and its callback joins the queue: {next}',
                { id: step.id, next: promoted },
              )
            : t('caption.runMicrotaskPlain', 'The stack is empty, so the front of the microtask queue runs: {id}', {
                id: step.id,
              });
        }
        case 'runTask':
          return t(
            'caption.runTask',
            'The microtask queue is empty, so the front of the task queue finally runs: {id}',
            { id: step.id },
          );
      }
    }

    function draw(scene: MicrotaskCutsInScene, overrides: Map<string, Point> | null, band: Band | null): void {
      root.textContent = '';

      // ── 캡션
      const raw = captionText(scene.step);
      const maxChars = Math.max(20, Math.floor(CONTENT_W / estCharPx(raw, parseFloat(fontSizes.md))));
      const capLines = wrapText(raw, maxChars).slice(0, CAPTION_LINES);
      capLines.forEach((line, i) => {
        root.appendChild(makeText(MARGIN, CAPTION_TOP + i * CAPTION_LINE_H, line, { size: fontSizes.md }));
      });

      // ── 강조 띠 (band 는 override 가 오면 그것, 아니면 이번 걸음의 것)
      const activeBand = band ?? highlightBand(scene.step);
      if (activeBand) {
        const rect = document.createElementNS(SVG_NS, 'rect');
        const y0 = CODE_TOP + (activeBand.min - 1) * LINE_H - 2;
        const y1 = CODE_TOP + activeBand.max * LINE_H - 2;
        rect.setAttribute('x', String(MARGIN - 4));
        rect.setAttribute('y', String(y0));
        rect.setAttribute('width', String(CONTENT_W + 8));
        rect.setAttribute('height', String(Math.max(2, y1 - y0)));
        rect.setAttribute('rx', '3');
        rect.setAttribute('fill', hexToRgba(colors.itemActive, 0.16));
        rect.setAttribute('stroke', colors.itemActive);
        root.appendChild(rect);
      }

      // ── 코드
      scene.code.forEach((line, i) => {
        root.appendChild(
          makeText(MARGIN, CODE_TOP + i * LINE_H + 14, line, { family: fonts.mono, size: fontSizes.sm }),
        );
      });

      // ── 레인 라벨
      root.appendChild(makeText(MARGIN, TASK_LABEL_Y, t('label.taskQueue', 'Task queue'), { fill: colors.textMuted }));
      root.appendChild(
        makeText(MARGIN, MICRO_LABEL_Y, t('label.microQueue', 'Microtask queue'), { fill: colors.textMuted }),
      );
      root.appendChild(
        makeText(MARGIN, WAITING_LABEL_Y, t('label.waiting', 'Waiting on a promise'), { fill: colors.textMuted }),
      );
      root.appendChild(
        makeText(MARGIN, OUTPUT_LABEL_Y, t('label.output', 'Console output'), { fill: colors.textMuted }),
      );

      // ── 상자 (locate 로 지금 자리를 셈하고, overrides 가 있으면 그 자리를 덮어쓴다)
      const loc = locate(scene);
      for (const [id, at] of loc) {
        const rest = slotPixel(at.lane, at.index);
        const pos = overrides?.get(id) ?? rest;
        root.appendChild(makeBox(pos, at.lane, id, at.lane === 'waiting'));
      }
    }

    function runTween(duration: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = performance.now();
        let raf = 0;
        const waiter = (): void => {
          cancelAnimationFrame(raf);
          frames.delete(raf);
          waiters.delete(waiter);
          resolve();
        };
        waiters.add(waiter);
        const step = (now: number): void => {
          if (destroyed) {
            waiters.delete(waiter);
            resolve();
            return;
          }
          const progress = Math.min(1, (now - start) / duration);
          onFrame(progress);
          if (progress >= 1) {
            frames.delete(raf);
            waiters.delete(waiter);
            resolve();
            return;
          }
          raf = requestAnimationFrame(step);
          frames.add(raf);
        };
        raf = requestAnimationFrame(step);
        frames.add(raf);
      });
    }

    async function render(
      next: MicrotaskCutsInScene,
      prev: MicrotaskCutsInScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (!opts.animate || prev === null) {
        draw(next, null, null);
        return;
      }

      const prevLoc = locate(prev);
      const nextLoc = locate(next);
      const moves: { id: string; from: Point; to: Point }[] = [];
      for (const [id, at] of nextLoc) {
        const to = slotPixel(at.lane, at.index);
        const before = prevLoc.get(id);
        if (before) {
          const from = slotPixel(before.lane, before.index);
          if (from.x !== to.x || from.y !== to.y) moves.push({ id, from, to });
        } else {
          const line = originLineFor(next.step, id);
          if (line !== null) moves.push({ id, from: codeOrigin(line), to });
        }
      }
      const bandFrom = highlightBand(prev.step);
      const bandTo = highlightBand(next.step);
      const bandMoves = bandFrom !== null && bandTo !== null;

      if (moves.length === 0 && !bandMoves) {
        draw(next, null, null);
        return;
      }

      await runTween(ANIM_MS, (progress) => {
        const eased = ease(progress);
        const overrides = new Map(moves.map((m) => [m.id, lerpPoint(m.from, m.to, eased)]));
        const band = bandMoves ? lerpBand(bandFrom as Band, bandTo as Band, eased) : bandTo;
        draw(next, overrides, band);
      });

      if (mine !== gen || destroyed) return;
      draw(next, null, null);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      root.textContent = '';
    }

    return { render, destroy };
  },
};

/** 순수 변환 — 입력 hex 는 design-tokens 경유 (S-view Exception). */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/.exec(hex);
  if (!m) return hex;
  const [, r, g, b] = m;
  return `rgba(${parseInt(r!, 16)}, ${parseInt(g!, 16)}, ${parseInt(b!, 16)}, ${alpha})`;
}

/** mount 의 방어적 좁히기 — initialData 가 없어도 던지지 않는다 (canvas-attach). */
function idsFromInitialData(raw: Record<string, unknown> | undefined): string[] {
  if (!raw) return [];
  const stmts = raw.statements;
  if (!Array.isArray(stmts)) return [];
  const ids: string[] = [];
  for (const s of stmts) {
    if (typeof s !== 'object' || s === null) continue;
    const op = (s as { op?: unknown }).op;
    if (op === 'log' || op === 'timeout') {
      const id = (s as { id?: unknown }).id;
      if (typeof id === 'string') ids.push(id);
    } else if (op === 'thenChain') {
      const chainIds = (s as { ids?: unknown }).ids;
      if (Array.isArray(chainIds)) {
        for (const cid of chainIds) if (typeof cid === 'string') ids.push(cid);
      }
    }
  }
  return ids;
}
