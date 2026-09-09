/**
 * repeat-relax-all-stage — 되풀이가 한 칸씩 번져 나가는 것을 그리는 캔버스.
 *
 * 화면은 두 층이다.
 *
 *   위  사슬로 놓인 정점과 간선. 살핌창(probe)이 **간선을 보는 순서대로** 미끄러진다.
 *       그 순서가 거꾸로라 창은 오른쪽에서 왼쪽으로 가고, 값은 왼쪽에서 오른쪽으로
 *       한 칸 건너간다. 둘이 반대로 움직이는 것이 헛수고의 까닭이다.
 *   아래 바퀴 장부. 가로 칸은 위 간선과 같은 x 에 놓여 세로 안내선으로 이어진다.
 *       한 줄이 한 바퀴이고, 칸 하나가 살핌 한 번이다. 헛돈 살핌은 짧은 줄표,
 *       일이 된 살핌은 새 거리가 적힌 채움. 마지막에 채움들을 이으면 한 바퀴에
 *       한 칸씩 내려가는 계단이 남는다 — 그것이 바퀴 수가 정점 수만큼 드는 까닭이다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다. 정점 다섯 · 바퀴 넷이 이 조각의 데이터이고
 * 장부 줄 수는 그 안에서 정해지므로, 넘칠 일이 있으면 줄 간격을 줄여 담는다.
 *
 * 타이머: rAF 만 쓰고 스스로 다음 회차를 예약하는 루프는 없다. 각 tween 은
 * 유한하며 `destroy()` 가 걸린 rAF 를 전부 취소하고 대기 중인 약속을 즉시 푼다
 * (풀지 않으면 알고리즘의 `await emit` 이 영영 매달린다).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 정점 · 간선 · 바퀴 수. projector 가 좁혀서 넘긴다. */
export type RelaxStageModel = {
  nodes: string[];
  edges: { from: string; to: string; weight: number }[];
  source: string;
  rounds: number;
};

export type RelaxSkipStep = {
  round: number;
  edgeIndex: number;
  reason: 'unknown' | 'noGain';
};

export type RelaxApplyStep = {
  round: number;
  edgeIndex: number;
  dist: number;
};

export type RelaxRoundStep = {
  round: number;
  scans: number;
  applied: number;
};

// ── 판 크기. 가로는 조각 공통 폭, 세로는 내용(정점 한 줄 + 장부 넉 줄 + 문장)이 정한다.
const W = PIECE_CANVAS_W;
const H = 300;

const NODE_R = 21;
const NODE_CY = 78;
const BADGE_CY = 34;
const BADGE_W = 46;
const BADGE_H = 22;
/** 정점 사이 간격의 상한. 실제 간격은 폭에서 역산한다. */
const NODE_GAP_MAX = 140;
const SIDE_MIN = 40;

const LEDGER_TOP = 116;
const LEDGER_ROW_MAX = 30;
const CELL_R = 11;
const ROW_LABEL_X = 22;
const TALLY_X = 604;

const CAPTION_Y = 264;
const CAPTION_LINE = 20;
const CAPTION_MAX_W = W - 48;

const PROBE_MS = 150;
const PROBE_FADE_MS = 130;
const TOKEN_MS = 320;
const STAIR_MS = 420;

const INFINITY_GLYPH = '∞';

type NodeState = 'unknown' | 'active' | 'settled';

type NodeParts = {
  circle: SVGCircleElement;
  letter: SVGTextElement;
  badge: SVGRectElement;
  badgeText: SVGTextElement;
};

type CellParts = {
  ring: SVGCircleElement;
  dash: SVGLineElement;
  value: SVGTextElement;
};

function add<K extends keyof SVGElementTagNameMap>(
  parent: SVGElement,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
  parent.appendChild(node);
  return node;
}

function inscribe(
  parent: SVGElement,
  x: number,
  y: number,
  content: string,
  size: string,
  fill: string,
  weight: '400' | '600',
  anchor: 'start' | 'middle' | 'end' = 'middle',
): SVGTextElement {
  const node = add(parent, 'text', {
    x,
    y,
    'text-anchor': anchor,
    'dominant-baseline': 'central',
    'font-family': fonts.body,
    'font-size': size,
    'font-weight': weight,
    fill,
  });
  node.textContent = content;
  return node;
}

function px(token: string): number {
  return Number.parseInt(token, 10);
}

/** 한글은 폭이 라틴의 두 배쯤이므로 글자마다 나눠 잰다. 정밀할 필요는 없다. */
function measure(text: string, size: number): number {
  let sum = 0;
  for (const ch of text) sum += ch.charCodeAt(0) > 0x2000 ? size : size * 0.55;
  return sum;
}

/**
 * 문장이 한 줄에 안 들어가면 두 줄로 나눈다. 앞줄을 꽉 채우는 대신 **두 줄의
 * 길이가 비슷해지는 자리**를 고른다 — 그리 하지 않으면 뒷줄에 낱말 하나만
 * 남아 문장이 잘린 것처럼 보인다.
 */
function foldCaption(text: string, size: number): string[] {
  if (measure(text, size) <= CAPTION_MAX_W) return [text];
  const words = text.split(' ');
  if (words.length < 2) return [text];

  let bestAt = 1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let at = 1; at < words.length; at += 1) {
    const head = words.slice(0, at).join(' ');
    const rest = words.slice(at).join(' ');
    const headW = measure(head, size);
    if (headW > CAPTION_MAX_W) break;
    const gap = Math.abs(headW - measure(rest, size));
    if (gap < bestGap) {
      bestGap = gap;
      bestAt = at;
    }
  }
  return [words.slice(0, bestAt).join(' '), words.slice(bestAt).join(' ')];
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function mount(
  _container: HTMLElement,
  params: ViewMountParams & { canvas: SVGSVGElement },
): ViewInstance {
  const tr = params.t ?? makeTranslator(params.locale);
  const palette: Palette = getColors(params.theme);
  const canvas = params.canvas;

  // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었으므로 비우면
  // 그림이 통째로 떨어져 나간다 (S-view).
  const root = add(canvas, 'g', {});

  let destroyed = false;
  const frames = new Set<number>();
  const waiting = new Set<() => void>();

  function tween(durMs: number, onFrame: (p: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      if (destroyed) {
        resolve();
        return;
      }
      const started = Date.now();
      waiting.add(resolve);
      const finish = (): void => {
        waiting.delete(resolve);
        resolve();
      };
      const tick = (): void => {
        if (destroyed) {
          finish();
          return;
        }
        const raw = Math.min(1, (Date.now() - started) / durMs);
        onFrame(ease(raw));
        if (raw >= 1) {
          finish();
          return;
        }
        frames.add(requestAnimationFrame(tick));
      };
      onFrame(0);
      frames.add(requestAnimationFrame(tick));
    });
  }

  // ── 판 상태
  let model: RelaxStageModel = { nodes: [], edges: [], source: '', rounds: 0 };
  let nodeX: number[] = [];
  let edgeMidX: number[] = [];
  let rowY: number[] = [];
  let probeSpan = 0;

  let nodeParts: NodeParts[] = [];
  let edgeLines: SVGPathElement[] = [];
  let edgeHeads: SVGPathElement[] = [];
  let cells: CellParts[][] = [];
  let rowBands: SVGRectElement[] = [];
  let tallies: SVGTextElement[] = [];
  let stair: SVGPolylineElement | null = null;
  let probe: SVGGElement | null = null;
  let probeWindow: SVGRectElement | null = null;
  let tokenLayer: SVGGElement | null = null;
  let captionLayer: SVGGElement | null = null;

  let probeX: number | null = null;
  let activeRound = 0;
  let nodeStates: NodeState[] = [];
  const appliedAt: { round: number; edgeIndex: number }[] = [];

  function paintNode(index: number): void {
    const parts = nodeParts[index];
    if (!parts) return;
    const state = nodeStates[index];
    if (state === 'settled') {
      parts.circle.setAttribute('fill', palette.itemSorted);
      parts.circle.setAttribute('stroke', palette.itemSorted);
      parts.circle.setAttribute('stroke-dasharray', 'none');
      parts.letter.setAttribute('fill', palette.textInverse);
    } else if (state === 'active') {
      parts.circle.setAttribute('fill', palette.itemActive);
      parts.circle.setAttribute('stroke', palette.itemActive);
      parts.circle.setAttribute('stroke-dasharray', 'none');
      parts.letter.setAttribute('fill', palette.stateInk);
    } else {
      parts.circle.setAttribute('fill', palette.bg);
      parts.circle.setAttribute('stroke', palette.ghostOutline);
      parts.circle.setAttribute('stroke-dasharray', '4 3');
      parts.letter.setAttribute('fill', palette.textMuted);
    }
  }

  function paintBadge(index: number, dist: number | null): void {
    const parts = nodeParts[index];
    if (!parts) return;
    if (dist === null) {
      parts.badgeText.textContent = INFINITY_GLYPH;
      parts.badgeText.setAttribute('fill', palette.ghostOutline);
      parts.badge.setAttribute('stroke', palette.ghostOutline);
      parts.badge.setAttribute('stroke-dasharray', '4 3');
      parts.badge.setAttribute('fill', 'none');
    } else {
      parts.badgeText.textContent = String(dist);
      parts.badgeText.setAttribute('fill', palette.text);
      parts.badge.setAttribute('stroke', palette.border);
      parts.badge.setAttribute('stroke-dasharray', 'none');
      parts.badge.setAttribute('fill', palette.bgSubtle);
    }
  }

  function setCaption(text: string): void {
    if (!captionLayer) return;
    captionLayer.textContent = '';
    const size = px(fontSizes.md);
    const lines = foldCaption(text, size);
    for (let i = 0; i < lines.length; i += 1) {
      inscribe(
        captionLayer,
        W / 2,
        CAPTION_Y + i * CAPTION_LINE,
        lines[i],
        fontSizes.md,
        palette.text,
        '400',
      );
    }
  }

  function openRound(round: number): void {
    if (round === activeRound) return;
    activeRound = round;
    for (let i = 0; i < rowBands.length; i += 1) {
      rowBands[i].setAttribute('fill', i === round - 1 ? palette.bgSubtle : 'none');
    }
  }

  async function moveProbe(edgeIndex: number): Promise<void> {
    if (!probe || !probeWindow) return;
    probeWindow.setAttribute('stroke', palette.auxCursor);
    const target = edgeMidX[edgeIndex];
    if (target === undefined) return;
    if (probeX === null) {
      probeX = target;
      probe.setAttribute('transform', `translate(${target} 0)`);
      await tween(PROBE_FADE_MS, (p) => probe?.setAttribute('opacity', String(p)));
      return;
    }
    const from = probeX;
    probeX = target;
    await tween(PROBE_MS, (p) => {
      probe?.setAttribute('transform', `translate(${from + (target - from) * p} 0)`);
    });
  }

  function buildStage(next: RelaxStageModel): void {
    model = next;
    root.textContent = '';
    nodeParts = [];
    edgeLines = [];
    edgeHeads = [];
    cells = [];
    rowBands = [];
    tallies = [];
    appliedAt.length = 0;
    probeX = null;
    activeRound = 0;

    const count = Math.max(1, model.nodes.length);
    const gap =
      count > 1 ? Math.min(NODE_GAP_MAX, Math.floor((W - SIDE_MIN * 2) / (count - 1))) : 0;
    const originX = Math.round((W - gap * (count - 1)) / 2);
    nodeX = model.nodes.map((_, i) => originX + gap * i);
    edgeMidX = model.edges.map((edge) => {
      const a = nodeX[model.nodes.indexOf(edge.from)] ?? originX;
      const b = nodeX[model.nodes.indexOf(edge.to)] ?? originX;
      return (a + b) / 2;
    });
    probeSpan = Math.max(40, gap - NODE_R * 2 - 8);

    const rounds = Math.max(1, model.rounds);
    // 줄이 많아지면 간격을 줄여 담는다. 판 높이는 늘리지 않는다 (S-view).
    const rowH = Math.min(LEDGER_ROW_MAX, Math.floor((H - LEDGER_TOP - 62) / rounds));
    rowY = [];
    for (let i = 0; i < rounds; i += 1) rowY.push(LEDGER_TOP + 4 + rowH / 2 + i * rowH);
    const ledgerBottom = LEDGER_TOP + 4 + rounds * rowH;

    // 1. 세로 안내선 — 위의 간선과 아래의 장부 칸을 같은 x 로 묶는다.
    const guides = add(root, 'g', {});
    for (const midX of edgeMidX) {
      add(guides, 'line', {
        x1: midX,
        y1: NODE_CY + 26,
        x2: midX,
        y2: ledgerBottom,
        stroke: palette.border,
        'stroke-width': 1,
        'stroke-dasharray': '3 4',
      });
    }

    // 2. 바퀴 줄 띠
    const bands = add(root, 'g', {});
    for (let r = 0; r < rounds; r += 1) {
      rowBands.push(
        add(bands, 'rect', {
          x: 8,
          y: rowY[r] - rowH / 2 + 2,
          width: W - 16,
          height: rowH - 4,
          rx: 7,
          fill: 'none',
        }),
      );
    }

    // 3. 계단 (마지막에 드러난다)
    stair = add(root, 'polyline', {
      points: '',
      fill: 'none',
      stroke: palette.accent,
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      opacity: 0,
    });

    // 4. 장부 칸 · 줄 번호 · 셈
    const ledger = add(root, 'g', {});
    inscribe(
      ledger,
      ROW_LABEL_X,
      LEDGER_TOP - 4,
      tr('label.rounds', 'rounds'),
      fontSizes.xs,
      palette.textMuted,
      '400',
    );
    for (let r = 0; r < rounds; r += 1) {
      inscribe(
        ledger,
        ROW_LABEL_X,
        rowY[r],
        String(r + 1),
        fontSizes.sm,
        palette.textMuted,
        '600',
      );
      const row: CellParts[] = [];
      for (let e = 0; e < model.edges.length; e += 1) {
        const cx = edgeMidX[e];
        const ring = add(ledger, 'circle', {
          cx,
          cy: rowY[r],
          r: CELL_R,
          fill: 'none',
          stroke: palette.border,
          'stroke-width': 1,
        });
        const dash = add(ledger, 'line', {
          x1: cx - 5,
          y1: rowY[r],
          x2: cx + 5,
          y2: rowY[r],
          stroke: palette.textMuted,
          'stroke-width': 2,
          'stroke-linecap': 'round',
          opacity: 0,
        });
        const value = inscribe(
          ledger,
          cx,
          rowY[r],
          '',
          fontSizes.sm,
          palette.stateInk,
          '600',
        );
        row.push({ ring, dash, value });
      }
      cells.push(row);
      tallies.push(
        inscribe(ledger, TALLY_X, rowY[r], '', fontSizes.sm, palette.textMuted, '400', 'end'),
      );
    }

    // 5. 간선
    const edgeLayer = add(root, 'g', {});
    for (const edge of model.edges) {
      const ax = nodeX[model.nodes.indexOf(edge.from)] ?? originX;
      const bx = nodeX[model.nodes.indexOf(edge.to)] ?? originX;
      const dir = bx >= ax ? 1 : -1;
      const x1 = ax + dir * (NODE_R + 3);
      const x2 = bx - dir * (NODE_R + 9);
      edgeLines.push(
        add(edgeLayer, 'path', {
          d: `M ${x1} ${NODE_CY} L ${x2} ${NODE_CY}`,
          stroke: palette.border,
          'stroke-width': 1.6,
          fill: 'none',
        }),
      );
      edgeHeads.push(
        add(edgeLayer, 'path', {
          d: `M ${x2} ${NODE_CY - 5} L ${x2 + dir * 9} ${NODE_CY} L ${x2} ${NODE_CY + 5} Z`,
          fill: palette.border,
          stroke: 'none',
        }),
      );
    }

    // 6. 살핌창 — 0 을 중심으로 그리고 translate 로 옮긴다.
    probe = add(root, 'g', { opacity: 0 });
    probeWindow = add(probe, 'rect', {
      x: -probeSpan / 2,
      y: NODE_CY - 23,
      width: probeSpan,
      height: 46,
      rx: 9,
      fill: 'none',
      stroke: palette.auxCursor,
      'stroke-width': 1.5,
      'stroke-dasharray': '5 4',
    });
    add(probe, 'line', {
      x1: 0,
      y1: NODE_CY + 23,
      x2: 0,
      y2: LEDGER_TOP - 12,
      stroke: palette.auxCursor,
      'stroke-width': 1,
      'stroke-dasharray': '3 4',
    });

    // 7. 정점 · 거리 뱃지
    const nodeLayer = add(root, 'g', {});
    nodeStates = model.nodes.map((name) => (name === model.source ? 'settled' : 'unknown'));
    for (let i = 0; i < model.nodes.length; i += 1) {
      const badge = add(nodeLayer, 'rect', {
        x: nodeX[i] - BADGE_W / 2,
        y: BADGE_CY - BADGE_H / 2,
        width: BADGE_W,
        height: BADGE_H,
        rx: 6,
        fill: 'none',
        stroke: palette.ghostOutline,
        'stroke-width': 1,
      });
      const badgeText = inscribe(
        nodeLayer,
        nodeX[i],
        BADGE_CY,
        INFINITY_GLYPH,
        fontSizes.md,
        palette.ghostOutline,
        '600',
      );
      const circle = add(nodeLayer, 'circle', {
        cx: nodeX[i],
        cy: NODE_CY,
        r: NODE_R,
        fill: palette.bg,
        stroke: palette.ghostOutline,
        'stroke-width': 1.5,
      });
      const letter = inscribe(
        nodeLayer,
        nodeX[i],
        NODE_CY,
        model.nodes[i],
        fontSizes.md,
        palette.textMuted,
        '600',
      );
      nodeParts.push({ circle, letter, badge, badgeText });
      paintNode(i);
      paintBadge(i, model.nodes[i] === model.source ? 0 : null);
    }

    tokenLayer = add(root, 'g', {});
    captionLayer = add(root, 'g', {});
  }

  function markCellIdle(round: number, edgeIndex: number): void {
    const cell = cells[round - 1]?.[edgeIndex];
    if (!cell) return;
    cell.dash.setAttribute('opacity', '1');
  }

  function markCellApplied(round: number, edgeIndex: number, dist: number): void {
    const cell = cells[round - 1]?.[edgeIndex];
    if (!cell) return;
    cell.ring.setAttribute('fill', palette.accent);
    cell.ring.setAttribute('stroke', palette.accent);
    cell.value.textContent = String(dist);
    appliedAt.push({ round, edgeIndex });
  }

  async function scanSkip(step: RelaxSkipStep): Promise<void> {
    if (destroyed) return;
    openRound(step.round);
    await moveProbe(step.edgeIndex);
    if (destroyed) return;
    markCellIdle(step.round, step.edgeIndex);
  }

  async function scanApply(step: RelaxApplyStep): Promise<void> {
    if (destroyed) return;
    openRound(step.round);
    await moveProbe(step.edgeIndex);
    if (destroyed || !tokenLayer) return;
    probeWindow?.setAttribute('stroke', palette.accent);

    const edge = model.edges[step.edgeIndex];
    if (!edge) return;
    const fromIndex = model.nodes.indexOf(edge.from);
    const toIndex = model.nodes.indexOf(edge.to);
    const ax = nodeX[fromIndex] ?? 0;
    const bx = nodeX[toIndex] ?? 0;

    const token = add(tokenLayer, 'g', { transform: `translate(${ax} ${NODE_CY})` });
    add(token, 'circle', {
      cx: 0,
      cy: 0,
      r: 13,
      fill: palette.accent,
      stroke: palette.accent,
      'stroke-width': 1,
    });
    inscribe(token, 0, 0, String(step.dist), fontSizes.sm, palette.stateInk, '600');

    // 값이 간선을 타고 실제로 건너간다 — 이 조각의 동사가 "번져 나간다" 이므로
    // 색만 바뀌어서는 안 된다.
    await tween(TOKEN_MS, (p) => {
      token.setAttribute('transform', `translate(${ax + (bx - ax) * p} ${NODE_CY})`);
    });
    token.remove();
    if (destroyed) return;

    edgeLines[step.edgeIndex]?.setAttribute('stroke', palette.text);
    edgeLines[step.edgeIndex]?.setAttribute('stroke-width', '2.2');
    edgeHeads[step.edgeIndex]?.setAttribute('fill', palette.text);
    if (toIndex >= 0) {
      nodeStates[toIndex] = 'active';
      paintNode(toIndex);
      paintBadge(toIndex, step.dist);
    }
    markCellApplied(step.round, step.edgeIndex, step.dist);
  }

  function finishRound(step: RelaxRoundStep): void {
    if (destroyed) return;
    for (let i = 0; i < nodeStates.length; i += 1) {
      if (nodeStates[i] === 'active') {
        nodeStates[i] = 'settled';
        paintNode(i);
      }
    }
    const tally = tallies[step.round - 1];
    if (tally) {
      tally.textContent = `${step.applied} / ${step.scans}`;
      tally.setAttribute('fill', step.applied > 0 ? palette.text : palette.textMuted);
    }
  }

  async function finish(): Promise<void> {
    if (destroyed) return;
    if (probe) {
      const node = probe;
      await tween(PROBE_FADE_MS, (p) => node.setAttribute('opacity', String(1 - p)));
    }
    if (destroyed || !stair || appliedAt.length < 2) return;

    const pts = appliedAt.map((hit) => ({
      x: edgeMidX[hit.edgeIndex] ?? 0,
      y: rowY[hit.round - 1] ?? 0,
    }));
    let length = 0;
    for (let i = 1; i < pts.length; i += 1) {
      length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    const line = stair;
    line.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '));
    line.setAttribute('opacity', '0.6');
    line.setAttribute('stroke-dasharray', String(length));
    // 계단을 한 번에 띄우지 않고 위에서 아래로 그어 내린다 — 한 바퀴에 한 칸씩.
    await tween(STAIR_MS, (p) => {
      line.setAttribute('stroke-dashoffset', String(length * (1 - p)));
    });
    line.setAttribute('stroke-dasharray', 'none');
  }

  buildStage({ nodes: [], edges: [], source: '', rounds: 0 });

  return {
    setup(next: RelaxStageModel): void {
      if (destroyed) return;
      buildStage(next);
    },
    setCaption(text: string): void {
      if (destroyed) return;
      setCaption(text);
    },
    scanSkip,
    scanApply,
    finishRound,
    finish,
    destroy(): void {
      destroyed = true;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      // 매달린 tween 약속을 푼다. 두면 알고리즘의 await emit 이 끝나지 않는다.
      for (const resolve of waiting) resolve();
      waiting.clear();
      root.remove();
    },
  };
}

export const repeatRelaxAllStageView: CanvasView = {
  canvas: { height: H },
  mount,
};
