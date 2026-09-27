/**
 * 에라토스테네스의 체 — 무대.
 *
 * 판 2..N 을 열 칸씩 놓는다. 소수 p 의 차례가 오면 p 표지가 배수를 차례로 뛰어 짚는다.
 * 짚은 칸이 이미 지워져 있으면 그 칸의 지운 이(색과 글자)를 테 두르고, 안 지워졌으면 p 의 색으로 긋는다.
 * p × p 앞 구역을 옅게 칠하고 그 끝에 울타리를 세운다 — 구역 안의 배수는 모두 이미 지워진 칸이다.
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
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SieveScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 430;
const MARGIN = 20;
const COLS = 10;
const GAP = 4;
const CELL_H_MAX = 40;
const CELL_W_MAX = 58;
const BOARD_TOP = 78;
const BOARD_MAX_H = 262;
const CHIP_W_MAX = 116;
const CHIP_H = 40;
const ZONE_MS = 300;
const HOP_MS = 1100;
const STOP_SWEEP_MS = 700;
const STOP_MS = 900;
const FRAME_MS = 16;
const ZONE_OPACITY = 0.16;
/** 멈춤의 구역은 판 전체라 옅게 — 남은 소수의 채움을 흐리지 않게 */
const STOP_ZONE_OPACITY = 0.06;

type Box = { x: number; y: number; w: number; h: number };

type Handles = {
  zones: SVGRectElement[];
  fence: SVGLineElement | null;
  slashes: Map<number, { el: SVGLineElement; len: number }>;
  tags: Map<number, SVGTextElement>;
  rings: Map<number, SVGRectElement>;
  chips: Map<number, SVGGElement>;
  primeFills: SVGRectElement[];
  primeTexts: SVGTextElement[];
  anim: SVGGElement | null;
};

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  str: string,
  size: string,
  fill: string,
  anchor: 'start' | 'middle' | 'end',
  weight = 'normal',
  family: string = fonts.body,
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': family,
    'font-size': size,
    'font-weight': weight,
    fill,
    'text-anchor': anchor,
  });
  node.textContent = str;
  return node;
}

export const sieveOfEratosthenesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles: Handles = emptyHandles();

    function emptyHandles(): Handles {
      return {
        zones: [],
        fence: null,
        slashes: new Map(),
        tags: new Map(),
        rings: new Map(),
        chips: new Map(),
        primeFills: [],
        primeTexts: [],
        anim: null,
      };
    }

    function geometry(scene: SieveScene): { cellW: number; cellH: number; x0: number; rows: number } {
      const rows = Math.ceil(scene.n / COLS);
      const cellW = Math.min(CELL_W_MAX, (PIECE_CANVAS_W - 2 * MARGIN - (COLS - 1) * GAP) / COLS);
      const cellH = Math.min(CELL_H_MAX, (BOARD_MAX_H - (rows - 1) * GAP) / rows);
      const x0 = (PIECE_CANVAS_W - (COLS * cellW + (COLS - 1) * GAP)) / 2;
      return { cellW, cellH, x0, rows };
    }

    function boxOf(scene: SieveScene, m: number): Box {
      if (!scene.cells.includes(m)) throw new Error(`sieve-of-eratosthenes stage: ${m} 가 판에 없다`);
      const g = geometry(scene);
      const col = (m - 1) % COLS;
      const row = Math.floor((m - 1) / COLS);
      return { x: g.x0 + col * (g.cellW + GAP), y: BOARD_TOP + row * (g.cellH + GAP), w: g.cellW, h: g.cellH };
    }

    function colorOf(scene: SieveScene, p: number): string {
      if (scene.sieving === null) throw new Error('sieve-of-eratosthenes stage: 차례 목록(init) 없이 색을 찾았다');
      const i = scene.sieving.indexOf(p);
      if (i < 0) throw new Error(`sieve-of-eratosthenes stage: ${p} 가 차례 목록에 없다`);
      const palette = categorical(scene.sieving.length, 'vivid');
      const c = palette[i];
      if (c === undefined) throw new Error(`sieve-of-eratosthenes stage: ${p} 의 색이 없다`);
      return c;
    }

    function drawCaption(scene: SieveScene, layer: SVGGElement): void {
      const step = scene.step;
      const lines: string[] = [];
      if (step.kind === 'board') {
        const from = scene.cells[0];
        const to = scene.cells[scene.cells.length - 1];
        if (from === undefined || to === undefined) throw new Error('sieve-of-eratosthenes stage: 판이 비었다');
        lines.push(
          t('caption.board', 'Board {from}–{to} · cells: {cells}', { from, to, cells: scene.cells.length }),
          t('caption.struck', 'Crossed out: {total}', { total: scene.struck.length }),
        );
      } else if (step.kind === 'sieve') {
        const before = step.hits.filter((h) => h.n < step.sq);
        const already = before.filter((h) => h.by !== step.p).length;
        const fresh = step.hits.filter((h) => h.by === step.p).length;
        lines.push(
          t('caption.turn', 'Prime {p}: first new cross-out at {p} × {p} = {sq}', { p: step.p, sq: step.sq }),
          t('caption.before', 'Multiples before {sq}: {before} · already crossed out: {already}', {
            sq: step.sq,
            before: before.length,
            already,
          }),
          t('caption.fresh', 'Newly crossed out: {fresh} · crossed out so far: {total}', {
            fresh,
            total: scene.struck.length,
          }),
        );
      } else {
        lines.push(
          t('caption.stop', 'Next prime {p}: {p} × {p} = {sq} > {n} · stop', {
            p: step.p,
            sq: step.sq,
            n: scene.n,
          }),
          t('caption.left', 'Primes left: {left} · crossed out: {total}', {
            left: step.primes.length,
            total: scene.struck.length,
          }),
        );
      }
      lines.forEach((line, i) => {
        label(
          layer,
          MARGIN,
          22 + i * 20,
          line,
          i === 0 ? fontSizes.md : fontSizes.sm,
          i === 0 ? colors.text : colors.textMuted,
          'start',
          i === 0 ? '600' : 'normal',
        );
      });
    }

    function drawStatic(scene: SieveScene): void {
      svg.textContent = '';
      handles = emptyHandles();
      const step = scene.step;
      const struckBy = new Map<number, number>();
      for (const s of scene.struck) struckBy.set(s.n, s.by);
      const hitBy = new Map<number, number>();
      if (step.kind === 'sieve') for (const h of step.hits) hitBy.set(h.n, h.by);
      const primesLeft = step.kind === 'stop' ? step.primes : [];
      const current = step.kind === 'board' ? null : step.p;

      const gCells = el(svg, 'g', {});
      const gZone = el(svg, 'g', {});
      const gMarks = el(svg, 'g', {});
      const gFence = el(svg, 'g', {});
      const gCaption = el(svg, 'g', {});
      const gStrip = el(svg, 'g', {});
      handles.anim = el(svg, 'g', {});

      // 칸
      for (const m of scene.cells) {
        const b = boxOf(scene, m);
        const by = struckBy.get(m);
        const isPrimeLeft = primesLeft.includes(m);
        el(gCells, 'rect', {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          rx: 5,
          fill: by === undefined ? colors.bgSubtle : colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
        });
        if (isPrimeLeft) {
          handles.primeFills.push(
            el(gCells, 'rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 5, fill: colors.accent }),
          );
        }
        const num = label(
          gCells,
          b.x + b.w / 2,
          b.y + b.h / 2 + 5,
          String(m),
          fontSizes.md,
          by !== undefined ? colors.textMuted : isPrimeLeft ? colors.stateInk : colors.text,
          'middle',
          by === undefined ? '600' : 'normal',
          fonts.mono,
        );
        if (isPrimeLeft) handles.primeTexts.push(num);
      }

      // p × p 앞 구역과 울타리
      if (step.kind !== 'board') {
        const zoneColor = step.kind === 'sieve' ? colorOf(scene, step.p) : colors.primary;
        for (const m of scene.cells) {
          if (m >= step.sq) break;
          const b = boxOf(scene, m);
          handles.zones.push(
            el(gZone, 'rect', {
              x: b.x - GAP / 2,
              y: b.y - GAP / 2,
              width: b.w + GAP,
              height: b.h + GAP,
              fill: zoneColor,
              'fill-opacity': step.kind === 'sieve' ? ZONE_OPACITY : STOP_ZONE_OPACITY,
            }),
          );
        }
        const edge = fenceEdge(scene, step.sq);
        handles.fence = el(gFence, 'line', {
          x1: edge.x,
          y1: edge.y - 5,
          x2: edge.x,
          y2: edge.y + edge.h + 5,
          stroke: zoneColor,
          'stroke-width': 4,
          'stroke-linecap': 'round',
        });
      }

      // 지운 표시 · 지운 이
      for (const s of scene.struck) {
        const b = boxOf(scene, s.n);
        const c = colorOf(scene, s.by);
        const x1 = b.x + 7;
        const y1 = b.y + b.h - 7;
        const x2 = b.x + b.w - 7;
        const y2 = b.y + 7;
        const len = r2(Math.hypot(x2 - x1, y2 - y1));
        const slash = el(gMarks, 'line', {
          x1,
          y1,
          x2,
          y2,
          stroke: c,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
          'stroke-dasharray': len,
          'stroke-dashoffset': 0,
        });
        const tag = label(gMarks, b.x + b.w - 4, b.y + 11, String(s.by), fontSizes.xs, c, 'end', '700', fonts.mono);
        if (step.kind === 'sieve' && hitBy.get(s.n) === step.p) {
          handles.slashes.set(s.n, { el: slash, len });
          handles.tags.set(s.n, tag);
        }
      }

      // 차례를 마친 소수와 지금 소수의 테
      for (const p of scene.done) {
        const b = boxOf(scene, p);
        el(gMarks, 'rect', {
          x: b.x + 1.5,
          y: b.y + 1.5,
          width: b.w - 3,
          height: b.h - 3,
          rx: 4,
          fill: 'none',
          stroke: colorOf(scene, p),
          'stroke-width': p === current ? 3.5 : 2,
        });
      }
      if (step.kind === 'stop') {
        const b = boxOf(scene, step.p);
        el(gMarks, 'rect', {
          x: b.x - 1,
          y: b.y - 1,
          width: b.w + 2,
          height: b.h + 2,
          rx: 6,
          fill: 'none',
          stroke: colors.primary,
          'stroke-width': 3,
        });
      }

      // 이번 차례에 짚었으나 이미 지워져 있던 칸
      if (step.kind === 'sieve') {
        const c = colorOf(scene, step.p);
        for (const h of step.hits) {
          if (h.by === step.p) continue;
          const b = boxOf(scene, h.n);
          handles.rings.set(
            h.n,
            el(gMarks, 'rect', {
              x: b.x - 1,
              y: b.y - 1,
              width: b.w + 2,
              height: b.h + 2,
              rx: 6,
              fill: 'none',
              stroke: c,
              'stroke-width': 2,
              'stroke-dasharray': '4 3',
            }),
          );
        }
        drawStrip(scene, step.p, step.sq, step.hits.filter((h) => h.n < step.sq), gStrip);
      }

      drawCaption(scene, gCaption);
    }

    function drawStrip(
      scene: SieveScene,
      p: number,
      sq: number,
      before: Array<{ n: number; k: number; by: number }>,
      layer: SVGGElement,
    ): void {
      const g = geometry(scene);
      const top = BOARD_TOP + g.rows * g.cellH + (g.rows - 1) * GAP + 26;
      label(layer, MARGIN, top, t('label.before', 'Before {sq}: {p} × k, k < {p}', { sq, p }), fontSizes.sm, colors.textMuted, 'start');
      const avail = PIECE_CANVAS_W - 2 * MARGIN;
      const chipW = Math.min(CHIP_W_MAX, before.length > 0 ? (avail - (before.length - 1) * 8) / before.length : CHIP_W_MAX);
      before.forEach((h, i) => {
        const c = colorOf(scene, h.by);
        const x = MARGIN + i * (chipW + 8);
        const y = top + 10;
        const chip = el(layer, 'g', {});
        el(chip, 'rect', { x, y, width: chipW, height: CHIP_H, rx: 5, fill: colors.bgSubtle, stroke: c, 'stroke-width': 1.5 });
        el(chip, 'rect', { x, y, width: 5, height: CHIP_H, fill: c });
        label(chip, x + 12, y + 17, t('label.product', '{p} × {k} = {m}', { p, k: h.k, m: h.n }), fontSizes.sm, colors.text, 'start', '600', fonts.mono);
        label(chip, x + 12, y + 33, t('label.by', 'by {p}', { p: h.by }), fontSizes.xs, c, 'start', '700');
        handles.chips.set(h.n, chip);
      });
    }

    /** 울타리 자리 — sq 칸의 왼쪽 끝. sq 가 판 밖이면 마지막 칸의 오른쪽 끝. */
    function fenceEdge(scene: SieveScene, sq: number): { x: number; y: number; h: number } {
      if (sq <= scene.n) {
        const b = boxOf(scene, sq);
        return { x: b.x - GAP / 2, y: b.y, h: b.h };
      }
      const last = scene.cells[scene.cells.length - 1];
      if (last === undefined) throw new Error('sieve-of-eratosthenes stage: 판이 비었다');
      const b = boxOf(scene, last);
      return { x: b.x + b.w + GAP / 2, y: b.y, h: b.h };
    }

    function placeFence(fence: SVGLineElement, edge: { x: number; y: number; h: number }): void {
      fence.setAttribute('x1', String(r2(edge.x)));
      fence.setAttribute('x2', String(r2(edge.x)));
      fence.setAttribute('y1', String(r2(edge.y - 5)));
      fence.setAttribute('y2', String(r2(edge.y + edge.h + 5)));
    }

    /** 구역 앞머리의 울타리 — 앞에서 count 칸이 칠해졌을 때. */
    function frontEdge(scene: SieveScene, count: number, sq: number): { x: number; y: number; h: number } {
      const nextCell = scene.cells[count];
      if (nextCell !== undefined && nextCell <= sq) {
        const b = boxOf(scene, nextCell);
        return { x: b.x - GAP / 2, y: b.y, h: b.h };
      }
      return fenceEdge(scene, sq);
    }

    function runClock(mine: number, total: number, apply: (ms: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const ms = Math.min(total, Date.now() - start);
          apply(ms);
          if (ms >= total) {
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

    function animateSieve(scene: SieveScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'sieve') throw new Error('sieve-of-eratosthenes stage: 차례 운동에 차례 장면이 아니다');
      const h = handles;
      const fence = h.fence;
      const anim = h.anim;
      if (fence === null || anim === null) throw new Error('sieve-of-eratosthenes stage: 울타리 · 운동 층이 없다');
      const color = colorOf(scene, step.p);

      // 아직 못 온 만큼으로 되돌린다
      for (const z of h.zones) z.setAttribute('opacity', '0');
      for (const { el: s, len } of h.slashes.values()) s.setAttribute('stroke-dashoffset', String(len));
      for (const tag of h.tags.values()) tag.setAttribute('opacity', '0');
      for (const ring of h.rings.values()) ring.setAttribute('opacity', '0');
      for (const chip of h.chips.values()) chip.setAttribute('opacity', '0');
      placeFence(fence, frontEdge(scene, 0, step.sq));

      const centre = (m: number): { x: number; y: number } => {
        const b = boxOf(scene, m);
        return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      };
      const token = el(anim, 'g', {});
      el(token, 'circle', { cx: 0, cy: 0, r: 13, fill: color, stroke: colors.bg, 'stroke-width': 2 });
      label(token, 0, 5, String(step.p), fontSizes.md, colors.stateInk, 'middle', '700', fonts.mono);
      const moveToken = (x: number, y: number): void => {
        token.setAttribute('transform', `translate(${r2(x)} ${r2(y)})`);
      };
      const home = centre(step.p);
      moveToken(home.x, home.y);

      const hits = step.hits;
      const reveal = (i: number): void => {
        const hit = hits[i];
        if (hit === undefined) throw new Error(`sieve-of-eratosthenes stage: 짚을 칸 ${i} 가 없다`);
        if (hit.by === step.p) {
          const s = h.slashes.get(hit.n);
          const tag = h.tags.get(hit.n);
          if (s === undefined || tag === undefined) throw new Error(`sieve-of-eratosthenes stage: ${hit.n} 의 긋기 손잡이가 없다`);
          s.el.setAttribute('stroke-dashoffset', '0');
          tag.removeAttribute('opacity');
        } else {
          const ring = h.rings.get(hit.n);
          if (ring === undefined) throw new Error(`sieve-of-eratosthenes stage: ${hit.n} 의 테 손잡이가 없다`);
          ring.removeAttribute('opacity');
          const chip = h.chips.get(hit.n);
          if (chip !== undefined) chip.removeAttribute('opacity');
          else if (hit.n < step.sq) throw new Error(`sieve-of-eratosthenes stage: ${hit.n} 의 쪽지 손잡이가 없다`);
        }
      };

      let shownZones = 0;
      let revealed = 0;
      return runClock(mine, ZONE_MS + HOP_MS, (ms) => {
        const zoneCount = Math.min(h.zones.length, Math.floor((h.zones.length * ms) / ZONE_MS));
        while (shownZones < zoneCount) {
          h.zones[shownZones]?.removeAttribute('opacity');
          shownZones += 1;
        }
        placeFence(fence, frontEdge(scene, shownZones, step.sq));

        const u = ms - ZONE_MS;
        if (u < 0 || hits.length === 0) return;
        const d = HOP_MS / hits.length;
        const arrived = Math.min(hits.length, Math.floor(u / d));
        while (revealed < arrived) {
          reveal(revealed);
          revealed += 1;
        }
        if (arrived >= hits.length) {
          const last = hits[hits.length - 1];
          if (last === undefined) throw new Error('sieve-of-eratosthenes stage: 마지막 칸이 없다');
          const end = centre(last.n);
          moveToken(end.x, end.y);
          return;
        }
        const target = hits[arrived];
        if (target === undefined) throw new Error(`sieve-of-eratosthenes stage: 짚을 칸 ${arrived} 가 없다`);
        const fromHit = arrived === 0 ? null : hits[arrived - 1];
        const from = fromHit === null || fromHit === undefined ? home : centre(fromHit.n);
        const to = centre(target.n);
        const f = (u - arrived * d) / d;
        const lift = 16 * Math.sin(Math.PI * f);
        moveToken(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f - lift);
      });
    }

    function animateStop(scene: SieveScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'stop') throw new Error('sieve-of-eratosthenes stage: 멈춤 운동에 멈춤 장면이 아니다');
      const h = handles;
      const fence = h.fence;
      if (fence === null) throw new Error('sieve-of-eratosthenes stage: 울타리가 없다');
      for (const z of h.zones) z.setAttribute('opacity', '0');
      for (const f of h.primeFills) f.setAttribute('opacity', '0');
      for (const tx of h.primeTexts) tx.setAttribute('fill', colors.text);
      placeFence(fence, frontEdge(scene, 0, step.sq));

      let shownZones = 0;
      let primesShown = false;
      return runClock(mine, STOP_MS, (ms) => {
        const zoneCount = Math.min(h.zones.length, Math.floor((h.zones.length * ms) / STOP_SWEEP_MS));
        while (shownZones < zoneCount) {
          h.zones[shownZones]?.removeAttribute('opacity');
          shownZones += 1;
        }
        placeFence(fence, frontEdge(scene, shownZones, step.sq));
        if (!primesShown && ms >= STOP_SWEEP_MS) {
          primesShown = true;
          for (const f of h.primeFills) f.removeAttribute('opacity');
          for (const tx of h.primeTexts) tx.setAttribute('fill', colors.stateInk);
        }
      });
    }

    async function render(next: SieveScene, _prev: SieveScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate || next.step.kind === 'board') return;
      if (next.step.kind === 'sieve') await animateSieve(next, mine);
      else await animateStop(next, mine);
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
