/**
 * call-stack-unwind 의 무대.
 *
 * 동사: 얹혔다가 거꾸로 걷힌다. 부를 때마다 새 틀이 위에서 내려와 앞 틀 위에 얹히고,
 * 틀이 걷힐 때는 그 틀이 돌려준 값이 한 층 아래 틀의 빈자리로 **떨어져 내려가** 그 틀의
 * 곱셈을 채운다. 걷힌 틀은 점선 자국으로 제자리에 남아, 완주 화면에서 값이 위에서
 * 아래로 이어진 사슬(1 → 2 * 1 → 3 * 2 → 4 * 6 → x = 24)과 쌓인 차례 · 걷힌 차례를
 * 함께 보인다.
 *
 * 왼쪽 코드 목록은 이번 걸음이 일어난 줄(부른 줄 · 돌려준 줄)만 짚는다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, SceneRenderer, Translate, ViewInstance } from '@ffacet/core/runtime';
import type {
  CallStackUnwindScene,
  CodeLine,
  Expr,
  FrameScene,
  Slot,
  Value,
} from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const PAD = 16;
/** 고정폭 글꼴의 글자 폭 비 — 글자를 재지 않고 자리를 셈한다 */
const MONO_RATIO = 0.6;
const CODE_FS = parseFloat(fontSizes.sm);
const FRAME_FS_MAX = parseFloat(fontSizes.md);
const FRAME_FS_MIN = parseFloat(fontSizes.xs);
const CODE_LH = 20;
/**
 * 행 높이의 상한. 시작 장면은 행 수(가장 깊은 깊이)를 모르고 바깥 한 줄만 있다 —
 * 첫 push 가 maxDepth 를 싣고 온다. 상한이 담을 수 있는 한 행 높이가 행 수와 무관해
 * 바깥 줄이 걸음 0 → 1 에서 움직이지 않는다 (깊이 4 까지. 그보다 깊으면 첫 push 에서 줄어든다).
 */
const ROW_H_MAX = 44;
const ROW_GAP = 6;
const BADGE_R = 9;
const MOVE_MS = 400;

const NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

/** 파이썬이 찍는 모양으로 값을 글자로 */
function showValue(v: Value): string {
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'string') return '"' + v + '"';
  return String(v);
}

function showCall(fn: string, args: readonly Value[]): string {
  return fn + '(' + args.map(showValue).join(', ') + ')';
}

/** 줄 한 개를 글자 조각과 빈자리로 — 틀의 변수는 값으로 바꿔 넣는다 */
type Seg = { kind: 'text'; s: string } | { kind: 'slot' };

function exprSegs(e: Expr, vars: ReadonlyMap<string, Value>, out: Seg[]): void {
  if ('num' in e) out.push({ kind: 'text', s: String(e.num) });
  else if ('str' in e) out.push({ kind: 'text', s: '"' + e.str + '"' });
  else if ('var' in e) {
    const v = vars.get(e.var);
    out.push({ kind: 'text', s: v === undefined ? e.var : showValue(v) });
  } else if ('op' in e) {
    exprSegs(e.l, vars, out);
    out.push({ kind: 'text', s: ' ' + e.op + ' ' });
    exprSegs(e.r, vars, out);
  } else out.push({ kind: 'slot' });
}

function lineSegs(line: CodeLine, vars: ReadonlyMap<string, Value>): Seg[] {
  const out: Seg[] = [];
  const st = line.stmt;
  if (st.k === 'return') {
    out.push({ kind: 'text', s: st.value === undefined ? 'return' : 'return ' });
    if (st.value !== undefined) exprSegs(st.value, vars, out);
  } else if (st.k === 'assign') {
    out.push({ kind: 'text', s: st.to + ' = ' });
    exprSegs(st.value, vars, out);
  } else if (st.k === 'expr') {
    exprSegs(st.value, vars, out);
  } else {
    out.push({ kind: 'text', s: line.text });
  }
  // 이웃한 글자 조각을 합친다
  const merged: Seg[] = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (s.kind === 'text' && last !== undefined && last.kind === 'text') {
      merged[merged.length - 1] = { kind: 'text', s: last.s + s.s };
    } else merged.push(s);
  }
  return merged;
}

/** 글자를 재지 않고 폭을 어림한다 — 넓은 글자(한글 · 한자 · 가나)는 한 칸, 나머지는 반 칸 남짓 */
function estimateWidth(s: string, fs: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? fs : fs * 0.55;
  return w;
}

function splitCaption(s: string): string[] {
  const at = s.indexOf(' — ');
  if (at < 0) return [s];
  return [s.slice(0, at + 2), s.slice(at + 3)];
}

type Geo = {
  codeTextX: number;
  codeTop: number;
  stackX: number;
  boxX: number;
  boxW: number;
  baseY: number;
  rowH: number;
  fs: number;
  cw: number;
};

function geometry(scene: CallStackUnwindScene): Geo {
  const codeCw = CODE_FS * MONO_RATIO;
  const codeChars = scene.lines.reduce((m, l) => Math.max(m, l.indent * 4 + l.text.length), 0);
  const codeTextX = PAD + 28;
  // 스택이 적어도 캔버스의 절반을 갖는다
  const stackX = Math.min(codeTextX + codeChars * codeCw + 28, W / 2);
  const boxX = stackX + BADGE_R * 2 + 8;
  const boxW = W - PAD - BADGE_R * 2 - 8 - boxX;
  const rows = Math.max(1, scene.maxDepth + 1);
  const top = 36;
  const baseY = H - 54;
  const rowH = Math.min(ROW_H_MAX, (baseY - top - (rows - 1) * ROW_GAP) / rows);
  const fs = Math.min(FRAME_FS_MAX, Math.max(FRAME_FS_MIN, rowH * 0.32));
  return {
    codeTextX,
    codeTop: top + 6,
    stackX,
    boxX,
    boxW,
    baseY,
    rowH,
    fs,
    cw: fs * MONO_RATIO,
  };
}

function rowTop(g: Geo, depth: number): number {
  return g.baseY - (depth + 1) * g.rowH - depth * ROW_GAP;
}

/** 무대에 선 것 가운데 운동이 붙잡을 손잡이 */
type Handles = {
  /** 깊이별 줄 묶음 */
  rows: Map<number, SVGGElement>;
  /** 깊이별 채워진 빈자리 묶음과 그 왼쪽 위 */
  slots: Map<number, { g: SVGGElement; x: number; y: number }>;
  /** 깊이별 줄 글자 끝 x */
  lineEnd: Map<number, number>;
};

function narrowSceneReady(scene: CallStackUnwindScene): boolean {
  return scene.lines.length > 0;
}

export const callStackUnwindStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<CallStackUnwindScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawSlot(
      parent: Element,
      x: number,
      cy: number,
      slot: Slot,
      g: Geo,
      muted: boolean,
      fresh: boolean,
    ): { width: number; group: SVGGElement | null } {
      const ink = muted ? c.textMuted : fresh ? c.itemActive : c.primary;
      const h = Math.min(22, g.rowH * 0.5);
      if (slot === null) {
        const w = g.cw * 3;
        el(
          'rect',
          {
            x: r1(x),
            y: r1(cy - h / 2),
            width: r1(w),
            height: r1(h),
            rx: 3,
            fill: 'none',
            stroke: c.textMuted,
            'stroke-dasharray': '3 3',
          },
          parent,
        );
        return { width: w, group: null };
      }
      const label = showValue(slot.value);
      const w = Math.max(2, label.length) * g.cw + 10;
      const grp = el('g', {}, parent);
      el(
        'rect',
        {
          x: r1(x),
          y: r1(cy - h / 2),
          width: r1(w),
          height: r1(h),
          rx: 3,
          fill: muted ? 'none' : c.bg,
          stroke: ink,
          'stroke-width': muted ? 1 : 1.5,
        },
        grp,
      );
      const tx = el(
        'text',
        {
          x: r1(x + w / 2),
          y: r1(cy),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': r1(g.fs),
          'font-weight': 700,
          fill: ink,
        },
        grp,
      );
      tx.textContent = label;
      return { width: w, group: grp };
    }

    /** 줄 하나를 x 부터 그리고 끝 x 와 채워진 빈자리를 돌려준다 */
    function drawLine(
      parent: Element,
      x0: number,
      cy: number,
      segs: readonly Seg[],
      slot: Slot,
      g: Geo,
      muted: boolean,
      fresh: boolean,
    ): { end: number; slot: { g: SVGGElement; x: number; y: number } | null } {
      let x = x0;
      let found: { g: SVGGElement; x: number; y: number } | null = null;
      for (const s of segs) {
        if (s.kind === 'text') {
          const tx = el(
            'text',
            {
              x: r1(x),
              y: r1(cy),
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': r1(g.fs),
              fill: muted ? c.textMuted : c.text,
              'xml:space': 'preserve',
            },
            parent,
          );
          tx.textContent = s.s;
          x += s.s.length * g.cw;
        } else {
          const d = drawSlot(parent, x + 1, cy, slot, g, muted, fresh);
          if (d.group !== null) found = { g: d.group, x: x + 1, y: cy };
          x += d.width + 2;
        }
      }
      return { end: x, slot: found };
    }

    function drawBadge(cx: number, cy: number, n: number, filled: boolean): void {
      el(
        'circle',
        {
          cx: r1(cx),
          cy: r1(cy),
          r: BADGE_R,
          fill: filled ? c.textMuted : c.bg,
          stroke: filled ? c.textMuted : c.primary,
          'stroke-width': 1.5,
        },
        svg,
      );
      const tx = el(
        'text',
        {
          x: r1(cx),
          y: r1(cy),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: filled ? c.textInverse : c.primary,
        },
        svg,
      );
      tx.textContent = String(n);
    }

    function drawCode(scene: CallStackUnwindScene, g: Geo): void {
      const step = scene.step;
      let mark: number | null = null;
      if (step.kind === 'push') mark = scene.frames[step.frame]?.callLine ?? null;
      if (step.kind === 'pop') mark = scene.frames[step.frame]?.retLine ?? null;
      const codeCw = CODE_FS * MONO_RATIO;
      scene.lines.forEach((line, i) => {
        const y = g.codeTop + i * CODE_LH;
        if (i === mark) {
          el(
            'rect',
            {
              x: PAD - 4,
              y: r1(y),
              width: r1(g.stackX - PAD - 12),
              height: CODE_LH,
              rx: 3,
              fill: c.bgSubtle,
            },
            svg,
          );
          el('rect', { x: PAD - 4, y: r1(y), width: 3, height: CODE_LH, fill: c.primary }, svg);
        }
        const num = el(
          'text',
          {
            x: PAD + 2,
            y: r1(y + CODE_LH / 2),
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          svg,
        );
        num.textContent = 'L' + String(i + 1);
        const tx = el(
          'text',
          {
            x: r1(g.codeTextX + line.indent * 4 * codeCw),
            y: r1(y + CODE_LH / 2),
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': CODE_FS,
            'font-weight': i === mark ? 700 : 400,
            fill: c.text,
          },
          svg,
        );
        tx.textContent = line.text;
      });
    }

    /** 깊이마다 보일 틀 — 서 있는 것, 없으면 가장 나중에 걷힌 것 */
    function frameAt(scene: CallStackUnwindScene, depth: number): number {
      let found = -1;
      scene.frames.forEach((f, i) => {
        if (f.depth !== depth) return;
        if (found < 0 || f.popOrd === null || scene.frames[found]!.popOrd !== null) found = i;
      });
      return found;
    }

    function drawStatic(scene: CallStackUnwindScene): Handles {
      svg.textContent = '';
      const handles: Handles = { rows: new Map(), slots: new Map(), lineEnd: new Map() };
      if (!narrowSceneReady(scene)) return handles;
      const g = geometry(scene);
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);

      drawCode(scene, g);

      // 두 차례 칸의 머리
      const head = (x: number, anchor: string, label: string): void => {
        const tx = el(
          'text',
          {
            x: r1(x),
            y: 20,
            'text-anchor': anchor,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          svg,
        );
        tx.textContent = label;
      };
      head(g.stackX, 'start', t('label.pushed', 'push order'));
      head(W - PAD, 'end', t('label.popped', 'pop order'));

      const step = scene.step;
      const rowsCount = Math.max(1, scene.maxDepth + 1);
      for (let d = 0; d < rowsCount; d += 1) {
        const y = rowTop(g, d);
        const cy = y + g.rowH / 2;
        const row = el('g', {}, svg);
        handles.rows.set(d, row);
        if (d === 0) {
          el(
            'rect',
            {
              x: r1(g.boxX),
              y: r1(y),
              width: r1(g.boxW),
              height: r1(g.rowH),
              rx: 5,
              fill: c.bgSubtle,
              stroke: c.border,
            },
            row,
          );
          const lab = el(
            'text',
            {
              x: r1(g.boxX + 10),
              y: r1(cy),
              'dominant-baseline': 'central',
              'font-family': fonts.body,
              'font-size': fontSizes.sm,
              fill: c.textMuted,
            },
            row,
          );
          lab.textContent = t('label.outer', 'outside');
          const wl = scene.outer.waitLine;
          const line = wl === null ? undefined : scene.lines[wl];
          if (line !== undefined) {
            const drawn = drawLine(
              row,
              g.boxX + 10 + 10 * g.cw,
              cy,
              lineSegs(line, new Map()),
              scene.outer.slot,
              g,
              false,
              step.kind === 'pop' && step.into < 0,
            );
            handles.lineEnd.set(0, drawn.end);
            if (drawn.slot !== null) handles.slots.set(0, drawn.slot);
          }
          continue;
        }
        const fi = frameAt(scene, d);
        if (fi < 0) continue;
        const f: FrameScene = scene.frames[fi]!;
        const popped = f.popOrd !== null;
        const current =
          (step.kind === 'push' || step.kind === 'pop') && step.frame === fi;
        el(
          'rect',
          {
            x: r1(g.boxX),
            y: r1(y),
            width: r1(g.boxW),
            height: r1(g.rowH),
            rx: 5,
            fill: popped ? 'none' : c.bgSubtle,
            stroke: popped ? c.textMuted : current ? c.primary : c.text,
            'stroke-width': current && !popped ? 2 : 1,
            'stroke-dasharray': popped ? '5 4' : 'none',
          },
          row,
        );
        const name = showCall(f.fn, f.vars.map((v) => v[1]));
        const hd = el(
          'text',
          {
            x: r1(g.boxX + 10),
            y: r1(cy),
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': r1(g.fs),
            'font-weight': 700,
            fill: popped ? c.textMuted : c.text,
          },
          row,
        );
        hd.textContent = name;
        const at = popped ? f.retLine : f.waitLine;
        const line = at === null ? undefined : scene.lines[at];
        if (line !== undefined) {
          const drawn = drawLine(
            row,
            g.boxX + 10 + (name.length + 2) * g.cw,
            cy,
            lineSegs(line, new Map(f.vars)),
            f.slot,
            g,
            popped,
            step.kind === 'pop' && step.into === fi,
          );
          handles.lineEnd.set(d, drawn.end);
          if (drawn.slot !== null) handles.slots.set(d, drawn.slot);
        }
        drawBadge(g.stackX + BADGE_R, cy, f.pushOrd, true);
        if (f.popOrd !== null) drawBadge(W - PAD - BADGE_R, cy, f.popOrd, false);
      }

      // 캡션 — 이번 걸음에 일어난 일만
      let caption = t('caption.start', 'No call yet — only the outer program.');
      if (step.kind === 'push') {
        const f = scene.frames[step.frame];
        if (f !== undefined) {
          caption = t(
            'caption.push',
            'L{line} calls {call} — a new frame goes on top (depth {depth}).',
            { line: f.callLine + 1, call: showCall(f.fn, f.vars.map((v) => v[1])), depth: f.depth },
          );
        }
      } else if (step.kind === 'pop') {
        const f = scene.frames[step.frame];
        const into = step.into >= 0 ? scene.frames[step.into] : undefined;
        if (f !== undefined && into !== undefined) {
          caption = t(
            'caption.pop',
            'The {call} frame is removed — its return value {value} drops into the empty slot of {below}.',
            {
              call: showCall(f.fn, f.vars.map((v) => v[1])),
              value: showValue(f.returned),
              below: showCall(into.fn, into.vars.map((v) => v[1])),
            },
          );
        } else if (f !== undefined) {
          caption = t(
            'caption.popOuter',
            'The {call} frame is removed — its return value {value} drops into the empty slot of L{line}, outside every frame.',
            {
              call: showCall(f.fn, f.vars.map((v) => v[1])),
              value: showValue(f.returned),
              line: (scene.outer.waitLine ?? f.callLine) + 1,
            },
          );
        }
      }
      // 캔버스 폭을 넘을 만하면 ' — ' 에서 두 줄로 가른다
      const capFs = parseFloat(fontSizes.md);
      const lines = estimateWidth(caption, capFs) > W - PAD * 2 ? splitCaption(caption) : [caption];
      lines.forEach((s, i) => {
        const cap = el(
          'text',
          {
            x: PAD,
            y: H - 12 - (lines.length - 1 - i) * (capFs + 4),
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            fill: c.text,
          },
          svg,
        );
        cap.textContent = s;
      });
      return handles;
    }

    function ease(p: number): number {
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    }

    /** ms 동안 frame(0→1) 을 흘린다. 세대가 바뀌거나 거두면 곧바로 풀린다 */
    function tween(mine: number, ms: number, frame: (e: number) => void): Promise<void> {
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
        frame(0);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
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
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, 16);
        timers.add(id);
      });
    }

    async function render(
      next: CallStackUnwindScene,
      prev: CallStackUnwindScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      if (!opts.animate || prev === null || !narrowSceneReady(next)) return;
      const step = next.step;
      const g = geometry(next);

      if (step.kind === 'push') {
        const f = next.frames[step.frame];
        const row = f === undefined ? undefined : handles.rows.get(f.depth);
        if (row === undefined) return;
        // 위에서 내려와 앞 틀 위에 얹힌다 — 아직 못 온 만큼 위에 있다
        const drop = g.rowH + ROW_GAP;
        await tween(mine, MOVE_MS, (e) => {
          row.setAttribute('transform', 'translate(0 ' + String(r1(-(1 - e) * drop)) + ')');
          row.setAttribute('opacity', String(r1(e)));
        });
      } else if (step.kind === 'pop') {
        const f = next.frames[step.frame];
        if (f === undefined) return;
        const targetDepth = f.depth - 1;
        const target = handles.slots.get(targetDepth);
        const fromX = handles.lineEnd.get(f.depth) ?? g.boxX + g.boxW / 2;
        const fromY = rowTop(g, f.depth) + g.rowH / 2;
        // 걷히는 틀 — 채워진 상자가 들려 올라가며 사라지고 점선 자국만 남는다
        const lift = el(
          'rect',
          {
            x: r1(g.boxX),
            y: r1(rowTop(g, f.depth)),
            width: r1(g.boxW),
            height: r1(g.rowH),
            rx: 5,
            fill: c.bgSubtle,
            stroke: c.primary,
            'stroke-width': 2,
          },
          svg,
        );
        const dx = target === undefined ? 0 : fromX + 8 - target.x;
        const dy = target === undefined ? 0 : fromY - target.y;
        if (target !== undefined) svg.appendChild(target.g);
        await tween(mine, MOVE_MS, (e) => {
          lift.setAttribute('transform', 'translate(0 ' + String(r1(-e * g.rowH * 0.5)) + ')');
          lift.setAttribute('opacity', String(r1(1 - e)));
          if (target !== undefined) {
            const k = 1 - e;
            target.g.setAttribute(
              'transform',
              'translate(' + String(r1(dx * k)) + ' ' + String(r1(dy * k)) + ')',
            );
          }
        });
      } else {
        return;
      }
      if (mine === gen && !destroyed) drawStatic(next);
    }

    return {
      render,
      destroy(): void {
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
