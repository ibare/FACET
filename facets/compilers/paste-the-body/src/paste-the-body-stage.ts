/**
 * paste-the-body 의 그림.
 *
 * 왼쪽에 불린 함수, 오른쪽에 부르는 함수. 걸음마다 불린 함수의 글자가 **복제되어 옆으로
 * 흘러 들어온다** — 부른 줄이 한 칸 아래로 밀려 자리가 열리고, 그 자리에 몸의 줄이 앉는다.
 * 인자 식은 부른 줄의 괄호 안에서, 매개변수 이름은 머리줄에서 빠져나와 새 줄 하나로 모인다.
 * 마지막에는 `return` 의 식이 부른 줄로 건너가고 부르기 식은 오그라들어 사라진다.
 * 왼쪽의 원본은 제자리에 남고, 붙은 줄마다 어느 줄에서 왔는지 잇는 선이 남는다.
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
} from '@ffacet/core/runtime';
import type { PasteRow, PasteTheBodyScene } from './scene.js';

const H = 300;
const SVG = 'http://www.w3.org/2000/svg';
const PAD = 24;
const GAP = 44;
const LABEL_Y = 34;
const CODE_TOP = 72;
const ROW_H_MAX = 34;
const CAPTION_Y = H - 44;
const NOTE_Y = H - 20;
const MOVE_MS = 700;
const FRAME_MS = 16;
/** 고정폭 글꼴의 글자 폭 / 글자 크기 */
const MONO_RATIO = 0.6;

type Geo = {
  font: number;
  cw: number;
  rowH: number;
  leftX: number;
  rightX: number;
};

function fix(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function ease(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/** 전체 구간 [0,1] 안의 [a,b] 부분을 다시 [0,1] 로 */
function span(u: number, a: number, b: number): number {
  return ease((u - a) / (b - a));
}

function geometry(scene: PasteTheBodyScene): Geo {
  const colW = (PIECE_CANVAS_W - PAD * 2 - GAP) / 2;
  const widest = Math.max(
    ...scene.callee.map((r) => r.indent * 4 + r.text.length),
    ...scene.caller.map((r) => r.indent * 4 + r.text.length),
    1,
  );
  const font = Math.min(parseFloat(fontSizes.lg), colW / (widest * MONO_RATIO));
  const rows = Math.max(scene.callee.length, scene.caller.length, 1);
  const rowH = Math.min(ROW_H_MAX, (CAPTION_Y - 30 - CODE_TOP) / Math.max(1, rows - 1));
  return { font, cw: font * MONO_RATIO, rowH, leftX: PAD, rightX: PAD + colW + GAP };
}

export const pasteTheBodyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? fix(v) : v);
      parent.appendChild(node);
      return node;
    }

    function codeText(parent: Element, x: number, y: number, s: string, g: Geo, weight = '400'): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': fonts.mono,
          'font-size': g.font,
          'font-weight': weight,
          fill: c.text,
          'dominant-baseline': 'middle',
          'xml:space': 'preserve',
        },
        parent,
      );
      node.textContent = s;
      return node;
    }

    function rowY(i: number, g: Geo): number {
      return CODE_TOP + i * g.rowH;
    }

    function colX(side: 'callee' | 'caller', indent: number, col: number, g: Geo): number {
      return (side === 'callee' ? g.leftX : g.rightX) + (indent * 4 + col) * g.cw;
    }

    function caption(scene: PasteTheBodyScene): { main: string; note: string } {
      const s = scene.step;
      const row = (i: number): string => {
        const r = scene.caller[i];
        if (!r) throw new Error(`paste-the-body 그림: 부르는 쪽 줄 ${i} 가 없다`);
        return r.text;
      };
      switch (s.kind) {
        case 'start':
          return { main: t('caption.start', 'Call to inline: {call}', { call: row(s.at) }), note: '' };
        case 'bind-let':
          return {
            main: t('caption.bindLet', 'The argument is an expression — bound once, before the call: {line}', {
              line: row(s.at),
            }),
            note: '',
          };
        case 'bind-direct':
          return {
            main: t('caption.bindDirect', 'The argument goes into the parameter as it is: {param} → {arg}', {
              param: s.param,
              arg: s.arg,
            }),
            note: '',
          };
        case 'paste':
          return { main: t('caption.paste', 'A body line flows into the call site: {line}', { line: row(s.at) }), note: '' };
        case 'return':
          return {
            main: t('caption.return', 'The return value goes to the receiver; the call is gone: {line}', {
              line: row(s.at),
            }),
            note: t('caption.stays', 'The definition of {fn} stays where it was', { fn: scene.calleeName }),
          };
        default:
          return { main: '', note: '' };
      }
    }

    type Drawn = { callerText: SVGTextElement[]; links: Map<number, SVGPathElement> };

    function drawRows(parent: Element, side: 'callee' | 'caller', rows: PasteRow[], g: Geo): SVGTextElement[] {
      return rows.map((r, i) =>
        codeText(parent, colX(side, r.indent, 0, g), rowY(i, g), r.text, g, i === 0 ? '600' : '400'),
      );
    }

    /** 이번 걸음이 짚는 줄 — 부르는 쪽 한 줄, 불린 쪽 한 줄 */
    function marks(scene: PasteTheBodyScene): { caller: number | null; callee: number | null } {
      const s = scene.step;
      if (s.kind === 'start') return { caller: s.at, callee: null };
      if (s.kind === 'bind-let' || s.kind === 'paste' || s.kind === 'return') return { caller: s.at, callee: s.from };
      return { caller: null, callee: null };
    }

    function drawStatic(scene: PasteTheBodyScene): Drawn {
      svg.textContent = '';
      const g = geometry(scene);
      el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: c.bg }, svg);

      // 칼럼 머리 — 역할 이름
      const labels: [number, string][] = [
        [g.leftX, t('label.callee', 'Called function')],
        [g.rightX, t('label.caller', 'Calling function')],
      ];
      for (const [x, s] of labels) {
        const lab = el(
          'text',
          { x, y: LABEL_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
          svg,
        );
        lab.textContent = s;
      }
      const colW = g.rightX - GAP - g.leftX;
      for (const x of [g.leftX, g.rightX]) {
        el('line', { x1: x, y1: LABEL_Y + 10, x2: x + colW, y2: LABEL_Y + 10, stroke: c.border, 'stroke-width': 1 }, svg);
      }

      // 이번 걸음의 띠
      const m = marks(scene);
      const bandH = g.rowH * 0.82;
      if (m.callee !== null) {
        el(
          'rect',
          { x: g.leftX - 6, y: rowY(m.callee, g) - bandH / 2, width: colW + 12, height: bandH, rx: 4, fill: c.bgSubtle, stroke: c.border },
          svg,
        );
      }
      if (m.caller !== null) {
        el(
          'rect',
          {
            x: g.rightX - 6,
            y: rowY(m.caller, g) - bandH / 2,
            width: colW + 12,
            height: bandH,
            rx: 4,
            fill: c.accent,
            'fill-opacity': 0.28,
            stroke: c.accent,
          },
          svg,
        );
      }

      // 온 곳을 잇는 선 — 붙은 줄마다 하나
      const links = new Map<number, SVGPathElement>();
      scene.caller.forEach((r, i) => {
        if (r.from === null) return;
        const src = scene.callee[r.from];
        if (!src) throw new Error(`paste-the-body 그림: 불린 쪽 줄 ${r.from} 가 없다`);
        const x1 = colX('callee', src.indent, src.text.length, g) + 8;
        const y1 = rowY(r.from, g);
        const x2 = g.rightX - 10;
        const y2 = rowY(i, g);
        const mx = (x1 + x2) / 2;
        const path = el(
          'path',
          {
            d: `M ${fix(x1)} ${fix(y1)} C ${fix(mx)} ${fix(y1)} ${fix(mx)} ${fix(y2)} ${fix(x2)} ${fix(y2)}`,
            fill: 'none',
            stroke: c.textMuted,
            'stroke-width': 1.2,
            'stroke-dasharray': '3 3',
          },
          svg,
        );
        el('circle', { cx: x2, cy: y2, r: 2.5, fill: c.textMuted }, svg);
        links.set(i, path);
      });

      drawRows(svg, 'callee', scene.callee, g);
      const callerText = drawRows(svg, 'caller', scene.caller, g);

      const cap = caption(scene);
      const capEl = el(
        'text',
        {
          x: PIECE_CANVAS_W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        },
        svg,
      );
      capEl.textContent = cap.main;
      if (cap.note) {
        const note = el(
          'text',
          {
            x: PIECE_CANVAS_W / 2,
            y: NOTE_Y,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          },
          svg,
        );
        note.textContent = cap.note;
      }
      return { callerText, links };
    }

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

    /** 한 시계 — MOVE_MS 동안 frame(u) 를 부른다. 물러나야 하면 false */
    async function clock(mine: number, frame: (u: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const u = Math.min(1, (Date.now() - start) / MOVE_MS);
        frame(u);
        if (u >= 1) return true;
        await wait(FRAME_MS);
      }
    }

    function move(node: Element, dx: number, dy: number): void {
      if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${fix(dx)} ${fix(dy)})`);
    }

    async function animate(next: PasteTheBodyScene, mine: number): Promise<void> {
      const s = next.step;
      if (s.kind !== 'bind-let' && s.kind !== 'paste' && s.kind !== 'return') return;
      const g = geometry(next);
      const drawn = drawStatic(next);
      const row = next.caller[s.at];
      const target = drawn.callerText[s.at];
      if (!row || !target) return;
      const fx = el('g', {}, svg);
      const link = drawn.links.get(s.at);
      if (link) link.setAttribute('opacity', '0');
      target.setAttribute('opacity', '0');
      const y = rowY(s.at, g);

      if (s.kind === 'bind-let' || s.kind === 'paste') {
        // 부른 줄부터 아래는 한 칸 위(열리기 전 자리)에서 출발한다
        const pushed = drawn.callerText.slice(s.at + 1);
        for (const n of pushed) move(n, 0, -g.rowH);
        let pieces: { node: SVGTextElement; x0: number; y0: number; x1: number }[];
        let glue: SVGTextElement[] = [];
        if (s.kind === 'bind-let') {
          const head = next.callee[s.from];
          if (!head) throw new Error(`paste-the-body 그림: 불린 쪽 줄 ${s.from} 가 없다`);
          const argX0 = colX('caller', row.indent, s.argCol, g);
          const paramX0 = colX('callee', head.indent, s.paramCol, g);
          const argNode = codeText(fx, argX0, y, s.arg, g);
          const paramNode = codeText(fx, paramX0, rowY(s.from, g), s.param, g);
          pieces = [
            { node: argNode, x0: argX0, y0: y, x1: colX('caller', row.indent, s.argTo, g) },
            { node: paramNode, x0: paramX0, y0: rowY(s.from, g), x1: colX('caller', row.indent, s.paramTo, g) },
          ];
          for (const n of [argNode, paramNode]) n.setAttribute('fill', c.primary);
          glue = [
            codeText(fx, colX('caller', row.indent, 0, g), y, 'let', g),
            codeText(fx, colX('caller', row.indent, s.paramTo + s.param.length + 1, g), y, '=', g),
          ];
        } else {
          const src = next.callee[s.from];
          if (!src) throw new Error(`paste-the-body 그림: 불린 쪽 줄 ${s.from} 가 없다`);
          const x0 = colX('callee', src.indent, 0, g);
          const node = codeText(fx, x0, rowY(s.from, g), row.text, g);
          node.setAttribute('fill', c.primary);
          pieces = [{ node, x0, y0: rowY(s.from, g), x1: colX('caller', row.indent, 0, g) }];
        }
        for (const p of pieces) p.node.setAttribute('x', fix(p.x1));
        const frame = (u: number): void => {
          const open = span(u, 0, 0.4);
          for (const n of pushed) move(n, 0, -g.rowH * (1 - open));
          const fly = span(u, 0.25, 1);
          for (const p of pieces) move(p.node, (p.x0 - p.x1) * (1 - fly), (p.y0 - y) * (1 - fly));
          for (const n of glue) n.setAttribute('opacity', fix(fly));
        };
        frame(0);
        await clock(mine, frame);
        return;
      }

      // return — 부르기 식이 오그라들고, return 의 식이 건너온다
      const src = next.callee[s.from];
      if (!src) throw new Error(`paste-the-body 그림: 불린 쪽 줄 ${s.from} 가 없다`);
      codeText(fx, colX('caller', row.indent, 0, g), y, row.text.slice(0, s.exprTo), g);
      const callX = colX('caller', row.indent, s.callCol, g);
      const callNode = codeText(fx, callX, y, s.call, g);
      callNode.setAttribute('fill', c.textMuted);
      const x1 = colX('caller', row.indent, s.exprTo, g);
      const x0 = colX('callee', src.indent, s.exprCol, g);
      const y0 = rowY(s.from, g);
      const exprNode = codeText(fx, x1, y, s.expr, g);
      exprNode.setAttribute('fill', c.primary);
      const frame = (u: number): void => {
        const shrink = span(u, 0, 0.45);
        const k = Math.max(0.001, 1 - shrink);
        callNode.setAttribute('transform', `translate(${fix(callX)} 0) scale(${fix(k)} 1) translate(${fix(-callX)} 0)`);
        callNode.setAttribute('opacity', fix(1 - shrink));
        const fly = span(u, 0.25, 1);
        move(exprNode, (x0 - x1) * (1 - fly), (y0 - y) * (1 - fly));
      };
      frame(0);
      await clock(mine, frame);
    }

    return {
      async render(next: PasteTheBodyScene, _prev: PasteTheBodyScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate) {
          drawStatic(next);
          return;
        }
        await animate(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
