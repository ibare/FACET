/**
 * edges-are-jumps 의 그림.
 *
 * 나뉜 블록이 위에서 아래로 선다. 걸음마다 한 블록의 마지막 줄에서 선이 뻗어 나가 다음에 갈 수 있는
 * 블록에 닿는다 — 적힌 뜀은 실선으로 옆으로 돌아 나가고(앞으로 가면 오른쪽, 거슬러 오르면 왼쪽),
 * 흘러내림은 점선으로 바로 아래 블록에 떨어진다. return 은 아무 데로도 뻗지 않는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { instrText, type EdgesAreJumpsScene, type Instr, type SceneEdge } from './scene.js';

const H = 480;
const SVG = 'http://www.w3.org/2000/svg';
/** 선이 뻗는 시간. 걸음의 운동은 400ms 안쪽. */
const GROW_MS = 380;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return Object.is(n, -0) ? 0 : n;
}

/** 글자 폭 어림 — 한글 · 한자권 글자는 한 칸, 그 밖은 0.56 칸. */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? px : px * 0.56;
  return w;
}

/** 캡션을 낱말 단위로 두 줄 안에 접는다. */
function wrap(s: string, px: number, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur === '' ? w : [cur, w].join(' ');
    if (cur !== '' && textWidth(next, px) > maxW) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function polyLength(pts: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a && b) len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** 꺾인 선의 앞 p 만큼. */
function partial(pts: readonly Pt[], p: number): Pt[] {
  const first = pts[0];
  if (first === undefined) return [];
  if (p >= 1) return [...pts];
  let left = polyLength(pts) * Math.max(0, p);
  const out: Pt[] = [first];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) break;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg >= left) {
      const f = seg === 0 ? 0 : left / seg;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      return out;
    }
    out.push(b);
    left -= seg;
  }
  return out;
}

/** 배열의 한 칸. 없으면 무엇이 없는지 담아 던진다 — 자리를 0 으로 지어내지 않는다 (C6). */
function at<T>(arr: readonly T[], i: number, what: string): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`edges-are-jumps 그림: ${what} ${i + 1} 이 없다`);
  return v;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const edgesAreJumpsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const PX_CODE = parseFloat(fontSizes.sm);
    const PX_CAP = parseFloat(fontSizes.md);
    const PX_SMALL = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(name: string, attrs: Record<string, string | number>, parent: Element, text?: string): SVGElement {
      const node = document.createElementNS(SVG, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function captionOf(s: EdgesAreJumpsScene): string {
      const step = s.step;
      if (step.kind === 'start') {
        return s.blocks.length === 0
          ? t('caption.code', 'Three-address code, one instruction per line.')
          : t('caption.start', 'Already cut into blocks: {n}. No edges yet.', { n: s.blocks.length });
      }
      const b = ['B', String(step.block + 1)].join('');
      const line = step.line + 1;
      const ins = at(s.code, step.line, '줄');
      const out = s.edges.slice(s.edges.length - step.added);
      const name = (i: number): string => ['B', String(i + 1)].join('');
      const only = (kind: SceneEdge['kind']): SceneEdge => {
        const hit = out.filter((e) => e.kind === kind);
        const e = hit[0];
        if (hit.length !== 1 || e === undefined) throw new Error(`edges-are-jumps 그림: 줄 ${line} 의 간선이 모양과 맞지 않는다`);
        return e;
      };
      if (out.length !== { ifnot: 2, goto: 1, return: 0, bin: 1, copy: 1 }[ins.k]) {
        throw new Error(`edges-are-jumps 그림: 줄 ${line} 의 간선 수가 명령과 맞지 않는다`);
      }
      switch (ins.k) {
        case 'ifnot': {
          const j = only('jump');
          const f = only('fall');
          return t('caption.cond', '{b} ends at line {line}: a conditional jump. Two edges — to {j} when {c} is false, down to {f} when it is true.', {
            b,
            line,
            j: name(j.to),
            f: name(f.to),
            c: ins.cond,
          });
        }
        case 'goto': {
          const j = only('jump');
          return j.back
            ? t('caption.gotoBack', '{b} ends at line {line}: a jump to {j}. This edge runs back up — {j} comes before {b}.', { b, line, j: name(j.to) })
            : t('caption.goto', '{b} ends at line {line}: a jump to {j}.', { b, line, j: name(j.to) });
        }
        case 'return':
          return t('caption.return', '{b} ends at line {line}: return. No edge leaves it.', { b, line });
        case 'bin':
        case 'copy':
          return t('caption.fall', '{b} ends at line {line}. Not a jump, so it falls through to {f}, right below.', { b, line, f: name(only('fall').to) });
      }
    }

    function edgeLabel(e: SceneEdge, end: Instr): string {
      const condOf = (): string => {
        if (end.k !== 'ifnot') throw new Error('edges-are-jumps 그림: 조건 붙은 간선인데 끝 명령이 ifnot 이 아니다');
        return end.cond;
      };
      if (e.kind === 'fall') {
        return e.when === 'true'
          ? t('edge.fallTrue', 'fall-through · {c} true', { c: condOf() })
          : t('edge.fall', 'fall-through');
      }
      if (e.when === 'false') return t('edge.jumpFalse', 'jump · {c} false', { c: condOf() });
      return e.back ? t('edge.jumpBack', 'jump · backward') : t('edge.jump', 'jump');
    }

    /** 장면 하나의 화면 전체. grow 는 이번 걸음에 붙은 간선이 뻗은 만큼 (0 … 1). */
    function draw(s: EdgesAreJumpsScene, grow: number): void {
      svg.textContent = '';
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);

      // 캡션 — 지금 일어나는 일
      const capLines = wrap(captionOf(s), PX_CAP, W - 40).slice(0, 2);
      capLines.forEach((line, i) => {
        el('text', { x: W / 2, y: 24 + i * 20, 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md }, svg, line);
      });

      const nl = s.code.length;
      if (nl === 0) return;
      const spans = s.blocks.length > 0 ? s.blocks : [{ first: 0, last: nl - 1 }];
      const named = s.blocks.length > 0;
      const nb = spans.length;

      // 자리 — 캔버스에서 역산한다
      const TOP = 64;
      const FOOT = 52;
      const HDR = 18;
      const PADB = 6;
      const GAP = 36;
      const lh = Math.min(24, (H - TOP - FOOT - nb * (HDR + PADB) - (nb - 1) * GAP) / nl);
      const boxX = Math.round(W * 0.29);
      const boxW = Math.round(W * 0.33);
      const boxR = boxX + boxW;
      const boxTop: number[] = [];
      const boxBot: number[] = [];
      let y = TOP;
      for (const sp of spans) {
        boxTop.push(y);
        y += HDR + (sp.last - sp.first + 1) * lh + PADB;
        boxBot.push(y);
        y += GAP;
      }
      const blockOfLine = (line: number): number => spans.findIndex((sp) => sp.first <= line && line <= sp.last);
      const lineY = (line: number): number => {
        const b = blockOfLine(line);
        const sp = spans[b];
        const top = boxTop[b];
        if (sp === undefined || top === undefined) throw new Error(`edges-are-jumps 그림: 줄 ${line + 1} 이 블록 밖이다`);
        return top + HDR + (line - sp.first) * lh + lh / 2;
      };

      const step = s.step;
      const nowFrom = step.kind === 'emit' ? s.edges.length - step.added : s.edges.length;

      // 블록과 줄
      spans.forEach((sp, b) => {
        const top = at(boxTop, b, '블록');
        const bot = at(boxBot, b, '블록');
        const isNow = step.kind === 'emit' && step.block === b;
        el('rect', { x: boxX, y: top, width: boxW, height: bot - top, rx: 4, fill: c.bgSubtle, stroke: isNow ? c.text : c.border, 'stroke-width': isNow ? 1.6 : 1 }, svg);
        if (named) {
          el('text', { x: boxX + 8, y: top + 13, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 'bold' }, svg, ['B', String(b + 1)].join(''));
        }
        for (let i = sp.first; i <= sp.last; i += 1) {
          const ins = at(s.code, i, '줄');
          const cy = lineY(i);
          const hot = step.kind === 'emit' && step.line === i;
          if (hot) el('rect', { x: boxX + 3, y: cy - lh / 2 + 1, width: boxW - 6, height: lh - 2, rx: 3, fill: c.accent }, svg);
          el('text', { x: boxX + 24, y: cy + PX_CODE * 0.35, 'text-anchor': 'end', fill: hot ? c.stateInk : c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, svg, String(i + 1));
          el('text', { x: boxX + 34, y: cy + PX_CODE * 0.35, fill: hot ? c.stateInk : c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, svg, instrText(ins));
        }
      });

      // 간선 — 자리는 자취의 차례로 정한다 (새 간선이 붙어도 앞 간선의 자리는 그대로)
      let rightLane = 0;
      let leftLane = 0;
      s.edges.forEach((e, idx) => {
        const src = spans[e.from];
        const dst = spans[e.to];
        if (src === undefined || dst === undefined) throw new Error('edges-are-jumps 그림: 간선의 블록이 없다');
        const fromY = lineY(src.last);
        const endIns = at(s.code, src.last, '줄');
        let pts: Pt[];
        let label: Pt;
        let anchor: 'start' | 'end';
        if (e.kind === 'fall') {
          const x = boxX + boxW * 0.5;
          const y0 = at(boxBot, e.from, '블록');
          const y1 = at(boxTop, e.to, '블록');
          pts = [{ x, y: y0 }, { x, y: y1 }];
          label = { x: x + 10, y: (y0 + y1) / 2 + PX_SMALL * 0.35 };
          anchor = 'start';
        } else {
          const toY = lineY(dst.first);
          if (e.back) {
            const lane = boxX - 28 - leftLane * 20;
            leftLane += 1;
            pts = [{ x: boxX, y: fromY }, { x: lane, y: fromY }, { x: lane, y: toY }, { x: boxX, y: toY }];
            label = { x: lane - 8, y: (fromY + toY) / 2 + PX_SMALL * 0.35 };
            anchor = 'end';
          } else {
            const lane = boxR + 28 + rightLane * 20;
            rightLane += 1;
            pts = [{ x: boxR, y: fromY }, { x: lane, y: fromY }, { x: lane, y: toY }, { x: boxR, y: toY }];
            label = { x: lane + 8, y: (fromY + toY) / 2 + PX_SMALL * 0.35 };
            anchor = 'start';
          }
        }
        const isNow = idx >= nowFrom;
        const p = isNow ? grow : 1;
        if (p <= 0) return;
        const shown = partial(pts, p);
        const color = isNow ? c.itemActive : c.text;
        el('polyline', {
          points: shown.map((q) => [r1(q.x), r1(q.y)].join(',')).join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': isNow ? 2 : 1.4,
          'stroke-linejoin': 'round',
          ...(e.kind === 'fall' ? { 'stroke-dasharray': '5 4' } : {}),
        }, svg);
        // 화살촉 — 선이 지금 닿은 끝에
        const tip = shown[shown.length - 1];
        const before = shown[shown.length - 2];
        if (tip && before) {
          const len = Math.hypot(tip.x - before.x, tip.y - before.y);
          if (len > 0) {
            const ux = (tip.x - before.x) / len;
            const uy = (tip.y - before.y) / len;
            const a = 7;
            const w = 4;
            const head: Pt[] = [
              { x: tip.x, y: tip.y },
              { x: tip.x - ux * a - uy * w, y: tip.y - uy * a + ux * w },
              { x: tip.x - ux * a + uy * w, y: tip.y - uy * a - ux * w },
            ];
            el('polygon', { points: head.map((q) => [r1(q.x), r1(q.y)].join(',')).join(' '), fill: color }, svg);
          }
        }
        if (p >= 1) {
          el('text', { x: label.x, y: label.y, 'text-anchor': anchor, fill: isNow ? c.text : c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, svg, edgeLabel(e, endIns));
        }
      });

      // 셈 — 적힌 뜀 명령과 선 간선
      if (!named) return; // 나뉘기 전 장면 — 셈 줄은 init 뒤에 선다
      const written = s.written;
      if (written === null) throw new Error('edges-are-jumps 그림: 블록은 있는데 적힌 뜀 명령 수가 없다');
      const jumps = s.edges.filter((e) => e.kind === 'jump').length;
      const falls = s.edges.filter((e) => e.kind === 'fall').length;
      const backs = s.edges.filter((e) => e.back).length;
      el('text', { x: W / 2, y: H - 30, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, svg,
        t('tally.written', 'Jump instructions written: {n}', { n: written }));
      el('text', { x: W / 2, y: H - 12, 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm }, svg,
        t('tally.edges', 'Edges: {e} · jumps: {j} · fall-throughs: {f} · backward: {b}', { e: s.edges.length, j: jumps, f: falls, b: backs }));
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

    async function render(next: EdgesAreJumpsScene, prev: EdgesAreJumpsScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const grows = next.step.kind === 'emit' && next.step.added > 0 && (prev === null || prev.edges.length < next.edges.length);
      if (!opts.animate || !grows) {
        draw(next, 1);
        return;
      }
      draw(next, 0);
      const start = Date.now();
      for (;;) {
        if (destroyed || mine !== gen) return;
        const p = Math.min(1, (Date.now() - start) / GROW_MS);
        draw(next, ease(p));
        if (p >= 1) break;
        await frame();
      }
      if (destroyed || mine !== gen) return;
      draw(next, 1);
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
