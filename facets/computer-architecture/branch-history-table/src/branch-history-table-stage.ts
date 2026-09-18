/**
 * branch-history-table 의 stage — 표가 갈라지고, 분기가 칸을 옮겨 앉고, 바늘이 굳거나 흔들린다.
 *
 * 세 층.
 *   결과 띠   분기 열 18 칸. 지나간 칸은 또렷해지고 그 아래 ○ / ✕ 가 남는다
 *   이력      h 칸짜리 자리 이동 레지스터. 새 결과가 오른쪽에서 밀려 들어오고 가장 오래된 것이 왼쪽으로 빠진다
 *   카운터 표 2^h 칸. 칸마다 2비트 카운터를 바늘 하나로 그린다 (왼쪽 두 눈금 N, 오른쪽 두 눈금 T)
 *
 * 움직임.
 *   - 이력 길이를 바꾸면 칸이 **갈라진다**: 새 칸은 자기 부모 칸(색인의 아래 h 비트가 같은 칸)
 *     자리에서 나와 제자리로 미끄러진다. 줄이면 거꾸로 부모 칸으로 빨려 들어가 합쳐진다
 *   - 색인 표지가 걸음마다 이력이 가리키는 칸 위로 **옮겨 간다**
 *   - 바늘이 카운터 값으로 **돈다** — 무늬에서는 이력 2 부터 칸마다 한쪽으로 굳고, 무작위에서는 계속 흔들린다
 *
 * 세로는 사다리 끝값(칸 8 개 · 이력 3 칸)이 들어갈 자리를 처음부터 잡는다 (canvas-height).
 */

import { fonts, getColors, makeTranslator, type CanvasView, type ViewInstance } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 372;

// 결과 띠
const STRIP_X = 112;
const TILE_W = 30;
const TILE_GAP = 3;
const TILE_Y = 18;
const TILE_H = 24;
const MARK_Y = 60;

// 이력 레지스터
const REG_Y = 86;
const BIT_W = 34;
const BIT_H = 30;
const BIT_GAP = 6;

// 카운터 표
const TOKEN_Y = 146;
const CELL_Y = 176;
const CELL_W = 76;
const CELL_H = 124;
const CELL_GAP = 8;
const DIAL_R = 27;

const CAPTION_Y = 340;

const MOVE_MS = 380;

/** 카운터 값(0..3) → 바늘 각도. 0 도가 곧게 위다. */
function needleAngle(counter: number): number {
  return -67.5 + 45 * Math.max(0, Math.min(3, counter));
}

/** 색인을 h 자리 이진 글자로. h = 0 이면 줄표. */
function binary(value: number, bits: number): string {
  if (bits <= 0) return '—';
  return value.toString(2).padStart(bits, '0');
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** projector 가 부르는 표면. */
export type BranchHistoryTableStage = ViewInstance & {
  startRound(round: { historyBits: number; size: number; outcomes: number[]; trace: string }): void;
  lookup(step: number, index: number): void;
  resolve(step: number, index: number, taken: number, hit: boolean, counter: number): void;
  shift(taken: number, history: number): void;
  finish(): void;
  setCaption(text: string): void;
};

type Cell = {
  index: number;
  g: SVGGElement;
  frame: SVGRectElement;
  label: SVGTextElement;
  needle: SVGGElement;
  value: SVGTextElement;
  x: number;
};

type Bit = { g: SVGGElement; slot: number };

export const branchHistoryTableStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const data = params.initialData ?? {};
    const ladder = Array.isArray(data.ladder) ? (data.ladder as unknown[]).filter((x): x is number => typeof x === 'number') : [];
    const maxBits = ladder.length > 0 ? Math.max(...ladder) : 3;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    /** 새로 만든 요소의 처음 자리를 그린 뒤에 목표로 옮겨야 전이가 보인다. */
    const nextFrame = (fn: () => void): void => later(20, fn);

    const root = el('g');
    svg.appendChild(root);
    root.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }));

    // ── 결과 띠
    const stripLabel = el('text', {
      x: 16, y: TILE_Y + 16, 'font-size': 12, 'font-family': fonts.body, fill: c.textMuted,
    });
    stripLabel.textContent = tr('label.outcomes', 'Outcome');
    root.appendChild(stripLabel);
    const stripLayer = el('g');
    root.appendChild(stripLayer);
    const cursor = el('rect', {
      x: -2, y: TILE_Y - 3, width: TILE_W + 4, height: TILE_H + 6, rx: 4,
      fill: 'none', stroke: c.itemActive, 'stroke-width': 2, opacity: 0,
    });
    cursor.style.transition = `transform ${MOVE_MS}ms ease, opacity 200ms`;
    root.appendChild(cursor);
    let tiles: SVGGElement[] = [];
    let marks: SVGTextElement[] = [];

    const tileX = (i: number): number => STRIP_X + i * (TILE_W + TILE_GAP);

    // ── 이력 레지스터
    const regLabel = el('text', {
      x: 16, y: REG_Y + 20, 'font-size': 12, 'font-family': fonts.body, fill: c.textMuted,
    });
    regLabel.textContent = tr('label.history', 'History');
    root.appendChild(regLabel);
    const regLayer = el('g');
    root.appendChild(regLayer);
    const regNote = el('text', {
      x: W / 2, y: REG_Y + 20, 'text-anchor': 'middle', 'font-size': 12, 'font-family': fonts.body, fill: c.textMuted,
    });
    root.appendChild(regNote);
    let bits: Bit[] = [];
    let regBits = 0;

    const regLeft = (h: number): number => W / 2 - (h * BIT_W + Math.max(0, h - 1) * BIT_GAP) / 2;
    const slotX = (slot: number, h: number): number => regLeft(h) + slot * (BIT_W + BIT_GAP);
    const placeBit = (bit: Bit, h: number): void => {
      bit.g.style.transform = `translate(${slotX(bit.slot, h)}px, ${REG_Y}px)`;
    };
    const makeBit = (value: number, slot: number, h: number): Bit => {
      const g = el('g');
      g.style.transition = `transform ${MOVE_MS}ms ease, opacity ${MOVE_MS}ms`;
      g.appendChild(el('rect', {
        x: 0, y: 0, width: BIT_W, height: BIT_H, rx: 4, fill: c.bgSubtle, stroke: c.border,
      }));
      const t = el('text', {
        x: BIT_W / 2, y: BIT_H / 2 + 5, 'text-anchor': 'middle', 'font-size': 15,
        'font-family': fonts.mono, fill: c.text,
      });
      t.textContent = String(value);
      g.appendChild(t);
      const bit = { g, slot };
      placeBit(bit, h);
      regLayer.appendChild(g);
      return bit;
    };

    // ── 카운터 표
    const tableLabel = el('text', {
      x: 16, y: CELL_Y + 20, 'font-size': 12, 'font-family': fonts.body, fill: c.textMuted,
    });
    tableLabel.textContent = tr('label.table', 'Counters');
    root.appendChild(tableLabel);
    const cellLayer = el('g');
    root.appendChild(cellLayer);
    let cells: Cell[] = [];
    let cellBits = 0;
    const capacity = 2 ** maxBits;

    const token = el('g');
    token.style.transition = `transform ${MOVE_MS}ms ease, opacity 200ms`;
    token.appendChild(el('path', {
      d: `M ${CELL_W / 2 - 9} 0 L ${CELL_W / 2 + 9} 0 L ${CELL_W / 2} 12 Z`, fill: c.itemActive,
    }));
    const tokenText = el('text', {
      x: CELL_W / 2, y: -5, 'text-anchor': 'middle', 'font-size': 12,
      'font-family': fonts.mono, fill: c.text,
    });
    token.appendChild(tokenText);
    token.setAttribute('opacity', '0');
    root.appendChild(token);

    const rowLeft = (size: number): number => W / 2 - (size * CELL_W + (size - 1) * CELL_GAP) / 2;
    const cellX = (index: number, size: number): number => rowLeft(size) + index * (CELL_W + CELL_GAP);
    const placeCell = (cell: Cell, x: number): void => {
      cell.x = x;
      cell.g.style.transform = `translate(${x}px, ${CELL_Y}px)`;
    };
    const setNeedle = (cell: Cell, counter: number): void => {
      cell.needle.style.transform = `rotate(${needleAngle(counter)}deg)`;
      cell.value.textContent = String(counter);
    };
    const makeCell = (index: number, bitsNow: number, x: number): Cell => {
      const g = el('g', { 'data-cell': index });
      g.style.transition = `transform ${MOVE_MS}ms ease, opacity ${MOVE_MS}ms`;
      const frame = el('rect', {
        x: 0, y: 0, width: CELL_W, height: CELL_H, rx: 6, fill: c.bg, stroke: c.border, 'stroke-width': 1.5,
      });
      frame.style.transition = 'stroke 200ms';
      g.appendChild(frame);
      const label = el('text', {
        x: CELL_W / 2, y: 20, 'text-anchor': 'middle', 'font-size': 14, 'font-family': fonts.mono, fill: c.text,
      });
      label.textContent = binary(index, bitsNow);
      g.appendChild(label);
      const cx = CELL_W / 2;
      const cy = 76;
      // 반원 눈금판: 왼쪽 반 N, 오른쪽 반 T. 네 눈금이 카운터 0..3
      g.appendChild(el('path', {
        d: `M ${cx - DIAL_R} ${cy} A ${DIAL_R} ${DIAL_R} 0 0 1 ${cx} ${cy - DIAL_R}`,
        fill: 'none', stroke: c.border, 'stroke-width': 5,
      }));
      g.appendChild(el('path', {
        d: `M ${cx} ${cy - DIAL_R} A ${DIAL_R} ${DIAL_R} 0 0 1 ${cx + DIAL_R} ${cy}`,
        fill: 'none', stroke: c.textMuted, 'stroke-width': 5,
      }));
      for (let k = 0; k < 4; k += 1) {
        const a = (needleAngle(k) * Math.PI) / 180;
        g.appendChild(el('line', {
          x1: cx + Math.sin(a) * (DIAL_R + 4), y1: cy - Math.cos(a) * (DIAL_R + 4),
          x2: cx + Math.sin(a) * (DIAL_R + 9), y2: cy - Math.cos(a) * (DIAL_R + 9),
          stroke: c.textMuted, 'stroke-width': 1.5,
        }));
      }
      const nText = el('text', {
        x: cx - DIAL_R - 2, y: cy + 14, 'text-anchor': 'middle', 'font-size': 11, 'font-family': fonts.mono, fill: c.textMuted,
      });
      // 'T' · 'N' 은 분기 예측의 통용 표식이라 번역 대상이 아니다 (어셈블리 글처럼 자료 표기)
      nText.textContent = 'N';
      g.appendChild(nText);
      const tText = el('text', {
        x: cx + DIAL_R + 2, y: cy + 14, 'text-anchor': 'middle', 'font-size': 11, 'font-family': fonts.mono, fill: c.textMuted,
      });
      // 표식 상수 — 위와 같은 까닭
      tText.textContent = 'T';
      g.appendChild(tText);
      const pivot = el('g', { transform: `translate(${cx} ${cy})` });
      const needle = el('g');
      needle.style.transition = `transform ${MOVE_MS}ms cubic-bezier(.3,1.4,.6,1)`;
      needle.appendChild(el('line', { x1: 0, y1: 4, x2: 0, y2: -(DIAL_R - 3), stroke: c.text, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      pivot.appendChild(needle);
      pivot.appendChild(el('circle', { cx: 0, cy: 0, r: 4, fill: c.text }));
      g.appendChild(pivot);
      const value = el('text', {
        x: cx, y: CELL_H - 12, 'text-anchor': 'middle', 'font-size': 12, 'font-family': fonts.mono, fill: c.textMuted,
      });
      g.appendChild(value);
      const cell: Cell = { index, g, frame, label, needle, value, x };
      placeCell(cell, x);
      setNeedle(cell, 2);
      cellLayer.appendChild(g);
      return cell;
    };

    /** 이력 길이가 바뀌면 칸이 부모 자리에서 갈라져 나오거나 부모 자리로 합쳐진다. */
    const resizeTable = (bitsNow: number, size: number): void => {
      const oldSize = cells.length;
      const next: Cell[] = [];
      for (let i = 0; i < size; i += 1) {
        const kept = cells[i];
        if (kept && i < oldSize) {
          kept.label.textContent = binary(i, bitsNow);
          setNeedle(kept, 2);
          next.push(kept);
          continue;
        }
        // 부모 = 아래 cellBits 자리가 같은 옛 칸. 처음 판이면 제자리에서 나타난다.
        const parent = oldSize > 0 ? cells[i % oldSize] : undefined;
        const cell = makeCell(i, bitsNow, parent ? parent.x : cellX(i, size));
        if (parent) {
          cell.g.setAttribute('opacity', '0.4');
        }
        next.push(cell);
      }
      // 줄어들 때: 넘치는 칸은 부모 자리로 빨려 들어가 사라진다
      for (let i = size; i < oldSize; i += 1) {
        const gone = cells[i];
        if (!gone) continue;
        const parent = next[i % size];
        placeCell(gone, parent ? cellX(parent.index, size) : gone.x);
        gone.g.setAttribute('opacity', '0');
        later(MOVE_MS + 40, () => gone.g.remove());
      }
      cells = next;
      cellBits = bitsNow;
      nextFrame(() => {
        for (const cell of cells) {
          placeCell(cell, cellX(cell.index, size));
          cell.g.setAttribute('opacity', '1');
        }
      });
    };

    const resetRegister = (h: number): void => {
      for (const b of bits) b.g.remove();
      bits = [];
      regBits = h;
      for (let s = 0; s < h; s += 1) bits.push(makeBit(0, s, h));
      regNote.textContent = h === 0 ? tr('label.noHistory', '0 bits — nothing remembered') : '';
    };

    const resetStrip = (outcomes: number[]): void => {
      while (stripLayer.firstChild) stripLayer.removeChild(stripLayer.firstChild);
      tiles = [];
      marks = [];
      outcomes.forEach((o, i) => {
        const g = el('g', { opacity: 0.35 });
        g.style.transition = 'opacity 200ms';
        g.appendChild(el('rect', {
          x: tileX(i), y: TILE_Y, width: TILE_W, height: TILE_H, rx: 3,
          fill: o === 1 ? c.itemSorted : c.bg, stroke: c.border,
        }));
        const t = el('text', {
          x: tileX(i) + TILE_W / 2, y: TILE_Y + 17, 'text-anchor': 'middle', 'font-size': 13,
          'font-family': fonts.mono, fill: o === 1 ? c.textInverse : c.text,
        });
        // 표식 상수 — 결과 띠도 같은 T · N 표기를 쓴다
        t.textContent = o === 1 ? 'T' : 'N';
        g.appendChild(t);
        stripLayer.appendChild(g);
        tiles.push(g);
        const m = el('text', {
          x: tileX(i) + TILE_W / 2, y: MARK_Y, 'text-anchor': 'middle', 'font-size': 14,
          'font-family': fonts.mono, fill: c.text,
        });
        stripLayer.appendChild(m);
        marks.push(m);
      });
      cursor.setAttribute('opacity', '0');
    };

    // ── 캡션
    const caption = el('text', {
      x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'font-size': 13, 'font-family': fonts.body, fill: c.text,
    });
    root.appendChild(caption);

    const active = (index: number | null): void => {
      for (const cell of cells) {
        cell.frame.setAttribute('stroke', cell.index === index ? c.itemActive : c.border);
        cell.frame.setAttribute('stroke-width', cell.index === index ? '2.5' : '1.5');
      }
    };

    const instance: BranchHistoryTableStage = {
      startRound({ historyBits, size, outcomes }) {
        resizeTable(historyBits, Math.max(1, Math.min(capacity, size)));
        resetRegister(historyBits);
        resetStrip(outcomes);
        token.setAttribute('opacity', '0');
        active(null);
      },
      lookup(step, index) {
        cursor.style.transform = `translate(${tileX(step)}px, 0px)`;
        cursor.setAttribute('opacity', '1');
        const cell = cells[index];
        if (!cell) return;
        tokenText.textContent = binary(index, cellBits);
        token.style.transform = `translate(${cellX(index, cells.length)}px, ${TOKEN_Y}px)`;
        token.setAttribute('opacity', '1');
        active(index);
      },
      resolve(step, index, _taken, hit, counter) {
        const tile = tiles[step];
        if (tile) tile.setAttribute('opacity', '1');
        const mark = marks[step];
        if (mark) {
          mark.textContent = hit ? '○' : '✕';
          mark.setAttribute('fill', hit ? c.text : c.danger);
        }
        const cell = cells[index];
        if (!cell) return;
        setNeedle(cell, counter);
        if (!hit) {
          cell.frame.setAttribute('stroke', c.danger);
          later(MOVE_MS, () => {
            if (cell.frame.getAttribute('stroke') === c.danger) cell.frame.setAttribute('stroke', c.itemActive);
          });
        }
      },
      shift(taken, history) {
        const h = regBits;
        if (h === 0) return;
        // 가장 오래된 칸이 왼쪽으로 빠지고, 나머지가 한 칸씩 왼쪽으로, 새 결과가 오른쪽에서 들어온다
        const leaving = bits.filter((b) => b.slot === 0);
        for (const b of bits) {
          b.slot -= 1;
          placeBit(b, h);
        }
        for (const b of leaving) {
          b.g.setAttribute('opacity', '0');
          later(MOVE_MS + 40, () => b.g.remove());
        }
        bits = bits.filter((b) => b.slot >= 0);
        const incoming = makeBit(taken, h, h);
        incoming.g.setAttribute('opacity', '0');
        bits.push(incoming);
        nextFrame(() => {
          incoming.slot = h - 1;
          placeBit(incoming, h);
          incoming.g.setAttribute('opacity', '1');
        });
        // 같은 분기가 새 이력이 가리키는 칸으로 옮겨 앉는다
        tokenText.textContent = binary(history, cellBits);
        token.style.transform = `translate(${cellX(history, cells.length)}px, ${TOKEN_Y}px)`;
      },
      finish() {
        cursor.setAttribute('opacity', '0');
        token.setAttribute('opacity', '0');
        active(null);
      },
      setCaption(text) {
        caption.textContent = text;
      },
      destroy() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };
    return instance;
  },
};
