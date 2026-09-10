/**
 * svm-stage — 선형 SVM (소프트 마진) 전용 시각화.
 *
 * 왼쪽은 점판이다. 이름표로 나뉜 점 열, 두 무리를 가르는 선, 그 선을 한가운데
 * 둔 띠(`−1 ≤ w·x+b ≤ 1`). 띠 안에 든 점에는 테두리가 붙고, 선을 넘어간 점에는
 * 위험색 테두리가 붙는다. 겹침을 켜면 옮겨 오기 전 자리에 유령이 남는다.
 *
 * 오른쪽은 기록장이다. 지금 C 와 선의 식과 폭을 적고, **C 마다 벌어진 폭을
 * 막대로 쌓는다** — C 를 올리면 마진이 좁아진다는 것은 한 값만 보아서는 알 수
 * 없고 셋을 나란히 놓아야 보인다. 겹침을 뒤집으면 자료가 달라지므로 기록장을
 * 비운다.
 *
 * 좌표는 여기서 셈한다 (`initialData` 에는 구조만 있다). 가로세로 축척을 같게
 * 두었다 — 마진 폭은 선에 수직인 거리라 눈금이 어긋나면 폭을 눈으로 견줄 수
 * 없다. viewBox 는 mount 에서 한 번 정하고 그 뒤로 바꾸지 않는다 (S-view).
 *
 * 타이머도 프레임 루프도 두지 않는다. 갱신은 projector 가 부를 때마다 통째로
 * 다시 그리는 것뿐이고, `destroy()` 는 자기 `<g>` 를 떼면 남는 것이 없다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 가로는 이 그림이 정한다. `PIECE_CANVAS_W` 는 조각의 계약이라 완제품이 쓰면
// 조각 폭이 바뀔 때 여기까지 따라 움직인다 — 상관없는 둘이 묶인다.
const CANVAS_W = 620;
const CANVAS_H = 330;

/** 점판 — 정사각형이라야 마진 폭이 눈으로 견줘진다. */
const PLOT_X = 46;
const PLOT_Y = 14;
const PLOT_SIZE = 250;

/** 기록장. */
const PANEL_X = 318;
const PANEL_W = 288;

const CAPTION_X = 46;
const CAPTION_Y = 296;
const CAPTION_LINE = 16;

const POINT_R = 5.5;

/** 이름표 두 갈래를 식별하는 색 (S-view 결정 트리 3 — n 개 카테고리). */
const CLASS_COLORS = categorical(2, 'vivid');
const CLASS_NEG = 0;
const CLASS_POS = 1;

export type StagePoint = { x: number; y: number; label: number };

type Model = {
  step: number;
  w0: number;
  w1: number;
  b: number;
  marginWidth: number;
  violators: number[];
  misplaced: number[];
};

type LedgerRow = { cIndex: number; c: number; marginWidth: number; misplaced: number };

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 소수 셋째 자리까지. 화면에 뜨는 수는 전부 이것을 거친다. */
function f3(x: number): string {
  return (Math.round(x * 1000) / 1000).toFixed(3);
}

/** `w0*x + w1*y + b = t` 를 정사각 영역 안으로 자른다. 두 점이 안 나오면 null. */
function lineInBox(w0: number, w1: number, b: number, t: number, lo: number, hi: number): [Pt, Pt] | null {
  const eps = 1e-9;
  const cand: Pt[] = [];
  const push = (p: Pt): void => {
    if (p.x >= lo - eps && p.x <= hi + eps && p.y >= lo - eps && p.y <= hi + eps) cand.push(p);
  };
  if (Math.abs(w1) > 1e-12) {
    push({ x: lo, y: (t - b - w0 * lo) / w1 });
    push({ x: hi, y: (t - b - w0 * hi) / w1 });
  }
  if (Math.abs(w0) > 1e-12) {
    push({ x: (t - b - w1 * lo) / w0, y: lo });
    push({ x: (t - b - w1 * hi) / w0, y: hi });
  }
  for (let i = 1; i < cand.length; i++) {
    if (Math.hypot(cand[i].x - cand[0].x, cand[i].y - cand[0].y) > 1e-6) return [cand[0], cand[i]];
  }
  return null;
}

/** Sutherland–Hodgman — `keep(p) >= 0` 인 쪽만 남긴다. */
function clipHalfPlane(poly: Pt[], keep: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const c = poly[(i + 1) % poly.length];
    const fa = keep(a);
    const fc2 = keep(c);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fc2 >= 0) {
      const t = fa / (fa - fc2);
      out.push({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t });
    }
  }
  return out;
}

export const svmStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    canvas.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      tr('label.aria', 'Linear SVM with a soft margin — the band narrows as C rises'),
    );

    const root = el('g', {});
    canvas.appendChild(root);

    // ── 상태
    let points: StagePoint[] = [];
    let overlapIndex = -1;
    let overlapAt: Pt = { x: 0, y: 0 };
    let overlap = false;
    let cValue = 1;
    let cIndex = 0;
    let totalSteps = 0;
    let model: Model | null = null;
    let scanned: { index: number; margin: number } | null = null;
    let caption: string[] = [];
    const ledger = new Map<number, LedgerRow>();

    // 축척은 mount 에서 한 번 정하고 바뀌지 않는다 — 겹침으로 옮겨 갈 자리까지
    // 미리 넣어 두어야 토글할 때 그림이 튀지 않는다.
    let lo = 0;
    let hi = 1;

    function fixDomain(): void {
      const xs = points.map((p) => p.x).concat(overlapAt.x);
      const ys = points.map((p) => p.y).concat(overlapAt.y);
      if (xs.length === 0) return;
      // 눈금 이름이 `-1` 로 시작하면 이름표 −1 과 헷갈린다. 0 에서 연다.
      lo = Math.min(0, Math.floor(Math.min(...xs, ...ys)));
      hi = Math.ceil(Math.max(...xs, ...ys)) + 1;
      if (hi - lo < 1) hi = lo + 1;
    }

    const sx = (x: number): number => PLOT_X + ((x - lo) / (hi - lo)) * PLOT_SIZE;
    const sy = (y: number): number => PLOT_Y + PLOT_SIZE - ((y - lo) / (hi - lo)) * PLOT_SIZE;

    function livePoints(): StagePoint[] {
      return points.map((p, i) =>
        overlap && i === overlapIndex ? { x: overlapAt.x, y: overlapAt.y, label: p.label } : p,
      );
    }

    function text(
      x: number,
      y: number,
      s: string,
      opts: { size?: string; fill?: string; family?: string; anchor?: string; weight?: string },
    ): void {
      const node = el('text', {
        x,
        y,
        'font-size': opts.size ?? fontSizes.xs,
        'font-family': opts.family ?? fonts.body,
        fill: opts.fill ?? colors.text,
        'text-anchor': opts.anchor ?? 'start',
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      root.appendChild(node);
    }

    // ── 점판
    function drawPlot(): void {
      root.appendChild(
        el('rect', {
          x: PLOT_X,
          y: PLOT_Y,
          width: PLOT_SIZE,
          height: PLOT_SIZE,
          fill: colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      for (let g = Math.ceil(lo); g <= hi; g++) {
        root.appendChild(
          el('line', {
            x1: sx(g),
            y1: PLOT_Y,
            x2: sx(g),
            y2: PLOT_Y + PLOT_SIZE,
            stroke: colors.border,
            'stroke-width': 0.5,
            opacity: 0.55,
          }),
        );
        root.appendChild(
          el('line', {
            x1: PLOT_X,
            y1: sy(g),
            x2: PLOT_X + PLOT_SIZE,
            y2: sy(g),
            stroke: colors.border,
            'stroke-width': 0.5,
            opacity: 0.55,
          }),
        );
      }
      text(PLOT_X - 6, PLOT_Y + PLOT_SIZE + 3, String(lo), {
        fill: colors.textMuted,
        anchor: 'end',
        family: fonts.mono,
      });
      text(PLOT_X + PLOT_SIZE, PLOT_Y + PLOT_SIZE + 14, String(hi), {
        fill: colors.textMuted,
        anchor: 'end',
        family: fonts.mono,
      });
    }

    function drawBand(m: Model): void {
      if (Math.hypot(m.w0, m.w1) < 1e-9) return;
      const rect: Pt[] = [
        { x: lo, y: lo },
        { x: hi, y: lo },
        { x: hi, y: hi },
        { x: lo, y: hi },
      ];
      const score = (p: Pt): number => m.w0 * p.x + m.w1 * p.y + m.b;
      const band = clipHalfPlane(clipHalfPlane(rect, (p) => score(p) + 1), (p) => 1 - score(p));
      if (band.length >= 3) {
        root.appendChild(
          el('polygon', {
            points: band.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' '),
            fill: colors.bgSubtle,
            stroke: 'none',
          }),
        );
      }
      for (const t of [-1, 1]) {
        const seg = lineInBox(m.w0, m.w1, m.b, t, lo, hi);
        if (!seg) continue;
        root.appendChild(
          el('line', {
            x1: sx(seg[0].x),
            y1: sy(seg[0].y),
            x2: sx(seg[1].x),
            y2: sy(seg[1].y),
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '4 3',
          }),
        );
      }
      const mid = lineInBox(m.w0, m.w1, m.b, 0, lo, hi);
      if (mid) {
        root.appendChild(
          el('line', {
            x1: sx(mid[0].x),
            y1: sy(mid[0].y),
            x2: sx(mid[1].x),
            y2: sy(mid[1].y),
            stroke: colors.text,
            'stroke-width': 2,
          }),
        );
      }
    }

    function drawGhost(): void {
      if (!overlap || overlapIndex < 0 || overlapIndex >= points.length) return;
      const home = points[overlapIndex];
      root.appendChild(
        el('line', {
          x1: sx(home.x),
          y1: sy(home.y),
          x2: sx(overlapAt.x),
          y2: sy(overlapAt.y),
          stroke: colors.ghostOutline,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        }),
      );
      root.appendChild(
        el('circle', {
          cx: sx(home.x),
          cy: sy(home.y),
          r: POINT_R,
          fill: 'none',
          stroke: colors.ghostOutline,
          'stroke-width': 1.2,
          'stroke-dasharray': '2 2',
        }),
      );
    }

    function drawPoints(): void {
      const live = livePoints();
      const violators = new Set(model?.violators ?? []);
      const misplaced = new Set(model?.misplaced ?? []);
      live.forEach((p, i) => {
        const cx = sx(p.x);
        const cy = sy(p.y);
        if (violators.has(i)) {
          root.appendChild(
            el('circle', {
              cx,
              cy,
              r: POINT_R + 3.5,
              fill: 'none',
              stroke: colors.itemComparing,
              'stroke-width': 1.6,
            }),
          );
        }
        if (misplaced.has(i)) {
          root.appendChild(
            el('circle', {
              cx,
              cy,
              r: POINT_R + 6.5,
              fill: 'none',
              stroke: colors.danger,
              'stroke-width': 1.8,
            }),
          );
        }
        if (scanned && scanned.index === i) {
          root.appendChild(
            el('circle', {
              cx,
              cy,
              r: POINT_R + 9.5,
              fill: 'none',
              stroke: colors.accent,
              'stroke-width': 2,
            }),
          );
        }
        root.appendChild(
          el('circle', {
            cx,
            cy,
            r: POINT_R,
            fill: CLASS_COLORS[p.label < 0 ? CLASS_NEG : CLASS_POS],
            stroke: colors.bg,
            'stroke-width': 1,
          }),
        );
      });
    }

    // ── 기록장
    function drawPanel(): void {
      let y = PLOT_Y + 16;
      text(PANEL_X, y, `C = ${String(cValue)}`, {
        size: fontSizes.lg,
        family: fonts.mono,
        weight: '600',
      });
      if (totalSteps > 0 && model) {
        text(
          PANEL_X + PANEL_W,
          y,
          tr('label.step', 'step {done} / {total}', { done: model.step, total: totalSteps }),
          { fill: colors.textMuted, anchor: 'end' },
        );
      }
      y += 22;

      if (model && Math.abs(model.w1) > 1e-9) {
        const slope = -model.w0 / model.w1;
        const intercept = -model.b / model.w1;
        const sign = intercept < 0 ? '-' : '+';
        text(PANEL_X, y, `y = ${f3(slope)}x ${sign} ${f3(Math.abs(intercept))}`, {
          size: fontSizes.sm,
          family: fonts.mono,
        });
      }
      y += 17;
      // `w = 0` 인 여는 장면에서는 폭이 정해지지 않는다 — 0 이라 적으면 거짓말이다.
      if (model && model.marginWidth > 0) {
        text(PANEL_X, y, `2/||w|| = ${f3(model.marginWidth)}`, {
          size: fontSizes.sm,
          family: fonts.mono,
        });
      }
      y += 17;
      if (scanned) {
        text(PANEL_X, y, `m[${scanned.index}] = ${f3(scanned.margin)}`, {
          size: fontSizes.sm,
          family: fonts.mono,
          fill: colors.accent,
        });
      }
      y += 14;

      root.appendChild(
        el('line', {
          x1: PANEL_X,
          y1: y,
          x2: PANEL_X + PANEL_W,
          y2: y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      y += 16;
      text(PANEL_X, y, tr('label.ledger', 'margin width for each C'), { fill: colors.textMuted });
      y += 8;

      // 머리의 `C = 1` 은 표제라 띄우고, 아래 줄의 `C=0.1` 은 표의 칸이라 붙인다.
      const rows = [...ledger.values()].sort((a, b) => a.c - b.c);
      const widest = rows.reduce((mx, r) => Math.max(mx, r.marginWidth), 0.001);
      const barX = PANEL_X + 52;
      const barMax = 150;
      for (const r of rows) {
        y += 19;
        const active = r.cIndex === cIndex;
        text(PANEL_X, y + 4, `C=${String(r.c)}`, {
          family: fonts.mono,
          fill: active ? colors.text : colors.textMuted,
          weight: active ? '600' : '400',
        });
        root.appendChild(
          el('rect', {
            x: barX,
            y: y - 5,
            width: Math.max(1, (r.marginWidth / widest) * barMax),
            height: 10,
            fill: active ? colors.accent : colors.border,
          }),
        );
        text(barX + barMax + 8, y + 4, f3(r.marginWidth), {
          family: fonts.mono,
          fill: active ? colors.text : colors.textMuted,
          anchor: 'start',
        });
        if (r.misplaced > 0) {
          root.appendChild(
            el('circle', { cx: barX - 8, cy: y, r: 3, fill: colors.danger }),
          );
        }
      }

      y = PLOT_Y + 180;
      root.appendChild(
        el('line', {
          x1: PANEL_X,
          y1: y,
          x2: PANEL_X + PANEL_W,
          y2: y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      y += 18;
      root.appendChild(el('circle', { cx: PANEL_X + 5, cy: y - 4, r: 5, fill: CLASS_COLORS[CLASS_NEG] }));
      text(PANEL_X + 15, y, '-1', { family: fonts.mono, fill: colors.textMuted });
      root.appendChild(el('circle', { cx: PANEL_X + 45, cy: y - 4, r: 5, fill: CLASS_COLORS[CLASS_POS] }));
      text(PANEL_X + 55, y, '+1', { family: fonts.mono, fill: colors.textMuted });

      y += 18;
      root.appendChild(
        el('circle', {
          cx: PANEL_X + 5,
          cy: y - 4,
          r: 5,
          fill: 'none',
          stroke: colors.itemComparing,
          'stroke-width': 1.6,
        }),
      );
      text(PANEL_X + 15, y, tr('legend.violator', "inside the band — it still pushes the line"), {
        fill: colors.textMuted,
      });

      y += 18;
      root.appendChild(
        el('circle', {
          cx: PANEL_X + 5,
          cy: y - 4,
          r: 5,
          fill: 'none',
          stroke: colors.danger,
          'stroke-width': 1.8,
        }),
      );
      text(PANEL_X + 15, y, tr('legend.misplaced', "across the line — given up"), {
        fill: colors.textMuted,
      });

      if (overlap) {
        y += 18;
        root.appendChild(
          el('circle', {
            cx: PANEL_X + 5,
            cy: y - 4,
            r: 5,
            fill: 'none',
            stroke: colors.ghostOutline,
            'stroke-width': 1.2,
            'stroke-dasharray': '2 2',
          }),
        );
        text(PANEL_X + 15, y, tr('legend.origin', 'where that point started'), {
          fill: colors.textMuted,
        });
      }
    }

    function drawCaption(): void {
      caption.slice(0, 2).forEach((line, i) => {
        text(CAPTION_X, CAPTION_Y + i * CAPTION_LINE, line, {
          size: fontSizes.sm,
          fill: colors.text,
        });
      });
    }

    function render(): void {
      root.textContent = '';
      drawPlot();
      if (model) drawBand(model);
      drawGhost();
      drawPoints();
      drawPanel();
      drawCaption();
    }

    render();

    return {
      destroy(): void {
        root.remove();
      },

      setPoints(next: StagePoint[], oIndex: number, oAt: Pt, steps: number): void {
        points = next.map((p) => ({ x: p.x, y: p.y, label: p.label }));
        overlapIndex = oIndex;
        overlapAt = { x: oAt.x, y: oAt.y };
        totalSteps = steps;
        fixDomain();
        render();
      },

      setSettings(c: number, index: number, nextOverlap: boolean): void {
        // 자료가 달라졌으면 견줄 것도 달라진다 — 기록장을 비운다.
        if (nextOverlap !== overlap) ledger.clear();
        cValue = c;
        cIndex = index;
        overlap = nextOverlap;
        render();
      },

      setModel(m: Model): void {
        model = m;
        render();
      },

      setScanned(index: number | null, margin: number): void {
        scanned = index === null ? null : { index, margin };
        render();
      },

      record(row: LedgerRow): void {
        ledger.set(row.cIndex, row);
        render();
      },

      setCaption(lines: string[]): void {
        caption = lines;
        render();
      },

      reset(): void {
        model = null;
        scanned = null;
        caption = [];
        overlap = false;
        ledger.clear();
        render();
      },
    };
  },
};
