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
} from '@ffacet/core/runtime';
import type { SceneLine, UnusedIsRemovedScene } from './scene';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 450;

/** 운동 시계 (ms) — 떨어짐 · 실 감기 · 줄 모으기 · 붙잡기 */
const FALL_MS = 480;
const REEL_MS = 400;
const CLOSE_MS = 420;
const TUG_MS = 520;
const FRAME_MS = 16;

const r2 = (v: number): number => {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
};
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeIn = (p: number): number => p * p;
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

type Geo = {
  W: number;
  codePx: number;
  smPx: number;
  cw: number;
  gutX: number;
  codeX: number;
  anchorX: number;
  badgeX: number;
  row0: number;
  rowH: number;
  trayLabelY: number;
  tray0: number;
  trayH: number;
};

function geometry(): Geo {
  const W = PIECE_CANVAS_W;
  const codePx = parseFloat(fontSizes.md);
  const smPx = parseFloat(fontSizes.sm);
  const cw = codePx * 0.6;
  const codeX = Math.min(200, W * 0.32);
  return {
    W,
    codePx,
    smPx,
    cw,
    gutX: 20,
    codeX,
    anchorX: codeX + 4 * cw - 10,
    badgeX: W - 60,
    row0: 96,
    rowH: 30,
    trayLabelY: 312,
    tray0: 338,
    trayH: 24,
  };
}

/** 움직이는 순간의 모습 — 없으면 장면의 끝 자리 그대로 */
type Frame =
  | { kind: 'drop'; t: number }
  | { kind: 'stop'; t: number };

export const unusedIsRemovedStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const g = geometry();

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(x: number, y: number, s: string, attrs: Record<string, string | number> = {}): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
        ...attrs,
      });
      node.textContent = s;
      return node;
    }

    function colorOf(scene: UnusedIsRemovedScene, name: string): string {
      const hues = categorical(Math.max(1, scene.names.length));
      const i = scene.names.indexOf(name);
      return i >= 0 ? (hues[i] ?? c.primary) : c.text;
    }

    const slotY = (i: number): number => g.row0 + i * g.rowH;
    const trayY = (i: number): number => g.tray0 + i * g.trayH;

    function lineOf(scene: UnusedIsRemovedScene, n: number): SceneLine | undefined {
      return scene.lines.find((l) => l.n === n);
    }

    function textLen(line: SceneLine): number {
      return line.segs.reduce((sum, s) => sum + s.s.length, 0);
    }

    function drawRow(
      scene: UnusedIsRemovedScene,
      line: SceneLine,
      y: number,
      dead: boolean,
      badge: number | null,
    ): void {
      label(g.gutX, y, t('label.line', 'L{n}', { n: line.n }), { 'font-family': fonts.mono, fill: c.textMuted });
      const x = g.codeX + line.indent * 4 * g.cw;
      const text = el('text', {
        x,
        y,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: dead ? c.textMuted : c.text,
        'xml:space': 'preserve',
      });
      for (const seg of line.segs) {
        const span = el('tspan', {}, text);
        span.textContent = seg.s;
        if (seg.ref !== undefined && !dead) span.setAttribute('fill', colorOf(scene, seg.ref));
        if (seg.def === true) span.setAttribute('font-weight', '700');
      }
      if (dead) {
        el('line', {
          x1: x - 2,
          y1: y - g.codePx * 0.32,
          x2: x + textLen(line) * g.cw + 2,
          y2: y - g.codePx * 0.32,
          stroke: c.textMuted,
          'stroke-width': 1.2,
        });
      }
      if (badge !== null) {
        const zero = badge === 0 && !dead;
        el('rect', {
          x: g.badgeX - 20,
          y: y - g.codePx * 0.32 - 11,
          width: 40,
          height: 22,
          rx: 6,
          fill: c.bgSubtle,
          stroke: zero ? c.danger : c.border,
          'stroke-width': zero ? 2 : 1,
        });
        el('text', {
          x: g.badgeX,
          y: y - g.codePx * 0.32 + 4.5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': zero ? '700' : '400',
          fill: dead ? c.textMuted : zero ? c.danger : c.text,
        }).textContent = String(badge);
      }
    }

    function drawThread(color: string, yUse: number, yDef: number, width: number): void {
      const y1 = yUse - g.codePx * 0.32;
      const y2 = yDef - g.codePx * 0.32;
      const span = Math.abs(y1 - y2);
      if (span < 0.5) return;
      const cx = g.anchorX - (22 + span * 0.66);
      el('path', {
        d: `M ${r2(g.anchorX)} ${r2(y1)} C ${r2(cx)} ${r2(y1)} ${r2(cx)} ${r2(y2)} ${r2(g.anchorX)} ${r2(y2)}`,
        fill: 'none',
        stroke: color,
        'stroke-width': width,
      });
      el('circle', { cx: g.anchorX, cy: y1, r: 3, fill: color });
      el('circle', { cx: g.anchorX, cy: y2, r: 3.2, fill: c.bg, stroke: color, 'stroke-width': 1.6 });
    }

    function countOf(uses: { name: string; n: number }[], name: string | null): number | null {
      if (name === null) return null;
      const u = uses.find((x) => x.name === name);
      return u ? u.n : null;
    }

    /** 장면 하나의 화면 전체. frame 이 있으면 그 순간의 자리로 그린다. */
    function draw(scene: UnusedIsRemovedScene, frame: Frame | null): void {
      svg.textContent = '';
      if (scene.lines.length === 0) return;
      const step = scene.step;

      // 캡션
      if (step.kind === 'start') {
        label(g.gutX, 26, t('caption.start', 'Start: no line removed yet.'), {
          'font-size': fontSizes.md,
          fill: c.text,
        });
      } else if (step.kind === 'drop') {
        const names = step.gone
          .map((n) => {
            const l = lineOf(scene, n);
            return l && l.name !== null
              ? t('label.gone', 'L{n} ({name})', { n, name: l.name })
              : t('label.line', 'L{n}', { n });
          })
          .join(', ');
        label(g.gutX, 26, t('caption.drop', 'Round {k} · uses 0: {names} — removed', { k: step.round, names }), {
          'font-size': fontSizes.md,
          fill: c.text,
        });
        const released: string[] = [];
        for (const e of scene.edges) {
          if (step.gone.includes(e.from) && !released.includes(e.name)) released.push(e.name);
        }
        label(
          g.gutX,
          48,
          released.length > 0
            ? t('sub.drop', 'Uses let go: {names}', { names: released.join(', ') })
            : t('sub.dropNone', 'Uses let go: none'),
        );
      } else {
        const list = scene.edges
          .filter((e) => scene.alive.includes(e.from) && scene.alive.includes(e.to))
          .map((e) => t('label.hold', '{name} ← L{n}', { name: e.name, n: e.from }))
          .join(', ');
        label(g.gutX, 26, t('caption.stop', 'Round {k} · no line has 0 uses — stop', { k: step.round }), {
          'font-size': fontSizes.md,
          fill: c.text,
        });
        label(g.gutX, 48, t('sub.stop', 'Still held: {list}', { list }));
      }

      label(g.badgeX, g.row0 - 28, t('label.uses', 'Uses'), { 'text-anchor': 'middle' });
      el('line', {
        x1: g.gutX,
        y1: g.trayLabelY - 18,
        x2: g.W - g.gutX,
        y2: g.trayLabelY - 18,
        stroke: c.border,
        'stroke-width': 1,
      });
      label(g.gutX, g.trayLabelY, t('label.removed', 'Removed'));

      const dropping = frame?.kind === 'drop' && step.kind === 'drop' ? step : null;
      const tFrame = frame ? frame.t : 0;
      const pFall = dropping ? easeIn(clamp01(tFrame / FALL_MS)) : 1;
      const pReel = dropping ? easeOut(clamp01(tFrame / REEL_MS)) : 1;
      const pClose = dropping ? easeInOut(clamp01((tFrame - FALL_MS) / CLOSE_MS)) : 1;

      // 줄의 지금 자리
      const yOf = new Map<number, number>();
      scene.alive.forEach((n, i) => {
        const from = dropping ? dropping.was.indexOf(n) : i;
        yOf.set(n, lerp(slotY(from < 0 ? i : from), slotY(i), pClose));
      });

      // 실 — 남은 줄 사이의 쓰임
      const tug = frame?.kind === 'stop' ? Math.sin(Math.PI * clamp01(frame.t / TUG_MS)) : 0;
      const holdW = step.kind === 'stop' ? 3 + tug * 1.6 : 1.6;
      for (const e of scene.edges) {
        const yu = yOf.get(e.from);
        const yd = yOf.get(e.to);
        if (yu === undefined || yd === undefined) continue; // 지운 줄의 실은 풀렸다
        drawThread(colorOf(scene, e.name), yu, yd, holdW);
      }
      // 떨어지는 줄이 놓는 실 — 감겨 올라가 정의 줄에 닿는다
      if (dropping && pReel < 1) {
        for (const e of scene.edges) {
          if (!dropping.gone.includes(e.from)) continue;
          const yd = slotY(dropping.was.indexOf(e.to));
          const yu0 = slotY(dropping.was.indexOf(e.from));
          drawThread(colorOf(scene, e.name), lerp(yu0, yd, pReel), yd, 1.6);
        }
      }

      // 남은 줄
      for (const n of scene.alive) {
        const line = lineOf(scene, n);
        const y = yOf.get(n);
        if (!line || y === undefined) continue;
        // 뱃지는 이 판을 판정한 값이다 — 지운 뒤 새로 0 이 된 것은 다음 판에 드러난다
        const shown = step.kind === 'drop' ? step.before : scene.uses;
        drawRow(scene, line, y, false, countOf(shown, line.kind === 'let' ? line.name : null));
      }

      // 지운 줄 — 쟁반에 쌓인다. 이번 판에 지운 줄은 제 자리에서 떨어지는 중
      scene.removed.forEach((n, i) => {
        const line = lineOf(scene, n);
        if (!line) return;
        let y = trayY(i);
        if (dropping && dropping.gone.includes(n)) y = lerp(slotY(dropping.was.indexOf(n)), trayY(i), pFall);
        drawRow(scene, line, y, true, 0);
      });

      // 셈
      if (scene.lines0 > 0) {
        label(g.gutX, H - 12, t('label.lines', 'Lines: {from} → {to}', { from: scene.lines0, to: scene.linesNow }), {
          'font-size': fontSizes.md,
          fill: c.text,
        });
        label(g.W / 2, H - 12, t('label.ops', 'Operations: {from} → {to}', { from: scene.ops0, to: scene.opsNow }), {
          'font-size': fontSizes.md,
          fill: c.text,
        });
      }
    }

    function tick(): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function play(next: UnusedIsRemovedScene, kind: Frame['kind'], total: number, mine: number): Promise<void> {
      for (let elapsed = 0; elapsed < total; elapsed += FRAME_MS) {
        if (mine !== gen || destroyed) return;
        draw(next, { kind, t: elapsed });
        await tick();
      }
    }

    return {
      async render(next: UnusedIsRemovedScene, _prev: UnusedIsRemovedScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        draw(next, null);
        if (!opts.animate || destroyed) return;
        if (next.step.kind === 'drop') await play(next, 'drop', FALL_MS + CLOSE_MS, mine);
        else if (next.step.kind === 'stop') await play(next, 'stop', TUG_MS, mine);
        else return;
        if (mine !== gen || destroyed) return;
        draw(next, null);
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
