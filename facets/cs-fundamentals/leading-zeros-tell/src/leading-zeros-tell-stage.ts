/**
 * leading-zeros-tell 무대 — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 그림의 뼈대 (질문의 동사에서 나왔다 — **올라선다, 눈금이 한 칸씩**)
 *
 * 열쇠는 왼쪽에서 들어와 읽히고 오른쪽으로 흘러 나간다 — 지나가는 것이지 쌓이는
 * 것이 아니다. 읽힌 열쇠는 **첫 1 이 선 자리**에서 빔을 위로 밀어 올리고, 그 빔이
 * 지금 눈금보다 높으면 눈금이 한 칸 올라선다. 빔은 열쇠와 함께 흘러 나가고 눈금은
 * 남는다 — 끝에 화면에 남는 것은 눈금 하나와 그 위의 수뿐이다. 그것이 이 조각의
 * 주장이다.
 *
 * 잰 값은 재는 자리에 남긴다 — 추정값은 옆의 계기로 날아가지 않고 눈금 딱지에
 * 매달려 눈금과 함께 올라간다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 눈금이 선 칸은 `let notchY` 에, 빔이 얼마나 올라 있나는 `beam` 의 `height`/`x`
 * **속성을 되읽어**, 첫 1 이 어디냐는 `Tile` 이 쥔 DOM 손잡이 둘에, 추정값은
 * `pillText.textContent` 에, "눈금이 섰나" 는 `notch` 의 `display` 유무에 있었다.
 * 이제 장면의 `seen` 하나가 그 다섯을 다 말하고, 정적 그리기가 통째로 세운다.
 *
 * ── 화면에 나란히 뜨는 세 수가 한 함수를 지난다
 *
 * ρ 는 `rhoOf`, 눈금은 `notchOf`, 추정값은 `estimateOf` 에서만 나온다 — 표가 앉는
 * 자리도, 빔이 닿는 눈금도, 딱지의 수도, 캡션의 {p}·{n} 도 모두 그 셋이다.
 * 걸음은 payload 를 아예 싣지 않으므로 두 출처가 생길 길이 없다 (`scene.ts`).
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 판도 빔도 눈금도 이미 끝 자리에 서 있다. 걸음은 **아직
 * 못 온 만큼을 뒤로 물려** 두었다가 놓아 준다. 판이 갈리는 것(앞 열쇠가 나가고 새
 * 열쇠가 들어오는 것)은 한 뜻으로 묶인 운동이라 **시계를 나누지 않고** 한 보간에
 * 함께 싣는다 (S-scene). 출발 그림은 `prev` 가 아니라 `seen` 에서 셈한다.
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는 값이라
 * 이 파일이 상수로 갖는다 (S-piece). 색은 전부 design-tokens 경유다 (S-view).
 *
 * 화면의 `ρ=n` 과 `2^n = m` 은 도형에 새겨진 수식 표기라 번역하지 않는다 (C10).
 * 문장인 캡션은 `params.t` 로 만든다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  estimateOf,
  notchOf,
  rhoOf,
  rungCountOf,
  type LeadingZerosTellKey,
  type LeadingZerosTellScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로는 러너가 정한다. 세로는 그림이 정하고, 마운트한 뒤로 바뀌지 않는다 (S-view). */
const W = PIECE_CANVAS_W;
const STAGE_H = 300;

const SIDE = 28;
/** 눈금 이름(ρ=n) 이 앉을 왼쪽 여백. */
const RUNG_LABEL_W = 34;
const LADDER_X0 = SIDE + RUNG_LABEL_W;
const LADDER_X1 = W - SIDE;

/** 열쇠판. 빔은 여기서 위로 뻗는다. */
const TILE_Y = 200;
const TILE_H = 58;
const TILE_PAD = 12;
const BITS_X0 = SIDE + TILE_PAD;
const BITS_W = W - SIDE - TILE_PAD - BITS_X0;
const BITS = 32;
const CELL_W = BITS_W / BITS;
const NAME_BASE = TILE_Y + 22;
const BITS_BASE = TILE_Y + 46;
const MARK_Y = TILE_Y + 32;
const MARK_H = 20;

/** 맨 아래 눈금과 열쇠판 사이. 눈금이 서기 전 딱지가 숨어 있는 자리이기도 하다. */
const BASE_GAP = 44;
const RUNG_GAP_MAX = 48;
/** 맨 위 눈금이 넘지 않는 선 — 그 위로 딱지가 설 자리를 남긴다. */
const LADDER_TOP = 44;

const BEAM_W = 7;
const BAR_H = 6;
const PILL_W = 74;
const PILL_H = 20;
const CAPTION_BASE = 282;

/** 판이 갈리는 데 걸리는 시간 — 나가는 것과 들어오는 것이 한 시계를 쓴다. */
const SLIDE_MS = 260;
const BEAM_MS = 220;
const NOTCH_MS = 260;
const EXIT_MS = 240;
/** 끝 걸음에서 딱지가 한 번 부푸는 시간. 이미 서 있던 것이라 부푸는 꼴이 맞다. */
const PULSE_MS = 280;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Attrs): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

/** easeOutCubic — 올라선 뒤 자리를 잡는 느낌. */
function ease(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * 정적 그리기가 셈한 자리. 장면에는 좌표가 없으므로 매번 여기서 낸다 (S-piece).
 *
 * 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다 — 그리면서 이웃의 지금 좌표를
 * 되읽으면 순회 순서가 곧 숨은 상태가 된다 (`recolor-then-rotate`).
 */
type Geom = {
  rungCount: number;
  /** 그 칸의 세로. */
  rungY: (rho: number) => number;
  /** 눈금이 아직 서지 않았을 때 숨어 있는 자리 — 첫 기록은 여기서 올라온다. */
  notchHome: number;
  /** 비트 한 칸의 가로 중심. */
  cellCenter: (i: number) => number;
};

/** 열쇠판 하나와 그 빔. 판이 나가면 빔도 함께 나간다 — 남는 것은 눈금뿐이다. */
type Plate = {
  group: SVGGElement;
  /** 첫 1 에 얹히는 표. */
  mark: SVGRectElement;
  /** 첫 1 의 글자. 읽히면 잉크가 바뀐다. */
  firstOne: SVGTextElement | null;
  beam: SVGRectElement;
  /** 빔이 다 올랐을 때의 높이. */
  reach: number;
  /** 빔의 가로 중심 (판이 제 자리에 섰을 때). */
  beamX: number;
};

/** 눈금과 그 딱지. 한 번 올라서면 내려오지 않는다. */
type Notch = {
  group: SVGGElement;
  /** 딱지 묶음. 끝 걸음에서 이것만 부푼다. */
  pill: SVGGElement;
  pillText: SVGTextElement;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  plate: Plate | null;
  notch: Notch | null;
};

export const leadingZerosTellStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<LeadingZerosTellScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다. 고정 자리에
    //    남는 요소를 하나도 두지 않으므로 "재건 밖 요소" 가 없다 (S-scene).
    const gLadder = el('g', {});
    const gBeam = el('g', {});
    const gNotch = el('g', {});
    const gTile = el('g', {});
    const gCaption = el('g', {});
    svg.append(gLadder, gBeam, gNotch, gTile, gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 되짚기가 끼어들면 남은 프레임이
     * **이미 새로 선 화면**을 덮을 수 있으므로, 프레임마다 자기 번호가 아직
     * 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서
     * 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    function geomOf(scene: LeadingZerosTellScene): Geom {
      // 사다리 칸 수는 바탕 자료에서 한 번에 센다 — 걸음마다 자라는 셈을 쓰면
      // 열쇠가 하나 더 지날 때마다 칸 간격이 통째로 갈린다.
      const rungCount = rungCountOf(scene.keys);
      const gap = Math.min(
        RUNG_GAP_MAX,
        Math.floor((TILE_Y - BASE_GAP - LADDER_TOP) / Math.max(1, rungCount - 1)),
      );
      return {
        rungCount,
        rungY: (rho: number): number => TILE_Y - BASE_GAP - (rho - 1) * gap,
        notchHome: TILE_Y - 8,
        cellCenter: (i: number): number => BITS_X0 + (i + 0.5) * CELL_W,
      };
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 것.
     *
     * 갈래는 `step` 이 가르고 수는 장면에서 센다 — 캡션이 제 수를 따로 들고 있으면
     * 화면의 표·눈금·딱지와 갈릴 자리가 생긴다.
     */
    function captionFor(scene: LeadingZerosTellScene): string {
      const step = scene.step;
      if (step === null) return '';
      if (step.kind === 'settle') {
        return t('caption.done', 'Nothing was kept but the notch — distinct items, about {n}.', {
          n: estimateOf(notchOf(scene.keys, scene.seen)),
        });
      }
      const row = scene.reading === null ? undefined : scene.keys[scene.reading];
      if (row === undefined) return '';
      const p = rhoOf(row.bits);
      return step.kind === 'rise'
        ? t('caption.rise', 'The first 1 sits at {p}. Higher than the notch — it steps up.', { p })
        : t('caption.stay', 'The first 1 sits at {p}. The notch stays.', { p });
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of [gLadder, gBeam, gNotch, gTile, gCaption]) g.textContent = '';
    }

    function drawLadder(geom: Geom): void {
      for (let rho = 1; rho <= geom.rungCount; rho += 1) {
        const y = geom.rungY(rho);
        gLadder.appendChild(
          el('line', {
            x1: LADDER_X0,
            y1: y,
            x2: LADDER_X1,
            y2: y,
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '3 5',
          }),
        );
        const label = el('text', {
          x: SIDE,
          y: y + 4,
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        // 수식 표기는 표식이다 — 번역하지 않는다 (C10).
        label.textContent = `ρ=${rho}`;
        gLadder.appendChild(label);
      }
    }

    /**
     * 열쇠판 하나와 그 빔을 짓는다. 끝 자리(판 제자리 · 빔 다 오름)에 세우지 않고
     * 손잡이만 돌려준다 — 세우는 것은 `setPlate` 의 일이다.
     */
    function buildPlate(geom: Geom, row: LeadingZerosTellKey): Plate {
      const rho = rhoOf(row.bits);
      const group = el('g', {});
      group.appendChild(
        el('rect', {
          x: SIDE,
          y: TILE_Y,
          width: W - SIDE * 2,
          height: TILE_H,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      const name = el('text', {
        x: BITS_X0,
        y: NAME_BASE,
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
      name.textContent = row.key;
      group.appendChild(name);

      // 첫 1 의 표. 자리는 ρ 가 정한다 — 빔이 닿는 칸도 같은 수에서 나온다.
      const mark = el('rect', {
        x: BITS_X0 + (rho - 1) * CELL_W,
        y: MARK_Y,
        width: CELL_W,
        height: MARK_H,
        rx: 3,
        fill: colors.accent,
      });
      group.appendChild(mark);

      let firstOne: SVGTextElement | null = null;
      for (let i = 0; i < BITS && i < row.bits.length; i += 1) {
        const isPrefix = i < rho - 1;
        const isFirstOne = i === rho - 1;
        const glyph = el('text', {
          x: geom.cellCenter(i),
          y: BITS_BASE,
          // 앞선 0 과 첫 1 이 뜻을 지닌 자리다. 뒤는 흐리게 둔다 — 색이 곧 값이다.
          fill: isPrefix || isFirstOne ? colors.text : colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
        });
        glyph.textContent = row.bits[i];
        if (isFirstOne) firstOne = glyph;
        group.appendChild(glyph);
      }
      gTile.appendChild(group);

      const beam = el('rect', { x: 0, y: TILE_Y, width: BEAM_W, height: 0, rx: 3, fill: colors.itemActive });
      gBeam.appendChild(beam);

      return {
        group,
        mark,
        firstOne,
        beam,
        reach: TILE_Y - geom.rungY(rho),
        beamX: geom.cellCenter(rho - 1),
      };
    }

    /**
     * 판을 세운다.
     *
     * @param dx 제자리에서 옆으로 물린 만큼. 0 이면 제자리.
     * @param beamFrac 빔이 오른 몫. 1 이면 첫 1 의 칸까지 다 올랐다.
     * @param read 읽혔나 — 표가 얹히고 첫 1 의 잉크가 바뀐다.
     */
    function setPlate(plate: Plate, dx: number, beamFrac: number, read: boolean): void {
      plate.group.setAttribute('transform', `translate(${dx} 0)`);
      const h = Math.max(0, plate.reach * beamFrac);
      plate.beam.setAttribute('x', String(plate.beamX + dx - BEAM_W / 2));
      plate.beam.setAttribute('y', String(TILE_Y - h));
      plate.beam.setAttribute('height', String(h));
      if (read) {
        plate.mark.removeAttribute('display');
        plate.firstOne?.setAttribute('fill', colors.stateInk);
      } else {
        plate.mark.setAttribute('display', 'none');
        plate.firstOne?.setAttribute('fill', colors.text);
      }
    }

    function buildNotch(): Notch {
      const group = el('g', {});
      group.appendChild(
        el('rect', {
          x: LADDER_X0,
          y: -BAR_H / 2,
          width: LADDER_X1 - LADDER_X0,
          height: BAR_H,
          rx: BAR_H / 2,
          fill: colors.primary,
        }),
      );
      const pill = el('g', {});
      pill.appendChild(
        el('rect', {
          x: LADDER_X1 - PILL_W,
          y: -BAR_H / 2 - 6 - PILL_H,
          width: PILL_W,
          height: PILL_H,
          rx: 6,
          fill: colors.primary,
        }),
      );
      const pillText = el('text', {
        x: LADDER_X1 - PILL_W / 2,
        y: -BAR_H / 2 - 6 - PILL_H / 2 + 4,
        fill: colors.textInverse,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
      });
      pill.appendChild(pillText);
      group.appendChild(pill);
      gNotch.appendChild(group);
      return { group, pill, pillText };
    }

    /**
     * 눈금을 세운다. `rung` 이 0 이면 아직 안 선 것이라 숨긴다.
     *
     * 딱지의 수는 눈금 칸에서만 나온다 — `estimateOf` 한 곳을 지나므로 캡션의 {n}
     * 과 갈릴 수 없다.
     */
    function setNotch(notch: Notch, y: number, rung: number): void {
      notch.group.setAttribute('transform', `translate(0 ${y})`);
      if (rung <= 0) {
        notch.group.setAttribute('display', 'none');
        notch.pillText.textContent = '';
        return;
      }
      notch.group.removeAttribute('display');
      // 수식 표기는 표식이다 — 번역하지 않는다 (C10).
      notch.pillText.textContent = `2^${rung} = ${estimateOf(rung)}`;
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: LeadingZerosTellScene): Drawn {
      rewind();
      const geom = geomOf(scene);
      drawLadder(geom);

      // 눈금은 오르기만 하는 누적이고 그 누적이 곧 주장이다 — 정적 그리기가 매번
      // 세운다. 빠뜨리면 되짚었을 때 사라진다 (S-scene).
      const rung = notchOf(scene.keys, scene.seen);
      let notch: Notch | null = null;
      if (rung > 0) {
        notch = buildNotch();
        setNotch(notch, geom.rungY(rung), rung);
      }

      let plate: Plate | null = null;
      const row = scene.reading === null ? undefined : scene.keys[scene.reading];
      if (row !== undefined) {
        plate = buildPlate(geom, row);
        setPlate(plate, 0, 1, true);
      }

      const caption = el('text', {
        x: W / 2,
        y: CAPTION_BASE,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'text-anchor': 'middle',
      });
      caption.textContent = captionFor(scene);
      gCaption.appendChild(caption);

      return { geom, plate, notch };
    }

    // ── 운동 ──────────────────────────────────────────────────────────────
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 `seen` 에서 셈하고 `prev` 를
    // 들추지 않는다 (S-scene).

    /**
     * 열쇠 하나가 흘러 들어와 읽히고, 올라설 것이면 눈금이 한 칸 올라선다.
     *
     * 판이 갈리는 것 — 앞 열쇠가 오른쪽으로 나가고 새 열쇠가 왼쪽에서 들어오는 것
     * — 은 한 뜻으로 묶인 운동이라 **한 시계**로 돌린다. 시계를 둘로 나누면
     * lockstep 이 우연히 맞는 꼴이 되고 하나를 `void` 로 흘릴 여지가 생긴다.
     */
    function flowRead(
      drawn: Drawn,
      scene: LeadingZerosTellScene,
      rise: boolean,
      mine: number,
    ): Promise<void> {
      const plate = drawn.plate;
      const reading = scene.reading;
      if (plate === null || reading === null) return Promise.resolve();

      // 흘러 나가는 앞 열쇠. 어느 것인지는 차례가 정하므로 `prev` 를 볼 일이 없다.
      const prevRow = reading > 0 ? scene.keys[reading - 1] : undefined;
      const outgoing = prevRow === undefined ? null : buildPlate(drawn.geom, prevRow);

      // 눈금의 출발 칸과 도착 칸. 둘 다 지나간 개수에서 셈한다.
      const before = notchOf(scene.keys, reading);
      const after = notchOf(scene.keys, reading + 1);
      const fromY = before > 0 ? drawn.geom.rungY(before) : drawn.geom.notchHome;
      const toY = drawn.geom.rungY(after);

      const notchAt = SLIDE_MS + BEAM_MS;
      const total = notchAt + (rise ? NOTCH_MS : 0);
      const notch = drawn.notch;
      if (rise && notch !== null) setNotch(notch, fromY, before);

      return tween(total, mine, (p) => {
        const ms = p * total;
        const slide = clamp01(ms / SLIDE_MS);
        const beam = clamp01((ms - SLIDE_MS) / BEAM_MS);
        setPlate(plate, -W * (1 - ease(slide)), ease(beam), slide >= 1);
        if (outgoing !== null) setPlate(outgoing, W * ease(slide), 1 - slide, true);
        if (!rise || notch === null) return;
        if (ms < notchAt) return setNotch(notch, fromY, before);
        const q = clamp01((ms - notchAt) / NOTCH_MS);
        // 끝에서는 보간값 대신 목표값을 그대로 쓴다 — 부동소수 끝자리가 문자열을
        // 가른다. 어차피 뒤에서 장면을 통째로 다시 세우지만 여기서도 정직하게.
        setNotch(notch, q >= 1 ? toY : fromY + (toY - fromY) * ease(q), after);
      });
    }

    /**
     * 마지막 열쇠가 흘러 나가고 눈금 하나만 남는다.
     *
     * 판이 나가는 것이 그 걸음이 하는 말과 같은 동사다. 딱지는 이미 서 있던 것이라
     * 나타나는 꼴이 아니라 한 번 부풀었다 돌아오는 꼴로 짚는다 (얇은 걸음 처방).
     */
    function flowSettle(
      drawn: Drawn,
      scene: LeadingZerosTellScene,
      mine: number,
    ): Promise<void> {
      const last = scene.seen - 1;
      const row = last >= 0 ? scene.keys[last] : undefined;
      const outgoing = row === undefined ? null : buildPlate(drawn.geom, row);
      if (outgoing !== null) setPlate(outgoing, 0, 1, true);
      const notch = drawn.notch;
      const total = EXIT_MS + PULSE_MS;

      // 딱지가 부푸는 중심. 눈금 묶음 안의 자리라 눈금이 어디 있어도 같다.
      const cx = LADDER_X1 - PILL_W / 2;
      const cy = -BAR_H / 2 - 6 - PILL_H / 2;

      return tween(total, mine, (p) => {
        const ms = p * total;
        if (outgoing !== null) {
          const q = clamp01(ms / EXIT_MS);
          setPlate(outgoing, W * ease(q), 1 - q, true);
        }
        if (notch === null) return;
        const q = clamp01((ms - EXIT_MS) / PULSE_MS);
        if (q <= 0 || q >= 1) {
          // 값을 되돌리는 것이 아니라 속성을 거둔다 — 흐르며 선 화면과 곧바로 세운
          // 화면이 속성의 유무만큼 달라지지 않게 (S-scene).
          notch.pill.removeAttribute('transform');
          return;
        }
        const s = 1 + 0.16 * Math.sin(Math.PI * q);
        notch.pill.setAttribute('transform', `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`);
      });
    }

    function flowFor(drawn: Drawn, scene: LeadingZerosTellScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'read':
          return flowRead(drawn, scene, false, mine);
        case 'rise':
          return flowRead(drawn, scene, true, mine);
        case 'settle':
          return flowSettle(drawn, scene, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: LeadingZerosTellScene,
      _prev: LeadingZerosTellScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      await flowFor(drawn, next, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 물려 둔 판·빔이 노드째 사라진다. 되돌릴 목록을
      // 손으로 관리하지 않는다 (S-scene).
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
