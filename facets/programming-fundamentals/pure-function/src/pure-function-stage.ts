/**
 * 순수와 차례의 무대.
 *
 * 세 줄로 선다.
 *   위   집 — 원본 목록이 사는 자리 (점선 테두리). 원본 막대 판이 평소 여기 있다
 *   가운데 부르기 상자 셋 — 이 판의 차례대로 자리 1 · 2 · 3 에 줄을 선다. 차례를 바꾸면 미끄러져 자리를 바꾼다
 *   아래 결과 카드 셋 — 부르기 이름(A · B · C) 자리에 붙박여 있다. 차례를 바꿔도 같은 부르기의 카드끼리 견준다
 *
 * 고치기에서는 원본 막대 판 **그 자체**가 집을 떠나 상자에서 상자로 건너가고(집과 상자를 잇는 선이 선다),
 * 칸 막대가 차례대로 늘고 곱해진다. 새로 만들기에서는 원본이 집에 머물고, 부를 때마다 사본 판이 원본에서
 * 떨어져 나와 상자로 들어갔다가 합을 돌려준 뒤 걷힌다.
 *
 * 움직임은 attribute 를 rAF 로 잇는다 — 끝 상태가 늘 attribute 에 남아 정지 화면에서도 같다.
 * 길이는 projector 가 부를 때마다 재생 속도를 읽어 넘긴다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';

export type PureFunctionStageCall = { name: string; slot: number; mul: number; add: number };

export type PureFunctionStage = ViewInstance & {
  round(
    p: {
      order: number[];
      copyMode: boolean;
      values: number[];
      peak: number;
      calls: PureFunctionStageCall[];
    },
    dur: number,
  ): void;
  call(p: { call: number; position: number; copyMode: boolean }, dur: number): void;
  copy(p: { call: number; values: number[] }, dur: number): void;
  write(p: { call: number; slot: number; values: number[]; copyMode: boolean }, dur: number): void;
  sum(p: { call: number; sum: number }, dur: number): void;
  done(p: { values: number[]; sum: number }, dur: number): void;
  caption(text: string): void;
  reset(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 410;

const CAPTION_Y = 26;
const PANEL_W = 132;
const PANEL_H = 100;
const HOME_X = (W - PANEL_W) / 2;
const HOME_Y = 42;
const SLOT_X = [150, 360, 570];
const POS_Y = 158;
const BOX_W = 190;
const BOX_Y = 166;
const BOX_H = 150;
const IN_BOX_Y = BOX_Y + 42;
const ROW_LABEL_Y = 336;
const CARD_W = 130;
const CARD_Y = 344;
const CARD_H = 56;

const BAR_W = 28;
const BAR_GAP = 14;
const BAR_BASE = 78;
const BAR_MAX = 44;
const PANEL_PAD = (PANEL_W - (3 * BAR_W + 2 * BAR_GAP)) / 2;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

// ─── 움직임 — attribute 를 이어 바꾼다 ────────────────────────────────────────

const running = new WeakMap<Element, Map<string, () => void>>();

/** from → to 로 수 몇 개를 dur 동안 잇고, 매 틀마다 apply 한다. 같은 요소 · 같은 key 의 앞 움직임은 끊는다. */
function tween(
  node: Element,
  key: string,
  from: number[],
  to: number[],
  dur: number,
  apply: (vals: number[]) => void,
  onEnd?: () => void,
): void {
  const byKey = running.get(node) ?? new Map<string, () => void>();
  running.set(node, byKey);
  byKey.get(key)?.();
  const finish = () => {
    apply(to);
    onEnd?.();
  };
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : undefined;
  if (dur <= 0 || raf === undefined) {
    byKey.delete(key);
    finish();
    return;
  }
  let stopped = false;
  const started = performance.now();
  const timer = setTimeout(() => {
    if (stopped) return;
    stopped = true;
    byKey.delete(key);
    finish();
  }, dur + 30);
  byKey.set(key, () => {
    stopped = true;
    clearTimeout(timer);
    apply(to);
  });
  const frame = (now: number) => {
    if (stopped) return;
    const u = Math.min(1, (now - started) / dur);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    if (u >= 1) {
      stopped = true;
      clearTimeout(timer);
      byKey.delete(key);
      finish();
      return;
    }
    apply(from.map((f, i) => f + (to[i]! - f) * e));
    raf(frame);
  };
  raf(frame);
}

function readTranslate(node: Element): [number, number] {
  const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(node.getAttribute('transform') ?? '');
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

function moveTo(node: Element, x: number, y: number, dur: number, onEnd?: () => void): void {
  const [fx, fy] = readTranslate(node);
  tween(
    node,
    'move',
    [fx, fy],
    [x, y],
    dur,
    ([a, b]) => node.setAttribute('transform', `translate(${a!.toFixed(1)} ${b!.toFixed(1)})`),
    onEnd,
  );
}

function fade(node: Element, to: number, dur: number, onEnd?: () => void): void {
  const from = Number(node.getAttribute('opacity') ?? '1');
  tween(node, 'fade', [from], [to], dur, ([o]) => node.setAttribute('opacity', o!.toFixed(2)), onEnd);
}

// ─── 막대 판 — 목록 하나 ────────────────────────────────────────────────────

type Panel = {
  g: SVGGElement;
  frame: SVGRectElement;
  bars: SVGRectElement[];
  vals: SVGTextElement[];
  values: number[];
};

export const pureFunctionStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const palette: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const sm = parseFloat(fontSizes.sm);

    const root = el('g');
    svg.appendChild(root);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.lg,
      'font-weight': 600,
      fill: palette.text,
    });
    root.appendChild(caption);

    // 집 — 원본이 사는 자리
    const home = el('rect', {
      x: HOME_X - 8,
      y: HOME_Y - 8,
      width: PANEL_W + 16,
      height: PANEL_H + 16,
      rx: 10,
      fill: 'none',
      stroke: palette.border,
      'stroke-width': 1.5,
      'stroke-dasharray': '5 4',
    });
    root.appendChild(home);

    const tether = el('path', {
      fill: 'none',
      stroke: palette.textMuted,
      'stroke-width': 1.5,
      'stroke-dasharray': '4 4',
      opacity: 0,
    });
    root.appendChild(tether);

    // 자리 번호 1 · 2 · 3 — 몇 번째 부르기인지는 상자가 선 자리가 말한다
    SLOT_X.forEach((x, i) => {
      const n = el('text', {
        x,
        y: POS_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      });
      n.textContent = String(i + 1);
      root.appendChild(n);
    });

    const rowLabel = el('text', {
      x: 16,
      y: ROW_LABEL_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: palette.textMuted,
    });
    rowLabel.textContent = tr('label.returned', 'Returned');
    root.appendChild(rowLabel);

    const boxLayer = el('g');
    const linkLayer = el('g');
    const cardLayer = el('g');
    const panelLayer = el('g');
    root.append(boxLayer, linkLayer, cardLayer, panelLayer);

    let calls: PureFunctionStageCall[] = [];
    let tones: readonly string[] = [];
    let peak = 1;
    let boxes: { g: SVGGElement; frame: SVGRectElement }[] = [];
    let cards: { g: SVGGElement; frame: SVGRectElement; value: SVGTextElement | null }[] = [];
    let slotOf: number[] = [];
    let original: Panel | null = null;
    let copies: Panel[] = [];
    let away = false;

    const barHeight = (value: number) => Math.max(2, (Math.max(0, value) / Math.max(1, peak)) * BAR_MAX);

    const makePanel = (values: number[], isCopy: boolean): Panel => {
      const g = el('g');
      const frame = el('rect', {
        x: 0,
        y: 0,
        width: PANEL_W,
        height: PANEL_H,
        rx: 8,
        fill: palette.bg,
        stroke: isCopy ? palette.textMuted : palette.text,
        'stroke-width': 1.5,
        ...(isCopy ? { 'stroke-dasharray': '4 3' } : {}),
      });
      g.appendChild(frame);
      const label = el('text', {
        x: 8,
        y: 14,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      });
      label.textContent = isCopy ? tr('label.copy', 'Copy') : tr('label.original', 'Original');
      g.appendChild(label);
      const bars: SVGRectElement[] = [];
      const vals: SVGTextElement[] = [];
      values.forEach((value, i) => {
        const x = PANEL_PAD + i * (BAR_W + BAR_GAP);
        const h = barHeight(value);
        const bar = el('rect', {
          x,
          y: BAR_BASE - h,
          width: BAR_W,
          height: h,
          rx: 3,
          fill: isCopy ? palette.bgSubtle : palette.itemDefault,
          stroke: palette.text,
          'stroke-width': 1.2,
        });
        const val = el('text', {
          x: x + BAR_W / 2,
          y: BAR_BASE - h - 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: palette.text,
        });
        val.textContent = String(value);
        const idx = el('text', {
          x: x + BAR_W / 2,
          y: BAR_BASE + sm + 2,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: palette.textMuted,
        });
        idx.textContent = String(i);
        g.append(bar, val, idx);
        bars.push(bar);
        vals.push(val);
      });
      return { g, frame, bars, vals, values: [...values] };
    };

    const setBars = (panel: Panel, values: number[], dur: number, mark: number | null) => {
      values.forEach((value, i) => {
        const bar = panel.bars[i];
        const val = panel.vals[i];
        if (bar === undefined || val === undefined) return;
        const fromH = Number(bar.getAttribute('height') ?? '0');
        const toH = barHeight(value);
        tween(bar, 'height', [fromH], [toH], dur, ([h]) => {
          bar.setAttribute('y', (BAR_BASE - h!).toFixed(1));
          bar.setAttribute('height', h!.toFixed(1));
          val.setAttribute('y', (BAR_BASE - h! - 4).toFixed(1));
        });
        val.textContent = String(value);
        bar.setAttribute('fill', i === mark ? palette.accent : palette.itemDefault);
      });
      panel.values = [...values];
    };

    const boxPanelPos = (slot: number): [number, number] => [SLOT_X[slot]! - PANEL_W / 2, IN_BOX_Y];

    const markText = (c: PureFunctionStageCall): string => {
      if (c.mul !== 1 && c.add !== 0) {
        return tr('mark.mulAdd', 'slot {slot} ×{mul} +{add}', { slot: c.slot, mul: c.mul, add: c.add });
      }
      if (c.mul !== 1) return tr('mark.mul', 'slot {slot} ×{mul}', { slot: c.slot, mul: c.mul });
      return tr('mark.add', 'slot {slot} +{add}', { slot: c.slot, add: c.add });
    };

    const build = (next: PureFunctionStageCall[], cart: number[]) => {
      calls = next;
      tones = categorical(Math.max(1, calls.length), 'vivid');
      boxLayer.replaceChildren();
      cardLayer.replaceChildren();
      linkLayer.replaceChildren();
      panelLayer.replaceChildren();
      boxes = calls.map((c, i) => {
        const g = el('g', { transform: `translate(${SLOT_X[i] ?? 0} ${BOX_Y})` });
        const frame = el('rect', {
          x: -BOX_W / 2,
          y: 0,
          width: BOX_W,
          height: BOX_H,
          rx: 12,
          fill: palette.bgSubtle,
          stroke: tones[i] ?? palette.border,
          'stroke-width': 1.5,
        });
        const name = el('text', {
          x: -BOX_W / 2 + 14,
          y: 26,
          'font-family': fonts.body,
          'font-size': fontSizes.xl,
          'font-weight': 700,
          fill: tones[i] ?? palette.text,
        });
        name.textContent = c.name;
        const mark = el('text', {
          x: BOX_W / 2 - 14,
          y: 25,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: palette.text,
        });
        mark.textContent = markText(c);
        g.append(frame, name, mark);
        boxLayer.appendChild(g);
        return { g, frame };
      });
      cards = calls.map((c, i) => {
        const x = SLOT_X[i] ?? 0;
        const g = el('g', { transform: `translate(${x - CARD_W / 2} ${CARD_Y})` });
        const frame = el('rect', {
          x: 0,
          y: 0,
          width: CARD_W,
          height: CARD_H,
          rx: 8,
          fill: palette.bg,
          stroke: tones[i] ?? palette.border,
          'stroke-width': 1.5,
        });
        const name = el('text', {
          x: 10,
          y: 18,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: tones[i] ?? palette.text,
        });
        name.textContent = c.name;
        g.append(frame, name);
        cardLayer.appendChild(g);
        return { g, frame, value: null };
      });
      slotOf = calls.map((_, i) => i);
      original = makePanel(cart, false);
      original.g.setAttribute('transform', `translate(${HOME_X} ${HOME_Y})`);
      panelLayer.appendChild(original.g);
      copies = [];
      away = false;
    };

    const clearLinks = () => {
      linkLayer.replaceChildren();
    };

    const dropCopies = (dur: number) => {
      for (const c of copies) {
        const [x, y] = readTranslate(c.g);
        moveTo(c.g, x, y + 24, dur);
        fade(c.g, 0, dur, () => c.g.remove());
      }
      copies = [];
    };

    const showTether = (slot: number) => {
      const x2 = SLOT_X[slot] ?? W / 2;
      tether.setAttribute(
        'd',
        `M ${W / 2} ${HOME_Y + PANEL_H + 8} C ${W / 2} ${POS_Y}, ${x2} ${HOME_Y + PANEL_H + 20}, ${x2} ${IN_BOX_Y}`,
      );
      tether.setAttribute('opacity', '1');
    };

    const hideTether = () => {
      tether.setAttribute('opacity', '0');
    };

    const highlightBox = (slot: number | null) => {
      boxes.forEach((b, i) => {
        const on = slot !== null && slotOf[i] === slot;
        b.frame.setAttribute('stroke-width', on ? '3' : '1.5');
        b.frame.setAttribute('fill', on ? palette.bg : palette.bgSubtle);
      });
    };

    const initial = params.initialData;
    if (initial && Array.isArray(initial.calls) && Array.isArray(initial.cart)) {
      const initCalls = (initial.calls as unknown[]).flatMap((c) => {
        if (typeof c !== 'object' || c === null) return [];
        const r = c as Record<string, unknown>;
        return typeof r.name === 'string' &&
          typeof r.slot === 'number' &&
          typeof r.mul === 'number' &&
          typeof r.add === 'number'
          ? [{ name: r.name, slot: r.slot, mul: r.mul, add: r.add }]
          : [];
      });
      const cart = (initial.cart as unknown[]).filter((x): x is number => typeof x === 'number');
      peak = Math.max(1, ...cart);
      build(initCalls, cart);
    }

    const stage: PureFunctionStage = {
      round(p, dur) {
        peak = Math.max(1, p.peak);
        if (calls.length !== p.calls.length || original === null) build(p.calls, p.values);
        dropCopies(dur);
        clearLinks();
        hideTether();
        highlightBox(null);
        // 상자가 이 판의 차례로 줄을 선다
        p.order.forEach((k, pos) => {
          slotOf[k] = pos;
          const box = boxes[k];
          if (box) moveTo(box.g, SLOT_X[pos] ?? 0, BOX_Y, dur);
        });
        // 원본은 집으로 돌아와 cart 값으로 되돌아간다
        if (original) {
          moveTo(original.g, HOME_X, HOME_Y, dur);
          setBars(original, p.values, dur, null);
          original.frame.setAttribute('stroke-width', '1.5');
        }
        away = false;
        home.setAttribute('stroke', palette.border);
        // 앞 판의 결과는 흐리게 남는다 — 새 수가 오면 갈아 탄다
        for (const c of cards) {
          c.value?.setAttribute('fill', palette.textMuted);
          c.frame.setAttribute('stroke-width', '1.5');
        }
      },
      call(p, dur) {
        dropCopies(dur);
        clearLinks();
        const slot = slotOf[p.call] ?? p.position;
        highlightBox(slot);
        if (!p.copyMode && original) {
          // 고치기 — 원본 판 그 자체가 상자로 건너간다
          const [x, y] = boxPanelPos(slot);
          moveTo(original.g, x, y, dur);
          setBars(original, original.values, 0, null);
          showTether(slot);
          away = true;
        } else {
          hideTether();
          if (away && original) moveTo(original.g, HOME_X, HOME_Y, dur);
          away = false;
        }
      },
      copy(p, dur) {
        // 새로 만들기 — 원본 자리에서 사본이 떨어져 나와 상자로 들어간다
        const panel = makePanel(p.values, true);
        panel.g.setAttribute('transform', `translate(${HOME_X} ${HOME_Y})`);
        panelLayer.appendChild(panel.g);
        copies.push(panel);
        const slot = slotOf[p.call] ?? 0;
        const [x, y] = boxPanelPos(slot);
        moveTo(panel.g, x, y, dur);
      },
      write(p, dur) {
        const panel = p.copyMode ? copies[copies.length - 1] : original;
        if (!panel) return;
        setBars(panel, p.values, dur, p.slot);
      },
      sum(p, dur) {
        const card = cards[p.call];
        if (!card) return;
        const slot = slotOf[p.call] ?? 0;
        clearLinks();
        const link = el('path', {
          d: `M ${SLOT_X[slot] ?? 0} ${BOX_Y + BOX_H} L ${SLOT_X[p.call] ?? 0} ${CARD_Y}`,
          fill: 'none',
          stroke: tones[p.call] ?? palette.text,
          'stroke-width': 2,
        });
        linkLayer.appendChild(link);
        for (const c of cards) c.frame.setAttribute('stroke-width', '1.5');
        card.frame.setAttribute('stroke-width', '3');
        // 앞 수는 위로 빠지고 새 수가 밑에서 올라와 갈아 탄다
        const old = card.value;
        if (old) {
          const [ox, oy] = readTranslate(old);
          moveTo(old, ox, oy - 14, dur);
          fade(old, 0, dur, () => old.remove());
        }
        const value = el('text', {
          x: CARD_W / 2,
          y: 44,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 700,
          fill: palette.text,
          transform: 'translate(0 14)',
          opacity: 0,
        });
        value.textContent = String(p.sum);
        card.g.appendChild(value);
        card.value = value;
        moveTo(value, 0, 0, dur);
        fade(value, 1, dur);
      },
      done(p, dur) {
        dropCopies(dur);
        clearLinks();
        hideTether();
        highlightBox(null);
        for (const c of cards) c.frame.setAttribute('stroke-width', '1.5');
        if (original) {
          moveTo(original.g, HOME_X, HOME_Y, dur);
          setBars(original, p.values, dur, null);
          original.frame.setAttribute('stroke-width', '3');
        }
        away = false;
        home.setAttribute('stroke', palette.text);
      },
      caption(text) {
        caption.textContent = text;
      },
      reset() {
        caption.textContent = '';
        dropCopies(0);
        clearLinks();
        hideTether();
        highlightBox(null);
        for (const c of cards) {
          c.value?.remove();
          c.value = null;
          c.frame.setAttribute('stroke-width', '1.5');
        }
        if (original) {
          original.g.setAttribute('transform', `translate(${HOME_X} ${HOME_Y})`);
          original.frame.setAttribute('stroke-width', '1.5');
        }
        away = false;
        home.setAttribute('stroke', palette.border);
      },
      destroy() {
        root.remove();
      },
    };
    return stage;
  },
};
