/**
 * 반열림 시험 부름의 무대.
 *
 * 위 — 부르는 쪽 · 브레이커 · 서비스가 한 줄 전선에 걸린다. 브레이커는 스위치 막대로 그린다:
 *      열림은 크게 들린 막대, 반열림은 반쯤 내린 막대, 닫힘은 전선에 붙은 막대.
 *      막힌 부름은 브레이커 아래로 떨어지고, 시험 부름은 서비스 앞까지 가서 답을 기다린다.
 * 아래 — 초 단위 시간 축. 시계 바늘이 사건 시각으로 흐르고, 상태 띠가 그 뒤를 칠한다.
 *      열림 구간은 반열림 예정 시각까지 빈 틀로 먼저 서고 시계가 흐르며 찬다 — 시험 부름이 실패하면
 *      새 빈 틀이 그 시각에서 다시 선다.
 *
 * 걸음마다 운동은 두 토막이다: 시계가 사건 시각까지 흐르고(앞 35%), 사건이 일어난다(뒤 65%).
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView } from '@ffacet/core/runtime';
import type { BreakerState } from './algorithm.js';
import type { CallMark, HalfOpenScene } from './scene.js';

const H = 316;
const MOTION_MS = 400;
const FRAME_MS = 16;
/** 운동 가운데 시계가 흐르는 몫 */
const CLOCK_END = 0.35;

const SVG_NS = 'http://www.w3.org/2000/svg';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** 좌표 · 글자에 쓰는 반올림 — 부동소수 끝자리와 -0 을 걷는다 */
const r2 = (v: number): number => {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
};
/** 시각 표시 — 소수 첫째 자리까지 */
const secs = (v: number): string => {
  const x = Math.round(v * 10) / 10;
  return String(Object.is(x, -0) ? 0 : x);
};

/** 상태별 막대 각도 (도). 들린 만큼 음수 */
function leverAngle(s: BreakerState): number {
  switch (s) {
    case 'open':
      return -24;
    case 'half_open':
      return -10;
    case 'closed':
      return 0;
  }
}

export const halfOpenProbeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const pal = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    const pxMd = parseFloat(fontSizes.md);
    const pxSm = parseFloat(fontSizes.sm);
    const pxXs = parseFloat(fontSizes.xs);

    // ── 자리: 캔버스 폭에서 역산한다
    const margin = Math.round(W * 0.032);
    const boxW = Math.min(96, Math.round(W * 0.15));
    const laneTop = 66;
    const laneBottom = 150;
    const headH = 24;
    const wireY = 136;
    const callerX0 = margin;
    const callerX1 = margin + boxW;
    const serviceX1 = W - margin;
    const serviceX0 = serviceX1 - boxW;
    const breakerCx = W / 2;
    const breakerHalf = Math.min(80, Math.round(W * 0.12));
    const breakerX0 = breakerCx - breakerHalf;
    const breakerX1 = breakerCx + breakerHalf;
    const pivotX = breakerX0 + 34;
    const contactX = breakerX1 - 34;
    const leverLen = contactX - pivotX;
    const startX = callerX1 + 10;
    const flightX = serviceX0 - 12;
    const trayY = 172;
    const trayGap = 20;
    const readY1 = 194;
    const readY2 = 210;
    const cursorLabelY = 232;
    const bracketY = 238;
    const markY = 248;
    const stripY0 = 256;
    const stripY1 = 270;
    const axisY = 278;
    const tickLabelY = 292;
    const recoverLabelY = 309;
    const axisX0 = margin + 10;
    const axisX1 = W - margin - 10;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function node(tag: string, attrs: Record<string, string | number>, parent: Element = svg): SVGElement {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(e);
      return e;
    }

    function label(
      x: number,
      y: number,
      str: string,
      opt: { px: number; fill: string; anchor?: 'start' | 'middle' | 'end'; bold?: boolean },
    ): void {
      const e = node('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': opt.px,
        fill: opt.fill,
        'text-anchor': opt.anchor ?? 'middle',
      });
      if (opt.bold) e.setAttribute('font-weight', '600');
      e.textContent = str;
    }

    /** 글자 폭 어림 — 넓은 글자(한글 · 한자권)는 한 칸, 나머지는 반 칸 남짓 */
    function roughWidth(s: string, px: number): number {
      let w = 0;
      for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x1100 ? px : px * 0.56;
      return w;
    }

    /** 캡션을 폭 안으로 접는다. 빈칸이 있으면 낱말 단위, 없으면 글자 단위 */
    function wrap(s: string, px: number, maxW: number): string[] {
      const units = s.includes(' ') ? s.split(' ') : [...s];
      const sep = s.includes(' ') ? ' ' : '';
      const lines: string[] = [];
      let cur = '';
      for (const u of units) {
        const cand = cur === '' ? u : cur + sep + u;
        if (cur !== '' && roughWidth(cand, px) > maxW) {
          lines.push(cur);
          cur = u;
        } else {
          cur = cand;
        }
      }
      if (cur !== '') lines.push(cur);
      return lines;
    }

    function stateFill(s: BreakerState): { fill: string; ink: string } {
      switch (s) {
        case 'open':
          return { fill: pal.danger, ink: pal.stateInk };
        case 'half_open':
          return { fill: pal.accent, ink: pal.stateInk };
        case 'closed':
          return { fill: pal.primary, ink: pal.textInverse };
      }
    }

    function stateName(s: BreakerState): string {
      switch (s) {
        case 'open':
          return t('label.open', 'Open');
        case 'half_open':
          return t('label.halfOpen', 'Half-open');
        case 'closed':
          return t('label.closed', 'Closed');
      }
    }

    function caption(scene: HalfOpenScene, now: number): string {
      const step = scene.step;
      if (!step) {
        const first = scene.phases[0];
        if (!first || first.until === null) throw new Error('halfOpenProbeStage: 첫 열림 구간이 없다');
        return t('caption.init', 'Open since t = {from}. Half-open at: t = {at}.', {
          from: secs(first.from),
          at: secs(first.until),
        });
      }
      switch (step.kind) {
        case 'call': {
          const m = scene.marks[step.index];
          if (!m) throw new Error(`halfOpenProbeStage: 부름 ${step.index} 의 자취가 없다`);
          if (m.kind === 'blocked') {
            return m.why === 'open'
              ? t('caption.blockedOpen', 'Call at t = {t}: blocked, the breaker is open.', { t: secs(m.t) })
              : t('caption.blockedTrial', 'Call at t = {t}: blocked, the trial call is still out.', { t: secs(m.t) });
          }
          if (m.kind === 'trial') {
            return t('caption.trial', 'Call at t = {t}: half-open, so it goes out as the trial call.', { t: secs(m.t) });
          }
          return t('caption.sent', 'Call at t = {t}: closed, so it goes through. Answer ok at t = {at}.', {
            t: secs(m.t),
            at: secs(m.answerAt),
          });
        }
        case 'halfOpen':
          return t('caption.halfOpen', 'Wait over at t = {t}: the breaker turns half-open.', { t: secs(now) });
        case 'answer': {
          const m = scene.marks[step.index];
          if (!m || m.kind !== 'trial' || m.result === null) {
            throw new Error(`halfOpenProbeStage: 답을 받은 시험 부름 ${step.index} 이 없다`);
          }
          if (m.result === 'ok') {
            return t('caption.trialOk', 'Trial call ok at t = {t}: the breaker closes.', { t: secs(now) });
          }
          const cur = scene.phases[scene.phases.length - 1];
          if (!cur || cur.state !== 'open' || cur.until === null) {
            throw new Error('halfOpenProbeStage: 다시 열린 구간이 없다');
          }
          return t('caption.trialFail', 'Trial call fails at t = {t}: open again. Half-open at: t = {at}.', {
            t: secs(now),
            at: secs(cur.until),
          });
        }
        case 'recover':
          return t('caption.recover', 'Service back at t = {t}. Breaker unchanged: {state}.', {
            t: secs(now),
            state: stateName(step.was),
          });
      }
    }

    function cross(x: number, y: number, r: number, stroke: string, width: number): void {
      node('path', {
        d: `M${r2(x - r)},${r2(y - r)}L${r2(x + r)},${r2(y + r)}M${r2(x - r)},${r2(y + r)}L${r2(x + r)},${r2(y - r)}`,
        stroke,
        'stroke-width': width,
        'stroke-linecap': 'round',
        fill: 'none',
      });
    }

    function tick(x: number, y: number, r: number, stroke: string, width: number): void {
      node('path', {
        d: `M${r2(x - r)},${r2(y)}L${r2(x - r * 0.25)},${r2(y + r * 0.7)}L${r2(x + r)},${r2(y - r * 0.7)}`,
        stroke,
        'stroke-width': width,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        fill: 'none',
      });
    }

    /** 결과 알이 — ok 는 노랑 위 체크, fail 은 빨강 위 가위표 */
    function resultBead(x: number, y: number, r: number, result: 'ok' | 'fail'): void {
      node('circle', { cx: x, cy: y, r, fill: result === 'ok' ? pal.accent : pal.danger });
      if (result === 'ok') tick(x, y, r * 0.55, pal.stateInk, 1.8);
      else cross(x, y, r * 0.45, pal.stateInk, 1.8);
    }

    /** 아직 답을 모르는 부름 알이. 시험 부름은 바깥 고리를 두른다 */
    function callBead(x: number, y: number, trial: boolean): void {
      if (trial) node('circle', { cx: x, cy: y, r: 10.5, fill: 'none', stroke: pal.text, 'stroke-width': 1.5 });
      node('circle', { cx: x, cy: y, r: 7, fill: pal.primary });
    }

    function blockedBead(x: number, y: number): void {
      node('circle', { cx: x, cy: y, r: 7, fill: pal.bg, stroke: pal.danger, 'stroke-width': 1.5 });
      cross(x, y, 3.2, pal.danger, 1.6);
    }

    function landedBead(x: number, y: number, m: CallMark): void {
      if (m.kind === 'blocked') {
        blockedBead(x, y);
        return;
      }
      if (m.kind === 'trial') node('circle', { cx: x, cy: y, r: 10.5, fill: 'none', stroke: pal.text, 'stroke-width': 1.5 });
      if (m.result === null) node('circle', { cx: x, cy: y, r: 7, fill: pal.primary });
      else resultBead(x, y, 7, m.result);
    }

    const blockedSlotX = (i: number): number => breakerCx - trayGap + i * trayGap;
    const reachedSlotX = (i: number): number => serviceX0 + 12 + i * trayGap;

    /**
     * 장면 하나를 그린다. p = 1 이면 정지 화면(정본), p < 1 이면 이번 걸음의 운동 가운데.
     */
    function draw(scene: HalfOpenScene, p: number): void {
      svg.textContent = '';
      if (scene.now === null || scene.state === null || scene.end === null || scene.alive === null) return;
      const now = scene.now;
      const end = scene.end;
      const firstPhase = scene.phases[0];
      if (!firstPhase) throw new Error('halfOpenProbeStage: 상태 구간이 없다');
      const start = firstPhase.from;
      if (end <= start) throw new Error('halfOpenProbeStage: 시간 축의 끝이 처음보다 이르다');
      const X = (v: number): number => axisX0 + ((v - start) / (end - start)) * (axisX1 - axisX0);

      const step = p < 1 ? scene.step : null;
      const tau = step ? lerp(step.from, now, ease(clamp01(p / CLOCK_END))) : now;
      const q = step ? clamp01((p - CLOCK_END) / (1 - CLOCK_END)) : 1;

      // 막대 — 상태가 바뀌는 걸음에서만 돈다. 사건 토막의 뒤 절반
      const flips = step !== null && (step.kind === 'halfOpen' || step.kind === 'answer');
      const lp = flips ? ease(clamp01((q - 0.5) / 0.5)) : 1;
      const wasState = step ? step.was : scene.state;
      const shown: BreakerState = lp >= 0.5 ? scene.state : wasState;
      const angle = lerp(leverAngle(wasState), leverAngle(scene.state), lp);
      const alive = step && step.kind === 'recover' ? q >= 0.5 : scene.alive;
      const movingIndex = step && (step.kind === 'call' || step.kind === 'answer') ? step.index : null;

      // ── 캡션
      const lines = wrap(caption(scene, now), pxMd, W - margin * 2);
      if (lines.length > 3) throw new Error('halfOpenProbeStage: 캡션이 세 줄을 넘는다');
      lines.forEach((ln, i) => label(margin, 22 + i * 18, ln, { px: pxMd, fill: pal.text, anchor: 'start' }));

      // ── 전선
      node('line', { x1: callerX1, y1: wireY, x2: pivotX, y2: wireY, stroke: pal.textMuted, 'stroke-width': 2 });
      node('line', { x1: contactX, y1: wireY, x2: serviceX0, y2: wireY, stroke: pal.textMuted, 'stroke-width': 2 });

      // ── 부르는 쪽
      node('rect', {
        x: callerX0,
        y: laneTop + headH,
        width: boxW,
        height: laneBottom - laneTop - headH,
        rx: 6,
        fill: pal.bg,
        stroke: pal.text,
        'stroke-width': 1.5,
      });
      label((callerX0 + callerX1) / 2, laneTop + headH + 30, t('label.caller', 'Caller'), { px: pxSm, fill: pal.text, bold: true });

      // ── 브레이커
      const sf = stateFill(shown);
      node('rect', {
        x: breakerX0,
        y: laneTop,
        width: breakerX1 - breakerX0,
        height: laneBottom - laneTop,
        rx: 6,
        fill: pal.bgSubtle,
        stroke: sf.fill,
        'stroke-width': 2,
      });
      node('rect', { x: breakerX0, y: laneTop, width: breakerX1 - breakerX0, height: headH, rx: 6, fill: sf.fill });
      label(breakerCx, laneTop + 17, t('label.breakerState', 'Breaker: {state}', { state: stateName(shown) }), {
        px: pxSm,
        fill: sf.ink,
        bold: true,
      });
      node('line', { x1: breakerX0, y1: wireY, x2: pivotX, y2: wireY, stroke: pal.textMuted, 'stroke-width': 2 });
      node('line', { x1: contactX, y1: wireY, x2: breakerX1, y2: wireY, stroke: pal.textMuted, 'stroke-width': 2 });
      const rad = (angle * Math.PI) / 180;
      node('line', {
        x1: pivotX,
        y1: wireY,
        x2: pivotX + leverLen * Math.cos(rad),
        y2: wireY + leverLen * Math.sin(rad),
        stroke: pal.text,
        'stroke-width': 4,
        'stroke-linecap': 'round',
      });
      node('circle', { cx: pivotX, cy: wireY, r: 4, fill: pal.text });
      node('circle', { cx: contactX, cy: wireY, r: 4, fill: pal.bg, stroke: pal.text, 'stroke-width': 2 });

      // ── 서비스
      node('rect', {
        x: serviceX0,
        y: laneTop + headH,
        width: boxW,
        height: laneBottom - laneTop - headH,
        rx: 6,
        fill: alive ? pal.bg : pal.bgSubtle,
        stroke: alive ? pal.text : pal.textMuted,
        'stroke-width': 1.5,
        ...(alive ? {} : { 'stroke-dasharray': '4 3' }),
      });
      const serviceCx = (serviceX0 + serviceX1) / 2;
      label(serviceCx, laneTop + headH + 20, t('label.service', 'Service'), { px: pxSm, fill: pal.text, bold: true });
      label(serviceCx, laneTop + headH + 38, alive ? t('label.up', 'Up') : t('label.down', 'Down'), {
        px: pxXs,
        fill: alive ? pal.text : pal.danger,
      });

      // ── 칸에 앉은 부름들 (운동 중인 부름은 뺀다)
      let blockedN = 0;
      let reachedN = 0;
      let trialN = 0;
      const slotOf = new Map<number, number>();
      scene.marks.forEach((m, i) => {
        const moving = i === movingIndex;
        if (m.kind === 'blocked') {
          slotOf.set(i, blockedN);
          if (!(moving && step?.kind === 'call')) blockedBead(blockedSlotX(blockedN), trayY);
          blockedN += 1;
          return;
        }
        // 나가 있는 시험 부름은 칸이 아니라 서비스 앞에 선다
        if (scene.inFlight === i) {
          if (!moving) callBead(flightX, wireY, true);
        } else {
          slotOf.set(i, reachedN);
          if (!moving) landedBead(reachedSlotX(reachedN), trayY, m);
          reachedN += 1;
        }
        if (m.kind === 'trial') trialN += 1;
      });
      // 칸 셈은 앉은 것만 — 운동 중인 부름은 도착한 뒤에 센다
      const movingMark = movingIndex !== null ? scene.marks[movingIndex] : undefined;
      if (step && step.kind === 'call' && movingMark) {
        if (movingMark.kind === 'blocked') blockedN -= 1;
        else {
          if (scene.inFlight !== movingIndex) reachedN -= 1;
          if (movingMark.kind === 'trial') trialN -= 1;
        }
      }
      const sentN = reachedN + (scene.inFlight !== null && !(step?.kind === 'call' && step.index === scene.inFlight) ? 1 : 0);

      // ── 운동 중인 부름
      if (step && movingIndex !== null && q > 0) {
        if (!movingMark) throw new Error(`halfOpenProbeStage: 움직일 부름 ${movingIndex} 이 없다`);
        if (step.kind === 'call') {
          if (movingMark.kind === 'blocked') {
            const slot = slotOf.get(movingIndex);
            if (slot === undefined) throw new Error('halfOpenProbeStage: 막힌 부름의 칸이 없다');
            const k1 = ease(clamp01(q / 0.6));
            const k2 = ease(clamp01((q - 0.6) / 0.4));
            if (q < 0.6) callBead(lerp(startX, pivotX - 12, k1), wireY, false);
            else blockedBead(lerp(pivotX - 12, blockedSlotX(slot), k2), lerp(wireY, trayY, k2));
          } else if (movingMark.kind === 'trial') {
            callBead(lerp(startX, flightX, ease(q)), wireY, true);
          } else {
            const slot = slotOf.get(movingIndex);
            if (slot === undefined) throw new Error('halfOpenProbeStage: 보낸 부름의 칸이 없다');
            const k1 = ease(clamp01(q / 0.6));
            const k2 = ease(clamp01((q - 0.6) / 0.4));
            if (q < 0.6) callBead(lerp(startX, flightX, k1), wireY, false);
            else landedBead(lerp(flightX, reachedSlotX(slot), k2), lerp(wireY, trayY, k2), movingMark);
          }
        } else {
          // 답 — 부름은 칸으로 내려앉고, 결과 알이가 브레이커로 거슬러 간다
          if (movingMark.kind !== 'trial' || movingMark.result === null) {
            throw new Error(`halfOpenProbeStage: 답을 받은 시험 부름 ${movingIndex} 이 없다`);
          }
          const slot = slotOf.get(movingIndex);
          if (slot === undefined) throw new Error('halfOpenProbeStage: 답을 받은 부름의 칸이 없다');
          const k1 = ease(clamp01(q / 0.4));
          landedBead(lerp(flightX, reachedSlotX(slot), k1), lerp(wireY, trayY, k1), movingMark);
          const k2 = ease(clamp01(q / 0.6));
          resultBead(lerp(serviceX0 - 6, contactX + 10, k2), wireY - 14, 6, movingMark.result);
        }
      } else if (step && step.kind === 'answer' && q === 0) {
        // 시계가 흐르는 동안 시험 부름은 아직 서비스 앞에 있다
        callBead(flightX, wireY, true);
      }

      // ── 읽을 수
      label(breakerCx, readY1, t('readout.blocked', 'Blocked: {n}', { n: blockedN }), { px: pxXs, fill: pal.textMuted });
      if (shown === 'open') {
        let openPhase = null;
        for (const ph of scene.phases) if (ph.state === 'open' && ph.from <= tau) openPhase = ph;
        if (!openPhase || openPhase.until === null) throw new Error('halfOpenProbeStage: 열림 구간의 반열림 예정 시각이 없다');
        label(breakerCx, readY2, t('readout.halfOpenAt', 'Half-open at: t = {at}', { at: secs(openPhase.until) }), {
          px: pxXs,
          fill: pal.text,
          bold: true,
        });
      }
      label(serviceX1, readY1, t('readout.sent', 'Sent to service: {n}', { n: sentN }), {
        px: pxXs,
        fill: pal.textMuted,
        anchor: 'end',
      });
      label(serviceX1, readY2, t('readout.trials', 'Trial calls: {n}', { n: trialN }), {
        px: pxXs,
        fill: pal.text,
        anchor: 'end',
        bold: true,
      });

      // ── 시간 축: 상태 띠
      scene.phases.forEach((ph, i) => {
        if (ph.from > tau) return;
        if (ph.state === 'open' && ph.until !== null) {
          node('rect', {
            x: X(ph.from),
            y: stripY0,
            width: X(ph.until) - X(ph.from),
            height: stripY1 - stripY0,
            fill: 'none',
            stroke: pal.danger,
            'stroke-width': 1,
            'stroke-dasharray': '3 2',
          });
        }
        const next = scene.phases[i + 1];
        const to = Math.min(next && next.from <= tau ? next.from : tau, tau);
        if (to > ph.from) {
          node('rect', {
            x: X(ph.from),
            y: stripY0,
            width: X(to) - X(ph.from),
            height: stripY1 - stripY0,
            fill: stateFill(ph.state).fill,
          });
        }
      });

      // ── 시간 축: 눈금
      node('line', { x1: axisX0, y1: axisY, x2: axisX1, y2: axisY, stroke: pal.textMuted, 'stroke-width': 1 });
      for (let s = Math.ceil(start); s <= Math.floor(end); s += 1) {
        node('line', { x1: X(s), y1: axisY, x2: X(s), y2: axisY + 4, stroke: pal.textMuted, 'stroke-width': 1 });
        if ((s - Math.ceil(start)) % 2 === 0) label(X(s), tickLabelY, secs(s), { px: pxXs, fill: pal.textMuted });
      }

      // ── 시간 축: 되살아남
      if (scene.recoveredAt !== null && scene.recoveredAt <= tau) {
        const grow = step && step.kind === 'recover' ? ease(q) : 1;
        const rx = X(scene.recoveredAt);
        node('line', {
          x1: rx,
          y1: axisY,
          x2: rx,
          y2: lerp(axisY, bracketY - 4, grow),
          stroke: pal.text,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 3',
        });
        if (grow >= 1) label(rx, recoverLabelY, t('label.recovered', 'Service back'), { px: pxXs, fill: pal.text, bold: true });
      }

      // ── 시간 축: 부름 표지와 나가 있던 동안
      scene.marks.forEach((m) => {
        if (m.t > tau) return;
        const mx = X(m.t);
        if (m.kind === 'blocked') {
          cross(mx, markY, 4, pal.danger, 1.8);
          return;
        }
        const until = m.answerAt === null ? tau : m.kind === 'trial' ? Math.min(m.answerAt, tau) : m.answerAt;
        node('path', {
          d: `M${r2(mx)},${markY - 5}V${bracketY}H${r2(X(until))}`,
          stroke: pal.text,
          'stroke-width': 1.5,
          fill: 'none',
        });
        if (m.kind === 'trial') node('circle', { cx: mx, cy: markY, r: 6.5, fill: 'none', stroke: pal.text, 'stroke-width': 1.2 });
        node('circle', { cx: mx, cy: markY, r: 4, fill: pal.primary });
        if (m.result !== null && m.answerAt !== null && (m.kind === 'sent' || m.answerAt <= tau)) {
          resultBead(X(m.answerAt), bracketY, 5, m.result);
        }
      });

      // ── 시계 바늘
      const cx = X(tau);
      node('line', { x1: cx, y1: bracketY - 2, x2: cx, y2: axisY + 6, stroke: pal.text, 'stroke-width': 1.5 });
      const lx = Math.min(Math.max(cx, axisX0 + 18), axisX1 - 18);
      label(lx, cursorLabelY - 4, t('readout.clock', 't = {t}', { t: secs(tau) }), { px: pxSm, fill: pal.text, bold: true });
    }

    function tween(mine: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const frames = Math.ceil(MOTION_MS / FRAME_MS);
        let i = 0;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const step = (): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          i += 1;
          onFrame(Math.min(1, i / frames));
          if (i >= frames) {
            done();
            return;
          }
          const h = setTimeout(() => {
            timers.delete(h);
            step();
          }, FRAME_MS);
          timers.add(h);
        };
        onFrame(0);
        const h = setTimeout(() => {
          timers.delete(h);
          step();
        }, FRAME_MS);
        timers.add(h);
      });
    }

    return {
      async render(next: HalfOpenScene, _prev: HalfOpenScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        draw(next, 1);
        if (!opts.animate || next.step === null) return;
        await tween(mine, (p) => draw(next, p));
        if (mine === gen && !destroyed) draw(next, 1);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const h of timers) clearTimeout(h);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
