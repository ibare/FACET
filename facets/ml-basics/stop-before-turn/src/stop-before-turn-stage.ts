/**
 * stop-before-turn 의 무대.
 *
 * 위 — 에폭마다 검증 손실 점(로그 눈금). "가장 좋던 에폭" 표식이 내려가는 점을 따라 옮겨
 * 가고, 그 자리의 값에 점선이 걸린다.
 * 가운데 — 가장 좋던 에폭 바로 뒤 칸들에 참을성만큼의 기다림 칸. 표식이 옮겨 가면 칸도 함께
 * 밀려 가고, 나아지지 않은 에폭마다 한 칸씩 찬다.
 * 아래 — 에폭마다 남긴 무게. "쓰는 무게" 틀이 지금 에폭을 따라가다, 멈춘 뒤 곡선을 거슬러
 * 가장 좋던 에폭으로 돌아간다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { EpochPoint, StopBeforeTurnScene } from './scene.js';

const NS = 'http://www.w3.org/2000/svg';
const H = 360;
const MOVE_MS = 460;

const PAD_X = 8;
const LEFT = 88;
const CAP_Y = 20;
const CAP_LINE = 16;
const AXIS_TITLE_Y = 56;
const PLOT_TOP = 80;
const PLOT_BOT = 214;
const AXIS_Y = 234;
const EPOCH_Y = 250;
const CELL_TOP = 260;
const CELL_H = 18;
const FRAME_TOP = 288;
const W1_Y = 305;
const W2_Y = 323;
const FRAME_BOT = 331;
const TAG_Y = 348;

type Attrs = Record<string, string | number>;

function mk<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: SVGElement,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

/** 셋째 자리 표시. -0.000 이 나오면 셈 길이 사양과 어긋난 것이라 던진다. */
function f3(v: number): string {
  const s = v.toFixed(3);
  if (s === '-0.000') throw new Error(`stop-before-turn-stage: -0.000 표시 (${v})`);
  return s;
}

/** 글자 폭 어림 — 한글 · 한자권 글자는 온 폭, 나머지는 굵은 본문 글꼴의 평균 폭. */
function glyphW(ch: string, px: number): number {
  return /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? px : px * 0.55;
}

function wrapLines(body: string, maxW: number, px: number): string[] {
  const lines: string[] = [];
  let cur = '';
  let curW = 0;
  const push = (): void => {
    if (cur.trim() !== '') lines.push(cur.trim());
    cur = '';
    curW = 0;
  };
  for (const word of body.split(/(?<= )/)) {
    const w = [...word].reduce((a, ch) => a + glyphW(ch, px), 0);
    if (curW + w <= maxW) {
      cur += word;
      curW += w;
      continue;
    }
    if (cur !== '') push();
    if (w <= maxW) {
      cur = word;
      curW = w;
      continue;
    }
    // 빈칸 없는 긴 토막(한자권 문장)은 글자로 끊는다
    for (const ch of word) {
      const cw = glyphW(ch, px);
      if (curW + cw > maxW) push();
      cur += ch;
      curW += cw;
    }
  }
  push();
  return lines;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

type Handles = {
  segTip: { line: SVGLineElement; dot: SVGCircleElement; label: SVGTextElement; from: [number, number] } | null;
  best: { g: SVGGElement; line: SVGLineElement } | null;
  cells: SVGGElement | null;
  fill: { rect: SVGRectElement; num: SVGTextElement } | null;
  cursor: {
    ring: SVGCircleElement;
    guide: SVGLineElement;
    frame: SVGRectElement;
    tag: SVGTextElement;
  } | null;
  weightCol: SVGGElement | null;
  stop: { line: SVGLineElement; label: SVGGElement } | null;
};

export const stopBeforeTurnStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    const right = PIECE_CANVAS_W - PAD_X * 2;

    function slotW(s: StopBeforeTurnScene): number {
      if (s.axis === null) throw new Error('stop-before-turn-stage: 바탕 없이 칸 폭을 셈했다');
      return (right - LEFT) / (s.axis.lastEpoch + 1);
    }
    function xOf(s: StopBeforeTurnScene, epoch: number): number {
      return r2(LEFT + (epoch + 0.5) * slotW(s));
    }
    function yOf(s: StopBeforeTurnScene, v: number): number {
      if (s.axis === null) throw new Error('stop-before-turn-stage: 바탕 없이 높이를 셈했다');
      if (!(v > 0)) throw new Error(`stop-before-turn-stage: 로그 눈금에 둘 수 없는 값 ${v}`);
      const a = Math.log(s.axis.lo);
      const b = Math.log(s.axis.hi);
      const pad = (b - a) * 0.06;
      const lo = a - pad;
      const hi = b + pad;
      return r2(PLOT_TOP + ((hi - Math.log(v)) / (hi - lo)) * (PLOT_BOT - PLOT_TOP));
    }
    function pointAt(s: StopBeforeTurnScene, epoch: number): EpochPoint {
      const p = s.epochs[epoch];
      if (p === undefined || p.epoch !== epoch) throw new Error(`stop-before-turn-stage: 에폭 ${epoch} 의 점이 없다`);
      return p;
    }

    function text(parent: SVGElement, x: number, y: number, body: string, attrs: Attrs = {}): SVGTextElement {
      const node = mk('text', { x: r2(x), y: r2(y), 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.text, ...attrs }, parent);
      node.textContent = body;
      return node;
    }

    function caption(s: StopBeforeTurnScene): string {
      const st = s.step;
      switch (st.kind) {
        case 'none':
          return '';
        case 'start':
          return t('caption.start', 'Epoch {e}: weights before any update. Validation loss: {v}', {
            e: 0,
            v: f3(pointAt(s, 0).val),
          });
        case 'better':
          return t('caption.better', 'Epoch {e}: validation loss {v} < best {b}. The marker follows; waiting resets.', {
            e: st.epoch,
            v: f3(pointAt(s, st.epoch).val),
            b: f3(pointAt(s, st.from).val),
          });
        case 'worse':
          if (s.bestEpoch === null) throw new Error('stop-before-turn-stage: 가장 좋던 에폭이 없다');
          return t('caption.worse', 'Epoch {e}: validation loss {v} ≥ best {b}. Waited: {n} / {p}', {
            e: st.epoch,
            v: f3(pointAt(s, st.epoch).val),
            b: f3(pointAt(s, s.bestEpoch).val),
            n: s.wait,
            p: s.patience,
          });
        case 'stop':
          if (s.bestEpoch === null) throw new Error('stop-before-turn-stage: 가장 좋던 에폭이 없다');
          return t('caption.stop', 'Epoch {e}: validation loss {v} ≥ best {b}. Waited: {n} / {p} — patience is used up, training stops.', {
            e: st.epoch,
            v: f3(pointAt(s, st.epoch).val),
            b: f3(pointAt(s, s.bestEpoch).val),
            n: s.wait,
            p: s.patience,
          });
        case 'revert': {
          const b = pointAt(s, st.to);
          return t('caption.revert', 'Weights in use go back: epoch {from} → epoch {to}. w = {w1} · {w2}, validation loss: {v}', {
            from: st.from,
            to: st.to,
            w1: f3(b.w1),
            w2: f3(b.w2),
            v: f3(b.val),
          });
        }
      }
    }

    function placeCursor(h: NonNullable<Handles['cursor']>, x: number, y: number): void {
      h.ring.setAttribute('cx', String(r2(x)));
      h.ring.setAttribute('cy', String(r2(y)));
      h.guide.setAttribute('x1', String(r2(x)));
      h.guide.setAttribute('x2', String(r2(x)));
      h.guide.setAttribute('y1', String(r2(y + 9)));
      const fw = Number(h.frame.getAttribute('width'));
      h.frame.setAttribute('x', String(r2(x - fw / 2)));
      h.tag.setAttribute('x', String(r2(x)));
    }

    function drawStatic(s: StopBeforeTurnScene): Handles {
      svg.textContent = '';
      const h: Handles = { segTip: null, best: null, cells: null, fill: null, cursor: null, weightCol: null, stop: null };
      const root = mk('g', {}, svg);

      const cap = caption(s);
      if (cap !== '') {
        const lines = wrapLines(cap, PIECE_CANVAS_W - PAD_X * 2, parseFloat(fontSizes.sm));
        if (lines.length > 2) throw new Error(`stop-before-turn-stage: 캡션이 두 줄을 넘는다 — ${cap}`);
        lines.forEach((line, i) => {
          text(root, PAD_X, CAP_Y + i * CAP_LINE, line, { 'font-size': fontSizes.sm, 'font-weight': 600 });
        });
      }
      if (s.axis === null) return h;
      const axis = s.axis;
      const dx = slotW(s);

      // 머리글 · 줄 이름
      text(root, LEFT, AXIS_TITLE_Y, t('label.axis', 'Validation loss (log scale)'), { fill: colors.textMuted });
      text(root, PAD_X, EPOCH_Y, t('label.epoch', 'Epoch'), { fill: colors.textMuted });
      text(root, PAD_X, CELL_TOP + CELL_H - 5, t('label.wait', 'Waiting'), { fill: colors.textMuted });
      text(root, PAD_X, W1_Y, s.names[0], { 'font-family': fonts.mono, fill: colors.textMuted });
      text(root, PAD_X, W2_Y, s.names[1], { 'font-family': fonts.mono, fill: colors.textMuted });

      // 가로축과 에폭 번호
      mk('line', { x1: LEFT, x2: right, y1: AXIS_Y, y2: AXIS_Y, stroke: colors.border, 'stroke-width': 1 }, root);
      for (let e = 0; e <= axis.lastEpoch; e += 1) {
        const x = xOf(s, e);
        mk('line', { x1: x, x2: x, y1: AXIS_Y, y2: AXIS_Y + 4, stroke: colors.border, 'stroke-width': 1 }, root);
        text(root, x, EPOCH_Y, String(e), { 'text-anchor': 'middle', 'font-family': fonts.mono, fill: colors.textMuted });
      }

      // 멈춘 자리
      if (s.stopped) {
        // 마지막 에폭 칸의 오른쪽 끝 — 그 뒤로는 에폭이 없다
        const x = r2(right - 1);
        const line = mk('line', { x1: x, x2: x, y1: PLOT_TOP - 12, y2: AXIS_Y, stroke: colors.danger, 'stroke-width': 3 }, root);
        const label = mk('g', {}, root);
        const lw = Math.min(dx - 4, 72);
        mk('rect', { x: r2(right - lw), y: PLOT_TOP - 30, width: r2(lw), height: 16, rx: 3, fill: colors.danger }, label);
        text(label, right - lw / 2, PLOT_TOP - 18, t('label.stop', 'Stopped'), { 'text-anchor': 'middle', fill: colors.stateInk, 'font-weight': 600 });
        h.stop = { line, label };
      }

      const best = s.bestEpoch;
      if (best === null) throw new Error('stop-before-turn-stage: 바탕이 있는데 가장 좋던 에폭이 없다');
      const bp = pointAt(s, best);
      const bx = xOf(s, best);
      const by = yOf(s, bp.val);

      // 가장 좋던 값의 점선
      const bestLine = mk('line', {
        x1: LEFT,
        x2: right,
        y1: by,
        y2: by,
        stroke: colors.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '3 4',
      }, root);

      // 기다림 칸 — 가장 좋던 에폭 뒤로 참을성만큼
      const cells = mk('g', {}, root);
      const cw = r2(Math.min(dx - 10, 56));
      for (let k = 1; k <= s.patience; k += 1) {
        const e = best + k;
        if (e > axis.lastEpoch) throw new Error(`stop-before-turn-stage: 기다림 칸 ${k} 이 축 밖이다`);
        const x = xOf(s, e);
        const filled = k <= s.wait;
        const rect = mk('rect', {
          x: r2(x - cw / 2),
          y: CELL_TOP,
          width: cw,
          height: CELL_H,
          rx: 3,
          fill: filled ? colors.itemComparing : colors.bg,
          stroke: colors.itemComparing,
          'stroke-width': 1.5,
        }, cells);
        if (filled) {
          const num = text(cells, x, CELL_TOP + CELL_H - 5, String(k), {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-weight': 700,
            fill: colors.stateInk,
          });
          if (k === s.wait) h.fill = { rect, num };
        }
      }
      h.cells = cells;

      // 곡선
      let lastSeg: { line: SVGLineElement; from: [number, number] } | null = null;
      const pts = s.epochs.map((p) => [xOf(s, p.epoch), yOf(s, p.val)] as const);
      for (let i = 1; i < pts.length; i += 1) {
        const line = mk('line', {
          x1: pts[i - 1][0],
          y1: pts[i - 1][1],
          x2: pts[i][0],
          y2: pts[i][1],
          stroke: colors.text,
          'stroke-width': 1.5,
        }, root);
        if (i === pts.length - 1) lastSeg = { line, from: [pts[i - 1][0], pts[i - 1][1]] };
      }

      // 가장 좋던 에폭 표식 (점 뒤에 깔린다)
      const bestG = mk('g', {}, root);
      mk('circle', { cx: bx, cy: by, r: 10, fill: colors.accent }, bestG);
      const bw = Math.min(dx - 4, 72);
      mk('rect', { x: r2(bx - bw / 2), y: r2(by + 13), width: r2(bw), height: 15, rx: 3, fill: colors.accent }, bestG);
      text(bestG, bx, by + 24, t('label.best', 'Best'), { 'text-anchor': 'middle', fill: colors.stateInk, 'font-weight': 600 });
      h.best = { g: bestG, line: bestLine };

      // 점과 값
      s.epochs.forEach((p, i) => {
        const [x, y] = pts[i];
        const dot = mk('circle', { cx: x, cy: y, r: 4, fill: colors.text }, root);
        const label = text(root, x, y - 10, f3(p.val), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          fill: colors.text,
        });
        if (lastSeg !== null && i === pts.length - 1) h.segTip = { ...lastSeg, dot, label };
      });

      // 에폭마다 남긴 무게
      s.epochs.forEach((p) => {
        const x = xOf(s, p.epoch);
        const col = mk('g', {}, root);
        const dim = s.reverted && p.epoch > best;
        const fill = dim ? colors.textMuted : colors.text;
        text(col, x, W1_Y, f3(p.w1), { 'text-anchor': 'middle', 'font-family': fonts.mono, fill });
        text(col, x, W2_Y, f3(p.w2), { 'text-anchor': 'middle', 'font-family': fonts.mono, fill });
        if (p.epoch === s.epochs.length - 1) h.weightCol = col;
      });

      // 쓰는 무게
      if (s.used === null) throw new Error('stop-before-turn-stage: 바탕이 있는데 쓰는 무게가 없다');
      const up = pointAt(s, s.used);
      const ux = xOf(s, s.used);
      const uy = yOf(s, up.val);
      const fw = r2(Math.min(dx - 6, 60));
      const cursor = {
        ring: mk('circle', { cx: ux, cy: uy, r: 8, fill: 'none', stroke: colors.primary, 'stroke-width': 2 }, root),
        guide: mk('line', {
          x1: ux,
          x2: ux,
          y1: r2(uy + 9),
          y2: AXIS_Y,
          stroke: colors.primary,
          'stroke-width': 1,
          'stroke-dasharray': '2 3',
        }, root),
        frame: mk('rect', {
          x: r2(ux - fw / 2),
          y: FRAME_TOP,
          width: fw,
          height: FRAME_BOT - FRAME_TOP,
          rx: 4,
          fill: 'none',
          stroke: colors.primary,
          'stroke-width': 2,
        }, root),
        tag: text(root, ux, TAG_Y, t('label.used', 'In use'), {
          'text-anchor': 'middle',
          'font-weight': 700,
          fill: colors.primary,
        }),
      };
      // 안내선은 "가장 좋던" 꼬리표 뒤로 깐다
      root.insertBefore(cursor.guide, bestG);
      h.cursor = cursor;
      return h;
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let id = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          frames.delete(id);
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const t0 = performance.now();
        frame(0);
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (now - t0) / ms);
          frame(ease(p));
          if (p < 1) {
            id = requestAnimationFrame(tick);
            frames.add(id);
          } else {
            finish();
          }
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    function need<T>(v: T | null, what: string): T {
      if (v === null) throw new Error(`stop-before-turn-stage: 운동할 ${what} 손잡이가 없다`);
      return v;
    }

    async function move(s: StopBeforeTurnScene, h: Handles, mine: number): Promise<void> {
      const st = s.step;
      if (st.kind === 'none' || st.kind === 'start') return;
      const dx = slotW(s);
      const cursor = need(h.cursor, '쓰는 무게');

      if (st.kind === 'revert') {
        const span = st.from - st.to;
        const path = s.epochs.slice(st.to, st.from + 1).map((p) => [xOf(s, p.epoch), yOf(s, p.val)] as const);
        await tween(mine, MOVE_MS + 120 * span, (p) => {
          if (mine !== gen || destroyed) return;
          // from 에서 to 로 거꾸로 — path 는 to..from 이라 끝에서 앞으로
          const u = (1 - p) * span;
          const i = Math.min(span - 1, Math.floor(u));
          const f = u - i;
          const x = path[i][0] + (path[i + 1][0] - path[i][0]) * f;
          const y = path[i][1] + (path[i + 1][1] - path[i][1]) * f;
          placeCursor(cursor, x, y);
        });
        return;
      }

      const seg = need(h.segTip, '새 선분');
      const e = st.epoch;
      const [tx, ty] = [xOf(s, e), yOf(s, pointAt(s, e).val)];
      const [fx, fy] = seg.from;
      const col = need(h.weightCol, '새 무게 칸');
      const bestMove =
        st.kind === 'better'
          ? {
              g: need(h.best, '가장 좋던 표식').g,
              line: need(h.best, '가장 좋던 표식').line,
              cells: need(h.cells, '기다림 칸'),
              ox: xOf(s, st.from) - tx,
              oy: yOf(s, pointAt(s, st.from).val) - ty,
              cellShift: -(e - st.from) * dx,
              lineY: ty,
            }
          : null;
      const fill = st.kind === 'better' ? null : need(h.fill, '찰 기다림 칸');
      const stop = st.kind === 'stop' ? need(h.stop, '멈춘 자리') : null;

      await tween(mine, MOVE_MS, (p) => {
        if (mine !== gen || destroyed) return;
        const x = fx + (tx - fx) * p;
        const y = fy + (ty - fy) * p;
        seg.line.setAttribute('x2', String(r2(x)));
        seg.line.setAttribute('y2', String(r2(y)));
        seg.dot.setAttribute('cx', String(r2(x)));
        seg.dot.setAttribute('cy', String(r2(y)));
        seg.label.setAttribute('opacity', String(r2(p)));
        col.setAttribute('opacity', String(r2(p)));
        placeCursor(cursor, x, y);
        if (bestMove !== null) {
          const q = 1 - p;
          bestMove.g.setAttribute('transform', `translate(${r2(bestMove.ox * q)} ${r2(bestMove.oy * q)})`);
          const ly = r2(bestMove.lineY + bestMove.oy * q);
          bestMove.line.setAttribute('y1', String(ly));
          bestMove.line.setAttribute('y2', String(ly));
          bestMove.cells.setAttribute('transform', `translate(${r2(bestMove.cellShift * q)} 0)`);
        }
        if (fill !== null) {
          const hh = CELL_H * p;
          fill.rect.setAttribute('y', String(r2(CELL_TOP + CELL_H - hh)));
          fill.rect.setAttribute('height', String(r2(hh)));
          fill.num.setAttribute('opacity', String(r2(p)));
        }
        if (stop !== null) {
          const top = PLOT_TOP - 12;
          stop.line.setAttribute('y2', String(r2(top + (AXIS_Y - top) * p)));
          stop.label.setAttribute('opacity', String(r2(p)));
        }
      });
    }

    return {
      async render(next: StopBeforeTurnScene, _prev: StopBeforeTurnScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        await move(next, h, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    } as ViewInstance;
  },
};
