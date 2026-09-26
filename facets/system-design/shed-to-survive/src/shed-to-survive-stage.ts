/**
 * shed-to-survive 의 무대.
 *
 * 동사: 나눠 가지다 모두 놓친다 / 튕겨 내고 나머지를 산다.
 *   - 위(다 받는 쪽): 한 틱의 힘 막대가 들고 있는 요청 수만큼 조각나 **각 관으로 날아가 쌓인다**. 요청이 늘수록
 *     조각이 가늘어진다. 기한을 넘긴 관의 손님 점은 **관을 떠나 비켜 서고**, 관은 잿빛으로 계속 찬다.
 *   - 아래(거절하는 쪽): 힘 막대가 통째로 한 관으로 날아가 **한 틱 만에 채우고**, 끝난 요청은 끝 줄로 옮겨 간다.
 *     자리가 차 있으면 새 요청은 관 입구까지 갔다가 **곧바로 거절 줄로 튕겨 나간다.**
 *   - 왼쪽 도착 기둥의 같은 요청이 두 서버로 한 벌씩 날아간다 (같은 도착을 두 서버가 받는다).
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { ShedToSurviveScene, SideStep } from './scene';

const H = 440;
const MOTION_MS = 800;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function ease(v: number): number {
  const x = clamp01(v);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
/** p 가 [a, b] 를 지나는 정도 (0..1, 늦춤 곡선) */
function phase(p: number, a: number, b: number): number {
  return ease((p - a) / (b - a));
}
function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

type Box = { x: number; y: number; w: number; h: number };
function lerpBox(a: Box, b: Box, k: number): Box {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
}

export const shedToSurviveStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const XS = parseFloat(fontSizes.xs);
    const SM = parseFloat(fontSizes.sm);
    const MD = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    // ── 자리 (캔버스에서 역산) ──────────────────────────────────────
    const colX = 8;
    const laneX0 = 136;
    const laneW = W - laneX0 - 8;
    const chipW = 24;
    const chipH = 16;
    const colChipX0 = colX + 38;
    const colChipPitch = Math.min(26, (laneX0 - 10 - colChipX0) / 3);

    // 위 — 다 받는 쪽
    const A = { head: 44, cap: 62, barY: 70, barH: 10, chipY: 86, tubeTop: 106, tubeH: 80, val: 200, pip: 210, client: 226 };
    // 아래 — 거절하는 쪽
    const B = { head: 282, cap: 300, barY: 308, barH: 10, chipY: 326, tubeTop: 346, tubeH: 76, doneY: 350, rejY: 386, code: 416 };
    const colTop = 150;
    const colBottom = 272;

    function el(tag: string, attrs: Attrs, parent: Element, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }
    function label(x: number, y: number, s: string, size: number, fill: string, anchor = 'start', weight = 'normal'): void {
      el('text', { x, y, 'font-family': fonts.body, 'font-size': size, fill, 'text-anchor': anchor, 'font-weight': weight }, svg, s);
    }
    function chip(box: Box, id: string, kind: 'plain' | 'ghost' | 'done' | 'reject'): void {
      const fill = kind === 'done' ? c.primary : c.bg;
      const stroke = kind === 'reject' ? c.danger : kind === 'ghost' ? c.ghostOutline : c.text;
      const ink = kind === 'done' ? c.textInverse : kind === 'reject' ? c.danger : kind === 'ghost' ? c.textMuted : c.text;
      const attrs: Attrs = { x: box.x, y: box.y, width: box.w, height: box.h, rx: 3, fill, stroke, 'stroke-width': 1 };
      if (kind === 'ghost') attrs['stroke-dasharray'] = '2 2';
      el('rect', attrs, svg);
      label(box.x + box.w / 2, box.y + box.h / 2 + XS * 0.36, id, XS, ink, 'middle');
    }

    function geometry(scene: ShedToSurviveScene) {
      const ids = scene.base.ids;
      const index = new Map<string, number>();
      ids.forEach((id, i) => index.set(id, i));
      const pitch = laneW / ids.length;
      const tubeW = Math.min(24, pitch * 0.6);
      const groups = scene.base.groups;
      const rowPitch = Math.min(26, (colBottom - colTop - chipH) / Math.max(1, groups.length));
      const colPos = new Map<string, Box>();
      const colRow: number[] = [];
      groups.forEach((g, gi) => {
        const y = colTop + 10 + gi * rowPitch;
        colRow.push(y);
        g.ids.forEach((id, k) => colPos.set(id, { x: colChipX0 + k * colChipPitch, y, w: chipW, h: chipH }));
      });
      const rowX0 = laneX0 + 104;
      const rowPitchX = Math.min(28, (W - 8 - rowX0) / ids.length);
      function at(id: string): number {
        const i = index.get(id);
        if (i === undefined) throw new Error(`shed-to-survive 무대: 모르는 요청 ${id}`);
        return i;
      }
      function colBox(id: string): Box {
        const b = colPos.get(id);
        if (b === undefined) throw new Error(`shed-to-survive 무대: 도착 기둥에 없는 요청 ${id}`);
        return b;
      }
      return {
        pitch,
        tubeW,
        colRow,
        colBox,
        tubeCx: (id: string) => laneX0 + at(id) * pitch + pitch / 2,
        aChip: (id: string): Box => ({ x: laneX0 + at(id) * pitch + pitch / 2 - chipW / 2, y: A.chipY, w: chipW, h: chipH }),
        slotCx: laneX0 + 12,
        bChip: (): Box => ({ x: laneX0 + 12 - chipW / 2, y: B.chipY, w: chipW, h: chipH }),
        doneBox: (i: number): Box => ({ x: rowX0 + i * rowPitchX, y: B.doneY, w: chipW, h: chipH }),
        rejBox: (i: number): Box => ({ x: rowX0 + i * rowPitchX, y: B.rejY, w: chipW, h: chipH }),
        rowX0,
        rowPitchX,
      };
    }

    // ── 문안 ────────────────────────────────────────────────────────
    function list(xs: string[]): string {
      return xs.join(', ');
    }
    function topCaption(scene: ShedToSurviveScene): string {
      if (scene.tick === null) return t('cap.ready', 'Before tick 0 — both servers are empty.');
      if (scene.summary !== null) {
        return t('cap.end', 'Tick {tick} — done in time: accept-all {a} / {total} · shedder {b} / {total}', {
          tick: scene.tick,
          a: scene.summary.accept,
          b: scene.summary.shed,
          total: scene.summary.total,
        });
      }
      return t('cap.tick', 'Tick {tick}', { tick: scene.tick });
    }
    function acceptCaption(s: SideStep): string {
      if (s.finished.length > 0 || s.wasted.length > 0 || s.rejected.length > 0) {
        throw new Error('shed-to-survive 무대: 다 받는 쪽의 끝남 · 헛일 · 거절을 말할 문안이 없다');
      }
      const w = s.split > 0;
      const l = s.left.length > 0;
      const k = s.took.length > 0;
      if (!w && !l && k) return t('capA.take', 'Took {ids}. No work done yet.', { ids: list(s.took) });
      if (w && !l && k) return t('capA.workTake', 'Split the tick {m} ways — 1/{m} each. Took {ids}.', { m: s.split, ids: list(s.took) });
      if (w && l && k) {
        return t('capA.workLeaveTake', 'Split {m} ways — 1/{m} each. Past the deadline, left: {left}. Took {ids}.', {
          m: s.split,
          left: list(s.left),
          ids: list(s.took),
        });
      }
      if (w && l && !k) {
        return t('capA.workLeave', 'Split {m} ways — 1/{m} each, gone clients included. Past the deadline, left: {left}.', {
          m: s.split,
          left: list(s.left),
        });
      }
      if (w && !l && !k) return t('capA.work', 'Split the tick {m} ways — 1/{m} each.', { m: s.split });
      throw new Error('shed-to-survive 무대: 다 받는 쪽의 이 틱을 말할 문안이 없다');
    }
    function shedCaption(s: SideStep, held: number, code: string): string {
      if (s.wasted.length > 0 || s.left.length > 0) throw new Error('shed-to-survive 무대: 거절하는 쪽의 헛일 · 떠남을 말할 문안이 없다');
      const f = s.finished.length > 0;
      const k = s.took.length > 0;
      const rj = s.rejected.length > 0;
      if (s.split > 0 && !f) throw new Error('shed-to-survive 무대: 거절하는 쪽이 끝내지 못한 틱을 말할 문안이 없다');
      if (!f && k && rj) {
        return t('capB.takeReject', 'Took {id}. Turned away at once with {code}: {rejected}.', {
          id: list(s.took),
          code,
          rejected: list(s.rejected),
        });
      }
      if (f && k && rj) {
        return t('capB.finishTakeReject', 'Whole tick, finished: {done}. Took {id}. At once {code}: {rejected}.', {
          done: list(s.finished),
          id: list(s.took),
          code,
          rejected: list(s.rejected),
        });
      }
      if (f && k && !rj) return t('capB.finishTake', 'Whole tick, finished: {done}. Took {id}.', { done: list(s.finished), id: list(s.took) });
      if (!f && k && !rj) return t('capB.take', 'Took {id}.', { id: list(s.took) });
      if (f && !k && !rj && held === 0) return t('capB.finish', 'Whole tick, finished: {done}. Nothing held now.', { done: list(s.finished) });
      if (!f && !k && !rj && held === 0) return t('capB.idle', 'Nothing held — the server sits idle.');
      throw new Error('shed-to-survive 무대: 거절하는 쪽의 이 틱을 말할 문안이 없다');
    }

    // ── 그리기: p = 1 이 정본, p < 1 은 이번 걸음이 아직 못 온 만큼 ──
    function draw(scene: ShedToSurviveScene, p: number): void {
      svg.textContent = '';
      const g = geometry(scene);
      const step = p < 1 ? scene.step : null;
      // 걸음 안의 때
      const pWork = step ? phase(p, 0, 0.4) : 1; // 힘 조각이 날아가 쌓인다
      const pDone = step ? phase(p, 0.3, 0.55) : 1; // 끝난 것이 끝 줄로
      const pLeave = step ? phase(p, 0.42, 0.62) : 1; // 손님이 떠난다
      const pArrive = step ? phase(p, 0.6, 1) : 1; // 도착
      const pMouth = step ? phase(p, 0.6, 0.8) : 1; // 거절될 것이 입구까지
      const pBounce = step ? phase(p, 0.8, 1) : 1; // 튕겨 나간다

      label(colX, 20, topCaption(scene), MD, c.text, 'start', '600');

      // ── 도착 기둥 ──
      label(colX, colTop, t('label.arrivals', 'Arrivals'), SM, c.textMuted, 'start', '600');
      scene.base.groups.forEach((grp, gi) => {
        const y = g.colRow[gi];
        if (y === undefined) throw new Error('shed-to-survive 무대: 도착 줄 자리가 없다');
        label(colX, y + chipH / 2 + XS * 0.36, t('label.row', 'Tick {tick}', { tick: grp.tick }), XS, c.textMuted);
        for (const id of grp.ids) chip(g.colBox(id), id, scene.arrived.includes(id) ? 'ghost' : 'plain');
      });

      // ── 위: 다 받는 쪽 ──
      const counts = scene.counts;
      label(laneX0, A.head, t('label.accept', 'Accepts everything'), SM, c.text, 'start', '600');
      if (counts !== null) {
        label(W - 8, A.head, t('tally.accept', 'Held: {held} · Done: {ok} · Left: {gone}', counts.accept), SM, c.text, 'end');
      }
      if (scene.step !== null) label(laneX0, A.cap, acceptCaption(scene.step.accept), SM, c.textMuted);

      // 힘 막대 — 이 틱에 실제로 나눈 수 (캡션과 같은 수). 조각은 막대에서 떼어 낸 한 벌이 관으로 날아간다
      const aSplit = scene.step === null ? 0 : scene.step.accept.split;
      drawPowerBar(A.barY, A.barH, aSplit);
      if (step && step.accept.split > 0 && pWork < 1) {
        const m = step.accept.split;
        step.accept.worked.forEach((wk, i) => {
          const from: Box = { x: laneX0 + (i * laneW) / m + 1, y: A.barY, w: laneW / m - 2, h: A.barH };
          const cx = g.tubeCx(wk.id);
          const to: Box = {
            x: cx - g.tubeW / 2,
            y: A.tubeTop + A.tubeH * (1 - wk.done),
            w: g.tubeW,
            h: A.tubeH * (wk.done - wk.was),
          };
          const b = lerpBox(from, to, pWork);
          el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: c.accent, stroke: c.stateInk, 'stroke-width': 0.5 }, svg);
        });
      }
      if (aSplit > 0) {
        label(laneX0 - 8, A.barY + A.barH - 1, t('label.share', 'Share: 1/{n}', { n: aSplit }), XS, c.text, 'end');
      } else {
        label(laneX0 - 8, A.barY + A.barH - 1, t('label.idle', 'Idle'), XS, c.textMuted, 'end');
      }

      // 관
      for (const row of scene.accept) {
        const took = step !== null && step.accept.took.includes(row.id);
        if (took && pArrive < 1) continue;
        const cx = g.tubeCx(row.id);
        const worked = step?.accept.worked.find((w) => w.id === row.id);
        const done = worked !== undefined && pWork < 1 ? worked.was : row.done;
        const leaving = step !== null && step.accept.left.includes(row.id);
        const isGone = row.state === 'gone' || row.state === 'wasted';
        const shownGone = isGone && !(leaving && pLeave < 1);
        drawTube(cx, A.tubeTop, A.tubeH, g.tubeW, done, shownGone);
        chip(g.aChip(row.id), row.id, shownGone ? 'ghost' : 'plain');
        label(cx, A.val, done.toFixed(2), XS, shownGone ? c.textMuted : c.text, 'middle');
        drawPips(cx, A.pip, row.age, scene.base.deadline);
        const k = leaving ? pLeave : isGone ? 1 : 0;
        drawClient(cx + 10 * k, A.client + 8 * k, k >= 1);
      }
      // 도착하는 한 벌
      if (step && pArrive < 1) {
        for (const id of step.accept.took) chip(lerpBox(g.colBox(id), g.aChip(id), pArrive), id, 'plain');
      }

      // ── 아래: 거절하는 쪽 ──
      label(laneX0, B.head, t('label.shed', 'Sheds load — limit: {limit}', { limit: scene.base.limit }), SM, c.text, 'start', '600');
      if (counts !== null) {
        label(W - 8, B.head, t('tally.shed', 'Held: {held} · Done: {ok} · Rejected: {rej}', counts.shed), SM, c.text, 'end');
      }
      if (scene.step !== null) label(laneX0, B.cap, shedCaption(scene.step.shed, scene.shed.holding.length, scene.base.code), SM, c.textMuted);

      const bSplit = scene.step === null ? 0 : scene.step.shed.split;
      drawPowerBar(B.barY, B.barH, bSplit);
      if (bSplit > 0) {
        label(laneX0 - 8, B.barY + B.barH - 1, t('label.share', 'Share: 1/{n}', { n: bSplit }), XS, c.text, 'end');
      } else {
        label(laneX0 - 8, B.barY + B.barH - 1, t('label.idle', 'Idle'), XS, c.textMuted, 'end');
      }

      // 자리 (한도 칸)
      const slotW = g.tubeW;
      el('rect', { x: g.slotCx - slotW / 2 - 4, y: B.chipY - 4, width: slotW + 8, height: B.tubeTop + B.tubeH - B.chipY + 8, rx: 4, fill: 'none', stroke: c.border, 'stroke-width': 1 }, svg);
      // 이번 틱에 일한 것 (끝나 나가기 전까지 자리에 있다)
      const bWorked = step ? step.shed.worked : [];
      let slotDrawn = false;
      if (step && bWorked.length > 0 && pDone < 1) {
        slotDrawn = true;
        const m = step.shed.split;
        bWorked.forEach((wk, i) => {
          const fill = pWork < 1 ? wk.was : wk.done;
          drawTube(g.slotCx, B.tubeTop, B.tubeH, slotW, fill, false);
          if (pWork < 1) {
            const from: Box = { x: laneX0 + (i * laneW) / m + 1, y: B.barY, w: laneW / m - 2, h: B.barH };
            const to: Box = { x: g.slotCx - slotW / 2, y: B.tubeTop + B.tubeH * (1 - wk.done), w: slotW, h: B.tubeH * (wk.done - wk.was) };
            const b = lerpBox(from, to, pWork);
            el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: c.accent, stroke: c.stateInk, 'stroke-width': 0.5 }, svg);
          }
          if (!step.shed.finished.includes(wk.id)) throw new Error('shed-to-survive 무대: 끝나지 않은 일을 그릴 자리가 없다');
        });
      }
      // 틱 끝에 들고 있는 것
      for (const row of scene.shed.holding) {
        const took = step !== null && step.shed.took.includes(row.id);
        if (took && pArrive < 1) continue;
        if (slotDrawn) throw new Error('shed-to-survive 무대: 한 자리에 둘을 그리려 한다');
        slotDrawn = true;
        drawTube(g.slotCx, B.tubeTop, B.tubeH, slotW, row.done, row.state === 'gone');
        chip(g.bChip(), row.id, 'plain');
      }
      if (!slotDrawn) {
        drawTube(g.slotCx, B.tubeTop, B.tubeH, slotW, 0, false);
      }

      // 끝 줄
      label(g.rowX0 - 8, B.doneY + chipH / 2 + XS * 0.36, t('label.doneRow', 'Done'), XS, c.textMuted, 'end');
      scene.shed.finished.forEach((id, i) => {
        const moving = step !== null && step.shed.finished.includes(id);
        if (moving && pDone < 1) {
          const inSlot = pWork < 1;
          if (inSlot) {
            chip(g.bChip(), id, 'plain');
          } else {
            chip(lerpBox(g.bChip(), g.doneBox(i), pDone), id, 'done');
          }
          return;
        }
        chip(g.doneBox(i), id, 'done');
      });

      // 거절 줄
      label(g.rowX0 - 8, B.rejY + chipH / 2 + XS * 0.36, t('label.rejectRow', 'Rejected'), XS, c.textMuted, 'end');
      scene.shed.rejected.forEach((id, i) => {
        const bouncing = step !== null && step.shed.rejected.includes(id);
        const home = g.rejBox(i);
        if (bouncing && pBounce < 1) {
          const mouth: Box = { x: g.slotCx - chipW / 2, y: B.chipY, w: chipW, h: chipH };
          const b = pMouth < 1 ? lerpBox(g.colBox(id), mouth, pMouth) : lerpBox(mouth, home, pBounce);
          chip(b, id, pMouth < 1 ? 'plain' : 'reject');
          if (pMouth >= 1) label(b.x + chipW / 2, b.y + chipH + XS + 1, scene.base.code, XS, c.danger, 'middle', '600');
          return;
        }
        chip(home, id, 'reject');
        label(home.x + chipW / 2, B.code, scene.base.code, XS, c.danger, 'middle', '600');
      });
      // 자리로 들어오는 것
      if (step && pArrive < 1) {
        for (const id of step.shed.took) chip(lerpBox(g.colBox(id), g.bChip(), pArrive), id, 'plain');
      }
    }

    function drawPowerBar(y: number, h: number, split: number): void {
      el('rect', { x: laneX0, y, width: laneW, height: h, rx: 2, fill: 'none', stroke: c.border, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, svg);
      if (split <= 0) return;
      for (let i = 0; i < split; i += 1) {
        el('rect', { x: laneX0 + (i * laneW) / split + 1, y, width: laneW / split - 2, height: h, fill: c.accent, stroke: c.stateInk, 'stroke-width': 0.5 }, svg);
      }
    }
    function drawTube(cx: number, top: number, h: number, w: number, done: number, gone: boolean): void {
      const fh = h * done;
      if (fh > 0) el('rect', { x: cx - w / 2, y: top + h - fh, width: w, height: fh, fill: gone ? c.textMuted : c.accent }, svg);
      const attrs: Attrs = { x: cx - w / 2, y: top, width: w, height: h, fill: 'none', stroke: gone ? c.textMuted : c.text, 'stroke-width': 1 };
      if (gone) attrs['stroke-dasharray'] = '3 2';
      el('rect', attrs, svg);
    }
    function drawPips(cx: number, y: number, age: number, deadline: number): void {
      const gap = 6;
      const x0 = cx - ((deadline - 1) * gap) / 2;
      for (let i = 0; i < deadline; i += 1) {
        const on = i < age;
        el('circle', { cx: x0 + i * gap, cy: y, r: 2, fill: on ? c.danger : 'none', stroke: on ? c.danger : c.ghostOutline, 'stroke-width': 1 }, svg);
      }
    }
    function drawClient(x: number, y: number, gone: boolean): void {
      const attrs: Attrs = { cx: x, cy: y, r: 4, fill: gone ? 'none' : c.text, stroke: gone ? c.ghostOutline : c.text, 'stroke-width': 1 };
      if (gone) attrs['stroke-dasharray'] = '2 1.5';
      el('circle', attrs, svg);
    }

    function play(ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let start: number | null = null;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const onFrame = (now: number): void => {
          if (destroyed) return wake();
          if (start === null) start = now;
          const p = Math.min(1, (now - start) / ms);
          frame(p);
          if (p >= 1) return wake();
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            onFrame(n);
          });
          frames.add(id);
        };
        const id0 = requestAnimationFrame((n) => {
          frames.delete(id0);
          onFrame(n);
        });
        frames.add(id0);
      });
    }

    async function render(next: ShedToSurviveScene, prev: ShedToSurviveScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      if (!opts.animate || prev === null || next.step === null) {
        draw(next, 1);
        return;
      }
      draw(next, 0);
      await play(MOTION_MS, (p) => {
        if (mine !== gen || destroyed) return;
        draw(next, p);
      });
      if (mine !== gen || destroyed) return;
      draw(next, 1);
    }

    return {
      render,
      destroy(): void {
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
