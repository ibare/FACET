/**
 * silent-truncation-stage — 그릇보다 넓은 수를 담고, 테두리 밖 자리가 떨어지는 것을 그린다.
 *
 * ── 형태는 동사에서 나왔다
 *
 * 가로는 값이 흘러가는 축이다. 새 값은 왼쪽에서 들어오고, 다 담긴 값은 오른쪽으로
 * 나간다. 세로는 두 갈래로 갈린다 — **그릇 안으로 내려가는 것은 바닥에 닿아 멈추고,
 * 테두리 밖에서 내려가는 것은 받쳐 줄 바닥이 없어 캔버스 밖까지 간다.** 두 내림의
 * 차이가 이 조각이 하는 말 전부다.
 *
 * 그래서 그릇은 가운데 놓이지 않는다. 16자리 띠를 캔버스 폭에 맞춰 펴면 8자리 그릇은
 * 그 오른쪽 절반밖에 덮지 못하고, 덮지 못한 왼쪽 절반이 곧 벼랑이다. 이 어긋남은
 * 다듬을 결함이 아니라 보여야 할 사실이다.
 *
 * 떨어지기 **전에는** 아무 표시도 하지 않는다. 색도 바꾸지 않고 경고도 띄우지
 * 않는다 — 알려 주는 것이 없다는 것이 주장이므로, 화면이 미리 알려 주면 그 주장이
 * 무너진다. 자리의 운명을 말하는 것은 그 아래에 바닥이 있는가뿐이다.
 *
 * ── 떨어진 뒤에는 자취가 남는다 — 어휘를 갈라 둔다
 *
 * 옛 화면은 떨어져 나간 자리를 `remove()` 로 지웠다. 그래서 완주 화면에 남는 것이
 * "44" 하나뿐이었고, **무엇이 없어졌는지**가 사라져 조각이 "잘렸다" 만 말하고
 * "무엇이 잘렸는지" 는 말하지 않았다. 그릇의 폭도 견줄 것이 없어 뜻을 잃었다.
 *
 * 두 축으로 갈라 둔다.
 *
 * - **채움** = 값이 지금 거기 있나. 살아 있는 칸은 `itemDefault` 로 차 있고 글자를
 *   인다. 떠난 자리는 채움이 없고 글자도 없다.
 * - **테두리** = 자리가 있었나. 지금 자리는 실선, 떠난 자리는 점선이다.
 *
 * 둘이 제 축에 있으므로 "그릇에 든 여덟"과 "떨어져 나간 여덟"이 한 화면에 함께
 * 선다. 점선은 **그릇 밖**에만 서므로 프로그램이 그것을 아는 것처럼 읽히지 않는다 —
 * 그릇 안은 끝까지 아무 일도 없었던 얼굴이다.
 *
 * ── 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`offer()` · `pour()` · `truncate()`) 를 두지 않는다. 그
 * 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터 다시 밟는
 * 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의 화면
 * 전체**를 세운다 (S-scene). 요소를 남겨 두고 고쳐 쓰는 자리가 하나도 없으므로
 * 앞 걸음의 속성이 새 화면에 묻어 오지 않는다.
 *
 * 세로는 이 파일이 정하고, 가로는 러너가 PIECE_CANVAS_W 로 정한다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  bitsOf,
  keptOf,
  leavingOf,
  lostOf,
  overOf,
  resultsOf,
  type TruncationPhase,
  type TruncationScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 300;

/** 칸 크기는 캔버스에서 역산한다. 상수는 상한과 최소 여백일 뿐 (S-piece). */
const CELL_MAX_W = 36;
const SIDE_MIN = 24;
const CELL_H = 38;

const CAPTION_Y = 24;
const MARK_Y = 60;
/** 띠가 처음 서는 자리 (칸 위쪽). */
const HOME_Y = 76;
/** 그릇 안 슬롯의 위쪽. */
const SLOT_Y = 166;
const KEPT_Y = 254;
/** 그릇 테두리와 비트 칸 사이. */
const RIM = 15;

const DESCEND_DY = SLOT_Y - HOME_Y;
/** 캔버스 밖까지 — 받쳐 줄 바닥이 없다는 것을 끝까지 보인다. */
const FALL_DY = 210;
const FALL_DX = -40;
const FALL_TILT = 10;

const SLIDE_MS = 420;
const DESCEND_MS = 480;
const FALL_MS = 560;

/** 떠난 자리의 점선. 살아 있는 칸의 실선과 어휘를 가른다. */
const TRACE_DASH = '4 3';

/** 띠의 기하. 그릇 폭과 비트 폭이 정하므로 걸음마다 다시 셈해도 같은 값이다. */
type Layout = {
  cellW: number;
  stripW: number;
  originX: number;
  /** 테두리 밖에 걸리는 자리 수. */
  over: number;
  /** 그릇의 왼쪽 벽 = 벼랑. */
  cutX: number;
  vesselW: number;
};

function layoutOf(scene: TruncationScene): Layout {
  const from = Math.max(1, scene.from);
  const cellW = Math.max(1, Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / from)));
  const stripW = cellW * from;
  const originX = Math.round((W - stripW) / 2);
  const over = overOf(scene);
  return {
    cellW,
    stripW,
    originX,
    over,
    cutX: originX + cellW * over,
    vesselW: cellW * scene.width,
  };
}

/** 끝으로 갈수록 느려지는 미끄러짐. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
/** 내려앉음 — 떠났다 멎는다. */
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2);
/** 떨어지는 것과 나가는 것은 가속한다. */
const easeIn = (t: number): number => t * t;
/** 한 시계로 두 운동을 흘릴 때의 바탕 시계. 보간은 각 운동이 제 ease 로 한다. */
const linear = (t: number): number => t;

export const silentTruncationStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 저작자 오버라이드는 이 통로로만 온다. 러너 밖 mount 를 위한 fallback (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const root = document.createElementNS(NS, 'g');
    svg.appendChild(root);

    function el<K extends keyof SVGElementTagNameMap>(
      name: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      return node;
    }

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 세대 빗장.
     *
     * `opts.animate` 검사만으로는 모자란다 — 운동 도중에 `destroy` 가 오는 길이
     * 실제로 열려 있고, 그때 살아남은 프레임이 이미 걷힌 화면에 쓴다. 걸음 함수는
     * `await` 뒤마다, 그리고 **프레임마다** 제 세대를 본다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 걸음 하나를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(
      ms: number,
      mine: number,
      ease: (t: number) => number,
      apply: (e: number) => void,
    ): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = performance.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 내 세대가 아니면 화면에 손대지 않고 물러난다.
          if (!alive(mine)) return finish();
          const raw = Math.min(1, (performance.now() - started) / ms);
          apply(ease(raw));
          if (raw >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 그리기 ──────────────────────────────────────────────────────────

    /** 그릇 안에 들어가는 아래 자리들. 늘 살아 있다. */
    function buildLow(value: number, scene: TruncationScene, L: Layout, y: number): SVGGElement {
      const g = el('g', {});
      const bits = bitsOf(value, scene.from);
      for (let i = L.over; i < scene.from; i += 1) {
        const x = L.originX + i * L.cellW;
        g.appendChild(
          el('rect', {
            x: x + 1,
            y,
            width: L.cellW - 2,
            height: CELL_H,
            rx: 4,
            fill: c.itemDefault,
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        g.appendChild(
          el(
            'text',
            {
              x: x + L.cellW / 2,
              y: y + CELL_H / 2 + 5,
              'text-anchor': 'middle',
              fill: c.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
            },
            bits.charAt(i),
          ),
        );
      }
      return g;
    }

    /**
     * 테두리 밖에 걸리는 윗자리들.
     *
     * `live` 가 참이면 값이 든 칸(채움 + 실선 + 글자), 거짓이면 값이 떠난 자리의
     * 자취(채움 없음 + 점선 + 글자 없음)다. 두 축이 갈려 있어 한 화면에서
     * 부딪히지 않는다.
     *
     * `label` 이 참이면 그 자리들이 지니던 값을 **그 자리에** 매단다. 옆의 계기로
     * 날려 보내지 않는다 (S-piece).
     */
    function buildHigh(
      value: number,
      scene: TruncationScene,
      L: Layout,
      y: number,
      opts: { live: boolean; label: boolean },
    ): { g: SVGGElement; lost: SVGTextElement | null } {
      const g = el('g', {});
      const bits = bitsOf(value, scene.from);
      for (let i = 0; i < L.over; i += 1) {
        const x = L.originX + i * L.cellW;
        g.appendChild(
          el(
            'rect',
            opts.live
              ? {
                  x: x + 1,
                  y,
                  width: L.cellW - 2,
                  height: CELL_H,
                  rx: 4,
                  fill: c.itemDefault,
                  stroke: c.border,
                  'stroke-width': 1,
                }
              : {
                  x: x + 1,
                  y,
                  width: L.cellW - 2,
                  height: CELL_H,
                  rx: 4,
                  fill: 'none',
                  stroke: c.textMuted,
                  'stroke-width': 1,
                  'stroke-dasharray': TRACE_DASH,
                },
          ),
        );
        if (opts.live) {
          g.appendChild(
            el(
              'text',
              {
                x: x + L.cellW / 2,
                y: y + CELL_H / 2 + 5,
                'text-anchor': 'middle',
                fill: c.text,
                'font-family': fonts.mono,
                'font-size': fontSizes.md,
              },
              bits.charAt(i),
            ),
          );
        }
      }

      let lost: SVGTextElement | null = null;
      if (opts.label && L.over > 0) {
        lost = el(
          'text',
          {
            x: L.originX + (L.over * L.cellW) / 2,
            y: y - 9,
            'text-anchor': 'middle',
            // 살아 있는 동안은 값이고, 떠난 뒤에는 자취다.
            fill: opts.live ? c.text : c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          },
          String(lostOf(value, scene)),
        );
        g.appendChild(lost);
      }
      return { g, lost };
    }

    /** 값 하나의 띠 전체. 어느 단계에 서 있나가 자리와 어휘를 함께 정한다. */
    function buildStrip(
      value: number,
      scene: TruncationScene,
      L: Layout,
      phase: TruncationPhase,
    ): { g: SVGGElement; lost: SVGTextElement | null } {
      const y = phase === 'offered' ? HOME_Y : SLOT_Y;
      const g = el('g', {});
      g.appendChild(buildLow(value, scene, L, y));
      const high = buildHigh(value, scene, L, y, {
        live: phase !== 'cut',
        label: phase !== 'offered',
      });
      g.appendChild(high.g);
      return { g, lost: high.lost };
    }

    function captionTextOf(scene: TruncationScene): string {
      switch (scene.caption?.kind) {
        case 'offer':
          return t('caption.offer', 'Counted in {from} bits: {value}.', {
            from: scene.from,
            value: scene.hold?.value ?? 0,
          });
        case 'pour':
          return t('caption.pour', 'The bowl takes only {width} bits. Hanging past the rim: {over}.', {
            width: scene.width,
            over: overOf(scene),
          });
        case 'truncate':
          return t('caption.truncate', 'What fell away was worth {lost}. What stayed is {kept}.', {
            lost: scene.hold === null ? 0 : lostOf(scene.hold.value, scene),
            kept: scene.hold === null ? 0 : keptOf(scene.hold.value, scene),
          });
        case 'done':
          return t('caption.done', 'No error, no warning at any step. What stayed: {results}.', {
            results: resultsOf(scene).join(' · '),
          });
        default:
          return '';
      }
    }

    /** 걸음 함수가 붙잡는 손잡이. 정적 그리기가 매번 새로 만든다. */
    type Drawn = {
      /** 지금 든 값의 띠. 값이 없으면 null. */
      strip: SVGGElement | null;
      /** 그 띠에 매달린 잃은 값 글자. 아직 담기 전이면 null. */
      lost: SVGTextElement | null;
      /** 그릇에 남은 값 글자. 늘 있고, 말할 것이 없으면 비어 있다. */
      kept: SVGTextElement;
      /** 나가고 들어오는 띠가 얹히는 자리. 그릇 위에 온다. */
      flow: SVGGElement;
    };

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      root.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 남겨 두고 고쳐 쓰는 요소가 하나도 없다. */
    function drawStatic(scene: TruncationScene): Drawn {
      rewind();
      const L = layoutOf(scene);

      // ── 그릇. 위는 열려 있고 좌·우·아래가 막혀 있다. 왼쪽 벽이 벼랑이다.
      root.appendChild(
        el('rect', {
          x: L.cutX,
          y: SLOT_Y - RIM,
          width: L.vesselW,
          height: CELL_H + RIM * 2,
          rx: 6,
          fill: c.bgSubtle,
        }),
      );
      root.appendChild(
        el('path', {
          d:
            `M ${L.cutX} ${SLOT_Y - RIM}` +
            ` L ${L.cutX} ${SLOT_Y + CELL_H + RIM}` +
            ` L ${L.cutX + L.vesselW} ${SLOT_Y + CELL_H + RIM}` +
            ` L ${L.cutX + L.vesselW} ${SLOT_Y - RIM}`,
          fill: 'none',
          stroke: c.text,
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
        }),
      );

      // ── 표식. 자료형 표기는 그 분야가 원어 그대로 쓰는 말이라 키를 만들지 않는다 (C10).
      root.appendChild(
        el(
          'text',
          {
            x: L.originX,
            y: MARK_Y,
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          },
          `uint${scene.from}`,
        ),
      );
      root.appendChild(
        el(
          'text',
          {
            x: L.cutX + 9,
            y: SLOT_Y - RIM - 9,
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          },
          `uint${scene.width}`,
        ),
      );

      /*
       * 두 수를 위아래로 벌려 둔다. 가지고 온 값은 띠 한가운데 위에, 그릇에 남은 값은
       * 그릇 한가운데 아래에. 두 글자의 가로 위치가 어긋나 있는 것 자체가 잃은 폭이다.
       */
      root.appendChild(
        el(
          'text',
          {
            x: L.originX + L.stripW / 2,
            y: MARK_Y,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.xl,
          },
          scene.hold === null ? '' : String(scene.hold.value),
        ),
      );
      const kept = el(
        'text',
        {
          x: L.cutX + L.vesselW / 2,
          y: KEPT_Y,
          'text-anchor': 'middle',
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
        },
        // 그릇에 남은 값은 떨어져 나간 뒤에야 말할 수 있다.
        scene.hold !== null && scene.hold.phase === 'cut'
          ? String(keptOf(scene.hold.value, scene))
          : '',
      );
      root.appendChild(kept);

      root.appendChild(
        el(
          'text',
          {
            x: W / 2,
            y: CAPTION_Y,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.body,
            'font-size': fontSizes.md,
          },
          captionTextOf(scene),
        ),
      );

      // 띠는 그릇 위에 얹힌다. 마지막에 붙여 그리는 차례를 잡는다.
      const flow = el('g', {});
      root.appendChild(flow);

      let strip: SVGGElement | null = null;
      let lost: SVGTextElement | null = null;
      if (scene.hold !== null) {
        const built = buildStrip(scene.hold.value, scene, L, scene.hold.phase);
        flow.appendChild(built.g);
        strip = built.g;
        lost = built.lost;
      }

      return { strip, lost, kept, flow };
    }

    // ── 걸음의 운동 ─────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이다.

    /**
     * 값이 왼쪽에서 들어오고, 앞 값이 오른쪽으로 나간다.
     *
     * 둘은 "띠가 한 칸 흘러간다" 는 한 뜻이라 **시계를 둘로 나누지 않는다.** 한
     * `animate` 안에서 각자의 ease 로 보간한다 (프로토콜 3-4).
     */
    async function enter(scene: TruncationScene, drawn: Drawn, mine: number): Promise<void> {
      const g = drawn.strip;
      if (!g) return;
      const L = layoutOf(scene);
      const travel = L.originX + L.stripW;

      // 나가는 띠는 **운동 중에만** 짓는다. 정지 화면에 있어야 할 것이 아니므로
      // 정적 그리기가 모른다 (프로토콜 4 절의 "재건 밖 요소").
      const gone = leavingOf(scene);
      const leaving =
        gone === null ? null : buildStrip(gone, scene, L, 'cut').g;
      if (leaving) drawn.flow.insertBefore(leaving, g);
      const exitDx = W - L.cutX + 60;

      await animate(SLIDE_MS, mine, linear, (e) => {
        g.setAttribute('transform', `translate(${(easeOut(e) - 1) * travel} 0)`);
        leaving?.setAttribute('transform', `translate(${easeIn(e) * exitDx} 0)`);
      });
      leaving?.remove();
    }

    /** 띠가 그릇으로 내려앉는다. 아래 자리는 슬롯에 들어가고 윗자리는 허공에 걸린다. */
    async function descend(drawn: Drawn, mine: number): Promise<void> {
      const g = drawn.strip;
      if (!g) return;
      const lost = drawn.lost;
      await animate(DESCEND_MS, mine, easeInOut, (e) => {
        g.setAttribute('transform', `translate(0 ${(e - 1) * DESCEND_DY})`);
        // 걸린 자리가 지닌 값은 내려앉으며 드러난다. 앉기 전에는 말할 것이 없다.
        lost?.setAttribute('opacity', String(e));
      });
    }

    /**
     * 받쳐 줄 바닥이 없는 자리가 값을 달고 떨어진다. 캔버스 밖으로 나가면 그것으로 끝이다.
     *
     * 자취(점선 빈 칸)는 정적 그리기가 이미 그 자리에 세워 두었다. 값이 실린 칸이
     * 그 위에서 미끄러져 나가면 자취가 드러나는 꼴이 된다.
     */
    async function fall(scene: TruncationScene, drawn: Drawn, mine: number): Promise<void> {
      if (scene.hold === null) return;
      const L = layoutOf(scene);
      const kept = drawn.kept;

      const falling =
        L.over > 0
          ? buildHigh(scene.hold.value, scene, L, SLOT_Y, { live: true, label: true }).g
          : null;
      if (falling) drawn.flow.appendChild(falling);

      const cx = L.originX + (L.over * L.cellW) / 2;
      const cy = SLOT_Y + CELL_H / 2;
      await animate(FALL_MS, mine, easeIn, (e) => {
        falling?.setAttribute(
          'transform',
          `translate(${e * FALL_DX} ${e * FALL_DY}) rotate(${e * FALL_TILT} ${cx} ${cy})`,
        );
        // 그릇에 남은 값은 떨어져 나가는 만큼 또렷해진다.
        kept.setAttribute('opacity', String(e));
      });
      falling?.remove();
    }

    /**
     * 이 걸음에 무엇이 흐르나.
     *
     * `prev` 를 보지 않는다 — `hold.phase` 자체가 방금 무슨 일이 있었는지를
     * 말하므로 흐르게 할 것이 장면 하나로 정해진다 (S-scene).
     */
    function motionOf(scene: TruncationScene): 'enter' | 'descend' | 'fall' | null {
      if (scene.finished || scene.hold === null) return null;
      switch (scene.hold.phase) {
        case 'offered':
          return 'enter';
        case 'poured':
          return 'descend';
        case 'cut':
          return 'fall';
      }
    }

    async function render(
      next: TruncationScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: TruncationScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const drawn = drawStatic(next);
      // 되짚기는 이 길로 온다. 타이머도 프레임도 걸지 않고 곧바로 돌아간다.
      if (!opts.animate) return;

      switch (motionOf(next)) {
        case 'enter':
          await enter(next, drawn, mine);
          break;
        case 'descend':
          await descend(drawn, mine);
          break;
        case 'fall':
          await fall(next, drawn, mine);
          break;
        default:
          return;
      }

      // 운동이 남긴 `transform` · `opacity` · 보간 끝자리를 통째로 지운다. 속성을
      // 하나씩 거두면 반드시 하나를 빠뜨린다 (프로토콜 4 절). 그 사이에 타이머도
      // 프레임도 없어 깜빡이지 않는다.
      if (!alive(mine)) return;
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 세대를 올려 살아남은 프레임이 화면에 손대지 못하게 한다.
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 약속을 반드시 푼다. 타이머만 거두면 콜백이 아예 안 불려
        // `await ctx.emit` 이 영영 안 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
