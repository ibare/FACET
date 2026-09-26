/**
 * trip-after-failures 의 무대.
 *
 * 가로축은 부름의 차례다 (시계가 아니다). 칸마다 부름 하나가 세 층 — 부르는 쪽 · 브레이커 ·
 * 서비스 — 을 세로로 잇는 선을 타고 내려간다. 브레이커는 그 선 위의 스위치 날이다.
 * 닫힘이면 날이 선과 이어져 부름이 서비스까지 내려가고, 열리면 아직 오지 않은 칸의 날이
 * 일제히 젖혀져 그 뒤의 부름은 날에서 튕겨 돌아온다. 잇단 실패는 칸마다 브레이커 옆에
 * 쌓였다 사라지는 조각으로 남고, 기다림은 맨 아래 막대가 된다.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { TripScene, CallTrace } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

const GUTTER_X = 14;
const COL_X0 = 156;
const COL_RIGHT = 10;
const Y_NUM = 20;
const Y_CALLER = 46;
const Y_BREAKER = 120;
const LEVER = 30;
const OPEN_DEG = 42;
const Y_SERVICE = 204;
const Y_WAIT_BASE = 292;
const WAIT_H_MAX = 44;
const Y_CAPTION = 326;
const PIP = 7;
const PIP_GAP = 2;
const METER_CELL = 14;
const METER_GAP = 3;
const PILL_W = 70;
const MOTION_MS = 400;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return Object.is(out, -0) ? 0 : out;
}

function label(parent: Element, x: number, y: number, str: string, attrs: Attrs): SVGTextElement {
  const node = el(parent, 'text', { x: r1(x), y: r1(y), ...attrs });
  node.textContent = str;
  return node;
}

/** 운동에서 만질 손잡이 — 정적 그리기가 이번 걸음의 요소를 넘겨준다. */
type Handles = {
  cx: number;
  dot: SVGCircleElement;
  resultMark: SVGGElement | null;
  pip: SVGRectElement | null;
  blockMark: SVGGElement | null;
  waitBar: SVGRectElement;
  waitBarH: number;
  pendingLevers: { line: SVGLineElement; cx: number }[];
  meterFill: SVGRectElement | null;
  anim: SVGGElement;
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function seg(p: number, a: number, b: number): number {
  return clamp01((p - a) / (b - a));
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const tripAfterFailuresStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function colX(scene: TripScene, call: number): number {
      const colW = (W - COL_RIGHT - COL_X0) / scene.callCount;
      return COL_X0 + (call - 0.5) * colW;
    }

    function colW(scene: TripScene): number {
      return (W - COL_RIGHT - COL_X0) / scene.callCount;
    }

    /** 부름 한 칸의 선과 날. 날은 (cx, Y_BREAKER) 를 축으로 돈다. */
    function drawWire(
      g: Element,
      cx: number,
      open: boolean,
      tone: 'done' | 'pending' | 'cut',
    ): SVGLineElement {
      const stroke = tone === 'pending' ? c.border : c.textMuted;
      const dash = tone === 'pending' ? '3 3' : 'none';
      el(g, 'line', {
        x1: r1(cx), y1: Y_CALLER, x2: r1(cx), y2: Y_BREAKER,
        stroke, 'stroke-width': 1.5, 'stroke-dasharray': dash,
      });
      el(g, 'line', {
        x1: r1(cx), y1: Y_BREAKER + LEVER, x2: r1(cx), y2: Y_SERVICE,
        stroke: tone === 'cut' ? c.border : stroke, 'stroke-width': 1.5,
        'stroke-dasharray': tone === 'cut' ? '3 3' : dash,
      });
      const lever = el(g, 'line', {
        x1: r1(cx), y1: Y_BREAKER, x2: r1(cx), y2: Y_BREAKER + LEVER,
        stroke: open ? c.danger : tone === 'pending' ? c.border : c.text,
        'stroke-width': 3, 'stroke-linecap': 'round',
      });
      if (open) lever.setAttribute('transform', `rotate(${OPEN_DEG} ${r1(cx)} ${Y_BREAKER})`);
      el(g, 'circle', {
        cx: r1(cx), cy: Y_BREAKER, r: 3,
        fill: c.bg, stroke: open ? c.danger : stroke, 'stroke-width': 1.5,
      });
      el(g, 'circle', {
        cx: r1(cx), cy: Y_BREAKER + LEVER, r: 2,
        fill: tone === 'cut' ? c.border : stroke,
      });
      return lever;
    }

    function drawResult(g: Element, cx: number, tr: CallTrace): SVGGElement {
      const mark = el(g, 'g', {});
      if (tr.outcome === 'ok') {
        el(mark, 'circle', { cx: r1(cx), cy: Y_SERVICE, r: 7, fill: c.bg, stroke: c.text, 'stroke-width': 2 });
        label(mark, cx, Y_SERVICE + 22, t('label.ok', 'OK'), {
          'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.text,
        });
      } else if (tr.outcome === 'fail') {
        const d = 6;
        el(mark, 'line', { x1: r1(cx - d), y1: Y_SERVICE - d, x2: r1(cx + d), y2: Y_SERVICE + d, stroke: c.danger, 'stroke-width': 2.5, 'stroke-linecap': 'round' });
        el(mark, 'line', { x1: r1(cx - d), y1: Y_SERVICE + d, x2: r1(cx + d), y2: Y_SERVICE - d, stroke: c.danger, 'stroke-width': 2.5, 'stroke-linecap': 'round' });
        label(mark, cx, Y_SERVICE + 22, t('label.fail', 'Fail'), {
          'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.danger,
        });
      } else {
        throw new Error(`trip-after-failures-stage: 막힌 부름 ${tr.call} 에 서비스의 답을 그리려 했다`);
      }
      return mark;
    }

    function drawStatic(scene: TripScene): Handles | null {
      svg.textContent = '';
      const root = el(svg, 'g', {});
      const cw = colW(scene);
      const current = scene.step && scene.step.kind !== 'start' ? scene.step.call : null;
      const counters = scene.counters;

      // 이번 부름의 칸 — 머무는 강조
      if (current !== null) {
        el(root, 'rect', {
          x: r1(colX(scene, current) - cw / 2 + 2), y: 6,
          width: r1(cw - 4), height: Y_WAIT_BASE + 6 - 6,
          rx: 4, fill: c.bgSubtle,
        });
      }

      // 층 이름 (왼쪽)
      const bodyFont = { 'font-family': fonts.body };
      label(root, GUTTER_X, Y_CALLER + 4, t('label.caller', 'Caller'), {
        ...bodyFont, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text,
      });
      label(root, GUTTER_X, Y_BREAKER - 14, t('label.breaker', 'Breaker'), {
        ...bodyFont, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text,
      });
      label(root, GUTTER_X, Y_SERVICE + 4, t('label.service', 'Service'), {
        ...bodyFont, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text,
      });
      label(root, GUTTER_X, Y_WAIT_BASE - 30, t('label.wait', 'Wait (ms)'), {
        ...bodyFont, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text,
      });

      // 층 선
      for (const y of [Y_CALLER, Y_BREAKER, Y_SERVICE]) {
        el(root, 'line', { x1: COL_X0 - 6, y1: y, x2: W - COL_RIGHT, y2: y, stroke: c.border, 'stroke-width': 1 });
      }
      el(root, 'line', { x1: COL_X0 - 6, y1: Y_WAIT_BASE, x2: W - COL_RIGHT, y2: Y_WAIT_BASE, stroke: c.border, 'stroke-width': 1 });

      // 부름 번호
      for (let call = 1; call <= scene.callCount; call += 1) {
        label(root, colX(scene, call), Y_NUM, String(call), {
          'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm,
          'font-weight': call === current ? 700 : 400,
          fill: call === current ? c.text : c.textMuted,
        });
      }

      if (counters === null) return null;
      const open = counters.state === 'open';

      // 게이지 — 상태 · 잇단 실패 · 막힘 · 닿은 부름 · 기다림 합
      const pillY = Y_BREAKER - 6;
      el(root, 'rect', {
        x: GUTTER_X, y: pillY, width: PILL_W, height: 18, rx: 9,
        fill: open ? c.danger : c.bg, stroke: open ? c.danger : c.text, 'stroke-width': 1.5,
      });
      label(
        root, GUTTER_X + PILL_W / 2, pillY + 13,
        open ? t('label.open', 'Open') : t('label.closed', 'Closed'),
        { 'text-anchor': 'middle', ...bodyFont, 'font-size': fontSizes.xs, 'font-weight': 700, fill: open ? c.textInverse : c.text },
      );
      label(root, GUTTER_X, Y_BREAKER + 30, t('label.streak', 'Failures in a row'), {
        ...bodyFont, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      const meterY = Y_BREAKER + 36;
      let meterFill: SVGRectElement | null = null;
      for (let k = 0; k < scene.threshold; k += 1) {
        const x = GUTTER_X + k * (METER_CELL + METER_GAP);
        el(root, 'rect', { x, y: meterY, width: METER_CELL, height: 10, rx: 2, fill: c.bg, stroke: c.danger, 'stroke-width': 1 });
        if (k < counters.streak) {
          const f = el(root, 'rect', { x, y: meterY, width: METER_CELL, height: 10, rx: 2, fill: c.danger });
          if (k === counters.streak - 1) meterFill = f;
        }
      }
      label(
        root, GUTTER_X + scene.threshold * (METER_CELL + METER_GAP) + 4, meterY + 9,
        `${counters.streak}/${scene.threshold}`,
        { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text },
      );
      label(root, GUTTER_X, Y_BREAKER + 64, t('label.blockedCount', 'Blocked: {n}', { n: counters.blocked }), {
        ...bodyFont, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      label(root, GUTTER_X, Y_SERVICE + 20, t('label.reached', 'Calls reached: {n}', { n: counters.reached }), {
        ...bodyFont, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      label(root, GUTTER_X, Y_WAIT_BASE - 14, t('label.totalWait', 'Total: {ms} ms', { ms: counters.totalWait }), {
        ...bodyFont, 'font-size': fontSizes.xs, fill: c.textMuted,
      });

      // 칸마다 — 선 · 날 · 부르는 쪽의 점 · 답 · 잇단 실패 조각 · 기다림 막대
      const wires = el(root, 'g', {});
      const marks = el(root, 'g', {});
      const pendingLevers: { line: SVGLineElement; cx: number }[] = [];
      let resultMark: SVGGElement | null = null;
      let pip: SVGRectElement | null = null;
      let blockMark: SVGGElement | null = null;
      let waitBar: SVGRectElement | null = null;
      let waitBarH = 0;

      for (let call = 1; call <= scene.callCount; call += 1) {
        const cx = colX(scene, call);
        const tr = scene.trace[call - 1];
        if (tr === undefined) {
          pendingLevers.push({ line: drawWire(wires, cx, open, 'pending'), cx });
          el(marks, 'circle', { cx: r1(cx), cy: Y_CALLER, r: 5, fill: c.bg, stroke: c.textMuted, 'stroke-width': 1.5 });
          continue;
        }
        if (tr.call !== call) throw new Error(`trip-after-failures-stage: 자취 ${call - 1} 의 부름이 ${tr.call}`);
        el(marks, 'circle', { cx: r1(cx), cy: Y_CALLER, r: 4, fill: c.textMuted });
        if (tr.outcome === 'blocked') {
          drawWire(wires, cx, true, 'cut');
          const bm = el(marks, 'g', {});
          el(bm, 'line', {
            x1: r1(cx - 8), y1: Y_BREAKER - 8, x2: r1(cx + 8), y2: Y_BREAKER - 8,
            stroke: c.danger, 'stroke-width': 3, 'stroke-linecap': 'round',
          });
          label(bm, cx, Y_BREAKER - 16, t('label.blocked', 'Blocked'), {
            'text-anchor': 'middle', ...bodyFont, 'font-size': fontSizes.xs, fill: c.danger,
          });
          if (call === current) blockMark = bm;
        } else {
          drawWire(wires, cx, false, 'done');
          const rm = drawResult(marks, cx, tr);
          if (call === current) resultMark = rm;
          for (let k = 0; k < tr.streak; k += 1) {
            const p = el(marks, 'rect', {
              x: r1(cx + 6), y: r1(Y_BREAKER + LEVER - PIP - k * (PIP + PIP_GAP)),
              width: PIP, height: PIP, rx: 1, fill: c.danger,
            });
            if (call === current && k === tr.streak - 1) pip = p;
          }
        }
        const h = counters.waitMax > 0 ? (tr.waitMs / counters.waitMax) * WAIT_H_MAX : 0;
        const bar = el(marks, 'rect', {
          x: r1(cx - 8), y: r1(Y_WAIT_BASE - h), width: 16, height: r1(h), fill: c.textMuted,
        });
        label(marks, cx, Y_WAIT_BASE - h - 4, String(tr.waitMs), {
          'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text,
        });
        if (call === current) { waitBar = bar; waitBarH = h; }
      }

      // 캡션 — 지금 일어나는 일만
      const step = scene.step;
      let caption = '';
      if (step === null || step.kind === 'start') {
        caption = t('caption.start', 'Breaker closed. Calls in line: {n}', { n: scene.callCount });
      } else if (step.kind === 'blocked') {
        const tr = scene.trace[step.call - 1];
        if (tr === undefined) throw new Error(`trip-after-failures-stage: 부름 ${step.call} 의 자취가 없다`);
        caption = t('caption.blocked', 'Call {call}: stopped at the breaker. Wait: {ms} ms', { call: step.call, ms: tr.waitMs });
      } else if (step.tripped) {
        caption = t('caption.trip', 'Call {call}: failure. Failures in a row: {streak}/{threshold}. Breaker opens', { call: step.call, streak: step.streak, threshold: scene.threshold });
      } else if (step.answer === 'fail') {
        caption = t('caption.fail', 'Call {call}: failure from the service. Failures in a row: {streak}/{threshold}', { call: step.call, streak: step.streak, threshold: scene.threshold });
      } else {
        caption = t('caption.ok', 'Call {call}: success from the service. Failures in a row: {streak}', { call: step.call, streak: step.streak });
      }
      label(root, GUTTER_X, Y_CAPTION, caption, {
        ...bodyFont, 'font-size': fontSizes.md, fill: c.text,
      });

      if (current === null) return null;
      if (waitBar === null) throw new Error(`trip-after-failures-stage: 부름 ${current} 의 기다림 막대가 없다`);
      const anim = el(root, 'g', {});
      const dot = el(anim, 'circle', { cx: r1(colX(scene, current)), cy: Y_CALLER, r: 5, fill: c.accent, stroke: c.text, 'stroke-width': 1 });
      dot.setAttribute('visibility', 'hidden');
      return {
        cx: colX(scene, current), dot, resultMark, pip, blockMark,
        waitBar, waitBarH, pendingLevers, meterFill, anim,
      };
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) { finish(); return; }
          const p = clamp01((Date.now() - start) / ms);
          frame(p);
          if (p >= 1) { finish(); return; }
          const id = setTimeout(() => { timers.delete(id); tick(); }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function move(mine: number, prev: TripScene | null, next: TripScene, h: Handles): Promise<void> {
      const step = next.step;
      if (step === null || step.kind === 'start') return;
      const hBar = h.waitBarH;
      const setBar = (q: number): void => {
        const hh = hBar * q;
        h.waitBar.setAttribute('y', String(r1(Y_WAIT_BASE - hh)));
        h.waitBar.setAttribute('height', String(r1(hh)));
      };
      h.dot.removeAttribute('visibility');

      if (step.kind === 'blocked') {
        if (h.blockMark === null) throw new Error('trip-after-failures-stage: 막힘 표식을 못 찾았다');
        const bm = h.blockMark;
        bm.setAttribute('opacity', '0');
        const stopY = Y_BREAKER - 10;
        await tween(mine, MOTION_MS, (p) => {
          const down = ease(seg(p, 0, 0.5));
          const up = ease(seg(p, 0.5, 1));
          const y = p < 0.5 ? Y_CALLER + (stopY - Y_CALLER) * down : stopY - (stopY - Y_CALLER) * up;
          h.dot.setAttribute('cy', String(r1(y)));
          if (p >= 0.5) bm.removeAttribute('opacity');
        });
        return;
      }

      if (h.resultMark === null) throw new Error('trip-after-failures-stage: 서비스의 답 표식을 못 찾았다');
      const rm = h.resultMark;
      rm.setAttribute('opacity', '0');
      if (step.answer === 'fail' && h.pip === null) throw new Error('trip-after-failures-stage: 새 잇단 실패 조각을 못 찾았다');
      if (step.answer === 'fail' && h.meterFill === null) throw new Error('trip-after-failures-stage: 게이지 칸을 못 찾았다');
      const pip = h.pip;
      const meterFill = h.meterFill;
      if (pip !== null) pip.setAttribute('opacity', '0');
      if (meterFill !== null) meterFill.setAttribute('width', '0');
      // 성공이 수를 되돌리면 — 앞 칸의 게이지 칸이 비워진다
      const drains: SVGRectElement[] = [];
      if (step.answer === 'ok') {
        for (let k = 0; k < step.streakFrom; k += 1) {
          drains.push(el(h.anim, 'rect', {
            x: GUTTER_X + k * (METER_CELL + METER_GAP), y: Y_BREAKER + 36,
            width: METER_CELL, height: 10, rx: 2, fill: c.danger,
          }));
        }
      }
      // 이번 부름으로 열리면 — 아직 오지 않은 칸의 날이 닫힌 자리에서 젖혀진다
      const tripping = step.tripped && prev !== null && prev.counters !== null && prev.counters.state === 'closed';
      if (tripping) {
        for (const lv of h.pendingLevers) lv.line.setAttribute('transform', `rotate(0 ${r1(lv.cx)} ${Y_BREAKER})`);
      }
      await tween(mine, MOTION_MS, (p) => {
        const down = ease(seg(p, 0, 0.45));
        const up = ease(seg(p, 0.45, 0.9));
        const y = p < 0.45 ? Y_CALLER + (Y_SERVICE - Y_CALLER) * down : Y_SERVICE - (Y_SERVICE - Y_CALLER) * up;
        h.dot.setAttribute('cy', String(r1(y)));
        setBar(seg(p, 0, 1));
        if (p >= 0.45) rm.removeAttribute('opacity');
        const q = ease(seg(p, 0.45, 0.75));
        if (pip !== null) {
          pip.setAttribute('opacity', String(r1(q)));
          pip.setAttribute('transform', `translate(0 ${r1(-12 * (1 - q))})`);
        }
        if (meterFill !== null) meterFill.setAttribute('width', String(r1(METER_CELL * q)));
        for (const d of drains) d.setAttribute('width', String(r1(METER_CELL * (1 - q))));
        if (tripping) {
          const a = OPEN_DEG * ease(seg(p, 0.6, 1));
          for (const lv of h.pendingLevers) {
            lv.line.setAttribute('transform', `rotate(${r1(a)} ${r1(lv.cx)} ${Y_BREAKER})`);
          }
        }
      });
    }

    return {
      async render(next: TripScene, prev: TripScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || h === null) return;
        await move(mine, prev, next, h);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
