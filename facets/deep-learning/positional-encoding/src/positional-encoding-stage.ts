/**
 * positional-encoding-stage — 왼쪽은 자리 × 성분의 줄무늬 표, 오른쪽은 간격 Δ 마다의 거리 막대.
 *
 * 무대는 셈하지 않는다 — PE 값 · 거리 · 축 끝 · 헷갈리는 간격 · 가장 닮은 간격은 전부 payload 로 받는다.
 * 운동 (길이는 projector 가 재생 속도로 나눠 넘긴다):
 *   - 표의 열 — d 를 올리면 새 열이 오른쪽 끝에서 밀려 들어오고, 내리면 남는 열 쪽으로 접혀 사라진다
 *   - 간격 막대 — 앞 판의 높이에서 이 판의 높이로 자란다 · 준다 (걸음 0 에서는 흐린 테두리로 자리만 남는다)
 *   - 이웃 거리 선 — 앞 판의 높이에서 이 판의 높이로 옮겨 간다
 *   - Δ* 표지 · 표에서 짚는 둘째 줄 — 앞 판의 간격 · 자리에서 이 판의 것으로 미끄러져 간다
 * 결론(값 글자 · 표지 · 선 · 칠한 칸)은 걸음 0 에서 걷고 이 판의 걸음이 다시 칠한다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 470;

// 표
const TABLE_X = 64;
const TABLE_Y = 100;
const CELL_W = 18;
const ROW_H = 9;
// 짚는 두 줄
const STRIP_Y = 404;
const STRIP_H = 14;
const STRIP_GAP = 4;
// 막대
const CHART_X = 420;
const CHART_W = 310;
const CHART_TOP = TABLE_Y;
const CHART_H = 288;
const CHART_BASE = CHART_TOP + CHART_H;

export type PositionalEncodingStage = ViewInstance & {
  board(p: { dModel: number; positions: number; pairs: number }, ms: number): void;
  encoding(p: { dModel: number; omegas: number[]; rows: number[][] }): void;
  distances(p: { distances: number[]; axisMax: number }, ms: number): void;
  neighbour(p: { neighbour: number; confusable: number[] }, ms: number): void;
  nearest(p: { gap: number; distance: number; rowZero: number[]; rowGap: number[] }, ms: number): void;
};

/** 표시 — 소수 둘째 자리, 음수는 빼기 기호 */
function fmt(v: number): string {
  const s = v.toFixed(2);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

/** ω 표시 — 유효 숫자 셋 */
function fmtOmega(w: number): string {
  return String(Number(w.toPrecision(3)));
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function num(node: Element, attr: string): number {
  const v = Number(node.getAttribute(attr));
  if (!Number.isFinite(v)) throw new Error(`positional-encoding-stage: ${attr} 가 수가 아니다`);
  return v;
}

export const positionalEncodingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const [POS, NEG] = categorical(2, 'vivid');
    if (POS === undefined || NEG === undefined) throw new Error('positional-encoding-stage: 범주 색이 없다');
    const fontXs = parseFloat(fontSizes.xs);

    // ── 운동 헬퍼 — 같은 열쇠의 앞 운동은 거두고 지금 값에서 새로 시작한다
    const frames = new Map<string, number>();
    const finals = new Map<string, () => void>();
    const tween = (key: string, ms: number, apply: (k: number) => void, done?: () => void): void => {
      const prev = frames.get(key);
      if (prev !== undefined) cancelAnimationFrame(prev);
      frames.delete(key);
      finals.delete(key);
      const finish = (): void => {
        apply(1);
        done?.();
      };
      if (ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        finish();
        return;
      }
      const start = performance.now();
      const step = (now: number): void => {
        const raw = Math.min(1, (now - start) / ms);
        if (raw >= 1) {
          frames.delete(key);
          finals.delete(key);
          finish();
          return;
        }
        apply(1 - (1 - raw) * (1 - raw) * (1 - raw));
        frames.set(key, requestAnimationFrame(step));
      };
      finals.set(key, finish);
      frames.set(key, requestAnimationFrame(step));
    };
    const settleAll = (): void => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
      const pending = [...finals.values()];
      finals.clear();
      for (const f of pending) f();
    };
    params.onScrubStart?.(settleAll);
    const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

    // ── 층
    const text = (attrs: Record<string, string | number>, parent: Element, content = ''): SVGTextElement => {
      const node = el('text', { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted, ...attrs }, parent);
      node.textContent = content;
      return node;
    };
    const caption = text({ x: 20, y: 28, 'font-size': fontSizes.md, fill: c.text }, svg);
    const headLayer = el('g', {}, svg);
    const gridLayer = el('g', {}, svg);
    const rowMarkLayer = el('g', {}, svg);
    const stripLayer = el('g', {}, svg);
    const chartLayer = el('g', {}, svg);
    const markLayer = el('g', {}, svg);

    // 표의 고정 글자 — 자리 번호 (5 마다)
    const axisLabels = el('g', { visibility: 'hidden' }, svg);
    text({ x: TABLE_X - 6, y: TABLE_Y - 8, 'text-anchor': 'end', fill: c.text }, axisLabels, t('label.component', 'Component'));
    const posTitle = text({ x: 16, y: TABLE_Y + 144, 'text-anchor': 'middle', fill: c.text }, axisLabels, t('label.position', 'Position'));
    posTitle.setAttribute('transform', `rotate(-90 16 ${TABLE_Y + 144})`);
    const rowNumbers = el('g', {}, axisLabels);

    // 막대 축
    text({ x: CHART_X, y: CHART_TOP - 14, fill: c.text }, axisLabels, t('label.distanceAxis', 'Distance'));
    text({ x: CHART_X + CHART_W / 2, y: CHART_BASE + 34, 'text-anchor': 'middle', fill: c.text }, axisLabels, t('label.gapAxis', 'Gap Δ'));
    el('line', { x1: CHART_X, y1: CHART_BASE, x2: CHART_X + CHART_W, y2: CHART_BASE, stroke: c.border }, axisLabels);
    const yTop = text({ x: CHART_X - 6, y: CHART_TOP + 4, 'text-anchor': 'end' }, axisLabels);
    text({ x: CHART_X - 6, y: CHART_BASE + 4, 'text-anchor': 'end' }, axisLabels, fmt(0));
    el('line', { x1: CHART_X - 3, y1: CHART_TOP, x2: CHART_X + CHART_W, y2: CHART_TOP, stroke: c.border, 'stroke-dasharray': '2 3' }, axisLabels);

    // 색 뜻 — 값 −1 · 0 · +1
    const legend = el('g', {}, axisLabels);
    const legendValues = [-1, -0.5, 0, 0.5, 1];
    legendValues.forEach((v, i) => {
      el('rect', {
        x: CHART_X + i * 16, y: STRIP_Y + 38, width: 14, height: 10,
        fill: v < 0 ? NEG : POS, 'fill-opacity': Math.abs(v), stroke: c.border,
      }, legend);
    });
    text({ x: CHART_X - 4, y: STRIP_Y + 47, 'text-anchor': 'end' }, legend, fmt(-1));
    text({ x: CHART_X + 5 * 16 + 2, y: STRIP_Y + 47 }, legend, `+${fmt(1)}`);

    // ── 상태
    let positions = 0;
    let dModel = 0;
    let cols: { g: SVGGElement; x: number; cells: SVGRectElement[] }[] = [];
    const leaving = new Set<SVGGElement>();
    let bars: SVGRectElement[] = [];
    let slot = 0;
    let axisMax = 0;
    let distances: number[] = [];

    const barGeom = (i: number, h: number): { x: number; y: number; w: number; h: number } => ({
      x: CHART_X + i * slot + slot * 0.18,
      y: CHART_BASE - h,
      w: slot * 0.64,
      h,
    });

    // 이웃 거리 선
    const neighbourLine = el('line', {
      x1: CHART_X, x2: CHART_X + CHART_W, y1: CHART_BASE, y2: CHART_BASE,
      stroke: c.text, 'stroke-width': 1.5, 'stroke-dasharray': '6 4', visibility: 'hidden',
    }, markLayer);
    const neighbourLabel = text({
      x: CHART_X + 4, y: CHART_BASE - 6, fill: c.text, stroke: c.bg, 'stroke-width': 3, 'paint-order': 'stroke', visibility: 'hidden',
    }, markLayer);

    // Δ* 표지
    const nearestMark = el('g', { visibility: 'hidden', transform: `translate(${CHART_X} ${CHART_BASE})` }, markLayer);
    el('path', { d: 'M -6 -14 L 6 -14 L 0 -5 Z', fill: c.accent, stroke: c.text, 'stroke-width': 1 }, nearestMark);
    const nearestLabel = text({
      x: 0, y: -20, 'text-anchor': 'middle', fill: c.text, 'font-size': fontSizes.sm, 'font-weight': 600,
      stroke: c.bg, 'stroke-width': 3, 'paint-order': 'stroke',
    }, nearestMark);
    let nearestX = CHART_X;
    let nearestY = CHART_BASE;

    // 표에서 짚는 두 줄
    const rowZeroBox = el('rect', { x: TABLE_X - 1, y: TABLE_Y - 1, width: 0, height: ROW_H + 2, fill: 'none', stroke: c.accent, 'stroke-width': 2, visibility: 'hidden' }, rowMarkLayer);
    const rowGapBox = el('rect', { x: TABLE_X - 1, y: TABLE_Y - 1, width: 0, height: ROW_H + 2, fill: 'none', stroke: c.accent, 'stroke-width': 2, visibility: 'hidden' }, rowMarkLayer);
    let rowGapY = TABLE_Y - 1;

    const confusableDots = el('g', {}, markLayer);
    const bottomLabels = el('g', {}, chartLayer);

    const cellFill = (cell: SVGRectElement, v: number | null): void => {
      if (v === null) {
        cell.setAttribute('fill', c.bg);
        cell.setAttribute('fill-opacity', '0');
        return;
      }
      cell.setAttribute('fill', v < 0 ? NEG : POS);
      cell.setAttribute('fill-opacity', String(Math.abs(v)));
    };

    const makeColumn = (x: number): { g: SVGGElement; x: number; cells: SVGRectElement[] } => {
      const g = el('g', { transform: `translate(${x} 0)` }, gridLayer);
      const cells: SVGRectElement[] = [];
      for (let p = 0; p < positions; p += 1) {
        const cell = el('rect', { x: 0, y: TABLE_Y + p * ROW_H, width: CELL_W, height: ROW_H, stroke: c.border, 'stroke-width': 0.5 }, g);
        cellFill(cell, null);
        cells.push(cell);
      }
      return { g, x, cells };
    };

    const clearConclusions = (): void => {
      caption.textContent = '';
      headLayer.replaceChildren();
      for (const col of cols) for (const cell of col.cells) cellFill(cell, null);
      stripLayer.replaceChildren();
      for (const b of bars) {
        b.setAttribute('fill', 'none');
        b.setAttribute('stroke', c.ghostOutline);
        b.setAttribute('stroke-dasharray', '2 2');
      }
      yTop.textContent = '';
      neighbourLine.setAttribute('visibility', 'hidden');
      neighbourLabel.setAttribute('visibility', 'hidden');
      confusableDots.replaceChildren();
      nearestMark.setAttribute('visibility', 'hidden');
      rowZeroBox.setAttribute('visibility', 'hidden');
      rowGapBox.setAttribute('visibility', 'hidden');
    };

    const requireBoard = (what: string): void => {
      if (positions === 0 || dModel === 0) throw new Error(`positional-encoding-stage: '${what}' 가 board 보다 먼저 왔다`);
    };

    const stage: PositionalEncodingStage = {
      board(p, ms) {
        if (positions !== 0 && p.positions !== positions) throw new Error('positional-encoding-stage: 판 사이에 자리 수가 바뀌었다');
        if (positions === 0) {
          positions = p.positions;
          slot = CHART_W / (positions - 1);
          // 자리 번호 (5 마다)
          for (let r = 0; r < positions; r += 5) {
            text({ x: TABLE_X - 6, y: TABLE_Y + r * ROW_H + ROW_H / 2 + fontXs / 2 - 1, 'text-anchor': 'end' }, rowNumbers, String(r));
          }
          // 간격 막대 — 처음에는 높이 0
          for (let i = 0; i < positions - 1; i += 1) {
            const g = barGeom(i, 0);
            bars.push(el('rect', { x: g.x, y: g.y, width: g.w, height: 0, fill: 'none', stroke: c.ghostOutline }, chartLayer));
          }
          for (const gap of [1, 5, 10, 15, 20, 25, 30]) {
            if (gap >= positions) continue;
            const g = barGeom(gap - 1, 0);
            text({ x: g.x + g.w / 2, y: CHART_BASE + 14, 'text-anchor': 'middle' }, bottomLabels, String(gap));
          }
          axisLabels.setAttribute('visibility', 'visible');
        }
        clearConclusions();
        const prevD = dModel;
        dModel = p.dModel;

        // 열 — 늘면 오른쪽 끝에서 밀려 들어오고, 줄면 남는 끝 열 쪽으로 접혀 사라진다
        if (dModel > cols.length) {
          const from = TABLE_X + cols.length * CELL_W - CELL_W;
          for (let i = cols.length; i < dModel; i += 1) {
            const col = makeColumn(Math.max(TABLE_X, from));
            cols.push(col);
            const target = TABLE_X + i * CELL_W;
            const start = col.x;
            tween(`col:${i}`, ms, (k) => {
              col.x = lerp(start, target, k);
              col.g.setAttribute('transform', `translate(${col.x} 0)`);
            });
          }
        } else if (dModel < cols.length) {
          const gone = cols.slice(dModel);
          cols = cols.slice(0, dModel);
          const target = TABLE_X + (dModel - 1) * CELL_W;
          gone.forEach((col, j) => {
            leaving.add(col.g);
            const start = col.x;
            tween(`leave:${dModel + j}:${prevD}`, ms, (k) => {
              col.g.setAttribute('transform', `translate(${lerp(start, target, k)} 0)`);
            }, () => {
              col.g.remove();
              leaving.delete(col.g);
            });
          });
        }
        caption.textContent = t('caption.board', 'Encoding size d {d} · positions {n} · frequencies {k}', {
          d: dModel, n: positions, k: p.pairs,
        });
      },

      encoding(p) {
        requireBoard('encoding');
        if (p.dModel !== dModel || p.rows.length !== positions || p.omegas.length * 2 !== dModel) {
          throw new Error('positional-encoding-stage: encoding 의 모양이 판과 어긋난다');
        }
        p.rows.forEach((row, r) => {
          if (row.length !== dModel) throw new Error(`positional-encoding-stage: 자리 ${r} 의 성분 수가 ${row.length}`);
          row.forEach((v, ci) => {
            const col = cols[ci];
            const cell = col?.cells[r];
            if (cell === undefined) throw new Error('positional-encoding-stage: 칸이 없다');
            cellFill(cell, v);
          });
        });
        headLayer.replaceChildren();
        p.omegas.forEach((w, i) => {
          const x = TABLE_X + i * 2 * CELL_W + CELL_W;
          const y = TABLE_Y - 6;
          el('line', { x1: x - CELL_W + 2, x2: x + CELL_W - 2, y1: y + 2, y2: y + 2, stroke: c.textMuted }, headLayer);
          const label = text({ x: x - 4, y, fill: c.text }, headLayer, t('label.omega', 'ω {w}', { w: fmtOmega(w) }));
          label.setAttribute('transform', `rotate(-55 ${x - 4} ${y})`);
        });
        const slowest = p.omegas[p.omegas.length - 1];
        if (slowest === undefined) throw new Error('positional-encoding-stage: ω 가 없다');
        caption.textContent = t('caption.encoding', 'Each position gets sin · cos per frequency — slowest ω {w}', { w: fmtOmega(slowest) });
      },

      distances(p, ms) {
        requireBoard('distances');
        if (p.distances.length !== positions - 1) throw new Error('positional-encoding-stage: 간격 수가 판과 어긋난다');
        if (!(p.axisMax > 0)) throw new Error('positional-encoding-stage: axisMax 가 양수가 아니다');
        distances = p.distances.slice();
        axisMax = p.axisMax;
        bars.forEach((bar, i) => {
          const d = distances[i]!;
          bar.setAttribute('fill', c.textMuted);
          bar.setAttribute('stroke', 'none');
          bar.removeAttribute('stroke-dasharray');
          const fromH = num(bar, 'height');
          const toH = (d / axisMax) * CHART_H;
          tween(`bar:${i}`, ms, (k) => {
            const g = barGeom(i, lerp(fromH, toH, k));
            bar.setAttribute('y', String(g.y));
            bar.setAttribute('height', String(g.h));
          });
        });
        yTop.textContent = fmt(axisMax);
        caption.textContent = t('caption.distances', 'Distance for every gap Δ — farthest {max}', { max: fmt(axisMax) });
      },

      neighbour(p, ms) {
        requireBoard('neighbour');
        if (axisMax === 0) throw new Error('positional-encoding-stage: neighbour 가 distances 보다 먼저 왔다');
        const from = num(neighbourLine, 'y1');
        const to = CHART_BASE - (p.neighbour / axisMax) * CHART_H;
        neighbourLine.setAttribute('visibility', 'visible');
        neighbourLabel.setAttribute('visibility', 'visible');
        neighbourLabel.textContent = t('label.neighbourLine', 'Neighbour distance {d1}', { d1: fmt(p.neighbour) });
        tween('neighbour', ms, (k) => {
          const y = lerp(from, to, k);
          neighbourLine.setAttribute('y1', String(y));
          neighbourLine.setAttribute('y2', String(y));
          neighbourLabel.setAttribute('y', String(y - 5));
        });
        confusableDots.replaceChildren();
        for (const gap of p.confusable) {
          const bar = bars[gap - 1];
          const d = distances[gap - 1];
          if (bar === undefined || d === undefined) throw new Error(`positional-encoding-stage: 간격 ${gap} 의 막대가 없다`);
          bar.setAttribute('fill', c.itemComparing);
          const g = barGeom(gap - 1, (d / axisMax) * CHART_H);
          el('circle', { cx: g.x + g.w / 2, cy: CHART_BASE + 22, r: 3, fill: c.itemComparing }, confusableDots);
        }
        caption.textContent = t('caption.neighbour', 'Neighbour distance {d1} · far gaps closer than a neighbour {n}', {
          d1: fmt(p.neighbour), n: p.confusable.length,
        });
      },

      nearest(p, ms) {
        requireBoard('nearest');
        const d = distances[p.gap - 1];
        const bar = bars[p.gap - 1];
        if (d === undefined || bar === undefined) throw new Error(`positional-encoding-stage: 간격 ${p.gap} 이 없다`);
        if (p.rowZero.length !== dModel || p.rowGap.length !== dModel) throw new Error('positional-encoding-stage: 짚는 줄의 성분 수가 어긋난다');
        bar.setAttribute('fill', c.accent);
        bar.setAttribute('stroke', c.text);

        // Δ* 표지 — 앞 판의 자리에서 미끄러져 온다
        const g = barGeom(p.gap - 1, (d / axisMax) * CHART_H);
        const toX = g.x + g.w / 2;
        const toY = g.y;
        const fromX = nearestX;
        const fromY = nearestY;
        nearestLabel.textContent = t('label.gapMark', 'Δ {gap}', { gap: p.gap });
        nearestMark.setAttribute('visibility', 'visible');
        tween('nearest', ms, (k) => {
          nearestX = lerp(fromX, toX, k);
          nearestY = lerp(fromY, toY, k);
          nearestMark.setAttribute('transform', `translate(${nearestX} ${nearestY})`);
        });

        // 표의 두 줄 — 둘째 줄이 앞 판의 자리에서 옮겨 온다
        const width = dModel * CELL_W + 2;
        rowZeroBox.setAttribute('width', String(width));
        rowGapBox.setAttribute('width', String(width));
        rowZeroBox.setAttribute('visibility', 'visible');
        rowGapBox.setAttribute('visibility', 'visible');
        const fromRow = rowGapY;
        const toRow = TABLE_Y + p.gap * ROW_H - 1;
        tween('rowGap', ms, (k) => {
          rowGapY = lerp(fromRow, toRow, k);
          rowGapBox.setAttribute('y', String(rowGapY));
        });

        // 짚는 두 줄을 크게 나란히
        stripLayer.replaceChildren();
        const strips: [number, number[]][] = [[0, p.rowZero], [p.gap, p.rowGap]];
        strips.forEach(([pos, row], s) => {
          const y = STRIP_Y + s * (STRIP_H + STRIP_GAP);
          text({ x: TABLE_X - 6, y: y + STRIP_H - 3, 'text-anchor': 'end', fill: c.text }, stripLayer, t('label.row', 'Position {p}', { p: pos }));
          row.forEach((v, ci) => {
            const cell = el('rect', { x: TABLE_X + ci * CELL_W, y, width: CELL_W, height: STRIP_H, stroke: c.border, 'stroke-width': 0.5 }, stripLayer);
            cellFill(cell, v);
          });
          el('rect', { x: TABLE_X - 1, y: y - 1, width, height: STRIP_H + 2, fill: 'none', stroke: c.accent, 'stroke-width': 1.5 }, stripLayer);
        });

        caption.textContent = t('caption.nearest', 'Most similar gap {gap} · distance {dist}', { gap: p.gap, dist: fmt(p.distance) });
      },

      destroy() {
        for (const id of frames.values()) cancelAnimationFrame(id);
        frames.clear();
        finals.clear();
        for (const g of leaving) g.remove();
        leaving.clear();
        for (const node of [caption, headLayer, gridLayer, rowMarkLayer, stripLayer, chartLayer, markLayer, axisLabels]) node.remove();
        cols = [];
        bars = [];
      },
    };
    return stage;
  },
};
