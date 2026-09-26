/**
 * lr-precedence 무대 — 문법 · 우선순위 · 충돌 칸 넷 · 남은 입력 · 스택 기둥 · 접혀 가는 나무.
 *
 * 운동: 표 정하기에서 충돌 칸 넷이 **뒤집혀** 한 동작이 되고, 밀기마다 토큰 상자가 입력 줄에서 스택 꼭대기로 **옮겨 가며**,
 * 접기마다 꼭대기 칸들이 `E` 하나로 **접혀 내려앉고** 그 아래 나무에 마디가 솟아 가지를 묶는다. 다음 토큰 표지가 줄을 따라간다.
 * 운동 길이는 projector 가 재생 속도로 셈해 넘긴다. 무대는 셈을 다시 하지 않는다 — 스택 · 값 · 마디 자리는 payload 로 받는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { ruleName, ruleText, type LrNode, type LrRule } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 470;

// 자리
const STRIP_X0 = 190;
const STRIP_DX = 70;
const STRIP_Y = 182;
const BOX_W = 62;
const BOX_H = 28;
const STACK_X = 75;
const STACK_W = 100;
const STACK_BOTTOM = 446;
const STACK_PITCH = 30;
const STACK_SLOTS = 7;
const TREE_LEAF_Y = 440;
const TREE_DY = 56;
const NODE_R = 15;
const TABLE_ITEM_X = 400;
const TABLE_COL_X = [600, 690];
const TABLE_ROW_Y = [68, 102];
const CELL_W = 84;
const CELL_H = 28;

export type LrStageStart = {
  tokens: string[];
  remaining: number;
  conflicts: { item: string; look: string; reduceRule: string }[];
  ops: { op: string; level: number; assoc: string }[];
};
export type LrStageResolve = {
  cells: { action: string; rule: string }[];
  shiftCells: number;
  reduceCells: number;
};
export type LrStageShift = { token: number; look: string; symbol: string; stack: string[]; cell: number; remaining: number };
export type LrStageReduce = {
  rule: string;
  pop: number;
  look: string;
  stack: string[];
  value: number;
  cell: number;
  node: LrNode;
};
export type LrStageAccept = { value: number; tree: string; look: string; root: number };

/** projector 가 부르는 무대의 표면. */
export type LrPrecedenceStage = {
  /** 되감기 — 이 판의 그림(결론과 칸)을 모두 걷고 문법만 남긴다. */
  clear(): void;
  start(p: LrStageStart, ms: number): Promise<void>;
  resolve(p: LrStageResolve, ms: number): Promise<void>;
  shift(p: LrStageShift, ms: number): Promise<void>;
  reduce(p: LrStageReduce, ms: number): Promise<void>;
  accept(p: LrStageAccept, ms: number): Promise<void>;
  destroy(): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  if (parent) parent.appendChild(e);
  return e;
}

const stripX = (i: number): number => STRIP_X0 + i * STRIP_DX;
const slotY = (k: number): number => STACK_BOTTOM - k * STACK_PITCH;
const nodeY = (level: number): number => TREE_LEAF_Y - level * TREE_DY;
const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

export const lrPrecedenceStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const root = el('g', {}, svg);
    const sm = parseFloat(fontSizes.sm);
    const md = parseFloat(fontSizes.md);

    // 걸린 운동 — 새 판 · 파기에서 끝으로 밀어 둔다
    const running = new Set<{ id: number; finish: () => void }>();
    const tween = (ms: number, frame: (k: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
          frame(1);
          resolve();
          return;
        }
        const job = { id: 0, finish: () => {} };
        const t0 = performance.now();
        job.finish = () => {
          cancelAnimationFrame(job.id);
          running.delete(job);
          frame(1);
          resolve();
        };
        const tick = (now: number): void => {
          const k = Math.min(1, (now - t0) / ms);
          if (k >= 1) {
            job.finish();
            return;
          }
          frame(ease(k));
          job.id = requestAnimationFrame(tick);
        };
        running.add(job);
        job.id = requestAnimationFrame(tick);
      });
    const finishAll = (): void => {
      for (const job of [...running]) job.finish();
    };

    const text = (
      parent: SVGElement,
      x: number,
      y: number,
      s: string,
      o: { size?: number; anchor?: string; color?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement => {
      const e = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono === true ? fonts.mono : fonts.body,
          'font-size': o.size ?? md,
          'text-anchor': o.anchor ?? 'start',
          'dominant-baseline': 'middle',
          fill: o.color ?? c.text,
          'font-weight': o.weight ?? 'normal',
        },
        parent,
      );
      e.textContent = s;
      return e;
    };

    // ── 늘 있는 것: 문법 (자료 글자)
    text(root, 20, 22, t('label.grammar', 'Grammar'), { size: sm, color: c.textMuted });
    // initialData 가 없을 때(전수 검사가 config 만 주고 마운트)만 문법 자리를 비워 둔다. 있는데 모양이 틀리면 던진다
    if (params.initialData !== undefined) {
      const grammar = params.initialData['grammar'];
      if (!Array.isArray(grammar)) throw new Error('lr-precedence 무대: initialData.grammar 가 배열이 아니다');
      grammar.forEach((r, i) => {
        if (typeof r !== 'object' || r === null) throw new Error('lr-precedence 무대: 문법 규칙이 객체가 아니다');
        const lhs = (r as { lhs?: unknown }).lhs;
        const body = (r as { body?: unknown }).body;
        if (typeof lhs !== 'string' || !Array.isArray(body) || !body.every((b) => typeof b === 'string')) {
          throw new Error('lr-precedence 무대: 문법 규칙의 모양이 틀렸다');
        }
        const rule: LrRule = { lhs, body: body as string[] };
        text(root, 20, 46 + i * 22, ruleName(i + 1), { mono: true, color: c.textMuted });
        text(root, 52, 46 + i * 22, ruleText(rule), { mono: true });
      });
    }
    text(root, 200, 22, t('label.precedence', 'Precedence'), { size: sm, color: c.textMuted });
    const precLayer = el('g', {}, root);

    // ── 충돌 칸 표
    text(root, TABLE_ITEM_X, 22, t('label.table', 'Conflict cells'), { size: sm, color: c.textMuted });
    const tableLayer = el('g', {}, root);
    type TableCell = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement; cx: number; cy: number };
    let tableCells: TableCell[] = [];

    // ── 캡션 · 결과
    const caption = text(root, 20, 146, '', { size: md });
    const result = text(root, W - 20, 226, '', { size: parseFloat(fontSizes.lg), anchor: 'end', weight: 'bold' });

    // ── 남은 입력 줄
    const inputLabel = text(root, 20, STRIP_Y, '', { size: sm, color: c.textMuted });
    const stripLayer = el('g', {}, root);
    const cursor = el(
      'rect',
      { x: stripX(0) - BOX_W / 2 - 4, y: STRIP_Y - BOX_H / 2 - 4, width: BOX_W + 8, height: BOX_H + 8, rx: 6, fill: 'none', stroke: c.accent, 'stroke-width': 3, opacity: 0 },
      root,
    );
    let cursorX = stripX(0);
    type StripBox = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement };
    let strip: StripBox[] = [];

    // ── 스택 기둥 (7 칸 자리를 처음부터)
    const stackLabel = text(root, 20, 226, '', { size: sm, color: c.textMuted });
    for (let k = 0; k < STACK_SLOTS; k += 1) {
      el('rect', { x: STACK_X - STACK_W / 2, y: slotY(k) - BOX_H / 2, width: STACK_W, height: BOX_H, rx: 4, fill: 'none', stroke: c.border, 'stroke-dasharray': '3 3' }, root);
    }
    const stackLayer = el('g', {}, root);
    type StackCell = { g: SVGGElement; x: number; y: number };
    let stackCells: StackCell[] = [];

    // ── 나무
    text(root, 160, 226, t('label.tree', 'Tree'), { size: sm, color: c.textMuted });
    const edgeLayer = el('g', {}, root);
    const nodeLayer = el('g', {}, root);
    type TreeNode = { g: SVGGElement; circle: SVGCircleElement; x: number; y: number; edges: { line: SVGLineElement; kid: number }[] };
    let nodes = new Map<number, TreeNode>();

    const place = (g: SVGGElement, x: number, y: number, sx = 1, sy = 1): void => {
      g.setAttribute('transform', `translate(${x} ${y}) scale(${sx} ${sy})`);
    };
    const moveCursor = (to: number, ms: number): Promise<void> => {
      const from = cursorX;
      cursorX = to;
      return tween(ms, (k) => cursor.setAttribute('x', String(from + (to - from) * k - BOX_W / 2 - 4)));
    };

    const makeStackCell = (symbol: string, x: number, y: number): StackCell => {
      const g = el('g', {}, stackLayer);
      const isE = symbol === 'E';
      el('rect', { x: -STACK_W / 2, y: -BOX_H / 2, width: STACK_W, height: BOX_H, rx: 4, fill: isE ? c.bgSubtle : c.itemDefault, stroke: c.text, 'stroke-width': isE ? 2 : 1 }, g);
      text(g, 0, 0, symbol, { mono: true, anchor: 'middle', weight: isE ? 'bold' : 'normal' });
      place(g, x, y);
      return { g, x, y };
    };

    const markCell = (cell: number): void => {
      tableCells.forEach((tc, i) => {
        tc.rect.setAttribute('stroke-width', i === cell ? '3' : '1.5');
        tc.rect.setAttribute('stroke', i === cell ? c.itemActive : c.text);
      });
    };

    const paintCell = (tc: TableCell, action: string, rule: string): void => {
      if (action === 'shift') {
        tc.rect.setAttribute('fill', c.accent);
        tc.label.setAttribute('fill', c.stateInk);
        tc.label.setAttribute('font-weight', 'bold');
        tc.label.textContent = t('label.shift', 'shift');
      } else if (action === 'reduce') {
        tc.rect.setAttribute('fill', c.bgSubtle);
        tc.label.setAttribute('fill', c.text);
        tc.label.setAttribute('font-weight', 'normal');
        tc.label.textContent = t('label.reduce', 'reduce {rule}', { rule });
      } else {
        throw new Error(`lr-precedence 무대: 모르는 동작 ${action}`);
      }
      tc.rect.setAttribute('stroke-dasharray', 'none');
      tc.rect.setAttribute('stroke', c.text);
    };

    const readValue = (pre: string): string => t('label.value', 'Value: {v}', { v: pre });

    const inst: LrPrecedenceStage & ViewInstance = {
      clear() {
        finishAll();
        edgeLayer.replaceChildren();
        nodeLayer.replaceChildren();
        nodes = new Map();
        stackLayer.replaceChildren();
        stackCells = [];
        precLayer.replaceChildren();
        tableLayer.replaceChildren();
        tableCells = [];
        stripLayer.replaceChildren();
        strip = [];
        cursor.setAttribute('opacity', '0');
        caption.textContent = '';
        result.textContent = '';
        inputLabel.textContent = '';
        stackLabel.textContent = '';
      },

      start(p, ms) {
        finishAll();
        // 앞 판의 결론(나무 · 값 · 칸의 동작 · 스택)을 걷는다 — 자리(표 칸 · 입력 상자 · 스택 틀)는 남긴다
        edgeLayer.replaceChildren();
        nodeLayer.replaceChildren();
        nodes = new Map();
        stackLayer.replaceChildren();
        stackCells = [];
        result.textContent = '';

        precLayer.replaceChildren();
        p.ops.forEach((o, i) => {
          let assoc: string;
          if (o.assoc === 'left') assoc = t('label.left', 'left');
          else if (o.assoc === 'right') assoc = t('label.right', 'right');
          else throw new Error(`lr-precedence 무대: 모르는 결합 ${o.assoc}`);
          text(precLayer, 200, 46 + i * 22, t('label.prec', '{op} level {level}, {assoc}', { op: o.op, level: o.level, assoc }), { mono: false });
        });

        tableLayer.replaceChildren();
        tableCells = [];
        const rows: string[] = [];
        const cols: string[] = [];
        for (const cf of p.conflicts) {
          if (!rows.includes(cf.item)) rows.push(cf.item);
          if (!cols.includes(cf.look)) cols.push(cf.look);
        }
        if (rows.length > TABLE_ROW_Y.length || cols.length > TABLE_COL_X.length) {
          throw new Error('lr-precedence 무대: 충돌 칸 표가 두 줄 · 두 칸을 넘는다');
        }
        cols.forEach((look, j) => text(tableLayer, TABLE_COL_X[j] as number, 44, t('label.next', 'next {tok}', { tok: look }), { size: sm, anchor: 'middle', color: c.textMuted }));
        rows.forEach((item, i) => text(tableLayer, TABLE_ITEM_X, TABLE_ROW_Y[i] as number, item, { mono: true, size: sm }));
        for (const cf of p.conflicts) {
          const cx = TABLE_COL_X[cols.indexOf(cf.look)] as number;
          const cy = TABLE_ROW_Y[rows.indexOf(cf.item)] as number;
          const g = el('g', {}, tableLayer);
          const rect = el('rect', { x: -CELL_W / 2, y: -CELL_H / 2, width: CELL_W, height: CELL_H, rx: 4, fill: c.bg, stroke: c.itemComparing, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, g);
          const label = text(g, 0, 0, t('label.both', '{shift} / {reduce}', { shift: t('label.shift', 'shift'), reduce: t('label.reduce', 'reduce {rule}', { rule: cf.reduceRule }) }), { size: sm, anchor: 'middle', color: c.textMuted });
          place(g, cx, cy);
          tableCells.push({ g, rect, label, cx, cy });
        }

        stripLayer.replaceChildren();
        strip = [];
        p.tokens.forEach((tk, i) => {
          const g = el('g', {}, stripLayer);
          const rect = el('rect', { x: -BOX_W / 2, y: -BOX_H / 2, width: BOX_W, height: BOX_H, rx: 4, fill: c.itemDefault, stroke: c.text }, g);
          const label = text(g, 0, 0, tk, { mono: true, size: sm, anchor: 'middle' });
          place(g, stripX(i), STRIP_Y);
          strip.push({ g, rect, label });
        });
        cursorX = stripX(0);
        cursor.setAttribute('x', String(cursorX - BOX_W / 2 - 4));
        cursor.setAttribute('opacity', '1');
        inputLabel.textContent = t('label.input', 'Input left: {n}', { n: p.remaining });
        stackLabel.textContent = t('label.stack', 'Stack: {n}', { n: 0 });
        caption.textContent = t('caption.start', 'Stack empty · input left: {n}', { n: p.remaining });
        // 입력 줄이 오른쪽에서 제자리로 다시 들어온다 — 앞 판에 먹힌 토큰이 돌아온다
        return tween(ms, (k) => {
          strip.forEach((b, i) => place(b.g, stripX(i) + (1 - k) * (STRIP_DX * 0.6 + i * 8), STRIP_Y));
        });
      },

      resolve(p, ms) {
        finishAll();
        if (p.cells.length !== tableCells.length) throw new Error('lr-precedence 무대: 정한 칸 수가 충돌 칸 수와 다르다');
        caption.textContent = t('caption.resolve', 'Precedence sets the conflict cells: shift {s} · reduce {r}', { s: p.shiftCells, r: p.reduceCells });
        let swapped = false;
        return tween(ms, (k) => {
          // 칸이 가운데 줄을 축으로 뒤집힌다 — 반을 돌았을 때 동작이 바뀐다
          const sy = Math.max(0.02, Math.abs(1 - 2 * k));
          tableCells.forEach((tc) => place(tc.g, tc.cx, tc.cy, 1, sy));
          if (!swapped && k >= 0.5) {
            swapped = true;
            p.cells.forEach((cell, i) => paintCell(tableCells[i] as TableCell, cell.action, cell.rule));
          }
        });
      },

      shift(p, ms) {
        finishAll();
        markCell(p.cell);
        const box = strip[p.token];
        if (box === undefined) throw new Error(`lr-precedence 무대: 없는 토큰 자리 ${p.token}`);
        caption.textContent =
          p.cell >= 0
            ? t('caption.shiftByRule', 'Next {tok}: shift {sym} · cell set by precedence', { tok: p.look, sym: p.symbol })
            : t('caption.shift', 'Next {tok}: shift {sym}', { tok: p.look, sym: p.symbol });
        // 입력 줄의 상자는 빈 틀로 남고, 기호 칸이 그 자리에서 스택 꼭대기로 옮겨 간다
        box.label.textContent = '';
        box.rect.setAttribute('stroke', c.border);
        box.rect.setAttribute('stroke-dasharray', '3 3');
        box.rect.setAttribute('fill', 'none');
        const height = p.stack.length;
        if (height > STACK_SLOTS) throw new Error('lr-precedence 무대: 스택이 기둥 칸을 넘는다');
        const fromX = stripX(p.token);
        const toY = slotY(height - 1);
        const cellEl = makeStackCell(p.symbol, fromX, STRIP_Y);
        stackCells.push(cellEl);
        if (stackCells.length !== height) throw new Error('lr-precedence 무대: 스택 칸 수가 payload 와 다르다');
        cellEl.x = STACK_X;
        cellEl.y = toY;
        inputLabel.textContent = t('label.input', 'Input left: {n}', { n: p.remaining });
        stackLabel.textContent = t('label.stack', 'Stack: {n}', { n: height });
        const moves = [
          tween(ms, (k) => place(cellEl.g, fromX + (STACK_X - fromX) * k, STRIP_Y + (toY - STRIP_Y) * k)),
          moveCursor(stripX(p.token + 1), ms),
        ];
        return Promise.all(moves).then(() => undefined);
      },

      reduce(p, ms) {
        finishAll();
        markCell(p.cell);
        caption.textContent =
          p.cell >= 0
            ? t('caption.reduceByRule', 'Next {tok}: reduce {rule}, value {v} · cell set by precedence', { tok: p.look, rule: p.rule, v: p.value })
            : t('caption.reduce', 'Next {tok}: reduce {rule}, value {v}', { tok: p.look, rule: p.rule, v: p.value });
        if (p.pop > stackCells.length) throw new Error('lr-precedence 무대: 접을 칸이 스택보다 많다');
        const popped = stackCells.splice(stackCells.length - p.pop, p.pop);
        const height = p.stack.length;
        const target = slotY(height - 1);
        const merged = makeStackCell(p.stack[height - 1] as string, STACK_X, target);
        merged.g.setAttribute('opacity', '0');
        stackCells.push(merged);
        if (stackCells.length !== height) throw new Error('lr-precedence 무대: 스택 칸 수가 payload 와 다르다');
        stackLabel.textContent = t('label.stack', 'Stack: {n}', { n: height });

        // 나무 마디 — 가지가 묶인다
        const nx = stripX(p.node.x);
        const ny = nodeY(p.node.level);
        const g = el('g', {}, nodeLayer);
        const circle = el('circle', { r: NODE_R, cx: 0, cy: 0, fill: c.itemDefault, stroke: c.text, 'stroke-width': 1.5 }, g);
        text(g, 0, 0, p.node.label, { mono: true, anchor: 'middle', weight: 'bold' });
        if (p.node.kids.length > 0) text(g, NODE_R + 4, 0, `= ${p.node.value}`, { size: sm, color: c.textMuted });
        const edges = p.node.kids.map((kid) => {
          const kn = nodes.get(kid);
          if (kn === undefined) throw new Error(`lr-precedence 무대: 없는 마디 ${kid}`);
          const line = el('line', { x1: nx, y1: ny, x2: kn.x, y2: kn.y, stroke: c.text, 'stroke-width': 1.5 }, edgeLayer);
          return { line, kid };
        });
        const node: TreeNode = { g, circle, x: nx, y: ny, edges };
        nodes.set(p.node.id, node);
        // 잎은 아래에서 솟고, 가지 마디는 두 아이 사이에서 제 층으로 오른다
        const kidNodes = edges.map((e) => nodes.get(e.kid) as TreeNode);
        const sx = nx;
        const sy = kidNodes.length > 0 ? Math.max(...kidNodes.map((kn) => kn.y)) : ny + 24;

        return tween(ms, (k) => {
          popped.forEach((pc) => {
            const s = 1 - 0.5 * k;
            place(pc.g, pc.x, pc.y + (target - pc.y) * k, 1, s);
            pc.g.setAttribute('opacity', String(1 - k));
          });
          merged.g.setAttribute('opacity', String(k));
          const y = sy + (ny - sy) * k;
          place(g, sx, y);
          for (const e of edges) {
            e.line.setAttribute('y1', String(y));
          }
          if (k >= 1) for (const pc of popped) pc.g.remove();
        });
      },

      accept(p, ms) {
        finishAll();
        markCell(-1);
        const rootNode = nodes.get(p.root);
        if (rootNode === undefined) throw new Error(`lr-precedence 무대: 없는 뿌리 ${p.root}`);
        caption.textContent = t('caption.accept', 'Next {tok}: accept · {tree} = {v}', { tok: p.look, tree: p.tree, v: p.value });
        result.textContent = readValue(String(p.value));
        cursor.setAttribute('opacity', '0');
        // 뿌리가 한 번 부풀었다 돌아온다
        return tween(ms, (k) => {
          const s = 1 + 0.35 * Math.sin(Math.PI * k);
          rootNode.circle.setAttribute('r', String(NODE_R * s));
          rootNode.circle.setAttribute('stroke-width', String(1.5 + 1.5 * k));
        });
      },

      destroy() {
        // 걸린 운동을 끝으로 밀어 기다리던 쪽을 풀고 떼어 낸다
        finishAll();
        root.remove();
      },
    };
    return inst;
  },
};
