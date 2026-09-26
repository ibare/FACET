/**
 * 퍼셉트론 무대 — 점 평면과 에폭별 틀린 수 막대.
 *
 * 운동:
 *   - 판 머리(start) — 옮긴 점이 새 자리로 미끄러져 간다. 앞 판의 선 · 막대 · 판정은 걷힌다
 *   - 에폭(epoch) — 훑는 표지가 점 열을 적힌 차례로 한 점씩 지나간다. 틀린 점에 닿으면 경계선과 켜짐 쪽이
 *     **그 자리에서 한 번에** 옮겨 가고(정수 무게의 건너뜀 — 매끈하게 잇지 않는다), 그 에폭의 막대가 한 칸 오른다.
 *     바로 앞 선은 옅은 점선으로 남아 어디서 건너뛰었는지 보인다
 *   - 판정(verdict) — 멈춤이면 끝 에폭 칸의 틀이 바닥에서 차오른다. 되풀이면 짝 에폭 막대에서 그 에폭 끝의 선이
 *     떠올라 평면으로 날아와 지금 선 위에 포개진다
 *
 * 무대는 셈하지 않는다 — 경계선 끝점 · 켜짐 쪽 다각형 · 식 글자 · 눈금 · 칸 수는 payload 로 받는다.
 * 운동 길이는 projector 가 넘긴 재생 속도로 나눈다. 되짚는 중(`isInstant`)이면 끝 상태로 건너뛴다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { EpochView, InitView, Side, StartView, VerdictView, VisitView } from './algorithm.js';

const SVG = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 486;

/** 평면 */
const PL = 52;
const PT = 40;
const PS = 342;
/** 막대 판 */
const BL = 470;
const BW = 260;
const BT = PT;
const BH = PS;
/** 캡션 */
const CAP_Y = 432;

/** 운동 길이 (재생 속도 1 에서, ms) */
const SLIDE_MS = 500;
const VISIT_MS = 50;
const JUMP_HOLD_MS = 50;
const FRAME_MS = 500;
const FLY_MS = 650;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

export const perceptronStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const [colorOff, colorOn] = categorical(2, 'vivid');
    if (colorOff === undefined || colorOn === undefined) throw new Error('perceptron stage: 부류 색이 없다');
    const isInstant = params.isInstant ?? ((): boolean => false);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.fontFamily = fonts.body;

    // ── 운동 도구 — 프레임을 쥐고 되짚기 · 판 비우기에서 끊는다
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let generation = 0;
    let destroyed = false;
    const stopMotion = (): void => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    params.onScrubStart?.(stopMotion);

    /** ms 동안 draw(0…1). 끊기면 끝 상태를 그리지 않고 false. */
    const tween = (ms: number, draw: (k: number) => void): Promise<boolean> => {
      const gen = generation;
      if (destroyed || isInstant() || ms <= 0) {
        draw(1);
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve) => {
        const begin = performance.now();
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const frame = (now: number): void => {
          frames.delete(id);
          if (gen !== generation || destroyed) return finish(false);
          const k = Math.min(1, (now - begin) / ms);
          draw(k);
          if (k >= 1) return finish(true);
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        let id = requestAnimationFrame(frame);
        frames.add(id);
      });
    };
    const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

    // ── 그림 상태
    let view: InitView | null = null;
    let px = (x1: number): number => x1;
    let py = (x2: number): number => x2;
    let colX = (col: number): number => col;
    let colW = 0;
    let barY = (v: number): number => v;

    let regionEl: SVGPolygonElement | null = null;
    let prevLineEl: SVGLineElement | null = null;
    let lineEl: SVGLineElement | null = null;
    let ghostEl: SVGLineElement | null = null;
    let markerEl: SVGCircleElement | null = null;
    let movingEl: SVGGElement | null = null;
    let formulaEl: SVGTextElement | null = null;
    let statusEl: SVGTextElement | null = null;
    let captionEl: HTMLDivElement | null = null;
    let wrongLayer: SVGGElement | null = null;
    let barLayer: SVGGElement | null = null;
    let verdictLayer: SVGGElement | null = null;
    const pointAt: { x: number; y: number }[] = [];
    const bars = new Map<number, { rect: SVGRectElement; label: SVGTextElement; count: number }>();
    let movingIndex = -1;
    let movingPos = { x: 0, y: 0 };
    let currentLine: number[] | null = null;

    const setLine = (node: SVGLineElement, seg: number[] | null): void => {
      if (seg === null) {
        node.setAttribute('visibility', 'hidden');
        return;
      }
      node.setAttribute('visibility', 'visible');
      node.setAttribute('x1', String(px(seg[0]!)));
      node.setAttribute('y1', String(py(seg[1]!)));
      node.setAttribute('x2', String(px(seg[2]!)));
      node.setAttribute('y2', String(py(seg[3]!)));
    };
    const setRegion = (region: number[]): void => {
      if (!regionEl) return;
      const pts: string[] = [];
      for (let i = 0; i + 1 < region.length; i += 2) pts.push(`${px(region[i]!)},${py(region[i + 1]!)}`);
      regionEl.setAttribute('points', pts.join(' '));
    };
    const setStatus = (side: Side): void => {
      if (!statusEl) return;
      statusEl.textContent =
        side === 'allOff'
          ? t('label.noBoundary', 'The whole plane is on the off side')
          : side === 'allOn'
            ? t('label.allOn', 'The whole plane is on the on side')
            : '';
    };
    /** 선을 한 번에 옮긴다 — 바로 앞 선은 옅은 점선으로 남긴다. */
    const jumpTo = (v: VisitView): void => {
      if (!lineEl || !prevLineEl) return;
      setLine(prevLineEl, currentLine);
      setLine(lineEl, v.line);
      currentLine = v.line;
      setRegion(v.region);
      setStatus(v.side);
      if (formulaEl) formulaEl.textContent = v.formula;
    };
    const placeMoving = (x: number, y: number): void => {
      movingPos = { x, y };
      movingEl?.setAttribute('transform', `translate(${x},${y})`);
      if (movingIndex >= 0) pointAt[movingIndex] = { x, y };
    };
    const setBar = (epoch: number, count: number): void => {
      const bar = bars.get(epoch);
      if (!bar) throw new Error(`perceptron stage: 에폭 #${epoch} 칸이 없다`);
      bar.count = count;
      bar.rect.setAttribute('y', String(barY(count)));
      bar.rect.setAttribute('height', String(Math.max(0, barY(0) - barY(count))));
      bar.label.setAttribute('y', String(barY(count) - 5));
      bar.label.textContent = String(count);
      bar.label.setAttribute('visibility', 'visible');
    };

    /** 판의 결론을 걷는다 — 자리(평면 · 점 · 칸)는 남는다. */
    const clearRound = (): void => {
      generation += 1;
      stopMotion();
      currentLine = null;
      if (lineEl) setLine(lineEl, null);
      if (prevLineEl) setLine(prevLineEl, null);
      if (ghostEl) setLine(ghostEl, null);
      setRegion([]);
      markerEl?.setAttribute('visibility', 'hidden');
      wrongLayer?.replaceChildren();
      verdictLayer?.replaceChildren();
      for (const bar of bars.values()) {
        bar.count = 0;
        bar.rect.setAttribute('height', '0');
        bar.rect.setAttribute('y', String(barY(0)));
        bar.label.setAttribute('visibility', 'hidden');
      }
      if (formulaEl) formulaEl.textContent = '';
      if (statusEl) statusEl.textContent = '';
      if (captionEl) captionEl.textContent = '';
    };

    const reset = (): void => {
      generation += 1;
      stopMotion();
      svg.replaceChildren();
      view = null;
      regionEl = prevLineEl = lineEl = ghostEl = null;
      markerEl = null;
      movingEl = null;
      formulaEl = statusEl = null;
      captionEl = null;
      wrongLayer = barLayer = verdictLayer = null;
      pointAt.length = 0;
      bars.clear();
      movingIndex = -1;
      currentLine = null;
    };

    const text = (x: number, y: number, s: string, attrs: Record<string, string | number>, parent: Element): SVGTextElement => {
      const node = el('text', { x, y, fill: colors.text, 'font-size': fontSizes.sm, ...attrs }, parent);
      node.textContent = s;
      return node;
    };

    /** 무대의 자리를 짓는다 — 들어올 때마다 비우고 다시 짓는다 (멱등). */
    const init = (v: InitView): void => {
      reset();
      view = v;
      const span = v.hi - v.lo;
      px = (x1) => PL + ((x1 - v.lo) / span) * PS;
      py = (x2) => PT + PS - ((x2 - v.lo) / span) * PS;
      colW = BW / v.epochColumns;
      colX = (col) => BL + (col - 1) * colW;
      barY = (count) => BT + BH - (count / v.errorMax) * BH;

      // 평면 — 격자 · 눈금 · 축 이름
      const plane = el('g', {}, svg);
      el('rect', { x: PL, y: PT, width: PS, height: PS, fill: colors.bgSubtle, stroke: colors.border }, plane);
      for (const g of v.grid) {
        el('line', { x1: px(g), y1: PT, x2: px(g), y2: PT + PS, stroke: colors.border, 'stroke-width': 0.6 }, plane);
        el('line', { x1: PL, y1: py(g), x2: PL + PS, y2: py(g), stroke: colors.border, 'stroke-width': 0.6 }, plane);
      }
      for (const tk of v.ticks) {
        text(px(tk), PT + PS + 15, String(tk), { 'text-anchor': 'middle', fill: colors.textMuted, 'font-size': fontSizes.xs }, plane);
        text(PL - 8, py(tk) + 4, String(tk), { 'text-anchor': 'end', fill: colors.textMuted, 'font-size': fontSizes.xs }, plane);
      }
      text(PL + PS, PT + PS + 30, v.axisNames[0] ?? '', { 'text-anchor': 'end', 'font-style': 'italic' }, plane);
      text(PL - 30, PT - 8, v.axisNames[1] ?? '', { 'font-style': 'italic' }, plane);

      // 켜짐 쪽 · 선 (점 아래)
      regionEl = el('polygon', { points: '', fill: colorOn, 'fill-opacity': 0.16 }, svg);
      prevLineEl = el('line', { stroke: colors.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '4 4', visibility: 'hidden' }, svg);
      lineEl = el('line', { stroke: colors.text, 'stroke-width': 2.5, visibility: 'hidden' }, svg);

      // 옮기는 점의 자리 사다리 — 옅은 십자
      const spots = el('g', {}, svg);
      for (const s of v.ladder) {
        const x = px(s.x1);
        const y = py(s.x2);
        el('path', { d: `M${x - 5},${y} H${x + 5} M${x},${y - 5} V${y + 5}`, stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 2' }, spots);
      }

      // 틀린 점 표시 층 · 점 · 훑는 표지
      wrongLayer = el('g', {}, svg);
      const pointsLayer = el('g', {}, svg);
      v.points.forEach((p, i) => {
        const x = px(p.x1);
        const y = py(p.x2);
        const moving = p.id === v.movingId;
        const g = el('g', { transform: `translate(${x},${y})` }, pointsLayer);
        if (p.y === 1) el('circle', { r: 7, fill: colorOn, stroke: colors.text, 'stroke-width': moving ? 2.5 : 1 }, g);
        else el('rect', { x: -6.5, y: -6.5, width: 13, height: 13, fill: colorOff, stroke: colors.text, 'stroke-width': moving ? 2.5 : 1 }, g);
        text(9, -8, p.id, { fill: moving ? colors.text : colors.textMuted, 'font-size': fontSizes.xs, 'font-weight': moving ? 700 : 400 }, g);
        pointAt.push({ x, y });
        if (moving) {
          movingEl = g;
          movingIndex = i;
          movingPos = { x, y };
        }
      });
      if (movingIndex < 0) throw new Error('perceptron stage: 옮기는 점이 점 열에 없다');
      ghostEl = el('line', { stroke: colors.danger, 'stroke-width': 3, 'stroke-dasharray': '7 4', visibility: 'hidden' }, svg);
      markerEl = el('circle', { r: 12, fill: 'none', stroke: colors.accent, 'stroke-width': 3, visibility: 'hidden' }, svg);

      // 식 · 상태 글자
      formulaEl = text(PL, 22, '', { 'font-family': fonts.mono, 'font-size': fontSizes.md }, svg);
      statusEl = text(PL + PS, 22, '', { 'text-anchor': 'end', fill: colors.textMuted, 'font-size': fontSizes.xs }, svg);

      // 범례
      const legend = el('g', { transform: `translate(${PL},${PT + PS + 48})` }, svg);
      el('circle', { cx: 6, cy: -4, r: 6, fill: colorOn, stroke: colors.text }, legend);
      text(16, 0, 'y = 1', {}, legend);
      el('rect', { x: 62, y: -10, width: 12, height: 12, fill: colorOff, stroke: colors.text }, legend);
      text(80, 0, 'y = 0', {}, legend);
      el('rect', { x: 128, y: -10, width: 18, height: 12, fill: colorOn, 'fill-opacity': 0.16, stroke: colors.border }, legend);
      text(152, 0, t('label.onSide', 'On side (s > 0)'), {}, legend);

      // 막대 판 — 칸 · 눈금 · 이름
      barLayer = el('g', {}, svg);
      el('line', { x1: BL, y1: BT + BH, x2: BL + BW, y2: BT + BH, stroke: colors.text }, barLayer);
      el('line', { x1: BL, y1: BT, x2: BL, y2: BT + BH, stroke: colors.border }, barLayer);
      for (const tk of v.errorTicks) {
        el('line', { x1: BL, y1: barY(tk), x2: BL + BW, y2: barY(tk), stroke: colors.border, 'stroke-width': 0.6 }, barLayer);
        text(BL - 6, barY(tk) + 4, String(tk), { 'text-anchor': 'end', fill: colors.textMuted, 'font-size': fontSizes.xs }, barLayer);
      }
      text(BL, BT - 12, t('label.errors', 'Wrong points'), { fill: colors.textMuted }, barLayer);
      text(BL + BW, BT + BH + 30, t('label.epoch', 'Epoch'), { 'text-anchor': 'end', fill: colors.textMuted }, barLayer);
      for (let c = 1; c <= v.epochColumns; c += 1) {
        const x = colX(c);
        text(x + colW / 2, BT + BH + 15, String(c), { 'text-anchor': 'middle', fill: colors.textMuted, 'font-size': fontSizes.xs }, barLayer);
        const rect = el('rect', { x: x + colW * 0.15, y: barY(0), width: colW * 0.7, height: 0, fill: colors.danger, 'fill-opacity': 0.75 }, barLayer);
        const label = text(x + colW / 2, barY(0) - 5, '', { 'text-anchor': 'middle', 'font-size': fontSizes.xs, visibility: 'hidden' }, barLayer);
        bars.set(c, { rect, label, count: 0 });
      }
      verdictLayer = el('g', {}, svg);

      // 캡션 — 줄바꿈이 되는 글상자
      const fo = el('foreignObject', { x: PL - 30, y: CAP_Y, width: W - (PL - 30) - 20, height: H - CAP_Y - 4 }, svg);
      captionEl = document.createElement('div');
      captionEl.style.fontSize = fontSizes.md;
      captionEl.style.lineHeight = '1.4';
      captionEl.style.color = colors.text;
      fo.appendChild(captionEl);
    };

    const need = (): InitView => {
      if (!view) throw new Error('perceptron stage: init 전에 걸음이 왔다');
      return view;
    };

    const start = async (s: StartView, speed: number): Promise<void> => {
      need();
      clearRound();
      if (formulaEl) formulaEl.textContent = s.formula;
      setStatus(s.side);
      if (captionEl) captionEl.textContent = t('caption.start', 'Start: weights {w}. The sum is 0 everywhere, so every point is off.', { w: s.wText });
      // 옮긴 점이 새 자리로 미끄러져 간다
      const from = { ...movingPos };
      const to = { x: px(s.position.x1), y: py(s.position.x2) };
      await tween(SLIDE_MS / speed, (k) => {
        const e = ease(k);
        placeMoving(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      });
      placeMoving(to.x, to.y);
    };

    const epoch = async (ep: EpochView, speed: number): Promise<void> => {
      need();
      const gen = generation;
      wrongLayer?.replaceChildren();
      if (ghostEl) setLine(ghostEl, null);
      // 앞 에폭의 건너뜀 자국(옅은 점선)은 걷는다 — 이 에폭의 건너뜀만 남긴다
      if (prevLineEl) setLine(prevLineEl, null);
      setBar(ep.epoch, 0);
      let count = 0;
      let at = pointAt[ep.visits[0]?.index ?? 0];
      if (!at) throw new Error('perceptron stage: 점 자리가 없다');
      markerEl?.setAttribute('visibility', 'visible');
      markerEl?.setAttribute('cx', String(at.x));
      markerEl?.setAttribute('cy', String(at.y));
      for (const v of ep.visits) {
        if (gen !== generation) return;
        const to = pointAt[v.index];
        if (!to) throw new Error(`perceptron stage: 점 #${v.index + 1} 자리가 없다`);
        const from = at;
        // 표지가 다음 점으로 미끄러져 간다
        await tween(VISIT_MS / speed, (k) => {
          markerEl?.setAttribute('cx', String(from.x + (to.x - from.x) * k));
          markerEl?.setAttribute('cy', String(from.y + (to.y - from.y) * k));
        });
        if (gen !== generation) return;
        at = to;
        if (v.wrong) {
          // 틀린 점 — 선이 한 번에 건너뛰고 막대가 한 칸 오른다
          el('circle', { cx: to.x, cy: to.y, r: 11, fill: 'none', stroke: colors.danger, 'stroke-width': 2 }, wrongLayer ?? svg);
          jumpTo(v);
          count += 1;
          setBar(ep.epoch, count);
          await tween(JUMP_HOLD_MS / speed, () => undefined);
        }
      }
      if (gen !== generation) return;
      if (count !== ep.errors) throw new Error(`perceptron stage: 틀린 표시 ${count} 와 틀린 수 ${ep.errors} 가 다르다`);
      markerEl?.setAttribute('visibility', 'hidden');
      if (captionEl) {
        // 틀린 수 0 인 에폭에는 갱신이 없다 — payload 의 틀린 수로 문안을 고른다
        const vars = { epoch: ep.epoch, errors: ep.errors, w: ep.wText };
        captionEl.textContent =
          ep.errors === 0
            ? t('caption.epochNoUpdate', 'Epoch #{epoch}: wrong points {errors}. No update; weights stay {w}.', vars)
            : t('caption.epoch', 'Epoch #{epoch}: wrong points {errors}. Weights after its updates {w}.', vars);
      }
    };

    const verdict = async (vd: VerdictView, speed: number): Promise<void> => {
      need();
      const layer = verdictLayer;
      if (!layer) return;
      layer.replaceChildren();
      const x = colX(vd.epoch);
      const badge = (label: string, cx: number): void => {
        const g = el('g', {}, layer);
        const w = Math.max(56, label.length * 9 + 20);
        el('rect', { x: cx - w / 2, y: BT + 6, width: w, height: 24, rx: 4, fill: colors.bg, stroke: colors.text, 'stroke-width': 2 }, g);
        text(cx, BT + 23, label, { 'text-anchor': 'middle', 'font-weight': 700 }, g);
      };
      if (vd.kind === 'stop') {
        // 끝 에폭 칸의 틀이 바닥에서 차오른다
        const frame = el('rect', { x: x + 1, y: BT + BH, width: colW - 2, height: 0, fill: 'none', stroke: colors.text, 'stroke-width': 2.5 }, layer);
        await tween(FRAME_MS / speed, (k) => {
          const h = (BH - 36) * ease(k);
          frame.setAttribute('y', String(BT + BH - h));
          frame.setAttribute('height', String(h));
        });
        badge(t('label.stop', 'Stopped'), Math.min(BL + BW - 40, x + colW / 2));
        if (captionEl) {
          captionEl.textContent = t('caption.stop', 'Epoch #{epoch}: wrong points {errors}. The rule stops at weights {w}.', {
            epoch: vd.epoch,
            errors: vd.errors,
            w: vd.wText,
          });
        }
        return;
      }
      // 되풀이 — 짝 에폭 칸과 끝 에폭 칸에 틀, 짝 에폭의 선이 평면으로 날아와 지금 선에 포개진다
      for (const col of [vd.pair, vd.epoch]) {
        if (col < 1) continue;
        const bar = bars.get(col);
        if (!bar) throw new Error(`perceptron stage: 에폭 #${col} 칸이 없다`);
        el('rect', { x: colX(col) + 1, y: barY(bar.count) - 20, width: colW - 2, height: barY(0) - barY(bar.count) + 20, fill: 'none', stroke: colors.danger, 'stroke-width': 2 }, layer);
      }
      badge(t('label.repeat', 'Repeats'), BL + BW / 2);
      if (captionEl) {
        captionEl.textContent = t(
          'caption.repeat',
          'Weights at the end of epoch #{epoch} {w} = weights at the end of epoch #{pair}. From here the same epochs repeat forever.',
          { epoch: vd.epoch, pair: vd.pair, w: vd.wText },
        );
      }
      const target = vd.pairLine;
      if (target === null || !ghostEl) return;
      const pairBar = bars.get(vd.pair);
      const sx = vd.pair >= 1 ? colX(vd.pair) + colW / 2 : BL;
      const sy = pairBar ? barY(pairBar.count) : BT + BH;
      const ghost = ghostEl;
      ghost.setAttribute('visibility', 'visible');
      await tween(FLY_MS / speed, (k) => {
        const e = ease(k);
        const ax = sx - colW / 2 + (px(target[0]!) - (sx - colW / 2)) * e;
        const ay = sy + (py(target[1]!) - sy) * e;
        const bx = sx + colW / 2 + (px(target[2]!) - (sx + colW / 2)) * e;
        const by = sy + (py(target[3]!) - sy) * e;
        ghost.setAttribute('x1', String(ax));
        ghost.setAttribute('y1', String(ay));
        ghost.setAttribute('x2', String(bx));
        ghost.setAttribute('y2', String(by));
      });
      setLine(ghost, target);
    };

    return {
      reset,
      init,
      start,
      epoch,
      verdict,
      destroy(): void {
        destroyed = true;
        generation += 1;
        stopMotion();
        svg.replaceChildren();
      },
    };
  },
};
