/**
 * halve-the-range-stage — 후보 구간이 걸음마다 반씩 사라지는 화면.
 *
 * 움직이는 것은 값이 아니라 **구간의 폭**이다. 살아 있는 후보는 하나의 테두리로
 * 둘러싸이고, 견줌이 끝날 때마다 그 테두리의 모서리가 안쪽으로 미끄러진다.
 * 값은 자기 자리에서 한 걸음도 옮기지 않는다 — 줄어드는 것은 폭이다.
 *
 * 후보에서 빠진 자리는 지워지지 않는다. 제자리에서 아래로 물러나 자취 선반에
 * 내려앉고, 그 무리 아래에 이번 한 번의 견줌으로 몇이 걷혔는지가 칩으로 붙는다.
 * 그래야 "절반" 이 어림이 아니라 세어 볼 수 있는 셈이 된다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다. 자취 선반은 처음부터 자리를 잡고 있고 거기에
 * 값이 내려앉을 뿐이다 (S-view).
 *
 * 타이머: rAF tween 만 쓴다. destroy() 가 예약된 프레임을 취소하고 대기 중인
 * promise 를 그 자리에서 결말지으므로, 화면이 사라진 뒤 알고리즘이 매달리지 않는다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  radii,
  space,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 자취 선반과 셈 줄까지 처음부터 자리를 잡는다. */
const H = 208;

const LABEL_BASE = 20;
const TILE_Y = 40;
const TILE_H = 40;
const BAND_PAD_X = parseFloat(space.sm);
const BAND_PAD_Y = parseFloat(space.md);
const BAND_Y = TILE_Y - BAND_PAD_Y;
const BAND_H = TILE_H + BAND_PAD_Y * 2;
const CARET_TOP = BAND_Y + 2;
const CARET_H = 8;
const CARET_HALF_W = 6;
/** 후보에서 빠진 자리가 물러나는 깊이. */
const SINK = 60;
const RAIL_Y = TILE_Y + SINK + TILE_H;
/** 한 번에 걷힌 무리를 아래에서 묶는 셈괄호. */
const BRACKET_Y = 147;
const BRACKET_TICK = 5;
const CHIP_Y = 152;
const CHIP_H = 22;
const CAPTION_BASE = 194;

/** 칸 폭의 상한. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 84;
const SIDE_MIN = 24;
const TILE_GAP = parseFloat(space.sm);

const MOVE_MS = 420;
const PROBE_MS = 260;

export type HalveTheRangeStageInit = { values: number[] };

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 글자가 차지하는 폭의 어림. 한글은 한 글자가 온폭에 가깝다. */
function textWidth(s: string, size: number): number {
  let units = 0;
  for (const ch of s) units += ch.charCodeAt(0) > 0x2e80 ? 1 : 0.56;
  return units * size;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p) * (1 - p);
}

type Tile = { g: SVGGElement; box: SVGRectElement; label: SVGTextElement };
type Pending = { raf: number | null; settle: () => void };

export const halveTheRangeStageView: CanvasView = {
  canvas: { height: H },

  // container 는 계약상 받지만 쓰지 않는다. 러너가 붙여 준 캔버스 안에만 그린다 —
  // 컨테이너를 비우면 그 캔버스가 떨어져 나간다 (S-view).
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const chipRx = CHIP_H / 2;
    const tileRx = parseFloat(radii.md);

    const root = el('g');
    svg.appendChild(root);

    // ── 뼈대. 자취 선반은 처음부터 놓여 있다.
    const rail = el('line', {
      y1: RAIL_Y,
      y2: RAIL_Y,
      stroke: c.border,
      'stroke-width': 1,
      'stroke-dasharray': '3 4',
    });
    const band = el('rect', {
      y: BAND_Y,
      height: BAND_H,
      rx: tileRx + BAND_PAD_X / 2,
      fill: c.bgSubtle,
      stroke: c.text,
      'stroke-width': 2,
    });
    const spanLabel = el('text', {
      y: LABEL_BASE,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      'font-weight': 600,
      fill: c.text,
    });
    const caret = el('polygon', {
      points: `${-CARET_HALF_W},${CARET_TOP} ${CARET_HALF_W},${CARET_TOP} 0,${CARET_TOP + CARET_H}`,
      fill: c.itemComparing,
      opacity: 0,
    });
    const tilesG = el('g');
    const chipsG = el('g');
    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_BASE,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.textMuted,
    });

    root.append(rail, band, spanLabel, caret, tilesG, chipsG, caption);

    // ── 상태. 논리(무엇이 살아 있는가) 와 표시(지금 어디에 그려져 있는가) 를 나눈다.
    let n = 0;
    let cellW = 0;
    let originX = 0;
    const tiles: Tile[] = [];
    const sunk: boolean[] = [];
    let probeIdx = -1;
    let foundIdx = -1;
    let caretShown = false;

    let bandX = 0;
    let bandW = 0;
    let caretX = 0;
    const dy: number[] = [];

    let destroyed = false;
    const pendings = new Set<Pending>();

    const slotX = (i: number): number => originX + i * cellW;
    const slotMid = (i: number): number => originX + (i + 0.5) * cellW;
    const spanX = (lo: number): number => slotX(lo) - BAND_PAD_X;
    const spanW = (lo: number, hi: number): number => (hi - lo + 1) * cellW + BAND_PAD_X * 2;

    /** 표시값을 DOM 에 옮긴다. 프레임마다 불린다. */
    function paint(): void {
      band.setAttribute('x', String(bandX));
      band.setAttribute('width', String(Math.max(0, bandW)));
      spanLabel.setAttribute('x', String(bandX + bandW / 2));
      caret.setAttribute('transform', `translate(${caretX}, 0)`);
      for (let i = 0; i < n; i += 1) {
        tiles[i].g.setAttribute('transform', `translate(0, ${dy[i]})`);
      }
    }

    /** 논리 상태에 맞춰 색을 다시 입힌다. 걸음이 바뀔 때만 불린다. */
    function restyle(): void {
      for (let i = 0; i < n; i += 1) {
        const { box, label } = tiles[i];
        if (sunk[i]) {
          box.setAttribute('fill', c.bgSubtle);
          box.setAttribute('stroke', c.border);
          box.setAttribute('stroke-dasharray', '4 3');
          label.setAttribute('fill', c.textMuted);
        } else if (i === foundIdx) {
          box.setAttribute('fill', c.accent);
          box.setAttribute('stroke', c.accent);
          box.setAttribute('stroke-dasharray', 'none');
          label.setAttribute('fill', c.stateInk);
        } else if (i === probeIdx) {
          box.setAttribute('fill', c.itemComparing);
          box.setAttribute('stroke', c.itemComparing);
          box.setAttribute('stroke-dasharray', 'none');
          label.setAttribute('fill', c.stateInk);
        } else {
          box.setAttribute('fill', c.bg);
          box.setAttribute('stroke', c.border);
          box.setAttribute('stroke-dasharray', 'none');
          label.setAttribute('fill', c.text);
        }
      }
      caret.setAttribute('fill', foundIdx >= 0 ? c.accent : c.itemComparing);
      caret.setAttribute('opacity', caretShown ? '1' : '0');
    }

    function animate(dur: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          paint();
          resolve();
          return;
        }
        const entry: Pending = { raf: null, settle: resolve };
        pendings.add(entry);
        const start = Date.now();
        const frame = (): void => {
          if (destroyed) {
            pendings.delete(entry);
            resolve();
            return;
          }
          const raw = Math.min(1, (Date.now() - start) / dur);
          apply(easeOut(raw));
          paint();
          if (raw < 1) {
            entry.raf = requestAnimationFrame(frame);
            return;
          }
          entry.raf = null;
          pendings.delete(entry);
          resolve();
        };
        entry.raf = requestAnimationFrame(frame);
      });
    }

    /**
     * 이번 한 번의 견줌으로 걷힌 무리를 아래에서 묶고, 몇이 빠졌는지를 칩으로 단다.
     *
     * 재생이 끝나 정지한 화면에서는 "동시에 내려앉았다" 는 시간의 단서가 사라진다.
     * 괄호가 그 자리에서 무리를 다시 묶어 주므로 정지된 그림에서도 셀 수 있다.
     */
    function addChip(removed: number[], text: string): SVGGElement {
      const lo = Math.min(...removed);
      const hi = Math.max(...removed);
      const x0 = slotX(lo) + TILE_GAP / 2;
      const x1 = slotX(hi + 1) - TILE_GAP / 2;
      const cx = (slotX(lo) + slotX(hi + 1)) / 2;
      const size = parseFloat(fontSizes.sm);
      const w = textWidth(text, size) + parseFloat(space.md) * 2;
      const g = el('g', { opacity: 0 });
      g.append(
        el('path', {
          d:
            `M ${x0} ${BRACKET_Y - BRACKET_TICK} L ${x0} ${BRACKET_Y} ` +
            `L ${x1} ${BRACKET_Y} L ${x1} ${BRACKET_Y - BRACKET_TICK}`,
          fill: 'none',
          stroke: c.text,
          'stroke-width': 1.5,
        }),
        el('rect', {
          x: cx - w / 2,
          y: CHIP_Y,
          width: w,
          height: CHIP_H,
          rx: chipRx,
          fill: c.bg,
          stroke: c.text,
          'stroke-width': 1.5,
        }),
        (() => {
          const t = el('text', {
            x: cx,
            y: CHIP_Y + CHIP_H / 2 + size * 0.36,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 600,
            fill: c.text,
          });
          t.textContent = text;
          return t;
        })(),
      );
      chipsG.appendChild(g);
      return g;
    }

    /** 구간이 좁아지고, 걷힌 자리가 물러나고, 칩이 떠오른다 — 한 호흡에. */
    async function collapse(lo: number, hi: number, removed: number[], text: string): Promise<void> {
      const chip = removed.length > 0 ? addChip(removed, text) : null;
      const fromX = bandX;
      const fromW = bandW;
      const toX = spanX(lo);
      const toW = spanW(lo, hi);
      const from = removed.map((i) => dy[i]);
      await animate(MOVE_MS, (p) => {
        bandX = lerp(fromX, toX, p);
        bandW = lerp(fromW, toW, p);
        for (let k = 0; k < removed.length; k += 1) {
          dy[removed[k]] = lerp(from[k], SINK, p);
        }
        if (chip) {
          chip.setAttribute('opacity', String(p));
          chip.setAttribute('transform', `translate(0, ${(1 - p) * 12})`);
        }
      });
    }

    function hardReset(): void {
      probeIdx = -1;
      foundIdx = -1;
      caretShown = false;
      for (let i = 0; i < n; i += 1) {
        sunk[i] = false;
        dy[i] = 0;
      }
      bandX = spanX(0);
      bandW = spanW(0, Math.max(0, n - 1));
      caretX = slotMid(0);
      chipsG.textContent = '';
      spanLabel.textContent = '';
      caption.textContent = '';
      restyle();
      paint();
    }

    return {
      init(p: HalveTheRangeStageInit): void {
        const values = p.values;
        n = values.length;
        cellW = n > 0 ? Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / n)) : 0;
        originX = Math.round((PIECE_CANVAS_W - n * cellW) / 2);

        tilesG.textContent = '';
        tiles.length = 0;
        sunk.length = 0;
        dy.length = 0;

        for (let i = 0; i < n; i += 1) {
          const g = el('g');
          const box = el('rect', {
            x: slotX(i) + TILE_GAP / 2,
            y: TILE_Y,
            width: Math.max(0, cellW - TILE_GAP),
            height: TILE_H,
            rx: tileRx,
            'stroke-width': 1,
          });
          const label = el('text', {
            x: slotMid(i),
            y: TILE_Y + TILE_H / 2 + parseFloat(fontSizes.lg) * 0.35,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
          });
          label.textContent = String(values[i]);
          g.append(box, label);
          tilesG.appendChild(g);
          tiles.push({ g, box, label });
          sunk.push(false);
          dy.push(0);
        }

        rail.setAttribute('x1', String(originX));
        rail.setAttribute('x2', String(originX + n * cellW));
        hardReset();
      },

      reset(): void {
        hardReset();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      setSpanLabel(text: string): void {
        spanLabel.textContent = text;
      },

      setRange(p: { lo: number; hi: number }): void {
        bandX = spanX(p.lo);
        bandW = spanW(p.lo, p.hi);
        paint();
      },

      async probe(p: { index: number }): Promise<void> {
        probeIdx = p.index;
        const to = slotMid(p.index);
        if (!caretShown) {
          // 처음 짚는 자리 — 없던 데서 미끄러져 오는 것처럼 보이면 거짓이다.
          caretX = to;
          caretShown = true;
          restyle();
          paint();
          return;
        }
        restyle();
        const from = caretX;
        await animate(PROBE_MS, (q) => {
          caretX = lerp(from, to, q);
        });
      },

      async narrow(p: {
        lo: number;
        hi: number;
        removed: number[];
        sweptLabel: string;
      }): Promise<void> {
        probeIdx = -1;
        for (const i of p.removed) sunk[i] = true;
        restyle();
        await collapse(p.lo, p.hi, p.removed, p.sweptLabel);
      },

      async found(p: { index: number; removed: number[]; sweptLabel: string }): Promise<void> {
        probeIdx = -1;
        foundIdx = p.index;
        for (const i of p.removed) sunk[i] = true;
        restyle();
        await collapse(p.index, p.index, p.removed, p.sweptLabel);
      },

      destroy(): void {
        destroyed = true;
        for (const entry of pendings) {
          if (entry.raf !== null) cancelAnimationFrame(entry.raf);
          entry.settle();
        }
        pendings.clear();
        root.remove();
      },
    };
  },
};
