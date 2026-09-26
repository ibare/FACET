/**
 * dirty-read 무대 — 값이 새어 나가 남는 것을 그린다.
 *
 * 가운데가 표, 왼쪽이 쓰는 트랜잭션, 오른쪽이 읽는 트랜잭션이다. 줄마다 한 가로선에 서서
 * 값이 그 선을 따라 흐른다 — 쓴 값이 왼쪽에서 표로 들어와 확정값 곁에 얹히고, 읽기가 그 복제를
 * 오른쪽 손으로 가져가고, 되돌림이 표의 것만 왼쪽으로 거둬 간다. 오른쪽 손의 것은 남는다.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { DirtyReadScene, DoneOp, HeldValue, SceneRow, SceneTxn } from './scene.js';

const H = 270;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 운동 한 번의 길이 */
const MOVE_MS = 500;
const FRAME_MS = 16;

const PX_XS = parseFloat(fontSizes.xs);
const PX_SM = parseFloat(fontSizes.sm);
const PX_MD = parseFloat(fontSizes.md);
const PX_LG = parseFloat(fontSizes.lg);

/** 캔버스 폭에서 역산한 자리. 상수는 상한 · 여백만 쥔다 */
type Layout = {
  cols: [number, number, number]; // 왼쪽 끝 x — 쓰는 이 · 표 · 읽는 이
  colW: number;
  rowsTop: number;
  rowH: number;
  rowY: (i: number) => number;
  nameX: number;
  pendingX: number;
  cellX: number;
  chipW: number;
  chipH: number;
  historyTop: number;
  logTop: number;
  logGap: number;
  frameBottom: number;
  captionTop: number;
};

function layoutFor(rowCount: number): Layout {
  const margin = 14;
  const gap = Math.min(40, PIECE_CANVAS_W * 0.05);
  const colW = (PIECE_CANVAS_W - margin * 2 - gap * 2) / 3;
  const cols: [number, number, number] = [margin, margin + colW + gap, margin + (colW + gap) * 2];
  const rowsTop = 86;
  const captionTop = H - 40;
  const logGap = 18;
  // 줄이 늘면 줄 높이를 줄여 담는다 — 세로는 바뀌지 않는다
  const room = captionTop - 20 - rowsTop - 20 - logGap * 3;
  const rowH = Math.min(52, room / Math.max(1, rowCount));
  const chipW = Math.min(48, colW * 0.28);
  const chipH = Math.min(30, rowH * 0.62);
  const tableX = cols[1];
  return {
    cols,
    colW,
    rowsTop,
    rowH,
    rowY: (i) => rowsTop + rowH * i + rowH / 2,
    nameX: tableX + 14,
    pendingX: tableX + colW * 0.45,
    cellX: tableX + colW - chipW / 2 - 12,
    chipW,
    chipH,
    historyTop: rowsTop + rowH * rowCount + 14,
    logTop: rowsTop + rowH * rowCount + 44,
    logGap,
    frameBottom: captionTop - 14,
    captionTop,
  };
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  o: { px: number; fill: string; anchor?: string; mono?: boolean; weight?: number },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-size': o.px,
    'font-family': o.mono ? fonts.mono : fonts.body,
    fill: o.fill,
    'text-anchor': o.anchor ?? 'middle',
    'dominant-baseline': 'middle',
  });
  if (o.weight) node.setAttribute('font-weight', String(o.weight));
  node.textContent = content;
  return node;
}

/** 트랜잭션 이름의 번호 — 연산 표기의 아래 숫자 (`T1` → 1) */
function txnNumber(name: string): string {
  const m = /^T(\d+)$/.exec(name);
  if (!m || !m[1]) throw new Error(`dirty-read 무대: 연산 표기를 쓸 수 없는 트랜잭션 이름 ${name}`);
  return m[1];
}

function notation(txn: string, op: DoneOp): string {
  const n = txnNumber(txn);
  switch (op.op) {
    case 'W':
      return `W${n}(${op.row}=${op.value})`;
    case 'R':
      return `R${n}(${op.row})`;
    case 'A':
      return `A${n}`;
    case 'C':
      return `C${n}`;
    default: {
      const unknown: never = op;
      throw new Error(`dirty-read 무대: 모르는 연산 ${JSON.stringify(unknown)}`);
    }
  }
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자권)는 한 칸, 나머지는 반 칸 남짓 */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? px : px * 0.56;
  return w;
}

function wrap(s: string, px: number, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(next, px) > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

type Ctx = { c: Palette; t: Translate; L: Layout };

function rowIndex(scene: DirtyReadScene, row: string): number {
  const i = scene.rows.findIndex((r) => r.name === row);
  if (i < 0) throw new Error(`dirty-read 무대: 없는 줄 ${row}`);
  return i;
}

function txnOf(scene: DirtyReadScene, name: string): SceneTxn {
  const x = scene.txns.find((y) => y.name === name);
  if (!x) throw new Error(`dirty-read 무대: 없는 트랜잭션 ${name}`);
  return x;
}

function rowOf(scene: DirtyReadScene, name: string): SceneRow {
  const r = scene.rows.find((y) => y.name === name);
  if (!r) throw new Error(`dirty-read 무대: 없는 줄 ${name}`);
  return r;
}

/** 트랜잭션이 선 기둥의 왼쪽 끝 — 첫째는 왼쪽, 둘째는 오른쪽 */
function txnColX(scene: DirtyReadScene, name: string, L: Layout): number {
  const i = scene.txns.findIndex((x) => x.name === name);
  if (i === 0) return L.cols[0];
  if (i === 1) return L.cols[2];
  throw new Error(`dirty-read 무대: 트랜잭션 ${name} 의 자리가 없다 (이 그림은 트랜잭션 둘을 그린다)`);
}

type ChipStyle = { stroke: string; text: string; fill: string; dashed: boolean; width: number };

function chip(parent: Element, x: number, y: number, value: number, s: ChipStyle, L: Layout): SVGGElement {
  const g = el(parent, 'g', {});
  el(g, 'rect', {
    x: x - L.chipW / 2,
    y: y - L.chipH / 2,
    width: L.chipW,
    height: L.chipH,
    rx: 6,
    fill: s.fill,
    stroke: s.stroke,
    'stroke-width': s.width,
    ...(s.dashed ? { 'stroke-dasharray': '4 3' } : {}),
  });
  label(g, x, y + 1, String(value), { px: PX_LG, fill: s.text, mono: true, weight: 600 });
  return g;
}

function pendingStyle(c: Palette): ChipStyle {
  return { stroke: c.itemActive, text: c.itemActive, fill: c.bg, dashed: true, width: 2 };
}

function heldStyle(scene: DirtyReadScene, h: HeldValue, c: Palette): ChipStyle {
  if (h.source === null) return { stroke: c.border, text: c.text, fill: c.bg, dashed: false, width: 1.5 };
  const src = txnOf(scene, h.source);
  if (src.status === 'aborted') return { stroke: c.danger, text: c.danger, fill: c.bg, dashed: false, width: 2.5 };
  if (src.status === 'committed') return { stroke: c.border, text: c.text, fill: c.bg, dashed: false, width: 1.5 };
  return pendingStyle(c);
}

function statusText(x: SceneTxn, t: Translate): string {
  switch (x.status) {
    case 'idle':
      return t('label.status.idle', 'not started');
    case 'active':
      return t('label.status.active', 'in progress');
    case 'aborted':
      return t('label.status.aborted', 'aborted');
    case 'committed':
      return t('label.status.committed', 'committed');
    default: {
      const unknown: never = x.status;
      throw new Error(`dirty-read 무대: 모르는 상태 ${String(unknown)}`);
    }
  }
}

function statusColor(x: SceneTxn, c: Palette): string {
  if (x.status === 'aborted') return c.danger;
  if (x.status === 'committed') return c.success;
  if (x.status === 'active') return c.itemActive;
  return c.textMuted;
}

/** 이 걸음이 말하는 것 — 셈한 값으로만 */
function caption(scene: DirtyReadScene, t: Translate): string {
  const s = scene.step;
  if (s.kind === 'start') {
    const r = scene.rows[0];
    if (!r) throw new Error('dirty-read 무대: 줄이 없다');
    return t('caption.start', 'Committed value of {row}: {value}.', { row: r.name, value: r.committed });
  }
  if (s.kind === 'write') {
    return t('caption.write', '{txn} writes {row} = {value}. Not committed yet. Committed value: {committed}.', {
      txn: s.txn,
      row: s.row,
      value: s.value,
      committed: rowOf(scene, s.row).committed,
    });
  }
  if (s.kind === 'read') {
    if (s.source !== null) {
      return t('caption.readDirty', '{txn} reads {row}: {value}. Written by {source}, not committed yet.', {
        txn: s.txn,
        row: s.row,
        value: s.value,
        source: s.source,
      });
    }
    return t('caption.readClean', '{txn} reads {row}: {value}. A committed value.', {
      txn: s.txn,
      row: s.row,
      value: s.value,
    });
  }
  if (s.kind === 'abort') {
    const d = s.discarded[0];
    if (!d) return t('caption.abortNone', '{txn} aborts. Nothing to throw away.', { txn: s.txn });
    const committed = rowOf(scene, d.row).committed;
    for (const x of scene.txns) {
      const h = x.held.find((v) => v.source === s.txn && v.row === d.row);
      if (h) {
        return t(
          'caption.abortHeld',
          '{txn} aborts and its write is thrown away. Committed value of {row}: {committed}. Still in the hand of {reader}: {held}.',
          { txn: s.txn, row: d.row, committed, reader: x.name, held: h.value },
        );
      }
    }
    return t('caption.abort', '{txn} aborts and its write is thrown away. Committed value of {row}: {committed}.', {
      txn: s.txn,
      row: d.row,
      committed,
    });
  }
  const x = txnOf(scene, s.txn);
  const h = x.held[0];
  if (!h) return t('caption.commit', '{txn} commits.', { txn: s.txn });
  return t('caption.commitHeld', '{txn} commits. Value it read: {held}. Committed value of {row}: {committed}.', {
    txn: s.txn,
    held: h.value,
    row: h.row,
    committed: rowOf(scene, h.row).committed,
  });
}

/** 끝난 읽는 이의 손에 든 값과 표의 확정값이 다른 곳 — 그 둘을 잇는다 */
function mismatches(scene: DirtyReadScene): { txn: SceneTxn; h: HeldValue; row: number }[] {
  const out: { txn: SceneTxn; h: HeldValue; row: number }[] = [];
  for (const x of scene.txns) {
    if (x.status !== 'committed') continue;
    for (const h of x.held) {
      if (h.value !== rowOf(scene, h.row).committed) out.push({ txn: x, h, row: rowIndex(scene, h.row) });
    }
  }
  return out;
}

function heldX(scene: DirtyReadScene, txn: string, L: Layout): number {
  return txnColX(scene, txn, L) + L.colW / 2;
}

/** 이음선의 두 끝 — 손의 값 왼쪽 가장자리에서 표의 확정값 오른쪽 가장자리로 */
function linkEnds(scene: DirtyReadScene, txn: string, row: number, L: Layout) {
  const y = L.rowY(row);
  const from = heldX(scene, txn, L) - L.chipW / 2 - 4;
  const to = L.cellX + L.chipW / 2 + 4;
  return { y, from, to };
}

type Refs = {
  pending: Map<string, SVGGElement>; // `${row}|${txn}`
  held: Map<string, SVGGElement>; // `${txn}|${row}|${순번}`
  cells: Map<string, SVGGElement>;
  links: { line: SVGLineElement; mark: SVGTextElement; from: number; to: number; y: number; txn: string }[];
  overlay: SVGGElement;
};

function drawStatic(svg: SVGSVGElement, scene: DirtyReadScene, k: Ctx): Refs {
  const { c, t, L } = k;
  svg.textContent = '';
  const refs: Refs = { pending: new Map(), held: new Map(), cells: new Map(), links: [], overlay: el(svg, 'g', {}) };
  svg.removeChild(refs.overlay);

  // 기둥 셋
  el(svg, 'rect', {
    x: L.cols[1],
    y: 6,
    width: L.colW,
    height: L.frameBottom - 6,
    rx: 10,
    fill: c.bgSubtle,
    stroke: c.border,
  });
  label(svg, L.cols[1] + L.colW / 2, 26, t('label.table', 'Table'), { px: PX_MD, fill: c.text, weight: 600 });
  label(svg, L.pendingX, L.rowsTop - 24, t('label.pending', 'uncommitted'), { px: PX_XS, fill: c.itemActive });
  label(svg, L.cellX, L.rowsTop - 10, t('label.committed', 'committed'), { px: PX_XS, fill: c.textMuted });

  for (const x of scene.txns) {
    const x0 = txnColX(scene, x.name, L);
    const cx = x0 + L.colW / 2;
    el(svg, 'rect', {
      x: x0,
      y: 6,
      width: L.colW,
      height: L.frameBottom - 6,
      rx: 10,
      fill: 'none',
      stroke: c.border,
    });
    label(svg, cx, 26, x.name, { px: PX_LG, fill: c.text, weight: 700, mono: true });
    label(svg, cx, 44, statusText(x, t), { px: PX_SM, fill: statusColor(x, c), weight: 600 });
    if (x.level !== null) {
      label(svg, cx, 60, x.level, { px: PX_XS, fill: c.textMuted, mono: true });
      label(svg, cx, L.rowsTop - 10, t('label.held', 'value read'), { px: PX_XS, fill: c.textMuted });
    }
    // 이 트랜잭션이 한 연산 — 이번 걸음의 것은 굵게
    const current = scene.step.kind !== 'start' && scene.step.txn === x.name;
    x.ops.forEach((op, i) => {
      const last = i === x.ops.length - 1;
      label(svg, cx, L.logTop + L.logGap * i, notation(x.name, op), {
        px: PX_MD,
        fill: current && last ? c.text : c.textMuted,
        mono: true,
        weight: current && last ? 700 : 400,
      });
    });
    // 손에 쥔 값 — 줄의 가로선 위에
    const count = new Map<string, number>();
    for (const h of x.held) {
      const n = count.get(h.row) ?? 0;
      count.set(h.row, n + 1);
      const g = chip(svg, cx, L.rowY(rowIndex(scene, h.row)), h.value, heldStyle(scene, h, c), L);
      refs.held.set(`${x.name}|${h.row}|${n}`, g);
    }
  }

  // 표의 줄
  scene.rows.forEach((r, i) => {
    const y = L.rowY(i);
    el(svg, 'rect', {
      x: L.cols[1] + 6,
      y: y - L.rowH * 0.42,
      width: L.colW - 12,
      height: L.rowH * 0.84,
      rx: 6,
      fill: c.bg,
      stroke: c.border,
    });
    label(svg, L.nameX, y + 1, r.name, { px: PX_MD, fill: c.text, anchor: 'start', mono: true, weight: 600 });
    const covered = scene.pending.some((w) => w.row === r.name);
    const cell = chip(
      svg,
      L.cellX,
      y,
      r.committed,
      { stroke: c.text, text: c.text, fill: c.bgSubtle, dashed: false, width: 1.5 },
      L,
    );
    if (covered) cell.setAttribute('opacity', '0.4');
    refs.cells.set(r.name, cell);
    for (const w of scene.pending) {
      if (w.row !== r.name) continue;
      refs.pending.set(`${w.row}|${w.txn}`, chip(svg, L.pendingX, y, w.value, pendingStyle(c), L));
    }
    label(
      svg,
      L.cols[1] + L.colW / 2,
      L.historyTop + i * PX_XS * 1.4,
      t('label.history', 'Committed so far for {row}: {values}', { row: r.name, values: r.history.join(', ') }),
      { px: PX_XS, fill: c.textMuted },
    );
  });

  // 끝난 읽는 이의 값과 확정값이 어긋난 곳을 잇는다
  for (const m of mismatches(scene)) {
    const e = linkEnds(scene, m.txn.name, m.row, L);
    const color = m.h.source !== null && txnOf(scene, m.h.source).status === 'aborted' ? c.danger : c.textMuted;
    const line = el(svg, 'line', { x1: e.from, y1: e.y, x2: e.to, y2: e.y, stroke: color, 'stroke-width': 2 });
    const mark = label(svg, (L.cols[1] + L.colW + L.cols[2]) / 2, e.y - 14, '≠', { px: PX_LG, fill: color, weight: 700 });
    refs.links.push({ line, mark, from: e.from, to: e.to, y: e.y, txn: m.txn.name });
  }

  // 캡션
  const lines = wrap(caption(scene, t), PX_SM, PIECE_CANVAS_W - 40).slice(0, 3);
  lines.forEach((ln, i) => {
    label(svg, PIECE_CANVAS_W / 2, L.captionTop + i * PX_SM * 1.5 + (lines.length === 1 ? 8 : 0), ln, {
      px: PX_SM,
      fill: c.text,
    });
  });

  svg.appendChild(refs.overlay);
  return refs;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const dirtyReadStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function ctxFor(scene: DirtyReadScene): Ctx {
      return { c, t, L: layoutFor(scene.rows.length) };
    }

    /** 한 시계 — 프레임마다 p(0→1) 을 넘긴다. 세대가 바뀌거나 거두면 곧바로 푼다 */
    function run(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = () => {
          if (destroyed || mine !== gen) return done();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        tick();
      });
    }

    async function render(next: DirtyReadScene, _prev: DirtyReadScene | null, opts: { animate: boolean }) {
      const mine = (gen += 1);
      if (destroyed) return;
      const k = ctxFor(next);
      const { L } = k;
      const refs = drawStatic(svg, next, k);
      if (!opts.animate) return;
      const s = next.step;

      if (s.kind === 'write') {
        // 쓴 값이 쓰는 이의 기둥에서 표의 줄로 들어온다
        const g = refs.pending.get(`${s.row}|${s.txn}`);
        if (!g) throw new Error(`dirty-read 무대: 쓴 값 ${s.row}|${s.txn} 의 그림이 없다`);
        const dx = txnColX(next, s.txn, L) + L.colW / 2 - L.pendingX;
        await run(mine, MOVE_MS, (p) => g.setAttribute('transform', `translate(${round(dx * (1 - p))},0)`));
      } else if (s.kind === 'read') {
        // 복제가 표에서 읽는 이의 손으로 새어 나간다 — 표의 것은 그대로 남는다
        const x = txnOf(next, s.txn);
        const n = x.held.filter((h) => h.row === s.row).length - 1;
        const g = refs.held.get(`${s.txn}|${s.row}|${n}`);
        if (!g) throw new Error(`dirty-read 무대: 읽은 값 ${s.txn}|${s.row} 의 그림이 없다`);
        const fromX = s.source !== null ? L.pendingX : L.cellX;
        const dx = fromX - heldX(next, s.txn, L);
        await run(mine, MOVE_MS, (p) => g.setAttribute('transform', `translate(${round(dx * (1 - p))},0)`));
      } else if (s.kind === 'abort') {
        // 버린 쓰기는 표에서 쓰는 이에게로 거둬져 사라진다. 읽는 이의 손은 건드리지 않는다
        const backX = txnColX(next, s.txn, L) + L.colW / 2;
        const ghosts = s.discarded.map((d) => {
          const y = L.rowY(rowIndex(next, d.row));
          const g = chip(refs.overlay, 0, 0, d.value, pendingStyle(k.c), L);
          return { g, y };
        });
        const cells = s.discarded.map((d) => refs.cells.get(d.row));
        await run(mine, MOVE_MS, (p) => {
          const x = L.pendingX + (backX - L.pendingX) * p;
          const scale = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
          for (const gh of ghosts) {
            gh.g.setAttribute('transform', `translate(${round(x)},${round(gh.y)}) scale(${round(Math.max(0, scale))})`);
          }
          for (const cell of cells) cell?.setAttribute('opacity', String(round(0.4 + 0.6 * p)));
        });
      } else if (s.kind === 'commit') {
        // 커밋한 뒤 손에 남은 값과 표의 확정값 사이에 선이 그어진다
        const mine2 = refs.links.filter((l) => l.txn === s.txn);
        if (mine2.length > 0) {
          await run(mine, MOVE_MS, (p) => {
            for (const l of mine2) {
              l.line.setAttribute('x2', String(round(l.from + (l.to - l.from) * p)));
              l.mark.setAttribute('opacity', String(round(p)));
            }
          });
        }
      }
      if (destroyed || mine !== gen) return;
      drawStatic(svg, next, k);
    }

    return {
      render,
      destroy() {
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
