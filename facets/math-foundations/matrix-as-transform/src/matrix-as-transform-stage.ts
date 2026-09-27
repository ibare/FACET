/**
 * matrix-as-transform-stage — 좌표평면 하나와 곁의 장부.
 *
 * 평면: 격자 점과 줄. 걸음 1 에서 점 전부가 한 운동으로 제 자리를 떠나 A p 로 간다 — 떠난 자리는 흐린 자국으로 남는다.
 * 장부: 행렬 A 와, 옮긴 뒤 짚은 것(자리가 바뀐 점 · 원점 · 움직인 거리 · 곧은 줄 · 고른 간격)이 걸음마다 한 줄씩 쌓인다.
 *
 * 좌표는 수학 좌표(위가 +y). 한 칸의 픽셀은 평면 크기와 extent(알고리즘이 싣는다)에서 역산한다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Vec2 } from './algorithm.js';
import type { MatrixAsTransformScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 420;
const PAD = 16;
const CAPTION_BAND = 40;
const PANEL_MIN = 190;
const GAP = 22;

const MOVE_MS = 1100;
const MARK_MS = 400;

function stageFail(why: string): never {
  throw new Error(`matrix-as-transform-stage: ${why}`);
}

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** 좌표 · 행렬 칸 — 정수는 정수로, 0.5 의 배수는 소수 한 자리. 빼기는 U+2212. */
function fmtNum(v: number): string {
  const x = Object.is(v, -0) ? 0 : v;
  const sign = x < 0 ? '−' : '';
  const a = Math.abs(x);
  if (Number.isInteger(a)) return `${sign}${a}`;
  if (Number.isInteger(a * 2)) return `${sign}${a.toFixed(1)}`;
  return stageFail(`표기할 수 없는 좌표 ${v}`);
}

/** 거리 — 움직이지 않았으면 0, 아니면 소수 둘째 자리. */
function fmtDist(d: number): string {
  if (d < 0) stageFail(`음수 거리 ${d}`);
  return d === 0 ? '0' : d.toFixed(2);
}

function ease(s: number): number {
  return s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function word(
  parent: Element,
  x: number,
  y: number,
  body: string,
  style: { fill: string; size: string; family?: string; anchor?: string; weight?: string },
): SVGTextElement {
  const node = el(parent, 'text', {
    x: round2(x),
    y: round2(y),
    fill: style.fill,
    'font-size': style.size,
    'font-family': style.family ?? fonts.body,
    'text-anchor': style.anchor ?? 'start',
  });
  if (style.weight) node.setAttribute('font-weight', style.weight);
  node.textContent = body;
  return node;
}

function pointList(ps: readonly (readonly [number, number])[]): string {
  return ps.map(([x, y]) => `${round2(x)},${round2(y)}`).join(' ');
}

export const matrixAsTransformStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const [nearInk, farInk] = categorical(2);
    if (nearInk === undefined || farInk === undefined) stageFail('두 갈래 색을 받지 못했다');

    // 평면은 정사각형 — 세로에서 역산하고 남는 가로를 장부가 가진다
    const side = Math.min(H - CAPTION_BAND - PAD, PIECE_CANVAS_W - PAD * 2 - GAP - PANEL_MIN);
    const planeX = PAD;
    const planeY = CAPTION_BAND;
    const panelX = planeX + side + GAP;
    const panelW = PIECE_CANVAS_W - PAD - panelX;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 정적 그리기가 남기는 손잡이 — 운동이 이것만 만진다
    let pointEls: SVGCircleElement[] = [];
    let lineEls: SVGPolylineElement[] = [];
    let ringEl: SVGCircleElement | null = null;
    let segEls: { node: SVGLineElement; from: Vec2; to: Vec2 }[] = [];
    let chipEls: { node: SVGLineElement; a: Vec2; b: Vec2; k: number }[] = [];
    let unit = 0;

    function px(p: readonly [number, number]): [number, number] {
      return [round2(planeX + side / 2 + p[0] * unit), round2(planeY + side / 2 - p[1] * unit)];
    }

    function pointAt(scene: MatrixAsTransformScene, i: number, which: 'from' | 'to'): Vec2 {
      const src = which === 'from' ? scene.points : scene.moved?.to;
      const p = src?.[i];
      if (p === undefined) return stageFail(`점 ${i} 의 ${which} 자리가 없다`);
      return p;
    }

    function pointText(p: Vec2): string {
      return t('value.point', '({x}, {y})', { x: fmtNum(p[0]), y: fmtNum(p[1]) });
    }

    function drawCaption(scene: MatrixAsTransformScene): void {
      let body: string;
      switch (scene.step) {
        case 'start':
          body = t('caption.start', 'Points: {n} · Lines: {l} — A acts on the whole plane', {
            n: scene.points.length,
            l: scene.lines.length,
          });
          break;
        case 'move': {
          const m = scene.moved ?? stageFail('move 걸음인데 옮긴 자리가 없다');
          body = t('caption.move', 'All at once — points that changed place: {moved} / {total}', {
            moved: m.changed,
            total: m.total,
          });
          break;
        }
        case 'origin': {
          const o = scene.origin ?? stageFail('origin 걸음인데 원점이 없다');
          body = t('caption.origin', 'Origin {p} → {q} · distance moved: {d}', {
            p: pointText(pointAt(scene, o.index, 'from')),
            q: pointText(o.to),
            d: fmtDist(o.dist),
          });
          break;
        }
        case 'distance': {
          const d = scene.distance ?? stageFail('distance 걸음인데 거리가 없다');
          body = t('caption.distance', 'Shortest move: {near} · points: {nn} — longest move: {far} · points: {nf}', {
            near: fmtDist(d.near.dist),
            nn: d.near.points.length,
            far: fmtDist(d.far.dist),
            nf: d.far.points.length,
          });
          break;
        }
        case 'straight': {
          const s = scene.straight ?? stageFail('straight 걸음인데 판정이 없다');
          body = t('caption.straight', 'Lines still straight after the move: {ok} / {total}', {
            ok: s.count,
            total: s.total,
          });
          break;
        }
        case 'even': {
          const e = scene.even ?? stageFail('even 걸음인데 판정이 없다');
          body = t('caption.even', 'Lines still evenly spaced after the move: {ok} / {total}', {
            ok: e.count,
            total: e.total,
          });
          break;
        }
      }
      word(svg, PAD, 26, body, { fill: c.text, size: fontSizes.md, weight: '600' });
    }

    function drawPlane(scene: MatrixAsTransformScene): void {
      pointEls = [];
      lineEls = [];
      ringEl = null;
      segEls = [];
      chipEls = [];
      el(svg, 'rect', {
        x: planeX,
        y: planeY,
        width: side,
        height: side,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.border,
      });
      if (scene.extent === null) return;
      // 한 칸 여유를 두고 extent 까지 담는다 — 가장자리 점의 거리 글자가 틀 안에 들게
      unit = side / (2 * scene.extent + 2);
      const [ox, oy] = px([0, 0]);
      el(svg, 'line', { x1: planeX, y1: oy, x2: planeX + side, y2: oy, stroke: c.border, 'stroke-width': 1 });
      el(svg, 'line', { x1: ox, y1: planeY, x2: ox, y2: planeY + side, stroke: c.border, 'stroke-width': 1 });

      const moved = scene.moved;
      // 떠난 자리 — 옮기기 전 격자. 옮긴 뒤엔 흐린 자국으로 남는다
      const ghostInk = moved ? c.textMuted : c.text;
      for (const ln of scene.lines) {
        const node = el(svg, 'polyline', {
          points: pointList(ln.members.map((i) => px(pointAt(scene, i, 'from')))),
          fill: 'none',
          stroke: moved ? c.border : c.textMuted,
          'stroke-width': moved ? 1 : 1.4,
        });
        if (moved) node.setAttribute('stroke-dasharray', '3 4');
      }
      scene.points.forEach((p) => {
        const [x, y] = px(p);
        if (moved) el(svg, 'circle', { cx: x, cy: y, r: 2.5, fill: 'none', stroke: ghostInk, 'stroke-width': 1 });
        else el(svg, 'circle', { cx: x, cy: y, r: 3.5, fill: ghostInk });
      });
      if (!moved) return;

      const distance = scene.step === 'distance' ? scene.distance : null;
      if (distance) {
        // 떠난 자리에서 간 자리까지 — 멀리 간 점일수록 금이 길다
        const near = new Set(distance.near.points);
        const far = new Set(distance.far.points);
        scene.points.forEach((p, i) => {
          const q = pointAt(scene, i, 'to');
          if (p[0] === q[0] && p[1] === q[1]) return;
          const [x1, y1] = px(p);
          const [x2, y2] = px(q);
          const ink = near.has(i) ? nearInk : far.has(i) ? farInk : c.textMuted;
          const node = el(svg, 'line', {
            x1,
            y1,
            x2,
            y2,
            stroke: ink,
            'stroke-width': near.has(i) || far.has(i) ? 2.2 : 1,
          });
          segEls.push({ node, from: [x1, y1], to: [x2, y2] });
        });
      }

      const straight = scene.step === 'straight' ? scene.straight : null;
      const even = scene.step === 'even' ? scene.even : null;
      scene.lines.forEach((ln, j) => {
        const pts = ln.members.map((i) => px(pointAt(scene, i, 'to')));
        const verdict = straight ? straight.ok[j] : even ? even.ok[j] : undefined;
        const node = el(svg, 'polyline', {
          points: pointList(pts),
          fill: 'none',
          stroke: verdict === false ? c.danger : straight ? c.itemActive : even ? c.textMuted : c.primary,
          'stroke-width': straight ? 2.6 : even ? 1 : 1.4,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        });
        if (verdict === false) node.setAttribute('stroke-dasharray', '5 4');
        lineEls.push(node);
        if (even && verdict === true) {
          // 이웃한 두 점 사이를 한 토막씩 — 토막이 모두 같은 길이로 선다
          for (let k = 1; k < pts.length; k += 1) {
            const a = pts[k - 1];
            const b = pts[k];
            if (a === undefined || b === undefined) stageFail(`줄 ${ln.id} 의 토막 ${k}`);
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const cut = Math.min(8, len / 4);
            const ux = (b[0] - a[0]) / len;
            const uy = (b[1] - a[1]) / len;
            const sa: Vec2 = [round2(a[0] + ux * cut), round2(a[1] + uy * cut)];
            const sb: Vec2 = [round2(b[0] - ux * cut), round2(b[1] - uy * cut)];
            const chip = el(svg, 'line', {
              x1: sa[0],
              y1: sa[1],
              x2: sb[0],
              y2: sb[1],
              // 토막을 번갈아 칠해 자처럼 읽히게 한다
              stroke: k % 2 === 1 ? c.itemActive : c.accent,
              'stroke-width': 5,
              'stroke-linecap': 'round',
            });
            chipEls.push({ node: chip, a: sa, b: sb, k: k - 1 });
          }
        }
      });

      scene.points.forEach((_, i) => {
        const [x, y] = px(pointAt(scene, i, 'to'));
        pointEls.push(el(svg, 'circle', { cx: x, cy: y, r: 4, fill: c.primary }));
      });

      if (distance) {
        // 가장 가까이 · 가장 멀리 간 점에 거리를 붙인다 — 원점에서 바깥쪽으로 비켜 적는다
        const tag = (ids: readonly number[], d: number, ink: string): void => {
          for (const i of ids) {
            const q = pointAt(scene, i, 'to');
            const len = Math.hypot(q[0], q[1]);
            if (len === 0) stageFail(`점 ${i} 가 원점에 있어 비켜 적을 쪽이 없다`);
            const [x, y] = px(q);
            const ox2 = (q[0] / len) * 20;
            const oy2 = (-q[1] / len) * 20;
            el(svg, 'circle', { cx: x, cy: y, r: 6.5, fill: 'none', stroke: ink, 'stroke-width': 2 });
            const label = word(svg, x + ox2, y + oy2 + 4, fmtDist(d), {
              fill: c.text,
              size: fontSizes.xs,
              family: fonts.mono,
              anchor: 'middle',
              weight: '600',
            });
            // 줄 위에 얹혀도 읽히게 바탕색 테두리를 두른다
            label.setAttribute('stroke', c.bgSubtle);
            label.setAttribute('stroke-width', '3');
            label.setAttribute('paint-order', 'stroke');
          }
        };
        tag(distance.near.points, distance.near.dist, nearInk);
        tag(distance.far.points, distance.far.dist, farInk);
      }

      if (scene.origin) {
        const [x, y] = px(scene.origin.to);
        ringEl = el(svg, 'circle', {
          cx: x,
          cy: y,
          r: 9,
          fill: 'none',
          stroke: c.accent,
          'stroke-width': 3,
        });
      }
    }

    function drawPanel(scene: MatrixAsTransformScene): void {
      // 행렬 A
      const cellW = 34;
      const rowH = 26;
      const matX = panelX + 44;
      const matY = planeY + 8;
      word(svg, panelX, matY + rowH + 5, t('label.matrix', 'A ='), {
        fill: c.text,
        size: fontSizes.lg,
        family: fonts.mono,
        weight: '600',
      });
      const bracket = (x: number, dir: 1 | -1): void => {
        el(svg, 'path', {
          d: `M${x + dir * 6},${matY} H${x} V${matY + rowH * 2 + 8} H${x + dir * 6}`,
          fill: 'none',
          stroke: c.text,
          'stroke-width': 1.5,
        });
      };
      bracket(matX, 1);
      bracket(matX + cellW * 2 + 12, -1);
      scene.matrix.forEach((row, r) => {
        row.forEach((v, k) => {
          word(svg, matX + 6 + cellW * k + cellW / 2, matY + rowH * (r + 1) - 2, fmtNum(v), {
            fill: c.text,
            size: fontSizes.lg,
            family: fonts.mono,
            anchor: 'middle',
          });
        });
      });

      // 장부 — 걸음이 짚은 것이 한 줄씩 쌓인다
      const top = matY + rowH * 2 + 32;
      const rows = 5;
      const rowGap = Math.min(58, (planeY + side - top) / rows);
      const labelOf = (row: number, body: string, current: boolean): number => {
        const y = top + rowGap * row;
        if (current) {
          el(svg, 'rect', { x: panelX - 8, y: y - 12, width: 3, height: rowGap - 10, rx: 1.5, fill: c.accent });
        }
        word(svg, panelX, y, body, { fill: c.textMuted, size: fontSizes.sm });
        return y + 22;
      };
      const value = (y: number, body: string): void => {
        word(svg, panelX, y, body, { fill: c.text, size: fontSizes.lg, family: fonts.mono, weight: '600' });
      };

      if (scene.moved) {
        const y = labelOf(0, t('label.moved', 'Points that changed place'), scene.step === 'move');
        value(y, t('value.ratio', '{a} / {b}', { a: scene.moved.changed, b: scene.moved.total }));
      }
      if (scene.origin) {
        const y = labelOf(1, t('label.origin', 'Origin'), scene.step === 'origin');
        value(
          y,
          t('value.fromTo', '{p} → {q}', {
            p: pointText(pointAt(scene, scene.origin.index, 'from')),
            q: pointText(scene.origin.to),
          }),
        );
      }
      if (scene.distance) {
        const d = scene.distance;
        const y = labelOf(2, t('label.distances', 'Distances moved'), scene.step === 'distance');
        const slot = panelW / d.kinds.length;
        d.kinds.forEach((k, i) => {
          const ink = k === d.near.dist ? nearInk : k === d.far.dist ? farInk : c.text;
          word(svg, panelX + slot * i, y, fmtDist(k), {
            fill: ink,
            size: fontSizes.md,
            family: fonts.mono,
            weight: '600',
          });
        });
      }
      if (scene.straight) {
        const y = labelOf(3, t('label.straight', 'Straight lines'), scene.step === 'straight');
        value(y, t('value.ratio', '{a} / {b}', { a: scene.straight.count, b: scene.straight.total }));
      }
      if (scene.even) {
        const y = labelOf(4, t('label.even', 'Evenly spaced lines'), scene.step === 'even');
        value(y, t('value.ratio', '{a} / {b}', { a: scene.even.count, b: scene.even.total }));
      }
    }

    function drawStatic(scene: MatrixAsTransformScene): void {
      svg.textContent = '';
      drawCaption(scene);
      drawPlane(scene);
      drawPanel(scene);
    }

    function tween(ms: number, mine: number, frame: (s: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const t0 = Date.now();
        const beat = (): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          const s = Math.min(1, (Date.now() - t0) / ms);
          frame(ease(s));
          if (s >= 1) {
            done();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            beat();
          }, 16);
          timers.add(id);
        };
        beat();
      });
    }

    /** 걸음 1 — 점 전부와 줄 전부가 한 시계로 떠난 자리에서 A p 로 간다. */
    function moveAll(scene: MatrixAsTransformScene, mine: number): Promise<void> {
      if (pointEls.length !== scene.points.length) stageFail('옮길 점의 손잡이 수가 어긋난다');
      if (lineEls.length !== scene.lines.length) stageFail('옮길 줄의 손잡이 수가 어긋난다');
      const from = scene.points.map((p) => px(p));
      const to = scene.points.map((_, i) => px(pointAt(scene, i, 'to')));
      return tween(MOVE_MS, mine, (s) => {
        const now = from.map((a, i) => {
          const b = to[i] ?? stageFail(`점 ${i} 의 간 자리`);
          return [round2(a[0] + (b[0] - a[0]) * s), round2(a[1] + (b[1] - a[1]) * s)] as const;
        });
        pointEls.forEach((node, i) => {
          const q = now[i] ?? stageFail(`점 ${i}`);
          node.setAttribute('cx', String(q[0]));
          node.setAttribute('cy', String(q[1]));
        });
        scene.lines.forEach((ln, j) => {
          const node = lineEls[j] ?? stageFail(`줄 ${ln.id}`);
          node.setAttribute('points', pointList(ln.members.map((i) => now[i] ?? stageFail(`점 ${i}`))));
        });
      });
    }

    /** 걸음 2 — 고리가 원점으로 조여든다. */
    function pinOrigin(mine: number): Promise<void> {
      const ring = ringEl ?? stageFail('원점 고리가 없다');
      return tween(MARK_MS, mine, (s) => {
        ring.setAttribute('r', String(round2(28 - 19 * s)));
      });
    }

    /** 걸음 3 — 떠난 자리에서 간 자리까지 금이 뻗는다. */
    function stretchTrails(mine: number): Promise<void> {
      if (segEls.length === 0) stageFail('뻗을 금이 없다');
      return tween(MARK_MS, mine, (s) => {
        for (const g of segEls) {
          g.node.setAttribute('x2', String(round2(g.from[0] + (g.to[0] - g.from[0]) * s)));
          g.node.setAttribute('y2', String(round2(g.from[1] + (g.to[1] - g.from[1]) * s)));
        }
      });
    }

    /** 걸음 4 — 옮긴 줄을 첫 점에서 끝 점까지 한 획으로 긋는다. */
    function traceLines(scene: MatrixAsTransformScene, mine: number): Promise<void> {
      if (lineEls.length !== scene.lines.length) stageFail('그을 줄의 손잡이 수가 어긋난다');
      const lengths = scene.lines.map((ln) => {
        const pts = ln.members.map((i) => px(pointAt(scene, i, 'to')));
        let sum = 0;
        for (let k = 1; k < pts.length; k += 1) {
          const a = pts[k - 1] ?? stageFail(`줄 ${ln.id}`);
          const b = pts[k] ?? stageFail(`줄 ${ln.id}`);
          sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
        }
        return sum;
      });
      return tween(MARK_MS, mine, (s) => {
        lineEls.forEach((node, j) => {
          const len = lengths[j] ?? stageFail(`줄 ${j} 의 길이`);
          node.setAttribute('stroke-dasharray', `${round2(len * s)} ${round2(len)}`);
        });
      });
    }

    /** 걸음 5 — 토막이 줄을 따라 차례로 선다. */
    function layChips(mine: number): Promise<void> {
      if (chipEls.length === 0) stageFail('놓을 토막이 없다');
      const count = Math.max(...chipEls.map((g) => g.k)) + 1;
      const span = 1 / (count + 1);
      return tween(MARK_MS, mine, (s) => {
        for (const g of chipEls) {
          const local = Math.max(0, Math.min(1, (s - g.k * span) / (2 * span)));
          g.node.setAttribute('x2', String(round2(g.a[0] + (g.b[0] - g.a[0]) * local)));
          g.node.setAttribute('y2', String(round2(g.a[1] + (g.b[1] - g.a[1]) * local)));
        }
      });
    }

    return {
      async render(next: MatrixAsTransformScene, prev: MatrixAsTransformScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || prev === null || prev.step === next.step) return;
        let motion: Promise<void> | null = null;
        if (next.step === 'move' && prev.moved === null) motion = moveAll(next, mine);
        else if (next.step === 'origin' && prev.origin === null) motion = pinOrigin(mine);
        else if (next.step === 'distance' && prev.distance === null) motion = stretchTrails(mine);
        else if (next.step === 'straight' && prev.straight === null) motion = traceLines(next, mine);
        else if (next.step === 'even' && prev.even === null) motion = layChips(mine);
        if (motion === null) return;
        await motion;
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
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
