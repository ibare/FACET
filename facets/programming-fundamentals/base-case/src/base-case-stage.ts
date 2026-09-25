/**
 * base-case 의 무대 — n 을 가로로, 틀의 깊이를 세로로 둔 판.
 *
 * 부를 때마다 새 틀이 한 줄 아래로 **뛰어내린다.** 가로 자리는 그 틀의 n 이라 뛸 때마다
 * 바닥 값의 세로 금 쪽으로 다가간다. 금 위에 내려앉은 틀에서 부르기가 멈추고, 돌려준 값이
 * 뛰어온 길을 거슬러 한 줄씩 **올라간다.** 금을 건너뛴 사슬은 계속 멀어지며 한도의 가로 금까지
 * 내려가고, 그다음 뜀은 한도를 넘어 넘친다.
 */
import {
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
import type { BaseCaseBase, BaseCaseScene, Footprint, Shown } from './scene.js';

const H = 400;
const W = PIECE_CANVAS_W;
const SVG = 'http://www.w3.org/2000/svg';
const MOVE_MS = 420;
const FRAME_MS = 16;

/** 한 칸 크기의 상한. 실제 크기는 캔버스 폭과 n 의 범위에서 역산한다. */
const R_MAX = 16;
const ROW_MAX = 58;
const LINE_H = 22;
const CODE_FS = parseInt(fontSizes.sm, 10); // 코드 줄 글자 크기 — 폭 셈이 그리는 글꼴과 같은 토큰을 본다
const MONO_W = 0.6; // 고정폭 글자 한 칸 / 글자 크기

type Geo = {
  pad: number;
  codeX: number;
  codeTop: number;
  px0: number;
  px1: number;
  unit: number;
  r: number;
  axisY: number;
  rowTop: number;
  rowGap: number;
  limitY: number;
  capY: number;
  base: BaseCaseBase;
};

const round = (v: number): number => {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
};

function geometry(base: BaseCaseBase): Geo {
  const pad = 16;
  const codeX = pad + 12;
  const cw = CODE_FS * MONO_W;
  const widest = Math.max(0, ...base.lines.map((l) => (l.indent * 4 + l.text.length) * cw));
  const span = Math.max(1, base.hi - base.lo);
  const px1 = W - pad - 44;
  let px0 = codeX + widest + 32;
  let unit = (px1 - px0) / span;
  const r = Math.min(R_MAX, unit * 0.42);
  px0 += r;
  unit = (px1 - px0) / span;
  const axisY = 34;
  const rowTop = 76;
  const capY = H - 44;
  // 한도 아래 한 줄(넘친 부르기)까지 담는다
  const rowGap = Math.min(ROW_MAX, (capY - 12 - r - rowTop) / Math.max(1, base.maxFrames));
  const limitY = rowTop + (base.maxFrames - 0.5) * rowGap;
  return { pad, codeX, codeTop: rowTop - 4, px0, px1, unit, r, axisY, rowTop, rowGap, limitY, capY, base };
}

const xOf = (g: Geo, n: number): number => round(g.px0 + (n - g.base.lo) * g.unit);
const yOf = (g: Geo, depth: number): number => round(g.rowTop + (depth - 1) * g.rowGap);
const lineY = (g: Geo, line: number): number => round(g.codeTop + (line - 1) * LINE_H);
const lineEnd = (g: Geo, line: number): number => {
  const l = g.base.lines[line - 1];
  return round(g.codeX + (l ? (l.indent * 4 + l.text.length) * CODE_FS * MONO_W : 0));
};

/** 뜀 한 번의 곡선 — 두 자리 사이에서 위로 부푼다. */
function hop(ax: number, ay: number, bx: number, by: number, lift: number): { c: [number, number]; d: string } {
  const cx = round((ax + bx) / 2);
  const cy = round(Math.min(ay, by) - lift);
  return { c: [cx, cy], d: `M${ax},${ay} Q${cx},${cy} ${bx},${by}` };
}

function onCurve(a: [number, number], c: [number, number], b: [number, number], k: number): [number, number] {
  const u = 1 - k;
  return [u * u * a[0] + 2 * u * k * c[0] + k * k * b[0], u * u * a[1] + 2 * u * k * c[1] + k * k * b[1]];
}

function curveLength(a: [number, number], c: [number, number], b: [number, number]): number {
  let len = 0;
  let p = a;
  for (let i = 1; i <= 24; i += 1) {
    const q = onCurve(a, c, b, i / 24);
    len += Math.hypot(q[0] - p[0], q[1] - p[1]);
    p = q;
  }
  return len;
}

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

function valueText(v: Shown): string {
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'number') return String(v);
  return 'None';
}

/** 글자 폭 어림 — 한글·한자권 글자는 한 칸, 나머지는 반 칸 남짓. 캡션을 두 줄로 나눌 때만 쓴다. */
function roughWidth(s: string, fs: number): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? fs : fs * 0.56;
  return w;
}

function wrap(s: string, fs: number, max: number): string[] {
  if (roughWidth(s, fs) <= max) return [s];
  const words = s.split(' ');
  let first = '';
  let i = 0;
  for (; i < words.length; i += 1) {
    const next = first ? `${first} ${words[i]}` : words[i]!;
    if (first && roughWidth(next, fs) > max) break;
    first = next;
  }
  return i >= words.length ? [first] : [first, words.slice(i).join(' ')];
}

type Handles = {
  nodes: Map<string, SVGGElement>;
  links: Map<string, SVGPathElement>;
  tags: Map<string, SVGTextElement>;
  results: Map<number, SVGTextElement>;
};

const key = (origin: number, depth: number): string => `${origin}:${depth}`;

function caption(scene: BaseCaseScene, t: Translate): string {
  const s = scene.step;
  const base = scene.base;
  const fn = base?.fn ?? '';
  const test = base?.test ?? '';
  if (s.kind === 'enter') {
    const call = `${fn}(${s.n})`;
    if (s.drift === 'land') return t('caption.land', '{call} — base condition {test} is true. The calls stop here and it turns back.', { call, test });
    if (s.drift === 'toward') return t('caption.toward', '{call} — base condition {test} is false. It calls again, closer to the floor.', { call, test });
    if (s.drift === 'across') return t('caption.across', '{call} — base condition {test} is false. It jumped over the floor without touching it and calls again.', { call, test });
    if (s.drift === 'away') return t('caption.away', '{call} — base condition {test} is false. It calls again, moving away from the floor.', { call, test });
    return t('caption.first', '{call} — base condition {test} is false. It calls again.', { call, test });
  }
  if (s.kind === 'return') {
    const value = valueText(s.value);
    if (s.into !== null) {
      return t('caption.returnOut', 'The frame at depth {depth} returns {value} and is cleared — {into} = {value}.', { depth: s.depth, value, into: s.into });
    }
    return t('caption.return', 'The frame at depth {depth} returns {value} and is cleared.', { depth: s.depth, value });
  }
  if (s.kind === 'overflow') {
    return t('caption.overflow', 'Already {max} frames — the next call {call} overflows with {error}. The program stops.', {
      max: base?.maxFrames ?? 0,
      call: `${fn}(${s.n})`,
      error: s.error,
    });
  }
  return t('caption.start', 'Nothing has been called yet.');
}

export const baseCaseStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<BaseCaseScene> {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const make = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      content?: string,
    ): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      if (content !== undefined) e.textContent = content;
      parent.appendChild(e);
      return e;
    };

    function drawStatic(scene: BaseCaseScene): Handles {
      svg.textContent = '';
      const h: Handles = { nodes: new Map(), links: new Map(), tags: new Map(), results: new Map() };
      const base = scene.base;
      const capFs = parseInt(fontSizes.md, 10);
      const capLines = wrap(caption(scene, t), capFs, W - 32);
      const capColor = scene.step.kind === 'overflow' ? c.danger : c.text;
      if (!base) {
        capLines.forEach((s, i) =>
          make('text', { x: 16, y: H - 38 + i * 20, fill: capColor, 'font-family': fonts.body, 'font-size': fontSizes.md }, svg, s),
        );
        return h;
      }
      const g = geometry(base);
      const failed = scene.failed;

      // 코드 — 바닥 조건 줄에 바닥 금과 같은 색 띠, 지금 부르고 있는 바깥 줄에 표
      const testLine = base.lines.findIndex((l) => l.text === `if ${base.test}:`) + 1;
      const liveOrigin = scene.stack[0]?.origin ?? null;
      base.lines.forEach((l, i) => {
        const y = lineY(g, i + 1);
        if (i + 1 === testLine) make('rect', { x: g.pad, y: y - 12, width: 3, height: 16, fill: c.accent }, svg);
        make(
          'text',
          {
            x: g.codeX + l.indent * 4 * CODE_FS * MONO_W,
            y,
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          },
          svg,
          l.text,
        );
      });
      if (liveOrigin !== null) {
        const y = lineY(g, liveOrigin);
        const col = failed ? c.danger : c.primary;
        make('path', { d: `M${g.pad + 4},${y - 9} L${g.pad + 10},${y - 4} L${g.pad + 4},${y + 1} Z`, fill: col }, svg);
      }
      for (const res of scene.results) {
        h.results.set(
          res.line,
          make(
            'text',
            { x: lineEnd(g, res.line) + 8, y: lineY(g, res.line), fill: c.success, 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 600 },
            svg,
            `→ ${valueText(res.value)}`,
          ),
        );
      }
      if (failed) {
        make(
          'text',
          { x: lineEnd(g, failed.line) + 8, y: lineY(g, failed.line), fill: c.danger, 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 600 },
          svg,
          `→ ${failed.error}`,
        );
      }

      // n 의 눈금과 깊이 줄
      for (let v = base.lo; v <= base.hi; v += 1) {
        const isFloor = v === base.floor;
        make(
          'text',
          {
            x: xOf(g, v),
            y: g.axisY,
            'text-anchor': 'middle',
            fill: isFloor ? c.text : c.textMuted,
            'font-family': fonts.mono,
            'font-size': isFloor ? fontSizes.md : fontSizes.xs,
            'font-weight': isFloor ? 700 : 400,
          },
          svg,
          String(v),
        );
      }
      make('text', { x: W - g.pad, y: g.axisY, 'text-anchor': 'end', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, svg, t('label.depth', 'depth'));
      for (let d = 1; d <= base.maxFrames; d += 1) {
        const y = yOf(g, d);
        make('line', { x1: g.px0 - g.r, y1: y, x2: g.px1 + g.r, y2: y, stroke: c.border, 'stroke-width': 1 }, svg);
        make('text', { x: W - g.pad, y: y + 4, 'text-anchor': 'end', fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, svg, String(d));
      }

      // 틀 한도 — 이 금 아래로는 틀이 서지 않는다
      const limitCol = failed ? c.danger : c.textMuted;
      make('line', { x1: g.px0 - g.r, y1: g.limitY, x2: W - g.pad, y2: g.limitY, stroke: limitCol, 'stroke-width': failed ? 2.5 : 1.5, 'stroke-dasharray': '6 4' }, svg);
      make(
        'text',
        { x: W - g.pad, y: g.limitY + 16, 'text-anchor': 'end', fill: limitCol, 'font-family': fonts.body, 'font-size': fontSizes.xs, 'font-weight': failed ? 600 : 400 },
        svg,
        t('label.limit', 'frame limit {max}', { max: base.maxFrames }),
      );

      // 바닥 — n 이 이 값이면 부르기가 멈춘다
      if (base.floor !== null) {
        const fx = xOf(g, base.floor);
        make('line', { x1: fx, y1: g.axisY + 8, x2: fx, y2: g.limitY, stroke: c.accent, 'stroke-width': 3 }, svg);
        make('text', { x: fx, y: g.axisY - 18, 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.xs, 'font-weight': 600 }, svg, t('label.floor', 'floor'));
      }

      // 뜀 — 같은 바깥 줄에서 나온 발자국끼리 깊이 차례로 잇는다
      const live = (f: Footprint): boolean => f.origin === liveOrigin && f.depth <= scene.stack.length;
      const lift = g.rowGap * 0.55;
      const byKey = new Map(scene.trail.map((f) => [key(f.origin, f.depth), f]));
      for (const f of scene.trail) {
        const parent = byKey.get(key(f.origin, f.depth - 1));
        if (!parent) continue;
        const on = live(f);
        const arc = hop(xOf(g, parent.n), yOf(g, parent.depth), xOf(g, f.n), yOf(g, f.depth), lift);
        h.links.set(
          key(f.origin, f.depth),
          make(
            'path',
            {
              d: arc.d,
              fill: 'none',
              stroke: on ? (failed ? c.danger : c.primary) : c.textMuted,
              'stroke-width': on ? 2 : 1.25,
              ...(on ? {} : { 'stroke-dasharray': '3 4' }),
            },
            svg,
          ),
        );
      }

      // 넘친 부르기 — 한도 아래에 설 뻔한 자리
      if (failed) {
        const top = scene.trail.find((f) => f.origin === failed.line && f.depth === failed.depth);
        const gx = xOf(g, failed.n);
        const gy = yOf(g, failed.depth + 1);
        if (top) {
          const arc = hop(xOf(g, top.n), yOf(g, top.depth), gx, gy, lift);
          h.links.set('over', make('path', { d: arc.d, fill: 'none', stroke: c.danger, 'stroke-width': 2, 'stroke-dasharray': '5 3' }, svg));
        }
        const ghost = make('g', { transform: `translate(${gx},${gy})` }, svg);
        make('circle', { r: g.r, fill: c.bg, stroke: c.danger, 'stroke-width': 2, 'stroke-dasharray': '4 3' }, ghost);
        make('text', { y: 4, 'text-anchor': 'middle', fill: c.danger, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700 }, ghost, String(failed.n));
        h.nodes.set('over', ghost);
      }

      // 틀 — 살아 있는 것은 굵게, 걷힌 것은 발자국으로
      for (const f of scene.trail) {
        const on = live(f);
        const x = xOf(g, f.n);
        const y = yOf(g, f.depth);
        const node = make('g', { transform: `translate(${x},${y})` }, svg);
        const ring = f.hit ? c.accent : on ? (failed ? c.danger : c.primary) : c.textMuted;
        make(
          'circle',
          {
            r: on ? g.r : g.r * 0.78,
            fill: c.bg,
            stroke: ring,
            'stroke-width': f.hit ? 3.5 : on ? 2 : 1.25,
            ...(on || f.hit ? {} : { 'stroke-dasharray': '3 3' }),
          },
          node,
        );
        make(
          'text',
          { y: 4, 'text-anchor': 'middle', fill: on ? c.text : c.textMuted, 'font-family': fonts.mono, 'font-size': on ? fontSizes.sm : fontSizes.xs, 'font-weight': on ? 700 : 400 },
          node,
          String(f.n),
        );
        h.nodes.set(key(f.origin, f.depth), node);
      }

      // 아래 틀에게서 받아 쥔 값
      for (const fr of scene.stack) {
        if (!fr.got) continue;
        h.tags.set(
          key(fr.origin, fr.depth),
          make(
            'text',
            { x: xOf(g, fr.n) + g.r + 5, y: yOf(g, fr.depth) + 4, fill: c.success, 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 600 },
            svg,
            valueText(fr.got.value),
          ),
        );
      }

      capLines.forEach((s, i) =>
        make('text', { x: g.pad, y: g.capY + 18 + i * 20, fill: capColor, 'font-family': fonts.body, 'font-size': fontSizes.md }, svg, s),
      );
      return h;
    }

    function tween(mine: number, ms: number, draw: (k: number) => void): Promise<void> {
      const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
      return new Promise<void>((resolve) => {
        let i = 0;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          i += 1;
          draw(ease(Math.min(1, i / frames)));
          if (i >= frames) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        draw(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    /** 뜀 한 번 — 틀(또는 넘친 자리)이 부모 자리에서 곡선을 따라 제자리로 내려앉는다. */
    function jump(mine: number, node: SVGGElement, link: SVGPathElement | undefined, from: [number, number], to: [number, number], lift: number): Promise<void> {
      const arc = hop(from[0], from[1], to[0], to[1], lift);
      const len = curveLength(from, arc.c, to);
      if (link) link.setAttribute('stroke-dasharray', `${round(len)} ${round(len)}`);
      return tween(mine, MOVE_MS, (k) => {
        const p = onCurve(from, arc.c, to, k);
        node.setAttribute('transform', `translate(${round(p[0])},${round(p[1])})`);
        if (link) link.setAttribute('stroke-dashoffset', String(round(len * (1 - k))));
      });
    }

    /** 돌려준 값이 아래 틀에서 받는 자리로 거슬러 오른다. */
    function rise(mine: number, tag: SVGTextElement, from: [number, number], to: [number, number], lift: number): Promise<void> {
      const arc = hop(from[0], from[1], to[0], to[1], lift);
      return tween(mine, MOVE_MS, (k) => {
        const p = onCurve(from, arc.c, to, k);
        tag.setAttribute('transform', `translate(${round(p[0] - to[0])},${round(p[1] - to[1])})`);
      });
    }

    async function animate(mine: number, next: BaseCaseScene, h: Handles): Promise<void> {
      const base = next.base;
      if (!base) return;
      const g = geometry(base);
      const s = next.step;
      const lift = g.rowGap * 0.55;
      if (s.kind === 'enter') {
        const node = h.nodes.get(key(s.line, s.depth));
        if (!node) return;
        const to: [number, number] = [xOf(g, s.n), yOf(g, s.depth)];
        const parent = next.stack[next.stack.length - 2];
        // 첫 틀은 바깥에서 곧장 내려온다
        const from: [number, number] = parent ? [xOf(g, parent.n), yOf(g, parent.depth)] : [to[0], g.axisY + 8];
        await jump(mine, node, h.links.get(key(s.line, s.depth)), from, to, parent ? lift : 0);
        return;
      }
      if (s.kind === 'return') {
        const child = next.trail.find((f) => f.origin === s.line && f.depth === s.depth);
        if (!child) return;
        const from: [number, number] = [xOf(g, child.n), yOf(g, child.depth)];
        const up = next.stack[next.stack.length - 1];
        if (up) {
          const tag = h.tags.get(key(up.origin, up.depth));
          if (tag) await rise(mine, tag, from, [xOf(g, up.n) + g.r + 5, yOf(g, up.depth) + 4], lift);
          return;
        }
        const res = h.results.get(s.line);
        if (res) await rise(mine, res, from, [lineEnd(g, s.line) + 8, lineY(g, s.line)], lift);
        return;
      }
      if (s.kind === 'overflow') {
        const node = h.nodes.get('over');
        const top = next.trail.find((f) => f.origin === s.line && f.depth === s.depth);
        if (!node || !top) return;
        await jump(mine, node, h.links.get('over'), [xOf(g, top.n), yOf(g, top.depth)], [xOf(g, s.n), yOf(g, s.depth + 1)], lift);
      }
    }

    return {
      render(next: BaseCaseScene, prev: BaseCaseScene | null, opts: { animate: boolean }): void | Promise<void> {
        const mine = (gen += 1);
        const h = drawStatic(next);
        if (!opts.animate || prev === null || destroyed || next.step.kind === 'start') return;
        return animate(mine, next, h).then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
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
