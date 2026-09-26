/**
 * set-of-rows 의 무대. 왼쪽에 차례 A, 오른쪽에 차례 B 의 자리들.
 *
 * - move  : A 의 줄마다 사본이 떠올라 가운데를 건너 B 의 제 자리로 옮겨 앉는다
 * - match : A 의 줄에서 B 의 짝 줄로 선이 뻗는다
 * - enter : 같은 줄 하나가 오른쪽 밖에서 B 아래 빈 자리로 들어온다
 * - merge : 그 줄이 올라가 같은 줄 위에 포개지고 하나가 된다 (같은 줄이 없으면 빈 자리에 남는다)
 *
 * 정적 그리기가 정본이다. 운동은 끝 자리에 서 있는 요소를 아직 못 온 만큼 비켜 그린다.
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
import type { SetOfRowsScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 20;
/** 두 차례 사이 — 옮겨 가는 길과 짝 선이 지나는 자리 */
const GAP_MAX = 150;
/** 자리 번호 칸 */
const NUM_W = 22;
const TITLE_Y = 26;
const COUNT_Y = 46;
const HEAD_Y = 72;
const SLOT_TOP = 84;
const SLOT_MAX = 40;
const CAPTION_H = 64;

const MOVE_MS = 900;
const MOVE_STAGGER_MS = 90;
const LINE_MS = 600;
const ENTER_MS = 700;
const MERGE_MS = 800;
const FRAME_MS = 16;
const LIFT_PX = 34;

type Layout = {
  cardW: number;
  aCardX: number;
  bCardX: number;
  pitch: number;
  cardH: number;
  slotY: (i: number) => number;
};

function layoutFor(scene: SetOfRowsScene): Layout {
  const W = PIECE_CANVAS_W;
  const gap = Math.min(GAP_MAX, W * 0.24);
  const groupW = (W - 2 * MARGIN - gap) / 2;
  const cardW = groupW - NUM_W;
  // 자리 수: 두 차례 가운데 긴 쪽 + 들어오는 줄이 기다리는 한 칸
  const slots = Math.max(scene.orderA.length, scene.orderB.length) + 1;
  const pitch = Math.min(SLOT_MAX, (H - SLOT_TOP - CAPTION_H) / slots);
  const cardH = pitch * 0.78;
  return {
    cardW,
    aCardX: MARGIN + NUM_W,
    bCardX: W - MARGIN - NUM_W - cardW,
    pitch,
    cardH,
    slotY: (i) => SLOT_TOP + i * pitch,
  };
}

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

type Handles = {
  bRows: SVGGElement[];
  lines: { el: SVGLineElement; x1: number; y1: number; x2: number; y2: number }[];
  incoming: SVGGElement | null;
};

export const setOfRowsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r1(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: number },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'font-weight': opts.weight ?? 400,
          fill: opts.fill ?? colors.text,
        },
        parent,
      );
      node.textContent = body;
      return node;
    }

    /** 줄 하나 — 카드와 열마다의 칸. x,y 는 카드의 왼쪽 위. */
    function rowCard(
      parent: Element,
      L: Layout,
      row: readonly string[],
      x: number,
      y: number,
      look: { stroke: string; dashed?: boolean; width?: number },
    ): SVGGElement {
      const g = el('g', {}, parent);
      el(
        'rect',
        {
          x,
          y,
          width: L.cardW,
          height: L.cardH,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: look.stroke,
          'stroke-width': look.width ?? 1,
          ...(look.dashed === true ? { 'stroke-dasharray': '5 3' } : {}),
        },
        g,
      );
      const cellW = L.cardW / row.length;
      row.forEach((v, i) => {
        if (i > 0) {
          el(
            'line',
            { x1: x + i * cellW, y1: y + 5, x2: x + i * cellW, y2: y + L.cardH - 5, stroke: colors.border },
            g,
          );
        }
        label(g, x + i * cellW + 12, y + L.cardH / 2, v, { mono: true });
      });
      return g;
    }

    function slotNumbers(L: Layout, n: number, x: number, anchor: string): void {
      for (let i = 0; i < n; i += 1) {
        label(svg, x, L.slotY(i) + L.cardH / 2, String(i + 1), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor,
        });
      }
    }

    function columnHeads(L: Layout, scene: SetOfRowsScene, x: number): void {
      const cellW = L.cardW / scene.columns.length;
      scene.columns.forEach((c, i) => {
        label(svg, x + i * cellW + 12, HEAD_Y, c, { mono: true, size: fontSizes.xs, fill: colors.textMuted });
      });
    }

    function rowText(row: readonly string[]): string {
      return row.join(' ');
    }

    function drawStatic(scene: SetOfRowsScene): Handles {
      svg.textContent = '';
      const L = layoutFor(scene);
      const W = PIECE_CANVAS_W;
      const aMid = L.aCardX + L.cardW / 2;
      const bMid = L.bCardX + L.cardW / 2;
      const bCount = scene.merged !== null ? scene.merged.after : scene.moves !== null ? scene.orderB.length : null;

      // 머리 — 차례 이름과 줄 수
      label(svg, aMid, TITLE_Y, t('label.orderA', 'Order A'), { anchor: 'middle', size: fontSizes.md, weight: 600 });
      label(svg, bMid, TITLE_Y, t('label.orderB', 'Order B'), { anchor: 'middle', size: fontSizes.md, weight: 600 });
      label(svg, aMid, COUNT_Y, t('label.rows', 'Rows: {n}', { n: scene.orderA.length }), {
        anchor: 'middle',
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      if (bCount !== null) {
        label(svg, bMid, COUNT_Y, t('label.rows', 'Rows: {n}', { n: bCount }), {
          anchor: 'middle',
          size: fontSizes.xs,
          fill: colors.textMuted,
        });
      }
      label(svg, W / 2, COUNT_Y, scene.relation, { anchor: 'middle', mono: true, size: fontSizes.xs, fill: colors.textMuted });
      columnHeads(L, scene, L.aCardX);
      columnHeads(L, scene, L.bCardX);

      // 자리 번호 — A 는 바깥 왼쪽, B 는 바깥 오른쪽
      slotNumbers(L, scene.orderA.length, L.aCardX - NUM_W / 2, 'middle');
      slotNumbers(L, scene.orderB.length, L.bCardX + L.cardW + NUM_W / 2, 'middle');

      // B 의 빈 자리 (아직 옮겨 앉기 전)
      if (scene.moves === null) {
        scene.orderB.forEach((_, i) => {
          el(
            'rect',
            {
              x: L.bCardX,
              y: L.slotY(i),
              width: L.cardW,
              height: L.cardH,
              rx: 6,
              fill: 'none',
              stroke: colors.border,
              'stroke-dasharray': '4 4',
            },
            svg,
          );
        });
      }

      // 짝 선 — 카드 밑에 깐다
      const lineLayer = el('g', {}, svg);
      const lines: Handles['lines'] = [];
      if (scene.match !== null) {
        for (const p of scene.match.pairs) {
          const x1 = L.aCardX + L.cardW;
          const y1 = L.slotY(p.a) + L.cardH / 2;
          const x2 = L.bCardX;
          const y2 = L.slotY(p.b) + L.cardH / 2;
          const line = el(
            'line',
            { x1, y1, x2, y2, stroke: colors.success, 'stroke-width': 2, 'stroke-linecap': 'round' },
            lineLayer,
          );
          lines.push({ el: line, x1, y1, x2, y2 });
        }
      }

      // 차례 A
      scene.orderA.forEach((row, i) => {
        rowCard(svg, L, row, L.aCardX, L.slotY(i), { stroke: colors.border });
      });

      // 차례 B — 옮겨 앉은 줄들
      const twin = scene.merged !== null ? scene.merged.twin : null;
      const bRows: SVGGElement[] = [];
      if (scene.moves !== null) {
        scene.orderB.forEach((row, i) => {
          const hit = scene.merged !== null && twin === i;
          bRows.push(
            rowCard(svg, L, row, L.bCardX, L.slotY(i), {
              stroke: hit ? colors.accent : colors.border,
              width: hit ? 2 : 1,
            }),
          );
        });
      }

      // 들어오는 줄 — 기다리는 자리에 있거나, 같은 줄이 없어 그 자리에 더해졌다
      let incoming: SVGGElement | null = null;
      const waitSlot = scene.orderB.length;
      if (scene.entered !== null && (scene.merged === null || scene.merged.twin === null)) {
        const joined = scene.merged !== null;
        incoming = rowCard(svg, L, scene.incoming, L.bCardX, L.slotY(waitSlot), {
          stroke: colors.accent,
          dashed: !joined,
          width: 2,
        });
        label(svg, L.bCardX + L.cardW + NUM_W / 2, L.slotY(waitSlot) + L.cardH / 2, joined ? String(waitSlot + 1) : '+', {
          anchor: 'middle',
          size: fontSizes.xs,
          fill: joined ? colors.textMuted : colors.accent,
        });
      }

      // 캡션 — 지금 일어나는 일 한 줄, 판정 한 줄
      const capY = H - CAPTION_H + 22;
      label(svg, W / 2, capY, caption(scene), { anchor: 'middle', size: fontSizes.md });
      const same = scene.merged !== null ? scene.merged.same : scene.match !== null ? scene.match.same : null;
      if (same !== null) {
        label(
          svg,
          W / 2,
          capY + 24,
          same ? t('verdict.same', 'Same relation as A') : t('verdict.differ', 'Not the same relation as A'),
          { anchor: 'middle', size: fontSizes.sm, weight: 600, fill: same ? colors.success : colors.danger },
        );
      }

      return { bRows, lines, incoming };
    }

    function caption(scene: SetOfRowsScene): string {
      switch (scene.step) {
        case 'start':
          return t('caption.start', 'The rows of the relation, listed in order A.');
        case 'move':
          return t('caption.move', 'The same rows take their seats in order B.');
        case 'match': {
          const m = scene.match;
          if (m === null) throw new Error('set-of-rows 무대: match 걸음에 짝이 없다');
          return t('caption.match', 'Rows of A found in B: {x}/{n} · Rows of B found in A: {y}/{m}', {
            x: m.aInB,
            n: m.aSize,
            y: m.bInA,
            m: m.bSize,
          });
        }
        case 'enter':
          return t('caption.enter', 'Inserted once more: {row}', { row: rowText(scene.incoming) });
        case 'merge': {
          const g = scene.merged;
          if (g === null) throw new Error('set-of-rows 무대: merge 걸음에 결과가 없다');
          return g.twin !== null
            ? t('caption.merge', 'It lands on the equal row and becomes one. Rows: {before} → {after}', {
                before: g.before,
                after: g.after,
              })
            : t('caption.join', 'No equal row, so it is added. Rows: {before} → {after}', {
                before: g.before,
                after: g.after,
              });
        }
      }
    }

    function frame(): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    /** 0→1 진행을 한 시계로 흘린다. 세대가 바뀌면 곧바로 물러난다. */
    async function tween(mine: number, ms: number, draw: (p: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
      draw(0);
      for (let i = 1; i <= frames; i += 1) {
        await frame();
        if (mine !== gen || destroyed) return false;
        draw(i / frames);
      }
      return true;
    }

    async function animateMove(mine: number, scene: SetOfRowsScene, h: Handles): Promise<boolean> {
      const moves = scene.moves;
      if (moves === null) return true;
      const L = layoutFor(scene);
      const dx = L.aCardX - L.bCardX;
      const total = MOVE_MS + MOVE_STAGGER_MS * (moves.length - 1);
      return tween(mine, total, (p) => {
        const now = p * total;
        for (const m of moves) {
          const g = h.bRows[m.to];
          if (g === undefined) throw new Error(`set-of-rows 무대: B 의 ${m.to} 자리에 줄이 없다`);
          const local = Math.min(1, Math.max(0, (now - m.from * MOVE_STAGGER_MS) / MOVE_MS));
          const q = ease(local);
          const left = 1 - q;
          const dy = L.slotY(m.from) - L.slotY(m.to);
          const lift = -LIFT_PX * Math.sin(Math.PI * q);
          g.setAttribute('transform', `translate(${r1(dx * left)} ${r1(dy * left + (local >= 1 ? 0 : lift))})`);
        }
      });
    }

    async function animateLines(mine: number, h: Handles): Promise<boolean> {
      return tween(mine, LINE_MS, (p) => {
        const q = ease(p);
        for (const ln of h.lines) {
          ln.el.setAttribute('x2', String(r1(ln.x1 + (ln.x2 - ln.x1) * q)));
          ln.el.setAttribute('y2', String(r1(ln.y1 + (ln.y2 - ln.y1) * q)));
        }
      });
    }

    async function animateEnter(mine: number, h: Handles): Promise<boolean> {
      const g = h.incoming;
      if (g === null) return true;
      const L0 = PIECE_CANVAS_W;
      return tween(mine, ENTER_MS, (p) => {
        const left = 1 - ease(p);
        g.setAttribute('transform', `translate(${r1(L0 * 0.45 * left)} ${r1(LIFT_PX * left)})`);
      });
    }

    async function animateMerge(mine: number, scene: SetOfRowsScene, h: Handles): Promise<boolean> {
      const g = scene.merged;
      if (g === null) return true;
      const L = layoutFor(scene);
      if (g.twin === null) {
        // 같은 줄이 없으면 기다리던 자리에 그대로 더해진다 — 제자리에서 한 번 눌러 앉는다
        const row = h.incoming;
        if (row === null) return true;
        return tween(mine, MERGE_MS * 0.5, (p) => {
          row.setAttribute('transform', `translate(0 ${r1(-6 * Math.sin(Math.PI * p))})`);
        });
      }
      // 포개지는 줄은 정적 화면에 없다 — 운동 동안만 떠 있는 사본을 세운다
      const floating = rowCard(svg, L, scene.incoming, L.bCardX, L.slotY(g.twin), {
        stroke: colors.accent,
        dashed: true,
        width: 2,
      });
      const dy = L.slotY(scene.orderB.length) - L.slotY(g.twin);
      return tween(mine, MERGE_MS, (p) => {
        const q = ease(Math.min(1, p / 0.8));
        const left = 1 - q;
        // 옆으로 조금 비켜 올라가다가 같은 줄 위에 정확히 내려앉는다
        const side = 18 * Math.sin(Math.PI * q);
        floating.setAttribute('transform', `translate(${r1(side)} ${r1(dy * left)})`);
        const fade = p <= 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
        floating.setAttribute('opacity', String(r1(fade)));
      });
    }

    async function render(
      next: SetOfRowsScene,
      prev: SetOfRowsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || prev === null || prev.step === next.step) return;
      let done = true;
      switch (next.step) {
        case 'move':
          done = await animateMove(mine, next, h);
          break;
        case 'match':
          done = await animateLines(mine, h);
          break;
        case 'enter':
          done = await animateEnter(mine, h);
          break;
        case 'merge':
          done = await animateMerge(mine, next, h);
          break;
        case 'start':
          break;
      }
      if (!done || mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
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
