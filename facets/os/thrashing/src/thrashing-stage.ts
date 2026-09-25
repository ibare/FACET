/**
 * thrashing 무대 — 메모리(프레임)와 디스크 사이를 페이지가 맴돈다.
 *
 * 가운데 고리: 위 길로 디스크 → 메모리 (가져옴), 아래 길로 메모리 → 디스크 (밀려남).
 * 걸음마다 불린 페이지가 위 길을 타고 올라오고, 같은 때 밀려난 페이지가 아래 길로 내려간다.
 * 아래 띠: 걸음마다 밀려난 것 · 참조 · 폴트를 한 칸씩 쌓고, 밀려난 칸에서 그 페이지가
 * 다시 불린 칸으로 굽은 줄을 잇는다.
 *
 * 정적 그리기(drawStatic)가 정본이다. 운동은 제자리에 아직 못 온 만큼을 transform 으로 준다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import type { ThrashingRecord, ThrashingScene } from './scene.js';

const H = 360;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 400;
const TICK_MS = 16;

const SIDE = 20;
const BOX_TOP = 110;
const BOX_BOTTOM = 238;
const TOKEN_H_MAX = 26;
const TOKEN_W_MAX = 76;

const STRIP_OUT_Y = 270;
const STRIP_REF_Y = 302;
const STRIP_FAULT_Y = 334;

type Pt = { x: number; y: number };

/** 소수 한 자리로 자르고 -0 을 0 으로. */
function q(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function bez(a: Pt, c: Pt, b: Pt, k: number): Pt {
  const u = 1 - k;
  return { x: u * u * a.x + 2 * u * k * c.x + k * k * b.x, y: u * u * a.y + 2 * u * k * c.y + k * k * b.y };
}

type Layout = {
  memX: number;
  memW: number;
  diskX: number;
  diskW: number;
  frameSlot: (k: number) => Pt;
  diskSlot: (page: string) => Pt;
  procOf: Map<string, number>;
  nProc: number;
  diskOrder: string[];
  tokenW: number;
  tokenH: number;
  frameH: number;
  diskH: number;
  midX: number;
  upperY: number;
  lowerY: number;
  cellX: (t: number) => number;
  cellW: number;
  labelX: number;
};

function layoutOf(scene: ThrashingScene): Layout {
  const memW = Math.round(W * 0.33);
  const diskW = Math.round(W * 0.3);
  const memX = SIDE;
  const diskX = W - SIDE - diskW;
  const inner = BOX_BOTTOM - BOX_TOP - 16;
  const nf = Math.max(1, scene.frames.length);
  const frameGap = 8;
  const frameH = (inner - frameGap * (nf - 1)) / nf;

  const diskOrder: string[] = [];
  const procOf = new Map<string, number>();
  scene.processes.forEach((proc, i) => {
    for (const page of proc.pages) {
      diskOrder.push(page);
      procOf.set(page, i);
    }
  });
  const nd = Math.max(1, diskOrder.length);
  const diskGap = 6;
  const diskH = (inner - diskGap * (nd - 1)) / nd;

  const tokenH = Math.min(TOKEN_H_MAX, frameH - 6, diskH - 2);
  const tokenW = Math.min(TOKEN_W_MAX, memW * 0.45, diskW * 0.5);

  const frameSlot = (k: number): Pt => ({
    x: memX + memW - 14 - tokenW / 2,
    y: BOX_TOP + 8 + k * (frameH + frameGap) + frameH / 2,
  });
  const diskSlot = (page: string): Pt => {
    const i = diskOrder.indexOf(page);
    return { x: diskX + 14 + tokenW / 2, y: BOX_TOP + 8 + Math.max(0, i) * (diskH + diskGap) + diskH / 2 };
  };

  const labelX = SIDE;
  const cellsX0 = SIDE + Math.round(W * 0.2);
  const n = Math.max(1, scene.refs.length);
  const cellW = (W - SIDE - cellsX0) / n;
  const cellX = (t: number): number => cellsX0 + (t - 1) * cellW;

  return {
    memX,
    memW,
    diskX,
    diskW,
    frameSlot,
    diskSlot,
    procOf,
    nProc: Math.max(1, scene.processes.length),
    diskOrder,
    tokenW,
    tokenH,
    frameH,
    diskH,
    midX: (memX + memW + diskX) / 2,
    upperY: BOX_TOP - 30,
    lowerY: BOX_BOTTOM + 26,
    cellX,
    cellW,
    labelX,
  };
}

export const thrashingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let tokens = new Map<string, SVGGElement>();

    function node<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(q(v)) : v);
      parent.appendChild(e);
      return e;
    }

    function label(
      s: string,
      x: number,
      y: number,
      parent: Element,
      opt: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const e = node(
        'text',
        {
          x,
          y,
          'font-family': opt.mono ? fonts.mono : fonts.body,
          'font-size': opt.size ?? fontSizes.sm,
          fill: opt.fill ?? pal.text,
          'text-anchor': opt.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opt.weight) e.setAttribute('font-weight', opt.weight);
      e.textContent = s;
      return e;
    }

    function arrowHead(at: Pt, from: Pt, color: string, parent: Element): void {
      const a = Math.atan2(at.y - from.y, at.x - from.x);
      const len = 8;
      const wing = 0.45;
      const p1 = { x: at.x - len * Math.cos(a - wing), y: at.y - len * Math.sin(a - wing) };
      const p2 = { x: at.x - len * Math.cos(a + wing), y: at.y - len * Math.sin(a + wing) };
      node(
        'polygon',
        { points: `${q(at.x)},${q(at.y)} ${q(p1.x)},${q(p1.y)} ${q(p2.x)},${q(p2.y)}`, fill: color },
        parent,
      );
    }

    function caption(scene: ThrashingScene, root: Element): void {
      const last: ThrashingRecord | undefined = scene.records[scene.records.length - 1];
      let line1: string;
      let line2 = '';
      if (!last || scene.step === 0) {
        line1 = t('caption.start', 'Shared frames: {n} — every page starts on disk.', { n: scene.frames.length });
      } else if (!last.fault) {
        line1 = t('caption.hit', 'Reference {page}: hit — already in frame {frame}.', {
          page: last.page,
          frame: last.frame.toString(16).toUpperCase(),
        });
      } else if (last.victim === null) {
        line1 = t('caption.fill', 'Reference {page}: fault — brought in to empty frame {frame}.', {
          page: last.page,
          frame: last.frame.toString(16).toUpperCase(),
        });
      } else {
        line1 = t('caption.swap', 'Reference {page}: fault — brought in to frame {frame}; pushed out to disk: {victim}', {
          page: last.page,
          frame: last.frame.toString(16).toUpperCase(),
          victim: last.victim,
        });
      }
      if (last && last.outAt !== null && last.backAfter !== null) {
        line2 = t('caption.back', 'This page was pushed out at step {at} — steps until called back: {gap}', {
          at: last.outAt,
          gap: last.backAfter,
        });
      }
      label(line1, W / 2, 20, root, { size: fontSizes.md, anchor: 'middle' });
      if (line2) label(line2, W / 2, 42, root, { fill: pal.textMuted, anchor: 'middle' });
      if (scene.refs.length > 0 && scene.step === scene.refs.length) {
        const faults = scene.records.filter((r) => r.fault).length;
        label(t('caption.end', 'References done. Faults: {f} / {r}', { f: faults, r: scene.records.length }), W / 2, 62, root, {
          anchor: 'middle',
          weight: '600',
        });
      }
    }

    function drawToken(page: string, at: Pt, L: Layout, ring: string | null, parent: Element): SVGGElement {
      const g = node('g', {}, parent);
      const colors = categorical(L.nProc);
      const proc = L.procOf.get(page);
      const stroke = proc === undefined ? pal.border : (colors[proc] ?? pal.border);
      if (ring) {
        node(
          'rect',
          {
            x: at.x - L.tokenW / 2 - 4,
            y: at.y - L.tokenH / 2 - 4,
            width: L.tokenW + 8,
            height: L.tokenH + 8,
            rx: 7,
            fill: 'none',
            stroke: ring,
            'stroke-width': 2.5,
          },
          g,
        );
      }
      node(
        'rect',
        {
          x: at.x - L.tokenW / 2,
          y: at.y - L.tokenH / 2,
          width: L.tokenW,
          height: L.tokenH,
          rx: 5,
          fill: pal.bg,
          stroke,
          'stroke-width': 2,
        },
        g,
      );
      label(page, at.x, at.y + 1, g, { mono: true, anchor: 'middle', weight: '600' });
      return g;
    }

    function drawStatic(scene: ThrashingScene): void {
      svg.textContent = '';
      tokens = new Map();
      const root = node('g', {}, svg);
      caption(scene, root);
      if (scene.frames.length === 0) return;
      const L = layoutOf(scene);
      const last = scene.step > 0 ? scene.records[scene.records.length - 1] : undefined;

      // 상자 둘
      label(t('label.memory', 'Memory'), L.memX + L.memW / 2, BOX_TOP - 12, root, {
        anchor: 'middle',
        weight: '600',
      });
      label(t('label.disk', 'Disk'), L.diskX + L.diskW / 2, BOX_TOP - 12, root, { anchor: 'middle', weight: '600' });
      node(
        'rect',
        { x: L.memX, y: BOX_TOP, width: L.memW, height: BOX_BOTTOM - BOX_TOP, rx: 8, fill: pal.bgSubtle, stroke: pal.border },
        root,
      );
      node(
        'rect',
        {
          x: L.diskX,
          y: BOX_TOP,
          width: L.diskW,
          height: BOX_BOTTOM - BOX_TOP,
          rx: 8,
          fill: pal.bgSubtle,
          stroke: pal.border,
        },
        root,
      );

      // 고리 — 위 길은 가져옴, 아래 길은 밀려남
      const upA = { x: L.diskX - 6, y: BOX_TOP + 14 };
      const upB = { x: L.memX + L.memW + 6, y: BOX_TOP + 14 };
      const upC = { x: L.midX, y: L.upperY };
      const dnA = { x: L.memX + L.memW + 6, y: BOX_BOTTOM - 14 };
      const dnB = { x: L.diskX - 6, y: BOX_BOTTOM - 14 };
      const dnC = { x: L.midX, y: L.lowerY };
      const inColor = last?.fault ? pal.accent : pal.border;
      const outColor = last?.victim ? pal.danger : pal.border;
      node(
        'path',
        {
          d: `M${q(upA.x)},${q(upA.y)} Q${q(upC.x)},${q(upC.y)} ${q(upB.x)},${q(upB.y)}`,
          fill: 'none',
          stroke: inColor,
          'stroke-width': 2,
        },
        root,
      );
      arrowHead(upB, bez(upA, upC, upB, 0.9), inColor, root);
      node(
        'path',
        {
          d: `M${q(dnA.x)},${q(dnA.y)} Q${q(dnC.x)},${q(dnC.y)} ${q(dnB.x)},${q(dnB.y)}`,
          fill: 'none',
          stroke: outColor,
          'stroke-width': 2,
        },
        root,
      );
      arrowHead(dnB, bez(dnA, dnC, dnB, 0.9), outColor, root);
      label(t('label.in', 'brought in'), L.midX, bez(upA, upC, upB, 0.5).y + 16, root, {
        anchor: 'middle',
        fill: pal.textMuted,
        size: fontSizes.xs,
      });
      label(t('label.out', 'pushed out'), L.midX, bez(dnA, dnC, dnB, 0.5).y - 16, root, {
        anchor: 'middle',
        fill: pal.textMuted,
        size: fontSizes.xs,
      });

      // 프레임 칸
      scene.frames.forEach((_held, k) => {
        const c = L.frameSlot(k);
        label(t('label.frame', 'Frame {n}', { n: k.toString(16).toUpperCase() }), L.memX + 12, c.y, root, {
          fill: pal.textMuted,
        });
        node(
          'rect',
          {
            x: c.x - L.tokenW / 2,
            y: c.y - L.tokenH / 2,
            width: L.tokenW,
            height: L.tokenH,
            rx: 5,
            fill: 'none',
            stroke: pal.border,
            'stroke-dasharray': '3 3',
          },
          root,
        );
      });

      // 디스크 칸 — 프로세스 이름(자료)과 페이지 자리
      let prevProc = -1;
      for (const page of L.diskOrder) {
        const c = L.diskSlot(page);
        const proc = L.procOf.get(page) ?? -1;
        if (proc !== prevProc) {
          const name = scene.processes[proc]?.id;
          if (name !== undefined) {
            label(name, L.diskX + L.diskW - 14, c.y, root, { mono: true, anchor: 'end', fill: pal.textMuted });
          }
          prevProc = proc;
        }
        node(
          'rect',
          {
            x: c.x - L.tokenW / 2,
            y: c.y - L.tokenH / 2,
            width: L.tokenW,
            height: L.tokenH,
            rx: 5,
            fill: 'none',
            stroke: pal.border,
            'stroke-dasharray': '3 3',
          },
          root,
        );
      }

      // 페이지 — 프레임에 있으면 프레임에, 아니면 디스크에
      const held = new Set<string>();
      scene.frames.forEach((page, k) => {
        if (page === null) return;
        held.add(page);
        const ring = last && last.page === page ? pal.accent : null;
        tokens.set(page, drawToken(page, L.frameSlot(k), L, ring, root));
      });
      for (const page of L.diskOrder) {
        if (held.has(page)) continue;
        const ring = last && last.victim === page ? pal.danger : null;
        tokens.set(page, drawToken(page, L.diskSlot(page), L, ring, root));
      }

      drawStrip(scene, L, last, root);
    }

    function drawStrip(scene: ThrashingScene, L: Layout, last: ThrashingRecord | undefined, root: Element): void {
      const outs = scene.records.filter((r) => r.victim !== null).length;
      const faults = scene.records.filter((r) => r.fault).length;
      label(t('row.out', 'Pushed out: {n}', { n: outs }), L.labelX, STRIP_OUT_Y + 8, root, { fill: pal.textMuted });
      label(t('row.ref', 'Referenced: {n}', { n: scene.records.length }), L.labelX, STRIP_REF_Y + 11, root);
      label(t('row.fault', 'Faults: {n}', { n: faults }), L.labelX, STRIP_FAULT_Y + 7, root, { fill: pal.danger });

      const pad = Math.min(3, L.cellW * 0.08);
      scene.refs.forEach((page, i) => {
        const tt = i + 1;
        const x = L.cellX(tt);
        const rec = scene.records[i];
        const current = last !== undefined && last.t === tt;
        node(
          'rect',
          {
            x: x + pad,
            y: STRIP_REF_Y,
            width: L.cellW - 2 * pad,
            height: 22,
            rx: 3,
            fill: rec ? pal.bgSubtle : 'none',
            stroke: current ? pal.accent : pal.border,
            'stroke-width': current ? 2 : 1,
          },
          root,
        );
        label(page, x + L.cellW / 2, STRIP_REF_Y + 12, root, {
          mono: true,
          anchor: 'middle',
          size: L.cellW < smPx * 3 ? fontSizes.xs : fontSizes.sm,
          fill: rec ? pal.text : pal.textMuted,
        });
        node(
          'rect',
          {
            x: x + pad,
            y: STRIP_FAULT_Y,
            width: L.cellW - 2 * pad,
            height: 14,
            rx: 2,
            fill: rec ? (rec.fault ? pal.danger : pal.success) : 'none',
            stroke: rec ? 'none' : pal.border,
          },
          root,
        );
        if (rec && rec.victim !== null) {
          label(rec.victim, x + L.cellW / 2, STRIP_OUT_Y + 8, root, {
            mono: true,
            anchor: 'middle',
            size: fontSizes.xs,
            fill: pal.danger,
          });
        }
      });

      // 밀려난 칸 → 다시 불린 칸
      for (const rec of scene.records) {
        if (rec.outAt === null) continue;
        const a = { x: L.cellX(rec.outAt) + L.cellW * 0.72, y: STRIP_OUT_Y + 12 };
        const b = { x: L.cellX(rec.t) + L.cellW * 0.3, y: STRIP_REF_Y - 1 };
        const c = { x: (a.x + b.x) / 2, y: STRIP_OUT_Y + 22 };
        const color = last !== undefined && rec.t === last.t ? pal.accent : pal.textMuted;
        node(
          'path',
          {
            d: `M${q(a.x)},${q(a.y)} Q${q(c.x)},${q(c.y)} ${q(b.x)},${q(b.y)}`,
            fill: 'none',
            stroke: color,
            'stroke-width': 1.5,
          },
          root,
        );
        arrowHead(b, bez(a, c, b, 0.8), color, root);
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) return resolve();
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

    /** 한 시계로 들어옴과 밀려남을 함께 흘린다. */
    async function swing(scene: ThrashingScene, rec: ThrashingRecord, mine: number): Promise<void> {
      const L = layoutOf(scene);
      const inEnd = L.frameSlot(rec.frame);
      const inStart = L.diskSlot(rec.page);
      const inCtl = { x: L.midX, y: L.upperY - 10 };
      const victim = rec.victim;
      const outStart = L.frameSlot(rec.frame);
      const outEnd = victim === null ? outStart : L.diskSlot(victim);
      const outCtl = { x: L.midX, y: L.lowerY + 10 };

      const apply = (k: number): void => {
        const e = ease(k);
        const pin = bez(inStart, inCtl, inEnd, e);
        tokens.get(rec.page)?.setAttribute('transform', `translate(${q(pin.x - inEnd.x)},${q(pin.y - inEnd.y)})`);
        if (victim !== null) {
          const pout = bez(outStart, outCtl, outEnd, e);
          tokens.get(victim)?.setAttribute('transform', `translate(${q(pout.x - outEnd.x)},${q(pout.y - outEnd.y)})`);
        }
      };

      apply(0);
      const steps = Math.max(1, Math.round(MOVE_MS / TICK_MS));
      for (let i = 1; i <= steps; i += 1) {
        await wait(TICK_MS);
        if (mine !== gen || destroyed) return;
        apply(i / steps);
      }
    }

    return {
      async render(next: ThrashingScene, prev: ThrashingScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        const rec = next.records[next.records.length - 1];
        if (!prev || !rec || prev.step !== next.step - 1 || !rec.fault) return;
        await swing(next, rec, mine);
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
