/**
 * request-response 의 그림 — 되물어 번진다.
 *
 * 브라우저 아래에 물을 줄이 있다. 요청 걸음에는 줄 머리의 경로가 줄에서 빠져 올라가
 * 요청 줄이 되어 연결 하나를 건너 서버에 닿는다. 응답 걸음에는 상태 줄이 적힌 답이 돌아오고,
 * 그 본문에 적힌 이름이 답에서 풀려나와 줄 끝으로 날아가 선다. 서버는 나간 요청의 짝으로만 답한다.
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
import type { RequestResponseScene } from './scene.js';

const H = 304;
const PAD = 16;
const GAP = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 (ms). 요청은 줄에서 올라가 건너고, 응답은 건너온 뒤 이름이 풀려난다. */
const REQUEST_MS = 650;
const RESPONSE_MS = 900;
const FRAME_MS = 16;

const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);
/** 고정폭 글자 한 칸의 폭 비율 */
const MONO_RATIO = 0.6;

type Attrs = Record<string, string | number>;

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** [a, b] 구간 안의 진행을 0..1 로 */
function span(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return (p - a) / (b - a);
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function monoW(chars: number, px: number): number {
  return chars * px * MONO_RATIO;
}

type Layout = {
  boxW: number;
  boxTop: number;
  boxH: number;
  browserH: number;
  rowPitch: number;
  laneY: number;
  laneL: number;
  laneR: number;
  countY: number;
  queueLabelY: number;
  queueY: number;
  chipH: number;
  logLabelY: number;
  logY: number;
  logH: number;
  slotW: number;
  captionY: number;
};

/** 줄과 받은 답이 가질 수 있는 칸 수 — 첫 경로와 본문이 가리킬 수 있는 이름의 합집합 */
function slotCount(scene: RequestResponseScene): number {
  const names = new Set<string>([scene.base.start]);
  for (const r of scene.base.resources) for (const ref of r.refs) names.add(ref);
  return Math.max(1, names.size);
}

function layout(scene: RequestResponseScene): Layout {
  const W = PIECE_CANVAS_W;
  const boxW = Math.min(132, Math.round(W * 0.22));
  const boxTop = 10;
  const rows = Math.max(1, scene.base.resources.length);
  const rowPitch = Math.min(16, 72 / rows);
  const boxH = 44 + rows * rowPitch + 6;
  const n = slotCount(scene);
  const slotW = Math.min(120, (W - 2 * PAD - (n - 1) * GAP) / n);
  const countY = boxTop + boxH + 16;
  const queueLabelY = countY + 26;
  const chipH = 24;
  const queueY = queueLabelY + 8;
  const logLabelY = queueY + chipH + 28;
  const logY = logLabelY + 8;
  const logH = 38;
  return {
    boxW,
    boxTop,
    boxH,
    browserH: 52,
    rowPitch,
    laneY: boxTop + 30,
    laneL: PAD + boxW,
    laneR: W - PAD - boxW,
    countY,
    queueLabelY,
    queueY,
    chipH,
    logLabelY,
    logY,
    logH,
    slotW,
    captionY: H - 12,
  };
}

function slotX(L: Layout, i: number): number {
  return PAD + i * (L.slotW + GAP);
}

export const requestResponseStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el(tag: string, attrs: Attrs, parent: Element = svg, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r1(v) : v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function label(x: number, y: number, s: string, px: number, fill: string, mono = false, anchor = 'start', weight = 400): void {
      el(
        'text',
        {
          x,
          y,
          fill,
          'font-family': mono ? fonts.mono : fonts.body,
          'font-size': px,
          'font-weight': weight,
          'text-anchor': anchor,
          'dominant-baseline': 'middle',
        },
        svg,
        s,
      );
    }

    /** 글자를 품은 둥근 상자 */
    function pill(x: number, y: number, w: number, h: number, s: string, stroke: string, ink: string, px: number): void {
      el('rect', { x, y, width: w, height: h, rx: 5, fill: c.bg, stroke, 'stroke-width': 1.5 });
      label(x + w / 2, y + h / 2, s, px, ink, true, 'middle');
    }

    function lineW(s: string): number {
      return monoW(s.length, SM) + 16;
    }

    /** 응답 상자의 크기 — 상태 줄 한 줄 + 본문이 가리키는 이름 줄마다 한 줄 */
    function cardSize(status: string, refs: string[]): { w: number; h: number } {
      const longest = refs.reduce((m, s) => Math.max(m, s.length), 0);
      const w = Math.max(lineW(status), monoW(longest, XS) + 24);
      return { w, h: 24 + refs.length * 14 + (refs.length > 0 ? 6 : 0) };
    }

    /** 장면 하나를 진행 p (0..1) 의 자리에 세운다. p=1 이 정본(정적 그리기)이다. */
    function draw(scene: RequestResponseScene, p: number): void {
      svg.textContent = '';
      if (scene.base.start === '') return;
      const L = layout(scene);
      const W = PIECE_CANVAS_W;
      const step = scene.step;
      const sent = scene.log.length;
      const replied = scene.log.filter((x) => x.status !== null).length;

      // 연결 하나 — 브라우저와 서버 사이의 길
      el('line', { x1: L.laneL, y1: L.laneY, x2: L.laneR, y2: L.laneY, stroke: c.border, 'stroke-width': 2 });

      // 브라우저
      // 브라우저 — 제 줄 말고는 가진 것이 없다. 줄은 그 아래에 선다
      el('rect', { x: PAD, y: L.boxTop, width: L.boxW, height: L.browserH, rx: 8, fill: c.bgSubtle, stroke: c.border });
      label(PAD + 10, L.boxTop + 16, t('label.browser', 'Browser'), MD, c.text, false, 'start', 600);
      label(PAD + 10, L.boxTop + 38, t('label.sent', 'Requests: {n}', { n: sent }), XS, c.textMuted);

      // 서버와 그 자원 표 (경로만)
      const sx = W - PAD - L.boxW;
      const missing = step.kind === 'response' && !step.found;
      el('rect', {
        x: sx,
        y: L.boxTop,
        width: L.boxW,
        height: L.boxH,
        rx: 8,
        fill: c.bgSubtle,
        stroke: missing ? c.danger : c.border,
        'stroke-width': missing ? 2 : 1,
      });
      label(sx + 10, L.boxTop + 16, t('label.server', 'Server'), MD, c.text, false, 'start', 600);
      label(sx + 10, L.boxTop + 32, scene.base.host, XS, c.textMuted, true);
      scene.base.resources.forEach((r, i) => {
        const y = L.boxTop + 44 + i * L.rowPitch + L.rowPitch / 2;
        const hit = step.kind === 'response' && step.found && step.path === r.path;
        if (hit) {
          el('rect', { x: sx + 4, y: y - L.rowPitch / 2, width: L.boxW - 8, height: L.rowPitch, rx: 3, fill: 'none', stroke: c.success, 'stroke-width': 1.5 });
        }
        label(sx + 10, y, r.path, SM, hit ? c.text : c.textMuted, true);
      });
      label(sx + L.boxW / 2, L.countY, t('label.replied', 'Responses: {n}', { n: replied }), XS, c.textMuted, false, 'middle');

      // 물을 줄
      label(PAD, L.queueLabelY, t('label.queue', 'To ask'), SM, c.textMuted);
      const added = step.kind === 'response' ? step.added : [];
      const firstAdded = scene.queue.length - added.length;
      if (scene.queue.length === 0) {
        label(PAD, L.queueY + L.chipH / 2, t('label.empty', 'empty'), SM, c.textMuted);
      }

      // 응답 걸음: 상자가 건너온 뒤 이름이 풀려난다
      const cross = ease(span(p, 0, 0.5));
      const peel = ease(span(p, 0.5, 1));
      let card: { x: number; y: number; w: number; h: number } | null = null;
      if (step.kind === 'response') {
        const size = cardSize(step.status, step.refs);
        const x0 = L.laneR - 6 - size.w;
        const x1 = L.laneL + 6;
        card = { x: lerp(x0, x1, cross), y: L.laneY - 12, w: size.w, h: size.h };
      }

      scene.queue.forEach((path, i) => {
        const isNew = i >= firstAdded && step.kind === 'response';
        if (isNew && peel <= 0) return; // 아직 답 안에 있다
        const fx = slotX(L, i);
        let x = fx;
        let y = L.queueY;
        if (isNew && card !== null && step.kind === 'response') {
          const j = step.refs.indexOf(path);
          const ox = card.x + 12;
          const oy = card.y + 24 + (j < 0 ? 0 : j) * 14 - 2;
          x = lerp(ox, fx, peel);
          y = lerp(oy, L.queueY, peel);
        } else if (step.kind === 'request') {
          // 머리가 빠진 자리로 한 칸씩 당겨진다
          const k = ease(span(p, 0, 0.45));
          x = lerp(slotX(L, i + 1), fx, k);
        }
        el('rect', {
          x,
          y,
          width: L.slotW,
          height: L.chipH,
          rx: 5,
          fill: c.bg,
          stroke: isNew ? c.itemActive : c.border,
          'stroke-width': isNew ? 2 : 1,
        });
        label(x + L.slotW / 2, y + L.chipH / 2, path, SM, c.text, true, 'middle');
      });

      // 받은 답
      label(PAD, L.logLabelY, t('label.log', 'Answered'), SM, c.textMuted);
      scene.log.forEach((ex, i) => {
        if (ex.status === null || ex.code === null) return;
        if (step.kind === 'response' && i === scene.log.length - 1 && cross < 1) return; // 아직 건너오는 중
        const x = slotX(L, i);
        const ok = ex.found === true;
        el('rect', { x, y: L.logY, width: L.slotW, height: L.logH, rx: 5, fill: c.bgSubtle, stroke: ok ? c.success : c.danger });
        label(x + L.slotW / 2, L.logY + 12, ex.path, XS, c.text, true, 'middle');
        label(x + L.slotW / 2, L.logY + 27, String(ex.code), SM, ok ? c.success : c.danger, true, 'middle', 600);
      });

      // 요청 걸음: 줄 머리가 올라가 요청 줄이 되어 건넌다
      if (step.kind === 'request') {
        const up = ease(span(p, 0, 0.45));
        const over = ease(span(p, 0.45, 1));
        const w = lineW(step.line);
        if (up < 1) {
          const x = lerp(slotX(L, 0), L.laneL + 6, up);
          const y = lerp(L.queueY, L.laneY - L.chipH / 2, up);
          el('rect', { x, y, width: L.slotW, height: L.chipH, rx: 5, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5 });
          label(x + L.slotW / 2, y + L.chipH / 2, step.path, SM, c.primary, true, 'middle');
        } else {
          const x = lerp(L.laneL + 6, L.laneR - 6 - w, over);
          pill(x, L.laneY - 11, w, 22, step.line, c.primary, c.primary, SM);
        }
      }

      // 응답 상자 — 상태 줄과 본문이 가리키는 이름
      if (step.kind === 'response' && card !== null) {
        const tone = step.found ? c.success : c.danger;
        el('rect', { x: card.x, y: card.y, width: card.w, height: card.h, rx: 6, fill: c.bg, stroke: tone, 'stroke-width': 1.5 });
        label(card.x + card.w / 2, card.y + 12, step.status, SM, tone, true, 'middle', 600);
        step.refs.forEach((ref, j) => {
          const flown = step.added.includes(ref) && peel > 0;
          label(card.x + 12, card.y + 24 + j * 14 + 5, ref, XS, flown ? c.textMuted : c.text, true);
        });
      }

      // 캡션 — 지금 일어난 일만
      label(W / 2, L.captionY, caption(scene), SM, c.text, false, 'middle');
    }

    function caption(scene: RequestResponseScene): string {
      const step = scene.step;
      const q = scene.queue.length;
      if (step.kind === 'start') {
        return t('caption.start', 'First to ask: {path}', { path: scene.base.start });
      }
      if (step.kind === 'request') {
        return t('caption.request', 'Asking: {path}. Left in the queue: {q}', { path: step.path, q });
      }
      if (q === 0) {
        const req = scene.log.length;
        const res = scene.log.filter((x) => x.status !== null).length;
        return t('caption.done', 'Answer: {status}. The queue is empty. Requests: {req} · responses: {res}', {
          status: step.status,
          req,
          res,
        });
      }
      if (!step.found) {
        return t('caption.missing', 'Answer: {status}. It points to nothing. In the queue: {q}', { status: step.status, q });
      }
      return t('caption.found', 'Answer: {status}. New names inside: {n}. In the queue: {q}', {
        status: step.status,
        n: step.added.length,
        q,
      });
    }

    function run(mine: number, duration: number, scene: RequestResponseScene): Promise<void> {
      const frames = Math.max(1, Math.round(duration / FRAME_MS));
      return new Promise<void>((resolve) => {
        let i = 0;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          i += 1;
          draw(scene, i / frames);
          if (i >= frames) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        draw(scene, 0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    return {
      async render(next: RequestResponseScene, _prev: RequestResponseScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step.kind === 'start') {
          draw(next, 1);
          return;
        }
        const duration = next.step.kind === 'request' ? REQUEST_MS : RESPONSE_MS;
        await run(mine, duration, next);
        if (mine !== gen || destroyed) return;
        draw(next, 1);
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
