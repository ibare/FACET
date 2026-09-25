/**
 * lock-excludes 의 stage — 자물쇠의 주인 자리가 건네지는 그림.
 *
 * 스레드는 카드 한 장이고, 카드가 선 자리가 곧 그 스레드의 처지다. 왼쪽에서 오른쪽으로
 * 준비 → 자물쇠 앞 줄 → 자물쇠 안 주인 자리 → 끝남. 주인 자리는 하나뿐이라 자물쇠 틀 안에는
 * 카드가 한 장만 들어간다. 놓는 틱에 쥔 카드가 틀 밖으로 나가고, 같은 시계로 줄 맨 앞 카드가
 * 틀 안으로 들어오며 나머지 줄이 한 칸씩 당겨 선다 — 동사 "건네진다" 가 이 이동이다.
 *
 * 자리는 전부 캔버스 폭에서 역산한다. 색은 팔레트, 글꼴은 토큰.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { placeOf, type LockPlace, type LockScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 바깥 여백 · 칸 안쪽 여백. */
const MARGIN = 10;
const CELL_PAD = 6;
/** 머리말 두 줄과 칸 이름 줄. */
const TICK_Y = 20;
const CAPTION_Y = 46;
const LABEL_Y = 80;
const AREA_TOP = 94;
const AREA_BOTTOM_PAD = 14;
const STACK_GAP = 8;
/** 카드 세로의 상한 — 스레드가 적어도 카드가 포스터처럼 커지지 않게. */
const CARD_H_MAX = 84;
/** 카드 머리(스레드 식별자) 높이. */
const CARD_HEAD = 22;
/** 이동 한 번의 길이. 걸음 벽시계 = 이것 + stepMs. */
const MOVE_MS = 540;
const FRAME_MS = 16;
/** 줄에 선 카드의 흐림. 잠들었다는 표시. */
const ASLEEP_OPACITY = 0.6;
const DONE_OPACITY = 0.45;
/** 고정폭 글꼴의 글자 폭 / 글꼴 크기. 글자가 카드를 넘지 않게 크기를 셈할 때만 쓴다. */
const MONO_RATIO = 0.6;
const BODY_RATIO = 0.55;

interface Geometry {
  qCap: number;
  colW: number;
  cardW: number;
  cardH: number;
  rowY: number;
  codePx: number;
  rowH: number;
}

interface Spot {
  x: number;
  y: number;
  opacity: number;
}

interface Mover {
  id: string;
  from: Spot;
  to: Spot;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function geometryOf(scene: LockScene): Geometry {
  const n = scene.threads.length;
  const qCap = Math.max(1, n - 1);
  const cols = qCap + 3;
  const colW = (PIECE_CANVAS_W - 2 * MARGIN) / cols;
  const cardW = colW - 2 * CELL_PAD;
  const areaH = H - AREA_TOP - AREA_BOTTOM_PAD;
  const cardH = Math.min(CARD_H_MAX, (areaH - STACK_GAP * (n - 1)) / Math.max(1, n));
  const rowY = AREA_TOP + (areaH - cardH) / 2;
  const lines = Math.max(1, scene.program.length);
  const rowH = (cardH - CARD_HEAD - 4) / lines;
  const longest = Math.max(1, ...scene.program.map((s) => s.length));
  const smPx = parseFloat(fontSizes.sm);
  const codePx = Math.min(smPx, rowH * 0.8, (cardW - 24) / (longest * MONO_RATIO));
  return { qCap, colW, cardW, cardH, rowY, codePx, rowH };
}

function colLeft(g: Geometry, col: number): number {
  return MARGIN + col * g.colW;
}

function spotOf(scene: LockScene, g: Geometry, index: number, place: LockPlace): Spot {
  const stackY = AREA_TOP + index * (g.cardH + STACK_GAP);
  if (place === 'ready') return { x: colLeft(g, 0) + CELL_PAD, y: stackY, opacity: 1 };
  if (place === 'done') return { x: colLeft(g, g.qCap + 2) + CELL_PAD, y: stackY, opacity: DONE_OPACITY };
  if (place === 'seat') return { x: colLeft(g, g.qCap + 1) + CELL_PAD, y: g.rowY, opacity: 1 };
  const id = scene.threads[index];
  const k = id === undefined ? -1 : scene.queue.indexOf(id);
  if (k < 0) throw new Error(`lock-excludes-stage: ${String(id)} 가 줄에 없다`);
  return queueSpot(g, k);
}

/** 줄의 k 번째 (맨 앞이 0) 자리. 맨 앞이 자물쇠에 가장 가깝다. */
function queueSpot(g: Geometry, k: number): Spot {
  return { x: colLeft(g, g.qCap - k) + CELL_PAD, y: g.rowY, opacity: ASLEEP_OPACITY };
}

/** 이번 걸음에 자리를 옮기는 카드들. 출발 자리는 장면의 step 과 지금 자취에서 읽는다. */
function moversOf(scene: LockScene, g: Geometry): Mover[] {
  const st = scene.step;
  if (st === null || st.kind === 'work') return [];
  const idx = (id: string): number => {
    const i = scene.threads.indexOf(id);
    if (i < 0) throw new Error(`lock-excludes-stage: 없는 스레드 ${id}`);
    return i;
  };
  const at = (id: string): Spot => {
    const i = idx(id);
    return spotOf(scene, g, i, placeOf(scene, i));
  };
  const w = idx(st.who);
  const readySpot = spotOf(scene, g, w, 'ready');
  if (st.kind === 'take' || st.kind === 'block') {
    return [{ id: st.who, from: readySpot, to: at(st.who) }];
  }
  const seat = spotOf(scene, g, w, 'seat');
  const out: Mover[] = [{ id: st.who, from: seat, to: at(st.who) }];
  if (st.to !== null) {
    out.push({ id: st.to, from: queueSpot(g, 0), to: at(st.to) });
    scene.queue.forEach((id, k) => {
      out.push({ id, from: queueSpot(g, k + 1), to: queueSpot(g, k) });
    });
  }
  return out;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

export const lockExcludesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let cards = new Map<string, SVGGElement>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(text: string, x: number, y: number, attrs: Record<string, string | number>, parent: Element): SVGTextElement {
      const node = el('text', { x, y, ...attrs }, parent);
      node.textContent = text;
      return node;
    }

    function captionOf(s: LockScene): string {
      const st = s.step;
      const lock = s.lock;
      if (st === null) {
        return t('caption.start', 'Each thread runs the same lines. Owner of {lock}: none.', { lock });
      }
      if (st.kind === 'take') {
        return t('caption.take', '{who} runs lock({lock}). It was free. Owner: {who}.', { who: st.who, lock });
      }
      if (st.kind === 'block') {
        if (s.owner === null) throw new Error('lock-excludes-stage: 막혔는데 주인이 없다');
        return t('caption.block', '{who} runs lock({lock}). Owner is {owner}, so {who} sleeps at the back of the queue.', {
          who: st.who,
          lock,
          owner: s.owner,
        });
      }
      if (st.kind === 'work') {
        if (s.queue.length === 0) {
          return t('caption.workAlone', '{who} runs work() in the owner seat. Nobody is waiting.', { who: st.who });
        }
        return t('caption.work', '{who} runs work() in the owner seat. The queue stays asleep.', { who: st.who });
      }
      if (st.to !== null) {
        return t('caption.handoff', '{who} runs unlock({lock}). Handed straight to {to}, who wakes and goes on at work().', {
          who: st.who,
          lock,
          to: st.to,
        });
      }
      return t('caption.free', '{who} runs unlock({lock}). Nobody is waiting. Owner: none.', { who: st.who, lock });
    }

    function placeLabel(place: LockPlace): string {
      if (place === 'ready') return t('label.ready', 'Ready');
      if (place === 'queue') return t('label.queue', 'Queue');
      if (place === 'seat') return t('label.owner', 'Owner');
      return t('label.done', 'Done');
    }

    function fitPx(text: string, maxPx: number, ratio: number, width: number): number {
      return Math.min(maxPx, width / Math.max(1, text.length * ratio));
    }

    function drawCard(s: LockScene, g: Geometry, index: number, parent: Element): SVGGElement {
      const id = s.threads[index];
      if (id === undefined) throw new Error(`lock-excludes-stage: 없는 스레드 ${index}`);
      const place = placeOf(s, index);
      const spot = spotOf(s, g, index, place);
      const st = s.step;
      const ranNow = st !== null && st.who === id;
      const group = el('g', { transform: `translate(${round(spot.x)},${round(spot.y)})` }, parent);
      if (spot.opacity !== 1) group.setAttribute('opacity', String(spot.opacity));

      const stroke = ranNow ? colors.itemActive : place === 'seat' ? colors.primary : place === 'queue' ? colors.textMuted : colors.border;
      const card = el(
        'rect',
        { x: 0, y: 0, width: g.cardW, height: g.cardH, rx: 6, fill: colors.bg, stroke, 'stroke-width': ranNow || place === 'seat' ? 2 : 1 },
        group,
      );
      if (place === 'queue') card.setAttribute('stroke-dasharray', '4 3');

      label(id, 10, CARD_HEAD - 6, {
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 700,
      }, group);

      const pc = s.pc[index];
      if (pc === undefined) throw new Error(`lock-excludes-stage: ${id} 의 줄 번호가 없다`);
      s.program.forEach((text, j) => {
        const top = CARD_HEAD + j * g.rowH;
        if (ranNow && st !== null && st.line === j) {
          el('rect', {
            x: 4,
            y: top + 1,
            width: g.cardW - 8,
            height: g.rowH - 2,
            rx: 3,
            fill: st.kind === 'block' ? colors.danger : colors.itemActive,
            'fill-opacity': 0.22,
          }, group);
        }
        if (j === pc) {
          const cy = top + g.rowH / 2;
          const a = Math.min(5, g.rowH * 0.3);
          el('path', { d: `M ${round(7)} ${round(cy - a)} L ${round(7 + a * 1.4)} ${round(cy)} L ${round(7)} ${round(cy + a)} Z`, fill: colors.text }, group);
        }
        label(text, 18, top + g.rowH / 2, {
          fill: j < pc ? colors.textMuted : colors.text,
          'font-family': fonts.mono,
          'font-size': `${round(g.codePx)}px`,
          'dominant-baseline': 'central',
        }, group);
      });

      if (place === 'queue') {
        const word = t('label.asleep', 'asleep');
        label(word, g.cardW / 2, g.cardH + 16, {
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          'font-style': 'italic',
        }, group);
      }
      return group;
    }

    function drawStatic(s: LockScene): void {
      svg.textContent = '';
      cards = new Map();
      const g = geometryOf(s);
      const width = PIECE_CANVAS_W - 2 * MARGIN;

      if (s.step !== null) {
        label(t('label.tick', 'Tick {n}', { n: s.step.tick }), MARGIN, TICK_Y, {
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        }, svg);
      }
      const caption = captionOf(s);
      const mdPx = parseFloat(fontSizes.md);
      label(caption, MARGIN, CAPTION_Y, {
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': `${round(fitPx(caption, mdPx, BODY_RATIO, width))}px`,
      }, svg);

      // 칸 이름
      const labelAttrs = {
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      };
      label(placeLabel('ready'), colLeft(g, 0) + g.colW / 2, LABEL_Y, labelAttrs, svg);
      label(placeLabel('queue'), colLeft(g, 1) + (g.qCap * g.colW) / 2, LABEL_Y, labelAttrs, svg);
      label(placeLabel('seat'), colLeft(g, g.qCap + 1) + g.colW / 2, LABEL_Y, labelAttrs, svg);
      label(placeLabel('done'), colLeft(g, g.qCap + 2) + g.colW / 2, LABEL_Y, labelAttrs, svg);

      // 줄이 서는 바닥 — 자물쇠 틀로 이어진다
      const floorY = g.rowY + g.cardH + 4;
      el('line', {
        x1: colLeft(g, 1) + CELL_PAD,
        y1: floorY,
        x2: colLeft(g, g.qCap + 1) + 2,
        y2: floorY,
        stroke: colors.border,
        'stroke-width': 1,
      }, svg);

      // 자물쇠 틀 — 주인 자리는 하나
      const held = s.owner !== null;
      const fx = colLeft(g, g.qCap + 1) + 2;
      const fw = g.colW - 4;
      const fy = g.rowY - 26;
      const fh = g.cardH + 34;
      const frame = el('rect', {
        x: fx,
        y: fy,
        width: fw,
        height: fh,
        rx: 8,
        fill: colors.bgSubtle,
        stroke: held ? colors.primary : colors.border,
        'stroke-width': held ? 2 : 1.25,
      }, svg);
      if (!held) frame.setAttribute('stroke-dasharray', '5 4');
      // 걸쇠 — 쥔 이가 있으면 닫히고 없으면 들린다
      const cx = fx + fw / 2;
      const r = 9;
      const lift = held ? 0 : 6;
      el('path', {
        d: `M ${round(cx - r)} ${round(fy)} V ${round(fy - 8 - lift)} A ${r} ${r} 0 0 1 ${round(cx + r)} ${round(fy - 8 - lift)} V ${round(fy - (held ? 0 : lift + 2))}`,
        fill: 'none',
        stroke: held ? colors.primary : colors.textMuted,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
      }, svg);
      label(s.lock, fx + 8, fy + 16, {
        fill: held ? colors.primary : colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': 700,
      }, svg);

      const layer = el('g', {}, svg);
      s.threads.forEach((id, i) => {
        cards.set(id, drawCard(s, g, i, layer));
      });
    }

    function place(group: SVGGElement, from: Spot, to: Spot, k: number): void {
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k;
      const o = from.opacity + (to.opacity - from.opacity) * k;
      group.setAttribute('transform', `translate(${round(x)},${round(y)})`);
      if (round(o) === 1) group.removeAttribute('opacity');
      else group.setAttribute('opacity', String(round(o)));
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

    async function render(next: LockScene, _prev: LockScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate) return;
      const g = geometryOf(next);
      const movers = moversOf(next, g);
      if (movers.length === 0) return;
      const apply = (k: number): void => {
        for (const m of movers) {
          const group = cards.get(m.id);
          if (group !== undefined) place(group, m.from, m.to, k);
        }
      };
      apply(0);
      const start = Date.now();
      let k = 0;
      while (k < 1) {
        if (mine !== gen || destroyed) return;
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        k = Math.min(1, (Date.now() - start) / MOVE_MS);
        apply(ease(k));
      }
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
