/**
 * dense-neighborhood-stage — 불이 번지는 들판과, 거리 하나짜리 눈금.
 *
 * ── 화면을 둘로 가른 까닭
 *
 * 왼쪽은 점이 놓인 들판이다. 여기서 일어나는 일은 하나 — **번짐**이다. 불씨가
 * 놓이면 그 자리에서 eps 짜리 원이 자라 이웃을 삼키고, 삼킨 이웃에서 다시 원이
 * 자라며 앞의 원은 오므라든다. 원이 옮겨 다니는 것이 곧 앞자락(frontier)이다.
 *
 * 오른쪽은 산점도가 아니라 **거리 한 축**이다. 번짐이 가른 모든 쌍의 거리가
 * 이 축에 떨어진다. eps 는 축을 가로지르는 한 줄이고, 아래에 떨어진 것은 이어졌고
 * 위에 떨어진 것은 못 이었다. 무리가 둘로 갈리는 까닭 전부가 이 두 무더기 사이의
 * 빈틈이라, 그 빈틈을 눈으로 재게 하려고 축을 따로 세웠다.
 *
 * 들판의 좌표는 자료에서 역산한다 (S-piece). 원이 원으로 보여야 하므로 들판은
 * 정사각이고, 가로세로 축척이 같다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

// ── 캔버스. 가로는 러너가 PIECE_CANVAS_W 로 정하고, 세로는 그림이 정한다 (S-view).
const W = PIECE_CANVAS_W;
const H = 360;
const PAD = 16;
const TOP = 12;
const GAP = 18;
/** 들판은 정사각이다 — 축척이 갈리면 eps 원이 타원이 된다. */
const FIELD = 306;
const PANEL_X = PAD + FIELD + GAP;
const AXIS_X = PANEL_X + 34;
const PLOT_X0 = AXIS_X + 14;
const DOT_STEP = 11;
const DOT_MAX_X = W - PAD - 6;
/** 눈금의 위아래. 축 제목과 눈금 글자가 판 테두리에 물리지 않게 안으로 들인다. */
const PLOT_TOP = TOP + 34;
const PLOT_BOT = TOP + FIELD - 14;
const PLOT_H = PLOT_BOT - PLOT_TOP;
const CAPTION_Y = TOP + FIELD + 28;

// ── 지속시간. 총 재생 길이를 줄이려면 stepMs 가 아니라 여기를 줄인다 (S-piece).
const LINK_MS = 200;
const WAVE_MS = 280;
const GAP_MS = 420;
const SETTLE_MS = 320;

const DOT_BUCKET = 0.07;
const PT_R = 4.5;
const PT_R_ON = 6;

export type DenseLink = { from: number; to: number; dist: number };
export type IgniteInput = { index: number; cluster: number; neighborCount: number };
export type SpreadInput = { cluster: number; links: DenseLink[]; rejected: number | null };
export type BlockedInput = { from: number; to: number; dist: number };

type Scene = {
  points: { x: number; y: number }[];
  eps: number;
};

/**
 * `initialData` 를 좁힌다. 받는 자리는 mount 하나뿐이다 (S-piece) — projector 가
 * 같은 것을 다시 좁혀 밀어 넣지 않는다.
 */
function readScene(data: unknown): Scene {
  if (typeof data !== 'object' || data === null) return { points: [], eps: 0 };
  const d = data as Record<string, unknown>;
  const raw = Array.isArray(d.points) ? d.points : [];
  const points: { x: number; y: number }[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Record<string, unknown>;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    points.push({ x: p.x, y: p.y });
  }
  return { points, eps: typeof d.eps === 'number' ? d.eps : 0 };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 토큰 hex 에 알파를 입힌다 — 색 리터럴이 아니라 순수 변환이다 (S-view). */
function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m === null) return hex;
  const v = parseInt(m[1] ?? '0', 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}

export const denseNeighborhoodStageView: CanvasView = {
  canvas: { height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);
    /** 무리 둘을 갈라 보이는 식별색 (S-view 결정 트리 3). */
    const clusterInk = categorical(2, 'vivid');

    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    // ── 자료 좌표 → 화면 좌표. 점과 eps 원이 다 들어가게 잡고, 가로세로를 같게 둔다.
    const eps = scene.eps;
    let spanX = 1;
    let spanY = 1;
    let midX = 0;
    let midY = 0;
    if (scene.points.length > 0) {
      const xs = scene.points.map((p) => p.x);
      const ys = scene.points.map((p) => p.y);
      const x0 = Math.min(...xs) - eps;
      const x1 = Math.max(...xs) + eps;
      const y0 = Math.min(...ys) - eps;
      const y1 = Math.max(...ys) + eps;
      spanX = x1 - x0;
      spanY = y1 - y0;
      midX = (x0 + x1) / 2;
      midY = (y0 + y1) / 2;
    }
    const scale = FIELD / (Math.max(spanX, spanY, 0.001) * 1.02);
    const epsR = eps * scale;
    const fx = (x: number): number => PAD + FIELD / 2 + (x - midX) * scale;
    const fy = (y: number): number => TOP + FIELD / 2 - (y - midY) * scale;

    // ── 오른쪽 축. 0 부터 eps 의 두 곱까지. eps 가 한가운데 줄이 된다.
    const dMax = Math.max(eps * 2, 0.001);
    const py = (d: number): number => PLOT_BOT - (Math.min(d, dMax) / dMax) * PLOT_H;

    // ── 뼈대
    while (svg.firstChild !== null) svg.removeChild(svg.firstChild);

    svg.appendChild(
      el('rect', {
        x: PAD, y: TOP, width: FIELD, height: FIELD,
        rx: 6, fill: c.bgSubtle, stroke: c.border,
      }),
    );
    svg.appendChild(
      el('rect', {
        x: PANEL_X, y: TOP, width: W - PAD - PANEL_X, height: FIELD,
        rx: 6, fill: c.bg, stroke: c.border,
      }),
    );

    const gDisk = el('g', {});
    const gLink = el('g', {});
    const gGap = el('g', {});
    const gPoint = el('g', {});
    const gBadge = el('g', {});
    const gDot = el('g', {});
    for (const g of [gDisk, gLink, gGap, gPoint, gBadge, gDot]) svg.appendChild(g);

    // 축과 눈금
    const axisTitle = el('text', {
      x: PANEL_X + 12, y: TOP + 20,
      'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
    });
    axisTitle.textContent = tr('label.pairDistance', 'distance between the two points');
    svg.appendChild(axisTitle);

    svg.appendChild(
      el('line', { x1: AXIS_X, y1: PLOT_BOT, x2: AXIS_X, y2: PLOT_TOP, stroke: c.border }),
    );
    for (const v of [0, eps, dMax]) {
      const y = py(v);
      svg.appendChild(el('line', { x1: AXIS_X - 4, y1: y, x2: AXIS_X, y2: y, stroke: c.border }));
      const label = el('text', {
        x: AXIS_X - 7, y: y + 3.5,
        'text-anchor': 'end',
        'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      label.textContent = v.toFixed(2);
      svg.appendChild(label);
    }

    // eps 문턱. 이 줄 하나가 무리를 가른다.
    const epsY = py(eps);
    svg.appendChild(
      el('line', {
        x1: AXIS_X, y1: epsY, x2: W - PAD, y2: epsY,
        stroke: c.text, 'stroke-width': 1.2, 'stroke-dasharray': '5 4',
      }),
    );
    const epsTag = el('text', {
      x: AXIS_X + 4, y: epsY - 6,
      'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text,
    });
    epsTag.textContent = `eps = ${eps.toFixed(2)}`;
    svg.appendChild(epsTag);

    const farTag = el('text', {
      x: W - PAD - 4, y: epsY - 6,
      'text-anchor': 'end',
      'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
    });
    farTag.textContent = tr('label.tooFar', 'too far');
    svg.appendChild(farTag);

    const nearTag = el('text', {
      x: W - PAD - 4, y: epsY + 15,
      'text-anchor': 'end',
      'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
    });
    nearTag.textContent = tr('label.linked', 'linked');
    svg.appendChild(nearTag);

    const caption = el('text', {
      x: W / 2, y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text,
    });
    svg.appendChild(caption);

    // ── 점
    const dots: SVGCircleElement[] = scene.points.map((p) => {
      const node = el('circle', {
        cx: fx(p.x), cy: fy(p.y), r: PT_R,
        fill: c.bg, stroke: c.textMuted, 'stroke-width': 1.4,
      });
      gPoint.appendChild(node);
      return node;
    });

    // ── 걸음 사이에 살아 있는 것
    const openDisks = new Map<number, SVGCircleElement>();
    const bucket = new Map<number, number>();
    let linkNodes: SVGLineElement[] = [];

    // ── 시간
    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const start = Date.now();
        let id = 0;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          frames.delete(id);
          if (destroyed) return; // destroy 가 waiters 를 깨워 promise 를 푼다
          const raw = Math.min(1, (Date.now() - start) / ms);
          apply(raw < 1 ? raw * raw * (3 - 2 * raw) : 1);
          if (raw >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    function startCaption(): void {
      setCaption(
        tr('caption.start', 'Points on a plane, no group yet. Count: {n}.', {
          n: scene.points.length,
        }),
      );
    }

    /** 거리 눈금에 자리를 낸다. 같은 거리끼리는 옆으로 나란히 선다. */
    function slot(d: number): { x: number; y: number } {
      const key = Math.round(d / DOT_BUCKET);
      const used = bucket.get(key) ?? 0;
      bucket.set(key, used + 1);
      return { x: Math.min(PLOT_X0 + used * DOT_STEP, DOT_MAX_X), y: py(d) };
    }

    function openDisk(index: number, ink: string): Promise<void> {
      const p = scene.points[index];
      if (p === undefined) return Promise.resolve();
      const disk = el('circle', {
        cx: fx(p.x), cy: fy(p.y), r: 0,
        fill: alpha(ink, 0.12), stroke: ink, 'stroke-width': 1.2,
        'stroke-dasharray': '3 3',
      });
      gDisk.appendChild(disk);
      openDisks.set(index, disk);
      return tween(WAVE_MS, (t) => disk.setAttribute('r', String(epsR * t)));
    }

    function closeDisks(keep: Set<number>): Promise<void> {
      const going: Array<[number, SVGCircleElement]> = [];
      for (const [i, node] of openDisks) if (!keep.has(i)) going.push([i, node]);
      if (going.length === 0) return Promise.resolve();
      for (const [i] of going) openDisks.delete(i);
      return tween(WAVE_MS, (t) => {
        for (const [, node] of going) node.setAttribute('r', String(epsR * (1 - t)));
      }).then(() => {
        for (const [, node] of going) node.remove();
      });
    }

    function paint(index: number, ink: string): void {
      const node = dots[index];
      if (node === undefined) return;
      node.setAttribute('fill', ink);
      node.setAttribute('stroke', ink);
      node.setAttribute('r', String(PT_R_ON));
    }

    function badge(index: number, count: number, ink: string): void {
      const p = scene.points[index];
      if (p === undefined) return;
      const g = el('g', {});
      const bx = fx(p.x) + 11;
      const by = fy(p.y) - 11;
      g.appendChild(el('circle', { cx: bx, cy: by, r: 9, fill: ink, stroke: c.bg, 'stroke-width': 1.5 }));
      const num = el('text', {
        x: bx, y: by + 3.5,
        'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.stateInk,
      });
      num.textContent = String(count);
      g.appendChild(num);
      gBadge.appendChild(g);
    }

    /** 이은 쌍의 거리를 들판에서 떼어 내 눈금으로 날려 보낸다. */
    function flyDot(fromX: number, fromY: number, d: number, ink: string): Promise<void> {
      const target = slot(d);
      const node = el('circle', { cx: fromX, cy: fromY, r: 3.4, fill: ink });
      gDot.appendChild(node);
      return tween(LINK_MS + WAVE_MS, (t) => {
        node.setAttribute('cx', String(fromX + (target.x - fromX) * t));
        node.setAttribute('cy', String(fromY + (target.y - fromY) * t));
      });
    }

    function dropRejected(d: number, strong: boolean): Promise<void> {
      const target = slot(d);
      const node = el('circle', {
        cx: target.x, cy: target.y - 16, r: strong ? 4.2 : 3.4,
        fill: 'none', stroke: c.danger, 'stroke-width': strong ? 2 : 1.4,
      });
      gDot.appendChild(node);
      return tween(WAVE_MS, (t) => node.setAttribute('cy', String(target.y - 16 * (1 - t))));
    }

    function clearAll(): void {
      for (const g of [gDisk, gLink, gGap, gBadge, gDot]) {
        while (g.firstChild !== null) g.removeChild(g.firstChild);
      }
      openDisks.clear();
      bucket.clear();
      linkNodes = [];
      for (const node of dots) {
        node.setAttribute('fill', c.bg);
        node.setAttribute('stroke', c.textMuted);
        node.setAttribute('r', String(PT_R));
      }
    }

    startCaption();

    const instance: ViewInstance = {
      setCaption,

      rewind(): void {
        clearAll();
        startCaption();
      },

      async ignite(input: IgniteInput): Promise<void> {
        const ink = clusterInk[(input.cluster - 1) % clusterInk.length] ?? c.text;
        paint(input.index, ink);
        await openDisk(input.index, ink);
        badge(input.index, input.neighborCount, ink);
      },

      async spread(input: SpreadInput): Promise<void> {
        const ink = clusterInk[(input.cluster - 1) % clusterInk.length] ?? c.text;
        const flights: Promise<void>[] = [];
        const grow: SVGLineElement[] = [];
        const lengths: number[] = [];

        for (const link of input.links) {
          const a = scene.points[link.from];
          const b = scene.points[link.to];
          if (a === undefined || b === undefined) continue;
          const x1 = fx(a.x);
          const y1 = fy(a.y);
          const x2 = fx(b.x);
          const y2 = fy(b.y);
          const len = Math.hypot(x2 - x1, y2 - y1);
          const line = el('line', {
            x1, y1, x2, y2,
            stroke: ink, 'stroke-width': 2,
            'stroke-dasharray': `${len} ${len}`, 'stroke-dashoffset': len,
          });
          gLink.appendChild(line);
          linkNodes.push(line);
          grow.push(line);
          lengths.push(len);
          flights.push(flyDot((x1 + x2) / 2, (y1 + y2) / 2, link.dist, ink));
        }

        // 1) 이음이 뻗어 나간다.
        await tween(LINK_MS, (t) => {
          grow.forEach((line, i) => {
            line.setAttribute('stroke-dashoffset', String((lengths[i] ?? 0) * (1 - t)));
          });
        });

        // 2) 닿은 점에 불이 붙고, 그 자리에서 새 원이 자란다. 앞의 원은 오므라든다.
        const arrived: number[] = [];
        for (const link of input.links) if (!arrived.includes(link.to)) arrived.push(link.to);
        const keep = new Set(arrived);
        const opens: Promise<void>[] = [closeDisks(keep)];
        for (const i of arrived) {
          paint(i, ink);
          opens.push(openDisk(i, ink));
        }
        if (input.rejected !== null) opens.push(dropRejected(input.rejected, false));
        await Promise.all([...opens, ...flights]);
      },

      async blocked(input: BlockedInput): Promise<void> {
        const a = scene.points[input.from];
        const b = scene.points[input.to];
        if (a === undefined || b === undefined) return;
        const x1 = fx(a.x);
        const y1 = fy(a.y);
        const x2 = fx(b.x);
        const y2 = fy(b.y);
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ux = (x2 - x1) / len;
        const uy = (y2 - y1) / len;

        // 앞자락의 원을 이 점으로 옮겨 다시 열고, 그 테두리에서 멈추는 것을 보인다.
        await closeDisks(new Set());
        const reach = el('circle', {
          cx: x1, cy: y1, r: 0,
          fill: 'none', stroke: c.danger, 'stroke-width': 1.4, 'stroke-dasharray': '3 3',
        });
        gGap.appendChild(reach);

        // 가는 선은 두 점 사이 거리 전체, 굵은 선은 그중 **손이 닿지 않는 만큼**이다.
        const span = el('line', {
          x1, y1, x2: x1, y2: y1,
          stroke: c.danger, 'stroke-width': 1, 'stroke-dasharray': '2 3',
        });
        gGap.appendChild(span);
        const shortfall = el('line', {
          x1: x1 + ux * epsR, y1: y1 + uy * epsR,
          x2: x1 + ux * epsR, y2: y1 + uy * epsR,
          stroke: c.danger, 'stroke-width': 2.4,
        });
        gGap.appendChild(shortfall);

        await tween(GAP_MS, (t) => {
          reach.setAttribute('r', String(epsR * Math.min(1, t * 2)));
          span.setAttribute('x2', String(x1 + ux * len * t));
          span.setAttribute('y2', String(y1 + uy * len * t));
          const rest = Math.max(0, t * 2 - 1);
          shortfall.setAttribute('x2', String(x1 + ux * (epsR + (len - epsR) * rest)));
          shortfall.setAttribute('y2', String(y1 + uy * (epsR + (len - epsR) * rest)));
        });

        const tag = el('text', {
          x: (x1 + x2) / 2 + 6, y: (y1 + y2) / 2 - 6,
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.danger,
        });
        tag.textContent = input.dist.toFixed(2);
        gGap.appendChild(tag);

        await dropRejected(input.dist, true);
      },

      async finish(): Promise<void> {
        await closeDisks(new Set());
        await tween(SETTLE_MS, (t) => {
          for (const line of linkNodes) line.setAttribute('stroke-width', String(2 + t));
          for (const node of dots) {
            if (node.getAttribute('stroke') === c.textMuted) continue;
            node.setAttribute('r', String(PT_R_ON + t));
          }
        });
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        while (svg.firstChild !== null) svg.removeChild(svg.firstChild);
      },
    };

    return instance;
  },
};
