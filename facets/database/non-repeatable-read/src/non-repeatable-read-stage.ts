/**
 * non-repeatable-read 무대 — 한 줄에서 나온 두 읽기가 갈라진다.
 *
 * 왼쪽에 줄 하나(확정값), 그 아래로 쓰는 트랜잭션의 미확정 쓰기가 올라와 머문다.
 * 오른쪽으로 읽는 트랜잭션의 읽기가 줄에서 뻗어 나간다. 읽기가 하나면 곧은 줄기,
 * 둘째 읽기가 오면 줄기가 갈래를 치며 첫 읽기는 위로, 둘째 읽기는 아래로 벌어진다 —
 * 같은 줄 · 같은 연산 표기에서 나온 두 값이 벌어진 채 남는다.
 *
 * 자리는 모두 캔버스 폭(PIECE_CANVAS_W)에서 셈한다. 장면이 정본이고, 운동은 끝 자리에
 * 아직 못 온 만큼으로 그린다.
 */
import {
  categorical,
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
import type { NonRepeatableReadScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

const CAPTION_Y = 30;
const CY = 136;
const SPREAD = 62;
const ROW_H = 68;
const ROW_W_MAX = 150;
const CHIP_W = 84;
const CHIP_H = 40;
const PEND_Y = CY + 88;
const TAG_Y = H - 26;
const TAG_W = 40;
const TAG_H = 24;

const READ_MS = 650;
const REREAD_MS = 1000;
const WRITE_MS = 550;
const COMMIT_MS = 700;

type Attrs = Record<string, string | number>;

function rd(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 연산 표기 — 교과서 표기라 번역하지 않는다 */
function readOp(txn: number, row: string): string {
  return 'R' + String(txn) + '(' + row + ')';
}
function writeOp(txn: number, row: string, value: number): string {
  return 'W' + String(txn) + '(' + row + '=' + String(value) + ')';
}
function commitOp(txn: number): string {
  return 'C' + String(txn);
}
function txnName(txn: number): string {
  return 'T' + String(txn);
}

type Geo = {
  w: number;
  rowX: number;
  rowW: number;
  rowCx: number;
  rowRight: number;
  forkX: number;
  slotCx: number;
  chipLeft: number;
};

function geometry(): Geo {
  const w = PIECE_CANVAS_W;
  const rowX = rd(w * 0.08);
  const rowW = Math.min(ROW_W_MAX, rd(w * 0.22));
  const rowRight = rowX + rowW;
  const slotCx = rd(w - w * 0.065 - CHIP_W / 2);
  const chipLeft = slotCx - CHIP_W / 2;
  return {
    w,
    rowX,
    rowW,
    rowCx: rd(rowX + rowW / 2),
    rowRight,
    forkX: rd(rowRight + (chipLeft - rowRight) * 0.42),
    slotCx,
    chipLeft,
  };
}

/** 읽기 n 개가 갈래 끝에 서는 세로 자리 — 하나면 곧은 줄기, 여럿이면 위아래로 벌어진다 */
function slotYs(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [CY];
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(rd(CY - SPREAD + (2 * SPREAD * i) / (n - 1)));
  return out;
}

export const nonRepeatableReadStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const g = geometry();

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Attrs, parent: Element, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? rd(v) : v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function colorOf(scene: NonRepeatableReadScene, txn: number): string {
      const all = [...scene.readers, ...scene.writers].sort((a, b) => a - b);
      const cats = categorical(all.length);
      const i = all.indexOf(txn);
      const col = cats[i];
      if (col === undefined) throw new Error(`non-repeatable-read 무대: 모르는 트랜잭션 ${txn}`);
      return col;
    }

    function caption(scene: NonRepeatableReadScene): string {
      const s = scene.step;
      if (s === null) {
        const reader = scene.readers[0];
        if (reader === undefined) throw new Error('non-repeatable-read 무대: 읽는 트랜잭션이 없다');
        return t('caption.start', 'Row {row}, committed value: {value}. {txn} runs at {level}.', {
          row: scene.row,
          value: scene.committed,
          txn: txnName(reader),
          level: scene.level,
        });
      }
      if (s.kind === 'read' && s.nth === 1) {
        return t('caption.read', '{op} reads what is committed right now: {value}.', {
          op: readOp(s.txn, s.row),
          value: s.value,
        });
      }
      if (s.kind === 'read') {
        return t('caption.reread', 'Same row, {op} again. First read: {first}. This read: {value}.', {
          op: readOp(s.txn, s.row),
          first: s.first,
          value: s.value,
        });
      }
      if (s.kind === 'write') {
        return t('caption.write', '{op} is not committed yet. Committed value: {committed}.', {
          op: writeOp(s.txn, s.row, s.value),
          committed: s.committed,
        });
      }
      return t('caption.commit', '{op}: the write becomes committed. Committed value: {value}.', {
        op: commitOp(s.txn),
        value: scene.committed,
      });
    }

    function chip(
      parent: Element,
      cx: number,
      cy: number,
      value: number,
      stroke: string,
      dashed: boolean,
      label: string | null,
    ): void {
      el(
        'rect',
        {
          x: cx - CHIP_W / 2,
          y: cy - CHIP_H / 2,
          width: CHIP_W,
          height: CHIP_H,
          rx: 8,
          fill: c.bg,
          stroke,
          'stroke-width': 2,
          ...(dashed ? { 'stroke-dasharray': '5 4' } : {}),
        },
        parent,
      );
      el(
        'text',
        {
          x: cx,
          y: cy,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          fill: c.text,
        },
        parent,
        String(value),
      );
      if (label !== null) {
        el(
          'text',
          {
            x: cx,
            y: cy - CHIP_H / 2 - 7,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          parent,
          label,
        );
      }
    }

    function tag(parent: Element, cx: number, txn: number, color: string): void {
      el('rect', { x: cx - TAG_W / 2, y: TAG_Y - TAG_H / 2, width: TAG_W, height: TAG_H, rx: 12, fill: color }, parent);
      el(
        'text',
        {
          x: cx,
          y: TAG_Y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: c.textInverse,
        },
        parent,
        txnName(txn),
      );
    }

    /** 줄 상자 — 값은 따로 그린다 (커밋 운동이 옛 값을 밀어낸다) */
    function rowBox(parent: Element, scene: NonRepeatableReadScene): void {
      const top = CY - ROW_H / 2;
      el(
        'text',
        {
          x: g.rowX,
          y: top - 8,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: c.text,
        },
        parent,
        scene.row,
      );
      el(
        'text',
        {
          x: g.rowRight,
          y: top - 8,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        parent,
        t('label.committed', 'committed'),
      );
      el(
        'rect',
        { x: g.rowX, y: top, width: g.rowW, height: ROW_H, rx: 6, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1.5 },
        parent,
      );
    }

    function rowValue(parent: Element, x: number, value: number, opacity: number): void {
      el(
        'text',
        {
          x,
          y: CY,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 700,
          fill: c.text,
          ...(opacity < 1 ? { opacity: rd(Math.max(0, opacity) * 100) / 100 } : {}),
        },
        parent,
        String(value),
      );
    }

    function line(parent: Element, x1: number, y1: number, x2: number, y2: number, color: string): void {
      el('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round' }, parent);
    }

    function pendingLabel(parent: Element, cx: number): void {
      el(
        'text',
        {
          x: cx + CHIP_W / 2 + 10,
          y: PEND_Y,
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        parent,
        t('label.pending', 'not committed'),
      );
    }

    /**
     * 화면 전체를 세운다. `motion` 이 있으면 그 걸음의 운동 한 프레임을 그린다
     * (p 는 0→1, 1 이면 정적 그리기와 같다).
     */
    function draw(scene: NonRepeatableReadScene, motion: number | null): void {
      svg.textContent = '';
      const step = scene.step;
      const p = motion === null ? 1 : motion;

      el(
        'text',
        {
          x: g.w / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        },
        svg,
        caption(scene),
      );

      // 트랜잭션 꼬리표 — 읽는 이는 오른쪽 갈래 밑, 쓰는 이는 줄 밑
      const reader = scene.readers[0];
      if (reader !== undefined) {
        tag(svg, g.slotCx, reader, colorOf(scene, reader));
        el(
          'text',
          {
            x: g.slotCx - TAG_W / 2 - 8,
            y: TAG_Y,
            'text-anchor': 'end',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          svg,
          scene.level,
        );
      }
      const writer = scene.writers[0];
      if (writer !== undefined) tag(svg, g.rowCx, writer, colorOf(scene, writer));

      // 줄과 확정값
      rowBox(svg, scene);
      const commitStep = step !== null && step.kind === 'commit' && p < 1 && step.writes.length > 0 ? step : null;
      if (commitStep === null) {
        rowValue(svg, g.rowCx, scene.committed, 1);
      } else {
        // 옛 확정값이 왼쪽으로 밀려나고, 미확정 쓰기가 아래에서 올라와 들어앉는다
        const e = ease(p);
        for (const w of commitStep.writes) {
          rowValue(svg, g.rowCx - 46 * e, w.was, 1 - e);
          chip(svg, g.rowCx, lerp(PEND_Y, CY, e), w.value, colorOf(scene, commitStep.txn), e < 0.5, null);
        }
      }

      // 미확정 쓰기
      for (const w of scene.pending) {
        const color = colorOf(scene, w.txn);
        const moving = step !== null && step.kind === 'write' && step.txn === w.txn && step.row === w.row && p < 1;
        const y = moving ? lerp(TAG_Y, PEND_Y, ease(p)) : PEND_Y;
        line(svg, g.rowCx, TAG_Y - TAG_H / 2, g.rowCx, y + CHIP_H / 2, color);
        chip(svg, g.rowCx, y, w.value, color, true, moving && p < 0.6 ? null : writeOp(w.txn, w.row, w.value));
        if (!moving) pendingLabel(svg, g.rowCx);
      }

      // 읽기의 갈래
      const n = scene.reads.length;
      if (n === 0) return;
      const newYs = slotYs(n);
      const reading = step !== null && step.kind === 'read' && p < 1;
      const oldYs = reading ? slotYs(n - 1) : newYs;
      // 앞 절반 — 줄에서 갈래점까지 베낀 값이 나온다. 뒤 절반 — 갈래가 벌어지며 제 끝으로 간다
      const split = 0.42;
      const pa = reading ? Math.min(1, p / split) : 1;
      const pb = reading ? Math.max(0, (p - split) / (1 - split)) : 1;
      const open = ease(pb);

      for (let i = 0; i < n; i += 1) {
        const r = scene.reads[i];
        const endY = newYs[i];
        if (r === undefined || endY === undefined) throw new Error('non-repeatable-read 무대: 읽기 자리가 모자라다');
        const color = colorOf(scene, r.txn);
        if (i === 0) line(svg, g.rowRight, CY, g.forkX, CY, color);
        const label = readOp(r.txn, r.row);
        const isNew = reading && i === n - 1;
        if (!isNew) {
          const fromY = oldYs[i] ?? endY;
          const y = lerp(fromY, endY, open);
          line(svg, g.forkX, CY, g.chipLeft, y, color);
          chip(svg, g.slotCx, y, r.value, color, false, label);
          continue;
        }
        if (pb <= 0) {
          // 줄 안에서 갈래점으로 — 원본은 줄에 남고 베낀 값이 나온다
          const x = lerp(g.rowCx, g.forkX, ease(pa));
          chip(svg, x, CY, r.value, color, false, null);
        } else {
          const x = lerp(g.forkX, g.slotCx, open);
          const armEndX = Math.min(x - CHIP_W / 2, g.chipLeft);
          const y = lerp(CY, endY, open);
          if (armEndX > g.forkX) line(svg, g.forkX, CY, armEndX, lerp(CY, endY, (armEndX - g.forkX) / (g.chipLeft - g.forkX)), color);
          chip(svg, x, y, r.value, color, false, open > 0.6 ? label : null);
        }
      }
    }

    function frame(): Promise<void> {
      return new Promise<void>((resolve) => {
        let id = 0;
        const wake = (): void => {
          frames.delete(id);
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        id = requestAnimationFrame(() => wake());
        frames.add(id);
      });
    }

    async function run(scene: NonRepeatableReadScene, dur: number, mine: number): Promise<void> {
      const start = performance.now();
      for (;;) {
        if (destroyed || mine !== gen) return;
        const p = Math.min(1, (performance.now() - start) / dur);
        draw(scene, p);
        if (p >= 1) return;
        await frame();
      }
    }

    function durationOf(scene: NonRepeatableReadScene): number {
      const s = scene.step;
      if (s === null) return 0;
      if (s.kind === 'read') return s.nth === 1 ? READ_MS : REREAD_MS;
      if (s.kind === 'write') return WRITE_MS;
      return COMMIT_MS;
    }

    return {
      async render(next: NonRepeatableReadScene, prev: NonRepeatableReadScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const dur = durationOf(next);
        if (!opts.animate || prev === null || dur === 0 || next.step === prev.step) {
          draw(next, null);
          return;
        }
        await run(next, dur, mine);
        if (destroyed || mine !== gen) return;
        draw(next, null);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
