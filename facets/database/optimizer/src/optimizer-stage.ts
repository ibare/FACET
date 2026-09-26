/**
 * optimizer 무대 — SQL · 계획 트리 · 표 셋 · 중간 결과 더미 · 끝 줄 · 두 차례의 만든 줄.
 *
 * 운동 (시간에 걸쳐 일어난다, 길이는 projector 가 재생 속도에서 셈해 건넨다):
 *   - 계획 트리가 모양을 바꾼다 — 노드는 id 로 같은 노드를 가리키므로, 차례가 바뀌면 `Filter`+`customers` 잎과
 *     `sale_items` 잎이 자리를 바꿔 옮겨 가고 두 `Nested Loop` 이 층을 맞바꾼다
 *   - 중간 줄 조각(order id 를 단)은 orders 표의 제 칸에서 더미로 날아든다. 앞 판의 조각은 옅게 남아 있다가
 *     새 판에도 있으면 제자리로 옮겨 가고, 없으면 제 칸으로 돌아가 사라진다 — 더미가 부풀거나 머문다
 *   - 끝 줄 조각은 중간 더미의 제 조각에서 날아든다
 *   - 만든 줄 막대가 새 길이로 늘거나 줄고, "싼 차례" 틀이 다른 차례로 넘어간다
 * 무대는 셈하지 않는다 — 줄 수 · 고른 차례 · 남은 고객은 알고리즘이 싣는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';
const W = 820;
const H = 600;

// 구역
const SQL_X = 20;
const SQL_Y = 22;
const SQL_LINE = 17;
const TREE_TITLE_Y = 144;
const TREE_TOP = 158;
const LEVEL = 54;
const NODE_W = 128;
const NODE_H = 44;
const SLOT_X = [90, 232, 374];
const TABLE_X = 470;
const TABLE_Y = 22;
const TABLE_ROW = 17;
const BIG_TABLE_ROWS = 8;
const BIG_COL_W = 110;
const CMP_Y = 376;
const CMP_ROW = 36;
const CMP_BAR_X = 590;
const CMP_BAR_MAX = 150;
const PILE_Y = 456;
const MID_X = 20;
const MID_COLS = 8;
const MID_W = 48;
const FIN_X = 470;
const FIN_COLS = 3;
const FIN_W = 104;
const CHIP_H = 22;
const CHIP_GAP = 5;
const CAPTION_Y = 578;

export type PlanShape = { id: string; op: string; detail: string; children: PlanShape[] };

export type RoundInput = {
  orderId: string;
  sql: string[];
  plan: PlanShape;
  keptCustomerIds: number[];
  keptCount: number;
  customerCount: number;
  ms: number;
};
export type FirstJoinInput = { nodeId: string; cond: string; ids: number[]; count: number; ms: number };
export type SecondJoinInput = {
  nodeId: string;
  cond: string;
  rows: { key: string; cells: string[] }[];
  finalCount: number;
  madeCount: number;
  ms: number;
};
export type InitialInput = { orderId: string; sql: string[]; plan: PlanShape };
export type CompareInput = { made: number[]; orderIds: string[]; cheaper: number; current: number; ms: number };

/** projector 가 부르는 무대의 표면. */
export type OptimizerStageApi = {
  beginRound(p: RoundInput): void;
  firstJoin(p: FirstJoinInput): void;
  secondJoin(p: SecondJoinInput): void;
  compare(p: CompareInput): void;
  /** 첫 k · 첫 차례의 SQL 과 트리 — 걸음 0 이전과 되감은 뒤의 모습 */
  showInitial(p: InitialInput): void;
  clear(): void;
};

type Tween = { cur: number[]; from: number[]; to: number[]; apply: (v: number[]) => void; done?: () => void };

type TableSpec = { key: string; name: string; alias: string; columns: string[]; rows: (string | number)[][] };

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function readTables(initial: Record<string, unknown> | undefined): TableSpec[] {
  const raw = initial?.tables;
  if (typeof raw !== 'object' || raw === null) return [];
  const out: TableSpec[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) throw new Error(`optimizer-stage: 표 ${key} 의 모양이 틀렸다`);
    const t = value as Record<string, unknown>;
    if (typeof t.name !== 'string' || typeof t.alias !== 'string' || !Array.isArray(t.columns) || !Array.isArray(t.rows)) {
      throw new Error(`optimizer-stage: 표 ${key} 의 모양이 틀렸다`);
    }
    out.push({
      key,
      name: t.name,
      alias: t.alias,
      columns: t.columns.map(String),
      rows: t.rows.map((r) => {
        if (!Array.isArray(r)) throw new Error(`optimizer-stage: 표 ${key} 의 줄이 배열이 아니다`);
        return r.map((c) => {
          if (typeof c !== 'string' && typeof c !== 'number') throw new Error(`optimizer-stage: 표 ${key} 의 칸이 틀렸다`);
          return c;
        });
      }),
    });
  }
  return out;
}

const ease = (e: number): number => (e < 0.5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2);

export const optimizerStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const root = params.canvas;
    root.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const sm = parseFloat(fontSizes.sm);
    const xs = parseFloat(fontSizes.xs);

    let destroyed = false;
    const frames = new Map<string, number>();
    const groups = new Map<string, Tween[]>();

    const finish = (name: string): void => {
      const id = frames.get(name);
      if (id !== undefined) cancelAnimationFrame(id);
      frames.delete(name);
      const list = groups.get(name);
      groups.delete(name);
      if (!list) return;
      for (const tw of list) {
        tw.cur = [...tw.to];
        tw.apply(tw.cur);
        tw.done?.();
      }
    };

    /** 한 무리의 값을 지금 값에서 목표로 옮긴다. 같은 무리의 앞 운동은 끝 값으로 접는다. */
    const run = (name: string, list: Tween[], ms: number, onFrame?: () => void): void => {
      finish(name);
      for (const tw of list) tw.from = [...tw.cur];
      const instant = ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function';
      if (instant) {
        for (const tw of list) {
          tw.cur = [...tw.to];
          tw.apply(tw.cur);
          tw.done?.();
        }
        onFrame?.();
        return;
      }
      groups.set(name, list);
      const start = performance.now();
      const tick = (now: number): void => {
        if (destroyed) return;
        const e = ease(Math.min(1, (now - start) / ms));
        for (const tw of list) {
          tw.cur = tw.from.map((f, i) => f + ((tw.to[i] as number) - f) * e);
          tw.apply(tw.cur);
        }
        onFrame?.();
        if (e >= 1 || isInstant()) {
          frames.delete(name);
          groups.delete(name);
          if (e < 1) for (const tw of list) { tw.cur = [...tw.to]; tw.apply(tw.cur); }
          for (const tw of list) tw.done?.();
          onFrame?.();
          return;
        }
        frames.set(name, requestAnimationFrame(tick));
      };
      frames.set(name, requestAnimationFrame(tick));
    };

    params.onScrubStart?.(() => {
      for (const name of [...frames.keys()]) finish(name);
    });

    const text = (x: number, y: number, s: string, opts: { size?: number; mono?: boolean; fill?: string; weight?: string; anchor?: string } = {}): SVGTextElement => {
      const node = svg('text', {
        x,
        y,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? sm,
        fill: opts.fill ?? c.text,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    };

    const orderLabel = (id: string): string => {
      if (id === 'customers-first') return t('label.order.customersFirst', 'Customers first');
      if (id === 'sales-first') return t('label.order.salesFirst', 'Sale items first');
      throw new Error(`optimizer-stage: 모르는 차례 ${id}`);
    };

    // ── 층
    const layerSql = svg('g', {});
    const layerTables = svg('g', {});
    const layerEdges = svg('g', {});
    const layerNodes = svg('g', {});
    const layerCmp = svg('g', {});
    const layerPileLabels = svg('g', {});
    const layerChips = svg('g', {});
    const caption = text(W / 2, CAPTION_Y, '', { size: parseFloat(fontSizes.md), anchor: 'middle' });
    root.append(layerSql, layerTables, layerEdges, layerNodes, layerCmp, layerPileLabels, layerChips, caption);

    // ── SQL
    layerSql.append(svg('rect', { x: SQL_X - 8, y: SQL_Y - 12, width: 350, height: 16 + SQL_LINE * 5 + 8, rx: 6, fill: c.bgSubtle, stroke: c.border }));
    layerSql.append(text(SQL_X, SQL_Y, t('label.query', 'Query'), { size: xs, fill: c.textMuted }));
    const sqlLines: SVGTextElement[] = [];
    const setSql = (lines: string[]): void => {
      lines.forEach((line, i) => {
        let node = sqlLines[i];
        if (!node) {
          node = text(SQL_X, SQL_Y + 18 + i * SQL_LINE, '', { mono: true, size: sm });
          sqlLines[i] = node;
          layerSql.append(node);
        }
        node.textContent = line;
      });
    };

    // ── 표
    const tables = readTables(params.initialData);
    const rowRects = new Map<string, SVGRectElement[]>();
    const cellPos = new Map<string, { x: number; y: number }>();
    const midCol = typeof params.initialData?.middleLabelColumn === 'string' ? params.initialData.middleLabelColumn : '';
    const [midAlias, midField] = midCol.split('.');
    const filteredTable = typeof params.initialData?.filteredTable === 'string' ? params.initialData.filteredTable : '';
    const filteredIdColumn = typeof params.initialData?.filteredIdColumn === 'string' ? params.initialData.filteredIdColumn : '';
    {
      let smallX = TABLE_X;
      let bigY = TABLE_Y;
      const small = tables.filter((tb) => tb.rows.length <= BIG_TABLE_ROWS);
      const big = tables.filter((tb) => tb.rows.length > BIG_TABLE_ROWS);
      const drawTable = (tb: TableSpec, x0: number, y0: number, colW: number): void => {
        layerTables.append(text(x0, y0, tb.name, { mono: true, weight: 'bold' }));
        const perCol = tb.rows.length > BIG_TABLE_ROWS ? BIG_TABLE_ROWS : tb.rows.length;
        const blocks = Math.ceil(tb.rows.length / perCol);
        for (let b = 0; b < blocks; b++) {
          layerTables.append(text(x0 + b * colW, y0 + 14, tb.columns.join(' '), { mono: true, size: xs, fill: c.textMuted }));
        }
        const rects: SVGRectElement[] = [];
        tb.rows.forEach((row, i) => {
          const bx = x0 + Math.floor(i / perCol) * colW;
          const by = y0 + 28 + (i % perCol) * TABLE_ROW;
          const r = svg('rect', { x: bx - 3, y: by - 8, width: colW - 8, height: TABLE_ROW - 1, rx: 3, fill: c.primary, 'fill-opacity': 0 });
          rects.push(r);
          layerTables.append(r, text(bx, by, row.join(' '), { mono: true, size: xs }));
          if (tb.alias === midAlias) {
            const idx = tb.columns.indexOf(midField ?? '');
            if (idx >= 0) cellPos.set(String(row[idx]), { x: bx + colW / 2 - 4, y: by });
          }
        });
        rowRects.set(tb.key, rects);
      };
      for (const tb of small) {
        const colW = Math.max(80, tb.columns.length * 40 + 20);
        drawTable(tb, smallX, TABLE_Y, colW);
        smallX += colW + 12;
        bigY = Math.max(bigY, TABLE_Y + 28 + tb.rows.length * TABLE_ROW + 16);
      }
      for (const tb of big) {
        drawTable(tb, TABLE_X, bigY, BIG_COL_W);
        bigY += 28 + BIG_TABLE_ROWS * TABLE_ROW + 16;
      }
    }
    const highlightRows = (key: string, on: (i: number) => boolean): void => {
      const rects = rowRects.get(key);
      if (!rects) return;
      rects.forEach((r, i) => r.setAttribute('fill-opacity', on(i) ? '0.18' : '0'));
    };
    const tableOf = (key: string): TableSpec | undefined => tables.find((tb) => tb.key === key);

    // ── 계획 트리
    type NodeView = { g: SVGGElement; box: SVGRectElement; op: SVGTextElement; detail: SVGTextElement; rows: SVGTextElement; tw: Tween };
    const nodes = new Map<string, NodeView>();
    let parentOf = new Map<string, string>();
    const edgeLines = new Map<string, SVGLineElement>();
    const treeTitle = text(SQL_X, TREE_TITLE_Y, '', { size: sm, fill: c.textMuted });
    layerNodes.append(treeTitle);

    const layout = (plan: PlanShape): Map<string, { x: number; y: number }> => {
      const pos = new Map<string, { x: number; y: number }>();
      let slot = 0;
      const walk = (node: PlanShape, depth: number): number => {
        let x: number;
        if (node.children.length === 0) {
          const sx = SLOT_X[slot];
          if (sx === undefined) throw new Error('optimizer-stage: 잎 자리가 모자라다');
          x = sx;
          slot += 1;
        } else {
          const xsOfKids = node.children.map((ch) => walk(ch, depth + 1));
          x = xsOfKids.reduce((a, b) => a + b, 0) / xsOfKids.length;
        }
        pos.set(node.id, { x, y: TREE_TOP + depth * LEVEL });
        return x;
      };
      walk(plan, 0);
      return pos;
    };

    const drawEdges = (): void => {
      for (const [child, parent] of parentOf) {
        const a = nodes.get(parent);
        const b = nodes.get(child);
        const line = edgeLines.get(child);
        if (!a || !b || !line) continue;
        const [ax, ay] = a.tw.cur as [number, number];
        const [bx, by] = b.tw.cur as [number, number];
        line.setAttribute('x1', String(ax));
        line.setAttribute('y1', String(ay + NODE_H));
        line.setAttribute('x2', String(bx));
        line.setAttribute('y2', String(by));
      }
    };

    const ensureNode = (id: string, x: number, y: number): NodeView => {
      const have = nodes.get(id);
      if (have) return have;
      const g = svg('g', {});
      const box = svg('rect', { x: -NODE_W / 2, y: 0, width: NODE_W, height: NODE_H, rx: 6, fill: c.bg, stroke: c.border, 'stroke-width': 1.5 });
      const op = text(0, 11, '', { anchor: 'middle', weight: 'bold', size: sm });
      const detail = text(0, 25, '', { anchor: 'middle', mono: true, size: xs, fill: c.textMuted });
      const rows = text(0, 37, '', { anchor: 'middle', size: xs, fill: c.primary });
      g.append(box, op, detail, rows);
      layerNodes.append(g);
      const tw: Tween = {
        cur: [x, y],
        from: [x, y],
        to: [x, y],
        apply: (v) => g.setAttribute('transform', `translate(${v[0]},${v[1]})`),
      };
      tw.apply(tw.cur);
      const view = { g, box, op, detail, rows, tw };
      nodes.set(id, view);
      return view;
    };

    const setPlan = (plan: PlanShape, ms: number): void => {
      const pos = layout(plan);
      const nextParent = new Map<string, string>();
      const visit = (node: PlanShape): void => {
        const p = pos.get(node.id);
        if (!p) throw new Error(`optimizer-stage: 노드 ${node.id} 의 자리가 없다`);
        const view = ensureNode(node.id, p.x, p.y);
        view.op.textContent = node.op;
        view.detail.textContent = node.detail;
        view.rows.textContent = '';
        view.box.setAttribute('stroke', c.border);
        view.box.setAttribute('stroke-dasharray', node.op === 'Filter' ? '4 3' : 'none');
        view.tw.to = [p.x, p.y];
        for (const ch of node.children) {
          nextParent.set(ch.id, node.id);
          visit(ch);
        }
      };
      visit(plan);
      for (const [id, view] of nodes) {
        if (!pos.has(id)) {
          view.g.remove();
          nodes.delete(id);
        }
      }
      parentOf = nextParent;
      for (const [child, line] of edgeLines) {
        if (!parentOf.has(child)) {
          line.remove();
          edgeLines.delete(child);
        }
      }
      for (const child of parentOf.keys()) {
        if (!edgeLines.has(child)) {
          const line = svg('line', { stroke: c.border, 'stroke-width': 1.5 });
          edgeLines.set(child, line);
          layerEdges.append(line);
        }
      }
      run('tree', [...nodes.values()].map((v) => v.tw), ms, drawEdges);
    };

    const markJoin = (nodeId: string, count: number): void => {
      const view = nodes.get(nodeId);
      if (!view) throw new Error(`optimizer-stage: 조인 노드 ${nodeId} 가 트리에 없다`);
      for (const v of nodes.values()) v.box.setAttribute('stroke', c.border);
      view.box.setAttribute('stroke', c.primary);
      view.rows.textContent = t('label.rows', 'Rows: {n}', { n: count });
    };

    // ── 더미 (중간 · 끝)
    const midLabel = text(MID_X, PILE_Y - 14, '', { size: sm, weight: 'bold' });
    const finLabel = text(FIN_X, PILE_Y - 14, '', { size: sm, weight: 'bold' });
    layerPileLabels.append(midLabel, finLabel);

    type Chip = { g: SVGGElement; rect: SVGRectElement; tw: Tween; live: boolean };
    const midChips = new Map<string, Chip>();
    const finChips = new Map<string, Chip>();

    const makeChip = (label: string, w: number, stroke: string, x: number, y: number, o: number): Chip => {
      const g = svg('g', {});
      const rect = svg('rect', { x: 0, y: 0, width: w, height: CHIP_H, rx: 4, fill: c.bgSubtle, stroke, 'stroke-width': 1.5 });
      g.append(rect, text(w / 2, CHIP_H / 2 + 1, label, { mono: true, size: xs, anchor: 'middle' }));
      layerChips.append(g);
      const tw: Tween = {
        cur: [x, y, o],
        from: [x, y, o],
        to: [x, y, o],
        apply: (v) => {
          g.setAttribute('transform', `translate(${v[0]},${v[1]})`);
          g.setAttribute('opacity', String(v[2]));
        },
      };
      tw.apply(tw.cur);
      return { g, rect, tw, live: true };
    };

    const slotOf = (i: number, x0: number, cols: number, w: number): [number, number] => [
      x0 + (i % cols) * (w + CHIP_GAP),
      PILE_Y + Math.floor(i / cols) * (CHIP_H + CHIP_GAP),
    ];

    const ghost = (chips: Map<string, Chip>): Tween[] =>
      [...chips.values()].map((ch) => {
        ch.tw.to = [ch.tw.cur[0] as number, ch.tw.cur[1] as number, 0.25];
        return ch.tw;
      });

    // ── 견줌
    const cmpTitle = text(TABLE_X, CMP_Y - 18, '', { size: sm, weight: 'bold' });
    layerCmp.append(cmpTitle);
    type Bar = { label: SVGTextElement; bar: SVGRectElement; value: SVGTextElement; tw: Tween };
    const bars: Bar[] = [];
    const frame = svg('rect', { x: TABLE_X - 6, y: 0, width: W - TABLE_X - 8, height: CMP_ROW - 8, rx: 6, fill: 'none', stroke: c.success, 'stroke-width': 2, opacity: 0 });
    const frameTag = text(W - 16, 0, '', { size: xs, fill: c.success, anchor: 'end', weight: 'bold' });
    layerCmp.append(frame, frameTag);
    const frameTw: Tween = {
      cur: [CMP_Y, 0],
      from: [CMP_Y, 0],
      to: [CMP_Y, 0],
      apply: (v) => {
        const y = v[0] as number;
        frame.setAttribute('y', String(y - (CMP_ROW - 8) / 2));
        frame.setAttribute('opacity', String(v[1]));
        frameTag.setAttribute('y', String(y - (CMP_ROW - 8) / 2 - 7));
        frameTag.setAttribute('opacity', String(v[1]));
      },
    };
    let maxMade = 1;
    const ensureBars = (n: number): void => {
      while (bars.length < n) {
        const i = bars.length;
        const y = CMP_Y + i * CMP_ROW;
        const label = text(TABLE_X, y, '', { size: xs });
        const bar = svg('rect', { x: CMP_BAR_X, y: y - 7, width: 0, height: 14, rx: 3, fill: c.textMuted });
        const value = text(CMP_BAR_X + 6, y, '', { size: xs, mono: true });
        layerCmp.append(label, bar, value);
        const tw: Tween = {
          cur: [0, 0],
          from: [0, 0],
          to: [0, 0],
          apply: (v) => {
            const w = Math.max(0, v[0] as number);
            bar.setAttribute('width', String(w));
            bar.setAttribute('opacity', String(v[1]));
            value.setAttribute('x', String(CMP_BAR_X + w + 6));
            value.setAttribute('opacity', String(v[1]));
          },
        };
        bars.push({ label, bar, value, tw });
      }
    };

    // ── 처음 모습 (projector 가 onInit 에서 건넨다)
    let initial: InitialInput | null = null;
    const drawInitial = (): void => {
      if (!initial) return;
      setSql(initial.sql);
      treeTitle.textContent = t('label.plan', 'Plan: {order}', { order: orderLabel(initial.orderId) });
      setPlan(initial.plan, 0);
    };

    // ── 표면
    const api: OptimizerStageApi = {
      beginRound(p) {
        setSql(p.sql);
        treeTitle.textContent = t('label.plan', 'Plan: {order}', { order: orderLabel(p.orderId) });
        setPlan(p.plan, p.ms);
        // 판이 시작된 뒤에는 거르는 표가 반드시 있어야 한다 (마운트 때는 initialData 가 없어도 된다)
        const ft = tableOf(filteredTable);
        if (!ft) throw new Error(`optimizer-stage: 거르는 표 ${filteredTable} 가 없다`);
        const col = ft.columns.indexOf(filteredIdColumn);
        if (col < 0) throw new Error(`optimizer-stage: 열 ${filteredIdColumn} 이 없다`);
        highlightRows(ft.key, (i) => {
          const id = ft.rows[i]?.[col];
          return typeof id === 'number' && p.keptCustomerIds.includes(id);
        });
        for (const tb of tables) if (tb.key !== filteredTable) highlightRows(tb.key, () => false);
        midLabel.textContent = '';
        finLabel.textContent = '';
        cmpTitle.textContent = '';
        run('mid', ghost(midChips), p.ms);
        run('fin', ghost(finChips), p.ms);
        // 앞 판의 견줌은 옅게 남긴다 — 아직 보인 적 없으면 그대로 숨은 채
        for (const b of bars) b.tw.to = [b.tw.cur[0] as number, Math.min(0.3, b.tw.cur[1] as number)];
        frameTw.to = [frameTw.cur[0] as number, Math.min(0.3, frameTw.cur[1] as number)];
        run('cmp', [...bars.map((b) => b.tw), frameTw], p.ms);
        caption.textContent = t('caption.round', 'Plan {order} · Filter keeps customers: {n} of {total}', {
          order: orderLabel(p.orderId),
          n: p.keptCount,
          total: p.customerCount,
        });
      },
      firstJoin(p) {
        markJoin(p.nodeId, p.count);
        const keep = new Set(p.ids.map(String));
        const list: Tween[] = [];
        p.ids.forEach((id, i) => {
          const key = String(id);
          const [x, y] = slotOf(i, MID_X, MID_COLS, MID_W);
          let chip = midChips.get(key);
          if (!chip) {
            const src = cellPos.get(key);
            if (!src) throw new Error(`optimizer-stage: orders 에 ${key} 가 없다`);
            chip = makeChip(key, MID_W, c.accent, src.x - MID_W / 2, src.y - CHIP_H / 2, 0);
            midChips.set(key, chip);
          }
          chip.live = true;
          chip.tw.to = [x, y, 1];
          chip.tw.done = undefined;
          list.push(chip.tw);
        });
        for (const [key, chip] of midChips) {
          if (keep.has(key)) continue;
          const src = cellPos.get(key);
          if (!src) throw new Error(`optimizer-stage: orders 에 ${key} 가 없다`);
          chip.live = false;
          chip.tw.to = [src.x - MID_W / 2, src.y - CHIP_H / 2, 0];
          chip.tw.done = () => {
            if (chip.live) return;
            chip.g.remove();
            if (midChips.get(key) === chip) midChips.delete(key);
          };
          list.push(chip.tw);
        }
        run('mid', list, p.ms);
        // 중간으로 간 orders 줄에 불을 켠다
        for (const tb of tables) {
          if (tb.alias !== midAlias) continue;
          const idx = tb.columns.indexOf(midField ?? '');
          highlightRows(tb.key, (i) => keep.has(String(tb.rows[i]?.[idx])));
        }
        midLabel.textContent = t('label.middle', 'Intermediate rows: {n}', { n: p.count });
        caption.textContent = t('caption.firstJoin', 'First join ({cond}) · Intermediate rows: {n}', { cond: p.cond, n: p.count });
      },
      secondJoin(p) {
        markJoin(p.nodeId, p.finalCount);
        const keep = new Set(p.rows.map((r) => r.key));
        const list: Tween[] = [];
        p.rows.forEach((row, i) => {
          const [x, y] = slotOf(i, FIN_X, FIN_COLS, FIN_W);
          let chip = finChips.get(row.key);
          if (!chip) {
            const src = midChips.get(row.key);
            if (!src) throw new Error(`optimizer-stage: 중간 더미에 ${row.key} 가 없다`);
            chip = makeChip(`(${row.cells.join(', ')})`, FIN_W, c.success, src.tw.cur[0] as number, src.tw.cur[1] as number, 0);
            finChips.set(row.key, chip);
          }
          chip.live = true;
          chip.tw.to = [x, y, 1];
          chip.tw.done = undefined;
          list.push(chip.tw);
        });
        for (const [key, chip] of finChips) {
          if (keep.has(key)) continue;
          chip.live = false;
          chip.tw.to = [chip.tw.cur[0] as number, (chip.tw.cur[1] as number) + CHIP_H, 0];
          chip.tw.done = () => {
            if (chip.live) return;
            chip.g.remove();
            if (finChips.get(key) === chip) finChips.delete(key);
          };
          list.push(chip.tw);
        }
        run('fin', list, p.ms);
        finLabel.textContent = t('label.final', 'Final rows: {n}', { n: p.finalCount });
        caption.textContent = t('caption.secondJoin', 'Second join ({cond}) · Final rows: {f} · Rows made: {m}', {
          cond: p.cond,
          f: p.finalCount,
          m: p.madeCount,
        });
      },
      compare(p) {
        if (p.made.length !== p.orderIds.length) throw new Error('optimizer-stage: 만든 줄과 차례 수가 다르다');
        ensureBars(p.made.length);
        maxMade = Math.max(maxMade, ...p.made);
        cmpTitle.textContent = t('label.made', 'Rows made (intermediate + final)');
        p.made.forEach((m, i) => {
          const b = bars[i] as Bar;
          const id = p.orderIds[i] as string;
          b.label.textContent = orderLabel(id);
          b.label.setAttribute('font-weight', i === p.current ? 'bold' : 'normal');
          b.bar.setAttribute('fill', i === p.current ? c.primary : c.textMuted);
          b.value.textContent = String(m);
          b.tw.to = [(m / maxMade) * CMP_BAR_MAX, 1];
        });
        frameTag.textContent = t('label.cheaper', 'Cheaper');
        frameTw.to = [CMP_Y + p.cheaper * CMP_ROW, 1];
        run('cmp', [...bars.map((b) => b.tw), frameTw], p.ms);
        for (const v of nodes.values()) v.box.setAttribute('stroke', c.border);
        const [a, b] = p.orderIds;
        const [x, y] = p.made;
        if (a === undefined || b === undefined || x === undefined || y === undefined) throw new Error('optimizer-stage: 견줄 차례가 둘이 아니다');
        caption.textContent = t('caption.compare', 'Rows made · {a}: {x} · {b}: {y} · Cheaper: {order}', {
          a: orderLabel(a),
          x,
          b: orderLabel(b),
          y,
          order: orderLabel(p.orderIds[p.cheaper] as string),
        });
      },
      showInitial(p) {
        initial = p;
        drawInitial();
      },
      clear() {
        for (const name of [...frames.keys()]) finish(name);
        for (const ch of [...midChips.values(), ...finChips.values()]) ch.g.remove();
        midChips.clear();
        finChips.clear();
        for (const b of bars) {
          b.tw.cur = [0, 0];
          b.tw.apply(b.tw.cur);
        }
        frameTw.cur = [CMP_Y, 0];
        frameTw.apply(frameTw.cur);
        midLabel.textContent = '';
        finLabel.textContent = '';
        cmpTitle.textContent = '';
        caption.textContent = '';
        for (const tb of tables) highlightRows(tb.key, () => false);
        // SQL · 트리 제목 · 노드 글자 · 테두리까지 처음 모습으로
        for (const v of nodes.values()) v.g.remove();
        nodes.clear();
        for (const line of edgeLines.values()) line.remove();
        edgeLines.clear();
        parentOf = new Map();
        for (const line of sqlLines) line.textContent = '';
        treeTitle.textContent = '';
        drawInitial();
      },
    };

    return {
      ...api,
      destroy() {
        destroyed = true;
        for (const id of frames.values()) cancelAnimationFrame(id);
        frames.clear();
        groups.clear();
        root.replaceChildren();
      },
    };
  },
};
