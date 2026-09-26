/**
 * state-action-reward-stage — 행위자와 환경 사이를 오가는 것을 그린다.
 *
 * 왼쪽은 행위자(보는 자리 하나와 정책표), 오른쪽은 환경(격자 · 미끄러짐 주사위),
 * 가운데는 두 갈래 길이다. 위 길로 행동이 환경에 가고, 아래 길로 다음 자리와 상이
 * 행위자에게 돌아온다. 한 번 돌아올 때마다 궤적 끝에 (자리, 행동, 상) 한 칸이 붙는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import {
  inGrid,
  stepToward,
  turnLeft,
  turnRight,
  type ActionId,
  type Cell,
} from './algorithm.js';
import type { SarStep, StateActionRewardScene } from './scene.js';

const H = 396;
const W = PIECE_CANVAS_W;
const PAD = 16;
const NS = 'http://www.w3.org/2000/svg';

const ACT_MS = 400;
const RETURN_MS = 700;

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);
const MD = parseFloat(fontSizes.md);

// 판의 뼈대 — 세 칸(행위자 · 길 · 환경)과 아래 두 줄(말 · 궤적)
const TOP = 12;
const AGENT_W = 176;
const ENV_W = 220;
const PANEL_H = 214;
const ENV_X = W - PAD - ENV_W;
const LANE_X0 = PAD + AGENT_W + 10;
const LANE_X1 = ENV_X - 10;
const LANE_ACT_Y = 92;
const LANE_RET_Y = 164;
const ACT_TOKEN_W = 70;
const RET_TOKEN_W = 104;
const TOKEN_H = 24;
const CAPTION_Y = [248, 267, 285] as const;
const TRAJ_LABEL_Y = 310;
const CARD_Y = 320;
const CARD_H = 50;
const COUNTS_Y = 388;

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function word(
  parent: Element,
  x: number,
  y: number,
  body: string,
  opts: { size: number; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; mono?: boolean },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': opts.mono ? fonts.mono : fonts.body,
    'font-size': opts.size,
    'font-weight': opts.weight ?? 400,
    fill: opts.fill,
    'text-anchor': opts.anchor ?? 'start',
    'dominant-baseline': 'middle',
  });
  node.textContent = body;
  return node;
}

function cellText(c: Cell): string {
  return `(${c[0]},${c[1]})`;
}

function rewardText(r: number): string {
  return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '0';
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function clamp01(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

function actionName(t: Translate, a: ActionId): string {
  switch (a) {
    case 'up':
      return t('action.up', 'up');
    case 'down':
      return t('action.down', 'down');
    case 'left':
      return t('action.left', 'left');
    case 'right':
      return t('action.right', 'right');
  }
}

type Handles = {
  marker: SVGCircleElement | null;
  dieMark: SVGPathElement | null;
  actToken: SVGGElement | null;
  retToken: SVGGElement | null;
  seen: SVGTextElement | null;
  arriving: SVGElement[];
};

export const stateActionRewardStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    // ── 격자 자리 셈 — 캔버스(환경 칸의 폭)에서 역산한다 ──
    function gridGeom(scene: StateActionRewardScene) {
      const { rows, cols } = scene.base;
      const cs = Math.min(56, (ENV_W - 40) / cols, 112 / rows);
      const gx = ENV_X + (ENV_W - cols * cs) / 2;
      const gy = TOP + 40;
      const center = (c: Cell): [number, number] => [gx + (c[1] + 0.5) * cs, gy + (c[0] + 0.5) * cs];
      return { cs, gx, gy, w: cols * cs, h: rows * cs, center };
    }

    function arrow(
      layer: Element,
      from: [number, number],
      to: [number, number],
      stroke: string,
      width: number,
      dashed: boolean,
      wall: boolean,
    ): SVGGElement {
      const g = el(layer, 'g', {});
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const len = Math.hypot(dx, dy);
      if (len < 1) return g;
      const ux = dx / len;
      const uy = dy / len;
      const attrs: Attrs = {
        x1: from[0],
        y1: from[1],
        x2: to[0] - ux * 6,
        y2: to[1] - uy * 6,
        stroke,
        'stroke-width': width,
        'stroke-linecap': 'butt',
      };
      if (dashed) attrs['stroke-dasharray'] = '4 3';
      el(g, 'line', attrs);
      if (wall) {
        // 벽 — 머리 대신 가로막는 짧은 막대
        el(g, 'line', {
          x1: to[0] - uy * 9,
          y1: to[1] + ux * 9,
          x2: to[0] + uy * 9,
          y2: to[1] - ux * 9,
          stroke,
          'stroke-width': width + 1,
        });
      } else {
        const bx = to[0] - ux * 9;
        const by = to[1] - uy * 9;
        el(g, 'path', {
          d: `M ${r2(to[0])} ${r2(to[1])} L ${r2(bx - uy * 5)} ${r2(by + ux * 5)} L ${r2(bx + uy * 5)} ${r2(by - ux * 5)} Z`,
          fill: stroke,
        });
      }
      return g;
    }

    /** 자리 s 에서 방향 a 로 그릴 화살의 끝 — 격자 밖이면 벽에서 멈춘다 */
    function arrowEnd(scene: StateActionRewardScene, s: Cell, a: ActionId): { to: [number, number]; wall: boolean } {
      const geo = gridGeom(scene);
      const c = geo.center(s);
      const n = stepToward(s, a);
      const d: [number, number] = [n[1] - s[1], n[0] - s[0]];
      if (!inGrid(n, scene.base.rows, scene.base.cols)) {
        return { to: [c[0] + d[0] * geo.cs * 0.5, c[1] + d[1] * geo.cs * 0.5], wall: true };
      }
      return { to: [c[0] + d[0] * geo.cs * 0.78, c[1] + d[1] * geo.cs * 0.78], wall: false };
    }

    function token(layer: Element, cx: number, cy: number, w: number, body: string, filled: boolean): SVGGElement {
      const g = el(layer, 'g', { transform: `translate(${r2(cx)} ${r2(cy)})` });
      el(g, 'rect', {
        x: -w / 2,
        y: -TOKEN_H / 2,
        width: w,
        height: TOKEN_H,
        rx: TOKEN_H / 2,
        fill: filled ? colors.accent : colors.bg,
        stroke: filled ? colors.accent : colors.text,
        'stroke-width': 1.5,
      });
      word(g, 0, 0, body, { size: SM, fill: filled ? colors.stateInk : colors.text, anchor: 'middle', weight: 600 });
      return g;
    }

    const actFromX = LANE_X0 + ACT_TOKEN_W / 2 + 4;
    const actToX = LANE_X1 - ACT_TOKEN_W / 2 - 4;
    const retFromX = LANE_X1 - RET_TOKEN_W / 2 - 4;
    const retToX = LANE_X0 + RET_TOKEN_W / 2 + 4;

    function drawStatic(scene: StateActionRewardScene): Handles {
      svg.textContent = '';
      const h: Handles = { marker: null, dieMark: null, actToken: null, retToken: null, seen: null, arriving: [] };
      const step: SarStep = scene.step;
      const { base } = scene;
      const geo = gridGeom(scene);

      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });

      // ── 행위자 ──
      el(svg, 'rect', { x: PAD, y: TOP, width: AGENT_W, height: PANEL_H, rx: 8, fill: 'none', stroke: colors.border });
      word(svg, PAD + 12, TOP + 18, t('label.agent', 'Agent'), { size: MD, fill: colors.text, weight: 700 });
      h.seen = word(svg, PAD + 12, TOP + 46, t('label.sees', 'Sees: {s}', { s: cellText(scene.pos) }), {
        size: MD,
        fill: colors.text,
        weight: 600,
      });
      word(svg, PAD + 12, TOP + 76, t('label.policy', 'Policy'), { size: XS, fill: colors.textMuted });
      const rowH = Math.min(20, (PANEL_H - 96) / Math.max(1, base.policy.length));
      base.policy.forEach((p, i) => {
        const y = TOP + 94 + i * rowH;
        const looking = p.s[0] === scene.pos[0] && p.s[1] === scene.pos[1] && !scene.done;
        const chosen = step.kind === 'act' && looking;
        if (looking) {
          el(svg, 'rect', {
            x: PAD + 8,
            y: y - rowH / 2 + 1,
            width: AGENT_W - 16,
            height: rowH - 2,
            rx: 4,
            fill: chosen ? colors.accent : 'none',
            stroke: chosen ? colors.accent : colors.text,
          });
        }
        const ink = chosen ? colors.stateInk : looking ? colors.text : colors.textMuted;
        word(svg, PAD + 20, y, cellText(p.s), { size: SM, fill: ink, mono: true });
        word(svg, PAD + 76, y, '→', { size: SM, fill: ink });
        word(svg, PAD + 96, y, actionName(t, p.action), { size: SM, fill: ink, weight: looking ? 600 : 400 });
      });

      // ── 두 갈래 길 ──
      const laneAct = el(svg, 'g', {});
      arrow(laneAct, [LANE_X0, LANE_ACT_Y], [LANE_X1, LANE_ACT_Y], colors.border, 1.5, false, false);
      word(svg, (LANE_X0 + LANE_X1) / 2, LANE_ACT_Y - 22, t('label.laneAction', 'action'), {
        size: XS,
        fill: colors.textMuted,
        anchor: 'middle',
      });
      const laneRet = el(svg, 'g', {});
      arrow(laneRet, [LANE_X1, LANE_RET_Y], [LANE_X0, LANE_RET_Y], colors.border, 1.5, false, false);
      word(svg, (LANE_X0 + LANE_X1) / 2, LANE_RET_Y + 24, t('label.laneReturn', 'next state · reward'), {
        size: XS,
        fill: colors.textMuted,
        anchor: 'middle',
      });

      // ── 환경 ──
      el(svg, 'rect', { x: ENV_X, y: TOP, width: ENV_W, height: PANEL_H, rx: 8, fill: 'none', stroke: colors.border });
      word(svg, ENV_X + 12, TOP + 18, t('label.env', 'Environment'), { size: MD, fill: colors.text, weight: 700 });
      for (let r = 0; r < base.rows; r += 1) {
        for (let c = 0; c < base.cols; c += 1) {
          const x = geo.gx + c * geo.cs;
          const y = geo.gy + r * geo.cs;
          const isGoal = r === base.goal[0] && c === base.goal[1];
          el(svg, 'rect', { x, y, width: geo.cs, height: geo.cs, fill: colors.bg, stroke: colors.border });
          if (isGoal) {
            el(svg, 'rect', { x: x + 2, y: y + 2, width: geo.cs - 4, height: geo.cs - 4, fill: colors.accent, opacity: 0.35 });
            word(svg, x + geo.cs / 2, y + 10, t('label.goal', 'goal'), { size: XS, fill: colors.text, anchor: 'middle', weight: 600 });
          }
          if (r === base.start[0] && c === base.start[1]) {
            word(svg, x + geo.cs / 2, y + geo.cs - 9, t('label.start', 'start'), {
              size: XS,
              fill: colors.textMuted,
              anchor: 'middle',
            });
          }
        }
      }

      const arrows = el(svg, 'g', {});
      if (step.kind === 'act') {
        // 넘겨받은 행동 — 환경이 가진 세 갈래와 그 확률
        const branches: [ActionId, number, boolean][] = [
          [step.action, base.slip.intended, true],
          [turnLeft(step.action), base.slip.left, false],
          [turnRight(step.action), base.slip.right, false],
        ];
        for (const [dir, prob, main] of branches) {
          const end = arrowEnd(scene, step.s, dir);
          const g = arrow(arrows, geo.center(step.s), end.to, main ? colors.text : colors.textMuted, main ? 2 : 1.5, !main, end.wall);
          const c = geo.center(step.s);
          const ux = end.to[0] - c[0];
          const uy = end.to[1] - c[1];
          const len = Math.hypot(ux, uy);
          // 확률은 화살 끝 너머에 — 가로 화살은 글자 폭만큼 더 민다
          const reach = len + (Math.abs(ux) > Math.abs(uy) ? 18 : 10);
          const lx = c[0] + (ux / len) * reach;
          const ly = c[1] + (uy / len) * reach;
          word(g, lx, ly, prob.toFixed(2), { size: XS, fill: main ? colors.text : colors.textMuted, anchor: 'middle', mono: true });
          h.arriving.push(g);
        }
      }
      if (step.kind === 'transition') {
        if (step.outcome !== 'intended') {
          const ghost = arrowEnd(scene, step.s, step.action);
          arrow(arrows, geo.center(step.s), ghost.to, colors.textMuted, 1.5, true, ghost.wall);
        }
        const real = step.bumped ? arrowEnd(scene, step.s, step.actual) : { to: geo.center(step.next), wall: false };
        h.arriving.push(arrow(arrows, geo.center(step.s), real.to, colors.itemActive, 3, false, real.wall));
      }

      h.marker = el(svg, 'circle', {
        cx: geo.center(scene.pos)[0],
        cy: geo.center(scene.pos)[1],
        r: Math.min(12, geo.cs * 0.22),
        fill: colors.itemActive,
      });

      // 미끄러짐 주사위의 띠 — 환경의 것
      const barY = geo.gy + geo.h + 16;
      const bw = geo.w;
      const segs: ['intended' | 'left' | 'right', number, number][] = [
        ['intended', 0, base.slip.intended],
        ['left', base.slip.intended, base.slip.intended + base.slip.left],
        ['right', base.slip.intended + base.slip.left, 1],
      ];
      for (const [kind, a, b] of segs) {
        const hit = step.kind === 'transition' && step.outcome === kind;
        const seg = el(svg, 'rect', {
          x: geo.gx + a * bw,
          y: barY,
          width: (b - a) * bw,
          height: 10,
          fill: hit ? colors.itemActive : colors.bgSubtle,
          stroke: colors.border,
        });
        if (hit) h.arriving.push(seg);
      }
      word(svg, geo.gx + (base.slip.intended / 2) * bw, barY + 22, t('label.asMeant', 'as meant'), {
        size: XS,
        fill: colors.textMuted,
        anchor: 'middle',
      });
      word(svg, geo.gx + ((1 + base.slip.intended) / 2) * bw, barY + 22, t('label.slip', 'slip'), {
        size: XS,
        fill: colors.textMuted,
        anchor: 'middle',
      });
      if (step.kind === 'transition') {
        const mx = geo.gx + step.u * bw;
        h.dieMark = el(svg, 'path', {
          d: `M ${r2(mx)} ${r2(barY - 1)} L ${r2(mx - 5)} ${r2(barY - 9)} L ${r2(mx + 5)} ${r2(barY - 9)} Z`,
          fill: colors.text,
        });
        const dieLabel = word(svg, ENV_X + ENV_W / 2, barY + 40, t('label.die', 'Die: {u}', { u: step.u.toFixed(2) }), {
          size: SM,
          fill: colors.text,
          anchor: 'middle',
          weight: 600,
        });
        h.arriving.push(dieLabel);
      }

      // ── 오가는 것 ──
      if (step.kind === 'act') {
        h.actToken = token(svg, actToX, LANE_ACT_Y, ACT_TOKEN_W, actionName(t, step.action), true);
      }
      if (step.kind === 'transition') {
        h.retToken = token(
          svg,
          retToX,
          LANE_RET_Y,
          RET_TOKEN_W,
          t('label.pair', '{a} · {b}', { a: cellText(step.next), b: rewardText(step.reward) }),
          false,
        );
      }

      // ── 지금 일어나는 일 ──
      const lines: string[] = [];
      if (step.kind === 'start') {
        lines.push(t('caption.start', 'Start: {s}', { s: cellText(scene.pos) }));
      } else if (step.kind === 'act') {
        lines.push(
          t('caption.act', 'At {s} the policy gives: {action}. Handed to the environment.', {
            s: cellText(step.s),
            action: actionName(t, step.action),
          }),
        );
      } else {
        const u = step.u.toFixed(2);
        const dir = actionName(t, step.actual);
        lines.push(
          step.outcome === 'intended'
            ? t('caption.asMeant', 'Die: {u} → as meant: {dir}', { u, dir })
            : t('caption.slip', 'Die: {u} → slipped. Meant: {meant} · Went: {dir}', {
                u,
                meant: actionName(t, step.action),
                dir,
              }),
        );
        const vars = { next: cellText(step.next), r: rewardText(step.reward) };
        lines.push(
          step.terminal
            ? t('caption.nextGoal', 'Next state: {next} (goal) · Reward: {r} — the episode ends', vars)
            : step.bumped
              ? t('caption.bump', 'Blocked by the wall. Next state: {next} · Reward: {r}', vars)
              : t('caption.next', 'Next state: {next} · Reward: {r}', vars),
        );
        if (step.repeat) {
          lines.push(
            t('caption.repeat', 'Same state {s} and same action {action} as before — then: {was} · now: {next}', {
              s: cellText(step.s),
              action: actionName(t, step.action),
              was: cellText(step.repeat.next),
              next: cellText(step.next),
            }),
          );
        }
      }
      lines.forEach((line, i) => {
        const node = word(svg, W / 2, CAPTION_Y[i] ?? CAPTION_Y[2], line, {
          size: i === 0 ? MD : SM,
          fill: i === 0 ? colors.text : colors.textMuted,
          anchor: 'middle',
          weight: i === 0 ? 600 : 400,
        });
        if (step.kind === 'transition' && i > 0) h.arriving.push(node);
      });

      // ── 궤적 ──
      word(svg, PAD, TRAJ_LABEL_Y, t('label.trajectory', 'Trajectory (state, action, reward)'), {
        size: XS,
        fill: colors.textMuted,
      });
      const n = Math.max(1, base.maxLen);
      const gap = 8;
      const cw = Math.min(124, (W - 2 * PAD - gap * (n - 1)) / n);
      const repeatPair =
        step.kind === 'transition' && step.repeat ? new Set([step.repeat.t, step.t]) : new Set<number>();
      scene.trajectory.forEach((e, i) => {
        const x = PAD + i * (cw + gap);
        const g = el(svg, 'g', {});
        const paired = repeatPair.has(e.t);
        const slipped = e.outcome !== 'intended';
        const newest = step.kind === 'transition' && i === scene.trajectory.length - 1;
        const cardAttrs: Attrs = {
          x,
          y: CARD_Y,
          width: cw,
          height: CARD_H,
          rx: 6,
          fill: paired ? colors.accent : colors.bg,
          stroke: slipped ? colors.itemSwapping : newest ? colors.text : colors.border,
          'stroke-width': slipped || newest ? 1.5 : 1,
        };
        if (slipped) cardAttrs['stroke-dasharray'] = '4 3';
        el(g, 'rect', cardAttrs);
        const ink = paired ? colors.stateInk : colors.text;
        word(g, x + cw / 2, CARD_Y + 13, t('label.pair', '{a} · {b}', { a: cellText(e.s), b: actionName(t, e.action) }), {
          size: SM,
          fill: ink,
          anchor: 'middle',
        });
        word(g, x + cw / 2, CARD_Y + 29, t('label.reward', 'Reward: {r}', { r: rewardText(e.reward) }), {
          size: SM,
          fill: paired ? colors.stateInk : e.reward < 0 ? colors.danger : colors.text,
          anchor: 'middle',
          weight: 700,
        });
        if (slipped) {
          word(g, x + cw / 2, CARD_Y + 43, t('label.slip', 'slip'), {
            size: XS,
            fill: paired ? colors.stateInk : colors.itemSwapping,
            anchor: 'middle',
          });
        }
        if (newest) h.arriving.push(g);
      });

      const handed = scene.trajectory.length + (step.kind === 'act' ? 1 : 0);
      const slips = scene.trajectory.filter((e) => e.outcome !== 'intended').length;
      word(svg, PAD, COUNTS_Y, t('label.counts', 'Actions handed: {a} · Slips: {k}', { a: handed, k: slips }), {
        size: SM,
        fill: colors.text,
      });
      return h;
    }

    function run(ms: number, frame: (p: number) => void, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const t0 = Date.now();
        const done = () => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = () => {
          if (destroyed || mine !== gen) return done();
          const p = clamp01((Date.now() - t0) / ms);
          frame(p);
          if (p >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function animateAct(h: Handles, mine: number): Promise<void> {
      const tok = h.actToken;
      if (!tok) return;
      for (const node of h.arriving) node.setAttribute('opacity', '0');
      const place = (p: number) => {
        const x = actFromX + (actToX - actFromX) * easeInOut(p);
        tok.setAttribute('transform', `translate(${r2(x)} ${LANE_ACT_Y})`);
      };
      place(0);
      await run(ACT_MS, place, mine);
    }

    async function animateReturn(next: StateActionRewardScene, h: Handles, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'transition') return;
      const geo = gridGeom(next);
      const barX0 = geo.gx;
      const from = geo.center(step.s);
      const to = geo.center(step.next);
      const bump = step.bumped ? arrowEnd(next, step.s, step.actual).to : null;
      const dieX = geo.gx + step.u * geo.w;
      const barY = geo.gy + geo.h + 16;
      for (const node of h.arriving) node.setAttribute('opacity', '0');
      if (h.seen) h.seen.textContent = t('label.sees', 'Sees: {s}', { s: cellText(step.s) });

      const frame = (p: number) => {
        // 주사위가 띠 위를 굴러 자리를 잡고, 격자 위의 자리가 옮겨 가고, 돌아오는 것이 길을 건넌다
        const a = easeInOut(clamp01(p / 0.3));
        const b = easeInOut(clamp01((p - 0.3) / 0.3));
        const c = easeInOut(clamp01((p - 0.6) / 0.4));
        if (h.dieMark) {
          const mx = barX0 + (dieX - barX0) * a;
          h.dieMark.setAttribute(
            'd',
            `M ${r2(mx)} ${r2(barY - 1)} L ${r2(mx - 5)} ${r2(barY - 9)} L ${r2(mx + 5)} ${r2(barY - 9)} Z`,
          );
        }
        if (h.marker) {
          let x: number;
          let y: number;
          if (bump) {
            const k = b < 0.5 ? b * 2 : (1 - b) * 2;
            x = from[0] + (bump[0] - from[0]) * k * 0.6;
            y = from[1] + (bump[1] - from[1]) * k * 0.6;
          } else {
            x = from[0] + (to[0] - from[0]) * b;
            y = from[1] + (to[1] - from[1]) * b;
          }
          h.marker.setAttribute('cx', String(r2(x)));
          h.marker.setAttribute('cy', String(r2(y)));
        }
        if (h.retToken) {
          const x = c <= 0 ? retFromX : retFromX + (retToX - retFromX) * c;
          h.retToken.setAttribute('transform', `translate(${r2(x)} ${LANE_RET_Y})`);
          h.retToken.setAttribute('opacity', p < 0.6 ? '0' : '1');
        }
      };
      frame(0);
      await run(RETURN_MS, frame, mine);
    }

    return {
      async render(next: StateActionRewardScene, prev: StateActionRewardScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || !prev) return;
        const kind = next.step.kind;
        if (kind === 'act') {
          await animateAct(h, mine);
        } else if (kind === 'transition') {
          await animateReturn(next, h, mine);
        } else {
          return;
        }
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
