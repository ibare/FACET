/**
 * cross-validation 무대 — 위에서 아래로 넷.
 *
 *   항목 줄   항목 스물이 항목 차례로 기다리는 곳 (걸음 0)
 *   자리 줄   섞은 차례의 자리 스물, k 폴드로 무리 지은 칸. 항목이 여기 앉고 섞음마다 새 자리로 옮겨 앉는다.
 *             시험지 틀이 폴드에서 폴드로 옮겨 가고, 판정 표지(✓ · ✗)가 항목 위에 선다
 *   가름점 줄 x 축 위에 폴드마다 선 가름점 눈금 — 수로 띄우지 않고 자리로만
 *   점수 띠   섞음마다 점수 한 점이 떨어져 쌓인다. 새 판에서는 앞 판의 점 자리가 빈 원으로 남고,
 *             이 판의 같은 섞음 점수가 나오면 그 자리에서 새 자리로 옮겨 간다 — 점수 무리가 오므라드는 것
 *
 * 무대는 셈하지 않는다 — 자리의 폴드 · 가름점 · 판정 · 점수 · 쌓일 높이 · 가장 낮음 · 높음 · 폭은 projector 가
 * 알고리즘의 payload 에서 받아 넘긴다. 무대가 하는 것은 자리를 좌표로 옮기는 일뿐이다.
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
import type {
  CrossValidationStage,
  StageCall,
} from './projector.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 500;

const TILE = 24;
const PITCH = 28;
const POOL_Y = 84;
const SEAT_Y = 142;
const MARK_Y = 118;
const BRACKET_Y = 162;
const CUT_Y = 226;
const CUT_X0 = 40;
const CUT_X1 = 680;
const CUT_MAX = 10;
const STRIP_Y = 440;
const STRIP_X0 = 40;
const STRIP_X1 = 680;
const DOT_R = 9;
const DOT_LIFT = 20;
const DROP_FROM = 284;

type Pt = { x: number; y: number };
type ItemNode = { g: SVGGElement; rect: SVGRectElement; mark: SVGTextElement; pos: Pt; cls: number };
type DotNode = { g: SVGGElement; circle: SVGCircleElement; label: SVGTextElement; pos: Pt; solid: boolean };

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
/** 전체 진행 u 가운데 [a, b] 구간의 진행 */
const part = (u: number, a: number, b: number): number => Math.max(0, Math.min(1, (u - a) / (b - a)));

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const cutX = (x: number): number => CUT_X0 + (Math.max(0, Math.min(CUT_MAX, x)) / CUT_MAX) * (CUT_X1 - CUT_X0);
const stripX = (pct: number): number => STRIP_X0 + (pct / 100) * (STRIP_X1 - STRIP_X0);
const dotAt = (pct: number, stack: number): Pt => ({ x: stripX(pct), y: STRIP_Y - DOT_R - 3 - stack * DOT_LIFT });

export const crossValidationStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const [cls0, cls1] = categorical(2, 'vivid');
    if (cls0 === undefined || cls1 === undefined) throw new Error('부류 색 둘을 얻지 못했다');
    const clsColor = (cls: number): string => {
      if (cls === 0) return cls0;
      if (cls === 1) return cls1;
      throw new Error(`모르는 부류 ${cls}`);
    };
    const isInstant = params.isInstant ?? (() => false);
    const sm = parseFloat(fontSizes.sm);

    const root = el('g');
    svg.appendChild(root);

    // ── 고정 바탕: 캡션 · 범례 · 가름점 축 · 점수 축 ─────────────────────────
    const caption = el('text', { x: 20, y: 24, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text });
    root.appendChild(caption);

    const legend = el('g');
    root.appendChild(legend);
    let lx = 20;
    const legendText = (text: string): void => {
      const node = el('text', { x: lx, y: 50, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted });
      node.textContent = text;
      legend.appendChild(node);
      let w = 0;
      for (const ch of text) w += ch.charCodeAt(0) > 0x1000 ? sm : sm * 0.6;
      lx += w + 22;
    };
    legend.appendChild(el('rect', { x: lx, y: 40, width: 12, height: 12, rx: 2, fill: cls0 }));
    lx += 17;
    legendText(t('label.class0', 'Class 0'));
    legend.appendChild(el('rect', { x: lx, y: 40, width: 12, height: 12, rx: 2, fill: cls1 }));
    lx += 17;
    legendText(t('label.class1', 'Class 1'));
    legend.appendChild(el('rect', { x: lx, y: 39, width: 16, height: 14, rx: 3, fill: 'none', stroke: c.primary, 'stroke-width': 2.5 }));
    lx += 21;
    legendText(t('label.testSeat', 'Test fold'));
    const wrongKey = el('text', { x: lx, y: 50, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.danger, 'font-weight': 700 });
    wrongKey.textContent = '✗';
    legend.appendChild(wrongKey);
    lx += 14;
    legendText(t('label.wrong', 'Called wrong'));

    const cutAxis = el('g');
    root.appendChild(cutAxis);
    const cutTitle = el('text', { x: CUT_X0, y: CUT_Y - 26, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted });
    cutTitle.textContent = t('label.cutLine', 'Cut of each test fold, on x');
    cutAxis.appendChild(cutTitle);
    cutAxis.appendChild(el('line', { x1: CUT_X0, y1: CUT_Y, x2: CUT_X1, y2: CUT_Y, stroke: c.border, 'stroke-width': 1.5 }));
    for (let v = 0; v <= CUT_MAX; v++) {
      cutAxis.appendChild(el('line', { x1: cutX(v), y1: CUT_Y, x2: cutX(v), y2: CUT_Y + 4, stroke: c.border }));
      const lab = el('text', {
        x: cutX(v),
        y: CUT_Y + 16,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      lab.textContent = String(v);
      cutAxis.appendChild(lab);
    }
    const ticks = el('g');
    root.appendChild(ticks);

    const stripAxis = el('g');
    root.appendChild(stripAxis);
    const stripTitle = el('text', { x: STRIP_X0, y: DROP_FROM - 8, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted });
    stripTitle.textContent = t('label.scoreStrip', 'Score of each shuffle (%)');
    stripAxis.appendChild(stripTitle);
    stripAxis.appendChild(el('line', { x1: STRIP_X0, y1: STRIP_Y, x2: STRIP_X1, y2: STRIP_Y, stroke: c.border, 'stroke-width': 1.5 }));
    for (let v = 0; v <= 100; v += 10) {
      stripAxis.appendChild(el('line', { x1: stripX(v), y1: STRIP_Y, x2: stripX(v), y2: STRIP_Y + 4, stroke: c.border }));
      const lab = el('text', {
        x: stripX(v),
        y: STRIP_Y + 16,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      lab.textContent = String(v);
      stripAxis.appendChild(lab);
    }

    // ── 움직이는 것들 ────────────────────────────────────────────────────────
    const seatLayer = el('g');
    const bracketLayer = el('g');
    const frame = el('rect', { rx: 5, fill: 'none', stroke: c.primary, 'stroke-width': 2.5, opacity: 0 });
    const itemLayer = el('g');
    const spreadLayer = el('g');
    const dotLayer = el('g');
    root.append(seatLayer, bracketLayer, itemLayer, frame, spreadLayer, dotLayer);

    let seats: SVGRectElement[] = [];
    let seatX: number[] = [];
    let seatFold: number[] = [];
    let items: ItemNode[] = [];
    let dots: DotNode[] = [];
    let used = 0;
    let cutsShown: number[] = [];
    const framePos = { x: 0, w: 0 };

    const foldBox = (f: number): { x: number; w: number } => {
      let lo = Infinity;
      let hi = -Infinity;
      seatFold.forEach((g, p) => {
        if (g !== f) return;
        const x = seatX[p];
        if (x === undefined) throw new Error(`자리 ${p} 의 좌표가 없다`);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x + TILE);
      });
      if (lo === Infinity) throw new Error(`폴드 ${f} 에 자리가 없다`);
      return { x: lo - 4, w: hi - lo + 8 };
    };

    const placeItem = (node: ItemNode, p: Pt): void => {
      node.pos = p;
      node.g.setAttribute('transform', `translate(${p.x} ${p.y})`);
    };
    const placeDot = (node: DotNode, p: Pt): void => {
      node.pos = p;
      node.g.setAttribute('transform', `translate(${p.x} ${p.y})`);
    };
    const placeFrame = (x: number, w: number): void => {
      framePos.x = x;
      framePos.w = w;
      frame.setAttribute('x', String(x));
      frame.setAttribute('width', String(w));
    };

    // ── 운동: 한 번에 하나. 새 운동이 오면 앞 것은 끝 모습으로 건너뛴다 ────────
    let frameId: number | null = null;
    let finish: (() => void) | null = null;
    const stopMotion = (): void => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      const f = finish;
      finish = null;
      if (f) f();
    };
    const run = (ms: number, draw: (u: number) => void): void => {
      stopMotion();
      if (ms <= 0 || isInstant()) {
        draw(1);
        return;
      }
      finish = () => draw(1);
      const t0 = performance.now();
      const tick = (now: number): void => {
        const u = Math.min(1, (now - t0) / ms);
        draw(u);
        if (u < 1 && !isInstant()) {
          frameId = requestAnimationFrame(tick);
        } else {
          if (u < 1) draw(1);
          frameId = null;
          finish = null;
        }
      };
      frameId = requestAnimationFrame(tick);
    };
    params.onScrubStart?.(() => stopMotion());

    const seatPt = (p: number): Pt => {
      const x = seatX[p];
      if (x === undefined) throw new Error(`자리 ${p} 가 없다`);
      return { x, y: SEAT_Y - TILE / 2 };
    };
    const poolPt = (i: number): Pt => {
      const left = (W - (items.length * PITCH - (PITCH - TILE))) / 2;
      return { x: left + i * PITCH, y: POOL_Y - TILE / 2 };
    };
    const itemNode = (i: number): ItemNode => {
      const node = items[i];
      if (node === undefined) throw new Error(`항목 ${i} 가 무대에 없다`);
      return node;
    };

    /** 섞은 차례대로 자리로 — 운동의 앞/뒤 자리 */
    const moveTargets = (order: number[]): { node: ItemNode; from: Pt; to: Pt }[] => {
      if (order.length !== items.length) throw new Error('섞은 차례의 길이가 항목 수와 다르다');
      return order.map((i, p) => {
        const node = itemNode(i);
        return { node, from: { ...node.pos }, to: seatPt(p) };
      });
    };
    const drawMoves = (moves: { node: ItemNode; from: Pt; to: Pt }[], u: number): void => {
      const e = ease(u);
      for (const m of moves) {
        // 옮겨 앉을 때 살짝 들렸다 내려앉는다
        const lift = Math.sin(Math.PI * u) * 14;
        placeItem(m.node, { x: lerp(m.from.x, m.to.x, e), y: lerp(m.from.y, m.to.y, e) - lift });
      }
    };

    const clearMarks = (): void => {
      for (const node of items) {
        node.mark.textContent = '';
        node.rect.setAttribute('stroke', c.bg);
        node.rect.setAttribute('stroke-width', '1');
      }
    };
    const clearTicks = (): void => {
      ticks.replaceChildren();
    };
    const hideFrame = (): void => {
      frame.setAttribute('opacity', '0');
    };

    const addTick = (cut: number, current: boolean): SVGLineElement => {
      const x = cutX(cut);
      const line = el('line', {
        x1: x,
        y1: CUT_Y - 12,
        x2: x,
        y2: CUT_Y + 2,
        stroke: current ? c.primary : c.textMuted,
        'stroke-width': current ? 3 : 1.5,
      });
      ticks.appendChild(line);
      return line;
    };

    /** 시험지 틀이 폴드 0 … used−1 을 차례로 지나며 u 에 맞춰 가름점 눈금(과 판정)을 세운다. */
    const sweep = (cuts: number[], calls: StageCall[] | null) => {
      if (cuts.length !== used) throw new Error(`가름점 ${cuts.length} 개 — 시험지 폴드 ${used} 개와 다르다`);
      const lines: SVGLineElement[] = [];
      let shownFold = -1;
      return (u: number): void => {
        const upto = Math.min(used - 1, Math.floor(u * used - 1e-9));
        const fold = u >= 1 ? used - 1 : Math.max(0, upto);
        while (shownFold < fold) {
          shownFold += 1;
          const prev = lines[lines.length - 1];
          if (prev) {
            prev.setAttribute('stroke', c.textMuted);
            prev.setAttribute('stroke-width', '1.5');
          }
          lines.push(addTick(cuts[shownFold] as number, true));
          if (calls) {
            for (const call of calls) {
              if (call.fold !== shownFold) continue;
              const node = itemNode(call.item);
              node.mark.textContent = call.right ? '✓' : '✗';
              node.mark.setAttribute('fill', call.right ? c.text : c.danger);
              node.rect.setAttribute('stroke', call.right ? c.bg : c.danger);
              node.rect.setAttribute('stroke-width', call.right ? '1' : '3');
            }
          }
          const box = foldBox(shownFold);
          frame.setAttribute('opacity', '1');
          frame.setAttribute('y', String(SEAT_Y - TILE / 2 - 5));
          frame.setAttribute('height', String(TILE + 10));
          placeFrame(box.x, box.w);
        }
      };
    };

    /** 섞음 s 의 점 — 앞 판의 빈 원이 있으면 거기서, 없으면 위에서 떨어진다. */
    const dropDot = (shuffle: number, pct: number, stack: number) => {
      let node = dots[shuffle];
      if (node === undefined) {
        const g = el('g');
        const circle = el('circle', { r: DOT_R });
        const label = el('text', {
          y: 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': 700,
        });
        g.append(circle, label);
        dotLayer.appendChild(g);
        node = { g, circle, label, pos: { x: dotAt(pct, stack).x, y: DROP_FROM }, solid: false };
        dots[shuffle] = node;
        placeDot(node, node.pos);
      }
      const dot = node;
      dot.solid = true;
      dot.circle.setAttribute('fill', c.primary);
      dot.circle.setAttribute('stroke', c.primary);
      dot.circle.removeAttribute('stroke-dasharray');
      dot.label.setAttribute('fill', c.textInverse);
      dot.label.textContent = String(shuffle + 1);
      dotLayer.appendChild(dot.g);
      const from = { ...dot.pos };
      const to = dotAt(pct, stack);
      return (u: number): void => {
        const e = ease(u);
        placeDot(dot, { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e) });
      };
    };

    const clearSpread = (): void => {
      spreadLayer.replaceChildren();
    };

    const stage: CrossValidationStage = {
      reset() {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
        finish = null;
        seatLayer.replaceChildren();
        bracketLayer.replaceChildren();
        itemLayer.replaceChildren();
        dotLayer.replaceChildren();
        clearTicks();
        clearSpread();
        hideFrame();
        seats = [];
        seatX = [];
        seatFold = [];
        items = [];
        dots = [];
        used = 0;
        cutsShown = [];
        caption.textContent = '';
      },
      setCaption(text) {
        caption.textContent = text;
      },
      start(s, ms) {
        stopMotion();
        if (s.seatFold.length !== s.items.length) throw new Error('자리 수가 항목 수와 다르다');
        used = s.used;
        seatFold = [...s.seatFold];
        // 자리 좌표 — 폴드 사이에 틈. 폴드 수가 바뀌면 칸 무리가 새로 갈라지며 옮겨 간다
        const n = seatFold.length;
        const gap = s.k > 1 ? Math.min(40, (W - 40 - n * PITCH) / (s.k - 1)) : 0;
        const total = n * PITCH - (PITCH - TILE) + (s.k - 1) * gap;
        const left = (W - total) / 2;
        const fromX = [...seatX];
        seatX = seatFold.map((f, p) => left + p * PITCH + f * gap);

        if (seats.length !== n) {
          seatLayer.replaceChildren();
          seats = seatFold.map(() => {
            const r = el('rect', {
              y: SEAT_Y - TILE / 2,
              width: TILE,
              height: TILE,
              rx: 4,
              fill: c.bgSubtle,
              stroke: c.border,
              'stroke-dasharray': '3 2',
            });
            seatLayer.appendChild(r);
            return r;
          });
        }
        bracketLayer.replaceChildren();
        for (let f = 0; f < s.k; f++) {
          const box = foldBox(f);
          bracketLayer.appendChild(
            el('line', { x1: box.x + 4, y1: BRACKET_Y, x2: box.x + box.w - 4, y2: BRACKET_Y, stroke: c.textMuted, 'stroke-width': 1.5 }),
          );
          const lab = el('text', {
            x: box.x + box.w / 2,
            y: BRACKET_Y + 13,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          });
          lab.textContent = String(f + 1);
          bracketLayer.appendChild(lab);
        }
        const foldTitle = el('text', {
          x: 20,
          y: BRACKET_Y + 27,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        foldTitle.textContent = t('label.fold', 'Fold');
        bracketLayer.appendChild(foldTitle);

        // 항목 — 처음이면 만들고, 있으면 항목 줄로 돌아간다
        if (items.length !== s.items.length) {
          itemLayer.replaceChildren();
          items = s.items.map((it) => {
            const g = el('g');
            const rect = el('rect', { width: TILE, height: TILE, rx: 4, fill: clsColor(it.cls), stroke: c.bg });
            const text = el('text', {
              x: TILE / 2,
              y: TILE / 2 + 4,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.textInverse,
            });
            text.textContent = it.x.toFixed(1);
            const mark = el('text', {
              x: TILE / 2,
              y: MARK_Y - (SEAT_Y - TILE / 2) + 2,
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.md,
              'font-weight': 700,
            });
            g.append(rect, text, mark);
            itemLayer.appendChild(g);
            const node: ItemNode = { g, rect, mark, pos: { x: 0, y: 0 }, cls: it.cls };
            return node;
          });
          items.forEach((node, i) => placeItem(node, poolPt(i)));
        }
        clearMarks();
        clearTicks();
        clearSpread();
        hideFrame();
        // 앞 판의 점은 자리만 남긴다 — 번호 · 채움을 걷은 빈 원
        for (const d of dots) {
          if (d === undefined) continue;
          d.solid = false;
          d.circle.setAttribute('fill', 'none');
          d.circle.setAttribute('stroke', c.textMuted);
          d.circle.setAttribute('stroke-dasharray', '2 2');
          d.label.textContent = '';
        }
        const moves = items.map((node, i) => ({ node, from: { ...node.pos }, to: poolPt(i) }));
        run(ms, (u) => {
          const e = ease(u);
          seats.forEach((r, p) => {
            const to = seatX[p] as number;
            const from = p < fromX.length ? (fromX[p] as number) : to;
            r.setAttribute('x', String(lerp(from, to, e)));
          });
          for (const m of moves) placeItem(m.node, { x: lerp(m.from.x, m.to.x, e), y: lerp(m.from.y, m.to.y, e) });
        });
      },
      deal(s, ms) {
        const moves = moveTargets(s.order);
        run(ms, (u) => drawMoves(moves, u));
      },
      fit(s, ms) {
        clearTicks();
        cutsShown = [...s.cuts];
        const draw = sweep(s.cuts, null);
        run(ms, draw);
      },
      judge(s, ms) {
        clearTicks();
        const drawSweep = sweep(cutsShown, s.calls);
        const drawDot = dropDot(s.shuffle, s.pct, s.stack);
        run(ms, (u) => {
          drawSweep(part(u, 0, 0.6));
          drawDot(part(u, 0.6, 1));
        });
      },
      shuffle(s, ms) {
        stopMotion();
        clearMarks();
        clearTicks();
        hideFrame();
        const moves = moveTargets(s.order);
        const drawSweep = sweep(s.cuts, s.calls);
        const drawDot = dropDot(s.shuffle, s.pct, s.stack);
        run(ms, (u) => {
          drawMoves(moves, part(u, 0, 0.4));
          if (u >= 0.4) drawSweep(part(u, 0.4, 0.75));
          drawDot(part(u, 0.75, 1));
        });
      },
      spread(s, ms) {
        stopMotion();
        clearSpread();
        hideFrame();
        const x0 = stripX(s.lo);
        const x1 = stripX(s.hi);
        const y = STRIP_Y + 28;
        const bar = el('line', { x1: x0, y1: y, x2: x0, y2: y, stroke: c.primary, 'stroke-width': 4, 'stroke-linecap': 'round' });
        const loFlag = el('line', { x1: x0, y1: STRIP_Y + 21, x2: x0, y2: y, stroke: c.primary, 'stroke-width': 1.5 });
        const hiFlag = el('line', { x1: x0, y1: STRIP_Y + 21, x2: x0, y2: y, stroke: c.primary, 'stroke-width': 1.5 });
        const text = el('text', {
          x: W / 2,
          y: y + 22,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        text.textContent = t('label.spreadLine', 'Lowest: {lo} % · Highest: {hi} % · Width: {w}', { lo: s.lo, hi: s.hi, w: s.width });
        spreadLayer.append(loFlag, hiFlag, bar, text);
        run(ms, (u) => {
          const x = lerp(x0, x1, ease(u));
          bar.setAttribute('x2', String(x));
          hiFlag.setAttribute('x1', String(x));
          hiFlag.setAttribute('x2', String(x));
        });
      },
    };

    return {
      ...stage,
      destroy() {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
        finish = null;
        root.remove();
      },
    };
  },
};
