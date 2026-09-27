/**
 * shadow-ray 무대.
 *
 * 왼쪽은 옆에서 본 바닥 · 빛 · 공 · 풍선. 이번 점에서 빛 쪽으로 광선이 자라 나간다 —
 * 빛까지의 길(점선)을 따라 가다 무엇에 걸리면 거기서 멎고, 남은 길은 막힌 채 남는다.
 * 오른쪽은 같은 광선을 곧게 편 t 의 줄 — 0 부터 빛까지 거리 d 까지가 "빛까지의 길" 이고,
 * 맞은 것이 그 안에 떨어지는지 밖에 떨어지는지를 두 쪽이 한 시계로 함께 보인다.
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
} from '@ffacet/core/runtime';
import type { JudgedPoint, ShadowRayScene } from './scene';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 광선이 자라는 시간 */
const GROW_MS = 700;
const FRAME_MS = 16;

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function fmt2(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

export const shadowRayStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean },
    ): void {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = str;
    }

    function nameOf(id: string): string {
      switch (id) {
        case 'ball':
          return t('label.ball', 'Ball');
        case 'balloon':
          return t('label.balloon', 'Balloon');
        default:
          throw new Error(`shadow-ray-stage: 표시 이름이 없는 물체 '${id}'`);
      }
    }

    /**
     * 그 장면의 화면 전체. head 가 수이면 이번 걸음의 광선이 아직 t = head 까지만 자랐다.
     * null 이면 다 자란 끝 화면이다.
     */
    function draw(scene: ShadowRayScene, head: number | null): void {
      svg.textContent = '';
      const { base } = scene;
      const current: JudgedPoint | null = scene.step ? scene.judged[scene.judged.length - 1] ?? null : null;
      if (scene.step && (current === null || current.point !== scene.step.point)) {
        throw new Error('shadow-ray-stage: 이번 걸음의 점이 자취의 끝과 다르다');
      }
      const done = head === null;

      // ---------- 왼쪽: 옆에서 본 바닥 ----------
      const boxX = 16;
      const boxY = 64;
      const boxW = Math.round(W * 0.5);
      const boxH = H - boxY - 16;
      const underFloor = 44;
      const xs = [base.light.x, ...base.points.map((p) => p.x), ...base.blockers.flatMap((b) => [b.cx - b.r, b.cx + b.r])];
      // 바닥은 양 끝 점보다 조금 더 뻗어 이름 자리를 둔다
      const xMin = Math.min(...xs) - 0.5;
      const xMax = Math.max(...xs) + 0.9;
      const yMin = base.floorY;
      const yMax = Math.max(base.light.y, ...base.blockers.map((b) => b.cy + b.r)) + 0.3;
      const scale = Math.min(boxW / (xMax - xMin), (boxH - underFloor) / (yMax - yMin));
      const offX = boxX + (boxW - (xMax - xMin) * scale) / 2;
      const floorPx = boxY + (yMax - yMin) * scale;
      const px = (x: number): number => offX + (x - xMin) * scale;
      const py = (y: number): number => floorPx - (y - yMin) * scale;

      const world = el('g', {}, svg);

      // 바닥
      el('line', { x1: px(xMin), y1: floorPx, x2: px(xMax), y2: floorPx, stroke: colors.text, 'stroke-width': 2 }, world);
      label(world, px(xMax), floorPx + 17, t('label.floor', 'Floor'), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'end' });

      // 막을 수 있는 것
      for (const b of base.blockers) {
        el('circle', { cx: px(b.cx), cy: py(b.cy), r: b.r * scale, fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5 }, world);
        label(world, px(b.cx), py(b.cy) + 4, nameOf(b.id), { size: fontSizes.xs, anchor: 'middle' });
      }

      const pointOf = (id: string): { x: number; y: number; n: number } => {
        const i = base.points.findIndex((p) => p.id === id);
        const p = base.points[i];
        if (p === undefined) throw new Error(`shadow-ray-stage: 바탕에 없는 점 '${id}'`);
        return { x: p.x, y: p.y, n: i + 1 };
      };

      // 지나간 광선 — 흐리게
      const rays = el('g', {}, svg);
      for (const j of scene.judged) {
        if (j === current) continue;
        drawRay(rays, j, null, false);
      }
      if (current) drawRay(rays, current, head, true);

      function drawRay(parent: Element, j: JudgedPoint, headT: number | null, isNow: boolean): void {
        const o = pointOf(j.point);
        const at = (tv: number): [number, number] => [px(o.x + j.dir[0] * tv), py(o.y + j.dir[1] * tv)];
        const block = j.blockedBy === null ? null : j.tests.find((x) => x.id === j.blockedBy);
        if (block === undefined || (block !== null && block.tHit === null)) {
          throw new Error(`shadow-ray-stage: 막은 것 '${String(j.blockedBy)}' 의 t 가 없다`);
        }
        const stopT = block === null ? j.dist : (block.tHit as number);
        const reach = reachOf(j);
        const hd = headT === null ? reach : Math.min(headT, reach);
        const ink = isNow ? colors.primary : colors.textMuted;
        const [ox, oy] = at(0);
        const [lx, ly] = at(j.dist);

        // 빛까지의 길 — 광선이 가야 하는 곳
        if (isNow || block !== null) {
          const [sx, sy] = block === null ? [ox, oy] : at(stopT);
          el(
            'line',
            {
              x1: isNow ? ox : sx,
              y1: isNow ? oy : sy,
              x2: lx,
              y2: ly,
              stroke: colors.textMuted,
              'stroke-width': 1,
              'stroke-dasharray': '3 4',
              opacity: isNow ? 0.9 : 0.5,
            },
            parent,
          );
        }
        // 광선 — 빛까지의 길 안
        const inside = Math.min(hd, stopT);
        if (inside > 0) {
          const [hx, hy] = at(inside);
          el('line', { x1: ox, y1: oy, x2: hx, y2: hy, stroke: ink, 'stroke-width': isNow ? 2.5 : 1.5, 'stroke-linecap': 'round', opacity: isNow ? 1 : 0.6 }, parent);
        }
        // 빛 너머 — 광선이 계속 가도 막힘으로 세지 않는다
        if (block === null && hd > j.dist) {
          const [bx, by] = at(hd);
          el('line', { x1: lx, y1: ly, x2: bx, y2: by, stroke: ink, 'stroke-width': 1.25, 'stroke-dasharray': '6 4', opacity: isNow ? 0.8 : 0.45 }, parent);
        }
        // 맞은 자리
        for (const x of j.tests) {
          if (x.tHit === null || x.tHit > hd) continue;
          if (block === null && x.tHit < j.dist) throw new Error('shadow-ray-stage: 빛 앞에서 맞았는데 막은 것이 없다');
          const [hx, hy] = at(x.tHit);
          if (block !== null && x.id === block.id) {
            const s = isNow ? 6 : 4;
            const stroke = isNow ? colors.danger : colors.textMuted;
            el('line', { x1: hx - s, y1: hy - s, x2: hx + s, y2: hy + s, stroke, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, parent);
            el('line', { x1: hx - s, y1: hy + s, x2: hx + s, y2: hy - s, stroke, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, parent);
          } else if (x.tHit > j.dist) {
            el('circle', { cx: hx, cy: hy, r: isNow ? 4 : 3, fill: colors.bg, stroke: ink, 'stroke-width': 1.5 }, parent);
          }
        }
      }

      // 빛
      const lpx = px(base.light.x);
      const lpy = py(base.light.y);
      for (let k = 0; k < 8; k += 1) {
        const a = (k * Math.PI) / 4;
        el(
          'line',
          { x1: lpx + Math.cos(a) * 10, y1: lpy + Math.sin(a) * 10, x2: lpx + Math.cos(a) * 15, y2: lpy + Math.sin(a) * 15, stroke: colors.accent, 'stroke-width': 2, 'stroke-linecap': 'round' },
          world,
        );
      }
      el('circle', { cx: lpx, cy: lpy, r: 7, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 }, world);
      label(world, lpx + 20, lpy + 4, t('label.light', 'Light'), { size: fontSizes.xs });

      // 바닥의 점 — 번호, 판정 뒤에는 보임 0 / 1
      const judgedNow = new Map<string, JudgedPoint>();
      for (const j of scene.judged) {
        if (j === current && !done) continue;
        judgedNow.set(j.point, j);
      }
      base.points.forEach((p, i) => {
        const cx = px(p.x);
        const isNow = current !== null && current.point === p.id;
        el('circle', { cx, cy: floorPx, r: isNow ? 5.5 : 4.5, fill: isNow ? colors.primary : colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, world);
        label(world, cx, floorPx + 17, String(i + 1), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle', mono: true });
        const j = judgedNow.get(p.id);
        if (j) {
          const v = j.blockedBy === null ? 1 : 0;
          el(
            'rect',
            { x: cx - 10, y: floorPx + 23, width: 20, height: 17, rx: 3, fill: v === 1 ? colors.accent : colors.text, stroke: colors.text, 'stroke-width': 1 },
            world,
          );
          label(world, cx, floorPx + 36, String(v), { size: fontSizes.sm, fill: v === 1 ? colors.stateInk : colors.textInverse, anchor: 'middle', weight: '600', mono: true });
        }
      });

      // ---------- 오른쪽: 곧게 편 광선 ----------
      const rx0 = boxX + boxW + 36;
      const rx1 = W - 36;
      const rulerY = 170;
      // 줄의 끝은 바탕의 테두리 대각선 — 어느 점의 어느 교차도 이 안에 든다
      const tMax = Math.ceil(Math.hypot(xMax - xMin, yMax - yMin));
      const tx = (tv: number): number => rx0 + ((rx1 - rx0) * tv) / tMax;
      const panel = el('g', {}, svg);
      label(panel, rx0, 110, t('label.path', 'Path to light'), { size: fontSizes.sm, fill: colors.textMuted });
      el('line', { x1: tx(0), y1: rulerY, x2: tx(tMax), y2: rulerY, stroke: colors.border, 'stroke-width': 1.5 }, panel);
      for (let k = 0; k <= tMax; k += 2) {
        el('line', { x1: tx(k), y1: rulerY + 16, x2: tx(k), y2: rulerY + 20, stroke: colors.textMuted, 'stroke-width': 1 }, panel);
        label(panel, tx(k), rulerY + 32, String(k), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle', mono: true });
      }
      label(panel, tx(tMax) + 10, rulerY + 4, t('label.axis', 't'), { size: fontSizes.xs, fill: colors.textMuted, mono: true });

      const lit = [...judgedNow.values()].filter((j) => j.blockedBy === null).length;
      const shadow = judgedNow.size - lit;

      if (current) {
        const n = pointOf(current.point).n;
        const block = current.blockedBy === null ? null : current.tests.find((x) => x.id === current.blockedBy) ?? null;
        const stopT = block === null ? current.dist : (block.tHit as number);
        const reach = reachOf(current);
        const hd = head === null ? reach : Math.min(head, reach);

        // 빛까지의 길: 0..d
        el('rect', { x: tx(0), y: rulerY - 9, width: tx(current.dist) - tx(0), height: 18, rx: 3, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 }, panel);
        // 광선 머리
        const inside = Math.min(hd, stopT);
        el('line', { x1: tx(0), y1: rulerY, x2: tx(inside), y2: rulerY, stroke: colors.primary, 'stroke-width': 3, 'stroke-linecap': 'round' }, panel);
        if (block === null && hd > current.dist) {
          el('line', { x1: tx(current.dist), y1: rulerY, x2: tx(hd), y2: rulerY, stroke: colors.primary, 'stroke-width': 1.5, 'stroke-dasharray': '6 4', opacity: 0.8 }, panel);
        }
        // 0 = 점, d = 빛
        el('circle', { cx: tx(0), cy: rulerY, r: 4.5, fill: colors.primary, stroke: colors.text, 'stroke-width': 1 }, panel);
        label(panel, tx(0), rulerY - 16, t('label.point', 'Point {n}', { n }), { size: fontSizes.xs, anchor: 'middle' });
        el('circle', { cx: tx(current.dist), cy: rulerY, r: 5.5, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 }, panel);
        label(panel, tx(current.dist), rulerY - 16, t('label.light', 'Light'), { size: fontSizes.xs, anchor: 'middle' });
        label(panel, tx(current.dist), rulerY + 50, t('label.dist', 'd {d}', { d: fmt2(current.dist) }), { size: fontSizes.xs, anchor: 'middle', mono: true });
        // 맞은 것 — 광선 머리가 거기 닿은 뒤에 선다
        for (const x of current.tests) {
          if (x.tHit === null || x.tHit > hd) continue;
          const isBlock = block !== null && x.id === block.id;
          const cx = tx(x.tHit);
          el('line', { x1: cx, y1: rulerY - 12, x2: cx, y2: rulerY + 12, stroke: isBlock ? colors.danger : colors.textMuted, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, panel);
          label(panel, cx, rulerY - 30, nameOf(x.id), { size: fontSizes.xs, anchor: 'middle', fill: isBlock ? colors.danger : colors.textMuted, weight: '600' });
        }
        // 시험한 것마다 t 와 d
        if (done) {
          current.tests.forEach((x, i) => {
            const y = rulerY + 82 + i * 20;
            const name = nameOf(x.id);
            let str: string;
            if (x.tHit === null) str = t('test.miss', '{name}: no hit', { name });
            else if (x.tHit < current.dist) str = t('test.before', '{name}: t {t} < d {d}', { name, t: fmt2(x.tHit), d: fmt2(current.dist) });
            else str = t('test.after', '{name}: t {t} ≥ d {d}', { name, t: fmt2(x.tHit), d: fmt2(current.dist) });
            const isBlock = block !== null && x.id === block.id;
            label(panel, rx0, y, str, { size: fontSizes.sm, fill: isBlock ? colors.danger : colors.text, mono: true });
          });
        }
      }

      label(panel, rx0, H - 22, t('caption.tally', 'Lit: {lit} · Shadow: {shadow}', { lit, shadow }), { size: fontSizes.md, weight: '600' });

      // ---------- 캡션 ----------
      const cap = el('g', {}, svg);
      if (!current) {
        label(cap, 16, 26, t('caption.start', 'Each floor point will send one ray toward the light.'), { size: fontSizes.md, weight: '600' });
      } else {
        const n = pointOf(current.point).n;
        label(cap, 16, 26, t('caption.ray', 'Point {n} → light · d {d}', { n, d: fmt2(current.dist) }), { size: fontSizes.md, weight: '600' });
        if (done) {
          const v = current.blockedBy === null ? 1 : 0;
          label(cap, 16, 46, t('caption.visible', 'Light reaching point {n}: {v}', { n, v }), { size: fontSizes.sm, fill: colors.textMuted });
        }
      }
    }

    function reachOf(j: JudgedPoint): number {
      if (j.blockedBy !== null) {
        const b = j.tests.find((x) => x.id === j.blockedBy);
        if (b === undefined || b.tHit === null) throw new Error(`shadow-ray-stage: 막은 것 '${j.blockedBy}' 의 t 가 없다`);
        return b.tHit;
      }
      return Math.max(j.dist, ...j.tests.filter((x) => x.tHit !== null && (x.tHit as number) > j.dist).map((x) => x.tHit as number));
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
      });
    }

    async function grow(scene: ShadowRayScene, mine: number): Promise<void> {
      const j = scene.judged[scene.judged.length - 1];
      if (j === undefined) throw new Error('shadow-ray-stage: 자랄 광선이 없다');
      const reach = reachOf(j);
      const start = Date.now();
      draw(scene, 0);
      for (;;) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / GROW_MS);
        if (p >= 1) return;
        draw(scene, reach * p);
      }
    }

    return {
      async render(next: ShadowRayScene, _prev: ShadowRayScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (opts.animate && next.step !== null) {
          await grow(next, mine);
          if (mine !== gen || destroyed) return;
        }
        draw(next, null);
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
