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
} from '@ffacet/core/runtime';
import type {
  InterruptPos,
  InterruptPreemptsScene,
  InterruptJump,
} from './scene';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 384;
const W = PIECE_CANVAS_W;

/** 운동 길이 (ms). 걸음 벽시계 = 운동 + stepMs */
const RUN_MS = 500;
const CALL_RUN_MS = 900;
const JUMP_MS = 900;
const FRAME_MS = 16;

// ── 자리 ──────────────────────────────────────────────────────────
const PAD = 36;
const GAP = Math.min(150, Math.round(W * 0.2));
const COL_W = Math.floor((W - PAD * 2 - GAP) / 2);
const PROG_X = PAD;
const HAND_X = W - PAD - COL_W;
const ROWS_TOP = 92;
const ROWS_BOTTOM = 316;
const ROW_PITCH_MAX = 38;
const ROW_GAP = 4;
const DEVICE_Y = 14;
const DEVICE_H = 30;
const SLOT_W = Math.min(GAP - 30, 84);
const SLOT_H = 32;

interface Geometry {
  pitch: number;
  rowH: number;
  handOffset: number;
}

function geometry(scene: InterruptPreemptsScene): Geometry {
  const nProg = scene.program.length;
  const nHand = scene.handler.length;
  // 처리기는 프로그램 한 칸 아래에서 시작해 건너가는 줄이 가로지르게 한다. 담을 수 없으면 맨 위에서.
  const handOffset = nHand + 1 <= nProg ? 1 : 0;
  const rows = Math.max(nProg, nHand + handOffset);
  const pitch = Math.min(ROW_PITCH_MAX, (ROWS_BOTTOM - ROWS_TOP) / rows);
  return { pitch, rowH: pitch - ROW_GAP, handOffset };
}

function rowBox(g: Geometry, pos: InterruptPos): { x: number; y: number; w: number; h: number } {
  const slot = pos.seg === 'program' ? pos.index : pos.index + g.handOffset;
  return {
    x: pos.seg === 'program' ? PROG_X : HAND_X,
    y: ROWS_TOP + slot * g.pitch,
    w: COL_W,
    h: g.rowH,
  };
}

/** 실행 자리 점은 두 칸 사이 틈을 향한 가장자리에 선다 */
function pointerAt(g: Geometry, pos: InterruptPos): { x: number; y: number } {
  const b = rowBox(g, pos);
  return { x: pos.seg === 'program' ? b.x + b.w : b.x, y: b.y + b.h / 2 };
}

function slotCenter(): { x: number; y: number } {
  return { x: PROG_X + COL_W + GAP / 2, y: ROWS_BOTTOM - SLOT_H / 2 - 6 };
}

type Pt = { x: number; y: number };

/** 건너간 줄은 이차 곡선 — 나갈 때는 위로, 돌아올 때는 아래로 휜다 */
function jumpCurve(g: Geometry, j: { kind: 'out' | 'back'; from: InterruptPos; to: InterruptPos }): [Pt, Pt, Pt] {
  const a = pointerAt(g, j.from);
  const b = pointerAt(g, j.to);
  const bend = g.pitch * 1.2;
  const c = {
    x: (a.x + b.x) / 2,
    y: j.kind === 'out' ? Math.min(a.y, b.y) - bend : Math.max(a.y, b.y) + bend,
  };
  return [a, c, b];
}

function bezier(q: [Pt, Pt, Pt], s: number): Pt {
  const [a, c, b] = q;
  const u = 1 - s;
  return { x: u * u * a.x + 2 * u * s * c.x + s * s * b.x, y: u * u * a.y + 2 * u * s * c.y + s * s * b.y };
}

/** 0..s 만큼 잘라 낸 곡선 (de Casteljau) */
function subCurve(q: [Pt, Pt, Pt], s: number): [Pt, Pt, Pt] {
  const [a, c] = q;
  const c1 = { x: a.x + (c.x - a.x) * s, y: a.y + (c.y - a.y) * s };
  return [a, c1, bezier(q, s)];
}

function r1(n: number): number {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
}

/** 시각 · 틱 표시. 셈은 반올림하지 않은 값으로 하고 보일 때만 소수 첫째 자리 */
function fmt(n: number): string {
  return String(r1(n));
}

function curvePath(q: [Pt, Pt, Pt]): string {
  const [a, c, b] = q;
  return `M${r1(a.x)} ${r1(a.y)} Q${r1(c.x)} ${r1(c.y)} ${r1(b.x)} ${r1(b.y)}`;
}

function arrowHead(q: [Pt, Pt, Pt], size: number): string {
  const [, c, b] = q;
  const dx = b.x - c.x;
  const dy = b.y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const bx = b.x - ux * size;
  const by = b.y - uy * size;
  const pts: Pt[] = [
    { x: b.x, y: b.y },
    { x: bx + px * size * 0.55, y: by + py * size * 0.55 },
    { x: bx - px * size * 0.55, y: by - py * size * 0.55 },
  ];
  return pts.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' ');
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function handlerLabel(t: Translate, op: string): string {
  switch (op) {
    case 'read':
      return t('label.read', 'Read from device');
    case 'store':
      return t('label.store', 'Put in buffer');
    case 'return':
      return t('label.return', 'Return');
    default:
      throw new Error(`interrupt-preempts: 모르는 처리기 명령 ${op}`);
  }
}

function deviceLabel(t: Translate, device: string): string {
  if (device === 'keyboard') return t('label.keyboard', 'Keyboard');
  throw new Error(`interrupt-preempts: 모르는 장치 ${device}`);
}

function samePos(a: InterruptPos, b: InterruptPos): boolean {
  return a.seg === b.seg && a.index === b.index;
}

/** 정적 그리기가 돌려주는 손잡이 — 운동이 만지는 것만 */
interface Handles {
  pointer: SVGCircleElement;
  clock: SVGTextElement;
  fills: Map<string, SVGRectElement>;
  spans: Map<string, SVGTextElement>;
  callMark: SVGGElement | null;
  waitBar: SVGRectElement | null;
  slotText: SVGTextElement | null;
  jumps: Map<string, { path: SVGPathElement; head: SVGPolygonElement }>;
  fx: SVGGElement;
}

function key(pos: InterruptPos): string {
  return `${pos.seg}:${pos.index}`;
}

export const interruptPreemptsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [PROG_TINT, HAND_TINT] = categorical(2, 'pastel');
    if (PROG_TINT === undefined || HAND_TINT === undefined) {
      throw new Error('interrupt-preempts: 두 갈래 색을 얻지 못했다');
    }
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: number | string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function captionLines(scene: InterruptPreemptsScene): string[] {
      const step = scene.step;
      if (step === null) {
        return [t('caption.start', 'Instructions in the program: {n}. No call yet.', { n: scene.program.length })];
      }
      if (step.kind === 'accept') {
        return [
          t('caption.accept', 'Boundary at time {at}: the call is taken. Return point saved: {ret}', {
            at: fmt(step.at),
            ret: step.returnTo + 1,
          }),
          t('caption.wait', 'Called: {called} · taken: {at} · waited: {wait}', {
            called: fmt(step.calledAt),
            at: fmt(step.at),
            wait: fmt(step.wait),
          }),
        ];
      }
      if (step.kind === 'return') {
        return [
          t('caption.return', 'Time {at}: the handler is done. Back to the saved point: {ret}', {
            at: fmt(step.at),
            ret: step.to + 1,
          }),
        ];
      }
      const lines: string[] = [];
      if (step.seg === 'handler') {
        const op = scene.handler[step.index];
        if (op === undefined) throw new Error(`interrupt-preempts: 처리기 명령 ${step.index} 이 없다`);
        lines.push(
          t('caption.handler', 'Handler: {name}. Time: {from} → {to}', {
            name: handlerLabel(t, op),
            from: fmt(step.from),
            to: fmt(step.to),
          }),
        );
      } else if (step.call !== null) {
        lines.push(
          t('caption.call', 'Instruction {n} runs. {device} calls at time {at}; the instruction keeps going.', {
            n: step.index + 1,
            device: deviceLabel(t, scene.device),
            at: fmt(step.call),
          }),
        );
      } else {
        lines.push(
          t('caption.run', 'Instruction {n} runs. Time: {from} → {to}', {
            n: step.index + 1,
            from: fmt(step.from),
            to: fmt(step.to),
          }),
        );
      }
      if (scene.finish !== null && step.seg === 'program' && step.index === scene.program.length - 1) {
        lines.push(
          t('caption.finish', 'Program ends at: {end} · without the call: {plain} · later by: {delay}', {
            end: fmt(scene.finish.end),
            plain: fmt(scene.finish.plain),
            delay: fmt(scene.finish.delay),
          }),
        );
      }
      return lines;
    }

    /** 그 장면의 화면 전체를 세운다 */
    function drawStatic(scene: InterruptPreemptsScene): Handles {
      svg.textContent = '';
      const g = geometry(scene);
      const root = el('g', {}, svg);

      // 시계
      const clock = label(root, PAD, DEVICE_Y + DEVICE_H / 2, t('label.time', 'Time: {t}', { t: fmt(scene.t) }), {
        size: fontSizes.md,
        weight: 600,
      });

      // 부르는 장치
      const pending = scene.call !== null && scene.accepted === null;
      const devX = HAND_X + COL_W / 2;
      el(
        'rect',
        {
          x: r1(devX - 60),
          y: DEVICE_Y,
          width: 120,
          height: DEVICE_H,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: pending ? colors.itemComparing : colors.border,
          'stroke-width': pending ? 2 : 1,
        },
        root,
      );
      label(root, devX, DEVICE_Y + DEVICE_H / 2, deviceLabel(t, scene.device), { anchor: 'middle' });

      // 머리말
      label(root, PROG_X, ROWS_TOP - 12, t('label.program', 'Program'), { fill: colors.textMuted, weight: 600 });
      const handTop = rowBox(g, { seg: 'handler', index: 0 }).y;
      label(root, HAND_X, handTop - 12, t('label.handler', 'Handler'), { fill: colors.textMuted, weight: 600 });

      // 돌아올 자리
      const sc = slotCenter();
      label(root, sc.x, sc.y - SLOT_H / 2 - 10, t('label.saved', 'Return point'), {
        anchor: 'middle',
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      el(
        'rect',
        {
          x: r1(sc.x - SLOT_W / 2),
          y: r1(sc.y - SLOT_H / 2),
          width: SLOT_W,
          height: SLOT_H,
          rx: 4,
          fill: colors.bg,
          stroke: scene.saved === null ? colors.border : colors.primary,
          'stroke-width': scene.saved === null ? 1 : 2,
          'stroke-dasharray': scene.saved === null ? '4 3' : 'none',
        },
        root,
      );
      const slotText =
        scene.saved === null
          ? null
          : label(root, sc.x, sc.y, String(scene.saved + 1), {
              anchor: 'middle',
              size: fontSizes.lg,
              weight: 700,
              mono: true,
            });

      // 줄
      const ranMap = new Map<string, { from: number; to: number }>();
      for (const r of scene.ran) ranMap.set(key(r), { from: r.from, to: r.to });
      const fills = new Map<string, SVGRectElement>();
      const spans = new Map<string, SVGTextElement>();
      const rowsLayer = el('g', {}, root);
      const drawRow = (pos: InterruptPos, text: string, mono: boolean): void => {
        const b = rowBox(g, pos);
        el(
          'rect',
          { x: b.x, y: r1(b.y), width: b.w, height: r1(b.h), rx: 4, fill: colors.bg, stroke: colors.border },
          rowsLayer,
        );
        const ran = ranMap.get(key(pos));
        if (ran !== undefined) {
          fills.set(
            key(pos),
            el(
              'rect',
              {
                x: b.x,
                y: r1(b.y),
                width: b.w,
                height: r1(b.h),
                rx: 4,
                fill: pos.seg === 'program' ? PROG_TINT : HAND_TINT,
              },
              rowsLayer,
            ),
          );
        }
        label(rowsLayer, b.x + (mono ? 18 : 12), b.y + b.h / 2, text, {
          mono,
          weight: mono ? 700 : 400,
          anchor: mono ? 'middle' : 'start',
        });
        if (ran !== undefined) {
          spans.set(
            key(pos),
            label(
              rowsLayer,
              b.x + b.w - 16,
              b.y + b.h / 2,
              t('label.span', '{from} → {to}', { from: fmt(ran.from), to: fmt(ran.to) }),
              { anchor: 'end', size: fontSizes.xs, fill: colors.textMuted, mono: true },
            ),
          );
        }
        if (samePos(pos, scene.at)) {
          el(
            'rect',
            {
              x: b.x,
              y: r1(b.y),
              width: b.w,
              height: r1(b.h),
              rx: 4,
              fill: 'none',
              stroke: colors.primary,
              'stroke-width': 2,
            },
            rowsLayer,
          );
        }
      };
      scene.program.forEach((_id, i) => drawRow({ seg: 'program', index: i }, String(i + 1), true));
      scene.handler.forEach((op, i) => drawRow({ seg: 'handler', index: i }, handlerLabel(t, op), false));

      // 부름 표 — 온 자리와 받은 경계 사이가 기다린 몫이다
      let callMark: SVGGElement | null = null;
      let waitBar: SVGRectElement | null = null;
      if (scene.call !== null) {
        const pos: InterruptPos = { seg: 'program', index: scene.call.index };
        const b = rowBox(g, pos);
        const ran = ranMap.get(key(pos));
        if (ran === undefined) throw new Error('interrupt-preempts: 부름이 온 명령이 실행 기록에 없다');
        const frac = (scene.call.at - ran.from) / (ran.to - ran.from);
        const mx = b.x + frac * b.w;
        if (scene.accepted !== null) {
          waitBar = el(
            'rect',
            { x: r1(mx), y: r1(b.y + b.h - 5), width: r1(b.x + b.w - mx), height: 5, fill: colors.itemComparing },
            root,
          );
        }
        callMark = el('g', {}, root);
        el(
          'line',
          {
            x1: r1(mx),
            y1: r1(b.y - 2),
            x2: r1(mx),
            y2: r1(b.y + b.h + 2),
            stroke: colors.itemComparing,
            'stroke-width': 2,
          },
          callMark,
        );
        el('circle', { cx: r1(mx), cy: r1(b.y - 2), r: 4, fill: colors.itemComparing }, callMark);
        label(callMark, mx - 6, b.y + b.h / 2, t('label.call', 'Call: {t}', { t: fmt(scene.call.at) }), {
          anchor: 'end',
          size: fontSizes.xs,
          fill: colors.text,
        });
      }

      // 건너간 자취
      const jumps = new Map<string, { path: SVGPathElement; head: SVGPolygonElement }>();
      for (const j of scene.jumps) {
        const q = jumpCurve(g, j);
        const path = el(
          'path',
          {
            d: curvePath(q),
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 4',
          },
          root,
        );
        const head = el('polygon', { points: arrowHead(q, 8), fill: colors.textMuted }, root);
        jumps.set(j.kind, { path, head });
      }

      // 실행 자리
      const pa = pointerAt(g, scene.at);
      const pointer = el(
        'circle',
        {
          cx: r1(pa.x),
          cy: r1(pa.y),
          r: 7,
          fill: colors.primary,
          stroke: colors.bg,
          'stroke-width': 2,
        },
        root,
      );

      // 캡션
      const lines = captionLines(scene);
      lines.forEach((line, i) => {
        label(root, W / 2, H - 46 + i * (smPx + 10), line, {
          anchor: 'middle',
          size: i === 0 ? fontSizes.md : fontSizes.sm,
          fill: i === 0 ? colors.text : colors.textMuted,
        });
      });

      const fx = el('g', {}, root);
      return { pointer, clock, fills, spans, callMark, waitBar, slotText, jumps, fx };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        let id: ReturnType<typeof setTimeout> | null = null;
        const done = (): void => {
          waiters.delete(done);
          if (id !== null) {
            clearTimeout(id);
            timers.delete(id);
          }
          resolve();
        };
        waiters.add(done);
        id = setTimeout(done, ms);
        timers.add(id);
      });
    }

    /** 한 시계로 0→1 을 흘린다. 도중에 세대가 바뀌면 거짓 */
    async function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const n = Math.max(1, Math.round(ms / FRAME_MS));
      frame(0);
      for (let i = 1; i <= n; i++) {
        if (destroyed || mine !== gen) return false;
        await wait(FRAME_MS);
        if (destroyed || mine !== gen) return false;
        frame(i / n);
      }
      return true;
    }

    function setPointer(h: Handles, p: Pt): void {
      h.pointer.setAttribute('cx', String(r1(p.x)));
      h.pointer.setAttribute('cy', String(r1(p.y)));
    }

    function chip(h: Handles, text: string): SVGTextElement {
      return label(h.fx, 0, 0, text, { anchor: 'middle', size: fontSizes.lg, weight: 700, mono: true, fill: colors.primary });
    }

    function moveChip(node: SVGTextElement, a: Pt, b: Pt, p: number): void {
      node.setAttribute('x', String(r1(a.x + (b.x - a.x) * p)));
      node.setAttribute('y', String(r1(a.y + (b.y - a.y) * p)));
    }

    async function animateRun(next: InterruptPreemptsScene, h: Handles, mine: number): Promise<void> {
      const step = next.step;
      if (step === null || step.kind !== 'run') return;
      const g = geometry(next);
      const pos: InterruptPos = { seg: step.seg, index: step.index };
      const fill = h.fills.get(key(pos));
      const span = h.spans.get(key(pos));
      const b = rowBox(g, pos);
      const from = pointerAt(g, step.was);
      const to = pointerAt(g, pos);
      const slide = !samePos(step.was, pos);
      span?.setAttribute('visibility', 'hidden');

      const ms = step.call === null ? RUN_MS : CALL_RUN_MS;
      let dot: SVGCircleElement | null = null;
      let callFrac = 0;
      let callTo: Pt = { x: 0, y: 0 };
      const devFrom: Pt = { x: HAND_X + COL_W / 2, y: DEVICE_Y + DEVICE_H };
      if (step.call !== null && h.callMark !== null) {
        callFrac = (step.call - step.from) / (step.to - step.from);
        callTo = { x: b.x + callFrac * b.w, y: b.y - 2 };
        h.callMark.setAttribute('visibility', 'hidden');
        dot = el('circle', { cx: r1(devFrom.x), cy: r1(devFrom.y), r: 5, fill: colors.itemComparing }, h.fx);
      }
      const ok = await tween(ms, mine, (p) => {
        const e = ease(p);
        if (slide) setPointer(h, { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
        fill?.setAttribute('width', String(r1(b.w * p)));
        h.clock.textContent = t('label.time', 'Time: {t}', { t: fmt(step.from + (step.to - step.from) * p) });
        if (dot !== null && h.callMark !== null) {
          // 부름은 명령이 그 몫만큼 흘렀을 때 닿는다 — 명령은 멈추지 않는다
          const q = Math.min(1, p / callFrac);
          dot.setAttribute('cx', String(r1(devFrom.x + (callTo.x - devFrom.x) * q)));
          dot.setAttribute('cy', String(r1(devFrom.y + (callTo.y - devFrom.y) * q)));
          if (p >= callFrac) h.callMark.removeAttribute('visibility');
        }
      });
      if (!ok) return;
    }

    async function animateJump(next: InterruptPreemptsScene, h: Handles, mine: number): Promise<void> {
      const step = next.step;
      if (step === null || step.kind === 'run') return;
      const g = geometry(next);
      const jump: InterruptJump | undefined = next.jumps[next.jumps.length - 1];
      if (jump === undefined) throw new Error('interrupt-preempts: 건너간 자취가 없다');
      const q = jumpCurve(g, jump);
      const trail = h.jumps.get(jump.kind);
      const sc = slotCenter();
      const progPos: InterruptPos = { seg: 'program', index: step.kind === 'accept' ? step.returnTo : step.to };
      const pb = rowBox(g, progPos);
      const numAt: Pt = { x: pb.x + 18, y: pb.y + pb.h / 2 };
      const slotAt: Pt = { x: sc.x, y: sc.y };
      const chipText = String((step.kind === 'accept' ? step.returnTo : step.saved) + 1);
      const moving = chip(h, chipText);
      const [chipFrom, chipTo] = step.kind === 'accept' ? [numAt, slotAt] : [slotAt, numAt];
      h.slotText?.setAttribute('visibility', 'hidden');
      trail?.path.setAttribute('d', curvePath(subCurve(q, 0)));
      trail?.head.setAttribute('visibility', 'hidden');
      const start = pointerAt(g, step.was);
      setPointer(h, start);
      moveChip(moving, chipFrom, chipTo, 0);

      // 적는 것(또는 꺼내는 것)과 건너가는 것을 한 시계로 흘린다
      const CHIP_PART = 0.45;
      const ok = await tween(JUMP_MS, mine, (p) => {
        const cp = step.kind === 'accept' ? Math.min(1, p / CHIP_PART) : Math.max(0, (p - (1 - CHIP_PART)) / CHIP_PART);
        moveChip(moving, chipFrom, chipTo, ease(cp));
        const jp = step.kind === 'accept' ? Math.max(0, (p - CHIP_PART) / (1 - CHIP_PART)) : Math.min(1, p / (1 - CHIP_PART));
        const s = ease(jp);
        setPointer(h, bezier(q, s));
        trail?.path.setAttribute('d', curvePath(subCurve(q, s)));
        if (jp >= 1) trail?.head.removeAttribute('visibility');
      });
      if (!ok) return;
    }

    return {
      render(next: InterruptPreemptsScene, _prev: InterruptPreemptsScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return Promise.resolve();
        const h = drawStatic(next);
        if (!opts.animate || next.step === null) return Promise.resolve();
        const step = next.step;
        return (async () => {
          if (step.kind === 'run') await animateRun(next, h, mine);
          else await animateJump(next, h, mine);
          if (mine === gen && !destroyed) drawStatic(next);
        })();
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
