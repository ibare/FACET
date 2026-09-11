/**
 * skip-a-layer-stage — 층이 여럿인 리스트를 훑는 그림.
 *
 * 형태는 질문의 동사에서 나왔다 — **뛰고 내려선다.**
 *
 * 층마다 가로 한 줄을 두고, 같은 값은 층이 달라도 **같은 가로 자리**(column)에
 * 세운다. 그래서 위층의 한 걸음은 화면에서 실제로 멀고 아래층의 한 걸음은 짧다 —
 * "성글어서 멀리 간다" 가 거리로 보인다. 여행자는 층 위를 호를 그리며 뛰고,
 * 지나치면 되돌아와 한 층 아래로 내려선다. 지나온 자취가 핀의 높이에 남아,
 * 마지막에 층 0 을 처음부터 훑는 유령 경로와 나란히 놓인다.
 *
 * 세로는 이 파일이 정한다. 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고,
 * 요소 크기는 그 폭에서 역산한다 (S-piece).
 *
 * 화면의 글자 중 `head` 와 `L2` 는 도형에 새겨진 표식이라 번역하지 않는다 (C10).
 * 문장인 캡션은 projector 가 `messages` 에서 해석해 넘긴다.
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

const NS = 'http://www.w3.org/2000/svg';

/** 층 셋과 유령 경로와 캡션 한 줄이 들어가는 높이. 마운트 뒤로 바뀌지 않는다 (S-view). */
const CANVAS_H = 220;

const SIDE = 16;
const LANE_LABEL_W = 20;
const HEAD_W = 26;
const HEAD_GAP = 10;
/** 칸 폭의 **상한**만 둔다. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const NODE_MAX_W = 42;
const NODE_H = 24;
const LANE_GAP_MAX = 54;
const TOP = 32;
const GHOST_DROP = 26;
const CAPTION_H = 30;
/** 노드 윗변에서 핀 끝까지. */
const PIN_LIFT = 3;
const PIN_H = 18;

const LEAP_MS = 420;
const PROBE_MS = 300;
const HOLD_MS = 220;
const RECOIL_MS = 260;
const DROP_MS = 300;
const FOUND_MS = 420;
const GHOST_MS = 760;

/** 도형에 새겨진 표식 — 문안이 아니다 (C10). */
const HEAD_MARK = 'head';
const LEVEL_MARK = 'L';

type NodeState = 'idle' | 'look' | 'path' | 'reject' | 'over' | 'found';

type Cell = { rect: SVGRectElement; text: SVGTextElement };

type Scene = { values: number[]; heights: number[]; target: number };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
}

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 다시 좁혀 밀어 넣지 않는다
 * (S-piece). 단언 뒤에 필드마다 `typeof` 가 따르므로 좁히개다 (C9).
 */
function readScene(data: Record<string, unknown> | undefined): Scene {
  const raw = (data ?? {}) as Record<string, unknown>;
  const nums = (v: unknown): number[] =>
    Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : [];
  return {
    values: nums(raw.values),
    heights: nums(raw.heights),
    target: typeof raw.target === 'number' ? raw.target : 0,
  };
}

export const skipALayerStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);

    const count = scene.values.length;
    const heightAt = (i: number): number => Math.max(1, Math.floor(scene.heights[i] ?? 1));
    const laneCount = Math.max(1, ...scene.values.map((_, i) => heightAt(i)));
    const topLevel = laneCount - 1;

    const trackLeft = SIDE + LANE_LABEL_W + HEAD_W + HEAD_GAP;
    const trackRight = PIECE_CANVAS_W - SIDE;
    const colStep = count > 0 ? (trackRight - trackLeft) / count : 0;
    const nodeW = Math.min(NODE_MAX_W, Math.max(16, colStep - 6));
    const headX = SIDE + LANE_LABEL_W + HEAD_W / 2;
    // 층이 늘면 높이를 늘리는 것이 아니라 층 간격을 줄여 담는다 (S-view).
    const laneGap =
      laneCount > 1
        ? Math.min(LANE_GAP_MAX, (CANVAS_H - CAPTION_H - GHOST_DROP - TOP - NODE_H / 2) / (laneCount - 1))
        : LANE_GAP_MAX;

    const colX = (i: number): number => trackLeft + colStep * (i + 0.5);
    const laneY = (level: number): number => TOP + NODE_H / 2 + (topLevel - level) * laneGap;
    const tipY = (level: number): number => laneY(level) - NODE_H / 2 - PIN_LIFT;
    const ghostY = laneY(0) + NODE_H / 2 + 14;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

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

    function tween(ms: number, draw: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          draw(1);
          return resolve();
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const t = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          draw(t);
          if (t >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 그림의 층위
    const towerG = el('g', {});
    const linkG = el('g', {});
    const ghostG = el('g', {});
    const nodeG = el('g', {});
    const trailG = el('g', {});
    const pinG = el('g', { visibility: 'hidden' });
    const captionG = el('g', {});
    for (const g of [towerG, linkG, ghostG, nodeG, trailG, pinG, captionG]) svg.appendChild(g);

    // ── head 기둥. 모든 층에 걸쳐 서 있다.
    const headTop = laneY(topLevel) - NODE_H / 2;
    const headBottom = laneY(0) + NODE_H / 2;
    const headMid = (headTop + headBottom) / 2;
    linkG.appendChild(
      el('rect', {
        x: headX - HEAD_W / 2,
        y: headTop,
        width: HEAD_W,
        height: Math.max(NODE_H, headBottom - headTop),
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );
    const headLabel = el('text', {
      x: headX,
      y: headMid,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
      transform: `rotate(-90, ${headX}, ${headMid})`,
    });
    headLabel.textContent = HEAD_MARK;
    linkG.appendChild(headLabel);

    // ── 탑: 한 값이 어느 층까지 서는가.
    for (let i = 0; i < count; i += 1) {
      towerG.appendChild(
        el('line', {
          x1: colX(i),
          y1: laneY(0),
          x2: colX(i),
          y2: laneY(heightAt(i) - 1),
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
    }

    // ── 층마다의 줄과 값. 위층은 성글어 줄이 길다.
    const cells = new Map<string, Cell>();
    const keyOf = (level: number, column: number): string => `${level}:${column}`;

    for (let level = 0; level <= topLevel; level += 1) {
      const y = laneY(level);
      const lane: number[] = [];
      for (let i = 0; i < count; i += 1) if (heightAt(i) > level) lane.push(i);

      const label = el('text', {
        x: SIDE,
        y,
        'text-anchor': 'start',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      label.textContent = `${LEVEL_MARK}${level}`;
      linkG.appendChild(label);

      let prevX = headX + HEAD_W / 2;
      for (const i of lane) {
        linkG.appendChild(
          el('line', {
            x1: prevX,
            y1: y,
            x2: colX(i) - nodeW / 2,
            y2: y,
            stroke: colors.border,
            'stroke-width': 1.5,
          }),
        );
        prevX = colX(i) + nodeW / 2;
      }
      // 줄의 끝동강 — 이 층에 더는 없다는 표시.
      linkG.appendChild(
        el('line', {
          x1: prevX,
          y1: y,
          x2: Math.min(prevX + 10, trackRight),
          y2: y,
          stroke: colors.border,
          'stroke-width': 1.5,
        }),
      );

      for (const i of lane) {
        const rect = el('rect', {
          x: colX(i) - nodeW / 2,
          y: y - NODE_H / 2,
          width: nodeW,
          height: NODE_H,
          rx: 5,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const text = el('text', {
          x: colX(i),
          y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        text.textContent = String(scene.values[i]);
        nodeG.appendChild(rect);
        nodeG.appendChild(text);
        cells.set(keyOf(level, i), { rect, text });
      }
    }

    /** 노드의 상태 색. 타일이 테마를 따라 뒤집으면 잉크도 뒤집는다 (design-tokens). */
    function paint(cell: Cell, state: NodeState): void {
      const skin: Record<NodeState, { fill: string; stroke: string; ink: string; width: number }> = {
        idle: { fill: colors.itemDefault, stroke: colors.border, ink: colors.text, width: 1 },
        look: { fill: colors.itemComparing, stroke: colors.itemComparing, ink: colors.stateInk, width: 1 },
        path: { fill: colors.itemSorted, stroke: colors.itemSorted, ink: colors.textInverse, width: 1 },
        reject: { fill: colors.danger, stroke: colors.danger, ink: colors.stateInk, width: 1 },
        over: { fill: colors.itemDefault, stroke: colors.danger, ink: colors.danger, width: 1.6 },
        found: { fill: colors.itemPivot, stroke: colors.itemPivot, ink: colors.stateInk, width: 1 },
      };
      const s = skin[state];
      cell.rect.setAttribute('fill', s.fill);
      cell.rect.setAttribute('stroke', s.stroke);
      cell.rect.setAttribute('stroke-width', String(s.width));
      cell.text.setAttribute('fill', s.ink);
    }

    function mark(level: number, column: number, state: NodeState): void {
      const cell = cells.get(keyOf(level, column));
      if (cell) paint(cell, state);
    }

    // ── 자취: 여행자가 실제로 지난 길.
    const trail: Array<[number, number]> = [];
    const trailPath = el('path', {
      d: '',
      fill: 'none',
      stroke: colors.primary,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    trailG.appendChild(trailPath);

    function drawTrail(): void {
      if (trail.length === 0) {
        trailPath.setAttribute('d', '');
        return;
      }
      const [head, ...rest] = trail;
      const d = [`M ${head[0]} ${head[1]}`, ...rest.map(([x, y]) => `L ${x} ${y}`)].join(' ');
      trailPath.setAttribute('d', d);
    }

    function commitTrail(x: number, y: number): void {
      trail.push([x, y]);
      drawTrail();
    }

    // ── 여행자. 찾는 값을 들고 다닌다.
    const pinW = Math.max(26, 14 + String(scene.target).length * 8);
    pinG.appendChild(
      el('rect', {
        x: -pinW / 2,
        y: -(PIN_H + 6),
        width: pinW,
        height: PIN_H,
        rx: 4,
        fill: colors.primary,
      }),
    );
    pinG.appendChild(el('path', { d: 'M -5 -6 L 5 -6 L 0 0 Z', fill: colors.primary }));
    const pinText = el('text', {
      x: 0,
      y: -(6 + PIN_H / 2),
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: colors.textInverse,
    });
    pinText.textContent = String(scene.target);
    pinG.appendChild(pinText);

    let pinX = headX;
    let pinLevel = topLevel;

    function setPin(x: number, y: number): void {
      pinG.setAttribute('transform', `translate(${x}, ${y})`);
    }

    // ── 캡션. 지금 무슨 일이 일어나는지만 말한다 (S-piece).
    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CANVAS_H - 10,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    captionG.appendChild(caption);

    /** 한 층을 가로지르는 뜀. 거리가 멀수록 호가 높다. */
    async function hop(fromX: number, toX: number, y: number, ms: number): Promise<void> {
      const arc = Math.min(30, 10 + Math.abs(toX - fromX) * 0.06);
      await tween(ms, (t) => {
        const x = fromX + (toX - fromX) * ease(t);
        setPin(x, y - Math.sin(Math.PI * t) * arc);
      });
      setPin(toX, y);
      pinX = toX;
    }

    /** 한 층 내려섬. */
    async function fall(x: number, fromLevel: number, toLevel: number): Promise<void> {
      const y0 = tipY(fromLevel);
      const y1 = tipY(toLevel);
      await tween(DROP_MS, (t) => setPin(x, y0 + (y1 - y0) * ease(t)));
      setPin(x, y1);
      pinLevel = toLevel;
    }

    function place(level: number, column: number | null): void {
      pinLevel = level;
      pinX = column === null ? headX : colX(column);
      trail.length = 0;
      commitTrail(pinX, tipY(level));
      setPin(pinX, tipY(level));
      pinG.setAttribute('visibility', 'visible');
    }

    async function leap(level: number, column: number): Promise<void> {
      mark(level, column, 'look');
      await hop(pinX, colX(column), tipY(level), LEAP_MS);
      mark(level, column, 'path');
      commitTrail(pinX, tipY(level));
    }

    /** 지나침 — 뛰어 보고, 튕겨 돌아와, 한 층 내려선다. */
    async function overshoot(level: number, overColumn: number, toLevel: number): Promise<void> {
      const anchorX = pinX;
      const y = tipY(level);
      mark(level, overColumn, 'look');
      await hop(anchorX, colX(overColumn), y, PROBE_MS);
      mark(level, overColumn, 'reject');
      await wait(HOLD_MS);
      await hop(pinX, anchorX, y, RECOIL_MS);
      mark(level, overColumn, 'over');
      await fall(anchorX, level, toLevel);
      commitTrail(anchorX, tipY(toLevel));
    }

    /** 이 층에 다음이 없어 내려서는 경우. */
    async function descend(level: number, toLevel: number): Promise<void> {
      await fall(pinX, level, toLevel);
      commitTrail(pinX, tipY(toLevel));
    }

    async function found(level: number, column: number): Promise<void> {
      mark(level, column, 'look');
      await hop(pinX, colX(column), tipY(level), LEAP_MS);
      mark(level, column, 'found');
      commitTrail(pinX, tipY(level));

      const ring = el('rect', {
        x: colX(column) - nodeW / 2,
        y: laneY(level) - NODE_H / 2,
        width: nodeW,
        height: NODE_H,
        rx: 5,
        fill: 'none',
        stroke: colors.itemPivot,
        'stroke-width': 2,
      });
      nodeG.appendChild(ring);
      await tween(FOUND_MS, (t) => {
        const grow = 12 * t;
        ring.setAttribute('x', String(colX(column) - nodeW / 2 - grow));
        ring.setAttribute('y', String(laneY(level) - NODE_H / 2 - grow));
        ring.setAttribute('width', String(nodeW + grow * 2));
        ring.setAttribute('height', String(NODE_H + grow * 2));
        ring.setAttribute('opacity', String(1 - t));
      });
      ring.remove();
    }

    /**
     * 층 0 을 처음부터 훑었다면 밟았을 길. 자라나는 길이 그대로 대조다 —
     * 위층의 짧은 자취 아래에 길게 눕는다.
     */
    async function ghostRoute(column: number): Promise<void> {
      ghostG.textContent = '';
      const x0 = headX + HEAD_W / 2;
      const x1 = colX(column);
      const line = el('line', {
        x1: x0,
        y1: ghostY,
        x2: x0,
        y2: ghostY,
        stroke: colors.ghostOutline,
        'stroke-width': 1.6,
        'stroke-dasharray': '5 4',
      });
      ghostG.appendChild(line);

      const ticks: Array<{ node: SVGLineElement; x: number }> = [];
      for (let i = 0; i <= column && i < count; i += 1) {
        const node = el('line', {
          x1: colX(i),
          y1: ghostY - 4,
          x2: colX(i),
          y2: ghostY + 4,
          stroke: colors.ghostOutline,
          'stroke-width': 1.6,
          opacity: 0,
        });
        ghostG.appendChild(node);
        ticks.push({ node, x: colX(i) });
      }

      await tween(GHOST_MS, (t) => {
        const x = x0 + (x1 - x0) * t;
        line.setAttribute('x2', String(x));
        for (const tick of ticks) tick.node.setAttribute('opacity', tick.x <= x ? '1' : '0');
      });
      line.setAttribute('x2', String(x1));
      for (const tick of ticks) tick.node.setAttribute('opacity', '1');
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    function reset(): void {
      for (const cell of cells.values()) paint(cell, 'idle');
      trail.length = 0;
      drawTrail();
      ghostG.textContent = '';
      pinG.setAttribute('visibility', 'hidden');
      pinX = headX;
      pinLevel = topLevel;
      setPin(pinX, tipY(pinLevel));
      caption.textContent = '';
    }

    return {
      place,
      leap,
      overshoot,
      descend,
      found,
      ghostRoute,
      setCaption,
      reset,
      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const g of [towerG, linkG, ghostG, nodeG, trailG, pinG, captionG]) g.remove();
      },
    };
  },
};
