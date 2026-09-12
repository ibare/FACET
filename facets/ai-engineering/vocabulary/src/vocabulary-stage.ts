/**
 * 어휘 사전 stage — 시험 낱말 여섯을 한 줄씩 놓고, 지금 어휘가 그것을 **어디서**
 * 자르는지 보인다.
 *
 * 한 줄은 이렇게 생겼다.
 *
 *   cellular   [c][e][l][l][u][l][a][r][_]        9 ▮▮▮▮▮▮▮▮▮
 *   cellular   [cell][u][l][a][r][_]              6 ▮▮▮▮▮▮
 *
 * 글자 칸은 자리가 고정된 것이 아니다. **조각의 경계마다 틈이 벌어지므로**, 어휘가
 * 바뀌어 경계가 옮겨 가면 글자가 실제로 좌우로 미끄러진다. 합쳐지는 글자들은
 * 서로에게 다가가고, 갈라지는 글자들은 벌어진다 — 이 화면의 동사가 "옮겨 간다"
 * 이므로 그것이 자리의 움직임으로 일어나야 한다. 조각 수 막대도 그에 맞춰 늘고 준다.
 *
 * 문안은 여기 없다. 낱말 · 조각 글자 · 수는 데이터이고, 문장은 projector 가
 * `setCaption` 으로 넣는다 (C10). 화면에 새겨진 `_` 만 표식으로 둔다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 700;
const H = 320;

/** 낱말 끝 표식 `</w>` 를 화면에 새기는 글자. 도형에 각인된 것이라 표식이다 (C10). */
const END_GLYPH = '_';

const PAD = 16;
const CHIP_Y = 20;
const CHIP_H = 28;
const HEAD_RULE_Y = 64;
const ROW_TOP = 84;
const ROW_H = 34;
const BOX_H = 26;
const CELLS_X = 104;
const CELL_MAX_W = 32;
const PIECE_GAP = 11;
const COUNT_X = 500;
const COUNT_BAR_H = 8;
const CAPTION_Y = 302;
const FRAME_MS = 16;
const MOVE_MS = 380;

/** 캔버스 세로가 정해져 있으므로 담을 수 있는 줄 수도 정해져 있다 (S-view). */
const MAX_ROWS = Math.floor((CAPTION_Y - 22 - ROW_TOP - BOX_H) / ROW_H) + 1;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

type Scene = { words: string[]; endMark: string };

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이고, 좁히는 규칙이 두 벌이 되지 않는다.
 */
function readScene(initialData: ViewMountParams['initialData']): Scene {
  const data = (initialData ?? {}) as Record<string, unknown>;
  const raw = data.testWords;
  const words = Array.isArray(raw) ? raw.filter((w): w is string => typeof w === 'string') : [];
  const endMark = typeof data.endMark === 'string' ? data.endMark : '</w>';
  return { words, endMark };
}

/** 조각 하나가 원래 기호 몇 개를 삼켰는가 — 끝 표식은 길이와 무관하게 한 칸이다. */
function symbolLength(part: string, endMark: string): number {
  return part.endsWith(endMark) ? part.length - endMark.length + 1 : part.length;
}

/** 조각 열 → 각 조각이 시작하는 기호 자리. */
function startsOf(parts: readonly string[], endMark: string): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const part of parts) {
    starts.push(at);
    at += symbolLength(part, endMark);
  }
  return starts;
}

/** 부드럽게 서고 부드럽게 멎는다. */
function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

type Row = {
  word: string;
  symbols: string[];
  y: number;
  starts: number[];
  x: number[];
  countValue: number;
  group: SVGGElement;
  boxLayer: SVGGElement;
  boxes: SVGRectElement[];
  letters: SVGTextElement[];
  bar: SVGRectElement;
  count: SVGTextElement;
};

export const vocabularyStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    const scene = readScene(params.initialData);

    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      t(
        'label.aria',
        'Vocabulary visualization: six test words cut by the vocabulary learned from the chosen corpus, one row each',
      ),
    );

    const root = el('g', {});
    canvas.appendChild(root);

    // 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    const words = scene.words.slice(0, MAX_ROWS);
    const maxSymbols = words.reduce((m, w) => Math.max(m, w.length + 1), 1);
    // 폭은 캔버스에서 역산하고 상수로는 상한만 둔다.
    const span = COUNT_X - 30 - CELLS_X;
    const cellW = Math.max(
      12,
      Math.min(CELL_MAX_W, Math.floor((span - (maxSymbols - 1) * PIECE_GAP) / maxSymbols)),
    );
    const barUnit = Math.max(4, Math.floor((W - PAD - COUNT_X) / maxSymbols));

    function positions(n: number, starts: readonly number[]): number[] {
      const mark = new Set(starts);
      const out: number[] = [];
      let gaps = 0;
      for (let i = 0; i < n; i += 1) {
        if (i > 0 && mark.has(i)) gaps += 1;
        out.push(CELLS_X + i * cellW + gaps * PIECE_GAP);
      }
      return out;
    }

    // ── 머리 — 지금 고른 말뭉치
    const chipRect = el('rect', {
      x: PAD,
      y: CHIP_Y,
      width: 96,
      height: CHIP_H,
      rx: 6,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
    });
    const chipText = el('text', {
      x: PAD + 12,
      y: CHIP_Y + 19,
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    root.append(chipRect, chipText);
    root.appendChild(
      el('line', {
        x1: PAD,
        y1: HEAD_RULE_Y,
        x2: W - PAD,
        y2: HEAD_RULE_Y,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );

    // ── 줄 — 시험 낱말마다 하나
    const rows: Row[] = [];
    const rowByWord = new Map<string, Row>();
    let activeRow: Row | null = null;

    for (let r = 0; r < words.length; r += 1) {
      const word = words[r];
      const y = ROW_TOP + r * ROW_H;
      const symbols = [...word, END_GLYPH];
      const starts = symbols.map((_, i) => i);

      const group = el('g', { 'data-word': word, 'data-pieces': symbols.length });
      root.appendChild(group);

      const label = el('text', {
        x: PAD,
        y: y + 18,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      label.textContent = word;
      group.appendChild(label);

      const boxLayer = el('g', {});
      group.appendChild(boxLayer);

      const letters = symbols.map((symbol, i) => {
        const node = el('text', {
          x: 0,
          y: y + 18,
          'data-cell': i,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        node.textContent = symbol;
        group.appendChild(node);
        return node;
      });

      const bar = el('rect', {
        x: COUNT_X,
        y: y + 9,
        width: symbols.length * barUnit,
        height: COUNT_BAR_H,
        rx: 3,
        fill: colors.textMuted,
      });
      const count = el('text', {
        x: COUNT_X - 12,
        y: y + 18,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.text,
      });
      count.textContent = String(symbols.length);
      group.append(bar, count);

      const row: Row = {
        word,
        symbols,
        y,
        starts,
        x: positions(symbols.length, starts),
        countValue: symbols.length,
        group,
        boxLayer,
        boxes: [],
        letters,
        bar,
        count,
      };
      rows.push(row);
      rowByWord.set(word, row);
    }

    const caption = el('text', {
      x: PAD,
      y: CAPTION_Y,
      'data-role': 'caption',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    root.appendChild(caption);

    function strokeRow(row: Row, active: boolean): void {
      for (const box of row.boxes) {
        box.setAttribute('stroke', active ? colors.itemActive : colors.border);
        box.setAttribute('stroke-width', active ? '2' : '1');
      }
    }

    function paintRow(row: Row): void {
      for (let i = 0; i < row.letters.length; i += 1) {
        row.letters[i].setAttribute('x', String(row.x[i] + cellW / 2));
      }
      for (let k = 0; k < row.boxes.length; k += 1) {
        const from = row.starts[k];
        const to = k + 1 < row.starts.length ? row.starts[k + 1] : row.symbols.length;
        row.boxes[k].setAttribute('x', String(row.x[from] + 1));
        row.boxes[k].setAttribute('width', String(row.x[to - 1] + cellW - row.x[from] - 2));
      }
    }

    function paintCount(row: Row): void {
      row.count.textContent = String(Math.round(row.countValue));
      row.bar.setAttribute('width', String(Math.max(1, row.countValue * barUnit)));
    }

    function rebuildBoxes(row: Row, starts: number[]): void {
      while (row.boxLayer.firstChild) row.boxLayer.removeChild(row.boxLayer.firstChild);
      row.boxes = [];
      row.starts = starts;
      for (let k = 0; k < starts.length; k += 1) {
        const box = el('rect', {
          x: 0,
          y: row.y,
          width: 1,
          height: BOX_H,
          rx: 4,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1,
        });
        row.boxLayer.appendChild(box);
        row.boxes.push(box);
      }
      strokeRow(row, row === activeRow);
      paintRow(row);
    }

    for (const row of rows) rebuildBoxes(row, row.starts);

    /** 한 걸음의 움직임. destroy 가 기다리던 것을 푼다. */
    function tween(step: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          step(1);
          resolve();
          return;
        }
        const started = Date.now();
        let id: ReturnType<typeof setTimeout> | null = null;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const frame = (): void => {
          if (id !== null) timers.delete(id);
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / MOVE_MS);
          step(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          id = setTimeout(frame, FRAME_MS);
          timers.add(id);
        };
        id = setTimeout(frame, FRAME_MS);
        timers.add(id);
      });
    }

    function setCorpus(name: string): void {
      chipText.textContent = name;
      chipRect.setAttribute('width', String(Math.max(96, name.length * 8 + 24)));
      if (activeRow) {
        strokeRow(activeRow, false);
        activeRow = null;
      }
    }

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        // 캔버스 **안쪽**만 거둔다. 컨테이너를 비우면 러너가 붙여 준 캔버스가
        // 통째로 떨어져 나간다 (S-view).
        if (root.parentNode) root.parentNode.removeChild(root);
      },

      setCorpus,

      setCaption(line: string): void {
        caption.textContent = line;
      },

      cutWord(word: string, parts: string[]): Promise<void> {
        const row = rowByWord.get(word);
        if (!row) return Promise.resolve();

        if (activeRow && activeRow !== row) strokeRow(activeRow, false);
        activeRow = row;

        const starts = startsOf(parts, scene.endMark);
        const from = [...row.x];
        const to = positions(row.symbols.length, starts);
        const fromCount = row.countValue;
        const toCount = parts.length;

        // 목표 조각으로 상자를 먼저 세운다 — 자리는 아직 옛 자리라, 합쳐질 글자들을
        // 두른 채로 상자와 글자가 함께 새 자리로 미끄러진다.
        rebuildBoxes(row, starts);
        row.group.setAttribute('data-pieces', String(toCount));

        return tween((p) => {
          for (let i = 0; i < to.length; i += 1) row.x[i] = from[i] + (to[i] - from[i]) * p;
          row.countValue = fromCount + (toCount - fromCount) * p;
          paintRow(row);
          paintCount(row);
        });
      },

      reset(): void {
        setCorpus('');
        caption.textContent = '';
        for (const row of rows) {
          const starts = row.symbols.map((_, i) => i);
          row.x = positions(row.symbols.length, starts);
          row.countValue = row.symbols.length;
          rebuildBoxes(row, starts);
          row.group.setAttribute('data-pieces', String(row.symbols.length));
          paintCount(row);
        }
      },
    };
  },
};
