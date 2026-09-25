/**
 * 상태 전이 무대 — 상태 다섯이 옮김표의 길로 이어져 있고, 프로세스(원반)가 원인을 받을 때마다
 * 그 원인이 붙은 길을 따라 한 칸 건너간다.
 *
 * 배치는 옮김표에서 셈한다: 시작 상태에서 막다른 상태(나가는 길 없음)까지 가장 긴 길을 윗줄에
 * 늘어놓고, 나머지 상태는 윗줄 이웃들의 가운데 아래에 둔다. 서로 반대로 가는 길 둘이 있으면
 * 왼쪽으로 가는 길을 바깥으로 휘어 둘을 가른다.
 *
 * 지금 상태에서 나가는 길의 이름표는 모두 테를 두르고, 받은 원인의 이름표만 채운다 — 같은
 * 상태에서도 원인이 건너갈 곳을 가른다.
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
} from '@ffacet/core/runtime';
import { waysOut, type StateEdge, type StateTransitionsScene } from './scene.js';

const H = 296;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = 24;
const BOX_H = 40;
const BOX_W_MAX = 110;
/** 윗줄 상자 중심의 세로 자리 */
const MAIN_Y = 84;
/** 아랫줄이 윗줄에서 내려앉는 깊이 */
const DROP = 120;
/** 반대 방향 짝 길을 휘는 정도 */
const BEND = 80;
const CROSS_MS = 650;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

type EdgeGeom = {
  p0: Pt;
  c: Pt;
  p2: Pt;
  /** 이름표 자리와 정렬 */
  label: Pt;
  anchor: 'start' | 'middle' | 'end';
  baseline: 'auto' | 'middle' | 'hanging';
  length: number;
};

type Layout = {
  boxW: number;
  centers: Map<string, Pt>;
  edges: EdgeGeom[];
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(v: number): number {
  return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
}

function quad(p0: Pt, c: Pt, p2: Pt, s: number): Pt {
  const a = (1 - s) * (1 - s);
  const b = 2 * s * (1 - s);
  const d = s * s;
  return { x: a * p0.x + b * c.x + d * p2.x, y: a * p0.y + b * c.y + d * p2.y };
}

/** 시작에서 막다른 상태까지 되밟지 않는 가장 긴 길 — 윗줄이 된다. */
function mainRow(scene: StateTransitionsScene): string[] {
  let best: string[] = [];
  const walk = (path: string[]): void => {
    const last = path[path.length - 1];
    if (last === undefined) return;
    const outs = waysOut(scene.edges, last);
    if (outs.length === 0 && path.length > best.length) best = [...path];
    for (const i of outs) {
      const e = scene.edges[i];
      if (e === undefined) continue;
      if (path.includes(e.to)) continue;
      walk([...path, e.to]);
    }
  };
  walk([scene.start]);
  if (best.length === 0) throw new Error('state-transitions 무대: 시작에서 막다른 상태로 가는 길이 없다');
  return best;
}

function clipToBox(c: Pt, toward: Pt, hw: number, hh: number): Pt {
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  const len = Math.hypot(dx, dy);
  const gap = len === 0 ? 0 : 3 / len;
  return { x: c.x + dx * (t + gap), y: c.y + dy * (t + gap) };
}

function computeLayout(scene: StateTransitionsScene): Layout {
  const row = mainRow(scene);
  const W = PIECE_CANVAS_W;
  const cols = row.length;
  const boxW = Math.min(BOX_W_MAX, ((W - 2 * MARGIN) / cols) * 0.66);
  const spacing = cols > 1 ? (W - 2 * MARGIN - boxW) / (cols - 1) : 0;
  const centers = new Map<string, Pt>();
  row.forEach((s, i) => {
    centers.set(s, { x: MARGIN + boxW / 2 + (cols > 1 ? i * spacing : (W - 2 * MARGIN - boxW) / 2), y: MAIN_Y });
  });
  for (const s of scene.states) {
    if (centers.has(s)) continue;
    const xs: number[] = [];
    for (const e of scene.edges) {
      const other = e.from === s ? e.to : e.to === s ? e.from : null;
      if (other === null) continue;
      const c = centers.get(other);
      if (c !== undefined && other !== s && row.includes(other)) xs.push(c.x);
    }
    if (xs.length === 0) throw new Error(`state-transitions 무대: 상태 ${s} 를 둘 자리가 없다 (윗줄 이웃 없음)`);
    const x = xs.reduce((a, b) => a + b, 0) / xs.length;
    centers.set(s, { x, y: MAIN_Y + DROP });
  }
  let cx = 0;
  let cy = 0;
  for (const c of centers.values()) {
    cx += c.x;
    cy += c.y;
  }
  const centroid = { x: cx / centers.size, y: cy / centers.size };

  const hw = boxW / 2;
  const hh = BOX_H / 2;
  const edges = scene.edges.map((e): EdgeGeom => {
    const a = centers.get(e.from);
    const b = centers.get(e.to);
    if (a === undefined || b === undefined) {
      throw new Error(`state-transitions 무대: 길 ${e.from} → ${e.to} 의 끝 상태가 배치에 없다`);
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let nx = -dy / len;
    let ny = dx / len;
    if (nx * (mid.x - centroid.x) + ny * (mid.y - centroid.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const hasReverse = scene.edges.some((o) => o.from === e.to && o.to === e.from);
    const bend = hasReverse && (dx < 0 || (dx === 0 && dy < 0));
    const c = bend ? { x: mid.x + nx * BEND, y: mid.y + ny * BEND } : mid;
    const p0 = clipToBox(a, c === mid ? b : c, hw, hh);
    const p2 = clipToBox(b, c === mid ? a : c, hw, hh);
    const mid2 = quad(p0, c, p2, 0.5);
    const horizontal = Math.abs(ny) > 0.9;
    const off = !bend && horizontal ? hh + 4 : 9;
    const label = { x: mid2.x + nx * off, y: mid2.y + ny * off };
    const anchor = nx > 0.4 ? 'start' : nx < -0.4 ? 'end' : 'middle';
    const baseline = anchor !== 'middle' ? 'middle' : ny < 0 ? 'auto' : 'hanging';
    let length = 0;
    let prev = p0;
    for (let k = 1; k <= 24; k += 1) {
      const q = quad(p0, c, p2, k / 24);
      length += Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
    }
    return { p0, c, p2, label, anchor, baseline, length };
  });
  return { boxW, centers, edges };
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자 등)는 한 칸, 나머지는 0.6 칸 */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    w += code >= 0x2e80 ? px : px * 0.6;
  }
  return w;
}

function stateName(t: Translate, id: string): string {
  switch (id) {
    case 'new':
      return t('label.state.new', 'New');
    case 'ready':
      return t('label.state.ready', 'Ready');
    case 'running':
      return t('label.state.running', 'Running');
    case 'waiting':
      return t('label.state.waiting', 'Waiting');
    case 'terminated':
      return t('label.state.terminated', 'Terminated');
    default:
      throw new Error(`state-transitions 무대: 이름을 모르는 상태 ${id}`);
  }
}

function causeName(t: Translate, id: string): string {
  switch (id) {
    case 'admit':
      return t('label.cause.admit', 'Admit');
    case 'dispatch':
      return t('label.cause.dispatch', 'Dispatch');
    case 'timer':
      return t('label.cause.timer', 'Timer');
    case 'io-request':
      return t('label.cause.ioRequest', 'I/O request');
    case 'io-done':
      return t('label.cause.ioDone', 'I/O done');
    case 'exit':
      return t('label.cause.exit', 'Exit');
    default:
      throw new Error(`state-transitions 무대: 이름을 모르는 원인 ${id}`);
  }
}

export const stateTransitionsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const labelPx = parseFloat(fontSizes.sm);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;
    let layoutKey: StateEdge[] | null = null;
    let layout: Layout | null = null;

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function write(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number>): void {
      const node = el('text', { x, y, 'font-family': fonts.body, ...attrs }, parent);
      node.textContent = s;
    }

    function layoutOf(scene: StateTransitionsScene): Layout {
      if (layout === null || layoutKey !== scene.edges) {
        layout = computeLayout(scene);
        layoutKey = scene.edges;
      }
      return layout;
    }

    function pathD(g: EdgeGeom): string {
      return `M ${round(g.p0.x)} ${round(g.p0.y)} Q ${round(g.c.x)} ${round(g.c.y)} ${round(g.p2.x)} ${round(g.p2.y)}`;
    }

    function arrowHead(g: EdgeGeom, fill: string, parent: Element): void {
      const dx = g.p2.x - g.c.x;
      const dy = g.p2.y - g.c.y;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      const bx = g.p2.x - ux * 8;
      const by = g.p2.y - uy * 8;
      const corners: Pt[] = [
        { x: g.p2.x, y: g.p2.y },
        { x: bx - uy * 4.5, y: by + ux * 4.5 },
        { x: bx + uy * 4.5, y: by - ux * 4.5 },
      ];
      const pts = corners.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
      el('polygon', { points: pts, fill }, parent);
    }

    /**
     * 한 장면의 화면 전체. `e` 가 null 이면 정적 그리기(정본), 수이면 이번 걸음을 그만큼 건너는 중이다.
     */
    function drawFrame(scene: StateTransitionsScene, e: number | null): void {
      svg.textContent = '';
      const L = layoutOf(scene);
      const step = scene.step;
      const crossing = step !== null ? scene.edges[step.edge] : undefined;
      if (step !== null && crossing === undefined) {
        throw new Error(`state-transitions 무대: 장면의 길 ${step.edge} 가 옮김표에 없다`);
      }
      const choices = crossing !== undefined ? waysOut(scene.edges, crossing.from) : [];

      const gEdges = el('g', {}, svg);
      const gLabels = el('g', {}, svg);
      const gBoxes = el('g', {}, svg);
      const gToken = el('g', {}, svg);
      const gCaption = el('g', {}, svg);

      // 길 — 건넌 적 있는 길은 실선, 아직이면 흐린 점선
      L.edges.forEach((g, i) => {
        const walkedN = scene.walked[i] ?? 0;
        const chosen = step !== null && step.edge === i;
        const base = walkedN > 0 && !(chosen && walkedN === 1) ? colors.text : colors.textMuted;
        const dashed = walkedN === 0 || (chosen && walkedN === 1);
        el(
          'path',
          {
            d: pathD(g),
            fill: 'none',
            stroke: base,
            'stroke-width': dashed ? 1.3 : 1.6,
            ...(dashed ? { 'stroke-dasharray': '4 4' } : {}),
          },
          gEdges,
        );
        if (!chosen) arrowHead(g, base, gEdges);
      });

      // 이번에 건넌 길 — 원반이 지나온 만큼 칠한다
      if (step !== null) {
        const g = L.edges[step.edge];
        if (g !== undefined) {
          const trail: Record<string, string | number> = {
            d: pathD(g),
            fill: 'none',
            stroke: colors.itemActive,
            'stroke-width': 2.8,
            'stroke-linecap': 'butt',
          };
          if (e !== null) trail['stroke-dasharray'] = `${round(g.length * e)} ${round(g.length + 1)}`;
          el('path', trail, gEdges);
          if (e === null || e >= 1) arrowHead(g, colors.itemActive, gEdges);
        }
      }

      // 길 이름표(원인) — 지금 걸음의 갈림길이면 테, 받은 원인이면 채움
      scene.edges.forEach((edge, i) => {
        const g = L.edges[i];
        if (g === undefined) return;
        const name = causeName(t, edge.cause);
        const isChoice = choices.includes(i);
        const isChosen = step !== null && step.edge === i;
        if (isChoice) {
          const w = textWidth(name, labelPx) + 12;
          const h = labelPx + 8;
          const x0 = g.anchor === 'start' ? g.label.x - 6 : g.anchor === 'end' ? g.label.x - w + 6 : g.label.x - w / 2;
          const y0 = g.baseline === 'auto' ? g.label.y - h + 3 : g.baseline === 'hanging' ? g.label.y - 4 : g.label.y - h / 2;
          el(
            'rect',
            {
              x: x0,
              y: y0,
              width: w,
              height: h,
              rx: h / 2,
              fill: isChosen ? colors.itemActive : colors.bg,
              stroke: isChosen ? colors.itemActive : colors.textMuted,
              'stroke-width': 1.2,
            },
            gLabels,
          );
        }
        write(gLabels, g.label.x, g.label.y, name, {
          'font-size': fontSizes.sm,
          'text-anchor': g.anchor,
          'dominant-baseline': g.baseline,
          fill: isChosen ? colors.stateInk : isChoice ? colors.text : colors.textMuted,
          ...(isChoice ? { 'font-weight': 600 } : {}),
        });
      });

      // 상태 상자 — 프로세스가 있는 칸을 채운다. 건너는 중이면 떠난 칸이 먼저 비고 닿는 칸이 나중에 찬다
      const hw = L.boxW / 2;
      const hh = BOX_H / 2;
      for (const s of scene.states) {
        const c = L.centers.get(s);
        if (c === undefined) throw new Error(`state-transitions 무대: 상태 ${s} 의 자리가 없다`);
        let fillOpacity = 0;
        if (e === null || crossing === undefined) {
          fillOpacity = s === scene.current ? 1 : 0;
        } else if (s === crossing.from && s === crossing.to) {
          fillOpacity = 1;
        } else if (s === crossing.from) {
          fillOpacity = 1 - clamp01(e * 4);
        } else if (s === crossing.to) {
          fillOpacity = clamp01((e - 0.8) * 5);
        }
        el(
          'rect',
          { x: c.x - hw, y: c.y - hh, width: L.boxW, height: BOX_H, rx: 8, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.3 },
          gBoxes,
        );
        if (fillOpacity > 0) {
          const fill: Record<string, string | number> = {
            x: c.x - hw,
            y: c.y - hh,
            width: L.boxW,
            height: BOX_H,
            rx: 8,
            fill: colors.itemActive,
            stroke: colors.itemActive,
            'stroke-width': 1.3,
          };
          if (fillOpacity < 1) fill['opacity'] = round(fillOpacity);
          el('rect', fill, gBoxes);
        }
        write(gBoxes, c.x, c.y, stateName(t, s), {
          'font-size': fontSizes.sm,
          'font-weight': 600,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          fill: fillOpacity >= 0.5 ? colors.stateInk : colors.text,
        });
      }

      // 건너는 원반
      if (e !== null && e < 1 && step !== null) {
        const g = L.edges[step.edge];
        if (g !== undefined) {
          const q = quad(g.p0, g.c, g.p2, e);
          el('circle', { cx: q.x, cy: q.y, r: 8, fill: colors.itemActive, stroke: colors.bg, 'stroke-width': 2 }, gToken);
        }
      }

      // 캡션 — 지금 일어나는 일만
      const capY1 = H - 40;
      const capY2 = H - 18;
      const cx = PIECE_CANVAS_W / 2;
      if (crossing === undefined) {
        write(gCaption, cx, capY1, t('caption.start', 'Starts in: {state}.', { state: stateName(t, scene.current) }), {
          'font-size': fontSizes.md,
          'text-anchor': 'middle',
          fill: colors.text,
        });
      } else {
        write(
          gCaption,
          cx,
          capY1,
          t('caption.cross', 'Ways out of {from}: {n}. {cause} leads to {to}.', {
            from: stateName(t, crossing.from),
            n: choices.length,
            cause: causeName(t, crossing.cause),
            to: stateName(t, crossing.to),
          }),
          { 'font-size': fontSizes.md, 'text-anchor': 'middle', fill: colors.text },
        );
        const exits = waysOut(scene.edges, scene.current).length;
        if (exits === 0) {
          const used = scene.walked.filter((n) => n > 0).length;
          write(
            gCaption,
            cx,
            capY2,
            t('caption.end', 'Ways out of {state}: {n}. Moves: {moves} · roads used: {used}/{total}.', {
              state: stateName(t, scene.current),
              n: exits,
              moves: scene.moves,
              used,
              total: scene.edges.length,
            }),
            { 'font-size': fontSizes.sm, 'text-anchor': 'middle', fill: colors.textMuted },
          );
        }
      }
    }

    function wait(ms: number, mine: number): Promise<boolean> {
      return new Promise((resolve) => {
        let settled = false;
        const wake = (): void => {
          if (settled) return;
          settled = true;
          timers.delete(id);
          waiters.delete(wake);
          resolve(mine === gen && !destroyed);
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function cross(next: StateTransitionsScene, mine: number): Promise<void> {
      const frames = Math.max(1, Math.round(CROSS_MS / FRAME_MS));
      for (let k = 0; k < frames; k += 1) {
        if (mine !== gen || destroyed) return;
        drawFrame(next, ease(k / frames));
        if (!(await wait(FRAME_MS, mine))) return;
      }
      if (mine !== gen || destroyed) return;
      drawFrame(next, null);
    }

    return {
      render(
        next: StateTransitionsScene,
        prev: StateTransitionsScene | null,
        opts: { animate: boolean },
      ): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const flows = opts.animate && next.step !== null && prev !== null && prev.moves + 1 === next.moves;
        if (!flows) {
          drawFrame(next, null);
          return;
        }
        return cross(next, mine);
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
