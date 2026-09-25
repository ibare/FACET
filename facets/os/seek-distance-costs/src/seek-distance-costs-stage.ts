/**
 * seek-distance-costs 무대 — 위에는 실린더 축과 팔, 아래에는 요청마다 시간 막대.
 *
 * 축과 막대는 같은 척도를 쓴다: 실린더 하나를 옮겨 가는 폭이 곧 그 탐색 ms 의 막대 폭이다.
 * 그래서 팔이 축 위를 지나간 길이가 그대로 아래로 흘러내려 그 요청의 탐색 막대가 되고,
 * 뒤이어 요청마다 같은 폭의 고정분(회전 + 전송)이 붙는다. 먼 요청은 막대가 길고,
 * 가까운 요청은 거의 고정분만 남는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { SeekScene, ServedRequest } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 세로 자리 — 캔버스 세로는 고정이라 줄 간격이 요청 수에 맞춰 줄어든다
const LEGEND_Y = 16;
const AXIS_Y = 64;
const ROWS_TOP = 120;
const SUM_Y = H - 50;
const CAPTION_Y = H - 28;
const NOTE_Y = H - 8;
const ROW_PITCH_MAX = 34;

// 가로 여백 — 폭은 캔버스에서 역산한다
const PAD = 16;
const ROW_LABEL_W = 44;
const MS_LABEL_W = 64;

const FIXED_GROW_MS = 420;

type Geometry = {
  x0: number;
  /** 실린더 하나의 폭 = msPerCylinder 만큼의 막대 폭 */
  k: number;
  pxPerMs: number;
  pitch: number;
  barH: number;
  cylX(c: number): number;
  rowTop(i: number): number;
};

type Handles = {
  arm: SVGGElement;
  trail: SVGLineElement | null;
  pour: SVGPolygonElement | null;
  seek: SVGRectElement | null;
  fixed: SVGRectElement | null;
  ms: SVGTextElement | null;
  tie: SVGGElement | null;
};

function round2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function msText(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1);
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function geometry(scene: SeekScene): Geometry {
  const { cylinders, msPerCylinder, fixedMs, requests } = scene.base;
  const x0 = PAD + ROW_LABEL_W;
  const barAvail = PIECE_CANVAS_W - x0 - MS_LABEL_W - PAD;
  // 가장 먼 거리(끝에서 끝)의 탐색에 고정분까지 붙여도 막대가 폭 안에 들게 척도를 정한다
  const units = cylinders - 1 + fixedMs / msPerCylinder;
  const k = barAvail / units;
  const pitch = Math.min(ROW_PITCH_MAX, (SUM_Y - 20 - ROWS_TOP) / requests.length);
  const barH = Math.min(16, pitch * 0.55);
  return {
    x0,
    k,
    pxPerMs: k / msPerCylinder,
    pitch,
    barH,
    cylX: (c) => x0 + c * k,
    rowTop: (i) => ROWS_TOP + i * pitch + (pitch - barH) / 2,
  };
}

/** 축 아래 요청 번호가 겹치지 않게 층을 나눈다 — 실린더 차례로 훑어 앞 글자와 가까우면 한 층 내린다. */
function labelLevels(requests: number[], k: number): number[] {
  const order = requests.map((c, i) => ({ c, i })).sort((a, b) => a.c - b.c);
  const lastX: number[] = [];
  const levels = requests.map(() => 0);
  const minGap = parseFloat(fontSizes.xs) * 2.4;
  for (const { c, i } of order) {
    const x = c * k;
    let level = 0;
    while (lastX[level] !== undefined && x - (lastX[level] as number) < minGap) level += 1;
    lastX[level] = x;
    levels[i] = level;
  }
  return levels;
}

export const seekDistanceCostsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const fontXs = parseFloat(fontSizes.xs);
    const fontSm = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attrs)) {
        node.setAttribute(name, typeof value === 'number' ? String(round2(value)) : value);
      }
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      body: string,
      style: { size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': style.size ?? fontXs,
        fill: style.fill ?? colors.text,
        'text-anchor': style.anchor ?? 'start',
      });
      if (style.weight !== undefined) node.setAttribute('font-weight', String(style.weight));
      node.textContent = body;
      return node;
    }

    function pourPoints(g: Geometry, fromC: number, atC: number, row: number, seekW: number): string {
      const a = g.cylX(Math.min(fromC, atC));
      const b = g.cylX(Math.max(fromC, atC));
      const top = AXIS_Y + 3;
      const bottom = g.rowTop(row);
      return [
        [a, top],
        [b, top],
        [g.x0 + seekW, bottom],
        [g.x0, bottom],
      ]
        .map(([x, y]) => `${round2(x as number)},${round2(y as number)}`)
        .join(' ');
    }

    function drawStatic(scene: SeekScene): Handles {
      svg.textContent = '';
      const g = geometry(scene);
      const { base } = scene;
      const current: ServedRequest | null =
        scene.step.kind === 'serve' ? (scene.served[scene.served.length - 1] ?? null) : null;
      const servedIdx = new Set(scene.served.map((s) => s.index));

      // 범례 — 막대의 두 몫
      const legend = el(svg, 'g', {});
      el(legend, 'rect', { x: PAD, y: LEGEND_Y - 9, width: 12, height: 10, rx: 2, fill: colors.primary });
      write(legend, PAD + 17, LEGEND_Y, t('legend.seek', 'Seek'), { fill: colors.textMuted });
      const fixedLegendX = PAD + 110;
      el(legend, 'rect', {
        x: fixedLegendX,
        y: LEGEND_Y - 9,
        width: 12,
        height: 10,
        rx: 2,
        fill: colors.border,
        stroke: colors.textMuted,
        'stroke-width': 1,
      });
      write(legend, fixedLegendX + 17, LEGEND_Y, t('legend.fixed', 'Rotation + transfer'), {
        fill: colors.textMuted,
      });

      // 실린더 축
      const axisEnd = g.cylX(base.cylinders - 1);
      el(svg, 'line', {
        x1: g.x0,
        y1: AXIS_Y,
        x2: axisEnd,
        y2: AXIS_Y,
        stroke: colors.textMuted,
        'stroke-width': 1.5,
      });
      write(svg, g.x0 - 6, AXIS_Y + 4, '0', { fill: colors.textMuted, anchor: 'end' });
      write(svg, axisEnd + 6, AXIS_Y + 4, String(base.cylinders - 1), { fill: colors.textMuted });
      write(svg, axisEnd + 6, AXIS_Y + 18, t('label.cylinder', 'Cylinder'), { fill: colors.textMuted });

      // 이번 걸음에 팔이 지나간 길 — 축 위의 굵은 선과 막대로 흘러내리는 띠
      let trail: SVGLineElement | null = null;
      let pour: SVGPolygonElement | null = null;
      if (current) {
        pour = el(svg, 'polygon', {
          points: pourPoints(g, current.from, current.to, current.index, current.distance * g.k),
          fill: colors.primary,
          'fill-opacity': 0.14,
        });
        trail = el(svg, 'line', {
          x1: g.cylX(current.from),
          y1: AXIS_Y,
          x2: g.cylX(current.to),
          y2: AXIS_Y,
          stroke: colors.primary,
          'stroke-width': 4,
          'stroke-linecap': 'round',
        });
      }

      // 요청 자리
      const levels = labelLevels(base.requests, g.k);
      base.requests.forEach((c, i) => {
        const isCurrent = current !== null && current.index === i;
        const done = servedIdx.has(i);
        const tone = isCurrent ? colors.primary : done ? colors.textMuted : colors.text;
        const x = g.cylX(c);
        el(svg, 'circle', {
          cx: x,
          cy: AXIS_Y,
          r: 4,
          fill: done ? tone : colors.bg,
          stroke: tone,
          'stroke-width': 1.5,
        });
        const ly = AXIS_Y + 20 + (levels[i] ?? 0) * (fontXs + 3);
        write(svg, x, ly, String(c), {
          fill: tone,
          anchor: 'middle',
          ...(isCurrent ? { weight: 600 } : {}),
        });
      });

      // 팔 — 축 위에 선 삼각형
      const arm = el(svg, 'g', { transform: `translate(${round2(g.cylX(scene.arm))},0)` });
      el(arm, 'path', {
        d: `M0,${AXIS_Y - 5} L-6,${AXIS_Y - 16} L6,${AXIS_Y - 16} Z`,
        fill: colors.text,
      });
      write(arm, 0, AXIS_Y - 21, t('label.arm', 'Arm'), { fill: colors.text, anchor: 'middle', weight: 600 });

      // 요청마다 시간 막대 — 온 차례대로
      let seek: SVGRectElement | null = null;
      let fixed: SVGRectElement | null = null;
      let ms: SVGTextElement | null = null;
      const fixedW = base.fixedMs * g.pxPerMs;
      base.requests.forEach((c, i) => {
        const top = g.rowTop(i);
        const mid = top + g.barH / 2;
        const isCurrent = current !== null && current.index === i;
        const row = scene.served.find((s) => s.index === i);
        write(svg, g.x0 - 8, mid + fontSm * 0.35, String(c), {
          size: fontSm,
          fill: row ? colors.text : colors.textMuted,
          anchor: 'end',
          ...(isCurrent ? { weight: 600 } : {}),
        });
        if (!row) {
          el(svg, 'line', {
            x1: g.x0,
            y1: mid,
            x2: g.x0 + fixedW,
            y2: mid,
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 3',
          });
          return;
        }
        const seekW = row.seekMs * g.pxPerMs;
        const seekRect = el(svg, 'rect', {
          x: g.x0,
          y: top,
          width: seekW,
          height: g.barH,
          fill: colors.primary,
          'fill-opacity': isCurrent ? 1 : 0.7,
        });
        const fixedRect = el(svg, 'rect', {
          x: g.x0 + seekW,
          y: top,
          width: fixedW,
          height: g.barH,
          fill: colors.border,
          stroke: colors.textMuted,
          'stroke-width': 1,
        });
        const msNode = write(
          svg,
          g.x0 + seekW + fixedW + 6,
          mid + fontSm * 0.35,
          t('label.ms', '{ms} ms', { ms: msText(row.totalMs) }),
          { size: fontSm, fill: colors.text, ...(isCurrent ? { weight: 600 } : {}) },
        );
        if (isCurrent) {
          seek = seekRect;
          fixed = fixedRect;
          ms = msNode;
        }
      });

      // 거리가 같은 앞 요청이 있으면 두 막대의 끝을 한 세로선으로 잇는다
      let tie: SVGGElement | null = null;
      if (current && current.sameAs.length > 0) {
        tie = el(svg, 'g', {});
        const endX = g.x0 + current.totalMs * g.pxPerMs;
        const rows = [...current.sameAs, current.index];
        const y1 = g.rowTop(Math.min(...rows)) - 4;
        const y2 = g.rowTop(Math.max(...rows)) + g.barH + 4;
        el(tie, 'line', {
          x1: endX,
          y1,
          x2: endX,
          y2,
          stroke: colors.text,
          'stroke-width': 1.2,
          'stroke-dasharray': '4 3',
        });
        const earlier = current.sameAs.map((i) => String(base.requests[i])).join(', ');
        write(tie, PAD, NOTE_Y, t('caption.same', 'Same distance as request {c} · Same time', { c: earlier }), {
          size: fontSm,
          fill: colors.textMuted,
        });
      }

      // 합과 캡션
      if (scene.served.length > 0) {
        write(
          svg,
          PAD,
          SUM_Y,
          t('caption.sum', 'Total: seek {seek} ms + fixed {fixed} ms = {total} ms', {
            seek: msText(scene.sums.seekMs),
            fixed: msText(scene.sums.fixedMs),
            total: msText(scene.sums.totalMs),
          }),
          { size: fontSm, fill: colors.textMuted },
        );
      }
      const caption = current
        ? t('caption.serve', '{from} → {to} · Distance {d} × {per} ms + fixed {fixed} ms = {total} ms', {
            from: current.from,
            to: current.to,
            d: current.distance,
            per: String(base.msPerCylinder),
            fixed: msText(base.fixedMs),
            total: msText(current.totalMs),
          })
        : t('caption.start', 'Arm: cylinder {c} · Waiting requests: {n}', {
            c: base.start,
            n: base.requests.length,
          });
      write(svg, PAD, CAPTION_Y, caption, { size: fontSm, fill: colors.text, weight: 600 });

      return { arm, trail, pour, seek, fixed, ms, tie };
    }

    function tween(duration: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const began = performance.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - began) / duration);
          frame(easeInOut(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function flow(scene: SeekScene, current: ServedRequest, h: Handles, mine: number): Promise<void> {
      const g = geometry(scene);
      const seekFull = current.seekMs * g.pxPerMs;
      const fixedFull = scene.base.fixedMs * g.pxPerMs;
      const at = (p: number): number => current.from + (current.to - current.from) * p;
      const hidden = [h.fixed, h.ms, h.tie];

      // 정적 그림은 끝 자리에 서 있다 — 아직 못 온 만큼으로 되돌려 놓고 흘린다
      const placeSeek = (p: number): void => {
        h.arm.setAttribute('transform', `translate(${round2(g.cylX(at(p)))},0)`);
        h.trail?.setAttribute('x2', String(round2(g.cylX(at(p)))));
        h.seek?.setAttribute('width', String(round2(seekFull * p)));
        h.pour?.setAttribute('points', pourPoints(g, current.from, at(p), current.index, seekFull * p));
      };
      for (const node of hidden) node?.setAttribute('visibility', 'hidden');
      placeSeek(0);

      // 팔이 옮겨 가는 동안 탐색 막대가 같은 폭으로 늘어난다 — 먼 요청일수록 오래 걸린다
      await tween(150 + current.distance * 7, mine, placeSeek);
      if (destroyed || mine !== gen) return;

      // 옮겨 간 뒤 고정분이 붙는다 — 요청마다 같은 폭
      h.fixed?.removeAttribute('visibility');
      h.fixed?.setAttribute('width', '0');
      await tween(FIXED_GROW_MS, mine, (p) => {
        h.fixed?.setAttribute('width', String(round2(fixedFull * p)));
      });
      if (destroyed || mine !== gen) return;
      drawStatic(scene);
    }

    return {
      render(next: SeekScene, prev: SeekScene | null, opts: { animate: boolean }): Promise<void> | void {
        if (destroyed) return;
        const mine = (gen += 1);
        const handles = drawStatic(next);
        if (!opts.animate || prev === null) return;
        const current = next.step.kind === 'serve' ? next.served[next.served.length - 1] : undefined;
        // 한 요청을 막 처리한 걸음만 흘린다 — 되짚어 건너뛸 때는 곧바로 선다
        if (!current || next.served.length !== prev.served.length + 1) return;
        return flow(next, current, handles, mine);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
