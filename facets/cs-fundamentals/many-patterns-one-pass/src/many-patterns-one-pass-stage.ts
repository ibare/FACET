/**
 * many-patterns-one-pass-stage — 여러 패턴이 한 줄기로 흐르는 화면.
 *
 * 형태는 동사에서 나왔다. "한 줄기로 흐른다" 이므로 화면은 왼쪽에서 오른쪽으로
 * 흐르는 축 하나를 갖는다. 깊이가 열이 되어 나무도 오른쪽으로 자라고, 텍스트도
 * 오른쪽으로 읽힌다. 읽는 자리와 나무의 자리를 잇는 줄기 한 가닥이 걸음마다
 * 움직인다.
 *
 * 걸음마다 실제로 자리가 바뀌는 것들:
 *   - 패턴 넉 줄의 글자 칸이 왼쪽에서 미끄러져 들어온다.
 *   - 같은 열의 같은 글자들이 한 자리로 내려앉아 나무가 된다 (겹치는 앞머리).
 *   - 뿌리가 왼쪽에서 들어오고, 가지가 부모에서 자식으로 뻗는다.
 *   - 칸 하나를 읽을 때마다 커서가 마디에서 마디로 옮겨 간다. 길이 끊기면
 *     뒤로 미끄러졌다가 다시 내려간다.
 *   - 패턴이 걸리면 그 마디에서 딱지가 떨어져 나와 텍스트의 그 자리로 날아가
 *     앉는다. 둘이 함께 걸리면 둘이 같이 난다.
 *
 * 세로는 그림이 정하는 값이라 여기 상수로 둔다. 가로는 러너가 PIECE_CANVAS_W 로
 * 정한다 (S-piece / S-view).
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

/** 뿌리의 마디 id (algorithm 과 같은 약속 — 이어진 글자가 없으므로 빈 문자열). */
const ROOT = '';

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

const FRAME_MS = 16;
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

type NodeWire = {
  id: string;
  parent: string | null;
  char: string;
  depth: number;
  terminal: boolean;
};

type PathWire = { pattern: string; nodeIds: string[] };

type ReadWire = {
  index: number;
  char: string;
  move: 'stay' | 'descend' | 'slide';
  from: string;
  to: string;
  via?: string;
};

type HitWire = { pattern: string; start: number; end: number };

type Scene = { patterns: string[]; text: string };

type Tile = { g: SVGElement; rect: SVGElement; label: SVGElement };

type Point = { x: number; y: number };

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 선언에서 이 그림이 필요한 것만 좁힌다. `mount` 가 initialData 를 받는 자리이고
 * projector 가 없어도 반드시 불리는 유일한 경로다 (S-piece).
 */
function readScene(initialData: Record<string, unknown> | undefined): Scene {
  const data: Record<string, unknown> = initialData ?? {};
  const rawPatterns = data.patterns;
  const patterns = Array.isArray(rawPatterns)
    ? rawPatterns.filter((p): p is string => typeof p === 'string')
    : [];
  const text = typeof data.text === 'string' ? data.text : '';
  return { patterns, text };
}

export const manyPatternsOnePassStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);
    const canvas = params.canvas;

    // ── 가로 자리. 요소 크기는 캔버스에서 역산하고 상수로는 상한만 둔다.
    const cellCount = Math.max(1, scene.text.length);
    const cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / cellCount));
    const streamW = cellW * cellCount;
    const originX = Math.round((PIECE_CANVAS_W - streamW) / 2);

    const maxLen = scene.patterns.reduce((m, p) => Math.max(m, p.length), 0);
    const colCount = maxLen + 1;
    const colW = streamW / colCount;
    const colX = (depth: number): number => originX + colW * (depth + 0.5);
    const cellX = (index: number): number => originX + cellW * (index + 0.5);

    // ── 그리는 차례가 곧 앞뒤 차례다.
    const root = el('g', {});
    const gEdges = el('g', {});
    const gWire = el('g', {});
    const gTiles = el('g', {});
    const gCursor = el('g', {});
    const gText = el('g', {});
    const gRibbon = el('g', {});
    const gTags = el('g', {});
    for (const layer of [gEdges, gWire, gTiles, gCursor, gText, gRibbon, gTags]) {
      root.appendChild(layer);
    }

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    root.appendChild(caption);
    canvas.appendChild(root);

    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // ── 상태
    const nodePos = new Map<string, Point>();
    const nodeTile = new Map<string, Tile>();
    let letterTiles: { tile: Tile; homeX: number; rowY: number; nodeId: string }[] = [];
    let cells: Tile[] = [];
    let rootMark: SVGElement | null = null;
    let cursor: SVGElement | null = null;
    let connector: SVGElement | null = null;
    let ribbonFill: SVGElement | null = null;
    let ribbonW = 0;
    let headX = originX;
    let lastCell = -1;
    const lanes: { start: number; end: number }[][] = [];

    function tween(duration: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || duration <= 0) {
          apply(1);
          resolve();
          return;
        }
        const startedAt = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const frame = (): void => {
          if (destroyed) {
            apply(1);
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - startedAt) / duration);
          apply(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            frame();
          }, FRAME_MS);
          timers.add(id);
        };
        frame();
      });
    }

    function makeTile(char: string, x: number, y: number): Tile {
      const g = el('g', { transform: `translate(${x} ${y})` });
      const rect = el('rect', {
        x: -TILE_W / 2,
        y: -TILE_H / 2,
        width: TILE_W,
        height: TILE_H,
        rx: 7,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      label.textContent = char;
      g.appendChild(rect);
      g.appendChild(label);
      return { g, rect, label };
    }

    function moveTile(tile: Tile, x: number, y: number): void {
      tile.g.setAttribute('transform', `translate(${x} ${y})`);
    }

    function paintTile(tile: Tile, fill: string, ink: string, stroke: string): void {
      tile.rect.setAttribute('fill', fill);
      tile.rect.setAttribute('stroke', stroke);
      tile.label.setAttribute('fill', ink);
    }

    function posOf(id: string): Point {
      return nodePos.get(id) ?? { x: colX(0), y: (TREE_TOP + TREE_BOTTOM) / 2 };
    }

    function setCursor(x: number, y: number): void {
      cursor?.setAttribute('transform', `translate(${x} ${y})`);
    }

    function setRibbon(width: number): void {
      ribbonFill?.setAttribute('width', String(Math.max(0, width)));
    }

    /** 읽는 자리와 나무의 자리를 잇는 줄기 한 가닥. */
    function setConnector(nodeX: number, nodeY: number, textX: number): void {
      if (!connector) return;
      const top = nodeY + TILE_H / 2;
      const mid = (top + CELL_TOP) / 2;
      connector.setAttribute(
        'd',
        `M ${nodeX} ${top} L ${nodeX} ${mid} L ${textX} ${mid} L ${textX} ${CELL_TOP}`,
      );
      connector.setAttribute('opacity', '1');
    }

    function buildStream(): void {
      cells = [];
      for (let i = 0; i < scene.text.length; i += 1) {
        const g = el('g', { transform: `translate(${cellX(i)} ${CELL_TOP + CELL_H / 2})` });
        const rect = el('rect', {
          x: -(cellW - CELL_GAP) / 2,
          y: -CELL_H / 2,
          width: cellW - CELL_GAP,
          height: CELL_H,
          rx: 8,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        const label = el('text', {
          x: 0,
          y: 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          fill: colors.text,
        });
        label.textContent = scene.text.charAt(i);
        g.appendChild(rect);
        g.appendChild(label);
        gText.appendChild(g);
        cells.push({ g, rect, label });
      }

      gRibbon.appendChild(
        el('rect', {
          x: originX,
          y: RIBBON_Y,
          width: streamW,
          height: RIBBON_H,
          rx: RIBBON_H / 2,
          fill: colors.border,
        }),
      );
      ribbonFill = el('rect', {
        x: originX,
        y: RIBBON_Y,
        width: 0,
        height: RIBBON_H,
        rx: RIBBON_H / 2,
        fill: colors.textMuted,
      });
      gRibbon.appendChild(ribbonFill);

      connector = el('path', {
        d: '',
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 4',
        opacity: 0,
      });
      gWire.appendChild(connector);
    }

    function markCell(index: number): void {
      for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i];
        if (!cell) continue;
        if (i === index) paintTile(cell, colors.itemActive, colors.stateInk, colors.itemActive);
        else if (i < index) paintTile(cell, colors.itemSorted, colors.textInverse, colors.itemSorted);
        else paintTile(cell, colors.itemDefault, colors.text, colors.border);
      }
    }

    /** 나무의 자리는 잎을 세어 역산한다 — 선언에 좌표를 두지 않는다. */
    function layoutTrie(nodes: NodeWire[]): string {
      const childrenOf = new Map<string, string[]>();
      const depthOf = new Map<string, number>();
      let rootId = ROOT;
      for (const node of nodes) {
        depthOf.set(node.id, node.depth);
        if (node.parent === null) {
          rootId = node.id;
          continue;
        }
        const siblings = childrenOf.get(node.parent) ?? [];
        siblings.push(node.id);
        childrenOf.set(node.parent, siblings);
      }

      const countLeaves = (id: string): number => {
        const children = childrenOf.get(id) ?? [];
        if (children.length === 0) return 1;
        return children.reduce((sum, child) => sum + countLeaves(child), 0);
      };
      const leaves = Math.max(1, countLeaves(rootId));
      const pitch = leaves > 1 ? (TREE_BOTTOM - TREE_TOP) / (leaves - 1) : 0;

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
        nodePos.set(id, { x: colX(depthOf.get(id) ?? 0), y });
        return y;
      };
      place(rootId);
      return rootId;
    }

    // ── projector 가 부르는 메서드들

    function layPatterns(): Promise<void> {
      letterTiles = [];
      scene.patterns.forEach((pattern, row) => {
        const rowY = PATTERN_TOP + PATTERN_PITCH * row;
        for (let i = 0; i < pattern.length; i += 1) {
          const homeX = colX(i + 1);
          const tile = makeTile(pattern.charAt(i), -TILE_W, rowY);
          gTiles.appendChild(tile.g);
          letterTiles.push({ tile, homeX, rowY, nodeId: '' });
        }
      });

      const rows = Math.max(1, scene.patterns.length);
      const maxDelay = 0.12 * (rows - 1);
      return tween(DUR_LAY, (p) => {
        let cursorIndex = 0;
        scene.patterns.forEach((pattern, row) => {
          const delay = 0.12 * row;
          const sub = ease(clamp01((p - delay) / Math.max(0.001, 1 - maxDelay)));
          for (let i = 0; i < pattern.length; i += 1) {
            const entry = letterTiles[cursorIndex];
            cursorIndex += 1;
            if (!entry) continue;
            moveTile(entry.tile, lerp(-TILE_W, entry.homeX, sub), entry.rowY);
          }
        });
      });
    }

    async function buildTrie(spec: { nodes: NodeWire[]; paths: PathWire[] }): Promise<void> {
      const rootId = layoutTrie(spec.nodes);

      // 어느 글자가 어느 마디에 앉는지는 algorithm 이 알려 준다.
      let cursorIndex = 0;
      for (const path of spec.paths) {
        for (const nodeId of path.nodeIds) {
          const entry = letterTiles[cursorIndex];
          cursorIndex += 1;
          if (!entry) continue;
          entry.nodeId = nodeId;
        }
      }

      const rootHome = posOf(rootId);
      rootMark = el('g', { transform: `translate(${originX - 60} ${rootHome.y})` });
      rootMark.appendChild(
        el('rect', {
          x: -13,
          y: -13,
          width: 26,
          height: 26,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1.5,
        }),
      );
      rootMark.appendChild(el('circle', { cx: 0, cy: 0, r: 3.5, fill: colors.textMuted }));
      gTiles.appendChild(rootMark);

      const edges: { line: SVGElement; from: Point; to: Point }[] = [];
      for (const node of spec.nodes) {
        if (node.parent === null) continue;
        const from = posOf(node.parent);
        const to = posOf(node.id);
        const line = el('line', {
          x1: from.x,
          y1: from.y,
          x2: from.x,
          y2: from.y,
          stroke: colors.border,
          'stroke-width': 2,
        });
        gEdges.appendChild(line);
        edges.push({ line, from, to });
      }

      await tween(DUR_MERGE, (p) => {
        const fold = ease(clamp01(p / 0.65));
        rootMark?.setAttribute(
          'transform',
          `translate(${lerp(originX - 60, rootHome.x, fold)} ${rootHome.y})`,
        );
        for (const entry of letterTiles) {
          const target = nodePos.get(entry.nodeId);
          if (!target) continue;
          moveTile(entry.tile, target.x, lerp(entry.rowY, target.y, fold));
        }
        const grow = ease(clamp01((p - 0.5) / 0.5));
        for (const edge of edges) {
          edge.line.setAttribute('x2', String(lerp(edge.from.x, edge.to.x, grow)));
          edge.line.setAttribute('y2', String(lerp(edge.from.y, edge.to.y, grow)));
        }
      });

      // 같은 자리에 내려앉은 칸은 하나만 남긴다 — 겹쳐 있어 지워도 화면은 그대로다.
      const kept: typeof letterTiles = [];
      for (const entry of letterTiles) {
        if (nodeTile.has(entry.nodeId)) {
          entry.tile.g.remove();
          continue;
        }
        nodeTile.set(entry.nodeId, entry.tile);
        kept.push(entry);
      }
      letterTiles = kept;

      for (const node of spec.nodes) {
        if (!node.terminal) continue;
        const at = posOf(node.id);
        gEdges.appendChild(
          el('circle', { cx: at.x, cy: at.y + TILE_H / 2 + 7, r: 3.5, fill: colors.accent }),
        );
      }

      cursor = el('rect', {
        x: -(TILE_W + 10) / 2,
        y: -(TILE_H + 10) / 2,
        width: TILE_W + 10,
        height: TILE_H + 10,
        rx: 10,
        fill: 'none',
        stroke: colors.itemActive,
        'stroke-width': 3,
        transform: `translate(${rootHome.x} ${rootHome.y})`,
      });
      gCursor.appendChild(cursor);
    }

    async function readChar(step: ReadWire): Promise<void> {
      markCell(step.index);
      const from = posOf(step.from);
      const to = posOf(step.to);
      const ribbonFrom = ribbonW;
      const ribbonTo = (step.index + 1) * cellW;
      const textFrom = headX;
      const textTo = cellX(step.index);

      if (step.move === 'slide' && step.via !== undefined) {
        const via = posOf(step.via);
        await tween(DUR_SLIDE_BACK, (p) => {
          const e = ease(p);
          const x = lerp(from.x, via.x, e);
          const y = lerp(from.y, via.y, e);
          setCursor(x, y);
          setRibbon(lerp(ribbonFrom, ribbonTo, e * 0.5));
          setConnector(x, y, lerp(textFrom, textTo, e * 0.5));
        });
        await tween(DUR_SLIDE_DOWN, (p) => {
          const e = ease(p);
          const x = lerp(via.x, to.x, e);
          const y = lerp(via.y, to.y, e);
          setCursor(x, y);
          setRibbon(lerp(lerp(ribbonFrom, ribbonTo, 0.5), ribbonTo, e));
          setConnector(x, y, lerp(lerp(textFrom, textTo, 0.5), textTo, e));
        });
      } else if (step.move === 'stay') {
        await tween(DUR_STEP, (p) => {
          const nudge = Math.sin(p * Math.PI) * NUDGE_X;
          const e = ease(p);
          setCursor(from.x + nudge, from.y);
          setRibbon(lerp(ribbonFrom, ribbonTo, e));
          setConnector(from.x + nudge, from.y, lerp(textFrom, textTo, e));
        });
      } else {
        await tween(DUR_STEP, (p) => {
          const e = ease(p);
          const x = lerp(from.x, to.x, e);
          const y = lerp(from.y, to.y, e);
          setCursor(x, y);
          setRibbon(lerp(ribbonFrom, ribbonTo, e));
          setConnector(x, y, lerp(textFrom, textTo, e));
        });
      }

      ribbonW = ribbonTo;
      headX = textTo;
      lastCell = step.index;
    }

    function laneFor(start: number, end: number): number {
      for (let lane = 0; lane < MAX_LANES; lane += 1) {
        const taken = lanes[lane] ?? [];
        const free = taken.every((span) => end < span.start || start > span.end);
        if (free) {
          taken.push({ start, end });
          lanes[lane] = taken;
          return lane;
        }
      }
      return MAX_LANES - 1;
    }

    function catchMatches(batch: { nodeId: string; hits: HitWire[] }): Promise<void> {
      const at = posOf(batch.nodeId);
      const tile = nodeTile.get(batch.nodeId);
      if (tile) paintTile(tile, colors.itemPivot, colors.stateInk, colors.itemPivot);

      const flights = batch.hits.map((hit) => {
        const lane = laneFor(hit.start, hit.end);
        const g = el('g', {});
        const rect = el('rect', {
          x: at.x - TILE_W / 2,
          y: at.y - TILE_H / 2,
          width: TILE_W,
          height: TILE_H,
          rx: 7,
          fill: colors.itemPivot,
        });
        const label = el('text', {
          x: at.x,
          y: at.y + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.stateInk,
        });
        label.textContent = hit.pattern;
        g.appendChild(rect);
        g.appendChild(label);
        gTags.appendChild(g);
        return {
          rect,
          label,
          fromRect: { x: at.x - TILE_W / 2, y: at.y - TILE_H / 2, w: TILE_W, h: TILE_H },
          toRect: {
            x: originX + hit.start * cellW + CELL_GAP / 2,
            y: LANE_TOP + LANE_PITCH * lane,
            w: (hit.end - hit.start + 1) * cellW - CELL_GAP,
            h: TAG_H,
          },
        };
      });

      // 한 마디에서 둘이 끝나면 둘이 같은 tween 을 타고 함께 내려간다.
      return tween(DUR_MATCH, (p) => {
        const e = ease(p);
        for (const flight of flights) {
          const x = lerp(flight.fromRect.x, flight.toRect.x, e);
          const y = lerp(flight.fromRect.y, flight.toRect.y, e);
          const w = lerp(flight.fromRect.w, flight.toRect.w, e);
          const h = lerp(flight.fromRect.h, flight.toRect.h, e);
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
    async function finish(): Promise<void> {
      cursor?.setAttribute('opacity', '0.35');
      connector?.setAttribute('opacity', '0.35');
      const spark = el('rect', {
        x: originX,
        y: RIBBON_Y,
        width: SPARK_W,
        height: RIBBON_H,
        rx: RIBBON_H / 2,
        fill: colors.accent,
      });
      gRibbon.appendChild(spark);
      await tween(DUR_FINISH, (p) => {
        spark.setAttribute('x', String(lerp(originX, originX + streamW - SPARK_W, ease(p))));
      });
      spark.remove();
    }

    function rewind(): void {
      gTiles.textContent = '';
      gEdges.textContent = '';
      gCursor.textContent = '';
      gTags.textContent = '';
      gText.textContent = '';
      gRibbon.textContent = '';
      gWire.textContent = '';
      nodePos.clear();
      nodeTile.clear();
      letterTiles = [];
      lanes.length = 0;
      rootMark = null;
      cursor = null;
      ribbonW = 0;
      headX = originX;
      lastCell = -1;
      buildStream();
      markCell(lastCell);
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    buildStream();

    return {
      layPatterns,
      buildTrie,
      readChar,
      catchMatches,
      finish,
      rewind,
      setCaption,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 걸어 둔 것을 거둔 뒤 기다리던 것을 깨운다. 취소된 tick 은 아예 불리지
        // 않으므로 여기서 풀지 않으면 await ctx.emit 이 영영 돌아오지 않는다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
