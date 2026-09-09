/**
 * 플로이드-워셜 무대 — 표가 중심이다.
 *
 * 화면은 네 자리로 나뉜다.
 *
 *   1. 위쪽 띠     지금 어느 정점을 가운데 세웠는지. 정점표 하나가 켜진다.
 *   2. 왼쪽 표     i 행 × j 열. 가운데 세운 정점의 행과 열에 옅은 색지가 깔린다.
 *                  견주는 세 칸(묻는 칸 · 가는 칸 · 오는 칸)이 각각 다른 색으로 선다.
 *   3. 오른쪽 판   지금 무엇을 묻고 있는지. 두 칸의 합과 지금 칸을 나란히 적는다.
 *   4. 아래 줄     한 문장 서술.
 *
 * ── 세로는 고정이다
 *
 * 표의 자리(`TABLE_BOX_W` × `TABLE_BOX_H`)를 먼저 잡고 칸 크기를 정점 수로
 * 나눠 정한다. 정점이 늘면 칸이 작아질 뿐 그림이 길어지지 않는다 (S-view).
 * 그래서 `viewBox` 를 마운트 뒤에 다시 재는 일이 없다.
 *
 * ── 갈아 끼우는 그림
 *
 * 이 조각의 동사는 "고쳐 적는다" 다. 그래서 값이 바뀌는 칸은 색만 바뀌지 않고,
 * **옛 수가 위로 밀려 사라지고 새 수가 아래에서 올라온다.** 그 전이는 CSS
 * transition 으로 걸고, 걸어 두는 타이머는 전부 `timers` 에 담아 `destroy()`
 * 에서 거둔다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 620;
const H = 274;
const PAD = 16;

/** 가운데 세운 정점 띠. */
const STRIP_Y = 12;
const STRIP_H = 26;
const CHIP_MAX_W = 30;
const CHIP_GAP = 6;
const CHIP_X = 66;

/** 표가 놓이는 자리. 칸 크기는 이 상자를 정점 수로 나눠 정한다. */
const TABLE_X = PAD;
const TABLE_Y = 64;
const TABLE_BOX_W = 282;
const TABLE_BOX_H = 172;
const HEAD_W = 32;
const HEAD_H = 22;
const CELL_MAX_W = 50;
const CELL_MAX_H = 30;

/** 물음 판. */
const PANEL_X = 314;
const PANEL_W = W - PAD - PANEL_X;
const PANEL_Y = TABLE_Y;
const PANEL_H = TABLE_BOX_H;
const PANEL_PAD = 16;

const CAPTION_Y = TABLE_Y + TABLE_BOX_H + 24;

/** 갈아 끼우는 전이 길이. */
const SWAP_MS = 260;

/** SVG 의 rx 는 수를 받는다. 토큰은 CSS 길이라 단위를 떼어 쓴다. */
const RX_SM = Number.parseInt(radii.sm, 10);
const RX_MD = Number.parseInt(radii.md, 10);

/** 도형에 새겨진 표식 — 번역하지 않는다 (C10). */
const GLYPH_INFINITY = '∞';
const GLYPH_ARROW = '→';

type CellState = 'plain' | 'target' | 'source' | 'rewritten';

type Cell = {
  rect: SVGRectElement;
  text: SVGTextElement;
  x: number;
  y: number;
  w: number;
  h: number;
};

type ProbeInfo = {
  i: number;
  j: number;
  k: number;
  current: number;
  currentInfinite: boolean;
  through: number;
  throughInfinite: boolean;
  improves: boolean;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const floydWarshallStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너를 비우지 않는다 — 러너가 붙여 준 캔버스가 떨어져 나간다 (S-view).
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const raw = params.initialData as { vertices?: unknown } | undefined;
    const labels: string[] = Array.isArray(raw?.vertices)
      ? raw.vertices.filter((v): v is string => typeof v === 'string')
      : [];
    const n = labels.length;

    const cellW = n > 0 ? Math.min(CELL_MAX_W, (TABLE_BOX_W - HEAD_W) / n) : CELL_MAX_W;
    const cellH = n > 0 ? Math.min(CELL_MAX_H, (TABLE_BOX_H - HEAD_H) / n) : CELL_MAX_H;

    // ── 시간을 다루는 것들. destroy 에서 전부 거둔다.
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    };

    // ── 층. 아래에서부터 색지 · 칸 · 띠 · 판.
    const root = el('g', {});
    const bandLayer = el('g', {});
    const cellLayer = el('g', {});
    const chromeLayer = el('g', {});
    root.appendChild(bandLayer);
    root.appendChild(cellLayer);
    root.appendChild(chromeLayer);
    svg.appendChild(root);

    // ── 가운데 세운 정점 띠
    const chipW = n > 0 ? Math.min(CHIP_MAX_W, (W - CHIP_X - PAD) / n - CHIP_GAP) : CHIP_MAX_W;
    const stripLabel = el('text', {
      x: PAD,
      y: STRIP_Y + STRIP_H - 8,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    stripLabel.textContent = tr('label.pivot', 'Middle');
    chromeLayer.appendChild(stripLabel);

    const chips: { rect: SVGRectElement; text: SVGTextElement }[] = [];
    for (let v = 0; v < n; v += 1) {
      const x = CHIP_X + v * (chipW + CHIP_GAP);
      const rect = el('rect', {
        x,
        y: STRIP_Y,
        width: chipW,
        height: STRIP_H,
        rx: RX_SM,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const text = el('text', {
        x: x + chipW / 2,
        y: STRIP_Y + STRIP_H - 8,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      text.textContent = labels[v];
      chromeLayer.appendChild(rect);
      chromeLayer.appendChild(text);
      chips.push({ rect, text });
    }

    // ── 표의 축 표식과 머리줄
    const axis = el('text', {
      x: PAD,
      y: TABLE_Y - 8,
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    axis.textContent = tr('label.axis', 'from ↓   to →');
    chromeLayer.appendChild(axis);

    for (let v = 0; v < n; v += 1) {
      const colHead = el('text', {
        x: TABLE_X + HEAD_W + v * cellW + cellW / 2,
        y: TABLE_Y + HEAD_H - 7,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      colHead.textContent = labels[v];
      chromeLayer.appendChild(colHead);

      const rowHead = el('text', {
        x: TABLE_X + HEAD_W - 10,
        y: TABLE_Y + HEAD_H + v * cellH + cellH / 2 + 4,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      rowHead.textContent = labels[v];
      chromeLayer.appendChild(rowHead);
    }

    // ── 가운데 세운 정점의 행과 열에 깔리는 색지
    const rowBand = el('rect', {
      x: TABLE_X + HEAD_W,
      y: TABLE_Y + HEAD_H,
      width: n * cellW,
      height: cellH,
      fill: colors.subtreeShadeRight,
      opacity: 0,
    });
    const colBand = el('rect', {
      x: TABLE_X + HEAD_W,
      y: TABLE_Y + HEAD_H,
      width: cellW,
      height: n * cellH,
      fill: colors.subtreeShadeRight,
      opacity: 0,
    });
    bandLayer.appendChild(rowBand);
    bandLayer.appendChild(colBand);

    // ── 표의 칸
    const cells: Cell[][] = [];
    for (let i = 0; i < n; i += 1) {
      const row: Cell[] = [];
      for (let j = 0; j < n; j += 1) {
        const x = TABLE_X + HEAD_W + j * cellW;
        const y = TABLE_Y + HEAD_H + i * cellH;
        const rect = el('rect', {
          x,
          y,
          width: cellW,
          height: cellH,
          fill: i === j ? colors.bgSubtle : 'none',
          stroke: colors.border,
          'stroke-width': 1,
        });
        const text = el('text', {
          x: x + cellW / 2,
          y: y + cellH / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
          // 검사가 화면에 실제로 뜬 수를 집어 읽는 손잡이. 갈아 끼울 때 만드는
          // 잔상 복제본에서는 떼어 낸다 — 같은 칸이 둘로 잡히면 안 된다.
          'data-cell': `${i}-${j}`,
        });
        text.textContent = '';
        cellLayer.appendChild(rect);
        cellLayer.appendChild(text);
        row.push({ rect, text, x, y, w: cellW, h: cellH });
      }
      cells.push(row);
    }

    // ── 물음 판
    const panel = el('rect', {
      x: PANEL_X,
      y: PANEL_Y,
      width: PANEL_W,
      height: PANEL_H,
      rx: RX_MD,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
    });
    chromeLayer.appendChild(panel);

    const panelText = (y: number, size: string, family: string): SVGTextElement => {
      const t = el('text', {
        x: PANEL_X + PANEL_PAD,
        y,
        'font-family': family,
        'font-size': size,
        fill: colors.text,
      });
      chromeLayer.appendChild(t);
      return t;
    };
    const chainLine = panelText(PANEL_Y + 40, fontSizes.xl, fonts.mono);
    const currentLine = panelText(PANEL_Y + 76, fontSizes.sm, fonts.mono);
    const throughLine = panelText(PANEL_Y + 100, fontSizes.sm, fonts.mono);
    const verdictLine = panelText(PANEL_Y + 140, fontSizes.md, fonts.body);
    currentLine.setAttribute('fill', colors.textMuted);

    const caption = el('text', {
      x: PAD,
      y: CAPTION_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    chromeLayer.appendChild(caption);

    // ── 상태
    let pivot = -1;
    /** 지금 색이 얹힌 칸들. 다음 물음 전에 되돌린다. */
    let lit: Array<[number, number]> = [];
    /** 갈아 끼우는 중인 옛 수의 잔상. 되돌릴 때 남아 있으면 지운다. */
    const ghosts = new Set<SVGTextElement>();

    const inRange = (i: number, j: number): boolean =>
      i >= 0 && i < n && j >= 0 && j < n;

    function paint(i: number, j: number, state: CellState): void {
      if (!inRange(i, j)) return;
      const c = cells[i][j];
      const infinite = c.text.textContent === GLYPH_INFINITY;
      if (state === 'plain') {
        c.rect.setAttribute('fill', i === j ? colors.bgSubtle : 'none');
        c.text.setAttribute('fill', infinite ? colors.textMuted : colors.text);
        return;
      }
      const fill =
        state === 'target'
          ? colors.itemPivot
          : state === 'source'
            ? colors.itemComparing
            : colors.itemSwapping;
      c.rect.setAttribute('fill', fill);
      c.text.setAttribute('fill', colors.stateInk);
    }

    function clearLit(): void {
      for (const [i, j] of lit) paint(i, j, 'plain');
      lit = [];
    }

    function writeCell(i: number, j: number, value: number, infinite: boolean): void {
      if (!inRange(i, j)) return;
      const c = cells[i][j];
      c.text.textContent = infinite ? GLYPH_INFINITY : String(value);
      c.text.setAttribute('fill', infinite ? colors.textMuted : colors.text);
    }

    function num(value: number, infinite: boolean): string {
      return infinite ? GLYPH_INFINITY : String(value);
    }

    return {
      /** 표의 한 칸에 값을 적는다. */
      setCell(i: number, j: number, value: number, infinite: boolean): void {
        writeCell(i, j, value, infinite);
      },

      /** 가운데 세울 정점을 바꾼다. */
      setPivot(k: number): void {
        clearLit();
        pivot = k;
        for (let v = 0; v < n; v += 1) {
          const on = v === k;
          chips[v].rect.setAttribute('fill', on ? colors.itemPivot : colors.bgSubtle);
          chips[v].rect.setAttribute('stroke', on ? colors.itemPivot : colors.border);
          chips[v].text.setAttribute('fill', on ? colors.stateInk : colors.textMuted);
        }
        if (k >= 0 && k < n) {
          rowBand.setAttribute('y', String(TABLE_Y + HEAD_H + k * cellH));
          rowBand.setAttribute('opacity', '1');
          colBand.setAttribute('x', String(TABLE_X + HEAD_W + k * cellW));
          colBand.setAttribute('opacity', '1');
        }
        chainLine.textContent = '';
        currentLine.textContent = '';
        throughLine.textContent = '';
        verdictLine.textContent = '';
      },

      /**
       * 세 칸을 견준다. 판에 적는 것은 수식(표식)이고, 판정 한 줄만 문안이라
       * projector 가 번역해 넘긴다 (C10).
       */
      setProbe(p: ProbeInfo, verdict: string): void {
        clearLit();
        paint(p.i, p.k, 'source');
        paint(p.k, p.j, 'source');
        paint(p.i, p.j, 'target');
        lit = [
          [p.i, p.k],
          [p.k, p.j],
          [p.i, p.j],
        ];

        const a = labels[p.i] ?? String(p.i);
        const b = labels[p.j] ?? String(p.j);
        const m = labels[p.k] ?? String(p.k);
        chainLine.textContent = `${a} ${GLYPH_ARROW} ${m} ${GLYPH_ARROW} ${b}`;
        currentLine.textContent = `d[${a}][${b}] = ${num(p.current, p.currentInfinite)}`;
        const leg = cells[p.i]?.[p.k]?.text.textContent ?? '';
        const arm = cells[p.k]?.[p.j]?.text.textContent ?? '';
        throughLine.textContent = `d[${a}][${m}] + d[${m}][${b}] = ${leg} + ${arm} = ${num(
          p.through,
          p.throughInfinite,
        )}`;
        verdictLine.textContent = verdict;
        verdictLine.setAttribute(
          'fill',
          p.improves ? colors.itemSwapping : colors.textMuted,
        );
      },

      /** 칸을 더 작은 수로 갈아 끼운다 — 옛 수는 위로, 새 수는 아래에서. */
      applyRewrite(i: number, j: number, value: number): void {
        if (!inRange(i, j)) return;
        const c = cells[i][j];
        const shift = Math.round(c.h * 0.45);

        const ghost = c.text.cloneNode(true) as SVGTextElement;
        ghost.removeAttribute('data-cell');
        ghost.setAttribute('fill', colors.stateInk);
        cellLayer.appendChild(ghost);
        ghosts.add(ghost);

        writeCell(i, j, value, false);
        paint(i, j, 'rewritten');
        if (!lit.some(([a, b]) => a === i && b === j)) lit.push([i, j]);

        c.text.style.opacity = '0';
        c.text.style.transform = `translateY(${shift}px)`;
        later(() => {
          const move = `opacity ${SWAP_MS}ms linear, transform ${SWAP_MS}ms ease-out`;
          ghost.style.transition = move;
          ghost.style.opacity = '0';
          ghost.style.transform = `translateY(${-shift}px)`;
          c.text.style.transition = move;
          c.text.style.opacity = '1';
          c.text.style.transform = 'translateY(0px)';
        }, 16);
        later(() => {
          ghosts.delete(ghost);
          ghost.remove();
          c.text.style.transition = '';
          c.text.style.transform = '';
        }, SWAP_MS + 80);
      },

      /** 서술 한 줄. 문안은 projector 가 번역해 넘긴다. */
      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 다 고쳤다. 견주던 표시를 거둔다. */
      finish(): void {
        clearLit();
        pivot = -1;
        rowBand.setAttribute('opacity', '0');
        colBand.setAttribute('opacity', '0');
        for (let v = 0; v < n; v += 1) {
          chips[v].rect.setAttribute('fill', colors.bgSubtle);
          chips[v].rect.setAttribute('stroke', colors.border);
          chips[v].text.setAttribute('fill', colors.textMuted);
        }
        chainLine.textContent = '';
        currentLine.textContent = '';
        throughLine.textContent = '';
        verdictLine.textContent = '';
      },

      /** 처음으로 되돌린다. */
      reset(): void {
        clearLit();
        // 갈아 끼우던 중이었다면 그 전이를 걷어낸다 — 걷지 않으면 투명해진
        // 글자와 잔상이 남은 채로 다음 재생이 시작된다.
        for (const ghost of ghosts) ghost.remove();
        ghosts.clear();
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) {
            const text = cells[i][j].text;
            text.textContent = '';
            text.style.transition = '';
            text.style.transform = '';
            text.style.opacity = '';
            paint(i, j, 'plain');
          }
        }
        pivot = -1;
        rowBand.setAttribute('opacity', '0');
        colBand.setAttribute('opacity', '0');
        for (let v = 0; v < n; v += 1) {
          chips[v].rect.setAttribute('fill', colors.bgSubtle);
          chips[v].rect.setAttribute('stroke', colors.border);
          chips[v].text.setAttribute('fill', colors.textMuted);
        }
        chainLine.textContent = '';
        currentLine.textContent = '';
        throughLine.textContent = '';
        verdictLine.textContent = '';
        caption.textContent = '';
      },

      /** 지금 가운데 세운 정점. 검사가 화면 상태를 볼 때 쓴다. */
      pivotIndex(): number {
        return pivot;
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };
  },
};
