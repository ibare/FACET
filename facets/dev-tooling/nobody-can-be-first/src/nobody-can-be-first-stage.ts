/**
 * nobody-can-be-first 의 무대.
 *
 * 동사: 제 발자국을 밟는다. 도구가 들어간 대상은 가운데 더미에 아래부터 하나씩 떨어져 쌓인다.
 * 이미 쌓인 대상에 다시 닿으면 그 이름이 더미 맨 위에 점선으로 떨어지고, 옆으로 휜 화살이 더미
 * 안의 같은 이름으로 되돌아간다. 보고 걸음에 그 대상부터 맨 위까지가 더미에서 오른쪽으로 잘려
 * 나오고, 도구의 보고 줄이 그 아래 선다. 확인이 끝난 대상은 더미에서 왼쪽 "확인됨" 칸으로 내려간다.
 * 왼쪽 위의 규칙 표는 지금 따라간 입력을 짚는다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { NobodyCanBeFirstScene } from './scene';

const H = 340;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 20;
const TOP = 14;
/** 규칙 표 한 줄 */
const LH = 20;
/** 더미 칸 하나의 높이와 칸 사이 */
const CH = 30;
const PITCH = 38;
/** 되돌아가는 화살이 옆으로 휘는 폭 */
const ARC = 34;
/** 떨어지는 거리 */
const DROP = 26;
const CHIP_MAX = 120;

const ENTER_MS = 450;
const CHECK_MS = 600;
const GHOST_MS = 350;
const ARC_MS = 450;
const CUT_MS = 650;
const LINE_MS = 300;

function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

type Layout = {
  cw: number;
  targetColW: number;
  rulesW: number;
  chipW: number;
  pileX: number;
  cutX: number;
  slotY: (i: number) => number;
  labelY: number;
  trayLabelY: number;
  tray: (k: number) => { x: number; y: number };
  toolY: number;
  captionY: number;
};

function layout(scene: NobodyCanBeFirstScene): Layout {
  const cw = parseFloat(fontSizes.sm) * 0.6;
  const targetColW = Math.max(...scene.rules.map((x) => x.target.length)) * cw;
  const lineChars = (x: { target: string; inputs: string[] }): number =>
    x.target.length + 3 + x.inputs.join(' · ').length;
  const rulesW = Math.max(...scene.rules.map(lineChars)) * cw;
  const free = W - 2 * PAD - rulesW;
  const gapA = 24;
  const gapB = ARC + 16;
  const chipW = Math.min(CHIP_MAX, (free - gapA - gapB - ARC) / 2);
  const extra = Math.max(0, free - gapA - gapB - ARC - 2 * chipW);
  const pileX = PAD + rulesW + gapA + extra / 2;
  const cutX = pileX + chipW + gapB + extra / 2;
  // 쌓일 수 있는 것은 대상 수까지, 다시 닿은 이름이 그 위에 한 칸 더
  const slots = scene.rules.length + 1;
  const yBase = TOP + slots * PITCH;
  const slotY = (i: number): number => yBase - (i + 1) * PITCH + (PITCH - CH);
  const trayLabelY = TOP + scene.rules.length * LH + 30;
  const perRow = Math.max(1, Math.floor((rulesW + 10) / (chipW + 10)));
  const tray = (k: number): { x: number; y: number } => ({
    x: PAD + (k % perRow) * (chipW + 10),
    y: trayLabelY + 10 + Math.floor(k / perRow) * PITCH,
  });
  return {
    cw,
    targetColW,
    rulesW,
    chipW,
    pileX,
    cutX,
    slotY,
    labelY: yBase + 16,
    trayLabelY,
    tray,
    toolY: yBase + 46,
    captionY: H - 14,
  };
}

function el(
  tag: string,
  attrs: Record<string, string | number>,
  parent: Element,
  text?: string,
): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 삼차 베지어의 길이를 꺾은선으로 잰다 */
function bezierLength(pts: [number, number][]): number {
  const [p0, p1, p2, p3] = pts as [[number, number], [number, number], [number, number], [number, number]];
  let len = 0;
  let px = p0[0];
  let py = p0[1];
  for (let k = 1; k <= 24; k += 1) {
    const u = k / 24;
    const a = (1 - u) ** 3;
    const b = 3 * (1 - u) ** 2 * u;
    const c = 3 * (1 - u) * u ** 2;
    const d = u ** 3;
    const x = a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0];
    const y = a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1];
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return len;
}

type ChipKind = 'waiting' | 'top' | 'hit' | 'ghost' | 'cycle' | 'checked';

type Handles = {
  pile: Map<string, SVGElement>;
  tray: Map<string, SVGElement>;
  ghost: SVGElement | null;
  arc: { path: SVGElement; head: SVGElement; len: number } | null;
  cut: SVGElement | null;
  toolLine: SVGElement | null;
};

export const nobodyCanBeFirstStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles: Handles = emptyHandles();

    function emptyHandles(): Handles {
      return { pile: new Map(), tray: new Map(), ghost: null, arc: null, cut: null, toolLine: null };
    }

    function chip(
      parent: Element,
      x: number,
      y: number,
      w: number,
      name: string,
      kind: ChipKind,
    ): void {
      const stroke =
        kind === 'waiting' || kind === 'top'
          ? colors.itemActive
          : kind === 'checked'
            ? colors.border
            : colors.danger;
      const fill = kind === 'checked' ? colors.bgSubtle : kind === 'ghost' ? 'none' : colors.bg;
      const ink =
        kind === 'checked' ? colors.textMuted : kind === 'ghost' ? colors.danger : colors.text;
      const rect: Record<string, string | number> = {
        x: r(x),
        y: r(y),
        width: r(w),
        height: CH,
        rx: 6,
        fill,
        stroke,
        'stroke-width': kind === 'waiting' || kind === 'checked' ? 1.5 : 2.5,
      };
      if (kind === 'ghost') rect['stroke-dasharray'] = '5 4';
      el('rect', rect, parent);
      el(
        'text',
        {
          x: r(x + w / 2),
          y: r(y + CH / 2),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': kind === 'waiting' || kind === 'checked' ? 400 : 600,
          fill: ink,
        },
        parent,
        name,
      );
    }

    /** 칸 i 의 아래 모서리에서 칸 i-1 의 위 모서리까지 — 쌓인 것을 잇는 짧은 줄 */
    function link(parent: Element, x: number, lay: Layout, i: number, stroke: string): void {
      if (i === 0) return;
      el(
        'line',
        {
          x1: r(x + lay.chipW / 2),
          x2: r(x + lay.chipW / 2),
          y1: r(lay.slotY(i) + CH),
          y2: r(lay.slotY(i - 1)),
          stroke,
          'stroke-width': 1.5,
        },
        parent,
      );
    }

    /** 칸 from 의 오른쪽에서 칸 to 의 오른쪽으로 옆으로 휘어 되돌아가는 화살 */
    function backArrow(parent: Element, x: number, lay: Layout, from: number, to: number) {
      const sx = x + lay.chipW;
      const y1 = lay.slotY(from) + CH / 2;
      const y2 = lay.slotY(to) + CH / 2;
      const bend = ARC - 4;
      const pts: [number, number][] = [
        [sx, y1],
        [sx + bend, y1],
        [sx + bend, y2],
        [sx + 5, y2],
      ];
      const d = `M ${r(sx)} ${r(y1)} C ${r(sx + bend)} ${r(y1)} ${r(sx + bend)} ${r(y2)} ${r(sx + 5)} ${r(y2)}`;
      const len = bezierLength(pts);
      const path = el(
        'path',
        { d, fill: 'none', stroke: colors.danger, 'stroke-width': 2, 'stroke-linecap': 'round' },
        parent,
      );
      const hx = sx + 3;
      const head = el(
        'path',
        {
          d: `M ${r(hx)} ${r(y2)} L ${r(hx + 8)} ${r(y2 - 5)} L ${r(hx + 8)} ${r(y2 + 5)} Z`,
          fill: colors.danger,
        },
        parent,
      );
      return { path, head, len };
    }

    function drawRules(root: Element, scene: NobodyCanBeFirstScene, lay: Layout): void {
      const g = el('g', {}, root);
      const s = scene.step;
      // 이 걸음이 짚는 줄과 그 줄의 입력
      let line: string | null = null;
      let token: string | null = null;
      let tokenInk: 'accent' | 'danger' = 'accent';
      if (s.kind === 'enter') {
        line = s.from ?? s.name;
        token = s.from === null ? null : s.name;
      } else if (s.kind === 'checked') {
        line = s.name;
      } else if (s.kind === 'confirmed') {
        line = s.from;
        token = s.name;
      } else if (s.kind === 'revisit') {
        line = s.from;
        token = s.name;
        tokenInk = 'danger';
      }
      // 잘려 나온 고리는 규칙 표에 머문다 — 고리의 대상과 다음 대상을 짚는다
      const cyclePairs = new Map<string, string>();
      if (scene.cut) {
        const c = scene.cut.cycle;
        for (let j = 0; j + 1 < c.length; j += 1) cyclePairs.set(c[j] as string, c[j + 1] as string);
      } else if (scene.revisit) {
        cyclePairs.set(scene.revisit.from, scene.revisit.name);
      }
      const fs = parseFloat(fontSizes.sm);
      scene.rules.forEach((rule, i) => {
        const top = TOP + i * LH;
        const base = top + LH / 2;
        if (rule.target === line) {
          el(
            'rect',
            {
              x: PAD - 6,
              y: r(top),
              width: r(lay.rulesW + 12),
              height: LH,
              rx: 3,
              fill: colors.bgSubtle,
            },
            g,
          );
        }
        const txt = (x: number, s2: string, ink: string, anchor: string, weight: number): void => {
          el(
            'text',
            {
              x: r(x),
              y: r(base),
              'text-anchor': anchor,
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': weight,
              fill: ink,
            },
            g,
            s2,
          );
        };
        const inCycle = scene.cut ? scene.cut.cycle.includes(rule.target) : false;
        const goalHit = s.kind === 'enter' && s.from === null && rule.target === s.name;
        if (goalHit) {
          const w = rule.target.length * lay.cw + 6;
          el(
            'rect',
            {
              x: r(PAD + lay.targetColW - w + 3),
              y: r(base - fs / 2 - 3),
              width: r(w),
              height: r(fs + 6),
              rx: 3,
              fill: colors.accent,
            },
            g,
          );
        }
        txt(
          PAD + lay.targetColW,
          rule.target,
          goalHit ? colors.stateInk : inCycle ? colors.danger : colors.text,
          'end',
          inCycle || goalHit ? 600 : 400,
        );
        txt(PAD + lay.targetColW + lay.cw, '←', colors.textMuted, 'start', 400);
        let x = PAD + lay.targetColW + 3 * lay.cw;
        rule.inputs.forEach((input, k) => {
          if (k > 0) txt(x - 2 * lay.cw, '·', colors.textMuted, 'start', 400);
          const w = input.length * lay.cw;
          const pointed = rule.target === line && input === token;
          const onCycle = cyclePairs.get(rule.target) === input;
          let ink = scene.sources.includes(input) ? colors.textMuted : colors.text;
          let weight = 400;
          if (pointed && tokenInk === 'accent') {
            el(
              'rect',
              { x: r(x - 3), y: r(base - fs / 2 - 3), width: r(w + 6), height: r(fs + 6), rx: 3, fill: colors.accent },
              g,
            );
            ink = colors.stateInk;
            weight = 600;
          } else if (onCycle) {
            ink = colors.danger;
            weight = 600;
            el(
              'line',
              { x1: r(x), x2: r(x + w), y1: r(base + fs / 2 + 2), y2: r(base + fs / 2 + 2), stroke: colors.danger, 'stroke-width': 1.5 },
              g,
            );
          }
          txt(x, input, ink, 'start', weight);
          x += w + 3 * lay.cw;
        });
      });
    }

    function label(root: Element, x: number, y: number, text: string, anchor: string): void {
      el(
        'text',
        {
          x: r(x),
          y: r(y),
          'text-anchor': anchor,
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        root,
        text,
      );
    }

    function caption(scene: NobodyCanBeFirstScene): string {
      const s = scene.step;
      switch (s.kind) {
        case 'start':
          return t('caption.start', 'Requested: {goal}', { goal: scene.goal });
        case 'enter':
          return s.from === null
            ? t('caption.enter', 'Enter: {name}', { name: s.name })
            : t('caption.enterFrom', 'Enter: {name} · input of {from}', { name: s.name, from: s.from });
        case 'checked':
          return t('caption.checked', 'No cycle below: {name}', { name: s.name });
        case 'confirmed':
          return t('caption.confirmed', 'Already checked: {name}', { name: s.name });
        case 'revisit':
          return t('caption.revisit', 'Reached again: {name} · still waiting', { name: s.name });
        case 'report':
          return t('caption.report', 'Cycle length: {n} · Built: {built}', { n: s.length, built: s.built });
      }
    }

    function drawStatic(scene: NobodyCanBeFirstScene): void {
      svg.textContent = '';
      handles = emptyHandles();
      const lay = layout(scene);
      const root = el('g', {}, svg);

      drawRules(root, scene, lay);

      // 가운데 더미 — "기다리는 중"
      const pile = el('g', {}, root);
      const last = scene.stack.length - 1;
      scene.stack.forEach((name, i) => {
        const g = el('g', {}, pile);
        link(g, lay.pileX, lay, i, colors.border);
        const hit = scene.cut === null && scene.revisit !== null && scene.revisit.name === name;
        chip(g, lay.pileX, lay.slotY(i), lay.chipW, name, hit ? 'hit' : i === last ? 'top' : 'waiting');
        handles.pile.set(name, g);
      });
      label(root, lay.pileX + lay.chipW / 2, lay.labelY, t('label.waiting', 'Waiting'), 'middle');

      // 다시 닿은 이름 — 더미 맨 위에 점선으로, 화살이 더미 안의 같은 이름으로 되돌아간다
      if (scene.cut === null && scene.revisit !== null) {
        const at = scene.stack.indexOf(scene.revisit.name);
        if (at < 0) throw new Error(`nobody-can-be-first: 쌓이지 않은 ${scene.revisit.name} 에 다시 닿았다`);
        const gi = scene.stack.length;
        const g = el('g', {}, root);
        link(g, lay.pileX, lay, gi, colors.danger);
        chip(g, lay.pileX, lay.slotY(gi), lay.chipW, scene.revisit.name, 'ghost');
        handles.ghost = g;
        handles.arc = backArrow(root, lay.pileX, lay, gi, at);
      }

      // 잘려 나온 고리 — 더미에 있던 높이 그대로 오른쪽에
      if (scene.cut !== null) {
        const { cycle, at } = scene.cut;
        const g = el('g', {}, root);
        cycle.forEach((name, j) => {
          const i = at + j;
          if (j > 0) link(g, lay.cutX, lay, i, colors.danger);
          chip(g, lay.cutX, lay.slotY(i), lay.chipW, name, j === cycle.length - 1 ? 'ghost' : 'cycle');
        });
        backArrow(g, lay.cutX, lay, at + cycle.length - 1, at);
        handles.cut = g;
        label(root, lay.cutX + lay.chipW / 2, lay.labelY, t('label.cycle', 'Cycle'), 'middle');
        handles.toolLine = el(
          'text',
          {
            x: r(lay.pileX),
            y: r(lay.toolY),
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 600,
            fill: colors.danger,
          },
          root,
          cycle.join(' -> '),
        );
      }

      // 확인됨 칸
      if (scene.checked.length > 0) {
        label(root, PAD, lay.trayLabelY, t('label.checked', 'Checked'), 'start');
        scene.checked.forEach((name, k) => {
          const p = lay.tray(k);
          const g = el('g', {}, root);
          chip(g, p.x, p.y, lay.chipW, name, 'checked');
          handles.tray.set(name, g);
        });
      }

      el(
        'text',
        {
          x: PAD,
          y: r(lay.captionY),
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        root,
        caption(scene),
      );
    }

    function ease(p: number): number {
      return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    }

    /** ms 동안 f(0..1) 을 흘린다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(ms: number, mine: number, f: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (mine !== gen || destroyed) {
            done();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          f(ease(p));
          if (p >= 1) {
            done();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: NobodyCanBeFirstScene,
      _prev: NobodyCanBeFirstScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      drawStatic(next);
      if (!opts.animate) return;
      const lay = layout(next);
      const s = next.step;
      const live = (): boolean => mine === gen && !destroyed;

      if (s.kind === 'enter') {
        const g = handles.pile.get(s.name);
        if (g) {
          await tween(ENTER_MS, mine, (p) => {
            g.setAttribute('transform', `translate(0 ${r(-DROP * (1 - p))})`);
            g.setAttribute('opacity', String(r(p)));
          });
        }
      } else if (s.kind === 'checked') {
        const g = handles.tray.get(s.name);
        const k = next.checked.indexOf(s.name);
        if (g && k >= 0) {
          const to = lay.tray(k);
          const dx = lay.pileX - to.x;
          const dy = lay.slotY(s.was) - to.y;
          await tween(CHECK_MS, mine, (p) => {
            g.setAttribute('transform', `translate(${r(dx * (1 - p))} ${r(dy * (1 - p))})`);
          });
        }
      } else if (s.kind === 'revisit') {
        const ghost = handles.ghost;
        const arc = handles.arc;
        if (ghost && arc) {
          arc.path.setAttribute('stroke-dasharray', `${r(arc.len)} ${r(arc.len)}`);
          arc.path.setAttribute('stroke-dashoffset', String(r(arc.len)));
          arc.head.setAttribute('opacity', '0');
          await tween(GHOST_MS, mine, (p) => {
            ghost.setAttribute('transform', `translate(0 ${r(-DROP * (1 - p))})`);
            ghost.setAttribute('opacity', String(r(p)));
          });
          if (!live()) return;
          await tween(ARC_MS, mine, (p) => {
            arc.path.setAttribute('stroke-dashoffset', String(r(arc.len * (1 - p))));
            if (p >= 1) arc.head.removeAttribute('opacity');
          });
        }
      } else if (s.kind === 'report') {
        const cut = handles.cut;
        const line = handles.toolLine;
        if (cut && line) {
          const dx = lay.pileX - lay.cutX;
          line.setAttribute('opacity', '0');
          await tween(CUT_MS, mine, (p) => {
            cut.setAttribute('transform', `translate(${r(dx * (1 - p))} 0)`);
          });
          if (!live()) return;
          await tween(LINE_MS, mine, (p) => {
            line.setAttribute('opacity', String(r(p)));
          });
        }
      }
      if (live()) drawStatic(next);
    }

    return {
      render,
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
