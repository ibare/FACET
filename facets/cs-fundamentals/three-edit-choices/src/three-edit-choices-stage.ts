/**
 * three-edit-choices-stage — 세 값이 비용 사다리 위에서 겨루는 그림.
 *
 * 왼쪽은 칸 넷짜리 창이다. 왼쪽 위(대각) · 위 · 왼쪽 세 이웃과, 정해질 칸.
 * 오른쪽은 비용 사다리다. 갈래마다 레인이 있고 가로줄이 값의 눈금이다.
 *
 * 걸음마다 일어나는 일은 전부 자리가 바뀌는 일이다.
 *   - 낱말 위의 표시자가 지금 만나는 두 글자로 미끄러진다.
 *   - 이웃 셋에서 값이 떠나 제 레인으로 날아가고, 비용을 더한 뒤 그 높이로
 *     내려앉는다. **낮을수록 싸다** — 이 그림의 유일한 규약이다.
 *   - 바닥에서 선이 올라와 가장 낮은 것에 닿아 멈춘다.
 *   - 이긴 값은 칸으로 올라가 앉고, 진 것은 아래로 빠진다.
 *
 * 비긴 칸은 따로 그리지 않아도 드러난다 — 두 값이 같은 높이에 나란히 선다.
 *
 * 세로는 이 파일이 갖는다. 가로는 러너가 PIECE_CANVAS_W 로 정하므로 적지 않는다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type Branch = 'delete' | 'insert' | 'diag';

export type OpenCellView = {
  i: number;
  j: number;
  rowChar: string;
  colChar: string;
  same: boolean;
  up: number;
  left: number;
  diag: number;
  levels: number;
};

export type OffersView = { del: number; ins: number; sub: number; subCost: number };
export type WeighView = { best: number; winners: Branch[] };
export type SettleView = { i: number; j: number; value: number };

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 268;
const PAD = 24;

/** 낱말 두 줄 — 어느 표의 칸을 보고 있는지 대는 자리. */
const GLYPH_W = 15;
const WORD_ROW_Y = 34;
const WORD_COL_Y = 58;

/** 칸 넷짜리 창. */
const CELL = 58;
const CELL_GAP = 8;
const BLOCK_X = 50;
const BLOCK_Y = 84;

/** 비용 사다리. 가로는 남는 폭을 버리지 않고 캔버스 오른끝까지 쓴다. */
const LADDER_X0 = 232;
const LADDER_X1 = W - PAD;
const LADDER_TOP = 58;
const LADDER_BOTTOM = 196;
const LANE_W = (LADDER_X1 - LADDER_X0) / 3;
const LANE_ENTRY_Y = 30;
const LANE_LABEL_Y = 218;
const CAPTION_Y = 248;

const CHIP_W = 46;
const CHIP_H = 26;
const BADGE_W = 26;
const BADGE_H = 18;

/** 한 프레임. 타이머로 민다 — 예약한 것을 모두 집합에 담아 destroy 에서 거둔다. */
const FRAME_MS = 16;

const FLY_MS = 300;
const SINK_MS = 230;
const STAGGER_MS = 110;
const MARK_MS = 280;
const RISE_MS = 380;
const CARRY_MS = 460;
const DROP_MS = 380;
const BOB_MS = 300;

const LANE_INDEX: Record<Branch, number> = { delete: 0, insert: 1, diag: 2 };
const BRANCH_ORDER: Branch[] = ['delete', 'insert', 'diag'];

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** initialData 를 좁히는 자리는 여기다 — mount 가 받는 유일한 경로다 (S-piece). */
type Scene = { source: string; target: string };

function readScene(data: Record<string, unknown> | undefined): Scene {
  const source = typeof data?.source === 'string' ? data.source : '';
  const target = typeof data?.target === 'string' ? data.target : '';
  return { source, target };
}

export const threeEditChoicesStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

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

    function tween(ms: number, apply: (p: number) => void): Promise<void> {
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
          const raw = Math.min(1, (Date.now() - started) / ms);
          apply(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const next = setTimeout(() => {
            timers.delete(next);
            tick();
          }, FRAME_MS);
          timers.add(next);
        };
        apply(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    function text(
      x: number,
      y: number,
      content: string,
      opts: { size?: string; fill?: string; anchor?: string; family?: string; weight?: string } = {},
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? c.text,
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = content;
      return node;
    }

    const cellX = (col: number): number => BLOCK_X + col * (CELL + CELL_GAP);
    const cellY = (row: number): number => BLOCK_Y + row * (CELL + CELL_GAP);
    const centerX = (col: number): number => cellX(col) + CELL / 2;
    const centerY = (row: number): number => cellY(row) + CELL / 2;
    const laneX = (b: Branch): number => LADDER_X0 + LANE_W * (LANE_INDEX[b] + 0.5);

    let levels = 1;
    const levelY = (v: number): number =>
      LADDER_BOTTOM - (v / levels) * (LADDER_BOTTOM - LADDER_TOP);

    // ── 층. 뒤에 그릴 것일수록 나중에 붙인다.
    const root = el('g');
    svg.appendChild(root);
    const gLanes = el('g');
    const gGrid = el('g');
    const gWords = el('g');
    const gBlock = el('g');
    const gFloor = el('g');
    const gChips = el('g');
    const gCaption = el('g');
    for (const layer of [gLanes, gGrid, gWords, gBlock, gFloor, gChips, gCaption]) {
      root.appendChild(layer);
    }

    // ── 레인. 마운트 때부터 서 있다 — 겨룸터는 겨룸보다 먼저 있다.
    const laneLabel: Record<Branch, SVGTextElement> = {
      delete: text(laneX('delete'), LANE_LABEL_Y, t('label.delete', 'delete'), { fill: c.textMuted }),
      insert: text(laneX('insert'), LANE_LABEL_Y, t('label.insert', 'insert'), { fill: c.textMuted }),
      diag: text(laneX('diag'), LANE_LABEL_Y, t('label.replace', 'replace'), { fill: c.textMuted }),
    };
    for (const b of BRANCH_ORDER) {
      gLanes.appendChild(
        el('rect', {
          x: LADDER_X0 + LANE_W * LANE_INDEX[b] + 3,
          y: LANE_ENTRY_Y,
          width: LANE_W - 6,
          height: LADDER_BOTTOM - LANE_ENTRY_Y,
          rx: 8,
          fill: c.bgSubtle,
        }),
      );
      gLanes.appendChild(laneLabel[b]);
    }
    gLanes.appendChild(
      el('line', {
        x1: LADDER_X0,
        y1: LADDER_BOTTOM,
        x2: LADDER_X1,
        y2: LADDER_BOTTOM,
        stroke: c.text,
        'stroke-width': 1.5,
      }),
    );

    // ── 낱말 두 줄. 지금 만나는 두 글자가 어디서 왔는지 댄다.
    const rowMark = el('rect', {
      x: 0,
      y: WORD_ROW_Y - 15,
      width: GLYPH_W - 2,
      height: 20,
      rx: 4,
      fill: c.accent,
      opacity: 0,
    });
    const colMark = el('rect', {
      x: 0,
      y: WORD_COL_Y - 15,
      width: GLYPH_W - 2,
      height: 20,
      rx: 4,
      fill: c.accent,
      opacity: 0,
    });
    gWords.appendChild(rowMark);
    gWords.appendChild(colMark);

    const rowGlyphs: SVGTextElement[] = [];
    const colGlyphs: SVGTextElement[] = [];
    for (let k = 0; k < scene.source.length; k += 1) {
      const glyph = text(PAD + k * GLYPH_W + (GLYPH_W - 2) / 2, WORD_ROW_Y, scene.source[k], {
        family: fonts.mono,
        size: fontSizes.md,
        fill: c.textMuted,
      });
      rowGlyphs.push(glyph);
      gWords.appendChild(glyph);
    }
    for (let k = 0; k < scene.target.length; k += 1) {
      const glyph = text(PAD + k * GLYPH_W + (GLYPH_W - 2) / 2, WORD_COL_Y, scene.target[k], {
        family: fonts.mono,
        size: fontSizes.md,
        fill: c.textMuted,
      });
      colGlyphs.push(glyph);
      gWords.appendChild(glyph);
    }
    const markX = (index: number): number => PAD + index * GLYPH_W;

    // ── 칸 넷짜리 창.
    type Slot = { box: SVGRectElement; value: SVGTextElement; tag: SVGTextElement };
    function slot(col: number, row: number, dashed: boolean): Slot {
      const box = el('rect', {
        x: cellX(col),
        y: cellY(row),
        width: CELL,
        height: CELL,
        rx: 8,
        fill: dashed ? c.bg : c.itemDefault,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      if (dashed) box.setAttribute('stroke-dasharray', '5 4');
      const value = text(centerX(col), centerY(row) + 8, '', { size: fontSizes.xl, weight: '600' });
      const tag = text(cellX(col) + CELL / 2, cellY(row) + 16, '', {
        size: fontSizes.xs,
        family: fonts.mono,
        fill: c.textMuted,
      });
      return { box, value, tag };
    }

    const slotDiag = slot(0, 0, false);
    const slotUp = slot(1, 0, false);
    const slotLeft = slot(0, 1, false);
    const gTarget = el('g');
    const slotTarget = slot(1, 1, true);
    for (const s of [slotDiag, slotUp, slotLeft]) {
      gBlock.appendChild(s.box);
      gBlock.appendChild(s.tag);
      gBlock.appendChild(s.value);
    }
    gTarget.appendChild(slotTarget.box);
    gTarget.appendChild(slotTarget.tag);
    gTarget.appendChild(slotTarget.value);
    gBlock.appendChild(gTarget);

    const letterMarkRow = el('rect', {
      x: BLOCK_X - 26,
      y: centerY(1) - 12,
      width: 22,
      height: 24,
      rx: 6,
      fill: c.accent,
      opacity: 0,
    });
    const letterMarkCol = el('rect', {
      x: centerX(1) - 11,
      y: BLOCK_Y - 28,
      width: 22,
      height: 24,
      rx: 6,
      fill: c.accent,
      opacity: 0,
    });
    const letterRow = text(BLOCK_X - 15, centerY(1) + 5, '', {
      family: fonts.mono,
      size: fontSizes.lg,
      weight: '600',
    });
    const letterCol = text(centerX(1), BLOCK_Y - 11, '', {
      family: fonts.mono,
      size: fontSizes.lg,
      weight: '600',
    });
    gBlock.appendChild(letterMarkRow);
    gBlock.appendChild(letterMarkCol);
    gBlock.appendChild(letterRow);
    gBlock.appendChild(letterCol);

    // ── 바닥에서 올라오는 선.
    const floor = el('line', {
      x1: LADDER_X0,
      y1: LADDER_BOTTOM,
      x2: LADDER_X1,
      y2: LADDER_BOTTOM,
      stroke: c.risingMarker,
      'stroke-width': 2.5,
      opacity: 0,
    });
    gFloor.appendChild(floor);

    const caption = text(W / 2, CAPTION_Y, '', { size: fontSizes.md, fill: c.text });
    gCaption.appendChild(caption);

    // ── 칩.
    type Chip = {
      g: SVGGElement;
      box: SVGRectElement;
      label: SVGTextElement;
      badge: SVGGElement;
      badgeBox: SVGRectElement;
      badgeText: SVGTextElement;
      x: number;
      y: number;
    };
    const chips = new Map<Branch, Chip>();

    function place(node: SVGGElement, x: number, y: number): void {
      node.setAttribute('transform', `translate(${x} ${y})`);
    }

    function makeChip(x: number, y: number, value: number): Chip {
      const g = el('g');
      const box = el('rect', {
        x: -CHIP_W / 2,
        y: -CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        rx: 7,
        fill: c.itemDefault,
        stroke: c.text,
        'stroke-width': 1.5,
      });
      const label = text(0, 6, String(value), { size: fontSizes.lg, weight: '600' });
      const badge = el('g', { opacity: 0 });
      const badgeBox = el('rect', {
        x: CHIP_W / 2 + 5,
        y: -BADGE_H / 2,
        width: BADGE_W,
        height: BADGE_H,
        rx: 5,
        fill: c.bgSubtle,
        stroke: c.border,
      });
      const badgeText = text(CHIP_W / 2 + 5 + BADGE_W / 2, 4, '', {
        size: fontSizes.xs,
        family: fonts.mono,
        fill: c.textMuted,
      });
      badge.appendChild(badgeBox);
      badge.appendChild(badgeText);
      g.appendChild(box);
      g.appendChild(label);
      g.appendChild(badge);
      place(g, x, y);
      gChips.appendChild(g);
      return { g, box, label, badge, badgeBox, badgeText, x, y };
    }

    function tone(chip: Chip, kind: 'rest' | 'compare' | 'win'): void {
      if (kind === 'rest') {
        chip.box.setAttribute('fill', c.itemDefault);
        chip.box.setAttribute('stroke', c.text);
        chip.label.setAttribute('fill', c.text);
        return;
      }
      if (kind === 'compare') {
        chip.box.setAttribute('fill', c.itemComparing);
        chip.box.setAttribute('stroke', c.itemComparing);
        chip.label.setAttribute('fill', c.stateInk);
        return;
      }
      chip.box.setAttribute('fill', c.itemPivot);
      chip.box.setAttribute('stroke', c.itemPivot);
      chip.label.setAttribute('fill', c.stateInk);
    }

    function moveChip(chip: Chip, toX: number, toY: number, ms: number): Promise<void> {
      const fromX = chip.x;
      const fromY = chip.y;
      chip.x = toX;
      chip.y = toY;
      return tween(ms, (p) => place(chip.g, lerp(fromX, toX, p), lerp(fromY, toY, p)));
    }

    function clearChips(): void {
      for (const chip of chips.values()) chip.g.remove();
      chips.clear();
    }

    function buildGrid(count: number): void {
      while (gGrid.firstChild) gGrid.removeChild(gGrid.firstChild);
      for (let v = 0; v <= count; v += 1) {
        gGrid.appendChild(
          el('line', {
            x1: LADDER_X0,
            y1: levelY(v),
            x2: LADDER_X1,
            y2: levelY(v),
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        gGrid.appendChild(
          text(LADDER_X0 - 9, levelY(v) + 4, String(v), {
            size: fontSizes.xs,
            family: fonts.mono,
            fill: c.textMuted,
            anchor: 'end',
          }),
        );
      }
    }

    function resetBlock(): void {
      for (const s of [slotDiag, slotUp, slotLeft, slotTarget]) {
        s.value.textContent = '';
        s.tag.textContent = '';
      }
      slotTarget.box.setAttribute('fill', c.bg);
      slotTarget.box.setAttribute('stroke', c.border);
      slotTarget.box.setAttribute('stroke-dasharray', '5 4');
      slotTarget.value.setAttribute('fill', c.text);
      place(gTarget, 0, 0);
      letterRow.textContent = '';
      letterCol.textContent = '';
      letterMarkRow.setAttribute('opacity', '0');
      letterMarkCol.setAttribute('opacity', '0');
      letterRow.setAttribute('fill', c.text);
      letterCol.setAttribute('fill', c.text);
    }

    function hideFloor(): void {
      floor.setAttribute('opacity', '0');
      floor.setAttribute('y1', String(LADDER_BOTTOM));
      floor.setAttribute('y2', String(LADDER_BOTTOM));
    }

    function clearWordMarks(): void {
      rowMark.setAttribute('opacity', '0');
      colMark.setAttribute('opacity', '0');
      for (const g of rowGlyphs) g.setAttribute('fill', c.textMuted);
      for (const g of colGlyphs) g.setAttribute('fill', c.textMuted);
    }

    let neighbour: Record<Branch, number> = { delete: 0, insert: 0, diag: 0 };
    let won: Branch[] = [];
    let rowAt = 0;
    let colAt = 0;
    place(gTarget, 0, 0);

    const instance: ViewInstance = {
      setCaption(value: string): void {
        caption.textContent = value;
      },

      async openCell(v: OpenCellView): Promise<void> {
        clearChips();
        hideFloor();
        resetBlock();
        levels = Math.max(1, v.levels);
        buildGrid(levels);
        won = [];
        neighbour = { delete: v.up, insert: v.left, diag: v.diag };

        slotDiag.value.textContent = String(v.diag);
        slotUp.value.textContent = String(v.up);
        slotLeft.value.textContent = String(v.left);
        slotDiag.tag.textContent = `(${v.i - 1},${v.j - 1})`;
        slotUp.tag.textContent = `(${v.i - 1},${v.j})`;
        slotLeft.tag.textContent = `(${v.i},${v.j - 1})`;
        slotTarget.tag.textContent = `(${v.i},${v.j})`;

        letterRow.textContent = v.rowChar;
        letterCol.textContent = v.colChar;
        laneLabel.diag.textContent = v.same
          ? t('label.keep', 'keep')
          : t('label.replace', 'replace');
        if (v.same) {
          letterMarkRow.setAttribute('opacity', '1');
          letterMarkCol.setAttribute('opacity', '1');
          letterRow.setAttribute('fill', c.stateInk);
          letterCol.setAttribute('fill', c.stateInk);
        }

        // 표시자가 지금 만나는 두 글자로 미끄러진다.
        const fromRow = rowAt;
        const fromCol = colAt;
        rowAt = Math.max(0, v.i - 1);
        colAt = Math.max(0, v.j - 1);
        rowMark.setAttribute('opacity', '1');
        colMark.setAttribute('opacity', '1');
        for (const g of rowGlyphs) g.setAttribute('fill', c.textMuted);
        for (const g of colGlyphs) g.setAttribute('fill', c.textMuted);
        if (rowGlyphs[rowAt]) rowGlyphs[rowAt].setAttribute('fill', c.stateInk);
        if (colGlyphs[colAt]) colGlyphs[colAt].setAttribute('fill', c.stateInk);
        await tween(MARK_MS, (p) => {
          rowMark.setAttribute('x', String(lerp(markX(fromRow), markX(rowAt), p)));
          colMark.setAttribute('x', String(lerp(markX(fromCol), markX(colAt), p)));
        });
      },

      async offer(v: OffersView): Promise<void> {
        const plan: Array<{ branch: Branch; from: { x: number; y: number }; to: number; cost: number }> = [
          { branch: 'delete', from: { x: centerX(1), y: centerY(0) }, to: v.del, cost: 1 },
          { branch: 'insert', from: { x: centerX(0), y: centerY(1) }, to: v.ins, cost: 1 },
          { branch: 'diag', from: { x: centerX(0), y: centerY(0) }, to: v.sub, cost: v.subCost },
        ];

        await Promise.all(
          plan.map(async (offer, order) => {
            await wait(order * STAGGER_MS);
            if (destroyed) return;
            const chip = makeChip(offer.from.x, offer.from.y, neighbour[offer.branch]);
            chips.set(offer.branch, chip);

            // 이웃을 떠나 제 레인으로.
            await moveChip(chip, laneX(offer.branch), LANE_ENTRY_Y + CHIP_H / 2 + 6, FLY_MS);

            // 제 비용을 더한다. 공짜로 오는 대각선은 여기서 드러난다.
            chip.label.textContent = String(offer.to);
            chip.badgeText.textContent = `+${offer.cost}`;
            chip.badge.setAttribute('opacity', '1');
            if (offer.cost === 0) {
              chip.badgeBox.setAttribute('fill', c.accent);
              chip.badgeBox.setAttribute('stroke', c.accent);
              chip.badgeText.setAttribute('fill', c.stateInk);
            } else {
              chip.badgeBox.setAttribute('fill', c.bgSubtle);
              chip.badgeBox.setAttribute('stroke', c.border);
              chip.badgeText.setAttribute('fill', c.textMuted);
            }

            // 값만큼 내려앉는다 — 쌀수록 낮다.
            await moveChip(chip, laneX(offer.branch), levelY(offer.to), SINK_MS);
          }),
        );
      },

      async weigh(v: WeighView): Promise<void> {
        won = v.winners.filter((b): b is Branch => chips.has(b));
        for (const chip of chips.values()) tone(chip, 'compare');
        floor.setAttribute('opacity', '1');
        await tween(RISE_MS, (p) => {
          const y = lerp(LADDER_BOTTOM, levelY(v.best), p);
          floor.setAttribute('y1', String(y));
          floor.setAttribute('y2', String(y));
        });
        for (const b of won) {
          const chip = chips.get(b);
          if (chip) tone(chip, 'win');
          laneLabel[b].setAttribute('fill', c.text);
        }
      },

      async settle(v: SettleView): Promise<void> {
        const goal = { x: centerX(1), y: centerY(1) };
        const moves: Array<Promise<void>> = [];
        for (const [branch, chip] of chips) {
          if (won.includes(branch)) {
            moves.push(moveChip(chip, goal.x, goal.y, CARRY_MS));
          } else {
            const fromY = chip.y;
            moves.push(
              tween(DROP_MS, (p) => {
                place(chip.g, chip.x, lerp(fromY, fromY + 90, p));
                chip.g.setAttribute('opacity', String(1 - p));
              }),
            );
          }
        }
        await Promise.all(moves);
        clearChips();

        slotTarget.box.setAttribute('fill', c.itemSorted);
        slotTarget.box.setAttribute('stroke', c.itemSorted);
        slotTarget.box.removeAttribute('stroke-dasharray');
        slotTarget.value.setAttribute('fill', c.textInverse);
        slotTarget.value.textContent = String(v.value);
      },

      async finish(): Promise<void> {
        // 정해진 칸이 한 번 떠올랐다 내려앉는다.
        await tween(BOB_MS, (p) => {
          const lift = Math.sin(p * Math.PI) * 7;
          place(gTarget, 0, -lift);
        });
        place(gTarget, 0, 0);
      },

      rewind(): void {
        clearChips();
        hideFloor();
        resetBlock();
        clearWordMarks();
        while (gGrid.firstChild) gGrid.removeChild(gGrid.firstChild);
        for (const b of BRANCH_ORDER) laneLabel[b].setAttribute('fill', c.textMuted);
        laneLabel.diag.textContent = t('label.replace', 'replace');
        caption.textContent = '';
        won = [];
        rowAt = 0;
        colAt = 0;
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };

    return instance;
  },
};
