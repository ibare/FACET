/**
 * 비순차 실행 stage — 명령어 카드가 네 줄을 건너간다.
 *
 *   프로그램 순서 → 실행(시작한 순서) → 커밋 줄 → 빠져나감
 *
 * 첫 줄과 셋째 · 넷째 줄은 프로그램 순서 자리(I1 이 위)이고, 둘째 줄만 **시작한 순서** 자리다.
 * 그래서 앞지른 명령어는 첫 줄에서 둘째 줄로 옮겨 갈 때 **위로 올라온다.** 끝난 카드는
 * 둘째 줄에서 제 프로그램 자리로 돌아와 커밋 줄에 서고, 앞이 빠져나가야 따라 나간다.
 *
 * 아래 눈금은 박자마다 시작 칸이 폭(2) 만큼 있다. 창이 좁으면 칸이 비고, 넓히면 뒤의
 * 명령어가 올라와 칸을 메운다. 끝 표지는 판이 끝나면 앞 판의 자리에서 새 자리로 미끄러진다.
 *
 * 움직임은 rAF 로 스스로 그린다. 되짚는 중(isInstant)이면 끝 상태로 건너뛴다.
 */

import { getColors, fonts, makeTranslator } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

const SVG = 'http://www.w3.org/2000/svg';

const W = 820;
const H = 476;
const CARD_W = 156;
const CARD_H = 32;
const ROW_TOP = 50;
const ROW_PITCH = 38;
/** 네 줄의 왼쪽 x — 프로그램 순서 · 실행 · 커밋 줄 · 빠져나감. */
const COL_X = [40, 236, 432, 624] as const;
const RULER_X0 = 40;
const RULER_X1 = 780;
const RULER_LABEL_Y = 382;
const RULER_NUM_Y = 396;
const SLOT_TOP = 402;
const SLOT_AREA_H = 36;
const CAPTION_Y = 462;
const MOVE_MS = 180;

type Column = 0 | 1 | 2 | 3;

type Card = {
  g: SVGGElement;
  box: SVGRectElement;
  top: SVGTextElement;
  bottom: SVGTextElement;
  barBack: SVGRectElement;
  bar: SVGRectElement;
  ghostA: SVGRectElement;
  ghostB: SVGGElement;
  column: Column;
  overtook: boolean;
  start: number;
  latency: number;
};

type Tween = {
  from: number[];
  to: number[];
  cur: number[];
  t0: number;
  apply: (v: number[]) => void;
};

export type OutOfOrderStageSurface = {
  load(asm: string[]): void;
  beginRun(window: number, width: number, rulerCycles: number): void;
  setCycle(cycle: number, oldest: number, windowEnd: number): void;
  issue(index: number, cycle: number, rank: number, done: number, overtook: boolean): void;
  complete(index: number, cycle: number): void;
  commit(index: number, cycle: number): void;
  finish(cycles: number): void;
  setCaption(text: string): void;
};

const rowY = (k: number): number => ROW_TOP + k * ROW_PITCH;

export const outOfOrderExecutionStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };

    // ── 움직임. 한 대상에 한 tween — 새 목표가 오면 지금 자리에서 다시 출발한다.
    const tweens = new Map<object, Tween>();
    let frame: number | null = null;
    let destroyed = false;
    const hasRaf = typeof requestAnimationFrame === 'function';
    const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const ease = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);

    const tick = (): void => {
      frame = null;
      if (destroyed) return;
      const t = now();
      for (const [key, tw] of tweens) {
        const p = Math.min(1, (t - tw.t0) / MOVE_MS);
        const e = ease(p);
        tw.cur = tw.from.map((f, i) => f + (tw.to[i]! - f) * e);
        tw.apply(tw.cur);
        if (p >= 1) tweens.delete(key);
      }
      if (tweens.size > 0) frame = requestAnimationFrame(tick);
    };

    const settleAll = (): void => {
      if (frame !== null && hasRaf) cancelAnimationFrame(frame);
      frame = null;
      for (const tw of tweens.values()) tw.apply(tw.to);
      tweens.clear();
    };
    params.onScrubStart?.(settleAll);

    /** 현재 값 저장소 — tween 이 없을 때의 자리. */
    const resting = new Map<object, number[]>();
    const moveTo = (key: object, to: number[], apply: (v: number[]) => void): void => {
      const running = tweens.get(key);
      const from = running ? running.cur : (resting.get(key) ?? to);
      resting.set(key, to);
      if (!hasRaf || isInstant() || from.every((f, i) => f === to[i])) {
        tweens.delete(key);
        apply(to);
        return;
      }
      tweens.set(key, { from, to, cur: from, t0: now(), apply });
      if (frame === null) frame = requestAnimationFrame(tick);
    };

    // ── 바탕
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
    const heads: [number, string][] = [
      [COL_X[0], tr('label.program', 'Program order')],
      [COL_X[1], tr('label.execute', 'Executing (start order)')],
      [COL_X[2], tr('label.commitLine', 'Commit line')],
      [COL_X[3], tr('label.retired', 'Committed')],
    ];
    for (const [x, text] of heads) {
      const h = el('text', { x, y: 30, fill: c.textMuted, 'font-family': fonts.body, 'font-size': 12, 'font-weight': 600 }, svg);
      h.textContent = text;
    }
    // 네 줄 사이의 방향 표시 — 옅은 화살 줄기.
    for (let k = 0; k < 3; k += 1) {
      const x = COL_X[k]! + CARD_W + 6;
      const x2 = COL_X[k + 1]! - 8;
      el('line', { x1: x, y1: 26, x2, y2: 26, stroke: c.border, 'stroke-width': 1.5 }, svg);
      el('path', { d: `M ${x2 - 5} 22 L ${x2} 26 L ${x2 - 5} 30`, fill: 'none', stroke: c.border, 'stroke-width': 1.5 }, svg);
    }
    // 커밋 줄의 순서 기둥 — 위에서부터 차례로 빠져나간다.
    el('line', {
      x1: COL_X[2] - 8, y1: ROW_TOP, x2: COL_X[2] - 8, y2: rowY(7) + CARD_H,
      stroke: c.border, 'stroke-width': 2, 'stroke-dasharray': '2 4',
    }, svg);

    const ghostLayer = el('g', {}, svg);
    const bracketLayer = el('g', {}, svg);
    const cardLayer = el('g', {}, svg);

    // ── 창 괄호
    const bracket = el('rect', {
      x: COL_X[0] - 8, y: ROW_TOP - 4, width: CARD_W + 16, height: 0, rx: 7,
      fill: 'none', stroke: c.primary, 'stroke-width': 2,
    }, bracketLayer);
    const bracketLabel = el('text', {
      x: 16, y: ROW_TOP, fill: c.primary, 'font-family': fonts.body, 'font-size': 11,
      'font-weight': 600, 'text-anchor': 'middle',
    }, bracketLayer);
    const placeBracket = (oldest: number, end: number): void => {
      const top = rowY(oldest) - 4;
      const h = Math.max(0, (end - oldest) * ROW_PITCH - (ROW_PITCH - CARD_H) + 8);
      moveTo(bracket, [top, h], ([y, hh]) => {
        bracket.setAttribute('y', String(y));
        bracket.setAttribute('height', String(Math.max(0, hh!)));
        bracket.setAttribute('opacity', hh! > 1 ? '1' : '0');
        const mid = y! + hh! / 2;
        bracketLabel.setAttribute('y', String(mid));
        bracketLabel.setAttribute('transform', `rotate(-90 16 ${mid})`);
        bracketLabel.setAttribute('opacity', hh! > 1 ? '1' : '0');
      });
    };

    // ── 눈금
    const rulerLayer = el('g', {}, svg);
    const rulerLabel = el('text', {
      x: RULER_X0, y: RULER_LABEL_Y, fill: c.textMuted, 'font-family': fonts.body, 'font-size': 11, 'font-weight': 600,
    }, svg);
    rulerLabel.textContent = tr('label.cycle', 'Cycle');
    const playhead = el('rect', {
      x: RULER_X0, y: RULER_NUM_Y - 12, width: 0, height: SLOT_AREA_H + 18, rx: 4,
      fill: c.bgSubtle, stroke: c.border, opacity: 0,
    }, rulerLayer);
    const slotLayer = el('g', {}, rulerLayer);
    const endLine = el('line', {
      x1: RULER_X0, y1: RULER_NUM_Y - 14, x2: RULER_X0, y2: SLOT_TOP + SLOT_AREA_H + 4,
      stroke: c.itemSwapping, 'stroke-width': 2.5, opacity: 0,
    }, svg);
    const endLabel = el('text', {
      x: RULER_X0, y: RULER_LABEL_Y, fill: c.itemSwapping, 'font-family': fonts.body, 'font-size': 11,
      'font-weight': 700, 'text-anchor': 'middle', opacity: 0,
    }, svg);

    let rulerCycles = 0;
    let slotRows = 0;
    let cellW = 0;
    const slots: { box: SVGRectElement; text: SVGTextElement }[][] = [];
    const slotUsed: number[] = [];

    const buildRuler = (cycles: number, width: number): void => {
      if (cycles === rulerCycles && width === slotRows) return;
      rulerCycles = cycles;
      slotRows = width;
      cellW = (RULER_X1 - RULER_X0) / cycles;
      while (slotLayer.firstChild) slotLayer.removeChild(slotLayer.firstChild);
      slots.length = 0;
      const slotH = (SLOT_AREA_H - (width - 1) * 2) / width;
      for (let k = 0; k < cycles; k += 1) {
        const x = RULER_X0 + k * cellW;
        const num = el('text', {
          x: x + cellW / 2, y: RULER_NUM_Y, fill: c.textMuted, 'font-family': fonts.mono,
          'font-size': 10, 'text-anchor': 'middle',
        }, slotLayer);
        num.textContent = String(k + 1);
        const col: { box: SVGRectElement; text: SVGTextElement }[] = [];
        for (let r = 0; r < width; r += 1) {
          const y = SLOT_TOP + r * (slotH + 2);
          const box = el('rect', {
            x: x + 3, y, width: cellW - 6, height: slotH, rx: 3,
            fill: 'none', stroke: c.border, 'stroke-dasharray': '3 2',
          }, slotLayer);
          const text = el('text', {
            x: x + cellW / 2, y: y + slotH / 2 + 3.5, fill: c.stateInk, 'font-family': fonts.mono,
            'font-size': 10, 'text-anchor': 'middle',
          }, slotLayer);
          col.push({ box, text });
        }
        slots.push(col);
      }
    };

    const clearSlots = (): void => {
      slotUsed.length = 0;
      for (const col of slots) {
        for (const s of col) {
          s.box.setAttribute('fill', 'none');
          s.box.setAttribute('stroke', c.border);
          s.box.setAttribute('stroke-dasharray', '3 2');
          s.text.textContent = '';
        }
      }
    };

    // ── 캡션
    const caption = el('text', {
      x: W / 2, y: CAPTION_Y, fill: c.text, 'font-family': fonts.body, 'font-size': 13, 'text-anchor': 'middle',
    }, svg);

    // ── 카드
    const cards: Card[] = [];
    const nameOf = (i: number): string => tr('label.instr', 'I{n}', { n: i + 1 });

    const paintCard = (card: Card): void => {
      const style: Record<Column, { fill: string; ink: string; stroke: string; dash: string }> = {
        0: { fill: c.itemDefault, ink: c.text, stroke: c.border, dash: '' },
        1: { fill: c.itemActive, ink: c.stateInk, stroke: c.itemActive, dash: '' },
        2: { fill: c.bgSubtle, ink: c.text, stroke: c.textMuted, dash: '4 3' },
        3: { fill: c.itemSorted, ink: c.textInverse, stroke: c.itemSorted, dash: '' },
      };
      const s = style[card.column];
      card.box.setAttribute('fill', s.fill);
      card.box.setAttribute('stroke', card.overtook ? c.accent : s.stroke);
      card.box.setAttribute('stroke-width', card.overtook ? '3' : '1.5');
      card.box.setAttribute('stroke-dasharray', card.overtook ? '' : s.dash);
      card.top.setAttribute('fill', s.ink);
      card.bottom.setAttribute('fill', s.ink);
      const showBar = card.column === 1;
      card.barBack.setAttribute('opacity', showBar ? '0.35' : '0');
      card.bar.setAttribute('opacity', showBar ? '1' : '0');
    };

    const placeCard = (card: Card, column: Column, row: number): void => {
      card.column = column;
      paintCard(card);
      moveTo(card, [COL_X[column], rowY(row)], ([x, y]) => {
        card.g.setAttribute('transform', `translate(${x} ${y})`);
      });
    };

    const setBar = (card: Card, fraction: number): void => {
      const w = Math.max(0, Math.min(1, fraction)) * (CARD_W - 16);
      moveTo(card.bar, [w], ([ww]) => card.bar.setAttribute('width', String(Math.max(0, ww!))));
    };

    const load = (asm: string[]): void => {
      if (cards.length === asm.length && cards.every((cd, i) => cd.top.textContent?.endsWith(asm[i]!))) return;
      settleAll();
      for (const cd of cards) {
        cd.g.remove();
        cd.ghostA.remove();
        cd.ghostB.remove();
      }
      cards.length = 0;
      asm.forEach((text, i) => {
        const ghostA = el('rect', {
          x: COL_X[0], y: rowY(i), width: CARD_W, height: CARD_H, rx: 5,
          fill: 'none', stroke: c.border, 'stroke-dasharray': '3 3', opacity: 0,
        }, ghostLayer);
        const ghostB = el('g', { opacity: 0 }, ghostLayer);
        el('rect', {
          x: COL_X[1], y: 0, width: CARD_W, height: CARD_H, rx: 5,
          fill: 'none', stroke: c.border, 'stroke-dasharray': '3 3',
        }, ghostB);
        const ghostText = el('text', {
          x: COL_X[1] + 8, y: 20, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': 11,
        }, ghostB);
        ghostText.textContent = nameOf(i);

        const g = el('g', { transform: `translate(${COL_X[0]} ${rowY(i)})` }, cardLayer);
        const box = el('rect', { x: 0, y: 0, width: CARD_W, height: CARD_H, rx: 5 }, g);
        const top = el('text', { x: 8, y: 13, 'font-family': fonts.mono, 'font-size': 11 }, g);
        top.textContent = `${nameOf(i)}  ${text}`;
        const bottom = el('text', { x: 8, y: 27, 'font-family': fonts.body, 'font-size': 9.5 }, g);
        const barBack = el('rect', { x: 8, y: 17, width: CARD_W - 16, height: 3, rx: 1.5, fill: c.stateInk }, g);
        const bar = el('rect', { x: 8, y: 17, width: 0, height: 3, rx: 1.5, fill: c.stateInk }, g);
        const card: Card = {
          g, box, top, bottom, barBack, bar, ghostA, ghostB,
          column: 0, overtook: false, start: 0, latency: 1,
        };
        resting.set(card, [COL_X[0], rowY(i)]);
        cards.push(card);
      });
    };

    // mount 때 자료가 있으면 미리 그려 둔다 (러너 밖 mount 는 load 를 기다린다).
    const initial = params.initialData?.instructions;
    if (Array.isArray(initial) && initial.every((s) => typeof s === 'string')) load(initial as string[]);

    let lastEnd = 0;

    const api: OutOfOrderStageSurface = {
      load,
      beginRun(window, width, cycles) {
        buildRuler(cycles, width);
        clearSlots();
        bracketLabel.textContent = tr('label.window', 'window {w}', { w: window });
        cards.forEach((card, i) => {
          card.overtook = false;
          card.start = 0;
          card.bottom.textContent = '';
          card.ghostA.setAttribute('opacity', '0');
          card.ghostB.setAttribute('opacity', '0');
          setBar(card, 0);
          placeCard(card, 0, i);
        });
        placeBracket(0, Math.min(window, cards.length));
        playhead.setAttribute('opacity', '0');
        // 앞 판의 끝 표지는 자리에 남아 옅어진다 — 새 판이 끝나면 거기서 미끄러진다.
        const ghost = lastEnd > 0;
        endLine.setAttribute('opacity', ghost ? '0.35' : '0');
        endLine.setAttribute('stroke-dasharray', ghost ? '4 3' : '');
        endLabel.setAttribute('opacity', ghost ? '0.45' : '0');
      },
      setCycle(cycle, oldest, windowEnd) {
        placeBracket(oldest, windowEnd);
        if (cellW > 0) {
          playhead.setAttribute('opacity', '1');
          moveTo(playhead, [RULER_X0 + (cycle - 1) * cellW, cellW], ([x, w]) => {
            playhead.setAttribute('x', String(x));
            playhead.setAttribute('width', String(w));
          });
        }
        for (const card of cards) {
          if (card.column !== 1) continue;
          setBar(card, (cycle - card.start + 1) / card.latency);
        }
      },
      issue(index, cycle, rank, done, overtook) {
        const card = cards[index];
        if (!card) return;
        card.start = cycle;
        card.latency = done - cycle + 1;
        card.overtook = overtook;
        card.bottom.textContent = tr('label.startAt', 'start {c}', { c: cycle });
        card.ghostA.setAttribute('opacity', '1');
        card.ghostB.setAttribute('transform', `translate(0 ${rowY(rank)})`);
        placeCard(card, 1, rank);
        setBar(card, 1 / card.latency);
        const col = slots[cycle - 1];
        const used = slotUsed[cycle - 1] ?? 0;
        const slot = col?.[used];
        if (slot) {
          slotUsed[cycle - 1] = used + 1;
          slot.box.setAttribute('fill', overtook ? c.accent : c.itemActive);
          slot.box.setAttribute('stroke', overtook ? c.accent : c.itemActive);
          slot.box.setAttribute('stroke-dasharray', '');
          slot.text.textContent = nameOf(index);
        }
      },
      complete(index, cycle) {
        const card = cards[index];
        if (!card) return;
        card.ghostB.setAttribute('opacity', '1');
        card.bottom.textContent = tr('label.doneAt', 'done {c} · waiting', { c: cycle });
        placeCard(card, 2, index);
      },
      commit(index, cycle) {
        const card = cards[index];
        if (!card) return;
        card.bottom.textContent = tr('label.commitAt', 'commit {c}', { c: cycle });
        placeCard(card, 3, index);
      },
      finish(cycles) {
        playhead.setAttribute('opacity', '0');
        placeBracket(cards.length, cards.length);
        if (cellW <= 0) return;
        const x = RULER_X0 + cycles * cellW;
        const from = lastEnd > 0 ? RULER_X0 + lastEnd * cellW : x;
        lastEnd = cycles;
        endLine.setAttribute('opacity', '1');
        endLine.setAttribute('stroke-dasharray', '');
        endLabel.setAttribute('opacity', '1');
        endLabel.textContent = tr('label.end', 'end {n}', { n: cycles });
        resting.set(endLine, [from]);
        moveTo(endLine, [x], ([xx]) => {
          endLine.setAttribute('x1', String(xx));
          endLine.setAttribute('x2', String(xx));
          endLabel.setAttribute('x', String(xx));
        });
      },
      setCaption(text) {
        caption.textContent = text;
      },
    };

    return {
      ...api,
      destroy() {
        destroyed = true;
        if (frame !== null && hasRaf) cancelAnimationFrame(frame);
        frame = null;
        tweens.clear();
      },
    };
  },
};
