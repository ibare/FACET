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
 * ── `render` 하나로 산다
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render(next, prev, {animate})` 가 그
 * 장면의 화면을 **전량** 세우고, `animate` 일 때만 방금 달라진 것을 흐르게 한다
 * (S-scene). 되짚기는 `animate: false` 로 와서 정적 경로만 지나간다.
 *
 * ── 여럿이 한꺼번에 미끄러진다 — 시계는 하나다
 *
 * 흩기와 모으기는 줄 **전체**가 함께 움직인다. 그것들을 따로 돌리지 않고 옮길
 * 것을 `Move` 한 목록에 모아 한 시계로 흘린다 — 시계가 하나면 `render` 의
 * Promise 가 전부 선 뒤에 저절로 풀리고, `void` 로 던질 Promise 자체가 생기지
 * 않는다. 장부 줄이 떠오르는 것도 같은 시계에 얹는다.
 *
 * ── 채움과 테두리를 갈라 둔다
 *
 * 채움은 **값의 형편** (기본 / 다 섰다), 테두리는 **짚음의 표식** (지금 통에
 * 내려가 자릿수로 짚이는 중). 옮기기 전에는 마침 걸음이 채움과 테두리를 한꺼번에
 * `itemSorted` 로 칠해 두 통로가 하나로 붙어 있었다.
 *
 * ── 지연 발화를 막는 것
 *
 * `opts.animate` 검사와 **세대 빗장** 둘뿐이다. `isInstant`/`onScrubStart` 는
 * 러너가 장면 조각에서 부르지 않으므로 빗장이 되지 못한다 (S-scene).
 *
 * 세로는 장면이 정한다 — 캔버스 `viewBox` 를 정적 그리기가 매번 다시 잡는다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  DigitByDigitCaption,
  DigitByDigitScene,
  DigitByDigitSeat,
} from './scene.js';

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
const FOCUS_MS = 300;
const FLIGHT_MS = 420;
const STAGGER_MS = 55;
const LEDGER_FADE_MS = 220;
/** 마침 걸음 — 한 칸씩 훑으며 다 섰음을 확정한다. */
const SETTLE_MS = 280;
/** 훑고 지나가며 살짝 들렸다 놓이는 높이. */
const SETTLE_LIFT = 5;

const DIM_OPACITY = 0.26;
const LEDGER_DIM_OPACITY = 0.22;

/** 기본 세로 — 수 넷 · 세 자리일 때의 값. 다른 데이터면 장면이 다시 잰다. */
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

/** 자리를 맞춰 보이려고 앞을 0 으로 채운다. 그 전제는 글이 밝힌다 (S-piece). */
function padded(value: number, width: number): string {
  return String(Math.trunc(Math.abs(value))).padStart(width, '0');
}

function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

function clamp01(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

type Pt = { x: number; y: number };

/** 한 수의 DOM 손잡이. 뜻도 수치도 얹지 않는다 — 그것은 전부 장면에 있다. */
type Tile = {
  g: SVGGElement;
  rect: SVGRectElement;
  glyphs: SVGTextElement[];
  /** 보는 자리를 가리키는 막대. 볼 자리가 없으면 짓지 않는다. */
  bar: SVGRectElement | null;
};

type Geometry = {
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

function measure(n: number, width: number): Geometry {
  const count = Math.max(1, n);
  const binW = Math.min(
    BIN_MAX_W,
    Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2 - BIN_GAP * (BIN_COUNT - 1)) / BIN_COUNT),
  );
  const binSpan = binW * BIN_COUNT + BIN_GAP * (BIN_COUNT - 1);
  const binX0 = Math.round((PIECE_CANVAS_W - binSpan) / 2);
  const tileW = Math.min(TILE_MAX_W, binW - TILE_SIDE_PAD);
  const glyphPitch = Math.min(GLYPH_PITCH_MAX, Math.floor((tileW - 8) / width));

  const laneSpan = count * tileW + (count - 1) * LANE_SLOT_GAP;
  const laneX0 = Math.round((PIECE_CANVAS_W - laneSpan) / 2) + tileW / 2;
  const laneX: number[] = [];
  for (let i = 0; i < count; i += 1) laneX.push(laneX0 + i * (tileW + LANE_SLOT_GAP));

  // 통 하나가 수 전부를 받을 수 있어야 한다 — 자릿수가 같으면 그렇게 된다.
  const binBottom = BIN_TOP + BIN_PAD * 2 + (count - 1) * SLOT_PITCH + TILE_H;
  const labelY = binBottom + LABEL_GAP;
  const ledgerTop = labelY + LEDGER_GAP;
  // 장부는 라운드마다 한 줄. 라운드 수는 가장 긴 수의 자릿수와 같다.
  const height = ledgerTop + LEDGER_ROW_PITCH * width + BOTTOM_PAD;

  return {
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

/** 지금 줄 순서. 마지막 장부 줄이 곧 그것이고, 없으면 처음 줄이다. */
function rowOrder(scene: DigitByDigitScene): number[] {
  const last = scene.ledger[scene.ledger.length - 1];
  return last ? [...last.ids] : scene.values.map((_, i) => i);
}

/** 한 번의 정적 그리기가 남긴 것 — 흐르게 할 때 손잡이로 쓴다. */
type Frame = {
  geom: Geometry;
  /** id 로 찾는다. 장면의 id 는 초기 배열에서의 자리다. */
  tiles: Tile[];
  /** id 의 지금 자리. 그리기 전에 한 번에 셈해 둔다. */
  seat: Pt[];
  /** 장부 줄. 마지막 것이 방금 쌓인 줄이다. */
  rows: SVGGElement[];
};

export const digitByDigitStageView: CanvasView = {
  canvas: { height: DEFAULT_HEIGHT },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<DigitByDigitScene> {
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 붙여 준
    // 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 애니메이션 동력 ────────────────────────────────────────────────
    let destroyed = false;
    const frames = new Set<number>();
    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자라다 — 취소된 tick 은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await
     * ctx.emit` 이 영영 돌아오지 않아 unmount 된 뒤에도 알고리즘과 SVG 가 통째로
     * 붙들린다 (S-piece).
     */
    const waiters = new Set<() => void>();

    /** 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다. */
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
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
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

    // ── 켜 ────────────────────────────────────────────────────────────
    const binLayer = el('g');
    const laneLayer = el('g');
    const tileLayer = el('g');
    const ledgerLayer = el('g');
    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_BASE_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    svg.appendChild(binLayer);
    svg.appendChild(laneLayer);
    svg.appendChild(tileLayer);
    svg.appendChild(ledgerLayer);
    svg.appendChild(caption);

    // ── 자리 셈 ────────────────────────────────────────────────────────
    const binCx = (geom: Geometry, bin: number): number =>
      geom.binX0 + bin * (geom.binW + BIN_GAP) + geom.binW / 2;
    const slotCy = (slot: number): number =>
      BIN_TOP + BIN_PAD + TILE_H / 2 + slot * SLOT_PITCH;
    const columnDx = (geom: Geometry, column: number): number =>
      (column - (geom.width - 1) / 2) * geom.glyphPitch;
    const lanePos = (geom: Geometry, k: number): Pt => ({
      x: geom.laneX[k] ?? PIECE_CANVAS_W / 2,
      y: LANE_CY,
    });
    const binPos = (geom: Geometry, seat: DigitByDigitSeat): Pt => ({
      x: binCx(geom, seat.bin),
      y: slotCy(seat.slot),
    });
    const place = (tile: Tile, at: Pt): void => {
      tile.g.setAttribute('transform', `translate(${at.x},${at.y})`);
    };

    // ── 문안 ──────────────────────────────────────────────────────────
    function captionText(what: DigitByDigitCaption | null): string {
      if (!what) return '';
      switch (what.kind) {
        case 'start':
          return tr(
            'caption.start',
            '{count} numbers, out of order — and not one of them gets compared.',
            { count: what.count },
          );
        case 'focus':
          return tr(
            'caption.focus',
            'Pass {round} of {total} — only the {place}s digit is read.',
            { round: what.round, total: what.total, place: what.place },
          );
        case 'scatter':
          return tr(
            'caption.scatter',
            'Each number drops into the bin its {place}s digit names.',
            { place: what.place },
          );
        case 'gather':
          return tr(
            'caption.gather',
            'Bins are read 0 to 9; inside a bin the earlier order is kept.',
          );
        case 'done':
          return tr(
            'caption.done',
            '{rounds} passes, zero comparisons — the row is in order.',
            { rounds: what.rounds },
          );
      }
    }

    // ── 정적 그리기 ────────────────────────────────────────────────────
    /**
     * 그 장면의 화면을 통째로 세운다.
     *
     * 자리를 **먼저 한 번에 셈하고** 그린다 — 그리면서 이웃의 지금 좌표를 재면
     * 순회 순서가 곧 숨은 상태가 된다.
     */
    function drawStatic(scene: DigitByDigitScene): Frame {
      const geom = measure(scene.values.length, scene.width);
      svg.setAttribute('viewBox', `0 0 ${PIECE_CANVAS_W} ${geom.height}`);

      binLayer.textContent = '';
      laneLayer.textContent = '';
      tileLayer.textContent = '';
      ledgerLayer.textContent = '';

      const seat: Pt[] = [];
      const held: number[] = new Array<number>(BIN_COUNT).fill(0);
      if (scene.bins) {
        for (const s of scene.bins) {
          seat[s.id] = binPos(geom, s);
          held[s.bin] = (held[s.bin] ?? 0) + 1;
        }
      } else {
        rowOrder(scene).forEach((id, k) => {
          seat[id] = lanePos(geom, k);
        });
      }

      // 줄이 놓이는 자리.
      const laneLeft = geom.laneX[0] ?? PIECE_CANVAS_W / 2;
      const laneRight = geom.laneX[geom.laneX.length - 1] ?? laneLeft;
      laneLayer.appendChild(
        el('rect', {
          x: laneLeft - geom.tileW / 2 - LANE_PAD,
          y: LANE_TOP,
          width: laneRight - laneLeft + geom.tileW + LANE_PAD * 2,
          height: LANE_H,
          rx: 8,
          fill: colors.bgSubtle,
        }),
      );

      // 통 열 개. 자릿수가 가리키는 통으로 갈 뿐이라 열 개가 늘 다 있다.
      for (let b = 0; b < BIN_COUNT; b += 1) {
        const x = geom.binX0 + b * (geom.binW + BIN_GAP);
        // 담고 있을 때만 물이 든다 — 값의 형편이라 채움으로 말한다. 비어 있으면
        // 짓지 않는다 (숨기기만 하면 앞 걸음의 값이 함께 남는다).
        if ((held[b] ?? 0) > 0) {
          binLayer.appendChild(
            el('rect', {
              x,
              y: BIN_TOP,
              width: geom.binW,
              height: geom.binBottom - BIN_TOP,
              rx: BIN_R,
              fill: colors.bgSubtle,
            }),
          );
        }

        const r = BIN_R;
        binLayer.appendChild(
          el('path', {
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
          }),
        );

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

      // 수. 그리는 차례는 id 순이라 장면이 어떻게 흩어져 있든 같은 순서다.
      const tiles: Tile[] = scene.values.map((value, id) => {
        const tile = buildTile(geom, scene, value);
        tileLayer.appendChild(tile.g);
        place(tile, seat[id] ?? lanePos(geom, id));
        return tile;
      });

      // 장부. 라운드마다 한 줄씩 남는다 — 이 조각의 주장이 쌓이는 자리다.
      const rows = scene.ledger.map((row, i) => {
        const g = buildLedgerRow(geom, scene, row.ids, row.column, row.place, i);
        ledgerLayer.appendChild(g);
        return g;
      });

      caption.textContent = captionText(scene.caption);
      return { geom, tiles, seat, rows };
    }

    function buildTile(geom: Geometry, scene: DigitByDigitScene, value: number): Tile {
      const g = el('g');
      const rect = el('rect', {
        x: -geom.tileW / 2,
        y: -TILE_H / 2,
        width: geom.tileW,
        height: TILE_H,
        rx: TILE_R,
        // 채움은 값의 형편, 테두리는 짚음의 표식. 둘을 겹쳐 쓰지 않는다.
        fill: scene.done ? colors.itemSorted : colors.itemDefault,
        stroke: scene.bins ? colors.accent : colors.border,
        'stroke-width': 1,
      });
      g.appendChild(rect);

      const text = padded(value, geom.width);
      const glyphs: SVGTextElement[] = [];
      for (let j = 0; j < geom.width; j += 1) {
        const lit = scene.column === null || j === scene.column;
        const glyph = el('text', {
          x: columnDx(geom, j),
          y: GLYPH_BASELINE,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: scene.done ? colors.textInverse : colors.text,
          opacity: lit ? 1 : DIM_OPACITY,
          'font-weight': lit && scene.column !== null ? 700 : 400,
        });
        glyph.textContent = text[j] ?? '0';
        g.appendChild(glyph);
        glyphs.push(glyph);
      }

      // 볼 자리가 없으면 막대도 없다.
      let bar: SVGRectElement | null = null;
      if (scene.column !== null) {
        bar = el('rect', {
          x: columnDx(geom, scene.column) - FOCUS_BAR_W / 2,
          y: FOCUS_BAR_Y,
          width: FOCUS_BAR_W,
          height: FOCUS_BAR_H,
          rx: FOCUS_BAR_H / 2,
          fill: colors.accent,
        });
        g.appendChild(bar);
      }

      return { g, rect, glyphs, bar };
    }

    function buildLedgerRow(
      geom: Geometry,
      scene: DigitByDigitScene,
      ids: readonly number[],
      column: number,
      placeValue: number,
      index: number,
    ): SVGGElement {
      const rowY = geom.ledgerTop + LEDGER_ROW_PITCH * index + LEDGER_BASELINE;
      const row = el('g');

      const laneLeft = geom.laneX[0] ?? PIECE_CANVAS_W / 2;
      const tag = el('text', {
        x: laneLeft - geom.tileW / 2 - LEDGER_LABEL_GAP,
        y: rowY,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      tag.textContent = tr('label.placeTag', '{place}s place', { place: placeValue });
      row.appendChild(tag);

      ids.forEach((id, k) => {
        const cx = geom.laneX[k] ?? PIECE_CANVAS_W / 2;
        const text = padded(scene.values[id] ?? 0, geom.width);
        for (let j = 0; j < geom.width; j += 1) {
          const lit = j === column;
          const glyph = el('text', {
            x: cx + columnDx(geom, j),
            y: rowY,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: lit ? colors.text : colors.textMuted,
            opacity: lit ? 1 : LEDGER_DIM_OPACITY,
            'font-weight': lit ? 700 : 400,
          });
          glyph.textContent = text[j] ?? '0';
          row.appendChild(glyph);
        }
      });

      return row;
    }

    // ── 운동 ──────────────────────────────────────────────────────────
    /**
     * 옮길 것 하나. `to` 는 언제나 정적 그리기가 세워 둔 지금 자리다 — 운동은
     * **아직 못 온 만큼을 뒤로 물리는** 꼴로 돈다.
     */
    type Move = { tile: Tile; from: Pt; to: Pt; lead: number };

    /** 한 시계(`total`) 안에서 `lead` 만큼 늦게 출발해 `span` 동안 가는 몫. */
    function leg(t: number, lead: number, span: number, total: number): number {
      return clamp01((t * total - lead) / span);
    }

    /** 흐르게 할 것 하나. 시계 하나와 그 시계가 부르는 손 하나다. */
    type Flow = { duration: number; apply: (t: number) => void };

    /** 줄 전체가 한 시계로 미끄러진다. 나란한 운동을 나눠 돌리지 않는다. */
    function slide(moves: Move[], extra?: (t: number, total: number) => void): Flow {
      const duration = FLIGHT_MS + STAGGER_MS * Math.max(0, moves.length - 1);
      return {
        duration,
        apply: (t: number): void => {
          for (const m of moves) {
            const e = easeInOutCubic(leg(t, m.lead, FLIGHT_MS, duration));
            place(m.tile, {
              x: m.from.x + (m.to.x - m.from.x) * e,
              y: m.from.y + (m.to.y - m.from.y) * e,
            });
          }
          extra?.(t, duration);
        },
      };
    }

    /**
     * 이 걸음에 흐를 것. 없으면 null.
     *
     * 출발 그림은 전부 `next` 에서 되셈한다 — 통에서 올라오는 운동만 그때의 통을
     * 걸음이 표식으로 싣는다. `prev` 는 들추지 않는다 (S-scene).
     */
    function flowFor(scene: DigitByDigitScene, frame: Frame): Flow | null {
      const step = scene.step;
      if (!step) return null;
      const geom = frame.geom;

      switch (step.kind) {
        // 보는 자리가 한 칸 옮겨 간다 — 막대가 미끄러지고 빛도 따라 옮겨 간다.
        case 'focus': {
          const to = scene.column;
          if (to === null) return null;
          // 앞 라운드가 보던 칸. 첫 라운드는 수의 오른쪽 바깥에서 들어온다.
          const prevColumn = scene.ledger[scene.round - 2]?.column;
          const from = prevColumn ?? to + 1;
          const first = prevColumn === undefined;
          const fromX = columnDx(geom, from);
          const toX = columnDx(geom, to);
          return {
            duration: FOCUS_MS,
            apply: (t: number): void => {
              const e = easeInOutCubic(t);
              const x = fromX + (toX - fromX) * e - FOCUS_BAR_W / 2;
              for (const tile of frame.tiles) {
                if (tile.bar) {
                  tile.bar.setAttribute('x', String(x));
                  if (first) tile.bar.setAttribute('opacity', String(e));
                }
                tile.glyphs.forEach((glyph, j) => {
                  // 첫 라운드 앞에서는 전부 또렷했다.
                  const start = first ? 1 : j === from ? 1 : DIM_OPACITY;
                  const end = j === to ? 1 : DIM_OPACITY;
                  glyph.setAttribute('opacity', String(start + (end - start) * e));
                });
              }
            },
          };
        }

        // 줄 전체가 통으로 내려간다. 왼쪽 것부터 차례로 떨어진다.
        case 'scatter': {
          const moves: Move[] = [];
          rowOrder(scene).forEach((id, k) => {
            const tile = frame.tiles[id];
            const to = frame.seat[id];
            if (!tile || !to) return;
            moves.push({ tile, from: lanePos(geom, k), to, lead: k * STAGGER_MS });
          });
          return slide(moves);
        }

        // 통에서 다시 줄로 올라온다. 장부 줄도 같은 시계에 얹는다.
        case 'gather': {
          const wasAt = new Map<number, DigitByDigitSeat>();
          for (const s of step.from) wasAt.set(s.id, s);
          const moves: Move[] = [];
          rowOrder(scene).forEach((id, k) => {
            const tile = frame.tiles[id];
            const to = frame.seat[id];
            const was = wasAt.get(id);
            if (!tile || !to || !was) return;
            moves.push({ tile, from: binPos(geom, was), to, lead: k * STAGGER_MS });
          });
          const row = frame.rows[frame.rows.length - 1];
          return slide(moves, (t, total) => {
            if (!row) return;
            row.setAttribute(
              'opacity',
              String(leg(t, STAGGER_MS * 2, LEDGER_FADE_MS, total)),
            );
          });
        }

        // 마쳤다 — 왼쪽부터 한 칸씩 들렸다 놓이며 다 섰음이 확정된다.
        case 'done': {
          const order = rowOrder(scene);
          const lastColumn = scene.ledger[scene.ledger.length - 1]?.column ?? null;
          const duration = SETTLE_MS + STAGGER_MS * Math.max(0, order.length - 1);
          return {
            duration,
            apply: (t: number): void => {
              order.forEach((id, k) => {
                const tile = frame.tiles[id];
                const at = frame.seat[id];
                if (!tile || !at) return;
                const e = easeInOutCubic(leg(t, k * STAGGER_MS, SETTLE_MS, duration));
                place(tile, { x: at.x, y: at.y - SETTLE_LIFT * Math.sin(Math.PI * e) });
                const settled = e >= 0.5;
                tile.rect.setAttribute(
                  'fill',
                  settled ? colors.itemSorted : colors.itemDefault,
                );
                tile.glyphs.forEach((glyph, j) => {
                  glyph.setAttribute('fill', settled ? colors.textInverse : colors.text);
                  const start = j === lastColumn ? 1 : DIM_OPACITY;
                  glyph.setAttribute('opacity', String(start + (1 - start) * e));
                });
              });
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
      next: DigitByDigitScene,
      /** 출발 자리를 장면에서 되셈하므로 앞 장면을 들추지 않는다. */
      _prev: DigitByDigitScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);
      const frame = drawStatic(next);
      if (!opts.animate) return;

      const flow = flowFor(next, frame);
      if (!flow || flow.duration <= 0) return;

      await animate(flow.duration, my, flow.apply);
      if (!alive(my)) return;
      // 흐르며 남은 보간 끝자리와 덮어쓴 속성을 통째로 거둔다. 정적 경로가 두 번
      // 그려도 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
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
        // 깨어나지 못한 채 멈춘다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        // 캔버스는 러너가 붙인 것이라 걷어내지 않고 안쪽만 비운다 (S-view).
        svg.textContent = '';
      },
    };
  },
};
