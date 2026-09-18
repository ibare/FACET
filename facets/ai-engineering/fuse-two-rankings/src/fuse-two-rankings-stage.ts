/**
 * fuse-two-rankings 의 무대.
 *
 * 위에는 두 등수가 나란히 선다. 자리마다 그 등수의 몫 1/(k + r) 이 막대로 매달려 있다.
 * 아래에는 문서마다 기둥 자리가 있다. 걸음마다 한 등수의 몫이 두 줄에서 떨어져 나와
 * 제 문서의 기둥으로 옮겨 가 쌓인다. 마지막 걸음에서 기둥들이 쌓인 높이대로 옆으로
 * 자리를 바꿔 한 줄로 다시 선다.
 *
 * 막대 높이는 몫에 비례한다 — 위 줄과 아래 기둥이 같은 축척이라 옮겨 가도 크기가 같다.
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
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { FuseShare, FuseTwoRankingsScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 480;
const W = PIECE_CANVAS_W;
const PAD = 20;
const PANEL_GAP = 20;
const QUERY_Y = 20;
const TITLE_Y = 48;
const PLACE_Y = 66;
const CHIP_Y = 72;
const CHIP_H = 18;
/** 아래 기둥의 바닥선과 쌓을 수 있는 높이. */
const BASE_Y = 404;
const COL_H = 178;
const ID_Y = 420;
const RANK_Y = 438;
const CAPTION_Y = 466;
/** 막대 폭의 상한 — 실제 폭은 칸 폭에서 역산한다. */
const BAR_W_MAX = 36;
const CHIP_W_MAX = 46;
const DROP_MS = 720;
const FUSE_MS = 900;

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, typeof value === 'number' ? String(r2(value)) : value);
  }
  parent.appendChild(node);
  return node;
}

/**
 * 합 num/den 을 소수 넷째 자리로 — 분수에서 곧바로 반올림한다(한가운데면 짝수 쪽).
 * 실수로 나눈 뒤 `toFixed` 에 맡기면 1/64 = 0.015625 같은 한가운데 값이 엔진마다 갈릴 수 있다.
 */
function fourPlaces(num: number, den: number): string {
  if (den <= 0 || num < 0) return '';
  const scaled = num * 10000;
  let q = Math.floor(scaled / den);
  const rem = scaled - q * den;
  if (rem * 2 > den || (rem * 2 === den && q % 2 === 1)) q += 1;
  const whole = Math.floor(q / 10000);
  const frac = String(q % 10000).padStart(4, '0');
  return `${whole}.${frac}`;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 한 장면의 자리 셈. 좌표는 여기서만 나온다. */
function geometry(scene: FuseTwoRankingsScene) {
  const base = scene.base;
  const lists = base?.lists ?? [];
  const docs = base?.docs ?? [];
  const k = base?.k ?? 0;
  const nLists = Math.max(1, lists.length);
  const depth = Math.max(1, ...lists.map((l) => l.ranking.length));
  const panelW = (W - PAD * 2 - PANEL_GAP * (nLists - 1)) / nLists;
  const slotW = panelW / depth;
  const colW = (W - PAD * 2) / Math.max(1, docs.length);
  const barW = Math.max(8, Math.min(BAR_W_MAX, slotW - 14, colW - 14));
  const chipW = Math.max(barW, Math.min(CHIP_W_MAX, slotW - 8));
  // 한 문서가 모든 목록에서 1 등을 받아도 기둥에 들어가게 축척을 잡는다.
  const scale = (COL_H * (k + 1)) / nLists;
  const shareH = (den: number): number => (den > 0 ? scale / den : 0);
  const barBottom = CHIP_Y + CHIP_H + 6 + COL_H / nLists;
  const panelX = (list: number): number => PAD + list * (panelW + PANEL_GAP);
  const slotX = (list: number, rank: number): number => panelX(list) + slotW * (rank - 0.5);
  const colX = (index: number): number => PAD + colW * (index + 0.5);
  return { lists, docs, depth, panelW, slotW, barW, chipW, shareH, barBottom, panelX, slotX, colX };
}

type Geometry = ReturnType<typeof geometry>;

function narrowTheme(v: unknown): 'light' | 'dark' | undefined {
  return v === 'dark' || v === 'light' ? v : undefined;
}

export const fuseTwoRankingsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<FuseTwoRankingsScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(narrowTheme(params.theme));
    const tone = categorical(2);
    const listColor = (list: number): string => tone[list % tone.length] ?? colors.primary;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function listName(id: string): string {
      if (id === 'words') return t('label.words', 'word match');
      if (id === 'meaning') return t('label.meaning', 'meaning match');
      return id;
    }

    function place(r: number): string {
      return r > 0 ? t('label.place', '#{r}', { r }) : t('label.absent', 'unlisted');
    }

    function caption(scene: FuseTwoRankingsScene): string {
      const step = scene.step;
      if (step === null) return '';
      if (step.kind === 'init') {
        return t(
          'caption.init',
          'Two lists score the same query in different units. Only their ranks are kept.',
        );
      }
      if (step.kind === 'drop') {
        return t('caption.drop', 'Rank {rank}: each list gives 1/({k}+{rank}) = 1/{den} to the document there.', {
          rank: step.rank,
          k: step.k,
          den: step.den,
        });
      }
      const a = place(step.places[0] ?? 0);
      const b = place(step.places[1] ?? 0);
      return step.firstInNone
        ? t(
            'caption.fuse.none',
            'Lined up again by height: {doc} leads, placed {a} and {b} — first in neither list.',
            { doc: step.top, a, b },
          )
        : t('caption.fuse.some', 'Lined up again by height: {doc} leads, placed {a} and {b}.', {
            doc: step.top,
            a,
            b,
          });
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      value: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'font-weight': opts.weight ?? 'normal',
          fill: opts.fill ?? colors.text,
        },
        parent,
      );
      node.textContent = value;
      return node;
    }

    /** 몫 막대 하나 — 아랫변이 (0, bottom). 부모의 x 가 막대 가운데. */
    function shareBar(parent: Element, g: Geometry, share: FuseShare, bottom: number): SVGGElement {
      const h = g.shareH(share.den);
      const group = el('g', {}, parent);
      el(
        'rect',
        {
          x: -g.barW / 2,
          y: bottom - h,
          width: g.barW,
          height: h,
          fill: listColor(share.list),
          stroke: colors.bg,
          'stroke-width': 1,
        },
        group,
      );
      text(group, 0, bottom - h + 14, `1/${share.den}`, {
        size: fontSizes.xs,
        fill: colors.stateInk,
        mono: true,
      });
      return group;
    }

    interface Handles {
      g: Geometry;
      moving: Map<string, SVGGElement>;
      columns: Map<string, SVGGElement>;
    }

    const shareKey = (s: FuseShare): string => `${s.list}:${s.rank}`;

    /** 그 장면의 화면 전체. 운동이 없어도 이것만으로 끝 화면이 선다. */
    function drawStatic(scene: FuseTwoRankingsScene): Handles {
      svg.textContent = '';
      const g = geometry(scene);
      const handles: Handles = { g, moving: new Map(), columns: new Map() };
      const base = scene.base;
      if (base === null) return handles;

      text(svg, W / 2, QUERY_Y, t('label.query', 'Query: “{q}”', { q: base.query }), {
        size: fontSizes.md,
        mono: false,
      });

      const dropped = new Set(scene.shares.map(shareKey));

      // 위 — 두 등수
      g.lists.forEach((list, li) => {
        const x0 = g.panelX(li);
        text(svg, x0 + g.panelW / 2, TITLE_Y, listName(list.id), {
          fill: listColor(li),
          weight: 'bold',
        });
        list.ranking.forEach((doc, ri) => {
          const rank = ri + 1;
          const cx = g.slotX(li, rank);
          const slot = el('g', { transform: `translate(${r2(cx)},0)` }, svg);
          text(slot, 0, PLACE_Y, place(rank), { size: fontSizes.xs, fill: colors.textMuted });
          el(
            'rect',
            {
              x: -g.chipW / 2,
              y: CHIP_Y,
              width: g.chipW,
              height: CHIP_H,
              rx: 3,
              fill: colors.bgSubtle,
              stroke: listColor(li),
              'stroke-width': 1.5,
            },
            slot,
          );
          text(slot, 0, CHIP_Y + 13, doc, { mono: true });
          const share: FuseShare = { list: li, rank, doc, den: base.k + rank };
          if (dropped.has(shareKey(share))) {
            const h = g.shareH(share.den);
            el(
              'rect',
              {
                x: -g.barW / 2,
                y: g.barBottom - h,
                width: g.barW,
                height: h,
                fill: 'none',
                stroke: colors.textMuted,
                'stroke-width': 1,
                'stroke-dasharray': '3 3',
              },
              slot,
            );
          } else {
            shareBar(slot, g, share, g.barBottom);
          }
        });
      });

      // 아래 — 문서 기둥
      el(
        'line',
        { x1: PAD, y1: BASE_Y, x2: W - PAD, y2: BASE_Y, stroke: colors.border, 'stroke-width': 1 },
        svg,
      );
      const fusedIndex = new Map((scene.fused ?? []).map((f, i) => [f.doc, i]));
      const fusedEntry = new Map((scene.fused ?? []).map((f) => [f.doc, f]));
      const top = scene.fused?.[0]?.doc;
      g.docs.forEach((doc, di) => {
        const index = fusedIndex.get(doc.id) ?? di;
        const col = el('g', { transform: `translate(${r2(g.colX(index))},0)` }, svg);
        handles.columns.set(doc.id, col);
        let bottom = BASE_Y;
        for (const share of scene.shares) {
          if (share.doc !== doc.id) continue;
          const bar = shareBar(col, g, share, bottom);
          handles.moving.set(shareKey(share), bar);
          bottom -= g.shareH(share.den);
        }
        const label = text(col, 0, ID_Y, doc.id, {
          mono: true,
          weight: doc.id === top ? 'bold' : 'normal',
        });
        el('title', {}, label).textContent = doc.title;
        const entry = fusedEntry.get(doc.id);
        if (entry !== undefined) {
          text(col, 0, bottom - 6, fourPlaces(entry.num, entry.den), {
            size: fontSizes.xs,
            mono: true,
            fill: colors.textMuted,
          });
          text(col, 0, RANK_Y, place(index + 1), {
            size: fontSizes.xs,
            weight: 'bold',
            fill: doc.id === top ? colors.text : colors.textMuted,
          });
          if (doc.id === top) {
            el(
              'rect',
              {
                x: -g.barW / 2 - 4,
                y: bottom - 20,
                width: g.barW + 8,
                height: BASE_Y - bottom + 20,
                fill: 'none',
                stroke: colors.accent,
                'stroke-width': 2,
                rx: 4,
              },
              col,
            );
          }
        }
      });

      text(svg, W / 2, CAPTION_Y, caption(scene), { size: fontSizes.sm, fill: colors.text });
      return handles;
    }

    function schedule(fn: () => void): void {
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          fn();
        });
        frames.add(id);
      } else {
        const id = setTimeout(() => {
          timers.delete(id);
          fn();
        }, 16);
        timers.add(id);
      }
    }

    /** 한 시계로 흘린다. 다른 render 나 destroy 가 끼면 곧바로 물러난다. */
    function tween(ms: number, mine: number, draw: (e: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const start = performance.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish(false);
          const p = Math.min(1, (performance.now() - start) / ms);
          draw(ease(p));
          if (p >= 1) return finish(true);
          schedule(tick);
        };
        draw(0);
        schedule(tick);
      });
    }

    async function render(
      next: FuseTwoRankingsScene,
      _prev: FuseTwoRankingsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step === null || next.base === null) return;
      const base = next.base;
      const g = handles.g;

      if (step.kind === 'drop') {
        // 이번 등수의 몫 — 위 줄의 제자리에서 떨어져 나와 기둥 꼭대기로 간다.
        const moves: { node: SVGGElement; dx: number; dy: number }[] = [];
        const heights = new Map<string, number>();
        for (const share of next.shares) {
          const below = heights.get(share.doc) ?? 0;
          heights.set(share.doc, below + g.shareH(share.den));
          if (share.rank !== step.rank) continue;
          const node = handles.moving.get(shareKey(share));
          const di = base.docs.findIndex((d) => d.id === share.doc);
          if (node === undefined || di < 0) continue;
          const dx = g.slotX(share.list, share.rank) - g.colX(di);
          const dy = g.barBottom - (BASE_Y - below);
          moves.push({ node, dx, dy });
        }
        if (moves.length === 0) return;
        const ok = await tween(DROP_MS, mine, (e) => {
          for (const m of moves) {
            m.node.setAttribute(
              'transform',
              `translate(${r2(m.dx * (1 - e))},${r2(m.dy * (1 - e))})`,
            );
          }
        });
        if (ok && mine === gen && !destroyed) drawStatic(next);
        return;
      }

      if (step.kind === 'fuse' && next.fused !== null) {
        // 기둥들이 문서 순서의 자리에서 쌓인 높이의 자리로 옆걸음한다.
        const target = new Map(next.fused.map((f, i) => [f.doc, i]));
        const moves: { node: SVGGElement; from: number; to: number }[] = [];
        base.docs.forEach((doc, di) => {
          const node = handles.columns.get(doc.id);
          if (node === undefined) return;
          moves.push({ node, from: g.colX(di), to: g.colX(target.get(doc.id) ?? di) });
        });
        const ok = await tween(FUSE_MS, mine, (e) => {
          for (const m of moves) {
            m.node.setAttribute('transform', `translate(${r2(m.to + (m.from - m.to) * (1 - e))},0)`);
          }
        });
        if (ok && mine === gen && !destroyed) drawStatic(next);
      }
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
