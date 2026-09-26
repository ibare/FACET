/**
 * jittered-backoff 무대 — 두 세계(흩지 않음 · 흩음)를 위아래로 두고, 가로는 칸이다.
 * 클라이언트마다 한 줄. 실패한 클라이언트는 그 칸에 자국을 남기고 다시 올 칸으로 호를 그리며 뛴다 —
 * 흩지 않는 쪽은 여럿이 같은 거리를 한 덩이로, 흩는 쪽은 저마다 다른 거리로 갈라져.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { WORLD_IDS, type WorldId } from './algorithm.js';
import type { Hop, JitteredBackoffScene } from './scene.js';

const H = 450;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD_RIGHT = 14;
const LABEL_W = 60;
const CAPTION_Y = [20, 40] as const;
const AXIS_Y = 66;
const LANE_TOP = 80;
const LANE_HEAD = 30;
const LANE_FOOT = 30;
const LANE_GAP = 14;
const ROW_GAP_MAX = 18;
const DOT_R = 5;

/** 운동 — 지금 칸 띠가 옮겨 가고, 이어 실패한 클라이언트가 다시 올 칸으로 뛴다 */
const MOTION_MS = 560;
const HOP_START = 0.3;

const SMALL = parseFloat(fontSizes.xs);
const BODY = parseFloat(fontSizes.sm);

type Attrs = Record<string, string | number>;

function node(parent: Element, tag: string, attrs: Attrs, content?: string): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (content !== undefined) e.textContent = content;
  parent.appendChild(e);
  return e;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(v: number): number {
  return v < 0.5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2;
}

interface Layout {
  colW: number;
  rowGap: number;
  cellX(cell: number): number;
  laneTop(w: WorldId): number;
  rowY(w: WorldId, index: number): number;
  countY(w: WorldId): number;
}

function layoutFor(scene: JitteredBackoffScene, lastCell: number): Layout {
  const { firstCell, clients } = scene.base;
  const cols = lastCell - firstCell + 1;
  const colW = (PIECE_CANVAS_W - LABEL_W - PAD_RIGHT) / cols;
  const rowsSpace = (H - LANE_TOP - LANE_GAP - 2 * (LANE_HEAD + LANE_FOOT) - 8) / 2;
  const rowGap = clients.length > 1 ? Math.min(ROW_GAP_MAX, rowsSpace / (clients.length - 1)) : ROW_GAP_MAX;
  const laneH = LANE_HEAD + (clients.length - 1) * rowGap + LANE_FOOT;
  const laneTop = (w: WorldId): number => LANE_TOP + (w === 'plain' ? 0 : laneH + LANE_GAP);
  return {
    colW,
    rowGap,
    cellX: (cell) => LABEL_W + colW * (cell - firstCell + 0.5),
    laneTop,
    rowY: (w, i) => laneTop(w) + LANE_HEAD + i * rowGap,
    countY: (w) => laneTop(w) + LANE_HEAD + (clients.length - 1) * rowGap + 20,
  };
}

/** 되돌아가는 길의 호 — 멀리 갈수록 조금 더 솟지만 줄 간격을 넘지 않는다 */
function arcPoint(L: Layout, hop: Hop, y: number, q: number): { x: number; y: number } {
  const x0 = L.cellX(hop.from);
  const x1 = L.cellX(hop.to);
  const h = Math.min(L.rowGap * 0.6, 3 + (x1 - x0) * 0.05);
  const cx = (x0 + x1) / 2;
  const cy = y - 2 * h;
  const u = 1 - q;
  return { x: u * u * x0 + 2 * u * q * cx + q * q * x1, y: u * u * y + 2 * u * q * cy + q * q * y };
}

function arcPath(L: Layout, hop: Hop, y: number, q: number): string {
  const n = 16;
  const parts: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    const pt = arcPoint(L, hop, y, (q * i) / n);
    parts.push(`${i === 0 ? 'M' : 'L'} ${round(pt.x)} ${round(pt.y)}`);
  }
  return parts.join(' ');
}

export const jitteredBackoffStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function worldName(w: WorldId): string {
      return w === 'plain' ? t('label.plain', 'No jitter') : t('label.jitter', 'Jitter');
    }

    function drawCaption(scene: JitteredBackoffScene): void {
      const lines: string[] = [];
      const step = scene.step;
      if (step === null) {
        const here = scene.worlds.plain.clients.filter((c) => c.status === 'waiting' && c.at === scene.base.firstCell);
        lines.push(t('caption.start', 'Cell {cell}. Every client arrives at once — clients: {n}.', { cell: scene.base.firstCell, n: here.length }));
      } else {
        lines.push(
          t('caption.visit', 'Cell {cell}. Arrived — no jitter: {a}, jitter: {b}.', {
            cell: step.cell,
            a: step.worlds.plain.arrived.length,
            b: step.worlds.jitter.arrived.length,
          }),
        );
        const plainEnd = scene.worlds.plain.finishedAt;
        const jitterEnd = scene.worlds.jitter.finishedAt;
        if (plainEnd !== null && jitterEnd !== null) {
          lines.push(
            t('caption.end', 'Everyone served. Collision failures in all — no jitter: {fa}, jitter: {fb}.', {
              fa: scene.worlds.plain.fails.length,
              fb: scene.worlds.jitter.fails.length,
            }),
          );
        } else {
          lines.push(
            t('caption.failed', 'Failed here — no jitter: {fa}, jitter: {fb}.', {
              fa: step.worlds.plain.hops.length,
              fb: step.worlds.jitter.hops.length,
            }),
          );
        }
      }
      lines.forEach((line, i) => {
        node(
          svg,
          'text',
          {
            x: 12,
            y: CAPTION_Y[i === 0 ? 0 : 1],
            fill: i === 0 ? colors.text : colors.textMuted,
            'font-family': fonts.body,
            'font-size': i === 0 ? BODY + 1 : BODY,
            'font-weight': i === 0 ? 600 : 400,
          },
          line,
        );
      });
    }

    function drawFail(parent: Element, x: number, y: number): void {
      const s = 3.5;
      const attrs = { stroke: colors.danger, 'stroke-width': 1.8, 'stroke-linecap': 'round' };
      node(parent, 'line', { x1: round(x - s), y1: round(y - s), x2: round(x + s), y2: round(y + s), ...attrs });
      node(parent, 'line', { x1: round(x - s), y1: round(y + s), x2: round(x + s), y2: round(y - s), ...attrs });
    }

    function drawWaiting(parent: Element, x: number, y: number): void {
      node(parent, 'circle', { cx: round(x), cy: round(y), r: DOT_R, fill: colors.bg, stroke: colors.itemComparing, 'stroke-width': 2 });
    }

    function drawServed(parent: Element, x: number, y: number): void {
      node(parent, 'circle', { cx: round(x), cy: round(y), r: DOT_R, fill: colors.primary, stroke: colors.primary, 'stroke-width': 1 });
    }

    /** p === null 이면 멈춘 화면. p 는 0..1 운동의 진행 */
    function draw(scene: JitteredBackoffScene, p: number | null): void {
      svg.textContent = '';
      const lastCell = scene.base.lastCell;
      drawCaption(scene);
      if (lastCell === null) return;
      const L = layoutFor(scene, lastCell);
      const { firstCell, clients, capacity } = scene.base;
      const step = scene.step;
      const moving = p !== null && step !== null;
      const bandQ = moving && step.fromCell !== null ? ease(clamp01(p / HOP_START)) : 1;
      const hopQ = moving ? ease(clamp01((p - HOP_START) / (1 - HOP_START))) : 1;
      const hopStarted = !moving || p >= HOP_START;

      // 지금 칸 띠
      if (scene.cursor !== null) {
        const from = moving && step.fromCell !== null ? L.cellX(step.fromCell) : L.cellX(scene.cursor);
        const x = from + (L.cellX(scene.cursor) - from) * bandQ;
        node(svg, 'rect', {
          x: round(x - L.colW / 2 + 1),
          y: AXIS_Y - 14,
          width: round(L.colW - 2),
          height: H - (AXIS_Y - 14) - 4,
          rx: 4,
          fill: colors.accent,
          'fill-opacity': 0.2,
        });
      }

      // 칸 축
      node(svg, 'text', { x: LABEL_W - 8, y: AXIS_Y, 'text-anchor': 'end', fill: colors.textMuted, 'font-family': fonts.body, 'font-size': SMALL }, t('label.cell', 'Cell'));
      for (let cell = firstCell; cell <= lastCell; cell += 1) {
        const current = scene.cursor === cell;
        node(
          svg,
          'text',
          {
            x: round(L.cellX(cell)),
            y: AXIS_Y,
            'text-anchor': 'middle',
            fill: current ? colors.text : colors.textMuted,
            'font-family': fonts.mono,
            'font-size': SMALL,
            'font-weight': current ? 700 : 400,
          },
          String(cell),
        );
      }

      for (const w of WORLD_IDS) {
        const trail = scene.worlds[w];
        const lane = node(svg, 'g', {});
        const top = L.laneTop(w);
        const stepWorld = moving ? step.worlds[w] : null;
        const hopping = new Map<string, Hop>();
        if (stepWorld) for (const h of stepWorld.hops) hopping.set(h.id, h);

        // 머리: 이름 · 누적 실패 · 끝난 칸
        node(lane, 'text', { x: 12, y: top + 12, fill: colors.text, 'font-family': fonts.body, 'font-size': BODY, 'font-weight': 700 }, worldName(w));
        const shownFails = stepWorld && !hopStarted ? trail.fails.length - stepWorld.hops.length : trail.fails.length;
        const tally = node(lane, 'text', {
          x: PIECE_CANVAS_W - PAD_RIGHT,
          y: top + 12,
          'text-anchor': 'end',
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': SMALL,
        });
        node(tally, 'tspan', {}, t('label.failed', 'Failed: {n}', { n: shownFails }));
        const endShown = trail.finishedAt !== null && (hopStarted || !moving || step.cell !== trail.finishedAt);
        if (trail.finishedAt !== null && endShown) {
          node(tally, 'tspan', { dx: 16, fill: colors.text, 'font-weight': 700 }, t('label.last', 'Last cell: {cell}', { cell: trail.finishedAt }));
        }
        node(lane, 'line', { x1: 12, y1: top + 18, x2: PIECE_CANVAS_W - PAD_RIGHT, y2: top + 18, stroke: colors.border, 'stroke-width': 1 });

        clients.forEach((id, i) => {
          const y = L.rowY(w, i);
          node(lane, 'text', { x: LABEL_W - 8, y: round(y + SMALL / 3), 'text-anchor': 'end', fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': SMALL }, id);
          node(lane, 'line', {
            x1: round(L.cellX(firstCell)),
            y1: round(y),
            x2: round(L.cellX(lastCell)),
            y2: round(y),
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 4',
          });
        });

        const rowOf = (id: string): number => {
          const i = clients.indexOf(id);
          if (i < 0) throw new Error(`jittered-backoff-stage: ${id} 가 클라이언트 줄에 없다`);
          return i;
        };

        // 되돌아간 길
        for (const hop of trail.hops) {
          const y = L.rowY(w, rowOf(hop.id));
          const now = hopping.get(hop.id);
          const isCurrent = now !== undefined && now.from === hop.from;
          if (isCurrent && !hopStarted) continue;
          node(lane, 'path', {
            d: arcPath(L, hop, y, isCurrent ? hopQ : 1),
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1.2,
          });
        }

        // 실패 자국
        for (const f of trail.fails) {
          const now = hopping.get(f.id);
          if (now !== undefined && now.from === f.cell && !hopStarted) continue;
          drawFail(lane, L.cellX(f.cell), L.rowY(w, rowOf(f.id)));
        }

        // 클라이언트
        for (const c of trail.clients) {
          const y = L.rowY(w, rowOf(c.id));
          const hop = hopping.get(c.id);
          if (hop) {
            const pt = arcPoint(L, hop, y, hopStarted ? hopQ : 0);
            drawWaiting(lane, pt.x, pt.y);
            continue;
          }
          if (c.status === 'served') {
            const justServed = stepWorld !== null && stepWorld.served.includes(c.id) && !hopStarted;
            if (justServed) drawWaiting(lane, L.cellX(c.at), y);
            else drawServed(lane, L.cellX(c.at), y);
            continue;
          }
          drawWaiting(lane, L.cellX(c.at), y);
        }

        // 서버에 칸마다 찾아온 수
        const cy = L.countY(w);
        node(lane, 'text', { x: LABEL_W - 8, y: cy, 'text-anchor': 'end', fill: colors.textMuted, 'font-family': fonts.body, 'font-size': SMALL }, t('label.server', 'Server'));
        for (const v of trail.visits) {
          const over = v.count > capacity;
          node(
            lane,
            'text',
            {
              x: round(L.cellX(v.cell)),
              y: cy,
              'text-anchor': 'middle',
              fill: over ? colors.danger : colors.textMuted,
              'font-family': fonts.mono,
              'font-size': BODY,
              'font-weight': over ? 700 : 400,
            },
            String(v.count),
          );
        }
      }
    }

    function play(mine: number, scene: JitteredBackoffScene): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        let settled = false;
        const wake = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const frame = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / MOTION_MS);
          draw(scene, p);
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            frame();
          }, 16);
          timers.add(id);
        };
        frame();
      });
    }

    return {
      async render(next: JitteredBackoffScene, _prev: JitteredBackoffScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        draw(next, null);
        if (!opts.animate || next.step === null || next.base.lastCell === null) return;
        await play(mine, next);
        if (destroyed || mine !== gen) return;
        draw(next, null);
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
