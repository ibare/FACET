/**
 * wait-and-signal 무대.
 *
 * 동사 — 내려놓고 잠든다. 자물쇠는 가운데 제자리에 있고 스레드가 그리로 들어가고 나온다.
 * `wait` 걸음에서 받는 쪽은 자물쇠를 두고 오른쪽(조건 변수 곁)으로 먼저 떠나고, 그 뒤에 줄에 섰던 쪽이
 * 들어와 자물쇠를 받는다. `signal` 걸음에서 받는 쪽은 조건 변수 곁에서 곧장 자물쇠로 가지 않고,
 * 아래로 돌아 왼쪽 자물쇠 줄 끝으로 옮겨 선다 — 잠든 채로.
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
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { spotOf, type Spot, type WaitAndSignalScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 380;
const W = PIECE_CANVAS_W;
const PAD = 12;

// 세로 띠
const PANEL_Y0 = 6;
const PANEL_Y1 = 130;
const MID_Y = 150;
const ZONE_Y0 = 190;
const ZONE_Y1 = 282;
const ROW_Y = 254;
const OUT_Y = 314;
const CAPTION_Y = 366;

const DISC_R = 15;
const MOVE_MS = 760;

type XY = { x: number; y: number };

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function easeInOut(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

// 가로 구역 — 캔버스 폭에서 역산한다
const LQ_X0 = PAD;
const LQ_X1 = r2(W * 0.36);
const HOLD_X0 = r2(W * 0.4);
const HOLD_X1 = r2(W * 0.6);
const CQ_X0 = r2(W * 0.64);
const CQ_X1 = W - PAD;
const SLOT0 = 30;

function slotGap(count: number, zoneW: number): number {
  if (count <= 1) return 44;
  return Math.min(44, (zoneW - 2 * SLOT0) / (count - 1));
}

function spotXY(spot: Spot, index: number, count: number): XY {
  switch (spot.at) {
    case 'holder':
      return { x: W / 2, y: ROW_Y };
    case 'lockQueue':
      return { x: r2(LQ_X1 - SLOT0 - spot.slot * slotGap(count, LQ_X1 - LQ_X0)), y: ROW_Y };
    case 'condQueue':
      return { x: r2(CQ_X0 + SLOT0 + spot.slot * slotGap(count, CQ_X1 - CQ_X0)), y: ROW_Y };
    case 'out':
      return { x: r2(PAD + ((index + 0.5) * (W - 2 * PAD)) / Math.max(1, count)), y: OUT_Y };
  }
}

/** 둘 사이를 아래로 휘어 지나는 길 — 가운데 자물쇠를 가로지르지 않게 */
function along(a: XY, b: XY, k: number): XY {
  const bend = Math.min(80, Math.abs(b.x - a.x) * 0.22);
  const cx = (a.x + b.x) / 2;
  const cy = Math.max(a.y, b.y) + bend;
  const u = 1 - k;
  return {
    x: r2(u * u * a.x + 2 * u * k * cx + k * k * b.x),
    y: r2(u * u * a.y + 2 * u * k * cy + k * k * b.y),
  };
}

export const waitAndSignalStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const monoPx = parseFloat(fontSizes.sm);
    const lineGap = Math.round(monoPx * 1.6);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    /** 지금 화면의 스레드 원판 — drawStatic 이 매번 새로 짓는다 */
    let discs = new Map<string, SVGGElement>();

    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    }

    function captionOf(scene: WaitAndSignalScene): string {
      const st = scene.step;
      if (st === null) return t('caption.start', 'Nothing has run yet.');
      if (st.kind === 'deadlock') return t('caption.deadlock', 'No thread is ready. Stopped.');
      const th = scene.threads.find((x) => x.id === st.thread);
      const lineText = th?.lines[st.line]?.trim() ?? '';
      const vars = {
        t: st.thread,
        o: st.other ?? '',
        m: scene.lock,
        c: scene.cond,
        f: scene.flagName,
        v: String(scene.flag),
        line: lineText,
      };
      switch (st.kind) {
        case 'take':
          return t('caption.take', 'Lock {m} was free. Owner now: {t}.', vars);
        case 'block':
          return t('caption.block', 'Lock {m} is held by {o}. {t} sleeps in its queue.', vars);
        case 'checkFalse':
          return t('caption.checkFalse', '{t} checks {f}: false. Into the loop body.', vars);
        case 'checkTrue':
          return t('caption.checkTrue', '{t} checks {f}: true. Past the loop.', vars);
        case 'wait':
          return st.other === null
            ? t('caption.waitFree', '{t} puts down {m} and sleeps on {c}. {m} is free.', vars)
            : t('caption.wait', '{t} puts down {m} and sleeps on {c}. {m} passes to {o}.', vars);
        case 'set':
          return t('caption.set', '{t} sets {f} = {v}.', vars);
        case 'signal':
          return t('caption.signal', '{t} signals {c}. {o} moves to the queue for {m}, still asleep.', vars);
        case 'signalNone':
          return t('caption.signalNone', 'No thread sleeps on {c}. Nothing happens.', vars);
        case 'unlockHand':
          return t('caption.unlockHand', '{t} releases {m}. It passes straight to {o}.', vars);
        case 'unlockFree':
          return t('caption.unlockFree', '{t} releases {m}. No one waits. {m} is free.', vars);
        case 'work':
          return t('caption.work', '{t} runs {line} while holding {m}.', vars);
      }
    }

    function drawPanels(scene: WaitAndSignalScene, hue: readonly string[]): void {
      const n = scene.threads.length;
      if (n === 0) return;
      const gap = PAD;
      const pw = (W - 2 * PAD - gap * (n - 1)) / n;
      const st = scene.step;
      scene.threads.forEach((th, i) => {
        const x0 = PAD + i * (pw + gap);
        const g = el('g', {}, svg);
        el(
          'rect',
          {
            x: r2(x0),
            y: PANEL_Y0,
            width: r2(pw),
            height: PANEL_Y1 - PANEL_Y0,
            rx: 6,
            fill: colors.bgSubtle,
            stroke: colors.border,
          },
          g,
        );
        el('circle', { cx: r2(x0 + 18), cy: PANEL_Y0 + 16, r: 7, fill: hue[i] ?? colors.primary }, g);
        text(g, x0 + 32, PANEL_Y0 + 16, th.id, { size: fontSizes.md, weight: '700', mono: true });
        text(g, x0 + 48, PANEL_Y0 + 16, th.role === 'taker' ? t('role.taker', 'Taker') : t('role.giver', 'Giver'), { fill: colors.textMuted });
        const avail = PANEL_Y1 - PANEL_Y0 - 36;
        const step = Math.min(lineGap, avail / Math.max(1, th.lines.length));
        th.lines.forEach((ln, j) => {
          const y = PANEL_Y0 + 38 + j * step;
          const running = st !== null && st.kind !== 'deadlock' && st.thread === th.id && st.line === j;
          if (running) {
            el(
              'rect',
              {
                x: r2(x0 + 6),
                y: r2(y - step / 2),
                width: r2(pw - 12),
                height: r2(step),
                rx: 3,
                fill: colors.itemActive,
                'fill-opacity': 0.22,
              },
              g,
            );
            el('rect', { x: r2(x0 + 6), y: r2(y - step / 2), width: 3, height: r2(step), fill: colors.itemActive }, g);
          }
          text(g, x0 + 18, y, ln.replace(/ /g, ' '), {
            mono: true,
            fill: scene.done.includes(th.id) ? colors.textMuted : colors.text,
            weight: running ? '700' : '400',
          });
        });
      });
    }

    function drawMiddle(scene: WaitAndSignalScene): void {
      const st = scene.step;
      if (st !== null) {
        text(svg, PAD, MID_Y, t('label.tick', 'Tick {n}', { n: st.tick }), {
          size: fontSizes.md,
          weight: '700',
        });
      }
      const boxW = 150;
      const boxH = 30;
      const cx = W / 2;
      const kind = st === null ? null : st.kind;
      const checking = kind === 'checkFalse' || kind === 'checkTrue';
      const setting = kind === 'set';
      el(
        'rect',
        {
          x: r2(cx - boxW / 2),
          y: r2(MID_Y - boxH / 2),
          width: boxW,
          height: boxH,
          rx: 5,
          fill: colors.bg,
          stroke: checking ? colors.itemComparing : setting ? colors.accent : colors.border,
          'stroke-width': checking || setting ? 2.5 : 1,
        },
        svg,
      );
      text(svg, cx, MID_Y, `${scene.flagName} = ${String(scene.flag)}`, {
        mono: true,
        size: fontSizes.md,
        anchor: 'middle',
        weight: '700',
        fill: scene.flag ? colors.success : colors.text,
      });
      text(svg, cx + boxW / 2 + 12, MID_Y, t('label.checks', 'Checked: {n}', { n: scene.checks }), {
        fill: checking ? colors.itemComparing : colors.textMuted,
        weight: checking ? '700' : '400',
      });
    }

    function drawZones(scene: WaitAndSignalScene): void {
      const zones: Array<{ x0: number; x1: number; label: string; dashed: boolean }> = [
        { x0: LQ_X0, x1: LQ_X1, label: t('label.lockQueue', 'Queue for {m}', { m: scene.lock }), dashed: true },
        { x0: HOLD_X0, x1: HOLD_X1, label: t('label.holder', 'Holds {m}', { m: scene.lock }), dashed: false },
        { x0: CQ_X0, x1: CQ_X1, label: t('label.condQueue', 'Asleep on {c}', { c: scene.cond }), dashed: true },
      ];
      for (const z of zones) {
        el(
          'rect',
          {
            x: z.x0,
            y: ZONE_Y0,
            width: r2(z.x1 - z.x0),
            height: ZONE_Y1 - ZONE_Y0,
            rx: 8,
            fill: z.dashed ? colors.bg : colors.bgSubtle,
            stroke: colors.border,
            'stroke-dasharray': z.dashed ? '5 4' : 'none',
          },
          svg,
        );
        text(svg, (z.x0 + z.x1) / 2, ZONE_Y0 - 11, z.label, { anchor: 'middle', fill: colors.textMuted });
      }
      // 자물쇠 — 가운데 제자리. 주인이 있으면 잠긴 모양, 없으면 고리가 열린다
      const lx = W / 2;
      const ly = ZONE_Y0 + 18;
      const held = scene.owner !== null;
      const bw = 22;
      const bh = 15;
      el(
        'path',
        {
          d: held
            ? `M ${r2(lx - 6)} ${r2(ly)} v -6 a 6 6 0 0 1 12 0 v 6`
            : `M ${r2(lx - 6)} ${r2(ly)} v -6 a 6 6 0 0 1 12 0 v -3`,
          fill: 'none',
          stroke: held ? colors.text : colors.textMuted,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
        },
        svg,
      );
      el(
        'rect',
        {
          x: r2(lx - bw / 2),
          y: r2(ly),
          width: bw,
          height: bh,
          rx: 3,
          fill: held ? colors.text : colors.bg,
          stroke: held ? colors.text : colors.textMuted,
          'stroke-width': 1.5,
        },
        svg,
      );
      text(svg, lx, ly + bh / 2 + 0.5, scene.lock, {
        mono: true,
        size: fontSizes.xs,
        anchor: 'middle',
        weight: '700',
        fill: held ? colors.bg : colors.textMuted,
      });
    }

    function drawDiscs(scene: WaitAndSignalScene, hue: readonly string[]): void {
      const st = scene.step;
      const running = st !== null && st.kind !== 'deadlock' ? st.thread : null;
      const n = scene.threads.length;
      discs = new Map();
      scene.threads.forEach((th, i) => {
        const spot = spotOf(scene, th.id);
        const p = spotXY(spot, i, n);
        const asleep = spot.at === 'lockQueue' || spot.at === 'condQueue';
        const done = scene.done.includes(th.id);
        const color = hue[i] ?? colors.primary;
        const g = el('g', { transform: `translate(${p.x} ${p.y})` }, svg);
        if (running === th.id) {
          el('circle', { cx: 0, cy: 0, r: DISC_R + 5, fill: 'none', stroke: colors.accent, 'stroke-width': 3 }, g);
        }
        el(
          'circle',
          {
            cx: 0,
            cy: 0,
            r: DISC_R,
            fill: asleep || done ? colors.bg : color,
            stroke: done ? colors.textMuted : color,
            'stroke-width': 2.5,
            'stroke-dasharray': asleep ? '4 3' : 'none',
          },
          g,
        );
        text(g, 0, 1, th.id, {
          mono: true,
          size: fontSizes.md,
          anchor: 'middle',
          weight: '700',
          fill: asleep ? color : done ? colors.textMuted : colors.textInverse,
        });
        if (done) {
          text(g, 0, DISC_R + 14, t('label.done', 'Done'), { anchor: 'middle', fill: colors.textMuted, size: fontSizes.xs });
        }
        discs.set(th.id, g);
      });
    }

    function drawStatic(scene: WaitAndSignalScene): void {
      svg.textContent = '';
      discs = new Map();
      if (scene.threads.length === 0) return;
      const hue = categorical(scene.threads.length);
      drawPanels(scene, hue);
      drawMiddle(scene);
      drawZones(scene);
      drawDiscs(scene, hue);
      text(svg, W / 2, CAPTION_Y, captionOf(scene), { anchor: 'middle', size: fontSizes.md });
    }

    function frames(mine: number, duration: number, onFrame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const step = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const k = Math.min(1, (performance.now() - start) / duration);
          onFrame(k);
          if (k >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            step();
          }, 16);
          timers.add(id);
        };
        step();
      });
    }

    async function animateMoves(next: WaitAndSignalScene, mine: number): Promise<void> {
      const st = next.step;
      if (st === null || st.kind === 'deadlock' || st.moves.length === 0) return;
      const n = next.threads.length;
      const leavesHolder = st.moves.some((m) => m.from.at === 'holder');
      const paths = st.moves.flatMap((m) => {
        const i = next.threads.findIndex((x) => x.id === m.id);
        const g = discs.get(m.id);
        if (i < 0 || g === undefined) return [];
        const to = spotOf(next, m.id);
        // 내려놓고 떠나는 쪽이 먼저, 그 자리로 들어오는 쪽은 뒤에
        const window: [number, number] =
          leavesHolder && to.at === 'holder' ? [0.5, 1] : leavesHolder && m.from.at === 'holder' ? [0, 0.55] : [0, 1];
        return [{ g, a: spotXY(m.from, i, n), b: spotXY(to, i, n), window }];
      });
      await frames(mine, MOVE_MS, (k) => {
        for (const p of paths) {
          const local = Math.max(0, Math.min(1, (k - p.window[0]) / (p.window[1] - p.window[0])));
          const q = along(p.a, p.b, easeInOut(local));
          p.g.setAttribute('transform', `translate(${q.x} ${q.y})`);
        }
      });
    }

    return {
      async render(next: WaitAndSignalScene, _prev: WaitAndSignalScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        await animateMoves(next, mine);
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
