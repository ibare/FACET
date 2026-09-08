/**
 * bottom-up-table-stage — 상향식 표 채우기 조각의 전용 view.
 *
 * ── 이 화면에는 나무가 없다
 *
 * 표는 한 줄이다. 칸은 왼쪽에서 오른쪽으로 하나씩 차고, 칸을 채울 때 **바로 앞
 * 두 칸에서 화살이 뻗어 나와** 그 칸으로 모인다. 화살은 예외 없이 왼쪽에서
 * 오른쪽으로만 그려지고, 다 그려진 뒤에도 지워지지 않는다 — 재생이 끝나면
 * 오른쪽을 가리키는 화살 여덟이 한 줄로 남는다. 되돌아가는 화살이 하나도 없다는
 * 것이 이 조각이 하려는 말이라, 그 증거를 화면에 남긴다.
 *
 * 움직이는 것은 화살촉과 함께 달리는 **값 토큰**이다. 원본은 제자리에 남고
 * 복제본이 곡선을 타고 오른쪽으로 건너가 목표 칸 위에서 만나 합이 된다. 색만
 * 바뀌는 전환이 아니라 좌표가 실제로 움직인다 (S-piece).
 *
 * 마지막에는 창(window) 하나가 왼쪽에서 미끄러져 들어와 마지막 두 칸에 앉는다.
 * 어느 칸도 바로 앞 둘만 보았으므로 들고 있어야 할 것은 그 둘뿐이라는 말이다.
 *
 * ── 좌표
 *
 * 가로는 `PIECE_CANVAS_W` 에서 역산한다 — 칸 폭은 상한만 상수로 두고 남는 폭을
 * 여백으로 버리지 않는다 (S-piece). 세로는 mount 뒤 바뀌지 않는다 (S-view).
 *
 * 문안은 projector 가 `runtime.t` 로 해석해 완성된 문자열로 넘긴다. 이 파일에
 * 화면 문자열 리터럴은 없고, 칸 아래 `T[i]` 는 수식 표기라 표식이다 (C10).
 */

import {
  fontSizes,
  fonts,
  getColors,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

// ── 좌표 ────────────────────────────────────────────────────────────────
const W = PIECE_CANVAS_W;
/** 칸 폭의 상한. 실제 폭은 캔버스에서 역산한다. */
const CELL_MAX_W = 96;
/** 표 좌우로 최소한 남겨 둘 여백. */
const SIDE_MIN = 26;
const CELL_GAP = 8;
const CELL_TOP = 86;
const CELL_H = 54;
/** 칸 아래 `T[i]` 표식의 baseline. */
const INDEX_BASELINE = CELL_TOP + CELL_H + 16;
const CAPTION_Y = 184;
const NOTE_Y = 204;
const CANVAS_H = 218;

/** 두 칸 앞에서 오는 화살의 제어점 높이 (정점은 그 절반만큼 솟는다). */
const ARC_RISE_FAR = 116;
/** 바로 앞 칸에서 오는 화살의 제어점 높이. */
const ARC_RISE_NEAR = 56;
/** 화살 끝이 칸 윗변에 닿기 직전에서 멈추는 거리 — 화살촉이 보이도록. */
const ARC_END_GAP = 3;
const ARC_SAMPLES = 26;
const HEAD_LEN = 9;
const HEAD_HALF = 5;

const TOKEN_R = 13;

// ── 지속시간 ────────────────────────────────────────────────────────────
/** 값 토큰이 곡선을 타고 건너가는 시간. */
const RIDE_MS = 340;
/** 두 토큰이 칸 속으로 들어가 합이 되는 시간. */
const LAND_MS = 200;
/** 정의가 주는 값이 왼쪽에서 미끄러져 앉는 시간. */
const SEED_MS = 220;
/** 마지막 창이 왼쪽에서 들어와 멈추는 시간. */
const WINDOW_MS = 420;
/** 씨앗 값이 미끄러져 오는 거리. */
const SEED_SLIDE = 18;

const NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

type CellState = 'empty' | 'filled' | 'source' | 'fresh' | 'muted' | 'kept';

type FillStep = {
  index: number;
  from: [number, number];
  values: [number, number];
  value: number;
};

type Arc = {
  path: SVGPathElement;
  head: SVGPathElement;
  p0: Pt;
  cp: Pt;
  p1: Pt;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 2차 베지에 위의 한 점. SVG 기하 API 에 기대지 않으려고 직접 센다. */
function qbez(p0: Pt, cp: Pt, p1: Pt, t: number): Pt {
  const m = 1 - t;
  return {
    x: m * m * p0.x + 2 * m * t * cp.x + t * t * p1.x,
    y: m * m * p0.y + 2 * m * t * cp.y + t * t * p1.y,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 2;
}

export const bottomUpTableStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const c = getColors(params.theme);
    const svg = params.canvas;

    // ── 애니메이션 수명 관리 ────────────────────────────────────────────
    let destroyed = false;
    const cancels = new Set<() => void>();

    const animate = (ms: number, onFrame: (t: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          onFrame(1);
          resolve();
          return;
        }
        const start = performance.now();
        let raf = 0;
        const cancel = (): void => {
          cancelAnimationFrame(raf);
          cancels.delete(cancel);
          resolve();
        };
        const tick = (): void => {
          if (destroyed) {
            cancel();
            return;
          }
          const t = Math.min(1, (performance.now() - start) / ms);
          onFrame(t);
          if (t >= 1) {
            cancels.delete(cancel);
            resolve();
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        cancels.add(cancel);
        raf = requestAnimationFrame(tick);
      });

    // ── 층 (뒤에서 앞으로) ──────────────────────────────────────────────
    const windowLayer = el('g', {});
    const arcLayer = el('g', {});
    const cellLayer = el('g', {});
    const tokenLayer = el('g', {});
    const textLayer = el('g', {});
    svg.appendChild(windowLayer);
    svg.appendChild(arcLayer);
    svg.appendChild(cellLayer);
    svg.appendChild(tokenLayer);
    svg.appendChild(textLayer);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    const note = el('text', {
      x: W / 2,
      y: NOTE_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    textLayer.appendChild(caption);
    textLayer.appendChild(note);

    // ── 표 ──────────────────────────────────────────────────────────────
    let count = 0;
    let cellW = CELL_MAX_W;
    let originX = 0;
    let rects: SVGRectElement[] = [];
    let values: SVGTextElement[] = [];
    let labels: SVGTextElement[] = [];
    let states: CellState[] = [];
    const arcs: Arc[] = [];

    const cx = (i: number): number => originX + i * cellW + cellW / 2;
    const cellLeft = (i: number): number => originX + i * cellW + CELL_GAP / 2;
    const cellMid = CELL_TOP + CELL_H / 2;
    /** 칸 안 값 글자의 baseline. */
    const valueBaseline = CELL_TOP + CELL_H / 2 + 7;

    const paint = (i: number): void => {
      const rect = rects[i];
      const text = values[i];
      const label = labels[i];
      switch (states[i]) {
        case 'empty':
          rect.setAttribute('fill', c.bgSubtle);
          rect.setAttribute('stroke', c.border);
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('stroke-dasharray', '4 4');
          text.setAttribute('fill', c.text);
          label.setAttribute('fill', c.textMuted);
          break;
        case 'filled':
          rect.setAttribute('fill', c.itemDefault);
          rect.setAttribute('stroke', c.border);
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('stroke-dasharray', 'none');
          text.setAttribute('fill', c.text);
          label.setAttribute('fill', c.textMuted);
          break;
        case 'source':
          rect.setAttribute('fill', c.itemComparing);
          rect.setAttribute('stroke', c.itemComparing);
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('stroke-dasharray', 'none');
          text.setAttribute('fill', c.stateInk);
          label.setAttribute('fill', c.text);
          break;
        case 'fresh':
          rect.setAttribute('fill', c.itemPivot);
          rect.setAttribute('stroke', c.itemPivot);
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('stroke-dasharray', 'none');
          text.setAttribute('fill', c.stateInk);
          label.setAttribute('fill', c.text);
          break;
        case 'muted':
          rect.setAttribute('fill', c.bgSubtle);
          rect.setAttribute('stroke', c.border);
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('stroke-dasharray', 'none');
          text.setAttribute('fill', c.textMuted);
          label.setAttribute('fill', c.textMuted);
          break;
        case 'kept':
          rect.setAttribute('fill', c.itemDefault);
          rect.setAttribute('stroke', c.text);
          rect.setAttribute('stroke-width', '2');
          rect.setAttribute('stroke-dasharray', 'none');
          text.setAttribute('fill', c.text);
          label.setAttribute('fill', c.text);
          break;
      }
    };

    const setState = (i: number, s: CellState): void => {
      states[i] = s;
      paint(i);
    };

    /** 직전 걸음에서 방금 채워진 칸을 평범한 칸으로 돌려놓는다. */
    const settleFresh = (): void => {
      for (let i = 0; i < count; i++) if (states[i] === 'fresh') setState(i, 'filled');
    };

    const dimArcs = (): void => {
      for (const arc of arcs) {
        arc.path.setAttribute('stroke', c.textMuted);
        arc.path.setAttribute('stroke-width', '1.5');
        arc.head.setAttribute('fill', c.textMuted);
      }
    };

    const buildTable = (cells: number): void => {
      cellLayer.textContent = '';
      count = cells;
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / Math.max(1, cells)));
      originX = Math.round((W - cells * cellW) / 2);
      rects = [];
      values = [];
      labels = [];
      states = [];

      for (let i = 0; i < cells; i++) {
        const rect = el('rect', {
          x: cellLeft(i),
          y: CELL_TOP,
          width: cellW - CELL_GAP,
          height: CELL_H,
          rx: 6,
        });
        const text = el('text', {
          x: cx(i),
          y: valueBaseline,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xl,
          'font-weight': '600',
        });
        // `T[i]` 는 수식 표기라 표식이다 — 번역 대상이 아니다 (C10).
        const label = el('text', {
          x: cx(i),
          y: INDEX_BASELINE,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        label.textContent = `T[${i}]`;
        cellLayer.appendChild(rect);
        cellLayer.appendChild(text);
        cellLayer.appendChild(label);
        rects.push(rect);
        values.push(text);
        labels.push(label);
        states.push('empty');
        paint(i);
      }
    };

    const clearBoard = (): void => {
      arcLayer.textContent = '';
      tokenLayer.textContent = '';
      windowLayer.textContent = '';
      arcs.length = 0;
      caption.textContent = '';
      note.textContent = '';
      for (let i = 0; i < count; i++) {
        values[i].textContent = '';
        values[i].removeAttribute('transform');
        values[i].setAttribute('opacity', '1');
        setState(i, 'empty');
      }
    };

    // ── 화살 ────────────────────────────────────────────────────────────
    const newArc = (from: number, to: number, rise: number): Arc => {
      const p0: Pt = { x: cx(from), y: CELL_TOP - ARC_END_GAP };
      const p1: Pt = { x: cx(to), y: CELL_TOP - ARC_END_GAP };
      const cp: Pt = { x: (p0.x + p1.x) / 2, y: CELL_TOP - rise };
      const path = el('path', {
        d: '',
        fill: 'none',
        stroke: c.itemComparing,
        'stroke-width': '2.5',
        'stroke-linecap': 'round',
      });
      const head = el('path', { d: '', fill: c.itemComparing, opacity: '0' });
      arcLayer.appendChild(path);
      arcLayer.appendChild(head);
      const arc: Arc = { path, head, p0, cp, p1 };
      arcs.push(arc);
      return arc;
    };

    const drawArc = (arc: Arc, t: number): Pt => {
      let d = '';
      let tip: Pt = arc.p0;
      for (let k = 0; k <= ARC_SAMPLES; k++) {
        const p = qbez(arc.p0, arc.cp, arc.p1, (t * k) / ARC_SAMPLES);
        d += `${k === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
        tip = p;
      }
      arc.path.setAttribute('d', d);
      return tip;
    };

    const showHead = (arc: Arc): void => {
      const dx = arc.p1.x - arc.cp.x;
      const dy = arc.p1.y - arc.cp.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const bx = arc.p1.x - ux * HEAD_LEN;
      const by = arc.p1.y - uy * HEAD_LEN;
      const d =
        `M ${arc.p1.x.toFixed(2)} ${arc.p1.y.toFixed(2)} ` +
        `L ${(bx - uy * HEAD_HALF).toFixed(2)} ${(by + ux * HEAD_HALF).toFixed(2)} ` +
        `L ${(bx + uy * HEAD_HALF).toFixed(2)} ${(by - ux * HEAD_HALF).toFixed(2)} Z`;
      arc.head.setAttribute('d', d);
      arc.head.setAttribute('opacity', '1');
    };

    // ── 값 토큰 ─────────────────────────────────────────────────────────
    const newToken = (value: number, at: Pt): SVGGElement => {
      const g = el('g', { transform: `translate(${at.x} ${at.y})` });
      g.appendChild(el('circle', { cx: 0, cy: 0, r: TOKEN_R, fill: c.itemComparing }));
      const text = el('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': '600',
        fill: c.stateInk,
      });
      text.textContent = String(value);
      g.appendChild(text);
      tokenLayer.appendChild(g);
      return g;
    };

    const moveToken = (g: SVGGElement, at: Pt): void => {
      g.setAttribute('transform', `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`);
    };

    return {
      /** 빈 표를 세운다. 칸은 `cells` 개. */
      init(cells: number): void {
        buildTable(cells);
        clearBoard();
      },

      /** 정의가 주는 값. 계산이 아니므로 화살 없이 왼쪽에서 미끄러져 앉는다. */
      async seedCell(step: { index: number; value: number }, text: string): Promise<void> {
        caption.textContent = text;
        const cell = values[step.index];
        if (!cell) return;
        cell.textContent = String(step.value);
        cell.setAttribute('opacity', '0');
        setState(step.index, 'filled');
        await animate(SEED_MS, (t) => {
          const e = easeOut(t);
          cell.setAttribute('transform', `translate(${(-SEED_SLIDE * (1 - e)).toFixed(2)} 0)`);
          cell.setAttribute('opacity', e.toFixed(3));
        });
        cell.removeAttribute('transform');
        cell.setAttribute('opacity', '1');
      },

      /**
       * 바로 앞 두 칸에서 화살이 뻗어 나와 목표 칸으로 모인다. 화살은 값 토큰이
       * 달려가며 그리고, 두 토큰이 칸 위에서 만나 합이 되어 칸 속으로 들어간다.
       */
      async fillCell(step: FillStep, text: string): Promise<void> {
        caption.textContent = text;
        settleFresh();
        dimArcs();

        const [a, b] = step.from;
        const target = step.index;
        if (!rects[a] || !rects[b] || !rects[target]) return;
        setState(a, 'source');
        setState(b, 'source');

        const arcFar = newArc(a, target, ARC_RISE_FAR);
        const arcNear = newArc(b, target, ARC_RISE_NEAR);
        const tokFar = newToken(step.values[0], arcFar.p0);
        const tokNear = newToken(step.values[1], arcNear.p0);

        await animate(RIDE_MS, (t) => {
          const e = easeInOut(t);
          moveToken(tokFar, drawArc(arcFar, e));
          moveToken(tokNear, drawArc(arcNear, e));
        });
        showHead(arcFar);
        showHead(arcNear);

        // 두 복제본이 칸 속으로 들어가며 합이 된다. 원본은 제자리에 남는다.
        const cell = values[target];
        cell.textContent = String(step.value);
        cell.setAttribute('opacity', '0');
        setState(target, 'fresh');
        const enter: Pt = { x: cx(target), y: cellMid };
        await animate(LAND_MS, (t) => {
          const e = easeOut(t);
          for (const [tok, arc] of [
            [tokFar, arcFar],
            [tokNear, arcNear],
          ] as const) {
            moveToken(tok, {
              x: arc.p1.x + (enter.x - arc.p1.x) * e,
              y: arc.p1.y + (enter.y - arc.p1.y) * e,
            });
            tok.setAttribute('opacity', (1 - e).toFixed(3));
          }
          cell.setAttribute('opacity', e.toFixed(3));
        });
        tokFar.remove();
        tokNear.remove();
        cell.setAttribute('opacity', '1');
        setState(a, 'filled');
        setState(b, 'filled');
      },

      /**
       * 다 찼다. 창 하나가 왼쪽에서 미끄러져 들어와 마지막 두 칸에 앉고, 나머지
       * 칸은 물러난다 — 들고 있어야 할 것은 그 둘뿐이다.
       */
      async finish(step: { keep: [number, number] }, text: string, sub: string): Promise<void> {
        caption.textContent = text;
        note.textContent = sub;
        settleFresh();
        dimArcs();

        const [k0, k1] = step.keep;
        if (!rects[k0] || !rects[k1]) return;
        const restX = cellLeft(k0) - 6;
        const width = cellLeft(k1) + (cellW - CELL_GAP) - cellLeft(k0) + 12;
        // 칸만이 아니라 `T[i]` 표식까지 품는다 — 창 선이 글자를 가로지르지 않게.
        const top = CELL_TOP - 8;
        const rect = el('rect', {
          x: -width - 20,
          y: top,
          width,
          height: INDEX_BASELINE + 8 - top,
          rx: 10,
          fill: c.accent,
          'fill-opacity': '0.22',
          stroke: c.accent,
          'stroke-width': '2',
        });
        windowLayer.appendChild(rect);

        const startX = -width - 20;
        await animate(WINDOW_MS, (t) => {
          const e = easeOut(t);
          rect.setAttribute('x', (startX + (restX - startX) * e).toFixed(2));
        });
        rect.setAttribute('x', String(restX));

        for (let i = 0; i < count; i++) {
          setState(i, i === k0 || i === k1 ? 'kept' : 'muted');
        }
      },

      /** 처음 상태로. `advance` 첫 누름이 부른다. */
      rewind(): void {
        clearBoard();
      },

      destroy(): void {
        destroyed = true;
        for (const cancel of Array.from(cancels)) cancel();
        cancels.clear();
        windowLayer.remove();
        arcLayer.remove();
        cellLayer.remove();
        tokenLayer.remove();
        textLayer.remove();
      },
    };
  },
};
