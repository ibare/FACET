/**
 * 각도로 재는 닮음 — 조각의 그림.
 *
 * 소재가 평면 위의 방향이라 자리 잡기와 각도에서 출발한다. 원점에서 화살 넷이
 * 뻗고, 질의의 화살에서 후보의 화살까지 **부채꼴이 실제로 벌어진다.** 그 다음
 * 같은 네 점을 끝점끼리 이어 직선 거리를 재면 순위가 뒤집힌다.
 *
 * ── 좌표는 캔버스에서 역산한다 (S-piece)
 *
 * 선언에 있는 것은 점 넷의 정수 좌표뿐이고, 한 칸을 몇 픽셀로 할지는 여기서
 * 캔버스 높이에서 나눠 정한다. **가로세로 축척이 반드시 같아야 한다** — 한쪽만
 * 늘리면 화면의 각이 실제 각이 아니게 되어 이 조각이 하는 말이 거짓이 된다.
 * 그래서 그림이 가로를 다 채우지 못한다. 남는 폭은 못박은 상수의 결과가 아니라
 * 축척을 지킨 결과이고, 대신 평면(눈금 점과 축)을 캔버스 끝까지 깔아 둔다.
 *
 * ── 부채꼴의 반지름
 *
 * 반지름에는 뜻이 없다. 셋이 겹쳐 보이지 않게 띄워 둔 것뿐이라, **가장 짧은
 * 화살에 가장 큰 반지름**을 준다. 짧은 화살에 큰 반지름을 주지 않으면 부채꼴과
 * 그 값이 점 바로 위에 얹혀 글자끼리 포개진다. 견주는 것은 반지름이 아니라
 * 벌어진 각이다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정해 자기 파일에 둔다. 가로는 러너가 PIECE_CANVAS_W 로 준다. */
const CANVAS_H = 420;

const W = PIECE_CANVAS_W;
const PAD_TOP = 26;
const PAD_LEFT = 46;
const PAD_RIGHT = 16;
const CAPTION_BAND = 56;
const TICK_BAND = 18;
/** 세로로 담을 칸 수 — 가장 높은 점(y=7) 위에 라벨이 설 자리까지. */
const Y_UNITS = 7.5;

/** 한 칸의 픽셀. 가로세로가 같아야 각이 참이다. */
const UNIT = Math.floor((CANVAS_H - PAD_TOP - CAPTION_BAND - TICK_BAND) / Y_UNITS);
const OX = PAD_LEFT;
const OY = PAD_TOP + Math.round(Y_UNITS * UNIT);
const GRID_X = Math.floor((W - PAD_RIGHT - OX) / UNIT);
const GRID_Y = Math.floor((OY - PAD_TOP) / UNIT);

const FRAME_MS = 16;
const RAY_MS = 560;
const SWEEP_MS = 620;
const GROW_MS = 460;
const BADGE_MS = 300;
const PULSE_MS = 720;

const DOT_R = 5;
const BADGE_R = 10;
const DIM_GAP = 11;
const DIM_TEXT_GAP = 24;
const CHORD_TEXT_GAP = 26;
/** 부채꼴 반지름 — 칸 단위. 짧은 화살일수록 큰 것을 받는다. */
const ARC_BASE = 2.2;
const ARC_STEP = 1.1;

type ScenePoint = { id: string; x: number; y: number };
type Scene = { query: ScenePoint | null; candidates: ScenePoint[] };

function readPoint(v: unknown): ScenePoint | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  if (typeof r.x !== 'number' || typeof r.y !== 'number') return null;
  return { id: r.id, x: r.x, y: r.y };
}

/**
 * initialData 를 좁히는 자리는 여기다 — mount 는 projector 가 없어도 반드시
 * 불리는 유일한 경로다 (S-piece). projector 는 이것을 다시 좁히지 않는다.
 */
function readScene(data: Record<string, unknown> | undefined): Scene {
  const list = data?.candidates;
  const raw: unknown[] = Array.isArray(list) ? (list as unknown[]) : [];
  const candidates: ScenePoint[] = [];
  for (const item of raw) {
    const p = readPoint(item);
    if (p !== null) candidates.push(p);
  }
  return { query: readPoint(data?.query), candidates };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const sx = (x: number): number => OX + x * UNIT;
const sy = (y: number): number => OY - y * UNIT;

/** 원점에서 각 a(수학 좌표, 라디안), 반지름 r 인 점의 화면 좌표. */
function polar(r: number, a: number): { x: number; y: number } {
  return { x: OX + r * Math.cos(a), y: OY - r * Math.sin(a) };
}

/** a0 에서 a1 까지의 호. 화면은 y 가 뒤집혀 있어 sweep-flag 가 반대다. */
function arcPath(r: number, a0: number, a1: number): string {
  const from = polar(r, a0);
  const to = polar(r, a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 0 : 1;
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} ${sweep} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

/**
 * 선 곁에 글자를 놓을 방향. 늘 같은 쪽(오른쪽)으로 밀되 세로선이면 위로 민다 —
 * 규칙 하나로 정하지 않으면 선마다 눈대중이 되어 다음 사람이 고칠 수 없다.
 */
function sideOf(dx: number, dy: number): { nx: number; ny: number } {
  const len = Math.hypot(dx, dy) || 1;
  let nx = dy / len;
  let ny = -dx / len;
  if (nx < -0.01 || (Math.abs(nx) <= 0.01 && ny > 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

type Cand = {
  id: string;
  color: string;
  px: number;
  py: number;
  ang: number;
  pxLen: number;
  arcR: number;
  ray: SVGLineElement;
  ext: SVGLineElement;
  dot: SVGCircleElement;
  tag: SVGTextElement;
  dimG: SVGGElement;
  dimLine: SVGLineElement;
  dimText: SVGTextElement;
  arcG: SVGGElement;
  arc: SVGPathElement;
  edge: SVGLineElement;
  degText: SVGTextElement;
  cosText: SVGTextElement;
  chordG: SVGGElement;
  chord: SVGLineElement;
  chordText: SVGTextElement;
  angleBadge: SVGGElement;
  angleNum: SVGTextElement;
  distBadge: SVGGElement;
  distNum: SVGTextElement;
  pulse: SVGCircleElement;
};

export const angleNotLengthStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const c = getColors(params.theme);
    const scene = readScene(params.initialData);
    // 후보 셋을 가르는 색. q 는 견줌의 기준이라 카테고리에 끼지 않고 본문 잉크를 쓴다.
    const hues = categorical(Math.max(1, scene.candidates.length), 'vivid');

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const root = el('g', {});
    canvas.appendChild(root);

    let cands: Cand[] = [];
    let qDot: SVGCircleElement | null = null;
    let qTag: SVGTextElement | null = null;
    let qRay: SVGLineElement | null = null;
    let qExt: SVGLineElement | null = null;
    let caption: SVGTextElement | null = null;
    let swept = 0;

    function wake(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
    }

    /** 한 번의 애니메이션. destroy/reset 이 걸리면 그 자리에서 풀린다. */
    function animate(duration: number, step: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) return finish();
          const t = Math.min(1, (Date.now() - started) / duration);
          step(t);
          if (t >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function text(
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: string,
      family: string,
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'font-size': size,
        'font-family': family,
        fill,
        'text-anchor': anchor,
        opacity: 0,
      });
    }

    /** 눈금 점과 축. 재생 내내 바뀌지 않는 바탕이다. */
    function drawFrame(): void {
      const frame = el('g', {});
      for (let gx = 1; gx <= GRID_X; gx += 1) {
        for (let gy = 1; gy <= GRID_Y; gy += 1) {
          frame.appendChild(el('circle', { cx: sx(gx), cy: sy(gy), r: 1.2, fill: c.border }));
        }
      }
      frame.appendChild(
        el('line', { x1: OX, y1: OY, x2: W - PAD_RIGHT, y2: OY, stroke: c.border, 'stroke-width': 1.5 }),
      );
      frame.appendChild(
        el('line', { x1: OX, y1: OY, x2: OX, y2: PAD_TOP - 8, stroke: c.border, 'stroke-width': 1.5 }),
      );
      frame.appendChild(
        el('polygon', {
          points: `${W - PAD_RIGHT + 7},${OY} ${W - PAD_RIGHT - 2},${OY - 4} ${W - PAD_RIGHT - 2},${OY + 4}`,
          fill: c.border,
        }),
      );
      frame.appendChild(
        el('polygon', {
          points: `${OX},${PAD_TOP - 15} ${OX - 4},${PAD_TOP - 4} ${OX + 4},${PAD_TOP - 4}`,
          fill: c.border,
        }),
      );
      for (let gx = 2; gx <= GRID_X; gx += 2) {
        const label = text(sx(gx), OY + 15, fontSizes.xs, c.textMuted, 'middle', fonts.mono);
        label.textContent = String(gx);
        label.setAttribute('opacity', '1');
        frame.appendChild(label);
      }
      for (let gy = 2; gy <= GRID_Y; gy += 2) {
        const label = text(OX - 10, sy(gy) + 4, fontSizes.xs, c.textMuted, 'end', fonts.mono);
        label.textContent = String(gy);
        label.setAttribute('opacity', '1');
        frame.appendChild(label);
      }
      root.appendChild(frame);
    }

    function build(): void {
      while (root.firstChild) root.removeChild(root.firstChild);
      cands = [];
      swept = 0;
      drawFrame();

      const extG = el('g', {});
      const dimLayer = el('g', {});
      const arcLayer = el('g', {});
      const chordLayer = el('g', {});
      const rayG = el('g', {});
      const pointG = el('g', {});
      const badgeG = el('g', {});
      for (const layer of [extG, dimLayer, arcLayer, chordLayer, rayG, pointG, badgeG]) {
        root.appendChild(layer);
      }

      const q = scene.query;
      if (q !== null) {
        const qp = { x: sx(q.x), y: sy(q.y) };
        const qa = Math.atan2(q.y, q.x);
        const far = polar(W * 1.5, qa);
        qExt = el('line', {
          x1: OX, y1: OY, x2: OX, y2: OY,
          stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.45,
        });
        qExt.dataset.fx = String(far.x);
        qExt.dataset.fy = String(far.y);
        extG.appendChild(qExt);
        qRay = el('line', {
          x1: OX, y1: OY, x2: OX, y2: OY,
          stroke: c.text, 'stroke-width': 2.6, 'stroke-linecap': 'round',
        });
        rayG.appendChild(qRay);
        qDot = el('circle', { cx: qp.x, cy: qp.y, r: DOT_R, fill: c.text, opacity: 0 });
        pointG.appendChild(qDot);
        qTag = text(qp.x + 13, qp.y - 11, fontSizes.sm, c.text, 'start', fonts.mono);
        qTag.textContent = `${q.id} (${q.x},${q.y})`;
        pointG.appendChild(qTag);
      }

      // 짧은 화살일수록 큰 반지름. 길이 내림차순으로 반지름을 나눠 준다.
      const byLength = [...scene.candidates].sort((a, b) => Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y));

      scene.candidates.forEach((p, i) => {
        const color = hues[i % hues.length] ?? c.text;
        const px = sx(p.x);
        const py = sy(p.y);
        const ang = Math.atan2(p.y, p.x);
        const pxLen = Math.hypot(px - OX, py - OY);
        const rank = byLength.findIndex((o) => o.id === p.id);
        const arcR = UNIT * (ARC_BASE + ARC_STEP * Math.max(0, rank));

        const far = polar(W * 1.5, ang);
        const ext = el('line', {
          x1: OX, y1: OY, x2: OX, y2: OY,
          stroke: color, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.4,
        });
        ext.dataset.fx = String(far.x);
        ext.dataset.fy = String(far.y);
        extG.appendChild(ext);

        const ray = el('line', {
          x1: OX, y1: OY, x2: OX, y2: OY,
          stroke: color, 'stroke-width': 2.4, 'stroke-linecap': 'round',
        });
        rayG.appendChild(ray);

        const dot = el('circle', {
          cx: px, cy: py, r: DOT_R, fill: color, stroke: c.bg, 'stroke-width': 1.5, opacity: 0,
        });
        pointG.appendChild(dot);

        const dir = { x: (px - OX) / (pxLen || 1), y: (py - OY) / (pxLen || 1) };
        const tag = text(px + dir.x * 17, py + dir.y * 17 - 2, fontSizes.sm, c.text, 'start', fonts.mono);
        tag.textContent = `${p.id} (${p.x},${p.y})`;
        pointG.appendChild(tag);

        // 길이를 재는 자 — 화살과 나란히 놓고 그 위에 값을 남긴다.
        const side = sideOf(px - OX, py - OY);
        const dimG = el('g', { opacity: 0 });
        const dimLine = el('line', {
          x1: OX + side.nx * DIM_GAP,
          y1: OY + side.ny * DIM_GAP,
          x2: OX + side.nx * DIM_GAP,
          y2: OY + side.ny * DIM_GAP,
          stroke: color, 'stroke-width': 1.2, 'stroke-dasharray': '2 3',
        });
        const dimText = text(
          OX + side.nx * DIM_TEXT_GAP,
          OY + side.ny * DIM_TEXT_GAP,
          fontSizes.xs,
          c.textMuted,
          'middle',
          fonts.mono,
        );
        dimG.appendChild(dimLine);
        dimG.appendChild(dimText);
        dimLayer.appendChild(dimG);

        const arcG = el('g', { opacity: 0 });
        const arc = el('path', {
          d: '', fill: color, 'fill-opacity': 0.12, stroke: color, 'stroke-width': 1.8,
        });
        const edge = el('line', {
          x1: OX, y1: OY, x2: OX, y2: OY, stroke: color, 'stroke-width': 1.2, opacity: 0,
        });
        const mid = polar(arcR + 16, ang);
        const degText = text(mid.x, mid.y - 10, fontSizes.sm, c.text, 'middle', fonts.mono);
        const cosText = text(mid.x, mid.y + 2, fontSizes.xs, c.textMuted, 'middle', fonts.mono);
        arcG.appendChild(arc);
        arcG.appendChild(edge);
        arcG.appendChild(degText);
        arcG.appendChild(cosText);
        arcLayer.appendChild(arcG);

        const chordG = el('g', { opacity: 0 });
        const chord = el('line', {
          x1: 0, y1: 0, x2: 0, y2: 0,
          stroke: color, 'stroke-width': 1.8, 'stroke-dasharray': '5 4',
        });
        const chordText = text(0, 0, fontSizes.xs, c.text, 'middle', fonts.mono);
        chordG.appendChild(chord);
        chordG.appendChild(chordText);
        chordLayer.appendChild(chordG);

        const angleBadge = el('g', { transform: `translate(${px + 15},${py + 2}) scale(0)` });
        angleBadge.appendChild(el('circle', { cx: 0, cy: 0, r: BADGE_R, fill: color }));
        const angleNum = text(0, 4, fontSizes.xs, c.stateInk, 'middle', fonts.body);
        angleNum.setAttribute('opacity', '1');
        angleBadge.appendChild(angleNum);
        badgeG.appendChild(angleBadge);

        const distBadge = el('g', { transform: `translate(${px + 33},${py + 2}) scale(0)` });
        distBadge.appendChild(
          el('polygon', {
            points: `0,${-BADGE_R - 1} ${BADGE_R + 1},0 0,${BADGE_R + 1} ${-BADGE_R - 1},0`,
            fill: c.bg, stroke: color, 'stroke-width': 2,
          }),
        );
        const distNum = text(0, 4, fontSizes.xs, c.text, 'middle', fonts.body);
        distNum.setAttribute('opacity', '1');
        distBadge.appendChild(distNum);
        badgeG.appendChild(distBadge);

        const pulse = el('circle', {
          cx: px, cy: py, r: DOT_R, fill: 'none', stroke: color, 'stroke-width': 2, opacity: 0,
        });
        badgeG.appendChild(pulse);

        cands.push({
          id: p.id, color, px, py, ang, pxLen, arcR,
          ray, ext, dot, tag, dimG, dimLine, dimText,
          arcG, arc, edge, degText, cosText,
          chordG, chord, chordText,
          angleBadge, angleNum, distBadge, distNum, pulse,
        });
      });

      caption = text(W / 2, CANVAS_H - 20, fontSizes.md, c.text, 'middle', fonts.body);
      caption.setAttribute('opacity', '1');
      root.appendChild(caption);
    }

    function find(id: string): Cand | undefined {
      return cands.find((v) => v.id === id);
    }

    build();

    return {
      setCaption(value: string): void {
        if (caption !== null) caption.textContent = value;
      },

      /** 원점에서 화살이 자란다. 점선은 그 방향이 계속된다는 뜻이다. */
      async place(): Promise<void> {
        const q = scene.query;
        await animate(RAY_MS, (t) => {
          const e = 1 - (1 - t) * (1 - t);
          if (qRay !== null && q !== null) {
            qRay.setAttribute('x2', String(OX + (sx(q.x) - OX) * e));
            qRay.setAttribute('y2', String(OY + (sy(q.y) - OY) * e));
          }
          if (qExt !== null) {
            const fx = Number(qExt.dataset.fx ?? OX);
            const fy = Number(qExt.dataset.fy ?? OY);
            qExt.setAttribute('x2', String(OX + (fx - OX) * e));
            qExt.setAttribute('y2', String(OY + (fy - OY) * e));
          }
          for (const v of cands) {
            v.ray.setAttribute('x2', String(OX + (v.px - OX) * e));
            v.ray.setAttribute('y2', String(OY + (v.py - OY) * e));
            const fx = Number(v.ext.dataset.fx ?? OX);
            const fy = Number(v.ext.dataset.fy ?? OY);
            v.ext.setAttribute('x2', String(OX + (fx - OX) * e));
            v.ext.setAttribute('y2', String(OY + (fy - OY) * e));
          }
        });
        if (qDot !== null) qDot.setAttribute('opacity', '1');
        if (qTag !== null) qTag.setAttribute('opacity', '1');
        for (const v of cands) {
          v.dot.setAttribute('opacity', '1');
          v.tag.setAttribute('opacity', '1');
        }
      },

      /** 길이를 재는 자가 화살을 따라 자란다. */
      async showLengths(items: Array<{ id: string; len: number }>): Promise<void> {
        const rows: Array<{ v: Cand; len: number }> = [];
        for (const item of items) {
          const v = find(item.id);
          if (v !== undefined) rows.push({ v, len: item.len });
        }
        for (const row of rows) {
          row.v.dimText.textContent = `|${row.v.id}| = ${row.len.toFixed(2)}`;
          row.v.dimG.setAttribute('opacity', '1');
        }
        await animate(GROW_MS, (t) => {
          for (const { v } of rows) {
            const side = sideOf(v.px - OX, v.py - OY);
            const x2 = OX + (v.px - OX) * t + side.nx * DIM_GAP;
            const y2 = OY + (v.py - OY) * t + side.ny * DIM_GAP;
            v.dimLine.setAttribute('x2', String(x2));
            v.dimLine.setAttribute('y2', String(y2));
            const mx = OX + ((v.px - OX) / 2) * t + side.nx * DIM_TEXT_GAP;
            const my = OY + ((v.py - OY) / 2) * t + side.ny * DIM_TEXT_GAP;
            v.dimText.setAttribute('x', String(mx));
            v.dimText.setAttribute('y', String(my));
            v.dimText.setAttribute('opacity', String(t));
          }
        });
      },

      /** 질의의 방향에서 후보의 방향까지 부채꼴이 벌어진다. */
      async sweep(id: string, deg: number, cos: number): Promise<void> {
        const v = find(id);
        const q = scene.query;
        if (v === undefined || q === null) return;
        const a0 = Math.atan2(q.y, q.x);
        const a1 = v.ang;

        // 각이 순위를 지는 순간부터 길이는 뒤로 물러난다.
        swept += 1;
        if (swept === 1) {
          for (const other of cands) other.dimG.setAttribute('opacity', '0.28');
        }

        v.arcG.setAttribute('opacity', '1');
        v.edge.setAttribute('opacity', '0.9');
        await animate(SWEEP_MS, (t) => {
          const e = t * t * (3 - 2 * t);
          const a = a0 + (a1 - a0) * e;
          v.arc.setAttribute('d', `${arcPath(v.arcR, a0, a)} L ${OX} ${OY} Z`);
          const tip = polar(v.arcR + 18, a);
          v.edge.setAttribute('x2', String(tip.x));
          v.edge.setAttribute('y2', String(tip.y));
          v.edge.setAttribute('x1', String(OX));
          v.edge.setAttribute('y1', String(OY));
        });
        v.edge.setAttribute('opacity', '0');
        v.degText.textContent = `${deg.toFixed(1)}°`;
        v.cosText.textContent = `cos = ${cos.toFixed(2)}`;
        await animate(180, (t) => {
          v.degText.setAttribute('opacity', String(t));
          v.cosText.setAttribute('opacity', String(t));
        });
      },

      /** 각이 좁은 순서. 동그란 표가 후보 곁에 선다. */
      async rankByAngle(order: string[]): Promise<void> {
        order.forEach((id, i) => {
          const v = find(id);
          if (v !== undefined) v.angleNum.textContent = String(i + 1);
        });
        await animate(BADGE_MS, (t) => {
          const e = 1 - (1 - t) * (1 - t);
          for (const v of cands) {
            v.angleBadge.setAttribute('transform', `translate(${v.px + 15},${v.py + 2}) scale(${e})`);
          }
        });
      },

      /** 끝점에서 끝점으로 줄이 뻗는다 — 이쪽이 유클리드 거리다. */
      async showChords(items: Array<{ id: string; dist: number }>): Promise<void> {
        const q = scene.query;
        if (q === null) return;
        const qx = sx(q.x);
        const qy = sy(q.y);
        // 각은 뒤로 물리고 거리를 앞에 세운다.
        for (const v of cands) v.arcG.setAttribute('opacity', '0.34');

        const rows: Array<{ v: Cand; dist: number }> = [];
        for (const item of items) {
          const v = find(item.id);
          if (v !== undefined) rows.push({ v, dist: item.dist });
        }
        for (const row of rows) {
          row.v.chordText.textContent = `d = ${row.dist.toFixed(2)}`;
          row.v.chordG.setAttribute('opacity', '1');
          row.v.chord.setAttribute('x1', String(qx));
          row.v.chord.setAttribute('y1', String(qy));
        }
        await animate(GROW_MS, (t) => {
          for (const { v } of rows) {
            v.chord.setAttribute('x2', String(qx + (v.px - qx) * t));
            v.chord.setAttribute('y2', String(qy + (v.py - qy) * t));
            const side = sideOf(v.px - qx, v.py - qy);
            v.chordText.setAttribute('x', String(qx + ((v.px - qx) / 2) * t + side.nx * CHORD_TEXT_GAP));
            v.chordText.setAttribute('y', String(qy + ((v.py - qy) / 2) * t + side.ny * CHORD_TEXT_GAP));
            v.chordText.setAttribute('opacity', String(t));
          }
        });
      },

      /** 거리가 가까운 순서. 마름모 표가 동그란 표 곁에 선다. */
      async rankByDistance(order: string[]): Promise<void> {
        order.forEach((id, i) => {
          const v = find(id);
          if (v !== undefined) v.distNum.textContent = String(i + 1);
        });
        await animate(BADGE_MS, (t) => {
          const e = 1 - (1 - t) * (1 - t);
          for (const v of cands) {
            v.distBadge.setAttribute('transform', `translate(${v.px + 33},${v.py + 2}) scale(${e})`);
          }
        });
      },

      /** 각으로 1등인 것이 거리로는 꼴찌다. 그 하나만 남기고 나머지를 물린다. */
      async highlightFlip(id: string): Promise<void> {
        const v = find(id);
        if (v === undefined) return;
        for (const other of cands) {
          const near = other.id === id;
          other.arcG.setAttribute('opacity', near ? '1' : '0.18');
          other.chordG.setAttribute('opacity', near ? '1' : '0.22');
        }
        v.arc.setAttribute('stroke-width', '2.6');
        v.chord.setAttribute('stroke-width', '2.6');
        v.pulse.setAttribute('opacity', '1');
        await animate(PULSE_MS, (t) => {
          const cycle = (t * 2) % 1;
          v.pulse.setAttribute('r', String(DOT_R + cycle * 22));
          v.pulse.setAttribute('opacity', String((1 - cycle) * 0.85));
        });
        v.pulse.setAttribute('opacity', '0');
      },

      /** 처음으로 되돌린다. 기다리던 애니메이션도 함께 푼다. */
      reset(): void {
        wake();
        build();
      },

      destroy(): void {
        destroyed = true;
        wake();
        if (root.parentNode !== null) root.parentNode.removeChild(root);
      },
    };
  },
};
