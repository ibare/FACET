/**
 * invalidate-others 무대 — 위에 DB, 아래에 서버들이 한 줄로 서고 서버마다 캐시 자리 하나.
 *
 * 동사 "무른다, 다시 채워진다" 가 화면에서 일어나는 방식
 * - 쓰기: 새 값 조각이 아래에서 쓴 서버의 자리로 올라가고, 거기서 DB 로 올라간다. 다른 자리는 옛값으로 남는다.
 * - 무효화: 값 없는 "버려라" 쪽지가 쓴 서버에서 서버 줄 아래로 휘어 건너가 다른 서버마다 닿는다.
 *   닿은 자리의 사본은 새 값이 되지 않고 오그라들며 떨어져 사라진다.
 * - 읽기 실패: 읽기가 올라오고, 서버가 줄을 타고 DB 로 가고, DB 의 값이 내려와 빈 자리를 채운다.
 * - 읽기 적중: 자리의 값이 아래 읽는 쪽으로 내려간다.
 */
import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { InvalidateOthersScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 336;
const W = PIECE_CANVAS_W;
const PAD = 24;

const CAPTION_Y = 26;
const DB_W = 188;
const DB_H = 60;
const DB_Y = 46;
const SERVER_Y = 160;
const BOX_H = 96;
const BOX_GAP = 18;
const BOX_MAX_W = 150;
const SLOT_TOP = 28;
const SLOT_H = 40;
const LANE_Y = SERVER_Y + BOX_H; // 서버 줄 아래 가장자리
const MARK_FOOT = H - 30; // 쓰기 · 읽기가 올라오는 자리
const TAG_Y = H - 10;

const WRITE_MS = 760;
const INVALIDATE_MS = 800;
const MISS_MS = 780;
const HIT_MS = 700;

type Hold = {
  /** DB 칸에 아직 옛 값을 둔다 */
  dbValue?: number;
  /** 이 서버의 자리를 아직 이 값(또는 빈 자리)으로 둔다 */
  slot?: { server: string; value: number | null };
  /** 옛값 표시를 아직 두지 않는다 */
  hideStale?: boolean;
  /** 이번 걸음 표시(쓰기 · 읽기 화살과 꼬리표)를 아직 두지 않는다 */
  hideMark?: boolean;
  /** 사본 계기에 아직 이 수를 둔다 */
  held?: number;
};

function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(q: number): number {
  return q < 0.5 ? 2 * q * q : 1 - 2 * (1 - q) * (1 - q);
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  s: string,
  fill: string,
  size: string,
  opts: { anchor?: 'start' | 'middle' | 'end'; weight?: string; mono?: boolean } = {},
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    fill,
    'font-family': opts.mono ? fonts.mono : fonts.body,
    'font-size': size,
    'text-anchor': opts.anchor ?? 'start',
  });
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = s;
  return node;
}

/** 서버 줄 — 폭을 채우되 상자 하나는 상한을 넘지 않는다 */
function serverLayout(n: number): { x: number; w: number }[] {
  const w = Math.min(BOX_MAX_W, (W - 2 * PAD - (n - 1) * BOX_GAP) / n);
  const total = n * w + (n - 1) * BOX_GAP;
  const left = (W - total) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: left + i * (w + BOX_GAP), w }));
}

/** 무효화 쪽지가 지나는 길 — 서버 줄 아래로 휜다. 멀수록 깊다 */
function arc(x0: number, x1: number, dist: number): { cx: number; cy: number } {
  return { cx: (x0 + x1) / 2, cy: LANE_Y + 24 + 16 * dist };
}

function onArc(x0: number, x1: number, dist: number, q: number): { x: number; y: number } {
  const { cx, cy } = arc(x0, x1, dist);
  const a = (1 - q) * (1 - q);
  const b = 2 * (1 - q) * q;
  const c = q * q;
  return { x: a * x0 + b * cx + c * x1, y: a * LANE_Y + b * cy + c * LANE_Y };
}

export const invalidateOthersStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    svg.textContent = '';
    const staticG = el(svg, 'g', {});
    const fxG = el(svg, 'g', {});

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function slotCenter(scene: InvalidateOthersScene, server: string): { x: number; y: number } {
      const i = scene.servers.indexOf(server);
      if (i < 0) throw new Error(`invalidate-others 무대: 서버 ${server} 가 장면에 없다`);
      const box = serverLayout(scene.servers.length)[i];
      if (!box) throw new Error(`invalidate-others 무대: 서버 ${server} 의 자리를 셈하지 못했다`);
      return { x: box.x + box.w / 2, y: SERVER_Y + SLOT_TOP + SLOT_H / 2 };
    }

    function serverIndex(scene: InvalidateOthersScene, server: string): number {
      const i = scene.servers.indexOf(server);
      if (i < 0) throw new Error(`invalidate-others 무대: 서버 ${server} 가 장면에 없다`);
      return i;
    }

    function arrowUp(parent: Element, x: number, yFrom: number, yTo: number, stroke: string): void {
      el(parent, 'line', { x1: x, y1: yFrom, x2: x, y2: yTo + 6, stroke, 'stroke-width': 1.5 });
      el(parent, 'path', { d: `M ${r(x - 5)} ${r(yTo + 8)} L ${r(x)} ${r(yTo)} L ${r(x + 5)} ${r(yTo + 8)} Z`, fill: stroke });
    }

    function drawStatic(scene: InvalidateOthersScene, hold: Hold = {}): void {
      staticG.textContent = '';
      const boxes = serverLayout(scene.servers.length);
      const dbX = W / 2 - DB_W / 2;
      const step = scene.step;

      // 줄 — DB 와 서버를 잇는다. 읽기 실패의 걸음이면 그 줄이 DB 에 다녀온 길이다
      scene.servers.forEach((s, i) => {
        const box = boxes[i];
        if (!box) throw new Error(`invalidate-others 무대: 서버 ${s} 의 자리를 셈하지 못했다`);
        const active = !hold.hideMark && step.kind === 'read' && !step.hit && step.server === s;
        el(staticG, 'line', {
          x1: W / 2,
          y1: DB_Y + DB_H,
          x2: box.x + box.w / 2,
          y2: SERVER_Y,
          stroke: active ? c.itemActive : c.border,
          'stroke-width': active ? 2.5 : 1,
        });
      });

      // 캡션 — 지금 일어나는 일
      let caption: string;
      switch (step.kind) {
        case 'init':
          caption = t('caption.init', 'Every server caches a copy of {key}', { key: scene.key });
          break;
        case 'write':
          caption = t('caption.write', 'Write at server {server} · New value: {value} · Stale copies: {n}', {
            server: step.server,
            value: step.value,
            n: scene.stale.length,
          });
          break;
        case 'invalidate':
          caption = t('caption.invalidate', 'Server {from} sends "drop" with no value · Messages: {n}', {
            from: step.from,
            n: step.targets.length,
          });
          break;
        case 'read':
          caption = step.hit
            ? t('caption.hit', 'Read at server {server}: hit · Value: {value}', { server: step.server, value: step.value })
            : t('caption.miss', 'Read at server {server}: miss, refilled from the DB · Value: {value}', {
                server: step.server,
                value: step.value,
              });
          break;
      }
      label(staticG, PAD, CAPTION_Y, caption, c.text, fontSizes.md, { weight: '600' });

      // DB
      el(staticG, 'rect', { x: dbX, y: DB_Y, width: DB_W, height: DB_H, rx: 6, fill: c.bg, stroke: c.text, 'stroke-width': 1.5 });
      label(staticG, dbX + 10, DB_Y + 18, t('label.db', 'DB'), c.textMuted, fontSizes.xs, { weight: '600' });
      label(staticG, dbX + DB_W - 10, DB_Y + 18, scene.key, c.textMuted, fontSizes.xs, { anchor: 'end', mono: true });
      label(staticG, W / 2, DB_Y + 48, String(hold.dbValue ?? scene.db), c.text, fontSizes.xl, {
        anchor: 'middle',
        weight: '700',
        mono: true,
      });

      // 계기 — 알고리즘이 셈한 수
      const held = hold.held ?? scene.held;
      if (held !== null) {
        label(staticG, dbX - 18, DB_Y + 22, t('counter.held', 'Copies held'), c.textMuted, fontSizes.xs, { anchor: 'end' });
        label(staticG, dbX - 18, DB_Y + 46, String(held), c.text, fontSizes.xl, { anchor: 'end', weight: '700', mono: true });
      }
      if (scene.dbReads !== null) {
        label(staticG, dbX + DB_W + 18, DB_Y + 22, t('counter.dbReads', 'Reads sent to the DB'), c.textMuted, fontSizes.xs);
        label(staticG, dbX + DB_W + 18, DB_Y + 46, String(scene.dbReads), c.text, fontSizes.xl, { weight: '700', mono: true });
      }

      // 서버와 캐시 자리
      scene.servers.forEach((s, i) => {
        const box = boxes[i];
        if (!box) throw new Error(`invalidate-others 무대: 서버 ${s} 의 자리를 셈하지 못했다`);
        const value = hold.slot && hold.slot.server === s ? hold.slot.value : scene.slots[i];
        if (value === undefined) throw new Error(`invalidate-others 무대: 서버 ${s} 의 자리가 장면에 없다`);
        const stale = !hold.hideStale && scene.stale.includes(s);
        el(staticG, 'rect', { x: box.x, y: SERVER_Y, width: box.w, height: BOX_H, rx: 6, fill: c.bgSubtle, stroke: c.border });
        label(staticG, box.x + box.w / 2, SERVER_Y + 18, t('label.server', 'Server {id}', { id: s }), c.text, fontSizes.sm, {
          anchor: 'middle',
          weight: '600',
        });
        const sx = box.x + 12;
        const sy = SERVER_Y + SLOT_TOP;
        const sw = box.w - 24;
        if (value === null) {
          el(staticG, 'rect', {
            x: sx,
            y: sy,
            width: sw,
            height: SLOT_H,
            rx: 4,
            fill: 'none',
            stroke: c.textMuted,
            'stroke-dasharray': '4 3',
          });
          label(staticG, sx + sw / 2, sy + SLOT_H / 2 + 4, t('label.empty', 'empty'), c.textMuted, fontSizes.xs, {
            anchor: 'middle',
          });
        } else {
          el(staticG, 'rect', {
            x: sx,
            y: sy,
            width: sw,
            height: SLOT_H,
            rx: 4,
            fill: c.bg,
            stroke: stale ? c.danger : c.text,
            'stroke-width': stale ? 2.5 : 1.2,
          });
          label(staticG, sx + sw / 2, sy + SLOT_H / 2 + 6, String(value), stale ? c.danger : c.text, fontSizes.lg, {
            anchor: 'middle',
            weight: '700',
            mono: true,
          });
        }
        if (stale) {
          label(staticG, box.x + box.w / 2, SERVER_Y + BOX_H - 10, t('label.stale', 'stale'), c.danger, fontSizes.xs, {
            anchor: 'middle',
            weight: '600',
          });
        }
      });

      // 이번 걸음의 표시
      if (hold.hideMark) return;
      if (step.kind === 'write') {
        const at = slotCenter(scene, step.server);
        arrowUp(staticG, at.x, MARK_FOOT, LANE_Y + 4, c.textMuted);
        label(staticG, at.x, TAG_Y, t('mark.write', 'Write: {value}', { value: step.value }), c.text, fontSizes.sm, {
          anchor: 'middle',
          weight: '600',
        });
      } else if (step.kind === 'read') {
        const at = slotCenter(scene, step.server);
        arrowUp(staticG, at.x, MARK_FOOT, LANE_Y + 4, c.textMuted);
        const tag = step.hit
          ? t('mark.hit', 'Hit: {value}', { value: step.value })
          : t('mark.miss', 'Miss: {value}', { value: step.value });
        label(staticG, at.x, TAG_Y, tag, step.stale ? c.danger : step.hit ? c.text : c.itemComparing, fontSizes.sm, {
          anchor: 'middle',
          weight: '600',
        });
      } else if (step.kind === 'invalidate') {
        const from = serverIndex(scene, step.from);
        const x0 = slotCenter(scene, step.from).x;
        for (const tg of step.targets) {
          const to = serverIndex(scene, tg.server);
          const x1 = slotCenter(scene, tg.server).x;
          const { cx, cy } = arc(x0, x1, Math.abs(to - from));
          el(staticG, 'path', {
            d: `M ${r(x0)} ${r(LANE_Y)} Q ${r(cx)} ${r(cy)} ${r(x1)} ${r(LANE_Y + 8)}`,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 2.5,
          });
          el(staticG, 'path', {
            d: `M ${r(x1 - 5)} ${r(LANE_Y + 9)} L ${r(x1)} ${r(LANE_Y + 1)} L ${r(x1 + 5)} ${r(LANE_Y + 9)} Z`,
            fill: c.accent,
          });
        }
      }
    }

    /** 값 조각 — 움직이는 새 값 */
    function valueChip(value: number): SVGGElement {
      const g = el(fxG, 'g', {});
      el(g, 'rect', { x: -16, y: -13, width: 32, height: 26, rx: 5, fill: c.primary });
      label(g, 0, 5, String(value), c.textInverse, fontSizes.md, { anchor: 'middle', weight: '700', mono: true });
      return g;
    }

    function place(node: Element, x: number, y: number, scale = 1): void {
      node.setAttribute('transform', scale === 1 ? `translate(${r(x)} ${r(y)})` : `translate(${r(x)} ${r(y)}) scale(${r(scale)})`);
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
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
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            done();
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

    async function animateWrite(mine: number, scene: InvalidateOthersScene): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'write') throw new Error('invalidate-others 무대: 쓰기 운동에 쓰기 걸음이 아니다');
      const at = slotCenter(scene, step.server);
      drawStatic(scene, { dbValue: step.wasDb, slot: { server: step.server, value: step.wasSlot }, hideStale: true });
      const chip = valueChip(step.value);
      let landed = false;
      const up = LANE_Y + 20;
      await tween(mine, WRITE_MS, (p) => {
        if (p < 0.45) {
          const q = ease(p / 0.45);
          place(chip, at.x, up + (at.y - up) * q);
          return;
        }
        if (!landed) {
          landed = true;
          drawStatic(scene, { dbValue: step.wasDb, hideStale: true });
        }
        const q = ease((p - 0.45) / 0.55);
        const dbY = DB_Y + DB_H / 2 + 6;
        place(chip, at.x + (W / 2 - at.x) * q, at.y + (dbY - at.y) * q);
      });
    }

    async function animateInvalidate(mine: number, scene: InvalidateOthersScene): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'invalidate') throw new Error('invalidate-others 무대: 무효화 운동에 무효화 걸음이 아니다');
      drawStatic(scene, { held: step.heldBefore });
      const from = serverIndex(scene, step.from);
      const x0 = slotCenter(scene, step.from).x;
      const boxes = serverLayout(scene.servers.length);
      const dropWord = t('label.drop', 'drop');
      const noteW = Math.max(40, dropWord.length * 8 + 14);
      const items = step.targets.map((tg) => {
        const to = serverIndex(scene, tg.server);
        const box = boxes[to];
        if (!box) throw new Error(`invalidate-others 무대: 서버 ${tg.server} 의 자리를 셈하지 못했다`);
        const at = slotCenter(scene, tg.server);
        // 사라질 사본 — 받은 자리의 옛값
        const ghost = el(fxG, 'g', {});
        const gw = box.w - 24;
        el(ghost, 'rect', { x: -gw / 2, y: -SLOT_H / 2, width: gw, height: SLOT_H, rx: 4, fill: c.bg, stroke: c.danger, 'stroke-width': 2.5 });
        label(ghost, 0, 6, String(tg.was), c.danger, fontSizes.lg, { anchor: 'middle', weight: '700', mono: true });
        place(ghost, at.x, at.y);
        // "버려라" 쪽지 — 값을 싣지 않는다
        const note = el(fxG, 'g', {});
        el(note, 'rect', { x: -noteW / 2, y: -10, width: noteW, height: 20, rx: 4, fill: c.accent });
        label(note, 0, 4, dropWord, c.stateInk, fontSizes.xs, { anchor: 'middle', weight: '700' });
        return { ghost, note, at, x1: at.x, dist: Math.abs(to - from) };
      });
      let dropped = false;
      await tween(mine, INVALIDATE_MS, (p) => {
        const a = ease(Math.min(1, p / 0.6));
        const b = p <= 0.6 ? 0 : ease((p - 0.6) / 0.4);
        if (b > 0 && !dropped) {
          dropped = true;
          drawStatic(scene);
        }
        for (const it of items) {
          const pos = onArc(x0, it.x1, it.dist, a);
          place(it.note, pos.x, pos.y, 1 - 0.4 * b);
          // 닿으면 오그라들며 아래로 떨어진다
          place(it.ghost, it.at.x, it.at.y + 34 * b, Math.max(0.02, 1 - b));
        }
      });
    }

    async function animateRead(mine: number, scene: InvalidateOthersScene): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'read') throw new Error('invalidate-others 무대: 읽기 운동에 읽기 걸음이 아니다');
      const at = slotCenter(scene, step.server);
      const foot = MARK_FOOT;
      const reqLine = el(fxG, 'line', { x1: at.x, y1: foot, x2: at.x, y2: foot, stroke: c.textMuted, 'stroke-width': 1.5 });
      if (step.hit) {
        drawStatic(scene, { hideMark: true });
        const chip = valueChip(step.value);
        chip.setAttribute('visibility', 'hidden');
        await tween(mine, HIT_MS, (p) => {
          const a = ease(Math.min(1, p / 0.35));
          reqLine.setAttribute('y2', String(r(foot + (LANE_Y + 4 - foot) * a)));
          if (p <= 0.35) return;
          chip.removeAttribute('visibility');
          const q = ease((p - 0.35) / 0.65);
          place(chip, at.x, at.y + (LANE_Y + 26 - at.y) * q);
        });
        return;
      }
      drawStatic(scene, { slot: { server: step.server, value: null }, hideMark: true });
      const dot = el(fxG, 'circle', { cx: 0, cy: 0, r: 5, fill: c.itemActive, visibility: 'hidden' });
      const chip = valueChip(step.value);
      chip.setAttribute('visibility', 'hidden');
      const dbFoot = { x: W / 2, y: DB_Y + DB_H };
      let filled = false;
      await tween(mine, MISS_MS, (p) => {
        const a = ease(Math.min(1, p / 0.25));
        reqLine.setAttribute('y2', String(r(foot + (LANE_Y + 4 - foot) * a)));
        if (p <= 0.25) return;
        if (p <= 0.5) {
          // 서버가 줄을 타고 DB 로 간다
          const q = ease((p - 0.25) / 0.25);
          dot.removeAttribute('visibility');
          dot.setAttribute('cx', String(r(at.x + (dbFoot.x - at.x) * q)));
          dot.setAttribute('cy', String(r(SERVER_Y + (dbFoot.y - SERVER_Y) * q)));
          return;
        }
        dot.setAttribute('visibility', 'hidden');
        if (p <= 0.92) {
          // DB 의 값이 내려와 빈 자리를 채운다
          const q = ease((p - 0.5) / 0.42);
          chip.removeAttribute('visibility');
          place(chip, dbFoot.x + (at.x - dbFoot.x) * q, dbFoot.y + (at.y - dbFoot.y) * q);
          return;
        }
        if (!filled) {
          filled = true;
          chip.setAttribute('visibility', 'hidden');
          drawStatic(scene);
        }
      });
    }

    return {
      render(next: InvalidateOthersScene, prev: InvalidateOthersScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        fxG.textContent = '';
        drawStatic(next);
        if (!opts.animate || prev === null || destroyed) return;
        const kind = next.step.kind;
        const run =
          kind === 'write'
            ? animateWrite(mine, next)
            : kind === 'invalidate'
              ? animateInvalidate(mine, next)
              : kind === 'read'
                ? animateRead(mine, next)
                : null;
        if (run === null) return;
        return run.then(() => {
          if (mine !== gen || destroyed) return;
          fxG.textContent = '';
          drawStatic(next);
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
