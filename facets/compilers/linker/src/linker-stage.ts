/**
 * linker 무대 — 파일 카드 줄 · 기다림 줄 · 주소 띠 셋.
 *
 * 운동:
 *   - 판 머리에서 파일 카드가 새 차례의 자리로 **줄을 바꿔 선다**. 라이브러리 카드는 줄 아래에 비켜 서 있다가
 *     끌려오면 줄 안으로 **들어오고**, 건너뛰면 더 **비켜난다**.
 *   - 해석 걸음마다 기다림 칩이 U 항목에서 **날아와 줄을 늘리고**, 정의를 만나면 D 항목으로 **날아가 빠진다**.
 *     메운 짝은 두 항목 사이에 선이 **이어진다**. 정의 없음이면 남은 칩이 **걸린 채로 가라앉는다**.
 *   - 놓기 걸음마다 절이 카드에서 주소 띠의 새 자리로 **미끄러진다**.
 *   - 고치기 걸음마다 명령의 주소 칸이 셈한 수로 **고쳐 적히고**, 띠 위에 P → S 선이 **뻗는다**
 *     (상대 칸은 두 명령 사이의 호, 절대 칸은 data 띠로 내려가는 선).
 *
 * 무대는 셈을 다시 하지 않는다 — 기다림 · 메움 · 자리 · 고친 수는 payload 로 받는다.
 * 글자 찍기(명령 글자 · 칸 글자)와 절 크기는 algorithm 의 순수 함수를 같이 부른다.
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
import {
  dataSizeOf,
  fieldText,
  instrText,
  readLinkerData,
  textSizeOf,
  type LinkerData,
  type LinkerFile,
  type LinkerRelKind,
} from './algorithm.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 470;

const CARD_W = 220;
const CARD_GAP = 10;
const CARD_X0 = 20;
const CARD_Y = 58;
const CARD_H = 182;
/** 라이브러리 카드가 판정을 기다리며 비켜 선 거리 · 건너뛰어 더 비켜난 거리 */
const LIB_WAIT_DY = 20;
const LIB_SKIP_DY = 40;
const CHIP_W = 70;
const CHIP_H = 18;
const ROW_H = 18;
const TEXT_ROWS_Y = 42;
/** 항목 칩 줄 — D 위 · U 아래. 이음 선은 카드 아래 가장자리에서 나고 든다 */
const DEF_ROW_Y = 136;
const USE_ROW_Y = 158;

const WAIT_Y = 304;
const WAIT_CHIP_W = 72;
const WAIT_CHIP_H = 22;
const WAIT_X0 = 110;
const WAIT_STEP = 82;

const BAND_X0 = 110;
const TEXT_BAND_Y = 370;
const DATA_BAND_Y = 424;
const BAND_H = 26;
/** 바이트 하나의 가로 */
const BYTE_PX = 12;
const ARC_RISE = 26;

export type LinkerStageApi = {
  round(order: string[], names: string[], libs: string[], ms: number): void;
  resolve(
    p: {
      file: string;
      pulled: boolean;
      filled: { sym: string; waiter: string }[];
      direct: { sym: string; definer: string }[];
      added: string[];
      waiting: string[];
    },
    ms: number,
  ): void;
  skip(file: string, ms: number): void;
  missing(names: string[], ms: number): void;
  place(file: string, textAt: number, textSize: number, dataAt: number, dataSize: number, ms: number): void;
  patch(
    p: { file: string; index: number; after: string; site: number; target: number; targetSec: 'text' | 'data'; kind: LinkerRelKind; val: number },
    ms: number,
  ): void;
  caption(title: string, detail: string): void;
  clear(): void;
};

type Pt = { x: number; y: number };

type Card = {
  file: LinkerFile;
  g: SVGGElement;
  frame: SVGRectElement;
  name: SVGTextElement;
  tag: SVGTextElement;
  rows: SVGTextElement[];
  rowHi: SVGRectElement[];
  /** 카드 안 자리 (카드 왼쪽 위 기준) — 칩 가운데 */
  defAt: Map<string, Pt>;
  useAt: Map<string, Pt>;
  defChip: Map<string, SVGRectElement>;
  useChip: Map<string, SVGRectElement>;
  x: number;
  y: number;
  slot: number;
  dy: number;
};

type Anim = { id: number; finish: () => void };

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** 2 차 곡선의 앞 k 만큼 (de Casteljau) */
function partialQuad(a: Pt, c: Pt, b: Pt, k: number): string {
  const c1 = { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k };
  const m = { x: c.x + (b.x - c.x) * k, y: c.y + (b.y - c.y) * k };
  const e = { x: c1.x + (m.x - c1.x) * k, y: c1.y + (m.y - c1.y) * k };
  return `M ${a.x} ${a.y} Q ${c1.x} ${c1.y} ${e.x} ${e.y}`;
}

export const linkerStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container, params): ViewInstance {
    void container;
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const data: LinkerData | null = params.initialData ? readLinkerData(params.initialData) : null;

    const anims = new Map<object, Anim>();
    let destroyed = false;

    const tween = (key: object, ms: number, draw: (k: number) => void, done?: () => void): void => {
      const prev = anims.get(key);
      if (prev) {
        cancelAnimationFrame(prev.id);
        anims.delete(key);
      }
      const finish = (): void => {
        draw(1);
        done?.();
      };
      if (destroyed || ms <= 0 || isInstant()) {
        finish();
        return;
      }
      const start = performance.now();
      const tick = (now: number): void => {
        if (destroyed) return;
        const k = Math.min(1, Math.max(0, (now - start) / ms));
        draw(ease(k));
        if (k < 1) {
          const a = anims.get(key);
          if (a) a.id = requestAnimationFrame(tick);
        } else {
          anims.delete(key);
          done?.();
        }
      };
      anims.set(key, { id: requestAnimationFrame(tick), finish });
    };

    const settleAll = (): void => {
      const all = [...anims.values()];
      anims.clear();
      for (const a of all) {
        cancelAnimationFrame(a.id);
        a.finish();
      }
    };
    params.onScrubStart?.(settleAll);

    const root = svg('g', { 'font-family': fonts.body, 'font-size': fontSizes.sm }, canvas);
    const title = svg('text', { x: CARD_X0, y: 20, fill: colors.text, 'font-size': fontSizes.md, 'font-weight': 600 }, root);
    const detail = svg('text', { x: CARD_X0, y: 42, fill: colors.textMuted, 'font-family': fonts.mono }, root);

    // 고정 틀 — 기다림 줄 · 주소 띠 둘
    const waitLabel = svg('text', { x: CARD_X0, y: WAIT_Y + WAIT_CHIP_H / 2 + 4, fill: colors.textMuted }, root);
    waitLabel.textContent = t('label.waiting', 'Waiting');
    const missingLabel = svg('text', { x: W - 20, y: WAIT_Y + WAIT_CHIP_H / 2 + 4, fill: colors.danger, 'text-anchor': 'end', 'font-weight': 600 }, root);

    const cardsLayer = svg('g', {}, root);
    const bandLayer = svg('g', {}, root);
    const blocksLayer = svg('g', {}, root);
    const arrowLayer = svg('g', {}, root);
    const linesLayer = svg('g', { fill: 'none' }, root);
    const chipsLayer = svg('g', {}, root);

    const cards = new Map<string, Card>();
    const chips = new Map<string, { g: SVGGElement; rect: SVGRectElement; x: number; y: number }>();
    const names = new Map<string, string>();
    let lastArrow: { path: SVGPathElement; label: SVGTextElement } | null = null;
    let activeRow: SVGRectElement | null = null;

    const need = (): LinkerData => {
      if (!data) throw new Error('linker 무대에 initialData 가 없다');
      return data;
    };
    const cardOf = (id: string): Card => {
      const c = cards.get(id);
      if (!c) throw new Error(`모르는 파일 카드: ${id}`);
      return c;
    };
    const slotX = (slot: number): number => CARD_X0 + slot * (CARD_W + CARD_GAP);
    const place = (card: Card, x: number, y: number): void => {
      card.x = x;
      card.y = y;
      card.g.setAttribute('transform', `translate(${x} ${y})`);
    };
    const moveCard = (card: Card, slot: number, dy: number, ms: number): void => {
      card.slot = slot;
      card.dy = dy;
      const fx = card.x;
      const fy = card.y;
      const tx = slotX(slot);
      const ty = CARD_Y + dy;
      tween(card, ms, (k) => place(card, fx + (tx - fx) * k, fy + (ty - fy) * k));
    };
    const cardTarget = (card: Card): Pt => ({ x: slotX(card.slot), y: CARD_Y + card.dy });
    const defPoint = (card: Card, sym: string): Pt => {
      const p = card.defAt.get(sym);
      if (!p) throw new Error(`${card.file.id} 에 D ${sym} 가 없다`);
      const o = cardTarget(card);
      return { x: o.x + p.x, y: o.y + p.y };
    };
    const usePoint = (card: Card, sym: string): Pt => {
      const p = card.useAt.get(sym);
      if (!p) throw new Error(`${card.file.id} 에 U ${sym} 가 없다`);
      const o = cardTarget(card);
      return { x: o.x + p.x, y: o.y + p.y };
    };
    const style = (card: Card, state: 'unread' | 'read' | 'current' | 'aside'): void => {
      const stroke = state === 'current' ? colors.accent : state === 'read' ? colors.text : colors.border;
      card.frame.setAttribute('stroke', stroke);
      card.frame.setAttribute('stroke-width', state === 'current' ? '2.5' : state === 'read' ? '1.5' : '1');
      if (state === 'aside') card.frame.setAttribute('stroke-dasharray', '5 4');
      else card.frame.removeAttribute('stroke-dasharray');
      card.g.setAttribute('opacity', state === 'aside' ? '0.7' : '1');
    };
    const bandX = (addr: number, base: number): number => BAND_X0 + (addr - base) * BYTE_PX;

    // ── 카드 · 띠 틀 (initialData 가 있을 때만)
    if (data) {
      const hues = categorical(data.files.length, 'vivid');
      const firstOrder = data.orders[data.order];
      if (!firstOrder) throw new Error(`모르는 차례: ${data.order}`);
      data.files.forEach((file, fi) => {
        const g = svg('g', {}, cardsLayer);
        const frame = svg('rect', { x: 0, y: 0, width: CARD_W, height: CARD_H, rx: 6, fill: colors.bg, stroke: colors.border }, g);
        const hue = hues[fi];
        if (hue === undefined) throw new Error('색이 모자라다');
        svg('rect', { x: 0, y: 0, width: 5, height: CARD_H, rx: 2, fill: hue }, g);
        const name = svg('text', { x: 12, y: 20, fill: colors.text, 'font-family': fonts.mono, 'font-weight': 600, 'font-size': fontSizes.md }, g);
        name.textContent = file.name;
        const tag = svg('text', { x: CARD_W - 10, y: 20, fill: colors.textMuted, 'text-anchor': 'end', 'font-size': fontSizes.xs }, g);
        const defAt = new Map<string, Pt>();
        const useAt = new Map<string, Pt>();
        const defChip = new Map<string, SVGRectElement>();
        const useChip = new Map<string, SVGRectElement>();
        const chip = (label: string, x: number, y: number, dashed: boolean): SVGRectElement => {
          const r = svg('rect', {
            x, y, width: CHIP_W, height: CHIP_H, rx: 3, fill: colors.bgSubtle, stroke: colors.border,
            ...(dashed ? { 'stroke-dasharray': '3 2' } : {}),
          }, g);
          const tx = svg('text', { x: x + 6, y: y + CHIP_H / 2 + 4, fill: colors.text, 'font-family': fonts.mono }, g);
          tx.textContent = label;
          return r;
        };
        file.defs.forEach((d, i) => {
          const x = 12 + i * (CHIP_W + 6);
          defChip.set(d.sym, chip(`D ${d.sym}`, x, DEF_ROW_Y, false));
          defAt.set(d.sym, { x: x + CHIP_W / 2, y: DEF_ROW_Y + CHIP_H / 2 });
        });
        file.uses.forEach((s, i) => {
          const x = 12 + i * (CHIP_W + 6);
          useChip.set(s, chip(`U ${s}`, x, USE_ROW_Y, true));
          useAt.set(s, { x: x + CHIP_W / 2, y: USE_ROW_Y + CHIP_H / 2 });
        });
        svg('line', { x1: 8, y1: 28, x2: CARD_W - 8, y2: 28, stroke: colors.border }, g);
        svg('line', { x1: 8, y1: 130, x2: CARD_W - 8, y2: 130, stroke: colors.border }, g);
        const rows: SVGTextElement[] = [];
        const rowHi: SVGRectElement[] = [];
        file.text.forEach((ins, i) => {
          const y = TEXT_ROWS_Y + i * ROW_H;
          const hi = svg('rect', { x: 6, y: y - 13, width: CARD_W - 12, height: ROW_H - 1, rx: 3, fill: colors.accent, opacity: 0 }, g);
          rowHi.push(hi);
          const off = svg('text', { x: 12, y, fill: colors.textMuted, 'font-family': fonts.mono }, g);
          off.textContent = `+${i * data.wordBytes}`;
          const row = svg('text', { x: 46, y, fill: colors.text, 'font-family': fonts.mono }, g);
          row.textContent = instrText(ins, null);
          rows.push(row);
        });
        file.data.forEach((d, i) => {
          const y = TEXT_ROWS_Y + (4 + i) * ROW_H + 6;
          const sec = svg('text', { x: 12, y, fill: colors.textMuted, 'font-family': fonts.mono }, g);
          sec.textContent = 'data';
          const nm = svg('text', { x: 50, y, fill: colors.text, 'font-family': fonts.mono }, g);
          nm.textContent = d.name;
          const by = svg('text', { x: 100, y, fill: colors.textMuted }, g);
          by.textContent = t('label.bytes', '{n} bytes', { n: d.bytes });
        });
        const slot = firstOrder.indexOf(file.id);
        if (slot < 0) throw new Error(`차례에 없는 파일: ${file.id}`);
        const card: Card = { file, g, frame, name, tag, rows, rowHi, defAt, useAt, defChip, useChip, x: 0, y: 0, slot, dy: 0 };
        place(card, slotX(slot), CARD_Y);
        cards.set(file.id, card);
        names.set(file.id, file.name);
      });

      let textTotal = 0;
      let dataTotal = 0;
      for (const f of data.files) {
        textTotal += textSizeOf(data, f);
        dataTotal += dataSizeOf(f);
      }
      const rangeX = BAND_X0 + Math.max(textTotal, dataTotal) * BYTE_PX + 8;
      const band = (label: string, y: number, bytes: number, base: number): void => {
        const lab = svg('text', { x: CARD_X0, y: y + BAND_H / 2 + 4, fill: colors.textMuted, 'font-family': fonts.mono }, bandLayer);
        lab.textContent = label;
        svg('rect', { x: BAND_X0, y, width: bytes * BYTE_PX, height: BAND_H, fill: colors.bgSubtle, stroke: colors.border, 'stroke-dasharray': '2 3' }, bandLayer);
        const range = svg('text', { x: rangeX, y: y + BAND_H / 2 + 4, fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, bandLayer);
        // 절 쪽 글자(캡션 · 설명 글)와 같이 끝 바이트 주소로 찍는다
        range.textContent = `@${base}–@${base + bytes - 1}`;
      };
      band('text', TEXT_BAND_Y, textTotal, data.textStart);
      band('data', DATA_BAND_Y, dataTotal, data.dataStart);
    }

    const clearDynamic = (): void => {
      settleAll();
      linesLayer.replaceChildren();
      chipsLayer.replaceChildren();
      blocksLayer.replaceChildren();
      arrowLayer.replaceChildren();
      chips.clear();
      lastArrow = null;
      activeRow = null;
      missingLabel.textContent = '';
      for (const card of cards.values()) {
        card.tag.textContent = '';
        for (const r of card.defChip.values()) {
          r.setAttribute('stroke', colors.border);
          r.setAttribute('stroke-width', '1');
        }
        for (const r of card.useChip.values()) {
          r.setAttribute('stroke', colors.border);
          r.setAttribute('stroke-width', '1');
          r.setAttribute('stroke-dasharray', '3 2');
        }
        card.file.text.forEach((ins, i) => {
          const row = card.rows[i];
          const hi = card.rowHi[i];
          if (!row || !hi) throw new Error('명령 줄이 없다');
          row.textContent = instrText(ins, null);
          row.removeAttribute('transform');
          hi.setAttribute('opacity', '0');
        });
        style(card, 'unread');
      }
    };

    const setCurrent = (id: string): void => {
      for (const c of cards.values()) {
        if (c.frame.getAttribute('stroke') === colors.accent) style(c, 'read');
      }
      style(cardOf(id), 'current');
    };

    /** 이음 선 — 기다리던 U 칩과 정의한 D 칩을 굵게 하고, 두 카드 아래 가장자리를 잇는다 */
    const link = (user: Card, definer: Card, sym: string, ms: number): void => {
      const u = user.useChip.get(sym);
      const dc = definer.defChip.get(sym);
      if (!u || !dc) throw new Error(`이을 항목이 없다: ${sym}`);
      for (const r of [u, dc]) {
        r.setAttribute('stroke', colors.text);
        r.setAttribute('stroke-width', '1.5');
        r.removeAttribute('stroke-dasharray');
      }
      const a = usePoint(user, sym);
      const b = defPoint(definer, sym);
      drawLine({ x: a.x, y: cardTarget(user).y + CARD_H }, { x: b.x, y: cardTarget(definer).y + CARD_H }, ms);
    };
    const drawLine = (from: Pt, to: Pt, ms: number): void => {
      const path = svg('path', { stroke: colors.text, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, linesLayer);
      const drop = Math.min(40, Math.max(16, Math.abs(to.x - from.x) * 0.12));
      const c = { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + drop };
      tween(path, ms, (k) => path.setAttribute('d', partialQuad(from, c, to, Math.max(0.001, k))));
    };

    const waitSlot = (i: number): Pt => ({ x: WAIT_X0 + i * WAIT_STEP, y: WAIT_Y });
    const moveChip = (chip: { g: SVGGElement; x: number; y: number }, to: Pt, ms: number, done?: () => void): void => {
      const fx = chip.x;
      const fy = chip.y;
      tween(chip, ms, (k) => {
        chip.x = fx + (to.x - fx) * k;
        chip.y = fy + (to.y - fy) * k;
        chip.g.setAttribute('transform', `translate(${chip.x} ${chip.y})`);
      }, done);
    };

    const api: LinkerStageApi = {
      round(order, roundNames, libs, ms) {
        need();
        clearDynamic();
        roundNames.forEach((nm, i) => {
          const id = order[i];
          if (id === undefined) throw new Error('이름과 차례의 길이가 다르다');
          names.set(id, nm);
          cardOf(id).name.textContent = nm;
        });
        order.forEach((id, slot) => {
          const card = cardOf(id);
          const lib = libs.includes(id);
          if (lib) style(card, 'aside');
          moveCard(card, slot, lib ? LIB_WAIT_DY : 0, ms);
        });
      },
      resolve(p, ms) {
        need();
        const card = cardOf(p.file);
        setCurrent(p.file);
        if (p.pulled) {
          card.tag.textContent = t('label.pulled', 'Pulled in');
          moveCard(card, card.slot, 0, ms);
          style(card, 'current');
        }
        // 메움 — 칩이 정의 쪽으로 날아가 빠지고, 기다리던 U 와 이 D 사이에 선
        for (const f of p.filled) {
          const chip = chips.get(f.sym);
          if (!chip) throw new Error(`기다림 칩이 없다: ${f.sym}`);
          chips.delete(f.sym);
          const to = defPoint(card, f.sym);
          moveChip(chip, { x: to.x - WAIT_CHIP_W / 2, y: to.y - WAIT_CHIP_H / 2 }, ms, () => chip.g.remove());
          link(cardOf(f.waiter), card, f.sym, ms);
        }
        // 곧바로 — 이 파일의 U 와 이미 있던 정의 사이에 선
        for (const d of p.direct) link(card, cardOf(d.definer), d.sym, ms);
        // 새 기다림 — U 항목에서 칩이 기다림 줄로
        for (const s of p.added) {
          const from = usePoint(card, s);
          const g = svg('g', {}, chipsLayer);
          const rect = svg('rect', { x: 0, y: 0, width: WAIT_CHIP_W, height: WAIT_CHIP_H, rx: 11, fill: colors.bgSubtle, stroke: colors.text, 'stroke-dasharray': '3 2' }, g);
          const tx = svg('text', { x: WAIT_CHIP_W / 2, y: WAIT_CHIP_H / 2 + 4, fill: colors.text, 'text-anchor': 'middle', 'font-family': fonts.mono }, g);
          tx.textContent = s;
          const chip = { g, rect, x: from.x - WAIT_CHIP_W / 2, y: from.y - WAIT_CHIP_H / 2 };
          g.setAttribute('transform', `translate(${chip.x} ${chip.y})`);
          chips.set(s, chip);
        }
        // 기다림 줄을 payload 차례대로 다시 세운다
        p.waiting.forEach((s, i) => {
          const chip = chips.get(s);
          if (!chip) throw new Error(`기다림 칩이 없다: ${s}`);
          moveChip(chip, waitSlot(i), ms);
        });
        if (chips.size !== p.waiting.length) throw new Error('기다림 칩 수가 payload 와 다르다');
      },
      skip(file, ms) {
        need();
        const card = cardOf(file);
        card.tag.textContent = t('label.skipped', 'Skipped');
        style(card, 'aside');
        moveCard(card, card.slot, LIB_SKIP_DY, ms);
      },
      missing(missingNames, ms) {
        need();
        missingLabel.textContent = t('label.undefined', 'Undefined');
        missingNames.forEach((s, i) => {
          const chip = chips.get(s);
          if (!chip) throw new Error(`기다림 칩이 없다: ${s}`);
          chip.rect.setAttribute('stroke', colors.danger);
          chip.rect.setAttribute('stroke-width', '2');
          chip.rect.removeAttribute('stroke-dasharray');
          const to = waitSlot(i);
          moveChip(chip, { x: to.x, y: to.y + 8 }, ms);
        });
        for (const c of cards.values()) if (c.frame.getAttribute('stroke') === colors.accent) style(c, 'read');
      },
      place(file, textAt, textSize, dataAt, dataSize, ms) {
        const d = need();
        const card = cardOf(file);
        setCurrent(file);
        const nm = names.get(file);
        if (nm === undefined) throw new Error(`이름 없는 파일: ${file}`);
        const hueIndex = d.files.findIndex((f) => f.id === file);
        const hue = categorical(d.files.length, 'vivid')[hueIndex];
        if (hue === undefined) throw new Error('색이 모자라다');
        const origin = cardTarget(card);
        const block = (at: number, size: number, base: number, bandY: number, fromY: number): void => {
          const g = svg('g', {}, blocksLayer);
          const w = size * BYTE_PX;
          svg('rect', { x: 0, y: 0, width: w, height: BAND_H, fill: colors.bg, stroke: hue, 'stroke-width': 2, rx: 2 }, g);
          const nmText = svg('text', { x: 5, y: BAND_H / 2 + 4, fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, g);
          // 좁은 절은 주소만 — 어느 파일인지는 카드 줄무늬와 같은 테두리 색이 말한다
          nmText.textContent = w >= 80 ? `@${at} ${nm}` : `@${at}`;
          const fx = origin.x + 6;
          const fy = fromY;
          const tx = bandX(at, base);
          const ty = bandY;
          tween(g, ms, (k) => g.setAttribute('transform', `translate(${fx + (tx - fx) * k} ${fy + (ty - fy) * k})`));
        };
        block(textAt, textSize, d.textStart, TEXT_BAND_Y, origin.y + TEXT_ROWS_Y - 14);
        if (dataSize > 0) block(dataAt, dataSize, d.dataStart, DATA_BAND_Y, origin.y + TEXT_ROWS_Y + 4 * ROW_H - 8);
      },
      patch(p, ms) {
        const d = need();
        const card = cardOf(p.file);
        setCurrent(p.file);
        const row = card.rows[p.index];
        const hi = card.rowHi[p.index];
        if (!row || !hi) throw new Error(`명령 줄이 없다: ${p.file} ${p.index}`);
        if (activeRow) activeRow.setAttribute('opacity', '0');
        hi.setAttribute('opacity', '0.35');
        activeRow = hi;
        row.textContent = p.after;
        tween(row, ms, (k) => row.setAttribute('transform', `translate(0 ${(1 - k) * 10})`));

        if (lastArrow) {
          lastArrow.path.setAttribute('stroke', colors.textMuted);
          lastArrow.label.setAttribute('fill', colors.textMuted);
        }
        const half = (d.wordBytes * BYTE_PX) / 2;
        const px = bandX(p.site, d.textStart) + half;
        let from: Pt;
        let to: Pt;
        let c: Pt;
        let labelAt: Pt;
        if (p.targetSec === 'text') {
          from = { x: px, y: TEXT_BAND_Y };
          to = { x: bandX(p.target, d.textStart) + 1, y: TEXT_BAND_Y };
          c = { x: (from.x + to.x) / 2, y: TEXT_BAND_Y - 2 * ARC_RISE };
          labelAt = { x: c.x, y: TEXT_BAND_Y - ARC_RISE - 4 };
        } else {
          from = { x: px, y: TEXT_BAND_Y + BAND_H };
          to = { x: bandX(p.target, d.dataStart) + 1, y: DATA_BAND_Y };
          c = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          labelAt = { x: Math.max(from.x, to.x) + 6, y: (from.y + to.y) / 2 + 4 };
        }
        const path = svg('path', { stroke: colors.text, 'stroke-width': 2, fill: 'none' }, arrowLayer);
        svg('circle', { cx: from.x, cy: from.y, r: 3, fill: colors.text }, arrowLayer);
        const label = svg('text', {
          x: labelAt.x, y: labelAt.y, fill: colors.text, 'font-family': fonts.mono, 'font-weight': 600,
          'text-anchor': p.targetSec === 'text' ? 'middle' : 'start',
        }, arrowLayer);
        label.textContent = fieldText(p.kind, p.val);
        lastArrow = { path, label };
        tween(path, ms, (k) => path.setAttribute('d', partialQuad(from, c, to, Math.max(0.001, k))));
      },
      caption(line1, line2) {
        title.textContent = line1;
        detail.textContent = line2;
      },
      clear() {
        clearDynamic();
        title.textContent = '';
        detail.textContent = '';
        if (data) {
          const firstOrder = data.orders[data.order];
          if (!firstOrder) throw new Error(`모르는 차례: ${data.order}`);
          firstOrder.forEach((id, slot) => {
            const card = cardOf(id);
            card.name.textContent = card.file.name;
            card.slot = slot;
            card.dy = 0;
            place(card, slotX(slot), CARD_Y);
          });
        }
      },
    };

    return {
      ...api,
      destroy() {
        destroyed = true;
        for (const a of anims.values()) cancelAnimationFrame(a.id);
        anims.clear();
        root.remove();
      },
    };
  },
};
