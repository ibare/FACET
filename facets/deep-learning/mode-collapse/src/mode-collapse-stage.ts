import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
} from '@ffacet/core/runtime';
import { discScore } from './algorithm.js';
import type { ModeCollapseRound, ModeCollapseScene } from './scene.js';

const H = 324;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로 띠 — 위에서부터 머리줄 · 점수 곡선 · 퍼짐 · 만든 것 넷 · 축(진짜) · 쪽별 · 캡션 */
const HEAD_Y = 20;
const CURVE_TOP = 58;
const CURVE_BOT = 146;
const BRACKET_Y = 162;
const FAKE_Y0 = 175;
const FAKE_GAP = 11;
const AXIS_Y = 228;
const TICK_LABEL_Y = 246;
const SIDE_Y = 276;
const CAPTION_Y = 308;
const PAD = 26;
const MOTION_MS = 400;
/** 진짜 표본 바깥으로 둘 여유 (축의 단위) */
const MARGIN = 1.5;
const CURVE_SAMPLES = 120;

/** 가려내는 쪽 점수를 적어 두는 두 자리 — 두 봉우리의 가운데 */
const PROBES = [-2, 2] as const;

function fixed(x: number, digits: number): string {
  const s = x.toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : s;
}

function coord(x: number): string {
  const r = Math.round(x * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function signed(x: number): string {
  return x < 0 ? `−${Math.abs(x)}` : `+${x}`;
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자 · 가나)는 한 칸, 나머지는 0.6 칸 */
function textWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) w += /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(ch) ? px : px * 0.6;
  return w;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

type Shape = { a: number; b: number; fakes: number[]; v: number[]; c: number };

/** 이번 걸음의 u(0 → 1) 자리에서 보일 모양. u = 1 이면 지금 모습 그대로 */
function shapeAt(now: ModeCollapseRound, was: ModeCollapseRound | null, u: number): Shape {
  if (!was || u >= 1) return now;
  if (was.fakes.length !== now.fakes.length || was.v.length !== now.v.length) {
    throw new Error('mode-collapse 그림: 앞 모습과 지금 모습의 길이가 다르다');
  }
  return {
    a: now.a,
    b: now.b,
    fakes: now.fakes.map((x, i) => lerp(was.fakes[i]!, x, u)),
    v: now.v.map((x, k) => lerp(was.v[k]!, x, u)),
    c: lerp(was.c, now.c, u),
  };
}

export const modeCollapseStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const body = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function node(tag: string, attrs: Record<string, string | number>, parent: Element, text?: string): SVGElement {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? coord(v) : v);
      if (text !== undefined) e.textContent = text;
      parent.appendChild(e);
      return e;
    }

    function label(x: number, y: number, text: string, parent: Element, opts: { anchor?: string; size?: string; fill?: string; weight?: string } = {}): void {
      node(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'font-family': fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          ...(opts.weight ? { 'font-weight': opts.weight } : {}),
        },
        parent,
        text,
      );
    }

    function draw(scene: ModeCollapseScene, u: number): void {
      svg.textContent = '';
      const root = node('g', {}, svg);
      const real = scene.real;
      // 축 범위는 진짜에서 센다 — 걸음마다 같은 축이어야 진짜가 제자리에 선다. 만든 것이 이 밖이면 px 가 던진다
      const lo = Math.min(...real) - MARGIN;
      const hi = Math.max(...real) + MARGIN;
      const px = (x: number): number => {
        if (x < lo || x > hi) throw new Error(`mode-collapse 그림: ${x} 가 축 범위 [${lo}, ${hi}] 밖이다`);
        return PAD + ((x - lo) / (hi - lo)) * (W - 2 * PAD);
      };
      const py = (d: number): number => CURVE_TOP + (1 - d) * (CURVE_BOT - CURVE_TOP);

      // 머리줄 — 범례 셋
      let lx = PAD;
      node('circle', { cx: lx + 5, cy: HEAD_Y - 4, r: 5, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, root);
      const realName = t('legend.real', 'Real');
      label(lx + 14, HEAD_Y, realName, root, { anchor: 'start' });
      lx += 14 + textWidth(realName, body) + 16;
      node('circle', { cx: lx + 5, cy: HEAD_Y - 4, r: 5, fill: colors.itemActive }, root);
      const fakeName = t('legend.fake', 'Generated');
      label(lx + 14, HEAD_Y, fakeName, root, { anchor: 'start' });
      lx += 14 + textWidth(fakeName, body) + 16;
      node('line', { x1: lx, y1: HEAD_Y - 4, x2: lx + 16, y2: HEAD_Y - 4, stroke: colors.textMuted, 'stroke-width': 2 }, root);
      label(lx + 22, HEAD_Y, `D(x) ${t('legend.disc', 'Discriminator score')}`, root, { anchor: 'start', fill: colors.textMuted });

      // 곡선 칸의 0 · 1 눈금
      for (const d of [0, 1]) {
        node('line', { x1: PAD, y1: py(d), x2: W - PAD, y2: py(d), stroke: colors.textMuted, 'stroke-width': 0.5, 'stroke-dasharray': '2 4' }, root);
        label(PAD - 6, py(d) + 4, String(d), root, { anchor: 'end', size: fontSizes.xs, fill: colors.textMuted });
      }

      // 두 쪽을 가르는 0
      node('line', { x1: px(0), y1: CURVE_TOP - 8, x2: px(0), y2: SIDE_Y + 6, stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '4 4' }, root);

      // 축과 눈금
      node('line', { x1: PAD, y1: AXIS_Y, x2: W - PAD, y2: AXIS_Y, stroke: colors.textMuted, 'stroke-width': 1 }, root);
      for (let k = Math.ceil(lo); k <= Math.floor(hi); k += 1) {
        node('line', { x1: px(k), y1: AXIS_Y, x2: px(k), y2: AXIS_Y + 4, stroke: colors.textMuted, 'stroke-width': 1 }, root);
        label(px(k), TICK_LABEL_Y, k === 0 ? '0' : k < 0 ? `−${-k}` : String(k), root, { size: fontSizes.xs, fill: colors.textMuted });
      }

      // 진짜 넷 — 처음부터 끝까지 같은 자리
      for (const x of real) {
        node('circle', { cx: px(x), cy: AXIS_Y, r: 6, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, root);
      }

      const now = scene.now;
      if (now && (!scene.centers || scene.realNeg === null || scene.realPos === null)) {
        throw new Error('mode-collapse 그림: 지금 모습은 있는데 바탕(centers · 진짜 쪽별)이 없다');
      }
      if (!now || !scene.centers || scene.realNeg === null || scene.realPos === null) {
        label(W / 2, CAPTION_Y, t('caption.wait', 'Waiting to start'), root, { size: fontSizes.md });
        return;
      }
      const centers = scene.centers;
      const was = scene.step && scene.step.kind === 'round' ? scene.step.was : null;
      const shape = shapeAt(now, was, u);

      // 가려내는 쪽의 점수 곡선
      const pts: string[] = [];
      for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
        const x = i === CURVE_SAMPLES ? hi : lo + ((hi - lo) * i) / CURVE_SAMPLES;
        pts.push(`${coord(px(x))},${coord(py(discScore(x, shape.v, shape.c, centers)))}`);
      }
      node('polyline', { points: pts.join(' '), fill: 'none', stroke: colors.textMuted, 'stroke-width': 2 }, root);

      // 두 봉우리 가운데의 점수
      for (const x of PROBES) {
        const d = discScore(x, shape.v, shape.c, centers);
        node('line', { x1: px(x), y1: py(d), x2: px(x), y2: AXIS_Y - 8, stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '1 3' }, root);
        node('circle', { cx: px(x), cy: py(d), r: 4, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 }, root);
        label(px(x), py(d) - 9, `D(${signed(x)}) ${fixed(d, 2)}`, root, { size: fontSizes.xs });
      }

      // 퍼짐 — 만든 것의 가장 작은 것에서 가장 큰 것까지
      const fMin = Math.min(...shape.fakes);
      const fMax = Math.max(...shape.fakes);
      node('line', { x1: px(fMin), y1: BRACKET_Y, x2: px(fMax), y2: BRACKET_Y, stroke: colors.itemActive, 'stroke-width': 1.5 }, root);
      for (const x of [fMin, fMax]) {
        node('line', { x1: px(x), y1: BRACKET_Y - 4, x2: px(x), y2: BRACKET_Y + 4, stroke: colors.itemActive, 'stroke-width': 1.5 }, root);
      }

      // 만든 것 넷 — 잡음 차례대로 한 줄씩, 옆으로 몰려 간다
      shape.fakes.forEach((x, i) => {
        node('circle', { cx: px(x), cy: FAKE_Y0 + i * FAKE_GAP, r: 5, fill: colors.itemActive, stroke: colors.bg, 'stroke-width': 1 }, root);
      });

      // 머리줄 오른쪽 — 만드는 쪽의 두 값
      label(W - PAD, HEAD_Y, `G(z) = a·z + b   a ${fixed(shape.a, 2)} · b ${fixed(shape.b, 2)}`, root, { anchor: 'end', fill: colors.text });

      // 쪽별 개수
      const leftMid = (PAD + px(0)) / 2;
      const rightMid = (px(0) + W - PAD) / 2;
      label(leftMid, SIDE_Y, t('label.side', '{side} side · real: {real} · generated: {fake}', { side: '\u2212', real: scene.realNeg, fake: now.neg }), root);
      label(rightMid, SIDE_Y, t('label.side', '{side} side · real: {real} · generated: {fake}', { side: '+', real: scene.realPos, fake: now.pos }), root);

      // 캡션 — 지금 일어난 일
      const vars = { neg: now.neg, pos: now.pos, spread: fixed(now.spread, 2) };
      const caption =
        now.round === 0
          ? t('caption.start', 'Before training — generated per side (− | +): {neg} | {pos} · spread: {spread}', vars)
          : t('caption.round', 'Round: {round} — generated per side (− | +): {neg} | {pos} · spread: {spread}', { ...vars, round: now.round });
      label(W / 2, CAPTION_Y, caption, root, { size: fontSizes.md, weight: '600' });
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          timers.delete(id);
          clearTimeout(id);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    const renderer: SceneRenderer<ModeCollapseScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        const moving = opts.animate && next.step !== null && next.step.kind === 'round';
        if (!moving) {
          draw(next, 1);
          return;
        }
        const start = Date.now();
        draw(next, 0);
        let u = 0;
        while (u < 1) {
          if (mine !== gen || destroyed) return;
          await wait(16);
          if (mine !== gen || destroyed) return;
          u = Math.min(1, (Date.now() - start) / MOTION_MS);
          if (u < 1) draw(next, ease(u));
        }
        draw(next, 1);
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
    return renderer as unknown as ReturnType<CanvasView['mount']>;
  },
};
