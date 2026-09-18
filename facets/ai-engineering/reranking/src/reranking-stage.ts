/**
 * reranking stage — 첫 단계 줄 위에 재순위 문턱이 걸린다.
 *
 * 왼쪽은 첫 단계가 세운 자리 열둘이다. 문서는 번호가 적힌 원으로 서고, 사람이 매긴
 * 정답은 원의 테로 보인다. 위쪽 음영 구역이 재순위기에 넘기는 몫이고 그 아래 끝이
 * **문턱**이다. 손잡이를 돌리면 문턱이 내려가거나 올라가 후보를 더 삼키거나 뱉는다.
 * 재순위기가 읽은 문서에만 점수 막대가 자란다 — 문턱 밖은 읽지 않았으니 막대가 없다.
 * 다시 세우는 걸음에서 구역 안 문서들이 재순위 점수대로 **솟거나 가라앉고**, 떠난
 * 자리에서 새 자리로 호가 이어진다. 문턱 밖은 제자리에 멈춰 있다.
 *
 * 오른쪽은 위 3 — 맥락에 넣을 셋 — 의 글이다.
 *
 * 운동은 rAF 하나로 흘린다. 길이는 projector 가 재생 속도로 셈해 넘긴다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 510;

/** 줄 자리 */
const SLOT_Y0 = 84;
const SLOT_H = 30;
const RANK_X = 16;
const DISK_X = 84;
const DISK_R = 12;
const FIRST_X = 104;
const BAR_X = 134;
const BAR_MAX = 272;
const ZONE_X = 4;
const ZONE_W = 462;
const ZONE_TOP = 66;
const ARC_X = DISK_X - DISK_R - 4;

/** 오른쪽 위 3 */
const PANEL_X = 490;
const PANEL_W = W - PANEL_X - 6;
const CARD_Y0 = 70;
const CARD_H = 92;
const CARD_GAP = 10;

const LEGEND_Y = 458;
const CAPTION_Y = 480;

type Doc = { id: number; text: string; relevant: boolean; first: number };

/** projector 가 부르는 표면 */
export type RerankingStage = {
  setRound(n: number, order: number[], dur: number): void;
  readDoc(doc: number, score: number, dur: number): void;
  reorder(order: number[], dur: number): void;
  showTop(top: number[], dur: number): void;
  setCaption(line1: string, line2: string): void;
};

function narrowDocs(raw: unknown): { query: string; docs: Doc[] } {
  const out: Doc[] = [];
  let query = '';
  if (raw && typeof raw === 'object') {
    const q = (raw as { query?: unknown }).query;
    if (typeof q === 'string') query = q;
    const ds = (raw as { docs?: unknown }).docs;
    if (Array.isArray(ds)) {
      for (const d of ds) {
        if (!d || typeof d !== 'object') continue;
        const { id, text, relevant, first } = d as Record<string, unknown>;
        if (typeof id !== 'number' || typeof text !== 'string') continue;
        out.push({
          id,
          text,
          relevant: relevant === true,
          first: typeof first === 'number' ? first : 0,
        });
      }
    }
  }
  return { query, docs: out };
}

const slotY = (slot: number): number => SLOT_Y0 + slot * SLOT_H;
/** 넘기는 수 n 의 문턱 높이 — n 번째 자리 바로 아래. */
const thresholdY = (n: number): number => SLOT_Y0 + (n - 1) * SLOT_H + SLOT_H / 2;
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const r1 = (x: number): number => Math.round(x * 10) / 10 || 0;

/** 글자 수로 어림해 줄을 가른다 — 낱말 경계에서만. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur === '' ? w : `${cur} ${w}`;
    if (next.length > maxChars && cur !== '') {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

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

type Tween = { from: number; to: number; start: number; dur: number; set: (v: number) => void };

export const rerankingStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const { query, docs } = narrowDocs(params.initialData);
    const byId = new Map<number, Doc>();
    for (const d of docs) byId.set(d.id, d);
    const total = docs.length;

    // ── 상태 (DOM 이 아니라 여기가 정본이다)
    /** 문서 → 지금 그려진 자리(0 부터, 실수 — 운동 중) */
    const rowPos = new Map<number, number>();
    /** 문서 → 이번 판의 출발 자리 (호를 그릴 때) */
    const originSlot = new Map<number, number>();
    /** 문서 → 재순위 점수 (이번 판에 읽은 것만) */
    const seen = new Map<number, number>();
    /** 문서 → 막대가 자란 비율 0..1 */
    const barGrow = new Map<number, number>();
    let arcsOn = false;
    let shortlistN = 0;
    let zoneBottom = ZONE_TOP;
    let active: number | null = null;
    let topDocs: number[] = [];
    let topFresh = true;
    let cardShift = 0;
    let caption1 = '';
    let caption2 = '';
    docs.forEach((d, i) => {
      rowPos.set(d.id, i);
      originSlot.set(d.id, i);
    });

    // ── 운동 — rAF 하나
    const tweens = new Map<string, Tween>();
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;
    let looping = false;
    const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const raf = (cb: (ts: number) => void): void => {
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame((ts) => {
          frames.delete(id);
          cb(ts);
        });
        frames.add(id);
      } else {
        const id = setTimeout(() => {
          timers.delete(id);
          cb(now());
        }, 16);
        timers.add(id);
      }
    };
    function tick(): void {
      if (destroyed) return;
      const ts = now();
      for (const [key, tw] of tweens) {
        const p = tw.dur <= 0 ? 1 : Math.min(1, (ts - tw.start) / tw.dur);
        tw.set(tw.from + (tw.to - tw.from) * ease(p));
        if (p >= 1) tweens.delete(key);
      }
      draw();
      if (tweens.size > 0) raf(tick);
      else looping = false;
    }
    function tweenTo(key: string, from: number, to: number, dur: number, set: (v: number) => void): void {
      if (destroyed) return;
      if (dur <= 0 || from === to) {
        tweens.delete(key);
        set(to);
        return;
      }
      tweens.set(key, { from, to, start: now(), dur, set });
      if (!looping) {
        looping = true;
        raf(tick);
      }
    }

    // ── 그리기 — 상태에서 화면 전체를 세운다
    const root = el('g', {}, svg);

    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    }

    function draw(): void {
      root.textContent = '';
      if (total === 0) return;

      // 질의
      text(root, 8, 22, t('label.query', 'Query'), { fill: c.textMuted, size: fontSizes.xs });
      text(root, 60, 22, query, { mono: true, size: fontSizes.sm, weight: '600' });

      // 머리
      text(root, RANK_X, 52, t('head.rank', 'rank'), { fill: c.textMuted, size: fontSizes.xs });
      text(root, FIRST_X, 52, t('head.first', 'first'), { fill: c.textMuted, size: fontSizes.xs });
      text(root, BAR_X + 14, 52, t('head.cross', 'reranker score'), { fill: c.textMuted, size: fontSizes.xs });

      // 재순위 구역과 문턱
      const zoneH = Math.max(0, zoneBottom - ZONE_TOP);
      el(
        'rect',
        { x: ZONE_X, y: ZONE_TOP, width: ZONE_W, height: r1(zoneH), rx: 6, fill: c.bgSubtle, stroke: c.border },
        root,
      );
      el(
        'line',
        {
          x1: ZONE_X,
          x2: ZONE_X + ZONE_W,
          y1: r1(zoneBottom),
          y2: r1(zoneBottom),
          stroke: c.accent,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        },
        root,
      );
      if (shortlistN > 0) {
        text(root, BAR_X, zoneBottom + 12, t('label.threshold', 'the reranker reads above this line: {n}', { n: shortlistN }), {
          fill: c.textMuted,
          size: fontSizes.xs,
        });
      }

      // 위 3 괄호
      el(
        'line',
        {
          x1: ZONE_X + 2,
          x2: ZONE_X + 2,
          y1: slotY(0) - SLOT_H / 2 + 4,
          y2: slotY(2) + SLOT_H / 2 - 4,
          stroke: c.primary,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        },
        root,
      );

      // 자리 번호 — 자리는 움직이지 않는다
      for (let s = 0; s < total; s++) {
        text(root, RANK_X, slotY(s), String(s + 1), {
          fill: s < 3 ? c.text : c.textMuted,
          weight: s < 3 ? '700' : '400',
          mono: true,
        });
      }

      // 떠난 자리 → 지금 자리 호
      if (arcsOn) {
        for (const d of docs) {
          const from = originSlot.get(d.id) ?? 0;
          const pos = rowPos.get(d.id) ?? from;
          const y0 = slotY(from);
          const y1 = slotY(pos);
          if (Math.abs(y1 - y0) < 0.5) continue;
          const bulge = Math.min(ARC_X - RANK_X - 12, 6 + Math.abs(y1 - y0) * 0.12);
          const rising = y1 < y0;
          el(
            'path',
            {
              d: `M ${r1(ARC_X)} ${r1(y0)} Q ${r1(ARC_X - bulge)} ${r1((y0 + y1) / 2)} ${r1(ARC_X)} ${r1(y1)}`,
              fill: 'none',
              stroke: rising ? c.itemActive : c.textMuted,
              'stroke-width': rising ? 2 : 1.2,
              'stroke-dasharray': rising ? '' : '3 3',
            },
            root,
          );
          el('circle', { cx: DISK_X, cy: r1(y0), r: DISK_R - 3, fill: 'none', stroke: c.border, 'stroke-dasharray': '2 2' }, root);
        }
      }

      // 문서 — 자리를 따라 움직인다
      for (const d of docs) {
        const pos = rowPos.get(d.id) ?? 0;
        const y = slotY(pos);
        const inside = pos < shortlistN - 0.001 || (seen.has(d.id) && pos < shortlistN + 0.5);
        const g = el('g', { opacity: inside || shortlistN === 0 ? 1 : 0.5 }, root);
        const isActive = active === d.id;
        el(
          'circle',
          {
            cx: DISK_X,
            cy: r1(y),
            r: DISK_R,
            fill: c.bg,
            stroke: isActive ? c.accent : d.relevant ? c.success : c.border,
            'stroke-width': isActive ? 3.5 : d.relevant ? 2.5 : 1,
          },
          g,
        );
        text(g, DISK_X, y + 0.5, String(d.id), { anchor: 'middle', size: fontSizes.xs, weight: '600', mono: true });
        text(g, FIRST_X, y, String(d.first), { fill: c.textMuted, size: fontSizes.xs, mono: true });
        const score = seen.get(d.id);
        if (score !== undefined) {
          const grow = barGrow.get(d.id) ?? 1;
          const w = (BAR_MAX * score * grow) / 100;
          el(
            'rect',
            { x: BAR_X, y: r1(y - 6), width: r1(Math.max(0, w)), height: 12, rx: 3, fill: c.primary },
            g,
          );
          if (grow > 0.05) {
            text(g, BAR_X + w + 6, y, String(score), { size: fontSizes.xs, mono: true, weight: '600' });
          }
        }
      }

      // 범례
      el('circle', { cx: 14, cy: LEGEND_Y, r: 6, fill: c.bg, stroke: c.success, 'stroke-width': 2.5 }, root);
      text(root, 26, LEGEND_Y, t('legend.relevant', 'green ring: relevant'), {
        fill: c.textMuted,
        size: fontSizes.xs,
      });
      el('rect', { x: 250, y: LEGEND_Y - 5, width: 16, height: 10, rx: 2, fill: c.primary }, root);
      text(root, 272, LEGEND_Y, t('legend.bar', 'bar: reranker score, only for documents passed over'), {
        fill: c.textMuted,
        size: fontSizes.xs,
      });

      // 위 3
      text(root, PANEL_X, 52, t('head.top', 'Top 3 — what goes into the context'), {
        size: fontSizes.sm,
        weight: '700',
      });
      const maxChars = Math.floor((PANEL_W - 44) / 6.4);
      for (let k = 0; k < 3; k++) {
        const y = CARD_Y0 + k * (CARD_H + CARD_GAP);
        const doc = byId.get(topDocs[k] ?? -1);
        const g = el(
          'g',
          { transform: `translate(${r1(-cardShift * (k + 1) * 14)} 0)`, opacity: topFresh ? 1 : 0.45 },
          root,
        );
        el(
          'rect',
          {
            x: PANEL_X,
            y,
            width: PANEL_W,
            height: CARD_H,
            rx: 6,
            fill: c.bg,
            stroke: doc?.relevant ? c.success : c.border,
            'stroke-width': doc?.relevant ? 2 : 1,
          },
          g,
        );
        text(g, PANEL_X + 14, y + 18, String(k + 1), { weight: '700', mono: true, size: fontSizes.md });
        if (!doc) continue;
        text(g, PANEL_X + 36, y + 18, t('label.doc', 'document {doc}', { doc: doc.id }), {
          fill: c.textMuted,
          size: fontSizes.xs,
          mono: true,
        });
        const lines = wrap(doc.text, maxChars).slice(0, 3);
        lines.forEach((line, i) => {
          text(g, PANEL_X + 36, y + 38 + i * 15, line, { size: fontSizes.sm });
        });
        text(
          g,
          PANEL_X + PANEL_W - 10,
          y + 18,
          doc.relevant ? t('label.relevant', 'relevant') : t('label.offTopic', 'off-topic'),
          { anchor: 'end', size: fontSizes.xs, weight: '600', fill: doc.relevant ? c.success : c.textMuted },
        );
      }

      // 캡션 — 지금 일어나는 일만
      text(root, 8, CAPTION_Y, caption1, { size: fontSizes.sm });
      text(root, 8, CAPTION_Y + 20, caption2, { size: fontSizes.sm, fill: c.textMuted });
    }

    /** 문서들을 자리 목록대로 옮긴다. */
    function moveRows(order: number[], dur: number): void {
      order.forEach((doc, slot) => {
        const from = rowPos.get(doc) ?? slot;
        tweenTo(`row:${doc}`, from, slot, dur, (v) => rowPos.set(doc, v));
      });
    }

    const stage: RerankingStage = {
      setRound(n, order, dur) {
        // 앞 판의 결과가 첫 단계 차례로 돌아가고, 문턱이 새 자리로 옮겨 간다.
        active = null;
        arcsOn = false;
        for (const d of docs) {
          if (!seen.has(d.id)) continue;
          const from = barGrow.get(d.id) ?? 1;
          tweenTo(`bar:${d.id}`, from, 0, dur * 0.6, (v) => {
            barGrow.set(d.id, v);
            if (v <= 0) seen.delete(d.id);
          });
        }
        moveRows(order, dur);
        order.forEach((doc, slot) => originSlot.set(doc, slot));
        shortlistN = n;
        tweenTo('zone', zoneBottom, thresholdY(n), dur, (v) => {
          zoneBottom = v;
        });
        topFresh = false;
        draw();
      },
      readDoc(doc, score, dur) {
        active = doc;
        tweens.delete(`bar:${doc}`);
        seen.set(doc, score);
        barGrow.set(doc, 0);
        tweenTo(`bar:${doc}`, 0, 1, dur, (v) => barGrow.set(doc, v));
        draw();
      },
      reorder(order, dur) {
        active = null;
        arcsOn = true;
        moveRows(order, dur);
        draw();
      },
      showTop(top, dur) {
        topDocs = top.slice(0, 3);
        topFresh = true;
        tweenTo('cards', 1, 0, dur, (v) => {
          cardShift = v;
        });
        draw();
      },
      setCaption(line1, line2) {
        caption1 = line1;
        caption2 = line2;
        draw();
      },
    };

    zoneBottom = ZONE_TOP;
    draw();

    return {
      ...stage,
      destroy() {
        destroyed = true;
        tweens.clear();
        if (typeof cancelAnimationFrame === 'function') for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        svg.textContent = '';
      },
    };
  },
};
