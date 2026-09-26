/**
 * 격리 수준과 잠금 — 무대.
 *
 * 왼쪽은 **실행 차례** 한 줄 기둥이다. 칸 차례는 알고리즘이 준다 — 실행된 연산이 위에서부터 그 차례대로, 아직
 * 남은 연산이 그 아래에 적힌 차례대로 선다. 한 걸음에 실행되는 연산이 막힌 연산을 앞질러 올라서면 막힌 연산이
 * 한 칸 **밀려 내려간다**. 수준을 올리면 그 밀림이 판 내내 되풀이된다.
 * 가운데는 관찰자(T1)가 쥔 잠금의 **띠** — 잡은 걸음에서 놓는 걸음까지 늘어난다. 앞 판의 띠는 점선으로 남아
 * 새 판의 띠가 그보다 길어지는지 짧아지는지 견준다. 오른쪽은 줄과 표 — 값 · 확정 안 된 쓰기 · 누가 무슨 잠금을 쥐었나.
 *
 * 무대는 셈하지 않는다 — 칸 차례 · 기다림 · 띠 · 범위에 드는 줄 · 이상 여부 모두 받은 것을 그린다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StageHolder = { tx: string; mode: 'S' | 'X' };
export type StageEffect =
  | { kind: 'read'; value: number }
  | { kind: 'query'; ids: number[] }
  | { kind: 'lock'; target: string }
  | { kind: 'commit' }
  | { kind: 'abort' };
export type StageFrame = {
  step: number;
  levelName: string;
  observer: string;
  txs: string[];
  ops: { label: string; tx: string }[];
  order: number[];
  ran: number;
  effects: (StageEffect | null)[];
  waiting: { op: number; blocker: string; mode: 'S' | 'X' | 'range'; key: string; target: string }[];
  spans: { key: string; label: string; from: number; to: number; momentary: boolean }[];
  held: number;
  rows: { name: string; value: number; pendingTx: string | null; pendingValue: number; holders: StageHolder[] }[];
  table: {
    name: string;
    columns: string[];
    rows: { id: number; amount: number; pendingTx: string | null; inRange: boolean; holders: StageHolder[] }[];
  };
  rangeHolder: string | null;
  touched: string[];
  anomalies: { dirty: boolean; nonRepeatable: boolean; phantom: boolean };
  reads: { target: string; values: number[] }[];
  queries: number[][];
  sql: string;
  queryLabel: string | null;
};

export type IsolationStageApi = {
  showStep(frame: StageFrame, motionMs: number): void;
  reset(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 780;
const H = 512;
const MAX_SLOTS = 13;
const SLOT_Y0 = 98;
const ROW_H = 26;
const STEP_X = 34;
const CHIP_X = 42;
const CHIP_W = 112;
const CHIP_H = 20;
const WAIT_NUDGE = 10;
const EFFECT_X = CHIP_X + CHIP_W + WAIT_NUDGE + 8;
const LANE_X0 = 336;
const LANE_W = 30;
const MAX_LANES = 8;
const SPAN_W = 12;
const PANEL_X = 598;
const PANEL_RIGHT = W - 10;
const CAPTION_Y = 462;
const CAPTION_GAP = 20;

const SM = parseFloat(fontSizes.sm);

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function text(
  parent: Element,
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number> = {},
): SVGTextElement {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = content;
  return node;
}

const slotTop = (slot: number): number => SLOT_Y0 + slot * ROW_H;

type Chip = {
  g: SVGGElement;
  body: SVGRectElement;
  strip: SVGRectElement;
  label: SVGTextElement;
  effect: SVGTextElement;
};

export const isolationStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    const root = el('g', {}, svg);
    root.setAttribute('font-family', fonts.body);

    // 머리 — 수준 이름 · 이상 표지 셋 · 질의 SQL
    const levelText = text(root, 16, 30, '', { 'font-size': fontSizes.xl, 'font-weight': 700, fill: c.text, 'font-family': fonts.mono });
    const sqlText = text(root, 16, 56, '', { 'font-size': fontSizes.sm, fill: c.textMuted, 'font-family': fonts.mono });
    const badgeLabels = [
      t('label.dirty', 'Dirty read'),
      t('label.nonRepeatable', 'Non-repeatable'),
      t('label.phantom', 'Phantom'),
    ];
    const BADGE_W = 118;
    const badges = badgeLabels.map((label, i) => {
      const x = W - 10 - (3 - i) * (BADGE_W + 6) + 6;
      const g = el('g', {}, root);
      const rect = el('rect', { x, y: 12, width: BADGE_W, height: 24, rx: 12, fill: c.bg, stroke: c.border }, g);
      const tx = text(g, x + BADGE_W / 2, 28, label, { 'text-anchor': 'middle', 'font-size': fontSizes.sm, fill: c.textMuted });
      return { rect, tx };
    });

    // 기둥 머리
    const execHead = text(root, CHIP_X, 80, t('label.execOrder', 'Execution order'), { 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text });
    const lockHead = text(root, LANE_X0, 80, '', { 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text });
    const heldText = text(root, LANE_X0 + LANE_W * MAX_LANES, 80, '', { 'font-size': fontSizes.xs, fill: c.textMuted, 'text-anchor': 'end' });
    const rowsHead = text(root, PANEL_X, 80, t('label.rows', 'Rows'), { 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text });
    execHead.setAttribute('data-role', 'head');
    rowsHead.setAttribute('data-role', 'head');

    // 걸음 번호 칸 · 칸 줄무늬
    const slotLayer = el('g', {}, root);
    const cursor = el('rect', { x: 8, y: slotTop(0), width: LANE_X0 + LANE_W * MAX_LANES - 8, height: ROW_H, rx: 4, fill: c.accent, 'fill-opacity': 0.18, opacity: 0 }, slotLayer);
    for (let s = 0; s < MAX_SLOTS; s += 1) {
      text(slotLayer, STEP_X - 6, slotTop(s) + ROW_H / 2 + SM / 2 - 1, String(s + 1), { 'text-anchor': 'end', 'font-size': fontSizes.xs, fill: c.textMuted, 'font-family': fonts.mono });
      el('line', { x1: 8, x2: LANE_X0 + LANE_W * MAX_LANES, y1: slotTop(s + 1), y2: slotTop(s + 1), stroke: c.border, 'stroke-opacity': 0.4 }, slotLayer);
    }

    // 잠금 띠
    const laneLayer = el('g', {}, root);
    const ghostLayer = el('g', {}, root);
    const spanLayer = el('g', {}, root);
    const stopLayer = el('g', {}, root);
    const lanes = new Map<string, number>();
    const laneCenter = (i: number): number => LANE_X0 + i * LANE_W + LANE_W / 2;
    const laneOf = (key: string, label: string): number => {
      const have = lanes.get(key);
      if (have !== undefined) return have;
      const i = lanes.size;
      if (i >= MAX_LANES) throw new Error(`[isolation-stage] 잠금 띠 자리가 모자라다: ${key}`);
      lanes.set(key, i);
      el('line', { x1: laneCenter(i), x2: laneCenter(i), y1: slotTop(0), y2: slotTop(MAX_SLOTS), stroke: c.border, 'stroke-dasharray': '2 3' }, laneLayer);
      text(laneLayer, laneCenter(i), 94, label, { 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: c.textMuted, 'font-family': fonts.mono });
      return i;
    };
    const spanRects = new Map<string, SVGRectElement>();

    // 연산 칸
    const chipLayer = el('g', {}, root);
    let chips: Chip[] = [];
    let chipSig = '';
    let txColors = new Map<string, string>();

    // 줄 · 표
    const panel = el('g', {}, root);

    // 캡션
    const captions = [0, 1, 2].map((i) =>
      text(root, 16, CAPTION_Y + i * CAPTION_GAP, '', { 'font-size': i === 0 ? fontSizes.md : fontSizes.sm, fill: i === 0 ? c.text : c.textMuted, 'font-family': fonts.body }),
    );

    let last: StageFrame | null = null;

    const colorOf = (tx: string): string => {
      const col = txColors.get(tx);
      if (col === undefined) throw new Error(`[isolation-stage] 색이 없는 트랜잭션: ${tx}`);
      return col;
    };

    const moveTo = (node: SVGElement, x: number, y: number, ms: number): void => {
      node.style.transition = `transform ${ms}ms ease-in-out`;
      node.style.transform = `translate(${x}px, ${y}px)`;
    };

    const buildChips = (frame: StageFrame): void => {
      const sig = frame.ops.map((o) => `${o.tx}:${o.label}`).join('|');
      if (sig === chipSig) return;
      if (frame.ops.length > MAX_SLOTS) throw new Error(`[isolation-stage] 연산이 칸보다 많다: ${frame.ops.length}`);
      chipSig = sig;
      while (chipLayer.firstChild) chipLayer.removeChild(chipLayer.firstChild);
      const palette = categorical(frame.txs.length, 'vivid');
      txColors = new Map(frame.txs.map((tx, i) => [tx, palette[i]!]));
      chips = frame.ops.map((op, i) => {
        const g = el('g', {}, chipLayer);
        const body = el('rect', { x: 0, y: 0, width: CHIP_W, height: CHIP_H, rx: 4, fill: c.bg, stroke: c.border }, g);
        const strip = el('rect', { x: 0, y: 0, width: 5, height: CHIP_H, rx: 2, fill: colorOf(op.tx) }, g);
        const label = text(g, 12, CHIP_H / 2 + SM / 2 - 1, op.label, { 'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: c.text });
        const effect = text(g, EFFECT_X - CHIP_X, CHIP_H / 2 + SM / 2 - 1, '', { 'font-size': fontSizes.xs, 'font-family': fonts.mono, fill: c.textMuted });
        moveTo(g, CHIP_X, slotTop(i) + (ROW_H - CHIP_H) / 2, 0);
        return { g, body, strip, label, effect };
      });
    };

    const effectText = (e: StageEffect): string => {
      switch (e.kind) {
        case 'read':
          return `→ ${e.value}`;
        case 'query':
          return `→ {${e.ids.join(', ')}}`;
        case 'lock':
          return `X(${e.target})`;
        case 'commit':
          return t('label.commit', 'commit');
        case 'abort':
          return t('label.abort', 'rollback');
      }
    };
    const lockText = (w: StageFrame['waiting'][number]): string =>
      w.mode === 'range' ? t('label.rangeLock', 'range lock') : `${w.mode}(${w.target})`;

    const drawSpans = (frame: StageFrame, ms: number): void => {
      const live = new Set<string>();
      for (const s of frame.spans) {
        const lane = laneOf(s.key, s.label);
        const to = s.to < 0 ? frame.step : s.to;
        const top = slotTop(s.from - 1);
        const y = s.momentary ? top + ROW_H / 2 - 4 : top + 3;
        const h = s.momentary ? 8 : slotTop(to - 1) + ROW_H - 3 - y;
        const id = `${s.key}@${s.from}`;
        live.add(id);
        let r = spanRects.get(id);
        if (!r) {
          r = el('rect', { x: laneCenter(lane) - SPAN_W / 2, y, width: SPAN_W, height: s.momentary ? 8 : ROW_H - 6, rx: 3, fill: colorOf(frame.observer) }, spanLayer);
          if (s.key === 'range') {
            r.setAttribute('fill', c.bg);
            r.setAttribute('stroke', colorOf(frame.observer));
            r.setAttribute('stroke-width', '3');
          }
          spanRects.set(id, r);
        }
        r.style.transition = `height ${ms}ms ease-out`;
        r.setAttribute('height', String(Math.max(4, h)));
        r.style.height = `${Math.max(4, h)}px`;
      }
      for (const [id, r] of [...spanRects]) {
        if (live.has(id)) continue;
        r.remove();
        spanRects.delete(id);
      }
    };

    const drawGhosts = (prev: StageFrame): void => {
      while (ghostLayer.firstChild) ghostLayer.removeChild(ghostLayer.firstChild);
      for (const s of prev.spans) {
        const lane = laneOf(s.key, s.label);
        const to = s.to < 0 ? prev.step : s.to;
        const top = slotTop(s.from - 1);
        const y = s.momentary ? top + ROW_H / 2 - 4 : top + 3;
        const h = s.momentary ? 8 : slotTop(to - 1) + ROW_H - 3 - y;
        el('rect', { x: laneCenter(lane) - SPAN_W / 2 - 3, y, width: SPAN_W + 6, height: Math.max(4, h), rx: 4, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 3' }, ghostLayer);
      }
    };

    const drawPanel = (frame: StageFrame): void => {
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      const touched = new Set(frame.touched);
      const line = (y: number, key: string, cells: [string, number][], holders: StageHolder[], pendingTx: string | null, pendingText: string): void => {
        if (touched.has(key)) {
          el('rect', { x: PANEL_X - 4, y: y - 15, width: PANEL_RIGHT - PANEL_X + 8, height: 20, rx: 3, fill: c.accent, 'fill-opacity': 0.25 }, panel);
        }
        for (const [s, x] of cells) text(panel, x, y, s, { 'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: pendingTx === null ? c.text : colorOf(pendingTx) });
        if (pendingText !== '') text(panel, PANEL_X + 108, y, pendingText, { 'font-size': fontSizes.xs, 'font-family': fonts.mono, fill: pendingTx === null ? c.textMuted : colorOf(pendingTx) });
        let hx = PANEL_RIGHT;
        for (const h of [...holders].reverse()) {
          const label = `${h.mode} ${h.tx}`;
          const w = label.length * SM * 0.62 + 8;
          hx -= w;
          el('rect', { x: hx, y: y - 13, width: w - 2, height: 16, rx: 3, fill: colorOf(h.tx), 'fill-opacity': h.mode === 'X' ? 0.9 : 0.35 }, panel);
          text(panel, hx + (w - 2) / 2, y - 1, label, { 'text-anchor': 'middle', 'font-size': fontSizes.xs, 'font-family': fonts.mono, fill: h.mode === 'X' ? c.textInverse : c.text });
          hx -= 2;
        }
      };
      let y = 106;
      for (const r of frame.rows) {
        line(y, r.name, [[r.name, PANEL_X], [String(r.value), PANEL_X + 54]], r.holders, r.pendingTx, r.pendingTx === null ? '' : `→ ${r.pendingValue} (${r.pendingTx})`);
        y += 24;
      }
      y += 12;
      text(panel, PANEL_X, y, frame.table.name, { 'font-size': fontSizes.sm, 'font-weight': 600, 'font-family': fonts.mono, fill: c.text });
      y += 20;
      const cols = frame.table.columns;
      if (cols.length !== 2) throw new Error(`[isolation-stage] 표의 열이 둘이 아니다: ${cols.length}`);
      text(panel, PANEL_X + 10, y, cols[0]!, { 'font-size': fontSizes.xs, 'font-family': fonts.mono, fill: c.textMuted });
      text(panel, PANEL_X + 54, y, cols[1]!, { 'font-size': fontSizes.xs, 'font-family': fonts.mono, fill: c.textMuted });
      y += 22;
      for (const r of frame.table.rows) {
        const key = `orders:${r.id}`;
        if (frame.rangeHolder !== null && r.inRange) {
          el('rect', { x: PANEL_X - 10, y: y - 15, width: 4, height: 20, rx: 2, fill: colorOf(frame.rangeHolder) }, panel);
        }
        line(y, key, [[String(r.id), PANEL_X + 10], [String(r.amount), PANEL_X + 54]], r.holders, r.pendingTx, r.pendingTx === null ? '' : `(${r.pendingTx})`);
        y += 22;
      }
      if (frame.rangeHolder !== null) {
        text(panel, PANEL_X, y, `${t('label.rangeLock', 'range lock')} · ${frame.rangeHolder}`, { 'font-size': fontSizes.xs, fill: colorOf(frame.rangeHolder) });
      }
    };

    const showStep = (frame: StageFrame, ms: number): void => {
      buildChips(frame);
      if (frame.order.length !== frame.ops.length) throw new Error('[isolation-stage] 칸 차례의 길이가 연산 수와 다르다');

      // 새 판 — 앞 판의 띠를 점선으로 남기고 새 띠를 비운다
      if (frame.step === 0) {
        if (last !== null && last.step > 0) drawGhosts(last);
        for (const r of spanRects.values()) r.remove();
        spanRects.clear();
      }

      levelText.textContent = frame.levelName;
      sqlText.textContent = frame.queryLabel === null ? frame.sql : `${frame.queryLabel}  ${frame.sql}`;
      const lit = [frame.anomalies.dirty, frame.anomalies.nonRepeatable, frame.anomalies.phantom];
      badges.forEach((b, i) => {
        b.rect.style.transition = `fill ${ms}ms, stroke ${ms}ms`;
        b.rect.setAttribute('fill', lit[i] ? c.danger : c.bg);
        b.rect.setAttribute('stroke', lit[i] ? c.danger : c.border);
        b.tx.setAttribute('fill', lit[i] ? c.textInverse : c.textMuted);
        b.rect.setAttribute('data-lit', lit[i] ? '1' : '0');
      });
      lockHead.textContent = t('label.locksOf', 'Locks held by {tx}', { tx: frame.observer });
      heldText.textContent = t('label.held', 'Held now: {n}', { n: frame.held });

      // 칸 — 실행된 것은 실행 차례로, 남은 것은 그 아래 적힌 차례로
      const waitingBy = new Map(frame.waiting.map((w) => [w.op, w]));
      frame.order.forEach((opIndex, slot) => {
        const chip = chips[opIndex];
        if (!chip) throw new Error(`[isolation-stage] 없는 연산 번호: ${opIndex}`);
        const executed = slot < frame.step;
        const w = waitingBy.get(opIndex);
        const x = CHIP_X + (w ? WAIT_NUDGE : 0);
        moveTo(chip.g, x, slotTop(slot) + (ROW_H - CHIP_H) / 2, ms);
        const e = frame.effects[opIndex];
        chip.body.setAttribute('stroke', w ? c.danger : executed ? c.text : c.border);
        chip.body.setAttribute('stroke-width', w ? '2' : '1');
        chip.body.setAttribute('stroke-dasharray', executed || w ? 'none' : '4 3');
        chip.body.setAttribute('fill', executed ? c.bgSubtle : c.bg);
        chip.label.setAttribute('fill', executed || w ? c.text : c.textMuted);
        if (w) {
          chip.effect.textContent = t('label.blocked', 'blocked ← {tx} {lock}', { tx: w.blocker, lock: lockText(w) });
          chip.effect.setAttribute('fill', c.danger);
        } else if (executed && e) {
          chip.effect.textContent = effectText(e);
          chip.effect.setAttribute('fill', c.textMuted);
        } else {
          chip.effect.textContent = '';
        }
      });

      // 걸음 표지
      cursor.style.transition = `transform ${ms}ms ease-in-out, opacity ${ms}ms`;
      cursor.setAttribute('opacity', frame.step > 0 ? '1' : '0');
      cursor.style.transform = `translate(0px, ${Math.max(0, frame.step - 1) * ROW_H}px)`;

      drawSpans(frame, ms);

      // 막힌 연산이 관찰자의 띠 앞에 멈춰 선다
      while (stopLayer.firstChild) stopLayer.removeChild(stopLayer.firstChild);
      for (const w of frame.waiting) {
        if (w.blocker !== frame.observer) continue;
        const lane = lanes.get(w.key);
        if (lane === undefined) throw new Error(`[isolation-stage] 막은 잠금의 띠 자리가 없다: ${w.key}`);
        const slot = frame.order.indexOf(w.op);
        const cy = slotTop(slot) + ROW_H / 2;
        const tip = laneCenter(lane) - SPAN_W / 2 - 2;
        el('path', { d: `M ${tip - 9} ${cy - 5} L ${tip} ${cy} L ${tip - 9} ${cy + 5} Z`, fill: c.danger }, stopLayer);
      }

      drawPanel(frame);

      // 캡션
      if (frame.step === 0 || frame.ran < 0) {
        captions[0]!.textContent = t('caption.start', 'Step 0 · operations as written: {n}', { n: frame.ops.length });
      } else {
        const op = frame.ops[frame.ran];
        if (!op) throw new Error(`[isolation-stage] 없는 연산 번호: ${frame.ran}`);
        const e = frame.effects[frame.ran];
        const opText = e ? `${op.label}  ${effectText(e)}` : op.label;
        captions[0]!.textContent = t('caption.step', 'Step {step}: {op}', { step: frame.step, op: opText });
      }
      captions[1]!.textContent =
        frame.waiting.length === 0
          ? t('caption.noWaiting', 'Waiting: none')
          : t('caption.waiting', 'Waiting: {list}', {
              list: frame.waiting.map((w) => `${frame.ops[w.op]!.label} ← ${w.blocker} ${lockText(w)}`).join(' · '),
            });
      const parts: string[] = frame.reads.map((r) => `${r.target} ${r.values.join(' → ')}`);
      if (frame.queries.length > 0) {
        if (frame.queryLabel === null) throw new Error('[isolation-stage] 질의 결과가 있는데 질의 표기가 없다');
        parts.push(`${frame.queryLabel} ${frame.queries.map((q) => `{${q.join(', ')}}`).join(' → ')}`);
      }
      captions[2]!.textContent =
        parts.length === 0
          ? t('caption.noReads', 'Read by {tx}: nothing yet', { tx: frame.observer })
          : t('caption.reads', 'Read by {tx}: {list}', { tx: frame.observer, list: parts.join(' · ') });

      last = frame;
    };

    const api: IsolationStageApi & ViewInstance = {
      showStep,
      reset(): void {
        last = null;
        for (const r of spanRects.values()) r.remove();
        spanRects.clear();
        while (ghostLayer.firstChild) ghostLayer.removeChild(ghostLayer.firstChild);
      },
      destroy(): void {
        root.remove();
      },
    };
    return api;
  },
};
