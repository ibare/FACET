/**
 * 평면 위의 자리와 이음, 그리고 그 위를 걷는 발.
 *
 * 소재가 좌표라 **거리가 곧 뜻이다.** 가로세로 배율을 같게 두지 않으면 가까워
 * 보이는 점이 실제로는 먼 점이 되어 그림이 거짓을 말한다. 그래서 배율 하나를
 * 세로에서 뽑아 가로에도 그대로 쓰고, 남는 좌우 폭은 그 제약의 결과로 둔다 —
 * 요소 크기를 상수로 못박아 버린 폭이 아니다 (S-piece).
 *
 * 운동은 발이 실제로 옮겨 가는 것이다. 걸음은 곧은 선이 아니라 살짝 휜 활로
 * 그린다 — 발을 떼어 옮기는 몸짓이라야 "걸어간다" 로 읽힌다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정한다. 가로는 러너가 PIECE_CANVAS_W 로 준다 (S-piece). */
const CANVAS_H = 540;
const CAPTION_H = 52;
const PAD_TOP = 22;
const PAD_BOTTOM = 14;
const SIDE_MIN = 56;

const DOT_R = 8;
const FOOT_R = 11;
/** 걸음의 활이 곧은 선에서 벗어나는 정도. 거리에 비례한다. */
const ARC = 0.16;
/** 걸음 하나를 그릴 때 활을 몇 조각으로 나눌지. */
const ARC_SAMPLES = 24;

const FRAME_MS = 16;
const GRAPH_MS = 520;
const PROBE_MS = 320;
const STEP_MS = 560;
const SETTLE_MS = 460;

/** 도식에 새겨진 표식. 번역하면 그림과 어긋난다 (C10). */
const QUERY_MARK = 'query';

/** 캡션 한 줄에 들어가는 폭. 글자 너비를 셈해 잰다. */
const CAPTION_BUDGET = 80;

export type NeighborsStagePoint = { x: number; y: number };
export type NeighborsScene = { points: NeighborsStagePoint[]; query: NeighborsStagePoint };

function readPoint(value: unknown): NeighborsStagePoint | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Record<string, unknown>;
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return { x: p.x, y: p.y };
}

/**
 * initialData 를 좁힌다. 좁히는 규칙은 여기 한 벌만 둔다 — mount 가 그것을 받는
 * 유일한 경로이고, projector 는 걸음마다 오는 payload 만 좁힌다 (S-piece).
 */
export function readNeighborsScene(data: unknown): NeighborsScene {
  const d = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const points = Array.isArray(d.points)
    ? d.points.map(readPoint).filter((p): p is NeighborsStagePoint => p !== null)
    : [];
  return { points, query: readPoint(d.query) ?? { x: 0, y: 0 } };
}

function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, name) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clear(node: SVGElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
}

/** 한 글자가 차지하는 폭. 한글·한자·아랍 문자는 라틴 글자의 두 배로 친다. */
function glyphWidth(ch: string): number {
  return /[؀-ۿᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 2 : 1;
}

function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += glyphWidth(ch);
  return w;
}

/** 캡션을 두 줄까지 접는다. 넘치는 말은 둘째 줄에 그대로 남긴다. */
function wrapCaption(text: string, budget: number): [string, string] {
  if (textWidth(text) <= budget) return [text, ''];
  const words = text.split(' ');
  let head = '';
  let rest = '';
  for (const word of words) {
    if (rest === '' && textWidth(head === '' ? word : `${head} ${word}`) <= budget) {
      head = head === '' ? word : `${head} ${word}`;
      continue;
    }
    rest = rest === '' ? word : `${rest} ${word}`;
  }
  return head === '' ? [text, ''] : [head, rest];
}

export const neighborsLinkedAheadStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너를 건드리지 않는다 — 러너가 캔버스를 먼저 붙여 두었고, 비우면 그것이
    // 떨어져 나가 화면이 통째로 빈다 (S-view). 그릴 자리는 params.canvas 뿐이다.
    const colors = getColors(params.theme);
    const scene = readNeighborsScene(params.initialData);
    const svg = params.canvas;

    // ── 자리 셈. 배율 하나를 가로세로에 함께 쓴다.
    const xs = scene.points.map((p) => p.x).concat(scene.query.x);
    const ys = scene.points.map((p) => p.y).concat(scene.query.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const plotH = CANVAS_H - CAPTION_H - PAD_TOP - PAD_BOTTOM;
    const scale = Math.min((PIECE_CANVAS_W - SIDE_MIN * 2) / spanX, plotH / spanY);
    const originX = (PIECE_CANVAS_W - spanX * scale) / 2;
    const originY = PAD_TOP + (plotH - spanY * scale) / 2;
    const sx = (p: NeighborsStagePoint): number => originX + (p.x - minX) * scale;
    const sy = (p: NeighborsStagePoint): number => originY + (maxY - p.y) * scale;

    const root = el('g', {});
    const gLinks = el('g', {});
    const gProbe = el('g', {});
    const gTrail = el('g', {});
    const gDots = el('g', {});
    const gFoot = el('g', {});
    const gCaption = el('g', {});
    for (const layer of [gLinks, gProbe, gTrail, gDots, gFoot, gCaption]) root.appendChild(layer);
    svg.appendChild(root);

    // ── 질의. 찾아갈 자리는 십자와 고리로 새긴다.
    const qx = sx(scene.query);
    const qy = sy(scene.query);
    gDots.appendChild(
      el('circle', {
        cx: qx, cy: qy, r: 14, fill: 'none',
        stroke: colors.text, 'stroke-width': 1.4, 'stroke-dasharray': '3 3',
      }),
    );
    gDots.appendChild(
      el('path', {
        d: `M ${qx - 9} ${qy} H ${qx + 9} M ${qx} ${qy - 9} V ${qy + 9}`,
        stroke: colors.text, 'stroke-width': 1.8, fill: 'none',
      }),
    );
    const queryLabel = el('text', {
      x: qx, y: qy - 21, 'text-anchor': 'middle',
      fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs,
    });
    queryLabel.textContent = QUERY_MARK;
    gDots.appendChild(queryLabel);

    // ── 점들.
    const dotEls: SVGElement[] = scene.points.map((p, i) => {
      const dot = el('circle', {
        cx: sx(p), cy: sy(p), r: DOT_R,
        fill: colors.itemDefault, stroke: colors.border, 'stroke-width': 1.5,
      });
      gDots.appendChild(dot);
      const label = el('text', {
        x: sx(p) + DOT_R + 5, y: sy(p) + 4,
        fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
      });
      label.textContent = `p${i}`;
      gDots.appendChild(label);
      return dot;
    });

    // ── 걸어온 자취와, 선 자리에서 질의까지 뻗은 줄.
    const trail = el('path', {
      d: '', fill: 'none', stroke: colors.itemActive,
      'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    });
    gTrail.appendChild(trail);

    const band = el('line', {
      x1: qx, y1: qy, x2: qx, y2: qy,
      stroke: colors.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '4 4', opacity: 0,
    });
    gTrail.appendChild(band);

    const foot = el('circle', {
      cx: qx, cy: qy, r: FOOT_R,
      fill: colors.itemActive, stroke: colors.stateInk, 'stroke-width': 1.5, opacity: 0,
    });
    gFoot.appendChild(foot);

    // ── 캡션 두 줄.
    const capA = el('text', {
      x: PIECE_CANVAS_W / 2, y: CANVAS_H - 30, 'text-anchor': 'middle',
      fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md,
    });
    const capB = el('text', {
      x: PIECE_CANVAS_W / 2, y: CANVAS_H - 11, 'text-anchor': 'middle',
      fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md,
    });
    gCaption.appendChild(capA);
    gCaption.appendChild(capB);

    // ── 기다리던 것을 destroy 가 푼다 (S-piece).
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

    async function tween(ms: number, apply: (t: number) => void): Promise<void> {
      const started = Date.now();
      for (;;) {
        if (destroyed) return;
        const raw = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
        apply(raw >= 1 ? 1 : ease(raw));
        if (raw >= 1) return;
        await wait(FRAME_MS);
      }
    }

    // ── 걸음 상태.
    let trailD = '';
    let settleRing: SVGElement | null = null;

    function placeFoot(index: number): void {
      const p = scene.points[index];
      if (p === undefined) return;
      const x = sx(p);
      const y = sy(p);
      foot.setAttribute('cx', String(x));
      foot.setAttribute('cy', String(y));
      foot.setAttribute('opacity', '1');
      band.setAttribute('x1', String(x));
      band.setAttribute('y1', String(y));
      band.setAttribute('x2', String(qx));
      band.setAttribute('y2', String(qy));
      band.setAttribute('opacity', '1');
      trailD = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      trail.setAttribute('d', trailD);
      dotEls[index]?.setAttribute('stroke', colors.itemActive);
      dotEls[index]?.setAttribute('stroke-width', '2');
    }

    function resetWalk(): void {
      clear(gProbe);
      if (settleRing !== null) {
        settleRing.remove();
        settleRing = null;
      }
      trailD = '';
      trail.setAttribute('d', '');
      foot.setAttribute('opacity', '0');
      foot.setAttribute('r', String(FOOT_R));
      foot.setAttribute('fill', colors.itemActive);
      band.setAttribute('opacity', '0');
      for (const dot of dotEls) {
        dot.setAttribute('stroke', colors.border);
        dot.setAttribute('stroke-width', '1.5');
      }
    }

    /** 미리 이어 둔 길을 놓는다. 선이 자라나야 "이어 둔다" 로 읽힌다. */
    async function setGraph(
      links: ReadonlyArray<readonly [number, number]>,
      start: number,
    ): Promise<void> {
      resetWalk();
      clear(gLinks);
      const drawn: Array<{ line: SVGElement; ax: number; ay: number; bx: number; by: number }> = [];
      for (const [a, b] of links) {
        const pa = scene.points[a];
        const pb = scene.points[b];
        if (pa === undefined || pb === undefined) continue;
        const ax = sx(pa);
        const ay = sy(pa);
        const line = el('line', {
          x1: ax, y1: ay, x2: ax, y2: ay,
          stroke: colors.border, 'stroke-width': 1.2,
        });
        gLinks.appendChild(line);
        drawn.push({ line, ax, ay, bx: sx(pb), by: sy(pb) });
      }
      placeFoot(start);
      await tween(GRAPH_MS, (t) => {
        for (const d of drawn) {
          d.line.setAttribute('x2', String(d.ax + (d.bx - d.ax) * t));
          d.line.setAttribute('y2', String(d.ay + (d.by - d.ay) * t));
        }
      });
    }

    /**
     * 선 자리의 이웃을 본다.
     *
     * 이웃마다 질의까지 줄을 뻗어 둔다 — 어느 것이 더 가까운지를 숫자로 말하지
     * 않고 그 자리에서 보이게 하려는 것이다. 고른 이웃의 줄만 진하다.
     */
    async function probe(from: number, candidates: number[], best: number | null): Promise<void> {
      clear(gProbe);
      const here = scene.points[from];
      if (here === undefined) return;
      const hx = sx(here);
      const hy = sy(here);

      const spokes: Array<{ line: SVGElement; tx: number; ty: number }> = [];
      const reaches: Array<{ line: SVGElement; cx: number; cy: number }> = [];

      for (const c of candidates) {
        const p = scene.points[c];
        if (p === undefined) continue;
        const cx = sx(p);
        const cy = sy(p);
        const chosen = c === best;

        const spoke = el('line', {
          x1: hx, y1: hy, x2: hx, y2: hy,
          stroke: colors.itemComparing, 'stroke-width': chosen ? 4 : 2, 'stroke-linecap': 'round',
        });
        gProbe.appendChild(spoke);
        spokes.push({ line: spoke, tx: cx, ty: cy });

        const reach = el('line', {
          x1: cx, y1: cy, x2: cx, y2: cy,
          stroke: chosen ? colors.text : colors.textMuted,
          'stroke-width': chosen ? 1.6 : 0.9,
          ...(chosen ? {} : { 'stroke-dasharray': '3 4' }),
        });
        gProbe.appendChild(reach);
        reaches.push({ line: reach, cx, cy });

        gProbe.appendChild(
          el('circle', {
            cx, cy, r: DOT_R + 4, fill: 'none',
            stroke: colors.itemComparing, 'stroke-width': chosen ? 3 : 1.4,
          }),
        );
      }

      await tween(PROBE_MS, (t) => {
        for (const s of spokes) {
          s.line.setAttribute('x2', String(hx + (s.tx - hx) * t));
          s.line.setAttribute('y2', String(hy + (s.ty - hy) * t));
        }
        for (const r of reaches) {
          r.line.setAttribute('x2', String(r.cx + (qx - r.cx) * t));
          r.line.setAttribute('y2', String(r.cy + (qy - r.cy) * t));
        }
      });
    }

    /** 발을 옮긴다. 활을 그리며 실제로 이동한다. */
    async function stepTo(from: number, to: number): Promise<void> {
      clear(gProbe);
      const a = scene.points[from];
      const b = scene.points[to];
      if (a === undefined || b === undefined) return;
      const ax = sx(a);
      const ay = sy(a);
      const bx = sx(b);
      const by = sy(b);
      const cx = (ax + bx) / 2 - (by - ay) * ARC;
      const cy = (ay + by) / 2 + (bx - ax) * ARC;

      const at = (t: number): { x: number; y: number } => {
        const u = 1 - t;
        return {
          x: u * u * ax + 2 * u * t * cx + t * t * bx,
          y: u * u * ay + 2 * u * t * cy + t * t * by,
        };
      };
      const segment = (upto: number): string => {
        let s = '';
        for (let i = 1; i <= ARC_SAMPLES; i += 1) {
          const p = at((upto * i) / ARC_SAMPLES);
          s += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        }
        return s;
      };

      const base = trailD === '' ? `M ${ax.toFixed(1)} ${ay.toFixed(1)}` : trailD;
      await tween(STEP_MS, (t) => {
        const p = at(t);
        foot.setAttribute('cx', String(p.x));
        foot.setAttribute('cy', String(p.y));
        band.setAttribute('x1', String(p.x));
        band.setAttribute('y1', String(p.y));
        trail.setAttribute('d', base + segment(t));
      });
      trailD = base + segment(1);
      trail.setAttribute('d', trailD);
      dotEls[to]?.setAttribute('stroke', colors.itemActive);
      dotEls[to]?.setAttribute('stroke-width', '2');
    }

    /** 나아갈 데가 없다. 선 자리에 고리를 남긴다. */
    async function settle(index: number): Promise<void> {
      clear(gProbe);
      const p = scene.points[index];
      if (p === undefined) return;
      const x = sx(p);
      const y = sy(p);
      const ring = el('circle', {
        cx: x, cy: y, r: FOOT_R, fill: 'none',
        stroke: colors.accent, 'stroke-width': 3,
      });
      gFoot.insertBefore(ring, foot);
      settleRing = ring;
      foot.setAttribute('fill', colors.accent);

      await tween(SETTLE_MS, (t) => {
        ring.setAttribute('r', String(FOOT_R + 14 * t));
        ring.setAttribute('opacity', String(1 - 0.35 * t));
        foot.setAttribute('r', String(FOOT_R + 3 * Math.sin(Math.PI * t)));
      });
      ring.setAttribute('stroke', colors.text);
      ring.setAttribute('stroke-width', '2.4');
      ring.setAttribute('opacity', '1');
      foot.setAttribute('r', String(FOOT_R));
    }

    function rewind(): void {
      resetWalk();
      capA.textContent = '';
      capB.textContent = '';
    }

    function setCaption(text: string): void {
      const [a, b] = wrapCaption(text, CAPTION_BUDGET);
      capA.textContent = a;
      capB.textContent = b;
    }

    function destroy(): void {
      destroyed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    const instance: ViewInstance = {
      setGraph,
      probe,
      stepTo,
      settle,
      rewind,
      setCaption,
      destroy,
    };
    return instance;
  },
};
