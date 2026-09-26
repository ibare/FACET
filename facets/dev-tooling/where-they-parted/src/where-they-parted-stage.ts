/**
 * where-they-parted 의 그림.
 *
 * 가로는 커밋을 만든 시각이다 — 오른쪽이 늦다. 그래서 "가장 늦은 것부터 꺼낸다" 는 세로 줄(지금 꺼낸 시각)이
 * 오른쪽에서 왼쪽으로 옮겨 가는 것으로 보이고, 두 갈래를 번갈아 밟는다.
 * 세로 층은 커밋에 닿는 이름으로 나눈다 — 위는 첫째 이름만, 아래는 둘째 이름만, 가운데는 둘 다.
 *
 * 움직이는 것은 **표시**다. 꺼낸 커밋의 표시가 화살을 따라 부모로 내려간다 (원래 표시는 제자리에 남는다).
 * 첫째 이름의 표시는 커밋 위에, 둘째 이름의 표시는 아래에 붙어 두 표시가 한 커밋에 모이면 위아래로 겹친다.
 * 이름표는 움직이지 않는다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { reachingNames, type CommitSpec, type NameSpec } from './algorithm.js';
import type { WhereTheyPartedScene } from './scene.js';

const H = 300;
const NS = 'http://www.w3.org/2000/svg';

const PAD_L = 40;
/** 이름표와 시각 글자가 들어갈 오른쪽 여백 */
const PAD_R = 112;
const R_MAX = 14;
const MARK = 12;
const CAPTION_Y = 24;
const CAPTION2_Y = 46;
const LANE_TOP = 100;
const LANE_MID = 150;
const LANE_BOT = 200;
const AXIS_Y = 242;
const LINE_Y = 278;
const CURSOR_TOP = 64;
const MOVE_MS = 720;

type Pt = { x: number; y: number };

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function ease(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function part(u: number, a: number, b: number): number {
  return ease((u - a) / (b - a));
}

type Layout = {
  pos: Map<string, Pt>;
  r: number;
  xOf(time: number): number;
  tMin: number;
  tMax: number;
};

function specsOf(scene: WhereTheyPartedScene): { commits: CommitSpec[]; names: NameSpec[] } {
  return {
    commits: scene.commits.map((c) => ({ id: c.id, parents: c.parent === null ? [] : [c.parent], time: c.time })),
    names: scene.names.map((n) => ({ name: n.name, commit: n.commit })),
  };
}

function layoutOf(scene: WhereTheyPartedScene): Layout {
  const { commits, names } = specsOf(scene);
  const reach = reachingNames(commits, names);
  const times = scene.commits.map((c) => c.time);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const span = Math.max(1, tMax - tMin);
  const usable = PIECE_CANVAS_W - PAD_L - PAD_R;
  const xOf = (time: number): number => r2(PAD_L + ((time - tMin) / span) * usable);
  const r = Math.min(R_MAX, r2((usable / span) * 0.24));
  const first = scene.names[0]?.name;
  const second = scene.names[1]?.name;
  const pos = new Map<string, Pt>();
  for (const c of scene.commits) {
    const who = reach.get(c.id);
    if (who === undefined) throw new Error(`where-they-parted stage: 닿는 이름을 모르는 커밋 ${c.id}`);
    const y =
      who.length === 1 && who[0] === first ? LANE_TOP : who.length === 1 && who[0] === second ? LANE_BOT : LANE_MID;
    pos.set(c.id, { x: xOf(c.time), y });
  }
  return { pos, r, xOf, tMin, tMax };
}

function at(layout: Layout, id: string): Pt {
  const p = layout.pos.get(id);
  if (p === undefined) throw new Error(`where-they-parted stage: 자리 없는 커밋 ${id}`);
  return p;
}

/** 이름 차례 i 번째 표시가 붙는 자리 — 첫째는 위, 둘째는 아래 */
function markAt(layout: Layout, id: string, slot: number): Pt {
  const p = at(layout, id);
  const off = layout.r + MARK / 2 + 5;
  return { x: p.x, y: r2(slot === 0 ? p.y - off : p.y + off) };
}

function timeOf(scene: WhereTheyPartedScene, id: string): number {
  const c = scene.commits.find((x) => x.id === id);
  if (c === undefined) throw new Error(`where-they-parted stage: 없는 커밋 ${id}`);
  return c.time;
}

/** 꺾은선의 앞쪽 fraction 만큼 */
function partialPoints(pts: Pt[], fraction: number): Pt[] {
  if (pts.length < 2 || fraction >= 1) return pts;
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(l);
    total += l;
  }
  let left = total * Math.max(0, fraction);
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length; i += 1) {
    const l = lens[i - 1]!;
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (left >= l) {
      out.push(b);
      left -= l;
      continue;
    }
    const k = l === 0 ? 0 : left / l;
    out.push({ x: r2(a.x + (b.x - a.x) * k), y: r2(a.y + (b.y - a.y) * k) });
    break;
  }
  return out;
}

function pointsAttr(pts: Pt[]): string {
  return pts.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');
}

export const whereTheyPartedStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const markColors = categorical(2, 'vivid');
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    type Handles = {
      marks: Map<string, SVGRectElement>;
      cursor: SVGLineElement | null;
      paths: { el: SVGPolylineElement; pts: Pt[] }[];
      baseNode: SVGCircleElement | null;
      baseLetter: SVGTextElement | null;
    };

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    }

    function label(x: number, y: number, s: string, attrs: Record<string, string | number>): SVGTextElement {
      const e = el('text', { x: r2(x), y: r2(y), 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...attrs });
      e.textContent = s;
      return e;
    }

    function markColor(scene: WhereTheyPartedScene, name: string): string {
      const i = scene.names.findIndex((n) => n.name === name);
      const col = markColors[i];
      if (col === undefined) throw new Error(`where-they-parted stage: 모르는 이름 ${name}`);
      return col;
    }

    function captionLines(scene: WhereTheyPartedScene): string[] {
      const step = scene.step;
      const [first, second] = scene.names;
      if (first === undefined || second === undefined) throw new Error('where-they-parted stage: 이름이 둘이 아니다');
      if (step.kind === 'start') {
        return [
          t('caption.start', 'Each tip gets its own mark: {first} → {firstAt} · {second} → {secondAt}', {
            first: first.name,
            firstAt: first.commit,
            second: second.name,
            secondAt: second.commit,
          }),
        ];
      }
      const time = timeOf(scene, step.commit);
      if (step.kind === 'take') {
        if (step.given.length > 1) throw new Error(`where-they-parted stage: 부모가 여럿인 커밋 ${step.commit}`);
        const g = step.given[0];
        if (g === undefined) {
          return [t('caption.takeRoot', 'Latest in line: {commit} (time {time}) — no parent to pass to', { commit: step.commit, time })];
        }
        if (g.added.length === 0) {
          return [
            t('caption.takeHad', 'Latest in line: {commit} (time {time}) — {parent} already has the mark', {
              commit: step.commit,
              time,
              parent: g.parent,
            }),
          ];
        }
        return [
          t('caption.take', 'Latest in line: {commit} (time {time}) — mark {marks} passes to {parent}', {
            commit: step.commit,
            time,
            marks: g.added.join(' + '),
            parent: g.parent,
          }),
        ];
      }
      const d1 = step.distances.find((d) => d.name === first.name);
      const d2 = step.distances.find((d) => d.name === second.name);
      if (d1 === undefined || d2 === undefined) throw new Error('where-they-parted stage: 거리가 모자란다');
      return [
        t('caption.found', 'Latest in line: {commit} (time {time}) — it carries both marks', { commit: step.commit, time }),
        t('caption.result', 'Split point: {commit} · steps from {first}: {d1} · from {second}: {d2} · commits taken: {n}', {
          commit: step.commit,
          first: first.name,
          d1: d1.steps,
          second: second.name,
          d2: d2.steps,
          n: step.taken,
        }),
      ];
    }

    function drawStatic(scene: WhereTheyPartedScene): Handles {
      svg.textContent = '';
      const layout = layoutOf(scene);
      const step = scene.step;
      const base = step.kind === 'found' ? step.commit : null;
      const current = step.kind === 'take' ? step.commit : null;
      const handles: Handles = { marks: new Map(), cursor: null, paths: [], baseNode: null, baseLetter: null };

      // 캡션
      const lines = captionLines(scene);
      lines.forEach((s, i) => {
        label(PAD_L - 16, i === 0 ? CAPTION_Y : CAPTION2_Y, s, {
          'font-size': i === 0 ? fontSizes.md : fontSizes.sm,
          'font-weight': i === 1 ? 600 : 400,
        });
      });

      // 시각 축
      el('line', {
        x1: layout.xOf(layout.tMin),
        y1: AXIS_Y,
        x2: layout.xOf(layout.tMax),
        y2: AXIS_Y,
        stroke: c.border,
        'stroke-width': 1,
      });
      for (const cm of scene.commits) {
        const x = layout.xOf(cm.time);
        el('line', { x1: x, y1: AXIS_Y - 3, x2: x, y2: AXIS_Y + 3, stroke: c.border, 'stroke-width': 1 });
        label(x, AXIS_Y + 16, String(cm.time), { 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs });
      }
      label(layout.xOf(layout.tMax) + 16, AXIS_Y + 4, t('label.time', 'time'), {
        fill: c.textMuted,
        'font-size': fontSizes.xs,
      });

      // 지금 꺼낸 시각
      if (step.kind !== 'start') {
        const x = layout.xOf(timeOf(scene, step.commit));
        handles.cursor = el('line', {
          x1: x,
          y1: CURSOR_TOP,
          x2: x,
          y2: AXIS_Y,
          stroke: c.primary,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
      }

      // 두 끝에서 갈라진 자리까지 내려온 길
      if (step.kind === 'found') {
        for (const d of step.distances) {
          const pts = [...d.path].reverse().map((id) => at(layout, id));
          const e = el('polyline', {
            points: pointsAttr(pts),
            fill: 'none',
            stroke: markColor(scene, d.name),
            'stroke-width': 7,
            'stroke-opacity': 0.4,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          });
          handles.paths.push({ el: e, pts });
        }
      }

      // 화살 — 커밋에서 부모로
      for (const cm of scene.commits) {
        if (cm.parent === null) continue;
        const a = at(layout, cm.id);
        const b = at(layout, cm.parent);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len === 0) continue;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const sx = a.x + ux * layout.r;
        const sy = a.y + uy * layout.r;
        const ex = b.x - ux * (layout.r + 1);
        const ey = b.y - uy * (layout.r + 1);
        el('line', { x1: r2(sx), y1: r2(sy), x2: r2(ex), y2: r2(ey), stroke: c.textMuted, 'stroke-width': 1.4 });
        const hx = ex - ux * 7;
        const hy = ey - uy * 7;
        el('polygon', {
          points: pointsAttr([
            { x: ex, y: ey },
            { x: hx - uy * 3.5, y: hy + ux * 3.5 },
            { x: hx + uy * 3.5, y: hy - ux * 3.5 },
          ]),
          fill: c.textMuted,
        });
      }

      // 이름표 — 끝 커밋 오른쪽에서 커밋을 가리킨다
      scene.names.forEach((n) => {
        const p = at(layout, n.commit);
        const w = r2(n.name.length * smPx * 0.62 + 14);
        const x0 = p.x + layout.r + 20;
        el('line', { x1: r2(x0), y1: p.y, x2: r2(p.x + layout.r + 7), y2: p.y, stroke: c.text, 'stroke-width': 1.2 });
        el('polygon', {
          points: pointsAttr([
            { x: p.x + layout.r + 1, y: p.y },
            { x: p.x + layout.r + 8, y: p.y - 3.5 },
            { x: p.x + layout.r + 8, y: p.y + 3.5 },
          ]),
          fill: c.text,
        });
        el('rect', {
          x: r2(x0),
          y: p.y - 11,
          width: w,
          height: 22,
          rx: 4,
          fill: c.bg,
          stroke: markColor(scene, n.name),
          'stroke-width': 2,
        });
        label(x0 + w / 2, p.y + 1, n.name, {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
        });
      });

      // 커밋
      const taken = new Set(scene.taken);
      for (const cm of scene.commits) {
        const p = at(layout, cm.id);
        const isBase = cm.id === base;
        const isCur = cm.id === current;
        const wasTaken = taken.has(cm.id) && !isBase && !isCur;
        const node = el('circle', {
          cx: p.x,
          cy: p.y,
          r: layout.r,
          fill: isBase ? c.accent : wasTaken ? c.bgSubtle : c.bg,
          stroke: isCur ? c.primary : wasTaken ? c.border : c.text,
          'stroke-width': isCur || isBase ? 2.6 : 1.4,
        });
        const letter = label(p.x, p.y + 1, cm.id, {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': isBase || isCur ? 700 : 400,
          fill: isBase ? c.stateInk : wasTaken ? c.textMuted : c.text,
        });
        if (isBase) {
          handles.baseNode = node;
          handles.baseLetter = letter;
        }
      }

      // 표시
      scene.commits.forEach((cm, i) => {
        const have = scene.marks[i];
        if (have === undefined) throw new Error(`where-they-parted stage: 표시 줄이 모자란다 (${cm.id})`);
        for (const name of have) {
          const slot = scene.names.findIndex((n) => n.name === name);
          const m = markAt(layout, cm.id, slot);
          const e = el('rect', {
            x: r2(m.x - MARK / 2),
            y: r2(m.y - MARK / 2),
            width: MARK,
            height: MARK,
            rx: 2,
            fill: markColor(scene, name),
            stroke: c.bg,
            'stroke-width': 1.5,
          });
          handles.marks.set(`${cm.id}\u0000${name}`, e);
        }
      });

      // 꺼낼 줄 — 시각이 늦은 차례
      const lineLabel = t('label.inLine', 'In line');
      label(PAD_L - 16, LINE_Y + 1, lineLabel, { fill: c.textMuted, 'dominant-baseline': 'central' });
      const chipX0 = PAD_L - 16 + Math.max(72, lineLabel.length * smPx * 0.7 + 14);
      scene.queue.forEach((id, i) => {
        const x = chipX0 + i * 32;
        el('rect', {
          x: r2(x),
          y: LINE_Y - 11,
          width: 26,
          height: 22,
          rx: 4,
          fill: c.bg,
          stroke: i === 0 ? c.primary : c.border,
          'stroke-width': i === 0 ? 2 : 1,
        });
        label(x + 13, LINE_Y + 1, id, {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        });
      });

      return handles;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
      });
    }

    async function run(ms: number, frame: (u: number) => void, alive: () => boolean): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (!alive()) return;
        const u = Math.min(1, (Date.now() - start) / ms);
        frame(u);
        if (u >= 1) return;
        await wait(16);
      }
    }

    async function render(next: WhereTheyPartedScene, prev: WhereTheyPartedScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      const step = next.step;
      if (!opts.animate || prev === null || step.kind === 'start') return;
      const alive = (): boolean => mine === gen && !destroyed;
      const layout = layoutOf(next);

      const toX = layout.xOf(timeOf(next, step.commit));
      const fromX =
        step.from === null ? r2(layout.xOf(layout.tMax) + (PAD_R - 40)) : layout.xOf(timeOf(next, step.from));

      // 움직일 표시: 부모가 이번에 새로 받은 것 — 꺼낸 커밋의 자리에서 출발
      const moving: { e: SVGRectElement; a: Pt; b: Pt }[] = [];
      if (step.kind === 'take') {
        for (const g of step.given) {
          for (const name of g.added) {
            const e = h.marks.get(`${g.parent}\u0000${name}`);
            if (e === undefined) throw new Error(`where-they-parted stage: 받은 표시가 그려지지 않았다 (${g.parent} ${name})`);
            const slot = next.names.findIndex((n) => n.name === name);
            moving.push({ e, a: markAt(layout, step.commit, slot), b: markAt(layout, g.parent, slot) });
          }
        }
      }

      const frame = (u: number): void => {
        const k = part(u, 0, 0.35);
        const x = r2(fromX + (toX - fromX) * k);
        if (h.cursor !== null) {
          h.cursor.setAttribute('x1', String(x));
          h.cursor.setAttribute('x2', String(x));
        }
        const m = part(u, 0.3, 1);
        for (const mv of moving) {
          mv.e.setAttribute('x', String(r2(mv.a.x + (mv.b.x - mv.a.x) * m - MARK / 2)));
          mv.e.setAttribute('y', String(r2(mv.a.y + (mv.b.y - mv.a.y) * m - MARK / 2)));
        }
        if (step.kind === 'found') {
          const arrived = u >= 0.35;
          if (h.baseNode !== null) h.baseNode.setAttribute('fill', arrived ? c.accent : c.bg);
          if (h.baseLetter !== null) h.baseLetter.setAttribute('fill', arrived ? c.stateInk : c.text);
          const g = part(u, 0.35, 1);
          for (const p of h.paths) {
            p.el.setAttribute('points', pointsAttr(partialPoints(p.pts, g === 0 ? 0.0001 : g)));
          }
        }
      };

      await run(MOVE_MS, frame, alive);
      if (!alive()) return;
      drawStatic(next);
    }

    const renderer: SceneRenderer<WhereTheyPartedScene> = {
      render,
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
    return renderer;
  },
};
