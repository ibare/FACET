/**
 * open-addressing-probe-stage — 조각 전용 stage view.
 *
 * 화면의 동사는 "옆으로 밀려간다" 이므로, 이 view 의 모든 주 운동은 **위치
 * 이동**이다. 열쇠 조각(chip)이 제 자리 위에 내려앉고, 그 자리가 차 있으면
 * 한 칸씩 오른쪽으로 미끄러지며, 빈 자리를 만나면 표 안으로 떨어진다.
 * 색 전환은 "이 자리는 차 있다" 를 알리는 보조 신호로만 쓴다.
 *
 * 세로 구성 (위 → 아래)
 *   해시 줄        열쇠 · hashCode · 자리 계산 결과
 *   탐사 레인      칩이 걸어 다니는 띠. 지나온 길은 점선으로 남는다
 *   제 자리 표시   칩이 떠나도 제 자리가 어디였는지 가리키는 caret
 *   표             버킷 한 줄. 폭은 캔버스에서 역산한다 (S-piece)
 *   밀림 호        제 자리 → 앉은 자리 사이의 호. 밀려난 거리를 남긴다
 *   캡션           지금 무슨 일이 일어나는지 한 줄
 *
 * 화면 문자열은 projector 가 해석해 넘긴다 (C10). 이 view 가 스스로 쓰는
 * 글자는 데이터에서 온 열쇠 이름과 버킷 번호뿐이다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

/** 칸 폭의 상한. 실제 폭은 캔버스에서 역산한다 — 남는 폭을 여백으로 버리지 않는다. */
const CELL_MAX_W = 72;
const SIDE_MIN = 24;
const CELL_H = 46;
const CELL_GAP = 2;
const CHIP_INSET = 5;
const CHIP_H = CELL_H - CHIP_INSET * 2;

const HASH_Y = 22;
const LANE_Y = 44;
const CARET_Y = LANE_Y + CHIP_H + 6;
const TABLE_Y = 104;
const INDEX_Y = TABLE_Y + CELL_H + 15;
const ARC_Y = INDEX_Y + 10;
const ARC_DEPTH = 13;
const CAPTION_Y = 212;
const STAGE_H = 228;

const FRAME_PAD = 7;

/** initialData 가 없는 자리에서 mount 될 때의 버킷 수. */
const FALLBACK_SIZE = 8;

const MS_ARRIVE = 180;
const MS_BLOCK_FLASH = 140;
const MS_SLIDE = 220;
const MS_DROP = 220;
const MS_SETTLE = 180;
const MS_SPILL = 240;

const EASE_WALK = 'cubic-bezier(0.35, 0.05, 0.25, 1)';
const EASE_DROP = 'cubic-bezier(0.4, 0, 0.6, 1)';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export const openAddressingProbeStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const init = (params.initialData ?? {}) as { size?: unknown };
    const size =
      typeof init.size === 'number' && init.size > 0 ? Math.floor(init.size) : FALLBACK_SIZE;

    // 칸 폭은 캔버스 폭에서 역산하고 상수는 상한만 둔다 (S-piece).
    const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / size));
    const tableW = cellW * size;
    const originX = Math.round((W - tableW) / 2);
    const cellX = (i: number): number => originX + i * cellW;
    const cellCx = (i: number): number => cellX(i) + cellW / 2;
    const chipW = cellW - CELL_GAP - CHIP_INSET * 2;
    const chipX = (i: number): number => cellX(i) + CELL_GAP / 2 + CHIP_INSET;

    const canvas = params.canvas;
    canvas.setAttribute('viewBox', `0 0 ${W} ${STAGE_H}`);
    canvas.style.fontFamily = fonts.body;

    // 레이어 순서: 프레임 → 밀림 호 → 표 → caret → 탐사 자취 → 칩 → 글
    const frameG = svgEl('g');
    const arcsG = svgEl('g');
    const tableG = svgEl('g');
    const caretG = svgEl('g');
    const trailG = svgEl('g');
    const chipG = svgEl('g');
    const textG = svgEl('g');
    canvas.append(frameG, arcsG, tableG, caretG, trailG, chipG, textG);

    // ── 표 안에서만 해결한다는 것을 마지막에 말하는 테두리
    const frame = svgEl('rect', {
      x: originX - FRAME_PAD,
      y: TABLE_Y - FRAME_PAD,
      width: tableW + FRAME_PAD * 2,
      height: CELL_H + FRAME_PAD * 2,
      rx: 10,
      fill: 'none',
      'stroke-width': 1.5,
      'stroke-dasharray': '6 5',
    });
    frame.style.stroke = colors.text;
    frame.style.opacity = '0';
    frameG.appendChild(frame);

    // ── 표
    type Cell = { rect: SVGRectElement; label: SVGTextElement };
    const cells: Cell[] = [];
    for (let i = 0; i < size; i += 1) {
      const rect = svgEl('rect', {
        x: cellX(i) + CELL_GAP / 2,
        y: TABLE_Y,
        width: cellW - CELL_GAP,
        height: CELL_H,
        rx: 7,
        'stroke-width': 1.5,
      });
      const label = svgEl('text', {
        x: cellCx(i),
        y: TABLE_Y + CELL_H / 2 + 5,
        'text-anchor': 'middle',
      });
      label.style.fontFamily = fonts.mono;
      label.style.fontSize = fontSizes.sm;
      label.style.fontWeight = '600';
      const idx = svgEl('text', {
        x: cellCx(i),
        y: INDEX_Y,
        'text-anchor': 'middle',
      });
      idx.style.fontFamily = fonts.mono;
      idx.style.fontSize = fontSizes.xs;
      idx.style.fill = colors.textMuted;
      idx.textContent = String(i);
      tableG.append(rect, label, idx);
      cells.push({ rect, label });
    }

    // ── 제 자리 caret (칩이 떠나도 남아 어디서 출발했는지 가리킨다)
    const caret = svgEl('polygon', { points: '0,0 14,0 7,9' });
    caret.style.fill = colors.auxCursor;
    caret.style.opacity = '0';
    caretG.appendChild(caret);

    // ── 탐사 자취
    const trail = svgEl('line', {
      y1: LANE_Y + CHIP_H / 2,
      y2: LANE_Y + CHIP_H / 2,
      'stroke-width': 2,
      'stroke-dasharray': '4 5',
      'stroke-linecap': 'round',
    });
    trail.style.stroke = colors.ghostOutline;
    trail.style.opacity = '0';
    trailG.appendChild(trail);

    // ── 글 두 줄
    const hashLine = svgEl('text', { x: W / 2, y: HASH_Y, 'text-anchor': 'middle' });
    hashLine.style.fontFamily = fonts.mono;
    hashLine.style.fontSize = fontSizes.sm;
    hashLine.style.fill = colors.textMuted;
    const caption = svgEl('text', { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle' });
    caption.style.fontFamily = fonts.body;
    caption.style.fontSize = fontSizes.md;
    caption.style.fill = colors.text;
    textG.append(hashLine, caption);

    // ── 상태
    let chip: { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement } | null = null;
    const arcs = new Map<string, { path: SVGPathElement; head: SVGPolygonElement }>();
    let destroyed = false;
    const timers = new Set<number>();

    /**
     * 기다리다 만 것을 깨우는 자리. 타이머·프레임을 거두는 것만으로는 모자란다 —
     * 취소된 tick 은 아예 불리지 않아 promise 를 풀 길이 사라지고, projector 가
     * 그것을 기다리므로 `await ctx.emit` 이 영영 돌아오지 않는다 (S-view).
     */
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise((res) => {
        if (destroyed) {
          res();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          res();
        };
        waiters.add(finish);
        const id = window.setTimeout(() => {
          timers.delete(id);
          finish();
        }, Math.max(0, ms));
        timers.add(id);
      });
    }

    function nextFrame(): Promise<void> {
      if (typeof requestAnimationFrame === 'function') {
        return new Promise((res) => {
          if (destroyed) {
            res();
            return;
          }
          const finish = (): void => {
            waiters.delete(finish);
            res();
          };
          waiters.add(finish);
          requestAnimationFrame(() => finish());
        });
      }
      return wait(16);
    }

    function paintCellEmpty(cell: Cell): void {
      cell.rect.style.transition = '';
      cell.rect.style.fill = colors.bg;
      cell.rect.style.stroke = colors.border;
      cell.label.style.transition = '';
      cell.label.style.fill = colors.text;
      cell.label.textContent = '';
    }

    function paintCellFilled(cell: Cell): void {
      cell.rect.style.fill = colors.bgSubtle;
      cell.rect.style.stroke = colors.text;
      cell.label.style.fill = colors.text;
    }

    function makeChip(slot: number, key: string): void {
      if (chip) chip.g.remove();
      const g = svgEl('g');
      const rect = svgEl('rect', {
        x: 0,
        y: 0,
        width: chipW,
        height: CHIP_H,
        rx: 7,
      });
      rect.style.fill = colors.itemActive;
      const label = svgEl('text', {
        x: chipW / 2,
        y: CHIP_H / 2 + 5,
        'text-anchor': 'middle',
      });
      label.style.fontFamily = fonts.mono;
      label.style.fontSize = fontSizes.sm;
      label.style.fontWeight = '600';
      label.style.fill = colors.stateInk;
      label.textContent = key;
      g.append(rect, label);
      g.setAttribute('transform', `translate(${chipX(slot)}, ${LANE_Y})`);
      chipG.appendChild(g);
      chip = { g, rect, label };
    }

    function placeCaret(slot: number): void {
      caret.setAttribute('transform', `translate(${cellCx(slot) - 7}, ${CARET_Y})`);
      caret.style.opacity = '1';
    }

    function drawArc(key: string, home: number, slot: number): void {
      const x1 = cellCx(home);
      const x2 = cellCx(slot);
      const path = svgEl('path', {
        d: `M ${x1} ${ARC_Y} Q ${(x1 + x2) / 2} ${ARC_Y + ARC_DEPTH * 2} ${x2} ${ARC_Y}`,
        fill: 'none',
        'stroke-width': 1.5,
      });
      path.style.stroke = colors.textMuted;
      path.style.opacity = '0.6';
      const head = svgEl('polygon', {
        points: `${x2 - 4},${ARC_Y + 6} ${x2 + 4},${ARC_Y + 6} ${x2},${ARC_Y - 1}`,
      });
      head.style.fill = colors.textMuted;
      head.style.opacity = '0.6';
      arcsG.append(path, head);
      arcs.set(key, { path, head });
    }

    function clearAll(): void {
      for (const cell of cells) paintCellEmpty(cell);
      if (chip) {
        chip.g.remove();
        chip = null;
      }
      for (const { path, head } of arcs.values()) {
        path.remove();
        head.remove();
      }
      arcs.clear();
      caret.style.opacity = '0';
      trail.style.opacity = '0';
      frame.style.transition = '';
      frame.style.opacity = '0';
      hashLine.textContent = '';
      caption.textContent = '';
    }

    clearAll();

    return {
      destroy() {
        destroyed = true;
        for (const id of timers) window.clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.replaceChildren();
      },

      /** 빈 표로 되돌린다. */
      reset(): void {
        clearAll();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 열쇠가 제 자리 위로 내려앉는다. */
      async arrive(v: { key: string; home: number; hashLine: string }): Promise<void> {
        if (destroyed) return;
        hashLine.textContent = v.hashLine;
        placeCaret(v.home);
        trail.setAttribute('x1', String(cellCx(v.home)));
        trail.setAttribute('x2', String(cellCx(v.home)));
        trail.style.opacity = '0';

        makeChip(v.home, v.key);
        const g = chip?.g;
        if (!g) return;
        g.style.opacity = '0';
        g.setAttribute('transform', `translate(${chipX(v.home)}, ${LANE_Y - 20})`);
        await nextFrame();
        g.style.transition = `transform ${MS_ARRIVE}ms ${EASE_DROP}, opacity ${MS_ARRIVE}ms ease-out`;
        g.setAttribute('transform', `translate(${chipX(v.home)}, ${LANE_Y})`);
        g.style.opacity = '1';
        await wait(MS_ARRIVE);
        g.style.transition = '';
      },

      /** 자리가 차 있다 → 한 칸 옆으로 밀려간다. */
      async probe(v: { from: number; to: number }): Promise<void> {
        if (destroyed) return;
        const blocked = cells[v.from];
        if (blocked) {
          blocked.rect.style.transition = `fill ${MS_BLOCK_FLASH}ms ease-out`;
          blocked.rect.style.fill = colors.itemComparing;
          blocked.label.style.transition = `fill ${MS_BLOCK_FLASH}ms ease-out`;
          blocked.label.style.fill = colors.stateInk;
        }
        await wait(MS_BLOCK_FLASH);
        if (destroyed) return;

        // 지나갈 길을 먼저 깔고, 칩이 그 위를 걸어간다.
        trail.style.opacity = '1';
        trail.setAttribute('x2', String(cellCx(v.to)));

        const g = chip?.g;
        if (g) {
          g.style.transition = `transform ${MS_SLIDE}ms ${EASE_WALK}`;
          g.setAttribute('transform', `translate(${chipX(v.to)}, ${LANE_Y})`);
        }
        await wait(MS_SLIDE);
        if (destroyed) return;
        if (g) g.style.transition = '';
        if (blocked) {
          blocked.rect.style.transition = `fill ${MS_SETTLE}ms ease-out`;
          blocked.label.style.transition = `fill ${MS_SETTLE}ms ease-out`;
          paintCellFilled(blocked);
        }
      },

      /** 빈 자리를 만나 표 안으로 떨어진다. */
      async seat(v: { key: string; home: number; slot: number }): Promise<void> {
        if (destroyed) return;
        const cell = cells[v.slot];
        const g = chip?.g;
        if (g) {
          g.style.transition = `transform ${MS_DROP}ms ${EASE_DROP}`;
          g.setAttribute('transform', `translate(${chipX(v.slot)}, ${TABLE_Y + CHIP_INSET})`);
          await wait(MS_DROP);
        }
        if (destroyed) return;

        if (cell) {
          cell.label.textContent = v.key;
          cell.rect.style.transition = '';
          cell.label.style.transition = '';
          cell.rect.style.fill = colors.itemActive;
          cell.rect.style.stroke = colors.itemActive;
          cell.label.style.fill = colors.stateInk;
        }
        if (chip) {
          chip.g.remove();
          chip = null;
        }
        caret.style.opacity = '0';
        trail.style.opacity = '0';

        // 제 자리가 아니면 밀려난 거리를 표 아래에 남긴다.
        if (v.slot !== v.home) drawArc(v.key, v.home, v.slot);

        await nextFrame();
        if (destroyed || !cell) return;
        cell.rect.style.transition = `fill ${MS_SETTLE}ms ease-out, stroke ${MS_SETTLE}ms ease-out`;
        cell.label.style.transition = `fill ${MS_SETTLE}ms ease-out`;
        paintCellFilled(cell);
        await wait(MS_SETTLE);
      },

      /** 남의 충돌이 번진 자리를 짚는다. */
      async spill(v: { key: string }): Promise<void> {
        if (destroyed) return;
        const arc = arcs.get(v.key);
        if (!arc) return;
        arc.path.style.transition = `stroke ${MS_SPILL}ms ease-out, opacity ${MS_SPILL}ms ease-out`;
        arc.head.style.transition = `fill ${MS_SPILL}ms ease-out, opacity ${MS_SPILL}ms ease-out`;
        arc.path.setAttribute('stroke-width', '2.5');
        arc.path.style.stroke = colors.itemComparing;
        arc.path.style.opacity = '1';
        arc.head.style.fill = colors.itemComparing;
        arc.head.style.opacity = '1';
        await wait(MS_SPILL);
      },

      /** 전부 표 안에 들어갔다 — 테두리로 그 사실을 말한다. */
      async finish(): Promise<void> {
        if (destroyed) return;
        await nextFrame();
        frame.style.transition = `opacity ${MS_SETTLE}ms ease-out`;
        frame.style.opacity = '0.55';
        await wait(MS_SETTLE);
      },
    };
  },
};
