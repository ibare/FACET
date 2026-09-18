/**
 * 사색적 디코딩 stage — 앞서 뻗고, 틀린 데서 잘려 나간다.
 *
 * 한가운데 줄이 글이다 (자리 16, 아직 안 쓴 자리는 점선). 그 아래 줄로 작은 모형의 초안이 커서에서
 * **앞으로 뻗어 나간다.** 큰 모형이 한 번 훑으면 맞은 앞부분은 **위로 올라가 글에 붙고**, 처음 틀린
 * 자리부터 뒤는 **바닥으로 떨어져 쌓이며**, 틀린 자리에는 큰 모형의 낱말이 **위에서 박힌다.**
 * 글 위의 괄호 하나가 큰 모형 검사 한 번이다 — 판의 개수가 곧 검사 수다. 손잡이를 돌리면 앞 판의
 * 괄호 줄이 한 칸 위로 물러나 새 판과 나란히 선다.
 *
 * 아래 장부는 γ 마다의 비용을 쌓는다 (검사 × 5 + 초안 × 1, 비율은 예로 정한 값). 지나간 γ 의 막대는
 * 남아 있어 돌려 볼수록 U 가 드러난다.
 *
 * 화면은 늘 상태에서 통째로 다시 그린다. 운동은 rAF 로 그 위에 진행률만 얹는다.
 */

import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 860;
const H = 426;
const GUTTER = 136;
const RIGHT = 16;
const SLOT_PAD = 10;
const SLOT_GAP = 4;

const CAPTION_Y = 20;
const GHOST_Y = 46;
const CHECK_Y = 68;
const TRACK_Y = 80;
const TRACK_H = 28;
const LANE_Y = 138;
const LANE_H = 28;
const FLOOR_BOTTOM = 244;
const FLOOR_H = 18;
const FLOOR_GAP = 3;
const SEP_Y = 262;
const LEDGER_TOP = 272;
const LEDGER_BASE = 392;
const LEDGER_MAX_H = 92;
const BAR_W = 44;

export type SpeculativeDecodingStageData = {
  target: string[];
  guess: string[];
  ladder: number[];
  draftCost: number;
  checkCost: number;
};

export type SpeculativeDecodingSummary = {
  gamma: number;
  index: number;
  checks: number;
  drafted: number;
  rejected: number;
  cost: number;
  perCheckX100: number;
};

/** projector 가 부르는 표면. */
export type SpeculativeDecodingStage = {
  setup(data: SpeculativeDecodingStageData): void;
  /** maxCost — 사다리 값 전부 가운데 가장 큰 비용. 장부의 세로 눈금을 정하는 데만 쓴다. */
  startRun(gamma: number, index: number, maxCost: number, durMs: number): void;
  draft(round: number, from: number, k: number, durMs: number): void;
  verify(round: number, from: number, k: number, accepted: number, durMs: number): void;
  endRun(summary: SpeculativeDecodingSummary, durMs: number): void;
  destroy(): void;
};

type Caption =
  | { kind: 'none' }
  | { kind: 'plain' }
  | { kind: 'start'; g: number }
  | { kind: 'draft'; round: number; k: number }
  | { kind: 'write'; round: number; at: number }
  | { kind: 'all'; round: number; a: number }
  | { kind: 'cut'; round: number; a: number; cut: number; at: number }
  | { kind: 'end'; s: SpeculativeDecodingSummary };

type Tally = { drafted: number; checks: number };
type Bracket = { from: number; len: number };

type State = {
  data: SpeculativeDecodingStageData;
  gamma: number | null;
  index: number;
  committed: Array<'big' | 'draft' | null>;
  pos: number;
  draft: { from: number; k: number } | null;
  rounds: Bracket[];
  ghost: { gamma: number; rounds: Bracket[] } | null;
  floor: number[];
  ledger: Array<Tally | null>;
  live: Tally | null;
  caption: Caption;
};

type Anim =
  | { kind: 'start'; ghostFrom: Bracket[] | null; pointerFrom: number | null }
  | { kind: 'draft'; from: number; k: number; liveFrom: Tally }
  | { kind: 'verify'; from: number; k: number; a: number; liveFrom: Tally }
  | { kind: 'end' };

type Slot = { x: number; w: number };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeIn = (x: number) => x * x;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const r2 = (x: number) => {
  const v = Math.round(x * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

function narrow(raw: unknown): SpeculativeDecodingStageData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const words = (x: unknown) =>
    typeof x === 'string' ? x.split(' ').filter((w) => w.length > 0) : null;
  const target = words(o.target);
  const guess = words(o.guess);
  const ladder = Array.isArray(o.ladder) && o.ladder.every((v) => typeof v === 'number') ? (o.ladder as number[]) : null;
  const draftCost = typeof o.draftCost === 'number' ? o.draftCost : null;
  const checkCost = typeof o.checkCost === 'number' ? o.checkCost : null;
  if (!target || !guess || !ladder || draftCost === null || checkCost === null) return null;
  return { target, guess, ladder, draftCost, checkCost };
}

export const speculativeDecodingStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let state: State | null = null;
    let slots: Slot[] = [];
    let charW = 7;
    let fontPx = 12;

    let anim: Anim | null = null;
    let animStart = 0;
    let animDur = 1;
    type Frame = number | ReturnType<typeof setTimeout>;
    let frame: Frame | null = null;
    let maxCost = 1;
    let destroyed = false;

    const useRaf = typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function';
    const raf = (cb: () => void): Frame => (useRaf ? requestAnimationFrame(cb) : setTimeout(cb, 16));
    const caf = (id: Frame): void => {
      if (typeof id === 'number' && useRaf) cancelAnimationFrame(id);
      else clearTimeout(id);
    };
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // ── 그리기 도구 ────────────────────────────────────────────
    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const e = document.createElementNS(SVG_NS, tag) as SVGElement;
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(e);
      return e;
    }
    function text(
      s: string,
      x: number,
      y: number,
      parent: Element,
      opts: { size?: number | string; fill?: string; anchor?: string; mono?: boolean; weight?: number } = {},
    ): SVGElement {
      const e = el(
        'text',
        {
          x,
          y,
          'font-size': opts.size ?? fontSizes.sm,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight) e.setAttribute('font-weight', String(opts.weight));
      e.textContent = s;
      return e;
    }

    function layout(data: SpeculativeDecodingStageData): void {
      const n = data.target.length;
      const lens = data.target.map((w, i) => Math.max(w.length, (data.guess[i] ?? '').length));
      const chars = lens.reduce((s, x) => s + x, 0);
      const avail = W - GUTTER - RIGHT - n * SLOT_PAD - Math.max(0, n - 1) * SLOT_GAP;
      charW = Math.min(8, Math.max(4, avail / Math.max(1, chars)));
      fontPx = Math.min(13, charW / 0.6);
      slots = [];
      let x = GUTTER;
      for (let i = 0; i < n; i++) {
        const w = lens[i] * charW + SLOT_PAD;
        slots.push({ x, w });
        x += w + SLOT_GAP;
      }
    }

    const slotX = (i: number) => (i < slots.length ? slots[i].x : slots.length > 0 ? slots[slots.length - 1].x + slots[slots.length - 1].w : GUTTER);

    function chip(
      parent: Element,
      x: number,
      y: number,
      w: number,
      h: number,
      word: string,
      style: 'small' | 'big' | 'discard' | 'empty',
      extra: { rotate?: number; stroke?: string; size?: number } = {},
    ): void {
      const g = el('g', {}, parent);
      if (extra.rotate) g.setAttribute('transform', `rotate(${r2(extra.rotate)} ${r2(x + w / 2)} ${r2(y + h / 2)})`);
      const fill =
        style === 'small' ? c.itemComparing : style === 'big' ? c.primary : style === 'discard' ? c.bgSubtle : 'none';
      const ink = style === 'small' ? c.stateInk : style === 'big' ? c.textInverse : c.textMuted;
      const rect = el('rect', { x, y, width: w, height: h, rx: 4, fill }, g);
      if (style === 'empty') {
        rect.setAttribute('stroke', c.border);
        rect.setAttribute('stroke-dasharray', '3 3');
      } else if (style === 'discard') {
        rect.setAttribute('stroke', c.danger);
      }
      if (extra.stroke) {
        rect.setAttribute('stroke', extra.stroke);
        rect.setAttribute('stroke-width', '2');
      }
      if (word) text(word, x + w / 2, y + h / 2 + 1, g, { size: extra.size ?? fontPx, fill: ink, anchor: 'middle', mono: true });
    }

    function bracket(parent: Element, b: Bracket, y: number, num: number, ghost: boolean, grow = 1): void {
      const x0 = slotX(b.from) + 1;
      const full = slotX(b.from + b.len - 1) + (slots[b.from + b.len - 1]?.w ?? 0) - 1;
      const x1 = lerp(x0, full, grow);
      const stroke = ghost ? c.textMuted : c.text;
      const p = el(
        'path',
        { d: `M${r2(x0)} ${r2(y + 5)} V${r2(y)} H${r2(x1)} V${r2(y + 5)}`, fill: 'none', stroke, 'stroke-width': ghost ? 1 : 1.5 },
        parent,
      );
      if (ghost) p.setAttribute('stroke-dasharray', '2 2');
      if (grow >= 1) text(String(num), (x0 + full) / 2, y - 6, parent, { size: fontSizes.xs, fill: stroke, anchor: 'middle' });
    }

    const colX = (i: number, n: number) => GUTTER + ((W - GUTTER - RIGHT) / n) * (i + 0.5);

    // ── 정적 + 진행률 그리기 ───────────────────────────────────
    function draw(p: number): void {
      svg.textContent = '';
      if (!state) return;
      const s = state;
      const d = s.data;
      const n = d.target.length;
      const root = el('g', {}, svg);

      // 캡션
      text(captionText(s.caption), GUTTER, CAPTION_Y, root, { size: fontSizes.sm, fill: c.text });

      // 줄 이름
      const labelOpts = { size: fontSizes.xs, fill: c.textMuted };
      text(t('label.checks', 'Big model checks'), 12, CHECK_Y - 2, root, labelOpts);
      if (s.ghost) text(t('label.previous', 'Previous γ = {g}', { g: s.ghost.gamma }), 12, GHOST_Y - 2, root, labelOpts);
      text(t('label.text', 'Text'), 12, TRACK_Y + TRACK_H / 2, root, labelOpts);
      text(t('label.draft', 'Small model draft'), 12, LANE_Y + LANE_H / 2, root, labelOpts);
      text(t('label.discard', 'Thrown away'), 12, FLOOR_BOTTOM - FLOOR_H / 2, root, labelOpts);

      const va = anim && anim.kind === 'verify' ? anim : null;
      const da = anim && anim.kind === 'draft' ? anim : null;
      const sa = anim && anim.kind === 'start' ? anim : null;

      // 앞 판 괄호 — 손잡이를 돌린 순간 한 칸 위로 물러난다
      if (s.ghost) {
        const y = sa && sa.ghostFrom ? lerp(CHECK_Y, GHOST_Y, easeInOut(p)) : GHOST_Y;
        s.ghost.rounds.forEach((b, i) => bracket(root, b, y, i + 1, true));
      }

      // 이번 판 괄호 — 검사 한 번에 하나
      s.rounds.forEach((b, i) => {
        const last = i === s.rounds.length - 1;
        const grow = va && last ? easeInOut(clamp01((p - 0.35) / 0.65)) : 1;
        bracket(root, b, CHECK_Y, i + 1, false, grow);
      });

      // 글 줄
      for (let i = 0; i < n; i++) {
        const sl = slots[i];
        const who = s.committed[i];
        const moving = va && i >= va.from && i <= va.from + va.a;
        if (who === null || moving) {
          chip(root, sl.x, TRACK_Y, sl.w, TRACK_H, '', 'empty');
          continue;
        }
        chip(root, sl.x, TRACK_Y, sl.w, TRACK_H, d.target[i], who === 'big' ? 'big' : 'small');
      }

      // 커서 — 초안이 뻗어 나가는 자리
      const cursorPos = va ? va.from : s.pos;
      if (cursorPos < n) {
        const cx = slotX(cursorPos) - SLOT_GAP / 2;
        el('line', { x1: cx, y1: TRACK_Y - 4, x2: cx, y2: LANE_Y + LANE_H + 4, stroke: c.accent, 'stroke-width': 2 }, root);
      }

      // 바닥 — 버린 초안이 자리 밑에 쌓인다
      for (let i = 0; i < n; i++) {
        let count = s.floor[i];
        if (va && i >= va.from + va.a && i < va.from + va.k) count -= 1; // 떨어지는 중인 것은 따로 그린다
        for (let j = 0; j < count; j++) {
          const sl = slots[i];
          const y = FLOOR_BOTTOM - (j + 1) * FLOOR_H - j * FLOOR_GAP;
          chip(root, sl.x + 2, y, sl.w - 4, FLOOR_H, d.guess[i], 'discard', { size: fontPx - 2 });
        }
      }

      // 초안 줄
      if (s.draft) {
        const { from, k } = s.draft;
        const startX = slotX(from);
        for (let i = 0; i < k; i++) {
          const sl = slots[from + i];
          let x = sl.x;
          if (da) {
            const t0 = k > 1 ? (i / k) * 0.5 : 0;
            const q = easeInOut(clamp01((p - t0) / 0.5));
            x = lerp(startX, sl.x, q);
          }
          chip(root, x, LANE_Y, sl.w, LANE_H, d.guess[from + i], 'small');
        }
        // 뻗은 팔 — 커서에서 초안 끝까지
        const last = slots[from + k - 1];
        const endX = da ? lerp(startX, last.x + last.w, easeInOut(clamp01(p / 1))) : last.x + last.w;
        el('line', { x1: startX, y1: LANE_Y + LANE_H + 6, x2: endX, y2: LANE_Y + LANE_H + 6, stroke: c.itemComparing, 'stroke-width': 2 }, root);
      }

      // 검사 — 훑고, 맞은 앞부분은 올라가고, 뒤는 떨어지고, 큰 모형의 낱말이 박힌다
      if (va) {
        const scan = clamp01(p / 0.35);
        const move = clamp01((p - 0.35) / 0.65);
        const reach = va.a + (va.a < va.k ? 1 : 0);
        const scanned = scan * reach;
        for (let i = 0; i < va.k; i++) {
          const pos = va.from + i;
          const sl = slots[pos];
          const seen = scanned > i;
          if (i < va.a) {
            const y = lerp(LANE_Y, TRACK_Y, easeInOut(move));
            chip(root, sl.x, y, sl.w, LANE_H, d.guess[pos], 'small', seen && move === 0 ? { stroke: c.success } : {});
          } else {
            const layer = s.floor[pos] - 1;
            const landY = FLOOR_BOTTOM - (layer + 1) * FLOOR_H - layer * FLOOR_GAP;
            const q = easeIn(move);
            const y = lerp(LANE_Y, landY, q);
            const h = lerp(LANE_H, FLOOR_H, q);
            const tilt = move > 0 && move < 1 ? Math.sin(move * Math.PI) * (i % 2 === 0 ? 14 : -14) : 0;
            const style = move >= 1 ? 'discard' : 'small';
            chip(root, sl.x + 2 * q, y, sl.w - 4 * q, h, d.guess[pos], style, {
              rotate: tilt,
              stroke: i === va.a && seen ? c.danger : undefined,
              size: fontPx - 2 * q,
            });
          }
        }
        if (scan > 0 && scan < 1 && reach > 0) {
          const endSlot = slots[va.from + reach - 1];
          const sx = lerp(slotX(va.from), endSlot.x + endSlot.w, scan);
          el('line', { x1: sx, y1: LANE_Y - 4, x2: sx, y2: LANE_Y + LANE_H + 4, stroke: c.accent, 'stroke-width': 2 }, root);
        }
        // 큰 모형의 낱말
        const fix = va.from + va.a;
        if (fix < n) {
          const sl = slots[fix];
          const y = lerp(CAPTION_Y + 8, TRACK_Y, easeIn(move));
          if (move > 0) chip(root, sl.x, y, sl.w, TRACK_H, d.target[fix], 'big');
        }
      }

      drawLedger(root, p, sa);
    }

    function drawLedger(root: Element, p: number, sa: Extract<Anim, { kind: 'start' }> | null): void {
      if (!state) return;
      const s = state;
      const d = s.data;
      const m = d.ladder.length;
      el('line', { x1: 12, y1: SEP_Y, x2: W - RIGHT, y2: SEP_Y, stroke: c.border }, root);
      text(t('label.cost', 'Cost by γ'), 12, LEDGER_TOP + 8, root, { size: fontSizes.xs, fill: c.textMuted });
      const sw = (y: number, fill: string, label: string) => {
        el('rect', { x: 12, y: y - 5, width: 10, height: 10, fill, rx: 2 }, root);
        text(label, 28, y, root, { size: fontSizes.xs, fill: c.textMuted });
      };
      sw(LEDGER_TOP + 30, c.primary, t('label.legendCheck', 'check × {c}', { c: d.checkCost }));
      sw(LEDGER_TOP + 48, c.itemComparing, t('label.legendDraft', 'draft word × {d}', { d: d.draftCost }));

      // 지금 γ 의 자리 — 손잡이를 돌리면 옮겨 간다
      if (s.gamma !== null) {
        const colW = (W - GUTTER - RIGHT) / m;
        const from = sa && sa.pointerFrom !== null ? sa.pointerFrom : s.index;
        const cx = lerp(colX(from, m), colX(s.index, m), sa ? easeInOut(p) : 1);
        el('rect', { x: cx - colW / 2 + 6, y: LEDGER_TOP, width: colW - 12, height: H - LEDGER_TOP - 4, rx: 6, fill: c.bgSubtle }, root);
      }

      const scale = LEDGER_MAX_H / Math.max(1, maxCost);
      const anyAnim = anim && (anim.kind === 'draft' || anim.kind === 'verify') ? anim : null;
      for (let i = 0; i < m; i++) {
        const cx = colX(i, m);
        let tally: Tally | null = s.ledger[i];
        if (i === s.index && s.live) {
          tally = s.live;
          if (anyAnim) {
            const q = easeInOut(p);
            tally = {
              drafted: lerp(anyAnim.liveFrom.drafted, s.live.drafted, q),
              checks: lerp(anyAnim.liveFrom.checks, s.live.checks, q),
            };
          }
        }
        text(t('label.gamma', 'γ {g}', { g: d.ladder[i] }), cx, LEDGER_BASE + 16, root, {
          size: fontSizes.sm,
          fill: i === s.index && s.gamma !== null ? c.text : c.textMuted,
          anchor: 'middle',
          weight: i === s.index && s.gamma !== null ? 600 : 400,
        });
        el('line', { x1: cx - BAR_W / 2 - 6, y1: LEDGER_BASE, x2: cx + BAR_W / 2 + 6, y2: LEDGER_BASE, stroke: c.border }, root);
        if (!tally) continue;
        const hc = tally.checks * d.checkCost * scale;
        const hd = tally.drafted * d.draftCost * scale;
        if (hc > 0) el('rect', { x: cx - BAR_W / 2, y: LEDGER_BASE - hc, width: BAR_W, height: hc, fill: c.primary }, root);
        if (hd > 0) el('rect', { x: cx - BAR_W / 2, y: LEDGER_BASE - hc - hd, width: BAR_W, height: hd, fill: c.itemComparing }, root);
        const cost = Math.round(tally.checks * d.checkCost + tally.drafted * d.draftCost);
        text(String(cost), cx, LEDGER_BASE - hc - hd - 9, root, { size: fontSizes.sm, fill: c.text, anchor: 'middle', weight: 600 });
      }
    }

    /** 검사 한 번에 붙은 낱말 — ×100 정수를 locale 의 소수 표기로 (fr · es · pt · id 는 쉼표). */
    function formatPer(x100: number): string {
      const opts = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
      try {
        return new Intl.NumberFormat(params.locale ?? 'en', opts).format(x100 / 100);
      } catch {
        return new Intl.NumberFormat('en', opts).format(x100 / 100);
      }
    }

    function captionText(cap: Caption): string {
      switch (cap.kind) {
        case 'none':
          return '';
        case 'plain':
          return t('caption.plain', 'γ = 0: no draft. The big model is called once for every word.');
        case 'start':
          return t('caption.start', 'γ = {g}: the small model drafts up to {g} words ahead; the big model checks them in one call.', { g: cap.g });
        case 'draft':
          return t('caption.draft', 'Check {round}: the small model reaches {k} words ahead.', { round: cap.round, k: cap.k });
        case 'write':
          return t('caption.write', 'Check {round}: the big model writes word {at} itself.', { round: cap.round, at: cap.at });
        case 'all':
          return t('caption.all', 'Check {round}: all {a} drafted words match; the big model adds the next word.', {
            round: cap.round,
            a: cap.a,
          });
        case 'cut':
          return t('caption.cut', 'Check {round}: {a} accepted. Word {at} is wrong, so {cut} drafted words fall away.', {
            round: cap.round,
            a: cap.a,
            at: cap.at,
            cut: cap.cut,
          });
        case 'end': {
          const per = formatPer(cap.s.perCheckX100);
          return t('caption.end', 'γ = {g}: {checks} big-model checks, {rejected} drafted words thrown away, cost {cost}. {per} words per check.', {
            g: cap.s.gamma,
            checks: cap.s.checks,
            rejected: cap.s.rejected,
            cost: cap.s.cost,
            per,
          });
        }
      }
    }

    // ── 운동 ─────────────────────────────────────────────────
    function stopAnim(): void {
      if (frame !== null) caf(frame);
      frame = null;
      anim = null;
    }
    function tick(): void {
      frame = null;
      if (destroyed) return;
      const p = clamp01((now() - animStart) / animDur);
      draw(p);
      if (p < 1) frame = raf(tick);
      else {
        anim = null;
        draw(1);
      }
    }
    function run(a: Anim, durMs: number): void {
      stopAnim();
      if (destroyed) return;
      anim = a;
      animStart = now();
      animDur = Math.max(1, durMs);
      draw(0);
      frame = raf(tick);
    }

    function setup(raw: SpeculativeDecodingStageData): void {
      stopAnim();
      layout(raw);
      const n = raw.target.length;
      state = {
        data: raw,
        gamma: null,
        index: 0,
        committed: new Array<'big' | 'draft' | null>(n).fill(null),
        pos: 0,
        draft: null,
        rounds: [],
        ghost: null,
        floor: new Array<number>(n).fill(0),
        ledger: raw.ladder.map(() => null),
        live: null,
        caption: { kind: 'none' },
      };
      draw(1);
    }

    const initial = narrow(params.initialData);
    if (initial) setup(initial);

    const instance: SpeculativeDecodingStage & { [k: string]: unknown } = {
      setup(data) {
        if (destroyed) return;
        setup(data);
      },
      startRun(gamma, index, maxCostOfLadder, durMs) {
        if (!state || destroyed) return;
        const s = state;
        maxCost = Math.max(1, maxCostOfLadder);
        const hadRun = s.gamma !== null;
        const prevIndex = s.index;
        const ghostFrom = hadRun && s.rounds.length > 0 ? s.rounds : null;
        if (hadRun && s.rounds.length > 0) s.ghost = { gamma: s.gamma as number, rounds: s.rounds };
        s.gamma = gamma;
        s.index = index;
        s.committed = s.committed.map(() => null);
        s.pos = 0;
        s.draft = null;
        s.rounds = [];
        s.floor = s.floor.map(() => 0);
        s.live = { drafted: 0, checks: 0 };
        s.caption = gamma === 0 ? { kind: 'plain' } : { kind: 'start', g: gamma };
        run({ kind: 'start', ghostFrom, pointerFrom: hadRun ? prevIndex : null }, durMs);
      },
      draft(round, from, k, durMs) {
        if (!state || destroyed || !state.live) return;
        const s = state;
        const n = s.data.target.length;
        const kk = Math.max(0, Math.min(k, n - from));
        const liveFrom = { ...(s.live as Tally) };
        s.draft = kk > 0 ? { from, k: kk } : null;
        s.live = { drafted: liveFrom.drafted + kk, checks: liveFrom.checks };
        s.caption = { kind: 'draft', round, k: kk };
        run({ kind: 'draft', from, k: kk, liveFrom }, durMs);
      },
      verify(round, from, k, accepted, durMs) {
        if (!state || destroyed || !state.live) return;
        const s = state;
        const n = s.data.target.length;
        const kk = Math.max(0, Math.min(k, n - from));
        const a = Math.max(0, Math.min(accepted, kk));
        const liveFrom = { ...(s.live as Tally) };
        for (let i = 0; i < a; i++) s.committed[from + i] = 'draft';
        if (from + a < n) s.committed[from + a] = 'big';
        for (let i = a; i < kk; i++) s.floor[from + i] += 1;
        s.pos = Math.min(n, from + a + 1);
        s.draft = null;
        s.rounds = [...s.rounds, { from, len: Math.min(a + 1, n - from) }];
        s.live = { drafted: liveFrom.drafted, checks: liveFrom.checks + 1 };
        s.caption =
          kk === 0
            ? { kind: 'write', round, at: from + 1 }
            : a === kk
              ? { kind: 'all', round, a }
              : { kind: 'cut', round, a, cut: kk - a, at: from + a + 1 };
        run({ kind: 'verify', from, k: kk, a, liveFrom }, durMs);
      },
      endRun(summary, durMs) {
        if (!state || destroyed) return;
        const s = state;
        const tally = { drafted: summary.drafted, checks: summary.checks };
        if (summary.index >= 0 && summary.index < s.ledger.length) s.ledger[summary.index] = tally;
        s.live = tally;
        s.caption = { kind: 'end', s: summary };
        run({ kind: 'end' }, durMs);
      },
      destroy() {
        destroyed = true;
        stopAnim();
        svg.textContent = '';
      },
    };
    return instance;
  },
};
