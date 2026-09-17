/**
 * 고르지 않은 눈금 — 그림. 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 동사는 "벌어진다". 그런데 1 의 사이 거리와 65,536 의 사이 거리는 65,536 배
 * 차이라, 한 축척에 같이 올리면 한쪽이 점이 되어 아무 일도 일어나지 않는 화면이
 * 된다. 그래서 **카메라가 물러선다** — 걸음마다 지금 칸이 앞 눈금 하나 크기로
 * 줄어들고(물러섬), 새 지점의 이웃이 다시 화면 끝까지 달아난다(벌어짐).
 *
 * 한 걸음 안의 비율은 축척에 기대지 않는다. 앞 눈금 몇 개가 새 칸에 들어가는지를
 * **빗살로 세어 보인다** — 2 개, 8 개, 64 개, 64 개. 그 빗살이 "배로 멀어진다" 의
 * 증거이고, 축척이 걸음 사이에 바뀐다는 전제는 글이 밝힌다 (description.ts).
 *
 * ── 위쪽의 자취 사다리 — 이 그림이 옮기며 얻은 것
 *
 * 카메라가 물러서면 멎은 화면은 걸음마다 거의 같아진다. 이웃은 언제나 칸의 오른쪽
 * 끝에 서 있고 달라지는 것은 값과 표기와 빗살 개수뿐이라, **벌어짐은 운동을 지켜본
 * 사람에게만 보였다.** 그래서 지나온 지점이 남는 사다리를 위에 두었다.
 *
 * - 가로 한 칸 = **눈금이 배로 벌어지는 한 번.** 축의 전체 길이는 바탕의 마지막
 *   지점이 정하므로 지점이 늘어도 앞 눈금의 자리가 움직이지 않는다 (척도는 한 번만
 *   정한다 — `scene.ts` 의 `totalDoublings`).
 * - **채움 = 이 지점의 형편** — 자리 눈금과 그 위로 자란 막대(처음 눈금의 몇 배인가).
 * - **테두리 = 지금 짚는 자리** — 지금 지점에만 고리가 둘린다.
 *
 * 두 축이 갈려 있어 이긴 것과 지나온 것이 한 화면에 함께 선다 (프로토콜 4 절).
 *
 * ── 그리는 방식
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene). 운동이 끝나면 장면을 통째로 다시 세워 보간이 남긴 속성과 끝자리를
 * 한꺼번에 지운다.
 *
 * 잰 값은 재는 자리에 남긴다 — 사이 거리는 두 눈금 사이의 자 위에, 값은 제 눈금
 * 아래에, 배수는 사다리의 제 막대 위에 붙는다. 옆의 계기로 날려 보내지 않는다
 * (S-piece).
 *
 * 세로는 이 파일이 정하고, 가로는 러너가 정한다 (PIECE_CANVAS_W). 색은 전부
 * design-tokens 경유다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionFor,
  currentIndex,
  doublingsOf,
  gapOf,
  multipleOf,
  neighbourOf,
  notchExponentOf,
  ratioOf,
  sampleAt,
  spanCountOf,
  spanOf,
  totalDoublings,
  type UnevenFloatGapsScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 마운트한 뒤 바뀌지 않는다. 바뀌면 글 안의 위아래 문단이 밀린다 (S-view). */
const H = 288;

/** 기준 눈금이 서는 자리와 칸이 뻗는 끝. 남는 폭을 여백으로 버리지 않는다. */
const X0 = 56;
const X1 = W - 44;
const BAR = X1 - X0;

// ── 자취 사다리
const LADDER_TITLE_Y = 34;
const LADDER_TOP = 46;
const LADDER_Y = 76;
const LADDER_H = LADDER_Y - LADDER_TOP;
const LADDER_LABEL_Y = 96;
/** 한 번 배로 벌어짐을 세는 잔눈금. 축이 무엇을 세는지 이것이 말한다. */
const UNIT_TICK = 4;
const RUNG_TICK = 7;
const RUNG_BAR_W = 7;
const RUNG_RING_R = 5;
/** 막대 꼭대기에서 배수 표기까지. */
const STAMP_LIFT = 7;
/** 되짚는 걸음에서 자리 눈금이 잠깐 길어지는 만큼. */
const CLOSE_LIFT = 7;

// ── 본 무대
const GAP_TEXT_Y = 120;
const SPAN_Y = 138;
const SERIF = 6;
const VALUE_Y = 164;
const TICK_TOP = 172;
const RAIL_Y = 188;
const TICK_BOTTOM = 204;
const NEIGHBOUR_TOP = 176;
const NEIGHBOUR_BOTTOM = 200;
const COMB_TOP = 190;
const COMB_BOTTOM = 202;
const COMB_LABEL_Y = 222;
const OCTAVE_Y = 246;
const CAPTION_Y = 274;

const SWEEP_W = 72;
const SWEEP_TOP = 168;
const SWEEP_H = 40;

const FRAME_MS = 16;
const OPEN_MS = 700;
const PULL_BACK_MS = 340;
const RUN_AWAY_MS = 660;
const SWEEP_MS = 620;
/** 닫는 걸음의 되짚기. 얇은 걸음에 그 걸음이 하는 말과 같은 동사를 얹는다. */
const CLOSE_MS = 280;

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 자리 구분은 쉼표로 — 빈칸으로 묶으면 언어에 따라 다르게 읽힌다. */
function group(n: number): string {
  return n.toLocaleString('en-US');
}

function superscript(n: number): string {
  const digits = String(Math.abs(n))
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)] ?? '')
    .join('');
  return (n < 0 ? '⁻' : '') + digits;
}

/**
 * 사이 거리 표기 — `2⁻²³ = 0.00000011920928955078125`.
 *
 * 수식 기호 표기라 문안이 아니다 (C10 의 표식 판정 3). 십진 전개는 `toFixed` 로
 * 얻는데, 2 의 음수 거듭제곱은 십진에서 정확히 끝나므로 |지수| 자리까지 펴면
 * 반올림 없이 그 수 자체가 된다.
 */
function notation(gap: number, gapExp: number): string {
  return `2${superscript(gapExp)} = ${gap.toFixed(Math.abs(gapExp))}`;
}

/** 사다리에 선 지점 하나. 정적 그리기가 세우고 걸음의 운동이 만진다. */
type DrawnRung = {
  /** 축 아래로 내려 그은 자리 눈금. */
  tick: SVGLineElement;
  /** 처음 눈금의 몇 배인가. 높이가 0 인 첫 지점에는 없다 (짓지 않는다). */
  bar: SVGRectElement | null;
  /** `×N`. 배수가 뜻을 갖는 둘째 지점부터 있다. */
  stamp: SVGTextElement | null;
  /** 지금 짚는 자리에만 둘리는 고리. */
  ring: SVGCircleElement | null;
  value: SVGTextElement;
  /** 축 위에서의 자리 (0~1). 되짚는 걸음이 이 순서로 훑는다. */
  fraction: number;
  /** 막대의 목표 높이. 운동이 0 에서 여기까지 키운다. */
  height: number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  valueText: SVGTextElement;
  gapText: SVGTextElement | null;
  nextText: SVGTextElement | null;
  combLabel: SVGTextElement | null;
  neighbour: SVGLineElement | null;
  spanLine: SVGLineElement | null;
  spanRight: SVGLineElement | null;
  teeth: Array<{ node: SVGLineElement; x: number }>;
  rungs: DrawnRung[];
  /** 방금 선 지점. 아직 아무 지점도 안 섰으면 null. */
  newest: DrawnRung | null;
};

export const unevenFloatGapsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<UnevenFloatGapsScene> {
    const svg = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가 먼저 붙여 둔 캔버스가
    // 통째로 떨어져 나가고, 예외도 안 나면서 그림만 사라진다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gLadder = el('g', {});
    const gStage = el('g', {});
    /** 운동에서만 사는 것. 정지 화면에는 아무것도 남지 않는다 (함정 "재건 밖 요소"). */
    const gFlow = el('g', {});
    const gCaption = el('g', {});
    const layers = [gLadder, gStage, gFlow, gCaption];
    for (const g of layers) svg.appendChild(g);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 마디 둘(물러섬 · 달아남)을 잇달아 지난다. 가운데에 `destroy` 가
     * 끼어들면 남은 타이머가 이미 떨어져 나간 화면에 쓰므로, 마디마다 자기 번호가
     * 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면
     * 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 걸음마다의 운동. 타이머를 걸고 destroy 가 일괄로 거둔다.
     *
     * 벽시계로 도는 상시 루프가 아니라 걸음 안에서 시작하고 끝나므로 되짚기가
     * 흔들리지 않는다 (프로토콜 4 절의 상시 rAF 금지와는 다른 자리다).
     */
    function tween(durationMs: number, mine: number, apply: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 기다리던 약속은 반드시 푼다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = durationMs <= 0 ? 1 : Math.min(1, (Date.now() - started) / durationMs);
          apply(1 - (1 - p) ** 3);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 타이머를 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    function text(
      x: number,
      y: number,
      anchor: 'start' | 'middle' | 'end',
      family: string,
      size: string,
      fill: string,
      content: string,
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'text-anchor': anchor,
        'font-family': family,
        'font-size': size,
        fill,
      });
      node.textContent = content;
      return node;
    }

    function captionText(scene: UnevenFloatGapsScene): string {
      const c = captionFor(scene);
      if (c === null) return '';
      switch (c.kind) {
        case 'anchor':
          return t(
            'caption.anchor',
            'The next float32 after 1 lands here. Call this gap one notch.',
          );
        case 'widen':
          return t('caption.widen', 'At {value}: the neighbour is {k} notches away.', {
            value: group(c.value),
            k: group(c.k),
          });
        case 'count':
          return t(
            'caption.count',
            'Every span from a number to its double holds the same count: {count}.',
            { count: group(c.count) },
          );
        case 'close':
          return t(
            'caption.done',
            'The bigger the number, the farther its neighbour. The notches are not even.',
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of layers) g.textContent = '';
    }

    /**
     * 자취 사다리를 세운다.
     *
     * 자리도 높이도 **바탕이 정한 축**을 지난다 — 지나온 지점 수로 축을 다시 잡으면
     * 앞 눈금이 움직인다 (프로토콜 4 절). 자리를 먼저 한 번에 셈하고 그 다음에
     * 그린다.
     */
    function drawLadder(scene: UnevenFloatGapsScene): { rungs: DrawnRung[]; newest: DrawnRung | null } {
      const total = totalDoublings(scene);

      // 사다리가 무엇을 재는지 — 막대의 높이는 처음 눈금과 견준 배수다.
      gLadder.appendChild(
        text(
          X0,
          LADDER_TITLE_Y,
          'start',
          fonts.body,
          fontSizes.xs,
          colors.textMuted,
          t('label.times', 'vs. the first notch'),
        ),
      );
      gLadder.appendChild(
        el('line', {
          x1: X0,
          y1: LADDER_Y,
          x2: X1,
          y2: LADDER_Y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      // 잔눈금 하나가 "배로 벌어지는 한 번" 이다. 바탕이 정하므로 걸음이 늘어도
      // 개수가 바뀌지 않는다.
      for (let u = 0; u <= total; u += 1) {
        const x = X0 + (BAR * u) / total;
        gLadder.appendChild(
          el('line', {
            x1: x,
            y1: LADDER_Y,
            x2: x,
            y2: LADDER_Y + UNIT_TICK,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
      }

      const index = currentIndex(scene);
      const rungs: DrawnRung[] = [];
      for (let j = 0; j < scene.visited; j += 1) {
        const value = sampleAt(scene, j);
        const doublings = doublingsOf(scene, j);
        const multiple = multipleOf(scene, j);
        if (value === null || doublings === null || multiple === null) continue;

        const fraction = doublings / total;
        const x = X0 + BAR * fraction;
        const height = LADDER_H * fraction;

        // 채움 = 이 지점의 형편. 자리 눈금과 그 위로 자란 막대다.
        const tick = el('line', {
          x1: x,
          y1: LADDER_Y,
          x2: x,
          y2: LADDER_Y + RUNG_TICK,
          stroke: colors.itemActive,
          'stroke-width': 2,
        });
        // 첫 지점은 배수가 1 이라 자란 것이 없다. 숨기지 말고 짓지 않는다 (함정 17).
        const bar =
          height >= 1
            ? el('rect', {
                x: x - RUNG_BAR_W / 2,
                y: LADDER_Y - height,
                width: RUNG_BAR_W,
                height,
                fill: colors.itemActive,
              })
            : null;
        const stamp =
          j > 0
            ? text(
                Math.min(W - 6, Math.max(6, x)),
                LADDER_Y - height - STAMP_LIFT,
                'middle',
                fonts.mono,
                fontSizes.xs,
                colors.textMuted,
                `×${group(multiple)}`,
              )
            : null;
        // 테두리 = 지금 짚는 자리. 채움과 축이 달라 둘이 부딪히지 않는다 (함정 29).
        const ring =
          j === index
            ? el('circle', {
                cx: x,
                cy: LADDER_Y,
                r: RUNG_RING_R,
                fill: 'none',
                stroke: colors.text,
                'stroke-width': 1.5,
              })
            : null;
        const valueLabel = text(
          Math.min(W - 6, Math.max(6, x)),
          LADDER_LABEL_Y,
          'middle',
          fonts.mono,
          fontSizes.xs,
          colors.textMuted,
          group(value),
        );

        if (bar !== null) gLadder.appendChild(bar);
        gLadder.appendChild(tick);
        if (ring !== null) gLadder.appendChild(ring);
        if (stamp !== null) gLadder.appendChild(stamp);
        gLadder.appendChild(valueLabel);

        rungs.push({ tick, bar, stamp, ring, value: valueLabel, fraction, height });
      }
      return { rungs, newest: rungs[rungs.length - 1] ?? null };
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 멎은 화면에서 이웃은 언제나 칸의 오른쪽 끝에 선다 — 그것이 이 그림의 규칙이라
     * 화면을 도로 읽을 까닭이 없다. 두 번 그려도 사이에 페인트가 끼지 않는다.
     */
    function drawStatic(scene: UnevenFloatGapsScene): Drawn {
      rewind();

      const { rungs, newest } = drawLadder(scene);
      const index = currentIndex(scene);

      gStage.appendChild(
        el('line', {
          x1: X0,
          y1: RAIL_Y,
          x2: X1,
          y2: RAIL_Y,
          stroke: colors.border,
          'stroke-width': 2,
        }),
      );
      gStage.appendChild(
        el('line', {
          x1: X0,
          y1: TICK_TOP,
          x2: X0,
          y2: TICK_BOTTOM,
          stroke: colors.text,
          'stroke-width': 3,
        }),
      );

      // 아직 아무 지점도 안 섰으면 첫 지점의 이름만 기준 눈금 아래에 선다.
      const shown = index < 0 ? sampleAt(scene, 0) : sampleAt(scene, index);
      const valueText = text(
        X0,
        VALUE_Y,
        'start',
        fonts.mono,
        fontSizes.md,
        colors.text,
        shown === null ? '' : group(shown),
      );
      gStage.appendChild(valueText);

      let gapText: SVGTextElement | null = null;
      let nextText: SVGTextElement | null = null;
      let combLabel: SVGTextElement | null = null;
      let neighbour: SVGLineElement | null = null;
      let spanLine: SVGLineElement | null = null;
      let spanRight: SVGLineElement | null = null;
      const teeth: Array<{ node: SVGLineElement; x: number }> = [];

      if (index >= 0) {
        const nx = X0 + BAR;
        const gap = gapOf(scene, index);
        const gapExp = notchExponentOf(scene, index);
        const neighbourValue = neighbourOf(scene, index);

        // 앞 눈금 몇 개가 이 칸에 들어가는가. 첫 지점에는 견줄 앞 눈금이 없다.
        const k = ratioOf(scene, index);
        const combCount = k === null ? 0 : Math.max(0, Math.round(k));
        if (combCount >= 2) {
          const unit = BAR / combCount;
          for (let j = 1; j <= combCount; j += 1) {
            const x = X0 + unit * j;
            // 이웃이 지나간 자리에만 빗살이 남는다 — 멎은 화면에서는 전부 지나갔다.
            if (x > nx + 0.5) continue;
            const node = el('line', {
              x1: x,
              y1: COMB_TOP,
              x2: x,
              y2: COMB_BOTTOM,
              stroke: colors.textMuted,
              'stroke-width': 1,
            });
            gStage.appendChild(node);
            teeth.push({ node, x });
          }
          combLabel = text(
            (X0 + X1) / 2,
            COMB_LABEL_Y,
            'middle',
            fonts.body,
            fontSizes.xs,
            colors.textMuted,
            t('label.notches', '{k} × the previous notch', { k: group(combCount) }),
          );
          gStage.appendChild(combLabel);
        }

        spanLine = el('line', {
          x1: X0,
          y1: SPAN_Y,
          x2: nx,
          y2: SPAN_Y,
          stroke: colors.itemActive,
          'stroke-width': 1.5,
        });
        const spanLeft = el('line', {
          x1: X0,
          y1: SPAN_Y - SERIF,
          x2: X0,
          y2: SPAN_Y + SERIF,
          stroke: colors.itemActive,
          'stroke-width': 1.5,
        });
        spanRight = el('line', {
          x1: nx,
          y1: SPAN_Y - SERIF,
          x2: nx,
          y2: SPAN_Y + SERIF,
          stroke: colors.itemActive,
          'stroke-width': 1.5,
        });
        neighbour = el('line', {
          x1: nx,
          y1: NEIGHBOUR_TOP,
          x2: nx,
          y2: NEIGHBOUR_BOTTOM,
          stroke: colors.itemActive,
          'stroke-width': 3,
        });
        gStage.appendChild(spanLine);
        gStage.appendChild(spanLeft);
        gStage.appendChild(spanRight);
        gStage.appendChild(neighbour);

        if (gap !== null && gapExp !== null) {
          gapText = text(
            (X0 + X1) / 2,
            GAP_TEXT_Y,
            'middle',
            fonts.mono,
            fontSizes.sm,
            colors.text,
            notation(gap, gapExp),
          );
          gStage.appendChild(gapText);
        }
        if (neighbourValue !== null) {
          nextText = text(
            nx,
            VALUE_Y,
            'end',
            fonts.mono,
            fontSizes.sm,
            colors.itemActive,
            String(neighbourValue),
          );
          gStage.appendChild(nextText);
        }
      }

      if (scene.counted) {
        const count = spanCountOf(scene);
        const span = spanOf(scene);
        if (count !== null && span !== null) {
          gStage.appendChild(
            text(
              (X0 + X1) / 2,
              OCTAVE_Y,
              'middle',
              fonts.body,
              fontSizes.xs,
              colors.textMuted,
              t('label.octave', '{count} such gaps fill one span: {from} to {to}', {
                count: group(count),
                from: group(span.from),
                to: group(span.to),
              }),
            ),
          );
        }
      }

      gCaption.appendChild(
        text(
          W / 2,
          CAPTION_Y,
          'middle',
          fonts.body,
          fontSizes.sm,
          colors.textMuted,
          captionText(scene),
        ),
      );

      return {
        valueText,
        gapText,
        nextText,
        combLabel,
        neighbour,
        spanLine,
        spanRight,
        teeth,
        rungs,
        newest,
      };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /** 이웃 눈금이 선 자리에 맞춰 자·빗살·값을 다시 앉힌다. 운동에서만 쓴다. */
    function placeNeighbour(drawn: Drawn, nx: number): void {
      const at = String(nx);
      drawn.neighbour?.setAttribute('x1', at);
      drawn.neighbour?.setAttribute('x2', at);
      drawn.spanLine?.setAttribute('x2', at);
      drawn.spanRight?.setAttribute('x1', at);
      drawn.spanRight?.setAttribute('x2', at);
      drawn.nextText?.setAttribute('x', at);
      for (const tooth of drawn.teeth) {
        tooth.node.setAttribute('opacity', tooth.x <= nx + 0.5 ? '1' : '0');
      }
    }

    /** 방금 선 사다리 단의 막대를 0 에서 제 높이까지 키운다. */
    function growNewest(drawn: Drawn, e: number): void {
      const rung = drawn.newest;
      if (rung === null || rung.bar === null) return;
      const h = rung.height * e;
      rung.bar.setAttribute('y', String(LADDER_Y - h));
      rung.bar.setAttribute('height', String(Math.max(0, h)));
      rung.stamp?.setAttribute('y', String(LADDER_Y - h - STAMP_LIFT));
    }

    /** 첫 칸을 연다 — 이웃이 기준 눈금에서 칸 끝까지 나아간다. */
    async function flowAnchor(drawn: Drawn, mine: number): Promise<void> {
      drawn.nextText?.setAttribute('opacity', '0');
      await tween(OPEN_MS, mine, (e) => placeNeighbour(drawn, X0 + BAR * e));
    }

    /**
     * 다음 지점으로 간다. 두 몸짓이다 —
     * 카메라가 물러서고(지금 칸이 앞 눈금 하나로 줄고), 새 이웃이 달아난다.
     *
     * 물러섬의 출발 그림은 **앞 지점**에서 셈한다. `prev` 장면에서 꺼내면 위반이다
     * (S-scene) — 장면이 `samples` 를 쥐고 있으므로 꺼낼 까닭도 없다.
     */
    async function flowWiden(
      scene: UnevenFloatGapsScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const index = currentIndex(scene);
      const k = ratioOf(scene, index);
      if (k === null) return;
      const combCount = Math.max(2, Math.round(k));
      const stub = BAR / combCount;

      // ── 물러섬. 화면을 앞 지점의 것으로 되돌린 뒤 칸이 앞 눈금 하나로 줄어든다.
      const before = sampleAt(scene, index - 1);
      const beforeGap = gapOf(scene, index - 1);
      const beforeExp = notchExponentOf(scene, index - 1);
      if (before !== null) drawn.valueText.textContent = group(before);
      if (beforeGap !== null && beforeExp !== null && drawn.gapText !== null) {
        drawn.gapText.textContent = notation(beforeGap, beforeExp);
      }
      drawn.nextText?.setAttribute('opacity', '0');
      drawn.combLabel?.setAttribute('opacity', '0');
      for (const tooth of drawn.teeth) tooth.node.setAttribute('opacity', '0');
      const newest = drawn.newest;
      newest?.tick.setAttribute('opacity', '0');
      newest?.bar?.setAttribute('opacity', '0');
      newest?.stamp?.setAttribute('opacity', '0');
      newest?.ring?.setAttribute('opacity', '0');
      newest?.value.setAttribute('opacity', '0');

      await tween(PULL_BACK_MS, mine, (e) => placeNeighbour(drawn, X0 + BAR + (stub - BAR) * e));
      if (!alive(mine)) return;

      // ── 새 지점으로 갈아 끼운다. 사다리의 새 단이 서고 막대는 아직 0 이다.
      const value = sampleAt(scene, index);
      const gap = gapOf(scene, index);
      const gapExp = notchExponentOf(scene, index);
      if (value !== null) drawn.valueText.textContent = group(value);
      if (gap !== null && gapExp !== null && drawn.gapText !== null) {
        drawn.gapText.textContent = notation(gap, gapExp);
      }
      drawn.combLabel?.removeAttribute('opacity');
      newest?.tick.removeAttribute('opacity');
      newest?.bar?.removeAttribute('opacity');
      newest?.stamp?.removeAttribute('opacity');
      newest?.ring?.removeAttribute('opacity');
      newest?.value.removeAttribute('opacity');
      growNewest(drawn, 0);

      // ── 달아남. 이웃이 다시 칸 끝까지 가고 지나간 자리에 빗살이 새겨진다.
      //    사다리의 막대도 같은 시계로 자란다 — 한 뜻의 운동이라 시계를 나누지 않는다.
      await tween(RUN_AWAY_MS, mine, (e) => {
        placeNeighbour(drawn, X0 + stub + (BAR - stub) * e);
        growNewest(drawn, e);
      });
    }

    /**
     * 이런 칸이 몇 개 모여 한 구간이 되는지 — 칸 위를 한 번 훑는다.
     *
     * 훑개는 운동에서만 산다. `opacity` 만 되돌리면 앞 걸음의 `x` 가 그대로 남아
     * 되짚기 판정에서 어긋난다 (함정 "재건 밖 요소").
     */
    async function flowCount(mine: number): Promise<void> {
      const sweep = el('rect', {
        x: X0,
        y: SWEEP_TOP,
        width: SWEEP_W,
        height: SWEEP_H,
        fill: colors.accent,
        opacity: 0.18,
      });
      gFlow.appendChild(sweep);
      await tween(SWEEP_MS, mine, (e) => {
        sweep.setAttribute('x', String(X0 + (BAR - SWEEP_W) * e));
      });
      sweep.remove();
    }

    /**
     * 닫는 말 — 지나온 사다리를 왼쪽에서 오른쪽으로 되짚는다.
     *
     * 그 걸음이 하는 말("수가 클수록 이웃이 멀다")과 같은 동사다. 진폭이 양 끝에서
     * 0 이라 멎은 화면은 어느 걸음에서 오든 같다 (프로토콜 4 절).
     */
    async function flowClose(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.rungs.length === 0) return;
      await tween(CLOSE_MS, mine, (e) => {
        const wave = Math.sin(Math.PI * e);
        for (const rung of drawn.rungs) {
          const near = Math.max(0, 1 - Math.abs(e - rung.fraction) / 0.25);
          const lift = CLOSE_LIFT * near * wave;
          rung.tick.setAttribute('y2', String(LADDER_Y + RUNG_TICK + lift));
        }
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: UnevenFloatGapsScene,
      _prev: UnevenFloatGapsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      if (step.kind === 'anchor') await flowAnchor(drawn, mine);
      else if (step.kind === 'widen') await flowWiden(next, drawn, mine);
      else if (step.kind === 'count') await flowCount(mine);
      else await flowClose(drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 opacity 가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const g of layers) g.remove();
      },
    };
  },
};
