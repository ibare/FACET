/**
 * ethernet-stage — 슬롯 띠 위에 쌓이는 충돌과 뒤로 흩어지는 물러남.
 *
 * 위에서 아래로
 *   눈금      슬롯 번호. 슬롯 커서(세모와 세로선)가 사건의 슬롯으로 미끄러진다
 *   선        공유 선 한 줄. 충돌 슬롯에는 부딪힌 수만큼 막대가 쌓이고, 혼자 보낸 슬롯은
 *             보낸 이의 기호가 든 덩이로 찬다. 앞 판의 선은 옅은 윤곽으로 남는다
 *   스테이션  줄마다 충돌 표(×) · 물러남 막대(충돌 다음 슬롯부터 다시 들을 슬롯 앞까지) ·
 *             지금 창의 괄호 · 다시 들을 자리의 고리. 고리가 슬롯 띠 위를 뒤로 뛴다
 *   창 칸      줄 오른쪽 — 지금 창의 칸 수(1 · 2 · 4 … 64)와 뽑힌 k 칸
 *   끝 깃발    판이 끝난 슬롯. 새 판의 끝으로 옮겨 간다
 *   캡션      두 줄
 *
 * 운동은 rAF 로 스스로 그린다 — 길이는 projector 가 걸음마다 속도를 읽어 넘긴다.
 * 새 걸음이 오면 진행 중인 운동은 끝 상태로 건너뛴다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 가로
const W = 1040;
const SYM_X = 30;
const BAND_X = 60;
const SLOT_W = 10;
/** 띠의 슬롯 수 — 가장 큰 판의 끝 슬롯 66 과 그 너머 괄호 머리가 들어가게 */
const BAND_SLOTS = 68;
const BAND_END = BAND_X + BAND_SLOTS * SLOT_W;
const WIN_X = 764;
const CELL_PITCH = 4;
/** 창 칸이 들어갈 자리 — 이 데이터의 창 최댓값 64 */
const WIN_CELLS = 64;

// 세로 — 가장 큰 판(스테이션 여덟)의 자리를 처음부터 잡는다
const RULER_Y = 30;
const WIRE_TOP = 50;
const WIRE_BASE = 90;
const ROWS_Y = 102;
const ROW_H = 34;
const MAX_ROWS = 8;
const ROWS_END = ROWS_Y + MAX_ROWS * ROW_H;
const CAP1_Y = ROWS_END + 24;
const CAP2_Y = ROWS_END + 46;
const H = ROWS_END + 60;

const STACK_BAR = 3;
const STACK_GAP = 1;

export type RoundPayload = { stations: string[]; policy: number; seed: number; frameSlots: number };
export type PickPayload = {
  station: number;
  attempt: number;
  dropped: boolean;
  k: number;
  span: number;
  listen: number;
};
export type CollidePayload = { slot: number; picks: PickPayload[] };
export type SendPayload = { slot: number; station: number; until: number; free: number };
export type FinishPayload = { slot: number };

/** projector 가 부르는 stage 의 표면 */
export type EthernetStage = {
  startRound(p: RoundPayload, motionMs: number): void;
  collide(p: CollidePayload, motionMs: number): void;
  send(p: SendPayload, motionMs: number): void;
  finish(p: FinishPayload, motionMs: number): void;
  reset(): void;
};

type Anim = { a: number; b: number };
const still = (x: number): Anim => ({ a: x, b: x });
const moveTo = (an: Anim, x: number) => {
  an.b = x;
};
const lerp = (an: Anim, p: number) => an.a + (an.b - an.a) * p;

type LaneMark =
  | { kind: 'hit'; slot: number; fresh: boolean }
  | { kind: 'wait'; from: number; to: number; fresh: boolean }
  | { kind: 'send'; from: number; to: number; fresh: boolean }
  | { kind: 'drop'; slot: number; fresh: boolean };

type Row = {
  sym: string;
  attempts: number;
  span: Anim;
  k: number | null;
  /** 지금 창의 첫 슬롯 (충돌 슬롯 + 1). 창이 없으면 null */
  windowFrom: number | null;
  ring: Anim;
  status: 'wait' | 'sent' | 'dropped';
  marks: LaneMark[];
};

type WireMark =
  | { kind: 'hit'; slot: number; count: number; fresh: boolean }
  | { kind: 'send'; from: number; to: number; sym: string; fresh: boolean };

const slotX = (s: number) => BAND_X + s * SLOT_W;
const clampX = (x: number) => Math.min(Math.max(x, BAND_X), BAND_END);

let mountSeq = 0;

export const ethernetStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const uid = `eth-${++mountSeq}`;
    const smPx = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, String(val));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    };

    // ── 바탕 (한 번) ─────────────────────────────────────────
    const defs = el('defs', {}, svg);
    const cellPattern = el(
      'pattern',
      { id: `${uid}-cells`, width: CELL_PITCH, height: 1, patternUnits: 'userSpaceOnUse', x: WIN_X, y: 0 },
      defs,
    );
    el('rect', { x: 0, y: 0, width: CELL_PITCH - 1, height: 1, fill: colors.textMuted }, cellPattern);

    const base = el('g', {}, svg);
    el('text', { x: 16, y: RULER_Y - 8, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, base,
      t('label.slot', 'slot'));
    for (let s = 0; s <= BAND_SLOTS; s++) {
      const x = slotX(s);
      const major = s % 10 === 0;
      el('line', { x1: x, y1: RULER_Y, x2: x, y2: RULER_Y + (major ? 7 : 3), stroke: colors.border, 'stroke-width': 1 }, base);
      if (major && s < BAND_SLOTS) {
        el('text', { x, y: RULER_Y - 8, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted }, base, String(s));
      }
    }
    el('text', { x: WIN_X, y: RULER_Y - 8, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, base,
      t('label.rangeHead', 'backoff range (cells) · drawn k'));
    el('text', { x: 16, y: WIRE_BASE - 12, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text }, base,
      t('label.wire', 'wire'));
    el('line', { x1: BAND_X, y1: WIRE_BASE, x2: BAND_END, y2: WIRE_BASE, stroke: colors.text, 'stroke-width': 2 }, base);

    const layer = el('g', {}, svg);
    const cap1 = el('text', { x: 16, y: CAP1_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text }, svg);
    const cap2 = el('text', { x: 16, y: CAP2_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted }, svg);

    // ── 모형 ────────────────────────────────────────────────
    let rows: Row[] = [];
    let wire: WireMark[] = [];
    let ghostWire: WireMark[] = [];
    const cursor = still(0);
    let flag: Anim | null = null;
    let flagShown = false;
    let flagCurrent = false;
    let lastCaption: [string, string] = ['', ''];

    const rowOf = (i: number): Row => {
      const row = rows[i];
      if (!row) throw new Error(`없는 스테이션 줄: ${i}`);
      return row;
    };

    // ── 그리기 ─────────────────────────────────────────────
    const draw = (p: number) => {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      const e = 1 - (1 - p) * (1 - p); // 느려지며 닿는다

      // 앞 판의 선 — 옅은 윤곽
      for (const m of ghostWire) {
        if (m.kind === 'hit') {
          const h = m.count * (STACK_BAR + STACK_GAP);
          el('rect', { x: slotX(m.slot) + 1, y: WIRE_BASE - h, width: SLOT_W - 2, height: h, fill: 'none', stroke: colors.border, 'stroke-dasharray': '2 2' }, layer);
        } else {
          el('rect', { x: slotX(m.from) + 1, y: WIRE_BASE - 16, width: (m.to - m.from + 1) * SLOT_W - 2, height: 16, fill: 'none', stroke: colors.border, 'stroke-dasharray': '2 2' }, layer);
        }
      }

      // 선
      for (const m of wire) {
        const q = m.fresh ? e : 1;
        if (m.kind === 'hit') {
          const shown = m.fresh ? Math.max(1, Math.ceil(m.count * q - 1e-9)) : m.count;
          for (let j = 0; j < shown; j++) {
            el('rect', { x: slotX(m.slot) + 1, y: WIRE_BASE - (j + 1) * (STACK_BAR + STACK_GAP), width: SLOT_W - 2, height: STACK_BAR, fill: colors.danger }, layer);
          }
        } else {
          const full = (m.to - m.from + 1) * SLOT_W - 2;
          el('rect', { x: slotX(m.from) + 1, y: WIRE_BASE - 16, width: full * q, height: 16, rx: 2, fill: colors.primary }, layer);
          if (q > 0.6) {
            el('text', { x: slotX(m.from) + full / 2 + 1, y: WIRE_BASE - 4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.textInverse }, layer, m.sym);
          }
        }
      }

      // 스테이션 줄
      rows.forEach((row, i) => {
        const y = ROWS_Y + i * ROW_H;
        const mid = y + ROW_H / 2;
        el('line', { x1: BAND_X, y1: mid, x2: BAND_END, y2: mid, stroke: colors.border, 'stroke-width': 1 }, layer);
        el('text', { x: SYM_X, y: mid + smPx / 2 - 1, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600, fill: colors.text }, layer, row.sym);

        // 지금 창의 괄호 — 충돌 다음 슬롯부터 창의 칸 수만큼
        if (row.status === 'wait' && row.windowFrom !== null) {
          const x0 = slotX(row.windowFrom);
          const x1 = clampX(x0 + lerp(row.span, e) * SLOT_W);
          if (x1 > x0) {
            el('path', { d: `M${x0},${mid - 9} v-3 H${x1} v3`, fill: 'none', stroke: colors.accent, 'stroke-width': 1.2 }, layer);
          }
        }

        for (const m of row.marks) {
          const q = m.fresh ? e : 1;
          if (m.kind === 'hit') {
            const cx = slotX(m.slot) + SLOT_W / 2;
            el('path', { d: `M${cx - 3.5},${mid - 3.5} L${cx + 3.5},${mid + 3.5} M${cx + 3.5},${mid - 3.5} L${cx - 3.5},${mid + 3.5}`, stroke: colors.danger, 'stroke-width': 1.8 }, layer);
          } else if (m.kind === 'wait') {
            const x0 = slotX(m.from);
            const len = (m.to - m.from) * SLOT_W * q;
            if (len > 0) {
              el('rect', { x: x0, y: mid - 3, width: Math.max(0, clampX(x0 + len) - x0), height: 6, rx: 3, fill: m.fresh ? colors.accent : colors.border }, layer);
            }
          } else if (m.kind === 'send') {
            const full = (m.to - m.from + 1) * SLOT_W - 2;
            el('rect', { x: slotX(m.from) + 1, y: mid - 7, width: full * q, height: 14, rx: 2, fill: colors.primary }, layer);
          } else {
            const cx = slotX(m.slot) + SLOT_W / 2;
            const r = 6 * (0.4 + 0.6 * q);
            el('circle', { cx, cy: mid, r, fill: 'none', stroke: colors.danger, 'stroke-width': 1.8 }, layer);
            el('line', { x1: cx - r * 0.7, y1: mid + r * 0.7, x2: cx + r * 0.7, y2: mid - r * 0.7, stroke: colors.danger, 'stroke-width': 1.8 }, layer);
          }
        }

        // 다시 들을 자리의 고리
        if (row.status === 'wait') {
          const cx = clampX(slotX(lerp(row.ring, e)) + SLOT_W / 2);
          el('circle', { cx, cy: mid, r: 4.5, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.6 }, layer);
        }

        // 창 칸 · 상태 글
        const span = lerp(row.span, e);
        const cells = Math.min(WIN_CELLS, span);
        if (row.status === 'wait' && cells > 0) {
          el('rect', { x: WIN_X, y: mid - 1, width: Math.max(0, cells * CELL_PITCH - 1), height: 10, fill: `url(#${uid}-cells)` }, layer);
          if (row.k !== null && p >= 0.5) {
            el('rect', { x: WIN_X + row.k * CELL_PITCH - 1, y: mid - 3, width: CELL_PITCH + 1, height: 14, fill: colors.accent }, layer);
          }
        }
        let status: string;
        if (row.status === 'sent') status = t('label.rowSent', 'sent · collisions {c}', { c: row.attempts });
        else if (row.status === 'dropped') status = t('label.rowDropped', 'dropped · collisions {c}', { c: row.attempts });
        else if (row.k === null) status = t('label.rowReady', 'collisions {c}', { c: row.attempts });
        else status = t('label.rowWait', 'collisions {c} · range 0..{max} · k {k}', { c: row.attempts, max: row.span.b - 1, k: row.k });
        el('text', { x: WIN_X, y: mid - 5, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: row.status === 'dropped' ? colors.danger : colors.text }, layer, status);
      });

      // 끝 깃발
      if (flag && flagShown) {
        const fx = slotX(lerp(flag, e));
        const ink = flagCurrent ? colors.text : colors.border;
        el('line', { x1: fx, y1: WIRE_TOP, x2: fx, y2: ROWS_Y + rows.length * ROW_H, stroke: ink, 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, layer);
        el('path', { d: `M${fx},${WIRE_TOP} l8,4 l-8,4 z`, fill: ink }, layer);
        // 끝 슬롯의 글은 이 판이 끝났을 때만 — 앞 판의 깃발은 윤곽만 남는다
        if (flagCurrent) {
          el('text', { x: fx - 3, y: WIRE_TOP + 7, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.text }, layer,
            t('label.finish', 'end {slot}', { slot: flag.b }));
        }
      }

      // 슬롯 커서
      const cxr = slotX(lerp(cursor, e));
      el('path', { d: `M${cxr - 5},${RULER_Y + 8} h10 l-5,7 z`, fill: colors.accent }, layer);
      el('line', { x1: cxr, y1: RULER_Y + 14, x2: cxr, y2: ROWS_Y + Math.max(1, rows.length) * ROW_H, stroke: colors.accent, 'stroke-width': 1, opacity: 0.7 }, layer);

      cap1.textContent = lastCaption[0];
      cap2.textContent = lastCaption[1];
    };

    // ── 운동 ───────────────────────────────────────────────
    let raf: number | null = null;
    const commit = () => {
      if (raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      raf = null;
      cursor.a = cursor.b;
      if (flag) flag.a = flag.b;
      for (const row of rows) {
        row.span.a = row.span.b;
        row.ring.a = row.ring.b;
        for (const m of row.marks) m.fresh = false;
      }
      for (const m of wire) m.fresh = false;
    };
    const play = (motionMs: number) => {
      if (motionMs <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / motionMs);
        draw(p);
        raf = p < 1 ? requestAnimationFrame(tick) : null;
      };
      draw(0);
      raf = requestAnimationFrame(tick);
    };

    const names = (idx: number[]) => idx.map((i) => rowOf(i).sym).join(' ');

    const stage: EthernetStage & ViewInstance = {
      startRound(p, motionMs) {
        commit();
        ghostWire = wire.map((m) => ({ ...m, fresh: false }));
        wire = [];
        const prev = rows;
        rows = p.stations.map((sym, i) => {
          const old = prev[i];
          return {
            sym,
            attempts: 0,
            span: { a: old ? old.span.b : 1, b: 1 },
            k: null,
            windowFrom: null,
            ring: { a: old ? old.ring.b : 0, b: 0 },
            status: 'wait',
            marks: [],
          };
        });
        moveTo(cursor, 0);
        flagShown = flag !== null;
        flagCurrent = false;
        const rule = p.policy === 1
          ? t('rule.doubling', 'doubles after each collision')
          : t('rule.fixed', 'fixed at 0..1');
        lastCaption = [
          t('caption.ready', 'Slot 0 · one frame each: {names}', { names: p.stations.join(' ') }),
          t('caption.rule', 'Backoff range: {rule} · seed {seed}', { rule, seed: p.seed }),
        ];
        play(motionMs);
      },
      collide(p, motionMs) {
        commit();
        moveTo(cursor, p.slot);
        wire.push({ kind: 'hit', slot: p.slot, count: p.picks.length, fresh: true });
        const dropped: number[] = [];
        const listens: string[] = [];
        for (const pick of p.picks) {
          const row = rowOf(pick.station);
          row.attempts = pick.attempt;
          row.marks.push({ kind: 'hit', slot: p.slot, fresh: true });
          for (const m of row.marks) if (m.kind === 'wait') m.fresh = false;
          if (pick.dropped) {
            row.status = 'dropped';
            row.k = null;
            row.windowFrom = null;
            row.marks.push({ kind: 'drop', slot: p.slot, fresh: true });
            dropped.push(pick.station);
          } else {
            row.k = pick.k;
            row.windowFrom = p.slot + 1;
            moveTo(row.span, pick.span);
            moveTo(row.ring, pick.listen);
            row.marks.push({ kind: 'wait', from: p.slot + 1, to: pick.listen, fresh: true });
            listens.push(t('caption.listenItem', '{sym} {slot}', { sym: row.sym, slot: pick.listen }));
          }
        }
        // 다시 들을 슬롯은 algorithm 이 셈해 pick.listen 으로 실었다 — 버림과 섞여도 빠뜨리지 않는다
        const list = listens.join(' · ');
        let line2: string;
        if (dropped.length > 0 && listens.length > 0) {
          line2 = t('caption.dropListen', 'Dropped at collision {n}: {names} · listen again at slot: {list}', {
            n: rowOf(dropped[0]!).attempts,
            names: names(dropped),
            list,
          });
        } else if (dropped.length > 0) {
          line2 = t('caption.drop', 'Dropped at collision {n}: {names}', { n: rowOf(dropped[0]!).attempts, names: names(dropped) });
        } else {
          line2 = t('caption.listen', 'Listen again at slot: {list}', { list });
        }
        lastCaption = [
          t('caption.collide', 'Slot {slot} · collision: {names}', { slot: p.slot, names: names(p.picks.map((q) => q.station)) }),
          line2,
        ];
        play(motionMs);
      },
      send(p, motionMs) {
        commit();
        moveTo(cursor, p.slot);
        const row = rowOf(p.station);
        row.status = 'sent';
        row.k = null;
        row.windowFrom = null;
        row.marks.push({ kind: 'send', from: p.slot, to: p.until, fresh: true });
        wire.push({ kind: 'send', from: p.slot, to: p.until, sym: row.sym, fresh: true });
        lastCaption = [
          t('caption.send', 'Slots {from}–{to} · sending alone: {name}', { from: p.slot, to: p.until, name: row.sym }),
          t('caption.free', 'Wire free again at slot {free}', { free: p.free }),
        ];
        play(motionMs);
      },
      finish(p, motionMs) {
        // 마지막 사건의 운동은 그대로 두고 깃발만 옮긴다
        if (flag) moveTo(flag, p.slot);
        else flag = { a: p.slot, b: p.slot };
        flagShown = true;
        flagCurrent = true;
        if (raf === null) play(motionMs);
      },
      reset() {
        commit();
        rows = [];
        wire = [];
        ghostWire = [];
        flag = null;
        flagShown = false;
        flagCurrent = false;
        cursor.a = 0;
        cursor.b = 0;
        lastCaption = ['', ''];
        draw(1);
      },
      destroy() {
        if (raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
        raf = null;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };

    draw(1);
    return stage;
  },
};
