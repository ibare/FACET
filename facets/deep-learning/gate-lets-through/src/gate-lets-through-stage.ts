/**
 * gate-lets-through 의 무대.
 *
 * 흐름은 막대의 높이다. 문은 흐름 앞에 선 벽이고, 벽 아래쪽에 문의 값만큼 난 틈으로
 * 막대가 지나간다. 틈보다 높은 몫은 벽에 걸려 남고, 틈 높이만큼만 건너편에 선다 —
 * 문의 값이 흐름에 곱해지는 것을 자르는 운동으로 보인다.
 *
 * 위 길은 셀(c), 아래 길은 후보와 내보내기. 떠난 자리에는 점선 테두리가 남는다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import { computeGateStep } from './algorithm.js';
import type { GateLetsThroughScene, GateStepKind } from './scene.js';

const H = 390;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로 자리 */
const CAPTION_Y = 26;
const TOP_NAME_Y = 58;
const TOP_GATE_Y = 76;
const TOP_BASE = 200;
const TOP_ROOM = 108;
const BOT_NAME_Y = 256;
const BOT_GATE_Y = 274;
const BOT_BASE = 346;
const BOT_ROOM = 54;
const LABEL_GAP = 16;

/** 크기 상한 */
const K_MAX = 54;
const BAR_W_MAX = 34;
const WALL_W = 8;
const WALL_OVER = 8;

/** 운동 길이 (ms) */
const MOVE_MS: Record<GateStepKind, number> = {
  forget: 700,
  candidate: 450,
  admit: 700,
  combine: 650,
  output: 1000,
};

type Place = { cx: number; base: number; h: number };

type Handles = {
  kept: SVGRectElement | null;
  blockedF: SVGRectElement | null;
  candidate: SVGRectElement | null;
  admitted: SVGRectElement | null;
  blockedI: SVGRectElement | null;
  cKept: SVGRectElement | null;
  cAdmitted: SVGRectElement | null;
  blockedO: SVGRectElement | null;
  hBar: SVGRectElement | null;
};

function fx(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function r1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

export const gateLetsThroughStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    /** 가로 자리 — 폭에서 역산한다 */
    const col = {
      cPrev: W * 0.08,
      gateF: W * 0.24,
      kept: W * 0.37,
      adm: W * 0.5,
      c: W * 0.63,
      tanh: W * 0.73,
      gateO: W * 0.84,
      h: W * 0.945,
      cand: W * 0.24,
      gateI: W * 0.37,
    };
    const BW = Math.min(BAR_W_MAX, W * 0.05);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      name: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; weight?: string; anchor?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el('text', {
        x: r1(x),
        y: r1(y),
        'text-anchor': opts.anchor ?? 'middle',
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'font-weight': opts.weight ?? 'normal',
        fill: opts.fill ?? colors.text,
      });
      node.textContent = text;
      return node;
    }

    function placeRect(node: SVGRectElement, p: Place): void {
      node.setAttribute('x', String(r1(p.cx - BW / 2)));
      node.setAttribute('y', String(r1(p.base - p.h)));
      node.setAttribute('width', String(r1(BW)));
      node.setAttribute('height', String(r1(Math.max(0, p.h))));
    }

    function bar(p: Place, fill: string): SVGRectElement {
      const node = el('rect', { fill, stroke: colors.text, 'stroke-width': 1 });
      placeRect(node, p);
      return node;
    }

    function ghost(p: Place): void {
      const node = el('rect', {
        fill: 'none',
        stroke: colors.ghostOutline,
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      });
      placeRect(node, p);
    }

    function blocked(p: Place): SVGRectElement {
      const node = el('rect', {
        fill: colors.textMuted,
        'fill-opacity': 0.3,
        stroke: colors.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '2 2',
      });
      placeRect(node, p);
      return node;
    }

    function under(cx: number, base: number, symbol: string, value: string): void {
      label(cx, base + LABEL_GAP, symbol, { fill: colors.textMuted, mono: true });
      label(cx, base + LABEL_GAP * 2, value, { weight: 'bold', mono: true });
    }

    /** 벽. open 이 null 이면 닫혀 있다. 열리면 바닥에서 open 높이만큼 틈이 난다. */
    function wall(gx: number, base: number, height: number, open: number | null, active: boolean): void {
      const top = base - height;
      const solidBottom = open === null ? base : base - open;
      el('rect', {
        x: r1(gx - WALL_W / 2),
        y: r1(top),
        width: WALL_W,
        height: r1(Math.max(0, solidBottom - top)),
        fill: colors.text,
      });
      if (open !== null && open > 0) {
        el('rect', {
          x: r1(gx - WALL_W / 2),
          y: r1(base - open),
          width: WALL_W,
          height: r1(open),
          fill: 'none',
          stroke: active ? colors.itemActive : colors.accent,
          'stroke-width': 1.5,
        });
      }
    }

    function gateHead(
      gx: number,
      nameY: number,
      valueY: number,
      name: string,
      symbol: string,
      value: number | null,
      active: boolean,
    ): void {
      label(gx, nameY, name, { size: fontSizes.xs, fill: colors.textMuted });
      label(gx, valueY, value === null ? symbol : `${symbol} = ${fx(value)}`, {
        mono: true,
        weight: active ? 'bold' : 'normal',
        fill: active ? colors.itemActive : colors.text,
      });
    }

    function caption(scene: GateLetsThroughScene): void {
      const b = scene.base;
      let text: string;
      switch (scene.step) {
        case null:
          text = t('caption.start', 'In: x {x} · h_prev {h} · c_prev {c}', {
            x: String(b.x),
            h: fx(b.hPrev),
            c: fx(b.cPrev),
          });
          break;
        case 'forget': {
          const s = scene.forget;
          if (!s) throw new Error('gate-lets-through-stage: forget 걸음에 자취가 없다');
          text = t('caption.forget', 'Forget gate f {f} — kept {kept} · let go {dropped}', {
            f: fx(s.f),
            kept: fx(s.kept),
            dropped: fx(s.dropped),
          });
          break;
        }
        case 'candidate': {
          const s = scene.candidate;
          if (!s) throw new Error('gate-lets-through-stage: candidate 걸음에 자취가 없다');
          text = t('caption.candidate', 'Candidate g = tanh({a}) = {g}', { a: fx(s.pre), g: fx(s.g) });
          break;
        }
        case 'admit': {
          const s = scene.admit;
          if (!s) throw new Error('gate-lets-through-stage: admit 걸음에 자취가 없다');
          text = t('caption.admit', 'Input gate i {i} — let in {inp}', { i: fx(s.i), inp: fx(s.admitted) });
          break;
        }
        case 'combine': {
          const s = scene.combine;
          if (!s) throw new Error('gate-lets-through-stage: combine 걸음에 자취가 없다');
          text = t('caption.combine', 'New cell c = {kept} + {inp} = {c}', {
            kept: fx(s.kept),
            inp: fx(s.admitted),
            c: fx(s.c),
          });
          break;
        }
        case 'output': {
          const s = scene.output;
          if (!s) throw new Error('gate-lets-through-stage: output 걸음에 자취가 없다');
          text = t('caption.output', 'Output gate o {o} — h = {o} × {tc} = {h}', {
            o: fx(s.o),
            tc: fx(s.tc),
            h: fx(s.h),
          });
          break;
        }
      }
      label(W / 2, CAPTION_Y, text, { size: fontSizes.md, weight: 'bold' });
    }

    /** 흐름의 높이 한 단위. 이번 걸음에 선 막대 가운데 가장 큰 것이 위 길에 들게 한다. */
    function unitOf(scene: GateLetsThroughScene): number {
      const c = computeGateStep(scene.base).c;
      return Math.min(K_MAX, TOP_ROOM / Math.max(scene.base.cPrev, c, 1), BOT_ROOM);
    }

    function drawStatic(scene: GateLetsThroughScene): Handles {
      svg.textContent = '';
      const hd: Handles = {
        kept: null,
        blockedF: null,
        candidate: null,
        admitted: null,
        blockedI: null,
        cKept: null,
        cAdmitted: null,
        blockedO: null,
        hBar: null,
      };
      const K = unitOf(scene);
      const b = scene.base;
      const step = scene.step;
      const cellFill = colors.accent;
      const inFill = colors.itemComparing;

      caption(scene);

      // 길과 이음
      const pipe = { stroke: colors.border, 'stroke-width': 2 };
      el('line', { x1: 12, y1: TOP_BASE, x2: W - 12, y2: TOP_BASE, ...pipe });
      el('line', { x1: r1(col.cand - BW), y1: BOT_BASE, x2: W - 12, y2: BOT_BASE, ...pipe });
      const link = { stroke: colors.border, 'stroke-width': 1.5, 'stroke-dasharray': '4 4' };
      el('line', { x1: r1(col.adm), y1: BOT_BASE, x2: r1(col.c), y2: TOP_BASE, ...link });
      el('line', { x1: r1(col.c), y1: TOP_BASE, x2: r1(col.tanh), y2: BOT_BASE, ...link });

      // 이번 걸음의 입력
      label(12, BOT_BASE - 34, `x ${String(b.x)}`, { anchor: 'start', mono: true });
      label(12, BOT_BASE - 14, `h_prev ${fx(b.hPrev)}`, { anchor: 'start', mono: true });

      // 문 셋
      const f = scene.forget;
      const cand = scene.candidate;
      const ad = scene.admit;
      const cm = scene.combine;
      const out = scene.output;
      const topWallH = K * b.cPrev + WALL_OVER;
      const botWallH = K + WALL_OVER;
      wall(col.gateF, TOP_BASE, topWallH, f ? K * f.kept : null, step === 'forget');
      gateHead(col.gateF, TOP_NAME_Y, TOP_GATE_Y, t('label.forget', 'Forget gate'), 'f', f ? f.f : null, step === 'forget');
      if (f) label(col.gateF, TOP_BASE + LABEL_GAP, `σ(${fx(f.pre)})`, { fill: colors.textMuted, mono: true });

      wall(col.gateI, BOT_BASE, botWallH, ad ? K * ad.admitted : null, step === 'admit');
      gateHead(col.gateI, BOT_NAME_Y, BOT_GATE_Y, t('label.input', 'Input gate'), 'i', ad ? ad.i : null, step === 'admit');
      if (ad) label(col.gateI, BOT_BASE + LABEL_GAP, `σ(${fx(ad.pre)})`, { fill: colors.textMuted, mono: true });

      wall(col.gateO, BOT_BASE, botWallH, out ? K * out.h : null, step === 'output');
      gateHead(col.gateO, BOT_NAME_Y, BOT_GATE_Y, t('label.output', 'Output gate'), 'o', out ? out.o : null, step === 'output');
      if (out) label(col.gateO, BOT_BASE + LABEL_GAP, `σ(${fx(out.pre)})`, { fill: colors.textMuted, mono: true });

      // 지난 셀
      const cPrevPlace: Place = { cx: col.cPrev, base: TOP_BASE, h: K * b.cPrev };
      if (f) ghost(cPrevPlace);
      else bar(cPrevPlace, cellFill);
      under(col.cPrev, TOP_BASE, 'c_prev', fx(b.cPrev));

      // 잊기: 벽에 걸린 몫과 건너간 몫
      if (f) {
        const bfx = col.gateF - WALL_W / 2 - BW / 2 - 1;
        hd.blockedF = blocked({ cx: bfx, base: TOP_BASE - K * f.kept, h: K * f.dropped });
        const keptPlace: Place = { cx: col.kept, base: TOP_BASE, h: K * f.kept };
        if (cm) ghost(keptPlace);
        else hd.kept = bar(keptPlace, cellFill);
        under(col.kept, TOP_BASE, 'f·c_prev', fx(f.kept));
      }

      // 후보
      label(col.cand, BOT_NAME_Y, t('label.candidate', 'Candidate'), { size: fontSizes.xs, fill: colors.textMuted });
      if (cand) {
        const candPlace: Place = { cx: col.cand, base: BOT_BASE, h: K * cand.g };
        if (ad) ghost(candPlace);
        else hd.candidate = bar(candPlace, inFill);
        label(col.cand, BOT_GATE_Y, `tanh(${fx(cand.pre)})`, {
          mono: true,
          weight: step === 'candidate' ? 'bold' : 'normal',
          fill: step === 'candidate' ? colors.itemActive : colors.text,
        });
        under(col.cand, BOT_BASE, 'g', fx(cand.g));
      } else {
        label(col.cand, BOT_GATE_Y, 'g', { mono: true });
      }

      // 들이기
      if (ad && cand) {
        const bix = col.gateI - WALL_W / 2 - BW / 2 - 1;
        hd.blockedI = blocked({ cx: bix, base: BOT_BASE - K * ad.admitted, h: K * cand.g - K * ad.admitted });
        const admPlace: Place = { cx: col.adm, base: BOT_BASE, h: K * ad.admitted };
        if (cm) ghost(admPlace);
        else hd.admitted = bar(admPlace, inFill);
        under(col.adm, BOT_BASE, 'i·g', fx(ad.admitted));
      }

      // 새 셀: 두 몫이 쌓인다
      if (cm) {
        hd.cKept = bar({ cx: col.c, base: TOP_BASE, h: K * cm.kept }, cellFill);
        hd.cAdmitted = bar({ cx: col.c, base: TOP_BASE - K * cm.kept, h: K * cm.admitted }, inFill);
        under(col.c, TOP_BASE, 'c', fx(cm.c));
      }

      // 내보내기
      if (out) {
        ghost({ cx: col.tanh, base: BOT_BASE, h: K * out.tc });
        under(col.tanh, BOT_BASE, 'tanh(c)', fx(out.tc));
        const box = col.gateO - WALL_W / 2 - BW / 2 - 1;
        hd.blockedO = blocked({ cx: box, base: BOT_BASE - K * out.h, h: K * out.tc - K * out.h });
        hd.hBar = bar({ cx: col.h, base: BOT_BASE, h: K * out.h }, cellFill);
        under(col.h, BOT_BASE, 'h', fx(out.h));
      }

      return hd;
    }

    function clearPending(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    function tween(ms: number, mine: number, onFrame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const u = Math.min(1, (performance.now() - start) / ms);
          onFrame(u);
          if (u >= 1) {
            finish();
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

    /** 문을 지나는 운동: 한 막대가 from 에서 to 로 가다가, 틈보다 높은 몫은 벽 앞에서 선다. */
    function passThrough(
      pass: SVGRectElement,
      stop: SVGRectElement,
      fromX: number,
      stopX: number,
      toX: number,
      base: number,
      passH: number,
      stopH: number,
      u: number,
    ): void {
      const p = lerp(fromX, toX, ease(u));
      placeRect(pass, { cx: p, base, h: passH });
      placeRect(stop, { cx: Math.min(p, stopX), base: base - passH, h: stopH });
    }

    async function animate(scene: GateLetsThroughScene, hd: Handles, mine: number): Promise<void> {
      const K = unitOf(scene);
      const step = scene.step;
      if (step === null) return;
      const ms = MOVE_MS[step];
      const stopOf = (gx: number): number => gx - WALL_W / 2 - BW / 2 - 1;
      switch (step) {
        case 'forget': {
          const f = scene.forget;
          const { kept, blockedF } = hd;
          if (!f || !kept || !blockedF) return;
          await tween(ms, mine, (u) =>
            passThrough(kept, blockedF, col.cPrev, stopOf(col.gateF), col.kept, TOP_BASE, K * f.kept, K * f.dropped, u),
          );
          return;
        }
        case 'candidate': {
          const c = scene.candidate;
          const node = hd.candidate;
          if (!c || !node) return;
          await tween(ms, mine, (u) => placeRect(node, { cx: col.cand, base: BOT_BASE, h: K * c.g * ease(u) }));
          return;
        }
        case 'admit': {
          const a = scene.admit;
          const c = scene.candidate;
          const { admitted, blockedI } = hd;
          if (!a || !c || !admitted || !blockedI) return;
          await tween(ms, mine, (u) =>
            passThrough(
              admitted,
              blockedI,
              col.cand,
              stopOf(col.gateI),
              col.adm,
              BOT_BASE,
              K * a.admitted,
              K * c.g - K * a.admitted,
              u,
            ),
          );
          return;
        }
        case 'combine': {
          const m = scene.combine;
          const { cKept, cAdmitted } = hd;
          if (!m || !cKept || !cAdmitted) return;
          await tween(ms, mine, (u) => {
            const e = ease(u);
            placeRect(cKept, { cx: lerp(col.kept, col.c, e), base: TOP_BASE, h: K * m.kept });
            placeRect(cAdmitted, {
              cx: lerp(col.adm, col.c, e),
              base: lerp(BOT_BASE, TOP_BASE - K * m.kept, e),
              h: K * m.admitted,
            });
          });
          return;
        }
        case 'output': {
          const o = scene.output;
          const m = scene.combine;
          const { hBar, blockedO } = hd;
          if (!o || !m || !hBar || !blockedO) return;
          const SPLIT = 0.45;
          await tween(ms, mine, (u) => {
            if (u < SPLIT) {
              // 셀에서 한 벌이 내려와 tanh 로 눌린다
              const e = ease(u / SPLIT);
              const whole: Place = {
                cx: lerp(col.c, col.tanh, e),
                base: lerp(TOP_BASE, BOT_BASE, e),
                h: lerp(K * m.c, K * o.tc, e),
              };
              const low = whole.h * o.o;
              placeRect(hBar, { cx: whole.cx, base: whole.base, h: low });
              placeRect(blockedO, { cx: whole.cx, base: whole.base - low, h: whole.h - low });
              return;
            }
            passThrough(
              hBar,
              blockedO,
              col.tanh,
              stopOf(col.gateO),
              col.h,
              BOT_BASE,
              K * o.h,
              K * o.tc - K * o.h,
              (u - SPLIT) / (1 - SPLIT),
            );
          });
          return;
        }
      }
    }

    return {
      async render(
        next: GateLetsThroughScene,
        prev: GateLetsThroughScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        clearPending();
        if (destroyed) return;
        const hd = drawStatic(next);
        if (!opts.animate || next.step === null || prev === null) return;
        // prev 는 고르는 데만 — 이번 걸음의 자취가 방금 생겼을 때만 흘린다
        if (prev[next.step] !== null) return;
        await animate(next, hd, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        clearPending();
        svg.textContent = '';
      },
    };
  },
};
