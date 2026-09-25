/**
 * slow-start 무대 — 한 왕복의 무리가 다음 왕복의 무리로 불어난다.
 *
 * 줄 하나가 왕복 하나에 나간 조각들이다. 아래 줄은 지금의 창(아직 보내지 않은 무리).
 * 왕복이 돌면 윗줄의 조각마다 확인이 돌아와 아랫줄로 내려앉는다.
 * - 창 + 1 인 확인은 둘로 갈라져 내려앉는다 — 제 자리 하나와 새로 는 자리 하나.
 * - 창 + 1/창 인 확인은 하나로 내려앉고, 끝자리의 새 조각을 그만큼 키운다.
 *   왕복 머리의 창만큼 모이면 새 조각 하나가 다 자란다.
 * 문턱은 세로 점선이다 — 조각 한 칸의 폭이 처음부터 정해져 있어 줄의 길이가 곧 창이다.
 */
import {
  type CanvasView,
  type ViewInstance,
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { SlowStartRound, SlowStartScene } from './scene.js';

const H = 380;
const MOTION_MS = 800;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LABEL_COL = 72;
const COUNT_COL = 44;
const TOP = 44;
const ROWS_BOTTOM = 300;
const MAX_PITCH = 30;
const MAX_GAP = 34;

/** 아랫줄 한 칸이 윗줄의 어느 확인에서 왔는가 */
interface Slot {
  /** 이 칸을 데려온 확인 (윗줄의 칸 번호) */
  parent: number;
  /** 확인이 새로 늘린 칸인가 */
  born: boolean;
  /** 1/창 씩 모여 자라는 칸이면 그 몫을 낸 확인들 [from, to] */
  gathered: readonly [number, number] | null;
}

function slotsOf(r: SlowStartRound): Slot[] {
  const slots: Slot[] = [];
  let gatherFrom = -1;
  let part = 0;
  r.grows.forEach((g, i) => {
    slots.push({ parent: i, born: false, gathered: null });
    if (g === 1) {
      slots.push({ parent: i, born: true, gathered: null });
      return;
    }
    if (part === 0) gatherFrom = i;
    part += 1;
    if (part === r.window) {
      slots.push({ parent: i, born: true, gathered: [gatherFrom, i] });
      part = 0;
    }
  });
  return slots;
}

function round2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const slowStartStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round2(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(x: number, y: number, text: string, opts: Record<string, string | number>, parent: Element): void {
      const node = el(
        'text',
        { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted, ...opts },
        parent,
      );
      node.textContent = text;
    }

    interface Geometry {
      pitch: number;
      gap: number;
      radius: number;
      x(slot: number): number;
      y(row: number): number;
    }

    function geometry(scene: SlowStartScene): Geometry {
      const rows = scene.planned + 1;
      const pitch = Math.min(MAX_PITCH, (PIECE_CANVAS_W - LABEL_COL - COUNT_COL) / scene.widest);
      const gap = Math.min(MAX_GAP, (ROWS_BOTTOM - TOP) / rows);
      const radius = Math.min(pitch, gap) * 0.36;
      return {
        pitch,
        gap,
        radius,
        x: (slot) => LABEL_COL + (slot + 0.5) * pitch,
        y: (row) => TOP + (row + 0.5) * gap,
      };
    }

    /** 아랫줄(지금의 창)의 조각들 — 운동이 이 손잡이를 움직인다 */
    let pending: SVGElement[] = [];

    function drawStatic(scene: SlowStartScene): void {
      svg.textContent = '';
      pending = [];
      const g = geometry(scene);
      const sentRows = scene.rounds.length;
      const last = scene.rounds[sentRows - 1];
      const windowNow = last ? last.next : scene.first;

      // 문턱 — 이 선까지 조각이 늘어서면 창이 문턱에 닿은 것이다
      const thX = LABEL_COL + scene.ssthresh * g.pitch;
      el(
        'line',
        {
          x1: thX,
          x2: thX,
          y1: TOP - 6,
          y2: g.y(scene.planned) + g.gap / 2,
          stroke: colors.itemPivot,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 4',
        },
        svg,
      );
      label(thX, TOP - 14, t('label.threshold', 'Threshold: {s}', { s: scene.ssthresh }), {
        'text-anchor': 'middle',
        fill: colors.text,
      }, svg);

      // 지나간 왕복 — 나간 조각의 줄
      scene.rounds.forEach((r, row) => {
        const y = g.y(row);
        label(LABEL_COL - 10, y + smPx * 0.35, t('label.round', 'Round {r}', { r: r.round }), { 'text-anchor': 'end' }, svg);
        for (let i = 0; i < r.window; i += 1) {
          el('circle', { cx: g.x(i), cy: y, r: g.radius, fill: colors.primary }, svg);
        }
        label(g.x(r.window - 1) + g.radius + 6, y + smPx * 0.35, String(r.window), { fill: colors.text }, svg);
      });

      // 지금의 창 — 다음에 나갈 무리
      const y = g.y(sentRows);
      label(LABEL_COL - 10, y + smPx * 0.35, t('label.window', 'Window'), { 'text-anchor': 'end', fill: colors.text }, svg);
      const slots = last ? slotsOf(last) : [];
      for (let i = 0; i < windowNow; i += 1) {
        const born = slots[i]?.born === true;
        pending.push(
          el(
            'circle',
            {
              cx: g.x(i),
              cy: y,
              r: g.radius,
              fill: colors.bg,
              stroke: born ? colors.itemActive : colors.primary,
              'stroke-width': born ? 2.5 : 1.5,
            },
            svg,
          ),
        );
      }
      label(g.x(windowNow - 1) + g.radius + 6, y + smPx * 0.35, String(windowNow), {
        fill: colors.text,
        'font-weight': 'bold',
      }, svg);

      // 캡션 — 지금 일어난 일만
      const cap1 = el('text', { x: 16, y: 332, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text }, svg);
      const cap2 = el('text', { x: 16, y: 356, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.textMuted }, svg);
      if (!last) {
        cap1.textContent = t('caption.start', 'Window: {w} · threshold: {s}. Nothing sent yet.', {
          w: scene.first,
          s: scene.ssthresh,
        });
        return;
      }
      cap1.textContent = last.grows.every((v) => v === 1)
        ? t('caption.slow', 'Round {r} — sent: {n} · acks back: {n}. Each ack adds 1 to the window.', {
            r: last.round,
            n: last.window,
          })
        : t('caption.avoid', 'Round {r} — sent: {n} · acks back: {n}. Each ack adds 1/{n} to the window.', {
            r: last.round,
            n: last.window,
          });
      cap2.textContent = t('caption.window', 'Window: {w} → {next} · sent so far: {sent}', {
        w: last.window,
        next: last.next,
        sent: last.sent,
      });
    }

    function frame(mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) return done();
          const p = Math.min(1, (now - start) / MOTION_MS);
          draw(p);
          if (p >= 1) return done();
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        tick(start);
      });
    }

    /** 윗줄의 확인들이 아랫줄로 내려앉으며 갈라지거나 새 조각을 키운다 */
    async function flowRound(scene: SlowStartScene, mine: number): Promise<void> {
      const row = scene.rounds.length - 1;
      const r = scene.rounds[row];
      if (!r) return;
      const g = geometry(scene);
      const slots = slotsOf(r);
      const handles = pending.slice();
      const fromY = g.y(row);
      const toY = g.y(row + 1);
      // 확인은 차례로 돌아온다 — 앞 40% 에 걸쳐 출발하고 저마다 60% 동안 내려앉는다
      const startOf = (ack: number): number => (r.window > 1 ? (ack / (r.window - 1)) * 0.4 : 0);
      const local = (ack: number, p: number): number => Math.max(0, Math.min(1, (p - startOf(ack)) / 0.6));

      await frame(mine, (p) => {
        slots.forEach((s, i) => {
          const node = handles[i];
          if (!node) return;
          if (s.gathered) {
            // 1/창 씩 모인다 — 내려앉은 확인 수만큼 자란다
            const [a, b] = s.gathered;
            let got = 0;
            for (let k = a; k <= b; k += 1) got += local(k, p);
            const share = got / r.window;
            node.setAttribute('r', String(round2(g.radius * share)));
            return;
          }
          const q = ease(local(s.parent, p));
          const x0 = g.x(s.parent);
          const x1 = g.x(i);
          node.setAttribute('cx', String(round2(x0 + (x1 - x0) * q)));
          node.setAttribute('cy', String(round2(fromY + (toY - fromY) * q)));
          node.setAttribute('r', String(round2(g.radius * (s.born ? Math.max(0.15, q) : 0.6 + 0.4 * q))));
        });
      });
    }

    return {
      async render(next: SlowStartScene, _prev: SlowStartScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || next.step.kind !== 'round') return;
        await flowRound(next, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
