/**
 * 수거 두 방식의 무대 — 같은 가리킴 그래프 두 벌.
 *
 * 왼쪽 벌은 추적(표시가 화살을 따라 번지고 훑는 손이 놓인 차례로 지나간다), 오른쪽 벌은 계수(객체 밑의
 * 가리키는 수가 내려가고 0 이 된 객체가 떨어져 나간다). 주소 · 칸 줄 · 코드 글자는 두지 않는다.
 *
 * 운동: 뿌리 화살이 이름 쪽으로 말려 들어가고 다시 뻗는다 · 고리 화살이 자라나고 걷힌다 · 표시 점이 화살을
 * 따라 흐른다 · 훑는 손이 옮겨 간다 · 거둔 객체가 아래로 빠지고 새 판에 제자리로 돌아온다 · 수가 밀려 내려간다 ·
 * 남은 쓰레기 표지가 추적 쪽에서 계수 쪽으로 미끄러져 붙는다. 길이는 projector 가 부를 때마다 넘긴다(재생 속도).
 *
 * 객체 자리: 뿌리마다 한 줄, `edges` 를 따라 닿는 깊이가 칸이다(고리 화살은 자리를 정하지 않는다).
 * 어느 뿌리의 줄에도 들지 않는 객체는 마지막 줄에 놓인 차례로 선다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 400;
const PANEL_W = W / 2;
const ROW0 = 130;
const ROW_GAP = 130;
const COL0 = 140;
const COL_GAP = 85;
const R = 20;
const ROOT_X = 22;
const ROOT_W = 40;
const ROOT_H = 28;
const FALL = 44;
/** 쓰레기 표지가 들어오기 전 자리 — 추적 쪽(왼쪽)에서 미끄러져 온다 */
const TAG_OFF = -90;

type Pt = { x: number; y: number };

/** stage 가 받는 자료 — 구조만 본다 */
export type StageData = {
  objects: string[];
  roots: { name: string; to: string }[];
  edges: [string, string][];
  cycleEdges: [string, string][];
  cycle: number;
};

/** projector 가 부르는 표면 */
export type TracingVsRefcountStage = ViewInstance & {
  build(data: StageData): void;
  startRound(cycle: number, counts: number[], ms: number): void;
  dropRoot(root: string, object: string, count: number, ms: number): void;
  refcountFree(object: string, lowered: { object: string; count: number }[], ms: number): void;
  mark(object: string, root: string, via: string | null, ms: number): void;
  sweep(object: string, freed: boolean, leftover: boolean, ms: number): void;
  setCaption(text: string): void;
};

type Arrow = {
  key: string;
  from: string; // 객체 이름 또는 'root:<name>'
  to: string;
  cycle: boolean;
  p0: Pt;
  c: Pt;
  p2: Pt;
  progress: number;
  path: SVGPathElement;
  head: SVGPathElement;
};

type Obj = {
  name: string;
  at: Pt;
  g: SVGGElement;
  ring: SVGCircleElement;
  badge: SVGCircleElement | null;
  count: SVGTextElement | null;
  tag: SVGGElement | null;
  dy: number;
  scale: number;
  gone: boolean;
  badgeScale: number;
  tagShift: number;
};

type Panel = {
  kind: 'trace' | 'count';
  x0: number;
  layer: SVGGElement;
  objs: Map<string, Obj>;
  arrows: Arrow[];
  rootBoxes: Map<string, SVGTextElement>;
  hand: SVGPathElement | null;
  handAt: Pt;
  dot: SVGCircleElement | null;
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const mix = (a: Pt, b: Pt, k: number): Pt => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

export const tracingVsRefcountStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): TracingVsRefcountStage {
    const tr = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const svg = params.canvas;
    const fs = parseFloat(fontSizes.sm);
    const root = el('g', {}, svg);

    // ── 애니메이션 — 열쇠마다 하나. 새로 걸면 앞 것을 끊는다
    // 새로 걸 때 앞 것은 끝 모습으로 마무리한다 — 걸음이 빨라도 표시 · 수가 빠지지 않게
    const frames = new Map<string, { id: number; finish: () => void }>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    const tween = (key: string, ms: number, apply: (k: number) => void, done?: () => void): void => {
      const prev = frames.get(key);
      if (prev !== undefined) {
        cancelAnimationFrame(prev.id);
        frames.delete(key);
        prev.finish();
      }
      if (ms <= 0 || !hasRaf) {
        apply(1);
        done?.();
        return;
      }
      const start = performance.now();
      const finish = (): void => {
        apply(1);
        done?.();
      };
      const tick = (now: number): void => {
        const k = Math.min(1, (now - start) / ms);
        if (k < 1) {
          apply(ease(k));
          frames.set(key, { id: requestAnimationFrame(tick), finish });
        } else {
          frames.delete(key);
          finish();
        }
      };
      apply(0);
      frames.set(key, { id: requestAnimationFrame(tick), finish });
    };
    const stopAll = (): void => {
      for (const f of frames.values()) cancelAnimationFrame(f.id);
      frames.clear();
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
    const later = (ms: number, fn: () => void): void => {
      if (ms <= 0) {
        fn();
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    let panels: Panel[] = [];
    let caption: SVGTextElement | null = null;

    // ── 화살
    const drawArrow = (a: Arrow): void => {
      const k = a.progress;
      if (k <= 0.001) {
        a.path.setAttribute('d', '');
        a.head.setAttribute('d', '');
        return;
      }
      const q1 = mix(a.p0, a.c, k);
      const q2 = mix(a.c, a.p2, k);
      const tip = mix(q1, q2, k);
      a.path.setAttribute('d', `M ${a.p0.x} ${a.p0.y} Q ${q1.x} ${q1.y} ${tip.x} ${tip.y}`);
      const dx = tip.x - q1.x;
      const dy = tip.y - q1.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const s = 7;
      const b1 = { x: tip.x - ux * s - uy * s * 0.55, y: tip.y - uy * s + ux * s * 0.55 };
      const b2 = { x: tip.x - ux * s + uy * s * 0.55, y: tip.y - uy * s - ux * s * 0.55 };
      a.head.setAttribute('d', `M ${tip.x} ${tip.y} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} Z`);
    };
    const pointOn = (a: Arrow, k: number): Pt => mix(mix(a.p0, a.c, k), mix(a.c, a.p2, k), k);
    const setArrow = (panel: Panel, a: Arrow, target: number, ms: number): void => {
      const from = a.progress;
      if (Math.abs(from - target) < 0.001) return;
      tween(`arrow:${panel.kind}:${a.key}`, ms, (k) => {
        a.progress = lerp(from, target, k);
        drawArrow(a);
      });
    };

    // ── 객체
    const place = (o: Obj): void => {
      o.g.setAttribute('transform', `translate(${o.at.x} ${o.at.y + o.dy}) scale(${o.scale})`);
      o.ring.setAttribute('stroke', o.gone ? pal.textMuted : pal.text);
      o.ring.setAttribute('stroke-dasharray', o.gone ? '4 3' : '');
      o.ring.setAttribute('fill', o.gone ? pal.bgSubtle : pal.itemDefault);
    };
    const moveObj = (panel: Panel, o: Obj, dy: number, scale: number, ms: number): void => {
      const d0 = o.dy;
      const s0 = o.scale;
      tween(`obj:${panel.kind}:${o.name}`, ms, (k) => {
        o.dy = lerp(d0, dy, k);
        o.scale = lerp(s0, scale, k);
        place(o);
      });
    };
    const setBadge = (panel: Panel, o: Obj, on: boolean, ms: number): void => {
      const badge = o.badge;
      if (!badge) return;
      const s0 = o.badgeScale;
      const s1 = on ? 1 : 0;
      tween(`badge:${panel.kind}:${o.name}`, ms, (k) => {
        o.badgeScale = lerp(s0, s1, k);
        badge.setAttribute('r', String(6 * o.badgeScale));
        o.ring.setAttribute('stroke-width', o.badgeScale > 0.5 ? '2.5' : '1.5');
      });
    };
    const setTag = (o: Obj, on: boolean, ms: number): void => {
      const tag = o.tag;
      if (!tag) return;
      const from = o.tagShift;
      const to = on ? 0 : TAG_OFF;
      tween(`tag:${o.name}`, ms, (k) => {
        o.tagShift = lerp(from, to, k);
        const shown = o.tagShift > TAG_OFF + 1;
        tag.setAttribute('transform', `translate(${o.tagShift} 0)`);
        tag.setAttribute('visibility', shown ? 'visible' : 'hidden');
      });
    };
    const setCount = (o: Obj, value: number, ms: number): void => {
      const text = o.count;
      if (!text) return;
      const old = text.textContent ?? '';
      const next = String(value);
      text.setAttribute('fill', value === 0 ? pal.danger : pal.text);
      if (old === next) return;
      text.textContent = next;
      if (old !== '' && ms > 0) {
        // 앞 수는 아래로 밀려 나가고 새 수가 위에서 내려앉는다
        const ghost = el('text', {
          x: 0, y: R + 16, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fs, fill: pal.textMuted,
        }, o.g);
        ghost.textContent = old;
        tween(`ghost:${o.name}:${performance.now()}`, ms * 0.6, (k) => {
          ghost.setAttribute('transform', `translate(0 ${k * 14})`);
          ghost.setAttribute('opacity', String(1 - k));
        }, () => ghost.remove());
        tween(`count:${o.name}`, ms * 0.6, (k) => text.setAttribute('transform', `translate(0 ${(k - 1) * 10})`));
      }
    };
    const touching = (panel: Panel, name: string): Arrow[] => panel.arrows.filter((a) => a.from === name || a.to === name);
    const objOf = (panel: Panel, name: string): Obj => {
      const o = panel.objs.get(name);
      if (!o) throw new Error(`tracing-vs-refcount-stage: 모르는 객체 '${name}'`);
      return o;
    };
    const arrowOf = (panel: Panel, from: string, to: string): Arrow => {
      const a = panel.arrows.find((x) => x.from === from && x.to === to);
      if (!a) throw new Error(`tracing-vs-refcount-stage: 없는 화살 ${from} → ${to}`);
      return a;
    };
    const removeObj = (panel: Panel, o: Obj, ms: number): void => {
      o.gone = true;
      for (const a of touching(panel, o.name)) setArrow(panel, a, 0, ms);
      moveObj(panel, o, FALL, 0.78, ms);
    };

    // ── 짓기
    const build = (data: StageData): void => {
      stopAll();
      while (root.firstChild) root.removeChild(root.firstChild);
      panels = [];

      // 자리 — 뿌리마다 한 줄, edges 로 닿는 깊이가 칸
      const pos = new Map<string, Pt>();
      let row = 0;
      for (const r of data.roots) {
        if (pos.has(r.to)) continue;
        let col = 0;
        let cur: string | undefined = r.to;
        while (cur !== undefined && !pos.has(cur) && col < data.objects.length) {
          pos.set(cur, { x: COL0 + col * COL_GAP, y: ROW0 + row * ROW_GAP });
          col += 1;
          const here: string = cur;
          cur = data.edges.find(([a, b]) => a === here && !pos.has(b))?.[1];
        }
        row += 1;
      }
      let col = 0;
      for (const name of data.objects) {
        if (pos.has(name)) continue;
        pos.set(name, { x: COL0 + col * COL_GAP, y: ROW0 + row * ROW_GAP });
        col += 1;
      }

      el('line', { x1: PANEL_W, y1: 12, x2: PANEL_W, y2: H - 44, stroke: pal.border, 'stroke-width': 1 }, root);

      for (const kind of ['trace', 'count'] as const) {
        const x0 = kind === 'trace' ? 0 : PANEL_W;
        const layer = el('g', {}, root);
        const title = el('text', { x: x0 + 16, y: 28, 'font-family': fonts.body, 'font-size': fontSizes.lg, 'font-weight': 600, fill: pal.text }, layer);
        title.textContent = kind === 'trace' ? tr('panel.tracing', 'Tracing') : tr('panel.counting', 'Counting');
        const legend = el('text', { x: x0 + 16, y: 48, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, layer);
        legend.textContent = kind === 'trace'
          ? tr('legend.mark', 'Dot: marked from a root')
          : tr('legend.count', 'Number below: pointers in');
        const rootsLabel = el('text', { x: x0 + ROOT_X + ROOT_W / 2, y: 76, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, layer);
        rootsLabel.textContent = tr('label.roots', 'Roots');

        const arrowLayer = el('g', {}, layer);
        const objLayer = el('g', {}, layer);
        const panel: Panel = { kind, x0, layer, objs: new Map(), arrows: [], rootBoxes: new Map(), hand: null, handAt: { x: x0 + PANEL_W - 24, y: 70 }, dot: null };

        const at = (name: string): Pt => {
          const p = pos.get(name);
          if (!p) throw new Error(`tracing-vs-refcount-stage: 모르는 객체 '${name}'`);
          return { x: x0 + p.x, y: p.y };
        };
        const addArrow = (key: string, from: string, to: string, p0: Pt, c: Pt, p2: Pt, cycle: boolean, progress: number): void => {
          const path = el('path', { d: '', fill: 'none', stroke: cycle ? pal.itemComparing : pal.textMuted, 'stroke-width': 1.6 }, arrowLayer);
          const head = el('path', { d: '', fill: cycle ? pal.itemComparing : pal.textMuted }, arrowLayer);
          const a: Arrow = { key, from, to, cycle, p0, c, p2, progress, path, head };
          panel.arrows.push(a);
          drawArrow(a);
        };
        const edgeGeom = (a: Pt, b: Pt, bend: number): [Pt, Pt, Pt] => {
          const mid = mix(a, b, 0.5);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const c = { x: mid.x - (dy / len) * bend, y: mid.y + (dx / len) * bend };
          const off = (from: Pt, toward: Pt, r: number): Pt => {
            const ex = toward.x - from.x;
            const ey = toward.y - from.y;
            const l = Math.hypot(ex, ey) || 1;
            return { x: from.x + (ex / l) * r, y: from.y + (ey / l) * r };
          };
          return [off(a, c, R), c, off(b, c, R + 2)];
        };

        // 뿌리 띠
        for (const r of data.roots) {
          const target = at(r.to);
          const box = el('g', {}, objLayer);
          el('rect', { x: x0 + ROOT_X, y: target.y - ROOT_H / 2, width: ROOT_W, height: ROOT_H, rx: 4, fill: pal.bgSubtle, stroke: pal.border }, box);
          const label = el('text', { x: x0 + ROOT_X + ROOT_W / 2, y: target.y + fs * 0.35, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: pal.text }, box);
          label.textContent = r.name;
          panel.rootBoxes.set(r.name, label);
          const p0 = { x: x0 + ROOT_X + ROOT_W, y: target.y };
          const p2 = { x: target.x - R - 2, y: target.y };
          addArrow(`root:${r.name}`, `root:${r.name}`, r.to, p0, mix(p0, p2, 0.5), p2, false, 1);
        }
        // 객체 사이 화살 — 고리 화살은 옆으로 휜다 (같은 줄이면 위나 아래로)
        for (const [a, b] of data.edges) {
          const [p0, c, p2] = edgeGeom(at(a), at(b), 0);
          addArrow(`${a}>${b}`, a, b, p0, c, p2, false, 1);
        }
        data.cycleEdges.forEach(([a, b], i) => {
          const pa = at(a);
          const pb = at(b);
          const span = Math.abs(pa.x - pb.x) / COL_GAP;
          const bend = (i % 2 === 0 ? 1 : -1) * (26 + 30 * span) * (pa.x > pb.x ? 1 : -1);
          const [p0, c, p2] = edgeGeom(pa, pb, bend);
          addArrow(`${a}>${b}`, a, b, p0, c, p2, true, data.cycle === 1 ? 1 : 0);
        });

        // 객체
        for (const name of data.objects) {
          const g = el('g', {}, objLayer);
          const ring = el('circle', { cx: 0, cy: 0, r: R, 'stroke-width': 1.5 }, g);
          const label = el('text', { x: 0, y: fs * 0.4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 600, fill: pal.text }, g);
          label.textContent = name;
          const o: Obj = { name, at: at(name), g, ring, badge: null, count: null, tag: null, dy: 0, scale: 1, gone: false, badgeScale: 0, tagShift: TAG_OFF };
          if (kind === 'trace') {
            o.badge = el('circle', { cx: R * 0.72, cy: -R * 0.72, r: 0, fill: pal.accent, stroke: pal.stateInk, 'stroke-width': 1 }, g);
          } else {
            o.count = el('text', { x: 0, y: R + 16, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: pal.text }, g);
            const tag = el('g', { visibility: 'hidden', transform: `translate(${o.tagShift} 0)` }, g);
            const word = tr('tag.garbage', 'Garbage');
            const w = Math.max(40, word.length * fs * 0.62 + 12);
            el('rect', { x: -w / 2, y: R + 24, width: w, height: fs + 6, rx: 3, fill: pal.bg, stroke: pal.danger, 'stroke-dasharray': '3 2' }, tag);
            const tx = el('text', { x: 0, y: R + 24 + fs + 1, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.danger }, tag);
            tx.textContent = word;
            o.tag = tag;
          }
          place(o);
          panel.objs.set(name, o);
        }

        if (kind === 'trace') {
          panel.hand = el('path', { d: 'M -7 -12 L 7 -12 L 0 0 Z', fill: pal.itemActive }, layer);
          panel.hand.setAttribute('transform', `translate(${panel.handAt.x} ${panel.handAt.y})`);
          panel.dot = el('circle', { cx: 0, cy: 0, r: 0, fill: pal.accent, stroke: pal.stateInk, 'stroke-width': 1 }, layer);
        }
        panels.push(panel);
      }

      caption = el('text', { x: W / 2, y: H - 16, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: pal.text }, root);
    };

    const panelOf = (kind: 'trace' | 'count'): Panel | undefined => panels.find((p) => p.kind === kind);
    const moveHand = (panel: Panel, to: Pt, ms: number): void => {
      const hand = panel.hand;
      if (!hand) return;
      const from = { ...panel.handAt };
      panel.handAt = to;
      tween('hand', ms, (k) => {
        const p = mix(from, to, k);
        hand.setAttribute('transform', `translate(${p.x} ${p.y})`);
      });
    };

    const initial = params.initialData as Partial<StageData> | undefined;
    if (initial && Array.isArray(initial.objects) && Array.isArray(initial.roots) && Array.isArray(initial.edges) && Array.isArray(initial.cycleEdges)) {
      build({ objects: initial.objects, roots: initial.roots, edges: initial.edges, cycleEdges: initial.cycleEdges, cycle: initial.cycle === 1 ? 1 : 0 });
    }

    const instance: TracingVsRefcountStage = {
      build,
      startRound(cycle, counts, ms) {
        // 앞 판에서 남은 지연 호출이 새 판의 모습을 덮지 않게 먼저 끊는다
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const panel of panels) {
          let i = 0;
          for (const o of panel.objs.values()) {
            o.gone = false;
            moveObj(panel, o, 0, 1, ms);
            setBadge(panel, o, false, ms * 0.5);
            if (panel.kind === 'count') {
              setTag(o, false, ms * 0.5);
              const c = counts[i];
              if (c === undefined) throw new Error(`tracing-vs-refcount-stage: 객체 '${o.name}' (${i + 1} 번째) 의 시작 수가 없다 — counts 길이 ${counts.length}`);
              setCount(o, c, ms);
            }
            i += 1;
          }
          for (const a of panel.arrows) setArrow(panel, a, a.cycle ? (cycle === 1 ? 1 : 0) : 1, ms);
          for (const label of panel.rootBoxes.values()) label.setAttribute('fill', pal.text);
          if (panel.kind === 'trace') moveHand(panel, { x: panel.x0 + PANEL_W - 24, y: 70 }, ms);
        }
      },
      dropRoot(rootName, object, count, ms) {
        for (const panel of panels) {
          setArrow(panel, arrowOf(panel, `root:${rootName}`, object), 0, ms);
          panel.rootBoxes.get(rootName)?.setAttribute('fill', pal.textMuted);
        }
        const cp = panelOf('count');
        if (cp) setCount(objOf(cp, object), count, ms);
      },
      refcountFree(object, lowered, ms) {
        const cp = panelOf('count');
        if (!cp) return;
        removeObj(cp, objOf(cp, object), ms);
        later(ms * 0.4, () => {
          for (const l of lowered) setCount(objOf(cp, l.object), l.count, ms * 0.6);
        });
      },
      mark(object, rootName, via, ms) {
        const tp = panelOf('trace');
        if (!tp) return;
        const o = objOf(tp, object);
        const a = arrowOf(tp, via === null ? `root:${rootName}` : via, object);
        const dot = tp.dot;
        if (dot) {
          tween('dot', ms * 0.6, (k) => {
            const p = pointOn(a, k);
            dot.setAttribute('cx', String(p.x));
            dot.setAttribute('cy', String(p.y));
            dot.setAttribute('r', k >= 1 ? '0' : '5');
          }, () => setBadge(tp, o, true, ms * 0.3));
        } else setBadge(tp, o, true, ms);
      },
      sweep(object, freed, leftover, ms) {
        const tp = panelOf('trace');
        if (!tp) return;
        const o = objOf(tp, object);
        moveHand(tp, { x: o.at.x, y: o.at.y - R - 8 }, ms * 0.45);
        if (!freed) return;
        later(ms * 0.45, () => {
          removeObj(tp, o, ms * 0.5);
          const cp = panelOf('count');
          if (leftover && cp) setTag(objOf(cp, object), true, ms * 0.5);
        });
      },
      setCaption(text) {
        if (caption) caption.textContent = text;
      },
      destroy() {
        stopAll();
        root.remove();
      },
    };
    return instance;
  },
};
