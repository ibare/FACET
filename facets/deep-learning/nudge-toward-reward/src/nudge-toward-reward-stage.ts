/**
 * nudge-toward-reward 의 stage — 합이 1 인 띠 하나를 세 행동이 나눠 가진다.
 *
 * 위: 행동마다 선호 θ 의 막대 (0 을 가운데 두고 위아래로).
 * 가운데: 확률 띠. 주사위가 띠 위로 떨어져 뽑힌 행동이 정해지고, 밂 걸음에서는
 *   띠의 경계가 미끄러져 뽑힌 행동의 몫이 상의 부호대로 늘거나 준다. 띠의 길이는
 *   그대로라 한쪽이 얻은 만큼 다른 쪽이 내준다.
 * 아래: 지난 판의 자취 (뽑힌 행동의 색 · 받은 상).
 *
 * 정적 그리기 `draw(scene, 1)` 이 정본이다. 운동은 같은 함수를 진행도 k<1 로 불러
 * 경계 · 막대 · 주사위가 아직 못 온 만큼으로 그린다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { NudgeTowardRewardScene } from './scene.js';

const H = 350;
const W = PIECE_CANVAS_W;
const SVG = 'http://www.w3.org/2000/svg';
const MOVE_MS = 380;

/** 가장자리 여백 — 띠와 칸이 이 안을 채운다 */
const MARGIN = 24;
/** θ 1 이 차지하는 세로 픽셀의 상한 — 칸 높이에서 줄어들 수는 있다 */
const THETA_UNIT_MAX = 30;
const THETA_BASE_Y = 112;
const THETA_REACH = 46;
const NAME_Y = 166;
const PI_LABEL_Y = 190;
const DIE_LABEL_Y = 204;
const DIE_FROM_Y = 176;
const RIBBON_Y = 226;
const RIBBON_H = 44;
const CUM_Y = RIBBON_Y + RIBBON_H + 16;
const TRAIL_LABEL_Y = 312;
const TRAIL_Y = 318;
const TRAIL_H = 24;

function fx(v: number, d: number): string {
  const s = v.toFixed(d);
  const z = (0).toFixed(d);
  if (s === `-${z}`) return z;
  return s.replace('-', '−');
}

function signed(r: number): string {
  if (r > 0) return `+${r}`;
  if (r < 0) return `−${Math.abs(r)}`;
  return '0';
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

export const nudgeTowardRewardStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const fill = categorical(3, 'pastel');
    const edge = categorical(3, 'vivid');
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      opts: { size?: string; color?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): void {
      const node = el('text', {
        x: round2(x),
        y: round2(y),
        'text-anchor': opts.anchor ?? 'middle',
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'font-weight': opts.weight ?? 'normal',
        fill: opts.color ?? colors.text,
      });
      node.textContent = text;
    }

    function actionName(id: string): string {
      switch (id) {
        case 'left':
          return t('label.left', 'left');
        case 'straight':
          return t('label.straight', 'straight');
        case 'right':
          return t('label.right', 'right');
        default:
          throw new Error(`nudge-toward-reward: 모르는 행동 ${id}`);
      }
    }

    function colorOf(list: readonly string[], i: number): string {
      const c = list[i % list.length];
      if (c === undefined) throw new Error(`nudge-toward-reward: 색 ${i} 이 없다`);
      return c;
    }

    function at(list: readonly number[], i: number): number {
      const v = list[i];
      if (v === undefined) throw new Error(`nudge-toward-reward: 값 ${i} 이 없다`);
      return v;
    }

    function caption(scene: NudgeTowardRewardScene): string {
      const step = scene.step;
      if (!step) return t('caption.start', 'Before round 1 — no reward yet.');
      const id = scene.actions[step.pick];
      if (id === undefined) throw new Error(`nudge-toward-reward: 행동 ${step.pick} 이 없다`);
      const action = actionName(id);
      if (step.kind === 'draw') {
        return t('caption.draw', 'Round {round} · die {u} → {action} · reward: {r}', {
          round: step.round,
          u: fx(step.u, 2),
          action,
          r: signed(step.reward),
        });
      }
      const vars = {
        action,
        from: fx(at(step.piFrom, step.pick), 2),
        to: fx(at(scene.pi, step.pick), 2),
        r: signed(step.reward),
      };
      if (step.reward > 0) return t('caption.up', 'Pushed up. {action}: {from} → {to}', vars);
      if (step.reward < 0) return t('caption.down', 'Pushed down. {action}: {from} → {to}', vars);
      return t('caption.still', 'Not pushed (reward: {r}). {action}: {from} → {to}', vars);
    }

    /** k = 1 이 정본. k < 1 은 이번 걸음의 운동이 아직 못 온 만큼이다. */
    function draw(scene: NudgeTowardRewardScene, k: number): void {
      svg.textContent = '';
      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });
      const n = scene.actions.length;
      if (n === 0) return;
      const step = scene.step;
      const pick = step ? step.pick : -1;
      const pushing = step?.kind === 'push' ? step : null;
      const drawing = step?.kind === 'draw' ? step : null;

      label(caption(scene), W / 2, 26, { size: fontSizes.md });

      // ── 선호 θ ────────────────────────────────────────────────
      label(t('label.theta', 'Preference θ'), MARGIN, 52, {
        anchor: 'start', size: fontSizes.xs, color: colors.textMuted,
      });
      const colW = (W - 2 * MARGIN) / n;
      const barW = Math.min(48, colW * 0.3);
      let reach = 0;
      for (const v of scene.theta) reach = Math.max(reach, Math.abs(v));
      if (pushing) for (const v of pushing.thetaFrom) reach = Math.max(reach, Math.abs(v));
      const unit = reach > 0 ? Math.min(THETA_UNIT_MAX, THETA_REACH / reach) : THETA_UNIT_MAX;
      for (let i = 0; i < n; i += 1) {
        const id = scene.actions[i];
        if (id === undefined) throw new Error(`nudge-toward-reward: 행동 ${i} 이 없다`);
        const cx = MARGIN + colW * (i + 0.5);
        el('line', {
          x1: round2(cx - colW * 0.36), x2: round2(cx + colW * 0.36),
          y1: THETA_BASE_Y, y2: THETA_BASE_Y, stroke: colors.border, 'stroke-width': 1,
        });
        const end = at(scene.theta, i);
        const was = pushing ? at(pushing.thetaFrom, i) : end;
        const v = lerp(was, end, k);
        if (pushing && was !== end) {
          // 밀리기 전 자리 — 머무는 자취라 정적 그리기에도 둔다
          const gy = THETA_BASE_Y - was * unit;
          el('line', {
            x1: round2(cx - barW / 2 - 6), x2: round2(cx + barW / 2 + 6),
            y1: round2(gy), y2: round2(gy),
            stroke: colors.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '4 3',
          });
        }
        const top = Math.min(THETA_BASE_Y, THETA_BASE_Y - v * unit);
        const h = Math.abs(v * unit);
        if (h > 0.5) {
          el('rect', {
            x: round2(cx - barW / 2), y: round2(top), width: round2(barW), height: round2(h),
            fill: colorOf(fill, i),
            stroke: i === pick ? colors.text : colorOf(edge, i),
            'stroke-width': i === pick ? 2.5 : 1,
          });
        }
        const valueY = THETA_BASE_Y - v * unit + (v >= 0 ? 4 : 0);
        label(fx(end, 2), cx + barW / 2 + 8, Math.max(64, Math.min(NAME_Y - 18, valueY)), {
          anchor: 'start', size: fontSizes.xs, color: colors.textMuted, mono: true,
        });
        el('rect', {
          x: round2(cx - 40), y: NAME_Y - 12, width: 10, height: 10, rx: 2,
          fill: colorOf(fill, i), stroke: colorOf(edge, i), 'stroke-width': 1,
        });
        label(actionName(id), cx - 26, NAME_Y - 2, {
          anchor: 'start', weight: i === pick ? 'bold' : 'normal',
        });
      }

      // ── 확률 띠 ───────────────────────────────────────────────
      label(t('label.pi', 'Probability π'), MARGIN, PI_LABEL_Y, {
        anchor: 'start', size: fontSizes.xs, color: colors.textMuted,
      });
      const span = W - 2 * MARGIN;
      const xOf = (p: number): number => MARGIN + span * p;
      let acc = 0;
      for (let i = 0; i < n; i += 1) {
        const pEnd = at(scene.pi, i);
        const pWas = pushing ? at(pushing.piFrom, i) : pEnd;
        const p = lerp(pWas, pEnd, k);
        const x0 = xOf(acc);
        const x1 = i === n - 1 ? xOf(1) : xOf(acc + p);
        el('rect', {
          x: round2(x0), y: RIBBON_Y, width: round2(Math.max(0, x1 - x0)), height: RIBBON_H,
          fill: colorOf(fill, i),
        });
        const wide = x1 - x0 >= smPx * 2.6;
        if (wide) {
          label(fx(pEnd, 2), (x0 + x1) / 2, RIBBON_Y + RIBBON_H / 2 + smPx * 0.35, {
            color: colors.stateInk, mono: true, weight: i === pick ? 'bold' : 'normal',
          });
        }
        acc += p;
      }
      // 밀리기 전 경계 — 얼마나 밀렸는지가 머무르게
      if (pushing) {
        let prevAcc = 0;
        let nowAcc = 0;
        for (let i = 0; i < n - 1; i += 1) {
          prevAcc += at(pushing.piFrom, i);
          nowAcc += at(scene.pi, i);
          if (Math.abs(prevAcc - nowAcc) * span < 0.5) continue;
          // 띠 안의 글자를 긋지 않게 위아래 가장자리에만 둔다
          for (const [y1, y2] of [[RIBBON_Y - 8, RIBBON_Y + 10], [RIBBON_Y + RIBBON_H - 10, RIBBON_Y + RIBBON_H + 8]] as const) {
            el('line', {
              x1: round2(xOf(prevAcc)), x2: round2(xOf(prevAcc)), y1, y2,
              stroke: colors.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '3 2',
            });
          }
        }
      }
      // 뽑힌 몫의 테두리
      if (pick >= 0) {
        let a0 = 0;
        for (let i = 0; i < pick; i += 1) a0 += lerp(pushing ? at(pushing.piFrom, i) : at(scene.pi, i), at(scene.pi, i), k);
        const pp = lerp(pushing ? at(pushing.piFrom, pick) : at(scene.pi, pick), at(scene.pi, pick), k);
        const x0 = xOf(a0);
        const x1 = pick === n - 1 ? xOf(1) : xOf(a0 + pp);
        el('rect', {
          x: round2(x0 + 1.25), y: RIBBON_Y + 1.25, width: round2(Math.max(0, x1 - x0 - 2.5)), height: RIBBON_H - 2.5,
          fill: 'none', stroke: colors.text, 'stroke-width': 2.5,
        });
      }
      el('rect', {
        x: MARGIN, y: RIBBON_Y, width: span, height: RIBBON_H,
        fill: 'none', stroke: colors.border, 'stroke-width': 1,
      });

      // 주사위 — 띠 위로 떨어진다
      if (drawing) {
        const x = xOf(drawing.u);
        const tipY = lerp(DIE_FROM_Y, RIBBON_Y - 2, k);
        if (k >= 1) {
          for (const [y1, y2] of [[RIBBON_Y, RIBBON_Y + 10], [RIBBON_Y + RIBBON_H - 10, RIBBON_Y + RIBBON_H]] as const) {
            el('line', {
              x1: round2(x), x2: round2(x), y1, y2, stroke: colors.stateInk, 'stroke-width': 1.5,
            });
          }
        }
        el('path', {
          d: `M ${round2(x)} ${round2(tipY)} L ${round2(x - 7)} ${round2(tipY - 12)} L ${round2(x + 7)} ${round2(tipY - 12)} Z`,
          fill: colors.accent, stroke: colors.text, 'stroke-width': 1,
        });
        if (k >= 1) {
          label(t('label.die', 'u {u}', { u: fx(drawing.u, 2) }), x, DIE_LABEL_Y, {
            mono: true, size: fontSizes.xs,
          });
        }
        // 누적 — 띠의 경계가 곧 누적이다
        label('0', xOf(0), CUM_Y, { anchor: 'start', size: fontSizes.xs, color: colors.textMuted, mono: true });
        drawing.cum.forEach((c, i) => {
          const last = i === drawing.cum.length - 1;
          label(fx(c, 2), xOf(last ? 1 : c), CUM_Y, {
            anchor: last ? 'end' : 'middle', size: fontSizes.xs, color: colors.textMuted, mono: true,
          });
        });
      }

      // ── 자취 ─────────────────────────────────────────────────
      const slots = scene.totalRounds;
      if (slots > 0) {
        const slotW = span / slots;
        const boxW = Math.min(104, slotW - 10);
        for (let r = 0; r < slots; r += 1) {
          const cx = MARGIN + slotW * (r + 0.5);
          const done = scene.rounds[r];
          const current = step !== null && step.round === r + 1;
          label(t('label.round', 'Round {n}', { n: r + 1 }), cx, TRAIL_LABEL_Y - 2, {
            size: fontSizes.xs, color: done ? colors.text : colors.textMuted,
          });
          if (!done) {
            el('rect', {
              x: round2(cx - boxW / 2), y: TRAIL_Y, width: round2(boxW), height: TRAIL_H, rx: 4,
              fill: 'none', stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '3 3',
            });
            continue;
          }
          el('rect', {
            x: round2(cx - boxW / 2), y: TRAIL_Y, width: round2(boxW), height: TRAIL_H, rx: 4,
            fill: colorOf(fill, done.pick),
            stroke: current ? colors.text : colorOf(edge, done.pick),
            'stroke-width': current ? 2.5 : 1,
          });
          label(t('label.reward', 'reward: {r}', { r: signed(done.reward) }), cx, TRAIL_Y + TRAIL_H / 2 + smPx * 0.35, {
            color: colors.stateInk, mono: false,
          });
        }
      }
    }

    function move(scene: NudgeTowardRewardScene, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        let start = -1;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const frame = (now: number): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          if (start < 0) start = now;
          const k = Math.min(1, (now - start) / MOVE_MS);
          draw(scene, ease(k));
          if (k >= 1) {
            wake();
            return;
          }
          const id = requestAnimationFrame((ts) => {
            frames.delete(id);
            frame(ts);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((ts) => {
          frames.delete(id);
          frame(ts);
        });
        frames.add(id);
      });
    }

    return {
      async render(
        next: NudgeTowardRewardScene,
        _prev: NudgeTowardRewardScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step === null) {
          draw(next, 1);
          return;
        }
        draw(next, 0);
        await move(next, mine);
        if (destroyed || mine !== gen) return;
        draw(next, 1);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
