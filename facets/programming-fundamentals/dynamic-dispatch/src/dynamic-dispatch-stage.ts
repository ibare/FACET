/**
 * 동적 디스패치 — 한 부르는 줄에서 가지가 갈라져 나간다.
 *
 * 오른쪽에 클래스 몸들이 코드 차례대로 서고, 왼쪽에 부르는 쪽 프로그램이 선다. 부르는 줄의 끝이
 * 갈림점이다. 부를 때마다 그 점에서 가지 하나가 자라 나가 **그 순간 받은 객체의 클래스** 몸에 닿고,
 * 돌려준 값은 같은 가지를 거슬러 갈림점으로 돌아와 출력으로 떨어진다. 가지는 자취로 남아, 끝에는
 * 한 점에서 셋으로 갈라진 모양이 된다. 부모 클래스의 몸에는 가지가 한 번도 닿지 않는다.
 *
 * 정적 그리기가 정본이다. 운동은 그 위에서 아직 못 온 만큼만 그린다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
} from '@ffacet/core/runtime';
import type { DdBranch, DdClass, DynamicDispatchScene } from './scene.js';

const H = 400;
const MOTION_MS = 400;
const FRAME_MS = 16;
const MARGIN = 14;
const PAD_X = 8;
const PAD_Y = 5;
const GAP_MAX = 22;
const GAP_MIN = 6;
const CAPTION_BAND = 46;
const CURVE_SAMPLES = 28;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function clamp01(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** 갈림점에서 몸까지 — 가로로 나가 세로로 꺾여 가로로 들어가는 곡선. */
function curve(a: Pt, b: Pt): Pt[] {
  const dx = (b.x - a.x) * 0.55;
  const c1 = { x: a.x + dx, y: a.y };
  const c2 = { x: b.x - dx, y: b.y };
  const out: Pt[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    const s = i / CURVE_SAMPLES;
    const u = 1 - s;
    out.push({
      x: u * u * u * a.x + 3 * u * u * s * c1.x + 3 * u * s * s * c2.x + s * s * s * b.x,
      y: u * u * u * a.y + 3 * u * u * s * c1.y + 3 * u * s * s * c2.y + s * s * s * b.y,
    });
  }
  return out;
}

/** 곡선 위 비율 p 의 자리 (표본 사이는 곧게 잇는다). */
function along(pts: Pt[], p: number): Pt {
  const f = clamp01(p) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
}

function pathD(pts: Pt[], upto: number): string {
  const f = clamp01(upto) * (pts.length - 1);
  const whole = Math.floor(f);
  const parts = pts.slice(0, whole + 1).map((q, i) => `${i === 0 ? 'M' : 'L'}${r2(q.x)} ${r2(q.y)}`);
  if (whole < pts.length - 1 && f > whole) {
    const tip = along(pts, upto);
    parts.push(`L${r2(tip.x)} ${r2(tip.y)}`);
  }
  return parts.join(' ');
}

type Box = { cls: DdClass; y: number; h: number; color: string };

type Layout = {
  cw: number;
  lh: number;
  boxX: number;
  boxW: number;
  boxes: Box[];
  lineY: number[];
  lineX: number[];
  inClass: boolean[];
  chipY: number;
  chipH: number;
  chipW: number;
  chipX0: number;
  outY: number;
  capY: number;
};

function layoutOf(scene: DynamicDispatchScene): Layout {
  const W = PIECE_CANVAS_W;
  const fontPx = parseFloat(fontSizes.sm);
  const cw = fontPx * 0.6;
  const lh = Math.round(fontPx * 1.55 * 10) / 10;
  const n = scene.lines.length;
  const lineY: number[] = new Array<number>(n).fill(0);
  const lineX: number[] = new Array<number>(n).fill(0);
  const inClass: boolean[] = new Array<boolean>(n).fill(false);

  const palette = categorical(Math.max(1, scene.classes.length));
  let widest = 0;
  for (const c of scene.classes) {
    for (let i = c.from; i <= c.to && i < n; i += 1) {
      inClass[i] = true;
      widest = Math.max(widest, scene.lines[i].indent * 4 + scene.lines[i].text.length);
    }
  }
  const boxW = widest * cw + PAD_X * 2;
  const boxX = W - MARGIN - boxW;

  const bottom = H - CAPTION_BAND - 4;
  const heights = scene.classes.map((c) => (c.to - c.from + 1) * lh + PAD_Y * 2);
  const sum = heights.reduce((a, b) => a + b, 0);
  const gaps = Math.max(1, scene.classes.length - 1);
  const gap = Math.max(GAP_MIN, Math.min(GAP_MAX, (bottom - MARGIN - sum) / gaps));
  const boxes: Box[] = [];
  let y = MARGIN;
  scene.classes.forEach((c, k) => {
    boxes.push({ cls: c, y, h: heights[k], color: palette[k % palette.length] });
    for (let i = c.from; i <= c.to && i < n; i += 1) {
      lineY[i] = y + PAD_Y + (i - c.from) * lh + lh / 2;
      lineX[i] = boxX + PAD_X + scene.lines[i].indent * 4 * cw;
    }
    y += heights[k] + gap;
  });

  // 부르는 쪽 — 맨 첫 줄은 위에, 나머지는 자식 클래스 메서드 줄들의 한가운데에서 끝나게.
  const main = scene.lines.map((_, i) => i).filter((i) => !inClass[i]);
  const children = scene.classes.filter((c) => c.parent !== null);
  const targets = (children.length > 0 ? children : scene.classes).flatMap((c) => c.methods.map((m) => lineY[m.line]));
  const mid = targets.length > 0 ? targets.reduce((a, b) => a + b, 0) / targets.length : H / 2;
  const topY = MARGIN + lh / 2 + 2;
  main.forEach((i, k) => {
    lineX[i] = MARGIN + scene.lines[i].indent * 4 * cw;
    lineY[i] = k === 0 ? topY : mid - (main.length - 1 - k) * lh;
  });
  const blockTop = main.length > 1 ? lineY[main[1]] - lh / 2 : topY + lh * 3;
  const chipH = lh + 6;
  const chipY = (topY + lh / 2 + blockTop) / 2;
  const clsLen = Math.max(1, ...scene.objects.map((o) => o.cls.length));
  const chipW = clsLen * cw + 16;
  const chipX0 = MARGIN + (scene.listName ?? '').length * cw + 14;
  const outY = Math.min(mid + lh * 2.2, bottom - lh * 2);
  return { cw, lh, boxX, boxW, boxes, lineY, lineX, inClass, chipY, chipH, chipW, chipX0, outY, capY: H - CAPTION_BAND + 16 };
}

export const dynamicDispatchStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const codePx = fontSizes.sm;
    let gen = 0;
    let destroyed = false;
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

    function label(parent: Element, x: number, y: number, text: string, attrs: Record<string, string | number>): SVGTextElement {
      const node = el('text', { x, y, 'dominant-baseline': 'central', ...attrs }, parent);
      node.textContent = text;
      return node;
    }

    function colorOf(L: Layout, cls: string): string {
      return L.boxes.find((b) => b.cls.name === cls)?.color ?? colors.text;
    }

    function chipCenter(L: Layout, scene: DynamicDispatchScene, obj: number): Pt {
      const k = Math.max(0, scene.objects.findIndex((o) => o.obj === obj));
      return { x: L.chipX0 + k * (L.chipW + 8) + L.chipW / 2, y: L.chipY };
    }

    function junction(L: Layout, scene: DynamicDispatchScene, line: number): Pt {
      const ln = scene.lines[line];
      return { x: L.lineX[line] + ln.text.length * L.cw + 8, y: L.lineY[line] };
    }

    function branchPts(L: Layout, scene: DynamicDispatchScene, b: DdBranch): Pt[] {
      return curve(junction(L, scene, b.line), { x: L.boxX, y: L.lineY[b.body] });
    }

    function retChipAt(L: Layout, b: DdBranch): { c: Pt; w: number } {
      const text = b.value ?? '';
      const w = text.length * L.cw + 12;
      const line = b.ret ?? b.body;
      return { c: { x: L.boxX - 8 - w / 2, y: L.lineY[line] }, w };
    }

    function outChipAt(L: Layout, scene: DynamicDispatchScene, k: number): { c: Pt; w: number } {
      let x = MARGIN;
      for (let i = 0; i < k; i += 1) x += scene.outputs[i].length * L.cw + 12 + 8;
      const w = scene.outputs[k].length * L.cw + 12;
      return { c: { x: x + w / 2, y: L.outY + L.lh + 6 }, w };
    }

    type Handles = {
      L: Layout;
      chips: SVGGElement[];
      marker: SVGGElement | null;
      branchPath: SVGPathElement | null;
      tip: SVGCircleElement | null;
      retChip: SVGGElement | null;
      outChip: SVGGElement | null;
    };

    function chip(parent: Element, c: Pt, w: number, h: number, text: string, stroke: string): SVGGElement {
      const g = el('g', {}, parent);
      el('rect', { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h, rx: 4, fill: colors.bg, stroke, 'stroke-width': 1.5 }, g);
      label(g, c.x, c.y, text, {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': codePx,
        fill: colors.text,
      });
      return g;
    }

    function drawStatic(scene: DynamicDispatchScene): Handles {
      svg.textContent = '';
      const L = layoutOf(scene);
      const h: Handles = { L, chips: [], marker: null, branchPath: null, tip: null, retChip: null, outChip: null };
      if (scene.lines.length === 0) return h;
      const step = scene.step;
      const cur = step.kind === 'start' || step.kind === 'build' ? null : scene.branches[step.branch];

      // 이번 걸음이 밟는 줄
      const lit = new Set<number>();
      if (step.kind === 'build') lit.add(step.line);
      if (step.kind === 'call' && cur) {
        lit.add(cur.line);
        lit.add(cur.body);
      }
      if (step.kind === 'return' && cur && cur.ret !== null) lit.add(cur.ret);
      if (step.kind === 'show' && cur) lit.add(cur.line);

      const arrived = new Set(scene.branches.map((b) => b.owner));

      // 클래스 몸
      const boxLayer = el('g', {}, svg);
      for (const b of L.boxes) {
        el(
          'rect',
          {
            x: L.boxX,
            y: b.y,
            width: L.boxW,
            height: b.h,
            rx: 6,
            fill: colors.bgSubtle,
            stroke: arrived.has(b.cls.name) ? b.color : colors.border,
            'stroke-width': arrived.has(b.cls.name) ? 2 : 1,
          },
          boxLayer,
        );
      }
      // 줄 강조와 글자
      const textLayer = el('g', {}, svg);
      scene.lines.forEach((ln, i) => {
        const y = L.lineY[i];
        if (lit.has(i)) {
          const x0 = L.inClass[i] ? L.boxX + 3 : MARGIN - 5;
          const x1 = L.inClass[i] ? L.boxX + L.boxW - 3 : L.lineX[i] + ln.text.length * L.cw + 5;
          el('rect', { x: x0, y: y - L.lh / 2, width: x1 - x0, height: L.lh, rx: 3, fill: colors.accent, opacity: 0.35 }, textLayer);
        }
        label(textLayer, L.lineX[i], y, ln.text, {
          'font-family': fonts.mono,
          'font-size': codePx,
          fill: L.inClass[i] && ln.indent > 0 && !lit.has(i) ? colors.textMuted : colors.text,
        });
      });

      // 목록에 선 객체들
      if (scene.objects.length > 0) {
        if (scene.listName !== null) {
          label(textLayer, MARGIN, L.chipY, scene.listName, {
            'font-family': fonts.mono,
            'font-size': codePx,
            fill: colors.textMuted,
          });
        }
        for (const o of scene.objects) {
          h.chips.push(chip(svg, chipCenter(L, scene, o.obj), L.chipW, L.chipH, o.cls, colorOf(L, o.cls)));
        }
      }

      // item 이 가리키는 객체
      const last = scene.branches[scene.branches.length - 1];
      if (scene.item !== null && last !== undefined) {
        const c = chipCenter(L, scene, scene.item);
        const g = el('g', {}, svg);
        const top = L.chipY + L.chipH / 2 + 3;
        el('path', { d: `M${r2(c.x)} ${r2(top)} l-5 7 l10 0 z`, fill: colors.text }, g);
        label(g, c.x, top + 16, last.recv, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        h.marker = g;
      }

      // 가지 — 지난 것은 가늘게, 이번 것은 굵게
      const branchLayer = el('g', {}, svg);
      scene.branches.forEach((b) => {
        const now = cur === b;
        const path = el(
          'path',
          {
            d: pathD(branchPts(L, scene, b), 1),
            fill: 'none',
            stroke: colorOf(L, b.cls),
            'stroke-width': now ? 3 : 1.75,
            'stroke-linecap': 'round',
            opacity: now ? 1 : 0.7,
          },
          branchLayer,
        );
        if (now && step.kind === 'call') h.branchPath = path;
        const end = { x: L.boxX, y: L.lineY[b.body] };
        const dot = el('circle', { cx: end.x, cy: end.y, r: now ? 4 : 3, fill: colorOf(L, b.cls) }, branchLayer);
        if (now && step.kind === 'call') h.tip = dot;
      });
      if (scene.branches.length > 0) {
        const j = junction(L, scene, scene.branches[0].line);
        el('circle', { cx: j.x, cy: j.y, r: 4.5, fill: colors.text }, branchLayer);
      }

      // 몸이 돌려준 값 — 가지 끝에 머문다
      if (step.kind === 'return' && cur && cur.value !== null) {
        const at = retChipAt(L, cur);
        h.retChip = chip(svg, at.c, at.w, L.chipH, cur.value, colorOf(L, cur.cls));
      }

      // 출력
      if (scene.outputs.length > 0) {
        label(svg, MARGIN, L.outY, t('label.output', 'Output'), {
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        const back = scene.branches.filter((b) => b.back);
        scene.outputs.forEach((v, k) => {
          const at = outChipAt(L, scene, k);
          const g = chip(svg, at.c, at.w, L.chipH, v, back[k] ? colorOf(L, back[k].cls) : colors.border);
          if (step.kind === 'show' && step.out === k) h.outChip = g;
        });
      }

      // 캡션 — 지금 일어나는 일
      const cap = el('g', {}, svg);
      const capAttrs = { 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text };
      let first = '';
      if (step.kind === 'start') first = t('caption.start', 'The program is ready. Nothing has run yet.');
      if (step.kind === 'build') {
        first = t('caption.build', 'The list is built — objects in {name}: {n}', {
          name: scene.listName ?? '',
          n: scene.objects.length,
        });
      }
      if (step.kind === 'call' && cur) {
        first = t('caption.call', 'Class of {recv} now: {cls} → it runs the body of {owner}.{method}', {
          recv: cur.recv,
          cls: cur.cls,
          owner: cur.owner,
          method: cur.method,
        });
      }
      if (step.kind === 'return' && cur) {
        first = t('caption.return', 'Value the body returns: {value}', { value: cur.value ?? '' });
      }
      if (step.kind === 'show' && cur) {
        const value = scene.outputs[step.out] ?? '';
        first = step.same
          ? t('caption.show', 'Back at the same call line — shown: {value}', { value })
          : t('caption.showOther', 'Shown: {value}', { value });
      }
      label(cap, MARGIN, L.capY, first, capAttrs);
      if (scene.tally !== null) {
        label(
          cap,
          MARGIN,
          L.capY + L.lh + 2,
          t('caption.done', 'Call lines: {calls} · Bodies reached: {bodies} · Never reached: {never}', {
            calls: scene.tally.calls,
            bodies: scene.tally.bodies,
            never: scene.tally.never.length > 0 ? scene.tally.never.join(', ') : '—',
          }),
          { ...capAttrs, 'font-size': fontSizes.sm, fill: colors.textMuted },
        );
      }
      return h;
    }

    function clock(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const frames = Math.max(1, Math.round(ms / FRAME_MS));
        let i = 0;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const schedule = (): void => {
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          i += 1;
          frame(Math.min(1, i / frames));
          if (i >= frames) finish();
          else schedule();
        };
        frame(0);
        schedule();
      });
    }

    function shift(node: Element, from: Pt, to: Pt, e: number): void {
      const dx = (from.x - to.x) * (1 - e);
      const dy = (from.y - to.y) * (1 - e);
      node.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
    }

    async function motion(scene: DynamicDispatchScene, h: Handles, mine: number): Promise<void> {
      const L = h.L;
      const step = scene.step;
      if (step.kind === 'build') {
        // 객체가 `new …()` 자리에서 떨어져 나와 목록 칸에 선다
        const line = step.line;
        const origins = scene.objects.map((o) => ({
          x: L.lineX[line] + ((o.from + o.to) / 2) * L.cw,
          y: L.lineY[line],
        }));
        const ends = scene.objects.map((o) => chipCenter(L, scene, o.obj));
        await clock(MOTION_MS, mine, (p) => {
          h.chips.forEach((g, k) => {
            const e = ease(clamp01(p * 1.25 - k * 0.12));
            shift(g, origins[k], ends[k], e);
          });
        });
        return;
      }
      if (step.kind === 'call') {
        // item 이 다음 객체로 옮겨 가고, 갈림점에서 가지가 그 객체의 클래스 몸까지 자란다
        const b = scene.branches[step.branch];
        const pts = branchPts(L, scene, b);
        const to = chipCenter(L, scene, b.obj);
        const from = step.from === null ? { x: to.x, y: to.y + L.lh } : chipCenter(L, scene, step.from);
        await clock(MOTION_MS, mine, (p) => {
          if (h.marker) shift(h.marker, from, to, ease(clamp01(p / 0.35)));
          const g = ease(clamp01((p - 0.25) / 0.75));
          if (h.branchPath) h.branchPath.setAttribute('d', pathD(pts, g));
          if (h.tip) {
            const q = along(pts, g);
            h.tip.setAttribute('cx', String(r2(q.x)));
            h.tip.setAttribute('cy', String(r2(q.y)));
          }
        });
        return;
      }
      if (step.kind === 'return') {
        // 값이 돌려줌 줄의 글자에서 몸 밖 가지 끝으로 나온다
        const b = scene.branches[step.branch];
        if (!h.retChip || b.ret === null || b.value === null) return;
        const ln = scene.lines[b.ret];
        const col = ln.text.length - b.value.length / 2;
        const from = { x: L.lineX[b.ret] + col * L.cw, y: L.lineY[b.ret] };
        const at = retChipAt(L, b).c;
        const g = h.retChip;
        await clock(MOTION_MS, mine, (p) => shift(g, from, at, ease(p)));
        return;
      }
      if (step.kind === 'show') {
        // 값이 같은 가지를 거슬러 갈림점으로 돌아오고, 거기서 출력으로 떨어진 다음 자리를 잡는다
        const b = scene.branches[step.branch];
        if (!h.outChip) return;
        const pts = branchPts(L, scene, b).slice().reverse();
        const start = retChipAt(L, b).c;
        const j = pts[pts.length - 1];
        const end = outChipAt(L, scene, step.out).c;
        const g = h.outChip;
        await clock(MOTION_MS, mine, (p) => {
          const e = ease(p);
          let q: Pt;
          if (e < 0.12) {
            const k = e / 0.12;
            q = { x: start.x + (pts[0].x - start.x) * k, y: start.y + (pts[0].y - start.y) * k };
          } else if (e < 0.7) {
            q = along(pts, (e - 0.12) / 0.58);
          } else {
            const k = (e - 0.7) / 0.3;
            q = { x: j.x + (end.x - j.x) * k, y: j.y + (end.y - j.y) * k };
          }
          g.setAttribute('transform', `translate(${r2(q.x - end.x)} ${r2(q.y - end.y)})`);
        });
      }
    }

    async function render(
      next: DynamicDispatchScene,
      prev: DynamicDispatchScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || prev === null || prev.step === next.step) return;
      await motion(next, h, mine);
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
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
