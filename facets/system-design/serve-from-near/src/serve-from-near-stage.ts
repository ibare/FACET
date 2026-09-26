import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewMountParams,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ServeFromNearScene } from './scene.js';

const H = 384;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 왼쪽 사용자 이름 칸의 폭 — 이 오른쪽이 왕복 ms 를 재는 눈금 줄이다 */
const NAME_COL = 96;
/** 자 오른쪽 끝에 남기는 여백 (끝 핀의 부호가 잘리지 않게) */
const RIGHT_PAD = 28;
const CARD_TOP = 10;
const CARD_H = 52;
const ROWS_TOP = 104;
const ROWS_BOTTOM = 292;
/** 요청이 엣지까지 가는 시간과 돌아오는 시간 — 합이 1000 ms 안쪽 */
const OUT_MS = 450;
const BACK_MS = 450;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function round(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

export const serveFromNearStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 남기는 손잡이 — 운동이 이것만 만진다 */
    let walked = new Map<string, SVGLineElement>();
    let packetLayer: SVGGElement | null = null;

    function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function text(parent: Element, x: number, y: number, s: string, attrs: Attrs): SVGTextElement {
      const node = el('text', { x: round(x), y: round(y), 'font-family': fonts.body, ...attrs }, parent);
      node.textContent = s;
      return node;
    }

    function siteName(id: string): string {
      switch (id) {
        case 'icn':
          return t('label.city.icn', 'Seoul');
        case 'fra':
          return t('label.city.fra', 'Frankfurt');
        case 'gru':
          return t('label.city.gru', 'São Paulo');
        case 'iad':
          return t('label.city.iad', 'Virginia');
        default:
          throw new Error(`serve-from-near-stage: 이름 없는 자리 ${id}`);
      }
    }

    function userName(id: string): string {
      switch (id) {
        case 'seoul':
          return t('label.user.seoul', 'Seoul');
        case 'tokyo':
          return t('label.user.tokyo', 'Tokyo');
        case 'berlin':
          return t('label.user.berlin', 'Berlin');
        case 'lima':
          return t('label.user.lima', 'Lima');
        default:
          throw new Error(`serve-from-near-stage: 이름 없는 사용자 ${id}`);
      }
    }

    function rowY(scene: ServeFromNearScene, i: number): number {
      const n = scene.base.users.length;
      const pitch = Math.min(64, (ROWS_BOTTOM - ROWS_TOP) / Math.max(1, n - 1));
      return ROWS_TOP + i * pitch;
    }

    function xOf(scene: ServeFromNearScene, ms: number): number {
      const tally = scene.tally;
      if (tally === null) throw new Error('serve-from-near-stage: 축이 아직 없다');
      return NAME_COL + (ms / tally.span) * (W - NAME_COL - RIGHT_PAD);
    }

    function drawCards(scene: ServeFromNearScene): void {
      const sites = [...scene.base.edges, scene.base.origin];
      const gap = 8;
      const cardW = (W - 16 - gap * (sites.length - 1)) / sites.length;
      sites.forEach((id, i) => {
        const isOrigin = id === scene.base.origin;
        const x = 8 + i * (cardW + gap);
        const g = el('g', {}, svg);
        el(
          'rect',
          {
            x: round(x),
            y: CARD_TOP,
            width: round(cardW),
            height: CARD_H,
            rx: 6,
            fill: isOrigin ? c.bg : c.bgSubtle,
            stroke: isOrigin ? c.text : c.border,
            'stroke-width': isOrigin ? 1.5 : 1,
            'stroke-dasharray': isOrigin ? '4 3' : 'none',
          },
          g,
        );
        text(g, x + 10, CARD_TOP + 20, id, {
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: c.text,
        });
        text(g, x + 10, CARD_TOP + 38, siteName(id), { 'font-size': fontSizes.xs, fill: c.textMuted });
        text(g, x + cardW - 10, CARD_TOP + 18, isOrigin ? t('label.origin', 'Origin') : t('label.edge', 'Edge'), {
          'font-size': fontSizes.xs,
          fill: c.textMuted,
          'text-anchor': 'end',
        });
        const tally = scene.tally;
        if (tally === null) return;
        let n: number;
        if (isOrigin) {
          n = tally.originRequests;
        } else {
          const s = tally.served.find((v) => v.edge === id);
          if (!s) throw new Error(`serve-from-near-stage: 누계에 없는 엣지 ${id}`);
          n = s.n;
        }
        const lit = scene.step !== null && scene.step.edge === id;
        text(g, x + cardW - 10, CARD_TOP + 42, String(n), {
          'font-size': fontSizes.xl,
          'font-weight': 700,
          fill: lit ? c.primary : c.text,
          'text-anchor': 'end',
        });
      });
    }

    function drawRows(scene: ServeFromNearScene): void {
      const tally = scene.tally;
      const x0 = NAME_COL;
      scene.base.users.forEach((user, i) => {
        const y = rowY(scene, i);
        const g = el('g', {}, svg);
        const now = scene.step !== null && scene.step.user === user;
        if (now) {
          el('rect', { x: 4, y: round(y - 26), width: W - 8, height: 50, rx: 6, fill: c.bgSubtle }, g);
        }
        text(g, 12, y + smPx / 3, userName(user), {
          'font-size': fontSizes.sm,
          'font-weight': now ? 700 : 400,
          fill: c.text,
        });
        if (tally === null) return;
        const row = scene.base.rtt[user];
        if (!row) throw new Error(`serve-from-near-stage: 왕복 줄이 없다 ${user}`);
        const originMs = row[scene.base.origin];
        if (originMs === undefined) throw new Error(`serve-from-near-stage: 오리진 왕복이 없다 ${user}`);
        const done = scene.trail.find((r) => r.user === user) ?? null;

        // 자 — 왕복 ms 의 축
        el('line', { x1: x0, y1: y, x2: round(xOf(scene, tally.span)), y2: y, stroke: c.border, 'stroke-width': 1 }, g);
        // 먼 길 — 오리진까지. 걷지 않은 길로 늘 남는다
        const xo = xOf(scene, originMs);
        el(
          'line',
          {
            x1: x0,
            y1: y - 5,
            x2: round(xo),
            y2: y - 5,
            stroke: c.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 4',
          },
          g,
        );

        // 걸은 길 — 고른 엣지까지 (정적 그리기가 정본, 운동은 이것을 덜 온 만큼으로 그린다)
        if (done !== null) {
          const xe = xOf(scene, done.ms);
          const line = el(
            'line',
            {
              x1: x0,
              y1: y + 5,
              x2: round(xe),
              y2: y + 5,
              stroke: c.primary,
              'stroke-width': 4,
              'stroke-linecap': 'butt',
            },
            g,
          );
          walked.set(user, line);
        }

        // 엣지 핀
        for (const edge of scene.base.edges) {
          const ms = row[edge];
          if (ms === undefined) throw new Error(`serve-from-near-stage: 엣지 왕복이 없다 ${user}.${edge}`);
          const x = xOf(scene, ms);
          const chosen = done !== null && done.edge === edge;
          el(
            'rect',
            {
              x: round(x - 5),
              y: round(y - 5),
              width: 10,
              height: 10,
              rx: 2,
              fill: chosen ? c.accent : c.bg,
              stroke: chosen ? c.text : c.textMuted,
              'stroke-width': chosen ? 1.5 : 1,
            },
            g,
          );
          text(g, x, y - 12, edge, {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'font-weight': chosen ? 700 : 400,
            fill: chosen ? c.text : c.textMuted,
            'text-anchor': 'middle',
          });
          if (chosen) {
            text(g, x, y + 22, t('label.ms', '{n} ms', { n: ms }), {
              'font-size': fontSizes.sm,
              'font-weight': 700,
              fill: c.text,
              'text-anchor': x - x0 < 24 ? 'start' : 'middle',
            });
          }
        }

        // 오리진 핀 — 마름모
        const d = 7;
        el(
          'path',
          {
            d: `M ${round(xo)} ${round(y - d)} L ${round(xo + d)} ${y} L ${round(xo)} ${round(y + d)} L ${round(xo - d)} ${y} Z`,
            fill: c.bg,
            stroke: c.text,
            'stroke-width': 1.5,
          },
          g,
        );
        text(g, xo, y - 12, scene.base.origin, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
          'text-anchor': 'middle',
        });
        text(g, xo, y + 22, t('label.ms', '{n} ms', { n: originMs }), {
          'font-size': fontSizes.sm,
          fill: c.textMuted,
          'text-anchor': 'middle',
        });

        // 사용자 점
        el('circle', { cx: x0, cy: y, r: 5, fill: c.text }, g);
      });
    }

    function drawStatic(scene: ServeFromNearScene): void {
      svg.textContent = '';
      walked = new Map();
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
      drawCards(scene);
      drawRows(scene);
      const tally = scene.tally;
      if (tally !== null) {
        text(
          svg,
          W / 2,
          H - 44,
          t('label.totals', 'Edge total: {edge} ms · Via origin: {origin} ms', {
            edge: tally.edgeTotal,
            origin: tally.originTotal,
          }),
          { 'font-size': fontSizes.sm, fill: c.textMuted, 'text-anchor': 'middle' },
        );
      }
      const step = scene.step;
      const caption =
        step === null
          ? t('caption.ready', 'Requests waiting: {n}', { n: scene.base.users.length - scene.trail.length })
          : t('caption.serve', '{user} → {edge}: {ms} ms · Via origin: {origin} ms · Saved: {saved} ms', {
              user: userName(step.user),
              edge: step.edge,
              ms: step.ms,
              origin: step.originMs,
              saved: step.saved,
            });
      text(svg, W / 2, H - 18, caption, {
        'font-size': fontSizes.md,
        fill: c.text,
        'font-weight': 600,
        'text-anchor': 'middle',
      });
      packetLayer = el('g', {}, svg);
    }

    function tween(mine: number, dur: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (mine !== gen || destroyed) {
            finish();
            return;
          }
          const k = Math.min(1, (Date.now() - start) / dur);
          frame(easeInOut(k));
          if (k >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    /** 요청 하나가 가장 가까운 엣지까지 가서 돌아선다 */
    async function moveRequest(scene: ServeFromNearScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const i = scene.base.users.indexOf(step.user);
      if (i < 0) throw new Error(`serve-from-near-stage: 바탕에 없는 사용자 ${step.user}`);
      const line = walked.get(step.user);
      if (!line) throw new Error(`serve-from-near-stage: 걸은 길 손잡이가 없다 ${step.user}`);
      const layer = packetLayer;
      if (layer === null) throw new Error('serve-from-near-stage: 요청 층이 없다');
      const y = rowY(scene, i);
      const x0 = NAME_COL;
      const xe = xOf(scene, step.ms);
      const packet = el('circle', { cx: x0, cy: y + 5, r: 6, fill: c.accent, stroke: c.stateInk, 'stroke-width': 1.5 }, layer);
      // 아직 못 온 만큼 — 길은 요청을 따라 자란다
      line.setAttribute('x2', String(x0));
      await tween(mine, OUT_MS, (k) => {
        const x = round(x0 + (xe - x0) * k);
        line.setAttribute('x2', String(x));
        packet.setAttribute('cx', String(x));
      });
      if (mine !== gen || destroyed) return;
      await tween(mine, BACK_MS, (k) => {
        packet.setAttribute('cx', String(round(xe + (x0 - xe) * k)));
      });
    }

    return {
      async render(next: ServeFromNearScene, _prev: ServeFromNearScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await moveRequest(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
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
