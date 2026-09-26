/**
 * layoutPerFrame 의 그림.
 *
 * 위: 실제로 바뀌는 CSS 선언 한 줄과 이번 걸음의 캡션.
 * 가운데: 상자가 `left` 만큼 옆으로 간다 — 그 아래 자리(position)와 너비(width)
 * 자막이 상자를 그대로 따라다니며, 장마다 다시 잰 값을 보인다(너비는 값이 그대로여도
 * 다시 잰다는 것을 색 번쩍임으로 보인다).
 * 아래: style → layout → paint → composite 네 단계가 장마다 순서대로 번쩍이며
 * 누적 횟수를 올린다.
 */
import type { CanvasView, Palette } from '@ffacet/core/runtime';
import { getColors, makeTranslator, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { LayoutPerFrameScene } from './scene.js';

const H = 290;
const SIDE_MARGIN = 30;
const SCALE_MAX = 6;

const CODE_Y = 24;
const CAPTION1_Y = 46;
const CAPTION2_Y = 64;
const TRACK_Y = 148;
const BOX_H = 50;
const BOX_TOP = TRACK_Y - BOX_H;
const POS_TICK_BOTTOM = TRACK_Y + 12;
const POS_LABEL_Y = TRACK_Y + 26;
const BRACKET_Y = TRACK_Y + 40;
const BRACKET_TICK_H = 4;
const BRACKET_LABEL_Y = BRACKET_Y + 16;
const CHIP_Y = BRACKET_LABEL_Y + 24;
const CHIP_H = 34;
const CHIP_GAP = 14;

/** 장 하나의 애니메이션을 여덟 눈금으로 나눈다 — 40ms 씩, 총 320ms. */
const TOTAL_TICKS = 8;
const TICK_MS = 40;

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
}

type ChipKey = 'style' | 'layout' | 'paint' | 'composite';
const CHIP_KEYS: readonly ChipKey[] = ['style', 'layout', 'paint', 'composite'];

export const layoutPerFrameStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params) {
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${PIECE_CANVAS_W} ${H}`);
    const t = params.t ?? makeTranslator(params.locale);
    const palette: Palette = getColors(params.theme);

    // ── 정적 구조 (한 번만 만든다) ──────────────────────────────────────
    const codeText = svgEl('text');
    codeText.setAttribute('x', String(PIECE_CANVAS_W / 2));
    codeText.setAttribute('y', String(CODE_Y));
    codeText.setAttribute('text-anchor', 'middle');
    codeText.setAttribute('font-family', fonts.mono);
    codeText.setAttribute('font-size', fontSizes.lg);
    codeText.setAttribute('fill', palette.text);
    svg.appendChild(codeText);

    const captionLine1 = svgEl('text');
    captionLine1.setAttribute('x', String(PIECE_CANVAS_W / 2));
    captionLine1.setAttribute('y', String(CAPTION1_Y));
    captionLine1.setAttribute('text-anchor', 'middle');
    captionLine1.setAttribute('font-family', fonts.body);
    captionLine1.setAttribute('font-size', fontSizes.sm);
    captionLine1.setAttribute('fill', palette.text);
    svg.appendChild(captionLine1);

    const captionLine2 = svgEl('text');
    captionLine2.setAttribute('x', String(PIECE_CANVAS_W / 2));
    captionLine2.setAttribute('y', String(CAPTION2_Y));
    captionLine2.setAttribute('text-anchor', 'middle');
    captionLine2.setAttribute('font-family', fonts.body);
    captionLine2.setAttribute('font-size', fontSizes.sm);
    captionLine2.setAttribute('fill', palette.textMuted);
    svg.appendChild(captionLine2);

    const baseline = svgEl('line');
    baseline.setAttribute('y1', String(TRACK_Y));
    baseline.setAttribute('y2', String(TRACK_Y));
    baseline.setAttribute('stroke', palette.border);
    baseline.setAttribute('stroke-dasharray', '3 3');
    svg.appendChild(baseline);

    const tickMarks = svgEl('g');
    svg.appendChild(tickMarks);

    const box = svgEl('rect');
    box.setAttribute('y', String(BOX_TOP));
    box.setAttribute('height', String(BOX_H));
    box.setAttribute('rx', '4');
    box.setAttribute('fill', palette.primary);
    svg.appendChild(box);

    const posTick = svgEl('line');
    posTick.setAttribute('y1', String(TRACK_Y));
    posTick.setAttribute('y2', String(POS_TICK_BOTTOM));
    posTick.setAttribute('stroke', palette.border);
    svg.appendChild(posTick);

    const posLabel = svgEl('text');
    posLabel.setAttribute('y', String(POS_LABEL_Y));
    posLabel.setAttribute('text-anchor', 'middle');
    posLabel.setAttribute('font-family', fonts.body);
    posLabel.setAttribute('font-size', fontSizes.xs);
    posLabel.setAttribute('fill', palette.textMuted);
    svg.appendChild(posLabel);

    const bracketLeftTick = svgEl('line');
    const bracketRightTick = svgEl('line');
    const bracketLine = svgEl('line');
    bracketLine.setAttribute('y1', String(BRACKET_Y));
    bracketLine.setAttribute('y2', String(BRACKET_Y));
    svg.appendChild(bracketLeftTick);
    svg.appendChild(bracketRightTick);
    svg.appendChild(bracketLine);

    const bracketLabel = svgEl('text');
    bracketLabel.setAttribute('y', String(BRACKET_LABEL_Y));
    bracketLabel.setAttribute('text-anchor', 'middle');
    bracketLabel.setAttribute('font-family', fonts.body);
    bracketLabel.setAttribute('font-size', fontSizes.xs);
    bracketLabel.setAttribute('fill', palette.textMuted);
    svg.appendChild(bracketLabel);

    const chips = CHIP_KEYS.map(() => {
      const rect = svgEl('rect');
      rect.setAttribute('y', String(CHIP_Y));
      rect.setAttribute('height', String(CHIP_H));
      rect.setAttribute('rx', '6');
      rect.setAttribute('stroke', palette.border);
      svg.appendChild(rect);
      const text = svgEl('text');
      text.setAttribute('y', String(CHIP_Y + CHIP_H / 2 + 4));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', fonts.body);
      text.setAttribute('font-size', fontSizes.sm);
      svg.appendChild(text);
      return { rect, text };
    });

    const arrows: SVGLineElement[] = [];
    for (let i = 0; i < CHIP_KEYS.length - 1; i += 1) {
      const arrow = svgEl('line');
      arrow.setAttribute('y1', String(CHIP_Y + CHIP_H / 2));
      arrow.setAttribute('y2', String(CHIP_Y + CHIP_H / 2));
      arrow.setAttribute('stroke', palette.border);
      arrow.setAttribute('stroke-width', '2');
      svg.appendChild(arrow);
      arrows.push(arrow);
    }

    // ── 캔버스 폭에서 역산하는 지오메트리 (한 번만 셈해 캐시) ────────────
    let scale = 0;
    let originX = 0;

    function ensureGeometry(s: LayoutPerFrameScene): void {
      if (scale !== 0) return;
      const span = s.frames * s.perFrame + s.width;
      const avail = PIECE_CANVAS_W - SIDE_MARGIN * 2;
      scale = Math.min(SCALE_MAX, avail / span);
      originX = SIDE_MARGIN;

      baseline.setAttribute('x1', String(originX - 10));
      baseline.setAttribute('x2', String(originX + scale * span + 10));

      for (let k = 0; k <= s.frames; k += 1) {
        const tickX = originX + scale * (s.perFrame * k);
        const tick = svgEl('line');
        tick.setAttribute('x1', String(tickX));
        tick.setAttribute('x2', String(tickX));
        tick.setAttribute('y1', String(TRACK_Y - 3));
        tick.setAttribute('y2', String(TRACK_Y + 3));
        tick.setAttribute('stroke', palette.border);
        tickMarks.appendChild(tick);
      }

      const chipAvail = PIECE_CANVAS_W - SIDE_MARGIN * 2;
      const chipW = Math.floor((chipAvail - CHIP_GAP * (CHIP_KEYS.length - 1)) / CHIP_KEYS.length);
      const used = chipW * CHIP_KEYS.length + CHIP_GAP * (CHIP_KEYS.length - 1);
      const chipOriginX = SIDE_MARGIN + Math.round((chipAvail - used) / 2);
      const chipLayout = CHIP_KEYS.map((_, i) => ({ x: chipOriginX + i * (chipW + CHIP_GAP), w: chipW }));

      chips.forEach((c, i) => {
        const layout = chipLayout[i]!;
        c.rect.setAttribute('x', String(layout.x));
        c.rect.setAttribute('width', String(layout.w));
        c.text.setAttribute('x', String(layout.x + layout.w / 2));
      });
      arrows.forEach((arrow, i) => {
        const from = chipLayout[i]!;
        const to = chipLayout[i + 1]!;
        arrow.setAttribute('x1', String(from.x + from.w));
        arrow.setAttribute('x2', String(to.x));
      });
    }

    function declOf(left: number): string {
      return `left: ${left}px;`;
    }

    function setBoxAt(leftPx: number, widthPx: number): void {
      const x = originX + scale * leftPx;
      const w = scale * widthPx;
      box.setAttribute('x', String(x));
      box.setAttribute('width', String(w));

      posTick.setAttribute('x1', String(x));
      posTick.setAttribute('x2', String(x));
      posLabel.setAttribute('x', String(x));
      posLabel.textContent = t('label.position', 'Position: {x}px', { x: Math.round(leftPx) });

      bracketLeftTick.setAttribute('x1', String(x));
      bracketLeftTick.setAttribute('x2', String(x));
      bracketLeftTick.setAttribute('y1', String(BRACKET_Y - BRACKET_TICK_H));
      bracketLeftTick.setAttribute('y2', String(BRACKET_Y + BRACKET_TICK_H));
      bracketRightTick.setAttribute('x1', String(x + w));
      bracketRightTick.setAttribute('x2', String(x + w));
      bracketRightTick.setAttribute('y1', String(BRACKET_Y - BRACKET_TICK_H));
      bracketRightTick.setAttribute('y2', String(BRACKET_Y + BRACKET_TICK_H));
      bracketLine.setAttribute('x1', String(x));
      bracketLine.setAttribute('x2', String(x + w));
      bracketLabel.setAttribute('x', String(x + w / 2));
      bracketLabel.textContent = t('label.width', 'Width: {width}px', { width: Math.round(widthPx) });
    }

    function setMeasureHighlight(active: boolean): void {
      const stroke = active ? palette.itemActive : palette.border;
      posTick.setAttribute('stroke', stroke);
      bracketLeftTick.setAttribute('stroke', stroke);
      bracketRightTick.setAttribute('stroke', stroke);
      bracketLine.setAttribute('stroke', stroke);
    }

    function chipLabelFor(key: ChipKey): string {
      switch (key) {
        case 'style':
          return t('label.style', 'Style');
        case 'layout':
          return t('label.layout', 'Layout');
        case 'paint':
          return t('label.paint', 'Paint');
        case 'composite':
          return t('label.composite', 'Composite');
        default: {
          const exhaustive: never = key;
          return exhaustive;
        }
      }
    }

    function setChipFill(i: number, active: boolean): void {
      const chip = chips[i]!;
      chip.rect.setAttribute('fill', active ? palette.itemActive : palette.itemDefault);
      chip.text.setAttribute('fill', active ? palette.stateInk : palette.text);
    }

    function setChipCount(i: number, count: number): void {
      const chip = chips[i]!;
      const label = chipLabelFor(CHIP_KEYS[i]!);
      chip.text.textContent = t('chip.count', '{label}: {count}', { label, count });
    }

    function setCaptionInit(s: LayoutPerFrameScene): void {
      captionLine1.textContent = t('caption.init', 'Before the animation — declaration: {decl}', {
        decl: declOf(s.left),
      });
      captionLine2.textContent = t('caption.initSub', 'Nothing measured, nothing painted yet.');
    }

    function setCaptionFrame(s: LayoutPerFrameScene): void {
      captionLine1.textContent = t('caption.frame', 'Frame {frameNum} — declaration: {decl}', {
        frameNum: s.frameNum,
        decl: declOf(s.left),
      });
      captionLine2.textContent = t('caption.frameSub', 'Layout re-measures position and width, then paint runs.');
    }

    /** 정본 — 그 장면의 화면 전체를 세운다. 운동이 남긴 색·자리를 여기서 되돌린다. */
    function drawStatic(s: LayoutPerFrameScene): void {
      codeText.textContent = declOf(s.left);
      if (s.step.kind === 'init') setCaptionInit(s);
      else setCaptionFrame(s);
      setBoxAt(s.left, s.width);
      setMeasureHighlight(false);
      setChipCount(0, s.style);
      setChipCount(1, s.measured);
      setChipCount(2, s.painted);
      setChipCount(3, s.composite);
      for (let i = 0; i < CHIP_KEYS.length; i += 1) setChipFill(i, false);
    }

    // ── 거두기 ──────────────────────────────────────────────────────────
    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    /**
     * 눈금 k(0..8)의 상자 자리. 0~4(스타일·레이아웃 단계)는 앞 자리에 머물고,
     * 4~6(페인트 단계)에서 다음 자리로 건너가며, 6~8(합성 단계)은 다음 자리에 머문다 —
     * "레이아웃이 먼저 재고, 그다음 페인트가 옮긴다" 는 차례를 그대로 그린다.
     */
    function boxLeftAtTick(k: number, prevLeft: number, nextLeft: number): number {
      if (k <= 4) return prevLeft;
      if (k >= 6) return nextLeft;
      const tt = (k - 4) / 2;
      return prevLeft + (nextLeft - prevLeft) * tt;
    }

    function applyTick(k: number, next: LayoutPerFrameScene): void {
      if (k === 0) {
        setChipFill(0, true);
      } else if (k === 2) {
        setChipFill(0, false);
        setChipCount(0, next.style);
        setChipFill(1, true);
        setMeasureHighlight(true);
      } else if (k === 4) {
        setChipFill(1, false);
        setChipCount(1, next.measured);
        setMeasureHighlight(false);
        setChipFill(2, true);
      } else if (k === 6) {
        setChipFill(2, false);
        setChipCount(2, next.painted);
        setChipFill(3, true);
      } else if (k === 8) {
        setChipFill(3, false);
        setChipCount(3, next.composite);
      }
    }

    async function playFrame(prev: LayoutPerFrameScene, next: LayoutPerFrameScene, mine: number): Promise<void> {
      codeText.textContent = declOf(next.left);
      setCaptionFrame(next);
      for (let k = 0; k <= TOTAL_TICKS; k += 1) {
        if (destroyed || mine !== gen) return;
        setBoxAt(boxLeftAtTick(k, prev.left, next.left), next.width);
        applyTick(k, next);
        if (k === TOTAL_TICKS) break;
        await wait(TICK_MS);
        if (destroyed || mine !== gen) return;
      }
    }

    return {
      render(next: LayoutPerFrameScene, prev: LayoutPerFrameScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        ensureGeometry(next);
        if (!opts.animate || prev === null || next.step.kind === 'init') {
          drawStatic(next);
          return;
        }
        return (async () => {
          await playFrame(prev, next, mine);
          if (destroyed || mine !== gen) return;
          drawStatic(next);
        })();
      },
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
