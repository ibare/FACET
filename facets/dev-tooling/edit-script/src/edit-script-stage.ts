import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { entryText, walkDiff, type EditOp } from './algorithm';
import type { EditScriptScene } from './scene';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 16;
const GAP = 22;
/** 목록 칸은 파일 칸보다 넓다 — 표식과 손질 이름이 더 붙는다. */
const LIST_SHARE = 1.3;
const HEAD_Y = 20;
const COUNT_Y = 38;
const ROWS_TOP = 54;
const ROW_H_MAX = 24;
const BACK_GAP = 34;
const CAPTION_Y = H - 14;
const WRITE_MS = 620;
const READ_BACK_MS = 720;

type Layout = {
  ax: number;
  lx: number;
  bx: number;
  colW: number;
  listW: number;
  rowH: number;
  backTop: number;
};

function num(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function layoutOf(scene: EditScriptScene): Layout {
  const unit = (PIECE_CANVAS_W - PAD * 2 - GAP * 2) / (2 + LIST_SHARE);
  const colW = unit;
  const listW = unit * LIST_SHARE;
  const ax = PAD;
  const lx = ax + colW + GAP;
  const bx = lx + listW + GAP;
  const fileRows = Math.max(scene.a.length, scene.b.length, 1);
  const listRows = Math.max(walkDiff(scene.a, scene.b).length, 1);
  const room = CAPTION_Y - 22 - ROWS_TOP;
  // 파일 칸은 위(원래 파일)와 아래(다시 읽은 파일) 두 벌이 선다. 목록 칸은 한 벌.
  const rowH = Math.min(ROW_H_MAX, (room - BACK_GAP) / (fileRows * 2), room / listRows);
  const backTop = ROWS_TOP + fileRows * rowH + BACK_GAP;
  return { ax, lx, bx, colW, listW, rowH, backTop };
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const editScriptStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const insColor = categorical(3, 'vivid')[1];
    if (insColor === undefined) throw new Error('edit-script: 넣음 색을 토큰에서 얻지 못했다');
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function opColor(op: EditOp): string {
      if (op === 'del') return colors.danger;
      if (op === 'ins') return insColor;
      return colors.textMuted;
    }

    function opLabel(op: EditOp): string {
      if (op === 'keep') return t('label.keep', 'keep');
      if (op === 'del') return t('label.del', 'delete');
      return t('label.ins', 'insert');
    }

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(num(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; family?: string; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.setAttribute('xml:space', 'preserve');
      node.textContent = text;
      return node;
    }

    function rowY(L: Layout, k: number): number {
      return ROWS_TOP + k * L.rowH;
    }

    function backY(L: Layout, k: number): number {
      return L.backTop + k * L.rowH;
    }

    function baseline(top: number, L: Layout): number {
      return top + L.rowH / 2 + smPx * 0.36;
    }

    function captionOf(scene: EditScriptScene): string {
      const step = scene.step;
      if (step.kind === 'start') return t('caption.start', 'Two files, read from the top.');
      if (step.kind === 'readBack') {
        const rows = step.side === 'a' ? scene.backA : scene.backB;
        if (rows === null) throw new Error(`edit-script: 다시 읽은 ${step.side} 가 장면에 없다`);
        return step.side === 'a'
          ? t('caption.backA', 'Keep and delete lines only — A comes back. Lines: {n}.', { n: rows.length })
          : t('caption.backB', 'Keep and insert lines only — B comes back. Lines: {n}.', { n: rows.length });
      }
      const entry = scene.entries[step.index];
      if (entry === undefined) throw new Error(`edit-script: 목록 줄 ${step.index} 가 장면에 없다`);
      const a = entry.ai === null ? 0 : entry.ai + 1;
      const b = entry.bi === null ? 0 : entry.bi + 1;
      if (entry.op === 'keep') {
        return t('caption.keep', 'Same line on both sides — both step down: A{a} · B{b}.', { a, b });
      }
      if (entry.op === 'del') return t('caption.del', 'Only A steps down — written as a deletion: A{a}.', { a });
      return t('caption.ins', 'Only B steps down — written as an insertion: B{b}.', { b });
    }

    type Handles = {
      L: Layout;
      listRows: SVGGElement[];
      listTints: SVGRectElement[];
      headA: SVGGElement;
      headB: SVGGElement;
      backRowsA: SVGGElement[];
      backRowsB: SVGGElement[];
      ghostLayer: SVGGElement;
    };

    /** 한 파일 칸 — 줄 번호 · 줄 글자 · 읽은 줄은 흐리게. 읽는 자리 손잡이를 돌려준다. */
    function drawFile(
      root: SVGGElement,
      L: Layout,
      x: number,
      lines: readonly string[],
      read: number,
      title: string,
    ): SVGGElement {
      label(root, x, HEAD_Y, title, { weight: '600', size: fontSizes.md });
      label(root, x, COUNT_Y, t('label.read', 'Read: {i}/{n}', { i: read, n: lines.length }), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      el('rect', { x, y: ROWS_TOP, width: L.colW, height: lines.length * L.rowH, fill: colors.bgSubtle, rx: 4 }, root);
      lines.forEach((line, k) => {
        const top = rowY(L, k);
        const done = k < read;
        label(root, x + 6, baseline(top, L), String(k + 1), { size: fontSizes.xs, fill: colors.textMuted });
        label(root, x + 22, baseline(top, L), line, {
          family: fonts.mono,
          fill: done ? colors.textMuted : colors.text,
        });
      });
      // 읽는 자리 — 읽은 줄과 아직 안 읽은 줄의 경계
      const head = el('g', {}, root);
      const hy = rowY(L, read);
      el('line', { x1: x, y1: hy, x2: x + L.colW, y2: hy, stroke: colors.primary, 'stroke-width': 2 }, head);
      el('path', { d: `M ${num(x - 9)} ${num(hy - 5)} L ${num(x - 1)} ${num(hy)} L ${num(x - 9)} ${num(hy + 5)} Z`, fill: colors.primary }, head);
      return head;
    }

    function drawBack(
      root: SVGGElement,
      L: Layout,
      x: number,
      scene: EditScriptScene,
      rows: readonly number[],
      title: string,
    ): SVGGElement[] {
      label(root, x, L.backTop - 10, title, { weight: '600' });
      el('rect', { x, y: L.backTop, width: L.colW, height: rows.length * L.rowH, fill: colors.bgSubtle, rx: 4 }, root);
      return rows.map((r, k) => {
        const entry = scene.entries[r];
        if (entry === undefined) throw new Error(`edit-script: 다시 읽을 목록 줄 ${r} 가 없다`);
        const g = el('g', {}, root);
        const top = backY(L, k);
        label(g, x + 6, baseline(top, L), String(k + 1), { size: fontSizes.xs, fill: colors.textMuted });
        label(g, x + 22, baseline(top, L), entryText(entry, scene.a, scene.b), { family: fonts.mono });
        return g;
      });
    }

    function drawStatic(scene: EditScriptScene): Handles {
      svg.textContent = '';
      const L = layoutOf(scene);
      const root = el('g', {}, svg);
      const headA = drawFile(root, L, L.ax, scene.a, scene.readA, t('label.a', 'A · before'));
      const headB = drawFile(root, L, L.bx, scene.b, scene.readB, t('label.b', 'B · after'));

      // 목록 — 적힌 줄만. 자라는 것이 이 칸이다.
      label(root, L.lx, HEAD_Y, t('label.list', 'Edit script'), { weight: '600', size: fontSizes.md });
      const total = walkDiff(scene.a, scene.b).length;
      el(
        'rect',
        {
          x: L.lx,
          y: ROWS_TOP,
          width: L.listW,
          height: total * L.rowH,
          fill: 'none',
          stroke: colors.border,
          'stroke-dasharray': '3 3',
          rx: 4,
        },
        root,
      );
      const step = scene.step;
      const picked =
        step.kind === 'readBack' ? new Set(step.side === 'a' ? (scene.backA ?? []) : (scene.backB ?? [])) : null;
      const listRows: SVGGElement[] = [];
      const listTints: SVGRectElement[] = [];
      scene.entries.forEach((entry, k) => {
        const top = rowY(L, k);
        const g = el('g', {}, root);
        if (picked !== null && !picked.has(k)) g.setAttribute('opacity', '0.3');
        const tint = el(
          'rect',
          {
            x: L.lx + 1,
            y: top + 1,
            width: L.listW - 2,
            height: L.rowH - 2,
            fill: opColor(entry.op),
            'fill-opacity': entry.op === 'keep' ? 0.08 : 0.16,
            rx: 3,
          },
          g,
        );
        const mark = scene.marks[entry.op];
        label(g, L.lx + 8, baseline(top, L), mark, {
          family: fonts.mono,
          fill: opColor(entry.op),
          weight: '700',
        });
        label(g, L.lx + 22, baseline(top, L), entryText(entry, scene.a, scene.b), { family: fonts.mono });
        label(g, L.lx + L.listW - 6, baseline(top, L), opLabel(entry.op), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'end',
        });
        listRows.push(g);
        listTints.push(tint);
      });

      const backRowsA =
        scene.backA === null ? [] : drawBack(root, L, L.ax, scene, scene.backA, t('label.backA', 'A, read back'));
      const backRowsB =
        scene.backB === null ? [] : drawBack(root, L, L.bx, scene, scene.backB, t('label.backB', 'B, read back'));

      label(root, PIECE_CANVAS_W / 2, CAPTION_Y, captionOf(scene), { anchor: 'middle', size: fontSizes.md });
      const ghostLayer = el('g', {}, root);
      return { L, listRows, listTints, headA, headB, backRowsA, backRowsB, ghostLayer };
    }

    function tween(ms: number, mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
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
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function shift(node: Element, dx: number, dy: number): void {
      if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${num(dx)} ${num(dy)})`);
    }

    async function animateWrite(
      next: EditScriptScene,
      h: Handles,
      step: Extract<EditScriptScene['step'], { kind: 'write' }>,
      mine: number,
    ): Promise<void> {
      const entry = next.entries[step.index];
      const row = h.listRows[step.index];
      const tint = h.listTints[step.index];
      if (entry === undefined || row === undefined || tint === undefined) {
        throw new Error(`edit-script: 적을 목록 줄 ${step.index} 가 없다`);
      }
      const L = h.L;
      const target = rowY(L, step.index);
      // 새 줄은 읽힌 파일 줄에서 출발한다. keep 이면 A 쪽 줄이 몸이고 B 쪽 줄이 따라와 겹친다.
      const fromX = entry.op === 'ins' ? L.bx : L.ax;
      const fromRow = entry.op === 'ins' ? entry.bi : entry.ai;
      if (fromRow === null) throw new Error(`edit-script: ${entry.op} 줄의 출발 자리가 없다`);
      const dx = fromX - L.lx;
      const dy = rowY(L, fromRow) - target;
      let ghost: SVGGElement | null = null;
      let gdx = 0;
      let gdy = 0;
      if (entry.op === 'keep') {
        if (entry.bi === null) throw new Error('edit-script: 남김 줄에 B 자리가 없다');
        const twin = next.b[entry.bi];
        if (twin === undefined) throw new Error(`edit-script: 남김 줄의 B 자리 ${entry.bi} 가 파일 밖이다`);
        ghost = el('g', {}, h.ghostLayer);
        label(ghost, L.lx + 22, baseline(target, L), twin, { family: fonts.mono });
        gdx = L.bx - L.lx;
        gdy = rowY(L, entry.bi) - target;
      }
      const headDyA = (step.wasA - next.readA) * L.rowH;
      const headDyB = (step.wasB - next.readB) * L.rowH;
      const frame = (e: number): void => {
        const rest = 1 - e;
        shift(row, dx * rest, dy * rest);
        tint.setAttribute('opacity', String(num(e)));
        if (ghost !== null) {
          shift(ghost, gdx * rest, gdy * rest);
          ghost.setAttribute('opacity', String(num(Math.min(1, rest * 3))));
        }
        shift(h.headA, 0, headDyA * rest);
        shift(h.headB, 0, headDyB * rest);
      };
      frame(0);
      await tween(WRITE_MS, mine, frame);
    }

    async function animateReadBack(
      next: EditScriptScene,
      h: Handles,
      side: 'a' | 'b',
      mine: number,
    ): Promise<void> {
      const rows = side === 'a' ? next.backA : next.backB;
      const back = side === 'a' ? h.backRowsA : h.backRowsB;
      if (rows === null) throw new Error(`edit-script: 다시 읽은 ${side} 가 장면에 없다`);
      const L = h.L;
      const x = side === 'a' ? L.ax : L.bx;
      const picked = new Set(rows);
      const offsets = rows.map((r, k) => ({ dx: L.lx - x, dy: rowY(L, r) - backY(L, k) }));
      if (back.length !== offsets.length) {
        throw new Error(`edit-script: 다시 읽은 ${side} 의 줄 ${back.length} 과 고른 목록 줄 ${offsets.length} 이 다르다`);
      }
      const frame = (e: number): void => {
        const rest = 1 - e;
        back.forEach((g, k) => {
          const o = offsets[k];
          if (o === undefined) throw new Error(`edit-script: 다시 읽은 ${side} 의 줄 ${k} 에 출발 자리가 없다`);
          shift(g, o.dx * rest, o.dy * rest);
        });
        h.listRows.forEach((g, k) => {
          if (!picked.has(k)) g.setAttribute('opacity', String(num(1 - 0.7 * e)));
        });
      };
      frame(0);
      await tween(READ_BACK_MS, mine, frame);
    }

    return {
      async render(next: EditScriptScene, _prev: EditScriptScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step.kind === 'write') await animateWrite(next, h, step, mine);
        else if (step.kind === 'readBack') await animateReadBack(next, h, step.side, mine);
        else return;
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
