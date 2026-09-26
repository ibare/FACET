/**
 * propose-and-promise 무대 — 약속이 앞을 막는다.
 *
 * 수락자를 가운데 한 줄로 세우고, 제안자를 양쪽에 둔다 (제안자는 메시지가 닿는 수락자들의
 * 높이 가운데에 선다). 움직이는 것은 번호표와 (번호, 값) 이다.
 *
 * - prepare 가 닿으면 제안자의 번호표가 날아가 수락자의 약속 칸에 **박힌다**. 앞 약속이 있으면
 *   그 번호표는 밀려 떨어진다
 * - accept 가 받아들여지면 (번호, 값) 이 받아들인 칸으로 들어간다
 * - 거절되면 (번호, 값) 이 수락자의 모서리에 부딪혀 **튕겨 나오고**, 튕긴 자리에 남는다
 *
 * 정적 그리기가 정본이다. 운동은 이미 끝 자리에 선 요소를 "아직 못 온 만큼" 밀어 두고 당긴다.
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
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { Bounce, ProposeScene, ProposerView, AcceptorView } from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const FLY_MS = 560;
const HIT_MS = 380;

const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);
/** 고정폭 글자 한 칸의 폭 비율 */
const MONO_RATIO = 0.62;

type Pt = { x: number; y: number };
type Side = 'left' | 'right';

type AcceptorBox = { x: number; y: number; w: number; h: number; promise: Pt; accepted: Pt };
type ProposerBox = { x: number; y: number; w: number; h: number; side: Side; ticket: Pt; color: string };

type Layout = {
  acceptors: Map<string, AcceptorBox>;
  proposers: Map<string, ProposerBox>;
  rowsBottom: number;
  columnX: number;
};

type Refs = {
  promise: Map<string, SVGGElement>;
  accepted: Map<string, SVGGElement>;
  bounce: SVGGElement | null;
  wall: SVGElement | null;
  pip: SVGElement | null;
  overlay: SVGGElement;
};

function r1(x: number): number {
  const v = Math.round(x * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
}

function monoWidth(text: string, px: number): number {
  return text.length * px * MONO_RATIO;
}

function pairText(n: number, v: number | null): string {
  return v === null ? String(n) : `(${n}, ${v})`;
}

function layout(scene: ProposeScene): Layout {
  const k = scene.acceptors.length;
  const top = 34;
  const bottom = H - 86;
  const gap = 14;
  const boxH = Math.min(66, (bottom - top - gap * (k - 1)) / Math.max(1, k));
  const aw = Math.min(168, W * 0.28);
  const ax = (W - aw) / 2;
  const acceptors = new Map<string, AcceptorBox>();
  scene.acceptors.forEach((a, i) => {
    const y = top + i * (boxH + gap);
    acceptors.set(a.id, {
      x: ax,
      y,
      w: aw,
      h: boxH,
      promise: { x: ax + aw * 0.42, y: y + boxH * 0.6 },
      accepted: { x: ax + aw * 0.78, y: y + boxH * 0.6 },
    });
  });
  const rowsBottom = top + k * boxH + (k - 1) * gap;

  const pw = Math.min(128, W * 0.21);
  const ph = 124;
  const colors = categorical(Math.max(1, scene.proposers.length));
  const proposers = new Map<string, ProposerBox>();
  scene.proposers.forEach((p, i) => {
    const side: Side = i % 2 === 0 ? 'left' : 'right';
    const rows = (p.contacts.length > 0 ? p.contacts : scene.acceptors.map((a) => a.id)).map((id) => {
      const b = acceptors.get(id);
      if (b === undefined) throw new Error(`propose-and-promise: 모르는 수락자 ${id}`);
      return b.y + b.h / 2;
    });
    const mid = rows.reduce((s, y) => s + y, 0) / rows.length;
    const y = Math.max(top, Math.min(rowsBottom - ph, mid - ph / 2));
    const x = side === 'left' ? PAD : W - PAD - pw;
    const color = colors[i % colors.length];
    if (color === undefined) throw new Error('propose-and-promise: 제안자 색을 셈할 수 없다');
    proposers.set(p.id, { x, y, w: pw, h: ph, side, ticket: { x: x + 32, y: y + 42 }, color });
  });
  return { acceptors, proposers, rowsBottom, columnX: W / 2 };
}

function colorOfNumber(scene: ProposeScene, lay: Layout, n: number, fallback: string): string {
  const p = scene.proposers.find((x) => x.n === n);
  if (p === undefined) return fallback;
  return lay.proposers.get(p.id)?.color ?? fallback;
}

export const proposeAndPromiseStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

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
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      content: string,
      o: { size: number; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono === true ? fonts.mono : fonts.body,
          'font-size': o.size,
          fill: o.fill,
          'text-anchor': o.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (o.weight !== undefined) node.setAttribute('font-weight', o.weight);
      node.textContent = content;
      return node;
    }

    /** 번호표 — 번호 하나. 왼쪽에 구멍이 뚫린 표 모양 */
    function ticket(parent: Element, c: Pt, n: number, stroke: string, width = 1.5): SVGGElement {
      const g = el('g', {}, parent);
      const label = String(n);
      const w = Math.max(40, monoWidth(label, MD) + 24);
      const h = 24;
      el('rect', { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h, rx: 3, fill: colors.bgSubtle, stroke, 'stroke-width': width }, g);
      el('circle', { cx: c.x - w / 2 + 7, cy: c.y, r: 2.6, fill: colors.bg, stroke, 'stroke-width': 1 }, g);
      text(g, c.x + 3, c.y + 0.5, label, { size: MD, fill: colors.text, anchor: 'middle', mono: true, weight: '600' });
      return g;
    }

    /** (번호, 값) 한 쌍 — 둥근 알약 */
    function pill(
      parent: Element,
      c: Pt,
      label: string,
      stroke: string,
      o: { width?: number; dash?: boolean; fill?: string; ink?: string } = {},
    ): SVGGElement {
      const g = el('g', {}, parent);
      const w = Math.max(48, monoWidth(label, SM) + 18);
      const h = 24;
      const rect = el(
        'rect',
        { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h, rx: h / 2, fill: o.fill ?? colors.bgSubtle, stroke, 'stroke-width': o.width ?? 1.5 },
        g,
      );
      if (o.dash === true) rect.setAttribute('stroke-dasharray', '3 3');
      text(g, c.x, c.y + 0.5, label, { size: SM, fill: o.ink ?? colors.text, anchor: 'middle', mono: true });
      return g;
    }

    function emptySlot(parent: Element, c: Pt): void {
      el('rect', { x: c.x - 22, y: c.y - 12, width: 44, height: 24, rx: 3, fill: 'none', stroke: colors.border, 'stroke-dasharray': '2 3' }, parent);
      text(parent, c.x, c.y + 0.5, t('label.none', '—'), { size: SM, fill: colors.textMuted, anchor: 'middle' });
    }

    function restOf(scene: ProposeScene, lay: Layout, b: Bounce, index: number): Pt {
      const box = lay.acceptors.get(b.acceptor);
      const pb = lay.proposers.get(b.proposer);
      if (box === undefined || pb === undefined) throw new Error('propose-and-promise: 튕긴 메시지의 자리를 셈할 수 없다');
      const same = scene.bounces.slice(0, index).filter((x) => x.acceptor === b.acceptor && x.proposer === b.proposer).length;
      const x = pb.side === 'left' ? (pb.x + pb.w + box.x) / 2 : (box.x + box.w + pb.x) / 2;
      return { x, y: box.y + box.h / 2 - 4 + same * 10 };
    }

    function drawProposer(g: Element, p: ProposerView, pb: ProposerBox, scene: ProposeScene, refs: Refs): void {
      const step = scene.step;
      const active =
        (step.kind === 'promise' || step.kind === 'accepted' || step.kind === 'accept-refused' || step.kind === 'prepare-refused') &&
        step.proposer === p.id;
      el('rect', { x: pb.x, y: pb.y, width: pb.w, height: pb.h, rx: 8, fill: colors.bg, stroke: active ? pb.color : colors.border, 'stroke-width': active ? 2 : 1 }, g);
      text(g, pb.x + 10, pb.y + 16, p.id, { size: MD, fill: colors.text, weight: '700', mono: true });
      text(g, pb.x + pb.w - 10, pb.y + 16, t('label.proposer', 'Proposer'), { size: XS, fill: colors.textMuted, anchor: 'end' });
      ticket(g, pb.ticket, p.n, pb.color);
      text(g, pb.ticket.x + 30, pb.ticket.y + 0.5, t('label.value', 'Value {v}', { v: p.v }), { size: SM, fill: colors.text });

      const total = scene.acceptors.length;
      const rowsDef: { key: 'promises' | 'accepts'; y: number; label: string; count: number }[] = [
        { key: 'promises', y: pb.y + 72, label: t('label.promises', 'Promises'), count: p.promises },
        { key: 'accepts', y: pb.y + 92, label: t('label.accepts', 'Accepts'), count: p.accepts },
      ];
      const pipX0 = pb.x + 62;
      const pipGap = Math.min(14, (pb.w - 72) / Math.max(1, total));
      for (const row of rowsDef) {
        text(g, pb.x + 10, row.y, row.label, { size: XS, fill: colors.textMuted });
        for (let i = 0; i < total; i += 1) {
          const filled = i < row.count;
          const dot = el(
            'circle',
            { cx: pipX0 + i * pipGap, cy: row.y, r: 4.5, fill: filled ? pb.color : 'none', stroke: filled ? pb.color : colors.border, 'stroke-width': 1.2 },
            g,
          );
          const fresh =
            (row.key === 'promises' && step.kind === 'promise' && step.proposer === p.id) ||
            (row.key === 'accepts' && step.kind === 'accepted' && step.proposer === p.id);
          if (fresh && i === row.count - 1) refs.pip = dot;
        }
        // 과반의 문턱
        const tx = pipX0 + (scene.majority - 0.5) * pipGap;
        el('line', { x1: tx, y1: row.y - 8, x2: tx, y2: row.y + 8, stroke: colors.textMuted, 'stroke-width': 1 }, g);
      }
      if (p.send !== null) {
        const label =
          p.inherited === null
            ? t('label.send', 'Sends {v}', { v: p.send })
            : t('label.sendCarried', 'Sends {v} (from number {m})', { v: p.send, m: p.inherited.n });
        text(g, pb.x + 10, pb.y + 112, label, { size: SM, fill: pb.color, weight: '600' });
      }
    }

    function drawAcceptor(g: Element, a: AcceptorView, box: AcceptorBox, scene: ProposeScene, lay: Layout, refs: Refs): void {
      const step = scene.step;
      const here =
        (step.kind === 'promise' || step.kind === 'accepted' || step.kind === 'accept-refused' || step.kind === 'prepare-refused') &&
        step.acceptor === a.id;
      const refused = here && (step.kind === 'accept-refused' || step.kind === 'prepare-refused');
      const pb =
        here && (step.kind === 'promise' || step.kind === 'accepted' || step.kind === 'accept-refused' || step.kind === 'prepare-refused')
          ? lay.proposers.get(step.proposer)
          : undefined;
      el(
        'rect',
        { x: box.x, y: box.y, width: box.w, height: box.h, rx: 8, fill: colors.bg, stroke: here && pb !== undefined && !refused ? pb.color : colors.border, 'stroke-width': here && !refused ? 2 : 1 },
        g,
      );
      text(g, box.x + 12, box.y + box.h / 2, a.id, { size: MD, fill: colors.text, weight: '700', mono: true });
      text(g, box.promise.x, box.y + 12, t('label.promised', 'Promised'), { size: XS, fill: colors.textMuted, anchor: 'middle' });
      text(g, box.accepted.x, box.y + 12, t('label.accepted', 'Accepted'), { size: XS, fill: colors.textMuted, anchor: 'middle' });

      if (a.promised === 0) {
        emptySlot(g, box.promise);
      } else {
        const stroke = refused ? colors.danger : colorOfNumber(scene, lay, a.promised, colors.text);
        refs.promise.set(a.id, ticket(g, box.promise, a.promised, stroke, refused ? 2.5 : 1.5));
      }
      if (a.accepted === null) {
        emptySlot(g, box.accepted);
      } else {
        const acc = a.accepted;
        const isChosen = scene.chosen !== null && scene.chosen.n === acc.n && scene.chosen.v === acc.v;
        const isStray = step.kind === 'done' && step.stray.some((s) => s.acceptor === a.id);
        const stroke = isStray ? colors.textMuted : colorOfNumber(scene, lay, acc.n, colors.text);
        const look = isChosen ? { width: 2, fill: colors.accent, ink: colors.stateInk } : { dash: isStray };
        refs.accepted.set(a.id, pill(g, box.accepted, pairText(acc.n, acc.v), stroke, look));
      }

      if (refused && pb !== undefined) {
        const ex = pb.side === 'left' ? box.x : box.x + box.w;
        refs.wall = el('line', { x1: ex, y1: box.y + 8, x2: ex, y2: box.y + box.h - 8, stroke: colors.danger, 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
      }
    }

    function drawStatic(scene: ProposeScene): { lay: Layout; refs: Refs } {
      svg.textContent = '';
      const lay = layout(scene);
      const root = el('g', {}, svg);
      const refs: Refs = { promise: new Map(), accepted: new Map(), bounce: null, wall: null, pip: null, overlay: el('g', {}, svg) };

      text(root, lay.columnX, 16, t('label.acceptors', 'Acceptors'), { size: XS, fill: colors.textMuted, anchor: 'middle' });

      for (const a of scene.acceptors) {
        const box = lay.acceptors.get(a.id);
        if (box === undefined) throw new Error(`propose-and-promise: 모르는 수락자 ${a.id}`);
        drawAcceptor(root, a, box, scene, lay, refs);
      }
      for (const p of scene.proposers) {
        const pb = lay.proposers.get(p.id);
        if (pb === undefined) throw new Error(`propose-and-promise: 모르는 제안자 ${p.id}`);
        drawProposer(root, p, pb, scene, refs);
      }

      scene.bounces.forEach((b, i) => {
        const at = restOf(scene, lay, b, i);
        const g = el('g', {}, root);
        const label = pairText(b.n, b.v);
        const node = b.kind === 'accept' ? pill(g, at, label, colors.danger) : ticket(g, at, b.n, colors.danger);
        const w = Math.max(48, monoWidth(label, SM) + 18);
        el('line', { x1: at.x - w / 2 + 6, y1: at.y, x2: at.x + w / 2 - 6, y2: at.y, stroke: colors.danger, 'stroke-width': 1.5 }, node);
        text(g, at.x, at.y + 20, t('label.refused', 'Refused'), { size: XS, fill: colors.danger, anchor: 'middle' });
        if (i === scene.bounces.length - 1 && (scene.step.kind === 'accept-refused' || scene.step.kind === 'prepare-refused')) {
          refs.bounce = g;
        }
      });

      if (scene.chosen !== null) {
        const banner = t('label.chosen', 'Chosen value: {v}', { v: scene.chosen.v });
        const by = lay.rowsBottom + 22;
        text(root, lay.columnX, by, banner, { size: MD, fill: colors.text, anchor: 'middle', weight: '700' });
        el('line', { x1: lay.columnX - 44, y1: by + 11, x2: lay.columnX + 44, y2: by + 11, stroke: colors.accent, 'stroke-width': 3, 'stroke-linecap': 'round' }, root);
      }

      const [line1, line2] = captions(scene);
      text(root, W / 2, H - 38, line1, { size: SM, fill: colors.text, anchor: 'middle', weight: '600' });
      if (line2 !== '') text(root, W / 2, H - 17, line2, { size: SM, fill: colors.textMuted, anchor: 'middle' });
      return { lay, refs };
    }

    function proposerOf(scene: ProposeScene, id: string): ProposerView {
      const p = scene.proposers.find((x) => x.id === id);
      if (p === undefined) throw new Error(`propose-and-promise: 모르는 제안자 ${id}`);
      return p;
    }

    function captions(scene: ProposeScene): [string, string] {
      const s = scene.step;
      const total = scene.acceptors.length;
      switch (s.kind) {
        case 'start':
          return [t('caption.start', 'No acceptor has promised anything yet.'), ''];
        case 'promise': {
          const line1 =
            s.was === 0
              ? t('caption.promise', '{a} promises number {n} to {p}.', { a: s.acceptor, n: s.n, p: s.proposer })
              : t('caption.promiseUp', '{a} raises its promise: number {was} → number {n} ({p}).', {
                  a: s.acceptor,
                  was: s.was,
                  n: s.n,
                  p: s.proposer,
                });
          let line2: string;
          if (!s.majority || s.send === null) {
            line2 = t('caption.promises', 'Promises for {p}: {k} / {total}', { p: s.proposer, k: s.promises, total });
          } else if (s.inherited === null) {
            line2 = t('caption.sendOwn', 'Promises for {p}: {k} / {total}, a majority. Value to send: {v}, its own.', {
              p: s.proposer,
              k: s.promises,
              total,
              v: s.send,
            });
          } else {
            line2 = t('caption.sendCarried', 'Promises for {p}: {k} / {total}, a majority. Value to send: {v}, from number {m}.', {
              p: s.proposer,
              k: s.promises,
              total,
              v: s.send,
              m: s.inherited.n,
            });
          }
          return [line1, line2];
        }
        case 'prepare-refused':
          return [
            t('caption.prepareRefused', '{a} refuses number {n}: it already promised number {m}.', { a: s.acceptor, n: s.n, m: s.promised }),
            t('caption.promises', 'Promises for {p}: {k} / {total}', { p: s.proposer, k: proposerOf(scene, s.proposer).promises, total }),
          ];
        case 'accepted':
          return [
            t('caption.accepted', '{a} accepts {pair}.', { a: s.acceptor, pair: pairText(s.n, s.v) }),
            s.chosen === null
              ? t('caption.accepts', 'Accepts for {p}: {k} / {total}', { p: s.proposer, k: s.accepts, total })
              : t('caption.chosen', 'Accepts for {p}: {k} / {total}, a majority. Chosen value: {v}.', {
                  p: s.proposer,
                  k: s.accepts,
                  total,
                  v: s.chosen.v,
                }),
          ];
        case 'accept-refused':
          return [
            t('caption.acceptRefused', '{a} refuses {pair}: it already promised number {m}.', {
              a: s.acceptor,
              pair: pairText(s.n, s.v),
              m: s.promised,
            }),
            t('caption.accepts', 'Accepts for {p}: {k} / {total}', { p: s.proposer, k: proposerOf(scene, s.proposer).accepts, total }),
          ];
        case 'done': {
          const line1 =
            s.chosen === null
              ? t('caption.doneNone', 'No value was chosen.')
              : t('caption.done', 'Chosen {pair}: accepted by {k} / {total}.', {
                  pair: pairText(s.chosen.n, s.chosen.v),
                  k: s.chosenCount,
                  total,
                });
          const first = s.stray[0];
          const line2 =
            first === undefined
              ? ''
              : t('caption.stray', '{pair} left on {a}: accepted by {k} / {total}. Majority: {m}.', {
                  pair: pairText(first.n, first.v),
                  a: first.acceptor,
                  k: first.count,
                  total,
                  m: scene.majority,
                });
          return [line1, line2];
        }
      }
    }

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    function ease(p: number): number {
      return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    }

    function tween(ms: number, mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const t0 = now();
        let over = false;
        const finish = (): void => {
          if (over) return;
          over = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (now() - t0) / ms);
          frame(ease(p));
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

    function shift(node: Element, dx: number, dy: number): void {
      const x = r1(dx);
      const y = r1(dy);
      if (x === 0 && y === 0) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${x} ${y})`);
    }

    /** 운동 중에만 따라다니는 메시지 이름 */
    function carrier(refs: Refs, name: string, color: string): SVGTextElement {
      return text(refs.overlay, 0, 0, name, { size: XS, fill: color, anchor: 'middle', mono: true });
    }

    async function animate(next: ProposeScene, lay: Layout, refs: Refs, mine: number): Promise<void> {
      const s = next.step;
      if (s.kind === 'start' || s.kind === 'done') return;
      const pb = lay.proposers.get(s.proposer);
      const box = lay.acceptors.get(s.acceptor);
      if (pb === undefined || box === undefined) throw new Error('propose-and-promise: 걸음의 자리를 셈할 수 없다');
      const from = pb.ticket;
      const pip = refs.pip;
      if (pip !== null) pip.setAttribute('visibility', 'hidden');

      if (s.kind === 'promise' || s.kind === 'accepted') {
        const node = s.kind === 'promise' ? refs.promise.get(s.acceptor) : refs.accepted.get(s.acceptor);
        const to = s.kind === 'promise' ? box.promise : box.accepted;
        if (node === undefined) throw new Error('propose-and-promise: 들어갈 칸이 없다');
        const tag = carrier(refs, s.kind === 'promise' ? 'prepare' : 'accept', pb.color);
        // 밀려 떨어질 앞 번호표
        let old: SVGGElement | null = null;
        if (s.kind === 'promise' && s.was > 0) {
          old = ticket(refs.overlay, box.promise, s.was, colorOfNumber(next, lay, s.was, colors.text));
        }
        const dx = from.x - to.x;
        const dy = from.y - to.y;
        await tween(FLY_MS, mine, (e) => {
          shift(node, dx * (1 - e), dy * (1 - e));
          tag.setAttribute('x', String(r1(to.x + dx * (1 - e))));
          tag.setAttribute('y', String(r1(to.y + dy * (1 - e) - 18)));
          if (old !== null) {
            // 새 번호표가 닿는 끝자락에 앞 번호표가 아래로 밀려난다
            const k = Math.max(0, (e - 0.7) / 0.3);
            shift(old, 0, k * 26);
            old.setAttribute('opacity', String(r1(1 - k)));
          }
        });
        return;
      }

      // 거절 — 모서리까지 가서 부딪히고 튕긴 자리로 돌아온다
      const bounce = refs.bounce;
      if (bounce === null) throw new Error('propose-and-promise: 튕긴 메시지가 없다');
      const index = next.bounces.length - 1;
      const last = next.bounces[index];
      if (last === undefined) throw new Error('propose-and-promise: 튕긴 메시지가 없다');
      const rest = restOf(next, lay, last, index);
      const label = pairText(s.n, s.kind === 'accept-refused' ? s.v : null);
      const half = Math.max(48, monoWidth(label, SM) + 18) / 2;
      const hit: Pt = { x: pb.side === 'left' ? box.x - half : box.x + box.w + half, y: box.promise.y };
      const wall = refs.wall;
      if (wall !== null) wall.setAttribute('visibility', 'hidden');
      const tag = carrier(refs, 'accept', pb.color);
      if (s.kind === 'prepare-refused') tag.textContent = 'prepare';
      await tween(HIT_MS, mine, (e) => {
        const x = from.x + (hit.x - from.x) * e;
        const y = from.y + (hit.y - from.y) * e;
        shift(bounce, x - rest.x, y - rest.y);
        tag.setAttribute('x', String(r1(x)));
        tag.setAttribute('y', String(r1(y - 18)));
      });
      if (destroyed || mine !== gen) return;
      if (wall !== null) wall.removeAttribute('visibility');
      tag.remove();
      await tween(HIT_MS, mine, (e) => {
        shift(bounce, (hit.x - rest.x) * (1 - e), (hit.y - rest.y) * (1 - e));
      });
    }

    async function render(next: ProposeScene, prev: ProposeScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const { lay, refs } = drawStatic(next);
      if (!opts.animate || prev === null || prev === next) return;
      await animate(next, lay, refs, mine);
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
