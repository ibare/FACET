/**
 * path-vector-policy stage — 받은 길이 걸러지고 추려진다.
 *
 * 길 하나 = 한 줄. 줄 안의 칸은 거쳐 온 AS 번호이고, 끝(그 망을 가진 AS)을 오른쪽에 맞춰 세워
 * 길이의 차이가 줄의 왼쪽 끝에서 보인다. 운동:
 *  - arrive : 줄들이 받은 차례대로 오른쪽 밖에서 미끄러져 들어와 선다
 *  - loop   : 내 번호가 든 줄이 경계선 아래 버림 칸으로 떨어진다
 *  - rank   : 줄마다 관계로 매긴 선호 막대가 자란다
 *  - pick   : 줄들이 세운 차례의 자리로 오르내린다 — 맨 앞에 선 줄이 고른 길이다
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { Relation } from './algorithm';
import type { PathVectorPolicyScene } from './scene';

const H = 350;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 16;
/** 줄 영역 첫 줄의 위 */
const ROWS_TOP = 74;
/** 경계선 띠의 높이 (버림 이름 + 선) */
const BAND_H = 24;
/** 아래 캡션 두 줄의 몫 */
const CAPTION_H = 46;
/** 줄 간격의 상한 */
const MAX_SLOT = 40;
/** 칸 너비의 상한 */
const MAX_CHIP_W = 84;
const CHIP_GAP = 8;
/** 관계 이름 칸의 너비 */
const REL_W = 78;
/** 선호 수 글자의 몫 */
const PREF_NUM_W = 34;
const MOTION_MS = 600;
const FRAME_MS = 16;
/** 걸러진 줄의 흐림 */
const DIM = 0.4;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface Layout {
  W: number;
  slot: number;
  chipW: number;
  chipH: number;
  barX: number;
  barMax: number;
  chipsLeft: number;
  bandTop: number;
  discardTop: number;
}

function layoutFor(scene: PathVectorPolicyScene): Layout {
  const W = PIECE_CANVAS_W;
  const n = scene.routes.length;
  const avail = H - ROWS_TOP - BAND_H - CAPTION_H;
  // 줄 영역 n 칸 + 버림 칸 하나
  const slot = Math.min(MAX_SLOT, avail / (n + 1));
  const chipH = Math.min(28, slot - 10);
  const chipsLeft = Math.round(W * 0.38);
  const maxLen = Math.max(...scene.routes.map((r) => r.path.length));
  const region = W - PAD - chipsLeft;
  const chipW = Math.min(MAX_CHIP_W, (region - CHIP_GAP * (maxLen - 1)) / maxLen);
  const barX = PAD + REL_W;
  const barMax = chipsLeft - 10 - barX - PREF_NUM_W;
  const bandTop = ROWS_TOP + n * slot;
  return { W, slot, chipW, chipH, barX, barMax, chipsLeft, bandTop, discardTop: bandTop + BAND_H };
}

/** 줄의 자리 — 세운 차례 · 걸러진 뒤 · 받은 차례 가운데 장면이 지난 것 */
interface Place {
  y: number;
  s: number;
}

function receivedPlace(scene: PathVectorPolicyScene, L: Layout, from: number): Place {
  const i = scene.routes.findIndex((r) => r.from === from);
  return { y: ROWS_TOP + i * L.slot, s: 1 };
}

function filteredPlace(scene: PathVectorPolicyScene, L: Layout, from: number): Place {
  const j = scene.dropped.findIndex((d) => d.from === from);
  if (j >= 0) {
    const pitch = Math.min(L.slot, L.slot / scene.dropped.length);
    return { y: L.discardTop + j * pitch, s: pitch / L.slot };
  }
  const k = scene.kept.indexOf(from);
  return { y: ROWS_TOP + k * L.slot, s: 1 };
}

function placeOf(scene: PathVectorPolicyScene, L: Layout, from: number): Place {
  if (scene.order.length > 0) {
    const k = scene.order.indexOf(from);
    if (k >= 0) return { y: ROWS_TOP + k * L.slot, s: 1 };
  }
  if (scene.filtered) return filteredPlace(scene, L, from);
  return receivedPlace(scene, L, from);
}

interface RowHandle {
  g: SVGGElement;
  place: Place;
  bar: SVGRectElement | null;
  barW: number;
  num: SVGTextElement | null;
}

export const pathVectorPolicyStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let rows = new Map<number, RowHandle>();

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

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    function relationName(rel: Relation): string {
      switch (rel) {
        case 'customer':
          return t('label.customer', 'Customer');
        case 'peer':
          return t('label.peer', 'Peer');
        case 'provider':
          return t('label.provider', 'Provider');
      }
    }

    function captionLines(scene: PathVectorPolicyScene): [string, string] {
      switch (scene.step.kind) {
        case 'start':
          return [t('caption.start', 'Waiting for paths from the neighbors.'), ''];
        case 'arrive':
          return [t('caption.arrive', 'Paths received: {n}', { n: scene.routes.length }), ''];
        case 'loop': {
          const left = t('caption.left', 'Paths left: {n}', { n: scene.kept.length });
          if (scene.dropped.length === 0) {
            return [t('caption.noLoop', 'No path holds own number AS{me}.', { me: scene.me }), left];
          }
          const from = scene.dropped.map((d) => `AS${d.from}`).join(' · ');
          return [t('caption.loop', 'Own number AS{me} in the path from {from}: a loop, dropped.', { me: scene.me, from }), left];
        }
        case 'rank':
          return [t('caption.rank', 'Each path gets a preference from the relationship with its neighbor.'), ''];
        case 'pick': {
          const pick = scene.pick;
          if (pick === null) return ['', ''];
          const win = scene.scored.find((s) => s.from === pick.chosen);
          const short = scene.scored.find((s) => s.from === pick.shortest);
          if (win === undefined || short === undefined) return ['', ''];
          return [
            t('caption.pick', 'Chosen: AS{from} — preference {pref} · length {len}', {
              from: win.from,
              pref: win.pref,
              len: win.length,
            }),
            t('caption.shortest', 'Shortest: AS{from} — length {len} · place {rank}/{count}', {
              from: short.from,
              len: short.length,
              rank: pick.shortestRank,
              count: scene.order.length,
            }),
          ];
        }
      }
    }

    function drawStatic(scene: PathVectorPolicyScene): void {
      svg.textContent = '';
      rows = new Map();
      const L = layoutFor(scene);
      const W = L.W;
      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);

      // 머리 — 나와 목적지
      label(svg, PAD, 14, t('label.me', 'Me'), { size: fontSizes.xs, fill: colors.textMuted });
      const meW = Math.min(L.chipW, 90);
      el('rect', { x: PAD, y: 24, width: meW, height: L.chipH, rx: 4, fill: colors.primary }, svg);
      label(svg, PAD + meW / 2, 24 + L.chipH / 2, `AS${scene.me}`, {
        fill: colors.textInverse,
        anchor: 'middle',
        mono: true,
        weight: '600',
      });
      label(svg, W - PAD, 14, t('label.destination', 'Destination'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'end',
      });
      label(svg, W - PAD, 24 + L.chipH / 2, scene.prefix, { anchor: 'end', mono: true, weight: '600' });
      if (scene.scored.length > 0) {
        label(svg, L.barX, ROWS_TOP - 4, t('label.pref', 'Preference'), { size: fontSizes.xs, fill: colors.textMuted });
      }

      if (scene.arrived) {
        // 버림 경계
        label(svg, W - PAD, L.bandTop + 9, t('label.discarded', 'Discarded'), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'end',
        });
        el(
          'line',
          {
            x1: PAD,
            y1: L.bandTop + 19,
            x2: W - PAD,
            y2: L.bandTop + 19,
            stroke: colors.border,
            'stroke-dasharray': '4 4',
          },
          svg,
        );
      }

      const relColors = categorical(scene.prefs.length);
      const maxPref = Math.max(...scene.prefs.map((p) => p.pref));
      const rowsLayer = el('g', {}, svg);

      if (scene.arrived) {
        for (const route of scene.routes) {
          const place = placeOf(scene, L, route.from);
          const g = el('g', { transform: `translate(0,${round(place.y)}) scale(${round(place.s)})` }, rowsLayer);
          const cy = L.slot / 2;
          const drop = scene.dropped.find((d) => d.from === route.from);
          const relIdx = scene.prefs.findIndex((p) => p.rel === route.rel);
          const relColor = relColors[relIdx] ?? colors.textMuted;

          if (scene.pick !== null && scene.pick.chosen === route.from) {
            el(
              'rect',
              {
                x: PAD / 2,
                y: 2,
                width: W - PAD,
                height: L.slot - 4,
                rx: 6,
                fill: colors.accent,
                'fill-opacity': 0.22,
                stroke: colors.accent,
                'stroke-width': 2,
              },
              g,
            );
          }

          const rel = label(g, PAD, cy, relationName(route.rel), { fill: relColor, weight: '600' });
          if (drop) rel.setAttribute('opacity', String(DIM));

          let bar: SVGRectElement | null = null;
          let num: SVGTextElement | null = null;
          let barW = 0;
          const score = scene.scored.find((s) => s.from === route.from);
          if (score) {
            barW = round((L.barMax * score.pref) / maxPref);
            bar = el('rect', { x: L.barX, y: cy - 5, width: barW, height: 10, rx: 2, fill: relColor }, g);
            num = label(g, L.barX + barW + 6, cy, String(score.pref), { size: fontSizes.xs, fill: colors.text });
          }

          const len = route.path.length;
          route.path.forEach((asn, k) => {
            const x = W - PAD - (len - k) * L.chipW - (len - k - 1) * CHIP_GAP;
            const isLoop = drop !== undefined && drop.at === k;
            const chip = el(
              'rect',
              {
                x,
                y: cy - L.chipH / 2,
                width: L.chipW,
                height: L.chipH,
                rx: 4,
                fill: isLoop ? colors.danger : colors.bgSubtle,
                stroke: isLoop ? colors.danger : colors.border,
              },
              g,
            );
            const txt = label(g, x + L.chipW / 2, cy, String(asn), {
              size: fontSizes.sm,
              fill: isLoop ? colors.textInverse : colors.text,
              anchor: 'middle',
              mono: true,
            });
            if (drop && !isLoop) {
              chip.setAttribute('opacity', String(DIM));
              txt.setAttribute('opacity', String(DIM));
            }
          });

          rows.set(route.from, { g, place, bar, barW, num });
        }
      }

      const [line1, line2] = captionLines(scene);
      label(svg, W / 2, H - 32, line1, { size: fontSizes.md, anchor: 'middle' });
      if (line2 !== '') label(svg, W / 2, H - 12, line2, { size: fontSizes.sm, fill: colors.textMuted, anchor: 'middle' });
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const n = Math.max(1, Math.round(ms / FRAME_MS));
        let i = 0;
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
          i += 1;
          frame(i / n);
          if (i >= n) {
            done();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    function setPlace(h: RowHandle, x: number, y: number, s: number): void {
      h.g.setAttribute('transform', `translate(${round(x)},${round(y)}) scale(${round(s)})`);
    }

    /** 줄들을 from 자리에서 제자리로 — 아직 못 온 만큼으로 그린다 */
    function moveRows(fromPlace: (from: number) => Place, mine: number): Promise<void> {
      return tween(MOTION_MS, mine, (p) => {
        const e = ease(p);
        for (const [from, h] of rows) {
          const a = fromPlace(from);
          setPlace(h, 0, a.y + (h.place.y - a.y) * e, a.s + (h.place.s - a.s) * e);
        }
      });
    }

    async function play(scene: PathVectorPolicyScene, mine: number): Promise<void> {
      const L = layoutFor(scene);
      switch (scene.step.kind) {
        case 'arrive': {
          const n = rows.size;
          const lag = n > 1 ? 0.4 / (n - 1) : 0;
          const order = scene.routes.map((r) => r.from);
          await tween(MOTION_MS, mine, (p) => {
            for (const [from, h] of rows) {
              const i = order.indexOf(from);
              const local = clamp01((p - i * lag) / 0.6);
              setPlace(h, (1 - ease(local)) * L.W, h.place.y, h.place.s);
            }
          });
          break;
        }
        case 'loop':
          await moveRows((from) => receivedPlace(scene, L, from), mine);
          break;
        case 'rank':
          await tween(MOTION_MS, mine, (p) => {
            const e = ease(p);
            for (const h of rows.values()) {
              if (h.bar === null || h.num === null) continue;
              const w = round(h.barW * e);
              h.bar.setAttribute('width', String(w));
              h.num.setAttribute('x', String(round(L.barX + w + 6)));
            }
          });
          break;
        case 'pick':
          await moveRows((from) => filteredPlace(scene, L, from), mine);
          break;
        case 'start':
          break;
      }
    }

    return {
      async render(next: PathVectorPolicyScene, _prev: PathVectorPolicyScene | null, opts: { animate: boolean }) {
        if (destroyed) return;
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate) return;
        await play(next, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
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
