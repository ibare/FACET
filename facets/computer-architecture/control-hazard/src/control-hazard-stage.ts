/**
 * 제어 해저드 stage — 파이프라인 · 버린 것 · 박자마다 가져온 것.
 *
 * 움직이는 것은 명령어다. 명령어 패는 IF 에서 WB 로 한 칸씩 걸어가고, 분기가 판정
 * 단계에 닿는 순간 그 뒤에 따라 들어온 꼬리가 **떨어져 나가 버린 칸으로** 옮겨 간다.
 * 아래 띠에서는 같은 패가 윗줄(남은 것)에서 아랫줄(버린 것)로 내려앉고, 그 빈자리만큼
 * 뒤의 모든 것이 오른쪽으로 밀린다.
 *
 * 판정 단계를 바꾸면 판정 표시가 옆으로 옮겨 가고 그 앞의 꼬리 괄호가 한 칸씩 길어진다.
 * 앞 판의 끝 박자는 흐린 표시로 남아 새 판의 끝이 그로부터 얼마나 옮겨 가는지 보인다.
 *
 * 색은 design-tokens 에서만 받는다. 운동은 CSS transition (transform) 이다.
 */

import { fonts, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { CanvasView, Palette, ViewInstance } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 396;

/** 프로그램 목록 */
const LIST_X = 16;
const ROW_Y0 = 40;
const ROW_H = 26;
const ARC_X = 232;

/** 파이프라인 */
const PIPE_X = 276;
const STAGE_W = 88;
const STAGE_GAP = 5;
const BOX_Y = 48;
const BOX_H = 56;
const TOKEN_W = 78;
const TOKEN_H = 42;

/** 버린 칸 */
const BIN_Y = 170;
const CHIP_STEP = 50;
const CHIP_SCALE = 0.55;

/** 박자 띠 */
const LANE_X = 16;
const LANE_W = 728;
const MAX_COLS = 32;
const COL_W = LANE_W / MAX_COLS;
const KEEP_Y = 248;
const DROP_Y = 278;
const TILE_H = 24;
const AXIS_Y = 312;

const CAPTION_Y = 382;

const MOVE = 'transform 300ms ease, opacity 300ms ease';

export type ControlHazardSlot = { id: number; pc: number; spec: boolean };

/** projector 가 부르는 구조적 표면. */
export type ControlHazardStage = {
  startRound(resolveStage: number, prevCycles: number | null, windowText: string, prevText: string): void;
  showCycle(cycle: number, slots: (ControlHazardSlot | null)[], cycleText: string): void;
  resolveBranch(branchId: number, taken: boolean, flushedIds: number[]): void;
  jumpBack(toPc: number): void;
  finishRound(cycles: number, endText: string): void;
  setCaption(text: string): void;
  clear(): void;
};

const stageLeft = (i: number) => PIPE_X + i * (STAGE_W + STAGE_GAP);
const gateX = (resolveStage: number) => stageLeft(resolveStage - 1) + STAGE_W + STAGE_GAP / 2;
const rowTop = (pc: number) => ROW_Y0 + pc * ROW_H;
const colLeft = (cycle: number) => LANE_X + (cycle - 1) * COL_W;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function place(node: SVGElement, x: number, y: number, scale = 1): void {
  node.style.transform = scale === 1 ? `translate(${x}px, ${y}px)` : `translate(${x}px, ${y}px) scale(${scale})`;
}

/** 명령어 글에서 표식(`L:`)을 떼고 연산 이름과 피연산자로 나눈다. */
function splitInstr(text: string): { label: string | null; op: string; args: string } {
  const m = /^\s*([A-Za-z_]\w*):\s*(.*)$/.exec(text);
  const body = m ? (m[2] ?? '') : text;
  const sp = body.indexOf(' ');
  return {
    label: m ? (m[1] ?? null) : null,
    op: sp < 0 ? body : body.slice(0, sp),
    args: sp < 0 ? '' : body.slice(sp + 1),
  };
}

type Token = {
  g: SVGGElement;
  rect: SVGRectElement;
  opText: SVGTextElement;
  argText: SVGTextElement;
  pc: number;
  dropped: boolean;
};

export const controlHazardStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const data = params.initialData ?? {};
    const program: string[] = Array.isArray(data.program)
      ? data.program.filter((s): s is string => typeof s === 'string')
      : [];
    const isBranch: number[] = Array.isArray(data.isBranch)
      ? data.isBranch.map((v) => (typeof v === 'number' ? v : 0))
      : [];
    const isBranchPc = (pc: number) => isBranch[pc] === 1;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const pending = new Map<ReturnType<typeof setTimeout>, () => void>();
    let destroyed = false;
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        pending.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
      pending.set(id, fn);
    };
    params.onScrubStart?.(() => {
      const fns = [...pending.values()];
      for (const id of timers) clearTimeout(id);
      timers.clear();
      pending.clear();
      for (const fn of fns) fn();
    });

    const root = el('g');
    svg.appendChild(root);
    root.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }));

    const text = (
      x: number,
      y: number,
      body: string,
      opts: { size?: number; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ) => {
      const node = el('text', {
        x,
        y,
        'font-size': opts.size ?? 12,
        fill: opts.fill ?? c.text,
        'text-anchor': opts.anchor ?? 'start',
        'font-family': opts.mono ? fonts.mono : fonts.body,
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = body;
      return node;
    };

    // ── 프로그램 목록 ─────────────────────────────────────────────
    root.appendChild(text(LIST_X, 22, t('label.program', 'Program'), { size: 12, fill: c.textMuted, weight: '600' }));
    const rowShade: SVGRectElement[] = [];
    program.forEach((line, pc) => {
      const shade = el('rect', {
        x: LIST_X + 14,
        y: rowTop(pc),
        width: ARC_X - LIST_X - 18,
        height: ROW_H - 4,
        rx: 4,
        fill: c.itemComparing,
        'fill-opacity': 0,
      });
      shade.style.transition = 'fill-opacity 250ms ease';
      rowShade.push(shade);
      root.appendChild(shade);
      root.appendChild(text(LIST_X + 20, rowTop(pc) + 15, String(pc), { size: 10, fill: c.textMuted, mono: true }));
      root.appendChild(
        text(LIST_X + 36, rowTop(pc) + 15, line, {
          size: 12,
          mono: true,
          weight: isBranchPc(pc) ? '700' : undefined,
        }),
      );
    });

    // 되뛰는 호 — 분기 줄에서 목표 줄로.
    const branchPc = isBranch.indexOf(1);
    const targetList: number[] = Array.isArray(data.target)
      ? data.target.map((v) => (typeof v === 'number' ? v : -1))
      : [];
    const targetPc = branchPc >= 0 ? (targetList[branchPc] ?? 0) : 0;
    const arcFrom = rowTop(Math.max(0, branchPc)) + (ROW_H - 4) / 2;
    const arcTo = rowTop(Math.max(0, targetPc)) + (ROW_H - 4) / 2;
    const arcD = `M ${ARC_X - 4} ${arcFrom} C ${ARC_X + 30} ${arcFrom}, ${ARC_X + 30} ${arcTo}, ${ARC_X - 4} ${arcTo}`;
    root.appendChild(
      el('path', { d: arcD, fill: 'none', stroke: c.border, 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }),
    );
    const ARC_LEN = Math.abs(arcFrom - arcTo) + 50;
    const arcLive = el('path', {
      d: arcD,
      fill: 'none',
      stroke: c.primary,
      'stroke-width': 2.4,
      'stroke-dasharray': `${ARC_LEN}`,
      'stroke-dashoffset': `${ARC_LEN}`,
    });
    root.appendChild(arcLive);
    const arcHead = el('path', {
      d: `M ${ARC_X - 4} ${arcTo} l 7 -4 l 0 8 z`,
      fill: c.primary,
      opacity: 0,
    });
    arcHead.style.transition = 'opacity 200ms ease';
    root.appendChild(arcHead);

    // PC 화살표 — 다음에 가져올 줄을 가리킨다.
    const pcArrow = el('path', { d: 'M 0 0 L 10 6 L 0 12 z', fill: c.primary, opacity: 0 });
    pcArrow.style.transition = MOVE;
    place(pcArrow, LIST_X, rowTop(0) + 5);
    root.appendChild(pcArrow);

    // ── 파이프라인 ────────────────────────────────────────────────
    root.appendChild(text(PIPE_X, 22, t('label.pipeline', 'Pipeline'), { size: 12, fill: c.textMuted, weight: '600' }));
    const cycleLabel = text(stageLeft(4) + STAGE_W, 22, '', { size: 12, anchor: 'end', mono: true });
    root.appendChild(cycleLabel);
    const stageNames = [
      t('stage.if', 'IF'),
      t('stage.id', 'ID'),
      t('stage.ex', 'EX'),
      t('stage.mem', 'MEM'),
      t('stage.wb', 'WB'),
    ];
    stageNames.forEach((name, i) => {
      root.appendChild(
        el('rect', {
          x: stageLeft(i),
          y: BOX_Y,
          width: STAGE_W,
          height: BOX_H,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );
      root.appendChild(text(stageLeft(i) + STAGE_W / 2, BOX_Y - 6, name, { size: 11, anchor: 'middle', weight: '600' }));
    });

    // 꼬리 괄호 — IF 부터 판정 단계 바로 앞까지. 판정이 뒤로 가면 길어진다.
    const bracket = el('g');
    const bracketLine = el('rect', { x: 0, y: 0, width: STAGE_W, height: 4, rx: 2, fill: c.itemComparing });
    bracketLine.style.transition = 'width 400ms ease';
    bracket.appendChild(bracketLine);
    const windowLabel = text(0, 26, '', { size: 11, fill: c.textMuted });
    bracket.appendChild(windowLabel);
    place(bracket, PIPE_X, BOX_Y + BOX_H + 8);
    root.appendChild(bracket);

    // 판정 표시 — 판정 단계의 오른쪽 끝에 선다.
    const gate = el('g');
    gate.appendChild(el('rect', { x: -1.5, y: BOX_Y - 16, width: 3, height: BOX_H + 26, fill: c.primary }));
    const gateTag = text(0, BOX_Y - 20, t('label.resolve', 'resolve'), {
      size: 11,
      anchor: 'middle',
      fill: c.primary,
      weight: '700',
    });
    gate.appendChild(gateTag);
    gate.style.transition = 'transform 450ms ease';
    place(gate, gateX(3), 0);
    root.appendChild(gate);

    // ── 버린 칸 ──────────────────────────────────────────────────
    root.appendChild(text(PIPE_X, BIN_Y - 8, t('label.discarded', 'Discarded'), { size: 12, fill: c.textMuted, weight: '600' }));
    root.appendChild(
      el('rect', {
        x: PIPE_X - 4,
        y: BIN_Y - 2,
        width: 5 * STAGE_W + 4 * STAGE_GAP + 8,
        height: TOKEN_H * CHIP_SCALE + 8,
        rx: 6,
        fill: 'none',
        stroke: c.border,
        'stroke-dasharray': '4 3',
      }),
    );

    // ── 박자 띠 ──────────────────────────────────────────────────
    root.appendChild(text(LANE_X, KEEP_Y - 10, t('label.fetchLane', 'Fetched, by cycle'), { size: 12, fill: c.textMuted, weight: '600' }));
    root.appendChild(el('line', { x1: LANE_X, y1: AXIS_Y, x2: LANE_X + LANE_W, y2: AXIS_Y, stroke: c.border }));
    for (let cyc = 1; cyc <= MAX_COLS; cyc += 1) {
      const x = colLeft(cyc) + COL_W / 2;
      const major = cyc === 1 || cyc % 5 === 0;
      root.appendChild(el('line', { x1: x, y1: AXIS_Y, x2: x, y2: AXIS_Y + (major ? 5 : 3), stroke: c.border }));
      if (major) root.appendChild(text(x, AXIS_Y + 16, String(cyc), { size: 10, anchor: 'middle', fill: c.textMuted, mono: true }));
    }
    const laneLayer = el('g');
    root.appendChild(laneLayer);

    const cursor = el('rect', { x: -1, y: KEEP_Y - 4, width: 2, height: AXIS_Y - KEEP_Y + 4, fill: c.primary, opacity: 0 });
    cursor.style.transition = MOVE;
    place(cursor, LANE_X, 0);
    root.appendChild(cursor);

    const ghost = el('g', { opacity: 0 });
    ghost.appendChild(el('rect', { x: -1, y: KEEP_Y - 6, width: 2, height: AXIS_Y - KEEP_Y + 6, fill: c.textMuted }));
    const ghostLabel = text(-4, AXIS_Y + 30, '', { size: 11, anchor: 'end', fill: c.textMuted });
    ghost.appendChild(ghostLabel);
    ghost.style.transition = MOVE;
    root.appendChild(ghost);

    const endMark = el('g', { opacity: 0 });
    endMark.appendChild(el('rect', { x: -1.5, y: KEEP_Y - 6, width: 3, height: AXIS_Y - KEEP_Y + 6, fill: c.danger }));
    const endLabel = text(-4, AXIS_Y + 45, '', { size: 11, anchor: 'end', fill: c.danger, weight: '700' });
    endMark.appendChild(endLabel);
    endMark.style.transition = MOVE;
    root.appendChild(endMark);

    // ── 캡션 ─────────────────────────────────────────────────────
    const caption = text(W / 2, CAPTION_Y, '', { size: 13, anchor: 'middle' });
    root.appendChild(caption);

    // 패는 가장 위에 — 떨어질 때 다른 것 위로 지나간다.
    const tokenLayer = el('g');
    root.appendChild(tokenLayer);

    // ── 상태 ─────────────────────────────────────────────────────
    const tokens = new Map<number, Token>();
    const tiles = new Map<number, { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement }>();
    let binCount = 0;

    const tokenX = (i: number) => stageLeft(i) + (STAGE_W - TOKEN_W) / 2;
    const tokenY = BOX_Y + (BOX_H - TOKEN_H) / 2;

    function paintToken(tok: Token, spec: boolean): void {
      if (tok.dropped) return;
      const branch = isBranchPc(tok.pc);
      tok.rect.setAttribute('fill', branch ? c.itemPivot : c.bg);
      tok.rect.setAttribute('stroke', spec ? c.itemComparing : c.text);
      tok.rect.setAttribute('stroke-width', spec ? '2' : '1.2');
      tok.rect.setAttribute('stroke-dasharray', spec ? '5 3' : '');
      const ink = branch ? c.stateInk : c.text;
      tok.opText.setAttribute('fill', ink);
      tok.argText.setAttribute('fill', branch ? c.stateInk : c.textMuted);
    }

    function makeToken(id: number, pc: number): Token {
      const parts = splitInstr(program[pc] ?? '');
      const g = el('g');
      const rect = el('rect', { x: 0, y: 0, width: TOKEN_W, height: TOKEN_H, rx: 6 });
      const opText = text(TOKEN_W / 2, 18, parts.label ? `${parts.label}: ${parts.op}` : parts.op, {
        size: 13,
        anchor: 'middle',
        weight: '700',
        mono: true,
      });
      const argText = text(TOKEN_W / 2, 33, parts.args, { size: 9.5, anchor: 'middle', mono: true });
      g.appendChild(rect);
      g.appendChild(opText);
      g.appendChild(argText);
      g.style.transition = MOVE;
      g.style.opacity = '0';
      place(g, tokenX(0) - 40, tokenY);
      tokenLayer.appendChild(g);
      const tok: Token = { g, rect, opText, argText, pc, dropped: false };
      tokens.set(id, tok);
      return tok;
    }

    function addTile(id: number, pc: number, cycle: number, spec: boolean): void {
      const parts = splitInstr(program[pc] ?? '');
      const g = el('g');
      const rect = el('rect', { x: 1, y: 0, width: COL_W - 2, height: TILE_H, rx: 3 });
      const branch = isBranchPc(pc);
      rect.setAttribute('fill', branch ? c.itemPivot : c.bgSubtle);
      rect.setAttribute('stroke', spec ? c.itemComparing : c.border);
      if (spec) rect.setAttribute('stroke-dasharray', '3 2');
      const label = text(COL_W / 2, 16, parts.op, {
        size: parts.op.length > 3 ? 7.5 : 9,
        anchor: 'middle',
        mono: true,
        fill: branch ? c.stateInk : c.text,
      });
      g.appendChild(rect);
      g.appendChild(label);
      g.style.transition = MOVE;
      g.style.opacity = '0';
      place(g, colLeft(cycle), KEEP_Y - 14);
      laneLayer.appendChild(g);
      tiles.set(id, { g, rect, label });
      later(() => {
        g.style.opacity = '1';
        place(g, colLeft(cycle), KEEP_Y);
      }, 16);
    }

    function clearAll(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      pending.clear();
      tokens.clear();
      tiles.clear();
      while (tokenLayer.firstChild) tokenLayer.removeChild(tokenLayer.firstChild);
      while (laneLayer.firstChild) laneLayer.removeChild(laneLayer.firstChild);
      binCount = 0;
      for (const s of rowShade) s.setAttribute('fill-opacity', '0');
      arcLive.setAttribute('stroke-dashoffset', `${ARC_LEN}`);
      arcHead.setAttribute('opacity', '0');
      pcArrow.setAttribute('opacity', '0');
      cursor.setAttribute('opacity', '0');
      endMark.setAttribute('opacity', '0');
      cycleLabel.textContent = '';
      caption.textContent = '';
    }

    const api: ControlHazardStage & ViewInstance = {
      startRound(resolveStage, prevCycles, windowText, prevText) {
        // 앞 판의 패는 흩어지고, 앞 판의 끝은 흐린 표시로 남는다.
        for (const tok of tokens.values()) tok.g.style.opacity = '0';
        for (const tile of tiles.values()) tile.g.style.opacity = '0';
        const oldTokens = [...tokenLayer.childNodes];
        const oldTiles = [...laneLayer.childNodes];
        tokens.clear();
        tiles.clear();
        later(() => {
          for (const n of oldTokens) n.parentNode?.removeChild(n);
          for (const n of oldTiles) n.parentNode?.removeChild(n);
        }, 320);
        binCount = 0;
        for (const s of rowShade) s.setAttribute('fill-opacity', '0');
        arcLive.style.transition = '';
        arcLive.setAttribute('stroke-dashoffset', `${ARC_LEN}`);
        arcHead.setAttribute('opacity', '0');

        place(gate, gateX(resolveStage), 0);
        bracketLine.setAttribute('width', String(Math.max(0, gateX(resolveStage) - PIPE_X - STAGE_GAP)));
        windowLabel.textContent = windowText;

        if (prevCycles !== null) {
          place(ghost, colLeft(prevCycles) + COL_W, 0);
          ghostLabel.textContent = prevText;
          ghost.setAttribute('opacity', '1');
        } else {
          ghost.setAttribute('opacity', '0');
        }
        // 끝 표시는 앞 판 자리에서 출발해 새 판의 끝으로 옮겨 간다.
        endMark.setAttribute('opacity', '0');
        cursor.setAttribute('opacity', '0');
        place(cursor, LANE_X, 0);
        cycleLabel.textContent = '';
        pcArrow.setAttribute('opacity', '1');
        place(pcArrow, LIST_X, rowTop(0) + 5);
      },

      showCycle(cycle, slots, cycleText) {
        cycleLabel.textContent = cycleText;
        const alive = new Set<number>();
        slots.forEach((slot, i) => {
          if (!slot) return;
          alive.add(slot.id);
          let tok = tokens.get(slot.id);
          if (!tok) {
            tok = makeToken(slot.id, slot.pc);
            addTile(slot.id, slot.pc, cycle, slot.spec);
          }
          paintToken(tok, slot.spec);
          const g = tok.g;
          later(() => {
            g.style.opacity = '1';
            place(g, tokenX(i), tokenY);
          }, 16);
        });
        // WB 를 지난 것은 오른쪽으로 빠져나간다.
        for (const [id, tok] of tokens) {
          if (alive.has(id) || tok.dropped) continue;
          tokens.delete(id);
          tok.g.style.opacity = '0';
          place(tok.g, tokenX(4) + STAGE_W, tokenY);
          const g = tok.g;
          later(() => g.parentNode?.removeChild(g), 320);
        }
        // 목록: 파이프라인에 든 줄을 칠하고, 화살표는 방금 가져온 다음 줄로.
        const inPipe = new Map<number, boolean>();
        for (const s of slots) if (s) inPipe.set(s.pc, (inPipe.get(s.pc) ?? false) || s.spec);
        rowShade.forEach((shade, pc) => {
          const has = inPipe.has(pc);
          shade.setAttribute('fill', inPipe.get(pc) ? c.itemComparing : c.border);
          shade.setAttribute('fill-opacity', has ? (inPipe.get(pc) ? '0.28' : '0.5') : '0');
        });
        const fetched = slots[0];
        if (fetched) {
          const nextPc = fetched.pc + 1;
          pcArrow.setAttribute('opacity', nextPc < program.length ? '1' : '0');
          place(pcArrow, LIST_X, rowTop(Math.min(nextPc, program.length - 1)) + 5);
        }
        cursor.setAttribute('opacity', '1');
        place(cursor, colLeft(cycle) + COL_W, 0);
        arcHead.setAttribute('opacity', '0');
      },

      resolveBranch(branchId, taken, flushedIds) {
        const b = tokens.get(branchId);
        if (b) {
          b.rect.setAttribute('stroke', c.primary);
          b.rect.setAttribute('stroke-width', '3');
          b.rect.setAttribute('stroke-dasharray', '');
        }
        if (!taken) {
          for (const tok of tokens.values()) if (!tok.dropped) paintToken(tok, false);
          for (const tile of tiles.values()) tile.rect.setAttribute('stroke-dasharray', '');
          return;
        }
        // 꼬리가 떨어져 나가 버린 칸으로 옮겨 간다.
        for (const id of flushedIds) {
          const tok = tokens.get(id);
          if (tok) {
            tok.dropped = true;
            tok.rect.setAttribute('fill', c.bg);
            tok.rect.setAttribute('stroke', c.danger);
            tok.rect.setAttribute('stroke-dasharray', '5 3');
            tok.opText.setAttribute('fill', c.danger);
            tok.argText.setAttribute('fill', c.danger);
            tok.g.style.transition = 'transform 520ms cubic-bezier(.5,-0.2,.6,1.2), opacity 300ms ease';
            place(tok.g, PIPE_X + binCount * CHIP_STEP, BIN_Y + 2, CHIP_SCALE);
            binCount += 1;
          }
          const tile = tiles.get(id);
          if (tile) {
            tile.rect.setAttribute('fill', c.bg);
            tile.rect.setAttribute('stroke', c.danger);
            tile.rect.setAttribute('stroke-dasharray', '3 2');
            tile.label.setAttribute('fill', c.danger);
            const m = /translate\(([-\d.]+)px/.exec(tile.g.style.transform);
            const x = m ? Number(m[1]) : 0;
            place(tile.g, x, DROP_Y);
          }
        }
        // 틀린 갈래의 줄은 더 이상 파이프라인에 없다.
        rowShade.forEach((shade, pc) => {
          if (pc > branchPc) shade.setAttribute('fill-opacity', '0');
        });
      },

      jumpBack(toPc) {
        // 목표로 되뛴다.
        arcLive.style.transition = 'none';
        arcLive.setAttribute('stroke-dashoffset', `${ARC_LEN}`);
        later(() => {
          arcLive.style.transition = 'stroke-dashoffset 420ms ease';
          arcLive.setAttribute('stroke-dashoffset', '0');
          arcHead.setAttribute('opacity', '1');
        }, 16);
        later(() => {
          arcLive.style.transition = 'stroke-dashoffset 300ms ease';
          arcLive.setAttribute('stroke-dashoffset', `${ARC_LEN}`);
        }, 900);
        pcArrow.setAttribute('opacity', '1');
        place(pcArrow, LIST_X, rowTop(Math.max(0, toPc)) + 5);
      },

      finishRound(cycles, endText) {
        endLabel.textContent = endText;
        endMark.setAttribute('opacity', '1');
        place(endMark, colLeft(cycles) + COL_W, 0);
        cursor.setAttribute('opacity', '0');
        pcArrow.setAttribute('opacity', '0');
        for (const s of rowShade) s.setAttribute('fill-opacity', '0');
      },

      setCaption(body) {
        caption.textContent = body;
      },

      clear() {
        clearAll();
        ghost.setAttribute('opacity', '0');
      },

      destroy() {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        pending.clear();
        root.parentNode?.removeChild(root);
      },
    };
    return api;
  },
};
