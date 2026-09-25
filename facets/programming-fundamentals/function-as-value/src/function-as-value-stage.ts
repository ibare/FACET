/**
 * function-as-value 의 그림.
 *
 * 동사 — 몸 한 벌이 이름을 옮겨 다닌다. 이름 없는 함수는 **카드 한 장**이다. 카드는 코드의
 * 그 줄에서 떠올라 자기를 쥔 이름 곁으로 가고, 부를 때 넘겨지면 받은 이름(인자) 곁으로
 * 옮겨 간다. 카드를 쥔 이름마다 전선이 카드에 닿는다 — 이름이 둘이어도 카드는 한 장이다.
 * 받은 이름으로 부르면 값이 카드의 인자 칸으로 들어가 그 몸이 셈하고, 셈한 값이 부른
 * 자리로 돌아간다.
 *
 * 왼쪽은 코드, 가운데는 살아 있는 틀(이름 → 값)이 한 줄씩, 오른쪽은 함수 카드의 자리다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { FunctionAsValueScene, SFn, SFrame, SStep, SVal } from './scene.js';

const H = 270;
const PAD = 16;
/** 코드 줄 번호 칸 */
const GUTTER = 20;
/** 틀과 카드 사이 전선 길 */
const LANE = 26;
const MOTION_MS = 380;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function valText(v: SVal, fns: readonly SFn[]): string {
  if (v.t === 'num') return String(v.n);
  if (v.t === 'str') return `"${v.s}"`;
  if (v.t === 'fn') return fns.find((f) => f.id === v.id)?.text ?? 'function';
  return 'null';
}

type SlotL = { name: string; val: SVal; box: Pt; nameAt: Pt };
type RowL = { frame: SFrame; y: number; h: number; slots: SlotL[]; retAt: Pt };
type Layout = {
  rows: RowL[];
  /** 함수 id → 카드 왼쪽 위 */
  cards: Map<number, Pt>;
};

export const functionAsValueStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const codePx = parseFloat(fontSizes.sm);
    const smallPx = parseFloat(fontSizes.xs);
    const charW = codePx * 0.6;
    const LH = Math.round(codePx * 2);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    // ── 자리 셈 (장면에서만) ──

    const CW = Math.min(132, Math.round(W * 0.2));
    const CH = Math.round(codePx * 5.6);
    const cardX = W - PAD - CW;

    function codeGeom(scene: FunctionAsValueScene): { right: number; top: number } {
      let maxCh = 0;
      for (const l of scene.lines) maxCh = Math.max(maxCh, l.indent * 4 + l.text.length);
      return { right: PAD + GUTTER + maxCh * charW, top: PAD + codePx };
    }

    function codeAt(scene: FunctionAsValueScene, line: number, col: number): Pt {
      const g = codeGeom(scene);
      const l = scene.lines[line];
      const indent = l ? l.indent * 4 : 0;
      return { x: PAD + GUTTER + (indent + col) * charW, y: g.top + line * LH };
    }

    function slotBoxW(scene: FunctionAsValueScene): number {
      const rx0 = codeGeom(scene).right + 22;
      return Math.min(46, (cardX - LANE - rx0 - 16) / 3 - 10);
    }

    function outputY(scene: FunctionAsValueScene): number {
      return codeGeom(scene).top + scene.lines.length * LH + smallPx;
    }

    function layout(scene: FunctionAsValueScene, frames: readonly SFrame[]): Layout {
      const rx0 = codeGeom(scene).right + 22;
      const rx1 = cardX - LANE;
      const plain = frames.filter((f) => !f.lambda);
      const top = PAD - 4;
      const bottom = H - PAD - 34;
      const n = Math.max(2, plain.length);
      const gap = 10;
      const h = Math.min(92, (bottom - top - gap * (n - 1)) / n);
      const boxW = slotBoxW(scene);
      const rows: RowL[] = plain.map((frame, i) => {
        const y = top + i * (h + gap);
        // 칸 간격은 이 줄의 가장 긴 이름에 맞추되 틀 폭을 넘지 않게
        const longest = Math.max(0, ...frame.slots.map((s) => s.name.length));
        const room = frame.slots.length > 1 ? (rx1 - rx0 - 24 - boxW) / (frame.slots.length - 1) : boxW;
        const step = Math.min(room, Math.max(boxW + 12, longest * smallPx * 0.6 + 14));
        const slots = frame.slots.map((s, k) => {
          const cx = rx0 + 12 + boxW / 2 + k * step;
          return { name: s.name, val: s.val, nameAt: { x: cx, y: y + h * 0.42 }, box: { x: cx, y: y + h * 0.66 } };
        });
        return { frame, y, h, slots, retAt: { x: rx1 - 8, y: y + smallPx + 6 } };
      });

      const cards = new Map<number, Pt>();
      const perRow = new Map<number, number>();
      for (const fn of scene.fns) {
        if (!fn.lambda) continue;
        let holder = 0;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i].slots.some((s) => s.val.t === 'fn' && s.val.id === fn.id)) {
            holder = i;
            break;
          }
        }
        const row = rows[holder];
        const k = perRow.get(holder) ?? 0;
        perRow.set(holder, k + 1);
        const cy = row ? row.y + row.h / 2 : top + CH / 2;
        const y = Math.max(4, Math.min(H - CH - PAD - 30, cy - CH / 2 + k * (CH + 6)));
        cards.set(fn.id, { x: cardX, y });
      }
      return { rows, cards };
    }

    /** 이 장면이 되기 직전의 틀들 — 카드가 어디서 출발하는지 고르는 데만 쓴다. */
    function framesBefore(scene: FunctionAsValueScene): SFrame[] {
      const s = scene.step;
      if (s?.k === 'call') return scene.frames.slice(0, -1);
      if (s?.k === 'arrive' && s.popped) return [...scene.frames, s.popped];
      return scene.frames;
    }

    function lambdaFrameOf(scene: FunctionAsValueScene, fnId: number): SFrame | null {
      for (let i = scene.frames.length - 1; i >= 0; i -= 1) {
        const f = scene.frames[i];
        if (f.lambda && f.fn === fnId) return f;
      }
      return null;
    }

    // ── 그리기 ──

    type Handles = {
      lay: Layout;
      cardEls: Map<number, SVGGElement>;
      wires: SVGGElement;
      fx: SVGGElement;
      slotVal: Map<string, Element>;
      socketVal: Map<number, Element>;
      socketRet: Map<number, Element>;
      rowRet: Map<number, Element>;
      outVals: Element[];
    };

    function slotKey(row: number, name: string): string {
      return `${row}:${name}`;
    }

    function socketPos(card: Pt): { arg: Pt; ret: Pt; body: Pt } {
      return {
        body: { x: card.x + 10, y: card.y + codePx * 2.6 },
        arg: { x: card.x + 10, y: card.y + codePx * 4.4 },
        ret: { x: card.x + CW - 10, y: card.y + codePx * 4.4 },
      };
    }

    function drawWires(scene: FunctionAsValueScene, lay: Layout, g: SVGGElement, cardAt: Map<number, Pt>): void {
      g.textContent = '';
      const s = scene.step;
      const calledName = s?.k === 'call' && s.lambda ? s.callee : null;
      const lanes = new Map<number, number>();
      lay.rows.forEach((row, ri) => {
        for (const slot of row.slots) {
          if (slot.val.t !== 'fn') continue;
          const card = cardAt.get(slot.val.id);
          if (!card) continue;
          const k = lanes.get(slot.val.id) ?? 0;
          lanes.set(slot.val.id, k + 1);
          const laneX = card.x - 8 - k * 7;
          const floorY = row.y + row.h - 6;
          const cy = card.y + CH / 2;
          const hot = calledName !== null && calledName === slot.name && ri === lay.rows.length - 1;
          const d =
            `M${r1(slot.box.x)} ${r1(slot.box.y)} V${r1(floorY)} H${r1(laneX)} ` + `V${r1(cy)} H${r1(card.x)}`;
          el(
            'path',
            {
              d,
              fill: 'none',
              stroke: hot ? c.accent : c.primary,
              'stroke-width': hot ? 3 : 1.5,
              'stroke-linejoin': 'round',
            },
            g,
          );
        }
      });
    }

    function chip(parent: Element, at: Pt, text: string): SVGGElement {
      const g = el('g', { transform: `translate(${r1(at.x)} ${r1(at.y)})` }, parent);
      const w = Math.max(codePx * 1.8, text.length * charW + 12);
      el('rect', { x: -w / 2, y: -codePx, width: w, height: codePx * 2, rx: 5, fill: c.itemActive }, g);
      el(
        'text',
        {
          x: 0,
          y: codePx * 0.35,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: c.textInverse,
        },
        g,
        text,
      );
      return g;
    }

    function captionOf(scene: FunctionAsValueScene): string {
      const s: SStep | null = scene.step;
      const fns = scene.fns;
      const v = (x: SVal) => valText(x, fns);
      if (s === null) return t('caption.start', 'Nothing has run yet.');
      if (s.k === 'stmt') {
        const d = s.done;
        if (d.k === 'assign') {
          const made = s.made.map((id) => fns.find((f) => f.id === id)).find((f) => f?.lambda);
          if (made && d.val.t === 'fn' && d.val.id === made.id) {
            return t('caption.make', 'Make the function {fn} and store it in {name}.', { fn: made.text, name: d.to });
          }
          return t('caption.assign', '{name} = {value}.', { name: d.to, value: v(d.val) });
        }
        if (d.k === 'show') return t('caption.show', 'Output: {value}.', { value: v(d.val) });
        if (d.k === 'return') {
          const callee = scene.frames[scene.frames.length - 1]?.callee ?? '';
          return t('caption.return', '{callee} returns {value}.', { callee, value: v(d.val) });
        }
        if (d.k === 'def') return t('caption.def', 'Define the function {name}.', { name: d.to });
        return '';
      }
      if (s.k === 'call') {
        if (s.lambda) {
          const fn = fns.find((f) => f.id === s.fn);
          return t('caption.callName', 'Call {name}({arg}): the flow goes to the body written on line {line}.', {
            name: s.callee,
            arg: s.binds.map((b) => v(b.val)).join(', '),
            line: (fn?.line ?? 0) + 1,
          });
        }
        // 넘겨받은 칸의 함수 번호가 넘긴 이름이 쥔 함수 번호와 같을 때만 "그 자체" 라고 말한다
        const outer = scene.frames.slice(0, -1);
        const passed = s.binds.find((b) => {
          const got = b.val;
          if (got.t !== 'fn' || b.from === null) return false;
          const from = b.from;
          return outer.some((f) => f.slots.some((sl) => sl.name === from && sl.val.t === 'fn' && sl.val.id === got.id));
        });
        if (passed) {
          return t('caption.callPass', 'Call {callee}. The function in {from} itself goes into {param}.', {
            callee: s.callee,
            from: passed.from ?? '',
            param: passed.param,
          });
        }
        return t('caption.call', 'Call {callee}.', { callee: s.callee });
      }
      if (s.k === 'eval') {
        const fn = fns.find((f) => f.id === s.fn);
        return t('caption.eval', 'The body on line {line} runs (run {n}): {expr} = {value}.', {
          line: (fn?.line ?? s.line) + 1,
          n: fn?.runs ?? 0,
          expr: s.shown,
          value: v(s.val),
        });
      }
      const d = s.done;
      const value = v(s.val);
      if (d?.k === 'assign') {
        return t('caption.arriveAssign', 'Back from {callee} with {value}. {name} = {value}.', {
          callee: s.callee,
          value,
          name: d.to,
        });
      }
      if (d?.k === 'return') {
        const frame = scene.frames[scene.frames.length - 1]?.callee ?? '';
        return t('caption.arriveReturn', 'Back from {callee} with {value}. {frame} returns it.', {
          callee: s.callee,
          value,
          frame,
        });
      }
      if (d?.k === 'show') {
        return t('caption.arriveShow', 'Back from {callee} with {value}. Output: {value}.', { callee: s.callee, value });
      }
      return t('caption.arrive', 'Back from {callee} with {value}.', { callee: s.callee, value });
    }

    function drawStatic(scene: FunctionAsValueScene): Handles {
      svg.textContent = '';
      const root = el('g', {}, svg);
      const lay = layout(scene, scene.frames);
      const g = codeGeom(scene);
      const s = scene.step;

      // 코드
      const code = el('g', {}, root);
      const current = s ? s.line : -1;
      if (current >= 0 && current < scene.lines.length) {
        const y = g.top + current * LH;
        el(
          'rect',
          { x: PAD - 4, y: y - codePx - 3, width: g.right - PAD + 10, height: LH - 3, rx: 4, fill: c.bgSubtle, stroke: c.accent },
          code,
        );
      }
      const lambdaCols = new Map<number, { col: number; len: number }>();
      for (const fn of scene.fns) {
        if (!fn.lambda) continue;
        const text = scene.lines[fn.line]?.text ?? '';
        const col = text.indexOf(fn.text);
        if (col >= 0) lambdaCols.set(fn.line, { col, len: fn.text.length });
      }
      scene.lines.forEach((line, i) => {
        const y = g.top + i * LH;
        el(
          'text',
          { x: PAD + GUTTER - 8, y, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted },
          code,
          String(i + 1),
        );
        const at = codeAt(scene, i, 0);
        const lc = lambdaCols.get(i);
        if (lc) {
          const x0 = at.x + lc.col * charW;
          el(
            'rect',
            { x: x0 - 2, y: y - codePx, width: lc.len * charW + 4, height: codePx + 5, rx: 3, fill: 'none', stroke: c.primary },
            code,
          );
        }
        el(
          'text',
          { x: at.x, y, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text, 'xml:space': 'preserve' },
          code,
          line.text,
        );
      });

      // 출력
      const oy = outputY(scene);
      el(
        'text',
        { x: PAD, y: oy, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        root,
        t('label.output', 'output'),
      );
      const outVals: Element[] = [];
      scene.out.forEach((val, i) => {
        outVals.push(
          el(
            'text',
            { x: PAD + GUTTER + i * charW * 4, y: oy + LH, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text },
            root,
            valText(val, scene.fns),
          ),
        );
      });

      // 틀
      const frameLayer = el('g', {}, root);
      const wires = el('g', {}, root);
      const slotVal = new Map<string, Element>();
      const rowRet = new Map<number, Element>();
      const rx0 = g.right + 22;
      const rx1 = cardX - LANE;
      lay.rows.forEach((row, ri) => {
        el(
          'rect',
          { x: rx0, y: row.y, width: rx1 - rx0, height: row.h, rx: 8, fill: c.bgSubtle, stroke: c.border },
          frameLayer,
        );
        const isTop = row.frame.callee === '';
        el(
          'text',
          {
            x: rx0 + 10,
            y: row.y + smallPx + 6,
            'font-family': isTop ? fonts.body : fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          frameLayer,
          isTop ? t('label.program', 'top level') : row.frame.callee,
        );
        if (row.frame.ret) {
          rowRet.set(
            ri,
            el(
              'text',
              {
                x: row.retAt.x,
                y: row.retAt.y,
                'text-anchor': 'end',
                'font-family': fonts.mono,
                'font-size': fontSizes.xs,
                fill: c.text,
              },
              frameLayer,
              `return ${valText(row.frame.ret, scene.fns)}`,
            ),
          );
        }
        const boxW = slotBoxW(scene);
        for (const slot of row.slots) {
          el(
            'text',
            {
              x: slot.nameAt.x,
              y: slot.nameAt.y,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.text,
            },
            frameLayer,
            slot.name,
          );
          el(
            'rect',
            { x: slot.box.x - boxW / 2, y: slot.box.y - codePx, width: boxW, height: codePx * 2, rx: 4, fill: c.bg, stroke: c.border },
            frameLayer,
          );
          if (slot.val.t === 'fn') {
            slotVal.set(slotKey(ri, slot.name), el('circle', { cx: slot.box.x, cy: slot.box.y, r: 5, fill: c.primary }, frameLayer));
          } else {
            slotVal.set(
              slotKey(ri, slot.name),
              el(
                'text',
                {
                  x: slot.box.x,
                  y: slot.box.y + codePx * 0.35,
                  'text-anchor': 'middle',
                  'font-family': fonts.mono,
                  'font-size': fontSizes.sm,
                  fill: c.text,
                },
                frameLayer,
                valText(slot.val, scene.fns),
              ),
            );
          }
        }
      });

      // 카드
      const cardEls = new Map<number, SVGGElement>();
      const socketVal = new Map<number, Element>();
      const socketRet = new Map<number, Element>();
      for (const fn of scene.fns) {
        const at = lay.cards.get(fn.id);
        if (!at) continue;
        const live = lambdaFrameOf(scene, fn.id);
        const cg = el('g', { transform: `translate(${r1(at.x)} ${r1(at.y)})` }, root);
        cardEls.set(fn.id, cg);
        el(
          'rect',
          { x: 0, y: 0, width: CW, height: CH, rx: 8, fill: c.bg, stroke: live ? c.accent : c.primary, 'stroke-width': live ? 3 : 2 },
          cg,
        );
        el(
          'text',
          { x: 10, y: smallPx + 5, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
          cg,
          t('label.function', 'function'),
        );
        const local = socketPos({ x: 0, y: 0 });
        el(
          'text',
          {
            x: local.body.x,
            y: local.body.y,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 600,
            fill: c.primary,
            'xml:space': 'preserve',
          },
          cg,
          fn.text,
        );
        el('line', { x1: 8, y1: codePx * 3.3, x2: CW - 8, y2: codePx * 3.3, stroke: c.border }, cg);
        if (live) {
          const args = live.slots.map((sl) => `${sl.name} = ${valText(sl.val, scene.fns)}`).join(', ');
          socketVal.set(
            fn.id,
            el(
              'text',
              { x: local.arg.x, y: local.arg.y, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text },
              cg,
              args,
            ),
          );
          if (live.ret) {
            socketRet.set(
              fn.id,
              el(
                'text',
                {
                  x: local.ret.x,
                  y: local.ret.y,
                  'text-anchor': 'end',
                  'font-family': fonts.mono,
                  'font-size': fontSizes.sm,
                  'font-weight': 600,
                  fill: c.text,
                },
                cg,
                `→ ${valText(live.ret, scene.fns)}`,
              ),
            );
          }
        }
        el(
          'text',
          {
            x: CW / 2,
            y: CH + smallPx + 4,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          cg,
          t('label.runs', 'body ran: {n}', { n: fn.runs }),
        );
      }

      drawWires(scene, lay, wires, lay.cards);

      // 캡션
      el(
        'text',
        { x: PAD, y: H - PAD, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text },
        root,
        captionOf(scene),
      );

      const fx = el('g', {}, root);
      return { lay, cardEls, wires, fx, slotVal, socketVal, socketRet, rowRet, outVals };
    }

    // ── 운동 ──

    function tween(ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || done) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          draw(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    type Mover = { from: Pt; to: Pt; text: string | null; hide: Element | null };

    /** 이름으로 가장 깊은 줄의 칸을 찾는다. */
    function findSlot(lay: Layout, name: string): { ri: number; box: Pt } | null {
      for (let i = lay.rows.length - 1; i >= 0; i -= 1) {
        const s = lay.rows[i].slots.find((x) => x.name === name);
        if (s) return { ri: i, box: s.box };
      }
      return null;
    }

    function lineEnd(scene: FunctionAsValueScene, line: number): Pt {
      const text = scene.lines[line]?.text ?? '';
      const p = codeAt(scene, line, text.length);
      return { x: p.x, y: p.y - codePx * 0.35 };
    }

    async function animate(scene: FunctionAsValueScene, h: Handles, mine: number): Promise<void> {
      const s = scene.step;
      if (!s) return;
      const lay = h.lay;
      const movers: Mover[] = [];

      // 카드가 출발하는 자리
      const beforeLay = layout(scene, framesBefore(scene));
      const cardFrom = new Map<number, Pt>();
      for (const [id, to] of lay.cards) {
        const fn = scene.fns.find((f) => f.id === id);
        const made = (s.k === 'stmt' || s.k === 'call') && s.made.includes(id);
        if (made && fn) {
          const text = scene.lines[fn.line]?.text ?? '';
          const col = Math.max(0, text.indexOf(fn.text));
          const at = codeAt(scene, fn.line, col);
          cardFrom.set(id, { x: at.x - 10, y: at.y - codePx * 2.6 });
        } else {
          const from = beforeLay.cards.get(id) ?? to;
          if (from.x !== to.x || from.y !== to.y) cardFrom.set(id, from);
        }
      }

      const doneMovers = (done: Extract<SStep, { k: 'stmt' }>['done'] | null, from: Pt, text: string): void => {
        if (!done) return;
        if (done.k === 'assign' || done.k === 'def') {
          const slot = findSlot(lay, done.to);
          if (!slot) return;
          if (done.val.t === 'fn') return; // 함수는 카드가 움직인다
          movers.push({ from, to: slot.box, text, hide: h.slotVal.get(slotKey(slot.ri, done.to)) ?? null });
        } else if (done.k === 'show') {
          const i = scene.out.length - 1;
          const oy = outputY(scene) + LH - codePx * 0.35;
          movers.push({ from, to: { x: PAD + GUTTER + i * charW * 4 + charW, y: oy }, text, hide: h.outVals[i] ?? null });
        } else if (done.k === 'return') {
          const ri = lay.rows.length - 1;
          const row = lay.rows[ri];
          if (row) movers.push({ from, to: { x: row.retAt.x - 20, y: row.retAt.y - 4 }, text, hide: h.rowRet.get(ri) ?? null });
        }
      };

      if (s.k === 'stmt') {
        const d = s.done;
        if (d.k === 'assign' || d.k === 'show' || d.k === 'return') {
          const src = d.from ? findSlot(lay, d.from)?.box : null;
          doneMovers(d, src ?? lineEnd(scene, s.line), valText(d.val, scene.fns));
        }
      } else if (s.k === 'call') {
        const ri = lay.rows.length - 1;
        const card = lay.cards.get(s.fn);
        for (const b of s.binds) {
          const src = (b.from ? findSlot(beforeLay, b.from)?.box : null) ?? lineEnd(scene, s.line);
          if (s.lambda && card) {
            movers.push({
              from: src,
              to: { x: card.x + CW / 2, y: socketPos(card).arg.y - codePx * 0.35 },
              text: valText(b.val, scene.fns),
              hide: h.socketVal.get(s.fn) ?? null,
            });
          } else {
            const slot = lay.rows[ri]?.slots.find((x) => x.name === b.param);
            if (!slot) continue;
            movers.push({
              from: src,
              to: slot.box,
              text: b.val.t === 'fn' ? null : valText(b.val, scene.fns),
              hide: h.slotVal.get(slotKey(ri, b.param)) ?? null,
            });
          }
        }
      } else if (s.k === 'eval') {
        const card = lay.cards.get(s.fn);
        if (card) {
          const sp = socketPos(card);
          movers.push({
            from: { x: sp.body.x + CW / 2, y: sp.body.y - codePx * 0.35 },
            to: { x: sp.ret.x - charW * 1.5, y: sp.ret.y - codePx * 0.35 },
            text: valText(s.val, scene.fns),
            hide: h.socketRet.get(s.fn) ?? null,
          });
        }
      } else {
        // 돌아옴 — 값은 카드(이름 없는 함수)나 걷힌 틀에서 출발한다
        let from = lineEnd(scene, s.line);
        const popped = s.popped;
        if (popped && popped.lambda) {
          const card = lay.cards.get(popped.fn);
          if (card) from = { x: socketPos(card).ret.x - charW * 1.5, y: socketPos(card).ret.y - codePx * 0.35 };
        } else if (popped) {
          const row = beforeLay.rows[beforeLay.rows.length - 1];
          if (row) from = { x: row.retAt.x - 20, y: row.retAt.y - 4 };
        }
        doneMovers(s.done, from, valText(s.val, scene.fns));
      }

      if (movers.length === 0 && cardFrom.size === 0) return;

      for (const m of movers) m.hide?.setAttribute('visibility', 'hidden');
      const chips = movers.map((m) =>
        m.text === null
          ? el('circle', { cx: 0, cy: 0, r: 5, fill: c.primary, transform: `translate(${r1(m.from.x)} ${r1(m.from.y)})` }, h.fx)
          : chip(h.fx, m.from, m.text),
      );

      await tween(MOTION_MS, (p) => {
        if (mine !== gen || destroyed) return;
        const now = new Map<number, Pt>(lay.cards);
        for (const [id, from] of cardFrom) {
          const to = lay.cards.get(id);
          const g = h.cardEls.get(id);
          if (!to || !g) continue;
          const at = { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) };
          now.set(id, at);
          g.setAttribute('transform', `translate(${r1(at.x)} ${r1(at.y)})`);
        }
        if (cardFrom.size > 0) drawWires(scene, lay, h.wires, now);
        movers.forEach((m, i) => {
          chips[i].setAttribute(
            'transform',
            `translate(${r1(lerp(m.from.x, m.to.x, p))} ${r1(lerp(m.from.y, m.to.y, p))})`,
          );
        });
      });
    }

    return {
      async render(next: FunctionAsValueScene, _prev: FunctionAsValueScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const h = drawStatic(next);
        if (!opts.animate) return;
        await animate(next, h, mine);
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
