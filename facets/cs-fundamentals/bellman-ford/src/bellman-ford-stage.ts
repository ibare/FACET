/**
 * 벨만-포드 전용 무대 — 그래프 한 폭과 바퀴 원장 한 폭.
 *
 * ── 왜 둘인가
 *
 * 왼쪽 그래프는 **지금** 무슨 일이 벌어지는지를 보인다 — 어느 간선을 펴는 중이고,
 * 어느 정점의 값이 방금 줄었고, 지금까지의 최단 경로 나무가 어떤 모양인지.
 * 오른쪽 원장은 **지나온 것** 을 남긴다 — 바퀴마다 한 줄씩, 그 바퀴에 값이 스민
 * 칸만 물들여 둔다. 그림만 있으면 값이 계속 덧쓰여 "한 바퀴에 얼마나 스몄는가"
 * 가 사라지고, 원장만 있으면 왜 그렇게 스몄는지가 사라진다.
 *
 * 원장의 마지막 줄은 검사 바퀴다. 그 줄이 온통 흐린 채로 남고 오른쪽 셈이 0 인
 * 것 — 그것이 "아무것도 줄지 않았다" 이고 이 알고리즘이 끝났다는 증거다.
 *
 * ── 배치
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 정점 다섯 · 간선 아홉 · 바퀴 넷은
 * 선언이 정해 두었고, 원장의 줄 수도 정점 수에서 나오므로 캔버스 한 폭에 다 든다.
 * 정점 수가 달라지면 그래프는 원형으로 흩고 원장은 칸을 좁혀 담는다.
 *
 * ── destroy
 *
 * 타이머도 프레임 루프도 없다. 매 걸음마다 캔버스 안을 통째로 다시 그리므로
 * 남는 상태가 없고, `destroy()` 는 붙여 둔 뿌리 그룹 하나만 걷는다. (그림이
 * 애니메이션 없이 즉시 갈아 끼워지는 것은 코루틴 메커니즘이 걸음 사이 간격을
 * 이미 재고 있기 때문이다.)
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스. 그래프 폭과 원장 폭이 나란히 든다.
const W = 700;
const H = 292;

const GRAPH_X0 = 14;
const GRAPH_X1 = 316;
const DIVIDER_X = 324;

const LEDGER_X0 = 332;
const LEDGER_LABEL_W = 58;
const LEDGER_DROP_W = 26;
const LEDGER_X1 = 686;

const HEAD_Y = 34;
const HEAD_H = 22;
const ROW_H = 30;
/** 원장이 넘어서지 않는 아래끝. */
const LEDGER_Y1 = 240;

const NODE_R = 20;
/** 간선이 원을 물지 않게 띄우는 여백. 머리 쪽은 화살촉 자리까지 더 띄운다. */
const EDGE_GAP_TAIL = 3;
const EDGE_GAP_HEAD = 8;
/** 간선을 곧게 긋지 않고 휘게 하는 정도. 마주 보는 두 간선이 겹치지 않는다. */
const EDGE_BEND = 16;

const CAPTION_Y1 = 264;
const CAPTION_Y2 = 281;

/** 아직 닿지 않은 거리. 수식 기호 표기라 번역하지 않는다 (C10). */
const INFINITY_MARK = '∞';
/** 원장 오른쪽 셈의 머리. "이 바퀴에 줄어든 칸 수". */
const DROP_MARK = '↓';

type Pt = { x: number; y: number };

/**
 * 정점 다섯짜리 손 배치.
 *
 * 이 그래프는 K5 에서 두 쌍(0-3 · 0-4)을 뺀 꼴이라 선이 하나도 엇갈리지 않게
 * 그릴 수 있다. 1·2·3 이 삼각형을 이루고 4 가 그 안에 들며, 0 은 삼각형 밖
 * 왼쪽에서 1 과 2 에만 닿는다. 원형으로 흩으면 반드시 엇갈리므로 손으로 잡았다.
 */
const HAND_LAYOUT_5: Pt[] = [
  { x: 42, y: 143 },
  { x: 146, y: 60 },
  { x: 146, y: 226 },
  { x: 286, y: 143 },
  { x: 190, y: 143 },
];

type StageEdge = { from: number; to: number; weight: number };
type EdgeState = 'idle' | 'tree' | 'inspect' | 'relax';
type Cell = { value: number | null; fresh: boolean };

type InspectInfo = {
  edge: number;
  from: number;
  to: number;
  improves: boolean;
};

type RelaxInfo = {
  edge: number;
  to: number;
  after: number;
};

/** 정점 수가 다섯이 아니면 원으로 흩는다. 엇갈림은 감수한다. */
function ringLayout(count: number): Pt[] {
  const cx = (GRAPH_X0 + GRAPH_X1) / 2;
  const cy = 143;
  const r = Math.min((GRAPH_X1 - GRAPH_X0) / 2, 100) - NODE_R - 6;
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(count, 1);
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

function quadAt(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const s = 1 - t;
  return {
    x: s * s * a.x + 2 * s * t * c.x + t * t * b.x,
    y: s * s * a.y + 2 * s * t * c.y + t * t * b.y,
  };
}

function dist2(p: Pt, q: Pt): number {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/**
 * 꼬리에서 머리로 가는 휜 간선의 자취.
 *
 * 제어점을 진행 방향의 왼쪽으로 밀어 두므로, 마주 보는 두 간선(1→3 과 3→1)은
 * 방향이 뒤집히면서 서로 반대쪽으로 휜다. 겹치지 않는 것이 저절로 된다.
 */
function edgePath(a: Pt, b: Pt): { points: Pt[]; mid: Pt; tip: Pt; dir: Pt } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const ctrl: Pt = {
    x: (a.x + b.x) / 2 + px * EDGE_BEND,
    y: (a.y + b.y) / 2 + py * EDGE_BEND,
  };

  const SAMPLES = 48;
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    if (dist2(quadAt(a, ctrl, b, t), a) >= NODE_R + EDGE_GAP_TAIL) {
      t0 = t;
      break;
    }
  }
  for (let i = SAMPLES; i >= 0; i--) {
    const t = i / SAMPLES;
    if (dist2(quadAt(a, ctrl, b, t), b) >= NODE_R + EDGE_GAP_HEAD) {
      t1 = t;
      break;
    }
  }
  if (t1 <= t0) t1 = Math.min(1, t0 + 0.05);

  const STEPS = 14;
  const points: Pt[] = [];
  for (let i = 0; i <= STEPS; i++) {
    points.push(quadAt(a, ctrl, b, t0 + ((t1 - t0) * i) / STEPS));
  }
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const tl = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;

  return {
    points,
    mid: quadAt(a, ctrl, b, (t0 + t1) / 2),
    tip,
    dir: { x: (tip.x - prev.x) / tl, y: (tip.y - prev.y) / tl },
  };
}

/**
 * 자리 폭에 맞춰 줄을 나눈다.
 *
 * SVG 는 글자 폭을 재려면 레이아웃이 필요한데 무대가 아직 붙기 전에도 그려야
 * 하므로, 한글 한 자를 두 칸으로 세는 어림으로 나눈다. 캡션 두 줄에만 쓴다.
 */
function wrapCaption(s: string, maxUnits: number): string[] {
  const unit = (ch: string) => (ch.charCodeAt(0) > 0x2e80 ? 2 : 1);
  const width = (w: string) => {
    let n = 0;
    for (const ch of w) n += unit(ch);
    return n;
  };
  const lines: string[] = [];
  let cur = '';
  for (const word of s.split(' ')) {
    if (cur === '') {
      cur = word;
    } else if (width(cur) + 1 + width(word) > maxUnits) {
      lines.push(cur);
      cur = word;
    } else {
      cur = `${cur} ${word}`;
    }
  }
  if (cur !== '') lines.push(cur);
  // 두 줄까지만 그린다. 남으면 잘라 버리지 않고 둘째 줄에 이어 붙인다.
  if (lines.length <= 2) return lines;
  return [lines[0], lines.slice(1).join(' ')];
}

export const bellmanFordStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 러너 밖 마운트를 위한 fallback 은 이 형태로만 둔다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    // ── 선언에서 구조만 읽는다. 좌표는 여기서 셈한다.
    const init = params.initialData as
      | { vertexCount?: unknown; edges?: unknown; source?: unknown }
      | undefined;
    const vertexCount = typeof init?.vertexCount === 'number' ? init.vertexCount : 0;
    const source = typeof init?.source === 'number' ? init.source : 0;
    const edges: StageEdge[] = Array.isArray(init?.edges)
      ? init.edges.flatMap((raw) => {
          const e = raw as { from?: unknown; to?: unknown; weight?: unknown };
          if (typeof e.from !== 'number' || typeof e.to !== 'number') return [];
          if (typeof e.weight !== 'number') return [];
          return [{ from: e.from, to: e.to, weight: e.weight }];
        })
      : [];

    const pos = vertexCount === 5 ? HAND_LAYOUT_5 : ringLayout(vertexCount);
    /** 바퀴는 n-1 번. 원장은 처음 줄 + 바퀴 줄 + 검사 줄. */
    const passes = Math.max(vertexCount - 1, 0);
    const rowCount = passes + 2;
    const colW = (LEDGER_X1 - LEDGER_X0 - LEDGER_LABEL_W - LEDGER_DROP_W) / Math.max(vertexCount, 1);
    // 세로는 마운트 뒤 바뀌지 않는다. 줄이 늘면 높이를 키우는 것이 아니라
    // 줄 간격을 좁혀 담는다 (S-view).
    const rowH = Math.min(ROW_H, (LEDGER_Y1 - (HEAD_Y + HEAD_H)) / Math.max(rowCount, 1));

    // ── 상태. 매 걸음 통째로 다시 그리므로 여기 있는 것이 화면의 전부다.
    let dist: (number | null)[] = new Array<number | null>(vertexCount).fill(null);
    /** 각 정점의 지금 값이 어느 간선을 타고 왔는지. 최단 경로 나무. */
    let via: (number | null)[] = new Array<number | null>(vertexCount).fill(null);
    /** 원장. 줄 0 은 처음, 1..passes 는 바퀴, 마지막은 검사 바퀴. */
    let ledger: (Cell | null)[][] = [];
    let dropped: (number | null)[] = [];
    let activeRow = -1;
    let activeEdge: number | null = null;
    let relaxEdge: number | null = null;
    let activeFrom: number | null = null;
    let activeTo: number | null = null;
    let inspectFails = false;
    let caption = '';

    const blankLedger = () => {
      ledger = [];
      dropped = [];
      for (let r = 0; r < rowCount; r++) {
        ledger.push(new Array<Cell | null>(vertexCount).fill(null));
        dropped.push(null);
      }
    };
    blankLedger();

    const root = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(root);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };

    const label = (
      s: string,
      x: number,
      y: number,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; family?: string },
      parent: SVGElement,
    ) => {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'font-weight': opts.weight ?? '400',
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'middle',
        },
        parent,
      );
      node.textContent = s;
      return node;
    };

    const show = (d: number | null) => (d === null ? INFINITY_MARK : String(d));

    function edgeStateOf(index: number): EdgeState {
      if (relaxEdge === index) return 'relax';
      if (activeEdge === index) return 'inspect';
      const head = edges[index]?.to;
      if (head !== undefined && via[head] === index) return 'tree';
      return 'idle';
    }

    function drawGraph(): void {
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const a = pos[e.from];
        const b = pos[e.to];
        if (!a || !b) continue;
        const state = edgeStateOf(i);
        const stroke =
          state === 'relax'
            ? c.itemSwapping
            : state === 'inspect'
              ? c.itemComparing
              : state === 'tree'
                ? c.text
                : c.border;
        const width = state === 'idle' ? 1.4 : state === 'tree' ? 2 : 2.6;
        // 견주었는데 줄지 않는 간선은 점선으로 — 펴 보았으나 안 폈다는 뜻.
        const dashed = state === 'inspect' && inspectFails;

        const geom = edgePath(a, b);
        el(
          'path',
          {
            d: geom.points.map((p, k) => `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
            fill: 'none',
            stroke,
            'stroke-width': width,
            'stroke-linecap': 'round',
            'stroke-dasharray': dashed ? '5 4' : 'none',
          },
          root,
        );

        // 화살촉 — 자취의 끝에서 진행 방향으로 삼각형 하나.
        const { tip, dir } = geom;
        const nx = -dir.y;
        const ny = dir.x;
        const back = 7;
        const half = 3.6;
        el(
          'polygon',
          {
            points: [
              `${tip.x},${tip.y}`,
              `${tip.x - dir.x * back + nx * half},${tip.y - dir.y * back + ny * half}`,
              `${tip.x - dir.x * back - nx * half},${tip.y - dir.y * back - ny * half}`,
            ].join(' '),
            fill: stroke,
          },
          root,
        );

        const lx = geom.mid.x + (geom.mid.x - (a.x + b.x) / 2) * 0.5;
        const ly = geom.mid.y + (geom.mid.y - (a.y + b.y) / 2) * 0.5;
        el(
          'circle',
          { cx: lx, cy: ly, r: 8.5, fill: c.bg, stroke: 'none' },
          root,
        );
        label(
          String(e.weight),
          lx,
          ly + 4,
          {
            size: fontSizes.xs,
            fill: state === 'idle' ? c.textMuted : stroke,
            weight: state === 'idle' ? '400' : '700',
            family: fonts.mono,
          },
          root,
        );
      }

      for (let v = 0; v < vertexCount; v++) {
        const p = pos[v];
        if (!p) continue;
        const isFrom = activeFrom === v;
        const isTo = activeTo === v;
        const justRelaxed = relaxEdge !== null && edges[relaxEdge]?.to === v;
        const fill = justRelaxed
          ? c.itemSwapping
          : isFrom || isTo
            ? c.itemComparing
            : c.itemDefault;
        const ink = fill === c.itemDefault ? c.text : c.stateInk;
        if (v === source) {
          // 출발 정점은 언제나 바깥 고리로 표시한다. 거리 0 이 여기서 번진다.
          el(
            'circle',
            {
              cx: p.x,
              cy: p.y,
              r: NODE_R + 4,
              fill: 'none',
              stroke: c.text,
              'stroke-width': 1,
            },
            root,
          );
        }
        el(
          'circle',
          {
            cx: p.x,
            cy: p.y,
            r: NODE_R,
            fill,
            stroke: fill === c.itemDefault ? c.border : fill,
            'stroke-width': 1.5,
          },
          root,
        );
        label(
          String(v),
          p.x,
          p.y - 4,
          { size: fontSizes.xs, fill: fill === c.itemDefault ? c.textMuted : ink },
          root,
        );
        label(
          show(dist[v] ?? null),
          p.x,
          p.y + 11,
          { size: fontSizes.md, weight: '700', fill: ink, family: fonts.mono },
          root,
        );
      }
    }

    function rowLabel(r: number): string {
      if (r === 0) return tr('label.rowStart', 'start');
      if (r === rowCount - 1) return tr('label.rowCheck', 'check');
      return String(r);
    }

    function drawLedger(): void {
      const colX0 = LEDGER_X0 + LEDGER_LABEL_W;

      label(
        tr('label.passHeader', 'pass'),
        LEDGER_X0 + LEDGER_LABEL_W - 8,
        HEAD_Y + 15,
        { size: fontSizes.xs, fill: c.textMuted, anchor: 'end' },
        root,
      );
      for (let v = 0; v < vertexCount; v++) {
        label(
          String(v),
          colX0 + colW * (v + 0.5),
          HEAD_Y + 15,
          { size: fontSizes.sm, fill: c.textMuted, weight: '700' },
          root,
        );
      }
      label(
        DROP_MARK,
        LEDGER_X1 - LEDGER_DROP_W / 2,
        HEAD_Y + 15,
        { size: fontSizes.sm, fill: c.textMuted },
        root,
      );
      el(
        'line',
        {
          x1: LEDGER_X0,
          y1: HEAD_Y + HEAD_H,
          x2: LEDGER_X1,
          y2: HEAD_Y + HEAD_H,
          stroke: c.border,
          'stroke-width': 1,
        },
        root,
      );

      for (let r = 0; r < rowCount; r++) {
        const y = HEAD_Y + HEAD_H + r * rowH;
        const isCheck = r === rowCount - 1;
        const live = r === activeRow;

        if (isCheck) {
          el(
            'line',
            {
              x1: LEDGER_X0,
              y1: y,
              x2: LEDGER_X1,
              y2: y,
              stroke: c.border,
              'stroke-width': 1,
              'stroke-dasharray': '3 3',
            },
            root,
          );
        }

        label(
          rowLabel(r),
          LEDGER_X0 + LEDGER_LABEL_W - 8,
          y + rowH / 2 + 4,
          {
            size: fontSizes.xs,
            anchor: 'end',
            fill: live ? c.text : c.textMuted,
            weight: live ? '700' : '400',
          },
          root,
        );

        for (let v = 0; v < vertexCount; v++) {
          const cell = ledger[r]?.[v];
          if (!cell) continue;
          const x = colX0 + colW * v;
          if (cell.fresh) {
            el(
              'rect',
              {
                x: x + 3,
                y: y + 3,
                width: colW - 6,
                height: rowH - 6,
                rx: 5,
                fill: c.accent,
              },
              root,
            );
          }
          label(
            show(cell.value),
            x + colW / 2,
            y + rowH / 2 + 4,
            {
              size: fontSizes.sm,
              weight: cell.fresh ? '700' : '400',
              fill: cell.fresh ? c.stateInk : c.textMuted,
              family: fonts.mono,
            },
            root,
          );
        }

        const drop = dropped[r];
        if (drop !== null && drop !== undefined) {
          label(
            String(drop),
            LEDGER_X1 - LEDGER_DROP_W / 2,
            y + rowH / 2 + 4,
            {
              size: fontSizes.sm,
              weight: drop > 0 ? '700' : '400',
              fill: drop > 0 ? c.text : c.textMuted,
              family: fonts.mono,
            },
            root,
          );
        }
      }
    }

    function render(): void {
      while (root.firstChild) root.removeChild(root.firstChild);
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, root);
      el(
        'line',
        { x1: DIVIDER_X, y1: 28, x2: DIVIDER_X, y2: 250, stroke: c.border, 'stroke-width': 1 },
        root,
      );
      drawGraph();
      drawLedger();

      const lines = wrapCaption(caption, 104);
      if (lines[0]) {
        label(lines[0], GRAPH_X0, CAPTION_Y1, { anchor: 'start', fill: c.text }, root);
      }
      if (lines[1]) {
        label(lines[1], GRAPH_X0, CAPTION_Y2, { anchor: 'start', fill: c.textMuted }, root);
      }
    }

    function clearMoment(): void {
      activeEdge = null;
      relaxEdge = null;
      activeFrom = null;
      activeTo = null;
      inspectFails = false;
    }

    /** 새 줄을 앞줄에서 베껴 온다 — 아직 아무것도 스미지 않은 흐린 줄. */
    function carryRow(row: number): void {
      const prev = ledger[row - 1];
      const target = ledger[row];
      if (!prev || !target) return;
      for (let v = 0; v < vertexCount; v++) {
        const cell = prev[v];
        target[v] = { value: cell ? cell.value : null, fresh: false };
      }
    }

    const api = {
      reset(): void {
        dist = new Array<number | null>(vertexCount).fill(null);
        via = new Array<number | null>(vertexCount).fill(null);
        blankLedger();
        activeRow = -1;
        caption = '';
        clearMoment();
        render();
      },

      seed(next: (number | null)[], from: number): void {
        dist = next.slice();
        via = new Array<number | null>(vertexCount).fill(null);
        blankLedger();
        const row = ledger[0];
        if (row) {
          for (let v = 0; v < vertexCount; v++) {
            row[v] = { value: next[v] ?? null, fresh: v === from };
          }
        }
        dropped[0] = null;
        activeRow = 0;
        clearMoment();
        render();
      },

      beginPass(pass: number): void {
        activeRow = Math.min(pass, rowCount - 1);
        carryRow(activeRow);
        clearMoment();
        render();
      },

      beginCheck(): void {
        activeRow = rowCount - 1;
        carryRow(activeRow);
        clearMoment();
        render();
      },

      inspect(info: InspectInfo): void {
        activeEdge = info.edge;
        relaxEdge = null;
        activeFrom = info.from;
        activeTo = info.to;
        inspectFails = !info.improves;
        render();
      },

      relax(info: RelaxInfo): void {
        dist[info.to] = info.after;
        via[info.to] = info.edge;
        relaxEdge = info.edge;
        activeEdge = info.edge;
        const row = ledger[activeRow];
        if (row) row[info.to] = { value: info.after, fresh: true };
        render();
      },

      endPass(pass: number, changed: number, next: (number | null)[]): void {
        dist = next.slice();
        const row = ledger[Math.min(pass, rowCount - 1)];
        if (row) {
          for (let v = 0; v < vertexCount; v++) {
            const cell = row[v];
            if (!cell) row[v] = { value: next[v] ?? null, fresh: false };
            else cell.value = next[v] ?? null;
          }
        }
        dropped[Math.min(pass, rowCount - 1)] = changed;
        clearMoment();
        render();
      },

      endCheck(changed: number): void {
        dropped[rowCount - 1] = changed;
        clearMoment();
        render();
      },

      finish(next: (number | null)[]): void {
        dist = next.slice();
        activeRow = -1;
        clearMoment();
        render();
      },

      setCaption(text: string): void {
        caption = text;
        render();
      },

      destroy(): void {
        // 타이머도 프레임 루프도 걸지 않았으므로 걷을 것은 붙여 둔 그룹뿐이다.
        root.remove();
      },
    };

    render();
    return api;
  },
};
