/**
 * decision-tree-stage — 의사결정 트리 전용 시각화 한 폭.
 *
 * 왼쪽은 점 열여덟이 놓인 판이고 오른쪽은 자라는 나무다. 둘은 같은 것의 두
 * 얼굴이다 — 나무에 질문이 하나 늘 때마다 판에 자름선이 하나 그어지고, 판의
 * 칸 하나가 나무의 잎 하나다.
 *
 * ── 무엇을 그리는가
 *
 * - **판** — 이름표 색으로 칠한 점 열여덟. **끝자락**(아직 자식이 열리지 않은
 *   자리)마다 그 자리가 내놓는 이름표의 옅은 색지를 깔아 경계가 드러나게 한다.
 *   자름이 정해진 노드는 자식이 열리기 전에도 선을 긋는데, 그 사이 잠깐은 한 색지
 *   위에 선만 그어진 모양이 된다 — 자식이 열리면 색지가 갈린다. 틀리게 맞힌 점에는
 *   붉은 테를 두른다. 시험 중인 자름 후보는 점선으로 미끄러지고, 지금까지 가장
 *   좋은 것은 강조색 점선으로 남는다. **축이 바뀌면 선이 서 있다 누워 있다 한다.**
 * - **나무** — 노드마다 섞임 막대(A 몫 · B 몫)와 그 노드가 던지는 질문. 잎은
 *   이름표 한 글자. 지금 보는 노드에는 테를 두른다.
 * - **아래 띠** — 지금 무슨 일이 일어나는지 한 줄, 지금 나무의 셈 한 줄,
 *   이 깊이가 무엇을 말하는지 한 줄.
 *
 * ── 좌표
 *
 * `initialData` 에는 점의 자료 좌표만 있다. 화면 좌표는 전부 여기서 셈한다 —
 * 판의 테두리는 점들의 최소·최대에 여백을 더해 마운트 때 한 번 정하고, 그
 * 뒤로 바뀌지 않는다.
 *
 * ── 높이
 *
 * `viewBox` 는 러너가 `canvas` 선언대로 한 번 잡고 이 view 는 손대지 않는다
 * (S-view). 나무가 깊어져도 줄 간격을 줄여 담지 높이를 늘리지 않는다.
 *
 * ── 뒷일
 *
 * 타이머도 프레임 루프도 리스너도 두지 않는다. 그리기는 이벤트마다 캔버스를
 * 통째로 다시 그리는 것이 전부라, `destroy()` 가 거둘 것은 붙인 DOM 뿐이다.
 * (이 주석은 사실이어야 한다 — 뒤에 타이머를 더하면 이 문단도 함께 고친다.)
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';

/**
 * projector 가 넘겨 주는 것의 모양 — `algorithm.ts` 에서 가져오지 않는다.
 *
 * view 는 알고리즘 계층의 존재를 몰라야 한다 (원칙 1 · S-view). 타입만 빌려
 * 오는 것도 소스에서 view → algorithm 방향의 의존을 만든다. 구조가 같으면
 * 그대로 들어오므로 여기에 따로 적는다.
 */
export type StagePoint = { x: number; y: number; label: 0 | 1 };

/** 아직 잎인지 가를지 정해지지 않은 채 열린 노드. */
export type StageOpenedNode = {
  id: number;
  parent: number;
  side: 'root' | 'L' | 'R';
  depth: number;
  a: number;
  b: number;
  gini: number;
};

/** 다 자란 나무의 한 칸. */
export type StageTreeNode = StageOpenedNode & {
  leaf: boolean;
  label: 0 | 1;
  axis: 0 | 1;
  cut: number;
  left: number;
  right: number;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 720;
const CANVAS_H = 400;

/** 판. */
const PLOT = { x0: 46, y0: 42, x1: 330, y1: 298 };
/** 나무. */
const TREE = { x0: 356, y0: 42, x1: 708, y1: 300 };
/** 아래 띠의 세 줄. */
const CAPTION_Y = 326;
const SUMMARY_Y = 350;
const VERDICT_Y = 374;

const NODE_W = 52;
const NODE_H = 28;
const MIX_W = 42;
const MIX_H = 6;
const ROW_GAP_MAX = 50;
const POINT_R = 4;

/** 축 이름은 그림에 새겨진 표식이라 번역하지 않는다 (C10). */
const AXIS_MARK = ['x', 'y'] as const;
/** 이름표도 표식이다 — 도형 위의 한 글자. */
const CLASS_MARK = ['A', 'B'] as const;

type VNode = {
  id: number;
  parent: number;
  side: 'root' | 'L' | 'R';
  depth: number;
  a: number;
  b: number;
  gini: number;
  leaf: boolean;
  label: 0 | 1;
  axis: 0 | 1;
  cut: number;
  left: number;
  right: number;
};

type Rect = { x0: number; x1: number; y0: number; y1: number };

type CutMark = { id: number; axis: 0 | 1; cut: number };

function el<T extends SVGElement>(name: string, attrs: Record<string, string | number>): T {
  const node = document.createElementNS(SVG_NS, name) as T;
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function fromShape(n: StageTreeNode): VNode {
  return {
    id: n.id,
    parent: n.parent,
    side: n.side,
    depth: n.depth,
    a: n.a,
    b: n.b,
    gini: n.gini,
    leaf: n.leaf,
    label: n.label,
    axis: n.axis,
    cut: n.cut,
    left: n.left,
    right: n.right,
  };
}

export const decisionTreeStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;

    // 이름표 둘을 가르는 색 — 알고리즘 상태가 아니라 n 개 카테고리 식별이다
    // (S-view 결정 트리 3번). 색지는 같은 시드의 파스텔 톤.
    const classInk = categorical(2, 'vivid');
    const classTint = categorical(2, 'pastel');

    const initial = (params.initialData ?? {}) as { points?: unknown };
    const points: StagePoint[] = Array.isArray(initial.points)
      ? (initial.points as StagePoint[]).filter(
          (p) =>
            typeof p?.x === 'number' &&
            typeof p?.y === 'number' &&
            (p.label === 0 || p.label === 1),
        )
      : [];

    // 판의 테두리는 마운트 때 한 번 정하고 그 뒤로 바뀌지 않는다.
    const pad = 0.45;
    const bounds: Rect =
      points.length > 0
        ? {
            x0: Math.min(...points.map((p) => p.x)) - pad,
            x1: Math.max(...points.map((p) => p.x)) + pad,
            y0: Math.min(...points.map((p) => p.y)) - pad,
            y1: Math.max(...points.map((p) => p.y)) + pad,
          }
        : { x0: 0, x1: 1, y0: 0, y1: 1 };

    const sx = (x: number): number =>
      PLOT.x0 + ((x - bounds.x0) / (bounds.x1 - bounds.x0)) * (PLOT.x1 - PLOT.x0);
    const sy = (y: number): number =>
      PLOT.y1 - ((y - bounds.y0) / (bounds.y1 - bounds.y0)) * (PLOT.y1 - PLOT.y0);

    const nodes = new Map<number, VNode>();
    let depthLimit = 1;
    let currentId: number | null = null;
    let trying: CutMark | null = null;
    let best: CutMark | null = null;
    let caption = '';
    let summary = '';
    let verdict = '';

    // ── 나무 걷기 ────────────────────────────────────────────────────────

    /** 실제로 열려 있는 자식들. 전위 순서라 왼쪽이 먼저 열리고 오른쪽은 나중이다. */
    function openChildren(n: VNode): number[] {
      if (n.leaf) return [];
      const out: number[] = [];
      if (n.left >= 0 && nodes.has(n.left)) out.push(n.left);
      if (n.right >= 0 && nodes.has(n.right)) out.push(n.right);
      return out;
    }

    /** 아직 아무 자식도 열리지 않은 끝자락. 색지와 자리 배분에서 잎처럼 다룬다. */
    function isFrontier(n: VNode): boolean {
      return openChildren(n).length === 0;
    }

    function frontierInOrder(): VNode[] {
      const out: VNode[] = [];
      const walk = (id: number): void => {
        const n = nodes.get(id);
        if (!n) return;
        const kids = openChildren(n);
        if (kids.length === 0) {
          out.push(n);
          return;
        }
        for (const k of kids) walk(k);
      };
      walk(0);
      return out;
    }

    /** 점 하나가 떨어지는 자리. 아직 안 자란 가지는 그 자리에서 멈춘다. */
    function landingOf(p: StagePoint): VNode | null {
      let n = nodes.get(0) ?? null;
      while (n !== null && !isFrontier(n)) {
        const v = n.axis === 0 ? p.x : p.y;
        const next = nodes.get(v < n.cut ? n.left : n.right);
        if (!next) break;
        n = next;
      }
      return n;
    }

    /** 노드마다 자기 영역(자료 좌표). 뿌리는 판 전체, 자식은 부모를 자름값으로 자른 것. */
    function regions(): Map<number, Rect> {
      const out = new Map<number, Rect>();
      const walk = (id: number, r: Rect): void => {
        const n = nodes.get(id);
        if (!n) return;
        out.set(id, r);
        if (n.leaf) return;
        const half = (side: 'L' | 'R'): Rect =>
          n.axis === 0
            ? side === 'L'
              ? { ...r, x1: Math.min(r.x1, n.cut) }
              : { ...r, x0: Math.max(r.x0, n.cut) }
            : side === 'L'
              ? { ...r, y1: Math.min(r.y1, n.cut) }
              : { ...r, y0: Math.max(r.y0, n.cut) };
        if (n.left >= 0 && nodes.has(n.left)) walk(n.left, half('L'));
        if (n.right >= 0 && nodes.has(n.right)) walk(n.right, half('R'));
      };
      walk(0, bounds);
      return out;
    }

    /** 나무의 화면 자리. 끝자락을 왼쪽부터 한 칸씩 놓고 부모는 자식들의 가운데. */
    function positions(): Map<number, { x: number; y: number }> {
      const out = new Map<number, { x: number; y: number }>();
      const rowGap = Math.min(ROW_GAP_MAX, (TREE.y1 - TREE.y0) / (depthLimit + 1));
      const ends = frontierInOrder();
      const slot = (TREE.x1 - TREE.x0) / Math.max(1, ends.length);
      const slotOf = new Map<number, number>();
      ends.forEach((n, i) => slotOf.set(n.id, TREE.x0 + slot * (i + 0.5)));
      const place = (id: number): number => {
        const n = nodes.get(id);
        if (!n) return TREE.x0;
        const y = TREE.y0 + NODE_H / 2 + n.depth * rowGap;
        const kids = openChildren(n);
        if (kids.length === 0) {
          const x = slotOf.get(id) ?? TREE.x0;
          out.set(id, { x, y });
          return x;
        }
        const xs = kids.map(place);
        const x = (Math.min(...xs) + Math.max(...xs)) / 2;
        out.set(id, { x, y });
        return x;
      };
      if (nodes.has(0)) place(0);
      return out;
    }

    // ── 그리기 ───────────────────────────────────────────────────────────

    function drawFrame(): void {
      svg.appendChild(
        el('rect', {
          x: PLOT.x0 - 10,
          y: PLOT.y0 - 10,
          width: PLOT.x1 - PLOT.x0 + 20,
          height: PLOT.y1 - PLOT.y0 + 20,
          rx: parseFloat(radii.md),
          fill: colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      const scatterLabel = el<SVGTextElement>('text', {
        x: PLOT.x0 - 10,
        y: PLOT.y0 - 18,
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      scatterLabel.textContent = tr('label.scatter', 'Eighteen labelled points');
      svg.appendChild(scatterLabel);

      const treeLabel = el<SVGTextElement>('text', {
        x: TREE.x0,
        y: PLOT.y0 - 18,
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      treeLabel.textContent = tr('label.tree', 'The tree it grows');
      svg.appendChild(treeLabel);

      // 이름표 두 개의 색 견본. 글자는 표식이라 번역하지 않는다.
      for (let i = 0; i < 2; i++) {
        const cx = PLOT.x1 - 54 + i * 28;
        svg.appendChild(
          el('circle', { cx, cy: PLOT.y0 - 22, r: POINT_R, fill: classInk[i] }),
        );
        const mark = el<SVGTextElement>('text', {
          x: cx + 7,
          y: PLOT.y0 - 18,
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        mark.textContent = CLASS_MARK[i];
        svg.appendChild(mark);
      }
    }

    function drawPlot(): void {
      const reg = regions();

      // 지금 끝자락인 칸마다 그 자리가 내놓는 이름표의 색지.
      for (const n of frontierInOrder()) {
        const r = reg.get(n.id);
        if (!r) continue;
        svg.appendChild(
          el('rect', {
            x: sx(r.x0),
            y: sy(r.y1),
            width: Math.max(0, sx(r.x1) - sx(r.x0)),
            height: Math.max(0, sy(r.y0) - sy(r.y1)),
            fill: classTint[n.label],
            'fill-opacity': 0.55,
          }),
        );
      }

      // 확정된 자름선 — 자기 노드 영역 안에서만 그어진다.
      for (const n of nodes.values()) {
        if (n.leaf) continue;
        const r = reg.get(n.id);
        if (!r) continue;
        const line =
          n.axis === 0
            ? { x1: sx(n.cut), x2: sx(n.cut), y1: sy(r.y0), y2: sy(r.y1) }
            : { x1: sx(r.x0), x2: sx(r.x1), y1: sy(n.cut), y2: sy(n.cut) };
        svg.appendChild(
          el('line', { ...line, stroke: colors.text, 'stroke-width': 1.6 }),
        );
      }

      // 시험 중인 후보와 지금까지 가장 좋은 것.
      const mark = (m: CutMark | null, stroke: string, dash: string): void => {
        if (!m) return;
        const r = reg.get(m.id) ?? bounds;
        const line =
          m.axis === 0
            ? { x1: sx(m.cut), x2: sx(m.cut), y1: sy(r.y0), y2: sy(r.y1) }
            : { x1: sx(r.x0), x2: sx(r.x1), y1: sy(m.cut), y2: sy(m.cut) };
        svg.appendChild(
          el('line', {
            ...line,
            stroke,
            'stroke-width': 1.8,
            'stroke-dasharray': dash,
          }),
        );
      };
      mark(best, colors.accent, '6 3');
      mark(trying, colors.itemComparing, '3 3');

      // 점. 지금 나무가 틀리게 맞히는 점에는 붉은 테.
      for (const p of points) {
        const landing = landingOf(p);
        const wrong = landing !== null && landing.label !== p.label;
        svg.appendChild(
          el('circle', {
            cx: sx(p.x),
            cy: sy(p.y),
            r: POINT_R,
            fill: classInk[p.label],
            stroke: wrong ? colors.danger : colors.bg,
            'stroke-width': wrong ? 2 : 1,
          }),
        );
      }
    }

    function drawNodeBox(n: VNode, at: { x: number; y: number }): void {
      const x = at.x - NODE_W / 2;
      const y = at.y - NODE_H / 2;
      const active = currentId === n.id;
      svg.appendChild(
        el('rect', {
          x,
          y,
          width: NODE_W,
          height: NODE_H,
          rx: parseFloat(radii.sm),
          fill: colors.bg,
          stroke: active ? colors.itemActive : colors.border,
          'stroke-width': active ? 2 : 1,
        }),
      );

      // 섞임 막대 — A 몫과 B 몫. 한 색만 남으면 그 노드는 순수하다.
      const total = Math.max(1, n.a + n.b);
      const aw = (MIX_W * n.a) / total;
      const mx = at.x - MIX_W / 2;
      const my = y + 4;
      if (aw > 0) {
        svg.appendChild(el('rect', { x: mx, y: my, width: aw, height: MIX_H, fill: classInk[0] }));
      }
      if (MIX_W - aw > 0) {
        svg.appendChild(
          el('rect', { x: mx + aw, y: my, width: MIX_W - aw, height: MIX_H, fill: classInk[1] }),
        );
      }

      const text = el<SVGTextElement>('text', {
        x: at.x,
        y: y + NODE_H - 6,
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
      });
      text.textContent = n.leaf
        ? `${CLASS_MARK[n.label]} ${n.a + n.b}`
        : `${AXIS_MARK[n.axis]}<${n.cut.toFixed(2)}`;
      svg.appendChild(text);
    }

    function drawTree(): void {
      const pos = positions();
      for (const n of nodes.values()) {
        const from = pos.get(n.id);
        for (const childId of openChildren(n)) {
          const to = pos.get(childId);
          if (!from || !to) continue;
          svg.appendChild(
            el('line', {
              x1: from.x,
              y1: from.y + NODE_H / 2,
              x2: to.x,
              y2: to.y - NODE_H / 2,
              stroke: colors.border,
              'stroke-width': 1,
            }),
          );
        }
      }
      for (const n of nodes.values()) {
        const at = pos.get(n.id);
        if (at) drawNodeBox(n, at);
      }
    }

    function drawBand(): void {
      const rows: Array<[number, string, string, string]> = [
        [CAPTION_Y, caption, colors.text, fontSizes.md],
        [SUMMARY_Y, summary, colors.textMuted, fontSizes.sm],
        [VERDICT_Y, verdict, colors.text, fontSizes.sm],
      ];
      for (const [y, value, fill, size] of rows) {
        if (!value) continue;
        const t = el<SVGTextElement>('text', {
          x: PLOT.x0 - 10,
          y,
          fill,
          'font-family': fonts.body,
          'font-size': size,
        });
        t.textContent = value;
        svg.appendChild(t);
      }
    }

    function render(): void {
      svg.textContent = '';
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = tr(
        'label.aria',
        'A decision tree growing: each question drawn as a cut on the point board',
      );
      svg.appendChild(title);
      drawFrame();
      drawPlot();
      drawTree();
      drawBand();
    }

    render();

    // ── projector 가 부르는 표면 ─────────────────────────────────────────

    return {
      destroy(): void {
        svg.textContent = '';
      },

      resetTree(limit: number): void {
        nodes.clear();
        depthLimit = Math.max(1, limit);
        currentId = null;
        trying = null;
        best = null;
        verdict = '';
        render();
      },

      openNode(n: StageOpenedNode): void {
        nodes.set(n.id, {
          id: n.id,
          parent: n.parent,
          side: n.side,
          depth: n.depth,
          a: n.a,
          b: n.b,
          gini: n.gini,
          leaf: true,
          label: n.a >= n.b ? 0 : 1,
          axis: 0,
          cut: 0,
          left: -1,
          right: -1,
        });
        const parent = nodes.get(n.parent);
        if (parent) {
          if (n.side === 'L') parent.left = n.id;
          if (n.side === 'R') parent.right = n.id;
        }
        currentId = n.id;
        trying = null;
        best = null;
        render();
      },

      showCut(id: number, axis: 0 | 1, cut: number): void {
        currentId = id;
        trying = { id, axis, cut };
        render();
      },

      keepBest(id: number, axis: 0 | 1, cut: number): void {
        best = { id, axis, cut };
        render();
      },

      splitNode(id: number, axis: 0 | 1, cut: number): void {
        const n = nodes.get(id);
        if (n) {
          n.leaf = false;
          n.axis = axis;
          n.cut = cut;
          n.left = n.left >= 0 ? n.left : id + 1;
        }
        currentId = id;
        trying = null;
        best = { id, axis, cut };
        render();
      },

      markLeaf(id: number, label: 0 | 1): void {
        const n = nodes.get(id);
        if (n) {
          n.leaf = true;
          n.label = label;
        }
        currentId = id;
        trying = null;
        best = null;
        render();
      },

      focusNode(id: number): void {
        currentId = id;
        render();
      },

      setTree(shapes: StageTreeNode[], limit: number): void {
        nodes.clear();
        depthLimit = Math.max(1, limit);
        for (const s of shapes) nodes.set(s.id, fromShape(s));
        currentId = null;
        trying = null;
        best = null;
        render();
      },

      setCaption(text: string): void {
        caption = text;
        render();
      },

      setSummary(text: string): void {
        summary = text;
        render();
      },

      setVerdict(text: string): void {
        verdict = text;
        render();
      },
    };
  },
};
