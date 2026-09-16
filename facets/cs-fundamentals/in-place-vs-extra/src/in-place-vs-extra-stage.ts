/**
 * 제자리 vs 자리 빌리기 stage — 장면 하나를 받아 그 화면을 통째로 세운다.
 *
 * ── 화면이 하려는 말
 *
 * 주인공은 **차지한 넓이**다. 그래서 자리(슬롯)와 값(타일)을 갈라 그린다 — 슬롯은
 * 알고리즘이 차지한 넓이고, 타일은 그 위를 옮겨 다니는 값이다. 값이 아무리
 * 부산하게 움직여도 슬롯이 늘지 않으면 넓이는 그대로다.
 *
 * 두 띠가 위아래로 같은 x 에서 시작한다. 원본 몫은 둘 다 같은 폭이고, 그 오른쪽
 * 빈 자리에서 빌린 넓이가 자란다. 위쪽은 첫 라운드에 한 칸을 얻고 그 뒤로 다시
 * 늘지 않으며, 아래쪽은 라운드마다 한 칸씩 붙는다. 각 띠 아래의 게이지가 그
 * 넓이를 다시 재고 칸 수를 적는다.
 *
 * 움직임은 전부 위치·폭의 변화다 (S-piece). 색은 값의 형편만 말한다.
 *
 * ── 장면을 그린다 (`render` 하나로 산다)
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render(next, prev, {animate})` 가 그
 * 장면의 화면을 **전량** 세우고, `animate` 일 때만 방금 달라진 것을 흐르게 한다
 * (S-scene). 되짚기는 `animate: false` 로 와서 정적 경로만 지나간다.
 *
 * **한 걸음에 두 띠가 함께 움직인다.** 그것이 이 조각의 주장 자체이므로 시계를
 * 둘로 나누지 않는다 — 라운드 하나가 `ROUND_MS` 짜리 시계 **하나**이고, 네 국면은
 * 그 안의 구간이다. 시계가 하나면 두 띠가 나란한 것이 우연이 아니게 되고,
 * `render` 의 Promise 가 양쪽이 다 선 뒤에 구조적으로 풀린다 (`void` 로 던질
 * Promise 자체가 생기지 않는다).
 *
 * `prev` 는 들추지 않는다. 출발 자리도 게이지의 출발값도 `step` 과 장면에서
 * 되셈된다 — 첫 라운드인가로 갈리는 것뿐이라 `step.at === 0` 이 말해 준다.
 *
 * ── 견준 것이 화면에 남는다
 *
 * 되돌리는 명령이 없다. 얻은 자리도, 옮겨 적힌 값도, 원본에서 나간 칸의 흐린
 * 칠도 다 끝난 화면에 그대로 서 있다 — "한쪽은 자리를 더 쓴다" 는 주장은 앞
 * 라운드의 자취가 남아 있어야 견줄 수 있다 (S-scene PREFER).
 *
 * ── 세로
 *
 * 마운트 뒤 바뀌지 않는다 (S-view). 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로
 * 칸 폭은 거기서 역산하고 상수로는 상한만 둔다 (S-piece).
 *
 * ── 뒷일
 *
 * 지연 발화를 막는 것은 **`opts.animate` 검사와 세대 빗장** 둘이다. `isInstant`
 * 와 `onScrubStart` 는 쓰지 않는다 — 러너는 장면 조각에서 그 둘을 부르지 않는다
 * (S-scene). 걸려 있는 애니메이션 Promise 는 `destroy` 에서 전부 결과를 낸다 —
 * 취소된 프레임은 아예 불리지 않으므로 남기면 `await ctx.emit` 이 영영 돌아오지
 * 않는다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
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

import {
  copiedValuesOf,
  extraCellsOf,
  isPlacedOf,
  takenFlagsOf,
  type InPlaceVsExtraLaneKey,
  type InPlaceVsExtraScene,
  type InPlaceVsExtraStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 가로: 두 띠 모두 원본 N 칸 + 빌릴 수 있는 최대 N 칸. 폭은 캔버스에서 역산하고
//    상수는 상한만 둔다 (S-piece).
const W = PIECE_CANVAS_W;
const SIDE_MIN = 26;
const GROUP_GAP = 30;
const CELL_MAX_W = 64;

// ── 세로: 마운트 뒤 바뀌지 않는다 (S-view).
const CELL_H = 44;
const GAUGE_H = 16;
const LANE_GAP = 110;
const TITLE_DY = 13;
const CELL_DY = 30;
const GAUGE_DY = 82;
const CAPTION_Y = 228;
const CANVAS_H = 242;

// ── 라운드 한 걸음 안의 네 국면. **시계는 하나**이고 이 넷은 그 안의 구간이다.
const SPACE_MS = 280;
const CARRY_MS = 300;
const SHIFT_MS = 280;
const DROP_MS = 300;
const ROUND_MS = SPACE_MS + CARRY_MS + SHIFT_MS + DROP_MS;
const T_CARRY = SPACE_MS;
const T_SHIFT = T_CARRY + CARRY_MS;
const T_DROP = T_SHIFT + SHIFT_MS;
/** 들어 올렸다 내려놓는 호의 높이. */
const LIFT_ARC = 26;

/** 값이 두 띠에 놓이는 걸음. 짚기만 하는 걸음이 되지 않게 얇은 운동을 얹는다. */
const PLACE_MS = 340;
const PLACE_RISE = 20;
/** 번호가 작은 칸부터 앉는다. */
const PLACE_LEAD = 0.12;

/** 다 끝난 뒤 두 넓이를 나란히 견주는 걸음. 이미 서 있는 것이라 부풀었다 돌아온다. */
const COMPARE_MS = 300;
const COMPARE_SWELL = 5;

/** 게이지 숫자를 막대 안에 넣을 수 있는 최소 폭. 좁으면 막대 오른쪽에 붙인다. */
const LABEL_INSIDE_MIN_W = 62;

/** 두 띠를 늘 같은 차례로 훑는다. 나란히 돈다는 것이 이 조각의 주장이다. */
const LANES: readonly InPlaceVsExtraLaneKey[] = ['inPlace', 'copy'];
const LANE_ROW: Record<InPlaceVsExtraLaneKey, 0 | 1> = { inPlace: 0, copy: 1 };

type Attrs = Record<string, string | number>;
type Pt = { x: number; y: number };

/** 값 타일 — 슬롯 위를 옮겨 다니는 것. 자리는 쥐지 않는다. */
type Chip = { g: SVGGElement; box: SVGRectElement; label: SVGTextElement };
type ChipState = 'idle' | 'active' | 'settled' | 'spent';

/** 게이지 한 벌. 막대와 숫자가 늘 같은 수에서 나오도록 함께 쥔다. */
type Gauge = { bar: SVGRectElement; label: SVGTextElement; top: number };

/** 캔버스에서 역산한 자리들. 장면의 구조가 정하므로 걸음마다 다시 셈한다. */
type Geo = { n: number; cellW: number; originX: number; borrowX: number };

/** 정적 그리기가 세운 것들. 운동은 여기서 손잡이를 얻는다. */
type Handles = {
  geo: Geo;
  /** 제자리 띠의 칸 타일. 차례가 곧 칸 번호다. */
  inPlaceChips: (Chip | null)[];
  /** 빌리는 띠의 원본 줄. */
  sourceChips: (Chip | null)[];
  /** 빌리는 띠의 빌린 줄. 차례가 곧 새로 연 칸의 번호다. */
  copiedChips: (Chip | null)[];
  /** 제자리 쪽이 값을 들고 있을 자리. 아직 얻지 않았으면 없다. */
  heldSlot: SVGRectElement | null;
  /** 빌리는 쪽이 새로 연 칸들. */
  outSlots: SVGRectElement[];
  gauges: Record<InPlaceVsExtraLaneKey, Gauge | null>;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

/** 한 시계 안의 구간을 0..1 로 편다. 구간 밖이면 양 끝에 붙는다. */
function phase(t: number, fromMs: number, toMs: number): number {
  return easeInOut(clamp01((t * ROUND_MS - fromMs) / (toMs - fromMs)));
}

/** 앞선 것이 먼저 출발하게 시계 하나를 늦춰 읽는다. */
function lead(t: number, delay: number): number {
  return easeInOut(clamp01((t - delay) / (1 - delay)));
}

function lerp(a: number, b: number, e: number): number {
  return a + (b - a) * e;
}

/** 들었다 놓는 호. `rise` 가 0 이면 곧은 선이다. */
function arc(from: Pt, to: Pt, e: number, rise = 0): Pt {
  return {
    x: lerp(from.x, to.x, e),
    y: lerp(from.y, to.y, e) - rise * Math.sin(Math.PI * e),
  };
}

/**
 * 칸 폭과 두 띠의 자리를 캔버스에서 역산한다.
 *
 * 좌표는 장면에 없다 — 값의 수라는 구조에서 나오는 것이라 여기서 셈한다 (S-piece).
 */
function geoOf(scene: InPlaceVsExtraScene): Geo {
  const n = scene.values.length;
  const slots = Math.max(1, n * 2);
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2 - GROUP_GAP) / slots));
  const originX = Math.round((W - (n * 2 * cellW + GROUP_GAP)) / 2);
  return { n, cellW, originX, borrowX: originX + n * cellW + GROUP_GAP };
}

function laneTop(lane: InPlaceVsExtraLaneKey): number {
  return LANE_ROW[lane] * LANE_GAP;
}

function slotX(geo: Geo, i: number): number {
  return geo.originX + i * geo.cellW;
}

function borrowSlotX(geo: Geo, k: number): number {
  return geo.borrowX + k * geo.cellW;
}

function cellCenter(geo: Geo, lane: InPlaceVsExtraLaneKey, i: number): Pt {
  return { x: slotX(geo, i) + geo.cellW / 2, y: laneTop(lane) + CELL_DY + CELL_H / 2 };
}

function borrowCenter(geo: Geo, lane: InPlaceVsExtraLaneKey, k: number): Pt {
  return { x: borrowSlotX(geo, k) + geo.cellW / 2, y: laneTop(lane) + CELL_DY + CELL_H / 2 };
}

export const inPlaceVsExtraStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<InPlaceVsExtraScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const rx = Number.parseFloat(radii.sm);

    const root = el('g');
    svg.appendChild(root);

    // ── 애니메이션 동력 ──────────────────────────────────────────────────
    let destroyed = false;
    const frames = new Set<number>();
    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await
     * ctx.emit` 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과 SVG 트리가
     * 통째로 붙들린다 (S-piece).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 요소를 매번 새로 만드므로 살아남은 옛 운동이 쥔 것은 이미
     * 떨어져 나간 노드다. 그래도 빗장을 둔다 — 깨어난 프레임이 헛일을 하는 것을
     * 여기서 끊고, 무엇이 유효한 세대인지가 코드에 적힌다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    const schedule = (fn: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(fn)
        : (setTimeout(fn, 16) as unknown as number);
    const unschedule = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };
    const nowMs = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    /**
     * 한 걸음을 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(
      duration: number,
      my: number,
      apply: (progress: number) => void,
    ): Promise<void> {
      const paint = (progress: number): void => {
        if (alive(my)) apply(progress);
      };
      paint(0);
      if (destroyed || duration <= 0) {
        paint(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const startedAt = nowMs();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const progress = Math.min(1, (nowMs() - startedAt) / duration);
          paint(progress);
          if (progress >= 1) {
            finish();
            return;
          }
          id = schedule(tick);
          frames.add(id);
        };
        id = schedule(tick);
        frames.add(id);
      });
    }

    // ── 그리기 ───────────────────────────────────────────────────────────

    const paintChip = (chip: Chip, state: ChipState): void => {
      const fill =
        state === 'active' ? c.itemActive : state === 'settled' ? c.itemSorted : c.itemDefault;
      const ink =
        state === 'active'
          ? c.stateInk
          : state === 'settled'
            ? c.textInverse
            : state === 'spent'
              ? c.textMuted
              : c.text;
      chip.box.setAttribute('fill', fill);
      chip.box.setAttribute('stroke', state === 'spent' ? c.border : c.text);
      chip.label.setAttribute('fill', ink);
    };

    const place = (chip: Chip, at: Pt): void => {
      chip.g.setAttribute('transform', `translate(${at.x} ${at.y})`);
    };

    const makeChip = (
      parent: SVGGElement,
      geo: Geo,
      value: number,
      at: Pt,
      state: ChipState,
    ): Chip => {
      const g = el('g');
      const box = el('rect', {
        x: -(geo.cellW - 12) / 2,
        y: -(CELL_H - 12) / 2,
        width: geo.cellW - 12,
        height: CELL_H - 12,
        rx,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xl,
        'font-weight': 600,
      });
      label.textContent = String(value);
      g.appendChild(box);
      g.appendChild(label);
      parent.appendChild(g);
      const chip: Chip = { g, box, label };
      place(chip, at);
      paintChip(chip, state);
      return chip;
    };

    /** 슬롯 하나 — 알고리즘이 차지한 자리. 값이 아니라 넓이를 뜻한다. */
    const makeSlot = (
      parent: SVGGElement,
      geo: Geo,
      x: number,
      y: number,
      borrowed: boolean,
    ): SVGRectElement => {
      const rect = el('rect', {
        x,
        y,
        width: geo.cellW,
        height: CELL_H,
        rx,
        fill: c.bgSubtle,
        stroke: borrowed ? c.accent : c.border,
        'stroke-width': borrowed ? 2 : 1,
      });
      parent.appendChild(rect);
      return rect;
    };

    /**
     * 게이지를 그 넓이로 세운다. 막대도 숫자도 **같은 `cells`** 에서 나온다.
     *
     * 이 조각이 재는 수가 화면에 둘 나란히 뜨므로, 그 둘이 한 함수를 지나지
     * 않으면 그림이 제 안에서 거짓이 될 자리가 생긴다.
     */
    const paintGauge = (gauge: Gauge, geo: Geo, cells: number): void => {
      const barW = Math.max(0, cells * geo.cellW);
      gauge.bar.setAttribute('width', String(barW));
      const inside = barW >= LABEL_INSIDE_MIN_W;
      gauge.label.setAttribute('x', String(geo.borrowX + barW + (inside ? -8 : 8)));
      gauge.label.setAttribute('text-anchor', inside ? 'end' : 'start');
      gauge.label.setAttribute('fill', inside ? c.stateInk : c.textMuted);
      gauge.label.textContent = t('label.extraCells', '{n} extra', { n: Math.round(cells) });
    };

    /** 캡션 문안. 수는 장면이 아니라 `extraCellsOf` 에서 온다 (C10). */
    const captionTextOf = (
      scene: InPlaceVsExtraScene,
      extra: Record<InPlaceVsExtraLaneKey, number>,
    ): string | null => {
      const caption = scene.caption;
      if (!caption) return null;
      switch (caption.kind) {
        case 'begin':
          return t(
            'caption.begin',
            'The same values, sorted two ways — one keeps to its own cells, the other copies them out.',
          );
        case 'claim':
          return t(
            'caption.claim',
            'Each side takes the room it needs: one slot to hold a value, one cell to write the first result.',
          );
        case 'reuseVsGrow':
          return t(
            'caption.reuseVsGrow',
            'The held slot is used again. Copying needs one more cell — {n} of them now.',
            { n: extra.copy },
          );
        case 'done':
          return t(
            'caption.done',
            'Same order, different room: {a} extra cell against {b} — one for every value.',
            { a: extra.inPlace, b: extra.copy },
          );
      }
    };

    /**
     * 장면이 말하는 것을 통째로 세운다. 되돌릴 명령이 없으므로 늘 비우고 시작한다.
     *
     * 자리를 먼저 한 번에 셈하고 그리므로 이웃의 "지금 좌표" 를 되읽지 않는다 —
     * 그리면서 재면 순회 순서가 곧 숨은 상태가 된다.
     */
    function drawStatic(scene: InPlaceVsExtraScene): Handles {
      root.textContent = '';
      const geo = geoOf(scene);
      const extra = extraCellsOf(scene);
      const handles: Handles = {
        geo,
        inPlaceChips: [],
        sourceChips: [],
        copiedChips: [],
        heldSlot: null,
        outSlots: [],
        gauges: { inPlace: null, copy: null },
      };
      if (geo.n === 0) return handles;

      const copied = copiedValuesOf(scene);
      const taken = takenFlagsOf(scene);

      for (const lane of LANES) {
        const top = laneTop(lane);
        const laneRoot = el('g');
        root.appendChild(laneRoot);

        const title = el('text', {
          x: geo.originX,
          y: top + TITLE_DY,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
        title.textContent =
          lane === 'inPlace'
            ? t('label.laneInPlace', 'sorting in place')
            : t('label.laneCopy', 'copying into new space');
        laneRoot.appendChild(title);

        // 자리 층이 값 층보다 아래에 깔린다 — 나중에 얻은 자리가 값을 가리면 안 된다.
        const slotLayer = el('g');
        const chipLayer = el('g');
        laneRoot.appendChild(slotLayer);
        laneRoot.appendChild(chipLayer);

        // 처음 받은 칸. 둘 다 같은 폭이고 끝까지 그대로다.
        for (let i = 0; i < geo.n; i++) {
          makeSlot(slotLayer, geo, slotX(geo, i), top + CELL_DY, false);
        }
        // 빌린 칸. **아직 얻지 않은 자리는 숨기지 않고 짓지 않는다.**
        for (let k = 0; k < extra[lane]; k++) {
          const slot = makeSlot(slotLayer, geo, borrowSlotX(geo, k), top + CELL_DY, true);
          if (lane === 'inPlace') handles.heldSlot = slot;
          else handles.outSlots.push(slot);
        }

        // 원본 몫의 넓이 — 처음 받은 만큼.
        laneRoot.appendChild(
          el('rect', {
            x: geo.originX,
            y: top + GAUGE_DY,
            width: geo.n * geo.cellW,
            height: GAUGE_H,
            rx,
            fill: c.border,
          }),
        );
        // 빌린 몫의 넓이 — 이 조각이 재는 것.
        const bar = el('rect', {
          x: geo.borrowX,
          y: top + GAUGE_DY,
          width: 0,
          height: GAUGE_H,
          rx,
          fill: c.accent,
        });
        laneRoot.appendChild(bar);
        const gaugeLabel = el('text', {
          x: geo.borrowX + 8,
          y: top + GAUGE_DY + 11,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 600,
          fill: c.textMuted,
        });
        laneRoot.appendChild(gaugeLabel);
        const gauge: Gauge = { bar, label: gaugeLabel, top: top + GAUGE_DY };
        handles.gauges[lane] = gauge;
        paintGauge(gauge, geo, extra[lane]);

        // 값 타일.
        if (lane === 'inPlace') {
          handles.inPlaceChips = scene.inPlace.map((v, i) =>
            makeChip(chipLayer, geo, v, cellCenter(geo, lane, i), scene.finished ? 'settled' : 'idle'),
          );
        } else {
          // 원본 줄 — 이미 옮겨진 칸은 흐리게 남는다. 무엇이 나갔나가 자취다.
          handles.sourceChips = isPlacedOf(scene)
            ? scene.values.map((v, i) =>
                makeChip(chipLayer, geo, v, cellCenter(geo, lane, i), taken[i] ? 'spent' : 'idle'),
              )
            : [];
          handles.copiedChips = copied.map((v, k) =>
            makeChip(
              chipLayer,
              geo,
              v,
              borrowCenter(geo, lane, k),
              scene.finished ? 'settled' : 'idle',
            ),
          );
        }
      }

      const text = captionTextOf(scene, extra);
      if (text !== null) {
        const caption = el('text', {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        caption.textContent = text;
        root.appendChild(caption);
      }

      return handles;
    }

    // ── 운동 ─────────────────────────────────────────────────────────────

    type Motion = { duration: number; apply: (t: number) => void };

    /**
     * 방금 달라진 것을 흐르게 한다. **두 띠가 한 시계를 쓴다.**
     *
     * 흐르게 할 것이 없으면 `null` — 그때는 정적 그림이 곧 그 걸음의 화면이다.
     */
    function motionFor(
      scene: InPlaceVsExtraScene,
      step: InPlaceVsExtraStep,
      h: Handles,
    ): Motion | null {
      const geo = h.geo;
      if (geo.n === 0) return null;

      switch (step.kind) {
        // 두 띠에 같은 값이 놓인다. 위아래가 같은 시계로 함께 앉는다.
        case 'place': {
          const seats: { chip: Chip; to: Pt; delay: number }[] = [];
          h.inPlaceChips.forEach((chip, i) => {
            if (chip) seats.push({ chip, to: cellCenter(geo, 'inPlace', i), delay: i * PLACE_LEAD });
          });
          h.sourceChips.forEach((chip, i) => {
            if (chip) seats.push({ chip, to: cellCenter(geo, 'copy', i), delay: i * PLACE_LEAD });
          });
          if (seats.length === 0) return null;
          const span = Math.min(0.6, (geo.n - 1) * PLACE_LEAD);
          return {
            duration: PLACE_MS,
            apply: (t) => {
              for (const seat of seats) {
                const e = lead(t, Math.min(span, seat.delay));
                place(seat.chip, { x: seat.to.x, y: seat.to.y - PLACE_RISE * (1 - e) });
              }
            },
          };
        }

        // 한 라운드. 자리 → 값 → 건너뛰기 → 내려놓기. 시계 하나 안의 네 구간이다.
        case 'round': {
          const { at, dropTo, takeFrom } = step;
          const extra = extraCellsOf(scene);
          // 게이지의 출발값. `prev` 를 들추지 않는다 — 첫 라운드인가로만 갈린다.
          const wasExtra: Record<InPlaceVsExtraLaneKey, number> = {
            inPlace: at === 0 ? 0 : 1,
            copy: at,
          };
          const heldChip = h.inPlaceChips[dropTo] ?? null;
          const copyChip = h.copiedChips[at] ?? null;
          const outSlot = h.outSlots[at] ?? null;
          const heldSlot = at === 0 ? h.heldSlot : null;
          const liftPt = cellCenter(geo, 'inPlace', at);
          const heldPt = borrowCenter(geo, 'inPlace', 0);
          const dropPt = cellCenter(geo, 'inPlace', dropTo);
          const srcPt = cellCenter(geo, 'copy', takeFrom);
          const outPt = borrowCenter(geo, 'copy', at);
          /** 자리를 늘리지 않는 대가 — 값들이 서로 건너뛴다. */
          const shifts: { chip: Chip; from: Pt; to: Pt }[] = [];
          for (let i = dropTo; i < at; i++) {
            const chip = h.inPlaceChips[i + 1];
            if (chip) {
              shifts.push({
                chip,
                from: cellCenter(geo, 'inPlace', i),
                to: cellCenter(geo, 'inPlace', i + 1),
              });
            }
          }
          if (heldChip) paintChip(heldChip, 'active');
          if (copyChip) paintChip(copyChip, 'active');

          return {
            duration: ROUND_MS,
            apply: (t) => {
              // 1) 자리 — 넓이가 늘어나는(또는 늘어나지 않는) 순간을 두 띠가 함께 맞는다.
              const eSpace = phase(t, 0, T_CARRY);
              if (heldSlot) heldSlot.setAttribute('width', String(geo.cellW * eSpace));
              if (outSlot) outSlot.setAttribute('width', String(geo.cellW * eSpace));
              for (const lane of LANES) {
                const gauge = h.gauges[lane];
                if (gauge) paintGauge(gauge, geo, lerp(wasExtra[lane], extra[lane], eSpace));
              }
              // 2) 값 — 한쪽은 들어 올리고, 한쪽은 옮겨 적는다.
              const eCarry = phase(t, T_CARRY, T_SHIFT);
              // 4) 내려놓기 — 빌린 자리는 다시 빈다. 들고 있는 동안은 3) 이 돈다.
              const eDrop = phase(t, T_DROP, ROUND_MS);
              if (heldChip) {
                place(
                  heldChip,
                  eDrop > 0
                    ? arc(heldPt, dropPt, eDrop, LIFT_ARC)
                    : arc(liftPt, heldPt, eCarry, LIFT_ARC),
                );
              }
              if (copyChip) place(copyChip, arc(srcPt, outPt, eCarry, LIFT_ARC));
              // 3) 건너뛰기.
              const eShift = phase(t, T_SHIFT, T_DROP);
              for (const shift of shifts) {
                place(shift.chip, arc(shift.from, shift.to, eShift));
              }
            },
          };
        }

        // 끝. 두 게이지가 나란히 부풀었다 돌아온다 — 견주는 것은 넓이다.
        case 'compare': {
          const bars: Gauge[] = [];
          for (const lane of LANES) {
            const gauge = h.gauges[lane];
            if (gauge) bars.push(gauge);
          }
          if (bars.length === 0) return null;
          return {
            duration: COMPARE_MS,
            apply: (t) => {
              const swell = Math.sin(Math.PI * t) * COMPARE_SWELL;
              for (const gauge of bars) {
                gauge.bar.setAttribute('y', String(gauge.top - swell));
                gauge.bar.setAttribute('height', String(GAUGE_H + swell * 2));
              }
            },
          };
        }
      }
    }

    /**
     * 장면을 그린다.
     *
     * 정적으로 전량 세운 뒤, `animate` 일 때만 방금 달라진 것을 흐르게 한다.
     * 되짚기는 `animate: false` 로 와서 타이머도 프레임도 걸지 않고 돌아간다.
     */
    async function render(
      next: InPlaceVsExtraScene,
      /** 출발 자리를 `step` 과 장면에서 되셈하므로 앞 장면을 들추지 않는다. */
      _prev: InPlaceVsExtraScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      const handles = drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;
      const motion = motionFor(next, step, handles);
      if (!motion) return;

      // 두 띠를 시계 하나로 흘린다. 하나를 `void` 로 던지지 않으므로 이 Promise 가
      // 풀릴 때 양쪽이 다 서 있다 (S-scene).
      await animate(motion.duration, my, motion.apply);

      if (!alive(my)) return;
      // 운동이 남긴 보간 끝자리와 임시 칠을 거두고 그 장면을 통째로 다시 세운다.
      // 그 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 살아 있는 걸음 함수가 깨어나도 자기 세대가 아니게 만든다.
        gen += 1;
        for (const id of frames) unschedule(id);
        frames.clear();
        // 걸려 있는 애니메이션은 여기서 전부 결과를 낸다 — 남기면 알고리즘이
        // 깨어나지 못한 채로 멈춘다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
