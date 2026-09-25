/**
 * round-robin-quantum stage — 프로세스마다 제 레인, 그 위에 돈 토막들과 토막 사이의 틈.
 *
 * 주인공은 레인과 틈이다 (CPU 한 줄의 차례가 아니다). 판이 바뀌면 앞 판의 토막은 흐리게 남고, 새 판의 토막이
 * 생길 때마다 같은 레인의 앞 판 토막 하나를 **끌어와** 새 자리 · 새 굵기로 옮긴다. 새 판의 토막이 더 많으면
 * 마지막으로 끌어온 앞 판 토막에서 **쪼개져** 나오고, 판이 끝났는데 남은 앞 판 토막은 그 레인의 마지막 토막으로
 * **합쳐져** 사라진다. 바꾸는 틱은 모든 레인을 가로지르는 틈이고, 끝 표식은 앞 판의 끝에서 새 끝으로 미끄러진다.
 *
 * 메서드 (projector 가 부른다)
 *   round({ axisEnd, procs, caption })                판 시작 — 지금 토막을 앞 판 토막으로 흐리게 돌린다
 *   step({ from, to, ticks, firstRuns, caption }, ms)  걸음 하나 — 토막이 자라거나 옮겨 오고, 틈이 끼고, 지금 틱이 간다
 *   done({ endTick, summary }, ms)                    판 끝 — 남은 앞 판 토막이 합쳐지고, 끝 표식이 미끄러진다
 *   reset()                                           모두 비운다
 * 받은 값이 비면 0 을 지어내지 않고 던진다.
 */

import type { CanvasView, Palette, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { categorical, fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

export type RrStageProc = { id: string; arrive: number; burst: number };
export type RrStageTick = { tick: number; proc: number; kind: 'run' | 'switch'; slice: number };
export type RrStageFirstRun = { proc: number; arrive: number; tick: number };

export type RoundRobinQuantumStage = ViewInstance & {
  round(r: { axisEnd: number; procs: RrStageProc[]; caption: string }): void;
  step(s: { from: number; to: number; ticks: RrStageTick[]; firstRuns: RrStageFirstRun[]; caption: string }, ms: number): Promise<void>;
  done(d: { endTick: number; summary: string[] }, ms: number): Promise<void>;
  reset(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const LEFT = 100;
const RIGHT = 128;
const TOP = 34;
const LANE_H = 40;
const PIECE_Y = 7;
const PIECE_H = 20;
const RESP_Y = 32;
const DEFAULT_LANES = 4;
const GHOST_OPACITY = 0.22;
const BELOW = 112;

const heightFor = (lanes: number): number => TOP + lanes * LANE_H + BELOW;

type Geo = { x: number; w: number };
type Piece = { el: SVGRectElement; lane: number; from: number; to: number };
type Anim = { el: SVGElement; attr: string; from: number; to: number };

export const roundRobinQuantumStageView: CanvasView = {
  canvas: { width: W, height: heightFor(DEFAULT_LANES) },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const doc = svg.ownerDocument;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);

    const initProcs = params.initialData?.procs;
    const laneCount = Array.isArray(initProcs) && initProcs.length > 0 ? initProcs.length : DEFAULT_LANES;
    const height = heightFor(laneCount);
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    const lanesBottom = TOP + laneCount * LANE_H;

    const make = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = doc.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, s: string, attrs: Record<string, string | number>, parent: Element) => {
      const node = make('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.text, ...attrs }, parent);
      node.textContent = s;
      return node;
    };

    // 층 — 뒤에서 앞으로
    const gAxis = make('g', {}, svg);
    const gLanes = make('g', {}, svg);
    const gGaps = make('g', {}, svg);
    const gPieces = make('g', {}, svg);
    const gMarks = make('g', {}, svg);
    const gText = make('g', {}, svg);

    let axisEnd = 0;
    let procs: RrStageProc[] = [];
    let colors: readonly string[] = [];
    let built = false;

    let pieces = new Map<number, Piece>();
    let lastPieceOfLane: (Piece | undefined)[] = [];
    let ghosts: SVGRectElement[][] = [];
    let lastSource: (Geo | undefined)[] = [];
    let gaps: SVGRectElement[] = [];
    let ghostGaps: SVGRectElement[] = [];
    let respBars: SVGRectElement[] = [];
    let respTexts: SVGTextElement[] = [];
    let prevEnd: number | null = null;

    const xOf = (tick: number): number => {
      if (axisEnd <= 0) throw new Error('round-robin-quantum-stage: 시간축이 아직 없다');
      return LEFT + (tick / axisEnd) * (W - LEFT - RIGHT);
    };
    const laneTop = (lane: number): number => TOP + lane * LANE_H;
    const num = (el: Element, attr: string): number => {
      const raw = el.getAttribute(attr);
      if (raw === null) throw new Error(`round-robin-quantum-stage: ${attr} 가 없다`);
      return parseFloat(raw);
    };

    // 운동 — rAF 로 보간하고, 끝은 타이머가 확정한다 (rAF 가 없는 곳에서도 끝 값이 선다)
    const pending = new Set<() => void>();
    const animate = (anims: Anim[], ms: number, after?: () => void): Promise<void> => {
      for (const a of anims) a.el.setAttribute(a.attr, String(a.from));
      return new Promise<void>((resolve) => {
        const began = Date.now();
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          pending.delete(finish);
          clearTimeout(timer);
          for (const a of anims) a.el.setAttribute(a.attr, String(a.to));
          if (after) after();
          resolve();
        };
        const frame = () => {
          if (finished) return;
          const k = Math.min(1, (Date.now() - began) / Math.max(1, ms));
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          for (const a of anims) a.el.setAttribute(a.attr, String(a.from + (a.to - a.from) * e));
          if (k < 1 && typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);
        };
        const timer = setTimeout(finish, Math.max(0, ms));
        pending.add(finish);
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);
      });
    };
    const flush = () => {
      for (const f of [...pending]) f();
    };

    // 글자 자리
    const caption = text(LEFT, lanesBottom + 40, '', { 'font-size': fontSizes.sm }, gText);
    const summary = [0, 1, 2].map((k) =>
      text(LEFT + k * 190, lanesBottom + 66, '', { 'font-size': fontSizes.sm, 'font-weight': 600 }, gText),
    );
    const cursor = make('line', { x1: 0, x2: 0, y1: TOP - 4, y2: lanesBottom, stroke: pal.primary, 'stroke-width': 1.5, opacity: 0 }, gMarks);
    const endLine = make('line', { x1: 0, x2: 0, y1: TOP - 4, y2: lanesBottom + 6, stroke: pal.danger, 'stroke-width': 2, opacity: 0 }, gMarks);
    const endText = text(0, lanesBottom + 20, '', { 'text-anchor': 'middle', fill: pal.danger, 'font-weight': 600 }, gMarks);

    const clearGroup = (g: Element) => {
      while (g.firstChild) g.removeChild(g.firstChild);
    };

    const build = (r: { axisEnd: number; procs: RrStageProc[] }) => {
      axisEnd = r.axisEnd;
      procs = r.procs;
      colors = categorical(procs.length, 'vivid');
      clearGroup(gAxis);
      clearGroup(gLanes);
      // 틱 눈금
      text(LEFT - 10, TOP - 12, t('axis.tick', 'Tick'), { 'text-anchor': 'end', fill: pal.textMuted }, gAxis);
      for (let tick = 0; tick <= axisEnd; tick += 1) {
        const x = xOf(tick);
        make('line', { x1: x, x2: x, y1: TOP - 4, y2: lanesBottom, stroke: pal.border, 'stroke-width': tick % 5 === 0 ? 1 : 0.5, opacity: 0.7 }, gAxis);
        text(x, TOP - 12, String(tick), { 'text-anchor': 'middle', fill: pal.textMuted }, gAxis);
      }
      // 레인 — 기호 · 길이 · 도착 표식 · 첫 응답 자리
      respBars = [];
      respTexts = [];
      procs.forEach((p, lane) => {
        const y = laneTop(lane);
        make('line', { x1: xOf(p.arrive), x2: xOf(axisEnd), y1: y + PIECE_Y + PIECE_H, y2: y + PIECE_Y + PIECE_H, stroke: pal.border, 'stroke-width': 1 }, gLanes);
        text(12, y + PIECE_Y + PIECE_H - 4, p.id.toUpperCase(), { 'font-size': fontSizes.lg, 'font-weight': 700, fill: colors[lane] }, gLanes);
        text(LEFT - 10, y + PIECE_Y + PIECE_H - 5, t('label.burst', 'Length: {n}', { n: p.burst }), { 'text-anchor': 'end', fill: pal.textMuted }, gLanes);
        const ax = xOf(p.arrive);
        make('path', { d: `M ${ax - 4} ${y + 2} L ${ax + 4} ${y + 2} L ${ax} ${y + PIECE_Y}`, fill: pal.textMuted }, gLanes);
        respBars.push(make('rect', { x: ax, y: y + RESP_Y, width: 0, height: 3, rx: 1.5, fill: pal.textMuted, opacity: 0.8 }, gLanes));
        respTexts.push(text(xOf(axisEnd) + 10, y + PIECE_Y + PIECE_H - 5, '', { fill: pal.textMuted }, gLanes));
      });
      // 범례 — 틈과 첫 응답 막대
      const ly = lanesBottom + 90;
      make('rect', { x: LEFT, y: ly - 9, width: 12, height: 12, fill: pal.textMuted, opacity: 0.35 }, gLanes);
      text(LEFT + 18, ly, t('legend.gap', 'Switching tick'), { fill: pal.textMuted }, gLanes);
      make('rect', { x: LEFT + 190, y: ly - 4, width: 16, height: 3, rx: 1.5, fill: pal.textMuted }, gLanes);
      text(LEFT + 212, ly, t('legend.response', 'Arrival to first run'), { fill: pal.textMuted }, gLanes);
      built = true;
    };

    const resetRound = () => {
      clearGroup(gPieces);
      clearGroup(gGaps);
      pieces = new Map();
      lastPieceOfLane = [];
      ghosts = [];
      lastSource = [];
      gaps = [];
      ghostGaps = [];
    };

    const instance: RoundRobinQuantumStage = {
      round(r) {
        flush();
        if (!Number.isFinite(r.axisEnd) || r.axisEnd <= 0) throw new Error('round-robin-quantum-stage: axisEnd 가 없다');
        if (r.procs.length === 0) throw new Error('round-robin-quantum-stage: procs 가 없다');
        const same =
          built &&
          r.axisEnd === axisEnd &&
          r.procs.length === procs.length &&
          r.procs.every((p, i) => p.id === procs[i].id && p.arrive === procs[i].arrive && p.burst === procs[i].burst);
        if (!same) {
          resetRound();
          build(r);
        }
        // 지금 토막은 앞 판 토막이 된다 — 레인마다 왼쪽부터
        const nextGhosts: SVGRectElement[][] = procs.map(() => []);
        for (const g of ghosts.flat()) g.remove();
        for (const piece of [...pieces.values()].sort((a, b) => a.from - b.from)) {
          piece.el.setAttribute('opacity', String(GHOST_OPACITY));
          nextGhosts[piece.lane].push(piece.el);
        }
        for (const g of ghostGaps) g.remove();
        for (const g of gaps) g.setAttribute('opacity', String(GHOST_OPACITY * 0.8));
        ghostGaps = gaps;
        gaps = [];
        ghosts = nextGhosts;
        pieces = new Map();
        lastPieceOfLane = procs.map(() => undefined);
        lastSource = procs.map(() => undefined);
        for (const bar of respBars) bar.setAttribute('opacity', '0.3');
        // 앞 판의 수는 새 판 계기와 섞여 읽히지 않게 비운다 — 끝 표식만 "앞 판" 표지를 달고 흐리게 남아 새 끝으로 미끄러진다
        for (const tx of respTexts) tx.textContent = '';
        for (const s of summary) s.textContent = '';
        if (prevEnd === null) {
          endLine.setAttribute('opacity', '0');
          endText.setAttribute('opacity', '0');
        } else {
          endText.textContent = t('mark.prevEnd', 'Previous end: {n}', { n: prevEnd });
          endLine.setAttribute('opacity', '0.35');
          endText.setAttribute('opacity', '0.5');
        }
        cursor.setAttribute('x1', String(xOf(0)));
        cursor.setAttribute('x2', String(xOf(0)));
        cursor.setAttribute('opacity', '0.8');
        caption.textContent = r.caption;
      },

      step(s, ms) {
        flush();
        if (!built) throw new Error('round-robin-quantum-stage: 판이 시작되지 않았다');
        caption.textContent = s.caption;
        const anims: Anim[] = [];
        // 토막 — 오름 번호(slice)마다 하나. 이미 있으면 자라고, 없으면 앞 판 토막을 끌어온다
        const spans = new Map<number, { lane: number; from: number; to: number }>();
        for (const tk of s.ticks) {
          if (tk.proc < 0 || tk.proc >= procs.length) throw new Error(`round-robin-quantum-stage: 모르는 프로세스 ${tk.proc}`);
          if (tk.kind === 'switch') {
            const x = xOf(tk.tick);
            const w = xOf(tk.tick + 1) - x;
            const src = ghostGaps.shift();
            if (src) {
              src.setAttribute('opacity', '0.35');
              anims.push({ el: src, attr: 'x', from: num(src, 'x'), to: x }, { el: src, attr: 'width', from: num(src, 'width'), to: w });
              gaps.push(src);
            } else {
              const gap = make('rect', { x, y: TOP - 4, width: 0, height: lanesBottom - TOP + 4, fill: pal.textMuted, opacity: 0.35 }, gGaps);
              anims.push({ el: gap, attr: 'width', from: 0, to: w });
              gaps.push(gap);
            }
            continue;
          }
          const span = spans.get(tk.slice);
          if (span) span.to = tk.tick + 1;
          else spans.set(tk.slice, { lane: tk.proc, from: tk.tick, to: tk.tick + 1 });
        }
        for (const [slice, span] of spans) {
          const x = xOf(span.from);
          const known = pieces.get(slice);
          if (known) {
            const w = xOf(span.to) - xOf(known.from);
            anims.push({ el: known.el, attr: 'width', from: num(known.el, 'width'), to: w });
            known.to = span.to;
            continue;
          }
          const w = xOf(span.to) - x;
          const y = laneTop(span.lane) + PIECE_Y;
          const ghost = ghosts[span.lane].shift();
          let el: SVGRectElement;
          let src: Geo;
          if (ghost) {
            el = ghost;
            src = { x: num(ghost, 'x'), w: num(ghost, 'width') };
            lastSource[span.lane] = src;
          } else {
            el = make('rect', { x, y, width: 0, height: PIECE_H, rx: 3, fill: colors[span.lane] }, gPieces);
            src = lastSource[span.lane] ?? { x, w: 0 };
          }
          el.setAttribute('opacity', '1');
          anims.push({ el, attr: 'x', from: src.x, to: x }, { el, attr: 'width', from: src.w, to: w });
          const piece: Piece = { el, lane: span.lane, from: span.from, to: span.to };
          pieces.set(slice, piece);
          lastPieceOfLane[span.lane] = piece;
        }
        // 첫 응답 막대 — 도착에서 처음 돈 틱까지
        for (const fr of s.firstRuns) {
          const bar = respBars[fr.proc];
          const label = respTexts[fr.proc];
          if (!bar || !label) throw new Error(`round-robin-quantum-stage: 모르는 프로세스 ${fr.proc}`);
          bar.setAttribute('opacity', '0.8');
          anims.push({ el: bar, attr: 'width', from: num(bar, 'width'), to: xOf(fr.tick) - xOf(fr.arrive) });
          label.setAttribute('opacity', '1');
          label.textContent = t('label.response', 'Response: {n}', { n: fr.tick - fr.arrive });
        }
        // 지금 틱
        anims.push({ el: cursor, attr: 'x1', from: num(cursor, 'x1'), to: xOf(s.to) }, { el: cursor, attr: 'x2', from: num(cursor, 'x2'), to: xOf(s.to) });
        return animate(anims, ms);
      },

      done(d, ms) {
        flush();
        if (!built) throw new Error('round-robin-quantum-stage: 판이 시작되지 않았다');
        const anims: Anim[] = [];
        const leftovers: SVGRectElement[] = [];
        // 남은 앞 판 토막은 그 레인의 마지막 토막으로 합쳐진다
        ghosts.forEach((list, lane) => {
          const into = lastPieceOfLane[lane];
          if (!into) throw new Error(`round-robin-quantum-stage: 레인 ${lane} 에 토막이 없다`);
          for (const g of list) {
            anims.push(
              { el: g, attr: 'x', from: num(g, 'x'), to: num(into.el, 'x') },
              { el: g, attr: 'width', from: num(g, 'width'), to: xOf(into.to) - xOf(into.from) },
              { el: g, attr: 'opacity', from: GHOST_OPACITY, to: 0 },
            );
            leftovers.push(g);
          }
        });
        for (const g of ghostGaps) {
          anims.push({ el: g, attr: 'width', from: num(g, 'width'), to: 0 });
          leftovers.push(g);
        }
        ghosts = procs.map(() => []);
        ghostGaps = [];
        // 끝 표식이 새 끝으로 미끄러진다
        const x = xOf(d.endTick);
        const fromX = prevEnd === null ? x : num(endLine, 'x1');
        prevEnd = d.endTick;
        endLine.setAttribute('opacity', '1');
        endText.setAttribute('opacity', '1');
        endText.textContent = t('mark.end', 'End: {n}', { n: d.endTick });
        anims.push(
          { el: endLine, attr: 'x1', from: fromX, to: x },
          { el: endLine, attr: 'x2', from: fromX, to: x },
          { el: endText, attr: 'x', from: fromX, to: x },
        );
        cursor.setAttribute('opacity', '0');
        d.summary.forEach((line, k) => {
          const slot = summary[k];
          if (!slot) throw new Error('round-robin-quantum-stage: 요약 자리가 모자란다');
          slot.textContent = line;
          slot.setAttribute('opacity', '1');
        });
        return animate(anims, ms, () => {
          for (const g of leftovers) g.remove();
        });
      },

      reset() {
        flush();
        resetRound();
        for (const bar of respBars) bar.setAttribute('width', '0');
        for (const tx of respTexts) tx.textContent = '';
        for (const s of summary) s.textContent = '';
        caption.textContent = '';
        endText.textContent = '';
        endLine.setAttribute('opacity', '0');
        prevEnd = null;
        cursor.setAttribute('opacity', '0');
      },

      destroy() {
        flush();
        for (const g of [gAxis, gLanes, gGaps, gPieces, gMarks, gText]) g.remove();
      },
    };
    return instance;
  },
};
