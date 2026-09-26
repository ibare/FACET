/**
 * queueing-model 무대 — 시간 띠 위의 요청 점, 점마다 자라는 기다림 막대, 처리 막대가 그어지는 서버 길,
 * 도착한 때의 서버와 줄.
 *
 * 운동:
 *   - 새 판(setRound): 점이 새 도착 시각으로 옮겨 간다 (들쭉날쭉이면 뭉치고 흩어지고, ρ 면 왼쪽으로 좁혀 모인다).
 *     앞 판의 막대 · 평균 선 · 캡션 · 줄 그림은 걷는다.
 *   - 요청(showRequest): 기다림 막대가 0 에서 자라 오르고, 처리 막대가 시작에서 떠남까지 그어지고,
 *     지금 요청 고리가 앞 요청에서 옮겨 오고, 새 요청 표지가 오른쪽에서 줄 끝이나 서버로 들어온다.
 *   - 모아 셈(sumUp): 평균 기다림 선이 왼쪽에서 그어진다.
 *
 * 축(시간 띠 끝 · 막대 꼭대기 · 줄 칸 수)은 알고리즘이 사다리 전체에서 셈해 init 에 싣는다 — 무대는 셈하지 않는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type QueueingRoundView = {
  variability: number;
  load: number;
  axisEnd: number;
  waitTop: number;
  lineTop: number;
  requests: Array<{ id: string; arrive: number; service: number }>;
};

export type QueueingRequestView = {
  index: number;
  id: string;
  arrive: number;
  service: number;
  wait: number;
  start: number;
  depart: number;
  line: number;
  busy: boolean;
};

export type QueueingSumView = {
  variability: number;
  load: number;
  meanWait: number;
  maxWait: number;
  waited: number;
  longestLine: number;
};

/** projector 가 부르는 무대의 표면. */
export type QueueingStage = {
  setRound(round: QueueingRoundView, ms: number): void;
  showRequest(req: QueueingRequestView, ms: number): void;
  sumUp(sum: QueueingSumView, ms: number): void;
  reset(): void;
  destroy(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 330;
const PLOT_L = 96;
const PLOT_R = 704;
const PLOT_W = PLOT_R - PLOT_L;
const CAPTION_Y = 20;
const CHART_TOP = 48;
const BAND_Y = 214;
const CHART_H = BAND_Y - CHART_TOP;
const TICK_Y = 230;
const LANE_Y = 242;
const LANE_H = 12;
const PANEL_Y = 290;
const BOX = 20;
const SLOT_GAP = 6;
const DOT_R = 3.5;
const BAR_W = 4;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent.appendChild(node);
  return node;
}

function clearChildren(g: Element): void {
  while (g.firstChild) g.removeChild(g.firstChild);
}

const fmt = (x: number): string => x.toFixed(2);

export const queueingModelStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container, params): ViewInstance & QueueingStage {
    void container;
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const text = (x: number, y: number, s: string, anchor: string, parent: Element, fill = colors.textMuted) => {
      const node = el('text', { x, y, 'text-anchor': anchor, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill }, parent);
      node.textContent = s;
      return node;
    };

    // ── 고정된 틀
    const gFrame = el('g', {}, svg);
    el('line', { x1: PLOT_L, y1: BAND_Y, x2: PLOT_R, y2: BAND_Y, stroke: colors.border, 'stroke-width': 2 }, gFrame);
    el('line', { x1: PLOT_L, y1: CHART_TOP, x2: PLOT_L, y2: BAND_Y, stroke: colors.border, 'stroke-width': 1 }, gFrame);
    text(PLOT_L - 8, CHART_TOP - 10, t('label.wait', 'wait'), 'end', gFrame);
    el('rect', { x: PLOT_L, y: LANE_Y, width: PLOT_W, height: LANE_H, fill: colors.bgSubtle, stroke: colors.border }, gFrame);
    text(PLOT_L - 8, LANE_Y + LANE_H - 2, t('label.service', 'service'), 'end', gFrame);
    text(PLOT_L - 8, PANEL_Y + BOX / 2 + smPx / 3, t('label.server', 'server'), 'end', gFrame);
    const serverBox = el(
      'rect',
      { x: PLOT_L, y: PANEL_Y, width: BOX, height: BOX, rx: 3, fill: 'none', stroke: colors.text, 'stroke-width': 1.5 },
      gFrame,
    );
    const lineLabelX = PLOT_L + BOX + 28;
    text(lineLabelX, PANEL_Y + BOX / 2 + smPx / 3, t('label.line', 'line'), 'start', gFrame);

    // ── 판마다 바뀌는 것
    const gTicks = el('g', {}, svg);
    const gBars = el('g', {}, svg);
    const gService = el('g', {}, svg);
    const gDots = el('g', {}, svg);
    const gMean = el('g', {}, svg);
    const gQueue = el('g', {}, svg);
    const ring = el('circle', { cx: -20, cy: BAND_Y, r: DOT_R + 4, fill: 'none', stroke: colors.accent, 'stroke-width': 2.5, opacity: 0 }, svg);
    const caption = el(
      'text',
      { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text },
      svg,
    );

    let round: QueueingRoundView | null = null;
    let dots: SVGCircleElement[] = [];
    let dotX: number[] = [];
    let ringX = -20;
    let destroyed = false;

    // ── 운동 — 이름마다 하나. 같은 이름이 다시 오면 앞 것을 끝 상태로 마무리하고 새로 건다.
    type Anim = { frame: number; finish: () => void };
    const anims = new Map<string, Anim>();
    const cancelAll = (finish: boolean) => {
      for (const a of anims.values()) {
        cancelAnimationFrame(a.frame);
        if (finish) a.finish();
      }
      anims.clear();
    };
    const animate = (key: string, ms: number, draw: (k: number) => void) => {
      const prev = anims.get(key);
      if (prev) {
        cancelAnimationFrame(prev.frame);
        anims.delete(key);
        prev.finish();
      }
      if (destroyed || ms <= 0 || isInstant()) {
        draw(1);
        return;
      }
      draw(0);
      const begin = performance.now();
      const anim: Anim = { frame: 0, finish: () => draw(1) };
      const tick = (now: number) => {
        if (destroyed) return;
        if (isInstant()) {
          anims.delete(key);
          draw(1);
          return;
        }
        const k = Math.min(1, (now - begin) / ms);
        const eased = 1 - (1 - k) * (1 - k);
        draw(eased);
        if (k < 1) anim.frame = requestAnimationFrame(tick);
        else anims.delete(key);
      };
      anim.frame = requestAnimationFrame(tick);
      anims.set(key, anim);
    };
    params.onScrubStart?.(() => cancelAll(true));

    const needRound = (): QueueingRoundView => {
      if (!round) throw new Error('queueing-model 무대: init 전에 걸음이 왔다');
      return round;
    };
    const xOf = (time: number): number => {
      const r = needRound();
      return PLOT_L + (time / r.axisEnd) * PLOT_W;
    };
    const hOf = (wait: number): number => (wait / needRound().waitTop) * CHART_H;
    const slotX = (k: number): number => lineLabelX + 28 + k * (BOX + SLOT_GAP);

    const variabilityName = (v: number): string => {
      switch (v) {
        case 0:
          return t('label.variability.even', 'even');
        case 1:
          return t('label.variability.half', 'halfway');
        case 2:
          return t('label.variability.exponential', 'exponential');
        default:
          throw new Error(`queueing-model 무대: 모르는 들쭉날쭉 ${v}`);
      }
    };

    /** 결론을 걷는다 — 막대 · 처리 막대 · 평균 선 · 줄 그림 · 캡션 · 서버 채움. 점 자리는 남긴다. */
    const clearConclusions = () => {
      cancelAll(false);
      clearChildren(gBars);
      clearChildren(gService);
      clearChildren(gMean);
      clearChildren(gQueue);
      caption.textContent = '';
      serverBox.setAttribute('fill', 'none');
      ring.setAttribute('opacity', '0');
    };

    const drawTicks = (r: QueueingRoundView) => {
      clearChildren(gTicks);
      for (let s = 0; s <= r.axisEnd; s += 10) {
        const x = PLOT_L + (s / r.axisEnd) * PLOT_W;
        el('line', { x1: x, y1: BAND_Y, x2: x, y2: BAND_Y + 4, stroke: colors.border }, gTicks);
        text(x, TICK_Y, String(s), 'middle', gTicks);
      }
      for (let w = 0; w <= r.waitTop; w += 5) {
        const y = BAND_Y - (w / r.waitTop) * CHART_H;
        el('line', { x1: PLOT_L - 4, y1: y, x2: PLOT_L, y2: y, stroke: colors.border }, gTicks);
        text(PLOT_L - 8, y + smPx / 3, String(w), 'end', gTicks);
      }
    };

    const stage: QueueingStage = {
      setRound(r, ms) {
        clearConclusions();
        round = r;
        drawTicks(r);
        caption.textContent = t('caption.ready', '{n} requests on the time strip — one arrives each step', {
          n: r.requests.length,
        });
        const targets = r.requests.map((q) => xOf(q.arrive));
        if (dots.length !== targets.length) {
          clearChildren(gDots);
          dots = targets.map((x) =>
            el('circle', { cx: x, cy: BAND_Y, r: DOT_R, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.5 }, gDots),
          );
          dotX = targets.slice();
          return;
        }
        for (const d of dots) {
          d.setAttribute('fill', colors.bg);
          d.setAttribute('stroke', colors.textMuted);
        }
        const from = dotX.slice();
        animate('dots', ms, (k) => {
          for (let i = 0; i < dots.length; i += 1) {
            const x = from[i]! + (targets[i]! - from[i]!) * k;
            dotX[i] = x;
            dots[i]!.setAttribute('cx', String(x));
          }
        });
      },

      showRequest(q, ms) {
        const r = needRound();
        const dot = dots[q.index];
        const planned = r.requests[q.index];
        if (!dot || !planned) throw new Error(`queueing-model 무대: 요청 ${q.id} 가 이 판에 없다`);
        if (planned.id !== q.id) throw new Error(`queueing-model 무대: ${q.id} 자리에 ${planned.id} 가 있다`);
        if (q.line > r.lineTop) throw new Error(`queueing-model 무대: 줄 ${q.line} 이 칸 수 ${r.lineTop} 를 넘는다`);
        // 점 운동이 아직 돌면 끝 자리로 마무리한다
        const dotsAnim = anims.get('dots');
        if (dotsAnim) {
          cancelAnimationFrame(dotsAnim.frame);
          anims.delete('dots');
          dotsAnim.finish();
        }
        dot.setAttribute('fill', colors.text);
        dot.setAttribute('stroke', colors.text);
        const x = xOf(q.arrive);

        caption.textContent = q.busy
          ? t('caption.waitInLine', '{id}: arrives at {arrive} · waits {wait} · leaves at {depart}', {
              id: q.id,
              arrive: fmt(q.arrive),
              wait: fmt(q.wait),
              depart: fmt(q.depart),
            })
          : t('caption.serveNow', '{id}: arrives at {arrive} · server free, served at once · leaves at {depart}', {
              id: q.id,
              arrive: fmt(q.arrive),
              depart: fmt(q.depart),
            });

        // 지금 요청 고리 — 앞 요청 자리에서 옮겨 온다
        const ringFrom = ring.getAttribute('opacity') === '0' ? x : ringX;
        ring.setAttribute('opacity', '1');
        animate('ring', ms, (k) => {
          ringX = ringFrom + (x - ringFrom) * k;
          ring.setAttribute('cx', String(ringX));
        });

        // 기다림 막대 — 0 에서 자라 오른다
        if (q.wait > 0) {
          const h = hOf(q.wait);
          const bar = el(
            'rect',
            { x: x - BAR_W / 2, y: BAND_Y, width: BAR_W, height: 0, fill: colors.itemComparing },
            gBars,
          );
          animate(`bar:${q.index}`, ms, (k) => {
            bar.setAttribute('y', String(BAND_Y - DOT_R - h * k));
            bar.setAttribute('height', String(h * k));
          });
        }

        // 처리 막대 — 시작에서 떠남까지 그어진다
        const x0 = xOf(q.start);
        const x1 = xOf(q.depart);
        const svc = el(
          'rect',
          { x: x0, y: LANE_Y + 1, width: 0, height: LANE_H - 2, fill: colors.text, stroke: colors.bg, 'stroke-width': 0.75 },
          gService,
        );
        animate(`service:${q.index}`, ms, (k) => {
          svc.setAttribute('width', String(Math.max(0, (x1 - x0) * k)));
        });

        // 도착한 때의 서버와 줄
        clearChildren(gQueue);
        serverBox.setAttribute('fill', q.busy ? colors.text : 'none');
        for (let k = 0; k < q.line; k += 1) {
          el('rect', { x: slotX(k), y: PANEL_Y, width: BOX, height: BOX, rx: 3, fill: colors.textMuted }, gQueue);
        }
        for (let k = q.line; k <= r.lineTop; k += 1) {
          el('rect', { x: slotX(k), y: PANEL_Y, width: BOX, height: BOX, rx: 3, fill: 'none', stroke: colors.border }, gQueue);
        }
        const markerTo = q.busy ? slotX(q.line) : PLOT_L;
        const markerFrom = slotX(r.lineTop + 1);
        const marker = el(
          'rect',
          { x: markerFrom + 3, y: PANEL_Y + 3, width: BOX - 6, height: BOX - 6, rx: 2, fill: colors.accent, stroke: colors.text },
          gQueue,
        );
        animate('marker', ms, (k) => {
          marker.setAttribute('x', String(markerFrom + (markerTo - markerFrom) * k + 3));
        });
      },

      sumUp(s, ms) {
        const r = needRound();
        if (s.variability !== r.variability || s.load !== r.load) {
          throw new Error('queueing-model 무대: 모아 셈의 손잡이 값이 판과 다르다');
        }
        ring.setAttribute('opacity', '0');
        clearChildren(gQueue);
        serverBox.setAttribute('fill', 'none');
        caption.textContent = t('caption.sumUp', '{variability} · ρ {rho}: mean wait {mean} · longest wait {longest}', {
          variability: variabilityName(s.variability),
          rho: String(s.load / 100),
          mean: fmt(s.meanWait),
          longest: fmt(s.maxWait),
        });
        clearChildren(gMean);
        const y = BAND_Y - DOT_R - hOf(s.meanWait);
        const meanLine = el(
          'line',
          { x1: PLOT_L, y1: y, x2: PLOT_L, y2: y, stroke: colors.text, 'stroke-width': 1.5, 'stroke-dasharray': '6 4' },
          gMean,
        );
        const meanLabel = text(PLOT_R, y - 6, t('label.mean', 'mean'), 'end', gMean, colors.text);
        meanLabel.setAttribute('opacity', '0');
        animate('mean', ms, (k) => {
          meanLine.setAttribute('x2', String(PLOT_L + PLOT_W * k));
          if (k >= 1) meanLabel.setAttribute('opacity', '1');
        });
      },

      reset() {
        clearConclusions();
        clearChildren(gDots);
        clearChildren(gTicks);
        dots = [];
        dotX = [];
        ringX = -20;
        round = null;
      },

      destroy() {
        destroyed = true;
        cancelAll(false);
      },
    };
    return stage;
  },
};
