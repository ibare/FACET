/**
 * foreign-key-points stage — 왼쪽 자식 표의 외래 키 값이 사이 틈을 건너 오른쪽 부모 표의
 * 같은 키 값을 가진 줄에 가 닿는다. 들어오려는 줄의 값은 건너가다 닿을 줄이 없어 되돌아온다.
 *
 * 두 표는 틈을 사이에 두고 마주 본다 — 자식 표는 오른쪽 끝이, 부모 표는 왼쪽 끝이 틈에 닿는다.
 * 가리킴은 틈을 건너는 곡선이다. 줄의 자리가 달라도(고객 표 차례 ≠ 주문 차례) 값이 같은
 * 줄로 가므로 곡선이 엇갈리고, 한 고객을 가리키는 주문 둘은 한 점에 모인다.
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ForeignKeyPointsScene } from './scene.js';

const H = 310;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가장자리 여백 */
const PAD = 20;
/** 표 폭 상한 */
const TABLE_W_MAX = 240;
/** 표 이름 · 역할 표 · 열 머리 · 줄의 세로 자리 */
const NAME_Y = 22;
const ROLE_Y = 44;
const HEAD_TOP = 50;
const HEAD_H = 24;
const ROWS_TOP = HEAD_TOP + HEAD_H;
/** 줄 높이 상한 — 줄이 늘면 줄인다 (세로는 바뀌지 않는다) */
const ROW_H_MAX = 30;
/** 들어오려는 줄의 자리 */
const INCOMING_LABEL_Y = 226;
const INCOMING_TOP = 232;
const CAPTION_Y = 294;
/** 들어오려다 튕겨 날 때 표 쪽으로 다가가는 거리 */
const RISE = 12;
/** 운동 길이 */
const FOLLOW_MS = 700;
const REJECT_MS = 1500;
const FRAME_MS = 16;

type Pt = { x: number; y: number };
type Curve = [Pt, Pt, Pt, Pt];

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function lerp(a: Pt, b: Pt, k: number): Pt {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** 삼차 곡선을 k 에서 자른 앞부분 (de Casteljau) */
function curveHead(c: Curve, k: number): Curve {
  const [p0, p1, p2, p3] = c;
  const a = lerp(p0, p1, k);
  const b = lerp(p1, p2, k);
  const cc = lerp(p2, p3, k);
  const ab = lerp(a, b, k);
  const bc = lerp(b, cc, k);
  return [p0, a, ab, lerp(ab, bc, k)];
}

function curveD(c: Curve): string {
  const [p0, p1, p2, p3] = c;
  return `M${r2(p0.x)},${r2(p0.y)} C${r2(p1.x)},${r2(p1.y)} ${r2(p2.x)},${r2(p2.y)} ${r2(p3.x)},${r2(p3.y)}`;
}

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function easeOut(k: number): number {
  return 1 - (1 - k) * (1 - k);
}

function clamp01(k: number): number {
  return k < 0 ? 0 : k > 1 ? 1 : k;
}

/** 자리 셈 — 캔버스 폭과 줄 수에서 역산한다 */
function layoutOf(scene: ForeignKeyPointsScene) {
  const W = PIECE_CANVAS_W;
  const tableW = Math.min(TABLE_W_MAX, Math.floor((W - 2 * PAD) * 0.36));
  const childX = PAD;
  const parentX = W - PAD - tableW;
  const gap = parentX - (childX + tableW);
  const maxRows = Math.max(scene.child.rows.length, scene.parent.rows.length, 1);
  const rowH = Math.min(ROW_H_MAX, (INCOMING_LABEL_Y - 14 - ROWS_TOP) / maxRows);
  const childColW = tableW / scene.child.columns.length;
  const parentColW = tableW / scene.parent.columns.length;
  const rowMid = (i: number) => ROWS_TOP + rowH * i + rowH / 2;
  const incomingMid = INCOMING_TOP + ROW_H_MAX / 2;
  const curveTo = (from: Pt, to: Pt): Curve => [
    from,
    { x: from.x + gap * 0.5, y: from.y },
    { x: to.x - gap * 0.5, y: to.y },
    to,
  ];
  return { W, tableW, childX, parentX, gap, rowH, childColW, parentColW, rowMid, incomingMid, curveTo };
}

export const foreignKeyPointsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const monoSm = parseFloat(fontSizes.sm);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    /** 한 시계 — p 가 0 에서 1 로 흐른다. 되짚기 · destroy 에 깨어 곧바로 물러난다 */
    function clock(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = () => finish(false);
        waiters.add(wake);
        const tick = () => {
          if (destroyed || mine !== gen) return finish(false);
          const p = clamp01((Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    /** 움직일 손잡이 — 정적 그리기가 매번 새로 만든다 */
    type Handles = {
      currentLink: SVGPathElement | null;
      currentArrow: SVGPolygonElement | null;
      targetMark: SVGRectElement | null;
      incoming: SVGGElement | null;
      incomingFrame: SVGRectElement | null;
      rejectMarks: SVGGElement | null;
      tokenLayer: SVGGElement;
    };

    function drawTable(
      g: SVGGElement,
      x: number,
      name: string,
      columns: string[],
      colW: number,
      roles: Map<string, string>,
    ): void {
      el('text', { x, y: NAME_Y, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600 }, g, name);
      columns.forEach((col, j) => {
        const cx = x + colW * j + colW / 2;
        const role = roles.get(col);
        if (role !== undefined) {
          el('text', { x: cx, y: ROLE_Y, 'text-anchor': 'middle', fill: c.primary, 'font-family': fonts.body, 'font-size': fontSizes.xs }, g, role);
        }
        el('rect', { x: x + colW * j, y: HEAD_TOP, width: colW, height: HEAD_H, fill: c.bgSubtle, stroke: c.border }, g);
        el('text', { x: cx, y: HEAD_TOP + HEAD_H / 2 + 4, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, g, col);
      });
    }

    function drawRow(
      g: SVGGElement,
      x: number,
      top: number,
      h: number,
      colW: number,
      row: (string | number)[],
      stroke: string,
      strokeW: number,
    ): SVGRectElement {
      row.forEach((v, j) => {
        el('rect', { x: x + colW * j, y: top, width: colW, height: h, fill: c.bg, stroke: c.border }, g);
        el('text', { x: x + colW * j + colW / 2, y: top + h / 2 + monoSm * 0.35, 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, g, String(v));
      });
      return el('rect', { x, y: top, width: colW * row.length, height: h, fill: 'none', stroke, 'stroke-width': strokeW }, g);
    }

    function drawToken(layer: SVGGElement, at: Pt, value: string, fill: string): void {
      layer.textContent = '';
      const w = Math.max(28, value.length * monoSm * 0.62 + 14);
      const h = 20;
      el('rect', { x: at.x - w / 2, y: at.y - h / 2, width: w, height: h, rx: 10, fill }, layer);
      el('text', { x: at.x, y: at.y + monoSm * 0.35, 'text-anchor': 'middle', fill: c.textInverse, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 600 }, layer, value);
    }

    function captionOf(s: ForeignKeyPointsScene): string {
      const step = s.step;
      const fk = s.child.foreignKey;
      if (step.kind === 'tables') {
        return t('caption.tables', 'Foreign key: {child}.{fk} → {parent}.{key}', {
          child: s.child.name,
          fk: fk.column,
          parent: s.parent.name,
          key: s.parent.key,
        });
      }
      const keyAt = s.child.columns.indexOf(s.child.key);
      const fkAt = s.child.columns.indexOf(fk.column);
      if (step.kind === 'follow') {
        const row = s.child.rows[step.order];
        if (row === undefined) throw new Error(`foreign-key-points stage: 주문 줄 ${step.order} 가 없다`);
        return t('caption.follow', '{key} {id} → the {parent} row with key {value} · rows pointing there: {n}', {
          key: s.child.key,
          id: String(row[keyAt]),
          parent: s.parent.name,
          value: String(row[fkAt]),
          n: step.pointed,
        });
      }
      const vars = {
        parent: s.parent.name,
        value: String(s.incoming[fkAt]),
        n: step.matches,
        child: s.child.name,
        rows: s.child.rows.length,
      };
      return step.accepted
        ? t('caption.accept', '{parent} rows with key {value}: {n} · accepted · {child} rows: {rows}', vars)
        : t('caption.reject', '{parent} rows with key {value}: {n} · rejected · {child} rows: {rows}', vars);
    }

    /** 장면 하나의 화면 전체 — 정본 */
    function drawStatic(s: ForeignKeyPointsScene): Handles {
      svg.textContent = '';
      const L = layoutOf(s);
      const step = s.step;
      const root = el('g', {}, svg);
      const linkLayer = el('g', {}, root);
      const tables = el('g', {}, root);
      const tokenLayer = el('g', {}, root);

      const pk = t('label.pk', 'Primary key');
      const childRoles = new Map<string, string>([[s.child.key, pk]]);
      childRoles.set(s.child.foreignKey.column, t('label.fk', 'Foreign key'));
      drawTable(tables, L.childX, s.child.name, s.child.columns, L.childColW, childRoles);
      drawTable(tables, L.parentX, s.parent.name, s.parent.columns, L.parentColW, new Map([[s.parent.key, pk]]));

      const curOrder = step.kind === 'follow' ? step.order : step.kind === 'insert' && step.accepted ? s.child.rows.length - 1 : -1;
      const curCustomer = step.kind === 'follow' ? step.customer : step.kind === 'insert' && step.customer !== null ? step.customer : -1;

      s.child.rows.forEach((row, i) => {
        const on = i === curOrder;
        drawRow(tables, L.childX, ROWS_TOP + L.rowH * i, L.rowH, L.childColW, row, on ? c.itemActive : 'none', on ? 2 : 0);
      });
      let targetMark: SVGRectElement | null = null;
      s.parent.rows.forEach((row, i) => {
        const on = i === curCustomer;
        const mark = drawRow(tables, L.parentX, ROWS_TOP + L.rowH * i, L.rowH, L.parentColW, row, on ? c.itemActive : 'none', on ? 2 : 0);
        if (on) targetMark = mark;
      });

      // 가리킴 — 자식 줄의 오른쪽 끝에서 부모 줄의 왼쪽 끝으로
      let currentLink: SVGPathElement | null = null;
      let currentArrow: SVGPolygonElement | null = null;
      s.links.forEach((lk, idx) => {
        const cur = idx === s.links.length - 1 && (step.kind === 'follow' || (step.kind === 'insert' && step.accepted));
        const color = cur ? c.itemActive : c.primary;
        const from = { x: L.childX + L.tableW, y: L.rowMid(lk.order) };
        const to = { x: L.parentX, y: L.rowMid(lk.customer) };
        const path = el('path', { d: curveD(L.curveTo(from, to)), fill: 'none', stroke: color, 'stroke-width': cur ? 2.2 : 1.5 }, linkLayer);
        el('circle', { cx: from.x, cy: from.y, r: 3, fill: color }, linkLayer);
        const arrow = el('polygon', {
          points: `${r2(to.x)},${r2(to.y)} ${r2(to.x - 8)},${r2(to.y - 4.5)} ${r2(to.x - 8)},${r2(to.y + 4.5)}`,
          fill: color,
        }, linkLayer);
        if (cur) {
          currentLink = path;
          currentArrow = arrow;
        }
      });

      // 들어오려는 줄 — 받아들여지지 않은 동안 표 아래 제자리에 선다
      let incoming: SVGGElement | null = null;
      let incomingFrame: SVGRectElement | null = null;
      let rejectMarks: SVGGElement | null = null;
      const rejected = s.outcome !== null && !s.outcome.accepted;
      if (s.outcome === null || rejected) {
        el('text', { x: L.childX, y: INCOMING_LABEL_Y, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, tables, t('label.incoming', 'Incoming row'));
        incoming = el('g', {}, tables);
        incomingFrame = drawRow(incoming, L.childX, INCOMING_TOP, ROW_H_MAX, L.childColW, s.incoming, rejected ? c.danger : c.textMuted, rejected ? 2 : 1);
        if (!rejected) incomingFrame.setAttribute('stroke-dasharray', '4 3');
        if (rejected) {
          rejectMarks = el('g', {}, root);
          // 닿을 줄이 없는 가리킴 — 틈 중간에서 끊기고 가위표로 끝난다
          const from = { x: L.childX + L.tableW, y: L.incomingMid };
          const aim = { x: L.parentX, y: L.rowMid((s.parent.rows.length - 1) / 2) };
          const stub = curveHead(L.curveTo(from, aim), 0.5);
          el('path', { d: curveD(stub), fill: 'none', stroke: c.danger, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, rejectMarks);
          el('circle', { cx: from.x, cy: from.y, r: 3, fill: c.danger }, rejectMarks);
          const end = stub[3];
          const k = 5;
          el('path', { d: `M${r2(end.x - k)},${r2(end.y - k)} L${r2(end.x + k)},${r2(end.y + k)} M${r2(end.x - k)},${r2(end.y + k)} L${r2(end.x + k)},${r2(end.y - k)}`, stroke: c.danger, 'stroke-width': 2 }, rejectMarks);
        }
      }

      el('text', { x: L.W / 2, y: CAPTION_Y, 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md }, root, captionOf(s));

      return { currentLink, currentArrow, targetMark, incoming, incomingFrame, rejectMarks, tokenLayer };
    }

    /** 값의 사본이 곡선을 따라 건너가 닿는다 — 원본 칸은 제자리에 남는다 */
    async function animateReach(s: ForeignKeyPointsScene, mine: number, order: number, customer: number): Promise<void> {
      const L = layoutOf(s);
      const hd = drawStatic(s);
      const fkAt = s.child.columns.indexOf(s.child.foreignKey.column);
      const row = s.child.rows[order];
      if (row === undefined) throw new Error(`foreign-key-points stage: 주문 줄 ${order} 가 없다`);
      const value = String(row[fkAt]);
      const curve = L.curveTo({ x: L.childX + L.tableW, y: L.rowMid(order) }, { x: L.parentX, y: L.rowMid(customer) });
      const { currentLink, currentArrow, targetMark, tokenLayer } = hd;
      const frame = (p: number) => {
        const k = easeInOut(p);
        const head = curveHead(curve, k);
        currentLink?.setAttribute('d', curveD(head));
        if (p < 1) {
          currentArrow?.setAttribute('opacity', '0');
          targetMark?.setAttribute('opacity', '0');
          drawToken(tokenLayer, head[3], value, c.itemActive);
        } else {
          currentArrow?.removeAttribute('opacity');
          targetMark?.removeAttribute('opacity');
          tokenLayer.textContent = '';
        }
      };
      await clock(FOLLOW_MS, mine, frame);
    }

    /** 들어오려는 줄이 다가가고, 값이 건너가다 닿을 곳이 없어 튕겨 돌아온다 */
    async function animateBounce(s: ForeignKeyPointsScene, mine: number): Promise<void> {
      const L = layoutOf(s);
      const hd = drawStatic(s);
      const fkAt = s.child.columns.indexOf(s.child.foreignKey.column);
      const value = String(s.incoming[fkAt]);
      const aim = { x: L.parentX, y: L.rowMid((s.parent.rows.length - 1) / 2) };
      const { incoming, incomingFrame, rejectMarks, tokenLayer } = hd;
      const frame = (p: number) => {
        // 0 ~ .15 다가감 · .15 ~ .5 건너감 · .5 ~ .8 튕겨 돌아옴 · .8 ~ 1 물러남
        let dy = 0;
        if (p < 0.15) dy = -RISE * easeOut(p / 0.15);
        else if (p < 0.8) dy = -RISE;
        else dy = -RISE * (1 - easeOut((p - 0.8) / 0.2));
        const from = { x: L.childX + L.tableW, y: L.incomingMid + dy };
        const curve = L.curveTo(from, aim);
        if (p >= 1) {
          incoming?.removeAttribute('transform');
          incomingFrame?.setAttribute('stroke', c.danger);
          rejectMarks?.removeAttribute('opacity');
          tokenLayer.textContent = '';
          return;
        }
        incoming?.setAttribute('transform', `translate(0,${r2(dy)})`);
        const settled = p >= 0.8;
        incomingFrame?.setAttribute('stroke', settled ? c.danger : c.textMuted);
        if (settled) rejectMarks?.removeAttribute('opacity');
        else rejectMarks?.setAttribute('opacity', '0');
        if (p < 0.15 || p >= 0.8) {
          tokenLayer.textContent = '';
          return;
        }
        const k = p < 0.5 ? easeInOut((p - 0.15) / 0.35) : 1 - easeOut((p - 0.5) / 0.3);
        drawToken(tokenLayer, curveHead(curve, k)[3], value, p < 0.5 ? c.itemActive : c.danger);
      };
      await clock(REJECT_MS, mine, frame);
    }

    async function render(next: ForeignKeyPointsScene, prev: ForeignKeyPointsScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      const moving = opts.animate && prev !== null && prev.step !== next.step;
      if (!moving || step.kind === 'tables') {
        drawStatic(next);
        return;
      }
      if (step.kind === 'follow') {
        await animateReach(next, mine, step.order, step.customer);
      } else if (step.accepted && step.customer !== null) {
        await animateReach(next, mine, next.child.rows.length - 1, step.customer);
      } else {
        await animateBounce(next, mine);
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
