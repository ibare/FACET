/**
 * collision-stage — 로그 축 위 세 거리의 표지.
 *
 * 주인공은 축 위 표지들의 **거리**다. 자리 N 개를 칸으로 그리지 않는다.
 *   - N+1 세로 표지 (반드시 겹침) · 50% 세로 표지
 *   - 흐름 줄마다 동그라미 (아무 짝이 처음 겹친 입력) · 네모 (정해진 문서와 겹친 시도)
 *   - 평균 줄: 두 평균과, 처음 겹침 평균에서 N+1 까지의 간격 (배)
 *
 * 운동: 표지와 점은 앞 판의 자리에서 새 자리로 미끄러진다. 새 판의 걸음 0 에 앞 판의 자리는
 * 값 글자 없이 흐린 눈금으로만 남고, 이 판의 걸음이 그 눈금에서 새 자리로 옮긴다.
 * 첫 판은 축의 왼끝(1)에서 출발한다. 값은 모두 payload 로 받는다 — 여기서 셈하는 것은 좌표뿐이다.
 */
import {
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
const W = 760;
const H = 440;
const X0 = 96;
const X1 = 736;
const SURE_LABEL_Y = 20;
const HALF_LABEL_Y = 40;
const MARK_TOP = 50;
const ROW_Y0 = 80;
const ROW_GAP = 42;
const AXIS_Y = 336;
const READOUT_Y = 372;
const LEGEND_Y = 372;
const CAPTION_Y1 = 402;
const CAPTION_Y2 = 424;

export type StageFirst = {
  row: number;
  first: number;
  slot: number;
  input: string;
  partnerInput: string;
  summary: { avgTenths: number; ratio: number; sure: number } | null;
};

export type StageHit = { row: number; tries: number; input: string };

export type CollisionStage = {
  begin(p: { width: number; slots: number; axisEnd: number; streams: string[] }): void;
  showSure(p: { slots: number; sure: number }, ms: number): Promise<void>;
  showHalf(p: { half: number }, ms: number): Promise<void>;
  showFirst(p: StageFirst, ms: number): Promise<void>;
  showTargets(p: { hits: StageHit[]; avgTenths: number; slots: number }, ms: number): Promise<void>;
  reset(): void;
};

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent.appendChild(node);
  return node;
}

function tenths(v: number): string {
  if (!Number.isInteger(v) || v < 0) throw new Error(`collision-stage: 평균 값이 어긋났다 — ${v}`);
  return `${Math.floor(v / 10)}.${v % 10}`;
}

export const collisionStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const [sureTone, pairTone, targetTone] = categorical(3, 'vivid');
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const root = el('g', { 'data-role': 'collision-root' }, svg);

    /** 판 상태 — begin 이 새로 짓는다. */
    let axisEnd = 0;
    let rowCount = 0;
    let layers: { ghost: SVGGElement; items: SVGGElement; text: SVGGElement } | null = null;
    let caption1: SVGTextElement | null = null;
    let caption2: SVGTextElement | null = null;
    /** 운동의 기억 — 표지 · 점이 마지막으로 선 값 (값 글자는 기억하지 않는다) */
    const memory = new Map<string, number>();
    /** 이 판에 선 요소 — 키마다 하나 */
    const live = new Map<string, SVGGElement>();

    // ── 운동
    type Anim = { id: number; finish: () => void };
    const anims = new Set<Anim>();
    const stopAll = (): void => {
      for (const a of [...anims]) {
        cancelAnimationFrame(a.id);
        a.finish();
      }
      anims.clear();
    };
    params.onScrubStart?.(stopAll);

    const tween = (ms: number, draw: (u: number) => void): Promise<void> => {
      if (ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const anim: Anim = {
          id: 0,
          finish: () => {
            anims.delete(anim);
            draw(1);
            resolve();
          },
        };
        const tick = (now: number): void => {
          const u = Math.min(1, (now - start) / ms);
          if (u >= 1 || isInstant()) {
            anim.finish();
            return;
          }
          draw(1 - (1 - u) * (1 - u) * (1 - u));
          anim.id = requestAnimationFrame(tick);
        };
        anims.add(anim);
        anim.id = requestAnimationFrame(tick);
      });
    };

    // ── 좌표
    const xOf = (value: number): number => {
      if (axisEnd <= 1) throw new Error('collision-stage: 축 끝이 없다 — begin 이 먼저 와야 한다');
      if (!(value >= 1)) throw new Error(`collision-stage: 축에 놓을 수 없는 값 — ${value}`);
      return X0 + (Math.log2(value) / Math.log2(axisEnd)) * (X1 - X0);
    };
    const rowY = (row: number): number => {
      if (!Number.isInteger(row) || row < 0 || row >= rowCount) throw new Error(`collision-stage: 줄 ${row} 이 없다`);
      return ROW_Y0 + row * ROW_GAP;
    };
    const avgY = (): number => ROW_Y0 + rowCount * ROW_GAP;

    const need = (): { ghost: SVGGElement; items: SVGGElement; text: SVGGElement } => {
      if (!layers) throw new Error('collision-stage: begin 전에 걸음이 왔다');
      return layers;
    };

    const text = (parent: Element, x: number, y: number, s: string, attrs: Attrs = {}): SVGTextElement => {
      const node = el(
        'text',
        { x, y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'text-anchor': 'middle', ...attrs },
        parent,
      );
      node.textContent = s;
      return node;
    };

    // ── 모양 — 키마다 그리는 법
    type Shape = { build(g: SVGGElement, ghost: boolean): void; y: number; label?: (g: SVGGElement) => void };

    const markerShape = (tone: string, dashed: boolean, labelY: number, label: string): Shape => ({
      y: 0,
      build(g, ghost) {
        el(
          'line',
          {
            x1: 0,
            x2: 0,
            y1: MARK_TOP,
            y2: AXIS_Y,
            stroke: ghost ? c.textMuted : tone,
            'stroke-width': ghost ? 1 : 2,
            'stroke-dasharray': dashed ? '5 4' : 'none',
            opacity: ghost ? 0.35 : 1,
          },
          g,
        );
      },
      label(g) {
        text(g, 0, labelY, label, { fill: tone, 'font-weight': 600, 'data-role': 'marker-label' });
      },
    });

    type LabelAt = 'above' | 'below' | 'left' | 'right';
    const LABEL_AT: Record<LabelAt, Attrs> = {
      above: { x: 0, y: -10, 'text-anchor': 'middle' },
      below: { x: 0, y: 20, 'text-anchor': 'middle' },
      left: { x: -10, y: 4, 'text-anchor': 'end' },
      right: { x: 10, y: 4, 'text-anchor': 'start' },
    };
    const dotShape = (y: number, tone: string, square: boolean, label: string | null, at: LabelAt): Shape => ({
      y,
      build(g, ghost) {
        const stroke = ghost ? c.textMuted : tone;
        const fill = ghost ? 'none' : tone;
        const opacity = ghost ? 0.45 : 1;
        if (square) el('rect', { x: -5, y: -5, width: 10, height: 10, fill, stroke, 'stroke-width': 1.5, opacity }, g);
        else el('circle', { cx: 0, cy: 0, r: 5.5, fill, stroke, 'stroke-width': 1.5, opacity }, g);
      },
      label: label === null
        ? undefined
        : (g) => {
            const pos = LABEL_AT[at];
            text(g, Number(pos.x), Number(pos.y), label, { ...pos, 'font-family': fonts.mono, 'data-role': 'point-label' });
          },
    });

    const place = (g: SVGGElement, x: number, y: number): void => {
      g.setAttribute('transform', `translate(${x.toFixed(2)} ${y})`);
    };

    /** 키의 요소를 새로 세워 앞 판의 자리(없으면 축 왼끝)에서 value 로 옮긴다. */
    const arrive = (key: string, value: number, shape: Shape, ms: number): Promise<void> => {
      const L = need();
      L.ghost.querySelector(`[data-key="${key}"]`)?.remove();
      live.get(key)?.remove();
      const before = memory.get(key);
      // 앞 판에 선 적이 없으면 축의 왼끝(1)에서 출발한다
      const from = xOf(before === undefined ? 1 : before);
      const to = xOf(value);
      memory.set(key, value);
      const g = el('g', { 'data-key': key }, L.items);
      shape.build(g, false);
      live.set(key, g);
      place(g, from, shape.y);
      return tween(ms, (u) => place(g, from + (to - from) * u, shape.y)).then(() => {
        if (live.get(key) === g) shape.label?.(g);
      });
    };

    const setCaption = (line1: string, line2: string): void => {
      if (!caption1 || !caption2) throw new Error('collision-stage: begin 전에 캡션이 왔다');
      caption1.textContent = line1;
      caption2.textContent = line2;
    };

    /** 흐린 눈금 — 앞 판의 자리. 모양만, 값 글자 없이. */
    const ghostShape = (key: string): Shape => {
      if (key === 'sure') return markerShape(sureTone, false, SURE_LABEL_Y, '');
      if (key === 'half') return markerShape(pairTone, true, HALF_LABEL_Y, '');
      const [kind, rowText] = key.split(':');
      if (kind === 'avgFirst') return dotShape(avgY(), pairTone, false, null, 'left');
      if (kind === 'avgTarget') return dotShape(avgY(), targetTone, true, null, 'right');
      const row = Number(rowText);
      if (kind === 'first') return dotShape(rowY(row), pairTone, false, null, 'above');
      if (kind === 'target') return dotShape(rowY(row), targetTone, true, null, 'below');
      throw new Error(`collision-stage: 모르는 키 — ${key}`);
    };

    /** 판 세대 — 판을 비울 때마다 오른다. await 뒤에 세대가 바뀌었으면 앞 판의 것을 그리지 않는다 */
    let generation = 0;
    const clearBoard = (): void => {
      generation++;
      stopAll();
      while (root.firstChild) root.removeChild(root.firstChild);
      layers = null;
      caption1 = null;
      caption2 = null;
      live.clear();
    };

    const stage: CollisionStage = {
      begin(p) {
        clearBoard();
        if (!(p.axisEnd > 1)) throw new Error('collision-stage: 축 끝이 어긋났다');
        axisEnd = p.axisEnd;
        rowCount = p.streams.length;

        const base = el('g', { 'data-role': 'axis' }, root);
        // 흐름 줄 + 평균 줄
        p.streams.forEach((s, row) => {
          const y = rowY(row);
          el('line', { x1: X0, x2: X1, y1: y, y2: y, stroke: c.border, 'stroke-width': 1 }, base);
          text(base, 16, y + smPx / 3, s, { 'text-anchor': 'start', 'font-family': fonts.mono, fill: c.textMuted });
        });
        const ay = avgY();
        el('line', { x1: X0, x2: X1, y1: ay, y2: ay, stroke: c.border, 'stroke-width': 1, 'stroke-dasharray': '2 3' }, base);
        text(base, 16, ay + smPx / 3, t('label.avgRow', 'average'), { 'text-anchor': 'start', fill: c.textMuted });

        // 로그 축 1..axisEnd
        el('line', { x1: X0, x2: X1, y1: AXIS_Y, y2: AXIS_Y, stroke: c.textMuted, 'stroke-width': 1.5 }, base);
        const top = Math.round(Math.log2(axisEnd));
        for (let e = 0; e <= top; e++) {
          const x = xOf(2 ** e);
          const major = e % 2 === 0 || e === top;
          el('line', { x1: x, x2: x, y1: AXIS_Y, y2: AXIS_Y + (major ? 6 : 3), stroke: c.textMuted }, base);
          if (major) text(base, x, AXIS_Y + 20, String(2 ** e), { fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
        }
        text(base, X1, AXIS_Y - 6, t('label.axis', 'inputs (log scale)'), {
          'text-anchor': 'end',
          fill: c.textMuted,
          'font-size': fontSizes.xs,
        });

        // 읽기 · 범례
        text(base, 16, READOUT_Y, t('label.readout', 'output {n} bits · slots N = {N}', { n: p.width, N: p.slots }), {
          'text-anchor': 'start',
          'font-weight': 600,
        });
        const lg = el('g', { 'data-role': 'legend' }, base);
        el('circle', { cx: 330, cy: LEGEND_Y - 4, r: 5, fill: pairTone }, lg);
        text(lg, 342, LEGEND_Y, t('label.anyPair', 'any pair: first collision'), { 'text-anchor': 'start', 'font-size': fontSizes.xs });
        el('rect', { x: 531, y: LEGEND_Y - 9, width: 10, height: 10, fill: targetTone }, lg);
        text(lg, 548, LEGEND_Y, t('label.target', 'fixed document: tries to match'), {
          'text-anchor': 'start',
          'font-size': fontSizes.xs,
        });

        const ghost = el('g', { 'data-role': 'ghosts' }, root);
        const items = el('g', { 'data-role': 'items' }, root);
        const textLayer = el('g', { 'data-role': 'text' }, root);
        layers = { ghost, items, text: textLayer };

        // 앞 판의 자리 — 흐린 눈금
        for (const [key, value] of memory) {
          const shape = ghostShape(key);
          const g = el('g', { 'data-key': key, 'data-ghost': 'true' }, ghost);
          shape.build(g, true);
          place(g, xOf(value), shape.y);
        }

        caption1 = text(textLayer, W / 2, CAPTION_Y1, '', { 'font-size': fontSizes.md, 'data-role': 'caption' });
        caption2 = text(textLayer, W / 2, CAPTION_Y2, '', { 'font-size': fontSizes.md, 'data-role': 'caption' });
        setCaption(t('caption.start', '{N} slots · each stream feeds inputs from 1 in order', { N: p.slots }), '');
      },

      showSure(p, ms) {
        setCaption(
          t('caption.pigeonhole', '{N} slots: by input N+1 = {v} some slot must hold two', { N: p.slots, v: p.sure }),
          '',
        );
        const label = t('label.sure', 'must collide · N+1 = {v}', { v: p.sure });
        return arrive('sure', p.sure, markerShape(sureTone, false, SURE_LABEL_Y, label), ms);
      },

      showHalf(p, ms) {
        setCaption(t('caption.half', 'At {k} inputs the chance that some pair shares a slot reaches 50%', { k: p.half }), '');
        const label = t('label.half', '50% · inputs {v}', { v: p.half });
        return arrive('half', p.half, markerShape(pairTone, true, HALF_LABEL_Y, label), ms);
      },

      async showFirst(p, ms) {
        const gen = generation;
        const line1 = t('caption.first', '{a} = {b} · same slot {s} · first collision at input {k}', {
          a: p.input,
          b: p.partnerInput,
          s: p.slot,
          k: p.first,
        });
        const summary = p.summary;
        const line2 =
          summary === null
            ? ''
            : t('caption.summary', 'Average first collision {avg} · N+1 ÷ average ≈ {r}', {
                avg: tenths(summary.avgTenths),
                r: summary.ratio,
              });
        setCaption(line1, line2);
        const moves = [arrive(`first:${p.row}`, p.first, dotShape(rowY(p.row), pairTone, false, String(p.first), 'above'), ms)];
        if (summary !== null) {
          const avg = summary.avgTenths / 10;
          moves.push(arrive('avgFirst', avg, dotShape(avgY(), pairTone, false, tenths(summary.avgTenths), 'left'), ms));
        }
        await Promise.all(moves);
        // 운동 도중 판이 비워졌으면(되짚기 · 새 판) 앞 판의 간격을 그리지 않는다
        if (gen !== generation) return;
        if (summary !== null) {
          // 간격 — 처음 겹침 평균에서 N+1 까지. 두 끝은 이미 선 표지의 자리다
          const L = need();
          live.get('gap')?.remove();
          const x1 = xOf(summary.avgTenths / 10);
          const x2 = xOf(summary.sure);
          const y = avgY() + 13;
          const g = el('g', { 'data-key': 'gap' }, L.items);
          live.set('gap', g);
          const line = el('line', { x1, x2: x1, y1: y, y2: y, stroke: sureTone, 'stroke-width': 1.5 }, g);
          el('line', { x1, x2: x1, y1: y - 4, y2: y + 4, stroke: sureTone, 'stroke-width': 1.5 }, g);
          const cap = el('line', { x1, x2: x1, y1: y - 4, y2: y + 4, stroke: sureTone, 'stroke-width': 1.5 }, g);
          await tween(ms / 2, (u) => {
            const x = x1 + (x2 - x1) * u;
            line.setAttribute('x2', x.toFixed(2));
            cap.setAttribute('x1', x.toFixed(2));
            cap.setAttribute('x2', x.toFixed(2));
          });
          if (gen === generation && live.get('gap') === g) {
            text(g, (x1 + x2) / 2, y + 15, t('label.gap', 'N+1 ÷ avg ≈ {r}', { r: summary.ratio }), {
              fill: sureTone,
              'font-weight': 600,
              'data-role': 'gap-label',
            });
          }
        }
      },

      async showTargets(p, ms) {
        const list = p.hits.map((h) => h.input).join(' · ');
        setCaption(
          t('caption.target', 'Matching fixed documents: {list}', { list }),
          t('caption.targetAvg', 'Average tries {avg} · slots N = {N}', { avg: tenths(p.avgTenths), N: p.slots }),
        );
        const moves = p.hits.map((h) =>
          arrive(`target:${h.row}`, h.tries, dotShape(rowY(h.row), targetTone, true, String(h.tries), 'below'), ms),
        );
        moves.push(arrive('avgTarget', p.avgTenths / 10, dotShape(avgY(), targetTone, true, tenths(p.avgTenths), 'right'), ms));
        await Promise.all(moves);
      },

      reset() {
        clearBoard();
        memory.clear();
        axisEnd = 0;
        rowCount = 0;
      },
    };

    return {
      ...stage,
      destroy() {
        stopAll();
        root.remove();
      },
    };
  },
};
