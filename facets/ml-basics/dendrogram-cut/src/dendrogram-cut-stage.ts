/**
 * dendrogram-cut-stage — 다 자란 나무 위를 가로선 하나가 미끄러진다.
 *
 * 그림의 중심은 산점도가 아니라 **가로선과 그것이 지나는 세로 가지**다. 선이
 * 어느 높이에 있느냐가 무리 수를 정하므로, 선은 왼쪽 높이 축의 손잡이이자
 * 오른쪽 무리 수 칸의 바늘이다. 선을 올리면 지나는 가지가 하나씩 줄고, 아래
 * 이름표 밑의 무리 띠가 그만큼 합쳐진다.
 *
 * 끊는 걸음에서는 선 위쪽 — 버려지는 부분 — 이 흐려지고 지나던 가지가 선 자리에서
 * 실제로 끊겨 끝이 캡으로 막힌다.
 *
 * ── 밟은 자리는 지워지지 않는다
 *
 * 오른쪽 칸에는 **밟아 본 높이마다 무리 수만큼 긴 막대**가 남는다. 가로선이 여덟
 * 자리를 훑고 나면 여덟 칸짜리 계단이 서고, 그것이 "높이를 바꾸면 무리 수가
 * 바뀐다" 를 한 화면에서 보이는 유일한 자리다. 옛 화면은 지나온 자리를 하나도
 * 남기지 않아 그 주장이 캡션의 글자로만 흘러갔다.
 *
 * 어휘를 갈라 두어 헛걸음과 살아 있는 자국이 부딪히지 않게 한다.
 *
 *   **지금 선 자리** = 채운 알약 + 진한 가로선 (`itemActive`)
 *   **지나온 자리**  = 유령 막대 (`ghostOutline`)
 *   **끊어 본 자리** = 넓은 구간과 같은 색 (`accent`) — 구간의 파선 테두리와 짝이다
 *
 * ── 화면은 걸음마다 통째로 다시 세워진다
 *
 * `render(next, prev, {animate})` 하나로 산다. 정적 그리기가 정본이고 운동은 그
 * 위를 스쳐 갈 뿐이라, 되짚기는 `animate:false` 로 곧바로 세운다. 좌표는 전부 여기서
 * 캔버스에서 역산한다 — 장면이 쥔 것은 잎 이름표와 합침 목록이라는 **구조**뿐이다
 * (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  bandsOf,
  captionOf,
  clustersAt,
  crossedAt,
  currentCutOf,
  glideFromOf,
  ladderOf,
  treeOf,
  type DendrogramCutScene,
  type DendrogramTree,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정한다. 마운트한 뒤 바뀌지 않는다 (S-view). */
const CANVAS_H = 314;

const PLOT_TOP = 38;
const PLOT_H = 236;
const PLOT_BOTTOM = PLOT_TOP + PLOT_H;
const AXIS_X = 46;
/** 오른쪽에 무리 수 칸이 앉을 자리. */
const RIGHT_PAD = 58;
const PLOT_RIGHT = PIECE_CANVAS_W - 12;
const LEAF_LEFT = AXIS_X + 20;
const LEAF_RIGHT = PIECE_CANVAS_W - RIGHT_PAD;
const LEAF_BASE_Y = PLOT_BOTTOM + 16;
const BRACKET_Y = PLOT_BOTTOM + 23;
const BRACKET_H = 4;
const CAPTION_Y = 17;
const HEADER_Y = 30;

/** 눈금 글자가 겹치지 않는 최소 간격. 낮은 합침이 몰려 있으면 눈금만 남긴다. */
const TICK_MIN_GAP = 12;
/** 끊긴 자리에 벌어지는 틈. 가로선이 그 틈에 눕는다. */
const SEVER_GAP = 12;
const TREE_W = 1.7;
const HILITE_W = 3.4;

const SLIDE_MIN_MS = 200;
const SLIDE_SPAN_MS = 430;
const BAND_MS = 380;
const FRAME_MS = 16;

const PILL_CX = (LEAF_RIGHT + PLOT_RIGHT) / 2;
const PILL_W = 40;
const PILL_H = 22;

/** 밟은 자리의 계단. 알약과 같은 가로 구간을 쓴다 — 한 칸으로 읽히게. */
const LADDER_X = PILL_CX - PILL_W / 2;
const LADDER_MAX = PILL_W;
const LADDER_MIN = 3;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clear(g: SVGGElement): void {
  while (g.firstChild) g.removeChild(g.firstChild);
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

export const dendrogramCutStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<DendrogramCutScene> {
    const canvas = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // viewBox 는 러너(`layout-builder`)가 이미 같은 값으로 넣어 두었다.
    // 여기서 다시 세우면 세로가 동적인 그림으로 읽힌다 (S-view — 세로는 불변).

    const root = el('g', {});
    canvas.appendChild(root);
    const gBands = el('g', {});
    const gTree = el('g', {});
    const gLadder = el('g', {});
    const gCut = el('g', {});
    const gChrome = el('g', {});
    for (const g of [gBands, gTree, gLadder, gCut, gChrome]) root.appendChild(g);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 마디를 지난다. `destroy` 나 다음 걸음이 그 가운데 오면 남은
     * 마디가 이미 갈린 화면에 쓰므로, 마디마다 자기 번호가 아직 유효한지 보고
     * 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition
     * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
     */
    function tween(duration: number, mine: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = duration <= 0 ? 1 : Math.min(1, (Date.now() - started) / duration);
          onFrame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 자리 셈. 장면의 구조에서 캔버스를 역산한다 (S-piece).

    function leafCountOf(scene: DendrogramCutScene): number {
      return Math.max(1, scene.leafIds.length);
    }

    function leafGap(count: number): number {
      return (LEAF_RIGHT - LEAF_LEFT) / count;
    }

    function leafX(count: number, index: number): number {
      return LEAF_LEFT + leafGap(count) * (index + 0.5);
    }

    function yOf(tree: DendrogramTree, h: number): number {
      const top = tree.topHeight || 1;
      return PLOT_BOTTOM - (Math.max(0, h) / top) * PLOT_H;
    }

    /** 마디의 위쪽 끝. 뿌리는 위가 열려 있어 그림의 천장까지 간다. */
    function upperY(tree: DendrogramTree, upper: number | null): number {
      return upper === null ? PLOT_TOP : yOf(tree, upper);
    }

    /**
     * 마디마다의 가로 자리를 **한 번에** 셈한다.
     *
     * 그리면서 이웃의 자리를 되읽으면 순회 순서가 곧 숨은 상태가 된다. `nodes` 는
     * 자식이 늘 부모보다 앞서므로 한 번 훑으면 전부 채워진다.
     */
    function placesOf(tree: DendrogramTree, count: number): Map<string, number> {
      const x = new Map<string, number>();
      tree.order.forEach((id, i) => x.set(id, leafX(count, i)));
      for (const node of tree.nodes) {
        if (node.kids === null) continue;
        x.set(node.id, ((x.get(node.kids[0]) ?? 0) + (x.get(node.kids[1]) ?? 0)) / 2);
      }
      return x;
    }

    /**
     * 잎마다의 색.
     *
     * 색판의 크기는 **바탕 자료의 잎 수**로 한 번에 정한다. 지금까지 드러난 수로
     * 정하면 무리가 갈릴 때 hue 간격이 통째로 갈려 이미 칠한 색이 바뀐다 (프로토콜).
     */
    function paletteOf(scene: DendrogramCutScene): readonly string[] {
      return categorical(leafCountOf(scene), 'vivid');
    }

    // ── 그리기 ──────────────────────────────────────────────────────────────

    function stroke(
      g: SVGGElement,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string,
      width: number,
    ): void {
      g.appendChild(
        el('line', {
          x1,
          y1,
          x2,
          y2,
          stroke: color,
          'stroke-width': width,
          'stroke-linecap': 'round',
        }),
      );
    }

    /** 자른 선 위쪽은 버려지는 부분이라 흐려진다. 끊었을 때만. */
    function inkAt(y: number, cutY: number | null): string {
      return cutY !== null && y < cutY ? c.border : c.text;
    }

    function drawStem(x: number, yBottom: number, yTop: number, cutY: number | null): void {
      if (cutY === null || cutY <= yTop || cutY >= yBottom) {
        stroke(gTree, x, yBottom, x, yTop, inkAt((yBottom + yTop) / 2, cutY), TREE_W);
        return;
      }
      stroke(gTree, x, yBottom, x, cutY + SEVER_GAP / 2, c.text, TREE_W);
      stroke(gTree, x, cutY - SEVER_GAP / 2, x, yTop, c.border, TREE_W);
    }

    function drawTree(
      scene: DendrogramCutScene,
      tree: DendrogramTree | null,
      cutY: number | null,
    ): void {
      clear(gTree);
      const count = leafCountOf(scene);

      stroke(gTree, AXIS_X, PLOT_BOTTOM, PLOT_RIGHT, PLOT_BOTTOM, c.border, 1);
      // 나무가 서기 전에는 선언이 준 차례로, 선 뒤에는 나무가 정한 차례로 늘어선다.
      const labels = tree === null ? scene.leafIds : tree.order;
      labels.forEach((id, i) => {
        const label = el('text', {
          x: leafX(count, i),
          y: LEAF_BASE_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        label.textContent = id;
        gTree.appendChild(label);
      });
      if (tree === null) return;

      stroke(gTree, AXIS_X, PLOT_BOTTOM, AXIS_X, PLOT_TOP, c.border, 1);
      let lastLabelY = Infinity;
      const marks = [0, ...tree.nodes.map((n) => n.height).filter((h) => h > 0)].sort(
        (a, b) => a - b,
      );
      for (const h of marks) {
        const y = yOf(tree, h);
        stroke(gTree, AXIS_X - 4, y, AXIS_X + 3, y, c.border, 1);
        if (lastLabelY - y < TICK_MIN_GAP) continue;
        lastLabelY = y;
        const label = el('text', {
          x: AXIS_X - 8,
          y: y + 3.5,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        label.textContent = h.toFixed(2);
        gTree.appendChild(label);
      }

      const x = placesOf(tree, count);
      for (const node of tree.nodes) {
        drawStem(x.get(node.id) ?? 0, yOf(tree, node.height), upperY(tree, node.upper), cutY);
      }
      for (const node of tree.nodes) {
        if (node.kids === null) continue;
        const y = yOf(tree, node.height);
        stroke(
          gTree,
          x.get(node.kids[0]) ?? 0,
          y,
          x.get(node.kids[1]) ?? 0,
          y,
          inkAt(y, cutY),
          TREE_W,
        );
      }
    }

    function drawBands(
      scene: DendrogramCutScene,
      tree: DendrogramTree | null,
      grow: number,
    ): void {
      clear(gBands);
      if (tree === null || grow <= 0) return;
      const width = (PLOT_RIGHT - AXIS_X) * grow;
      for (const band of bandsOf(scene)) {
        const yTop = yOf(tree, band.hi);
        const yBot = yOf(tree, band.lo);
        gBands.appendChild(
          el('rect', {
            x: AXIS_X,
            y: yTop,
            width,
            height: Math.max(0, yBot - yTop),
            fill: c.subtreeShadeRight,
          }),
        );
        // 여기서 실제로 끊어 봤다는 표식 — 테두리는 짚음의 축이다.
        if (!band.severed) continue;
        gBands.appendChild(
          el('rect', {
            x: AXIS_X,
            y: yTop,
            width,
            height: Math.max(0, yBot - yTop),
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 3',
          }),
        );
      }
    }

    /**
     * 밟아 본 자리의 계단. 막대가 길수록 무리가 많다.
     *
     * 이 조각의 주장이 **높이와 무리 수의 견줌**이라 지나온 자리가 남아 있어야
     * "옮기면 바뀐다" 가 읽힌다. 길이는 지금 알약에 뜨는 수와 **같은 나무**에서
     * 나온다.
     */
    function drawLadder(scene: DendrogramCutScene, tree: DendrogramTree | null): void {
      clear(gLadder);
      if (tree === null) return;
      const count = leafCountOf(scene);
      for (const mark of ladderOf(scene)) {
        const y = yOf(tree, mark.height);
        const len = Math.max(LADDER_MIN, (clustersAt(tree, mark.height) / count) * LADDER_MAX);
        stroke(
          gLadder,
          LADDER_X,
          y,
          LADDER_X + len,
          y,
          mark.severed ? c.accent : c.ghostOutline,
          mark.severed ? 3 : 2,
        );
      }
    }

    function drawCut(
      scene: DendrogramCutScene,
      tree: DendrogramTree | null,
      height: number | null,
      severed: boolean,
    ): void {
      clear(gCut);
      if (tree === null || height === null) return;
      const count = leafCountOf(scene);
      const x = placesOf(tree, count);
      const palette = paletteOf(scene);
      const y = yOf(tree, height);
      const gap = leafGap(count);
      const crossed = crossedAt(tree, height);

      for (const node of crossed) {
        const nx = x.get(node.id) ?? 0;
        const color = palette[node.spanFrom % palette.length] ?? c.text;
        const bottom = yOf(tree, node.height);
        if (severed) {
          const cutEnd = y + SEVER_GAP / 2;
          stroke(gCut, nx, bottom, nx, cutEnd, color, HILITE_W);
          stroke(gCut, nx - 7, cutEnd, nx + 7, cutEnd, color, 3);
        } else {
          stroke(gCut, nx, bottom, nx, upperY(tree, node.upper), color, HILITE_W);
          gCut.appendChild(
            el('circle', {
              cx: nx,
              cy: y,
              r: 4.5,
              fill: color,
              stroke: c.bg,
              'stroke-width': 1.4,
            }),
          );
        }
        gCut.appendChild(
          el('rect', {
            x: leafX(count, node.spanFrom) - gap * 0.36,
            y: BRACKET_Y,
            width: leafX(count, node.spanTo) - leafX(count, node.spanFrom) + gap * 0.72,
            height: BRACKET_H,
            rx: BRACKET_H / 2,
            fill: color,
          }),
        );
      }

      const blade = el('line', {
        x1: AXIS_X - 6,
        y1: y,
        x2: PLOT_RIGHT,
        y2: y,
        stroke: c.itemActive,
        'stroke-width': severed ? 3 : 2.2,
        'stroke-linecap': 'round',
      });
      if (!severed) blade.setAttribute('stroke-dasharray', '7 4');
      gCut.appendChild(blade);

      gCut.appendChild(
        el('polygon', {
          points: `${AXIS_X + 1},${y} ${AXIS_X + 10},${y - 6} ${AXIS_X + 10},${y + 6}`,
          fill: c.itemActive,
        }),
      );
      const readout = el('text', {
        x: AXIS_X + 15,
        y: y - 6,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.itemActive,
      });
      readout.textContent = height.toFixed(2);
      gCut.appendChild(readout);

      gCut.appendChild(
        el('rect', {
          x: PILL_CX - PILL_W / 2,
          y: y - PILL_H / 2,
          width: PILL_W,
          height: PILL_H,
          rx: 5,
          fill: c.itemActive,
        }),
      );
      const pillCount = el('text', {
        x: PILL_CX,
        y: y + 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': '600',
        fill: c.stateInk,
      });
      pillCount.textContent = String(crossed.length);
      gCut.appendChild(pillCount);
    }

    /**
     * 캡션과 머리글.
     *
     * 재건 밖에 두지 않는다 — 고정 자리의 글자를 명령으로만 고치면 되짚었을 때 앞
     * 걸음의 문안이 남는다 (프로토콜 4 절). 걸음마다 통째로 다시 짓는다.
     */
    function drawChrome(scene: DendrogramCutScene): void {
      clear(gChrome);

      const caption = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      caption.textContent = captionText(scene);
      gChrome.appendChild(caption);

      const headHeight = el('text', {
        x: AXIS_X,
        y: HEADER_Y,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      headHeight.textContent = t('label.height', 'height');
      gChrome.appendChild(headHeight);

      const headClusters = el('text', {
        x: PILL_CX,
        y: HEADER_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      headClusters.textContent = t('label.clusters', 'clusters');
      gChrome.appendChild(headClusters);
    }

    function captionText(scene: DendrogramCutScene): string {
      const caption = captionOf(scene);
      if (caption === null) return '';
      switch (caption.kind) {
        case 'grown':
          return t('caption.grown', 'The tree is already fully grown.');
        case 'cut':
          return t('caption.cut', 'Cut height {h} — clusters {n}', {
            h: caption.height.toFixed(2),
            n: caption.clusters,
          });
        case 'bands':
          return t('caption.bands', 'Wide empty bands between the crossbars: {n}', {
            n: caption.count,
          });
        case 'settled':
          return t('caption.settled', 'Cut inside a wide band — clusters {n}', {
            n: caption.clusters,
          });
        case 'done':
          return t('caption.done', 'The tree does not choose. A person does.');
      }
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다. **`step` 을 읽지 않는다** — 머무는 것은
     * 전부 자취에서 나오므로, 어느 걸음에서 오든 같은 화면이 선다 (S-scene).
     */
    function drawStatic(scene: DendrogramCutScene): void {
      const tree = treeOf(scene);
      const cut = currentCutOf(scene);
      const severedY = tree !== null && cut !== null && cut.severed ? yOf(tree, cut.height) : null;
      drawBands(scene, tree, 1);
      drawTree(scene, tree, severedY);
      drawLadder(scene, tree);
      drawCut(scene, tree, cut?.height ?? null, cut?.severed ?? false);
      drawChrome(scene);
    }

    // ── 운동 ────────────────────────────────────────────────────────────────

    async function slide(scene: DendrogramCutScene, mine: number): Promise<void> {
      const tree = treeOf(scene);
      const cut = currentCutOf(scene);
      if (tree === null || cut === null) return;
      const from = glideFromOf(scene);
      // 미끄러지는 동안에는 아직 끊기지 않았다 — 가지도 온전하고 위도 흐려지지 않는다.
      drawTree(scene, tree, null);
      const travel = Math.abs(yOf(tree, cut.height) - yOf(tree, from));
      const duration = SLIDE_MIN_MS + SLIDE_SPAN_MS * Math.min(1, travel / PLOT_H);
      await tween(duration, mine, (p) => {
        // 끝에서는 보간값이 아니라 목표값을 그대로 쓴다 (부동소수 끝자리).
        const h = p >= 1 ? cut.height : from + (cut.height - from) * ease(p);
        drawCut(scene, tree, h, false);
      });
    }

    async function growBands(scene: DendrogramCutScene, mine: number): Promise<void> {
      const tree = treeOf(scene);
      if (tree === null) return;
      await tween(BAND_MS, mine, (p) => {
        drawBands(scene, tree, p >= 1 ? 1 : ease(p));
      });
    }

    function flowFor(scene: DendrogramCutScene, mine: number): Promise<void> {
      switch (scene.step) {
        case 'glide':
        case 'sever':
          return slide(scene, mine);
        case 'bands':
          return growBands(scene, mine);
        // 나무는 다 자란 채로 나타나고 (자라는 과정은 이 조각의 주장이 아니다),
        // 마지막 걸음은 캡션만 바꾼다. 흐를 것이 없다.
        default:
          return Promise.resolve();
      }
    }

    async function render(
      next: DendrogramCutScene,
      _prev: DendrogramCutScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flowFor(next, mine);
      if (!alive(mine)) return;

      // 운동이 남긴 속성과 보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
