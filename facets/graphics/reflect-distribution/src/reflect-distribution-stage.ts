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
import { direction, mirrorAngle } from './algorithm.js';
import type { ReflectDistributionScene } from './scene.js';

const H = 380;
const SVG = 'http://www.w3.org/2000/svg';
/** 재는 쪽이 돌아오는 시간 · 값이 솟는 시간 · 맞바꾸는 시간 */
const TURN_MS = 300;
const GROW_MS = 300;
const SWAP_MS = 600;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function rnd(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

/** 부호 있는 정수 도 — +40 · −60 · 0 */
function fmtDeg(deg: number): string {
  const d = Math.round(deg);
  if (d > 0) return `+${d}`;
  if (d < 0) return `−${-d}`;
  return '0';
}

function fmtVal(v: number): string {
  return v.toFixed(3);
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

type Handles = {
  probe: SVGGElement | null;
  spoke: SVGGElement | null;
  spokeLine: SVGLineElement | null;
  spokeTip: SVGCircleElement | null;
  lobe: SVGPolygonElement | null;
  value: SVGTextElement | null;
  swapLight: SVGGElement | null;
  swapSpoke: SVGGElement | null;
  swapSpokeLine: SVGLineElement | null;
  swapSpokeTip: SVGCircleElement | null;
  swapReadout: SVGGElement | null;
};

export const reflectDistributionStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    const W = PIECE_CANVAS_W;
    const cx = W / 2;
    const baseY = H - 64;
    /** 반구의 반지름 — 캔버스에서 역산하고 상한만 둔다 */
    const R = Math.min(W / 2 - 72, baseY - 70, 250);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, x: number, y: number, text: string, attrs: Attrs): SVGTextElement {
      const node = el('text', {
        x: rnd(x),
        y: rnd(y),
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        ...attrs,
      }, parent);
      node.textContent = text;
      return node;
    }

    /** 법선에서 θ 만큼 기운 쪽, 중심에서 r 떨어진 화면 자리 */
    function at(deg: number, r: number): [number, number] {
      const d = direction(deg);
      return [rnd(cx + r * d[0]), rnd(baseY - r * d[1])];
    }

    function radius(f: number, top: number): number {
      return (f / top) * R;
    }

    /** 법선 쪽으로 곧게 선 모양을 θ 만큼 돌린다 — +θ 는 +x 쪽이라 화면에서 시계 방향 */
    function turn(g: SVGGElement, deg: number): void {
      g.setAttribute('transform', `rotate(${rnd(deg)} ${rnd(cx)} ${rnd(baseY)})`);
    }

    /**
     * 들어오는 빛 — 굵은 화살은 바깥 절반에 두고 점까지는 가는 선으로 잇는다.
     * 안쪽 절반은 잰 값의 선이 서는 자리라, 맞바꿨을 때 빛과 값이 한 선에 겹치지 않는다
     */
    function lightArrow(parent: Element, deg: number, color: string): SVGGElement {
      const g = el('g', {}, parent);
      el('line', {
        x1: rnd(cx), y1: rnd(baseY - R * 0.44), x2: rnd(cx), y2: rnd(baseY - 6),
        stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '2 3',
      }, g);
      el('line', {
        x1: rnd(cx), y1: rnd(baseY - R * 0.9), x2: rnd(cx), y2: rnd(baseY - R * 0.44 - 10),
        stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round',
      }, g);
      const head = baseY - R * 0.44;
      el('polygon', {
        points: `${rnd(cx)},${rnd(head)} ${rnd(cx - 6)},${rnd(head - 13)} ${rnd(cx + 6)},${rnd(head - 13)}`,
        fill: color,
      }, g);
      turn(g, deg);
      return g;
    }

    function spokeAt(parent: Element, deg: number, r: number, color: string, width: number): {
      g: SVGGElement; line: SVGLineElement; tip: SVGCircleElement;
    } {
      const g = el('g', {}, parent);
      const line = el('line', {
        x1: rnd(cx), y1: rnd(baseY), x2: rnd(cx), y2: rnd(baseY - r),
        stroke: color, 'stroke-width': width, 'stroke-linecap': 'butt',
      }, g);
      const tip = el('circle', { cx: rnd(cx), cy: rnd(baseY - r), r: width + 1.5, fill: color }, g);
      turn(g, deg);
      return { g, line, tip };
    }

    function setSpokeLength(line: SVGLineElement, tip: SVGCircleElement, r: number): void {
      line.setAttribute('y2', String(rnd(baseY - r)));
      tip.setAttribute('cy', String(rnd(baseY - r)));
    }

    function pointsOf(list: [number, number][]): string {
      return list.map(([x, y]) => `${x},${y}`).join(' ');
    }

    /** 잰 끝들을 점에서 시작해 점으로 닫는다 — 튄 값이 차지한 모양 */
    function closed(tips: [number, number][]): [number, number][] {
      const o: [number, number] = [rnd(cx), rnd(baseY)];
      return [o, ...tips, o];
    }

    function drawStatic(scene: ReflectDistributionScene): Handles {
      svg.textContent = '';
      const h: Handles = {
        probe: null, spoke: null, spokeLine: null, spokeTip: null, lobe: null, value: null,
        swapLight: null, swapSpoke: null, swapSpokeLine: null, swapSpokeTip: null, swapReadout: null,
      };
      const root = el('g', {}, svg);
      const step = scene.step;
      const current = step.kind === 'measure' ? step.out : null;
      const settled = scene.swapped !== null;

      // 면과 반구
      el('rect', { x: rnd(cx - R - 44), y: rnd(baseY), width: rnd(2 * R + 88), height: 12, fill: colors.bgSubtle }, root);
      el('line', {
        x1: rnd(cx - R - 44), y1: rnd(baseY), x2: rnd(cx + R + 44), y2: rnd(baseY),
        stroke: colors.textMuted, 'stroke-width': 1.5,
      }, root);
      el('path', {
        d: `M ${rnd(cx - R)} ${rnd(baseY)} A ${rnd(R)} ${rnd(R)} 0 0 1 ${rnd(cx + R)} ${rnd(baseY)}`,
        fill: 'none', stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '3 4',
      }, root);

      // 거울 자리 — 들어온 쪽에서 정해진다
      const mirror = mirrorAngle(scene.incoming);
      const [mx, my] = at(mirror, R);
      el('line', {
        x1: rnd(cx), y1: rnd(baseY), x2: mx, y2: my,
        stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '6 4',
      }, root);
      const [mlx, mly] = at(mirror, R + 50);
      label(root, mlx, mly, t('label.mirror', 'Mirror'), { fill: colors.textMuted, 'font-size': fontSizes.xs });

      // 바닥 — 거울 자리에서 먼 쪽이 붙는 값
      if (scene.floor !== null && scene.top !== null) {
        const rf = radius(scene.floor, scene.top);
        el('path', {
          d: `M ${rnd(cx - rf)} ${rnd(baseY)} A ${rnd(rf)} ${rnd(rf)} 0 0 1 ${rnd(cx + rf)} ${rnd(baseY)}`,
          fill: 'none', stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 3',
        }, root);
      }

      // 잴 방향들 — 눈금 · 각 · 잰 값
      const measuredBy = new Map(scene.measured.map((m) => [m.out, m]));
      for (const out of scene.outgoing) {
        const [ax, ay] = at(out, R - 5);
        const [bx, by] = at(out, R + 5);
        el('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: colors.textMuted, 'stroke-width': 1 }, root);
        const [px, py] = at(out, R + 24);
        const m = measuredBy.get(out);
        const isNow = out === current;
        label(root, px, py - 7, `${fmtDeg(out)}°`, {
          fill: m === undefined ? colors.textMuted : colors.text,
          'font-weight': isNow ? 700 : 400,
        });
        if (m !== undefined) {
          const v = label(root, px, py + 8, fmtVal(m.f), {
            fill: settled ? colors.textMuted : colors.primary,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'font-weight': isNow ? 700 : 400,
          });
          if (isNow) h.value = v;
        }
      }

      // 재는 쪽
      if (step.kind === 'measure') {
        const g = el('g', {}, root);
        el('line', {
          x1: rnd(cx), y1: rnd(baseY), x2: rnd(cx), y2: rnd(baseY - R),
          stroke: colors.textMuted, 'stroke-width': 1,
        }, g);
        turn(g, step.out);
        h.probe = g;
      }

      // 튄 값 — 방향마다 선 하나, 끝을 이으면 몰린 모양
      if (scene.top !== null && scene.measured.length > 0) {
        const top = scene.top;
        const ink = settled ? colors.border : colors.primary;
        const tips = scene.measured.map((m) => at(m.out, radius(m.f, top)));
        h.lobe = el('polygon', {
          points: pointsOf(closed(tips)),
          fill: ink, 'fill-opacity': 0.12, stroke: ink, 'stroke-width': 2, 'stroke-linejoin': 'round',
        }, root);
        for (const m of scene.measured) {
          const s = spokeAt(root, m.out, radius(m.f, top), ink, 1.5);
          if (m.out === current) {
            h.spoke = s.g;
            h.spokeLine = s.line;
            h.spokeTip = s.tip;
          }
        }
      }

      // 들어오는 빛
      lightArrow(root, scene.incoming, colors.accent);
      const [lx, ly] = at(scene.incoming + (scene.incoming >= 0 ? 9 : -9), R * 0.8);
      label(root, lx, ly, t('label.light', 'Light'), { fill: colors.text, 'font-weight': 700 });

      // 맞바꾼 짝
      const sw = scene.swapped;
      if (sw !== null && scene.top !== null) {
        const top = scene.top;
        spokeAt(root, sw.b, radius(sw.forward, top), colors.primary, 3);
        if (sw.a !== scene.incoming) lightArrow(root, sw.a, colors.primary);
        h.swapLight = lightArrow(root, sw.b, colors.itemComparing);
        const s = spokeAt(root, sw.a, radius(sw.backward, top), colors.itemComparing, 3);
        h.swapSpoke = s.g;
        h.swapSpokeLine = s.line;
        h.swapSpokeTip = s.tip;

        const rx = W - 30;
        const line1 = el('g', {}, root);
        label(line1, rx, 26, t('readout.pair', 'In {a}° → out {b}°: f {v}', {
          a: fmtDeg(sw.a), b: fmtDeg(sw.b), v: fmtVal(sw.forward),
        }), { fill: colors.text, 'text-anchor': 'end' });
        el('line', { x1: rx + 6, y1: 26, x2: rx + 20, y2: 26, stroke: colors.primary, 'stroke-width': 3 }, line1);
        const line2 = el('g', {}, root);
        label(line2, rx, 46, t('readout.pair', 'In {a}° → out {b}°: f {v}', {
          a: fmtDeg(sw.b), b: fmtDeg(sw.a), v: fmtVal(sw.backward),
        }), { fill: colors.text, 'text-anchor': 'end' });
        el('line', { x1: rx + 6, y1: 46, x2: rx + 20, y2: 46, stroke: colors.itemComparing, 'stroke-width': 3 }, line2);
        h.swapReadout = line2;
      }

      // 점
      el('circle', { cx: rnd(cx), cy: rnd(baseY), r: 4, fill: colors.text }, root);

      // 재질 — 바뀌지 않는 값
      label(root, 12, 26, t('label.material', 'Material'), {
        fill: colors.textMuted, 'text-anchor': 'start', 'font-weight': 700,
      });
      const mat = scene.material;
      label(root, 12, 46, `k_d ${mat.kd} · k_s ${mat.ks} · n ${mat.n}`, {
        fill: colors.text, 'text-anchor': 'start', 'font-family': fonts.mono, 'font-size': fontSizes.xs,
      });

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (step.kind === 'start') {
        caption = t('caption.start', 'Light comes in at {deg}°.', { deg: fmtDeg(scene.incoming) });
      } else if (step.kind === 'measure') {
        const m = measuredBy.get(step.out);
        if (m === undefined) throw new Error(`reflect-distribution-stage: ${step.out}° 의 잰 값이 장면에 없다`);
        caption = m.mirror
          ? t('caption.mirror', 'Out {deg}°, the mirror of the incoming side. f: {v}', { deg: fmtDeg(m.out), v: fmtVal(m.f) })
          : t('caption.measure', 'Out {deg}°. f: {v}', { deg: fmtDeg(m.out), v: fmtVal(m.f) });
      } else {
        caption = t('caption.swap', 'In and out swapped.');
      }
      label(root, cx, H - 22, caption, { fill: colors.text, 'font-size': fontSizes.md });

      return h;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
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

    /** 한 시계로 0→1 을 흘린다. 세대가 바뀌거나 거두면 곧바로 물러난다 */
    async function tween(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      frame(0);
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const p = Math.min(1, (Date.now() - start) / ms);
        frame(p);
        if (p >= 1) return true;
        await wait(FRAME_MS);
      }
    }

    function need<T>(v: T | null, what: string): T {
      if (v === null) throw new Error(`reflect-distribution-stage: 운동할 ${what} 이 그려지지 않았다`);
      return v;
    }

    async function animateMeasure(mine: number, scene: ReflectDistributionScene, h: Handles): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'measure' || scene.top === null) throw new Error('reflect-distribution-stage: measure 장면이 아니다');
      const top = scene.top;
      const probe = need(h.probe, '재는 쪽');
      const line = need(h.spokeLine, '값의 선');
      const tip = need(h.spokeTip, '값의 끝');
      const lobe = need(h.lobe, '모양');
      const value = need(h.value, '잰 값');
      const here = scene.measured[scene.measured.length - 1];
      if (here === undefined || here.out !== step.out) throw new Error('reflect-distribution-stage: 이번 걸음의 잰 값이 없다');
      const before = scene.measured.slice(0, -1).map((m) => at(m.out, radius(m.f, top)));
      const rEnd = radius(here.f, top);
      const end = at(here.out, rEnd);
      const last = before[before.length - 1];

      value.setAttribute('visibility', 'hidden');
      setSpokeLength(line, tip, 0);
      lobe.setAttribute('points', pointsOf(closed(before)));

      // 재는 쪽이 앞 방향에서 이번 방향으로 돈다
      if (step.from !== null) {
        const from = step.from;
        if (!(await tween(mine, TURN_MS, (p) => turn(probe, lerp(from, step.out, p))))) return;
      }
      // 그 방향의 값이 솟고, 모양의 테두리가 그리로 이어진다
      const ok = await tween(mine, GROW_MS, (p) => {
        setSpokeLength(line, tip, rEnd * p);
        const moving: [number, number] = last === undefined
          ? end
          : [rnd(lerp(last[0], end[0], p)), rnd(lerp(last[1], end[1], p))];
        lobe.setAttribute('points', pointsOf(closed([...before, moving])));
      });
      if (!ok) return;
      value.removeAttribute('visibility');
    }

    async function animateSwap(mine: number, scene: ReflectDistributionScene, h: Handles): Promise<void> {
      const sw = scene.swapped;
      if (sw === null || scene.top === null) throw new Error('reflect-distribution-stage: swap 장면이 아니다');
      const top = scene.top;
      const light = need(h.swapLight, '맞바꾼 빛');
      const spoke = need(h.swapSpoke, '맞바꾼 값');
      const line = need(h.swapSpokeLine, '맞바꾼 값의 선');
      const tip = need(h.swapSpokeTip, '맞바꾼 값의 끝');
      const readout = need(h.swapReadout, '맞바꾼 값의 글자');
      readout.setAttribute('visibility', 'hidden');
      // 빛은 들어오던 자리에서 나가던 자리로, 나가던 값은 그 반대로 — 서로 자리를 바꾼다
      const ok = await tween(mine, SWAP_MS, (p) => {
        turn(light, lerp(sw.a, sw.b, p));
        turn(spoke, lerp(sw.b, sw.a, p));
        setSpokeLength(line, tip, lerp(radius(sw.forward, top), radius(sw.backward, top), p));
      });
      if (!ok) return;
      readout.removeAttribute('visibility');
    }

    return {
      async render(next: ReflectDistributionScene, _prev: ReflectDistributionScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const h = drawStatic(next);
        if (!opts.animate) return;
        if (next.step.kind === 'measure') await animateMeasure(mine, next, h);
        else if (next.step.kind === 'swap') await animateSwap(mine, next, h);
        else return;
        if (mine === gen && !destroyed) drawStatic(next);
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
