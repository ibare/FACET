/**
 * frame-boundary 무대 — 받는 쪽의 읽는 머리가 선 위 바이트를 하나씩 지나가며,
 * 표식에서 프레임의 괄호를 열고, 담는 바이트는 아래 "받은 데이터" 줄로 내려보내고,
 * 탈출 바이트는 떨어뜨려 버리고, 다음 표식에서 괄호를 닫는다.
 *
 * 맨 위 "보낸 데이터" 줄과 맨 아래 "받은 데이터" 줄은 같은 칸 자리에 서서 끝에 서로 견준다.
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
import type { FrameBoundaryScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const LABEL_W = 84;
const MAX_PITCH = 72;

const SENT_Y = 18;
const ROW_H = 40;
const TAG_Y = 88;
const CARET_TOP = 96;
const CARET_H = 11;
const TAPE_Y = 112;
const TAPE_H = 50;
const BRACKET_Y = 178;
const BRACKET_TICK = 9;
const RECV_Y = 200;
const XOR_Y = RECV_Y + ROW_H + 16;
const CAPTION_Y = 300;
const CAPTION2_Y = 322;

const MOVE_MS = 380;
const DROP_PX = 38;

type Geom = { x0: number; pitch: number; cw: number };

function geom(n: number): Geom {
  const x0 = PAD + LABEL_W;
  const pitch = Math.min(MAX_PITCH, (PIECE_CANVAS_W - x0 - PAD) / Math.max(n, 1));
  return { x0, pitch, cw: Math.round(pitch * 0.84) };
}

function r2(v: number): string {
  const x = Math.round(v * 100) / 100;
  return String(x === 0 ? 0 : x);
}

function hex(b: number): string {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function cellX(g: Geom, i: number): number {
  return g.x0 + i * g.pitch + (g.pitch - g.cw) / 2;
}

function centerX(g: Geom, i: number): number {
  return g.x0 + i * g.pitch + g.pitch / 2;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? r2(v) : v);
  parent.appendChild(e);
  return e;
}

type Handles = {
  head: SVGGElement | null;
  bracketLine: SVGLineElement | null;
  bracketEnd: SVGLineElement | null;
  recv: SVGGElement[];
};

export const frameBoundaryStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const monoPx = parseFloat(fontSizes.md);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function stateLabel(s: FrameBoundaryScene['state']): string {
      if (s === 'idle') return t('state.idle', 'Not open');
      if (s === 'open') return t('state.open', 'Open');
      if (s === 'escaped') return t('state.escaped', 'After escape');
      return t('state.closed', 'Closed');
    }

    function captions(s: FrameBoundaryScene): [string, string] {
      const st = s.step;
      if (st.kind === 'start') {
        return [t('caption.start', 'Nothing read yet. Bytes on the line: {n}.', { n: s.wire.length }), ''];
      }
      const byte = hex(st.byte);
      if (st.kind === 'open') return [t('caption.open', '{byte}: flag. The frame opens.', { byte }), ''];
      if (st.kind === 'escape') {
        return [t('caption.escape', '{byte}: escape. Dropped; the next byte is restored.', { byte }), ''];
      }
      if (st.kind === 'keep') return [t('caption.keep', '{byte}: data. Kept as is.', { byte }), ''];
      if (st.kind === 'restore') {
        const mask = s.mask === null ? '' : hex(s.mask);
        const first = t('caption.restore', '{byte} XOR {mask} = {value}. Kept as data.', {
          byte,
          mask,
          value: hex(st.value),
        });
        const second =
          s.flag !== null && st.value === s.flag
            ? t('caption.sameAsFlag', 'Same value as the flag, yet the frame stays open.')
            : '';
        return [first, second];
      }
      return [
        t('caption.close', '{byte}: flag. The frame closes.', { byte }),
        t('caption.done', 'Received bytes: {got}. Sent bytes: {sent}.', { got: s.got.length, sent: s.data.length }),
      ];
    }

    function drawRowLabel(y: number, text: string): void {
      const e = make(
        'text',
        {
          x: PAD + LABEL_W - 10,
          y,
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        svg,
      );
      e.textContent = text;
    }

    function drawCell(
      parent: Element,
      x: number,
      y: number,
      w: number,
      h: number,
      text: string,
      look: { fill: string; stroke: string; strokeW: number; ink: string },
    ): SVGGElement {
      const g = make('g', { transform: `translate(${r2(x)},${r2(y)})` }, parent);
      make(
        'rect',
        { x: 0, y: 0, width: w, height: h, rx: 5, fill: look.fill, stroke: look.stroke, 'stroke-width': look.strokeW },
        g,
      );
      const tx = make(
        'text',
        {
          x: w / 2,
          y: h / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': `${monoPx}px`,
          fill: look.ink,
        },
        g,
      );
      tx.textContent = text;
      return g;
    }

    function drawStatic(s: FrameBoundaryScene): Handles {
      svg.textContent = '';
      const handles: Handles = { head: null, bracketLine: null, bracketEnd: null, recv: [] };
      if (s.wire.length === 0) return handles;
      const g = geom(s.wire.length);

      // 보낸 데이터
      drawRowLabel(SENT_Y + ROW_H / 2, t('label.sent', 'Sent'));
      s.data.forEach((b, i) => {
        drawCell(svg, cellX(g, i), SENT_Y, g.cw, ROW_H, hex(b), {
          fill: colors.bgSubtle,
          stroke: colors.border,
          strokeW: 1,
          ink: colors.textMuted,
        });
      });

      // 선 위 바이트
      drawRowLabel(TAPE_Y + TAPE_H / 2, t('label.line', 'Line'));
      s.wire.forEach((b, i) => {
        const read = i <= s.pos;
        const isFlag = s.flag !== null && b === s.flag;
        const current = i === s.pos;
        const dropped = s.dropped.includes(i);
        const cell = drawCell(svg, cellX(g, i), TAPE_Y, g.cw, TAPE_H, hex(b), {
          fill: read ? colors.bgSubtle : colors.bg,
          stroke: current ? colors.itemActive : isFlag ? colors.primary : colors.border,
          strokeW: current || isFlag ? 2.5 : 1,
          ink: read && !isFlag ? colors.textMuted : colors.text,
        });
        if (dropped) {
          make(
            'line',
            {
              x1: 6,
              y1: TAPE_H - 8,
              x2: g.cw - 6,
              y2: 8,
              stroke: colors.textMuted,
              'stroke-width': 1.5,
            },
            cell,
          );
        }
      });

      // 프레임 괄호 — 여는 표식부터 지금 읽은 자리(닫혔으면 닫는 표식)까지
      if (s.openAt !== null) {
        const end = s.closeAt ?? s.pos;
        const x1 = cellX(g, s.openAt);
        const x2 = cellX(g, end) + g.cw;
        drawRowLabel(BRACKET_Y - BRACKET_TICK / 2, t('label.frame', 'Frame'));
        const stroke = { stroke: colors.primary, 'stroke-width': 2.5, 'stroke-linecap': 'round' };
        make('line', { x1, y1: BRACKET_Y - BRACKET_TICK, x2: x1, y2: BRACKET_Y, ...stroke }, svg);
        handles.bracketLine = make('line', { x1, y1: BRACKET_Y, x2, y2: BRACKET_Y, ...stroke }, svg);
        if (s.closeAt !== null) {
          handles.bracketEnd = make('line', { x1: x2, y1: BRACKET_Y - BRACKET_TICK, x2, y2: BRACKET_Y, ...stroke }, svg);
        }
      }

      // 받은 데이터
      drawRowLabel(RECV_Y + ROW_H / 2, t('label.received', 'Received'));
      s.got.forEach((gb, i) => {
        const restored = gb.from !== null;
        handles.recv.push(
          drawCell(svg, cellX(g, i), RECV_Y, g.cw, ROW_H, hex(gb.value), {
            fill: colors.bg,
            stroke: restored ? colors.accent : colors.text,
            strokeW: restored ? 2.5 : 1.5,
            ink: colors.text,
          }),
        );
        if (gb.from !== null && s.mask !== null) {
          const note = make(
            'text',
            {
              x: centerX(g, i),
              y: XOR_Y,
              'text-anchor': 'middle',
              'dominant-baseline': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            },
            svg,
          );
          note.textContent = t('label.xor', '{byte} XOR {mask}', { byte: hex(gb.from), mask: hex(s.mask) });
        }
      });

      // 읽는 머리 — 받는 쪽의 상태를 달고 다닌다
      const head = make('g', { transform: `translate(${r2(centerX(g, s.pos))},0)` }, svg);
      const tag = make(
        'text',
        {
          x: 0,
          y: TAG_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: s.state === 'escaped' ? colors.itemComparing : colors.text,
        },
        head,
      );
      tag.textContent = stateLabel(s.state);
      make(
        'path',
        {
          d: `M ${-7} ${CARET_TOP} L 7 ${CARET_TOP} L 0 ${CARET_TOP + CARET_H} Z`,
          fill: colors.itemActive,
        },
        head,
      );
      handles.head = head;

      // 캡션
      const [c1, c2] = captions(s);
      const cap = make(
        'text',
        {
          x: PAD,
          y: CAPTION_Y,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        svg,
      );
      cap.textContent = c1;
      if (c2) {
        const cap2 = make(
          'text',
          { x: PAD, y: CAPTION2_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.textMuted },
          svg,
        );
        cap2.textContent = c2;
      }
      return handles;
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          timers.delete(id);
          clearTimeout(id);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    /** 한 시계로 p 를 0 → 1 흘린다. 세대가 바뀌면 멈추고 false */
    async function tween(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (destroyed || mine !== gen) return false;
        const p = Math.min(1, (Date.now() - start) / ms);
        frame(ease(p));
        if (p >= 1) return true;
        await wait(16);
      }
    }

    async function animate(s: FrameBoundaryScene, h: Handles, mine: number): Promise<void> {
      const st = s.step;
      if (st.kind === 'start' || s.wire.length === 0) return;
      const g = geom(s.wire.length);
      const i = st.index;
      const headFrom = centerX(g, i - 1);
      const headTo = centerX(g, i);
      const endTo = cellX(g, i) + g.cw;
      const endFrom = st.kind === 'open' ? cellX(g, i) : cellX(g, i - 1) + g.cw;

      if (h.bracketEnd) h.bracketEnd.setAttribute('visibility', 'hidden');

      let fly: SVGGElement | null = null;
      let flyText: SVGTextElement | null = null;
      let flyRect: SVGRectElement | null = null;
      let target: SVGGElement | null = null;
      if (st.kind === 'keep' || st.kind === 'restore') {
        target = h.recv[st.slot] ?? null;
        if (target) target.setAttribute('visibility', 'hidden');
        fly = drawCell(svg, cellX(g, i), TAPE_Y, g.cw, TAPE_H, hex(st.byte), {
          fill: colors.bg,
          stroke: st.kind === 'restore' ? colors.accent : colors.text,
          strokeW: st.kind === 'restore' ? 2.5 : 1.5,
          ink: colors.text,
        });
        flyRect = fly.querySelector('rect');
        flyText = fly.querySelector('text');
      } else if (st.kind === 'escape') {
        fly = drawCell(svg, cellX(g, i), TAPE_Y, g.cw, TAPE_H, hex(st.byte), {
          fill: colors.bg,
          stroke: colors.textMuted,
          strokeW: 1,
          ink: colors.textMuted,
        });
      }

      const flyFromX = cellX(g, i);
      const flyToX = st.kind === 'keep' || st.kind === 'restore' ? cellX(g, st.slot) : flyFromX;

      const ok = await tween(mine, MOVE_MS, (p) => {
        if (h.head) h.head.setAttribute('transform', `translate(${r2(lerp(headFrom, headTo, p))},0)`);
        if (h.bracketLine) h.bracketLine.setAttribute('x2', r2(lerp(endFrom, endTo, p)));
        if (!fly) return;
        if (st.kind === 'escape') {
          fly.setAttribute('transform', `translate(${r2(flyFromX)},${r2(TAPE_Y + DROP_PX * p)})`);
          fly.setAttribute('opacity', r2(1 - p));
          return;
        }
        const hNow = lerp(TAPE_H, ROW_H, p);
        fly.setAttribute('transform', `translate(${r2(lerp(flyFromX, flyToX, p))},${r2(lerp(TAPE_Y, RECV_Y, p))})`);
        if (flyRect) flyRect.setAttribute('height', r2(hNow));
        if (flyText) {
          flyText.setAttribute('y', r2(hNow / 2));
          if (st.kind === 'restore' && p >= 0.5) flyText.textContent = hex(st.value);
        }
      });
      if (!ok) return;
      drawStatic(s);
    }

    return {
      render(next: unknown, _prev: unknown, opts: { animate: boolean }): Promise<void> {
        const s = next as FrameBoundaryScene;
        const mine = (gen += 1);
        const h = drawStatic(s);
        if (!opts.animate || destroyed) return Promise.resolve();
        return animate(s, h, mine);
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
    } as ViewInstance;
  },
};
