/**
 * Kafka 패턴 무대 — 오프셋 칸 한 줄 위에 보존 틀 · 로그 앞 경계 · 두 그룹의 오프셋 표지.
 *
 * 운동
 *   - 틱마다 새 기록이 끝 칸으로 내려앉고, 보존 틀이 끝을 따라 오른쪽으로 밀리며 앞 칸이 지워진다
 *   - live 표지는 끝에 붙어 가고, batch 표지는 한 칸씩 나아가다 로그 앞에 걸리면 앞으로 튕긴다
 *     (건너뛴 칸 아래 잃음 표지가 남는다)
 *   - 끝 걸음에 live 표지가 청한 자리를 향해 뒤로 날다 로그 앞에서 멈춘다
 *   - 새 판 머리에는 보존 틀의 폭이 앞 판 폭에서 새 폭으로 옮겨 가고 표지가 0 으로 돌아온다
 *
 * 무대는 판정하지 않는다 — 튕김 · 지움 · 되감기 자리는 모두 payload 로 받는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type KafkaStageInit = {
  ticks: number;
  values: number[];
  fastId: string;
  slowId: string;
  window: number;
};

export type KafkaStageTick = {
  tick: number;
  offset: number;
  value: number;
  start: number;
  end: number;
  trimmed: number;
  live: number;
  batch: number;
  skipFrom: number;
  skipped: number;
  read: boolean;
};

export type KafkaStageRewind = {
  requested: number;
  offset: number;
  from: number;
  end: number;
};

export type KafkaStage = {
  init(p: KafkaStageInit, durationMs: number): void;
  tick(p: KafkaStageTick, durationMs: number): void;
  rewind(p: KafkaStageRewind, durationMs: number): void;
  reset(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 740;
const H = 210;
const X0 = 70;
const CELL = 26;
const CELL_TOP = 90;
const CELL_H = 40;

/** 칸 경계 자리 — 오프셋 o 칸의 왼쪽 */
const xAt = (o: number): number => X0 + o * CELL;

type Pose = { frameX: number; frameW: number; live: number; batch: number; drop: number };

export const kafkaPatternStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const [liveColor, batchColor] = categorical(2);
    if (liveColor === undefined || batchColor === undefined) throw new Error('kafkaPattern: 그룹 색을 받지 못했다');
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (s: string, attrs: Record<string, string | number>, parent: SVGElement): SVGTextElement => {
      const node = el('text', { 'font-family': fonts.body, ...attrs }, parent);
      node.textContent = s;
      return node;
    };

    const root = el('g', {}, svg);

    // ── 판마다 다시 짓는 것들
    let ticks = 0;
    let values: number[] = [];
    let cells: { box: SVGRectElement; num: SVGTextElement; val: SVGTextElement; slash: SVGLineElement }[] = [];
    let lossLayer: SVGGElement | null = null;
    let askLayer: SVGGElement | null = null;
    let frameRectNode: SVGRectElement | null = null;
    let frontLineNode: SVGLineElement | null = null;
    let liveMarkNode: SVGGElement | null = null;
    let liveNum: SVGTextElement | null = null;
    let batchMarkNode: SVGGElement | null = null;
    let batchNum: SVGTextElement | null = null;
    let caption: SVGTextElement | null = null;
    let event: SVGTextElement | null = null;
    let dropIndex = -1;

    // ── 운동의 기억
    const rest: Pose = { frameX: 0, frameW: 0, live: 0, batch: 0, drop: 0 };
    let pose: Pose = { ...rest };
    let lastWindow = -1;
    let rafId = 0;
    let settle: (() => void) | null = null;

    const halt = (): void => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      rafId = 0;
      settle = null;
    };
    const finishNow = (): void => {
      const f = settle;
      halt();
      if (f) f();
    };
    params.onScrubStart?.(finishNow);

    const place = (p: Pose): void => {
      const frameRect = need(frameRectNode, '보존 틀');
      const frontLine = need(frontLineNode, '로그 앞 경계');
      const liveMark = need(liveMarkNode, 'live 표지');
      const batchMark = need(batchMarkNode, 'batch 표지');
      frameRect.setAttribute('x', String(xAt(p.frameX)));
      frameRect.setAttribute('width', String(Math.max(0, p.frameW * CELL)));
      frontLine.setAttribute('x1', String(xAt(p.frameX)));
      frontLine.setAttribute('x2', String(xAt(p.frameX)));
      liveMark.setAttribute('transform', `translate(${xAt(p.live)},0)`);
      batchMark.setAttribute('transform', `translate(${xAt(p.batch)},0)`);
      const drop = dropIndex >= 0 ? cells[dropIndex] : undefined;
      if (drop) drop.val.setAttribute('transform', `translate(0,${-p.drop})`);
    };

    /** 지금 자리에서 목표 자리로 옮긴다. 운동이 도는 중이면 먼저 끝 자리로 붙인다 */
    const moveTo = (target: Pose, durationMs: number): void => {
      finishNow();
      const from = { ...pose };
      pose = { ...target };
      if (durationMs <= 0 || isInstant()) {
        place(target);
        return;
      }
      const began = performance.now();
      const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
      const frame = (now: number): void => {
        const raw = Math.min(1, (now - began) / durationMs);
        const k = 1 - (1 - raw) * (1 - raw);
        place({
          frameX: mix(from.frameX, target.frameX, k),
          frameW: mix(from.frameW, target.frameW, k),
          live: mix(from.live, target.live, k),
          batch: mix(from.batch, target.batch, k),
          drop: mix(from.drop, target.drop, k),
        });
        if (raw < 1 && !isInstant()) rafId = requestAnimationFrame(frame);
        else {
          rafId = 0;
          settle = null;
          place(target);
        }
      };
      settle = () => place(target);
      rafId = requestAnimationFrame(frame);
    };

    const clear = (): void => {
      halt();
      while (root.firstChild) root.removeChild(root.firstChild);
      cells = [];
      lossLayer = null;
      askLayer = null;
      frameRectNode = null;
      frontLineNode = null;
      liveMarkNode = null;
      liveNum = null;
      batchMarkNode = null;
      batchNum = null;
      caption = null;
      event = null;
      dropIndex = -1;
    };

    const need = <T>(v: T | null, what: string): T => {
      if (v === null) throw new Error(`kafkaPattern 무대: ${what} 가 없다 — init 전에 걸음이 왔다`);
      return v;
    };

    const paintCells = (start: number, end: number, batch: number): void => {
      cells.forEach((cell, o) => {
        const kept = o >= start && o < end;
        const gone = o < start;
        const unread = kept && o >= batch;
        cell.box.setAttribute('fill', unread ? batchColor : kept ? c.bgSubtle : c.bg);
        cell.box.setAttribute('fill-opacity', unread ? '0.22' : '1');
        cell.box.setAttribute('stroke', kept ? c.text : c.border);
        cell.box.setAttribute('stroke-dasharray', kept ? '' : '3 3');
        cell.val.textContent = kept ? String(values[o]) : '';
        cell.slash.setAttribute('visibility', gone ? 'visible' : 'hidden');
      });
    };

    const init = (p: KafkaStageInit, durationMs: number): void => {
      clear();
      ticks = p.ticks;
      values = [...p.values];
      if (values.length !== ticks) throw new Error(`kafkaPattern 무대: 기록 값 ${values.length} 개가 틱 ${ticks} 와 다르다`);

      caption = text(t('caption.empty', 'Log is empty'), { x: 8, y: 22, 'font-size': fontSizes.md, fill: c.text, 'font-weight': 600 }, root);
      event = text('', { x: 8, y: 42, 'font-size': fontSizes.sm, fill: c.textMuted }, root);

      // 왼쪽 이름표
      text(p.fastId, { x: 8, y: 72, 'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: liveColor, 'font-weight': 600 }, root);
      text(t('label.live', 'Real-time'), { x: 8, y: 86, 'font-size': fontSizes.xs, fill: c.textMuted }, root);
      text(t('label.log', 'Log'), { x: 8, y: CELL_TOP + CELL_H / 2 + smPx / 2 - 1, 'font-size': fontSizes.sm, fill: c.text }, root);
      text(p.slowId, { x: 8, y: 152, 'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: batchColor, 'font-weight': 600 }, root);
      text(t('label.batch', 'Batch'), { x: 8, y: 166, 'font-size': fontSizes.xs, fill: c.textMuted }, root);
      text(t('label.lost', 'Lost'), { x: 8, y: 194, 'font-size': fontSizes.xs, fill: c.danger }, root);

      // 오프셋 칸
      const cellLayer = el('g', {}, root);
      for (let o = 0; o < ticks; o++) {
        const g = el('g', {}, cellLayer);
        const box = el('rect', { x: xAt(o) + 1, y: CELL_TOP, width: CELL - 2, height: CELL_H, rx: 3, 'stroke-width': 1 }, g);
        const num = text(String(o), { x: xAt(o) + CELL / 2, y: CELL_TOP + 12, 'text-anchor': 'middle', 'font-size': fontSizes.xs, 'font-family': fonts.mono, fill: c.textMuted }, g);
        const val = text('', { x: xAt(o) + CELL / 2, y: CELL_TOP + 32, 'text-anchor': 'middle', 'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: c.text, 'font-weight': 600 }, g);
        const slash = el('line', { x1: xAt(o) + 4, y1: CELL_TOP + CELL_H - 4, x2: xAt(o) + CELL - 4, y2: CELL_TOP + 4, stroke: c.textMuted, 'stroke-width': 1, visibility: 'hidden' }, g);
        cells.push({ box, num, val, slash });
      }
      paintCells(0, 0, 0);

      // 보존 틀과 로그 앞 경계
      frameRectNode = el('rect', { x: xAt(0), y: CELL_TOP - 4, width: 0, height: CELL_H + 8, rx: 5, fill: 'none', stroke: c.primary, 'stroke-width': 1.5, 'stroke-dasharray': '5 3' }, root);
      frontLineNode = el('line', { x1: xAt(0), y1: CELL_TOP - 10, x2: xAt(0), y2: CELL_TOP + CELL_H + 10, stroke: c.primary, 'stroke-width': 3 }, root);

      lossLayer = el('g', {}, root);
      askLayer = el('g', {}, root);

      // live 표지 (위에서 아래를 가리킨다)
      const liveMark = el('g', {}, root);
      liveMarkNode = liveMark;
      el('path', { d: `M -7 ${CELL_TOP - 16} L 7 ${CELL_TOP - 16} L 0 ${CELL_TOP - 3} Z`, fill: liveColor }, liveMark);
      liveNum = text('0', { x: 0, y: CELL_TOP - 21, 'text-anchor': 'middle', 'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: liveColor, 'font-weight': 600 }, liveMark);

      // batch 표지 (아래에서 위를 가리킨다)
      const batchMark = el('g', {}, root);
      batchMarkNode = batchMark;
      el('path', { d: `M -7 ${CELL_TOP + CELL_H + 18} L 7 ${CELL_TOP + CELL_H + 18} L 0 ${CELL_TOP + CELL_H + 5} Z`, fill: batchColor }, batchMark);
      batchNum = text('0', { x: 0, y: CELL_TOP + CELL_H + 32, 'text-anchor': 'middle', 'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: batchColor, 'font-weight': 600 }, batchMark);

      // 앞 판의 틀 폭에서 새 폭으로 옮겨 간다 — 결론이 아니라 자리다
      const startW = lastWindow >= 0 ? lastWindow : p.window;
      lastWindow = p.window;
      pose = { frameX: 0, frameW: startW, live: pose.live, batch: pose.batch, drop: 0 };
      place(pose);
      moveTo({ frameX: 0, frameW: p.window, live: 0, batch: 0, drop: 0 }, durationMs);
    };

    const tick = (p: KafkaStageTick, durationMs: number): void => {
      const cap = need(caption, '캡션');
      const ev = need(event, '사건 줄');
      const liveText = need(liveNum, 'live 표지');
      const batchText = need(batchNum, 'batch 표지');
      const losses = need(lossLayer, '잃음 줄');
      if (p.offset < 0 || p.offset >= cells.length) throw new Error(`kafkaPattern 무대: 오프셋 ${p.offset} 칸이 없다`);
      if (lastWindow < 0) throw new Error('kafkaPattern 무대: 보존 틀이 없다');
      finishNow();

      cap.textContent = t('caption.tick', 'Tick {tick} · log {start}..{last}', { tick: p.tick, start: p.start, last: p.end - 1 });
      if (p.skipped > 0) ev.textContent = t('caption.skip', 'Skip: {from} → {to}', { from: p.skipFrom, to: p.skipFrom + p.skipped });
      else if (p.read) ev.textContent = t('caption.read', 'Batch read: {offset}', { offset: p.batch - 1 });
      else if (p.trimmed > 0) ev.textContent = t('caption.trim', 'Log start → {start}', { start: p.start });
      else ev.textContent = t('caption.append', 'Append: {offset}', { offset: p.offset });

      paintCells(p.start, p.end, p.batch);
      liveText.textContent = String(p.live);
      batchText.textContent = String(p.batch);

      // 건너뛴 칸 아래 잃음 표지
      for (let o = p.skipFrom; o < p.skipFrom + p.skipped; o++) {
        const cx = xAt(o) + CELL / 2;
        const cy = 190;
        el('line', { x1: cx - 5, y1: cy - 5, x2: cx + 5, y2: cy + 5, stroke: c.danger, 'stroke-width': 2 }, losses);
        el('line', { x1: cx - 5, y1: cy + 5, x2: cx + 5, y2: cy - 5, stroke: c.danger, 'stroke-width': 2 }, losses);
      }

      // 새 칸의 값이 위에서 내려앉는다
      const prevDrop = dropIndex >= 0 ? cells[dropIndex] : undefined;
      if (prevDrop) prevDrop.val.removeAttribute('transform');
      dropIndex = p.offset;
      pose = { ...pose, drop: 16 };
      const frameW = Math.max(lastWindow, p.end - p.start);
      moveTo({ frameX: p.start, frameW, live: p.live, batch: p.batch, drop: 0 }, durationMs);
    };

    const rewind = (p: KafkaStageRewind, durationMs: number): void => {
      const cap = need(caption, '캡션');
      const ev = need(event, '사건 줄');
      const liveText = need(liveNum, 'live 표지');
      const ask = need(askLayer, '되감기 줄');
      finishNow();
      cap.textContent = t('caption.rewind', 'Rewind → {offset}', { offset: p.offset });
      ev.textContent = t('caption.asked', 'Asked for {offset}', { offset: p.requested });
      liveText.textContent = String(p.offset);
      while (ask.firstChild) ask.removeChild(ask.firstChild);
      // 청한 자리까지의 점선 — 표지는 그 앞 로그 앞에서 멈춘다
      const y = CELL_TOP - 10;
      el('line', { x1: xAt(p.requested), y1: y, x2: xAt(p.from), y2: y, stroke: liveColor, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }, ask);
      el('path', { d: `M ${xAt(p.requested)} ${y - 5} L ${xAt(p.requested) - 7} ${y} L ${xAt(p.requested)} ${y + 5}`, fill: 'none', stroke: liveColor, 'stroke-width': 1.5 }, ask);
      const prevDrop = dropIndex >= 0 ? cells[dropIndex] : undefined;
      if (prevDrop) prevDrop.val.removeAttribute('transform');
      dropIndex = -1;
      moveTo({ ...pose, live: p.offset, drop: 0 }, durationMs);
    };

    const reset = (): void => {
      clear();
      lastWindow = -1;
      pose = { ...rest };
      ticks = 0;
      values = [];
    };

    return {
      init,
      tick,
      rewind,
      reset,
      destroy(): void {
        halt();
        root.remove();
      },
    };
  },
};
