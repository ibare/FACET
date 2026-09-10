/**
 * project-and-lose-stage — 점이 축으로 **수직으로 떨어지고**, 떨어진 거리가
 * 흔적으로 남았다가 지워진다.
 *
 * ── 이 그림이 하는 일
 *
 * 산점도는 무대이지 주인공이 아니다. 주인공은 **떨어짐**이다. 축이 완만하게
 * 기울어 있으면 그 직각 방향은 거의 수직이고, 그래서 점은 화면에서
 * 곧장 아래(또는 위)로 떨어진다. 떨어진 길이 그대로가 붉은 흔적으로 남고,
 * 그 흔적이 축 쪽으로 빨려 들어가 사라지는 것이 "잃는다" 의 뜻이다.
 * 마지막에는 축 위의 한 자리에서 직각 방향으로 후보 자리들이 줄줄이 서서,
 * 축만 보아서는 원래 자리를 짚을 수 없다는 것을 말한다.
 *
 * ── 자리 셈
 *
 * 가로세로 축척이 같아야 한다. 다르면 직각이 직각으로 보이지 않아 그림이
 * 거짓말을 한다. 그래서 세로에서 축척을 정하고 가로는 남는 만큼 축이 더
 * 뻗는 데 쓴다 — 축은 끝이 없는 선이라 넓어진 폭이 그대로 뜻이 된다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 `PIECE_CANVAS_W` 로 정한다 (S-view). */
const H = 396;

const PAD_X = 34;
const CAPTION_BASE = 22;
const PLOT_TOP = 40;
/** 점판 세로의 **상한**. 실제 높이는 점의 퍼짐에서 역산한다. */
const PLOT_H = 300;
const BAR_TOP = PLOT_TOP + PLOT_H + 18;
const BAR_H = 12;
const BAR_LABEL_BASE = BAR_TOP + BAR_H + 15;

/** 점이 판 가장자리에 붙지 않게 하는 데이터 여백. */
const Y_PAD = 0.22;
const X_PAD_MIN = 0.45;

const R_POINT = 5.5;
const R_BEAD = 4.4;
const R_GHOST = 5.5;
const TRACE_W = 2;
const MARK_W = 3.2;
const DIM = 0.32;

const RISE_MS = 440;
const FALL_MS = 420;
const IMPACT_MS = 130;
const MARK_MS = 260;
const ERASE_MS = 540;
const GUIDE_MS = 240;
const WANDER_MS = 720;
const PULSE_MS = 380;
const FRAME_MS = 16;

/** 직각 방향에 세울 후보 자리의 수 — "여기 어디에서 와도 같다". */
const CANDIDATES = 6;
/** 그 선의 한쪽 길이 **상한**. 실제 길이는 판에서 역산해 잘라 쓴다. */
const GUIDE_HALF_MAX = 118;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const easeIn = (p: number): number => p * p;
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

type Scene = { points: [number, number][] };

/**
 * `initialData` 를 좁히는 자리는 여기 하나다 (S-piece). projector 는 이 값을
 * 쓰지 않으므로 밖으로 내지 않는다.
 */
function readScene(raw: unknown): Scene {
  const data = (raw ?? {}) as Record<string, unknown>;
  const rows = data.points;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('project-and-lose-stage: initialData.points 가 비어 있다');
  }
  const points: [number, number][] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || typeof row[0] !== 'number' || typeof row[1] !== 'number') {
      throw new Error('project-and-lose-stage: initialData.points 의 한 줄이 [x, y] 가 아니다');
    }
    points.push([row[0], row[1]]);
  }
  return { points };
}

/** 점 하나가 화면에서 갖는 것 — 알맹이 · 유령 · 흔적. */
type Bead = {
  ox: number;
  oy: number;
  fx: number;
  fy: number;
  dropped: boolean;
  dot: SVGCircleElement;
  ghost: SVGCircleElement | null;
  trace: SVGLineElement | null;
};

export const projectAndLoseStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const { points } = readScene(params.initialData);

    // ── 자리 셈 ────────────────────────────────────────────────
    const W = PIECE_CANVAS_W;
    const plotW = W - PAD_X * 2;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yLo = Math.min(...ys) - Y_PAD;
    const yHi = Math.max(...ys) + Y_PAD;
    const scale = Math.min(plotW / (xMax - xMin + X_PAD_MIN * 2), PLOT_H / (yHi - yLo));
    const drawH = (yHi - yLo) * scale;
    const plotTop = PLOT_TOP + (PLOT_H - drawH) / 2;
    const xLo = (xMin + xMax) / 2 - plotW / scale / 2;
    const sx = (x: number): number => PAD_X + (x - xLo) * scale;
    const sy = (y: number): number => plotTop + (yHi - y) * scale;

    // ── 기다림 ────────────────────────────────────────────────
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /** 프레임마다 `onFrame(0…1)` 을 부르고 끝나면 풀린다. destroy 하면 즉시 푼다. */
    function tween(ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const step = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = clamp01((Date.now() - started) / ms);
          onFrame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            step();
          }, FRAME_MS);
          timers.add(id);
        };
        onFrame(0);
        const first = setTimeout(() => {
          timers.delete(first);
          step();
        }, FRAME_MS);
        timers.add(first);
      });
    }

    // ── 껍데기 ────────────────────────────────────────────────
    svg.textContent = '';

    const gAxis = el('g');
    const gTrace = el('g');
    const gGhost = el('g');
    const gGuide = el('g');
    const gDot = el('g');
    const gBar = el('g');
    svg.append(gAxis, gTrace, gGhost, gGuide, gDot, gBar);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_BASE,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    svg.appendChild(caption);

    const axisLine = el('line', {
      stroke: c.primary,
      'stroke-width': 2.6,
      'stroke-linecap': 'round',
      opacity: 0,
    });
    const axisLabel = el('text', {
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
      'text-anchor': 'end',
      opacity: 0,
    });
    axisLabel.textContent = t('label.axis', 'axis');
    gAxis.append(axisLine, axisLabel);

    const barRail = el('rect', {
      x: PAD_X,
      y: BAR_TOP,
      width: plotW,
      height: BAR_H,
      rx: 3,
      fill: c.bgSubtle,
      stroke: c.border,
      'stroke-width': 1,
      opacity: 0,
    });
    const barKept = el('rect', { x: PAD_X, y: BAR_TOP, width: 0, height: BAR_H, rx: 2, fill: c.primary });
    const barLost = el('rect', { x: PAD_X, y: BAR_TOP, width: 0, height: BAR_H, rx: 2, fill: c.danger });
    const keptLabel = el('text', {
      x: PAD_X,
      y: BAR_LABEL_BASE,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.text,
      opacity: 0,
    });
    const lostLabel = el('text', {
      x: PAD_X + plotW,
      y: BAR_LABEL_BASE,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.danger,
      opacity: 0,
    });
    gBar.append(barRail, barKept, barLost, keptLabel, lostLabel);

    const beads: Bead[] = points.map(([x, y]) => {
      const dot = el('circle', { cx: sx(x), cy: sy(y), r: 0, fill: c.text });
      gDot.appendChild(dot);
      return { ox: sx(x), oy: sy(y), fx: sx(x), fy: sy(y), dropped: false, dot, ghost: null, trace: null };
    });

    /** 축이 지나는 가운데와 화면에서의 방향. `scene-ready` 가 오면 채워진다. */
    let axis = { midX: 0, midY: 0, ux: 1, uy: 0 };
    let markTag: SVGTextElement | null = null;
    let markedIndex = -1;
    let rings: SVGCircleElement[] = [];

    function clearGroup(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function resetVisuals(): void {
      clearGroup(gTrace);
      clearGroup(gGhost);
      clearGroup(gGuide);
      rings = [];
      markTag = null;
      markedIndex = -1;
      for (const b of beads) {
        b.dropped = false;
        b.ghost = null;
        b.trace = null;
        b.fx = b.ox;
        b.fy = b.oy;
        b.dot.setAttribute('cx', String(b.ox));
        b.dot.setAttribute('cy', String(b.oy));
        b.dot.setAttribute('r', '0');
        b.dot.setAttribute('fill', c.text);
        b.dot.removeAttribute('stroke');
        b.dot.removeAttribute('stroke-width');
      }
      axisLine.setAttribute('opacity', '0');
      axisLabel.setAttribute('opacity', '0');
      barRail.setAttribute('opacity', '0');
      barKept.setAttribute('width', '0');
      barLost.setAttribute('width', '0');
      keptLabel.setAttribute('opacity', '0');
      lostLabel.setAttribute('opacity', '0');
    }

    /**
     * 판 안에 남는 축의 두 끝 (Liang-Barsky). 축은 끝이 없으므로 판이 끝을 정한다.
     */
    function axisSpan(cx: number, cy: number, ux: number, uy: number): [number, number] {
      let tMin = -Infinity;
      let tMax = Infinity;
      const cut = (p: number, q: number): void => {
        if (Math.abs(p) < 1e-9) return;
        const r = q / p;
        if (p < 0) tMin = Math.max(tMin, r);
        else tMax = Math.min(tMax, r);
      };
      cut(-ux, cx - xLo);
      cut(ux, xLo + plotW / scale - cx);
      cut(-uy, cy - yLo);
      cut(uy, yHi - cy);
      return [tMin, tMax];
    }

    /** 직각 방향으로 뻗을 수 있는 한쪽 길이 (화면 픽셀). */
    function guideHalf(bx: number, by: number, px: number, py: number): number {
      const margin = R_GHOST + 6;
      let half = GUIDE_HALF_MAX;
      const cut = (v: number, d: number, lo: number, hi: number): void => {
        if (Math.abs(d) < 1e-9) return;
        half = Math.min(half, Math.max((lo - v) / d, (hi - v) / d));
      };
      cut(bx, px, PAD_X + margin, PAD_X + plotW - margin);
      cut(by, py, plotTop + margin, plotTop + drawH - margin);
      cut(bx, -px, PAD_X + margin, PAD_X + plotW - margin);
      cut(by, -py, plotTop + margin, plotTop + drawH - margin);
      return Math.max(0, half);
    }

    resetVisuals();

    return {
      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 점이 서고, 축이 가운데에서 양쪽으로 자란다. */
      async showScene(centerX: number, centerY: number, angleDeg: number): Promise<void> {
        resetVisuals();
        const rad = (angleDeg * Math.PI) / 180;
        const [tMin, tMax] = axisSpan(centerX, centerY, Math.cos(rad), Math.sin(rad));
        const x1 = sx(centerX + tMin * Math.cos(rad));
        const y1 = sy(centerY + tMin * Math.sin(rad));
        const x2 = sx(centerX + tMax * Math.cos(rad));
        const y2 = sy(centerY + tMax * Math.sin(rad));
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        axis = {
          midX: sx(centerX),
          midY: sy(centerY),
          ux: (x2 - x1) / len,
          uy: (y2 - y1) / len,
        };

        axisLine.setAttribute('opacity', '1');
        const last = beads.length - 1 || 1;
        await tween(RISE_MS, (p) => {
          const grow = easeOut(p);
          axisLine.setAttribute('x1', String(lerp(axis.midX, x1, grow)));
          axisLine.setAttribute('y1', String(lerp(axis.midY, y1, grow)));
          axisLine.setAttribute('x2', String(lerp(axis.midX, x2, grow)));
          axisLine.setAttribute('y2', String(lerp(axis.midY, y2, grow)));
          beads.forEach((b, i) => {
            const local = clamp01((p - (i / last) * 0.5) / 0.5);
            b.dot.setAttribute('r', String(R_POINT * easeOut(local)));
          });
        });

        // 축 이름은 오른쪽 끝에서 조금 물러나 선 위쪽에 눕히지 않고 둔다 —
        // 열한 픽셀짜리 한 글자는 기울이면 읽히지 않는다.
        axisLabel.setAttribute('x', String(x2 - axis.ux * 14 + axis.uy * 16));
        axisLabel.setAttribute('y', String(y2 - axis.uy * 14 - axis.ux * 16));
        axisLabel.setAttribute('opacity', '1');
      },

      /** 한 무리가 축까지 직각으로 떨어진다. 지나온 길이 흔적으로 남는다. */
      async dropPoints(indices: number[], footXs: number[], footYs: number[]): Promise<void> {
        const wave: Bead[] = [];
        indices.forEach((index, k) => {
          const b = beads[index];
          if (!b || b.dropped) return;
          b.fx = sx(footXs[k]);
          b.fy = sy(footYs[k]);
          b.ghost = el('circle', {
            cx: b.ox,
            cy: b.oy,
            r: 0,
            fill: 'none',
            stroke: c.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '2 2',
          });
          b.trace = el('line', {
            x1: b.ox,
            y1: b.oy,
            x2: b.ox,
            y2: b.oy,
            stroke: c.danger,
            'stroke-width': TRACE_W,
            'stroke-linecap': 'round',
          });
          gGhost.appendChild(b.ghost);
          gTrace.appendChild(b.trace);
          wave.push(b);
        });
        if (wave.length === 0) return;

        await tween(FALL_MS, (p) => {
          const fall = easeIn(p);
          for (const b of wave) {
            const x = lerp(b.ox, b.fx, fall);
            const y = lerp(b.oy, b.fy, fall);
            b.dot.setAttribute('cx', String(x));
            b.dot.setAttribute('cy', String(y));
            b.trace?.setAttribute('x2', String(x));
            b.trace?.setAttribute('y2', String(y));
            b.ghost?.setAttribute('r', String(R_GHOST * clamp01(p / 0.3)));
          }
        });

        for (const b of wave) {
          b.dropped = true;
          b.dot.setAttribute('stroke', c.bg);
          b.dot.setAttribute('stroke-width', '1.4');
        }
        // 닿는 순간의 되튐 — 커졌다가 축 위의 작은 알로 앉는다.
        await tween(IMPACT_MS, (p) => {
          const r = lerp(R_POINT * 1.35, R_BEAD, easeOut(p));
          for (const b of wave) b.dot.setAttribute('r', String(r));
        });
      },

      /** 가장 멀리 떨어진 하나를 짚고, 그 길이를 곁에 적는다. */
      async markLongest(index: number, maxDist: number): Promise<void> {
        const target = beads[index];
        if (!target) return;
        markedIndex = index;

        markTag = el('text', {
          x: (target.ox + target.fx) / 2 + 10,
          y: (target.oy + target.fy) / 2 + 4,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.itemActive,
          opacity: 0,
        });
        markTag.textContent = maxDist.toFixed(2);
        gGhost.appendChild(markTag);

        target.trace?.setAttribute('stroke', c.itemActive);
        target.trace?.setAttribute('stroke-width', String(MARK_W));
        target.ghost?.setAttribute('stroke', c.itemActive);
        target.dot.setAttribute('fill', c.itemActive);

        const others = beads.filter((b, i) => i !== index && b.trace);
        await tween(MARK_MS, (p) => {
          const dim = String(lerp(1, DIM, easeInOut(p)));
          for (const b of others) {
            b.trace?.setAttribute('opacity', dim);
            b.ghost?.setAttribute('opacity', dim);
          }
          markTag?.setAttribute('opacity', String(easeOut(p)));
          markTag?.setAttribute('x', String((target.ox + target.fx) / 2 + lerp(2, 10, easeOut(p))));
        });
      },

      /** 흔적이 축으로 빨려 들어가 사라지고, 잃은 몫이 자로 남는다. */
      async collapseTraces(keepPct: number, losePct: number): Promise<void> {
        const keptW = (plotW * keepPct) / 100;
        const lostW = plotW - keptW;
        keptLabel.textContent = t('label.kept', 'Kept by the axis {pct}%', { pct: keepPct.toFixed(1) });
        lostLabel.textContent = t('label.lost', 'Lost {pct}%', { pct: losePct.toFixed(1) });
        barRail.setAttribute('opacity', '1');

        const marked = markedIndex >= 0 ? beads[markedIndex] : undefined;
        await tween(ERASE_MS, (p) => {
          const gone = easeInOut(p);
          for (const b of beads) {
            if (!b.trace) continue;
            b.trace.setAttribute('x1', String(lerp(b.ox, b.fx, gone)));
            b.trace.setAttribute('y1', String(lerp(b.oy, b.fy, gone)));
            b.ghost?.setAttribute('cx', String(lerp(b.ox, b.fx, gone)));
            b.ghost?.setAttribute('cy', String(lerp(b.oy, b.fy, gone)));
            b.ghost?.setAttribute('r', String(R_GHOST * (1 - gone)));
          }
          if (marked && markTag) {
            markTag.setAttribute('x', String(lerp((marked.ox + marked.fx) / 2 + 10, marked.fx + 10, gone)));
            markTag.setAttribute('y', String(lerp((marked.oy + marked.fy) / 2 + 4, marked.fy + 4, gone)));
            markTag.setAttribute('opacity', String(1 - gone));
          }
          barKept.setAttribute('width', String(keptW * gone));
          barLost.setAttribute('x', String(PAD_X + keptW * gone));
          barLost.setAttribute('width', String(lostW * gone));
          keptLabel.setAttribute('opacity', String(clamp01((p - 0.55) / 0.45)));
          lostLabel.setAttribute('opacity', String(clamp01((p - 0.55) / 0.45)));
        });

        clearGroup(gTrace);
        clearGroup(gGhost);
        markTag = null;
        for (const b of beads) {
          b.trace = null;
          b.ghost = null;
        }
      },

      /** 축 위의 한 자리에서 직각으로 — 어느 자리에서 와도 같다. */
      async showAmbiguity(index: number): Promise<void> {
        const target = beads[index];
        if (!target) return;
        const px = -axis.uy;
        const py = axis.ux;
        const half = guideHalf(target.fx, target.fy, px, py);
        const ax = target.fx - px * half;
        const ay = target.fy - py * half;
        const bx = target.fx + px * half;
        const by = target.fy + py * half;

        const guide = el('line', {
          x1: target.fx,
          y1: target.fy,
          x2: target.fx,
          y2: target.fy,
          stroke: c.itemActive,
          'stroke-width': 1.4,
          'stroke-dasharray': '4 4',
          opacity: 0.75,
        });
        gGuide.appendChild(guide);
        await tween(GUIDE_MS, (p) => {
          const grow = easeOut(p);
          guide.setAttribute('x1', String(lerp(target.fx, ax, grow)));
          guide.setAttribute('y1', String(lerp(target.fy, ay, grow)));
          guide.setAttribute('x2', String(lerp(target.fx, bx, grow)));
          guide.setAttribute('y2', String(lerp(target.fy, by, grow)));
        });

        // 빈 고리 하나가 아래 끝에서 위 끝으로 올라가며 자기 자국을 남긴다.
        rings = [];
        const stops: Array<[number, number]> = [];
        for (let i = 0; i < CANDIDATES; i += 1) {
          const q = i / (CANDIDATES - 1);
          stops.push([lerp(ax, bx, q), lerp(ay, by, q)]);
          const ring = el('circle', {
            cx: lerp(ax, bx, q),
            cy: lerp(ay, by, q),
            r: 0,
            fill: 'none',
            stroke: c.itemActive,
            'stroke-width': 1.6,
            'stroke-dasharray': '2 2',
            opacity: 0.6,
          });
          gGuide.appendChild(ring);
          rings.push(ring);
        }
        const walker = el('circle', {
          cx: ax,
          cy: ay,
          r: R_GHOST,
          fill: 'none',
          stroke: c.itemActive,
          'stroke-width': 2,
        });
        gGuide.appendChild(walker);

        await tween(WANDER_MS, (p) => {
          walker.setAttribute('cx', String(lerp(ax, bx, p)));
          walker.setAttribute('cy', String(lerp(ay, by, p)));
          rings.forEach((ring, i) => {
            const q = i / (CANDIDATES - 1);
            ring.setAttribute('r', String(R_GHOST * clamp01((p - q) / 0.12)));
          });
        });
        walker.remove();
        rings.forEach((ring, i) => {
          const [rx, ry] = stops[i];
          ring.setAttribute('cx', String(rx));
          ring.setAttribute('cy', String(ry));
          ring.setAttribute('r', String(R_GHOST));
        });
      },

      /** 후보들이 한 번 함께 부푼다 — 어느 것이었는지 말할 길이 없다. */
      async finish(): Promise<void> {
        if (rings.length === 0) return;
        await tween(PULSE_MS, (p) => {
          const wave = Math.sin(p * Math.PI);
          for (const ring of rings) ring.setAttribute('r', String(R_GHOST * (1 + 0.4 * wave)));
        });
        for (const ring of rings) ring.setAttribute('r', String(R_GHOST));
      },

      rewind(): void {
        resetVisuals();
        caption.textContent = '';
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
