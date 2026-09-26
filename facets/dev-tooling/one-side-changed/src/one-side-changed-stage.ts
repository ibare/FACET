/**
 * one-side-changed stage — 세 쪽(우리 쪽 · 조상 · 그쪽)이 위에 나란하고, 병합 결과가 아래에서
 * 덩이 하나씩 채워진다. 걸음마다 판정된 쪽의 줄이 제 자리에서 결과의 다음 칸으로 옮겨 간다.
 * 옮겨 온 줄은 제 쪽의 색 띠를 달고 남아, 결과가 세 쪽에서 온 줄의 섞임으로 선다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Side } from './algorithm';
import type { OneSideChangedScene, SceneRange, TakeStep } from './scene';

const H = 420;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 14;
const COL_GAP = 14;
const CAPTION_Y = 24;
const TALLY_Y = 46;
const FILE_HEAD_Y = 80;
const FILE_ROWS_TOP = 90;
const RESULT_GAP = 46;
const ROW_H_MAX = 22;
const MOVE_FRAMES = 36;
const FRAME_MS = 16;

/** 위 줄의 쪽 차례 — 조상을 가운데 둔다 */
const COLUMN_ORDER: readonly Side[] = ['ours', 'base', 'theirs'];
const SIDE_COLOR_INDEX: Record<Side, number> = { base: 0, ours: 1, theirs: 2 };

function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
  return node;
}

function rangeText(r: SceneRange): string {
  return r[1] - r[0] <= 1 ? String(r[0] + 1) : `${r[0] + 1}–${r[1]}`;
}

function inRange(at: number, r: SceneRange): boolean {
  return at >= r[0] && at < r[1];
}

function stepRange(step: TakeStep, side: Side): SceneRange {
  return side === 'base' ? step.base : side === 'ours' ? step.ours : step.theirs;
}

interface Layout {
  rowH: number;
  colW: number;
  colX: Record<Side, number>;
  resultHeadY: number;
  resultTop: number;
  resultX: number;
  resultW: number;
}

function layoutOf(scene: OneSideChangedScene): Layout {
  const fileRows = Math.max(scene.files.base.length, scene.files.ours.length, scene.files.theirs.length);
  const resultRows = Math.max(fileRows, scene.result.length);
  const rowH = Math.min(ROW_H_MAX, (H - FILE_ROWS_TOP - RESULT_GAP - PAD) / (fileRows + resultRows));
  const colW = (W - PAD * 2 - COL_GAP * 2) / 3;
  const colX = { ours: PAD, base: PAD + colW + COL_GAP, theirs: PAD + (colW + COL_GAP) * 2 } as Record<Side, number>;
  const resultHeadY = FILE_ROWS_TOP + fileRows * rowH + RESULT_GAP - 12;
  const resultW = Math.min(W - PAD * 2, colW + 90);
  return {
    rowH,
    colW,
    colX,
    resultHeadY,
    resultTop: resultHeadY + 10,
    resultX: (W - resultW) / 2,
    resultW,
  };
}

/** 결과 줄 안의 자리 — 띠 · 쪽 이름 · 줄 번호 · 글자 */
const R_TAG_X = 10;
const R_NUM_X = 70;
const R_TEXT_X = 92;
/** 파일 줄 안의 자리 */
const F_NUM_X = 9;
const F_TEXT_X = 29;

export const oneSideChangedStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const sideColors = categorical(3);
    const colorOf = (side: Side): string => sideColors[SIDE_COLOR_INDEX[side]]!;
    const codePx = parseFloat(fontSizes.sm);

    function sideLabel(side: Side): string {
      if (side === 'base') return t('label.base', 'base');
      if (side === 'ours') return t('label.ours', 'ours');
      return t('label.theirs', 'theirs');
    }

    function captionOf(scene: OneSideChangedScene): string {
      const step = scene.step;
      if (step === null) return t('caption.start', 'Three versions of one file. The merged file is still empty.');
      const line = rangeText(step.base);
      if (step.kind === 'stable') return t('caption.stable', 'Base line {line}: nobody changed it. The base line moves in.', { line });
      if (step.kind === 'ours') return t('caption.ours', 'Base line {line}: only ours changed it. The changed line moves in.', { line });
      if (step.kind === 'theirs') return t('caption.theirs', 'Base line {line}: only theirs changed it. The changed line moves in.', { line });
      throw new Error(`one-side-changed: 그릴 수 없는 판정 '${step.kind}'`);
    }

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 이번 걸음에 옮겨 온 줄의 몸통 — 운동이 이것을 옮긴다 */
    let movers: { body: SVGElement; side: SVGElement; sideOf: Side; dx: number; dy: number }[] = [];

    function text(x: number, y: number, s: string, attrs: Record<string, string | number>): SVGElement {
      const node = el('text', { x, y, ...attrs });
      node.textContent = s;
      return node;
    }

    function drawStatic(scene: OneSideChangedScene): void {
      svg.textContent = '';
      movers = [];
      const L = layoutOf(scene);
      const step = scene.step;
      const root = el('g', {});
      svg.appendChild(root);

      // 캡션 — 지금 일어나는 일
      root.appendChild(
        text(W / 2, CAPTION_Y, captionOf(scene), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        }),
      );
      if (scene.done) {
        const count = (side: Side): number => scene.result.filter((r) => r.side === side).length;
        root.appendChild(
          text(
            W / 2,
            TALLY_Y,
            t('caption.tally', 'Merged lines: {n} · from base: {fromBase} · from ours: {fromOurs} · from theirs: {fromTheirs}', {
              n: scene.result.length,
              fromBase: count('base'),
              fromOurs: count('ours'),
              fromTheirs: count('theirs'),
            }),
            { 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
          ),
        );
      }

      // 세 쪽의 파일
      const takenFrom = new Set(scene.result.map((r) => `${r.side}:${r.at}`));
      for (const side of COLUMN_ORDER) {
        const x = L.colX[side];
        const lines = scene.files[side];
        root.appendChild(
          text(x + F_TEXT_X, FILE_HEAD_Y, sideLabel(side), {
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 600,
            fill: c.text,
          }),
        );
        root.appendChild(el('rect', { x, y: FILE_HEAD_Y - 10, width: 4, height: 12, fill: colorOf(side) }));
        root.appendChild(
          el('rect', {
            x,
            y: FILE_ROWS_TOP,
            width: L.colW,
            height: lines.length * L.rowH,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        const band = step === null ? null : stepRange(step, side);
        if (band !== null && band[1] > band[0]) {
          root.appendChild(
            el('rect', {
              x,
              y: FILE_ROWS_TOP + band[0] * L.rowH,
              width: L.colW,
              height: (band[1] - band[0]) * L.rowH,
              fill: c.bgSubtle,
            }),
          );
        }
        lines.forEach((line, at) => {
          const y = FILE_ROWS_TOP + at * L.rowH;
          const inBand = band !== null && inRange(at, band);
          const chosen = inBand && step !== null && step.side === side;
          if (takenFrom.has(`${side}:${at}`)) {
            root.appendChild(el('rect', { x: x + 1, y: y + 2, width: 3, height: L.rowH - 4, fill: colorOf(side) }));
          }
          if (chosen) {
            root.appendChild(
              el('rect', {
                x: x + 0.75,
                y: y + 0.75,
                width: L.colW - 1.5,
                height: L.rowH - 1.5,
                fill: 'none',
                stroke: colorOf(side),
                'stroke-width': 1.5,
              }),
            );
          }
          root.appendChild(
            text(x + F_NUM_X, y + L.rowH / 2 + 4, String(at + 1), {
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
            }),
          );
          root.appendChild(
            text(x + F_TEXT_X, y + L.rowH / 2 + codePx / 3, line, {
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: inBand && !chosen ? c.textMuted : c.text,
              'xml:space': 'preserve',
            }),
          );
        });
      }

      // 병합 결과 — 위에서부터 채워진다
      root.appendChild(
        text(L.resultX + R_TEXT_X, L.resultHeadY, t('label.result', 'merged'), {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: c.text,
        }),
      );
      const filled = scene.result.length;
      root.appendChild(
        el('rect', {
          x: L.resultX,
          y: L.resultTop,
          width: L.resultW,
          height: Math.max(filled, 1) * L.rowH,
          fill: 'none',
          stroke: filled === 0 ? 'none' : c.border,
          'stroke-width': 1,
        }),
      );
      scene.result.forEach((r, k) => {
        const y = L.resultTop + k * L.rowH;
        const row = el('g', { transform: `translate(${num(L.resultX)},${num(y)})` });
        const sidePart = el('g', {});
        sidePart.appendChild(el('rect', { x: 0, y: 0, width: 5, height: L.rowH, fill: colorOf(r.side) }));
        sidePart.appendChild(
          text(R_TAG_X, L.rowH / 2 + 4, sideLabel(r.side), {
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          }),
        );
        sidePart.appendChild(
          text(R_NUM_X, L.rowH / 2 + 4, String(k + 1), {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          }),
        );
        row.appendChild(sidePart);
        const body = el('g', {});
        body.appendChild(
          text(R_TEXT_X, L.rowH / 2 + codePx / 3, scene.files[r.side][r.at]!, {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.text,
            'xml:space': 'preserve',
          }),
        );
        row.appendChild(body);
        root.appendChild(row);
        if (step !== null && k >= step.from) {
          // 운동의 출발 — 그 쪽 파일의 제 줄
          const srcX = L.colX[r.side] + F_TEXT_X;
          const srcY = FILE_ROWS_TOP + r.at * L.rowH;
          movers.push({ body, side: sidePart, sideOf: r.side, dx: srcX - (L.resultX + R_TEXT_X), dy: srcY - y });
        }
      });
      if (!scene.done) {
        root.appendChild(
          el('rect', {
            x: L.resultX,
            y: L.resultTop + filled * L.rowH,
            width: L.resultW,
            height: L.rowH,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '4 3',
            'stroke-width': 1,
          }),
        );
      }
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

    function ease(p: number): number {
      return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    }

    function place(p: number): void {
      const k = 1 - ease(p);
      for (const m of movers) {
        m.body.setAttribute('transform', `translate(${num(m.dx * k)},${num(m.dy * k)})`);
        m.side.setAttribute('opacity', num(p));
      }
    }

    /** 흐르는 동안만 — 옮겨 가는 줄에 제 쪽 색 테두리를 둘러 뒤 글자와 가른다 */
    function addBoxes(rowH: number): void {
      for (const m of movers) {
        const chars = (m.body.textContent ?? '').length;
        const box = el('rect', {
          x: R_TEXT_X - 5,
          y: 1,
          width: chars * codePx * 0.6 + 10,
          height: rowH - 2,
          fill: c.bg,
          stroke: colorOf(m.sideOf),
          'stroke-width': 1.5,
          rx: 3,
        });
        m.body.insertBefore(box, m.body.firstChild);
      }
    }

    return {
      async render(next: OneSideChangedScene, _prev: OneSideChangedScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || destroyed || next.step === null || movers.length === 0) return;
        addBoxes(layoutOf(next).rowH);
        place(0);
        for (let f = 1; f <= MOVE_FRAMES; f += 1) {
          await wait(FRAME_MS);
          if (mine !== gen || destroyed) return;
          place(f / MOVE_FRAMES);
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
