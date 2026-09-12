/**
 * 완전 탐색 무대 — 위는 꿈쩍 않고 아래만 불어난다.
 *
 * ── 자릿수가 갈리는 것을 어떻게 다뤘는가
 *
 * 128 과 49,152 는 한 축척에 못 담는다. 로그로 접으면 "자릿수가 아예 다르다"
 * 는 주장 자체가 사라지고, 축척을 고정하면 작은 쪽이 화면의 1/384 짜리 티끌이
 * 되어 아무 말도 못 한다. 카메라를 물리는 것도, 넘치게 두는 것도 저장소에 이미
 * 있는 답이다.
 *
 * 여기서는 **길이를 버리고 낱개를 센다.** 가장 작은 차원에서의 전체 곱셈(128)을
 * 타일 하나로 삼으면 다섯 값이 타일 1 · 4 · 16 · 64 · 384 개가 된다. 타일 크기는
 * 끝까지 같고(축척 불변) 타일 수는 값에 정비례한다(접지 않음). 384 배가 한
 * 화면에 정직하게 들어오는 것은 **양을 면적이 아니라 개수로 옮겼기 때문**이다.
 * 판은 가장 큰 차원에서 정확히 가득 찬다 — 그릇을 마지막 손잡이 값에 맞췄다.
 *
 * ── 두 구역이 따로 움직인다
 *
 *   위  후보 64 개의 점. 손잡이를 어디로 돌려도 **한 칸도 늘지 않는다.**
 *   아래 훑어야 할 양의 판. 차원을 키우면 타일이 384 배로 불어난다.
 *
 * 그 대비가 이 화면의 주장이다 — 후보를 줄여도 차원이 크면 소용없다.
 *
 * ── destroy
 *
 * 타일이 내려앉는 애니메이션은 promise 를 돌려주고 projector 가 그것을 기다린다.
 * 그래서 `destroy()` 는 타이머를 거두는 것만으로 모자라고, **기다리던 것을 직접
 * 깨워야** 한다 (S-piece 의 waiters/timers 본).
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스. 세로는 마운트 뒤 바뀌지 않는다 (S-view). */
const W = 620;
const H = 300;
const PAD = 24;

/** 후보 점 — 수가 바뀌지 않는 쪽이라 자리도 고정이다. */
const DOT_COLS = 16;
const DOT_PITCH = 13;
const DOT_SIZE = 9;
const DOT_TOP = 34;
const CARET_H = 3;

/** 판 — 가장 큰 차원의 타일이 여기에 정확히 들어찬다. */
const PLATE_TOP = 110;
const PLATE_BOTTOM = H - 12;
const PLATE_LEFT = PAD;
const PLATE_RIGHT = W - PAD;
const TILE_GAP = 2;

const CAPTION_Y = 100;
const LEGEND_Y = 30;
const LEGEND_LINE = 18;

/** 타일이 내려앉는 높이와 걸린 시간. */
const DROP = 26;
const FRAMES = 6;
const FRAME_MS = 26;

/** 내려앉은 타일의 잉크 농도. 방금 놓인 것은 상태색이라 이것을 쓰지 않는다. */
const SETTLED_INK = 0.55;
const PARTIAL_INK = 0.45;

/**
 * 화면에 뜨는 수의 표기.
 *
 * 한 화면에 `49152` 와 `49,152` 가 같이 뜨지 않도록 stage 와 projector 가 이
 * 함수 하나를 쓴다. 자리표를 어떻게 끊을지는 그림이 정하는 것이라 그림 곁에 둔다.
 */
export function formatAmount(value: number): string {
  const sign = value < 0 ? '-' : '';
  return sign + String(Math.abs(Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 판의 칸 나눔.
 *
 * 타일 수를 **정확히 나누어떨어지는** 열·행 짝 중에서 판의 가로세로 비에 가장
 * 가까운 것을 고른다. 어림해서 마지막 줄이 비면 판이 "가득 찼다" 고 말하지
 * 못한다 — 이 화면에서는 가득 참이 곧 주장이다.
 */
export function exhaustiveSearchPlateGrid(
  tilesMax: number,
  plateW: number = PLATE_RIGHT - PLATE_LEFT,
  plateH: number = PLATE_BOTTOM - PLATE_TOP,
): { cols: number; rows: number } {
  const want = plateW / plateH;
  let best = { cols: Math.max(1, tilesMax), rows: 1 };
  let bestGap = Number.POSITIVE_INFINITY;
  for (let cols = 1; cols <= tilesMax; cols += 1) {
    if (tilesMax % cols !== 0) continue;
    const rows = tilesMax / cols;
    const gap = Math.abs(cols / rows - want);
    if (gap < bestGap) {
      bestGap = gap;
      best = { cols, rows };
    }
  }
  return best;
}

/** 판을 새로 세울 때 오는 것. 수는 algorithm 이 셈하고 자리는 여기서 셈한다. */
export type ExhaustiveScene = {
  candidates: number;
  dim: number;
  /** 타일 하나가 지는 곱셈. */
  unit: number;
  /** 판이 담는 타일 수. */
  tilesMax: number;
  /** 이 차원에서의 전체 곱셈. */
  multiplies: number;
  vectorBytes: number;
  totalBytes: number;
};

/** 한 걸음. */
export type ExhaustiveStep = {
  /** 지금까지 훑은 후보 수. */
  scanned: number;
  /** 방금 훑은 마지막 후보의 자리 (0 기반). 모르면 -1. */
  active: number;
  /** 지금까지의 곱셈. */
  multiplies: number;
  caption: string;
};

type Setup = { candidates: number; dims: number[] };

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불리는
 * 유일한 경로가 mount 이고, 좁히는 규칙이 두 벌이 되지 않게 한 곳에 둔다.
 */
function readSetup(value: unknown): Setup {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const candidates = typeof v.candidates === 'number' && v.candidates > 0 ? Math.floor(v.candidates) : 1;
  const dims = Array.isArray(v.dims)
    ? v.dims.filter((d): d is number => typeof d === 'number' && d > 0)
    : [];
  return { candidates, dims: dims.length > 0 ? dims : [1] };
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export const exhaustiveSearchStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  // 러너가 캔버스를 컨테이너에 먼저 붙이고 mount 를 부른다. 그리는 곳은
  // 그 캔버스 안이므로 컨테이너 자체는 건드리지 않는다 (S-view).
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const setup = readSetup(params.initialData);

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

    const root = svgEl('g', {});
    svg.appendChild(root);

    // ── 위: 후보. 이 구역은 손잡이를 어디로 돌려도 그대로다.
    const dotCols = Math.min(DOT_COLS, setup.candidates);
    const dotX = (i: number): number => PAD + (i % dotCols) * DOT_PITCH;
    const dotY = (i: number): number => DOT_TOP + Math.floor(i / dotCols) * DOT_PITCH;
    const dotRows = Math.ceil(setup.candidates / dotCols);

    const candidatesLabel = svgEl('text', {
      x: PAD,
      y: 26,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    candidatesLabel.textContent = t('label.candidates', 'Candidates: {n}', {
      n: formatAmount(setup.candidates),
    });
    root.appendChild(candidatesLabel);

    const dots: SVGRectElement[] = [];
    for (let i = 0; i < setup.candidates; i += 1) {
      const dot = svgEl('rect', {
        x: dotX(i),
        y: dotY(i),
        width: DOT_SIZE,
        height: DOT_SIZE,
        rx: 2,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1,
      });
      root.appendChild(dot);
      dots.push(dot);
    }

    const caret = svgEl('rect', {
      x: PAD,
      y: DOT_TOP + dotRows * DOT_PITCH,
      width: DOT_SIZE,
      height: CARET_H,
      fill: colors.itemActive,
      opacity: 0,
    });
    root.appendChild(caret);

    // ── 오른쪽 위: 단위와 벡터 하나의 자리.
    const unitLabel = svgEl('text', {
      x: PLATE_RIGHT,
      y: LEGEND_Y,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    const vectorLabel = svgEl('text', {
      x: PLATE_RIGHT,
      y: LEGEND_Y + LEGEND_LINE,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    root.append(unitLabel, vectorLabel);

    // ── 캡션과 판 이름.
    const caption = svgEl('text', {
      x: PAD,
      y: CAPTION_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    const plateLabel = svgEl('text', {
      x: PLATE_RIGHT,
      y: CAPTION_Y,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    plateLabel.textContent = t('label.plate', 'Work to scan');
    root.append(caption, plateLabel);

    // ── 아래: 판. 그릇은 가장 큰 차원에 맞춰 잡고 끝까지 바꾸지 않는다.
    const tilesMaxAtMount = Math.round(Math.max(...setup.dims) / Math.min(...setup.dims));
    const plate = svgEl('rect', {
      x: PLATE_LEFT,
      y: PLATE_TOP,
      width: PLATE_RIGHT - PLATE_LEFT,
      height: PLATE_BOTTOM - PLATE_TOP,
      fill: 'none',
      stroke: colors.border,
      'stroke-width': 1,
      'stroke-dasharray': '3 4',
    });
    root.appendChild(plate);

    const tilesLayer = svgEl('g', {});
    root.appendChild(tilesLayer);

    const partial = svgEl('rect', {
      x: PLATE_LEFT,
      y: PLATE_TOP,
      width: 0,
      height: 0,
      fill: colors.itemActive,
      'fill-opacity': PARTIAL_INK,
    });
    root.appendChild(partial);

    let grid = exhaustiveSearchPlateGrid(tilesMaxAtMount);
    let pitchX = (PLATE_RIGHT - PLATE_LEFT) / grid.cols;
    let pitchY = (PLATE_BOTTOM - PLATE_TOP) / grid.rows;

    let unit = 1;
    let laid: SVGRectElement[] = [];
    let fresh: SVGRectElement[] = [];

    function tileBox(k: number): { x: number; y: number; w: number; h: number } {
      const col = k % grid.cols;
      const row = Math.floor(k / grid.cols);
      return {
        x: PLATE_LEFT + col * pitchX,
        y: PLATE_TOP + row * pitchY,
        w: Math.max(1, pitchX - TILE_GAP),
        h: Math.max(1, pitchY - TILE_GAP),
      };
    }

    function settle(tiles: SVGRectElement[]): void {
      for (const tile of tiles) {
        tile.setAttribute('fill', colors.text);
        tile.setAttribute('fill-opacity', String(SETTLED_INK));
      }
    }

    function clearPlate(): void {
      tilesLayer.textContent = '';
      laid = [];
      fresh = [];
      partial.setAttribute('width', '0');
      partial.setAttribute('height', '0');
      caret.setAttribute('opacity', '0');
      for (const dot of dots) {
        dot.setAttribute('fill', colors.itemDefault);
        dot.setAttribute('stroke', colors.border);
      }
    }

    /** 새 타일을 놓고, 놓인 것들이 제자리에 내려앉을 때까지 기다린다. */
    async function land(tiles: SVGRectElement[], caretFrom: number, caretTo: number): Promise<void> {
      if (tiles.length === 0 && caretFrom === caretTo) return;
      for (let f = 1; f <= FRAMES; f += 1) {
        if (destroyed) return;
        const k = f / FRAMES;
        const dy = DROP * (1 - k) * (1 - k);
        for (const tile of tiles) tile.setAttribute('transform', `translate(0, ${(-dy).toFixed(2)})`);
        caret.setAttribute('x', (caretFrom + (caretTo - caretFrom) * k).toFixed(2));
        await wait(FRAME_MS);
      }
      if (destroyed) return;
      for (const tile of tiles) tile.setAttribute('transform', 'translate(0, 0)');
      caret.setAttribute('x', String(caretTo));
    }

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },

      /** 손잡이가 정한 차원으로 판을 새로 세운다. */
      setScene(scene: ExhaustiveScene, text: string): void {
        unit = Math.max(1, scene.unit);
        grid = exhaustiveSearchPlateGrid(Math.max(1, scene.tilesMax));
        pitchX = (PLATE_RIGHT - PLATE_LEFT) / grid.cols;
        pitchY = (PLATE_BOTTOM - PLATE_TOP) / grid.rows;
        clearPlate();
        unitLabel.textContent = t('label.unit', 'One tile = {u} multiplications', {
          u: formatAmount(scene.unit),
        });
        vectorLabel.textContent = t('label.vector', 'One vector: {vb} bytes', {
          vb: formatAmount(scene.vectorBytes),
        });
        caption.textContent = text;
      },

      /** 한 걸음 — 훑은 만큼 타일이 쌓이고 판이 불어난다. */
      async advance(step: ExhaustiveStep): Promise<void> {
        settle(fresh);
        fresh = [];

        const filled = Math.floor(step.multiplies / unit);
        const added: SVGRectElement[] = [];
        for (let k = laid.length; k < filled; k += 1) {
          const box = tileBox(k);
          const tile = svgEl('rect', {
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            rx: 1,
            fill: colors.itemActive,
            transform: `translate(0, ${-DROP})`,
          });
          tilesLayer.appendChild(tile);
          tile.dataset.tile = String(k);
          laid.push(tile);
          added.push(tile);
        }
        fresh = added;

        const rest = (step.multiplies % unit) / unit;
        const box = tileBox(filled);
        const grown = box.h * rest;
        partial.setAttribute('x', String(box.x));
        partial.setAttribute('width', String(box.w));
        partial.setAttribute('height', grown.toFixed(2));
        // 차오르는 것은 아래에서 위로 — 자리가 실제로 올라간다.
        partial.setAttribute('y', (box.y + box.h - grown).toFixed(2));

        for (let i = 0; i < dots.length; i += 1) {
          if (i >= step.scanned) continue;
          dots[i]!.setAttribute('fill', i === step.active ? colors.itemActive : colors.itemSorted);
          dots[i]!.setAttribute('stroke', 'none');
        }

        const caretFrom = Number(caret.getAttribute('x') ?? PAD);
        const caretTo = step.active >= 0 ? dotX(step.active) : caretFrom;
        caret.setAttribute('opacity', '1');
        caption.textContent = step.caption;
        await land(added, caretFrom, caretTo);
      },

      /** 다 훑었다. */
      async finish(text: string): Promise<void> {
        settle(fresh);
        fresh = [];
        caret.setAttribute('opacity', '0');
        caption.textContent = text;
        await wait(0);
      },

      /** 되감기 — 판을 비운다. 다음 `setScene` 이 다시 세운다. */
      reset(): void {
        clearPlate();
        caption.textContent = '';
      },
    };
  },
};
