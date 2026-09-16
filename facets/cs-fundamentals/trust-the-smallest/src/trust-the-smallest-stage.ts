/**
 * trust-the-smallest stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ## 형태가 어디서 나왔는가
 *
 * 동사는 **가라앉는다**. 그래서 화면의 아래쪽 절반이 통째로 **자(meter)** 다.
 * 위에는 표가 있고, 키를 물으면 세 줄에서 읽은 값이 칸에서 떠올라 자의 꼭대기로
 * 간 다음 **제 높이까지 가라앉는다**. 큰 값은 덜 내려가고 작은 값은 더 내려간다.
 * 그 뒤 답 선이 가장 높은 값에서 출발해 **가장 낮은 값까지 내려앉는다.**
 *
 * 참값은 같은 자 위에 점선으로 깔려 있다. 견줄 값이 있으므로 잰 값을 자로 옮기는
 * 것이 정당하고, 견줌의 기준이 같은 계기 위에 있다 (S-piece PREFER).
 * 답 선이 점선 위에 내려앉거나 그보다 위에 멈추는 것 — 결코 아래로 내려가지
 * 않는 것 — 이 이 조각이 하는 말 전부다.
 *
 * ## 옛 stage 가 화면에만 적어 두던 것
 *
 * 표의 값은 `textContent` 에, 자의 눈금은 `let scaleMax` 에, 물어본 답은
 * `const results` 에, 짚은 칸의 형편은 `rect` 의 `stroke` 에 있었다. 이제
 * `table` · `shares` · `touch` · `probe` · `answers` · `finished` 가 말하므로
 * **정적 그리기가 그것을 통째로 세운다** — 되짚어 그 걸음에 가도 표와 자와 앉은
 * 답이 그대로 선다 (`scene.ts` 의 "다섯 자리").
 *
 * ## 화면에 나란히 뜨는 수는 한 함수를 지난다
 *
 * 칸 값은 `valueAt`, 최솟값은 `minOf`, 참값은 `truthOf`, 자의 꼭대기는
 * `scaleMaxOf`. 캡션의 수와 자에 그려지는 높이가 같은 함수에서 나오므로 갈릴
 * 자리가 없다. 걸음이 실어 오던 `min` · `truth` · `value` · `keys` 는 장면이 이미
 * 버렸으므로 여기 올 길이 없다.
 *
 * ## 갈라 둔 두 칠
 *
 * **채움은 값의 형편**(빈 칸 / 값이 있는 칸 / 남의 셈까지 이고 있는 칸),
 * **테두리는 짚음의 표식**(지금 올린 칸 / 지금 읽은 칸). 나눠 쓰는 칸의 채움은
 * 부푼 몫과 같은 잉크라, 부푼 띠가 뜰 때 그 원인이 위 표에 그대로 보인다.
 *
 * 세로는 그림이 정하는 값이라 이 파일이 상수로 갖는다. 가로는 러너가 정한다
 * (S-piece). 색은 전부 design-tokens 경유다 (S-view).
 *
 * 화면의 `stream` · `sketch` · `c0` · `r0` 는 도식에 새긴 표식이라 번역하지 않는다
 * (C10). 문장인 캡션은 `params.t` 로 만든다.
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
  answerFor,
  isInflated,
  isShared,
  maxOf,
  minOf,
  scaleMaxOf,
  sharesAt,
  truthOf,
  valueAt,
  type TrustTheSmallestScene,
} from './scene.js';

// ── 세로. 표 띠와 자의 높이가 이 그림의 값이다.
const STAGE_W = PIECE_CANVAS_W;
const STAGE_H = 368;

const CHIP_Y = 16;
const CHIP_H = 24;
const CHIP_GAP = 8;
const CHIP_MAX_W = 108;

const COL_TAG_Y = 58;
const TABLE_Y = 64;
/** 표가 앉는 띠. 줄이 더 많아지면 높이를 늘리지 않고 줄 간격을 줄여 담는다 (S-view). */
const TABLE_BAND_H = 126;
const ROW_MAX_H = 42;

/** 자의 꼭대기 = 표에서 가장 큰 값. 바닥 = 0. */
const AXIS_TOP = 216;
const AXIS_BASE = 322;
/** 자가 눕는 폭. 이름표가 양 끝 밖에 앉으므로 그만큼만 남기고 넓게 쓴다 (S-piece). */
const LANE_L = 88;
const LANE_R = 508;

const CAPTION_Y = 352;

/** 좌우 최소 여백 — 이름표가 앉는 자리. 칸 크기는 여기서 역산한다 (S-piece). */
const SIDE_MIN = 46;
const CELL_MAX_W = 112;

const TOKEN_W = 46;
const TOKEN_H = 20;

// ── 걸음의 길이. 걸음 벽시계는 여기에 `stepMs` 가 더해진 값이다 (S-piece).
/** 알갱이가 칩에서 칸으로 내려앉는 데까지. */
const FLY_MS = 240;
const INGEST_MS = 300;

/** 참값 점선을 깔고 읽은 칸을 밝히는 동안. */
const HOLD_MS = 140;
/** 읽은 값이 칸에서 자의 꼭대기로 떠오른다. */
const RISE_MS = 230;
/** 제 높이까지 가라앉는다. */
const SINK_MS = 230;
/** 답 선이 가장 높은 값에서 가장 낮은 값까지 내려앉는다. */
const DROP_MS = 240;
const PROBE_MS = HOLD_MS + RISE_MS + SINK_MS + DROP_MS;

/** 결론 띠가 칩 줄을 훑는다. */
const SWEEP_MS = 260;
const VERDICT_MS = 320;

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeInOut = (p: number): number => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 정적 그리기가 셈한 자리. 장면에는 좌표가 없으므로 매번 여기서 낸다 (S-piece). */
type Geom = {
  depth: number;
  width: number;
  keyCount: number;
  chipRowW: number;
  cellCx: (col: number) => number;
  cellCy: (row: number) => number;
  chipCx: (i: number) => number;
  /** 줄 r 의 값이 자 위에서 서는 가로 자리. */
  slotX: (i: number) => number;
  /** 값이 자 위에서 멎는 세로. 바닥이 0, 꼭대기가 표의 최댓값. */
  levelOf: (value: number) => number;
};

type DrawnCell = { rect: SVGRectElement; text: SVGTextElement };

/** 자 위에 선 값 하나. 칸에서 떠올라 제 높이에 멎는다. */
type DrawnToken = {
  g: SVGGElement;
  rect: SVGRectElement;
  /** 멎는 세로. 값이 크면 덜 내려간다. */
  level: number;
  /** 떠오르기 전 앉아 있던 칸의 가운데. `prev` 가 아니라 장면에서 셈한 값이다. */
  fromX: number;
  fromY: number;
  slot: number;
  /** 최솟값과 같은 값인가 — 답 선이 여기서 멎는다. */
  lowest: boolean;
};

/** 물음 하나가 자 위에 세운 것들. */
type DrawnProbe = {
  tokens: DrawnToken[];
  bars: SVGLineElement[];
  answer: SVGLineElement;
  minLabel: SVGTextElement;
  /** 참값과 답 사이 — 부푼 몫. 부풀지 않았으면 없다. */
  band: SVGRectElement | null;
  minY: number;
  startY: number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  cells: DrawnCell[][];
  probe: DrawnProbe | null;
  sweep: SVGRectElement | null;
};

export const trustTheSmallestStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<TrustTheSmallestScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 켜. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gTable = el('g', {});
    const gMeter = el('g', {});
    const gChips = el('g', {});
    const gProbe = el('g', {});
    const gFly = el('g', {});
    const gCaption = el('g', {});
    svg.append(gTable, gMeter, gChips, gProbe, gFly, gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 물음 한 걸음이 rAF 를 여러 번 지나고, 그 사이에 되짚기가 끼어들면 남은
     * 프레임이 **이미 새로 선 화면**을 덮는다. 정적 그리기가 칸과 토큰을 매번 새로
     * 만들지만 옛 세대가 쥔 손잡이는 떨어져 나간 노드라 무해한 반면, `await` 뒤의
     * 마무리 그리기는 **옛 장면**을 살아 있는 화면에 쓴다 — 그것을 여기서 끊는다.
     * `isInstant` 는 빗장이 아니다. 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
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
          // 세대가 바뀌었으면 그리지 않고 물러난다.
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

    function geomOf(scene: TrustTheSmallestScene): Geom {
      const depth = scene.depth;
      const width = scene.width;
      const keyCount = Math.max(1, scene.stream.length);

      // 크기는 캔버스에서 역산한다. 상수는 상한일 뿐이다 (S-piece).
      const cellW = Math.min(CELL_MAX_W, Math.floor((STAGE_W - SIDE_MIN * 2) / width));
      const tableX = Math.round((STAGE_W - cellW * width) / 2);
      // 줄이 늘면 높이를 늘리는 것이 아니라 줄 간격을 줄여 담는다 (S-view).
      const rowH = Math.min(ROW_MAX_H, Math.floor(TABLE_BAND_H / depth));

      const chipW = Math.min(
        CHIP_MAX_W,
        Math.floor((STAGE_W - SIDE_MIN * 2 - CHIP_GAP * (keyCount - 1)) / keyCount),
      );
      const chipRowW = chipW * keyCount + CHIP_GAP * (keyCount - 1);
      const chipX0 = Math.round((STAGE_W - chipRowW) / 2);

      // 자의 눈금은 그 걸음의 표에서 나온다 — 옛 `let scaleMax` 자리다.
      const unit = (AXIS_BASE - AXIS_TOP) / scaleMaxOf(scene);

      return {
        depth,
        width,
        keyCount,
        chipRowW,
        cellCx: (col) => tableX + col * cellW + cellW / 2,
        cellCy: (row) => TABLE_Y + row * rowH + rowH / 2,
        chipCx: (i) => chipX0 + i * (chipW + CHIP_GAP) + chipW / 2,
        slotX: (i) => LANE_L + ((i + 1) * (LANE_R - LANE_L)) / (depth + 1),
        levelOf: (value) => AXIS_BASE - value * unit,
      };
    }

    // 표와 칩의 실제 상자는 자리 셈에서 되뽑는다 — 한 자리에서만 셈한다.
    const cellBox = (
      geom: Geom,
      row: number,
      col: number,
    ): { x: number; y: number; w: number; h: number } => {
      const cx = geom.cellCx(col);
      const cy = geom.cellCy(row);
      const w = geom.cellCx(1) - geom.cellCx(0);
      const h = geom.cellCy(1) - geom.cellCy(0);
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    };

    const chipBox = (geom: Geom, i: number): { x: number; w: number } => {
      const w = geom.chipRowW / geom.keyCount - (CHIP_GAP * (geom.keyCount - 1)) / geom.keyCount;
      return { x: geom.chipCx(i) - w / 2, w };
    };

    const textNode = (
      x: number,
      y: number,
      content: string,
      opts: { fill: string; size: string; anchor?: string; family?: string },
    ): SVGTextElement => {
      const node = el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size,
      });
      node.textContent = content;
      return node;
    };

    const place = (node: SVGGElement, x: number, y: number): void => {
      node.setAttribute('transform', `translate(${x}, ${y})`);
    };

    // ── 칠 ────────────────────────────────────────────────────────────────

    /**
     * 칸의 채움 — **값의 형편**이다.
     *
     * 남의 셈까지 이고 있는 칸은 부푼 몫과 같은 잉크로 물들인다. 그 칸이 곧 부풀림의
     * 원인이라, 아래 자에 부푼 띠가 뜰 때 위 표에서 까닭이 보인다.
     */
    function paintCellFill(cell: DrawnCell, shared: boolean): void {
      cell.rect.setAttribute('fill', shared ? c.itemComparing : c.itemDefault);
      cell.rect.setAttribute('fill-opacity', shared ? '0.14' : '1');
    }

    /** 칸의 테두리 — **짚음의 표식**이다. 채움과 뜻이 갈려 부딪히지 않는다. */
    function paintCellMark(cell: DrawnCell, mark: 'none' | 'touched' | 'read'): void {
      cell.rect.setAttribute(
        'stroke',
        mark === 'touched' ? c.itemActive : mark === 'read' ? c.itemComparing : c.border,
      );
      cell.rect.setAttribute('stroke-width', mark === 'none' ? '1' : '2');
    }

    function paintCellValue(cell: DrawnCell, value: number): void {
      cell.text.textContent = String(value);
      cell.text.setAttribute('fill', value === 0 ? c.textMuted : c.text);
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 것.
     *
     * 수는 전부 장면의 함수를 지난다 — 캡션이 제 수를 따로 들고 있으면 자에 그려진
     * 높이와 갈릴 자리가 생긴다. 참값 그대로인지 부풀었는지의 갈림도 `isInflated`
     * 하나가 판정하고, 부푼 띠가 같은 판정을 쓴다.
     */
    function captionFor(scene: TrustTheSmallestScene): string {
      const step = scene.step;
      if (step === null) return '';

      switch (step.kind) {
        case 'ingest': {
          const touch = scene.touch;
          if (touch === null) return '';
          return t(
            'caption.ingest',
            'Key "{key}" arrives {count} times. One cell in every row goes up.',
            {
              key: scene.stream[touch.index]?.key ?? '',
              count: truthOf(scene, touch.index),
            },
          );
        }
        case 'probe': {
          const probe = scene.probe;
          if (probe === null) return '';
          const key = scene.stream[probe.index]?.key ?? '';
          const min = minOf(scene, probe);
          if (!isInflated(scene, probe)) {
            return t(
              'caption.exact',
              'Three rows read "{key}"; the answer sinks to {min} — exactly the true count.',
              { key, min },
            );
          }
          return t(
            'caption.inflated',
            'Three rows read "{key}"; the answer sinks to {min}, yet the true count is {truth}. Shared cells puffed it up.',
            { key, min, truth: truthOf(scene, probe.index) },
          );
        }
        case 'verdict':
          // 물어본 키의 수는 선언이 정한다 — `done` 의 `keys` 를 버린 자리다.
          return t(
            'caption.verdict',
            'Across all {n} keys, the smallest reading never fell below the true count.',
            { n: scene.stream.length },
          );
      }
    }

    /** 칩에 적히는 것 — 키와 참값, 물어본 뒤에는 답도 함께. */
    function chipLabel(scene: TrustTheSmallestScene, i: number): string {
      const item = scene.stream[i];
      if (item === undefined) return '';
      const head = `${item.key} ×${item.count}`;
      const done = answerFor(scene, i);
      return done === null ? head : `${head} → ${minOf(scene, done)}`;
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of [gTable, gMeter, gChips, gProbe, gFly, gCaption]) g.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: TrustTheSmallestScene): Drawn {
      rewind();

      const geom = geomOf(scene);
      const firstBox = cellBox(geom, 0, 0);
      const gutterR = firstBox.x - 8;

      // ── 왼쪽 이름표 (도식에 새긴 표식이라 번역하지 않는다 — C10)
      gTable.appendChild(
        textNode(gutterR, CHIP_Y + CHIP_H / 2 + 4, 'stream', {
          fill: c.textMuted,
          size: fontSizes.xs,
          anchor: 'end',
        }),
      );
      gTable.appendChild(
        textNode(gutterR, COL_TAG_Y, 'sketch', {
          fill: c.textMuted,
          size: fontSizes.xs,
          anchor: 'end',
        }),
      );

      // ── 표. 값과 나눠 씀은 장면이 말하고, 짚은 표식은 이 걸음이 말한다.
      const touched = new Set<string>();
      if (scene.touch !== null) {
        for (const ref of scene.touch.cells) touched.add(`${ref.row}:${ref.col}`);
      }
      const read = new Set<string>();
      if (scene.probe !== null) {
        for (const ref of scene.probe.reads) read.add(`${ref.row}:${ref.col}`);
      }

      for (let col = 0; col < geom.width; col += 1) {
        gTable.appendChild(
          textNode(geom.cellCx(col), COL_TAG_Y, `c${col}`, {
            fill: c.textMuted,
            size: fontSizes.xs,
          }),
        );
      }

      const cells: DrawnCell[][] = [];
      for (let row = 0; row < geom.depth; row += 1) {
        gTable.appendChild(
          textNode(gutterR, geom.cellCy(row) + 4, `r${row}`, {
            fill: c.textMuted,
            size: fontSizes.xs,
            anchor: 'end',
          }),
        );
        const line: DrawnCell[] = [];
        for (let col = 0; col < geom.width; col += 1) {
          const box = cellBox(geom, row, col);
          const rect = el('rect', {
            x: box.x + 4,
            y: box.y + 4,
            width: Math.max(1, box.w - 8),
            height: Math.max(1, box.h - 8),
            rx: 3,
          });
          const value = textNode(geom.cellCx(col), geom.cellCy(row) + 4, '0', {
            fill: c.textMuted,
            size: fontSizes.sm,
            family: fonts.mono,
          });
          gTable.append(rect, value);
          const cell: DrawnCell = { rect, text: value };
          paintCellFill(cell, isShared(scene, row, col));
          paintCellMark(
            cell,
            touched.has(`${row}:${col}`)
              ? 'touched'
              : read.has(`${row}:${col}`)
                ? 'read'
                : 'none',
          );
          paintCellValue(cell, valueAt(scene, { row, col }));
          line.push(cell);
        }
        cells.push(line);
      }

      // ── 자. 바닥선과 줄마다의 기둥.
      gMeter.appendChild(
        el('line', {
          x1: LANE_L,
          y1: AXIS_BASE,
          x2: LANE_R,
          y2: AXIS_BASE,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      for (let i = 0; i < geom.depth; i += 1) {
        gMeter.appendChild(
          el('line', {
            x1: geom.slotX(i),
            y1: AXIS_TOP,
            x2: geom.slotX(i),
            y2: AXIS_BASE,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 5',
          }),
        );
        gMeter.appendChild(
          textNode(geom.slotX(i), AXIS_BASE + 14, `r${i}`, {
            fill: c.textMuted,
            size: fontSizes.xs,
          }),
        );
      }

      // ── 칩. 키와 참값, 그리고 이미 물어본 답. 앉은 답은 되짚어도 남는 자취다.
      let sweep: SVGRectElement | null = null;
      if (scene.finished) {
        // 결론 띠. 칩 줄 뒤에 깔리므로 칩보다 먼저 붙인다.
        sweep = el('rect', {
          x: geom.chipCx(0) - chipBox(geom, 0).w / 2,
          y: CHIP_Y - 5,
          width: geom.chipRowW,
          height: CHIP_H + 10,
          rx: (CHIP_H + 10) / 2,
          fill: c.accent,
          'fill-opacity': 0.2,
        });
        gChips.appendChild(sweep);
      }

      for (let i = 0; i < scene.stream.length; i += 1) {
        const box = chipBox(geom, i);
        const done = answerFor(scene, i);
        const active = scene.touch?.index === i;
        const query = scene.probe?.index === i;
        const lit = active || query;
        const rect = el('rect', {
          x: box.x,
          y: CHIP_Y,
          width: box.w,
          height: CHIP_H,
          rx: CHIP_H / 2,
          fill: c.bgSubtle,
          stroke: active ? c.itemActive : query ? c.itemPivot : c.border,
          'stroke-width': lit ? 2 : 1,
        });
        const inflated = done !== null && isInflated(scene, done);
        const value = textNode(geom.chipCx(i), CHIP_Y + CHIP_H / 2 + 4, chipLabel(scene, i), {
          fill: inflated ? c.itemComparing : lit || done !== null ? c.text : c.textMuted,
          size: fontSizes.xs,
          family: fonts.mono,
        });
        gChips.append(rect, value);
      }

      // ── 자 위의 물음. 그 걸음 동안 머무는 것이라 정적으로도 세운다 (S-scene).
      const probe = scene.probe === null ? null : drawProbe(scene, geom);

      // ── 캡션. 지금 무슨 일이 일어나는지만 말한다 (S-piece).
      gCaption.appendChild(
        textNode(STAGE_W / 2, CAPTION_Y, captionFor(scene), {
          fill: c.text,
          size: fontSizes.sm,
        }),
      );

      return { geom, cells, probe, sweep };
    }

    /**
     * 자 위에 선 물음을 세운다 — 참값 점선, 가라앉은 값들, 답 선, 부푼 몫.
     *
     * 끝 그림이 정본이다. 걸음은 여기서 세운 것을 **아직 못 온 자리로 물렸다가**
     * 놓아 준다 (S-scene 의 "운동의 방향이 뒤집힌다").
     */
    function drawProbe(scene: TrustTheSmallestScene, geom: Geom): DrawnProbe | null {
      const probe = scene.probe;
      if (probe === null) return null;

      const truth = truthOf(scene, probe.index);
      const min = minOf(scene, probe);
      const truthY = geom.levelOf(truth);
      const minY = geom.levelOf(min);
      const startY = geom.levelOf(maxOf(scene, probe));

      const under = el('g', {});
      const over = el('g', {});
      gProbe.append(under, over);

      // 부푼 몫 — 참값과 답 사이. 가장 뒤에 깔린다.
      let band: SVGRectElement | null = null;
      if (isInflated(scene, probe)) {
        band = el('rect', {
          x: LANE_L,
          y: minY,
          width: LANE_R - LANE_L,
          height: Math.max(0, truthY - minY),
          fill: c.itemComparing,
          'fill-opacity': 0.14,
        });
        under.appendChild(band);
      }

      // 견줄 자리 — 참값.
      under.appendChild(
        el('line', {
          x1: LANE_L,
          y1: truthY,
          x2: LANE_R,
          y2: truthY,
          stroke: c.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '6 4',
        }),
      );
      over.appendChild(
        textNode(LANE_L - 10, truthY + 4, t('label.truth', 'true {n}', { n: truth }), {
          fill: c.textMuted,
          size: fontSizes.xs,
          anchor: 'end',
        }),
      );

      // 가라앉은 값들. 밑에 남는 막대의 길이가 곧 그 값이다.
      const bars: SVGLineElement[] = [];
      const tokens: DrawnToken[] = [];
      probe.reads.forEach((ref, i) => {
        const value = valueAt(scene, ref);
        const level = geom.levelOf(value);
        const lowest = value <= min;
        const bar = el('line', {
          x1: geom.slotX(i),
          y1: level,
          x2: geom.slotX(i),
          y2: AXIS_BASE,
          stroke: lowest ? c.itemPivot : c.border,
          'stroke-width': 4,
          'stroke-linecap': 'round',
        });
        under.appendChild(bar);
        bars.push(bar);

        const g = el('g', {});
        const rect = el('rect', {
          x: -TOKEN_W / 2,
          y: -TOKEN_H / 2,
          width: TOKEN_W,
          height: TOKEN_H,
          rx: 4,
          fill: c.bgSubtle,
          stroke: lowest ? c.itemPivot : c.border,
          'stroke-width': lowest ? 2 : 1,
        });
        g.append(
          rect,
          textNode(0, 4, String(value), {
            fill: c.text,
            size: fontSizes.sm,
            family: fonts.mono,
          }),
        );
        place(g, geom.slotX(i), level);
        over.appendChild(g);
        tokens.push({
          g,
          rect,
          level,
          fromX: geom.cellCx(ref.col),
          fromY: geom.cellCy(ref.row),
          slot: geom.slotX(i),
          lowest,
        });
      });

      // 답 선. 가장 낮은 값에 멎어 있다.
      const answer = el('line', {
        x1: LANE_L,
        y1: minY,
        x2: LANE_R,
        y2: minY,
        stroke: c.text,
        'stroke-width': 2,
      });
      over.appendChild(answer);
      const minLabel = textNode(
        LANE_R + 10,
        minY + 4,
        t('label.answer', 'min {n}', { n: min }),
        { fill: c.text, size: fontSizes.xs, anchor: 'start' },
      );
      over.appendChild(minLabel);

      return { tokens, bars, answer, minLabel, band, minY, startY };
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 장면에서 셈한다 — `prev` 를
    // 들추지 않는다 (S-scene).

    const setOpacity = (node: SVGElement, v: number): void => {
      node.setAttribute('opacity', String(v));
    };

    /**
     * 키 하나가 들어온다 — 알갱이가 칩에서 칸으로 내려앉고 값이 오른다.
     *
     * 오르기 전의 값은 `이 걸음의 값 − 참값` 이고 오르기 전의 나눠 씀은
     * `지금 − 1` 이다. 둘 다 장면에서 셈하므로 출발 그림에 `prev` 가 필요 없다.
     */
    function flowIngest(
      scene: TrustTheSmallestScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const touch = scene.touch;
      if (touch === null) return Promise.resolve();

      const { geom } = drawn;
      const count = truthOf(scene, touch.index);
      const fromX = geom.chipCx(touch.index);
      const fromY = CHIP_Y + CHIP_H / 2;

      const pills = touch.cells.map(() => {
        const g = el('g', {});
        g.append(
          el('rect', {
            x: -20,
            y: -10,
            width: 40,
            height: 20,
            rx: 6,
            fill: c.itemActive,
            stroke: c.itemActive,
          }),
          textNode(0, 4, `+${count}`, {
            fill: c.textInverse,
            size: fontSizes.xs,
            family: fonts.mono,
          }),
        );
        place(g, fromX, fromY);
        gFly.appendChild(g);
        return g;
      });

      // 한 뜻으로 묶인 운동이라 **한 시계**로 돌린다 — 알갱이 셋이 함께 내려앉고,
      // 같은 눈금에서 값이 오른다 (S-scene).
      return tween(INGEST_MS, mine, (p) => {
        const ms = p * INGEST_MS;
        const landed = ms >= FLY_MS;
        const e = easeOut(clamp01(ms / FLY_MS));
        touch.cells.forEach((ref, i) => {
          const toX = geom.cellCx(ref.col);
          const toY = geom.cellCy(ref.row);
          place(pills[i], fromX + (toX - fromX) * e, fromY + (toY - fromY) * e);
          setOpacity(pills[i], landed ? 0 : 1);

          const cell = drawn.cells[ref.row]?.[ref.col];
          if (cell === undefined) return;
          if (landed) {
            // 끝에서는 보간값이 아니라 장면의 값을 그대로 쓴다.
            paintCellValue(cell, valueAt(scene, ref));
            paintCellFill(cell, isShared(scene, ref.row, ref.col));
            return;
          }
          paintCellValue(cell, valueAt(scene, ref) - count);
          paintCellFill(cell, sharesAt(scene, ref.row, ref.col) - 1 >= 2);
        });
      });
    }

    /**
     * 키 하나를 묻는다 — 값이 떠올라 가라앉고, 답이 가장 낮은 값까지 내려앉는다.
     *
     * 마디 넷을 **한 시계**로 돌린다. 마디마다 `await` 를 두면 그 틈으로 되짚기가
     * 끼어들 자리가 늘고, 뒷마디가 깨어나 새로 선 화면을 덮는다 (S-scene).
     */
    function flowProbe(drawn: Drawn, mine: number): Promise<void> {
      const probe = drawn.probe;
      if (probe === null) return Promise.resolve();

      const { tokens, bars, answer, minLabel, band, minY, startY } = probe;
      const endHold = HOLD_MS;
      const endRise = endHold + RISE_MS;
      const endSink = endRise + SINK_MS;

      const answerAt = (y: number): void => {
        answer.setAttribute('y1', String(y));
        answer.setAttribute('y2', String(y));
      };
      /**
       * 답 선이 지나친 값은 답이 아니다 — 지나친 순간 잉크가 식는다.
       *
       * 멎은 뒤에는 가장 낮은 값만 답의 잉크를 단다. 끝 그림은 정적 그리기가 세운
       * 것과 같아야 하므로 `lowest` 로 판정한다 — 보간한 `y` 로 판정하면 끝자리가
       * 화면을 가른다.
       */
      const coolPassed = (y: number, settled: boolean): void => {
        tokens.forEach((token, i) => {
          const ink = settled
            ? token.lowest
              ? c.itemPivot
              : c.border
            : y > token.level + 0.5
              ? c.border
              : c.itemComparing;
          const wide = ink === c.itemPivot ? '2' : ink === c.border ? '1' : '1.5';
          token.rect.setAttribute('stroke', ink);
          token.rect.setAttribute('stroke-width', wide);
          bars[i].setAttribute('stroke', ink);
        });
      };

      return tween(PROBE_MS, mine, (p) => {
        const ms = p * PROBE_MS;

        // ① 견줄 자리를 깔고 읽은 칸을 밝히는 동안. 자 위는 아직 비어 있다.
        if (ms < endHold) {
          for (const token of tokens) {
            setOpacity(token.g, 0);
            place(token.g, token.fromX, token.fromY);
          }
          for (const bar of bars) setOpacity(bar, 0);
          setOpacity(answer, 0);
          setOpacity(minLabel, 0);
          if (band !== null) setOpacity(band, 0);
          return;
        }

        // ② 읽은 값이 칸에서 떠올라 자의 꼭대기로 간다.
        if (ms < endRise) {
          const e = easeOut((ms - endHold) / RISE_MS);
          for (const token of tokens) {
            setOpacity(token.g, 1);
            place(
              token.g,
              token.fromX + (token.slot - token.fromX) * e,
              token.fromY + (AXIS_TOP - token.fromY) * e,
            );
            token.rect.setAttribute('stroke', c.itemComparing);
            token.rect.setAttribute('stroke-width', '1.5');
          }
          for (const bar of bars) setOpacity(bar, 0);
          setOpacity(answer, 0);
          setOpacity(minLabel, 0);
          if (band !== null) setOpacity(band, 0);
          return;
        }

        // ③ 제 높이까지 가라앉는다. 밑에 남는 막대의 길이가 곧 그 값이다.
        if (ms < endSink) {
          const e = easeInOut((ms - endRise) / SINK_MS);
          tokens.forEach((token, i) => {
            const y = AXIS_TOP + (token.level - AXIS_TOP) * e;
            setOpacity(token.g, 1);
            place(token.g, token.slot, y);
            token.rect.setAttribute('stroke', c.itemComparing);
            token.rect.setAttribute('stroke-width', '1.5');
            setOpacity(bars[i], 1);
            bars[i].setAttribute('y1', String(y));
            bars[i].setAttribute('stroke', c.itemComparing);
          });
          setOpacity(answer, 0);
          setOpacity(minLabel, 0);
          if (band !== null) setOpacity(band, 0);
          return;
        }

        // ④ 답이 가장 높은 값에서 출발해 가장 낮은 값까지 내려앉는다.
        const e = easeInOut(clamp01((ms - endSink) / DROP_MS));
        tokens.forEach((token, i) => {
          setOpacity(token.g, 1);
          place(token.g, token.slot, token.level);
          setOpacity(bars[i], 1);
          bars[i].setAttribute('y1', String(token.level));
        });
        setOpacity(answer, 1);
        // 끝에서는 보간값 대신 목표값을 그대로 쓴다 — `-0` 과 끝자리가 문자열을
        // 가른다 (S-scene).
        const y = e >= 1 ? minY : startY + (minY - startY) * e;
        answerAt(y);
        coolPassed(y, e >= 1);
        setOpacity(minLabel, e >= 1 ? 1 : 0);
        if (band !== null) setOpacity(band, e >= 1 ? 1 : 0);
      });
    }

    /** 다 물어본 뒤 — 결론 띠가 칩 줄을 훑어 다섯이 같은 말을 한다는 것을 보인다. */
    function flowVerdict(drawn: Drawn, mine: number): Promise<void> {
      const sweep = drawn.sweep;
      if (sweep === null) return Promise.resolve();
      const full = drawn.geom.chipRowW;
      return tween(VERDICT_MS, mine, (p) => {
        const q = clamp01((p * VERDICT_MS) / SWEEP_MS);
        sweep.setAttribute('width', String(q >= 1 ? full : Math.round(full * easeOut(q))));
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: TrustTheSmallestScene,
      _prev: TrustTheSmallestScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'ingest':
          await flowIngest(next, drawn, mine);
          break;
        case 'probe':
          await flowProbe(drawn, mine);
          break;
        case 'verdict':
          await flowVerdict(drawn, mine);
          break;
      }
      if (!alive(mine)) return;

      // 보간이 남긴 `opacity` 와 좌표 끝자리, 날아온 알갱이가 노드째 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다
        // (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
