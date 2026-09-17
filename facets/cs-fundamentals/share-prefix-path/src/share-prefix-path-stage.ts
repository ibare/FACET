/**
 * share-prefix-path-stage — 접두사 트라이(trie)를 그리는 조각 전용 view.
 *
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 이 조각의 동사는 "새 자리가 부모 자리에서
 * 태어나 제 자리로 자란다" 인데, 그 view 는 `setTree()` 로 통째로 다시 그릴 뿐 노드가
 * 자라는 운동을 표현할 수단이 없다. 게다가 이미 난 길을 흔들지 않는 것이 이 조각의
 * 주장이라 재배치 자체가 금물이다 (원칙 6 의 예외 조건).
 *
 * "겹쳐 든다": 이미 난 길과 글자가 같은 동안은 커서가 기존 자리 위를 실제로 이동하며
 * 지나가고(ride), 글자가 갈라지는 자리에서 새 자리가 부모 자리에서 돋아 제 자리로
 * 실제 이동한다(grow). 운동을 opacity 전환으로 대신하지 않는다 (S-piece MUST NOT).
 *
 * ── 나눠 쓴 길은 **남는다**
 *
 * 옮기기 전에는 타고 지나간 자취가 380ms 만 머물다 되돌려졌다. 다 끝난 화면에 새로
 * 난 길과 나눠 쓴 길의 구별이 없었고, 그것이 곧 이 조각의 주장이었다. 이제 장면의
 * `rides` 가 그것을 쥐고, **정적 그리기가 매번 다시 세운다** — 나눠 쓴 가지는 굵고
 * 진하게, 그 자리는 테두리를 둘러. 되짚어 어느 걸음에 서도 같은 그림이 선다.
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`init()` · `beginWord()` · `ride()` · `grow()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터 다시
 * 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의 화면
 * 전체**를 세운다 (S-scene). 장면의 모양은 `scene.ts`.
 *
 * 좌표는 낱말 목록(`scene.words`) 하나로 결정되는 **최종** 트라이 모양에서 셈한다 —
 * 지금까지 난 자리만으로 셈하면 자리가 걸음마다 흔들려 "이미 난 길은 그대로 둔다" 는
 * 주장이 깨진다. 장면은 그 자리 중 **어느 것이 났는지**만 말한다.
 *
 * `init()` 이 사라졌으므로 캔버스 세로와 `viewBox` 도 정적 그리기가 매번 다시 정한다.
 *
 * 색은 design-tokens 만 쓴다 (S-view). 문안은 `params.t` 로만 짓는다 (C10) — 이 파일의
 * en 원본은 조회가 빗나갔을 때의 되받이다.
 */

import {
  type CanvasView,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  getColors,
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  makeTranslator,
} from '@ffacet/core/runtime';

import { ROOT_ID, tallySeats, tallyWord } from './scene.js';
import type { SharePrefixPathScene, SharePrefixPathSceneNode } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 트라이 골격 + 좌표 계산 (words 하나로 결정되는 순수 계산) ─────────────
//
// 장면이 아니라 여기가 자리를 정한다 (S-piece). 장면은 구조만 말한다.

type TrieShape = {
  id: string;
  parentId: string | null;
  depth: number;
  children: string[];
};

function buildFinalTrie(words: string[]): Map<string, TrieShape> {
  const nodes = new Map<string, TrieShape>();
  nodes.set(ROOT_ID, { id: ROOT_ID, parentId: null, depth: 0, children: [] });
  for (const word of words) {
    let curId = ROOT_ID;
    for (let i = 0; i < word.length; i += 1) {
      const prefix = word.slice(0, i + 1);
      const cur = nodes.get(curId);
      if (!cur) break;
      if (!nodes.has(prefix)) {
        nodes.set(prefix, { id: prefix, parentId: curId, depth: cur.depth + 1, children: [] });
        cur.children.push(prefix);
      }
      curId = prefix;
    }
  }
  return nodes;
}

type Geometry = {
  x: Map<string, number>;
  y: Map<string, number>;
  height: number;
  captionY: number;
};

const HEADER_H = 56;
const CAPTION_H = 44;
const ROW_GAP = 60;
const ROW_TOP_PAD = 30;
const ROW_BOTTOM_PAD = 26;
const SIDE_MIN = 36;
const COL_MAX = 150;

function computeGeometry(words: string[], W: number): Geometry {
  const nodes = buildFinalTrie(words);

  const rows = new Map<string, number>();
  let nextRow = 0;
  function dfs(id: string): number {
    const n = nodes.get(id);
    if (!n) return 0;
    if (n.children.length === 0) {
      const r = nextRow;
      nextRow += 1;
      rows.set(id, r);
      return r;
    }
    const childRows = n.children.map(dfs);
    const avg = childRows.reduce((a, b) => a + b, 0) / childRows.length;
    rows.set(id, avg);
    return avg;
  }
  dfs(ROOT_ID);
  const leafCount = Math.max(1, nextRow);

  let maxDepth = 0;
  for (const n of nodes.values()) maxDepth = Math.max(maxDepth, n.depth);

  const usableW = W - SIDE_MIN * 2;
  const colGap = maxDepth > 0 ? Math.min(COL_MAX, Math.floor(usableW / maxDepth)) : 0;
  const drawnW = colGap * maxDepth;
  const originX = SIDE_MIN + Math.max(0, Math.floor((usableW - drawnW) / 2));

  const diagramTop = HEADER_H;
  const diagramH = (leafCount - 1) * ROW_GAP + ROW_TOP_PAD + ROW_BOTTOM_PAD;

  const x = new Map<string, number>();
  const y = new Map<string, number>();
  for (const [id, n] of nodes) {
    x.set(id, originX + n.depth * colGap);
    y.set(id, diagramTop + ROW_TOP_PAD + (rows.get(id) ?? 0) * ROW_GAP);
  }

  const height = HEADER_H + diagramH + CAPTION_H;
  return { x, y, height, captionY: HEADER_H + diagramH + 26 };
}

function layoutChips(words: string[], W: number): { x: number; w: number }[] {
  const GAP = 10;
  const MAX_W = 96;
  const n = Math.max(1, words.length);
  const w = Math.min(MAX_W, Math.floor((W - GAP * (n - 1)) / n));
  const totalW = w * n + GAP * (n - 1);
  const startX = Math.round((W - totalW) / 2);
  return words.map((_, i) => ({ x: startX + i * (w + GAP), w }));
}

// ── view 상수 ────────────────────────────────────────────────────────────

const ANIM_MS = 380;
/**
 * 짚기만 하는 걸음의 몫.
 *
 * `begin` · `mark` · `wordEnd` · `summary` 네 갈래는 자리를 옮기지 않아 흐를 것이
 * 없었고, 그래서 걸음 벽시계가 `stepMs`(620ms) 그대로였다 — S-piece 의 얇은 걸음
 * 잣대(800ms) 아래다. 낱말 넷이라 그 걸음이 열 번 든다. `stepMs` 를 올리는 대신
 * **그 걸음이 하는 말만큼만** 얇게 움직여 벽시계를 올린다.
 */
const PULSE_MS = 260;
const SETTLE_MS = 220;
/** 칩이 짚이며 부푸는 정도. 켜지고 굳는 순간을 가리키는 것뿐이라 얇다. */
const CHIP_PULSE = 0.1;
/** 총결산에서 나눠 쓴 가지가 굵어지는 몫. 그 길이 곧 아낀 자리라 그것을 짚는다. */
const EDGE_PULSE = 1.4;
/** 표식이 앉기 전에 떠 있는 세로 거리. */
const MARK_RISE = 7;
const NODE_R = 15;
const ROOT_R = 6;
const MARK_R = 5;
/** 커서 고리의 여백. 마디 글자를 덮지 않도록 원 바깥에 두른다. */
const RING_PAD = 4;
/** 돋아나는 자리가 부모 자리에서 출발할 때의 배율. */
const GROW_FROM_SCALE = 0.35;
/** 나눠 쓴 길의 굵기 / 처음 난 길의 굵기. */
const SHARED_W = 3.5;
const PLAIN_W = 2;
const CANVAS_FALLBACK_H = 300;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 장면 설계 + 그리는 이. 러너가 이 둘을 짝지어 쓴다. */
export type SharePrefixPathStage = ViewInstance & SceneRenderer<SharePrefixPathScene>;

export const sharePrefixPathStageView: CanvasView = {
  canvas: { height: CANVAS_FALLBACK_H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): SharePrefixPathStage {
    const svg = params.canvas;
    svg.textContent = ''; // 캔버스 안쪽만 비운다 — 캔버스 자체는 러너가 이미 붙여 두었다 (S-view).
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    const chipsG = document.createElementNS(SVG_NS, 'g');
    const edgesG = document.createElementNS(SVG_NS, 'g');
    const nodesG = document.createElementNS(SVG_NS, 'g');
    const markG = document.createElementNS(SVG_NS, 'g');
    const cursorG = document.createElementNS(SVG_NS, 'g');
    // 캡션은 재건 밖의 요소다. 정적 경로가 **매번 명시로** 자리와 문안을 쓴다 — 쓰지
    // 않으면 앞 걸음의 문장이 남아 되짚기 판정에서 어긋난다 (프로토콜 4절).
    const captionText = document.createElementNS(SVG_NS, 'text');
    captionText.setAttribute('text-anchor', 'middle');
    captionText.setAttribute('font-family', fonts.body);
    captionText.setAttribute('font-size', fontSizes.sm);
    captionText.setAttribute('fill', colors.text);
    svg.append(chipsG, edgesG, nodesG, markG, cursorG, captionText);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /**
     * 세대 빗장. `render` 가 부를 때마다 하나 올린다.
     *
     * 흐르는 요소(마디 그룹 · 가지 · 커서 고리)는 정적 그리기가 매번 새로 만들지만,
     * 그것을 잡아 두는 **클로저 변수**(`nodeGroups` · `edgeLines` · `cursorRing`)는
     * 새로 만들어지지 않는다. 되짚기가 가운데 끼어들면 앞 세대의 프레임이 깨어나
     * 새 손잡이를 타고 **살아 있는 화면**에 옛 좌표를 쓴다. 걸음 함수는 깨어날 때마다
     * 자기 세대가 유효한지 보고 아니면 화면에 손대지 않고 물러난다 (S-scene).
     */
    let gen = 0;

    function alive(myGen: number): boolean {
      return !destroyed && myGen === gen;
    }

    /** t=0..1 프레임마다 그리는 rAF 트윈. 첫 프레임은 동기로 그린다. */
    function tween(myGen: number, ms: number, draw: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(myGen) || typeof requestAnimationFrame !== 'function') {
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const frame = (): void => {
          frames.delete(id);
          if (!alive(myGen)) {
            finish();
            return;
          }
          const raw = clamp01((Date.now() - start) / ms);
          draw(raw);
          if (raw >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        // 정적 그리기가 이미 끝 자리에 세워 두었으므로 출발 자리로 물리는 것을 다음
        // 프레임에 미루면 끝 자리가 한 번 번쩍인다.
        draw(0);
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function clear(g: Element): void {
      g.textContent = '';
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 것을 전부 다시 세운다. 되돌릴 명령이 필요 없고,
    // 흐르며 남은 속성이 다음 화면으로 새지 않는다.

    /** 이번에 세운 자리. 걸음 함수가 출발 자리를 여기서 찾는다. */
    let geo: Geometry = computeGeometry([], W);
    /** 정적 그리기가 매번 다시 만드는 손잡이들. 걸음 함수가 물렸다 되돌린다. */
    const chipGroups = new Map<number, { g: SVGGElement; cx: number; cy: number }>();
    const markGroups = new Map<string, SVGGElement>();
    const nodeGroups = new Map<string, SVGGElement>();
    const nodeCircles = new Map<string, SVGCircleElement>();
    const edgeLines = new Map<string, SVGLineElement>();
    let cursorRing: SVGGElement | null = null;

    function posOf(id: string): { x: number; y: number } {
      return { x: geo.x.get(id) ?? 0, y: geo.y.get(id) ?? 0 };
    }

    function drawChips(scene: SharePrefixPathScene): void {
      clear(chipsG);
      chipGroups.clear();
      const layout = layoutChips(scene.words, W);
      scene.words.forEach((word, i) => {
        const { x, w } = layout[i];
        // 다 넣은 것 → 굳음, 지금 넣는 것 → 켜짐, 나머지 → 기본.
        // 잉크는 타일을 따른다 (design-tokens 의 결정표).
        const done = i < scene.finished;
        const active = i === scene.active;
        const fill = active ? colors.accent : done ? colors.itemSorted : colors.itemDefault;
        const ink = active ? colors.stateInk : done ? colors.textInverse : colors.text;
        // 칩 하나를 <g> 로 싼다 — 짚는 걸음이 통째로 부풀리기 때문이다. 정적 경로는
        // `transform` 을 쓰지 않으므로 운동이 남긴 것은 다음 `settle` 이 통째로 거둔다.
        const chip = el(chipsG, 'g', {});
        chipGroups.set(i, { g: chip, cx: x + w / 2, cy: 27 });
        el(chip, 'rect', {
          x,
          y: 14,
          width: w,
          height: 26,
          rx: 6,
          fill,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const label = el(chip, 'text', {
          x: x + w / 2,
          y: 27,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: ink,
        });
        label.textContent = word;
      });
    }

    /**
     * 가지와 자리. **나눠 쓴 길을 굵고 진하게 그리는 것이 이 조각의 결론**이라
     * 정적 경로에 들어 있어야 한다 — 걸음 함수에만 두면 되짚었을 때 사라진다.
     */
    function drawTrie(scene: SharePrefixPathScene): void {
      clear(edgesG);
      clear(nodesG);
      clear(markG);
      markGroups.clear();
      nodeGroups.clear();
      nodeCircles.clear();
      edgeLines.clear();

      // 가지가 먼저다 — 자리 원이 그 위에 앉는다.
      for (const node of scene.nodes) {
        if (node.parentId === null) continue;
        const from = posOf(node.parentId);
        const to = posOf(node.id);
        const shared = node.rides > 0;
        edgeLines.set(
          node.id,
          el(edgesG, 'line', {
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
            stroke: shared ? colors.itemActive : colors.border,
            'stroke-width': shared ? SHARED_W : PLAIN_W,
          }),
        );
      }

      for (const node of scene.nodes) {
        const pos = posOf(node.id);
        if (node.parentId === null) {
          el(nodesG, 'circle', { cx: pos.x, cy: pos.y, r: ROOT_R, fill: colors.textMuted });
          continue;
        }
        const shared = node.rides > 0;
        const g = el(nodesG, 'g', { transform: `translate(${pos.x} ${pos.y})` });
        const circle = el(g, 'circle', {
          r: NODE_R,
          fill: colors.itemDefault,
          // 테두리는 **견줌의 표식**이다 — 나눠 쓴 자리인가. 채움은 값의 형편으로
          // 남겨 두어 둘이 부딪히지 않는다.
          stroke: shared ? colors.itemActive : colors.border,
          'stroke-width': shared ? 2.5 : 1.5,
        });
        const label = el(g, 'text', {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': '600',
          fill: colors.text,
        });
        label.textContent = node.char;
        nodeGroups.set(node.id, g);
        nodeCircles.set(node.id, circle);
      }

      for (const mark of scene.marks) {
        const pos = posOf(mark.nodeId);
        const g = el(markG, 'g', {});
        markGroups.set(mark.nodeId, g);
        el(g, 'circle', {
          cx: pos.x + NODE_R - 4,
          cy: pos.y - (NODE_R - 4),
          r: MARK_R,
          fill: colors.accent,
        });
        const label = el(g, 'text', {
          x: pos.x,
          y: pos.y + NODE_R + 14,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        label.textContent = scene.words[mark.wordIndex] ?? '';
      }
    }

    /**
     * 커서. 마디 **바깥에 두른 고리**로 그린다 — 자리 한가운데에 점을 얹으면 그 자리가
     * 맡은 글자를 덮는데, 장면 방식에서는 커서가 그 자리에 계속 머문다.
     */
    function drawCursor(scene: SharePrefixPathScene): void {
      clear(cursorG);
      cursorRing = null;
      if (scene.cursorAt === null) return;
      const node = scene.nodes.find((n) => n.id === scene.cursorAt);
      if (!node) return;
      const pos = posOf(node.id);
      const g = el(cursorG, 'g', { transform: `translate(${pos.x} ${pos.y})` });
      el(g, 'circle', {
        r: (node.parentId === null ? ROOT_R : NODE_R) + RING_PAD,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 2.5,
      });
      cursorRing = g;
    }

    function captionOf(scene: SharePrefixPathScene): string {
      const c = scene.caption;
      if (c === null) return '';
      switch (c.kind) {
        case 'begin':
          return t('caption.begin', "Inserting '{word}'.", {
            word: scene.words[c.wordIndex] ?? '',
          });
        case 'wordEnd': {
          // 탄 자리 수와 새 자리 수는 **장면의 트라이에서** 센다. `bornBy` 가 누가
          // 처음 냈는지 말하므로 걸음이 그 수를 실어 올 까닭이 없다.
          const { rode, grown } = tallyWord(scene, c.wordIndex);
          return t('caption.wordEnd', "'{word}': rode {rode}, grew {grown}.", {
            word: scene.words[c.wordIndex] ?? '',
            rode,
            grown,
          });
        }
        case 'summary': {
          const s = tallySeats(scene);
          return t(
            'caption.summary',
            '{wordCount} words, {totalSeats} seats (root included) instead of {rawChars} separate ones — saved {saved}.',
            {
              wordCount: s.wordCount,
              totalSeats: s.totalSeats,
              rawChars: s.rawChars,
              saved: s.saved,
            },
          );
        }
      }
    }

    /** 장면 하나를 통째로 세운다 — 칸도 가지도 자리도 표식도 커서도 캡션도. */
    function settle(scene: SharePrefixPathScene): void {
      // `init()` 이 사라졌으므로 캔버스 세로도 장면이 정한다 (프로토콜 4절).
      geo = computeGeometry(scene.words, W);
      svg.setAttribute('viewBox', `0 0 ${W} ${geo.height}`);
      svg.setAttribute('height', String(geo.height));

      drawChips(scene);
      drawTrie(scene);
      drawCursor(scene);

      captionText.setAttribute('x', String(W / 2));
      captionText.setAttribute('y', String(geo.captionY));
      captionText.textContent = captionOf(scene);
    }

    // ── 운동 ──────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 자리는 이미 제 곳에 서 있다. 그러니 운동은 출발 자리로
    // **물렸다가** 되돌아오는 꼴이 된다. 물리는 일은 `settle` 직후 아직 어떤 기다림도
    // 지나지 않은 동안 하므로 첫 프레임에 끝 자리가 번쩍이지 않는다.
    //
    // 타는 것도 돋는 것도 **부모 자리에서 출발한다.** 부모는 장면의 `parentId` 로
    // 찾아지므로 `prev` 를 들추지 않는다 (S-scene).

    function parentPos(node: SharePrefixPathSceneNode): { x: number; y: number } | null {
      if (node.parentId === null) return null;
      return posOf(node.parentId);
    }

    function nodeOf(scene: SharePrefixPathScene, id: string): SharePrefixPathSceneNode | null {
      return scene.nodes.find((n) => n.id === id) ?? null;
    }

    function moveRing(pos: { x: number; y: number }): void {
      cursorRing?.setAttribute('transform', `translate(${pos.x} ${pos.y})`);
    }

    /** 이미 난 자리를 탄다 — 커서가 부모 자리에서 그 자리로 미끄러진다. */
    async function runRide(
      scene: SharePrefixPathScene,
      nodeId: string,
      myGen: number,
    ): Promise<void> {
      const node = nodeOf(scene, nodeId);
      if (!node) return;
      const from = parentPos(node);
      const to = posOf(nodeId);
      if (!from) return;
      // 지나가는 강조. 운동이 끝나면 `settle` 이 통째로 되세워 저절로 거둬진다.
      nodeCircles.get(nodeId)?.setAttribute('fill', colors.itemActive);
      await tween(myGen, ANIM_MS, (raw) => {
        const e = easeOutCubic(raw);
        moveRing({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      });
    }

    /** 새 자리가 부모 자리에서 돋아 제 자리로 자란다. 가지도 함께 뻗는다. */
    async function runGrow(
      scene: SharePrefixPathScene,
      nodeId: string,
      myGen: number,
    ): Promise<void> {
      const node = nodeOf(scene, nodeId);
      if (!node) return;
      const from = parentPos(node);
      const to = posOf(nodeId);
      if (!from) return;
      const g = nodeGroups.get(nodeId);
      const line = edgeLines.get(nodeId);
      nodeCircles.get(nodeId)?.setAttribute('fill', colors.itemActive);
      // 자리와 가지와 커서가 한 뜻으로 묶인 운동이라 **한 시계**로 흘린다
      // (프로토콜 3-4). 시계를 나누면 lockstep 이 우연히 맞는 꼴이 된다.
      await tween(myGen, ANIM_MS, (raw) => {
        const e = easeOutCubic(raw);
        const x = from.x + (to.x - from.x) * e;
        const y = from.y + (to.y - from.y) * e;
        const scale = GROW_FROM_SCALE + (1 - GROW_FROM_SCALE) * e;
        g?.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
        line?.setAttribute('x2', String(x));
        line?.setAttribute('y2', String(y));
        moveRing({ x, y });
      });
    }

    // ── 짚기만 하는 걸음의 얇은 운동 ─────────────────────────────────────
    //
    // 자리를 옮기지 않는 걸음이라 "무엇이 달라졌나" 를 그 자리에서 짚는 정도로만
    // 움직인다. 정적 경로는 이 속성들을 쓰지 않으므로 운동이 남긴 것은 이어지는
    // `settle` 이 통째로 거둔다 (프로토콜 4절).

    /** 칩 하나가 제자리에서 부푼다. 켜지는 순간(begin)과 굳는 순간(wordEnd). */
    function pulseChip(index: number, myGen: number): Promise<void> {
      const chip = chipGroups.get(index);
      if (!chip) return Promise.resolve();
      return tween(myGen, PULSE_MS, (raw) => {
        const scale = 1 + CHIP_PULSE * Math.sin(Math.PI * raw);
        chip.g.setAttribute(
          'transform',
          `translate(${chip.cx} ${chip.cy}) scale(${scale.toFixed(3)}) translate(${-chip.cx} ${-chip.cy})`,
        );
      });
    }

    /**
     * 방금 붙은 표식이 조금 위에서 제자리에 앉는다.
     *
     * 어느 표식인지는 싣지 않는다 — 방금 붙은 것은 언제나 `marks` 의 마지막이다.
     * 같은 것을 걸음과 장면 두 자리에서 말하지 않는다.
     */
    function settleMark(scene: SharePrefixPathScene, myGen: number): Promise<void> {
      const last = scene.marks[scene.marks.length - 1];
      const g = last ? markGroups.get(last.nodeId) : undefined;
      if (!g) return Promise.resolve();
      return tween(myGen, SETTLE_MS, (raw) => {
        const e = easeOutCubic(raw);
        g.setAttribute('opacity', String(e));
        g.setAttribute('transform', `translate(0 ${(-MARK_RISE * (1 - e)).toFixed(2)})`);
      });
    }

    /**
     * 총결산에서 나눠 쓴 길들이 한꺼번에 굵어졌다 돌아온다.
     *
     * 캡션이 말하는 "아낀 자리" 의 근거가 바로 그 길들이라, 짚는 것이 곧 그 걸음의
     * 말이다. 한 뜻으로 묶인 운동이므로 **한 시계**로 흘린다 (프로토콜 3-4).
     */
    function pulseSharedPaths(scene: SharePrefixPathScene, myGen: number): Promise<void> {
      const lines: SVGLineElement[] = [];
      for (const node of scene.nodes) {
        if (node.parentId === null || node.rides === 0) continue;
        const line = edgeLines.get(node.id);
        if (line) lines.push(line);
      }
      if (lines.length === 0) return Promise.resolve();
      return tween(myGen, PULSE_MS, (raw) => {
        const width = SHARED_W + EDGE_PULSE * Math.sin(Math.PI * raw);
        for (const line of lines) line.setAttribute('stroke-width', width.toFixed(2));
      });
    }

    /**
     * 걸음 하나를 흐르게 한다. 갈래를 빠뜨리면 tsc 가 잡는다.
     *
     * 짚는 자리는 걸음이 아니라 **장면**에서 찾는다 — 켜진 칩은 `active`, 방금 굳은
     * 칩은 `finished - 1`, 방금 붙은 표식은 `marks` 의 마지막이다. 걸음이 그것을 또
     * 실어 오면 같은 것을 두 자리에서 말하는 꼴이 된다.
     */
    function flow(
      scene: SharePrefixPathScene,
      step: NonNullable<SharePrefixPathScene['step']>,
      myGen: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'begin':
          return scene.active === null ? Promise.resolve() : pulseChip(scene.active, myGen);
        case 'ride':
          return runRide(scene, step.nodeId, myGen);
        case 'grow':
          return runGrow(scene, step.nodeId, myGen);
        case 'mark':
          return settleMark(scene, myGen);
        case 'wordEnd':
          return pulseChip(scene.finished - 1, myGen);
        case 'summary':
          return pulseSharedPaths(scene, myGen);
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
      next: SharePrefixPathScene,
      /** 흐르게 할 것을 장면의 `step` 이 말하므로 앞 장면을 들추지 않는다. */
      _prev: SharePrefixPathScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const myGen = (gen += 1);
      settle(next);
      if (!opts.animate || destroyed) return;
      const step = next.step;
      if (step !== null) await flow(next, step, myGen);
      if (alive(myGen)) settle(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        // 기다리던 것을 깨운다 — 깨우지 않으면 걸음이 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
      },
    };
  },
};
