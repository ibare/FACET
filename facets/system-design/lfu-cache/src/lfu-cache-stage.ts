/**
 * LFU 캐시 무대 — 요청 줄 위를 미끄러지는 세는 창, 캐시 칸마다의 횟수 막대, 어제의 인기 키가 밀려난 걸음 표지.
 *
 * 운동:
 *   - 창의 띠가 걸음마다 한 칸씩 밀리고, 창 폭(손잡이)만큼 자란 뒤로는 폭을 지킨 채 미끄러진다
 *   - 창 밖으로 나간 요청만큼 막대가 줄고, 적중한 칸의 막대는 늘어난다. 밀어냄 걸음에는 그 칸의 막대가 새 키의 길이로 옮겨 간다
 *   - 어제의 인기 키가 밀려난 걸음 표지는 앞 판의 자리(점선)에서 이 판의 자리로 미끄러진다
 *
 * 무대는 판정을 다시 하지 않는다 — 적중 · 밀려날 키 · 횟수 · 동률 · 표지 걸음은 모두 payload 로 받는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 340;
const X0 = 20;
const X1 = 740;
const TAPE_TOP = 44;
const LABEL_BASE = 104;
const CELL_Y = 109;
const TAPE_BOTTOM = 122;
const HOT_Y = 128;
const SLOT_TOP = 182;
const SLOT_H = 38;
const SLOT_GAP = 8;
const BAR_X = 190;
const BAR_W = 420;

export type LfuStageInit = {
  window: number;
  requests: string[];
  lateFrom: number;
  capacity: number;
  countMax: number;
  hotKey: string;
};

export type LfuStageSlot = { key: string | null; count: number; last: number; old: boolean };

export type LfuStageStep = {
  step: number;
  key: string;
  kind: 'hit' | 'fill' | 'evict';
  slot: number;
  victim: string | null;
  tie: boolean;
  windowStart: number;
  hotOut: boolean;
  slots: LfuStageSlot[];
};

export type LfuCacheStage = {
  setup(init: LfuStageInit): void;
  step(s: LfuStageStep, ms: number): void;
  reset(): void;
  destroy(): void;
};

type SlotEls = {
  box: SVGRectElement;
  key: SVGTextElement;
  tag: SVGTextElement;
  bar: SVGRectElement;
  count: SVGTextElement;
  last: SVGTextElement;
  width: number;
};

export const lfuCacheStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const p = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const mono = fonts.mono;
    const body = fonts.body;
    const xs = parseFloat(fontSizes.xs);
    const sm = parseFloat(fontSizes.sm);
    const md = parseFloat(fontSizes.md);

    const root = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(root);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = root,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (s: string, attrs: Record<string, string | number>, parent: Element = root): SVGTextElement => {
      const node = el('text', { 'font-family': body, 'font-size': sm, fill: p.text, ...attrs }, parent);
      node.textContent = s;
      return node;
    };

    // ── 운동 — 자리마다 도는 프레임 하나. 새 운동이 오면 그 자리의 앞 운동을 끊는다.
    const frames = new Map<string, number>();
    const stopAll = (): void => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
    };
    const animate = (channel: string, ms: number, draw: (k: number) => void): void => {
      const prev = frames.get(channel);
      if (prev !== undefined) cancelAnimationFrame(prev);
      frames.delete(channel);
      if (ms <= 0 || isInstant()) {
        draw(1);
        return;
      }
      const t0 = performance.now();
      const tick = (now: number): void => {
        const k = Math.min(1, (now - t0) / ms);
        draw(1 - (1 - k) * (1 - k));
        if (k < 1) frames.set(channel, requestAnimationFrame(tick));
        else frames.delete(channel);
      };
      frames.set(channel, requestAnimationFrame(tick));
    };
    params.onScrubStart?.(() => stopAll());

    // ── 판 상태
    let init: LfuStageInit | null = null;
    let col = 12;
    let band: SVGRectElement | null = null;
    let bandX = X0;
    let bandW = 0;
    let cells: SVGGElement | null = null;
    let labels: SVGTextElement[] = [];
    let caption: SVGTextElement | null = null;
    let tieNote: SVGTextElement | null = null;
    let slots: SlotEls[] = [];
    let hot: SVGGElement | null = null;
    let hotLabel: SVGTextElement | null = null;
    let hotX: number | null = null; // 이 판의 표지 자리
    let ghostX: number | null = null; // 앞 판의 표지 자리
    let lastLabel = -1;

    const colX = (i: number): number => X0 + i * col;
    const barWidth = (count: number): number => {
      if (init === null) throw new Error('lfu-cache-stage: setup 전에 막대를 그린다');
      return (count / init.countMax) * BAR_W;
    };

    const drawHot = (x: number): void => {
      if (hot === null || hotLabel === null) throw new Error('lfu-cache-stage: 표지가 없다');
      hot.setAttribute('transform', `translate(${x.toFixed(2)},0)`);
      const nearEnd = x > X1 - 150;
      hotLabel.setAttribute('text-anchor', nearEnd ? 'end' : 'start');
      hotLabel.setAttribute('x', nearEnd ? '-8' : '8');
    };

    const build = (d: LfuStageInit): void => {
      stopAll();
      root.replaceChildren();
      init = d;
      const n = d.requests.length;
      col = (X1 - X0) / n;
      labels = [];
      slots = [];
      lastLabel = -1;

      // 머리 줄 — 창과 이 걸음의 판정
      text(
        t('caption.window', 'Window: {w}', {
          w: d.window === 0 ? t('label.endless', 'Endless') : String(d.window),
        }),
        { x: X0, y: 18, 'font-size': md, 'font-weight': 600 },
      );
      caption = text('', { x: X1, y: 18, 'text-anchor': 'end', 'font-size': md });

      // 어제 · 오늘
      const cut = colX(d.lateFrom - 1);
      el('rect', { x: X0, y: TAPE_TOP, width: cut - X0, height: TAPE_BOTTOM - TAPE_TOP, fill: p.bgSubtle });
      text(t('label.yesterday', 'Yesterday'), { x: (X0 + cut) / 2, y: 38, 'text-anchor': 'middle', fill: p.textMuted });
      text(t('label.today', 'Today'), { x: (cut + X1) / 2, y: 38, 'text-anchor': 'middle', fill: p.textMuted });

      // 세는 창의 띠 — 요청 줄 뒤에 깐다
      band = el('rect', {
        x: X0,
        y: TAPE_TOP,
        width: 0,
        height: TAPE_BOTTOM - TAPE_TOP,
        fill: p.primary,
        'fill-opacity': 0.14,
        stroke: p.primary,
        'stroke-width': 1.5,
        rx: 3,
      });
      bandX = X0;
      bandW = 0;
      el('line', {
        x1: cut,
        x2: cut,
        y1: 28,
        y2: TAPE_BOTTOM + 2,
        stroke: p.textMuted,
        'stroke-dasharray': '3 3',
      });

      // 요청 줄 — 경로를 세로로
      for (let i = 0; i < n; i++) {
        const cx = colX(i) + col / 2;
        const lab = text(d.requests[i], {
          x: cx,
          y: LABEL_BASE,
          'font-family': mono,
          'font-size': xs - 1,
          'text-anchor': 'start',
          'dominant-baseline': 'middle',
          transform: `rotate(-90 ${cx.toFixed(2)} ${LABEL_BASE})`,
          fill: p.textMuted,
        });
        labels.push(lab);
      }
      cells = el('g', {});

      // 어제의 인기 키 표지 — 앞 판의 자리는 점선으로 남긴다
      if (ghostX !== null) {
        const gg = el('g', { transform: `translate(${ghostX.toFixed(2)},0)`, 'data-role': 'hot-ghost' });
        el(
          'path',
          {
            d: `M0 ${HOT_Y} l-6 10 h12 z`,
            fill: 'none',
            stroke: p.textMuted,
            'stroke-dasharray': '2 2',
          },
          gg,
        );
      }
      hot = el('g', { visibility: 'hidden' });
      el('path', { d: `M0 ${HOT_Y} l-6 10 h12 z`, fill: p.danger }, hot);
      hotLabel = text(t('caption.evict', 'Evicted: {key}', { key: d.hotKey }), {
        x: 8,
        y: HOT_Y + 9,
        fill: p.danger,
        'font-family': mono,
        'font-size': xs,
      }, hot);

      // 칸 머리
      text(t('label.cache', 'Cache'), { x: X0, y: SLOT_TOP - 8, fill: p.textMuted });
      text(t('label.count', 'Count in window'), { x: BAR_X, y: SLOT_TOP - 8, fill: p.textMuted });
      text(t('label.lastUsed', 'Last used'), { x: X1 - 10, y: SLOT_TOP - 8, 'text-anchor': 'end', fill: p.textMuted });

      for (let s = 0; s < d.capacity; s++) {
        const y = SLOT_TOP + s * (SLOT_H + SLOT_GAP);
        const box = el('rect', {
          x: X0,
          y,
          width: X1 - X0,
          height: SLOT_H,
          rx: 4,
          fill: p.bg,
          stroke: p.border,
          'stroke-dasharray': '4 3',
        });
        for (let u = 1; u <= d.countMax; u++) {
          const ux = BAR_X + (u / d.countMax) * BAR_W;
          el('line', { x1: ux, x2: ux, y1: y + 8, y2: y + SLOT_H - 8, stroke: p.border, 'stroke-width': 0.6 });
        }
        const bar = el('rect', { x: BAR_X, y: y + 10, width: 0, height: SLOT_H - 20, fill: p.primary, rx: 2 });
        const key = text('', { x: X0 + 12, y: y + SLOT_H / 2 + 5, 'font-family': mono, 'font-size': md });
        const tag = text('', { x: BAR_X - 12, y: y + SLOT_H / 2 + 4, 'text-anchor': 'end', fill: p.textMuted, 'font-size': xs });
        const count = text('', { x: BAR_X + 6, y: y + SLOT_H / 2 + 4, 'font-family': mono });
        const last = text('', { x: X1 - 10, y: y + SLOT_H / 2 + 4, 'text-anchor': 'end', 'font-family': mono, fill: p.textMuted });
        slots.push({ box, key, tag, bar, count, last, width: 0 });
      }

      // 동률 · 표식
      tieNote = text('', { x: X0, y: H - 8, fill: p.textMuted });
      const legendY = HOT_Y + 30;
      let lx = X1 - 250;
      const legend: [string, 'hit' | 'fill' | 'evict'][] = [
        [t('label.hit', 'Hit'), 'hit'],
        [t('label.fill', 'Fill'), 'fill'],
        [t('label.evicted', 'Evicted'), 'evict'],
      ];
      for (const [name, kind] of legend) {
        drawCell(root, lx, legendY - 8, kind);
        text(name, { x: lx + 12, y: legendY, 'font-size': xs, fill: p.textMuted });
        lx += 80;
      }
    };

    /** 걸음의 결과 칸 — 적중은 채움, 채움은 테두리, 밀어냄은 가위표. */
    function drawCell(parent: Element, x: number, y: number, kind: 'hit' | 'fill' | 'evict'): void {
      const size = 8;
      if (kind === 'hit') {
        el('rect', { x, y, width: size, height: size, fill: p.primary }, parent);
      } else if (kind === 'fill') {
        el('rect', { x, y, width: size, height: size, fill: 'none', stroke: p.text }, parent);
      } else {
        el('rect', { x, y, width: size, height: size, fill: 'none', stroke: p.danger }, parent);
        el('path', { d: `M${x} ${y} l${size} ${size} M${x + size} ${y} l${-size} ${size}`, stroke: p.danger }, parent);
      }
    }

    const step = (s: LfuStageStep, ms: number): void => {
      if (init === null || band === null || cells === null || caption === null || tieNote === null) {
        throw new Error('lfu-cache-stage: setup 전에 걸음이 왔다');
      }
      const n = init.requests.length;
      if (s.step < 1 || s.step > n) throw new Error(`lfu-cache-stage: 걸음 ${s.step} 가 요청 줄 밖이다`);
      if (s.windowStart < 1 || s.windowStart > s.step) throw new Error(`lfu-cache-stage: 창의 첫 걸음 ${s.windowStart} 가 어긋났다`);
      if (s.slots.length !== slots.length) throw new Error(`lfu-cache-stage: 칸 수 ${s.slots.length} 가 무대의 ${slots.length} 와 다르다`);
      if (s.slot < 0 || s.slot >= slots.length) throw new Error(`lfu-cache-stage: 칸 ${s.slot} 가 없다`);
      const i = s.step - 1;

      // 창의 띠
      const fromX = bandX;
      const fromW = bandW;
      const toX = colX(s.windowStart - 1);
      const toW = colX(i) + col - toX;
      const b = band;
      animate('band', ms, (k) => {
        bandX = fromX + (toX - fromX) * k;
        bandW = fromW + (toW - fromW) * k;
        b.setAttribute('x', bandX.toFixed(2));
        b.setAttribute('width', bandW.toFixed(2));
      });

      // 지금 요청 글자
      if (lastLabel >= 0) {
        labels[lastLabel].setAttribute('fill', p.textMuted);
        labels[lastLabel].setAttribute('font-weight', '400');
      }
      labels[i].setAttribute('fill', p.text);
      labels[i].setAttribute('font-weight', '700');
      lastLabel = i;

      // 걸음의 결과 칸
      drawCell(cells, colX(i) + (col - 8) / 2, CELL_Y, s.kind);

      // 판정 글자
      if (s.kind === 'hit') caption.textContent = t('caption.hit', 'Hit: {key}', { key: s.key });
      else if (s.kind === 'fill') caption.textContent = t('caption.fill', 'Fill: {key}', { key: s.key });
      else {
        if (s.victim === null) throw new Error('lfu-cache-stage: 밀어냄에 밀려난 키가 없다');
        caption.textContent = t('caption.evict', 'Evicted: {key}', { key: s.victim });
      }
      caption.setAttribute('fill', s.kind === 'evict' ? p.danger : p.text);
      tieNote.textContent = s.tie ? t('caption.tie', 'Count tie: the older last use leaves') : '';

      // 칸 — 키 · 막대 · 마지막 쓴 걸음
      s.slots.forEach((d, idx) => {
        const e = slots[idx];
        const touched = idx === s.slot;
        e.key.textContent = d.key === null ? '' : d.key;
        e.tag.textContent = d.old ? t('label.oldKey', 'Old key') : '';
        e.count.textContent = d.key === null ? '' : String(d.count);
        e.last.textContent = d.key === null ? '' : String(d.last);
        e.box.setAttribute('fill', d.old ? p.bgSubtle : p.bg);
        e.box.setAttribute('stroke-dasharray', d.key === null ? '4 3' : 'none');
        e.box.setAttribute(
          'stroke',
          !touched ? p.border : s.kind === 'evict' ? p.danger : s.kind === 'hit' ? p.primary : p.text,
        );
        e.box.setAttribute('stroke-width', touched ? '2' : '1');
        const from = touched && s.kind === 'evict' ? 0 : e.width;
        const to = barWidth(d.count);
        const bar = e.bar;
        animate(`bar${idx}`, ms, (k) => {
          e.width = from + (to - from) * k;
          bar.setAttribute('width', e.width.toFixed(2));
          e.count.setAttribute('x', (BAR_X + e.width + 6).toFixed(2));
        });
      });

      // 어제의 인기 키가 처음 밀려난 걸음 — 앞 판의 자리에서 미끄러져 온다
      if (s.hotOut) {
        if (s.victim !== init.hotKey) throw new Error(`lfu-cache-stage: 표지 걸음의 밀려난 키 ${String(s.victim)} 가 ${init.hotKey} 가 아니다`);
        if (hot === null) throw new Error('lfu-cache-stage: 표지가 없다');
        const target = colX(i) + col / 2;
        const start = ghostX ?? X1;
        hot.setAttribute('visibility', 'visible');
        hotX = target;
        animate('hot', ms * 2, (k) => drawHot(start + (target - start) * k));
      }
    };

    const stage: LfuCacheStage & ViewInstance = {
      setup(d: LfuStageInit): void {
        // 앞 판의 표지는 이 판의 점선 자리가 된다. 앞 판에서 끝까지 남았으면(hotX null) 점선을 두지 않고,
        // 이 판의 표지는 오른쪽 끝에서 출발한다 — 두 판 전 자리를 남기지 않는다.
        ghostX = hotX;
        hotX = null;
        build(d);
      },
      step,
      reset(): void {
        stopAll();
        root.replaceChildren();
        init = null;
        band = null;
        cells = null;
        caption = null;
        tieNote = null;
        hot = null;
        hotLabel = null;
        labels = [];
        slots = [];
        hotX = null;
        ghostX = null;
        lastLabel = -1;
      },
      destroy(): void {
        stopAll();
        root.remove();
      },
    };
    return stage;
  },
};
