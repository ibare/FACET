/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 진 쪽 뿌리가 서브트리를 통째로
 * 끌고 이긴 쪽 밑으로 옮겨 붙는 운동이 이 조각의 동사다. 그 view 에는 부분
 * 나무를 옮겨 붙이는 어휘가 없고, 무엇보다 여기서는 **세로 층이 곧 랭크**라
 * 좌표계를 이 조각이 정해야 한다 (원칙 6 의 예외 조건).
 *
 * union-by-rank 조각 전용 무대 — SVG 트리 다이어그램.
 *
 * "골라 붙인다": 두 뿌리를 견주고, 진 쪽의 서브트리 전체가 실제로 이긴 쪽
 * 뿌리 밑으로 이동해 붙는다(translate) — opacity 전환이 아니라 좌표가 바뀐다.
 * 나무의 세로 폭이 곧 랭크(키)이므로, 낮은 뿌리를 넣을 때는 세로가 늘지 않고
 * 뒤집어 넣을 때만 는다는 것이 그림 자체에서 드러난다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 필요
 * 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * **숲의 모양을 장면이 쥐므로 나머지는 전부 그 구조에서 셈해진다.** 자리는
 * `computeLayout` 이, 가지는 `parent` 가, 배지가 뜰 자리와 그 수는 `isRoot` 와
 * `rankAt` 이 정한다 — **배지에 뜬 랭크와 눈으로 세는 세로 층수가 같은 함수를
 * 지난다.** 그것이 이 조각의 주장이 그림 안에서 닫히는 자리다.
 *
 * **운동의 방향이 뒤집힌다.** 정적 그리기가 정본이라 마디들은 이미 붙은 뒤 자리에
 * 서 있고, 붙는 운동은 **아직 못 온 만큼 뒤로 물려** 놓고 출발한다. 그 출발 그림은
 * `prev` 가 아니라 장면에서 셈한다 — 붙는 걸음이 바꾼 것은 가리킴 하나뿐이라
 * `detached` 가 붙기 전 숲을 그대로 돌려준다 (S-scene).
 *
 * **한 걸음에 온 숲이 함께 움직인다.** 슬롯 폭이 남은 잎 수에 맞춰 다시 나뉘므로
 * 붙지 않은 나무들도 따라 미끄러진다. 그것이 한 동작이라 시계를 나누지 않는다 —
 * 옮길 것을 한 목록에 모아 한 트윈으로 흘린다 (S-scene).
 *
 * 색은 design-tokens 만 쓴다 (S-view).
 */

import {
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  fontSizes,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  attachWasTie,
  childrenOf,
  detached,
  isRoot,
  rankAt,
  type UnionByRankScene,
  type UnionByRankStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = PIECE_CANVAS_W;
const NODE_R = 18;
const LEVEL_Y = [92, 164, 236];
const CAPTION_Y = 20;
const BADGE_DY = -30;
const SIDE_MIN = 30;
const CELL_MAX_W = 120;

/** 캔버스 세로. 그림이 정하는 값이라 그림 곁에 상수로 둔다 (S-piece). */
const CANVAS_H = LEVEL_Y[LEVEL_Y.length - 1]! + NODE_R + 26;

/** 서브트리가 미끄러져 붙는 시간. 이 조각의 동사가 서는 자리다. */
const MOVE_MS = 380;
/** 강조가 한 번 부풀었다 가라앉는 시간. */
const PULSE_MS = 260;
/** 견주는 두 자리가 부푸는 정도. 나란히 놓고 재는 순간이라 얇게 짚는다. */
const WEIGH_SCALE = 0.12;
/** 랭크가 오른 배지가 부푸는 정도. 그 수가 이 걸음의 말이라 크게 짚는다. */
const GROW_SCALE = 0.35;
/**
 * 계기가 제자리에 앉는 시간.
 *
 * 짚기만 하는 걸음(견주기 · 되감기)은 숲을 옮기지 않아 흐를 것이 없었고, 그래서
 * 걸음 벽시계가 `stepMs` 그대로였다 — S-piece 의 얇은 걸음 잣대(800ms) 아래다.
 * 그 걸음에만 얇은 운동을 주어 벽시계를 올린다.
 */
const SETTLE_MS = 180;
/** 앉기 전에 물려 있는 세로 거리. */
const SETTLE_RISE = 6;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el as SVGElementTagNameMap[K];
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

type Pt = { x: number; y: number };

/**
 * 지금의 가리킴 배열로 층 배치를 계산한다.
 * 잎은 왼쪽부터 슬롯을 받고, 내부 노드는 자식 슬롯의 평균(중앙)에 놓인다.
 * 슬롯 폭은 남은 잎 수에 맞춰 매번 다시 나눈다 — 가지가 줄수록 폭이 넓어진다.
 *
 * **자리를 먼저 한 번에 셈하고 그리는 쪽은 읽기만 한다.** 그리면서 이웃의 지금
 * 좌표를 재면 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).
 */
function computeLayout(n: number, parent: readonly number[]): Pt[] {
  // 누가 누구의 자식인가는 랭크를 세는 쪽과 같은 함수를 쓴다. 잣대가 두 군데면
  // 갈리고, 갈리면 배지의 수와 그림의 층이 어긋난다 (프로토콜 4 절).
  const children = childrenOf(n, parent);
  const depth = new Array<number>(n).fill(0);
  const roots: number[] = [];
  for (let i = 0; i < n; i++) if (parent[i] === i) roots.push(i);

  for (const r of roots) {
    depth[r] = 0;
    const stack = [r];
    const seen = new Set<number>([r]);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const c of children[cur]!) {
        if (seen.has(c)) continue;
        seen.add(c);
        depth[c] = depth[cur]! + 1;
        stack.push(c);
      }
    }
  }

  const leafSlot = new Array<number>(n).fill(0);
  let nextSlot = 0;
  const assign = (id: number, seen: ReadonlySet<number>): number => {
    const kids = children[id]!.filter((c) => !seen.has(c));
    if (kids.length === 0) {
      leafSlot[id] = nextSlot;
      nextSlot += 1;
      return leafSlot[id]!;
    }
    const walked = new Set(seen).add(id);
    let sum = 0;
    for (const c of kids) sum += assign(c, walked);
    const center = sum / kids.length;
    leafSlot[id] = center;
    return center;
  };
  for (const r of roots) assign(r, new Set([r]));

  const totalSlots = Math.max(1, nextSlot);
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / totalSlots));
  const originX = Math.round((W - totalSlots * cellW) / 2);

  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: originX + (leafSlot[i]! + 0.5) * cellW,
      y: LEVEL_Y[Math.min(depth[i]!, LEVEL_Y.length - 1)]!,
    });
  }
  return out;
}

/**
 * 자리의 형편. 어느 쪽이 견주는 중이고 어느 쪽이 졌는지는 장면의 `step` 이 말한다 —
 * 옮기기 전에는 이것을 적어 둔 곳이 원의 `fill` 뿐이었다.
 */
type NodeState = 'default' | 'compare' | 'loser' | 'winner';

function stateOf(scene: UnionByRankScene, id: number): NodeState {
  const step = scene.step;
  if (!step) return 'default';
  switch (step.kind) {
    case 'compare':
      return step.a === id || step.b === id ? 'compare' : 'default';
    case 'attach':
      if (step.loser === id) return 'loser';
      if (step.winner === id) return 'winner';
      return 'default';
    case 'grow':
      return step.root === id ? 'winner' : 'default';
    default:
      return 'default';
  }
}

/** 마디 하나의 손잡이. 뜻과 수는 담지 않는다 — 장면이 말한다. */
type NodeVisual = {
  /** 자리를 나르는 바깥 그룹. `transform` 이 좌표다. */
  outer: SVGGElement;
  /** 앉는 운동이 미는 안쪽 그룹. 바깥의 좌표와 섞이지 않게 한 겹 더 둔다. */
  inner: SVGGElement;
  /** 뿌리일 때만 있다. */
  badge: SVGGElement | null;
};

/** 앉는 운동이 미는 것 하나. `base` 는 그 요소가 원래 쓰고 있던 `transform`. */
type Settle = { el: SVGElement; base: string };

function composed(base: string, extra: string): string {
  return base.length > 0 ? `${base} ${extra}` : extra;
}

export const unionByRankStageView: CanvasView = {
  canvas: { height: CANVAS_H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<UnionByRankScene> {
    const svg = params.canvas;
    svg.textContent = '';
    const palette: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지와 자리 번호만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    // 캡션은 고정 자리에 한 번만 짓고 다시 만들지 않는다. 그래서 정적 경로가 매번
    // 명시로 써 주어야 한다 — 되짚기에서 앞 걸음의 문안이 남지 않게 (프로토콜 4 절).
    const captionText = svgEl('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-size': fontSizes.sm,
      fill: palette.text,
    });
    svg.appendChild(captionText);

    const edgesLayer = svgEl('g');
    const nodesLayer = svgEl('g');
    svg.appendChild(edgesLayer);
    svg.appendChild(nodesLayer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 마디와 가지를 매번 새로 짓지만, 그 손잡이를 담는 `nodeEls` ·
     * `edgeEls` 는 **다시 할당되는 클로저 변수**다. 옛 세대의 프레임이 그것을 읽으면
     * 새 손잡이를 타고 살아 있는 화면에 쓴다. 그래서 프레임마다 자기 세대를 확인하고
     * 아니면 손대지 않고 물러난다 (S-scene).
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다.
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /** t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다. */
    function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed) {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const start = performance.now();
        let id = 0;
        const frame = (now: number): void => {
          frames.delete(id);
          const raw = Math.min(1, (now - start) / durationMs);
          onFrame(raw);
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    /** 자리 번호로 찾는 손잡이. 정적 그리기가 매번 새로 채운다. */
    let nodeEls = new Map<number, NodeVisual>();
    /** 가지의 손잡이. 열쇠는 자식(진 쪽) 자리 번호다. */
    let edgeEls = new Map<number, SVGLineElement>();

    function fillFor(state: NodeState): string {
      switch (state) {
        case 'compare':
          return palette.itemComparing;
        case 'loser':
          return palette.itemSwapping;
        case 'winner':
          return palette.itemActive;
        default:
          return palette.itemDefault;
      }
    }

    function makeNode(scene: UnionByRankScene, id: number, p: Pt): NodeVisual {
      const outer = svgEl('g', { transform: `translate(${p.x}, ${p.y})` });
      const inner = svgEl('g');
      const state = stateOf(scene, id);

      const circle = svgEl('circle', {
        r: NODE_R,
        fill: fillFor(state),
        stroke: state === 'default' ? palette.border : palette.stateInk,
        'stroke-width': 2,
      });
      const label = svgEl('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': fontSizes.md,
        fill: state === 'default' ? palette.text : palette.stateInk,
      });
      label.textContent = String(id);

      inner.appendChild(circle);

      // 배지는 **뿌리일 때만 짓는다.** 늘 지어 두고 `display` 로 감추면, 흐르며 선
      // 화면과 곧바로 세운 화면이 속성의 유무만큼 달라 되짚기 판정에서 어긋난다.
      let badge: SVGGElement | null = null;
      if (isRoot(scene.parent, id)) {
        badge = svgEl('g', { transform: `translate(0, ${BADGE_DY})` });
        badge.appendChild(
          svgEl('rect', {
            x: -14,
            y: -10,
            width: 28,
            height: 18,
            rx: 4,
            fill: palette.bgSubtle,
            stroke: palette.border,
          }),
        );
        const badgeText = svgEl('text', {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          y: 0,
          'font-size': fontSizes.xs,
          fill: palette.text,
        });
        // 랭크는 숲에서 센다. 배지의 수와 눈으로 세는 세로 층수가 같은 함수를 지난다.
        badgeText.textContent = String(rankAt(scene.n, scene.parent, id));
        badge.appendChild(badgeText);
        inner.appendChild(badge);
      }

      inner.appendChild(label);
      outer.appendChild(inner);
      nodesLayer.appendChild(outer);
      return { outer, inner, badge };
    }

    function placeNode(nv: NodeVisual, p: Pt): void {
      nv.outer.setAttribute('transform', `translate(${p.x}, ${p.y})`);
    }

    function placeEdge(line: SVGLineElement, from: Pt, to: Pt): void {
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y + NODE_R));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y - NODE_R));
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 transform ·
     * opacity 도 함께 사라진다 (S-scene).
     */
    function drawStatic(scene: UnionByRankScene): void {
      svg.setAttribute('viewBox', `0 0 ${W} ${CANVAS_H}`);
      edgesLayer.textContent = '';
      nodesLayer.textContent = '';
      nodeEls = new Map<number, NodeVisual>();
      edgeEls = new Map<number, SVGLineElement>();

      const pos = computeLayout(scene.n, scene.parent);

      for (let i = 0; i < scene.n; i++) {
        if (isRoot(scene.parent, i)) continue;
        const p = scene.parent[i]!;
        const from = pos[p];
        const to = pos[i];
        if (!from || !to) continue;
        const line = svgEl('line', { stroke: palette.border, 'stroke-width': 2 });
        placeEdge(line, from, to);
        edgesLayer.appendChild(line);
        edgeEls.set(i, line);
      }

      for (let i = 0; i < scene.n; i++) {
        const p = pos[i];
        if (!p) continue;
        nodeEls.set(i, makeNode(scene, i, p));
      }
    }

    /** 캡션은 장면이 무엇을 말할지와 자리 번호만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(scene: UnionByRankScene): void {
      const step = scene.step;
      if (!step) {
        captionText.textContent = '';
        return;
      }
      switch (step.kind) {
        case 'compare':
          captionText.textContent = tr(
            'caption.compare',
            'Compare rank: node {a} (rank {rankA}) vs node {b} (rank {rankB})',
            {
              a: step.a,
              rankA: rankAt(scene.n, scene.parent, step.a),
              b: step.b,
              rankB: rankAt(scene.n, scene.parent, step.b),
            },
          );
          return;
        case 'attach':
          // 랭크가 같았나 달랐나는 붙기 전 숲에서 판정한다. 화면에 뜬 세로 폭과
          // 같은 자를 쓰므로 캡션과 그림이 갈릴 수 없다.
          captionText.textContent = attachWasTie(scene, step)
            ? tr(
                'caption.attachTie',
                'Ranks tie — node {loser} goes under node {winner}. Height must grow by one.',
                { loser: step.loser, winner: step.winner },
              )
            : tr(
                'caption.attachDiffer',
                'Ranks differ — node {loser} goes under the taller node {winner}. The height stays the same.',
                { loser: step.loser, winner: step.winner },
              );
          return;
        case 'grow':
          captionText.textContent = tr(
            'caption.grow',
            "Node {root}'s rank rises by one — now {rank}.",
            { root: step.root, rank: rankAt(scene.n, scene.parent, step.root) },
          );
          return;
        case 'rewound':
          captionText.textContent = tr('caption.rewind', 'Replaying from the start.');
          return;
        case 'done':
          captionText.textContent = tr('caption.done', 'All unions done.');
          return;
      }
    }

    /**
     * 진 쪽 서브트리가 통째로 미끄러져 붙는다.
     *
     * 배치가 달라지는 유일한 걸음이라 `layout(붙기 전) → layout(붙은 뒤)` 보간
     * 하나로 합친다. 슬롯 폭이 다시 나뉘어 붙지 않은 나무들도 함께 미끄러지는데
     * 그것이 한 동작이므로 시계를 나누지 않는다.
     *
     * 출발 그림은 `prev` 가 아니라 `detached` 가 돌려주는 숲에서 셈한다 (S-scene).
     */
    function attachFlow(
      scene: UnionByRankScene,
      step: Extract<UnionByRankStep, { kind: 'attach' }>,
      mine: number,
    ): Promise<void> {
      const before = detached(scene.parent, step.loser);
      const from = computeLayout(scene.n, before);
      const to = computeLayout(scene.n, scene.parent);

      const draw = (raw: number): void => {
        const e = easeInOutCubic(raw);
        const pos: Pt[] = [];
        for (let i = 0; i < scene.n; i++) {
          const a = from[i];
          const b = to[i];
          if (!a || !b) {
            pos.push({ x: 0, y: 0 });
            continue;
          }
          pos.push({ x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) });
        }
        for (const [id, nv] of nodeEls) {
          const p = pos[id];
          if (p) placeNode(nv, p);
        }
        for (const [child, line] of edgeEls) {
          const p = scene.parent[child];
          const a = p === undefined ? undefined : pos[p];
          const b = pos[child];
          if (a && b) placeEdge(line, a, b);
          // 새로 이어지는 가지 하나만 번져 들어온다. 나머지는 이미 걸려 있던 것이다.
          if (child === step.loser) line.setAttribute('opacity', String(e));
        }
      };

      // 끝 자리에 선 것을 옛 자리로 물려 놓고 출발한다. 정적으로 세운 직후라 그
      // 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다 (프로토콜 4 절).
      draw(0);
      return tween(MOVE_MS, (raw) => {
        if (!alive(mine)) return;
        draw(raw);
      });
    }

    /**
     * 한 번 부풀었다 제 크기로 돌아오는 강조 — **지나가는 것**이다.
     *
     * 짚기만 하는 걸음(견주기 · 랭크 오름)은 숲을 옮기지 않아 흐를 것이 없고, 그래서
     * 걸음 벽시계가 `stepMs` 그대로였다 — S-piece 의 얇은 걸음 잣대(800ms) 아래다.
     * 그 걸음에만 얇은 운동을 주어 벽시계를 올린다.
     *
     * 나타났다 사라지는 꼴(`opacity` 0 → 1)로 하지 않는다. 그 자리에 이미 서 있던
     * 것이라 되레 한 번 깜빡이는 것으로 보인다.
     */
    function pulseFlow(items: readonly Settle[], amount: number, mine: number): Promise<void> {
      if (items.length === 0) return Promise.resolve();
      const draw = (raw: number): void => {
        const scale = 1 + amount * Math.sin(Math.PI * raw);
        for (const it of items) {
          it.el.setAttribute('transform', composed(it.base, `scale(${scale.toFixed(3)})`));
        }
      };
      draw(0);
      return tween(PULSE_MS, (raw) => {
        if (!alive(mine)) return;
        draw(raw);
      });
    }

    /**
     * 랭크가 오른 배지.
     *
     * 수는 이미 새 값이다 — 붙는 순간 세로가 늘었고 배지가 그 숲을 세기 때문이다.
     * 이 걸음이 하는 일은 그 사실을 짚는 것이라 운동도 그만큼만 한다.
     */
    function grownBadge(root: number): Settle[] {
      const badge = nodeEls.get(root)?.badge;
      return badge ? [{ el: badge, base: `translate(0, ${BADGE_DY})` }] : [];
    }

    /**
     * 되감긴 숲이 조금 아래에서 제자리로 앉는다.
     *
     * 화면이 통째로 갈리는 걸음이라 여기서는 나타나는 꼴이 옳다. 끝에서 보간값 대신
     * 목표값을 그대로 쓰고, 남은 속성은 이어지는 정적 그리기가 통째로 거둔다
     * (프로토콜 4 절).
     */
    function settleFlow(items: readonly Settle[], mine: number): Promise<void> {
      if (items.length === 0) return Promise.resolve();
      const draw = (raw: number): void => {
        const e = easeOutCubic(raw);
        for (const it of items) {
          it.el.setAttribute('opacity', String(e));
          it.el.setAttribute(
            'transform',
            composed(it.base, `translate(0, ${(SETTLE_RISE * (1 - e)).toFixed(2)})`),
          );
        }
      };
      draw(0);
      return tween(SETTLE_MS, (raw) => {
        if (!alive(mine)) return;
        draw(raw);
      });
    }

    /** 견주는 두 자리. 배지를 단 채로 함께 부푸니 견주는 두 수가 같이 앞으로 나온다. */
    function weighed(step: Extract<UnionByRankStep, { kind: 'compare' }>): Settle[] {
      const out: Settle[] = [];
      for (const id of [step.a, step.b]) {
        const nv = nodeEls.get(id);
        if (nv) out.push({ el: nv.inner, base: '' });
      }
      return out;
    }

    /** 되감긴 숲 전체. 흩어진 자리로 되돌아가 한 번에 앉는다. */
    function allSettles(scene: UnionByRankScene): Settle[] {
      const out: Settle[] = [];
      for (let i = 0; i < scene.n; i++) {
        const nv = nodeEls.get(i);
        if (nv) out.push({ el: nv.inner, base: '' });
      }
      return out;
    }

    function flow(scene: UnionByRankScene, step: UnionByRankStep, mine: number): Promise<void> {
      switch (step.kind) {
        case 'compare':
          return pulseFlow(weighed(step), WEIGH_SCALE, mine);
        case 'attach':
          return attachFlow(scene, step, mine);
        case 'grow':
          return pulseFlow(grownBadge(step.root), GROW_SCALE, mine);
        case 'rewound':
          return settleFlow(allSettles(scene), mine);
        case 'done':
          return Promise.resolve();
      }
    }

    async function render(
      next: UnionByRankScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: UnionByRankScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;
      await flow(next, step, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 보간 끝자리와 opacity · transform 을 통째로 거둔다. 되돌릴
      // 목록을 손으로 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const done of [...pending]) done();
        pending.clear();
        svg.textContent = '';
      },
    };
  },
};
