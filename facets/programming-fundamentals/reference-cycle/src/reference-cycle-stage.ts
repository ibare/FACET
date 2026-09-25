/**
 * reference-cycle 무대 — 서로 붙든 채 남는 두 객체.
 *
 * 가리킴 하나 = 화살 하나 = 객체 밑의 표 하나. 객체의 수는 그 표의 개수다.
 * 가리킴이 생기면 표가 화살을 타고 객체로 건너가고, 놓이면 화살이 거둬지며 표가
 * 제 자리(이름 칸 · 필드)로 돌아간다.
 *
 * 상자는 제자리에 선다. 이름이 모두 놓으면 이름의 표만 빠지고, 두 객체는 서로의 화살과
 * 표 하나씩을 붙든 채 수 1 에서 멈춘다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { RcHolder, RcVal } from './algorithm.js';
import type { RcSceneObj, ReferenceCycleScene } from './scene.js';

const H = 320;
const W = PIECE_CANVAS_W;
const PAD = 16;
const TOP = 48;
const MOVE_MS = 400;
const FRAME_MS = 16;

const CODE_PX = parseFloat(fontSizes.sm);
const CODE_CH = CODE_PX * 0.6;
const PILL_PX = parseFloat(fontSizes.xs);
const PILL_CH = PILL_PX * 0.6;
const TITLE_PX = parseFloat(fontSizes.md);

const CELL_W = 40;
const CELL_H = 26;
const OBJ_W = 104;
const FIELD_ROW = 18;
const OBJ_HEAD = 26;
const LOOP_ROOM = 64;
const PILL_H = 18;
const BADGE_R = 12;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

function rd(n: number): string {
  const v = Math.round(n * 10) / 10;
  return String(Object.is(v, -0) ? 0 : v);
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function holderLabel(h: RcHolder): string {
  return h.kind === 'name' ? h.name : `${h.obj}.${h.field}`;
}

function holderKey(h: RcHolder): string {
  return h.kind === 'name' ? `n:${h.name}` : `f:${h.obj}.${h.field}`;
}

function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const s = i / n;
    const a = (1 - s) ** 3;
    const b = 3 * (1 - s) ** 2 * s;
    const c = 3 * (1 - s) * s * s;
    const d = s ** 3;
    pts.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y });
  }
  return pts;
}

/** 이번 걸음이 무엇을 바꿨는가 — 장면의 step 에서만 읽는다. */
type Motion = {
  holds: { obj: string; by: RcHolder }[];
  releases: { obj: string; by: RcHolder; at: number }[];
  created: Set<string>;
  gone: Set<string>;
};

function motionOf(scene: ReferenceCycleScene): Motion {
  const m: Motion = { holds: [], releases: [], created: new Set(), gone: new Set() };
  const step = scene.step;
  if (step.kind !== 'line' && step.kind !== 'reclaim') return m;
  for (const c of step.changes) {
    if (c.op === 'hold') m.holds.push({ obj: c.obj, by: c.by });
    else if (c.op === 'release') m.releases.push({ obj: c.obj, by: c.by, at: c.at });
    else if (c.op === 'create') m.created.add(c.obj);
    else if (c.op === 'gone') m.gone.add(c.obj);
  }
  return m;
}

function hasMotion(m: Motion): boolean {
  return m.holds.length + m.releases.length + m.created.size + m.gone.size > 0;
}

/** 이번 걸음 앞의 가리킴 목록 — 뒤 목록에서 이번 hold 를 빼고 release 를 제자리에 되돌린다. */
function holdersBefore(o: RcSceneObj, m: Motion): RcHolder[] {
  const list = [...o.holders];
  for (const h of [...m.holds].reverse()) {
    if (h.obj !== o.id) continue;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (holderKey(list[i]) === holderKey(h.by)) {
        list.splice(i, 1);
        break;
      }
    }
  }
  for (const r of [...m.releases].reverse()) {
    if (r.obj !== o.id) continue;
    list.splice(Math.min(r.at, list.length), 0, r.by);
  }
  return list;
}

export const referenceCycleStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const [nameColor, fieldColor] = categorical(2);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? rd(v) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    // --- 자리: 캔버스와 바탕에서 셈한다
    function layout(scene: ReferenceCycleScene) {
      const codeX = PAD + 14;
      const codeW = Math.max(0, ...scene.lines.map((l) => (l.indent * 4 + l.text.length) * CODE_CH));
      const labelW = Math.max(0, ...scene.names.map((n) => n.length * CODE_CH));
      const cellX = codeX + codeW + 28 + labelW + 6;
      const farX = W - PAD - LOOP_ROOM - OBJ_W;
      const objX = cellX + CELL_W + Math.max(48, (farX - cellX - CELL_W) / 2);
      const bottom = H - 58;
      const rows = Math.max(2, scene.names.length, scene.objs.length);
      const rowStep = Math.min(112, (bottom - TOP) / rows);
      const lineH = Math.min(24, (bottom - TOP) / Math.max(1, scene.lines.length));
      return { codeX, cellX, objX, rowStep, lineH };
    }

    function objH(o: RcSceneObj): number {
      return OBJ_HEAD + o.fields.length * FIELD_ROW + 4;
    }

    function draw(scene: ReferenceCycleScene, uRaw: number): void {
      svg.textContent = '';
      if (scene.lines.length === 0) return;
      const u = ease(uRaw);
      const m = motionOf(scene);
      const L = layout(scene);

      // 코드
      const codeLayer = el('g', {}, svg);
      scene.lines.forEach((ln, i) => {
        const y = TOP + i * L.lineH;
        if (scene.current === i) {
          el('rect', { x: PAD, y: y + 2, width: L.codeX - PAD + ln.indent * 4 * CODE_CH + ln.text.length * CODE_CH + 8, height: L.lineH - 4, rx: 3, fill: colors.bgSubtle }, codeLayer);
          el('path', { d: `M ${rd(PAD + 2)} ${rd(y + L.lineH / 2 - 5)} l 7 5 l -7 5 z`, fill: colors.primary }, codeLayer);
        }
        el(
          'text',
          {
            x: L.codeX + ln.indent * 4 * CODE_CH,
            y: y + L.lineH / 2 + CODE_PX * 0.35,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: scene.current === i ? colors.text : colors.textMuted,
          },
          codeLayer,
          ln.text,
        );
      });

      // 머리말
      el('text', { x: L.cellX, y: TOP - 18, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, svg, t('label.stack', 'Stack'));
      el('text', { x: L.objX, y: TOP - 18, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, svg, t('label.heap', 'Heap'));

      // 이름 칸
      const cellPos = new Map<string, Pt>();
      const cellLayer = el('g', {}, svg);
      scene.cells.forEach((cell, j) => {
        const y = TOP + j * L.rowStep + (OBJ_HEAD + FIELD_ROW + 4 - CELL_H) / 2;
        cellPos.set(cell.name, { x: L.cellX + CELL_W / 2, y: y + CELL_H / 2 });
        el('text', { x: L.cellX - 6, y: y + CELL_H / 2 + CODE_PX * 0.35, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text }, cellLayer, cell.name);
        el('rect', { x: L.cellX, y, width: CELL_W, height: CELL_H, rx: 3, fill: colors.bg, stroke: colors.border }, cellLayer);
        drawVal(cell.value, { x: L.cellX + CELL_W / 2, y: y + CELL_H / 2 }, nameColor, cellLayer);
      });

      // 객체 자리 — 만든 차례로 한 줄씩, 제자리
      const before = new Map<string, RcHolder[]>();
      const boxes = new Map<string, { x: number; y: number; h: number; alpha: number }>();
      scene.objs.forEach((o, i) => {
        before.set(o.id, holdersBefore(o, m));
        const y0 = TOP + i * L.rowStep;
        if (o.gone && !m.gone.has(o.id)) return;
        if (m.gone.has(o.id)) {
          boxes.set(o.id, { x: L.objX, y: y0, h: objH(o), alpha: 1 - u });
        } else if (m.created.has(o.id)) {
          boxes.set(o.id, { x: L.objX, y: y0 + (1 - u) * 14, h: objH(o), alpha: u });
        } else {
          boxes.set(o.id, { x: L.objX, y: y0, h: objH(o), alpha: 1 });
        }
      });
      if (uRaw >= 1) for (const id of m.gone) boxes.delete(id);

      function slotPt(objId: string, field: string): Pt | null {
        const b = boxes.get(objId);
        const o = scene.objs.find((x) => x.id === objId);
        if (!b || !o) return null;
        const j = o.fields.findIndex((f) => f.name === field);
        if (j < 0) return null;
        return { x: b.x + OBJ_W - 25, y: b.y + OBJ_HEAD + j * FIELD_ROW + FIELD_ROW / 2 - 4 };
      }

      function sourcePt(h: RcHolder): Pt | null {
        return h.kind === 'name' ? cellPos.get(h.name) ?? null : slotPt(h.obj, h.field);
      }

      function arrowPath(h: RcHolder, target: string): Pt[] | null {
        const s = sourcePt(h);
        const b = boxes.get(target);
        if (!s || !b) return null;
        if (h.kind === 'name') {
          const e = { x: b.x, y: b.y + b.h / 2 };
          return bezier(s, { x: s.x + 40, y: s.y }, { x: e.x - 40, y: e.y }, e, 24);
        }
        const src = boxes.get(h.obj);
        const e = { x: b.x + OBJ_W, y: b.y + 20 };
        const reach = Math.max(e.x, (src?.x ?? b.x) + OBJ_W) + (e.y < s.y ? LOOP_ROOM - 8 : 34);
        return bezier(s, { x: reach, y: s.y }, { x: reach, y: e.y }, e, 24);
      }

      // 화살 — 가리킴 하나에 하나. 새 가리킴은 자라고, 놓인 가리킴은 거둬진다
      const arrowLayer = el('g', { fill: 'none', 'stroke-width': 1.6 }, svg);
      function drawArrow(pts: Pt[], frac: number, color: string, alpha: number): void {
        if (frac <= 0.001) return;
        const n = Math.max(1, Math.round((pts.length - 1) * frac));
        const part = pts.slice(0, n + 1);
        const g = el('g', alpha < 1 ? { opacity: alpha } : {}, arrowLayer);
        el('polyline', { points: part.map((p) => `${rd(p.x)},${rd(p.y)}`).join(' '), stroke: color }, g);
        const tip = part[part.length - 1];
        const prevPt = part[Math.max(0, part.length - 2)];
        const ang = Math.atan2(tip.y - prevPt.y, tip.x - prevPt.x);
        const a1 = { x: tip.x - 8 * Math.cos(ang - 0.4), y: tip.y - 8 * Math.sin(ang - 0.4) };
        const a2 = { x: tip.x - 8 * Math.cos(ang + 0.4), y: tip.y - 8 * Math.sin(ang + 0.4) };
        el('path', { d: `M ${rd(tip.x)} ${rd(tip.y)} L ${rd(a1.x)} ${rd(a1.y)} L ${rd(a2.x)} ${rd(a2.y)} z`, fill: color, stroke: 'none' }, g);
      }
      const colorOf = (h: RcHolder): string => (h.kind === 'name' ? nameColor : fieldColor);
      for (const o of scene.objs) {
        const b = boxes.get(o.id);
        if (!b) continue;
        for (const h of o.holders) {
          const pts = arrowPath(h, o.id);
          if (!pts) continue;
          const fresh = m.holds.some((x) => x.obj === o.id && holderKey(x.by) === holderKey(h));
          drawArrow(pts, fresh ? u : 1, colorOf(h), b.alpha);
        }
        for (const r of m.releases) {
          if (r.obj !== o.id) continue;
          const pts = arrowPath(r.by, o.id);
          if (pts) drawArrow(pts, 1 - u, colorOf(r.by), 1);
        }
      }

      // 객체 상자
      const objLayer = el('g', {}, svg);
      const pillLayer = el('g', {}, svg);
      for (const o of scene.objs) {
        const b = boxes.get(o.id);
        if (!b) continue;
        const g = el('g', b.alpha < 1 ? { opacity: b.alpha } : {}, objLayer);
        el('rect', { x: b.x, y: b.y, width: OBJ_W, height: b.h, rx: 5, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.4 }, g);
        el('text', { x: b.x + 10, y: b.y + 18, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: colors.text }, g, o.id);
        el('text', { x: b.x + 10 + o.id.length * TITLE_PX * 0.6 + 6, y: b.y + 18, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted }, g, o.type);
        o.fields.forEach((f, j) => {
          const ry = b.y + OBJ_HEAD + j * FIELD_ROW;
          el('text', { x: b.x + 10, y: ry + FIELD_ROW / 2, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text }, g, f.name);
          el('rect', { x: b.x + OBJ_W - 42, y: ry - 4, width: 34, height: FIELD_ROW - 2, rx: 3, fill: colors.bgSubtle, stroke: colors.border }, g);
          drawVal(f.value, { x: b.x + OBJ_W - 25, y: ry + FIELD_ROW / 2 - 4 }, fieldColor, g);
        });

        // 수 — 표의 개수. 흐르는 도중 절반까지는 앞 수
        const hb = before.get(o.id) ?? o.holders;
        const shown = m.created.has(o.id) && uRaw < 0.5 ? 0 : uRaw < 0.5 ? hb.length : o.holders.length;
        el('circle', { cx: b.x + OBJ_W, cy: b.y, r: BADGE_R, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.4 }, g);
        el('text', { x: b.x + OBJ_W, y: b.y + TITLE_PX * 0.35, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: colors.text }, g, String(shown));

        // 표 — 누가 붙들고 있는가
        const py = b.y + b.h + 8;
        const slotX = (list: readonly RcHolder[], k: number): number => {
          let x = b.x;
          for (let i = 0; i < k; i += 1) x += holderLabel(list[i]).length * PILL_CH + 12 + 4;
          return x;
        };
        const drawPill = (h: RcHolder, x: number, y: number, alpha: number): void => {
          const label = holderLabel(h);
          const w = label.length * PILL_CH + 12;
          const pg = el('g', alpha < 1 ? { opacity: alpha } : {}, pillLayer);
          el('rect', { x, y, width: w, height: PILL_H, rx: PILL_H / 2, fill: colors.bg, stroke: colorOf(h), 'stroke-width': 1.4 }, pg);
          el('text', { x: x + w / 2, y: y + PILL_H / 2 + PILL_PX * 0.35, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.text }, pg, label);
        };
        o.holders.forEach((h, k) => {
          const toX = slotX(o.holders, k);
          const fresh = m.holds.some((x) => x.obj === o.id && holderKey(x.by) === holderKey(h));
          if (fresh) {
            const s = sourcePt(h) ?? { x: toX, y: py };
            drawPill(h, lerp(s.x, toX, u), lerp(s.y - PILL_H / 2, py, u), b.alpha);
            return;
          }
          const k0 = hb.findIndex((x) => holderKey(x) === holderKey(h));
          const fromX = k0 >= 0 ? slotX(hb, k0) : toX;
          drawPill(h, lerp(fromX, toX, u), py, b.alpha);
        });
        for (const r of m.releases) {
          if (r.obj !== o.id || uRaw >= 1) continue;
          const fromX = slotX(hb, Math.min(r.at, hb.length - 1));
          const s = sourcePt(r.by) ?? { x: fromX, y: py };
          drawPill(r.by, lerp(fromX, s.x, u), lerp(py, s.y - PILL_H / 2, u), 1 - u);
        }
      }

      // 캡션과 셈
      const capY = H - 34;
      el('text', { x: PAD, y: capY, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text }, svg, caption(scene));
      const pointing = scene.cells.filter((c) => c.value !== null && c.value.k === 'ref').length;
      const gone = scene.objs.filter((o) => o.gone).length;
      el(
        'text',
        { x: PAD, y: capY + 22, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
        svg,
        t('label.status', 'Names pointing at an object: {names} · Objects reclaimed: {gone}', { names: pointing, gone }),
      );
    }

    function drawVal(v: RcVal | null, c: Pt, color: string, parent: Element): void {
      if (v === null) return;
      if (v.k === 'ref') {
        el('circle', { cx: c.x, cy: c.y, r: 4, fill: color }, parent);
        return;
      }
      el(
        'text',
        { x: c.x, y: c.y + PILL_PX * 0.35, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted },
        parent,
        v.k === 'null' ? 'null' : String(v.n),
      );
    }

    function countOf(scene: ReferenceCycleScene, id: string): number {
      return scene.objs.find((o) => o.id === id)?.holders.length ?? 0;
    }

    function caption(scene: ReferenceCycleScene): string {
      const step = scene.step;
      if (step.kind === 'start') return t('caption.start', 'Start. No line has run yet; the name cells are empty.');
      if (step.kind === 'reclaim') return t('caption.reclaim', 'Count reached 0 — reclaimed: {obj}', { obj: step.obj });
      if (step.kind !== 'line') return '';
      const created = step.changes.find((c) => c.op === 'create');
      const hold = step.changes.find((c) => c.op === 'hold');
      const release = step.changes.find((c) => c.op === 'release');
      if (created && hold && hold.op === 'hold' && hold.obj === created.obj) {
        return t('caption.create', 'New object {obj}. {by} → {obj}. Count of {obj}: {n}', {
          obj: hold.obj,
          by: holderLabel(hold.by),
          n: countOf(scene, hold.obj),
        });
      }
      if (hold && hold.op === 'hold') {
        return t('caption.hold', '{by} → {obj}. Count of {obj}: {n}', {
          obj: hold.obj,
          by: holderLabel(hold.by),
          n: countOf(scene, hold.obj),
        });
      }
      if (release && release.op === 'release') {
        return t('caption.release', 'Let go: {by} → {obj}. Count of {obj}: {n}', {
          obj: release.obj,
          by: holderLabel(release.by),
          n: countOf(scene, release.obj),
        });
      }
      return t('caption.line', 'Ran: {code}', { code: scene.lines[step.line]?.text ?? '' });
    }

    return {
      render(next: ReferenceCycleScene, prev: ReferenceCycleScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || prev === null || !hasMotion(motionOf(next))) {
          draw(next, 1);
          return;
        }
        draw(next, 0);
        return new Promise<void>((resolve) => {
          const done = (): void => {
            waiters.delete(done);
            resolve();
          };
          waiters.add(done);
          const t0 = Date.now();
          const tick = (): void => {
            if (destroyed || mine !== gen) {
              done();
              return;
            }
            const u = Math.min(1, (Date.now() - t0) / MOVE_MS);
            if (u >= 1) {
              draw(next, 1);
              done();
              return;
            }
            draw(next, u);
            const id = setTimeout(() => {
              timers.delete(id);
              tick();
            }, FRAME_MS);
            timers.add(id);
          };
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        });
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
