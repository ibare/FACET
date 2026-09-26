/**
 * fold-at-compile 무대.
 *
 * 줄마다 식 아래에 연산 마디가 덮는 칸을 층층의 받침으로 그린다 — 가장 안쪽 마디가 글자에 가장
 * 가깝다. 접는 걸음에서는 마디의 두 수와 기호가 가운데로 모여 오그라들고 그 자리에 셈한 수가
 * 돋아난다. 뒤의 글자는 빈 칸을 메우러 당겨지고, 바깥 마디의 받침은 한 층 올라와 좁아진다.
 * 그대로 두는 걸음에서는 두 쪽이 안으로 당겨졌다가 되돌아가고, 막은 쪽에 테두리가 선다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import {
  lineView,
  nodeKey,
  nodeText,
  opsAtStart,
  opsNow,
  type FoldScene,
  type LineView,
  type ViewSpan,
  type ViewToken,
} from './scene.js';

const H = 300;
const NS = 'http://www.w3.org/2000/svg';
const PAD = 16;
const GUTTER_W = 40;
const PANEL_W = 150;
const CODE_GAP = 30;
const CAPTION_BAND = 44;
const MONO_RATIO = 0.6;
const FOLD_MS = 650;
const KEEP_MS = 500;
const FRAME_MS = 16;

type Layout = {
  cw: number;
  fs: number;
  x0: number;
  base: number[];
  rowGap: number;
  panelX: number;
};

type Anim =
  | { kind: 'fold'; line: number; before: LineView; after: LineView; p: number; path: string }
  | { kind: 'keep'; line: number; view: LineView; p: number; path: string };

const r2 = (v: number): number => {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
};
const lerp = (a: number, b: number, e: number): number => a + (b - a) * e;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v: number): number => {
  const x = clamp01(v);
  return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
};

function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 자리는 앞 프로그램(아무것도 접지 않은 모습)에서 한 번 정한다 — 걸음마다 줄이 들썩이지 않게. */
function layoutOf(scene: FoldScene): Layout {
  const start: FoldScene = { lines: scene.lines, folded: [], kept: [], step: null };
  const views = scene.lines.map((_, i) => lineView(start, i + 1));
  const maxChars = Math.max(
    ...views.map((v) => Math.max(...v.tokens.map((tok) => tok.col + tok.text.length))),
  );
  const x0 = PAD + GUTTER_W;
  const panelX = PIECE_CANVAS_W - PAD - PANEL_W;
  const codeW = panelX - CODE_GAP - x0;
  const cw = Math.min(parseFloat(fontSizes.xl) * MONO_RATIO, codeW / maxChars);
  const fs = cw / MONO_RATIO;
  const rows = views.map((v) => Math.max(0, ...v.spans.map((s) => s.row)));
  const room = H - PAD - CAPTION_BAND;
  let rowGap = 9;
  let gap = 16;
  const need = (): number => rows.reduce((acc, r) => acc + fs * 1.1 + r * rowGap + gap, 0);
  if (need() > room) {
    const k = room / need();
    rowGap *= k;
    gap *= k;
  }
  const base: number[] = [];
  let y = PAD + (room - need()) / 2;
  for (const r of rows) {
    base.push(y + fs * 0.9);
    y += fs * 1.1 + r * rowGap + gap;
  }
  return { cw, fs, x0, base, rowGap, panelX };
}

export const foldAtCompileStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const monoSize = (fs: number): string => `${r2(fs)}px`;

    function drawToken(
      g: SVGElement,
      L: Layout,
      y: number,
      tok: ViewToken,
      x: number,
      scale: number,
      current: boolean,
    ): void {
      const w = tok.text.length * L.cw;
      const cx = x + w / 2;
      const wrap =
        scale === 1
          ? g
          : g.appendChild(
              el('g', { transform: `translate(${r2(cx)},${r2(y)}) scale(${r2(scale)}) translate(${r2(-cx)},${r2(-y)})` }),
            );
      if (tok.folded) {
        wrap.appendChild(
          el('rect', {
            x: x - 3,
            y: y - L.fs * 0.82,
            width: w + 6,
            height: L.fs * 1.08,
            rx: 3,
            fill: colors.accent,
            stroke: current ? colors.text : 'none',
            'stroke-width': current ? 1.5 : 0,
          }),
        );
      }
      wrap.appendChild(
        el(
          'text',
          {
            x,
            y,
            'font-family': fonts.mono,
            'font-size': monoSize(L.fs),
            fill: tok.folded ? colors.stateInk : tok.role === 'head' ? colors.textMuted : colors.text,
            'xml:space': 'preserve',
          },
          tok.text,
        ),
      );
    }

    function drawSpan(
      g: SVGElement,
      L: Layout,
      y: number,
      s: { c1: number; c2: number; opCol: number; row: number },
      kept: boolean,
      current: boolean,
    ): void {
      const x1 = L.x0 + s.c1 * L.cw;
      const x2 = L.x0 + s.c2 * L.cw;
      const xo = L.x0 + (s.opCol + 0.5) * L.cw;
      const yb = y + L.fs * 0.3 + s.row * L.rowGap;
      g.appendChild(
        el('path', {
          d: `M${r2(x1)} ${r2(yb - 4)}V${r2(yb)}H${r2(x2)}V${r2(yb - 4)}M${r2(xo)} ${r2(yb)}V${r2(y + L.fs * 0.3)}`,
          fill: 'none',
          stroke: kept ? colors.itemComparing : colors.textMuted,
          'stroke-width': current ? 2.4 : 1.4,
          'stroke-dasharray': kept ? '4 3' : 'none',
          'stroke-linejoin': 'round',
        }),
      );
    }

    /** 막은 쪽(수가 아닌 자식)을 두른다. */
    function drawBlock(g: SVGElement, L: Layout, y: number, view: LineView, span: ViewSpan, dx: (tok: ViewToken) => number): void {
      if (span.kept === null) return;
      const sides: string[] =
        span.kept === 'both' ? [`${span.path}l`, `${span.path}r`] : [span.kept === 'left' ? `${span.path}l` : `${span.path}r`];
      for (const side of sides) {
        const toks = view.tokens.filter((tok) => tok.role !== 'head' && tok.path.startsWith(side));
        if (toks.length === 0) continue;
        const a = Math.min(...toks.map((tok) => L.x0 + tok.col * L.cw + dx(tok)));
        const b = Math.max(...toks.map((tok) => L.x0 + (tok.col + tok.text.length) * L.cw + dx(tok)));
        g.appendChild(
          el('rect', {
            x: a - 3,
            y: y - L.fs * 0.82,
            width: b - a + 6,
            height: L.fs * 1.08,
            rx: 3,
            fill: 'none',
            stroke: colors.itemComparing,
            'stroke-width': 1.6,
          }),
        );
      }
    }

    function drawLineStatic(g: SVGElement, L: Layout, y: number, view: LineView, cur: string | null, tug: number): void {
      const curPath = cur;
      const dx = (tok: ViewToken): number => {
        if (curPath === null || tug === 0 || tok.role === 'head' || tok.role === 'op' && tok.path === curPath) return 0;
        if (tok.path.startsWith(`${curPath}l`)) return tug;
        if (tok.path.startsWith(`${curPath}r`)) return -tug;
        return 0;
      };
      for (const s of view.spans) {
        drawSpan(g, L, y, s, s.kept !== null, s.path === curPath);
        drawBlock(g, L, y, view, s, dx);
      }
      for (const tok of view.tokens) {
        drawToken(g, L, y, tok, L.x0 + tok.col * L.cw + dx(tok), 1, tok.folded && tok.path === curPath);
      }
    }

    function drawLineFold(g: SVGElement, L: Layout, y: number, a: Extract<Anim, { kind: 'fold' }>): void {
      const gather = ease(a.p / 0.7);
      const grow = ease((a.p - 0.45) / 0.55);
      const slide = ease(a.p);
      const born = a.after.tokens.find((tok) => tok.path === a.path && tok.folded);
      if (born === undefined) throw new Error(`fold-at-compile: L${a.line} 의 접힌 수를 찾지 못했다`);
      const bornCx = L.x0 + (born.col + born.text.length / 2) * L.cw;
      const beforeByKey = new Map(a.before.tokens.map((tok) => [tok.key, tok]));
      const afterKeys = new Set(a.after.tokens.map((tok) => tok.key));
      const beforeSpans = new Map(a.before.spans.map((s) => [s.path, s]));

      for (const s of a.after.spans) {
        const b = beforeSpans.get(s.path);
        const m =
          b === undefined
            ? s
            : { c1: lerp(b.c1, s.c1, slide), c2: lerp(b.c2, s.c2, slide), opCol: lerp(b.opCol, s.opCol, slide), row: lerp(b.row, s.row, slide) };
        drawSpan(g, L, y, m, s.kept !== null, false);
        drawBlock(g, L, y, a.after, s, () => 0);
      }
      const gone = beforeSpans.get(a.path);
      if (gone !== undefined && gather < 1) {
        const mid = (bornCx - L.x0) / L.cw;
        drawSpan(
          g,
          L,
          y,
          { c1: lerp(gone.c1, mid, gather), c2: lerp(gone.c2, mid, gather), opCol: lerp(gone.opCol, mid - 0.5, gather), row: gone.row },
          false,
          true,
        );
      }
      for (const tok of a.after.tokens) {
        const b = beforeByKey.get(tok.key);
        if (b !== undefined) {
          drawToken(g, L, y, tok, L.x0 + lerp(b.col, tok.col, slide) * L.cw, 1, false);
        } else if (grow > 0) {
          drawToken(g, L, y, tok, L.x0 + tok.col * L.cw, Math.max(0.05, grow), true);
        }
      }
      if (gather < 1) {
        for (const tok of a.before.tokens) {
          if (afterKeys.has(tok.key)) continue;
          const w = tok.text.length * L.cw;
          const cx0 = L.x0 + tok.col * L.cw + w / 2;
          const cx = lerp(cx0, bornCx, gather);
          drawToken(g, L, y, tok, cx - w / 2, Math.max(0.05, 1 - gather), false);
        }
      }
    }

    function drawPanel(scene: FoldScene, L: Layout): void {
      const g = svg.appendChild(el('g', {}));
      const x = L.panelX;
      const rowH = (H - PAD - CAPTION_BAND) / 3;
      const top = PAD + rowH * 0.35;
      const rows: { label: string; value: string }[] = [
        { label: t('label.folded', 'Folded'), value: String(scene.folded.length) },
        { label: t('label.kept', 'Kept'), value: String(scene.kept.length) },
        {
          label: t('label.runtime', 'Operations at run time'),
          value: `${opsAtStart(scene)} → ${opsNow(scene)}`,
        },
      ];
      rows.forEach((row, i) => {
        const y = top + i * rowH;
        g.appendChild(
          el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted }, row.label),
        );
        g.appendChild(
          el(
            'text',
            { x, y: y + parseFloat(fontSizes.xl) + 6, 'font-family': fonts.mono, 'font-size': fontSizes.xl, fill: colors.text },
            row.value,
          ),
        );
      });
      g.appendChild(
        el('line', {
          x1: x - 14,
          y1: PAD,
          x2: x - 14,
          y2: H - CAPTION_BAND - 4,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
    }

    function caption(scene: FoldScene): string {
      const st = scene.step;
      if (st === null) return t('caption.start', 'Start — nothing is folded yet.');
      const key = nodeKey(st.line, st.path);
      const expr = nodeText(scene, st.line, st.path, key);
      if (st.kind === 'fold') {
        return t('caption.fold', 'L{line} · {expr} — both sides are numbers. Folded: {value}', {
          line: st.line,
          expr,
          value: st.value,
        });
      }
      if (st.blocked === 'both') {
        return t('caption.keep.both', 'L{line} · {expr} — neither side is a number. Kept.', { line: st.line, expr });
      }
      if (st.blocked === 'left') {
        return t('caption.keep.left', 'L{line} · {expr} — the left side is not a number: {name}. Kept.', {
          line: st.line,
          expr,
          name: nodeText(scene, st.line, `${st.path}l`, key),
        });
      }
      return t('caption.keep.right', 'L{line} · {expr} — the right side is not a number: {name}. Kept.', {
        line: st.line,
        expr,
        name: nodeText(scene, st.line, `${st.path}r`, key),
      });
    }

    function draw(scene: FoldScene, anim: Anim | null): void {
      svg.textContent = '';
      const L = layoutOf(scene);
      svg.appendChild(el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: colors.bg }));
      const st = scene.step;
      scene.lines.forEach((_, i) => {
        const line = i + 1;
        const y = L.base[i];
        if (y === undefined) throw new Error(`fold-at-compile: L${line} 의 자리를 셈하지 못했다`);
        const g = svg.appendChild(el('g', {}));
        g.appendChild(
          el(
            'text',
            {
              x: PAD,
              y,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: st !== null && st.line === line ? colors.text : colors.textMuted,
            },
            t('label.line', 'L{n}', { n: line }),
          ),
        );
        if (anim !== null && anim.line === line) {
          if (anim.kind === 'fold') drawLineFold(g, L, y, anim);
          else drawLineStatic(g, L, y, anim.view, anim.path, 4 * Math.sin(Math.PI * anim.p));
          return;
        }
        drawLineStatic(g, L, y, lineView(scene, line), st !== null && st.line === line ? st.path : null, 0);
      });
      drawPanel(scene, L);
      svg.appendChild(
        el(
          'text',
          { x: PAD, y: H - CAPTION_BAND / 2 + 5, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text },
          caption(scene),
        ),
      );
    }

    function drawStatic(scene: FoldScene): void {
      draw(scene, null);
    }

    function run(ms: number, frame: (p: number) => void, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = clamp01((Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: FoldScene, prev: FoldScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const st = next.step;
      if (!opts.animate || prev === null || st === null) {
        drawStatic(next);
        return;
      }
      const key = nodeKey(st.line, st.path);
      if (st.kind === 'fold') {
        const before = lineView(next, st.line, key);
        const after = lineView(next, st.line);
        await run(FOLD_MS, (p) => draw(next, { kind: 'fold', line: st.line, before, after, p, path: st.path }), mine);
      } else {
        const view = lineView(next, st.line);
        await run(KEEP_MS, (p) => draw(next, { kind: 'keep', line: st.line, view, p, path: st.path }), mine);
      }
      if (destroyed || mine !== gen) return;
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
