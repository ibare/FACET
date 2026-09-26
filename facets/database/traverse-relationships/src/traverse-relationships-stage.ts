/**
 * traverse-relationships stage — 노드가 쥔 이음을 따라 건너간다.
 *
 * 그림:
 *  - 노드는 종류(자료)마다 한 줄로 선다. 같은 줄끼리의 이음은 줄 위로 휘고, 줄 사이 이음은 곧게 내려간다
 *  - 이음 색 = 이음 종류. 위의 길 칩이 그 색의 범례를 겸한다
 *  - 이음은 세 겹: 흐린 바탕(아무도 안 봤다) · 밝은 선(들여다봤다) · 굵은 선(건넜다)
 *
 * 운동 (한 시계, 900ms):
 *  - 앞 350ms  펼친 노드가 쥔 이음마다 밝은 선이 그 노드 쪽에서 뻗어 나간다 — 들여다본다
 *  - 뒤 550ms  종류가 맞는 이음 위로 나그네 점이 끝 노드까지 건너가고, 굵은 선이 그 뒤를 따른다
 *  - 답 걸음   답 노드에서 고리가 번져 나간다
 * 닿지 않은 노드와 이음은 처음부터 끝까지 흐린 바탕 그대로다.
 */
import {
  categorical,
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
import type { TraverseRelationshipsScene } from './scene.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 노드 반지름 상한 — 줄 안 간격에서 역산하고 이것을 넘지 않는다. */
const NODE_R_MAX = 24;
/** 종류 이름을 두는 왼쪽 여백 */
const ROW_LABEL_W = 84;
const RIGHT_PAD = 18;
/** 길 칩 자리 */
const CHIP_Y = 38;
/** 첫 줄과 마지막 줄의 중심 높이 */
const ROW_TOP_Y = 198;
const ROW_BOTTOM_Y = 318;
/** 휜 이음이 올라갈 수 있는 한계 (칩 아래) */
const ARC_CEIL_Y = 62;
const STAT_LABEL_Y = 370;
const STAT_VALUE_Y = 391;
const CAPTION_Y = 424;

const LOOK_MS = 350;
const CROSS_MS = 550;
const RING_MS = 700;
const FRAME_MS = 16;
const SAMPLES = 40;

type Pt = { x: number; y: number };
type Layout = {
  r: number;
  pos: Map<string, Pt>;
  rows: { kind: string; y: number }[];
  /** 이음마다 다듬은 꺾은선과 그 길이 */
  lines: { pts: Pt[]; len: number }[];
  typeColor: Map<string, string>;
};

const round1 = (v: number): number => {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
};

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polyLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i += 1) s += dist(pts[i - 1]!, pts[i]!);
  return s;
}

/** 꺾은선 위 비율 f 자리 */
function pointAt(pts: Pt[], len: number, f: number): Pt {
  let want = Math.max(0, Math.min(1, f)) * len;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d = dist(a, b);
    if (want <= d || i === pts.length - 1) {
      const u = d === 0 ? 0 : Math.min(1, want / d);
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    want -= d;
  }
  const last = pts[pts.length - 1];
  if (last === undefined) throw new Error('traverse-relationships: 빈 꺾은선');
  return last;
}

function layout(scene: TraverseRelationshipsScene): Layout {
  const kinds: string[] = [];
  for (const n of scene.nodes) if (!kinds.includes(n.kind)) kinds.push(n.kind);
  const rows = kinds.map((kind, i) => ({
    kind,
    y: kinds.length === 1 ? ROW_TOP_Y : ROW_TOP_Y + ((ROW_BOTTOM_Y - ROW_TOP_Y) * i) / (kinds.length - 1),
  }));
  const span = PIECE_CANVAS_W - ROW_LABEL_W - RIGHT_PAD;
  let widest = 1;
  for (const k of kinds) widest = Math.max(widest, scene.nodes.filter((n) => n.kind === k).length);
  const r = Math.min(NODE_R_MAX, (span / widest) * 0.27);

  const pos = new Map<string, Pt>();
  const rowOf = new Map<string, number>();
  rows.forEach((row, ri) => {
    const members = scene.nodes.filter((n) => n.kind === row.kind);
    members.forEach((n, i) => {
      pos.set(n.id, { x: round1(ROW_LABEL_W + ((i + 0.5) * span) / members.length), y: row.y });
      rowOf.set(n.id, ri);
    });
  });

  const lines = scene.edges.map((e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (a === undefined || b === undefined) throw new Error(`traverse-relationships: 이음 ${e.from}→${e.to} 의 노드가 없다`);
    const sameRow = rowOf.get(e.from) === rowOf.get(e.to);
    const raw: Pt[] = [];
    if (sameRow) {
      // 첫 줄은 위로, 나머지 줄은 아래로 휜다. 멀수록 높이 휜다
      const up = rowOf.get(e.from) === 0 ? -1 : 1;
      const rise = Math.min(a.y - ARC_CEIL_Y, 26 + Math.abs(b.x - a.x) * 0.3);
      const c = { x: (a.x + b.x) / 2, y: a.y + up * rise * 2 };
      for (let s = 0; s <= SAMPLES; s += 1) {
        const u = s / SAMPLES;
        const v = 1 - u;
        raw.push({ x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y });
      }
    } else {
      for (let s = 0; s <= SAMPLES; s += 1) {
        const u = s / SAMPLES;
        raw.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      }
    }
    const pts = raw
      .filter((p) => dist(p, a) >= r + 3 && dist(p, b) >= r + 8)
      .map((p) => ({ x: round1(p.x), y: round1(p.y) }));
    if (pts.length < 2) throw new Error(`traverse-relationships: 이음 ${e.from}→${e.to} 가 너무 짧다`);
    return { pts, len: polyLength(pts) };
  });

  const types: string[] = [];
  for (const e of scene.edges) if (!types.includes(e.type)) types.push(e.type);
  for (const p of scene.path) if (!types.includes(p)) types.push(p);
  const palette = categorical(types.length, 'vivid');
  const typeColor = new Map<string, string>();
  types.forEach((ty, i) => typeColor.set(ty, palette[i]!));

  return { r, pos, rows, lines, typeColor };
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const traverseRelationshipsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const monoPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function make<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function words(parent: Element, x: number, y: number, s: string, style: Record<string, string | number>): SVGTextElement {
      const node = make('text', { x: round1(x), y: round1(y), ...style }, parent);
      node.textContent = s;
      return node;
    }

    function pointsAttr(pts: Pt[]): string {
      return pts.map((p) => `${p.x},${p.y}`).join(' ');
    }

    function arrowHead(pts: Pt[], color: string, parent: Element): SVGPolygonElement {
      const end = pts[pts.length - 1]!;
      const before = pts[pts.length - 2]!;
      const d = dist(before, end) || 1;
      const ux = (end.x - before.x) / d;
      const uy = (end.y - before.y) / d;
      const tip = { x: end.x + ux * 7, y: end.y + uy * 7 };
      const back = { x: tip.x - ux * 9, y: tip.y - uy * 9 };
      const left = { x: back.x - uy * 4.5, y: back.y + ux * 4.5 };
      const right = { x: back.x + uy * 4.5, y: back.y - ux * 4.5 };
      return make(
        'polygon',
        { points: pointsAttr([tip, left, right].map((p) => ({ x: round1(p.x), y: round1(p.y) }))), fill: color },
        parent,
      );
    }

    type Handles = {
      lay: Layout;
      look: Map<number, { line: SVGPolylineElement; head: SVGPolygonElement }>;
      cross: Map<number, { line: SVGPolylineElement; head: SVGPolygonElement }>;
      nodeDisc: Map<string, SVGCircleElement>;
      motion: SVGGElement;
    };

    /** 장면 하나의 화면 전체를 세운다. 정본. */
    function drawStatic(scene: TraverseRelationshipsScene): Handles {
      svg.textContent = '';
      const lay = layout(scene);
      const step = scene.step;
      const hopNow = step !== null && step.kind === 'expand' ? step.hop : null;
      const done = scene.answer !== null;

      // 길 칩 — 종류 이름 둘이 곧 길이다
      const chipLayer = make('g', {}, svg);
      const chipGap = 176;
      const chipX0 = PIECE_CANVAS_W / 2 - ((scene.path.length - 1) * chipGap) / 2;
      scene.path.forEach((ty, i) => {
        const cx = chipX0 + i * chipGap;
        const color = lay.typeColor.get(ty)!;
        const w = ty.length * monoPx * 0.62 + 22;
        const hop = i + 1;
        const current = hopNow === hop;
        const past = done || (hopNow !== null && hop < hopNow);
        make(
          'rect',
          {
            x: round1(cx - w / 2),
            y: CHIP_Y - 13,
            width: round1(w),
            height: 26,
            rx: 13,
            fill: current ? color : colors.bg,
            stroke: color,
            'stroke-width': current || past ? 2.5 : 1.2,
          },
          chipLayer,
        );
        words(chipLayer, cx, CHIP_Y + 4, ty, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: current ? colors.stateInk : colors.text,
        });
        words(chipLayer, cx, CHIP_Y - 19, t('label.hop', 'Hop {n}', { n: hop }), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: current ? colors.text : colors.textMuted,
        });
        if (i > 0) {
          const ax = cx - chipGap / 2;
          make(
            'path',
            {
              d: `M${round1(ax - 14)},${CHIP_Y} L${round1(ax + 10)},${CHIP_Y} M${round1(ax + 4)},${CHIP_Y - 5} L${round1(ax + 10)},${CHIP_Y} L${round1(ax + 4)},${CHIP_Y + 5}`,
              fill: 'none',
              stroke: colors.textMuted,
              'stroke-width': 1.5,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            },
            chipLayer,
          );
        }
      });

      // 종류 이름 (자료)
      const rowLayer = make('g', {}, svg);
      for (const row of lay.rows) {
        words(rowLayer, 12, row.y + 4, row.kind, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      }

      // 이음 세 겹
      const base = make('g', {}, svg);
      const lookLayer = make('g', {}, svg);
      const crossLayer = make('g', {}, svg);
      const seen = new Set(scene.seen);
      const crossed = new Set(scene.crossed);
      const look = new Map<number, { line: SVGPolylineElement; head: SVGPolygonElement }>();
      const cross = new Map<number, { line: SVGPolylineElement; head: SVGPolygonElement }>();
      scene.edges.forEach((e, i) => {
        const color = lay.typeColor.get(e.type)!;
        const { pts } = lay.lines[i]!;
        const g = make('g', { opacity: 0.26 }, base);
        make('polyline', { points: pointsAttr(pts), fill: 'none', stroke: color, 'stroke-width': 1.5 }, g);
        arrowHead(pts, color, g);
        if (seen.has(i)) {
          const line = make(
            'polyline',
            { points: pointsAttr(pts), fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linecap': 'round' },
            lookLayer,
          );
          look.set(i, { line, head: arrowHead(pts, color, lookLayer) });
        }
        if (crossed.has(i)) {
          const line = make(
            'polyline',
            { points: pointsAttr(pts), fill: 'none', stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round' },
            crossLayer,
          );
          cross.set(i, { line, head: arrowHead(pts, color, crossLayer) });
        }
      });

      // 노드
      const nodeLayer = make('g', {}, svg);
      const reached = new Set(scene.reached);
      const answer = new Set(scene.answer ?? []);
      const nodeDisc = new Map<string, SVGCircleElement>();
      const expanding = step !== null && step.kind === 'expand' ? step.node : null;
      for (const n of scene.nodes) {
        const p = lay.pos.get(n.id)!;
        let fill = colors.bg;
        let ink = colors.text;
        let stroke = colors.border;
        let sw = 1.2;
        if (reached.has(n.id)) {
          stroke = colors.primary;
          sw = 2.5;
        }
        if (n.id === expanding) {
          fill = colors.itemComparing;
          ink = colors.stateInk;
        }
        if (answer.has(n.id)) {
          fill = colors.accent;
          ink = colors.stateInk;
        }
        const disc = make('circle', { cx: p.x, cy: p.y, r: round1(lay.r), fill, stroke, 'stroke-width': sw }, nodeLayer);
        nodeDisc.set(n.id, disc);
        words(nodeLayer, p.x, p.y + 4, n.id, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': reached.has(n.id) ? 700 : 400,
          fill: ink,
        });
      }

      const motion = make('g', {}, svg);

      // 셈 — 알고리즘이 센 누적
      const hud = make('g', {}, svg);
      const stats: [string, string][] = [
        [
          t('label.seen', 'Edges looked at'),
          t('value.fraction', '{n} / {total}', { n: scene.totals.seen, total: scene.edges.length }),
        ],
        [t('label.crossed', 'Edges crossed'), String(scene.totals.crossed)],
        [
          t('label.reached', 'Nodes reached'),
          t('value.fraction', '{n} / {total}', { n: scene.totals.reached, total: scene.nodes.length }),
        ],
      ];
      const colW = PIECE_CANVAS_W / stats.length;
      stats.forEach(([label, value], i) => {
        const cx = colW * (i + 0.5);
        words(hud, cx, STAT_LABEL_Y, label, {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        words(hud, cx, STAT_VALUE_Y, value, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          fill: colors.text,
        });
      });

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (step === null) {
        caption = t('caption.start', 'Start: {node} · path: {path}', {
          node: scene.start,
          path: scene.path.join(' → '),
        });
      } else if (step.kind === 'expand') {
        const vars = {
          hop: step.hop,
          node: step.node,
          seen: step.seen.length,
          type: step.type,
          crossed: step.crossed.length,
          targets: step.crossed.map((i) => scene.edges[i]!.to).join(', '),
        };
        caption =
          step.crossed.length > 0
            ? t('caption.expand', 'Hop {hop} · {node} — edges held: {seen} · {type} crossed: {crossed} → {targets}', vars)
            : t('caption.expandNone', 'Hop {hop} · {node} — edges held: {seen} · {type} crossed: {crossed}', vars);
      } else {
        caption = t('caption.answer', 'Answer: {answer} · never touched: {untouched}', {
          answer: (scene.answer ?? []).join(', '),
          untouched: (scene.untouched ?? []).join(', '),
        });
      }
      words(hud, PIECE_CANVAS_W / 2, CAPTION_Y, caption, {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });

      return { lay, look, cross, nodeDisc, motion };
    }

    /** 한 시계 — 0→1 을 frame 에 흘린다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const began = Date.now();
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - began) / ms);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: TraverseRelationshipsScene,
      _prev: TraverseRelationshipsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const h = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step === null) return;

      if (step.kind === 'expand') {
        // 아직 못 온 만큼으로 되돌린다: 이번 걸음의 밝은 선 · 굵은 선은 감춰 두고, 새로 닿은 노드는 아직 닿지 않았다
        const setHidden = (line: SVGPolylineElement, len: number, f: number): void => {
          line.setAttribute('stroke-dasharray', `${round1(len)} ${round1(len)}`);
          line.setAttribute('stroke-dashoffset', String(round1(len * (1 - f))));
        };
        for (const i of step.seen) {
          const o = h.look.get(i)!;
          setHidden(o.line, h.lay.lines[i]!.len, 0);
          o.head.setAttribute('visibility', 'hidden');
        }
        for (const i of step.crossed) {
          const o = h.cross.get(i)!;
          setHidden(o.line, h.lay.lines[i]!.len, 0);
          o.head.setAttribute('visibility', 'hidden');
        }
        for (const id of step.reached) {
          const disc = h.nodeDisc.get(id)!;
          disc.setAttribute('stroke', colors.border);
          disc.setAttribute('stroke-width', '1.2');
        }

        await tween(LOOK_MS, mine, (p) => {
          const f = ease(p);
          for (const i of step.seen) setHidden(h.look.get(i)!.line, h.lay.lines[i]!.len, f);
          if (p >= 1) for (const i of step.seen) h.look.get(i)!.head.removeAttribute('visibility');
        });
        if (mine !== gen || destroyed) return;

        const walkers = step.crossed.map((i) => {
          const e = next.edges[i]!;
          return make(
            'circle',
            { r: 6.5, fill: h.lay.typeColor.get(e.type)!, stroke: colors.bg, 'stroke-width': 2 },
            h.motion,
          );
        });
        await tween(CROSS_MS, mine, (p) => {
          const f = ease(p);
          step.crossed.forEach((i, k) => {
            const ln = h.lay.lines[i]!;
            setHidden(h.cross.get(i)!.line, ln.len, f);
            const at = pointAt(ln.pts, ln.len, f);
            walkers[k]!.setAttribute('cx', String(round1(at.x)));
            walkers[k]!.setAttribute('cy', String(round1(at.y)));
          });
        });
        if (mine !== gen || destroyed) return;
        drawStatic(next);
        return;
      }

      // 답 — 답 노드에서 고리가 번진다
      const rings = (next.answer ?? []).map((id) => {
        const p = h.lay.pos.get(id)!;
        return make(
          'circle',
          { cx: p.x, cy: p.y, r: round1(h.lay.r), fill: 'none', stroke: colors.accent, 'stroke-width': 3 },
          h.motion,
        );
      });
      await tween(RING_MS, mine, (p) => {
        const f = ease(p);
        for (const ring of rings) {
          ring.setAttribute('r', String(round1(h.lay.r + 14 * f)));
          ring.setAttribute('stroke-width', String(round1(3 * (1 - f) + 0.5)));
        }
      });
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
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
