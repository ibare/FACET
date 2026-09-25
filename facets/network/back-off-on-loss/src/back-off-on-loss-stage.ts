/**
 * back-off-on-loss 무대.
 *
 * 동사는 "꺾인다". 보내는 쪽의 창은 칸이 이어진 막대다. 빈자리 뒤의 조각이 받는 쪽에 닿을
 * 때마다 같은 번호의 확인이 돌아와 보내는 쪽 발치에 쌓인다. 더미가 셋째 중복의 금에 닿는
 * 순간 막대의 오른쪽 절반이 경첩을 축으로 위로 돌아 왼쪽 절반 위로 접히고(창이 반으로 꺾이고),
 * 문턱 눈금이 옮겨 가며, 잃은 조각이 막대에서 다시 길로 나간다. 넷째 · 다섯째 확인은 더미에
 * 얹히기만 한다.
 *
 * 크기는 캔버스 폭에서 역산한다. 세로는 고정이다.
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
import type { BackOffArrival, BackOffScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가장자리 여백 · 구역 사이 틈 */
const MARGIN = 16;
const GAP = 14;
/** 칸 한 변의 상한 */
const CELL_MAX = 30;
/** 길 · 받는 쪽 칸은 창 칸의 이만큼 */
const SIDE_RATIO = 0.85;
/** 줄(창 · 길 · 받는 쪽)의 가운데 높이. 접힘이 위로 돌아 나갈 자리를 남긴다 */
const ROW_Y = 176;
const CELL_H = 26;
const CHIP_H = 22;
/** 확인 더미 */
const PILE_H = 18;
const PILE_STEP = 22;
const PILE_BOTTOM_PAD = 12;
/** 운동 길이 */
const MOVE_MS = 700;
const FOLD_MS = 900;
const FRAME_MS = 16;

type Layout = {
  n: number;
  c: number;
  side: number;
  rodX: number;
  laneL: number;
  laneR: number;
  recvX: number;
  pileW: number;
  pileX: number;
  pileR: number;
  pileBase: number;
};

type Refs = {
  rodCells: SVGGElement[];
  threshold: SVGGElement | null;
  lane: Map<number, SVGGElement>;
  recv: Map<number, SVGGElement>;
  pile: SVGGElement[];
  fx: SVGGElement;
};

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return Object.is(out, -0) ? 0 : out;
}

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
}

/** p 가 [a, b] 안에서 어디쯤인지 (0~1) */
function phase(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return (p - a) / (b - a);
}

function layoutOf(scene: BackOffScene): Layout {
  const W = PIECE_CANVAS_W;
  const n = Math.max(scene.base.cwnd0, scene.cwnd, scene.segments.length, 1);
  const avail = W - 2 * MARGIN - 2 * GAP;
  const c = Math.min(CELL_MAX, avail / (n * (1 + 2 * SIDE_RATIO)));
  const side = c * SIDE_RATIO;
  const rodX = MARGIN;
  const laneL = rodX + n * c + GAP;
  const laneR = laneL + n * side;
  const recvX = laneR + GAP;
  const charW = parseFloat(fontSizes.xs) * 0.62;
  const pileW = (scene.base.ackGlyph.length + 4) * charW + 12;
  const pileR = rodX + n * c - 16;
  return {
    n,
    c,
    side,
    rodX,
    laneL,
    laneR,
    recvX,
    pileW,
    pileX: pileR - pileW,
    pileR,
    pileBase: H - PILE_BOTTOM_PAD,
  };
}

const rodCx = (L: Layout, i: number): number => L.rodX + (i + 0.5) * L.c;
const laneCx = (L: Layout, i: number): number => L.laneL + (i + 0.5) * L.side;
const recvCx = (L: Layout, i: number): number => L.recvX + (i + 0.5) * L.side;
const pileCy = (L: Layout, k: number): number => L.pileBase - PILE_H / 2 - k * PILE_STEP;
const pileCx = (L: Layout): number => L.pileX + L.pileW / 2;
const thX = (L: Layout, th: number): number => L.rodX + th * L.c;

export const backOffOnLossStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

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
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; mono?: boolean; fill?: string; anchor?: string; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.xs,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    /** 가운데 (cx, cy) 에 번호 칩 하나 */
    function chip(
      parent: Element,
      cx: number,
      cy: number,
      w: number,
      h: number,
      text: string,
      fill: string,
      ink: string,
      stroke?: string,
    ): SVGGElement {
      const g = el('g', {}, parent);
      el(
        'rect',
        {
          x: cx - w / 2,
          y: cy - h / 2,
          width: w,
          height: h,
          rx: 3,
          fill,
          stroke: stroke ?? fill,
          'stroke-width': 1,
        },
        g,
      );
      label(g, cx, cy, text, { mono: true, fill: ink, anchor: 'middle' });
      return g;
    }

    function ackText(scene: BackOffScene, ack: number): string {
      return t('label.ack', '{glyph} {ack}', { glyph: scene.base.ackGlyph, ack });
    }

    /** 이번 걸음의 확인 가운데 끝 화면의 더미에 남는 것 */
    function keptAcks(scene: BackOffScene): BackOffArrival[] {
      return scene.step.kind === 'arrive' ? scene.step.arrivals.filter((a) => a.ack === scene.ack) : [];
    }

    function caption(scene: BackOffScene): [string, string] {
      const s = scene.step;
      switch (s.kind) {
        case 'ready':
          return [
            t('caption.ready', 'Nothing sent yet.'),
            '',
          ];
        case 'send':
          return [
            t('caption.send', 'Sent: {from}–{to}. Lost on the way: {lost}.', {
              from: scene.segments[0] ?? '',
              to: scene.segments[scene.segments.length - 1] ?? '',
              lost: s.lost,
            }),
            '',
          ];
        case 'arrive': {
          // 끝 화면의 더미에 남는 확인만 말한다 — 곧 덮인 번호(앞 칸)는 세지 않는다
          const acks = keptAcks(scene)
            .map((a) =>
              a.dup > 0
                ? t('label.dupAck', '{glyph} {ack} (duplicate {dup})', {
                    glyph: scene.base.ackGlyph,
                    ack: a.ack,
                    dup: a.dup,
                  })
                : ackText(scene, a.ack),
            )
            .join(', ');
          const segs = s.arrivals.map((a) => a.segment).join(', ');
          const first = s.resentArrived
            ? t('caption.resentArrive', 'Resent segment arrived: {seg}. Returned: {acks}.', {
                seg: segs,
                acks,
              })
            : t('caption.arrive', 'Arrived: {segs}. Returned: {acks}.', { segs, acks });
          const second =
            s.resent !== null
              ? t('caption.fold', 'Window: {was} → {cwnd} · threshold: {thWas} → {th}. Resent: {lost}.', {
                  was: s.was,
                  cwnd: scene.cwnd,
                  thWas: s.thWas,
                  th: scene.ssthresh,
                  lost: s.resent,
                })
              : t('caption.window', 'Window: {was} → {cwnd}.', { was: s.was, cwnd: scene.cwnd });
          return [first, second];
        }
        case 'round':
          return [
            t('caption.round', 'Next round sent: {from}–{to}. All acknowledged: {acks}.', {
              from: s.segments[0] ?? '',
              to: s.segments[s.segments.length - 1] ?? '',
              acks: ackText(scene, s.ack),
            }),
            t('caption.window', 'Window: {was} → {cwnd}.', { was: s.was, cwnd: scene.cwnd }),
          ];
      }
    }

    function drawStatic(scene: BackOffScene): { L: Layout; refs: Refs } {
      svg.textContent = '';
      const L = layoutOf(scene);
      const root = el('g', {}, svg);

      // 캡션 — 지금 일어나는 일
      const [cap1, cap2] = caption(scene);
      label(root, MARGIN, 20, cap1, { size: fontSizes.sm });
      if (cap2 !== '') label(root, MARGIN, 40, cap2, { size: fontSizes.sm });

      // 머리 이름
      const headY = ROW_Y - CELL_H / 2 - 34;
      label(root, L.rodX, headY, t('label.sender', 'Sender'), {
        size: fontSizes.sm,
        fill: colors.textMuted,
        weight: '600',
      });
      label(root, L.recvX, headY, t('label.receiver', 'Receiver'), {
        size: fontSizes.sm,
        fill: colors.textMuted,
        weight: '600',
      });

      // 창 막대
      const top = ROW_Y - CELL_H / 2;
      label(root, L.rodX, top - 9, t('label.window', 'Window: {n}', { n: scene.cwnd }), {
        size: fontSizes.sm,
        weight: '600',
      });
      const rodLayer = el('g', {}, root);
      const rodCells: SVGGElement[] = [];
      for (let i = 0; i < scene.cwnd; i += 1) {
        const g = el('g', {}, rodLayer);
        el(
          'rect',
          {
            x: L.rodX + i * L.c + 1,
            y: top,
            width: L.c - 2,
            height: CELL_H,
            rx: 2,
            fill: colors.bgSubtle,
            stroke: colors.primary,
            'stroke-width': 1.5,
          },
          g,
        );
        rodCells.push(g);
      }

      // 문턱 눈금
      const threshold = el('g', {}, root);
      const tx = thX(L, scene.ssthresh);
      el(
        'line',
        {
          x1: tx,
          y1: top - 4,
          x2: tx,
          y2: top + CELL_H + 4,
          stroke: colors.text,
          'stroke-width': 2,
          'stroke-dasharray': '3 2',
        },
        threshold,
      );
      label(threshold, tx + 4, top - 9, t('label.threshold', 'Threshold: {n}', { n: scene.ssthresh }), {
        fill: colors.textMuted,
      });

      // 받는 쪽 칸
      const recvLayer = el('g', {}, root);
      const recvW = L.side - 3;
      const got = new Set(scene.received);
      scene.segments.forEach((seg, i) => {
        el(
          'rect',
          {
            x: recvCx(L, i) - recvW / 2,
            y: top,
            width: recvW,
            height: CELL_H,
            rx: 2,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': got.has(seg) ? '' : '3 2',
          },
          recvLayer,
        );
        if (!got.has(seg)) label(recvLayer, recvCx(L, i), ROW_Y, String(seg), { mono: true, fill: colors.textMuted, anchor: 'middle' });
      });
      const recv = new Map<number, SVGGElement>();
      for (const seg of scene.received) {
        const i = scene.segments.indexOf(seg);
        if (i < 0) continue;
        const delivered = scene.ack !== null && seg < scene.ack;
        recv.set(
          seg,
          chip(
            recvLayer,
            recvCx(L, i),
            ROW_Y,
            recvW,
            CELL_H,
            String(seg),
            delivered ? colors.itemSorted : colors.bg,
            delivered ? colors.textInverse : colors.text,
            delivered ? colors.itemSorted : colors.text,
          ),
        );
      }

      // 길 위의 조각
      const laneLayer = el('g', {}, root);
      const chipW = L.side - 3;
      const lane = new Map<number, SVGGElement>();
      const inLane = new Set(scene.lane.map((c) => c.segment));
      if (scene.lost !== null && !inLane.has(scene.lost) && !got.has(scene.lost)) {
        const i = scene.segments.indexOf(scene.lost);
        el(
          'rect',
          {
            x: laneCx(L, i) - chipW / 2,
            y: ROW_Y - CHIP_H / 2,
            width: chipW,
            height: CHIP_H,
            rx: 3,
            fill: 'none',
            stroke: colors.danger,
            'stroke-width': 1,
            'stroke-dasharray': '3 2',
          },
          laneLayer,
        );
      }
      for (const c of scene.lane) {
        const i = scene.segments.indexOf(c.segment);
        const fill = c.resent ? colors.danger : colors.primary;
        lane.set(c.segment, chip(laneLayer, laneCx(L, i), ROW_Y, chipW, CHIP_H, String(c.segment), fill, colors.textInverse));
      }

      // 확인 더미 · 셋째 중복의 금
      const pileLayer = el('g', {}, root);
      const k = scene.base.dupThreshold;
      const lineY = pileCy(L, k) - PILE_H / 2 - 2;
      el(
        'line',
        {
          x1: L.pileX - 4,
          y1: lineY,
          x2: L.pileR + 14,
          y2: lineY,
          stroke: colors.danger,
          'stroke-width': 1,
          'stroke-dasharray': '4 3',
        },
        pileLayer,
      );
      label(pileLayer, L.pileX - 8, lineY, t('label.trigger', 'Resend at duplicate: {k}', { k }), {
        fill: colors.danger,
        anchor: 'end',
      });
      const pile: SVGGElement[] = [];
      if (scene.ack !== null) {
        for (let d = 0; d <= scene.dups; d += 1) {
          const fill = d === 0 ? colors.bgSubtle : d === k ? colors.danger : colors.itemComparing;
          const ink = d === 0 ? colors.text : colors.textInverse;
          const g = chip(pileLayer, pileCx(L), pileCy(L, d), L.pileW, PILE_H, ackText(scene, scene.ack), fill, ink, d === 0 ? colors.border : fill);
          if (d > 0) label(g, L.pileR + 4, pileCy(L, d), String(d), { fill: colors.textMuted });
          pile.push(g);
        }
      }

      const fx = el('g', {}, root);
      return { L, refs: { rodCells, threshold, lane, recv, pile, fx } };
    }

    function move(node: Element, dx: number, dy: number): void {
      node.setAttribute('transform', `translate(${r1(dx)} ${r1(dy)})`);
    }

    function hide(node: Element, hidden: boolean): void {
      if (hidden) node.setAttribute('visibility', 'hidden');
      else node.removeAttribute('visibility');
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
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

    /** 흩어지는 앞 더미 */
    function clearedGhost(scene: BackOffScene, L: Layout, fx: SVGGElement, ack: number, count: number): SVGGElement {
      const g = el('g', {}, fx);
      for (let d = 0; d < count; d += 1) {
        const fill = d === 0 ? colors.bgSubtle : colors.itemComparing;
        chip(g, pileCx(L), pileCy(L, d), L.pileW, PILE_H, ackText(scene, ack), fill, d === 0 ? colors.text : colors.textInverse, d === 0 ? colors.border : fill);
      }
      return g;
    }

    async function animateSend(scene: BackOffScene, L: Layout, refs: Refs, mine: number): Promise<void> {
      if (scene.step.kind !== 'send') return;
      const lost = scene.step.lost;
      const lostIdx = scene.segments.indexOf(lost);
      const chipW = L.side - 3;
      const ghost = chip(refs.fx, 0, ROW_Y, chipW, CHIP_H, String(lost), colors.danger, colors.textInverse);
      await tween(MOVE_MS, mine, (p) => {
        const e = ease(phase(p, 0, 0.6));
        scene.segments.forEach((seg, i) => {
          const node = refs.lane.get(seg);
          if (node) move(node, (rodCx(L, i) - laneCx(L, i)) * (1 - e), 0);
        });
        const x = rodCx(L, lostIdx) + (laneCx(L, lostIdx) - rodCx(L, lostIdx)) * e;
        const drop = ease(phase(p, 0.6, 1));
        move(ghost, x, 40 * drop);
        ghost.setAttribute('opacity', String(r1(1 - drop)));
      });
    }

    async function animateArrive(scene: BackOffScene, L: Layout, refs: Refs, mine: number): Promise<void> {
      const s = scene.step;
      if (s.kind !== 'arrive') return;
      const fold = s.resent !== null;
      const ms = fold ? FOLD_MS : MOVE_MS;
      const segEnd = fold ? 0.35 : 0.45;
      const ackA = fold ? 0.3 : 0.4;
      const ackB = fold ? 0.62 : 1;
      // 확인 칩 — 끝 화면의 더미에 남는 것만 날아온다. 더미 칸은 그 확인의 중복 차례다.
      const flights = keptAcks(scene).flatMap((a) => {
        const node = refs.pile[a.dup];
        return node ? [{ node, i: scene.segments.indexOf(a.segment), d: a.dup }] : [];
      });
      const count = Math.max(flights.length, 1);
      const ghost = s.cleared ? clearedGhost(scene, L, refs.fx, s.cleared.ack, s.cleared.count) : null;

      // 접힘 — 사라지는 칸의 허깨비가 경첩을 축으로 돈다
      const foldGhost = el('g', {}, refs.fx);
      if (fold) {
        const top = ROW_Y - CELL_H / 2;
        for (let i = scene.cwnd; i < s.was; i += 1) {
          el(
            'rect',
            {
              x: L.rodX + i * L.c + 1,
              y: top,
              width: L.c - 2,
              height: CELL_H,
              rx: 2,
              fill: colors.bgSubtle,
              stroke: colors.primary,
              'stroke-width': 1.5,
            },
            foldGhost,
          );
        }
      }
      const hingeX = L.rodX + scene.cwnd * L.c;
      const resentNode = s.resent !== null ? refs.lane.get(s.resent) : undefined;
      const resentIdx = s.resent !== null ? scene.segments.indexOf(s.resent) : -1;

      await tween(ms, mine, (p) => {
        const segE = ease(phase(p, 0, segEnd));
        for (const a of s.arrivals) {
          const node = refs.recv.get(a.segment);
          const i = scene.segments.indexOf(a.segment);
          if (node) move(node, (laneCx(L, i) - recvCx(L, i)) * (1 - segE), 0);
        }
        const span = (ackB - ackA) / count;
        flights.forEach((f, j) => {
          const a0 = ackA + j * span * 0.6;
          const q = phase(p, a0, a0 + span * 1.4);
          const e = ease(q);
          hide(f.node, q <= 0);
          move(f.node, (recvCx(L, f.i) - pileCx(L)) * (1 - e), (ROW_Y - pileCy(L, f.d)) * (1 - e));
        });
        if (ghost) {
          const g = ease(phase(p, ackA, ackA + (ackB - ackA) * 0.7));
          move(ghost, 0, 16 * g);
          ghost.setAttribute('opacity', String(r1(1 - g)));
        }
        if (fold) {
          const fe = ease(phase(p, 0.62, 0.92));
          foldGhost.setAttribute('transform', `rotate(${r1(-180 * fe)} ${r1(hingeX)} ${r1(ROW_Y)})`);
          foldGhost.setAttribute('opacity', String(r1(1 - phase(p, 0.88, 1))));
          if (refs.threshold) move(refs.threshold, (thX(L, s.thWas) - thX(L, scene.ssthresh)) * (1 - fe), 0);
          if (resentNode) {
            const re = ease(phase(p, 0.75, 1));
            hide(resentNode, p < 0.75);
            move(resentNode, (rodCx(L, 0) - laneCx(L, resentIdx)) * (1 - re), 0);
          }
        }
      });
    }

    async function animateRound(scene: BackOffScene, L: Layout, refs: Refs, mine: number): Promise<void> {
      const s = scene.step;
      if (s.kind !== 'round') return;
      const chipW = L.side - 3;
      const k = s.segments.length;
      const outgoing = s.segments.map((seg) => chip(refs.fx, 0, ROW_Y, chipW, CHIP_H, String(seg), colors.primary, colors.textInverse));
      const ghost = s.cleared ? clearedGhost(scene, L, refs.fx, s.cleared.ack, s.cleared.count) : null;
      const back = refs.pile[0];
      const grown = refs.rodCells.slice(s.was);
      await tween(MOVE_MS, mine, (p) => {
        const e = ease(phase(p, 0, 0.45));
        outgoing.forEach((node, i) => {
          const to = L.laneR + (i - k + 0.5) * L.side;
          move(node, rodCx(L, i) + (to - rodCx(L, i)) * e, 0);
          node.setAttribute('opacity', String(r1(1 - phase(p, 0.35, 0.45))));
        });
        if (back) {
          const q = phase(p, 0.4, 0.75);
          const be = ease(q);
          hide(back, q <= 0);
          move(back, (L.recvX - pileCx(L)) * (1 - be), (ROW_Y - pileCy(L, 0)) * (1 - be));
        }
        if (ghost) {
          const g = ease(phase(p, 0.4, 0.65));
          move(ghost, 0, 16 * g);
          ghost.setAttribute('opacity', String(r1(1 - g)));
        }
        const ge = ease(phase(p, 0.7, 1));
        grown.forEach((node, j) => {
          const x0 = L.rodX + (s.was + j) * L.c;
          node.setAttribute('transform', `translate(${r1(x0)} 0) scale(${r1(Math.max(ge, 0.01) * 100) / 100} 1) translate(${r1(-x0)} 0)`);
        });
      });
    }

    return {
      render(next: BackOffScene, _prev: BackOffScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const { L, refs } = drawStatic(next);
        if (!opts.animate) return;
        const kind = next.step.kind;
        const run =
          kind === 'send'
            ? animateSend(next, L, refs, mine)
            : kind === 'arrive'
              ? animateArrive(next, L, refs, mine)
              : kind === 'round'
                ? animateRound(next, L, refs, mine)
                : Promise.resolve();
        return run.then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
        });
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
