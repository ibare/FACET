/**
 * 자리값과 진법 무대 — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 그림의 뼈대
 *
 * 네 줄이 **모두 같은 폭**을 차지한다. 그것이 이 그림의 주장이다 — 밑이 바뀌어도
 * 길이는 그대로이고, 길이가 그대로라는 것이 같은 수라는 뜻이다. 줄마다 다른
 * 것은 그 폭을 몇 조각으로 끊었느냐뿐이다.
 *
 *   10   한 덩이. 쪼개진 뒤에는 빈 테두리로 남고, 켜진 자리의 합이 그 자리를
 *        다시 채운다.
 *    2   여덟 조각. 자리값과 비트.
 *    8   셋씩 끊은 세 조각.
 *   16   넷씩 끊은 두 조각.
 *
 * **8진 줄과 16진 줄은 제 줄에 따로 선다.** 이 조각의 결론이 "같은 비트를 넷씩
 * 묶으면 16진, 셋씩 묶으면 8진" 이므로 두 묶음이 완주 화면에 나란히 남아 견줘져야
 * 한다. 뒤의 묶기가 앞의 묶기를 덮는 자리를 만들지 않는다.
 *
 * ── 칠의 축을 가른다 (S-scene · 프로토콜 4 절)
 *
 *   채움   = **값의 형편** — 이 비트가 1 인가 (`itemActive`) 0 인가 (`itemDefault`).
 *            켜진 자리에서 올라온 합의 칩도 같은 채움을 쓴다.
 *   테두리 = **표식** — 10진 자리가 비었나 (점선) 합으로 다시 찼나 (실선),
 *            그리고 끝의 양 끝 세로선 ("네 줄의 길이가 같다").
 *
 * 묶음은 칠을 다투지 않는다. 제 줄의 **자리**로 말하므로 비트 칸의 채움도
 * 테두리도 건드리지 않는다 — 한 축에 값을 셋 이상 욱여넣는 자리가 없다.
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 네 줄은 이미 끝 자리에 서 있다. 걸음은 **아직 못 온
 * 만큼을 뒤로 물려** 두었다가 놓아 준다 — 덩이가 갈라져 내려앉고, 값이 떠올라
 * 식이 되고, 같은 폭이 다시 내려와 다르게 끊긴다. 한 국면의 운동은 한 뜻으로
 * 묶여 있으므로 **시계를 나누지 않고** 한 보간에 함께 싣는다 (S-scene).
 *
 * 출발 그림은 `prev` 가 아니라 장면의 `phase` 와 `factsOf` 에서 셈한다. 그래서
 * `render` 가 `prev` 를 아예 들추지 않는다 (S-scene MUST).
 *
 * 세로는 그림이 정해 여기 상수로 둔다. 가로는 러너가 준다 (S-view).
 * 진법 표식(10 · 2 · 8 · 16)과 자릿수 · 연산 기호는 수식 표기라 번역하지 않는다
 * (C10 표식 판정 3). 문장인 캡션만 `params.t` 로 만든다.
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
  droppedOf,
  factsOf,
  phaseRank,
  type PositionalValueScene,
} from './scene.js';
import type { PositionalGrouping, PositionalValueFacts } from './algorithm.js';

const NS = 'http://www.w3.org/2000/svg';

/** 세로. 네 줄과 캡션이 정한 값이며 마운트한 뒤 바뀌지 않는다 (S-view). */
const H = 280;
const SIDE = 24;
/** 왼쪽 진법 표식이 서는 칸. */
const GUTTER = 30;
/** 칸 하나의 상한. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 74;
/** 끊긴 자리에 생기는 틈. */
const GAP = 8;
/** 켜진 자리가 들리는 높이. */
const LIFT = 6;

type Row = { y: number; h: number };
const ROW_TEN: Row = { y: 18, h: 44 };
const ROW_TWO: Row = { y: 80, h: 52 };
const ROW_OCT: Row = { y: 150, h: 40 };
const ROW_HEX: Row = { y: 200, h: 40 };
const CAPTION_Y = 262;

const CHIP_H = 26;
const OP_W = 18;
const EQ_W = 22;

/** 국면마다의 운동 길이. */
const MS_WHOLE = 320;
const MS_SPLIT = 560;
const MS_MARK = 280;
const MS_SUM = 640;
const MS_CUT = 560;
const MS_ALIGN = 520;

/**
 * 진법 표식. 밑을 가리키는 수식 표기이므로 번역하지 않는다 (C10 표식 판정 3).
 */
const RADIX_TEN = '10';
const RADIX_TWO = '2';
const RADIX_OCT = '8';
const RADIX_HEX = '16';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2);
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 칩 폭 — 글자 수에서 역산한다. */
const chipW = (v: number): number => 16 + 9 * String(v).length;

function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function label(
  s: string,
  x: number,
  y: number,
  size: string,
  fill: string,
  family: string,
): SVGElement {
  const node = el('text', {
    x,
    y,
    'text-anchor': 'middle',
    'font-family': family,
    'font-size': size,
    fill,
  });
  node.textContent = s;
  return node;
}

/**
 * 캔버스에서 역산한 자리. 장면이 좌표를 담지 않으므로 그리는 쪽이 매번 셈한다
 * (S-piece). 이름을 `Geom` 으로 두어 장면 타입과 부딪히지 않게 한다.
 */
type Geom = { cellW: number; spanW: number; originX: number };

/** 비트 칸 하나의 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Cell = { g: SVGElement; rect: SVGElement; place: SVGElement; bit: SVGElement };

/** 합의 식으로 날아오는 칩 하나. 출발 자리는 켜진 자리에서 셈한다. */
type Chip = { g: SVGElement; fromX: number; toX: number };

/** 끊긴 묶음 하나. */
type Piece = { g: SVGElement; rect: SVGElement; text: SVGElement; at: number; size: number };

type SumDrawn = { chips: Chip[]; glue: SVGElement[]; fromY: number; toY: number };
type GroupDrawn = { pieces: Piece[]; row: Row };

/** 정적 그리기가 세워 둔 손잡이. */
type Drawn = {
  geom: Geom;
  facts: PositionalValueFacts;
  /** 국면의 차례. -1 이면 아직 아무 걸음도 밟지 않았다. */
  rank: number;
  /** 10진 자리의 테두리. 걸음이 섰으면 언제나 있다. */
  ten: SVGElement | null;
  /** 한 덩이로 선 수. `whole` 국면에만 있다. */
  tenNum: SVGElement | null;
  cells: Cell[];
  sum: SumDrawn | null;
  octal: GroupDrawn | null;
  hex: GroupDrawn | null;
  guide: SVGElement[];
};

export const positionalValueStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<PositionalValueScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const W = PIECE_CANVAS_W;

    // ── 그림의 층위. 넷 다 걸음마다 통째로 다시 세운다. 고정 자리에 남는 요소를
    //    하나도 두지 않으므로 "재건 밖 요소" 가 없다 (S-scene).
    const gRows = el('g', {});
    const gFly = el('g', {});
    const gGuide = el('g', {});
    const gCaption = el('g', {});
    svg.appendChild(gRows);
    svg.appendChild(gFly);
    svg.appendChild(gGuide);
    svg.appendChild(gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 되짚기나 unmount 가 끼어들면
     * 남은 프레임이 **이미 새로 선 화면**을 덮을 수 있으므로, 프레임마다 자기
     * 번호가 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는
     * 장면 조각에서 그것을 부르지 않는다 (S-scene).
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
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을
          // 덮는 길을 여기서 끊는다.
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

    function geomOf(scene: PositionalValueScene): Geom {
      const width = Math.max(1, scene.bitWidth);
      const usable = W - SIDE * 2 - GUTTER;
      const cellW = Math.min(CELL_MAX_W, Math.floor(usable / width));
      const spanW = cellW * width;
      return { cellW, spanW, originX: SIDE + GUTTER + Math.round((usable - spanW) / 2) };
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    function radix(mark: string, row: Row, geom: Geom): void {
      const node = label(
        mark,
        geom.originX - 10,
        row.y + row.h / 2 + 4,
        fontSizes.xs,
        c.textMuted,
        fonts.mono,
      );
      node.setAttribute('text-anchor', 'end');
      gRows.appendChild(node);
    }

    /**
     * 10진 자리. 한 덩이일 때는 채워져 있고, 쪼개진 뒤에는 빈 테두리(점선)로
     * 남았다가, 합이 올라와 다시 차면 실선이 된다.
     *
     * **테두리가 표식의 축**이다 — 채움은 값의 형편만 말한다.
     */
    function drawTen(scene: PositionalValueScene, geom: Geom, rank: number): {
      ten: SVGElement | null;
      tenNum: SVGElement | null;
    } {
      if (rank < 0) return { ten: null, tenNum: null };
      radix(RADIX_TEN, ROW_TEN, geom);

      const whole = rank === phaseRank('whole');
      const filled = rank >= phaseRank('summed');
      const box = el('rect', {
        x: geom.originX,
        y: ROW_TEN.y,
        width: geom.spanW,
        height: ROW_TEN.h,
        rx: 6,
        fill: whole ? c.bgSubtle : 'none',
        stroke: whole || filled ? c.border : c.ghostOutline,
        'stroke-width': 1,
      });
      if (!whole && !filled) box.setAttribute('stroke-dasharray', '4 4');
      gRows.appendChild(box);

      if (!whole) return { ten: box, tenNum: null };
      const num = label(
        String(scene.value),
        geom.originX + geom.spanW / 2,
        ROW_TEN.y + ROW_TEN.h / 2 + 7,
        fontSizes.xl,
        c.text,
        fonts.mono,
      );
      gRows.appendChild(num);
      return { ten: box, tenNum: num };
    }

    /** 비트 줄. 켜진 자리는 물들고 들려 있다 — 채움이 값의 형편이다. */
    function drawCells(facts: PositionalValueFacts, geom: Geom, rank: number): Cell[] {
      if (rank < phaseRank('places')) return [];
      radix(RADIX_TWO, ROW_TWO, geom);

      const marked = rank >= phaseRank('marked');
      const w = geom.cellW - GAP;
      const cells: Cell[] = [];
      facts.bits.forEach((bitValue, i) => {
        const on = marked && bitValue === 1;
        const y = ROW_TWO.y - (on ? LIFT : 0);
        const g = el('g', {
          transform: `translate(${geom.originX + i * geom.cellW + GAP / 2},${y})`,
        });
        const rect = el('rect', {
          x: 0,
          y: 0,
          width: w,
          height: ROW_TWO.h,
          rx: 4,
          fill: on ? c.itemActive : c.itemDefault,
          stroke: on ? c.itemActive : c.border,
          'stroke-width': 1,
        });
        const place = label(
          String(facts.places[i]),
          w / 2,
          ROW_TWO.h * 0.32,
          fontSizes.xs,
          on ? c.stateInk : c.textMuted,
          fonts.mono,
        );
        const bit = label(
          String(bitValue),
          w / 2,
          ROW_TWO.h * 0.78,
          fontSizes.xl,
          on ? c.stateInk : c.text,
          fonts.mono,
        );
        g.appendChild(rect);
        g.appendChild(place);
        g.appendChild(bit);
        gRows.appendChild(g);
        cells.push({ g, rect, place, bit });
      });
      return cells;
    }

    /**
     * 켜진 자리의 값이 올라와 선 식. 칩의 출발 자리는 켜진 자리의 번호에서
     * 셈하므로 화면을 되읽거나 거울을 두지 않는다.
     */
    function drawSum(facts: PositionalValueFacts, geom: Geom, rank: number): SumDrawn | null {
      if (rank < phaseRank('summed')) return null;

      const numText = String(facts.sum);
      const numW = 12 + 11 * numText.length;
      const midY = ROW_TEN.y + ROW_TEN.h / 2;

      let total = EQ_W + numW + OP_W * Math.max(0, facts.addends.length - 1);
      for (const v of facts.addends) total += chipW(v);

      const chips: Chip[] = [];
      const glue: SVGElement[] = [];
      const fromY = ROW_TWO.y - LIFT + (ROW_TWO.h - CHIP_H) / 2;
      const toY = midY - CHIP_H / 2;

      let x = geom.originX + (geom.spanW - total) / 2;
      facts.addends.forEach((v, k) => {
        const w = chipW(v);
        const index = facts.onIndices[k] ?? 0;
        const centerX = geom.originX + index * geom.cellW + geom.cellW / 2;
        const g = el('g', { transform: `translate(${x},${toY})` });
        g.appendChild(
          el('rect', {
            x: 0,
            y: 0,
            width: w,
            height: CHIP_H,
            rx: 4,
            fill: c.itemActive,
            stroke: c.itemActive,
          }),
        );
        g.appendChild(label(String(v), w / 2, CHIP_H / 2 + 4, fontSizes.sm, c.stateInk, fonts.mono));
        gFly.appendChild(g);
        chips.push({ g, fromX: centerX - w / 2, toX: x });

        x += w;
        if (k < facts.addends.length - 1) {
          glue.push(label('+', x + OP_W / 2, midY + 5, fontSizes.md, c.textMuted, fonts.mono));
          x += OP_W;
        }
      });

      glue.push(label('=', x + EQ_W / 2, midY + 5, fontSizes.md, c.textMuted, fonts.mono));
      x += EQ_W;
      glue.push(label(numText, x + numW / 2, midY + 7, fontSizes.xl, c.text, fonts.mono));
      for (const node of glue) gFly.appendChild(node);

      return { chips, glue, fromY, toY };
    }

    /**
     * 같은 폭을 다르게 끊은 줄 하나.
     *
     * 앞의 0 은 떼어 읽는 자리임을 흐린 글자로 둔다. 몇 글자를 떼는지는
     * `droppedOf` 하나가 정한다 — 화면과 캡션이 같은 잣대를 지난다.
     */
    function drawGroup(
      group: PositionalGrouping,
      row: Row,
      mark: string,
      geom: Geom,
    ): GroupDrawn {
      radix(mark, row, geom);
      const dropped = droppedOf(group);

      const pieces: Piece[] = [];
      let at = 0;
      group.sizes.forEach((size, k) => {
        const digit = group.digits[k] ?? '';
        const g = el('g', {
          transform: `translate(${geom.originX + at * geom.cellW + GAP / 2},${row.y})`,
        });
        const w = size * geom.cellW - GAP;
        const rect = el('rect', {
          x: 0,
          y: 0,
          width: w,
          height: row.h,
          rx: 4,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1,
        });
        const text = label(
          digit,
          w / 2,
          row.h * 0.64,
          fontSizes.lg,
          k < dropped ? c.textMuted : c.text,
          fonts.mono,
        );
        g.appendChild(rect);
        g.appendChild(text);
        gRows.appendChild(g);
        pieces.push({ g, rect, text, at, size });
        at += size;
      });
      return { pieces, row };
    }

    /** 네 줄의 양 끝을 잇는 선. 길이가 같다는 것이 이 조각의 결론이다. */
    function drawGuide(geom: Geom, rank: number): SVGElement[] {
      if (rank < phaseRank('aligned')) return [];
      const top = ROW_TEN.y - 6;
      const bottom = ROW_HEX.y + ROW_HEX.h + 6;
      // 둥근 끝을 쓰지 않는다 — 길이가 0 인 첫 프레임에 점 둘로 찍힌다 (프로토콜 4 절).
      return [geom.originX, geom.originX + geom.spanW].map((x) => {
        const line = el('line', {
          x1: x,
          y1: top,
          x2: x,
          y2: bottom,
          stroke: c.accent,
          'stroke-width': 2,
        });
        gGuide.appendChild(line);
        return line;
      });
    }

    /** 캡션. 국면이 무엇을 말할지 가르고 문자는 여기서 만든다 (C10). */
    function drawCaption(scene: PositionalValueScene, facts: PositionalValueFacts): void {
      const text = captionText(scene, facts);
      if (text === '') return;
      gCaption.appendChild(label(text, W / 2, CAPTION_Y, fontSizes.sm, c.textMuted, fonts.body));
    }

    function captionText(scene: PositionalValueScene, facts: PositionalValueFacts): string {
      switch (scene.phase) {
        case 'whole':
          return t('caption.one', 'A single number: {value}.', { value: scene.value });
        case 'places':
          return t(
            'caption.places',
            'Cut it into places — each place is worth twice the one on its right.',
          );
        case 'marked':
          return t('caption.on', 'The places that are on: {places}.', {
            places: facts.addends.join(', '),
          });
        case 'summed':
          return t('caption.sum', 'Add the on places and the number comes back: {sum}.', {
            sum: facts.sum,
          });
        case 'octal':
          return t('caption.three', 'Cut the same bits three at a time — base 8 reads {reading}.', {
            reading: facts.three.reading,
          });
        case 'hex':
          return t('caption.four', 'Cut them four at a time — base 16 reads {reading}.', {
            reading: facts.four.reading,
          });
        case 'aligned':
          return t('caption.same', 'Three notations, one length, one number: {value}.', {
            value: scene.value,
          });
        default:
          return '';
      }
    }

    /** 장면이 말하는 것을 전부 세운다. 어느 걸음에서 오든 결과가 같다. */
    function drawScene(scene: PositionalValueScene): Drawn {
      gRows.textContent = '';
      gFly.textContent = '';
      gGuide.textContent = '';
      gCaption.textContent = '';

      const geom = geomOf(scene);
      const facts = factsOf(scene);
      const rank = scene.phase === null ? -1 : phaseRank(scene.phase);

      const { ten, tenNum } = drawTen(scene, geom, rank);
      const cells = drawCells(facts, geom, rank);
      const sum = drawSum(facts, geom, rank);
      const octal =
        rank >= phaseRank('octal') ? drawGroup(facts.three, ROW_OCT, RADIX_OCT, geom) : null;
      const hex = rank >= phaseRank('hex') ? drawGroup(facts.four, ROW_HEX, RADIX_HEX, geom) : null;
      const guide = drawGuide(geom, rank);
      drawCaption(scene, facts);

      return { geom, facts, rank, ten, tenNum, cells, sum, octal, hex, guide };
    }

    // ── 국면마다의 운동 ───────────────────────────────────────────────────

    /** 덩이가 가운데서 좌우로 벌어지며 제 폭을 차지한다. */
    function flowWhole(d: Drawn, mine: number): Promise<void> {
      const { ten, tenNum, geom } = d;
      if (ten === null) return Promise.resolve();
      return tween(MS_WHOLE, mine, (t0) => {
        const p = ease(t0);
        const w = Math.max(2, geom.spanW * p);
        ten.setAttribute('x', String(geom.originX + (geom.spanW - w) / 2));
        ten.setAttribute('width', String(w));
        if (tenNum) tenNum.setAttribute('opacity', String(clamp01(p * 2 - 1)));
      });
    }

    /**
     * 덩이가 자리마다 하나씩 쪼개져 내려앉는다.
     *
     * 조각은 덩이가 있던 그 자리에서 그 크기로 물려 두었다가 놓아 준다 — 처음 한
     * 칸은 덩이와 완전히 겹치므로, 내려앉으며 왼쪽부터 차례로 틈이 벌어지는
     * 것만 보인다. 떠나는 수는 **운동 중에만** 짓는다. 정지 화면에는 없는
     * 요소라 정적 경로가 되돌릴 일이 생기지 않는다 (프로토콜 4 절).
     */
    function flowSplit(d: Drawn, scene: PositionalValueScene, mine: number): Promise<void> {
      const { geom, ten, cells } = d;
      const leaving = label(
        String(scene.value),
        geom.originX + geom.spanW / 2,
        ROW_TEN.y + ROW_TEN.h / 2 + 7,
        fontSizes.xl,
        c.text,
        fonts.mono,
      );
      gFly.appendChild(leaving);

      return tween(MS_SPLIT, mine, (t0) => {
        const drop = ease(clamp01(t0 / 0.62));
        const y = lerp(ROW_TEN.y, ROW_TWO.y, drop);
        const h = lerp(ROW_TEN.h, ROW_TWO.h, drop);
        leaving.setAttribute('opacity', String(clamp01(1 - t0 * 4)));
        if (ten) ten.setAttribute('opacity', String(clamp01(t0 * 2.2 - 0.2)));

        cells.forEach((cell, i) => {
          // 왼쪽부터 차례로 갈라진다 — 칼이 지나가는 순서다.
          const slice = ease(clamp01((t0 - 0.26 - i * 0.035) / 0.42));
          const x = geom.originX + i * geom.cellW + (GAP / 2) * slice;
          const w = geom.cellW - GAP * slice;
          cell.g.setAttribute('transform', `translate(${x},${y})`);
          cell.rect.setAttribute('width', String(w));
          cell.rect.setAttribute('height', String(h));
          cell.place.setAttribute('x', String(w / 2));
          cell.place.setAttribute('y', String(h * 0.32));
          cell.place.setAttribute('opacity', String(slice));
          cell.bit.setAttribute('x', String(w / 2));
          cell.bit.setAttribute('y', String(h * 0.78));
          cell.bit.setAttribute('opacity', String(slice));
        });
      });
    }

    /** 켜진 자리가 들린다. 물드는 것은 정적 그리기가 이미 했다 — 색이 곧 값이다. */
    function flowMark(d: Drawn, mine: number): Promise<void> {
      const { geom, facts, cells } = d;
      const lifted = facts.onIndices.flatMap((i) => {
        const cell = cells[i];
        return cell === undefined ? [] : [{ cell, index: i }];
      });
      if (lifted.length === 0) return Promise.resolve();

      return tween(MS_MARK, mine, (t0) => {
        const p = ease(t0);
        for (const { cell, index } of lifted) {
          const x = geom.originX + index * geom.cellW + GAP / 2;
          cell.g.setAttribute('transform', `translate(${x},${ROW_TWO.y - LIFT * p})`);
        }
      });
    }

    /**
     * 켜진 자리의 값이 떠올라 식이 되고, 덩이가 떠난 자리를 다시 채운다.
     *
     * 채워지는 것은 **테두리**로 말한다 — 점선이던 자리가 실선이 된다.
     */
    function flowSum(d: Drawn, mine: number): Promise<void> {
      const { sum, ten } = d;
      if (sum === null) return Promise.resolve();

      return tween(MS_SUM, mine, (t0) => {
        const p = ease(t0);
        for (const chip of sum.chips) {
          chip.g.setAttribute(
            'transform',
            `translate(${lerp(chip.fromX, chip.toX, p)},${lerp(sum.fromY, sum.toY, p)})`,
          );
        }
        const show = String(clamp01((t0 - 0.6) / 0.3));
        for (const node of sum.glue) node.setAttribute('opacity', show);

        if (ten === null) return;
        if (t0 < 0.7) {
          ten.setAttribute('stroke', c.ghostOutline);
          ten.setAttribute('stroke-dasharray', '4 4');
        } else {
          // 끝에서는 보간값이 아니라 목표값을 그대로 쓴다 (프로토콜 4 절).
          ten.setAttribute('stroke', c.border);
          ten.removeAttribute('stroke-dasharray');
        }
      });
    }

    /**
     * 같은 폭을 다시 가져와 다르게 끊는다.
     *
     * 조각은 비트 줄 위에서 그 칸들을 덮은 채 물려 두었다가 놓아 준다 — 어느
     * 비트가 한 묶음이 되는지가 출발 자리로 드러나고, 내려앉으며 끊긴 자리에
     * 틈이 벌어진다.
     */
    function flowCut(group: GroupDrawn | null, geom: Geom, mine: number): Promise<void> {
      if (group === null) return Promise.resolve();
      const target = group.row;
      return tween(MS_CUT, mine, (t0) => {
        const drop = ease(clamp01(t0 / 0.62));
        const y = lerp(ROW_TWO.y, target.y, drop);
        const h = lerp(ROW_TWO.h, target.h, drop);
        group.pieces.forEach((p, k) => {
          const slice = ease(clamp01((t0 - 0.26 - k * 0.05) / 0.42));
          const x = geom.originX + p.at * geom.cellW + (GAP / 2) * slice;
          const w = p.size * geom.cellW - GAP * slice;
          p.g.setAttribute('transform', `translate(${x},${y})`);
          p.rect.setAttribute('width', String(w));
          p.rect.setAttribute('height', String(h));
          p.text.setAttribute('x', String(w / 2));
          p.text.setAttribute('y', String(h * 0.64));
        });
      });
    }

    /** 양 끝 선이 위에서 아래로 내려온다. */
    function flowAlign(d: Drawn, mine: number): Promise<void> {
      if (d.guide.length === 0) return Promise.resolve();
      const top = ROW_TEN.y - 6;
      const bottom = ROW_HEX.y + ROW_HEX.h + 6;
      return tween(MS_ALIGN, mine, (t0) => {
        const y = lerp(top, bottom, ease(t0));
        for (const line of d.guide) line.setAttribute('y2', String(y));
      });
    }

    function flowFor(d: Drawn, scene: PositionalValueScene, mine: number): Promise<void> {
      switch (scene.phase) {
        case 'whole':
          return flowWhole(d, mine);
        case 'places':
          return flowSplit(d, scene, mine);
        case 'marked':
          return flowMark(d, mine);
        case 'summed':
          return flowSum(d, mine);
        case 'octal':
          return flowCut(d.octal, d.geom, mine);
        case 'hex':
          return flowCut(d.hex, d.geom, mine);
        case 'aligned':
          return flowAlign(d, mine);
        default:
          return Promise.resolve();
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: PositionalValueScene,
      _prev: PositionalValueScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      await flowFor(drawn, next, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 물려 둔 조각·떠나는 수가 노드째 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
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
