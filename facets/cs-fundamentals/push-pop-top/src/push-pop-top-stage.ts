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
  shiftLightness,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

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

type BlockEl = {
  g: SVGGElement;
  rect: SVGRectElement;
  value: number;
  order: number;
  /** 통 안의 자리. -1 이면 아직/이미 통 밖. */
  slot: number;
};

export const pushPopTopStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const seed = categorical(CAP, 'vivid');

    const rawValues = (params.initialData as { pushes?: unknown } | undefined)?.pushes;
    // 화면에 쓰는 값은 선언에서 온다. 없으면 지어내지 않고 비워 둔다.
    const values: number[] = Array.isArray(rawValues)
      ? rawValues.filter((v): v is number => typeof v === 'number').slice(0, CAP)
      : [];

    const svg = params.canvas;
    svg.setAttribute('role', 'img');
    svg.style.fontFamily = fonts.body;

    // ── 기록줄 ──────────────────────────────────────────────────────────
    for (let i = 0; i < values.length; i += 1) {
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
      ghost.textContent = String(values[i]);
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
      const num = el('text', {
        x: NUM_X, y: surfaceY(k) + 4, 'text-anchor': 'start',
        'font-size': fontSizes.xs, 'font-family': fonts.mono,
        fill: colors.textMuted,
      });
      num.textContent = String(k);
      svg.appendChild(num);
    }

    // top 지표 — 오르내리는 것은 이 하나뿐이다.
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

    const arcLayer = el('g', {});
    svg.appendChild(arcLayer);

    const caption = el('text', {
      x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle',
      'font-size': fontSizes.md, fill: colors.text,
    });
    svg.appendChild(caption);


    // ── 시간 · 운동 ──────────────────────────────────────────────────────
    let disposed = false;
    const pendingWaits = new Set<() => void>();

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (disposed) {
          resolve();
          return;
        }
        const finish = (): void => {
          pendingWaits.delete(finish);
          clearTimeout(id);
          resolve();
        };
        const id = setTimeout(finish, ms);
        pendingWaits.add(finish);
      });

    const jump = (node: SVGElement, transform: string): void => {
      node.style.transition = 'none';
      node.style.transform = transform;
    };

    const move = async (node: SVGElement, transform: string, ms: number): Promise<void> => {
      node.style.transition = `transform ${ms}ms ${EASE}`;
      // 직전 jump 의 값을 시작점으로 잡게 강제 계산.
      if (typeof node.getBoundingClientRect === 'function') node.getBoundingClientRect();
      node.style.transform = transform;
      await wait(ms);
    };

    // ── 상자 만들기 ──────────────────────────────────────────────────────
    const items: BlockEl[] = [];

    const buildBlocks = (): void => {
      blockLayer.textContent = '';
      items.length = 0;
      for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        const fill = seed[i] ?? colors.itemDefault;
        const g = el('g', {});
        const rect = el('rect', {
          x: 0, y: 0, width: BLOCK_W, height: BLOCK_H, rx: 5,
          fill, stroke: shiftLightness(fill, -0.22), 'stroke-width': 2,
        });
        g.appendChild(rect);
        const label = el('text', {
          x: BLOCK_W / 2, y: BLOCK_H / 2 + 6, 'text-anchor': 'middle',
          'font-size': fontSizes.lg, 'font-family': fonts.mono,
          'font-weight': '600', fill: shiftLightness(fill, -0.45),
        });
        label.textContent = String(value);
        g.appendChild(label);
        jump(g, place(inX(i), ROW_Y, CHIP_SCALE));
        blockLayer.appendChild(g);
        items.push({ g, rect, value, order: i, slot: -1 });
      }
    };

    const findAtSlot = (slot: number): BlockEl | undefined =>
      items.find((b) => b.slot === slot);

    const clearBlockedMark = (): void => {
      for (const b of items) {
        b.rect.setAttribute('stroke', shiftLightness(seed[b.order] ?? colors.itemDefault, -0.22));
        b.rect.setAttribute('stroke-width', '2');
        b.rect.removeAttribute('stroke-dasharray');
      }
      stopBar.style.display = 'none';
    };

    const moveTop = (level: number, ms: number): void => {
      void move(markerG, place(0, surfaceY(level), 1), ms);
    };

    let outCount = 0;

    const reset = (): void => {
      arcLayer.textContent = '';
      probeG.style.display = 'none';
      jump(probeG, place(0, PROBE_PARK, 1));
      outCount = 0;
      buildBlocks();
      clearBlockedMark();
      jump(markerG, place(0, surfaceY(0), 1));
      caption.textContent = '';
    };

    reset();

    return {
      destroy() {
        disposed = true;
        for (const finish of [...pendingWaits]) finish();
        pendingWaits.clear();
        if (svg.parentElement) svg.remove();
      },

      reset,

      setCaption(text: string) {
        caption.textContent = text;
      },

      /** 문이 하나뿐임을 보인다 — 두 방향이 같은 자리를 쓴다. */
      async showOpening(): Promise<void> {
        void move(outChevron, place(0, -7, 1), BREATH_MS);
        await move(inChevron, place(0, 7, 1), BREATH_MS);
        void move(outChevron, place(0, 0, 1), BREATH_MS);
        await move(inChevron, place(0, 0, 1), BREATH_MS);
      },

      /** 문 위로 날아와 아래로 내려가 얹힌다. */
      async push(p: { slot: number; top: number }): Promise<void> {
        clearBlockedMark();
        const block = items[p.slot];
        if (!block) return;
        await move(block.g, place(BLOCK_X, LANE_Y, 1), FLY_MS);
        moveTop(p.top, DROP_MS);
        await move(block.g, place(BLOCK_X, blockTopY(p.slot), 1), DROP_MS);
        block.slot = p.slot;
      },

      /** 깔린 값을 꺼내려는 탐침이 꼭대기에서 막힌다. */
      async probeBlocked(p: { slot: number; topSlot: number }): Promise<void> {
        const buriedBlock = findAtSlot(p.slot);
        if (buriedBlock) {
          buriedBlock.rect.setAttribute('stroke', colors.danger);
          buriedBlock.rect.setAttribute('stroke-width', '3');
          buriedBlock.rect.setAttribute('stroke-dasharray', '6 4');
        }
        stopBar.setAttribute('y1', String(blockTopY(p.topSlot)));
        stopBar.setAttribute('y2', String(blockTopY(p.topSlot)));
        jump(probeG, place(0, PROBE_PARK, 1));
        probeG.style.display = '';
        await move(probeG, place(0, blockTopY(p.topSlot) - PROBE_TIP_Y, 1), PROBE_MS);
        stopBar.style.display = '';
        await move(probeG, place(0, blockTopY(p.topSlot) - PROBE_TIP_Y - 9, 1), JOLT_MS);
        await move(probeG, place(0, blockTopY(p.topSlot) - PROBE_TIP_Y, 1), JOLT_MS);
        await move(probeG, place(0, PROBE_PARK, 1), PROBE_MS);
        probeG.style.display = 'none';
      },

      /** 꼭대기 것만 문으로 솟아 나가고, 나간 차례대로 오른쪽에 놓인다. */
      async pop(p: { slot: number; top: number }): Promise<void> {
        clearBlockedMark();
        const block = findAtSlot(p.slot);
        if (!block) return;
        block.slot = -1;
        moveTop(p.top, RISE_MS);
        await move(block.g, place(BLOCK_X, LANE_Y, 1), RISE_MS);
        await move(block.g, place(outX(outCount), ROW_Y, CHIP_SCALE), FILE_MS);
        outCount += 1;
      },

      /** 들어온 차례와 나간 차례를 잇는다. 활이 겹치지 않고 포개진다. */
      async markDone(): Promise<void> {
        arcLayer.textContent = '';
        const count = Math.min(values.length, outCount);
        for (let k = 0; k < count; k += 1) {
          const x0 = inX(k) + CHIP_W / 2;
          const x1 = outX(count - 1 - k) + CHIP_W / 2;
          const peak = 10 + k * 6;
          const path = el('path', {
            d: `M ${x0} ${ROW_Y} Q ${(x0 + x1) / 2} ${2 * peak - ROW_Y} ${x1} ${ROW_Y}`,
            fill: 'none', stroke: colors.accent, 'stroke-width': 3,
            'stroke-linecap': 'round', pathLength: 100,
          });
          // pathLength 로 길이를 100 에 맞춰 놓았으므로 실측 없이 선이 자라난다.
          path.style.strokeDasharray = '100';
          path.style.strokeDashoffset = '100';
          arcLayer.appendChild(path);
          path.style.transition = `stroke-dashoffset ${ARC_MS}ms ease-out`;
          if (typeof path.getBoundingClientRect === 'function') path.getBoundingClientRect();
          path.style.strokeDashoffset = '0';
          await wait(ARC_MS);
        }
      },
    };
  },
};
