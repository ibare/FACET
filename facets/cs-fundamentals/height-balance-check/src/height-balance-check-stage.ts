/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 이 조각의 동사는 "셈이 잎에서 위로
 * 올라온다" 인데, 그 view 는 노드 하나에 라벨 하나를 얹을 뿐 자식 자리에서
 * 부모 자리로 값이 이동하는 운동을 표현할 수단이 없다. 유령 자리(없는 자식)를
 * 그려 거기서도 0 이 올라오게 하는 것도 마찬가지다 (원칙 6 의 예외 조건).
 *
 * height-balance-check-stage — 균형 인수가 잎에서 뿌리로 올라오는 것을 그린다.
 *
 * 노드 원 + 간선을 골격으로 두고, 없는 자식 자리는 점선 유령 자리(0)로 표시한다.
 * 한 노드가 settle 되면 좌/우 높이 값이 (실제 자식이 남긴 자리 또는 유령 자리
 * 에서) 실제로 그 노드를 향해 위로 이동해 와서 맞대어 빼지고, 그 차와 자기
 * 높이가 자리에 남는다 — 이동은 위치(transform)가 바뀌는 것이지 opacity 전환이
 * 아니다 (S-piece MUST NOT).
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 밟은 걸음
 * 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고 되짚기가 앞으로 가기와
 * 같은 길로 온다. `init()` · `settleNode()` · `rewind()` 셋이 사라졌다.
 *
 * ── 적힌 자리는 남는 강조다
 *
 * 이 조각의 결론이 "뿌리만 보고는 알 수 없다 — 자리마다 재야 한다" 이므로, **이미
 * 적힌 `h` 와 `Δ` 배지 전부**가 정적 그리기에 들어간다. 옮기기 전에는 그것이
 * `tileLayer` 에 쌓인 자식들로만 남아 있었고, 되돌리는 길이 레이어를 통째로 비우는
 * 것 하나뿐이라 처음 말고는 어느 걸음으로도 갈 수 없었다.
 *
 * ── 화면에 나란히 뜨는 수는 한 출처에서 나온다
 *
 * 유령 자리의 `0`, 올라오는 토큰의 수, 배지의 `h` 와 `Δ` 가 전부 `scene.ts` 의
 * `childHeight` 하나를 지난다. 이 파일은 수를 스스로 세지 않고 payload 에서도 받지
 * 않는다 — 그래서 한 화면 안의 `2` · `0` · `Δ +2` 가 갈릴 수가 없다.
 *
 * 캔버스 세로도 장면이 정한다. `init()` 이 사라졌으므로 나무의 깊이를 매번 다시
 * 재어 `viewBox` 를 세운다.
 */

import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';

import {
  childHeight,
  metricsAt,
  type HeightBalanceCheckScene,
  type HeightBalanceSceneNode,
  type HeightBalanceStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN_X = 30;
const MARGIN_TOP = 30;
const LEVEL_GAP = 88;
const NODE_R = 17;
const GHOST_R = 8;
const GHOST_DX = 34;
const GHOST_DY = 54;
/**
 * 마지막 층 아래로 남기는 자리.
 *
 * 노드 반지름만으로는 모자란다 — 잎 아래에도 유령 자리(없는 자식)가
 * `GHOST_DY` 만큼 내려가 붙고 거기서 높이 0 이 올라오기 때문이다. 그 자리와
 * 배지까지 담아야 한다.
 */
const BOTTOM_PAD = 90;
const RISE_MS = 420;
const MERGE_MS = 180;

/** 이 조각의 나무는 3 층이다. 실제 층수는 장면이 정한다 — 이 값은 첫 프레임의 자리표다. */
const DEFAULT_DEPTH = 2;

function heightFor(maxDepth: number): number {
  return MARGIN_TOP + maxDepth * LEVEL_GAP + NODE_R + BOTTOM_PAD;
}

type Point = { x: number; y: number };

/** 캔버스에서 역산한 마디의 자리. 장면은 좌표를 모른다 (S-piece). */
type Placed = Point & {
  node: HeightBalanceSceneNode;
  depth: number;
};

type Geometry = { at: Map<number, Placed>; maxDepth: number };

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  }
  return el;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * 나무를 캔버스에 앉힌다.
 *
 * 가로는 중위 순회 차례 — 왼쪽 서브트리가 통째로 왼쪽에 서므로 자리 자체가 나무의
 * 모양을 말한다. 세로는 깊이다.
 */
function layoutOf(scene: HeightBalanceCheckScene): Geometry {
  const at = new Map<number, Placed>();
  const byValue = new Map(scene.nodes.map((n) => [n.value, n]));
  const total = Math.max(1, scene.nodes.length);
  const slotW = (PIECE_CANVAS_W - MARGIN_X * 2) / total;
  const rank = { next: 0 };
  let maxDepth = 0;

  const place = (value: number | null, depth: number): void => {
    if (value === null || at.has(value)) return;
    const node = byValue.get(value);
    if (!node) return;
    // 자리를 먼저 잡아 재진입을 막고, 그 뒤에 왼쪽 → 자신 → 오른쪽 차례로 센다.
    const slot: Placed = { node, x: 0, y: MARGIN_TOP + depth * LEVEL_GAP, depth };
    at.set(value, slot);
    place(node.left, depth + 1);
    slot.x = MARGIN_X + slotW * (rank.next + 0.5);
    rank.next += 1;
    maxDepth = Math.max(maxDepth, depth);
    place(node.right, depth + 1);
  };

  place(scene.nodes.length > 0 ? scene.nodes[0].value : null, 0);
  return { at, maxDepth };
}

/** 없는 자식이 앉았을 자리. 거기서도 키가 올라온다 — 다만 0 이다. */
function ghostPoint(p: Point, side: 'left' | 'right'): Point {
  return { x: p.x + (side === 'left' ? -GHOST_DX : GHOST_DX), y: p.y + GHOST_DY };
}

export const heightBalanceCheckStageView: CanvasView = {
  // render 에서 나무의 실제 깊이로 viewBox 를 다시 잰다. 이 값은 그 전까지의
  // 자리표일 뿐이지만, 다시 잰 값보다 짧으면 첫 프레임이 눌려 보인다.
  canvas: { height: heightFor(DEFAULT_DEPTH) },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<HeightBalanceCheckScene> {
    const svg = params.canvas;
    svg.textContent = '';

    const colors = getColors(params.theme);

    /**
     * 장면마다 통째로 다시 짓는 뿌리.
     *
     * 고정 자리에 남겨 두는 요소를 하나도 두지 않는다. 남겨 두면 정적 경로가 그
     * 속성을 **매번 명시로** 쓰는지 따로 확인해야 하고, 빠뜨린 속성 하나가 되짚기
     * 판정을 가른다 (S-scene 의 "재건 밖 요소").
     */
    const root = svgEl('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 세대. destroy 와 되짚기가 함께 쓴다.
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     * 이 조각의 걸음은 마디가 셋(토큰 올라오기 → 맞대는 뜸 → 장면 다시 세우기)이라
     * `await` 를 여러 번 지난다. 살아남은 앞 세대가 마지막 마디까지 가면 새로 선
     * 화면을 통째로 덮는다.
     */
    let gen = 0;

    function animate(ms: number, draw: (p: number) => void, live: () => boolean): Promise<void> {
      // 빗장이 화면 쓰기보다 앞에 온다. 뒤에 두면 깨어난 앞 세대가 첫 프레임 하나를
      // 새로 선 화면에 쓰고 나서야 물러난다.
      if (!live()) return Promise.resolve();
      draw(0);
      return new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          if (live()) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        let id = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          frames.delete(id);
          draw(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          frames.delete(id);
          // 내 세대가 아니면 화면에 손대지 않고 물러난다.
          if (destroyed || !live()) {
            done = true;
            waiters.delete(finish);
            resolve();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          if (raw >= 1) {
            finish();
            return;
          }
          draw(easeInOut(raw));
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    /** 맞대어 빼는 뜸. 타이머도 세대를 본다 — 되짚기가 끼어들면 곧바로 풀린다. */
    function wait(ms: number, live: () => boolean): Promise<void> {
      if (!live()) return Promise.resolve();
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        let id: ReturnType<typeof setTimeout> | null = null;
        const finish = (): void => {
          if (id !== null) {
            clearTimeout(id);
            timers.delete(id);
            id = null;
          }
          waiters.delete(finish);
          resolve();
        };
        id = setTimeout(finish, ms);
        timers.add(id);
        waiters.add(finish);
      });
    }

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let tileByValue = new Map<number, SVGGElement>();

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      root.replaceChildren();
      tileByValue = new Map<number, SVGGElement>();
    }

    /**
     * 캔버스 세로도 장면이 정한다.
     *
     * 세로는 `viewBox` 로만 말한다. 러너가 캔버스를 `width:100%` + `height:auto` 로
     * 세워 두므로 실제 높이는 viewBox 의 비율에서 따라온다 (S-view).
     */
    function resize(maxDepth: number): void {
      svg.setAttribute('viewBox', `0 0 ${PIECE_CANVAS_W} ${heightFor(maxDepth)}`);
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────────────

    /**
     * 없는 자식 자리. 거기 적힌 수는 `childHeight` 가 낸다 — 올라오는 토큰이 쓰는
     * 것과 같은 함수다. `'0'` 을 상수로 박으면 언젠가 토큰의 수와 갈린다.
     */
    function drawGhost(
      layer: SVGGElement,
      scene: HeightBalanceCheckScene,
      p: Placed,
      side: 'left' | 'right',
    ): void {
      const { x: gx, y: gy } = ghostPoint(p, side);
      layer.appendChild(
        svgEl('line', {
          x1: p.x,
          y1: p.y + NODE_R,
          x2: gx,
          y2: gy,
          stroke: colors.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '3,3',
        }),
      );
      layer.appendChild(
        svgEl('circle', {
          cx: gx,
          cy: gy,
          r: GHOST_R,
          fill: colors.bg,
          stroke: colors.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '2,2',
        }),
      );
      const label = svgEl('text', {
        x: gx,
        y: gy + 3,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.ghostOutline,
      });
      label.textContent = String(childHeight(scene, p.node.value, side));
      layer.appendChild(label);
    }

    function drawSkeleton(scene: HeightBalanceCheckScene, geo: Geometry): void {
      const edgeLayer = svgEl('g');
      const ghostLayer = svgEl('g');
      const nodeLayer = svgEl('g');
      root.append(edgeLayer, ghostLayer, nodeLayer);

      for (const p of geo.at.values()) {
        for (const side of ['left', 'right'] as const) {
          const childValue = side === 'left' ? p.node.left : p.node.right;
          const child = childValue === null ? undefined : geo.at.get(childValue);
          if (!child) {
            // 자식이 없으면 그 자리에 유령을 세운다. 나무 모양이 곧 가지의 유무다 —
            // 가지를 상수로 박아 두면 되감았을 때 조용히 사라진다 (프로토콜 4 절).
            drawGhost(ghostLayer, scene, p, side);
            continue;
          }
          edgeLayer.appendChild(
            svgEl('line', {
              x1: p.x,
              y1: p.y + NODE_R,
              x2: child.x,
              y2: child.y - NODE_R,
              stroke: colors.border,
              'stroke-width': 1.5,
            }),
          );
        }

        nodeLayer.appendChild(
          svgEl('circle', {
            cx: p.x,
            cy: p.y,
            r: NODE_R,
            fill: colors.bg,
            stroke: colors.text,
            'stroke-width': 1.5,
          }),
        );
        const label = svgEl('text', {
          x: p.x,
          y: p.y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        label.textContent = String(p.node.value);
        nodeLayer.appendChild(label);
      }
    }

    /**
     * 이미 적힌 자리들. **남는 강조**라 정적 그리기에 들어간다.
     *
     * 수는 하나도 이 파일이 세지 않는다 — `metricsAt` 이 나무에서 센 것을 옮겨
     * 적을 뿐이다.
     */
    function drawTiles(scene: HeightBalanceCheckScene, geo: Geometry): void {
      const tileLayer = svgEl('g');
      root.appendChild(tileLayer);

      for (const value of scene.settled) {
        const p = geo.at.get(value);
        const m = metricsAt(scene, value);
        if (!p || m === null) continue;

        const g = svgEl('g');

        const heightLabel = svgEl('text', {
          x: p.x,
          y: p.y + NODE_R + 15,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        heightLabel.textContent = `h ${m.height}`;
        g.appendChild(heightLabel);

        const balY = p.y + NODE_R + 33;
        const balBg = m.outOfRange ? colors.danger : colors.bgSubtle;
        const balBorder = m.outOfRange ? colors.danger : colors.border;
        const balInk = m.outOfRange ? colors.stateInk : colors.text;

        g.appendChild(
          svgEl('rect', {
            x: p.x - 20,
            y: balY - 9,
            width: 40,
            height: 18,
            fill: balBg,
            stroke: balBorder,
            'stroke-width': 1,
          }),
        );
        const text = svgEl('text', {
          x: p.x,
          y: balY + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: balInk,
        });
        text.textContent = `Δ ${m.balance > 0 ? '+' : ''}${m.balance}`;
        g.appendChild(text);

        tileLayer.appendChild(g);
        tileByValue.set(value, g);
      }
    }

    function drawStatic(scene: HeightBalanceCheckScene, geo: Geometry): void {
      drawSkeleton(scene, geo);
      drawTiles(scene, geo);
    }

    // ── 흐르게 하기 ─────────────────────────────────────────────────────────

    /** 올라오는 키 토큰 하나. 자리를 실제로 옮긴다 — opacity 전환이 아니다. */
    function makeToken(layer: SVGGElement, text: string): SVGGElement {
      const g = svgEl('g');
      g.appendChild(
        svgEl('circle', {
          r: 10,
          fill: colors.bgSubtle,
          stroke: colors.text,
          'stroke-width': 1.5,
        }),
      );
      const t = svgEl('text', {
        'text-anchor': 'middle',
        y: 3.5,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.text,
      });
      t.textContent = text;
      g.appendChild(t);
      layer.appendChild(g);
      return g;
    }

    /**
     * 한 자리의 셈이 끝나는 걸음.
     *
     * 정적 그리기가 이미 그 자리의 배지를 세워 두었으므로, 흐르기 전에 **그것을
     * 걷어 출발 그림으로 물려 놓는다.** 두 토큰은 **한 시계로** 함께 올라온다 —
     * 맞대어 빼는 것이 이 걸음의 뜻이라 갈라 돌리면 두 시계가 우연히 맞는 꼴이 된다.
     */
    async function flowSettle(
      step: HeightBalanceStep,
      scene: HeightBalanceCheckScene,
      geo: Geometry,
      live: () => boolean,
    ): Promise<void> {
      const self = geo.at.get(step.value);
      if (!self) return;

      // 배지는 토큰이 다 올라온 뒤에 적힌다. 정적 그리기가 이미 세웠으니 걷어 둔다.
      tileByValue.get(step.value)?.remove();

      const travelLayer = svgEl('g');
      root.appendChild(travelLayer);

      const legs = (['left', 'right'] as const).map((side) => {
        const childValue = side === 'left' ? self.node.left : self.node.right;
        const child = childValue === null ? undefined : geo.at.get(childValue);
        const from: Point = child ? { x: child.x, y: child.y } : ghostPoint(self, side);
        const to: Point = {
          x: self.x + (side === 'left' ? -14 : 14),
          y: self.y - NODE_R - 12,
        };
        // 토큰의 수도 나무에서 센다. 유령 자리에 적힌 0 과 같은 함수다.
        const g = makeToken(travelLayer, String(childHeight(scene, step.value, side)));
        return { g, from, to };
      });

      await animate(
        RISE_MS,
        (p) => {
          for (const leg of legs) {
            const x = leg.from.x + (leg.to.x - leg.from.x) * p;
            const y = leg.from.y + (leg.to.y - leg.from.y) * p;
            leg.g.setAttribute('transform', `translate(${x} ${y})`);
          }
        },
        live,
      );
      if (!live()) return;

      // 토큰이 맞대어 사라지고, 잠깐 뜸을 들인 뒤 그 차가 자리에 적힌다.
      travelLayer.remove();
      await wait(MERGE_MS, live);
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 자리는 `step` 이 실어 온 마디에서 나무를
     * 타고 복원하므로 고를 것이 `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: HeightBalanceCheckScene,
      _prev: HeightBalanceCheckScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      const geo = layoutOf(next);
      resize(geo.maxDepth);
      rewind();
      drawStatic(next, geo);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const step = next.step;
      if (step === null) return;

      await flowSettle(step, next, geo, live);
      if (!live()) return;

      // 흐르며 남은 보간 좌표 문자열·임시 노드가 통째로 사라진다. 그 사이에 타이머도
      // 프레임도 없어 깜빡이지 않는다 (S-scene).
      rewind();
      drawStatic(next, geo);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
