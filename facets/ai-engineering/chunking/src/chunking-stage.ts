/**
 * 청킹 stage — 글 위를 칼자리가 옮겨 다닌다.
 *
 * 그리는 것
 * - 글 — 낱말 121 을 줄에 흘려 놓는다 (고정폭 글꼴이라 자리를 셈으로 정한다)
 * - 덩이 — 글 위(홀수 번째)와 아래(짝수 번째) 두 길에 놓인 띠. 반 겹침에서는 두 길의 띠가 서로 포개진다
 * - 칼자리 — 덩이 끝마다 선 칼. 문장 끝에 붙으면 초록, 문장 한가운데면 주황
 * - 문장 밑줄 — 통째로 든 문장은 초록, 잘린 문장은 빨강이고 칼자리에서 벌어진다
 * - 두 번 담긴 낱말 — 두 덩이가 함께 덮는 낱말에 옅은 바탕
 * - 컵 — 덩이 하나가 컵 하나. 컵 높이가 창이고 차오른 만큼이 덩이 길이다
 *
 * 운동 — 손잡이를 돌려 다시 돌면 앞 판의 띠와 칼이 **지워지지 않고** 새 자리로 미끄러진다.
 * 칼자리는 글을 읽는 차례를 따라 움직인다(줄 끝에서 다음 줄 첫머리로 넘어간다). 잘렸던 문장의 밑줄은
 * 벌어진 틈이 닫히고, 온전하던 문장은 틈이 벌어진다. 컵은 새 덩이 길이로 차오르거나 줄어든다.
 * 운동의 길이는 projector 가 재생 속도로 나눠 넘긴다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 480;
const PAD = 16;
/** 11px 고정폭 글꼴의 글자 폭. `textLength` 로 못박아 브라우저마다 갈리지 않게 한다. */
const CHAR_W = 6.6;
/** 글 글꼴 크기(px). 글자 폭 CHAR_W 와 짝을 이루는 수라 토큰(문자열)이 아니라 수로 둔다 — textLength 셈이 이 둘로 선다. */
const TEXT_FONT = 11;

const CAPTION_Y = 18;
const TEXT_TOP = 30;
const TEXT_AREA = 290;
const LINE_H_MAX = 36;
const CUP_TOP = 336;
const CUP_H = 56;
const CUP_GAP = 6;
const CUP_W_MAX = 30;
/** 가장 많은 덩이 — 반 겹침 · 창 16 의 15. 컵 자리를 처음부터 잡아 둔다. */
const CUP_SLOTS = 15;
const SUMMARY_Y = 428;
const LEGEND_Y = 452;

type Sentence = { start: number; end: number };
type Status = 'pending' | 'whole' | 'broken';

/** 한 값의 흐름. 목표가 바뀌면 지금 보이는 값에서 다시 출발한다. */
class Tween {
  private from: number;
  private to: number;
  private t0 = 0;
  private dur = 0;
  constructor(value: number) {
    this.from = value;
    this.to = value;
  }
  get target(): number {
    return this.to;
  }
  at(now: number): number {
    if (this.dur <= 0 || now >= this.t0 + this.dur) return this.to;
    const u = Math.max(0, (now - this.t0) / this.dur);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    return this.from + (this.to - this.from) * e;
  }
  busy(now: number): boolean {
    return this.dur > 0 && now < this.t0 + this.dur;
  }
  set(to: number, dur: number, now: number): void {
    this.from = this.at(now);
    this.to = to;
    this.t0 = now;
    this.dur = dur;
  }
}

/** pass = 이 띠가 마지막으로 선 판. 겹침 셈은 이번 판에 선 띠로만 한다. */
type Band = { s: Tween; e: Tween; live: Tween; alive: boolean; pass: number };
type Cup = { fill: Tween; live: Tween; alive: boolean };
type Mark = { status: Status; gap: Tween };

/** projector 가 부르는 표면. */
export type ChunkingStage = ViewInstance & {
  setup(words: string[], sentences: Sentence[]): void;
  clear(): void;
  plan(rule: number, size: number, count: number, ms: number): void;
  placeChunk(index: number, start: number, end: number, whole: number[], ms: number): void;
  judge(broken: number[], total: number, count: number, ms: number): void;
  finish(chunks: number, broken: number, stored: number, fill: number): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent?.appendChild(node);
  return node;
}

function r1(x: number): number {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? 0 : v;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export const chunkingStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    // 덩이 두 길의 색 — 셋으로 나눈 색상환의 뒤 둘(청록 · 보라). 첫째(주황)는 칼 · 잘림의 붉은 계열과 겹쳐 비운다.
    const hues = categorical(3, 'vivid');
    const lane = [hues[1]!, hues[2]!];

    svg.textContent = '';
    const gCaption = el('g', {}, svg);
    const gTint = el('g', {}, svg);
    const gText = el('g', {}, svg);
    const gDyn = el('g', {}, svg);
    const gCups = el('g', {}, svg);
    const gSummary = el('g', {}, svg);
    const gLegend = el('g', {}, svg);

    // ── 바탕 (setup 이 정한다)
    let words: string[] = [];
    let sentences: Sentence[] = [];
    let wordLine: number[] = [];
    let wordX0: number[] = [];
    let wordX1: number[] = [];
    let lineY: number[] = [];
    let lineH = LINE_H_MAX;
    /** 낱말 i 의 앞 경계가 문장 끝인가 (i = 문장 끝 낱말 + 1) */
    let sentenceEnds = new Set<number>();

    // ── 자취
    let size = 0;
    /** 지금 판의 번호 — plan 마다 하나 오른다 */
    let pass = 0;
    let bands: Band[] = [];
    let cups: Cup[] = [];
    let marks: Mark[] = [];

    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const slotL = (i: number): number => wordX0[i]! - CHAR_W / 2;
    const slotR = (i: number): number => wordX1[i]! + CHAR_W / 2;

    /** 읽는 자리 p (0..낱말 수) → 줄과 x. 경계 p 는 앞 낱말의 끝에 선다. */
    function place(p: number): { line: number; x: number } {
      const total = words.length;
      if (total === 0) return { line: 0, x: PAD };
      const q = Math.max(0, Math.min(total, p));
      if (q <= 0) return { line: wordLine[0]!, x: slotL(0) };
      const i = Math.ceil(q) - 1;
      const f = q - i;
      return { line: wordLine[i]!, x: slotL(i) + (slotR(i) - slotL(i)) * f };
    }

    /** 구간 [ps, pe] 를 줄마다 가른 조각. */
    function segments(ps: number, pe: number): Array<{ line: number; x1: number; x2: number }> {
      const out: Array<{ line: number; x1: number; x2: number }> = [];
      if (pe - ps <= 0.001 || words.length === 0) {
        const at = place(ps);
        out.push({ line: at.line, x1: at.x, x2: at.x });
        return out;
      }
      const first = Math.max(0, Math.floor(ps));
      const last = Math.min(words.length - 1, Math.ceil(pe) - 1);
      let i = first;
      while (i <= last) {
        const line = wordLine[i]!;
        let j = i;
        while (j + 1 <= last && wordLine[j + 1] === line) j += 1;
        const a = Math.max(ps, i);
        const b = Math.min(pe, j + 1);
        const xa = slotL(i) + (slotR(i) - slotL(i)) * Math.max(0, a - i);
        const xb = slotL(j) + (slotR(j) - slotL(j)) * Math.min(1, b - j);
        out.push({ line, x1: xa, x2: xb });
        i = j + 1;
      }
      return out;
    }

    function layout(): void {
      wordLine = [];
      wordX0 = [];
      wordX1 = [];
      let line = 0;
      let x = PAD;
      for (let i = 0; i < words.length; i += 1) {
        const w = words[i]!.length * CHAR_W;
        const start = x === PAD ? x : x + CHAR_W;
        if (start + w > W - PAD && x !== PAD) {
          line += 1;
          x = PAD;
          wordLine.push(line);
          wordX0.push(PAD);
          wordX1.push(PAD + w);
          x = PAD + w;
          continue;
        }
        wordLine.push(line);
        wordX0.push(start);
        wordX1.push(start + w);
        x = start + w;
      }
      const lines = words.length === 0 ? 1 : line + 1;
      lineH = Math.min(LINE_H_MAX, TEXT_AREA / lines);
      lineY = Array.from({ length: lines }, (_, li) => TEXT_TOP + li * lineH);
    }

    /** 줄 안의 자리 — 위 길 · 글 · 밑줄 · 아래 길. 줄 높이에 비례한다. */
    // 두 길은 글에 바짝 붙이고 줄과 줄 사이를 넓게 둔다 — 띠가 어느 줄의 것인지 읽히게.
    const baseY = (li: number): number => lineY[li]! + lineH * 0.55;
    const laneTop = (li: number): number => baseY(li) - TEXT_FONT - 4;
    const underY = (li: number): number => baseY(li) + 3.5;
    const laneBottom = (li: number): number => baseY(li) + 7;

    function drawText(): void {
      gText.textContent = '';
      for (let i = 0; i < words.length; i += 1) {
        const node = el(
          'text',
          {
            x: r1(wordX0[i]!),
            y: r1(baseY(wordLine[i]!)),
            'font-family': fonts.mono,
            'font-size': TEXT_FONT,
            textLength: r1(words[i]!.length * CHAR_W),
            lengthAdjust: 'spacingAndGlyphs',
            fill: pal.text,
          },
          gText,
        );
        node.textContent = words[i]!;
      }
    }

    function drawLegend(): void {
      gLegend.textContent = '';
      const items: Array<{ kind: 'tint' | 'whole' | 'broken' | 'long'; label: string }> = [
        { kind: 'tint', label: t('legend.twice', 'stored twice') },
        { kind: 'whole', label: t('legend.whole', 'sentence kept whole') },
        { kind: 'broken', label: t('legend.broken', 'sentence cut apart') },
        { kind: 'long', label: t('legend.long', 'longer than the window') },
      ];
      const colW = (W - 2 * PAD) / 2;
      items.forEach((it, k) => {
        const x = PAD + (k % 2) * colW;
        const y = LEGEND_Y + Math.floor(k / 2) * 18;
        if (it.kind === 'tint') {
          el('rect', { x, y: y - 9, width: 18, height: 12, rx: 2, fill: pal.accent, 'fill-opacity': 0.4 }, gLegend);
        } else if (it.kind === 'long') {
          el('line', { x1: x, y1: y - 5, x2: x + 18, y2: y - 5, stroke: pal.textMuted, 'stroke-width': 1.5 }, gLegend);
          el('line', { x1: x, y1: y - 1, x2: x + 18, y2: y - 1, stroke: pal.textMuted, 'stroke-width': 1.5 }, gLegend);
        } else {
          el(
            'line',
            {
              x1: x,
              y1: y - 3,
              x2: x + 18,
              y2: y - 3,
              stroke: it.kind === 'whole' ? pal.success : pal.danger,
              'stroke-width': 2.5,
              'stroke-linecap': 'round',
            },
            gLegend,
          );
        }
        const label = el(
          'text',
          { x: x + 26, y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted },
          gLegend,
        );
        label.textContent = it.label;
      });
    }

    function setCaption(text: string): void {
      gCaption.textContent = '';
      const node = el(
        'text',
        { x: PAD, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text, 'font-weight': 600 },
        gCaption,
      );
      node.textContent = text;
    }

    function setSummary(text: string): void {
      gSummary.textContent = '';
      const node = el(
        'text',
        { x: W / 2, y: SUMMARY_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text },
        gSummary,
      );
      node.textContent = text;
    }

    /** 이 칼자리(낱말 경계)가 문장 끝에 붙었는가. */
    const onSentenceEnd = (p: number): boolean => sentenceEnds.has(p);

    // ── 매 프레임 다시 그리는 층
    function drawDynamic(at: number): void {
      gTint.textContent = '';
      gDyn.textContent = '';
      gCups.textContent = '';
      const total = words.length;

      // 두 번 담긴 낱말 — 목표 자리로 센다
      const cover = new Array<number>(total).fill(0);
      for (const b of bands) {
        if (!b.alive || b.pass !== pass) continue;
        for (let i = Math.max(0, b.s.target); i < Math.min(total, b.e.target); i += 1) cover[i]! += 1;
      }
      for (let i = 0; i < total; i += 1) {
        if (cover[i]! < 2) continue;
        const li = wordLine[i]!;
        el(
          'rect',
          {
            x: r1(slotL(i)),
            y: r1(baseY(li) - TEXT_FONT),
            width: r1(slotR(i) - slotL(i)),
            height: r1(TEXT_FONT + 4),
            fill: pal.accent,
            'data-role': 'twice',
            'fill-opacity': 0.4,
          },
          gTint,
        );
      }

      // 문장 밑줄 — 잘린 문장은 칼자리에서 벌어진다
      const cutsNow: number[] = [];
      for (const b of bands) {
        if (b.alive) cutsNow.push(b.e.at(at));
      }
      sentences.forEach((s, j) => {
        const m = marks[j];
        if (!m) return;
        const color = m.status === 'whole' ? pal.success : m.status === 'broken' ? pal.danger : pal.border;
        const gapW = 10 * m.gap.at(at);
        const inner = cutsNow.filter((p) => p > s.start + 0.001 && p < s.end - 0.001).map((p) => place(p));
        const long = size > 0 && s.end - s.start > size;
        for (const seg of segments(s.start, s.end)) {
          const y = underY(seg.line);
          const x1 = seg.x1 + CHAR_W / 2;
          const x2 = seg.x2 - CHAR_W / 2;
          // 이 줄에 떨어진 칼자리로 밑줄을 가른다
          const cuts = inner.filter((c) => c.line === seg.line && c.x > x1 && c.x < x2).map((c) => c.x).sort((a, b) => a - b);
          let from = x1;
          const pieces: Array<[number, number]> = [];
          for (const c of cuts) {
            pieces.push([from, c - gapW / 2]);
            from = c + gapW / 2;
          }
          pieces.push([from, x2]);
          for (const [a, b] of pieces) {
            if (b - a <= 0.5) continue;
            const attrs = { x1: r1(a), x2: r1(b), stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round' };
            if (long) {
              el('line', { ...attrs, y1: r1(y - 1.5), y2: r1(y - 1.5), 'stroke-width': 1.5 }, gDyn);
              el('line', { ...attrs, y1: r1(y + 1.5), y2: r1(y + 1.5), 'stroke-width': 1.5 }, gDyn);
            } else {
              el('line', { ...attrs, y1: r1(y), y2: r1(y) }, gDyn);
            }
          }
        }
      });

      // 덩이 띠와 칼자리
      bands.forEach((b, k) => {
        const live = b.live.at(at);
        if (live <= 0.01) return;
        const ps = b.s.at(at);
        const pe = b.e.at(at);
        const color = lane[k % 2]!;
        const thick = 4 * live;
        for (const seg of segments(ps, pe)) {
          const y = k % 2 === 0 ? laneTop(seg.line) : laneBottom(seg.line);
          el(
            'rect',
            {
              x: r1(seg.x1),
              y: r1(y + (4 - thick) / 2),
              width: r1(Math.max(1, seg.x2 - seg.x1)),
              height: r1(Math.max(0.5, thick)),
              rx: 2,
              fill: color,
            },
            gDyn,
          );
        }
        // 덩이 머리 — 작은 눈금
        const head = place(ps);
        const hy = k % 2 === 0 ? laneTop(head.line) : laneBottom(head.line);
        el('line', { x1: r1(head.x), y1: r1(hy - 3), x2: r1(head.x), y2: r1(hy + 7), stroke: color, 'stroke-width': 1.5 }, gDyn);
        // 칼 — 덩이 끝. 글 끝에서는 자를 것이 없다
        if (b.e.target < total || pe < total - 0.01) {
          const cut = place(pe);
          const snapped = b.alive && onSentenceEnd(b.e.target) && Math.abs(pe - b.e.target) < 0.01;
          const knife = snapped ? pal.success : pal.itemComparing;
          const top = laneTop(cut.line) - 3;
          const bottom = laneBottom(cut.line) + 6;
          el('line', { x1: r1(cut.x), y1: r1(top), x2: r1(cut.x), y2: r1(bottom), stroke: knife, 'stroke-width': 2 * Math.max(0.3, live) }, gDyn);
          el('path', { d: `M${r1(cut.x - 4)} ${r1(top - 5)} L${r1(cut.x + 4)} ${r1(top - 5)} L${r1(cut.x)} ${r1(top)} Z`, fill: knife, 'data-role': 'knife' }, gDyn);
        }
      });

      // 컵 — 덩이 하나가 컵 하나. 높이가 창
      const slots = Math.max(CUP_SLOTS, cups.length);
      const cupW = Math.min(CUP_W_MAX, (W - 2 * PAD - (slots - 1) * CUP_GAP) / slots);
      const rowW = slots * cupW + (slots - 1) * CUP_GAP;
      const left = (W - rowW) / 2;
      for (let k = 0; k < slots; k += 1) {
        const x = left + k * (cupW + CUP_GAP);
        const cup = cups[k];
        const live = cup ? cup.live.at(at) : 0;
        el(
          'rect',
          {
            x: r1(x),
            y: CUP_TOP,
            width: r1(cupW),
            height: CUP_H,
            rx: 3,
            fill: 'none',
            stroke: live > 0.5 ? pal.textMuted : pal.border,
            'data-role': live > 0.5 ? 'cup' : 'cup-empty',
            'stroke-width': 1,
            'stroke-dasharray': live > 0.5 ? 'none' : '3 3',
          },
          gCups,
        );
        if (!cup) continue;
        const h = CUP_H * Math.max(0, Math.min(1, cup.fill.at(at)));
        if (h > 0.3) {
          el(
            'rect',
            { x: r1(x + 2), y: r1(CUP_TOP + CUP_H - h), width: r1(cupW - 4), height: r1(h), rx: 2, fill: lane[k % 2]! },
            gCups,
          );
        }
        if (live > 0.5) {
          const num = el(
            'text',
            {
              x: r1(x + cupW / 2),
              y: CUP_TOP + CUP_H + 13,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: pal.textMuted,
            },
            gCups,
          );
          num.textContent = String(k + 1);
        }
      }
    }

    function busy(at: number): boolean {
      for (const b of bands) if (b.s.busy(at) || b.e.busy(at) || b.live.busy(at)) return true;
      for (const c of cups) if (c.fill.busy(at) || c.live.busy(at)) return true;
      for (const m of marks) if (m.gap.busy(at)) return true;
      return false;
    }

    function tick(): void {
      frame = null;
      timer = null;
      if (destroyed) return;
      const at = now();
      drawDynamic(at);
      if (busy(at)) schedule();
    }

    function schedule(): void {
      if (destroyed || frame !== null || timer !== null) return;
      if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);
      else timer = setTimeout(tick, 16);
    }

    function redraw(): void {
      drawDynamic(now());
      schedule();
    }

    function resetTrail(): void {
      bands = [];
      cups = [];
      marks = sentences.map(() => ({ status: 'pending' as Status, gap: new Tween(0) }));
      size = 0;
    }

    function setup(ws: string[], ss: Sentence[]): void {
      words = ws.slice();
      sentences = ss.map((s) => ({ start: s.start, end: s.end }));
      sentenceEnds = new Set(sentences.map((s) => s.end));
      layout();
      resetTrail();
      drawText();
      drawLegend();
      setCaption('');
      setSummary('');
      redraw();
    }

    function ruleName(rule: number): string {
      if (rule === 1) return t('rule.half', 'half overlap');
      if (rule === 2) return t('rule.sentence', 'sentence end');
      return t('rule.words', 'word count');
    }

    /** 덩이 번호 count 이상의 띠는 글 끝으로 밀려나며 사라지고, 컵은 비워진다. */
    function retire(count: number, ms: number): void {
      const at = now();
      for (let k = count; k < bands.length; k += 1) {
        const b = bands[k]!;
        if (!b.alive) continue;
        b.alive = false;
        b.s.set(words.length, ms, at);
        b.e.set(words.length, ms, at);
        b.live.set(0, ms, at);
      }
      for (let k = count; k < cups.length; k += 1) {
        const c = cups[k]!;
        if (!c.alive) continue;
        c.alive = false;
        c.fill.set(0, ms, at);
        c.live.set(0, ms, at);
      }
    }

    const stage: ChunkingStage = {
      setup,
      clear() {
        resetTrail();
        setCaption('');
        setSummary('');
        redraw();
      },
      plan(rule, sz, count, ms) {
        size = sz;
        pass += 1;
        // 이번 판에 서지 않을 앞 판의 덩이는 곧바로 물린다 — 칼 · 컵 · 겹침이 없는 덩이를 세지 않게
        retire(count, ms);
        setCaption(t('caption.plan', 'Cut by {rule} · window {size} words', { rule: ruleName(rule), size: sz }));
        setSummary(t('caption.planned', 'Chunks to cut: {count}', { count }));
        redraw();
      },
      placeChunk(index, start, end, whole, ms) {
        const at = now();
        let b = bands[index];
        if (!b) {
          // 처음 서는 덩이 — 머리 자리에서 칼이 글을 따라 끝까지 미끄러진다
          b = { s: new Tween(start), e: new Tween(start), live: new Tween(0), alive: true, pass };
          bands[index] = b;
        }
        b.alive = true;
        b.pass = pass;
        b.s.set(start, ms, at);
        b.e.set(end, ms, at);
        b.live.set(1, ms, at);
        let c = cups[index];
        if (!c) {
          c = { fill: new Tween(0), live: new Tween(0), alive: true };
          cups[index] = c;
        }
        c.alive = true;
        c.fill.set(size > 0 ? (end - start) / size : 0, ms, at);
        c.live.set(1, ms, at);
        for (const j of whole) {
          const m = marks[j];
          if (!m) continue;
          m.status = 'whole';
          m.gap.set(0, ms, at);
        }
        setSummary(
          t('caption.chunk', 'Chunk {n}: words {a}–{b}, {len} of {size}', {
            n: index + 1,
            a: start + 1,
            b: end,
            len: end - start,
            size,
          }),
        );
        redraw();
      },
      judge(broken, total, count, ms) {
        const at = now();
        retire(count, ms);
        const set = new Set(broken);
        marks.forEach((m, j) => {
          if (set.has(j)) {
            m.status = 'broken';
            m.gap.set(1, ms, at);
          } else if (m.status !== 'whole') {
            m.status = 'whole';
            m.gap.set(0, ms, at);
          }
        });
        setSummary(t('caption.judge', 'Sentences cut apart: {broken} of {total}', { broken: broken.length, total }));
        redraw();
      },
      finish(chunks, broken, stored, fill) {
        setSummary(
          t('caption.done', 'Chunks {chunks} · cut sentences {broken} · words stored {stored} · window filled {fill}%', {
            chunks,
            broken,
            stored,
            fill,
          }),
        );
      },
      destroy() {
        destroyed = true;
        if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
        if (timer !== null) clearTimeout(timer);
        frame = null;
        timer = null;
        svg.textContent = '';
      },
    };

    // 글은 projector 가 onInit 에서 편다 — 낱말 · 문장 가르기는 알고리즘의 함수 하나로만 센다.
    // initialData 가 없어도 던지지 않는다 — 빈 캔버스로 선다.
    drawLegend();
    redraw();

    return stage;
  },
};
