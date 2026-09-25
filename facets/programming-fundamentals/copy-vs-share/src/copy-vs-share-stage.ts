/**
 * copy-vs-share-stage — 부른 쪽 틀과 불린 쪽 틀, 그리고 자리 밖의 목록.
 *
 * 움직임은 **건너감**이다. 틀은 둘을 넘지 않는다.
 *  - 수 · 칸 판: 값을 베낀 조각이 출발점(level 의 자리 · 목록의 칸)에서 들려 나와 불린 쪽 x 로 날아가고,
 *    돌아올 때 틀과 함께 줄어 사라진다.
 *  - 목록 판: 주소 조각이 부른 쪽 cells 자리에서 불린 쪽으로 건너가고, 불린 쪽 cells 에서 주소 화살이
 *    뻗어 **같은 목록**에 닿는다. 몸이 쓰면 그 칸의 막대가 자란다. 돌아올 때 화살만 거둬진다.
 *  - 판이 바뀌면 부른 쪽 자리의 모양이 값 상자 ↔ 주소 화살로 바뀌고, 막대는 앞 판의 높이에서 처음 값으로 줄어든다.
 *
 * 운동 길이는 projector 가 `runtime.getSpeed()` 를 그때그때 읽어 `dur` 로 넘긴다.
 * 화면의 이름(`level` · `cells` · `x` · 함수 이름)은 IR 의 식별자 그대로다 — 여섯 언어에서 글자가 같아 번역하지 않는다.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type CopyVsSharePass = 'number' | 'list' | 'cell';

export type CopyVsShareStage = ViewInstance & {
  showRun(p: { pass: CopyVsSharePass; level: number; cells: number[]; at: number; callerValue: number }, dur: number): void;
  showCall(p: { pass: CopyVsSharePass; n: number; times: number; copied: number | null }, dur: number): void;
  showWrite(p: { pass: CopyVsSharePass; from: number; to: number; cells: number[]; callerValue: number }, dur: number): void;
  showReturn(p: { pass: CopyVsSharePass; lost: number | null; cells: number[]; callerValue: number }, dur: number): void;
  showRead(p: { pass: CopyVsSharePass; value: number }, dur: number): void;
  clear(): void;
};

// IR 식별자 — 코드 패널과 같은 글자. C10 판정 3 — 코드 표기라 messages 로 옮기지 않는다
const ID = {
  level: 'level',
  cells: 'cells',
  x: 'x',
  passNumber: 'passNumber',
  passList: 'passList',
  passCell: 'passCell',
  addOne: 'addOne',
  addOneAt: 'addOneAt',
} as const;

const W = 720;
const H = 384;

// 틀 둘과 자리 밖
const CALLER = { x: 24, y: 44, w: 220, h: 112 };
const CALLEE = { x: 476, y: 44, w: 220, h: 112 };
const SLOT_W = 64;
const SLOT_H = 40;
const CALLER_SLOT = { x: 118, y: 90 };
const CALLEE_SLOT = { x: 570, y: 90 };
const LIST = { x: 250, y: 180, w: 220, h: 138 };
const BAR_W = 40;
const BASE_Y = 294;
const UNIT = 6; // 막대 높이 — 값 1 에 6px. 값 최대 11 (목록 판 k = 4) 이면 66px
const CAPTION_Y = 348;
const READOUT_Y = 372;

const SVG_NS = 'http://www.w3.org/2000/svg';

export const copyVsShareStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    void container;
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);
    const mdPx = parseFloat(fontSizes.md);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (s: string, attrs: Record<string, string | number>, parent: Element = svg): SVGTextElement => {
      const node = el('text', { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...attrs }, parent);
      node.textContent = s;
      return node;
    };
    /** transform 을 운동 없이 곧장 놓는다. */
    const place = (node: SVGElement, tf: string, opacity?: number) => {
      node.style.transition = 'none';
      node.style.transform = tf;
      if (opacity !== undefined) node.style.opacity = String(opacity);
      void node.getBoundingClientRect();
    };
    /** transform (과 opacity) 를 dur 동안 옮긴다. */
    const move = (node: SVGElement, tf: string, dur: number, opacity?: number) => {
      node.style.transition = `transform ${dur}ms ease-in-out, opacity ${dur}ms ease-in-out`;
      node.style.transform = tf;
      if (opacity !== undefined) node.style.opacity = String(opacity);
    };
    const shiftTo = (x: number, y: number, s = 1) => `translate(${x}px, ${y}px) scale(${s})`;

    // ── 배경 · 틀 ─────────────────────────────────────────────
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg });

    text(t('label.caller', 'caller'), { x: CALLER.x, y: CALLER.y - 10, fill: c.textMuted });
    el('rect', {
      x: CALLER.x, y: CALLER.y, width: CALLER.w, height: CALLER.h, rx: 8,
      fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1.5,
    });
    const callerTitle = text('', {
      x: CALLER.x + 14, y: CALLER.y + 22, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600,
    });

    text(t('label.callee', 'callee'), { x: CALLEE.x, y: CALLEE.y - 10, fill: c.textMuted });
    // 불린 쪽 틀 — 부를 때 열리고 돌아올 때 닫힌다 (가운데를 축으로 커지고 줄어든다)
    const calleeFrame = el('g', {});
    calleeFrame.style.transformOrigin = `${CALLEE.x + CALLEE.w / 2}px ${CALLEE.y + CALLEE.h / 2}px`;
    el('rect', {
      x: CALLEE.x, y: CALLEE.y, width: CALLEE.w, height: CALLEE.h, rx: 8,
      fill: c.bgSubtle, stroke: c.primary, 'stroke-width': 1.5,
    }, calleeFrame);
    const calleeTitle = text('', {
      x: CALLEE.x + 14, y: CALLEE.y + 22, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600,
    }, calleeFrame);
    const calleeName = text('', {
      x: CALLEE_SLOT.x - 12, y: CALLEE_SLOT.y + SLOT_H / 2 + smPx / 3, 'text-anchor': 'end', 'font-family': fonts.mono,
    }, calleeFrame);
    el('rect', {
      x: CALLEE_SLOT.x, y: CALLEE_SLOT.y, width: SLOT_W, height: SLOT_H, rx: 4,
      fill: c.bg, stroke: c.textMuted, 'stroke-dasharray': '3 3',
    }, calleeFrame);
    place(calleeFrame, 'scale(0)', 0);

    // 건너가는 길 — 두 틀 사이
    el('line', {
      x1: CALLER.x + CALLER.w + 8, y1: CALLER_SLOT.y + SLOT_H / 2, x2: CALLEE.x - 8, y2: CALLEE_SLOT.y + SLOT_H / 2,
      stroke: c.border, 'stroke-dasharray': '2 5',
    });
    const callLabel = text('', {
      x: W / 2, y: CALLER.y + 22, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md,
    });
    callLabel.style.transition = 'opacity 200ms';

    // ── 자리 밖의 목록 ──────────────────────────────────────
    el('rect', {
      x: LIST.x, y: LIST.y, width: LIST.w, height: LIST.h, rx: 6,
      fill: c.bg, stroke: c.border, 'stroke-dasharray': '6 4',
    });
    // 이름표는 가운데 — 두 주소 화살이 양옆으로 닿는다
    text(t('label.outside', 'outside the slots'), { x: LIST.x + LIST.w / 2, y: LIST.y + 16, 'text-anchor': 'middle', fill: c.textMuted });
    el('line', { x1: LIST.x + 14, y1: BASE_Y, x2: LIST.x + LIST.w - 14, y2: BASE_Y, stroke: c.textMuted });

    type Bar = { rect: SVGRectElement; label: SVGTextElement; value: number };
    let bars: Bar[] = [];
    let barLayer = el('g', {});
    let at = 0;
    const barCx = (i: number, n: number) => LIST.x + (LIST.w * (i + 0.5)) / n;
    const barTop = (v: number) => BASE_Y - Math.max(0, v) * UNIT;

    const buildBars = (cells: number[], atIdx: number) => {
      barLayer.remove();
      barLayer = el('g', {});
      at = atIdx;
      bars = cells.map((v, i) => {
        const cx = barCx(i, cells.length);
        const isAt = i === atIdx;
        const rect = el('rect', {
          x: cx - BAR_W / 2, y: barTop(v), width: BAR_W, height: Math.max(0, v) * UNIT,
          fill: isAt ? c.itemDefault : c.bgSubtle, stroke: isAt ? c.text : c.textMuted, 'stroke-width': isAt ? 1.5 : 1,
        }, barLayer);
        const label = text(String(v), {
          x: cx, y: barTop(v) - 6, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md,
          fill: isAt ? c.text : c.textMuted,
        }, barLayer);
        // 칸 번호는 1 부터
        text(String(i + 1), { x: cx, y: BASE_Y + 16, 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs }, barLayer);
        return { rect, label, value: v };
      });
    };
    /** 막대를 v 로 자라게 · 줄어들게 한다 (y 와 height 를 함께 옮긴다). */
    const setBar = (i: number, v: number, dur: number) => {
      const bar = bars[i];
      if (bar === undefined) return;
      const trans = `y ${dur}ms ease-in-out, height ${dur}ms ease-in-out, fill ${dur}ms`;
      bar.rect.style.transition = trans;
      bar.label.style.transition = `y ${dur}ms ease-in-out`;
      bar.rect.setAttribute('y', String(barTop(v)));
      bar.rect.setAttribute('height', String(Math.max(0, v) * UNIT));
      bar.rect.style.setProperty('y', `${barTop(v)}px`);
      bar.rect.style.setProperty('height', `${Math.max(0, v) * UNIT}px`);
      bar.label.setAttribute('y', String(barTop(v) - 6));
      bar.label.style.setProperty('y', `${barTop(v) - 6}px`);
      bar.label.textContent = String(v);
      bar.value = v;
    };
    const flashBar = (on: boolean) => {
      const bar = bars[at];
      if (bar === undefined) return;
      bar.rect.setAttribute('fill', on ? c.itemActive : c.itemDefault);
    };

    // ── 주소 화살 — 자리에서 목록으로 ──────────────────────
    const arrowTo = (fromX: number, fromY: number, toX: number, toY: number): SVGGElement => {
      const g = el('g', {});
      // 자리에서 곧장 아래로 나와 목록 위로 내려앉는다 (이름표를 가로지르지 않게)
      el('path', {
        d: `M ${fromX} ${fromY} C ${fromX} ${fromY + 70}, ${toX} ${toY - 70}, ${toX} ${toY}`,
        fill: 'none', stroke: c.itemActive, 'stroke-width': 2, pathLength: 1, 'stroke-dasharray': 1,
      }, g);
      el('polygon', {
        points: `${toX - 5},${toY - 8} ${toX + 5},${toY - 8} ${toX},${toY}`, fill: c.itemActive,
      }, g);
      return g;
    };
    /** 화살을 뻗거나(1) 거둔다(0). */
    const reach = (g: SVGGElement, on: boolean, dur: number, instant = false) => {
      const path = g.querySelector('path');
      const head = g.querySelector('polygon');
      if (path === null || head === null) return;
      path.style.transition = instant ? 'none' : `stroke-dashoffset ${dur}ms ease-in-out`;
      head.style.transition = instant ? 'none' : `opacity ${Math.max(1, dur / 3)}ms ease-in-out ${on ? dur * 0.7 : 0}ms`;
      path.style.strokeDashoffset = on ? '0' : '1';
      head.style.opacity = on ? '1' : '0';
    };
    const targetY = LIST.y + 30;
    const callerArrow = arrowTo(CALLER_SLOT.x + SLOT_W / 2, CALLER_SLOT.y + SLOT_H / 2, LIST.x + 40, targetY);
    const calleeArrow = arrowTo(CALLEE_SLOT.x + SLOT_W / 2, CALLEE_SLOT.y + SLOT_H / 2, LIST.x + LIST.w - 40, targetY);
    reach(callerArrow, false, 0, true);
    reach(calleeArrow, false, 0, true);

    // ── 부른 쪽 자리 — 값 상자(level) 와 주소 상자(cells) 가 번갈아 앉는다 ──
    const callerSlot = el('g', {});
    const callerName = text('', {
      x: CALLER_SLOT.x - 12, y: CALLER_SLOT.y + SLOT_H / 2 + smPx / 3, 'text-anchor': 'end', 'font-family': fonts.mono,
    }, callerSlot);
    const callerBox = el('rect', {
      x: CALLER_SLOT.x, y: CALLER_SLOT.y, width: SLOT_W, height: SLOT_H, rx: 4,
      fill: c.bg, stroke: c.text, 'stroke-width': 1.5,
    }, callerSlot);
    const callerValue = text('', {
      x: CALLER_SLOT.x + SLOT_W / 2, y: CALLER_SLOT.y + SLOT_H / 2 + mdPx / 3, 'text-anchor': 'middle',
      'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 600,
    }, callerSlot);
    const callerDot = el('circle', {
      cx: CALLER_SLOT.x + SLOT_W / 2, cy: CALLER_SLOT.y + SLOT_H / 2, r: 5, fill: c.itemActive,
    }, callerSlot);
    place(callerSlot, shiftTo(0, 0), 0);

    // 불린 쪽 cells 자리의 점 (목록 판)
    const calleeDot = el('circle', {
      cx: CALLEE_SLOT.x + SLOT_W / 2, cy: CALLEE_SLOT.y + SLOT_H / 2, r: 5, fill: c.itemActive,
    }, calleeFrame);

    // ── 건너가는 조각 — 베낀 수 또는 주소 ─────────────────
    const chip = el('g', {});
    const chipRect = el('rect', {
      x: -SLOT_W / 2 + 6, y: -SLOT_H / 2 + 5, width: SLOT_W - 12, height: SLOT_H - 10, rx: 4,
      fill: c.accent, stroke: c.stateInk, 'stroke-width': 1,
    }, chip);
    const chipText = text('', {
      x: 0, y: mdPx / 3 + 1, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.lg,
      'font-weight': 600, fill: c.stateInk,
    }, chip);
    place(chip, shiftTo(0, 0, 0), 0);
    const token = el('circle', { cx: 0, cy: 0, r: 6, fill: c.itemActive, stroke: c.bg, 'stroke-width': 2 });
    place(token, shiftTo(0, 0, 0), 0);

    // ── 글 ───────────────────────────────────────────────
    const caption = text('', { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'font-size': fontSizes.md });
    const readout = text('', {
      x: W / 2, y: READOUT_Y, 'text-anchor': 'middle', 'font-size': fontSizes.md, 'font-weight': 600,
      'font-family': fonts.body,
    });

    // ── 상태 ─────────────────────────────────────────────
    let pass: CopyVsSharePass | null = null;
    let startValue = 0;
    let levelValue = 0;
    let destroyed = false;

    const callerSlotCenter = { x: CALLER_SLOT.x + SLOT_W / 2, y: CALLER_SLOT.y + SLOT_H / 2 };
    const calleeSlotCenter = { x: CALLEE_SLOT.x + SLOT_W / 2, y: CALLEE_SLOT.y + SLOT_H / 2 };
    /** 베낀 조각이 들려 나오는 자리 — 수 판은 level 상자, 칸 판은 목록의 그 칸 꼭대기 */
    const chipSource = (): { x: number; y: number } => {
      if (pass === 'cell') {
        const bar = bars[at];
        const v = bar?.value ?? 0;
        return { x: barCx(at, bars.length || 1), y: barTop(v) - 22 };
      }
      return callerSlotCenter;
    };

    const setReadout = (v: number) => {
      readout.textContent =
        pass === 'number'
          ? t('readout.level', "Caller's level: {v}", { v })
          : t('readout.cell', "Caller's cell {cell}: {v}", { cell: at + 1, v });
    };
    const callText = (): string => {
      if (pass === 'number') return `${ID.addOne}(${ID.level})`;
      if (pass === 'list') return `${ID.addOneAt}(${ID.cells}, ${at})`;
      return `${ID.addOne}(${ID.cells}[${at}])`;
    };

    // 처음 — 자료가 있으면 목록만 놓는다
    const initCells = params.initialData?.cells;
    const initAt = params.initialData?.at;
    if (Array.isArray(initCells) && initCells.every((v) => typeof v === 'number') && typeof initAt === 'number') {
      buildBars(initCells as number[], initAt);
    }

    const stage: CopyVsShareStage = {
      showRun(p, dur) {
        if (destroyed) return;
        const prevPass = pass;
        pass = p.pass;
        levelValue = p.level;
        // 처음 값은 알고리즘이 셈한 것을 그대로 쓴다
        startValue = p.callerValue;

        // 목록 — 모양이 같으면 앞 판의 높이에서 처음 값으로 줄어든다
        if (bars.length !== p.cells.length || at !== p.at) buildBars(p.cells, p.at);
        else p.cells.forEach((v, i) => setBar(i, v, dur));
        flashBar(false);

        // 불린 쪽 틀은 닫힌 채로
        move(calleeFrame, 'scale(0)', dur / 2, 0);
        reach(calleeArrow, false, dur / 2);
        move(chip, shiftTo(calleeSlotCenter.x, calleeSlotCenter.y, 0), dur / 2, 0);

        // 부른 쪽 자리의 모양 — 값 상자 ↔ 주소 상자
        callerTitle.textContent = p.pass === 'number' ? ID.passNumber : p.pass === 'list' ? ID.passList : ID.passCell;
        const isValue = p.pass === 'number';
        callerName.textContent = isValue ? ID.level : ID.cells;
        callerValue.textContent = isValue ? String(p.level) : '';
        callerDot.style.opacity = isValue ? '0' : '1';
        callerBox.setAttribute('stroke-width', '1.5');
        if (prevPass === null || (prevPass === 'number') !== isValue) {
          place(callerSlot, shiftTo(0, 24), 0);
          move(callerSlot, shiftTo(0, 0), dur, 1);
          reach(callerArrow, false, 0, true);
          if (!isValue) {
            // 다음 틱에 화살을 뻗는다 (곧장 놓은 값 위에서 운동이 시작되게)
            void callerArrow.getBoundingClientRect();
            reach(callerArrow, true, dur);
          }
        } else if (!isValue) {
          reach(callerArrow, true, dur);
        }
        callLabel.textContent = '';
        caption.textContent = '';
        setReadout(startValue);
      },

      showCall(p, dur) {
        if (destroyed || pass === null) return;
        // 불린 쪽 틀이 열린다
        calleeTitle.textContent = p.pass === 'list' ? ID.addOneAt : ID.addOne;
        calleeName.textContent = p.pass === 'list' ? ID.cells : ID.x;
        calleeDot.style.opacity = p.pass === 'list' ? '1' : '0';
        place(calleeFrame, 'scale(0.3)', 0);
        move(calleeFrame, 'scale(1)', dur, 1);
        callLabel.textContent = callText();

        if (p.pass === 'list') {
          // 주소가 건너가고, 불린 쪽 cells 에서 화살이 뻗어 같은 목록에 닿는다
          place(token, shiftTo(callerSlotCenter.x, callerSlotCenter.y, 1), 1);
          move(token, shiftTo(calleeSlotCenter.x, calleeSlotCenter.y, 1), dur * 0.6, 1);
          reach(calleeArrow, false, 0, true);
          void calleeArrow.getBoundingClientRect();
          reach(calleeArrow, true, dur);
          caption.textContent = t('caption.callAddress', 'Call {n}/{k} — only the address crosses, nothing is copied', {
            n: p.n,
            k: p.times,
          });
        } else {
          // 베낀 수가 출발점에서 들려 나와 x 로 날아간다
          const src = chipSource();
          chipText.textContent = String(p.copied ?? '');
          chipRect.setAttribute('fill', c.accent);
          place(chip, shiftTo(src.x, src.y, 1), 1);
          move(chip, shiftTo(calleeSlotCenter.x, calleeSlotCenter.y, 1), dur, 1);
          caption.textContent = t('caption.callCopy', 'Call {n}/{k} — a copy crosses into x: {v}', {
            n: p.n,
            k: p.times,
            v: p.copied ?? '',
          });
        }
      },

      showWrite(p, dur) {
        if (destroyed || pass === null) return;
        if (p.pass === 'list') {
          place(token, shiftTo(calleeSlotCenter.x, calleeSlotCenter.y, 1), 0);
          flashBar(true);
          setBar(at, p.to, dur);
          caption.textContent = t(
            'caption.writeShared',
            "The body writes cell {cell} of the caller's list: {from} → {to}",
            { cell: at + 1, from: p.from, to: p.to },
          );
        } else {
          chipText.textContent = String(p.to);
          chipRect.setAttribute('fill', c.itemActive);
          place(chip, shiftTo(calleeSlotCenter.x, calleeSlotCenter.y - 10, 1.15), 1);
          move(chip, shiftTo(calleeSlotCenter.x, calleeSlotCenter.y, 1), dur / 2, 1);
          caption.textContent = t('caption.writeCopy', 'The body writes x: {from} → {to}', { from: p.from, to: p.to });
        }
        setReadout(p.callerValue);
        if (pass === 'number') callerValue.textContent = String(levelValue);
      },

      showReturn(p, dur) {
        if (destroyed || pass === null) return;
        flashBar(false);
        // 틀이 닫힌다
        move(calleeFrame, 'scale(0)', dur, 0);
        if (p.pass === 'list') {
          reach(calleeArrow, false, dur * 0.7);
          caption.textContent = t('caption.returnShared', 'Return — the frame is taken down; only the name cells drops');
        } else {
          // x 는 틀과 함께 줄어 사라진다
          move(chip, shiftTo(CALLEE.x + CALLEE.w / 2, CALLEE.y + CALLEE.h / 2, 0), dur, 0);
          caption.textContent = t('caption.returnCopy', 'Return — the frame is taken down; x ({v}) is gone', {
            v: p.lost ?? '',
          });
        }
        callLabel.textContent = '';
        setReadout(p.callerValue);
      },

      showRead(p, dur) {
        if (destroyed || pass === null) return;
        // 부른 쪽이 읽는 자리를 짚는다
        callerBox.setAttribute('stroke-width', '3');
        if (p.pass !== 'number') {
          const bar = bars[at];
          if (bar !== undefined) {
            bar.label.style.transformBox = 'fill-box';
            bar.label.style.transformOrigin = 'center';
            place(bar.label, 'scale(1.6)');
            move(bar.label, 'scale(1)', dur);
          }
        }
        caption.textContent = t('caption.read', 'The caller reads — at the start {a}, now {b}', {
          a: startValue,
          b: p.value,
        });
        setReadout(p.value);
      },

      clear() {
        if (destroyed) return;
        pass = null;
        callerTitle.textContent = '';
        calleeTitle.textContent = '';
        callLabel.textContent = '';
        caption.textContent = '';
        readout.textContent = '';
        place(calleeFrame, 'scale(0)', 0);
        place(chip, shiftTo(0, 0, 0), 0);
        place(token, shiftTo(0, 0, 0), 0);
        place(callerSlot, shiftTo(0, 0), 0);
        reach(callerArrow, false, 0, true);
        reach(calleeArrow, false, 0, true);
        if (Array.isArray(initCells) && initCells.every((v) => typeof v === 'number') && typeof initAt === 'number') {
          buildBars(initCells as number[], initAt);
        }
      },

      destroy() {
        destroyed = true;
        while (svg.firstChild !== null) svg.removeChild(svg.firstChild);
      },
    };
    return stage;
  },
};
