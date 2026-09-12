/**
 * 전부 견주기 — 훑는 호와 쌓이는 더미.
 *
 * ── 무엇이 어디에 있는가
 *
 * 왼쪽은 **훑는 판**이다. 물음 하나가 가운데에 있고 후보가 호 위에 놓인다.
 * 바늘이 후보를 하나씩 돌며 짚는다 — 하나도 건너뛰지 않는다는 것이 전수 탐색의
 * 전부다. 오른쪽은 **쌓이는 더미**다. 짚은 후보마다 차원 수만큼 곱셈 알갱이가
 * 날아와 한 줄로 앉고, 그 줄이 차곡차곡 올라간다.
 *
 * ── 자는 물러서고, 마지막에는 물러서지 못한다
 *
 * 수를 키우면 더미가 천장을 넘는다. 그때 **자를 다시 잰다** — 곱셈 하나가
 * 차지하는 세로를 줄여 더미를 천장에 맞추고, 앞서 있던 줄들은 눈금으로 남아
 * 함께 내려앉는다. 우리가 손으로 센 32 는 몇 걸음 만에 바닥의 실금이 된다.
 *
 * 다만 물러서는 데에도 끝이 있다. **바로 앞 줄이 3px 아래로 눌리는 자리라면
 * 물러서 봐야 화면이 아무 말도 하지 못한다.** 그때는 자를 그대로 두고 기둥이
 * 화면 밖으로 자라게 둔다 — 천장은 톱니로 잘리고 수만 남는다. 규칙은 데이터가
 * 정하지 사람이 줄을 고르지 않는다.
 *
 * ── 색
 *
 * 후보는 아직 안 본 것 `itemDefault` · 지금 보는 것 `itemComparing` · 본 것
 * `itemSorted`. 더미는 비교가 낳은 값이므로 `itemComparing` 을 그대로 잇는다.
 * 화면을 벗어나는 마지막 줄만 `danger` 다 — 그것이 이 조각이 말하는 실패다.
 *
 * ── destroy
 *
 * 애니메이션은 `waiters` / `timers` 두 집합으로만 잔다. 취소된 tick 은 아예
 * 불리지 않으므로 `destroy` 가 기다리던 것을 직접 깨운다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로는 러너가 정하고(PIECE_CANVAS_W), 세로는 그림이 정한다 (S-piece). */
const W = PIECE_CANVAS_W;
const H = 300;

// ── 훑는 판 ──────────────────────────────────────────────────────────────────
const QX = 62;
const QY = 152;
const ARC_R = 138;
/** 호의 반각(도). 후보는 -ARC_HALF 에서 +ARC_HALF 사이에 고르게 놓인다. */
const ARC_HALF = 50;
const ARC_LEN = ARC_R * ((ARC_HALF * 2 * Math.PI) / 180);
const BAND_W = 9;
const DOT_R = 7;
/** 바늘이 처음 서 있는 자리 — 호 밖이라 첫 걸음에 실제로 돈다. */
const SPOKE_PARK = -ARC_HALF - 16;

// ── 쌓이는 더미 ──────────────────────────────────────────────────────────────
const BASE_Y = 258;
const CEIL_Y = 44;
const CEIL_H = BASE_Y - CEIL_Y;
/**
 * 기둥과 눈금은 캔버스에서 역산한다. 상수로는 **상한**만 둔다 (S-piece "그 폭을
 * 채운다"). 절대 픽셀로 못박으면 `PIECE_CANVAS_W` 가 바뀔 때 눈금선만 제자리에
 * 남아 라벨과 어긋난다.
 */
const COL_W = Math.min(84, Math.round(W * 0.14));
const COL_X = Math.round(W * 0.46);
const LEVEL_X1 = COL_X - 10;
const LEVEL_X2 = W - 64;
const LEVEL_LABEL_X = W - 18;
/** 화면 밖으로 자란 기둥을 자르는 자리. */
const TOP_CUT = 12;
/** 자가 물러설 수 있는 한계 — 바로 앞 줄이 이보다 눌리면 물러서지 않는다. */
const MIN_GHOST_PX = 3;
/** 후보 한 줄의 높이. 곱셈 하나의 세로는 여기서 차원 수로 나눠 나온다. */
const ROW_PITCH = 18;
const TILE_GAP = 2;
/** 눈금 숫자끼리의 최소 간격. 이보다 붙으면 읽을 수 없으므로 감춘다. */
const LABEL_MIN_GAP = 13;

const CAPTION_X = 20;
const CAPTION_Y = H - 10;

const FRAME_MS = 16;
const RAD = Math.PI / 180;

/**
 * 천 단위마다 쉼표. 자릿수가 네 자리를 넘는 순간 눈이 자릿수를 못 세므로
 * 화면의 모든 수가 같은 규칙을 쓴다. projector 의 캡션도 이 함수를 쓴다 —
 * 규칙이 두 벌이 되면 한 화면에서 `8192` 와 `8,192` 가 같이 뜬다.
 */
export function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export type CompareWithAllBoard = { n: number; dims: number };

const DEFAULT_BOARD: CompareWithAllBoard = { n: 8, dims: 4 };

/**
 * `initialData` 를 좁히는 자리는 mount 다 (S-piece). projector 는 이것을 다시
 * 좁히지 않는다 — 걸음마다 오는 payload 만 좁혀 넘긴다.
 */
export function readBoard(initial: Record<string, unknown> | undefined): CompareWithAllBoard {
  const raw = (initial as { board?: unknown } | undefined)?.board;
  if (typeof raw !== 'object' || raw === null) return DEFAULT_BOARD;
  const board = raw as Record<string, unknown>;
  const n = typeof board.n === 'number' && board.n > 0 ? Math.floor(board.n) : DEFAULT_BOARD.n;
  const dims =
    typeof board.dims === 'number' && board.dims > 0 ? Math.floor(board.dims) : DEFAULT_BOARD.dims;
  return { n, dims };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
  return node;
}

function angleAt(index: number, count: number): number {
  if (count <= 1) return 0;
  return -ARC_HALF + (index * ARC_HALF * 2) / (count - 1);
}

function posAt(deg: number): { x: number; y: number } {
  return { x: QX + ARC_R * Math.cos(deg * RAD), y: QY + ARC_R * Math.sin(deg * RAD) };
}

function arcPath(fromDeg: number, toDeg: number): string {
  const a = posAt(fromDeg);
  const b = posAt(toDeg);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${ARC_R} ${ARC_R} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function ease(p: number): number {
  return 1 - (1 - p) ** 3;
}

/**
 * 자를 다시 잰다.
 *
 * 천장 아래면 그대로 두고, 넘치면 이 줄을 천장에 맞추는 자로 바꾼다. 다만
 * 그렇게 해서 **바로 앞 줄이 보이지 않게 될 자리**라면 물러서지 않는다 —
 * 물러선 화면이 아무 말도 못 하기 때문이다.
 */
function fitUnit(total: number, unit: number, prevTotal: number): number {
  if (total * unit <= CEIL_H) return unit;
  const wanted = CEIL_H / total;
  if (prevTotal > 0 && prevTotal * wanted < MIN_GHOST_PX) return unit;
  return wanted;
}

type Ghost = { total: number; line: SVGLineElement; text: SVGTextElement };

type Scene = {
  arcGuide: SVGPathElement;
  band: SVGPathElement;
  dots: SVGCircleElement[];
  spoke: SVGGElement;
  pileG: SVGGElement;
  tilesG: SVGGElement;
  flightG: SVGGElement;
  ghostG: SVGGElement;
  column: SVGRectElement;
  markLine: SVGLineElement;
  markText: SVGTextElement;
  caption: SVGTextElement;
};

type SweepStep = { index: number; n: number; dims: number; total: number };
type ScaleStep = { n: number; dims: number; total: number };

export const compareWithAllStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const board = readBoard(params.initialData);
    const canvas = params.canvas;

    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';
    const root = el('g', {});
    canvas.appendChild(root);

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /** 곱셈 하나가 차지하는 세로. 자가 물러설 때마다 작아진다. */
    let unit = ROW_PITCH / board.dims;
    let total = 0;
    let spokeDeg = SPOKE_PARK;
    let ghosts: Ghost[] = [];
    let beyondFrame = false;

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    async function tween(ms: number, apply: (p: number) => void): Promise<void> {
      const frames = Math.max(1, Math.round(ms / FRAME_MS));
      for (let i = 1; i <= frames; i += 1) {
        if (destroyed) return;
        await wait(FRAME_MS);
        if (destroyed) return;
        apply(ease(i / frames));
      }
    }

    function build(): Scene {
      root.textContent = '';
      unit = ROW_PITCH / board.dims;
      total = 0;
      spokeDeg = SPOKE_PARK;
      ghosts = [];
      beyondFrame = false;

      // ── 더미 쪽을 먼저 깔고 판을 그 위에 얹는다.
      const pileG = el('g', {});
      pileG.appendChild(
        el('line', {
          x1: LEVEL_X1,
          y1: CEIL_Y,
          x2: LEVEL_X2,
          y2: CEIL_Y,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        }),
      );
      const ghostG = el('g', {});
      pileG.appendChild(ghostG);

      const column = el('rect', {
        x: COL_X,
        y: BASE_Y,
        width: COL_W,
        height: 0,
        rx: 2,
        fill: colors.itemComparing,
        opacity: 0,
      });
      pileG.appendChild(column);

      const tilesG = el('g', {});
      pileG.appendChild(tilesG);

      pileG.appendChild(
        el('line', {
          x1: LEVEL_X1,
          y1: BASE_Y,
          x2: LEVEL_X2,
          y2: BASE_Y,
          stroke: colors.text,
          'stroke-width': 1.5,
        }),
      );

      const markLine = el('line', {
        x1: LEVEL_X1,
        y1: BASE_Y,
        x2: LEVEL_X2,
        y2: BASE_Y,
        stroke: colors.text,
        'stroke-width': 1,
        opacity: 0,
      });
      pileG.appendChild(markLine);

      const markText = el('text', {
        x: LEVEL_LABEL_X,
        y: BASE_Y - 5,
        'text-anchor': 'end',
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        opacity: 0,
      });
      pileG.appendChild(markText);
      root.appendChild(pileG);

      // ── 훑는 판.
      const boardG = el('g', {});
      const arcGuide = el('path', {
        d: arcPath(-ARC_HALF, ARC_HALF),
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1,
      });
      boardG.appendChild(arcGuide);

      const band = el('path', {
        d: '',
        fill: 'none',
        stroke: colors.itemSorted,
        'stroke-width': 0,
        'stroke-linecap': 'butt',
      });
      boardG.appendChild(band);

      const spoke = el('g', { transform: `rotate(${SPOKE_PARK} ${QX} ${QY})` });
      spoke.appendChild(
        el('line', {
          x1: QX,
          y1: QY,
          x2: QX + ARC_R - 12,
          y2: QY,
          stroke: colors.textMuted,
          'stroke-width': 2,
        }),
      );
      boardG.appendChild(spoke);

      const dots: SVGCircleElement[] = [];
      for (let i = 0; i < board.n; i += 1) {
        const at = posAt(angleAt(i, board.n));
        const dot = el('circle', {
          cx: at.x.toFixed(1),
          cy: at.y.toFixed(1),
          r: DOT_R,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        boardG.appendChild(dot);
        dots.push(dot);
      }

      // 물음. 이것 하나가 호 위의 모두와 견주어진다.
      boardG.appendChild(
        el('circle', {
          cx: QX,
          cy: QY,
          r: 10,
          fill: colors.accent,
          stroke: colors.stateInk,
          'stroke-width': 1.5,
        }),
      );
      root.appendChild(boardG);

      const flightG = el('g', {});
      root.appendChild(flightG);

      const caption = el('text', {
        x: CAPTION_X,
        y: CAPTION_Y,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      root.appendChild(caption);

      return {
        arcGuide,
        band,
        dots,
        spoke,
        pileG,
        tilesG,
        flightG,
        ghostG,
        column,
        markLine,
        markText,
        caption,
      };
    }

    let scene = build();

    function tileGeom(
      row: number,
      slot: number,
      dims: number,
    ): { x: number; y: number; w: number; h: number } {
      const w = (COL_W - (dims - 1) * TILE_GAP) / dims;
      const h = ROW_PITCH - TILE_GAP;
      return {
        x: COL_X + slot * (w + TILE_GAP),
        y: BASE_Y - (row + 1) * ROW_PITCH + TILE_GAP / 2,
        w,
        h,
      };
    }

    function placeColumn(height: number): void {
      const y = Math.max(TOP_CUT, BASE_Y - height);
      scene.column.setAttribute('y', y.toFixed(1));
      scene.column.setAttribute('height', Math.max(0, BASE_Y - y).toFixed(1));
    }

    function setMark(value: number, y: number): void {
      const lineY = Math.max(TOP_CUT, y);
      const ink = beyondFrame ? colors.danger : colors.text;
      scene.markLine.setAttribute('y1', lineY.toFixed(1));
      scene.markLine.setAttribute('y2', lineY.toFixed(1));
      scene.markLine.setAttribute('stroke', ink);
      scene.markLine.setAttribute('opacity', '1');
      scene.markText.setAttribute('y', (lineY > 26 ? lineY - 5 : lineY + 16).toFixed(1));
      scene.markText.setAttribute('fill', ink);
      scene.markText.setAttribute('opacity', '1');
      scene.markText.textContent = formatCount(value);
    }

    /**
     * 눈금 숫자는 서로 붙으면 감춘다. 바닥으로 내려앉은 줄은 선만 남는데,
     * 그 선이 바닥과 겹쳐 보이는 것이 이 조각이 말하려는 바다 — 숫자를 억지로
     * 띄우면 그 자리를 거짓으로 옮기게 된다.
     */
    function layoutGhostLabels(): void {
      const rows = ghosts
        .map((g) => ({ g, y: Number(g.line.getAttribute('y1') ?? BASE_Y) }))
        .sort((a, b) => b.y - a.y);
      let lastY = BASE_Y - 4;
      for (const row of rows) {
        const show = lastY - row.y >= LABEL_MIN_GAP;
        row.g.text.setAttribute('opacity', show ? '1' : '0');
        if (show) lastY = row.y;
      }
    }

    function placeGhost(ghost: Ghost, y: number): void {
      ghost.line.setAttribute('y1', y.toFixed(1));
      ghost.line.setAttribute('y2', y.toFixed(1));
      ghost.text.setAttribute('y', (y - 4).toFixed(1));
    }

    function addGhost(value: number, y: number): void {
      const line = el('line', {
        x1: LEVEL_X1,
        y1: y,
        x2: LEVEL_X2,
        y2: y,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const text = el('text', {
        x: LEVEL_LABEL_X,
        y: y - 4,
        'text-anchor': 'end',
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      text.textContent = formatCount(value);
      scene.ghostG.appendChild(line);
      scene.ghostG.appendChild(text);
      ghosts.push({ total: value, line, text });
    }

    async function rotateSpoke(toDeg: number, ms: number): Promise<void> {
      const from = spokeDeg;
      if (Math.abs(toDeg - from) < 0.01) return;
      await tween(ms, (p) => {
        spokeDeg = from + (toDeg - from) * p;
        scene.spoke.setAttribute('transform', `rotate(${spokeDeg.toFixed(2)} ${QX} ${QY})`);
      });
      spokeDeg = toDeg;
    }

    async function flyOne(step: SweepStep, slot: number, delayMs: number): Promise<void> {
      await wait(delayMs);
      if (destroyed) return;
      const from = posAt(angleAt(step.index, step.n));
      const cell = tileGeom(step.index, slot, step.dims);
      const to = { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 };
      const ctrlX = (from.x + to.x) / 2;
      const ctrlY = Math.min(from.y, to.y) - 74;

      const bead = el('circle', {
        cx: from.x.toFixed(1),
        cy: from.y.toFixed(1),
        r: 4,
        fill: colors.itemComparing,
      });
      scene.flightG.appendChild(bead);

      await tween(260, (p) => {
        const q = 1 - p;
        const x = q * q * from.x + 2 * q * p * ctrlX + p * p * to.x;
        const y = q * q * from.y + 2 * q * p * ctrlY + p * p * to.y;
        bead.setAttribute(
          'transform',
          `translate(${(x - from.x).toFixed(1)} ${(y - from.y).toFixed(1)})`,
        );
      });
      bead.remove();
      if (destroyed) return;

      scene.tilesG.appendChild(
        el('rect', {
          x: cell.x.toFixed(1),
          y: cell.y.toFixed(1),
          width: cell.w.toFixed(1),
          height: cell.h.toFixed(1),
          rx: 1.5,
          fill: colors.itemComparing,
        }),
      );
    }

    /** 호를 후보 n 으로 다시 채우며 바늘이 한 바퀴 훑는다. */
    async function sweepBand(count: number, ms: number): Promise<void> {
      const period = ARC_LEN / Math.max(1, count);
      const dash = Math.max(0.4, period * 0.62);
      scene.band.setAttribute('stroke-width', String(BAND_W));
      scene.band.setAttribute(
        'stroke-dasharray',
        `${dash.toFixed(2)} ${Math.max(0.05, period - dash).toFixed(2)}`,
      );
      const dots = scene.dots;
      await tween(ms, (p) => {
        const to = -ARC_HALF + 2 * ARC_HALF * p;
        scene.band.setAttribute('d', arcPath(-ARC_HALF, to));
        spokeDeg = to;
        scene.spoke.setAttribute('transform', `rotate(${to.toFixed(2)} ${QX} ${QY})`);
        // 낱낱의 후보는 띠에 삼켜진다 — 셀 수 있던 것이 셀 수 없게 된다.
        for (const dot of dots) dot.setAttribute('r', ((1 - p) * DOT_R).toFixed(2));
      });
    }

    async function tweenPile(
      fromTotal: number,
      toTotal: number,
      fromUnit: number,
      toUnit: number,
      ms: number,
    ): Promise<void> {
      await tween(ms, (p) => {
        const u = fromUnit + (toUnit - fromUnit) * p;
        const t = fromTotal + (toTotal - fromTotal) * p;
        placeColumn(t * u);
        for (const ghost of ghosts) placeGhost(ghost, BASE_Y - ghost.total * u);
        layoutGhostLabels();
        setMark(t, BASE_Y - t * u);
      });
    }

    /** 자가 못 따라간 줄 — 천장을 톱니로 자르고 눈금만 위로 흘려보낸다. */
    async function burstBeyond(): Promise<void> {
      const points: string[] = [];
      for (let i = 0; i * 8 <= COL_W; i += 1) {
        points.push(`${COL_X + i * 8},${i % 2 === 0 ? TOP_CUT : TOP_CUT + 6}`);
      }
      scene.pileG.appendChild(
        el('polyline', {
          points: points.join(' '),
          fill: 'none',
          stroke: colors.danger,
          'stroke-width': 2,
        }),
      );
      scene.pileG.appendChild(
        el('path', {
          d: `M ${COL_X + COL_W + 18} ${TOP_CUT + 18} l 6 11 h -12 z`,
          fill: colors.danger,
        }),
      );

      const ticks: SVGLineElement[] = [];
      for (let i = 0; i < 5; i += 1) {
        const tick = el('line', {
          x1: COL_X + 10,
          y1: TOP_CUT + 30 + i * 24,
          x2: COL_X + COL_W - 10,
          y2: TOP_CUT + 30 + i * 24,
          stroke: colors.danger,
          'stroke-width': 2,
          opacity: 0.6,
        });
        scene.pileG.appendChild(tick);
        ticks.push(tick);
      }
      await tween(420, (p) => {
        for (const tick of ticks) tick.setAttribute('transform', `translate(0 ${(-72 * p).toFixed(1)})`);
      });
      for (const tick of ticks) tick.remove();
    }

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },

      setCaption(text: string): void {
        scene.caption.textContent = text;
      },

      /** 후보 하나를 짚고, 차원마다 곱셈 알갱이를 더미로 보낸다. */
      async sweep(step: SweepStep): Promise<void> {
        await rotateSpoke(angleAt(step.index, step.n), 150);
        if (destroyed) return;
        const dot = scene.dots[step.index];
        if (dot) {
          dot.setAttribute('fill', colors.itemComparing);
          dot.setAttribute('stroke', colors.itemComparing);
          dot.setAttribute('r', String(DOT_R + 2));
        }
        const flights: Promise<void>[] = [];
        for (let slot = 0; slot < step.dims; slot += 1) flights.push(flyOne(step, slot, slot * 45));
        await Promise.all(flights);
        if (destroyed) return;
        if (dot) {
          dot.setAttribute('fill', colors.itemSorted);
          dot.setAttribute('stroke', colors.itemSorted);
          dot.setAttribute('r', String(DOT_R));
        }
        total = step.total;
      },

      /** 낱낱의 알갱이가 한 덩이로 굳는다. 이제부터는 높이로만 말한다. */
      async fuse(step: { total: number }): Promise<void> {
        total = step.total;
        const height = total * unit;
        const tiles = [...scene.tilesG.children];
        scene.column.setAttribute('opacity', '1');
        await tween(320, (p) => {
          placeColumn(height * p);
          const gone = Math.floor(p * tiles.length);
          for (let i = 0; i < gone; i += 1) tiles[i]?.setAttribute('opacity', '0');
        });
        if (destroyed) return;
        scene.tilesG.textContent = '';
        placeColumn(height);
        setMark(total, BASE_Y - height);
      },

      /** 수를 키운다. 넘치면 자가 물러서고, 물러설 수 없으면 화면을 벗어난다. */
      async grow(step: ScaleStep): Promise<void> {
        const fromTotal = total;
        const fromUnit = unit;
        const toUnit = fitUnit(step.total, fromUnit, fromTotal);
        beyondFrame = toUnit === fromUnit && step.total * fromUnit > CEIL_H;

        if (fromTotal > 0) addGhost(fromTotal, BASE_Y - fromTotal * fromUnit);
        await Promise.all([
          sweepBand(step.n, 520),
          tweenPile(fromTotal, step.total, fromUnit, toUnit, 520),
        ]);
        if (destroyed) return;
        total = step.total;
        unit = toUnit;
        placeColumn(total * unit);
        setMark(total, BASE_Y - total * unit);
        if (beyondFrame) await burstBeyond();
      },

      /** 처음으로 되돌린다 — 되감기와 reset 이 같은 길을 쓴다. */
      rewind(): void {
        scene = build();
      },
    };
  },
};
