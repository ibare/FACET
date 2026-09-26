import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ReadYourWriteScene, RywStep } from './scene.js';

/**
 * 자기 쓰기 읽기 — 위에 사본 셋, 아래에 클라이언트 둘.
 * 움직이는 것은 **읽기**다: 번호를 적은 표가 사본 문에 닿고, 번호에 못 미친 사본에서 튕겨
 * 다음 사본 앞으로 옮겨 간다. 받아 준 사본에서는 값이 클라이언트 손으로 내려온다.
 */

const H = 384;
const W = PIECE_CANVAS_W;
const NS = 'http://www.w3.org/2000/svg';

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);

const MARGIN = 16;
const GAP = Math.min(28, W * 0.04);
const CARD_TOP = 34;
const CARD_H = 92;
const TALLY_Y = CARD_TOP + CARD_H + 18;
const LANE_Y = 196;
const CLIENT_Y = 266;
const CHIP_Y = 322;
const CAPTION_Y = H - 14;
const TICKET_W = Math.min(64, W * 0.11);
const TICKET_H = 26;
const CHIP_W = 50;
const CHIP_H = 26;

const MOTION_WRITE = 600;
const MOTION_REFUSE = 600;
const MOTION_SERVE = 600;
const MOTION_APPLY = 500;

type Pt = { x: number; y: number };

type Handles = {
  value: Map<string, SVGTextElement>;
  version: Map<string, SVGTextElement>;
  token: Map<string, SVGTextElement>;
  chips: Map<string, SVGGElement[]>;
  ticket: SVGGElement | null;
  marks: SVGGElement[];
  motion: SVGGElement;
};

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function lerp(a: Pt, b: Pt, u: number): Pt {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, text: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = text;
  return node;
}

function place(g: SVGGElement, p: Pt, scale = 1): void {
  g.setAttribute('transform', `translate(${round(p.x)} ${round(p.y)})${scale === 1 ? '' : ` scale(${round(scale)})`}`);
}

export const readYourWriteStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const cardW = (W - 2 * MARGIN - 2 * GAP) / 3;

    const replicaIndex = (scene: ReadYourWriteScene, id: string): number => {
      const i = scene.replicas.findIndex((r) => r.id === id);
      if (i < 0) throw new Error(`read-your-write 무대: 사본 ${id} 가 장면에 없다`);
      return i;
    };
    const cardLeft = (i: number): number => MARGIN + i * (cardW + GAP);
    const cardCenter = (scene: ReadYourWriteScene, id: string): number => cardLeft(replicaIndex(scene, id)) + cardW / 2;
    const doorOf = (scene: ReadYourWriteScene, id: string): Pt => ({ x: cardCenter(scene, id), y: CARD_TOP + CARD_H + TICKET_H / 2 + 2 });
    const laneOf = (scene: ReadYourWriteScene, id: string): Pt => ({ x: cardCenter(scene, id), y: LANE_Y });
    const clientX = (scene: ReadYourWriteScene, id: string): number => {
      const i = scene.clients.findIndex((c) => c.id === id);
      if (i < 0) throw new Error(`read-your-write 무대: 클라이언트 ${id} 가 장면에 없다`);
      const n = scene.clients.length;
      return W * ((i + 0.5) / n) - W * 0.08;
    };
    const handOf = (scene: ReadYourWriteScene, id: string): Pt => ({ x: clientX(scene, id), y: CLIENT_Y - 42 });
    const badgeOf = (scene: ReadYourWriteScene, id: string): Pt => ({ x: clientX(scene, id) + 26 + 40, y: CLIENT_Y + 12 });
    const chipOf = (scene: ReadYourWriteScene, id: string, k: number): Pt => ({
      x: clientX(scene, id) - 18 + CHIP_W / 2 + k * (CHIP_W + 8),
      y: CHIP_Y + CHIP_H / 2,
    });

    const clientName = (id: string): string => {
      switch (id) {
        case 'A':
          return t('label.clientA', 'Client A');
        case 'B':
          return t('label.clientB', 'Client B');
        default:
          throw new Error(`read-your-write 무대: 클라이언트 ${id} 의 표시 이름이 없다`);
      }
    };

    function ticketShape(parent: Element, client: string, token: number): SVGGElement {
      const g = el('g', {}, parent);
      el('rect', {
        x: -TICKET_W / 2,
        y: -TICKET_H / 2,
        width: TICKET_W,
        height: TICKET_H,
        rx: 6,
        fill: colors.accent,
        stroke: colors.stateInk,
        'stroke-width': 1,
      }, g);
      label(g, 0, SM * 0.36, `${client} · ${token}`, {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: colors.stateInk,
      });
      return g;
    }

    function chipShape(parent: Element, value: number, replica: string, fresh: boolean): SVGGElement {
      const g = el('g', {}, parent);
      el('rect', {
        x: -CHIP_W / 2,
        y: -CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        rx: 4,
        fill: fresh ? colors.accent : colors.bgSubtle,
        stroke: fresh ? colors.stateInk : colors.border,
        'stroke-width': 1,
      }, g);
      label(g, -CHIP_W / 2 + 10, SM * 0.4, String(value), {
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: fresh ? colors.stateInk : colors.text,
      });
      label(g, CHIP_W / 2 - 6, XS * 0.36, replica, {
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: fresh ? colors.stateInk : colors.textMuted,
      });
      return g;
    }

    function stepCard(step: RywStep): { id: string; tone: 'refuse' | 'serve' | 'change' } | null {
      switch (step.kind) {
        case 'start':
          return null;
        case 'write':
          return { id: step.replica, tone: 'change' };
        case 'apply':
          return { id: step.replica, tone: 'change' };
        case 'refuse':
          return { id: step.replica, tone: 'refuse' };
        case 'serve':
          return { id: step.replica, tone: 'serve' };
      }
    }

    function drawStatic(scene: ReadYourWriteScene): Handles {
      svg.textContent = '';
      const handles: Handles = {
        value: new Map(),
        version: new Map(),
        token: new Map(),
        chips: new Map(),
        ticket: null,
        marks: [],
        motion: el('g', {}, svg),
      };
      const step = scene.step;
      const lit = stepCard(step);

      // 머리 줄 — 지금 틱과 돌려보낸 수
      if (scene.tick !== null) {
        label(svg, MARGIN, 20, t('label.tick', 'Tick {tick}', { tick: scene.tick }), {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.text,
        });
      }
      label(svg, W - MARGIN, 20, t('label.refusals', 'Turned away: {n}', { n: scene.refusals.length }), {
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: scene.refusals.length > 0 ? colors.danger : colors.textMuted,
      });

      // 사본 카드
      scene.replicas.forEach((r, i) => {
        const x = cardLeft(i);
        const isLit = lit !== null && lit.id === r.id;
        const stroke = !isLit ? colors.border : lit.tone === 'refuse' ? colors.danger : colors.text;
        el('rect', {
          x,
          y: CARD_TOP,
          width: cardW,
          height: CARD_H,
          rx: 8,
          fill: colors.bgSubtle,
          stroke,
          'stroke-width': isLit ? 2.5 : 1,
        }, svg);
        label(svg, x + 12, CARD_TOP + 20, r.id, {
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: colors.text,
        });
        label(svg, x + cardW - 10, CARD_TOP + 19, r.id === scene.leader ? t('label.leader', 'leader') : t('label.follower', 'follower'), {
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        handles.value.set(
          r.id,
          label(svg, x + cardW / 2, CARD_TOP + 55, `${scene.key} = ${r.value}`, {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xl,
            'font-weight': 700,
            fill: colors.text,
          }),
        );
        handles.version.set(
          r.id,
          label(svg, x + cardW / 2, CARD_TOP + 79, t('label.number', 'number {n}', { n: r.version }), {
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': isLit && lit.tone !== 'change' ? 700 : 400,
            fill: isLit && lit.tone === 'refuse' ? colors.danger : colors.text,
          }),
        );
        // 견줌 — 이 사본의 번호와 읽기가 든 번호
        if (isLit && (step.kind === 'refuse' || step.kind === 'serve')) {
          const cmp = step.kind === 'refuse' ? `${step.replicaVersion} < ${step.token}` : `${step.replicaVersion} ≥ ${step.token}`;
          label(svg, x + cardW - 10, CARD_TOP + 79, cmp, {
            'text-anchor': 'end',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: step.kind === 'refuse' ? colors.danger : colors.text,
          });
        }
      });

      // 돌려보낸 자국 — 사본 아래에 쌓인다
      const perReplica = new Map<string, number>();
      for (const f of scene.refusals) {
        const k = perReplica.has(f.replica) ? Number(perReplica.get(f.replica)) : 0;
        perReplica.set(f.replica, k + 1);
        const x = cardLeft(replicaIndex(scene, f.replica)) + 6 + k * 74;
        const g = el('g', {}, svg);
        el('path', {
          d: `M ${round(x + 12)} ${TALLY_Y - 9} L ${round(x + 12)} ${TALLY_Y - 2} Q ${round(x + 12)} ${TALLY_Y + 3} ${round(x + 6)} ${TALLY_Y + 3} L ${round(x + 2)} ${TALLY_Y + 3} M ${round(x + 5)} ${TALLY_Y} L ${round(x + 2)} ${TALLY_Y + 3} L ${round(x + 5)} ${TALLY_Y + 6}`,
          fill: 'none',
          stroke: colors.danger,
          'stroke-width': 1.6,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }, g);
        label(g, x + 18, TALLY_Y + 4, t('label.mark', '{c} · t{tick}', { c: f.client, tick: f.tick }), {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.danger,
        });
        handles.marks.push(g);
      }

      // 클라이언트
      for (const c of scene.clients) {
        const cx = clientX(scene, c.id);
        el('circle', { cx, cy: CLIENT_Y, r: 18, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, svg);
        label(svg, cx, CLIENT_Y + SM * 0.4, c.id, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: colors.text,
        });
        label(svg, cx + 26, CLIENT_Y - 6, clientName(c.id), {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        const b = badgeOf(scene, c.id);
        el('rect', {
          x: b.x - 40,
          y: b.y - 10,
          width: 80,
          height: 20,
          rx: 10,
          fill: c.token > 0 ? colors.accent : colors.bg,
          stroke: c.token > 0 ? colors.stateInk : colors.border,
          'stroke-width': 1,
        }, svg);
        handles.token.set(
          c.id,
          label(svg, b.x, b.y + XS * 0.4, t('label.number', 'number {n}', { n: c.token }), {
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'font-weight': 700,
            fill: c.token > 0 ? colors.stateInk : colors.textMuted,
          }),
        );
        label(svg, cx - 18, CHIP_Y - 6, t('label.seen', 'values read', {}), {
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        const chips: SVGGElement[] = [];
        c.seen.forEach((s, k) => {
          const fresh = step.kind === 'serve' && step.client === c.id && k === c.seen.length - 1;
          const g = chipShape(svg, s.value, s.replica, fresh);
          place(g, chipOf(scene, c.id, k));
          chips.push(g);
        });
        handles.chips.set(c.id, chips);
      }

      // 기다리는 읽기 — 다음 사본 앞
      if (scene.ticket !== null) {
        const g = ticketShape(svg, scene.ticket.client, scene.ticket.token);
        place(g, laneOf(scene, scene.ticket.at));
        handles.ticket = g;
      }

      // 캡션 — 지금 일어나는 일
      label(svg, W / 2, CAPTION_Y, caption(scene), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });

      // 움직이는 것은 맨 위에
      svg.appendChild(handles.motion);
      return handles;
    }

    function caption(scene: ReadYourWriteScene): string {
      const step = scene.step;
      switch (step.kind) {
        case 'start': {
          const first = scene.replicas[0];
          if (!first) throw new Error('read-your-write 무대: 사본이 없다');
          return t('caption.start', 'Every replica: {key} = {v}, number {ver}. Reads may go to any replica.', {
            key: scene.key,
            v: first.value,
            ver: first.version,
          });
        }
        case 'write':
          return t('caption.write', '{c} writes {key} = {v} to {r}. Leader number: {ver}. {c} now carries number {n}.', {
            c: clientName(step.client),
            key: scene.key,
            v: step.value,
            r: step.replica,
            ver: step.version,
            n: step.token,
          });
        case 'refuse':
          return t('caption.refuse', '{r} is at number {v}, below the {n} that {c} carries. Turned away. Next: {next}.', {
            r: step.replica,
            v: step.replicaVersion,
            n: step.token,
            c: clientName(step.client),
            next: step.next,
          });
        case 'serve':
          return t('caption.serve', '{r} is at number {v}, not below {n}. {c} reads {key} = {val}.', {
            r: step.replica,
            v: step.replicaVersion,
            n: step.token,
            c: clientName(step.client),
            key: scene.key,
            val: step.value,
          });
        case 'apply':
          return t('caption.apply', '{r} catches up with {src}: {key} = {v}, number {ver}.', {
            r: step.replica,
            src: step.source,
            key: scene.key,
            v: step.value,
            ver: step.version,
          });
      }
    }

    /** 한 운동 — 프레임마다 u(0→1) 를 넘긴다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function run(mine: number, ms: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tickFrame = (): void => {
          if (destroyed || mine !== gen) return done();
          const u = Math.min(1, (Date.now() - start) / ms);
          frame(u);
          if (u >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tickFrame();
          }, 16);
          timers.add(id);
        };
        tickFrame();
      });
    }

    const alive = (mine: number): boolean => !destroyed && mine === gen;

    async function animate(next: ReadYourWriteScene, h: Handles, mine: number): Promise<void> {
      const step = next.step;
      switch (step.kind) {
        case 'start':
          return;
        case 'write': {
          const valueText = h.value.get(step.replica);
          const versionText = h.version.get(step.replica);
          const tokenText = h.token.get(step.client);
          if (!valueText || !versionText || !tokenText) throw new Error('read-your-write 무대: write 의 손잡이가 없다');
          valueText.textContent = `${next.key} = ${step.was.value}`;
          versionText.textContent = t('label.number', 'number {n}', { n: step.was.version });
          tokenText.textContent = t('label.number', 'number {n}', { n: step.was.token });
          // 값이 손에서 리더로 올라간다
          const carry = el('g', {}, h.motion);
          el('rect', { x: -34, y: -12, width: 68, height: 24, rx: 4, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.2 }, carry);
          label(carry, 0, SM * 0.4, `${next.key} = ${step.value}`, {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: colors.text,
          });
          const hand = handOf(next, step.client);
          const door = doorOf(next, step.replica);
          await run(mine, MOTION_WRITE / 2, (u) => place(carry, lerp(hand, door, ease(u))));
          if (!alive(mine)) return;
          carry.remove();
          valueText.textContent = `${next.key} = ${step.value}`;
          versionText.textContent = t('label.number', 'number {n}', { n: step.version });
          // 받은 번호가 리더에서 손으로 내려온다
          const num = ticketShape(h.motion, step.client, step.token);
          const badge = badgeOf(next, step.client);
          await run(mine, MOTION_WRITE / 2, (u) => place(num, lerp(door, badge, ease(u)), 1 - 0.3 * u));
          return;
        }
        case 'refuse': {
          const ticket = h.ticket;
          const mark = h.marks[h.marks.length - 1];
          if (!ticket || !mark) throw new Error('read-your-write 무대: refuse 의 표나 자국이 없다');
          mark.setAttribute('opacity', '0');
          const origin = step.from === null ? handOf(next, step.client) : laneOf(next, step.from);
          const door = doorOf(next, step.replica);
          const below = laneOf(next, step.replica);
          const nextLane = laneOf(next, step.next);
          const up = MOTION_REFUSE * 0.35;
          const back = MOTION_REFUSE * 0.2;
          const slide = MOTION_REFUSE - up - back;
          place(ticket, origin);
          await run(mine, up, (u) => place(ticket, lerp(origin, door, ease(u))));
          if (!alive(mine)) return;
          mark.removeAttribute('opacity');
          await run(mine, back, (u) => place(ticket, lerp(door, below, 1 - (1 - u) * (1 - u))));
          if (!alive(mine)) return;
          // 다음 사본 앞으로 — 길이 길면 아래로 휘어 지나간다
          const sag = Math.abs(nextLane.x - below.x) * 0.08;
          await run(mine, slide, (u) => {
            const e = ease(u);
            const p = lerp(below, nextLane, e);
            place(ticket, { x: p.x, y: p.y + sag * Math.sin(Math.PI * e) });
          });
          return;
        }
        case 'serve': {
          const chips = h.chips.get(step.client);
          const chip = chips ? chips[chips.length - 1] : undefined;
          if (!chip) throw new Error('read-your-write 무대: serve 의 받은 값 칸이 없다');
          chip.setAttribute('opacity', '0');
          const origin = step.from === null ? handOf(next, step.client) : laneOf(next, step.from);
          const door = doorOf(next, step.replica);
          const ticket = ticketShape(h.motion, step.client, step.token);
          place(ticket, origin);
          await run(mine, MOTION_SERVE * 0.4, (u) => place(ticket, lerp(origin, door, ease(u))));
          if (!alive(mine)) return;
          ticket.remove();
          // 값이 사본에서 클라이언트 손으로 내려온다
          const carried = chipShape(h.motion, step.value, step.replica, true);
          const chipsNow = chips ?? [];
          const target = chipOf(next, step.client, chipsNow.length - 1);
          await run(mine, MOTION_SERVE * 0.6, (u) => place(carried, lerp(door, target, ease(u))));
          return;
        }
        case 'apply': {
          const valueText = h.value.get(step.replica);
          const versionText = h.version.get(step.replica);
          if (!valueText || !versionText) throw new Error('read-your-write 무대: apply 의 손잡이가 없다');
          valueText.textContent = `${next.key} = ${step.was.value}`;
          versionText.textContent = t('label.number', 'number {n}', { n: step.was.version });
          const from = { x: cardCenter(next, step.source), y: CARD_TOP + CARD_H / 2 };
          const to = { x: cardCenter(next, step.replica), y: CARD_TOP + CARD_H / 2 };
          const copy = el('g', {}, h.motion);
          el('rect', { x: -34, y: -12, width: 68, height: 24, rx: 4, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 2' }, copy);
          label(copy, 0, SM * 0.4, `${next.key} = ${step.value}`, {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          });
          await run(mine, MOTION_APPLY, (u) => {
            const e = ease(u);
            const p = lerp(from, to, e);
            place(copy, { x: p.x, y: p.y - 30 * Math.sin(Math.PI * e) });
          });
          return;
        }
      }
    }

    return {
      async render(next: ReadYourWriteScene, prev: ReadYourWriteScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        // 한 걸음 앞 장면에서 바로 이어 온 때만 흐른다 — 되짚기 · 건너뛰기는 출발 자리가 다르다
        if (!opts.animate || prev === null || next.seq !== prev.seq + 1) return;
        await animate(next, handles, mine);
        if (!alive(mine)) return;
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
