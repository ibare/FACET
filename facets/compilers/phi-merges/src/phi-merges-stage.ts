/**
 * phi-merges 의 그림.
 *
 * 블록 넷을 흐름 차례의 층으로 세운다 — 첫 블록이 위, 갈래가 가운데, 만나는 블록이 아래.
 * 동사는 "모여 하나가 된다" 다. 한 이름을 판정하는 걸음마다 두 앞선 블록의 끝에서 그 이름의
 * 판이 하나씩 떨어져 나와 간선을 타고 만나는 블록 머리로 흘러든다.
 *
 * - 판이 다르면 둘이 새 파이 줄의 인자 자리에 내려앉고, 몸의 줄이 한 줄 아래로 비켜선다
 * - 판이 같으면 둘이 한 자리에 겹쳐 하나가 되고, 블록 옆에서 그대로 지나간다
 * - 몸의 읽기 바꿈에서는 파이의 새 판(과 지나간 판)이 몸의 읽는 자리로 날아가 앉는다
 * - 돌림에서는 흐름이 지난 길을 점이 밟고, 파이마다 들어온 쪽의 인자가 왼쪽 새 판 자리로 옮겨 간다
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
import { blockLines, insSegments, type Ins, type PhiMergesScene, type Seg, type SceneEdge } from './scene.js';

const H = 460;
const W = PIECE_CANVAS_W;
const NS = 'http://www.w3.org/2000/svg';

const FS = parseFloat(fontSizes.sm);
const CW = FS * 0.6; // 고정폭 글꼴의 한 글자 폭
const LH = Math.round(FS * 1.5);
const MARGIN = 16;
const PAD_X = 8;
const PAD_Y = 6;
const GUTTER = CW * 4; // 라벨 칸 (`L2:`)
const PILL_W = CW * 5 + 8; // 돌림 값 칸
const BOX_W_MAX = 290;
const CAPTION_H = 48;
const TAB_H = 14;
const LAYER_GAP_MAX = 72;

const MS_MERGE = 700;
const MS_RENAME = 500;
const MS_RUN = 1000;

type Pt = { x: number; y: number };
type Box = { id: string; x: number; y: number; w: number; h: number; rows: number };
type EdgeGeo = { e: SceneEdge; a: Pt; b: Pt };
type Layout = { boxes: Map<string, Box>; edges: EdgeGeo[] };

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function ease(v: number): number {
  const p = clamp01(v);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
/** 전체 진행 p 에서 [a, b] 구간의 진행. */
function seg(p: number, a: number, b: number): number {
  return ease((p - a) / (b - a));
}
function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
function bez(g: EdgeGeo, s: number): Pt {
  const dy = g.b.y - g.a.y;
  const p0 = g.a;
  const p1 = { x: g.a.x, y: g.a.y + dy * 0.5 };
  const p2 = { x: g.b.x, y: g.b.y - dy * 0.5 };
  const p3 = g.b;
  const u = 1 - s;
  return {
    x: u * u * u * p0.x + 3 * u * u * s * p1.x + 3 * u * s * s * p2.x + s * s * s * p3.x,
    y: u * u * u * p0.y + 3 * u * u * s * p1.y + 3 * u * s * s * p2.y + s * s * s * p3.y,
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 블록마다 흐름 차례의 층 — 깊이는 알고리즘이 셈해 보냈다. */
function layers(scene: PhiMergesScene): string[][] {
  const out: string[][] = [];
  for (const b of scene.blocks) (out[b.depth] ??= []).push(b.id);
  for (let d = 0; d < out.length; d += 1) {
    if (out[d] === undefined) throw new Error(`phi-merges: 깊이 ${d} 에 블록이 없다`);
  }
  return out;
}

/** 자리 셈. 만나는 블록은 파이가 다 선 높이를 미리 잡아 둔다 — 세로가 걸음마다 흔들리지 않게. */
function layout(scene: PhiMergesScene): Layout {
  const ls = layers(scene);
  const maxN = Math.max(1, ...ls.map((l) => l.length));
  const slotW = (W - 2 * MARGIN) / maxN;
  const boxW = Math.min(BOX_W_MAX, slotW - 16);
  const rowsOf = (id: string): number => blockLines(scene, id).length;
  const reserve = (id: string): number => {
    const b = scene.blocks.find((x) => x.id === id);
    if (!b) throw new Error(`phi-merges: 없는 블록 ${id}`);
    return id === scene.merge ? b.lines.length + scene.names.length : b.lines.length;
  };
  const layerH = ls.map((l) => Math.max(...l.map((id) => reserve(id) * LH + 2 * PAD_Y)));
  const top0 = CAPTION_H + TAB_H;
  const room = H - top0 - 8 - layerH.reduce((a, b) => a + b, 0);
  const gap = ls.length > 1 ? Math.min(LAYER_GAP_MAX, (room - TAB_H * (ls.length - 1)) / (ls.length - 1)) : 0;
  const boxes = new Map<string, Box>();
  let y = top0;
  ls.forEach((l, i) => {
    const sw = (W - 2 * MARGIN) / l.length;
    l.forEach((id, j) => {
      const rows = rowsOf(id);
      boxes.set(id, { id, x: MARGIN + sw * j + (sw - boxW) / 2, y, w: boxW, h: rows * LH + 2 * PAD_Y, rows });
    });
    y += layerH[i]! + gap + TAB_H;
  });
  // 간선 — 나가는 자리는 블록 아래 가장자리, 들어오는 자리는 위 가장자리에 차례로 편다
  const outs = new Map<string, SceneEdge[]>();
  const ins = new Map<string, SceneEdge[]>();
  for (const e of scene.edges) {
    (outs.get(e.from) ?? outs.set(e.from, []).get(e.from)!).push(e);
    (ins.get(e.to) ?? ins.set(e.to, []).get(e.to)!).push(e);
  }
  const cx = (id: string): number => {
    const b = boxes.get(id)!;
    return b.x + b.w / 2;
  };
  for (const list of outs.values()) list.sort((a, b) => cx(a.to) - cx(b.to));
  for (const list of ins.values()) list.sort((a, b) => cx(a.from) - cx(b.from));
  const edges: EdgeGeo[] = scene.edges.map((e) => {
    const fb = boxes.get(e.from)!;
    const tb = boxes.get(e.to)!;
    const ol = outs.get(e.from)!;
    const il = ins.get(e.to)!;
    const a = { x: fb.x + (fb.w * (ol.indexOf(e) + 1)) / (ol.length + 1), y: fb.y + fb.h };
    const b = { x: tb.x + (tb.w * (il.indexOf(e) + 1)) / (il.length + 1), y: tb.y };
    return { e, a, b };
  });
  return { boxes, edges };
}

/** 줄 안 조각의 자리 — 글자 차례로 셈한다. */
function segOffsets(segs: Seg[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const s of segs) {
    out.push(at);
    at += s.s.length;
  }
  return out;
}

function codeX(box: Box): number {
  return box.x + PAD_X + GUTTER;
}
function rowY(box: Box, row: number): number {
  return box.y + PAD_Y + row * LH + LH / 2;
}

function fmt(v: number | boolean): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const x = Math.round(v * 1000) / 1000;
  return String(Object.is(x, -0) ? 0 : x);
}

type Draw = {
  /** 이 줄의 조각을 그리지 않는다 (운동이 아직 그 자리에 오지 않았다). */
  hide?: (block: string, row: number, s: Seg) => boolean;
  /** 줄의 세로 밀림 (운동 중 몸이 비켜서는 것). */
  shift?: (block: string, row: number) => number;
  /** 줄 전체의 불투명도. */
  alpha?: (block: string, row: number) => number;
  /** 블록 높이 덜어냄. */
  shrink?: (block: string) => number;
  /** 블록 전체의 불투명도. */
  blockAlpha?: (block: string) => number;
  /** 값 칸의 불투명도. */
  valueAlpha?: number;
  /** 지나간 판 칩을 그리지 않을 차례. */
  hidePass?: number;
};

export const phiMergesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
      });
    }

    /** 한 시계 — 걸음의 운동은 모두 이 진행 하나로 흐른다. */
    async function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const t0 = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const p = Math.min(1, (Date.now() - t0) / ms);
        frame(p);
        if (p >= 1) return true;
        await wait(16);
      }
    }

    // ───────── 그리기 ─────────

    function caption(scene: PhiMergesScene): [string, string | null] {
      const s = scene.step;
      const merge = scene.merge;
      if (merge === null) throw new Error('phi-merges: 만나는 블록이 없는 장면에 캡션을 단다');
      const incText = (inc: [string, string][]): string => inc.map(([q, x]) => `${q}: ${x}`).join(', ');
      switch (s.kind) {
        case 'start':
          return [
            t('caption.start', 'Merge block: {merge} ← {preds}. Still read without versions: {names}', {
              merge,
              preds: scene.preds.join(', '),
              names: scene.names.join(', '),
            }),
            null,
          ];
        case 'phi':
          return [
            t('caption.phi', '{name} — arriving: {inc}. They differ → one φ, new version: {dst}', {
              name: s.name,
              inc: incText(s.inc),
              dst: s.dst,
            }),
            null,
          ];
        case 'pass':
          return [
            t('caption.pass', '{name} — arriving: {inc}. Same → no φ, passes through: {ver}', {
              name: s.name,
              inc: incText(s.inc),
              ver: s.ver,
            }),
            null,
          ];
        case 'rename':
          return [
            t('caption.rename', 'The body of {block} now reads the merged versions. Reads rewritten: {n}', {
              block: merge,
              n: s.rewrites.length,
            }),
            null,
          ];
        case 'run': {
          const run = scene.run;
          if (!run) throw new Error('phi-merges: 돌림 걸음에 돌림 결과가 없다');
          return [
            t('caption.run.path', 'Run with {input}. Path: {path}. Returned: {result}', {
              input: run.input.map(([k, v]) => `${k} = ${fmt(v)}`).join(', '),
              path: run.path.join(' → '),
              result: fmt(run.result),
            }),
            t('caption.run.pick', 'Came in from: {from} → each φ takes that side: {picks}', {
              from: run.from,
              picks: run.picks.map((p) => `${p.dst} = ${p.arg}`).join(', '),
            }),
          ];
        }
      }
    }

    function chip(parent: Element, x: number, y: number, text: string, strong: boolean, alpha = 1): void {
      const w = text.length * CW + 4;
      const g = el(parent, 'g', alpha < 1 ? { opacity: alpha } : {});
      el(g, 'rect', {
        x: x - 2,
        y: y - LH / 2 + 1,
        width: w,
        height: LH - 2,
        rx: 3,
        fill: strong ? c.accent : c.bg,
        stroke: strong ? c.accent : c.border,
        'stroke-width': 1,
      });
      el(
        g,
        'text',
        {
          x,
          y,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: strong ? c.stateInk : c.text,
        },
        text,
      );
    }

    /** 이번 걸음에서 머무는 강조 — 칩으로 선 조각. */
    function isChip(scene: PhiMergesScene, block: string, lines: Ins[], row: number, s: Seg): boolean {
      const st = scene.step;
      if (block !== scene.merge) return false;
      const ins = lines[row]!;
      if (st.kind === 'phi') return ins.k === 'phi' && ins.dst === st.dst && s.role === 'arg';
      if (st.kind === 'rename') return s.role === 'use' && st.rewrites.some((w) => w.row === row && w.slot === s.slot);
      if (st.kind === 'run' && scene.run && s.role === 'arg') {
        return scene.run.picks.some((p) => p.row === row && p.slot === s.slot);
      }
      return false;
    }

    function isMuted(scene: PhiMergesScene, block: string, row: number, s: Seg): boolean {
      if (scene.step.kind !== 'run' || !scene.run || block !== scene.merge) return false;
      if (s.role !== 'arg' && s.role !== 'block') return false;
      const pick = scene.run.picks.find((p) => p.row === row);
      return pick !== undefined && pick.slot !== s.slot;
    }

    function drawScene(scene: PhiMergesScene, d: Draw): Layout | null {
      svg.textContent = '';
      if (scene.blocks.length === 0) return null;
      const [cap1, cap2] = caption(scene);
      el(
        svg,
        'text',
        { x: MARGIN, y: 18, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text },
        cap1,
      );
      if (cap2 !== null) {
        el(svg, 'text', { x: MARGIN, y: 36, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, cap2);
      }
      const lay = layout(scene);
      const run = scene.step.kind === 'run' ? scene.run : null;
      const onPath = (e: SceneEdge): boolean => {
        if (!run) return false;
        const i = run.path.indexOf(e.from);
        return i >= 0 && run.path[i + 1] === e.to;
      };
      const judging = scene.step.kind === 'phi' || scene.step.kind === 'pass';

      // 간선
      const edgeLayer = el(svg, 'g', {});
      for (const g of lay.edges) {
        const hot = onPath(g.e) || (judging && g.e.to === scene.merge);
        const stroke = hot ? c.primary : c.border;
        const end = { x: g.b.x, y: g.b.y - 7 };
        const dy = end.y - g.a.y;
        el(edgeLayer, 'path', {
          d: `M ${r2(g.a.x)} ${r2(g.a.y)} C ${r2(g.a.x)} ${r2(g.a.y + dy * 0.5)} ${r2(end.x)} ${r2(end.y - dy * 0.5)} ${r2(end.x)} ${r2(end.y)}`,
          fill: 'none',
          stroke,
          'stroke-width': hot ? 2.2 : 1.4,
        });
        el(edgeLayer, 'path', {
          d: `M ${r2(g.b.x - 4.5)} ${r2(g.b.y - 8)} L ${r2(g.b.x + 4.5)} ${r2(g.b.y - 8)} L ${r2(g.b.x)} ${r2(g.b.y)} Z`,
          fill: stroke,
        });
      }

      // 블록
      for (const b of scene.blocks) {
        const box = lay.boxes.get(b.id)!;
        const lines = blockLines(scene, b.id);
        const ba = d.blockAlpha ? d.blockAlpha(b.id) : 1;
        const g = el(svg, 'g', ba < 1 ? { opacity: ba } : {});
        const hh = box.h - (d.shrink ? d.shrink(b.id) : 0);
        el(g, 'text', {
          x: box.x + 2,
          y: box.y - 4,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: c.textMuted,
        }, b.id);
        el(g, 'rect', {
          x: box.x,
          y: box.y,
          width: box.w,
          height: hh,
          rx: 4,
          fill: c.bgSubtle,
          stroke: b.id === scene.merge && judging ? c.primary : c.border,
          'stroke-width': b.id === scene.merge && judging ? 1.6 : 1,
        });
        lines.forEach((ins, row) => {
          const y = rowY(box, row) + (d.shift ? d.shift(b.id, row) : 0);
          const la = d.alpha ? d.alpha(b.id, row) : 1;
          const lg = el(g, 'g', la < 1 ? { opacity: la } : {});
          if (ins.label !== null) {
            // 라벨은 줄과 따로 선다 — 첫 파이가 서는 동안에도 제자리에 머문다
            el(g, 'text', {
              x: box.x + PAD_X,
              y,
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: c.textMuted,
            }, `${ins.label}:`);
          }
          const segs = insSegments(ins);
          const offs = segOffsets(segs);
          segs.forEach((s, i) => {
            const text = s.s.trim();
            if (text === '') return;
            if (d.hide && d.hide(b.id, row, s)) return;
            const lead = s.s.length - s.s.trimStart().length;
            const x = codeX(box) + (offs[i]! + lead) * CW;
            if (isChip(scene, b.id, lines, row, s)) {
              chip(lg, x, y, text, true);
              return;
            }
            const muted = isMuted(scene, b.id, row, s);
            el(lg, 'text', {
              x,
              y,
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': s.role === 'def' ? 700 : 400,
              fill: muted || s.role === 'kw' || s.role === 'target' || s.role === 'block' ? c.textMuted : c.text,
            }, text);
          });
        });
        // 돌림 값 — 돈 줄마다
        if (run) {
          const va = d.valueAlpha ?? 1;
          for (const v of va > 0 ? run.values.filter((x) => x.block === b.id) : []) {
            const y = rowY(box, v.index);
            const text = fmt(v.value);
            const vg = el(g, 'g', va < 1 ? { opacity: va } : {});
            const px = box.x + box.w - PAD_X - PILL_W;
            el(vg, 'rect', { x: px, y: y - LH / 2 + 2, width: PILL_W, height: LH - 4, rx: 7, fill: c.bg, stroke: c.border, 'stroke-width': 1 });
            el(vg, 'text', {
              x: px + PILL_W / 2,
              y,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.text,
            }, text);
          }
        }
      }

      // 지나간 판
      const mb = scene.merge !== null ? lay.boxes.get(scene.merge) : undefined;
      if (mb) {
        scene.passes.forEach((ps, i) => {
          if (d.hidePass === i) return;
          const pos = passPos(mb, i);
          const strong = scene.step.kind === 'pass' && scene.step.ver === ps.ver && i === scene.passes.length - 1;
          chip(svg, pos.x, pos.y, ps.ver, strong);
          el(svg, 'text', {
            x: pos.x + ps.ver.length * CW + 8,
            y: pos.y,
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          }, t('label.pass', 'passes'));
        });
      }
      return lay;
    }

    function passPos(mb: Box, i: number): Pt {
      return { x: mb.x + mb.w + 14, y: rowY(mb, i) };
    }

    /** 만나는 블록의 한 줄에서 조각 하나의 자리. */
    function segPos(scene: PhiMergesScene, lay: Layout, block: string, row: number, pick: (s: Seg) => boolean): Pt {
      const box = lay.boxes.get(block)!;
      const lines = blockLines(scene, block);
      const ins = lines[row];
      if (!ins) throw new Error(`phi-merges: ${block} 에 ${row} 번째 줄이 없다`);
      const segs = insSegments(ins);
      const offs = segOffsets(segs);
      const i = segs.findIndex(pick);
      if (i < 0) throw new Error(`phi-merges: ${block} 의 줄에서 찾는 조각이 없다`);
      const lead = segs[i]!.s.length - segs[i]!.s.trimStart().length;
      return { x: codeX(box) + (offs[i]! + lead) * CW, y: rowY(box, row) };
    }

    function drawStatic(scene: PhiMergesScene): void {
      drawScene(scene, {});
    }

    // ───────── 걸음의 운동 ─────────

    /** 두 앞선 블록의 끝에서 판이 흘러들어 파이 인자 자리(또는 지나감 자리)에 내려앉는다. */
    async function animateMerge(scene: PhiMergesScene, mine: number): Promise<void> {
      const st = scene.step;
      if ((st.kind !== 'phi' && st.kind !== 'pass') || scene.merge === null) throw new Error('phi-merges: 판정 걸음이 아니다');
      const merge = scene.merge;
      const lay0 = layout(scene);
      const mb = lay0.boxes.get(merge)!;
      const phiRow = scene.phis.length - 1;
      const passIdx = scene.passes.length - 1;
      const targets: Pt[] = st.inc.map(([, ver], i) =>
        st.kind === 'phi'
          ? segPos(scene, lay0, merge, phiRow, (s) => s.role === 'arg' && s.slot === i && s.s === ver)
          : passPos(mb, passIdx),
      );
      const routes = st.inc.map(([q]) => {
        const g = lay0.edges.find((x) => x.e.from === q && x.e.to === merge);
        if (!g) throw new Error(`phi-merges: ${q} → ${merge} 간선이 없다`);
        return g;
      });
      const bodyFrom = st.kind === 'phi' ? phiRow + 1 : Number.POSITIVE_INFINITY;
      await tween(MS_MERGE, mine, (p) => {
        const room = seg(p, 0, 0.4);
        const along = seg(p, 0.05, 0.7);
        const land = seg(p, 0.7, 1);
        const lay = drawScene(scene, {
          hide: (b, row, s) => st.kind === 'phi' && b === merge && row === phiRow && s.role === 'arg' && p < 1,
          shift: (b, row) => (st.kind === 'phi' && b === merge && row >= bodyFrom ? -(1 - room) * LH : 0),
          shrink: (b) => (st.kind === 'phi' && b === merge ? (1 - room) * LH : 0),
          alpha: (b, row) => (st.kind === 'phi' && b === merge && row === phiRow ? seg(p, 0.55, 1) : 1),
          hidePass: st.kind === 'pass' && p < 1 ? passIdx : undefined,
        });
        if (!lay) throw new Error('phi-merges: 블록이 없는 장면을 흘린다');
        st.inc.forEach(([, ver], i) => {
          const route = routes[i]!;
          const w = ver.length * CW;
          const onEdge = bez(route, along);
          // 칩의 글자 시작점 — 간선 위에서는 가운데를 맞춘다
          const cx = onEdge.x - w / 2;
          const x = lerp(cx, targets[i]!.x, land);
          const y = lerp(onEdge.y, targets[i]!.y, land);
          chip(svg, x, y, ver, true);
        });
      });
    }

    /** 새 판이 몸의 읽는 자리로 날아가 앉는다. */
    async function animateRename(scene: PhiMergesScene, mine: number): Promise<void> {
      const st = scene.step;
      if (st.kind !== 'rename' || scene.merge === null) throw new Error('phi-merges: 읽기 바꿈이 아닌 걸음');
      const merge = scene.merge;
      const lay0 = layout(scene);
      const mb = lay0.boxes.get(merge)!;
      type Fly = { from: Pt; to: Pt; text: string; old: string; row: number; slot: number };
      const flies: Fly[] = st.rewrites.map((w) => ({
        from: w.from === 'phi' ? segPos(scene, lay0, merge, w.src, (x) => x.role === 'def') : passPos(mb, w.src),
        to: segPos(scene, lay0, merge, w.row, (x) => x.role === 'use' && x.slot === w.slot),
        text: w.ver,
        old: w.was,
        row: w.row,
        slot: w.slot,
      }));
      await tween(MS_RENAME, mine, (p) => {
        const k = seg(p, 0, 1);
        const lay = drawScene(scene, {
          hide: (b, row, s) =>
            b === merge && p < 1 && s.role === 'use' && flies.some((f) => f.row === row && f.slot === s.slot),
        });
        if (!lay) throw new Error('phi-merges: 블록이 없는 장면을 흘린다');
        for (const f of flies) {
          // 옛 이름은 새 판이 닿을수록 옅어진다
          const og = el(svg, 'g', { opacity: r2(1 - k) });
          el(og, 'text', {
            x: f.to.x,
            y: f.to.y,
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          }, f.old);
          chip(svg, lerp(f.from.x, f.to.x, k), lerp(f.from.y, f.to.y, k) - Math.sin(Math.PI * k) * LH * 0.8, f.text, true);
        }
      });
    }

    /** 흐름이 지난 길을 점이 밟고, 파이마다 들어온 쪽 인자가 새 판 자리로 옮겨 간다. */
    async function animateRun(scene: PhiMergesScene, mine: number): Promise<void> {
      const run = scene.run;
      if (!run || scene.merge === null) throw new Error('phi-merges: 돌림 결과가 없는 돌림 걸음');
      const merge = scene.merge;
      const lay0 = layout(scene);
      // 점이 밟는 길 — 블록 안은 위에서 아래로 곧게, 블록 사이는 간선을 탄다
      const legs: ((s: number) => Pt)[] = [];
      for (let i = 0; i < run.path.length; i += 1) {
        const id = run.path[i]!;
        const box = lay0.boxes.get(id)!;
        const next = run.path[i + 1];
        const inEdge = i > 0 ? lay0.edges.find((g) => g.e.from === run.path[i - 1] && g.e.to === id) : undefined;
        const outEdge = next !== undefined ? lay0.edges.find((g) => g.e.from === id && g.e.to === next) : undefined;
        const enter = inEdge ? inEdge.b : { x: box.x + box.w / 2, y: box.y };
        if (next === undefined) {
          legs.push((s) => ({ x: enter.x, y: lerp(enter.y, enter.y + LH * 0.6, s) }));
          break;
        }
        if (!outEdge) throw new Error(`phi-merges: ${id} → ${next} 간선이 없다`);
        const exit = outEdge.a;
        legs.push((s) => ({ x: lerp(enter.x, exit.x, s), y: lerp(enter.y, exit.y, s) }));
        legs.push((s) => bez(outEdge, s));
      }
      const off = new Set(scene.blocks.map((b) => b.id).filter((id) => !run.path.includes(id)));
      const picks = run.picks.map((pk) => ({
        text: pk.arg,
        from: segPos(scene, lay0, merge, pk.row, (s) => s.role === 'arg' && s.slot === pk.slot),
        to: segPos(scene, lay0, merge, pk.row, (s) => s.role === 'def'),
      }));
      await tween(MS_RUN, mine, (p) => {
        const walk = seg(p, 0, 0.65);
        const pick = seg(p, 0.65, 1);
        const lay = drawScene(scene, {
          blockAlpha: (b) => (off.has(b) ? lerp(1, 0.35, seg(p, 0, 0.3)) : 1),
          valueAlpha: seg(p, 0.6, 1),
        });
        if (!lay) throw new Error('phi-merges: 블록이 없는 장면을 흘린다');
        if (p < 1) {
          const n = legs.length;
          const at = Math.min(n - 1, Math.floor(walk * n));
          const pt = legs[at]!(walk * n - at);
          el(svg, 'circle', { cx: pt.x, cy: pt.y, r: 5, fill: c.primary });
        }
        if (pick > 0 && p < 1) {
          for (const pk of picks) {
            chip(svg, lerp(pk.from.x, pk.to.x, pick), pk.from.y - Math.sin(Math.PI * pick) * LH * 0.7, pk.text, true, 0.9);
          }
        }
      });
    }

    function drawRunStatic(scene: PhiMergesScene): void {
      const run = scene.run;
      if (!run) {
        drawStatic(scene);
        return;
      }
      const off = new Set(scene.blocks.map((b) => b.id).filter((id) => !run.path.includes(id)));
      drawScene(scene, { blockAlpha: (b) => (off.has(b) ? 0.35 : 1) });
    }

    function settle(scene: PhiMergesScene): void {
      if (scene.step.kind === 'run') drawRunStatic(scene);
      else drawStatic(scene);
    }

    return {
      async render(next: PhiMergesScene, _prev: PhiMergesScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        settle(next);
        if (!opts.animate || next.blocks.length === 0) return;
        const k = next.step.kind;
        if (k === 'phi' || k === 'pass') await animateMerge(next, mine);
        else if (k === 'rename') await animateRename(next, mine);
        else if (k === 'run') await animateRun(next, mine);
        if (mine !== gen || destroyed) return;
        settle(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
