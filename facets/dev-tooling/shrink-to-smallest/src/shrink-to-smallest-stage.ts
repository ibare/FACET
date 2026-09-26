/**
 * shrink-to-smallest stage — 입력이 깎인다.
 *
 * 위 줄은 지금 입력, 아래 줄은 이번 후보. 후보는 지금 입력에서 칸 하나가 오므라들어 사라지거나
 * 칸 하나의 값 막대가 줄어 만들어진다. 성질이 여전히 깨지면 위 줄이 같은 모양으로 깎이고(받음),
 * 멀쩡하면 후보가 흐려진다(버림). 맨 아래에는 돌려 본 입력이 쌓여, 건너뛴 후보가 어디서 왔는지 보인다.
 */
import {
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
import { decodeText, encodeList } from './algorithm.js';
import type { ShrinkScene, ShrinkStep } from './scene.js';

const H = 344;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 520;
const FRAME_MS = 16;
/** 후보가 깎이는 몫 — 나머지는 받음이면 위 줄이 깎이고, 버림이면 후보가 흐려진다 */
const CUT_SHARE = 0.6;

const PAD = 24;
const LABEL_W = 96;
const CELL_H = 40;
const CELL_GAP = 10;
const CELL_MAX = 64;
const BAR_H = 6;
const ROW_INPUT_Y = 58;
const ROW_CAND_Y = 150;
const LOG_Y = 238;
const CHIP_H = 20;
const CHIP_GAP = 6;

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(q: number): number {
  return q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
}

function listText(list: readonly number[]): string {
  return `[${list.join(', ')}]`;
}

function sameList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

type CellDraw = { value: number; x: number; w: number; barW: number; opacity: number; mark: boolean };

export const shrinkToSmallestStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; mono?: boolean; anchor?: string; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    // ── 자리 셈 — 칸 폭은 캔버스와 처음 입력의 길이에서 역산한다 (상한만 상수)
    const cellsX0 = PAD + LABEL_W;
    const rightX = Math.round(W * 0.68);
    const cellsAreaW = rightX - 24 - cellsX0;

    function geometry(start: readonly number[]): { cellW: number; maxV: number } {
      const n = Math.max(1, start.length);
      const cellW = Math.min(CELL_MAX, (cellsAreaW - CELL_GAP * (n - 1)) / n);
      const maxV = Math.max(1, ...start);
      return { cellW, maxV };
    }

    function slotX(k: number, cellW: number): number {
      return cellsX0 + k * (cellW + CELL_GAP);
    }

    /** 입력 before 가 op 로 깎여 가는 도중(q)의 칸들. q = 1 이면 후보 그 자체. */
    function cutCells(step: Extract<ShrinkStep, { kind: 'try' }>, q: number, cellW: number, maxV: number): CellDraw[] {
      const e = ease(q);
      const out: CellDraw[] = [];
      step.before.forEach((v, k) => {
        if (step.op === 'delete') {
          if (k === step.index) {
            const w = cellW * (1 - e);
            if (w > 0.01) {
              out.push({ value: v, x: slotX(k, cellW) + (cellW - w) / 2, w, barW: (w * v) / maxV, opacity: 1 - e, mark: true });
            }
            return;
          }
          const x0 = slotX(k, cellW);
          const x1 = k > step.index ? slotX(k - 1, cellW) : x0;
          out.push({ value: v, x: x0 + (x1 - x0) * e, w: cellW, barW: (cellW * v) / maxV, opacity: 1, mark: false });
          return;
        }
        if (k === step.index) {
          const val = step.from + (step.to - step.from) * e;
          out.push({
            value: e < 0.5 ? step.from : step.to,
            x: slotX(k, cellW),
            w: cellW,
            barW: (cellW * val) / maxV,
            opacity: 1,
            mark: true,
          });
          return;
        }
        out.push({ value: v, x: slotX(k, cellW), w: cellW, barW: (cellW * v) / maxV, opacity: 1, mark: false });
      });
      return out;
    }

    function plainCells(list: readonly number[], cellW: number, maxV: number): CellDraw[] {
      return list.map((v, k) => ({ value: v, x: slotX(k, cellW), w: cellW, barW: (cellW * v) / maxV, opacity: 1, mark: false }));
    }

    function drawCells(parent: Element, y: number, cells: CellDraw[], dashed: boolean): void {
      for (const cell of cells) {
        const g = el('g', cell.opacity < 1 ? { opacity: cell.opacity } : {}, parent);
        const rect = el(
          'rect',
          {
            x: cell.x,
            y,
            width: cell.w,
            height: CELL_H,
            rx: 4,
            fill: c.bg,
            stroke: cell.mark ? c.itemComparing : c.text,
            'stroke-width': cell.mark ? 2 : 1.2,
          },
          g,
        );
        if (dashed) rect.setAttribute('stroke-dasharray', '4 3');
        if (cell.w > smPx) {
          label(g, cell.x + cell.w / 2, y + CELL_H / 2 + smPx * 0.4, String(cell.value), {
            mono: true,
            size: fontSizes.md,
            anchor: 'middle',
          });
        }
        el('rect', { x: cell.x, y: y + CELL_H + 5, width: cell.w, height: BAR_H, rx: 2, fill: c.bgSubtle }, g);
        if (cell.barW > 0.01) {
          el('rect', { x: cell.x, y: y + CELL_H + 5, width: cell.barW, height: BAR_H, rx: 2, fill: c.primary }, g);
        }
      }
    }

    /** 오른쪽 칸 — encode 글자 · decode 결과 · 성질이 깨졌는지 */
    function drawProof(parent: Element, y: number, list: readonly number[]): number {
      const text = encodeList(list);
      const back = decodeText(text);
      const broke = !sameList(back, list);
      label(parent, rightX, y + 14, `"${text}"`, { mono: true });
      label(parent, rightX, y + 32, `→ ${listText(back)}`, { mono: true });
      const sign = broke ? '!=' : '==';
      label(parent, rightX, y + 52, sign, { mono: true, fill: broke ? c.danger : c.textMuted, weight: 'bold' });
      const word = broke ? t('verdict.broke', 'breaks') : t('verdict.holds', 'holds');
      const cx = rightX + smPx * 2;
      const w = word.length * xsPx * 0.62 + 14;
      el(
        'rect',
        {
          x: cx,
          y: y + 40,
          width: w,
          height: 17,
          rx: 8,
          fill: c.bg,
          stroke: broke ? c.danger : c.border,
          'stroke-width': 1.2,
        },
        parent,
      );
      label(parent, cx + w / 2, y + 52, word, { size: fontSizes.xs, anchor: 'middle', fill: broke ? c.danger : c.textMuted });
      return cx + w + 8;
    }

    function drawTag(parent: Element, x: number, y: number, word: string, filled: boolean): void {
      const w = word.length * xsPx * 0.62 + 16;
      const rect = el(
        'rect',
        {
          x,
          y: y + 40,
          width: w,
          height: 17,
          rx: 3,
          fill: filled ? c.accent : c.bg,
          stroke: filled ? c.accent : c.textMuted,
          'stroke-width': 1.2,
        },
        parent,
      );
      if (!filled) rect.setAttribute('stroke-dasharray', '3 2');
      label(parent, x + w / 2, y + 52, word, {
        size: fontSizes.xs,
        anchor: 'middle',
        fill: filled ? c.stateInk : c.textMuted,
        weight: filled ? 'bold' : 'normal',
      });
    }

    function drawLog(parent: Element, scene: ShrinkScene, upto: number): void {
      const step = scene.step;
      const skipped = step ? step.skipped : [];
      label(parent, PAD, LOG_Y + 14, t('label.tried', 'Already run'), { fill: c.textMuted });
      if (skipped.length > 0) {
        label(parent, W - PAD, LOG_Y - 4, t('label.skipped', 'Skipped, already run: {n}', { n: skipped.length }), {
          size: fontSizes.xs,
          anchor: 'end',
          fill: c.itemComparing,
        });
      }
      let x = cellsX0;
      let y = LOG_Y;
      const charW = xsPx * 0.62;
      scene.tried.slice(0, upto).forEach((entry, i) => {
        const text = listText(entry.list);
        const w = text.length * charW + 12;
        if (x + w > W - PAD) {
          x = cellsX0;
          y += CHIP_H + CHIP_GAP;
        }
        const ring = skipped.some((s) => sameList(s, entry.list));
        const isStart = i === 0;
        const rect = el(
          'rect',
          {
            x,
            y,
            width: w,
            height: CHIP_H,
            rx: 3,
            fill: entry.broke && !isStart ? c.accent : c.bgSubtle,
            stroke: ring ? c.itemComparing : entry.broke ? c.text : c.border,
            'stroke-width': ring ? 2.2 : 1,
          },
          parent,
        );
        if (!entry.broke) rect.setAttribute('stroke-dasharray', '3 2');
        label(parent, x + w / 2, y + CHIP_H / 2 + xsPx * 0.36, text, {
          mono: true,
          size: fontSizes.xs,
          anchor: 'middle',
          fill: entry.broke && !isStart ? c.stateInk : entry.broke ? c.text : c.textMuted,
        });
        x += w + CHIP_GAP;
      });
    }

    function caption(parent: Element, step: ShrinkStep | null, scene: ShrinkScene): void {
      const y1 = H - 26;
      let line1 = '';
      let line2 = '';
      if (step === null) {
        line1 = t('caption.start', 'The property breaks on this input. Length: {n}', { n: scene.input.length });
      } else if (step.kind === 'try') {
        if (step.op === 'delete') {
          line1 = step.broke
            ? t('caption.deleteKept', 'Without slot {i} it still breaks. Kept — the candidate is the new input.', { i: step.index })
            : t('caption.deleteDropped', 'Without slot {i} the property holds. Dropped — the input stays.', { i: step.index });
        } else {
          line1 = step.broke
            ? t('caption.valueKept', 'Value {from} → {to}: still breaks. Kept — the candidate is the new input.', {
                from: step.from,
                to: step.to,
              })
            : t('caption.valueDropped', 'Value {from} → {to}: the property holds. Dropped — the input stays.', {
                from: step.from,
                to: step.to,
              });
        }
      } else {
        line1 = t('caption.done', 'No new candidate left. Smallest input: {list}', { list: listText(scene.input) });
        line2 = t('caption.count', 'Candidates run: {run} · kept: {kept} · dropped: {dropped}', {
          run: step.run,
          kept: step.kept,
          dropped: step.dropped,
        });
      }
      label(parent, PAD, y1, line1, { size: fontSizes.md });
      if (line2 !== '') label(parent, PAD, y1 + 20, line2, { fill: c.textMuted });
    }

    /** 장면 하나를 진행률 p (0..1) 에서 그린다. p = 1 이 정본(정적 그리기)이다. */
    function drawFrame(scene: ShrinkScene, p: number): void {
      svg.textContent = '';
      const root = el('g', {}, svg);
      const { cellW, maxV } = geometry(scene.start);
      const step = scene.step;

      label(root, PAD, 28, scene.property, { mono: true, size: fontSizes.md, weight: 'bold' });

      // 위 줄 — 지금 입력
      label(root, PAD, ROW_INPUT_Y + CELL_H / 2 + smPx * 0.4, t('label.input', 'Input'), { fill: c.textMuted });
      // 아래 줄 — 이번 후보
      label(root, PAD, ROW_CAND_Y + CELL_H / 2 + smPx * 0.4, t('label.candidate', 'Candidate'), { fill: c.textMuted });

      if (step !== null && step.kind === 'try') {
        const qa = clamp01(p / CUT_SHARE);
        const qb = clamp01((p - CUT_SHARE) / (1 - CUT_SHARE));

        // 위 줄: 받음이면 후보와 같은 모양으로 깎인다, 버림이면 그대로
        const inputCells = step.broke ? cutCells(step, qb, cellW, maxV) : plainCells(step.before, cellW, maxV);
        drawCells(root, ROW_INPUT_Y, inputCells, false);
        drawProof(root, ROW_INPUT_Y, step.broke && qb >= 1 ? step.candidate : step.before);

        const opText =
          step.op === 'delete'
            ? t('op.delete', 'Round {r} · delete slot {i}', { r: step.round, i: step.index })
            : t('op.value', 'Round {r} · slot {i} value {from} → {to}', {
                r: step.round,
                i: step.index,
                from: step.from,
                to: step.to,
              });
        label(root, cellsX0, ROW_CAND_Y - 12, opText, { fill: c.itemComparing, size: fontSizes.sm });

        const cand = el('g', {}, root);
        if (!step.broke && qb > 0) cand.setAttribute('opacity', String(r2(1 - 0.45 * ease(qb))));
        drawCells(cand, ROW_CAND_Y, cutCells(step, qa, cellW, maxV), !step.broke && qb >= 1);
        if (step.candidate.length === 0 && qa >= 1) {
          label(cand, cellsX0, ROW_CAND_Y + CELL_H / 2 + smPx * 0.4, '[]', { mono: true, size: fontSizes.md });
        }
        if (qa >= 1) {
          const proof = el('g', {}, cand);
          const tagX = drawProof(proof, ROW_CAND_Y, step.candidate);
          drawTag(
            proof,
            tagX,
            ROW_CAND_Y,
            step.broke ? t('decision.kept', 'kept') : t('decision.dropped', 'dropped'),
            step.broke,
          );
        }
        drawLog(root, scene, qa >= 1 ? scene.tried.length : scene.tried.length - 1);
      } else {
        drawCells(root, ROW_INPUT_Y, plainCells(scene.input, cellW, maxV), false);
        const tagX = drawProof(root, ROW_INPUT_Y, scene.input);
        if (step !== null && step.kind === 'done') {
          drawTag(root, tagX, ROW_INPUT_Y, t('label.smallest', 'smallest'), true);
          label(root, cellsX0, ROW_CAND_Y + CELL_H / 2 + smPx * 0.4, t('label.none', 'no new candidate'), {
            fill: c.textMuted,
          });
        }
        drawLog(root, scene, scene.tried.length);
      }

      caption(root, step, scene);
    }

    function drawStatic(scene: ShrinkScene): void {
      drawFrame(scene, 1);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
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

    return {
      async render(next: ShrinkScene, prev: ShrinkScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const moves = opts.animate && prev !== null && next.step !== null && next.step.kind === 'try';
        if (!moves) {
          drawStatic(next);
          return;
        }
        drawFrame(next, 0);
        const frames = Math.max(1, Math.round(MOTION_MS / FRAME_MS));
        for (let f = 1; f <= frames; f += 1) {
          await wait(FRAME_MS);
          if (mine !== gen || destroyed) return;
          drawFrame(next, f / frames);
        }
        drawStatic(next);
      },
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
