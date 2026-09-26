/**
 * cache-hit-miss 무대 — 요청이 캐시에서 돌아서거나 DB 까지 더 간다.
 *
 * 위: 온 차례대로 선 요청 여덟. 가운데: 서버 → 캐시 → DB 의 길. 요청 하나가 그 길을
 * 따라 나갔다가 돌아오는데, 적중은 캐시에서 돌아서고 실패는 DB 까지 가서 돌아오며
 * 캐시를 지날 때 그 키를 칸에 떨군다. 아래: 요청마다의 ms 가 이어 붙는 누계 띠.
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
import type { CacheHitMissScene, CacheHitMissStep } from './scene.js';

const H = 368;
const NS = 'http://www.w3.org/2000/svg';

const PAD = 20;
const QUEUE_Y = 12;
const QUEUE_H = 24;
const QUEUE_GAP = 8;

const LANE_Y = 110;
const TRAIL_OFF = 7;
const SERVER_W = 100;
const SERVER_H = 40;
const CACHE_W = 140;
const CACHE_TOP = 66;
const SLOT_TOP = 138;
const SLOT_H = 22;
const SLOT_GAP = 6;
const DB_W = 96;
const DB_H = 60;
const DB_TOP = 80;
/** 실패한 요청이 DB 안으로 들어가 돌아서는 깊이 */
const DB_TURN_IN = 22;

const TOKEN_W = 58;
const TOKEN_H = 20;

const BAR_LABEL_Y = 294;
const BAR_Y = 304;
const BAR_H = 20;
const CAPTION_Y = 346;
const CAPTION2_Y = 362;

/** 가장 긴 길(DB 왕복)을 지나는 ms. 적중은 길이에 비례해 짧다 */
const LONG_PATH_MS = 540;
const SEG_MS = 140;

type Frame = { d: number; seg: number };

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function geometry() {
  const W = PIECE_CANVAS_W;
  const serverX = PAD;
  const dbX = W - PAD - DB_W;
  const cacheX = r1((serverX + SERVER_W + dbX) / 2 - CACHE_W / 2);
  const cacheCx = cacheX + CACHE_W / 2;
  const x0 = serverX + SERVER_W;
  return { W, serverX, dbX, cacheX, cacheCx, x0 };
}

type Geo = ReturnType<typeof geometry>;

/** 이번 걸음의 길 — 나가는 줄, 돌아서는 꺾임, 돌아오는 줄 */
function pathOf(g: Geo, step: CacheHitMissStep) {
  const xt = step.kind === 'hit' ? g.cacheCx : g.dbX + DB_TURN_IN;
  const leg = xt - g.x0;
  const total = leg * 2 + TRAIL_OFF * 2;
  const pts = [
    { x: g.x0, y: LANE_Y - TRAIL_OFF, d: 0 },
    { x: xt, y: LANE_Y - TRAIL_OFF, d: leg },
    { x: xt, y: LANE_Y + TRAIL_OFF, d: leg + TRAIL_OFF * 2 },
    { x: g.x0, y: LANE_Y + TRAIL_OFF, d: total },
  ];
  /** 돌아오는 길에 캐시 가운데를 지나는 거리 (실패일 때 키를 떨구는 곳) */
  const backAtCache = leg + TRAIL_OFF * 2 + (xt - g.cacheCx);
  return { xt, leg, total, pts, backAtCache };
}

type PathInfo = ReturnType<typeof pathOf>;

function pointAt(p: PathInfo, d: number): { x: number; y: number } {
  for (let i = 1; i < p.pts.length; i += 1) {
    const a = p.pts[i - 1];
    const b = p.pts[i];
    if (!a || !b) throw new Error('cache-hit-miss-stage: 길의 점이 없다');
    if (d <= b.d || i === p.pts.length - 1) {
      const span = b.d - a.d;
      const f = span === 0 ? 1 : clamp01((d - a.d) / span);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  throw new Error('cache-hit-miss-stage: 길이 비었다');
}

function trailPoints(p: PathInfo, d: number): string {
  const out: string[] = [];
  for (const pt of p.pts) {
    if (pt.d > d) break;
    out.push(`${r1(pt.x)},${r1(pt.y)}`);
  }
  const tip = pointAt(p, d);
  out.push(`${r1(tip.x)},${r1(tip.y)}`);
  return out.join(' ');
}

export const cacheHitMissStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const g = geometry();
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      x: number,
      y: number,
      s: string,
      o: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: number } = {},
    ): SVGTextElement {
      const node = el('text', {
        x: r1(x),
        y: r1(y),
        'font-family': o.mono ? fonts.mono : fonts.body,
        'font-size': o.size ?? fontSizes.sm,
        fill: o.fill ?? colors.text,
        'text-anchor': o.anchor ?? 'middle',
        'dominant-baseline': 'central',
      });
      if (o.weight) node.setAttribute('font-weight', String(o.weight));
      node.textContent = s;
      return node;
    }

    function kindFill(kind: 'hit' | 'miss'): string {
      return kind === 'hit' ? colors.accent : colors.itemComparing;
    }

    function drawQueue(scene: CacheHitMissScene, frame: Frame | null): void {
      const n = scene.requests.length;
      const cw = (g.W - PAD * 2 - QUEUE_GAP * (n - 1)) / n;
      const done = scene.run ? scene.run.done : [];
      const step = scene.step;
      scene.requests.forEach((key, i) => {
        const x = PAD + i * (cw + QUEUE_GAP);
        const rec = done[i];
        const moving = frame !== null && step !== null && step.index === i && frame.d < pathOf(g, step).total;
        const filled = rec !== undefined && !moving;
        const isStep = step !== null && step.index === i;
        el('rect', {
          x: r1(x),
          y: QUEUE_Y,
          width: r1(cw),
          height: QUEUE_H,
          rx: 4,
          fill: filled ? kindFill(rec.kind) : colors.bg,
          stroke: isStep ? colors.primary : colors.border,
          'stroke-width': isStep ? 2 : 1,
        });
        label(x + cw / 2, QUEUE_Y + QUEUE_H / 2, key, {
          mono: true,
          size: fontSizes.xs,
          fill: filled ? colors.stateInk : rec === undefined && !isStep ? colors.textMuted : colors.text,
        });
      });
    }

    function drawStations(scene: CacheHitMissScene, frame: Frame | null): void {
      const step = scene.step;
      const path = step ? pathOf(g, step) : null;
      const d = frame && path ? frame.d : path ? path.total : 0;

      // 서버
      const sy = LANE_Y - SERVER_H / 2;
      el('rect', { x: g.serverX, y: sy, width: SERVER_W, height: SERVER_H, rx: 6, fill: colors.bgSubtle, stroke: colors.border });
      label(g.serverX + SERVER_W / 2, LANE_Y, t('label.server', 'Server'), { weight: 600 });

      // DB — 원통
      const dbReached = step !== null && step.kind === 'miss' && path !== null && d >= path.leg;
      const dbStroke = dbReached ? colors.itemComparing : colors.border;
      const dbW = dbReached ? 2 : 1;
      const ry = 8;
      el('path', {
        d: `M ${g.dbX} ${DB_TOP + ry} L ${g.dbX} ${DB_TOP + DB_H - ry} A ${DB_W / 2} ${ry} 0 0 0 ${g.dbX + DB_W} ${DB_TOP + DB_H - ry} L ${g.dbX + DB_W} ${DB_TOP + ry}`,
        fill: colors.bgSubtle,
        stroke: dbStroke,
        'stroke-width': dbW,
      });
      el('ellipse', { cx: g.dbX + DB_W / 2, cy: DB_TOP + ry, rx: DB_W / 2, ry, fill: colors.bgSubtle, stroke: dbStroke, 'stroke-width': dbW });
      label(g.dbX + DB_W / 2, DB_TOP + DB_H - 14, t('label.db', 'DB'), { weight: 600 });

      // 캐시 상자
      const slotsBottom = SLOT_TOP + scene.capacity * (SLOT_H + SLOT_GAP) - SLOT_GAP;
      el('rect', {
        x: g.cacheX,
        y: CACHE_TOP,
        width: CACHE_W,
        height: slotsBottom + 10 - CACHE_TOP,
        rx: 8,
        fill: colors.bgSubtle,
        stroke: colors.border,
      });
      label(g.cacheCx, CACHE_TOP + 14, t('label.cache', 'Cache'), { weight: 600 });

      // 길 (선만 — 요청이 지나는 자리)
      el('line', {
        x1: g.x0,
        y1: LANE_Y,
        x2: g.dbX,
        y2: LANE_Y,
        stroke: colors.border,
        'stroke-dasharray': '3 4',
      });

      // 칸
      const cache = scene.run ? scene.run.cache : [];
      const slotX = g.cacheX + 12;
      const slotW = CACHE_W - 24;
      for (let i = 0; i < scene.capacity; i += 1) {
        const y = SLOT_TOP + i * (SLOT_H + SLOT_GAP);
        let key: string | undefined = cache[i];
        let mark: string | null = null;
        if (step && path && i === step.slot) {
          if (step.kind === 'miss') {
            if (d < path.total) key = undefined; // 아직 떨구지 않았다
            else mark = colors.itemComparing;
          } else if (d >= path.leg) {
            mark = colors.accent;
          }
        }
        el('rect', {
          x: slotX,
          y,
          width: slotW,
          height: SLOT_H,
          rx: 4,
          fill: key === undefined ? 'none' : colors.bg,
          stroke: mark ?? colors.border,
          'stroke-width': mark ? 2.5 : 1,
          'stroke-dasharray': key === undefined ? '3 3' : 'none',
        });
        if (key !== undefined) label(slotX + slotW / 2, y + SLOT_H / 2, key, { mono: true, size: fontSizes.xs });
      }
    }

    function drawTrail(scene: CacheHitMissScene, frame: Frame | null): void {
      const step = scene.step;
      if (!step) return;
      const path = pathOf(g, step);
      const d = frame ? frame.d : path.total;
      const color = kindFill(step.kind);
      if (d > 0) {
        el('polyline', {
          points: trailPoints(path, d),
          fill: 'none',
          stroke: color,
          'stroke-width': 3,
          'stroke-linejoin': 'round',
        });
      }
      if (d >= path.total) {
        // 돌아온 끝 — 서버를 가리키는 화살촉
        const ax = g.x0;
        const ay = LANE_Y + TRAIL_OFF;
        el('path', { d: `M ${ax} ${ay} L ${ax + 9} ${ay - 5} L ${ax + 9} ${ay + 5} Z`, fill: color });
        return;
      }
      // 움직이는 요청
      const tip = pointAt(path, d);
      const tok = el('g', { transform: `translate(${r1(tip.x - TOKEN_W / 2)},${r1(tip.y - TOKEN_H / 2)})` });
      el('rect', { width: TOKEN_W, height: TOKEN_H, rx: TOKEN_H / 2, fill: colors.bg, stroke: colors.primary, 'stroke-width': 1.5 }, tok);
      const tx = label(TOKEN_W / 2, TOKEN_H / 2, step.key, { mono: true, size: fontSizes.xs });
      tok.appendChild(tx);

      // 실패 — 돌아오는 길에 캐시를 지나면 키의 사본이 칸으로 내려간다
      if (step.kind === 'miss' && d >= path.backAtCache) {
        const c = clamp01((d - path.backAtCache) / (path.total - path.backAtCache));
        const fromX = g.cacheCx;
        const fromY = LANE_Y + TRAIL_OFF;
        const toY = SLOT_TOP + step.slot * (SLOT_H + SLOT_GAP) + SLOT_H / 2;
        const y = fromY + (toY - fromY) * c;
        const copy = el('g', { transform: `translate(${r1(fromX - TOKEN_W / 2)},${r1(y - TOKEN_H / 2)})` });
        el('rect', { width: TOKEN_W, height: TOKEN_H, rx: 4, fill: colors.bg, stroke: colors.itemComparing, 'stroke-width': 2 }, copy);
        const ct = label(TOKEN_W / 2, TOKEN_H / 2, step.key, { mono: true, size: fontSizes.xs });
        copy.appendChild(ct);
      }
    }

    function drawTotals(scene: CacheHitMissScene, frame: Frame | null): void {
      const run = scene.run;
      if (!run) return;
      const barW = g.W - PAD * 2;
      label(PAD, BAR_LABEL_Y, t('label.counters', 'Total: {total} ms · Hits: {hits} · Misses: {misses}', {
        total: run.total,
        hits: run.hits,
        misses: run.misses,
      }), { anchor: 'start', weight: 600 });

      // 범례
      const legendHit = t('label.hit', 'Hit');
      const legendMiss = t('label.miss', 'Miss');
      const sw = 10;
      const charW = smPx * 0.62;
      const missW = sw + 4 + legendMiss.length * charW;
      const hitW = sw + 4 + legendHit.length * charW;
      const mx = g.W - PAD - missW;
      const hx = mx - 14 - hitW;
      el('rect', { x: r1(hx), y: BAR_LABEL_Y - sw / 2, width: sw, height: sw, rx: 2, fill: colors.accent });
      label(hx + sw + 4, BAR_LABEL_Y, legendHit, { anchor: 'start', fill: colors.textMuted });
      el('rect', { x: r1(mx), y: BAR_LABEL_Y - sw / 2, width: sw, height: sw, rx: 2, fill: colors.itemComparing });
      label(mx + sw + 4, BAR_LABEL_Y, legendMiss, { anchor: 'start', fill: colors.textMuted });

      el('rect', { x: PAD, y: BAR_Y, width: barW, height: BAR_H, rx: 3, fill: colors.bgSubtle, stroke: colors.border });
      const perMs = barW / run.axisMs;
      let x = PAD;
      run.done.forEach((rec, i) => {
        const isStep = scene.step !== null && scene.step.index === i;
        const f = isStep && frame ? frame.seg : 1;
        const w = rec.ms * perMs * f;
        if (w > 0) {
          el('rect', {
            x: r1(x),
            y: BAR_Y,
            width: r1(w),
            height: BAR_H,
            fill: kindFill(rec.kind),
            stroke: colors.bg,
            'stroke-width': 1,
          });
          if (rec.ms * perMs >= 36 && f >= 1) {
            label(x + w / 2, BAR_Y + BAR_H / 2, `${rec.ms}`, { size: fontSizes.xs, fill: colors.stateInk });
          }
        }
        x += rec.ms * perMs;
      });
    }

    function drawCaption(scene: CacheHitMissScene): void {
      const run = scene.run;
      if (!run) return;
      const step = scene.step;
      if (!step) {
        label(g.W / 2, CAPTION_Y, t('caption.start', 'Requests waiting: {n} · Keys in cache: {k}', {
          n: scene.requests.length - run.done.length,
          k: run.cache.length,
        }), { size: fontSizes.md });
        return;
      }
      if (step.kind === 'hit') {
        label(g.W / 2, CAPTION_Y, t('caption.hit', 'Hit: {key} is in the cache — turned back there', { key: step.key }), {
          size: fontSizes.md,
        });
      } else {
        label(
          g.W / 2,
          CAPTION_Y,
          t('caption.miss', 'Miss: {key} is not in the cache — fetched from the DB and kept in the cache', { key: step.key }),
          { size: fontSizes.md },
        );
      }
      label(g.W / 2, CAPTION2_Y, t('caption.took', 'This request: {ms} ms', { ms: step.ms }), { fill: colors.textMuted });
    }

    function drawFrame(scene: CacheHitMissScene, frame: Frame | null): void {
      svg.textContent = '';
      drawQueue(scene, frame);
      drawStations(scene, frame);
      drawTrail(scene, frame);
      drawTotals(scene, frame);
      drawCaption(scene);
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function motion(next: CacheHitMissScene, step: CacheHitMissStep, mine: number): Promise<void> {
      const path = pathOf(g, step);
      const pathMs = Math.round((LONG_PATH_MS * path.total) / pathOf(g, { ...step, kind: 'miss' }).total);
      const totalMs = pathMs + SEG_MS;
      const start = Date.now();
      drawFrame(next, { d: 0, seg: 0 });
      for (;;) {
        await wait(16);
        if (mine !== gen || destroyed) return;
        const elapsed = Date.now() - start;
        if (elapsed >= totalMs) break;
        const d = path.total * clamp01(elapsed / pathMs);
        const seg = clamp01((elapsed - pathMs) / SEG_MS);
        drawFrame(next, { d, seg });
      }
    }

    return {
      async render(next: CacheHitMissScene, _prev: CacheHitMissScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step === null) {
          drawFrame(next, null);
          return;
        }
        await motion(next, next.step, mine);
        if (mine !== gen || destroyed) return;
        drawFrame(next, null);
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
