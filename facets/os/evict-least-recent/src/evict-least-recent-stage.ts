/**
 * evict-least-recent-stage — 지나온 때를 거슬러 짚어 가장 먼 것을 내보낸다.
 *
 * 가로가 시간이다. 위에 참조가 t1 부터 한 줄로 서고, 프레임마다 그 오른쪽에 시간 줄이
 * 달린다. 줄 위의 점이 그 프레임 페이지가 마지막으로 쓰인 때다.
 *
 * 운동:
 *   - evict — 지금 칸에서 프레임마다 화살이 같은 빠르기로 과거 쪽으로 뻗어 마지막 쓴 때에
 *     닿는다. 가장 늦게 닿는 것(가장 먼 과거)이 나가 제 때의 칸 아래 "내보냄" 줄로 내려가고,
 *     새 페이지가 참조 칸에서 그 프레임으로 내려온다
 *   - fill  — 새 페이지가 참조 칸에서 빈 프레임으로 내려온다
 *   - hit   — 그 프레임의 점이 마지막 쓴 때에서 지금으로 미끄러진다
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { EvictLeastRecentScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

const TRACE_MS = 800;
const SWAP_MS = 550;
const FILL_MS = 550;
const HIT_MS = 500;

const r1 = (n: number): number => {
  const v = Math.round(n * 10) / 10;
  return v === 0 ? 0 : v;
};

type Layout = {
  nameX: number;
  boxX: number;
  boxW: number;
  laneX0: number;
  laneX1: number;
  colW: number;
  cellW: number;
  refY: number;
  refH: number;
  rowY: number[];
  boxH: number;
  outY: number;
  countY: number;
  capY: number[];
};

function layout(nRefs: number, nFrames: number): Layout {
  const W = PIECE_CANVAS_W;
  const nameX = 12;
  const boxW = 44;
  const boxX = 70;
  const laneX0 = boxX + boxW + 16;
  const laneX1 = W - 12;
  const colW = (laneX1 - laneX0) / nRefs;
  const cellW = Math.min(44, colW - 8);
  const refY = 22;
  const refH = 32;
  const top = 88;
  const bottom = 236;
  const pitch = Math.min(56, (bottom - top) / nFrames);
  const rowY = Array.from({ length: nFrames }, (_, k) => r1(top + pitch * (k + 0.5)));
  const boxH = Math.min(36, pitch - 8);
  return {
    nameX,
    boxX,
    boxW,
    laneX0,
    laneX1,
    colW,
    cellW,
    refY,
    refH,
    rowY,
    boxH,
    outY: 256,
    countY: 290,
    capY: [312, 332],
  };
}

export const evictLeastRecentStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const rafs = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function text(
      s: string,
      x: number,
      y: number,
      opts: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
      parent: Element = svg,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
          ...(opts.weight ? { 'font-weight': opts.weight } : {}),
        },
        parent,
      );
      node.textContent = s;
      return node;
    }

    const timeLabel = (n: number): string => t('label.time', 't{n}', { n });

    type Trace = {
      line: SVGLineElement;
      head: SVGPolygonElement;
      tag: SVGTextElement;
      ring: SVGCircleElement | null;
      endX: number;
    };
    type Handles = {
      L: Layout;
      colX: (tt: number) => number;
      pageText: (SVGTextElement | null)[];
      loadedText: (SVGTextElement | null)[];
      dots: (SVGCircleElement | null)[];
      traces: (Trace | null)[];
      outChip: SVGGElement | null;
      outChipX: number;
      nowX: number;
    };

    function drawStatic(s: EvictLeastRecentScene): Handles {
      svg.textContent = '';
      const L = layout(s.refs.length, s.frames.length);
      const colX = (tt: number): number => r1(L.laneX0 + (tt - 0.5) * L.colW);
      const nowX = s.now > 0 ? colX(s.now) : L.laneX0;
      const step = s.step;

      // 참조 줄 — 지나온 것 · 지금 · 아직 오지 않은 것
      for (const [i, page] of s.refs.entries()) {
        const tt = i + 1;
        const x = colX(tt);
        const future = tt > s.now;
        const current = tt === s.now;
        text(timeLabel(tt), x, L.refY - 10, {
          size: fontSizes.xs,
          fill: current ? c.text : c.textMuted,
          anchor: 'middle',
        });
        el('rect', {
          x: x - L.cellW / 2,
          y: L.refY,
          width: L.cellW,
          height: L.refH,
          rx: 4,
          fill: future ? c.bg : c.bgSubtle,
          stroke: current ? c.accent : c.border,
          'stroke-width': current ? 2 : 1,
          ...(future ? { 'stroke-dasharray': '3 3' } : {}),
        });
        text(String(page), x, L.refY + L.refH / 2, {
          size: fontSizes.lg,
          fill: future ? c.textMuted : c.text,
          anchor: 'middle',
          mono: true,
        });
      }

      // 지금 선
      if (s.now > 0) {
        el('line', {
          x1: nowX,
          y1: L.refY + L.refH + 4,
          x2: nowX,
          y2: L.outY + 14,
          stroke: c.accent,
          'stroke-width': 1,
          'stroke-dasharray': '2 3',
        });
      }

      const pageText: (SVGTextElement | null)[] = [];
      const loadedText: (SVGTextElement | null)[] = [];
      const dots: (SVGCircleElement | null)[] = [];
      const traces: (Trace | null)[] = [];

      for (const [k, slot] of s.frames.entries()) {
        const y = L.rowY[k] ?? 0;
        const isHit = step.kind === 'hit' && step.frame === k;
        const isNew = (step.kind === 'fill' || step.kind === 'evict') && step.frame === k;
        text(t('label.frame', 'Frame {n}', { n: k }), L.nameX, y - 8, {
          size: fontSizes.xs,
          fill: c.textMuted,
        });
        el('rect', {
          x: L.boxX,
          y: y - L.boxH / 2,
          width: L.boxW,
          height: L.boxH,
          rx: 5,
          fill: slot ? c.bgSubtle : c.bg,
          stroke: isHit ? c.success : isNew ? c.itemActive : c.border,
          'stroke-width': isHit || isNew ? 2 : 1,
          ...(slot ? {} : { 'stroke-dasharray': '3 3' }),
        });
        // 시간 줄
        el('line', {
          x1: L.laneX0,
          y1: y,
          x2: L.laneX1,
          y2: y,
          stroke: c.border,
          'stroke-width': 1,
        });
        if (!slot) {
          pageText.push(null);
          loadedText.push(null);
          dots.push(null);
          traces.push(null);
          continue;
        }
        loadedText.push(
          text(t('label.loaded', 'in {t}', { t: timeLabel(slot.loadedAt) }), L.nameX, y + 9, {
            size: fontSizes.xs,
            fill: c.textMuted,
          }),
        );

        // 되짚기 화살 — 교체 걸음에만. 되짚은 것은 교체 직전의 마지막 쓴 때다
        if (step.kind === 'evict') {
          const reached = step.reach[k];
          if (reached === undefined) throw new Error(`evict-least-recent-stage: reach[${k}] 가 없다`);
          const endX = colX(reached);
          const isVictim = step.frame === k;
          const col = isVictim ? c.danger : c.itemComparing;
          const g = el('g', {});
          const line = el(
            'line',
            {
              x1: nowX,
              y1: y,
              x2: endX + 6,
              y2: y,
              stroke: col,
              'stroke-width': isVictim ? 3 : 2,
            },
            g,
          );
          const head = el(
            'polygon',
            {
              points: `${r1(endX)},${r1(y)} ${r1(endX + 8)},${r1(y - 5)} ${r1(endX + 8)},${r1(y + 5)}`,
              fill: col,
            },
            g,
          );
          const tag = text(timeLabel(reached), endX, y - 12, {
            size: fontSizes.xs,
            fill: col,
            anchor: 'middle',
            weight: isVictim ? '700' : '400',
          }, g);
          // 나가는 페이지가 마지막으로 쓰였던 자리 — 점은 이제 새 페이지의 지금으로 옮겨 갔다
          const ring = isVictim
            ? el('circle', { cx: endX, cy: y, r: 6, fill: 'none', stroke: col, 'stroke-width': 2 }, g)
            : null;
          traces.push({ line, head, tag, ring, endX });
        } else {
          traces.push(null);
        }

        dots.push(
          el('circle', {
            cx: colX(slot.lastUsed),
            cy: y,
            r: 5,
            fill: isHit ? c.success : c.text,
          }),
        );
        pageText.push(
          text(String(slot.page), L.boxX + L.boxW / 2, y, {
            size: fontSizes.lg,
            fill: c.text,
            anchor: 'middle',
            mono: true,
            weight: '700',
          }),
        );
      }

      // 내보낸 페이지 — 내보낸 때의 칸 아래
      text(t('label.out', 'Evicted'), L.nameX, L.outY, { size: fontSizes.xs, fill: c.textMuted });
      let outChip: SVGGElement | null = null;
      let outChipX = 0;
      for (const o of s.out) {
        const x = colX(o.t);
        const g = el('g', {});
        el(
          'rect',
          {
            x: x - L.cellW / 2,
            y: L.outY - 13,
            width: L.cellW,
            height: 26,
            rx: 4,
            fill: c.bg,
            stroke: c.danger,
            'stroke-width': 1,
          },
          g,
        );
        text(String(o.page), x, L.outY, {
          size: fontSizes.lg,
          fill: c.danger,
          anchor: 'middle',
          mono: true,
        }, g);
        if (step.kind === 'evict' && o.t === step.t) {
          outChip = g;
          outChipX = x;
        }
      }

      text(t('label.counts', 'Faults: {f} · Hits: {h}', { f: s.faults, h: s.hits }), L.nameX, L.countY, {
        size: fontSizes.sm,
        fill: c.text,
        weight: '600',
      });

      // 캡션 — 지금 일어나는 일만
      const lines: string[] = [];
      if (step.kind === 'start') {
        lines.push(t('caption.start', 'Empty frames: {n}. References arrive left to right.', { n: s.frames.length }));
      } else if (step.kind === 'fill') {
        lines.push(
          t('caption.fill', 'Page {page}: fault. It goes into empty frame {frame}.', {
            page: step.page,
            frame: step.frame,
          }),
        );
      } else if (step.kind === 'hit') {
        lines.push(
          t('caption.hit', 'Page {page}: hit. Only its last use moves, from {was} to {now}.', {
            page: step.page,
            was: timeLabel(step.was),
            now: timeLabel(step.t),
          }),
        );
      } else {
        const when = step.reach[step.frame];
        if (when === undefined) throw new Error('evict-least-recent-stage: 내보낸 프레임의 reach 가 없다');
        lines.push(
          t('caption.evict', 'Page {page}: fault, no free frame. Looking back, the farthest is page {victim} at {when} — out.', {
            page: step.page,
            victim: step.victim,
            when: timeLabel(when),
          }),
        );
        if (step.stays) {
          lines.push(
            t('caption.stays', 'Page {stay} came in first ({in}), but was used at {used}. It stays.', {
              stay: step.stays.page,
              in: timeLabel(step.stays.loadedAt),
              used: timeLabel(step.stays.used),
            }),
          );
        }
      }
      for (const [i, line] of lines.entries()) {
        text(line, L.nameX, L.capY[i] ?? L.capY[0] ?? 0, {
          size: fontSizes.sm,
          fill: i === 0 ? c.text : c.textMuted,
        });
      }

      return { L, colX, pageText, loadedText, dots, traces, outChip, outChipX, nowX };
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        let done = false;
        let start: number | null = null;
        let id = 0;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          rafs.delete(id);
          resolve();
        };
        waiters.add(finish);
        const tick = (ts: number): void => {
          rafs.delete(id);
          if (done) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          if (start === null) start = ts;
          const p = Math.min(1, (ts - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          rafs.add(id);
        };
        id = requestAnimationFrame(tick);
        rafs.add(id);
      });
    }

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
    const live = (mine: number): boolean => mine === gen && !destroyed;
    const move = (node: Element, dx: number, dy: number): void => {
      node.setAttribute('transform', `translate(${r1(dx)},${r1(dy)})`);
    };

    async function animate(s: EvictLeastRecentScene, h: Handles, mine: number): Promise<void> {
      const step = s.step;
      const { L } = h;
      const refCy = L.refY + L.refH / 2;
      const boxCx = L.boxX + L.boxW / 2;

      if (step.kind === 'hit') {
        const dot = h.dots[step.frame];
        if (!dot) return;
        const from = h.colX(step.was) - h.nowX;
        move(dot, from, 0);
        await tween(HIT_MS, mine, (p) => move(dot, from * (1 - ease(p)), 0));
        return;
      }

      if (step.kind === 'fill') {
        const pt = h.pageText[step.frame];
        const y = L.rowY[step.frame] ?? 0;
        const dot = h.dots[step.frame];
        const loaded = h.loadedText[step.frame];
        if (!pt) return;
        const dx = h.nowX - boxCx;
        const dy = refCy - y;
        move(pt, dx, dy);
        dot?.setAttribute('visibility', 'hidden');
        loaded?.setAttribute('visibility', 'hidden');
        await tween(FILL_MS, mine, (p) => {
          const q = 1 - ease(p);
          move(pt, dx * q, dy * q);
        });
        return;
      }

      if (step.kind !== 'evict') return;

      // 1) 되짚기 — 모든 화살이 같은 빠르기로 과거 쪽으로 뻗는다
      const lens = h.traces.map((tr) => (tr ? h.nowX - tr.endX : 0));
      const maxLen = Math.max(1, ...lens);
      const y = L.rowY[step.frame] ?? 0;
      const victimTrace = h.traces[step.frame];
      const pt = h.pageText[step.frame];
      const dot = h.dots[step.frame];
      const loaded = h.loadedText[step.frame];
      const chip = h.outChip;
      const setTrace = (k: number, len: number): void => {
        const tr = h.traces[k];
        if (!tr) return;
        const full = lens[k] ?? 0;
        const endNow = h.nowX - len;
        tr.line.setAttribute('x2', String(r1(Math.min(h.nowX, endNow + 6))));
        move(tr.head, endNow - tr.endX, 0);
        tr.tag.setAttribute('visibility', len >= full ? 'visible' : 'hidden');
        tr.ring?.setAttribute('visibility', len >= full ? 'visible' : 'hidden');
        if (k === step.frame) {
          const col = len >= full ? c.danger : c.itemComparing;
          tr.line.setAttribute('stroke', col);
          tr.head.setAttribute('fill', col);
        }
      };
      for (const k of h.traces.keys()) setTrace(k, 0);
      // 새 페이지는 아직 참조 칸에, 내보낼 페이지는 아직 프레임 안에
      const dxIn = h.nowX - boxCx;
      const dyIn = refCy - y;
      if (pt) move(pt, dxIn, dyIn);
      loaded?.setAttribute('visibility', 'hidden');
      const victimReach = step.reach[step.frame] ?? step.t;
      const dotFrom = h.colX(victimReach) - h.nowX;
      if (dot) move(dot, dotFrom, 0);
      const dxOut = boxCx - h.outChipX;
      const dyOut = y - L.outY;
      if (chip) move(chip, dxOut, dyOut);

      await tween(TRACE_MS, mine, (p) => {
        const d = p * maxLen;
        for (const k of h.traces.keys()) setTrace(k, Math.min(lens[k] ?? 0, d));
      });
      if (!live(mine)) return;
      if (victimTrace) setTrace(step.frame, lens[step.frame] ?? 0);

      // 2) 가장 먼 것이 나가고 새 페이지가 그 자리에
      await tween(SWAP_MS, mine, (p) => {
        const q = 1 - ease(p);
        if (chip) move(chip, dxOut * q, dyOut * q);
        if (pt) move(pt, dxIn * q, dyIn * q);
        if (dot) move(dot, dotFrom * q, 0);
      });
    }

    return {
      async render(next: EvictLeastRecentScene, prev: EvictLeastRecentScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null || next.step.kind === 'start') return;
        await animate(next, h, mine);
        if (live(mine)) drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of rafs) cancelAnimationFrame(id);
        rafs.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
