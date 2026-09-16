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
 * 왼쪽은 그래프다. 바퀴마다 값을 낮춘 간선이 켜지므로, 오른쪽에서 떨어지는 것이
 * 왼쪽의 어느 고리 때문인지 눈으로 잇는다. 마지막 걸음에서 그 고리가 붉게 남는다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`showGraph()` · `applyRound()` · `markFloor()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의
 * 화면 전체**를 세운다 (S-scene).
 *
 * 특히 이 조각에서는 그것이 주장 자체를 지킨다. 눈금 사다리와 뚫린 바닥은 명령형
 * 코드가 DOM 에 **쌓아 두기만** 하던 것이라, 되짚으면 통째로 사라졌다. 이제
 * `drawStatic` 이 바퀴 이력에서 매번 다시 세우므로 어느 걸음에서 보든 같다.
 *
 * ## 채움과 테두리를 갈라 둔다
 *
 * 한 알갱이가 두 가지를 말해야 한다 — 값이 지금 어떤 형편인가, 그리고 이번 바퀴에
 * 움직였는가. 한 칠에 둘을 실으면 되짚을 때 어느 쪽도 복원되지 않는다.
 *
 * - **채움 = 값의 형편** — 아직 ∞ 다(빈 알약) / 정해졌다 / 제 바닥을 뚫고 내려갔다.
 * - **테두리 = 짚음의 표식** — 이번 바퀴에 값이 내려간 정점만 굵게 두른다.
 *
 * 색은 전부 design-tokens 경유다 (S-view). 화면 문자는 전부 `params.t` 로 조회한다
 * (C10) — 장면은 무엇을 말할지와 그 인자만 쥔다.
 */

import { PIECE_CANVAS_W, fontSizes, fonts, getColors, makeTranslator } from '@ffacet/core/runtime';
import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  beyondBound,
  brokeFloor,
  dropOf,
  floorValues,
  guiltyEdges,
  historyOf,
  moversOf,
  valuesNow,
} from './scene.js';
import type {
  OneMoreRoundDropsCaption,
  OneMoreRoundDropsScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 빼기 기호. 하이픈이 아니라 U+2212 — 무게와 값의 부호는 수식 표기다 (C10 표식). */
const MINUS = '−';
const INFINITY_MARK = '∞';

const W = PIECE_CANVAS_W;
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
/**
 * 바닥 파선이 제 가운데에서 좌우로 그어지는 시간.
 *
 * 이 걸음은 흐를 것이 없어 벽시계가 `stepMs` 그대로였다. "여기가 바닥이어야 한다"
 * 와 같은 동사(**긋는다**)로 얇은 운동을 얹는다 (S-piece 의 걸음 벽시계).
 */
const FLOOR_MS = 240;

type Attrs = Record<string, string | number>;

/** 알갱이 하나의 DOM. `drawStatic` 이 매번 새로 짓고 이 배열을 갈아 끼운다. */
type TokenShape = {
  group: SVGGElement;
  value: SVGTextElement;
  delta: SVGTextElement;
};

/** 바닥 파선 하나. 좌우 끝을 쥐고 있어야 가운데에서 펴는 운동을 그린다. */
type FloorShape = { line: SVGLineElement; x1: number; x2: number };

/** 궤도 아래로 뻗는 화살 하나. */
type ArrowShape = { line: SVGLineElement; head: SVGPolygonElement; cx: number; y0: number };

/** 그 장면의 자리 셈. 값과 정점 수에서 나오므로 장면에 담지 않는다 (S-piece). */
type Layout = {
  pillW: number;
  cx: (index: number) => number;
  yFor: (value: number | null) => number;
};

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function signed(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n);
}

function clamp01(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** 떨어지는 것이므로 가속한다 — 등속으로 옮기면 미끄러지는 것으로 읽힌다. */
function fallEase(p: number): number {
  return p * p;
}

/** 그어지는 것은 부드럽게 선다. */
function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
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

    const graphW = Math.round((W - PAD * 2) * GRAPH_RATIO);
    const graphX0 = PAD;
    const panelX0 = graphX0 + graphW + PANEL_GAP;
    const panelX1 = W - PAD;

    // ── 걸어 둔 것과 기다리는 것 ─────────────────────────────────────────────
    let destroyed = false;
    // rAF 가 없는 자리에서는 `nextFrame` 이 setTimeout 으로 떨어지지만 그 id 도
    // 여기에 담긴다 — 거두는 길이 하나여야 빠뜨리지 않는다.
    const frames = new Set<number>();

    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await ctx.emit`
     * 이 영영 돌아오지 않아 unmount 된 뒤에도 알고리즘과 SVG 가 붙들린다 (S-piece).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * `drawStatic` 이 알갱이를 **매번 새로 짓고 `tokens` 를 갈아 끼우므로**, 살아남은
     * 옛 프레임이 그 배열을 프레임마다 다시 읽으면 새 손잡이를 타고 살아 있는 화면에
     * 쓴다. 노드가 새것이어도 그것을 가리키는 변수는 같은 자리다 (S-scene).
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    function nextFrame(cb: () => void): number {
      return typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => cb())
        : (setTimeout(cb, 16) as unknown as number);
    }

    function dropFrame(id: number): void {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    }

    /**
     * 한 마디를 프레임으로 흐르게 한다. `draw` 는 지나간 밀리초를 받는다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(totalMs: number, draw: (elapsed: number) => void): Promise<void> {
      const my = gen;
      const paint = (e: number): void => {
        if (alive(my)) draw(e);
      };
      return new Promise<void>((resolve) => {
        if (destroyed || totalMs <= 0) {
          paint(totalMs);
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const elapsed = Date.now() - started;
          if (elapsed >= totalMs) {
            paint(totalMs);
            finish();
            return;
          }
          paint(elapsed);
          id = nextFrame(tick);
          frames.add(id);
        };
        paint(0);
        id = nextFrame(tick);
        frames.add(id);
      });
    }

    // ── 뼈대. mount 에서 한 번 세우고 안쪽만 갈아 끼운다 ─────────────────────
    const root = svgEl('g');
    const layerEdges = svgEl('g');
    const layerNodes = svgEl('g');
    const layerTracks = svgEl('g');
    const layerTicks = svgEl('g');
    const layerFloors = svgEl('g');
    const layerFall = svgEl('g');
    const layerTokens = svgEl('g');
    const rebuilt = [
      layerEdges,
      layerNodes,
      layerTracks,
      layerTicks,
      layerFloors,
      layerFall,
      layerTokens,
    ];
    for (const layer of rebuilt) root.appendChild(layer);

    const roundText = svgEl('text', {
      x: panelX0,
      y: Y_ROUND,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      'font-weight': '600',
    });
    root.appendChild(roundText);

    const captionText = svgEl('text', {
      x: W / 2,
      y: Y_CAP,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    root.appendChild(captionText);

    canvas.appendChild(root);

    // ── 정적 그리기가 갈아 끼우는 손잡이 ─────────────────────────────────────
    let layout: Layout = { pillW: PILL_W_MAX, cx: () => 0, yFor: () => Y_INF };
    let tokens: TokenShape[] = [];
    let floorLines: FloorShape[] = [];
    let arrows: ArrowShape[] = [];

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

    function layoutOf(scene: OneMoreRoundDropsScene): Layout {
      const span = Math.max(1, scene.vMax - scene.vMin);
      const unit = Math.min(UNIT_MAX, (Y_BOT - Y_TOP) / span);
      const colSpan = (panelX1 - panelX0) / Math.max(1, scene.nodes.length);
      return {
        pillW: Math.min(PILL_W_MAX, Math.floor(colSpan - 22)),
        cx: (index) => panelX0 + colSpan * (index + 0.5),
        yFor: (value) => (value === null ? Y_INF : Y_TOP + (scene.vMax - value) * unit),
      };
    }

    // ── 왼쪽 그래프 ──────────────────────────────────────────────────────────
    type Spot = { x: number; y: number };

    function placeNodes(
      nodes: readonly string[],
      source: string,
    ): { spot: Map<string, Spot>; ringCx: number; ringCy: number } {
      const spot = new Map<string, Spot>();
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
      from: Spot,
      to: Spot,
      weight: number,
      state: 'idle' | 'lit' | 'guilty',
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

      const stroke =
        state === 'idle' ? color.textMuted : state === 'lit' ? color.itemActive : color.danger;

      layerEdges.appendChild(
        svgEl('line', {
          x1,
          y1,
          x2,
          y2,
          stroke,
          'stroke-width': state === 'idle' ? 1.6 : 2.6,
          'stroke-linecap': 'round',
        }),
      );
      const hx = 8;
      const hy = 4.4;
      layerEdges.appendChild(
        svgEl('polygon', {
          points: [
            `${x2},${y2}`,
            `${x2 - ux * hx - uy * hy},${y2 - uy * hx + ux * hy}`,
            `${x2 - ux * hx + uy * hy},${y2 - uy * hx - ux * hy}`,
          ].join(' '),
          fill: stroke,
        }),
      );

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
        state === 'idle' ? color.textMuted : stroke,
        'middle',
      );
      weightNode.setAttribute('font-weight', state === 'idle' ? '400' : '700');
      layerEdges.appendChild(weightNode);
    }

    function drawGraph(scene: OneMoreRoundDropsScene): void {
      const { spot, ringCx, ringCy } = placeNodes(scene.nodes, scene.source);

      // 지금 켜져 있는 간선. 마지막 바퀴가 값을 낮춘 것들이고, 끝 걸음에서는 그것이
      // 그대로 음수 고리가 된다 — 두 목록이 같은 자리에서 나온다.
      const hot = new Set(scene.falling ? guiltyEdges(scene) : (scene.rounds[scene.rounds.length - 1]?.relaxed ?? []));

      for (const edge of scene.edges) {
        const from = spot.get(edge.from);
        const to = spot.get(edge.to);
        if (!from || !to) continue;
        const lit = hot.has(`${edge.from}-${edge.to}`);
        drawEdge(from, to, edge.weight, lit ? (scene.falling ? 'guilty' : 'lit') : 'idle', ringCx, ringCy);
      }

      for (const node of scene.nodes) {
        const at = spot.get(node);
        if (!at) continue;
        layerNodes.appendChild(
          svgEl('circle', {
            cx: at.x,
            cy: at.y,
            r: NODE_R,
            fill: color.bg,
            stroke: node === scene.source ? color.text : color.textMuted,
            'stroke-width': node === scene.source ? 2 : 1.4,
          }),
        );
        const letter = label(at.x, at.y, node, fontSizes.sm, color.text, 'middle');
        letter.setAttribute('dy', '0.34em');
        letter.setAttribute('font-weight', '600');
        layerNodes.appendChild(letter);
      }
    }

    // ── 오른쪽 궤도 ──────────────────────────────────────────────────────────
    function place(group: SVGGElement, x: number, y: number): void {
      group.setAttribute('transform', `translate(${x}, ${y})`);
    }

    function drawTracks(scene: OneMoreRoundDropsScene): void {
      scene.nodes.forEach((node, i) => {
        const cx = layout.cx(i);
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
        layerTracks.appendChild(label(cx, Y_HEAD, node, fontSizes.sm, color.textMuted, 'middle'));
      });
    }

    /**
     * 떠난 자리에 남는 눈금. **이 조각의 주장이 사는 자리다.**
     *
     * 바퀴 이력을 처음부터 훑어 값이 바뀐 자리마다 하나씩 긋는다. 옛 화면은 이것을
     * 붙이기만 하고 어느 변수도 쥐지 않아, 되짚으면 사다리가 통째로 사라졌다.
     */
    function drawTicks(scene: OneMoreRoundDropsScene): void {
      const history = historyOf(scene);
      scene.nodes.forEach((_node, i) => {
        for (let k = 0; k + 1 < history.length; k++) {
          const was = history[k][i] ?? null;
          if (was === null || was === (history[k + 1][i] ?? null)) continue;
          const y = layout.yFor(was);
          layerTicks.appendChild(
            svgEl('line', {
              x1: layout.cx(i) - layout.pillW / 2,
              y1: y,
              x2: layout.cx(i) + layout.pillW / 2,
              y2: y,
              stroke: color.textMuted,
              'stroke-width': 1.4,
              opacity: 0.42,
            }),
          );
        }
      });
    }

    function drawFloors(scene: OneMoreRoundDropsScene): void {
      floorLines = [];
      const floor = floorValues(scene);
      if (floor === null) return;
      scene.nodes.forEach((_node, i) => {
        const base = floor[i] ?? null;
        if (base === null) return;
        const x1 = layout.cx(i) - layout.pillW / 2 - 5;
        const x2 = layout.cx(i) + layout.pillW / 2 + 5;
        const y = layout.yFor(base) + PILL_H / 2 + 4;
        // 뚫린 바닥만 붉어진다. 제자리인 정점의 바닥은 성한 채 남아, 무엇이
        // 무너졌고 무엇이 멀쩡한지가 갈려 보인다.
        const line = svgEl('line', {
          x1,
          y1: y,
          x2,
          y2: y,
          stroke: brokeFloor(scene, i) ? color.danger : color.textMuted,
          'stroke-width': 1.6,
          'stroke-dasharray': '4 3',
        });
        layerFloors.appendChild(line);
        floorLines.push({ line, x1, x2 });
      });
    }

    function drawTokens(scene: OneMoreRoundDropsScene): void {
      tokens = [];
      const now = valuesNow(scene);
      const movers = new Set(moversOf(scene, scene.rounds.length));
      const pillW = layout.pillW;

      scene.nodes.forEach((_node, i) => {
        const value = now[i] ?? null;
        const broken = brokeFloor(scene, i);
        // 채움은 값의 형편만 말한다 — 아직 ∞ 다 / 정해졌다 / 제 바닥을 뚫었다.
        const fill = value === null ? color.bg : broken ? color.danger : color.itemDefault;
        // 테두리는 짚음의 표식만 말한다 — 이번 바퀴에 내려간 정점인가.
        const moved = movers.has(i);

        const group = svgEl('g');
        const pill = svgEl('rect', {
          x: -pillW / 2,
          y: -PILL_H / 2,
          width: pillW,
          height: PILL_H,
          rx: 4,
          fill,
          stroke: moved ? color.itemActive : color.border,
          'stroke-width': moved ? 2 : 1,
        });
        const valueText = svgEl('text', {
          x: 0,
          y: 0,
          dy: '0.34em',
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          // 고정 타일 위의 잉크는 테마를 따라 뒤집지 않는다 (design-tokens 의 표).
          fill: broken ? color.stateInk : color.text,
        });
        valueText.textContent = value === null ? INFINITY_MARK : signed(value);
        const deltaText = svgEl('text', {
          x: pillW / 2 + 5,
          y: 0,
          dy: '0.34em',
          'text-anchor': 'start',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: broken ? color.danger : color.textMuted,
        });
        const drop = dropOf(scene, i);
        deltaText.textContent = drop === null ? '' : signed(drop);

        group.appendChild(pill);
        group.appendChild(valueText);
        group.appendChild(deltaText);
        place(group, layout.cx(i), layout.yFor(value));
        layerTokens.appendChild(group);
        tokens.push({ group, value: valueText, delta: deltaText });
      });
    }

    function headPoints(cx: number, tip: number): string {
      return `${cx},${tip} ${cx - 4.5},${tip - 7} ${cx + 4.5},${tip - 7}`;
    }

    /**
     * 궤도 아래로 뻗는 화살. **머무는 강조라 정적 그리기가 세운다.**
     *
     * 옛 화면은 마지막 걸음의 명령으로만 그려서, 되짚어 세운 완주 화면에는 "화면
     * 밖으로 이어진다" 가 아예 없었다.
     */
    function drawArrows(scene: OneMoreRoundDropsScene): void {
      arrows = [];
      if (!scene.falling) return;
      const now = valuesNow(scene);
      for (const i of moversOf(scene, scene.rounds.length)) {
        const y0 = layout.yFor(now[i] ?? null) + PILL_H / 2 + 6;
        const cx = layout.cx(i);
        const line = svgEl('line', {
          x1: cx,
          y1: y0,
          x2: cx,
          y2: Y_FALL,
          stroke: color.danger,
          'stroke-width': 2,
          'stroke-dasharray': '3 3',
        });
        const head = svgEl('polygon', { points: headPoints(cx, Y_FALL), fill: color.danger });
        layerFall.appendChild(line);
        layerFall.appendChild(head);
        arrows.push({ line, head, cx, y0 });
      }
    }

    // ── 문안 ────────────────────────────────────────────────────────────────
    function captionTextOf(caption: OneMoreRoundDropsCaption | null): string {
      if (caption === null) return '';
      switch (caption.kind) {
        case 'start':
          return tr('caption.start', 'Only the start is 0. The rest are still unknown.');
        case 'round':
          return tr('caption.round', 'Round {n}: the numbers drop.', { n: caption.n });
        case 'beyond':
          return tr('caption.beyond', 'Round {n}: they fall through the floor.', { n: caption.n });
        case 'floor':
          return tr('caption.floor', 'Round {n} is over. This is where they should stop.', {
            n: caption.n,
          });
        case 'never':
          return tr('caption.never', 'Every round, the same drop. It never stops.');
      }
    }

    // ── 정적 그리기. 그 장면의 화면을 빠짐없이 통째로 세운다 ─────────────────
    function drawStatic(scene: OneMoreRoundDropsScene): void {
      for (const layer of rebuilt) layer.textContent = '';
      tokens = [];
      floorLines = [];
      arrows = [];

      // 재건 밖 요소는 마지막 `drawStatic` 이 안 건드린다. 속성을 매번 명시로 쓴다.
      captionText.textContent = captionTextOf(scene.caption);
      captionText.setAttribute('fill', color.text);
      roundText.textContent =
        scene.rounds.length === 0
          ? ''
          : tr('label.round', 'Round {n}', { n: scene.rounds.length });
      roundText.setAttribute('fill', beyondBound(scene) ? color.danger : color.textMuted);

      if (scene.nodes.length === 0) return;

      layout = layoutOf(scene);
      drawGraph(scene);
      drawTracks(scene);
      drawTicks(scene);
      drawFloors(scene);
      drawTokens(scene);
      drawArrows(scene);
    }

    // ── 걸음. 정적 그리기가 끝 자리에 세워 둔 것을 뒤로 물렸다 놓는다 ────────
    /**
     * 한 바퀴. 값이 내려간 알갱이들이 앞 바퀴 자리에서 새 자리로 떨어진다.
     *
     * **한 바퀴는 한 뜻이라 시계도 하나다** — 간선마다 따로 돌리면 lockstep 이 우연히
     * 맞는 꼴이 되고 하나를 흘려보낼 여지가 생긴다 (프로토콜 3-4 절).
     */
    function fallRound(scene: OneMoreRoundDropsScene): Promise<void> {
      const history = historyOf(scene);
      if (history.length < 2) return Promise.resolve();
      const was = history[history.length - 2];
      const now = history[history.length - 1];

      const moves: { index: number; from: number; to: number; before: number | null }[] = [];
      now.forEach((value, i) => {
        const before = was[i] ?? null;
        if ((value ?? null) === before) return;
        moves.push({
          index: i,
          from: layout.yFor(before),
          to: layout.yFor(value ?? null),
          before,
        });
      });
      if (moves.length === 0) return Promise.resolve();

      // 떨어지기 전의 글자로 되돌린다 — 정적 그리기가 이미 끝 값을 써 두었으므로
      // 그대로 두면 아직 안 내려간 알갱이가 새 값을 달고 있다.
      for (const move of moves) {
        const token = tokens[move.index];
        if (!token) continue;
        token.value.textContent = move.before === null ? INFINITY_MARK : signed(move.before);
        token.delta.textContent = '';
      }

      const total = DROP_MS + DROP_STAGGER_MS * (moves.length - 1);
      const landed = new Set<number>();
      return animate(total, (elapsed) => {
        moves.forEach((move, k) => {
          const token = tokens[move.index];
          if (!token) return;
          const local = clamp01((elapsed - DROP_STAGGER_MS * k) / DROP_MS);
          // 끝에서는 보간값이 아니라 목표값을 그대로 쓴다 (부동소수 끝자리).
          const y = local >= 1 ? move.to : move.from + (move.to - move.from) * fallEase(local);
          place(token.group, layout.cx(move.index), y);
          if (local < 1 || landed.has(move.index)) return;
          landed.add(move.index);
          const value = now[move.index] ?? null;
          token.value.textContent = value === null ? INFINITY_MARK : signed(value);
          const drop = dropOf(scene, move.index);
          token.delta.textContent = drop === null ? '' : signed(drop);
        });
      });
    }

    /** 바닥이 그어진다. 제 가운데에서 좌우로 펴진다. */
    function drawFloorLine(): Promise<void> {
      const lines = floorLines;
      if (lines.length === 0) return Promise.resolve();
      return animate(FLOOR_MS, (elapsed) => {
        const p = ease(clamp01(elapsed / FLOOR_MS));
        for (const floor of lines) {
          const mid = (floor.x1 + floor.x2) / 2;
          if (p >= 1) {
            floor.line.setAttribute('x1', String(floor.x1));
            floor.line.setAttribute('x2', String(floor.x2));
            continue;
          }
          const half = ((floor.x2 - floor.x1) / 2) * p;
          floor.line.setAttribute('x1', String(mid - half));
          floor.line.setAttribute('x2', String(mid + half));
        }
      });
    }

    /** 화살이 알갱이 밑에서 화면 밖을 향해 뻗는다. */
    function stretchArrows(): Promise<void> {
      const list = arrows;
      if (list.length === 0) return Promise.resolve();
      return animate(FALL_MS, (elapsed) => {
        const p = clamp01(elapsed / FALL_MS);
        for (const arrow of list) {
          const tip = p >= 1 ? Y_FALL : arrow.y0 + (Y_FALL - arrow.y0) * p;
          arrow.line.setAttribute('y2', String(tip));
          arrow.head.setAttribute('points', headPoints(arrow.cx, tip));
        }
      });
    }

    async function render(
      next: OneMoreRoundDropsScene,
      /** 출발 그림을 전부 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: OneMoreRoundDropsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);

      drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'graph':
          // 첫 그림은 그대로 선다. 흐를 앞 화면이 없다.
          break;
        case 'round':
          await fallRound(next);
          break;
        case 'floor':
          await drawFloorLine();
          break;
        case 'fall':
          await stretchArrows();
          break;
      }

      if (!alive(my)) return;
      // 운동이 남긴 속성과 보간의 끝자리를 통째로 지운다. 하나씩 거두면 반드시
      // 하나를 빠뜨리고, 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) dropFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
