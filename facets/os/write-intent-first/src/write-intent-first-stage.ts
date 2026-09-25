/**
 * 저널 선기록의 무대.
 *
 * 위는 저널, 아래는 제자리. 저널에 쓰는 걸음은 기록이 위에서 내려와 저널의 다음 자리에
 * 쌓이고, 제자리에 쓰는 걸음은 저널에 남은 new 내용의 복제본이 제자리 블록까지 건너가
 * 그 블록을 new 로 바꾼다. 비우는 걸음은 저널의 기록이 줄 안으로 접혀 사라진다.
 * 기록마다 몇 번째 디스크 쓰기였는지 번호를 단다.
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
import type { JournalEntry, WriteIntentFirstScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 320;
const MARGIN = 20;
const REGION_PAD = 12;
const GAP = 10;
const TILE_W_MAX = 112;
const TILE_H = 56;
const JOURNAL_Y = 50;
const JOURNAL_H = 104;
const HOME_Y = 184;
const HOME_H = 96;
const DROP = 56;
const DROP_MS = 450;
const MOVE_MS = 750;
const FOLD_MS = 550;
const FRAME_MS = 16;

type Rect = { x: number; y: number; w: number; h: number };

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  parent.appendChild(node);
  return node;
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

/** 저널 자리 i 의 사각형. 자리 수는 바탕(블록 수 + 표식 둘)에서 나온다. */
function journalSlot(scene: WriteIntentFirstScene, i: number): Rect {
  const n = scene.blocks.length + 2;
  const inner = PIECE_CANVAS_W - 2 * MARGIN - 2 * REGION_PAD;
  const w = Math.min(TILE_W_MAX, (inner - GAP * (n - 1)) / n);
  const total = w * n + GAP * (n - 1);
  const x0 = (PIECE_CANVAS_W - total) / 2;
  return { x: x0 + i * (w + GAP), y: JOURNAL_Y + 32, w, h: TILE_H };
}

/** 제자리 블록 i 의 사각형 — 저널 자리와 줄을 맞추지 않고 제자리 칸을 고르게 나눈다. */
function homeSlot(scene: WriteIntentFirstScene, i: number): Rect {
  const k = scene.blocks.length;
  const w = journalSlot(scene, 0).w;
  const inner = PIECE_CANVAS_W - 2 * MARGIN;
  const cx = MARGIN + (inner * (i + 0.5)) / k;
  return { x: cx - w / 2, y: HOME_Y + 30, w, h: TILE_H };
}

export const writeIntentFirstStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function blockName(id: string): string {
      if (id === 'bitmap') return t('label.bitmap', 'Bitmap');
      if (id === 'inode') return t('label.inode', 'Inode');
      if (id === 'data') return t('label.data', 'Data');
      throw new Error(`write-intent-first: 표시 이름이 없는 블록 ${id}`);
    }

    function caption(scene: WriteIntentFirstScene): string {
      const s = scene.step;
      switch (s.kind) {
        case 'start':
          return t('caption.start', 'Change: append one data block. Blocks it changes: {n}', { n: s.changed });
        case 'begin':
          return t('caption.begin', 'To the journal: begin mark — transaction {tx}', { tx: s.tx });
        case 'block':
          return t('caption.block', 'To the journal: new content — {block}', { block: blockName(s.block) });
        case 'end':
          return t('caption.end', 'To the journal: end mark — transaction {tx}. Home writes may start now.', { tx: s.tx });
        case 'home':
          return t('caption.home', 'From the journal to its home: {block}', { block: blockName(s.block) });
        case 'clear':
          return t('caption.clear', 'Home blocks now new: {n}. Cleared from the journal: transaction {tx}', { n: s.home, tx: s.tx });
      }
    }

    function badge(g: Element, r: Rect, n: number, ink: string, fill: string): void {
      const cx = r.x + r.w - 10;
      const cy = r.y + 10;
      el('circle', { cx, cy, r: 8, fill, stroke: ink, 'stroke-width': 1 }, g);
      const tx = el(
        'text',
        {
          x: cx,
          y: cy + 3.5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: ink,
        },
        g,
      );
      tx.textContent = String(n);
    }

    function tileText(g: Element, r: Rect, main: string, sub: string | null, ink: string, subInk: string): void {
      const a = el(
        'text',
        {
          x: r.x + r.w / 2,
          y: sub === null ? r.y + r.h / 2 + smPx / 3 : r.y + r.h / 2 - 2,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: ink,
        },
        g,
      );
      a.textContent = main;
      if (sub !== null) {
        const b = el(
          'text',
          {
            x: r.x + r.w / 2,
            y: r.y + r.h / 2 + smPx + 2,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: subInk,
          },
          g,
        );
        b.textContent = sub;
      }
    }

    /** 저널 기록 하나를 r 자리에 그린다. */
    function drawEntry(parent: Element, e: JournalEntry, r: Rect, active: boolean): SVGGElement {
      const g = el('g', {}, parent);
      const marker = e.kind !== 'block';
      const fill = marker ? c.accent : c.primary;
      const ink = marker ? c.stateInk : c.textInverse;
      el(
        'rect',
        {
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          rx: 6,
          fill,
          stroke: active ? c.itemActive : fill,
          'stroke-width': active ? 3 : 1,
        },
        g,
      );
      if (e.kind === 'begin') tileText(g, r, t('mark.begin', 'Begin'), null, ink, ink);
      else if (e.kind === 'end') tileText(g, r, t('mark.end', 'End'), null, ink, ink);
      else tileText(g, r, blockName(e.block), t('state.new', 'new'), ink, ink);
      badge(g, r, e.write, ink, fill);
      return g;
    }

    function drawHome(parent: Element, block: string, state: 'old' | 'new', write: number | null, r: Rect, active: boolean): void {
      const g = el('g', {}, parent);
      const isNew = state === 'new';
      const fill = isNew ? c.primary : c.itemDefault;
      const ink = isNew ? c.textInverse : c.text;
      el(
        'rect',
        {
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          rx: 6,
          fill,
          stroke: active ? c.itemActive : isNew ? fill : c.border,
          'stroke-width': active ? 3 : 1.5,
        },
        g,
      );
      tileText(
        g,
        r,
        blockName(block),
        isNew ? t('state.new', 'new') : t('state.old', 'old'),
        ink,
        isNew ? ink : c.textMuted,
      );
      if (write !== null) badge(g, r, write, ink, fill);
    }

    function label(text: string, x: number, y: number, anchor: string, color: string, size: string, parent: Element): void {
      const n = el(
        'text',
        { x, y, 'text-anchor': anchor, 'font-family': fonts.body, 'font-size': size, fill: color },
        parent,
      );
      n.textContent = text;
    }

    /**
     * 장면 전체를 세운다. hold 가 주어지면 그 제자리 블록은 아직 old 로 둔다 (복제본이 건너가는 중).
     * 돌려주는 것은 저널 기록의 그룹 (저널 자리 차례).
     */
    function drawStatic(scene: WriteIntentFirstScene, hold: string | null): SVGGElement[] {
      svg.textContent = '';
      const s = scene.step;

      label(caption(scene), MARGIN, 30, 'start', c.text, fontSizes.md, svg);

      // 저널
      el(
        'rect',
        {
          x: MARGIN,
          y: JOURNAL_Y,
          width: PIECE_CANVAS_W - 2 * MARGIN,
          height: JOURNAL_H,
          rx: 8,
          fill: c.bgSubtle,
          stroke: c.border,
        },
        svg,
      );
      label(t('label.journal', 'Journal'), MARGIN + REGION_PAD, JOURNAL_Y + 20, 'start', c.textMuted, fontSizes.sm, svg);
      if (scene.journal.length > 0) {
        label(
          t('label.batch', 'Transaction: {tx}', { tx: scene.tx }),
          PIECE_CANVAS_W - MARGIN - REGION_PAD,
          JOURNAL_Y + 20,
          'end',
          c.textMuted,
          fontSizes.sm,
          svg,
        );
      }
      const slots = scene.blocks.length + 2;
      for (let i = 0; i < slots; i++) {
        const r = journalSlot(scene, i);
        el(
          'rect',
          {
            x: r.x,
            y: r.y,
            width: r.w,
            height: r.h,
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '4 4',
          },
          svg,
        );
      }
      const entries: SVGGElement[] = [];
      const lastJournal = s.kind === 'begin' || s.kind === 'block' || s.kind === 'end' ? scene.journal.length - 1 : -1;
      const homeSrc = s.kind === 'home' ? s.slot : -1;
      scene.journal.forEach((e, i) => {
        entries.push(drawEntry(svg, e, journalSlot(scene, i), i === lastJournal || i === homeSrc));
      });

      // 제자리
      el(
        'rect',
        {
          x: MARGIN,
          y: HOME_Y,
          width: PIECE_CANVAS_W - 2 * MARGIN,
          height: HOME_H,
          rx: 8,
          fill: c.bg,
          stroke: c.border,
        },
        svg,
      );
      label(t('label.home', 'Home locations'), MARGIN + REGION_PAD, HOME_Y + 20, 'start', c.textMuted, fontSizes.sm, svg);
      scene.home.forEach((h, i) => {
        const held = hold !== null && h.block === hold;
        drawHome(
          svg,
          h.block,
          held ? 'old' : h.state,
          held ? null : h.write,
          homeSlot(scene, i),
          !held && s.kind === 'home' && s.block === h.block,
        );
      });

      // 쓰기 수
      const y = H - 14;
      label(t('count.journal', 'Journal writes: {n}', { n: scene.journalWrites }), MARGIN, y, 'start', c.text, fontSizes.sm, svg);
      label(
        t('count.home', 'Home writes: {n}', { n: scene.homeWrites }),
        PIECE_CANVAS_W / 2,
        y,
        'middle',
        c.text,
        fontSizes.sm,
        svg,
      );
      if (scene.cleared) {
        label(
          t('count.direct', 'Writes without a journal: {n}', { n: scene.blocks.length }),
          PIECE_CANVAS_W - MARGIN,
          y,
          'end',
          c.textMuted,
          fontSizes.sm,
          svg,
        );
      }
      return entries;
    }

    function wait(ms: number): Promise<boolean> {
      return new Promise((resolve) => {
        if (destroyed) return resolve(false);
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(wake);
          resolve(true);
        }, ms);
        timers.add(id);
      });
    }

    /** ms 동안 draw(p) 를 부른다 (p: 0→1). 도중에 거둬지면 false. */
    async function tween(ms: number, mine: number, draw: (p: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.round(ms / FRAME_MS));
      for (let f = 1; f <= frames; f++) {
        if (!(await wait(FRAME_MS))) return false;
        if (mine !== gen || destroyed) return false;
        draw(f / frames);
      }
      return true;
    }

    async function animateStep(next: WriteIntentFirstScene, mine: number): Promise<void> {
      const s = next.step;
      if (s.kind === 'begin' || s.kind === 'block' || s.kind === 'end') {
        const entries = drawStatic(next, null);
        const g = entries[entries.length - 1];
        if (g === undefined) throw new Error('write-intent-first: 쓴 기록이 저널에 없다');
        g.setAttribute('transform', `translate(0 ${round(-DROP)})`);
        await tween(DROP_MS, mine, (p) => {
          g.setAttribute('transform', `translate(0 ${round(-DROP * (1 - easeOut(p)))})`);
        });
        return;
      }
      if (s.kind === 'home') {
        drawStatic(next, s.block);
        const src = next.journal[s.slot];
        const at = next.home.findIndex((h) => h.block === s.block);
        if (src === undefined || at < 0) throw new Error(`write-intent-first: 옮길 ${s.block} 를 찾지 못했다`);
        const from = journalSlot(next, s.slot);
        const to = homeSlot(next, at);
        const copy = drawEntry(svg, src, from, true);
        await tween(MOVE_MS, mine, (p) => {
          const e = easeInOut(p);
          const dx = (to.x - from.x) * e;
          const dy = (to.y - from.y) * e;
          copy.setAttribute('transform', `translate(${round(dx)} ${round(dy)})`);
        });
        return;
      }
      if (s.kind === 'clear') {
        drawStatic(next, null);
        const folds = s.was.map((e, i) => {
          const r = journalSlot(next, i);
          return { g: drawEntry(svg, e, r, false), cy: r.y + r.h / 2 };
        });
        await tween(FOLD_MS, mine, (p) => {
          const k = 1 - easeInOut(p);
          for (const f of folds) {
            f.g.setAttribute('transform', `translate(0 ${round(f.cy * (1 - k))}) scale(1 ${round(k)})`);
          }
        });
        return;
      }
      drawStatic(next, null);
    }

    return {
      async render(next: WriteIntentFirstScene, _prev: WriteIntentFirstScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate) {
          drawStatic(next, null);
          return;
        }
        await animateStep(next, mine);
        if (mine !== gen || destroyed) return;
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
