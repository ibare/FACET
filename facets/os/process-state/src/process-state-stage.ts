/**
 * processState 의 stage — CPU 띠 하나와 프로세스 카드(PCB 의 상태 칸).
 *
 * 운동:
 *   - CPU 띠의 칸은 틱이 밟힐 때 CPU 자리에서 날아올라 **들어와 앉는다.** 앞 판의 칸은 흐리게 남아 있다가
 *     새 판이 그 틱에 닿으면 밀려 내려가며 사라진다 — 판을 지우고 처음부터 쌓지 않는다.
 *   - 카드는 틱마다 준비 줄 → CPU 자리 → 잠든 자리 → 준비 줄 끝으로 자리를 옮긴다. 수를 늘리면 새 카드가
 *     준비 줄 끝으로 들어와 서고, 줄이면 줄에서 빠져나간다.
 *
 * 셈은 하지 않는다 — 누가 어디에 있는지, 남은 틱은 알고리즘이 보낸 그대로 놓는다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';

export type StageCardState = 'ready' | 'running' | 'waiting';

export type StageRound = { count: number; processes: string[]; horizon: number };

export type StageTick = {
  tick: number;
  blocked: string | null;
  woke: string[];
  picked: string | null;
  running: string | null;
  ready: string[];
  cards: { pid: string; state: StageCardState; left: number | null }[];
};

export type StageResult = { busy: number; horizon: number; pct: number };

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 320;

const LABEL_X = 16;
const BAND_X = 84;
const BAND_Y = 40;
const BAND_H = 34;
const BAND_RIGHT = W - 12;

const CARD_W = 72;
const CARD_H = 56;
const SLOT_PITCH = 80;
const READY_Y = 120;
const READY_FRONT_X = 460;
const CPU_X = 588;
const WAIT_Y = 214;
const WAIT_X0 = 140;
const OFF_X = -CARD_W - 20;
const CAPTION_Y = 300;

type Card = {
  g: SVGGElement;
  frame: SVGRectElement;
  stateText: SVGTextElement;
  leftText: SVGTextElement;
  leaving: boolean;
};

type Chip = { g: SVGGElement; ghost: boolean };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

function place(g: SVGGElement, x: number, y: number, ms: number): void {
  g.style.transition = ms > 0 ? `transform ${Math.round(ms)}ms ease-in-out, opacity ${Math.round(ms)}ms ease` : 'none';
  g.style.transform = `translate(${x}px, ${y}px)`;
}

/** 지금 자리를 확정해 다음 transform 이 transition 을 타게 한다. */
function settle(g: SVGGElement): void {
  void g.getBoundingClientRect();
}

export const processStateStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const body = fonts.body;
    const smPx = parseFloat(fontSizes.sm);

    const initialProcesses = Array.isArray(params.initialData?.processes)
      ? (params.initialData.processes as unknown[]).filter((p): p is string => typeof p === 'string')
      : [];
    let palette: readonly string[] = categorical(Math.max(1, initialProcesses.length), 'vivid');
    let order: string[] = initialProcesses.slice();
    const colorOf = (pid: string): string => {
      const i = order.indexOf(pid);
      if (i < 0) throw new Error(`processState stage: 모르는 프로세스 ${pid}`);
      return palette[i % palette.length];
    };

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const root = el('g', {}, svg);
    const bandLayer = el('g', {}, root);
    const chipLayer = el('g', {}, root);
    const frameLayer = el('g', {}, root);
    const cardLayer = el('g', {}, root);

    // 고정 틀 — 줄 이름 · CPU 자리
    const text = (x: number, y: number, s: string, size: string, fill: string, anchor = 'start', parent: Element = frameLayer) => {
      const node = el('text', { x, y, 'font-family': body, 'font-size': size, fill, 'text-anchor': anchor }, parent);
      node.textContent = s;
      return node;
    };
    text(LABEL_X, BAND_Y + BAND_H / 2 + smPx / 2 - 1, t('label.cpu', 'CPU'), fontSizes.sm, c.text);
    text(LABEL_X, READY_Y + CARD_H / 2 + smPx / 2 - 1, t('label.ready', 'Ready'), fontSizes.sm, c.textMuted);
    text(LABEL_X, WAIT_Y + CARD_H / 2 + smPx / 2 - 1, t('label.waiting', 'Waiting'), fontSizes.sm, c.textMuted);
    el(
      'rect',
      { x: CPU_X - 8, y: READY_Y - 8, width: CARD_W + 16, height: CARD_H + 16, rx: 8, fill: 'none', stroke: c.text, 'stroke-width': 1.5 },
      frameLayer,
    );
    text(CPU_X + CARD_W / 2, READY_Y - 14, t('label.cpu', 'CPU'), fontSizes.sm, c.text, 'middle');
    el(
      'line',
      {
        x1: READY_FRONT_X + CARD_W + 6,
        y1: READY_Y + CARD_H / 2,
        x2: CPU_X - 14,
        y2: READY_Y + CARD_H / 2,
        stroke: c.border,
        'stroke-width': 1.5,
      },
      frameLayer,
    );
    const caption = text(LABEL_X, CAPTION_Y, '', fontSizes.md, c.text);

    // CPU 띠
    let horizon = 0;
    let pitch = 0;
    let chips: (Chip | null)[] = [];
    const cellX = (tick: number) => BAND_X + tick * pitch;
    const cursor = el(
      'rect',
      { x: 0, y: 0, width: 1, height: BAND_H + 8, rx: 5, fill: 'none', stroke: c.accent, 'stroke-width': 2.5, opacity: 0 },
      root,
    );
    const cursorG = el('g', {}, root);
    cursorG.appendChild(cursor);

    const drawBand = (h: number) => {
      bandLayer.textContent = '';
      for (const ch of chips) ch?.g.remove();
      horizon = h;
      pitch = Math.min(45, (BAND_RIGHT - BAND_X) / h);
      chips = Array.from({ length: h }, () => null);
      for (let i = 0; i < h; i += 1) {
        el(
          'rect',
          {
            x: cellX(i),
            y: BAND_Y,
            width: pitch - 3,
            height: BAND_H,
            rx: 4,
            fill: c.bgSubtle,
            stroke: c.border,
            'stroke-dasharray': '3 3',
          },
          bandLayer,
        );
        text(cellX(i) + (pitch - 3) / 2, BAND_Y - 8, String(i), fontSizes.xs, c.textMuted, 'middle', bandLayer);
      }
      cursor.setAttribute('width', String(pitch + 3));
    };

    const makeChip = (pid: string): SVGGElement => {
      const g = el('g', {}, chipLayer);
      el('rect', { x: 0, y: 0, width: pitch - 3, height: BAND_H, rx: 4, fill: colorOf(pid), stroke: c.text, 'stroke-width': 1 }, g);
      const s = el(
        'text',
        {
          x: (pitch - 3) / 2,
          y: BAND_H / 2 + smPx / 2,
          'font-family': body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: c.stateInk,
          'text-anchor': 'middle',
        },
        g,
      );
      s.textContent = pid;
      return g;
    };

    // 카드 — PCB 의 상태 칸
    const cards = new Map<string, Card>();
    const makeCard = (pid: string): Card => {
      const g = el('g', {}, cardLayer);
      const frame = el('rect', { x: 0, y: 0, width: CARD_W, height: CARD_H, rx: 6, fill: c.bg, stroke: c.border, 'stroke-width': 1.5 }, g);
      el('rect', { x: 0, y: 0, width: 8, height: CARD_H, rx: 3, fill: colorOf(pid) }, g);
      const idText = el(
        'text',
        { x: 16, y: 20, 'font-family': body, 'font-size': fontSizes.lg, 'font-weight': 700, fill: c.text },
        g,
      );
      idText.textContent = pid;
      const stateText = el('text', { x: 16, y: 36, 'font-family': body, 'font-size': fontSizes.xs, fill: c.text }, g);
      const leftText = el('text', { x: 16, y: 50, 'font-family': body, 'font-size': fontSizes.xs, fill: c.textMuted }, g);
      return { g, frame, stateText, leftText, leaving: false };
    };
    const styleCard = (card: Card, state: StageCardState, left: number | null) => {
      if (state === 'running') {
        card.frame.setAttribute('stroke', c.itemActive);
        card.frame.setAttribute('stroke-width', '2.5');
        card.frame.setAttribute('fill', c.bg);
        card.frame.removeAttribute('stroke-dasharray');
        card.stateText.textContent = t('label.running', 'Running');
      } else if (state === 'waiting') {
        card.frame.setAttribute('stroke', c.textMuted);
        card.frame.setAttribute('stroke-width', '1.5');
        card.frame.setAttribute('fill', c.bgSubtle);
        card.frame.setAttribute('stroke-dasharray', '4 3');
        card.stateText.textContent = t('label.waiting', 'Waiting');
      } else {
        card.frame.setAttribute('stroke', c.border);
        card.frame.setAttribute('stroke-width', '1.5');
        card.frame.setAttribute('fill', c.bg);
        card.frame.removeAttribute('stroke-dasharray');
        card.stateText.textContent = t('label.ready', 'Ready');
      }
      card.leftText.textContent = left === null ? '' : t('card.left', 'Left: {n}', { n: left });
    };
    const readyX = (pos: number) => READY_FRONT_X - pos * SLOT_PITCH;
    const waitX = (pid: string) => {
      const i = order.indexOf(pid);
      if (i < 0) throw new Error(`processState stage: 모르는 프로세스 ${pid}`);
      return WAIT_X0 + i * SLOT_PITCH;
    };

    return {
      startRound(round: StageRound, ms: number): void {
        if (round.processes.length !== round.count) throw new Error('processState stage: 수와 목록이 어긋난다');
        // 색 · 잠든 자리의 차례는 전체 목록을 따른다 (자료가 없으면 이 판의 목록)
        if (initialProcesses.length === 0 && round.processes.length > order.length) {
          order = round.processes.slice();
          palette = categorical(order.length, 'vivid');
        }
        if (round.horizon !== horizon) drawBand(round.horizon);
        // 앞 판의 칸은 흐리게 남는다
        for (const ch of chips) {
          if (ch === null) continue;
          ch.ghost = true;
          ch.g.style.opacity = '0.3';
        }
        cursor.setAttribute('opacity', '0');
        // 빠지는 카드는 줄 끝 쪽으로 빠져나간다
        for (const [pid, card] of cards) {
          if (round.processes.includes(pid) || card.leaving) continue;
          card.leaving = true;
          place(card.g, OFF_X, READY_Y, ms);
          card.g.style.opacity = '0';
          later(ms, () => {
            card.g.remove();
            cards.delete(pid);
          });
        }
        // 모두 번호 차례로 준비 줄에 선다 — 새 카드는 줄 끝으로 들어온다
        round.processes.forEach((pid, pos) => {
          let card = cards.get(pid);
          if (card === undefined || card.leaving) {
            card?.g.remove();
            card = makeCard(pid);
            cards.set(pid, card);
            place(card.g, OFF_X, READY_Y, 0);
            settle(card.g);
          }
          styleCard(card, 'ready', null);
          card.g.style.opacity = '1';
          place(card.g, readyX(pos), READY_Y, ms);
        });
        caption.textContent = t('caption.setup', 'Processes: {n}', { n: round.count });
      },

      showTick(rec: StageTick, ms: number): void {
        if (horizon === 0) throw new Error('processState stage: 판이 시작되기 전에 틱이 왔다');
        if (rec.tick < 0 || rec.tick >= horizon) throw new Error(`processState stage: 틱 ${rec.tick} 가 지평 밖이다`);
        // 커서가 이 틱으로 간다
        cursor.setAttribute('opacity', '1');
        place(cursorG, cellX(rec.tick) - 3, BAND_Y - 4, ms);

        // 카드가 자리를 옮긴다
        for (const info of rec.cards) {
          const card = cards.get(info.pid);
          if (card === undefined) throw new Error(`processState stage: 카드 없는 프로세스 ${info.pid}`);
          styleCard(card, info.state, info.left);
          if (info.state === 'running') place(card.g, CPU_X, READY_Y, ms);
          else if (info.state === 'waiting') place(card.g, waitX(info.pid), WAIT_Y, ms);
          else {
            const pos = rec.ready.indexOf(info.pid);
            if (pos < 0) throw new Error(`processState stage: 준비 줄에 없는 준비 상태 ${info.pid}`);
            place(card.g, readyX(pos), READY_Y, ms);
          }
        }

        // 띠의 이 틱 칸 — 앞 판의 칸은 밀려 내려가고, 새 칸은 CPU 자리에서 날아와 앉는다
        const old = chips[rec.tick];
        if (old !== null) {
          place(old.g, cellX(rec.tick), BAND_Y + BAND_H, ms);
          old.g.style.opacity = '0';
          later(ms, () => old.g.remove());
          chips[rec.tick] = null;
        }
        if (rec.running !== null) {
          const g = makeChip(rec.running);
          place(g, CPU_X + (CARD_W - pitch) / 2, READY_Y + (CARD_H - BAND_H) / 2, 0);
          settle(g);
          place(g, cellX(rec.tick), BAND_Y, ms);
          chips[rec.tick] = { g, ghost: false };
        }

        const parts = [t('caption.tick', 'Tick {n}', { n: rec.tick })];
        if (rec.blocked !== null) parts.push(t('caption.sleeps', 'Sleeps: {name}', { name: rec.blocked }));
        if (rec.woke.length > 0) parts.push(t('caption.wakes', 'Wakes: {name}', { name: rec.woke.join(' ') }));
        if (rec.picked !== null) parts.push(t('caption.picked', 'Picked: {name}', { name: rec.picked }));
        if (rec.running !== null) parts.push(t('caption.runs', 'Runs: {name}', { name: rec.running }));
        else parts.push(t('caption.idle', 'CPU idle'));
        caption.textContent = parts.join(' · ');
      },

      showResult(res: StageResult, ms: number): void {
        place(cursorG, BAND_X - 3, BAND_Y - 4, ms);
        cursor.setAttribute('opacity', '0');
        caption.textContent = [
          t('caption.busy', 'CPU busy: {busy} / {horizon}', { busy: res.busy, horizon: res.horizon }),
          t('caption.utilization', 'Utilization: {pct}%', { pct: res.pct }),
        ].join(' · ');
      },

      destroy(): void {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };
  },
};
