/**
 * bitwise-ops-stage — 여덟 자리를 한 폭에 세워 놓고 자리마다 따로 셈한다.
 *
 * ── 무엇을 보이려는가
 *
 * 화면의 논증은 **세로줄**에 있다. 위에서부터 a 의 자리, b 의 자리(이항 연산일
 * 때), 결과의 자리가 같은 x 좌표에 놓이고, 짚는 테두리가 세 줄을 곧게 관통한다.
 * 자리 옮기기일 때만 읽어 오는 테두리가 한 칸 어긋나 걸린다 — 자리끼리 영향을
 * 주고받는 것이 그것뿐이라는 말이 그 어긋남 하나로 보인다.
 *
 * 여덟 자리 밖으로 나간 것(떨어진 비트 · 들어오는 0)은 격자 바깥에 점선 유령으로
 * 둔다. 격자 안이 여덟 자리이고 바깥은 없는 자리라는 것을 자리로 말한다.
 *
 * ── 색 (S-view 결정 트리)
 *   짚는 자리            itemComparing        알고리즘 상태
 *   켜진 비트(1)          accent + stateInk    알고리즘 상태
 *   꺼진 비트(0)          bg + textMuted
 *   아직 안 놓인 자리      bgSubtle             빈 자리
 *   여덟 자리 밖(유령)     ghostOutline         special — 없는 자리
 * hex 리터럴 0 건. 모두 design-tokens 경유다.
 *
 * ── 문자
 *
 * 이 파일이 그리는 글자는 전부 **표식**이다 (C10 판정 1~3) — `a` · `b` ·
 * `AND` · `≪ 1` 같은 도형에 새겨진 라벨과, 비트 숫자 · 십진값 같은 수식 표기.
 * 문장이 되는 규칙 설명과 캡션은 projector 가 `tr` 로 해석해 문자열로 넘긴다.
 *
 * ── 세로는 마운트한 뒤 바뀌지 않는다 (S-view)
 *
 * `H` 는 상수이고 viewBox 를 다시 재지 않는다. 자리 수가 바뀌어도 칸 너비만
 * 달라진다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 214;

/** 칸 너비의 상한. 실제 너비는 캔버스에서 역산한다. */
const CELL_MAX_W = 48;
const CELL_GAP = 4;
const CELL_H = 38;
/** 왼쪽 라벨 자리와 오른쪽 십진값 자리. */
const GRID_LEFT = 76;
const GRID_RIGHT = 100;
const LABEL_X = 56;
const VALUE_X = W - 8;

const ROW_A_Y = 14;
const ROW_M_Y = 62;
const DIVIDER_Y = 110;
const ROW_R_Y = 118;
const RULE_Y = 174;
const CAPTION_Y = 197;

const GHOST_W = 34;
const GHOST_GAP = 8;

/** 연산에 새겨진 표식. 번역하지 않는다 (C10 판정 1). */
const OP_MARKS = ['AND', 'OR', 'XOR', 'NOT', '≪ 1', '≫ 1'] as const;
const MARK_A = 'a';
const MARK_B = 'b';
const MARK_FLIP = '0↔1';

/** 짚는 자리의 옅은 바탕. 색이 아니라 투명도라 토큰 대상이 아니다. */
const FOCUS_FILL_OPACITY = '0.18';

export type BitwiseScene = {
  opIndex: number;
  width: number;
  a: number;
  b: number;
  aBits: number[];
  bBits: number[];
  binary: boolean;
  shift: 'left' | 'right' | null;
};

export type BitwiseFocus = {
  index: number;
  srcIndex: number | null;
  aBit: number;
  bBit: number;
  binary: boolean;
};

export type BitwisePlace = { index: number; outBit: number; runningValue: number };
export type BitwiseDrop = { index: number; bit: number; side: 'left' | 'right' };

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const bitwiseOpsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const canvas = params.canvas;

    // 컨테이너를 비우지 않는다 — 러너가 붙여 준 캔버스가 떨어져 나간다 (S-view).
    const root = el('g', {});
    canvas.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
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

    /** 유한 프레임 보간. 끝 값은 어떤 경로로 끝나도 반드시 적용된다. */
    async function animate(ms: number, apply: (t: number) => void): Promise<void> {
      const frames = 6;
      for (let f = 1; f <= frames; f += 1) {
        if (destroyed) {
          apply(1);
          return;
        }
        await wait(Math.round(ms / frames));
        if (destroyed) {
          apply(1);
          return;
        }
        apply(f / frames);
      }
    }

    // ── 장면마다 다시 세워지는 것들.
    let scene: BitwiseScene = {
      opIndex: 0,
      width: 8,
      a: 0,
      b: 0,
      aBits: [],
      bBits: [],
      binary: true,
      shift: null,
    };
    let cellW = CELL_MAX_W;
    let originX = GRID_LEFT;
    let resultCells: SVGRectElement[] = [];
    let resultTexts: SVGTextElement[] = [];
    let resultValueText: SVGTextElement | null = null;
    let focusResult: SVGRectElement | null = null;
    let focusSource: SVGRectElement | null = null;
    let focusB: SVGRectElement | null = null;
    let ghostLeft: SVGGElement | null = null;
    let ghostRight: SVGGElement | null = null;

    const ruleText = el('text', {
      x: W / 2,
      y: RULE_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      'font-weight': '600',
      fill: colors.text,
    });
    const captionText = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });

    function cellX(index: number): number {
      return originX + index * cellW;
    }

    /** 유령 자리의 x — 격자 바로 바깥. */
    function ghostX(side: 'left' | 'right'): number {
      return side === 'left'
        ? originX - GHOST_W - GHOST_GAP
        : originX + scene.width * cellW - CELL_GAP + GHOST_GAP;
    }

    function bitCell(
      x: number,
      y: number,
      w: number,
      bit: number | null,
      dim: boolean,
    ): SVGGElement {
      const g = el('g', {});
      const lit = bit === 1;
      g.appendChild(
        el('rect', {
          x,
          y,
          width: w,
          height: CELL_H,
          rx: 4,
          fill: bit === null ? colors.bgSubtle : lit ? colors.accent : colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      if (bit !== null) {
        g.appendChild(
          Object.assign(
            el('text', {
              x: x + w / 2,
              y: y + CELL_H / 2 + 6,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.lg,
              'font-weight': lit ? '700' : '400',
              fill: lit ? colors.stateInk : dim ? colors.textMuted : colors.text,
            }),
            { textContent: String(bit) },
          ),
        );
      }
      return g;
    }

    function rowLabel(y: number, mark: string): SVGTextElement {
      return Object.assign(
        el('text', {
          x: LABEL_X,
          y: y + CELL_H / 2 + 5,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': '600',
          fill: colors.textMuted,
        }),
        { textContent: mark },
      );
    }

    function rowValue(y: number, mark: string): SVGTextElement {
      return Object.assign(
        el('text', {
          x: VALUE_X,
          y: y + CELL_H / 2 + 5,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
        }),
        { textContent: mark },
      );
    }

    /** 격자 밖 유령 한 칸 — 없는 자리. */
    function ghostCell(side: 'left' | 'right', bit: number | null): SVGGElement {
      const g = el('g', {});
      const x = ghostX(side);
      g.appendChild(
        el('rect', {
          x,
          y: ROW_A_Y,
          width: GHOST_W,
          height: CELL_H,
          rx: 4,
          fill: 'none',
          stroke: colors.ghostOutline,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        }),
      );
      if (bit !== null) {
        g.appendChild(
          Object.assign(
            el('text', {
              x: x + GHOST_W / 2,
              y: ROW_A_Y + CELL_H / 2 + 5,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              fill: colors.ghostOutline,
            }),
            { textContent: String(bit) },
          ),
        );
      }
      return g;
    }

    function connector(fromX: number, toX: number): SVGPathElement {
      const y1 = ROW_A_Y + CELL_H + 4;
      const y2 = ROW_R_Y - 4;
      return el('path', {
        d: `M ${fromX} ${y1} L ${toX} ${y2}`,
        stroke: colors.border,
        'stroke-width': 1.5,
        fill: 'none',
      });
    }

    function focusRect(y: number): SVGRectElement {
      return el('rect', {
        x: originX,
        y,
        width: cellW - CELL_GAP,
        height: CELL_H,
        rx: 4,
        fill: colors.itemComparing,
        'fill-opacity': FOCUS_FILL_OPACITY,
        stroke: colors.itemComparing,
        'stroke-width': 2.5,
        visibility: 'hidden',
      });
    }

    function render(next: BitwiseScene): void {
      scene = next;
      root.textContent = '';
      resultCells = [];
      resultTexts = [];

      const width = next.width;
      cellW = Math.min(CELL_MAX_W, Math.floor((W - GRID_LEFT - GRID_RIGHT) / width));
      originX =
        GRID_LEFT + Math.floor((W - GRID_LEFT - GRID_RIGHT - width * cellW) / 2);
      const inner = cellW - CELL_GAP;

      // ── a 의 자리
      root.appendChild(rowLabel(ROW_A_Y, MARK_A));
      for (let i = 0; i < width; i += 1) {
        root.appendChild(bitCell(cellX(i), ROW_A_Y, inner, next.aBits[i] ?? 0, false));
      }
      root.appendChild(rowValue(ROW_A_Y, String(next.a)));

      // ── 가운데 띠 — 이항이면 b 의 자리, 아니면 자리 사이의 길
      if (next.binary) {
        root.appendChild(rowLabel(ROW_M_Y, MARK_B));
        for (let i = 0; i < width; i += 1) {
          root.appendChild(bitCell(cellX(i), ROW_M_Y, inner, next.bBits[i] ?? 0, false));
        }
        root.appendChild(rowValue(ROW_M_Y, String(next.b)));
        // 세 줄이 곧게 선다는 것을 짧은 내림선으로 못 박는다.
        for (let i = 0; i < width; i += 1) {
          const cx = cellX(i) + inner / 2;
          root.appendChild(
            el('path', {
              d: `M ${cx} ${ROW_M_Y + CELL_H + 4} L ${cx} ${ROW_R_Y - 4}`,
              stroke: colors.border,
              'stroke-width': 1.5,
              fill: 'none',
            }),
          );
        }
      } else if (next.shift === null) {
        // NOT — 자리마다 제자리에서 뒤집힌다. 길은 곧다.
        for (let i = 0; i < width; i += 1) {
          const cx = cellX(i) + inner / 2;
          root.appendChild(connector(cx, cx));
          root.appendChild(
            Object.assign(
              el('text', {
                x: cx,
                y: ROW_M_Y + CELL_H / 2 + 4,
                'text-anchor': 'middle',
                'font-family': fonts.mono,
                'font-size': fontSizes.xs,
                fill: colors.textMuted,
              }),
              { textContent: MARK_FLIP },
            ),
          );
        }
      } else {
        // 자리 옮기기 — 길이 한 칸 기울어진다. 이 기울기가 이 화면의 예외다.
        const step = next.shift === 'left' ? 1 : -1;
        for (let i = 0; i < width; i += 1) {
          const src = i + step;
          const toX = cellX(i) + inner / 2;
          const fromX =
            src < 0 || src >= width
              ? ghostX(next.shift === 'left' ? 'right' : 'left') + GHOST_W / 2
              : cellX(src) + inner / 2;
          root.appendChild(connector(fromX, toX));
        }
      }

      // ── 격자 밖 유령. 자리 옮기기에서만 선다.
      ghostLeft = null;
      ghostRight = null;
      if (next.shift !== null) {
        // 들어오는 0 은 처음부터 보이고, 떨어지는 비트는 떨어질 때 채운다.
        const inSide = next.shift === 'left' ? 'right' : 'left';
        const outSide = next.shift === 'left' ? 'left' : 'right';
        const incoming = ghostCell(inSide, 0);
        const outgoing = ghostCell(outSide, null);
        root.appendChild(incoming);
        root.appendChild(outgoing);
        if (inSide === 'left') {
          ghostLeft = incoming;
          ghostRight = outgoing;
        } else {
          ghostLeft = outgoing;
          ghostRight = incoming;
        }
      }

      root.appendChild(
        el('path', {
          d: `M ${LABEL_X - 44} ${DIVIDER_Y} L ${VALUE_X} ${DIVIDER_Y}`,
          stroke: colors.border,
          'stroke-width': 1,
          fill: 'none',
        }),
      );

      // ── 결과의 자리 — 아직 아무것도 놓이지 않았다.
      root.appendChild(rowLabel(ROW_R_Y, OP_MARKS[next.opIndex] ?? ''));
      for (let i = 0; i < width; i += 1) {
        const cell = el('rect', {
          x: cellX(i),
          y: ROW_R_Y,
          width: inner,
          height: CELL_H,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const label = el('text', {
          x: cellX(i) + inner / 2,
          y: ROW_R_Y + CELL_H / 2 + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': '700',
          fill: colors.text,
        });
        root.appendChild(cell);
        root.appendChild(label);
        resultCells.push(cell);
        resultTexts.push(label);
      }
      resultValueText = rowValue(ROW_R_Y, '0');
      root.appendChild(resultValueText);

      // ── 짚는 테두리. 세 줄을 따로 움직여야 어긋남이 보인다.
      focusSource = focusRect(ROW_A_Y);
      focusB = focusRect(ROW_M_Y);
      focusResult = focusRect(ROW_R_Y);
      root.appendChild(focusSource);
      if (next.binary) root.appendChild(focusB);
      root.appendChild(focusResult);

      root.appendChild(ruleText);
      root.appendChild(captionText);
    }

    render(scene);

    function moveFocus(rect: SVGRectElement | null, toX: number | null): void {
      if (!rect) return;
      if (toX === null) {
        rect.setAttribute('visibility', 'hidden');
        return;
      }
      rect.setAttribute('visibility', 'visible');
      rect.setAttribute('x', String(toX));
    }

    const instance: ViewInstance = {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode) root.remove();
      },

      setScene(next: BitwiseScene): void {
        render(next);
      },

      setRule(text: string): void {
        ruleText.textContent = text;
      },

      setCaption(text: string): void {
        captionText.textContent = text;
      },

      async focusBit(focus: BitwiseFocus): Promise<void> {
        const inner = cellW - CELL_GAP;
        const toResult = cellX(focus.index);
        const toSource =
          focus.srcIndex === null
            ? ghostX(scene.shift === 'left' ? 'right' : 'left')
            : cellX(focus.srcIndex);

        const fromResult = Number(focusResult?.getAttribute('x') ?? toResult);
        const fromSource = Number(focusSource?.getAttribute('x') ?? toSource);
        const firstStep = focusResult?.getAttribute('visibility') === 'hidden';

        // 유령 자리는 칸보다 좁다 — 테두리도 그 폭에 맞춘다.
        focusSource?.setAttribute('width', String(focus.srcIndex === null ? GHOST_W : inner));

        if (firstStep) {
          moveFocus(focusResult, toResult);
          moveFocus(focusSource, toSource);
          moveFocus(focusB, focus.binary ? toResult : null);
          return;
        }

        moveFocus(focusResult, fromResult);
        moveFocus(focusSource, fromSource);
        moveFocus(focusB, focus.binary ? fromResult : null);

        await animate(150, (t) => {
          moveFocus(focusResult, fromResult + (toResult - fromResult) * t);
          moveFocus(focusSource, fromSource + (toSource - fromSource) * t);
          moveFocus(focusB, focus.binary ? fromResult + (toResult - fromResult) * t : null);
        });
      },

      placeBit(place: BitwisePlace): void {
        const cell = resultCells[place.index];
        const label = resultTexts[place.index];
        if (cell) {
          cell.setAttribute('fill', place.outBit === 1 ? colors.accent : colors.bg);
        }
        if (label) {
          label.textContent = String(place.outBit);
          label.setAttribute('fill', place.outBit === 1 ? colors.stateInk : colors.textMuted);
        }
        if (resultValueText) resultValueText.textContent = String(place.runningValue);
      },

      async dropBit(drop: BitwiseDrop): Promise<void> {
        const ghost = drop.side === 'left' ? ghostLeft : ghostRight;
        if (!ghost) return;
        const text = Object.assign(
          el('text', {
            x: ghostX(drop.side) + GHOST_W / 2,
            y: ROW_A_Y + CELL_H / 2 + 5,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: colors.ghostOutline,
          }),
          { textContent: String(drop.bit) },
        );
        ghost.appendChild(text);
        // 격자 밖으로 더 밀려나며 흐려진다 — 여덟 자리 밖은 없는 자리다.
        const away = drop.side === 'left' ? -18 : 18;
        await animate(220, (t) => {
          ghost.setAttribute('transform', `translate(${away * t} 0)`);
          ghost.setAttribute('opacity', String(1 - 0.55 * t));
        });
      },

      clearFocus(): void {
        focusResult?.setAttribute('visibility', 'hidden');
        focusSource?.setAttribute('visibility', 'hidden');
        focusB?.setAttribute('visibility', 'hidden');
      },
    };

    return instance;
  },
};
