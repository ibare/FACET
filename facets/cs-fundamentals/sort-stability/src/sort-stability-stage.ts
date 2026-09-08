/**
 * sort-stability-stage — 정렬 안정성 조각 전용 캔버스.
 *
 * ── 화면이 하는 일
 *
 * 한 줄의 입력에서 두 줄의 결과가 **갈라져 나오고**, 그 둘이 위아래로 나란히
 * 놓인 채 **딱 한 짝에서 어긋난다.** 값만 그리면 두 줄은 구별되지 않으므로
 * (둘 다 1 1 3 3), 항목마다 "어디서 왔는가" 를 들고 있는 이름표 칩을 달고,
 * 두 결과 줄 사이에 같은 항목끼리 실을 잇는다. 나란한 실 둘, 엇갈린 실 둘 —
 * 그 교차 하나가 이 조각이 말하려는 전부다.
 *
 *   caption
 *   입력        [B|3] [A|1] [C|3] [D|1]
 *                  ╳ 항목이 실제로 자리를 옮겨 내려앉는다
 *   안정 정렬   [A|1] [D|1] [B|3] [C|3]
 *                  │  │  ╳     실 — 둘은 나란하고 한 짝은 어긋난다
 *   선택 정렬   [A|1] [D|1] [C|3] [B|3]
 *
 * ── 세로
 *
 * 마운트 뒤 바뀌지 않는다. 줄 셋 + 실 띠 한 칸이 전부라 내용으로 늘어날 곳이 없다
 * (S-view).
 *
 * ── 뒷일
 *
 * rAF 루프는 걸음마다 한 번씩 돌고 스스로 다음 회차를 예약하지 않는다. 그래도
 * 걸음 도중 destroy 되면 남으므로 `destroyed` 플래그와 id 집합으로 거둔다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 자리. 가로는 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 284;
const GUTTER = 96; // 줄 이름표 자리. 이름표는 오른쪽 정렬이라 긴 문안은 왼쪽으로 자란다
const SIDE_R = 24;
const SLOT_MAX_W = 132;
const TILE_GAP = 16;
const TILE_H = 46;

const CAPTION_Y = 24;
const ROW_INPUT_Y = 44;
const ROW_STABLE_Y = 128;
const ROW_SELECTION_Y = 222;

const CHIP_X = 8;
const CHIP_Y = 10;
const CHIP_W = 26;
const CHIP_H = 26;

const TRAVEL_MS = 520;
const TRAVEL_STAGGER_MS = 50;
const FOLD_MS = 320;
const THREAD_MS = 460;
const PULSE_MS = 520;

type StageItem = { label: string; value: number };

type Tile = {
  g: SVGGElement;
  rect: SVGRectElement;
  chip: SVGGElement;
};

type Thread = {
  path: SVGPathElement;
  label: string;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

export const sortStabilityStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    // 러너가 붙여 준 캔버스다. container 를 비우면 이 캔버스가 떨어져 나간다 (S-view).
    const svg = params.canvas;
    svg.textContent = '';

    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const rx = Number.parseFloat(radii.md);
    const chipRx = Number.parseFloat(radii.sm);

    let destroyed = false;
    const pendingFrames = new Set<number>();

    const animate = (durationMs: number, frame: (p: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          if (!destroyed) frame(1);
          resolve();
          return;
        }
        const startedAt = performance.now();
        const tick = (now: number): void => {
          if (destroyed) {
            resolve();
            return;
          }
          const p = clamp01((now - startedAt) / durationMs);
          frame(p);
          if (p < 1) {
            const next = requestAnimationFrame(tick);
            pendingFrames.add(next);
          } else {
            resolve();
          }
        };
        const id = requestAnimationFrame(tick);
        pendingFrames.add(id);
      });

    // ── 그림 층. 실은 타일 아래에 깔린다.
    const root = el('g', {});
    const slotLayer = el('g', {});
    const threadLayer = el('g', {});
    const tileLayer = el('g', {});
    svg.appendChild(root);
    root.appendChild(slotLayer);
    root.appendChild(threadLayer);
    root.appendChild(tileLayer);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(caption);

    const rowLabel = (text: string, rowY: number): SVGTextElement => {
      const node = el('text', {
        x: GUTTER - 10,
        y: rowY + TILE_H / 2 + 4,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      node.textContent = text;
      root.appendChild(node);
      return node;
    };
    rowLabel(t('label.rowInput', 'input'), ROW_INPUT_Y);
    rowLabel(t('label.rowStable', 'stable sort'), ROW_STABLE_Y);
    rowLabel(t('label.rowSelection', 'selection sort'), ROW_SELECTION_Y);

    // ── 상태
    let items: StageItem[] = [];
    let slotW = SLOT_MAX_W;
    let tileW = SLOT_MAX_W - TILE_GAP;
    let originX = GUTTER;
    let palette: readonly string[] = [];

    const sourceTiles: Tile[] = [];
    const stableTiles = new Map<string, Tile>();
    const selectionTiles = new Map<string, Tile>();
    let stableOrder: string[] = [];
    let selectionOrder: string[] = [];
    const threads: Thread[] = [];

    const colX = (col: number): number => originX + col * slotW + TILE_GAP / 2;

    const placeTile = (tile: Tile, x: number, y: number): void => {
      tile.g.setAttribute('transform', `translate(${x} ${y})`);
    };

    const makeTile = (item: StageItem, identity: number, source: boolean): Tile => {
      const g = el('g', {});
      const rect = el('rect', {
        x: 0,
        y: 0,
        width: tileW,
        height: TILE_H,
        rx,
        fill: source ? c.bgSubtle : c.itemDefault,
        stroke: c.border,
        'stroke-width': 1.4,
      });
      g.appendChild(rect);

      // 이름표 칩 — "어디서 왔는가" 를 들고 있는 유일한 표시. n 개 카테고리
      // 식별이므로 categorical 시드에서 뽑는다 (S-view 결정 트리 3).
      const chip = el('g', { transform: `translate(${CHIP_X} ${CHIP_Y})` });
      chip.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: CHIP_W,
          height: CHIP_H,
          rx: chipRx,
          fill: palette[identity] ?? c.itemDefault,
        }),
      );
      const chipText = el('text', {
        x: CHIP_W / 2,
        y: 17,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: c.stateInk,
      });
      chipText.textContent = item.label;
      chip.appendChild(chipText);
      g.appendChild(chip);

      const valueText = el('text', {
        x: (CHIP_X + CHIP_W + tileW) / 2,
        y: 31,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': 700,
        fill: c.text,
      });
      valueText.textContent = String(item.value);
      g.appendChild(valueText);

      tileLayer.appendChild(g);
      return { g, rect, chip };
    };

    const identityOf = (label: string): number =>
      items.findIndex((item) => item.label === label);

    const clearResults = (): void => {
      for (const tile of stableTiles.values()) tile.g.remove();
      for (const tile of selectionTiles.values()) tile.g.remove();
      stableTiles.clear();
      selectionTiles.clear();
      for (const thread of threads) thread.path.remove();
      threads.length = 0;
      stableOrder = [];
      selectionOrder = [];
    };

    /**
     * 두 결과 줄의 빈 자리. 처음부터 그려 둬야 "한 입력에서 두 줄이 나온다" 는
     * 짜임이 첫 프레임에 서고, 세로가 내용으로 늘어나지 않는다 (S-view).
     * 타일이 내려앉으면 같은 자리에 정확히 덮인다.
     */
    const buildSlots = (): void => {
      slotLayer.textContent = '';
      for (const rowY of [ROW_STABLE_Y, ROW_SELECTION_Y]) {
        for (let col = 0; col < items.length; col += 1) {
          slotLayer.appendChild(
            el('rect', {
              x: colX(col),
              y: rowY,
              width: tileW,
              height: TILE_H,
              rx,
              fill: 'none',
              stroke: c.border,
              'stroke-width': 1.2,
              'stroke-dasharray': '4 5',
            }),
          );
        }
      }
    };

    const buildSourceRow = (): void => {
      for (const tile of sourceTiles) tile.g.remove();
      sourceTiles.length = 0;
      items.forEach((item, index) => {
        const tile = makeTile(item, index, true);
        placeTile(tile, colX(index), ROW_INPUT_Y);
        sourceTiles.push(tile);
      });
    };

    /** 입력 줄에서 결과 줄로 옮겨 앉는다. 자리를 실제로 옮기는 것이 이 조각의 동사다. */
    const fanOut = async (
      order: string[],
      rowY: number,
      into: Map<string, Tile>,
    ): Promise<void> => {
      const moving: { tile: Tile; sx: number; dx: number; delay: number }[] = [];
      order.forEach((label, destination) => {
        const identity = identityOf(label);
        const item = items[identity];
        if (item === undefined) return;
        const tile = makeTile(item, identity, false);
        const sx = colX(identity);
        const dx = colX(destination);
        placeTile(tile, sx, ROW_INPUT_Y);
        into.set(label, tile);
        moving.push({ tile, sx, dx, delay: destination * TRAVEL_STAGGER_MS });
      });

      const total = TRAVEL_MS + TRAVEL_STAGGER_MS * Math.max(0, order.length - 1);
      await animate(total, (p) => {
        const elapsed = p * total;
        for (const m of moving) {
          const e = easeInOut(clamp01((elapsed - m.delay) / TRAVEL_MS));
          placeTile(m.tile, m.sx + (m.dx - m.sx) * e, ROW_INPUT_Y + (rowY - ROW_INPUT_Y) * e);
        }
      });
      for (const m of moving) placeTile(m.tile, m.dx, rowY);
    };

    const foldChips = (k: number): void => {
      const scale = `translate(${CHIP_X} ${CHIP_Y}) scale(${k} 1)`;
      for (const tile of stableTiles.values()) {
        tile.chip.setAttribute('transform', scale);
        tile.chip.setAttribute('opacity', String(k));
      }
      for (const tile of selectionTiles.values()) {
        tile.chip.setAttribute('transform', scale);
        tile.chip.setAttribute('opacity', String(k));
      }
    };

    const threadLength = (path: SVGPathElement, fallback: number): number => {
      try {
        const measured = path.getTotalLength();
        return Number.isFinite(measured) && measured > 0 ? measured : fallback;
      } catch {
        return fallback;
      }
    };

    const buildThreads = (): void => {
      const y1 = ROW_STABLE_Y + TILE_H;
      const y2 = ROW_SELECTION_Y;
      stableOrder.forEach((label, fromCol) => {
        const toCol = selectionOrder.indexOf(label);
        if (toCol < 0) return;
        const x1 = colX(fromCol) + tileW / 2;
        const x2 = colX(toCol) + tileW / 2;
        const path = el('path', {
          d: `M ${x1} ${y1} C ${x1} ${y1 + 20} ${x2} ${y2 - 20} ${x2} ${y2}`,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1.6,
          'stroke-linecap': 'round',
        });
        threadLayer.appendChild(path);
        threads.push({ path, label });
      });
    };

    const setCaptionText = (text: string): void => {
      caption.textContent = text;
    };

    const instance: ViewInstance = {
      setItems(next: StageItem[]): void {
        items = next.map((item) => ({ label: item.label, value: item.value }));
        palette = categorical(Math.max(1, items.length), 'vivid');
        const span = W - GUTTER - SIDE_R;
        slotW = Math.min(SLOT_MAX_W, Math.floor(span / Math.max(1, items.length)));
        tileW = slotW - TILE_GAP;
        originX = GUTTER + Math.round((span - slotW * items.length) / 2);
        clearResults();
        buildSlots();
        buildSourceRow();
      },

      setCaption(text: string): void {
        setCaptionText(text);
      },

      async sortStable(order: string[], text: string): Promise<void> {
        setCaptionText(text);
        stableOrder = order.slice();
        await fanOut(stableOrder, ROW_STABLE_Y, stableTiles);
      },

      async sortSelection(order: string[], text: string): Promise<void> {
        setCaptionText(text);
        selectionOrder = order.slice();
        await fanOut(selectionOrder, ROW_SELECTION_Y, selectionTiles);
      },

      /** 이름표를 접는다. 값만 남으면 두 결과 줄이 글자 하나 다르지 않게 같아진다. */
      async hideTags(text: string): Promise<void> {
        setCaptionText(text);
        await animate(FOLD_MS, (p) => foldChips(1 - easeInOut(p)));
        foldChips(0);
      },

      /** 이름표를 도로 펴고, 같은 항목끼리 실을 잇는다. */
      async linkOrigin(text: string): Promise<void> {
        setCaptionText(text);
        await animate(FOLD_MS, (p) => foldChips(easeInOut(p)));
        foldChips(1);

        buildThreads();
        const lengths = threads.map((thread) =>
          threadLength(thread.path, ROW_SELECTION_Y - ROW_STABLE_Y - TILE_H + slotW),
        );
        threads.forEach((thread, index) => {
          thread.path.setAttribute('stroke-dasharray', String(lengths[index]));
          thread.path.setAttribute('stroke-dashoffset', String(lengths[index]));
        });
        await animate(THREAD_MS, (p) => {
          const e = easeInOut(p);
          threads.forEach((thread, index) => {
            thread.path.setAttribute('stroke-dashoffset', String(lengths[index] * (1 - e)));
          });
        });
        for (const thread of threads) thread.path.setAttribute('stroke-dashoffset', '0');
      },

      /** 어긋난 한 짝을 짚는다. 나란한 실은 물러나고 엇갈린 실만 굵어진다. */
      async markMismatch(labels: string[], text: string): Promise<void> {
        setCaptionText(text);
        const flagged = new Set(labels);
        for (const thread of threads) {
          if (!flagged.has(thread.label)) thread.path.setAttribute('stroke', c.border);
        }
        const marked = threads.filter((thread) => flagged.has(thread.label));
        for (const thread of marked) thread.path.setAttribute('stroke', c.itemSwapping);
        const tiles = [
          ...[...stableTiles.entries()].filter(([label]) => flagged.has(label)).map(([, tile]) => tile),
          ...[...selectionTiles.entries()].filter(([label]) => flagged.has(label)).map(([, tile]) => tile),
        ];
        for (const tile of tiles) tile.rect.setAttribute('stroke', c.itemSwapping);

        await animate(PULSE_MS, (p) => {
          const width = 2.4 + 1.4 * Math.sin(p * Math.PI);
          for (const thread of marked) thread.path.setAttribute('stroke-width', String(width));
          for (const tile of tiles) tile.rect.setAttribute('stroke-width', String(width));
        });
        for (const thread of marked) thread.path.setAttribute('stroke-width', '2.4');
        for (const tile of tiles) tile.rect.setAttribute('stroke-width', '2.4');
      },

      reset(text: string): void {
        clearResults();
        setCaptionText(text);
      },

      destroy(): void {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of pendingFrames) cancelAnimationFrame(id);
        }
        pendingFrames.clear();
        root.remove();
      },
    };

    return instance;
  },
};
