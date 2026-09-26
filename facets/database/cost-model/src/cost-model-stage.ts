/**
 * cost-model 무대 — 막대 통계 · 범위 창 · 추정 줄 기둥 · 두 길의 비용.
 *
 * 운동
 *   - 통 수가 바뀌면 막대가 제자리에서 쪼개지거나 합쳐진다 (10 살 칸마다 높이가 옮겨 가고 칸 사이 틈이 열리고 닫힌다)
 *   - 범위가 바뀌면 범위 창이 막대 위를 미끄러진다
 *   - 걸음 1 에서 창이 자른 조각이 추정 기둥으로 날아가 쌓인다. 앞 판의 추정은 점선 윤곽으로 남아 새 추정이 어디서 왔는지 보인다
 *   - 걸음 2 에서 고른 길 표지가 두 길 사이를 넘어간다
 *   - 걸음 3 에서 참 분포가 바닥에서 솟고 실제 줄 선이 기둥을 가로지른다
 *   - 걸음 4 에서 실제 비용 막대가 뻗는다
 * 운동 길이는 projector 가 재생 속도로 셈해 넘긴다.
 *
 * 무대는 셈하지 않는다 — 통의 줄 · 조각의 줄 · 추정 · 고른 길 · 비용은 알고리즘이 싣는다. 무대는 자리만 셈한다.
 * SQL · 열 이름 · 길 이름(Seq Scan · Index Scan)은 자료라 그대로 그린다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type CostModelRoundView = {
  bins: number;
  binWidth: number;
  span: number;
  decadeWidth: number;
  binRows: number[];
  lo: number;
  hi: number;
  sql: string;
  column: string;
};
export type CostModelCutView = {
  pieces: { bin: number; from: number; to: number; binRows: number; binWidth: number; rows: number }[];
  estimate: number;
};
export type CostModelPickView = {
  seqName: string;
  indexName: string;
  seqEstimate: number;
  indexEstimate: number;
  chosen: 0 | 1;
};
export type CostModelActualView = {
  decades: number[];
  decadeWidth: number;
  actualRows: number;
  error: number;
  estimate: number;
};
export type CostModelCostView = {
  seqName: string;
  indexName: string;
  seqActual: number;
  indexActual: number;
  chosen: 0 | 1;
  better: 0 | 1;
  chosenWasBetter: boolean;
  pagesRead: number;
};

const W = 800;
const H = 460;
const PAD = 24;
// 막대 통계
const HX0 = 70;
const HX1 = 470;
const HY_BASE = 250;
const HY_TOP = 74;
/** 밀도(나이 한 살당 줄) 1 이 차지하는 세로 */
const DENSITY_PX = 20;
// 추정 기둥
const CX = 530;
const CW = 44;
/** 줄 하나가 차지하는 세로 */
const ROW_PX = 1.8;
// 비용 막대
const PX0 = 170;
const PAGE_PX = 4;
const BAND_Y = [306, 358];
const BAND_H = 46;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent.appendChild(node);
  return node;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

type Anim = { from: number; to: number; start: number; ms: number; delay: number };

export const costModelStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const palette: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const [estColor, actualColor] = categorical(2, 'vivid');
    if (estColor === undefined || actualColor === undefined) throw new Error('cost-model: 색 토큰이 비었다');
    const smPx = parseFloat(fontSizes.sm);

    const root = el('g', { 'data-role': 'cost-model' }, svg);

    // ── 움직임: 요소 · 속성마다 목표를 두고 rAF 하나로 옮긴다
    const anims = new Map<SVGElement, Map<string, Anim>>();
    let frame = 0;
    const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tick = (): void => {
      frame = 0;
      const time = now();
      for (const [node, props] of anims) {
        for (const [attr, a] of props) {
          const p = a.ms <= 0 ? 1 : Math.min(1, Math.max(0, (time - a.start - a.delay) / a.ms));
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          node.setAttribute(attr, String(a.from + (a.to - a.from) * e));
          if (p >= 1) props.delete(attr);
        }
        if (props.size === 0) anims.delete(node);
      }
      if (anims.size > 0) frame = requestAnimationFrame(tick);
    };
    const move = (node: SVGElement, to: Record<string, number>, ms: number, delay = 0): void => {
      const canAnimate = typeof requestAnimationFrame === 'function' && ms > 0;
      let props = anims.get(node);
      for (const [attr, target] of Object.entries(to)) {
        if (!canAnimate) {
          props?.delete(attr);
          node.setAttribute(attr, String(target));
          continue;
        }
        const raw = node.getAttribute(attr);
        const from = raw === null ? target : parseFloat(raw);
        if (!props) {
          props = new Map();
          anims.set(node, props);
        }
        props.set(attr, { from, to: target, start: now(), ms, delay });
      }
      if (props && props.size === 0) anims.delete(node);
      if (canAnimate && anims.size > 0 && frame === 0) frame = requestAnimationFrame(tick);
    };
    const drop = (node: SVGElement): void => {
      anims.delete(node);
      node.remove();
    };
    const dropLater = (node: SVGElement, ms: number): void => {
      if (ms <= 0 || typeof setTimeout !== 'function') {
        drop(node);
        return;
      }
      setTimeout(() => drop(node), ms);
    };

    const text = (x: number, y: number, size: string, fill: string, anchor = 'start', mono = false): SVGElement =>
      el(
        'text',
        {
          x,
          y,
          'font-size': size,
          'font-family': mono ? fonts.mono : fonts.body,
          fill,
          'text-anchor': anchor,
        },
        root,
      );

    // ── 머리: SQL
    const sqlText = text(PAD, 30, fontSizes.md, palette.text, 'start', true);

    // ── 막대 통계
    const histTitle = text(HX0, 56, fontSizes.sm, palette.textMuted);
    el('line', { x1: HX0, y1: HY_BASE, x2: HX1, y2: HY_BASE, stroke: palette.border, 'stroke-width': 1 }, root);
    const tickGroup = el('g', {}, root);
    const columnName = text(HX1 + 18, HY_BASE + 16, fontSizes.sm, palette.textMuted, 'start', true);
    const slotGroup = el('g', {}, root);
    const dividerGroup = el('g', {}, root);
    const truthGroup = el('g', {}, root);
    const binLabelGroup = el('g', {}, root);
    const windowRect = el(
      'rect',
      {
        x: HX0,
        y: HY_TOP - 8,
        width: 0,
        height: HY_BASE - HY_TOP + 8,
        fill: palette.accent,
        'fill-opacity': 0.16,
        stroke: palette.accent,
        'stroke-width': 2,
        'stroke-dasharray': '5 3',
        rx: 3,
      },
      root,
    );
    const windowLabel = text(HX0, HY_TOP - 14, fontSizes.sm, palette.text, 'middle', true);

    // ── 추정 기둥
    const colTitle = text(CX + CW / 2, HY_BASE + 16, fontSizes.sm, palette.textMuted, 'middle');
    el('line', { x1: CX - 8, y1: HY_BASE, x2: CX + CW + 8, y2: HY_BASE, stroke: palette.border, 'stroke-width': 1 }, root);
    const ghost = el(
      'rect',
      {
        x: CX,
        y: HY_BASE,
        width: CW,
        height: 0,
        fill: 'none',
        stroke: palette.ghostOutline,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 3',
      },
      root,
    );
    const pieceGroup = el('g', {}, root);
    const actualLine = el(
      'line',
      { x1: CX + CW / 2, y1: HY_BASE, x2: CX + CW / 2, y2: HY_BASE, stroke: actualColor, 'stroke-width': 3 },
      root,
    );
    const estLabel = text(CX + CW + 12, HY_BASE, fontSizes.sm, palette.text);
    const actualLabel = text(CX + CW + 12, HY_BASE, fontSizes.sm, actualColor);

    // ── 비용
    const costTitle = text(PAD, BAND_Y[0]! - 10, fontSizes.sm, palette.textMuted);
    const marker = el(
      'rect',
      {
        x: PAD - 6,
        y: BAND_Y[0]!,
        width: W - 2 * PAD + 12,
        height: BAND_H,
        rx: 6,
        fill: 'none',
        stroke: palette.primary,
        'stroke-width': 2,
        opacity: 0,
      },
      root,
    );
    const markerLabel = text(W - PAD, BAND_Y[0]! + BAND_H / 2 + smPx / 2 - 1, fontSizes.sm, palette.primary, 'end');
    type Band = { name: SVGElement; est: SVGElement; estText: SVGElement; act: SVGElement; actText: SVGElement };
    const bands: Band[] = BAND_Y.map((y) => {
      const name = text(PAD, y + BAND_H / 2 + smPx / 2 - 1, fontSizes.sm, palette.text, 'start', true);
      const est = el(
        'rect',
        {
          x: PX0,
          y: y + 7,
          width: 0,
          height: 13,
          fill: estColor,
          'fill-opacity': 0.25,
          stroke: estColor,
          'stroke-dasharray': '4 2',
          opacity: 1,
        },
        root,
      );
      const estText = text(PX0 + 6, y + 18, fontSizes.xs, palette.textMuted);
      const act = el('rect', { x: PX0, y: y + 25, width: 0, height: 13, fill: palette.ghostOutline }, root);
      const actText = text(PX0 + 6, y + 36, fontSizes.xs, palette.text);
      return { name, est, estText, act, actText };
    });

    // ── 걸음 글
    const caption = text(PAD, H - 18, fontSizes.md, palette.text);

    // ── 판마다 바뀌는 것
    let slots: SVGElement[] = [];
    let dividers: SVGElement[] = [];
    let pieces: SVGElement[] = [];
    let lastRange: string | null = null;
    let lastEstimate: number | null = null;
    let scaleSpan = 0;

    const xOf = (value: number): number => {
      if (scaleSpan <= 0) throw new Error('cost-model: 값의 폭을 모른 채 자리를 셈한다');
      return HX0 + ((HX1 - HX0) * value) / scaleSpan;
    };

    const ensureSlots = (count: number, span: number): void => {
      if (slots.length === count && scaleSpan === span) return;
      for (const s of slots) drop(s);
      for (const d of dividers) drop(d);
      scaleSpan = span;
      slots = [];
      dividers = [];
      tickGroup.replaceChildren();
      const slotW = (HX1 - HX0) / count;
      for (let j = 0; j < count; j++) {
        slots.push(
          el(
            'rect',
            { x: HX0 + j * slotW, y: HY_BASE, width: slotW, height: 0, fill: palette.textMuted, 'fill-opacity': 0.3 },
            slotGroup,
          ),
        );
      }
      for (let j = 1; j < count; j++) {
        dividers.push(
          el(
            'line',
            {
              x1: HX0 + j * slotW,
              x2: HX0 + j * slotW,
              y1: HY_BASE,
              y2: HY_BASE,
              stroke: palette.bg,
              'stroke-width': 2,
              'stroke-opacity': 0,
            },
            dividerGroup,
          ),
        );
      }
      for (let j = 0; j <= count; j++) {
        const label = el(
          'text',
          {
            x: HX0 + j * slotW,
            y: HY_BASE + 16,
            'font-size': fontSizes.xs,
            'font-family': fonts.mono,
            fill: palette.textMuted,
            'text-anchor': 'middle',
          },
          tickGroup,
        );
        label.textContent = String((span * j) / count);
      }
    };

    const clearPieces = (): void => {
      for (const p of pieces) drop(p);
      pieces = [];
    };

    return {
      beginRound(p: CostModelRoundView, ms: number): void {
        const rangeKey = `${p.lo}:${p.hi}`;
        const slotCount = p.span / p.decadeWidth;
        if (!Number.isInteger(slotCount) || slotCount < 1) throw new Error('cost-model: 참 분포 칸 수가 정수가 아니다');
        ensureSlots(slotCount, p.span);
        sqlText.textContent = p.sql;
        histTitle.textContent = t('label.histogram', 'Statistics on {column}', { column: p.column });
        columnName.textContent = p.column;
        colTitle.textContent = t('label.rows', 'Rows');
        costTitle.textContent = t('label.cost', 'Cost in pages');

        // 막대 — 칸마다 그 칸을 덮는 통의 밀도로 높이가 옮겨 간다
        const slotSpan = p.span / slotCount;
        for (let j = 0; j < slotCount; j++) {
          const binIndex = Math.floor((j * slotSpan) / p.binWidth);
          const rows = p.binRows[binIndex];
          if (rows === undefined) throw new Error(`cost-model: 칸 ${j} 를 덮는 통이 없다`);
          const h = (rows / p.binWidth) * DENSITY_PX;
          const slot = slots[j] as SVGElement;
          move(slot, { y: HY_BASE - h, height: h }, ms);
        }
        for (let j = 1; j < slotCount; j++) {
          const boundary = j * slotSpan;
          const isEdge = boundary % p.binWidth === 0;
          const left = p.binRows[Math.floor(((j - 1) * slotSpan) / p.binWidth)];
          const right = p.binRows[Math.floor((j * slotSpan) / p.binWidth)];
          if (left === undefined || right === undefined) throw new Error('cost-model: 틈 곁의 통이 없다');
          const top = HY_BASE - (Math.max(left, right) / p.binWidth) * DENSITY_PX;
          move(dividers[j - 1] as SVGElement, { y1: top, 'stroke-opacity': isEdge ? 1 : 0 }, ms);
        }
        // 통마다 줄 수 — 막대와 함께 솟는다
        binLabelGroup.replaceChildren();
        p.binRows.forEach((rows, i) => {
          const cx = xOf(i * p.binWidth + p.binWidth / 2);
          const label = el(
            'text',
            {
              x: cx,
              y: HY_BASE - 4,
              'font-size': fontSizes.xs,
              'font-family': fonts.mono,
              fill: palette.text,
              'text-anchor': 'middle',
            },
            binLabelGroup,
          );
          label.textContent = String(rows);
          move(label, { y: HY_BASE - (rows / p.binWidth) * DENSITY_PX - 5 }, ms);
        });

        // 범위 창 — 미끄러진다
        const wx = xOf(p.lo);
        const ww = xOf(p.hi) - wx;
        move(windowRect, { x: wx, width: ww }, ms);
        windowLabel.textContent = `[${p.lo}, ${p.hi})`;
        move(windowLabel, { x: wx + ww / 2 }, ms);

        // 앞 판의 추정 — 같은 범위면 점선 윤곽으로 남긴다
        clearPieces();
        const sameRange = lastEstimate !== null && lastRange === rangeKey;
        if (sameRange && lastEstimate !== null) {
          move(ghost, { y: HY_BASE - lastEstimate * ROW_PX, height: lastEstimate * ROW_PX, opacity: 1 }, ms);
        } else {
          move(ghost, { y: HY_BASE, height: 0, opacity: 0 }, ms);
        }
        lastRange = rangeKey;
        estLabel.textContent = '';
        actualLabel.textContent = '';
        move(actualLine, { x1: CX + CW / 2, x2: CX + CW / 2 }, ms);
        for (const node of Array.from(truthGroup.children) as SVGElement[]) {
          move(node, { y: HY_BASE, height: 0 }, ms);
          dropLater(node, ms);
        }

        // 비용 — 같은 범위면 앞 판의 추정 비용은 옅게 남기고, 범위가 바뀌면 거둔다. 실제 막대는 늘 거둔다
        for (const b of bands) {
          move(b.est, sameRange ? { opacity: 0.35 } : { width: 0, opacity: 0.35 }, ms);
          move(b.act, { width: 0 }, ms);
          b.estText.textContent = '';
          b.actText.textContent = '';
        }
        move(marker, { opacity: sameRange ? 0.3 : 0 }, ms);
        marker.setAttribute('stroke', palette.primary);
        markerLabel.textContent = '';

        caption.textContent = t('caption.build', 'Statistics: {column} split into {k} equal-width bins', {
          column: p.column,
          k: p.bins,
        });
      },

      cut(p: CostModelCutView, ms: number): void {
        clearPieces();
        let stacked = 0;
        for (const piece of p.pieces) {
          const h = (piece.binRows / piece.binWidth) * DENSITY_PX;
          const x = xOf(piece.from);
          const node = el(
            'rect',
            {
              x,
              y: HY_BASE - h,
              width: xOf(piece.to) - x,
              height: h,
              fill: estColor,
              'fill-opacity': 0.85,
              stroke: palette.bg,
              'stroke-width': 1,
            },
            pieceGroup,
          );
          const ph = piece.rows * ROW_PX;
          // 잘린 자리에 잠깐 머문 뒤 기둥으로 날아가 쌓인다
          move(node, { x: CX, width: CW, y: HY_BASE - stacked - ph, height: ph }, ms * 0.7, ms * 0.3);
          stacked += ph;
          pieces.push(node);
        }
        lastEstimate = p.estimate;
        estLabel.textContent = t('label.estimate', 'Estimated: {n}', { n: fmt(p.estimate) });
        move(estLabel, { y: HY_BASE - p.estimate * ROW_PX + 4 }, ms);
        caption.textContent = t('caption.cut', 'Each bin in the range gives rows × overlap ÷ bin width · Estimated rows: {n}', {
          n: fmt(p.estimate),
        });
      },

      pick(p: CostModelPickView, ms: number): void {
        const names = [p.seqName, p.indexName];
        const costs = [p.seqEstimate, p.indexEstimate];
        bands.forEach((b, i) => {
          b.name.textContent = names[i] as string;
          const cost = costs[i] as number;
          move(b.est, { width: cost * PAGE_PX, opacity: 1 }, ms);
          b.estText.textContent = t('label.estimate', 'Estimated: {n}', { n: fmt(cost) });
          move(b.estText, { x: PX0 + cost * PAGE_PX + 6 }, ms);
        });
        move(marker, { y: BAND_Y[p.chosen] as number, opacity: 1 }, ms);
        markerLabel.textContent = t('label.chosen', 'Chosen');
        move(markerLabel, { y: (BAND_Y[p.chosen] as number) + BAND_H / 2 + smPx / 2 - 1 }, ms);
        caption.textContent = t('caption.pick', 'Estimated cost — {seq}: {a} · {index}: {b} · Chosen: {chosen}', {
          seq: p.seqName,
          index: p.indexName,
          a: fmt(p.seqEstimate),
          b: fmt(p.indexEstimate),
          chosen: names[p.chosen] as string,
        });
      },

      reveal(p: CostModelActualView, ms: number): void {
        truthGroup.replaceChildren();
        p.decades.forEach((rows, d) => {
          const x = xOf(d * p.decadeWidth);
          const w = xOf((d + 1) * p.decadeWidth) - x;
          const h = (rows / p.decadeWidth) * DENSITY_PX;
          const node = el(
            'rect',
            {
              x: x + 1,
              y: HY_BASE,
              width: w - 2,
              height: 0,
              fill: 'none',
              stroke: actualColor,
              'stroke-width': 1.5,
              'stroke-dasharray': '3 2',
            },
            truthGroup,
          );
          move(node, { y: HY_BASE - h, height: h }, ms);
        });
        const y = HY_BASE - p.actualRows * ROW_PX;
        actualLine.setAttribute('y1', String(y));
        actualLine.setAttribute('y2', String(y));
        move(actualLine, { x1: CX - 10, x2: CX + CW + 10 }, ms);
        actualLabel.textContent = t('label.actual', 'Actual: {n}', { n: fmt(p.actualRows) });
        // 추정 글과 겹치면 비켜 선다
        const estY = HY_BASE - p.estimate * ROW_PX + 4;
        const actY = y + 4;
        const gap = actY - estY;
        const placed = Math.abs(gap) < smPx + 4 ? estY + (gap >= 0 ? smPx + 4 : -(smPx + 4)) : actY;
        actualLabel.setAttribute('y', String(HY_BASE));
        move(actualLabel, { y: placed }, ms);
        caption.textContent = t('caption.actual', 'True distribution revealed · Actual rows: {n} · Error: {e}', {
          n: fmt(p.actualRows),
          e: fmt(p.error),
        });
      },

      settle(p: CostModelCostView, ms: number): void {
        const costs = [p.seqActual, p.indexActual];
        bands.forEach((b, i) => {
          const cost = costs[i] as number;
          b.act.setAttribute('fill', i === p.chosen ? palette.primary : palette.ghostOutline);
          move(b.act, { width: cost * PAGE_PX }, ms);
          b.actText.textContent =
            i === p.chosen
              ? t('label.pagesRead', 'Pages read: {n}', { n: fmt(cost) })
              : t('label.otherPages', 'Would read: {n}', { n: fmt(cost) });
          b.actText.setAttribute('x', String(PX0 + 6));
          move(b.actText, { x: PX0 + cost * PAGE_PX + 6 }, ms);
        });
        marker.setAttribute('stroke', p.chosenWasBetter ? palette.primary : palette.danger);
        const names = [p.seqName, p.indexName];
        caption.textContent = t(
          'caption.cost',
          'Actual pages — {chosen} (chosen): {n} · {other}: {m} · Better path: {better}',
          {
            chosen: names[p.chosen] as string,
            other: names[1 - p.chosen] as string,
            n: fmt(p.pagesRead),
            m: fmt(costs[1 - p.chosen] as number),
            better: names[p.better] as string,
          },
        );
      },

      clear(): void {
        clearPieces();
        truthGroup.replaceChildren();
        binLabelGroup.replaceChildren();
        for (const s of slots) move(s, { y: HY_BASE, height: 0 }, 0);
        for (const d of dividers) move(d, { y1: HY_BASE, 'stroke-opacity': 0 }, 0);
        move(ghost, { y: HY_BASE, height: 0, opacity: 0 }, 0);
        move(marker, { opacity: 0 }, 0);
        for (const b of bands) {
          move(b.est, { width: 0 }, 0);
          move(b.act, { width: 0 }, 0);
          b.estText.textContent = '';
          b.actText.textContent = '';
        }
        estLabel.textContent = '';
        actualLabel.textContent = '';
        markerLabel.textContent = '';
        caption.textContent = '';
        lastEstimate = null;
        lastRange = null;
      },

      destroy(): void {
        if (frame !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
        frame = 0;
        anims.clear();
        root.remove();
      },
    };
  },
};
