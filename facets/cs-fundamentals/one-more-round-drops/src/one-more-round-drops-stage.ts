/**
 * one-more-round-drops 조각의 그림.
 *
 * 동사는 **끝없이 내려간다**. 그래서 화면의 세로가 곧 값이다 — 오른쪽에 정점마다
 * 세로 궤도를 하나씩 두고, 바퀴가 돌 때마다 그 정점의 알갱이가 새 값의 높이로
 * 떨어진다. 떠난 자리에는 눈금이 남으므로, 바퀴를 거듭할수록 눈금이 사다리처럼
 * 아래로 이어진다. **눈금 간격이 일정한 것**이 "바퀴마다 같은 폭으로" 다.
 *
 * n−1 바퀴를 마친 자리에는 알갱이 밑에 파선으로 바닥을 긋는다. 다음 바퀴에
 * 알갱이는 그 바닥을 뚫고 내려가고, 바닥은 그때 붉어진다. 마지막에는 알갱이가
 * 궤도 아래로 화살표를 내밀어 화면 밖으로 이어진다 — 화면은 멈추지만 수는 멈추지
 * 않는다는 뜻이다.
 *
 * 왼쪽은 그래프다. 바퀴마다 값을 낮춘 간선이 잠깐 켜지므로, 오른쪽에서 떨어지는
 * 것이 왼쪽의 어느 고리 때문인지 눈으로 잇는다. 마지막 걸음에서 그 고리가 붉게
 * 남는다.
 *
 * 색은 전부 design-tokens 경유다 (S-view). 화면 문자는 캡션이 projector 에서
 * 오고, 궤도 위의 바퀴 표시만 이 view 가 `params.t` 로 조회한다 (C10).
 */

import { PIECE_CANVAS_W, fontSizes, fonts, getColors, makeTranslator } from '@ffacet/core/runtime';
import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 빼기 기호. 하이픈이 아니라 U+2212 — 무게와 값의 부호는 수식 표기다 (C10 표식). */
const MINUS = '−';
const INFINITY_MARK = '∞';

const H = 300;
const PAD = 18;
/** 왼쪽 그래프가 가져가는 폭의 비율. 나머지는 전부 궤도 판이 채운다 (S-piece). */
const GRAPH_RATIO = 0.38;
const PANEL_GAP = 24;

const NODE_R = 17;
const RING_R_MAX = 72;

const PILL_W_MAX = 46;
const PILL_H = 15;
/** 값 한 칸의 세로 길이 상한. 바퀴가 적어도 눈금이 과장되지 않게 막는다. */
const UNIT_MAX = 16;

const Y_ROUND = 26;
const Y_HEAD = 48;
const Y_INF = 66;
const Y_TOP = 88;
const Y_BOT = 238;
const Y_FALL = 272;
const Y_CAP = 288;

const DROP_MS = 420;
const DROP_STAGGER_MS = 130;
const FALL_MS = 420;

type EdgeSpec = { from: string; to: string; w: number };
type Entry = { node: string; value: number | null; delta: number | null };

type GraphSpec = {
  nodes: string[];
  edges: EdgeSpec[];
  source: string;
  entries: Entry[];
  vMax: number;
  vMin: number;
};
type RoundSpec = { round: number; beyond: boolean; entries: Entry[]; relaxed: string[] };
type FloorSpec = { entries: Entry[] };
type FallSpec = { cycle: string[] };

type Token = {
  group: SVGGElement;
  value: SVGTextElement;
  delta: SVGTextElement;
  pill: SVGRectElement;
  cx: number;
};
type EdgeParts = { line: SVGLineElement; head: SVGPolygonElement; weight: SVGTextElement };

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function signed(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n);
}

/** 떨어지는 것이므로 가속한다 — 등속으로 옮기면 미끄러지는 것으로 읽힌다. */
function fallEase(p: number): number {
  return p * p;
}

export const oneMoreRoundDropsStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const color: Palette = getColors(params.theme);
    // 러너 밖 mount 를 위한 fallback 은 이 형태로만 둔다 (C10).
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    // 컨테이너가 아니라 캔버스 안쪽만 비운다. 컨테이너를 비우면 러너가 붙여 준
    // 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const W = PIECE_CANVAS_W;
    const graphW = Math.round((W - PAD * 2) * GRAPH_RATIO);
    const graphX0 = PAD;
    const panelX0 = graphX0 + graphW + PANEL_GAP;
    const panelX1 = W - PAD;

    const layerEdges = svgEl('g');
    const layerNodes = svgEl('g');
    const layerTracks = svgEl('g');
    const layerTicks = svgEl('g');
    const layerFloors = svgEl('g');
    const layerFall = svgEl('g');
    const layerTokens = svgEl('g');
    for (const layer of [
      layerEdges,
      layerNodes,
      layerTracks,
      layerTicks,
      layerFloors,
      layerFall,
      layerTokens,
    ]) {
      canvas.appendChild(layer);
    }

    const roundText = svgEl('text', {
      x: panelX0,
      y: Y_ROUND,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      'font-weight': '600',
      fill: color.textMuted,
    });
    canvas.appendChild(roundText);

    const captionText = svgEl('text', {
      x: W / 2,
      y: Y_CAP,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: color.text,
    });
    canvas.appendChild(captionText);

    // ── 장면 상태 ────────────────────────────────────────────────────────
    let destroyed = false;
    let rafId: number | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingFinish: (() => void) | null = null;

    let vMax = 0;
    let vMin = 0;
    let unit = UNIT_MAX;
    let pillW = PILL_W_MAX;
    let lastMovers: string[] = [];

    const tokens = new Map<string, Token>();
    const edgeParts = new Map<string, EdgeParts>();
    const floors = new Map<string, SVGLineElement>();
    const current = new Map<string, number | null>();
    const litEdges = new Set<string>();

    function yFor(value: number | null): number {
      if (value === null) return Y_INF;
      return Y_TOP + (vMax - value) * unit;
    }

    function label(
      x: number,
      y: number,
      content: string,
      size: string,
      fill: string,
      anchor: string,
    ): SVGTextElement {
      const node = svgEl('text', {
        x,
        y,
        'text-anchor': anchor,
        'font-family': fonts.body,
        'font-size': size,
        fill,
      });
      node.textContent = content;
      return node;
    }

    // ── 애니메이션 ───────────────────────────────────────────────────────
    /**
     * 한 번에 하나만 돈다 (러너가 걸음마다 await 한다). rAF 가 돌지 않는 자리를
     * 대비해 안전망 타이머를 함께 건다 — 여기서 매달리면 emit 이 돌아오지 않아
     * 조각 전체가 멎는다.
     */
    function tween(totalMs: number, onFrame: (elapsed: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          onFrame(totalMs);
          resolve();
          return;
        }
        const started = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          pendingFinish = null;
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          if (safetyTimer !== null) {
            clearTimeout(safetyTimer);
            safetyTimer = null;
          }
          onFrame(totalMs);
          resolve();
        };
        pendingFinish = finish;
        safetyTimer = setTimeout(finish, totalMs + 300);
        const frame = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const elapsed = Date.now() - started;
          if (elapsed >= totalMs) {
            finish();
            return;
          }
          onFrame(elapsed);
          rafId = requestAnimationFrame(frame);
        };
        onFrame(0);
        rafId = requestAnimationFrame(frame);
      });
    }

    // ── 그래프 ───────────────────────────────────────────────────────────
    type Placed = {
      spot: Map<string, { x: number; y: number }>;
      ringCx: number;
      ringCy: number;
    };

    function placeNodes(nodes: string[], source: string): Placed {
      const spot = new Map<string, { x: number; y: number }>();
      const ring = nodes.filter((n) => n !== source);
      const ringR = Math.min(RING_R_MAX, (graphW - NODE_R * 2) * 0.36);
      const ringCx = graphX0 + graphW * 0.62;
      const ringCy = (Y_TOP + Y_BOT) / 2 + 2;
      ring.forEach((node, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, ring.length);
        spot.set(node, {
          x: ringCx + ringR * Math.cos(angle),
          y: ringCy + ringR * Math.sin(angle),
        });
      });
      // 출발점은 고리 바깥 왼쪽에 세운다. 고리 안에 섞으면 "여기서만 들어온다" 가
      // 보이지 않는다.
      spot.set(source, { x: graphX0 + NODE_R + 4, y: ringCy - ringR * 0.62 });
      return { spot, ringCx, ringCy };
    }

    function drawEdge(
      key: string,
      from: { x: number; y: number },
      to: { x: number; y: number },
      weight: number,
      ringCx: number,
      ringCy: number,
    ): void {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const gap = NODE_R + 5;
      const x1 = from.x + ux * gap;
      const y1 = from.y + uy * gap;
      const x2 = to.x - ux * gap;
      const y2 = to.y - uy * gap;

      const line = svgEl('line', {
        x1,
        y1,
        x2,
        y2,
        stroke: color.textMuted,
        'stroke-width': 1.6,
        'stroke-linecap': 'round',
      });
      const hx = 8;
      const hy = 4.4;
      const head = svgEl('polygon', {
        points: [
          `${x2},${y2}`,
          `${x2 - ux * hx - uy * hy},${y2 - uy * hx + ux * hy}`,
          `${x2 - ux * hx + uy * hy},${y2 - uy * hx - ux * hy}`,
        ].join(' '),
        fill: color.textMuted,
      });

      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const outX = midX - ringCx;
      const outY = midY - ringCy;
      const outLen = Math.hypot(outX, outY) || 1;
      const weightNode = label(
        midX + (outX / outLen) * 15,
        midY + (outY / outLen) * 15 + 4,
        signed(weight),
        fontSizes.sm,
        color.textMuted,
        'middle',
      );

      layerEdges.appendChild(line);
      layerEdges.appendChild(head);
      layerEdges.appendChild(weightNode);
      edgeParts.set(key, { line, head, weight: weightNode });
    }

    function paintEdge(key: string, state: 'idle' | 'lit' | 'guilty'): void {
      const parts = edgeParts.get(key);
      if (!parts) return;
      const stroke =
        state === 'idle' ? color.textMuted : state === 'lit' ? color.itemActive : color.danger;
      parts.line.setAttribute('stroke', stroke);
      parts.line.setAttribute('stroke-width', state === 'idle' ? '1.6' : '2.6');
      parts.head.setAttribute('fill', stroke);
      parts.weight.setAttribute('fill', state === 'idle' ? color.textMuted : stroke);
      parts.weight.setAttribute('font-weight', state === 'idle' ? '400' : '700');
    }

    function unlitAll(): void {
      for (const key of litEdges) paintEdge(key, 'idle');
      litEdges.clear();
    }

    // ── 궤도 ─────────────────────────────────────────────────────────────
    function paintToken(node: string, state: 'idle' | 'moved' | 'broken'): void {
      const token = tokens.get(node);
      if (!token) return;
      const fill =
        state === 'idle' ? color.itemDefault : state === 'moved' ? color.itemActive : color.danger;
      token.pill.setAttribute('fill', fill);
      token.pill.setAttribute('stroke', state === 'idle' ? color.border : fill);
      // 고정 타일 위의 잉크는 테마를 따라 뒤집지 않는다 (design-tokens 의 표).
      token.value.setAttribute('fill', state === 'idle' ? color.text : color.stateInk);
      token.delta.setAttribute('fill', state === 'broken' ? color.danger : color.textMuted);
    }

    function buildTracks(nodes: string[]): void {
      const span = (panelX1 - panelX0) / Math.max(1, nodes.length);
      pillW = Math.min(PILL_W_MAX, Math.floor(span - 22));
      nodes.forEach((node, i) => {
        const cx = panelX0 + span * (i + 0.5);
        layerTracks.appendChild(
          svgEl('line', {
            x1: cx,
            y1: Y_INF - 14,
            x2: cx,
            y2: Y_BOT + 20,
            stroke: color.border,
            'stroke-width': 1,
          }),
        );
        layerTracks.appendChild(
          label(cx, Y_HEAD, node, fontSizes.sm, color.textMuted, 'middle'),
        );

        const group = svgEl('g');
        const pill = svgEl('rect', {
          x: -pillW / 2,
          y: -PILL_H / 2,
          width: pillW,
          height: PILL_H,
          rx: 4,
          fill: color.itemDefault,
          stroke: color.border,
          'stroke-width': 1,
        });
        const value = svgEl('text', {
          x: 0,
          y: 0,
          dy: '0.34em',
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: color.text,
        });
        const delta = svgEl('text', {
          x: pillW / 2 + 5,
          y: 0,
          dy: '0.34em',
          'text-anchor': 'start',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: color.textMuted,
        });
        group.appendChild(pill);
        group.appendChild(value);
        group.appendChild(delta);
        layerTokens.appendChild(group);
        tokens.set(node, { group, value, delta, pill, cx });
      });
    }

    function moveToken(node: string, y: number): void {
      const token = tokens.get(node);
      if (!token) return;
      token.group.setAttribute('transform', `translate(${token.cx}, ${y})`);
    }

    function dropTick(node: string, y: number): void {
      const token = tokens.get(node);
      if (!token) return;
      layerTicks.appendChild(
        svgEl('line', {
          x1: token.cx - pillW / 2,
          y1: y,
          x2: token.cx + pillW / 2,
          y2: y,
          stroke: color.textMuted,
          'stroke-width': 1.4,
          opacity: 0.42,
        }),
      );
    }

    function clearLayers(): void {
      for (const layer of [
        layerEdges,
        layerNodes,
        layerTracks,
        layerTicks,
        layerFloors,
        layerFall,
        layerTokens,
      ]) {
        layer.textContent = '';
      }
      tokens.clear();
      edgeParts.clear();
      litEdges.clear();
      floors.clear();
      current.clear();
      lastMovers = [];
      roundText.textContent = '';
      roundText.setAttribute('fill', color.textMuted);
      captionText.textContent = '';
    }

    return {
      destroy(): void {
        destroyed = true;
        // 걸음이 애니메이션 도중에 접혔으면 그 promise 를 풀어 준다. 안 풀면
        // algorithm 의 emit 이 영영 돌아오지 않는다.
        if (pendingFinish) pendingFinish();
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (safetyTimer !== null) {
          clearTimeout(safetyTimer);
          safetyTimer = null;
        }
        canvas.textContent = '';
      },

      resetScene(): void {
        clearLayers();
      },

      setCaption(text: string): void {
        captionText.textContent = text;
      },

      showGraph(spec: GraphSpec): void {
        clearLayers();
        vMax = spec.vMax;
        vMin = spec.vMin;
        const span = Math.max(1, vMax - vMin);
        unit = Math.min(UNIT_MAX, (Y_BOT - Y_TOP) / span);

        const { spot, ringCx, ringCy } = placeNodes(spec.nodes, spec.source);

        for (const edge of spec.edges) {
          const from = spot.get(edge.from);
          const to = spot.get(edge.to);
          if (!from || !to) continue;
          drawEdge(`${edge.from}-${edge.to}`, from, to, edge.w, ringCx, ringCy);
        }

        for (const node of spec.nodes) {
          const at = spot.get(node);
          if (!at) continue;
          layerNodes.appendChild(
            svgEl('circle', {
              cx: at.x,
              cy: at.y,
              r: NODE_R,
              fill: color.bg,
              stroke: node === spec.source ? color.text : color.textMuted,
              'stroke-width': node === spec.source ? 2 : 1.4,
            }),
          );
          const letter = label(at.x, at.y, node, fontSizes.sm, color.text, 'middle');
          letter.setAttribute('dy', '0.34em');
          letter.setAttribute('font-weight', '600');
          layerNodes.appendChild(letter);
        }

        buildTracks(spec.nodes);
        for (const entry of spec.entries) {
          current.set(entry.node, entry.value);
          const token = tokens.get(entry.node);
          if (!token) continue;
          token.value.textContent = entry.value === null ? INFINITY_MARK : signed(entry.value);
          moveToken(entry.node, yFor(entry.value));
          paintToken(entry.node, 'idle');
        }
      },

      async applyRound(spec: RoundSpec): Promise<void> {
        roundText.textContent = tr('label.round', 'Round {n}', { n: spec.round });
        roundText.setAttribute('fill', spec.beyond ? color.danger : color.textMuted);

        unlitAll();
        for (const key of spec.relaxed) {
          litEdges.add(key);
          paintEdge(key, 'lit');
        }

        type Move = { node: string; from: number; to: number; entry: Entry };
        const moves: Move[] = [];
        for (const entry of spec.entries) {
          const was = current.get(entry.node) ?? null;
          if (was === entry.value) continue;
          if (was !== null) dropTick(entry.node, yFor(was));
          moves.push({ node: entry.node, from: yFor(was), to: yFor(entry.value), entry });
        }

        if (moves.length === 0) {
          for (const entry of spec.entries) current.set(entry.node, entry.value);
          lastMovers = [];
          return;
        }

        if (spec.beyond) {
          // 뚫린 바닥만 붉어진다. S 처럼 제자리인 정점의 바닥은 성한 채 남아,
          // 무엇이 무너졌고 무엇이 멀쩡한지가 갈려 보인다.
          for (const move of moves) floors.get(move.node)?.setAttribute('stroke', color.danger);
        }

        const landed = new Set<string>();
        const total = DROP_MS + DROP_STAGGER_MS * (moves.length - 1);
        await tween(total, (elapsed) => {
          moves.forEach((move, i) => {
            const local = Math.max(0, Math.min(1, (elapsed - DROP_STAGGER_MS * i) / DROP_MS));
            moveToken(move.node, move.from + (move.to - move.from) * fallEase(local));
            if (local >= 1 && !landed.has(move.node)) {
              landed.add(move.node);
              const token = tokens.get(move.node);
              if (token) {
                token.value.textContent =
                  move.entry.value === null ? INFINITY_MARK : signed(move.entry.value);
                token.delta.textContent =
                  move.entry.delta === null ? '' : signed(move.entry.delta);
              }
              paintToken(move.node, spec.beyond ? 'broken' : 'moved');
            }
          });
        });

        for (const entry of spec.entries) current.set(entry.node, entry.value);
        lastMovers = moves.map((m) => m.node);
      },

      markFloor(spec: FloorSpec): void {
        for (const entry of spec.entries) {
          const token = tokens.get(entry.node);
          if (!token || entry.value === null) continue;
          const floor = svgEl('line', {
            x1: token.cx - pillW / 2 - 5,
            y1: yFor(entry.value) + PILL_H / 2 + 4,
            x2: token.cx + pillW / 2 + 5,
            y2: yFor(entry.value) + PILL_H / 2 + 4,
            stroke: color.textMuted,
            'stroke-width': 1.6,
            'stroke-dasharray': '4 3',
          });
          layerFloors.appendChild(floor);
          floors.set(entry.node, floor);
        }
      },

      async markKeepsFalling(spec: FallSpec): Promise<void> {
        unlitAll();
        for (const key of spec.cycle) {
          litEdges.add(key);
          paintEdge(key, 'guilty');
        }

        type Arrow = { line: SVGLineElement; head: SVGPolygonElement; cx: number; y0: number };
        const arrows: Arrow[] = [];
        for (const node of lastMovers) {
          const token = tokens.get(node);
          if (!token) continue;
          const y0 = yFor(current.get(node) ?? null) + PILL_H / 2 + 6;
          const line = svgEl('line', {
            x1: token.cx,
            y1: y0,
            x2: token.cx,
            y2: y0,
            stroke: color.danger,
            'stroke-width': 2,
            'stroke-dasharray': '3 3',
          });
          const head = svgEl('polygon', {
            points: `${token.cx},${y0} ${token.cx - 4.5},${y0 - 7} ${token.cx + 4.5},${y0 - 7}`,
            fill: color.danger,
          });
          layerFall.appendChild(line);
          layerFall.appendChild(head);
          arrows.push({ line, head, cx: token.cx, y0 });
        }
        if (arrows.length === 0) return;

        await tween(FALL_MS, (elapsed) => {
          const p = Math.min(1, elapsed / FALL_MS);
          for (const arrow of arrows) {
            const tip = arrow.y0 + (Y_FALL - arrow.y0) * p;
            arrow.line.setAttribute('y2', String(tip));
            arrow.head.setAttribute(
              'points',
              `${arrow.cx},${tip} ${arrow.cx - 4.5},${tip - 7} ${arrow.cx + 4.5},${tip - 7}`,
            );
          }
        });
      },
    };
  },
};
