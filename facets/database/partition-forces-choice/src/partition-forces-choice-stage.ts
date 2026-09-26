/**
 * partition-forces-choice 의 무대.
 *
 * 동사는 "갈라진다". 두 번 갈라진다.
 *   1. 이음이 끊긴다 — 끊긴 쪽 노드가 옆으로 밀려나고, 이음이 가운데서 벌어진다.
 *      쓰기는 이어진 쪽으로만 건너가고, 끊긴 이음 위의 쓰기는 벌어진 자리에서 떨어진다.
 *   2. 한 읽기가 두 결말로 갈라진다 — 끊긴 노드에서 줄기 하나가 나와 두 팔로 나뉜다.
 *      위 팔 끝은 거절(오류), 아래 팔 끝은 옛 값. 완주 화면에 둘이 다 남는다.
 *
 * 정적 그리기(drawFrame(scene, 1))가 정본이다. 운동은 같은 그리기를 진행률 p < 1 로 부른다.
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
import type { PartitionForcesChoiceScene } from './scene.js';

const H = 330;
const NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 (ms) */
const MOVE_MS = { cut: 800, write: 1100, read: 900, refuse: 800, answer: 900 } as const;

type Pt = { x: number; y: number };

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/** 구간 [a, b] 안에서의 진행률 */
function span(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return (p - a) / (b - a);
}

function lerp(a: Pt, b: Pt, s: number): Pt {
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
}

function isScene(v: unknown): v is PartitionForcesChoiceScene {
  return typeof v === 'object' && v !== null && Array.isArray((v as { nodes?: unknown }).nodes);
}

export const partitionForcesChoiceStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    const SM = parseFloat(fontSizes.sm);
    const XS = parseFloat(fontSizes.xs);
    const MD = parseFloat(fontSizes.md);
    const MONO_W = 0.62; // 고정폭 글자 한 칸 / 글자 크기

    // 자리 — 캔버스에서 역산
    const R = Math.min(30, W * 0.05);
    const LEFT_X = W * 0.17;
    const RIGHT_X_JOINED = W * 0.4;
    const RIGHT_X_APART = W * 0.5;
    const MID_Y = H * 0.56;
    const TOP = 58;
    const JUNCTION_X = W * 0.64;
    const BOX_X = W * 0.73;
    const BOX_W = W - 12 - BOX_X;
    const BOX_H = 34;
    const ARM_DY = Math.min(78, (H - TOP) * 0.28);
    const GAP = 14; // 끊긴 이음이 벌어지는 반 폭 (px)

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(e);
      return e;
    }

    function label(
      parent: Element,
      at: Pt,
      content: string,
      o: { size: number; fill: string; mono?: boolean; anchor?: string; weight?: string },
    ): void {
      const e = el(
        'text',
        {
          x: at.x,
          y: at.y,
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size,
          fill: o.fill,
          'text-anchor': o.anchor ?? 'middle',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (o.weight) e.setAttribute('font-weight', o.weight);
      e.textContent = content;
    }

    /** 값 표기 꼬리표 (쓰기 · 읽기 · 답이 들고 다닌다) */
    function tag(parent: Element, at: Pt, content: string, fill: string, ink: string, opacity = 1): void {
      // 고정폭 글꼴도 넓은 글자(한글 · 한자 등)는 한 칸을 거의 꽉 쓴다
      let units = 0;
      for (const ch of content) units += (ch.codePointAt(0) ?? 0) > 0x2e7f ? 1 : MONO_W;
      const w = units * SM + 14;
      const g = el('g', {}, parent);
      if (opacity < 1) g.setAttribute('opacity', String(r2(opacity)));
      el('rect', { x: at.x - w / 2, y: at.y - 11, width: w, height: 22, rx: 11, fill }, g);
      label(g, at, content, { size: SM, fill: ink, mono: true });
    }

    function sideOf(s: PartitionForcesChoiceScene, id: string): number {
      if (s.sides[0].includes(id)) return 0;
      if (s.sides[1].includes(id)) return 1;
      throw new Error(`partition-forces-choice: 무리에 없는 노드 ${id}`);
    }

    /** 노드 자리 — 자리가 없는 노드는 장면이 틀린 것이다 (C6) */
    function where(at: Map<string, Pt>, id: string): Pt {
      const p = at.get(id);
      if (!p) throw new Error(`partition-forces-choice: 자리가 없는 노드 ${id}`);
      return p;
    }

    /** 노드 자리. 끊긴 쪽 무리는 끊김이 진행된 만큼 밀려난다. */
    function place(s: PartitionForcesChoiceScene, apart: number): Map<string, Pt> {
      const at = new Map<string, Pt>();
      const rightX = RIGHT_X_JOINED + (RIGHT_X_APART - RIGHT_X_JOINED) * apart;
      for (const [k, group] of s.sides.entries()) {
        const gap = Math.min(118, (H - TOP - 20) / Math.max(1, group.length));
        group.forEach((id, i) => {
          at.set(id, { x: k === 0 ? LEFT_X : rightX, y: MID_Y + (i - (group.length - 1) / 2) * gap });
        });
      }
      return at;
    }

    const partitionX = (LEFT_X + RIGHT_X_APART) / 2;

    function severedHas(s: PartitionForcesChoiceScene, a: string, b: string): boolean {
      return s.severed.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    }

    /** a→b 이음에서 벌어진 자리 바로 앞 점 (a 쪽 토막의 끝) */
    function stubEnd(a: Pt, b: Pt, gapPx: number): Pt {
      const s = (partitionX - a.x) / (b.x - a.x);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      return lerp(a, b, s - gapPx / len);
    }

    /** 가장자리에서 가장자리로 — 원 안으로 파고들지 않게 */
    function edge(a: Pt, b: Pt): [Pt, Pt] {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      return [lerp(a, b, R / len), lerp(a, b, 1 - R / len)];
    }

    function fork(from: Pt, which: 'c' | 'a'): Pt[] {
      const dy = which === 'c' ? -ARM_DY : ARM_DY;
      return [
        { x: from.x + R, y: from.y },
        { x: JUNCTION_X, y: from.y },
        { x: JUNCTION_X + 24, y: from.y + dy },
        { x: BOX_X, y: from.y + dy },
      ];
    }

    function pathLen(pts: Pt[]): number {
      let L = 0;
      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1];
        const b = pts[i];
        if (a && b) L += Math.hypot(b.x - a.x, b.y - a.y);
      }
      return L;
    }

    /** 꺾은선의 앞 d 만큼 (점 목록) */
    function cutPath(pts: Pt[], d: number): Pt[] {
      const out: Pt[] = [];
      let left = d;
      for (let i = 0; i < pts.length; i += 1) {
        const b = pts[i];
        if (!b) break;
        if (i === 0) {
          out.push(b);
          continue;
        }
        const a = pts[i - 1];
        if (!a) break;
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        if (left >= seg) {
          out.push(b);
          left -= seg;
        } else {
          out.push(lerp(a, b, seg === 0 ? 1 : left / seg));
          break;
        }
      }
      return out;
    }

    function poly(parent: Element, pts: Pt[], stroke: string, width: number, dash?: string): void {
      if (pts.length < 2) return;
      const e = el(
        'polyline',
        {
          points: pts.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' '),
          fill: 'none',
          stroke,
          'stroke-width': width,
          'stroke-linejoin': 'round',
        },
        parent,
      );
      if (dash) e.setAttribute('stroke-dasharray', dash);
    }

    function drawFrame(s: PartitionForcesChoiceScene, p: number): void {
      svg.textContent = '';
      const kind = s.step.kind;
      const cutting = kind === 'cut' ? ease(p) : s.severed.length > 0 ? 1 : 0;
      const at = place(s, cutting);
      const pos = (id: string): Pt => where(at, id);

      // 캡션 — 지금 일어난 일
      label(svg, { x: 16, y: 26 }, caption(s), { size: MD, fill: c.text, anchor: 'start' });

      // 갈라짐 선 — 위에서 아래로 그어진다
      if (s.severed.length > 0) {
        const y0 = TOP - 8;
        const y1 = y0 + (H - 10 - y0) * cutting;
        el(
          'line',
          { x1: partitionX, y1: y0, x2: partitionX, y2: y1, stroke: c.danger, 'stroke-width': 2, 'stroke-dasharray': '6 5' },
          svg,
        );
      }

      // 이음
      for (const [a, b] of s.links) {
        const pa = pos(a);
        const pb = pos(b);
        const [ea, eb] = edge(pa, pb);
        if (severedHas(s, a, b) && sideOf(s, a) !== sideOf(s, b)) {
          const g = GAP * cutting;
          const endA = stubEnd(pa, pb, g);
          const endB = stubEnd(pb, pa, g);
          el('line', { x1: ea.x, y1: ea.y, x2: endA.x, y2: endA.y, stroke: c.textMuted, 'stroke-width': 2 }, svg);
          el('line', { x1: endB.x, y1: endB.y, x2: eb.x, y2: eb.y, stroke: c.textMuted, 'stroke-width': 2 }, svg);
        } else {
          el('line', { x1: ea.x, y1: ea.y, x2: eb.x, y2: eb.y, stroke: c.textMuted, 'stroke-width': 2 }, svg);
        }
      }

      // 한 읽기의 두 갈래 — 줄기는 하나, 팔이 둘
      const readAt = s.read ? pos(s.read.node) : null;
      if (readAt && (s.refused || s.answered)) {
        const cPath = fork(readAt, 'c');
        const aPath = fork(readAt, 'a');
        if (s.refused) {
          const grow = kind === 'refuse' ? ease(p) : 1;
          const drawn = cutPath(cPath, pathLen(cPath) * grow);
          poly(svg, drawn, c.danger, 2);
          const head = drawn[drawn.length - 1];
          if (grow < 1 && head) el('circle', { cx: head.x, cy: head.y, r: 6, fill: c.itemActive }, svg);
          if (grow >= 1) outcomeC(readAt, kind === 'refuse' ? p : 1);
        }
        if (s.answered) {
          const trunkLen = pathLen(aPath.slice(0, 2));
          const total = pathLen(aPath);
          const run = kind === 'answer' ? ease(p) : 1;
          const d = total * run;
          // 줄기는 C 갈래가 이미 그었다. 팔은 답이 갈림목을 지난 만큼 그어진다
          if (d > trunkLen) poly(svg, cutPath(aPath, d).slice(1), c.itemComparing, 2);
          if (run < 1) {
            const head = cutPath(aPath, d).at(-1);
            if (head) tag(svg, head, `${s.key}=${s.answered.value}`, c.itemComparing, c.textInverse);
          } else {
            outcomeA(s, readAt);
          }
        }
      }

      // 노드
      for (const n of s.nodes) {
        const at0 = pos(n.id);
        const shown = shownValue(s, n.id, n.value, p);
        const written = s.write !== null && s.write.reached.includes(n.id) && shown === s.write.value;
        const reading = s.read !== null && s.read.node === n.id;
        el(
          'circle',
          {
            cx: at0.x,
            cy: at0.y,
            r: R,
            fill: c.bgSubtle,
            stroke: reading ? c.itemActive : written ? c.primary : c.border,
            'stroke-width': reading || written ? 3 : 1.5,
          },
          svg,
        );
        label(svg, { x: at0.x, y: at0.y - 8 }, n.id, { size: SM, fill: c.text, weight: '600' });
        label(svg, { x: at0.x, y: at0.y + 10 }, `${s.key}=${shown}`, {
          size: SM,
          fill: written ? c.primary : c.textMuted,
          mono: true,
        });
      }

      // 이번 걸음의 운동 (지나가는 것만)
      if (p < 1) moving(s, at, p);

      // 읽기 꼬리표 — 읽기를 받은 노드 아래에 머문다
      if (s.read && readAt) {
        const rest = { x: readAt.x, y: readAt.y + R + 18 };
        const from = { x: readAt.x, y: H + 12 };
        const q = kind === 'read' ? ease(span(p, 0, 0.45)) : 1;
        tag(svg, lerp(from, rest, q), t('label.read', 'read {key}', { key: s.key }), c.itemActive, c.textInverse);
      }
    }

    function shownValue(s: PartitionForcesChoiceScene, id: string, value: number, p: number): number {
      if (s.step.kind !== 'write' || p >= 1 || !s.write) return value;
      const was = s.step.was[id];
      if (was === undefined) return value;
      // 받은 노드는 쓰기가 닿는 순간(0.3), 나머지는 이음을 건너 닿는 순간(1) 바뀐다
      const arrive = id === s.write.node ? 0.3 : 1;
      return p >= arrive ? value : was;
    }

    function moving(s: PartitionForcesChoiceScene, at: Map<string, Pt>, p: number): void {
      if (s.step.kind === 'write' && s.write) {
        const w = s.write;
        const src = where(at, w.node);
        const text = `${s.key}=${w.value}`;
        if (p < 0.3) {
          const from = { x: Math.max(28, src.x - R - 70), y: src.y };
          tag(svg, lerp(from, { x: src.x - R, y: src.y }, ease(span(p, 0, 0.3))), text, c.primary, c.textInverse);
          return;
        }
        const q = span(p, 0.3, 1);
        for (const id of w.reached) {
          if (id === w.node) continue;
          const dst = where(at, id);
          tag(svg, lerp(src, dst, ease(q)), text, c.primary, c.textInverse);
        }
        for (const id of w.blocked) {
          const dst = where(at, id);
          const stop = stubEnd(src, dst, GAP);
          if (q < 0.7) {
            tag(svg, lerp(src, stop, ease(span(q, 0, 0.7))), text, c.primary, c.textInverse);
          } else {
            // 벌어진 자리에서 떨어진다
            const f = span(q, 0.7, 1);
            tag(svg, { x: stop.x, y: stop.y + 34 * f * f }, text, c.primary, c.textInverse, 1 - f);
          }
        }
      }
      if (s.step.kind === 'read' && s.read) {
        const src = where(at, s.read.node);
        const q = span(p, 0.45, 1);
        if (q <= 0) return;
        // 다른 노드에 물어보러 나간 것이 벌어진 자리에서 멈춘다
        for (const id of s.read.asked) {
          const dst = where(at, id);
          const stop = s.read.reachable.includes(id) ? dst : stubEnd(src, dst, GAP);
          const head = lerp(src, stop, ease(span(q, 0, 0.7)));
          el('circle', { cx: head.x, cy: head.y, r: 5, fill: c.itemActive, opacity: r2(1 - span(q, 0.7, 1)) }, svg);
        }
      }
    }

    function outcomeC(from: Pt, p: number): void {
      const y = from.y - ARM_DY;
      // 거절은 도착하며 한 번 흔들린다
      const shake = p < 1 ? Math.sin(p * Math.PI * 6) * 5 * (1 - p) : 0;
      label(svg, { x: BOX_X, y: y - BOX_H / 2 - 12 }, t('label.choiceC', 'C: consistency'), {
        size: XS,
        fill: c.textMuted,
        anchor: 'start',
      });
      el(
        'rect',
        { x: BOX_X + shake, y: y - BOX_H / 2, width: BOX_W, height: BOX_H, rx: 6, fill: c.bg, stroke: c.danger, 'stroke-width': 2 },
        svg,
      );
      label(svg, { x: BOX_X + shake + BOX_W / 2, y }, t('label.error', 'Error'), { size: SM, fill: c.danger, weight: '600' });
    }

    function outcomeA(s: PartitionForcesChoiceScene, from: Pt): void {
      if (!s.answered) return;
      const y = from.y + ARM_DY;
      label(svg, { x: BOX_X, y: y - BOX_H / 2 - 12 }, t('label.choiceA', 'A: availability'), {
        size: XS,
        fill: c.textMuted,
        anchor: 'start',
      });
      el(
        'rect',
        { x: BOX_X, y: y - BOX_H / 2, width: BOX_W, height: BOX_H, rx: 6, fill: c.bg, stroke: c.itemComparing, 'stroke-width': 2 },
        svg,
      );
      label(svg, { x: BOX_X + BOX_W / 2, y }, `${s.key}=${s.answered.value}`, {
        size: SM,
        fill: c.itemComparing,
        mono: true,
        weight: '600',
      });
    }

    function caption(s: PartitionForcesChoiceScene): string {
      switch (s.step.kind) {
        case 'start':
          return t('caption.start', 'Nodes: {count}. All links are up.', { count: s.nodes.length });
        case 'cut':
          return t('caption.cut', 'The network splits: {left} | {right}. Links cut: {count}.', {
            left: s.sides[0].join(' '),
            right: s.sides[1].join(' '),
            count: s.severed.length,
          });
        case 'write':
          if (!s.write) return '';
          return t('caption.write', 'Write {key}={value} lands on {node}. Reached: {reached}. Blocked: {blocked}.', {
            key: s.key,
            value: s.write.value,
            node: s.write.node,
            reached: s.write.reached.join(', '),
            blocked: s.write.blocked.join(', '),
          });
        case 'read':
          if (!s.read) return '';
          return t('caption.read', 'Read {key} arrives at {node}. Nodes it can reach: {count}.', {
            key: s.key,
            node: s.read.node,
            count: s.read.reachable.length,
          });
        case 'refuse':
          if (!s.refused) return '';
          return t('caption.refuse', 'Choice C: {node} cannot confirm it is current, so it returns an error.', {
            node: s.refused.node,
          });
        case 'answer':
          if (!s.answered) return '';
          return t('caption.answer', 'Choice A: {node} answers {key}={value}. Latest write: {latest}.', {
            node: s.answered.node,
            key: s.key,
            value: s.answered.value,
            latest: s.answered.latest,
          });
      }
    }

    function run(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            done();
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

    return {
      async render(next: unknown, _prev: unknown, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed || !isScene(next)) return;
        const s = next;
        const ms = s.step.kind === 'start' ? 0 : MOVE_MS[s.step.kind];
        if (!opts.animate || ms === 0) {
          drawFrame(s, 1);
          return;
        }
        await run(ms, mine, (p) => drawFrame(s, p));
        if (destroyed || mine !== gen) return;
        drawFrame(s, 1);
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
