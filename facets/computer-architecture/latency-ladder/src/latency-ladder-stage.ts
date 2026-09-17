/**
 * latency-ladder stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 축척이 하나다
 * 200 사이클이 캔버스의 세로를 다 쓰고, 4 사이클은 그 50분의 1인 8 픽셀이다.
 * 그래서 위 세 계단참이 꼭대기에 몰려 붙고 마지막 낙하 하나가 화면의 3분의 2를
 * 차지한다. **그 몰림이 결함이 아니라 이 그림이 하려는 말이다** — 고르게 그리면
 * 주장이 사라지고, 로그 축으로 펴면 "고른 계단" 으로 보여 깨려던 믿음을
 * 되살린다 (`description.ts` 가 그 선택을 밝힌다).
 *
 * **축척을 두 군데서 정하지 않는다.** 세로 자는 `geomOf` 하나가 장면의 층 목록
 * **전체**에서 잡는다. 드러난 층만으로 잡으면 층이 늘 때마다 자가 다시 잡혀 앞
 * 계단참이 자리를 옮긴다.
 *
 * 몰린 자리를 읽히게 하려고 글자를 옮긴 것이지 계단을 옮기지 않았다. 계단참의
 * 수치는 계단참 오른쪽 끝 위에 매달리고(계단이 오른쪽으로 어긋나 쌓이므로 그
 * 기둥은 늘 비어 있다), 층 이름은 왼쪽 끝 아래에 새긴다.
 *
 * ── 낙하는 등속이다
 * `FALL_PX_PER_MS` 하나로 모든 낙하를 굴리므로 거리가 곧 시간이 된다. 마지막
 * 한 걸음이 눈에 띄게 오래 걸리는 것은 연출이 아니라 같은 데이터의 두 번째
 * 통로다. 다만 너무 짧은 낙하는 볼 틈이 없어 `FALL_MIN_MS` 를 바닥으로 둔다.
 *
 * ── 채움과 테두리를 갈랐다
 * 옛 화면은 계단참의 `fill` 하나에 형편 넷(안 닿음 · 짚는 중 · 놓쳤다 · 찾았다)을
 * 실었고, **놓친 층을 `border` 로 되돌려** 아직 닿지 않은 층(`textMuted`) 보다
 * 흐리게 만들었다. 다 끝난 화면에서 "어느 층에서 놓쳤나" 가 거의 사라졌다 —
 * `hit` 과 대조될 것이 없으면 "아래로 갈수록 비싸다" 가 서지 않는다.
 *
 * - **채움 = 층의 형편** — 안 닿음(border) · 짚는 중(itemActive) · 놓쳤다(textMuted)
 *   · 찾았다(accent, 두꺼운 판).
 * - **테두리 = 지금 짚는 층** — 그 층의 계단참에만 두른다. 층 이름의 잉크도 같은
 *   축이다.
 *
 * 두 축이 부딪히지 않으므로 완주 화면에 **놓친 층 셋과 찾은 층 하나**가 함께 선다
 * (프로토콜 4 절 — 한 축에 값을 셋 이상 욱여넣지 않는다).
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는 값이라
 * 이 파일이 상수로 갖는다 (S-piece). 색은 전부 design-tokens 경유다 (S-view).
 * `×50` 같은 수식 표기는 표식이라 키를 만들지 않는다 (C10).
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
  shownCount,
  spanFactorOf,
  stateOf,
  trailCount,
  type LatencyLadderScene,
  type LatencyRungState,
} from './scene.js';
import type { LatencyRung } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 정하므로 여기 없다 (S-piece). */
const H = 470;
const W = PIECE_CANVAS_W;

/** 0 사이클의 자리 — 코어. 모든 깊이가 여기서부터 잰다. */
const DATUM_Y = 26;
/** 가장 깊은 층의 자리. */
const FLOOR_Y = H - 46;
const CAPTION_Y = H - 14;
const CAPTION_X = 14;

/** 왼쪽 총배수 기둥. */
const GUTTER_X = 34;
const GUTTER_CAP = 12;
const ORIGIN_X = 56;
const PAD_R = 20;

/** 계단참 끝에 매다는 수치 기둥의 폭. */
const TAG_W = 86;
const TAG_GAP = 8;
const TAG_PITCH = 13;

const PLANK_MAX_W = 200;
const PLANK_H = 3;
const PLANK_H_FOUND = 5;
/** 계단참 오른쪽 끝에서 이만큼 앞에서 떨어진다. */
const DEPART_PAD = 30;

const MARKER = 13;
const MARKER_R = 3;

const FALL_PX_PER_MS = 0.16;
const FALL_MIN_MS = 160;
const WALK_MS = 220;
const APPEAR_MS = 140;
const BOUNCE_MS = 360;
const SPAN_MS = 620;
/** 튀어오르는 높이. */
const BOUNCE_H = 7;
/** 아직 닿지 않은 계단참이 낙하 중에 드러나기 시작하는 투명도. */
const REVEAL_FROM = 0.25;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

/** 걸음의 시작과 끝을 무르게 한다. 낙하에는 쓰지 않는다 — 거기는 등속이 뜻이다. */
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

/**
 * 층마다의 자리. **먼저 한 번에 셈하고 그 다음에 그린다** — 그리면서 이웃의 지금
 * 좌표를 읽으면 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).
 */
type Geom = {
  n: number;
  plankW: number;
  /** 층의 세로 자리. */
  rowY: number[];
  /** 계단참의 왼쪽 끝. */
  xOf: number[];
  /** 떨어지는 자리 — 계단참 오른쪽 끝 언저리. */
  departCx: number[];
  /** 내려앉는 자리. 윗 계단참의 떠나는 자리와 같은 세로선이다. */
  landCx: number[];
};

function geomOf(rungs: readonly LatencyRung[]): Geom {
  const n = rungs.length;
  // 계단이 오른쪽으로 어긋나 쌓이므로 층이 늘수록 한 계단참이 좁아진다.
  const spread = 1 + Math.max(0, n - 1) * 0.5;
  const plankW = Math.min(PLANK_MAX_W, Math.floor((W - ORIGIN_X - PAD_R - TAG_W) / spread));
  const stepDx = Math.round(plankW / 2);
  // 자는 층 목록 **전체**에서 잡는다. 드러난 층만으로 잡으면 앞 계단참이 움직인다.
  const maxCycles = rungs.reduce((a, r) => Math.max(a, r.cycles), 1);

  const rowY: number[] = [];
  const xOf: number[] = [];
  const departCx: number[] = [];
  const landCx: number[] = [];
  for (let i = 0; i < n; i += 1) {
    rowY.push(DATUM_Y + (rungs[i].cycles / maxCycles) * (FLOOR_Y - DATUM_Y));
    const x = ORIGIN_X + i * stepDx;
    xOf.push(x);
    departCx.push(x + plankW - DEPART_PAD);
    landCx.push(x + plankW - DEPART_PAD - stepDx);
  }
  return { n, plankW, rowY, xOf, departCx, landCx };
}

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  /** 계단참 + 층 이름을 묶은 층. 자리 번호가 곧 층의 깊이다. */
  rows: SVGGElement[];
  /** 닿은 층의 수치 기둥. 자리 번호는 층과 같고 아직 안 닿은 층은 없다. */
  tags: SVGGElement[];
  /** 그어진 낙하 자취. 자취 `i` 는 층 `i` 에서 `i + 1` 로 떨어진 자국이다. */
  trails: SVGLineElement[];
  /** 값을 찾아 내려가는 말. 아직 묻지 않았으면 없다. */
  marker: SVGRectElement | null;
  /** 총배수 자. 아직 재지 않았으면 없다. */
  spanLine: SVGLineElement | null;
};

export const latencyLadderStageView: CanvasView = {
  canvas: { height: H },

  // 러너가 캔버스를 컨테이너에 먼저 붙이고 mount 를 부른다. 이 그림은 캔버스
  // 안쪽에만 그리므로 컨테이너를 건드리지 않는다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<LatencyLadderScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다. 재건 밖에
    //    남는 요소가 없으므로 정적 경로가 못 덮는 속성도 없다 (프로토콜 4 절).
    const gBase = el('g');
    const gTrail = el('g');
    const gRow = el('g');
    const gTag = el('g');
    const gSpan = el('g');
    const gMarker = el('g');
    const gCaption = el('g');
    const layers = [gBase, gTrail, gRow, gTag, gSpan, gMarker, gCaption];
    for (const g of layers) svg.appendChild(g);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 한 걸음이 마디 둘(걷기 · 낙하)을 잇달아 지난다. 가운데에 `destroy` 가
     * 끼어들면 남은 프레임이 이미 떨어져 나간 화면에 쓰므로, 마디마다 자기 번호가
     * 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면
     * 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 걸음마다의 운동. 걸음 안에서 시작하고 끝난다 — 벽시계로 도는 상시 루프가
     * 아니므로 되짚기가 흔들리지 않는다 (프로토콜 4 절의 상시 rAF 금지와 다른 자리).
     */
    function tween(ms: number, mine: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        if (!alive(mine)) {
          finish();
          return;
        }
        waiters.add(finish);
        const started = Date.now();
        const step = (): void => {
          // 접혔거나 세대가 바뀌었으면 그 자리에서 손을 뗀다. 끝 상태로 밀면 방금
          // 세운 화면을 다시 흐트러뜨린다. 기다리던 약속은 반드시 푼다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          apply(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            step();
          });
          frames.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 프레임을 기다리면 그 사이에 끝 자리가 번쩍인다.
        step();
      });
    }

    function textNode(
      x: number,
      y: number,
      size: string,
      fill: string,
      family: string,
    ): SVGTextElement {
      const node = el('text', { x, y, fill });
      node.style.fontFamily = family;
      node.style.fontSize = size;
      return node;
    }

    function levelName(id: string): string {
      switch (id) {
        case 'l1':
          return t('label.l1', 'L1 cache');
        case 'l2':
          return t('label.l2', 'L2 cache');
        case 'l3':
          return t('label.l3', 'L3 cache');
        default:
          return t('label.dram', 'Main memory (DRAM)');
      }
    }

    /** 채움이 말하는 축 — 층의 형편. 표식은 테두리가 따로 맡는다. */
    function fillOf(state: LatencyRungState): string {
      switch (state) {
        case 'idle':
          return colors.border;
        case 'probing':
          return colors.itemActive;
        case 'missed':
          return colors.textMuted;
        case 'found':
          return colors.accent;
      }
    }

    function placeMarker(marker: SVGRectElement, cx: number, lineY: number): void {
      marker.setAttribute('x', String(cx - MARKER / 2));
      // 말은 계단참 위에 올라선다.
      marker.setAttribute('y', String(lineY - MARKER));
    }

    function captionText(scene: LatencyLadderScene): string {
      const caption = captionFor(scene);
      if (caption === null) return '';
      switch (caption.kind) {
        case 'ask':
          return t('caption.ask', 'The core asks the nearest floor first: {level}', {
            level: levelName(caption.level),
          });
        case 'miss':
          return t('caption.miss', 'Not there. One floor further down: {level}', {
            level: levelName(caption.level),
          });
        case 'hit':
          return t('caption.hit', 'Found here. Cycles spent: {cycles}', {
            cycles: caption.cycles,
          });
        case 'span':
          return t('caption.span', 'Same lookup, top floor to bottom: ×{factor}', {
            factor: caption.factor,
          });
      }
    }

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of layers) g.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: LatencyLadderScene): Drawn {
      rewind();

      const geom = geomOf(scene.rungs);
      const drawn: Drawn = {
        geom,
        rows: [],
        tags: [],
        trails: [],
        marker: null,
        spanLine: null,
      };
      // 캡션은 층이 없어도 비워 세운다 — 재건 밖에 남는 글자가 없게.
      const caption = textNode(CAPTION_X, CAPTION_Y, fontSizes.sm, colors.textMuted, fonts.body);
      caption.textContent = captionText(scene);
      gCaption.appendChild(caption);
      if (geom.n === 0) return drawn;

      // ── 기준선. 0 사이클의 자리이므로 코어 그 자체다.
      gBase.appendChild(
        el('line', {
          x1: ORIGIN_X,
          y1: DATUM_Y,
          x2: ORIGIN_X + geom.plankW,
          y2: DATUM_Y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      // 도형에 새긴 글자는 표식이다 — 키를 만들지 않는다 (C10).
      const core = textNode(ORIGIN_X, DATUM_Y - 6, fontSizes.xs, colors.textMuted, fonts.mono);
      core.textContent = 'CPU';
      gBase.appendChild(core);

      // ── 낙하 자취. 떨어진 만큼만 짓는다 — 아직 없는 것은 숨기지 않고 짓지 않는다.
      const trails = trailCount(scene);
      for (let i = 0; i < trails; i += 1) {
        const line = el('line', {
          x1: geom.departCx[i],
          y1: geom.rowY[i],
          x2: geom.departCx[i],
          y2: geom.rowY[i + 1],
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        });
        gTrail.appendChild(line);
        drawn.trails.push(line);
      }

      // ── 계단참. 채움이 형편을, 테두리가 "지금 짚는 층" 을 말한다.
      const shown = shownCount(scene);
      for (let i = 0; i < shown; i += 1) {
        const state = stateOf(scene, i);
        const probing = i === scene.reached;
        const y = geom.rowY[i];
        const h = state === 'found' ? PLANK_H_FOUND : PLANK_H;
        const row = el('g');
        const plank = el('rect', {
          x: geom.xOf[i],
          y: y - h / 2,
          width: geom.plankW,
          height: h,
          rx: h / 2,
          fill: fillOf(state),
        });
        if (probing) {
          plank.setAttribute('stroke', colors.primary);
          plank.setAttribute('stroke-width', '1');
        }
        row.appendChild(plank);
        const stamp = textNode(
          geom.xOf[i] + 6,
          y + 12,
          fontSizes.xs,
          probing ? colors.text : colors.textMuted,
          fonts.mono,
        );
        stamp.textContent = scene.rungs[i].id.toUpperCase();
        row.appendChild(stamp);
        gRow.appendChild(row);
        drawn.rows.push(row);
      }

      // ── 수치 기둥. 닿은 층마다 쌓여 남는다 — 층별 배수가 고르지 않다는 것이
      //    다 끝난 화면에서 읽히는 자리다.
      for (let i = 0; i <= scene.reached && i < geom.n; i += 1) {
        const rung = scene.rungs[i];
        const y = geom.rowY[i];
        const tagX = geom.xOf[i] + geom.plankW + TAG_GAP;
        const tag = el('g');
        const mult = textNode(
          tagX,
          y - 4 - TAG_PITCH * 2,
          fontSizes.xs,
          colors.textMuted,
          fonts.mono,
        );
        // 배수 표기는 수식이라 표식이다 — 키를 만들지 않는다 (C10).
        mult.textContent = rung.factor === null ? '' : `×${rung.factor}`;
        const cycles = textNode(tagX, y - 4 - TAG_PITCH, fontSizes.xs, colors.text, fonts.mono);
        cycles.textContent = t('label.cycles', '{n} cycles', { n: rung.cycles });
        const nanos = textNode(tagX, y - 4, fontSizes.xs, colors.textMuted, fonts.mono);
        nanos.textContent = t('label.ns', '≈{n} ns', { n: rung.ns });
        tag.appendChild(mult);
        tag.appendChild(cycles);
        tag.appendChild(nanos);
        gTag.appendChild(tag);
        drawn.tags.push(tag);
      }

      // ── 총배수 기둥. 첫 계단참에서 마지막 계단참까지를 한 자로 잰다.
      const factor = spanFactorOf(scene);
      if (scene.spanned && factor !== null) {
        const top = geom.rowY[0];
        const bottom = geom.rowY[geom.n - 1];
        const line = el('line', {
          x1: GUTTER_X,
          y1: top,
          x2: GUTTER_X,
          y2: bottom,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        gSpan.appendChild(line);
        for (const capY of [top, bottom]) {
          gSpan.appendChild(
            el('line', {
              x1: GUTTER_X,
              y1: capY,
              x2: GUTTER_X + GUTTER_CAP,
              y2: capY,
              stroke: colors.text,
              'stroke-width': 1.5,
            }),
          );
        }
        gSpan.appendChild(
          el('line', {
            x1: GUTTER_X + GUTTER_CAP,
            y1: bottom,
            x2: geom.xOf[geom.n - 1],
            y2: bottom,
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 4',
          }),
        );
        // `×50` 은 수식 표기이므로 표식이다 — 키를 만들지 않는다 (C10).
        const label = textNode(
          GUTTER_X + GUTTER_CAP + 6,
          (top + bottom) / 2 + 4,
          fontSizes.md,
          colors.text,
          fonts.mono,
        );
        label.textContent = `×${factor}`;
        gSpan.appendChild(label);
        drawn.spanLine = line;
      }

      // ── 값을 찾아 내려가는 말. 묻기 전에는 짓지 않는다.
      if (scene.reached >= 0 && scene.reached < geom.n) {
        const marker = el('rect', {
          width: MARKER,
          height: MARKER,
          rx: MARKER_R,
          fill: colors.primary,
        });
        placeMarker(marker, geom.landCx[scene.reached], geom.rowY[scene.reached]);
        gMarker.appendChild(marker);
        drawn.marker = marker;
      }

      return drawn;
    }

    // ── 걸음마다의 운동 ───────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 운동은 **아직 못 온 만큼을
    // 뒤로 물리는** 꼴이다. 물리는 일은 프레임을 기다리지 않고 곧바로 한다.

    /** 말이 나타나 코어에서 첫 계단참으로 떨어진다. */
    async function flowAsk(drawn: Drawn, mine: number): Promise<void> {
      const marker = drawn.marker;
      if (marker === null) return;
      const { geom } = drawn;
      placeMarker(marker, geom.landCx[0], DATUM_Y);
      marker.setAttribute('opacity', '0');
      await tween(APPEAR_MS, mine, (p) => marker.setAttribute('opacity', String(p)));
      if (!alive(mine)) return;
      // 코어에서 첫 계단참까지도 거리가 있다 — 네 사이클만큼.
      const ms = Math.max(FALL_MIN_MS, (geom.rowY[0] - DATUM_Y) / FALL_PX_PER_MS);
      await tween(ms, mine, (p) => placeMarker(marker, geom.landCx[0], lerp(DATUM_Y, geom.rowY[0], p)));
    }

    /**
     * 계단참 끝까지 걸어가 아래 층으로 떨어진다.
     *
     * 출발 자리는 **한 층 위**다. `prev` 에서 꺼내지 않는다 — 내려온 층이
     * `scene.reached` 이므로 그 앞 층이 곧 출발이다 (S-scene).
     */
    async function flowDescend(
      scene: LatencyLadderScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const marker = drawn.marker;
      const to = scene.reached;
      const from = to - 1;
      if (marker === null || from < 0) return;
      const { geom } = drawn;
      const trail = drawn.trails[from];
      const row = drawn.rows[to];
      const tag = drawn.tags[to];

      // 아직 안 온 만큼을 뒤로 물린다.
      placeMarker(marker, geom.landCx[from], geom.rowY[from]);
      trail?.setAttribute('y2', String(geom.rowY[from]));
      row?.setAttribute('opacity', String(REVEAL_FROM));
      tag?.setAttribute('opacity', '0');

      // 이 가로 이동은 주장이 아니라 이동이라 무르게 한다.
      await tween(WALK_MS, mine, (p) =>
        placeMarker(marker, lerp(geom.landCx[from], geom.departCx[from], easeInOut(p)), geom.rowY[from]),
      );
      if (!alive(mine)) return;

      // 등속이므로 걸린 시간이 곧 내려온 거리다. 떨어지는 동안 아래 계단참이
      // 다가오듯 드러나고, 수치는 다 내려온 뒤에야 떠오른다.
      const ms = Math.max(FALL_MIN_MS, (geom.rowY[to] - geom.rowY[from]) / FALL_PX_PER_MS);
      await tween(ms, mine, (p) => {
        const y = lerp(geom.rowY[from], geom.rowY[to], p);
        placeMarker(marker, geom.departCx[from], y);
        trail?.setAttribute('y2', String(y));
        row?.setAttribute('opacity', String(REVEAL_FROM + (1 - REVEAL_FROM) * p));
        tag?.setAttribute('opacity', String(Math.max(0, p * 2 - 1)));
      });
    }

    /** 찾았다. 그 자리에서 튀어오른다 — 더 내려갈 데가 없다는 것이 이 걸음의 말이다. */
    async function flowFound(
      scene: LatencyLadderScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const marker = drawn.marker;
      if (marker === null) return;
      const { geom } = drawn;
      const cx = geom.landCx[scene.reached];
      const y = geom.rowY[scene.reached];
      await tween(BOUNCE_MS, mine, (p) => {
        placeMarker(marker, cx, y - Math.abs(Math.sin(p * Math.PI * 2)) * BOUNCE_H);
      });
    }

    /** 총배수 자가 첫 층에서 마지막 층까지 그어진다. */
    async function flowSpan(drawn: Drawn, mine: number): Promise<void> {
      const line = drawn.spanLine;
      if (line === null) return;
      const { geom } = drawn;
      const top = geom.rowY[0];
      const bottom = geom.rowY[geom.n - 1];
      line.setAttribute('y2', String(top));
      await tween(SPAN_MS, mine, (p) => {
        line.setAttribute('y2', String(lerp(top, bottom, easeInOut(p))));
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: LatencyLadderScene,
      _prev: LatencyLadderScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 프레임도 타이머도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'ask':
          await flowAsk(drawn, mine);
          break;
        case 'descend':
          await flowDescend(next, drawn, mine);
          break;
        case 'found':
          await flowFound(next, drawn, mine);
          break;
        case 'span':
          await flowSpan(drawn, mine);
          break;
      }
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
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 걸어 둔 것을 거둔 다음 기다리던 것을 깨운다. 취소된 프레임은 아예 불리지
        // 않으므로 여기서 풀지 않으면 `render` 의 await 가 영영 안 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const g of layers) g.remove();
      },
    };
  },
};
