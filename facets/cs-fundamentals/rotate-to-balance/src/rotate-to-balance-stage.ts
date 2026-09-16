/**
 * rotate-to-balance-stage — 회전이 실제로 일어나는 자리.
 *
 * 마디의 가로 위치는 값의 정렬 순서로 고정한다. 회전은 그 자리를 바꾸지 않는다 —
 * 오직 세로(깊이)만 바뀐다. 그래서 회전 애니메이션은 "가로는 그대로, 세로만
 * 움직인다" 는 사실 자체가 "중위 순회 결과는 회전 전후가 같다" 는 주장의 증거가 된다.
 *
 * **그 증거가 우연이 아니게 하려고** 아래쪽 띠는 `scene.nodes` 를 실제로 중위
 * 순회해 얻고, 눈금은 각 마디가 선 제 가로에 찍는다. 순회 차례가 값 차례와
 * 어긋나면 눈금이 왼쪽에서 오른쪽으로 가지 않으므로 그림이 스스로 들킨다.
 *
 * 빌트인 `tree-layout` view 를 쓰지 않은 이유: `setTree()` 는 즉시 다시 그릴 뿐
 * 위치 전환을 보간하지 않는다 (fold/unfold 는 서브트리 opacity/scale 만 다룬다).
 * "돈다" 라는 동사는 마디가 실제로 이동해야 성립하므로 좌표를 프레임마다 보간하는
 * 이 전용 stage 가 필요하다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 필요 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * **나무를 장면이 쥐므로 나머지는 전부 그 구조에서 셈해진다.** 어느 가지가 사라지고
 * 어느 가지가 새로 이어졌는지는 `base` 와 `nodes` 를 견주면 나오고, 배지의 `h` 와
 * `Δ`·캡션의 키 둘·띠의 값은 `scene.ts` 의 `heightAt` · `metricsAt` · `inorderIds` 가
 * 센다 — **화면에 나란히 뜨는 수가 두 출처에서 오지 않는다.**
 *
 * **운동의 방향이 뒤집힌다.** 정적 그리기가 정본이라 마디들은 이미 회전 후 자리에
 * 서 있고, 회전은 **아직 못 온 만큼 뒤로 물려** 놓고 출발한다. 그 출발 그림은
 * `prev` 가 아니라 장면의 `base` 에서 셈한다 — 회전은 언제나 `base` 에서 `nodes`
 * 로 가는 한 걸음이고 `base` 는 어느 걸음도 고치지 않는다 (S-scene).
 *
 * **한 걸음에 여러 마디가 함께 움직인다.** 축이 내려가고 자식이 올라오고 가지 하나가
 * 손을 바꾸는 것이 **한 동작**이므로 시계를 나누지 않는다 — 옮길 것을 한 목록에
 * 모아 한 트윈으로 흘린다 (S-scene).
 *
 * 색은 design-tokens 만 쓴다 (S-view).
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  radii,
  space,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  heightAt,
  inorderIds,
  measuredTree,
  metricsAt,
  nodeOf,
  type RotateSceneMark,
  type RotateSceneNode,
  type RotateToBalanceScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const SIDE_MIN = 42;
const NODE_R_MIN = 13;
const NODE_R_MAX = 20;
const CAPTION_H = 26;
const TOP_PAD = 40;
const ROW_H = 68;
const BOTTOM_PAD = 16;
const STRIP_LABEL_H = 22;

/**
 * 계기와 띠가 제자리에 앉는 시간.
 *
 * 짚는 걸음(재기 · 결론)은 나무를 옮기지 않아 흐를 것이 없었고, 그래서 걸음
 * 벽시계가 `stepMs` 그대로였다 — S-piece 의 얇은 걸음 잣대(800ms) 아래였다.
 * `stepMs` 를 올리면 회전 걸음까지 함께 길어지므로, 짚는 걸음에만 얇은 운동을 주어
 * 벽시계를 올린다.
 */
const SETTLE_MS = 180;
/** 계기가 앉기 전에 물려 있는 세로 거리. */
const SETTLE_RISE = 6;

/** 캔버스 세로. 그림이 정하는 값이라 그림 곁에 상수로 둔다 (S-piece). */
export const ROTATE_TO_BALANCE_STAGE_HEIGHT = 360;

type Pt = { x: number; y: number };

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
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

function depthsOf(nodes: readonly RotateSceneNode[], rootId: string): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, number>();
  const walk = (id: string | null, depth: number): void => {
    if (!id || out.has(id)) return;
    const n = byId.get(id);
    if (!n) return;
    out.set(id, depth);
    walk(n.left, depth + 1);
    walk(n.right, depth + 1);
  };
  walk(rootId, 0);
  return out;
}

/** 가지 하나. 두 마디를 잇는 이름표는 순서를 타지 않는다 — 회전이 손을 바꾸므로. */
type Edge = { key: string; a: string; b: string };

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}~${b}` : `${b}~${a}`;
}

function edgesOf(nodes: readonly RotateSceneNode[]): Edge[] {
  const out: Edge[] = [];
  for (const n of nodes) {
    if (n.left) out.push({ key: edgeKey(n.id, n.left), a: n.id, b: n.left });
    if (n.right) out.push({ key: edgeKey(n.id, n.right), a: n.id, b: n.right });
  }
  return out;
}

/**
 * 나무의 배치 밑감. 회전 전 나무 하나로 정해진다 — 회전은 마디를 없애지도 만들지도
 * 않고 가로 자리를 바꾸지도 않으므로, 격자는 걸음 내내 그대로다.
 *
 * 세로 칸 수도 회전 전 나무로 잡는다. 회전하면 키가 줄어드는데 그때마다 격자를
 * 다시 잡으면 화면이 통째로 늘었다 줄었다 한다 — 키가 줄었다는 것 자체가 이 조각이
 * 보이려는 것이라 눈금이 고정되어야 견줄 수 있다.
 */
type Geom = {
  rank: Map<string, number>;
  nodeR: number;
  stripY: number;
  totalH: number;
  xFor(rank: number): number;
  yFor(depth: number): number;
};

function geomFor(base: readonly RotateSceneNode[], baseRootId: string): Geom {
  const count = Math.max(1, base.length);
  const usableW = Math.max(0, PIECE_CANVAS_W - SIDE_MIN * 2);
  const stepX = count > 1 ? usableW / (count - 1) : 0;
  const nodeR = Math.max(NODE_R_MIN, Math.min(NODE_R_MAX, stepX / 2 - 6));

  const rank = new Map<string, number>();
  [...base]
    .sort((a, b) => a.value - b.value)
    .forEach((n, i) => {
      rank.set(n.id, i);
    });

  const depths = depthsOf(base, baseRootId);
  const rows = base.length ? Math.max(0, ...base.map((n) => depths.get(n.id) ?? 0)) + 1 : 1;

  const xFor = (r: number): number => SIDE_MIN + r * stepX;
  const yFor = (depth: number): number => CAPTION_H + TOP_PAD + depth * ROW_H;
  const stripY = yFor(rows - 1) + nodeR + BOTTOM_PAD + nodeR;

  return { rank, nodeR, stripY, totalH: stripY + STRIP_LABEL_H, xFor, yFor };
}

/** 마디마다의 자리. 값이 가로를, 깊이가 세로를 정한다 (S-piece). */
function layout(
  nodes: readonly RotateSceneNode[],
  rootId: string,
  geom: Geom,
): Map<string, Pt> {
  const depths = depthsOf(nodes, rootId);
  const out = new Map<string, Pt>();
  for (const n of nodes) {
    out.set(n.id, {
      x: geom.xFor(geom.rank.get(n.id) ?? 0),
      y: geom.yFor(depths.get(n.id) ?? 0),
    });
  }
  return out;
}

type NodeVisual = { g: SVGGElement; circle: SVGCircleElement };

export const rotateToBalanceStageView: CanvasView = {
  canvas: { height: ROTATE_TO_BALANCE_STAGE_HEIGHT },
  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<RotateToBalanceScene> {
    container.textContent = '';
    const colors: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지와 마디 이름만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const svg = params.canvas;
    svg.textContent = '';

    const wrap = document.createElement('div');
    wrap.style.padding = space.md;
    wrap.style.background = colors.bg;
    wrap.style.border = `1px solid ${colors.border}`;
    wrap.style.borderRadius = radii.md;
    wrap.style.fontFamily = fonts.body;
    wrap.style.boxSizing = 'border-box';
    wrap.appendChild(svg);
    container.appendChild(wrap);

    const stripG = svgEl('g');
    const edgesG = svgEl('g');
    const nodesG = svgEl('g');
    svg.append(stripG, edgesG, nodesG);

    // 캡션은 고정 자리에 한 번만 짓고 다시 만들지 않는다. 그래서 정적 경로가
    // 매번 명시로 써 주어야 한다 — 되짚기에서 앞 걸음의 문안이 남지 않게.
    const captionText = svgEl('text', {
      x: PIECE_CANVAS_W / 2,
      y: 18,
      'text-anchor': 'middle',
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    svg.appendChild(captionText);

    const rawStepMs = (params.initialData as { stepMs?: unknown } | undefined)?.stepMs;
    const baseStepMs = typeof rawStepMs === 'number' ? rawStepMs : 600;
    const rotateMs = Math.min(900, Math.max(320, Math.round(baseStepMs * 0.75)));

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 마디와 가지를 매번 새로 짓지만, 그 손잡이를 담는 `nodeEls` ·
     * `edgeEls` · `metricEls` 는 **다시 할당되는 클로저 변수**다. 옛 세대의 프레임이
     * `await` 를 지난 뒤 그것을 읽으면 새 손잡이를 타고 살아 있는 화면에 쓴다.
     * 그래서 프레임마다 자기 세대를 확인하고 아니면 손대지 않고 물러난다 (S-scene).
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

    /** 마디 이름으로 찾는 손잡이. 정적 그리기가 매번 새로 채운다. */
    let nodeEls = new Map<string, NodeVisual>();
    let edgeEls = new Map<string, SVGLineElement>();
    /** 이번 장면에 선 계기(링·배지)들. 앉는 운동이 이것을 민다. */
    let metricEls: SVGElement[] = [];
    /** 이번 장면의 띠. 그어지는 운동이 이것을 민다. */
    let stripEl: SVGGElement | null = null;

    function placeNode(el: NodeVisual, p: Pt): void {
      el.g.setAttribute('transform', `translate(${p.x},${p.y})`);
    }

    function placeEdge(line: SVGLineElement, pa: Pt, pb: Pt): void {
      line.setAttribute('x1', String(pa.x));
      line.setAttribute('y1', String(pa.y));
      line.setAttribute('x2', String(pb.x));
      line.setAttribute('y2', String(pb.y));
    }

    function makeNode(n: RotateSceneNode, p: Pt, geom: Geom): NodeVisual {
      const g = svgEl('g', { transform: `translate(${p.x},${p.y})` });
      const circle = svgEl('circle', {
        r: geom.nodeR,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 2,
      });
      const label = svgEl('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        'font-weight': '600',
        fill: colors.text,
      });
      label.textContent = String(n.value);
      g.append(circle, label);
      return { g, circle };
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 transform·opacity·
     * 임시 가지도 함께 사라진다 (S-scene).
     */
    function drawStatic(scene: RotateToBalanceScene): void {
      const geom = geomFor(scene.base, scene.baseRootId);
      svg.setAttribute('viewBox', `0 0 ${PIECE_CANVAS_W} ${geom.totalH}`);

      edgesG.textContent = '';
      nodesG.textContent = '';
      stripG.textContent = '';
      nodeEls = new Map<string, NodeVisual>();
      edgeEls = new Map<string, SVGLineElement>();
      metricEls = [];
      stripEl = null;

      const pos = layout(scene.nodes, scene.rootId, geom);

      // 회전이 새로 이은 가지 — 두 나무의 차에서 나온다. "손을 바꾼 가지가 이것"
      // 이라는 이 조각의 결론이라 되짚어도 남아야 하므로 정적 그리기에 넣는다.
      const wasKeys = new Set(edgesOf(scene.base).map((e) => e.key));

      for (const e of edgesOf(scene.nodes)) {
        const pa = pos.get(e.a);
        const pb = pos.get(e.b);
        if (!pa || !pb) continue;
        const fresh = !wasKeys.has(e.key);
        const line = svgEl('line', {
          stroke: fresh ? colors.itemPivot : colors.border,
          'stroke-width': fresh ? 3 : 2,
        });
        placeEdge(line, pa, pb);
        edgesG.appendChild(line);
        edgeEls.set(e.key, line);
      }

      // 계기는 **잰 나무**에서 센다. 도는 동안에는 회전 전 나무를 가리키므로 배지가
      // 재었을 때의 수를 달고 마디와 함께 내려간다.
      const measured = measuredTree(scene);
      for (const n of scene.nodes) {
        const p = pos.get(n.id);
        if (!p) continue;
        const el = makeNode(n, p, geom);
        const m = measured ? metricsAt(measured.nodes, n.id) : null;
        // 범위를 벗어난 자리에만 링을 짓는다. 늘 지어 두고 `stroke` 를
        // `transparent` 로 감추면, 흐르며 선 화면과 곧바로 세운 화면이 속성의
        // 유무만큼 달라 되짚기 판정에서 어긋난다.
        if (m?.outOfRange === true) {
          const ring = svgEl('circle', {
            r: geom.nodeR + 4,
            fill: 'none',
            stroke: colors.danger,
            'stroke-width': 2,
          });
          el.g.insertBefore(ring, el.g.firstChild);
          metricEls.push(ring);
        }
        if (m) {
          const sign = m.balance > 0 ? '+' : '';
          const text = svgEl('text', {
            x: 0,
            y: -(geom.nodeR + 10),
            'text-anchor': 'middle',
            'font-size': fontSizes.xs,
            // 배지는 타일 위가 아니라 캔버스 배경 위에 떠 있다. stateInk(#171717
            // 고정)를 얹으면 다크 배경(#0a0a0a)에서 사라진다 — 배경 위 글자는 text 다.
            fill: m.outOfRange ? colors.danger : colors.text,
          });
          text.textContent = `h ${m.height} · Δ ${sign}${m.balance}`;
          el.g.appendChild(text);
          metricEls.push(text);
        }
        nodesG.appendChild(el.g);
        nodeEls.set(n.id, el);
      }

      if (scene.concluded) drawStrip(scene, geom);
    }

    /**
     * 중위 순회 띠 — 회전 전후가 같다는 결론이 서는 자리.
     *
     * 차례는 나무를 실제로 중위 순회해 얻고, 눈금은 그 마디가 선 제 가로에 찍는다.
     * 둘이 다른 출처였으면 "가로가 안 움직인다" 와 "순회가 그대로다" 가 서로를
     * 뒷받침하지 못한다.
     */
    function drawStrip(scene: RotateToBalanceScene, geom: Geom): void {
      const ids = inorderIds(scene.nodes, scene.rootId);
      if (ids.length === 0) return;
      const group = svgEl('g');
      const y = geom.stripY;
      const xs = ids.map((id) => geom.xFor(geom.rank.get(id) ?? 0));
      group.appendChild(
        svgEl('line', {
          x1: Math.min(...xs),
          y1: y,
          x2: Math.max(...xs),
          y2: y,
          stroke: colors.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 3',
        }),
      );
      ids.forEach((id, i) => {
        const x = xs[i];
        const tick = svgEl('line', {
          x1: x,
          y1: y - 4,
          x2: x,
          y2: y + 4,
          stroke: colors.textMuted,
          'stroke-width': 1.5,
        });
        const label = svgEl('text', {
          x,
          y: y + STRIP_LABEL_H - 6,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        label.textContent = String(nodeOf(scene.nodes, id)?.value ?? '');
        group.append(tick, label);
      });
      stripG.appendChild(group);
      stripEl = group;
    }

    /** 마디의 값. 원 안의 글자와 같은 곳에서 푼다 — 두 수가 갈릴 자리를 없앤다. */
    function valueOf(nodes: readonly RotateSceneNode[], id: string): number | string {
      return nodeOf(nodes, id)?.value ?? '';
    }

    /** 캡션은 장면이 무엇을 말할지와 마디 이름만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(scene: RotateToBalanceScene): void {
      const cap = scene.caption;
      if (!cap) {
        captionText.textContent = '';
        return;
      }
      const v = (id: string): number | string => valueOf(scene.nodes, id);
      switch (cap.kind) {
        case 'imbalance': {
          // 균형 인수도 잰 나무에서 다시 센다 — 배지에 뜬 `Δ` 와 같은 수여야 한다.
          const measured = measuredTree(scene);
          const balance = measured ? (metricsAt(measured.nodes, cap.id)?.balance ?? 0) : 0;
          captionText.textContent = tr(
            'caption.imbalance',
            'Node {value} has balance factor {balance} — outside the [-1, 1] range.',
            { value: v(cap.id), balance },
          );
          return;
        }
        case 'balanceChecked':
          captionText.textContent = tr(
            'caption.balanceChecked',
            'Every balance factor is within range.',
          );
          return;
        case 'rebalanced':
          captionText.textContent = tr(
            'caption.rebalanced',
            'Every balance factor is back in the [-1, 1] range.',
          );
          return;
        case 'rotating':
          captionText.textContent = tr(
            'caption.rotating',
            '{newRootValue} rises to the top, {pivotValue} settles below it, and {movedValue} changes parent.',
            {
              newRootValue: v(cap.newRootId),
              pivotValue: v(cap.pivotId),
              movedValue: v(cap.movedId),
            },
          );
          return;
        case 'rotatingSimple':
          captionText.textContent = tr(
            'caption.rotatingSimple',
            '{newRootValue} rises to the top and {pivotValue} settles below it.',
            { newRootValue: v(cap.newRootId), pivotValue: v(cap.pivotId) },
          );
          return;
        case 'rewound':
          captionText.textContent = tr(
            'caption.rewound',
            'Back to the start — press again to step through.',
          );
          return;
        case 'done':
          // 키 둘도 순회도 나무에서 센다. 배지의 `h` 와 띠의 값과 같은 자를 쓴다.
          captionText.textContent = tr(
            'caption.done',
            'Height drops from {before} to {after}; in-order sequence stays {order}.',
            {
              before: heightAt(scene.base, scene.baseRootId),
              after: heightAt(scene.nodes, scene.rootId),
              order: inorderIds(scene.nodes, scene.rootId)
                .map((id) => valueOf(scene.nodes, id))
                .join(', '),
            },
          );
          return;
      }
    }

    /**
     * 나무가 돈다.
     *
     * 배치가 달라지는 유일한 걸음이라 `layout(base) → layout(nodes)` 보간 하나로
     * 합친다. 축이 내려가고 자식이 올라오고 가지가 손을 바꾸는 것이 한 동작이므로
     * 시계를 나누지 않는다 — 옮길 것을 한 목록에 모아 한 트윈으로 흘린다.
     *
     * 출발 그림은 `prev` 가 아니라 `base` 에서 셈한다 (S-scene).
     */
    function rotateFlow(
      scene: RotateToBalanceScene,
      mark: Extract<RotateSceneMark, { kind: 'rotate' }>,
      mine: number,
    ): Promise<void> {
      const geom = geomFor(scene.base, scene.baseRootId);
      const fromPos = layout(scene.base, scene.baseRootId, geom);
      const toPos = layout(scene.nodes, scene.rootId, geom);

      const beforeEdges = edgesOf(scene.base);
      const afterEdges = edgesOf(scene.nodes);
      const beforeKeys = new Set(beforeEdges.map((e) => e.key));
      const afterKeys = new Set(afterEdges.map((e) => e.key));

      // 손을 놓는 가지는 정적 그리기에 없다 — 여기서 임시로 짓고, 운동이 끝난 뒤
      // 정적 그리기가 레이어를 비우며 통째로 거둔다.
      const going = beforeEdges
        .filter((e) => !afterKeys.has(e.key))
        .map((e) => {
          const line = svgEl('line', {
            stroke: colors.itemPivot,
            'stroke-width': 3,
          });
          edgesG.appendChild(line);
          return { edge: e, line };
        });

      const pick = (edges: Edge[]): { edge: Edge; line: SVGLineElement }[] =>
        edges
          .map((e) => ({ edge: e, line: edgeEls.get(e.key) }))
          .filter((x): x is { edge: Edge; line: SVGLineElement } => x.line !== undefined);

      const arriving = pick(afterEdges.filter((e) => !beforeKeys.has(e.key)));
      const staying = pick(afterEdges.filter((e) => beforeKeys.has(e.key)));

      // 도는 마디를 짚는다. **지나가는 강조**라 운동이 끝나면 정적 그리기가 거둔다.
      for (const id of [mark.pivotId, mark.newRootId, ...(mark.movedId ? [mark.movedId] : [])]) {
        const el = nodeEls.get(id);
        if (!el) continue;
        el.circle.setAttribute('stroke', colors.itemActive);
        el.circle.setAttribute('stroke-width', '3');
      }

      const moves = scene.nodes.map((n) => {
        const to = toPos.get(n.id) ?? { x: 0, y: 0 };
        return { id: n.id, from: fromPos.get(n.id) ?? to, to };
      });

      const draw = (raw: number): void => {
        const e = easeInOutCubic(raw);
        const pos = new Map<string, Pt>();
        for (const m of moves) {
          pos.set(m.id, { x: lerp(m.from.x, m.to.x, e), y: lerp(m.from.y, m.to.y, e) });
        }
        for (const [id, p] of pos) {
          const el = nodeEls.get(id);
          if (el) placeNode(el, p);
        }
        for (const s of [...staying, ...going, ...arriving]) {
          const pa = pos.get(s.edge.a);
          const pb = pos.get(s.edge.b);
          if (pa && pb) placeEdge(s.line, pa, pb);
        }
        for (const g of going) g.line.setAttribute('opacity', String(1 - e));
        for (const a of arriving) a.line.setAttribute('opacity', String(e));
      };

      // 끝 자리에 선 것을 옛 자리로 물려 놓고 출발한다. 정적으로 세운 직후라
      // 그 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다.
      draw(0);

      return tween(rotateMs, (raw) => {
        if (!alive(mine)) return;
        draw(raw);
      });
    }

    /**
     * 짚는 걸음의 얇은 운동 — 계기나 띠가 조금 아래에서 제자리로 앉는다.
     *
     * 나무는 움직이지 않는다. 그 걸음이 하는 말이 "여기에 이 수가 적힌다" 뿐이라
     * 운동도 그만큼만 한다.
     */
    function settleFlow(els: readonly SVGElement[], mine: number): Promise<void> {
      if (els.length === 0) return Promise.resolve();
      const draw = (raw: number): void => {
        const e = easeOutCubic(raw);
        for (const el of els) {
          el.setAttribute('opacity', String(e));
          el.setAttribute('transform', `translate(0,${SETTLE_RISE * (1 - e)})`);
        }
      };
      draw(0);
      return tween(SETTLE_MS, (raw) => {
        if (!alive(mine)) return;
        draw(raw);
      });
    }

    function flow(
      scene: RotateToBalanceScene,
      mark: RotateSceneMark,
      mine: number,
    ): Promise<void> {
      switch (mark.kind) {
        case 'rotate':
          return rotateFlow(scene, mark, mine);
        case 'measured':
          return settleFlow(metricEls, mine);
        case 'concluded':
          return settleFlow(stripEl ? [stripEl] : [], mine);
      }
    }

    async function render(
      next: RotateToBalanceScene,
      /** 출발 그림을 장면의 `base` 에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: RotateToBalanceScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const mark = next.mark;
      if (!mark) return;
      await flow(next, mark, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 보간 끝자리와 임시 가지·opacity·transform 을 통째로 거둔다.
      // 되돌릴 목록을 손으로 관리하면 반드시 하나를 빠뜨린다 (S-scene).
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
        if (wrap.parentElement) wrap.remove();
        container.textContent = '';
      },
    };
  },
};
