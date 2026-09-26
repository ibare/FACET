/**
 * 고정 창과 미는 창 — 같은 요청 열이 위에서 두 제한기로 떨어진다.
 *
 * 위 줄은 요청 여덟이 제 시각에 선 자리다 (원본은 그 자리에 남는다).
 * 걸음마다 그 요청의 복제본이 두 레인으로 동시에 떨어진다.
 *   고정 창 레인 — 칸 둘이 박혀 있다. 칸이 바뀌는 걸음에 강조 틀이 다음 칸으로 건너가고
 *                  셈이 0 으로 비워진다. 받은 요청은 레인 안에 앉는다.
 *   미는 창 레인 — 길이 창 한 개의 틀이 요청 시각을 따라 밀려간다. 틀 안의 셈이 한도면
 *                  복제본은 레인 뚜껑 위에서 막혀 거절로 남는다.
 * 고정 창 아래의 점선 자는 미는 창과 같은 구간을 고정 창 쪽에서 잰 것이다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { axisEndOf, cellBounds, cellOf, windowBounds } from './algorithm.js';
import type { SlidingWindowCountScene, SlidingWindowCountStep } from './scene.js';

const H = 384;
const MOVE_MS = 650;
/** 운동 안에서 복제본이 내려앉는 몫 — 판정은 이때 드러난다 */
const LAND_AT = 0.7;
/** 창 · 칸 강조가 옮겨 가는 몫 */
const SHIFT_UNTIL = 0.5;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Motion = { p: number; step: SlidingWindowCountStep };

function ease(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function svg(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(round2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  style: { size: string; fill: string; anchor?: string; weight?: string; mono?: boolean },
): void {
  const node = svg(
    'text',
    {
      x,
      y,
      'font-family': style.mono ? fonts.mono : fonts.body,
      'font-size': style.size,
      fill: style.fill,
      'text-anchor': style.anchor ?? 'start',
      'dominant-baseline': 'middle',
      'font-weight': style.weight ?? 'normal',
    },
    parent,
  );
  node.textContent = body;
}

/** 레인 하나의 세로 자리 */
type Lane = { title: number; decide: number; lid: number; top: number; height: number };

const FIXED: Lane = { title: 98, decide: 116, lid: 144, top: 162, height: 44 };
const SLIDE: Lane = { title: 246, decide: 264, lid: 292, top: 310, height: 44 };
const CAPTION_Y = 20;
const STREAM_Y = 56;
const RULER_Y = FIXED.top + FIXED.height + 14;
const AXIS_Y = SLIDE.top + SLIDE.height + 18;
const CHIP_H = 16;
const PAD_X = 28;

export const slidingWindowCountStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const root = params.canvas;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function draw(scene: SlidingWindowCountScene, motion: Motion | null): void {
      root.textContent = '';
      const W = PIECE_CANVAS_W;
      const axisEnd = axisEndOf(scene.requests, scene.windowSec);
      const pxPerSec = (W - 2 * PAD_X) / axisEnd;
      const xAt = (sec: number): number => PAD_X + sec * pxPerSec;
      const chipW = Math.min(26, pxPerSec * 0.86);
      const p = motion ? motion.p : 1;
      const moving = motion ? motion.step.index : null;
      const landed = p >= LAND_AT;
      const shift = ease(p / SHIFT_UNTIL);
      const fall = ease(p / LAND_AT);

      // 같은 초의 요청은 데이터 차례대로 위아래로 쌓는다
      const stackDy = scene.requests.map((r, i) => {
        const same = scene.requests.filter((o) => o.at === r.at);
        const k = scene.requests.slice(0, i).filter((o) => o.at === r.at).length;
        return (k - (same.length - 1) / 2) * (CHIP_H + 2);
      });

      function chip(
        i: number,
        cy: number,
        look: 'pending' | 'current' | 'done' | 'accept' | 'reject',
      ): void {
        const req = scene.requests[i];
        if (!req) throw new Error(`sliding-window-count stage: 요청 ${i} 가 장면에 없다`);
        // 정수 초 at 은 칸 [at, at + 1) 의 가운데에 선다 — [lo,hi) 칸과 (lo,hi] 창 모두 그 칸 단위로 그린다
        const cx = xAt(req.at + 0.5);
        const g = svg('g', { 'data-chip': req.id }, root);
        const fill =
          look === 'current' || look === 'accept'
            ? colors.accent
            : look === 'done'
              ? colors.bgSubtle
              : colors.bg;
        const stroke =
          look === 'reject'
            ? colors.danger
            : look === 'done'
              ? colors.border
              : look === 'pending'
                ? colors.textMuted
                : colors.text;
        const ink =
          look === 'reject'
            ? colors.danger
            : look === 'done' || look === 'pending'
              ? colors.textMuted
              : colors.stateInk;
        svg(
          'rect',
          {
            x: cx - chipW / 2,
            y: cy - CHIP_H / 2,
            width: chipW,
            height: CHIP_H,
            rx: 3,
            fill,
            stroke,
            'stroke-width': look === 'current' ? 1.6 : 1,
            ...(look === 'reject' ? { 'stroke-dasharray': '3 2' } : {}),
          },
          g,
        );
        label(g, cx, cy + 0.5, req.id, { size: fontSizes.xs, fill: ink, anchor: 'middle', mono: true });
        if (look === 'reject') {
          svg(
            'line',
            {
              x1: cx - chipW / 2 - 2,
              y1: cy + CHIP_H / 2 + 1,
              x2: cx + chipW / 2 + 2,
              y2: cy - CHIP_H / 2 - 1,
              stroke: colors.danger,
              'stroke-width': 1.5,
            },
            g,
          );
        }
      }

      function gauge(x: number, y: number, filled: number): number {
        const size = 11;
        for (let k = 0; k < scene.limit; k += 1) {
          svg(
            'rect',
            {
              x: x + k * (size + 3),
              y: y - size / 2,
              width: size,
              height: size,
              rx: 2,
              fill: k < filled ? colors.accent : colors.bg,
              stroke: k < filled ? colors.text : colors.textMuted,
              'stroke-width': 1,
            },
            root,
          );
        }
        return x + scene.limit * (size + 3);
      }

      function verdictBadge(y: number, verdict: 'accept' | 'reject'): void {
        const w = 56;
        svg(
          'rect',
          {
            x: PAD_X,
            y: y - 9,
            width: w,
            height: 18,
            rx: 9,
            fill: verdict === 'accept' ? colors.accent : colors.bg,
            stroke: verdict === 'accept' ? colors.text : colors.danger,
            'stroke-width': 1.2,
          },
          root,
        );
        label(
          root,
          PAD_X + w / 2,
          y + 0.5,
          verdict === 'accept' ? t('label.accept', 'Accept') : t('label.reject', 'Reject'),
          {
            size: fontSizes.xs,
            fill: verdict === 'accept' ? colors.stateInk : colors.danger,
            anchor: 'middle',
            weight: '600',
          },
        );
      }

      // ── 캡션
      const cur = scene.current;
      const curReq = cur === null ? null : scene.requests[cur];
      if (cur !== null && !curReq) throw new Error(`sliding-window-count stage: 요청 ${cur} 가 장면에 없다`);
      label(
        root,
        PAD_X,
        CAPTION_Y,
        curReq
          ? t('caption.judge', 'Request {id} at {sec} s', { id: curReq.id, sec: curReq.at })
          : t('caption.start', 'Requests: {n}. Limit: {limit} per {win} s.', {
              n: scene.requests.length,
              limit: scene.limit,
              win: scene.windowSec,
            }),
        { size: fontSizes.md, fill: colors.text, weight: '600' },
      );

      // ── 레인 바탕
      // 고정 창: 칸마다 틀
      const cells = Math.round(axisEnd / scene.windowSec);
      for (let c = 0; c < cells; c += 1) {
        const b = cellBounds(c, scene.windowSec);
        svg(
          'rect',
          {
            x: xAt(b.lo),
            y: FIXED.top,
            width: xAt(b.hi) - xAt(b.lo),
            height: FIXED.height,
            fill: colors.bg,
            stroke: colors.border,
            'stroke-width': 1,
          },
          root,
        );
      }
      // 미는 창: 한 줄 레인
      svg(
        'rect',
        {
          x: xAt(0),
          y: SLIDE.top,
          width: xAt(axisEnd) - xAt(0),
          height: SLIDE.height,
          fill: colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
        },
        root,
      );
      // 초 눈금
      for (let s = 0; s <= axisEnd; s += 1) {
        for (const lane of [FIXED, SLIDE]) {
          svg(
            'line',
            {
              x1: xAt(s),
              y1: lane.top + lane.height,
              x2: xAt(s),
              y2: lane.top + lane.height - (s % 5 === 0 ? 6 : 3),
              stroke: colors.textMuted,
              'stroke-width': 1,
            },
            root,
          );
        }
      }
      for (let s = 0; s <= axisEnd; s += scene.windowSec / 2) {
        label(root, xAt(s), AXIS_Y, t('axis.sec', '{sec} s', { sec: s }), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'middle',
        });
      }

      // ── 고정 창: 지금 칸 강조 (칸이 바뀌는 걸음엔 건너간다)
      if (scene.fixedGauge) {
        const toCell = scene.fixedGauge.cell;
        const fromCell = motion ? motion.step.fromCell : toCell;
        const cellX = xAt(cellBounds(fromCell, scene.windowSec).lo)
          + (xAt(cellBounds(toCell, scene.windowSec).lo) - xAt(cellBounds(fromCell, scene.windowSec).lo)) * shift;
        svg(
          'rect',
          {
            x: cellX,
            y: FIXED.top,
            width: scene.windowSec * pxPerSec,
            height: FIXED.height,
            fill: colors.bgSubtle,
            stroke: colors.primary,
            'stroke-width': 2,
          },
          root,
        );
      }

      // ── 미는 창의 틀과 고정 창 쪽 자 — 같은 (at − 창, at] 을 가리킨다
      if (curReq) {
        let hi = curReq.at;
        let lo = windowBounds(curReq.at, scene.windowSec).lo;
        if (motion) {
          if (motion.step.fromAt === null) {
            lo = hi - scene.windowSec * shift;
          } else {
            hi = motion.step.fromAt + (curReq.at - motion.step.fromAt) * shift;
            lo = windowBounds(hi, scene.windowSec).lo;
          }
        }
        // 시각 0 앞은 그림에서만 자른다 — 셈은 그대로다
        // (lo, hi] 는 초 칸 lo + 1 .. hi 이다. 칸의 왼 끝 lo + 1 부터 오른 끝 hi + 1 까지 그린다
        const drawL = Math.max(0, lo + 1);
        const drawR = hi + 1;
        if (drawR > drawL) {
          svg(
            'rect',
            {
              x: xAt(drawL),
              y: SLIDE.top + 2,
              width: xAt(drawR) - xAt(drawL),
              height: SLIDE.height - 4,
              fill: colors.accent,
              'fill-opacity': 0.22,
              stroke: colors.itemActive,
              'stroke-width': 2,
              rx: 3,
            },
            root,
          );
          svg(
            'line',
            {
              x1: xAt(drawL),
              y1: RULER_Y,
              x2: xAt(drawR),
              y2: RULER_Y,
              stroke: colors.textMuted,
              'stroke-width': 1.2,
              'stroke-dasharray': '4 3',
            },
            root,
          );
          for (const x of [xAt(drawL), xAt(drawR)]) {
            svg('line', { x1: x, y1: RULER_Y - 4, x2: x, y2: RULER_Y + 4, stroke: colors.textMuted, 'stroke-width': 1.2 }, root);
          }
        }
      }

      // ── 레인 제목 · 계기
      const fixedMark = cur === null ? null : scene.fixed[cur];
      const slideMark = cur === null ? null : scene.slide[cur];
      if (cur !== null && (!fixedMark || !slideMark)) {
        throw new Error(`sliding-window-count stage: 요청 ${cur} 의 판정이 장면에 없다`);
      }

      function fixedShown(): number | null {
        if (!scene.fixedGauge) return null;
        if (!motion || !fixedMark) return scene.fixedGauge.count;
        if (landed) return fixedMark.after;
        const changed = motion.step.fromCell !== scene.fixedGauge.cell;
        if (changed && p < SHIFT_UNTIL) return Math.ceil(motion.step.fromFixedCount * (1 - shift));
        if (p < SHIFT_UNTIL) return motion.step.fromFixedCount;
        return fixedMark.before;
      }
      function slideShown(): number | null {
        if (scene.slideGauge === null) return null;
        if (!motion || !slideMark) return scene.slideGauge;
        if (landed) return slideMark.after;
        if (p < SHIFT_UNTIL) return motion.step.fromSlideCount;
        return slideMark.before;
      }
      // 지난 창 길이 안에서 받은 수 — 고정 창은 recent, 미는 창은 창 안의 셈 그대로
      function recentAt(kind: 'fixed' | 'slide', i: number): number {
        const f = scene.fixed[i];
        const s = scene.slide[i];
        if (!f || !s) throw new Error(`sliding-window-count stage: 요청 ${i} 의 판정이 장면에 없다`);
        return kind === 'fixed' ? f.recent : s.after;
      }
      function recentShown(kind: 'fixed' | 'slide'): number | null {
        if (cur === null) return null;
        if (!motion || landed) return recentAt(kind, cur);
        if (cur === 0) return null;
        return recentAt(kind, cur - 1);
      }

      const fixedCount = fixedShown();
      const slideCount = slideShown();

      label(root, PAD_X, FIXED.title, t('label.fixed', 'Fixed window'), {
        size: fontSizes.sm,
        fill: colors.text,
        weight: '600',
      });
      label(root, PAD_X, SLIDE.title, t('label.slide', 'Sliding window'), {
        size: fontSizes.sm,
        fill: colors.text,
        weight: '600',
      });
      const gaugeX = PAD_X + 118;
      if (fixedCount !== null) {
        const end = gauge(gaugeX, FIXED.title, fixedCount);
        label(root, end + 6, FIXED.title, t('label.gauge', '{n}/{limit}', { n: fixedCount, limit: scene.limit }), {
          size: fontSizes.sm,
          fill: colors.text,
          mono: true,
        });
      }
      if (slideCount !== null) {
        const end = gauge(gaugeX, SLIDE.title, slideCount);
        label(root, end + 6, SLIDE.title, t('label.gauge', '{n}/{limit}', { n: slideCount, limit: scene.limit }), {
          size: fontSizes.sm,
          fill: colors.text,
          mono: true,
        });
      }
      const fixedRecent = recentShown('fixed');
      if (fixedRecent !== null) {
        label(
          root,
          W - PAD_X,
          FIXED.title,
          t('readout.recent', 'Accepted in the last {win} s: {n}', { win: scene.windowSec, n: fixedRecent }),
          { size: fontSizes.sm, fill: fixedRecent > scene.limit ? colors.danger : colors.text, anchor: 'end', weight: '600' },
        );
      }
      const slideRecent = recentShown('slide');
      if (slideRecent !== null) {
        label(
          root,
          W - PAD_X,
          SLIDE.title,
          t('readout.recent', 'Accepted in the last {win} s: {n}', { win: scene.windowSec, n: slideRecent }),
          { size: fontSizes.sm, fill: slideRecent > scene.limit ? colors.danger : colors.text, anchor: 'end', weight: '600' },
        );
      }

      // ── 판정 줄
      if (curReq && fixedMark && slideMark) {
        const cb = cellBounds(cellOf(curReq.at, scene.windowSec), scene.windowSec);
        const detailX = PAD_X + 66;
        label(
          root,
          detailX,
          FIXED.decide,
          t('decide.fixed', 'Cell {lo}–{hi} s · accepted before: {n}', { lo: cb.lo, hi: cb.hi, n: fixedMark.before }),
          { size: fontSizes.sm, fill: colors.textMuted },
        );
        label(
          root,
          detailX,
          SLIDE.decide,
          t('decide.slide', 'Last {win} s up to {sec} s · accepted before: {n}', {
            win: scene.windowSec,
            sec: curReq.at,
            n: slideMark.before,
          }),
          { size: fontSizes.sm, fill: colors.textMuted },
        );
        if (landed) {
          verdictBadge(FIXED.decide, fixedMark.verdict);
          verdictBadge(SLIDE.decide, slideMark.verdict);
        }
      }

      // ── 위 줄: 요청 원본
      scene.requests.forEach((_r, i) => {
        const look = cur === null || i > cur ? 'pending' : i === cur ? 'current' : 'done';
        chip(i, STREAM_Y + stackDy[i]!, look);
      });

      // ── 레인에 내려앉은 복제본
      for (const [lane, marks] of [
        [FIXED, scene.fixed],
        [SLIDE, scene.slide],
      ] as const) {
        marks.forEach((mark, i) => {
          if (!mark) return;
          const dy = stackDy[i]!;
          const target = mark.verdict === 'accept' ? lane.top + lane.height / 2 + dy : lane.lid + dy;
          if (i === moving && !landed) {
            const y = STREAM_Y + dy + (target - (STREAM_Y + dy)) * fall;
            chip(i, y, 'current');
            return;
          }
          chip(i, target, mark.verdict);
        });
      }
    }

    function frame(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function play(next: SlidingWindowCountScene, step: SlidingWindowCountStep, mine: number): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / MOVE_MS);
        draw(next, { p, step });
        if (p >= 1) break;
        await frame(16);
      }
      if (mine !== gen || destroyed) return;
      draw(next, null);
    }

    return {
      render(
        next: SlidingWindowCountScene,
        prev: SlidingWindowCountScene | null,
        opts: { animate: boolean },
      ): Promise<void> | void {
        const mine = (gen += 1);
        const step = next.step;
        const follows =
          prev !== null && step !== null && (prev.current === null ? -1 : prev.current) === step.index - 1;
        if (!opts.animate || !follows || step === null) {
          draw(next, null);
          return;
        }
        return play(next, step, mine);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        params.canvas.textContent = '';
      },
    };
  },
};
