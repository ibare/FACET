/**
 * 재시도와 백오프의 무대 — 틱마다의 찾아옴 기둥이 주인공이다.
 *
 * 가로는 틱 0..axisLastTick 의 기둥 줄, 세로는 한 기둥에 쌓이는 손님 점.
 * 한 걸음(누군가 찾아오는 틱)에서
 *   ① 그 틱의 손님이 세운 차례대로 기둥 칸에 선다 (새 손님은 위에서 떨어지고, 앞서 실패한 손님은 제자리에서 칸을 옮긴다)
 *   ② 받은 손님은 서버로 날아 들어가 사라지고, 실패한 손님은 다음 찾아올 틱의 기둥으로 **호를 그리며 날아간다**
 *   ③ 그 틱의 기둥에는 찾아온 수만큼 자국(받음 · 실패)이 남는다 — 몰림 20 이면 자국 스물
 * 손잡이를 돌리면 장애 구간 바탕이 늘고 줄며, 실패한 점이 떨어지는 기둥이 옮겨 간다.
 *
 * 무대는 셈하지 않는다 — 세운 차례 · 받음/실패 · 다음 틱은 payload 로 받고, 어긋나면 던진다.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { narrowRetryData } from './algorithm.js';

export type StageInit = {
  policyId: string;
  outageFrom: number;
  outageTo: number;
  cap: number;
  axisLastTick: number;
  axisMaxStack: number;
};

export type StageVisit = { id: string; fresh: boolean; served: boolean; next: number | null };

export type StageTick = {
  tick: number;
  up: boolean;
  arrivals: number;
  served: number;
  failed: number;
  visits: StageVisit[];
};

export type RetryStage = ViewInstance & {
  init(p: StageInit, ms: number): void;
  step(p: StageTick, ms: number): void;
  reset(): void;
};

const W = 760;
const H = 560;
const LEFT = 52;
const RIGHT = 12;
const AREA_TOP = 112;
const AREA_BOTTOM = 526;
const SERVER_W = 170;
const SERVER_TOP = 34;
const SERVER_H = 50;
/** 걸음 운동 가운데 손님이 칸에 서는 몫 — 나머지는 날아가는 몫 */
const LINE_UP = 0.3;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Dot = { g: SVGGElement; circle: SVGCircleElement; x: number; y: number };

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const retryAndBackoffStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): RetryStage {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const xs = parseFloat(fontSizes.xs);

    // initialData 는 있으면 같은 좁히개로 확인한다 — 축은 init 이 싣는다.
    if (params.initialData !== undefined) narrowRetryData(params.initialData);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };

    const root = el('g', { 'data-role': 'retry-stage' }, svg);
    const bandLayer = el('g', { 'data-role': 'band' }, root);
    const staticLayer = el('g', { 'data-role': 'axis' }, root);
    const traceLayer = el('g', { 'data-role': 'traces' }, root);
    const dotLayer = el('g', { 'data-role': 'dots' }, root);

    // 쥐는 상태 — init 이 채우고 reset 이 비운다.
    let axis: StageInit | null = null;
    let band: SVGRectElement | null = null;
    let bandLabel: SVGTextElement | null = null;
    let bandFrom = 0;
    let bandTo = 0;
    let marker: SVGRectElement | null = null;
    let markerX = 0;
    let caption: SVGTextElement | null = null;
    let serverBox: SVGRectElement | null = null;
    let serverState: SVGTextElement | null = null;
    const dots = new Map<string, Dot>();
    /** 기둥마다 다음에 찾아올 손님 — 떨어진 차례 */
    const waiting = new Map<number, string[]>();

    let frame: number | null = null;
    let finish: (() => void) | null = null;

    const settle = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const f = finish;
      finish = null;
      if (f) f();
    };

    const animate = (ms: number, draw: (p: number) => void, done: () => void): void => {
      settle();
      if (isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
        draw(1);
        done();
        return;
      }
      finish = () => {
        draw(1);
        done();
      };
      const start = performance.now();
      const loop = (now: number): void => {
        const p = Math.min(1, (now - start) / ms);
        if (p >= 1) {
          frame = null;
          const f = finish;
          finish = null;
          if (f) f();
          return;
        }
        draw(p);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    };

    params.onScrubStart?.(() => settle());

    const need = (): StageInit => {
      if (axis === null) throw new Error('retry-and-backoff-stage: init 앞에 걸음이 왔다');
      return axis;
    };
    const colW = (): number => (W - LEFT - RIGHT) / (need().axisLastTick + 1);
    const pitch = (): number => (AREA_BOTTOM - AREA_TOP) / need().axisMaxStack;
    const radius = (): number => Math.min(colW(), pitch()) / 2 - 0.8;
    const colX = (tick: number): number => LEFT + colW() * (tick + 0.5);
    const slotY = (slot: number): number => AREA_BOTTOM - pitch() * (slot + 0.5);
    const serverX = W / 2;
    const serverY = SERVER_TOP + SERVER_H / 2;

    const place = (d: Dot, x: number, y: number, scale = 1): void => {
      d.g.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${scale.toFixed(3)})`);
    };

    type DotLook = 'fresh' | 'waiting' | 'served' | 'failed';
    const paint = (d: Dot, look: DotLook): void => {
      const label = d.g.querySelector('text');
      if (label === null) throw new Error('retry-and-backoff-stage: 점의 번호 글자가 없다');
      d.g.setAttribute('data-look', look);
      if (look === 'fresh') {
        d.circle.setAttribute('fill', colors.itemDefault);
        d.circle.setAttribute('stroke', colors.text);
        d.circle.removeAttribute('stroke-dasharray');
        label.setAttribute('fill', colors.text);
      } else if (look === 'waiting') {
        d.circle.setAttribute('fill', colors.itemDefault);
        d.circle.setAttribute('stroke', colors.danger);
        d.circle.setAttribute('stroke-dasharray', '3 2');
        label.setAttribute('fill', colors.text);
      } else if (look === 'served') {
        d.circle.setAttribute('fill', colors.itemSorted);
        d.circle.setAttribute('stroke', colors.itemSorted);
        d.circle.removeAttribute('stroke-dasharray');
        label.setAttribute('fill', colors.textInverse);
      } else {
        d.circle.setAttribute('fill', colors.danger);
        d.circle.setAttribute('stroke', colors.danger);
        d.circle.removeAttribute('stroke-dasharray');
        label.setAttribute('fill', colors.stateInk);
      }
    };

    const makeDot = (id: string, x: number, y: number): Dot => {
      const m = /^c(\d+)$/.exec(id);
      if (m === null) throw new Error(`retry-and-backoff-stage: 손님 식별자 모양이 다르다 (${id})`);
      const g = el('g', { 'data-id': id }, dotLayer);
      const circle = el('circle', { cx: 0, cy: 0, r: radius().toFixed(2), 'stroke-width': 1.2 }, g);
      const label = el(
        'text',
        {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': Math.min(xs, radius() * 1.25).toFixed(1),
        },
        g,
      );
      label.textContent = m[1];
      const d: Dot = { g, circle, x, y };
      place(d, x, y);
      dots.set(id, d);
      return d;
    };

    const dropDot = (id: string): void => {
      const d = dots.get(id);
      if (d === undefined) throw new Error(`retry-and-backoff-stage: 지울 점 ${id} 가 없다`);
      d.g.remove();
      dots.delete(id);
    };

    const policyName = (id: string): string => {
      if (id === 'now') return t('label.policy.now', 'Immediately');
      if (id === 'exp') return t('label.policy.exp', 'Exponential');
      if (id === 'jitter') return t('label.policy.jitter', 'Exponential + jitter');
      throw new Error(`retry-and-backoff-stage: 모르는 방식 ${id}`);
    };

    const setServer = (up: boolean): void => {
      if (serverBox === null || serverState === null) throw new Error('retry-and-backoff-stage: 서버 상자가 없다');
      serverBox.setAttribute('stroke', up ? colors.text : colors.danger);
      if (up) serverBox.removeAttribute('stroke-dasharray');
      else serverBox.setAttribute('stroke-dasharray', '5 3');
      serverState.setAttribute('fill', up ? colors.text : colors.danger);
      serverState.textContent = up ? t('label.up', 'up') : t('label.down', 'down');
    };

    const drawBand = (from: number, to: number): void => {
      if (band === null || bandLabel === null) throw new Error('retry-and-backoff-stage: 장애 바탕이 없다');
      const x0 = LEFT + colW() * from;
      const x1 = LEFT + colW() * (to + 1);
      band.setAttribute('x', x0.toFixed(2));
      band.setAttribute('width', Math.max(0, x1 - x0).toFixed(2));
      bandLabel.setAttribute('x', ((x0 + x1) / 2).toFixed(2));
    };

    const clearDynamic = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      finish = null;
      for (const d of dots.values()) d.g.remove();
      dots.clear();
      waiting.clear();
      traceLayer.replaceChildren();
    };

    const reset = (): void => {
      clearDynamic();
      staticLayer.replaceChildren();
      bandLayer.replaceChildren();
      axis = null;
      band = null;
      bandLabel = null;
      marker = null;
      caption = null;
      serverBox = null;
      serverState = null;
    };

    /** 뼈대 — 축 · 감당 선 · 서버 · 범례 · 캡션. 판 머리마다 다시 짓는다 (멱등). */
    const buildStatic = (p: StageInit): void => {
      staticLayer.replaceChildren();
      caption = el(
        'text',
        { x: 12, y: 18, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text, 'data-role': 'caption' },
        staticLayer,
      );
      // 서버
      serverBox = el(
        'rect',
        {
          x: serverX - SERVER_W / 2,
          y: SERVER_TOP,
          width: SERVER_W,
          height: SERVER_H,
          rx: 6,
          fill: colors.bgSubtle,
          'stroke-width': 1.5,
          'data-role': 'server',
        },
        staticLayer,
      );
      const serverName = el(
        'text',
        {
          x: serverX,
          y: SERVER_TOP + 18,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        staticLayer,
      );
      serverName.textContent = t('label.server', 'Server');
      serverState = el(
        'text',
        {
          x: serverX,
          y: SERVER_TOP + 38,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          'data-role': 'server-state',
        },
        staticLayer,
      );
      setServer(true);
      // 범례
      const legendY = SERVER_TOP + 12;
      const legendX = W - 150;
      const legend: { look: 'served' | 'failed' | 'waiting'; text: string }[] = [
        { look: 'served', text: t('label.served', 'served') },
        { look: 'failed', text: t('label.failed', 'failed') },
        { look: 'waiting', text: t('label.retry', 'coming back') },
      ];
      legend.forEach((item, i) => {
        const y = legendY + i * 17;
        const c = el('circle', { cx: legendX, cy: y, r: 6, 'stroke-width': 1.2 }, staticLayer);
        if (item.look === 'served') {
          c.setAttribute('fill', colors.itemSorted);
          c.setAttribute('stroke', colors.itemSorted);
        } else if (item.look === 'failed') {
          c.setAttribute('fill', colors.danger);
          c.setAttribute('stroke', colors.danger);
        } else {
          c.setAttribute('fill', colors.itemDefault);
          c.setAttribute('stroke', colors.danger);
          c.setAttribute('stroke-dasharray', '3 2');
        }
        const tx = el(
          'text',
          {
            x: legendX + 12,
            y,
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          staticLayer,
        );
        tx.textContent = item.text;
      });
      // 기둥 바닥 · 틱 눈금
      el(
        'line',
        { x1: LEFT, x2: W - RIGHT, y1: AREA_BOTTOM, y2: AREA_BOTTOM, stroke: colors.border, 'stroke-width': 1 },
        staticLayer,
      );
      for (let tick = 0; tick <= p.axisLastTick; tick++) {
        const label = el(
          'text',
          {
            x: colX(tick),
            y: AREA_BOTTOM + 16,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          staticLayer,
        );
        label.textContent = String(tick);
      }
      const tickName = el(
        'text',
        { x: 8, y: AREA_BOTTOM + 16, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted },
        staticLayer,
      );
      tickName.textContent = t('label.tick', 'tick');
      // 감당 선
      const capY = AREA_BOTTOM - pitch() * p.cap;
      el(
        'line',
        {
          x1: LEFT,
          x2: W - RIGHT,
          y1: capY,
          y2: capY,
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '4 3',
          'data-role': 'cap-line',
        },
        staticLayer,
      );
      const capLabel = el(
        'text',
        {
          x: 8,
          y: capY,
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        staticLayer,
      );
      capLabel.textContent = t('label.cap', 'cap: {n}', { n: p.cap });
      // 지금 틱 표지
      marker = el(
        'rect',
        {
          x: LEFT,
          y: AREA_TOP - 4,
          width: colW(),
          height: AREA_BOTTOM - AREA_TOP + 8,
          rx: 3,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
          visibility: 'hidden',
          'data-role': 'now',
        },
        staticLayer,
      );
    };

    const init = (p: StageInit, ms: number): void => {
      if (p.axisLastTick < p.outageTo || p.outageFrom > p.outageTo) {
        throw new Error('retry-and-backoff-stage: 장애 구간이 축 밖이거나 뒤집혔다');
      }
      if (p.cap > p.axisMaxStack) throw new Error('retry-and-backoff-stage: 감당이 기둥보다 높다');
      policyName(p.policyId);
      clearDynamic();
      axis = p;
      buildStatic(p);
      if (caption === null) throw new Error('retry-and-backoff-stage: 캡션이 없다');
      caption.textContent = t('caption.start', '{policy} · outage: ticks {from}–{to} · nobody has come yet', {
        policy: policyName(p.policyId),
        from: p.outageFrom,
        to: p.outageTo,
      });
      markerX = colX(0);
      // 장애 바탕 — 앞 판의 구간에서 새 구간으로 늘고 준다.
      const firstBand = band === null;
      if (band === null || bandLabel === null) {
        band = el(
          'rect',
          {
            y: AREA_TOP,
            height: AREA_BOTTOM - AREA_TOP,
            fill: colors.danger,
            'fill-opacity': 0.09,
            'data-role': 'outage',
          },
          bandLayer,
        );
        bandLabel = el(
          'text',
          {
            y: AREA_TOP - 8,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.danger,
          },
          bandLayer,
        );
        bandLabel.textContent = t('label.outage', 'outage');
      }
      const fromA = firstBand ? p.outageFrom : bandFrom;
      const toA = firstBand ? p.outageTo : bandTo;
      bandFrom = p.outageFrom;
      bandTo = p.outageTo;
      animate(
        ms,
        (q) => {
          const e = ease(q);
          drawBand(fromA + (p.outageFrom - fromA) * e, toA + (p.outageTo - toA) * e);
        },
        () => drawBand(p.outageFrom, p.outageTo),
      );
    };

    const step = (s: StageTick, ms: number): void => {
      const p = need();
      settle();
      if (s.tick < 0 || s.tick > p.axisLastTick) throw new Error(`retry-and-backoff-stage: 틱 ${s.tick} 가 축 밖이다`);
      if (s.visits.length !== s.arrivals || s.served + s.failed !== s.arrivals) {
        throw new Error(`retry-and-backoff-stage: 틱 ${s.tick} 의 찾아옴 · 받음 · 실패 수가 맞지 않는다`);
      }
      if (s.arrivals > p.axisMaxStack) throw new Error(`retry-and-backoff-stage: 틱 ${s.tick} 의 찾아옴이 기둥보다 많다`);
      if (s.served > p.cap) throw new Error(`retry-and-backoff-stage: 틱 ${s.tick} 에 감당보다 많이 받았다`);
      if (!s.up && s.served > 0) throw new Error(`retry-and-backoff-stage: 죽은 틱 ${s.tick} 에 받았다`);
      if (marker === null || caption === null) throw new Error('retry-and-backoff-stage: 뼈대가 없다');

      // 이 틱에 기다리던 손님은 모두 찾아와야 한다.
      const expected = waiting.has(s.tick) ? waiting.get(s.tick) : [];
      if (expected === undefined) throw new Error('retry-and-backoff-stage: 기다림 목록이 비었다');
      const comingBack = s.visits.filter((v) => !v.fresh).map((v) => v.id);
      if (expected.length !== comingBack.length || !expected.every((id) => comingBack.includes(id))) {
        throw new Error(`retry-and-backoff-stage: 틱 ${s.tick} 에 기다리던 손님과 다시 온 손님이 다르다`);
      }
      waiting.delete(s.tick);

      setServer(s.up);
      caption.textContent = t('caption.tick', 'Tick {tick} · arrived: {n} · served: {served} · failed: {failed}', {
        tick: s.tick,
        n: s.arrivals,
        served: s.served,
        failed: s.failed,
      });
      marker.setAttribute('visibility', 'visible');

      // ① 칸에 서기 — 세운 차례의 i 번째가 아래에서 i 번째 칸
      const x = colX(s.tick);
      const r = radius();
      const lineUp: { dot: Dot; x0: number; y0: number; y1: number }[] = [];
      s.visits.forEach((v, i) => {
        let dot = dots.get(v.id);
        if (v.fresh) {
          if (dot !== undefined) throw new Error(`retry-and-backoff-stage: 처음 온 손님 ${v.id} 가 이미 무대에 있다`);
          dot = makeDot(v.id, x, AREA_TOP - r);
          paint(dot, 'fresh');
        } else if (dot === undefined) {
          throw new Error(`retry-and-backoff-stage: 다시 온 손님 ${v.id} 가 무대에 없다`);
        }
        lineUp.push({ dot, x0: dot.x, y0: dot.y, y1: slotY(i) });
      });

      // ② 날아가기 — 받은 손님은 서버로, 실패한 손님은 다음 틱 기둥으로
      type Flight = { dot: Dot; id: string; x0: number; y0: number; x1: number; y1: number; cy: number; served: boolean };
      const flights: Flight[] = [];
      s.visits.forEach((v, i) => {
        const dot = dots.get(v.id);
        if (dot === undefined) throw new Error(`retry-and-backoff-stage: 손님 ${v.id} 가 무대에 없다`);
        const y0 = slotY(i);
        if (v.served) {
          if (v.next !== null) throw new Error(`retry-and-backoff-stage: 받은 손님 ${v.id} 에 다음 틱이 있다`);
          flights.push({ dot, id: v.id, x0: x, y0, x1: serverX, y1: serverY, cy: (y0 + serverY) / 2, served: true });
          return;
        }
        if (v.next === null || v.next <= s.tick || v.next > p.axisLastTick) {
          throw new Error(`retry-and-backoff-stage: 실패한 손님 ${v.id} 의 다음 틱이 맞지 않는다 (${String(v.next)})`);
        }
        let column = waiting.get(v.next);
        if (column === undefined) {
          column = [];
          waiting.set(v.next, column);
        }
        if (column.length >= p.axisMaxStack) throw new Error(`retry-and-backoff-stage: 틱 ${v.next} 기둥이 넘친다`);
        const slot = column.length;
        column.push(v.id);
        const x1 = colX(v.next);
        const y1 = slotY(slot);
        const lift = 36 + 0.12 * Math.abs(x1 - x);
        const cy = Math.max(AREA_TOP - 30, Math.min(y0, y1) - lift);
        flights.push({ dot, id: v.id, x0: x, y0, x1, y1, cy, served: false });
      });
      const servedCount = flights.filter((f) => f.served).length;
      if (servedCount !== s.served) throw new Error(`retry-and-backoff-stage: 틱 ${s.tick} 의 받음 수가 맞지 않는다`);

      // 자국 — 그 틱에 찾아온 수만큼 기둥에 남는다
      const leaveTraces = (): void => {
        s.visits.forEach((v, i) => {
          const c = el(
            'circle',
            {
              cx: x.toFixed(2),
              cy: slotY(i).toFixed(2),
              r: (r * 0.62).toFixed(2),
              'data-tick': s.tick,
              'data-trace': v.served ? 'served' : 'failed',
            },
            traceLayer,
          );
          if (v.served) {
            // 범례 · 서버로 드는 점과 같은 색
            c.setAttribute('fill', colors.itemSorted);
            c.setAttribute('stroke', 'none');
          } else {
            // 기다리는 점(점선 고리 · 번호)과 갈리게 — 채운 붉은 자국
            c.setAttribute('fill', colors.danger);
            c.setAttribute('fill-opacity', '0.55');
            c.setAttribute('stroke', colors.danger);
            c.setAttribute('stroke-width', '1');
          }
        });
      };

      const markerFrom = markerX;
      let judged = false;
      const judge = (): void => {
        if (judged) return;
        judged = true;
        for (const f of flights) paint(f.dot, f.served ? 'served' : 'failed');
        leaveTraces();
      };
      const drawAt = (q: number): void => {
        const a = Math.min(1, q / LINE_UP);
        const ea = ease(a);
        marker?.setAttribute('x', (markerFrom + (x - markerFrom) * ea - colW() / 2).toFixed(2));
        if (q < LINE_UP) {
          for (const l of lineUp) {
            const nx = l.x0 + (x - l.x0) * ea;
            const ny = l.y0 + (l.y1 - l.y0) * ea;
            l.dot.x = nx;
            l.dot.y = ny;
            place(l.dot, nx, ny);
          }
          return;
        }
        judge();
        const b = ease((q - LINE_UP) / (1 - LINE_UP));
        for (const f of flights) {
          const u = 1 - b;
          const nx = u * u * f.x0 + 2 * u * b * ((f.x0 + f.x1) / 2) + b * b * f.x1;
          const ny = u * u * f.y0 + 2 * u * b * f.cy + b * b * f.y1;
          f.dot.x = nx;
          f.dot.y = ny;
          place(f.dot, nx, ny, f.served ? 1 - 0.7 * b : 1);
        }
      };
      animate(ms, drawAt, () => {
        judge();
        markerX = x;
        marker?.setAttribute('x', (x - colW() / 2).toFixed(2));
        for (const f of flights) {
          if (f.served) {
            dropDot(f.id);
          } else {
            f.dot.x = f.x1;
            f.dot.y = f.y1;
            place(f.dot, f.x1, f.y1);
            paint(f.dot, 'waiting');
          }
        }
      });
    };

    return {
      init,
      step,
      reset,
      destroy(): void {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        finish = null;
        root.remove();
      },
    };
  },
};
