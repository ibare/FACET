/**
 * shortest-path-tree 무대 — 위에는 모두가 쥔 같은 지도와 그 사본들, 아래에는 뿌리마다 선 나무.
 *
 * 나무는 **뿌리를 땅에 두고 선다.** 라우터의 높이는 뿌리에서의 거리라서, 나무의 선 하나가
 * 오르는 높이가 곧 그 선의 비용이다. 뿌리를 옮기면 앞 나무의 모양에서 출발한 사본이 옆 자리로
 * 건너가며 새 뿌리 위에 다시 선다 — 라우터들이 새 높이로 옮겨 가고, 한 선은 빠지고 한 선이 든다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette } from '@ffacet/core/runtime';
import type { SptTree } from './algorithm.js';
import type { ShortestPathTreeScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 470;
const MOTION_MS = 800;
const FRAME_MS = 16;

/** 둘레 여백 · 윗띠(지도) · 아랫띠(나무) 의 세로 자리 */
const PAD = 20;
const CAPTION_Y = 26;
const BAND_LABEL_Y = 54;
const MAP_CY = 128;
const TREE_TOP = 236;
const TREE_BASE = 424;
const SLOT_LABEL_Y = 452;
const NODE_R_MAX = 13;
const UNIT_MAX = 28;

type Pt = { x: number; y: number };

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function lerpPt(a: Pt, b: Pt, p: number): Pt {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
}

function key(x: string, y: string): string {
  return x < y ? `${x}-${y}` : `${y}-${x}`;
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    e.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  }
  parent.appendChild(e);
  return e;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  opts: { fill: string; size: string; anchor?: string; weight?: string; mono?: boolean },
): void {
  const e = el(
    'text',
    {
      x,
      y,
      fill: opts.fill,
      'font-size': opts.size,
      'font-family': opts.mono ? fonts.mono : fonts.body,
      'text-anchor': opts.anchor ?? 'middle',
      'dominant-baseline': 'central',
    },
    parent,
  );
  if (opts.weight) e.setAttribute('font-weight', opts.weight);
  e.textContent = text;
}

/** 지도의 라우터 자리 — 이름 차례로 둘레에 고르게 (첫 라우터가 맨 위). */
function ringPos(routers: readonly string[], cx: number, cy: number, r: number): Record<string, Pt> {
  const out: Record<string, Pt> = {};
  const n = routers.length;
  routers.forEach((name, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
    out[name] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  return out;
}

/** 나무의 자리 — 뿌리는 땅, 높이는 거리. 가로는 잎을 고르게 벌리고 가지는 제 잎들의 가운데. */
function treeLayout(
  tree: SptTree,
  left: number,
  right: number,
  unit: number,
): Record<string, Pt> {
  const kids: Record<string, string[]> = {};
  for (const [v, p] of Object.entries(tree.parent)) {
    if (p === null) continue;
    (kids[p] ??= []).push(v);
  }
  for (const list of Object.values(kids)) list.sort();
  const leaves: string[] = [];
  const order = (v: string): void => {
    const ks = kids[v] ?? [];
    if (ks.length === 0) leaves.push(v);
    for (const k of ks) order(k);
  };
  order(tree.root);
  const span = right - left;
  const xOf: Record<string, number> = {};
  leaves.forEach((v, i) => {
    xOf[v] = left + (span * (i + 0.5)) / leaves.length;
  });
  const place = (v: string): number => {
    const ks = kids[v] ?? [];
    if (ks.length === 0) {
      const x = xOf[v];
      if (x === undefined) throw new Error(`shortest-path-tree stage: 잎 ${v} 의 자리가 없다`);
      return x;
    }
    const xs = ks.map(place);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    xOf[v] = x;
    return x;
  };
  place(tree.root);
  const out: Record<string, Pt> = {};
  for (const [v, d] of Object.entries(tree.dist)) {
    const x = xOf[v];
    if (x === undefined) throw new Error(`shortest-path-tree stage: ${v} 가 나무에 매달리지 않았다`);
    out[v] = { x, y: TREE_BASE - d * unit };
  }
  return out;
}

function treeEdges(tree: SptTree): [string, string][] {
  const out: [string, string][] = [];
  for (const [v, p] of Object.entries(tree.parent)) if (p !== null) out.push([p, v]);
  return out;
}

export const shortestPathTreeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const tone = categorical(2, 'vivid');
    const treeColor = (i: number): string => tone[i % tone.length] ?? c.text;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const W = PIECE_CANVAS_W;
    const half = W / 2;
    const slots: [number, number][] = [
      [PAD, half - PAD / 2],
      [half + PAD / 2, W - PAD],
    ];
    const mapR = Math.min(64, (half - PAD * 2) / 2.4);
    const mapCx = PAD + mapR + 56;
    const copyLeft = mapCx + mapR + 70;
    const copySlot = (W - PAD - copyLeft) / 5;
    const copyR = Math.min(22, copySlot / 3);

    function nodeR(n: number): number {
      return Math.min(NODE_R_MAX, (half - PAD * 2) / Math.max(n, 1) / 4);
    }

    function captionFor(s: ShortestPathTreeScene): string {
      const step = s.step;
      const nLinks = s.links.length;
      if (step.kind === 'share') {
        return t('caption.share', 'Every router holds the same map. Copies: {n}', { n: step.count });
      }
      if (step.kind === 'tree') {
        const tree = s.trees[s.trees.length - 1];
        const k = tree ? treeEdges(tree).length : 0;
        if (step.from === null) {
          return t('caption.tree', 'Root {root}: the cheapest path to every router. Tree links: {k} of {l}', {
            root: step.root,
            k,
            l: nLinks,
          });
        }
        return t('caption.reroot', 'Root {from} → {root}. Same map, tree links: {k} of {l}', {
          from: step.from,
          root: step.root,
          k,
          l: nLinks,
        });
      }
      if (step.kind === 'diff' && s.diff) {
        const list = (xs: string[]): string => (xs.length ? xs.map((x) => x.replace('-', '–')).join(', ') : '—');
        return t('caption.diff', 'Only in tree {a}: {ea} · only in tree {b}: {eb} · in neither: {none}', {
          a: s.diff.first,
          ea: list(s.diff.onlyFirst),
          b: s.diff.second,
          eb: list(s.diff.onlySecond),
          none: list(s.diff.neither),
        });
      }
      return t('caption.map', 'Routers: {r} · Links: {l}', { r: s.routers.length, l: nLinks });
    }

    /** 장면 하나를 통째로 세운다. p 는 이번 걸음 운동의 진행(1 이면 정적 화면). */
    function draw(s: ShortestPathTreeScene, pRaw: number): void {
      svg.textContent = '';
      const p = ease(Math.max(0, Math.min(1, pRaw)));
      const step = s.step;
      const nr = nodeR(s.routers.length);
      const root = el('g', {}, svg);

      label(root, W / 2, CAPTION_Y, captionFor(s), { fill: c.text, size: fontSizes.md, weight: '600' });

      // ── 지도: 모두가 쥔 같은 것 ──
      const mapPos = ringPos(s.routers, mapCx, MAP_CY, mapR);
      label(root, PAD, BAND_LABEL_Y, t('label.map', 'Map'), {
        fill: c.textMuted,
        size: fontSizes.sm,
        anchor: 'start',
      });

      const lastIdx = s.trees.length - 1;
      const lastTree = s.trees[lastIdx];
      const lastSet = new Set(lastTree ? treeEdges(lastTree).map(([a, b]) => key(a, b)) : []);
      const diff = s.diff;
      const diffP = step.kind === 'diff' ? p : 1;
      for (const l of s.links) {
        const a = mapPos[l.a];
        const b = mapPos[l.b];
        if (!a || !b) continue;
        const k = key(l.a, l.b);
        let stroke = c.textMuted;
        let width = 1.5;
        let dash = '';
        if (diff) {
          if (diff.onlyFirst.includes(k)) {
            stroke = treeColor(0);
            width = lerp(1.5, 4, diffP);
          } else if (diff.onlySecond.includes(k)) {
            stroke = treeColor(1);
            width = lerp(1.5, 4, diffP);
          } else if (diff.neither.includes(k)) {
            stroke = c.textMuted;
            dash = '4 4';
          } else {
            stroke = c.text;
            width = 2;
          }
        } else if (lastTree && lastSet.has(k)) {
          stroke = treeColor(lastIdx);
          width = 3;
        }
        const line = el(
          'line',
          { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke, 'stroke-width': width, 'stroke-linecap': 'round' },
          root,
        );
        if (dash) line.setAttribute('stroke-dasharray', dash);
        // 비용 — 선 가운데에서 지도 한가운데의 반대쪽으로 비켜 적는다
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = mx - mapCx;
        const dy = my - MAP_CY;
        const len = Math.hypot(dx, dy) || 1;
        label(root, mx + (dx / len) * 11, my + (dy / len) * 11, String(l.cost), {
          fill: c.textMuted,
          size: fontSizes.sm,
          mono: true,
        });
      }
      for (const name of s.routers) {
        const q = mapPos[name];
        if (!q) continue;
        el('circle', { cx: q.x, cy: q.y, r: nr, fill: c.bg, stroke: c.text, 'stroke-width': 1.5 }, root);
        label(root, q.x, q.y, name, { fill: c.text, size: fontSizes.sm, weight: '600', mono: true });
      }

      // ── 사본: 라우터마다 한 벌 ──
      if (s.shared > 0) {
        const shareP = step.kind === 'share' ? p : 1;
        label(root, copyLeft, BAND_LABEL_Y, t('label.copies', 'Copy held by each router'), {
          fill: c.textMuted,
          size: fontSizes.sm,
          anchor: 'start',
        });
        const unitRing = ringPos(s.routers, 0, 0, mapR);
        s.routers.forEach((holder, i) => {
          const cx = copyLeft + copySlot * (i + 0.5);
          const rootIdx = s.trees.findIndex((tr) => tr.root === holder);
          if (rootIdx >= 0) {
            const grow = rootIdx === lastIdx && step.kind === 'tree' ? p : 1;
            el(
              'rect',
              {
                x: cx - copySlot / 2 + 3,
                y: MAP_CY - copyR - 14,
                width: copySlot - 6,
                height: copyR * 2 + 50,
                rx: 6,
                fill: 'none',
                stroke: treeColor(rootIdx),
                'stroke-width': lerp(0, 2.5, grow),
              },
              root,
            );
          }
          // 사본은 지도 자리에서 제 크기로 떠나 제 칸에서 줄어든 채 선다
          const x = lerp(mapCx, cx, shareP);
          const y = MAP_CY;
          const sc = lerp(1, copyR / mapR, shareP);
          const g = el('g', { transform: `translate(${round(x)} ${round(y)}) scale(${round(sc * 1000) / 1000})` }, root);
          for (const l of s.links) {
            const a = unitRing[l.a];
            const b = unitRing[l.b];
            if (!a || !b) continue;
            el(
              'line',
              { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: c.textMuted, 'stroke-width': 1.5 / sc },
              g,
            );
          }
          for (const name of s.routers) {
            const q = unitRing[name];
            if (!q) continue;
            el('circle', { cx: q.x, cy: q.y, r: 3 / sc, fill: c.text }, g);
          }
          label(root, cx, MAP_CY + copyR + 20, holder, {
            fill: c.text,
            size: fontSizes.sm,
            weight: '600',
            mono: true,
          });
        });
      }

      // ── 나무: 뿌리를 땅에 두고 선다 ──
      const unit = s.reach > 0 ? Math.min(UNIT_MAX, (TREE_BASE - TREE_TOP) / s.reach) : UNIT_MAX;
      const layouts = s.trees.map((tr, i) => {
        const slot = slots[i] ?? slots[slots.length - 1];
        if (!slot) throw new Error('shortest-path-tree stage: 나무 자리가 없다');
        return treeLayout(tr, slot[0] + nr * 2, slot[1] - nr * 2, unit);
      });

      s.trees.forEach((tree, i) => {
        const slot = slots[i] ?? slots[slots.length - 1];
        const lay = layouts[i];
        if (!slot || !lay) return;
        const moving = step.kind === 'tree' && i === lastIdx;
        const color = treeColor(i);
        const here = p;

        // 이 나무가 이번 걸음에 선다면, 출발 자리를 셈한다
        let from: Record<string, Pt> | null = null;
        let fromTree: SptTree | null = null;
        if (moving) {
          const prevIdx = i - 1;
          const prevLay = prevIdx >= 0 ? layouts[prevIdx] : undefined;
          const prevTree = prevIdx >= 0 ? s.trees[prevIdx] : undefined;
          if (prevLay && prevTree) {
            from = prevLay;
            fromTree = prevTree;
          } else {
            const base = lay[tree.root];
            if (base) {
              from = {};
              for (const v of Object.keys(lay)) from[v] = base;
            }
          }
        }
        const pos = (v: string): Pt | undefined => {
          const end = lay[v];
          if (!end) return undefined;
          if (!from) return end;
          const start = from[v] ?? end;
          return lerpPt(start, end, here);
        };

        // 땅 — 새 자리로 건너가는 동안 따라 나타난다
        const groundA = moving && fromTree ? here : 1;
        el(
          'line',
          {
            x1: slot[0],
            y1: TREE_BASE + nr + 2,
            x2: slot[1],
            y2: TREE_BASE + nr + 2,
            stroke: c.border,
            'stroke-width': 1.5,
            opacity: groundA,
          },
          root,
        );
        label(root, (slot[0] + slot[1]) / 2, SLOT_LABEL_Y, t('label.root', 'Root {r}', { r: tree.root }), {
          fill: color,
          size: fontSizes.sm,
          weight: '600',
        });

        // 빠지는 선 — 앞 나무에 있었고 이 나무에는 없는 선이 건너가며 사그라진다
        const mine = new Set(treeEdges(tree).map(([a, b]) => key(a, b)));
        if (moving && fromTree) {
          const fade = Math.max(0, 1 - here * 2);
          for (const [a, b] of treeEdges(fromTree)) {
            if (mine.has(key(a, b)) || fade <= 0) continue;
            const pa = pos(a);
            const pb = pos(b);
            if (!pa || !pb) continue;
            el(
              'line',
              { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: c.textMuted, 'stroke-width': 2, opacity: fade },
              root,
            );
          }
        }

        const before = fromTree ? new Set(treeEdges(fromTree).map(([a, b]) => key(a, b))) : null;
        for (const [par, kid] of treeEdges(tree)) {
          const pa = pos(par);
          const pk = pos(kid);
          if (!pa || !pk) continue;
          const k = key(par, kid);
          // 드는 선 — 부모에서 자식 쪽으로 뻗어 나온다 (걸음 뒤쪽 절반)
          const entering = moving && before !== null && !before.has(k);
          const reach = entering ? Math.max(0, here * 2 - 1) : 1;
          if (reach <= 0) continue;
          const tip = lerpPt(pa, pk, reach);
          let stroke = c.text;
          let width = 2;
          if (diff) {
            const only = i === 0 ? diff.onlyFirst : diff.onlySecond;
            if (only.includes(k)) {
              stroke = color;
              width = lerp(2, 5, diffP);
            }
          }
          el(
            'line',
            { x1: pa.x, y1: pa.y, x2: tip.x, y2: tip.y, stroke, 'stroke-width': width, 'stroke-linecap': 'round' },
            root,
          );
        }

        for (const v of Object.keys(lay).sort()) {
          const q = pos(v);
          if (!q) continue;
          const isRoot = v === tree.root;
          el(
            'circle',
            {
              cx: q.x,
              cy: q.y,
              r: nr,
              fill: isRoot ? color : c.bg,
              stroke: isRoot ? color : c.text,
              'stroke-width': 1.5,
            },
            root,
          );
          label(root, q.x, q.y, v, {
            fill: isRoot ? c.stateInk : c.text,
            size: fontSizes.sm,
            weight: '600',
            mono: true,
          });
          const d = tree.dist[v];
          if (d !== undefined && !isRoot) {
            label(root, q.x + nr + 4, q.y, String(d), {
              fill: c.textMuted,
              size: fontSizes.xs,
              anchor: 'start',
              mono: true,
            });
          }
        }
      });
    }

    function drawStatic(s: ShortestPathTreeScene): void {
      draw(s, 1);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function animate(s: ShortestPathTreeScene, mineGen: number): Promise<void> {
      const frames = Math.max(1, Math.round(MOTION_MS / FRAME_MS));
      for (let f = 1; f <= frames; f += 1) {
        if (mineGen !== gen || destroyed) return;
        await wait(FRAME_MS);
        if (mineGen !== gen || destroyed) return;
        draw(s, f / frames);
      }
    }

    return {
      async render(
        next: ShortestPathTreeScene,
        _prev: ShortestPathTreeScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mineGen = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step.kind === 'map') {
          drawStatic(next);
          return;
        }
        draw(next, 0);
        await animate(next, mineGen);
        if (mineGen !== gen || destroyed) return;
        drawStatic(next);
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
