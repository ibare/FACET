/**
 * prefix-suffix-jump-stage — 패턴이 제 몸을 접어 자기와 겹치는 자리를 찾는다.
 *
 * 화면은 두 층이다.
 *
 *   위   패턴 한 줄, 그 아래로 **펴진 복제** 한 줄, 그 아래 표 한 줄.
 *        복제가 오른쪽으로 한 칸씩 밀리며 겹치는 칸을 견주고, 정해진 값이
 *        패턴 칸에서 표 칸으로 떨어진다.
 *   아래 텍스트 한 줄, 그 아래를 미끄러지는 **패턴 덩어리**.
 *        어긋나면 표에서 선이 내려와 밀 거리를 말하고, 덩어리가 그만큼 날아간다.
 *        건너뛴 자리에는 가 보지 않은 자국이 남는다.
 *
 * 두 층이 같은 칸 격자를 쓴다. 위에서 민 거리와 아래에서 민 거리가 같은 자로
 * 읽혀야 "겹친 만큼만 민다" 가 한 문장이 되기 때문이다.
 *
 * 세로는 여기서 정한다 (S-piece). 가로는 러너가 `PIECE_CANVAS_W` 로 준다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 300;

/** 좌우로 남길 최소 여백. 칸 폭은 이 안에서 역산한다 (S-piece). */
const SIDE_MIN = 26;
/** 칸 폭의 상한. 못박는 값이 아니라 위쪽 한계다. */
const CELL_MAX_W = 56;
/** 칸 사이의 틈. */
const CELL_GAP = 6;
const CELL_H = 42;
const FAIL_H = 26;

const BAND_Y = 20;
const PATTERN_Y = 26;
const GHOST_Y = 78;
const FAIL_Y = 132;
const DIVIDER_Y = 172;
const TEXT_Y = 184;
const BLOCK_Y = 234;
const CAPTION_Y = 292;

// 걸음 안의 시간. 걸음 사이의 정지(stepMs)는 선언이 지고, 여기 있는 것은
// 그 걸음이 화면에서 일어나는 데 드는 시간이다.
const FRAME_MS = 16;
const SLIDE_MS = 180;
const FLASH_MS = 120;
const COMPARE_MS = 160;
const HOLD_MS = 180;
const FOLD_MS = 220;
const DROP_MS = 240;
const CHAR_MS = 160;
const LINE_MS = 240;
const JUMP_MS = 360;
const LIFT_MS = 280;

type CellState = 'default' | 'ghost' | 'compare' | 'same' | 'differ' | 'kept';

type Cell = {
  g: SVGGElement;
  rect: SVGRectElement;
  ink: SVGTextElement;
};

type Scene = { pattern: string; text: string };

/** initialData 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불린다 (S-piece). */
function readScene(raw: unknown): Scene {
  const d = (raw ?? {}) as Record<string, unknown>;
  const pattern = typeof d.pattern === 'string' ? d.pattern : '';
  const text = typeof d.text === 'string' ? d.text : '';
  if (pattern.length === 0 || text.length < pattern.length) {
    throw new Error(
      'prefix-suffix-jump-stage: initialData 에 pattern 과 그보다 짧지 않은 text 가 있어야 한다',
    );
  }
  return { pattern, text };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

export const prefixSuffixJumpStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const scene = readScene(params.initialData);
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    svg.textContent = '';

    const pattern = scene.pattern;
    const text = scene.text;
    const m = pattern.length;
    const n = text.length;

    // 격자 — 텍스트 한 줄과, 복제가 제 길이만큼 더 밀려 갈 자리를 함께 담는다.
    const cols = Math.max(n, m * 2);
    const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / cols));
    const originX = Math.round((W - cols * cellW) / 2);
    const innerW = cellW - CELL_GAP;
    const colX = (i: number): number => originX + i * cellW;
    const cellX = (i: number): number => colX(i) + CELL_GAP / 2;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 둘 다 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    function animate(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          return resolve();
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          apply(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 그림.
    const skipLayer = el('g', {});
    const linkLayer = el('g', {});
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }));
    svg.appendChild(skipLayer);

    const band = el('rect', {
      x: colX(0) + CELL_GAP / 2 - 5,
      y: BAND_Y,
      width: innerW + 10,
      height: CELL_H + 12,
      rx: 10,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
      opacity: 0,
    });
    svg.appendChild(band);

    function paint(cell: Cell, state: CellState): void {
      const skin: Record<CellState, { fill: string; stroke: string; ink: string; dash: string }> = {
        default: { fill: colors.itemDefault, stroke: colors.border, ink: colors.text, dash: '' },
        ghost: { fill: colors.bgSubtle, stroke: colors.textMuted, ink: colors.textMuted, dash: '5 3' },
        compare: { fill: colors.itemComparing, stroke: colors.itemComparing, ink: colors.stateInk, dash: '' },
        same: { fill: colors.itemPivot, stroke: colors.itemPivot, ink: colors.stateInk, dash: '' },
        differ: { fill: colors.itemSwapping, stroke: colors.itemSwapping, ink: colors.stateInk, dash: '' },
        kept: { fill: colors.itemSorted, stroke: colors.itemSorted, ink: colors.textInverse, dash: '' },
      };
      const s = skin[state];
      cell.rect.setAttribute('fill', s.fill);
      cell.rect.setAttribute('stroke', s.stroke);
      cell.rect.setAttribute('stroke-dasharray', s.dash);
      cell.ink.setAttribute('fill', s.ink);
    }

    function makeCell(parent: SVGElement, col: number, y: number, glyph: string): Cell {
      const g = el('g', {});
      const rect = el('rect', {
        x: cellX(col),
        y,
        width: innerW,
        height: CELL_H,
        rx: 7,
        'stroke-width': 1.5,
      });
      const ink = el('text', {
        x: cellX(col) + innerW / 2,
        y: y + CELL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
      });
      ink.textContent = glyph;
      g.appendChild(rect);
      g.appendChild(ink);
      parent.appendChild(g);
      const cell: Cell = { g, rect, ink };
      paint(cell, 'default');
      return cell;
    }

    // 패턴 한 줄 — 접히는 몸.
    const patternLayer = el('g', {});
    svg.appendChild(patternLayer);
    const patternCells: Cell[] = [];
    for (let i = 0; i < m; i += 1) {
      patternCells.push(makeCell(patternLayer, i, PATTERN_Y, pattern[i] ?? ''));
    }

    // 펴진 복제 — 같은 글자, 오른쪽으로 밀린다.
    const ghostGroup = el('g', { opacity: 0 });
    svg.appendChild(ghostGroup);
    const ghostCells: Cell[] = [];
    for (let i = 0; i < m; i += 1) {
      const cell = makeCell(ghostGroup, i, GHOST_Y, pattern[i] ?? '');
      paint(cell, 'ghost');
      cell.g.setAttribute('display', 'none');
      ghostCells.push(cell);
    }
    let ghostShift = 0;
    let ghostDrop = 0;
    function placeGhost(): void {
      ghostGroup.setAttribute(
        'transform',
        `translate(${ghostShift * cellW} ${ghostDrop})`,
      );
    }

    // 표 한 줄 — 자리마다 겹침 길이가 앉는다.
    const failLayer = el('g', {});
    svg.appendChild(failLayer);
    const failCells: Cell[] = [];
    for (let i = 0; i < m; i += 1) {
      const g = el('g', {});
      const rect = el('rect', {
        x: cellX(i),
        y: FAIL_Y,
        width: innerW,
        height: FAIL_H,
        rx: 5,
        fill: colors.bg,
        stroke: colors.border,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 3',
      });
      const ink = el('text', {
        x: cellX(i) + innerW / 2,
        y: FAIL_Y + FAIL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      g.appendChild(rect);
      g.appendChild(ink);
      failLayer.appendChild(g);
      failCells.push({ g, rect, ink });
    }

    function paintFail(index: number, filled: boolean, lit: boolean): void {
      const cell = failCells[index];
      if (!cell) return;
      cell.rect.setAttribute('fill', lit ? colors.itemPivot : filled ? colors.bgSubtle : colors.bg);
      cell.rect.setAttribute('stroke', lit ? colors.itemPivot : filled ? colors.border : colors.border);
      cell.rect.setAttribute('stroke-dasharray', filled || lit ? '' : '4 3');
      cell.ink.setAttribute('fill', lit ? colors.stateInk : colors.text);
    }

    svg.appendChild(
      el('line', {
        x1: colX(0),
        y1: DIVIDER_Y,
        x2: colX(n),
        y2: DIVIDER_Y,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );

    // 텍스트 한 줄.
    const textLayer = el('g', {});
    svg.appendChild(textLayer);
    const textCells: Cell[] = [];
    for (let i = 0; i < n; i += 1) {
      textCells.push(makeCell(textLayer, i, TEXT_Y, text[i] ?? ''));
    }

    svg.appendChild(linkLayer);

    // 텍스트 아래를 미끄러지는 패턴 덩어리.
    const blockGroup = el('g', { opacity: 0 });
    svg.appendChild(blockGroup);
    const blockCells: Cell[] = [];
    for (let i = 0; i < m; i += 1) {
      blockCells.push(makeCell(blockGroup, i, BLOCK_Y, pattern[i] ?? ''));
    }
    let blockAt = 0;
    let blockLift = 0;
    function placeBlock(): void {
      blockGroup.setAttribute('transform', `translate(${blockAt * cellW} ${blockLift})`);
    }

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    svg.appendChild(caption);

    function say(line: string): void {
      caption.textContent = line;
    }

    let link: SVGPathElement | null = null;
    function clearLink(): void {
      link?.remove();
      link = null;
    }

    function clearSkipMarks(): void {
      skipLayer.textContent = '';
    }

    // ── 걸음.

    async function focusPrefix(end: number): Promise<void> {
      say(t('caption.lookPrefix', 'Looking at the first {n} letters.', { n: end + 1 }));
      for (const cell of patternCells) paint(cell, 'default');
      for (let i = 0; i < m; i += 1) {
        const cell = ghostCells[i];
        if (!cell) continue;
        paint(cell, 'ghost');
        cell.g.setAttribute('display', i <= end ? 'inline' : 'none');
      }
      // 띠가 보고 있는 조각만큼 넓어지고, 그 조각의 복제가 아래로 펴진다.
      const fromW = Number(band.getAttribute('width') ?? innerW + 10);
      const toW = end * cellW + innerW + 10;
      const fromOpacity = Number(band.getAttribute('opacity') ?? 0);
      ghostShift = 0;
      const drop = GHOST_Y - PATTERN_Y;
      await animate(FOLD_MS, (p) => {
        band.setAttribute('opacity', String(lerp(fromOpacity, 1, p)));
        band.setAttribute('width', String(lerp(fromW, toW, p)));
        ghostDrop = lerp(-drop, 0, p);
        ghostGroup.setAttribute('opacity', String(p));
        placeGhost();
      });
      band.setAttribute('opacity', '1');
      ghostGroup.setAttribute('opacity', '1');
      ghostDrop = 0;
      placeGhost();
    }

    async function tryOverlap(end: number, border: number, matched: boolean): Promise<void> {
      const shift = end + 1 - border;
      const from = ghostShift;
      await animate(SLIDE_MS, (p) => {
        ghostShift = lerp(from, shift, p);
        placeGhost();
      });
      ghostShift = shift;
      placeGhost();

      if (border === 0) {
        say(t('caption.noOverlap', 'Slid all the way past — nothing overlaps.'));
        await wait(HOLD_MS);
        return;
      }

      for (let i = 0; i < border; i += 1) {
        const ghost = ghostCells[i];
        const body = patternCells[shift + i];
        if (ghost) paint(ghost, 'compare');
        if (body) paint(body, 'compare');
      }
      await wait(matched ? COMPARE_MS : FLASH_MS);

      const verdict: CellState = matched ? 'same' : 'differ';
      for (let i = 0; i < border; i += 1) {
        const ghost = ghostCells[i];
        const body = patternCells[shift + i];
        if (ghost) paint(ghost, verdict);
        if (body) paint(body, verdict);
      }
      say(
        matched
          ? t('caption.overlapSame', 'Overlap of {n}: the head and the tail are the same.', {
              n: border,
            })
          : t('caption.overlapDiffer', 'Overlap of {n}: the head and the tail differ.', {
              n: border,
            }),
      );
      await wait(matched ? HOLD_MS : FLASH_MS);

      if (!matched) {
        for (let i = 0; i < border; i += 1) {
          const ghost = ghostCells[i];
          const body = patternCells[shift + i];
          if (ghost) paint(ghost, 'ghost');
          if (body) paint(body, 'default');
        }
      }
    }

    async function setFail(index: number, value: number): Promise<void> {
      say(t('caption.tableTakes', 'The table takes {n}.', { n: value }));
      // 정해진 값이 그 자리의 패턴 칸에서 표 칸으로 떨어진다.
      const falling = el('text', {
        x: cellX(index) + innerW / 2,
        y: PATTERN_Y + CELL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      falling.textContent = String(value);
      svg.appendChild(falling);
      const fromY = PATTERN_Y + CELL_H / 2;
      const toY = FAIL_Y + FAIL_H / 2;
      await animate(DROP_MS, (p) => {
        falling.setAttribute('y', String(lerp(fromY, toY, p)));
      });
      falling.remove();
      const cell = failCells[index];
      if (cell) cell.ink.textContent = String(value);
      paintFail(index, true, false);

      // 접었던 몸을 거둔다.
      const drop = GHOST_Y - PATTERN_Y;
      await animate(FOLD_MS, (p) => {
        ghostDrop = lerp(0, -drop, p);
        ghostGroup.setAttribute('opacity', String(1 - p));
        placeGhost();
      });
      ghostGroup.setAttribute('opacity', '0');
      for (const c of patternCells) paint(c, 'default');
    }

    async function showBlock(start: number): Promise<void> {
      if (blockGroup.getAttribute('opacity') === '1') return;
      blockAt = start;
      placeBlock();
      await animate(FLASH_MS, (p) => blockGroup.setAttribute('opacity', String(p)));
      blockGroup.setAttribute('opacity', '1');
    }

    async function scanAlign(
      start: number,
      from: number,
      matched: number,
      mismatch: number,
    ): Promise<void> {
      await showBlock(start);
      for (let k = from; k < matched; k += 1) {
        const head = blockCells[k];
        const under = textCells[start + k];
        if (head) paint(head, 'compare');
        if (under) paint(under, 'compare');
        await wait(CHAR_MS);
        if (head) paint(head, 'same');
        if (under) paint(under, 'same');
      }
      if (mismatch >= 0) {
        const head = blockCells[mismatch];
        const under = textCells[start + mismatch];
        if (head) paint(head, 'differ');
        if (under) paint(under, 'differ');
        say(
          t('caption.matchedThenDiffer', '{n} letters match, then the next one differs.', {
            n: matched,
          }),
        );
      } else {
        say(t('caption.fullMatch', 'Every letter of the pattern matches.'));
      }
      await wait(HOLD_MS);
    }

    async function borrowOverlap(
      start: number,
      matched: number,
      border: number,
    ): Promise<void> {
      say(
        t('caption.borrowOverlap', 'The matched part ends with the same {n} letters it starts with.', {
          n: border,
        }),
      );
      paintFail(matched - 1, true, true);

      // 표의 그 칸에서 덩어리로 선이 내려온다 — 밀 거리를 말해 주는 자리다.
      const x1 = cellX(matched - 1) + innerW / 2;
      const y1 = FAIL_Y + FAIL_H;
      const x2 = cellX(start) + innerW / 2;
      const y2 = BLOCK_Y;
      const d = `M ${x1} ${y1} Q ${x1} ${(y1 + y2) / 2} ${(x1 + x2) / 2} ${(y1 + y2) / 2} T ${x2} ${y2}`;
      clearLink();
      link = el('path', {
        d,
        fill: 'none',
        stroke: colors.itemPivot,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      linkLayer.appendChild(link);
      const len = 400;
      link.setAttribute('stroke-dasharray', String(len));
      const drawn = link;
      await animate(LINE_MS, (p) => {
        drawn.setAttribute('stroke-dashoffset', String(len * (1 - p)));
      });
      drawn.setAttribute('stroke-dashoffset', '0');

      // 맞은 부분의 앞 조각과 뒤 조각 — 같은 것이라 겹친다.
      for (let i = 0; i < border; i += 1) {
        const head = blockCells[i];
        const tail = blockCells[matched - border + i];
        if (head) paint(head, 'same');
        if (tail) paint(tail, 'same');
      }
      await wait(HOLD_MS);
    }

    function skipMark(col: number): void {
      const g = el('g', { opacity: 0.4 });
      g.appendChild(
        el('rect', {
          x: cellX(col),
          y: BLOCK_Y,
          width: innerW,
          height: CELL_H,
          rx: 7,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        }),
      );
      g.appendChild(
        el('line', {
          x1: cellX(col) + 6,
          y1: BLOCK_Y + CELL_H - 6,
          x2: cellX(col) + innerW - 6,
          y2: BLOCK_Y + 6,
          stroke: colors.textMuted,
          'stroke-width': 1.5,
        }),
      );
      skipLayer.appendChild(g);
    }

    async function jump(
      from: number,
      to: number,
      keep: number,
      skipped: number[],
    ): Promise<void> {
      say(
        keep > 0
          ? t('caption.slideBy', 'Slide {n} and keep the overlap as already matched.', {
              n: to - from,
            })
          : t('caption.slideOne', 'Nothing matched here, so slide one.'),
      );
      // 가 보지 않을 자리에 자국을 남긴다 — 덩어리가 그 위를 지나간다.
      for (const col of skipped) skipMark(col);
      await animate(JUMP_MS, (p) => {
        blockAt = lerp(from, to, p);
        blockLift = -10 * Math.sin(p * Math.PI);
        placeBlock();
      });
      blockAt = to;
      blockLift = 0;
      placeBlock();
      clearLink();
      for (let i = 0; i < m; i += 1) {
        const cell = blockCells[i];
        if (cell) paint(cell, i < keep ? 'kept' : 'default');
      }
      for (let i = 0; i < n; i += 1) {
        const cell = textCells[i];
        if (cell) paint(cell, i >= to && i < to + keep ? 'kept' : 'default');
      }
      for (let i = 0; i < m; i += 1) paintFail(i, true, false);
      await wait(HOLD_MS);
    }

    async function found(start: number): Promise<void> {
      say(t('caption.found', 'The pattern sits at {i}.', { i: start }));
      for (let i = 0; i < m; i += 1) {
        const head = blockCells[i];
        const under = textCells[start + i];
        if (head) paint(head, 'same');
        if (under) paint(under, 'same');
      }
      await animate(LIFT_MS, (p) => {
        blockLift = -8 * Math.sin(p * Math.PI);
        placeBlock();
      });
      blockLift = 0;
      placeBlock();
      await wait(HOLD_MS);
    }

    function rewind(): void {
      say('');
      clearLink();
      clearSkipMarks();
      band.setAttribute('opacity', '0');
      band.setAttribute('width', String(innerW + 10));
      ghostShift = 0;
      ghostDrop = 0;
      ghostGroup.setAttribute('opacity', '0');
      placeGhost();
      for (let i = 0; i < m; i += 1) {
        const body = patternCells[i];
        const ghost = ghostCells[i];
        const head = blockCells[i];
        if (body) paint(body, 'default');
        if (ghost) {
          paint(ghost, 'ghost');
          ghost.g.setAttribute('display', 'none');
        }
        if (head) paint(head, 'default');
        const fail = failCells[i];
        if (fail) fail.ink.textContent = '';
        paintFail(i, false, false);
      }
      for (const cell of textCells) paint(cell, 'default');
      blockAt = 0;
      blockLift = 0;
      blockGroup.setAttribute('opacity', '0');
      placeBlock();
    }

    placeGhost();
    placeBlock();

    return {
      focusPrefix,
      tryOverlap,
      setFail,
      scanAlign,
      borrowOverlap,
      jump,
      found,
      rewind,

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
