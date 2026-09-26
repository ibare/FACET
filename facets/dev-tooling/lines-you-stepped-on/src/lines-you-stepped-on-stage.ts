import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
} from '@ffacet/core/runtime';
import { callText, percentOf } from './algorithm.js';
import type { LinesScene } from './scene.js';

const H = 350;
const SVG = 'http://www.w3.org/2000/svg';

/** 한 걸음의 운동 — 앞 몫은 실행 자리가 내려오고, 뒤 몫은 표시가 줄 위로 떨어져 쌓인다 */
const STEP_MS = 540;
const CURSOR_SHARE = 0.4;
/** 끝 걸음 — 비어 남은 줄의 테두리가 그어진다 */
const TALLY_MS = 480;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return 1 - (1 - c) * (1 - c) * (1 - c);
}

/** 캔버스에서 역산한 자리 — 장면이 아니라 코드 줄과 센 줄에서만 정해진다 */
type Layout = {
  pad: number;
  rowH: number;
  codeTop: number;
  cursorX: number;
  numX: number;
  codeX: number;
  trayX: number;
  trayRight: number;
  countX: number;
  chip: number;
  chipGap: number;
  stripY: number;
  cellW: number;
  cellH: number;
  captionY: number;
};

function layoutFor(scene: LinesScene): Layout {
  const W = PIECE_CANVAS_W;
  const pad = 20;
  const codePx = parseFloat(fontSizes.md);
  const charW = codePx * 0.6;
  const codeTop = 62;
  const stripY = H - 88;
  const rowH = Math.min(30, (stripY - codeTop - 14) / Math.max(1, scene.code.length));
  const cursorX = pad + 4;
  const numX = pad + 36;
  const codeX = numX + 14;
  const maxLen = Math.max(...scene.code.map((l) => l.length));
  const trayX = Math.min(codeX + maxLen * charW + 30, W * 0.62);
  const countX = W - pad;
  const trayRight = countX - 30;
  const chip = Math.min(22, rowH - 8);
  const chipGap = 4;
  const n = Math.max(1, scene.counted.length);
  // 칸 줄 오른쪽 끝에 백분율 자리를 비운다
  const cellW = Math.min(36, (countX - 64 - trayX) / n - 6);
  return {
    pad,
    rowH,
    codeTop,
    cursorX,
    numX,
    codeX,
    trayX,
    trayRight,
    countX,
    chip,
    chipGap,
    stripY,
    cellW,
    cellH: Math.min(22, cellW),
    captionY: H - 18,
  };
}

function rowY(L: Layout, line: number): number {
  return L.codeTop + L.rowH * (line - 0.5);
}

/** 정적 그리기가 운동에 넘기는 손잡이 */
type Handles = {
  cursor: SVGGElement | null;
  newChip: SVGRectElement | null;
  newCellFill: SVGRectElement | null;
  neverTrays: SVGRectElement[];
};

function drawStatic(
  svg: SVGSVGElement,
  scene: LinesScene,
  c: Palette,
  t: Translate,
): Handles {
  svg.textContent = '';
  const L = layoutFor(scene);
  const handles: Handles = { cursor: null, newChip: null, newCellFill: null, neverTrays: [] };
  const step = scene.step;
  const tally = scene.tally;
  const unmarked = new Set(tally === null ? [] : tally.unmarked);

  // 시험 — 한 줄
  const head = el(
    'text',
    { x: L.pad, y: 28, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
    svg,
  );
  const lab = el('tspan', {}, head);
  lab.textContent = t('label.test', 'Test');
  const call = el(
    'tspan',
    { dx: 10, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text },
    head,
  );
  call.textContent = callText(scene.code, scene.input);
  if (tally !== null) {
    const ret = el('tspan', { dx: 16, fill: c.text }, head);
    ret.textContent = t('label.returned', 'Returned: {value}', { value: tally.returned });
  }

  // 표시 칸의 머리
  const markHead = el(
    'text',
    {
      x: L.trayX,
      y: L.codeTop - 8,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    },
    svg,
  );
  markHead.textContent = t('label.marks', 'Marks');

  // 실행 자리 — 띠와 화살표가 함께 움직인다
  if (scene.cursor !== null) {
    const y = rowY(L, scene.cursor);
    const g = el('g', {}, svg);
    el(
      'rect',
      {
        x: L.pad + 12,
        y: y - L.rowH / 2 + 1,
        width: L.countX + 8 - (L.pad + 12),
        height: L.rowH - 2,
        rx: 4,
        fill: c.bgSubtle,
        stroke: c.itemActive,
        'stroke-width': 1.5,
      },
      g,
    );
    const s = Math.min(7, L.rowH / 4);
    el(
      'path',
      {
        d: `M ${r2(L.cursorX - s)} ${r2(y - s)} L ${r2(L.cursorX + s)} ${r2(y)} L ${r2(L.cursorX - s)} ${r2(y + s)} Z`,
        fill: c.itemActive,
      },
      g,
    );
    handles.cursor = g;
  }

  // 코드 줄 · 줄 번호 · 표시 칸
  const codeLayer = el('g', {}, svg);
  scene.code.forEach((text, i) => {
    const line = i + 1;
    const y = rowY(L, line);
    const never = unmarked.has(line);
    const num = el(
      'text',
      {
        x: L.numX,
        y,
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: never ? c.danger : c.textMuted,
      },
      codeLayer,
    );
    num.textContent = String(line);
    const code = el(
      'text',
      {
        x: L.codeX,
        y,
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: never ? c.danger : c.text,
        'xml:space': 'preserve',
      },
      codeLayer,
    );
    code.textContent = text;

    const mark = scene.marks.find((m) => m.line === line);
    if (mark === undefined) return; // 센 줄이 아니다 — 표시 칸이 없다

    const trayH = L.chip + 6;
    const tray = el(
      'rect',
      {
        x: L.trayX - 4,
        y: y - trayH / 2,
        width: L.trayRight - L.trayX + 8,
        height: trayH,
        rx: 4,
        fill: 'none',
        stroke: never ? c.danger : c.ghostOutline,
        'stroke-width': never ? 1.5 : 1,
        'stroke-dasharray': never ? 'none' : '3 3',
      },
      codeLayer,
    );
    if (never) handles.neverTrays.push(tray);

    // 쌓인 표시 — 칸이 모자라면 간격을 줄여 담는다
    const room = L.trayRight - L.trayX;
    const pitch = Math.min(L.chip + L.chipGap, mark.count > 1 ? (room - L.chip) / (mark.count - 1) : room);
    for (let k = 0; k < mark.count; k += 1) {
      const chip = el(
        'rect',
        {
          x: L.trayX + k * pitch,
          y: y - L.chip / 2,
          width: L.chip,
          height: L.chip,
          rx: 3,
          fill: c.accent,
          stroke: c.stateInk,
          'stroke-width': 1,
        },
        codeLayer,
      );
      if (step.kind === 'step' && step.line === line && k === mark.count - 1) handles.newChip = chip;
    }

    const count = el(
      'text',
      {
        x: L.countX,
        y,
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': mark.count > 0 ? 700 : 400,
        fill: never ? c.danger : mark.count > 0 ? c.text : c.textMuted,
      },
      codeLayer,
    );
    count.textContent = String(mark.count);

    if (never) {
      const note = el(
        'text',
        {
          x: L.trayX + 4,
          y,
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.danger,
        },
        codeLayer,
      );
      note.textContent = t('label.never', 'never stepped');
    }
  });

  // 표시된 줄 — 센 줄 하나에 칸 하나. 표시가 몇 개든 칸은 한 번만 찬다
  const stripMid = L.stripY + L.cellH / 2;
  const stripLab = el(
    'text',
    {
      x: L.pad,
      y: stripMid,
      'dominant-baseline': 'central',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    },
    svg,
  );
  stripLab.textContent = t('label.markedLines', 'Marked lines: {marked} / {counted}', {
    marked: scene.marked,
    counted: scene.counted.length,
  });
  scene.marks.forEach((m, i) => {
    const x = L.trayX + i * (L.cellW + 6);
    const never = unmarked.has(m.line);
    el(
      'rect',
      {
        x,
        y: L.stripY,
        width: L.cellW,
        height: L.cellH,
        rx: 3,
        fill: 'none',
        stroke: never ? c.danger : c.border,
        'stroke-width': never ? 1.5 : 1,
      },
      svg,
    );
    if (m.count > 0) {
      const fill = el(
        'rect',
        {
          x: x + 2,
          y: L.stripY + 2,
          width: L.cellW - 4,
          height: L.cellH - 4,
          rx: 2,
          fill: c.accent,
          stroke: c.stateInk,
          'stroke-width': 1,
        },
        svg,
      );
      if (step.kind === 'step' && step.line === m.line && step.count === 1) handles.newCellFill = fill;
    }
    const lab2 = el(
      'text',
      {
        x: x + L.cellW / 2,
        y: L.stripY + L.cellH + 12,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: never ? c.danger : c.textMuted,
      },
      svg,
    );
    lab2.textContent = String(m.line);
  });
  if (tally !== null) {
    const pct = el(
      'text',
      {
        x: L.countX,
        y: stripMid,
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xl,
        'font-weight': 700,
        fill: c.text,
      },
      svg,
    );
    pct.textContent = t('label.pct', '{pct}%', { pct: percentOf(tally.marked, tally.counted) });
  }

  // 캡션 — 지금 일어난 일만
  const cap = el(
    'text',
    { x: L.pad, y: L.captionY, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text },
    svg,
  );
  if (step.kind === 'start') {
    cap.textContent = t('caption.start', 'Test to run: {test}. No marks yet.', {
      test: callText(scene.code, scene.input),
    });
  } else if (step.kind === 'step') {
    cap.textContent =
      step.count === 1
        ? t('caption.first', 'Stepped on line {line} — its first mark.', { line: step.line })
        : t('caption.again', 'Stepped on line {line} again. Marks on it: {count}', {
            line: step.line,
            count: step.count,
          });
  } else if (tally !== null) {
    cap.textContent = t('caption.tally', 'Lines with a mark / lines counted = {marked} / {counted} = {pct}%', {
      marked: tally.marked,
      counted: tally.counted,
      pct: percentOf(tally.marked, tally.counted),
    });
  }

  return handles;
}

export const linesYouSteppedOnStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            wake();
            return;
          }
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
      next: LinesScene,
      _prev: LinesScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(svg, next, c, t);
      if (!opts.animate) return;
      const L = layoutFor(next);
      const step = next.step;

      if (step.kind === 'step') {
        const toY = rowY(L, step.line);
        const fromY = step.from === null ? L.codeTop - L.rowH : rowY(L, step.from);
        const cursor = h.cursor;
        const chip = h.newChip;
        const cell = h.newCellFill;
        if (chip !== null) chip.setAttribute('visibility', 'hidden');
        if (cell !== null) cell.setAttribute('visibility', 'hidden');
        await tween(STEP_MS, mine, (p) => {
          const a = ease(p / CURSOR_SHARE);
          if (cursor !== null) cursor.setAttribute('transform', `translate(0 ${r2((fromY - toY) * (1 - a))})`);
          const b = (p - CURSOR_SHARE) / (1 - CURSOR_SHARE);
          if (b <= 0) return;
          const e = ease(b);
          if (chip !== null) {
            chip.removeAttribute('visibility');
            chip.setAttribute('transform', `translate(0 ${r2(-L.rowH * (1 - e))})`);
          }
          if (cell !== null) {
            cell.removeAttribute('visibility');
            cell.setAttribute('transform', `translate(0 ${r2(-L.cellH * (1 - e))})`);
          }
        });
      } else if (step.kind === 'tally' && h.neverTrays.length > 0) {
        // 둘레는 정적 그리기와 같은 셈에서 — 그린 요소를 되읽지 않는다
        const per = r2(2 * (L.trayRight - L.trayX + 8 + L.chip + 6));
        const trays = h.neverTrays;
        for (const rect of trays) {
          rect.setAttribute('stroke-dasharray', `${per} ${per}`);
          rect.setAttribute('stroke-dashoffset', String(per));
        }
        await tween(TALLY_MS, mine, (p) => {
          const e = ease(p);
          for (const rect of trays) {
            rect.setAttribute('stroke-dashoffset', String(r2(per * (1 - e))));
          }
        });
      } else {
        return;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(svg, next, c, t);
    }

    const renderer: SceneRenderer<LinesScene> = {
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
    return renderer;
  },
};
