/**
 * kruskal-mst-stage — 줄과 그래프를 한 캔버스에 나란히 그린다.
 *
 * 왼쪽은 **줄**이다. 간선 열하나가 세로로 서 있고, 무게 순으로 줄을 서는 동안
 * 칸이 오르내린다. 집는 것은 언제나 맨 위부터라 커서는 위에서 아래로만 내려간다.
 * 버려진 간선은 줄 밖으로 밀려나며 흐려진다 — 버린다는 것이 자리에서 빠지는
 * 일로 보이게 하려는 것이다.
 *
 * 오른쪽은 **그래프**다. 정점 일곱이 저마다 다른 무리 색으로 시작하고, 간선을
 * 이을 때마다 두 무리의 색이 하나로 번진다. 마지막에 일곱이 한 색이 되는 것이
 * "흩어진 무리들이 하나로 합쳐진다" 는 말의 그림이다.
 *
 * 색은 전부 토큰이다 (S-view 결정 트리):
 *   무리 식별       categorical(n, 'pastel' | 'vivid')  — n 개 카테고리 식별
 *   지금 보는 것    itemComparing                        — 알고리즘 상태
 *   이은 것         itemSorted                           — 알고리즘 상태 (확정)
 *   고리가 되는 것  danger                               — 버림 신호
 *   나머지          border · bgSubtle · text · textMuted — 구조
 *
 * 세로는 마운트 뒤 바뀌지 않는다. 정점 수와 간선 수가 초기 데이터로 정해져
 * 있으므로 줄의 길이도 그래프의 크기도 처음에 한 번 정해진다 (S-view).
 *
 * 타이머를 쓰지 않는다. 모든 움직임은 CSS transition 이라 `destroy()` 에서
 * 노드를 걷어내면 그것으로 끝난다 — 깨어나 무엇을 건드릴 예약이 없다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스. 폭은 러너가 viewBox 로 걸고, 세로는 여기서 한 번 정해진 뒤 바뀌지 않는다. */
const W = 700;
const H = 348;

// ── 줄 (왼쪽)
const LINE_X = 16;
const CHIP_W = 152;
const CHIP_H = 22;
const SLOT_PITCH = 26;
const SLOT_TOP = 40;
const CURSOR_X = 7;
/** 버린 칸이 줄 밖으로 밀려나는 거리. */
const DROP_SHIFT = 12;

// ── 그래프 (오른쪽)
const GX = 448;
const GY = 172;
const GRX = 152;
const GRY = 112;
const NODE_R = 19;

const CAPTION_Y = 336;

const EASE_FAST = '160ms ease';
const EASE_MOVE = '220ms ease';

type StageEdge = { id: number; u: number; v: number; w: number };
type StageData = { vertexCount: number; edges: StageEdge[] };

type EdgeMood = 'idle' | 'focus' | 'reject' | 'linked' | 'dropped';

type ChipParts = {
  g: SVGGElement;
  box: SVGRectElement;
  weight: SVGTextElement;
  label: SVGTextElement;
  strike: SVGLineElement;
};

type EdgeParts = {
  line: SVGLineElement;
  plate: SVGRectElement;
  text: SVGTextElement;
};

type NodeParts = {
  halo: SVGCircleElement;
  disc: SVGCircleElement;
  text: SVGTextElement;
};

function attr(node: Element, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  attr(node, attrs);
  return node;
}

function readData(raw: unknown): StageData | null {
  const d = raw as { vertexCount?: unknown; edges?: unknown } | undefined;
  if (typeof d?.vertexCount !== 'number' || !Array.isArray(d.edges)) return null;
  const edges: StageEdge[] = [];
  d.edges.forEach((item, i) => {
    const e = item as { u?: unknown; v?: unknown; w?: unknown };
    if (typeof e?.u !== 'number' || typeof e.v !== 'number' || typeof e.w !== 'number') return;
    edges.push({ id: i, u: e.u, v: e.v, w: e.w });
  });
  if (edges.length === 0) return null;
  return { vertexCount: d.vertexCount, edges };
}

export const kruskalMstStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    // 러너가 붙여 준 캔버스는 그대로 두고 그 안쪽만 쓴다 (S-view).
    const root = make('g', {});
    canvas.appendChild(root);

    const edgeLayer = make('g', {});
    const nodeLayer = make('g', {});
    const lineLayer = make('g', {});
    const chrome = make('g', {});
    root.appendChild(edgeLayer);
    root.appendChild(nodeLayer);
    root.appendChild(lineLayer);
    root.appendChild(chrome);

    const heading = make('text', {
      x: LINE_X,
      y: 26,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    heading.textContent = tr('label.line', 'By weight');
    chrome.appendChild(heading);

    const caption = make('text', {
      x: LINE_X,
      y: CAPTION_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    chrome.appendChild(caption);

    const cursor = make('path', {
      d: 'M 0 -5 L 7 0 L 0 5 Z',
      fill: colors.itemComparing,
      opacity: 0,
    });
    cursor.style.transition = `transform ${EASE_MOVE}, opacity ${EASE_FAST}`;
    chrome.appendChild(cursor);

    // ── 상태
    let data: StageData | null = null;
    /** 자리 → 간선 번호. 줄이 섞여도 칸은 자기 번호를 잃지 않는다. */
    let slots: number[] = [];
    /** 정점 → 그 정점이 속한 무리의 뿌리. */
    let roots: number[] = [];
    let focusId: number | null = null;
    const chips = new Map<number, ChipParts>();
    const edgeParts = new Map<number, EdgeParts>();
    const nodeParts: NodeParts[] = [];
    const moods = new Map<number, EdgeMood>();

    const setCaption = (key: string, fallback: string, vars?: Record<string, string | number>) => {
      caption.textContent = tr(key, fallback, vars);
    };

    const slotY = (slot: number) => SLOT_TOP + slot * SLOT_PITCH;

    const nodeAt = (i: number, n: number) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return { x: GX + GRX * Math.cos(a), y: GY + GRY * Math.sin(a) };
    };

    const edgeName = (e: StageEdge) => `${e.u}–${e.v}`;

    // ── 칠하기

    const paintChip = (id: number): void => {
      const chip = chips.get(id);
      const edge = data?.edges[id];
      if (!chip || !edge) return;
      const mood = moods.get(id) ?? 'idle';
      const slot = slots.indexOf(id);
      const shifted = mood === 'dropped' ? LINE_X - DROP_SHIFT : LINE_X;
      // 자리는 style 과 attribute 양쪽에 적는다. CSS transform 을 아는 브라우저는
      // style 을 보고 옮겨 가는 동안을 이어 그리고, 그것을 모르는 그리개는
      // attribute 로도 같은 자리에 놓는다 — 둘 다 같은 값이라 어긋날 일이 없다.
      chip.g.style.transform = `translate(${shifted}px, ${slotY(slot)}px)`;
      attr(chip.g, { transform: `translate(${shifted}, ${slotY(slot)})` });
      chip.g.style.opacity = mood === 'dropped' ? '0.4' : '1';

      const fill =
        mood === 'focus' || mood === 'reject'
          ? mood === 'reject'
            ? colors.danger
            : colors.itemComparing
          : mood === 'linked'
            ? colors.itemSorted
            : colors.bgSubtle;
      const ink =
        mood === 'focus' || mood === 'reject'
          ? colors.stateInk
          : mood === 'linked'
            ? colors.textInverse
            : colors.text;
      attr(chip.box, { fill, stroke: mood === 'idle' || mood === 'dropped' ? colors.border : fill });
      attr(chip.weight, { fill: ink });
      attr(chip.label, { fill: ink });
      attr(chip.strike, { stroke: ink, opacity: mood === 'dropped' ? 1 : 0 });
    };

    const paintEdge = (id: number): void => {
      const parts = edgeParts.get(id);
      if (!parts) return;
      const mood = moods.get(id) ?? 'idle';
      const stroke =
        mood === 'focus'
          ? colors.itemComparing
          : mood === 'reject'
            ? colors.danger
            : mood === 'linked'
              ? colors.itemSorted
              : colors.border;
      const width = mood === 'linked' ? 4.5 : mood === 'idle' || mood === 'dropped' ? 1.5 : 3.5;
      attr(parts.line, {
        stroke,
        'stroke-width': width,
        'stroke-dasharray': mood === 'dropped' || mood === 'reject' ? '3 4' : 'none',
        opacity: mood === 'dropped' ? 0.28 : 1,
      });
      attr(parts.text, {
        fill: mood === 'idle' || mood === 'dropped' ? colors.textMuted : colors.text,
        'font-weight': mood === 'linked' ? 700 : 400,
      });
      attr(parts.plate, { opacity: mood === 'dropped' ? 0.28 : 1 });
    };

    const paintNodes = (): void => {
      if (!data) return;
      const n = data.vertexCount;
      const pastel = categorical(n, 'pastel');
      const vivid = categorical(n, 'vivid');
      nodeParts.forEach((parts, i) => {
        const r = roots[i] ?? i;
        attr(parts.disc, { fill: pastel[r % n] ?? colors.bgSubtle, stroke: vivid[r % n] ?? colors.border });
      });
    };

    const clearHalos = (): void => {
      for (const parts of nodeParts) attr(parts.halo, { opacity: 0 });
    };

    const haloGroup = (rootId: number, stroke: string): void => {
      if (!data) return;
      roots.forEach((r, i) => {
        if (r !== rootId) return;
        const parts = nodeParts[i];
        if (!parts) return;
        attr(parts.halo, { opacity: 1, stroke });
      });
    };

    // ── 짓기

    const build = (next: StageData): void => {
      chips.clear();
      edgeParts.clear();
      nodeParts.length = 0;
      moods.clear();
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      lineLayer.textContent = '';

      data = next;
      slots = next.edges.map((e) => e.id);
      roots = Array.from({ length: next.vertexCount }, (_, i) => i);
      focusId = null;

      // 그래프의 간선
      for (const e of next.edges) {
        const a = nodeAt(e.u, next.vertexCount);
        const b = nodeAt(e.v, next.vertexCount);
        const line = make('line', {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          'stroke-linecap': 'round',
        });
        line.style.transition = `stroke ${EASE_FAST}, stroke-width ${EASE_FAST}, opacity ${EASE_FAST}`;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const plate = make('rect', {
          x: mx - 10,
          y: my - 8,
          width: 20,
          height: 15,
          rx: 3,
          fill: colors.bg,
        });
        const text = make('text', {
          x: mx,
          y: my + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        text.textContent = String(e.w);
        edgeLayer.appendChild(line);
        edgeLayer.appendChild(plate);
        edgeLayer.appendChild(text);
        edgeParts.set(e.id, { line, plate, text });
        moods.set(e.id, 'idle');
        paintEdge(e.id);
      }

      // 그래프의 정점
      for (let i = 0; i < next.vertexCount; i += 1) {
        const p = nodeAt(i, next.vertexCount);
        const halo = make('circle', {
          cx: p.x,
          cy: p.y,
          r: NODE_R + 5,
          fill: 'none',
          'stroke-width': 2.5,
          stroke: colors.border,
          opacity: 0,
        });
        halo.style.transition = `opacity ${EASE_FAST}, stroke ${EASE_FAST}`;
        const disc = make('circle', { cx: p.x, cy: p.y, r: NODE_R, 'stroke-width': 2 });
        disc.style.transition = `fill ${EASE_MOVE}, stroke ${EASE_MOVE}`;
        const text = make('text', {
          x: p.x,
          y: p.y + 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: colors.text,
        });
        text.textContent = String(i);
        nodeLayer.appendChild(halo);
        nodeLayer.appendChild(disc);
        nodeLayer.appendChild(text);
        nodeParts.push({ halo, disc, text });
      }
      paintNodes();

      // 줄
      for (const e of next.edges) {
        const g = make('g', {});
        g.style.transition = `transform ${EASE_MOVE}, opacity ${EASE_MOVE}`;
        const box = make('rect', {
          x: 0,
          y: 0,
          width: CHIP_W,
          height: CHIP_H,
          rx: 4,
          'stroke-width': 1,
        });
        const weight = make('text', {
          x: 12,
          y: 15,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
        });
        weight.textContent = String(e.w);
        const label = make('text', {
          x: 40,
          y: 15,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        });
        label.textContent = edgeName(e);
        const strike = make('line', {
          x1: 36,
          y1: 11,
          x2: 96,
          y2: 11,
          'stroke-width': 1.5,
          opacity: 0,
        });
        g.appendChild(box);
        g.appendChild(weight);
        g.appendChild(label);
        g.appendChild(strike);
        lineLayer.appendChild(g);
        chips.set(e.id, { g, box, weight, label, strike });
        paintChip(e.id);
      }

      attr(cursor, { opacity: 0 });
      setCaption('caption.sort', 'Line the edges up by weight.');
    };

    const initial = readData(params.initialData);
    if (initial) build(initial);

    // ── Projector 가 부르는 표면

    const instance: ViewInstance = {
      setup(raw: unknown): void {
        const next = readData(raw);
        if (next) build(next);
      },

      /** 각 정점이 제 무리로 선다. */
      makeSet(nextRoots: number[]): void {
        roots = nextRoots.slice();
        paintNodes();
        setCaption('caption.makeSet', 'Every vertex starts as its own group.');
      },

      /** 줄에서 이웃한 두 자리를 맞바꾼다. */
      swapSlots(a: number, b: number): void {
        const idA = slots[a];
        const idB = slots[b];
        if (idA === undefined || idB === undefined) return;
        slots[a] = idB;
        slots[b] = idA;
        paintChip(idA);
        paintChip(idB);
        setCaption('caption.sort', 'Line the edges up by weight.');
      },

      /** 줄의 slot 번째 자리에서 간선을 집어 든다. */
      focusEdge(slot: number, id: number): void {
        const edge = data?.edges[id];
        if (!edge) return;
        clearHalos();
        if (focusId !== null && moods.get(focusId) === 'focus') {
          moods.set(focusId, 'idle');
          paintChip(focusId);
          paintEdge(focusId);
        }
        focusId = id;
        moods.set(id, 'focus');
        paintChip(id);
        paintEdge(id);
        cursor.style.transform = `translate(${CURSOR_X}px, ${slotY(slot) + CHIP_H / 2}px)`;
        attr(cursor, { transform: `translate(${CURSOR_X}, ${slotY(slot) + CHIP_H / 2})` });
        attr(cursor, { opacity: 1 });
        setCaption('caption.take', 'Take edge {edge}, weight {w}.', {
          edge: edgeName(edge),
          w: edge.w,
        });
      },

      /** 두 끝에서 타고 올라간 뿌리를 무리째 비춘다. */
      showRoots(rootU: number, rootV: number): void {
        if (!data) return;
        clearHalos();
        const vivid = categorical(data.vertexCount, 'vivid');
        haloGroup(rootU, vivid[rootU % data.vertexCount] ?? colors.border);
        haloGroup(rootV, vivid[rootV % data.vertexCount] ?? colors.border);
        setCaption('caption.roots', 'Climb from both ends — roots {a}, {b}.', {
          a: rootU,
          b: rootV,
        });
      },

      /** 뿌리 둘을 견준 결과. 같으면 고리가 된다. */
      judge(same: boolean, rootU: number, rootV: number): void {
        if (!data) return;
        if (same) {
          clearHalos();
          haloGroup(rootU, colors.danger);
          if (focusId !== null) {
            moods.set(focusId, 'reject');
            paintChip(focusId);
            paintEdge(focusId);
          }
          setCaption('caption.same', 'Same root, so this edge would close a cycle. Drop it.');
          return;
        }
        const vivid = categorical(data.vertexCount, 'vivid');
        clearHalos();
        haloGroup(rootU, vivid[rootU % data.vertexCount] ?? colors.border);
        haloGroup(rootV, vivid[rootV % data.vertexCount] ?? colors.border);
        setCaption('caption.join', 'Different roots, so the two groups become one.');
      },

      /** 잇는다. */
      linkEdge(id: number): void {
        moods.set(id, 'linked');
        paintChip(id);
        paintEdge(id);
      },

      /** 버린다 — 줄 밖으로 밀려난다. */
      dropEdge(id: number): void {
        moods.set(id, 'dropped');
        paintChip(id);
        paintEdge(id);
        clearHalos();
      },

      /** 무리 지도가 바뀌었다. 합쳐진 무리는 한 색이 된다. */
      setGroups(nextRoots: number[]): void {
        roots = nextRoots.slice();
        paintNodes();
        clearHalos();
      },

      finish(picked: number, dropped: number, total: number): void {
        clearHalos();
        attr(cursor, { opacity: 0 });
        focusId = null;
        setCaption('caption.done', 'Joined {picked}, dropped {dropped}. Total weight {total}.', {
          picked,
          dropped,
          total,
        });
      },

      resetAll(): void {
        if (data) build(data);
      },

      destroy(): void {
        // 타이머도 관찰자도 없다. 움직임은 전부 CSS transition 이라
        // 노드를 걷어내면 남는 것이 없다.
        root.remove();
      },
    };

    return instance;
  },
};
