/**
 * three-way-sync 무대 — 양쪽이 쥔 확인 칸이 메시지가 닿을 때마다 채워진다.
 *
 * 두 끝이 좌우에 서고, 각 끝 아래에 "상대가 알아야 할 것" 칸이 둘 있다. 메시지 카드는
 * 보내는 쪽에서 받는 쪽으로 건너가고, 닿으면 카드의 값 조각(seq= · ack=)이 떨어져
 * 받는 쪽 칸으로 들어간다. 가운데 메시지는 조각 둘을 한꺼번에 떨군다. 칸의 번호 표는
 * 어느 메시지가 그 칸을 채웠는지 남긴다.
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
import type { SyncFact, SyncMessage, SyncSide, ThreeWaySyncScene } from './scene.js';

const H = 336;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 — 건너가기와 칸으로 떨어지기를 한 시계로 흘린다. */
const MOVE_MS = 900;
/** 시계 가운데 건너가기가 차지하는 몫. 나머지가 떨어지기. */
const TRAVEL_SHARE = 0.6;

const PAD = 16;
const COL_MAX = 236;
const HEAD_LABEL_Y = 24;
const HEAD_ADDR_Y = 42;
const BADGE_Y = 52;
const BADGE_H = 24;
const LANE_Y = 94;
const CARD_H = 54;
const SLOT_Y = 166;
const SLOT_H = 54;
const SLOT_GAP = 10;
const CHIP_H = 20;
const TAG_R = 9;
const CAPTION_Y = 306;
const CAPTION_GAP = 20;

type Pt = { x: number; y: number };

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

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

function label(parent: Element, x: number, y: number, body: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = body;
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 칸 · 카드 · 조각의 자리. 캔버스 폭에서 역산한다. */
function geometry(scene: ThreeWaySyncScene) {
  const W = PIECE_CANVAS_W;
  const colW = Math.min(COL_MAX, (W - 2 * PAD) * 0.38);
  const monoPx = parseFloat(fontSizes.xs);
  const charW = monoPx * 0.62;
  // 조각 폭은 걸음마다 흔들리지 않게 하한을 둔다 (seq=/ack= 뒤 네 자리 + 여유).
  const texts = [
    ...scene.sent.flatMap((m) => [`${scene.fieldText.seq}${m.seq}`, m.ack === null ? '' : `${scene.fieldText.ack}${m.ack}`]),
    ...scene.facts.map((f) => (f.value ? `${scene.fieldText[f.value.field]}${f.value.n}` : '')),
  ];
  const longest = Math.max(9, ...texts.map((s) => s.length));
  const chipW = Math.ceil(longest * charW + 14);
  const colX = new Map<string, number>();
  scene.sides.forEach((s, i) => colX.set(s.id, i === 0 ? PAD : W - PAD - colW));
  const centerOf = (side: string): number => {
    const x = colX.get(side);
    if (x === undefined) throw new Error(`three-way-sync 무대: 없는 끝 ${side}`);
    return x + colW / 2;
  };
  const cardW = 8 + TAG_R * 2 + 8 + chipW * 2 + 6 + 8;
  const slotRow = (fact: SyncFact): number => (fact.kind === 'peerNumber' ? 0 : 1);
  const slotY = (fact: SyncFact): number => SLOT_Y + slotRow(fact) * (SLOT_H + SLOT_GAP);
  const slotChip = (fact: SyncFact): Pt => {
    const x = colX.get(fact.holder);
    if (x === undefined) throw new Error(`three-way-sync 무대: 없는 끝 ${fact.holder}`);
    return { x: x + 10, y: slotY(fact) + 26 };
  };
  /** 카드가 center 에 설 때 필드 조각의 왼쪽 위. */
  const cardChip = (center: number, field: 'seq' | 'ack'): Pt => ({
    x: center - cardW / 2 + 8 + (field === 'seq' ? 0 : chipW + 6),
    y: LANE_Y + CARD_H - CHIP_H - 8,
  });
  return { W, colW, colX, centerOf, cardW, chipW, slotY, slotChip, cardChip };
}

type Handles = {
  card: SVGGElement | null;
  badges: Map<string, { rect: SVGRectElement; text: SVGTextElement }>;
  slotChips: Map<string, SVGGElement>;
  slotRects: Map<string, SVGRectElement>;
};

function badgeColor(c: Palette, scene: ThreeWaySyncScene, side: SyncSide, state: string): string {
  if (state === scene.established) return c.success;
  if (state === side.initial) return c.textMuted;
  return c.itemActive;
}

export const threeWaySyncStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    const sideName = (id: string): string => {
      if (id === 'client') return t('label.client', 'Client');
      if (id === 'server') return t('label.server', 'Server');
      throw new Error(`three-way-sync 무대: 이름이 없는 끝 ${id}`);
    };
    const factName = (id: string): string => {
      if (id === 'serverKnowsX') return t('fact.serverKnowsX', "Has the client's number");
      if (id === 'clientKnowsXAcked') return t('fact.clientKnowsXAcked', 'Knows its number arrived');
      if (id === 'clientKnowsY') return t('fact.clientKnowsY', "Has the server's number");
      if (id === 'serverKnowsYAcked') return t('fact.serverKnowsYAcked', 'Knows its number arrived');
      throw new Error(`three-way-sync 무대: 문안이 없는 칸 ${id}`);
    };

    const tagColors = (scene: ThreeWaySyncScene): readonly string[] => categorical(Math.max(scene.total, 1));
    const tagColor = (scene: ThreeWaySyncScene, index: number): string => {
      const col = tagColors(scene)[index - 1];
      if (col === undefined) throw new Error(`three-way-sync 무대: 메시지 차례 ${index} 가 범위 밖이다`);
      return col;
    };

    function chip(parent: Element, at: Pt, w: number, body: string, stroke: string, ghost: boolean): SVGGElement {
      const g = el('g', { transform: `translate(${round(at.x)},${round(at.y)})` }, parent);
      el('rect', {
        x: 0, y: 0, width: w, height: CHIP_H, rx: 4,
        fill: ghost ? 'none' : c.bg,
        stroke: ghost ? c.border : stroke,
        'stroke-width': ghost ? 1 : 1.5,
        ...(ghost ? { 'stroke-dasharray': '3 3' } : {}),
      }, g);
      if (!ghost) {
        label(g, w / 2, CHIP_H / 2 + 4, body, {
          'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text,
        });
      }
      return g;
    }

    function tag(parent: Element, cx: number, cy: number, index: number, color: string): void {
      el('circle', { cx, cy, r: TAG_R, fill: color }, parent);
      label(parent, cx, cy + 4, String(index), {
        'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, 'font-weight': 700, fill: c.stateInk,
      });
    }

    function drawCard(parent: Element, scene: ThreeWaySyncScene, m: SyncMessage, center: number): SVGGElement {
      const geo = geometry(scene);
      const color = tagColor(scene, m.index);
      const g = el('g', {}, parent);
      const x0 = center - geo.cardW / 2;
      el('rect', { x: x0, y: LANE_Y, width: geo.cardW, height: CARD_H, rx: 6, fill: c.bgSubtle, stroke: color, 'stroke-width': 2 }, g);
      tag(g, x0 + 8 + TAG_R, LANE_Y + 16, m.index, color);
      label(g, x0 + 8 + TAG_R * 2 + 8, LANE_Y + 21, m.flags.join('+'), {
        'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700, fill: c.text,
      });
      const filledField = (field: 'seq' | 'ack'): boolean =>
        m.filled.some((id) => scene.facts.find((f) => f.id === id)?.value?.field === field);
      chip(g, geo.cardChip(center, 'seq'), geo.chipW, `${scene.fieldText.seq}${m.seq}`, color, filledField('seq'));
      if (m.ack !== null) {
        chip(g, geo.cardChip(center, 'ack'), geo.chipW, `${scene.fieldText.ack}${m.ack}`, color, filledField('ack'));
      }
      return g;
    }

    function captions(scene: ThreeWaySyncScene): string[] {
      const filled = scene.facts.filter((f) => f.value !== null).length;
      const total = scene.facts.length;
      const count = t('caption.count', 'Filled: {filled}/{total} · Empty: {empty}', { filled, total, empty: total - filled });
      const last = scene.sent[scene.sent.length - 1];
      if (scene.step.kind === 'start' || last === undefined) {
        // 끝마다의 칸 수를 셈한다. 끝마다 다르면 한 수로 말할 수 없어 던진다.
        const perSide = new Set(scene.sides.map((sd) => scene.facts.filter((f) => f.holder === sd.id).length));
        const [n] = [...perSide];
        if (perSide.size !== 1 || n === undefined) throw new Error('three-way-sync 무대: 끝마다 칸 수가 다르다');
        return [t('caption.start', 'No message sent yet. Slots to fill on each side: {n}', { n }), count];
      }
      const lines = [
        t('caption.arrive', 'Message {n} arrived: {flags}. Slots it filled: {k}', {
          n: last.index, flags: last.flags.join('+'), k: last.filled.length,
        }),
      ];
      const closed = scene.sides.filter((s) => s.state !== scene.established);
      if (closed.length === 0) {
        lines.push(`${count} · ${t('caption.open', 'Open on both sides: {state}', { state: scene.established })}`);
      } else {
        lines.push(`${count} · ${t('caption.waiting', 'Not open yet: {sides}', { sides: closed.map((s) => sideName(s.id)).join(', ') })}`);
      }
      return lines;
    }

    function drawStatic(scene: ThreeWaySyncScene): Handles {
      svg.textContent = '';
      const geo = geometry(scene);
      const handles: Handles = { card: null, badges: new Map(), slotChips: new Map(), slotRects: new Map() };
      const root = el('g', {}, svg);

      // 두 끝 사이의 선 — 메시지가 건너가는 길.
      const [a, b] = scene.sides;
      if (a && b) {
        el('line', {
          x1: geo.centerOf(a.id), y1: LANE_Y + CARD_H / 2, x2: geo.centerOf(b.id), y2: LANE_Y + CARD_H / 2,
          stroke: c.border, 'stroke-width': 2, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round',
        }, root);
      }

      for (const side of scene.sides) {
        const x = geo.colX.get(side.id);
        if (x === undefined) throw new Error(`three-way-sync 무대: 없는 끝 ${side.id}`);
        const cx = x + geo.colW / 2;
        label(root, cx, HEAD_LABEL_Y, sideName(side.id), {
          'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700, fill: c.text,
        });
        label(root, cx, HEAD_ADDR_Y, side.addr, {
          'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted,
        });
        const bw = Math.min(geo.colW, side.state.length * parseFloat(fontSizes.sm) * 0.62 + 24);
        const color = badgeColor(c, scene, side, side.state);
        const rect = el('rect', {
          x: cx - bw / 2, y: BADGE_Y, width: bw, height: BADGE_H, rx: BADGE_H / 2,
          fill: c.bg, stroke: color, 'stroke-width': 2,
        }, root);
        const text = label(root, cx, BADGE_Y + BADGE_H / 2 + 4, side.state, {
          'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700, fill: color,
        });
        handles.badges.set(side.id, { rect, text });
        // 칸을 떠받치는 기둥 — 머리에서 칸까지.
        el('line', {
          x1: cx, y1: BADGE_Y + BADGE_H, x2: cx, y2: SLOT_Y,
          stroke: c.border, 'stroke-width': 1,
        }, root);
      }

      for (const fact of scene.facts) {
        const x = geo.colX.get(fact.holder);
        if (x === undefined) throw new Error(`three-way-sync 무대: 없는 끝 ${fact.holder}`);
        const y = geo.slotY(fact);
        const full = fact.value !== null;
        const slot = el('rect', {
          x, y, width: geo.colW, height: SLOT_H, rx: 6,
          fill: full ? c.bgSubtle : c.bg,
          stroke: full ? c.text : c.textMuted,
          'stroke-width': full ? 1.5 : 1.2,
          ...(full ? {} : { 'stroke-dasharray': '5 4' }),
        }, root);
        handles.slotRects.set(fact.id, slot);
        label(root, x + 10, y + 17, factName(fact.id), {
          'font-family': fonts.body, 'font-size': fontSizes.xs, fill: full ? c.text : c.textMuted,
        });
        const at = geo.slotChip(fact);
        if (fact.value !== null && fact.by !== null) {
          const color = tagColor(scene, fact.by);
          const g = chip(root, at, geo.chipW, `${scene.fieldText[fact.value.field]}${fact.value.n}`, color, false);
          tag(g, geo.chipW + 6 + TAG_R, CHIP_H / 2, fact.by, color);
          handles.slotChips.set(fact.id, g);
        } else {
          chip(root, at, geo.chipW, '', c.border, true);
        }
      }

      const last = scene.sent[scene.sent.length - 1];
      if (last !== undefined) handles.card = drawCard(root, scene, last, geo.centerOf(last.to));

      captions(scene).forEach((line, i) => {
        label(root, geo.W / 2, CAPTION_Y + i * CAPTION_GAP, line, {
          'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: i === 0 ? c.text : c.textMuted,
        });
      });
      return handles;
    }

    /** 한 시계. 프레임마다 p(0→1) 를 넘긴다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function clock(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            wake();
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

    async function playMessage(mine: number, scene: ThreeWaySyncScene, handles: Handles): Promise<void> {
      if (scene.step.kind !== 'message') return;
      const m = scene.sent[scene.sent.length - 1];
      if (m === undefined || m.index !== scene.step.index) return;
      const geo = geometry(scene);
      const receiverSide = scene.sides.find((s) => s.id === m.to);
      const badge = handles.badges.get(m.to);
      const offset = geo.centerOf(m.from) - geo.centerOf(m.to);
      const was = scene.step.receiverWas;

      // 닿기 전의 받는 쪽 상태 — 정적 그리기는 이미 닿은 뒤를 그렸다.
      if (badge && receiverSide && was !== receiverSide.state) {
        const col = badgeColor(c, scene, receiverSide, was);
        badge.text.textContent = was;
        badge.text.setAttribute('fill', col);
        badge.rect.setAttribute('stroke', col);
      }

      const moving = m.filled.flatMap((id) => {
        const fact = scene.facts.find((f) => f.id === id);
        const g = handles.slotChips.get(id);
        if (!fact || !fact.value || !g) return [];
        return [{ g, from: geo.cardChip(geo.centerOf(m.to), fact.value.field), to: geo.slotChip(fact) }];
      });

      // 조각이 떨어지기 전까지 칸은 빈 모양이다.
      for (const id of m.filled) {
        const slot = handles.slotRects.get(id);
        if (!slot) continue;
        slot.setAttribute('fill', c.bg);
        slot.setAttribute('stroke', c.textMuted);
        slot.setAttribute('stroke-dasharray', '5 4');
      }

      let arrived = false;
      await clock(mine, MOVE_MS, (p) => {
        const travel = ease(Math.min(1, p / TRAVEL_SHARE));
        const drop = p <= TRAVEL_SHARE ? 0 : ease((p - TRAVEL_SHARE) / (1 - TRAVEL_SHARE));
        const cardDx = offset * (1 - travel);
        handles.card?.setAttribute('transform', `translate(${round(cardDx)},0)`);
        // 조각은 카드에 실려 오다가, 닿은 뒤 칸으로 떨어진다. 아직 못 온 만큼 비켜 그린다.
        for (const mv of moving) {
          const x = mv.from.x + cardDx + (mv.to.x - mv.from.x) * drop;
          const y = mv.from.y + (mv.to.y - mv.from.y) * drop;
          mv.g.setAttribute('transform', `translate(${round(x)},${round(y)})`);
        }
        if (!arrived && p >= TRAVEL_SHARE && badge && receiverSide) {
          arrived = true;
          const col = badgeColor(c, scene, receiverSide, receiverSide.state);
          badge.text.textContent = receiverSide.state;
          badge.text.setAttribute('fill', col);
          badge.rect.setAttribute('stroke', col);
        }
      });
    }

    return {
      async render(next: unknown, _prev: unknown, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const scene = next as ThreeWaySyncScene;
        const handles = drawStatic(scene);
        if (!opts.animate || scene.step.kind !== 'message') return;
        await playMessage(mine, scene, handles);
        if (mine !== gen || destroyed) return;
        drawStatic(scene);
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
