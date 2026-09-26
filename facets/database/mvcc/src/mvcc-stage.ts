/**
 * mvcc 무대 — 판 사슬 위를 옮겨 가는 스냅샷 선, 청소 때 그 앞에서 걷히는 판.
 *
 * 그림:
 *   - 위: 캡션 한 줄
 *   - 가운데: 줄 이름과 판 사슬. 판 카드마다 값과 `[시작, 끝)`. 지금 판에 "지금 판" 표지
 *   - 스냅샷 선: 읽는 이가 쥔 스냅샷이 보는 판 위에 선다. 쥐고 있으면 굵은 선, 놓았으면 점선.
 *     판이 앞으로 당겨지면 선도 제 판을 따라간다
 *   - 아래: 읽는 이와 읽기 두 칸. 읽기 걸음에 보이는 판의 값이 사슬에서 칸으로 날아 내려온다
 *
 * 운동 (길이는 projector 가 재생 속도로 셈해 넘긴다):
 *   - 커밋: 새 판이 사슬 끝에 오른쪽에서 **붙고**, 앞 판의 끝 틱이 찍힌다
 *   - 읽기: 스냅샷 선이 보이는 판으로 **옮겨 가고**, 그 판의 값이 읽기 칸으로 **내려온다**
 *   - 청소: 남기지 않는 판이 아래로 **떨어져 나가고**, 남은 판이 앞으로 **당겨진다**
 *   - 새 판(재생): 앞 재생의 판들이 처음 판 자리로 **접혀 들어가고**, 스냅샷 선은 숨었다가
 *     첫 읽기에 지난 자리에서 새 자리로 옮겨 간다
 *
 * 무대는 셈하지 않는다 — 보이는 판의 자리 · 남길 판 · 쥔 스냅샷 여부는 payload 로 받는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 340;
const CARD_X0 = 110;
const CARD_STEP = 126;
const CARD_W = 100;
const CARD_H = 70;
const CARD_Y = 96;
const LINE_TOP = 70;
const LINE_BOTTOM = CARD_Y + CARD_H + 34;
const DROP = 56;
const SLOT_Y = 232;
const SLOT_H = 72;
const READER_X = 20;
const READER_W = 72;
const SLOT_X = [110, 430];
const SLOT_W = 300;

export type MvccStageVersion = { value: number; start: number; end: number };

export type MvccStageStart = {
  row: string;
  reader: string;
  versions: MvccStageVersion[];
};
export type MvccStageCommit = { versions: MvccStageVersion[] };
export type MvccStageRead = {
  tick: number;
  which: 1 | 2;
  snap: number;
  index: number;
  value: number;
  held: boolean;
};
export type MvccStageVacuum = { kept: boolean[]; versions: MvccStageVersion[] };

/** projector 가 부르는 무대의 표면. */
export type MvccStage = {
  start(p: MvccStageStart, ms: number): Promise<void>;
  commit(p: MvccStageCommit, ms: number): Promise<void>;
  read(p: MvccStageRead, ms: number): Promise<void>;
  vacuum(p: MvccStageVacuum, ms: number): Promise<void>;
  setCaption(text: string): void;
};

type Card = {
  key: number;
  g: SVGGElement;
  box: SVGRectElement;
  valueText: SVGTextElement;
  rangeText: SVGTextElement;
  link: SVGLineElement;
  currentTag: SVGTextElement;
  current: boolean;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

function cardX(index: number): number {
  return CARD_X0 + index * CARD_STEP;
}

function rangeLabel(v: MvccStageVersion): string {
  return `[${v.start}, ${v.end === 0 ? '∞' : v.end})`;
}

export const mvccStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const monoPx = parseFloat(fontSizes.md);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || isInstant() || ms <= 0) {
          resolve();
          return;
        }
        const done = () => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });

    const releaseAll = () => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    params.onScrubStart?.(releaseAll);

    /** transform 을 옮긴다 — 즉시 모드면 transition 없이. */
    const place = (node: SVGElement, x: number, y: number, ms: number, opacity = 1) => {
      node.style.transition =
        isInstant() || ms <= 0 ? 'none' : `transform ${ms}ms ease-in-out, opacity ${ms}ms ease-in-out`;
      node.style.transform = `translate(${x}px, ${y}px)`;
      node.style.opacity = String(opacity);
    };
    /** 새로 만든 요소를 처음 자리에 박고 다음 transition 이 먹게 한다. */
    const pin = (node: SVGElement, x: number, y: number, opacity: number) => {
      place(node, x, y, 0, opacity);
      node.getBoundingClientRect();
    };

    // ── 배경 · 캡션
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
    const caption = el(
      'text',
      { x: 20, y: 30, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md },
      svg,
    );
    const rowLabel = el(
      'text',
      {
        x: 20,
        y: CARD_Y + CARD_H / 2 + 5,
        fill: c.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': 600,
      },
      svg,
    );

    // ── 스냅샷 선 — 카드 뒤에 둔다. 카드 위아래로만 보이고 카드 글자를 가리지 않는다
    const line = el('g', {}, svg);
    const lineBar = el(
      'line',
      { x1: 0, y1: LINE_TOP, x2: 0, y2: LINE_BOTTOM, stroke: c.itemActive, 'stroke-width': 3 },
      line,
    );
    const lineLabel = el(
      'text',
      {
        x: 0,
        y: LINE_TOP - 8,
        'text-anchor': 'middle',
        fill: c.itemActive,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
      },
      line,
    );
    let lineKey: number | null = null;
    let lineSnap = 0;
    let lineShown = false;
    let lineHeld = false;
    let lineAt = { x: 0, y: 0, opacity: 0 };
    line.style.opacity = '0';
    const moveLine = (x: number, y: number, ms: number, opacity: number) => {
      if (!lineShown) {
        pin(line, x, 0, 0);
        lineShown = true;
      }
      lineAt = { x, y, opacity };
      place(line, x, y, ms, opacity);
    };

    const styleLine = (state: 'held' | 'released') => {
      const color = state === 'held' ? c.itemActive : c.textMuted;
      lineBar.setAttribute('stroke', color);
      lineBar.setAttribute('stroke-width', state === 'held' ? '3' : '2');
      if (state === 'held') lineBar.removeAttribute('stroke-dasharray');
      else lineBar.setAttribute('stroke-dasharray', '5 4');
      lineLabel.setAttribute('fill', color);
      lineLabel.textContent =
        state === 'held'
          ? t('label.snapshot', 'Snapshot {tick}', { tick: lineSnap })
          : t('label.snapshotReleased', 'Snapshot {tick} released', { tick: lineSnap });
    };

    const chainLayer = el('g', {}, svg);

    // ── 읽는 이와 읽기 칸
    el(
      'rect',
      {
        x: READER_X,
        y: SLOT_Y,
        width: READER_W,
        height: SLOT_H,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.border,
      },
      svg,
    );
    const readerName = el(
      'text',
      {
        x: READER_X + READER_W / 2,
        y: SLOT_Y + SLOT_H / 2 + 6,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': 600,
      },
      svg,
    );
    const slotTitles = [t('label.firstRead', 'First read'), t('label.secondRead', 'Second read')];
    const slotValues: SVGTextElement[] = [];
    SLOT_X.forEach((x, i) => {
      el('rect', { x, y: SLOT_Y, width: SLOT_W, height: SLOT_H, rx: 6, fill: c.bg, stroke: c.border }, svg);
      const title = el(
        'text',
        { x: x + 12, y: SLOT_Y + 20, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm },
        svg,
      );
      title.textContent = slotTitles[i];
      slotValues.push(
        el(
          'text',
          {
            x: x + 12,
            y: SLOT_Y + 50,
            fill: c.text,
            'font-family': fonts.body,
            'font-size': fontSizes.md,
          },
          svg,
        ),
      );
    });
    const clearSlots = () => {
      for (const s of slotValues) s.textContent = '—';
    };
    clearSlots();

    // ── 판 카드
    const cards = new Map<number, Card>();
    let order: number[] = [];

    const makeCard = (v: MvccStageVersion): Card => {
      const g = el('g', {}, chainLayer);
      const link = el(
        'line',
        {
          x1: -CARD_STEP + CARD_W,
          y1: CARD_H / 2,
          x2: 0,
          y2: CARD_H / 2,
          stroke: c.border,
          'stroke-width': 2,
        },
        g,
      );
      const box = el('rect', { x: 0, y: 0, width: CARD_W, height: CARD_H, rx: 8, fill: c.bgSubtle, stroke: c.border }, g);
      const valueText = el(
        'text',
        {
          x: CARD_W / 2,
          y: 32,
          'text-anchor': 'middle',
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 600,
        },
        g,
      );
      valueText.textContent = String(v.value);
      const rangeText = el(
        'text',
        {
          x: CARD_W / 2,
          y: 56,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        },
        g,
      );
      const currentTag = el(
        'text',
        {
          x: CARD_W / 2,
          y: CARD_H + 18,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        },
        g,
      );
      currentTag.textContent = t('label.current', 'current version');
      const card: Card = { key: v.start, g, box, valueText, rangeText, link, currentTag, current: false };
      cards.set(v.start, card);
      return card;
    };

    const paintCard = (card: Card, v: MvccStageVersion, index: number) => {
      card.valueText.textContent = String(v.value);
      card.rangeText.textContent = rangeLabel(v);
      const current = v.end === 0;
      card.current = current;
      strokeCard(card);
      card.currentTag.style.opacity = current ? '1' : '0';
      card.link.style.opacity = index === 0 ? '0' : '1';
    };

    /** 테두리 — 쥔 스냅샷이 보는 판은 스냅샷 색, 지금 판은 굵게. */
    function strokeCard(card: Card) {
      const seen = lineHeld && card.key === lineKey;
      card.box.setAttribute('stroke', seen ? c.itemActive : card.current ? c.primary : c.border);
      card.box.setAttribute('stroke-width', seen || card.current ? '2' : '1');
    }
    const strokeAll = () => {
      for (const card of cards.values()) strokeCard(card);
    };

    const cardOf = (key: number): Card => {
      const card = cards.get(key);
      if (!card) throw new Error(`[mvcc-stage] 시작 틱 ${key} 의 판이 사슬에 없다`);
      return card;
    };

    const lineX = (index: number) => cardX(index) + CARD_W / 2;

    /** 사슬을 versions 차례로 세운다 — 있는 카드는 옮기고, 없는 카드는 오른쪽에서 붙인다. */
    const layChain = (versions: MvccStageVersion[], ms: number) => {
      order = versions.map((v) => v.start);
      versions.forEach((v, i) => {
        let card = cards.get(v.start);
        if (!card) {
          card = makeCard(v);
          pin(card.g, cardX(i) + CARD_STEP * 0.6, CARD_Y, 0);
        }
        paintCard(card, v, i);
        place(card.g, cardX(i), CARD_Y, ms, 1);
      });
      if (lineKey !== null && order.includes(lineKey)) {
        moveLine(lineX(order.indexOf(lineKey)), 0, ms, lineAt.opacity);
      }
    };

    const stage: MvccStage = {
      async start(p, ms) {
        if (p.versions.length !== 1) throw new Error('[mvcc-stage] 처음 판은 하나여야 한다');
        rowLabel.textContent = p.row;
        readerName.textContent = p.reader;
        clearSlots();
        const first = p.versions[0];
        // 앞 재생의 판들이 처음 판 자리로 접혀 들어간다.
        const leaving = [...cards.values()].filter((card) => card.key !== first.start);
        for (const card of leaving) place(card.g, cardX(0), CARD_Y, ms, 0);
        // 앞 판의 스냅샷 선은 새 판의 어느 판도 보지 않았다 — 판 위에 남기지 않고 숨긴다.
        // 자리는 그대로 두어, 첫 읽기에서 지난 자리부터 새 자리로 옮겨 가게 한다.
        lineHeld = false;
        if (lineShown) moveLine(lineAt.x, 0, ms, 0);
        lineKey = null;
        layChain(p.versions, ms);
        await wait(ms);
        for (const card of leaving) {
          card.g.remove();
          cards.delete(card.key);
        }
      },

      async commit(p, ms) {
        layChain(p.versions, ms);
        await wait(ms);
      },

      async read(p, ms) {
        if (p.index < 0 || p.index >= order.length) {
          throw new Error(`[mvcc-stage] 읽은 판 자리 ${p.index} 가 사슬 밖이다`);
        }
        const key = order[p.index];
        const card = cardOf(key);
        lineSnap = p.snap;
        lineKey = key;
        lineHeld = true;
        styleLine('held');
        strokeAll();
        const half = ms / 2;
        moveLine(lineX(p.index), 0, half, 1);
        await wait(half);
        // 보이는 판의 값이 읽기 칸으로 내려온다.
        const slot = p.which - 1;
        const token = el('g', {}, svg);
        el(
          'rect',
          { x: 0, y: 0, width: CARD_W, height: 34, rx: 6, fill: c.bg, stroke: c.itemActive, 'stroke-width': 2 },
          token,
        );
        const tokenText = el(
          'text',
          {
            x: CARD_W / 2,
            y: 23,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 600,
          },
          token,
        );
        tokenText.textContent = card.valueText.textContent;
        pin(token, cardX(p.index), CARD_Y + 18, 1);
        const valueWidth = slotValueText(p).length * monoPx * 0.6;
        place(token, SLOT_X[slot] + 12 + Math.min(valueWidth, SLOT_W - CARD_W - 24), SLOT_Y + 28, half, 1);
        await wait(half);
        token.remove();
        slotValues[slot].textContent = slotValueText(p);
        if (!p.held) {
          styleLine('released');
          lineHeld = false;
          strokeAll();
          moveLine(lineX(p.index), 0, 0, 0.8);
        }
      },

      async vacuum(p, ms) {
        if (p.kept.length !== order.length) throw new Error('[mvcc-stage] 청소 표시의 길이가 사슬과 다르다');
        const half = ms / 2;
        const dropped: Card[] = [];
        p.kept.forEach((keep, i) => {
          if (keep) return;
          const card = cardOf(order[i]);
          card.box.setAttribute('stroke', c.danger);
          place(card.g, cardX(i), CARD_Y + DROP, half, 0);
          dropped.push(card);
        });
        if (lineKey !== null && dropped.some((card) => card.key === lineKey)) {
          moveLine(lineX(order.indexOf(lineKey)), DROP, half, 0);
          lineKey = null;
        }
        await wait(half);
        for (const card of dropped) {
          card.g.remove();
          cards.delete(card.key);
        }
        layChain(p.versions, half);
        await wait(half);
      },

      setCaption(text) {
        caption.textContent = text;
      },
    };

    function slotValueText(p: MvccStageRead): string {
      return t('label.readValue', 'tick {tick} · snapshot {snap} → {value}', {
        tick: p.tick,
        snap: p.snap,
        value: p.value,
      });
    }

    return {
      ...stage,
      destroy() {
        destroyed = true;
        releaseAll();
        cards.clear();
      },
    };
  },
};
