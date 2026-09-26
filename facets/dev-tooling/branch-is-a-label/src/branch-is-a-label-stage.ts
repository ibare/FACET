/**
 * branch-is-a-label 의 그림.
 *
 * 커밋은 점, 화살은 새 커밋 → 부모. 이름은 커밋 위(또는 아래)에 막대로 꽂힌 이름표이고 HEAD 는 이름표 하나를 가리키는
 * 작은 표다. 움직이는 것은 이름표다 — 이름을 만들면 지금 커밋에서 이름표가 하나 솟아 붙고, 커밋을 하면 새 커밋이 부모에서
 * 밀려 나온 뒤 HEAD 가 가리키는 이름표 하나만 떼어져 새 커밋으로 건너가 붙는다.
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
} from '@ffacet/core/runtime';
import { finalState, parseHistoryData } from './algorithm.js';
import type { BranchScene } from './scene.js';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 크기 상한 — 실제 값은 캔버스에서 역산한다. */
const NODE_R_MAX = 18;
const TAG_H = 22;
const TAG_GAP = 6;
const STEM = 10;
const CAPTION_BAND = 48;
const HEAD_GAP = 14;

const CREATE_MS = 600;
const HEAD_MS = 500;
const COMMIT_MS = 1000;
/** 커밋 걸음에서 새 커밋이 밀려 나오는 몫. 나머지가 이름표가 건너가는 몫이다. */
const COMMIT_SPLIT = 0.4;

type Pt = { x: number; y: number };
type Layout = {
  nodeR: number;
  pos: Map<string, Pt>;
  /** 이름표가 커밋 위(-1) 아래(+1) 어디로 쌓이는가. */
  side: Map<string, number>;
  nameColor: Map<string, { fill: string; stroke: string }>;
};
type TagPlace = { name: string; commit: string; x: number; y: number; w: number };

function round(v: number): number {
  return Math.round(v * 10) / 10 || 0;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

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

/** 끝 이력에서 자리를 셈한다. 첫 자식은 부모의 줄에, 뒤 자식은 새 줄에 선다 — 앞 커밋의 자리는 늘 그대로다. */
function makeLayout(initialData: unknown): Layout {
  const data = parseHistoryData(initialData);
  const fin = finalState(data);
  const col = new Map<string, number>();
  const lane = new Map<string, number>();
  const hasChild = new Set<string>();
  let lanes = 0;
  for (const c of fin.commits) {
    if (c.parent === null) {
      col.set(c.id, 0);
      lane.set(c.id, lanes);
      lanes += 1;
      continue;
    }
    const pc = col.get(c.parent);
    const pl = lane.get(c.parent);
    if (pc === undefined || pl === undefined) throw new Error(`branch-is-a-label 그림: 커밋 ${c.id} 의 부모 ${c.parent} 자리가 없다`);
    col.set(c.id, pc + 1);
    if (hasChild.has(c.parent)) {
      lane.set(c.id, lanes);
      lanes += 1;
    } else {
      lane.set(c.id, pl);
      hasChild.add(c.parent);
    }
  }
  const cols = Math.max(...col.values()) + 1;
  const stack = fin.names.length;
  const tagBand = STEM + stack * (TAG_H + TAG_GAP);
  const left = 44;
  const right = 130;
  const colStep = cols > 1 ? (PIECE_CANVAS_W - left - right) / (cols - 1) : 0;
  const nodeR = Math.min(NODE_R_MAX, colStep > 0 ? colStep / 5 : NODE_R_MAX);
  const yTop = CAPTION_BAND + tagBand + nodeR;
  const yBottom = lanes > 1 ? H - 10 - tagBand - nodeR : yTop;
  const pos = new Map<string, Pt>();
  const side = new Map<string, number>();
  for (const c of fin.commits) {
    const k = col.get(c.id);
    const l = lane.get(c.id);
    if (k === undefined || l === undefined) throw new Error(`branch-is-a-label 그림: 커밋 ${c.id} 줄 · 칸이 없다`);
    const y = lanes > 1 ? yTop + ((yBottom - yTop) * l) / (lanes - 1) : yTop;
    pos.set(c.id, { x: left + k * colStep, y });
    side.set(c.id, l === 0 ? -1 : 1);
  }
  const fills = categorical(fin.names.length, 'pastel');
  const strokes = categorical(fin.names.length, 'vivid');
  const nameColor = new Map<string, { fill: string; stroke: string }>();
  fin.names.forEach((n, i) => {
    const fill = fills[i];
    const stroke = strokes[i];
    if (fill === undefined || stroke === undefined) throw new Error('branch-is-a-label 그림: 이름 색이 모자란다');
    nameColor.set(n.name, { fill, stroke });
  });
  return { nodeR, pos, side, nameColor };
}

const MONO_PX = parseFloat(fontSizes.sm);

function tagWidth(text: string): number {
  return text.length * MONO_PX * 0.62 + 16;
}

/** 이름표마다 자리. 한 커밋의 이름표는 이름을 만든 차례로 커밋에서 멀어지며 쌓인다. */
function placeTags(layout: Layout, names: { name: string; commit: string }[]): Map<string, TagPlace> {
  const count = new Map<string, number>();
  const out = new Map<string, TagPlace>();
  for (const n of names) {
    const p = layout.pos.get(n.commit);
    const s = layout.side.get(n.commit);
    if (p === undefined || s === undefined) throw new Error(`branch-is-a-label 그림: 이름 ${n.name} 의 커밋 ${n.commit} 자리가 없다`);
    const k = count.get(n.commit) ?? 0;
    count.set(n.commit, k + 1);
    const y = p.y + s * (layout.nodeR + STEM + TAG_H / 2 + k * (TAG_H + TAG_GAP));
    out.set(n.name, { name: n.name, commit: n.commit, x: p.x, y, w: tagWidth(n.name) });
  }
  return out;
}

const HEAD_TEXT = 'HEAD';

function headPlace(tags: Map<string, TagPlace>, head: string): Pt {
  const tag = tags.get(head);
  if (tag === undefined) throw new Error(`branch-is-a-label 그림: HEAD 가 가리키는 이름 ${head} 이 없다`);
  return { x: tag.x + tag.w / 2 + HEAD_GAP + tagWidth(HEAD_TEXT) / 2, y: tag.y };
}

function caption(t: Translate, scene: BranchScene): string {
  const step = scene.step;
  if (step === null) {
    const n = scene.names.find((x) => x.name === scene.head);
    if (n === undefined) throw new Error(`branch-is-a-label 그림: HEAD 가 가리키는 이름 ${scene.head} 이 없다`);
    return t('caption.start', 'Start: {name} → {commit}, HEAD → {name}', { name: n.name, commit: n.commit });
  }
  if (step.kind === 'name-create') {
    return t('caption.nameCreate', 'New name {name} → {commit}', { name: step.name, commit: step.commit });
  }
  if (step.kind === 'head-move') {
    return t('caption.headMove', 'HEAD: {from} → {to}', { from: step.from, to: step.to });
  }
  return t('caption.commit', 'New commit {commit}, parent {parent} · {name}: {from} → {commit}', {
    commit: step.commit,
    parent: step.parent,
    name: step.name,
    from: step.from,
  });
}

export const branchIsALabelStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const layout = params.initialData === undefined ? null : makeLayout(params.initialData);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    type Drawn = {
      nodes: Map<string, SVGGElement>;
      edges: Map<string, { line: SVGLineElement; head: SVGPolygonElement }>;
      tags: Map<string, SVGGElement>;
      head: SVGGElement | null;
    };

    function drawEdge(line: SVGLineElement, arrow: SVGPolygonElement, from: Pt, to: Pt, r: number): void {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < 2 * r + 8) {
        line.setAttribute('visibility', 'hidden');
        arrow.setAttribute('visibility', 'hidden');
        return;
      }
      line.removeAttribute('visibility');
      arrow.removeAttribute('visibility');
      const ux = dx / len;
      const uy = dy / len;
      const sx = from.x + ux * r;
      const sy = from.y + uy * r;
      const ex = to.x - ux * (r + 1);
      const ey = to.y - uy * (r + 1);
      const a = 8;
      const w = 4.5;
      line.setAttribute('x1', String(round(sx)));
      line.setAttribute('y1', String(round(sy)));
      line.setAttribute('x2', String(round(ex - ux * a)));
      line.setAttribute('y2', String(round(ey - uy * a)));
      const bx = ex - ux * a;
      const by = ey - uy * a;
      arrow.setAttribute(
        'points',
        [
          `${round(ex)},${round(ey)}`,
          `${round(bx - uy * w)},${round(by + ux * w)}`,
          `${round(bx + uy * w)},${round(by - ux * w)}`,
        ].join(' '),
      );
    }

    function drawStatic(scene: BranchScene): Drawn {
      if (layout === null) throw new Error('branch-is-a-label 그림: initialData 없이 장면을 그릴 수 없다');
      svg.textContent = '';
      const drawn: Drawn = { nodes: new Map(), edges: new Map(), tags: new Map(), head: null };
      const r = layout.nodeR;

      const cap = el('text', { x: 20, y: 26, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md }, svg);
      cap.textContent = caption(t, scene);
      const count = el(
        'text',
        { x: PIECE_CANVAS_W - 20, y: 26, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'text-anchor': 'end' },
        svg,
      );
      count.textContent = t('label.commits', 'Commits: {n}', { n: scene.commits.length });

      const edgeLayer = el('g', {}, svg);
      const nodeLayer = el('g', {}, svg);
      const tagLayer = el('g', {}, svg);

      for (const cm of scene.commits) {
        const p = layout.pos.get(cm.id);
        if (p === undefined) throw new Error(`branch-is-a-label 그림: 커밋 ${cm.id} 자리가 없다`);
        if (cm.parent !== null) {
          const pp = layout.pos.get(cm.parent);
          if (pp === undefined) throw new Error(`branch-is-a-label 그림: 부모 ${cm.parent} 자리가 없다`);
          const line = el('line', { stroke: c.textMuted, 'stroke-width': 1.5 }, edgeLayer);
          const head = el('polygon', { fill: c.textMuted }, edgeLayer);
          drawEdge(line, head, p, pp, r);
          drawn.edges.set(cm.id, { line, head });
        }
        const g = el('g', {}, nodeLayer);
        el('circle', { cx: p.x, cy: p.y, r, fill: c.bg, stroke: c.text, 'stroke-width': 1.5 }, g);
        const label = el(
          'text',
          {
            x: p.x,
            y: p.y,
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
          },
          g,
        );
        label.textContent = cm.id;
        drawn.nodes.set(cm.id, g);
      }

      const tags = placeTags(layout, scene.names);
      const distance = (tag: TagPlace): number => {
        const p = layout.pos.get(tag.commit);
        if (p === undefined) throw new Error(`branch-is-a-label 그림: 커밋 ${tag.commit} 자리가 없다`);
        return Math.abs(tag.y - p.y);
      };
      // 먼 이름표부터 그려 가까운 이름표가 막대를 덮게 한다
      const ordered = [...tags.values()].sort((a, b) => distance(b) - distance(a));
      for (const tag of ordered) {
        const p = layout.pos.get(tag.commit);
        const s = layout.side.get(tag.commit);
        const color = layout.nameColor.get(tag.name);
        if (p === undefined || s === undefined || color === undefined) {
          throw new Error(`branch-is-a-label 그림: 이름표 ${tag.name} 을 놓을 자리 · 색이 없다`);
        }
        const g = el('g', {}, tagLayer);
        el('line', { x1: tag.x, y1: p.y + s * r, x2: tag.x, y2: tag.y - (s * TAG_H) / 2, stroke: color.stroke, 'stroke-width': 2 }, g);
        el('rect', { x: tag.x - tag.w / 2, y: tag.y - TAG_H / 2, width: tag.w, height: TAG_H, rx: 4, fill: color.fill, stroke: color.stroke, 'stroke-width': 1.5 }, g);
        const txt = el(
          'text',
          { x: tag.x, y: tag.y, fill: c.stateInk, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'text-anchor': 'middle', 'dominant-baseline': 'central' },
          g,
        );
        txt.textContent = tag.name;
        drawn.tags.set(tag.name, g);
      }

      const hp = headPlace(tags, scene.head);
      const pointed = tags.get(scene.head);
      if (pointed !== undefined) {
        const hw = tagWidth(HEAD_TEXT);
        const g = el('g', {}, tagLayer);
        const tipX = pointed.x + pointed.w / 2 + 1;
        el('line', { x1: hp.x - hw / 2, y1: hp.y, x2: tipX + 6, y2: hp.y, stroke: c.text, 'stroke-width': 1.5 }, g);
        el('polygon', { points: `${round(tipX)},${round(hp.y)} ${round(tipX + 7)},${round(hp.y - 4)} ${round(tipX + 7)},${round(hp.y + 4)}`, fill: c.text }, g);
        el('rect', { x: hp.x - hw / 2, y: hp.y - TAG_H / 2, width: hw, height: TAG_H, rx: 4, fill: c.accent }, g);
        const txt = el(
          'text',
          { x: hp.x, y: hp.y, fill: c.stateInk, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central' },
          g,
        );
        txt.textContent = HEAD_TEXT;
        drawn.head = g;
      }
      return drawn;
    }

    function wait(frames: number, frame: (p: number) => void, mine: number): Promise<void> {
      return new Promise((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let i = 0;
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          i += 1;
          frame(Math.min(1, i / frames));
          if (i >= frames) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, 16);
        timers.add(id);
      });
    }

    function shift(g: SVGGElement, dx: number, dy: number, scale = 1, about: Pt | null = null): void {
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && scale === 1) {
        g.removeAttribute('transform');
        return;
      }
      const base = `translate(${round(dx)} ${round(dy)})`;
      if (scale === 1 || about === null) {
        g.setAttribute('transform', base);
        return;
      }
      const s = Math.round(scale * 1000) / 1000;
      g.setAttribute('transform', `${base} translate(${round(about.x)} ${round(about.y)}) scale(${s}) translate(${round(-about.x)} ${round(-about.y)})`);
    }

    async function animate(scene: BranchScene, drawn: Drawn, mine: number): Promise<void> {
      if (layout === null) return;
      const step = scene.step;
      if (step === null) return;
      const lay = layout;
      const post = placeTags(lay, scene.names);
      const postHead = headPlace(post, scene.head);

      if (step.kind === 'name-create') {
        // 새 이름표는 지금 커밋에서 솟아 제 자리로 붙는다
        const g = drawn.tags.get(step.name);
        const tag = post.get(step.name);
        const origin = lay.pos.get(step.commit);
        if (g === undefined || tag === undefined || origin === undefined) throw new Error(`branch-is-a-label 그림: 새 이름표 ${step.name} 이 없다`);
        const frames = Math.round(CREATE_MS / 16);
        await wait(
          frames,
          (p) => {
            const e = ease(p);
            shift(g, (origin.x - tag.x) * (1 - e), (origin.y - tag.y) * (1 - e), 0.3 + 0.7 * e, { x: tag.x, y: tag.y });
          },
          mine,
        );
        return;
      }

      if (step.kind === 'head-move') {
        // HEAD 표만 한 이름표에서 다른 이름표로 건너간다 — 이름표는 하나도 움직이지 않는다
        const pre = headPlace(post, step.from);
        const g = drawn.head;
        if (g === null) throw new Error('branch-is-a-label 그림: HEAD 표가 없다');
        const frames = Math.round(HEAD_MS / 16);
        await wait(
          frames,
          (p) => {
            const e = ease(p);
            shift(g, (pre.x - postHead.x) * (1 - e), (pre.y - postHead.y) * (1 - e));
          },
          mine,
        );
        return;
      }

      // 커밋: 새 커밋이 부모에서 밀려 나오고, 이어 HEAD 가 가리키는 이름표 하나가 떼어져 새 커밋으로 건너간다
      const preNames = scene.names.map((n) => (n.name === step.name ? { name: n.name, commit: step.from } : n));
      const pre = placeTags(lay, preNames);
      const preHead = headPlace(pre, scene.head);
      const nodeG = drawn.nodes.get(step.commit);
      const edge = drawn.edges.get(step.commit);
      const at = lay.pos.get(step.commit);
      const from = lay.pos.get(step.parent);
      if (nodeG === undefined || edge === undefined || at === undefined || from === undefined) {
        throw new Error(`branch-is-a-label 그림: 새 커밋 ${step.commit} 을 그릴 자리가 없다`);
      }
      const side = lay.side.get(step.from);
      if (side === undefined) throw new Error(`branch-is-a-label 그림: 커밋 ${step.from} 자리가 없다`);
      const frames = Math.round(COMMIT_MS / 16);
      await wait(
        frames,
        (p) => {
          const a = ease(Math.min(1, p / COMMIT_SPLIT));
          const b = ease(Math.max(0, (p - COMMIT_SPLIT) / (1 - COMMIT_SPLIT)));
          const nx = from.x + (at.x - from.x) * a;
          const ny = from.y + (at.y - from.y) * a;
          shift(nodeG, nx - at.x, ny - at.y);
          drawEdge(edge.line, edge.head, { x: nx, y: ny }, from, lay.nodeR);
          const lift = Math.sin(Math.PI * b) * 22 * side;
          for (const [name, g] of drawn.tags) {
            const q = post.get(name);
            const o = pre.get(name);
            if (q === undefined || o === undefined) {
              throw new Error(`branch-is-a-label 그림: 이름표 ${name} 의 앞 · 뒤 자리가 없다`);
            }
            const up = name === step.name ? lift : 0;
            shift(g, (o.x - q.x) * (1 - b), (o.y - q.y) * (1 - b) + up);
          }
          if (drawn.head !== null) {
            const up = scene.head === step.name ? lift : 0;
            shift(drawn.head, (preHead.x - postHead.x) * (1 - b), (preHead.y - postHead.y) * (1 - b) + up);
          }
        },
        mine,
      );
    }

    return {
      async render(next: BranchScene, _prev: BranchScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const drawn = drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await animate(next, drawn, mine);
        if (destroyed || mine !== gen) return;
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
