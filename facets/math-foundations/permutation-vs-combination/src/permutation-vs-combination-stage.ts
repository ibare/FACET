/**
 * 순열과 조합의 무대.
 *
 * 왼쪽은 순서를 따진 줄 세우기의 판(첫 기호마다 한 줄), 오른쪽은 순서를 따지지 않는 묶음의 자리다.
 * 동사는 "모인다" — 같은 셋으로 된 줄 세우기 여섯이 판 여기저기에서 오른쪽 한 묶음으로 날아와
 * 한 테두리 안에 붙어 선다. 판에는 아직 안 모인 것만 남는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { PermutationVsCombinationScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 (ms) */
const LAY_MS = 600;
const GATHER_MS = 700;
const DIVIDE_MS = 400;

type Box = { x: number; y: number; w: number; h: number };

/** 카드 손잡이 — 운동이 자리와 크기를 덮어쓴다 */
type Card = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement };

type Layout = {
  pad: number;
  leftX: number;
  leftW: number;
  rightX: number;
  rightW: number;
  splitX: number;
  objY: number;
  headY: number;
  gridY: number;
  gridH: number;
  formulaY: number;
  captionY: number;
};

function makeLayout(): Layout {
  const W = PIECE_CANVAS_W;
  const pad = 16;
  const gap = 28;
  const leftW = Math.floor((W - 2 * pad - gap) * 0.47);
  const rightX = pad + leftW + gap;
  return {
    pad,
    leftX: pad,
    leftW,
    rightX,
    rightW: W - pad - rightX,
    splitX: pad + leftW + gap / 2,
    objY: 14,
    headY: 70,
    gridY: 84,
    gridH: 144,
    formulaY: 252,
    captionY: H - 14,
  };
}

function ease(e: number): number {
  return e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
}

function lerp(a: number, b: number, e: number): number {
  return a + (b - a) * e;
}

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function setNameOf(members: readonly string[]): string {
  return `{${members.join(',')}}`;
}

export const permutationVsCombinationStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const L = makeLayout();
    const mono = fonts.mono;
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);
    const mdPx = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /** 이번 그리기에서 줄 세우기 번호 → 카드 손잡이 */
    let cards = new Map<number, Card>();
    let enclosures = new Map<number, SVGGElement>();
    let formulas: SVGGElement | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, x: number, y: number, text: string, opts: {
      size: number;
      fill: string;
      anchor?: 'start' | 'middle' | 'end';
      family?: string;
      weight?: string;
    }): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size,
        fill: opts.fill,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'central',
      }, parent);
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    // ── 자리 셈 ────────────────────────────────────────────

    function objectBox(i: number): Box {
      const size = 26;
      return { x: L.pad + i * (size + 8), y: L.objY, w: size, h: size };
    }

    function gridShape(scene: PermutationVsCombinationScene): { cols: number; rows: number; cw: number; ch: number; px: number; py: number } {
      const laid = scene.laid;
      if (laid === null) throw new Error('permutation-vs-combination-stage: 줄 세우기 없이 판을 셈했다');
      const rows = scene.objects.length;
      const cols = Math.ceil(laid.total / rows);
      const px = L.leftW / cols;
      const py = Math.min(36, L.gridH / rows);
      const cw = Math.min(48, px - 6);
      const ch = Math.min(24, py - 8);
      return { cols, rows, cw, ch, px, py };
    }

    function gridBox(scene: PermutationVsCombinationScene, index: number): Box {
      const g = gridShape(scene);
      const col = index % g.cols;
      const row = Math.floor(index / g.cols);
      return {
        x: L.leftX + col * g.px + (g.px - g.cw) / 2,
        y: L.gridY + row * g.py + (g.py - g.ch) / 2,
        w: g.cw,
        h: g.ch,
      };
    }

    const SET_LABEL_W = 64;

    function slotBox(scene: PermutationVsCombinationScene, slot: number): Box {
      const laid = scene.laid;
      if (laid === null) throw new Error('permutation-vs-combination-stage: 줄 세우기 없이 묶음 자리를 셈했다');
      if (slot >= laid.slots) throw new Error(`permutation-vs-combination-stage: 묶음 자리 ${slot} 가 ${laid.slots} 를 넘는다`);
      const g = gridShape(scene);
      const py = Math.min(g.py, L.gridH / laid.slots);
      const h = Math.min(g.ch + 8, py - 4);
      return { x: L.rightX + SET_LABEL_W, y: L.gridY + slot * py + (py - h) / 2, w: L.rightW - SET_LABEL_W, h };
    }

    function memberBox(scene: PermutationVsCombinationScene, slot: number, k: number, size: number): Box {
      const s = slotBox(scene, slot);
      const g = gridShape(scene);
      const inner = 4;
      const gap = 2;
      const w = Math.min(g.cw, (s.w - 2 * inner - (size - 1) * gap) / size);
      const h = s.h - 2 * inner;
      return { x: s.x + inner + k * (w + gap), y: s.y + inner, w, h };
    }

    // ── 카드 ──────────────────────────────────────────────

    function placeCard(card: Card, b: Box): void {
      card.g.setAttribute('transform', `translate(${r2(b.x)},${r2(b.y)})`);
      card.rect.setAttribute('width', String(r2(b.w)));
      card.rect.setAttribute('height', String(r2(b.h)));
      card.text.setAttribute('x', String(r2(b.w / 2)));
      card.text.setAttribute('y', String(r2(b.h / 2)));
    }

    function drawCard(parent: Element, b: Box, text: string, hot: boolean, px: number): Card {
      const g = el('g', {}, parent);
      const rect = el('rect', {
        rx: 3,
        fill: hot ? colors.accent : colors.bgSubtle,
        stroke: hot ? colors.accent : colors.border,
        'stroke-width': 1,
      }, g);
      const textNode = label(g, 0, 0, text, {
        size: px,
        fill: hot ? colors.stateInk : colors.text,
        anchor: 'middle',
        family: mono,
      });
      const card: Card = { g, rect, text: textNode };
      placeCard(card, b);
      return card;
    }

    // ── 정적 그리기 (정본) ─────────────────────────────────

    function drawStatic(scene: PermutationVsCombinationScene): void {
      svg.textContent = '';
      cards = new Map();
      enclosures = new Map();
      formulas = null;

      // 물건과 고르는 수
      scene.objects.forEach((o, i) => {
        const b = objectBox(i);
        el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: b.w / 2, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, svg);
        label(svg, b.x + b.w / 2, b.y + b.h / 2, o, { size: smPx, fill: colors.text, anchor: 'middle', family: mono, weight: '600' });
      });
      const lastObj = objectBox(scene.objects.length - 1);
      label(svg, lastObj.x + lastObj.w + 16, lastObj.y + lastObj.h / 2, t('label.choose', 'Choose: {r}', { r: scene.choose }), {
        size: smPx,
        fill: colors.textMuted,
      });

      // 두 쪽 머리
      el('line', { x1: L.splitX, y1: L.headY - 12, x2: L.splitX, y2: L.gridY + L.gridH, stroke: colors.border, 'stroke-width': 1 }, svg);
      label(svg, L.leftX, L.headY, t('label.ordered', 'Order matters'), { size: smPx, fill: colors.text, weight: '600' });
      label(svg, L.rightX, L.headY, t('label.unordered', 'Order ignored'), { size: smPx, fill: colors.text, weight: '600' });

      const laid = scene.laid;
      if (laid === null) {
        drawCaption(scene);
        return;
      }
      if (scene.remaining === null) throw new Error('permutation-vs-combination-stage: 줄 세우기가 있는데 남은 수가 없다');
      label(svg, L.leftX + L.leftW, L.headY, t('label.left', 'Not yet grouped: {n}', { n: scene.remaining }), {
        size: smPx,
        fill: colors.textMuted,
        anchor: 'end',
      });
      label(svg, L.rightX + L.rightW, L.headY, t('label.groups', 'Groups: {n}', { n: scene.groups.length }), {
        size: smPx,
        fill: colors.textMuted,
        anchor: 'end',
      });

      // 판에 남은 줄 세우기
      const taken = new Set(scene.groups.flatMap((g) => g.picks));
      const gridLayer = el('g', {}, svg);
      laid.arrangements.forEach((a, i) => {
        if (taken.has(i)) return;
        cards.set(i, drawCard(gridLayer, gridBox(scene, i), a.join(''), false, smPx));
      });

      // 묶음
      const hotGroup = scene.step.kind === 'gather' ? scene.step.group : -1;
      const groupLayer = el('g', {}, svg);
      scene.groups.forEach((grp, slot) => {
        const hot = slot === hotGroup;
        const s = slotBox(scene, slot);
        const box = el('g', {}, groupLayer);
        label(box, L.rightX, s.y + s.h / 2, setNameOf(grp.members), {
          size: smPx,
          fill: colors.text,
          family: mono,
          weight: hot ? '700' : '400',
        });
        el('rect', {
          x: s.x,
          y: s.y,
          width: s.w,
          height: s.h,
          rx: 5,
          fill: 'none',
          stroke: hot ? colors.accent : colors.textMuted,
          'stroke-width': hot ? 2 : 1,
        }, box);
        enclosures.set(slot, box);
        grp.picks.forEach((i, k) => {
          const a = laid.arrangements[i];
          if (a === undefined) throw new Error(`permutation-vs-combination-stage: 줄 세우기 ${i} 가 없다`);
          cards.set(i, drawCard(groupLayer, memberBox(scene, slot, k, grp.picks.length), a.join(''), hot, xsPx));
        });
      });

      // 나눗셈의 두 수
      const d = scene.divided;
      if (d !== null) {
        formulas = el('g', {}, svg);
        label(formulas, L.leftX + L.leftW / 2, L.formulaY, t('formula.perm', 'P({n}, {r}) = {p}', { n: d.n, r: d.r, p: d.total }), {
          size: parseFloat(fontSizes.lg),
          fill: colors.text,
          anchor: 'middle',
          weight: '600',
        });
        label(formulas, L.rightX + L.rightW / 2, L.formulaY, t('formula.comb', 'C({n}, {r}) = {c}', { n: d.n, r: d.r, c: d.count }), {
          size: parseFloat(fontSizes.lg),
          fill: colors.text,
          anchor: 'middle',
          weight: '600',
        });
      }

      drawCaption(scene);
    }

    function drawCaption(scene: PermutationVsCombinationScene): void {
      let text: string;
      const step = scene.step;
      if (step.kind === 'start') {
        text = t('caption.start', 'Pick {r}: does order matter?', { r: scene.choose });
      } else if (step.kind === 'lay') {
        const laid = scene.laid;
        if (laid === null) throw new Error('permutation-vs-combination-stage: lay 걸음에 줄 세우기가 없다');
        text = t('caption.lay', 'Arrangements: {expr} = {p}', { expr: laid.factors.join(' × '), p: laid.total });
      } else if (step.kind === 'gather') {
        const grp = scene.groups[step.group];
        if (grp === undefined) throw new Error(`permutation-vs-combination-stage: 묶음 ${step.group} 가 없다`);
        text = t('caption.gather', 'Same set, different order: {k} → group {set}', {
          k: grp.picks.length,
          set: setNameOf(grp.members),
        });
      } else {
        const d = scene.divided;
        if (d === null) throw new Error('permutation-vs-combination-stage: divide 걸음에 나눗셈이 없다');
        text = t('caption.divide', '{p} ÷ {k} = {c} · group size {r}! = {k}', { p: d.total, k: d.size, c: d.count, r: d.r });
      }
      label(svg, PIECE_CANVAS_W / 2, L.captionY, text, { size: mdPx, fill: colors.text, anchor: 'middle' });
    }

    // ── 운동 ──────────────────────────────────────────────

    function tween(mine: number, ms: number, frame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const start = performance.now();
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          const raw = Math.min(1, (performance.now() - start) / ms);
          frame(ease(raw));
          if (raw >= 1) {
            done();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
        frame(0);
      });
    }

    function mustCard(i: number): Card {
      const card = cards.get(i);
      if (card === undefined) throw new Error(`permutation-vs-combination-stage: 줄 세우기 ${i} 의 카드가 없다`);
      return card;
    }

    async function animateLay(mine: number, scene: PermutationVsCombinationScene): Promise<void> {
      const laid = scene.laid;
      if (laid === null) throw new Error('permutation-vs-combination-stage: lay 운동에 줄 세우기가 없다');
      const moves = laid.arrangements.map((a, i) => {
        const first = a[0];
        const oi = first === undefined ? -1 : scene.objects.indexOf(first);
        if (oi < 0) throw new Error(`permutation-vs-combination-stage: 줄 세우기 ${i} 의 첫 기호가 물건에 없다`);
        const o = objectBox(oi);
        const to = gridBox(scene, i);
        const from: Box = { x: o.x + o.w / 2 - to.w * 0.2, y: o.y + o.h / 2 - to.h * 0.2, w: to.w * 0.4, h: to.h * 0.4 };
        return { card: mustCard(i), from, to };
      });
      await tween(mine, LAY_MS, (e) => {
        for (const m of moves) {
          placeCard(m.card, {
            x: lerp(m.from.x, m.to.x, e),
            y: lerp(m.from.y, m.to.y, e),
            w: lerp(m.from.w, m.to.w, e),
            h: lerp(m.from.h, m.to.h, e),
          });
        }
      });
    }

    async function animateGather(mine: number, scene: PermutationVsCombinationScene, slot: number): Promise<void> {
      const grp = scene.groups[slot];
      if (grp === undefined) throw new Error(`permutation-vs-combination-stage: 묶음 ${slot} 가 없다`);
      const box = enclosures.get(slot);
      if (box === undefined) throw new Error(`permutation-vs-combination-stage: 묶음 ${slot} 의 테두리가 없다`);
      const moves = grp.picks.map((i, k) => ({
        card: mustCard(i),
        from: gridBox(scene, i),
        to: memberBox(scene, slot, k, grp.picks.length),
      }));
      await tween(mine, GATHER_MS, (e) => {
        box.setAttribute('opacity', String(r2(Math.max(0, (e - 0.6) / 0.4))));
        for (const m of moves) {
          placeCard(m.card, {
            x: lerp(m.from.x, m.to.x, e),
            y: lerp(m.from.y, m.to.y, e),
            w: lerp(m.from.w, m.to.w, e),
            h: lerp(m.from.h, m.to.h, e),
          });
        }
      });
    }

    async function animateDivide(mine: number): Promise<void> {
      const f = formulas;
      if (f === null) throw new Error('permutation-vs-combination-stage: divide 운동에 두 수가 없다');
      await tween(mine, DIVIDE_MS, (e) => {
        f.setAttribute('transform', `translate(0,${r2(12 * (1 - e))})`);
        f.setAttribute('opacity', String(r2(e)));
      });
    }

    return {
      async render(next: PermutationVsCombinationScene, _prev: PermutationVsCombinationScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step.kind === 'lay') await animateLay(mine, next);
        else if (step.kind === 'gather') await animateGather(mine, next, step.group);
        else if (step.kind === 'divide') await animateDivide(mine);
        else return;
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
