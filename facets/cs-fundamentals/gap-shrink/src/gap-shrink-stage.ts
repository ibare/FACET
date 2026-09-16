/**
 * gap-shrink-stage — 보폭이 좁아지는 것을 보이는 캔버스.
 *
 * 화면의 뼈대는 셋이다.
 *   1. 값 칸 한 줄. 칸은 자리이고 숫자는 따로 떠서 자리를 옮긴다 — 멀리 견줄 때
 *      값이 여러 칸을 한 번에 건너뛰는 것이 이 조각의 동사다.
 *   2. 칸 아래의 보폭 자. 지금 견주는 두 끝을 재는 물건이라 폭이 곧 간격이며,
 *      라운드가 바뀌면 그 폭이 옆칸 하나로 줄어든다.
 *   3. 아래 장부 두 줄. 보폭을 줄여 온 쪽과 처음부터 옆칸만 견준 쪽의 견줌·이동
 *      횟수. 이동 횟수의 길이 차이가 이 조각의 근거다.
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 그 다음에 방금 달라진 것만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 없고, 되짚기가 앞으로 가기와 같은 길을 탄다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 값도 자도 이미 끝 자리에 서
 * 있고, 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다. 그 출발 자리는
 * 장면의 `step` 이 실어 온 칸 번호에서 셈한다. `prev` 는 쓰지 않는다 (S-scene).
 *
 * ── 채움과 테두리를 갈라 둔다
 *
 * 값이 실제로 자리를 옮기는 조각이라 이 갈래가 특히 중요하다. 고른 쪽을 **채움**으로
 * 칠하면 맞바꾼 뒤 그 자리에 진 값이 앉아 읽기가 뒤집힌다. 그래서
 *   - **채움은 값의 형편** — 아직 굴러가는 중이냐, 다 굳었느냐.
 *   - **테두리는 견줌의 표식** — 이 둘을 견주었다 / 이 둘을 맞바꿨다.
 * 테두리는 자리에 붙는 말이라 누가 앉든 참이다.
 *
 * 세로는 canvas 선언으로 정해지고 그 뒤 바뀌지 않는다 (S-view).
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다.
 * 화면 문자는 전부 `params.t` 로 만든다 — 문안은 `facet.ts` 의 `messages` 에 있다
 * (C10). 칸에 적힌 값과 장부의 수는 숫자 표식이라 문안이 아니다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import { strideOf, type GapShrinkCaption, type GapShrinkScene, type GapShrinkSpan } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 256;

// 가로 — 상수는 상한만 두고 실제 크기는 캔버스에서 역산한다 (S-piece).
const CELL_MAX_W = 92;
const SIDE_MIN = 30;
const SLOT_INSET = 5;

// 세로 — 위에서부터 캡션 / 건너뛰는 길 / 칸 / 보폭 자 / 장부.
const CAPTION_Y = 18;
const CELL_TOP = 76;
const CELL_H = 48;
const CELL_MID = CELL_TOP + CELL_H / 2;
const BRACKET_Y = 140;
const TICK_TOP = 132;
const TICK_BOTTOM = 148;
const STRIDE_LABEL_Y = 164;
const DIVIDER_Y = 178;
const LEDGER_HEAD_Y = 192;
const LEDGER_ROW1_Y = 214;
const LEDGER_ROW2_Y = 238;

// 장부의 열.
const COL_COMPARES_X = 300;
const COL_MOVES_X = 372;
const PIP_X0 = 392;
const PIP_STEP = 16;
const PIP_R = 5;

// 지속시간. 걸음 하나는 여기에 stepMs 가 더해진다 (S-piece).
const GROW_MS = 380;
const SLIDE_MS = 190;
const FLASH_MS = 130;
const HOP_MS = 400;
const BASELINE_PIP_MS = 70;
const FADE_MS = 300;
/** 맞바꿈 한 번을 장부에 적는 점이 다 자라는 몫. 뛰는 것과 한 시계를 쓴다. */
const PIP_SHARE = 0.4;

// 칸 테두리 — 기본 / 견준 짝 / 맞바꾼 짝.
const STROKE_PLAIN = 1.5;
const STROKE_COMPARED = 3.5;
const STROKE_SWAPPED = 5;
/** 견주는 순간 테두리가 잠깐 부푸는 폭. */
const RING_SWELL = 3;

/** 멀리 뛸수록 높이 뜬다 — 건너뛴 칸 수가 길이와 높이 양쪽으로 읽히게. */
const highApex = (gap: number): number => 26 + gap * 8;
const lowApex = (gap: number): number => 6 + gap * 2;

/** 아직 세지 않은 칸. 그래픽에 새긴 표식이라 번역하지 않는다 (C10). */
const NOT_YET = '—';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** 2차 베지어. t=0.5 에서 apex 만큼 솟는다. */
function arcAt(
  x0: number,
  x1: number,
  baseY: number,
  apex: number,
  t: number,
): { x: number; y: number } {
  const cx = (x0 + x1) / 2;
  const cy = baseY - apex * 2;
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * cx + t * t * x1,
    y: u * u * baseY + 2 * u * t * cy + t * t * baseY,
  };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 보폭 자의 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type BracketEls = {
  g: SVGGElement;
  line: SVGLineElement;
  tickLeft: SVGLineElement;
  tickRight: SVGLineElement;
  label: SVGTextElement;
};

export const gapShrinkStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<GapShrinkScene> {
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);
    const palette: Palette = getColors(params.theme);
    const slotRadius = parseInt(radii.md, 10);

    // 한 번만 세우는 껍데기. 안에 담기는 것은 걸음마다 통째로 다시 짓는다 —
    // 그래서 "정적 경로가 매번 명시로 쓰는가" 를 따로 살필 재건 밖 요소가 없다.
    const root = el('g');
    svg.appendChild(root);

    // ── 기하. 장면의 `origin` 길이가 정하므로 좌표는 장면에 담지 않는다 (S-piece).
    let cellCount = 1;
    let cellW = CELL_MAX_W;
    let originX = 0;
    let roundInk: readonly string[] = [];

    function layout(scene: GapShrinkScene): void {
      cellCount = Math.max(1, scene.origin.length);
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / cellCount));
      originX = Math.round((W - cellCount * cellW) / 2);
      // 색판의 크기는 **바탕에서 한 번에** 센다. 걸음마다 자라는 셈을 씨앗으로 쓰면
      // 라운드가 하나 더 드러날 때 이미 칠한 라운드의 색이 갈린다.
      roundInk = categorical(Math.max(2, scene.gaps.length), 'vivid');
    }

    function slotCenter(i: number): number {
      return originX + i * cellW + cellW / 2;
    }

    function roundColor(round: number | null): string {
      if (round === null || roundInk.length === 0) return palette.text;
      return roundInk[round % roundInk.length] ?? palette.text;
    }

    // ── 이번 장면이 세운 DOM 손잡이.
    let slotEls: SVGRectElement[] = [];
    let glyphEls: SVGTextElement[] = [];
    let shrinkPipEls: SVGCircleElement[] = [];
    let nearPipEls: SVGCircleElement[] = [];
    let bracketEls: BracketEls | null = null;
    let captionEl: SVGTextElement | null = null;

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 모든 요소를 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로
    // 다시 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미
    // 새로 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를 올리고,
    // 운동은 `await` 뒤마다 자기 세대를 확인한 뒤에만 화면에 손을 댄다 (S-scene).
    // `isInstant` 와 `onScrubStart` 는 러너가 장면 조각에서 부르지 않으므로 빗장이
    // 되지 못한다 — 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다.
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const canAnimate = typeof requestAnimationFrame === 'function';
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /** 한 걸음을 한 시계로 흐르게 한다. 세대가 지나면 화면에 손대지 않고 물러난다. */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine) || !canAnimate || ms <= 0) {
          if (alive(mine)) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 장면이 정하는 칠.

    /** 채움은 **값의 형편**이다. 굴러가는 중이냐, 다 굳었느냐. */
    function fillFor(scene: GapShrinkScene): { cell: string; ink: string } {
      return scene.finished
        ? { cell: palette.itemSorted, ink: palette.textInverse }
        : { cell: palette.itemDefault, ink: palette.text };
    }

    /**
     * 테두리는 **견줌의 표식**이다. 맞바꾼 표식이 견준 표식을 이긴다 — 그 걸음이
     * 하는 말이 "이 둘을 바꿨다" 이기 때문이다.
     */
    function strokeFor(scene: GapShrinkScene, i: number): { color: string; width: number } {
      const sw = scene.swapped;
      if (sw !== null && (i === sw.left || i === sw.right)) {
        return { color: palette.itemSwapping, width: STROKE_SWAPPED };
      }
      const cm = scene.compared;
      if (cm !== null && (i === cm.left || i === cm.right)) {
        return { color: palette.itemComparing, width: STROKE_COMPARED };
      }
      if (scene.finished) return { color: palette.itemSorted, width: STROKE_PLAIN };
      return { color: palette.border, width: STROKE_PLAIN };
    }

    // ── 보폭 자.

    function placeBracket(b: BracketEls, x0: number, x1: number): void {
      b.line.setAttribute('x1', String(x0));
      b.line.setAttribute('x2', String(x1));
      b.tickLeft.setAttribute('x1', String(x0));
      b.tickLeft.setAttribute('x2', String(x0));
      b.tickRight.setAttribute('x1', String(x1));
      b.tickRight.setAttribute('x2', String(x1));
      b.label.setAttribute('x', String((x0 + x1) / 2));
    }

    /** 자 하나를 짓는다. 자리는 부르는 쪽이 `placeBracket` 으로 정한다. */
    function makeBracket(parent: SVGGElement, ink: string, text: string): BracketEls {
      const g = el('g');
      const line = el('line', {
        y1: BRACKET_Y,
        y2: BRACKET_Y,
        stroke: ink,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      const tickLeft = el('line', {
        y1: TICK_TOP,
        y2: TICK_BOTTOM,
        stroke: ink,
        'stroke-width': 2,
      });
      const tickRight = el('line', {
        y1: TICK_TOP,
        y2: TICK_BOTTOM,
        stroke: ink,
        'stroke-width': 2,
      });
      const label = el('text', {
        y: STRIDE_LABEL_Y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: ink,
      });
      label.textContent = text;
      g.append(line, tickLeft, tickRight, label);
      parent.appendChild(g);
      return { g, line, tickLeft, tickRight, label };
    }

    /** 자에 적히는 보폭. 간격은 `strideOf` 하나만 지난다. */
    function strideText(scene: GapShrinkScene): string {
      const gap = strideOf(scene);
      return gap === null ? '' : tr('label.stride', 'stride {gap}', { gap });
    }

    // ── 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene).
    function rewind(): void {
      root.replaceChildren();
      slotEls = [];
      glyphEls = [];
      shrinkPipEls = [];
      nearPipEls = [];
      bracketEls = null;
      captionEl = null;
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 칸 · 값 · 보폭 자 · 견줌의 테 · 장부의 수와 점이 모두 여기서 난다. 남는
     * 강조(맞바꾼 짝 · 대조군 장부 · 굳은 줄)를 여기 넣어야 되짚었을 때 남는다.
     */
    function drawStatic(scene: GapShrinkScene): void {
      layout(scene);

      const bracketLayer = el('g');
      const slotLayer = el('g');
      const glyphLayer = el('g');
      const ledgerLayer = el('g');
      root.append(bracketLayer, slotLayer, glyphLayer, ledgerLayer);

      captionEl = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: palette.text,
      });
      root.appendChild(captionEl);

      // 자 — 걸친 자리가 없으면 **숨기지 않고 짓지 않는다.** 숨기기만 하면 앞 걸음의
      // 폭이 속성으로 남아 되짚기 판정에서 어긋난다.
      if (scene.span !== null) {
        bracketEls = makeBracket(bracketLayer, roundColor(scene.round), strideText(scene));
        placeBracket(bracketEls, slotCenter(scene.span.left), slotCenter(scene.span.right));
      }

      // 칸(자리)과 숫자(값). 둘을 갈라 두어야 값만 자리를 건너뛸 수 있다.
      const paint = fillFor(scene);
      for (let i = 0; i < cellCount; i += 1) {
        const stroke = strokeFor(scene, i);
        const rect = el('rect', {
          x: originX + i * cellW + SLOT_INSET,
          y: CELL_TOP,
          width: cellW - SLOT_INSET * 2,
          height: CELL_H,
          rx: slotRadius,
          fill: paint.cell,
          stroke: stroke.color,
          'stroke-width': stroke.width,
        });
        slotLayer.appendChild(rect);
        slotEls.push(rect);

        const value = scene.values[i];
        const glyph = el('text', {
          x: slotCenter(i),
          y: CELL_MID,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 600,
          fill: paint.ink,
        });
        // 값 표기는 숫자 표식이다 (C10) — 키를 만들지 않는다.
        glyph.textContent = typeof value === 'number' ? String(value) : '';
        glyphLayer.appendChild(glyph);
        glyphEls.push(glyph);
      }

      drawLedger(ledgerLayer, scene);
    }

    /** 장부 — 두 줄의 수와 점. 이 조각의 근거가 여기 남는다. */
    function drawLedger(layer: SVGGElement, scene: GapShrinkScene): void {
      layer.appendChild(
        el('line', {
          x1: originX,
          x2: originX + cellCount * cellW,
          y1: DIVIDER_Y,
          y2: DIVIDER_Y,
          stroke: palette.border,
          'stroke-width': 1,
        }),
      );

      const text = (
        x: number,
        y: number,
        anchor: string,
        size: string,
        fill: string,
        family: string,
        body: string,
      ): SVGTextElement => {
        const node = el('text', {
          x,
          y,
          'text-anchor': anchor,
          'dominant-baseline': 'central',
          'font-family': family,
          'font-size': size,
          fill,
        });
        node.textContent = body;
        layer.appendChild(node);
        return node;
      };

      text(
        COL_COMPARES_X,
        LEDGER_HEAD_Y,
        'end',
        fontSizes.xs,
        palette.textMuted,
        fonts.body,
        tr('label.compares', 'compares'),
      );
      text(
        COL_MOVES_X,
        LEDGER_HEAD_Y,
        'end',
        fontSizes.xs,
        palette.textMuted,
        fonts.body,
        tr('label.moves', 'moves'),
      );
      text(
        originX,
        LEDGER_ROW1_Y,
        'start',
        fontSizes.sm,
        palette.text,
        fonts.body,
        tr('label.shrinkRun', 'stride shrinking'),
      );
      text(
        originX,
        LEDGER_ROW2_Y,
        'start',
        fontSizes.sm,
        palette.textMuted,
        fonts.body,
        tr('label.nearOnly', 'neighbours only'),
      );

      const numeral = (y: number, x: number, fill: string, body: string): void => {
        text(x, y, 'end', fontSizes.lg, fill, fonts.mono, body).setAttribute('font-weight', '600');
      };

      // 보폭을 줄여 온 쪽 — 걸어온 발신을 센 수다.
      numeral(LEDGER_ROW1_Y, COL_COMPARES_X, palette.text, String(scene.comparisons));
      numeral(LEDGER_ROW1_Y, COL_MOVES_X, palette.text, String(scene.moves.length));

      // 대조군 — 아직 안 드러났으면 자리만 지킨다.
      const base = scene.baseline;
      const baseInk = base === null ? palette.textMuted : palette.text;
      numeral(
        LEDGER_ROW2_Y,
        COL_COMPARES_X,
        baseInk,
        base === null ? NOT_YET : String(base.comparisons),
      );
      numeral(LEDGER_ROW2_Y, COL_MOVES_X, baseInk, base === null ? NOT_YET : String(base.moves));

      // 점 — 이동 하나에 하나. 줄여 온 쪽은 그때의 라운드 색으로 남아, 다 끝난
      // 화면에서도 어느 보폭에서 몇 번 옮겼는지가 읽힌다.
      for (let i = 0; i < scene.moves.length; i += 1) {
        const pip = el('circle', {
          cx: PIP_X0 + i * PIP_STEP,
          cy: LEDGER_ROW1_Y,
          r: PIP_R,
          fill: roundColor(scene.moves[i] ?? null),
        });
        layer.appendChild(pip);
        shrinkPipEls.push(pip);
      }
      if (base !== null) {
        for (let i = 0; i < base.moves; i += 1) {
          const pip = el('circle', {
            cx: PIP_X0 + i * PIP_STEP,
            cy: LEDGER_ROW2_Y,
            r: PIP_R,
            fill: palette.textMuted,
          });
          layer.appendChild(pip);
          nearPipEls.push(pip);
        }
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: GapShrinkCaption | null): void {
      if (captionEl === null) return;
      if (cap === null) {
        captionEl.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'roundFar':
          captionEl.textContent = tr(
            'caption.roundFar',
            'Round {round} — compare pairs {gap} cells apart',
            { round: cap.round, gap: cap.gap },
          );
          return;
        case 'roundNear':
          captionEl.textContent = tr('caption.roundNear', 'Round {round} — compare neighbours', {
            round: cap.round,
          });
          return;
        case 'baseline':
          captionEl.textContent = tr(
            'caption.baseline',
            'The same input, neighbours only from the start:',
          );
          return;
        case 'result':
          captionEl.textContent = tr(
            'caption.result',
            'Shrinking the stride: {moves} moves. Neighbours only: {baseMoves}.',
            { moves: cap.moves, baseMoves: cap.baseMoves },
          );
          return;
      }
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 되돌려 놓고 시작한다. 출발 자리는 `step` 이 실어 온 칸 번호에서
    //    셈한다 — `prev` 에서 꺼내지 않는다 (S-scene).

    /**
     * 자가 옮겨 간다. 라운드가 바뀌면 벌어지거나 **좁아지고**, 견줌마다 그 짝으로
     * 미끄러진다. 견줌이면 그 뒤에 두 칸의 테가 잠깐 부푼다 — 한 뜻의 운동이라
     * 시계 하나로 이어 돌린다.
     */
    function glide(
      scene: GapShrinkScene,
      from: GapShrinkSpan | null,
      to: GapShrinkSpan,
      moveMs: number,
      pulseMs: number,
      mine: number,
    ): Promise<void> {
      const b = bracketEls;
      if (b === null) return Promise.resolve();
      // 처음 서는 자는 한 점에서 벌어진다.
      const start = from ?? { left: to.left, right: to.left };
      const x0a = slotCenter(start.left);
      const x1a = slotCenter(start.right);
      const x0b = slotCenter(to.left);
      const x1b = slotCenter(to.right);

      // 제 굵기는 장면에서 셈한다 — 화면을 도로 읽으면 되짚은 직후 값이 갈린다.
      const marks: { rect: SVGRectElement; width: number }[] = [];
      const cm = scene.compared;
      if (pulseMs > 0 && cm !== null) {
        for (const i of [cm.left, cm.right]) {
          const rect = slotEls[i];
          if (rect !== undefined) marks.push({ rect, width: strokeFor(scene, i).width });
        }
      }

      const total = moveMs + pulseMs;
      const cut = total === 0 ? 1 : moveMs / total;
      return animate(total, mine, (p) => {
        const q = cut <= 0 ? 1 : clamp01(p / cut);
        placeBracket(b, x0a + (x0b - x0a) * q, x1a + (x1b - x1a) * q);
        if (marks.length === 0) return;
        const r = cut >= 1 ? 0 : clamp01((p - cut) / (1 - cut));
        const swell = Math.sin(r * Math.PI) * RING_SWELL;
        for (const m of marks) m.rect.setAttribute('stroke-width', String(m.width + swell));
      });
    }

    /**
     * 맞바꿈 — 두 값이 서로의 자리로 활을 그리며 건너뛰고, 장부에 점이 하나 는다.
     *
     * 셋이 한 뜻이라 **시계 하나, 한 목록**으로 돌린다. 나눠 돌리면 lockstep 이
     * 우연히 맞는 꼴이 되고 하나를 `void` 로 흘릴 여지가 생긴다.
     */
    function hop(left: number, right: number, mine: number): Promise<void> {
      const goingLeft = glyphEls[left];
      const goingRight = glyphEls[right];
      if (goingLeft === undefined || goingRight === undefined) return Promise.resolve();
      // 정적 그리기가 이미 맞바꾼 뒤를 세웠다 — 왼쪽 칸의 값은 오른쪽에서 왔다.
      const xL = slotCenter(left);
      const xR = slotCenter(right);
      const gap = Math.abs(right - left);
      const pip = shrinkPipEls[shrinkPipEls.length - 1];

      return animate(HOP_MS, mine, (p) => {
        // 오른쪽으로 가는 값이 높이 뜬다 — 건너뛴 칸 수가 높이로도 읽힌다.
        const a = arcAt(xL, xR, CELL_MID, highApex(gap), p);
        goingRight.setAttribute('x', String(a.x));
        goingRight.setAttribute('y', String(a.y));
        const b = arcAt(xR, xL, CELL_MID, lowApex(gap), p);
        goingLeft.setAttribute('x', String(b.x));
        goingLeft.setAttribute('y', String(b.y));
        if (pip !== undefined) {
          pip.setAttribute('r', String(PIP_R * clamp01(p / PIP_SHARE)));
        }
      });
    }

    /** 대조군 장부가 왼쪽부터 차례로 찍힌다. 한 줄이 채워지는 한 뜻이라 시계 하나. */
    function fillBaseline(mine: number): Promise<void> {
      const pips = nearPipEls;
      if (pips.length === 0) return Promise.resolve();
      return animate(pips.length * BASELINE_PIP_MS, mine, (p) => {
        const reached = p * pips.length;
        for (let i = 0; i < pips.length; i += 1) {
          pips[i].setAttribute('r', String(PIP_R * clamp01(reached - i)));
        }
      });
    }

    /**
     * 자가 걷힌다 — 폭이 0 으로 줄며 사라진다. 이 조각의 동사와 같은 동사다.
     *
     * 정적 그리기는 끝난 화면에 자를 두지 않으므로 여기서 임시로 세운다. 운동의
     * 방향이 뒤집힌 자리다.
     */
    function retract(scene: GapShrinkScene, from: GapShrinkSpan | null, mine: number): Promise<void> {
      if (from === null) return Promise.resolve();
      const b = makeBracket(root, roundColor(scene.round), strideText(scene));
      const x0 = slotCenter(from.left);
      const x1 = slotCenter(from.right);
      const mid = (x0 + x1) / 2;
      placeBracket(b, x0, x1);
      return animate(FADE_MS, mine, (p) => {
        placeBracket(b, x0 + (mid - x0) * p, x1 + (mid - x1) * p);
        b.g.setAttribute('opacity', String(1 - p));
      }).then(() => {
        b.g.remove();
      });
    }

    function flow(scene: GapShrinkScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'round':
          return glide(scene, step.from, step.to, GROW_MS, 0, mine);
        case 'compare':
          return glide(scene, step.from, step.to, SLIDE_MS, FLASH_MS, mine);
        case 'swap':
          return hop(step.left, step.right, mine);
        case 'baseline':
          return fillBaseline(mine);
        case 'done':
          return retract(scene, step.from, mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성이 한꺼번에 사라져, 흐른 화면과 곧바로 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 `step` 이 실어 온 칸
     * 번호에서 셈한다 (S-scene).
     */
    async function render(
      next: GapShrinkScene,
      _prev: GapShrinkScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      rewind();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (canAnimate) for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
        root.remove();
      },
    };
  },
};
