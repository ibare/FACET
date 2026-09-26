/**
 * birthday-paradox stage — 왼쪽은 앉은 입력들과 그들 사이의 짝(현), 오른쪽은 해시 자리 256 칸.
 *
 * 동사는 "불어난다" — 새 입력이 둘레 밖에서 제자리로 들어오며, 앉아 있던 입력 모두에게
 * 현을 한꺼번에 뻗는다. 현의 수가 곧 짝의 수다. 자리 칸은 거의 빈 채로 남는다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { BirthdayParadoxScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 360;
const W = PIECE_CANVAS_W;
/** 운동 길이 — 걸음 열여섯이 20 초 안에 들도록 250 안쪽 */
const MOTION_MS = 240;
const FRAME_MS = 16;
const GRID_COLS = 16;

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
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  parent.appendChild(node);
  return node;
}

type Point = { x: number; y: number };

type Layout = {
  cx: number;
  cy: number;
  r: number;
  gridX: number;
  gridY: number;
  cell: number;
  gridW: number;
};

function layoutFor(): Layout {
  const leftW = Math.round(W * 0.56);
  const cy = 196;
  const r = Math.min(120, (leftW - 120) / 2, (H - 150) / 2);
  const cx = leftW / 2 + 4;
  const rightW = W - 16 - leftW;
  const cell = Math.min(15, Math.floor((rightW - 8) / GRID_COLS));
  const gridW = cell * GRID_COLS;
  return { cx, cy, r, gridX: leftW + (rightW - gridW) / 2, gridY: cy - gridW / 2, cell, gridW };
}

function angleOf(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / n;
}

function pointOn(L: Layout, i: number, n: number, radius: number): Point {
  const a = angleOf(i, n);
  return { x: L.cx + radius * Math.cos(a), y: L.cy + radius * Math.sin(a) };
}

type Motion = {
  group: SVGGElement;
  /** 새 입력이 들어오기 시작하는 곳과 제자리의 차 */
  offset: Point;
  home: Point;
  chords: { line: SVGLineElement; to: Point }[];
  /** 새로 차는 칸. 겹치는 걸음에는 없다 */
  cell: { rect: SVGRectElement; x: number; y: number; s: number } | null;
};

export const birthdayParadoxStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const L = layoutFor();

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawStatic(scene: BirthdayParadoxScene): Motion | null {
      svg.textContent = '';
      const n = scene.names.length;
      const step = scene.step;
      const newest = step.kind === 'start' ? -1 : step.index;
      const coll = scene.collision;

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (step.kind === 'start') {
        caption = t('caption.start', 'Empty slots: {n}. Inputs go in one at a time.', { n: scene.size });
      } else if (step.kind === 'enter') {
        const name = scene.names[step.index];
        const slot = scene.slots[step.index];
        if (name === undefined || slot === undefined) throw new Error(`birthday-paradox-stage: 입력 ${step.index} 가 바탕에 없다`);
        caption = t('caption.enter', '{name} → slot {slot} · new pairs: {n}', { name, slot, n: step.newPairs });
      } else {
        const name = scene.names[step.index];
        const other = scene.names[step.other];
        const slot = scene.slots[step.index];
        if (name === undefined || other === undefined || slot === undefined) {
          throw new Error(`birthday-paradox-stage: 겹친 입력 ${step.index} · ${step.other} 가 바탕에 없다`);
        }
        caption = t('caption.collide', 'Collision: {name} → slot {slot}, already taken by {other}', {
          name,
          slot,
          other,
        });
      }
      const cap = el(svg, 'text', {
        x: W / 2,
        y: 30,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': step.kind === 'collide' ? 700 : 400,
        fill: step.kind === 'collide' ? colors.danger : colors.text,
      });
      cap.textContent = caption;

      // 둘레 — 입력이 앉을 원
      el(svg, 'circle', {
        cx: L.cx,
        cy: L.cy,
        r: L.r,
        fill: 'none',
        stroke: colors.border,
        'stroke-dasharray': '2 5',
      });

      const at = (i: number): Point => pointOn(L, i, n, L.r);

      // 짝 — 앉은 입력 사이의 현. 이번 걸음에 생긴 현은 위에, 겹친 짝은 맨 위에
      const oldLayer = el(svg, 'g', {});
      const newLayer = el(svg, 'g', {});
      const chords: Motion['chords'] = [];
      let collisionLine: { line: SVGLineElement; to: Point } | null = null;
      for (const [a, b] of scene.pairs) {
        const pa = at(a);
        const pb = at(b);
        const isNew = b === newest;
        const isColl = coll !== null && a === coll.a && b === coll.b;
        const line = el(isNew ? newLayer : oldLayer, 'line', {
          x1: pb.x,
          y1: pb.y,
          x2: pa.x,
          y2: pa.y,
          stroke: isColl ? colors.danger : isNew ? colors.itemActive : colors.textMuted,
          'stroke-width': isColl ? 2.5 : isNew ? 1.4 : 0.8,
          'stroke-opacity': isColl || isNew ? 1 : 0.45,
        });
        if (isNew) chords.push({ line, to: pa });
        if (isColl) collisionLine = { line, to: pa };
      }
      if (collisionLine !== null) newLayer.appendChild(collisionLine.line);

      // 앉은 입력
      let motionGroup: SVGGElement | null = null;
      for (let i = 0; i < scene.seated; i += 1) {
        const name = scene.names[i];
        const slot = scene.slots[i];
        if (name === undefined || slot === undefined) throw new Error(`birthday-paradox-stage: 입력 ${i} 가 바탕에 없다`);
        const p = at(i);
        const inColl = coll !== null && (i === coll.a || i === coll.b);
        const isNew = i === newest;
        const g = el(svg, 'g', {});
        el(g, 'circle', {
          cx: p.x,
          cy: p.y,
          r: isNew || inColl ? 6 : 4.5,
          fill: inColl ? colors.danger : isNew ? colors.itemActive : colors.text,
          stroke: colors.bg,
          'stroke-width': 1.5,
        });
        const a = angleOf(i, n);
        const cos = Math.cos(a);
        const lx = L.cx + (L.r + 12) * cos;
        const ly = L.cy + (L.r + 12) * Math.sin(a) + 4;
        const label = el(g, 'text', {
          x: lx,
          y: ly,
          'text-anchor': cos > 0.1 ? 'start' : cos < -0.1 ? 'end' : 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': inColl ? 700 : 400,
          fill: inColl ? colors.danger : colors.text,
        });
        const nameSpan = el(label, 'tspan', {});
        nameSpan.textContent = name;
        const slotSpan = el(label, 'tspan', { dx: 4, fill: inColl ? colors.danger : colors.textMuted });
        slotSpan.textContent = String(slot);
        if (isNew) motionGroup = g;
      }

      // 해시 자리 — 256 칸, 대부분 빈 채
      const slotsTitle = el(svg, 'text', {
        x: L.gridX,
        y: L.gridY - 8,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      slotsTitle.textContent = t('label.slots', 'Hash slots: {n}', { n: scene.size });
      const taken = new Set<number>(scene.taken);
      const rows = Math.ceil(scene.size / GRID_COLS);
      const gap = 1.5;
      const s = L.cell - gap;
      let newCell: Motion['cell'] = null;
      const newSlot = newest >= 0 ? scene.slots[newest] : undefined;
      for (let k = 0; k < scene.size; k += 1) {
        const x = L.gridX + (k % GRID_COLS) * L.cell;
        const y = L.gridY + Math.floor(k / GRID_COLS) * L.cell;
        const isTaken = taken.has(k);
        const isColl = coll !== null && coll.slot === k;
        const isNew = newSlot === k;
        const rect = el(svg, 'rect', {
          x,
          y,
          width: s,
          height: s,
          rx: 1.5,
          fill: isColl ? colors.danger : isNew ? colors.itemActive : isTaken ? colors.text : colors.bgSubtle,
          stroke: isTaken || isColl ? 'none' : colors.border,
          'stroke-width': 0.6,
        });
        if (isNew && !isColl) newCell = { rect, x, y, s };
      }
      if (coll !== null) {
        // 한 칸에 둘 — 칸 둘레에 겹 테를 두른다
        const x = L.gridX + (coll.slot % GRID_COLS) * L.cell;
        const y = L.gridY + Math.floor(coll.slot / GRID_COLS) * L.cell;
        el(svg, 'rect', {
          x: x - 3,
          y: y - 3,
          width: s + 6,
          height: s + 6,
          rx: 3,
          fill: 'none',
          stroke: colors.danger,
          'stroke-width': 2,
        });
      }

      // 계기 — 입력 수 · 짝 수 · 찬 자리
      const baseY = Math.max(L.cy + L.r + 40, L.gridY + rows * L.cell + 28);
      const inputs = el(svg, 'text', {
        x: L.cx - 14,
        y: baseY,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.textMuted,
      });
      inputs.textContent = t('label.inputs', 'Inputs: {n}', { n: scene.seated });
      const pairs = el(svg, 'text', {
        x: L.cx + 14,
        y: baseY,
        'text-anchor': 'start',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': 700,
        fill: colors.text,
      });
      pairs.textContent = t('label.pairs', 'Pairs: {n}', { n: scene.pairs.length });
      const filled = el(svg, 'text', {
        x: L.gridX + L.gridW / 2,
        y: baseY,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.textMuted,
      });
      filled.textContent = t('label.filled', 'Filled: {f} / {n}', { f: scene.taken.length, n: scene.size });

      if (newest < 0) return null;
      if (motionGroup === null) throw new Error(`birthday-paradox-stage: 새 입력 ${newest} 의 손잡이가 없다`);
      const home = at(newest);
      const out = pointOn(L, newest, n, L.r + 40);
      // 겹치는 걸음에서는 칸이 이미 차 있다 — 새로 자라는 칸이 없다
      if (step.kind === 'enter' && newCell === null) {
        throw new Error(`birthday-paradox-stage: 새 입력 ${newest} 의 자리 칸이 없다`);
      }
      const cell = step.kind === 'enter' ? newCell : null;
      const allChords = collisionLine !== null ? [...chords, collisionLine] : chords;
      return {
        group: motionGroup,
        offset: { x: out.x - home.x, y: out.y - home.y },
        home,
        chords: allChords,
        cell,
      };
    }

    function frame(m: Motion, p: number): void {
      const e = 1 - (1 - p) * (1 - p);
      const dx = m.offset.x * (1 - e);
      const dy = m.offset.y * (1 - e);
      m.group.setAttribute('transform', `translate(${round(dx)} ${round(dy)})`);
      const sx = m.home.x + dx;
      const sy = m.home.y + dy;
      for (const c of m.chords) {
        c.line.setAttribute('x1', String(round(sx)));
        c.line.setAttribute('y1', String(round(sy)));
        c.line.setAttribute('x2', String(round(sx + (c.to.x - sx) * e)));
        c.line.setAttribute('y2', String(round(sy + (c.to.y - sy) * e)));
      }
      if (m.cell !== null) {
        const k = m.cell.s * e;
        const off = (m.cell.s - k) / 2;
        m.cell.rect.setAttribute('x', String(round(m.cell.x + off)));
        m.cell.rect.setAttribute('y', String(round(m.cell.y + off)));
        m.cell.rect.setAttribute('width', String(round(k)));
        m.cell.rect.setAttribute('height', String(round(k)));
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function render(
      next: BirthdayParadoxScene,
      _prev: BirthdayParadoxScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const motion = drawStatic(next);
      if (!opts.animate || motion === null) return;
      const start = Date.now();
      frame(motion, 0);
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / MOTION_MS);
        frame(motion, p);
        if (p >= 1) break;
        await wait(FRAME_MS);
      }
      if (mine !== gen || destroyed) return;
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
