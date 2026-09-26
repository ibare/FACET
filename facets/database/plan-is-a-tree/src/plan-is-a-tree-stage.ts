/**
 * plan-is-a-tree 무대 — 줄이 잎(표 읽기)에서 나와 연산자를 하나씩 거쳐 위로 흘러 올라간다.
 *
 * 나무는 계획 구조에서 셈한다 — 잎은 왼쪽부터 벌여 놓고, 부모는 자식들의 가운데, 높이는 깊이.
 * 표는 제 Seq Scan 아래에 둔다. 짓는 쪽 줄은 Hash Join 곁의 해시표에 고이고, 거르기에서 걸린 줄은
 * 그 연산자 곁에 멈춰 남고, 끝까지 오른 줄은 위쪽 답 표에 쌓인다.
 *
 * 흐르는 줄의 칸은 지나는 연산자에 따라 바뀐다 — 조인을 지나면 짝의 칸이 붙고, Project 를 지나면
 * 고른 칸만 남는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Cell, FlatNode, PlanIsATreeScene, SceneJourney, SceneTable } from './scene.js';

const H = 548;
const NS = 'http://www.w3.org/2000/svg';

const MONO_PX = parseFloat(fontSizes.xs);
const BODY_PX = parseFloat(fontSizes.sm);
const CH = MONO_PX * 0.62; // 고정폭 글자 하나의 폭
const ROW_H = 17;
const NODE_H = 34;
const LEVEL = 74;
const LEVEL0 = 134;
/** 캡션 첫 줄 — 맨 아래 표 밑. 세 줄까지 캔버스 안에 든다 */
const CAPTION_Y = 504;

/** 여정 운동의 길이 (ms) — 멈추는 여정은 짧게, 끝까지 오르는 여정은 길게. 둘 다 1000 안쪽 */
const MOVE_MS = { stored: 700, stopped: 720, answer: 1000 } as const;

type Pt = { x: number; y: number };

type Layout = {
  node: Map<string, { x: number; y: number; w: number; flat: FlatNode }>;
  table: Map<string, { x: number; top: number; widths: number[]; t: SceneTable; color: string }>;
  hash: Map<string, { x: number; top: number; table: string }>;
  answer: { x: number; top: number; widths: number[]; cols: string[] } | null;
};

function round(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

function cellText(c: Cell): string {
  return String(c);
}

function detailOf(n: FlatNode): string {
  const p = n.node;
  if (p.op === 'Seq Scan') return p.table;
  if (p.op === 'Filter') return [p.cond.col, p.cond.cmp, String(p.cond.value)].join(' ');
  if (p.op === 'Hash Join') return [p.on.left, '=', p.on.right].join(' ');
  return p.cols.join(', ');
}

function colWidth(t: SceneTable, i: number): number {
  let len = t.cols[i]!.length;
  for (const r of t.rows) len = Math.max(len, cellText(r[i]!).length);
  return len * CH + 10;
}

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

function leafTable(nodes: FlatNode[], id: string): string {
  const n = nodes.find((m) => m.id === id);
  if (!n) throw new Error(`plan-is-a-tree 무대: 노드 ${id} 가 없다`);
  if (n.node.op === 'Seq Scan') return n.node.table;
  return leafTable(nodes, n.children[0]!);
}

function layout(s: PlanIsATreeScene, colors: Palette): Layout {
  const W = PIECE_CANVAS_W;
  const nodes = s.base.nodes;
  const leaves = nodes.filter((n) => n.children.length === 0);
  const xs = new Map<string, number>();
  const span = leaves.length > 1 ? (W * 0.36) / (leaves.length - 1) : 0;
  leaves.forEach((n, i) => xs.set(n.id, leaves.length > 1 ? W * 0.2 + i * span : W * 0.38));
  for (const n of [...nodes].reverse()) {
    if (n.children.length === 0) continue;
    xs.set(n.id, sum(n.children.map((c) => xs.get(c)!)) / n.children.length);
  }
  const node: Layout['node'] = new Map();
  for (const n of nodes) {
    const w = Math.max(n.op.length * BODY_PX * 0.62, detailOf(n).length * CH) + 22;
    node.set(n.id, { x: xs.get(n.id)!, y: LEVEL0 + n.depth * LEVEL, w, flat: n });
  }

  const palette = categorical(Math.max(1, s.base.tables.length));
  const table: Layout['table'] = new Map();
  s.base.tables.forEach((t, i) => {
    const scan = nodes.find((n) => n.node.op === 'Seq Scan' && n.node.table === t.name)!;
    const at = node.get(scan.id)!;
    const widths = t.cols.map((_, c) => colWidth(t, c));
    table.set(t.name, { x: at.x, top: at.y + NODE_H / 2 + 8, widths, t, color: palette[i] ?? colors.text });
  });

  const hash: Layout['hash'] = new Map();
  for (const n of nodes) {
    if (n.node.op !== 'Hash Join') continue;
    const build = node.get(n.children[0]!)!;
    const tname = leafTable(nodes, n.children[0]!);
    const rows = table.get(tname)!.t.rows.length;
    const top = node.get(n.id)!.y - NODE_H / 2 - 10;
    // 해시표는 짓는 쪽 기둥 위, 짓는 쪽 연산자 바로 위에서 끝난다
    const bottomLimit = build.y - NODE_H / 2 - 12;
    const h = (rows + 1) * ROW_H;
    hash.set(n.id, { x: build.x, top: Math.min(top, bottomLimit - h), table: tname });
  }

  let answer: Layout['answer'] = null;
  const root = nodes[0];
  if (root && root.node.op === 'Project') {
    const cols = root.node.cols;
    const widths = cols.map((ref) => {
      const [alias, col] = ref.split('.');
      const t = s.base.tables.find((tt) => tt.alias === alias);
      const ci = t ? t.cols.indexOf(col ?? '') : -1;
      if (!t || ci < 0) throw new Error(`plan-is-a-tree 무대: Project 열 ${ref} 를 표에서 찾을 수 없다`);
      return Math.max(colWidth(t, ci), ref.length * CH + 10);
    });
    answer = { x: W * 0.66, top: 26, widths, cols };
  }
  return { node, table, hash, answer };
}

function rowCenterY(top: number, r: number): number {
  return top + ROW_H * (r + 1) + ROW_H / 2;
}

function wrap(text: string, maxW: number): string[] {
  const wOf = (s: string): number => {
    let w = 0;
    for (const ch of s) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? BODY_PX : BODY_PX * 0.56;
    return w;
  };
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && wOf(next) > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export const planIsATreeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element, text?: string): SVGElement {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      if (text !== undefined) e.textContent = text;
      parent.appendChild(e);
      return e;
    }

    /** 줄 하나 — 칸들을 가로로 잇는다. (cx, cy) 는 가운데 */
    function drawRow(
      parent: Element,
      cx: number,
      cy: number,
      cells: Cell[],
      widths: number[],
      stroke: string,
      opts: { dim?: boolean; fill?: string; stroke?: string; strokeW?: number } = {},
    ): void {
      const total = sum(widths);
      const g = el('g', opts.dim ? { opacity: 0.35 } : {}, parent);
      const left = cx - total / 2;
      el('rect', {
        x: left,
        y: cy - ROW_H / 2 + 1,
        width: total,
        height: ROW_H - 2,
        rx: 3,
        fill: opts.fill ?? colors.bg,
        stroke: opts.stroke ?? stroke,
        'stroke-width': opts.strokeW ?? 1.4,
      }, g);
      let x = left;
      cells.forEach((c, i) => {
        const w = widths[i] ?? 0;
        if (i > 0) el('line', { x1: x, y1: cy - ROW_H / 2 + 3, x2: x, y2: cy + ROW_H / 2 - 3, stroke: colors.border }, g);
        el('text', {
          x: x + w / 2,
          y: cy + MONO_PX * 0.35,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        }, g, cellText(c));
        x += w;
      });
    }

    function drawHeader(parent: Element, cx: number, top: number, cols: string[], widths: number[]): void {
      let x = cx - sum(widths) / 2;
      cols.forEach((c, i) => {
        const w = widths[i] ?? 0;
        el('text', {
          x: x + w / 2,
          y: top + ROW_H / 2 + MONO_PX * 0.35,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, parent, c);
        x += w;
      });
    }

    function tableOf(s: PlanIsATreeScene, name: string): SceneTable {
      const found = s.base.tables.find((tt) => tt.name === name);
      if (!found) throw new Error(`plan-is-a-tree 무대: 표 ${name} 가 없다`);
      return found;
    }

    function rowLabel(s: PlanIsATreeScene, name: string, row: number): Cell {
      const r = tableOf(s, name).rows[row];
      if (!r) throw new Error(`plan-is-a-tree 무대: 표 ${name} 에 줄 ${row} 가 없다`);
      return r.find((c) => typeof c === 'string') ?? r[0]!;
    }

    /** 조건 열의 값 — 표의 그 줄에서 읽는다 */
    function condValue(s: PlanIsATreeScene, name: string, row: number, ref: string): Cell {
      const tb = tableOf(s, name);
      const col = ref.split('.')[1];
      const ci = col === undefined ? -1 : tb.cols.indexOf(col);
      if (ci < 0) throw new Error(`plan-is-a-tree 무대: 열 ${ref} 가 표 ${name} 에 없다`);
      const r = tb.rows[row];
      if (!r) throw new Error(`plan-is-a-tree 무대: 표 ${name} 에 줄 ${row} 가 없다`);
      return r[ci]!;
    }

    function captionFor(s: PlanIsATreeScene): string {
      const j = s.step;
      if (!j) return t('caption.start', 'The plan waits for its first row. Nothing has risen yet.');
      const label = rowLabel(s, j.table, j.row);
      if (j.end === 'stored') {
        return t(
          'caption.stored',
          'The build side is read to the end first. {table} {label} rises and stays in the hash table. Stored rows: {n}',
          { table: j.table, label, n: s.stored.length },
        );
      }
      if (j.end === 'answer') {
        const m = j.match;
        if (!m) throw new Error('plan-is-a-tree 무대: 답 걸음에 조인 짝이 없다');
        const mlabel = rowLabel(s, m.table, m.row);
        const filter = j.path
          .map((id) => s.base.nodes.find((n) => n.id === id))
          .find((n) => n?.node.op === 'Filter');
        if (filter && filter.node.op === 'Filter') {
          return t(
            'caption.answer',
            '{table} {label} rises all the way: {col} {value} meets {cond}, it pairs with {mtable} {mlabel} from the hash table, and becomes an answer. Answer rows: {n}',
            {
              table: j.table,
              label,
              col: filter.node.cond.col,
              value: condValue(s, j.table, j.row, filter.node.cond.col),
              cond: detailOf(filter),
              mtable: m.table,
              mlabel,
              n: s.answers.length,
            },
          );
        }
        return t(
          'caption.answerNoFilter',
          '{table} {label} rises all the way: it pairs with {mtable} {mlabel} from the hash table and becomes an answer. Answer rows: {n}',
          { table: j.table, label, mtable: m.table, mlabel, n: s.answers.length },
        );
      }
      const stopId = j.path[j.path.length - 1]!;
      const stop = s.base.nodes.find((n) => n.id === stopId);
      if (!stop) throw new Error(`plan-is-a-tree 무대: 멈춘 자리 ${stopId} 가 없다`);
      if (stop.node.op === 'Filter') {
        return t(
          'caption.stopped',
          '{table} {label} rises and stops at {op}: {col} {value} fails {cond}. Stopped rows: {n}',
          {
            table: j.table,
            label,
            op: stop.op,
            col: stop.node.cond.col,
            value: condValue(s, j.table, j.row, stop.node.cond.col),
            cond: detailOf(stop),
            n: s.stopped.length,
          },
        );
      }
      return t('caption.nomatch', '{table} {label} rises and stops at {op}: the hash table has no match. Stopped rows: {n}', {
        table: j.table,
        label,
        op: stop.op,
        n: s.stopped.length,
      });
    }

    // ───── 운동의 길 ─────

    type Motion = { pos: Pt; cells: Cell[]; widths: number[]; stroke: string; passed: Set<string>; arrived: boolean };

    function joinedWidths(L: Layout, j: SceneJourney): { cells: Cell[]; widths: number[] } {
      const src = L.table.get(j.table)!;
      const cells = [...src.t.rows[j.row]!];
      const widths = [...src.widths];
      if (j.match) {
        const m = L.table.get(j.match.table)!;
        cells.push(...m.t.rows[j.match.row]!);
        widths.push(...m.widths);
      }
      return { cells, widths };
    }

    /** 이 걸음의 여정이 지나는 점들 — 표의 줄 → 연산자들 → 멈춘 자리 */
    function routeOf(s: PlanIsATreeScene, L: Layout, j: SceneJourney): { pts: Pt[]; ids: (string | null)[] } {
      const src = L.table.get(j.table)!;
      const pts: Pt[] = [{ x: src.x, y: rowCenterY(src.top, j.row) }];
      const ids: (string | null)[] = [null];
      const last = j.path.length - 1;
      j.path.forEach((id, i) => {
        const n = L.node.get(id)!;
        if (i === last && j.end === 'stored') return; // 조인 한가운데가 아니라 곁의 해시표로 든다
        pts.push({ x: n.x, y: n.y });
        ids.push(id);
      });
      pts.push(destOf(s, L, j));
      ids.push(null);
      return { pts, ids };
    }

    function destOf(s: PlanIsATreeScene, L: Layout, j: SceneJourney): Pt {
      const stopId = j.path[j.path.length - 1]!;
      if (j.end === 'stored') {
        const h = L.hash.get(stopId)!;
        const k = s.stored.filter((r) => r.join === stopId).length - 1;
        return { x: h.x, y: rowCenterY(h.top, k) };
      }
      if (j.end === 'stopped') {
        const n = L.node.get(stopId)!;
        const k = s.stopped.filter((r) => r.node === stopId).length - 1;
        const w = sum(L.table.get(j.table)!.widths);
        return { x: n.x + n.w / 2 + 10 + w / 2, y: n.y - NODE_H / 2 + ROW_H / 2 + k * (ROW_H + 2) };
      }
      const a = L.answer!;
      return { x: a.x + sum(a.widths) / 2, y: rowCenterY(a.top, s.answers.length - 1) };
    }

    function motionAt(s: PlanIsATreeScene, L: Layout, j: SceneJourney, p: number): Motion {
      const { pts, ids } = routeOf(s, L, j);
      const segs: number[] = [];
      for (let i = 1; i < pts.length; i += 1) segs.push(Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
      const total = sum(segs);
      let d = p * total;
      let i = 0;
      while (i < segs.length - 1 && d > segs[i]!) {
        d -= segs[i]!;
        i += 1;
      }
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const f = segs[i]! > 0 ? Math.min(1, d / segs[i]!) : 1;
      const pos = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      const passed = new Set<string>();
      for (let k = 1; k <= i + (f >= 1 ? 1 : 0) && k < ids.length; k += 1) {
        const id = ids[k];
        if (id) passed.add(id);
      }
      const src = L.table.get(j.table)!;
      let cells: Cell[] = [...src.t.rows[j.row]!];
      let widths = [...src.widths];
      let stroke = src.color;
      for (const id of passed) {
        const n = L.node.get(id)!;
        if (n.flat.op === 'Hash Join' && j.end === 'answer') ({ cells, widths } = joinedWidths(L, j));
        if (n.flat.op === 'Project' && j.out && L.answer) {
          cells = [...j.out];
          widths = [...L.answer.widths];
          stroke = colors.success;
        }
      }
      return { pos, cells, widths, stroke, passed, arrived: p >= 1 };
    }

    // ───── 정적 그리기 (정본) ─────

    function drawStatic(s: PlanIsATreeScene, m: Motion | null): void {
      svg.textContent = '';
      const L = layout(s, colors);
      const j = s.step;
      const lit = new Set(j && (!m || m.arrived) ? j.path : m ? [...m.passed] : []);
      const stopId = j ? j.path[j.path.length - 1]! : null;
      const stopShown = j && j.end === 'stopped' && (!m || m.arrived);

      // SQL
      const sqlG = el('g', {}, svg);
      s.base.sql.forEach((line, i) => {
        el('text', {
          x: 16,
          y: 22 + i * 15,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
          'xml:space': 'preserve',
        }, sqlG, line);
      });

      // 간선
      const edges = el('g', {}, svg);
      for (const n of s.base.nodes) {
        const p = L.node.get(n.id)!;
        n.children.forEach((cid, ci) => {
          const c = L.node.get(cid)!;
          const on = lit.has(cid) && lit.has(n.id);
          el('line', {
            x1: p.x,
            y1: p.y + NODE_H / 2,
            x2: c.x,
            y2: c.y - NODE_H / 2,
            stroke: on ? colors.primary : colors.border,
            'stroke-width': on ? 2.4 : 1.4,
          }, edges);
          if (n.node.op === 'Hash Join') {
            // 자식 쪽으로 70% 내려간 자리, 선의 오른편 — 곁의 해시표와 겹치지 않게
            const f = 0.7;
            const lx = p.x + (c.x - p.x) * f;
            const ly = p.y + NODE_H / 2 + (c.y - NODE_H / 2 - (p.y + NODE_H / 2)) * f;
            el('text', {
              x: lx + 10,
              y: ly + 4,
              'text-anchor': 'start',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            }, edges, ci === 0 ? t('label.build', 'build') : t('label.probe', 'probe'));
          }
        });
      }

      // 해시표 (짓는 쪽이 고이는 자리)
      for (const [joinId, h] of L.hash) {
        const tb = L.table.get(h.table)!;
        const w = sum(tb.widths) + 12;
        const rows = tb.t.rows.length;
        const g = el('g', {}, svg);
        const jn = L.node.get(joinId)!;
        el('line', {
          x1: h.x + w / 2,
          y1: jn.y,
          x2: jn.x - jn.w / 2,
          y2: jn.y,
          stroke: colors.border,
          'stroke-dasharray': '3 3',
        }, g);
        el('rect', {
          x: h.x - w / 2,
          y: h.top - 2,
          width: w,
          height: (rows + 1) * ROW_H + 6,
          rx: 5,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-dasharray': '4 3',
        }, g);
        el('text', {
          x: h.x - w / 2,
          y: h.top - 7,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, g, t('label.hash', 'hash table'));
        drawHeader(g, h.x, h.top, tb.t.cols, tb.widths);
        const mine = s.stored.filter((r) => r.join === joinId);
        mine.forEach((r, k) => {
          const hide = m && !m.arrived && j?.end === 'stored' && k === mine.length - 1;
          if (hide) return;
          const matched =
            j?.end === 'answer' &&
            j.match?.table === r.table &&
            j.match.row === r.row &&
            (!m || m.passed.has(joinId));
          drawRow(g, h.x, rowCenterY(h.top, k), tb.t.rows[r.row]!, tb.widths, tb.color, {
            fill: matched ? colors.bgSubtle : colors.bg,
            stroke: matched ? colors.accent : undefined,
            strokeW: matched ? 3 : 1.4,
          });
        });
      }

      // 연산자
      for (const n of s.base.nodes) {
        const p = L.node.get(n.id)!;
        const g = el('g', {}, svg);
        const isStop = stopShown && n.id === stopId;
        el('rect', {
          x: p.x - p.w / 2,
          y: p.y - NODE_H / 2,
          width: p.w,
          height: NODE_H,
          rx: 6,
          fill: colors.bg,
          stroke: isStop ? colors.danger : lit.has(n.id) ? colors.primary : colors.border,
          'stroke-width': isStop || lit.has(n.id) ? 2.2 : 1.2,
        }, g);
        el('text', {
          x: p.x,
          y: p.y - 3,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: colors.text,
        }, g, n.op);
        el('text', {
          x: p.x,
          y: p.y + 11,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, g, detailOf(n));
      }

      // 바탕 표 — 읽힌 줄은 흐리게 남는다 (원본은 제자리)
      for (const [name, tb] of L.table) {
        const g = el('g', {}, svg);
        drawHeader(g, tb.x, tb.top, tb.t.cols, tb.widths);
        tb.t.rows.forEach((row, r) => {
          const read = s.read.some((x) => x.table === name && x.row === r);
          drawRow(g, tb.x, rowCenterY(tb.top, r), row, tb.widths, tb.color, { dim: read });
        });
      }

      // 멈춘 줄 — 멈춘 연산자 곁
      const stopG = el('g', {}, svg);
      const perNode = new Map<string, number>();
      s.stopped.forEach((r, k) => {
        const i = perNode.get(r.node) ?? 0;
        perNode.set(r.node, i + 1);
        if (m && !m.arrived && j?.end === 'stopped' && k === s.stopped.length - 1) return;
        const n = L.node.get(r.node)!;
        const tb = L.table.get(r.table)!;
        const w = sum(tb.widths);
        drawRow(stopG, n.x + n.w / 2 + 10 + w / 2, n.y - NODE_H / 2 + ROW_H / 2 + i * (ROW_H + 2), tb.t.rows[r.row]!, tb.widths, colors.danger, {
          fill: colors.bgSubtle,
        });
      });

      // 답 표 — 끝까지 오른 줄
      if (L.answer) {
        const a = L.answer;
        const g = el('g', {}, svg);
        el('text', {
          x: a.x,
          y: a.top - 6,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 600,
          fill: colors.textMuted,
        }, g, t('label.answer', 'answer'));
        const cx = a.x + sum(a.widths) / 2;
        drawHeader(g, cx, a.top, a.cols, a.widths);
        s.answers.forEach((r, k) => {
          if (m && !m.arrived && j?.end === 'answer' && k === s.answers.length - 1) return;
          drawRow(g, cx, rowCenterY(a.top, k), r.out, a.widths, colors.success);
        });
      }

      // 흐르는 줄
      if (m && !m.arrived) {
        const g = el('g', {}, svg);
        drawRow(g, m.pos.x, m.pos.y, m.cells, m.widths, m.stroke, { strokeW: 2.2 });
      }

      // 캡션
      const cap = el('g', {}, svg);
      const lines = wrap(captionFor(s), W - 32);
      lines.forEach((line, i) => {
        el('text', {
          x: 16,
          y: CAPTION_Y + i * 17,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.text,
        }, cap, line);
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          clearTimeout(id);
          timers.delete(id);
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function flow(s: PlanIsATreeScene, j: SceneJourney, mine: number): Promise<void> {
      const L = layout(s, colors);
      const dur = MOVE_MS[j.end];
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const raw = Math.min(1, (Date.now() - start) / dur);
        const p = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        if (raw >= 1) return;
        drawStatic(s, motionAt(s, L, j, p));
        await wait(16);
      }
    }

    return {
      async render(next: PlanIsATreeScene, prev: PlanIsATreeScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const j = next.step;
        if (opts.animate && j && prev && prev.step !== j) {
          await flow(next, j, mine);
          if (mine !== gen || destroyed) return;
        }
        drawStatic(next, null);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
