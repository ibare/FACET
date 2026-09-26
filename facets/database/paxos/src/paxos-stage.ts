/**
 * Paxos 무대 — 위에 닿는 차례 띠(메시지 여덟), 왼쪽에 제안자 둘, 오른쪽에 수락자 셋.
 *
 * 운동
 *   - 판이 바뀌면 차례 띠의 칸들이 새 자리로 미끄러진다 — P2 prepare 쌍이 P1 accept 들 사이 다른 자리로 끼어든다
 *   - 걸음마다 메시지 한 장이 제안자에서 수락자로 날아가 닿는다. prepare 는 promise 가 되어 돌아오고,
 *     받아들인 (번호, 값) 을 실어 오면 그 쌍이 제안자의 "실려 온 것" 자리에 붙는다
 *   - 과반째 약속에서 이어받으면 실려 온 값 칩이 보낼 값 자리로 옮겨 붙는다
 *   - accept 가 받아들여지면 그 장이 수락자의 받아들인 것 자리에 내려앉고, 거절이면 튕겨 나온다
 *   - 판이 바뀌면 수락자에 앉아 있던 받아들인 것들이 보낸 제안자 쪽으로 걷혀 간다
 *
 * 무대는 셈하지 않는다 — 약속 수 · 이어받음 · 과반 · 정해진 값은 모두 payload 로 받는다.
 * 값 칩의 색은 그 값을 처음 낸 제안자의 색(제안자의 제 값으로 찾는다)이다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 440;

const TILE_X0 = 20;
const TILE_W = 86;
const TILE_GAP = 6;
const TILE_Y = 50;
const TILE_H = 40;

const PROP_X = 30;
const PROP_W = 190;
const PROP_H = 96;
const PROP_Y = [128, 244];

const ACC_X = 500;
const ACC_W = 236;
const ACC_H = 68;
const ACC_Y0 = 128;
const ACC_GAP = 12;

const PILL_W = 104;
const PILL_H = 22;

export type PaxosStagePair = [number, number];

export type PaxosStageRound = {
  acceptors: string[];
  proposers: { id: string; n: number; value: number }[];
  order: { key: string; who: string; kind: string; to: string; n: number }[];
  majority: number;
};

export type PaxosStageArrive = {
  slot: number;
  key: string;
  who: string;
  kind: string;
  to: string;
  n: number;
  value: number | null;
  outcome: string;
  promised: number;
  accepted: PaxosStagePair | null;
  carried: PaxosStagePair | null;
  promises: number;
  best: PaxosStagePair | null;
  bestFrom: string | null;
  send: number;
  picked: boolean;
  inherited: boolean;
  holders: string[];
  chosen: number | null;
};

export type PaxosStageSettle = { value: number; holders: string[] };

/** projector 가 부르는 무대 표면 */
export type PaxosStage = {
  setRound(p: PaxosStageRound, ms: number): Promise<void>;
  arrive(p: PaxosStageArrive, ms: number): Promise<void>;
  settle(p: PaxosStageSettle): void;
  setCaption(text: string): void;
  finishMotion(): void;
};

type Tile = { g: SVGGElement; rect: SVGRectElement; head: SVGTextElement; body: SVGTextElement; num: SVGTextElement; x: number; pi: number };
type Prop = {
  id: string;
  n: number;
  value: number;
  g: SVGGElement;
  num: SVGTextElement;
  promises: SVGTextElement;
  chip: SVGGElement;
  chipCircle: SVGCircleElement;
  chipText: SVGTextElement;
  carriedPill: SVGGElement;
  carriedRect: SVGRectElement;
  carriedText: SVGTextElement;
  cy: number;
};
type Acc = {
  id: string;
  g: SVGGElement;
  frame: SVGRectElement;
  promised: SVGTextElement;
  flash: SVGTextElement;
  pill: SVGGElement | null;
  pillPair: PaxosStagePair | null;
  slotEmpty: SVGGElement;
  y: number;
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const pairText = (p: PaxosStagePair): string => `(${p[0]}, ${p[1]})`;

export const paxosStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const pal = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const vivid = categorical(2, 'vivid');
    const pastel = categorical(2, 'pastel');
    const mono = fonts.mono;
    const body = fonts.body;

    const root = el('g', {}, svg);
    const layerStatic = el('g', {}, root);
    const layerFly = el('g', {}, root);
    const caption = el('text', { x: W / 2, y: H - 14, 'text-anchor': 'middle', 'font-family': body, 'font-size': fontSizes.sm, fill: pal.text }, root);

    let tiles = new Map<string, Tile>();
    let props: Prop[] = [];
    let accs: Acc[] = [];
    let banner: SVGGElement | null = null;
    let bannerText: SVGTextElement | null = null;
    let majority = 0;
    let destroyed = false;

    // ── 움직임 — 한 번에 하나의 흐름. 새 흐름이 오면 앞 흐름은 끝 모습으로 건너뛴다
    let skip = false;
    const running = new Set<() => void>();
    const tween = (ms: number, frame: (k: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (skip || destroyed || ms <= 0) {
          frame(1);
          resolve();
          return;
        }
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          running.delete(finish);
          frame(1);
          resolve();
        };
        running.add(finish);
        const tick = (): void => {
          if (done) return;
          if (skip || destroyed) return finish();
          const k = Math.min(1, (Date.now() - start) / ms);
          frame(ease(k));
          if (k >= 1) return finish();
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
          else setTimeout(tick, 16);
        };
        // rAF 가 멈춘 환경(숨은 탭 · 검사)에서도 제때 끝나게
        setTimeout(finish, ms + 50);
        tick();
      });
    const finishMotion = (): void => {
      skip = true;
      for (const f of [...running]) f();
      skip = false;
    };

    const colorOfValue = (value: number): { fill: string; stroke: string } => {
      const i = props.findIndex((p) => p.value === value);
      if (i < 0) throw new Error(`paxos-stage: 어느 제안자의 값도 아닌 ${value}`);
      return { fill: pastel[i]!, stroke: vivid[i]! };
    };
    const propIndex = (id: string): number => {
      const i = props.findIndex((p) => p.id === id);
      if (i < 0) throw new Error(`paxos-stage: 모르는 제안자 ${id}`);
      return i;
    };
    const accOf = (id: string): Acc => {
      const a = accs.find((x) => x.id === id);
      if (!a) throw new Error(`paxos-stage: 모르는 수락자 ${id}`);
      return a;
    };
    const tileX = (slot: number): number => TILE_X0 + slot * (TILE_W + TILE_GAP);
    const accCy = (a: Acc): number => a.y + ACC_H / 2;
    const slotX = ACC_X + ACC_W - PILL_W - 12;
    const slotY = (a: Acc): number => a.y + ACC_H - PILL_H - 8;

    /** 쌍 하나를 담은 알약 — 값 색으로 */
    const makePill = (parent: Element, text: string, value: number | null, danger = false): SVGGElement => {
      const g = el('g', {}, parent);
      const c = value === null ? { fill: pal.bgSubtle, stroke: pal.border } : colorOfValue(value);
      el('rect', { x: 0, y: 0, width: PILL_W, height: PILL_H, rx: 11, fill: danger ? pal.bg : c.fill, stroke: danger ? pal.danger : c.stroke, 'stroke-width': 1.5 }, g);
      const tx = el('text', { x: PILL_W / 2, y: PILL_H / 2 + 4, 'text-anchor': 'middle', 'font-family': mono, 'font-size': fontSizes.xs, fill: danger ? pal.danger : pal.stateInk }, g);
      tx.textContent = text;
      return g;
    };
    const place = (g: SVGGElement, x: number, y: number): void => g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    const fly = (g: SVGGElement, x0: number, y0: number, x1: number, y1: number, ms: number): Promise<void> =>
      tween(ms, (k) => place(g, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k));

    const setChip = (p: Prop, value: number): void => {
      const c = colorOfValue(value);
      p.chipCircle.setAttribute('fill', c.fill);
      p.chipCircle.setAttribute('stroke', c.stroke);
      p.chipText.textContent = String(value);
    };

    // ── 처음 모습 (판마다)
    const build = (r: PaxosStageRound): void => {
      layerStatic.textContent = '';
      layerFly.textContent = '';
      majority = r.majority;
      const title = el('text', { x: TILE_X0, y: 26, 'font-family': body, 'font-size': fontSizes.sm, fill: pal.textMuted, 'font-weight': 600 }, layerStatic);
      title.textContent = t('label.order', 'Arrival order');
      const ph = el('text', { x: PROP_X, y: 116, 'font-family': body, 'font-size': fontSizes.sm, fill: pal.textMuted, 'font-weight': 600 }, layerStatic);
      ph.textContent = t('label.proposers', 'Proposers');
      const ah = el('text', { x: ACC_X, y: 116, 'font-family': body, 'font-size': fontSizes.sm, fill: pal.textMuted, 'font-weight': 600 }, layerStatic);
      ah.textContent = t('label.acceptors', 'Acceptors');

      props = r.proposers.map((p, i) => {
        const y = PROP_Y[i];
        if (y === undefined) throw new Error('paxos-stage: 제안자가 둘보다 많다');
        const g = el('g', {}, layerStatic);
        el('rect', { x: PROP_X, y, width: PROP_W, height: PROP_H, rx: 8, fill: pal.bg, stroke: vivid[i]!, 'stroke-width': 2 }, g);
        const idt = el('text', { x: PROP_X + 12, y: y + 24, 'font-family': mono, 'font-size': fontSizes.lg, 'font-weight': 700, fill: pal.text }, g);
        idt.textContent = p.id;
        const num = el('text', { x: PROP_X + 48, y: y + 23, 'font-family': body, 'font-size': fontSizes.sm, fill: pal.textMuted }, g);
        num.textContent = t('label.number', 'number {n}', { n: p.n });
        const promises = el('text', { x: PROP_X + 12, y: y + 50, 'font-family': body, 'font-size': fontSizes.sm, fill: pal.text }, g);
        const sendL = el('text', { x: PROP_X + PROP_W - 36, y: y + 16, 'text-anchor': 'middle', 'font-family': body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
        sendL.textContent = t('label.send', 'sends');
        const chip = el('g', {}, g);
        place(chip, PROP_X + PROP_W - 36, y + 38);
        const chipCircle = el('circle', { cx: 0, cy: 0, r: 16, 'stroke-width': 2 }, chip);
        const chipText = el('text', { x: 0, y: 5, 'text-anchor': 'middle', 'font-family': mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: pal.stateInk }, chip);
        const carriedL = el('text', { x: PROP_X + 12, y: y + 78, 'font-family': body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
        carriedL.textContent = t('label.carried', 'carried');
        const carriedPill = el('g', {}, g);
        place(carriedPill, PROP_X + PROP_W - PILL_W - 10, y + PROP_H - PILL_H - 8);
        const carriedRect = el('rect', { x: 0, y: 0, width: PILL_W, height: PILL_H, rx: 11, fill: pal.bgSubtle, stroke: pal.border, 'stroke-dasharray': '3 3' }, carriedPill);
        const carriedText = el('text', { x: PILL_W / 2, y: PILL_H / 2 + 4, 'text-anchor': 'middle', 'font-family': mono, 'font-size': fontSizes.xs, fill: pal.textMuted }, carriedPill);
        carriedText.textContent = t('label.none', 'none');
        return { id: p.id, n: p.n, value: p.value, g, num, promises, chip, chipCircle, chipText, carriedPill, carriedRect, carriedText, cy: y + PROP_H / 2 };
      });
      for (const p of props) {
        setChip(p, p.value);
        p.promises.textContent = t('label.promises', 'promises: {got} / {need}', { got: 0, need: majority });
      }

      accs = r.acceptors.map((id, i) => {
        const y = ACC_Y0 + i * (ACC_H + ACC_GAP);
        const g = el('g', {}, layerStatic);
        const frame = el('rect', { x: ACC_X, y, width: ACC_W, height: ACC_H, rx: 8, fill: pal.bgSubtle, stroke: pal.border, 'stroke-width': 1.5 }, g);
        const idt = el('text', { x: ACC_X + 12, y: y + 26, 'font-family': mono, 'font-size': fontSizes.lg, 'font-weight': 700, fill: pal.text }, g);
        idt.textContent = id;
        const promised = el('text', { x: ACC_X + 12, y: y + 50, 'font-family': body, 'font-size': fontSizes.sm, fill: pal.text }, g);
        promised.textContent = t('label.promised', 'promised {n}', { n: 0 });
        const accL = el('text', { x: slotX + PILL_W / 2, y: y + 22, 'text-anchor': 'middle', 'font-family': body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
        accL.textContent = t('label.accepted', 'accepted');
        const slotEmpty = el('g', {}, g);
        place(slotEmpty, slotX, y + ACC_H - PILL_H - 8);
        el('rect', { x: 0, y: 0, width: PILL_W, height: PILL_H, rx: 11, fill: pal.bg, stroke: pal.border, 'stroke-dasharray': '3 3' }, slotEmpty);
        const none = el('text', { x: PILL_W / 2, y: PILL_H / 2 + 4, 'text-anchor': 'middle', 'font-family': body, 'font-size': fontSizes.xs, fill: pal.textMuted }, slotEmpty);
        none.textContent = t('label.none', 'none');
        const flash = el('text', { x: ACC_X + ACC_W / 2 - 6, y: y + 50, 'text-anchor': 'middle', 'font-family': body, 'font-size': fontSizes.sm, 'font-weight': 700, fill: pal.danger }, g);
        return { id, g, frame, promised, flash, pill: null, pillPair: null, slotEmpty, y };
      });

      banner = el('g', {}, layerStatic);
      place(banner, ACC_X, ACC_Y0 + r.acceptors.length * (ACC_H + ACC_GAP) + 4);
      el('rect', { x: 0, y: 0, width: ACC_W, height: 28, rx: 6, fill: pal.bg, stroke: pal.border }, banner);
      bannerText = el('text', { x: ACC_W / 2, y: 19, 'text-anchor': 'middle', 'font-family': body, 'font-size': fontSizes.sm, 'font-weight': 700, fill: pal.textMuted }, banner);
      bannerText.textContent = t('label.majority', 'majority: {n}', { n: majority });
    };

    const buildTiles = (order: PaxosStageRound['order'], keep: Map<string, Tile>): Map<string, Tile> => {
      const next = new Map<string, Tile>();
      order.forEach((m, slot) => {
        let tile = keep.get(m.key);
        const i = propIndex(m.who);
        if (!tile) {
          const g = el('g', {}, root);
          const num = el('text', { x: TILE_W / 2, y: -5, 'text-anchor': 'middle', 'font-family': body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
          const rect = el('rect', { x: 0, y: 0, width: TILE_W, height: TILE_H, rx: 6, 'stroke-width': 1.5 }, g);
          const head = el('text', { x: TILE_W / 2, y: 16, 'text-anchor': 'middle', 'font-family': mono, 'font-size': fontSizes.xs, fill: pal.text }, g);
          const bodyT = el('text', { x: TILE_W / 2, y: 32, 'text-anchor': 'middle', 'font-family': mono, 'font-size': fontSizes.xs, fill: pal.text }, g);
          tile = { g, rect, head, body: bodyT, num, x: tileX(slot), pi: i };
          place(g, tile.x, TILE_Y);
        }
        tile.pi = i;
        tile.rect.setAttribute('fill', pal.bg);
        tile.rect.setAttribute('stroke', vivid[i]!);
        tile.rect.setAttribute('stroke-width', '1.5');
        tile.head.textContent = `${m.who} → ${m.to}`;
        tile.body.textContent = `${m.kind}(${m.n})`;
        tile.body.setAttribute('fill', pal.text);
        next.set(m.key, tile);
      });
      for (const [k, tile] of keep) if (!next.has(k)) tile.g.remove();
      return next;
    };

    const setRound = async (r: PaxosStageRound, ms: number): Promise<void> => {
      finishMotion();
      // 앞 판의 받아들인 것들 — 보낸 제안자 쪽으로 걷혀 간다
      const leaving: { g: SVGGElement; x0: number; y0: number; x1: number; y1: number }[] = [];
      if (accs.length > 0 && props.length > 0) {
        for (const a of accs) {
          if (!a.pill || !a.pillPair) continue;
          const pair = a.pillPair;
          const owner = props.find((p) => p.n === pair[0]);
          if (!owner) throw new Error(`paxos-stage: 번호 ${pair[0]} 의 제안자가 없다`);
          const g = makePill(layerFly, pairText(pair), pair[1]);
          leaving.push({ g, x0: slotX, y0: slotY(a), x1: PROP_X + PROP_W - PILL_W, y1: owner.cy - PILL_H / 2 });
        }
      }
      const keptFly = [...layerFly.childNodes];
      const oldTiles = tiles;
      const oldX = new Map([...oldTiles].map(([k, v]) => [k, v.x]));
      build(r);
      for (const n of keptFly) layerFly.appendChild(n);
      tiles = buildTiles(r.order, oldTiles);
      r.order.forEach((m, slot) => {
        const tile = tiles.get(m.key)!;
        tile.x = tileX(slot);
        tile.num.textContent = String(slot + 1);
      });
      const moves = r.order.map((m) => {
        const tile = tiles.get(m.key)!;
        const x0 = oldX.get(m.key) ?? tile.x;
        return { tile, x0, x1: tile.x };
      });
      await tween(ms, (k) => {
        for (const mv of moves) place(mv.tile.g, mv.x0 + (mv.x1 - mv.x0) * k, TILE_Y);
        for (const l of leaving) {
          place(l.g, l.x0 + (l.x1 - l.x0) * k, l.y0 + (l.y1 - l.y0) * k);
          l.g.setAttribute('opacity', String(1 - 0.8 * k));
        }
      });
      for (const l of leaving) l.g.remove();
    };

    const markTile = (key: string, text: string, state: 'now' | 'done' | 'reject'): void => {
      const tile = tiles.get(key);
      if (!tile) throw new Error(`paxos-stage: 차례 띠에 없는 메시지 ${key}`);
      for (const other of tiles.values()) other.rect.setAttribute('stroke-width', '1.5');
      tile.body.textContent = text;
      if (state === 'reject') {
        tile.rect.setAttribute('fill', pal.bg);
        tile.rect.setAttribute('stroke', pal.danger);
        tile.body.setAttribute('fill', pal.danger);
      } else if (state === 'done') {
        tile.rect.setAttribute('fill', pastel[tile.pi]!);
      }
      if (state !== 'done') tile.rect.setAttribute('stroke-width', '3');
    };

    const arrive = async (p: PaxosStageArrive, ms: number): Promise<void> => {
      finishMotion();
      const pi = propIndex(p.who);
      const prop = props[pi]!;
      const acc = accOf(p.to);
      const tile = tiles.get(p.key);
      if (!tile) throw new Error(`paxos-stage: 차례 띠에 없는 메시지 ${p.key}`);
      const label = p.kind === 'accept' && p.value !== null ? `${p.kind}(${p.n}, ${p.value})` : `${p.kind}(${p.n})`;
      markTile(p.key, label, p.outcome === 'reject' ? 'reject' : 'now');
      // 띠의 이 칸이 들린다
      void tween(ms * 0.3, (k) => place(tile.g, tile.x, TILE_Y - 6 * Math.sin(Math.PI * k)));
      for (const a of accs) a.flash.textContent = '';

      const x0 = PROP_X + PROP_W + 4;
      const y0 = prop.cy - PILL_H / 2;
      const x1 = ACC_X - PILL_W - 4;
      const y1 = accCy(acc) - PILL_H / 2;
      const env = makePill(layerFly, label, p.kind === 'accept' ? p.value : null);

      if (p.kind === 'prepare') {
        await fly(env, x0, y0, x1, y1, ms * 0.4);
        env.remove();
        acc.promised.textContent = t('label.promised', 'promised {n}', { n: p.promised });
        const back = makePill(layerFly, p.carried ? `${p.outcome} ${pairText(p.carried)}` : p.outcome, p.carried ? p.carried[1] : null);
        await fly(back, x1, y1, x0, y0, ms * 0.4);
        back.remove();
        prop.promises.textContent = t('label.promises', 'promises: {got} / {need}', { got: p.promises, need: majority });
        if (p.best && p.bestFrom === p.to) {
          const c = colorOfValue(p.best[1]);
          prop.carriedRect.setAttribute('fill', c.fill);
          prop.carriedRect.setAttribute('stroke', c.stroke);
          prop.carriedRect.removeAttribute('stroke-dasharray');
          prop.carriedText.textContent = pairText(p.best);
          prop.carriedText.setAttribute('fill', pal.stateInk);
        }
        if (p.picked && p.inherited && p.best) {
          // 실려 온 값이 보낼 값 자리로 옮겨 붙는다
          const cx0 = PROP_X + PROP_W - PILL_W - 10 + PILL_W / 2;
          const cy0 = prop.cy - PROP_H / 2 + PROP_H - PILL_H - 8 + PILL_H / 2;
          const cx1 = PROP_X + PROP_W - 36;
          const cy1 = prop.cy - PROP_H / 2 + 38;
          const moving = el('g', {}, layerFly);
          const c = colorOfValue(p.send);
          el('circle', { cx: 0, cy: 0, r: 16, fill: c.fill, stroke: c.stroke, 'stroke-width': 2 }, moving);
          const mt = el('text', { x: 0, y: 5, 'text-anchor': 'middle', 'font-family': mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: pal.stateInk }, moving);
          mt.textContent = String(p.send);
          await tween(ms * 0.2, (k) => place(moving, cx0 + (cx1 - cx0) * k, cy0 + (cy1 - cy0) * k));
          moving.remove();
        } else {
          await tween(ms * 0.2, () => undefined);
        }
        if (p.picked) setChip(prop, p.send);
        markTile(p.key, label, 'done');
      } else if (p.outcome === 'accept') {
        const sx = slotX;
        const sy = slotY(acc);
        await fly(env, x0, y0, x1, y1, ms * 0.6);
        await fly(env, x1, y1, sx, sy, ms * 0.4);
        env.remove();
        if (acc.pill) acc.pill.remove();
        if (!p.accepted) throw new Error('paxos-stage: 받아들였는데 받아들인 것이 없다');
        acc.pill = makePill(acc.g, pairText(p.accepted), p.accepted[1]);
        acc.pillPair = p.accepted;
        place(acc.pill, sx, sy);
        acc.slotEmpty.setAttribute('opacity', '0');
        acc.promised.textContent = t('label.promised', 'promised {n}', { n: p.promised });
        markTile(p.key, label, 'done');
      } else {
        // 거절 — 닿았다가 튕겨 나온다
        const bx = (x0 + x1) / 2;
        const by = y1 + 18;
        await fly(env, x0, y0, x1, y1, ms * 0.55);
        acc.flash.textContent = t('label.reject', 'rejected');
        env.remove();
        const bounced = makePill(layerFly, label, null, true);
        await tween(ms * 0.45, (k) => {
          place(bounced, x1 + (bx - x1) * k, y1 + (by - y1) * k);
          bounced.setAttribute('opacity', String(1 - 0.7 * k));
        });
        bounced.remove();
        markTile(p.key, label, 'reject');
      }

      // 과반을 이룬 수락자 · 정해진 값
      for (const a of accs) {
        const held = p.holders.includes(a.id);
        a.frame.setAttribute('stroke', held ? pal.accent : pal.border);
        a.frame.setAttribute('stroke-width', held ? '3' : '1.5');
      }
      if (p.chosen !== null && bannerText) {
        bannerText.textContent = t('label.chosen', 'chosen: {v}', { v: p.chosen });
        bannerText.setAttribute('fill', pal.text);
        const rect = banner?.querySelector('rect');
        if (rect) {
          const c = colorOfValue(p.chosen);
          rect.setAttribute('fill', c.fill);
          rect.setAttribute('stroke', c.stroke);
        }
      }
    };

    const settle = (p: PaxosStageSettle): void => {
      finishMotion();
      for (const other of tiles.values()) other.rect.setAttribute('stroke-width', '1.5');
      for (const a of accs) {
        const held = p.holders.includes(a.id);
        a.frame.setAttribute('stroke', held ? pal.accent : pal.border);
        a.frame.setAttribute('stroke-width', held ? '3' : '1.5');
        a.flash.textContent = '';
      }
      if (bannerText) bannerText.textContent = t('label.chosen', 'chosen: {v}', { v: p.value });
    };

    const stage: PaxosStage = {
      setRound,
      arrive,
      settle,
      setCaption(text: string) {
        caption.textContent = text;
      },
      finishMotion,
    };

    return {
      ...stage,
      destroy() {
        destroyed = true;
        finishMotion();
        root.remove();
      },
    };
  },
};
