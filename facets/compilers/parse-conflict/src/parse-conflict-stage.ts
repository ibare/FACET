/**
 * parse-conflict stage — 한 칸에서 두 갈래로 갈라진다.
 *
 * 위: 문법 두 줄과 원문. 가운데: 스택과 남은 입력 — 밀기는 토큰 칸이 입력에서 스택으로
 * 건너가고, 접기는 몸의 칸들이 한데 모여 왼쪽 기호 하나로 접힌다. 충돌 걸음에서는 스택 쪽에서
 * 접기가, 다음 토큰 쪽에서 밀기가 내려와 **한 칸에 겹친다**. 그 칸에서 두 가지가 뻗어 내려가
 * 갈래마다 같은 토큰 다섯 위에 다른 나무가 선다.
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
import { findRule, itemText, ruleText, tokenLabel, type BranchAct, type ConflictAction, type TreeNode } from './algorithm.js';
import type { Branch, ParseConflictScene } from './scene.js';

const H = 540;
const W = PIECE_CANVAS_W;
const M = 24;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MS_SHIFT = 380;
const MS_REDUCE = 360;
const MS_CONFLICT = 400;
const MS_BRANCH = 400;
const FRAME_MS = 16;

const PX_XS = parseFloat(fontSizes.xs);
const PX_SM = parseFloat(fontSizes.sm);
const PX_MD = parseFloat(fontSizes.md);
const PX_LG = parseFloat(fontSizes.lg);
const MONO_RATIO = 0.6;

function num(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자권 · 데바나가리 등)는 한 칸, 라틴은 0.58 칸. */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x0900 ? px : px * 0.58;
  return w;
}

function ease(p: number): number {
  return 1 - (1 - p) ** 3;
}

type Geo = {
  slot: number;
  cw: number;
  stackX: (j: number) => number;
  inX: (i: number) => number;
  divX: number;
  cellY: number;
  cellH: number;
  box: { x: number; y: number; w: number; h: number; rowH: number; actCol: number };
  panelY: number;
  panelBottom: number;
  panels: { x: number; w: number }[];
};

function layout(scene: ParseConflictScene): Geo {
  const nIn = scene.tokens.length;
  const nStack = nIn - 1;
  const gapMid = 20;
  const slot = Math.min(58, (W - 2 * M - gapMid) / (nStack + nIn));
  const cw = slot - 6;
  const stackX = (j: number) => M + j * slot;
  const inX = (i: number) => M + nStack * slot + gapMid + i * slot;
  const divX = M + nStack * slot + gapMid / 2;
  const monoW = PX_SM * MONO_RATIO;
  let itemChars = 0;
  for (const a of scene.conflict ?? []) for (const it of a.items) itemChars = Math.max(itemChars, itemText(scene.rules, it).length);
  const actCol = 118;
  const bw = Math.min(W - 2 * M, actCol + Math.max(itemChars, 18) * monoW + 32);
  const rowH = 28;
  const box = { x: (W - bw) / 2, y: 176, w: bw, h: rowH * 2 + 6, rowH, actCol };
  const half = (W - 2 * M - 20) / 2;
  return {
    slot,
    cw,
    stackX,
    inX,
    divX,
    cellY: 98,
    cellH: 40,
    box,
    panelY: 256,
    panelBottom: H - 50,
    panels: [
      { x: M, w: half },
      { x: M + half + 20, w: half },
    ],
  };
}

function forkX(g: Geo, choice: number): number {
  return g.box.x + g.box.w * (choice === 0 ? 0.3 : 0.7);
}

export const parseConflictStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
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
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      parent.appendChild(node);
      return node;
    }
    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { px: number; mono?: boolean; fill?: string; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.px,
          fill: o.fill ?? c.text,
          'text-anchor': o.anchor ?? 'start',
        },
        parent,
      );
      if (o.weight) node.setAttribute('font-weight', o.weight);
      node.setAttribute('xml:space', 'preserve');
      node.textContent = s;
      return node;
    }

    function actLabel(a: ConflictAction | BranchAct): string {
      if (a.kind === 'reduce') return t('act.reduce', 'reduce {rule}', { rule: a.rule });
      if (a.kind === 'shift') return t('act.shift', 'shift');
      return t('act.accept', 'accept');
    }

    type Refs = {
      stackCells: SVGGElement[];
      rows: SVGGElement[];
      forks: SVGLineElement[];
      panels: SVGGElement[];
      anim: SVGGElement;
    };

    // ---------------------------------------------------------------- 정적 그리기

    function drawCell(parent: Element, x: number, y: number, w: number, h: number, big: string, small: string | null, o: { stroke: string; width: number; fill: string; muted?: boolean }): SVGGElement {
      const g = el('g', {}, parent);
      el('rect', { x, y, width: w, height: h, rx: 4, fill: o.fill, stroke: o.stroke, 'stroke-width': o.width }, g);
      text(g, x + w / 2, small === null ? y + h / 2 + 5 : y + h / 2 + 1, big, {
        px: PX_MD,
        mono: true,
        anchor: 'middle',
        fill: o.muted ? c.textMuted : c.text,
      });
      if (small !== null) text(g, x + w / 2, y + h - 6, small, { px: PX_XS, mono: true, anchor: 'middle', fill: c.textMuted });
      return g;
    }

    function drawTree(parent: Element, tree: TreeNode, px: number, pw: number, topY: number, leafY: number): void {
      const leaves: TreeNode[] = [];
      const levelOf = new Map<TreeNode, number>();
      const walk = (n: TreeNode): number => {
        if (n.kids.length === 0) {
          leaves.push(n);
          levelOf.set(n, 0);
          return 0;
        }
        const lv = 1 + Math.max(...n.kids.map(walk));
        levelOf.set(n, lv);
        return lv;
      };
      const top = walk(tree);
      const span = pw / leaves.length;
      const dy = Math.min(44, (leafY - topY) / Math.max(1, top));
      const pos = new Map<TreeNode, { x: number; y: number }>();
      const place = (n: TreeNode): number => {
        const lv = levelOf.get(n)!;
        let x: number;
        if (n.kids.length === 0) x = px + (leaves.indexOf(n) + 0.5) * span;
        else {
          const xs = n.kids.map(place);
          x = xs.length % 2 === 1 ? xs[(xs.length - 1) / 2]! : (xs[0]! + xs[xs.length - 1]!) / 2;
        }
        pos.set(n, { x, y: leafY - lv * dy });
        return x;
      };
      place(tree);
      const edges = el('g', {}, parent);
      const nodes = el('g', {}, parent);
      const bw = 40;
      const bh = 20;
      const drawNode = (n: TreeNode) => {
        const p = pos.get(n)!;
        for (const k of n.kids) {
          const q = pos.get(k)!;
          el('line', { x1: p.x, y1: p.y + bh / 2, x2: q.x, y2: k.kids.length === 0 ? q.y - 13 : q.y - bh / 2, stroke: c.border, 'stroke-width': 1.5 }, edges);
          drawNode(k);
        }
        if (n.kids.length === 0) {
          if (n.text === null) throw new Error(`parse-conflict stage: 원문 없는 잎 (${n.sym})`);
          text(nodes, p.x, p.y + 5, n.text, { px: PX_LG, mono: true, anchor: 'middle' });
          return;
        }
        const root = n === tree;
        el('rect', {
          x: p.x - bw / 2,
          y: p.y - bh / 2,
          width: bw,
          height: bh,
          rx: 4,
          fill: root ? c.accent : c.bg,
          stroke: root ? c.accent : c.textMuted,
          'stroke-width': 1.2,
        }, nodes);
        text(nodes, p.x, p.y + 4, n.sym, { px: PX_XS, mono: true, anchor: 'middle', fill: root ? c.stateInk : c.text });
        if (n.kids.length > 1 && n.value !== null) {
          text(nodes, p.x + bw / 2 + 5, p.y + 4, t('label.value', '= {v}', { v: n.value }), {
            px: PX_SM,
            mono: true,
            fill: root ? c.text : c.textMuted,
            weight: root ? '600' : '400',
          });
        }
      };
      drawNode(tree);
    }

    function drawBranch(parent: Element, s: ParseConflictScene, g: Geo, b: Branch): SVGGElement {
      const conflict = s.conflict!;
      const pn = g.panels[b.choice]!;
      const root = el('g', {}, parent);
      el('rect', {
        x: pn.x,
        y: g.panelY,
        width: pn.w,
        height: g.panelBottom - g.panelY,
        rx: 6,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1.2,
        'stroke-dasharray': '5 4',
      }, root);
      // 머리 — 고른 동작
      const head = t('label.ifChosen', 'If chosen: {act}', { act: actLabel(conflict[b.choice]!) });
      const hw = textWidth(head, PX_SM) + 20;
      el('rect', { x: pn.x + 10, y: g.panelY + 10, width: hw, height: 22, rx: 11, fill: c.accent }, root);
      text(root, pn.x + 20, g.panelY + 25, head, { px: PX_SM, fill: c.stateInk, weight: '600' });
      // 남은 동작 칩
      const chipY = g.panelY + 42;
      let cx = pn.x + 10;
      b.actions.forEach((a, i) => {
        const label = a.kind === 'shift' ? tokenLabel(s.tokens[a.token]!) : a.kind === 'reduce' ? a.rule : t('act.accept', 'accept');
        const w = Math.max(24, textWidth(label, PX_SM) + 14);
        const first = i === 0;
        el('rect', {
          x: cx,
          y: chipY,
          width: w,
          height: 20,
          rx: a.kind === 'shift' ? 2 : 10,
          fill: first ? c.accent : a.kind === 'reduce' ? c.bgSubtle : c.bg,
          stroke: first ? c.accent : c.textMuted,
          'stroke-width': 1,
        }, root);
        text(root, cx + w / 2, chipY + 14, label, { px: PX_SM, mono: a.kind !== 'accept', anchor: 'middle', fill: first ? c.stateInk : c.text });
        cx += w + 5;
      });
      drawTree(root, b.tree, pn.x + 6, pn.w - 44, g.panelY + 90, g.panelBottom - 42);
      text(root, pn.x + pn.w / 2, g.panelBottom - 14, t('label.group', '{group} = {v}', { group: b.group, v: b.value }), {
        px: PX_MD,
        mono: true,
        anchor: 'middle',
        weight: '600',
      });
      return root;
    }

    function drawStatic(s: ParseConflictScene): Refs {
      svg.textContent = '';
      const g = layout(s);
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);

      // 문법 · 원문
      s.rules.forEach((r, i) => {
        text(svg, M, 30 + i * 22, r.id, { px: PX_SM, mono: true, fill: c.textMuted });
        text(svg, M + 30, 30 + i * 22, ruleText(r), { px: PX_MD, mono: true });
      });
      text(svg, W - M, 26, t('label.source', 'Source'), { px: PX_XS, fill: c.textMuted, anchor: 'end' });
      text(svg, W - M, 50, s.source, { px: PX_LG, mono: true, anchor: 'end' });

      // 스택 · 남은 입력
      text(svg, M, g.cellY - 10, t('label.stack', 'Stack'), { px: PX_XS, fill: c.textMuted });
      text(svg, g.inX(0), g.cellY - 10, t('label.input', 'Remaining input'), { px: PX_XS, fill: c.textMuted });
      el('line', { x1: g.divX, y1: g.cellY - 4, x2: g.divX, y2: g.cellY + g.cellH + 4, stroke: c.border, 'stroke-width': 1.5 }, svg);
      const stackCells = s.stack.map((cell, j) =>
        drawCell(svg, g.stackX(j), g.cellY, g.cw, g.cellH, cell.sym, cell.text !== null && cell.text !== cell.sym ? cell.text : null, {
          stroke: c.text,
          width: 1.2,
          fill: c.bgSubtle,
        }),
      );
      s.tokens.forEach((tok, i) => {
        if (i < s.pos) return;
        const next = i === s.pos;
        drawCell(svg, g.inX(i), g.cellY, g.cw, g.cellH, tokenLabel(tok), tok.text === '' ? null : tok.kind, {
          stroke: next ? c.itemComparing : c.border,
          width: next ? 2.2 : 1,
          fill: c.bg,
          muted: tok.text === '',
        });
        if (next) {
          text(svg, g.inX(i) + g.cw / 2, g.cellY + g.cellH + 16, t('label.next', 'next'), {
            px: PX_XS,
            fill: c.itemComparing,
            anchor: 'middle',
            weight: '600',
          });
        }
      });

      // 충돌 칸
      const rows: SVGGElement[] = [];
      const forks: SVGLineElement[] = [];
      const panels: SVGGElement[] = [];
      if (s.conflict) {
        const b = g.box;
        text(svg, W / 2, b.y - 8, t('label.cell', 'Table cell · next {la}', { la: tokenLabel(s.tokens[s.pos]!) }), {
          px: PX_XS,
          fill: c.danger,
          anchor: 'middle',
          weight: '600',
        });
        el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6, fill: c.bgSubtle, stroke: c.danger, 'stroke-width': 2 }, svg);
        el('line', { x1: b.x + 8, y1: b.y + 3 + b.rowH, x2: b.x + b.w - 8, y2: b.y + 3 + b.rowH, stroke: c.border, 'stroke-width': 1 }, svg);
        s.conflict.forEach((a, r) => {
          const row = el('g', {}, svg);
          const y = b.y + 3 + r * b.rowH + b.rowH / 2 + 5;
          text(row, b.x + 14, y, actLabel(a), { px: PX_SM, weight: '600' });
          text(row, b.x + 14 + b.actCol, y, a.items.map((it) => itemText(s.rules, it)).join('   '), { px: PX_SM, mono: true, fill: c.textMuted });
          rows.push(row);
        });
        // 갈래
        const forkLayer = el('g', {}, svg);
        for (const br of s.branches) {
          const pn = g.panels[br.choice]!;
          const x1 = forkX(g, br.choice);
          forks.push(
            el('line', {
              x1,
              y1: b.y + b.h,
              x2: pn.x + pn.w / 2,
              y2: g.panelY,
              stroke: c.textMuted,
              'stroke-width': 1.8,
            }, forkLayer),
          );
          panels.push(drawBranch(svg, s, g, br));
        }
      }

      // 캡션
      const [line1, line2] = caption(s);
      text(svg, W / 2, line2 === null ? H - 18 : H - 30, line1, { px: PX_MD, anchor: 'middle' });
      if (line2 !== null) text(svg, W / 2, H - 10, line2, { px: PX_MD, anchor: 'middle', weight: '600' });

      const anim = el('g', {}, svg);
      return { stackCells, rows, forks, panels, anim };
    }

    function caption(s: ParseConflictScene): [string, string | null] {
      const st = s.step;
      const la = tokenLabel(s.tokens[s.pos]!);
      switch (st.kind) {
        case 'start':
          return [t('caption.start', 'Nothing done yet. Remaining input: {n}', { n: s.tokens.length - s.pos }), null];
        case 'shift':
          return [t('caption.shift', 'Next {la}: shift. Stack cells: {s}', { la: tokenLabel(s.tokens[st.token]!), s: s.stack.length }), null];
        case 'reduce':
          findRule(s.rules, st.rule);
          return [t('caption.reduce', 'Next {la}: reduce {rule}. Stack cells: {s}', { la, rule: st.rule, s: s.stack.length }), null];
        case 'conflict':
          return [
            t('caption.conflict', 'Stack {stack}, next {la}. Actions in one cell: {n} — {acts}', {
              stack: s.stack.map((x) => x.sym).join(' '),
              la,
              n: s.conflict!.length,
              acts: s.conflict!.map(actLabel).join(' · '),
            }),
            null,
          ];
        case 'branch': {
          const b = s.branches[st.choice]!;
          const first = t('caption.branch', 'If the parser chose {act}: remaining actions: {n}. Value: {v}', {
            act: actLabel(s.conflict![st.choice]!),
            n: b.actions.length,
            v: b.value,
          });
          if (s.branches.length < 2) return [first, null];
          return [
            first,
            t('caption.compare', 'Groupings: {ga} · {gb}. Values: {a} · {b}', {
              ga: s.branches[0]!.group,
              gb: s.branches[1]!.group,
              a: s.branches[0]!.value,
              b: s.branches[1]!.value,
            }),
          ];
        }
      }
    }

    // ---------------------------------------------------------------- 운동

    function tween(mine: number, ms: number, frame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const n = Math.max(1, Math.round(ms / FRAME_MS));
        let k = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const done = () => {
          if (timer !== null) {
            clearTimeout(timer);
            timers.delete(timer);
            timer = null;
          }
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = () => {
          if (timer !== null) timers.delete(timer);
          timer = null;
          if (destroyed || mine !== gen) return done();
          k += 1;
          frame(ease(k / n));
          if (k >= n) return done();
          timer = setTimeout(tick, FRAME_MS);
          timers.add(timer);
        };
        frame(0);
        timer = setTimeout(tick, FRAME_MS);
        timers.add(timer);
      });
    }

    function motion(s: ParseConflictScene, refs: Refs, mine: number): Promise<void> | null {
      const g = layout(s);
      const st = s.step;
      if (st.kind === 'shift') {
        const cell = refs.stackCells[refs.stackCells.length - 1];
        if (!cell) throw new Error('parse-conflict stage: 민 칸이 없다');
        const dx = g.inX(st.token) - g.stackX(s.stack.length - 1);
        return tween(mine, MS_SHIFT, (e) => {
          const lift = Math.sin(Math.PI * e) * 14;
          cell.setAttribute('transform', `translate(${num(dx * (1 - e))} ${num(-lift)})`);
        });
      }
      if (st.kind === 'reduce') {
        const top = refs.stackCells[refs.stackCells.length - 1];
        if (!top) throw new Error('parse-conflict stage: 접은 칸이 없다');
        const at = s.stack.length - 1;
        const popped = st.before.slice(at);
        const tx = g.stackX(at);
        const ghostNodes = popped.map((cell) =>
          drawCell(refs.anim, 0, g.cellY, g.cw, g.cellH, cell.sym, cell.text !== null && cell.text !== cell.sym ? cell.text : null, {
            stroke: c.textMuted,
            width: 1,
            fill: c.bg,
          }),
        );
        const cy = g.cellY + g.cellH / 2;
        const cx = tx + g.cw / 2;
        return tween(mine, MS_REDUCE, (e) => {
          ghostNodes.forEach((gn, k) => {
            const from = g.stackX(at + k);
            const x = from + (tx - from) * e;
            const sx = 1 - 0.7 * e;
            gn.setAttribute('transform', `translate(${num(x + g.cw / 2)} ${num(cy)}) scale(${num(sx)} 1) translate(${num(-g.cw / 2)} ${num(-cy)})`);
            gn.setAttribute('opacity', num(1 - e));
          });
          const sy = 0.15 + 0.85 * e;
          top.setAttribute('transform', `translate(${num(cx)} ${num(cy)}) scale(1 ${num(sy)}) translate(${num(-cx)} ${num(-cy)})`);
        });
      }
      if (st.kind === 'conflict') {
        const b = g.box;
        const rowCx = b.x + b.w / 2;
        const handleX = (g.stackX(0) + g.stackX(s.stack.length - 1) + g.cw) / 2;
        const laX = g.inX(s.pos) + g.cw / 2;
        const from = [handleX, laX];
        return tween(mine, MS_CONFLICT, (e) => {
          refs.rows.forEach((row, r) => {
            const rowY = b.y + 3 + r * b.rowH + b.rowH / 2;
            const dx = from[r]! - rowCx;
            const dy = g.cellY + g.cellH / 2 - rowY;
            row.setAttribute('transform', `translate(${num(dx * (1 - e))} ${num(dy * (1 - e))})`);
            row.setAttribute('opacity', num(0.3 + 0.7 * e));
          });
        });
      }
      if (st.kind === 'branch') {
        const line = refs.forks[st.choice];
        const panel = refs.panels[st.choice];
        if (!line || !panel) throw new Error('parse-conflict stage: 갈래 그림이 없다');
        const x1 = forkX(g, st.choice);
        const y1 = g.box.y + g.box.h;
        const pn = g.panels[st.choice]!;
        const x2 = pn.x + pn.w / 2;
        const y2 = g.panelY;
        const pcx = x2;
        const pcy = (g.panelY + g.panelBottom) / 2;
        return tween(mine, MS_BRANCH, (e) => {
          line.setAttribute('x2', num(x1 + (x2 - x1) * e));
          line.setAttribute('y2', num(y1 + (y2 - y1) * e));
          const ox = x1 + (pcx - x1) * e;
          const oy = y1 + (pcy - y1) * e;
          const sc = 0.12 + 0.88 * e;
          panel.setAttribute('transform', `translate(${num(ox)} ${num(oy)}) scale(${num(sc)}) translate(${num(-pcx)} ${num(-pcy)})`);
        });
      }
      return null;
    }

    return {
      render(next: ParseConflictScene, prev: ParseConflictScene | null, opts: { animate: boolean }): void | Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const refs = drawStatic(next);
        if (!opts.animate || prev === null) return;
        const run = motion(next, refs, mine);
        if (run === null) return;
        return run.then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
        });
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
