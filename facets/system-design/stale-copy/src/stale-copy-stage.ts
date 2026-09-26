/**
 * stale-copy stage — 위에 DB, 가운데 서버 셋과 각자의 캐시 사본, 아래에 읽은 사람이 받은 값 줄.
 *
 * 동사 "남는다": 쓰기의 새 값은 쓴 서버의 캐시를 거쳐 DB 로만 올라간다. 다른 서버의 사본에는
 * 아무것도 가지 않는다. 읽기는 사본에서 값을 한 벌 떠 받은 값 줄로 내려보낸다 — 옛 사본에서
 * 뜬 옛값이 줄에 하나씩 쌓인다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
} from '@ffacet/core/runtime';
import type { StaleCopyScene } from './scene.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로 자리 (가로는 캔버스 폭에서 셈한다) */
const DB_TOP = 18;
const DB_H = 60;
const SERVER_TOP = 128;
const SERVER_H = 88;
const SLOT_TOP = SERVER_TOP + 34;
const SLOT_H = 42;
const CLIENT_Y = 256;
const RETURN_LABEL_Y = 292;
const CHIP_TOP = 304;
const CHIP_H = 38;
const CAPTION_Y = 398;
const CAPTION2_Y = 422;

const MARGIN = 16;
const WRITE_UP_MS = 360;
const WRITE_DB_MS = 440;
const READ_UP_MS = 280;
const READ_DOWN_MS = 520;

type Attrs = Record<string, string | number>;

/** 운동 중 정적 그리기에 덮어쓸 것 — 아직 도착하지 않은 값 */
interface Hold {
  db?: number;
  copy?: { id: string; value: number };
  stale?: string[];
  hideSlot?: number;
}

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const staleCopyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const doc = svg.ownerDocument;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);
    const lgPx = parseFloat(fontSizes.lg);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Attrs, parent: Element, text?: string): SVGElement {
      const node = doc.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    // ── 가로 자리 ────────────────────────────────────────────
    function serverX(scene: StaleCopyScene, id: string): number {
      const i = scene.copies.findIndex((c) => c.id === id);
      if (i < 0) throw new Error(`stale-copy stage: 서버 '${id}' 가 장면에 없다`);
      return (W * (2 * i + 1)) / (2 * scene.copies.length);
    }
    function serverW(scene: StaleCopyScene): number {
      return Math.min(168, W / scene.copies.length - 28);
    }
    function slotCenterY(): number {
      return SLOT_TOP + SLOT_H / 2;
    }
    function chipX(slots: number, k: number): number {
      return MARGIN + ((W - 2 * MARGIN) * (2 * k + 1)) / (2 * slots);
    }
    function chipW(slots: number): number {
      return Math.min(96, (W - 2 * MARGIN) / slots - 18);
    }

    // ── 모양 ────────────────────────────────────────────────
    function chip(parent: Element, cx: number, cy: number, w: number, h: number, value: number, stale: boolean): SVGElement {
      const g = el('g', { transform: `translate(${round(cx)},${round(cy)})` }, parent);
      el(
        'rect',
        {
          x: -w / 2,
          y: -h / 2,
          width: w,
          height: h,
          rx: 6,
          fill: stale ? colors.accent : colors.bg,
          stroke: stale ? colors.accent : colors.text,
          'stroke-width': stale ? 1 : 1.5,
        },
        g,
      );
      el(
        'text',
        {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': lgPx,
          'font-weight': 600,
          fill: stale ? colors.stateInk : colors.text,
        },
        g,
        String(value),
      );
      return g;
    }

    function drawStatic(scene: StaleCopyScene, hold: Hold = {}): void {
      svg.textContent = '';
      const tally = scene.tally;
      const staleSet = new Set(hold.stale ?? (tally ? tally.stale : []));
      const dbValue = hold.db ?? scene.db;

      // DB 와 서버를 잇는 길 — 쓰기는 이 길로만 오른다
      const dbCx = W / 2;
      const dbW = Math.min(200, W * 0.34);
      for (const c of scene.copies) {
        el(
          'line',
          {
            x1: dbCx,
            y1: DB_TOP + DB_H,
            x2: serverX(scene, c.id),
            y2: SERVER_TOP,
            stroke: colors.border,
            'stroke-width': 1.5,
          },
          svg,
        );
      }

      // DB
      el('rect', { x: dbCx - dbW / 2, y: DB_TOP, width: dbW, height: DB_H, rx: 8, fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5 }, svg);
      el(
        'text',
        { x: dbCx, y: DB_TOP + 18, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': smPx, fill: colors.textMuted },
        svg,
        t('label.db', 'DB · {key}', { key: scene.key }),
      );
      el(
        'text',
        {
          x: dbCx,
          y: DB_TOP + 42,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': parseFloat(fontSizes.xl),
          'font-weight': 700,
          fill: colors.text,
        },
        svg,
        String(dbValue),
      );

      // 서버와 사본
      const sw = serverW(scene);
      for (const c of scene.copies) {
        const x = serverX(scene, c.id);
        const value = hold.copy && hold.copy.id === c.id ? hold.copy.value : c.value;
        const stale = staleSet.has(c.id);
        el('rect', { x: x - sw / 2, y: SERVER_TOP, width: sw, height: SERVER_H, rx: 8, fill: colors.bg, stroke: colors.border, 'stroke-width': 1.5 }, svg);
        el(
          'text',
          { x: x - sw / 2 + 12, y: SERVER_TOP + 20, 'font-family': fonts.body, 'font-size': smPx, 'font-weight': 600, fill: colors.text },
          svg,
          t('label.server', 'Server {id}', { id: c.id }),
        );
        if (stale) {
          el(
            'text',
            { x: x + sw / 2 - 12, y: SERVER_TOP + 20, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': smPx, 'font-weight': 700, fill: colors.text },
            svg,
            t('label.stale', 'stale'),
          );
        }
        chip(svg, x, slotCenterY(), sw - 24, SLOT_H, value, stale);
        // 읽는 사람 — 서버 아래
        el('line', { x1: x, y1: SERVER_TOP + SERVER_H, x2: x, y2: CLIENT_Y - 8, stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '3 4' }, svg);
        el('circle', { cx: x, cy: CLIENT_Y, r: 7, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.5 }, svg);
      }

      // 받은 값 줄
      if (tally) {
        el(
          'text',
          { x: MARGIN, y: RETURN_LABEL_Y, 'font-family': fonts.body, 'font-size': smPx, fill: colors.textMuted },
          svg,
          t('label.returned', 'Returned to readers'),
        );
        const cw = chipW(tally.readSlots);
        for (let k = 0; k < tally.readSlots; k += 1) {
          const cx = chipX(tally.readSlots, k);
          const r = scene.reads[k];
          if (!r || hold.hideSlot === k) {
            el(
              'rect',
              { x: cx - cw / 2, y: CHIP_TOP, width: cw, height: CHIP_H, rx: 6, fill: 'none', stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '4 4' },
              svg,
            );
            continue;
          }
          chip(svg, cx, CHIP_TOP + CHIP_H / 2, cw, CHIP_H, r.value, r.stale);
          el(
            'text',
            { x: cx, y: CHIP_TOP + CHIP_H + 16, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': smPx, fill: colors.textMuted },
            svg,
            t('label.server', 'Server {id}', { id: r.server }),
          );
          el(
            'text',
            { x: cx, y: CHIP_TOP + CHIP_H + 32, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': smPx, 'font-weight': r.stale ? 700 : 400, fill: r.stale ? colors.text : colors.textMuted },
            svg,
            r.stale ? t('label.stale', 'stale') : t('label.fresh', 'current'),
          );
        }
      }

      // 캡션 — 지금 일어나는 일
      const cap1 = { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': parseFloat(fontSizes.md), fill: colors.text };
      const cap2 = { x: W / 2, y: CAPTION2_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': smPx, fill: colors.textMuted };
      const step = scene.step;
      if (step === null) {
        if (tally) {
          // 모든 사본이 같은 값일 때만 이 문안이 참이다 — 셈은 알고리즘이 init 에 실었다
          if (tally.shared === null) throw new Error('stale-copy stage: 걸음 0 의 사본 값이 서버마다 다르다');
          el('text', cap1, svg, t('caption.start', 'Cached on each server — {key}: {value}', { key: scene.key, value: tally.shared }));
          el('text', cap2, svg, t('caption.distinct', 'Different values of {key}: {n}', { key: scene.key, n: tally.distinct }));
        }
      } else if (step.kind === 'write') {
        el('text', cap1, svg, t('caption.write', 'Write on server {server} — {key}: {value}', { server: step.server, key: scene.key, value: step.value }));
        if (tally) el('text', cap2, svg, t('caption.distinct', 'Different values of {key}: {n}', { key: scene.key, n: tally.distinct }));
      } else {
        el('text', cap1, svg, t('caption.read', 'Read on server {server} — returned: {value}', { server: step.server, value: step.value }));
        if (tally) {
          el('text', cap2, svg, t('caption.staleReads', 'Stale reads: {n} / {m}', { n: tally.staleReads, m: scene.reads.length }));
        }
      }
    }

    // ── 한 시계 ─────────────────────────────────────────────
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        if (destroyed || mine !== gen) {
          finish();
          return;
        }
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
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

    function live(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    // 쓰기 — 새 값이 쓴 서버의 캐시에 들고, 그 길로 DB 까지 오른다. 다른 사본으로는 가지 않는다.
    async function playWrite(scene: StaleCopyScene, mine: number): Promise<void> {
      const step = scene.step;
      if (!step || step.kind !== 'write') throw new Error('stale-copy stage: 쓰기 걸음이 아니다');
      const x = serverX(scene, step.server);
      const sw = serverW(scene);
      drawStatic(scene, { db: step.dbBefore, copy: { id: step.server, value: step.copyBefore }, stale: step.staleBefore });
      const up = chip(svg, x, CLIENT_Y, sw - 24, SLOT_H, step.value, false);
      await tween(WRITE_UP_MS, mine, (p) => {
        up.setAttribute('transform', `translate(${round(x)},${round(lerp(CLIENT_Y, slotCenterY(), p))})`);
      });
      if (!live(mine)) return;
      drawStatic(scene, { db: step.dbBefore, stale: step.staleBefore });
      const dbCx = W / 2;
      const dbCy = DB_TOP + 42;
      const toDb = chip(svg, x, slotCenterY(), 64, 34, step.value, false);
      await tween(WRITE_DB_MS, mine, (p) => {
        toDb.setAttribute('transform', `translate(${round(lerp(x, dbCx, p))},${round(lerp(slotCenterY(), dbCy, p))})`);
      });
    }

    // 읽기 — 요청이 사본까지 오르고, 사본의 값 한 벌이 받은 값 줄로 내려온다.
    async function playRead(scene: StaleCopyScene, mine: number): Promise<void> {
      const step = scene.step;
      const tally = scene.tally;
      if (!step || step.kind !== 'read') throw new Error('stale-copy stage: 읽기 걸음이 아니다');
      if (!tally) throw new Error('stale-copy stage: 읽기 걸음에 셈값이 없다');
      const x = serverX(scene, step.server);
      drawStatic(scene, { hideSlot: step.slot });
      const dot = el('circle', { cx: x, cy: CLIENT_Y, r: 5, fill: colors.primary }, svg);
      await tween(READ_UP_MS, mine, (p) => {
        dot.setAttribute('cy', String(round(lerp(CLIENT_Y, SLOT_TOP + SLOT_H, p))));
      });
      if (!live(mine)) return;
      drawStatic(scene, { hideSlot: step.slot });
      const cw = chipW(tally.readSlots);
      const tx = chipX(tally.readSlots, step.slot);
      const ty = CHIP_TOP + CHIP_H / 2;
      const down = chip(svg, x, slotCenterY(), cw, CHIP_H, step.value, step.stale);
      await tween(READ_DOWN_MS, mine, (p) => {
        down.setAttribute('transform', `translate(${round(lerp(x, tx, p))},${round(lerp(slotCenterY(), ty, p))})`);
      });
    }

    return {
      async render(next: StaleCopyScene, _prev: StaleCopyScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step === null) {
          drawStatic(next);
          return;
        }
        if (next.step.kind === 'write') await playWrite(next, mine);
        else await playRead(next, mine);
        if (!live(mine)) return;
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
