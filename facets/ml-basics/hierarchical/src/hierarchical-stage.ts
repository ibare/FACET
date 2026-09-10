/**
 * `hierarchical-stage` — 계층 군집화 전용 화면 하나.
 *
 * 한 폭의 SVG 에 넷을 담는다.
 *
 *   왼쪽 위   점판. 자르는 높이에서의 무리 색으로 점 여덟을 칠한다. 다리 노릇을
 *             하는 점 둘에는 점선 고리를 두른다.
 *   오른쪽 위 나무(덴드로그램). **세 연결 방식이 같은 세로 자를 쓴다** — 자가
 *             갈리면 견줄 수 없다. 자르는 높이가 가로 점선으로 지나간다.
 *   왼쪽 아래 지금 나무의 병합 차례와 높이 일곱.
 *   오른쪽 아래 지금까지 본 답이 쌓이는 표. 세로가 자르는 높이, 가로가 연결
 *             방식이고 칸에 무리 수가 들어간다. **앞서 본 칸을 지우지 않는다** —
 *             높이 2 의 한 줄이 1 / 3 / 3 으로 갈리는 것이 이 완제품의 논증이라,
 *             셋이 한 화면에 나란히 있어야 논증이 선다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 점 여덟 · 병합 일곱 · 높이 여섯은
 * 자료가 정한 고정 수라 자리를 미리 잡아 둔다.
 *
 * 타이머도 옵서버도 쓰지 않는다. `destroy()` 는 만든 노드를 거둔다.
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

/** 글의 문단 폭에 맞춘 고정 캔버스. 마운트 뒤 바뀌지 않는다 (S-view). */
const CANVAS_W = 620;
const CANVAS_H = 392;

/** 두 판의 위아래. */
const PANEL_TOP = 42;
const PANEL_BOT = 252;

/** 왼쪽 점판. */
const SCATTER_X0 = 12;
const SCATTER_X1 = 300;
const PLOT_X0 = 28;
const PLOT_X1 = 288;
const PLOT_Y0 = 70;
const PLOT_Y1 = 230;

/** 오른쪽 나무. */
const TREE_X0 = 310;
const TREE_X1 = 608;
const LEAF_X0 = 348;
const LEAF_X1 = 596;
const BASE_Y = 232;
const TOP_Y = 72;

/** 아래 두 칸. */
const ORDER_X = 24;
const ORDER_Y0 = 292;
const ROW_STEP = 14;
const GRID_LABEL_X = 262;
const GRID_COL_X = [320, 430, 540];
const GRID_COL_W = 100;
const GRID_HEAD_Y = 292;
const GRID_ROW_Y0 = 308;

const PANEL_LABEL_Y = 57;
const SECTION_LABEL_Y = 272;

export type StagePoint = { id: string; x: number; y: number };
export type StageMerge = { into: number; gone: number; height: number };

export type StageScene = {
  points: StagePoint[];
  bridgeIds: string[];
  cutHeights: number[];
  axisMax: number;
};

export type LedgerRow = {
  linkIndex: number;
  cutIndex: number;
  clusterCount: number;
};

type Cut = {
  cutIndex: number;
  cutHeight: number;
  groups: number[];
  clusterCount: number;
};

/**
 * 잎의 가로 차례 — 가지가 서로 넘나들지 않는 순서.
 *
 * 병합마다 두 무리의 잎 목록을 이어 붙이고, 아직 살아 있는 대표를 번호 순으로
 * 훑어 잇는다. 나무가 덜 지어졌을 때도 답이 나온다.
 */
function leafOrder(n: number, merges: readonly StageMerge[]): number[] {
  const lists = new Map<number, number[]>();
  for (let i = 0; i < n; i++) lists.set(i, [i]);
  const alive = new Set<number>();
  for (let i = 0; i < n; i++) alive.add(i);
  for (const m of merges) {
    const a = lists.get(m.into);
    const b = lists.get(m.gone);
    if (!a || !b) continue;
    lists.set(m.into, [...a, ...b]);
    alive.delete(m.gone);
  }
  const out: number[] = [];
  for (const rep of [...alive].sort((p, q) => p - q)) {
    for (const leaf of lists.get(rep) ?? []) out.push(leaf);
  }
  return out;
}

/** 한 무리를 이름표로 적는다 — `fg` · `abc` 처럼 잎의 이름표를 잇는다. */
function clusterLabel(
  n: number,
  merges: readonly StageMerge[],
  upTo: number,
  rep: number,
  ids: string[],
): string {
  const lists = new Map<number, number[]>();
  for (let i = 0; i < n; i++) lists.set(i, [i]);
  for (let k = 0; k < upTo; k++) {
    const m = merges[k];
    const a = lists.get(m.into);
    const b = lists.get(m.gone);
    if (!a || !b) continue;
    lists.set(m.into, [...a, ...b]);
  }
  return (lists.get(rep) ?? [rep]).map((i) => ids[i] ?? String(i)).join('');
}

export const hierarchicalStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const clusterInk = categorical(8, 'vivid');

    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      tr(
        'label.aria',
        'Hierarchical clustering — the same points, three linkages, one cut height',
      ),
    );

    const root = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(root);

    // ── 상태 ────────────────────────────────────────────────────────────
    let scene: StageScene = { points: [], bridgeIds: [], cutHeights: [], axisMax: 1 };
    let merges: StageMerge[] = [];
    let linkIndex = 0;
    let active: { into: number; gone: number } | null = null;
    let cut: Cut | null = null;
    let caption: string[] = [];
    /** `linkIndex * 100 + cutIndex` → 무리 수. 한 번 들어온 칸은 지우지 않는다. */
    const ledger = new Map<number, number>();

    // ── 그리기 헬퍼 ─────────────────────────────────────────────────────
    function el<K extends keyof SVGElementTagNameMap>(
      name: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      root.appendChild(node);
      return node;
    }

    function line(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      stroke: string,
      width = 1,
      dash?: string,
    ): void {
      const node = el('line', { x1, y1, x2, y2, stroke, 'stroke-width': width });
      if (dash) node.setAttribute('stroke-dasharray', dash);
    }

    function text(
      x: number,
      y: number,
      value: string,
      opts: {
        size?: string;
        fill?: string;
        anchor?: 'start' | 'middle' | 'end';
        weight?: string;
        mono?: boolean;
      } = {},
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        fill: opts.fill ?? colors.text,
        'font-size': opts.size ?? fontSizes.xs,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'text-anchor': opts.anchor ?? 'start',
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = value;
      return node;
    }

    function frame(x0: number, x1: number): void {
      el('rect', {
        x: x0,
        y: PANEL_TOP,
        width: x1 - x0,
        height: PANEL_BOT - PANEL_TOP,
        rx: 4,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1,
      });
    }

    const fmt = (v: number): string => v.toFixed(3);
    const fmtCut = (v: number): string => v.toFixed(1);

    /** 무리 대표 번호 → 그 무리의 색. 대표는 늘 그 무리의 최소 점 번호다. */
    const inkOf = (rep: number): string => clusterInk[rep % clusterInk.length];

    function linkName(index: number): string {
      if (index === 0) return tr('link.single', 'single');
      if (index === 1) return tr('link.complete', 'complete');
      return tr('link.average', 'average');
    }

    // ── 판 하나씩 ───────────────────────────────────────────────────────

    function drawCaption(): void {
      if (caption[0]) text(SCATTER_X0, 16, caption[0], { size: fontSizes.sm, weight: '600' });
      if (caption[1]) text(SCATTER_X0, 32, caption[1], { fill: colors.textMuted });
    }

    function drawScatter(): void {
      frame(SCATTER_X0, SCATTER_X1);
      text(SCATTER_X0 + 8, PANEL_LABEL_Y, tr('label.scatter', 'the points'), {
        fill: colors.textMuted,
      });
      const pts = scene.points;
      if (pts.length === 0) return;

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const spanX = Math.max(0.001, maxX - minX);
      const spanY = Math.max(0.001, maxY - minY);
      const boxW = PLOT_X1 - PLOT_X0;
      const boxH = PLOT_Y1 - PLOT_Y0;
      // 가로세로 같은 자를 쓴다 — 거리가 눈에 거리로 보여야 한다.
      const scale = Math.min(boxW / (spanX * 1.16), boxH / (spanY * 1.16));
      const cx = (PLOT_X0 + PLOT_X1) / 2;
      const cy = (PLOT_Y0 + PLOT_Y1) / 2;
      const sx = (v: number): number => cx + (v - (minX + maxX) / 2) * scale;
      const sy = (v: number): number => cy - (v - (minY + maxY) / 2) * scale;

      const groups = cut?.groups;
      const bridge = new Set(scene.bridgeIds);

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const rep = groups ? groups[i] : i;
        const ink = inkOf(rep);
        if (bridge.has(p.id)) {
          el('circle', {
            cx: sx(p.x),
            cy: sy(p.y),
            r: 9,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '2 2',
          });
        }
        el('circle', {
          cx: sx(p.x),
          cy: sy(p.y),
          r: 5,
          fill: ink,
          stroke: colors.bg,
          'stroke-width': 1.2,
        });
        text(sx(p.x) + 8, sy(p.y) + 4, p.id, { fill: colors.text, mono: true });
      }
      if (bridge.size > 0) {
        text(PLOT_X0, PLOT_Y1 + 15, tr('label.bridge', 'the two in the middle form a bridge'), {
          fill: colors.textMuted,
        });
      }
    }

    function heightToY(h: number): number {
      const span = Math.max(0.001, scene.axisMax);
      return BASE_Y - Math.min(1, h / span) * (BASE_Y - TOP_Y);
    }

    function drawTree(): void {
      frame(TREE_X0, TREE_X1);
      // 두 문안을 이어 붙이지 않는다 — 어순이 다른 언어에서 문장이 깨진다 (C10).
      const treeLabel = tr('label.treeOf', '{link} — the tree', { link: linkName(linkIndex) });
      text(TREE_X0 + 8, PANEL_LABEL_Y, treeLabel, { fill: colors.textMuted });

      const n = scene.points.length;
      if (n === 0) return;
      const order = leafOrder(n, merges);
      const slot = new Map<number, number>();
      order.forEach((leaf, i) => slot.set(leaf, i));
      const step = order.length > 1 ? (LEAF_X1 - LEAF_X0) / (order.length - 1) : 0;
      const leafX = (leaf: number): number => LEAF_X0 + (slot.get(leaf) ?? 0) * step;

      // 세로 자 — 셋이 같은 눈금을 쓴다.
      line(LEAF_X0 - 22, BASE_Y, TREE_X1 - 8, BASE_Y, colors.border, 1);
      for (let h = 0; h <= scene.axisMax; h += 1) {
        const y = heightToY(h);
        line(LEAF_X0 - 26, y, LEAF_X0 - 22, y, colors.border, 1);
        if (h % 2 === 0) {
          text(LEAF_X0 - 30, y + 3, String(h), { fill: colors.textMuted, anchor: 'end' });
        }
      }
      // 세로 자의 이름. 판 이름표와 같은 줄의 오른쪽 끝에 둔다 — 눈금 위에 두면
      // 판 이름표와 겹친다.
      text(TREE_X1 - 8, PANEL_LABEL_Y, tr('label.height', 'height'), {
        anchor: 'end',
        fill: colors.textMuted,
      });

      // 잎.
      for (const leaf of order) {
        const p = scene.points[leaf];
        const rep = cut?.groups ? cut.groups[leaf] : leaf;
        text(leafX(leaf), BASE_Y + 14, p?.id ?? String(leaf), {
          anchor: 'middle',
          fill: inkOf(rep),
          mono: true,
          weight: '600',
        });
      }

      // 가지.
      const pos = new Map<number, { x: number; y: number }>();
      for (const leaf of order) pos.set(leaf, { x: leafX(leaf), y: BASE_Y });
      const cutH = cut?.cutHeight ?? Infinity;
      const wantLabel = (index: number): boolean => {
        if (active && merges[index] && merges[index].into === active.into) return true;
        if (index === merges.length - 1) return true;
        // 자르는 높이를 사이에 두고 바로 아래와 바로 위의 병합.
        const below = merges.filter((m) => m.height <= cutH);
        const above = merges.filter((m) => m.height > cutH);
        const m = merges[index];
        if (below.length > 0 && m === below[below.length - 1]) return true;
        if (above.length > 0 && m === above[0]) return true;
        return false;
      };

      for (let k = 0; k < merges.length; k++) {
        const m = merges[k];
        const a = pos.get(m.into);
        const b = pos.get(m.gone);
        if (!a || !b) continue;
        const y = heightToY(m.height);
        const under = m.height <= cutH;
        const rep = cut?.groups ? cut.groups[m.into] : m.into;
        const isActive = active !== null && active.into === m.into && active.gone === m.gone;
        const ink = isActive ? colors.itemActive : under ? inkOf(rep) : colors.textMuted;
        const w = isActive ? 2.4 : under ? 1.8 : 1.2;
        line(a.x, a.y, a.x, y, ink, w);
        line(b.x, b.y, b.x, y, ink, w);
        line(a.x, y, b.x, y, ink, w);
        if (wantLabel(k)) {
          text((a.x + b.x) / 2, y - 4, fmt(m.height), {
            anchor: 'middle',
            fill: isActive ? colors.itemActive : colors.textMuted,
            mono: true,
          });
        }
        pos.set(m.into, { x: (a.x + b.x) / 2, y });
      }

      // 자르는 높이.
      if (cut) {
        const y = heightToY(cut.cutHeight);
        line(LEAF_X0 - 26, y, TREE_X1 - 8, y, colors.accent, 1.4, '5 3');
        text(LEAF_X0 - 26, y - 5, `h = ${fmtCut(cut.cutHeight)}`, {
          fill: colors.accent,
          mono: true,
          weight: '600',
        });
        text(TREE_X1 - 8, y - 5, tr('label.clusters', 'clusters: {k}', { k: cut.clusterCount }), {
          anchor: 'end',
          fill: colors.accent,
          weight: '600',
        });
      }
    }

    function drawOrder(): void {
      text(ORDER_X, SECTION_LABEL_Y, tr('label.mergeOrder', 'merge order'), {
        fill: colors.textMuted,
      });
      const n = scene.points.length;
      const ids = scene.points.map((p) => p.id);
      const cutH = cut?.cutHeight ?? Infinity;
      for (let k = 0; k < merges.length; k++) {
        const m = merges[k];
        const y = ORDER_Y0 + k * ROW_STEP;
        const under = m.height <= cutH;
        const ink = under ? colors.text : colors.textMuted;
        const left = clusterLabel(n, merges, k, m.into, ids);
        const right = clusterLabel(n, merges, k, m.gone, ids);
        text(ORDER_X, y, `${k + 1}`, { fill: colors.textMuted, mono: true });
        text(ORDER_X + 16, y, `${left}+${right}`, { fill: ink, mono: true });
        text(ORDER_X + 150, y, fmt(m.height), { fill: ink, mono: true, anchor: 'end' });
      }
    }

    function drawLedger(): void {
      text(GRID_LABEL_X - 52, SECTION_LABEL_Y, tr('label.ledger', 'clusters after the cut'), {
        fill: colors.textMuted,
      });
      for (let c = 0; c < 3; c++) {
        text(GRID_COL_X[c], GRID_HEAD_Y, linkName(c), {
          anchor: 'middle',
          fill: colors.textMuted,
        });
      }
      text(GRID_LABEL_X, GRID_HEAD_Y, tr('label.cutHeight', 'cut'), {
        anchor: 'end',
        fill: colors.textMuted,
      });
      for (let r = 0; r < scene.cutHeights.length; r++) {
        const y = GRID_ROW_Y0 + r * ROW_STEP;
        const isRow = cut?.cutIndex === r;
        text(GRID_LABEL_X, y, fmtCut(scene.cutHeights[r]), {
          anchor: 'end',
          fill: isRow ? colors.text : colors.textMuted,
          mono: true,
          weight: isRow ? '600' : undefined,
        });
        for (let c = 0; c < 3; c++) {
          const value = ledger.get(c * 100 + r);
          const here = isRow && linkIndex === c;
          if (here) {
            const box = el('rect', {
              x: GRID_COL_X[c] - GRID_COL_W / 2,
              y: y - 11,
              width: GRID_COL_W,
              height: ROW_STEP,
              rx: 3,
              fill: colors.accent,
            });
            box.setAttribute('fill-opacity', '0.22');
          }
          const cell = text(GRID_COL_X[c], y, value === undefined ? '·' : String(value), {
            anchor: 'middle',
            fill: value === undefined ? colors.textMuted : colors.text,
            mono: true,
            weight: here ? '600' : undefined,
          });
          // 검사가 칸 하나를 정확히 짚을 수 있게 좌표를 남긴다 (연결-높이).
          cell.setAttribute('data-cell', `${c}-${r}`);
        }
      }
    }

    function render(): void {
      while (root.firstChild) root.removeChild(root.firstChild);
      drawCaption();
      drawScatter();
      drawTree();
      drawOrder();
      drawLedger();
    }

    render();

    return {
      destroy(): void {
        root.remove();
      },

      setScene(next: StageScene): void {
        scene = next;
        render();
      },

      setTree(nextMerges: StageMerge[], nextLink: number): void {
        merges = nextMerges;
        linkIndex = nextLink;
        render();
      },

      setActivePair(pair: { into: number; gone: number } | null): void {
        active = pair;
        render();
      },

      setCut(next: Cut): void {
        cut = next;
        render();
      },

      record(row: LedgerRow): void {
        ledger.set(row.linkIndex * 100 + row.cutIndex, row.clusterCount);
        render();
      },

      setCaption(lines: string[]): void {
        caption = lines;
        render();
      },

      reset(): void {
        merges = [];
        active = null;
        cut = null;
        caption = [];
        ledger.clear();
        render();
      },
    };
  },
};
