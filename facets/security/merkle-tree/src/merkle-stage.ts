/**
 * merkle-stage View — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * 이 조각의 동사는 **접힌다** 이므로, 값이 실제로 위로 올라가야 한다 (S-piece).
 * 잎의 해시가 복제되어 부모 자리로 이동하고, 도착한 뒤에야 그 자리에 값이 나타난다.
 * 위층 마디를 그냥 페이드인시키면 "접힌다" 가 "생긴다" 가 된다.
 *
 * 잎은 제자리에 남고 복제본만 올라간다 — 해시 트리의 실제 동작이 그렇다. 아래 것이
 * 사라져 위가 되는 게 아니라, 아래를 재료로 위가 새로 생긴다.
 *
 * 잎 하나가 바뀐 뒤에는 그 경로만 다시 올라간다. **다른 가지가 움직이지 않는
 * 것**이 이 조각이 말하는 전부라, 두 번째 상승의 범위가 곧 논증이다.
 *
 * ── 이행이 고친 화면 하나 — 견줄 짝이 사라지고 있었다 (함정 7)
 *
 * 옛 화면은 갈린 마디의 `textContent` 를 새 값으로 **갈아 끼웠다.** 같은 자리에 두
 * 답을 겹쳐 실은 것이라 뒤엣것이 앞엣것을 지웠고, 완주 화면에는 붉은 글자만 남아
 * "무엇에서 무엇으로 갈렸는지" 를 볼 수 없었다. 붉은 칠은 코드가 주장하는 것이지
 * 그림이 보이는 것이 아니었다.
 *
 * 지금은 갈린 마디가 값 **둘**을 갖는다 — 옛 값이 제자리에서 밀려 올라가며 취소선이
 * 그어지고 그 아래 새 값이 들어선다. 성한 마디는 값이 하나뿐인데, 안 그려서가 아니라
 * `before` 와 `after` 가 실제로 같아서다 (`scene.ts` 의 `MerkleValue`). 그래서 완주
 * 화면에 *갈린 한 줄*과 *성한 옆 가지*가 견줄 수 있는 모습으로 함께 선다.
 *
 * ── 이행이 고친 화면 둘 — 나무 모양이 상수였다 (함정 10)
 *
 * 옛 화면은 잎 넷의 x 를 `LEAF_CX = [90, 230, 390, 530]` 으로, 중간 둘을
 * `MID_CX = [160, 460]` 으로, 꼭대기를 `ROOT_CX = 310` 으로 박아 두고 `for (i < 4)`
 * 로 돌았다. 부모가 아이들 위에 서는 것이 **부모라서가 아니라 그렇게 적어서**였다.
 * 지금은 잎 자리가 잎의 개수에서 나오고, 중간은 제 아이들의 한가운데에, 꼭대기는
 * 중간 둘의 한가운데에 선다 (`geomOf`). 그래서 나무 모양이 자료를 따라간다.
 *
 * ── 채움과 테두리를 가른다
 *
 * - **채움(fill) = 값의 형편** — 성한 해시는 `textMuted`, 갈린 해시는 `danger`,
 *   갈리기 전의 값은 `textMuted` 에 취소선. 바뀐 파일의 **이름**만 `accent` 다 —
 *   그것은 갈림의 결과가 아니라 **원인**이라 어휘를 가른다 (함정 23).
 * - **테두리(stroke) = 이음의 표식** — 갈림을 실어 나른 선 위에 `danger` 선을 덧
 *   긋는다. 색을 갈아 끼우지 않고 덧대는 까닭은 색 보간을 피하기 위해서다.
 *
 * 둘 다 **머무는 표식**이라 정적 그리기가 세우고, 되짚어도 남는다 (S-scene PREFER).
 *
 * ── CSS transition 을 쓰지 않는다
 *
 * 옛 stage 는 `style.transition` 을 걸어 두고 `later()` 로 한 틱 뒤에 값을 바꾸는
 * 짜임이라 네 곳이 그것을 지났다 (복제본의 `transform`+`opacity`, 마디 글자의
 * `opacity`+`fill`, 선의 `opacity`+`stroke`, 이름의 `opacity`+`fill`). 되짚기는
 * `animate:false` 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게 하므로
 * 흔들림 축을 구조적으로 통과할 수 없다 (S-scene MUST NOT). 전부 `tween` 보간으로
 * 옮겼다. 색(`fill`·`stroke`)은 두 색을 섞지 않는다 — 정적 그리기가 끝 색을 세워
 * 두고 보간은 `opacity`·`stroke-opacity` 만 건드린다. 벽시계는 `setTimeout` 으로
 * 재고 rAF 를 쓰지 않는다 — 걸음이 프레임 없는 자리에서도 돌아야 하기 때문이다.
 *
 * 한 걸음에서 흐르는 것이 여럿이면 **시계를 나누지 않고** 한 `tween` 안에서 마디마다
 * 시차를 준다. 접힘은 한 뜻으로 묶인 운동이라 그래야 짝지어 오르는 것이 우연이
 * 아니게 되고, `render` 의 Promise 도 전부 선 뒤에 구조적으로 풀린다.
 *
 * ── 색 토큰 (S-view 결정 트리)
 *   - 갈린 마디와 그 선 — palette.danger
 *   - 바뀐 잎 이름 — palette.accent
 *   - 성한 마디와 갈리기 전 값 — palette.textMuted
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 준다.
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionOf,
  leafCountOf,
  leafHashOf,
  leafLabelOf,
  midValueOf,
  printedHexLengthOf,
  rootValueOf,
  sideOfLeafIn,
  type MerkleCaption,
  type MerkleTreeScene,
  type MerkleValue,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 내용이 정하는 값이라 그림 곁에 둔다 (S-view). */
const H = 272;

// ── 층의 기준선 ──────────────────────────────────────────────────────────
const CAPTION_Y = 34;
const ROOT_Y = 84;
const MID_Y = 152;
const LEAF_Y = 220;
const NAME_Y = 248;

/** 갈리기 전 값이 밀려 올라가 앉는 높이. */
const WAS_DY = 13;
/** 취소선이 기준선에서 얼마나 위를 지나는가. */
const STRIKE_DY = 4;

/** 잎 줄 좌우에 남기는 여백. 남는 폭은 잎들이 나눠 갖는다 (S-piece). */
const SIDE_MIN = 40;
/** 선이 마디 글자 위로 비켜서는 거리. 밀려 올라간 옛 값 자리를 비운다. */
const EDGE_GAP_TOP = 24;
/** 선이 부모 글자 아래로 비켜서는 거리. */
const EDGE_GAP_BOTTOM = 6;

/** mono 11px 한 글자의 대략적 폭. 취소선 길이를 재는 데 쓴다. */
const MONO_W_XS = 6.6;
/** mono 12px 한 글자의 대략적 폭. */
const MONO_W_SM = 7.2;

// ── 박자 ────────────────────────────────────────────────────────────────
/** 값 하나가 부모 자리까지 올라가는 시간 (ms). */
const RISE_MS = 380;
/** 같은 층의 다음 상승을 조금 늦춰 짝지어 오르는 것이 보이게 한다. */
const RISE_STAGGER_MS = 70;
/** 나타나는 데 드는 시간 (ms). */
const FADE_MS = 220;
/** 옛 값이 밀려 올라가고 새 값이 들어서는 데 드는 시간 (ms). */
const SWAP_MS = 200;
/** 보간 한 프레임. rAF 가 아니라 벽시계로 잰다. */
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeInOut = (p: number): number => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/**
 * 보간이 끝나면 속성을 **지운다**.
 *
 * `setAttribute(…, '1')` 로 되돌리면 흘려 세운 화면에만 그 속성이 남아 곧바로 세운
 * 화면과 글자 하나가 어긋난다 (프로토콜 4 절).
 */
function fade(node: Element, e: number): void {
  if (e >= 1) node.removeAttribute('opacity');
  else node.setAttribute('opacity', String(e));
}

function fadeStroke(node: Element, e: number): void {
  if (e >= 1) node.removeAttribute('stroke-opacity');
  else node.setAttribute('stroke-opacity', String(e));
}

/**
 * 자리와 치수. 바탕에서 매번 셈하므로 걸음마다 같은 값이 나온다.
 *
 * 척도를 `mount` 이 한 번 재어 클로저에 적어 두면 정하는 자리와 쓰는 자리가
 * 갈라진다 — 장면이 담는 것은 픽셀이 아니라 구조다 (S-piece).
 */
type Geom = {
  /** 잎이 몇인가. */
  count: number;
  /** 그 잎의 가로 한가운데. 남는 폭을 잎들이 고르게 나눠 갖는다. */
  leafX(index: number): number;
  /** 그 중간 마디의 가로 한가운데 — **제 아이들의 한가운데**다. */
  midX(side: number): number;
  /** 꼭대기의 가로 한가운데 — 중간 둘의 한가운데다. */
  rootX: number;
};

function geomOf(scene: MerkleTreeScene): Geom {
  const count = Math.max(1, leafCountOf(scene));
  const half = Math.ceil(count / 2);
  const slot = (W - SIDE_MIN * 2) / count;
  const leafX = (index: number): number => Math.round(SIDE_MIN + slot * (index + 0.5));

  const midX = (side: number): number => {
    const first = side === 0 ? 0 : Math.min(half, count - 1);
    const last = side === 0 ? Math.max(0, half - 1) : count - 1;
    return Math.round((leafX(first) + leafX(last)) / 2);
  };

  return {
    count,
    leafX,
    midX,
    rootX: Math.round((midX(0) + midX(1)) / 2),
  };
}

/**
 * 정적 그리기가 세워 둔 마디 하나의 손잡이.
 *
 * `render` 안에서만 살고 밖으로 새지 않는다. `y` 와 `strikeHalfW` 는 그릴 때마다
 * 바탕에서 다시 셈한 수라 상태가 아니다 — 걸음을 건너 살아남지 않는다 (함정 24).
 */
type DrawnNode = {
  /** 지금 값. */
  now: SVGTextElement;
  /** 갈리기 전 값 — 성한 마디에는 없다 (숨기지 않고 짓지 않는다, 함정 17). */
  was: SVGTextElement | null;
  /** 옛 값을 가로지르는 취소선. `was` 가 있을 때만 있다. */
  strike: SVGLineElement | null;
  /** 이 마디의 기준선. 옛 값이 여기서 밀려 올라간다. */
  y: number;
  /** 옛 값의 가로 절반. 취소선이 여기까지 뻗는다. */
  strikeHalfW: number;
  /** 가로 한가운데. */
  x: number;
};

type Drawn = {
  geom: Geom;
  /** 인쇄하는 hex 앞자리 수. 복제본도 같은 수로 자른다. */
  head: number;
  leafHash: DrawnNode[];
  leafName: DrawnNode[];
  mid: DrawnNode[];
  root: DrawnNode | null;
  /** 잎 → 중간 (잎 수만큼), 이어서 중간 → 꼭대기 (둘). 순서가 인덱스 규약이다. */
  edges: SVGLineElement[];
  /** 같은 차례로 놓인 갈림 표식. 그 이음이 갈림을 실어 나르지 않았으면 `null`. */
  edgeMarks: (SVGLineElement | null)[];
  /** 올라가는 복제본이 사는 층. 운동 중에만 자식이 있다. */
  rising: SVGGElement;
};

export const merkleStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MerkleTreeScene> {
    const svg = params.canvas;
    const palette: Palette = getColors(params.theme);
    const BAD = palette.danger;
    const HOT = palette.accent;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    /** 걸음마다 통째로 다시 세우는 층. 정적 그리기가 비우고 채운다. */
    const root = el('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 가 그 가운데 오면 남은 프레임이
     * 이미 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고
     * 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). `resolve` 를 `waiters` 에
     * 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던 약속이 함께 풀린다 —
     * 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이 영영 안 풀린다 (S-piece).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
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

    // ── 글자 ─────────────────────────────────────────────────────────────

    function text(
      x: number,
      y: number,
      opts: { fill?: string; size?: string; family?: string; weight?: string } = {},
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': 'middle',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.xs,
        ...(opts.weight === undefined ? {} : { 'font-weight': opts.weight }),
      });
    }

    function captionText(cap: MerkleCaption): string {
      switch (cap.kind) {
        case 'leaves':
          return t('caption.leaves', 'Each file gets its own hash.');
        case 'folded':
          return t('caption.folded', 'Folded in pairs, all of it comes down to one value.');
        case 'changed':
          return t('caption.changed', 'One file changes.');
        case 'pathOnly':
          return t(
            'caption.pathOnly',
            'Only the path up to the top changes — the other branch is untouched.',
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /**
     * 마디 하나를 세운다.
     *
     * 값이 갈렸으면 옛 값이 위에 취소선을 지고 앉고 새 값이 기준선에 선다. 성한
     * 마디는 값 하나뿐이다 — 안 그린 것이 아니라 그릴 것이 하나여서다.
     */
    function drawNode(
      into: SVGGElement,
      x: number,
      y: number,
      value: MerkleValue,
      opts: { calm: string; hot: string; family: string; size: string; charW: number },
    ): DrawnNode {
      const changed = value.was !== null;
      const now = text(x, y, {
        family: opts.family,
        size: opts.size,
        fill: changed ? opts.hot : opts.calm,
      });
      now.textContent = value.now;
      into.appendChild(now);

      let was: SVGTextElement | null = null;
      let strike: SVGLineElement | null = null;
      let strikeHalfW = 0;

      if (value.was !== null) {
        strikeHalfW = (value.was.length * opts.charW) / 2;
        was = text(x, y - WAS_DY, {
          family: opts.family,
          size: opts.size,
          fill: palette.textMuted,
        });
        was.textContent = value.was;
        strike = el('line', {
          x1: x - strikeHalfW,
          y1: y - WAS_DY - STRIKE_DY,
          x2: x + strikeHalfW,
          y2: y - WAS_DY - STRIKE_DY,
          stroke: palette.textMuted,
          'stroke-width': 1,
        });
        into.append(was, strike);
      }

      return { now, was, strike, y, strikeHalfW, x };
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * `step` 을 읽지 않는다 — 읽으면 흘려 세운 경로와 곧바로 세운 경로가 같은
     * 걸음을 달리 그릴 여지가 생기고, 그것을 자체 검증이 못 잡는다 (S-scene).
     * 두 번 그려도 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
     */
    function drawStatic(scene: MerkleTreeScene): Drawn {
      root.textContent = '';
      const geom = geomOf(scene);
      const head = printedHexLengthOf(scene);

      const gEdges = el('g');
      const gNodes = el('g');
      const gRising = el('g');
      root.append(gEdges, gNodes, gRising);

      const drawn: Drawn = {
        geom,
        head,
        leafHash: [],
        leafName: [],
        mid: [],
        root: null,
        edges: [],
        edgeMarks: [],
        rising: gRising,
      };

      // ── 캡션. 자취가 정하므로 되짚어도 같은 자리에 같은 말이 선다.
      const cap = captionOf(scene);
      if (cap !== null) {
        const node = text(W / 2, CAPTION_Y, { fill: HOT, size: fontSizes.sm, weight: '600' });
        node.textContent = captionText(cap);
        root.appendChild(node);
      }

      /** 해시 마디의 값 — 앞자리만 자른다. 자르는 길이는 두 벌이 정한다. */
      const clipped = (value: MerkleValue): MerkleValue => ({
        now: value.now.slice(0, head),
        was: value.was === null ? null : value.was.slice(0, head),
      });

      // ── 선. 접어 올린 뒤에야 선다. 아직 없는 것은 짓지 않는다 (함정 17).
      //    갈림을 실어 나른 이음 위에는 danger 선을 덧긋는다 — 색을 갈아 끼우지
      //    않으므로 보간이 `stroke-opacity` 하나로 끝난다.
      const addEdge = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        marked: boolean,
      ): void => {
        const line = el('line', {
          x1,
          y1,
          x2,
          y2,
          stroke: palette.border,
          'stroke-width': 1.4,
        });
        gEdges.appendChild(line);
        drawn.edges.push(line);

        if (!marked) {
          drawn.edgeMarks.push(null);
          return;
        }
        const mark = el('line', {
          x1,
          y1,
          x2,
          y2,
          stroke: BAD,
          'stroke-width': 1.6,
        });
        gEdges.appendChild(mark);
        drawn.edgeMarks.push(mark);
      };

      if (scene.folded) {
        for (let i = 0; i < geom.count; i++) {
          const side = sideOfLeafIn(scene, i);
          addEdge(
            geom.leafX(i),
            LEAF_Y - EDGE_GAP_TOP,
            geom.midX(side),
            MID_Y + EDGE_GAP_BOTTOM,
            leafHashOf(scene, i).was !== null,
          );
        }
        for (let side = 0; side < 2; side++) {
          addEdge(
            geom.midX(side),
            MID_Y - EDGE_GAP_TOP,
            geom.rootX,
            ROOT_Y + EDGE_GAP_BOTTOM,
            midValueOf(scene, side).was !== null,
          );
        }
      }

      // ── 잎. 해시와 이름을 함께 세운다.
      if (scene.leavesShown) {
        for (let i = 0; i < geom.count; i++) {
          drawn.leafHash.push(
            drawNode(gNodes, geom.leafX(i), LEAF_Y, clipped(leafHashOf(scene, i)), {
              calm: palette.textMuted,
              hot: BAD,
              family: fonts.mono,
              size: fontSizes.xs,
              charW: MONO_W_XS,
            }),
          );
          drawn.leafName.push(
            drawNode(gNodes, geom.leafX(i), NAME_Y, leafLabelOf(scene, i), {
              calm: palette.text,
              hot: HOT,
              family: fonts.mono,
              size: fontSizes.sm,
              charW: MONO_W_SM,
            }),
          );
        }
      }

      // ── 중간과 꼭대기. 접어 올린 뒤에야 선다.
      if (scene.folded) {
        for (let side = 0; side < 2; side++) {
          drawn.mid.push(
            drawNode(gNodes, geom.midX(side), MID_Y, clipped(midValueOf(scene, side)), {
              calm: palette.textMuted,
              hot: BAD,
              family: fonts.mono,
              size: fontSizes.xs,
              charW: MONO_W_XS,
            }),
          );
        }
        drawn.root = drawNode(gNodes, geom.rootX, ROOT_Y, clipped(rootValueOf(scene)), {
          calm: palette.textMuted,
          hot: BAD,
          family: fonts.mono,
          size: fontSizes.xs,
          charW: MONO_W_XS,
        });
      }

      return drawn;
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 아직 못 온 만큼을
    // 뒤로 물리는 꼴이 된다. 출발 그림은 `prev` 를 들추지 않고 바탕에서 셈한다
    // (S-scene).

    /** 마디 하나를 통째로 드러내거나 감춘다. */
    function fadeNode(node: DrawnNode, e: number): void {
      fade(node.now, e);
      if (node.was !== null) fade(node.was, e);
      if (node.strike !== null) fadeStroke(node.strike, e);
    }

    /**
     * 옛 값이 제자리에서 밀려 올라가며 취소선이 그어지고, 새 값이 그 아래 들어선다.
     *
     * `e === 0` 이면 옛 값이 기준선에 그대로 서 있고 새 값은 아직 없다 — 곧 이
     * 걸음 직전의 화면이다. 성한 마디에는 할 일이 없다.
     */
    function swapNode(node: DrawnNode, e: number): void {
      if (node.was === null || node.strike === null) return;
      node.was.setAttribute('y', String(node.y - WAS_DY * e));
      const half = node.strikeHalfW * e;
      node.strike.setAttribute('x1', String(node.x - half));
      node.strike.setAttribute('x2', String(node.x + half));
      node.strike.setAttribute('y1', String(node.y - WAS_DY * e - STRIKE_DY));
      node.strike.setAttribute('y2', String(node.y - WAS_DY * e - STRIKE_DY));
      fade(node.now, e);
    }

    /** 값 하나를 복제해 부모 자리까지 올려 보낸다. 잎은 제자리에 남는다. */
    function makeGhost(drawn: Drawn, value: string, color: string): SVGTextElement {
      const ghost = text(0, 0, { family: fonts.mono, size: fontSizes.xs, fill: color });
      ghost.textContent = value.slice(0, drawn.head);
      ghost.setAttribute('opacity', '0');
      drawn.rising.appendChild(ghost);
      return ghost;
    }

    /** 복제본을 출발점과 도착점 사이에 놓는다. 양 끝에서는 보이지 않는다. */
    function placeGhost(
      ghost: SVGTextElement,
      from: { x: number; y: number },
      to: { x: number; y: number },
      e: number,
    ): void {
      if (e <= 0 || e >= 1) {
        ghost.setAttribute('opacity', '0');
        return;
      }
      const m = easeInOut(e);
      ghost.setAttribute('x', String(from.x + (to.x - from.x) * m));
      ghost.setAttribute('y', String(from.y + (to.y - from.y) * m));
      ghost.setAttribute('opacity', String(1 - e * e));
    }

    /** 잎마다 자기 해시가 붙는다. 하나씩 차례로 — 파일마다 제 것을 갖는다. */
    function flowLeaves(drawn: Drawn, mine: number): Promise<void> {
      const count = drawn.leafHash.length;
      if (count === 0) return Promise.resolve();
      const total = (count - 1) * RISE_STAGGER_MS + FADE_MS;
      return tween(total, mine, (p) => {
        const now = p * total;
        for (let i = 0; i < count; i++) {
          const e = easeOut(clamp01((now - i * RISE_STAGGER_MS) / FADE_MS));
          fadeNode(drawn.leafHash[i], e);
          fadeNode(drawn.leafName[i], e);
        }
      });
    }

    /**
     * 아래에서 위로 접힌다.
     *
     * 잎들이 짝지어 부모 자리로 올라가고, 도착한 뒤에 부모 값이 나타난다. 그 다음
     * 중간 둘이 같은 식으로 꼭대기까지 오른다. 시계를 층마다 나누지 않는다 — 한
     * 시계 안에서 시차를 주어야 짝지어 오르는 것이 우연이 아니게 된다.
     */
    function flowFold(scene: MerkleTreeScene, drawn: Drawn, mine: number): Promise<void> {
      const geom = drawn.geom;
      const count = geom.count;
      const half = Math.ceil(count / 2);

      const leafStart = (i: number): number => i * RISE_STAGGER_MS;
      const leafArrive = (i: number): number => leafStart(i) + RISE_MS;
      /** 2층은 1층이 전부 닿은 뒤에 오른다. */
      const floor2At = (count - 1) * RISE_STAGGER_MS + RISE_MS;
      const midStart = (side: number): number => floor2At + side * RISE_STAGGER_MS;
      const midArrive = (side: number): number => midStart(side) + RISE_MS;

      const leafGhosts = Array.from({ length: count }, (_v, i) =>
        makeGhost(drawn, scene.before.leaves[i]?.hash ?? '', palette.textMuted),
      );
      const midGhosts = [0, 1].map((side) =>
        makeGhost(drawn, side === 0 ? scene.before.left : scene.before.right, palette.textMuted),
      );

      const total = midArrive(1) + FADE_MS;
      return tween(total, mine, (p) => {
        const now = p * total;

        for (let i = 0; i < count; i++) {
          const side = sideOfLeafIn(scene, i);
          placeGhost(
            leafGhosts[i],
            { x: geom.leafX(i), y: LEAF_Y },
            { x: geom.midX(side), y: MID_Y },
            clamp01((now - leafStart(i)) / RISE_MS),
          );
          fade(drawn.edges[i], easeOut(clamp01((now - leafArrive(i)) / FADE_MS)));
        }

        for (let side = 0; side < 2; side++) {
          placeGhost(
            midGhosts[side],
            { x: geom.midX(side), y: MID_Y },
            { x: geom.rootX, y: ROOT_Y },
            clamp01((now - midStart(side)) / RISE_MS),
          );
          // 중간 마디는 제 첫 아이가 닿을 때 나타난다.
          const firstChild = side === 0 ? 0 : Math.min(half, count - 1);
          fadeNode(
            drawn.mid[side],
            easeOut(clamp01((now - leafArrive(firstChild)) / FADE_MS)),
          );
          fade(drawn.edges[count + side], easeOut(clamp01((now - midArrive(side)) / FADE_MS)));
        }

        if (drawn.root !== null) {
          fadeNode(drawn.root, easeOut(clamp01((now - midArrive(0)) / FADE_MS)));
        }
      });
    }

    /** 어느 잎이 바뀌었나 — 값이 둘인 잎이 그 잎이다. 없으면 -1. */
    function changedIndex(nodes: DrawnNode[]): number {
      return nodes.findIndex((node) => node.was !== null);
    }

    /** 파일 하나가 바뀐다. 옛 이름이 밀려 올라가고 새 이름이 그 자리에 들어선다. */
    function flowChange(drawn: Drawn, mine: number): Promise<void> {
      const i = changedIndex(drawn.leafName);
      if (i < 0) return Promise.resolve();
      const node = drawn.leafName[i];
      return tween(SWAP_MS, mine, (p) => {
        swapNode(node, easeOut(p));
      });
    }

    /**
     * 바뀐 값이 꼭대기까지 다시 올라간다. **다른 가지는 움직이지 않는다** —
     * 그 정지가 이 조각이 말하려는 전부다.
     *
     * 무엇이 오르는지는 값 둘을 가진 마디가 정한다. 옆 가지가 가만히 있는 것은
     * 코드가 건너뛰어서가 아니라 그쪽 해시가 실제로 같아서다.
     */
    function flowPath(scene: MerkleTreeScene, drawn: Drawn, mine: number): Promise<void> {
      const i = changedIndex(drawn.leafHash);
      if (i < 0) return Promise.resolve();
      const leaf = drawn.leafHash[i];

      const geom = drawn.geom;
      const side = sideOfLeafIn(scene, i);
      const mid = drawn.mid[side] ?? null;
      const top = drawn.root;

      // 잎이 갈리고 → 부모로 오르고 → 부모가 갈리고 → 꼭대기로 오르고 → 꼭대기가 갈린다.
      const riseToMidAt = SWAP_MS;
      const midSwapAt = riseToMidAt + RISE_MS;
      const riseToRootAt = midSwapAt + SWAP_MS;
      const rootSwapAt = riseToRootAt + RISE_MS;
      const total = rootSwapAt + SWAP_MS;

      const leafGhost = makeGhost(drawn, leafHashOf(scene, i).now, BAD);
      const midGhost = makeGhost(drawn, midValueOf(scene, side).now, BAD);

      return tween(total, mine, (p) => {
        const now = p * total;

        swapNode(leaf, easeOut(clamp01(now / SWAP_MS)));
        placeGhost(
          leafGhost,
          { x: geom.leafX(i), y: LEAF_Y },
          { x: geom.midX(side), y: MID_Y },
          clamp01((now - riseToMidAt) / RISE_MS),
        );

        if (mid !== null) swapNode(mid, easeOut(clamp01((now - midSwapAt) / SWAP_MS)));
        placeGhost(
          midGhost,
          { x: geom.midX(side), y: MID_Y },
          { x: geom.rootX, y: ROOT_Y },
          clamp01((now - riseToRootAt) / RISE_MS),
        );

        if (top !== null) swapNode(top, easeOut(clamp01((now - rootSwapAt) / SWAP_MS)));

        // 갈림을 실어 나른 이음은 그 값이 도착할 때 물든다.
        const leafMark = drawn.edgeMarks[i];
        if (leafMark !== null) {
          fadeStroke(leafMark, easeOut(clamp01((now - midSwapAt) / FADE_MS)));
        }
        const midMark = drawn.edgeMarks[geom.count + side];
        if (midMark !== null) {
          fadeStroke(midMark, easeOut(clamp01((now - rootSwapAt) / FADE_MS)));
        }
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: MerkleTreeScene,
      _prev: MerkleTreeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'leaves':
          await flowLeaves(drawn, mine);
          break;
        case 'fold':
          await flowFold(next, drawn, mine);
          break;
        case 'change':
          await flowChange(drawn, mine);
          break;
        case 'path':
          await flowPath(next, drawn, mine);
          break;
      }

      if (!alive(mine)) return;
      // 흐르며 남은 속성·보간의 끝자리·복제본이 통째로 사라진다. 되돌릴 목록을
      // 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 콜백은 아예 불리지
        // 않으므로 기다리던 것을 직접 깨워야 `await ctx.emit` 이 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
