/**
 * return-to-caller 무대 — 돌려준 값이 부른 자리의 글자 속으로 내려앉는다.
 *
 * 주인공은 부르기 식이 적힌 줄이다. 부르기 식마다 제 색을 가진다. 돌아옴 걸음에서
 * 값 칩이 return 줄에서 그 부르기 식이 **적혀 있던 글자 자리**로 날아가 끼워지고,
 * 그 줄의 나머지 글자는 짧아진 만큼 당겨진다. 끼워진 자리 위에는 원래 식 글자가 작게 남는다.
 *
 * 그림은 장면에서만 선다. 좌표는 여기서 셈한다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ReturnToCallerScene, RtcSeg } from './scene.js';

const H = 330;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 코드 글자 앞 여백. 그 왼쪽에 지금 밟은 줄의 표지가 선다. */
const PAD_X = 34;
/** 오른쪽 변수 칸의 폭 */
const VAR_W = 120;
/** 고정폭 글꼴의 글자 폭 / 글꼴 크기 */
const MONO_RATIO = 0.6;
const MOVE_MS = 400;
const INDENT = 4;

type Pt = { x: number; y: number };

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function segLen(s: RtcSeg): number {
  return s.kind === 'value' ? s.value.length : s.text.length;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type Geo = {
  fs: number;
  cw: number;
  rowY: number[];
  chipH: number;
  outY: number;
  captionY: number;
  varX: number;
};

type Handles = {
  segs: Map<string, SVGGElement>;
  /** 인자 칩과 그 한가운데 x */
  params: { node: SVGGElement; x: number; cid: number }[];
  ret: SVGGElement | null;
  vars: Map<string, SVGGElement>;
  /** 출력 칩과 그 한가운데 x */
  out: { node: SVGGElement; x: number }[];
};

export const returnToCallerStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & {
    render(next: ReturnToCallerScene, prev: ReturnToCallerScene | null, opts: { animate: boolean }): Promise<void>;
  } {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const monoMax = parseFloat(fontSizes.xl);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

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
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, x: number, y: number, text: string, size: number, fill: string, family: string, weight = 'normal'): void {
      const node = el('text', { x, y, fill, 'font-family': family, 'font-size': size, 'font-weight': weight }, parent);
      node.textContent = text;
    }

    function colorOf(scene: ReturnToCallerScene, cid: number): string {
      const cols = categorical(Math.max(scene.calls, 1));
      return cols[cid] ?? c.accent;
    }

    /** 줄 차림 — 코드 글자 크기와 줄마다 세로 자리. 캔버스에서 역산한다. */
    function geometry(scene: ReturnToCallerScene): Geo {
      const maxChars = Math.max(1, ...scene.lines.map((l) => l.indent * INDENT + l.segs.reduce((n, s) => n + segLen(s), 0)));
      const fs = Math.min(monoMax, (W - PAD_X * 2 - VAR_W) / (maxChars * MONO_RATIO));
      const cw = fs * MONO_RATIO;
      const captionY = H - 20;
      const outY = H - 70;
      const top = 22;
      const bottom = outY - fs * 1.8;
      // 줄 사이 단위: 줄 하나 1, 함수 덩어리가 끝난 뒤 0.5, 부르기 식이 든 줄 위 0.55 (원래 식 글자 자리)
      const extra: number[] = scene.lines.map((l, i) => {
        let e = 0;
        const prevLine = scene.lines[i - 1];
        if (i > 0 && l.indent === 0 && prevLine !== undefined && prevLine.indent > 0) e += 0.5;
        if (l.segs.some((s) => s.kind !== 'text')) e += 0.55;
        return e;
      });
      const units = scene.lines.length + extra.reduce((a, b) => a + b, 0);
      const rowH = Math.min(fs * 2.2, (bottom - top) / Math.max(units, 1));
      const rowY: number[] = [];
      let y = top;
      scene.lines.forEach((_, i) => {
        y += (extra[i] ?? 0) * rowH;
        rowY.push(y + rowH * 0.62);
        y += rowH;
      });
      return { fs, cw, rowY, chipH: fs * 1.4, outY, captionY, varX: W - PAD_X - VAR_W + 12 };
    }

    /** 줄 i 의 조각들이 서는 글자 칸 (시작 칸 · 끝 칸). */
    function spans(indent: number, segs: readonly RtcSeg[]): { from: number; to: number }[] {
      const out: { from: number; to: number }[] = [];
      let at = indent * INDENT;
      for (const s of segs) {
        const n = segLen(s);
        out.push({ from: at, to: at + n });
        at += n;
      }
      return out;
    }

    function lineEndCol(scene: ReturnToCallerScene, i: number): number {
      const l = scene.lines[i];
      if (l === undefined) return 0;
      return l.indent * INDENT + l.segs.reduce((n, s) => n + segLen(s), 0);
    }

    function colX(g: Geo, col: number): number {
      return PAD_X + col * g.cw;
    }

    function chipW(g: Geo, text: string): number {
      return Math.max(text.length * g.cw + g.fs * 0.9, g.fs * 1.8);
    }

    /** 값 칩 하나 — (x, y) 는 칩 왼쪽 글자 기준선. */
    function chip(parent: Element, g: Geo, x: number, y: number, text: string, stroke: string, tint: string | null): number {
      const w = chipW(g, text);
      el('rect', {
        x,
        y: y - g.chipH * 0.72,
        width: w,
        height: g.chipH,
        rx: 5,
        fill: tint ?? c.bg,
        'fill-opacity': tint === null ? 1 : 0.22,
        stroke,
        'stroke-width': 2,
      }, parent);
      if (tint !== null) el('rect', { x, y: y - g.chipH * 0.72, width: w, height: g.chipH, rx: 5, fill: 'none', stroke, 'stroke-width': 2 }, parent);
      const tx = el('text', {
        x: x + w / 2,
        y,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.mono,
        'font-size': g.fs,
        'font-weight': 'bold',
      }, parent);
      tx.textContent = text;
      return w;
    }

    /** return 줄 옆, 돌려줄 값이 서는 자리. */
    function retAt(scene: ReturnToCallerScene, g: Geo, line: number): Pt {
      return { x: colX(g, lineEndCol(scene, line) + 2) + g.cw * 2, y: g.rowY[line] ?? 0 };
    }

    /** 머리줄 옆, 인자 자리 k 가 서는 곳 (이름 글자 왼쪽). */
    function paramAt(scene: ReturnToCallerScene, g: Geo, header: number): number {
      return colX(g, lineEndCol(scene, header) + 3);
    }

    /** 줄 끝에 적힌 식(expr)의 한가운데. */
    function exprMid(scene: ReturnToCallerScene, g: Geo, line: number, expr: string): Pt {
      const end = lineEndCol(scene, line);
      return { x: colX(g, end - expr.length / 2), y: g.rowY[line] ?? 0 };
    }

    function segMid(g: Geo, indent: number, segs: readonly RtcSeg[], line: number, cid: number): Pt | null {
      const sp = spans(indent, segs);
      const k = segs.findIndex((s) => s.kind !== 'text' && s.cid === cid);
      const span = sp[k];
      if (span === undefined) return null;
      return { x: colX(g, (span.from + span.to) / 2), y: g.rowY[line] ?? 0 };
    }

    /**
     * 끼워진 자리 위 원래 식 글자의 층. 값이 짧아 이웃 자리가 붙으면 글자가 겹치므로
     * 왼쪽부터 놓아 가며 겹치는 것만 한 층 위로 올린다.
     */
    function capTiers(g: Geo, segs: readonly RtcSeg[], sp: readonly { from: number; to: number }[]): Map<number, number> {
      const tiers = new Map<number, number>();
      const ends: number[] = [];
      segs.forEach((s, k) => {
        const span = sp[k];
        if (s.kind !== 'value' || span === undefined) return;
        const mid = colX(g, (span.from + span.to) / 2);
        const half = (s.call.length * xsPx * MONO_RATIO) / 2;
        let tier = 0;
        while ((ends[tier] ?? -Infinity) > mid - half - 4) tier += 1;
        ends[tier] = mid + half;
        tiers.set(k, tier);
      });
      return tiers;
    }

    function drawStatic(scene: ReturnToCallerScene): { g: Geo; h: Handles } {
      svg.textContent = '';
      const g = geometry(scene);
      const h: Handles = { segs: new Map(), params: [], ret: null, vars: new Map(), out: [] };
      if (scene.lines.length === 0) return { g, h };

      // 함수 몸 — 머리줄부터 들여쓴 줄이 이어지는 데까지 한 덩어리
      scene.lines.forEach((l, i) => {
        const segText = l.segs.map((s) => (s.kind === 'text' ? s.text : '')).join('');
        if (l.indent !== 0 || !segText.startsWith('function ')) return;
        let last = i;
        while ((scene.lines[last + 1]?.indent ?? 0) > 0) last += 1;
        const y0 = (g.rowY[i] ?? 0) - g.fs * 1.25;
        const y1 = (g.rowY[last] ?? 0) + g.fs * 0.8;
        el('rect', {
          x: PAD_X - 12,
          y: y0,
          width: g.varX - PAD_X - 8,
          height: y1 - y0,
          rx: 8,
          fill: c.bgSubtle,
          stroke: c.border,
        }, svg);
      });

      // 지금 밟은 줄의 표지
      if (scene.at !== null) {
        const y = g.rowY[scene.at] ?? 0;
        el('rect', { x: 8, y: y - g.fs * 0.8, width: 5, height: g.fs * 1.05, rx: 2, fill: c.accent }, svg);
      }

      const live = new Set(scene.frames.map((f) => f.cid));

      // 줄들
      scene.lines.forEach((l, i) => {
        const y = g.rowY[i] ?? 0;
        const sp = spans(l.indent, l.segs);
        const tiers = capTiers(g, l.segs, sp);
        l.segs.forEach((s, k) => {
          const span = sp[k];
          if (span === undefined) return;
          const grp = el('g', {}, svg);
          h.segs.set(`${i}:${k}`, grp);
          const x = colX(g, span.from);
          if (s.kind === 'text') {
            const lead = s.text.length - s.text.trimStart().length;
            const body = s.text.trim();
            if (body.length > 0) label(grp, colX(g, span.from + lead), y, body, g.fs, c.text, fonts.mono);
            return;
          }
          const col = colorOf(scene, s.cid);
          if (s.kind === 'call') {
            label(grp, x, y, s.text, g.fs, c.text, fonts.mono);
            const w = s.text.length * g.cw;
            if (live.has(s.cid)) {
              el('rect', {
                x: x - g.cw * 0.3,
                y: y - g.fs * 1.0,
                width: w + g.cw * 0.6,
                height: g.fs * 1.4,
                rx: 4,
                fill: 'none',
                stroke: col,
                'stroke-width': 2,
                'stroke-dasharray': '5 3',
              }, grp);
            } else {
              el('line', { x1: x, y1: y + g.fs * 0.3, x2: x + w, y2: y + g.fs * 0.3, stroke: col, 'stroke-width': 2 }, grp);
            }
            return;
          }
          // 값이 끼워진 자리 — 원래 식 글자는 위에 작게
          const w = s.value.length * g.cw;
          const bx = x - g.cw * 0.4;
          const bw = w + g.cw * 0.8;
          el('rect', { x: bx, y: y - g.fs * 1.0, width: bw, height: g.fs * 1.4, rx: 4, fill: col, 'fill-opacity': 0.22 }, grp);
          el('rect', { x: bx, y: y - g.fs * 1.0, width: bw, height: g.fs * 1.4, rx: 4, fill: 'none', stroke: col, 'stroke-width': 2 }, grp);
          label(grp, x, y, s.value, g.fs, c.text, fonts.mono, 'bold');
          const tier = tiers.get(k) ?? 0;
          const capY = y - g.fs * 1.25 - tier * (xsPx + 2);
          if (tier > 0) {
            el('line', { x1: x + w / 2, y1: capY + 2, x2: x + w / 2, y2: y - g.fs * 1.0, stroke: col, 'stroke-width': 1 }, grp);
          }
          const cap = el('text', {
            x: x + w / 2,
            y: capY,
            'text-anchor': 'middle',
            fill: col,
            'font-family': fonts.mono,
            'font-size': xsPx,
          }, grp);
          cap.textContent = s.call;
        });
      });

      // 살아 있는 틀 — 머리줄 옆 인자 자리
      for (const f of scene.frames) {
        const y = g.rowY[f.header] ?? 0;
        let x = paramAt(scene, g, f.header);
        const col = colorOf(scene, f.cid);
        for (const a of f.args) {
          label(svg, x, y, a.param, g.fs, c.textMuted, fonts.mono);
          x += (a.param.length + 1) * g.cw;
          const grp = el('g', {}, svg);
          const w = chip(grp, g, x, y, a.value, col, null);
          h.params.push({ node: grp, x: x + w / 2, cid: f.cid });
          x += w + g.cw;
        }
      }

      // 몸 밖으로 나온 돌려줄 값
      if (scene.ret !== null) {
        const at = retAt(scene, g, scene.ret.line);
        label(svg, at.x - g.cw * 2, at.y, '→', g.fs, c.textMuted, fonts.mono);
        const grp = el('g', {}, svg);
        h.ret = grp;
        chip(grp, g, at.x, at.y, scene.ret.value, colorOf(scene, scene.ret.cid), null);
      }

      // 변수
      for (const v of scene.vars) {
        const y = g.rowY[v.line] ?? 0;
        label(svg, g.varX, y, v.name, g.fs, c.textMuted, fonts.mono);
        const grp = el('g', {}, svg);
        h.vars.set(v.name, grp);
        chip(grp, g, g.varX + (v.name.length + 1) * g.cw, y, v.value, c.border, null);
      }

      // 출력
      label(svg, PAD_X - 12, g.outY, t('label.output', 'output'), smPx, c.textMuted, fonts.body);
      let ox = PAD_X + g.cw * 6;
      for (const v of scene.out) {
        const grp = el('g', {}, svg);
        const w = chip(grp, g, ox, g.outY, v, c.border, null);
        h.out.push({ node: grp, x: ox + w / 2 });
        ox += w + g.cw;
      }

      // 캡션 — 지금 일어나는 일만
      const cap = caption(scene);
      if (cap !== '') label(svg, PAD_X - 12, g.captionY, cap, parseFloat(fontSizes.md), c.text, fonts.body);
      return { g, h };
    }

    function caption(scene: ReturnToCallerScene): string {
      const s = scene.step;
      switch (s.kind) {
        case 'start':
          return scene.lines.length === 0 ? '' : t('caption.start', 'Start: no line has run yet.');
        case 'call': {
          const f = scene.frames.find((x) => x.cid === s.cid);
          const segs = scene.lines[s.line]?.segs ?? [];
          const seg = segs.find((x) => x.kind === 'call' && x.cid === s.cid);
          const args = (f?.args ?? []).map((a) => `${a.param} = ${a.value}`).join(', ');
          return t('caption.call', 'Call {call}: the argument slots get {args}.', {
            call: seg !== undefined && seg.kind === 'call' ? seg.text : '',
            args,
          });
        }
        case 'return':
          return t('caption.return', 'The body hands back {value}.', { value: s.value });
        case 'arrive': {
          const seg = (scene.lines[s.line]?.segs ?? []).find((x) => x.kind === 'value' && x.cid === s.cid);
          return t('caption.arrive', 'Back with {value}: it drops into the spot where {call} was written.', {
            value: s.value,
            call: seg !== undefined && seg.kind === 'value' ? seg.call : '',
          });
        }
        case 'assign':
          return t('caption.assign', '{expr} = {value}, into {name}.', {
            expr: s.expr,
            value: s.value,
            name: s.name,
          });
        case 'show':
          return t('caption.show', 'show prints {value}.', { value: s.value });
      }
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        if (destroyed || mine !== gen) return finish();
        waiters.add(finish);
        const start = Date.now();
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

    /** 끝 자리에 선 요소를 아직 못 온 만큼 되돌려 놓는다. */
    function shift(node: Element | null | undefined, dx: number, dy: number, left: number): void {
      if (node === null || node === undefined) return;
      node.setAttribute('transform', `translate(${r2(dx * left)},${r2(dy * left)})`);
    }

    async function render(next: ReturnToCallerScene, _prev: ReturnToCallerScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const { g, h } = drawStatic(next);
      if (!opts.animate) return;
      const s = next.step;
      let frame: ((p: number) => void) | null = null;

      if (s.kind === 'call') {
        const line = next.lines[s.line];
        const src = line === undefined ? null : segMid(g, line.indent, line.segs, s.line, s.cid);
        const y = g.rowY[s.header] ?? 0;
        const mineParams = h.params.filter((d) => d.cid === s.cid);
        if (src !== null && mineParams.length > 0) {
          // 인자 칩들이 부르기 식 자리에서 머리줄 옆 인자 자리로 올라간다
          const dests = mineParams.map((d) => ({ node: d.node, dx: src.x - d.x, dy: src.y - y }));
          frame = (p) => dests.forEach((d) => shift(d.node, d.dx, d.dy, 1 - p));
        }
      } else if (s.kind === 'return') {
        const from = exprMid(next, g, s.line, s.expr);
        const at = retAt(next, g, s.line);
        const dx = from.x - (at.x + chipW(g, s.value) / 2);
        frame = (p) => shift(h.ret, dx, 0, 1 - p);
      } else if (s.kind === 'arrive') {
        const line = next.lines[s.line];
        if (line !== undefined) {
          const before = spans(line.indent, s.before);
          const after = spans(line.indent, line.segs);
          const k = line.segs.findIndex((x) => x.kind === 'value' && x.cid === s.cid);
          const target = after[k];
          const y = g.rowY[s.line] ?? 0;
          const src = retAt(next, g, s.from);
          const moves: { node: SVGGElement | undefined; dx: number; dy: number }[] = [];
          if (target !== undefined) {
            const w = chipW(g, s.value);
            moves.push({
              node: h.segs.get(`${s.line}:${k}`),
              dx: src.x + w / 2 - colX(g, (target.from + target.to) / 2),
              dy: (g.rowY[s.from] ?? y) - y,
            });
          }
          if (before.length === after.length) {
            after.forEach((sp, i) => {
              if (i === k) return;
              const b = before[i];
              if (b === undefined || b.from === sp.from) return;
              moves.push({ node: h.segs.get(`${s.line}:${i}`), dx: (b.from - sp.from) * g.cw, dy: 0 });
            });
          }
          // 떠나는 식 글자 — 자리를 비워 주며 옅어진다
          const old = s.before[k];
          const oldSpan = before[k];
          let ghost: SVGTextElement | null = null;
          if (old !== undefined && old.kind === 'call' && oldSpan !== undefined) {
            ghost = el('text', {
              x: colX(g, oldSpan.from),
              y,
              fill: c.textMuted,
              'font-family': fonts.mono,
              'font-size': g.fs,
            }, svg);
            ghost.textContent = old.text;
          }
          frame = (p) => {
            for (const m of moves) shift(m.node, m.dx, m.dy, 1 - p);
            if (ghost !== null) ghost.setAttribute('opacity', String(r2(Math.max(0, 1 - p * 2))));
          };
        }
      } else if (s.kind === 'assign') {
        const from = exprMid(next, g, s.line, s.expr);
        const node = h.vars.get(s.name);
        const x = g.varX + (s.name.length + 1) * g.cw + chipW(g, s.value) / 2;
        frame = (p) => shift(node, from.x - x, 0, 1 - p);
      } else if (s.kind === 'show') {
        const from = exprMid(next, g, s.line, s.expr);
        const last = h.out[h.out.length - 1];
        if (last !== undefined) frame = (p) => shift(last.node, from.x - last.x, from.y - g.outY, 1 - p);
      }

      if (frame === null) return;
      const f = frame;
      await tween(MOVE_MS, mine, f);
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
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
