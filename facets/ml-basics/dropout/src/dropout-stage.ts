/**
 * dropout 무대 — 왼쪽은 칸 여섯(켜짐 · 쉼 · 켜진 칸의 몫)과 출력 y, 오른쪽은 출력 y 의 세로 축 위에
 * 마흔 점이 한 점씩 떨어져 쌓이는 무리. 무리 곁에 모두 켠 값 · 기댓값 · 표본 평균 표지와 흩어짐 괄호.
 *
 * 운동: 한 걸음에 마스크 다섯 벌이 차례로 지나가며 칸이 꺼졌다 켜지고, 그때마다 점 하나가 출력에서
 * 날아가 제자리에 쌓인다. 판 머리에는 기댓값 표지가 새 자리로 옮겨 가고(되살림을 끄면 아래로),
 * 모음 걸음에는 표본 평균 표지가 기댓값 자리에서 떨어져 제자리로 가고 흩어짐 괄호가 벌어진다.
 *
 * 셈은 하지 않는다 — y · 기댓값 · 평균 · 흩어짐 · 몫 · 점의 칸 · 옆 자리 · 눈금은 payload 로 받는다.
 * 무대가 하는 셈은 값 → 화면 좌표와 두 걸음 사이를 잇는 보간뿐이다.
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

const W = 900;
const H = 500;

// 왼쪽 — 칸
const CELL_TOP = 100;
const CELL_ROW = 38;
const CELL_LABEL_X = 24;
const PIP_X = 62;
const PIP_R = 7;
const OFF_TEXT_X = 76;
const SHARE_ZERO_X = 170;
const SHARE_SPAN = 100;
const SHARE_BAR_H = 12;
const SHARE_VALUE_X = 318;
const OUT_Y = 342;
const OUT_NODE_X = 330;
const READ_TOP = 384;
const READ_ROW = 22;

// 오른쪽 — 무리
const AXIS_X = 430;
const AXIS_TOP = 84;
const AXIS_BOT = 468;
const DOT_X0 = 442;
const DOT_DX = 8.2;
const DOT_R = 3.5;
const LINE_END = 780;
const BRACKET_X = 790;
const TAG_X = 804;
const TAG_GAP = 15;

export type DropoutInitView = {
  cells: number;
  shares: number[];
  shareMax: number;
  yLo: number;
  yHi: number;
  ticks: number[];
  maskCount: number;
};

export type DropoutAllOnView = {
  p: number;
  rescale: number;
  allOn: number;
  expected: number;
  shares: number[];
};

export type DropoutMaskView = {
  k: number;
  y: number;
  binY: number;
  slot: number;
  on: boolean[];
  shares: number[];
};

export type DropoutMasksView = {
  p: number;
  rescale: number;
  from: number;
  to: number;
  masks: DropoutMaskView[];
  off: number;
};

export type DropoutSummaryView = {
  mean: number;
  sd: number;
  expected: number;
  allOn: number;
  pct: number;
};

export type DropoutStage = ViewInstance & {
  setup(init: DropoutInitView): void;
  reset(): void;
  allOn(s: DropoutAllOnView, ms: number): Promise<void>;
  masks(s: DropoutMasksView, ms: number): Promise<void>;
  summary(s: DropoutSummaryView, ms: number): Promise<void>;
};

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

/** 음수 부호를 수학 기호 − 로. */
function fmt(x: number, digits: number): string {
  return x.toFixed(digits).replace(/^-/, '−');
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

type Cell = {
  pip: SVGCircleElement;
  off: SVGTextElement;
  bar: SVGRectElement;
  value: SVGTextElement;
};

type Marker = {
  line: SVGLineElement;
  lead: SVGLineElement;
  tag: SVGTextElement;
  value: number | null;
};

export const dropoutStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): DropoutStage {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const [expectedInk, meanInk] = categorical(2, 'deep');
    if (expectedInk === undefined || meanInk === undefined) throw new Error('dropout-stage: 표지 색이 없다');
    const isInstant = params.isInstant ?? (() => false);
    const sm = parseFloat(fontSizes.sm);

    const text = (
      parent: Element,
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end' = 'start',
      weight: number = 400,
    ): SVGTextElement =>
      el('text', { x, y, 'font-family': fonts.body, 'font-size': size, fill, 'text-anchor': anchor, 'font-weight': weight }, parent);

    // ── 층
    const root = el('g', {}, svg);
    const frame = el('g', {}, root);
    const markerLayer = el('g', {}, root);
    const dotLayer = el('g', {}, root);
    const topLayer = el('g', {}, root);

    const caption = text(topLayer, 20, 26, fontSizes.md, c.text, 'start', 600);
    const formula = text(topLayer, 20, 50, fontSizes.sm, c.textMuted);
    const maskTag = text(topLayer, SHARE_VALUE_X, 80, fontSizes.sm, c.text, 'end', 600);
    const outValue = text(topLayer, SHARE_VALUE_X, OUT_Y + 5, fontSizes.lg, c.text, 'end', 700);

    // ── 애니메이션 — 되짚기 · 즉시 모드면 끝 상태로 건너뛴다
    let destroyed = false;
    const frames = new Set<number>();
    const finishers = new Set<() => void>();
    const tween = (ms: number, draw: (u: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0) {
          draw(1);
          resolve();
          return;
        }
        const start = performance.now();
        const finish = () => {
          if (!finishers.delete(finish)) return;
          draw(1);
          resolve();
        };
        finishers.add(finish);
        const tick = (now: number) => {
          frames.delete(id);
          if (!finishers.has(finish)) return;
          const u = Math.min(1, (now - start) / ms);
          if (u >= 1 || destroyed || isInstant()) {
            finish();
            return;
          }
          draw(u);
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
      });
    const stopAll = () => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const f of [...finishers]) f();
    };
    params.onScrubStart?.(stopAll);

    // ── 뼈대 (setup 에서 짓는다 — 여러 번 먹여도 요소 수가 같다)
    let init: DropoutInitView | null = null;
    let cells: Cell[] = [];
    let shareScale = 0;
    let dots: SVGCircleElement[] = [];
    const markers: Record<'allOn' | 'expected' | 'mean', Marker> = {
      allOn: makeMarker(c.textMuted, '2 3', 1.5),
      expected: makeMarker(expectedInk, '', 2.5),
      mean: makeMarker(meanInk, '6 3', 2),
    };
    const bracket = el('path', { fill: 'none', stroke: meanInk, 'stroke-width': 1.5, visibility: 'hidden' }, markerLayer);
    const readout: Record<'allOn' | 'expected' | 'mean' | 'spread' | 'share', SVGTextElement> = {
      allOn: el('text', {}, topLayer),
      expected: el('text', {}, topLayer),
      mean: el('text', {}, topLayer),
      spread: el('text', {}, topLayer),
      share: el('text', {}, topLayer),
    };
    let meanShown: number | null = null;
    let sdShown = 0;

    function makeMarker(stroke: string, dash: string, width: number): Marker {
      const line = el('line', { x1: AXIS_X, x2: LINE_END, stroke, 'stroke-width': width, visibility: 'hidden' }, markerLayer);
      if (dash) line.setAttribute('stroke-dasharray', dash);
      const lead = el('line', { stroke, 'stroke-width': 1, visibility: 'hidden' }, markerLayer);
      const tag = el('text', { x: TAG_X, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.text, visibility: 'hidden' }, markerLayer);
      return { line, lead, tag, value: null };
    }

    const need = (): DropoutInitView => {
      if (!init) throw new Error('dropout-stage: setup 전에 그리려 했다');
      return init;
    };
    const yPx = (v: number): number => {
      const d = need();
      return AXIS_TOP + ((d.yHi - v) / (d.yHi - d.yLo)) * (AXIS_BOT - AXIS_TOP);
    };

    const setShare = (cell: Cell, share: number, on: boolean) => {
      const w = Math.abs(share) * shareScale;
      cell.bar.setAttribute('x', String(share >= 0 ? SHARE_ZERO_X : SHARE_ZERO_X - w));
      cell.bar.setAttribute('width', String(w));
      cell.pip.setAttribute('fill', on ? c.primary : c.bg);
      cell.pip.setAttribute('stroke', on ? c.primary : c.textMuted);
      cell.pip.setAttribute('stroke-dasharray', on ? '' : '2 2');
      cell.off.setAttribute('visibility', on ? 'hidden' : 'visible');
      cell.value.textContent = on ? fmt(share, 3) : '';
    };

    /** 표지 셋의 글 자리 — 선 자리에서 시작해 서로 TAG_GAP 만큼 밀어낸다. */
    const layoutTags = () => {
      const live = (Object.keys(markers) as (keyof typeof markers)[])
        .map((key) => ({ m: markers[key], key }))
        .filter((e) => e.m.value !== null)
        .map((e) => ({ ...e, want: yPx(e.m.value!), at: 0 }))
        .sort((a, b) => a.want - b.want);
      let prev = -Infinity;
      for (const e of live) {
        e.at = Math.max(e.want, prev + TAG_GAP);
        prev = e.at;
      }
      const over = live.length > 0 ? live[live.length - 1]!.at - (H - 6) : 0;
      if (over > 0) for (const e of live) e.at -= over;
      for (const e of live) {
        const ly = yPx(e.m.value!);
        e.m.line.setAttribute('y1', String(ly));
        e.m.line.setAttribute('y2', String(ly));
        e.m.lead.setAttribute('x1', String(LINE_END));
        e.m.lead.setAttribute('y1', String(ly));
        e.m.lead.setAttribute('x2', String(TAG_X - 3));
        e.m.lead.setAttribute('y2', String(e.at));
        e.m.tag.setAttribute('y', String(e.at + 4));
      }
      if (meanShown !== null) {
        const top = yPx(meanShown + sdShown);
        const bot = yPx(meanShown - sdShown);
        bracket.setAttribute(
          'd',
          `M ${BRACKET_X - 4} ${top} H ${BRACKET_X} V ${bot} H ${BRACKET_X - 4}`,
        );
      }
    };

    const showMarker = (key: keyof typeof markers, value: number | null, tag: string) => {
      const m = markers[key];
      m.value = value;
      const vis = value === null ? 'hidden' : 'visible';
      m.line.setAttribute('visibility', vis);
      m.lead.setAttribute('visibility', vis);
      m.tag.setAttribute('visibility', vis);
      m.tag.textContent = tag;
    };

    const setReadout = (key: keyof typeof readout, label: string, value: string) => {
      readout[key].textContent = value === '' ? label : `${label}  ${value}`;
    };

    const clearDots = () => {
      for (const d of dots) d.remove();
      dots = [];
    };

    const blankReadouts = () => {
      setReadout('allOn', t('label.allOn', 'All-on output'), '');
      setReadout('expected', t('label.expected', 'Expected value'), '');
      setReadout('mean', t('label.mean', 'Sample mean'), '');
      setReadout('spread', t('label.spread', 'Spread (sd)'), '');
      setReadout('share', t('label.dropShare', 'Dropped share'), '');
    };

    const setup = (d: DropoutInitView) => {
      stopAll();
      init = d;
      frame.replaceChildren();
      clearDots();
      cells = [];
      if (!(d.shareMax > 0)) throw new Error('dropout-stage: 몫의 자가 0 이다');
      shareScale = SHARE_SPAN / d.shareMax;

      // 칸
      text(frame, CELL_LABEL_X, 80, fontSizes.sm, c.textMuted, 'start', 600).textContent = t('label.cells', 'Units and their shares');
      el('line', { x1: SHARE_ZERO_X, x2: SHARE_ZERO_X, y1: CELL_TOP - 16, y2: CELL_TOP + CELL_ROW * (d.cells - 1) + 16, stroke: c.border }, frame);
      for (let i = 0; i < d.cells; i++) {
        const cy = CELL_TOP + i * CELL_ROW;
        text(frame, CELL_LABEL_X, cy + 4, fontSizes.sm, c.text).textContent = `u${i + 1}`;
        const pip = el('circle', { cx: PIP_X, cy, r: PIP_R, 'stroke-width': 1.5 }, frame);
        const off = text(frame, OFF_TEXT_X, cy + 4, fontSizes.xs, c.textMuted);
        off.textContent = t('label.off', 'off');
        const bar = el('rect', { y: cy - SHARE_BAR_H / 2, height: SHARE_BAR_H, fill: c.primary, rx: 2 }, frame);
        const value = text(frame, SHARE_VALUE_X, cy + 4, fontSizes.xs, c.text, 'end');
        const cell = { pip, off, bar, value };
        cells.push(cell);
        setShare(cell, d.shares[i]!, true);
      }

      // 출력
      text(frame, CELL_LABEL_X, OUT_Y + 5, fontSizes.sm, c.text, 'start', 600).textContent = t('label.output', 'Output y');
      el('circle', { cx: OUT_NODE_X, cy: OUT_Y, r: 5, fill: c.primary }, frame);
      el('line', { x1: CELL_LABEL_X, x2: SHARE_VALUE_X + 12, y1: OUT_Y - 22, y2: OUT_Y - 22, stroke: c.border }, frame);

      // 읽기판
      const glyph = (row: number, draw: (y: number) => void) => draw(READ_TOP + row * READ_ROW);
      glyph(0, (y) => el('line', { x1: CELL_LABEL_X, x2: CELL_LABEL_X + 20, y1: y - 4, y2: y - 4, stroke: c.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '2 3' }, frame));
      glyph(1, (y) => el('line', { x1: CELL_LABEL_X, x2: CELL_LABEL_X + 20, y1: y - 4, y2: y - 4, stroke: expectedInk, 'stroke-width': 2.5 }, frame));
      glyph(2, (y) => el('line', { x1: CELL_LABEL_X, x2: CELL_LABEL_X + 20, y1: y - 4, y2: y - 4, stroke: meanInk, 'stroke-width': 2, 'stroke-dasharray': '6 3' }, frame));
      glyph(3, (y) => el('path', { d: `M ${CELL_LABEL_X + 14} ${y - 11} H ${CELL_LABEL_X + 18} V ${y + 3} H ${CELL_LABEL_X + 14}`, fill: 'none', stroke: meanInk, 'stroke-width': 1.5 }, frame));
      const keys: (keyof typeof readout)[] = ['allOn', 'expected', 'mean', 'spread', 'share'];
      keys.forEach((key, row) => {
        const r = readout[key];
        for (const [k, v] of Object.entries({ x: CELL_LABEL_X + 30, y: READ_TOP + row * READ_ROW, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text })) {
          r.setAttribute(k, String(v));
        }
      });
      blankReadouts();

      // 축
      el('line', { x1: AXIS_X, x2: AXIS_X, y1: AXIS_TOP - 8, y2: AXIS_BOT + 8, stroke: c.textMuted }, frame);
      text(frame, AXIS_X, AXIS_TOP - 16, fontSizes.sm, c.textMuted, 'start', 600).textContent = t('label.cloud', 'Outputs, one dot per mask');
      for (const tick of d.ticks) {
        const ty = yPx(tick);
        el('line', { x1: AXIS_X - 5, x2: AXIS_X, y1: ty, y2: ty, stroke: c.textMuted }, frame);
        el('line', { x1: AXIS_X, x2: LINE_END, y1: ty, y2: ty, stroke: c.border, 'stroke-width': 0.5 }, frame);
        text(frame, AXIS_X - 8, ty + sm / 3, fontSizes.xs, c.textMuted, 'end').textContent = fmt(tick, 1);
      }
      markerLayer.appendChild(bracket);
    };

    const reset = () => {
      stopAll();
      clearDots();
      showMarker('allOn', null, '');
      showMarker('expected', null, '');
      showMarker('mean', null, '');
      meanShown = null;
      sdShown = 0;
      bracket.setAttribute('visibility', 'hidden');
      caption.textContent = '';
      formula.textContent = '';
      maskTag.textContent = '';
      outValue.textContent = '';
      if (init) {
        cells.forEach((cell, i) => setShare(cell, init!.shares[i]!, true));
        blankReadouts();
      }
    };

    const formulaFor = (p: number, rescale: number): string =>
      rescale === 1
        ? t('formula.rescale', 'y = Σ mᵢ·hᵢ·vᵢ / (1 − p),   p = {p}', { p: String(p) })
        : t('formula.plain', 'y = Σ mᵢ·hᵢ·vᵢ,   p = {p}', { p: String(p) });

    const stage: DropoutStage = {
      setup,
      reset,
      async allOn(s, ms) {
        need();
        stopAll();
        // 앞 판의 결론을 걷는다 — 쌓인 점 · 표본 평균 · 흩어짐 · 쉰 몫
        clearDots();
        showMarker('mean', null, '');
        meanShown = null;
        sdShown = 0;
        bracket.setAttribute('visibility', 'hidden');
        blankReadouts();
        maskTag.textContent = '';

        caption.textContent = t('caption.allOn', 'All units on: y = {y}. Expected value {e}', {
          y: fmt(s.allOn, 2),
          e: fmt(s.expected, 3),
        });
        formula.textContent = `${t('formula.allOn', 'y = Σ hᵢ·vᵢ')}   ·   ${formulaFor(s.p, s.rescale)}`;
        outValue.textContent = fmt(s.allOn, 2);
        setReadout('allOn', t('label.allOn', 'All-on output'), fmt(s.allOn, 2));
        setReadout('expected', t('label.expected', 'Expected value'), fmt(s.expected, 3));
        showMarker('allOn', s.allOn, t('tag.allOn', 'all on {v}', { v: fmt(s.allOn, 2) }));

        const from = markers.expected.value;
        const to = s.expected;
        const fromShares = cells.map((cell) => {
          const w = Number(cell.bar.getAttribute('width'));
          const left = Number(cell.bar.getAttribute('x')) < SHARE_ZERO_X;
          return (left ? -w : w) / shareScale;
        });
        showMarker('expected', from ?? to, t('tag.expected', 'expected {v}', { v: fmt(to, 3) }));
        await tween(ms, (u) => {
          const e = ease(u);
          markers.expected.value = from === null ? to : lerp(from, to, e);
          cells.forEach((cell, i) => {
            setShare(cell, lerp(fromShares[i]!, s.shares[i]!, e), true);
            cell.value.textContent = fmt(s.shares[i]!, 3);
          });
          layoutTags();
        });
      },
      async masks(s, ms) {
        const d = need();
        stopAll();
        caption.textContent = t('caption.masks', 'Masks #{from}–#{to}: y {ys}. Units dropped so far: {off}', {
          from: s.from,
          to: s.to,
          ys: s.masks.map((m) => fmt(m.y, 2)).join(' · '),
          off: s.off,
        });
        formula.textContent = formulaFor(s.p, s.rescale);
        const born = s.masks.map((m) => {
          const dot = el('circle', { cx: OUT_NODE_X, cy: OUT_Y, r: DOT_R, fill: c.primary, visibility: 'hidden' }, dotLayer);
          dots.push(dot);
          return { m, dot, started: false, tx: DOT_X0 + m.slot * DOT_DX, ty: yPx(m.binY) };
        });
        if (dots.length > d.maskCount) throw new Error('dropout-stage: 점이 마스크 수보다 많다');
        const n = born.length;
        const lead = 0.6 / Math.max(1, n - 1);
        const fly = 0.4;
        await tween(ms, (u) => {
          born.forEach((b, j) => {
            const local = n === 1 ? u : Math.min(1, Math.max(0, (u - j * lead) / fly));
            if (u >= j * lead && !b.started) {
              b.started = true;
              maskTag.textContent = t('label.mask', 'Mask #{k}', { k: b.m.k });
              outValue.textContent = fmt(b.m.y, 2);
              cells.forEach((cell, i) => setShare(cell, b.m.shares[i]!, b.m.on[i]!));
              b.dot.setAttribute('visibility', 'visible');
            }
            if (!b.started) return;
            const e = ease(local);
            b.dot.setAttribute('cx', String(lerp(OUT_NODE_X, b.tx, e)));
            // 떨어지는 길 — 조금 솟았다가 제자리로
            b.dot.setAttribute('cy', String(lerp(OUT_Y, b.ty, e) - Math.sin(Math.PI * e) * 24));
          });
        });
      },
      async summary(s, ms) {
        need();
        stopAll();
        caption.textContent = t('caption.summary', 'Sample mean {m}, spread {sd}. Expected value {e}. Dropped share {pct}%', {
          m: fmt(s.mean, 2),
          sd: fmt(s.sd, 2),
          e: fmt(s.expected, 3),
          pct: s.pct,
        });
        maskTag.textContent = '';
        setReadout('mean', t('label.mean', 'Sample mean'), fmt(s.mean, 2));
        setReadout('spread', t('label.spread', 'Spread (sd)'), fmt(s.sd, 2));
        setReadout('share', t('label.dropShare', 'Dropped share'), `${s.pct}%`);
        showMarker('mean', s.expected, t('tag.mean', 'sample mean {v}', { v: fmt(s.mean, 2) }));
        bracket.setAttribute('visibility', 'visible');
        await tween(ms, (u) => {
          const e = ease(u);
          meanShown = lerp(s.expected, s.mean, e);
          sdShown = s.sd * e;
          markers.mean.value = meanShown;
          layoutTags();
        });
      },
      destroy() {
        destroyed = true;
        stopAll();
        root.remove();
      },
    };
    return stage;
  },
};
