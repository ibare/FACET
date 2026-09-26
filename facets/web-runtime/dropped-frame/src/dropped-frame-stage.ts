/**
 * dropped-frame 의 무대.
 *
 * 동사는 "지나간다" — 박자 바늘이 박자마다 어김없이 오른쪽으로 한 칸 간다.
 * 장의 일이 끝나면 그 그림(점)이 다음 박자의 화면 칸으로 실려 가고, 새 장이 없는
 * 박자에는 앞 칸의 그림이 옆 칸으로 한 번 더 옮겨 찍힌다 (되풀이). 아래 자리 줄에서
 * 움직이는 상자는 새 장이 올 때만 뛰어 옮기고, 건너뛴 자리는 끝내 비어 남는다.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { DroppedFrameScene, FrameWork, ScreenCell } from './scene.js';

const H = 356;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 한 걸음의 운동 길이 (ms) */
const MOTION_MS = 400;

const LEFT = 56;
const RIGHT = 30;

// 세로 자리
const CAP1_Y = 22;
const CAP2_Y = 42;
const BEATS_TITLE_Y = 64;
const BEAT_NO_Y = 80;
const BEAT_MS_Y = 94;
const GUIDE_TOP = 100;
const GUIDE_BOTTOM = 232;
const WORK_TITLE_Y = 114;
const BAR_Y = 122;
const BAR_H = 18;
const FRAME_LABEL_Y = 156;
const SCREEN_TITLE_Y = 174;
const CELL_Y = 182;
const CELL_H = 40;
const CELL_MAX_W = 60;
const CELL_PAD = 6;
const CELL_LABEL_Y = 196;
const CELL_TRACK_Y = 210;
const CELL_PX_Y = 238;
const CELL_REPEAT_Y = 252;
const POS_TITLE_Y = 270;
const BOX = 18;
const TRACK_Y = 306;
const TICK_R = 5;
const TICK_LABEL_Y = 326;
const NEVER_Y = 344;

const HOP_MAX = 30;

function r2(n: number): string {
  const v = Math.round(n * 100) / 100;
  return String(Object.is(v, -0) ? 0 : v);
}

/** 표시용 — 소수 첫째 자리 */
function ms1(n: number): string {
  const s = (Math.round(n * 10) / 10).toFixed(1);
  return s === '-0.0' ? '0.0' : s;
}

function pxText(n: number): string {
  return Number.isInteger(n) ? String(n) : ms1(n);
}

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** 전체 운동 시계 u 에서 [a, b] 구간의 진행 */
function span(u: number, a: number, b: number): number {
  if (u <= a) return 0;
  if (u >= b) return 1;
  return ease((u - a) / (b - a));
}

type Handles = {
  playhead: SVGGElement | null;
  bars: Map<number, SVGRectElement>;
  links: Map<number, SVGLineElement>;
  cells: Map<number, SVGGElement>;
  never: Map<number, SVGGElement>;
  box: SVGRectElement | null;
  overlay: SVGGElement;
};

export const droppedFrameStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      parent: Element,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, v] of Object.entries(attrs)) {
        node.setAttribute(key, typeof v === 'number' ? r2(v) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      str: string,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end' = 'middle',
      weight = '400',
    ): SVGTextElement {
      const node = el('text', parent, {
        x,
        y,
        'text-anchor': anchor,
        'font-family': fonts.body,
        'font-size': size,
        'font-weight': weight,
        fill,
      });
      node.textContent = str;
      return node;
    }

    // ---------------------------------------------------------------- 자리 셈
    const innerW = W - LEFT - RIGHT;

    function lastBeat(s: DroppedFrameScene): number {
      const last = s.beats[s.beats.length - 1];
      if (!last) throw new Error('dropped-frame 무대: 박자 줄이 비었다');
      return last.k;
    }

    function beatX(s: DroppedFrameScene, k: number): number {
      return LEFT + (k / lastBeat(s)) * innerW;
    }

    function timeX(s: DroppedFrameScene, ms: number): number {
      const last = s.beats[s.beats.length - 1];
      if (!last) throw new Error('dropped-frame 무대: 박자 줄이 비었다');
      return LEFT + (ms / last.ms) * innerW;
    }

    function maxPos(s: DroppedFrameScene): number {
      const m = Math.max(...s.intended, ...s.drawn);
      if (!(m > 0)) throw new Error('dropped-frame 무대: 자리 줄의 끝을 정할 수 없다');
      return m;
    }

    function posX(s: DroppedFrameScene, p: number): number {
      return LEFT + (p / maxPos(s)) * innerW;
    }

    function cellW(s: DroppedFrameScene): number {
      return Math.min(CELL_MAX_W, innerW / lastBeat(s) - 8);
    }

    /** 칸 안의 작은 자리 줄 위의 점 */
    function cellDotX(s: DroppedFrameScene, k: number, p: number): number {
      const w = cellW(s) - CELL_PAD * 2;
      return beatX(s, k) - w / 2 + (p / maxPos(s)) * w;
    }

    /** 되풀이 칸이 보이는 그림은 앞 칸의 장이다 — 되짚어 올라가 찾는다 */
    function frameOnScreen(s: DroppedFrameScene, cell: ScreenCell): number | null {
      for (let i = s.cells.indexOf(cell); i >= 0; i -= 1) {
        const c = s.cells[i];
        if (c && c.frame !== null) return c.frame;
      }
      return null;
    }

    // ---------------------------------------------------------------- 문안
    function captions(s: DroppedFrameScene): [string, string] {
      const step = s.step;
      if (step.kind === 'none') return ['', ''];
      if (step.kind === 'init') {
        return [
          t('caption.start', 'Beat 0 (0.0 ms) — the screen is still empty'),
          t('caption.started', 'Starts work now: frame {n}', { n: step.started }),
        ];
      }
      const first =
        step.frame !== null
          ? t('caption.new', 'Beat {k} ({ms} ms) — new frame on screen: {n} · position: {pos} px', {
              k: step.k,
              ms: ms1(step.ms),
              n: step.frame,
              pos: pxText(step.pos),
            })
          : t('caption.repeat', 'Beat {k} ({ms} ms) — no new frame · shown again: {pos} px', {
              k: step.k,
              ms: ms1(step.ms),
              pos: pxText(step.pos),
            });
      let second = '';
      if (step.summary) {
        const sm = step.summary;
        second =
          sm.never.length > 0
            ? t('caption.summary', 'Beats: {b} · new frames: {f} · repeats: {r} · never drawn: {p} px', {
                b: sm.beats,
                f: sm.newFrames,
                r: sm.repeats,
                p: sm.never.map(pxText).join(', '),
              })
            : t('caption.summaryAll', 'Beats: {b} · new frames: {f} · repeats: {r}', {
                b: sm.beats,
                f: sm.newFrames,
                r: sm.repeats,
              });
      } else if (step.skipped.length > 0 && step.jump !== null) {
        second = t('caption.jump', 'Jump: {d} px · never drawn: {p} px', {
          d: pxText(step.jump),
          p: step.skipped.map(pxText).join(', '),
        });
      } else if (step.working !== null) {
        second = t('caption.working', 'Still working: frame {n}', { n: step.working });
      } else if (step.started !== null) {
        second = t('caption.started', 'Starts work now: frame {n}', { n: step.started });
      }
      return [first, second];
    }

    // ---------------------------------------------------------------- 정적 그리기 (정본)
    function drawStatic(s: DroppedFrameScene): Handles {
      svg.textContent = '';
      const root = el('g', svg, {});
      const handles: Handles = {
        playhead: null,
        bars: new Map(),
        links: new Map(),
        cells: new Map(),
        never: new Map(),
        box: null,
        overlay: root,
      };
      if (s.beats.length === 0) return handles;

      const [cap1, cap2] = captions(s);
      write(root, W / 2, CAP1_Y, cap1, fontSizes.md, colors.text, 'middle', '600');
      if (cap2) {
        const warn = s.step.kind === 'beat' && (s.step.working !== null || s.step.skipped.length > 0);
        write(root, W / 2, CAP2_Y, cap2, fontSizes.sm, warn ? colors.danger : colors.textMuted);
      }

      // 줄 이름
      write(root, 8, BEATS_TITLE_Y, t('label.beats', 'Beat (ms)'), fontSizes.xs, colors.textMuted, 'start', '600');
      write(root, 8, WORK_TITLE_Y, t('label.work', 'Frame work'), fontSizes.xs, colors.textMuted, 'start', '600');
      write(root, 8, SCREEN_TITLE_Y, t('label.screen', 'On screen at each beat'), fontSizes.xs, colors.textMuted, 'start', '600');
      write(root, 8, POS_TITLE_Y, t('label.position', 'Position (px)'), fontSizes.xs, colors.textMuted, 'start', '600');

      // 박자 줄 — 지나간 박자는 짙게, 올 박자는 옅게
      for (const b of s.beats) {
        const x = beatX(s, b.k);
        const passed = b.k <= s.k;
        el('line', root, {
          x1: x,
          y1: GUIDE_TOP,
          x2: x,
          y2: GUIDE_BOTTOM,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': passed ? 'none' : '3 3',
        });
        write(root, x, BEAT_NO_Y, String(b.k), fontSizes.sm, passed ? colors.text : colors.textMuted, 'middle', '600');
        write(root, x, BEAT_MS_Y, ms1(b.ms), fontSizes.xs, colors.textMuted);
      }

      // 장의 일
      for (const w of s.works) drawWork(s, root, w, handles);

      // 박자마다 화면 칸
      for (const c of s.cells) drawCell(s, root, c, handles);

      // 자리 줄
      const endX = posX(s, maxPos(s));
      el('line', root, {
        x1: posX(s, 0),
        y1: TRACK_Y,
        x2: endX,
        y2: TRACK_Y,
        stroke: colors.border,
        'stroke-width': 2,
      });
      for (const p of s.intended) {
        const x = posX(s, p);
        const drawn = s.drawn.includes(p);
        const skipped = s.skipped.includes(p);
        const g = el('g', root, {});
        el('circle', g, {
          cx: x,
          cy: TRACK_Y,
          r: TICK_R,
          fill: drawn ? colors.primary : colors.bg,
          stroke: skipped ? colors.danger : drawn ? colors.primary : colors.border,
          'stroke-width': skipped ? 2 : 1.5,
        });
        write(g, x, TICK_LABEL_Y, pxText(p), fontSizes.xs, skipped ? colors.danger : colors.textMuted);
        if (skipped) {
          const ng = el('g', g, {});
          write(ng, x, NEVER_Y, t('label.never', 'never drawn'), fontSizes.xs, colors.danger, 'middle', '600');
          handles.never.set(p, ng);
        }
      }
      if (s.pos !== null) {
        handles.box = el('rect', root, {
          x: posX(s, s.pos) - BOX / 2,
          y: TRACK_Y - TICK_R - 3 - BOX,
          width: BOX,
          height: BOX,
          rx: 3,
          fill: colors.primary,
        });
      }

      // 박자 바늘
      const ph = el('g', root, { transform: `translate(${r2(beatX(s, s.k))} 0)` });
      el('line', ph, {
        x1: 0,
        y1: GUIDE_TOP,
        x2: 0,
        y2: GUIDE_BOTTOM,
        stroke: colors.accent,
        'stroke-width': 3,
      });
      el('path', ph, {
        d: `M -6 ${GUIDE_TOP - 6} L 6 ${GUIDE_TOP - 6} L 0 ${GUIDE_TOP + 2} Z`,
        fill: colors.accent,
      });
      handles.playhead = ph;

      handles.overlay = el('g', root, {});
      return handles;
    }

    function drawWork(s: DroppedFrameScene, root: Element, w: FrameWork, handles: Handles): void {
      const x0 = timeX(s, w.startMs);
      const x1 = timeX(s, w.endMs);
      const bar = el('rect', root, {
        x: x0,
        y: BAR_Y,
        width: x1 - x0,
        height: BAR_H,
        rx: 3,
        fill: w.shownK === null ? colors.itemComparing : colors.primary,
        stroke: w.late ? colors.danger : 'none',
        'stroke-width': w.late ? 2 : 0,
      });
      handles.bars.set(w.frame, bar);
      write(
        root,
        (x0 + x1) / 2,
        FRAME_LABEL_Y,
        t('label.frame', 'Frame {n}', { n: w.frame }),
        fontSizes.xs,
        w.late ? colors.danger : colors.textMuted,
        'middle',
        w.late ? '600' : '400',
      );
      if (w.shownK !== null) {
        const link = el('line', root, {
          x1: x1,
          y1: BAR_Y + BAR_H,
          x2: beatX(s, w.shownK),
          y2: CELL_Y,
          stroke: w.late ? colors.danger : colors.textMuted,
          'stroke-width': 1.2,
          'stroke-dasharray': '2 3',
        });
        handles.links.set(w.frame, link);
      }
    }

    function drawCell(s: DroppedFrameScene, root: Element, c: ScreenCell, handles: Handles): void {
      const x = beatX(s, c.k);
      const cw = cellW(s);
      const repeat = c.frame === null;
      const g = el('g', root, {});
      el('rect', g, {
        x: x - cw / 2,
        y: CELL_Y,
        width: cw,
        height: CELL_H,
        rx: 4,
        fill: colors.bgSubtle,
        stroke: repeat ? colors.danger : colors.border,
        'stroke-width': repeat ? 1.8 : 1,
        'stroke-dasharray': repeat ? '4 3' : 'none',
      });
      const shownFrame = frameOnScreen(s, c);
      if (shownFrame !== null) {
        write(g, x, CELL_LABEL_Y, t('label.frame', 'Frame {n}', { n: shownFrame }), fontSizes.xs, colors.textMuted);
      }
      el('line', g, {
        x1: x - cw / 2 + CELL_PAD,
        y1: CELL_TRACK_Y,
        x2: x + cw / 2 - CELL_PAD,
        y2: CELL_TRACK_Y,
        stroke: colors.border,
        'stroke-width': 1,
      });
      el('circle', g, { cx: cellDotX(s, c.k, c.pos), cy: CELL_TRACK_Y, r: 4, fill: colors.primary });
      write(g, x, CELL_PX_Y, t('label.px', '{v} px', { v: pxText(c.pos) }), fontSizes.xs, colors.text);
      if (repeat) {
        write(g, x, CELL_REPEAT_Y, t('label.repeat', 'repeat'), fontSizes.xs, colors.danger, 'middle', '600');
      }
      handles.cells.set(c.k, g);
    }

    // ---------------------------------------------------------------- 운동
    function tween(mine: number, frame: (u: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const t0 = performance.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const u = Math.min(1, (performance.now() - t0) / MOTION_MS);
          frame(u);
          if (u >= 1) {
            finish(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function play(next: DroppedFrameScene, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'beat') return;
      const h = drawStatic(next);
      const k = step.k;

      // 바늘: 앞 박자에서 이번 박자로 — 이것이 "지나간다"
      const phFrom = beatX(next, k - 1);
      const phTo = beatX(next, k);

      // 이번 칸으로 실려 가는 그림
      const cell = h.cells.get(k);
      const cellPrev = step.frame === null ? h.cells.get(k - 1) : undefined;
      const toX = cellDotX(next, k, step.pos);
      let fromX: number;
      let fromY: number;
      let link: SVGLineElement | undefined;
      if (step.frame !== null) {
        const w = next.works.find((x) => x.frame === step.frame);
        if (!w) throw new Error(`dropped-frame 무대: 장 ${step.frame} 의 일이 장면에 없다`);
        fromX = timeX(next, w.endMs);
        fromY = BAR_Y + BAR_H;
        link = h.links.get(w.frame);
      } else {
        if (!cellPrev) throw new Error(`dropped-frame 무대: 박자 ${k - 1} 의 칸이 없어 되풀이할 그림이 없다`);
        fromX = cellDotX(next, k - 1, step.pos);
        fromY = CELL_TRACK_Y;
      }
      const token = el('circle', h.overlay, { cx: fromX, cy: fromY, r: 5, fill: colors.primary });

      // 이번 박자에 시작한 장의 일 막대는 바늘이 닿은 뒤 자란다
      const grow = step.started !== null ? h.bars.get(step.started) : undefined;
      const growW = grow ? Number(grow.getAttribute('width')) : 0;

      // 상자: 새 장이 올 때만 옮긴다. 옮긴 거리만큼 높이 뛴다
      const box = h.box;
      const boxTo = posX(next, step.pos);
      const boxFrom = step.from !== null ? posX(next, step.from) : boxTo;
      const boxY = TRACK_Y - TICK_R - 3 - BOX;
      const hop = step.from === null ? HOP_MAX : Math.min(HOP_MAX, Math.abs(boxTo - boxFrom) * 0.35);
      const moves = step.frame !== null;

      const frame = (u: number): void => {
        const a = span(u, 0, 0.4);
        h.playhead?.setAttribute('transform', `translate(${r2(phFrom + (phTo - phFrom) * a)} 0)`);

        const b = span(u, 0.35, 0.85);
        const tx = fromX + (toX - fromX) * b;
        const ty = fromY + (CELL_TRACK_Y - fromY) * b;
        token.setAttribute('cx', r2(tx));
        token.setAttribute('cy', r2(ty - (step.frame === null ? Math.sin(Math.PI * b) * 16 : 0)));
        if (link) {
          link.setAttribute('x2', r2(tx));
          link.setAttribute('y2', r2(ty));
        }
        if (cell) cell.setAttribute('visibility', b < 1 ? 'hidden' : 'visible');

        if (grow) grow.setAttribute('width', r2(growW * span(u, 0.4, 0.95)));

        if (box && moves) {
          const c = span(u, 0.45, 1);
          const bx = boxFrom + (boxTo - boxFrom) * c;
          const lift = step.from === null ? (1 - c) * hop : Math.sin(Math.PI * c) * hop;
          box.setAttribute('x', r2(bx - BOX / 2));
          box.setAttribute('y', r2(boxY - lift));
          box.setAttribute('visibility', step.from === null && c === 0 ? 'hidden' : 'visible');
          for (const [p, g] of h.never) {
            if (!step.skipped.includes(p)) continue;
            g.setAttribute('visibility', bx > posX(next, p) ? 'visible' : 'hidden');
          }
        }
      };
      frame(0);
      const ok = await tween(mine, frame);
      if (!ok || destroyed || mine !== gen) return;
      drawStatic(next);
    }

    function render(
      next: DroppedFrameScene,
      _prev: DroppedFrameScene | null,
      opts: { animate: boolean },
    ): void | Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      if (!opts.animate || next.step.kind !== 'beat') {
        drawStatic(next);
        return;
      }
      return play(next, mine);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
