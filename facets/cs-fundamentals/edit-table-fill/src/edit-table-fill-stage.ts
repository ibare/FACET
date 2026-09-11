/**
 * edit-table-fill-stage — 값이 왼쪽 위에서 오른쪽 아래로 번져 나가는 표.
 *
 * 칸이 그냥 나타나지 않는다. 걸음마다 이웃 셋에 테를 두르고, 값을 실은 칩이
 * 이긴 이웃에서 목적지 칸까지 **날아가** 내려앉은 뒤에야 그 칸에 수가 선다.
 * 반대각선을 훑는 물결선이 그 위를 함께 쓸고 지나간다.
 *
 * 좌표는 캔버스에서 역산한다 — 선언에는 낱말 둘뿐이다 (S-piece).
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

/** 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산해 그 폭을 채운다 (S-piece). */
const CELL_MAX_W = 62;
const SIDE_MIN = 20;
const CELL_RATIO = 0.6;
const MIN_CELL_H = 28;
const TOP_PAD = 12;
/** 캡션 한 줄이 앉을 아래쪽 띠. */
const CAPTION_BAND = 42;
/** 칩이 이웃에서 목적지까지 날아가는 시간. */
const ANIM_MS = 360;
/** 마지막 칸이 부풀었다 가라앉는 시간. */
const POP_MS = 190;
/**
 * 선언 초기값. 낱말 길이에 따라 mount 에서 한 번 다시 재고, 그 뒤로는 바꾸지
 * 않는다 (S-view).
 */
const BASE_H = 350;

/** clipPath id 충돌 방지 — 한 글에 조각이 여럿 박힐 수 있다. */
let uid = 0;

type CellFrom = 'origin' | 'up' | 'left' | 'diag';
type WaveCell = { i: number; j: number; value: number; cost: number; from: CellFrom };
type Wave = { k: number; cells: WaveCell[] };
type FinalCell = { i: number; j: number; value: number };
type Scene = { source: string; target: string };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, v] of Object.entries(attrs)) node.setAttribute(key, String(v));
  return node;
}

/** initialData 를 이 그림이 쓰는 만큼만 좁힌다. 좁히는 자리는 mount 하나다 (C9). */
function readScene(initialData: ViewMountParams['initialData']): Scene {
  if (typeof initialData !== 'object' || initialData === null) return { source: '', target: '' };
  const d = initialData as Record<string, unknown>;
  return {
    source: typeof d.source === 'string' ? d.source : '',
    target: typeof d.target === 'string' ? d.target : '',
  };
}

export const editTableFillStageView: CanvasView = {
  canvas: { height: BASE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);

    const dataRows = scene.source.length + 1;
    const dataCols = scene.target.length + 1;
    const cols = dataCols + 1; // 글자 머리 열 하나
    const rows = dataRows + 1; // 글자 머리 행 하나

    const cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / cols));
    const cellH = Math.max(MIN_CELL_H, Math.round(cellW * CELL_RATIO));
    const originX = Math.round((PIECE_CANVAS_W - cols * cellW) / 2);
    const height = TOP_PAD + rows * cellH + CAPTION_BAND;
    svg.setAttribute('viewBox', `0 0 ${PIECE_CANVAS_W} ${height}`);

    const cx = (j: number): number => originX + (j + 1) * cellW + cellW / 2;
    const cy = (i: number): number => TOP_PAD + (i + 1) * cellH + cellH / 2;

    // ── 물결선이 표 밖으로 삐져나가지 않게 가둔다.
    const clipId = `edit-table-fill-wave-${(uid += 1)}`;
    const defs = el('defs', {});
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(
      el('rect', {
        x: originX + cellW,
        y: TOP_PAD + cellH,
        width: dataCols * cellW,
        height: dataRows * cellH,
      }),
    );
    defs.appendChild(clip);
    svg.appendChild(defs);

    const gridLayer = el('g', {});
    const waveLayer = el('g', { 'clip-path': `url(#${clipId})` });
    const valueLayer = el('g', {});
    const chipLayer = el('g', {});
    svg.appendChild(gridLayer);
    svg.appendChild(waveLayer);
    svg.appendChild(valueLayer);
    svg.appendChild(chipLayer);

    // ── 낱말 글자. 데이터에서 온 글자라 문안이 아니다.
    for (let j = 1; j < dataCols; j += 1) {
      const letter = el('text', {
        x: cx(j),
        y: TOP_PAD + cellH / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
      letter.textContent = scene.target[j - 1];
      gridLayer.appendChild(letter);
    }
    for (let i = 1; i < dataRows; i += 1) {
      const letter = el('text', {
        x: originX + cellW / 2,
        y: cy(i),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
      letter.textContent = scene.source[i - 1];
      gridLayer.appendChild(letter);
    }

    // ── 칸과 수.
    const tiles: SVGRectElement[][] = [];
    const numbers: SVGTextElement[][] = [];
    for (let i = 0; i < dataRows; i += 1) {
      const tileRow: SVGRectElement[] = [];
      const numberRow: SVGTextElement[] = [];
      for (let j = 0; j < dataCols; j += 1) {
        const tile = el('rect', {
          x: cx(j) - cellW / 2 + 2,
          y: cy(i) - cellH / 2 + 2,
          width: cellW - 4,
          height: cellH - 4,
          rx: 6,
          fill: colors.bgSubtle,
          'fill-opacity': 1,
          stroke: colors.border,
          'stroke-width': 1,
        });
        tile.style.transition =
          `fill 240ms ease, fill-opacity 240ms ease, stroke 140ms linear, transform ${POP_MS}ms ease-out`;
        tile.style.setProperty('transform-box', 'fill-box');
        tile.style.setProperty('transform-origin', 'center');
        gridLayer.appendChild(tile);

        const number = el('text', {
          x: cx(j),
          y: cy(i),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        });
        number.style.opacity = '0';
        number.style.transition = 'opacity 150ms linear';
        valueLayer.appendChild(number);

        tileRow.push(tile);
        numberRow.push(number);
      }
      tiles.push(tileRow);
      numbers.push(numberRow);
    }

    // ── 반대각선 물결선. 칸 하나 폭만큼 오른쪽으로 밀며 표를 쓸고 지나간다.
    const span = Math.max(dataRows, dataCols) + 1;
    const waveLine = el('line', {
      x1: cx(0) + span * cellW,
      y1: cy(0) - span * cellH,
      x2: cx(0) - span * cellW,
      y2: cy(0) + span * cellH,
      stroke: colors.auxCursor,
      'stroke-width': 2,
      'stroke-dasharray': '5 6',
      'stroke-linecap': 'round',
    });
    waveLine.style.opacity = '0';
    waveLine.style.transform = 'translate(0px, 0px)';
    waveLine.style.transition = `transform ${ANIM_MS}ms ease-out, opacity 220ms linear`;
    waveLayer.appendChild(waveLine);

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: TOP_PAD + rows * cellH + CAPTION_BAND / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      fill: colors.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    svg.appendChild(caption);

    // ── 기다림. 걸어 둔 것은 집합에 담아 destroy 에서 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

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

    /** 방금 내려앉아 강조 중인 칸들. 다음 걸음이 시작될 때 가라앉힌다. */
    let landed: WaveCell[] = [];
    /** 이웃임을 표시해 둔 칸들. */
    const marked = new Set<SVGRectElement>();

    const tileAt = (i: number, j: number): SVGRectElement | null =>
      i >= 0 && i < dataRows && j >= 0 && j < dataCols ? tiles[i][j] : null;
    const numberAt = (i: number, j: number): SVGTextElement | null =>
      i >= 0 && i < dataRows && j >= 0 && j < dataCols ? numbers[i][j] : null;

    function sourceOf(cell: WaveCell): { i: number; j: number } {
      if (cell.from === 'up') return { i: cell.i - 1, j: cell.j };
      if (cell.from === 'left') return { i: cell.i, j: cell.j - 1 };
      return { i: cell.i - 1, j: cell.j - 1 };
    }

    function markNeighbors(cell: WaveCell): void {
      const candidates = [
        { i: cell.i - 1, j: cell.j },
        { i: cell.i, j: cell.j - 1 },
        { i: cell.i - 1, j: cell.j - 1 },
      ];
      for (const n of candidates) {
        const tile = tileAt(n.i, n.j);
        if (!tile) continue;
        tile.setAttribute('stroke', colors.auxCursor);
        tile.setAttribute('stroke-width', '1.8');
        marked.add(tile);
      }
    }

    function clearMarks(): void {
      for (const tile of marked) {
        tile.setAttribute('stroke', colors.border);
        tile.setAttribute('stroke-width', '1');
      }
      marked.clear();
    }

    function makeChip(text: string, cost: number): SVGGElement {
      const g = el('g', {});
      const w = Math.max(20, Math.min(30, cellW - 22));
      const h = Math.max(16, Math.min(22, cellH - 12));
      g.appendChild(
        el('rect', {
          x: -w / 2,
          y: -h / 2,
          width: w,
          height: h,
          rx: 5,
          fill: cost === 0 ? colors.accent : colors.itemComparing,
        }),
      );
      const label = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: colors.stateInk,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      label.textContent = text;
      g.appendChild(label);
      if (cost !== 0) {
        // 수식 표기라 문안이 아니다 (C10).
        const plus = el('text', {
          x: w / 2 + 7,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: colors.itemComparing,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        plus.textContent = '+1';
        g.appendChild(plus);
      }
      return g;
    }

    /** 강조를 가라앉힌다. 공짜로 온 칸에는 옅은 자국을 남긴다. */
    function settle(): void {
      for (const cell of landed) {
        const tile = tileAt(cell.i, cell.j);
        const number = numberAt(cell.i, cell.j);
        if (!tile || !number) continue;
        const free = cell.cost === 0;
        tile.setAttribute('fill', free ? colors.accent : colors.bgSubtle);
        tile.setAttribute('fill-opacity', free ? '0.18' : '1');
        number.setAttribute('fill', colors.text);
      }
      landed = [];
    }

    function land(cell: WaveCell): void {
      const tile = tileAt(cell.i, cell.j);
      const number = numberAt(cell.i, cell.j);
      if (!tile || !number) return;
      tile.setAttribute('fill', cell.cost === 0 ? colors.accent : colors.itemComparing);
      tile.setAttribute('fill-opacity', '1');
      number.setAttribute('fill', colors.stateInk);
      number.textContent = String(cell.value);
      number.style.opacity = '1';
    }

    function moveWave(k: number): void {
      waveLine.style.opacity = '0.55';
      waveLine.style.transform = `translate(${k * cellW}px, 0px)`;
    }

    return {
      /** 반대각선 하나가 이웃에서 값을 받아 채워진다. */
      async spread(wave: Wave): Promise<void> {
        if (destroyed) return;
        settle();
        clearMarks();
        moveWave(wave.k);

        const flights: { chip: SVGGElement; x: number; y: number }[] = [];
        for (const cell of wave.cells) {
          if (cell.from === 'origin') continue;
          const src = sourceOf(cell);
          markNeighbors(cell);
          const chip = makeChip(String(cell.value - cell.cost), cell.cost);
          chip.style.transform = `translate(${cx(src.j)}px, ${cy(src.i)}px)`;
          chipLayer.appendChild(chip);
          flights.push({ chip, x: cx(cell.j), y: cy(cell.i) });
        }

        if (flights.length > 0) {
          // 방금 붙인 자리를 브라우저가 한 번 셈하게 한 뒤에 목적지를 준다.
          void svg.getBoundingClientRect();
          for (const f of flights) {
            f.chip.style.transition = `transform ${ANIM_MS}ms cubic-bezier(0.32, 0, 0.2, 1)`;
            f.chip.style.transform = `translate(${f.x}px, ${f.y}px)`;
          }
          await wait(ANIM_MS);
          if (destroyed) return;
        }

        for (const cell of wave.cells) land(cell);
        for (const f of flights) f.chip.remove();
        clearMarks();
        landed = wave.cells;
      },

      /** 마지막 칸이 두 낱말 전체의 답이다. */
      async finish(final: FinalCell): Promise<void> {
        if (destroyed) return;
        settle();
        clearMarks();
        waveLine.style.opacity = '0';

        const tile = tileAt(final.i, final.j);
        const number = numberAt(final.i, final.j);
        if (!tile || !number) return;
        tile.setAttribute('fill', colors.itemSorted);
        tile.setAttribute('fill-opacity', '1');
        number.setAttribute('fill', colors.textInverse);
        number.textContent = String(final.value);
        number.style.opacity = '1';

        tile.style.transform = 'scale(1.16)';
        await wait(POP_MS);
        if (destroyed) return;
        tile.style.transform = 'scale(1)';
        await wait(POP_MS);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 표를 비우고 처음으로. */
      reset(): void {
        landed = [];
        clearMarks();
        waveLine.style.opacity = '0';
        waveLine.style.transform = 'translate(0px, 0px)';
        chipLayer.textContent = '';
        caption.textContent = '';
        for (let i = 0; i < dataRows; i += 1) {
          for (let j = 0; j < dataCols; j += 1) {
            const tile = tiles[i][j];
            tile.setAttribute('fill', colors.bgSubtle);
            tile.setAttribute('fill-opacity', '1');
            tile.setAttribute('stroke', colors.border);
            tile.setAttribute('stroke-width', '1');
            tile.style.transform = 'scale(1)';
            const number = numbers[i][j];
            number.textContent = '';
            number.style.opacity = '0';
            number.setAttribute('fill', colors.text);
          }
        }
      },

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
