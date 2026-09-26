/**
 * primary-key-identifies 무대 — 부르는 값이 조건이 되어 표를 거른다.
 *
 * 동사는 "걸러진다". 조건에 맞지 않는 줄은 표 아래로 떨어져 빠지고, 맞는 줄은 위로 당겨 앉는다.
 * 다음 부르기 앞에서 빠졌던 줄이 제자리로 올라와 표는 다시 모든 줄이 된다.
 * 오른쪽에는 부르기마다 남은 줄(기본 키 값)이 쌓여, 끝 화면에서 부르기끼리 견줄 수 있다.
 *
 * 화면은 늘 `draw(scene, pose)` 한 벌로 세운다. 운동은 pose 를 보간해 같은 함수를 프레임마다 부른다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { PkCell, PrimaryKeyIdentifiesScene } from './scene.js';

const H = 460;
const NS = 'http://www.w3.org/2000/svg';

/** 한 줄 자리의 상한 — 줄이 많으면 캔버스에 맞춰 줄인다 */
const ROW_PITCH_MAX = 28;
const CARD_PITCH_MAX = 84;
const RETURN_MS = 450;
const FILTER_MS = 950;

type RowPose = { x: number; y: number; h: number; op: number };
type Pose = { rows: RowPose[]; call: number; card: number };

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** SQL 비교식의 값 글자 — 글자는 작은따옴표, 수는 그대로 */
function sqlLiteral(v: PkCell): string {
  return typeof v === 'number' ? String(v) : ["'", v, "'"].join('');
}

export const primaryKeyIdentifiesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const M = 16;
    const mdPx = parseFloat(fontSizes.md);

    // 자리 — 캔버스에서 역산한다
    const tableW = Math.round(W * 0.58);
    const trailX = M + tableW + 28;
    const trailW = W - M - trailX;
    const titleY = 24;
    const tagTop = 34;
    const tagH = 22;
    const headerY = 70;
    const headerH = 38;
    const rowsTop = headerY + headerH + 6;
    const rowsSpan = ROW_PITCH_MAX * 5;
    const captionY = H - 14;
    const trayLabelY = rowsTop + rowsSpan + 26;
    const trayTop = trayLabelY + 10;
    const trayBottom = captionY - 40;
    const cardTop = 40;
    const cardBottom = captionY - 40;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      text: string,
      o: { size: string; fill: string; mono?: boolean; bold?: boolean; anchor?: 'start' | 'middle' | 'end' },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size,
          fill: o.fill,
          'text-anchor': o.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (o.bold) node.setAttribute('font-weight', '600');
      node.textContent = text;
      return node;
    }

    function rowPitch(n: number): number {
      return Math.min(ROW_PITCH_MAX, rowsSpan / Math.max(1, n));
    }

    function trayPitch(n: number): number {
      return Math.min(ROW_PITCH_MAX, (trayBottom - trayTop) / Math.max(1, n));
    }

    /** 줄마다 앉을 자리. `kept` 가 없으면 모든 줄이 데이터 차례대로 표 안에 앉는다. */
    function layout(scene: PrimaryKeyIdentifiesScene, kept: readonly number[] | null): RowPose[] {
      const n = scene.rows.length;
      const pitch = rowPitch(n);
      const tp = trayPitch(n);
      if (kept === null) {
        return scene.rows.map((_, i) => ({ x: M, y: rowsTop + i * pitch, h: pitch - 4, op: 1 }));
      }
      const keptSet = new Set(kept);
      let k = 0;
      let d = 0;
      return scene.rows.map((_, i) => {
        if (keptSet.has(i)) {
          const pose = { x: M, y: rowsTop + k * pitch, h: pitch - 4, op: 1 };
          k += 1;
          return pose;
        }
        const pose = { x: M, y: trayTop + d * tp, h: tp - 4, op: 0.5 };
        d += 1;
        return pose;
      });
    }

    function lerpRows(a: RowPose[], b: RowPose[], p: number): RowPose[] {
      return a.map((from, i) => {
        const to = b[i] as RowPose;
        return {
          x: from.x + (to.x - from.x) * p,
          y: from.y + (to.y - from.y) * p,
          h: from.h + (to.h - from.h) * p,
          op: from.op + (to.op - from.op) * p,
        };
      });
    }

    function finalPose(scene: PrimaryKeyIdentifiesScene): Pose {
      if (scene.step.kind === 'table') return { rows: layout(scene, null), call: 0, card: 0 };
      const call = scene.calls[scene.step.index];
      if (!call) throw new Error('primary-key-identifies 무대: 걸음이 가리키는 부르기가 없다');
      return { rows: layout(scene, call.kept), call: 1, card: 1 };
    }

    function draw(scene: PrimaryKeyIdentifiesScene, pose: Pose): void {
      svg.textContent = '';
      const n = scene.rows.length;
      const cols = scene.columns;
      const colW = tableW / cols.length;
      const pkCol = cols.indexOf(scene.primaryKey);
      const pitch = rowPitch(n);
      const current = scene.step.kind === 'call' ? scene.step.index : -1;
      const call = current >= 0 ? scene.calls[current] : undefined;
      const calledCol = call ? cols.indexOf(call.column) : -1;
      const keptSet = new Set(call ? call.kept : []);

      // 표 이름
      write(svg, M, titleY, scene.table, { size: fontSizes.md, fill: colors.text, mono: true, bold: true });

      // 머리 칸
      cols.forEach((name, c) => {
        const x = M + c * colW;
        el('rect', { x: x + 1, y: headerY, width: colW - 2, height: headerH, rx: 4, fill: colors.bgSubtle, stroke: colors.border }, svg);
        const lit = c === calledCol && pose.call > 0;
        if (lit) {
          const over = el('rect', { x: x + 1, y: headerY, width: colW - 2, height: headerH, rx: 4, fill: colors.primary }, svg);
          if (pose.call < 1) over.setAttribute('opacity', String(r1(pose.call)));
        }
        const ink = lit && pose.call > 0.5 ? colors.textInverse : colors.text;
        const nameY = c === pkCol ? headerY + 14 : headerY + headerH / 2;
        write(svg, x + colW / 2, nameY, name, { size: fontSizes.sm, fill: ink, mono: true, bold: true, anchor: 'middle' });
        if (c === pkCol) {
          write(svg, x + colW / 2, headerY + 29, t('label.pk', 'primary key'), {
            size: fontSizes.xs,
            fill: lit && pose.call > 0.5 ? colors.textInverse : colors.primary,
            anchor: 'middle',
          });
        }
      });

      // 표의 자리 — 줄이 빠지면 빈 자리가 보인다
      for (let j = 0; j < n; j += 1) {
        el('rect', {
          x: M + 1, y: rowsTop + j * pitch, width: tableW - 2, height: pitch - 4, rx: 3,
          fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 3',
        }, svg);
      }

      // 거른 줄이 떨어지는 자리
      if (call) {
        el('line', { x1: M, y1: trayLabelY - 12, x2: M + tableW, y2: trayLabelY - 12, stroke: colors.border }, svg);
        write(svg, M, trayLabelY, t('label.out', 'Filtered out'), { size: fontSizes.xs, fill: colors.textMuted });
      }

      // 조건 꼬리표 — 부른 열 위로 내려앉는다
      if (call && pose.call > 0) {
        const text = [call.column, '=', sqlLiteral(call.value)].join(' ');
        const w = text.length * mdPx * 0.62 + 18;
        const cx = M + (calledCol + 0.5) * colW;
        const left = Math.max(M, Math.min(M + tableW - w, cx - w / 2));
        const dy = -(1 - pose.call) * 14;
        const g = el('g', { transform: `translate(0 ${r1(dy)})` }, svg);
        if (pose.call < 1) g.setAttribute('opacity', String(r1(pose.call)));
        el('rect', { x: left, y: tagTop, width: w, height: tagH, rx: 4, fill: colors.bg, stroke: colors.primary, 'stroke-width': 1.5 }, g);
        write(g, left + w / 2, tagTop + tagH / 2, text, { size: fontSizes.md, fill: colors.text, mono: true, anchor: 'middle' });
        el('line', { x1: cx, y1: tagTop + tagH, x2: cx, y2: headerY - 4, stroke: colors.primary, 'stroke-width': 1.5 }, g);
        el('path', { d: `M ${r1(cx - 4)} ${r1(headerY - 8)} L ${r1(cx + 4)} ${r1(headerY - 8)} L ${r1(cx)} ${r1(headerY - 2)} Z`, fill: colors.primary }, g);
      }

      // 줄
      scene.rows.forEach((row, i) => {
        const p = pose.rows[i];
        if (!p) throw new Error(`primary-key-identifies 무대: 줄 ${i} 의 자리가 없다`);
        const out = p.op < 0.99;
        const g = el('g', { transform: `translate(${r1(p.x)} ${r1(p.y)})` }, svg);
        if (out) g.setAttribute('opacity', String(r1(p.op)));
        const box = el('rect', { x: 1, y: 0, width: tableW - 2, height: p.h, rx: 3, fill: colors.bg, stroke: colors.border }, g);
        if (out) box.setAttribute('stroke-dasharray', '4 3');
        row.forEach((cell, c) => {
          if (c === calledCol && keptSet.has(i) && pose.call > 0) {
            const hl = el('rect', { x: c * colW + 3, y: 2, width: colW - 6, height: p.h - 4, rx: 2, fill: colors.accent }, g);
            if (pose.call < 1) hl.setAttribute('opacity', String(r1(pose.call)));
          }
          const onTile = c === calledCol && keptSet.has(i) && pose.call > 0.5;
          write(g, c * colW + colW / 2, p.h / 2, String(cell), {
            size: fontSizes.sm,
            fill: onTile ? colors.stateInk : colors.text,
            mono: true,
            bold: c === pkCol,
            anchor: 'middle',
          });
        });
      });

      // 부르기 자취
      write(svg, trailX, titleY, t('label.calls', 'Calls'), { size: fontSizes.sm, fill: colors.textMuted, bold: true });
      const total = Math.max(1, scene.callTotal);
      const cardPitch = Math.min(CARD_PITCH_MAX, (cardBottom - cardTop) / total);
      const cardH = cardPitch - 10;
      const shown = current + 1;
      for (let k = 0; k < shown; k += 1) {
        const c = scene.calls[k];
        if (!c) throw new Error(`primary-key-identifies 무대: 부르기 ${k} 가 없다`);
        const fresh = k === current;
        const a = fresh ? pose.card : 1;
        if (a <= 0) continue;
        const dx = -(1 - a) * 20;
        const g = el('g', { transform: `translate(${r1(trailX + dx)} ${r1(cardTop + k * cardPitch)})` }, svg);
        if (a < 1) g.setAttribute('opacity', String(r1(a)));
        const isPk = c.column === scene.primaryKey;
        el('rect', {
          x: 0, y: 0, width: trailW, height: cardH, rx: 5,
          fill: colors.bgSubtle, stroke: isPk ? colors.primary : colors.border, 'stroke-width': isPk ? 2 : 1,
        }, g);
        write(g, 10, cardH * 0.22, [c.column, '=', sqlLiteral(c.value)].join(' '), {
          size: fontSizes.sm, fill: colors.text, mono: true,
        });
        write(g, 10, cardH * 0.48, t('label.left', 'Rows left: {n}', { n: c.kept.length }), {
          size: fontSizes.xs, fill: colors.textMuted,
        });
        const chipW = Math.min(40, (trailW - 20) / Math.max(1, n));
        c.kept.forEach((ri, j) => {
          const r = scene.rows[ri];
          if (!r) throw new Error(`primary-key-identifies 무대: 줄 ${ri} 이 없다`);
          const x = 10 + j * chipW;
          el('rect', { x, y: cardH * 0.64, width: chipW - 4, height: cardH * 0.26, rx: 3, fill: colors.accent }, g);
          write(g, x + (chipW - 4) / 2, cardH * 0.77, String(r[pkCol]), {
            size: fontSizes.xs, fill: colors.stateInk, mono: true, anchor: 'middle',
          });
        });
      }

      // 캡션 — 지금 일어나는 일만. 두 줄: 무엇이 남았나 · 그 열의 값이 얼마나 갈리나
      if (call) {
        write(svg, M, captionY - 20, t('caption.call', 'Called by {column} — rows left: {left}.', {
          column: call.column,
          left: call.kept.length,
        }), { size: fontSizes.md, fill: colors.text });
        write(svg, M, captionY, t('caption.distinct', 'Distinct values in {column}: {distinct} / {n}.', {
          column: call.column,
          distinct: call.distinct,
          n,
        }), { size: fontSizes.sm, fill: colors.textMuted });
      } else {
        write(svg, M, captionY - 20, t('caption.table', 'Table {table} — rows: {n}.', { table: scene.table, n }), {
          size: fontSizes.md,
          fill: colors.text,
        });
      }
    }

    function stopMotion(): void {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let start: number | null = null;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const schedule = (): void => {
          const id = requestAnimationFrame((now) => {
            frames.delete(id);
            tick(now);
          });
          frames.add(id);
        };
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) return done();
          if (start === null) start = now;
          const p = clamp01((now - start) / ms);
          frame(p);
          if (p >= 1) return done();
          schedule();
        };
        schedule();
      });
    }

    const live = (mine: number): boolean => !destroyed && mine === gen;

    return {
      async render(next: PrimaryKeyIdentifiesScene, _prev: PrimaryKeyIdentifiesScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        stopMotion();
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || step.kind !== 'call') {
          draw(next, finalPose(next));
          return;
        }
        const end = finalPose(next);
        const whole = layout(next, null);
        const from = step.from ? layout(next, step.from) : null;

        // 첫 프레임은 아직 못 온 자리 — 앞 부르기가 남긴 모습 그대로
        draw(next, { rows: from ?? whole, call: 0, card: 0 });
        if (from) {
          await tween(RETURN_MS, mine, (p) => draw(next, { rows: lerpRows(from, whole, ease(p)), call: 0, card: 0 }));
          if (!live(mine)) return;
        }
        await tween(FILTER_MS, mine, (p) => {
          const call = ease(clamp01(p / 0.3));
          const move = ease(clamp01((p - 0.3) / 0.7));
          const card = ease(clamp01((p - 0.7) / 0.3));
          draw(next, { rows: lerpRows(whole, end.rows, move), call, card });
        });
        if (!live(mine)) return;
        draw(next, end);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        stopMotion();
        svg.textContent = '';
      },
    };
  },
};
