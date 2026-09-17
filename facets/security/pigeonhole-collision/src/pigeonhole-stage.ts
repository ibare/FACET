/**
 * pigeonhole-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드(`revealSlots()` · `fillSlots()` · `placeOverflow()` …) 를
 * 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는 것을 전부 세우므로,
 * 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * 이 조각의 동사는 **들어간다 · 겹친다** 이므로 입력이 실제로 자리로 내려가야 한다
 * (S-piece). 자리에 글자가 나타나기만 하면 "들어간다" 가 "생긴다" 가 되고, 마지막
 * 입력이 남의 자리에 앉는 장면 — 이 조각의 전부 — 이 사라진다.
 *
 * 화면 구성 (위에서 아래로):
 *   - 캡션 한 줄 — 지금 화면에서 무슨 일이 일어나는지만 말한다
 *   - 대기 중인 입력 칩들. 마지막 하나는 자리 수보다 하나 많은 그 입력이다
 *   - 자리 N 칸. 입력이 들어가면 칸 안에 그 문자열이 앉는다
 *
 * 자리를 실제로 다 채운 다음에 하나를 더 넣는 순서가 곧 논증이다. 채우기를
 * 건너뛰고 충돌만 보이면 "겹칠 수도 있다" 가 되지, "겹칠 수밖에 없다" 가 되지 않는다.
 *
 * ── 이행이 고친 화면
 *
 * **한 축에 두 뜻이 실려 있었다.** 칩의 채움이 *자리에 들어갔나*(옅은 칠 → 짙은 칠)
 * 와 *이것이 자리보다 하나 많은 그 입력인가*(강조색)를 한꺼번에 말하는 바람에,
 * 넘치는 칩은 남의 자리에 앉은 뒤에도 다른 칩들과 같은 "들어갔다" 칠을 얻지
 * 못했다. 마지막 화면에서 그 칩만 색이 다른데 그것이 *아직 안 들어가서*인지
 * *넘치는 것이라서*인지 화면이 가르지 않았다 (프로토콜 4 절 · 함정 29).
 *
 * 어휘를 갈라 둘이 부딪히지 않게 한다.
 *
 * - **채움(fill) = 값의 형편** — 칩은 *자리에 들어갔나*, 자리는 *찼나*.
 * - **테두리(stroke) = 표식** — 칩은 *자리보다 하나 많은 그 입력이다*, 자리는
 *   *여기 둘이 앉았다*. 자리 쪽은 옛 화면도 이미 이 갈래였다.
 *
 * 그래서 완주 화면에서 마지막 칩은 *다른 칩들과 같은 채움*(들어갔다) 위에 *강조
 * 테두리*(하나 많은 그것)를 두르고, 6 번 자리는 *찬 칠* 위에 *강조 테두리*(둘이
 * 앉았다)를 두른 채 두 이름을 함께 싣는다 — 이 조각이 말하려는 것이 전부 마지막
 * 화면에 서 있다 (함정 7).
 *
 * **자리에 앉은 이름을 화면이 도로 읽어 덧붙이던 자리도 없어졌다.**
 * `occupant.textContent = \`${occupant.textContent} ${input}\`\` 는 같은 걸음을 두 번
 * 그리면 `aa ag ag` 가 된다. 이제 자리마다 **앉은 이름의 열**을 장면이 말한다.
 *
 * **아무도 값을 넣지 않던 요소 셋을 걷어냈다** — 상시 캡션 한 줄과 각주 두 줄이다.
 * projector 에 `setBaseCaption` · `setNote` 가 있었으나 부르는 곳이 없어 늘 빈
 * 글자였고, 애초에 S-piece 가 둘 다 MUST NOT 으로 막는다 (전제는 글이 밝힌다).
 * 캔버스 세로가 그만큼 줄었다.
 *
 * ── CSS transition 을 쓰지 않는다
 *
 * 옛 stage 는 다섯 자리에서 `style.transition` 을 걸고 다음 틱에 값을 바꾸는
 * 짜임이었다. 되짚기는 `animate:false` 로 오는데 transition 은 그 뒤에도 화면을 저
 * 혼자 흘러가게 하므로 흔들림 축을 구조적으로 통과할 수 없다 (S-scene MUST NOT).
 * 전부 `tween` 보간으로 옮겼다. 벽시계는 `setTimeout` 으로 재고 rAF 를 쓰지
 * 않는다 — 걸음이 프레임 없는 자리에서도 돌아야 하기 때문이다.
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 준다. 자리와 칩의 가로 자리는 그 폭에서 매번 역산한다 —
 * 장면이 담는 것은 픽셀이 아니라 구조다 (S-piece).
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도
 * 함께 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안
 * 돌아온다 (S-piece).
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 찬 자리 / 들어간 입력 — palette.textMuted
 *   - 빈 자리 / 아직 안 들어간 입력 — palette.bgSubtle
 *   - 표식 테두리 — palette.accent (사건 강조)
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionOf,
  chipsOf,
  occupantsOf,
  slotCount,
  type PigeonholeCaption,
  type PigeonholeScene,
  type PigeonholeStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 내용이 정하는 값이라 그림 곁에 둔다 (S-view). */
const H = 164;

// ── 입력 칩 ─────────────────────────────────────────────────────────────
const CHIP_W = 28;
const CHIP_H = 18;
const CHIP_GAP = 3;
const CHIP_Y = 42;

// ── 자리 ────────────────────────────────────────────────────────────────
const SLOT_W = 32;
const SLOT_H = 30;
const SLOT_GAP = 3;
const SLOT_Y = 106;

const CAPTION_Y = 16;
const ARROW_Y = 86;
const SLOT_LABEL_Y = SLOT_Y + SLOT_H + 12;

/** 칩 글자가 자리 안에 앉을 때의 세로 어긋남. */
const DROP_DY = SLOT_Y - CHIP_Y + 5;

/** 둘 이상이 한 자리에 앉았을 때의 글자 크기. 두 이름이 칸 안에 들어가야 한다. */
const CROWD_SIZE = '9px';

// ── 운동 ────────────────────────────────────────────────────────────────
/** 보간 한 프레임의 간격 (ms). rAF 가 아니라 벽시계로 잰다. */
const FRAME_MS = 16;
/** 빈 자리와 대기열이 함께 떠오르는 시간. 옛 전환 둘(220 · 200)을 한 시계로 묶었다. */
const REVEAL_MS = 260;
/** 자리를 하나씩 채우는 간격. 채우는 동안 수가 세어지는 느낌을 준다. */
const FILL_STEP_MS = 55;
/** 칩 하나가 자리까지 내려가는 시간. */
const DROP_MS = 340;
/** 내려앉은 뒤 칠이 물드는 시간. 옛 `fill` 전환 자리다. */
const SETTLE_MS = 180;
/** 하나 많은 그 입력이 대기열 끝에 내려앉는 시간. */
const EXTRA_MS = 240;
/** 그 입력이 내려앉기 전에 떠 있는 높이. */
const EXTRA_RISE = 14;

/** 정규식을 인라인으로 쓰지 않는다 (원칙 4). */
const HEX_COLOR = /^#([0-9a-f]{6})$/i;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 보간값을 속성 문자열로. 부동소수 끝자리가 화면을 가르지 않게 자른다 (함정 6). */
const fmt = (v: number): string => String(Math.round(v * 1000) / 1000);

const easeInOut = (p: number): number =>
  p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;

const easeOut = (p: number): number => 1 - (1 - p) ** 2;

function channels(color: string): [number, number, number] | null {
  const m = HEX_COLOR.exec(color);
  if (m === null) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 두 색 사이. 끝에서는 **목표색을 그대로** 돌려준다 (함정 6).
 *
 * 토큰이 `#rrggbb` 가 아니면 보간하지 않고 반쯤에서 갈아 끼운다 — 색 문자열을
 * 지어내는 것보다 낫다.
 */
function mix(from: string, to: string, p: number): string {
  if (p <= 0) return from;
  if (p >= 1) return to;
  const a = channels(from);
  const b = channels(to);
  if (a === null || b === null) return p < 0.5 ? from : to;
  const at = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * p);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
}

/** 대기열과 자리의 가로 자리. 캔버스 폭에서 매번 역산한다 (S-piece). */
type Layout = {
  readonly chipX: (i: number) => number;
  readonly slotX: (i: number) => number;
};

function layoutOf(chipCount: number, slots: number): Layout {
  const chipPitch = CHIP_W + CHIP_GAP;
  const chipLeft = Math.round((W - (chipCount * chipPitch - CHIP_GAP)) / 2);
  const slotPitch = SLOT_W + SLOT_GAP;
  const slotLeft = Math.round((W - (slots * slotPitch - SLOT_GAP)) / 2);
  return {
    chipX: (i: number): number => chipLeft + i * chipPitch,
    slotX: (i: number): number => slotLeft + i * slotPitch,
  };
}

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type ChipNode = { g: SVGGElement; box: SVGRectElement; label: SVGTextElement };
type SlotNode = { box: SVGRectElement; occupant: SVGTextElement };
type Drawn = {
  readonly layout: Layout;
  /** 드러난 칩만. 열쇠는 대기열 전체에서의 자리다. */
  readonly chips: ReadonlyMap<number, ChipNode>;
  /** 칩 전체를 감싼 무리. 매번 새로 지어지므로 속성을 만져도 남지 않는다 (함정 18). */
  readonly chipsG: SVGGElement | null;
  readonly slots: readonly SlotNode[];
  /** 자리 전체를 감싼 무리. 위와 같다. */
  readonly slotsG: SVGGElement | null;
};

export const pigeonholeStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<PigeonholeScene> {
    const svg = params.canvas;
    const palette: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const FILLED = palette.textMuted;
    const EMPTY = palette.bgSubtle;
    const HOT = palette.accent;
    const INK = palette.text;
    const INVERSE = palette.textInverse;

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다. 층 자신의
    //    속성은 어디서도 고치지 않는다 — 재건 밖 요소를 만들지 않기 위해서다.
    const gCaption = el('g');
    const gChip = el('g');
    const gArrow = el('g');
    const gSlot = el('g');
    /** 내려가는 중인 복제본들. 운동 중에만 살고 정지 화면에는 없다. */
    const gDrop = el('g');
    for (const layer of [gCaption, gChip, gArrow, gSlot, gDrop]) svg.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 한 걸음이 여러 프레임을 지난다. `destroy` 가 그 가운데 오면 남은 프레임이
     * 이미 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고
     * 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). `resolve` 를 `waiters` 에
     * 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던 약속이 함께 풀린다 —
     * 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이 영영 안 풀린다 (S-piece).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
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
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
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
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 글자 ─────────────────────────────────────────────────────────────

    function text(
      x: number,
      y: number,
      opts: {
        anchor?: string;
        fill?: string;
        size?: string;
        family?: string;
        weight?: string;
      } = {},
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? INK,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        ...(opts.weight === undefined ? {} : { 'font-weight': opts.weight }),
      });
    }

    function captionText(caption: PigeonholeCaption | null): string {
      if (caption === null) return '';
      switch (caption.kind) {
        case 'filled':
          return t(
            'caption.filled',
            'Spread as evenly as possible — one per place — all {count} are taken.',
            { count: caption.count },
          );
        case 'oneMore':
          return t(
            'caption.oneMore',
            'One more input arrives — input {n} for {count} places.',
            { n: caption.n, count: caption.count },
          );
        case 'collide':
          return t(
            'caption.collide',
            'It has nowhere of its own — {overflow} sits where {occupant} already is.',
            { overflow: caption.overflow, occupant: caption.occupant },
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────
    //
    // 어느 걸음에서 오든 이 함수 하나가 화면 전체를 세운다. **`step` 을 읽지
    // 않는다** — 읽으면 흘려 세운 화면과 곧바로 세운 화면이 갈릴 수 있는데 두
    // 경로가 같은 `step` 을 보므로 검사가 그것을 못 잡는다.

    /** 내려가는 복제본 하나. 운동 중에만 산다. */
    function makeGhost(label: string, x: number, extra: boolean): SVGGElement {
      const g = el('g');
      const box = el('rect', {
        x,
        y: CHIP_Y,
        width: CHIP_W,
        height: CHIP_H,
        rx: 3,
        fill: FILLED,
        ...(extra ? { stroke: HOT, 'stroke-width': 1.5 } : {}),
      });
      const glyph = el('text', {
        x: x + CHIP_W / 2,
        y: CHIP_Y + 13,
        'text-anchor': 'middle',
        fill: INVERSE,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      glyph.textContent = label;
      g.append(box, glyph);
      return g;
    }

    function drawStatic(scene: PigeonholeScene): Drawn {
      for (const layer of [gCaption, gChip, gArrow, gSlot, gDrop]) layer.textContent = '';

      const chips = chipsOf(scene);
      const slots = slotCount(scene);
      const layout = layoutOf(chips.length, slots);

      // 캡션 — 지금 화면에서 무슨 일이 일어나는지만 말한다 (S-piece).
      const caption = text(W / 2, CAPTION_Y, { fill: HOT, weight: '600' });
      caption.textContent = captionText(captionOf(scene));
      gCaption.appendChild(caption);

      // 대기열. 아직 안 드러난 칩은 **숨기지 말고 짓지 않는다** (함정 17).
      const chipNodes = new Map<number, ChipNode>();
      let chipsG: SVGGElement | null = null;
      if (chips.some((chip) => chip.shown)) {
        chipsG = el('g');
        chips.forEach((chip, i) => {
          if (!chip.shown) return;
          const g = el('g');
          const box = el('rect', {
            x: layout.chipX(i),
            y: CHIP_Y,
            width: CHIP_W,
            height: CHIP_H,
            rx: 3,
            // 채움은 값의 형편 — 자리에 들어갔나.
            fill: chip.seated ? FILLED : EMPTY,
            // 테두리는 표식 — 자리보다 하나 많은 그 입력인가.
            ...(chip.extra ? { stroke: HOT, 'stroke-width': 1.5 } : {}),
          });
          const label = text(layout.chipX(i) + CHIP_W / 2, CHIP_Y + 13, {
            family: fonts.mono,
            size: fontSizes.xs,
            fill: chip.seated ? INVERSE : INK,
          });
          label.textContent = chip.input;
          g.append(box, label);
          chipsG?.appendChild(g);
          chipNodes.set(i, { g, box, label });
        });
        gChip.appendChild(chipsG);
      }

      // 자리. 아직 안 세웠으면 짓지 않는다.
      const slotNodes: SlotNode[] = [];
      let slotsG: SVGGElement | null = null;
      if (scene.slotsShown && slots > 0) {
        const arrow = text(W / 2, ARROW_Y, {
          fill: palette.textMuted,
          size: fontSizes.xs,
        });
        arrow.textContent = t('label.places', '{count} places', { count: slots });
        gArrow.appendChild(arrow);

        const seats = occupantsOf(scene);
        slotsG = el('g');
        for (let i = 0; i < slots; i += 1) {
          const names = seats[i] ?? [];
          const box = el('rect', {
            x: layout.slotX(i),
            y: SLOT_Y,
            width: SLOT_W,
            height: SLOT_H,
            rx: 3,
            // 채움은 값의 형편 — 이 자리가 찼나.
            fill: names.length > 0 ? FILLED : EMPTY,
            // 테두리는 표식 — 여기 둘이 앉았나.
            ...(names.length > 1 ? { stroke: HOT, 'stroke-width': 1.5 } : {}),
          });
          const occupant = text(layout.slotX(i) + SLOT_W / 2, SLOT_Y + 20, {
            family: fonts.mono,
            size: names.length > 1 ? CROWD_SIZE : fontSizes.xs,
            fill: INVERSE,
          });
          occupant.textContent = names.join(' ');
          const label = text(layout.slotX(i) + SLOT_W / 2, SLOT_LABEL_Y, {
            family: fonts.mono,
            size: fontSizes.xs,
            fill: palette.textMuted,
          });
          label.textContent = String(i);
          slotsG.append(box, occupant, label);
          slotNodes.push({ box, occupant });
        }
        gSlot.appendChild(slotsG);
      }

      return { layout, chips: chipNodes, chipsG, slots: slotNodes, slotsG };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리를 세워 두었으므로, 운동은 **아직 못 온 만큼을
    // 뒤로 물리는** 꼴이다. 출발 그림은 전부 장면과 상수에서 셈한다 — `prev` 를
    // 들추지 않는다 (S-scene).

    /** 빈 자리와 대기열이 함께 떠오른다. 한 뜻의 운동이라 시계도 하나다 (함정 3). */
    function flowSlots(drawn: Drawn, mine: number): Promise<void> {
      return tween(REVEAL_MS, mine, (p) => {
        const e = easeOut(p);
        drawn.slotsG?.setAttribute('opacity', fmt(e));
        drawn.chipsG?.setAttribute('opacity', fmt(e));
      });
    }

    /**
     * 입력들이 하나씩 자리로 내려가 자리를 다 채운다.
     *
     * 열여섯 복제본이 순차로 떨어지는 것이 **한 뜻의 운동**이므로 시계를 나누지
     * 않는다. 각자의 출발 시각만 어긋나게 둔다 (함정 3).
     */
    async function flowFill(
      scene: PigeonholeScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const fillers = scene.fillers;
      if (fillers.length === 0) return;
      const total = (fillers.length - 1) * FILL_STEP_MS + DROP_MS + SETTLE_MS;

      const falling = fillers.map((seat, i) => {
        const g = makeGhost(seat.input, drawn.layout.chipX(i), false);
        gDrop.appendChild(g);
        return {
          g,
          dx: drawn.layout.slotX(seat.slot) + (SLOT_W - CHIP_W) / 2 - drawn.layout.chipX(i),
          delay: i * FILL_STEP_MS,
          slot: seat.slot,
          chip: i,
        };
      });

      await tween(total, mine, (p) => {
        const ms = p * total;
        for (const drop of falling) {
          const e = clamp01((ms - drop.delay) / DROP_MS);
          const settle = clamp01((ms - drop.delay - DROP_MS) / SETTLE_MS);
          const moved = easeInOut(e);
          drop.g.setAttribute('opacity', e > 0 && e < 1 ? '1' : '0');
          drop.g.setAttribute(
            'transform',
            `translate(${fmt(drop.dx * moved)} ${fmt(DROP_DY * moved)})`,
          );
          const slot = drawn.slots[drop.slot];
          if (slot !== undefined) {
            slot.box.setAttribute('fill', mix(EMPTY, FILLED, settle));
            slot.occupant.setAttribute('opacity', fmt(settle));
          }
          const chip = drawn.chips.get(drop.chip);
          if (chip !== undefined) {
            chip.box.setAttribute('fill', mix(EMPTY, FILLED, settle));
            chip.label.setAttribute('fill', mix(INK, INVERSE, settle));
          }
        }
      });

      gDrop.textContent = '';
    }

    /** 하나 많은 그 입력이 대기열 끝에 내려앉는다. 오는 것이지 생기는 것이 아니다. */
    function flowExtra(scene: PigeonholeScene, drawn: Drawn, mine: number): Promise<void> {
      const last = chipsOf(scene).length - 1;
      const chip = drawn.chips.get(last);
      if (chip === undefined) return Promise.resolve();
      return tween(EXTRA_MS, mine, (p) => {
        const e = easeOut(p);
        chip.g.setAttribute('opacity', fmt(e));
        chip.g.setAttribute('transform', `translate(0 ${fmt(-EXTRA_RISE * (1 - e))})`);
      });
    }

    /**
     * 갈 곳이 없다 — 다른 것들과 똑같이 내려가는데 이미 누가 앉은 자리다.
     *
     * 내려앉기 전의 글자(이미 앉아 있던 이름들)는 **지금 장면의 자리 열에서 마지막
     * 하나를 뺀 것**이다. 앞 장면을 들추지 않는다 (S-scene).
     */
    async function flowCollide(
      scene: PigeonholeScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const over = scene.overflow;
      if (over === null) return;
      const last = chipsOf(scene).length - 1;
      const slot = drawn.slots[over.slot];
      const chip = drawn.chips.get(last);
      const seats = occupantsOf(scene)[over.slot] ?? [];
      const before = seats.slice(0, Math.max(0, seats.length - 1));
      const beforeText = before.join(' ');
      const beforeSize = before.length > 1 ? CROWD_SIZE : fontSizes.xs;

      const from = drawn.layout.chipX(last);
      const ghost = makeGhost(over.input, from, true);
      gDrop.appendChild(ghost);
      const dx = drawn.layout.slotX(over.slot) + (SLOT_W - CHIP_W) / 2 - from;
      const total = DROP_MS + SETTLE_MS;

      await tween(total, mine, (p) => {
        const ms = p * total;
        const e = clamp01(ms / DROP_MS);
        const settle = clamp01((ms - DROP_MS) / SETTLE_MS);
        const moved = easeInOut(e);
        ghost.setAttribute('opacity', e < 1 ? '1' : '0');
        ghost.setAttribute(
          'transform',
          `translate(${fmt(dx * moved)} ${fmt(DROP_DY * moved)})`,
        );
        if (slot !== undefined) {
          // 겹침의 표식은 테두리다. 아직 안 닿았으면 투명하게 물려 둔다.
          slot.box.setAttribute('stroke-opacity', fmt(settle));
          if (settle >= 1) {
            slot.occupant.textContent = [...before, over.input].join(' ');
            slot.occupant.setAttribute('font-size', CROWD_SIZE);
          } else {
            slot.occupant.textContent = beforeText;
            slot.occupant.setAttribute('font-size', beforeSize);
          }
        }
        if (chip !== undefined) {
          chip.box.setAttribute('fill', mix(EMPTY, FILLED, settle));
          chip.label.setAttribute('fill', mix(INK, INVERSE, settle));
        }
      });

      gDrop.textContent = '';
    }

    function flowFor(
      step: PigeonholeStep,
      scene: PigeonholeScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'slots':
          return flowSlots(drawn, mine);
        case 'fill':
          return flowFill(scene, drawn, mine);
        case 'extra':
          return flowExtra(scene, drawn, mine);
        case 'collide':
          return flowCollide(scene, drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: PigeonholeScene,
      _prev: PigeonholeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, next, drawn, mine);
      if (!alive(mine)) return;

      // 운동이 남긴 속성과 보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id); // 걸어 둔 것을 먼저 거두고
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
