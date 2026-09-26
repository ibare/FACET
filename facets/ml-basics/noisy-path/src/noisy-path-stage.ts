/**
 * noisy-path 무대.
 *
 * 주인공은 (w, b) 평면에서 **한 번 옮길 때 가는 방향**이다. 갱신마다 그 자리에서 두 바늘이 선다 —
 * 전체 데이터의 내리막(회색)과 뽑힌 점 하나가 가리키는 방향(주황). 둘 사이의 각이 호로 벌어지고,
 * 자리는 주황 쪽으로 실제로 미끄러진다. 지나온 자리를 이은 선이 이쪽저쪽으로 꺾인다.
 * 아래 줄은 갱신마다의 비낌(기준 바늘에서 기운 바늘)과 전체 손실을 쌓는다.
 * 오른쪽은 다섯 점과 지금의 선 — 어느 점 하나를 보았는지.
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
} from '@ffacet/core/runtime';
import type { NoisyPathUpdate, WB } from './algorithm.js';
import { currentWB, type NoisyPathScene } from './scene.js';

const H = 420;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 400;
const FRAME_MS = 16;
/** 바늘 길이 상한 (px) — 평면이 작으면 줄인다 */
const NEEDLE_MAX = 58;

type Rect = { x: number; y: number; w: number; h: number };

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** 표시용 — toFixed 뒤 붙임표를 빼기표로 */
function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  if (/^-0(\.0+)?$/.test(s)) throw new Error(`noisy-path 무대: ${v} 가 -0 으로 찍힌다`);
  return s.replace('-', '−');
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function clamp01(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

export const noisyPathStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<NoisyPathScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const fsSm = parseFloat(fontSizes.sm);
    const fsXs = parseFloat(fontSizes.xs);
    const fsMd = parseFloat(fontSizes.md);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    // 자리 — 캔버스 폭에서 역산
    const pad = 16;
    const rightW = Math.min(200, Math.round(W * 0.3));
    const planeBox: Rect = { x: pad + 14, y: 58, w: W - pad * 2 - rightW - 30, h: 240 };
    const dataBox: Rect = { x: W - pad - rightW, y: 58, w: rightW, h: 222 };
    const rowTop = 322;
    const rowLabelW = 84;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(
      str: string,
      x: number,
      y: number,
      opts: { size?: number; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        fill: opts.fill ?? colors.text,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fsSm,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = str;
      return node;
    }

    function arrowHead(tip: { x: number; y: number }, ux: number, uy: number, fill: string): void {
      const s = 7;
      const bx = tip.x - ux * s;
      const by = tip.y - uy * s;
      const px = -uy * s * 0.5;
      const py = ux * s * 0.5;
      el('polygon', {
        points: `${round(tip.x)},${round(tip.y)} ${round(bx + px)},${round(by + py)} ${round(bx - px)},${round(by - py)}`,
        fill,
      });
    }

    /** (w, b) 평면 → 화면. 두 축은 같은 축척이라 각이 화면에서도 참이다 */
    function planeMap(scene: NoisyPathScene) {
      const base = scene.base;
      if (!base) throw new Error('noisy-path 무대: 바탕 없이 평면을 그리려 했다');
      const inner = 26;
      const spanW = base.plane.wMax - base.plane.wMin;
      const spanB = base.plane.bMax - base.plane.bMin;
      if (!(spanW > 0) || !(spanB > 0)) throw new Error('noisy-path 무대: 평면 범위가 비었다');
      const k = Math.min((planeBox.w - inner * 2) / spanW, (planeBox.h - inner * 2) / spanB);
      const cx = planeBox.x + planeBox.w / 2;
      const cy = planeBox.y + planeBox.h / 2;
      const mw = (base.plane.wMin + base.plane.wMax) / 2;
      const mb = (base.plane.bMin + base.plane.bMax) / 2;
      return (p: WB) => ({ x: cx + (p.w - mw) * k, y: cy - (p.b - mb) * k, k });
    }

    function inRect(r: Rect, x: number, y: number): boolean {
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }

    function drawPlane(scene: NoisyPathScene, p: number): void {
      const base = scene.base;
      if (!base) throw new Error('noisy-path 무대: 바탕 없이 평면을 그리려 했다');
      const map = planeMap(scene);
      el('rect', { ...planeBox, fill: colors.bgSubtle, stroke: colors.border, rx: 4 });
      // 축 이름은 틀 안 모서리에 — 오른쪽으로 w, 위로 b
      label(t('axis.w', 'w'), planeBox.x + planeBox.w - 8, planeBox.y + planeBox.h - 10, {
        anchor: 'end',
        fill: colors.textMuted,
        mono: true,
      });
      label(t('axis.b', 'b'), planeBox.x + 8, planeBox.y + 10, { fill: colors.textMuted, mono: true });

      // 같은 손실 고리 — 틀 밖은 끊는다
      for (const c of base.contours) {
        const n = 144;
        let d = '';
        let pen = false;
        for (let i = 0; i <= n; i += 1) {
          const th = (i / n) * Math.PI * 2;
          const ew = c.rx * Math.cos(th);
          const eb = c.ry * Math.sin(th);
          const q = map({
            w: base.center.w + ew * Math.cos(c.rot) - eb * Math.sin(c.rot),
            b: base.center.b + ew * Math.sin(c.rot) + eb * Math.cos(c.rot),
          });
          if (!inRect(planeBox, q.x, q.y)) {
            pen = false;
            continue;
          }
          d += `${pen ? 'L' : 'M'}${round(q.x)},${round(q.y)}`;
          pen = true;
        }
        if (d) el('path', { d, fill: 'none', stroke: colors.border, 'stroke-width': 1 });
      }
      const cm = map(base.center);
      el('path', {
        d: `M${round(cm.x - 4)},${round(cm.y)}L${round(cm.x + 4)},${round(cm.y)}M${round(cm.x)},${round(cm.y - 4)}L${round(cm.x)},${round(cm.y + 4)}`,
        stroke: colors.textMuted,
        'stroke-width': 1.2,
      });

      // 지나온 자취
      const past = scene.step.kind === 'update' ? scene.updates.slice(0, -1) : scene.updates;
      const s0 = map(scene.start);
      let dTrail = `M${round(s0.x)},${round(s0.y)}`;
      for (const u of past) {
        const q = map(u.to);
        dTrail += `L${round(q.x)},${round(q.y)}`;
      }
      if (past.length > 0) {
        el('path', { d: dTrail, fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.5, 'stroke-linejoin': 'round' });
      }
      for (const at of [scene.start, ...past.map((u) => u.to)]) {
        const q = map(at);
        el('circle', { cx: q.x, cy: q.y, r: 2.5, fill: colors.textMuted });
      }

      if (scene.step.kind === 'start') {
        const q = map(scene.start);
        el('circle', { cx: q.x, cy: q.y, r: 5, fill: colors.text });
        return;
      }

      const u = currentUpdate(scene);
      const from = map(u.from);
      const to = map(u.to);
      const pNeedle = ease(clamp01(p / 0.4));
      const pMove = ease(clamp01((p - 0.4) / 0.6));
      const needle = Math.min(NEEDLE_MAX, planeBox.h * 0.24);

      // 두 바늘 — 화면 좌표는 b 가 위로
      const aFull = Math.atan2(-u.gFull.b, -u.gFull.w);
      const aPoint = Math.atan2(-u.gPoint.b, -u.gPoint.w);
      const aSweep = aFull + ((u.angle * Math.PI) / 180) * pNeedle;
      const len = needle * (0.35 + 0.65 * pNeedle);
      const tipFull = { x: from.x + Math.cos(aFull) * len, y: from.y - Math.sin(aFull) * len };
      const tipPoint = { x: from.x + Math.cos(aSweep) * len, y: from.y - Math.sin(aSweep) * len };
      el('line', {
        x1: from.x,
        y1: from.y,
        x2: tipFull.x,
        y2: tipFull.y,
        stroke: colors.textMuted,
        'stroke-width': 2,
        'stroke-dasharray': '5 3',
      });
      arrowHead(tipFull, Math.cos(aFull), -Math.sin(aFull), colors.textMuted);
      el('line', {
        x1: from.x,
        y1: from.y,
        x2: tipPoint.x,
        y2: tipPoint.y,
        stroke: colors.itemActive,
        'stroke-width': 2,
      });
      arrowHead(tipPoint, Math.cos(aSweep), -Math.sin(aSweep), colors.itemActive);

      // 비낌 호
      const arcR = needle * 0.5;
      const sweepRad = aSweep - aFull;
      const steps = Math.max(2, Math.ceil(Math.abs(sweepRad) / 0.05));
      let dArc = '';
      for (let i = 0; i <= steps; i += 1) {
        const a = aFull + (sweepRad * i) / steps;
        dArc += `${i === 0 ? 'M' : 'L'}${round(from.x + Math.cos(a) * arcR)},${round(from.y - Math.sin(a) * arcR)}`;
      }
      el('path', { d: dArc, fill: 'none', stroke: colors.itemActive, 'stroke-width': 1.5 });
      if (pNeedle >= 1) {
        const mid = aFull + sweepRad / 2;
        const lr = arcR + 14;
        label(`${fmt(u.angle, 0)}°`, from.x + Math.cos(mid) * lr, from.y - Math.sin(mid) * lr, {
          anchor: 'middle',
          fill: colors.itemActive,
          weight: '600',
        });
        // 바늘 끝 이름 — 서로 반대쪽으로 조금 벌려 둔다
        const side = u.angle >= 0 ? 1 : -1;
        const push = 0.4;
        const lf = aFull - side * push;
        const lp = aPoint + side * push;
        const rr = needle + 14;
        label(t('label.full', 'Full downhill'), from.x + Math.cos(lf) * rr, from.y - Math.sin(lf) * rr, {
          anchor: Math.cos(lf) >= 0.2 ? 'start' : Math.cos(lf) <= -0.2 ? 'end' : 'middle',
          fill: colors.textMuted,
          size: fsXs,
        });
        label(
          t('label.point', 'Point {i}', { i: u.point }),
          from.x + Math.cos(lp) * rr,
          from.y - Math.sin(lp) * rr,
          {
            anchor: Math.cos(lp) >= 0.2 ? 'start' : Math.cos(lp) <= -0.2 ? 'end' : 'middle',
            fill: colors.itemActive,
            size: fsXs,
            weight: '600',
          },
        );
      }

      // 실제로 옮긴 만큼 — 주황 쪽으로 미끄러진다
      const at = { x: from.x + (to.x - from.x) * pMove, y: from.y + (to.y - from.y) * pMove };
      el('line', {
        x1: from.x,
        y1: from.y,
        x2: at.x,
        y2: at.y,
        stroke: colors.itemActive,
        'stroke-width': 3,
        'stroke-linecap': 'butt',
      });
      el('circle', { cx: from.x, cy: from.y, r: 3, fill: colors.textMuted });
      el('circle', { cx: at.x, cy: at.y, r: 5, fill: colors.text });
    }

    function currentUpdate(scene: NoisyPathScene): NoisyPathUpdate {
      if (scene.step.kind !== 'update') throw new Error('noisy-path 무대: 이번 걸음이 갱신이 아니다');
      const u = scene.updates[scene.step.k - 1];
      if (!u) throw new Error(`noisy-path 무대: 갱신 ${scene.step.k} 가 자취에 없다`);
      return u;
    }

    function drawData(scene: NoisyPathScene, p: number): void {
      const base = scene.base;
      if (!base) throw new Error('noisy-path 무대: 바탕 없이 점을 그리려 했다');
      const r = base.data;
      const inner = 10;
      const mapX = (x: number) => dataBox.x + inner + ((x - r.xMin) / (r.xMax - r.xMin)) * (dataBox.w - inner * 2);
      const mapY = (y: number) =>
        dataBox.y + dataBox.h - inner - ((y - r.yMin) / (r.yMax - r.yMin)) * (dataBox.h - inner * 2);
      el('rect', { ...dataBox, fill: colors.bgSubtle, stroke: colors.border, rx: 4 });
      label(t('label.data', 'Points and ŷ = w·x + b'), dataBox.x, dataBox.y - 12, { fill: colors.textMuted, size: fsXs });
      const xL = r.xMin;
      const xR = r.xMax;
      const lineOf = (at: WB, stroke: string, dash: string | null, width: number) => {
        const attrs: Record<string, string | number> = {
          x1: mapX(xL),
          y1: mapY(at.w * xL + at.b),
          x2: mapX(xR),
          y2: mapY(at.w * xR + at.b),
          stroke,
          'stroke-width': width,
        };
        if (dash) attrs['stroke-dasharray'] = dash;
        el('line', attrs);
      };

      let picked: number | null = null;
      if (scene.step.kind === 'update') {
        const u = currentUpdate(scene);
        picked = u.point;
        const pMove = ease(clamp01((p - 0.4) / 0.6));
        lineOf(u.from, colors.textMuted, '4 3', 1);
        const x = scene.xs[u.point];
        const y = scene.ys[u.point];
        if (x === undefined || y === undefined) throw new Error(`noisy-path 무대: 점 ${u.point} 가 없다`);
        // 이 점이 본 틀림 — 갱신 전 선에서
        el('line', {
          x1: mapX(x),
          y1: mapY(y),
          x2: mapX(x),
          y2: mapY(u.from.w * x + u.from.b),
          stroke: colors.itemActive,
          'stroke-width': 2,
        });
        const now = { w: u.from.w + (u.to.w - u.from.w) * pMove, b: u.from.b + (u.to.b - u.from.b) * pMove };
        lineOf(now, colors.text, null, 2);
      } else {
        lineOf(currentWB(scene), colors.text, null, 2);
      }
      scene.xs.forEach((x, i) => {
        const y = scene.ys[i];
        if (y === undefined) throw new Error(`noisy-path 무대: 점 ${i} 의 y 가 없다`);
        const on = i === picked;
        el('circle', { cx: mapX(x), cy: mapY(y), r: on ? 5.5 : 3.5, fill: on ? colors.itemActive : colors.textMuted });
        label(String(i), mapX(x) + 8, mapY(y) - 8, {
          size: fsXs,
          fill: on ? colors.itemActive : colors.textMuted,
          weight: on ? '600' : 'normal',
        });
      });
    }

    function drawRow(scene: NoisyPathScene, p: number): void {
      const base = scene.base;
      if (!base) throw new Error('noisy-path 무대: 바탕 없이 줄을 그리려 했다');
      const cols = scene.order.length + 1;
      const x0 = pad + rowLabelW;
      const colW = (W - pad - x0) / cols;
      const yHead = rowTop;
      const yDial = rowTop + 30;
      const yAngle = rowTop + 62;
      const yLoss = rowTop + 84;
      const dialR = Math.min(15, colW * 0.3);
      label(t('label.angle', 'Off by'), pad, yDial, { fill: colors.textMuted });
      label(t('label.loss', 'Full loss'), pad, yLoss, { fill: colors.textMuted });
      el('line', { x1: pad, y1: yLoss - 12, x2: W - pad, y2: yLoss - 12, stroke: colors.border, 'stroke-width': 1 });

      const shown = scene.updates.length;
      const nowK = scene.step.kind === 'update' ? scene.step.k : 0;
      for (let j = 0; j < cols; j += 1) {
        const cx = x0 + colW * (j + 0.5);
        const isNow = j === nowK;
        const head = j === 0 ? t('label.start', 'Start') : t('label.update', '#{k}', { k: j });
        label(head, cx, yHead, {
          anchor: 'middle',
          size: fsXs,
          fill: isNow ? colors.text : colors.textMuted,
          weight: isNow ? '600' : 'normal',
        });
        if (j === 0) {
          label(fmt(base.lossStart, 2), cx, yLoss, {
            anchor: 'middle',
            mono: true,
            weight: isNow ? '600' : 'normal',
          });
          continue;
        }
        if (j > shown) {
          el('circle', {
            cx,
            cy: yDial,
            r: dialR,
            fill: 'none',
            stroke: colors.border,
            'stroke-dasharray': '2 3',
          });
          continue;
        }
        const u = scene.updates[j - 1];
        if (!u) throw new Error(`noisy-path 무대: 갱신 ${j} 가 자취에 없다`);
        const pDial = isNow ? ease(clamp01(p / 0.4)) : 1;
        el('circle', {
          cx,
          cy: yDial,
          r: dialR,
          fill: colors.bg,
          stroke: isNow ? colors.itemActive : colors.border,
          'stroke-width': isNow ? 2 : 1,
        });
        // 기준 — 전체 내리막은 늘 위
        el('line', {
          x1: cx,
          y1: yDial,
          x2: cx,
          y2: yDial - dialR + 2,
          stroke: colors.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 2',
        });
        const a = ((u.angle * Math.PI) / 180) * pDial;
        el('line', {
          x1: cx,
          y1: yDial,
          x2: cx - Math.sin(a) * (dialR - 2),
          y2: yDial - Math.cos(a) * (dialR - 2),
          stroke: colors.itemActive,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        label(`${fmt(u.angle, 0)}°`, cx, yAngle, {
          anchor: 'middle',
          size: fsXs,
          fill: isNow ? colors.itemActive : colors.textMuted,
          weight: isNow ? '600' : 'normal',
        });
        const rose = u.lossAfter > u.lossBefore;
        label(`${rose ? '▲' : ''}${fmt(u.lossAfter, 2)}`, cx, yLoss, {
          anchor: 'middle',
          mono: true,
          fill: rose ? colors.danger : colors.text,
          weight: isNow || rose ? '600' : 'normal',
        });
      }
    }

    function drawCaption(scene: NoisyPathScene): void {
      if (scene.step.kind === 'start') {
        label(
          t('caption.start', 'Start: (w, b) = ({w}, {b})', { w: fmt(scene.start.w, 2), b: fmt(scene.start.b, 2) }),
          pad,
          22,
          { size: fsMd },
        );
        return;
      }
      const u = currentUpdate(scene);
      label(
        t('caption.update', 'Update #{k} · looked at point {i} only · angle off the full downhill: {deg}°', {
          k: u.k,
          i: u.point,
          deg: fmt(u.angle, 0),
        }),
        pad,
        22,
        { size: fsMd },
      );
      if (u.lossAfter > u.lossBefore) {
        label(
          t('caption.rise', 'Full loss went up: {before} → {after}', {
            before: fmt(u.lossBefore, 2),
            after: fmt(u.lossAfter, 2),
          }),
          pad,
          42,
          { fill: colors.danger, weight: '600' },
        );
      } else if (scene.updates.length === scene.order.length) {
        const base = scene.base;
        if (!base) throw new Error('noisy-path 무대: 바탕이 없다');
        label(
          t('caption.total', 'Full loss since the start: {start} → {now}', {
            start: fmt(base.lossStart, 2),
            now: fmt(u.lossAfter, 2),
          }),
          pad,
          42,
          { fill: colors.textMuted },
        );
      }
    }

    function drawStatic(scene: NoisyPathScene, p: number): void {
      svg.textContent = '';
      if (!scene.base) return;
      drawCaption(scene);
      drawPlane(scene, p);
      drawData(scene, p);
      drawRow(scene, p);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = () => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function animate(scene: NoisyPathScene, mine: number): Promise<void> {
      const t0 = Date.now();
      drawStatic(scene, 0);
      for (;;) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const p = clamp01((Date.now() - t0) / MOTION_MS);
        if (p >= 1) break;
        drawStatic(scene, p);
      }
      drawStatic(scene, 1);
    }

    return {
      async render(next, prev, opts): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const oneMore =
          prev !== null &&
          next.step.kind === 'update' &&
          prev.base !== null &&
          next.updates.length === prev.updates.length + 1;
        if (!opts.animate || !oneMore) {
          drawStatic(next, 1);
          return;
        }
        await animate(next, mine);
        if (mine === gen && !destroyed) drawStatic(next, 1);
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
