/**
 * ecc-stage — 한 군의 원소판(곡선 점판 또는 곱셈 시계판) 위에서 두 길을 보인다.
 *
 *   왼쪽  원소판. 원소 점마다 m(= mG 의 m)으로 자리를 쥐어, 군을 바꾸면 같은 m 의 점이 제 자리에서
 *         새 자리로 옮겨 간다(곡선 격자 ↔ 시계 둘레). 지금 점 표지가 두 배-더하기의 걸음마다 먼 점으로
 *         튀고, 되찾기에선 걷는 표지가 G 부터 한 칸씩 밟으며 자취를 남긴다.
 *   오른쪽 비밀 k 의 2진 칸 · 두 배-더하기 길의 칩 · 가는 셈 / 되찾는 셈 막대 · 교환 세 줄.
 *   아래  캡션.
 *
 * 무대는 셈하지 않는다 — 점 목록 · 차수 · 눈금 · 막대 끝 · 부호에서 자리로 가는 표는 모두 payload 에서 온다.
 * 운동 길이는 payload 의 ms 를 재생 속도로 나눠 그때그때 읽는다.
 */
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const W = 760;
const H = 470;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 판 자리
const GRID_L = 46;
const GRID_T = 58;
const GRID_SIZE = 300;
const O_X = 380;
const O_Y = 58;
const CLOCK_CX = 205;
const CLOCK_CY = 214;
const CLOCK_R = 148;
const MORPH_MS = 700;

// 오른쪽 자리
const RX = 440;
const RW = 300;
const BAR_H = 20;
const FWD_BAR_Y = 214;
const BWD_BAR_Y = 276;

export type EccSlot = { m: number; code: number; x: number; y: number; v: number; identity: boolean; alias: boolean };
export type EccInit = {
  group: 'curve' | 'mul';
  p: number;
  a: number;
  b: number;
  g: number;
  identity: number;
  k: number;
  bits: number[];
  peer: number;
  barMax: number;
  marks: number[];
  slots: EccSlot[];
};
export type EccLadderEvent = { op: 'double' | 'add'; m: number; fromM: number; code: number; bitIndex: number; forward: number; motionMs: number };
export type EccRecoverEvent = { path: number[]; added: number; recovered: number; code: number; hopMs: number };
export type EccSharedEvent = { peer: number; bCode: number; aCode: number; kCode: number; forward: number; backward: number; motionMs: number };

export type EccStage = {
  init(p: EccInit): void;
  ladder(p: EccLadderEvent): void;
  recover(p: EccRecoverEvent): void;
  shared(p: EccSharedEvent): void;
  reset(): void;
  bindSpeed(fn: () => number): void;
  destroy(): void;
};

type Pt = { x: number; y: number };

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const sup = (n: number): string =>
  String(n)
    .split('')
    .map((d) => {
      const s = SUP[Number(d)];
      if (s === undefined) throw new Error(`ecc-stage: 윗첨자로 옮길 수 없는 글자 ${d}`);
      return s;
    })
    .join('');

export const eccStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    let speedOf: () => number = () => 1;

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    };
    const text = (x: number, y: number, s: string, parent: Element, attrs: Record<string, string | number> = {}): SVGTextElement => {
      const e = el('text', { x, y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, ...attrs }, parent);
      e.textContent = s;
      return e;
    };

    // 층 — 바닥(판 눈금) · 점 · 자취 · 표지 · 오른쪽 · 캡션. 층 자체는 마운트 때 한 번만 짓는다.
    const bgLayer = el('g', {}, svg);
    const dotLayer = el('g', {}, svg);
    const trailLayer = el('g', {}, svg);
    const markLayer = el('g', {}, svg);
    const panel = el('g', {}, svg);
    const captionEl = text(20, H - 16, '', svg, { 'font-size': fontSizes.md });

    // ── 운동
    const frames = new Map<string, number>();
    const dur = (ms: number): number => ms / Math.max(0.01, speedOf());
    const stopAll = (): void => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
    };
    const tween = (key: string, ms: number, draw: (u: number) => void, done?: () => void): void => {
      const prev = frames.get(key);
      if (prev !== undefined) cancelAnimationFrame(prev);
      frames.delete(key);
      const total = dur(ms);
      if (isInstant() || total <= 0) {
        draw(1);
        done?.();
        return;
      }
      const start = performance.now();
      const frame = (now: number): void => {
        const u = Math.min(1, (now - start) / total);
        draw(u);
        if (u < 1) frames.set(key, requestAnimationFrame(frame));
        else {
          frames.delete(key);
          done?.();
        }
      };
      frames.set(key, requestAnimationFrame(frame));
    };
    params.onScrubStart?.(() => stopAll());
    const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

    // ── 판 상태 (init 이 채운다)
    let board: EccInit | null = null;
    const posOfCode = new Map<number, Pt>();
    const dots = new Map<number, SVGCircleElement>();
    const dotAt = new Map<number, Pt>(); // m → 지금 자리 (운동의 기억)
    let curAt: Pt | null = null;
    let curMarker: SVGCircleElement | null = null;
    let fwdCells: SVGRectElement[] = [];
    let bwdCells: SVGRectElement[] = [];
    let fwdValue: SVGTextElement | null = null;
    let bwdValue: SVGTextElement | null = null;
    let bitBoxes: SVGRectElement[] = [];
    let bitTexts: SVGTextElement[] = [];
    let chipCount = 0;
    let exchangeY = 0;

    const need = (): EccInit => {
      if (board === null) throw new Error('ecc-stage: init 앞에 걸음이 왔다');
      return board;
    };
    const posOf = (code: number): Pt => {
      const p = posOfCode.get(code);
      if (p === undefined) throw new Error(`ecc-stage: 부호 ${code} 가 원소 목록에 없다`);
      return p;
    };
    const ptText = (code: number): string => {
      const bd = need();
      const slot = bd.slots.find((s) => s.code === code);
      if (slot === undefined) throw new Error(`ecc-stage: 부호 ${code} 가 원소 목록에 없다`);
      if (bd.group === 'mul') return String(slot.v);
      if (slot.identity) return t('mark.infinity', 'O');
      return `(${slot.x}, ${slot.y})`;
    };
    const term = (m: number): string => {
      const bd = need();
      if (bd.group === 'curve') return m === 1 ? t('mark.base.curve', 'G') : t('term.curve', '{m}G', { m });
      return m === 1 ? t('mark.base.mul', 'g') : t('term.mul', 'g{m}', { m: sup(m) });
    };
    const base = (): string => (need().group === 'curve' ? t('mark.base.curve', 'G') : t('mark.base.mul', 'g'));

    const slotPos = (bd: EccInit, s: EccSlot): Pt => {
      if (bd.group === 'curve') {
        const span = bd.marks.length - 1;
        if (span <= 0) throw new Error('ecc-stage: 곡선 눈금이 없다');
        if (s.identity) return { x: O_X, y: O_Y };
        const step = GRID_SIZE / span;
        return { x: GRID_L + s.x * step, y: GRID_T + (span - s.y) * step };
      }
      const count = bd.marks.length;
      const idx = bd.marks.indexOf(s.v);
      if (idx < 0) throw new Error(`ecc-stage: 값 ${s.v} 가 시계 눈금에 없다`);
      const ang = -Math.PI / 2 + (2 * Math.PI * idx) / count;
      return { x: CLOCK_CX + CLOCK_R * Math.cos(ang), y: CLOCK_CY + CLOCK_R * Math.sin(ang) };
    };

    const drawBackground = (bd: EccInit): void => {
      bgLayer.replaceChildren();
      if (bd.group === 'curve') {
        text(20, 26, t('board.curve', 'Curve · y² = x³ + {a}x + {b} (mod {p})', { a: bd.a, b: bd.b, p: bd.p }), bgLayer, {
          'font-size': fontSizes.md,
          'font-weight': 600,
        });
        const span = bd.marks.length - 1;
        const step = GRID_SIZE / span;
        bd.marks.forEach((mk, i) => {
          const gx = GRID_L + i * step;
          const gy = GRID_T + (span - i) * step;
          el('line', { x1: gx, y1: GRID_T, x2: gx, y2: GRID_T + GRID_SIZE, stroke: c.border, 'stroke-width': 0.6 }, bgLayer);
          el('line', { x1: GRID_L, y1: gy, x2: GRID_L + GRID_SIZE, y2: gy, stroke: c.border, 'stroke-width': 0.6 }, bgLayer);
          text(gx, GRID_T + GRID_SIZE + 16, String(mk), bgLayer, { 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs, 'font-family': fonts.mono });
          text(GRID_L - 8, gy + 4, String(mk), bgLayer, { 'text-anchor': 'end', fill: c.textMuted, 'font-size': fontSizes.xs, 'font-family': fonts.mono });
        });
        el('circle', { cx: O_X, cy: O_Y, r: 11, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 3' }, bgLayer);
        text(O_X, O_Y - 16, t('mark.infinity', 'O'), bgLayer, { 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.mono });
      } else {
        text(20, 26, t('board.mul', 'Multiply · gᵏ mod {p} · g = {g}', { p: bd.p, g: bd.g }), bgLayer, {
          'font-size': fontSizes.md,
          'font-weight': 600,
        });
        el('circle', { cx: CLOCK_CX, cy: CLOCK_CY, r: CLOCK_R, fill: 'none', stroke: c.border }, bgLayer);
        const count = bd.marks.length;
        bd.marks.forEach((mk, i) => {
          const ang = -Math.PI / 2 + (2 * Math.PI * i) / count;
          text(CLOCK_CX + (CLOCK_R + 18) * Math.cos(ang), CLOCK_CY + (CLOCK_R + 18) * Math.sin(ang) + 4, String(mk), bgLayer, {
            'text-anchor': 'middle',
            fill: c.textMuted,
            'font-size': fontSizes.xs,
            'font-family': fonts.mono,
          });
        });
      }
    };

    const drawPanel = (bd: EccInit): void => {
      panel.replaceChildren();
      text(RX, 30, t('label.secret', 'Secret k: {k}', { k: bd.k }), panel, { 'font-size': fontSizes.md, 'font-weight': 600 });
      text(RX + 130, 30, t('label.bits', 'binary'), panel, { fill: c.textMuted, 'font-size': fontSizes.xs });
      bitBoxes = [];
      bitTexts = [];
      bd.bits.forEach((bit, i) => {
        const bx = RX + 130 + i * 30;
        bitBoxes.push(el('rect', { x: bx, y: 40, width: 26, height: 26, rx: 3, fill: i === 0 ? c.bgSubtle : c.bg, stroke: c.border }, panel));
        bitTexts.push(text(bx + 13, 58, String(bit), panel, { 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md }));
      });
      text(RX, 96, t('label.path', 'Double-and-add path'), panel, { fill: c.textMuted, 'font-size': fontSizes.xs });
      chipCount = 0;
      addChip(1, null, true);
      fwdCells = [];
      bwdCells = [];
      text(RX, FWD_BAR_Y - 8, t('label.forward', 'Forward ops'), panel);
      el('rect', { x: RX, y: FWD_BAR_Y, width: RW - 40, height: BAR_H, fill: c.bgSubtle, stroke: c.border }, panel);
      fwdValue = text(RX + RW - 30, FWD_BAR_Y + 15, '', panel, { 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600 });
      text(RX, BWD_BAR_Y - 8, t('label.backward', 'Backward ops'), panel);
      el('rect', { x: RX, y: BWD_BAR_Y, width: RW - 40, height: BAR_H, fill: c.bgSubtle, stroke: c.border }, panel);
      bwdValue = text(RX + RW - 30, BWD_BAR_Y + 15, '', panel, { 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600 });
      exchangeY = 340;
    };

    const cellW = (): number => {
      const bd = need();
      if (!(bd.barMax > 0)) throw new Error('ecc-stage: 막대 끝이 없다');
      return (RW - 40) / bd.barMax;
    };
    const growCell = (cells: SVGRectElement[], barY: number, fill: string, ms: number, key: string): void => {
      const w = cellW();
      const i = cells.length;
      const cell = el('rect', { x: RX + i * w + 1, y: barY + 2, width: 0, height: BAR_H - 4, fill, stroke: c.bg }, panel);
      cells.push(cell);
      tween(key, ms, (u) => cell.setAttribute('width', String(Math.max(0, (w - 2) * ease(u)))));
    };

    const addChip = (m: number, op: 'double' | 'add' | null, first = false): void => {
      const cx = RX + chipCount * 43;
      const cy = 112;
      const g = el('g', {}, panel);
      el('rect', { x: cx, y: cy, width: 39, height: 24, rx: 4, fill: op === 'add' ? c.bgSubtle : c.bg, stroke: first ? c.primary : c.border }, g);
      text(cx + 19.5, cy + 16, term(m), g, { 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs });
      if (op !== null) {
        const bd = need();
        const glyph =
          op === 'double'
            ? bd.group === 'curve'
              ? t('op.glyph.double.curve', '×2')
              : t('op.glyph.double.mul', 'x²')
            : bd.group === 'curve'
              ? t('op.glyph.add.curve', '+G')
              : t('op.glyph.add.mul', '×g');
        text(cx + 19.5, cy + 38, glyph, g, { 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs, 'font-family': fonts.mono });
      }
      chipCount += 1;
    };

    let currentText: SVGTextElement | null = null;
    const setCurrent = (m: number, code: number): void => {
      if (currentText === null) currentText = text(RX, 178, '', panel, { 'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 600 });
      currentText.textContent = `${term(m)} = ${ptText(code)}`;
    };

    const arcTo = (from: Pt, to: Pt, u: number): Pt => {
      const e = ease(u);
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2 - Math.hypot(to.x - from.x, to.y - from.y) * 0.3;
      const x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * mx + e * e * to.x;
      const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * my + e * e * to.y;
      return { x, y };
    };

    const clearBoard = (keepDots: boolean): void => {
      stopAll();
      trailLayer.replaceChildren();
      markLayer.replaceChildren();
      panel.replaceChildren();
      captionEl.textContent = '';
      currentText = null;
      curMarker = null;
      curAt = null;
      fwdCells = [];
      bwdCells = [];
      bitBoxes = [];
      bitTexts = [];
      fwdValue = null;
      bwdValue = null;
      chipCount = 0;
      if (!keepDots) {
        dotLayer.replaceChildren();
        bgLayer.replaceChildren();
        dots.clear();
        dotAt.clear();
        board = null;
        posOfCode.clear();
      }
    };

    const stage: EccStage = {
      bindSpeed(fn) {
        speedOf = fn;
      },
      init(p) {
        clearBoard(true);
        board = p;
        posOfCode.clear();
        drawBackground(p);
        // 점 — m 으로 자리를 쥔다. 앞 판의 자리가 있으면 거기서 새 자리로 옮겨 간다.
        const seen = new Set<number>();
        for (const s of p.slots) {
          seen.add(s.m);
          const to = slotPos(p, s);
          if (!s.alias && !posOfCode.has(s.code)) posOfCode.set(s.code, to);
          let dot = dots.get(s.m);
          if (dot === undefined) {
            dot = el('circle', { cx: to.x, cy: to.y, r: 5 }, dotLayer);
            dots.set(s.m, dot);
          }
          dot.setAttribute('fill', s.identity ? 'none' : c.bg);
          dot.setAttribute('stroke', c.textMuted);
          dot.setAttribute('stroke-width', '1.4');
          dot.setAttribute('opacity', s.alias ? '0' : '1');
          const from = dotAt.get(s.m) ?? to;
          dotAt.set(s.m, to);
          const d = dot;
          tween(`dot:${s.m}`, from.x === to.x && from.y === to.y ? 0 : MORPH_MS, (u) => {
            const q = { x: from.x + (to.x - from.x) * ease(u), y: from.y + (to.y - from.y) * ease(u) };
            d.setAttribute('cx', String(q.x));
            d.setAttribute('cy', String(q.y));
          });
        }
        for (const [m, dot] of [...dots]) {
          if (!seen.has(m)) {
            dot.remove();
            dots.delete(m);
            dotAt.delete(m);
          }
        }
        // G 표지와 지금 점 표지
        const gPos = posOf(p.g);
        el('circle', { cx: gPos.x, cy: gPos.y, r: 10, fill: 'none', stroke: c.primary, 'stroke-width': 2 }, markLayer);
        text(gPos.x - 14, gPos.y - 12, base(), markLayer, { 'text-anchor': 'end', 'font-family': fonts.mono, 'font-weight': 700 });
        curMarker = el('circle', { cx: gPos.x, cy: gPos.y, r: 7, fill: c.accent, stroke: c.text, 'stroke-width': 1.5 }, markLayer);
        curAt = gPos;
        drawPanel(p);
        fwdValue?.replaceChildren('0');
        bwdValue?.replaceChildren('');
        setCurrent(1, p.g);
        captionEl.textContent = t('caption.start', 'Secret k: {k} · from {base} to {term} — the way there and the way back', {
          k: p.k,
          base: base(),
          term: term(p.k),
        });
      },
      ladder(p) {
        const bd = need();
        const marker = curMarker;
        if (marker === null || curAt === null) throw new Error('ecc-stage: 지금 점 표지가 없다');
        const from = curAt;
        const to = posOf(p.code);
        curAt = to;
        el('path', { d: `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - Math.hypot(to.x - from.x, to.y - from.y) * 0.3} ${to.x} ${to.y}`, fill: 'none', stroke: c.accent, 'stroke-width': 1.6, 'stroke-dasharray': '4 3' }, trailLayer);
        text(to.x + 9, to.y - 9, term(p.m), trailLayer, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 600 });
        tween('cur', p.motionMs, (u) => {
          const q = arcTo(from, to, u);
          marker.setAttribute('cx', String(q.x));
          marker.setAttribute('cy', String(q.y));
        });
        // 2진 칸 — 지금 읽는 비트
        bitBoxes.forEach((box, i) => box.setAttribute('fill', i === p.bitIndex ? c.accent : i < p.bitIndex ? c.bgSubtle : c.bg));
        bitTexts.forEach((tx, i) => tx.setAttribute('fill', i === p.bitIndex ? c.stateInk : c.text));
        addChip(p.m, p.op);
        while (fwdCells.length < p.forward) growCell(fwdCells, FWD_BAR_Y, c.accent, p.motionMs, `fwd:${fwdCells.length}`);
        fwdValue?.replaceChildren(String(p.forward));
        setCurrent(p.m, p.code);
        const op =
          p.op === 'double'
            ? bd.group === 'curve'
              ? t('op.double.curve', 'Double')
              : t('op.double.mul', 'Square')
            : bd.group === 'curve'
              ? t('op.add.curve', 'Add G')
              : t('op.add.mul', 'Multiply by g');
        captionEl.textContent = t('caption.ladder', '{op}: {from} → {term} = {pt}', { op, from: term(p.fromM), term: term(p.m), pt: ptText(p.code) });
      },
      recover(p) {
        const bd = need();
        if (p.path.length !== p.added + 1) throw new Error('ecc-stage: 되찾기 길의 길이가 더한 수와 맞지 않는다');
        bitBoxes.forEach((box) => box.setAttribute('fill', c.bgSubtle));
        bitTexts.forEach((tx) => tx.setAttribute('fill', c.text));
        const start = posOf(p.path[0]!);
        const walker = el('circle', { cx: start.x, cy: start.y, r: 5, fill: c.itemComparing, stroke: c.text, 'stroke-width': 1 }, markLayer);
        el('circle', { cx: start.x, cy: start.y, r: 8, fill: 'none', stroke: c.itemComparing, 'stroke-width': 1.4 }, trailLayer);
        bwdValue?.replaceChildren('0');
        const end = posOf(p.code);
        const finish = (): void => {
          text(end.x + 10, end.y + 18, t('mark.recovered', 'k = {k}', { k: p.recovered }), markLayer, {
            'font-family': fonts.mono,
            'font-weight': 700,
            fill: c.text,
          });
        };
        // 한 번 더할 때마다 hopMs — 걸음을 시작할 때마다 재생 속도를 다시 읽는다.
        const hop = (i: number): void => {
          if (i > p.added) {
            finish();
            return;
          }
          const from = posOf(p.path[i - 1]!);
          const to = posOf(p.path[i]!);
          growCell(bwdCells, BWD_BAR_Y, c.itemComparing, p.hopMs, `bwd:${i}`);
          bwdValue?.replaceChildren(String(i));
          tween(
            'walker',
            p.hopMs,
            (u) => {
              walker.setAttribute('cx', String(from.x + (to.x - from.x) * ease(u)));
              walker.setAttribute('cy', String(from.y + (to.y - from.y) * ease(u)));
            },
            () => {
              el('circle', { cx: to.x, cy: to.y, r: 8, fill: 'none', stroke: c.itemComparing, 'stroke-width': 1.4 }, trailLayer);
              hop(i + 1);
            },
          );
        };
        hop(1);
        const opStep = bd.group === 'curve' ? t('op.step.curve', 'add G') : t('op.step.mul', 'multiply by g');
        captionEl.textContent = t('caption.recover', 'From {base}, one at a time: {n} × {op} → {pt} · recovered k: {k}', {
          base: base(),
          n: p.added,
          op: opStep,
          pt: ptText(p.code),
          k: p.recovered,
        });
      },
      shared(p) {
        const bd = need();
        const bPos = posOf(p.bCode);
        const kPos = posOf(p.kCode);
        const lines = [
          t('shared.alice', 'Alice · A = {term}: {A}', { term: term(bd.k), A: ptText(p.aCode) }),
          t('shared.bob', 'Bob · B = {term}: {B}', { term: term(p.peer), B: ptText(p.bCode) }),
          bd.group === 'curve'
            ? t('shared.key.curve', '{k}·B = {b}·A = K: {K}', { k: bd.k, b: p.peer, K: ptText(p.kCode) })
            : t('shared.key.mul', 'B{k} = A{b} = K: {K}', { k: sup(bd.k), b: sup(p.peer), K: ptText(p.kCode) }),
        ];
        lines.forEach((s, i) => text(RX, exchangeY + i * 22, s, panel, { 'font-family': fonts.mono, 'font-weight': i === 2 ? 700 : 400 }));
        // B 가 오른쪽 Bob 줄에서 판 위 제 자리로 건너온다
        const fly = { x: RX - 10, y: exchangeY + 22 - 4 };
        const bMark = el('rect', { x: fly.x - 7, y: fly.y - 7, width: 14, height: 14, fill: c.bg, stroke: c.primary, 'stroke-width': 2, transform: `rotate(45 ${fly.x} ${fly.y})` }, markLayer);
        const bLabel = text(fly.x + 10, fly.y - 8, t('mark.peer', 'B'), markLayer, { 'font-family': fonts.mono, 'font-weight': 700 });
        const kMark = el('circle', { cx: kPos.x, cy: kPos.y, r: 0, fill: c.itemSwapping, stroke: c.text, 'stroke-width': 1.5 }, markLayer);
        const kLabel = text(kPos.x + 12, kPos.y + 4, t('mark.key', 'K'), markLayer, { 'font-family': fonts.mono, 'font-weight': 700, opacity: 0 });
        tween('shared', p.motionMs, (u) => {
          const q = arcTo(fly, bPos, u);
          bMark.setAttribute('x', String(q.x - 7));
          bMark.setAttribute('y', String(q.y - 7));
          bMark.setAttribute('transform', `rotate(45 ${q.x} ${q.y})`);
          bLabel.setAttribute('x', String(q.x + 10));
          bLabel.setAttribute('y', String(q.y - 8));
          const grow = Math.max(0, (u - 0.5) * 2);
          kMark.setAttribute('r', String(9 * ease(grow)));
          kLabel.setAttribute('opacity', String(grow));
        });
        captionEl.textContent = t('caption.shared', 'Exchange · K: {K} · forward {f} · backward {r}', {
          K: ptText(p.kCode),
          f: p.forward,
          r: p.backward,
        });
      },
      reset() {
        clearBoard(false);
      },
      destroy() {
        stopAll();
        svg.replaceChildren();
      },
    };
    return stage;
  },
};
