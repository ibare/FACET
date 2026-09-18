/**
 * lost-in-the-middle stage — 맥락은 가로로 선 슬롯 n 칸이다. 왼쪽 끝이 맥락의 앞, 오른쪽 끝이 뒤.
 *
 * 슬롯마다 가까운 끝까지 거리 d 가 있고, 카드의 가라앉음 · 흐림 · 옅음은 **d 의 단조
 * 함수 하나**(`veilOf`)로만 정한다. d 가 같으면 같게, 클수록 깊고 흐리게. 이것은 보고된
 * 경향을 예로 그린 것이다 — 수는 화면에 띄우지 않는다.
 *
 * 동사 "가운데로 묻혔다 다시 드러난다" — 답 조각이 슬롯을 따라 미끄러지며 골짜기로
 * 내려가 흐려지고, 끝에 닿으면 올라와 또렷해진다. 나머지는 밀려 한 칸씩 옮긴다.
 * 끼워 본 자리마다 아래에 표식이 남는다 (자취).
 */
import {
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { LostInTheMiddleScene } from './scene.js';

const H = 300;
const W = PIECE_CANVAS_W;
const M = 16;
const GAP = 6;
const FONT_PX = 10;
const LINE_H = 12;
const PAD = 6;
/** 글자 폭 어림 (system-ui 소문자 평균) */
const CHAR_EM = 0.52;
const CARD_H_MAX = 96;

const Y_Q = 24;
const Y_ENDS = 50;
const Y_NUM = 64;
const Y_CARD = 72;
const Y_PIN = 228;
const Y_PIN_LABEL = 246;
const Y_CAP1 = 272;
const Y_CAP2 = 290;
/** 가장 깊이 가라앉는 양의 상한 */
const SINK_CAP = 40;
/** 흐림의 상한과 단계 — 단계로 끊어 filter id 를 인스턴스와 무관하게 둔다 */
const BLUR_MAX = 1.2;
const BLUR_LEVELS = 6;
/** 가장 옅을 때 덜어내는 불투명도 */
const FADE_MAX = 0.55;

const MOVE_MS = 900;
const SETTLE_MS = 500;
const PIN_R = 4;

const SVG_NS = 'http://www.w3.org/2000/svg';

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** 공백으로 가른 낱말을 한 줄 maxChars 안쪽으로 싼다. */
function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (word === '') continue;
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= maxChars) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

type CardHandle = { g: SVGGElement };

export const lostInTheMiddleStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<LostInTheMiddleScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    let cards = new Map<string, CardHandle>();
    let pins: SVGCircleElement[] = [];
    let pinLabels: SVGTextElement[] = [];

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

    function geometry(scene: LostInTheMiddleScene) {
      const n = Math.max(1, scene.n);
      const cardW = (W - 2 * M - (n - 1) * GAP) / n;
      const maxChars = Math.max(4, Math.floor((cardW - 2 * PAD) / (FONT_PX * CHAR_EM)));
      let maxLines = 1;
      for (const c of scene.chunks) maxLines = Math.max(maxLines, wrap(c.text, maxChars).length);
      const cardH = Math.min(CARD_H_MAX, 2 * PAD + maxLines * LINE_H);
      const sinkMax = Math.max(0, Math.min(SINK_CAP, Y_PIN - PIN_R - 12 - Y_CARD - cardH));
      const dMax = Math.floor((n - 1) / 2);
      return { n, cardW, maxChars, cardH, sinkMax, dMax };
    }
    type Geo = ReturnType<typeof geometry>;

    /** 슬롯 s (1 부터, 연속값) 의 가까운 끝까지 거리. 맥락 밖(s < 1)은 0 */
    function distAt(s: number, geo: Geo): number {
      return Math.max(0, Math.min(s - 1, geo.n - s));
    }

    /** 흐려짐 — d 의 단조 함수 하나. 0(또렷) … 1(가장 흐림) */
    function veilOf(d: number, geo: Geo): number {
      if (geo.dMax <= 0) return 0;
      return Math.max(0, Math.min(1, d / geo.dMax));
    }

    function slotLeft(s: number, geo: Geo): number {
      return M + (s - 1) * (geo.cardW + GAP);
    }

    function blurLevel(veil: number): number {
      return Math.round(veil * BLUR_LEVELS);
    }

    /** 슬롯 s 에 선 카드의 모습을 그 자리의 거리로 입힌다. 정적 그리기와 운동이 함께 쓴다 */
    function placeCard(g: SVGGElement, s: number, geo: Geo, lift = 0): void {
      const veil = veilOf(distAt(s, geo), geo);
      const x = r1(slotLeft(s, geo));
      const y = r1(Y_CARD + geo.sinkMax * veil - lift);
      g.setAttribute('transform', `translate(${x},${y})`);
      const op = r1((1 - FADE_MAX * veil) * 100) / 100;
      if (op >= 1) g.removeAttribute('opacity');
      else g.setAttribute('opacity', String(op));
      const level = blurLevel(veil);
      if (level === 0) g.removeAttribute('filter');
      else g.setAttribute('filter', `url(#litm-blur-${level})`);
    }

    function drawStatic(scene: LostInTheMiddleScene): void {
      svg.textContent = '';
      cards = new Map();
      pins = [];
      pinLabels = [];
      if (scene.n === 0 || scene.chunks.length === 0) return;
      const geo = geometry(scene);

      const defs = el('defs', {}, svg);
      for (let k = 1; k <= BLUR_LEVELS; k += 1) {
        const f = el('filter', { id: `litm-blur-${k}`, x: '-10%', y: '-10%', width: '120%', height: '120%' }, defs);
        el('feGaussianBlur', { stdDeviation: r1((BLUR_MAX * k) / BLUR_LEVELS) }, f);
      }

      // 질문
      const q = el(
        'text',
        { x: M, y: Y_Q, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text },
        svg,
      );
      const qLabel = el('tspan', { fill: colors.textMuted, 'font-size': fontSizes.sm }, q);
      qLabel.textContent = t('label.question', 'Question');
      const qText = el('tspan', { dx: 8, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, q);
      qText.textContent = scene.question;

      // 맥락의 두 끝
      const front = el(
        'text',
        { x: M, y: Y_ENDS, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted },
        svg,
      );
      front.textContent = t('label.front', 'front of context');
      const end = el(
        'text',
        {
          x: W - M,
          y: Y_ENDS,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        svg,
      );
      end.textContent = t('label.end', 'end of context');

      // 슬롯 번호 — 번호도 그 자리의 거리만큼 옅다
      for (let s = 1; s <= geo.n; s += 1) {
        const veil = veilOf(distAt(s, geo), geo);
        const num = el(
          'text',
          {
            x: r1(slotLeft(s, geo) + geo.cardW / 2),
            y: Y_NUM,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          svg,
        );
        if (veil > 0) num.setAttribute('opacity', String(r1((1 - FADE_MAX * veil) * 100) / 100));
        num.textContent = String(s);
      }

      // 조각 카드 — 답 조각은 맨 나중에 그려 지나갈 때 위에 선다
      const textOf = new Map(scene.chunks.map((c) => [c.id, c.text]));
      const drawOrder = scene.order.filter((id) => id !== scene.answer);
      if (scene.order.includes(scene.answer)) drawOrder.push(scene.answer);
      for (const id of drawOrder) {
        const s = scene.order.indexOf(id) + 1;
        const isAnswer = id === scene.answer;
        const g = el('g', {}, svg);
        el(
          'rect',
          {
            x: 0,
            y: 0,
            width: r1(geo.cardW),
            height: r1(geo.cardH),
            rx: 4,
            fill: isAnswer ? colors.bgSubtle : colors.bg,
            stroke: isAnswer ? colors.primary : colors.border,
            'stroke-width': isAnswer ? 2 : 1,
          },
          g,
        );
        const lines = wrap(textOf.get(id) ?? '', geo.maxChars);
        lines.forEach((line, k) => {
          const tx = el(
            'text',
            {
              x: PAD,
              y: PAD + LINE_H * (k + 1) - 3,
              'font-family': fonts.body,
              'font-size': `${FONT_PX}px`,
              fill: colors.text,
            },
            g,
          );
          if (isAnswer) tx.setAttribute('font-weight', '600');
          tx.textContent = line;
        });
        placeCard(g, s, geo);
        cards.set(id, { g });
      }

      // 자취 — 끼워 본 자리마다 표식. 표식도 그 자리의 거리만큼 옅다
      for (const v of scene.visits) {
        const cx = r1(slotLeft(v.p, geo) + geo.cardW / 2);
        const veil = veilOf(v.d, geo);
        const pin = el('circle', { cx, cy: Y_PIN, r: PIN_R, fill: colors.primary }, svg);
        if (veil > 0) pin.setAttribute('opacity', String(r1((1 - FADE_MAX * veil) * 100) / 100));
        pins.push(pin);
        if (scene.settled) {
          const lab = el(
            'text',
            {
              x: cx,
              y: Y_PIN_LABEL,
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            },
            svg,
          );
          lab.textContent = t('label.dist', 'distance {d}', { d: v.d });
          pinLabels.push(lab);
        }
      }

      // 캡션 — 지금 일어나는 일만
      let line1 = '';
      let line2 = '';
      if (scene.settled) {
        line1 = t('caption.settle', 'The same words in all {k} slots — only the distance to an end changed.', {
          k: scene.visits.length,
        });
      } else if (scene.p !== null && scene.d !== null) {
        line1 = t('caption.place', 'Answer chunk at slot {p} of {n}. Distance to the nearer end: {d}.', {
          p: scene.p,
          n: scene.n,
          d: scene.d,
        });
        line2 =
          scene.d === 0
            ? t('caption.edge', 'At an end of the context — a spot models tend to catch.')
            : t('caption.middle', 'Toward the middle — a spot models tend to miss.');
      } else {
        line1 = t('caption.ready', '{k} chunks sit in the context. The answer chunk is not placed yet.', {
          k: scene.rest.length,
        });
      }
      const c1 = el(
        'text',
        { x: M, y: Y_CAP1, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
        svg,
      );
      c1.textContent = line1;
      if (line2 !== '') {
        const c2 = el(
          'text',
          { x: M, y: Y_CAP2, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
          svg,
        );
        c2.textContent = line2;
      }
    }

    /** 한 시계로 흘린다. destroy 나 새 render 가 오면 곧바로 풀린다 */
    function run(duration: number, mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = now();
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
          const p = Math.min(1, (now() - start) / duration);
          frame(ease(p));
          if (p >= 1) {
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

    async function animatePlace(
      scene: LostInTheMiddleScene,
      before: string[],
      mine: number,
    ): Promise<void> {
      const geo = geometry(scene);
      const moves: { g: SVGGElement; from: number; to: number; answer: boolean }[] = [];
      for (const [id, handle] of cards) {
        const to = scene.order.indexOf(id) + 1;
        const was = before.indexOf(id);
        // 맥락에 아직 없던 답 조각은 맥락의 앞 바깥(슬롯 0)에서 들어온다
        const from = was < 0 ? 0 : was + 1;
        if (from !== to) moves.push({ g: handle.g, from, to, answer: id === scene.answer });
      }
      const newest = pins[pins.length - 1];
      await run(MOVE_MS, mine, (e) => {
        for (const m of moves) {
          const s = m.from + (m.to - m.from) * e;
          // 답 조각은 다른 카드 위로 지나가도록 조금 들린다
          const lift = m.answer ? 8 * Math.sin(Math.PI * e) : 0;
          placeCard(m.g, s, geo, lift);
        }
        if (newest) newest.setAttribute('r', String(r1(PIN_R * e)));
      });
      if (mine !== gen || destroyed) return;
      drawStatic(scene);
    }

    async function animateSettle(scene: LostInTheMiddleScene, mine: number): Promise<void> {
      const labels = pinLabels;
      await run(SETTLE_MS, mine, (e) => {
        for (const lab of labels) {
          lab.setAttribute('transform', `translate(0,${r1(8 * (1 - e))})`);
          lab.setAttribute('opacity', String(r1(e * 100) / 100));
        }
      });
      if (mine !== gen || destroyed) return;
      drawStatic(scene);
    }

    return {
      render(
        next: LostInTheMiddleScene,
        prev: LostInTheMiddleScene | null,
        opts: { animate: boolean },
      ): void | Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || prev === null || next.step === null) return;
        if (next.step.kind === 'place') return animatePlace(next, next.step.before, mine);
        return animateSettle(next, mine);
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
