/**
 * pointer-dereference stage — 읽는 자리가 주소를 따라 칸에서 칸으로 건너간다.
 *
 * 위: 프로그램 줄. `show` 줄 옆에 그 줄이 건넌 횟수와 출력.
 * 가운데: 칸 줄 (주소 차례). 칸마다 이름 · 주소 · 내용.
 * 칸 줄의 위와 아래가 따라가는 줄 둘의 길이다 — 첫 줄은 위로, 둘째 줄은 아래로 건넌다.
 * 손(읽는 자리)은 칸에서 수를 들어 올리고, 그 수가 가리키는 칸으로 호를 그리며 건너가
 * 그 칸의 내용으로 손에 든 것을 바꾼다. 지나간 호는 남아 건넌 횟수를 그림으로 센다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { PointerContent, PointerScene } from './scene.js';

const H = 424;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 한 번의 길이 (ms) */
const MOVE_MS = 400;
/** 칸 가로의 상한 */
const CELL_W_MAX = 200;
const MARGIN = 24;

const CODE_PX = parseFloat(fontSizes.sm);
/** 고정폭 글자 한 칸의 너비 — 글꼴 크기의 0.6 배로 어림한다 */
const CODE_CH = CODE_PX * 0.6;
const CODE_TOP = 30;
const CODE_LH = 22;
const CODE_X = 30;

const CELLS_Y = 226;
const CELL_H = 60;
/** 손이 칸 위(아래)에서 쉬는 거리 */
const REST_GAP = 34;
/** 호가 부푸는 높이 */
const BULGE = 50;
const TOKEN_W = 64;
const TOKEN_H = 26;

type Pt = { x: number; y: number };

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function ease(e: number): number {
  return e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

/** 칸 줄의 가로 배치 — 폭을 채우고 상한만 둔다 */
function cellGeometry(n: number): { w: number; xs: number[] } {
  if (n <= 0) return { w: 0, xs: [] };
  const gap = 28;
  const w = Math.min(CELL_W_MAX, (W - 2 * MARGIN - (n - 1) * gap) / n);
  const total = n * w + (n - 1) * gap;
  const left = (W - total) / 2;
  const xs: number[] = [];
  for (let i = 0; i < n; i += 1) xs.push(left + i * (w + gap));
  return { w, xs };
}

/** 길 k 의 손이 칸 cell 곁에서 쉬는 자리 — 짝수 길은 위, 홀수 길은 아래 */
function restPoint(xs: number[], w: number, cell: number, track: number): Pt {
  const x = (xs[cell] ?? 0) + w / 2;
  const y = track % 2 === 0 ? CELLS_Y - REST_GAP : CELLS_Y + CELL_H + REST_GAP;
  return { x, y };
}

/** 두 쉬는 자리를 잇는 호의 조절점 */
function arcControl(a: Pt, b: Pt, track: number): Pt {
  const dir = track % 2 === 0 ? -1 : 1;
  return { x: (a.x + b.x) / 2, y: a.y + dir * 2 * BULGE };
}

function bezier(a: Pt, c: Pt, b: Pt, s: number): Pt {
  const u = 1 - s;
  return {
    x: u * u * a.x + 2 * u * s * c.x + s * s * b.x,
    y: u * u * a.y + 2 * u * s * c.y + s * s * b.y,
  };
}

/** 호를 0 부터 s 까지 잘라 꺾은선 경로로 */
function arcPath(a: Pt, c: Pt, b: Pt, s: number): string {
  const steps = 24;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const p = bezier(a, c, b, (s * i) / steps);
    parts.push(`${i === 0 ? 'M' : 'L'}${r2(p.x)},${r2(p.y)}`);
  }
  return parts.join(' ');
}

function codeCenterY(line: number): number {
  return CODE_TOP + line * CODE_LH;
}

type Handles = {
  content: (SVGTextElement | null)[];
  token: SVGGElement[];
  tokenText: SVGTextElement[];
  arcs: SVGPathElement[][];
  heads: SVGPolygonElement[][];
  output: (SVGTextElement | null)[];
  hops: SVGTextElement[];
};

export const pointerDereferenceStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    // 세 갈래 — 따라가는 줄 둘과 주소. 주소는 번호표 · 칸 내용 · 손에서 같은 색이라
    // 칸에 든 수가 어느 칸의 번호인지 맞대어 읽힌다
    const hues = categorical(3, 'vivid');
    const trackColors = [hues[0], hues[1]];
    const addressColor = hues[2] ?? colors.text;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const trackColor = (k: number): string => trackColors[k % 2] ?? colors.primary;
    const contentColor = (c: PointerContent): string =>
      c.kind === 'address' ? addressColor : colors.text;

    function caption(scene: PointerScene): string {
      const step = scene.step;
      if (step.k === 'assign') {
        const cell = scene.cells[step.cell];
        const c = scene.contents[step.cell];
        if (cell === undefined || c === null || c === undefined) return '';
        if (step.source !== null) {
          const src = scene.cells[step.source];
          return t('caption.storeAddress', 'address({src}) gives {addr}, the number of its cell. It goes into the cell of {name}.', {
            src: src?.name ?? '',
            addr: c.value,
            name: cell.name,
          });
        }
        return t('caption.storeValue', 'The cell of {name} now holds {value}.', {
          name: cell.name,
          value: c.value,
        });
      }
      if (step.k === 'read') {
        const tr = scene.tracks[step.track];
        const cell = tr ? scene.cells[tr.start] : undefined;
        if (tr === undefined || cell === undefined) return '';
        return t('caption.read', 'Read the cell of {name}: {value}. This number is used as an address.', {
          name: cell.name,
          value: tr.held.value,
        });
      }
      if (step.k === 'hop') {
        const tr = scene.tracks[step.track];
        const to = scene.cells[step.to];
        if (tr === undefined || to === undefined) return '';
        const vars = { n: tr.path.length, addr: to.addr, value: tr.held.value };
        if (tr.output !== null) {
          return t('caption.hopLast', 'Hop {n}: over to address {addr}. Its cell holds {value}. Output: {value}', vars);
        }
        return t('caption.hop', 'Hop {n}: over to address {addr}. Its cell holds {value}.', vars);
      }
      if (scene.cells.length === 0) return '';
      return t('caption.start', 'Each name has its own cell. The cells are still empty.');
    }

    function drawStatic(scene: PointerScene): Handles {
      svg.textContent = '';
      const handles: Handles = {
        content: [],
        token: [],
        tokenText: [],
        arcs: [],
        heads: [],
        output: [],
        hops: [],
      };
      if (scene.cells.length === 0 && scene.lines.length === 0) return handles;

      const { w, xs } = cellGeometry(scene.cells.length);
      const step = scene.step;
      const touched =
        step.k === 'assign'
          ? step.cell
          : step.k === 'hop'
            ? step.to
            : step.k === 'read'
              ? (scene.tracks[step.track]?.start ?? -1)
              : -1;

      // 프로그램 줄
      const code = el('g', {}, svg);
      scene.lines.forEach((line, i) => {
        const cy = codeCenterY(i);
        if (scene.current === i) {
          el('rect', { x: CODE_X - 10, y: cy - CODE_LH / 2 + 1, width: W - 2 * (CODE_X - 10), height: CODE_LH - 2, rx: 3, fill: colors.bgSubtle }, code);
          el('rect', { x: CODE_X - 10, y: cy - CODE_LH / 2 + 1, width: 3, height: CODE_LH - 2, fill: colors.accent }, code);
        }
        const text = el('text', {
          x: CODE_X + line.indent * 4 * CODE_CH,
          y: cy,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        }, code);
        text.textContent = line.text;
      });

      // show 줄 옆 — 건넌 횟수 · 출력
      const colHops = W / 2 - 20;
      const colOut = W / 2 + 90;
      scene.tracks.forEach((tr, k) => {
        const cy = codeCenterY(tr.line);
        el('circle', { cx: colHops - 12, cy, r: 5, fill: trackColor(k) }, code);
        const hops = el('text', {
          x: colHops,
          y: cy,
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.text,
        }, code);
        hops.textContent = t('label.hops', 'hops: {n}', { n: tr.path.length });
        handles.hops.push(hops);
        if (tr.output !== null) {
          const out = el('text', {
            x: colOut,
            y: cy,
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 600,
            fill: colors.text,
          }, code);
          out.textContent = t('label.output', 'output: {value}', { value: tr.output });
          handles.output.push(out);
        } else {
          handles.output.push(null);
        }
      });

      // 칸 줄
      const cellsLayer = el('g', {}, svg);
      scene.cells.forEach((cell, i) => {
        const x = xs[i] ?? 0;
        const hot = i === touched;
        el('rect', {
          x,
          y: CELLS_Y,
          width: w,
          height: CELL_H,
          rx: 6,
          fill: colors.bg,
          stroke: hot ? colors.accent : colors.border,
          'stroke-width': hot ? 2.5 : 1.5,
        }, cellsLayer);
        const name = el('text', {
          x: x + 10,
          y: CELLS_Y + 14,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.text,
        }, cellsLayer);
        name.textContent = cell.name;
        const addr = el('text', {
          x: x + w - 10,
          y: CELLS_Y + 14,
          'text-anchor': 'end',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: addressColor,
        }, cellsLayer);
        addr.textContent = t('label.addr', 'address {addr}', { addr: cell.addr });
        const c = scene.contents[i];
        if (c !== null && c !== undefined) {
          const v = el('text', {
            x: x + w / 2,
            y: CELLS_Y + CELL_H / 2 + 8,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xl,
            'font-weight': 600,
            fill: contentColor(c),
          }, cellsLayer);
          v.textContent = String(c.value);
          handles.content.push(v);
        } else {
          handles.content.push(null);
        }
      });

      // 길 — 읽기 시작한 곳의 꼭지, 건넌 호, 손
      const trackLayer = el('g', {}, svg);
      scene.tracks.forEach((tr, k) => {
        const color = trackColor(k);
        const start = restPoint(xs, w, tr.start, k);
        const edgeY = k % 2 === 0 ? CELLS_Y : CELLS_Y + CELL_H;
        const nearY = k % 2 === 0 ? start.y + TOKEN_H / 2 : start.y - TOKEN_H / 2;
        el('line', {
          x1: start.x,
          y1: edgeY,
          x2: start.x,
          y2: nearY,
          stroke: color,
          'stroke-width': 2,
          'stroke-dasharray': '3 3',
        }, trackLayer);

        const arcs: SVGPathElement[] = [];
        const heads: SVGPolygonElement[] = [];
        let from = tr.start;
        for (const to of tr.path) {
          const a = restPoint(xs, w, from, k);
          const b = restPoint(xs, w, to, k);
          const c = arcControl(a, b, k);
          arcs.push(el('path', {
            d: arcPath(a, c, b, 1),
            fill: 'none',
            stroke: color,
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          }, trackLayer));
          // 닿는 끝의 화살 머리 — 호의 끝 접선 방향
          const dx = b.x - c.x;
          const dy = b.y - c.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const tip = { x: b.x - ux * (TOKEN_H / 2 + 2), y: b.y - uy * (TOKEN_H / 2 + 2) };
          const back = { x: tip.x - ux * 9, y: tip.y - uy * 9 };
          const pts = [
            `${r2(tip.x)},${r2(tip.y)}`,
            `${r2(back.x - uy * 5)},${r2(back.y + ux * 5)}`,
            `${r2(back.x + uy * 5)},${r2(back.y - ux * 5)}`,
          ].join(' ');
          heads.push(el('polygon', { points: pts, fill: color }, trackLayer));
          from = to;
        }
        handles.arcs.push(arcs);
        handles.heads.push(heads);
      });

      // 손은 호 위에 — 따로 한 층
      const handLayer = el('g', {}, svg);
      scene.tracks.forEach((tr, k) => {
        const at = tr.path.length > 0 ? (tr.path[tr.path.length - 1] ?? tr.start) : tr.start;
        const p = restPoint(xs, w, at, k);
        const g = el('g', {}, handLayer);
        el('rect', {
          x: p.x - TOKEN_W / 2,
          y: p.y - TOKEN_H / 2,
          width: TOKEN_W,
          height: TOKEN_H,
          rx: TOKEN_H / 2,
          fill: colors.bg,
          stroke: trackColor(k),
          'stroke-width': 2.5,
        }, g);
        const txt = el('text', {
          x: p.x,
          y: p.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: contentColor(tr.held),
        }, g);
        txt.textContent = String(tr.held.value);
        handles.token.push(g);
        handles.tokenText.push(txt);
      });

      // 캡션 — 지금 일어나는 일
      const cap = el('text', {
        x: W / 2,
        y: H - 18,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      }, svg);
      cap.textContent = caption(scene);
      return handles;
    }

    function tween(mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        const done = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        // 첫 프레임 전에 출발 자리에 세운다 — 끝 자리가 번쩍이지 않게
        frame(0);
        const t0 = performance.now();
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) return done();
          const e = Math.min(1, (now - t0) / MOVE_MS);
          frame(ease(e));
          if (e >= 1) return done();
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });
    }

    const live = (mine: number): boolean => mine === gen && !destroyed;

    async function play(scene: PointerScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      const { w, xs } = cellGeometry(scene.cells.length);

      if (step.k === 'assign') {
        const node = h.content[step.cell];
        const c = scene.contents[step.cell];
        if (!node || !c) return;
        const to = { x: (xs[step.cell] ?? 0) + w / 2, y: CELLS_Y + CELL_H / 2 + 8 };
        let from: Pt;
        if (step.source !== null) {
          // 주소는 그 칸의 번호표에서 온다
          from = { x: (xs[step.source] ?? 0) + w - 30, y: CELLS_Y + 14 };
        } else {
          // 수 글자는 줄에서 온다
          const line = scene.current !== null ? scene.lines[scene.current] : undefined;
          const lit = String(c.value);
          const idx = line ? line.text.lastIndexOf(lit) : -1;
          if (!line || idx < 0 || scene.current === null) return;
          from = {
            x: CODE_X + (line.indent * 4 + idx + lit.length / 2) * CODE_CH,
            y: codeCenterY(scene.current),
          };
        }
        await tween(mine, (e) => {
          const dx = (from.x - to.x) * (1 - e);
          const dy = (from.y - to.y) * (1 - e);
          node.setAttribute('transform', `translate(${r2(dx)},${r2(dy)})`);
        });
        return;
      }

      if (step.k === 'read') {
        const g = h.token[step.track];
        const tr = scene.tracks[step.track];
        if (!g || !tr) return;
        // 칸의 내용 자리에서 들어 올린다
        const rest = restPoint(xs, w, tr.start, step.track);
        const lift = { x: rest.x, y: CELLS_Y + CELL_H / 2 + 8 };
        await tween(mine, (e) => {
          const dy = (lift.y - rest.y) * (1 - e);
          g.setAttribute('transform', `translate(0,${r2(dy)})`);
        });
        return;
      }

      if (step.k === 'hop') {
        const k = step.track;
        const g = h.token[k];
        const txt = h.tokenText[k];
        const arcs = h.arcs[k] ?? [];
        const heads = h.heads[k] ?? [];
        const arc = arcs[arcs.length - 1];
        const head = heads[heads.length - 1];
        const out = h.output[k];
        if (!g || !txt || !arc) return;
        const a = restPoint(xs, w, step.from, k);
        const b = restPoint(xs, w, step.to, k);
        const c = arcControl(a, b, k);
        // 건너는 동안 손에는 아직 옛 수 — 주소
        txt.textContent = String(step.was.value);
        txt.setAttribute('fill', contentColor(step.was));
        head?.setAttribute('visibility', 'hidden');
        out?.setAttribute('visibility', 'hidden');
        await tween(mine, (e) => {
          const p = bezier(a, c, b, e);
          g.setAttribute('transform', `translate(${r2(p.x - b.x)},${r2(p.y - b.y)})`);
          arc.setAttribute('d', arcPath(a, c, b, e));
        });
      }
    }

    const instance = {
      async render(next: PointerScene, _prev: PointerScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const handles = drawStatic(next);
        if (!opts.animate) return;
        await play(next, handles, mine);
        if (live(mine)) drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return instance;
  },
};
