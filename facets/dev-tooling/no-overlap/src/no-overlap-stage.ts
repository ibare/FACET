/**
 * no-overlap 무대 — 세로축이 버전(위로 갈수록 높다)인 기둥들.
 *
 * 요구마다 기둥 하나, 오른쪽 끝에 "함께 쓸 구간" 기둥 하나. 요구의 범위 문자열이 풀리면
 * 두 끝(아래 포함 = 찬 점, 위 제외 = 빈 점)이 머리에서 내려와 제 높이에 선다. 함께 쓸 기둥의
 * 아래 끝은 바닥에서 **올라가고** 위 끝은 천장에서 **내려와**, 둘이 엇갈리면 그 사이의 틈이
 * 드러난다. 공개된 버전 목록은 그리지 않는다 — 축의 눈금은 풀린 끝들뿐이다.
 *
 * 축의 높이는 버전의 크기가 아니라 **차례**다. 풀릴 끝들을 모두 모아 차례를 매기고 같은 간격으로
 * 둔다 (끝을 푸는 셈은 알고리즘의 rangeBounds · compareVersions 를 그대로 부른다).
 */
import {
  categorical,
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
import { compareVersions, rangeBounds } from './algorithm.js';
import { readNoOverlapBase, type NoOverlapScene } from './scene.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로 자리 */
const HEAD_NAME_Y = 30;
const HEAD_RANGE_Y = 54;
const DROP_FROM_Y = 72; // 풀린 두 끝이 떠나는 자리 (범위 문자열 바로 아래)
const CEIL_Y = 96; // 함께 쓸 위 끝이 처음 있는 자리
const FLOOR_Y = 332; // 함께 쓸 아래 끝이 처음 있는 자리
const RANK_PAD = 30; // 천장 · 바닥과 첫 · 끝 눈금 사이
const ALERT_Y = 352;
const ALERT_H = 34;
const CAPTION_Y = H - 20;

/** 가로 자리 — 폭에서 역산한다 */
const AXIS_LABEL_X = 62;
const COLS_LEFT = 78;
const RIGHT_PAD = 14;
const SHARED_WIDEN = 1.4;

/** 운동 길이 (ms) */
const MS_UNFOLD = 520;
const MS_END = 640;
const MS_VERDICT = 420;
const FRAME_MS = 16;

function r1(n: number): number {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

type Attrs = Record<string, string | number>;

function node(parent: Element, tag: string, attrs: Attrs, content?: string): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    e.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  }
  if (content !== undefined) e.textContent = content;
  parent.appendChild(e);
  return e;
}

/** 풀릴 끝들을 모두 모아 차례를 매긴다 — 버전 → 차례 */
function rankVersions(ranges: string[]): Map<string, number> {
  const all: string[] = [];
  for (const r of ranges) {
    const b = rangeBounds(r);
    for (const v of [b.low, b.high]) if (!all.includes(v)) all.push(v);
  }
  all.sort(compareVersions);
  return new Map(all.map((v, i) => [v, i]));
}

export const noOverlapStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // initialData 가 없으면 빈 캔버스 — canvas-attach 검사가 config 만 주고 마운트한다
    const base = params.initialData ? readNoOverlapBase(params.initialData) : null;
    const ranks = base ? rankVersions(base.reqs.map((r) => r.range)) : new Map<string, number>();
    const rankCount = ranks.size;
    const colCount = base ? base.reqs.length + 1 : 1;
    // 함께 쓸 기둥은 머리 글이 길어 조금 넓다
    const colW = (W - COLS_LEFT - RIGHT_PAD) / (colCount - 1 + SHARED_WIDEN);
    const sharedW = colW * SHARED_WIDEN;
    const reqColors = categorical(base ? base.reqs.length : 1, 'vivid');
    const sharedIdx = colCount - 1;

    function colX(i: number): number {
      return i === sharedIdx ? COLS_LEFT + colW * i + sharedW / 2 : COLS_LEFT + colW * (i + 0.5);
    }

    function colWidth(i: number): number {
      return i === sharedIdx ? sharedW : colW;
    }

    function vy(version: string): number {
      const r = ranks.get(version);
      if (r === undefined) throw new Error(`no-overlap: 축에 없는 버전 "${version}"`);
      const span = FLOOR_Y - CEIL_Y - 2 * RANK_PAD;
      return rankCount > 1 ? FLOOR_Y - RANK_PAD - (span * r) / (rankCount - 1) : (FLOOR_Y + CEIL_Y) / 2;
    }

    function reqColor(i: number): string {
      const col = reqColors[i % reqColors.length];
      if (col === undefined) throw new Error('no-overlap: 요구 색이 없다');
      return col;
    }

    /** 한 기둥의 띠 — lowY 에 찬 점(포함), highY 에 빈 점(제외) */
    function band(x: number, lowY: number, highY: number, color: string, fillOpacity: number): void {
      if (lowY > highY) {
        node(svg, 'rect', {
          x: x - 7,
          y: highY,
          width: 14,
          height: lowY - highY,
          rx: 3,
          fill: color,
          'fill-opacity': fillOpacity,
          stroke: color,
          'stroke-width': 1.5,
        });
      }
      endDot(x, lowY, color, true);
      endDot(x, highY, color, false);
    }

    function endDot(x: number, y: number, color: string, included: boolean): void {
      node(svg, 'circle', {
        cx: x,
        cy: y,
        r: 6.5,
        fill: included ? color : c.bg,
        stroke: color,
        'stroke-width': 2.5,
      });
    }

    function header(i: number, line1: string, line2: string, mono: boolean, flagged: boolean): void {
      const x = colX(i);
      const w = colWidth(i);
      if (flagged) {
        node(svg, 'rect', {
          x: x - w / 2 + 6,
          y: HEAD_NAME_Y - 18,
          width: w - 12,
          height: HEAD_RANGE_Y - HEAD_NAME_Y + 30,
          rx: 6,
          fill: 'none',
          stroke: c.danger,
          'stroke-width': 2,
        });
      }
      node(
        svg,
        'text',
        {
          x,
          y: HEAD_NAME_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        },
        line1,
      );
      node(
        svg,
        'text',
        {
          x,
          y: HEAD_RANGE_Y,
          'text-anchor': 'middle',
          'font-family': mono ? fonts.mono : fonts.body,
          'font-size': mono ? fontSizes.lg : fontSizes.sm,
          'font-weight': mono ? 700 : 600,
          fill: flagged ? c.danger : c.text,
        },
        line2,
      );
    }

    /**
     * 장면 하나를 세운다. p 는 이번 걸음 운동의 진행 (1 = 끝 자리, 정적 그리기).
     */
    function draw(s: NoOverlapScene, p: number): void {
      svg.textContent = '';
      node(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: c.bg });

      const step = s.step;
      const clash = s.verdict && s.verdict.empty ? s.verdict.clash : [];

      // 함께 쓸 기둥의 바탕 칸
      const sharedLeft = COLS_LEFT + colW * sharedIdx;
      node(svg, 'rect', {
        x: sharedLeft + 4,
        y: HEAD_NAME_Y - 20,
        width: sharedW - 8,
        height: FLOOR_Y - HEAD_NAME_Y + 30,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });

      // 축 — 위로 갈수록 높은 버전
      node(svg, 'line', {
        x1: COLS_LEFT - 6,
        y1: FLOOR_Y,
        x2: COLS_LEFT - 6,
        y2: CEIL_Y - 4,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      node(svg, 'path', {
        d: `M ${r1(COLS_LEFT - 10)} ${r1(CEIL_Y + 2)} L ${r1(COLS_LEFT - 6)} ${r1(CEIL_Y - 6)} L ${r1(COLS_LEFT - 2)} ${r1(CEIL_Y + 2)}`,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1.5,
      });
      node(
        svg,
        'text',
        {
          x: AXIS_LABEL_X,
          y: CEIL_Y + 4,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        t('label.higher', 'higher'),
      );

      // 눈금 — 풀린 끝들만
      const shown: string[] = [];
      for (const u of s.unfolded) {
        if (!u) continue;
        for (const v of [u.low, u.high]) if (!shown.includes(v)) shown.push(v);
      }
      for (const v of shown) {
        const y = vy(v);
        node(svg, 'line', {
          x1: COLS_LEFT - 10,
          y1: y,
          x2: W - RIGHT_PAD,
          y2: y,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        });
        node(
          svg,
          'text',
          {
            x: AXIS_LABEL_X,
            y: y + 4,
            'text-anchor': 'end',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.text,
          },
          v,
        );
      }

      // 요구 기둥
      s.reqs.forEach((req, i) => {
        header(i, t('label.request', '{from} → {dep}', { from: req.from, dep: s.dep }), req.range, true, clash.includes(i));
        const u = s.unfolded[i];
        if (!u) return;
        const moving = step.kind === 'unfold' && step.index === i;
        const q = moving ? ease(p) : 1;
        const lowY = lerp(DROP_FROM_Y, vy(u.low), q);
        const highY = lerp(DROP_FROM_Y, vy(u.high), q);
        band(colX(i), lowY, highY, reqColor(i), 0.3);
      });

      // 함께 쓸 기둥 머리
      header(
        sharedIdx,
        t('label.shared', 'usable by both'),
        t('label.oneCopy', '{dep} — one copy only', { dep: s.dep }),
        false,
        false,
      );

      const sx = colX(sharedIdx);

      // 끝을 준 요구에서 함께 쓸 기둥까지 잇는 자취
      const lowerQ = step.kind === 'lower' ? ease(p) : 1;
      const upperQ = step.kind === 'upper' ? ease(p) : 1;
      const lowerY = s.lower ? lerp(FLOOR_Y, vy(s.lower.version), lowerQ) : FLOOR_Y;
      const upperY = s.upper ? lerp(CEIL_Y, vy(s.upper.version), upperQ) : CEIL_Y;
      for (const end of [s.lower, s.upper]) {
        if (!end) continue;
        const y = vy(end.version);
        node(svg, 'line', {
          x1: colX(end.from) + 10,
          y1: y,
          x2: sx - 10,
          y2: y,
          stroke: reqColor(end.from),
          'stroke-width': 1.5,
          'stroke-dasharray': '6 4',
        });
      }

      // 틈 — 판정이 비었다고 한 뒤, 엇갈린 두 끝 사이
      if (s.verdict && s.verdict.empty) {
        const gq = step.kind === 'verdict' ? ease(p) : 1;
        const top = vy(s.verdict.low);
        const bottom = vy(s.verdict.high);
        const mid = (top + bottom) / 2;
        const half = ((bottom - top) / 2) * gq;
        node(svg, 'rect', {
          x: sx - 26,
          y: mid - half,
          width: 52,
          height: 2 * half,
          fill: c.danger,
          'fill-opacity': 0.14,
          stroke: c.danger,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 3',
        });
      }

      // 함께 쓸 구간 — 아래 끝이 위 끝보다 낮을 때만 띠가 있다
      const sharedColor = s.verdict && !s.verdict.empty ? c.accent : c.text;
      if (lowerY > upperY) {
        node(svg, 'rect', {
          x: sx - 7,
          y: upperY,
          width: 14,
          height: lowerY - upperY,
          rx: 3,
          fill: sharedColor,
          'fill-opacity': s.lower && s.upper ? 0.35 : 0.1,
          stroke: sharedColor,
          'stroke-width': 1.5,
          'stroke-dasharray': s.lower && s.upper ? 'none' : '4 3',
        });
      }
      if (s.lower) endDot(sx, lowerY, sharedColor, true);
      else unknownEnd(sx, FLOOR_Y);
      if (s.upper) endDot(sx, upperY, sharedColor, false);
      else unknownEnd(sx, CEIL_Y);

      // 알림 — 부딪힌 두 요구를 이름으로
      if (s.verdict) {
        const v = s.verdict;
        const alertText = v.empty
          ? conflictText(s, v.clash)
          : t('alert.fits', '{dep}: pick from {low} up to {high} (excluded)', {
              dep: s.dep,
              low: v.low,
              high: v.high,
            });
        const tone = v.empty ? c.danger : c.text;
        node(svg, 'rect', {
          x: COLS_LEFT,
          y: ALERT_Y,
          width: W - COLS_LEFT - RIGHT_PAD,
          height: ALERT_H,
          rx: 6,
          fill: c.bg,
          stroke: tone,
          'stroke-width': 2,
        });
        node(
          svg,
          'text',
          {
            x: (COLS_LEFT + W - RIGHT_PAD) / 2,
            y: ALERT_Y + ALERT_H / 2 + 5,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: tone,
          },
          alertText,
        );
      }

      node(
        svg,
        'text',
        {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        },
        caption(s),
      );
    }

    /** 아직 정해지지 않은 끝 — 가로 막대 */
    function unknownEnd(x: number, y: number): void {
      node(svg, 'line', {
        x1: x - 12,
        y1: y,
        x2: x + 12,
        y2: y,
        stroke: c.textMuted,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
    }

    function conflictText(s: NoOverlapScene, clash: number[]): string {
      const a = s.reqs[clash[0] ?? -1];
      const b = s.reqs[clash[1] ?? -1];
      if (!a || !b) throw new Error('no-overlap: 부딪힌 요구가 둘이 아니다');
      return t('alert.conflict', 'Cannot resolve {dep} — {a} wants {ra}, {b} wants {rb}', {
        dep: s.dep,
        a: a.from,
        ra: a.range,
        b: b.from,
        rb: b.range,
      });
    }

    function caption(s: NoOverlapScene): string {
      const step = s.step;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'Each side asks for {dep}; only one copy can be installed.', { dep: s.dep });
        case 'unfold': {
          const req = s.reqs[step.index];
          const u = s.unfolded[step.index];
          if (!req || !u) throw new Error('no-overlap: 풀린 요구가 장면에 없다');
          return t('caption.unfold', '{from} {range}: from {low} (included) up to {high} (excluded).', {
            from: req.from,
            range: req.range,
            low: u.low,
            high: u.high,
          });
        }
        case 'lower': {
          const end = s.lower;
          const req = end ? s.reqs[end.from] : undefined;
          if (!end || !req) throw new Error('no-overlap: 아래 끝이 장면에 없다');
          return t('caption.lower', 'Shared lower end: the higher of the lower ends — {v} ({from}).', {
            v: end.version,
            from: req.from,
          });
        }
        case 'upper': {
          const end = s.upper;
          const req = end ? s.reqs[end.from] : undefined;
          if (!end || !req) throw new Error('no-overlap: 위 끝이 장면에 없다');
          return t('caption.upper', 'Shared upper end: the lower of the upper ends — {v} ({from}).', {
            v: end.version,
            from: req.from,
          });
        }
        case 'verdict': {
          const v = s.verdict;
          if (!v) throw new Error('no-overlap: 판정이 장면에 없다');
          return v.empty
            ? t('caption.empty', 'Lower end {low} ≥ upper end {high}: no version is left between them.', {
                low: v.low,
                high: v.high,
              })
            : t('caption.fits', 'Lower end {low} < upper end {high}: versions remain between them.', {
                low: v.low,
                high: v.high,
              });
        }
      }
    }

    function motionMs(s: NoOverlapScene): number {
      switch (s.step.kind) {
        case 'start':
          return 0;
        case 'unfold':
          return MS_UNFOLD;
        case 'lower':
        case 'upper':
          return MS_END;
        case 'verdict':
          return MS_VERDICT;
      }
    }

    /** 한 시계로 p 를 0 → 1 로 흘린다. destroy 나 새 render 면 곧바로 풀린다 */
    function run(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: NoOverlapScene,
      _prev: NoOverlapScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const ms = motionMs(next);
      if (!opts.animate || ms === 0) {
        draw(next, 1);
        return;
      }
      draw(next, 0);
      await run(ms, mine, (p) => draw(next, p));
      if (destroyed || mine !== gen) return;
      draw(next, 1);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    if (!base) {
      return {
        render: (): void => undefined,
        destroy,
      };
    }

    return { render, destroy };
  },
};
