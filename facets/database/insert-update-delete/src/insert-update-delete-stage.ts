/**
 * insert-update-delete 의 무대.
 *
 * 위에는 문 셋, 아래에는 표. 문마다 표에 일어나는 일이 다르게 움직인다.
 *  - INSERT  새 줄이 문에서 내려와 표 끝에 들어온다
 *  - 판정    훑는 선이 표를 위에서 아래로 지나며 모든 줄에 WHERE 를 따진다
 *  - UPDATE  줄은 제자리, 걸린 줄의 칸 값만 한꺼번에 갈린다 (옛 값은 그어져 곁에 남는다)
 *  - DELETE  걸린 줄이 한꺼번에 표 밖(오른쪽)으로 빠지고, 남은 줄이 틈을 메운다
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type {
  InsertUpdateDeleteScene,
  SceneRow,
  SceneStep,
} from './scene.js';

const H = 400;
const W = PIECE_CANVAS_W;
const PAD = 24;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MONO_PX = parseFloat(fontSizes.sm);
const MONO_CHAR = MONO_PX * 0.6;
const BODY_PX = parseFloat(fontSizes.md);

/** 운동 길이 (ms) — 걸음 하나의 벽시계는 이것 + stepMs. */
const INSERT_MS = 650;
const JUDGE_MS = 750;
const UPDATE_MS = 650;
const DELETE_MS = 850;

// ─── 자리 셈 ───────────────────────────────────────────────

const SQL_TOP = 30;
const SQL_LINE = 24;
const MAX_ROW_H = 34;
const CAPTION_LINE = 20;

type Layout = {
  sqlY: (i: number) => number;
  nameY: number;
  headerY: number;
  rowsTop: number;
  rowH: number;
  rowY: (i: number) => number;
  tableX: number;
  tableW: number;
  colW: number;
  judgeX: number;
  ghostDx: number;
  captionTop: number;
};

function layoutOf(scene: InsertUpdateDeleteScene): Layout {
  const sqlY = (i: number): number => SQL_TOP + i * SQL_LINE;
  const nameY = sqlY(scene.sql.length - 1) + 44;
  const headerY = nameY + 26;
  const rowsTop = headerY + 12;
  const captionTop = H - 3 * CAPTION_LINE + 8;
  const room = captionTop - 22 - rowsTop;
  const rowH = Math.min(MAX_ROW_H, room / Math.max(1, scene.capacity));
  const tableX = PAD;
  const tableW = Math.round(W * 0.44);
  const colW = tableW / Math.max(1, scene.columns.length);
  const ghostDx = W - PAD - tableW - tableX;
  return {
    sqlY,
    nameY,
    headerY,
    rowsTop,
    rowH,
    rowY: (i) => rowsTop + i * rowH,
    tableX,
    tableW,
    colW,
    judgeX: tableX + tableW + 36,
    ghostDx,
    captionTop,
  };
}

/** -0 과 부동소수 끝자리를 걷는다. */
function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 한 시계의 한 구간을 0..1 로 편다. */
function phase(p: number, from: number, to: number): number {
  if (p <= from) return 0;
  if (p >= to) return 1;
  return ease((p - from) / (to - from));
}

/** 캡션 줄 나눔 — 글자 폭을 어림한다 (넓은 글자는 한 칸, 나머지는 반 칸 남짓). */
function wrapCaption(text: string, maxW: number, px: number): string[] {
  const widthOf = (s: string): number => {
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 ? px : px * 0.56;
    return w;
  };
  const lines: string[] = [];
  let line = '';
  const push = (piece: string): void => {
    if (widthOf(line + piece) <= maxW || line === '') {
      line += piece;
      return;
    }
    lines.push(line.trimEnd());
    line = piece.trimStart();
  };
  for (const word of text.split(/(?<= )/)) {
    if (widthOf(word) <= maxW) {
      push(word);
      continue;
    }
    for (const ch of word) push(ch);
  }
  if (line.trim() !== '') lines.push(line.trimEnd());
  return lines;
}

function cellText(v: string | number): string {
  return typeof v === 'number' ? String(v) : v;
}

// ─── 그림 ─────────────────────────────────────────────────

type Handles = {
  rows: Map<number, SVGGElement>;
  ghosts: Map<number, SVGGElement>;
  verdicts: Map<number, SVGGElement>;
  /** 판정 걸음에서 걸린 줄의 테두리와 물들임 — 훑는 선이 지나기 전엔 감춘다. */
  hitMarks: Map<number, { frame: SVGRectElement; tint: SVGRectElement }>;
  changed: Map<number, { fresh: SVGTextElement; old: SVGTextElement; strike: SVGLineElement; shift: number }>;
  layer: SVGGElement;
};

export const insertUpdateDeleteStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      o: { mono?: boolean; px?: number; fill?: string; anchor?: string; weight?: number },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r(x),
          y: r(y),
          'font-family': o.mono === false ? fonts.body : fonts.mono,
          'font-size': o.px ?? MONO_PX,
          fill: o.fill ?? c.text,
          'text-anchor': o.anchor ?? 'start',
          'font-weight': o.weight ?? 400,
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    /** 걸림 표시 — 글자가 아니라 획으로 (✓ 은 걸림, ✗ 는 안 걸림). */
    function verdictMark(parent: Element, cx: number, cy: number, hit: boolean): void {
      const s = 5;
      if (hit) {
        el(
          'polyline',
          {
            points: `${r(cx - s)},${r(cy)} ${r(cx - 1)},${r(cy + s - 1)} ${r(cx + s + 1)},${r(cy - s)}`,
            fill: 'none',
            stroke: c.itemComparing,
            'stroke-width': 2.2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          },
          parent,
        );
        return;
      }
      for (const [dx1, dy1, dx2, dy2] of [
        [-s + 1, -s + 1, s - 1, s - 1],
        [-s + 1, s - 1, s - 1, -s + 1],
      ] as const) {
        el(
          'line',
          {
            x1: r(cx + dx1),
            y1: r(cy + dy1),
            x2: r(cx + dx2),
            y2: r(cy + dy2),
            stroke: c.textMuted,
            'stroke-width': 1.6,
            'stroke-linecap': 'round',
          },
          parent,
        );
      }
    }

    function drawRow(
      parent: Element,
      scene: InsertUpdateDeleteScene,
      L: Layout,
      row: SceneRow,
      y: number,
      o: { stroke: string; strokeW: number; tint?: string; dashed?: boolean; muted?: boolean },
    ): SVGGElement {
      const g = el('g', {}, parent);
      const h = L.rowH - 4;
      el(
        'rect',
        {
          x: L.tableX,
          y: r(y),
          width: L.tableW,
          height: r(h),
          rx: 4,
          fill: o.dashed ? 'none' : c.bgSubtle,
          stroke: o.stroke,
          'stroke-width': o.strokeW,
          ...(o.dashed ? { 'stroke-dasharray': '5 4' } : {}),
        },
        g,
      );
      if (o.tint) {
        el(
          'rect',
          { x: L.tableX, y: r(y), width: L.tableW, height: r(h), rx: 4, fill: o.tint, 'fill-opacity': 0.14 },
          g,
        );
      }
      const base = y + h / 2 + MONO_PX * 0.36;
      scene.columns.forEach((_, ci) => {
        const v = row.values[ci];
        if (v === undefined) throw new Error(`insert-update-delete 무대: 줄 ${row.key} 에 ${ci} 번 칸이 없다`);
        const numeric = typeof v === 'number';
        const x = numeric ? L.tableX + (ci + 1) * L.colW - 12 : L.tableX + ci * L.colW + 12;
        label(g, x, base, cellText(v), {
          anchor: numeric ? 'end' : 'start',
          fill: o.muted ? c.textMuted : c.text,
        });
      });
      return g;
    }

    function drawStatic(scene: InsertUpdateDeleteScene): Handles {
      svg.textContent = '';
      const L = layoutOf(scene);
      const step: SceneStep = scene.step;
      const current = step.kind === 'start' ? -1 : step.stmt;
      const layer = el('g', {}, svg);

      // 문 셋
      scene.sql.forEach((sql, i) => {
        const y = L.sqlY(i);
        const isNow = i === current;
        if (isNow) {
          el('rect', { x: PAD, y: r(y - 13), width: 4, height: 18, rx: 2, fill: c.primary }, layer);
        }
        label(layer, PAD + 14, y, sql, {
          fill: i < current ? c.textMuted : c.text,
          weight: isNow ? 600 : 400,
        });
        const n = scene.affected[i];
        if (n !== null && n !== undefined) {
          label(layer, W - PAD, y, t('label.affected', 'Affected rows: {n}', { n }), {
            mono: false,
            anchor: 'end',
            fill: isNow ? c.text : c.textMuted,
            weight: isNow ? 600 : 400,
          });
        }
      });

      // 표 머리
      label(layer, L.tableX, L.nameY, scene.table, { weight: 700, px: BODY_PX });
      label(layer, L.tableX + L.tableW, L.nameY, t('label.rows', 'Rows: {n}', { n: scene.rows.length }), {
        mono: false,
        anchor: 'end',
        fill: c.textMuted,
      });
      const sample = scene.rows[0]?.values ?? [];
      scene.columns.forEach((col, ci) => {
        const numeric = typeof sample[ci] === 'number';
        const x = numeric ? L.tableX + (ci + 1) * L.colW - 12 : L.tableX + ci * L.colW + 12;
        label(layer, x, L.headerY, col, { anchor: numeric ? 'end' : 'start', fill: c.textMuted });
      });
      el(
        'line',
        {
          x1: L.tableX,
          y1: r(L.headerY + 7),
          x2: L.tableX + L.tableW,
          y2: r(L.headerY + 7),
          stroke: c.border,
          'stroke-width': 1,
        },
        layer,
      );

      // 이번 걸음이 가리키는 줄
      const hitKeys = new Set<number>();
      if (step.kind === 'judge') for (const ch of step.checks) if (ch.hit) hitKeys.add(ch.key);
      if (step.kind === 'update') for (const ch of step.changes) hitKeys.add(ch.key);
      const insertedKey = step.kind === 'insert' ? step.key : null;

      const handles: Handles = {
        rows: new Map(),
        ghosts: new Map(),
        verdicts: new Map(),
        hitMarks: new Map(),
        changed: new Map(),
        layer,
      };

      scene.rows.forEach((row, i) => {
        const y = L.rowY(i);
        const isNew = row.key === insertedKey;
        const isHit = hitKeys.has(row.key);
        const g = drawRow(layer, scene, L, row, y, {
          stroke: isNew ? c.itemActive : isHit ? c.itemComparing : c.border,
          strokeW: isNew || isHit ? 2 : 1,
          ...(isHit ? { tint: c.itemComparing } : {}),
        });
        handles.rows.set(row.key, g);
        if (isHit && step.kind === 'judge') {
          const [frame, tint] = g.querySelectorAll('rect');
          if (frame && tint) handles.hitMarks.set(row.key, { frame, tint });
        }
      });

      // WHERE 판정 — 표 곁의 한 열
      if (step.kind === 'judge') {
        const where = scene.wheres[step.stmt];
        if (!where) throw new Error(`insert-update-delete 무대: 문 ${step.stmt} 에 WHERE 가 없다`);
        label(layer, L.judgeX, L.headerY, `WHERE ${where.column} ${where.op} ${where.value}`, {
          fill: c.text,
          weight: 600,
        });
        for (const ch of step.checks) {
          const idx = scene.rows.findIndex((row) => row.key === ch.key);
          if (idx < 0) throw new Error(`insert-update-delete 무대: 판정한 줄 ${ch.key} 가 표에 없다`);
          const cy = L.rowY(idx) + (L.rowH - 4) / 2;
          const g = el('g', {}, layer);
          verdictMark(g, L.judgeX + 6, cy, ch.hit);
          label(g, L.judgeX + 22, cy + MONO_PX * 0.36, `${ch.value} ${where.op} ${where.value}`, {
            fill: ch.hit ? c.itemComparing : c.textMuted,
            weight: ch.hit ? 700 : 400,
          });
          handles.verdicts.set(ch.key, g);
        }
      }

      // UPDATE — 바뀐 칸: 새 값을 세우고 옛 값은 그어 곁에 둔다
      if (step.kind === 'update') {
        for (const ch of step.changes) {
          const idx = scene.rows.findIndex((row) => row.key === ch.key);
          const g = handles.rows.get(ch.key);
          if (idx < 0 || !g) throw new Error(`insert-update-delete 무대: 바뀐 줄 ${ch.key} 가 표에 없다`);
          const base = L.rowY(idx) + (L.rowH - 4) / 2 + MONO_PX * 0.36;
          const right = L.tableX + (step.column + 1) * L.colW - 12;
          // 칸의 글자는 drawRow 가 이미 새 값으로 적었다 — 그것을 새 값으로 강조한다
          const texts = g.querySelectorAll('text');
          const fresh = texts[step.column];
          if (!fresh) throw new Error(`insert-update-delete 무대: 줄 ${ch.key} 의 칸 글자가 없다`);
          fresh.setAttribute('fill', c.itemActive);
          fresh.setAttribute('font-weight', '700');
          const freshW = String(ch.after).length * MONO_CHAR;
          const oldEnd = right - freshW - 8;
          const oldText = String(ch.before);
          const old = label(g, oldEnd, base, oldText, { anchor: 'end', fill: c.textMuted });
          const oldW = oldText.length * MONO_CHAR;
          const strike = el(
            'line',
            {
              x1: r(oldEnd - oldW - 1),
              y1: r(base - MONO_PX * 0.32),
              x2: r(oldEnd + 1),
              y2: r(base - MONO_PX * 0.32),
              stroke: c.textMuted,
              'stroke-width': 1.2,
            },
            g,
          );
          handles.changed.set(ch.key, { fresh, old, strike, shift: right - oldEnd });
        }
      }

      // DELETE — 빠진 줄은 표 밖 오른쪽에 흐리게 남는다
      if (step.kind === 'delete') {
        for (const gone of step.removed) {
          const outer = el('g', { transform: `translate(${r(L.ghostDx)}, 0)`, opacity: 0.55 }, layer);
          drawRow(outer, scene, L, { key: gone.key, values: gone.values }, L.rowY(gone.index), {
            stroke: c.danger,
            strokeW: 1.5,
            dashed: true,
            muted: true,
          });
          handles.ghosts.set(gone.key, outer);
        }
      }

      // 캡션 — 지금 일어나는 일만
      const text = captionOf(scene);
      wrapCaption(text, W - 2 * PAD, BODY_PX).forEach((line, i) => {
        label(layer, PAD, L.captionTop + i * CAPTION_LINE, line, { mono: false, px: BODY_PX });
      });

      return handles;
    }

    function captionOf(scene: InsertUpdateDeleteScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        return t('caption.start', 'The statements run one at a time, from the top, each to the end.');
      }
      // 판정 걸음에는 아직 영향받은 줄 수가 없다 — 문이 끝난 걸음에서만 읽고, 없으면 던진다
      const affectedOf = (stmt: number): number => {
        const a = scene.affected[stmt];
        if (a === null || a === undefined) {
          throw new Error(`insert-update-delete 무대: 문 ${stmt} 의 영향받은 줄 수가 없다`);
        }
        return a;
      };
      if (step.kind === 'insert') {
        const n = affectedOf(step.stmt);
        return t('caption.insert', 'INSERT: a new row comes into the table, at the end. Affected rows: {n}.', { n });
      }
      if (step.kind === 'judge') {
        return t('caption.judge', 'Before anything changes, WHERE is checked on every row. Matching rows: {hit} / {total}.', {
          hit: step.matched,
          total: step.checks.length,
        });
      }
      if (step.kind === 'update') {
        const col = scene.columns[step.column];
        if (col === undefined) throw new Error(`insert-update-delete 무대: 없는 열 ${step.column}`);
        const n = affectedOf(step.stmt);
        return t(
          'caption.update',
          'UPDATE: the rows stay where they are; only the {col} cells of the matching rows change, all at once. Affected rows: {n}.',
          { col, n },
        );
      }
      const n = affectedOf(step.stmt);
      return t('caption.delete', 'DELETE: every matching row leaves the table at once. Affected rows: {n}.', { n });
    }

    // ─── 운동 ──────────────────────────────────────────────

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function moveInsert(scene: InsertUpdateDeleteScene, h: Handles, key: number, stmt: number, mine: number): Promise<void> {
      const L = layoutOf(scene);
      const idx = scene.rows.findIndex((row) => row.key === key);
      const g = h.rows.get(key);
      if (idx < 0 || !g) return;
      // 문 줄에서 출발해 제 자리에 닿는다 — 아직 못 온 만큼만 비켜 둔다
      const dy = L.sqlY(stmt) - 12 - L.rowY(idx);
      const dx = 14;
      await tween(INSERT_MS, mine, (p) => {
        const e = ease(p);
        g.setAttribute('transform', `translate(${r(dx * (1 - e))}, ${r(dy * (1 - e))})`);
        g.setAttribute('opacity', String(r(0.3 + 0.7 * e)));
      });
    }

    async function moveJudge(scene: InsertUpdateDeleteScene, h: Handles, mine: number): Promise<void> {
      const L = layoutOf(scene);
      const n = scene.rows.length;
      const top = L.rowsTop - 2;
      const bottom = L.rowY(n) + 2;
      const scan = el(
        'line',
        { x1: L.tableX - 6, x2: W - PAD, y1: top, y2: top, stroke: c.itemComparing, 'stroke-width': 2 },
        h.layer,
      );
      const pending = new Map<number, () => void>();
      scene.rows.forEach((row, i) => {
        const v = h.verdicts.get(row.key);
        const m = h.hitMarks.get(row.key);
        v?.setAttribute('opacity', '0');
        m?.tint.setAttribute('opacity', '0');
        m?.frame.setAttribute('stroke', c.border);
        m?.frame.setAttribute('stroke-width', '1');
        pending.set(i, () => {
          v?.removeAttribute('opacity');
          m?.tint.removeAttribute('opacity');
          m?.frame.setAttribute('stroke', c.itemComparing);
          m?.frame.setAttribute('stroke-width', '2');
        });
      });
      await tween(JUDGE_MS, mine, (p) => {
        const y = top + (bottom - top) * p;
        scan.setAttribute('y1', String(r(y)));
        scan.setAttribute('y2', String(r(y)));
        for (const [i, reveal] of pending) {
          if (y < L.rowY(i) + L.rowH / 2) continue;
          reveal();
          pending.delete(i);
        }
      });
    }

    async function moveUpdate(h: Handles, mine: number, rowH: number): Promise<void> {
      await tween(UPDATE_MS, mine, (p) => {
        const e = ease(p);
        for (const ch of h.changed.values()) {
          // 옛 값은 칸 제자리에서 곁으로 비켜 나고, 새 값은 아래에서 올라온다
          ch.old.setAttribute('transform', `translate(${r(ch.shift * (1 - e))}, 0)`);
          ch.fresh.setAttribute('transform', `translate(0, ${r(rowH * 0.5 * (1 - e))})`);
          ch.fresh.setAttribute('opacity', String(r(e)));
          ch.strike.setAttribute('opacity', p > 0.85 ? '1' : '0');
        }
      });
    }

    async function moveDelete(
      scene: InsertUpdateDeleteScene,
      h: Handles,
      step: Extract<SceneStep, { kind: 'delete' }>,
      mine: number,
    ): Promise<void> {
      const L = layoutOf(scene);
      // 빠지기 전 표의 차례를 되살려 남은 줄이 어디서 올라오는지 안다
      const before: number[] = scene.rows.map((row) => row.key);
      for (const gone of [...step.removed].sort((a, b) => a.index - b.index)) before.splice(gone.index, 0, gone.key);
      const lift = new Map<number, number>();
      scene.rows.forEach((row, i) => {
        const was = before.indexOf(row.key);
        if (was !== i) lift.set(row.key, (was - i) * L.rowH);
      });
      await tween(DELETE_MS, mine, (p) => {
        const out = phase(p, 0, 0.6);
        for (const g of h.ghosts.values()) {
          g.setAttribute('transform', `translate(${r(L.ghostDx * out)}, 0)`);
          g.setAttribute('opacity', String(r(1 - 0.45 * out)));
        }
        const close = phase(p, 0.5, 1);
        for (const [key, dy] of lift) {
          h.rows.get(key)?.setAttribute('transform', `translate(0, ${r(dy * (1 - close))})`);
        }
      });
    }

    return {
      async render(next: InsertUpdateDeleteScene, _prev: InsertUpdateDeleteScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step.kind === 'insert') await moveInsert(next, h, step.key, step.stmt, mine);
        else if (step.kind === 'judge') await moveJudge(next, h, mine);
        else if (step.kind === 'update') await moveUpdate(h, mine, layoutOf(next).rowH);
        else if (step.kind === 'delete') await moveDelete(next, h, step, mine);
        else return;
        if (mine === gen && !destroyed) drawStatic(next);
      },
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
