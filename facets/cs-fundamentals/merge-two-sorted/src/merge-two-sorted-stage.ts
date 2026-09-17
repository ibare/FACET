/**
 * merge-two-sorted-stage — 두 줄이 아래 결과줄로 **내려가는** 무대.
 *
 * ── 형태가 어디서 나왔나
 *
 * 이 조각의 동사는 "내려간다" 다. 그래서 화면은 위아래로 짜였다 — 줄 A 와
 * 줄 B 가 위에 나란히 눕고, 그 아래 빈 결과줄이 처음부터 캔버스 폭을 다 차지한
 * 채 기다린다. 위의 여섯 칸이 아래 여섯 자리로 하나씩 옮겨 앉는 것이 전부이며,
 * 그래서 재생이 끝나면 위는 비고 아래는 찬다.
 *
 * 칸은 복제되지 않는다. 같은 칸이 제 줄에서 떨어져 나와 결과줄로 내려앉고,
 * 떠난 자리에는 미리 깔아 둔 점선 윤곽이 드러난다 ("내려간 자리는 비고").
 *
 * 내려가는 길은 두 마디다. 먼저 제 x 를 지킨 채 줄 밖으로 **곧장 떨어지고**,
 * 그 다음 제 자리를 찾아 미끄러진다. 첫 마디가 수직이어야 "내려간다" 가 색
 * 전환이 아니라 운동으로 읽힌다. 두 마디는 한 뜻이라 **한 시계**로 흐른다.
 *
 * 맨 앞은 고리(ring)가 표시하고, 그 줄이 이길 때마다 한 칸씩 **미끄러져**
 * 옮겨 간다 — "그 줄의 다음 값이 맨 앞이 된다" 가 위치 변화로 일어난다. 그
 * 미끄러짐도 같은 시계에 얹힌다.
 *
 * ── 칠을 갈라 둔다
 *
 * **채움은 값의 형편** — 아직 제 줄에 있나(`itemDefault`), 결과줄로 꺼내졌나
 * (`itemSorted`). **테두리는 견줌의 표식** — 지금 이 둘을 견주고 있다. 갈라 두면
 * 두 칠이 부딪히지 않는다. 아직 읽지 않은 뒤쪽 칸의 흐린 글자는 "맨 앞 둘만
 * 본다" 를 정지 화면에서도 말한다.
 *
 * ── 꺼낸 자취를 남긴다
 *
 * 결과줄의 칸마다 어느 줄에서 왔는지(A / B)를 새겨 둔다. 그것이 없으면 다 끝난
 * 화면이 그냥 정렬된 여섯 칸이 되어 "두 줄을 번갈아 훑었다" 가 사라진다 — 옮기기
 * 전에 실제로 그랬다.
 *
 * ── 장면 방식
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 그 다음에 방금 달라진 것만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 없고, 되짚기가 앞으로 가기와 같은 길을 탄다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 칸은 이미 끝 자리에 서 있고,
 * 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다. 그 출발 자리는
 * 장면의 `step` 이 실어 온 자리 번호에서 셈한다. `prev` 는 쓰지 않는다 (S-scene).
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다.
 *
 * 화면 문자는 캡션뿐이고 전부 `params.t` 로 만든다 (C10). 칸에 적힌 값과 줄
 * 이름표(A / B / A+B)는 도형에 새긴 표식이라 문안이 아니다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type Theme,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  headsOf,
  type MergeSide,
  type MergeTwoSortedCaption,
  type MergeTwoSortedScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). */
const W = PIECE_CANVAS_W;
const H = 276;

/** 칸 폭 상한. 실제 폭은 캔버스에서 역산한다 (S-piece "그 폭을 채운다"). */
const CELL_MAX_W = 92;
/** 좌우 최소 여백 — 줄 이름표(A / B / A+B)가 앉을 자리. */
const SIDE_MIN = 46;
/** 이웃 칸 사이 틈. */
const CELL_GAP = 8;
const CELL_H = 44;

const ROW_A_Y = 14;
const ROW_B_Y = 78;
/** 줄에서 떨어져 나온 칸이 잠시 머무는 높이. */
const DROP_Y = 140;
const ROW_OUT_Y = 196;
const CAPTION_Y = 262;

/** 줄 밖으로 곧장 떨어지는 시간. */
const FALL_MS = 170;
/** 제 자리를 찾아 미끄러지는 시간. */
const SETTLE_MS = 260;
/** 다리가 두 맨 앞을 잇는 시간 — 짚기만 하는 걸음에 얹는 얇은 운동. */
const COMPARE_MS = 260;
/** 다 합친 뒤 결과줄을 한 번 훑는 시간. */
const SWEEP_MS = 320;
/** 훑고 지나갈 때 칸이 잠깐 들리는 높이. */
const SWEEP_LIFT = 7;

/** 테두리 — 기본 / 견주는 중. */
const STROKE_PLAIN = 1.5;
const STROKE_COMPARE = 3;

/** 줄 이름표. 도형에 새긴 표식이라 번역 대상이 아니다 (C10). */
const LABEL_LEFT = 'A';
const LABEL_RIGHT = 'B';
const LABEL_OUT = 'A+B';

const easeIn = (p: number): number => p * p;
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);
const easeInOut = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 칸 하나의 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type CellEl = { g: SVGGElement; box: SVGRectElement };

export const mergeTwoSortedStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MergeTwoSortedScene> {
    const svg = params.canvas;
    const theme: Theme = params.theme ?? 'light';
    const c = getColors(theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const root = el('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 칸을 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로 다시
    // 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미 새로
    // 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를 올리고,
    // 운동은 `await` 뒤마다 자기 세대를 확인한 뒤에만 화면에 손을 댄다 (S-scene).
    // `isInstant` / `onScrubStart` 는 장면 조각에서 러너가 부르지 않으므로 빗장이
    // 되지 못한다 — 실효 있는 것은 `opts.animate` 검사와 이 세대뿐이다.
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /** 한 걸음을 한 시계로 흐르게 한다. 세대가 지나면 화면에 손대지 않고 물러난다. */
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
          const p = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          draw(p);
          if (p >= 1) {
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

    // ── 기하. 두 줄의 길이가 정하므로 좌표는 장면에 담지 않는다 (S-piece).
    let cellW = CELL_MAX_W;
    let originX = SIDE_MIN;

    function layout(total: number): void {
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / Math.max(1, total)));
      originX = Math.round((W - total * cellW) / 2);
    }

    const slotX = (n: number): number => originX + n * cellW;
    const rowY = (side: MergeSide): number => (side === 'left' ? ROW_A_Y : ROW_B_Y);
    const centerX = (x: number): number => x + cellW / 2;

    const place = (node: SVGElement, x: number, y: number): void => {
      node.setAttribute('transform', `translate(${x}, ${y})`);
    };

    // ── 이번 장면이 세운 DOM 손잡이.
    let landedEls: CellEl[] = [];
    let ringEls: Record<MergeSide, SVGRectElement | null> = { left: null, right: null };
    let bridgeEl: SVGPolylineElement | null = null;
    let compareEls: SVGRectElement[] = [];
    let captionEl: SVGTextElement | null = null;

    function slotOutline(x: number, y: number): SVGRectElement {
      return el('rect', {
        x: x + CELL_GAP / 2,
        y,
        width: cellW - CELL_GAP,
        height: CELL_H,
        rx: 8,
        fill: 'none',
        stroke: c.ghostOutline,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });
    }

    function rowLabel(text: string, y: number): SVGTextElement {
      const node = el('text', {
        x: originX - 12,
        y: y + CELL_H / 2 + 4,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      node.textContent = text;
      return node;
    }

    function ring(): SVGRectElement {
      return el('rect', {
        x: CELL_GAP / 2 - 5,
        y: -5,
        width: cellW - CELL_GAP + 10,
        height: CELL_H + 10,
        rx: 12,
        fill: 'none',
        stroke: c.accent,
        'stroke-width': 2,
      });
    }

    /**
     * 값이 든 칸 하나.
     *
     * 채움은 값의 형편이고 테두리는 견줌의 표식이다. `source` 가 있으면 결과줄에
     * 앉은 칸이라 어느 줄에서 왔는지를 함께 새긴다.
     */
    function cell(
      value: number,
      look: { landed: boolean; head: boolean; comparing: boolean; source?: MergeSide },
    ): CellEl {
      const g = el('g');
      const box = el('rect', {
        x: CELL_GAP / 2,
        y: 0,
        width: cellW - CELL_GAP,
        height: CELL_H,
        rx: 8,
        // 채움 — 값의 형편.
        fill: look.landed ? c.itemSorted : c.itemDefault,
        // 테두리 — 견줌의 표식.
        stroke: look.comparing ? c.itemComparing : look.landed ? c.itemSorted : c.border,
        'stroke-width': look.comparing ? STROKE_COMPARE : STROKE_PLAIN,
      });
      const label = el('text', {
        x: cellW / 2,
        y: CELL_H / 2 + 6,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': '600',
        // 맨 앞이 아닌 칸은 아직 아무도 읽지 않았다 — 흐린 글자로 둔다.
        fill: look.landed ? c.textInverse : look.head ? c.text : c.textMuted,
      });
      label.textContent = String(value);
      g.appendChild(box);
      g.appendChild(label);

      if (look.source !== undefined) {
        // 꺼낸 자취 — 이 칸이 어느 줄에서 내려왔나. 다 끝난 화면에 남는다.
        const tag = el('text', {
          x: CELL_GAP / 2 + 7,
          y: 15,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textInverse,
          opacity: '0.7',
        });
        tag.textContent = look.source === 'left' ? LABEL_LEFT : LABEL_RIGHT;
        g.appendChild(tag);
      }
      return { g, box };
    }

    /**
     * 두 맨 앞을 잇는 다리. `p` 가 1 이면 온전한 길이다.
     *
     * 길이 0 짜리 조각은 둥근 끝을 만나면 점이 되므로 아예 내주지 않는다.
     */
    function bridgePoints(ax: number, bx: number, p: number): string {
      const top = ROW_A_Y + CELL_H;
      const bottom = ROW_B_Y;
      const mid = (top + bottom) / 2;
      const nodes: [number, number][] = [
        [ax, top],
        [ax, mid],
        [bx, mid],
        [bx, bottom],
      ];
      if (p >= 1) return nodes.map(([x, y]) => `${x},${y}`).join(' ');
      if (p <= 0) return '';
      const lens = [mid - top, Math.abs(bx - ax), bottom - mid];
      let want = (lens[0] + lens[1] + lens[2]) * p;
      const out = [`${nodes[0][0]},${nodes[0][1]}`];
      for (let k = 0; k < 3; k += 1) {
        if (want >= lens[k]) {
          want -= lens[k];
          out.push(`${nodes[k + 1][0]},${nodes[k + 1][1]}`);
          continue;
        }
        const t = lens[k] === 0 ? 1 : want / lens[k];
        out.push(
          `${nodes[k][0] + (nodes[k + 1][0] - nodes[k][0]) * t},` +
            `${nodes[k][1] + (nodes[k + 1][1] - nodes[k][1]) * t}`,
        );
        break;
      }
      return out.join(' ');
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      root.replaceChildren();
      landedEls = [];
      ringEls = { left: null, right: null };
      bridgeEl = null;
      compareEls = [];
      captionEl = null;
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 빈 자리의 윤곽 · 줄 이름표 · 아직 줄에 있는 칸 · 결과줄에 내려앉은 칸과 그
     * 출처 표식 · 맨 앞 고리 · 견줌의 다리가 모두 여기서 난다. 남는 것(결과줄과
     * 출처 표식)을 여기 넣어야 되짚었을 때 남는다.
     */
    function drawStatic(s: MergeTwoSortedScene): void {
      const total = s.left.length + s.right.length;
      layout(total);
      const heads = headsOf(s.out);

      // 1) 바탕 — 자리의 윤곽. 칸이 떠나면 이것이 드러난다.
      const back = el('g');
      for (let i = 0; i < s.left.length; i += 1) back.appendChild(slotOutline(slotX(i), ROW_A_Y));
      for (let j = 0; j < s.right.length; j += 1) back.appendChild(slotOutline(slotX(j), ROW_B_Y));
      for (let k = 0; k < total; k += 1) back.appendChild(slotOutline(slotX(k), ROW_OUT_Y));
      root.appendChild(back);

      // 2) 줄 이름표
      const labels = el('g');
      labels.appendChild(rowLabel(LABEL_LEFT, ROW_A_Y));
      labels.appendChild(rowLabel(LABEL_RIGHT, ROW_B_Y));
      labels.appendChild(rowLabel(LABEL_OUT, ROW_OUT_Y));
      root.appendChild(labels);

      // 3) 견줌의 다리 — 맨 앞 둘 사이에만 걸린다. 칸 밑에 깔린다.
      if (s.comparing) {
        bridgeEl = el('polyline', {
          points: bridgePoints(centerX(slotX(heads.left)), centerX(slotX(heads.right)), 1),
          fill: 'none',
          stroke: c.itemComparing,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        });
        root.appendChild(bridgeEl);
      }

      // 4) 맨 앞 고리. 그 줄이 바닥나면 짓지 않는다 — 숨기기만 하면 앞 걸음의
      //    자리가 속성에 남아 되짚기 판정에서 어긋난다.
      for (const side of ['left', 'right'] as const) {
        const head = side === 'left' ? heads.left : heads.right;
        const len = side === 'left' ? s.left.length : s.right.length;
        if (head >= len) continue;
        const node = ring();
        place(node, slotX(head), rowY(side));
        root.appendChild(node);
        ringEls[side] = node;
      }

      // 5) 아직 제 줄에 있는 칸.
      for (const side of ['left', 'right'] as const) {
        const values = side === 'left' ? s.left : s.right;
        const head = side === 'left' ? heads.left : heads.right;
        for (let i = head; i < values.length; i += 1) {
          const isHead = i === head;
          const marked = s.comparing && isHead;
          const node = cell(values[i], { landed: false, head: isHead, comparing: marked });
          place(node.g, slotX(i), rowY(side));
          root.appendChild(node.g);
          if (marked) compareEls.push(node.box);
        }
      }

      // 6) 결과줄에 내려앉은 칸 — 어느 줄에서 왔는지를 지고 있다.
      s.out.forEach((pick, k) => {
        const node = cell(pick.value, {
          landed: true,
          head: false,
          comparing: false,
          source: pick.side,
        });
        place(node.g, slotX(k), ROW_OUT_Y);
        root.appendChild(node.g);
        landedEls.push(node);
      });

      // 7) 캡션
      captionEl = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      root.appendChild(captionEl);
    }

    function drawCaption(caption: MergeTwoSortedCaption | null): void {
      if (!captionEl) return;
      if (caption === null) {
        captionEl.textContent = '';
        return;
      }
      switch (caption.kind) {
        case 'premise':
          captionEl.textContent = tr('caption.premise', 'Both rows are already in order.');
          return;
        case 'compare':
          captionEl.textContent = tr(
            'caption.compare',
            'Only the fronts are compared: {left} vs {right}',
            { left: caption.left, right: caption.right },
          );
          return;
        case 'take':
          captionEl.textContent = tr('caption.take', 'The smaller front is {value} — down it goes', {
            value: caption.value,
          });
          return;
        case 'drain':
          captionEl.textContent = tr(
            'caption.drain',
            'Nothing left to compare — the rest just follows down',
          );
          return;
        case 'done':
          captionEl.textContent = tr(
            'caption.done',
            'One pass, {comparisons} comparisons, and nothing was re-sorted',
            { comparisons: caption.comparisons },
          );
          return;
      }
    }

    /**
     * 견주는 걸음 — 다리가 한쪽 맨 앞에서 뻗어 나가 다른 쪽에 닿고, 그 사이
     * 두 칸의 테두리가 견줌의 굵기로 자란다. 짚기만 하는 걸음이라 운동이 없으면
     * 앞뒤와 구별되지 않는다 (얇은 걸음).
     */
    function weigh(s: MergeTwoSortedScene, mine: number): Promise<void> {
      const line = bridgeEl;
      if (line === null) return Promise.resolve();
      const heads = headsOf(s.out);
      const ax = centerX(slotX(heads.left));
      const bx = centerX(slotX(heads.right));
      const marks = compareEls;
      return animate(COMPARE_MS, mine, (raw) => {
        const p = easeOut(raw);
        line.setAttribute('points', bridgePoints(ax, bx, p));
        const width = STROKE_PLAIN + (STROKE_COMPARE - STROKE_PLAIN) * p;
        for (const box of marks) box.setAttribute('stroke-width', String(width));
      });
    }

    /**
     * 내려가는 걸음 — 칸이 줄 밖으로 곧장 떨어졌다 제 자리를 찾아 미끄러진다.
     * 그 둘째 마디에 맨 앞 고리가 다음 칸으로 함께 옮겨 간다.
     *
     * 세 운동이 한 뜻("이 값이 꺼내지고 그 줄의 다음이 맨 앞이 된다")이라 시계를
     * 나누지 않는다. 한 시계라 `render` 의 Promise 가 셋 다 선 뒤에 풀린다.
     */
    function descend(
      step: { side: MergeSide; index: number; slot: number },
      mine: number,
    ): Promise<void> {
      const node = landedEls[step.slot];
      if (node === undefined) return Promise.resolve();
      const x0 = slotX(step.index);
      const y0 = rowY(step.side);
      const x1 = slotX(step.slot);
      const ringEl = ringEls[step.side];
      const ringFrom = slotX(step.index);
      const ringTo = slotX(step.index + 1);
      const ringY = rowY(step.side);
      const split = FALL_MS / (FALL_MS + SETTLE_MS);

      return animate(FALL_MS + SETTLE_MS, mine, (raw) => {
        if (raw <= split) {
          const t = easeIn(raw / split);
          place(node.g, x0, y0 + (DROP_Y - y0) * t);
          if (ringEl) place(ringEl, ringFrom, ringY);
          return;
        }
        const t = easeOut((raw - split) / (1 - split));
        place(node.g, x0 + (x1 - x0) * t, DROP_Y + (ROW_OUT_Y - DROP_Y) * t);
        if (ringEl) place(ringEl, ringFrom + (ringTo - ringFrom) * t, ringY);
      });
    }

    /**
     * 다 합친 걸음 — 결과줄을 왼쪽에서 오른쪽으로 한 번 훑는다. 지나가는 자리의
     * 칸이 잠깐 들렸다 내려앉아 "한 번 훑어 끝났다" 가 운동으로 일어난다.
     */
    function sweep(s: MergeTwoSortedScene, mine: number): Promise<void> {
      const nodes = landedEls;
      const n = nodes.length;
      if (n === 0) return Promise.resolve();
      const xs = s.out.map((_, k) => slotX(k));
      return animate(SWEEP_MS, mine, (raw) => {
        const head = easeInOut(raw) * (n + 1) - 1;
        for (let k = 0; k < n; k += 1) {
          const near = Math.max(0, 1 - Math.abs(k - head));
          place(nodes[k].g, xs[k], ROW_OUT_Y - SWEEP_LIFT * Math.sin((near * Math.PI) / 2));
        }
      });
    }

    function flow(s: MergeTwoSortedScene, mine: number): Promise<void> {
      const step = s.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'compare':
          return weigh(s, mine);
        case 'take':
          return descend(step, mine);
        case 'done':
          return sweep(s, mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성이 한꺼번에 사라져, 흐른 화면과 곧바로 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 `step` 이 실어 온 자리
     * 번호에서 셈한다 (S-scene).
     */
    async function render(
      next: MergeTwoSortedScene,
      _prev: MergeTwoSortedScene | null,
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
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
        root.remove();
      },
    };
  },
};
