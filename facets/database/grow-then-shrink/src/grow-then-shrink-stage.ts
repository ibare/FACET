/**
 * grow-then-shrink 무대 — 쥔 잠금이 한 번 부풀었다 줄어든다.
 *
 * 왼쪽: 위에 줄 자리(a · b · c · d)와 할 일, 아래에 T1 이 쥔 잠금 더미.
 *       잡으면 잠금이 줄 자리에서 내려와 더미 꼭대기에 얹히고, 놓으면 가장 먼저
 *       잡은 것(더미 밑)이 빠져 줄 자리로 돌아가며 나머지가 한 칸 내려앉는다.
 *       다 쓰고도 쥐고 있는 잠금은 점선 테두리이고, 그렇게 지난 걸음마다 곁에 점이 붙는다.
 * 오른쪽: 걸음마다 쥔 수를 이은 윤곽. 더미와 같은 바닥 · 같은 칸 높이라 더미 꼭대기와
 *       윤곽의 지금 점이 한 수평선에 선다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { GrowThenShrinkScene } from './scene.js';

const H = 300;
const PAD = 20;
const MOVE_MS = 500;
const FRAME_MS = 16;
const DOT_R = 3.5;
const DOT_GAP = 11;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 줄 이름 · 연산 표기. 번역하지 않는 자료다. */
function lockLabel(mode: string, txn: number, row: string): string {
  return `${mode}${txn}(${row})`;
}

type Geometry = {
  lx0: number;
  lw: number;
  sockW: number;
  sockH: number;
  sockY: number;
  sockX: (i: number) => number;
  opY: number;
  base: number;
  pitch: number;
  chipW: number;
  chipH: number;
  chipY: (slot: number) => number;
  px0: number;
  px1: number;
  px: (k: number) => number;
  py: (c: number) => number;
};

function geometry(n: number): Geometry {
  const W = PIECE_CANVAS_W;
  const lx0 = PAD;
  const lw = Math.min(210, W * 0.34);
  const gap = 10;
  const sockW = Math.min(44, (lw - gap * (n - 1)) / n);
  const sockH = 30;
  const sockY = 42;
  const opY = sockY + sockH + 18;
  const base = H - 44;
  const top = opY + 26;
  const pitch = Math.min(42, (base - top) / n);
  const chipW = Math.min(100, lw * 0.5);
  const chipH = pitch - 6;
  const px0 = lx0 + lw + 56;
  const px1 = W - PAD - 8;
  const steps = 2 * n;
  return {
    lx0,
    lw,
    sockW,
    sockH,
    sockY,
    sockX: (i) => lx0 + i * (sockW + gap),
    opY,
    base,
    pitch,
    chipW,
    chipH,
    chipY: (slot) => base - (slot + 1) * pitch + 3,
    px0,
    px1,
    px: (k) => px0 + (k * (px1 - px0)) / steps,
    py: (c) => base - c * pitch,
  };
}

function mountGrowThenShrink(
  _container: HTMLElement,
  params: ViewMountParams & { canvas: SVGSVGElement },
): ViewInstance {
  const svg = params.canvas;
  const colors: Palette = getColors(params.theme);
  const t: Translate = params.t ?? makeTranslator(params.locale);
  const [colorS = colors.primary, colorX = colors.danger] = categorical(2, 'vivid');
  const PX_SM = parseFloat(fontSizes.sm);

  let gen = 0;
  let destroyed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const waiters = new Set<() => void>();

  function el(tag: string, attrs: Attrs, parent: Element, text?: string): SVGElement {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
    if (text !== undefined) node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function modeColor(mode: string): string {
    return mode === 'S' ? colorS : colorX;
  }

  type Handles = {
    chips: Map<string, SVGElement>;
    segment: SVGElement | null;
    dot: SVGElement | null;
    guide: SVGElement | null;
    geo: Geometry;
  };

  function captionOf(scene: GrowThenShrinkScene): string {
    const s = scene.step;
    const txn = scene.txn;
    if (s === null) return t('caption.start', 'No lock held yet.');
    if (s.kind === 'acquire') {
      const vars = { lock: lockLabel(s.mode, txn, s.row), op: lockLabel(s.op, txn, s.row) };
      if (s.lockPoint) return t('caption.lockPoint', 'Take {lock}, then run {op}. Lock point reached.', vars);
      return t('caption.acquire', 'Take {lock}, then run {op}.', vars);
    }
    const vars = { lock: lockLabel('U', txn, s.row), n: s.waited, commit: `C${txn}` };
    if (s.commit) {
      return t('caption.releaseCommit', 'Release: {lock}. Steps held after its use: {n}. Then commit: {commit}.', vars);
    }
    return t('caption.release', 'Release: {lock}. Steps held after its use: {n}.', vars);
  }

  function drawStatic(scene: GrowThenShrinkScene): Handles {
    svg.textContent = '';
    const n = scene.ops.length;
    const g = geometry(n);
    const step = scene.step;
    const now = scene.counts.length - 1;
    const count = scene.counts[now] ?? 0;

    // 캡션
    el('text', { x: PAD, y: 22, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md }, svg, captionOf(scene));

    // 줄 자리와 할 일
    scene.ops.forEach((o, i) => {
      const x = g.sockX(i);
      const holder = scene.held.find((h) => h.row === o.row);
      const current = step !== null && step.row === o.row;
      el(
        'rect',
        {
          x,
          y: g.sockY,
          width: g.sockW,
          height: g.sockH,
          rx: 4,
          fill: colors.bg,
          stroke: current ? colors.accent : holder ? modeColor(holder.mode) : colors.border,
          'stroke-width': current ? 2.5 : holder ? 2 : 1,
        },
        svg,
      );
      el(
        'text',
        {
          x: x + g.sockW / 2,
          y: g.sockY + g.sockH / 2 + 5,
          'text-anchor': 'middle',
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        },
        svg,
        o.row,
      );
      const gone = scene.released.find((r) => r.row === o.row);
      if (gone !== undefined) {
        const cx0 = x + g.sockW / 2 - ((gone.waited - 1) * DOT_GAP) / 2;
        for (let k = 0; k < gone.waited; k += 1) {
          el('circle', { cx: cx0 + k * DOT_GAP, cy: g.sockY - 7, r: DOT_R, fill: colors.textMuted }, svg);
        }
      }
      const done = scene.done.includes(o.row);
      el(
        'text',
        {
          x: x + g.sockW / 2,
          y: g.opY,
          'text-anchor': 'middle',
          fill: done ? colors.text : colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        },
        svg,
        lockLabel(o.op, scene.txn, o.row),
      );
    });

    // T1 의 바닥
    el('line', { x1: g.lx0 - 4, y1: g.base, x2: g.lx0 + g.lw, y2: g.base, stroke: colors.text, 'stroke-width': 2 }, svg);
    el(
      'text',
      { x: g.lx0, y: g.base + 22, fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700 },
      svg,
      `T${scene.txn}`,
    );
    el(
      'text',
      { x: g.lx0 + 34, y: g.base + 22, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm },
      svg,
      t('label.held', 'Held: {n}', { n: count }),
    );
    if (scene.committed) {
      el(
        'text',
        {
          x: g.lx0 + g.lw,
          y: g.base + 22,
          'text-anchor': 'end',
          fill: colors.success,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
        },
        svg,
        `C${scene.txn}`,
      );
    }

    // 쥔 잠금 더미 (0 이 밑)
    const chips = new Map<string, SVGElement>();
    const dotX0 = g.lx0 + g.chipW + 12;
    scene.held.forEach((h, slot) => {
      const grp = el('g', {}, svg);
      const y = g.chipY(slot);
      const current = step !== null && step.kind === 'acquire' && step.row === h.row;
      el(
        'rect',
        {
          x: g.lx0,
          y,
          width: g.chipW,
          height: g.chipH,
          rx: 5,
          fill: colors.bgSubtle,
          stroke: modeColor(h.mode),
          'stroke-width': current ? 3 : 2,
          ...(h.waited > 0 ? { 'stroke-dasharray': '5 3' } : {}),
        },
        grp,
      );
      el(
        'text',
        {
          x: g.lx0 + g.chipW / 2,
          y: y + g.chipH / 2 + PX_SM * 0.36,
          'text-anchor': 'middle',
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        },
        grp,
        lockLabel(h.mode, scene.txn, h.row),
      );
      for (let k = 0; k < h.waited; k += 1) {
        el('circle', { cx: dotX0 + k * DOT_GAP, cy: y + g.chipH / 2, r: DOT_R, fill: colors.textMuted }, svg);
      }
      chips.set(h.row, grp);
    });
    if (scene.held.some((h) => h.waited > 0)) {
      el(
        'text',
        {
          x: dotX0 - 3,
          y: g.opY + 17,
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        },
        svg,
        t('label.idle', 'Idle steps'),
      );
    }

    // 윤곽 — 칸 높이마다 옅은 선과 수
    for (let c = 0; c <= n; c += 1) {
      el(
        'line',
        {
          x1: g.px0,
          y1: g.py(c),
          x2: g.px1,
          y2: g.py(c),
          stroke: colors.border,
          'stroke-width': c === 0 ? 1.5 : 1,
          ...(c === 0 ? {} : { 'stroke-dasharray': '2 4' }),
        },
        svg,
      );
      el(
        'text',
        {
          x: g.px0 - 10,
          y: g.py(c) + 4,
          'text-anchor': 'end',
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        },
        svg,
        String(c),
      );
    }

    // 늘어나는 단계 · 줄어드는 단계 괄호
    const peak = scene.lockPoint;
    const bracket = (k0: number, k1: number, label: string, color: string): void => {
      const y = g.base + 14;
      el(
        'path',
        { d: `M ${r2(g.px(k0))} ${y - 5} V ${y} H ${r2(g.px(k1))} V ${y - 5}`, fill: 'none', stroke: color, 'stroke-width': 1.5 },
        svg,
      );
      el(
        'text',
        {
          x: (g.px(k0) + g.px(k1)) / 2,
          y: y + 15,
          'text-anchor': 'middle',
          fill: color,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        },
        svg,
        label,
      );
    };
    if (now > 0) bracket(0, peak ?? now, t('label.growing', 'Growing'), colors.primary);
    if (peak !== null && now > peak) bracket(peak, now, t('label.shrinking', 'Shrinking'), colors.itemComparing);

    // 잠금 지점
    if (peak !== null) {
      const top = scene.counts[peak] ?? 0;
      el(
        'line',
        { x1: g.px(peak), y1: g.py(top), x2: g.px(peak), y2: g.base, stroke: colors.accent, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' },
        svg,
      );
      el(
        'text',
        {
          x: g.px(peak),
          y: g.py(top) - 12,
          'text-anchor': 'middle',
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
        },
        svg,
        t('label.lockPoint', 'Lock point'),
      );
    }

    // 윤곽 선분 — 오르면 파랑 계열, 내리면 주황 계열
    let segment: SVGElement | null = null;
    for (let k = 1; k <= now; k += 1) {
      const a = scene.counts[k - 1] ?? 0;
      const b = scene.counts[k] ?? 0;
      segment = el(
        'line',
        {
          x1: g.px(k - 1),
          y1: g.py(a),
          x2: g.px(k),
          y2: g.py(b),
          stroke: b >= a ? colors.primary : colors.itemComparing,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        },
        svg,
      );
    }
    for (let k = 0; k < now; k += 1) {
      el('circle', { cx: g.px(k), cy: g.py(scene.counts[k] ?? 0), r: 3.5, fill: colors.text }, svg);
    }

    // 더미 꼭대기와 윤곽의 지금 점을 잇는 수평선
    let guide: SVGElement | null = null;
    if (count > 0) {
      guide = el(
        'line',
        {
          x1: g.lx0 + g.chipW,
          y1: g.py(count),
          x2: g.px(now),
          y2: g.py(count),
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '1 4',
        },
        svg,
      );
    }
    const dot = el('circle', { cx: g.px(now), cy: g.py(count), r: 6, fill: colors.accent, stroke: colors.text, 'stroke-width': 1.5 }, svg);

    return { chips, segment: now > 0 ? segment : null, dot, guide, geo: g };
  }

  function tween(mine: number, frame: (p: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      const start = Date.now();
      let finished = false;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        waiters.delete(finish);
        resolve();
      };
      waiters.add(finish);
      const tick = (): void => {
        if (destroyed || mine !== gen) return finish();
        const p = Math.min(1, (Date.now() - start) / MOVE_MS);
        frame(ease(p));
        if (p >= 1) return finish();
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      };
      tick();
    });
  }

  async function move(scene: GrowThenShrinkScene, hd: Handles, mine: number): Promise<void> {
    const s = scene.step;
    if (s === null) return;
    const g = hd.geo;
    const now = scene.counts.length - 1;
    const was = scene.counts[now - 1] ?? 0;
    const count = scene.counts[now] ?? 0;
    const k0x = g.px(now - 1);
    const k1x = g.px(now);
    const sockIdx = scene.ops.findIndex((o) => o.row === s.row);
    const sockCx = g.sockX(sockIdx) + g.sockW / 2;
    const sockCy = g.sockY + g.sockH / 2;
    const chipCx = g.lx0 + g.chipW / 2;

    const profile = (p: number): void => {
      const x = k0x + (k1x - k0x) * p;
      const y = g.py(was + (count - was) * p);
      hd.segment?.setAttribute('x2', String(r2(x)));
      hd.segment?.setAttribute('y2', String(r2(y)));
      hd.dot?.setAttribute('cx', String(r2(x)));
      hd.dot?.setAttribute('cy', String(r2(y)));
      hd.guide?.setAttribute('x2', String(r2(x)));
      hd.guide?.setAttribute('y1', String(r2(y)));
      hd.guide?.setAttribute('y2', String(r2(y)));
    };

    if (s.kind === 'acquire') {
      // 새 잠금은 줄 자리에서 더미 꼭대기로 내려온다 — 아직 못 온 만큼 거슬러 둔다
      const chip = hd.chips.get(s.row);
      const slot = scene.held.length - 1;
      const dx = sockCx - chipCx;
      const dy = sockCy - (g.chipY(slot) + g.chipH / 2);
      await tween(mine, (p) => {
        chip?.setAttribute('transform', `translate(${r2(dx * (1 - p))} ${r2(dy * (1 - p))})`);
        profile(p);
      });
      return;
    }

    // 놓기 — 빠진 잠금은 줄 자리로 올라가고, 그 위의 것들은 한 칸 내려앉는다
    const ghost = el('g', {}, svg);
    const gy = g.chipY(s.slot);
    el(
      'rect',
      { x: g.lx0, y: gy, width: g.chipW, height: g.chipH, rx: 5, fill: colors.bgSubtle, stroke: modeColor(s.mode), 'stroke-width': 2 },
      ghost,
    );
    el(
      'text',
      {
        x: chipCx,
        y: gy + g.chipH / 2 + PX_SM * 0.36,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      },
      ghost,
      lockLabel(s.mode, scene.txn, s.row),
    );
    for (let k = 0; k < s.waited; k += 1) {
      el('circle', { cx: g.lx0 + g.chipW + 12 + k * DOT_GAP, cy: gy + g.chipH / 2, r: DOT_R, fill: colors.textMuted }, ghost);
    }
    const dx = sockCx - chipCx;
    const dy = sockCy - (gy + g.chipH / 2);
    const above = scene.held.slice(s.slot);
    await tween(mine, (p) => {
      ghost.setAttribute('transform', `translate(${r2(dx * p)} ${r2(dy * p)})`);
      ghost.setAttribute('opacity', String(r2(p < 0.7 ? 1 : (1 - p) / 0.3)));
      for (const h of above) hd.chips.get(h.row)?.setAttribute('transform', `translate(0 ${r2(-g.pitch * (1 - p))})`);
      profile(p);
    });
  }

  return {
    async render(next: GrowThenShrinkScene, _prev: GrowThenShrinkScene | null, opts: { animate: boolean }): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const hd = drawStatic(next);
      if (!opts.animate || next.step === null) return;
      await move(next, hd, mine);
      if (mine === gen && !destroyed) drawStatic(next);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    },
  };
}

export const growThenShrinkStageView: CanvasView = {
  canvas: { height: H },
  mount: mountGrowThenShrink,
};
