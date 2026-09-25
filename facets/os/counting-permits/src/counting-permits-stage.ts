/**
 * counting-permits-stage — 표가 줄고 는다.
 *
 * 위에는 스레드마다 프로그램 줄, 아래에는 한 방이 있다. 방의 문에 세마포어가 서 있고
 * 그 안에 남은 표가 놓인다. 스레드는 표를 하나 집어 문을 지나 안으로 들어가고,
 * 표가 없으면 문 앞 줄 끝에서 잠든다. 나오는 스레드의 표는 줄이 있으면 문의 표 자리를
 * 거치지 않고 줄 맨 앞에게 곧장 날아가고, 줄이 비었을 때만 표 자리로 돌아간다.
 *
 * 정적 그리기(drawStatic)가 정본이다. 운동은 그 위에 "아직 못 온 만큼" 을 덧그린 뒤
 * 끝에 정적 그리기를 한 번 더 한다.
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
} from '@ffacet/core/runtime';
import type { CountingPermitsScene, PermitStep } from './scene.js';

const H = 330;
const NS = 'http://www.w3.org/2000/svg';
const PAD = 16;
const CHIP_W = 34;
const CHIP_H = 26;
const TOKEN_R = 7;
const ASLEEP = '0.5';
const FRAME_MS = 16;
/** 한 걸음의 운동 길이 — 드나듦 · 건넴(두 구간) · 일 한 줄 */
const MOVE_MS = 480;
const HAND_MS = 760;
const WORK_MS = 260;

type Pt = { x: number; y: number };

type Geometry = {
  colW: number;
  progTop: number;
  lineH: number;
  lineY(i: number): number;
  colX(i: number): number;
  zoneLabelY: number;
  midY: number;
  outside(i: number): Pt;
  done(i: number): Pt;
  queue(i: number): Pt;
  slot(k: number): Pt;
  tray(j: number): Pt;
  gate: { x: number; y: number; w: number; h: number };
  room: { x: number; y: number; w: number; h: number };
  captionY: number;
};

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function geometry(scene: CountingPermitsScene): Geometry {
  const W = PIECE_CANVAS_W;
  const n = Math.max(1, scene.threads.length);
  const maxLines = Math.max(1, ...scene.threads.map((th) => th.lines.length));
  const progTop = 12;
  const lineH = Math.min(17, 76 / maxLines);
  const colW = (W - 2 * PAD) / n;
  const progBottom = progTop + 30 + maxLines * lineH;

  const zoneLabelY = progBottom + 20;
  const top = zoneLabelY + 16;
  const bottom = H - 46;
  const midY = (top + bottom) / 2;
  const rowGap = (bottom - top) / n;

  const outsideX = PAD + CHIP_W / 2 + 4;
  const doneX = W - PAD - CHIP_W / 2 - 4;
  const gateW = 86;
  const gateX = W * 0.44;
  const gateH = Math.min(bottom - top, 104);
  const slotX = gateX + gateW / 2 + 92;
  const slotGap = Math.min(52, (bottom - top) / Math.max(1, scene.permits));

  const queueStart = gateX - gateW / 2 - 16 - CHIP_W / 2;
  const queueRoom = queueStart - (outsideX + CHIP_W + 12);
  const queueGap = Math.min(CHIP_W + 10, queueRoom / Math.max(1, n - 1));

  const trayGap = Math.min(22, (gateW - 16) / Math.max(1, scene.permits));

  return {
    colW,
    progTop,
    lineH,
    lineY: (i) => progTop + 36 + i * lineH,
    colX: (i) => PAD + i * colW,
    zoneLabelY,
    midY,
    outside: (i) => ({ x: outsideX, y: top + (i + 0.5) * rowGap }),
    done: (i) => ({ x: doneX, y: top + (i + 0.5) * rowGap }),
    queue: (i) => ({ x: queueStart - i * queueGap, y: midY }),
    slot: (k) => ({ x: slotX, y: midY + (k - (scene.permits - 1) / 2) * slotGap }),
    tray: (j) => ({
      x: gateX + (j - (scene.permits - 1) / 2) * trayGap,
      y: midY + gateH / 2 - 18,
    }),
    gate: { x: gateX - gateW / 2, y: midY - gateH / 2, w: gateW, h: gateH },
    room: {
      x: gateX,
      y: top - 8,
      w: doneX - CHIP_W / 2 - 18 - gateX,
      h: bottom - top + 16,
    },
    captionY: H - 16,
  };
}

/** 스레드가 쥔 표는 조각의 오른쪽 위 모서리에 붙는다 */
function heldSpot(p: Pt): Pt {
  return { x: p.x + CHIP_W / 2, y: p.y - CHIP_H / 2 };
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 구간 [a, b] 안의 진행률 */
function span(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return ease((p - a) / (b - a));
}

function lerp(a: Pt, b: Pt, q: number): Pt {
  return { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q };
}

function motionMs(step: PermitStep): number {
  if (step.kind === 'hand') return HAND_MS;
  if (step.kind === 'work') return WORK_MS;
  return MOVE_MS;
}

export const countingPermitsStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 정적 그리기가 매번 새로 짓는 손잡이 — 운동이 여기서 요소를 찾는다
    let chips = new Map<string, SVGGElement>();
    let held = new Map<string, SVGCircleElement>();
    let cursors = new Map<string, SVGPathElement>();
    let trayTokens: SVGCircleElement[] = [];
    let countText: SVGTextElement | null = null;

    function node<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: number } = {},
    ): SVGTextElement {
      const e = node(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight !== undefined) e.setAttribute('font-weight', String(opts.weight));
      e.textContent = text;
      return e;
    }

    function place(e: Element, p: Pt): void {
      e.setAttribute('transform', `translate(${r2(p.x)} ${r2(p.y)})`);
    }

    function setCircle(e: SVGCircleElement, p: Pt): void {
      e.setAttribute('cx', String(r2(p.x)));
      e.setAttribute('cy', String(r2(p.y)));
    }

    function captionOf(scene: CountingPermitsScene): string {
      const s = scene.step;
      if (s === null) return t('caption.start', 'Permits in {sem}: {n}', { sem: scene.sem, n: scene.count });
      if (s.kind === 'take') {
        return t('caption.take', 'Thread {who} takes a permit and goes in. Left: {n}', { who: s.who, n: scene.count });
      }
      if (s.kind === 'block') {
        return t('caption.block', 'No permit left. Thread {who} lines up and sleeps.', { who: s.who });
      }
      if (s.kind === 'work') return t('caption.work', 'Thread {who} works inside.', { who: s.who });
      if (s.kind === 'hand') {
        return t('caption.hand', 'Thread {who} releases. The permit goes straight to {to}. Left: {n}', {
          who: s.who,
          to: s.to,
          n: scene.count,
        });
      }
      return t('caption.back', 'Thread {who} releases. No one waits, so the permit goes back. Left: {n}', {
        who: s.who,
        n: scene.count,
      });
    }

    /** 스레드가 지금 서 있는 자리 */
    function spotOf(scene: CountingPermitsScene, g: Geometry, id: string, i: number): Pt {
      const where = scene.place[id];
      if (where === 'in') return g.slot(scene.slots.indexOf(id));
      if (where === 'queue') return g.queue(scene.queue.indexOf(id));
      if (where === 'done') return g.done(i);
      return g.outside(i);
    }

    function drawStatic(scene: CountingPermitsScene): void {
      svg.textContent = '';
      chips = new Map();
      held = new Map();
      cursors = new Map();
      trayTokens = [];
      countText = null;
      if (scene.threads.length === 0) return;

      const g = geometry(scene);
      const hues = categorical(scene.threads.length);
      const step = scene.step;

      // ── 프로그램 줄
      const prog = node('g', {}, svg);
      scene.threads.forEach((th, i) => {
        const x0 = g.colX(i) + 10;
        const hue = hues[i] ?? colors.primary;
        const finished = scene.place[th.id] === 'done';
        node('rect', { x: r2(x0), y: g.progTop, width: 10, height: 10, rx: 2, fill: hue }, prog);
        label(prog, x0 + 16, g.progTop + 5, th.id, { anchor: 'start', weight: 700, mono: true });
        th.lines.forEach((text, li) => {
          const y = g.lineY(li);
          if (step !== null && step.who === th.id && step.line === li) {
            const blocked = step.kind === 'block';
            node(
              'rect',
              {
                x: r2(x0 + 8),
                y: r2(y - g.lineH / 2 + 1),
                width: r2(g.colW - 26),
                height: r2(g.lineH - 2),
                rx: 3,
                fill: blocked ? 'none' : colors.accent,
                'fill-opacity': blocked ? 1 : 0.45,
                stroke: blocked ? colors.danger : 'none',
                'stroke-width': 1.5,
              },
              prog,
            );
          }
          label(prog, x0 + 14, y, text, {
            anchor: 'start',
            mono: true,
            size: fontSizes.sm,
            fill: finished && !(step !== null && step.who === th.id && step.line === li) ? colors.textMuted : colors.text,
          });
        });
        const pc = scene.pc[th.id] ?? 0;
        if (!finished && pc < th.lines.length) {
          const cur = node('path', { d: `M0 ${-smPx / 3} L${smPx / 2} 0 L0 ${smPx / 3} Z`, fill: hue }, prog);
          place(cur, { x: x0, y: g.lineY(pc) });
          cursors.set(th.id, cur);
        }
      });

      // ── 방 · 문 · 자리 이름
      const room = node('g', {}, svg);
      node(
        'rect',
        { x: r2(g.room.x), y: r2(g.room.y), width: r2(g.room.w), height: r2(g.room.h), rx: 10, fill: colors.bgSubtle, stroke: colors.border },
        room,
      );
      label(room, PAD, g.zoneLabelY, t('label.notStarted', 'Not started'), { anchor: 'start', fill: colors.textMuted, size: fontSizes.xs });
      label(room, g.slot(0).x, g.zoneLabelY, t('label.inside', 'Inside'), { fill: colors.textMuted, size: fontSizes.xs });
      label(room, PIECE_CANVAS_W - PAD, g.zoneLabelY, t('label.done', 'Finished'), { anchor: 'end', fill: colors.textMuted, size: fontSizes.xs });
      label(room, g.queue(0).x + CHIP_W / 2, g.midY + CHIP_H / 2 + 14, t('label.line', 'Line (asleep)'), {
        anchor: 'end',
        fill: colors.textMuted,
        size: fontSizes.xs,
      });

      const gate = node('g', {}, svg);
      node(
        'rect',
        { x: r2(g.gate.x), y: r2(g.gate.y), width: g.gate.w, height: r2(g.gate.h), rx: 8, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 },
        gate,
      );
      label(gate, g.gate.x + g.gate.w / 2, g.gate.y + 14, t('label.permits', 'Permits in {sem}', { sem: scene.sem }), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      countText = label(gate, g.gate.x + g.gate.w / 2, g.gate.y + g.gate.h / 2 - 4, String(scene.count), {
        size: fontSizes.xl,
        weight: 700,
      });
      for (let j = 0; j < scene.permits; j += 1) {
        const p = g.tray(j);
        node('circle', { cx: r2(p.x), cy: r2(p.y), r: TOKEN_R, fill: 'none', stroke: colors.border, 'stroke-dasharray': '2 2' }, gate);
      }
      for (let j = 0; j < Math.min(scene.count, scene.permits); j += 1) {
        const tok = node('circle', { r: TOKEN_R, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 }, gate);
        setCircle(tok, g.tray(j));
        trayTokens.push(tok);
      }

      // ── 스레드
      const people = node('g', {}, svg);
      scene.threads.forEach((th, i) => {
        const where = scene.place[th.id];
        const chip = node('g', {}, people);
        node(
          'rect',
          { x: -CHIP_W / 2, y: -CHIP_H / 2, width: CHIP_W, height: CHIP_H, rx: 6, fill: colors.bg, stroke: hues[i] ?? colors.primary, 'stroke-width': 2.5 },
          chip,
        );
        label(chip, 0, 1, th.id, { mono: true, weight: 700, size: fontSizes.md });
        if (where === 'queue') chip.setAttribute('opacity', ASLEEP);
        if (where === 'done') chip.setAttribute('opacity', ASLEEP);
        place(chip, spotOf(scene, g, th.id, i));
        chips.set(th.id, chip);
      });

      // ── 쥔 표 (스레드 위에)
      const tokens = node('g', {}, svg);
      for (const id of scene.slots) {
        if (id === null) continue;
        const tok = node('circle', { r: TOKEN_R, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 }, tokens);
        setCircle(tok, heldSpot(g.slot(scene.slots.indexOf(id))));
        held.set(id, tok);
      }

      // ── 틱 · 캡션
      if (step !== null) {
        label(svg, g.gate.x + g.gate.w / 2, g.zoneLabelY, t('label.tick', 'Tick {n}', { n: step.tick }), {
          fill: colors.textMuted,
          size: fontSizes.xs,
        });
      }
      label(svg, PIECE_CANVAS_W / 2, g.captionY, captionOf(scene), { size: fontSizes.md });
    }

    /** 운동의 한 순간 — 정적 그림의 요소를 아직 못 온 자리로 옮긴다 */
    function frame(scene: CountingPermitsScene, step: PermitStep, p: number): void {
      const g = geometry(scene);
      const idx = (id: string): number => scene.threads.findIndex((th) => th.id === id);
      const cursorFrom = (id: string, fromLine: number): void => {
        const cur = cursors.get(id);
        const to = scene.pc[id];
        if (cur === undefined || to === undefined) return;
        const i = idx(id);
        place(cur, { x: g.colX(i) + 10, y: g.lineY(fromLine) + (g.lineY(to) - g.lineY(fromLine)) * ease(p) });
      };

      if (step.kind === 'work') {
        cursorFrom(step.who, step.line);
        return;
      }
      if (step.kind === 'take') {
        const chip = chips.get(step.who);
        const tok = held.get(step.who);
        const from = g.outside(idx(step.who));
        const dest = g.slot(step.slot);
        // 표가 먼저 문의 표 자리를 떠나 스레드에게 가고, 스레드는 그 표를 쥐고 문을 지난다
        const trayFrom = g.tray(scene.count);
        const q1 = span(p, 0, 0.45);
        const q2 = span(p, 0.35, 1);
        const at = lerp(from, dest, q2);
        if (chip) place(chip, at);
        if (tok) setCircle(tok, lerp(trayFrom, heldSpot(at), q1));
        if (countText) countText.textContent = String(q1 < 1 ? step.was : scene.count);
        cursorFrom(step.who, step.line);
        return;
      }
      if (step.kind === 'block') {
        const chip = chips.get(step.who);
        const from = g.outside(idx(step.who));
        const dest = g.queue(scene.queue.indexOf(step.who));
        if (chip) {
          place(chip, lerp(from, dest, ease(p)));
          if (p < 1) chip.removeAttribute('opacity');
        }
        return;
      }
      if (step.kind === 'back') {
        const chip = chips.get(step.who);
        const src = g.slot(step.slot);
        const q1 = span(p, 0, 0.55);
        const q2 = span(p, 0.3, 1);
        if (chip) {
          place(chip, lerp(src, g.done(idx(step.who)), q2));
          if (p < 1) chip.removeAttribute('opacity');
        }
        // 돌아가는 표는 표 자리의 마지막 칸에 앉는다 — 그 칸이 정적 그림에서 막 채워진 칸이다
        const tok = trayTokens[scene.count - 1];
        if (tok) setCircle(tok, lerp(heldSpot(src), g.tray(scene.count - 1), q1));
        if (countText) countText.textContent = String(q1 < 1 ? step.was : scene.count);
        return;
      }
      if (step.kind !== 'hand') return;
      // hand — 표가 수를 거치지 않고 줄 맨 앞에게 날아가고, 받은 스레드가 그 칸으로 들어간다
      const out = chips.get(step.who);
      const inn = chips.get(step.to);
      const tok = held.get(step.to);
      const src = g.slot(step.slot);
      const head = g.queue(0);
      const q1 = span(p, 0, 0.5);
      const q2 = span(p, 0.5, 1);
      if (out) {
        place(out, lerp(src, g.done(idx(step.who)), span(p, 0, 0.6)));
        if (p < 1) out.removeAttribute('opacity');
      }
      const inAt = lerp(head, src, q2);
      if (inn) {
        place(inn, inAt);
        if (p < 0.5) inn.setAttribute('opacity', ASLEEP);
        else inn.removeAttribute('opacity');
      }
      if (tok) setCircle(tok, p < 0.5 ? lerp(heldSpot(src), heldSpot(head), q1) : heldSpot(inAt));
      // 뒤에 선 스레드는 한 칸씩 당겨 선다
      scene.queue.forEach((id, i) => {
        const c = chips.get(id);
        if (c) place(c, lerp(g.queue(i + 1), g.queue(i), q2));
      });
      cursorFrom(step.to, step.fromLine);
    }

    function run(ms: number, draw: (p: number) => void, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        let elapsed = 0;
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, elapsed / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            elapsed += FRAME_MS;
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next: CountingPermitsScene, _prev: CountingPermitsScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        const step = next.step;
        if (!opts.animate || step === null) return;
        frame(next, step, 0);
        await run(motionMs(step), (p) => frame(next, step, p), mine);
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
