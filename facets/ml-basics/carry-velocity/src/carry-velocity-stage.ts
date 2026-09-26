/**
 * carry-velocity 무대.
 *
 * 위는 w 축 — 비탈 · 평지 · 비탈 세 구간이 세로 띠로 아래까지 내려간다. 아래는 갱신마다 한 줄씩
 * 쌓이는 움직임 — 줄 하나가 갱신 전 자리에서 갱신 뒤 자리까지의 구간이고, 이어 받은 몫(회색)과
 * 새로 민 몫(노랑)으로 나뉜다. 갱신 한 번의 운동은 둘이다.
 *   1. 앞 줄의 움직임 전체가 한 줄 아래로 내려와 β 배로 줄며 이어 받은 몫이 된다
 *   2. 그 끝에서 새로 민 몫이 자라고, 축 위의 w 가 그만큼 옮겨 간다
 * 평지에서는 2 의 새로 민 몫이 0 이라 이어 받은 몫만으로 w 가 간다.
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
} from '@ffacet/core/runtime';
import { fmtNum, type CarryVelocityRow } from './algorithm.js';
import type { CarryVelocityScene } from './scene.js';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 — 이어 받기(A) 뒤에 새로 밀기 · 옮겨 가기(B) */
const CARRY_MS = 320;
const PUSH_MS = 400;
const FRAME_MS = 16;

const ROW_GAP_MAX = 26;
const BAR_H_MAX = 12;

type Anim = { k: number; carry: number; push: number };

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function r2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

export const carryVelocityStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const fsXs = parseFloat(fontSizes.xs);
    const fsSm = parseFloat(fontSizes.sm);
    const fsMd = parseFloat(fontSizes.md);

    // 가로 — 왼쪽 줄 번호, 가운데 w 축, 오른쪽 수 칸
    const labelX = Math.round(W * 0.06);
    const x0 = labelX + 12;
    const numColW = Math.min(170, Math.round(W * 0.28));
    const x1 = W - numColW - 18;
    const colV = W - 8;
    const colEq = colV - 50;
    const colPush = colEq - 10;
    const colPlus = colPush - 50;
    const colCarried = colPlus - 10;

    // 세로
    const legendY = 18;
    const paramsY = 34;
    const bandTop = 44;
    const bandLabelY = 60;
    const markerLabelY = 84;
    const trackY = 94;
    const tickY = 110;
    const headY = 124;
    const rowsTop = 132;
    const captionY = H - 16;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el(name: string, attrs: Record<string, string | number>, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node);
      return node;
    }

    function label(x: number, y: number, text: string, opts: { size?: number; fill?: string; anchor?: string; weight?: number; mono?: boolean }): void {
      el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fsSm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 400,
        },
        text,
      );
    }

    function rect(x: number, y: number, w: number, h: number, fill: string, extra: Record<string, string | number> = {}): void {
      el('rect', { x: r2(x), y: r2(y), width: r2(Math.max(0, w)), height: r2(h), fill, ...extra });
    }

    function draw(scene: CarryVelocityScene, anim: Anim | null): void {
      svg.textContent = '';
      const frame = scene.frame;
      if (frame === null) return;
      const { base, rows } = scene;
      const span = frame.hi - frame.lo;
      if (!(span > 0)) throw new Error('carry-velocity-stage: 축 범위가 비었다');
      const sx = (w: number): number => x0 + ((w - frame.lo) / span) * (x1 - x0);

      const rowGap = Math.min(ROW_GAP_MAX, (captionY - 40 - rowsTop) / frame.updates);
      const barH = Math.min(BAR_H_MAX, rowGap * 0.5);
      const rowMid = (k: number): number => rowsTop + (k - 0.5) * rowGap;
      const bandBottom = rowsTop + frame.updates * rowGap;

      // 머리 — 두 몫의 열쇠와 갱신 식
      rect(8, legendY - 9, 12, 10, colors.textMuted);
      label(26, legendY, t('legend.carried', 'carried β·v'), { fill: colors.text });
      rect(W * 0.34, legendY - 9, 12, 10, colors.accent, { stroke: colors.text, 'stroke-width': 0.5 });
      label(W * 0.34 + 18, legendY, t('legend.push', 'new push −η·g'), { fill: colors.text });
      label(W - 8, legendY, t('formula', 'v ← β·v − η·g · w ← w + v'), { anchor: 'end', mono: true });
      label(W - 8, paramsY, t('params', 'β {b} · η {e}', { b: fmtNum(base.beta), e: fmtNum(base.eta) }), {
        anchor: 'end',
        fill: colors.textMuted,
        size: fsXs,
      });

      // 구간 띠 — 축에서 움직임 줄 끝까지 내려간다
      const edges = [frame.lo, ...base.breaks, frame.hi];
      base.pieces.forEach((piece, i) => {
        const a = Math.max(frame.lo, edges[i]!);
        const b = Math.min(frame.hi, edges[i + 1]!);
        if (!(b > a)) return;
        const flat = piece.slope === 0;
        if (flat) rect(sx(a), bandTop, sx(b) - sx(a), bandBottom - bandTop, colors.border, { 'fill-opacity': 0.5 });
        const g = fmtNum(piece.slope);
        const text = flat ? t('label.flat', 'flat · g {g}', { g }) : t('label.slope', 'slope · g {g}', { g });
        label((sx(a) + sx(b)) / 2, bandLabelY, text, {
          anchor: 'middle',
          size: fsXs,
          fill: flat ? colors.text : colors.textMuted,
          weight: flat ? 600 : 400,
        });
      });
      for (const b of base.breaks) {
        if (b <= frame.lo || b >= frame.hi) continue;
        el('line', {
          x1: r2(sx(b)),
          x2: r2(sx(b)),
          y1: bandTop,
          y2: r2(bandBottom),
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
      }

      // w 축과 눈금
      el('line', { x1: r2(x0), x2: r2(x1), y1: trackY, y2: trackY, stroke: colors.textMuted, 'stroke-width': 1.5 });
      for (const w of [frame.lo, ...base.breaks]) {
        if (w < frame.lo || w > frame.hi) continue;
        el('line', { x1: r2(sx(w)), x2: r2(sx(w)), y1: trackY - 3, y2: trackY + 3, stroke: colors.textMuted, 'stroke-width': 1 });
        label(sx(w), tickY, fmtNum(w), { anchor: 'middle', size: fsXs, fill: colors.textMuted, mono: true });
      }

      // 수 칸 머리
      label(colCarried, headY, t('col.carried', 'β·v'), { anchor: 'end', size: fsXs, fill: colors.textMuted, mono: true });
      label(colPush, headY, t('col.push', '−η·g'), { anchor: 'end', size: fsXs, fill: colors.textMuted, mono: true });
      label(colV, headY, t('col.v', 'v'), { anchor: 'end', size: fsXs, fill: colors.textMuted, mono: true });

      const currentK = scene.step.kind === 'update' ? scene.step.k : 0;

      // 움직임 줄
      rows.forEach((row: CarryVelocityRow, i) => {
        const y = rowMid(row.k);
        const moving = anim !== null && anim.k === row.k;
        const isCurrent = row.k === currentK;
        label(labelX, y + fsXs * 0.35, t('label.row', '#{k}', { k: row.k }), {
          anchor: 'end',
          size: fsXs,
          fill: isCurrent ? colors.text : colors.textMuted,
          weight: isCurrent ? 600 : 400,
        });

        const splitW = row.from + row.carried;
        if (moving) {
          // 1. 앞 줄의 움직임이 내려와 β 배로 줄어든다
          const prev = i > 0 ? rows[i - 1] : undefined;
          const pc = ease(anim.carry);
          const fromX = prev ? sx(prev.from) : sx(row.from);
          const fromW = prev ? sx(prev.to) - sx(prev.from) : 0;
          const fromY = prev ? rowMid(prev.k) : y;
          const gx = lerp(fromX, sx(row.from), pc);
          const gw = lerp(fromW, sx(splitW) - sx(row.from), pc);
          const gy = lerp(fromY, y, pc);
          rect(gx, gy - barH / 2, gw, barH, colors.textMuted);
          // 2. 새로 민 몫이 그 끝에서 자란다
          const pp = ease(anim.push);
          if (anim.push > 0 && row.push !== 0) {
            const px = sx(splitW);
            rect(px, y - barH / 2, (sx(row.to) - px) * pp, barH, colors.accent, { stroke: colors.text, 'stroke-width': 0.5 });
          }
          return;
        }
        rect(sx(row.from), y - barH / 2, sx(splitW) - sx(row.from), barH, colors.textMuted);
        if (row.push !== 0) {
          rect(sx(splitW), y - barH / 2, sx(row.to) - sx(splitW), barH, colors.accent, { stroke: colors.text, 'stroke-width': 0.5 });
        }
        const ty = y + fsXs * 0.35;
        const ink = isCurrent ? colors.text : colors.textMuted;
        label(colCarried, ty, fmtNum(row.carried), { anchor: 'end', size: fsXs, fill: ink, mono: true });
        label(colPlus + 5, ty, '+', { anchor: 'middle', size: fsXs, fill: colors.textMuted, mono: true });
        if (row.push !== 0) {
          rect(colPush - 30, y - barH / 2, 32, barH, colors.accent);
          label(colPush, ty, fmtNum(row.push), { anchor: 'end', size: fsXs, fill: colors.stateInk, mono: true });
        } else {
          label(colPush, ty, fmtNum(row.push), { anchor: 'end', size: fsXs, fill: colors.textMuted, mono: true });
        }
        label(colEq + 5, ty, '=', { anchor: 'middle', size: fsXs, fill: colors.textMuted, mono: true });
        label(colV, ty, fmtNum(row.v), { anchor: 'end', size: fsXs, fill: ink, mono: true, weight: isCurrent ? 600 : 400 });
      });

      // w 의 자리 — 움직이는 걸음이면 새로 밀기와 같은 시계로 옮겨 간다
      const last = rows[rows.length - 1];
      let w = last ? last.to : base.w0;
      let loss = last ? last.loss : frame.loss0;
      if (anim !== null) {
        const row = rows.find((r) => r.k === anim.k);
        if (!row) throw new Error(`carry-velocity-stage: 움직일 갱신 #${anim.k} 가 장면에 없다`);
        const pp = ease(anim.push);
        w = lerp(row.from, row.to, pp);
        if (pp < 1) {
          // 옮겨 가는 동안은 갱신 전 자리의 손실
          if (row.k === 1) {
            loss = frame.loss0;
          } else {
            const before = rows[row.k - 2];
            if (!before) throw new Error(`carry-velocity-stage: 갱신 #${row.k - 1} 가 장면에 없다`);
            loss = before.loss;
          }
        }
      }
      const mx = sx(w);
      const markerText = t('label.marker', 'w {w} · L {l}', { w: fmtNum(w), l: fmtNum(loss) });
      const half = (markerText.length * fsXs * 0.3);
      const lx = Math.min(Math.max(mx, x0 + half), W - 8 - half);
      label(lx, markerLabelY, markerText, { anchor: 'middle', size: fsXs, fill: colors.text, mono: true, weight: 600 });
      el('circle', { cx: r2(mx), cy: trackY, r: 6, fill: colors.itemActive, stroke: colors.text, 'stroke-width': 1 });

      // 캡션 — 지금 걸음만 (윗줄: 어느 갱신 · 어느 구간, 아랫줄: 두 몫)
      if (scene.step.kind === 'start') {
        label(W / 2, captionY - 18, t('caption.start', 'Start · w {w} · v {v}', { w: fmtNum(base.w0), v: fmtNum(base.v0) }), {
          anchor: 'middle',
          size: fsMd,
          fill: colors.text,
        });
      } else {
        const k = scene.step.k;
        const row = rows.find((r) => r.k === k);
        if (!row) throw new Error(`carry-velocity-stage: 걸음의 갱신 #${k} 가 장면에 없다`);
        const head =
          row.g === 0
            ? t('caption.flat', 'Update #{k} · flat, g {g}', { k: row.k, g: fmtNum(row.g) })
            : t('caption.slope', 'Update #{k} · slope, g {g}', { k: row.k, g: fmtNum(row.g) });
        label(W / 2, captionY - 18, head, { anchor: 'middle', size: fsMd, fill: colors.text, weight: 600 });
        const parts = t('caption.parts', 'Carried β × {vp} = {c} · New push {p} → w {w}', {
          vp: fmtNum(row.vPrev),
          c: fmtNum(row.carried),
          p: fmtNum(row.push),
          w: fmtNum(row.to),
        });
        label(W / 2, captionY, parts, { anchor: 'middle', size: fsSm, fill: colors.text });
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    async function play(next: CarryVelocityScene, k: number, mine: number): Promise<void> {
      const total = CARRY_MS + PUSH_MS;
      const start = Date.now();
      draw(next, { k, carry: 0, push: 0 });
      for (;;) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const elapsed = Date.now() - start;
        if (elapsed >= total) break;
        draw(next, { k, carry: elapsed / CARRY_MS, push: Math.max(0, (elapsed - CARRY_MS) / PUSH_MS) });
      }
      draw(next, null);
    }

    return {
      render(next: CarryVelocityScene, prev: CarryVelocityScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        const moving =
          opts.animate &&
          step.kind === 'update' &&
          prev !== null &&
          prev.frame !== null &&
          prev.rows.length === step.k - 1;
        if (!moving || step.kind !== 'update') {
          draw(next, null);
          return;
        }
        return play(next, step.k, mine);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
