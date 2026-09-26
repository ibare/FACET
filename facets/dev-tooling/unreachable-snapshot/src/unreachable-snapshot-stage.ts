/**
 * unreachable-snapshot 무대.
 *
 * 동사는 "치워진다". 이름표가 떠나거나 옮겨도 커밋 점은 제자리에 남는다. 치우기 때가 오면
 * 이름표에서 표시 알갱이가 내려와 커밋에 박히고, 부모 화살을 따라 한 칸씩 거슬러 간다.
 * 이미 표시된 부모 앞에서는 길이 막대에 걸려 멈춘다. 마지막 걸음에 표시 없는 커밋이
 * 오그라들며 아래로 떨어져 나간다.
 *
 * 시간은 왼쪽에서 오른쪽으로 흐른다 (부모가 왼쪽). 화살은 늘 자식 → 부모.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { HistoryCommit, HistoryName } from './algorithm.js';
import type { UnreachableScene } from './scene.js';

const H = 316;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 커밋 점 반지름 */
const R = 16;
/** 이름표 높이와 점까지의 틈 */
const TAG_H = 20;
const TAG_GAP = 8;
/** 가로 여백 — 이름표가 점보다 넓어 가장자리를 비운다 */
const SIDE = 52;
/** 첫 줄기의 세로 자리와 줄기 사이 간격의 상한 */
const LANE_TOP = 24 + TAG_H + TAG_GAP + R;
const LANE_GAP_MAX = 72;
const LANE_BOTTOM = H - 66 - R;
/** 캡션 두 줄의 바닥선 */
const CAP1_Y = H - 34;
const CAP2_Y = H - 12;

/** 운동 길이 (ms) */
const LEAVE_MS = 450;
const SLIDE_MS = 450;
const TRAVEL_MS = 450;
const HALT_MS = 300;
const SWEEP_MS = 550;

type Pt = { x: number; y: number };

function round(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/**
 * 커밋 자리 — 깊이(뿌리에서 센 부모 수)가 가로, 줄기가 세로.
 * 커밋은 데이터 차례로 줄기를 받는다: 부모의 줄기가 아직 이어지지 않았으면 그것을 잇고,
 * 이미 다른 자식이 이었으면 새 줄기를 연다. 치운 커밋도 자리는 그대로 셈한다.
 */
function layout(commits: readonly HistoryCommit[]): Map<string, Pt> {
  const depth = new Map<string, number>();
  const lane = new Map<string, number>();
  const continued = new Set<string>();
  let lanes = 0;
  for (const c of commits) {
    const parent = c.parents[0];
    if (parent === undefined) {
      depth.set(c.id, 0);
      lane.set(c.id, lanes);
      lanes += 1;
      continue;
    }
    const pd = depth.get(parent);
    const pl = lane.get(parent);
    if (pd === undefined || pl === undefined) {
      throw new Error(`unreachable-snapshot: 커밋 ${c.id} 의 부모 ${parent} 자리가 없다`);
    }
    depth.set(c.id, pd + 1);
    if (continued.has(parent)) {
      lane.set(c.id, lanes);
      lanes += 1;
    } else {
      lane.set(c.id, pl);
    }
    continued.add(parent);
  }
  let maxDepth = 0;
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
  const colGap = maxDepth === 0 ? 0 : (PIECE_CANVAS_W - SIDE * 2) / maxDepth;
  const laneGap = lanes <= 1 ? 0 : Math.min(LANE_GAP_MAX, (LANE_BOTTOM - LANE_TOP) / (lanes - 1));
  const out = new Map<string, Pt>();
  for (const c of commits) {
    const d = depth.get(c.id);
    const l = lane.get(c.id);
    if (d === undefined || l === undefined) throw new Error(`unreachable-snapshot: 커밋 ${c.id} 자리를 셈하지 못했다`);
    out.set(c.id, { x: round(SIDE + d * colGap), y: round(LANE_TOP + l * laneGap) });
  }
  return out;
}

export const unreachableSnapshotStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const tagPx = parseFloat(fontSizes.sm);
    const charW = tagPx * 0.62;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 정적 그리기가 세운 요소의 손잡이 — drawStatic 마다 새로 채운다
    let dots = new Map<string, { circle: SVGCircleElement; label: SVGTextElement }>();
    let edges = new Map<string, { line: SVGLineElement; head: SVGPolygonElement }>();
    let pointers = new Map<string, SVGLineElement>();
    let tags = new Map<string, SVGGElement>();
    let stubs = new Map<string, { line: SVGLineElement; bar: SVGLineElement }>();
    let overlay: SVGGElement | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      parent.appendChild(node);
      return node;
    }

    function tagWidth(name: string): number {
      return round(name.length * charW + 14);
    }

    /** 커밋마다 그 위에 선 이름표들의 가로 자리 (가운데 기준 오프셋) */
    function tagOffsets(names: readonly HistoryName[]): Map<string, number> {
      const byCommit = new Map<string, string[]>();
      for (const n of names) {
        const list = byCommit.get(n.at) ?? [];
        list.push(n.name);
        byCommit.set(n.at, list);
      }
      const out = new Map<string, number>();
      for (const list of byCommit.values()) {
        const total = list.reduce((a, name) => a + tagWidth(name), 0) + (list.length - 1) * 4;
        let x = -total / 2;
        for (const name of list) {
          const w = tagWidth(name);
          out.set(name, round(x + w / 2));
          x += w + 4;
        }
      }
      return out;
    }

    /** 가운데 (cx, 점 중심 y) 에 선 이름표 하나 — 점 위 */
    function drawTag(parent: Element, name: string, cx: number, cy: number, active: boolean, walked: boolean): SVGGElement {
      const g = el('g', {}, parent);
      const w = tagWidth(name);
      const bottom = cy - R - TAG_GAP;
      const pointer = el(
        'line',
        {
          x1: cx,
          y1: bottom,
          x2: cx,
          y2: cy - R,
          stroke: walked ? colors.accent : colors.textMuted,
          'stroke-width': walked ? 3 : 1.5,
        },
        g,
      );
      pointers.set(name, pointer);
      el(
        'rect',
        {
          x: cx - w / 2,
          y: bottom - TAG_H,
          width: w,
          height: TAG_H,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: active ? colors.accent : colors.border,
          'stroke-width': active ? 2.5 : 1,
        },
        g,
      );
      const label = el(
        'text',
        {
          x: cx,
          y: bottom - TAG_H / 2 + tagPx * 0.35,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        },
        g,
      );
      label.textContent = name;
      return g;
    }

    /** 자식 → 부모 화살: 두 점의 가장자리 사이 */
    function arrowPoints(from: Pt, to: Pt): { a: Pt; b: Pt; head: string } {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const a = { x: from.x + ux * R, y: from.y + uy * R };
      const tip = { x: to.x - ux * (R + 2), y: to.y - uy * (R + 2) };
      const b = { x: tip.x - ux * 7, y: tip.y - uy * 7 };
      const left = { x: b.x - uy * 4.5, y: b.y + ux * 4.5 };
      const right = { x: b.x + uy * 4.5, y: b.y - ux * 4.5 };
      const head = [tip, left, right].map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
      return { a, b, head };
    }

    function haltGeometry(from: Pt, to: Pt): { a: Pt; tip: Pt; nx: number; ny: number } {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const a = { x: from.x + ux * R, y: from.y + uy * R };
      const reach = (len - 2 * R) * 0.45;
      return { a, tip: { x: a.x + ux * reach, y: a.y + uy * reach }, nx: -uy, ny: ux };
    }

    function drawStatic(scene: UnreachableScene): void {
      svg.textContent = '';
      dots = new Map();
      edges = new Map();
      pointers = new Map();
      tags = new Map();
      stubs = new Map();
      overlay = null;

      const pos = layout(scene.commits);
      const gone = new Set(scene.gone);
      const marked = new Set(scene.marks.map((m) => m.commit));
      const walkedEdge = new Set(
        scene.marks.filter((m) => m.via !== null).map((m) => `${m.via ?? ''}>${m.commit}`),
      );
      const walkedName = new Set(scene.marks.filter((m) => m.via === null).map((m) => m.name));
      const step = scene.step;
      const activeName = step.kind === 'mark' ? step.name : null;

      const edgeLayer = el('g', {}, svg);
      for (const c of scene.commits) {
        if (gone.has(c.id)) continue;
        const parent = c.parents[0];
        if (parent === undefined) continue;
        const from = pos.get(c.id);
        const to = pos.get(parent);
        if (!from || !to) throw new Error(`unreachable-snapshot: 화살 ${c.id} → ${parent} 의 자리가 없다`);
        const key = `${c.id}>${parent}`;
        const walked = walkedEdge.has(key);
        const ink = walked ? colors.accent : colors.textMuted;
        const g = arrowPoints(from, to);
        const line = el(
          'line',
          { x1: g.a.x, y1: g.a.y, x2: g.b.x, y2: g.b.y, stroke: ink, 'stroke-width': walked ? 3 : 1.5 },
          edgeLayer,
        );
        const head = el('polygon', { points: g.head, fill: ink }, edgeLayer);
        edges.set(key, { line, head });
      }

      for (const h of scene.halts) {
        const from = pos.get(h.from);
        const to = pos.get(h.at);
        if (!from || !to) throw new Error(`unreachable-snapshot: 멈춘 길 ${h.from} → ${h.at} 의 자리가 없다`);
        const g = haltGeometry(from, to);
        const line = el(
          'line',
          {
            x1: g.a.x,
            y1: g.a.y,
            x2: g.tip.x,
            y2: g.tip.y,
            stroke: colors.accent,
            'stroke-width': 3,
            'stroke-dasharray': '4 3',
          },
          edgeLayer,
        );
        const bar = el(
          'line',
          {
            x1: g.tip.x - g.nx * 9,
            y1: g.tip.y - g.ny * 9,
            x2: g.tip.x + g.nx * 9,
            y2: g.tip.y + g.ny * 9,
            stroke: colors.text,
            'stroke-width': 3,
            'stroke-linecap': 'round',
          },
          edgeLayer,
        );
        stubs.set(h.from, { line, bar });
      }

      const dotLayer = el('g', {}, svg);
      for (const c of scene.commits) {
        if (gone.has(c.id)) continue;
        const p = pos.get(c.id);
        if (!p) throw new Error(`unreachable-snapshot: 커밋 ${c.id} 자리가 없다`);
        const on = marked.has(c.id);
        const circle = el(
          'circle',
          {
            cx: p.x,
            cy: p.y,
            r: R,
            fill: on ? colors.accent : colors.bg,
            stroke: colors.text,
            'stroke-width': on ? 2.5 : 1.5,
          },
          dotLayer,
        );
        const label = el(
          'text',
          {
            x: p.x,
            y: p.y + parseFloat(fontSizes.md) * 0.35,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 600,
            fill: on ? colors.stateInk : colors.text,
          },
          dotLayer,
        );
        label.textContent = c.id;
        dots.set(c.id, { circle, label });
      }

      const tagLayer = el('g', {}, svg);
      const offsets = tagOffsets(scene.names);
      for (const n of scene.names) {
        const p = pos.get(n.at);
        if (!p) throw new Error(`unreachable-snapshot: 이름 ${n.name} 의 커밋 ${n.at} 자리가 없다`);
        const off = offsets.get(n.name);
        if (off === undefined) throw new Error(`unreachable-snapshot: 이름 ${n.name} 의 이름표 자리가 없다`);
        const g = drawTag(tagLayer, n.name, p.x + off, p.y, activeName === n.name, walkedName.has(n.name));
        tags.set(n.name, g);
      }

      overlay = el('g', {}, svg);
      drawCaption(scene);
    }

    function drawCaption(scene: UnreachableScene): void {
      const step = scene.step;
      const n = scene.commits.length - scene.gone.length;
      let line1 = '';
      let line2 = '';
      if (step.kind === 'start') {
        line1 = t('caption.start', 'Names point at commits. Commits: {n}', { n });
      } else if (step.kind === 'delete') {
        line1 = t('caption.delete', 'Deleted name {name}. Commits: {n}', { name: step.name, n });
      } else if (step.kind === 'move') {
        line1 = t('caption.move', 'Moved {name} back: {from} → {to}. Commits: {n}', {
          name: step.name,
          from: step.from,
          to: step.to,
          n,
        });
      } else if (step.kind === 'mark') {
        line1 =
          step.via === null
            ? t('caption.markFirst', 'Cleanup: walking back from {name}. Marked: {commit}', {
                name: step.name,
                commit: step.commit,
              })
            : t('caption.markNext', 'From {name}, on to the parent. Marked: {commit}', {
                name: step.name,
                commit: step.commit,
              });
        if (step.halt !== null) {
          line2 = t('caption.halt', 'Next parent {commit} is already marked. This path stops.', {
            commit: step.halt,
          });
        }
      } else {
        line1 = t('caption.sweep', 'Swept the unmarked: {gone}. Commits: {n}', {
          gone: step.gone.join(' '),
          n,
        });
        line2 = t('caption.tally', 'Marked: {m} · Swept: {k}', { m: scene.marks.length, k: step.gone.length });
      }
      const cap1 = el(
        'text',
        {
          x: PIECE_CANVAS_W / 2,
          y: CAP1_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        svg,
      );
      cap1.textContent = line1;
      if (line2 !== '') {
        const cap2 = el(
          'text',
          {
            x: PIECE_CANVAS_W / 2,
            y: CAP2_Y,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          },
          svg,
        );
        cap2.textContent = line2;
      }
    }

    function live(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    /** 한 운동의 시계. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(mine: number, ms: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!live(mine)) {
            finish();
            return;
          }
          const k = Math.min(1, (Date.now() - start) / ms);
          frame(ease(k));
          if (k >= 1) {
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

    /** 떠난 이름표 — 제자리에서 위로 떠오르며 걷힌다 */
    async function animateLeave(mine: number, scene: UnreachableScene, name: string, at: string): Promise<void> {
      const p = layout(scene.commits).get(at);
      if (!p || !overlay) throw new Error(`unreachable-snapshot: delete-name 의 커밋 ${at} 자리 또는 덧그림 층이 없다 (이름 ${name})`);
      const g = drawTag(overlay, name, p.x, p.y, false, false);
      pointers.delete(name);
      await tween(mine, LEAVE_MS, (k) => {
        g.setAttribute('transform', `translate(0 ${round(-28 * k)})`);
        g.setAttribute('opacity', String(round(1 - k)));
      });
    }

    /** 옮겨 붙는 이름표 — 끝 자리에 서 있고, 아직 못 온 만큼 옛 자리 쪽에 있다 */
    async function animateSlide(mine: number, scene: UnreachableScene, name: string, from: string, to: string): Promise<void> {
      const pos = layout(scene.commits);
      const a = pos.get(from);
      const b = pos.get(to);
      const g = tags.get(name);
      if (!a || !b || !g) throw new Error(`unreachable-snapshot: move-name 의 자리 ${from} → ${to} 또는 이름표 ${name} 가 없다`);
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      g.setAttribute('transform', `translate(${round(dx)} ${round(dy)})`);
      await tween(mine, SLIDE_MS, (k) => {
        g.setAttribute('transform', `translate(${round(dx * (1 - k))} ${round(dy * (1 - k))})`);
      });
    }

    /** 표시 알갱이 — 이름표 또는 자식 점에서 출발해 부모 화살을 따라 커밋에 박힌다 */
    async function animateMark(
      mine: number,
      scene: UnreachableScene,
      name: string,
      commit: string,
      via: string | null,
      halt: string | null,
    ): Promise<void> {
      const pos = layout(scene.commits);
      const target = pos.get(commit);
      const dot = dots.get(commit);
      if (!target || !dot || !overlay) throw new Error(`unreachable-snapshot: mark 의 커밋 ${commit} 자리 · 점 · 덧그림 층이 없다`);
      let source: Pt;
      let path: { line: SVGLineElement; head: SVGPolygonElement | null } | null = null;
      if (via === null) {
        source = { x: target.x, y: target.y - R - TAG_GAP };
        const pointer = pointers.get(name);
        if (!pointer) throw new Error(`unreachable-snapshot: mark 의 이름 ${name} 이름표 줄이 없다 (커밋 ${commit})`);
        path = { line: pointer, head: null };
      } else {
        const v = pos.get(via);
        if (!v) throw new Error(`unreachable-snapshot: mark 의 via 커밋 ${via} 자리가 없다 (커밋 ${commit})`);
        source = v;
        const e = edges.get(`${via}>${commit}`);
        if (!e) throw new Error(`unreachable-snapshot: mark 의 화살 ${via} → ${commit} 가 없다`);
        path = { line: e.line, head: e.head };
      }

      // 아직 닿지 않은 모습으로 되돌려 둔다 — 알갱이가 닿는 순간 끝 자리가 선다
      dot.circle.setAttribute('fill', colors.bg);
      dot.circle.setAttribute('stroke-width', '1.5');
      dot.label.setAttribute('fill', colors.text);
      if (path) {
        path.line.setAttribute('stroke', colors.textMuted);
        path.line.setAttribute('stroke-width', '1.5');
        path.head?.setAttribute('fill', colors.textMuted);
      }
      const stub = halt === null ? undefined : stubs.get(commit);
      if (halt !== null && !stub) throw new Error(`unreachable-snapshot: mark 의 멈춘 길 ${commit} → ${halt} 가 없다`);
      if (stub) {
        stub.line.setAttribute('visibility', 'hidden');
        stub.bar.setAttribute('visibility', 'hidden');
      }

      const grain = el(
        'circle',
        { cx: source.x, cy: source.y, r: 6, fill: colors.accent, stroke: colors.text, 'stroke-width': 1.5 },
        overlay,
      );
      await tween(mine, TRAVEL_MS, (k) => {
        grain.setAttribute('cx', String(round(source.x + (target.x - source.x) * k)));
        grain.setAttribute('cy', String(round(source.y + (target.y - source.y) * k)));
      });
      if (!live(mine)) return;
      grain.remove();
      dot.circle.setAttribute('fill', colors.accent);
      dot.circle.setAttribute('stroke-width', '2.5');
      dot.label.setAttribute('fill', colors.stateInk);
      if (path) {
        path.line.setAttribute('stroke', colors.accent);
        path.line.setAttribute('stroke-width', '3');
        path.head?.setAttribute('fill', colors.accent);
      }

      if (halt === null || !stub) return;
      const at = pos.get(halt);
      if (!at) throw new Error(`unreachable-snapshot: mark 의 halt 커밋 ${halt} 자리가 없다 (커밋 ${commit})`);
      // 다음 부모 쪽으로 뻗다가 막대에 걸린다
      const g = haltGeometry(target, at);
      stub.line.removeAttribute('visibility');
      stub.bar.removeAttribute('visibility');
      await tween(mine, HALT_MS, (k) => {
        const tip = { x: g.a.x + (g.tip.x - g.a.x) * k, y: g.a.y + (g.tip.y - g.a.y) * k };
        stub.line.setAttribute('x2', String(round(tip.x)));
        stub.line.setAttribute('y2', String(round(tip.y)));
        stub.bar.setAttribute('x1', String(round(tip.x - g.nx * 9 * k)));
        stub.bar.setAttribute('y1', String(round(tip.y - g.ny * 9 * k)));
        stub.bar.setAttribute('x2', String(round(tip.x + g.nx * 9 * k)));
        stub.bar.setAttribute('y2', String(round(tip.y + g.ny * 9 * k)));
      });
    }

    /** 치우기 — 표시 없는 커밋이 오그라들며 아래로 떨어져 나간다 */
    async function animateSweep(mine: number, scene: UnreachableScene, gone: readonly string[]): Promise<void> {
      if (!overlay) throw new Error(`unreachable-snapshot: sweep 의 덧그림 층이 없다 (치울 커밋 ${gone.join(' ')})`);
      const pos = layout(scene.commits);
      const falling: { g: SVGGElement; edge: SVGGElement | null; p: Pt }[] = [];
      for (const id of gone) {
        const p = pos.get(id);
        const c = scene.commits.find((x) => x.id === id);
        if (!p || !c) throw new Error(`unreachable-snapshot: 치울 커밋 ${id} 가 없다`);
        let edge: SVGGElement | null = null;
        const parent = c.parents[0];
        const pp = parent === undefined ? undefined : pos.get(parent);
        if (pp) {
          edge = el('g', {}, overlay);
          const a = arrowPoints(p, pp);
          el('line', { x1: a.a.x, y1: a.a.y, x2: a.b.x, y2: a.b.y, stroke: colors.textMuted, 'stroke-width': 1.5 }, edge);
          el('polygon', { points: a.head, fill: colors.textMuted }, edge);
        }
        const g = el('g', {}, overlay);
        el('circle', { cx: p.x, cy: p.y, r: R, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, g);
        const label = el(
          'text',
          {
            x: p.x,
            y: p.y + parseFloat(fontSizes.md) * 0.35,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 600,
            fill: colors.text,
          },
          g,
        );
        label.textContent = id;
        falling.push({ g, edge, p });
      }
      await tween(mine, SWEEP_MS, (k) => {
        for (const f of falling) {
          const s = round(1 - k);
          const drop = round(36 * k);
          // 제 중심을 붙든 채 오그라들고 아래로 떨어진다
          f.g.setAttribute(
            'transform',
            `translate(${round(f.p.x)} ${round(f.p.y + drop)}) scale(${s}) translate(${round(-f.p.x)} ${round(-f.p.y)})`,
          );
          f.edge?.setAttribute('opacity', String(s));
        }
      });
    }

    return {
      async render(next: UnreachableScene, _prev: UnreachableScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || destroyed) return;
        const step = next.step;
        if (step.kind === 'start') return;
        if (step.kind === 'delete') await animateLeave(mine, next, step.name, step.at);
        else if (step.kind === 'move') await animateSlide(mine, next, step.name, step.from, step.to);
        else if (step.kind === 'mark') await animateMark(mine, next, step.name, step.commit, step.via, step.halt);
        else await animateSweep(mine, next, step.gone);
        if (!live(mine)) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
