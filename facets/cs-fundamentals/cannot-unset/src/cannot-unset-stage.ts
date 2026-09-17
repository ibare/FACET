/**
 * cannot-unset stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 그림의 뼈대 (질문의 동사에서 나왔다 — **함께 꺼진다, 발밑이 무너진다**)
 *
 * 비트 배열을 **바닥**으로 그리고, 값은 그 위에 세 발을 딛고 선 삼각대로 그린다.
 * 세 발 중 하나라도 밟을 칸이 사라지면 삼각대는 설 수 없다 — k=3 이 삼각대와
 * 맞아떨어져, "한 비트만 0 이 되어도 없다고 답한다" 를 물리적으로 거짓 없이
 * 옮길 수 있다.
 *
 * 지우는 순간 칸이 꺼지고, 그 칸을 밟고 있던 발이 바닥 아래로 빠지며, 발밑을 잃은
 * 값이 주저앉는다. 지워진 값은 아예 바닥 뒤로 가라앉아 사라진다. 다리와 좌판은
 * 칸보다 먼저 그려 두므로 (z-order) 가라앉는 것이 바닥에 가린다.
 *
 * ── 마지막 화면에 무엇이 남나
 *
 * 옛 stage 는 지울 값의 자리에 표식을 달았다가 **끄면서 그 표식을 거뒀다.** 그래서
 * 다 끝난 화면에는 어느 칸이 이번에 꺼진 것인지 알 길이 없었다. 여기서는 갈라
 * 둔다 — **채움은 값의 형편**(1 인가 0 인가), **테두리는 표식**(이 칸을 내가 껐다).
 * 표식은 `picked` 를 지난 뒤로 끝까지 남고, 그 칸 밑으로 빠져 있는 남의 발이
 * "그래서 무엇이 함께 무너졌나" 를 마저 말한다. 되짚어 그 걸음에 가도 둘 다 선다.
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 삼각대는 이미 끝 자세로 서 있다. 걸음은 **한 단계 앞의
 * 자세에서 지금 자세로** 보간하는데, 출발 자세는 `before(scene)` 로 셈해 낸다 —
 * `prev` 를 들춰 꺼내면 "`prev` 는 무엇을 흐르게 할지 고르는 데만" 을 어긴다
 * (S-scene). 무너짐은 셋이 동시에 일어나는 한 뜻의 운동이므로 **한 시계**로
 * 돌린다. 운동이 끝나면 장면을 통째로 다시 세워 보간이 남긴 끝자리와 `opacity` 를
 * 노드째 지운다.
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는 값이라
 * 이 파일이 상수로 갖는다 (S-piece). 좌표는 전부 캔버스에서 역산하며, 칸 폭은
 * 상한만 두고 남는 폭을 좌우로 버리지 않는다. 색은 전부 design-tokens 경유다
 * (S-view). 문장인 캡션은 `params.t` 로 만든다 (C10).
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  absentWords,
  atLeast,
  badgeOf,
  before,
  bitsAt,
  brokenWords,
  clearedSlots,
  isFallen,
  isGone,
  isLifted,
  sharedSlots,
  sunkFeet,
  type CannotUnsetScene,
  type WordStand,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정한다. 마운트한 뒤로 바뀌지 않는다 (S-view). */
const CANVAS_H = 306;

const CELL_TOP = 194;
const CELL_H = 34;
/** 칸 폭의 **상한**만 둔다. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 42;
const SIDE_MIN = 26;
const INDEX_BASE = CELL_TOP + CELL_H + 14;
const CAP_Y = [258, 276, 294];

const SEAT_W = 60;
const SEAT_H = 26;
const BADGE_W = 56;
const BADGE_H = 18;
const BADGE_GAP = 6;
const TIER_Y0 = 34;
const TIER_STEP = 48;
/** 이보다 가까운 두 좌판은 한 층에 두지 않는다. */
const MIN_TIER_GAP = SEAT_W + 18;

const PAD_W = 9;
const PAD_H = 6;
/** 같은 칸을 밟는 발끼리 벌리는 간격. 겹쳐 그리면 누구 발인지 안 보인다. */
const FOOT_SPREAD = 10;
const LEG_W = 2.5;

/** 발이 바닥 아래로 빠지는 깊이. 칸 뒤로 완전히 숨는다. */
const SINK = 30;
/** 발밑을 잃은 값이 주저앉는 깊이. */
const SAG = 36;
/** 지울 값을 집어 들 때 뜨는 높이. */
const LIFT = 10;
/** 지워진 값의 좌판이 가라앉아 멎는 자리. */
const GONE_APEX = CELL_TOP + 32;
/** 삼각대가 처음 설 때 내려앉는 거리. */
const RISE = 30;

const STAND_MS = 460;
const VERIFY_MS = 400;
const SELECT_MS = 300;
const CLEAR_MS = 420;
const COLLAPSE_MS = 620;
const VERDICT_MS = 320;
/**
 * 결론 걸음에만 얹는 얇은 운동.
 *
 * 이 걸음은 캡션만 바뀌어 벽시계가 `stepMs` 그대로였다 — 띠를 끌 때 앞뒤와 구별되지
 * 않는 자리다. `stepMs` 를 올리면 이미 긴 걸음이 함께 길어지므로 이 걸음에만 운동을
 * 얹는다 (S-piece 의 얇은 걸음).
 */
const SETTLE_MS = 260;
const FRAME_MS = 16;

/** 결론 걸음에서 켜진 칸이 부푸는 크기. */
const SWELL = 3;

/** 삼각대 하나의 고정 자리. 장면에는 좌표가 없으므로 매번 여기서 낸다 (S-piece). */
type WordLayout = {
  stand: WordStand;
  color: string;
  footX: number[];
  apexX: number;
  seatY: number;
  baseApexY: number;
};

/** 바닥의 자리 셈. */
type Geom = { m: number; cellW: number; cellCX: (i: number) => number };

/**
 * 그 장면에서의 삼각대 자세.
 *
 * `phase` 에서 파생하는 값이라 출발 자세도 `before(scene)` 를 먹여 셈으로 얻는다.
 */
type Pose = { apexY: number; footY: number[] };

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type DrawnRow = {
  lay: WordLayout;
  legsG: SVGGElement;
  seatG: SVGGElement;
  badgeG: SVGGElement;
  legs: SVGLineElement[];
  pads: SVGRectElement[];
  badgeBox: SVGRectElement;
  badgeText: SVGTextElement;
};

type Drawn = {
  geom: Geom;
  rows: DrawnRow[];
  tiles: SVGRectElement[];
  digits: SVGTextElement[];
  /** 칸 하나를 다시 칠한다. `hot` 은 지금 짚어 보는 중이라는 지나가는 칠이다. */
  paintCell: (i: number, hot: boolean) => void;
};

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

/** 떨어지는 것은 가속한다. */
function easeIn(p: number): number {
  return p * p;
}

const lerp = (a: number, b: number, e: number): number => a + (b - a) * e;

export const cannotUnsetStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<CannotUnsetScene> {
    void container;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const svg = params.canvas;
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const capPx = parseFloat(fontSizes.md);
    const capMaxW = PIECE_CANVAS_W - SIDE_MIN * 2;

    // z-order — 다리와 좌판이 먼저다. 가라앉는 것이 바닥에 가려야 한다.
    const gLegs = node('g', {});
    const gSeats = node('g', {});
    const gBadges = node('g', {});
    const gCells = node('g', {});
    const gCaption = node('g', {});
    svg.append(gLegs, gSeats, gBadges, gCells, gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 타이머를 여러 번 지난다. 가운데에 되짚기가 끼어들면 남은 프레임이
     * **이미 새로 선 화면**을 덮을 수 있으므로, 마디마다 자기 번호가 아직 유효한지
     * 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function tween(ms: number, mine: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const startedAt = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = ms <= 0 ? 1 : clamp01((Date.now() - startedAt) / ms);
          onFrame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function text(
      x: number,
      y: number,
      value: string,
      size: string,
      fill: string,
      family: string,
    ): SVGTextElement {
      const e = node('text', {
        x: r2(x),
        y: r2(y),
        'text-anchor': 'middle',
        'font-family': family,
        'font-size': size,
        fill,
      });
      e.textContent = value;
      return e;
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────
    //
    // **자리를 먼저 한 번에 셈하고 그 다음에 그린다.** 그리면서 이웃의 지금 좌표를
    // 읽으면 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).

    function layoutOf(scene: CannotUnsetScene): { geom: Geom; rows: WordLayout[] } {
      const m = Math.max(1, scene.m);
      const cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / m));
      const originX = Math.round((PIECE_CANVAS_W - m * cellW) / 2);
      const cellCX = (i: number): number => originX + i * cellW + cellW / 2;

      /*
       * 색판의 씨앗은 **바탕의 값 수**다. "지금까지 드러난 수" 로 정하면 하나가 더
       * 드러날 때 이미 칠한 것의 hue 가 통째로 갈린다 (프로토콜 4 절).
       */
      const tone = categorical(Math.max(1, scene.words.length), 'vivid');
      const half = (scene.words.length - 1) / 2;

      const draft = scene.words.map((w, i) => {
        const footX = w.slots.map((s) => cellCX(s) + (i - half) * FOOT_SPREAD);
        const mean = footX.reduce((a, b) => a + b, 0) / Math.max(1, footX.length);
        return {
          stand: w,
          index: i,
          color: tone[i] ?? colors.primary,
          footX,
          apexX: clamp(mean, SEAT_W / 2 + 12, PIECE_CANVAS_W - SEAT_W / 2 - 12),
        };
      });

      // 층 나누기 — 가로로 붙는 좌판만 아래 층으로 내린다.
      const taken: number[] = [];
      const tierOf = new Map<number, number>();
      for (const d of [...draft].sort((a, b) => a.apexX - b.apexX)) {
        let tier = 0;
        while (tier < taken.length && Math.abs(d.apexX - (taken[tier] ?? 0)) < MIN_TIER_GAP) {
          tier += 1;
        }
        taken[tier] = d.apexX;
        tierOf.set(d.index, tier);
      }

      const rows: WordLayout[] = draft.map((d) => {
        const seatY = TIER_Y0 + (tierOf.get(d.index) ?? 0) * TIER_STEP;
        return {
          stand: d.stand,
          color: d.color,
          footX: d.footX,
          apexX: d.apexX,
          seatY,
          baseApexY: seatY + SEAT_H,
        };
      });

      return { geom: { m, cellW, cellCX }, rows };
    }

    /**
     * 그 장면에서 이 삼각대가 취하는 자세.
     *
     * `phase` 에서만 파생하므로 `before(scene)` 를 먹이면 한 단계 앞의 자세가 그대로
     * 나온다 — 흐르는 그림의 출발값을 `prev` 에서 꺼낼 까닭이 없다 (S-scene).
     */
    function poseOf(scene: CannotUnsetScene, lay: WordLayout): Pose {
      const stand = lay.stand;
      if (isGone(scene, stand.word)) {
        return { apexY: GONE_APEX, footY: lay.footX.map(() => CELL_TOP + SINK) };
      }
      const sunk = sunkFeet(scene, stand);
      if (isFallen(scene, stand.word)) {
        return {
          apexY: lay.baseApexY + SAG,
          footY: lay.footX.map((_, j) => (sunk[j] === true ? CELL_TOP + SINK : CELL_TOP)),
        };
      }
      const lift = isLifted(scene, stand.word) ? LIFT : 0;
      return { apexY: lay.baseApexY - lift, footY: lay.footX.map(() => CELL_TOP - lift) };
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    function widthOf(s: string): number {
      let w = 0;
      for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x1000 ? 1 : 0.54;
      return w * capPx;
    }

    function wrap(value: string): string[] {
      const out: string[] = [];
      let line = '';
      for (const word of value.split(' ')) {
        const probe = line === '' ? word : `${line} ${word}`;
        if (widthOf(probe) <= capMaxW) {
          line = probe;
          continue;
        }
        if (line !== '') {
          out.push(line);
          line = '';
        }
        // 띄어쓰기가 없는 언어는 낱말 하나가 한 줄을 넘긴다 — 글자로 끊는다.
        let buf = '';
        for (const ch of word) {
          if (buf !== '' && widthOf(buf + ch) > capMaxW) {
            out.push(buf);
            buf = '';
          }
          buf += ch;
        }
        line = buf;
      }
      if (line !== '') out.push(line);
      return out.slice(0, CAP_Y.length);
    }

    /**
     * 캡션이 말할 것.
     *
     * 수는 전부 바탕에서 세는 함수를 지난다 — 캡션이 제 수를 따로 들고 있으면
     * 화면의 칸·다리·배지와 갈릴 자리가 생긴다 (프로토콜 4 절).
     */
    function captionFor(scene: CannotUnsetScene): string {
      switch (scene.phase) {
        case 'idle':
          return '';
        case 'stood':
          return t(
            'caption.stand',
            'Three values are already in the filter. Each one stands on three cells.',
          );
        case 'asked':
          return t('caption.verify', 'Ask each one, and all three answer yes.');
        case 'picked':
          return t('caption.select', 'Erase one of them: {word}. Its cells are {slots}.', {
            word: scene.erase,
            slots: clearedSlots(scene).join(', '),
          });
        case 'cleared':
          return t('caption.clear', 'Turning those cells off leaves {bits}.', {
            bits: bitsAt(scene).join(''),
          });
        case 'collapsed':
          return t(
            'caption.collapse',
            'But cells {shared} were shared. {broken} lose the ground under them.',
            { shared: sharedSlots(scene).join(', '), broken: brokenWords(scene).join(', ') },
          );
        case 'reasked':
          return t('caption.verdict', 'Ask again: {absent} answer no, though nobody erased them.', {
            absent: absentWords(scene).join(', '),
          });
        case 'settled':
          return t(
            'caption.done',
            'A cell only says 1, never who set it. So erasing one value takes the others down with it.',
          );
      }
    }

    // ── 자세 앉히기 ───────────────────────────────────────────────────────

    function place(row: DrawnRow, pose: Pose, badgeDy = 0): void {
      const dy = pose.apexY - row.lay.baseApexY;
      row.seatG.setAttribute('transform', `translate(0 ${r2(dy)})`);
      row.badgeG.setAttribute('transform', `translate(0 ${r2(dy + badgeDy)})`);
      for (let j = 0; j < row.legs.length; j += 1) {
        const leg = row.legs[j];
        const pad = row.pads[j];
        const fy = pose.footY[j] ?? CELL_TOP;
        if (leg) {
          leg.setAttribute('y1', String(r2(fy)));
          leg.setAttribute('y2', String(r2(pose.apexY)));
        }
        if (pad) pad.setAttribute('y', String(r2(fy - PAD_H)));
      }
    }

    function setBadge(row: DrawnRow, kind: 'yes' | 'no' | null): void {
      if (kind === null) {
        row.badgeG.setAttribute('opacity', '0');
        row.badgeText.textContent = '';
        return;
      }
      row.badgeG.setAttribute('opacity', '1');
      row.badgeText.textContent =
        kind === 'yes' ? t('label.found', 'yes') : t('label.missing', 'no');
      row.badgeBox.setAttribute('stroke', kind === 'yes' ? row.lay.color : colors.danger);
      row.badgeText.setAttribute('fill', kind === 'yes' ? colors.text : colors.danger);
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of [gLegs, gSeats, gBadges, gCells, gCaption]) g.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: CannotUnsetScene): Drawn {
      rewind();

      const { geom, rows: lays } = layoutOf(scene);
      const { m, cellW, cellCX } = geom;

      // ── 값 (삼각대). 아직 서지 않았으면 그리지 않는다.
      const rows: DrawnRow[] = [];
      if (atLeast(scene, 'stood')) {
        for (const lay of lays) {
          const legsG = node('g', {});
          const seatG = node('g', {});
          const badgeG = node('g', { opacity: 0 });
          const legs: SVGLineElement[] = [];
          const pads: SVGRectElement[] = [];

          /*
           * 발밑을 잃은 값의 다리는 붉다. **머무는 표식이라 정적 그리기에 넣는다** —
           * 빠뜨리면 되짚었을 때 "누가 무너졌나" 가 화면에서 사라진다 (S-scene).
           */
          const legColor = isFallen(scene, lay.stand.word) ? colors.danger : lay.color;

          for (const x of lay.footX) {
            const leg = node('line', {
              x1: r2(x),
              y1: CELL_TOP,
              x2: r2(lay.apexX),
              y2: r2(lay.baseApexY),
              stroke: legColor,
              'stroke-width': LEG_W,
              'stroke-linecap': 'round',
            });
            const pad = node('rect', {
              x: r2(x - PAD_W / 2),
              y: CELL_TOP - PAD_H,
              width: PAD_W,
              height: PAD_H,
              rx: 2,
              fill: legColor,
            });
            legs.push(leg);
            pads.push(pad);
            legsG.append(leg, pad);
          }

          seatG.appendChild(
            node('rect', {
              x: r2(lay.apexX - SEAT_W / 2),
              y: lay.seatY,
              width: SEAT_W,
              height: SEAT_H,
              rx: 6,
              fill: lay.color,
              stroke: colors.border,
            }),
          );
          seatG.appendChild(
            text(lay.apexX, lay.seatY + 18, lay.stand.word, fontSizes.md, colors.stateInk, fonts.mono),
          );

          const badgeBox = node('rect', {
            x: r2(lay.apexX - BADGE_W / 2),
            y: lay.seatY - BADGE_GAP - BADGE_H,
            width: BADGE_W,
            height: BADGE_H,
            rx: 9,
            fill: colors.bg,
            stroke: lay.color,
          });
          const badgeText = text(
            lay.apexX,
            lay.seatY - BADGE_GAP - 5,
            '',
            fontSizes.xs,
            colors.text,
            fonts.body,
          );
          badgeG.append(badgeBox, badgeText);

          gLegs.appendChild(legsG);
          gSeats.appendChild(seatG);
          gBadges.appendChild(badgeG);

          const row: DrawnRow = { lay, legsG, seatG, badgeG, legs, pads, badgeBox, badgeText };
          rows.push(row);
          place(row, poseOf(scene, lay));
          setBadge(row, badgeOf(scene, lay.stand.word));
        }
      }

      // ── 바닥 (비트 배열)
      const bits = bitsAt(scene);
      /*
       * 끈 자리의 표식. **`picked` 를 지난 뒤로 끝까지 남는다** — 채움은 값의
       * 형편이고 테두리는 표식이라 둘이 부딪히지 않는다.
       */
      const marked = new Set<number>(atLeast(scene, 'picked') ? clearedSlots(scene) : []);
      const tiles: SVGRectElement[] = [];
      const digits: SVGTextElement[] = [];

      const paintCell = (i: number, hot: boolean): void => {
        const tile = tiles[i];
        const digit = digits[i];
        if (!tile || !digit) return;
        const on = bits[i] === 1;
        tile.setAttribute('fill', hot ? colors.itemComparing : on ? colors.primary : colors.bg);
        tile.setAttribute('stroke', marked.has(i) ? colors.danger : colors.border);
        tile.setAttribute('stroke-width', marked.has(i) ? '2.5' : '1');
        digit.setAttribute(
          'fill',
          hot ? colors.stateInk : on ? colors.textInverse : colors.textMuted,
        );
        digit.textContent = on ? '1' : '0';
      };

      for (let i = 0; i < m; i += 1) {
        const tile = node('rect', {
          x: r2(cellCX(i) - cellW / 2 + 1),
          y: CELL_TOP,
          width: r2(cellW - 2),
          height: CELL_H,
          rx: 4,
        });
        const digit = text(
          cellCX(i),
          CELL_TOP + CELL_H / 2 + 5,
          '',
          fontSizes.md,
          colors.text,
          fonts.mono,
        );
        tiles.push(tile);
        digits.push(digit);
        gCells.append(tile, digit);
        gCells.appendChild(
          text(cellCX(i), INDEX_BASE, String(i), fontSizes.xs, colors.textMuted, fonts.mono),
        );
        paintCell(i, false);
      }

      // ── 캡션. 지금 무슨 일이 일어나는지만 말한다 (S-piece).
      wrap(captionFor(scene)).forEach((line, i) => {
        gCaption.appendChild(
          text(
            PIECE_CANVAS_W / 2,
            CAP_Y[i] ?? CAP_Y[0] ?? 0,
            line,
            fontSizes.md,
            colors.text,
            fonts.body,
          ),
        );
      });

      return { geom, rows, tiles, digits, paintCell };
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자세로 세워 두었으므로, 여기서는 **한 단계 앞의 자세로
    // 물렸다가** 놓아 준다. 출발 자세는 `before(scene)` 가 말한다.

    /** 삼각대가 처음 선다 — 위에서 내려앉으며 나타난다. */
    function flowStand(scene: CannotUnsetScene, drawn: Drawn, mine: number): Promise<void> {
      const target = drawn.rows.map((row) => ({ row, pose: poseOf(scene, row.lay) }));
      return tween(STAND_MS, mine, (p) => {
        const e = easeOut(p);
        for (const { row, pose } of target) {
          row.legsG.setAttribute('opacity', String(r2(e)));
          row.seatG.setAttribute('opacity', String(r2(e)));
          place(row, {
            apexY: pose.apexY - RISE * (1 - e),
            footY: pose.footY.map((y) => y - RISE * (1 - e)),
          });
        }
      });
    }

    /**
     * 물어본다 — 배지가 떠오르고, 밟고 선 칸이 짚인다.
     *
     * 짚이는 칠은 이 걸음 안에서만 살다 가므로 장면에 담지 않는다. 걸음이 끝나면
     * 장면을 통째로 다시 세워 거둔다 (S-scene 의 "머무는 것과 지나가는 것").
     */
    function flowVerify(scene: CannotUnsetScene, drawn: Drawn, mine: number): Promise<void> {
      const picked = drawn.rows.filter((row) => badgeOf(scene, row.lay.stand.word) !== null);
      const hot = new Set<number>();
      for (const row of picked) for (const s of row.lay.stand.slots) hot.add(s);
      for (const s of hot) drawn.paintCell(s, true);

      const target = picked.map((row) => ({ row, pose: poseOf(scene, row.lay) }));
      return tween(VERIFY_MS, mine, (p) => {
        const e = easeOut(p);
        const press = 3 * Math.sin(Math.PI * p);
        for (const { row, pose } of target) {
          row.badgeG.setAttribute('opacity', String(r2(e)));
          place(
            row,
            { apexY: pose.apexY, footY: pose.footY.map((y) => y + press) },
            -12 * (1 - e),
          );
        }
      });
    }

    /** 자세가 한 단계 앞에서 지금으로 미끄러진다. 집어 듦과 무너짐이 같은 길이다. */
    function flowPose(
      scene: CannotUnsetScene,
      drawn: Drawn,
      ms: number,
      ease: (p: number) => number,
      mine: number,
    ): Promise<void> {
      const was = before(scene);
      const moves = drawn.rows.map((row) => ({
        row,
        from: poseOf(was, row.lay),
        to: poseOf(scene, row.lay),
        /** 가라앉는 값은 배지를 함께 데려간다. */
        fades: badgeOf(was, row.lay.stand.word) !== null && badgeOf(scene, row.lay.stand.word) === null,
      }));

      return tween(ms, mine, (p) => {
        const e = ease(p);
        for (const move of moves) {
          if (move.fades) move.row.badgeG.setAttribute('opacity', String(r2(1 - e)));
          place(move.row, {
            apexY: lerp(move.from.apexY, move.to.apexY, e),
            footY: move.to.footY.map((y, j) => lerp(move.from.footY[j] ?? y, y, e)),
          });
        }
      });
    }

    /**
     * 칸을 끈다 — 켜져 있던 칠과 1 이 아래로 떨어지고 0 이 위에서 내려앉는다.
     *
     * 덮개는 여기서만 짓는다. 걸음이 끝나면 장면을 다시 세워 노드째 지운다.
     */
    function flowClear(scene: CannotUnsetScene, drawn: Drawn, mine: number): Promise<void> {
      const { cellW, cellCX } = drawn.geom;
      const lids: Array<{ lid: SVGRectElement; ghost: SVGTextElement; digit: SVGTextElement }> = [];

      for (const s of clearedSlots(scene)) {
        const digit = drawn.digits[s];
        if (!digit) continue;
        const lid = node('rect', {
          x: r2(cellCX(s) - cellW / 2 + 1),
          y: CELL_TOP,
          width: r2(cellW - 2),
          height: CELL_H,
          rx: 4,
          fill: colors.primary,
        });
        const ghost = text(
          cellCX(s),
          CELL_TOP + CELL_H / 2 + 5,
          '1',
          fontSizes.md,
          colors.textInverse,
          fonts.mono,
        );
        // 덮개가 맨 아래, 올라오는 0 이 그 위, 떨어지는 1 이 맨 위다. 이미 붙어
        // 있는 노드를 다시 붙이면 그 자리로 옮겨진다.
        gCells.append(lid, digit, ghost);
        lids.push({ lid, ghost, digit });
      }

      return tween(CLEAR_MS, mine, (p) => {
        const e = easeOut(p);
        for (const { lid, ghost, digit } of lids) {
          lid.setAttribute('opacity', String(r2(1 - p)));
          ghost.setAttribute('transform', `translate(0 ${r2(14 * e)})`);
          ghost.setAttribute('opacity', String(r2(1 - p)));
          digit.setAttribute('transform', `translate(0 ${r2(-14 * (1 - e))})`);
          digit.setAttribute('opacity', String(r2(p)));
        }
      });
    }

    /** 다시 물어 답이 뒤집힌다 — 배지가 한 번 튀었다 내려앉으며 글자가 바뀐다. */
    function flowVerdict(scene: CannotUnsetScene, drawn: Drawn, mine: number): Promise<void> {
      const was = before(scene);
      const flips = drawn.rows.filter(
        (row) => badgeOf(was, row.lay.stand.word) !== badgeOf(scene, row.lay.stand.word),
      );
      for (const row of flips) setBadge(row, badgeOf(was, row.lay.stand.word));

      let flipped = false;
      return tween(VERDICT_MS, mine, (p) => {
        for (const row of flips) {
          place(row, poseOf(scene, row.lay), 8 * Math.sin(Math.PI * p));
        }
        if (!flipped && p >= 0.5) {
          flipped = true;
          for (const row of flips) setBadge(row, badgeOf(scene, row.lay.stand.word));
        }
      });
    }

    /**
     * 결론 — 켜진 칸들이 **일제히** 한 번 부풀었다 돌아온다.
     *
     * 얇은 걸음에 얹는 운동은 "얼마나 눈에 띄나" 가 아니라 **그 걸음이 하는 말과
     * 같은 동사인가**로 고른다 (S-piece). 이 걸음이 하는 말은 "칸은 1 이라고만 할
     * 뿐 누가 켰는지는 말하지 않는다" 이고, 남은 1 들이 하나도 다르지 않은 모습으로
     * 함께 움직이는 것이 그 말과 같은 동사다. 이미 서 있던 것이므로 나타나는 꼴이
     * 아니라 부풀었다 돌아오는 꼴이 맞다.
     */
    function flowSettle(scene: CannotUnsetScene, drawn: Drawn, mine: number): Promise<void> {
      const { cellW, cellCX } = drawn.geom;
      const bits = bitsAt(scene);
      const lit: Array<{ tile: SVGRectElement; cx: number }> = [];
      for (let i = 0; i < drawn.tiles.length; i += 1) {
        const tile = drawn.tiles[i];
        if (tile && bits[i] === 1) lit.push({ tile, cx: cellCX(i) });
      }
      if (lit.length === 0) return Promise.resolve();

      return tween(SETTLE_MS, mine, (p) => {
        const pad = SWELL * Math.sin(Math.PI * p);
        for (const { tile, cx } of lit) {
          tile.setAttribute('x', String(r2(cx - cellW / 2 + 1 - pad)));
          tile.setAttribute('y', String(r2(CELL_TOP - pad)));
          tile.setAttribute('width', String(r2(cellW - 2 + pad * 2)));
          tile.setAttribute('height', String(r2(CELL_H + pad * 2)));
        }
      });
    }

    function flowFor(scene: CannotUnsetScene, drawn: Drawn, mine: number): Promise<void> {
      switch (scene.phase) {
        case 'idle':
          // 되감은 직후. 바닥만 남으므로 흐를 것이 없다.
          return Promise.resolve();
        case 'stood':
          return flowStand(scene, drawn, mine);
        case 'asked':
          return flowVerify(scene, drawn, mine);
        case 'picked':
          return flowPose(scene, drawn, SELECT_MS, easeOut, mine);
        case 'cleared':
          return flowClear(scene, drawn, mine);
        /*
         * 셋이 동시에 일어나는 한 뜻의 운동이다 — 지워진 값은 가라앉고, 발밑을 잃은
         * 값은 주저앉고, 꺼진 칸을 밟던 발은 바닥 아래로 빠진다. **시계를 나누지
         * 않는다**: 한 시계로 돌리면 `render` 의 Promise 가 셋 다 선 뒤에 구조적으로
         * 풀려 `void` 로 던질 Promise 자체가 생기지 않는다 (S-scene).
         */
        case 'collapsed':
          return flowPose(scene, drawn, COLLAPSE_MS, easeIn, mine);
        case 'reasked':
          return flowVerdict(scene, drawn, mine);
        case 'settled':
          return flowSettle(scene, drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: CannotUnsetScene,
      _prev: CannotUnsetScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flowFor(next, drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 opacity 가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawScene(next);
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
        svg.textContent = '';
      },
    };
  },
};
