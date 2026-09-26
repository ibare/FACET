/**
 * query-inside-query 의 무대 — 움직이는 곳은 표가 아니라 **문장**이다.
 *
 * 위에 SQL 이, 아래에 표와 결과가 있다.
 *   - 안쪽이 돈다: 표의 점수 칸이 복사되어 괄호 밑으로 날아올라 한 줄로 서고, 그 줄이 값 하나로 줄어든다
 *   - 자리 바꿈: 괄호 안 글자가 오그라들어 사라지고, 그 값이 괄호가 있던 자리로 올라가 앉는다. 문 끝 `;` 가 당겨 온다
 *   - 바깥 거름: 줄마다 판정이 내려지고, 남는 줄의 복사본이 결과 쪽으로 건너간다
 *
 * 정적 그리기가 정본이다. 운동은 그 위에서 "아직 못 온 만큼" 만 그리고, 끝나면 정적 그리기를 한 번 더 한다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { QueryInsideQueryScene } from './scene.js';

const H = 400;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 고정폭 글꼴의 글자 너비 ÷ 글꼴 크기. 괄호 자리를 글자 수로 셈하는 근거 */
const MONO_EM = 0.6;
const MARGIN = 32;
const FRAME_MS = 16;

const MOTION_INNER_MS = 900;
const MOTION_SUBST_MS = 900;
const MOTION_FILTER_MS = 1200;

type Attrs = Record<string, string | number>;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, p: number): number {
  return round(a + (b - a) * p);
}

/** 글자 한 줄의 대략 폭 — 넓은 글자(한글 · 가나 · 한자 영역)는 1em, 나머지는 0.55em */
function roughWidth(s: string, px: number): number {
  let em = 0;
  for (const ch of s) em += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.55;
  return em * px;
}

type Layout = {
  sqlPx: number;
  cw: number;
  sqlX: number;
  lineY: number[];
  lastY: number;
  innerX: number;
  workPx: number;
  wcw: number;
  workAY: number;
  workBY: number;
  tableLabelY: number;
  headerY: number;
  rowY0: number;
  rowH: number;
  leftX: number;
  leftW: number;
  rightX: number;
  rightW: number;
  colX: number[];
  rightColX: number[];
  verdictX: number;
  markX: number;
  captionY: number;
};

function layout(scene: QueryInsideQueryScene): Layout {
  const lastLine = scene.sql.lead + scene.sql.inner + scene.sql.tail;
  const maxChars = Math.max(lastLine.length, ...scene.sql.head.map((l) => l.length));
  const sqlPx = Math.min(parseFloat(fontSizes.xl), (W - 2 * MARGIN) / (maxChars * MONO_EM));
  const cw = sqlPx * MONO_EM;
  const lh = sqlPx * 1.45;
  const lineY = scene.sql.head.map((_, i) => 30 + i * lh);
  const lastY = 30 + scene.sql.head.length * lh;
  const innerX = MARGIN + scene.sql.lead.length * cw;
  const workPx = parseFloat(fontSizes.md);
  const wcw = workPx * MONO_EM;
  const workAY = lastY + workPx * 2.1;
  const workBY = workAY + workPx * 1.6;
  const tableLabelY = workBY + 36;
  const headerY = tableLabelY + 22;
  const rowY0 = headerY + 26;
  const captionY = H - 18;
  const rowH = Math.min(26, (captionY - 26 - rowY0) / Math.max(1, scene.rows.length - 1));
  const leftX = MARGIN;
  const leftW = (W - 2 * MARGIN) * 0.52;
  const rightX = leftX + leftW + 28;
  const rightW = W - MARGIN - rightX;
  const nameW = leftW * 0.34;
  const colX = scene.columns.map((_, i) => leftX + 12 + i * nameW);
  const rightColX = scene.columns.map((_, i) => rightX + 12 + i * rightW * 0.45);
  const verdictX = leftX + leftW * 0.66;
  const markX = leftX + leftW - 16;
  return {
    sqlPx, cw, sqlX: MARGIN, lineY, lastY, innerX, workPx, wcw, workAY, workBY,
    tableLabelY, headerY, rowY0, rowH, leftX, leftW, rightX, rightW, colX, rightColX,
    verdictX, markX, captionY,
  };
}

/** 셈 줄의 낱말과 그 x — 값 · 연산 기호를 한 낱말씩 둔다 */
type Token = { text: string; x: number; role: 'value' | 'op' | 'answer' };

function tokensA(values: readonly number[], x0: number, wcw: number): Token[] {
  const out: Token[] = [];
  let at = 0;
  values.forEach((v, i) => {
    if (i > 0) {
      out.push({ text: '+', x: x0 + (at + 1) * wcw, role: 'op' });
      at += 3;
    }
    const s = String(v);
    out.push({ text: s, x: x0 + at * wcw, role: 'value' });
    at += s.length;
  });
  return out;
}

function tokensB(total: number, count: number, value: number, x0: number, wcw: number): Token[] {
  const parts: Array<[string, Token['role']]> = [
    ['=', 'op'], [String(total), 'value'], ['÷', 'op'], [String(count), 'value'], ['=', 'op'], [String(value), 'answer'],
  ];
  const out: Token[] = [];
  let at = 0;
  for (const [s, role] of parts) {
    out.push({ text: s, x: x0 + at * wcw, role });
    at += s.length + 1;
  }
  return out;
}

type Handles = {
  /** 셈 줄 A 의 값 낱말 (줄마다) */
  workValues: SVGTextElement[];
  /** 셈 줄 A 의 연산 기호 */
  workOps: SVGTextElement[];
  /** 셈 줄 B 전부 */
  workB: SVGGElement | null;
  /** 괄호 자리에 앉은 값 (글자와 바탕) */
  slotValue: SVGGElement | null;
  /** 문 끝 */
  tail: SVGTextElement | null;
  /** 결과 줄 (남은 줄마다, 표 차례) — [원래 줄 번호, 요소] */
  resultRows: Array<[number, SVGGElement]>;
  /** 판정 표시 (줄마다) */
  marks: SVGGElement[];
  /** 떨어진 줄의 흐림 막 (줄마다, 없으면 null) */
  veils: Array<SVGRectElement | null>;
};

export const queryInsideQueryStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const doc = svg.ownerDocument;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
      const node = doc.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, s: string, attrs: Attrs): SVGTextElement {
      const node = el('text', attrs, parent);
      node.textContent = s;
      return node;
    }

    function mono(px: number): Attrs {
      return { 'font-family': fonts.mono, 'font-size': round(px) };
    }

    function need<V>(v: V | null, what: string): V {
      if (v === null) throw new Error(`query-inside-query-stage: ${what} 가 아직 없다`);
      return v;
    }

    function caption(scene: QueryInsideQueryScene): string {
      switch (scene.step) {
        case 'start':
          return t('caption.start', 'The query in parentheses sits inside the outer WHERE.');
        case 'inner':
          return t('caption.inner', 'The inner query runs first, just once, and shrinks the table to one value: {value}', {
            value: need(scene.inner, 'inner').value,
          });
        case 'substitute':
          return t('caption.substitute', 'That value takes the place of the parentheses. The outer WHERE now compares with: {value}', {
            value: need(scene.inner, 'inner').value,
          });
        case 'filter':
          return t('caption.filter', 'Only now does the outer query filter the rows. Result rows: {kept}', {
            kept: need(scene.kept, 'kept'),
          });
      }
    }

    function drawStatic(scene: QueryInsideQueryScene): Handles {
      svg.textContent = '';
      const L = layout(scene);
      const h: Handles = {
        workValues: [], workOps: [], workB: null, slotValue: null, tail: null,
        resultRows: [], marks: [], veils: [],
      };
      const reading = scene.step === 'inner';

      // ── SQL
      const sqlG = el('g', mono(L.sqlPx), svg);
      scene.sql.head.forEach((line, i) => {
        label(sqlG, line, { x: L.sqlX, y: L.lineY[i] ?? 0, fill: c.text });
      });
      label(sqlG, scene.sql.lead, { x: L.sqlX, y: L.lastY, fill: c.text });
      const innerW = scene.sql.inner.length * L.cw;
      if (!scene.substituted) {
        const running = scene.inner !== null;
        el('rect', {
          x: L.innerX - 3, y: L.lastY - L.sqlPx * 0.95, width: innerW + 6, height: L.sqlPx * 1.3, rx: 4,
          fill: running ? c.itemActive : c.bgSubtle, 'fill-opacity': running ? 0.16 : 1,
          stroke: running ? c.itemActive : c.border, 'stroke-width': running ? 1.5 : 1,
        }, sqlG);
        label(sqlG, scene.sql.inner, { x: L.innerX, y: L.lastY, fill: c.text, 'data-part': 'inner' });
        h.tail = label(sqlG, scene.sql.tail, { x: L.innerX + innerW, y: L.lastY, fill: c.text });
      } else if (scene.inner !== null) {
        const s = String(scene.inner.value);
        const g = el('g', { transform: `translate(${round(L.innerX)},${round(L.lastY)})` }, sqlG);
        el('rect', {
          x: -3, y: -L.sqlPx * 0.95, width: s.length * L.cw + 6, height: L.sqlPx * 1.3, rx: 4, fill: c.accent,
        }, g);
        label(g, s, { x: 0, y: 0, fill: c.stateInk, 'font-weight': 700 });
        h.slotValue = g;
        h.tail = label(sqlG, scene.sql.tail, { x: L.innerX + s.length * L.cw, y: L.lastY, fill: c.text });
      }

      // ── 안쪽의 셈 (돌고 나서 자리를 바꾸기 전까지)
      if (scene.inner !== null && !scene.substituted) {
        const wg = el('g', mono(L.workPx), svg);
        for (const tok of tokensA(scene.inner.values, L.innerX, L.wcw)) {
          const node = label(wg, tok.text, { x: tok.x, y: L.workAY, fill: tok.role === 'op' ? c.textMuted : c.text });
          if (tok.role === 'value') h.workValues.push(node);
          else h.workOps.push(node);
        }
        const b = el('g', {}, wg);
        for (const tok of tokensB(scene.inner.total, scene.inner.count, scene.inner.value, L.innerX, L.wcw)) {
          if (tok.role === 'answer') {
            el('rect', {
              x: tok.x - 3, y: L.workBY - L.workPx * 0.95, width: tok.text.length * L.wcw + 6, height: L.workPx * 1.3,
              rx: 3, fill: c.accent,
            }, b);
            label(b, tok.text, { x: tok.x, y: L.workBY, fill: c.stateInk, 'font-weight': 700 });
          } else {
            label(b, tok.text, { x: tok.x, y: L.workBY, fill: tok.role === 'op' ? c.textMuted : c.text });
          }
        }
        h.workB = b;
      }

      // ── 표
      const tableG = el('g', {}, svg);
      label(tableG, scene.table, {
        x: L.leftX, y: L.tableLabelY, ...mono(parseFloat(fontSizes.sm)), fill: c.textMuted, 'font-weight': 700,
      });
      scene.columns.forEach((col, i) => {
        label(tableG, col, { x: L.colX[i] ?? 0, y: L.headerY, ...mono(parseFloat(fontSizes.sm)), fill: c.textMuted });
      });
      el('line', {
        x1: L.leftX, x2: L.leftX + L.leftW, y1: L.headerY + 7, y2: L.headerY + 7, stroke: c.border,
      }, tableG);
      const cellPx = parseFloat(fontSizes.md);
      scene.rows.forEach((row, r) => {
        const y = L.rowY0 + r * L.rowH;
        const verdict = scene.verdicts?.[r];
        el('rect', {
          x: L.leftX, y: y - L.rowH * 0.7, width: L.leftW, height: L.rowH - 3, rx: 3,
          fill: c.bgSubtle,
        }, tableG);
        row.forEach((cell, i) => {
          label(tableG, String(cell), {
            x: L.colX[i] ?? 0, y, ...mono(cellPx),
            fill: reading && i === scene.innerAt ? c.itemActive : c.text,
            'font-weight': reading && i === scene.innerAt ? 700 : 400,
          });
        });
        if (verdict !== undefined && scene.inner !== null) {
          const m = el('g', {}, tableG);
          const smPx = parseFloat(fontSizes.sm);
          label(m, '>', { x: L.verdictX, y, ...mono(smPx), fill: c.textMuted });
          label(m, String(scene.inner.value), { x: L.verdictX + 2 * smPx * MONO_EM, y, ...mono(smPx), fill: c.textMuted });
          label(m, verdict ? '✓' : '✗', {
            x: L.markX, y, 'font-family': fonts.body, 'font-size': cellPx, 'text-anchor': 'middle',
            fill: verdict ? c.success : c.danger, 'font-weight': 700,
          });
          h.marks.push(m);
          if (!verdict) {
            h.veils.push(el('rect', {
              x: L.leftX, y: y - L.rowH * 0.7, width: L.leftW, height: L.rowH - 3, rx: 3,
              fill: c.bg, 'fill-opacity': 0.6,
            }, tableG));
          } else {
            h.veils.push(null);
          }
        }
      });

      // ── 결과
      const resG = el('g', {}, svg);
      label(resG, t('label.result', 'result'), {
        x: L.rightX, y: L.tableLabelY, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted,
        'font-weight': 700,
      });
      scene.columns.forEach((col, i) => {
        label(resG, col, { x: L.rightColX[i] ?? 0, y: L.headerY, ...mono(parseFloat(fontSizes.sm)), fill: c.textMuted });
      });
      el('line', {
        x1: L.rightX, x2: L.rightX + L.rightW, y1: L.headerY + 7, y2: L.headerY + 7, stroke: c.border,
      }, resG);
      if (scene.verdicts !== null) {
        let slot = 0;
        scene.rows.forEach((row, r) => {
          if (scene.verdicts?.[r] !== true) return;
          const y = L.rowY0 + slot * L.rowH;
          slot += 1;
          const g = el('g', {}, resG);
          el('rect', {
            x: L.rightX, y: y - L.rowH * 0.7, width: L.rightW, height: L.rowH - 3, rx: 3,
            fill: c.success, 'fill-opacity': 0.14, stroke: c.success, 'stroke-opacity': 0.5,
          }, g);
          row.forEach((cell, i) => {
            label(g, String(cell), { x: L.rightColX[i] ?? 0, y, ...mono(cellPx), fill: c.text });
          });
          h.resultRows.push([r, g]);
        });
      }

      // ── 캡션
      const cap = caption(scene);
      const capPx = roughWidth(cap, parseFloat(fontSizes.md)) > W - 2 * MARGIN ? fontSizes.sm : fontSizes.md;
      label(svg, cap, {
        x: W / 2, y: L.captionY, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': capPx, fill: c.text,
      });
      return h;
    }

    /** 한 시계 — frame(p) 를 FRAME_MS 마다 부른다. 세대가 바뀌거나 거두면 곧바로 풀린다 */
    function clock(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      const total = Math.max(1, Math.ceil(ms / FRAME_MS));
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let n = 0;
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          n += 1;
          frame(Math.min(1, n / total));
          if (n >= total) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    /** 걸음 1 — 점수 칸의 복사본이 괄호 밑으로 날아올라 한 줄로 서고, 그 줄이 값 하나로 줄어든다 */
    async function runInner(mine: number, scene: QueryInsideQueryScene, h: Handles): Promise<void> {
      if (scene.inner === null) return;
      const L = layout(scene);
      const cellPx = parseFloat(fontSizes.md);
      const fromX = L.colX[scene.innerAt] ?? 0;
      const targets = tokensA(scene.inner.values, L.innerX, L.wcw).filter((k) => k.role === 'value');
      const flights = targets.map((tok, i) => {
        const target = h.workValues[i];
        if (target === undefined) throw new Error('query-inside-query-stage: 셈 줄의 값 수가 표의 줄 수와 다르다');
        const fy = L.rowY0 + i * L.rowH;
        const ghost = label(svg, tok.text, { x: fromX, y: fy, ...mono(cellPx), fill: c.itemActive, 'font-weight': 700 });
        return { ghost, target, fx: fromX, fy, tx: tok.x, ty: L.workAY };
      });
      await clock(mine, MOTION_INNER_MS, (raw) => {
        // 앞 60 % 는 날아오르기, 뒤 40 % 는 줄어들어 값이 되기
        const fly = ease(clamp01(raw / 0.6));
        const fold = ease(clamp01((raw - 0.6) / 0.4));
        flights.forEach((f, i) => {
          const lag = clamp01(fly * 1.25 - i * 0.05);
          f.ghost.setAttribute('x', String(lerp(f.fx, f.tx, lag)));
          f.ghost.setAttribute('y', String(lerp(f.fy, f.ty, lag)));
          f.ghost.style.display = lag >= 1 ? 'none' : '';
          f.target.style.opacity = lag >= 1 ? '' : '0';
        });
        for (const n of h.workOps) n.style.opacity = String(round(fly));
        if (h.workB !== null) {
          h.workB.setAttribute('transform', `translate(0,${lerp(L.workAY - L.workBY, 0, fold)})`);
          h.workB.style.opacity = fold <= 0 ? '0' : String(round(fold));
        }
      });
    }

    /** 걸음 2 — 괄호 안 글자가 오그라들고, 값이 그 자리로 올라가 앉는다. 문 끝이 당겨 온다 */
    async function runSubstitute(mine: number, prev: QueryInsideQueryScene, scene: QueryInsideQueryScene, h: Handles): Promise<void> {
      if (prev.inner === null || h.slotValue === null || h.tail === null) return;
      const L = layout(scene);
      const answer = tokensB(prev.inner.total, prev.inner.count, prev.inner.value, L.innerX, L.wcw).find((k) => k.role === 'answer');
      if (answer === undefined) return;
      const innerW = scene.sql.inner.length * L.cw;
      const slotW = String(prev.inner.value).length * L.cw;
      // 오그라드는 괄호 글자와 남는 셈 줄은 앞 장면의 것 — 운동 동안만 있는 복사본
      const ghostG = el('g', mono(L.sqlPx), svg);
      el('rect', {
        x: L.innerX - 3, y: L.lastY - L.sqlPx * 0.95, width: innerW + 6, height: L.sqlPx * 1.3, rx: 4,
        fill: c.itemActive, 'fill-opacity': 0.16, stroke: c.itemActive, 'stroke-width': 1.5,
      }, ghostG);
      label(ghostG, scene.sql.inner, { x: L.innerX, y: L.lastY, fill: c.text });
      const workG = el('g', mono(L.workPx), svg);
      for (const tok of tokensA(prev.inner.values, L.innerX, L.wcw)) {
        label(workG, tok.text, { x: tok.x, y: L.workAY, fill: tok.role === 'op' ? c.textMuted : c.text });
      }
      for (const tok of tokensB(prev.inner.total, prev.inner.count, prev.inner.value, L.innerX, L.wcw)) {
        if (tok.role === 'answer') continue;
        label(workG, tok.text, { x: tok.x, y: L.workBY, fill: tok.role === 'op' ? c.textMuted : c.text });
      }
      const slot = h.slotValue;
      const tail = h.tail;
      const scaleFrom = L.workPx / L.sqlPx;
      await clock(mine, MOTION_SUBST_MS, (raw) => {
        const squeeze = ease(clamp01(raw / 0.55));
        const rise = ease(clamp01((raw - 0.2) / 0.8));
        const s = round(Math.max(0.001, 1 - squeeze));
        const cx = L.innerX + innerW / 2;
        ghostG.setAttribute('transform', `translate(${round(cx)},0) scale(${s},1) translate(${round(-cx)},0)`);
        ghostG.style.opacity = s <= 0.01 ? '0' : '';
        workG.style.opacity = String(round(1 - squeeze));
        const x = lerp(answer.x, L.innerX, rise);
        const y = lerp(L.workBY, L.lastY, rise);
        const k = lerp(scaleFrom, 1, rise);
        slot.setAttribute('transform', `translate(${x},${y}) scale(${k})`);
        const tailX = lerp(L.innerX + innerW, L.innerX + slotW, squeeze);
        tail.setAttribute('x', String(tailX));
      });
    }

    /** 걸음 3 — 줄마다 판정이 내려가고, 남는 줄의 복사본이 결과 쪽으로 건너간다 */
    async function runFilter(mine: number, scene: QueryInsideQueryScene, h: Handles): Promise<void> {
      const L = layout(scene);
      const n = scene.rows.length;
      const moves = h.resultRows.map(([r, g], slot) => ({
        g, r, dx: L.leftX - L.rightX, dy: (r - slot) * L.rowH,
      }));
      await clock(mine, MOTION_FILTER_MS, (raw) => {
        // 판정은 줄 차례로 내려간다. 줄 하나의 몫 = 앞 절반은 판정, 남는 줄은 뒤이어 건너간다
        h.marks.forEach((m, r) => {
          const at = clamp01((raw - (r / n) * 0.5) / 0.2);
          m.style.opacity = String(round(at));
          const veil = h.veils[r];
          if (veil) veil.style.opacity = String(round(at));
        });
        for (const mv of moves) {
          const start = (mv.r / n) * 0.5 + 0.1;
          const p = ease(clamp01((raw - start) / 0.4));
          mv.g.setAttribute('transform', `translate(${lerp(mv.dx, 0, p)},${lerp(mv.dy, 0, p)})`);
        }
      });
    }

    const instance = {
      async render(next: QueryInsideQueryScene, prev: QueryInsideQueryScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null) return;
        if (next.step === 'inner' && prev.inner === null) await runInner(mine, next, h);
        else if (next.step === 'substitute' && !prev.substituted) await runSubstitute(mine, prev, next, h);
        else if (next.step === 'filter' && prev.verdicts === null) await runFilter(mine, next, h);
        else return;
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of Array.from(waiters)) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return instance;
  },
};
