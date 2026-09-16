/**
 * push-pop-top stage — 한쪽 끝만 열린 통.
 *
 * 이 조각의 동사는 "쌓이고 걷힌다" 다. 그래서 화면의 모든 운동이 세로 이동이고,
 * 드나드는 길은 통의 윗면 하나뿐이다.
 *
 *   기록줄(위)   들어온 차례 · 나간 차례가 좌우에 남는다
 *   통  (가운데) 벽 둘과 바닥 하나. 위만 열려 있다
 *   눈금(오른쪽) top 지표가 0~3 사이를 오르내린다
 *
 * 값은 왼쪽 기록줄에서 문 위로 날아와 **아래로 내려가** 얹히고, 나갈 때는
 * **위로 솟아** 문을 빠져나가 오른쪽 기록줄에 놓인다. 아래에 깔린 값을 꺼내려는
 * 탐침은 꼭대기에서 막혀 되돌아간다. 마지막에 세 개의 활이 들어온 차례와 나간
 * 차례를 이어 보이면 두 줄이 서로 뒤집혀 있다는 것이 한 장면으로 남는다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 전체를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 필요 없고 — 상자를 훑어 붉은 테두리를 지우던 `clearBlockedMark()` 가 통째로
 * 사라졌다 — 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * **상자가 있을 수 있는 자리는 셋뿐이다.** 아직 안 들어갔으면 왼쪽 기록줄,
 * 통 안이면 그 자리 번호의 높이, 이미 나갔으면 오른쪽 기록줄. 장면의 `stack` 과
 * `out` 이 그 셋을 가르므로 자리는 여기서 셈으로 나온다 (S-piece).
 *
 * 통·눈금·기록줄 칸처럼 처음부터 끝까지 그대로인 뼈대는 mount 에서 한 번 세운다.
 * 그 위에 얹히는 상자·막힘 표식·활·캡션은 걸음마다 장면에서 다시 만든다.
 *
 * 색은 전부 design-tokens 경유다 (S-view). 값 상자는 categorical 로 서로를
 * 구분하고 (같은 상자가 들어갔다 나오는 것을 눈으로 따라갈 수 있어야 한다),
 * 통·눈금은 structural, 막힘은 severity(danger), 문과 top 지표는 emphasis(accent).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  shiftLightness,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { PushPopTopCaption, PushPopTopScene } from './scene.js';

// ── 좌표계 ────────────────────────────────────────────────────────────────
const W = PIECE_CANVAS_W;
const H = 340;

/** 통 */
const CX = 272;
const INNER_HALF = 54;
const WALL = 7;
const RIM_Y = 134;
const FLOOR_Y = 268;
const FLOOR_H = 8;
const SLOT_H = 40;
const CAP = 3;

/** 값 상자 */
const BLOCK_W = 84;
const BLOCK_H = 34;
const BLOCK_X = CX - BLOCK_W / 2;
/** 문 바로 위. 상자가 드나들기 전에 잠깐 서는 높이. */
const LANE_Y = 74;

/** 기록줄 — 상자를 그대로 줄여 놓는다. */
const CHIP_SCALE = 0.68;
const CHIP_W = BLOCK_W * CHIP_SCALE;
const CHIP_H = BLOCK_H * CHIP_SCALE;
const ROW_Y = 40;
const ROW_GAP = 10;
const IN_X0 = 36;
const OUT_X0 = 402;
const ROW_LABEL_Y = 82;

/** top 눈금 */
const RULER_X = 356;
const TICK_HALF = 6;
const RULER_TOP = 140;
const NUM_X = 368;
const TOP_LABEL_X = 386;

/** 탐침 */
const PROBE_TIP_Y = 148;
const PROBE_PARK = -110;
/** 막혀서 한 번 움찔할 때 물러나는 깊이. */
const JOLT_LIFT = 9;

const CAPTION_Y = 306;

// ── 시간 ──────────────────────────────────────────────────────────────────
const FLY_MS = 300;
const DROP_MS = 340;
const RISE_MS = 340;
const FILE_MS = 300;
const PROBE_MS = 320;
const JOLT_MS = 130;
const BREATH_MS = 260;
const ARC_MS = 220;

const EASE = 'cubic-bezier(0.34, 0.02, 0.2, 1)';

/** 문 앞에서 갈매기표가 숨 쉬는 깊이. */
const BREATH_DY = 7;

// ── 표식 (번역하지 않는다 — 도식에 각인된 글자 · 통용 용어 · 숫자 표기) ──────
const MARK_IN = 'IN';
const MARK_OUT = 'OUT';
const MARK_TOP = 'top';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 쌓인 개수 level 일 때의 꼭대기 면 높이. level 0 이면 바닥. */
function surfaceY(level: number): number {
  return FLOOR_Y - level * SLOT_H;
}

/** 자리 slot 에 얹힌 상자의 윗변. */
function blockTopY(slot: number): number {
  return surfaceY(slot + 1);
}

function inX(order: number): number {
  return IN_X0 + order * (CHIP_W + ROW_GAP);
}

function outX(order: number): number {
  return OUT_X0 + order * (CHIP_W + ROW_GAP);
}

function place(x: number, y: number, scale: number): string {
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

/**
 * `initialData` 를 좁히는 자리는 여기다 — 장면이 비어 있어도 반드시 불리는 유일한
 * 경로이고, 기록줄의 빈 칸과 눈금은 걸음과 무관하게 처음부터 서 있어야 한다
 * (S-piece).
 */
function readValues(initialData: unknown): number[] {
  const raw = (initialData ?? {}) as { pushes?: unknown };
  return Array.isArray(raw.pushes)
    ? raw.pushes.filter((v): v is number => typeof v === 'number').slice(0, CAP)
    : [];
}

/** 상자 하나. 걸음마다 다시 만들므로 자리는 여기 담지 않는다. */
type BlockEl = { g: SVGGElement; rect: SVGRectElement };

/** 상자가 쉬는 자리. 장면의 `stack` · `out` 이 셋 중 하나를 고른다. */
type Spot = { x: number; y: number; scale: number };

export const pushPopTopStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<PushPopTopScene> {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    params.canvas.textContent = '';
    const colors: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const seed = categorical(CAP, 'vivid');
    const geometry = readValues(params.initialData);

    const svg = params.canvas;
    svg.setAttribute('role', 'img');
    svg.style.fontFamily = fonts.body;

    // ── 한 번만 세우는 뼈대 ──────────────────────────────────────────────
    //
    // 기록줄의 빈 칸 · 통 · 문 · 눈금은 처음부터 끝까지 그대로다. 걸음마다 다시
    // 만드는 것은 그 위에 얹히는 상자와 표식과 문장뿐이다.

    for (let i = 0; i < geometry.length; i += 1) {
      svg.appendChild(
        el('rect', {
          x: inX(i), y: ROW_Y, width: CHIP_W, height: CHIP_H, rx: 4,
          fill: 'none', stroke: colors.border, 'stroke-width': 1,
          'stroke-dasharray': '4 3',
        }),
      );
      const ghost = el('text', {
        x: inX(i) + CHIP_W / 2, y: ROW_Y + CHIP_H / 2 + 4,
        'text-anchor': 'middle', 'font-size': fontSizes.xs,
        'font-family': fonts.mono, fill: colors.textMuted,
      });
      // 값 표기는 표식이다 (C10 결정 트리 3) — 키를 만들지 않는다.
      ghost.textContent = String(geometry[i]);
      svg.appendChild(ghost);

      svg.appendChild(
        el('rect', {
          x: outX(i), y: ROW_Y, width: CHIP_W, height: CHIP_H, rx: 4,
          fill: 'none', stroke: colors.border, 'stroke-width': 1,
          'stroke-dasharray': '4 3',
        }),
      );
    }

    const inLabel = el('text', {
      x: IN_X0, y: ROW_LABEL_Y, 'text-anchor': 'start',
      'font-size': fontSizes.xs, 'font-family': fonts.mono,
      fill: colors.textMuted, 'letter-spacing': '1.5',
    });
    inLabel.textContent = MARK_IN;
    svg.appendChild(inLabel);

    const outLabel = el('text', {
      x: outX(CAP - 1) + CHIP_W, y: ROW_LABEL_Y, 'text-anchor': 'end',
      'font-size': fontSizes.xs, 'font-family': fonts.mono,
      fill: colors.textMuted, 'letter-spacing': '1.5',
    });
    outLabel.textContent = MARK_OUT;
    svg.appendChild(outLabel);

    // ── 통 — 벽 둘과 바닥. 위만 열려 있다. ────────────────────────────────
    svg.appendChild(
      el('rect', {
        x: CX - INNER_HALF, y: RIM_Y,
        width: INNER_HALF * 2, height: FLOOR_Y - RIM_Y,
        fill: colors.bgSubtle,
      }),
    );
    // 벽과 바닥은 border 보다 진한 중성으로 — 통이 세 면으로 닫혀 있고 위만
    // 열려 있다는 것이 빈 상태에서도 읽혀야 한다 (다크 테마에서도 보인다).
    svg.appendChild(
      el('rect', {
        x: CX - INNER_HALF - WALL, y: RIM_Y,
        width: WALL, height: FLOOR_Y - RIM_Y + FLOOR_H, fill: colors.textMuted,
      }),
    );
    svg.appendChild(
      el('rect', {
        x: CX + INNER_HALF, y: RIM_Y,
        width: WALL, height: FLOOR_Y - RIM_Y + FLOOR_H, fill: colors.textMuted,
      }),
    );
    svg.appendChild(
      el('rect', {
        x: CX - INNER_HALF - WALL, y: FLOOR_Y,
        width: (INNER_HALF + WALL) * 2, height: FLOOR_H, fill: colors.textMuted,
      }),
    );

    // ── 문 — 하나뿐인 드나드는 자리. ─────────────────────────────────────
    svg.appendChild(
      el('line', {
        x1: CX - INNER_HALF, y1: RIM_Y, x2: CX + INNER_HALF, y2: RIM_Y,
        stroke: colors.accent, 'stroke-width': 3, 'stroke-dasharray': '7 5',
      }),
    );
    const inChevron = el('path', {
      d: `M ${CX - 32} ${RIM_Y - 20} L ${CX - 25} ${RIM_Y - 10} L ${CX - 18} ${RIM_Y - 20}`,
      fill: 'none', stroke: colors.text, 'stroke-width': 2.5,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    });
    const outChevron = el('path', {
      d: `M ${CX + 18} ${RIM_Y - 10} L ${CX + 25} ${RIM_Y - 20} L ${CX + 32} ${RIM_Y - 10}`,
      fill: 'none', stroke: colors.text, 'stroke-width': 2.5,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    });
    svg.appendChild(inChevron);
    svg.appendChild(outChevron);

    // ── top 눈금 ────────────────────────────────────────────────────────
    svg.appendChild(
      el('line', {
        x1: RULER_X, y1: RULER_TOP, x2: RULER_X, y2: FLOOR_Y + FLOOR_H,
        stroke: colors.border, 'stroke-width': 2,
      }),
    );
    for (let k = 0; k <= CAP; k += 1) {
      svg.appendChild(
        el('line', {
          x1: RULER_X - TICK_HALF, y1: surfaceY(k),
          x2: RULER_X + TICK_HALF, y2: surfaceY(k),
          stroke: colors.border, 'stroke-width': 2,
        }),
      );
      const numEl = el('text', {
        x: NUM_X, y: surfaceY(k) + 4, 'text-anchor': 'start',
        'font-size': fontSizes.xs, 'font-family': fonts.mono,
        fill: colors.textMuted,
      });
      numEl.textContent = String(k);
      svg.appendChild(numEl);
    }

    // top 지표 — 오르내리는 것은 이 하나뿐이다. 뼈대에 속하므로 걸음마다 다시
    // 만들지 않고 자리만 갈아 세운다. 그래서 세대 빗장이 필요하다 (S-scene).
    const markerG = el('g', {});
    markerG.appendChild(
      el('line', {
        x1: CX + INNER_HALF + WALL + 3, y1: 0, x2: RULER_X - TICK_HALF - 2, y2: 0,
        stroke: colors.accent, 'stroke-width': 2, 'stroke-dasharray': '3 3',
      }),
    );
    markerG.appendChild(
      el('circle', {
        cx: RULER_X, cy: 0, r: 5,
        fill: colors.accent, stroke: colors.text, 'stroke-width': 1.5,
      }),
    );
    const topLabel = el('text', {
      x: TOP_LABEL_X, y: 4, 'text-anchor': 'start',
      'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: colors.text,
    });
    topLabel.textContent = MARK_TOP;
    markerG.appendChild(topLabel);
    svg.appendChild(markerG);

    // ── 상자 · 탐침 · 활 ────────────────────────────────────────────────
    /** 값 상자가 사는 켜. 걸음마다 통째로 비우고 다시 세운다. */
    const blockLayer = el('g', {});
    svg.appendChild(blockLayer);

    const probeG = el('g', {});
    probeG.appendChild(
      el('line', {
        x1: CX, y1: PROBE_TIP_Y - 96, x2: CX, y2: PROBE_TIP_Y - 8,
        stroke: colors.text, 'stroke-width': 3, 'stroke-linecap': 'round',
      }),
    );
    probeG.appendChild(
      el('path', {
        d: `M ${CX - 8} ${PROBE_TIP_Y - 10} L ${CX + 8} ${PROBE_TIP_Y - 10} L ${CX} ${PROBE_TIP_Y} Z`,
        fill: colors.text,
      }),
    );
    probeG.style.display = 'none';
    svg.appendChild(probeG);

    const stopBar = el('line', {
      x1: BLOCK_X - 6, y1: 0, x2: BLOCK_X + BLOCK_W + 6, y2: 0,
      stroke: colors.danger, 'stroke-width': 5, 'stroke-linecap': 'round',
    });
    stopBar.style.display = 'none';
    svg.appendChild(stopBar);

    /** 활이 사는 켜. 걸음마다 통째로 비우고 다시 세운다. */
    const arcLayer = el('g', {});
    svg.appendChild(arcLayer);

    const captionEl = el('text', {
      x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle',
      'font-size': fontSizes.md, fill: colors.text,
    });
    svg.appendChild(captionEl);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece). ──────
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 이 조각은 통 표식 · 탐침 · 막음 띠를 **뼈대로 두고 속성만 덮어쓴다.** 그러니
     * 살아남은 옛 운동이 만지는 것은 떨어져 나간 노드가 아니라 **살아 있는 화면**
     * 이다. 되짚기가 탐침 운동 가운데로 끼어들면 남은 마디가 깨어나 방금 세운
     * 표식을 옛 자리로 끌어당긴다. 그것을 막는 빗장이다 (S-scene).
     *
     * `isInstant` / `onScrubStart` 는 쓰지 않는다 — 러너는 장면 조각에서 그 둘을
     * 부르지 않으므로 빗장이 되지 못한다.
     */
    let gen = 0;

    /** 이 세대의 운동이 아직 화면에 손대도 되나. */
    const alive = (myGen: number): boolean => !destroyed && myGen === gen;

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          clearTimeout(id);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
        waiters.add(finish);
      });

    /**
     * 전환 없이 그 자리에 세운다. 정적 그리기와 운동의 출발 자리가 이것을 쓴다.
     *
     * 전환을 `none` 으로 **남기지 않고 지운다** — 남겨 두면 곧바로 세운 화면과
     * 흐르고 난 화면이 속성 하나만큼 달라진다 (S-scene 의 되짚기 판정).
     */
    const setT = (node: SVGElement, transform: string): void => {
      node.style.removeProperty('transition');
      node.style.transform = transform;
    };

    const move = async (node: SVGElement, transform: string, ms: number): Promise<void> => {
      node.style.transition = `transform ${ms}ms ${EASE}`;
      node.style.transform = transform;
      await wait(ms);
    };

    /**
     * 지금 세운 자리를 브라우저가 한 번 재게 한다.
     *
     * 정적으로 세운 직후에 곧바로 전환을 걸면 두 값이 한 프레임 안에 겹쳐 들어가
     * 운동이 통째로 사라진다. `opts.animate` 인 길에서만 부르므로 되짚기에는
     * 끼지 않는다.
     */
    const settleFrame = (): void => {
      if (typeof svg.getBoundingClientRect === 'function') svg.getBoundingClientRect();
    };

    // ── 장면 그리기 ─────────────────────────────────────────────────────

    /**
     * 상자가 쉬는 자리. 통 안이면 그 높이, 이미 나갔으면 오른쪽 기록줄, 그 밖이면
     * 아직 안 들어간 것이라 왼쪽 기록줄이다.
     */
    const spotOf = (s: PushPopTopScene, order: number): Spot => {
      const slot = s.stack.indexOf(order);
      if (slot >= 0) return { x: BLOCK_X, y: blockTopY(slot), scale: 1 };
      const outIndex = s.out.indexOf(order);
      if (outIndex >= 0) return { x: outX(outIndex), y: ROW_Y, scale: CHIP_SCALE };
      return { x: inX(order), y: ROW_Y, scale: CHIP_SCALE };
    };

    const makeBlock = (value: number, order: number, blocked: boolean): BlockEl => {
      const fill = seed[order] ?? colors.itemDefault;
      const g = el('g', {});
      const rect = el('rect', {
        x: 0, y: 0, width: BLOCK_W, height: BLOCK_H, rx: 5,
        fill,
        // 깔려서 손이 닿지 않는 상자는 붉은 점선으로 남는다 (남는 강조).
        stroke: blocked ? colors.danger : shiftLightness(fill, -0.22),
        'stroke-width': blocked ? 3 : 2,
      });
      if (blocked) rect.setAttribute('stroke-dasharray', '6 4');
      g.appendChild(rect);
      const label = el('text', {
        x: BLOCK_W / 2, y: BLOCK_H / 2 + 6, 'text-anchor': 'middle',
        'font-size': fontSizes.lg, 'font-family': fonts.mono,
        'font-weight': '600', fill: shiftLightness(fill, -0.45),
      });
      label.textContent = String(value);
      g.appendChild(label);
      return { g, rect };
    };

    /** 들어온 차례 → 지금 세워 둔 상자. 장면에서 다시 셈하는 것이라 상태가 아니다. */
    let blocks: (BlockEl | null)[] = [];

    /** 활 하나. 들어온 k 번째와 나간 (count-1-k) 번째를 잇는다. */
    const makeArc = (k: number, count: number): SVGPathElement => {
      const x0 = inX(k) + CHIP_W / 2;
      const x1 = outX(count - 1 - k) + CHIP_W / 2;
      const peak = 10 + k * 6;
      return el('path', {
        d: `M ${x0} ${ROW_Y} Q ${(x0 + x1) / 2} ${2 * peak - ROW_Y} ${x1} ${ROW_Y}`,
        fill: 'none', stroke: colors.accent, 'stroke-width': 3,
        'stroke-linecap': 'round', pathLength: 100,
      });
    };

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    const drawCaption = (cap: PushPopTopCaption | null): void => {
      if (!cap) {
        captionEl.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'oneOpening':
          captionEl.textContent = tr(
            'caption.oneOpening',
            'One opening. Everything enters and leaves through this end.',
          );
          return;
        case 'push':
          captionEl.textContent = tr(
            'caption.push',
            'Push {value} — it lands on top, and top rises to {top}.',
            { value: cap.value, top: cap.top },
          );
          return;
        case 'blocked':
          captionEl.textContent = tr(
            'caption.blocked',
            '{value} is buried under {blocker}. No hand reaches past the top.',
            { value: cap.value, blocker: cap.blocker },
          );
          return;
        case 'pop':
          captionEl.textContent = tr(
            'caption.pop',
            'Pop {value} — only the top may leave, so top falls to {top}.',
            { value: cap.value, top: cap.top },
          );
          return;
        case 'popUnblocked':
          captionEl.textContent = tr(
            'caption.popUnblocked',
            'Now {value} is the top. It became reachable only after {blocker} left.',
            { value: cap.value, blocker: cap.blocker },
          );
          return;
        case 'lifo':
          captionEl.textContent = tr(
            'caption.lifo',
            'Last in, first out — the order out is the order in, reversed.',
          );
          return;
      }
    };

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 시작하므로 되돌릴 명령이 필요 없다 (S-scene). 운동이 끝난 뒤에도
     * 한 번 더 불러 흐르며 남은 전환·임시 노드를 통째로 거둔다 — 속성을 하나씩
     * 되돌리는 목록을 두면 반드시 하나를 빠뜨린다.
     */
    const settle = (s: PushPopTopScene): void => {
      // 상자 — 셋 다 새로 만들어 각자 쉬는 자리에 세운다.
      blockLayer.textContent = '';
      blocks = [];
      // 통이 담을 수 있는 만큼만 그린다 — 자리 수는 그림이 정하는 것이라
      // 장면이 알 바가 아니다 (S-piece).
      const shown = Math.min(s.values.length, CAP);
      // 붉은 테두리는 자리 번호가 아니라 **그 자리에 실제로 쌓인 상자**에 두른다.
      const buriedOrder = s.blocked ? s.stack[s.blocked.slot] : undefined;
      for (let order = 0; order < shown; order += 1) {
        const block = makeBlock(s.values[order], order, order === buriedOrder);
        const spot = spotOf(s, order);
        setT(block.g, place(spot.x, spot.y, spot.scale));
        blockLayer.appendChild(block.g);
        blocks.push(block);
      }

      // 막음 띠 — 막고 선 꼭대기 면에 걸린다. 걸음 끝에 남는 강조다.
      //
      // 안 보일 때도 자리를 도로 0 으로 적는다. 숨겼다고 앞 걸음의 높이를 남겨
      // 두면 걸어온 화면과 되짚어 세운 화면이 **속성 하나만큼** 달라진다 — 눈에는
      // 안 보이지만 DOM 을 견주는 감사는 잡는다 (S-scene).
      const barY = s.blocked ? blockTopY(s.blocked.topSlot) : 0;
      stopBar.setAttribute('y1', String(barY));
      stopBar.setAttribute('y2', String(barY));
      stopBar.style.display = s.blocked ? '' : 'none';

      // 탐침은 왔다 간다. 어느 걸음에서도 쉬는 자리는 화면 밖이다.
      setT(probeG, place(0, PROBE_PARK, 1));
      probeG.style.display = 'none';

      // top 지표 — 쌓인 개수가 곧 높이다.
      setT(markerG, place(0, surfaceY(s.stack.length), 1));

      // 갈매기표는 숨만 쉬고 제자리로 돌아온다.
      setT(inChevron, place(0, 0, 1));
      setT(outChevron, place(0, 0, 1));

      // 활 — 다 그어진 상태가 결론이다.
      arcLayer.textContent = '';
      if (s.linked) {
        const count = Math.min(s.values.length, s.out.length);
        for (let k = 0; k < count; k += 1) arcLayer.appendChild(makeArc(k, count));
      }

      drawCaption(s.caption);
    };

    // ── 걸음 함수 ───────────────────────────────────────────────────────
    //
    // 다섯 다 정적 그리기가 세워 둔 **끝 자리**에서 시작하므로, 먼저 자기 출발
    // 그림을 장면에서 셈해 되돌려 놓는다. 그 사이에 타이머도 프레임도 없어
    // 페인트가 끼지 않는다 — 끝 자리가 번쩍이지 않는다 (S-scene).

    /** 문제 — 문이 하나뿐임을 보인다. 두 방향이 같은 자리를 쓴다. */
    async function breatheOpening(myGen: number): Promise<void> {
      settleFrame();
      await Promise.all([
        move(inChevron, place(0, BREATH_DY, 1), BREATH_MS),
        move(outChevron, place(0, -BREATH_DY, 1), BREATH_MS),
      ]);
      if (!alive(myGen)) return;
      await Promise.all([
        move(inChevron, place(0, 0, 1), BREATH_MS),
        move(outChevron, place(0, 0, 1), BREATH_MS),
      ]);
    }

    /** 장치 — 기록줄에서 문 위로 날아와 아래로 내려가 얹힌다. */
    async function flyIn(order: number, slot: number, myGen: number): Promise<void> {
      const block = blocks[order];
      if (!block) return;
      // 출발 그림 — 상자는 아직 왼쪽 기록줄에 있고 통은 한 칸 낮았다.
      setT(block.g, place(inX(order), ROW_Y, CHIP_SCALE));
      setT(markerG, place(0, surfaceY(slot), 1));
      settleFrame();

      await move(block.g, place(BLOCK_X, LANE_Y, 1), FLY_MS);
      if (!alive(myGen)) return;
      await Promise.all([
        move(block.g, place(BLOCK_X, blockTopY(slot), 1), DROP_MS),
        move(markerG, place(0, surfaceY(slot + 1), 1), DROP_MS),
      ]);
    }

    /** 막힘 — 깔린 값을 꺼내려는 탐침이 꼭대기에서 막혀 되돌아간다. */
    async function probeAndStop(topSlot: number, myGen: number): Promise<void> {
      const stopY = blockTopY(topSlot);
      // 출발 그림 — 띠는 아직 뜨지 않았고 탐침은 화면 밖에 있다.
      stopBar.style.display = 'none';
      setT(probeG, place(0, PROBE_PARK, 1));
      probeG.style.display = '';
      settleFrame();

      await move(probeG, place(0, stopY - PROBE_TIP_Y, 1), PROBE_MS);
      if (!alive(myGen)) return;
      stopBar.style.display = '';
      await move(probeG, place(0, stopY - PROBE_TIP_Y - JOLT_LIFT, 1), JOLT_MS);
      if (!alive(myGen)) return;
      await move(probeG, place(0, stopY - PROBE_TIP_Y, 1), JOLT_MS);
      if (!alive(myGen)) return;
      await move(probeG, place(0, PROBE_PARK, 1), PROBE_MS);
    }

    /** 장치 — 꼭대기 것만 문으로 솟아 나가고, 나간 차례대로 오른쪽에 놓인다. */
    async function riseOut(
      order: number,
      fromSlot: number,
      outIndex: number,
      myGen: number,
    ): Promise<void> {
      const block = blocks[order];
      if (!block) return;
      // 출발 그림 — 상자는 아직 통 안 그 자리에 있고 통은 한 칸 높았다.
      setT(block.g, place(BLOCK_X, blockTopY(fromSlot), 1));
      setT(markerG, place(0, surfaceY(fromSlot + 1), 1));
      settleFrame();

      await Promise.all([
        move(block.g, place(BLOCK_X, LANE_Y, 1), RISE_MS),
        move(markerG, place(0, surfaceY(fromSlot), 1), RISE_MS),
      ]);
      if (!alive(myGen)) return;
      await move(block.g, place(outX(outIndex), ROW_Y, CHIP_SCALE), FILE_MS);
    }

    /** 결과 — 들어온 차례와 나간 차례를 잇는다. 활이 겹치지 않고 포개진다. */
    async function growArcs(s: PushPopTopScene, myGen: number): Promise<void> {
      const count = Math.min(s.values.length, s.out.length);
      // 출발 그림 — 아직 한 줄도 그어지지 않았다.
      arcLayer.textContent = '';
      for (let k = 0; k < count; k += 1) {
        const path = makeArc(k, count);
        // pathLength 로 길이를 100 에 맞춰 놓았으므로 실측 없이 선이 자라난다.
        path.style.strokeDasharray = '100';
        path.style.strokeDashoffset = '100';
        arcLayer.appendChild(path);
        settleFrame();
        path.style.transition = `stroke-dashoffset ${ARC_MS}ms ease-out`;
        path.style.strokeDashoffset = '0';
        await wait(ARC_MS);
        if (!alive(myGen)) return;
      }
    }

    /** 방금 밟은 걸음 하나만 흐르게 한다. */
    async function flow(s: PushPopTopScene, myGen: number): Promise<void> {
      const step = s.step;
      if (!step) return;
      switch (step.kind) {
        case 'opening':
          await breatheOpening(myGen);
          return;
        case 'push':
          await flyIn(step.order, step.slot, myGen);
          return;
        case 'probe':
          await probeAndStop(step.topSlot, myGen);
          return;
        case 'pop':
          await riseOut(step.order, step.fromSlot, step.outIndex, myGen);
          return;
        case 'link':
          await growArcs(s, myGen);
          return;
      }
    }

    async function render(
      next: PushPopTopScene,
      /** 이 조각은 출발 그림을 걸음이 실어 온 계기값에서 셈한다 (S-scene). */
      _prev: PushPopTopScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const myGen = (gen += 1);
      settle(next);
      if (!opts.animate || destroyed) return;
      await flow(next, myGen);
      // 흐르며 남은 전환·보간 끝자리·임시 속성이 통째로 사라진다.
      if (alive(myGen)) settle(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (svg.parentElement) svg.remove();
      },
    };
  },
};
