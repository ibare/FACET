/**
 * path-resolution 무대 — 이름을 따라 한 층씩 내려간다.
 *
 * 위에 경로가 마디로 떨어져 놓이고, 그 아래로 디렉터리 목록이 한 층에 하나씩 계단처럼 오른쪽 아래로
 * 내려간다. 걸음마다
 *   1. 마디 하나가 경로에서 떨어져 지금 디렉터리의 목록 맨 위로 내려오고
 *   2. 목록을 적힌 차례로 한 칸씩 내려가며 이름을 견준다 (다르면 ≠ 와 줄긋기, 같으면 =)
 *   3. 같은 이름 옆의 inode 번호가 아래층으로 떨어져 다음 목록의 머리가 된다
 * 번호의 세로줄은 층마다 맞춰 두어, 번호가 곧장 아래로 떨어지면 다음 층 머리의 번호 자리에 닿는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { Descent, PathResolutionScene, SceneDir } from './scene.js';

const H = 500;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가장자리 */
const MARGIN = 16;
/** 경로 줄의 세로 중심 */
const PATH_Y = 28;
/** 층이 놓이는 띠 */
const LAYER_TOP = 64;
const LAYER_BOTTOM = H - 58;
const LAYER_GAP = 14;
/** 목록 상자 폭의 상한 */
const BOX_W_MAX = 300;
/** 상자 왼쪽에서 머리 번호까지 */
const HEAD_NUM_DX = 64;
/** 줄 높이 · 머리 높이의 상한 */
const ROW_H_MAX = 26;
const HEAD_H_MAX = 26;

/** 운동 시간 (ms) */
const DROP_MS = 520;
const LOOK_MS = 280;
const SLIDE_MS = 220;
const FALL_MS = 520;

type Pt = { x: number; y: number };

type Layout = {
  boxW: number;
  shift: number;
  slotH: number;
  headH: number;
  rowH: number;
  charW: number;
  chipH: number;
};

type LayerRefs = {
  group: SVGGElement;
  rows: Array<{ name: SVGTextElement; strike: SVGLineElement | null; mark: SVGTextElement | null; hit: SVGRectElement | null }>;
  chip: SVGGElement | null;
  connector: SVGLineElement | null;
};

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function mk<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function layoutFor(scene: PathResolutionScene): Layout {
  const levels = scene.path.length + 1;
  const maxRows = Math.max(1, ...scene.dirs.map((d) => d.entries.length));
  const slotH = (LAYER_BOTTOM - LAYER_TOP - LAYER_GAP * (levels - 1)) / levels;
  const headH = Math.min(HEAD_H_MAX, slotH * 0.3);
  const rowH = Math.min(ROW_H_MAX, (slotH - headH) / maxRows);
  const boxW = Math.min(BOX_W_MAX, PIECE_CANVAS_W - 2 * MARGIN);
  const shift = levels > 1 ? (PIECE_CANVAS_W - 2 * MARGIN - boxW) / (levels - 1) : 0;
  const charW = parseFloat(fontSizes.sm) * 0.6;
  return { boxW, shift, slotH, headH, rowH, charW, chipH: Math.min(22, rowH - 4) };
}

function layerOrigin(lay: Layout, i: number): Pt {
  return { x: MARGIN + i * lay.shift, y: LAYER_TOP + i * (lay.slotH + LAYER_GAP) };
}

function chipW(lay: Layout, text: string): number {
  return text.length * lay.charW + 14;
}

/** 경로 줄의 마디 칩 자리 — 0 은 루트 `/`, 1.. 은 마디 */
function pathChips(lay: Layout, scene: PathResolutionScene): Array<{ x: number; w: number; text: string }> {
  const out: Array<{ x: number; w: number; text: string }> = [];
  let x = MARGIN;
  const rootW = chipW(lay, '/');
  out.push({ x, w: rootW, text: '/' });
  x += rootW + 4;
  scene.path.forEach((seg, i) => {
    if (i > 0) x += lay.charW + 8; // 마디 사이의 `/`
    const w = chipW(lay, seg);
    out.push({ x, w, text: seg });
    x += w;
  });
  return out;
}

/** 층 i 가 보이는 디렉터리 번호 — 0 은 루트, 그 뒤는 자취가 닿은 번호 */
function layerInode(scene: PathResolutionScene, i: number): { inode: number; kind: 'dir' | 'file' } {
  if (i === 0) return { inode: scene.root, kind: 'dir' };
  const d = scene.trail[i - 1];
  if (!d) throw new Error(`path-resolution-stage: 층 ${i} 에 닿은 걸음이 없다`);
  return { inode: d.found, kind: d.kind };
}

function dirOf(scene: PathResolutionScene, inode: number): SceneDir {
  const dir = scene.dirs.find((d) => d.inode === inode);
  if (!dir) throw new Error(`path-resolution-stage: 디렉터리 inode ${inode} 의 목록이 없다`);
  return dir;
}

/** 층 i 의 줄 r 의 가운데 y */
function rowMidY(lay: Layout, i: number, r: number): number {
  return layerOrigin(lay, i).y + lay.headH + r * lay.rowH + lay.rowH / 2;
}

/** 층 i 의 줄에 앉은 칩의 왼쪽 x */
function rowChipX(lay: Layout, i: number, text: string): number {
  return layerOrigin(lay, i).x + lay.boxW - 8 - chipW(lay, text);
}

export const pathResolutionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    let layerRefs: LayerRefs[] = [];

    const alive = (mine: number): boolean => mine === gen && !destroyed;

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

    /** 한 시계로 k 를 0→1 로 흘린다. 끊기면 곧장 풀린다 */
    async function flow(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (!alive(mine)) return;
        const k = Math.min(1, (Date.now() - start) / ms);
        frame(ease(k));
        if (k >= 1) return;
        await wait(16);
      }
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { fill: string; size?: string; family?: string; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = mk(
        'text',
        {
          x,
          y,
          fill: opts.fill,
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = body;
      return node;
    }

    function drawChip(parent: Element, lay: Layout, x: number, cy: number, body: string, stroke: string, ink: string): SVGGElement {
      const g = mk('g', {}, parent);
      mk(
        'rect',
        { x, y: cy - lay.chipH / 2, width: chipW(lay, body), height: lay.chipH, rx: 5, fill: colors.bg, stroke, 'stroke-width': 1.5 },
        g,
      );
      text(g, x + chipW(lay, body) / 2, cy, body, { fill: ink, family: fonts.mono, anchor: 'middle' });
      return g;
    }

    function drawStatic(scene: PathResolutionScene): void {
      svg.textContent = '';
      const lay = layoutFor(scene);
      const done = scene.trail.length;

      // 경로 줄
      const chips = pathChips(lay, scene);
      chips.forEach((c, idx) => {
        // idx 0 은 루트, idx s+1 은 마디 s
        const consumed = idx === 0 || idx <= done;
        const current = idx > 0 && idx === done;
        drawChip(
          svg,
          lay,
          c.x,
          PATH_Y,
          c.text,
          current ? colors.itemComparing : colors.border,
          consumed && !current ? colors.textMuted : colors.text,
        );
        if (idx >= 2) text(svg, c.x - lay.charW / 2 - 4, PATH_Y, '/', { fill: colors.textMuted, family: fonts.mono, anchor: 'middle' });
      });

      // 층
      layerRefs = [];
      for (let i = 0; i <= done; i += 1) {
        const o = layerOrigin(lay, i);
        const { inode, kind } = layerInode(scene, i);
        const g = mk('g', {}, svg);
        const numX = o.x + HEAD_NUM_DX;
        const refs: LayerRefs = { group: g, rows: [], chip: null, connector: null };

        if (kind === 'file') {
          mk('rect', { x: o.x, y: o.y, width: lay.boxW, height: lay.headH, rx: 6, fill: colors.bgSubtle, stroke: colors.success, 'stroke-width': 2 }, g);
          text(g, numX - 6, o.y + lay.headH / 2, t('label.inode', 'inode'), { fill: colors.textMuted, anchor: 'end' });
          text(g, numX, o.y + lay.headH / 2, String(inode), { fill: colors.text, family: fonts.mono, weight: '600' });
          text(g, o.x + lay.boxW - 10, o.y + lay.headH / 2, t('label.file', 'file'), { fill: colors.success, anchor: 'end', weight: '600' });
          layerRefs.push(refs);
          continue;
        }

        const dir = dirOf(scene, inode);
        const boxH = lay.headH + dir.entries.length * lay.rowH;
        mk('rect', { x: o.x, y: o.y, width: lay.boxW, height: boxH, rx: 6, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 }, g);
        mk('line', { x1: o.x, y1: o.y + lay.headH, x2: o.x + lay.boxW, y2: o.y + lay.headH, stroke: colors.border, 'stroke-width': 1 }, g);
        text(g, numX - 6, o.y + lay.headH / 2, t('label.inode', 'inode'), { fill: colors.textMuted, anchor: 'end' });
        text(g, numX, o.y + lay.headH / 2, String(inode), { fill: colors.text, family: fonts.mono, weight: '600' });
        text(
          g,
          o.x + lay.boxW - 10,
          o.y + lay.headH / 2,
          i === 0 ? t('label.root', 'root directory') : t('label.dir', 'directory'),
          { fill: colors.textMuted, anchor: 'end' },
        );

        // 이 층에서 내려간 걸음 (마지막 층이면 아직 없다)
        const d: Descent | undefined = scene.trail[i];
        const segName = d ? scene.path[d.seg] : undefined;
        const rowNumX = o.x + lay.shift + HEAD_NUM_DX;
        dir.entries.forEach((e, r) => {
          const cy = rowMidY(lay, i, r);
          const scanned = d !== undefined && r < d.compared;
          const matched = d !== undefined && r === d.compared - 1;
          let hit: SVGRectElement | null = null;
          if (matched) {
            hit = mk('rect', { x: o.x + 3, y: cy - lay.rowH / 2 + 2, width: lay.boxW - 6, height: lay.rowH - 4, rx: 4, fill: colors.accent, 'fill-opacity': 0.28 }, g);
          }
          const name = text(g, o.x + 12, cy, e.name, {
            fill: scanned && !matched ? colors.textMuted : colors.text,
            family: fonts.mono,
            weight: matched ? '600' : '400',
          });
          text(g, rowNumX, cy, String(e.inode), { fill: matched ? colors.text : colors.textMuted, family: fonts.mono });
          let strike: SVGLineElement | null = null;
          let mark: SVGTextElement | null = null;
          if (scanned && segName !== undefined) {
            if (!matched) {
              strike = mk('line', { x1: o.x + 10, y1: cy, x2: o.x + 14 + e.name.length * lay.charW, y2: cy, stroke: colors.textMuted, 'stroke-width': 1 }, g);
            }
            mark = text(g, rowChipX(lay, i, segName) - 12, cy, matched ? '=' : '≠', {
              fill: matched ? colors.text : colors.itemSwapping,
              family: fonts.mono,
              anchor: 'middle',
              weight: '600',
            });
          }
          refs.rows.push({ name, strike, mark, hit });
        });

        if (d && segName !== undefined) {
          refs.chip = drawChip(g, lay, rowChipX(lay, i, segName), rowMidY(lay, i, d.compared - 1), segName, colors.itemComparing, colors.text);
          const next = layerOrigin(lay, i + 1);
          const lineX = rowNumX + lay.charW;
          refs.connector = mk('line', { x1: lineX, y1: o.y + boxH, x2: lineX, y2: next.y, stroke: colors.accent, 'stroke-width': 2 }, g);
        }
        layerRefs.push(refs);
      }

      // 캡션
      const last = scene.trail[done - 1];
      const capY1 = H - 36;
      const capY2 = H - 14;
      if (!last) {
        text(svg, PIECE_CANVAS_W / 2, capY1, t('caption.start', 'Start: root directory, inode {n}', { n: scene.root }), {
          fill: colors.text,
          size: fontSizes.md,
          anchor: 'middle',
        });
        return;
      }
      const lastName = scene.path[last.seg];
      if (lastName === undefined) throw new Error(`path-resolution-stage: 마디 ${last.seg} 이 경로에 없다`);
      const line1 =
        last.kind === 'file'
          ? t('caption.file', 'Looking for: {name} · names compared: {c} · reached file: inode {n}', {
              name: lastName,
              c: last.compared,
              n: last.found,
            })
          : t('caption.dir', 'Looking for: {name} · names compared: {c} · next directory: inode {n}', {
              name: lastName,
              c: last.compared,
              n: last.found,
            });
      text(svg, PIECE_CANVAS_W / 2, capY1, line1, { fill: colors.text, size: fontSizes.md, anchor: 'middle' });
      text(
        svg,
        PIECE_CANVAS_W / 2,
        capY2,
        t('caption.total', 'Total names compared: {total} · directories searched: {dirs}', { total: last.total, dirs: last.dirs }),
        { fill: colors.textMuted, size: fontSizes.sm, anchor: 'middle' },
      );
    }

    /** 방금 내려간 걸음 하나를 흘린다. 정적 그림은 이미 끝 자리에 서 있다 */
    async function playDescend(scene: PathResolutionScene, mine: number): Promise<void> {
      const lay = layoutFor(scene);
      const i = scene.trail.length - 1;
      const d = scene.trail[i];
      const refs = layerRefs[i];
      const nextRefs = layerRefs[i + 1];
      const segName = d ? scene.path[d.seg] : undefined;
      const src = d ? pathChips(lay, scene)[d.seg + 1] : undefined;
      if (!d || !refs || !nextRefs || !refs.chip || segName === undefined || !src) {
        throw new Error(`path-resolution-stage: 걸음 ${i} 을 그릴 자리가 없다`);
      }

      // 아직 일어나지 않은 것을 걷는다
      nextRefs.group.setAttribute('visibility', 'hidden');
      refs.connector?.setAttribute('visibility', 'hidden');
      for (const row of refs.rows) {
        row.strike?.setAttribute('visibility', 'hidden');
        row.mark?.setAttribute('visibility', 'hidden');
        row.hit?.setAttribute('visibility', 'hidden');
        row.name.setAttribute('fill', colors.text);
      }

      // 1. 마디가 경로에서 떨어져 목록 맨 위로 내려온다
      const endX = rowChipX(lay, i, segName);
      const endY = rowMidY(lay, i, d.compared - 1);
      const topY = rowMidY(lay, i, 0);
      const chip = refs.chip;
      const place = (x: number, y: number): void => {
        chip.setAttribute('transform', `translate(${r2(x - endX)} ${r2(y - endY)})`);
      };
      place(src.x, PATH_Y);
      await flow(DROP_MS, mine, (k) => place(src.x + (endX - src.x) * k, PATH_Y + (topY - PATH_Y) * k));
      if (!alive(mine)) return;

      // 2. 적힌 차례로 한 칸씩 견준다
      for (let r = 0; r < d.compared; r += 1) {
        const row = refs.rows[r];
        if (!row) throw new Error(`path-resolution-stage: 층 ${i} 에 줄 ${r} 이 없다`);
        row.mark?.removeAttribute('visibility');
        if (r < d.compared - 1) {
          row.strike?.removeAttribute('visibility');
          row.name.setAttribute('fill', colors.textMuted);
        } else {
          row.hit?.removeAttribute('visibility');
        }
        await wait(LOOK_MS);
        if (!alive(mine)) return;
        if (r < d.compared - 1) {
          const y0 = rowMidY(lay, i, r);
          const y1 = rowMidY(lay, i, r + 1);
          await flow(SLIDE_MS, mine, (k) => place(endX, y0 + (y1 - y0) * k));
          if (!alive(mine)) return;
        }
      }

      // 3. 옆의 번호가 아래층으로 떨어져 다음 머리가 된다
      const o = layerOrigin(lay, i);
      const next = layerOrigin(lay, i + 1);
      const numX = o.x + lay.shift + HEAD_NUM_DX;
      const fromY = endY;
      const toY = next.y + lay.headH / 2;
      const falling = text(svg, numX, fromY, String(d.found), { fill: colors.text, family: fonts.mono, weight: '600' });
      const line = refs.connector;
      line?.removeAttribute('visibility');
      const lineTop = o.y + lay.headH + dirOf(scene, d.dir).entries.length * lay.rowH;
      await flow(FALL_MS, mine, (k) => {
        const y = fromY + (toY - fromY) * k;
        falling.setAttribute('y', String(r2(y)));
        line?.setAttribute('y2', String(r2(Math.max(lineTop, y))));
      });
    }

    return {
      render(next: PathResolutionScene, prev: PathResolutionScene | null, opts: { animate: boolean }): Promise<void> | void {
        if (destroyed) return;
        const mine = (gen += 1);
        drawStatic(next);
        const moved = prev !== null && next.trail.length === prev.trail.length + 1 && next.step !== null;
        if (!opts.animate || !moved) return;
        return playDescend(next, mine).then(() => {
          if (alive(mine)) drawStatic(next);
        });
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
