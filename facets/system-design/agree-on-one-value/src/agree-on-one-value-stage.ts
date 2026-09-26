/**
 * agree-on-one-value 무대.
 *
 * 받는 쪽 다섯이 가운데 한 줄로 서고, 먼저 온 제안자는 위에서, 뒤에 온 제안자는 아래에서
 * 제 과반으로 줄을 긋는다. 두 과반의 줄이 모두 닿는 받는 쪽이 겹친 자리다. 움직이는 것은
 * 값 칩이다 — 제안자 손에서 받는 쪽으로 건너가고, 대답이 되어 아래로 돌아오고, 뒤의
 * 제안자 손에서 제 값을 밀어내고 들어앉는다. 오른쪽 위의 줄은 걸음마다 정해진 값을 쌓는다.
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
} from '@ffacet/core/runtime';
import type { AgreeOnOneValueScene, ProposerState } from './scene.js';

const H = 420;
const SVG = 'http://www.w3.org/2000/svg';

const MARGIN = 24;
const ROW_TOP = 160;
const ROW_H = 76;
const BOX_W_MAX = 84;
const PROP_W = 170;
const PROP_H = 72;
const PROP_TOP = [24, 296];
const CHIP_W = 40;
const CHIP_H = 28;
const SLOT_W = 46;
const SLOT_GAP = 6;
const TRACK_X0 = 320;
const TRACK_Y = 28;
const TRACK_CELL_H = 24;
const TRACK_GAP = 3;
const TRACK_CELL_MAX = 26;
const CAPTION_Y1 = 394;
const CAPTION_Y2 = 412;

const ACCEPT_MS = 560;
const ASK_MS = 600;
const ADOPT_MS = 560;

type Pt = { x: number; y: number };

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function ease(k: number): number {
  return k * k * (3 - 2 * k);
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  fill: string,
  size: string,
  anchor: 'start' | 'middle' | 'end',
  weight = 'normal',
): SVGTextElement {
  const node = el(parent, 'text', {
    x: r1(x),
    y: r1(y),
    fill,
    'font-family': fonts.body,
    'font-size': size,
    'font-weight': weight,
    'text-anchor': anchor,
  });
  node.textContent = text;
  return node;
}

type ChipLook = { text: string; fill: string; stroke: string; ink: string; dashed: boolean; struck: boolean };

/** 가운데가 (0,0) 인 값 칩. 자리는 transform 으로 옮긴다 */
function chip(parent: Element, at: Pt, look: ChipLook): SVGGElement {
  const g = el(parent, 'g', { transform: `translate(${r1(at.x)},${r1(at.y)})` });
  const rect: Record<string, string | number> = {
    x: -CHIP_W / 2,
    y: -CHIP_H / 2,
    width: CHIP_W,
    height: CHIP_H,
    rx: 6,
    fill: look.fill,
    stroke: look.stroke,
    'stroke-width': 1.5,
  };
  if (look.dashed) rect['stroke-dasharray'] = '4 3';
  el(g, 'rect', rect);
  const tx = el(g, 'text', {
    x: 0,
    y: 5,
    fill: look.ink,
    'font-family': fonts.mono,
    'font-size': fontSizes.lg,
    'font-weight': 'bold',
    'text-anchor': 'middle',
  });
  tx.textContent = look.text;
  if (look.struck) {
    el(g, 'line', { x1: -CHIP_W / 2 + 4, y1: 0, x2: CHIP_W / 2 - 4, y2: 0, stroke: look.ink, 'stroke-width': 2 });
  }
  return g;
}

function place(g: SVGGElement, p: Pt): void {
  g.setAttribute('transform', `translate(${r1(p.x)},${r1(p.y)})`);
}

function lerp(a: Pt, b: Pt, k: number): Pt {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

type Layout = {
  accX: Map<string, number>;
  boxW: number;
  propBox: Map<string, { x: number; y: number; below: boolean }>;
  hand: Map<string, Pt>;
  slot: Map<string, Pt>; // `${by}:${at}`
  drop: Map<string, Pt>;
  accChip: Map<string, Pt>;
};

function layoutOf(scene: AgreeOnOneValueScene): Layout {
  const n = scene.acceptors.length;
  const pitch = (PIECE_CANVAS_W - 2 * MARGIN) / n;
  const boxW = Math.min(BOX_W_MAX, pitch - 16);
  const accX = new Map<string, number>();
  const accChip = new Map<string, Pt>();
  scene.acceptors.forEach((a, i) => {
    const x = MARGIN + pitch * (i + 0.5);
    accX.set(a.id, x);
    accChip.set(a.id, { x, y: ROW_TOP + 42 });
  });
  if (scene.proposers.length > PROP_TOP.length) {
    throw new Error(`agree-on-one-value-stage: 제안자 ${scene.proposers.length} 을 둘 자리가 없다`);
  }
  const propBox = new Map<string, { x: number; y: number; below: boolean }>();
  const hand = new Map<string, Pt>();
  const slot = new Map<string, Pt>();
  const drop = new Map<string, Pt>();
  scene.proposers.forEach((p, i) => {
    const top = PROP_TOP[i];
    if (top === undefined) throw new Error(`agree-on-one-value-stage: 제안자 ${p.id} 의 자리가 없다`);
    const xs = p.to.map((a) => {
      const x = accX.get(a);
      if (x === undefined) throw new Error(`agree-on-one-value-stage: ${p.id} 의 ${a} 가 받는 쪽에 없다`);
      return x;
    });
    const cx = xs.reduce((s, x) => s + x, 0) / xs.length;
    const x = Math.min(Math.max(cx - PROP_W / 2, MARGIN), PIECE_CANVAS_W - MARGIN - PROP_W);
    propBox.set(p.id, { x, y: top, below: i > 0 });
    hand.set(p.id, { x: x + PROP_W - 32, y: top + 46 });
    drop.set(p.id, { x: x + PROP_W + 14 + CHIP_W / 2, y: top + 46 });
    if (p.asks) {
      const span = p.to.length * SLOT_W + (p.to.length - 1) * SLOT_GAP;
      const x0 = x - 14 - span;
      p.to.forEach((a, j) => {
        slot.set(`${p.id}:${a}`, { x: x0 + j * (SLOT_W + SLOT_GAP) + SLOT_W / 2, y: top + 37 });
      });
    }
  });
  return { accX, boxW, propBox, hand, slot, drop, accChip };
}

function need<K, V>(m: Map<K, V>, k: K, what: string): V {
  const v = m.get(k);
  if (v === undefined) throw new Error(`agree-on-one-value-stage: ${what} ${String(k)} 가 없다`);
  return v;
}

export const agreeOnOneValueStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    /** 정적 그리기가 매번 새로 짓는 칩 손잡이 */
    let chips = new Map<string, SVGElement>();
    let motion: SVGGElement | null = null;

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    /** ms 동안 frame(0..1) 을 흘린다. 세대가 바뀌거나 거두어지면 false */
    async function tween(ms: number, mine: number, frame: (k: number) => void): Promise<boolean> {
      const t0 = performance.now();
      frame(0);
      for (let i = 0; i < 1000; i += 1) {
        await wait(16);
        if (mine !== gen || destroyed) return false;
        const k = Math.min(1, (performance.now() - t0) / ms);
        frame(ease(k));
        if (k >= 1) return true;
      }
      return true;
    }

    function valueColor(scene: AgreeOnOneValueScene, v: number): string {
      const i = scene.proposers.findIndex((p) => p.own === v);
      if (i < 0) throw new Error(`agree-on-one-value-stage: 값 ${v} 를 낸 제안자가 없다`);
      const c = categorical(scene.proposers.length)[i];
      if (c === undefined) throw new Error(`agree-on-one-value-stage: 값 ${v} 의 색이 없다`);
      return c;
    }

    function valueLook(scene: AgreeOnOneValueScene, v: number): ChipLook {
      return { text: String(v), fill: valueColor(scene, v), stroke: colors.stateInk, ink: colors.stateInk, dashed: false, struck: false };
    }

    function emptyLook(text: string): ChipLook {
      return { text, fill: colors.bg, stroke: colors.border, ink: colors.textMuted, dashed: true, struck: false };
    }

    function proposerColor(scene: AgreeOnOneValueScene, p: ProposerState): string {
      return valueColor(scene, p.own);
    }

    function currentDecided(scene: AgreeOnOneValueScene): number[] {
      const last = scene.track[scene.track.length - 1];
      return last === undefined ? [] : last;
    }

    function drawCaption(scene: AgreeOnOneValueScene): void {
      const s = scene.step;
      if (s === null) return;
      const total = scene.acceptors.length;
      const d = currentDecided(scene).join(' · ');
      let line1 = '';
      let line2 = '';
      if (s.kind === 'init') {
        if (scene.majority === null) throw new Error('agree-on-one-value-stage: init 뒤에 과반이 없다');
        line1 = t('caption.init', 'Proposers: {p} · Acceptors: {a}', { p: scene.proposers.length, a: total });
        line2 = t('caption.initSub', 'Majority: {m}', { m: scene.majority });
      } else if (s.kind === 'ask') {
        line1 = t('caption.ask', '{p} asks {a}: what have you accepted?', { p: s.by, a: s.at });
        line2 = s.answer === null
          ? t('caption.answerNone', 'Answer: none')
          : t('caption.answer', 'Answer: ballot {b}, value {v}', { b: s.answer.ballot, v: s.answer.value });
      } else if (s.kind === 'adopt') {
        if (s.source === null) {
          line1 = t('caption.adoptOwn', '{p} carries its own value {own}.', { p: s.by, own: s.own });
          line2 = t('caption.adoptOwnSub', 'No accepted value among the answers');
        } else {
          line1 = t('caption.adopt', '{p} carries {v} instead of its own {own}.', { p: s.by, v: s.carries, own: s.own });
          line2 = t('caption.adoptSub', 'Highest ballot among the answers: {b}, from {a}', { b: s.source.ballot, a: s.source.at });
        }
      } else {
        line1 = s.was === null
          ? t('caption.accept', '{a} accepts ballot {b}, value {v}.', { a: s.at, b: s.ballot, v: s.value })
          : t('caption.acceptOver', '{a} accepts ballot {b}, value {v} — before: ballot {wb}, value {wv}.', {
              a: s.at,
              b: s.ballot,
              v: s.value,
              wb: s.was.ballot,
              wv: s.was.value,
            });
        const prop = need(new Map(scene.proposers.map((p) => [p.id, p])), s.by, '제안자');
        if (s.firstDecided) {
          if (scene.majority === null) throw new Error('agree-on-one-value-stage: 과반이 없다');
          line2 = t('caption.decide', 'Holding {v}: {n}/{total} · Majority: {m} · Decided value: {d}', {
            v: s.value,
            n: s.holding,
            total,
            m: scene.majority,
            d,
          });
        } else if (d === '') {
          line2 = t('caption.tally', 'Holding {v}: {n}/{total}', { v: s.value, n: s.holding, total });
        } else {
          line2 = t('caption.after', 'Decided value: {d} · Holding {own}: {k}/{total}', {
            d,
            own: prop.own,
            k: s.ownHolding,
            total,
          });
        }
      }
      label(svg, PIECE_CANVAS_W / 2, CAPTION_Y1, line1, colors.text, fontSizes.md, 'middle', 'bold');
      label(svg, PIECE_CANVAS_W / 2, CAPTION_Y2, line2, colors.textMuted, fontSizes.sm, 'middle');
    }

    function drawTrack(scene: AgreeOnOneValueScene): void {
      if (scene.totalSteps === null) return;
      const n = scene.totalSteps;
      const avail = PIECE_CANVAS_W - MARGIN - TRACK_X0;
      const cw = Math.min(TRACK_CELL_MAX, (avail - (n - 1) * TRACK_GAP) / n);
      label(svg, TRACK_X0, TRACK_Y - 10, t('label.track', 'Decided value at each step'), colors.textMuted, fontSizes.xs, 'start');
      const now = scene.track.length - 1;
      for (let i = 0; i < n; i += 1) {
        const x = TRACK_X0 + i * (cw + TRACK_GAP);
        const cx = x + cw / 2;
        const cell = scene.track[i];
        const current = i === now;
        if (cell === undefined) {
          el(svg, 'rect', {
            x: r1(x), y: TRACK_Y, width: r1(cw), height: TRACK_CELL_H, rx: 3,
            fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 3',
          });
        } else if (cell.length === 0) {
          el(svg, 'rect', {
            x: r1(x), y: TRACK_Y, width: r1(cw), height: TRACK_CELL_H, rx: 3,
            fill: colors.bgSubtle, stroke: current ? colors.text : colors.border, 'stroke-width': current ? 2 : 1,
          });
          label(svg, cx, TRACK_Y + 16, '–', colors.textMuted, fontSizes.sm, 'middle');
        } else {
          const first = cell[0];
          if (first === undefined) throw new Error('agree-on-one-value-stage: 정해진 값 칸이 비었다');
          el(svg, 'rect', {
            x: r1(x), y: TRACK_Y, width: r1(cw), height: TRACK_CELL_H, rx: 3,
            fill: cell.length === 1 ? valueColor(scene, first) : colors.danger,
            stroke: current ? colors.text : colors.stateInk, 'stroke-width': current ? 2 : 1,
          });
          label(svg, cx, TRACK_Y + 16, cell.join('·'), colors.stateInk, fontSizes.sm, 'middle', 'bold');
        }
        label(svg, cx, TRACK_Y + TRACK_CELL_H + 12, String(i), current ? colors.text : colors.textMuted, fontSizes.xs, 'middle', current ? 'bold' : 'normal');
      }
    }

    function drawStatic(scene: AgreeOnOneValueScene): void {
      svg.textContent = '';
      chips = new Map();
      const L = layoutOf(scene);
      const decided = currentDecided(scene);
      const s = scene.step;
      const activeBy = s !== null && s.kind !== 'init' ? s.by : null;
      const activeAt = s !== null && (s.kind === 'ask' || s.kind === 'accept') ? s.at : null;

      // 제안자에서 제 과반으로 긋는 줄 — 먼저 그려 칸 밑에 깔린다
      for (const p of scene.proposers) {
        const box = need(L.propBox, p.id, '제안자 자리');
        const px = box.x + PROP_W / 2;
        const py = box.below ? box.y : box.y + PROP_H;
        for (const a of p.to) {
          const ax = need(L.accX, a, '받는 쪽');
          const ay = box.below ? ROW_TOP + ROW_H : ROW_TOP;
          const hot = activeBy === p.id && activeAt === a;
          el(svg, 'line', {
            x1: r1(px), y1: r1(py), x2: r1(ax), y2: r1(ay),
            stroke: hot ? proposerColor(scene, p) : colors.border,
            'stroke-width': hot ? 3 : 1.5,
          });
        }
      }

      // 겹친 자리
      for (const a of scene.overlap) {
        const ax = need(L.accX, a, '겹친 자리');
        el(svg, 'rect', {
          x: r1(ax - L.boxW / 2 - 6), y: ROW_TOP - 6, width: r1(L.boxW + 12), height: ROW_H + 12, rx: 10,
          fill: 'none', stroke: colors.itemComparing, 'stroke-width': 2.5,
        });
        label(svg, ax, ROW_TOP + ROW_H + 22, t('label.overlap', 'overlap'), colors.itemComparing, fontSizes.xs, 'middle', 'bold');
      }

      // 받는 쪽
      for (const a of scene.acceptors) {
        const ax = need(L.accX, a.id, '받는 쪽');
        const firm = a.accepted !== null && decided.includes(a.accepted.value);
        el(svg, 'rect', {
          x: r1(ax - L.boxW / 2), y: ROW_TOP, width: r1(L.boxW), height: ROW_H, rx: 8,
          fill: colors.bgSubtle,
          stroke: firm ? colors.text : colors.border,
          'stroke-width': firm ? 3 : 1.5,
        });
        label(svg, ax, ROW_TOP + 16, a.id, colors.text, fontSizes.sm, 'middle', 'bold');
        const at = need(L.accChip, a.id, '받는 쪽 칩 자리');
        const g = chip(svg, at, a.accepted === null ? emptyLook('–') : valueLook(scene, a.accepted.value));
        chips.set(`acc:${a.id}`, g);
        if (a.accepted !== null) {
          const b = label(svg, ax, ROW_TOP + ROW_H - 6, t('label.ballot', 'ballot {b}', { b: a.accepted.ballot }), colors.textMuted, fontSizes.xs, 'middle');
          chips.set(`accb:${a.id}`, b);
        }
      }
      if (scene.majority !== null) {
        label(svg, MARGIN, ROW_TOP + ROW_H + 22, t('label.acceptors', 'Acceptors · majority: {m}', { m: scene.majority }), colors.textMuted, fontSizes.xs, 'start');
      }

      // 제안자
      for (const p of scene.proposers) {
        const box = need(L.propBox, p.id, '제안자 자리');
        const pc = proposerColor(scene, p);
        el(svg, 'rect', {
          x: r1(box.x), y: box.y, width: PROP_W, height: PROP_H, rx: 10,
          fill: colors.bg, stroke: pc, 'stroke-width': activeBy === p.id ? 3 : 2,
        });
        label(svg, box.x + 12, box.y + 28, t('label.proposer', 'Proposer {id}', { id: p.id }), colors.text, fontSizes.md, 'start', 'bold');
        label(svg, box.x + 12, box.y + 52, t('label.ballot', 'ballot {b}', { b: p.ballot }), colors.textMuted, fontSizes.sm, 'start');
        const hand = need(L.hand, p.id, '손');
        label(svg, hand.x, box.y + 18, t('label.carries', 'carries'), colors.textMuted, fontSizes.xs, 'middle');
        chips.set(`hand:${p.id}`, chip(svg, hand, valueLook(scene, p.carries)));

        const own = scene.dropped.find((x) => x.by === p.id);
        if (own !== undefined) {
          chips.set(`drop:${p.id}`, chip(svg, need(L.drop, p.id, '버린 자리'), {
            text: String(own.value), fill: colors.bg, stroke: colors.textMuted, ink: colors.textMuted, dashed: true, struck: true,
          }));
        }

        if (p.asks) {
          const first = need(L.slot, `${p.id}:${p.to[0]}`, '대답 칸');
          label(svg, first.x - SLOT_W / 2, box.y - 8, t('label.answers', 'Answers'), colors.textMuted, fontSizes.xs, 'start');
          for (const a of p.to) {
            const sp = need(L.slot, `${p.id}:${a}`, '대답 칸');
            el(svg, 'rect', {
              x: r1(sp.x - SLOT_W / 2), y: box.y, width: SLOT_W, height: PROP_H, rx: 6,
              fill: 'none', stroke: colors.border,
            });
            label(svg, sp.x, box.y + 14, a, colors.textMuted, fontSizes.xs, 'middle');
            const got = scene.answers.find((r) => r.by === p.id && r.at === a);
            if (got !== undefined) {
              const g = chip(svg, sp, got.answer === null ? emptyLook('–') : valueLook(scene, got.answer.value));
              chips.set(`ans:${p.id}:${a}`, g);
              if (got.answer !== null) {
                label(svg, sp.x, box.y + PROP_H - 6, t('label.ballot', 'ballot {b}', { b: got.answer.ballot }), colors.textMuted, fontSizes.xs, 'middle');
              }
            }
          }
        }
      }

      drawTrack(scene);
      drawCaption(scene);
      motion = el(svg, 'g', {});
    }

    function handle(key: string): SVGElement {
      const g = chips.get(key);
      if (g === undefined) throw new Error(`agree-on-one-value-stage: 칩 ${key} 가 없다`);
      return g;
    }

    function layer(): SVGGElement {
      if (motion === null) throw new Error('agree-on-one-value-stage: 운동 층이 없다');
      return motion;
    }

    async function animate(next: AgreeOnOneValueScene, mine: number): Promise<void> {
      const s = next.step;
      if (s === null || s.kind === 'init') return;
      const L = layoutOf(next);
      if (s.kind === 'accept') {
        handle(`acc:${s.at}`).setAttribute('visibility', 'hidden');
        handle(`accb:${s.at}`).setAttribute('visibility', 'hidden');
        const from = need(L.hand, s.by, '손');
        const to = need(L.accChip, s.at, '받는 쪽 칩 자리');
        const fly = chip(layer(), from, valueLook(next, s.value));
        await tween(ACCEPT_MS, mine, (k) => place(fly, lerp(from, to, k)));
        return;
      }
      if (s.kind === 'ask') {
        const target = handle(`ans:${s.by}:${s.at}`);
        target.setAttribute('visibility', 'hidden');
        const hand = need(L.hand, s.by, '손');
        const acc = need(L.accChip, s.at, '받는 쪽 칩 자리');
        const slot = need(L.slot, `${s.by}:${s.at}`, '대답 칸');
        const q = chip(layer(), hand, emptyLook('?'));
        const back = chip(layer(), acc, s.answer === null ? emptyLook('–') : valueLook(next, s.answer.value));
        back.setAttribute('visibility', 'hidden');
        const half = 0.45;
        await tween(ASK_MS, mine, (k) => {
          if (k < half) {
            place(q, lerp(hand, acc, k / half));
          } else {
            q.setAttribute('visibility', 'hidden');
            back.removeAttribute('visibility');
            place(back, lerp(acc, slot, (k - half) / (1 - half)));
          }
        });
        return;
      }
      // adopt
      if (s.source === null) return;
      const hand = need(L.hand, s.by, '손');
      const src = need(L.slot, `${s.by}:${s.source.at}`, '대답 칸');
      const dropAt = need(L.drop, s.by, '버린 자리');
      handle(`hand:${s.by}`).setAttribute('visibility', 'hidden');
      handle(`drop:${s.by}`).setAttribute('visibility', 'hidden');
      const leaving = chip(layer(), hand, valueLook(next, s.own));
      const coming = chip(layer(), src, valueLook(next, s.carries));
      await tween(ADOPT_MS, mine, (k) => {
        place(leaving, lerp(hand, dropAt, k));
        place(coming, lerp(src, hand, k));
      });
    }

    return {
      async render(next: AgreeOnOneValueScene, _prev: AgreeOnOneValueScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || destroyed) return;
        await animate(next, mine);
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
