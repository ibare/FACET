/**
 * edit-table-fill stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다
 * (S-scene).
 *
 * ── 어휘를 넷으로 갈랐다
 *
 * 옛 화면은 **칸의 칠 하나**에 세 가지를 실었다 — 방금 찼나, 공짜로 지나갔나,
 * 답인가. 답 칸을 칠하는 순간 그 칸이 공짜였다는 사실이 화면에서 지워지는 자리였다
 * (프로토콜 함정 29). 갈라 두면 부딪히지 않는다.
 *
 * | 무엇 | 어휘 | 말하는 것 |
 * | --- | --- | --- |
 * | 채움 | 칸의 `fill` | **값의 형편** — 비었다 / 방금 찼다 / 차 있다 |
 * | 테두리 | 칸의 `stroke` | **표식** — 이번 걸음에 견주어 보았다 / 이 칸이 답이다 |
 * | 이음선 | 칸과 칸 사이의 짧은 화살 | **값이 실제로 온 길** (`from`) |
 * | 대각선 눈금 | 칸 왼쪽 아래의 짧은 빗금 | **글자가 같아 공짜로 지나갔다** |
 *
 * 눈금은 지워지지 않는다. `itt` 가 그대로 겹치는 자리가 대각선을 따라 줄지어 남는
 * 것이 이 조각이 곁들여 하는 말이다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 표의 값은 `number.textContent` 에, 방금 내려앉은 칸들은 `let landed` 에, 견주어 본
 * 이웃은 `const marked` 라는 DOM 손잡이 집합에 있었다. 그중 `marked` 는 `spread` 가
 * 끝나며 `clearMarks()` 로 지워, **조각이 답하는 질문("한 칸의 값은 어디에서
 * 오는가")이 날아가는 360ms 동안만** 화면에 있었다. 이제 `waves` 하나에서 전부
 * 파생하므로 그 표식이 그 걸음 내내 머문다 (`scene.ts` 의 "다섯 자리").
 *
 * ── 한 걸음에 칸 여럿이 함께 찬다
 *
 * 반대각선 하나가 한 걸음이라 알갱이가 여럿 동시에 날아간다. **시계를 칸마다 나누지
 * 않는다** — 옮길 것을 한 목록에 모아 한 `tween` 으로 흘리므로 `render` 의 Promise 가
 * 전부 내려앉은 뒤에 풀린다 (프로토콜 3-4).
 *
 * ── 좌표
 *
 * 가로는 `PIECE_CANVAS_W` 에서 역산한다 — 칸 폭은 상한만 상수로 두고 남는 폭을
 * 여백으로 버리지 않는다 (S-piece). 세로는 낱말 길이가 정하므로 `drawStatic` 이
 * `viewBox` 를 매번 다시 잡는다 (프로토콜 함정 16).
 *
 * 문안은 `params.t` 로 만든다 (C10).
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
  answerCell,
  colsOf,
  diagonalOf,
  fillAt,
  freshWave,
  letterMatchAt,
  neighborsOf,
  rowsOf,
  sourceCellOf,
  stepCostAt,
  valueAt,
  type EditTableFillScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

// ── 좌표 ────────────────────────────────────────────────────────────────
/** 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산해 그 폭을 채운다 (S-piece). */
const CELL_MAX_W = 62;
const SIDE_MIN = 20;
const CELL_RATIO = 0.6;
const MIN_CELL_H = 28;
const TOP_PAD = 12;
/** 캡션 한 줄이 앉을 아래쪽 띠. */
const CAPTION_BAND = 42;
/** 선언 초기값. 실제 세로는 `drawStatic` 이 낱말 길이에서 매번 다시 잡는다. */
const BASE_H = 350;

/** 이음선이 두 칸 중심을 잇는 선분 위에서 차지하는 구간. */
const LINK_FROM = 0.34;
const LINK_TO = 0.74;
const LINK_HEAD = 6;
const LINK_HALF = 3.6;

/** 구석의 알갱이가 표 **왼쪽 밖** 어디에서 들어오나. */
const ORIGIN_ENTRY = 34;

// ── 지속시간 ────────────────────────────────────────────────────────────
/** 알갱이가 이웃 칸에서 목적지 칸까지 건너가는 시간. 물결선도 같은 시계를 탄다. */
const RIDE_MS = 340;
/** 알갱이가 칸 속으로 가라앉고 그 자리에 수가 서는 시간. */
const LAND_MS = 180;
/** 표 전체를 감싼 테가 답 칸 하나로 오므라드는 시간. */
const RING_MS = 700;
/** 오므라든 테가 사라지는 시간. */
const RING_FADE_MS = 140;

/** clipPath id 충돌 방지 — 한 글에 조각이 여럿 박힐 수 있다. */
let uid = 0;

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

/** 칸의 **값의 형편**. 어디에도 저장하지 않고 걸음마다 장면에서 파생한다. */
type CellFill = 'empty' | 'filled' | 'fresh';
/** 칸의 **표식**. 채움과 다른 축이라 둘이 부딪히지 않는다. */
type CellMark = 'none' | 'read' | 'answer';

/** 자리 셈. 낱말 둘의 길이 하나에서 캔버스를 역산한다. */
type Geom = {
  cellW: number;
  cellH: number;
  originX: number;
  height: number;
  cx(j: number): number;
  cy(i: number): number;
  /** 값이 담기는 칸들만의 테두리 상자. 물결선을 가두고 답의 테가 여기서 출발한다. */
  table: Box;
  cellBox(i: number, j: number): Box;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  /** 찬 칸의 값 글자. 자리로 찾는다. 안 찬 칸에는 아예 없다. */
  valueTexts: Map<string, SVGTextElement>;
  /** 공짜로 지나간 칸의 빗금. */
  ticks: Map<string, SVGLineElement>;
  /** 이번 걸음의 이음선들. 알갱이가 닿은 뒤에 선다. */
  freshLinks: SVGGElement[];
  /** 반대각선을 쓸고 가는 물결선. 답을 말한 걸음에는 없다. */
  waveLine: SVGLineElement | null;
};

const key = (i: number, j: number): string => `${i},${j}`;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 2;
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const lerp = (a: number, b: number, e: number): number => a + (b - a) * e;
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const editTableFillStageView: CanvasView = {
  canvas: { height: BASE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<EditTableFillScene> {
    const c = getColors(params.theme);
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 물결선을 표 안에 가두는 클립. 상자는 `drawStatic` 이 매번 다시 잡는다.
    const clipId = `edit-table-fill-wave-${(uid += 1)}`;
    const clipRect = el('rect', { x: 0, y: 0, width: 0, height: 0 });
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(clipRect);
    const defs = el('defs', {});
    defs.appendChild(clip);

    // ── 켜 (뒤에서 앞으로). 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gGrid = el('g', {});
    const gTick = el('g', {});
    const gWave = el('g', { 'clip-path': `url(#${clipId})` });
    const gLink = el('g', {});
    const gValue = el('g', {});
    const gChip = el('g', {});
    const gText = el('g', {});
    svg.append(defs, gGrid, gTick, gWave, gLink, gValue, gChip, gText);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 두 마디 지나므로, 그 사이에 `destroy` 나 되짚기가 끼어들면
     * 남은 프레임이 **이미 새로 선 화면**을 덮는다. `isInstant` 는 빗장이 아니다 —
     * 러너는 장면 조각에서 그것을 부르지 않는다 (S-scene).
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

    function geomOf(scene: EditTableFillScene): Geom {
      const dataRows = rowsOf(scene);
      const dataCols = colsOf(scene);
      // 글자 머리 행·열이 하나씩 더 붙는다.
      const gridCols = dataCols + 1;
      const gridRows = dataRows + 1;

      // 칸 폭은 상한만 상수다. 남는 폭을 여백으로 버리지 않는다 (S-piece).
      const cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / gridCols));
      const cellH = Math.max(MIN_CELL_H, Math.round(cellW * CELL_RATIO));
      const originX = Math.round((PIECE_CANVAS_W - gridCols * cellW) / 2);
      const height = TOP_PAD + gridRows * cellH + CAPTION_BAND;

      const cx = (j: number): number => originX + (j + 1) * cellW + cellW / 2;
      const cy = (i: number): number => TOP_PAD + (i + 1) * cellH + cellH / 2;

      return {
        cellW,
        cellH,
        originX,
        height,
        cx,
        cy,
        table: {
          x: originX + cellW,
          y: TOP_PAD + cellH,
          w: dataCols * cellW,
          h: dataRows * cellH,
        },
        cellBox: (i, j) => ({
          x: cx(j) - cellW / 2 + 2,
          y: cy(i) - cellH / 2 + 2,
          w: cellW - 4,
          h: cellH - 4,
        }),
      };
    }

    // ── 칸의 형편과 표식 ──────────────────────────────────────────────────

    /** 값이 어디까지 왔나. 옛 `let landed` 와 `settle()` 이 하던 일이다. */
    function fillOf(scene: EditTableFillScene, i: number, j: number): CellFill {
      if (fillAt(scene, i, j) === null) return 'empty';
      return i + j === freshWave(scene) ? 'fresh' : 'filled';
    }

    /**
     * 이 칸에 무슨 표식이 서나. 옛 `const marked` 자리다.
     *
     * 견줌의 표식은 **그 걸음 내내 머문다** — 옛 화면은 알갱이가 내려앉자마자
     * `clearMarks()` 로 지워 정지 화면에 아무것도 남지 않았다.
     */
    function markOf(scene: EditTableFillScene, i: number, j: number, read: ReadonlySet<string>): CellMark {
      if (scene.answered) {
        const answer = answerCell(scene);
        return i === answer.i && j === answer.j ? 'answer' : 'none';
      }
      return read.has(key(i, j)) ? 'read' : 'none';
    }

    /** 이번 걸음에 견주어 본 이웃들. 반대각선 위의 칸들이 저마다 셋씩 본다. */
    function readSetOf(scene: EditTableFillScene): ReadonlySet<string> {
      const k = freshWave(scene);
      if (k === null) return new Set();
      const out = new Set<string>();
      for (const spot of diagonalOf(scene, k)) {
        for (const n of neighborsOf(scene, spot.i, spot.j)) out.add(key(n.i, n.j));
      }
      return out;
    }

    function paintTile(tile: SVGRectElement, fill: CellFill, mark: CellMark): void {
      tile.setAttribute(
        'fill',
        fill === 'empty' ? c.bgSubtle : fill === 'fresh' ? c.itemComparing : c.itemDefault,
      );
      if (mark === 'read') {
        tile.setAttribute('stroke', c.auxCursor);
        tile.setAttribute('stroke-width', '1.8');
      } else if (mark === 'answer') {
        tile.setAttribute('stroke', c.text);
        tile.setAttribute('stroke-width', '2.6');
      } else {
        tile.setAttribute('stroke', c.border);
        tile.setAttribute('stroke-width', '1');
      }
    }

    // ── 이음선. 값이 실제로 온 길 ─────────────────────────────────────────

    function makeLink(from: Pt, to: Pt): SVGGElement {
      const g = el('g', {});
      const a: Pt = { x: lerp(from.x, to.x, LINK_FROM), y: lerp(from.y, to.y, LINK_FROM) };
      const b: Pt = { x: lerp(from.x, to.x, LINK_TO), y: lerp(from.y, to.y, LINK_TO) };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      g.appendChild(
        el('line', {
          x1: a.x.toFixed(2),
          y1: a.y.toFixed(2),
          x2: b.x.toFixed(2),
          y2: b.y.toFixed(2),
          stroke: c.auxCursor,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      );
      const bx = b.x - ux * LINK_HEAD;
      const by = b.y - uy * LINK_HEAD;
      g.appendChild(
        el('path', {
          d:
            `M ${b.x.toFixed(2)} ${b.y.toFixed(2)} ` +
            `L ${(bx - uy * LINK_HALF).toFixed(2)} ${(by + ux * LINK_HALF).toFixed(2)} ` +
            `L ${(bx + uy * LINK_HALF).toFixed(2)} ${(by - ux * LINK_HALF).toFixed(2)} Z`,
          fill: c.auxCursor,
        }),
      );
      return g;
    }

    // ── 값 알갱이. 운동 중에만 있으므로 정적 그리기가 만들지 않는다 ────────

    function makeChip(geom: Geom, value: number, cost: 0 | 1, at: Pt): SVGGElement {
      const g = el('g', { transform: `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})` });
      const w = Math.max(20, Math.min(30, geom.cellW - 22));
      const h = Math.max(16, Math.min(22, geom.cellH - 12));
      g.appendChild(
        el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 5, fill: c.itemSorted }),
      );
      const label = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: c.textInverse,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      label.textContent = String(value);
      g.appendChild(label);
      if (cost === 1) {
        // 수식 표기라 문안이 아니다 (C10).
        const plus = el('text', {
          x: w / 2 + 7,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: c.itemComparing,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        plus.textContent = '+1';
        g.appendChild(plus);
      }
      gChip.appendChild(g);
      return g;
    }

    const moveChip = (g: SVGGElement, at: Pt): void => {
      g.setAttribute('transform', `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`);
    };

    // ── 문안 ──────────────────────────────────────────────────────────────

    /**
     * 그 걸음이 무엇을 말하나. 한 논증의 단계다 — 전제(구석) → 가장자리 → 안쪽 규칙
     * → 답 (S-piece).
     *
     * 몇 번째 반대각선인가도 답의 값도 장면의 자취에서 꺼낸다 — 캡션과 그림이 한
     * 출처다 (C10).
     */
    function captionOf(scene: EditTableFillScene): string {
      const step = scene.step;
      if (step === null) return '';
      if (step.kind === 'answer') {
        const answer = answerCell(scene);
        return t('caption.answer', 'The last cell answers for the whole pair: {n}.', {
          n: valueAt(scene, answer.i, answer.j) ?? 0,
        });
      }
      const k = scene.waves.length - 1;
      if (k <= 0) return t('caption.corner', 'Empty into empty: the corner starts at 0.');
      if (k === 1) {
        return t('caption.edges', 'Along the edges each letter costs one insert or one delete.');
      }
      return t('caption.spread', 'Each cell takes the cheapest of three neighbours already filled.');
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    function rewind(): void {
      gGrid.textContent = '';
      gTick.textContent = '';
      gWave.textContent = '';
      gLink.textContent = '';
      gValue.textContent = '';
      gChip.textContent = '';
      gText.textContent = '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 층을 통째로 비우고 다시 짓는다. 되돌릴 목록을 손으로 관리하지 않으므로 보간이
     * 남긴 `opacity` 나 좌표 끝자리가 남을 자리가 없다 (S-scene).
     */
    function drawStatic(scene: EditTableFillScene): Drawn {
      rewind();
      const geom = geomOf(scene);
      const dataRows = rowsOf(scene);
      const dataCols = colsOf(scene);
      // 세로는 낱말 길이가 정한다. `init` 이 없으므로 여기서 매번 잡는다 (함정 16).
      svg.setAttribute('viewBox', `0 0 ${PIECE_CANVAS_W} ${geom.height}`);
      clipRect.setAttribute('x', String(geom.table.x));
      clipRect.setAttribute('y', String(geom.table.y));
      clipRect.setAttribute('width', String(geom.table.w));
      clipRect.setAttribute('height', String(geom.table.h));

      const read = readSetOf(scene);

      // ── 낱말 글자. 데이터에서 온 글자라 문안이 아니다 (C10).
      for (let j = 1; j < dataCols; j += 1) {
        const letter = el('text', {
          x: geom.cx(j),
          y: TOP_PAD + geom.cellH / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        });
        letter.textContent = scene.target[j - 1];
        gGrid.appendChild(letter);
      }
      for (let i = 1; i < dataRows; i += 1) {
        const letter = el('text', {
          x: geom.originX + geom.cellW / 2,
          y: geom.cy(i),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        });
        letter.textContent = scene.source[i - 1];
        gGrid.appendChild(letter);
      }

      // ── 칸 · 수 · 빗금
      const valueTexts = new Map<string, SVGTextElement>();
      const ticks = new Map<string, SVGLineElement>();
      for (let i = 0; i < dataRows; i += 1) {
        for (let j = 0; j < dataCols; j += 1) {
          const box = geom.cellBox(i, j);
          const tile = el('rect', {
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            rx: 6,
          });
          const fill = fillOf(scene, i, j);
          const mark = markOf(scene, i, j, read);
          paintTile(tile, fill, mark);
          gGrid.appendChild(tile);
          if (fill === 'empty') continue;

          // 아직 없는 것은 숨기지 말고 짓지 않는다 (함정 17).
          const isAnswer = mark === 'answer';
          const number = el('text', {
            x: geom.cx(j),
            y: geom.cy(i),
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            fill: fill === 'fresh' ? c.stateInk : c.text,
            'font-family': fonts.mono,
            'font-size': isAnswer ? fontSizes.lg : fontSizes.md,
            'font-weight': isAnswer ? '700' : '400',
          });
          number.textContent = String(valueAt(scene, i, j) ?? 0);
          gValue.appendChild(number);
          valueTexts.set(key(i, j), number);

          // 글자가 같아 공짜로 지나간 자리. 지워지지 않고 대각선을 따라 남는다.
          if (!letterMatchAt(scene, i, j)) continue;
          const span = Math.min(12, Math.round(geom.cellW / 4));
          const tick = el('line', {
            x1: (box.x + 5).toFixed(2),
            y1: (box.y + box.h - 5 - span).toFixed(2),
            x2: (box.x + 5 + span).toFixed(2),
            y2: (box.y + box.h - 5).toFixed(2),
            stroke: c.accent,
            'stroke-width': 2.6,
            'stroke-linecap': 'round',
          });
          gTick.appendChild(tick);
          ticks.set(key(i, j), tick);
        }
      }

      // ── 물결선. 이번 반대각선을 쓸고 지나간다.
      const k = freshWave(scene);
      let waveLine: SVGLineElement | null = null;
      if (k !== null) {
        const span = Math.max(dataRows, dataCols) + 1;
        waveLine = el('line', {
          x1: geom.cx(0) + span * geom.cellW,
          y1: geom.cy(0) - span * geom.cellH,
          x2: geom.cx(0) - span * geom.cellW,
          y2: geom.cy(0) + span * geom.cellH,
          stroke: c.auxCursor,
          'stroke-width': 2,
          'stroke-dasharray': '5 6',
          'stroke-linecap': 'round',
          opacity: '0.55',
          transform: `translate(${k * geom.cellW} 0)`,
        });
        gWave.appendChild(waveLine);
      }

      // ── 이음선. 이번 걸음의 칸들이 어느 이웃에서 값을 받았나.
      const freshLinks: SVGGElement[] = [];
      if (k !== null) {
        for (const spot of diagonalOf(scene, k)) {
          const cell = fillAt(scene, spot.i, spot.j);
          if (cell === null) continue;
          const src = sourceCellOf(spot.i, spot.j, cell.from);
          if (src === null) continue;
          const link = makeLink(
            { x: geom.cx(src.j), y: geom.cy(src.i) },
            { x: geom.cx(spot.j), y: geom.cy(spot.i) },
          );
          gLink.appendChild(link);
          freshLinks.push(link);
        }
      }

      // ── 캡션
      const caption = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: geom.height - CAPTION_BAND / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      caption.textContent = captionOf(scene);
      gText.appendChild(caption);

      return { geom, valueTexts, ticks, freshLinks, waveLine };
    }

    // ── 운동. 정적 그리기가 끝 자리를 세웠으므로 아직 못 온 만큼을 뒤로 물린다 ──

    /**
     * 반대각선 하나가 이웃에서 값을 받아 한꺼번에 찬다.
     *
     * 알갱이가 여럿 날아가고 물결선이 함께 밀려오지만 **한 뜻으로 묶인 운동**이라
     * 시계는 하나다 (프로토콜 3-4). 그러니 `render` 의 Promise 는 전부 내려앉은
     * 뒤에 풀린다.
     */
    async function flowWave(
      scene: EditTableFillScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const k = freshWave(scene);
      if (k === null) return;
      const geom = drawn.geom;

      type Ride = {
        chip: SVGGElement;
        from: Pt;
        to: Pt;
        text: SVGTextElement | null;
        tick: SVGLineElement | null;
      };

      const rides: Ride[] = [];
      for (const spot of diagonalOf(scene, k)) {
        const cell = fillAt(scene, spot.i, spot.j);
        if (cell === null) continue;
        const to: Pt = { x: geom.cx(spot.j), y: geom.cy(spot.i) };
        const src = sourceCellOf(spot.i, spot.j, cell.from);
        // 구석은 표 안에 올 데가 없다 — 알갱이가 표 **밖에서** 들어온다.
        const from: Pt =
          src === null
            ? { x: geom.originX - ORIGIN_ENTRY, y: to.y }
            : { x: geom.cx(src.j), y: geom.cy(src.i) };
        const carried = src === null ? cell.value : (valueAt(scene, src.i, src.j) ?? 0);
        const cost = stepCostAt(scene, spot.i, spot.j) ?? 0;

        const text = drawn.valueTexts.get(key(spot.i, spot.j)) ?? null;
        const tick = drawn.ticks.get(key(spot.i, spot.j)) ?? null;
        text?.setAttribute('opacity', '0');
        tick?.setAttribute('opacity', '0');
        rides.push({ chip: makeChip(geom, carried, cost, from), from, to, text, tick });
      }
      for (const link of drawn.freshLinks) link.setAttribute('opacity', '0');

      const waveFrom = (k - 1) * geom.cellW;
      const waveTo = k * geom.cellW;
      await tween(RIDE_MS, mine, (p) => {
        const e = easeInOut(p);
        drawn.waveLine?.setAttribute('transform', `translate(${lerp(waveFrom, waveTo, e).toFixed(2)} 0)`);
        for (const ride of rides) {
          moveChip(ride.chip, {
            x: lerp(ride.from.x, ride.to.x, e),
            y: lerp(ride.from.y, ride.to.y, e),
          });
        }
      });
      if (!alive(mine)) return;
      // 값이 닿았으니 그 길이 선다.
      for (const link of drawn.freshLinks) link.removeAttribute('opacity');

      await tween(LAND_MS, mine, (p) => {
        const e = easeOut(p);
        for (const ride of rides) {
          ride.chip.setAttribute('opacity', (1 - e).toFixed(3));
          ride.text?.setAttribute('opacity', e.toFixed(3));
          ride.tick?.setAttribute('opacity', e.toFixed(3));
        }
      });
    }

    /**
     * 표 전체를 감싼 테가 오른쪽 아래 한 칸으로 오므라든다.
     *
     * 동사가 그 걸음이 하는 말과 같다 — "이 표 전체가 이 한 칸으로 모인다".
     * 테는 운동 중에만 있으므로 정적 그리기가 만들지 않는다 (함정 27).
     */
    async function flowAnswer(
      scene: EditTableFillScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const geom = drawn.geom;
      const answer = answerCell(scene);
      const start = geom.table;
      const end = geom.cellBox(answer.i, answer.j);
      const ring = el('rect', {
        x: start.x,
        y: start.y,
        width: start.w,
        height: start.h,
        rx: 8,
        fill: 'none',
        stroke: c.text,
        'stroke-width': 2.4,
      });
      gChip.appendChild(ring);

      await tween(RING_MS, mine, (p) => {
        const e = easeInOut(p);
        ring.setAttribute('x', lerp(start.x, end.x - 3, e).toFixed(2));
        ring.setAttribute('y', lerp(start.y, end.y - 3, e).toFixed(2));
        ring.setAttribute('width', lerp(start.w, end.w + 6, e).toFixed(2));
        ring.setAttribute('height', lerp(start.h, end.h + 6, e).toFixed(2));
      });
      if (!alive(mine)) return;
      await tween(RING_FADE_MS, mine, (p) => {
        ring.setAttribute('opacity', (1 - p).toFixed(3));
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: EditTableFillScene,
      _prev: EditTableFillScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      if (step.kind === 'wave') await flowWave(next, drawn, mine);
      else await flowAnswer(next, drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 `opacity` 와 좌표 끝자리, 건너온 알갱이가 노드째 사라진다.
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
        // (S-piece). 취소된 rAF 는 tick 을 아예 부르지 않으므로 여기가 유일한 길이다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
