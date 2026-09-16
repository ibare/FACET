/**
 * heap-sort-extract-stage — 한 줄이 둘로 갈리고, 그 경계가 왼쪽으로 밀려간다.
 *
 * 화면은 칸 다섯짜리 줄 하나가 전부다. 줄 안쪽 어딘가에 세로 막대가 서 있고, 그
 * 왼쪽이 아직 다룰 힙, 오른쪽이 이미 끝난 꼬리다. 줄 아래의 자가 두 영역의 길이를
 * 그대로 보여 준다 — 힙 쪽은 **한 덩이**로 줄고, 꼬리 쪽은 **한 칸짜리 도막이 하나씩
 * 더해지며** 자란다. 그 도막들이 곧 "꺼낼 때마다 한 칸씩 물려받았다" 는 자국이고,
 * 다 끝난 화면에 다섯 도막으로 남는다 — 이 조각의 주장이 마지막 그림에 남는 자리다.
 *
 * 칠은 갈라 둔다. **채움은 값의 형편**(힙 안인가 / 정렬된 꼬리인가), **테두리는
 * 짚음의 표식**(이번에 꺼낼 꼭대기는 어느 칸인가). 고른 쪽을 채움으로 칠하면 값이
 * 자리를 옮긴 뒤 그 칸에 다른 값이 앉아 읽기가 뒤집힌다.
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 그 다음에 방금 달라진 것만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 없고, 되짚기가 앞으로 가기와 같은 길을 탄다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 값은 이미 끝 자리에 앉아
 * 있고, 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다. 그 출발 자리는
 * 장면의 `step` 이 실어 온 `order` 와 장면 자신에서 셈한다. `prev` 는 쓰지 않는다.
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다.
 *
 * 세로는 이 파일이 상수로 갖고, 가로는 `PIECE_CANVAS_W` 에서 역산한다. 상수는
 * 상한으로만 둔다 (S-piece / S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type SceneRenderer,
  type Theme,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { HeapSortExtractCaption, HeapSortExtractScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const W = PIECE_CANVAS_W;
const H = 240;

/** 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산한다. */
const CELL_MAX_W = 104;
/** 줄 좌우로 남겨 둘 최소 여백. */
const SIDE_MIN = 30;

const ROW_Y = 110;
const CELL_H = 58;
const ROW_BOTTOM = ROW_Y + CELL_H;
const CELL_CY = ROW_Y + CELL_H / 2;

/** 경계 막대가 줄 위아래로 삐져나오는 길이. */
const BAR_OVER = 12;
const BAR_W = 3;

const BRACKET_Y = ROW_BOTTOM + 20;
const BRACKET_H = 3;
/** 꼬리 자의 도막 사이에 남기는 틈. 한 칸씩 물려받았다는 자국이다. */
const SEG_GAP = 4;
const LABEL_Y = BRACKET_Y + 20;
const CAPTION_Y = H - 12;

/** 꺼낸 값이 지나는 위 차선 / 자리만 바꾸는 값이 지나는 가운데 차선. */
const LANE_HIGH = ROW_Y - 74;
const LANE_MID = ROW_Y - 24;
const CHIP_H = 34;

/** 꼭대기 표식의 테두리 굵기와 안쪽 여백. */
const TOP_STROKE = 3;
const TOP_INSET = 3;

const SHOW_MS = 260;
const LIFT_MS = 320;
const MOVE_MS = 560;
const FINISH_MS = 420;

/** 자가 이 폭보다 짧으면 라벨을 짓지 않는다 (글자가 자보다 길어지는 구간). */
const LABEL_MIN_W = 52;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - ((2 - 2 * p) * (2 - 2 * p)) / 2);

/** 공중에 뜬 값 하나의 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type Chip = { g: SVGGElement };

export const heapSortExtractStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<HeapSortExtractScene> {
    const svg = params.canvas;
    const theme: Theme = params.theme ?? 'light';
    const c = getColors(theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);
    const cornerR = Number.parseFloat(radii.md);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // ── 한 번만 세우는 껍데기. 안에 담기는 것은 걸음마다 다시 짓는다.
    //
    // 칸 색이 둥근 테두리 밖으로 삐져나오지 않게 줄 모양으로 오려 낸다. 오려 낼
    // 모양은 줄 길이가 정하므로 정적 그리기가 매번 명시로 다시 쓴다.
    const clipId = `hse-row-${Math.random().toString(36).slice(2, 9)}`;
    const clipRect = el('rect', {});
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(clipRect);
    const defs = el('defs', {});
    defs.appendChild(clip);

    const cellLayer = el('g', { 'clip-path': `url(#${clipId})` });
    const frameLayer = el('g', {});
    const dividerLayer = el('g', {});
    const airLayer = el('g', {});
    const captionText = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    svg.append(defs, cellLayer, frameLayer, dividerLayer, airLayer, captionText);

    // ── 기하. 줄 길이가 정하므로 장면에 담지 않고 캔버스에서 역산한다 (S-piece).
    let n = 1;
    let cellW = CELL_MAX_W;
    let rowW = CELL_MAX_W;
    let originX = 0;
    let rowRight = CELL_MAX_W;
    let chipW = CELL_MAX_W - 20;

    function layout(count: number): void {
      n = Math.max(1, count);
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n));
      rowW = cellW * n;
      originX = Math.round((W - rowW) / 2);
      rowRight = originX + rowW;
      chipW = cellW - 20;
    }

    const xAt = (k: number): number => originX + k * cellW;
    const cellCX = (i: number): number => originX + i * cellW + cellW / 2;

    // ── 이번 장면이 세운 DOM 손잡이.
    let cellTexts: SVGTextElement[] = [];
    let barEl: SVGRectElement | null = null;
    let heapRulerEl: SVGRectElement | null = null;
    let heapLabelEl: SVGTextElement | null = null;
    let doneLabelEl: SVGTextElement | null = null;
    /** 공중에 뜬 값의 딱지. 장면이 `lifted` 를 말할 때만 있다. */
    let chipEl: Chip | null = null;
    /** 꼬리 자의 도막. 칸 번호로 찾는다. */
    let segEls = new Map<number, SVGRectElement>();

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 요소를 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로 다시
    // 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미 새로
    // 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를 올리고, 운동은
    // `await` 뒤에 자기 세대를 확인한 뒤에만 화면에 손을 댄다 (S-scene).
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 한 걸음을 **한 시계**로 흐르게 한다. 한 걸음에 여럿이 움직여도 시계를 나누지
     * 않는다 — 나누면 lockstep 이 우연히 맞는 꼴이 된다 (S-scene).
     *
     * `draw` 가 받는 것은 **날것의 진행도**다. 이 조각은 한 걸음 안에서 차선마다
     * 다른 마디로 밀고 당기므로 완화를 부르는 쪽에서 건다.
     *
     * 세대가 지나거나 떼어지면 화면에 손대지 않고 기다리던 Promise 를 푼다 —
     * 취소된 프레임은 아예 불리지 않으므로 여기서 풀지 않으면 `await ctx.emit` 이
     * 영영 돌아오지 않는다 (S-piece).
     */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
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
          const raw = clamp01((Date.now() - started) / ms);
          draw(raw);
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

    /** 값 하나를 담은 딱지. 자리는 부르는 쪽이 정한다. */
    function makeChip(value: number, fill: string, ink: string): Chip {
      const g = el('g', {});
      g.appendChild(
        el('rect', {
          x: -chipW / 2,
          y: -CHIP_H / 2,
          width: chipW,
          height: CHIP_H,
          rx: cornerR,
          fill,
          stroke: c.text,
          'stroke-width': 1.2,
        }),
      );
      const t = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xl,
        'font-weight': '600',
        fill: ink,
      });
      // 값 표기는 숫자 표식이다 (C10) — 키를 만들지 않는다.
      t.textContent = String(value);
      g.appendChild(t);
      airLayer.appendChild(g);
      return { g };
    }

    function place(chip: Chip, cx: number, cy: number): void {
      chip.g.setAttribute('transform', `translate(${cx},${cy})`);
    }

    /**
     * 경계 자리(픽셀)를 받아 막대 · 힙 자 · 두 라벨을 한꺼번에 놓는다.
     *
     * 꼬리 자의 도막은 여기서 건드리지 않는다 — 도막은 누적이라 걸음마다 하나씩
     * 더해질 뿐이고, 새로 더해지는 하나만 그 걸음의 운동이 키운다.
     */
    function placeDivider(bx: number): void {
      barEl?.setAttribute('x', String(bx - BAR_W / 2));
      const heapW = Math.max(0, bx - originX);
      heapRulerEl?.setAttribute('width', String(heapW));
      heapLabelEl?.setAttribute('x', String(originX + heapW / 2));
      const doneW = Math.max(0, rowRight - bx);
      doneLabelEl?.setAttribute('x', String(bx + doneW / 2));
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      cellLayer.replaceChildren();
      frameLayer.replaceChildren();
      dividerLayer.replaceChildren();
      airLayer.replaceChildren();
      captionText.textContent = '';
      cellTexts = [];
      barEl = null;
      heapRulerEl = null;
      heapLabelEl = null;
      doneLabelEl = null;
      chipEl = null;
      segEls = new Map();
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 칸 · 값 · 꼭대기 표식 · 경계 · 두 자 · 라벨 · 공중에 뜬 값이 모두 여기서
     * 난다. **남는 것**(꼬리의 채움과 자의 도막)을 여기 넣어야 되짚었을 때 남는다.
     */
    function drawStatic(s: HeapSortExtractScene): void {
      layout(s.origin.length);
      const heapSize = Math.max(0, Math.min(n, s.heapSize));

      clipRect.setAttribute('x', String(originX));
      clipRect.setAttribute('y', String(ROW_Y));
      clipRect.setAttribute('width', String(rowW));
      clipRect.setAttribute('height', String(CELL_H));
      clipRect.setAttribute('rx', String(cornerR));

      // ── 칸. **채움이 값의 형편이다** — 힙 안이면 기본, 정렬된 꼬리면 채운다.
      for (let i = 0; i < n; i += 1) {
        cellLayer.appendChild(
          el('rect', {
            x: xAt(i),
            y: ROW_Y,
            width: cellW,
            height: CELL_H,
            fill: i >= heapSize ? c.itemSorted : c.itemDefault,
          }),
        );
      }
      for (let i = 1; i < n; i += 1) {
        cellLayer.appendChild(
          el('line', {
            x1: xAt(i),
            y1: ROW_Y,
            x2: xAt(i),
            y2: ROW_BOTTOM,
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
      }
      // 바깥 테두리 하나 — 이 그림이 줄 하나로 끝난다는 말이다.
      // clip 안에 두면 stroke 가 반만 남으므로 오려 내지 않는 자리에 그린다.
      frameLayer.appendChild(
        el('rect', {
          x: originX,
          y: ROW_Y,
          width: rowW,
          height: CELL_H,
          rx: cornerR,
          fill: 'none',
          stroke: c.text,
          'stroke-width': 1.5,
        }),
      );

      // ── 꼭대기 표식. **테두리가 짚음의 표식이다** — 이번에 꺼낼 값이 앉은 칸.
      //    힙이 남아 있을 때만 있고, 채움과 부딪히지 않는다.
      if (heapSize >= 1) {
        frameLayer.appendChild(
          el('rect', {
            x: xAt(0) + TOP_INSET,
            y: ROW_Y + TOP_INSET,
            width: cellW - TOP_INSET * 2,
            height: CELL_H - TOP_INSET * 2,
            rx: cornerR,
            fill: 'none',
            stroke: c.itemPivot,
            'stroke-width': TOP_STROKE,
          }),
        );
      }

      // ── 값. 공중에 뜬 것은 칸에서 비운다 — 같은 값이 두 군데 있지 않게.
      for (let i = 0; i < n; i += 1) {
        const t = el('text', {
          x: cellCX(i),
          y: CELL_CY,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xl,
          'font-weight': '600',
          fill: i >= heapSize ? c.textInverse : c.text,
        });
        const v = s.slots[i];
        const inAir = i === 0 && s.lifted !== null;
        t.textContent = inAir || typeof v !== 'number' ? '' : String(v);
        frameLayer.appendChild(t);
        cellTexts.push(t);
      }

      // ── 자와 경계.
      const bx = xAt(heapSize);
      const heapW = bx - originX;
      if (heapW > 0) {
        heapRulerEl = el('rect', {
          x: originX,
          y: BRACKET_Y,
          width: heapW,
          height: BRACKET_H,
          rx: BRACKET_H / 2,
          fill: c.textMuted,
        });
        dividerLayer.appendChild(heapRulerEl);
      }
      // 꼬리는 한 칸씩 물려받아 자랐다. 그 누적을 도막으로 남긴다 — 다 끝난 화면에
      // 남는 것이 이 조각의 주장이다.
      for (let i = heapSize; i < n; i += 1) {
        const seg = el('rect', {
          x: xAt(i) + SEG_GAP / 2,
          y: BRACKET_Y,
          width: Math.max(0, cellW - SEG_GAP),
          height: BRACKET_H,
          rx: BRACKET_H / 2,
          fill: c.sortedTailBorder,
        });
        dividerLayer.appendChild(seg);
        segEls.set(i, seg);
      }
      barEl = el('rect', {
        x: bx - BAR_W / 2,
        y: ROW_Y - BAR_OVER,
        width: BAR_W,
        height: CELL_H + BAR_OVER * 2,
        rx: BAR_W / 2,
        fill: c.sortedTailBorder,
      });
      dividerLayer.appendChild(barEl);

      // 라벨은 자기 자가 글자보다 길 때만 **짓는다**. 숨기지 않는다 — 숨기기만 하면
      // 앞 걸음의 자리가 함께 남아 되짚기 판정이 어긋난다.
      if (heapW >= LABEL_MIN_W) {
        heapLabelEl = el('text', {
          x: originX + heapW / 2,
          y: LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'letter-spacing': '0.08em',
          fill: c.textMuted,
        });
        heapLabelEl.textContent = tr('label.heap', 'heap');
        dividerLayer.appendChild(heapLabelEl);
      }
      const doneW = rowRight - bx;
      if (doneW >= LABEL_MIN_W) {
        doneLabelEl = el('text', {
          x: bx + doneW / 2,
          y: LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'letter-spacing': '0.08em',
          fill: c.textMuted,
        });
        doneLabelEl.textContent = tr('label.done', 'sorted');
        dividerLayer.appendChild(doneLabelEl);
      }

      // ── 공중에 뜬 값. 아직 어느 칸에도 앉지 않았다.
      if (s.lifted !== null) {
        chipEl = makeChip(s.lifted, c.itemDefault, c.text);
        place(chipEl, cellCX(0), LANE_HIGH);
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: HeapSortExtractCaption | null): void {
      if (cap === null) {
        captionText.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'heap':
          captionText.textContent = tr(
            'caption.heap',
            'A max heap laid out in one row — the biggest value sits on top.',
          );
          return;
        case 'take':
          captionText.textContent = tr('caption.take', 'Take out the top — {value}.', {
            value: cap.value,
          });
          return;
        case 'place':
          captionText.textContent = tr(
            'caption.place',
            'The heap hands back its last slot, and that is exactly where {value} sits down.',
            { value: cap.value },
          );
          return;
        case 'done':
          captionText.textContent = tr(
            'caption.done',
            'Sorted inside the same row — not one extra slot was borrowed.',
          );
          return;
      }
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 되돌려 놓고 시작한다. 출발 자리는 장면과 `step` 에서 셈한다 —
    //    `prev` 에서 꺼내지 않는다 (S-scene).

    /**
     * 되돌린 줄이 힙임을 긋는다.
     *
     * 흐를 것이 없는 얇은 걸음이라 `stepMs` 만으로는 앞뒤와 구별되지 않는다. 걸음이
     * 하는 말과 같은 동사를 고른다 — "여기까지가 힙이다" 는 **자를 긋는** 일이다.
     * `stepMs` 를 올리지 않고 이 걸음에만 얇은 운동을 얹는다 (S-piece).
     */
    function draw(s: HeapSortExtractScene, mine: number): Promise<void> {
      const ruler = heapRulerEl;
      // 길이는 장면에서 셈한다 — 화면을 도로 읽으면 되짚은 직후 값이 갈린다.
      const full = xAt(Math.max(0, Math.min(n, s.heapSize))) - originX;
      if (ruler === null || full <= 0) return Promise.resolve();
      return animate(SHOW_MS, mine, (p) => {
        ruler.setAttribute('width', String(full * ease(p)));
      });
    }

    /** 꼭대기가 칸에서 줄 위로 떠오른다. */
    function lift(mine: number): Promise<void> {
      const chip = chipEl;
      if (chip === null) return Promise.resolve();
      const cx = cellCX(0);
      return animate(LIFT_MS, mine, (p) => {
        place(chip, cx, lerp(CELL_CY, LANE_HIGH, ease(p)));
      });
    }

    /**
     * 경계가 한 칸 물러난다.
     *
     * 떠 있던 값이 힙이 내놓은 칸으로 날아가 앉고, 같은 시각 남은 힙의 값들이
     * 가운데 차선을 지나 제 새 칸으로 옮겨 앉으며, 경계와 자가 함께 밀린다.
     * 셋이 한 뜻의 운동이므로 **시계를 나누지 않는다** (S-scene).
     */
    function shrink(
      s: HeapSortExtractScene,
      order: readonly number[],
      mine: number,
    ): Promise<void> {
      const nb = s.heapSize;
      const landed = s.slots[nb];
      if (typeof landed !== 'number') return Promise.resolve();

      // 떠 있던 값 — 꼭대기 자리 위에서 힙이 내놓은 칸으로.
      cellTexts[nb]?.setAttribute('opacity', '0');
      const taken = makeChip(landed, c.itemDefault, c.text);
      const takenFrom = cellCX(0);
      const takenTo = cellCX(nb);

      // 자리를 바꾸는 값들 — 힙이 모양을 되찾은 결과만 옮겨 앉는다. 출발 칸은
      // `order` 가 말한다.
      const movers: { chip: Chip; from: number; to: number }[] = [];
      for (let i = 0; i < nb; i += 1) {
        const src = order[i];
        const value = s.slots[i];
        if (typeof src !== 'number' || src === i || typeof value !== 'number') continue;
        cellTexts[i]?.setAttribute('opacity', '0');
        movers.push({ chip: makeChip(value, c.itemDefault, c.text), from: cellCX(src), to: cellCX(i) });
      }

      const bx0 = xAt(nb + 1);
      const bx1 = xAt(nb);
      const seg = segEls.get(nb);
      const segW = Math.max(0, cellW - SEG_GAP);
      const segRight = xAt(nb) + SEG_GAP / 2 + segW;

      return animate(MOVE_MS, mine, (p) => {
        const travelHigh = ease(clamp01(p / 0.6));
        const fall = ease(clamp01((p - 0.55) / 0.45));
        place(taken, lerp(takenFrom, takenTo, travelHigh), lerp(LANE_HIGH, CELL_CY, fall));

        const rise = ease(clamp01(p / 0.28));
        const drop = ease(clamp01((p - 0.68) / 0.32));
        const midY = CELL_CY + (LANE_MID - CELL_CY) * rise * (1 - drop);
        const travelMid = ease(clamp01((p - 0.22) / 0.5));
        for (const m of movers) place(m.chip, lerp(m.from, m.to, travelMid), midY);

        // 경계와 꼬리 자의 새 도막이 같은 마디로 밀린다 — 한 칸을 물려받는 것이
        // 곧 경계가 물러나는 것이다.
        const e = ease(clamp01((p - 0.1) / 0.6));
        placeDivider(lerp(bx0, bx1, e));
        if (seg) {
          seg.setAttribute('width', String(segW * e));
          seg.setAttribute('x', String(segRight - segW * e));
        }
      });
    }

    /** 마지막 한 칸도 제자리다. 경계가 맨 왼쪽까지 가고 꼬리가 줄 전체가 된다. */
    function finish(s: HeapSortExtractScene, mine: number): Promise<void> {
      const bx0 = xAt(Math.min(n, s.heapSize + 1));
      const bx1 = xAt(s.heapSize);
      const seg = segEls.get(s.heapSize);
      const segW = Math.max(0, cellW - SEG_GAP);
      const segRight = xAt(s.heapSize) + SEG_GAP / 2 + segW;
      return animate(FINISH_MS, mine, (p) => {
        const e = ease(p);
        placeDivider(lerp(bx0, bx1, e));
        if (seg) {
          seg.setAttribute('width', String(segW * e));
          seg.setAttribute('x', String(segRight - segW * e));
        }
      });
    }

    function flow(s: HeapSortExtractScene, mine: number): Promise<void> {
      const step = s.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'shown':
          return draw(s, mine);
        case 'lift':
          return lift(mine);
        case 'place':
          return shrink(s, step.order, mine);
        case 'finish':
          return finish(s, mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 딱지 · `opacity` 가 한꺼번에 사라져, 흐른 화면과 곧바로 세운 화면이
     * 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 장면과 `step` 에서
     * 셈한다 (S-scene).
     */
    async function render(
      next: HeapSortExtractScene,
      _prev: HeapSortExtractScene | null,
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

      /**
       * 스스로 다음 회차를 예약하는 rAF 루프가 있으므로 반드시 멈춘다. 예약한
       * 프레임을 거두고 **기다리던 Promise 를 푼다** — 취소된 프레임은 아예 불리지
       * 않아 resolve 가 지나가지 않는다 (S-piece).
       */
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
      },
    };
  },
};
