/**
 * 5단계 파이프라인 — stage view.
 *
 * 두 층이다.
 *
 * 1. **기계** — 다섯 단계 칸(IF · ID · EX · MEM · WB). 명령어는 왼쪽 대기 더미에서
 *    나와 박자마다 한 칸씩 오른쪽으로 옮겨 가고, WB 를 나서면 오른쪽 완료 더미에
 *    쌓인다. 더미의 판 하나가 명령어 하나다 — 손잡이를 올리면 대기 더미가 높아진다.
 * 2. **박자 축** — 한 축 위에 두 기계의 끝을 놓는다.
 *    - 파이프 줄: 박자마다 일하는 단계 수만큼 기둥이 선다. 채움과 비움의 비탈 사이로
 *      꽉 찬 가운데 구간이 이어지고, 손잡이를 올리면 **그 구간만 늘어난다.** 앞 판의
 *      윤곽을 옅게 남겨 두어 무엇이 늘었는지 견줄 수 있다.
 *    - 지연 괄호: WB 를 나선 명령어가 IF 에 든 박자부터의 길이. 박자마다 한 칸씩
 *      미끄러지되 **길이는 그대로다.**
 *    - 직렬 줄: 명령어 하나당 다섯 칸짜리 토막. 판이 바뀌면 막대가 앞 판의 끝에서
 *      새 끝으로 자라거나 줄어든다.
 *    - 두 끝 표시와 그 사이 간격 괄호 — 파이프의 끝은 한 칸씩, 직렬의 끝은 다섯 칸씩
 *      물러나 **간격이 벌어진다.**
 *
 * 세로는 사다리의 가장 큰 값(명령어 열여섯 · 직렬 80 박자)이 들어가게 처음부터 잡는다.
 * 색은 design-tokens 에서만 받는다.
 */

import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator } from '@ffacet/core/runtime';

/** projector 가 부르는 표면. projector 는 이 타입으로 좁혀 부른다. */
export type FiveStagePipelineStage = ViewInstance & {
  /** 판을 비운다. 되감기와 첫 마운트에서. */
  clear(): void;
  startRound(p: { count: number; instructions: string[]; ms: number }): void;
  planSerial(p: { serialCycles: number; cyclesPerInstruction: number; ms: number }): void;
  tick(p: { cycle: number; slots: number[]; busy: number; ms: number }): void;
  retire(p: { index: number; ifCycle: number; wbCycle: number; latencyCycles: number; ms: number }): void;
  endRound(p: { pipeCycles: number; serialCycles: number; ms: number }): void;
  setCaption(line1: string, line2: string): void;
};

const W = 800;
const H = 420;

// ── 기계
const BOX_W = 104;
const BOX_H = 56;
const BOX_Y = 46;
const BOX_X0 = 112;
const BOX_STEP = 116;
const PILE_W = 80;
const PILE_WAIT_X = 12;
const PILE_DONE_X = 708;
const PILE_BOTTOM = 158;
const SLAB_STEP = 8;
const SLAB_H = 6;

// ── 박자 축
const AX0 = 110;
const AX1 = 790;
const COL_BASE = 250;
const COL_UNIT = 9;
const LAT_Y = 258;
const SERIAL_Y = 288;
const SERIAL_H = 18;
const MARK_TOP = 196;
const MARK_BOTTOM = 312;
const AXIS_Y = 318;
const GAP_Y = 350;
const CAP1_Y = 392;
const CAP2_Y = 410;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pose = { x: number; y: number; sx: number; sy: number; o: number };

export const fiveStagePipelineStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params): FiveStagePipelineStage {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const data = (params.initialData ?? {}) as {
      program?: unknown;
      stageCount?: unknown;
      countLadder?: unknown;
    };
    const program = Array.isArray(data.program)
      ? data.program.filter((s): s is string => typeof s === 'string')
      : [];
    const stageCount = typeof data.stageCount === 'number' ? data.stageCount : 5;
    const ladder = Array.isArray(data.countLadder)
      ? data.countLadder.filter((v): v is number => typeof v === 'number')
      : [];
    const maxCount = Math.max(program.length, ...ladder, 1);
    /** 축 끝 — 사다리 끝값을 직렬로 돌렸을 때의 박자. */
    const axisMax = maxCount * stageCount;
    const px = (AX1 - AX0) / axisMax;
    const X = (cycle: number) => AX0 + cycle * px;

    // ── 애니메이션 — 이름마다 하나만 돈다. 새것이 오면 옛것을 거둔다.
    let destroyed = false;
    const frames = new Map<string, number>();
    const cancelAll = () => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
    };
    params.onScrubStart?.(cancelAll);
    const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    function animate(key: string, ms: number, draw: (k: number) => void): void {
      const old = frames.get(key);
      if (old !== undefined) cancelAnimationFrame(old);
      frames.delete(key);
      if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        if (destroyed) return;
        const k = Math.min(1, (now - t0) / ms);
        draw(ease(k));
        if (k < 1) frames.set(key, requestAnimationFrame(step));
        else frames.delete(key);
      };
      frames.set(key, requestAnimationFrame(step));
    }
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

    // ── SVG 도우미
    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }
    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = s;
      return node;
    }

    const root = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, root);

    // ── 기계: 머리말 · 단계 칸
    const stageNames = [
      t('stage.if', 'IF'),
      t('stage.id', 'ID'),
      t('stage.ex', 'EX'),
      t('stage.mem', 'MEM'),
      t('stage.wb', 'WB'),
    ];
    const cycleLabel = text(root, W / 2, 20, '', { anchor: 'middle', weight: '600', size: fontSizes.md });
    text(root, PILE_WAIT_X + PILE_W / 2, 20, t('label.waiting', 'Waiting'), {
      anchor: 'middle',
      fill: c.textMuted,
      size: fontSizes.xs,
    });
    text(root, PILE_DONE_X + PILE_W / 2, 20, t('label.retired', 'Done'), {
      anchor: 'middle',
      fill: c.textMuted,
      size: fontSizes.xs,
    });
    const boxes: SVGRectElement[] = [];
    for (let s = 0; s < stageCount; s += 1) {
      const x = BOX_X0 + s * BOX_STEP;
      text(root, x + BOX_W / 2, BOX_Y - 8, stageNames[s] ?? '', {
        anchor: 'middle',
        fill: c.textMuted,
        size: fontSizes.xs,
        weight: '600',
      });
      boxes.push(
        el(
          'rect',
          {
            x,
            y: BOX_Y,
            width: BOX_W,
            height: BOX_H,
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '4 3',
            'stroke-width': 1.5,
          },
          root,
        ),
      );
    }
    // 단계 사이 흐름 화살
    for (let s = 0; s + 1 < stageCount; s += 1) {
      const x = BOX_X0 + s * BOX_STEP + BOX_W;
      el('path', { d: `M${x + 2} ${BOX_Y + BOX_H / 2} l8 0 m-3 -3 l3 3 l-3 3`, stroke: c.border, fill: 'none' }, root);
    }

    // ── 명령어 표 (대기 더미 · 단계 칸 · 완료 더미 사이를 옮겨 다닌다)
    const tokenLayer = el('g', {}, root);
    type Token = { g: SVGGElement; rect: SVGRectElement; label: SVGGElement; inks: SVGTextElement[]; pose: Pose };
    const tokens: Token[] = program.map((line) => {
      const g = el('g', {}, tokenLayer);
      const rect = el(
        'rect',
        { x: 0, y: 0, width: BOX_W, height: BOX_H, rx: 6, fill: c.textMuted, 'vector-effect': 'non-scaling-stroke' },
        g,
      );
      const label = el('g', { opacity: 0 }, g);
      const space = line.indexOf(' ');
      const op = space < 0 ? line : line.slice(0, space);
      const args = space < 0 ? '' : line.slice(space + 1);
      const inks = [
        text(label, BOX_W / 2, 23, op, { anchor: 'middle', mono: true, weight: '700', fill: c.stateInk, size: fontSizes.md }),
        text(label, BOX_W / 2, 42, args, { anchor: 'middle', mono: true, fill: c.stateInk, size: fontSizes.sm }),
      ];
      const pose: Pose = { x: PILE_WAIT_X, y: PILE_BOTTOM, sx: PILE_W / BOX_W, sy: 0, o: 0 };
      const token: Token = { g, rect, label, inks, pose };
      paint(token);
      return token;
    });
    function paint(tk: Token): void {
      const p = tk.pose;
      tk.g.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${p.sx} ${p.sy})`);
      tk.label.setAttribute('opacity', String(p.o));
      tk.g.setAttribute('visibility', p.sy <= 0.001 ? 'hidden' : 'visible');
    }
    /** 칸 색과 글자 잉크를 함께 바꾼다 — 고정 타일에는 stateInk, 뒤집히는 타일에는 textInverse. */
    function tint(i: number, state: 'waiting' | 'flying' | 'written'): void {
      const tk = tokens[i];
      if (!tk) return;
      const fill = state === 'flying' ? c.itemComparing : state === 'written' ? c.itemSorted : c.textMuted;
      const ink = state === 'written' ? c.textInverse : c.stateInk;
      tk.rect.setAttribute('fill', fill);
      for (const n of tk.inks) n.setAttribute('fill', ink);
    }
    function moveToken(i: number, to: Pose, ms: number): void {
      const tk = tokens[i];
      if (!tk) return;
      const from = { ...tk.pose };
      animate(`tok${i}`, ms, (k) => {
        tk.pose = {
          x: lerp(from.x, to.x, k),
          y: lerp(from.y, to.y, k),
          sx: lerp(from.sx, to.sx, k),
          sy: lerp(from.sy, to.sy, k),
          o: lerp(from.o, to.o, k),
        };
        paint(tk);
      });
    }
    const slabSx = PILE_W / BOX_W;
    const slabSy = SLAB_H / BOX_H;
    const waitingPose = (i: number, n: number): Pose => ({
      x: PILE_WAIT_X,
      y: PILE_BOTTOM - (n - i) * SLAB_STEP,
      sx: slabSx,
      sy: slabSy,
      o: 0,
    });
    const hiddenPose = (n: number): Pose => ({
      x: PILE_WAIT_X,
      y: PILE_BOTTOM - n * SLAB_STEP,
      sx: slabSx,
      sy: 0,
      o: 0,
    });
    const stagePose = (s: number): Pose => ({ x: BOX_X0 + s * BOX_STEP, y: BOX_Y, sx: 1, sy: 1, o: 1 });
    const donePose = (i: number): Pose => ({
      x: PILE_DONE_X,
      y: PILE_BOTTOM - (i + 1) * SLAB_STEP,
      sx: slabSx,
      sy: slabSy,
      o: 0,
    });

    // ── 박자 축
    text(root, 12, COL_BASE - 20, t('label.pipelined', 'Pipelined'), { fill: c.text, size: fontSizes.xs, weight: '600' });
    text(root, 12, SERIAL_Y + 13, t('label.serial', 'One at a time'), { fill: c.text, size: fontSizes.xs, weight: '600' });
    text(root, 12, AXIS_Y + 14, t('label.axis', 'cycle'), { fill: c.textMuted, size: fontSizes.xs });
    el('line', { x1: AX0, y1: AXIS_Y, x2: AX1, y2: AXIS_Y, stroke: c.border }, root);
    el('line', { x1: AX0, y1: COL_BASE, x2: AX1, y2: COL_BASE, stroke: c.border, 'stroke-dasharray': '2 3' }, root);
    for (let k = 0; k <= axisMax; k += stageCount) {
      el('line', { x1: X(k), y1: AXIS_Y, x2: X(k), y2: AXIS_Y + 4, stroke: c.border }, root);
      if (k % (stageCount * 2) === 0) {
        text(root, X(k), AXIS_Y + 15, String(k), { anchor: 'middle', fill: c.textMuted, size: fontSizes.xs });
      }
    }

    // 앞 판의 파이프 윤곽 (옅은 점선)
    const ghostProfile = el(
      'path',
      { d: '', fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 3', 'stroke-width': 1 },
      root,
    );
    const columnLayer = el('g', {}, root);
    /** 이번 판의 박자별 일하는 단계 수. 판이 바뀌면 윤곽으로 넘어간다. */
    let profile: number[] = [];

    // 직렬 토막 — 사다리 끝값만큼 미리 만들고 너비로 드러낸다
    const serialSegs: SVGRectElement[] = [];
    for (let k = 0; k < maxCount; k += 1) {
      serialSegs.push(
        el(
          'rect',
          {
            x: X(k * stageCount),
            y: SERIAL_Y,
            width: 0,
            height: SERIAL_H,
            fill: k % 2 === 0 ? c.bgSubtle : c.border,
            stroke: c.textMuted,
            'stroke-width': 0.75,
          },
          root,
        ),
      );
    }
    let serialShown = 0;
    function drawSerial(cycles: number): void {
      serialShown = cycles;
      const seg = stageCount * px;
      for (let k = 0; k < serialSegs.length; k += 1) {
        const w = Math.max(0, Math.min(seg, cycles * px - k * seg));
        const r = serialSegs[k]!;
        r.setAttribute('width', String(w));
        r.setAttribute('visibility', w <= 0.01 ? 'hidden' : 'visible');
      }
    }

    // 지연 괄호
    const latG = el('g', { visibility: 'hidden' }, root);
    const latPath = el('path', { d: '', fill: 'none', stroke: c.itemActive, 'stroke-width': 2 }, latG);
    const latText = text(latG, 0, LAT_Y + 14, '', { anchor: 'middle', fill: c.text, size: fontSizes.xs, weight: '600' });
    let latFrom = 0;
    let latTo = 0;
    function drawLatency(from: number, to: number): void {
      latFrom = from;
      latTo = to;
      const a = X(from);
      const b = X(to);
      latPath.setAttribute('d', `M${a} ${LAT_Y - 4} L${a} ${LAT_Y} L${b} ${LAT_Y} L${b} ${LAT_Y - 4}`);
      latText.setAttribute('x', String((a + b) / 2));
    }

    // 끝 표시 — 파이프 커서 · 직렬 끝 · 앞 판의 자리
    const ghostPipe = el(
      'line',
      { y1: MARK_TOP, y2: MARK_BOTTOM, stroke: c.textMuted, 'stroke-dasharray': '3 3', visibility: 'hidden' },
      root,
    );
    const ghostSerial = el(
      'line',
      { y1: SERIAL_Y - 6, y2: MARK_BOTTOM, stroke: c.textMuted, 'stroke-dasharray': '3 3', visibility: 'hidden' },
      root,
    );
    const serialMark = el('line', { y1: SERIAL_Y - 6, y2: MARK_BOTTOM, stroke: c.text, 'stroke-width': 2 }, root);
    // 끝 수는 막대 줄 안, 끝 표시 오른쪽에 둔다 — 위에 두면 지연 괄호의 글과 겹친다
    const serialMarkText = text(root, 0, SERIAL_Y + 13, '', { fill: c.text, size: fontSizes.xs, weight: '600' });
    const cursor = el('line', { y1: MARK_TOP, y2: MARK_BOTTOM, stroke: c.primary, 'stroke-width': 2 }, root);
    const cursorText = text(root, 0, MARK_TOP - 4, '', { anchor: 'middle', fill: c.primary, size: fontSizes.xs, weight: '700' });
    let cursorAt = 0;
    function drawCursor(cycle: number): void {
      cursorAt = cycle;
      const x = X(cycle);
      cursor.setAttribute('x1', String(x));
      cursor.setAttribute('x2', String(x));
      cursorText.setAttribute('x', String(x));
    }
    let serialMarkAt = 0;
    function drawSerialMark(cycle: number): void {
      serialMarkAt = cycle;
      const x = X(cycle);
      serialMark.setAttribute('x1', String(x));
      serialMark.setAttribute('x2', String(x));
      const nearEdge = x > W - 40;
      serialMarkText.setAttribute('x', String(nearEdge ? x - 5 : x + 5));
      serialMarkText.setAttribute('text-anchor', nearEdge ? 'end' : 'start');
    }
    function placeLine(line: SVGLineElement, cycle: number): void {
      line.setAttribute('x1', String(X(cycle)));
      line.setAttribute('x2', String(X(cycle)));
    }

    // 간격 괄호 — 두 끝 사이
    const gapG = el('g', { visibility: 'hidden' }, root);
    const gapPath = el('path', { d: '', fill: 'none', stroke: c.text, 'stroke-width': 1.5 }, gapG);
    const gapText = text(gapG, 0, GAP_Y + 16, '', { anchor: 'middle', fill: c.text, size: fontSizes.sm, weight: '600' });
    function drawGap(from: number, to: number): void {
      const a = X(from);
      const b = X(to);
      gapPath.setAttribute('d', `M${a} ${GAP_Y - 6} L${a} ${GAP_Y} L${b} ${GAP_Y} L${b} ${GAP_Y - 6}`);
      gapText.setAttribute('x', String(Math.min(Math.max((a + b) / 2, AX0 + 30), W - 40)));
    }

    // 캡션
    const cap1 = text(root, W / 2, CAP1_Y, '', { anchor: 'middle', fill: c.text, size: fontSizes.sm });
    const cap2 = text(root, W / 2, CAP2_Y, '', { anchor: 'middle', fill: c.textMuted, size: fontSizes.sm });

    /** 이번 판의 명령어 수 */
    let count = 0;
    /** WB 를 마쳤지만 아직 WB 칸에 있는 명령어 — 다음 박자에 완료 더미로 간다. */
    let leaving: number[] = [];
    function flushLeaving(ms: number): void {
      for (const i of leaving) moveToken(i, donePose(i), ms);
      leaving = [];
    }
    /** 앞 판의 끝 (파이프 · 직렬). 없으면 -1. */
    let lastPipeEnd = -1;
    let lastSerialEnd = -1;

    function setBox(s: number, busy: boolean): void {
      const b = boxes[s];
      if (!b) return;
      b.setAttribute('stroke', busy ? c.text : c.border);
      b.setAttribute('stroke-dasharray', busy ? '' : '4 3');
    }

    function clear(): void {
      cancelAll();
      count = 0;
      leaving = [];
      lastPipeEnd = -1;
      lastSerialEnd = -1;
      profile = [];
      columnLayer.replaceChildren();
      ghostProfile.setAttribute('d', '');
      for (let i = 0; i < tokens.length; i += 1) {
        tokens[i]!.pose = hiddenPose(0);
        paint(tokens[i]!);
      }
      for (let s = 0; s < stageCount; s += 1) setBox(s, false);
      drawSerial(0);
      drawSerialMark(0);
      serialMarkText.textContent = '';
      serialMark.setAttribute('visibility', 'hidden');
      drawCursor(0);
      cursorText.textContent = '';
      ghostPipe.setAttribute('visibility', 'hidden');
      ghostSerial.setAttribute('visibility', 'hidden');
      latG.setAttribute('visibility', 'hidden');
      gapG.setAttribute('visibility', 'hidden');
      cycleLabel.textContent = t('label.cycle', 'Cycle {cycle}', { cycle: 0 });
      cap1.textContent = '';
      cap2.textContent = '';
    }

    function profilePath(p: number[]): string {
      if (p.length === 0) return '';
      let d = `M${X(0)} ${COL_BASE}`;
      p.forEach((busy, idx) => {
        const y = COL_BASE - busy * COL_UNIT;
        d += ` L${X(idx)} ${y} L${X(idx + 1)} ${y}`;
      });
      d += ` L${X(p.length)} ${COL_BASE}`;
      return d;
    }

    const stage: FiveStagePipelineStage = {
      clear,

      startRound({ count: n, ms }) {
        const prevCount = count;
        count = n;
        leaving = [];
        // 앞 판의 파이프 윤곽과 끝 자리를 옅게 남긴다
        ghostProfile.setAttribute('d', profilePath(profile));
        profile = [];
        columnLayer.replaceChildren();
        if (lastPipeEnd >= 0) {
          placeLine(ghostPipe, lastPipeEnd);
          ghostPipe.setAttribute('visibility', 'visible');
        }
        if (lastSerialEnd >= 0) {
          placeLine(ghostSerial, lastSerialEnd);
          ghostSerial.setAttribute('visibility', 'visible');
        }
        gapG.setAttribute('visibility', 'hidden');
        latG.setAttribute('visibility', 'hidden');
        cursorText.textContent = '';
        const fromCursor = cursorAt;
        animate('cursor', ms, (k) => drawCursor(lerp(fromCursor, 0, k)));
        for (let s = 0; s < stageCount; s += 1) setBox(s, false);
        cycleLabel.textContent = t('label.cycle', 'Cycle {cycle}', { cycle: 0 });
        // 명령어가 모두 대기 더미로 돌아온다 — 새로 든 것은 더미 위에서 자라난다
        for (let i = 0; i < tokens.length; i += 1) {
          const tk = tokens[i]!;
          if (i < n) {
            if (i >= prevCount) tk.pose = hiddenPose(n);
            tint(i, 'waiting');
            moveToken(i, waitingPose(i, n), ms);
          } else {
            moveToken(i, hiddenPose(n), ms);
          }
        }
      },

      planSerial({ serialCycles, ms }) {
        const from = serialShown;
        const fromMark = serialMarkAt;
        serialMark.setAttribute('visibility', 'visible');
        serialMarkText.textContent = String(serialCycles);
        animate('serial', ms * 1.6, (k) => {
          drawSerial(lerp(from, serialCycles, k));
          drawSerialMark(lerp(fromMark, serialCycles, k));
        });
        lastSerialEnd = serialCycles;
      },

      tick({ cycle, slots, busy, ms }) {
        cycleLabel.textContent = t('label.cycle', 'Cycle {cycle}', { cycle });
        // 기계: 앞 박자에 WB 를 마친 명령어가 나가고, 단계 칸에 든 명령어가 한 칸씩 옮겨 간다
        flushLeaving(ms);
        slots.forEach((i, s) => {
          setBox(s, i >= 0);
          if (i < 0) return;
          tint(i, 'flying');
          moveToken(i, stagePose(s), ms);
        });
        // 축: 이 박자의 기둥이 선다
        profile.push(busy);
        const full = busy === stageCount;
        const col = el(
          'rect',
          {
            x: X(cycle - 1) + 0.75,
            y: COL_BASE,
            width: Math.max(1, px - 1.5),
            height: 0,
            fill: full ? c.accent : c.textMuted,
          },
          columnLayer,
        );
        const h = busy * COL_UNIT;
        animate(`col${cycle}`, ms, (k) => {
          col.setAttribute('y', String(COL_BASE - h * k));
          col.setAttribute('height', String(h * k));
        });
        const fromCursor = cursorAt;
        cursorText.textContent = String(cycle);
        animate('cursor', ms, (k) => drawCursor(lerp(fromCursor, cycle, k)));
      },

      retire({ index, ifCycle, wbCycle, latencyCycles, ms }) {
        // 이 박자 동안 결과를 쓴다 — 칸은 다음 박자에 비운다
        tint(index, 'written');
        leaving.push(index);
        // 지연 괄호가 이 명령어의 IF 박자부터 WB 박자까지로 미끄러진다 — 길이는 그대로
        const wasHidden = latG.getAttribute('visibility') === 'hidden';
        latText.textContent = t('label.latency', 'Latency {latency}', { latency: latencyCycles });
        latG.setAttribute('visibility', 'visible');
        const a0 = wasHidden ? ifCycle - 1 : latFrom;
        const b0 = wasHidden ? wbCycle : latTo;
        animate('latency', ms, (k) => drawLatency(lerp(a0, ifCycle - 1, k), lerp(b0, wbCycle, k)));
      },

      endRound({ pipeCycles, serialCycles, ms }) {
        flushLeaving(ms);
        for (let s = 0; s < stageCount; s += 1) setBox(s, false);
        cursorText.textContent = String(pipeCycles);
        drawCursor(pipeCycles);
        lastPipeEnd = pipeCycles;
        gapText.textContent = t('label.gap', '+{gap} cycles', { gap: serialCycles - pipeCycles });
        gapG.setAttribute('visibility', 'visible');
        animate('gap', ms * 1.6, (k) => drawGap(pipeCycles, lerp(pipeCycles, serialCycles, k)));
      },

      setCaption(line1, line2) {
        cap1.textContent = line1;
        cap2.textContent = line2;
      },

      destroy() {
        destroyed = true;
        cancelAll();
        root.remove();
      },
    };

    clear();
    return stage;
  },
};
