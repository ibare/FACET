/**
 * page-replacement stage — 참조 띠 · 정책의 판단 근거 · 프레임 칸 · 프레임별 폴트 막대.
 *
 * 운동:
 *   - 판이 바뀌면 막대 다섯이 새 높이로 솟고 내려앉는다. 지금 판의 막대는 0 에서 폴트마다 자란다.
 *     지금 표지(막대 밑 삼각형)는 프레임 수를 따라 옆 막대로 미끄러진다. 프레임 칸이 생기거나 사라진다
 *   - 참조 띠의 앞 판 폴트 표지는 옅은 윤곽으로 남았다가, 그 참조의 걸음이 오면 폴트면 새로 박히고 적중이면 빠진다
 *   - 걸음마다 들어오는 페이지가 참조 띠에서 프레임으로 내려앉고, 내보낸 페이지가 밀려 나간다
 *   - FIFO: 들어온 때 줄의 맨 앞이 떨어진다 · LRU: 쓰인 페이지의 때 표지가 지금으로 당겨진다 ·
 *     Clock: 바늘이 돌며 표시를 지운다
 *
 * 운동 길이는 projector 가 걸음마다 `runtime.getSpeed()` 로 나눠 건넨다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export interface StageRound {
  refs: number[];
  policy: number;
  policyId: string;
  frames: number;
  frameLadder: number[];
  bars: number[];
  scale: number;
}

export interface StageStep {
  step: number;
  page: number;
  kind: 'hit' | 'fill' | 'evict';
  frame: number;
  evicted: number | null;
  swept: number[];
  hand: number;
  pages: number[];
  stamps: number[];
  marks: number[];
  faults: number;
}

/** projector 가 부르는 표면. */
export interface PageReplacementStage {
  startRound(round: StageRound, motionMs: number): void;
  showStep(step: StageStep, motionMs: number): void;
  setCaption(text: string): void;
}

const W = 760;
const H = 330;
const MAX_SLOTS = 5;
const REF_CAP = 13;

// 참조 띠
const REF_X0 = 20;
const REF_PITCH = 34;
const REF_W = 30;
const REF_Y = 40;
const REF_H = 30;
const MARK_Y = REF_Y + REF_H + 4;
const MARK_H = 6;
// 때 줄 (FIFO · LRU)
const LANE_LABEL_Y = 104;
const LANE_Y = 110;
const CHIP_W = 26;
const CHIP_H = 22;
// 프레임 칸
const SLOT_X0 = 20;
const SLOT_PITCH = 88;
const SLOT_W = 64;
const SLOT_Y = 166;
const SLOT_H = 44;
const SLOT_LABEL_Y = SLOT_Y + SLOT_H + 15;
const MARK_TEXT_Y = SLOT_LABEL_Y + 15;
const HAND_Y = MARK_TEXT_Y + 8;
// 막대
const BAR_X0 = 538;
const BAR_PITCH = 42;
const BAR_W = 28;
const BAR_BASE = 236;
const BAR_MAX_H = 172;
const CAPTION_Y = 316;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: SVGElement): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

const refX = (i: number): number => REF_X0 + i * REF_PITCH;
const refCx = (i: number): number => refX(i) + REF_W / 2;
const slotX = (s: number): number => SLOT_X0 + s * SLOT_PITCH;
const slotCx = (s: number): number => slotX(s) + SLOT_W / 2;
const barX = (k: number): number => BAR_X0 + k * BAR_PITCH;

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

interface Token {
  g: SVGGElement;
  page: number;
}

interface Chip {
  g: SVGGElement;
  x: number;
}

interface Tween {
  begin: number;
  delay: number;
  dur: number;
  draw: (p: number) => void;
  started: boolean;
}

export const pageReplacementStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);
    const mdPx = parseFloat(fontSizes.md);

    // ── 애니메이션
    const tweens = new Set<Tween>();
    let frameId = 0;
    let destroyed = false;
    const tick = (now: number): void => {
      frameId = 0;
      for (const tw of [...tweens]) {
        const elapsed = now - tw.begin - tw.delay;
        if (elapsed < 0) continue;
        tw.started = true;
        const p = Math.min(1, elapsed / tw.dur);
        tw.draw(ease(p));
        if (p >= 1) tweens.delete(tw);
      }
      if (tweens.size > 0 && !destroyed) frameId = requestAnimationFrame(tick);
    };
    const animate = (dur: number, draw: (p: number) => void, delay = 0): void => {
      if (destroyed || isInstant() || dur <= 0 || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return;
      }
      tweens.add({ begin: performance.now(), delay, dur, draw, started: false });
      if (delay === 0) draw(0);
      if (frameId === 0) frameId = requestAnimationFrame(tick);
    };
    /** 걸린 운동을 끝 모습으로 마저 그린다 — 다음 걸음이 앞 걸음의 끝에서 시작하게 */
    const finishAll = (): void => {
      if (frameId !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
      frameId = 0;
      const pending = [...tweens];
      tweens.clear();
      for (const tw of pending) tw.draw(1);
    };
    params.onScrubStart?.(() => finishAll());

    const mono = (size: number, fill: string, anchor = 'middle'): Attrs => ({
      'font-family': fonts.mono,
      'font-size': size,
      fill,
      'text-anchor': anchor,
    });
    const body = (size: number, fill: string, anchor = 'start'): Attrs => ({
      'font-family': fonts.body,
      'font-size': size,
      fill,
      'text-anchor': anchor,
    });

    // ── 바탕 글자
    const refTitle = el('text', { x: REF_X0, y: 16, ...body(smPx, c.textMuted) }, svg);
    refTitle.textContent = t('label.refs', 'References');
    const laneTitle = el('text', { x: REF_X0, y: LANE_LABEL_Y, ...body(xsPx, c.textMuted) }, svg);
    const frameTitle = el('text', { x: SLOT_X0, y: SLOT_Y - 10, ...body(smPx, c.textMuted) }, svg);
    frameTitle.textContent = t('label.frames', 'Frames');
    const barTitle = el('text', { x: BAR_X0 - 4, y: 16, ...body(smPx, c.textMuted) }, svg);
    barTitle.textContent = t('label.bars', 'Faults by frame count');
    const barAxis = el('text', { x: barX(2) + BAR_W / 2, y: BAR_BASE + 44, ...body(xsPx, c.textMuted, 'middle') }, svg);
    barAxis.textContent = t('label.frames', 'Frames');

    // ── 참조 띠
    const refLayer = el('g', {}, svg);
    const cursor = el('rect', { x: refX(0) - 2, y: REF_Y - 2, width: REF_W + 4, height: REF_H + 4, rx: 5, fill: 'none', stroke: c.itemActive, 'stroke-width': 2, opacity: 0 }, svg);
    type Cell = { mark: SVGRectElement; state: 'none' | 'ghost' | 'fault' };
    let cells: Cell[] = [];
    let refsShown: number[] = [];
    const buildStrip = (refs: number[]): void => {
      if (refs.length > REF_CAP) throw new Error(`참조열이 ${REF_CAP} 칸을 넘는다: ${refs.length}`);
      while (refLayer.firstChild) refLayer.removeChild(refLayer.firstChild);
      cells = refs.map((page, i) => {
        const idx = el('text', { x: refCx(i), y: REF_Y - 6, ...mono(xsPx, c.textMuted) }, refLayer);
        idx.textContent = String(i + 1);
        el('rect', { x: refX(i), y: REF_Y, width: REF_W, height: REF_H, rx: 4, fill: c.bgSubtle, stroke: c.border }, refLayer);
        const label = el('text', { x: refCx(i), y: REF_Y + REF_H / 2 + mdPx / 3, ...mono(mdPx, c.text) }, refLayer);
        label.textContent = String(page);
        const mark = el('rect', { x: refX(i) + 3, y: MARK_Y, width: REF_W - 6, height: 0, rx: 2, fill: c.danger, stroke: 'none' }, refLayer);
        return { mark, state: 'none' as const };
      });
      refsShown = [...refs];
    };
    const setMark = (cell: Cell, next: 'none' | 'ghost' | 'fault', dur: number): void => {
      const from = Number(cell.mark.getAttribute('height'));
      const prev = cell.state;
      cell.state = next;
      if (next === 'ghost') {
        cell.mark.setAttribute('fill', 'none');
        cell.mark.setAttribute('stroke', c.ghostOutline);
        cell.mark.setAttribute('stroke-dasharray', '2 2');
        return;
      }
      if (next === 'fault') {
        cell.mark.setAttribute('fill', c.danger);
        cell.mark.setAttribute('stroke', 'none');
        cell.mark.removeAttribute('stroke-dasharray');
        // 위에서 떨어져 박힌다
        const startH = prev === 'ghost' ? from : 0;
        animate(dur, (p) => {
          cell.mark.setAttribute('y', String(lerp(MARK_Y - 14, MARK_Y, p)));
          cell.mark.setAttribute('height', String(lerp(startH, MARK_H, p)));
        });
        return;
      }
      // 빠진다 — 줄어 사라진다
      animate(dur, (p) => {
        cell.mark.setAttribute('height', String(lerp(from, 0, p)));
        cell.mark.setAttribute('y', String(lerp(MARK_Y, MARK_Y + MARK_H, p)));
      });
    };

    // ── 프레임 칸
    const slotLayer = el('g', {}, svg);
    const tokenLayer = el('g', {}, svg);
    const slots = Array.from({ length: MAX_SLOTS }, (_, s) => {
      const hole = el('rect', { x: slotX(s), y: SLOT_Y, width: SLOT_W, height: SLOT_H, rx: 6, fill: 'none', stroke: c.border, 'stroke-dasharray': '4 3' }, slotLayer);
      const box = el('rect', { x: slotX(s), y: SLOT_Y + SLOT_H, width: SLOT_W, height: 0, rx: 6, fill: c.bgSubtle, stroke: c.textMuted }, slotLayer);
      const label = el('text', { x: slotCx(s), y: SLOT_LABEL_Y, ...body(xsPx, c.textMuted, 'middle') }, slotLayer);
      label.textContent = t('label.slot', 'frame {frame}', { frame: s });
      const mark = el('text', { x: slotCx(s), y: MARK_TEXT_Y, ...mono(xsPx, c.text) }, slotLayer);
      return { hole, box, label, mark, open: false };
    });
    const tokens: (Token | null)[] = Array.from({ length: MAX_SLOTS }, () => null);
    const makeToken = (page: number): SVGGElement => {
      const g = el('g', {}, tokenLayer);
      el('rect', { x: -SLOT_W / 2 + 8, y: -SLOT_H / 2 + 6, width: SLOT_W - 16, height: SLOT_H - 12, rx: 5, fill: c.itemDefault, stroke: c.text, 'stroke-width': 1.5 }, g);
      const label = el('text', { x: 0, y: mdPx / 3, ...mono(mdPx, c.text) }, g);
      label.textContent = String(page);
      return g;
    };
    const place = (g: SVGGElement, x: number, y: number, alpha = 1): void => {
      g.setAttribute('transform', `translate(${x} ${y})`);
      g.setAttribute('opacity', String(alpha));
    };
    const slotCy = SLOT_Y + SLOT_H / 2;
    const dropOut = (g: SVGGElement, x: number, dur: number, delay = 0): void => {
      animate(
        dur,
        (p) => {
          place(g, x + 30 * p, slotCy + 70 * p, 1 - p);
          if (p >= 1) g.remove();
        },
        delay,
      );
    };

    // ── Clock 의 바늘
    const hand = el('path', { d: `M 0 0 L -7 12 L 7 12 Z`, fill: c.itemActive, opacity: 0 }, svg);
    const handLabel = el('text', { x: 0, y: HAND_Y + 25, ...body(xsPx, c.textMuted, 'middle'), opacity: 0 }, svg);
    handLabel.textContent = t('label.hand', 'hand');
    let handAt = 0;
    const placeHand = (x: number): void => {
      hand.setAttribute('transform', `translate(${x} ${HAND_Y})`);
      handLabel.setAttribute('x', String(x));
    };
    placeHand(slotCx(0));
    const setMarkText = (s: number, m: number | null): void => {
      const slot = slots[s];
      if (!slot) throw new Error(`프레임 ${s} 이 없다`);
      slot.mark.textContent = m === null ? '' : t('label.mark', 'mark {mark}', { mark: m });
    };

    // ── 때 줄 (FIFO · LRU)
    const laneLayer = el('g', {}, svg);
    const chips: (Chip | null)[] = Array.from({ length: MAX_SLOTS }, () => null);
    const makeChip = (page: number): SVGGElement => {
      const g = el('g', {}, laneLayer);
      el('rect', { x: -CHIP_W / 2, y: 0, width: CHIP_W, height: CHIP_H, rx: 11, fill: c.itemComparing, stroke: 'none' }, g);
      const label = el('text', { x: 0, y: CHIP_H / 2 + xsPx / 3, ...mono(xsPx, c.textInverse) }, g);
      label.textContent = String(page);
      return g;
    };
    const clearLane = (dur: number): void => {
      for (let s = 0; s < MAX_SLOTS; s += 1) {
        const chip = chips[s];
        if (!chip) continue;
        chips[s] = null;
        animate(dur, (p) => {
          place(chip.g, chip.x, LANE_Y + 30 * p, 1 - p);
          if (p >= 1) chip.g.remove();
        });
      }
    };

    // ── 막대
    const barLayer = el('g', {}, svg);
    const bars = Array.from({ length: MAX_SLOTS }, (_, k) => {
      const rect = el('rect', { x: barX(k), y: BAR_BASE, width: BAR_W, height: 0, fill: c.textMuted }, barLayer);
      const value = el('text', { x: barX(k) + BAR_W / 2, y: BAR_BASE - 4, ...mono(xsPx, c.text) }, barLayer);
      const tickLabel = el('text', { x: barX(k) + BAR_W / 2, y: BAR_BASE + 14, ...mono(xsPx, c.textMuted) }, barLayer);
      return { rect, value, tickLabel, h: 0 };
    });
    el('line', { x1: BAR_X0 - 6, x2: barX(MAX_SLOTS - 1) + BAR_W + 6, y1: BAR_BASE, y2: BAR_BASE, stroke: c.border }, barLayer);
    const barMarker = el('path', { d: 'M 0 0 L -6 9 L 6 9 Z', fill: c.itemActive, opacity: 0 }, svg);
    let markerX = barX(0) + BAR_W / 2;
    const placeMarker = (x: number): void => barMarker.setAttribute('transform', `translate(${x} ${BAR_BASE + 20})`);
    placeMarker(markerX);
    let scale = REF_CAP;
    let current = -1;
    const setBar = (k: number, value: number, dur: number): void => {
      const bar = bars[k];
      if (!bar) throw new Error(`막대 ${k} 이 없다`);
      const from = bar.h;
      const to = (value / scale) * BAR_MAX_H;
      bar.h = to;
      bar.value.textContent = String(value);
      animate(dur, (p) => {
        const h = lerp(from, to, p);
        bar.rect.setAttribute('y', String(BAR_BASE - h));
        bar.rect.setAttribute('height', String(h));
        bar.value.setAttribute('y', String(BAR_BASE - h - 4));
      });
    };

    const caption = el('text', { x: 20, y: CAPTION_Y, ...body(mdPx, c.text) }, svg);

    let policy = 0;
    let frames = 0;

    const stage: PageReplacementStage & ViewInstance = {
      startRound(round, motionMs) {
        finishAll();
        const dur = motionMs;
        if (round.frames < 1 || round.frames > MAX_SLOTS) throw new Error(`프레임 수 ${round.frames} 이 칸 ${MAX_SLOTS} 을 넘는다`);
        if (round.bars.length !== round.frameLadder.length || round.bars.length > MAX_SLOTS) throw new Error('막대 수가 프레임 사다리와 다르다');
        policy = round.policy;
        frames = round.frames;
        scale = round.scale;

        // 참조 띠 — 같은 열이면 앞 판 표지를 윤곽으로 남긴다
        const same = round.refs.length === refsShown.length && round.refs.every((p, i) => p === refsShown[i]);
        if (same) {
          for (const cell of cells) if (cell.state === 'fault') setMark(cell, 'ghost', dur);
        } else {
          buildStrip(round.refs);
        }
        cursor.setAttribute('opacity', '0');

        // 프레임 칸 — 생기거나 사라진다, 남은 페이지는 밀려 나간다
        for (let s = 0; s < MAX_SLOTS; s += 1) {
          const slot = slots[s]!;
          const open = s < frames;
          if (open !== slot.open) {
            const [a, b] = open ? [0, SLOT_H] : [SLOT_H, 0];
            animate(dur, (p) => {
              const h = lerp(a, b, p);
              slot.box.setAttribute('y', String(SLOT_Y + SLOT_H - h));
              slot.box.setAttribute('height', String(h));
            });
            slot.open = open;
          }
          slot.label.setAttribute('fill', open ? c.text : c.border);
          setMarkText(s, null);
          const tok = tokens[s];
          if (tok) {
            dropOut(tok.g, slotCx(s), dur);
            tokens[s] = null;
          }
        }

        // 판단 근거
        clearLane(dur);
        laneTitle.textContent =
          round.policy === 0 ? t('label.lane.fifo', 'Arrived') : round.policy === 1 ? t('label.lane.lru', 'Last used') : '';
        const clock = round.policy === 2;
        const fromHand = handAt;
        handAt = 0;
        hand.setAttribute('opacity', clock ? '1' : '0');
        handLabel.setAttribute('opacity', clock ? '1' : '0');
        animate(dur, (p) => placeHand(lerp(slotCx(fromHand), slotCx(0), p)));

        // 막대 — 새 높이로. 지금 판 막대는 0 에서 자란다
        const idx = round.frameLadder.indexOf(round.frames);
        if (idx < 0) throw new Error(`프레임 수 ${round.frames} 이 사다리에 없다`);
        round.frameLadder.forEach((f, k) => {
          const bar = bars[k]!;
          bar.tickLabel.textContent = String(f);
          bar.rect.setAttribute('fill', k === idx ? c.primary : c.textMuted);
          const value = round.bars[k];
          if (value === undefined) throw new Error(`막대 ${k} 의 값이 없다`);
          setBar(k, k === idx ? 0 : value, dur);
        });
        current = idx;
        const fromX = markerX;
        markerX = barX(idx) + BAR_W / 2;
        barMarker.setAttribute('opacity', '1');
        animate(dur, (p) => placeMarker(lerp(fromX, markerX, p)));
      },

      showStep(step, motionMs) {
        finishAll();
        const dur = motionMs;
        const i = step.step - 1;
        const cell = cells[i];
        if (!cell) throw new Error(`참조 #${step.step} 의 칸이 없다`);
        if (step.frame < 0 || step.frame >= frames) throw new Error(`프레임 ${step.frame} 이 열린 칸 밖이다`);

        // 커서가 이 참조로
        const cx0 = Number(cursor.getAttribute('x'));
        const cx1 = refX(i) - 2;
        const wasHidden = cursor.getAttribute('opacity') === '0';
        cursor.setAttribute('opacity', '1');
        animate(wasHidden ? 0 : dur * 0.4, (p) => cursor.setAttribute('x', String(lerp(cx0, cx1, p))));

        // 폴트 표지 — 박히거나 빠진다
        if (step.kind === 'hit') {
          if (cell.state !== 'none') setMark(cell, 'none', dur);
        } else {
          setMark(cell, 'fault', dur);
        }

        const s = step.frame;
        const clock = policy === 2;
        // Clock 은 바늘이 먼저 돌고, 그 뒤 페이지가 들고 난다
        const sweepShare = clock && step.kind === 'evict' ? 0.5 : 0;
        const sweepDur = dur * sweepShare;
        const moveDelay = sweepDur;
        const moveDur = dur - sweepDur;

        if (clock) {
          if (step.kind === 'evict') {
            const path = [handAt, ...step.swept.map((q) => (q + 1) % frames), step.hand];
            // 바늘이 짚는 칸 차례: 지금 자리 → 지운 칸마다 다음 칸 → 내보낸 칸의 다음 칸
            const cleared = new Set<number>();
            const legs = path.length - 1;
            animate(sweepDur + moveDur * 0.5, (p) => {
              const pos = p * legs;
              const leg = Math.min(legs - 1, Math.floor(pos));
              const a = path[leg]!;
              const b = path[leg + 1]!;
              // 끝 칸에서 0 칸으로 돌아갈 때는 칸 밖으로 한 칸 나갔다가 되돌아오지 않고 곧장 옮긴다
              placeHand(lerp(slotCx(a), slotCx(b), pos - leg));
              for (let k = 0; k < step.swept.length && k < pos; k += 1) {
                const q = step.swept[k]!;
                if (!cleared.has(q)) {
                  cleared.add(q);
                  setMarkText(q, 0);
                }
              }
            });
          }
          handAt = step.hand;
        }

        const tok = tokens[s];
        if (step.kind === 'hit') {
          if (!tok) throw new Error(`적중한 프레임 ${s} 이 비어 있다`);
          // 쓰인 페이지가 들썩인다
          animate(dur, (p) => place(tok.g, slotCx(s), slotCy - 8 * Math.sin(Math.PI * p)));
        } else {
          if (step.kind === 'evict') {
            if (!tok) throw new Error(`내보낼 프레임 ${s} 이 비어 있다`);
            dropOut(tok.g, slotCx(s), moveDur * 0.6, moveDelay);
          } else if (tok) {
            throw new Error(`빈 프레임이라던 ${s} 에 페이지가 있다`);
          }
          const g = makeToken(step.page);
          const x0 = refCx(i);
          const y0 = REF_Y + REF_H / 2;
          place(g, x0, y0, 0);
          animate(
            moveDur,
            (p) => place(g, lerp(x0, slotCx(s), p), lerp(y0, slotCy, p), p === 0 ? 0 : 1),
            moveDelay,
          );
          tokens[s] = { g, page: step.page };
        }

        // 판단 근거 — 때 줄 (FIFO · LRU)
        if (!clock) {
          const stamp = step.stamps[s];
          if (stamp === undefined) throw new Error(`프레임 ${s} 의 때가 없다`);
          const toX = refCx(stamp);
          const chip = chips[s];
          if (step.kind === 'hit') {
            if (!chip) throw new Error(`적중한 프레임 ${s} 의 때 표지가 없다`);
            // LRU: 지금으로 당겨진다. FIFO: 그대로
            const fromX = chip.x;
            chip.x = toX;
            if (fromX !== toX) animate(dur, (p) => place(chip.g, lerp(fromX, toX, p), LANE_Y));
          } else {
            if (step.kind === 'evict') {
              if (!chip) throw new Error(`내보낸 프레임 ${s} 의 때 표지가 없다`);
              // 줄의 맨 앞이 떨어진다
              animate(dur * 0.6, (p) => {
                place(chip.g, chip.x, LANE_Y + 34 * p, 1 - p);
                if (p >= 1) chip.g.remove();
              });
            }
            const g = makeChip(step.page);
            place(g, toX, REF_Y, 0);
            animate(dur, (p) => place(g, toX, lerp(REF_Y, LANE_Y, p), p === 0 ? 0 : 1));
            chips[s] = { g, x: toX };
          }
        }

        // 표시 — 걸음 뒤 상태로 (지운 칸은 바늘이 지날 때 먼저 0 이 된다)
        if (clock) {
          animate(dur, (p) => {
            if (p < 1) return;
            for (let q = 0; q < frames; q += 1) setMarkText(q, step.pages[q] === -1 ? null : (step.marks[q] ?? null));
          });
          if (step.kind !== 'evict') {
            for (let q = 0; q < frames; q += 1) {
              if (q === s || step.pages[q] === -1) continue;
              setMarkText(q, step.marks[q] ?? null);
            }
            setMarkText(s, step.marks[s] ?? null);
          }
        }

        // 지금 판 막대가 자란다
        if (step.kind !== 'hit' && current >= 0) setBar(current, step.faults, dur);
      },

      setCaption(text) {
        caption.textContent = text;
      },

      destroy() {
        destroyed = true;
        if (frameId !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
        tweens.clear();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
    return stage;
  },
};
