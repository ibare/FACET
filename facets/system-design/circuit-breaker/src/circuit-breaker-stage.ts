/**
 * 서킷 브레이커 무대.
 *
 * 위 — 부르는 쪽 → 브레이커(스위치) → 서비스의 가로 길. 부름 점이 이 길을 가다 **멈추는 자리**가
 * 결과다: 브레이커에서 멈추면 막힘, 서비스까지 가면 답함이나 시간 초과. 스위치는 모양(지렛대의 각)으로
 * 닫힘 · 반열림 · 열림을 가르고, 그 아래 열림 기다림 막대가 차오르다 반열림에서 가득 차고 시험 부름이
 * 실패하면 비워진다.
 * 아래 — 틱 0..23 의 자국 줄. 서비스 줄(닿은 부름)과 브레이커 줄(막힌 부름) 두 줄이라, 문턱 · 기다림을
 * 돌리면 자국이 어느 줄에 떨어지는지가 옮겨 간다. 건강 띠(삐끗 · 죽음)는 그 뒤 바탕.
 *
 * 무대는 알고리즘의 셈을 다시 하지 않는다 — 상태 · 잇단 실패 · 막대 칸 · 결과는 모두 payload 로 받는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type StageHealth = 'up' | 'blip' | 'down';
export type StageState = 'closed' | 'open' | 'half_open';

export type StageInit = {
  service: string;
  ticks: number;
  health: StageHealth[];
  back: number;
  threshold: number;
  wait: number;
  maxWait: number;
};

export type StageCall = {
  tick: number;
  health: StageHealth;
  halfOpened: boolean;
  probe: boolean;
  outcome: 'answered' | 'timeout' | 'blocked';
  state: StageState;
  fails: number;
  fill: number;
  back: number;
  closedAgain: boolean;
  recovered: boolean;
};

export type CircuitBreakerStage = ViewInstance & {
  init(p: StageInit): void;
  call(p: StageCall, motionMs: number): void;
  reset(): void;
};

const W = 760;
const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 가로 길
const ROAD_Y = 64;
const CALLER_X0 = 20;
const CALLER_X1 = 132;
const SW_L = 320;
const LEVER = 100;
const SW_R = SW_L + LEVER;
const SVC_X0 = 560;
const SVC_X1 = 740;
// 지렛대 각 (라디안, 위로 들린다)
const ANGLE: Record<StageState, number> = { closed: 0, half_open: (-12 * Math.PI) / 180, open: (-28 * Math.PI) / 180 };
// 기다림 막대
const BAR_X = SW_L;
const BAR_Y = 128;
const CELL = 14;
const CELL_PITCH = 16;
// 자국 줄
const TRACK_X0 = 70;
const PITCH = 28;
const SVC_LANE_Y = 200;
const BRK_LANE_Y = 240;
const BAND_Y0 = 180;
const BAND_Y1 = 258;

const colX = (tick: number): number => TRACK_X0 + tick * PITCH + PITCH / 2;
const fillWidth = (x: number): number => Math.max(0, x * CELL_PITCH - (x > 0 ? CELL_PITCH - CELL : 0));
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
/** 0..1 진행률의 [from, to] 구간을 0..1 로 편다. */
const span = (p: number, from: number, to: number): number => Math.min(1, Math.max(0, (p - from) / (to - from)));

export const circuitBreakerStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): CircuitBreakerStage {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);

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
    const text = (x: number, y: number, s: string, opts: Record<string, string | number>, parent: Element): SVGTextElement => {
      const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text, ...opts }, parent);
      node.textContent = s;
      return node;
    };

    // ── 고정 뼈대 (마운트 때 한 번)
    const root = el('g', {}, svg);
    const road = el('g', {}, root);
    el('rect', { x: CALLER_X0, y: ROAD_Y - 20, width: CALLER_X1 - CALLER_X0, height: 40, rx: 6, fill: colors.bgSubtle, stroke: colors.border }, road);
    text((CALLER_X0 + CALLER_X1) / 2, ROAD_Y + 4, t('label.caller', 'Caller'), { 'text-anchor': 'middle' }, road);
    el('line', { x1: CALLER_X1, y1: ROAD_Y, x2: SW_L, y2: ROAD_Y, stroke: colors.border, 'stroke-width': 2 }, road);
    el('line', { x1: SW_R, y1: ROAD_Y, x2: SVC_X0, y2: ROAD_Y, stroke: colors.border, 'stroke-width': 2 }, road);
    text(SW_L - 14, ROAD_Y - 10, t('label.breaker', 'Breaker'), { 'text-anchor': 'end', fill: colors.textMuted, 'font-size': fontSizes.xs }, road);
    const lever = el('line', { x1: SW_L, y1: ROAD_Y, x2: SW_R, y2: ROAD_Y, stroke: colors.text, 'stroke-width': 4, 'stroke-linecap': 'round' }, road);
    el('circle', { cx: SW_L, cy: ROAD_Y, r: 6, fill: colors.bg, stroke: colors.text, 'stroke-width': 2 }, road);
    el('circle', { cx: SW_R, cy: ROAD_Y, r: 6, fill: colors.bg, stroke: colors.text, 'stroke-width': 2 }, road);
    const stateLabel = text((SW_L + SW_R) / 2, ROAD_Y + 36, '', { 'text-anchor': 'middle', 'font-weight': 600, 'font-size': fontSizes.md }, road);
    const failsLabel = text((SW_L + SW_R) / 2, ROAD_Y + 54, '', { 'text-anchor': 'middle', fill: colors.textMuted, 'font-size': fontSizes.xs }, road);
    const svcBox = el('rect', { x: SVC_X0, y: ROAD_Y - 28, width: SVC_X1 - SVC_X0, height: 56, rx: 6, fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5 }, road);
    const svcName = text((SVC_X0 + SVC_X1) / 2, ROAD_Y - 6, '', { 'text-anchor': 'middle', 'font-family': fonts.mono }, road);
    const svcHealth = text((SVC_X0 + SVC_X1) / 2, ROAD_Y + 14, '', { 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: colors.textMuted }, road);

    // 기다림 막대 — 칸은 판마다 다시 짓는다
    const barLabel = text(BAR_X - 10, BAR_Y + CELL - 3, t('label.wait', 'Open wait'), { 'text-anchor': 'end', fill: colors.textMuted, 'font-size': fontSizes.xs }, root);
    const barFill = el('rect', { x: BAR_X, y: BAR_Y, width: 0, height: CELL, fill: colors.itemComparing }, root);
    const barCells = el('g', {}, root);

    // 자국 줄
    text(TRACK_X0 - 8, SVC_LANE_Y + 4, t('label.service', 'Service'), { 'text-anchor': 'end', 'font-size': fontSizes.xs, fill: colors.textMuted }, root);
    text(TRACK_X0 - 8, BRK_LANE_Y + 4, t('label.breaker', 'Breaker'), { 'text-anchor': 'end', 'font-size': fontSizes.xs, fill: colors.textMuted }, root);
    const band = el('g', {}, root);
    const laneLines = el('g', {}, root);
    const cursor = el('rect', { x: 0, y: BAND_Y0, width: PITCH, height: BAND_Y1 - BAND_Y0, fill: 'none', stroke: colors.accent, 'stroke-width': 2, rx: 3, visibility: 'hidden' }, root);
    const marks = el('g', {}, root);
    const tickNums = el('g', {}, root);

    // 범례 — 자국 모양이 무엇을 뜻하는지
    const legend = el('g', {}, root);
    const LEG_Y = 292;
    let lx = TRACK_X0;
    const legendItem = (draw: (g: SVGGElement, cx: number, cy: number) => void, label: string): void => {
      const g = el('g', {}, legend);
      draw(g, lx + 6, LEG_Y);
      text(lx + 18, LEG_Y + 4, label, { 'font-size': fontSizes.xs, fill: colors.textMuted }, g);
      lx += 30 + label.length * parseFloat(fontSizes.xs) * 0.9;
    };

    // 떠다니는 부름 점
    const dot = el('g', { visibility: 'hidden' }, root);
    el('circle', { cx: 0, cy: 0, r: 6, fill: colors.primary }, dot);
    const dotRing = el('polygon', { points: '0,-11 11,0 0,11 -11,0', fill: 'none', stroke: colors.itemPivot, 'stroke-width': 2, visibility: 'hidden' }, dot);

    const caption = text(TRACK_X0, 318, '', { 'font-size': fontSizes.sm }, root);
    const status = text(TRACK_X0, 334, '', { 'font-size': fontSizes.xs, fill: colors.textMuted }, root);

    // ── 자국 모양
    const drawMark = (parent: Element, cx: number, cy: number, outcome: StageCall['outcome'], probe: boolean): void => {
      if (outcome === 'answered') el('circle', { cx, cy, r: 5, fill: colors.text }, parent);
      else if (outcome === 'timeout') {
        el('line', { x1: cx - 5, y1: cy - 5, x2: cx + 5, y2: cy + 5, stroke: colors.danger, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, parent);
        el('line', { x1: cx - 5, y1: cy + 5, x2: cx + 5, y2: cy - 5, stroke: colors.danger, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, parent);
      } else el('rect', { x: cx - 7, y: cy - 2, width: 14, height: 4, rx: 1, fill: colors.textMuted }, parent);
      if (probe) {
        el('polygon', { points: `${cx},${cy - 11} ${cx + 11},${cy} ${cx},${cy + 11} ${cx - 11},${cy}`, fill: 'none', stroke: colors.itemPivot, 'stroke-width': 2 }, parent);
      }
    };
    legendItem((g, cx, cy) => drawMark(g, cx, cy, 'answered', false), t('legend.answered', 'Answered'));
    legendItem((g, cx, cy) => drawMark(g, cx, cy, 'timeout', false), t('legend.timeout', 'Timeout'));
    legendItem((g, cx, cy) => drawMark(g, cx, cy, 'blocked', false), t('legend.blocked', 'Blocked'));
    legendItem((g, cx, cy) => el('polygon', { points: `${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`, fill: 'none', stroke: colors.itemPivot, 'stroke-width': 2 }, g), t('legend.probe', 'Trial call'));

    // ── 지금 보이는 운동의 기억
    let angle = ANGLE.closed;
    let fillCells = 0;
    let threshold = 0;
    let frame: number | null = null;
    let finish: (() => void) | null = null;
    let cursorX: number | null = null;
    let known: StageInit | null = null;
    let closedAtTick: number | null = null;

    const stateName = (s: StageState): string =>
      s === 'closed' ? t('label.closed', 'Closed') : s === 'open' ? t('label.open', 'Open') : t('label.halfOpen', 'Half-open');
    const healthName = (h: StageHealth): string =>
      h === 'up' ? t('label.up', 'Up') : h === 'blip' ? t('label.blip', 'Blip') : t('label.down', 'Down');

    const setLever = (a: number, s: StageState | null): void => {
      angle = a;
      lever.setAttribute('x2', String(SW_L + LEVER * Math.cos(a)));
      lever.setAttribute('y2', String(ROAD_Y + LEVER * Math.sin(a)));
      if (s !== null) lever.setAttribute('stroke', s === 'closed' ? colors.text : s === 'open' ? colors.itemSwapping : colors.itemComparing);
    };
    const setFill = (x: number): void => {
      fillCells = x;
      barFill.setAttribute('width', String(fillWidth(x)));
    };
    const setState = (s: StageState, fails: number): void => {
      stateLabel.textContent = stateName(s);
      failsLabel.textContent = t('label.fails', 'Failures in a row: {n} / {k}', { n: fails, k: threshold });
    };
    const setServiceHealth = (h: StageHealth | null): void => {
      svcHealth.textContent = h === null ? '' : healthName(h);
      svcBox.setAttribute('stroke', h === 'down' ? colors.danger : h === 'blip' ? colors.itemComparing : colors.text);
      svcBox.setAttribute('stroke-dasharray', h === 'down' ? '6 4' : h === 'blip' ? '2 3' : '');
    };

    /** 돌던 운동을 끊는다. finishIt 이면 끝 그림으로 건너뛴다. */
    const stopMotion = (finishIt: boolean): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const f = finish;
      finish = null;
      if (finishIt && f) f();
      dot.setAttribute('visibility', 'hidden');
    };

    const clearAll = (): void => {
      stopMotion(false);
      marks.replaceChildren();
      band.replaceChildren();
      laneLines.replaceChildren();
      tickNums.replaceChildren();
      barCells.replaceChildren();
      setLever(ANGLE.closed, 'closed');
      setFill(0);
      cursor.setAttribute('visibility', 'hidden');
      cursorX = null;
      stateLabel.textContent = '';
      failsLabel.textContent = '';
      svcName.textContent = '';
      setServiceHealth(null);
      caption.textContent = '';
      status.textContent = '';
      barLabel.setAttribute('visibility', 'hidden');
      known = null;
      closedAtTick = null;
    };

    params.onScrubStart?.(() => stopMotion(true));

    const init = (p: StageInit): void => {
      // 멱등 — 들어오면 비우고 다시 짓는다
      clearAll();
      known = p;
      threshold = p.threshold;
      svcName.textContent = p.service;
      barLabel.setAttribute('visibility', 'visible');
      for (let i = 0; i < p.wait; i += 1) {
        el('rect', { x: BAR_X + i * CELL_PITCH, y: BAR_Y, width: CELL, height: CELL, fill: 'none', stroke: colors.border, 'stroke-width': 1.5 }, barCells);
      }
      // 건강 띠 — 구간마다 바탕과 이름
      let i = 0;
      while (i < p.ticks) {
        const h = p.health[i];
        if (h === undefined) throw new Error(`circuit-breaker 무대: 틱 ${i} 의 건강이 없다`);
        let j = i;
        while (j + 1 < p.ticks && p.health[j + 1] === h) j += 1;
        if (h !== 'up') {
          const x0 = TRACK_X0 + i * PITCH;
          const w = (j - i + 1) * PITCH;
          el('rect', { x: x0, y: BAND_Y0, width: w, height: BAND_Y1 - BAND_Y0, fill: h === 'down' ? colors.danger : colors.itemComparing, 'fill-opacity': h === 'down' ? 0.13 : 0.16 }, band);
          el('line', { x1: x0, y1: BAND_Y0, x2: x0 + w, y2: BAND_Y0, stroke: h === 'down' ? colors.danger : colors.itemComparing, 'stroke-width': 2, 'stroke-dasharray': h === 'down' ? '6 4' : '2 3' }, band);
          text(x0 + w / 2, BAND_Y0 - 6, healthName(h), { 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: colors.textMuted }, band);
        }
        i = j + 1;
      }
      for (const y of [SVC_LANE_Y, BRK_LANE_Y]) {
        el('line', { x1: TRACK_X0, y1: y, x2: TRACK_X0 + p.ticks * PITCH, y2: y, stroke: colors.border, 'stroke-dasharray': '1 4' }, laneLines);
      }
      for (let tick = 0; tick < p.ticks; tick += 1) {
        text(colX(tick), BAND_Y1 + 14, String(tick), { 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: tick === p.back ? colors.text : colors.textMuted, 'font-weight': tick === p.back ? 700 : 400 }, tickNums);
      }
      setState('closed', 0);
      caption.textContent = t('caption.start', 'Threshold {k} · open wait {w} ticks — the breaker starts closed.', { k: p.threshold, w: p.wait });
    };

    const captionFor = (c: StageCall): string => {
      if (c.outcome === 'blocked') return t('caption.block', 'Tick {tick}: open — the call stops at the breaker and never reaches the service.', { tick: c.tick });
      if (c.probe) {
        return c.state === 'closed'
          ? t('caption.probeOk', 'Tick {tick}: half-open — the trial call is answered, closed again.', { tick: c.tick })
          : t('caption.probeFail', 'Tick {tick}: half-open — the trial call times out, open again and the wait starts over.', { tick: c.tick });
      }
      if (c.outcome === 'answered') return t('caption.reset', 'Tick {tick}: the service answers — the failure streak goes back to 0.', { tick: c.tick });
      return c.state === 'open'
        ? t('caption.trip', 'Tick {tick}: a timeout reaches the threshold — the breaker opens.', { tick: c.tick })
        : t('caption.count', 'Tick {tick}: timeout — still below the threshold.', { tick: c.tick });
    };

    const call = (c: StageCall, motionMs: number): void => {
      const p = known;
      if (p === null) throw new Error('circuit-breaker 무대: breaker-init 없이 부름이 왔다');
      if (c.tick < 0 || c.tick >= p.ticks) throw new Error(`circuit-breaker 무대: 틱 ${c.tick} 이 판 밖이다`);
      if (c.fill < 0 || c.fill > p.wait) throw new Error(`circuit-breaker 무대: 막대 칸 ${c.fill} 이 기다림 ${p.wait} 밖이다`);
      stopMotion(true);

      setServiceHealth(c.health);
      caption.textContent = captionFor(c);
      if (c.closedAgain) closedAtTick = c.tick;
      status.textContent = !c.recovered
        ? ''
        : closedAtTick !== null
          ? t('caption.closedAt', 'Service back at tick {back} — closed again at tick {tick}.', { back: c.back, tick: closedAtTick })
          : t('caption.notClosed', 'Service back since tick {back} — breaker not closed yet.', { back: c.back });

      const fromAngle = angle;
      const fromFill = fillCells;
      const toAngle = ANGLE[c.state];
      const peakFill = c.halfOpened ? p.wait : null;
      const stopX = c.outcome === 'blocked' ? SW_L - 10 : SVC_X0;
      const laneY = c.outcome === 'blocked' ? BRK_LANE_Y : SVC_LANE_Y;
      const cx = colX(c.tick);
      const fromCursor = cursorX ?? cx;
      cursor.setAttribute('visibility', 'visible');
      dotRing.setAttribute('visibility', c.probe ? 'visible' : 'hidden');

      const draw = (q: number): void => {
        // 커서가 이 틱으로 옮겨 간다
        const cur = lerp(fromCursor, cx, span(q, 0, 0.3));
        cursor.setAttribute('x', String(cur - PITCH / 2));
        // 부름 점 — 멈추는 자리까지 간 뒤 자국 줄의 제 칸으로 떨어진다
        const a = span(q, 0, 0.55);
        const b = span(q, 0.55, 1);
        const x = b > 0 ? lerp(stopX, cx, b) : lerp(CALLER_X1, stopX, a);
        const y = b > 0 ? lerp(ROAD_Y, laneY, b) : ROAD_Y;
        dot.setAttribute('transform', `translate(${x},${y})`);
        // 지렛대와 막대
        if (peakFill !== null) {
          setLever(lerp(fromAngle, ANGLE.half_open, span(q, 0, 0.3)), q < 0.55 ? 'half_open' : c.state);
          if (q >= 0.55) setLever(lerp(ANGLE.half_open, toAngle, span(q, 0.55, 0.85)), c.state);
          setFill(q < 0.55 ? lerp(fromFill, peakFill, span(q, 0, 0.3)) : lerp(peakFill, c.fill, span(q, 0.55, 0.85)));
        } else {
          setLever(lerp(fromAngle, toAngle, span(q, 0.55, 0.85)), q < 0.55 ? null : c.state);
          setFill(lerp(fromFill, c.fill, span(q, 0, 0.3)));
        }
      };
      const end = (): void => {
        draw(1);
        cursorX = cx;
        setLever(toAngle, c.state);
        setFill(c.fill);
        setState(c.state, c.fails);
        dot.setAttribute('visibility', 'hidden');
        drawMark(marks, cx, laneY, c.outcome, c.probe);
      };

      if (isInstant() || motionMs <= 0) {
        end();
        return;
      }
      dot.setAttribute('visibility', 'visible');
      const start = performance.now();
      finish = end;
      const tickFrame = (now: number): void => {
        const q = Math.min(1, (now - start) / motionMs);
        if (q >= 1 || isInstant()) {
          frame = null;
          finish = null;
          end();
          return;
        }
        draw(q);
        frame = requestAnimationFrame(tickFrame);
      };
      frame = requestAnimationFrame(tickFrame);
    };

    return {
      init,
      call,
      reset: clearAll,
      destroy(): void {
        stopMotion(false);
        root.remove();
      },
    };
  },
};
