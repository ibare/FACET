/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 이 조각의 동사는 "새 자리가 부모
 * 자리에서 태어나 제 자리로 자란다" 인데, 그 view 는 `setTree()` 로 통째로 다시
 * 그릴 뿐 노드가 자라는 운동을 표현할 수단이 없다. 게다가 이미 난 길을 흔들지
 * 않는 것이 이 조각의 주장이라 재배치 자체가 금물이다 (원칙 6 의 예외 조건).
 *
 * share-prefix-path-stage — 접두사 트라이(trie)를 그리는 조각 전용 view.
 *
 * "겹쳐 든다": 이미 난 길과 글자가 같은 동안은 커서가 기존 노드 위를 실제로
 * 이동하며 지나가고(ride), 글자가 갈라지는 자리에서 새 노드가 부모 자리에서
 * 돋아 제 자리로 실제 이동한다(grow). 운동을 opacity 전환으로 대신하지 않는다
 * (S-piece MUST NOT).
 *
 * 좌표는 낱말 목록(words) 하나로 결정되는 최종 트라이 모양에서 미리 계산해
 * 두고, 걸음이 진행되며 그 좌표 위에 노드/간선을 하나씩 드러낸다 — 이미 그려진
 * 자리가 나중에 흔들리지 않는다.
 *
 * View 는 algorithm 의 타입을 import 하지 않는다 (원칙 1) — 이 파일 안에서
 * 동형으로 다시 선언한다.
 */

import {
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
  getColors,
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  makeTranslator,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function nextFrame(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => fn());
  } else {
    setTimeout(fn, 0);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 트라이 구조 + 좌표 계산 (words 하나로 결정되는 순수 계산) ──────────────

type TrieShape = {
  id: string;
  parentId: string | null;
  char: string;
  depth: number;
  children: string[];
};

function buildFinalTrie(words: string[]): Map<string, TrieShape> {
  const nodes = new Map<string, TrieShape>();
  nodes.set('', { id: '', parentId: null, char: '', depth: 0, children: [] });
  for (const word of words) {
    let curId = '';
    for (let i = 0; i < word.length; i++) {
      const prefix = word.slice(0, i + 1);
      const cur = nodes.get(curId);
      if (!cur) break;
      if (!nodes.has(prefix)) {
        nodes.set(prefix, { id: prefix, parentId: curId, char: word[i], depth: cur.depth + 1, children: [] });
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

function computeGeometry(words: string[], W: number): { nodes: Map<string, TrieShape>; geo: Geometry } {
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
  dfs('');
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
  return { nodes, geo: { x, y, height, captionY: HEADER_H + diagramH + 26 } };
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
const NODE_R = 15;
const CURSOR_R = 7;
const MARK_R = 5;

type ChipState = 'pending' | 'active' | 'done';
type ChipEl = { rect: SVGRectElement; label: SVGTextElement };
type NodeEl = { group: SVGGElement; circle: SVGCircleElement; label: SVGTextElement };

export const sharePrefixPathStageView: CanvasView = {
  canvas: { height: 300 },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    svg.textContent = ''; // 캔버스 안쪽만 비운다 — 캔버스 자체는 러너가 이미 붙여 두었다 (S-view).
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    const chipsG = svgEl('g');
    const edgesG = svgEl('g');
    const nodesG = svgEl('g');
    const markG = svgEl('g');
    const cursorG = svgEl('g');
    const captionText = svgEl('text');
    captionText.setAttribute('text-anchor', 'middle');
    captionText.setAttribute('font-family', fonts.body);
    captionText.setAttribute('font-size', fontSizes.sm);
    captionText.setAttribute('fill', colors.text);
    svg.append(chipsG, edgesG, nodesG, markG, cursorG, captionText);

    const cursorDot = svgEl('circle');
    cursorDot.setAttribute('r', String(CURSOR_R));
    cursorDot.setAttribute('fill', colors.accent);
    cursorDot.setAttribute('opacity', '0');
    cursorG.appendChild(cursorDot);

    let words: string[] = [];
    let geo: Geometry = computeGeometry([], W).geo;
    const nodeEls = new Map<string, NodeEl>();
    const edgeEls = new Map<string, SVGLineElement>();
    const chipEls: ChipEl[] = [];

    function edgeKey(parentId: string, id: string): string {
      return `${parentId}>${id}`;
    }

    function positionOf(id: string): { x: number; y: number } {
      return { x: geo.x.get(id) ?? 0, y: geo.y.get(id) ?? 0 };
    }

    function setCaption(text: string): void {
      captionText.setAttribute('x', String(W / 2));
      captionText.setAttribute('y', String(geo.captionY));
      captionText.textContent = text;
    }

    function moveCursorTo(pos: { x: number; y: number }, animated: boolean): void {
      cursorG.style.transition = animated ? `transform ${ANIM_MS}ms ease-out` : '';
      cursorG.setAttribute('transform', `translate(${pos.x} ${pos.y})`);
      cursorDot.setAttribute('opacity', '1');
    }

    function setNodeFill(entry: NodeEl, active: boolean): void {
      entry.circle.setAttribute('fill', active ? colors.itemActive : colors.itemDefault);
      entry.label.setAttribute('fill', active ? colors.stateInk : colors.text);
    }

    function applyChipState(chip: ChipEl, state: ChipState): void {
      const fill = state === 'active' ? colors.accent : state === 'done' ? colors.itemSorted : colors.itemDefault;
      const ink = state === 'active' ? colors.stateInk : state === 'done' ? colors.textInverse : colors.text;
      chip.rect.setAttribute('fill', fill);
      chip.rect.setAttribute('stroke', colors.border);
      chip.label.setAttribute('fill', ink);
    }

    function renderRoot(): void {
      const pos = positionOf('');
      const dot = svgEl('circle');
      dot.setAttribute('cx', String(pos.x));
      dot.setAttribute('cy', String(pos.y));
      dot.setAttribute('r', '6');
      dot.setAttribute('fill', colors.textMuted);
      nodesG.appendChild(dot);
    }

    function renderChips(): void {
      const layout = layoutChips(words, W);
      words.forEach((word, i) => {
        const { x, w } = layout[i];
        const rect = svgEl('rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', '14');
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', '26');
        rect.setAttribute('rx', '6');
        rect.setAttribute('stroke-width', '1');

        const label = svgEl('text');
        label.setAttribute('x', String(x + w / 2));
        label.setAttribute('y', String(14 + 13));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.setAttribute('font-family', fonts.mono);
        label.setAttribute('font-size', fontSizes.sm);
        label.textContent = word;

        chipsG.append(rect, label);
        const chip: ChipEl = { rect, label };
        chipEls.push(chip);
        applyChipState(chip, 'pending');
      });
    }

    function setChipStates(activeIndex: number): void {
      chipEls.forEach((chip, i) => {
        applyChipState(chip, i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending');
      });
    }

    function flashEdge(parentId: string, nodeId: string): void {
      const line = edgeEls.get(edgeKey(parentId, nodeId));
      if (!line) return;
      line.setAttribute('stroke', colors.itemActive);
      setTimeout(() => line.setAttribute('stroke', colors.border), ANIM_MS);
    }

    function init(payload: { words: string[] }): void {
      words = payload.words;
      const built = computeGeometry(words, W);
      geo = built.geo;

      svg.setAttribute('viewBox', `0 0 ${W} ${geo.height}`);
      svg.setAttribute('height', String(geo.height));

      nodesG.textContent = '';
      edgesG.textContent = '';
      markG.textContent = '';
      chipsG.textContent = '';
      nodeEls.clear();
      edgeEls.clear();
      chipEls.length = 0;

      renderRoot();
      renderChips();
      cursorDot.setAttribute('opacity', '0');
      setCaption('');
    }

    function rewind(): void {
      nodesG.textContent = '';
      edgesG.textContent = '';
      markG.textContent = '';
      nodeEls.clear();
      edgeEls.clear();
      renderRoot();
      chipEls.forEach((chip) => applyChipState(chip, 'pending'));
      cursorDot.setAttribute('opacity', '0');
      setCaption('');
    }

    function beginWord(payload: { word: string; wordIndex: number }): void {
      setChipStates(payload.wordIndex);
      moveCursorTo(positionOf(''), false);
      setCaption(t('caption.begin', "Inserting '{word}'.", { word: payload.word }));
    }

    async function ride(payload: { nodeId: string; parentId: string; char: string }): Promise<void> {
      const entry = nodeEls.get(payload.nodeId);
      if (entry) setNodeFill(entry, true);
      flashEdge(payload.parentId, payload.nodeId);
      moveCursorTo(positionOf(payload.nodeId), true);
      await sleep(ANIM_MS);
      if (entry) setNodeFill(entry, false);
    }

    async function grow(payload: { nodeId: string; parentId: string; char: string; depth: number }): Promise<void> {
      const parentPos = positionOf(payload.parentId);
      const finalPos = positionOf(payload.nodeId);

      const line = svgEl('line');
      line.setAttribute('x1', String(parentPos.x));
      line.setAttribute('y1', String(parentPos.y));
      line.setAttribute('x2', String(parentPos.x));
      line.setAttribute('y2', String(parentPos.y));
      line.setAttribute('stroke', colors.border);
      line.setAttribute('stroke-width', '2');
      line.style.transition = `x2 ${ANIM_MS}ms ease-out, y2 ${ANIM_MS}ms ease-out`;
      edgesG.appendChild(line);
      edgeEls.set(edgeKey(payload.parentId, payload.nodeId), line);

      const group = svgEl('g');
      group.style.transition = `transform ${ANIM_MS}ms ease-out`;
      group.setAttribute('transform', `translate(${parentPos.x} ${parentPos.y}) scale(0.35)`);

      const circle = svgEl('circle');
      circle.setAttribute('r', String(NODE_R));
      circle.setAttribute('stroke', colors.border);
      circle.setAttribute('stroke-width', '1.5');

      const label = svgEl('text');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.setAttribute('font-family', fonts.mono);
      label.setAttribute('font-size', fontSizes.md);
      label.setAttribute('font-weight', '600');
      label.textContent = payload.char;

      group.append(circle, label);
      nodesG.appendChild(group);

      const entry: NodeEl = { group, circle, label };
      nodeEls.set(payload.nodeId, entry);
      setNodeFill(entry, true);

      nextFrame(() => {
        group.setAttribute('transform', `translate(${finalPos.x} ${finalPos.y}) scale(1)`);
        line.setAttribute('x2', String(finalPos.x));
        line.setAttribute('y2', String(finalPos.y));
        moveCursorTo(finalPos, true);
      });

      await sleep(ANIM_MS);
      setNodeFill(entry, false);
    }

    function markWord(payload: { nodeId: string; word: string }): void {
      const entry = nodeEls.get(payload.nodeId);
      if (!entry) return;
      const dot = svgEl('circle');
      dot.setAttribute('r', String(MARK_R));
      dot.setAttribute('cx', String(NODE_R - 4));
      dot.setAttribute('cy', String(-(NODE_R - 4)));
      dot.setAttribute('fill', colors.accent);
      entry.group.appendChild(dot);

      const pos = positionOf(payload.nodeId);
      const label = svgEl('text');
      label.setAttribute('x', String(pos.x));
      label.setAttribute('y', String(pos.y + NODE_R + 14));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-family', fonts.body);
      label.setAttribute('font-size', fontSizes.xs);
      label.setAttribute('fill', colors.text);
      label.textContent = payload.word;
      markG.appendChild(label);
    }

    function endWord(payload: { word: string; wordIndex: number; rode: number; grown: number }): void {
      const chip = chipEls[payload.wordIndex];
      if (chip) applyChipState(chip, 'done');
      const vars: Record<string, string | number> = { word: payload.word, rode: payload.rode, grown: payload.grown };
      setCaption(t('caption.wordEnd', "'{word}': rode {rode}, grew {grown}.", vars));
    }

    function summarize(payload: { wordCount: number; totalSeats: number; rawChars: number; saved: number }): void {
      const vars: Record<string, number> = {
        wordCount: payload.wordCount,
        totalSeats: payload.totalSeats,
        rawChars: payload.rawChars,
        saved: payload.saved,
      };
      setCaption(
        t(
          'caption.summary',
          '{wordCount} words, {totalSeats} seats (root included) instead of {rawChars} separate ones — saved {saved}.',
          vars,
        ),
      );
    }

    return {
      init,
      rewind,
      beginWord,
      ride,
      grow,
      markWord,
      endWord,
      summarize,
      destroy(): void {
        // 걸어 둔 타이머(sleep · flashEdge)와 rAF 는 모두 한 번만 걸고 끝나며,
        // 깨어나도 이미 떨어져 나간 자기 노드만 건드린다. 러너가 마운트마다 새
        // 캔버스를 만들므로 새 화면에 닿을 길이 없다 (S-view).
      },
    };
  },
};
