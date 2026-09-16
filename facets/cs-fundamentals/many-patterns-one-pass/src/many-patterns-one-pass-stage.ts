/**
 * many-patterns-one-pass-stage — 여러 패턴이 한 줄기로 흐르는 화면.
 *
 * 형태는 동사에서 나왔다. "한 줄기로 흐른다" 이므로 화면은 왼쪽에서 오른쪽으로
 * 흐르는 축 하나를 갖는다. 깊이가 열이 되어 나무도 오른쪽으로 자라고, 텍스트도
 * 오른쪽으로 읽힌다. 읽는 자리와 나무의 자리를 잇는 줄기 한 가닥이 걸음마다
 * 움직인다.
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`layPatterns()` · `buildTrie()` · `readChar()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의
 * 화면 전체**를 세운다 (S-scene). 장면의 모양은 `scene.ts`.
 *
 * 좌표는 무늬 목록과 텍스트 하나로 결정되는 **최종** 모양에서 셈한다 — 지금까지 선
 * 마디만으로 셈하면 자리가 걸음마다 흔들린다. 자리를 **먼저 한 번에 셈하고 그 다음에
 * 그린다** (프로토콜 4절: 그리면서 재면 순회 순서가 곧 숨은 상태가 된다).
 *
 * ── 나눠 쓴 길은 **남는다**
 *
 * 옮기기 전에는 포개는 운동이 끝나자마자 같은 자리에 내려앉은 칸을 지워 버려, 다 끝난
 * 화면에 세 무늬가 나눠 쓴 마디와 혼자 난 마디의 구별이 없었다. 이제 **테두리가
 * 나눠 쓴 표식**이다 — 나눠 쓴 마디는 굵고 진한 테를 두르고 그 가지도 굵어진다.
 * **채움은 값의 형편**(여기서 무늬가 걸렸나) 으로 남겨 두어 둘이 부딪히지 않는다.
 * 지금 선 자리는 칸 바깥의 **고리**라 셋이 한 화면에 같이 선다.
 *
 * 세로는 그림이 정하는 값이라 여기 상수로 둔다. 가로는 러너가 PIECE_CANVAS_W 로
 * 정한다 (S-piece / S-view). 색은 design-tokens 만 쓴다 (S-view). 문안은 `params.t`
 * 로만 짓는다 (C10) — 이 파일의 en 원본은 조회가 빗나갔을 때의 되받이다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import { ROOT, manyPatternsOnePassNodes } from './algorithm.js';
import { cursorAt, foundCount, lastMove, readIndex, sharedByCount } from './scene.js';
import type { ManyPatternsOnePassScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_H = 352;

/** 좌우 최소 여백. 칸 크기는 이 값을 빼고 캔버스에서 역산한다. */
const SIDE_MIN = 34;
/** 텍스트 칸 폭의 상한. 글자가 몇 개든 캔버스를 넘지 않게 상한만 둔다. */
const CELL_MAX_W = 84;
const CELL_H = 44;
const CELL_GAP = 6;

const TILE_W = 46;
const TILE_H = 32;

/** 포개기 전 패턴 넉 줄이 놓이는 자리. */
const PATTERN_TOP = 34;
const PATTERN_PITCH = 38;

/** 나무가 차지하는 세로 구간. 잎의 수로 줄 간격을 역산한다. */
const TREE_TOP = 36;
const TREE_BOTTOM = 156;

const CELL_TOP = 196;
const RIBBON_Y = 250;
const RIBBON_H = 6;

const LANE_TOP = 260;
const LANE_PITCH = 22;
const TAG_H = 18;
/** 겹치는 딱지를 쌓을 수 있는 줄 수. 넘치면 마지막 줄에 포갠다. */
const MAX_LANES = 3;

const CAPTION_Y = 341;

const DUR_LAY = 460;
const DUR_MERGE = 560;
const DUR_STEP = 380;
const DUR_SLIDE_BACK = 240;
const DUR_SLIDE_DOWN = 300;
const DUR_MATCH = 440;
const DUR_FINISH = 520;

/** 길이 없을 때 밀어 보고 되돌아오는 거리. */
const NUDGE_X = 14;
const SPARK_W = 54;
/** 뿌리가 왼쪽에서 들어오는 거리. */
const ROOT_ENTER = 60;

/** 나눠 쓴 길 / 혼자 난 길. 굵기와 진하기가 곧 "몇이 지나갔나" 의 표식이다. */
const SHARED_EDGE_W = 3.5;
const PLAIN_EDGE_W = 2;
const SHARED_TILE_W = 3;
const PLAIN_TILE_W = 1.5;
/** 둘 이상이 지나면 나눠 쓴 길이다. */
const SHARED_MIN = 2;

/** 다 훑은 뒤 커서와 줄기가 물러나는 정도. */
const RETIRED_OPACITY = 0.35;

/** 패턴 이름을 늘어놓을 때 쓰는 기호. 문장이 아니라 구분 표식이다. */
const NAME_SEP = ' · ';

type Point = { x: number; y: number };

/** DOM 손잡이만 묶는다 — 뜻이나 수치는 장면이 쥔다. */
type Tile = { g: SVGElement; rect: SVGElement; label: SVGElement };

type Rect = { x: number; y: number; w: number; h: number };

/**
 * 무늬 목록과 텍스트 하나로 결정되는 자리들. 그리기 전에 한 번에 셈한다.
 */
type Geometry = {
  cellW: number;
  streamW: number;
  originX: number;
  nodePos: Map<string, Point>;
  colX: (depth: number) => number;
  cellX: (index: number) => number;
};

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function computeGeometry(patterns: string[], text: string): Geometry {
  const cellCount = Math.max(1, text.length);
  const cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / cellCount));
  const streamW = cellW * cellCount;
  const originX = Math.round((PIECE_CANVAS_W - streamW) / 2);

  const maxLen = patterns.reduce((m, p) => Math.max(m, p.length), 0);
  const colW = streamW / (maxLen + 1);
  const colX = (depth: number): number => originX + colW * (depth + 0.5);
  const cellX = (index: number): number => originX + cellW * (index + 0.5);

  // 나무의 자리는 잎을 세어 역산한다 — 선언에 좌표를 두지 않는다.
  // 마디 id 가 뿌리부터 이은 글자라 부모도 깊이도 id 에서 나온다.
  const childrenOf = new Map<string, string[]>();
  for (const node of manyPatternsOnePassNodes(patterns)) {
    if (node.id === ROOT) continue;
    const parent = node.id.slice(0, -1);
    const siblings = childrenOf.get(parent) ?? [];
    siblings.push(node.id);
    childrenOf.set(parent, siblings);
  }

  const countLeaves = (id: string): number => {
    const children = childrenOf.get(id) ?? [];
    if (children.length === 0) return 1;
    return children.reduce((sum, child) => sum + countLeaves(child), 0);
  };
  const leaves = Math.max(1, countLeaves(ROOT));
  const pitch = leaves > 1 ? (TREE_BOTTOM - TREE_TOP) / (leaves - 1) : 0;

  const nodePos = new Map<string, Point>();
  let slot = 0;
  const place = (id: string): number => {
    const children = childrenOf.get(id) ?? [];
    let y: number;
    if (children.length === 0) {
      y = TREE_TOP + pitch * slot;
      slot += 1;
    } else {
      const ys = children.map(place);
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    nodePos.set(id, { x: colX(id.length), y });
    return y;
  };
  place(ROOT);

  return { cellW, streamW, originX, nodePos, colX, cellX };
}

/** 걸린 무늬가 텍스트에서 차지하는 구간과 그것이 앉을 줄. */
type Span = { pattern: string; start: number; end: number; lane: number };

/**
 * 걸린 목록에서 딱지의 자리를 **그릴 때마다 새로 셈한다.**
 *
 * 옮기기 전에는 `const lanes` 가 한 번 정한 자리를 제자리에서 쌓아 두었다 —
 * 되감아도 비워지지 않아 두 번째 재생의 딱지가 엉뚱한 줄에 앉았다.
 */
function spansOf(scene: ManyPatternsOnePassScene): Span[] {
  const taken: { start: number; end: number }[][] = [];
  const out: Span[] = [];
  for (const caught of scene.catches) {
    for (const pattern of caught.patterns) {
      const end = caught.at;
      const start = end - pattern.length + 1;
      let lane = MAX_LANES - 1;
      for (let i = 0; i < MAX_LANES; i += 1) {
        const rows = taken[i] ?? [];
        if (rows.every((span) => end < span.start || start > span.end)) {
          rows.push({ start, end });
          taken[i] = rows;
          lane = i;
          break;
        }
      }
      out.push({ pattern, start, end, lane });
    }
  }
  return out;
}

/** 무늬의 글자 하나하나가 어느 마디에 내려앉나. 무늬 목록에서 바로 나온다. */
function arrivalsOf(patterns: string[]): { nodeId: string; char: string; row: number }[] {
  const out: { nodeId: string; char: string; row: number }[] = [];
  patterns.forEach((pattern, row) => {
    for (let i = 0; i < pattern.length; i += 1) {
      out.push({ nodeId: pattern.slice(0, i + 1), char: pattern.charAt(i), row });
    }
  });
  return out;
}

function rowYOf(row: number): number {
  return PATTERN_TOP + PATTERN_PITCH * row;
}

/** 장면 설계 + 그리는 이. 러너가 이 둘을 짝지어 쓴다. */
export type ManyPatternsOnePassStage = ViewInstance &
  SceneRenderer<ManyPatternsOnePassScene>;

export const manyPatternsOnePassStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ManyPatternsOnePassStage {
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;

    // ── 그리는 차례가 곧 앞뒤 차례다.
    const root = document.createElementNS(SVG_NS, 'g');
    const gEdges = document.createElementNS(SVG_NS, 'g');
    const gWire = document.createElementNS(SVG_NS, 'g');
    const gTiles = document.createElementNS(SVG_NS, 'g');
    const gCursor = document.createElementNS(SVG_NS, 'g');
    const gText = document.createElementNS(SVG_NS, 'g');
    const gRibbon = document.createElementNS(SVG_NS, 'g');
    const gTags = document.createElementNS(SVG_NS, 'g');
    const layers = [gEdges, gWire, gTiles, gCursor, gText, gRibbon, gTags];
    for (const layer of layers) root.appendChild(layer);

    // 캡션은 재건 밖의 요소다. 정적 경로가 **매번 명시로** 문안을 쓴다 — 쓰지 않으면
    // 앞 걸음의 문장이 남아 되짚기 판정에서 어긋난다 (프로토콜 4절).
    const caption = document.createElementNS(SVG_NS, 'text');
    for (const [key, value] of Object.entries({
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    })) {
      caption.setAttribute(key, String(value));
    }
    root.appendChild(caption);
    canvas.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /**
     * 세대 빗장. `render` 가 부를 때마다 하나 올린다.
     *
     * 흐르는 요소는 정적 그리기가 매번 새로 만들지만 그것을 잡아 두는 **클로저
     * 변수**(`nodeTiles` · `cursorRing` · `ribbonFill`)는 새로 만들어지지 않는다.
     * 되짚기가 가운데 끼어들면 앞 세대의 프레임이 깨어나 새 손잡이를 타고 **살아
     * 있는 화면**에 옛 좌표를 쓴다. 걸음 함수는 깨어날 때마다 자기 세대가 유효한지
     * 보고 아니면 화면에 손대지 않고 물러난다 (S-scene).
     */
    let gen = 0;

    function alive(myGen: number): boolean {
      return !destroyed && myGen === gen;
    }

    /** t=0..1 프레임마다 그리는 rAF 트윈. 첫 프레임은 동기로 그린다. */
    function tween(myGen: number, ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(myGen) || typeof requestAnimationFrame !== 'function') {
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const frame = (): void => {
          frames.delete(id);
          if (!alive(myGen)) {
            finish();
            return;
          }
          const raw = clamp01((Date.now() - start) / ms);
          draw(raw);
          if (raw >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        // 정적 그리기가 이미 끝 자리에 세워 두었으므로 출발 자리로 물리는 것을 다음
        // 프레임에 미루면 끝 자리가 한 번 번쩍인다.
        draw(0);
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    function el(
      parent: Element | null,
      tag: string,
      attrs: Record<string, string | number>,
    ): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      parent?.appendChild(node);
      return node;
    }

    function makeTile(parent: Element, char: string, x: number, y: number): Tile {
      const g = el(parent, 'g', { transform: `translate(${x} ${y})` });
      const rect = el(g, 'rect', {
        x: -TILE_W / 2,
        y: -TILE_H / 2,
        width: TILE_W,
        height: TILE_H,
        rx: 7,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': PLAIN_TILE_W,
      });
      const label = el(g, 'text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      label.textContent = char;
      return { g, rect, label };
    }

    function paintTile(
      tile: Tile,
      fill: string,
      ink: string,
      stroke: string,
      width: number,
    ): void {
      tile.rect.setAttribute('fill', fill);
      tile.rect.setAttribute('stroke', stroke);
      tile.rect.setAttribute('stroke-width', String(width));
      tile.label.setAttribute('fill', ink);
    }

    function moveTile(tile: Tile, x: number, y: number): void {
      tile.g.setAttribute('transform', `translate(${x} ${y})`);
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 것을 전부 다시 세운다. 되돌릴 명령이 필요 없고,
    // 흐르며 남은 속성이 다음 화면으로 새지 않는다.

    /** 이번에 세운 자리. 걸음 함수가 출발 자리를 여기서 찾는다. */
    let geo: Geometry = computeGeometry([], '');
    /** 정적 그리기가 매번 다시 만드는 손잡이들. 걸음 함수가 물렸다 되돌린다. */
    const nodeTiles = new Map<string, Tile>();
    const edgeLines = new Map<string, { line: SVGElement; from: Point; to: Point }>();
    let rowTiles: { tile: Tile; homeX: number; row: number }[] = [];
    let terminalDots: SVGElement[] = [];
    let tagFlights: { rect: SVGElement; label: SVGElement; to: Rect }[] = [];
    let ribbonFill: SVGElement | null = null;
    let connector: SVGElement | null = null;
    let cursorRing: SVGElement | null = null;
    let rootMark: SVGElement | null = null;

    function posOf(id: string): Point {
      return geo.nodePos.get(id) ?? { x: geo.colX(0), y: (TREE_TOP + TREE_BOTTOM) / 2 };
    }

    /** 읽는 자리와 나무의 자리를 잇는 줄기 한 가닥. */
    function setConnector(nodeX: number, nodeY: number, textX: number): void {
      const top = nodeY + TILE_H / 2;
      const mid = (top + CELL_TOP) / 2;
      connector?.setAttribute(
        'd',
        `M ${nodeX} ${top} L ${nodeX} ${mid} L ${textX} ${mid} L ${textX} ${CELL_TOP}`,
      );
    }

    function setCursor(x: number, y: number): void {
      cursorRing?.setAttribute('transform', `translate(${x} ${y})`);
    }

    function setRibbon(width: number): void {
      ribbonFill?.setAttribute('width', String(Math.max(0, width)));
    }

    /** 텍스트 칸과 띠. 칠도 길이도 읽은 글자 수 하나에서 나온다. */
    function drawStream(scene: ManyPatternsOnePassScene): void {
      const at = readIndex(scene);
      for (let i = 0; i < scene.text.length; i += 1) {
        const g = el(gText, 'g', {
          transform: `translate(${geo.cellX(i)} ${CELL_TOP + CELL_H / 2})`,
        });
        const rect = el(g, 'rect', {
          x: -(geo.cellW - CELL_GAP) / 2,
          y: -CELL_H / 2,
          width: geo.cellW - CELL_GAP,
          height: CELL_H,
          rx: 8,
          'stroke-width': PLAIN_TILE_W,
        });
        const label = el(g, 'text', {
          x: 0,
          y: 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
        });
        label.textContent = scene.text.charAt(i);
        const tile = { g, rect, label };
        // 채움 = 읽기의 형편. 지금 읽는 칸 · 지나온 칸 · 아직 안 온 칸.
        if (i === at) paintTile(tile, colors.itemActive, colors.stateInk, colors.itemActive, PLAIN_TILE_W);
        else if (i < at) {
          paintTile(tile, colors.itemSorted, colors.textInverse, colors.itemSorted, PLAIN_TILE_W);
        } else paintTile(tile, colors.itemDefault, colors.text, colors.border, PLAIN_TILE_W);
      }

      el(gRibbon, 'rect', {
        x: geo.originX,
        y: RIBBON_Y,
        width: geo.streamW,
        height: RIBBON_H,
        rx: RIBBON_H / 2,
        fill: colors.border,
      });
      // 띠가 어디까지 찼나는 읽은 글자 수 그대로다 — 화면의 지금 자리를 따로 적어
      // 두면 되짚은 직후에 그 거울이 옛 화면의 것이 된다 (프로토콜 함정 28).
      ribbonFill = el(gRibbon, 'rect', {
        x: geo.originX,
        y: RIBBON_Y,
        width: scene.reads.length * geo.cellW,
        height: RIBBON_H,
        rx: RIBBON_H / 2,
        fill: colors.textMuted,
      });
    }

    /** 포개기 전 — 무늬가 넉 줄로 놓인다. */
    function drawRows(scene: ManyPatternsOnePassScene): void {
      for (const arrival of arrivalsOf(scene.patterns)) {
        const homeX = geo.colX(arrival.nodeId.length);
        rowTiles.push({
          tile: makeTile(gTiles, arrival.char, homeX, rowYOf(arrival.row)),
          homeX,
          row: arrival.row,
        });
      }
    }

    /** 포갠 뒤 — 한 나무. 나눠 쓴 길이 여기서 **남는 표식**으로 선다. */
    function drawTree(scene: ManyPatternsOnePassScene): void {
      const share = sharedByCount(scene.patterns);
      // 어느 마디에서 무늬가 걸렸나. 되돌리는 명령이 없어 쌓이던 칠이었고,
      // 그 누적이 곧 이 조각의 뒤쪽 결론이다.
      const caughtAt = new Set<string>();
      for (const caught of scene.catches) {
        const read = scene.reads[caught.at];
        if (read) caughtAt.add(read.to);
      }

      // 가지가 먼저다 — 마디 칸이 그 위에 앉는다.
      for (const node of manyPatternsOnePassNodes(scene.patterns)) {
        if (node.id === ROOT) continue;
        const from = posOf(node.id.slice(0, -1));
        const to = posOf(node.id);
        const shared = (share.get(node.id) ?? 0) >= SHARED_MIN;
        const line = el(gEdges, 'line', {
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          stroke: shared ? colors.primary : colors.border,
          'stroke-width': shared ? SHARED_EDGE_W : PLAIN_EDGE_W,
        });
        edgeLines.set(node.id, { line, from, to });
      }

      const rootHome = posOf(ROOT);
      rootMark = el(gTiles, 'g', { transform: `translate(${rootHome.x} ${rootHome.y})` });
      el(rootMark, 'rect', {
        x: -13,
        y: -13,
        width: 26,
        height: 26,
        rx: 8,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': PLAIN_TILE_W,
      });
      el(rootMark, 'circle', { cx: 0, cy: 0, r: 3.5, fill: colors.textMuted });

      terminalDots = [];
      for (const node of manyPatternsOnePassNodes(scene.patterns)) {
        if (node.id === ROOT) continue;
        const at = posOf(node.id);
        const tile = makeTile(gTiles, node.id.slice(-1), at.x, at.y);
        const shared = (share.get(node.id) ?? 0) >= SHARED_MIN;
        const caught = caughtAt.has(node.id);
        // 채움 = 값의 형편(여기서 걸렸나), 테두리 = 나눠 쓴 표식. 갈라 두면
        // 둘이 한 화면에 함께 선다 (프로토콜 함정 29).
        paintTile(
          tile,
          caught ? colors.itemPivot : colors.itemDefault,
          caught ? colors.stateInk : colors.text,
          shared ? colors.primary : colors.border,
          shared ? SHARED_TILE_W : PLAIN_TILE_W,
        );
        nodeTiles.set(node.id, tile);

        if (!node.terminal) continue;
        terminalDots.push(
          el(gEdges, 'circle', {
            cx: at.x,
            cy: at.y + TILE_H / 2 + 7,
            r: 3.5,
            fill: colors.accent,
            opacity: 1,
          }),
        );
      }
    }

    /** 걸린 딱지들. 텍스트의 그 구간 아래에 앉아 **남는다.** */
    function drawTags(scene: ManyPatternsOnePassScene): void {
      for (const span of spansOf(scene)) {
        const to: Rect = {
          x: geo.originX + span.start * geo.cellW + CELL_GAP / 2,
          y: LANE_TOP + LANE_PITCH * span.lane,
          w: (span.end - span.start + 1) * geo.cellW - CELL_GAP,
          h: TAG_H,
        };
        const g = el(gTags, 'g', {});
        const rect = el(g, 'rect', {
          x: to.x,
          y: to.y,
          width: to.w,
          height: to.h,
          rx: 7,
          fill: colors.itemPivot,
        });
        const label = el(g, 'text', {
          x: to.x + to.w / 2,
          y: to.y + to.h / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.stateInk,
        });
        label.textContent = span.pattern;
        tagFlights.push({ rect, label, to });
      }
    }

    /** 지금 선 자리의 고리와, 읽는 자리로 이어진 줄기. */
    function drawCursorAndWire(scene: ManyPatternsOnePassScene): void {
      const at = cursorAt(scene);
      if (at === null) return;
      const home = posOf(at);
      // 다 훑은 뒤에는 물러난다. 그 물러남 자체가 "끝났다" 의 표식이라 정적으로
      // 매번 명시로 쓴다.
      const dim = scene.done ? RETIRED_OPACITY : 1;
      cursorRing = el(gCursor, 'rect', {
        x: -(TILE_W + 10) / 2,
        y: -(TILE_H + 10) / 2,
        width: TILE_W + 10,
        height: TILE_H + 10,
        rx: 10,
        fill: 'none',
        stroke: colors.itemActive,
        'stroke-width': 3,
        opacity: dim,
        transform: `translate(${home.x} ${home.y})`,
      });

      const index = readIndex(scene);
      // 아직 아무 글자도 안 읽었으면 줄기는 **짓지 않는다** — 숨기기만 하면 앞
      // 걸음의 `d` 가 남는다 (프로토콜 함정 17·27).
      if (index < 0) return;
      connector = el(gWire, 'path', {
        d: '',
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-width': PLAIN_TILE_W,
        'stroke-dasharray': '4 4',
        opacity: dim,
      });
      setConnector(home.x, home.y, geo.cellX(index));
    }

    /** 무엇을 말할지는 `step` 이 그대로 말하고, 문자는 여기서 만든다 (C10). */
    function captionOf(scene: ManyPatternsOnePassScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'lay':
          // 따로 훑을 때의 지나감 횟수는 무늬 수 그대로다.
          return t(
            'caption.separate',
            'Searched one at a time, each pattern needs its own pass: {n}.',
            { n: scene.patterns.length },
          );
        case 'merge':
          return t('caption.merge', 'Shared prefixes fold into one tree. Nodes in all: {n}.', {
            n: manyPatternsOnePassNodes(scene.patterns).length,
          });
        case 'read': {
          const char = scene.text.charAt(readIndex(scene));
          const move = lastMove(scene);
          if (move === 'stay') {
            return t('caption.stay', '"{char}" — no path from the root, so the cursor stays.', {
              char,
            });
          }
          if (move === 'slide') {
            return t(
              'caption.slide',
              '"{char}" — the path ends, so the cursor slips back and goes down again.',
              { char },
            );
          }
          return t('caption.descend', '"{char}" — one step down the tree.', { char });
        }
        case 'catch': {
          const caught = scene.catches[scene.catches.length - 1];
          const names = (caught?.patterns ?? []).join(NAME_SEP);
          if ((caught?.patterns.length ?? 0) > 1) {
            return t(
              'caption.matchPair',
              'Two patterns end at this one node, caught together: {names}.',
              { names },
            );
          }
          return t('caption.matchOne', 'A pattern ends here: {names}.', { names });
        }
        case 'finish':
          // 찾은 수는 걸린 목록에서 센다 — 그림과 같은 자료를 쓴다.
          return t('caption.done', 'One pass over the text, and the matches found: {n}.', {
            n: foundCount(scene),
          });
      }
    }

    /** 그 장면의 화면 **전체**를 세운다. */
    function settle(scene: ManyPatternsOnePassScene): void {
      geo = computeGeometry(scene.patterns, scene.text);
      for (const layer of layers) layer.textContent = '';
      nodeTiles.clear();
      edgeLines.clear();
      rowTiles = [];
      terminalDots = [];
      tagFlights = [];
      ribbonFill = null;
      connector = null;
      cursorRing = null;
      rootMark = null;

      drawStream(scene);
      if (scene.merged) drawTree(scene);
      else if (scene.laid) drawRows(scene);
      drawTags(scene);
      drawCursorAndWire(scene);
      caption.textContent = captionOf(scene);
    }

    // ── 흐르게 하는 것 ─────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 운동은 **아직 못 온 만큼을 뒤로
    // 물리는** 꼴이 된다.

    /** 무늬 넉 줄이 왼쪽에서 미끄러져 들어온다. */
    function flowLay(scene: ManyPatternsOnePassScene, myGen: number): Promise<void> {
      const rows = Math.max(1, scene.patterns.length);
      const maxDelay = 0.12 * (rows - 1);
      return tween(myGen, DUR_LAY, (p) => {
        for (const entry of rowTiles) {
          const sub = ease(clamp01((p - 0.12 * entry.row) / Math.max(0.001, 1 - maxDelay)));
          moveTile(entry.tile, lerp(-TILE_W, entry.homeX, sub), rowYOf(entry.row));
        }
      });
    }

    /**
     * 넉 줄이 한 나무로 내려앉는다.
     *
     * 같은 마디에 앉는 두 번째·세 번째 글자는 정적 화면에 없는 칸이라 **잠깐 짓는다** —
     * 그것들이 한 자리로 모이는 것이 곧 "합친다" 의 운동이다. 뿌리가 들어오는 것도
     * 가지가 뻗는 것도 한 뜻으로 묶인 운동이라 **한 시계**로 흘린다 (프로토콜 3-4).
     */
    async function flowMerge(
      scene: ManyPatternsOnePassScene,
      myGen: number,
    ): Promise<void> {
      const seen = new Set<string>();
      const movers: { tile: Tile; rowY: number; to: Point }[] = [];
      const ghosts: Tile[] = [];
      for (const arrival of arrivalsOf(scene.patterns)) {
        const to = geo.nodePos.get(arrival.nodeId);
        if (!to) continue;
        let tile: Tile | undefined;
        if (seen.has(arrival.nodeId)) {
          tile = makeTile(gTiles, arrival.char, to.x, rowYOf(arrival.row));
          ghosts.push(tile);
        } else {
          seen.add(arrival.nodeId);
          tile = nodeTiles.get(arrival.nodeId);
        }
        if (!tile) continue;
        movers.push({ tile, rowY: rowYOf(arrival.row), to });
      }

      const rootHome = posOf(ROOT);
      const edges = [...edgeLines.values()];
      await tween(myGen, DUR_MERGE, (p) => {
        const fold = ease(clamp01(p / 0.65));
        rootMark?.setAttribute(
          'transform',
          `translate(${lerp(geo.originX - ROOT_ENTER, rootHome.x, fold)} ${rootHome.y})`,
        );
        // 열이 깊이로 정해져 있어 가로는 처음부터 제자리다. 내려앉는 것만 보인다.
        for (const mover of movers) moveTile(mover.tile, mover.to.x, lerp(mover.rowY, mover.to.y, fold));
        const grow = ease(clamp01((p - 0.5) / 0.5));
        for (const edge of edges) {
          edge.line.setAttribute('x2', String(lerp(edge.from.x, edge.to.x, grow)));
          edge.line.setAttribute('y2', String(lerp(edge.from.y, edge.to.y, grow)));
        }
        for (const dot of terminalDots) dot.setAttribute('opacity', String(grow));
      });
      for (const ghost of ghosts) ghost.g.remove();
    }

    /**
     * 글자 하나를 읽고 커서가 옮겨 간다.
     *
     * 출발 자리는 앞 읽기의 마디이고 띠와 줄기의 출발은 읽은 글자 수다 — 화면을
     * 되읽지도, `prev` 를 들추지도 않는다 (S-scene).
     */
    async function flowRead(
      scene: ManyPatternsOnePassScene,
      myGen: number,
    ): Promise<void> {
      const index = readIndex(scene);
      const read = scene.reads[index];
      if (!read) return;
      const fromId = scene.reads[index - 1]?.to ?? ROOT;
      const from = posOf(fromId);
      const to = posOf(read.to);
      const ribbonFrom = index * geo.cellW;
      const ribbonTo = (index + 1) * geo.cellW;
      const textFrom = index === 0 ? geo.originX : geo.cellX(index - 1);
      const textTo = geo.cellX(index);

      if (read.via !== null) {
        const via = posOf(read.via);
        await tween(myGen, DUR_SLIDE_BACK, (p) => {
          const e = ease(p);
          const x = lerp(from.x, via.x, e);
          const y = lerp(from.y, via.y, e);
          setCursor(x, y);
          setRibbon(lerp(ribbonFrom, ribbonTo, e * 0.5));
          setConnector(x, y, lerp(textFrom, textTo, e * 0.5));
        });
        await tween(myGen, DUR_SLIDE_DOWN, (p) => {
          const e = ease(p);
          const x = lerp(via.x, to.x, e);
          const y = lerp(via.y, to.y, e);
          setCursor(x, y);
          setRibbon(lerp(lerp(ribbonFrom, ribbonTo, 0.5), ribbonTo, e));
          setConnector(x, y, lerp(lerp(textFrom, textTo, 0.5), textTo, e));
        });
        return;
      }

      if (read.to === fromId) {
        // 길이 없어 밀어 보고 되돌아온다. 끝에서 제자리로 돌아오므로 정적 자리와 같다.
        await tween(myGen, DUR_STEP, (p) => {
          const nudge = Math.sin(p * Math.PI) * NUDGE_X;
          const e = ease(p);
          setCursor(from.x + nudge, from.y);
          setRibbon(lerp(ribbonFrom, ribbonTo, e));
          setConnector(from.x + nudge, from.y, lerp(textFrom, textTo, e));
        });
        return;
      }

      await tween(myGen, DUR_STEP, (p) => {
        const e = ease(p);
        const x = lerp(from.x, to.x, e);
        const y = lerp(from.y, to.y, e);
        setCursor(x, y);
        setRibbon(lerp(ribbonFrom, ribbonTo, e));
        setConnector(x, y, lerp(textFrom, textTo, e));
      });
    }

    /**
     * 걸린 딱지가 마디에서 떨어져 나와 텍스트의 그 구간으로 날아가 앉는다.
     *
     * 한 마디에서 둘이 끝나면 **한 시계**를 타고 함께 내려간다 — 따로 흘리면
     * *동시에* 가 사라진다.
     */
    function flowCatch(scene: ManyPatternsOnePassScene, myGen: number): Promise<void> {
      const caught = scene.catches[scene.catches.length - 1];
      if (!caught) return Promise.resolve();
      const read = scene.reads[caught.at];
      if (!read) return Promise.resolve();
      const at = posOf(read.to);
      const from: Rect = { x: at.x - TILE_W / 2, y: at.y - TILE_H / 2, w: TILE_W, h: TILE_H };
      const flights = tagFlights.slice(-caught.patterns.length);
      if (flights.length === 0) return Promise.resolve();

      return tween(myGen, DUR_MATCH, (p) => {
        const e = ease(p);
        for (const flight of flights) {
          const x = lerp(from.x, flight.to.x, e);
          const y = lerp(from.y, flight.to.y, e);
          const w = lerp(from.w, flight.to.w, e);
          const h = lerp(from.h, flight.to.h, e);
          flight.rect.setAttribute('x', String(x));
          flight.rect.setAttribute('y', String(y));
          flight.rect.setAttribute('width', String(w));
          flight.rect.setAttribute('height', String(h));
          flight.label.setAttribute('x', String(x + w / 2));
          flight.label.setAttribute('y', String(y + h / 2 + 4));
        }
      });
    }

    /** 한 번 지나갔다는 것을 줄기 위로 한 번 더 훑어 보인다. */
    async function flowFinish(myGen: number): Promise<void> {
      const spark = el(gRibbon, 'rect', {
        x: geo.originX,
        y: RIBBON_Y,
        width: SPARK_W,
        height: RIBBON_H,
        rx: RIBBON_H / 2,
        fill: colors.accent,
      });
      await tween(myGen, DUR_FINISH, (p) => {
        spark.setAttribute(
          'x',
          String(lerp(geo.originX, geo.originX + geo.streamW - SPARK_W, ease(p))),
        );
      });
      spark.remove();
    }

    /** 걸음 하나를 흐르게 한다. 갈래를 빠뜨리면 tsc 가 잡는다. */
    function flow(
      scene: ManyPatternsOnePassScene,
      step: NonNullable<ManyPatternsOnePassScene['step']>,
      myGen: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'lay':
          return flowLay(scene, myGen);
        case 'merge':
          return flowMerge(scene, myGen);
        case 'read':
          return flowRead(scene, myGen);
        case 'catch':
          return flowCatch(scene, myGen);
        case 'finish':
          return flowFinish(myGen);
      }
    }

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     *
     * 운동이 끝나면 장면을 **다시 한 번 통째로** 세운다. 흐르며 남은 좌표와 보간의
     * 끝자리가 곧바로 세운 화면과의 차이가 되어 되짚기 판정을 어긋나게 하기 때문이다.
     * 사이에 타이머도 프레임도 없어 같은 그림이 다시 그려질 뿐이다.
     *
     * 돌려주는 Promise 는 장면이 다 선 뒤에 풀린다 — 이것이 바깥이 걸음의 끝을 아는
     * 유일한 통로다 (S-scene).
     */
    async function render(
      next: ManyPatternsOnePassScene,
      /** 흐르게 할 것을 장면의 `step` 이 말하므로 앞 장면을 들추지 않는다. */
      _prev: ManyPatternsOnePassScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const myGen = (gen += 1);
      settle(next);
      if (!opts.animate || destroyed) return;
      const step = next.step;
      if (step !== null) await flow(next, step, myGen);
      if (alive(myGen)) settle(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        // 기다리던 것을 깨운다 — 깨우지 않으면 걸음이 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
