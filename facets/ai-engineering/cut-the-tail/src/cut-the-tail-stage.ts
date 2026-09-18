/**
 * cut-the-tail 의 무대.
 *
 * 확률 전체를 원 하나로 둔다. k 등 아래 후보들은 원에서 부채꼴째 떨어져 나가 오른쪽으로
 * 떨어지고, 남은 셋의 부채꼴이 각자 크기에 비례해 벌어져 빈자리를 메운다. 그다음 바늘이
 * 원의 시작에서 뽑기 값 u 까지 돌아 남은 셋 가운데 하나에 멈춘다.
 *
 * 원의 시작각은 버릴 몫의 한가운데가 3 시 방향에 오도록 바탕에서 셈한다 — 떨어져 나갈
 * 조각이 오른쪽(떨어질 쪽)을 향하게.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { CutTheTailScene } from './scene.js';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;

/** 운동 길이 (ms) */
const OPEN_MS = 700;
const FALL_MS = 800;
const SHARE_MS = 800;
const SWEEP_MS = 1200;
const TICK_MS = 16;

/** 운동의 진행 — 1 이면 그 걸음이 다 선 것 */
type Frame = { open: number; fall: number; share: number; sweep: number };
const FULL: Frame = { open: 1, fall: 1, share: 1, sweep: 1 };

function r2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function fmt(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function wedgePath(a0: number, a1: number, r: number): string {
  const span = a1 - a0;
  if (span <= 0) return '';
  if (span >= TAU - 1e-9) {
    // 온 원 — 반원 둘로
    const x = r2(r);
    return `M ${x} 0 A ${x} ${x} 0 1 1 ${-x} 0 A ${x} ${x} 0 1 1 ${x} 0 Z`;
  }
  const large = span > Math.PI ? 1 : 0;
  return (
    `M 0 0 L ${r2(r * Math.cos(a0))} ${r2(r * Math.sin(a0))} ` +
    `A ${r2(r)} ${r2(r)} 0 ${large} 1 ${r2(r * Math.cos(a1))} ${r2(r * Math.sin(a1))} Z`
  );
}

export const cutTheTailStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<CutTheTailScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    // 자리 — 캔버스에서 역산한다
    const R = Math.min(112, (H - 150) / 2);
    const cx = r2(W * 0.3);
    const cy = r2(H / 2 + 10);
    /** 떨어져 나간 부채꼴의 꼭짓점이 옮겨 갈 자리 (원의 중심 기준) */
    const fallDx = r2(W - R - 110 - cx);
    const fallDy = 24;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function drawStatic(scene: CutTheTailScene, f: Frame): void {
      svg.textContent = '';
      const b = scene.base;
      if (!b) return;
      const n = b.tokens.length;
      const palette = categorical(n);
      const k = Math.min(b.k, n);
      const keptOrder = b.order.slice(0, k);
      const tailOrder = b.order.slice(k);

      // 바탕 — 전체 누적과 시작각
      const fullStart: number[] = [];
      const fullEnd: number[] = [];
      let acc = 0;
      for (const i of b.order) {
        fullStart[i] = acc;
        acc += b.probs[i];
        fullEnd[i] = acc;
      }
      const keptMass = keptOrder.reduce((s, i) => s + b.probs[i], 0);
      const theta0 = -((keptMass + 1) / 2) * TAU;

      // 자취 — 다시 나눈 누적
      const start = fullStart.slice();
      const end = fullEnd.slice();
      if (scene.renorm) {
        let racc = 0;
        for (const i of keptOrder) {
          const rs = racc;
          racc += scene.renorm.probs[i] ?? 0;
          start[i] = lerp(fullStart[i], rs, f.share);
          end[i] = lerp(fullEnd[i], racc, f.share);
        }
      }
      const ang = (c: number): number => theta0 + c * f.open * TAU;

      // 문맥 문장과 빈칸
      el('text', {
        x: 24, y: 36, fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.lg,
      }, svg, b.context);
      const blankX = r2(24 + b.context.length * 9.6 + 10);
      const pickedShown = scene.draw && f.sweep >= 1 ? scene.draw.picked : -1;
      el('line', {
        x1: blankX, y1: 40, x2: blankX + 78, y2: 40, stroke: colors.border, 'stroke-width': 2,
      }, svg);
      if (pickedShown >= 0) {
        el('text', {
          x: blankX + 39, y: 35, 'text-anchor': 'middle', fill: colors.text,
          'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700,
        }, svg, b.tokens[pickedShown] ?? '');
      }
      el('text', {
        x: W - 24, y: 36, 'text-anchor': 'end', fill: colors.textMuted,
        'font-family': fonts.mono, 'font-size': fontSizes.md,
      }, svg, t('label.k', 'k = {k}', { k: b.k }));

      const pie = el('g', { transform: `translate(${cx} ${cy})` }, svg);

      // 떨어져 나간 자리 — 아직 메워지지 않은 몫
      if (scene.cut && keptOrder.length > 0) {
        const last = keptOrder[keptOrder.length - 1];
        const g0 = ang(end[last]);
        const g1 = ang(1);
        if (g1 - g0 > 0.002) {
          el('path', {
            d: wedgePath(g0, g1, R), fill: 'none', stroke: colors.border,
            'stroke-width': 1.5, 'stroke-dasharray': '4 4',
          }, pie);
        }
      }

      // 바늘 아래 후보
      let under = -1;
      let needleFrac = 0;
      if (scene.draw) {
        needleFrac = scene.draw.u * f.sweep;
        if (f.sweep >= 1) under = scene.draw.picked;
        else {
          for (const i of keptOrder) {
            if (end[i] > needleFrac) {
              under = i;
              break;
            }
          }
        }
      }

      // 남은 후보
      for (const i of keptOrder) {
        const a0 = ang(start[i]);
        const a1 = ang(end[i]);
        const picked = i === under;
        el('path', {
          d: wedgePath(a0, a1, R), fill: palette[i], stroke: picked ? colors.accent : colors.bg,
          'stroke-width': picked ? 4 : 1.5, 'stroke-linejoin': 'round',
        }, pie);
      }
      for (const i of keptOrder) {
        const a0 = ang(start[i]);
        const a1 = ang(end[i]);
        if (a1 - a0 < 0.05) continue;
        const mid = (a0 + a1) / 2;
        const lx = r2(R * 0.6 * Math.cos(mid));
        const ly = r2(R * 0.6 * Math.sin(mid));
        el('text', {
          x: lx, y: r2(ly - 6), 'text-anchor': 'middle', fill: colors.stateInk,
          'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700,
        }, pie, b.tokens[i]);
        const p = scene.renorm
          ? lerp(b.probs[i], scene.renorm.probs[i] ?? 0, f.share)
          : b.probs[i];
        el('text', {
          x: lx, y: r2(ly + 10), 'text-anchor': 'middle', fill: colors.stateInk,
          'font-family': fonts.mono, 'font-size': fontSizes.sm,
        }, pie, fmt(p));
        if (scene.renorm) {
          const g = (scene.renorm.gained[i] ?? 0) * f.share;
          el('text', {
            x: lx, y: r2(ly + 24), 'text-anchor': 'middle', fill: colors.stateInk,
            'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 700,
          }, pie, `+${fmt(g)}`);
        }
      }

      // 버리는 후보 — 한 부채꼴 묶음으로 떨어져 나간다
      if (tailOrder.length > 0) {
        const fx = scene.cut ? ease(f.fall) * fallDx : 0;
        const fy = scene.cut ? f.fall * f.fall * fallDy : 0;
        const tail = el('g', { transform: `translate(${r2(fx)} ${r2(fy)})` }, pie);
        const dropped = scene.cut !== null;
        for (const i of tailOrder) {
          el('path', {
            d: wedgePath(ang(start[i]), ang(end[i]), R),
            fill: dropped ? colors.bgSubtle : palette[i],
            stroke: dropped ? colors.border : colors.bg, 'stroke-width': 1.5,
          }, tail);
        }
        // 이름표 — 가는 부채꼴이라 바깥에 세로로 벌려 둔다
        const labels = tailOrder.map((i) => {
          const mid = (ang(start[i]) + ang(end[i])) / 2;
          return { i, ax: (R + 2) * Math.cos(mid), ay: (R + 2) * Math.sin(mid), y: (R + 4) * Math.sin(mid) };
        });
        labels.sort((p, q) => p.y - q.y);
        for (let j = 1; j < labels.length; j += 1) {
          if (labels[j].y < labels[j - 1].y + 16) labels[j].y = labels[j - 1].y + 16;
        }
        const lx = R + 22;
        for (const l of labels) {
          el('polyline', {
            points: `${r2(l.ax)},${r2(l.ay)} ${r2(lx - 6)},${r2(l.y)}`,
            fill: 'none', stroke: colors.textMuted, 'stroke-width': 1,
          }, tail);
          const txt = el('text', {
            x: lx, y: r2(l.y + 4), fill: dropped ? colors.textMuted : colors.text,
            'font-family': fonts.mono, 'font-size': fontSizes.sm,
          }, tail);
          el('tspan', {}, txt, `${b.tokens[l.i]} `);
          el('tspan', { fill: colors.textMuted }, txt, fmt(b.probs[l.i]));
        }
        if (dropped && f.fall >= 1 && scene.cut) {
          el('text', {
            x: 0, y: r2(-R * 0.75), fill: colors.textMuted,
            'font-family': fonts.body, 'font-size': fontSizes.sm,
          }, tail, t('label.dropped', 'dropped {mass}', { mass: fmt(scene.cut.droppedMass) }));
        }
      }

      // 뽑기 — 누적 눈금과 바늘
      if (scene.draw) {
        const d = scene.draw;
        keptOrder.forEach((_, j) => {
          const c = d.cumulative[j];
          if (c === undefined) return;
          const a = theta0 + c * TAU;
          const cos = Math.cos(a);
          el('line', {
            x1: r2(R * Math.cos(a)), y1: r2(R * Math.sin(a)),
            x2: r2((R + 7) * cos), y2: r2((R + 7) * Math.sin(a)),
            stroke: colors.textMuted, 'stroke-width': 1,
          }, pie);
          el('text', {
            x: r2((R + 12) * cos), y: r2((R + 12) * Math.sin(a) + 4),
            'text-anchor': cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle',
            fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
          }, pie, fmt(c));
        });
        const na = theta0 + needleFrac * TAU;
        el('line', {
          x1: 0, y1: 0, x2: r2((R + 16) * Math.cos(na)), y2: r2((R + 16) * Math.sin(na)),
          stroke: colors.text, 'stroke-width': 2.5, 'stroke-linecap': 'round',
        }, pie);
        el('circle', { cx: 0, cy: 0, r: 5, fill: colors.text }, pie);
        const ncos = Math.cos(na);
        el('text', {
          x: r2((R + 24) * ncos), y: r2((R + 24) * Math.sin(na) + 4),
          'text-anchor': ncos > 0.3 ? 'start' : ncos < -0.3 ? 'end' : 'middle',
          fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700,
        }, pie, t('label.u', 'u = {u}', { u: fmt(d.u) }));
      }

      // 캡션 — 지금 일어나는 일
      let caption = '';
      if (scene.draw) {
        caption = t('caption.draw', 'Draw value u = {u}: the running total first passes it at {token}.', {
          u: fmt(scene.draw.u),
          token: b.tokens[scene.draw.picked] ?? '',
        });
      } else if (scene.renorm) {
        caption = t('caption.renormalize', 'The {mass} left behind is shared out to the {k}, each by its size.', {
          mass: fmt(scene.cut?.droppedMass ?? 0),
          k: keptOrder.length,
        });
      } else if (scene.cut) {
        caption = t('caption.cut', 'Keep the top {k}. The other {m} fall away, taking {mass}.', {
          k: keptOrder.length,
          m: tailOrder.length,
          mass: fmt(scene.cut.droppedMass),
        });
      } else {
        const top = b.order[0];
        caption = t('caption.init', 'Softmax over all {n} candidates: {top} holds {p}.', {
          n,
          top: top === undefined ? '' : b.tokens[top],
          p: top === undefined ? '' : fmt(b.probs[top]),
        });
      }
      el('text', {
        x: r2(W / 2), y: H - 16, 'text-anchor': 'middle', fill: colors.text,
        'font-family': fonts.body, 'font-size': fontSizes.md,
      }, svg, caption);
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        let p = 0;
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          frame(p);
          if (p >= 1) {
            finish(true);
            return;
          }
          p = Math.min(1, p + TICK_MS / ms);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, TICK_MS);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next, prev, opts): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next, FULL);
        if (!opts.animate || !prev || !next.base) return;

        let ok = true;
        if (next.draw && !prev.draw) {
          ok = await tween(SWEEP_MS, mine, (p) => drawStatic(next, { ...FULL, sweep: ease(p) }));
        } else if (next.renorm && !prev.renorm) {
          ok = await tween(SHARE_MS, mine, (p) => drawStatic(next, { ...FULL, share: ease(p) }));
        } else if (next.cut && !prev.cut) {
          ok = await tween(FALL_MS, mine, (p) => drawStatic(next, { ...FULL, fall: p }));
        } else if (!prev.base) {
          ok = await tween(OPEN_MS, mine, (p) => drawStatic(next, { ...FULL, open: ease(p) }));
        }
        if (ok && mine === gen && !destroyed) drawStatic(next, FULL);
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
