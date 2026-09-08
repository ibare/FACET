/**
 * digit-by-digit-stage — 자릿수 정렬 조각의 화면.
 *
 * 세 켜로 나뉜다.
 *   줄(lane)   위쪽. 지금의 줄. 수는 자릿수만큼의 글자 칸으로 그려지고, 이번
 *              라운드가 보는 칸 하나만 또렷하다. 그 칸을 가리키는 막대가
 *              라운드마다 **오른쪽에서 왼쪽으로 옮겨 간다** — 이 조각의 시계다.
 *   통(bins)   가운데. 0..9 열 개. 줄 전체가 통째로 내려갔다가 다시 올라온다.
 *              통 안에서는 들어온 차례대로 위에서 아래로 쌓인다 (안정).
 *   장부       아래. 라운드가 끝날 때마다 그 결과를 한 줄씩 남긴다. 셋이 모두
 *              남아 있어야 "한 자리씩만 봤는데 전체가 줄 선" 누적이 보인다.
 *
 * 값끼리 견주는 장면은 없다. 그래서 값의 크기를 그리지 않는다 — 막대 높이도,
 * 색으로 매긴 등급도 없고, 수는 오직 **자리를 옮길** 뿐이다.
 *
 * 세로는 mount 에서 한 번 정하고 그 뒤로 바꾸지 않는다 (S-view).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const BIN_COUNT = 10;

// ── 세로 좌표. 캡션 · 줄 · 통 · 통 이름표 · 장부 순으로 내려간다.
const CAPTION_BASE_Y = 17;
const LANE_TOP = 30;
const LANE_H = 40;
const LANE_CY = LANE_TOP + LANE_H / 2;
const BIN_TOP = 88;
const BIN_PAD = 6;
const SLOT_PITCH = 26;
const TILE_H = 22;
const LABEL_GAP = 16;
const LEDGER_GAP = 12;
const LEDGER_ROW_PITCH = 26;
const BOTTOM_PAD = 10;

// ── 가로. 통이 캔버스 폭을 채우고, 줄과 장부는 그 안쪽으로 모인다.
const SIDE_MIN = 24;
const BIN_GAP = 3;
const BIN_MAX_W = 64;
const TILE_MAX_W = 52;
const TILE_SIDE_PAD = 6;
const GLYPH_PITCH_MAX = 15;
const LANE_SLOT_GAP = 46;
const LANE_PAD = 14;
const LEDGER_LABEL_GAP = 14;
const LEDGER_BASELINE = 17;
const TILE_R = 4;
const BIN_R = 6;
/** 글자 칸 안에서의 숫자 기준선. 칸 높이 한가운데에 오도록 잡았다. */
const GLYPH_BASELINE = 3.5;
/** 보는 자리를 가리키는 막대. 숫자 바로 아래, 칸 안쪽에 눕는다. */
const FOCUS_BAR_W = 12;
const FOCUS_BAR_H = 2.4;
const FOCUS_BAR_Y = 6;

// ── 걸음 길이. stepMs 가 이 위에 더해지므로 짧게 잡는다 (S-piece).
const FOCUS_MS = 280;
const FLIGHT_MS = 420;
const STAGGER_MS = 55;
const LEDGER_FADE_MS = 220;
const TINT_MS = 240;

const DIM_OPACITY = 0.26;
const LEDGER_DIM_OPACITY = 0.22;

/** 기본 세로 — 수 넷 · 세 자리일 때의 값. 다른 데이터면 mount 에서 다시 잰다. */
const DEFAULT_HEIGHT = 316;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function digitWidth(values: number[]): number {
  let w = 1;
  for (const v of values) {
    const len = String(Math.trunc(Math.abs(v))).length;
    if (len > w) w = len;
  }
  return w;
}

/** 자리를 맞춰 보이려고 앞을 0 으로 채운다. 그 전제는 글이 밝힌다 (S-piece). */
function padded(value: number, width: number): string {
  return String(Math.trunc(Math.abs(value))).padStart(width, '0');
}

function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

type StageTile = {
  id: number;
  g: SVGGElement;
  rect: SVGRectElement;
  glyphs: SVGTextElement[];
  bar: SVGRectElement;
  x: number;
  y: number;
};

type Geometry = {
  n: number;
  width: number;
  binW: number;
  binX0: number;
  tileW: number;
  glyphPitch: number;
  laneX: number[];
  binBottom: number;
  labelY: number;
  ledgerTop: number;
  height: number;
};

function measure(values: number[]): Geometry {
  const n = Math.max(1, values.length);
  const width = digitWidth(values);
  const binW = Math.min(
    BIN_MAX_W,
    Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2 - BIN_GAP * (BIN_COUNT - 1)) / BIN_COUNT),
  );
  const binSpan = binW * BIN_COUNT + BIN_GAP * (BIN_COUNT - 1);
  const binX0 = Math.round((PIECE_CANVAS_W - binSpan) / 2);
  const tileW = Math.min(TILE_MAX_W, binW - TILE_SIDE_PAD);
  const glyphPitch = Math.min(GLYPH_PITCH_MAX, Math.floor((tileW - 8) / width));

  const laneSpan = n * tileW + (n - 1) * LANE_SLOT_GAP;
  const laneX0 = Math.round((PIECE_CANVAS_W - laneSpan) / 2) + tileW / 2;
  const laneX: number[] = [];
  for (let i = 0; i < n; i += 1) laneX.push(laneX0 + i * (tileW + LANE_SLOT_GAP));

  // 통 하나가 수 전부를 받을 수 있어야 한다 — 자릿수가 같으면 그렇게 된다.
  const binBottom = BIN_TOP + BIN_PAD * 2 + (n - 1) * SLOT_PITCH + TILE_H;
  const labelY = binBottom + LABEL_GAP;
  const ledgerTop = labelY + LEDGER_GAP;
  // 장부는 라운드마다 한 줄. 라운드 수는 가장 긴 수의 자릿수와 같다.
  const height = ledgerTop + LEDGER_ROW_PITCH * width + BOTTOM_PAD;

  return {
    n,
    width,
    binW,
    binX0,
    tileW,
    glyphPitch,
    laneX,
    binBottom,
    labelY,
    ledgerTop,
    height,
  };
}

export type DigitByDigitStageInstance = ViewInstance & {
  setup(values: number[]): void;
  setCaption(text: string): void;
  focusPlace(p: { column: number; caption: string }): Promise<void>;
  scatter(p: {
    ids: number[];
    bins: number[];
    slots: number[];
    caption: string;
  }): Promise<void>;
  gather(p: {
    ids: number[];
    column: number;
    place: number;
    caption: string;
  }): Promise<void>;
  finish(caption: string): Promise<void>;
  rewind(): void;
};

export const digitByDigitStageView: CanvasView = {
  canvas: { height: DEFAULT_HEIGHT },

  mount(_container, params): DigitByDigitStageInstance {
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 붙여 준
    // 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    let destroyed = false;
    const frames = new Set<number>();

    const nowMs = (): number =>
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    /**
     * 한 값을 시간에 걸쳐 옮긴다.
     *
     * 스스로 다음 회차를 예약하는 루프라 destroy 에서 반드시 멈춘다 — 프레임 id 를
     * 모아 두고 취소한다 (S-view). rAF 가 없는 환경이면 끝 상태로 즉시 앉힌다.
     */
    const tween = (
      duration: number,
      delay: number,
      apply: (p: number) => void,
    ): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function' || duration <= 0) {
          apply(1);
          resolve();
          return;
        }
        const start = nowMs();
        let handle = 0;
        const tick = (): void => {
          frames.delete(handle);
          if (destroyed) {
            resolve();
            return;
          }
          const elapsed = nowMs() - start;
          if (elapsed >= delay) {
            const p = Math.min(1, (elapsed - delay) / duration);
            apply(easeInOutCubic(p));
            if (p >= 1) {
              resolve();
              return;
            }
          }
          handle = requestAnimationFrame(tick);
          frames.add(handle);
        };
        handle = requestAnimationFrame(tick);
        frames.add(handle);
      });

    /** 아무것도 옮기지 않고 시간만 흘린다 — CSS 전환이 끝날 때까지 기다릴 때. */
    const hold = (ms: number): Promise<void> => tween(1, ms, () => undefined);

    // ── 장면 상태
    let geom = measure([]);
    let values: number[] = [];
    let tiles: StageTile[] = [];
    let binTints: SVGRectElement[] = [];
    let focusColumn = -1;
    let viewBoxFixed = false;

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_BASE_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    const binLayer = el('g');
    const laneLayer = el('g');
    const tileLayer = el('g');
    const ledgerLayer = el('g');
    svg.appendChild(binLayer);
    svg.appendChild(laneLayer);
    svg.appendChild(tileLayer);
    svg.appendChild(ledgerLayer);
    svg.appendChild(caption);

    const binCx = (bin: number): number =>
      geom.binX0 + bin * (geom.binW + BIN_GAP) + geom.binW / 2;
    const slotCy = (slot: number): number =>
      BIN_TOP + BIN_PAD + TILE_H / 2 + slot * SLOT_PITCH;
    const columnDx = (column: number): number =>
      (column - (geom.width - 1) / 2) * geom.glyphPitch;

    const placeTile = (tile: StageTile, x: number, y: number): void => {
      tile.x = x;
      tile.y = y;
      tile.g.setAttribute('transform', `translate(${x},${y})`);
    };

    const moveTile = (
      tile: StageTile,
      x: number,
      y: number,
      delay: number,
    ): Promise<void> => {
      const fromX = tile.x;
      const fromY = tile.y;
      return tween(FLIGHT_MS, delay, (p) => {
        placeTile(tile, fromX + (x - fromX) * p, fromY + (y - fromY) * p);
      });
    };

    const paintGlyphs = (tile: StageTile, column: number): void => {
      tile.glyphs.forEach((glyph, j) => {
        const lit = column < 0 || j === column;
        glyph.style.opacity = lit ? '1' : String(DIM_OPACITY);
        glyph.style.fontWeight = lit && column >= 0 ? '700' : '400';
      });
    };

    const buildTile = (id: number, value: number): StageTile => {
      const g = el('g');
      const rect = el('rect', {
        x: -geom.tileW / 2,
        y: -TILE_H / 2,
        width: geom.tileW,
        height: TILE_H,
        rx: TILE_R,
        stroke: colors.border,
        'stroke-width': 1,
      });
      rect.style.fill = colors.itemDefault;
      rect.style.transition = `fill ${TINT_MS}ms ease, stroke ${TINT_MS}ms ease`;
      g.appendChild(rect);

      const text = padded(value, geom.width);
      const glyphs: SVGTextElement[] = [];
      for (let j = 0; j < geom.width; j += 1) {
        const glyph = el('text', {
          x: columnDx(j),
          y: GLYPH_BASELINE,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        });
        glyph.textContent = text[j] ?? '0';
        glyph.style.fill = colors.text;
        glyph.style.transition = `opacity ${TINT_MS}ms ease, fill ${TINT_MS}ms ease`;
        g.appendChild(glyph);
        glyphs.push(glyph);
      }

      const bar = el('rect', {
        x: columnDx(0) - FOCUS_BAR_W / 2,
        y: FOCUS_BAR_Y,
        width: FOCUS_BAR_W,
        height: FOCUS_BAR_H,
        rx: FOCUS_BAR_H / 2,
        fill: colors.accent,
      });
      bar.style.opacity = '0';
      bar.style.transition = `opacity ${TINT_MS}ms ease`;
      g.appendChild(bar);

      return { id, g, rect, glyphs, bar, x: 0, y: 0 };
    };

    const build = (next: number[]): void => {
      values = [...next];
      geom = measure(values);
      if (!viewBoxFixed) {
        svg.setAttribute('viewBox', `0 0 ${PIECE_CANVAS_W} ${geom.height}`);
        viewBoxFixed = true;
      }

      binLayer.textContent = '';
      laneLayer.textContent = '';
      tileLayer.textContent = '';
      ledgerLayer.textContent = '';
      binTints = [];
      tiles = [];
      focusColumn = -1;

      // 줄이 놓이는 자리.
      const laneLeft = geom.laneX[0] ?? PIECE_CANVAS_W / 2;
      const laneRight = geom.laneX[geom.laneX.length - 1] ?? laneLeft;
      const lane = el('rect', {
        x: laneLeft - geom.tileW / 2 - LANE_PAD,
        y: LANE_TOP,
        width: laneRight - laneLeft + geom.tileW + LANE_PAD * 2,
        height: LANE_H,
        rx: 8,
        fill: colors.bgSubtle,
      });
      laneLayer.appendChild(lane);

      // 통 열 개. 자릿수가 가리키는 통으로 갈 뿐이라 열 개가 늘 다 있다.
      for (let b = 0; b < BIN_COUNT; b += 1) {
        const x = geom.binX0 + b * (geom.binW + BIN_GAP);
        const tint = el('rect', {
          x,
          y: BIN_TOP,
          width: geom.binW,
          height: geom.binBottom - BIN_TOP,
          rx: BIN_R,
          fill: colors.bgSubtle,
        });
        tint.style.opacity = '0';
        tint.style.transition = `opacity ${TINT_MS}ms ease`;
        binLayer.appendChild(tint);
        binTints.push(tint);

        const r = BIN_R;
        const wall = el('path', {
          d:
            `M ${x} ${BIN_TOP} L ${x} ${geom.binBottom - r} ` +
            `Q ${x} ${geom.binBottom} ${x + r} ${geom.binBottom} ` +
            `L ${x + geom.binW - r} ${geom.binBottom} ` +
            `Q ${x + geom.binW} ${geom.binBottom} ${x + geom.binW} ${geom.binBottom - r} ` +
            `L ${x + geom.binW} ${BIN_TOP}`,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1.5,
          'stroke-linejoin': 'round',
        });
        binLayer.appendChild(wall);

        const label = el('text', {
          x: x + geom.binW / 2,
          y: geom.labelY,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        // 통 이름표는 숫자 그 자체 — 옮길 문안이 아니다 (C10).
        label.textContent = String(b);
        binLayer.appendChild(label);
      }

      // 수는 초기 줄 순서대로 앉는다.
      values.forEach((value, i) => {
        const tile = buildTile(i, value);
        tileLayer.appendChild(tile.g);
        placeTile(tile, geom.laneX[i] ?? PIECE_CANVAS_W / 2, LANE_CY);
        tiles.push(tile);
      });
    };

    const appendLedgerRow = (ids: number[], column: number, place: number): SVGGElement => {
      const index = ledgerLayer.childNodes.length;
      const rowY = geom.ledgerTop + LEDGER_ROW_PITCH * index + LEDGER_BASELINE;
      const row = el('g');
      row.style.opacity = '0';

      const laneLeft = geom.laneX[0] ?? PIECE_CANVAS_W / 2;
      const tag = el('text', {
        x: laneLeft - geom.tileW / 2 - LEDGER_LABEL_GAP,
        y: rowY,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      tag.textContent = tr('label.placeTag', '{place}s place', { place });
      row.appendChild(tag);

      ids.forEach((id, k) => {
        const cx = geom.laneX[k] ?? PIECE_CANVAS_W / 2;
        const text = padded(values[id] ?? 0, geom.width);
        for (let j = 0; j < geom.width; j += 1) {
          const glyph = el('text', {
            x: cx + columnDx(j),
            y: rowY,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          });
          glyph.textContent = text[j] ?? '0';
          const lit = j === column;
          glyph.style.fill = lit ? colors.text : colors.textMuted;
          glyph.style.opacity = lit ? '1' : String(LEDGER_DIM_OPACITY);
          glyph.style.fontWeight = lit ? '700' : '400';
          row.appendChild(glyph);
        }
      });

      ledgerLayer.appendChild(row);
      return row;
    };

    const instance: DigitByDigitStageInstance = {
      setup(next: number[]): void {
        build(next);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 보는 자리가 옮겨 간다 — 가리키는 막대가 한 칸 왼쪽으로 미끄러진다. */
      async focusPlace(p): Promise<void> {
        caption.textContent = p.caption;
        const from = focusColumn < 0 ? p.column : focusColumn;
        focusColumn = p.column;
        for (const tile of tiles) {
          paintGlyphs(tile, p.column);
          tile.bar.style.opacity = '1';
        }
        const fromX = columnDx(from);
        const toX = columnDx(p.column);
        await tween(FOCUS_MS, 0, (t) => {
          const x = fromX + (toX - fromX) * t - FOCUS_BAR_W / 2;
          for (const tile of tiles) tile.bar.setAttribute('x', String(x));
        });
      },

      /** 줄 전체가 통으로 내려간다. 견주는 곳은 한 군데도 없다. */
      async scatter(p): Promise<void> {
        caption.textContent = p.caption;
        const flights: Promise<void>[] = [];
        p.ids.forEach((id, k) => {
          const tile = tiles.find((it) => it.id === id);
          const bin = p.bins[k];
          const slot = p.slots[k];
          if (!tile || bin === undefined || slot === undefined) return;
          const tint = binTints[bin];
          if (tint) tint.style.opacity = '1';
          flights.push(moveTile(tile, binCx(bin), slotCy(slot), k * STAGGER_MS));
        });
        await Promise.all(flights);
      },

      /** 통을 0 부터 9 까지 읽어 다시 줄로 올린다. 그 줄이 장부에 남는다. */
      async gather(p): Promise<void> {
        caption.textContent = p.caption;
        const row = appendLedgerRow(p.ids, p.column, p.place);
        const flights: Promise<void>[] = [];
        p.ids.forEach((id, k) => {
          const tile = tiles.find((it) => it.id === id);
          if (!tile) return;
          flights.push(moveTile(tile, geom.laneX[k] ?? tile.x, LANE_CY, k * STAGGER_MS));
        });
        flights.push(
          tween(LEDGER_FADE_MS, STAGGER_MS * 2, (t) => {
            row.style.opacity = String(t);
          }),
        );
        await Promise.all(flights);
        // 다 빠져나간 뒤에 통의 물이 빠진다.
        for (const tint of binTints) tint.style.opacity = '0';
      },

      /** 마지막 자리까지 마쳤다 — 흐려 두었던 자릿수를 모두 돌려준다. */
      async finish(text: string): Promise<void> {
        caption.textContent = text;
        for (const tile of tiles) {
          paintGlyphs(tile, -1);
          tile.bar.style.opacity = '0';
          tile.rect.style.fill = colors.itemSorted;
          tile.rect.style.stroke = colors.itemSorted;
          for (const glyph of tile.glyphs) glyph.style.fill = colors.textInverse;
        }
        await hold(TINT_MS);
      },

      /** advance 로 처음부터 되짚을 때. 화면을 초기 상태로 되돌린다. */
      rewind(): void {
        ledgerLayer.textContent = '';
        focusColumn = -1;
        for (const tint of binTints) tint.style.opacity = '0';
        tiles.forEach((tile) => {
          paintGlyphs(tile, -1);
          tile.bar.style.opacity = '0';
          tile.rect.style.fill = colors.itemDefault;
          tile.rect.style.stroke = colors.border;
          for (const glyph of tile.glyphs) glyph.style.fill = colors.text;
          placeTile(tile, geom.laneX[tile.id] ?? tile.x, LANE_CY);
        });
        caption.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') {
          for (const handle of frames) cancelAnimationFrame(handle);
        }
        frames.clear();
        // 캔버스는 러너가 붙인 것이라 걷어내지 않고 안쪽만 비운다. 스스로 다음
        // 회차를 예약하는 tween 루프는 destroyed 플래그로 멈춘다 (S-view).
        svg.textContent = '';
      },
    };

    const initialValues = params.initialData?.values;
    if (Array.isArray(initialValues)) {
      build(initialValues.filter((v): v is number => typeof v === 'number'));
    } else {
      build([]);
    }

    return instance;
  },
};
