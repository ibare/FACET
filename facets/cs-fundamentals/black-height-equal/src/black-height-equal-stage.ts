/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 그 view 는 트리 골격과 커서까지는
 * 주지만 걸음마다 바뀌는 캡션과, 길마다 쌓이는 검은 셈을 얹을 자리가 없다.
 * 이 조각은 "지금 몇 개째를 세고 있는가" 가 그림의 절반이라 같은 캔버스 안에
 * 그 둘이 있어야 한다 (원칙 6 의 예외 조건).
 *
 * black-height-equal-stage — 레드-블랙 트리를 그리고, 커서가 뿌리 아래 한 경로를
 * 따라 내려갔다가 다시 뿌리로 돌아오는 움직임을 SVG 좌표 이동으로 보여 준다.
 *
 * 노드 채움색은 그 자리의 값(빨강/검정)이다 — 방문 여부로 다시 칠하지 않는다.
 * "지금 어디를 보고 있는지" · "셈에 들어갔는지" 는 커서 링으로만 표현한다.
 *
 * ── 장면(Scene) 방식
 *
 * 걸음마다 부르는 메서드를 두지 않고 `render(next, prev, { animate })` 하나가
 * **그 장면의 화면 전체**를 세운다 (S-scene). 되돌릴 명령이 없으므로 어느 걸음으로
 * 건너뛰어도 같은 화면이 선다 — `returnCursorToRoot` 같은 역명령이 통째로 없어졌다.
 *
 * 특히 이 조각은 **쌓인 배지가 곧 주장**이다. 네 길이 각각 남긴 검은 수가 화면에
 * 함께 있어야 "길이는 달라도 셈은 같다" 가 보인다. 그래서 배지는 흐르며 생기는
 * 것이 아니라 **정적 그리기가 매번 다시 세운다.** 흐름은 그 위에 얹힌 얇은 한
 * 겹이다 — 아직 앉기 전으로 잠깐 되물렸다 제자리로 돌려놓는다.
 *
 * 화면에 뜨는 수는 전부 장면의 `trail` · `settled` 에서 나온다. 발신이 실어 온
 * `runningCount` · `blackCount` 는 쓰지 않는다 — 캡션의 셈과 배지의 셈이 한
 * 출처여야 화면이 스스로 참이다 (`scene.ts`).
 */

import type {
  CanvasView,
  SceneRenderer,
  Theme,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { getColors, makeTranslator, PIECE_CANVAS_W, fonts, fontSizes } from '@ffacet/core/runtime';
import { countBlack } from './scene.js';
import type {
  BlackHeightEqualScene,
  BlackHeightSceneColor,
  BlackHeightSceneNode,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Placed = {
  id: string;
  kind: 'node' | 'nil';
  x: number;
  y: number;
  value?: number;
  color?: BlackHeightSceneColor;
};

type PlacedEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'real' | 'nil';
};

type Point = { x: number; y: number };

const H = 310;
const SIDE_MIN = 30;
const TOP_PAD = 40;
const ROW_GAP = 62;
const NODE_R = 20;
const NIL_HALF_W = 15;
const NIL_HALF_H = 10;
const CURSOR_R = NODE_R + 7;
const BADGE_OFFSET_Y = 30;
const BADGE_HALF_W = 14;
const BADGE_HALF_H = 10;
const CAPTION_Y = H - 20;

/** 커서가 한 자리 내려가는 시간. */
const WALK_MS = 260;
/** 커서가 뿌리로 돌아오며 배지가 앉는 시간. 한 걸음이라 한 시계로 돈다. */
const SETTLE_MS = 300;
/** 배지 전부가 한 번 부푸는 시간. */
const EMPHASIS_MS = 440;
const FRAME_MS = 16;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 자리 문자열은 정적 경로와 흐름의 끝이 같은 함수에서 나와야 한 글자도 안 갈린다. */
function translate(x: number, y: number): string {
  return `translate(${x}, ${y})`;
}

/**
 * 트리를 실제로 따라 내려가며 좌표를 매긴다. 자식이 둘 다 없는 노드는 nil
 * 자리 하나를 자기 바로 아래 가운데 둔다 — algorithm.ts 의 buildPaths 가
 * 세는 경로와 같은 자리를 가리키도록 맞춘다.
 */
function layoutTree(root: BlackHeightSceneNode): { nodes: Placed[]; edges: PlacedEdge[] } {
  const nodes: Placed[] = [];
  const edges: PlacedEdge[] = [];

  function place(node: BlackHeightSceneNode, xMin: number, xMax: number, depth: number): Placed {
    const x = (xMin + xMax) / 2;
    const y = TOP_PAD + depth * ROW_GAP;
    const entry: Placed = { id: node.id, kind: 'node', x, y, value: node.value, color: node.color };
    nodes.push(entry);

    const isLeaf = !node.left && !node.right;
    if (isLeaf) {
      const ny = TOP_PAD + (depth + 1) * ROW_GAP;
      nodes.push({ id: node.id, kind: 'nil', x, y: ny });
      edges.push({ x1: x, y1: y, x2: x, y2: ny, kind: 'nil' });
      return entry;
    }

    if (node.left) {
      const c = place(node.left, xMin, x, depth + 1);
      edges.push({ x1: x, y1: y, x2: c.x, y2: c.y, kind: 'real' });
    } else {
      const nx = (xMin + x) / 2;
      const ny = TOP_PAD + (depth + 1) * ROW_GAP;
      nodes.push({ id: node.id, kind: 'nil', x: nx, y: ny });
      edges.push({ x1: x, y1: y, x2: nx, y2: ny, kind: 'nil' });
    }

    if (node.right) {
      const c = place(node.right, x, xMax, depth + 1);
      edges.push({ x1: x, y1: y, x2: c.x, y2: c.y, kind: 'real' });
    } else {
      const nx = (x + xMax) / 2;
      const ny = TOP_PAD + (depth + 1) * ROW_GAP;
      nodes.push({ id: node.id, kind: 'nil', x: nx, y: ny });
      edges.push({ x1: x, y1: y, x2: nx, y2: ny, kind: 'nil' });
    }

    return entry;
  }

  place(root, SIDE_MIN, PIECE_CANVAS_W - SIDE_MIN, 0);
  return { nodes, edges };
}

export const blackHeightEqualStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<BlackHeightEqualScene> {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    params.canvas.textContent = '';
    const theme: Theme | undefined = params.theme;
    const colors = getColors(theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;

    const edgesG = el('g');
    const nilG = el('g');
    const nodesG = el('g');
    const cursorG = el('g');
    const badgesG = el('g');
    const captionG = el('g');
    svg.append(edgesG, nilG, nodesG, cursorG, badgesG, captionG);

    // ── 정적 그리기가 다시 채우는 손잡이들. 자리는 장면의 `root` 에서만 나온다.
    const positions = new Map<string, Point>();
    const badgeByNilId = new Map<string, SVGGElement>();

    // 커서와 캡션은 **재건 밖**이다 — mount 때 한 번 짓고 정적 그리기가 속성만
    // 덮어쓴다. 그래서 세대 빗장이 필요하다 (S-scene): 살아남은 옛 흐름이 이
    // 둘에 쓰면 살아 있는 화면을 덮는다.
    const cursorRing = el('circle', {
      r: CURSOR_R,
      fill: 'none',
      stroke: colors.accent,
      'stroke-width': 3,
    });
    cursorG.appendChild(cursorRing);

    const captionText = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    captionG.appendChild(captionText);

    // ── 시간 자원. destroy 에서 모두 거둔다 (S-view).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    /**
     * 기다리다 만 것을 깨우는 자리. 타이머를 거두는 것만으로는 모자란다 — 취소된
     * tick 은 아예 불리지 않아 promise 를 풀 길이 사라지고, 러너가 `render` 의
     * Promise 를 기다리므로 걸음이 영영 돌아오지 않는다 (S-view).
     */
    const waiters = new Set<() => void>();
    let disposed = false;

    let gen = 0;
    const alive = (myGen: number): boolean => !disposed && myGen === gen;

    /**
     * 시간 기반 tick 애니메이션.
     *
     * 스스로 다음 회차를 예약하는 루프이므로 세대가 갈리거나 destroy 되면 멈춘다 —
     * 떨어져 나간 노드를 16ms 마다 건드리면 유한하더라도 "관찰 가능한 뒷일" 이
     * 남는다 (S-view).
     */
    const animate = (ms: number, onTick: (t: number) => void, myGen: number): Promise<void> =>
      new Promise((resolve) => {
        if (ms <= 0 || disposed) {
          if (alive(myGen)) onTick(1);
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(myGen)) {
            finish();
            return;
          }
          const t = Math.min(1, (Date.now() - start) / ms);
          onTick(t);
          if (t >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });

    function nodeFill(color: BlackHeightSceneColor): string {
      return color === 'red' ? colors.danger : colors.primary;
    }
    function nodeInk(color: BlackHeightSceneColor): string {
      return color === 'red' ? colors.stateInk : colors.textInverse;
    }

    /** 장면이 말할 것을 문자로 만든다. 장면은 문안도 수도 모른다 (C10). */
    function captionFor(scene: BlackHeightEqualScene): string {
      const c = scene.caption;
      if (!c) return '';
      switch (c.kind) {
        case 'visit': {
          // 지금까지의 셈은 길에서 센다 — 배지와 같은 출처다.
          const last = scene.trail[scene.trail.length - 1];
          const n = countBlack(scene.trail);
          if (!last) return '';
          if (last.kind === 'nil') {
            return tr('caption.visitNil', 'Nil — always counts as black. Running total {n}.', { n });
          }
          return last.counted
            ? tr('caption.visitBlack', 'Black — count it. Running total {n}.', { n })
            : tr('caption.visitRed', 'Red — skip it. Running total stays {n}.', { n });
        }
        case 'settled': {
          const just = scene.settled[scene.settled.length - 1];
          if (!just) return '';
          return tr('caption.settled', 'This path settles at {n} black.', { n: just.blackCount });
        }
        case 'allSettled': {
          // 네 배지가 같은 수라는 것이 이 걸음의 말이다. 그 수를 따로 실어 오지
          // 않고 배지에서 읽는다 — 하나라도 달랐다면 화면이 스스로 어긋난다.
          const first = scene.settled[0];
          if (!first) return '';
          return tr('caption.allSettled', 'Every path settles at the same number — {n} black.', {
            n: first.blackCount,
          });
        }
        case 'rewind':
          return tr(
            'caption.rewind',
            'Back to the root — watching it again, one step at a time.',
            {},
          );
      }
    }


    /** 커서를 그 자리에 세운다. 정적 경로와 흐름의 끝이 같은 문자열을 쓴다. */
    function setCursor(at: Point, counted: boolean, hidden: boolean): void {
      cursorG.setAttribute('transform', translate(at.x, at.y));
      if (hidden) cursorG.setAttribute('opacity', '0');
      else cursorG.removeAttribute('opacity');
      cursorRing.setAttribute('stroke', counted ? colors.accent : colors.textMuted);
      // 되돌릴 때는 값을 다시 쓰지 않고 지운다 — 속성의 유무 하나가 되짚기
      // 판정을 가른다 (프로토콜 4 절).
      if (counted) cursorRing.removeAttribute('stroke-dasharray');
      else cursorRing.setAttribute('stroke-dasharray', '4 3');
    }

    /** 뿌리 자리. 커서가 숨거나 돌아오는 곳이다. */
    function rootPoint(scene: BlackHeightEqualScene): Point | null {
      if (!scene.root) return null;
      return positions.get(`node:${scene.root.id}`) ?? null;
    }

    /** 길의 `i` 번째 자리. 범위 밖이면 `null`. */
    function trailPoint(scene: BlackHeightEqualScene, i: number): Point | null {
      const s = scene.trail[i];
      if (!s) return null;
      return positions.get(`${s.kind}:${s.id}`) ?? null;
    }

    /** 배지 하나. 스케일이 가운데를 물도록 자리를 transform 으로 준다. */
    function drawBadge(at: Point, count: number, ringed: boolean): SVGGElement {
      const chip = el('g', { transform: translate(at.x, at.y + BADGE_OFFSET_Y) });
      const rect = el('rect', {
        x: -BADGE_HALF_W,
        y: -BADGE_HALF_H,
        width: BADGE_HALF_W * 2,
        height: BADGE_HALF_H * 2,
        rx: 4,
        fill: colors.accent,
      });
      // 매듭지어진 뒤에는 테두리가 남는다 — "넷이 같다" 는 강조가 되짚어도
      // 살아 있어야 한다 (S-scene PREFER).
      if (ringed) {
        rect.setAttribute('stroke', colors.text);
        rect.setAttribute('stroke-width', '1.5');
      }
      chip.appendChild(rect);
      const label = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.stateInk,
      });
      label.textContent = String(count);
      chip.appendChild(label);
      badgesG.appendChild(chip);
      return chip;
    }

    /**
     * 그 장면의 화면 **전체**를 세운다.
     *
     * 늘 비우고 다시 그린다. 되짚기가 지나온 걸음을 되밟을 필요가 없는 것이 이
     * 함수 하나 때문이다 — 쌓인 배지도, 커서의 자리와 그 링의 결도 전부 장면이
     * 말하는 대로 여기서 다시 선다.
     */
    function drawStatic(scene: BlackHeightEqualScene): void {
      edgesG.textContent = '';
      nilG.textContent = '';
      nodesG.textContent = '';
      badgesG.textContent = '';
      positions.clear();
      badgeByNilId.clear();
      captionText.textContent = captionFor(scene);

      if (!scene.root) {
        cursorG.setAttribute('opacity', '0');
        return;
      }

      const { nodes, edges } = layoutTree(scene.root);

      for (const e of edges) {
        const line = el('line', {
          x1: e.x1,
          y1: e.y1,
          x2: e.x2,
          y2: e.y2,
          stroke: e.kind === 'real' ? colors.border : colors.textMuted,
          'stroke-width': 2,
        });
        if (e.kind === 'nil') line.setAttribute('stroke-dasharray', '3 3');
        edgesG.appendChild(line);
      }

      for (const n of nodes) {
        positions.set(`${n.kind}:${n.id}`, { x: n.x, y: n.y });
        if (n.kind === 'node' && n.color !== undefined && n.value !== undefined) {
          const g = el('g');
          g.appendChild(
            el('circle', {
              cx: n.x,
              cy: n.y,
              r: NODE_R,
              fill: nodeFill(n.color),
              stroke: colors.border,
              'stroke-width': 1,
            }),
          );
          const label = el('text', {
            x: n.x,
            y: n.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: nodeInk(n.color),
          });
          label.textContent = String(n.value);
          g.appendChild(label);
          nodesG.appendChild(g);
        } else if (n.kind === 'nil') {
          const g = el('g');
          g.appendChild(
            el('rect', {
              x: n.x - NIL_HALF_W,
              y: n.y - NIL_HALF_H,
              width: NIL_HALF_W * 2,
              height: NIL_HALF_H * 2,
              rx: 3,
              fill: colors.bgSubtle,
              stroke: colors.primary,
              'stroke-width': 1.5,
            }),
          );
          const label = el('text', {
            x: n.x,
            y: n.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.primary,
          });
          label.textContent = 'NIL';
          g.appendChild(label);
          nilG.appendChild(g);
        }
      }

      // 길들이 남긴 셈 — 되짚어도 살아나야 하는 것이 바로 이것이다.
      for (const path of scene.settled) {
        const at = positions.get(`nil:${path.nilId}`);
        if (!at) continue;
        badgeByNilId.set(path.nilId, drawBadge(at, path.blackCount, scene.allSettled));
      }

      // 커서.
      const root = rootPoint(scene);
      if (!root) {
        cursorG.setAttribute('opacity', '0');
        return;
      }
      if (scene.cursorAt === 'walking') {
        const last = scene.trail[scene.trail.length - 1];
        const at = trailPoint(scene, scene.trail.length - 1);
        if (last && at) {
          setCursor(at, last.counted, false);
          return;
        }
      }
      setCursor(root, true, scene.cursorAt === 'hidden');
    }

    /** 커서가 한 자리 내려간다. 출발 자리는 길의 바로 앞 자리다 (`prev` 가 아니다). */
    async function runWalk(scene: BlackHeightEqualScene, myGen: number): Promise<void> {
      const to = trailPoint(scene, scene.trail.length - 1);
      if (!to) return;
      // 길의 첫 자리면 뿌리에서 출발한다 — 앞 걸음이 커서를 거기 두고 갔다.
      const from = trailPoint(scene, scene.trail.length - 2) ?? rootPoint(scene);
      if (!from) return;
      await animate(
        WALK_MS,
        (t) => {
          const x = t >= 1 ? to.x : from.x + (to.x - from.x) * t;
          const y = t >= 1 ? to.y : from.y + (to.y - from.y) * t;
          cursorG.setAttribute('transform', translate(x, y));
        },
        myGen,
      );
    }

    /**
     * 길이 맺힌다 — 배지가 앉고 커서가 뿌리로 돌아온다.
     *
     * 둘은 한 걸음의 한 뜻이라 **시계를 나누지 않는다.** 정적 그리기가 이미 배지를
     * 세워 두었으므로 아직 앉기 전으로 되물렸다 제자리로 돌려놓는다.
     */
    async function runSettle(scene: BlackHeightEqualScene, myGen: number): Promise<void> {
      const just = scene.settled[scene.settled.length - 1];
      if (!just) return;
      const from = positions.get(`nil:${just.nilId}`);
      const to = rootPoint(scene);
      if (!from || !to) return;
      const chip = badgeByNilId.get(just.nilId) ?? null;
      if (chip) chip.setAttribute('opacity', '0');

      await animate(
        SETTLE_MS,
        (t) => {
          const x = t >= 1 ? to.x : from.x + (to.x - from.x) * t;
          const y = t >= 1 ? to.y : from.y + (to.y - from.y) * t;
          cursorG.setAttribute('transform', translate(x, y));
          if (chip) {
            // 앞 절반 동안 배지가 떠오른다. 끝에서는 속성을 지운다 — 값을 다시
            // 쓰면 정적으로 세운 화면과 속성 하나가 달라진다 (프로토콜 4 절).
            if (t >= 1) chip.removeAttribute('opacity');
            else chip.setAttribute('opacity', String(Math.min(1, t * 2)));
          }
        },
        myGen,
      );
    }

    /** 배지 전부가 한 번 부푼다. 크기 변화라 opacity 전환이 아니다. */
    async function runEmphasis(scene: BlackHeightEqualScene, myGen: number): Promise<void> {
      const chips: { chip: SVGGElement; at: Point }[] = [];
      for (const path of scene.settled) {
        const chip = badgeByNilId.get(path.nilId);
        const at = positions.get(`nil:${path.nilId}`);
        if (chip && at) chips.push({ chip, at });
      }
      if (chips.length === 0) return;

      await animate(
        EMPHASIS_MS,
        (t) => {
          // 끝에서는 보간값이 아니라 목표값을 그대로 쓴다 — sin(π) 가 0 이 아니라
          // 1.2e-16 이라 문자열이 정적 그리기와 갈린다 (프로토콜 4 절).
          for (const { chip, at } of chips) {
            const base = translate(at.x, at.y + BADGE_OFFSET_Y);
            if (t >= 1) {
              chip.setAttribute('transform', base);
              continue;
            }
            const s = 1 + 0.3 * Math.sin(t * Math.PI);
            chip.setAttribute('transform', `${base} scale(${s})`);
          }
        },
        myGen,
      );
    }

    async function render(
      next: BlackHeightEqualScene,
      /** 흐를 것을 `step` 이 말하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: BlackHeightEqualScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const myGen = gen;
      drawStatic(next);

      // 되짚기는 여기서 끝. 타이머도 프레임도 걸지 않는다.
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'walk':
          await runWalk(next, myGen);
          break;
        case 'settle':
          await runSettle(next, myGen);
          break;
        case 'emphasize':
          await runEmphasis(next, myGen);
          break;
      }

      // 흐름이 끝나면 그 장면을 통째로 다시 세운다 — 흐르며 선 화면과 곧바로 세운
      // 화면이 속성 하나까지 같아진다 (S-scene). 옛 세대면 손대지 않고 물러난다.
      if (!alive(myGen)) return;
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        disposed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        positions.clear();
        badgeByNilId.clear();
        svg.textContent = '';
      },
    };
  },
};
