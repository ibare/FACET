/**
 * keep-unmatched stage — 남겨지고 채워진다.
 *
 * 왼쪽 표 · 오른쪽 표 · 결과 표가 나란히 서고, 왼쪽 표 아래에 "짝 없음" 받침이 있다.
 *   이어짐   — 짝 있는 줄들의 칸 복사본이 두 표에서 한꺼번에 결과로 날아가 한 줄이 된다
 *   짝 없음  — 짝 없는 왼쪽 줄의 칸이 표에서 떨어져 받침으로 미끄러져 기운다
 *   남음     — 받침의 줄이 결과로 되돌아오고(이어진 줄은 자리를 비켜 왼쪽 표 차례로 선다),
 *              비어 있는 오른쪽 칸이 NULL 로 차오른다
 *
 * 화면 전체는 늘 장면에서 세운다 (`drawStatic`). 운동은 그 끝 자리에 아직 못 온 만큼으로 그린다.
 */
import {
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
import type { KeepUnmatchedScene, SceneTable } from './scene.js';

const H = 420;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 좌우 여백 · 표 사이 최소 틈 · 칸 폭 상한 */
const SIDE = 16;
const GAP_MIN = 44;
const CELL_W_MAX = 76;
/** SQL 첫 줄 바닥선 · 줄 간격 */
const SQL_TOP = 24;
const SQL_LINE = 18;
/** 표 이름 바닥선 · 머리줄 윗변 */
const TITLE_Y = 96;
const HEAD_Y = 106;
/** 표 줄 높이 상한 · 표와 짝 없음 받침 사이 · 받침 머리(이름표) 높이 · 캡션 두 줄의 바닥선 */
const ROW_H_MAX = 26;
const TRAY_GAP = 16;
const TRAY_HEAD = 22;
const TRAY_RESERVE = 2;
const CAPTION_1 = H - 30;
const CAPTION_2 = H - 10;
/** 받침에 떨어진 칸의 기울기 (도) */
const TILT = -6;

const MOVE_MS = 700;
const RETURN_MS = 560;
const FILL_MS = 420;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

type Handles = {
  /** 결과 칸 — `${왼쪽 줄}:${select 칸}` */
  result: Map<string, SVGGElement>;
  /** 받침의 칸 — `${왼쪽 줄}:${select 칸}` */
  tray: Map<string, SVGGElement>;
  /** NULL 칸 — `${왼쪽 줄}:${select 칸}` */
  nulls: Map<string, { rect: SVGRectElement; text: SVGTextElement }>;
};

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function colIndex(table: SceneTable, column: string): number {
  const at = table.columns.indexOf(column);
  if (at < 0) throw new Error(`keep-unmatched: ${table.name} 에 열 ${column} 이 없다`);
  return at;
}

function cellText(table: SceneTable, row: number, column: string): string {
  const r = table.rows[row];
  if (r === undefined) throw new Error(`keep-unmatched: ${table.name} 에 줄 ${row} 이 없다`);
  const v = r[colIndex(table, column)];
  if (v === undefined) throw new Error(`keep-unmatched: ${table.name} 줄 ${row} 에 ${column} 칸이 없다`);
  return String(v);
}

export const keepUnmatchedStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const cellFont = parseFloat(fontSizes.sm);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles: Handles = { result: new Map(), tray: new Map(), nulls: new Map() };

    // ── 자리 셈 ──────────────────────────────────────────────
    function geometry(scene: KeepUnmatchedScene) {
      const nL = scene.left.columns.length;
      const nR = scene.right.columns.length;
      const nS = scene.select.length;
      const cw = Math.min(CELL_W_MAX, Math.floor((PIECE_CANVAS_W - 2 * SIDE - 2 * GAP_MIN) / (nL + nR + nS)));
      const gap = (PIECE_CANVAS_W - 2 * SIDE - cw * (nL + nR + nS)) / 2;
      const xL = SIDE;
      const xR = xL + nL * cw + gap;
      const xS = xR + nR * cw + gap;
      const most = Math.max(scene.left.rows.length, scene.right.rows.length, 1);
      const trayRows = Math.max(scene.unmatched.length, 1);
      // 표 · 받침 · 캡션이 세로를 나눈다. 줄 높이는 걸음마다 같아야 해서 받침 몫은 두 줄로 잡아
      // 두고(짝 없는 줄 수는 걸음 2 에서야 드러난다), 그보다 많으면 받침 안의 간격이 준다
      const rowH = Math.min(
        ROW_H_MAX,
        (CAPTION_1 - 26 - HEAD_Y - TRAY_GAP - TRAY_HEAD - 8) / (most + 1 + TRAY_RESERVE),
      );
      const trayTop = HEAD_Y + rowH * (most + 1) + TRAY_GAP;
      const leftSel = scene.select.map((s, c) => ({ s, c })).filter((e) => e.s.side === 'left');
      const trayW = nL * cw;
      const trayRowH = Math.min(rowH + 4, (CAPTION_1 - 26 - (trayTop + TRAY_HEAD)) / trayRows);
      const rowY = (i: number) => HEAD_Y + rowH * (i + 1);
      return {
        cw,
        rowH,
        xL,
        xR,
        xS,
        leftSel,
        trayW,
        trayRowH,
        trayTop,
        trayH: TRAY_HEAD + trayRows * trayRowH + 6,
        rowY,
        leftCell: (row: number, col: number): Pt => ({ x: xL + col * cw, y: rowY(row) }),
        rightCell: (row: number, col: number): Pt => ({ x: xR + col * cw, y: rowY(row) }),
        resultCell: (slot: number, c: number): Pt => ({ x: xS + c * cw, y: rowY(slot) }),
        trayCell: (j: number, k: number): Pt => ({
          x: xL + (trayW - leftSel.length * cw) / 2 + k * cw,
          y: trayTop + TRAY_HEAD + j * trayRowH,
        }),
      };
    }

    // ── 그리기 부속 ──────────────────────────────────────────
    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      attrs: Record<string, string | number>,
    ): SVGTextElement {
      const node = el(parent, 'text', { x, y, ...attrs });
      node.textContent = text;
      return node;
    }

    type CellStyle = { fill: string; stroke: string; ink: string; dash?: boolean; bold?: boolean };

    function cell(
      parent: Element,
      at: Pt,
      w: number,
      h: number,
      text: string,
      style: CellStyle,
    ): { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement } {
      const g = el(parent, 'g', {});
      const rect = el(g, 'rect', {
        x: at.x + 1,
        y: at.y + 1,
        width: w - 2,
        height: h - 2,
        rx: 3,
        fill: style.fill,
        stroke: style.stroke,
        'stroke-width': 1.2,
      });
      if (style.dash) rect.setAttribute('stroke-dasharray', '4 3');
      const node = label(g, at.x + w / 2, at.y + h / 2 + cellFont * 0.36, text, {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: style.ink,
      });
      if (style.bold) node.setAttribute('font-weight', '600');
      return { g, rect, text: node };
    }

    const plain: CellStyle = { fill: colors.bg, stroke: colors.border, ink: colors.text };
    const head: CellStyle = { fill: colors.bgSubtle, stroke: colors.border, ink: colors.textMuted, bold: true };
    const paired: CellStyle = { fill: colors.bg, stroke: colors.primary, ink: colors.text };
    const stray: CellStyle = { fill: colors.bg, stroke: colors.danger, ink: colors.text, dash: true };
    const kept: CellStyle = { fill: colors.bg, stroke: colors.itemActive, ink: colors.text };
    const nullCell: CellStyle = { fill: colors.bgSubtle, stroke: colors.itemActive, ink: colors.textMuted, dash: true };

    function table(
      parent: Element,
      g: ReturnType<typeof geometry>,
      x: number,
      name: string,
      columns: string[],
    ): void {
      label(parent, x, TITLE_Y, name, {
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': '600',
        fill: colors.text,
      });
      columns.forEach((c, i) => cell(parent, { x: x + i * g.cw, y: HEAD_Y }, g.cw, g.rowH, c, head));
    }

    // ── 정적 그리기 — 장면이 정본 ─────────────────────────────
    function drawStatic(scene: KeepUnmatchedScene): void {
      svg.textContent = '';
      handles = { result: new Map(), tray: new Map(), nulls: new Map() };
      const g = geometry(scene);
      const root = el(svg, 'g', {});

      // SQL
      scene.sql.forEach((line, i) =>
        label(root, SIDE, SQL_TOP + i * SQL_LINE, line, {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        }),
      );

      const matchedLeft = new Set<number>();
      const matchedRight = new Set<number>();
      for (const r of scene.result) {
        if (r.right !== null) {
          matchedLeft.add(r.left);
          matchedRight.add(r.right);
        }
      }
      const strays = new Set(scene.unmatched);

      // 왼쪽 표
      table(root, g, g.xL, scene.left.name, scene.left.columns);
      scene.left.rows.forEach((row, li) => {
        const style = matchedLeft.has(li)
          ? paired
          : strays.has(li)
            ? scene.phase === 'kept'
              ? kept
              : stray
            : plain;
        row.forEach((v, ci) => cell(root, g.leftCell(li, ci), g.cw, g.rowH, String(v), style));
      });

      // 오른쪽 표
      table(root, g, g.xR, scene.right.name, scene.right.columns);
      scene.right.rows.forEach((row, ri) => {
        const style = matchedRight.has(ri) ? paired : plain;
        row.forEach((v, ci) => cell(root, g.rightCell(ri, ci), g.cw, g.rowH, String(v), style));
      });

      // 결과 표
      table(
        root,
        g,
        g.xS,
        t('label.result', 'Result'),
        scene.select.map((s) => s.column),
      );
      scene.result.forEach((r, slot) => {
        scene.select.forEach((s, c) => {
          const at = g.resultCell(slot, c);
          const key = `${r.left}:${c}`;
          if (s.side === 'right' && r.right === null) {
            const made = cell(root, at, g.cw, g.rowH, 'NULL', nullCell);
            made.text.setAttribute('font-style', 'italic');
            handles.nulls.set(key, { rect: made.rect, text: made.text });
            return;
          }
          let text: string;
          if (s.side === 'left') text = cellText(scene.left, r.left, s.column);
          else if (r.right !== null) text = cellText(scene.right, r.right, s.column);
          else throw new Error(`keep-unmatched: 결과 줄 ${slot} 의 오른쪽 칸을 셀 수 없다`);
          const style = r.right === null ? kept : paired;
          handles.result.set(key, cell(root, at, g.cw, g.rowH, text, style).g);
        });
      });

      // 짝 없음 받침 — 짝 없는 줄이 드러난 뒤부터
      if (scene.phase === 'unmatched' || scene.phase === 'kept') {
        el(root, 'rect', {
          x: g.xL,
          y: g.trayTop,
          width: g.trayW,
          height: g.trayH,
          rx: 5,
          fill: 'none',
          stroke: colors.danger,
          'stroke-width': 1,
          'stroke-dasharray': '5 4',
        });
        label(root, g.xL + 6, g.trayTop + 14, t('label.unmatched', 'No match'), {
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.danger,
        });
        if (scene.phase === 'unmatched') {
          scene.unmatched.forEach((li, j) => {
            g.leftSel.forEach(({ s, c }, k) => {
              const at = g.trayCell(j, k);
              const made = cell(root, at, g.cw, g.rowH, cellText(scene.left, li, s.column), stray);
              made.g.setAttribute(
                'transform',
                `rotate(${TILT} ${r2(at.x + g.cw / 2)} ${r2(at.y + g.rowH / 2)})`,
              );
              handles.tray.set(`${li}:${c}`, made.g);
            });
          });
        }
      }

      // 캡션 — 지금 일어난 일만
      const lines = captionLines(scene);
      lines.forEach((line, i) =>
        label(root, SIDE, i === 0 ? CAPTION_1 : CAPTION_2, line, {
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: i === 0 ? colors.text : colors.textMuted,
        }),
      );
    }

    function captionLines(scene: KeepUnmatchedScene): string[] {
      const n = scene.result.length;
      switch (scene.phase) {
        case 'start':
          return [
            t('caption.start', 'Left table: {left} · right table: {right}', {
              left: scene.left.name,
              right: scene.right.name,
            }),
          ];
        case 'matched':
          return [
            t('caption.matched', 'Rows with a match are joined. Result rows: {n}', { n }),
            t('caption.innerStop', 'An INNER JOIN would stop here.'),
          ];
        case 'unmatched':
          return [
            t('caption.unmatched', 'Left rows with no match in {right}: {n}', {
              right: scene.right.name,
              n: scene.unmatched.length,
            }),
            t('caption.innerDrop', 'An INNER JOIN would drop them.'),
          ];
        case 'kept': {
          const k = scene.result.filter((r) => r.right === null).length;
          return [
            t('caption.kept', 'LEFT JOIN keeps them — their empty cells are filled with NULL.'),
            t('caption.count', 'Result rows: {n} · kept without a match: {k}', { n, k }),
          ];
        }
      }
    }

    // ── 운동 ─────────────────────────────────────────────────
    function live(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    /** 한 시계 — 프레임 수로 센다. 첫 프레임은 곧바로 그린다 (끝 자리가 번쩍이지 않게) */
    function tween(ms: number, mine: number, frame: (e: number) => void): Promise<void> {
      const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let i = 0;
        const tick = () => {
          if (!live(mine)) {
            finish();
            return;
          }
          frame(ease(i / frames));
          if (i >= frames) {
            finish();
            return;
          }
          i += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function shift(node: SVGGElement, dx: number, dy: number, turn?: { a: number; c: Pt }): void {
      const move = `translate(${r2(dx)} ${r2(dy)})`;
      const rot = turn ? ` rotate(${r2(turn.a)} ${r2(turn.c.x)} ${r2(turn.c.y)})` : '';
      node.setAttribute('transform', move + rot);
    }

    /** 이어짐 — 두 표의 칸 복사본이 결과 자리로 모인다 */
    async function animateJoin(scene: KeepUnmatchedScene, mine: number): Promise<void> {
      const g = geometry(scene);
      const moves: { node: SVGGElement; dx: number; dy: number }[] = [];
      scene.result.forEach((r, slot) => {
        scene.select.forEach((s, c) => {
          const node = handles.result.get(`${r.left}:${c}`);
          if (!node || r.right === null) return;
          const from =
            s.side === 'left'
              ? g.leftCell(r.left, colIndex(scene.left, s.column))
              : g.rightCell(r.right, colIndex(scene.right, s.column));
          const to = g.resultCell(slot, c);
          moves.push({ node, dx: from.x - to.x, dy: from.y - to.y });
        });
      });
      await tween(MOVE_MS, mine, (e) => {
        for (const m of moves) shift(m.node, m.dx * (1 - e), m.dy * (1 - e));
      });
    }

    /** 짝 없음 — 왼쪽 표에서 떨어져 받침으로 미끄러지며 기운다 */
    async function animateReveal(scene: KeepUnmatchedScene, mine: number): Promise<void> {
      const g = geometry(scene);
      const moves: { node: SVGGElement; dx: number; dy: number; c: Pt }[] = [];
      scene.unmatched.forEach((li, j) => {
        g.leftSel.forEach(({ s, c }, k) => {
          const node = handles.tray.get(`${li}:${c}`);
          if (!node) return;
          const from = g.leftCell(li, colIndex(scene.left, s.column));
          const to = g.trayCell(j, k);
          moves.push({
            node,
            dx: from.x - to.x,
            dy: from.y - to.y,
            c: { x: to.x + g.cw / 2, y: to.y + g.rowH / 2 },
          });
        });
      });
      await tween(MOVE_MS, mine, (e) => {
        for (const m of moves) shift(m.node, m.dx * (1 - e), m.dy * (1 - e), { a: TILT * e, c: m.c });
      });
    }

    /** 남음 — 받침의 줄이 결과로 되돌아오고, 이어진 줄은 비켜 서고, 빈 칸이 NULL 로 찬다 */
    async function animateKeep(
      scene: KeepUnmatchedScene,
      was: [number, number][],
      mine: number,
    ): Promise<void> {
      const g = geometry(scene);
      const wasSlot = new Map(was);
      const strays = scene.result.filter((r) => r.right === null).map((r) => r.left);
      const moves: { node: SVGGElement; dx: number; dy: number; c?: Pt }[] = [];
      scene.result.forEach((r, slot) => {
        scene.select.forEach((_s, c) => {
          const node = handles.result.get(`${r.left}:${c}`);
          if (!node) return;
          const to = g.resultCell(slot, c);
          const before = wasSlot.get(r.left);
          if (before !== undefined) {
            const from = g.resultCell(before, c);
            moves.push({ node, dx: from.x - to.x, dy: from.y - to.y });
            return;
          }
          const j = strays.indexOf(r.left);
          const k = g.leftSel.findIndex((e) => e.c === c);
          if (j < 0 || k < 0) return;
          const from = g.trayCell(j, k);
          moves.push({
            node,
            dx: from.x - to.x,
            dy: from.y - to.y,
            c: { x: to.x + g.cw / 2, y: to.y + g.rowH / 2 },
          });
        });
      });
      const fills = [...handles.nulls.values()];
      const full = g.cw - 2;
      for (const f of fills) {
        f.rect.setAttribute('width', '0');
        f.text.setAttribute('opacity', '0');
      }
      await tween(RETURN_MS, mine, (e) => {
        for (const m of moves) {
          shift(m.node, m.dx * (1 - e), m.dy * (1 - e), m.c ? { a: TILT * (1 - e), c: m.c } : undefined);
        }
      });
      if (!live(mine)) return;
      await tween(FILL_MS, mine, (e) => {
        for (const f of fills) {
          f.rect.setAttribute('width', String(r2(full * e)));
          f.text.setAttribute('opacity', String(r2(e)));
        }
      });
    }

    return {
      async render(
        next: KeepUnmatchedScene,
        _prev: KeepUnmatchedScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        const step = next.step;
        if (!opts.animate || step === null) return;
        if (step.kind === 'join') await animateJoin(next, mine);
        else if (step.kind === 'reveal') await animateReveal(next, mine);
        else await animateKeep(next, step.was, mine);
        if (live(mine)) drawStatic(next);
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
