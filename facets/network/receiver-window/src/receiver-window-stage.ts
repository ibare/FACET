/**
 * receiver-window 의 그림 — 위에 보내는 쪽 조각 줄, 아래에 받는 쪽 버퍼와 앱.
 *
 * 동사 "돌려준다": 앱이 읽어 버퍼가 비면 빈자리의 수가 창 표로 떠올라 보내는 쪽으로 거슬러
 * 올라가고, 보내는 쪽 조각 줄에 그 수만큼의 테를 친다. 보냄 걸음에서는 테 안의 조각만
 * 버퍼로 내려간다. 창이 0 이면 테 대신 막대가 서고, 다음 조각은 막대에 부딪혀 되돌아온다.
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
} from '@ffacet/core/runtime';
import type { ReceiverWindowScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 300;
const MARGIN = 20;
const GAP = 6;
const CELL_MAX_W = 80;
const CELL_H = 40;
const SENDER_Y = 40;
const BRACKET_Y = SENDER_Y + CELL_H + 8;
const TAG_Y = BRACKET_Y + 22;
const TAG_H = 22;
const BUFFER_Y = 186;
const APP_W = 120;
const APP_GAP = 40;
const CAPTION_Y = 256;
const MOTION_MS = 700;
const FRAME_MS = 16;
const STALL_DIP = 12;

type Layout = {
  cellW: number;
  senderX: (seg: number) => number;
  bufW: number;
  bufX: (slot: number) => number;
  appX: number;
};

function layout(scene: ReceiverWindowScene): Layout {
  const n = Math.max(1, scene.base.segments);
  const s = Math.max(1, scene.base.slots);
  const cellW = Math.min(CELL_MAX_W, (PIECE_CANVAS_W - 2 * MARGIN - (n - 1) * GAP) / n);
  const appX = PIECE_CANVAS_W - MARGIN - APP_W;
  const bufW = Math.min(cellW, (appX - APP_GAP - MARGIN - (s - 1) * GAP) / s);
  const bufX0 = appX - APP_GAP - (s * bufW + (s - 1) * GAP);
  return {
    cellW,
    senderX: (seg) => MARGIN + seg * (cellW + GAP),
    bufW,
    bufX: (slot) => bufX0 + slot * (bufW + GAP),
    appX,
  };
}

/** 버퍼 안의 자리 — 오래된 것이 앱 쪽(오른쪽) 끝 */
function slotOf(scene: ReceiverWindowScene, order: number): number {
  return scene.base.slots - 1 - order;
}

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round2(v) : v));
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, body: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = body;
  return node;
}

export const receiverWindowStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 운동이 쥘 손잡이 — drawStatic 이 매번 새로 채운다 */
    let bufferEls = new Map<number, SVGGElement>();
    let senderEls = new Map<number, SVGGElement>();
    let tagEl: SVGGElement | null = null;
    let fenceEl: SVGGElement | null = null;
    let motionLayer: SVGGElement | null = null;

    function rangeText(scene: ReceiverWindowScene, seg: number): string {
      const a = seg * scene.base.segmentBytes + 1;
      const b = (seg + 1) * scene.base.segmentBytes;
      return t('label.range', '{a}–{b}', { a, b });
    }

    function cell(parent: Element, scene: ReceiverWindowScene, seg: number, x: number, y: number, w: number, ghost: boolean): SVGGElement {
      const g = el('g', {}, parent);
      el(
        'rect',
        ghost
          ? { x, y, width: w, height: CELL_H, rx: 4, fill: 'none', stroke: colors.border, 'stroke-dasharray': '4 3' }
          : { x, y, width: w, height: CELL_H, rx: 4, fill: colors.itemDefault, stroke: colors.text, 'stroke-width': 1.2 },
        g,
      );
      label(g, x + w / 2, y + CELL_H / 2 + xsPx / 2 - 1, rangeText(scene, seg), {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: ghost ? colors.textMuted : colors.text,
      });
      return g;
    }

    function tag(parent: Element, cx: number, y: number, window: number): SVGGElement {
      const g = el('g', {}, parent);
      const body = t('label.window', 'Window: {w}', { w: window });
      const w = body.length * smPx * 0.62 + 16;
      el('rect', { x: cx - w / 2, y, width: w, height: TAG_H, rx: TAG_H / 2, fill: colors.accent }, g);
      label(g, cx, y + TAG_H / 2 + smPx / 2 - 2, body, {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: colors.stateInk,
      });
      return g;
    }

    function caption(scene: ReceiverWindowScene): string[] {
      const step = scene.step;
      if (step === null) {
        return [t('caption.start', 'Window advertised when the connection opened: {w} bytes', { w: scene.window })];
      }
      if (step.kind === 'send') {
        const lines = [
          t('caption.send', 'Round {r} · window: {w} · segments sent: {n} (bytes {a}–{b})', {
            r: step.round,
            w: step.window,
            n: step.count,
            a: step.firstByte,
            b: step.lastByte,
          }),
        ];
        if (scene.done) lines.push(t('caption.done', 'All sent: {total} bytes', { total: scene.base.totalBytes }));
        return lines;
      }
      if (step.kind === 'stall') {
        return [
          t('caption.stall', 'Round {r} · window: {w} · segments sent: 0 — the sender waits', {
            r: step.round,
            w: step.window,
          }),
        ];
      }
      return [
        t('caption.read', 'App read: {rd} bytes', { rd: step.read }),
        t('caption.notify', 'Free space sent back as the window: {w} bytes', { w: step.window }),
      ];
    }

    function drawStatic(scene: ReceiverWindowScene): void {
      svg.textContent = '';
      bufferEls = new Map();
      senderEls = new Map();
      tagEl = null;
      fenceEl = null;
      const L = layout(scene);
      const { segments, slots, bufferBytes } = scene.base;

      // 보내는 쪽
      label(svg, MARGIN, SENDER_Y - 10, t('label.sender', 'Sender'), {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: colors.text,
      });
      for (let seg = 0; seg < segments; seg += 1) {
        const g = cell(svg, scene, seg, L.senderX(seg), SENDER_Y, L.cellW, seg < scene.nextSeg);
        if (seg >= scene.nextSeg) senderEls.set(seg, g);
      }

      // 보내는 쪽이 쥔 창 — 테 또는 막대, 그리고 수
      const showTag = !scene.done && scene.nextSeg < segments && (scene.windowFresh || scene.window === 0);
      if (showTag) {
        const x0 = L.senderX(scene.nextSeg);
        const fits = Math.min(Math.floor(scene.window / scene.base.segmentBytes), segments - scene.nextSeg);
        const fence = el('g', {}, svg);
        let cx: number;
        if (fits > 0) {
          const x1 = L.senderX(scene.nextSeg + fits - 1) + L.cellW;
          el(
            'path',
            {
              d: `M${round2(x0)} ${BRACKET_Y - 6} V${BRACKET_Y} H${round2(x1)} V${BRACKET_Y - 6}`,
              fill: 'none',
              stroke: colors.accent,
              'stroke-width': 3,
              'stroke-linejoin': 'round',
            },
            fence,
          );
          cx = (x0 + x1) / 2;
        } else {
          el('rect', { x: x0 - 4, y: BRACKET_Y - 3, width: L.cellW + 8, height: 5, rx: 1, fill: colors.danger }, fence);
          cx = x0 + L.cellW / 2;
        }
        fenceEl = fence;
        tagEl = tag(svg, cx, TAG_Y, scene.window);
      }

      // 받는 쪽 버퍼
      label(svg, L.bufX(0), BUFFER_Y - 10, t('label.buffer', 'Receiver buffer: {used} / {cap}', { used: scene.used, cap: bufferBytes }), {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: colors.text,
      });
      for (let slot = 0; slot < slots; slot += 1) {
        el(
          'rect',
          { x: L.bufX(slot), y: BUFFER_Y, width: L.bufW, height: CELL_H, rx: 4, fill: 'none', stroke: colors.border, 'stroke-dasharray': '4 3' },
          svg,
        );
      }
      scene.buffer.forEach((seg, order) => {
        bufferEls.set(seg, cell(svg, scene, seg, L.bufX(slotOf(scene, order)), BUFFER_Y, L.bufW, false));
      });

      // 앱
      el('rect', { x: L.appX, y: BUFFER_Y - 4, width: APP_W, height: CELL_H + 8, rx: 6, fill: colors.bgSubtle, stroke: colors.border }, svg);
      label(svg, L.appX + APP_W / 2, BUFFER_Y + 14, t('label.app', 'App'), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: colors.text,
      });
      label(svg, L.appX + APP_W / 2, BUFFER_Y + 32, t('label.read', 'Read: {n}', { n: scene.readTotal }), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });

      // 캡션
      caption(scene).forEach((line, i) => {
        label(svg, PIECE_CANVAS_W / 2, CAPTION_Y + i * 22, line, {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: i === 0 ? colors.text : colors.textMuted,
        });
      });

      motionLayer = el('g', {}, svg);
    }

    /** 한 시계 — p 를 0→1 로 흘린다. 거두어지면 false */
    function clock(mine: number, onFrame: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        let elapsed = 0;
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            waiters.delete(wake);
            resolve(false);
            return;
          }
          elapsed += FRAME_MS;
          const p = Math.min(1, elapsed / MOTION_MS);
          onFrame(p);
          if (p >= 1) {
            waiters.delete(wake);
            resolve(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        onFrame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    function shift(node: Element, dx: number, dy: number): void {
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${round2(dx)} ${round2(dy)})`);
    }

    async function animateSend(mine: number, scene: ReceiverWindowScene, first: number, count: number): Promise<void> {
      const L = layout(scene);
      const moves: { node: SVGGElement; dx: number; dy: number; delay: number }[] = [];
      for (let i = 0; i < count; i += 1) {
        const seg = first + i;
        const node = bufferEls.get(seg);
        const order = scene.buffer.indexOf(seg);
        if (!node || order < 0) continue;
        moves.push({
          node,
          dx: L.senderX(seg) - L.bufX(slotOf(scene, order)),
          dy: SENDER_Y - BUFFER_Y,
          delay: count > 1 ? (i / (count - 1)) * 0.25 : 0,
        });
      }
      await clock(mine, (p) => {
        for (const m of moves) {
          const q = ease(Math.max(0, Math.min(1, (p - m.delay) / (1 - 0.25))));
          shift(m.node, m.dx * (1 - q), m.dy * (1 - q));
        }
      });
    }

    async function animateStall(mine: number, seg: number): Promise<void> {
      const node = senderEls.get(seg);
      if (!node) return;
      await clock(mine, (p) => {
        // 막대까지 내려갔다가 부딪혀 되돌아온다
        const d = p < 0.5 ? ease(p * 2) : 1 - ease((p - 0.5) * 2);
        shift(node, 0, STALL_DIP * d);
      });
    }

    async function animateRead(mine: number, scene: ReceiverWindowScene, taken: number[], before: number[]): Promise<void> {
      const L = layout(scene);
      const layer = motionLayer;
      if (!layer) return;
      const split = 0.45;

      // 읽힌 조각 — 옛 자리에서 앱으로 빨려 든다
      const leaving = taken.map((seg) => {
        const order = before.indexOf(seg);
        const x = L.bufX(scene.base.slots - 1 - order);
        return { g: cell(layer, scene, seg, x, BUFFER_Y, L.bufW, false), x };
      });
      const appCx = L.appX + APP_W / 2;
      // 남은 조각 — 옛 자리에서 앱 쪽으로 당겨진다
      const staying = scene.buffer.map((seg, order) => ({
        node: bufferEls.get(seg),
        dx: L.bufX(scene.base.slots - 1 - before.indexOf(seg)) - L.bufX(slotOf(scene, order)),
      }));
      // 돌려주는 창 — 빈자리 한가운데서 떠올라 보내는 쪽으로
      const free = scene.base.slots - scene.buffer.length;
      const fromCx = free > 0 ? (L.bufX(0) + L.bufX(free - 1) + L.bufW) / 2 : L.bufX(0);
      const fromY = BUFFER_Y + CELL_H / 2 - TAG_H / 2;
      const tagBox = tagEl?.querySelector('rect');
      const toCx = tagBox ? Number(tagBox.getAttribute('x')) + Number(tagBox.getAttribute('width')) / 2 : fromCx;
      if (fenceEl) fenceEl.setAttribute('visibility', 'hidden');

      await clock(mine, (p) => {
        const a = ease(Math.min(1, p / split));
        for (const l of leaving) {
          const cx = l.x + L.bufW / 2;
          const s = 1 - 0.8 * a;
          l.g.setAttribute('transform', `translate(${round2((appCx - cx) * a + cx)} ${round2(BUFFER_Y + CELL_H / 2)}) scale(${round2(s)}) translate(${round2(-cx)} ${round2(-(BUFFER_Y + CELL_H / 2))})`);
          l.g.setAttribute('opacity', String(round2(1 - a)));
        }
        for (const st of staying) if (st.node) shift(st.node, st.dx * (1 - a), 0);
        if (tagEl) {
          const b = ease(Math.max(0, (p - split) / (1 - split)));
          shift(tagEl, (fromCx - toCx) * (1 - b), (fromY - TAG_Y) * (1 - b));
          if (p < split) tagEl.setAttribute('visibility', 'hidden');
          else tagEl.removeAttribute('visibility');
        }
      });
    }

    return {
      async render(next: ReceiverWindowScene, prev: ReceiverWindowScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        const step = next.step;
        if (!opts.animate || prev === null || step === null) return;
        if (step.kind === 'send') await animateSend(mine, next, step.first, step.count);
        else if (step.kind === 'stall') await animateStall(mine, step.seg);
        else await animateRead(mine, next, step.taken, step.before);
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
