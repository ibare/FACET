/**
 * handshake-lemma 무대 — 간선 하나가 두 끝으로 나뉘어 차수에 들어간다.
 *
 * 그래프는 자란다. 놓인 간선만 그린다. 간선이 놓일 때 그 가운데에 알 하나가 맺히고,
 * 그 알이 둘로 갈라져 선을 끌며 양 끝 정점으로 간다. 닿은 자리에 끝점이 남고, 그
 * 정점의 차수와 아래 덧셈 줄의 그 항이 하나씩 오른다.
 *
 * 정적 그리기(`drawStatic`)가 정본이다. 운동은 그 위에서 "아직 못 온 만큼" 만 그린다.
 */

import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
} from '@ffacet/core/runtime';
import type { HandshakeScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 372;

/** 정점 줄의 좌우 여백 */
const PAD_X = 64;
/** 정점이 번갈아 서는 두 줄 */
const Y_UP = 76;
const Y_DOWN = 186;
/** 정점 반지름 */
const R = 17;
/** 차수 방울이 정점에서 떨어진 거리 · 반지름 */
const BADGE_OFF = 36;
const BADGE_R = 11;
/** 끝점 — 정점 테두리 바깥 */
const END_GAP = 5;
const END_R = 3.5;
/** 가르는 알 */
const BEAD_R = 6;

/** 덧셈 줄 */
const SUM_LABEL_X = 24;
const TAG_Y = 270;
const TERM_Y = 294;
const TERM_X0 = 160;
const TERM_GAP = 52;

const CAPTION_Y1 = 334;
const CAPTION_Y2 = 358;

/** 운동 시간 — 맺힘 · 갈라져 감 · 끝점으로 앉음을 한 시계로 */
const MOTION_MS = 600;
const P_FORM = 0.25;
const P_ARRIVE = 0.85;

type Pt = { x: number; y: number };

type Handles = {
  /** 간선 차례마다 선 */
  lines: SVGLineElement[];
  /** 간선 차례마다 두 끝점 [u 쪽, v 쪽] */
  ends: Array<[SVGCircleElement, SVGCircleElement]>;
  /** 정점 차례마다 차수 글자 */
  badges: SVGTextElement[];
  /** 정점 차례마다 덧셈 항 글자 */
  terms: SVGTextElement[];
  /** 덧셈의 합 글자 */
  sum: SVGTextElement | null;
};

function num(x: number): string {
  const r = Math.round(x * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r);
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? num(v) : v);
  }
  parent.appendChild(node);
  return node;
}

function word(
  parent: Element,
  body: string,
  x: number,
  y: number,
  opts: { size: string; fill: string; anchor?: string; weight?: string; family?: string },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': opts.family ?? fonts.body,
    'font-size': opts.size,
    fill: opts.fill,
    'text-anchor': opts.anchor ?? 'middle',
    'dominant-baseline': 'middle',
  });
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = body;
  return node;
}

/** 정점 자리 — 데이터 차례대로 왼쪽에서 오른쪽, 위아래 줄을 번갈아. 폭을 채운다. */
function vertexPoints(count: number): Pt[] {
  const span = PIECE_CANVAS_W - PAD_X * 2;
  const pts: Pt[] = [];
  for (let i = 0; i < count; i += 1) {
    pts.push({ x: PAD_X + (span * i) / (count - 1), y: i % 2 === 0 ? Y_UP : Y_DOWN });
  }
  return pts;
}

/** 정점 a 의 테두리 바깥, b 쪽으로 난 끝점 자리 */
function endPoint(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) throw new Error('handshake-lemma-stage: 두 끝의 자리가 같다');
  const k = (R + END_GAP) / len;
  return { x: a.x + dx * k, y: a.y + dy * k };
}

function badgePoint(p: Pt): Pt {
  return { x: p.x, y: p.y === Y_UP ? p.y - BADGE_OFF : p.y + BADGE_OFF };
}

function ease(q: number): number {
  return q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
}

export const handshakeLemmaStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function positions(scene: HandshakeScene): Pt[] {
      return vertexPoints(scene.vertices.length);
    }

    function at(scene: HandshakeScene, pts: Pt[], name: number): Pt {
      const i = scene.vertices.indexOf(name);
      const p = pts[i];
      if (i < 0 || !p) throw new Error(`handshake-lemma-stage: 정점 ${name} 의 자리가 없다`);
      return p;
    }

    function drawStatic(scene: HandshakeScene): Handles {
      svg.textContent = '';
      const pts = positions(scene);
      const step = scene.step;
      const current = step?.kind === 'place' ? scene.placed.length - 1 : -1;
      const handles: Handles = { lines: [], ends: [], badges: [], terms: [], sum: null };

      // 간선 — 놓인 것만. 이번 걸음의 간선은 강조
      const edgeLayer = el(svg, 'g', {});
      scene.placed.forEach(([u, v], k) => {
        const a = at(scene, pts, u);
        const b = at(scene, pts, v);
        const on = k === current;
        handles.lines.push(
          el(edgeLayer, 'line', {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            stroke: on ? colors.accent : colors.textMuted,
            'stroke-width': on ? 3 : 2,
            'stroke-linecap': 'round',
          }),
        );
      });

      // 정점
      const vertexLayer = el(svg, 'g', {});
      scene.vertices.forEach((name, i) => {
        const p = pts[i]!;
        el(vertexLayer, 'circle', {
          cx: p.x,
          cy: p.y,
          r: R,
          fill: colors.bg,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        word(vertexLayer, String(name), p.x, p.y, {
          size: fontSizes.md,
          fill: colors.text,
          weight: '600',
        });
      });

      // 끝점 — 간선 하나에 둘. 정점 테두리 바로 바깥에 앉는다
      const endLayer = el(svg, 'g', {});
      scene.placed.forEach(([u, v], k) => {
        const a = at(scene, pts, u);
        const b = at(scene, pts, v);
        const ea = endPoint(a, b);
        const eb = endPoint(b, a);
        const fill = k === current ? colors.accent : colors.primary;
        handles.ends.push([
          el(endLayer, 'circle', { cx: ea.x, cy: ea.y, r: END_R, fill }),
          el(endLayer, 'circle', { cx: eb.x, cy: eb.y, r: END_R, fill }),
        ]);
      });

      // 차수 방울과 덧셈 줄 — 알고리즘이 셈한 뒤에만
      const degrees = scene.degrees;
      if (degrees !== null) {
        const changed = (name: number): boolean =>
          step?.kind === 'place' && (step.u === name || step.v === name);
        const badgeLayer = el(svg, 'g', {});
        scene.vertices.forEach((name, i) => {
          const d = degrees[i];
          if (d === undefined) throw new Error(`handshake-lemma-stage: 정점 ${name} 의 차수가 없다`);
          const bp = badgePoint(pts[i]!);
          const on = changed(name);
          el(badgeLayer, 'circle', {
            cx: bp.x,
            cy: bp.y,
            r: BADGE_R,
            fill: on ? colors.accent : colors.bgSubtle,
            stroke: on ? colors.accent : colors.border,
            'stroke-width': 1,
          });
          handles.badges.push(
            word(badgeLayer, String(d), bp.x, bp.y, {
              size: fontSizes.sm,
              fill: on ? colors.stateInk : colors.text,
              weight: '600',
            }),
          );
        });

        if (scene.sum === null) throw new Error('handshake-lemma-stage: 차수는 있는데 합이 없다');
        const sumLayer = el(svg, 'g', {});
        word(sumLayer, t('label.sum', 'Degree sum'), SUM_LABEL_X, TERM_Y, {
          size: fontSizes.sm,
          fill: colors.textMuted,
          anchor: 'start',
        });
        scene.vertices.forEach((name, i) => {
          const x = TERM_X0 + i * TERM_GAP;
          const on = changed(name);
          word(sumLayer, String(name), x, TAG_Y, { size: fontSizes.xs, fill: colors.textMuted });
          if (on) {
            el(sumLayer, 'rect', {
              x: x - 14,
              y: TERM_Y - 13,
              width: 28,
              height: 26,
              rx: 4,
              fill: colors.accent,
            });
          }
          handles.terms.push(
            word(sumLayer, String(degrees[i]!), x, TERM_Y, {
              size: fontSizes.lg,
              fill: on ? colors.stateInk : colors.text,
              family: fonts.mono,
            }),
          );
          const sign = i < scene.vertices.length - 1 ? '+' : '=';
          word(sumLayer, sign, x + TERM_GAP / 2, TERM_Y, {
            size: fontSizes.lg,
            fill: colors.textMuted,
            family: fonts.mono,
          });
        });
        const sumX = TERM_X0 + scene.vertices.length * TERM_GAP;
        handles.sum = word(sumLayer, String(scene.sum), sumX, TERM_Y, {
          size: fontSizes.xl,
          fill: colors.text,
          weight: '700',
          family: fonts.mono,
        });
      }

      // 캡션 — 지금 일어나는 일과 셈한 값
      if (step !== null && degrees !== null && scene.sum !== null) {
        const capLayer = el(svg, 'g', {});
        const cx = PIECE_CANVAS_W / 2;
        const line1 =
          step.kind === 'start'
            ? t('caption.start', 'Vertices: {n} · No edges yet', { n: scene.vertices.length })
            : t('caption.place', 'Edge {u}–{v} · degree of {u}: {fromU} → {toU} · degree of {v}: {fromV} → {toV}', {
                u: step.u,
                v: step.v,
                fromU: step.fromU,
                toU: step.toU,
                fromV: step.fromV,
                toV: step.toV,
              });
        word(capLayer, line1, cx, CAPTION_Y1, { size: fontSizes.md, fill: colors.text });
        word(
          capLayer,
          t('caption.tally', 'Degree sum: {sum} · Edges: {m}', {
            sum: scene.sum,
            m: scene.placed.length,
          }),
          cx,
          CAPTION_Y2,
          { size: fontSizes.md, fill: colors.textMuted },
        );
      }

      return handles;
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        let start = -1;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) return finish();
          if (start < 0) start = now;
          const p = Math.min(1, (now - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    /** 간선이 가운데에서 맺혀 둘로 갈라져 양 끝으로 들어간다 */
    async function split(scene: HandshakeScene, handles: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step?.kind !== 'place') throw new Error('handshake-lemma-stage: 가를 간선이 없는 걸음이다');
      const k = scene.placed.length - 1;
      const line = handles.lines[k];
      const ends = handles.ends[k];
      const pts = positions(scene);
      const iu = scene.vertices.indexOf(step.u);
      const iv = scene.vertices.indexOf(step.v);
      const badgeU = handles.badges[iu];
      const badgeV = handles.badges[iv];
      const termU = handles.terms[iu];
      const termV = handles.terms[iv];
      const sumText = handles.sum;
      if (!line || !ends || !badgeU || !badgeV || !termU || !termV || !sumText) {
        throw new Error(`handshake-lemma-stage: 간선 ${step.u}–${step.v} 의 손잡이가 없다`);
      }
      const a = at(scene, pts, step.u);
      const b = at(scene, pts, step.v);
      const ea = endPoint(a, b);
      const eb = endPoint(b, a);
      const m: Pt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

      // 아직 못 온 만큼 — 선과 끝점은 아직 없고, 두 끝의 차수와 합은 앞 값이다
      line.setAttribute('opacity', '0');
      ends[0].setAttribute('opacity', '0');
      ends[1].setAttribute('opacity', '0');
      badgeU.textContent = String(step.fromU);
      badgeV.textContent = String(step.fromV);
      termU.textContent = String(step.fromU);
      termV.textContent = String(step.fromV);
      sumText.textContent = String(step.fromSum);

      const layer = el(svg, 'g', {});
      const halfA = el(layer, 'line', {
        x1: m.x, y1: m.y, x2: m.x, y2: m.y,
        stroke: colors.accent, 'stroke-width': 3, 'stroke-linecap': 'butt',
      });
      const halfB = el(layer, 'line', {
        x1: m.x, y1: m.y, x2: m.x, y2: m.y,
        stroke: colors.accent, 'stroke-width': 3, 'stroke-linecap': 'butt',
      });
      const beadA = el(layer, 'circle', { cx: m.x, cy: m.y, r: 0, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 });
      const beadB = el(layer, 'circle', { cx: m.x, cy: m.y, r: 0, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 });

      let arrived = false;
      await tween(mine, MOTION_MS, (p) => {
        if (p < P_FORM) {
          // 가운데에 알 하나가 맺힌다 (둘이 포개져 있다)
          const r = BEAD_R * ease(p / P_FORM);
          beadA.setAttribute('r', num(r));
          beadB.setAttribute('r', num(r));
          return;
        }
        const q = Math.min(1, (p - P_FORM) / (P_ARRIVE - P_FORM));
        const e = ease(q);
        const pa = { x: m.x + (ea.x - m.x) * e, y: m.y + (ea.y - m.y) * e };
        const pb = { x: m.x + (eb.x - m.x) * e, y: m.y + (eb.y - m.y) * e };
        halfA.setAttribute('x2', num(pa.x));
        halfA.setAttribute('y2', num(pa.y));
        halfB.setAttribute('x2', num(pb.x));
        halfB.setAttribute('y2', num(pb.y));
        beadA.setAttribute('cx', num(pa.x));
        beadA.setAttribute('cy', num(pa.y));
        beadB.setAttribute('cx', num(pb.x));
        beadB.setAttribute('cy', num(pb.y));
        if (p < P_ARRIVE) {
          beadA.setAttribute('r', num(BEAD_R));
          beadB.setAttribute('r', num(BEAD_R));
          return;
        }
        // 닿았다 — 알이 끝점 크기로 앉고, 두 끝의 차수와 합이 오른다
        if (!arrived) {
          arrived = true;
          badgeU.textContent = String(step.toU);
          badgeV.textContent = String(step.toV);
          termU.textContent = String(step.toU);
          termV.textContent = String(step.toV);
          if (scene.sum === null) throw new Error('handshake-lemma-stage: 합이 없는 걸음이다');
          sumText.textContent = String(scene.sum);
        }
        const s = (p - P_ARRIVE) / (1 - P_ARRIVE);
        const r = BEAD_R + (END_R - BEAD_R) * ease(s);
        beadA.setAttribute('r', num(r));
        beadB.setAttribute('r', num(r));
      });
    }

    async function render(
      next: HandshakeScene,
      prev: HandshakeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      const grew = prev !== null && next.placed.length === prev.placed.length + 1;
      if (!opts.animate || !grew || next.step?.kind !== 'place') return;
      await split(next, handles, mine);
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
