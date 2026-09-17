/**
 * fail-link-stage — 미끄러지는 것을 보이는 그림.
 *
 * 화면은 두 층이다. 위는 훑는 글줄 한 줄, 아래는 무늬 넷이 이룬 나무.
 * 커서는 **자리를 옮겨 다니는 고리** 하나뿐이고, 이 조각이 말하려는 것은 그 고리가
 * 뿌리로 되돌아가지 않고 나무를 가로질러 **옆으로 미끄러지는** 한 순간이다.
 *
 * ## 두 길이 완주 화면에 나란히 선다
 *
 * 옮기기 전에는 `finish()` 가 `clearMarks()` 로 나이브 갈래를 **마지막 걸음에서
 * 통째로 지웠다.** 뿌리로 돌아간 유령도, 놓친 무늬의 고리도, 'missed' 딱지도 전부
 * 사라지고 완주 화면에는 "미끄러졌다" 쪽만 남았다 — 견줄 상대가 없으니 "덕분에
 * 이만큼 아꼈다" 가 캡션의 말로만 남는다. 이제 그 갈래가 장면의 `naive` 에 있고
 * **정적 그리기가 매번 세우므로** 어느 걸음으로 끌어도 대조가 함께 선다.
 *
 * ## 어휘를 먼저 가른다
 *
 * 한 화면에 "실제로 간 길" 과 "가지 않은 길" 이 함께 있으므로 모양부터 나눈다.
 * 헛걸음을 살아 있는 자국과 같은 모양으로 그리면 읽기가 뒤집힌다.
 *
 * - **실선** — 실제로 일어난 것. 그어 둔 실패 링크는 얇고 옅게(`textMuted` 1.4),
 *   실제로 미끄러진 링크는 굵고 진하게(`itemActive` 2.8). 약속과 그 약속이 쓰인
 *   순간을 한 화면에서 가른다.
 * - **점선 + `danger`** — 일어나지 않은 것. 뿌리로 돌아갔을 길, 뿌리에 섰을 유령,
 *   그때 놓쳤을 무늬의 **바깥** 고리. 셋이 한 식구다.
 *
 * 칠도 축을 나눈다 — **채움은 값의 형편**(이 마디에서 무늬를 거뒀나), **안쪽 고리는
 * 구조**(여기서 무늬가 끝난다), **바깥 고리는 표식**(커서가 여기 있다 / 나이브였다면
 * 놓쳤을 것). 셋이 서로 다른 축이라 한 마디에 겹쳐도 부딪히지 않는다.
 *
 * ## 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`prepareTree()` · `growPattern()` · `slideToFail()` …) 를
 * 두지 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의
 * 화면 전체**를 세운다 (S-scene). 장면의 모양은 `scene.ts`.
 *
 * 자리는 나무 전체(`scene.nodes`)에서 한 번에 셈하고 그 다음에 그린다 — 그리면서
 * 이웃의 지금 좌표를 읽으면 순회 순서가 숨은 상태가 된다 (함정 13). 아직 나지 않은
 * 마디는 **숨기지 않고 짓지 않는다** (함정 17).
 *
 * 운동의 출발 그림은 `prev` 도 DOM 도 들추지 않는다 — 걸음이 `step.from` · `step.wasAt`
 * 으로 말한다 (S-scene · 함정 28). 옮기기 전에는 `stripCursor.getAttribute('x')` 와
 * `ghost.getAttribute('cy')` 를 되읽어 출발값으로 썼고, `cursor` 의 `opacity` 를
 * 되읽어 "훑기가 시작되었나" 를 갈랐다.
 *
 * CSS `transition` 을 쓰지 않는다 (MUST NOT). 시계는 rAF 대신 프레임 간격 타이머 하나뿐이고
 * 상시 도는 루프도 없다 — 운동은 걸음 안에서만 돈다 (함정 30).
 *
 * 세로는 여기서 정한다 (가로는 러너가 `PIECE_CANVAS_W` 로 준다). 마디 자리는
 * 캔버스에서 역산하므로 선언에 좌표가 없다 (S-piece). 색은 design-tokens 만 쓰고
 * (S-view) 문안은 `params.t` 로만 짓는다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  ROOT,
  depthOf,
  matchedNodes,
  missedNodes,
  nodeOf,
  spanOf,
  wordOf,
  type FailLinkArc,
  type FailLinkScene,
  type FailLinkSceneNode,
  type FailLinkStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 글줄 하나 + 깊이 다섯 줄 + 캡션 세 줄이 들어가는 높이. */
const H = 400;

// ── 글줄
const TEXT_TOP = 16;
const TEXT_H = 38;
/** 글자 칸의 **상한**. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 66;
const CELL_SIDE_MIN = 40;
const MATCH_BAR_Y = 58;

// ── 나무
/** 뿌리 한가운데의 세로 자리. */
const TREE_TOP = 94;
const ROW_H = 53;
const NODE_R = 18;
/** 잎이 놓이는 가로 여백. 나머지 폭은 잎들이 고르게 나눠 갖는다. */
const TREE_SIDE = 96;
const CURSOR_R = NODE_R + 5;
/** 놓쳤을 무늬를 두르는 바깥 고리. 커서 고리와 겹치지 않게 한 겹 밖이다. */
const MISSED_R = CURSOR_R + 7;
const ARC_BOW_MAX = 46;
/** 나이브 갈래는 반대쪽으로, 더 크게 부푼다 — 실패 링크와 겹치지 않는다. */
const NAIVE_BOW_MAX = 70;

/** 그어 둔 실패 링크 / 실제로 미끄러진 링크의 굵기. */
const LINK_W = 1.4;
const SLID_W = 2.8;

// ── 캡션
const CAPTION_TOP = 346;
const CAPTION_LINE_H = 20;
const CAPTION_LINES = 3;
const CAPTION_SIDE = 24;
/** 캡션을 접을 때 쓰는 글자 크기. `fontSizes.md` 와 같은 수다. */
const CAPTION_FONT = 14;

// ── 걸음마다의 운동 길이(ms). stepMs 는 이것이 끝난 뒤부터 잰다.
/** 뿌리가 처음 뜨는 걸음. 이미 있던 것이 아니라 새로 나므로 앉는 꼴이다. */
const ROOT_MS = 240;
const ROOT_RISE = 12;
const GROW_MS = 240;
const LINK_MS = 420;
const STEP_MS = 340;
const SHAKE_MS = 300;
const DEAD_MS = 220;
const SLIDE_MS = 640;
const GHOST_MS = 760;
const SETTLE_MS = 240;
const DONE_MS = 320;
/** 완주 걸음에서 미끄러진 길이 굵어지는 몫. 그 길이 곧 아낀 것이라 그것을 짚는다. */
const DONE_PULSE = 1.6;
const FRAME_MS = 16;
/** 돋아나는 마디가 부모 자리에서 출발할 때의 배율. */
const GROW_FROM_SCALE = 0.35;

/** 그래픽에 새겨진 표식 — 번역 대상이 아니다 (C10). */
const ROOT_GLYPH = 'root';

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function quad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

function quadLength(a: Pt, c: Pt, b: Pt): number {
  let total = 0;
  let prev = a;
  for (let i = 1; i <= 24; i += 1) {
    const cur = quad(a, c, b, i / 24);
    total += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
  }
  return total;
}

/**
 * 두 마디를 잇는 곡선의 조종점. `bow` 가 양이면 아래쪽, 음이면 위쪽으로 부푼다.
 *
 * 링크 층을 마디 층보다 먼저 붙이므로 겹치는 자리는 마디가 가린다.
 */
function arcControl(a: Pt, b: Pt, bow: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: (a.x + b.x) / 2 + nx * bow, y: (a.y + b.y) / 2 + ny * bow };
}

/** 실패 링크가 지나는 길. */
function linkCtrl(a: Pt, b: Pt): Pt {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return arcControl(a, b, Math.min(ARC_BOW_MAX, len * 0.18));
}

/** 뿌리로 돌아갔을 길. 반대쪽으로 부푼다. */
function naiveCtrl(a: Pt, b: Pt): Pt {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return arcControl(a, b, -Math.min(NAIVE_BOW_MAX, len * 0.3));
}

/** 글자 하나의 대략 폭. 줄바꿈 자리와 딱지 자리를 잡는 데만 쓴다. */
function charWidth(ch: string, size: number): number {
  const code = ch.codePointAt(0) ?? 0;
  const wide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60);
  return wide ? size : size * 0.55;
}

function textWidth(s: string, size: number): number {
  let total = 0;
  for (const ch of s) total += charWidth(ch, size);
  return total;
}

/** 한 줄로 넘치는 캡션을 낱말 경계에서 접는다. */
function wrap(s: string, size: number, maxW: number, maxLines: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const candidate = cur === '' ? word : `${cur} ${word}`;
    if (textWidth(candidate, size) <= maxW || cur === '') {
      cur = candidate;
      continue;
    }
    lines.push(cur);
    cur = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur !== '') lines.push(cur);
  return lines.slice(0, maxLines);
}

/**
 * 잎을 왼쪽부터 차례로 세우고 안쪽 마디는 자식들의 가운데에 둔다. 잎 사이 간격은
 * 캔버스 폭에서 역산하므로 나무가 넓어지면 저절로 폭을 채운다.
 *
 * **나무 전체**로 셈한다 — 지금까지 난 마디만으로 셈하면 자리가 걸음마다 흔들려
 * "이미 난 길은 그대로 둔다" 는 읽기가 깨진다. 자리를 한 번에 다 내놓고, 그리는
 * 쪽은 그 표만 본다 (함정 13).
 */
function layoutTree(nodes: readonly FailLinkSceneNode[], w: number): Map<number, Pt> {
  const out = new Map<number, Pt>();
  if (nodes.length === 0) return out;

  const kids = new Map<number, number[]>();
  for (const n of nodes) {
    if (n.parent < 0) continue;
    const list = kids.get(n.parent);
    if (list === undefined) kids.set(n.parent, [n.id]);
    else list.push(n.id);
  }

  const slot = new Map<number, number>();
  let leaves = 0;
  const walk = (id: number): number => {
    const children = kids.get(id) ?? [];
    if (children.length === 0) {
      const s = leaves;
      leaves += 1;
      slot.set(id, s);
      return s;
    }
    let sum = 0;
    for (const child of children) sum += walk(child);
    const s = sum / children.length;
    slot.set(id, s);
    return s;
  };
  walk(ROOT);

  const span = Math.max(1, leaves - 1);
  const gap = (w - TREE_SIDE * 2) / span;
  for (const n of nodes) {
    out.set(n.id, {
      x: TREE_SIDE + (slot.get(n.id) ?? 0) * gap,
      y: TREE_TOP + depthOf(nodes, n.id) * ROW_H,
    });
  }
  return out;
}

/** 링크 하나를 가리키는 열쇠. 같은 마디에서 둘이 나가는 일은 없지만 짝으로 잡는다. */
function keyOf(arc: FailLinkArc): string {
  return `${arc.from}>${arc.to}`;
}

/** 장면 설계 + 그리는 이. 러너가 이 둘을 짝지어 쓴다. */
export type FailLinkStage = ViewInstance & SceneRenderer<FailLinkScene>;

export const failLinkStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): FailLinkStage {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 한꺼번에 거둔다 (S-piece).
    let destroyed = false;
    /**
     * 세대 빗장. `render` 가 부를 때마다 하나 올린다.
     *
     * 흐르는 요소는 정적 그리기가 매번 새로 만들지만 그것을 잡아 두는 **클로저
     * 변수**(`nodeGroups` · `arcPaths` · `cursorRing`)는 새로 만들어지지 않는다.
     * 되짚기가 가운데 끼어들면 앞 세대의 프레임이 깨어나 새 손잡이를 타고 살아
     * 있는 화면에 옛 좌표를 쓴다 (S-scene).
     */
    let gen = 0;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function alive(mine: number): boolean {
      return !destroyed && mine === gen;
    }

    function sleep(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    /**
     * 끝나는 시각이 있는 되풀이. 첫 프레임은 동기로 그린다 — 정적 그리기가 이미
     * 끝 자리에 세워 두었으므로 출발 자리로 물리는 것을 미루면 끝 자리가 번쩍인다.
     */
    async function tween(mine: number, ms: number, draw: (raw: number) => void): Promise<void> {
      if (!alive(mine)) return;
      const start = Date.now();
      for (;;) {
        if (!alive(mine)) return;
        const raw = ms <= 0 ? 1 : Math.min(1, (Date.now() - start) / ms);
        draw(raw);
        if (raw >= 1) return;
        await sleep(FRAME_MS);
      }
    }

    // ── 층. 먼저 붙인 것이 아래로 깔린다.
    const gEdges = document.createElementNS(SVG_NS, 'g');
    const gArcs = document.createElementNS(SVG_NS, 'g');
    const gNodes = document.createElementNS(SVG_NS, 'g');
    const gMarks = document.createElementNS(SVG_NS, 'g');
    const gCursor = document.createElementNS(SVG_NS, 'g');
    /** 운동 중에만 사는 것들 — 알갱이 · 막힌 자리 표. 정지 화면에는 없다 (함정 27). */
    const gFlow = document.createElementNS(SVG_NS, 'g');
    const gText = document.createElementNS(SVG_NS, 'g');
    const gCaption = document.createElementNS(SVG_NS, 'g');
    svg.append(gEdges, gArcs, gNodes, gMarks, gCursor, gFlow, gText, gCaption);

    // ── 정적 그리기가 매번 다시 만드는 손잡이들. 걸음 함수가 물렸다 되돌린다.
    let pos = new Map<number, Pt>();
    /** 글줄을 코드 포인트로 가른다 — algorithm 의 훑기와 같은 단위다. */
    let chars: string[] = [];
    let cellW = CELL_MAX_W;
    let originX = 0;
    const nodeGroups = new Map<number, SVGGElement>();
    const edgeLines = new Map<number, SVGLineElement>();
    const arcPaths = new Map<string, SVGPathElement>();
    const missedMarks = new Map<number, { ring: SVGCircleElement; label: SVGTextElement }>();
    let stripCursor: SVGRectElement | null = null;
    let cursorRing: SVGCircleElement | null = null;
    let ghostRing: SVGCircleElement | null = null;
    let naivePath: SVGPathElement | null = null;

    function at(id: number): Pt {
      return pos.get(id) ?? { x: W / 2, y: TREE_TOP };
    }

    function cellX(i: number): number {
      return originX + i * cellW;
    }

    function clear(g: Element): void {
      g.textContent = '';
    }

    // ── 문안 ──────────────────────────────────────────────────────────────
    //
    // 장면은 무엇을 말할지만 담는다. 인자는 전부 장면에서 꺼낸다 — 걸음이 그것을
    // 또 실어 오면 같은 것을 두 자리에서 말하는 꼴이 된다.

    function charAt(i: number | null): string {
      return i === null ? '' : (chars[i] ?? '');
    }

    function captionOf(scene: FailLinkScene): string {
      const cap = scene.caption;
      if (cap === null) return '';
      switch (cap.kind) {
        case 'insert':
          return t('caption.insert', 'Four patterns share one tree: {pattern}.', {
            pattern: scene.patterns[scene.inserted - 1] ?? '',
          });
        case 'failLink': {
          const link = scene.links[scene.links.length - 1];
          if (link === undefined) return '';
          return t(
            'caption.failLink',
            '"{word}" falls back to "{suffix}" — the longest suffix of it that the tree still has.',
            { word: wordOf(scene.nodes, link.from), suffix: wordOf(scene.nodes, link.to) },
          );
        }
        case 'match': {
          const node = scene.cursor === null ? null : nodeOf(scene.nodes, scene.cursor);
          return t('caption.match', '"{ch}" completes a pattern: {word}.', {
            ch: charAt(scene.probe),
            word: node?.terminal ?? '',
          });
        }
        case 'rootStay':
          return t('caption.rootStay', 'The root has no "{ch}": nothing starts here.', {
            ch: charAt(scene.probe),
          });
        case 'step':
          return t('caption.step', '"{ch}" continues the path — now at "{word}".', {
            ch: charAt(scene.probe),
            word: scene.cursor === null ? '' : wordOf(scene.nodes, scene.cursor),
          });
        case 'slide': {
          const slid = scene.slid[scene.slid.length - 1];
          if (slid === undefined) return '';
          return t(
            'caption.slide',
            'No "{ch}" after "{word}". Instead of starting over, slide to "{suffix}", which was already read.',
            {
              ch: charAt(scene.probe),
              word: wordOf(scene.nodes, slid.from),
              suffix: wordOf(scene.nodes, slid.to),
            },
          );
        }
        case 'naive':
          return t(
            'caption.naive',
            'Going back to the root instead, the rest reads as a fresh start: {missed} is never found.',
            { missed: (scene.naive?.missed ?? []).join(', ') },
          );
        case 'done':
          // 살려 낸 것은 `naive` 가 쥐고 있다. 같은 수를 두 자리에서 세지 않는다.
          return t('caption.done', 'Sliding to the overlap is why {rescued} was not missed.', {
            rescued: (scene.naive?.missed ?? []).join(', '),
          });
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 것을 전부 다시 세운다. 되돌릴 명령이 필요 없고,
    // 흐르며 남은 속성이 다음 화면으로 새지 않는다.

    function drawStrip(scene: FailLinkScene): void {
      clear(gText);
      stripCursor = null;

      for (let i = 0; i < chars.length; i += 1) {
        // 이미 삼킨 글자는 옅어진다. **남는 자취**라 정적 경로가 매번 세운다.
        const eaten = scene.probe !== null && i < scene.probe;
        el(gText, 'rect', {
          x: cellX(i) + 3,
          y: TEXT_TOP,
          width: cellW - 6,
          height: TEXT_H,
          rx: 6,
          fill: eaten ? c.bgSubtle : c.itemDefault,
          stroke: c.border,
          'stroke-width': 1.4,
        });
        const glyph = el(gText, 'text', {
          x: cellX(i) + cellW / 2,
          y: TEXT_TOP + TEXT_H / 2 + 7,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          fill: eaten ? c.textMuted : c.text,
        });
        glyph.textContent = chars[i] ?? '';
      }

      // 거둔 무늬가 글줄에서 덮는 자리. 마디의 칠과 **같은 목록**에서 나온다.
      for (const match of scene.matches) {
        const span = spanOf(scene, match);
        if (span === null) continue;
        el(gText, 'rect', {
          x: cellX(span.start) + 3,
          y: MATCH_BAR_Y,
          width: cellX(span.end) + cellW - 3 - (cellX(span.start) + 3),
          height: 4,
          rx: 2,
          fill: c.itemPivot,
        });
      }

      // 아직 짚은 글자가 없으면 글줄 커서를 짓지 않는다 (함정 17).
      if (scene.probe === null) return;
      stripCursor = el(gText, 'rect', {
        x: cellX(scene.probe) + 1,
        y: TEXT_TOP - 2,
        width: cellW - 2,
        height: TEXT_H + 4,
        rx: 8,
        fill: 'none',
        stroke: c.itemActive,
        'stroke-width': 3,
      });
    }

    function drawTree(scene: FailLinkScene): void {
      clear(gEdges);
      clear(gNodes);
      nodeGroups.clear();
      edgeLines.clear();

      const hit = matchedNodes(scene);

      // 가지가 먼저다 — 마디 원이 그 위에 앉는다.
      for (const grown of scene.grown) {
        const node = nodeOf(scene.nodes, grown.id);
        if (node === null || node.parent < 0) continue;
        const a = at(node.parent);
        const b = at(node.id);
        edgeLines.set(
          node.id,
          el(gEdges, 'line', {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            stroke: c.border,
            'stroke-width': 2,
          }),
        );
      }

      for (const grown of scene.grown) {
        const node = nodeOf(scene.nodes, grown.id);
        if (node === null) continue;
        const p = at(node.id);
        const isRoot = node.parent < 0;
        const reaped = hit.has(node.id);
        const g = el(gNodes, 'g', { transform: `translate(${p.x} ${p.y})` });
        // 채움은 **값의 형편** — 여기서 무늬를 거뒀나.
        el(g, 'circle', {
          r: NODE_R,
          fill: reaped ? c.itemPivot : c.itemDefault,
          stroke: reaped ? c.text : c.border,
          'stroke-width': 1.8,
        });
        // 안쪽 고리는 **구조** — 여기서 무늬가 끝난다.
        if (node.terminal !== null) {
          el(g, 'circle', {
            r: NODE_R - 4,
            fill: 'none',
            stroke: c.text,
            'stroke-width': 1.2,
          });
        }
        const glyph = el(g, 'text', {
          y: isRoot ? 4 : 5,
          'text-anchor': 'middle',
          'font-family': isRoot ? fonts.body : fonts.mono,
          'font-size': isRoot ? fontSizes.xs : fontSizes.md,
          fill: reaped ? c.stateInk : c.text,
        });
        glyph.textContent = isRoot ? ROOT_GLYPH : node.ch;
        if (node.terminal !== null) {
          const tag = el(g, 'text', {
            x: NODE_R + 8,
            y: 4,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: reaped ? c.text : c.textMuted,
          });
          tag.textContent = node.terminal;
        }
        nodeGroups.set(node.id, g);
      }
    }

    /**
     * 실패 링크. **그어 둔 것과 실제로 미끄러진 것을 가른다** — 한 축에 두 뜻을
     * 실으면 "이 약속이 쓰였다" 가 화면에서 사라진다 (함정 29).
     */
    function drawArcs(scene: FailLinkScene): void {
      clear(gArcs);
      arcPaths.clear();
      naivePath = null;

      const used = new Set(scene.slid.map(keyOf));
      const seen = new Set<string>();
      const arcs: (FailLinkArc & { hot: boolean })[] = [];
      for (const link of scene.links) {
        seen.add(keyOf(link));
        arcs.push({ ...link, hot: used.has(keyOf(link)) });
      }
      // 뿌리를 가리키는 링크는 그어 두지 않지만, 그리로 실제 미끄러졌다면 그린다.
      for (const slid of scene.slid) {
        if (seen.has(keyOf(slid))) continue;
        seen.add(keyOf(slid));
        arcs.push({ ...slid, hot: true });
      }

      const born = new Set(scene.grown.map((g) => g.id));
      for (const arc of arcs) {
        if (!born.has(arc.from) || !born.has(arc.to)) continue;
        const a = at(arc.from);
        const b = at(arc.to);
        const ctrl = linkCtrl(a, b);
        arcPaths.set(
          keyOf(arc),
          el(gArcs, 'path', {
            d: `M ${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`,
            fill: 'none',
            // 실선 = 실제로 있는 길. 굵기와 색이 쓰였는지를 말한다.
            stroke: arc.hot ? c.itemActive : c.textMuted,
            'stroke-width': arc.hot ? SLID_W : LINK_W,
            opacity: arc.hot ? 1 : 0.5,
          }),
        );
      }

      // 가지 않은 길. **점선 + danger** 라 실제로 간 길과 부딪히지 않는다.
      if (scene.naive === null) return;
      const start = scene.slid[0];
      if (start === undefined) return;
      const a = at(start.from);
      const b = at(ROOT);
      const ctrl = naiveCtrl(a, b);
      naivePath = el(gArcs, 'path', {
        d: `M ${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`,
        fill: 'none',
        stroke: c.danger,
        'stroke-width': 2,
        'stroke-dasharray': '6 5',
      });
    }

    /**
     * 나이브 갈래의 표식 — 뿌리에 섰을 유령과, 그때 놓쳤을 무늬들.
     *
     * **남는다.** 옮기기 전에는 `finish()` 가 이것을 지워 완주 화면에 대조가 없었다.
     */
    function drawMissed(scene: FailLinkScene): void {
      clear(gMarks);
      missedMarks.clear();
      ghostRing = null;
      if (scene.naive === null) return;

      if (scene.slid.length > 0) {
        const r = at(ROOT);
        ghostRing = el(gMarks, 'circle', {
          cx: r.x,
          cy: r.y,
          r: CURSOR_R,
          fill: 'none',
          stroke: c.danger,
          'stroke-width': 2.4,
          'stroke-dasharray': '5 5',
        });
      }

      for (const missed of missedNodes(scene)) {
        const p = at(missed.id);
        const ring = el(gMarks, 'circle', {
          cx: p.x,
          cy: p.y,
          r: MISSED_R,
          fill: 'none',
          stroke: c.danger,
          'stroke-width': 2,
          'stroke-dasharray': '4 4',
        });
        const label = el(gMarks, 'text', {
          x: p.x + NODE_R + 12 + textWidth(missed.pattern, 11),
          y: p.y + 4,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.danger,
        });
        label.textContent = t('label.missed', 'missed');
        missedMarks.set(missed.id, { ring, label });
      }
    }

    function drawCursor(scene: FailLinkScene): void {
      clear(gCursor);
      cursorRing = null;
      if (scene.cursor === null) return;
      if (!scene.grown.some((g) => g.id === scene.cursor)) return;
      const p = at(scene.cursor);
      cursorRing = el(gCursor, 'circle', {
        cx: p.x,
        cy: p.y,
        r: CURSOR_R,
        fill: 'none',
        stroke: c.itemActive,
        'stroke-width': 3,
      });
    }

    function drawCaption(scene: FailLinkScene): void {
      clear(gCaption);
      const lines = wrap(captionOf(scene), CAPTION_FONT, W - CAPTION_SIDE * 2, CAPTION_LINES);
      for (let i = 0; i < CAPTION_LINES; i += 1) {
        const line = el(gCaption, 'text', {
          x: W / 2,
          y: CAPTION_TOP + i * CAPTION_LINE_H,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        line.textContent = lines[i] ?? '';
      }
    }

    /** 장면 하나를 통째로 세운다 — 글줄도 나무도 링크도 표식도 커서도 캡션도. */
    function drawStatic(scene: FailLinkScene): void {
      clear(gFlow);
      // 자리를 **먼저 한 번에** 셈하고 그 다음에 그린다 (함정 13).
      pos = layoutTree(scene.nodes, W);
      chars = [...scene.text];
      cellW = Math.min(
        CELL_MAX_W,
        Math.floor((W - CELL_SIDE_MIN * 2) / Math.max(1, chars.length)),
      );
      originX = Math.round((W - cellW * chars.length) / 2);

      drawStrip(scene);
      drawTree(scene);
      drawArcs(scene);
      drawMissed(scene);
      drawCursor(scene);
      drawCaption(scene);
    }

    // ── 운동 ──────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 그러니 운동은 출발
    // 자리로 **물렸다가** 되돌아오는 꼴이 된다. 물리는 일은 `drawStatic` 직후 아직
    // 어떤 기다림도 지나지 않은 동안 하므로 첫 프레임에 끝 자리가 번쩍이지 않는다.

    /** 글줄 커서가 떠난 자리. 처음이면 글줄 왼쪽 바깥에서 들어온다. */
    function stripStartX(wasAt: number | null): number {
      return wasAt === null ? cellX(0) - cellW : cellX(wasAt) + 1;
    }

    /** 뿌리가 처음 뜬다 — 이미 있던 것이 아니므로 위에서 내려와 앉는다. */
    async function settleRoot(mine: number): Promise<void> {
      const g = nodeGroups.get(ROOT);
      if (g === undefined) return;
      const p = at(ROOT);
      await tween(mine, ROOT_MS, (raw) => {
        const e = easeOutCubic(raw);
        g.setAttribute('transform', `translate(${p.x} ${p.y - ROOT_RISE * (1 - e)})`);
      });
    }

    /**
     * 무늬 하나가 들어가며 새 마디들이 부모 자리에서 돋아 제 자리로 자란다.
     *
     * 글자를 **하나씩** 잇는 것이 이 걸음의 말이라 차례로 흘린다. 어느 마디가 방금
     * 났는지는 장면이 말한다 (`by`) — 걸음이 그것을 또 실어 오지 않는다.
     */
    async function growNodes(scene: FailLinkScene, mine: number): Promise<void> {
      const fresh = scene.grown.filter((g) => g.by === scene.inserted - 1);
      for (const grown of fresh) {
        const node = nodeOf(scene.nodes, grown.id);
        if (node === null || node.parent < 0) continue;
        const from = at(node.parent);
        const to = at(node.id);
        const g = nodeGroups.get(node.id);
        const line = edgeLines.get(node.id);
        await tween(mine, GROW_MS, (raw) => {
          const e = easeOutCubic(raw);
          const x = lerp(from.x, to.x, e);
          const y = lerp(from.y, to.y, e);
          const scale = GROW_FROM_SCALE + (1 - GROW_FROM_SCALE) * e;
          g?.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
          line?.setAttribute('x2', String(x));
          line?.setAttribute('y2', String(y));
        });
        if (!alive(mine)) return;
      }
    }

    /** 작은 알갱이가 길을 따라 굴러가며 실패 링크를 그어 놓는다. */
    async function drawLink(scene: FailLinkScene, mine: number): Promise<void> {
      const link = scene.links[scene.links.length - 1];
      if (link === undefined) return;
      const path = arcPaths.get(keyOf(link));
      if (path === undefined) return;
      const a = at(link.from);
      const b = at(link.to);
      const ctrl = linkCtrl(a, b);
      const total = quadLength(a, ctrl, b);
      const bead = el(gFlow, 'circle', { r: 6, fill: c.itemActive, cx: a.x, cy: a.y });
      path.setAttribute('stroke-dasharray', String(total));
      // 알갱이와 선이 한 뜻으로 묶인 운동이라 **한 시계**로 흘린다.
      await tween(mine, LINK_MS, (raw) => {
        const e = easeOutCubic(raw);
        const pt = quad(a, ctrl, b, e);
        bead.setAttribute('cx', String(pt.x));
        bead.setAttribute('cy', String(pt.y));
        path.setAttribute('stroke-dashoffset', String(total * (1 - e)));
      });
    }

    /** 글줄 커서가 한 칸 나아가고, 나무의 고리가 가지를 타고 내려간다. */
    async function runScan(
      scene: FailLinkScene,
      step: Extract<FailLinkStep, { kind: 'scan' }>,
      mine: number,
    ): Promise<void> {
      const to = scene.cursor ?? ROOT;
      const a = at(step.from);
      const b = at(to);
      const moving = step.from !== to;
      const fromX = stripStartX(step.wasAt);
      const toX = scene.probe === null ? fromX : cellX(scene.probe) + 1;
      await tween(mine, moving ? STEP_MS : SHAKE_MS, (raw) => {
        const e = easeOutCubic(raw);
        stripCursor?.setAttribute('x', String(lerp(fromX, toX, e)));
        if (moving) {
          cursorRing?.setAttribute('cx', String(lerp(a.x, b.x, e)));
          cursorRing?.setAttribute('cy', String(lerp(a.y, b.y, e)));
        } else {
          // 이을 길이 없어 제자리다. 흔들려서 그것을 말한다. 끝에서는 보간값이
          // 아니라 0 을 쓴다 — 부동소수 끝자리가 문자열을 가른다 (함정 6).
          const wobble = raw >= 1 ? 0 : Math.sin(raw * Math.PI * 3) * 6;
          cursorRing?.setAttribute('cx', String(b.x + wobble));
        }
      });
    }

    /** 이 조각의 한 순간 — 고리가 나무를 가로질러 옆으로 미끄러진다. */
    async function runSlide(
      scene: FailLinkScene,
      step: Extract<FailLinkStep, { kind: 'slide' }>,
      mine: number,
    ): Promise<void> {
      const slid = scene.slid[scene.slid.length - 1];
      if (slid === undefined) return;
      const a = at(slid.from);
      const b = at(slid.to);
      const ctrl = linkCtrl(a, b);

      // 이어갈 길이 없다는 것부터 보인다 — 있었어야 할 자식 자리에 빈 칸.
      // 운동 중에만 사는 것이라 정지 화면에는 없다 (함정 27).
      const deadPt = { x: a.x, y: a.y + ROW_H * 0.62 };
      const dead = el(gFlow, 'g', { opacity: 0 });
      el(dead, 'circle', {
        cx: deadPt.x,
        cy: deadPt.y,
        r: NODE_R - 4,
        fill: 'none',
        stroke: c.danger,
        'stroke-width': 1.6,
        'stroke-dasharray': '4 4',
      });
      el(dead, 'line', {
        x1: deadPt.x - 6,
        y1: deadPt.y - 6,
        x2: deadPt.x + 6,
        y2: deadPt.y + 6,
        stroke: c.danger,
        'stroke-width': 2,
      });
      el(dead, 'line', {
        x1: deadPt.x + 6,
        y1: deadPt.y - 6,
        x2: deadPt.x - 6,
        y2: deadPt.y + 6,
        stroke: c.danger,
        'stroke-width': 2,
      });

      // 글자를 짚었는데 이어갈 길이 없다 — 글줄 커서와 빈 칸이 한 뜻이라 한 시계다.
      const fromX = stripStartX(step.wasAt);
      const toX = scene.probe === null ? fromX : cellX(scene.probe) + 1;
      await tween(mine, DEAD_MS, (raw) => {
        const e = easeOutCubic(raw);
        dead.setAttribute('opacity', String(e));
        dead.setAttribute('transform', `translate(0 ${lerp(-10, 0, e)})`);
        stripCursor?.setAttribute('x', String(lerp(fromX, toX, e)));
      });
      if (!alive(mine)) return;

      await tween(mine, SLIDE_MS, (raw) => {
        const e = easeOutCubic(raw);
        const pt = quad(a, ctrl, b, e);
        cursorRing?.setAttribute('cx', String(pt.x));
        cursorRing?.setAttribute('cy', String(pt.y));
        if (e > 0.7) dead.setAttribute('opacity', String((1 - e) / 0.3));
      });
    }

    /**
     * 대비 — 그 자리에서 뿌리로 돌아갔다면 어디까지 잃었는가.
     *
     * 유령이 되돌아가며 그 길을 **자취로 남긴다.** 선은 유령이 지나온 만큼만 그려
     * 지므로 곡선을 잘라 그린다 (de Casteljau). 유령과 선이 한 뜻이라 한 시계다.
     */
    async function runNaive(scene: FailLinkScene, mine: number): Promise<void> {
      const start = scene.slid[0];
      if (start !== undefined && naivePath !== null && ghostRing !== null) {
        const path = naivePath;
        const ghost = ghostRing;
        const a = at(start.from);
        const b = at(ROOT);
        const ctrl = naiveCtrl(a, b);
        await tween(mine, GHOST_MS, (raw) => {
          const e = easeOutCubic(raw);
          const mid = { x: lerp(a.x, ctrl.x, e), y: lerp(a.y, ctrl.y, e) };
          const tip = quad(a, ctrl, b, e);
          path.setAttribute('d', `M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${tip.x} ${tip.y}`);
          ghost.setAttribute('cx', String(tip.x));
          ghost.setAttribute('cy', String(tip.y));
        });
        if (!alive(mine)) return;
      }

      // 놓쳤을 무늬에 고리가 앉는다. 하나씩이라 차례로.
      for (const missed of missedNodes(scene)) {
        const mark = missedMarks.get(missed.id);
        if (mark === undefined) continue;
        await tween(mine, SETTLE_MS, (raw) => {
          const e = easeOutCubic(raw);
          mark.ring.setAttribute('r', String(lerp(MISSED_R + 10, MISSED_R, e)));
          mark.ring.setAttribute('opacity', String(e));
          mark.label.setAttribute('opacity', String(e));
        });
        if (!alive(mine)) return;
      }
    }

    /**
     * 마무리 — 미끄러진 길이 한 번 굵어졌다 돌아온다.
     *
     * 캡션이 말하는 "덕분에 놓치지 않았다" 의 근거가 바로 그 길이라, 짚는 것이 곧
     * 그 걸음의 말이다. 여럿이면 한 뜻이므로 한 시계로 흘린다.
     */
    async function runDone(scene: FailLinkScene, mine: number): Promise<void> {
      const paths: SVGPathElement[] = [];
      for (const slid of scene.slid) {
        const path = arcPaths.get(keyOf(slid));
        if (path !== undefined) paths.push(path);
      }
      if (paths.length === 0) {
        const ring = cursorRing;
        if (ring === null) return;
        await tween(mine, DONE_MS, (raw) => {
          ring.setAttribute('r', String(CURSOR_R + Math.sin(Math.PI * raw) * 5));
        });
        return;
      }
      await tween(mine, DONE_MS, (raw) => {
        const width = SLID_W + DONE_PULSE * Math.sin(Math.PI * raw);
        for (const path of paths) path.setAttribute('stroke-width', width.toFixed(2));
      });
    }

    /** 걸음 하나를 흐르게 한다. 갈래를 빠뜨리면 tsc 가 잡는다. */
    function flow(scene: FailLinkScene, step: FailLinkStep, mine: number): Promise<void> {
      switch (step.kind) {
        case 'tree':
          return settleRoot(mine);
        case 'insert':
          return growNodes(scene, mine);
        case 'link':
          return drawLink(scene, mine);
        case 'scan':
          return runScan(scene, step, mine);
        case 'slide':
          return runSlide(scene, step, mine);
        case 'naive':
          return runNaive(scene, mine);
        case 'done':
          return runDone(scene, mine);
      }
    }

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     *
     * 운동이 끝나면 장면을 **다시 한 번 통째로** 세운다. 흐르며 남은 `transform` 과
     * 보간의 끝자리가 곧바로 세운 화면과의 차이가 되어 되짚기 판정을 어긋나게 하기
     * 때문이다. 사이에 타이머도 프레임도 없어 같은 그림이 다시 그려질 뿐이다.
     *
     * 돌려주는 Promise 는 장면이 다 선 뒤에 풀린다 — 이것이 바깥이 걸음의 끝을 아는
     * 유일한 통로다 (S-scene).
     */
    async function render(
      next: FailLinkScene,
      /** 흐르게 할 것을 장면의 `step` 이 말하므로 앞 장면을 들추지 않는다. */
      _prev: FailLinkScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      if (!opts.animate || destroyed) return;
      const step = next.step;
      if (step !== null) await flow(next, step, mine);
      if (alive(mine)) drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 깨우지 않으면 걸음이 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
