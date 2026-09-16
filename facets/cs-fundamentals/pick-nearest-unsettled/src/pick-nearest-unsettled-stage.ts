/**
 * pick-nearest-unsettled-stage — 흔들리는 것과 굳은 것.
 *
 * 장면(Scene) 하나를 받아 그 걸음의 화면을 **통째로** 세운다. 걸음마다 부르는
 * 메서드를 두지 않는다 — 그 메서드들이 곧 되돌릴 수 없는 명령이었다 (S-scene).
 *
 * ── 화면이 무엇으로 말하나 (두 어휘를 갈라 둔다)
 *
 *   채움 = **값의 형편**
 *     빈 것        아직 닿지 않았다. ∞ 를 인다.
 *     옅게 물든 것  잠정 거리를 받았다. 더 내려갈 수 있다.
 *     꽉 찬 것      굳었다. 그 위에 **굳은 차례**가 딱지로 선다.
 *
 *   테두리 = **짚음의 표식**
 *     이번 걸음에 짚인 자리와 그때 편 간선만 물든다. 다음 걸음이 오면 비워진다.
 *
 *   두 뜻을 한 칠에 얹으면 읽기가 갈린다 — "굳었다" 와 "이번에 골랐다" 가 같은
 *   채움이 되면 어느 쪽을 말하는지 화면이 정하지 못한다.
 *
 * ── 굳은 차례가 남는다
 *
 * 옮기기 전에는 굳은 차례가 화면 어디에도 없었다. algorithm 이 `order` 를 실어
 * 보냈으나 projector 가 그것을 버렸고, 완주 화면에는 "굳었다" 만 남았다. 굳는
 * **순서**가 곧 이 조각의 주장이라 차례 딱지를 세운다. 그 수는 장면의 굳은 차례
 * 배열에서 나오므로 그림과 결론이 같은 자료를 쓴다.
 *
 * ── 떨림은 걸음 안에서만 돈다
 *
 * 옮기기 전에는 떨림이 mount 부터 끝까지 **쉬지 않고 도는 rAF 루프**였다. 되짚기는
 * `animate: false` 로 오는데 그 루프는 그 뒤에도 화면을 저 혼자 흔든다 — 되짚은
 * 화면이 가만히 있지 못하는 직접 원인이고, "animate 가 거짓이면 프레임을 걸지
 * 않는다" 도 어긴다 (S-scene MUST). 그래서 떨림을 **걸음의 운동 안**으로 옮겼다.
 * 무슨 일이 일어나는 동안 흔들리는 것은 떨고 굳은 것은 한 픽셀도 움직이지 않는다 —
 * 대비가 한 화면 안에서 더 또렷해지고, 멎은 화면은 어느 걸음에서 오든 똑같다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 정점 자리는 캔버스 크기에서 환산하므로
 * 폭을 그대로 채우고, 반지름은 가장 가까운 두 정점 사이에서 역산해 상수는 상한으로만
 * 둔다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  shiftLightness,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  PickNearestUnsettledCaption,
  PickNearestUnsettledReach,
  PickNearestUnsettledScene,
  PickNearestUnsettledSpread,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 272;

/**
 * 정점이 놓이는 띠. 아래는 캡션 한 줄이 앉을 자리를 남기고, 좌우 여백은 굳을 때
 * 접혀 들어오는 조임 고리(반지름 + LOCK_RING_GAP)가 잘리지 않을 만큼 둔다.
 */
const MARGIN_X = 46;
const GRAPH_TOP = 42;
const GRAPH_H = 164;
const CAPTION_Y = H - 18;

/** 반지름 상한. 실제 값은 가장 가까운 두 정점 사이에서 역산한다. */
const NODE_R_MAX = 26;

/** 굳을 때 바깥에서 접혀 들어오는 고리의 시작 여유. */
const LOCK_RING_GAP = 14;

/** 굳은 차례 딱지. 정점의 오른쪽 위 어깨에 앉는다. */
const BADGE_R = 9;
const BADGE_OFF = 0.72;

/** 정점 안 글자의 기준선. */
const ID_DY = -7;
const VALUE_DY = 11;

/** 떨림 진폭(px). 읽기를 방해하지 않으면서 "아직 흔들린다" 가 보이는 크기. */
const QUIVER_AMP = 1.7;
/** 한 걸음 동안 떠는 횟수. 걸음이 길어도 진동수는 그대로 보이게 잡았다. */
const QUIVER_TURNS = 4;

const SEED_MS = 300;
const HARDEN_MS = 460;
const TRAVEL_MS = 380;
const REBOUND_MS = 260;
const ABSORB_MS = 220;
const STAGGER_MS = 70;

/** 수가 갈릴 때 옛 수가 빠져 나가는 거리와 새 수가 올라오는 거리. */
const GHOST_RISE = 13;
const VALUE_DROP = 14;

const TAU = Math.PI * 2;

/** 도형에 새겨지는 표식 — 번역 대상이 아니다 (C10 판정 3번, 기호 표기). */
const INFINITY_GLYPH = '∞';

type Pt = { x: number; y: number };

/**
 * 정점의 자리. 캔버스 폭·높이에 대한 비율이며, 환산은 `ensureLayout` 이 한다.
 *
 * 선언(`initialData`)이 아니라 여기 있는 까닭: 어디에 놓을지는 값이 아니라 **그림의
 * 결정**이고, 캔버스 비율이 바뀌면 뜻이 달라지는데 선언에 박힌 수는 그것을 따라오지
 * 못한다 (S-piece). 선언이 주는 것은 구조 — 정점 · 간선 · 무게 · 출발점뿐이다.
 *
 * 간선 여섯이 서로 넘지 않도록 고른 자리다. 규칙으로 셈하지 않고 손으로 고른 것은
 * 이 그래프가 링도 나무도 아니라 규칙이 낼 배치가 마땅치 않기 때문이다.
 */
const PLACE: Record<string, { x: number; y: number }> = {
  S: { x: 0.0, y: 0.52 },
  A: { x: 0.28, y: 0.06 },
  B: { x: 0.3, y: 0.96 },
  C: { x: 0.64, y: 0.52 },
  D: { x: 1.0, y: 0.12 },
};

/** 표에 없는 정점은 가운데 줄에 고르게 편다 — 데이터가 바뀌어도 겹쳐 죽지 않게. */
function placeOf(id: string, index: number, total: number): { x: number; y: number } {
  return PLACE[id] ?? { x: total <= 1 ? 0.5 : index / (total - 1), y: 0.5 };
}

/**
 * 정점 하나의 DOM 손잡이.
 *
 * 뜻과 수치는 하나도 얹지 않는다 — 형편도 인 수도 굳은 차례도 전부 장면에 있고,
 * 여기 있는 것은 그것을 그린 결과물의 손잡이뿐이다.
 */
type NodeShape = {
  /** 떨림이 얹히는 바깥 껍데기. */
  group: SVGGElement;
  /** 굳을 때 한 번 부푸는 안쪽. */
  inner: SVGGElement;
  idText: SVGTextElement;
  valueText: SVGTextElement;
  /** 굳은 채움. 굳지 않은 정점에는 없다. */
  ink: SVGCircleElement | null;
  /** 굳은 차례 딱지. 굳지 않은 정점에는 없다. */
  badge: SVGGElement | null;
};

/** 수 하나가 간선을 타고 이웃까지 가는 운동. 걸음 안에서만 산다. */
type Flight = {
  reach: PickNearestUnsettledReach;
  /** 떠나는 자리 · 닿는 자리 · 이웃의 복판. */
  start: Pt;
  hit: Pt;
  center: Pt;
  /** 떠나는 쪽에서 닿는 쪽으로의 단위 방향. */
  toward: Pt;
  /** 한 시계 안에서 이 운동이 떠나는 시각과 닿은 뒤 걸리는 시간. */
  delay: number;
  landMs: number;
  pill: SVGGElement;
  /** 받는 이웃이면 옛 수의 유령이 선다. */
  shape: NodeShape | null;
  ghost: SVGTextElement | null;
  /** 굳은 이웃에 부딪힌 자국. 정적 그리기가 세워 둔 것을 뒤로 물린다. */
  mark: SVGLineElement | null;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const pickNearestUnsettledStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    // 장면 방식에서는 문안을 여기서 만든다. 저작자 오버라이드는 이 통로로만 온다 (C10).
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    /**
     * 잠정 거리를 인 정점의 채움. 강조색을 테마 반대쪽으로 밀어 옅은 타일을 만든다 —
     * 밝은 바탕에서는 밝게, 어두운 바탕에서는 어둡게 밀어야 그 위의 글자가 읽힌다
     * (design-tokens 결정 트리 5 — 한 main 색의 밝기 단계).
     */
    const looseFill = shiftLightness(colors.itemComparing, params.theme === 'dark' ? -0.3 : 0.22);

    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가 먼저 붙여 둔 이 캔버스가
    // 떨어져 나가고 화면이 통째로 빈다 (S-view).
    svg.textContent = '';

    let destroyed = false;
    const frames = new Set<number>();

    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await ctx.emit`
     * 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과 SVG 트리가 통째로
     * 붙들린다 (S-piece).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 정점과 간선을 매번 새로 짓지만, 깨어난 옛 운동은 손잡이를
     * **맵에서 다시 꺼내므로** 새로 지어진 요소를 잡는다. 그래서 세대를 본다.
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너는 장면 조각에서 그 둘을
     * 부르지 않는다 (S-scene).
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
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(durationMs: number, draw: (e: number) => void): Promise<void> {
      const my = gen;
      const paint = (e: number): void => {
        if (alive(my)) draw(e);
      };
      return new Promise<void>((resolve) => {
        if (destroyed || durationMs <= 0) {
          paint(1);
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
          const raw = Math.min(1, (Date.now() - started) / durationMs);
          paint(raw);
          if (raw >= 1) {
            finish();
            return;
          }
          id = nextFrame(tick);
          frames.add(id);
        };
        paint(0);
        id = nextFrame(tick);
        frames.add(id);
      });
    }

    // ── 뼈대. mount 에서 한 번 세우고 안쪽만 갈아 끼운다 ────────────────────
    const root = el('g');
    const edgeLayer = el('g');
    const nodeLayer = el('g');
    const markLayer = el('g');
    const fxLayer = el('g');
    const captionText = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    root.appendChild(edgeLayer);
    root.appendChild(nodeLayer);
    root.appendChild(markLayer);
    root.appendChild(fxLayer);
    root.appendChild(captionText);
    svg.appendChild(root);

    // ── 지금 세워 둔 그림. 전부 `drawStatic` 이 그 장면에서 다시 만든다 ─────
    let layoutKey: string | null = null;
    const spot = new Map<string, Pt>();
    let radius = NODE_R_MAX;
    const nodeOf = new Map<string, NodeShape>();
    const markOf = new Map<string, SVGLineElement>();

    // ── 자리 셈. 그리면서 재면 순회 순서가 곧 숨은 상태가 된다 ──────────────
    function ensureLayout(scene: PickNearestUnsettledScene): void {
      const key = scene.nodes.join('|');
      if (key === layoutKey) return;
      layoutKey = key;
      spot.clear();

      const spanX = W - MARGIN_X * 2;
      scene.nodes.forEach((id, i) => {
        const p = placeOf(id, i, scene.nodes.length);
        spot.set(id, {
          x: Math.round(MARGIN_X + p.x * spanX),
          y: Math.round(GRAPH_TOP + p.y * GRAPH_H),
        });
      });

      // 반지름은 가장 가까운 두 정점에서 역산한다. 상수는 상한일 뿐이라 캔버스가
      // 넓어지면 그림도 함께 커진다 (S-piece "그 폭을 채운다").
      let closest = Number.POSITIVE_INFINITY;
      for (let i = 0; i < scene.nodes.length; i += 1) {
        for (let j = i + 1; j < scene.nodes.length; j += 1) {
          const a = spot.get(scene.nodes[i]!);
          const b = spot.get(scene.nodes[j]!);
          if (!a || !b) continue;
          closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      radius = Number.isFinite(closest)
        ? Math.max(16, Math.min(NODE_R_MAX, Math.floor(closest / 2) - 8))
        : NODE_R_MAX;
    }

    /** 딱지가 앉는 어깨. 굳은 차례가 정점을 가리지 않는 자리다. */
    function badgeSpot(c: Pt): Pt {
      return { x: c.x + radius * BADGE_OFF, y: c.y - radius * BADGE_OFF };
    }

    /** 이번 걸음에 이 간선으로 폈나. 테두리가 말하는 것은 이것뿐이다. */
    function spreadUses(scene: PickNearestUnsettledScene, a: string, b: string): boolean {
      const spread = scene.spread;
      if (!spread) return false;
      if (spread.from === a) return spread.reaches.some((r) => r.to === b);
      if (spread.from === b) return spread.reaches.some((r) => r.to === a);
      return false;
    }

    /** 이번 걸음에 짚인 정점인가. 굳음·잠정은 채움이 말하므로 여기 섞지 않는다. */
    function touched(scene: PickNearestUnsettledScene, id: string): boolean {
      if (scene.spread?.reaches.some((r) => r.to === id) === true) return true;
      const step = scene.step;
      if (!step) return false;
      return (step.kind === 'seed' || step.kind === 'harden') && step.node === id;
    }

    /** 수가 건너가는 길. 떠나는 자리와 닿는 자리는 원의 테두리 바로 바깥이다. */
    function reachGeom(
      from: string,
      to: string,
    ): { start: Pt; hit: Pt; center: Pt; toward: Pt } | null {
      const a = spot.get(from);
      const b = spot.get(to);
      if (!a || !b) return null;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const toward = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      return {
        start: { x: a.x + toward.x * (radius + 3), y: a.y + toward.y * (radius + 3) },
        hit: { x: b.x - toward.x * (radius + 4), y: b.y - toward.y * (radius + 4) },
        center: { x: b.x, y: b.y },
        toward,
      };
    }

    // ── 정적 그리기. 그 장면의 화면을 빠짐없이 통째로 세운다 ────────────────
    function drawEdges(scene: PickNearestUnsettledScene): void {
      edgeLayer.textContent = '';
      for (const edge of scene.edges) {
        const a = spot.get(edge.from);
        const b = spot.get(edge.to);
        if (!a || !b) continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const lit = spreadUses(scene, edge.from, edge.to);
        edgeLayer.appendChild(
          el('line', {
            x1: a.x + ux * radius,
            y1: a.y + uy * radius,
            x2: b.x - ux * radius,
            y2: b.y - uy * radius,
            stroke: lit ? colors.itemComparing : colors.border,
            'stroke-width': lit ? 2.4 : 1.6,
            'stroke-linecap': 'round',
          }),
        );

        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        edgeLayer.appendChild(
          el('rect', { x: mx - 10, y: my - 8, width: 20, height: 16, rx: 4, fill: colors.bg }),
        );
        const weight = el('text', {
          x: mx,
          y: my + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        weight.textContent = String(edge.weight);
        edgeLayer.appendChild(weight);
      }
    }

    /**
     * 굳은 이웃에 부딪힌 자국.
     *
     * 걸음 안에서만 물들였다 지우던 것을 장면으로 올렸다 — 되짚어 그 걸음에 서면
     * "닿았으나 꿈쩍하지 않았다" 가 그대로 보여야 한다.
     */
    function drawMarks(scene: PickNearestUnsettledScene): void {
      markLayer.textContent = '';
      markOf.clear();
      const spread = scene.spread;
      if (!spread) return;
      for (const reach of spread.reaches) {
        if (reach.outcome !== 'blocked') continue;
        const geom = reachGeom(spread.from, reach.to);
        if (!geom) continue;
        const { hit, toward } = geom;
        const bar = el('line', {
          x1: hit.x - toward.y * 11,
          y1: hit.y + toward.x * 11,
          x2: hit.x + toward.y * 11,
          y2: hit.y - toward.x * 11,
          stroke: colors.text,
          'stroke-width': 2.4,
          'stroke-linecap': 'round',
        });
        markLayer.appendChild(bar);
        markOf.set(reach.to, bar);
      }
    }

    function drawNodes(scene: PickNearestUnsettledScene): void {
      nodeLayer.textContent = '';
      nodeOf.clear();
      for (const id of scene.nodes) {
        const c = spot.get(id);
        if (!c) continue;
        const rank = scene.settled.indexOf(id);
        const stone = rank >= 0;
        const held = scene.dist[id];
        const has = typeof held === 'number';
        const probed = touched(scene, id);

        const group = el('g');
        const inner = el('g');
        // 채움 — 값의 형편. 테두리 — 이번 걸음에 짚였나.
        inner.appendChild(
          el('circle', {
            cx: c.x,
            cy: c.y,
            r: radius,
            fill: has ? looseFill : colors.bg,
            stroke: probed ? colors.itemComparing : colors.border,
            'stroke-width': probed ? 2.6 : 1.4,
          }),
        );
        const ink = stone
          ? el('circle', { cx: c.x, cy: c.y, r: radius, fill: colors.itemSorted })
          : null;
        if (ink) inner.appendChild(ink);

        const idText = el('text', {
          x: c.x,
          y: c.y + ID_DY,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: stone ? colors.textInverse : colors.textMuted,
        });
        idText.textContent = id;
        const valueText = el('text', {
          x: c.x,
          y: c.y + VALUE_DY,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': '600',
          fill: stone ? colors.textInverse : has ? colors.text : colors.textMuted,
        });
        valueText.textContent = has ? String(held) : INFINITY_GLYPH;
        inner.appendChild(idText);
        inner.appendChild(valueText);
        group.appendChild(inner);

        // 굳은 차례. 이 딱지가 있어야 완주 화면이 "어느 순서로 굳었나" 를 말한다.
        let badge: SVGGElement | null = null;
        if (stone) {
          const b = badgeSpot(c);
          badge = el('g');
          badge.appendChild(el('circle', { cx: b.x, cy: b.y, r: BADGE_R, fill: colors.accent }));
          const rankText = el('text', {
            x: b.x,
            y: b.y + 3.5,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'font-weight': '600',
            fill: colors.stateInk,
          });
          rankText.textContent = String(rank + 1);
          badge.appendChild(rankText);
          group.appendChild(badge);
        }

        nodeLayer.appendChild(group);
        nodeOf.set(id, { group, inner, idText, valueText, ink, badge });
      }
    }

    function captionTextOf(caption: PickNearestUnsettledCaption): string {
      switch (caption.kind) {
        case 'start':
          return tr('caption.start', 'Nothing has hardened yet.');
        case 'seed':
          return tr('caption.seed', 'Start at {node} with 0.', { node: caption.node });
        case 'harden':
          return tr(
            'caption.harden',
            '{node} holds the smallest, {value} — it can drop no further.',
            { node: caption.node, value: caption.value },
          );
        case 'spreadBoth':
          return tr('caption.spreadBoth', 'The hardened repel it; the loose take it and drop.');
        case 'spreadReach':
          return tr('caption.spreadReach', 'Numbers cross from {node} to its neighbours.', {
            node: caption.node,
          });
        case 'spreadBlocked':
          return tr('caption.spreadBlocked', 'It hits stone — nothing budges.');
        case 'spreadNone':
          return tr('caption.spreadNone', 'It reaches them, but no number changes.');
        case 'done':
          return tr('caption.done', 'All hardened. Nothing is loose.');
      }
    }

    function drawStatic(scene: PickNearestUnsettledScene): void {
      ensureLayout(scene);
      drawEdges(scene);
      drawNodes(scene);
      drawMarks(scene);
      // 운동 중에만 사는 것들. 자식을 비워도 레이어 자신의 속성은 남으므로 함께 거둔다.
      fxLayer.textContent = '';
      fxLayer.removeAttribute('opacity');
      // 캡션은 재건 밖에 있는 고정 자리라 매번 명시로 쓴다.
      captionText.textContent = captionTextOf(scene.caption);
    }

    // ── 운동. 걸음 안에서만 돈다 ────────────────────────────────────────────

    /**
     * 흔들리는 것들을 떨게 한다. 굳은 것과 아직 닿지 않은 것은 제자리에 둔다 —
     * 그 정지가 이 조각의 절반이다.
     *
     * 진폭이 `e` 로만 정해지므로 벽시계를 타지 않는다. 걸음의 처음과 끝에서 0 이라
     * 멎은 화면은 어느 걸음에서 오든 똑같다.
     */
    function quiver(scene: PickNearestUnsettledScene, e: number): void {
      const fade = Math.sin(Math.max(0, Math.min(1, e)) * Math.PI);
      scene.nodes.forEach((id, i) => {
        const shape = nodeOf.get(id);
        if (!shape) return;
        const loose = typeof scene.dist[id] === 'number' && !scene.settled.includes(id);
        if (!loose || fade < 1e-4) {
          shape.group.removeAttribute('transform');
          return;
        }
        const phase = i * 1.9;
        const amp = QUIVER_AMP * fade;
        const dx = amp * Math.sin(e * QUIVER_TURNS * TAU + phase);
        const dy = amp * Math.cos(e * QUIVER_TURNS * TAU * 1.29 + phase * 1.7);
        shape.group.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
      });
    }

    /** 갈릴 옛 수의 유령. 계기값은 장면이 말한다 — 화면을 도로 읽지 않는다. */
    function ghostValue(shape: NodeShape, c: Pt, was: number | null): SVGTextElement {
      const ghost = el('text', {
        x: c.x,
        y: c.y + VALUE_DY,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': '600',
        fill: was === null ? colors.textMuted : colors.text,
      });
      ghost.textContent = was === null ? INFINITY_GLYPH : String(was);
      shape.inner.appendChild(ghost);
      return ghost;
    }

    /**
     * 이고 있던 수가 다른 수로 갈린다 — 옛 수는 위로 빠지고 새 수는 아래에서 올라온다.
     *
     * 끝 자리는 정적 그리기가 이미 세웠으므로, 운동은 **아직 오지 않은 만큼을 뒤로
     * 물리는** 꼴이다 (`q = 0` 이 갈리기 전 그림).
     */
    function swapDraw(shape: NodeShape, ghost: SVGTextElement, q: number): void {
      ghost.setAttribute('transform', `translate(0 ${(-GHOST_RISE * q).toFixed(2)})`);
      ghost.setAttribute('opacity', (1 - q).toFixed(3));
      shape.valueText.setAttribute('transform', `translate(0 ${(VALUE_DROP * (1 - q)).toFixed(2)})`);
      shape.valueText.setAttribute('opacity', q.toFixed(3));
    }

    /** 출발점이 0 을 인다. ∞ 가 빠지고 그 자리에 0 이 올라온다. */
    function runSeed(scene: PickNearestUnsettledScene, node: string): Promise<void> {
      const shape = nodeOf.get(node);
      const c = spot.get(node);
      if (!shape || !c) return Promise.resolve();
      const ghost = ghostValue(shape, c, null);
      return animate(SEED_MS, (e) => {
        swapDraw(shape, ghost, easeOut(e));
        quiver(scene, e);
      });
    }

    /** 굳는다 — 조임 고리가 바깥에서 접혀 들어오고, 그와 함께 떨림이 멎는다. */
    function runHarden(scene: PickNearestUnsettledScene, node: string): Promise<void> {
      const shape = nodeOf.get(node);
      const c = spot.get(node);
      if (!shape || !c) return Promise.resolve();
      const ring = el('circle', {
        cx: c.x,
        cy: c.y,
        r: radius + LOCK_RING_GAP,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 3,
      });
      fxLayer.appendChild(ring);
      const b = badgeSpot(c);

      return animate(HARDEN_MS, (e) => {
        const q = easeOut(e);
        ring.setAttribute('r', (radius + LOCK_RING_GAP * (1 - q)).toFixed(2));
        ring.setAttribute('opacity', (1 - q * q).toFixed(3));
        // 굳은 채움과 차례 딱지를 고리가 닫히는 만큼 들여놓는다.
        shape.ink?.setAttribute('opacity', q.toFixed(3));
        const stony = q > 0.5;
        shape.idText.setAttribute('fill', stony ? colors.textInverse : colors.textMuted);
        shape.valueText.setAttribute('fill', stony ? colors.textInverse : colors.text);
        shape.badge?.setAttribute(
          'transform',
          `translate(${b.x} ${b.y}) scale(${q.toFixed(4)}) translate(${-b.x} ${-b.y})`,
        );
        const pulse = 1 + 0.07 * Math.sin(e * Math.PI);
        shape.inner.setAttribute(
          'transform',
          `translate(${c.x} ${c.y}) scale(${pulse.toFixed(4)}) translate(${-c.x} ${-c.y})`,
        );
        quiver(scene, e);
      });
    }

    /** 알약 하나. 내미는 수를 싣고 간선을 탄다. */
    function makePill(offered: number, at: Pt): SVGGElement {
      const pill = el('g', { transform: `translate(${at.x} ${at.y})`, opacity: 0 });
      pill.appendChild(
        el('rect', {
          x: -15,
          y: -11,
          width: 30,
          height: 22,
          rx: 11,
          fill: colors.bg,
          stroke: colors.itemComparing,
          'stroke-width': 1.6,
        }),
      );
      const text = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      text.textContent = String(offered);
      pill.appendChild(text);
      fxLayer.appendChild(pill);
      return pill;
    }

    /** 한 운동의 지금 모습. 시계는 하나고 늦음은 이 안에서 셈한다. */
    function drawFlight(f: Flight, now: number): void {
      const u = now - f.delay;
      const blocked = f.reach.outcome === 'blocked';

      if (u <= 0) {
        f.pill.setAttribute('transform', `translate(${f.start.x} ${f.start.y})`);
        f.pill.setAttribute('opacity', '0');
        if (f.shape && f.ghost) swapDraw(f.shape, f.ghost, 0);
        if (f.mark) f.mark.setAttribute('opacity', '0');
        return;
      }

      if (u < TRAVEL_MS) {
        const q = easeInOut(u / TRAVEL_MS);
        f.pill.setAttribute('opacity', '1');
        f.pill.setAttribute(
          'transform',
          `translate(${lerp(f.start.x, f.hit.x, q).toFixed(2)} ${lerp(f.start.y, f.hit.y, q).toFixed(2)})`,
        );
        if (f.shape && f.ghost) swapDraw(f.shape, f.ghost, 0);
        if (f.mark) f.mark.setAttribute('opacity', '0');
        return;
      }

      const q = easeOut(Math.min(1, (u - TRAVEL_MS) / f.landMs));

      if (f.reach.outcome === 'lower') {
        // 받아들인다 — 알약이 정점 안으로 빨려 들며 그 자리에서 수가 갈린다.
        f.pill.setAttribute(
          'transform',
          `translate(${lerp(f.hit.x, f.center.x, q).toFixed(2)} ${lerp(f.hit.y, f.center.y, q).toFixed(2)}) scale(${(1 - 0.6 * q).toFixed(3)})`,
        );
        f.pill.setAttribute('opacity', (1 - q).toFixed(3));
        if (f.shape && f.ghost) swapDraw(f.shape, f.ghost, q);
        return;
      }

      // 튕겨 나온다. 굳은 이웃이면 부딪힌 자리에 자국이 서지만, 그 정점은 한 픽셀도
      // 움직이지 않는다 — 이 정지가 조각이 하려는 말이다.
      const back = blocked ? 30 : 14;
      const drop = blocked ? 6 : 12;
      f.pill.setAttribute(
        'transform',
        `translate(${(f.hit.x - f.toward.x * back * q).toFixed(2)} ${(f.hit.y - f.toward.y * back * q + drop * q * q).toFixed(2)})`,
      );
      f.pill.setAttribute('opacity', (1 - q).toFixed(3));
      if (f.mark) {
        f.mark.setAttribute('opacity', '1');
        f.mark.setAttribute('stroke-width', (2.4 + 1.6 * (1 - q)).toFixed(2));
      }
    }

    /**
     * 굳은 자리에서 이웃들로 수가 한꺼번에 건너간다.
     *
     * **시계는 하나다.** 여러 간선이 한 뜻으로 함께 퍼지는 걸음이라 간선마다 따로
     * 돌리면 lockstep 이 우연히 맞는 꼴이 되고, 하나를 흘려보낼 여지도 생긴다.
     * 늦게 떠나는 것은 한 프레임 안에서 자기 시각을 셈한다.
     */
    function runSpread(
      scene: PickNearestUnsettledScene,
      spread: PickNearestUnsettledSpread,
    ): Promise<void> {
      const flights: Flight[] = [];
      let total = 0;

      spread.reaches.forEach((reach, i) => {
        const geom = reachGeom(spread.from, reach.to);
        if (!geom) return;
        const delay = i * STAGGER_MS;
        const landMs = reach.outcome === 'lower' ? ABSORB_MS : REBOUND_MS;
        total = Math.max(total, delay + TRAVEL_MS + landMs);
        const shape = nodeOf.get(reach.to) ?? null;
        const ghost =
          reach.outcome === 'lower' && shape ? ghostValue(shape, geom.center, reach.was) : null;
        flights.push({
          reach,
          start: geom.start,
          hit: geom.hit,
          center: geom.center,
          toward: geom.toward,
          delay,
          landMs,
          pill: makePill(reach.offered, geom.start),
          shape,
          ghost,
          mark: markOf.get(reach.to) ?? null,
        });
      });

      if (flights.length === 0) return Promise.resolve();
      return animate(total, (e) => {
        const now = e * total;
        for (const f of flights) drawFlight(f, now);
        quiver(scene, e);
      });
    }

    async function render(
      next: PickNearestUnsettledScene,
      /** 이 조각은 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: PickNearestUnsettledScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);

      drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'seed':
          await runSeed(next, step.node);
          break;
        case 'harden':
          await runHarden(next, step.node);
          break;
        case 'spread':
          if (next.spread) await runSpread(next, next.spread);
          break;
        case 'done':
          // 이름을 붙이는 걸음이라 흐를 것이 없다. 캡션은 정적 그리기가 이미 세웠다.
          break;
      }

      if (!alive(my)) return;
      // 운동이 남긴 자취를 거두고 그 장면을 통째로 다시 세운다. 속성을 하나씩
      // 되돌리는 것보다 안전하고, 보간값의 끝자리가 문자열을 가르지도 않는다.
      // 그 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다.
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
