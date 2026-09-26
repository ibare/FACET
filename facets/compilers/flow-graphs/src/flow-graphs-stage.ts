/**
 * flow-graphs 무대 — 줄이 잘려 토막이 되고, 토막 사이로 넣기가 흘러, 읽기에 사슬이 한 가닥 · 두 가닥으로 닿는다.
 *
 * 왼쪽에 원시 프로그램(자료), 가운데 세 주소 코드. 회차를 건너 같은 명령 줄은 **같은 요소**라 흐름 꼴을 바꾸면
 * 남는 줄이 제자리에서 옮겨 서고 새 줄이 끼어든다. 자름 걸음에 줄이 블록 틀로 벌어지고, 간선 걸음에 틀 끝에서
 * 간선이 뻗고, 훑기 걸음에 넣기 칩이 간선을 타고 다음 틀 머리로 흘러 들어가고, 사슬 걸음에 넣기에서 읽기로 선이 뻗는다.
 *
 * 무대는 셈하지 않는다 — 블록 · 간선 · 모음 · 칩의 출처 · 닿는 넣기는 모두 payload 로 받는다.
 * 무대가 하는 셈은 자리 잡기(줄 · 틀 · 칩의 좌표)뿐이다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { BlockSpan, ChainRead, CodeLine, FlowEdge, SetChip, SourceLine, Token } from './algorithm.js';

export type RoundView = { source: SourceLine[]; names: string[]; lines: CodeLine[] };
export type CutView = { leaders: number[]; blocks: BlockSpan[] };
export type EdgesView = { edges: FlowEdge[] };
export type SweepView = {
  sets: { head: SetChip[]; end: SetChip[]; headChanged: boolean; endChanged: boolean }[];
};
export type ChainsView = { block: number; reads: ChainRead[] };

/** projector 가 부르는 무대의 표면 */
export type FlowGraphsStage = {
  round(p: RoundView, caption: string, dur: number): void;
  cut(p: CutView, caption: string, dur: number): void;
  edges(p: EdgesView, caption: string, dur: number): void;
  sweep(p: SweepView, caption: string, dur: number): void;
  chains(p: ChainsView, caption: string, dur: number): void;
  clear(): void;
};

const W = 760;
const H = 560;
const LH = 20; // 한 줄 높이
const TOP = 58; // 첫 줄 가운데
const GAP = 26; // 블록 틀 사이 (흘러내림 화살이 선다)
const SRC_X = 18;
const FX = 300; // 블록 틀 왼쪽
const FW = 316; // 블록 틀 폭
const NUM_X = FX + 22; // 줄 번호 (오른쪽 맞춤)
const CODE_X = FX + 30; // 명령 글자
const CHIP_X = FX + 82; // 모음 칩 시작
const FALL_X = FX + 16; // 흘러내림 화살
const CAPTION_Y = H - 22;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

type Pt = { x: number; y: number };

/** 꺾은선 위 비율 k 의 점 */
function along(pts: Pt[], k: number): Pt {
  if (pts.length === 0) throw new Error('flow-graphs-stage: 빈 경로');
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    lens.push(d);
    total += d;
  }
  if (total === 0) return pts[pts.length - 1]!;
  let want = total * k;
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i]! || i === lens.length - 1) {
      const f = lens[i]! === 0 ? 1 : Math.min(1, want / lens[i]!);
      return { x: lerp(pts[i]!.x, pts[i + 1]!.x, f), y: lerp(pts[i]!.y, pts[i + 1]!.y, f) };
    }
    want -= lens[i]!;
  }
  return pts[pts.length - 1]!;
}

function cubic(a: Pt, c1: Pt, c2: Pt, b: Pt, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const u = 1 - s;
    out.push({
      x: u * u * u * a.x + 3 * u * u * s * c1.x + 3 * u * s * s * c2.x + s * s * s * b.x,
      y: u * u * u * a.y + 3 * u * u * s * c1.y + 3 * u * s * s * c2.y + s * s * s * b.y,
    });
  }
  return out;
}

function polyLength(pts: Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return total;
}

type LineEl = { g: SVGGElement; y: number; x: number; opacity: number; tokens: Token[] };
type ChipEl = { g: SVGGElement; x: number; y: number; w: number };
type BlockGeo = { top: number; bottom: number; headY: number; footY: number; rows: number[] };
type EdgeGeo = { edge: FlowEdge; pts: Pt[] };

export const flowGraphsStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const codePx = parseFloat(fontSizes.sm);
    const cw = codePx * 0.6; // 고정폭 글자 한 칸
    let destroyed = false;

    // ── 운동 ────────────────────────────────────────────────────────────────
    type Anim = { id: number; finish: () => void };
    const anims = new Set<Anim>();
    const tween = (dur: number, draw: (k: number) => void, done?: () => void): void => {
      if (destroyed || isInstant() || dur <= 0 || typeof requestAnimationFrame !== 'function') {
        draw(1);
        done?.();
        return;
      }
      let begin = -1;
      const a: Anim = {
        id: 0,
        finish: () => {
          cancelAnimationFrame(a.id);
          anims.delete(a);
          draw(1);
          done?.();
        },
      };
      const tick = (now: number): void => {
        if (destroyed) return;
        if (begin < 0) begin = now;
        const k = Math.min(1, (now - begin) / dur);
        draw(ease(k));
        if (k < 1) a.id = requestAnimationFrame(tick);
        else {
          anims.delete(a);
          done?.();
        }
      };
      anims.add(a);
      a.id = requestAnimationFrame(tick);
    };
    const settle = (): void => {
      for (const a of [...anims]) a.finish();
    };
    params.onScrubStart?.(() => {
      for (const a of [...anims]) {
        cancelAnimationFrame(a.id);
        anims.delete(a);
      }
    });

    // ── 층 ──────────────────────────────────────────────────────────────────
    const root = el('g', { 'font-family': fonts.body }, svg);
    const layerFrames = el('g', {}, root);
    const layerEdges = el('g', {}, root);
    const layerChains = el('g', {}, root);
    const layerSource = el('g', {}, root);
    const layerLines = el('g', {}, root);
    const layerChips = el('g', {}, root);
    const layerFly = el('g', {}, root);

    const headSrc = el('text', { x: SRC_X, y: TOP - 26, 'font-size': fontSizes.xs, fill: pal.textMuted }, root);
    headSrc.textContent = t('label.source', 'Source');
    const headTac = el('text', { x: CODE_X, y: TOP - 26, 'font-size': fontSizes.xs, fill: pal.textMuted }, root);
    headTac.textContent = t('label.tac', 'Three-address code');
    const captionEl = el(
      'text',
      { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'font-size': fontSizes.md, fill: pal.text },
      root,
    );

    // ── 상태 (그림의 자리만) ───────────────────────────────────────────────────
    let names: string[] = [];
    let palette: readonly string[] = [];
    const lines = new Map<string, LineEl>();
    let order: string[] = []; // 명령 번호 → 줄 key
    let geo: BlockGeo[] = [];
    let edgeGeo: EdgeGeo[] = [];
    let heads: Map<number, ChipEl>[] = [];
    let ends: Map<number, ChipEl>[] = [];
    let chainEls: SVGGElement[] = [];

    const colorOf = (name: string): string => {
      const i = names.indexOf(name);
      if (i < 0) throw new Error(`flow-graphs-stage: 이름 ${name} 의 색이 없다`);
      const c = palette[i];
      if (c === undefined) throw new Error('flow-graphs-stage: 색이 모자라다');
      return c;
    };

    const clearGroup = (g: SVGGElement): void => {
      while (g.firstChild) g.removeChild(g.firstChild);
    };

    const setCaption = (s: string): void => {
      captionEl.textContent = s;
    };

    const lineAt = (i: number): LineEl => {
      const key = order[i];
      if (key === undefined) throw new Error(`flow-graphs-stage: 명령 ${i} 이 없다`);
      const ln = lines.get(key);
      if (ln === undefined) throw new Error(`flow-graphs-stage: 줄 ${key} 이 없다`);
      return ln;
    };

    /** 토막 글자의 자리 — 고정폭이라 글자 칸으로 센다 */
    const tokenSpan = (tokens: Token[], pick: (tk: Token) => boolean): { x: number; w: number } => {
      let off = 0;
      for (const tk of tokens) {
        const lead = tk.text.length - tk.text.trimStart().length;
        const body = tk.text.trim();
        if (pick(tk)) return { x: CODE_X + (off + lead) * cw, w: body.length * cw };
        off += tk.text.length;
      }
      throw new Error('flow-graphs-stage: 토막이 없다');
    };

    const drawTokens = (g: SVGGElement, tokens: Token[], num: number): void => {
      clearGroup(g);
      const n = el(
        'text',
        {
          x: NUM_X,
          y: 0,
          'text-anchor': 'end',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: pal.textMuted,
        },
        g,
      );
      n.textContent = String(num);
      let off = 0;
      for (const tk of tokens) {
        const lead = tk.text.length - tk.text.trimStart().length;
        const body = tk.text.trim();
        if (body.length > 0) {
          const fill = tk.role === 'label' || tk.role === 'word' ? pal.textMuted : pal.text;
          const node = el(
            'text',
            {
              x: CODE_X + (off + lead) * cw,
              y: 0,
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': tk.role === 'def' ? 700 : 400,
              fill,
            },
            g,
          );
          node.textContent = body;
        }
        off += tk.text.length;
      }
    };

    const place = (ln: LineEl): void => {
      ln.g.setAttribute('transform', `translate(${ln.x.toFixed(1)},${ln.y.toFixed(1)})`);
      ln.g.setAttribute('opacity', ln.opacity.toFixed(2));
    };

    /** 줄들을 새 자리로 옮긴다 */
    const moveLines = (rows: number[], dur: number): void => {
      order.forEach((key, i) => {
        const ln = lines.get(key);
        const y = rows[i];
        if (ln === undefined || y === undefined) throw new Error('flow-graphs-stage: 줄 자리가 없다');
        const y0 = ln.y;
        const x0 = ln.x;
        const o0 = ln.opacity;
        tween(dur, (k) => {
          ln.y = lerp(y0, y, k);
          ln.x = lerp(x0, 0, k);
          ln.opacity = lerp(o0, 1, k);
          place(ln);
        });
      });
    };

    const compactRows = (n: number): number[] => Array.from({ length: n }, (_, i) => TOP + i * LH);

    const wipeResults = (): void => {
      clearGroup(layerFrames);
      clearGroup(layerEdges);
      clearGroup(layerChains);
      clearGroup(layerChips);
      clearGroup(layerFly);
      geo = [];
      edgeGeo = [];
      heads = [];
      ends = [];
      chainEls = [];
    };

    // ── 걸음 0 — 세 주소 코드가 다시 줄을 선다 ──────────────────────────────────
    const round = (p: RoundView, caption: string, dur: number): void => {
      settle();
      wipeResults();
      names = p.names;
      palette = categorical(Math.max(names.length, 1), 'vivid');

      clearGroup(layerSource);
      p.source.forEach((sl, i) => {
        const node = el(
          'text',
          {
            x: SRC_X + sl.indent * 4 * cw,
            y: TOP + i * LH,
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: pal.text,
          },
          layerSource,
        );
        node.textContent = sl.text;
      });

      const keep = new Set(p.lines.map((l) => l.key));
      for (const [key, ln] of [...lines]) {
        if (keep.has(key)) continue;
        lines.delete(key);
        const x0 = ln.x;
        const o0 = ln.opacity;
        tween(
          dur,
          (k) => {
            ln.x = lerp(x0, 28, k);
            ln.opacity = lerp(o0, 0, k);
            place(ln);
          },
          () => ln.g.remove(),
        );
      }
      const rows = compactRows(p.lines.length);
      p.lines.forEach((cl, i) => {
        let ln = lines.get(cl.key);
        if (ln === undefined) {
          // 끼어드는 줄 — 왼쪽에서 제자리로 들어온다
          ln = { g: el('g', {}, layerLines), y: rows[i]!, x: -28, opacity: 0, tokens: cl.tokens };
          lines.set(cl.key, ln);
          place(ln);
        }
        ln.tokens = cl.tokens;
        drawTokens(ln.g, cl.tokens, i + 1);
      });
      order = p.lines.map((l) => l.key);
      moveLines(rows, dur);
      setCaption(caption);
    };

    // ── 자름 — 리더 앞에서 잘려 블록 틀로 벌어진다 ──────────────────────────────
    const cut = (p: CutView, caption: string, dur: number): void => {
      settle();
      const rows: number[] = new Array<number>(order.length).fill(-1);
      geo = [];
      let cursor = TOP;
      p.blocks.forEach((bk) => {
        const headY = cursor;
        cursor += LH;
        const own: number[] = [];
        for (let i = bk.start; i < bk.end; i++) {
          rows[i] = cursor;
          own.push(cursor);
          cursor += LH;
        }
        const footY = cursor;
        cursor += LH + GAP;
        geo.push({ top: headY - LH / 2, bottom: footY + LH / 2, headY, footY, rows: own });
      });
      if (rows.some((y) => y < 0)) throw new Error('flow-graphs-stage: 블록 밖의 명령');

      const compact = compactRows(order.length);
      p.blocks.forEach((bk, b) => {
        const g = geo[b]!;
        const fromTop = compact[bk.start]! - LH / 2;
        const fromBottom = compact[bk.end - 1]! + LH / 2;
        const frame = el(
          'rect',
          { x: FX, y: fromTop, width: FW, height: fromBottom - fromTop, rx: 6, fill: pal.bgSubtle, stroke: pal.border },
          layerFrames,
        );
        const strip = el('g', { opacity: 0 }, layerFrames);
        const nameEl = el(
          'text',
          {
            x: FX + 8,
            y: g.headY,
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: pal.text,
          },
          strip,
        );
        nameEl.textContent = `B${b + 1}`;
        const headLbl = el(
          'text',
          { x: FX + 34, y: g.headY, 'dominant-baseline': 'central', 'font-size': fontSizes.xs, fill: pal.textMuted },
          strip,
        );
        headLbl.textContent = t('label.head', 'in');
        headLbl.setAttribute('data-strip', `h${b}`);
        const endLbl = el(
          'text',
          { x: FX + 34, y: g.footY, 'dominant-baseline': 'central', 'font-size': fontSizes.xs, fill: pal.textMuted },
          strip,
        );
        endLbl.textContent = t('label.end', 'out');
        endLbl.setAttribute('data-strip', `e${b}`);
        tween(dur, (k) => {
          const top = lerp(fromTop, g.top, k);
          frame.setAttribute('y', top.toFixed(1));
          frame.setAttribute('height', (lerp(fromBottom, g.bottom, k) - top).toFixed(1));
          strip.setAttribute('opacity', k.toFixed(2));
        });
      });
      heads = p.blocks.map(() => new Map<number, ChipEl>());
      ends = p.blocks.map(() => new Map<number, ChipEl>());
      moveLines(rows, dur);
      setCaption(caption);
    };

    // ── 간선 — 틀 끝에서 뻗는다 ────────────────────────────────────────────────
    const edges = (p: EdgesView, caption: string, dur: number): void => {
      settle();
      clearGroup(layerEdges);
      edgeGeo = [];
      let lane = 0;
      for (const e of p.edges) {
        const from = geo[e.from];
        const to = geo[e.to];
        if (from === undefined || to === undefined) throw new Error('flow-graphs-stage: 간선의 블록이 없다');
        let pts: Pt[];
        let labelAt: Pt;
        const color = e.back ? pal.itemActive : pal.textMuted;
        if (e.kind === 'fall') {
          pts = [
            { x: FALL_X, y: from.bottom },
            { x: FALL_X, y: to.top },
          ];
          labelAt = { x: FALL_X + 8, y: (from.bottom + to.top) / 2 };
        } else {
          const reach = 40 + lane * 36;
          lane++;
          const a = { x: FX + FW, y: from.footY };
          const b = { x: FX + FW, y: to.headY };
          pts = cubic(a, { x: a.x + reach, y: a.y }, { x: b.x + reach, y: b.y }, b, 24);
          labelAt = { x: FX + FW + reach * 0.75 + 4, y: (a.y + b.y) / 2 };
        }
        edgeGeo.push({ edge: e, pts });
        const len = polyLength(pts);
        const g = el('g', {}, layerEdges);
        const path = el(
          'path',
          {
            d: pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '),
            fill: 'none',
            stroke: color,
            'stroke-width': e.back ? 2 : 1.5,
            'stroke-dasharray': len.toFixed(1),
            'stroke-dashoffset': len.toFixed(1),
          },
          g,
        );
        const tip = pts[pts.length - 1]!;
        const prev = pts[pts.length - 2]!;
        const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x);
        const head = el(
          'path',
          {
            d: `M${tip.x},${tip.y} l${(-8 * Math.cos(ang - 0.45)).toFixed(1)},${(-8 * Math.sin(ang - 0.45)).toFixed(1)} M${tip.x},${tip.y} l${(-8 * Math.cos(ang + 0.45)).toFixed(1)},${(-8 * Math.sin(ang + 0.45)).toFixed(1)}`,
            stroke: color,
            'stroke-width': 1.5,
            fill: 'none',
            opacity: 0,
          },
          g,
        );
        const lbl = el(
          'text',
          {
            x: labelAt.x,
            y: labelAt.y,
            'dominant-baseline': 'central',
            'font-size': fontSizes.xs,
            fill: color,
            opacity: 0,
          },
          g,
        );
        lbl.textContent =
          e.kind === 'fall' ? t('label.fall', 'fall-through') : e.back ? t('label.back', 'backward') : t('label.jump', 'jump');
        tween(dur, (k) => {
          path.setAttribute('stroke-dashoffset', (len * (1 - k)).toFixed(1));
          head.setAttribute('opacity', k >= 0.95 ? '1' : '0');
          lbl.setAttribute('opacity', k.toFixed(2));
        });
      }
      setCaption(caption);
    };

    // ── 훑기 — 넣기 칩이 간선을 타고 머리로 흘러 든다 ─────────────────────────────
    const chipWidth = (label: string): number => label.length * cw + 8;
    const makeChip = (c: SetChip, x: number, y: number, fresh: boolean): ChipEl => {
      const label = `${c.name}@${c.def + 1}`;
      const w = chipWidth(label);
      const g = el('g', {}, layerChips);
      const color = colorOf(c.name);
      el(
        'rect',
        {
          x: 0,
          y: -8,
          width: w,
          height: 16,
          rx: 4,
          fill: fresh ? pal.accent : pal.bg,
          stroke: color,
          'stroke-width': fresh ? 2 : 1.2,
        },
        g,
      );
      const tx = el(
        'text',
        {
          x: w / 2,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: pal.text,
        },
        g,
      );
      tx.textContent = label;
      g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      return { g, x, y, w };
    };

    const stripLayout = (chips: SetChip[]): number[] => {
      const xs: number[] = [];
      let x = CHIP_X;
      for (const c of chips) {
        xs.push(x);
        x += chipWidth(`${c.name}@${c.def + 1}`) + 4;
      }
      return xs;
    };

    const edgePath = (from: number, to: number): Pt[] => {
      const found = edgeGeo.find((g) => g.edge.from === from && g.edge.to === to);
      if (found === undefined) throw new Error(`flow-graphs-stage: 간선 B${from + 1}→B${to + 1} 이 그려지지 않았다`);
      return found.pts;
    };

    const markStrip = (key: string, on: boolean): void => {
      const lbl = layerFrames.querySelector(`[data-strip="${key}"]`);
      if (lbl === null) throw new Error(`flow-graphs-stage: 모음 자리 ${key} 이 없다`);
      lbl.setAttribute('fill', on ? pal.text : pal.textMuted);
      lbl.setAttribute('font-weight', on ? '700' : '400');
    };

    const sweep = (p: SweepView, caption: string, dur: number): void => {
      settle();
      if (p.sets.length !== geo.length) throw new Error('flow-graphs-stage: 모음 수가 블록 수와 다르다');
      // 이번 걸음에 바뀐 모음만 두드러지게 — 나머지는 흐리게
      for (const m of [...heads, ...ends]) for (const c of m.values()) c.g.setAttribute('opacity', '0.45');
      const fly: { chip: ChipEl; pts: Pt[] }[] = [];

      const rebuild = (store: Map<number, ChipEl>, chips: SetChip[], y: number, changed: boolean): Map<number, ChipEl> => {
        // 모음은 줄지 않는다 — 있던 칩은 제자리(칸이 밀리면 새 칸)에 다시 서고, 새 칩만 날아 든다
        for (const old of store.values()) old.g.remove();
        const xs = stripLayout(chips);
        const next = new Map<number, ChipEl>();
        chips.forEach((c, j) => {
          const chip = makeChip(c, xs[j]!, y, c.fresh);
          chip.g.setAttribute('opacity', changed ? '1' : '0.45');
          next.set(c.def, chip);
        });
        return next;
      };

      p.sets.forEach((s, b) => {
        const g = geo[b]!;
        const oldHeads = heads[b];
        const oldEnds = ends[b];
        if (oldHeads === undefined || oldEnds === undefined) throw new Error('flow-graphs-stage: 자르기 전에 훑었다');
        markStrip(`h${b}`, s.headChanged);
        markStrip(`e${b}`, s.endChanged);
        const newHeads = rebuild(oldHeads, s.head, g.headY, s.headChanged);
        const newEnds = rebuild(oldEnds, s.end, g.footY, s.endChanged);
        heads[b] = newHeads;
        ends[b] = newEnds;
        // 새로 든 칩의 출발 자리
        s.head.forEach((c) => {
          if (!c.fresh) return;
          if (c.from.kind !== 'edge') throw new Error('flow-graphs-stage: 머리 칩은 간선에서 온다');
          const src = ends[c.from.block]?.get(c.def);
          if (src === undefined) throw new Error('flow-graphs-stage: 머리 칩의 출발 칩이 없다');
          const chip = newHeads.get(c.def)!;
          const route = edgePath(c.from.block, b);
          fly.push({
            chip,
            pts: [{ x: src.x, y: src.y }, route[0]!, ...route, route[route.length - 1]!, { x: chip.x, y: chip.y }],
          });
        });
      });
      // 끝 칩 — 이 블록이 넣은 것은 명령 줄에서, 머리에서 지나온 것은 머리 칩에서 내려온다
      p.sets.forEach((s, b) => {
        s.end.forEach((c) => {
          if (!c.fresh) return;
          const chip = ends[b]!.get(c.def)!;
          let start: Pt;
          if (c.from.kind === 'gen') {
            const ln = lineAt(c.def);
            const span = tokenSpan(ln.tokens, (tk) => tk.role === 'def');
            start = { x: span.x, y: ln.y };
          } else if (c.from.kind === 'head') {
            const h = heads[b]!.get(c.def);
            if (h === undefined) throw new Error('flow-graphs-stage: 끝 칩의 머리 칩이 없다');
            start = { x: h.x, y: h.y };
          } else throw new Error('flow-graphs-stage: 끝 칩은 간선에서 오지 않는다');
          fly.push({ chip, pts: [start, { x: chip.x, y: chip.y }] });
        });
      });
      for (const f of fly) {
        const { chip, pts } = f;
        const first = pts[0]!;
        chip.g.setAttribute('transform', `translate(${first.x.toFixed(1)},${first.y.toFixed(1)})`);
        tween(dur, (k) => {
          const q = along(pts, k);
          chip.g.setAttribute('transform', `translate(${q.x.toFixed(1)},${q.y.toFixed(1)})`);
        });
      }
      setCaption(caption);
    };

    // ── 사슬 — 넣기에서 읽기로, 갈래가 만나면 두 가닥 ──────────────────────────────
    const chains = (p: ChainsView, caption: string, dur: number): void => {
      settle();
      for (const g of chainEls) g.setAttribute('opacity', '0.28');
      for (const m of [...heads, ...ends]) for (const c of m.values()) c.g.setAttribute('opacity', '0.45');
      const g = el('g', {}, layerChains);
      chainEls.push(g);
      const grow: { path: SVGPathElement; len: number }[] = [];
      for (const r of p.reads) {
        const reader = lineAt(r.instr);
        const span = tokenSpan(reader.tokens, (tk) => tk.role === 'read' && tk.slot === r.slot);
        const color = colorOf(r.name);
        const many = r.defs.length >= 2;
        // 선은 줄 사이 틈(글자 아래 7)으로만 가로지른다 — 글자를 긋지 않는다
        const ey = reader.y + 7;
        for (const d of r.defs) {
          const writer = lineAt(d);
          const defSpan = tokenSpan(writer.tokens, (tk) => tk.role === 'def');
          const sx = FX + 4;
          const sy = writer.y + 7;
          const dist = Math.abs(ey - sy);
          const gx = FX - 14 - Math.min(120, 10 + dist * 0.32);
          const bend =
            dist < 8
              ? cubic({ x: sx, y: sy }, { x: FX - 34, y: sy - 16 }, { x: FX - 34, y: ey + 16 }, { x: sx, y: ey }, 20)
              : cubic({ x: sx, y: sy }, { x: gx, y: sy }, { x: gx, y: ey }, { x: sx, y: ey }, 24);
          const pts = [{ x: defSpan.x + defSpan.w / 2, y: sy }, ...bend, { x: span.x + span.w / 2, y: ey }];
          const len = polyLength(pts);
          const path = el(
            'path',
            {
              d: pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '),
              fill: 'none',
              stroke: color,
              'stroke-width': many ? 2.4 : 1.4,
              'stroke-dasharray': len.toFixed(1),
              'stroke-dashoffset': len.toFixed(1),
            },
            g,
          );
          grow.push({ path, len });
        }
        el(
          'line',
          {
            x1: span.x,
            x2: span.x + span.w,
            y1: reader.y + 7,
            y2: reader.y + 7,
            stroke: color,
            'stroke-width': many ? 2.4 : 1.4,
          },
          g,
        );
        if (many) {
          const bx = span.x + span.w + 7;
          const by = reader.y - 10;
          el('circle', { cx: bx, cy: by, r: 6, fill: pal.itemComparing }, g);
          const cnt = el(
            'text',
            {
              x: bx,
              y: by,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-size': fontSizes.xs,
              'font-weight': 700,
              fill: pal.textInverse,
            },
            g,
          );
          cnt.textContent = String(r.defs.length);
        }
      }
      tween(dur, (k) => {
        for (const q of grow) q.path.setAttribute('stroke-dashoffset', (q.len * (1 - k)).toFixed(1));
      });
      setCaption(caption);
    };

    const clear = (): void => {
      settle();
      wipeResults();
      clearGroup(layerSource);
      clearGroup(layerLines);
      lines.clear();
      order = [];
      setCaption('');
    };

    const surface: FlowGraphsStage = { round, cut, edges, sweep, chains, clear };
    return {
      ...surface,
      destroy() {
        destroyed = true;
        for (const a of [...anims]) cancelAnimationFrame(a.id);
        anims.clear();
        root.remove();
      },
    };
  },
};
