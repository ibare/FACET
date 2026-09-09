/**
 * grow-one-tree-stage — 나무가 한 자리씩 자라는 그림.
 *
 * 화면은 둘로 나뉜다.
 *
 *   위  그림 — 정점과 간선. 고른 간선은 나무 쪽 끝에서부터 **그어지며** 자라고,
 *       새로 붙는 정점에서 테가 한 번 퍼진다.
 *   아래 칸판 — 간선마다 칸 하나. 칸은 세 줄(나무 / 고를 수 있다 / 고를 수 없다)
 *       사이를 **오르내린다.** 걸음마다 어느 간선이 후보가 되고 어느 것이 후보에서
 *       빠지는지가 칸의 오르내림으로 보인다. 칸의 가로 자리는 고정이라 같은 간선을
 *       계속 눈으로 좇을 수 있다.
 *
 * 움직임은 CSS transition 이 아니라 직접 잰다. SVG 의 transform / 기하 속성 전환은
 * 브라우저마다 갈리고, 무엇보다 destroy·되감기 때 **끝맺어야** algorithm 의 await 가
 * 매달리지 않는다 (남은 tween 은 `settles` 로 즉시 마무리한다).
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 캡션은 두 줄 자리를 늘 잡아 두고
 * 문안이 한 줄이든 두 줄이든 그림이 밀리지 않게 한다.
 */

import { fontSizes, fonts, getColors, makeTranslator, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { CanvasView } from '@ffacet/core/runtime';

export type GrowOneTreeStageEdge = { id: string; u: string; v: string; w: number };
export type GrowOneTreeStageGraph = { nodes: string[]; edges: GrowOneTreeStageEdge[] };

/** 간선이 지금 어떤 처지인가. 칸판의 세 줄과 그대로 짝을 이룬다. */
type EdgeVisual = 'tree' | 'candidate' | 'idle';

const NS = 'http://www.w3.org/2000/svg' as const;

const W = PIECE_CANVAS_W;
const H = 380;

// ── 그림 (위)
const GRAPH_SIDE = 78;
const NODE_R = 21;
const ROW_TOP = 62;
const ROW_BOTTOM = 166;
const ROW_MID = (ROW_TOP + ROW_BOTTOM) / 2;
const SEPARATOR_Y = 197;

// ── 칸판 (아래). 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
const LANE_LABEL_RIGHT = 76;
const TRAY_LEFT = 88;
const TRAY_RIGHT_PAD = 14;
const CHIP_MAX_W = 96;
const CHIP_GAP = 8;
const CHIP_H = 26;
const LANE_Y: readonly number[] = [220, 264, 308];

// ── 캡션. 두 줄 자리를 늘 잡는다.
const CAPTION_Y = 348;
const CAPTION_LINE_H = 20;

// ── 굵기
const EDGE_W_IDLE = 1.6;
const EDGE_W_CANDIDATE = 4.5;
const EDGE_W_TREE = 5.5;
const EDGE_W_GROW = 6.5;

// ── 시간. 걸음 하나는 여기에 stepMs 가 더해진 길이다 (S-piece).
const FRAME_MS = 16;
const GROW_MS = 400;
const FRONTIER_MS = 260;
const CHIP_MS = 260;
const HALO_MS = 300;
const DONE_MS = 340;

const HALO_SPREAD = 15;
const DONE_SWELL = 2.5;
const DONE_FADE = 0.55;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 0→1 을 끝에서 부드럽게 놓는다. */
function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

function widthOf(state: EdgeVisual): number {
  if (state === 'tree') return EDGE_W_TREE;
  if (state === 'candidate') return EDGE_W_CANDIDATE;
  return EDGE_W_IDLE;
}

/**
 * 정점 자리. 첫 정점은 왼쪽 가운데에 두고, 나머지는 두 개씩 열을 이뤄 오른쪽으로
 * 나간다. 짝이 없는 마지막 하나는 자기 열 가운데.
 */
function placeNodes(names: string[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const cols = 1 + Math.ceil(Math.max(0, names.length - 1) / 2);
  const span = cols > 1 ? (W - GRAPH_SIDE * 2) / (cols - 1) : 0;
  names.forEach((name, i) => {
    if (i === 0) {
      pos.set(name, { x: GRAPH_SIDE, y: ROW_MID });
      return;
    }
    const col = 1 + Math.floor((i - 1) / 2);
    const top = (i - 1) % 2 === 0;
    const alone = top && i === names.length - 1;
    pos.set(name, {
      x: GRAPH_SIDE + span * col,
      y: alone ? ROW_MID : top ? ROW_TOP : ROW_BOTTOM,
    });
  });
  return pos;
}

export const growOneTreeStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params) {
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가 붙인 캔버스가 떨어져 나간다 (S-view).
    canvas.textContent = '';

    // ── 시간을 재는 부분 ────────────────────────────────────────────────
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const settles = new Set<() => void>();

    const later = (fn: () => void, ms: number): void => {
      if (destroyed) return;
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    };

    const tween = (ms: number, onFrame: (p: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          onFrame(1);
          resolve();
          return;
        }
        const started = Date.now();
        let finished = false;
        const settle = (): void => {
          if (finished) return;
          finished = true;
          settles.delete(settle);
          onFrame(1);
          resolve();
        };
        settles.add(settle);
        const tick = (): void => {
          if (finished) return;
          const raw = (Date.now() - started) / ms;
          if (raw >= 1) {
            settle();
            return;
          }
          onFrame(easeOut(raw));
          later(tick, FRAME_MS);
        };
        later(tick, FRAME_MS);
      });

    /** 남은 움직임을 그 자리에서 끝맺는다. 되감기·정리 때 쓴다. */
    const settleAll = (): void => {
      for (const settle of [...settles]) settle();
    };

    // ── 그림 상태 ──────────────────────────────────────────────────────
    let specs: GrowOneTreeStageEdge[] = [];
    let pos = new Map<string, { x: number; y: number }>();
    const edgeState = new Map<string, EdgeVisual>();
    const treeNodes = new Set<string>();

    const edgeLine = new Map<string, SVGLineElement>();
    const edgeLabel = new Map<string, SVGTextElement>();
    const edgeLabelBg = new Map<string, SVGRectElement>();
    const nodeCircle = new Map<string, SVGCircleElement>();
    const nodeLabel = new Map<string, SVGTextElement>();

    const chipGroup = new Map<string, SVGGElement>();
    const chipBox = new Map<string, SVGRectElement>();
    const chipName = new Map<string, SVGTextElement>();
    const chipWeight = new Map<string, SVGTextElement>();
    const chipX = new Map<string, number>();
    const chipLane = new Map<string, number>();
    const chipNowY = new Map<string, number>();
    const chipTargetY = new Map<string, number>();

    const gEdges = el('g', {});
    const gGrow = el('g', {});
    // 무게는 그어지는 선보다 위에 있어야 한다 — 아래 두면 자라는 동안 숫자가 덮인다.
    const gWeights = el('g', {});
    const gNodes = el('g', {});
    const gTray = el('g', {});
    const gCaption = el('g', {});
    canvas.append(gEdges, gGrow, gWeights, gNodes, gTray, gCaption);

    const captionLine1 = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    const captionLine2 = el('text', {
      x: W / 2,
      y: CAPTION_Y + CAPTION_LINE_H,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.textMuted,
    });
    gCaption.append(captionLine1, captionLine2);

    const laneTop = (lane: number): number => (LANE_Y[lane] ?? LANE_Y[2] ?? 0) - CHIP_H / 2;

    // ── 칠하기 ────────────────────────────────────────────────────────
    const paintEdge = (id: string): void => {
      const line = edgeLine.get(id);
      const label = edgeLabel.get(id);
      const bg = edgeLabelBg.get(id);
      if (!line || !label || !bg) return;
      const state = edgeState.get(id) ?? 'idle';
      line.setAttribute('stroke', state === 'tree' ? c.itemSorted : state === 'candidate' ? c.itemComparing : c.border);
      line.setAttribute('stroke-dasharray', state === 'idle' ? '5 5' : '');
      line.setAttribute('opacity', '1');
      label.setAttribute('fill', state === 'idle' ? c.textMuted : c.text);
      label.setAttribute('font-weight', state === 'idle' ? '400' : '700');
      label.setAttribute('opacity', '1');
      bg.setAttribute('opacity', '1');
    };

    const setEdgeWidth = (id: string, width: number): void => {
      edgeLine.get(id)?.setAttribute('stroke-width', width.toFixed(2));
    };

    const paintNode = (name: string): void => {
      const circle = nodeCircle.get(name);
      const text = nodeLabel.get(name);
      if (!circle || !text) return;
      const joined = treeNodes.has(name);
      circle.setAttribute('fill', joined ? c.itemSorted : c.itemDefault);
      circle.setAttribute('stroke', joined ? c.itemSorted : c.border);
      circle.setAttribute('stroke-width', joined ? '3' : '2');
      text.setAttribute('fill', joined ? c.textInverse : c.text);
    };

    const paintChip = (id: string): void => {
      const box = chipBox.get(id);
      const name = chipName.get(id);
      const weight = chipWeight.get(id);
      if (!box || !name || !weight) return;
      const lane = chipLane.get(id) ?? 2;
      const fill = lane === 0 ? c.itemSorted : lane === 1 ? c.itemComparing : c.bg;
      const ink = lane === 0 ? c.textInverse : lane === 1 ? c.stateInk : c.textMuted;
      box.setAttribute('fill', fill);
      box.setAttribute('stroke', lane === 2 ? c.border : fill);
      name.setAttribute('fill', ink);
      weight.setAttribute('fill', ink);
    };

    const placeChip = (id: string, y: number): void => {
      chipNowY.set(id, y);
      chipGroup.get(id)?.setAttribute('transform', `translate(${chipX.get(id) ?? 0}, ${y.toFixed(1)})`);
    };

    const setChipLane = (id: string, lane: number): void => {
      chipLane.set(id, lane);
      chipTargetY.set(id, laneTop(lane));
      paintChip(id);
    };

    const tweenChips = (ms: number): Promise<void> => {
      const from = new Map(chipNowY);
      let moves = false;
      for (const [id, target] of chipTargetY) {
        if (Math.abs((from.get(id) ?? target) - target) > 0.5) moves = true;
      }
      if (!moves) return Promise.resolve();
      return tween(ms, (p) => {
        for (const [id, target] of chipTargetY) {
          const start = from.get(id) ?? target;
          placeChip(id, start + (target - start) * p);
        }
      });
    };

    /** 붙은 자리에서 테가 한 번 퍼진다. */
    const halo = (at: { x: number; y: number }): Promise<void> => {
      const ring = el('circle', {
        cx: at.x,
        cy: at.y,
        r: NODE_R,
        fill: 'none',
        stroke: c.accent,
        'stroke-width': 3,
        opacity: 0.7,
      });
      gNodes.appendChild(ring);
      return tween(HALO_MS, (p) => {
        ring.setAttribute('r', (NODE_R + HALO_SPREAD * p).toFixed(1));
        ring.setAttribute('opacity', (0.7 * (1 - p)).toFixed(2));
      }).then(() => {
        ring.remove();
      });
    };

    // ── 장면 세우기 ────────────────────────────────────────────────────
    const buildScene = (graph: GrowOneTreeStageGraph): void => {
      settleAll();
      gEdges.textContent = '';
      gGrow.textContent = '';
      gWeights.textContent = '';
      gNodes.textContent = '';
      gTray.textContent = '';
      edgeLine.clear();
      edgeLabel.clear();
      edgeLabelBg.clear();
      nodeCircle.clear();
      nodeLabel.clear();
      chipGroup.clear();
      chipBox.clear();
      chipName.clear();
      chipWeight.clear();
      chipX.clear();
      chipLane.clear();
      chipNowY.clear();
      chipTargetY.clear();
      edgeState.clear();
      treeNodes.clear();

      specs = graph.edges;
      pos = placeNodes(graph.nodes);

      for (const e of specs) {
        const a = pos.get(e.u);
        const b = pos.get(e.v);
        if (!a || !b) continue;
        const line = el('line', {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          'stroke-linecap': 'round',
          'stroke-width': EDGE_W_IDLE,
        });
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const bg = el('rect', {
          x: mx - 11,
          y: my - 9,
          width: 22,
          height: 18,
          rx: 4,
          fill: c.bg,
        });
        const label = el('text', {
          x: mx,
          y: my + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        label.textContent = String(e.w);
        gEdges.appendChild(line);
        gWeights.append(bg, label);
        edgeLine.set(e.id, line);
        edgeLabelBg.set(e.id, bg);
        edgeLabel.set(e.id, label);
        edgeState.set(e.id, 'idle');
      }

      for (const name of graph.nodes) {
        const p = pos.get(name);
        if (!p) continue;
        const circle = el('circle', { cx: p.x, cy: p.y, r: NODE_R });
        const text = el('text', {
          x: p.x,
          y: p.y + 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
        });
        text.textContent = name;
        gNodes.append(circle, text);
        nodeCircle.set(name, circle);
        nodeLabel.set(name, text);
      }

      gTray.appendChild(
        el('line', {
          x1: 14,
          y1: SEPARATOR_Y,
          x2: W - 14,
          y2: SEPARATOR_Y,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );

      const laneNames = [
        tr('lane.tree', 'in tree'),
        tr('lane.canPick', 'can pick'),
        tr('lane.blocked', 'cannot'),
      ];
      laneNames.forEach((name, lane) => {
        const label = el('text', {
          x: LANE_LABEL_RIGHT,
          y: (LANE_Y[lane] ?? 0) + 4,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        label.textContent = name;
        gTray.appendChild(label);
      });

      const count = Math.max(1, specs.length);
      const room = W - TRAY_LEFT - TRAY_RIGHT_PAD;
      const chipW = Math.min(CHIP_MAX_W, Math.floor((room - CHIP_GAP * (count - 1)) / count));
      const rowW = chipW * count + CHIP_GAP * (count - 1);
      const x0 = TRAY_LEFT + Math.round((room - rowW) / 2);

      specs.forEach((e, i) => {
        const group = el('g', {});
        const box = el('rect', {
          x: 0,
          y: 0,
          width: chipW,
          height: CHIP_H,
          rx: 6,
          'stroke-width': 1,
        });
        const name = el('text', {
          x: 9,
          y: CHIP_H / 2 + 4,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        });
        name.textContent = `${e.u}–${e.v}`;
        const weight = el('text', {
          x: chipW - 9,
          y: CHIP_H / 2 + 4,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
        });
        weight.textContent = String(e.w);
        group.append(box, name, weight);
        gTray.appendChild(group);
        chipGroup.set(e.id, group);
        chipBox.set(e.id, box);
        chipName.set(e.id, name);
        chipWeight.set(e.id, weight);
        chipX.set(e.id, x0 + i * (chipW + CHIP_GAP));
      });

      applyStart();
    };

    /** 아무것도 자라지 않은 처음 모습. */
    const applyStart = (): void => {
      gGrow.textContent = '';
      treeNodes.clear();
      for (const e of specs) {
        edgeState.set(e.id, 'idle');
        paintEdge(e.id);
        setEdgeWidth(e.id, EDGE_W_IDLE);
        setChipLane(e.id, 2);
        placeChip(e.id, laneTop(2));
      }
      for (const name of nodeCircle.keys()) paintNode(name);
      captionLine1.textContent = '';
      captionLine2.textContent = '';
    };

    // ── projector 가 부르는 것들 ────────────────────────────────────────
    const setCaption = (text: string): void => {
      const [first = '', second = ''] = text.split('\n');
      captionLine1.textContent = first;
      captionLine2.textContent = second;
    };

    const seed = async (name: string): Promise<void> => {
      const p = pos.get(name);
      treeNodes.add(name);
      paintNode(name);
      if (p) await halo(p);
    };

    const showFrontier = async (candidates: string[]): Promise<void> => {
      const chosen = new Set(candidates);
      const from = new Map<string, number>();
      const to = new Map<string, number>();
      for (const e of specs) {
        const now = edgeState.get(e.id) ?? 'idle';
        const next: EdgeVisual = now === 'tree' ? 'tree' : chosen.has(e.id) ? 'candidate' : 'idle';
        from.set(e.id, widthOf(now));
        to.set(e.id, widthOf(next));
        edgeState.set(e.id, next);
        paintEdge(e.id);
        setChipLane(e.id, next === 'tree' ? 0 : next === 'candidate' ? 1 : 2);
      }
      await Promise.all([
        tween(FRONTIER_MS, (p) => {
          for (const e of specs) {
            const a = from.get(e.id) ?? EDGE_W_IDLE;
            const b = to.get(e.id) ?? EDGE_W_IDLE;
            setEdgeWidth(e.id, a + (b - a) * p);
          }
        }),
        tweenChips(CHIP_MS),
      ]);
    };

    const grow = async (edgeId: string, fromNode: string, toNode: string): Promise<void> => {
      const a = pos.get(fromNode);
      const b = pos.get(toNode);
      if (!a || !b) return;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      // 나무 쪽 끝에서 새 정점 쪽으로 그어 나간다. 밑에 깔린 후보 선은 그대로 두고
      // 그 위에 덧그어야 그리는 동안 선이 끊겨 보이지 않는다.
      const drawing = el('line', {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stroke: c.accent,
        'stroke-width': EDGE_W_GROW,
        'stroke-linecap': 'round',
        'stroke-dasharray': `${len} ${len}`,
        'stroke-dashoffset': len,
      });
      gGrow.appendChild(drawing);
      await tween(GROW_MS, (p) => {
        drawing.setAttribute('stroke-dashoffset', (len * (1 - p)).toFixed(1));
      });

      treeNodes.add(toNode);
      edgeState.set(edgeId, 'tree');
      paintEdge(edgeId);
      setEdgeWidth(edgeId, EDGE_W_TREE);
      paintNode(toNode);
      drawing.remove();
      setChipLane(edgeId, 0);
      await Promise.all([halo(b), tweenChips(CHIP_MS)]);
    };

    const markDone = async (): Promise<void> => {
      const grown = specs.filter((e) => edgeState.get(e.id) === 'tree');
      const rest = specs.filter((e) => edgeState.get(e.id) !== 'tree');
      // 나무가 다 자라면 고를 것이 남지 않는다 — 마지막 걸음의 후보도 내려온다.
      for (const e of rest) {
        edgeState.set(e.id, 'idle');
        paintEdge(e.id);
        setEdgeWidth(e.id, EDGE_W_IDLE);
        setChipLane(e.id, 2);
      }
      await Promise.all([
        tween(DONE_MS, (p) => {
          const swell = Math.sin(p * Math.PI);
          for (const e of grown) setEdgeWidth(e.id, EDGE_W_TREE + DONE_SWELL * swell);
          for (const e of rest) {
            edgeLine.get(e.id)?.setAttribute('opacity', (1 - DONE_FADE * p).toFixed(2));
            edgeLabel.get(e.id)?.setAttribute('opacity', (1 - DONE_FADE * p).toFixed(2));
          }
        }),
        tweenChips(CHIP_MS),
      ]);
    };

    const reset = (): void => {
      settleAll();
      applyStart();
    };

    return {
      setGraph(graph: GrowOneTreeStageGraph): void {
        buildScene(graph);
      },
      setCaption,
      seed,
      showFrontier,
      grow,
      markDone,
      reset,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 남은 움직임을 끝맺어 emit 을 기다리는 algorithm 이 매달리지 않게 한다.
        settleAll();
        canvas.textContent = '';
      },
    };
  },
};
