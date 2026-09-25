/**
 * loop-termination 의 무대.
 *
 * 동사 — 같은 답이 되풀이된다. 흐름이 조건 줄로 돌아올 때마다 조건이 읽는 변수의 값이
 * 그 칸에서 한 알 떨어져 나와 셈 칸으로 내려앉는다. 칸이 늘어도 내려앉는 값과 답은
 * 같고, 그 아래 몸이 쓰는 변수의 막대만 자란다. 루프 뒤의 줄은 끝내 밟히지 않는다.
 *
 * 왼쪽은 코드와 흐름 표지, 오른쪽 위는 변수 칸, 오른쪽 아래는 조건 셈의 줄이다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { LoopTerminationScene, LtValue } from './scene.js';

const H = 356;
const W = PIECE_CANVAS_W;
const NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 400;

/** 코드 쪽 */
const CODE_TOP = 70;
const CODE_BOTTOM = 222;
const LINE_H_MAX = 40;
const NUM_X = 46;
const CODE_X = 58;
const INDENT_W = 26;
const CHAR_W = 9;
const BAND_X = 8;
const BAND_R = 318;
const MARK_X = 22;

/** 오른쪽 */
const PANEL_L = 358;
const PANEL_R = W - 16;
const CELL_TOP = 44;
const CELL_H = 44;
const CELL_GAP = 12;
const CELL_W_MAX = 112;
const CHECK_HEAD_Y = 128;
const CHIP_TOP = 138;
const CHIP_H = 22;
const ANSWER_Y = 178;
const BAR_TOP = 194;
const BAR_BASE = 268;

/** 캡션 */
const CAP_Y = H - 44;
const CAP_LH = 17;
const CAP_LINES = 3;

type Attrs = Record<string, string | number>;

function rd(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
  body?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(rd(v)) : v);
  if (body !== undefined) node.textContent = body;
  parent.appendChild(node);
  return node;
}

function showValue(v: LtValue | null): string {
  if (v === null) return '';
  return typeof v === 'string' ? `"${v}"` : String(v);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자권 · 가나)는 1em, 나머지는 0.56em. */
function widthOf(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x1100 ? px : px * 0.56;
  return w;
}

/** 캡션을 폭에 맞춰 줄로 나눈다. 넘치면 그 줄의 마지막 빈칸에서, 빈칸이 없으면 그 글자에서 꺾는다. */
function wrap(s: string, px: number, max: number): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const ch of s) {
    cur.push(ch);
    if (widthOf(cur.join(''), px) <= max) continue;
    const sp = cur.lastIndexOf(' ');
    if (sp > 0) {
      out.push(cur.slice(0, sp).join(''));
      cur = cur.slice(sp + 1);
    } else {
      const last = cur.pop() ?? '';
      out.push(cur.join(''));
      cur = [last];
    }
  }
  const rest = cur.join('').trim();
  if (rest !== '') out.push(rest);
  return out;
}

type Geo = {
  lineY(k: number): number;
  lineEnd(k: number): number;
  cellX(k: number): number;
  cellW: number;
  colX(count: number): number;
  colW: number;
  unit: number;
};

function geometry(scene: LoopTerminationScene): Geo | null {
  const base = scene.base;
  if (!base) return null;
  const n = Math.max(1, base.lines.length);
  const lineH = Math.min(LINE_H_MAX, n > 1 ? (CODE_BOTTOM - CODE_TOP) / (n - 1) : LINE_H_MAX);
  const names = Math.max(1, base.names.length);
  const pw = PANEL_R - PANEL_L;
  const cellW = Math.min(CELL_W_MAX, (pw - (names - 1) * CELL_GAP) / names);
  const cols = Math.max(1, base.cap);
  const colW = pw / cols;
  // 막대 한 칸 — 상한과 지금까지 본 가장 큰 값 가운데 큰 쪽으로 나눈다
  const w0 = base.writes[0];
  let top = cols;
  for (const c of scene.checks) {
    const v = c.vars.find(([nm]) => nm === w0)?.[1];
    if (typeof v === 'number' && v + 1 > top) top = v + 1;
  }
  const unit = (BAR_BASE - BAR_TOP) / top;
  return {
    lineY: (k) => CODE_TOP + k * lineH,
    lineEnd: (k) => CODE_X + base.lines[k].indent * INDENT_W + base.lines[k].text.length * CHAR_W,
    cellX: (k) => PANEL_L + k * (cellW + CELL_GAP),
    cellW,
    colX: (count) => PANEL_L + (count - 0.5) * colW,
    colW,
    unit,
  };
}

/** 정적 그리기가 남기는 손잡이 — 운동이 "아직 못 온 만큼" 을 그리려고 쥔다. */
type Handles = {
  geo: Geo;
  marker: SVGGElement | null;
  cellValue: Map<string, SVGTextElement>;
  chip: Map<number, SVGGElement>;
  bar: Map<number, SVGRectElement>;
};

export const loopTerminationStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<LoopTerminationScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function varColors(scene: LoopTerminationScene): Map<string, string> {
      const names = scene.base?.names ?? [];
      const hues = categorical(Math.max(1, names.length));
      return new Map(names.map((n, i) => [n, hues[i % hues.length]]));
    }

    function caption(scene: LoopTerminationScene): string {
      const base = scene.base;
      const st = scene.step;
      if (!base || st.kind === 'start') return t('caption.start', 'Nothing has run yet.');
      if (st.kind === 'assign') {
        const v = scene.vars.find(([n]) => n === st.name)?.[1] ?? null;
        return t('caption.assign', 'Line {line}: {name} now holds {value}.', {
          line: st.line + 1,
          name: st.name,
          value: showValue(v),
        });
      }
      if (st.kind === 'show') return t('caption.show', 'Line {line} runs.', { line: st.line + 1 });
      const check = scene.checks.find((c) => c.count === st.count);
      const shown = check?.shown ?? '';
      if (scene.halted && check?.answer && base.overlap.length === 0) {
        return t(
          'caption.stuck',
          'Check {count}: {shown} is true again. The body writes {writes}, the condition reads {reads}, and they share nothing, so the answer cannot change. Playback stops here; the loop does not.',
          { count: st.count, shown, writes: base.writes.join(', '), reads: base.reads.join(', ') },
        );
      }
      if (scene.halted) return t('caption.capped', 'Check {count}: playback stops here.', { count: st.count });
      if (check?.answer) {
        return t('caption.condTrue', 'Check {count}: {shown} is true, so the flow enters the body.', {
          count: st.count,
          shown,
        });
      }
      return t('caption.condFalse', 'Check {count}: {shown} is false, so the flow leaves the loop.', {
        count: st.count,
        shown,
      });
    }

    function drawStatic(scene: LoopTerminationScene): Handles | null {
      svg.textContent = '';
      const base = scene.base;
      const geo = geometry(scene);
      if (!base || !geo) {
        drawCaption(scene);
        return null;
      }
      const vc = varColors(scene);
      const lineH = base.lines.length > 1 ? geo.lineY(1) - geo.lineY(0) : LINE_H_MAX;

      // 루프가 돌아가는 길 — 몸의 끝 줄에서 조건 줄로
      const loop = base.loop;
      let bodyEnd = loop;
      if (loop >= 0) {
        for (let j = loop + 1; j < base.lines.length && base.lines[j].indent > base.lines[loop].indent; j += 1) bodyEnd = j;
      }
      if (loop >= 0 && bodyEnd > loop) {
        const y0 = geo.lineY(bodyEnd);
        const y1 = geo.lineY(loop);
        el(svg, 'path', {
          d: `M ${MARK_X - 6} ${rd(y0)} C ${BAND_X - 4} ${rd(y0)}, ${BAND_X - 4} ${rd(y1)}, ${MARK_X - 6} ${rd(y1)}`,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 3',
        });
      }

      // 루프 뒤에 닿지 못하는 줄 — 재생이 멈췄고 구조가 답이 바뀔 길을 막았을 때만
      const unreachable = new Set<number>();
      const lastCheck = scene.checks[scene.checks.length - 1];
      if (scene.halted && loop >= 0 && base.overlap.length === 0 && lastCheck?.answer) {
        for (let j = bodyEnd + 1; j < base.lines.length; j += 1) unreachable.add(j);
      }

      // 코드
      base.lines.forEach((ln, k) => {
        const y = geo.lineY(k);
        if (scene.at === k) {
          el(svg, 'rect', {
            x: BAND_X + 14,
            y: y - lineH / 2 + 4,
            width: BAND_R - BAND_X - 14,
            height: lineH - 8,
            rx: 4,
            fill: colors.itemActive,
            'fill-opacity': 0.16,
          });
        }
        el(svg, 'text', {
          x: NUM_X,
          y,
          'text-anchor': 'end',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        }, String(k + 1));
        const seen = scene.visited.includes(k);
        el(svg, 'text', {
          x: CODE_X + ln.indent * INDENT_W,
          y,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: seen ? colors.text : colors.textMuted,
        }, ln.text);
        if (unreachable.has(k)) {
          const x0 = CODE_X + ln.indent * INDENT_W;
          const x1 = geo.lineEnd(k);
          el(svg, 'line', {
            x1: x0,
            y1: y + 11,
            x2: x1,
            y2: y + 11,
            stroke: colors.danger,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          });
          el(svg, 'text', {
            x: x1 + 12,
            y,
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: colors.danger,
          }, t('label.unreached', 'never reached'));
        }
      });

      // 흐름 표지
      let marker: SVGGElement | null = null;
      if (scene.at !== null) {
        marker = el(svg, 'g', { transform: `translate(${MARK_X} ${rd(geo.lineY(scene.at))})` });
        el(marker, 'path', { d: 'M -6 -6 L 5 0 L -6 6 Z', fill: colors.itemActive });
      }

      // 변수 칸
      const cellValue = new Map<string, SVGTextElement>();
      base.names.forEach((name, k) => {
        const x = geo.cellX(k);
        const c = vc.get(name) ?? colors.text;
        const v = scene.vars.find(([n]) => n === name)?.[1] ?? null;
        el(svg, 'text', {
          x,
          y: CELL_TOP - 8,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c,
        }, name);
        el(svg, 'rect', {
          x,
          y: CELL_TOP,
          width: geo.cellW,
          height: CELL_H,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: c,
          'stroke-width': 1.5,
        });
        cellValue.set(
          name,
          el(svg, 'text', {
            x: x + geo.cellW / 2,
            y: CELL_TOP + CELL_H / 2,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xl,
            fill: colors.text,
          }, showValue(v)),
        );
        const r = base.reads.includes(name);
        const w = base.writes.includes(name);
        const tag = r && w
          ? t('tag.both', 'read and written')
          : r
            ? t('tag.read', 'the condition reads')
            : w
              ? t('tag.write', 'the body writes')
              : '';
        if (tag !== '') {
          el(svg, 'text', {
            x,
            y: CELL_TOP + CELL_H + 16,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }, tag);
        }
      });

      // 조건 셈의 줄
      const r0 = base.reads[0];
      const w0 = base.writes[0];
      const chipColor = (r0 !== undefined && vc.get(r0)) || colors.border;
      const barColor = (w0 !== undefined && vc.get(w0)) || colors.textMuted;
      for (let count = 1; count <= base.cap; count += 1) {
        el(svg, 'text', {
          x: geo.colX(count),
          y: CHECK_HEAD_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, String(count));
      }
      el(svg, 'line', {
        x1: PANEL_L,
        y1: BAR_BASE,
        x2: PANEL_R,
        y2: BAR_BASE,
        stroke: colors.border,
        'stroke-width': 1,
      });
      if (w0 !== undefined) {
        el(svg, 'text', {
          x: PANEL_L - 6,
          y: BAR_BASE - 4,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: barColor,
        }, w0);
      }
      const chip = new Map<number, SVGGElement>();
      const bar = new Map<number, SVGRectElement>();
      for (const c of scene.checks) {
        const cx = geo.colX(c.count);
        const g = el(svg, 'g', {});
        el(g, 'rect', {
          x: cx - geo.colW / 2 + 3,
          y: CHIP_TOP,
          width: geo.colW - 6,
          height: CHIP_H,
          rx: 4,
          fill: colors.bg,
          stroke: chipColor,
          'stroke-width': 1.5,
        });
        el(g, 'text', {
          x: cx,
          y: CHIP_TOP + CHIP_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        }, c.shown);
        const answer = c.answer ? t('label.true', 'true') : t('label.false', 'false');
        // 칸보다 긴 답은 한 단계 작은 글자로, 그래도 넘치면 이웃 칸과 위아래로 엇갈려 둔다
        const fits = (px: number): boolean => widthOf(answer, px) <= geo.colW - 4;
        const answerSize = fits(12) ? fontSizes.sm : fontSizes.xs;
        const answerY = fits(11) || c.count % 2 === 1 ? ANSWER_Y : ANSWER_Y + 13;
        el(g, 'text', {
          x: cx,
          y: answerY,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': answerSize,
          'font-weight': 600,
          fill: colors.text,
        }, answer);
        chip.set(c.count, g);
        const wv = c.vars.find(([n]) => n === w0)?.[1];
        const h = typeof wv === 'number' && wv > 0 ? wv * geo.unit : 0;
        const bw = Math.min(22, geo.colW * 0.5);
        bar.set(
          c.count,
          el(svg, 'rect', { x: cx - bw / 2, y: BAR_BASE - h, width: bw, height: h, fill: barColor }),
        );
        el(svg, 'text', {
          x: cx,
          y: BAR_BASE + 14,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, showValue(wv ?? null));
      }

      drawCaption(scene);
      return { geo, marker, cellValue, chip, bar };
    }

    function drawCaption(scene: LoopTerminationScene): void {
      // 세 줄에 담기지 않으면 한 단계 작은 글자로
      const text = caption(scene);
      let px = 14;
      let rows = wrap(text, px, W - 32);
      if (rows.length > CAP_LINES) {
        px = 12;
        rows = wrap(text, px, W - 32);
      }
      rows = rows.slice(0, CAP_LINES);
      rows.forEach((row, i) => {
        el(svg, 'text', {
          x: W / 2,
          y: CAP_Y + i * CAP_LH,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': px === 14 ? fontSizes.md : fontSizes.sm,
          fill: colors.text,
        }, row);
      });
    }

    /** 한 시계 — p 를 0 에서 1 로 흘린다. 세대가 바뀌거나 거두면 곧바로 푼다. */
    function tween(mine: number, ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          draw(ease(p));
          if (p >= 1) {
            finish();
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

    return {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        const hd = drawStatic(next);
        if (!opts.animate || destroyed || !hd || !next.base) return;
        const st = next.step;
        if (st.kind === 'start') return;
        const base = next.base;
        const geo = hd.geo;
        const vc = varColors(next);

        // 흐름 표지 — 떠난 줄에서 이 줄로. 위로 되돌아가면 왼쪽으로 휘어 돈다
        const yTo = geo.lineY(st.line);
        const yFrom = st.from === null ? yTo : geo.lineY(st.from);
        const back = st.from !== null && st.from > st.line;
        const moveMarker = (p: number): void => {
          if (!hd.marker) return;
          const y = yFrom + (yTo - yFrom) * p;
          const x = back ? MARK_X - 12 * Math.sin(Math.PI * p) : MARK_X;
          hd.marker.setAttribute('transform', `translate(${rd(x)} ${rd(y)})`);
        };

        if (st.kind === 'show') {
          moveMarker(0);
          await tween(mine, MOVE_MS, moveMarker);
        } else if (st.kind === 'assign') {
          // 값이 줄 끝에서 떨어져 나와 변수 칸으로 들어간다
          const k = base.names.indexOf(st.name);
          const target = hd.cellValue.get(st.name);
          const v = next.vars.find(([n]) => n === st.name)?.[1] ?? null;
          const x0 = geo.lineEnd(st.line) + 8;
          const y0 = geo.lineY(st.line);
          const x1 = k >= 0 ? geo.cellX(k) + geo.cellW / 2 : x0;
          const y1 = CELL_TOP + CELL_H / 2;
          target?.setAttribute('opacity', '0');
          const tok = el(svg, 'text', {
            x: x0,
            y: y0,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xl,
            fill: vc.get(st.name) ?? colors.text,
          }, showValue(v));
          const draw = (p: number): void => {
            moveMarker(p);
            tok.setAttribute('x', String(rd(x0 + (x1 - x0) * p)));
            tok.setAttribute('y', String(rd(y0 + (y1 - y0) * p - 30 * Math.sin(Math.PI * p))));
          };
          draw(0);
          await tween(mine, MOVE_MS, draw);
        } else {
          // 조건이 읽는 값이 칸에서 한 알 떨어져 셈 칸으로 내려앉고, 몸이 쓰는 값의 막대가 선다
          const check = next.checks.find((c) => c.count === st.count);
          const r0 = base.reads[0];
          const k = r0 === undefined ? -1 : base.names.indexOf(r0);
          const chip = hd.chip.get(st.count);
          const bar = hd.bar.get(st.count);
          const rv = check?.vars.find(([n]) => n === r0)?.[1] ?? null;
          const x0 = k >= 0 ? geo.cellX(k) + geo.cellW / 2 : geo.colX(st.count);
          const y0 = CELL_TOP + CELL_H / 2;
          const x1 = geo.colX(st.count);
          const y1 = CHIP_TOP + CHIP_H / 2;
          const barH = bar ? Number(bar.getAttribute('height')) : 0;
          chip?.setAttribute('opacity', '0');
          bar?.setAttribute('height', '0');
          bar?.setAttribute('y', String(BAR_BASE));
          const tok = k >= 0
            ? el(svg, 'text', {
                x: x0,
                y: y0,
                'text-anchor': 'middle',
                'dominant-baseline': 'central',
                'font-family': fonts.mono,
                'font-size': fontSizes.xl,
                fill: vc.get(r0 ?? '') ?? colors.text,
              }, showValue(rv))
            : null;
          const draw = (p: number): void => {
            moveMarker(p);
            const q = Math.min(1, p / 0.7);
            if (tok) {
              tok.setAttribute('x', String(rd(x0 + (x1 - x0) * q)));
              tok.setAttribute('y', String(rd(y0 + (y1 - y0) * q)));
            }
            const b = Math.max(0, (p - 0.35) / 0.65);
            if (bar) {
              const h = rd(barH * b);
              bar.setAttribute('height', String(h));
              bar.setAttribute('y', String(rd(BAR_BASE - h)));
            }
          };
          draw(0);
          await tween(mine, MOVE_MS, draw);
        }
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
