/**
 * 섀도잉 stage — 왼쪽은 프로그램, 오른쪽은 이름 하나의 눈길.
 *
 * 이름표에서 오른쪽으로 눈길이 뻗고, 그 이름의 자리들이 눈길 위에 선다. 몸이 깊을수록
 * 이름표에 가까이(앞에) 선다. 찾기는 눈길을 따라가다 처음 닿는 자리에서 멈추므로
 * 앞에 선 자리가 뒤의 자리를 가린다 — 가려진 자리는 그늘에 들 뿐 값은 그대로 남는다.
 *
 * 운동
 *   declare  새 자리가 위에서 내려와 눈길 위에 선다 (그늘을 끌고 온다). 이어 눈길이 뻗는다
 *   write    눈길이 뻗어 앞 자리에서 멈추고, 그 자리의 값이 밀려 올라가며 새 값으로 바뀐다
 *   test     눈길이 뻗어 처음 닿는 자리에서 멈춘다
 *   show     눈길이 뻗고, 읽은 값의 사본이 자리에서 출력 줄로 날아간다
 *   걷힘      (gone 이 있는 걸음) 안쪽 자리가 그늘을 거두며 위로 들려 나간 뒤 위 운동이 이어진다
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SceneSlot, SceneValue, ShadowingScene, ShadowingStep } from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const PAD = 20;
const NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 — 걷힘이 있는 걸음은 들려 나가는 몫이 더 붙는다. */
const MOVE_MS = 400;
const MOVE_GONE_MS = 600;
/** 걷힘이 있는 걸음에서 들려 나가는 몫 (운동 전체에 대한 비). */
const LIFT_SHARE = 0.4;

type Attrs = Record<string, string | number>;

function el(tag: string, attrs: Attrs, parent: Element, text?: string): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 좌표 글자 — 끝자리와 -0 을 다듬는다. */
function r(n: number): number {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** p 가 [a, b] 를 지나는 몫. b <= a 면 이미 끝났다. */
function seg(p: number, a: number, b: number): number {
  if (b <= a) return 1;
  return clamp01((p - a) / (b - a));
}

function ease(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function fmt(v: SceneValue): string {
  return typeof v === 'string' ? `"${v}"` : String(v);
}

/** 글자 한 자의 대략 폭 (글꼴 크기에 대한 비). */
function glyph(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x1100) return 1;
  return 0.56;
}

function measure(text: string, px: number): number {
  let w = 0;
  for (const ch of text) w += glyph(ch) * px;
  return w;
}

/** 폭에 맞춰 줄을 나눈다. 빈칸이 있으면 낱말로, 없으면 글자로. */
function wrap(text: string, maxW: number, px: number): string[] {
  const words = text.includes(' ') ? text.split(' ') : [...text];
  const joiner = text.includes(' ') ? ' ' : '';
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const tryLine = cur === '' ? w : cur + joiner + w;
    if (measure(tryLine, px) <= maxW || cur === '') cur = tryLine;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur !== '') out.push(cur);
  return out;
}

/** 걸음이 눈길로 닿는 자리들 (읽기 · 쓰기). */
function touched(step: ShadowingStep): number[] {
  const addrs = step.reads.map((x) => x.addr);
  if (step.kind === 'declare' || step.kind === 'write') addrs.push(step.addr);
  return [...new Set(addrs)];
}

/** 같은 이름의 자리 가운데 addr 보다 뒤(바깥)에 선 것 중 가장 앞의 것. */
function behind(slots: SceneSlot[], name: string, depth: number): SceneSlot | undefined {
  return slots
    .filter((s) => s.name === name && s.depth < depth)
    .sort((a, b) => b.depth - a.depth)[0];
}

function caption(t: Translate, scene: ShadowingScene): string {
  const step = scene.step;
  if (!step) return t('caption.start', 'No line has run yet.');
  if (step.kind === 'declare') {
    const back = behind(scene.slots, step.name, step.depth);
    if (back) {
      return t(
        'caption.declareShadow',
        'let sets up a new slot with the same name in front of the outer one. Name {name}, value {value}. The outer slot is only hidden; it still holds {outer}.',
        { name: step.name, value: fmt(step.value), outer: fmt(back.value) },
      );
    }
    return t('caption.declare', 'let sets up a new slot. Name {name}, value {value}.', {
      name: step.name,
      value: fmt(step.value),
    });
  }
  if (step.kind === 'write') {
    const back = behind(scene.slots, step.name, step.depth);
    if (back) {
      return t(
        'caption.writeShadow',
        'Both the read and the write stop at the slot in front: {before} → {value}. The outer slot behind still holds {outer}.',
        { before: fmt(step.before), value: fmt(step.value), outer: fmt(back.value) },
      );
    }
    return t('caption.write', 'The value in the {name} slot changes: {before} → {value}.', {
      name: step.name,
      before: fmt(step.before),
      value: fmt(step.value),
    });
  }
  if (step.kind === 'test') {
    const read = step.reads[0];
    if (read) {
      return t(
        'caption.test',
        'The lookup for {name} stops at the first slot it reaches: {value}. The condition is {result}.',
        { name: read.name, value: fmt(read.value), result: fmt(step.value) },
      );
    }
    return t('caption.testPlain', 'The condition is {result}.', { result: fmt(step.value) });
  }
  const revealed = step.reads.some((x) => step.gone.some((g) => g.name === x.name));
  if (revealed) {
    return t(
      'caption.showReveal',
      'The body is over, so the inner slot is gone. The same name now reaches the outer slot. Output {value}.',
      { value: String(step.value) },
    );
  }
  if (step.reads.length > 0) {
    return t('caption.show', 'show also reads from the first slot it reaches. Output {value}.', {
      value: String(step.value),
    });
  }
  return t('caption.showPlain', 'Output {value}.', { value: String(step.value) });
}

/** 운동의 몫들. 정적 그리기는 전부 1 이다. */
type Phase = { lift: number; drop: number; ray: number; flip: number; fly: number };

const DONE: Phase = { lift: 1, drop: 1, ray: 1, flip: 1, fly: 1 };

function phaseOf(step: ShadowingStep, p: number): Phase {
  const g = step.gone.length > 0 ? LIFT_SHARE : 0;
  const lift = ease(seg(p, 0, g));
  const q = seg(p, g, 1);
  if (step.kind === 'declare') return { lift, drop: ease(seg(q, 0, 0.6)), ray: ease(seg(q, 0.55, 1)), flip: 1, fly: 1 };
  if (step.kind === 'write') return { lift, drop: 1, ray: ease(seg(q, 0, 0.45)), flip: ease(seg(q, 0.5, 1)), fly: 1 };
  if (step.kind === 'test') return { lift, drop: 1, ray: ease(seg(q, 0, 0.7)), flip: 1, fly: 1 };
  return { lift, drop: 1, ray: ease(seg(q, 0, 0.45)), flip: 1, fly: ease(seg(q, 0.45, 1)) };
}

export const shadowingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const codePx = parseFloat(fontSizes.md);
    const smallPx = parseFloat(fontSizes.xs);
    const capPx = parseFloat(fontSizes.sm);
    const valuePx = parseFloat(fontSizes.xl);
    const monoW = codePx * 0.6;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function draw(scene: ShadowingScene, ph: Phase): void {
      svg.textContent = '';
      const step = scene.step;
      const lines = scene.lines;
      if (lines.length === 0) return;

      // ── 프로그램
      const x0 = PAD + 14;
      const top = 44;
      const lineH = Math.min(28, 170 / lines.length);
      const codeChars = Math.max(...lines.map((l) => l.indent * 4 + l.text.length));
      const noteW = monoW * 8;
      const codeRight = x0 + codeChars * monoW;
      const lineY = (i: number): number => top + i * lineH;

      // 들어가 있는 몸 — 머리줄 아래 한 단계 깊은 줄들
      for (const h of scene.open) {
        let last = h;
        while (last + 1 < lines.length && lines[last + 1].indent > lines[h].indent) last += 1;
        if (last === h) continue;
        el(
          'rect',
          {
            x: r(x0 - 6),
            y: r(lineY(h + 1) - lineH * 0.72),
            width: r(codeRight - x0 + 12),
            height: r((last - h) * lineH),
            rx: 4,
            fill: colors.bgSubtle,
          },
          svg,
        );
      }

      lines.forEach((l, i) => {
        const here = step !== null && step.line === i;
        if (here) {
          el('rect', { x: PAD, y: r(lineY(i) - lineH * 0.62), width: 4, height: r(lineH * 0.8), rx: 2, fill: colors.accent }, svg);
        }
        el(
          'text',
          {
            x: r(x0 + l.indent * 4 * monoW),
            y: r(lineY(i)),
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': here ? 700 : 400,
            fill: here ? colors.text : colors.textMuted,
            'xml:space': 'preserve',
          },
          svg,
          l.text,
        );
        if (here && step && step.kind === 'test' && ph.ray >= 1) {
          el(
            'text',
            {
              x: r(x0 + (l.indent * 4 + l.text.length + 1) * monoW),
              y: r(lineY(i)),
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              fill: step.value === true ? colors.success : colors.textMuted,
            },
            svg,
            `→ ${fmt(step.value)}`,
          );
        }
      });

      // ── 출력
      const outLabelY = lineY(lines.length) + 16;
      const chipY = outLabelY + 22;
      const chipH = 24;
      el('text', { x: x0, y: r(outLabelY), 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, svg, t('label.output', 'output'));
      const chipX = (i: number): number => x0 + i * 48;

      // ── 눈길 (이름마다 한 줄)
      const sx0 = Math.max(codeRight + noteW, W * 0.44);
      const rowTop = 40;
      const rowBot = chipY + chipH / 2;
      const rows = Math.max(1, scene.names.length);
      const rowH = (rowBot - rowTop) / rows;
      const cw = 64;
      const ch = Math.min(84, rowH - 44);
      const backX = W - PAD - cw / 2 - 6;
      const maxDepth = Math.max(1, ...lines.map((l) => l.indent));
      const hot = step ? touched(step) : [];

      // 날아가는 사본은 그림 맨 위에 둔다 — 자리를 알아 둔다.
      const fly: { from: { x: number; y: number } | null } = { from: null };

      scene.names.forEach((name, row) => {
        const cy = rowTop + rowH * (row + 0.5);
        const tagW = name.length * monoW + 18;
        const eyeR = sx0 + tagW;
        const gap = Math.min(110, (backX - eyeR - cw / 2 - 40) / maxDepth);
        const cx = (depth: number): number => backX - depth * gap;
        const lift = -(cy + ch / 2 + 12);

        // 눈길 — 끝까지 가는 옅은 선
        el('line', { x1: r(eyeR), y1: r(cy), x2: W - PAD, y2: r(cy), stroke: colors.border, 'stroke-dasharray': '3 4' }, svg);

        const live = scene.slots.filter((s) => s.name === name).sort((a, b) => a.depth - b.depth);
        const gone = step ? step.gone.filter((s) => s.name === name) : [];
        const front = live[live.length - 1];
        const fresh = step && step.kind === 'declare' && step.name === name ? step.addr : null;

        /** 자리의 세로 어긋남 — 내려오는 중이거나 들려 나가는 중. */
        const dyOf = (addr: number, isGone: boolean): number => {
          if (isGone) return lift * ph.lift;
          if (addr === fresh) return lift * (1 - ph.drop);
          return 0;
        };

        // 가리는 자리: 그 이름에서 가장 앞(깊은) 자리. 걷히는 중이면 걷히는 자리가 아직 앞이다.
        const coverers: { slot: SceneSlot; isGone: boolean }[] = [];
        const gFront = gone.sort((a, b) => b.depth - a.depth)[0];
        if (gFront && ph.lift < 1) coverers.push({ slot: gFront, isGone: true });
        else if (front && live.length > 1) coverers.push({ slot: front, isGone: false });

        // 뒤에 선 자리들 (가려진 것 포함)
        const drawCard = (slot: SceneSlot, mode: 'front' | 'hidden' | 'ghost', dy: number): void => {
          const x = cx(slot.depth) - cw / 2;
          const y = cy - ch / 2 + dy;
          const on = hot.includes(slot.addr) && mode !== 'ghost';
          const g = el('g', {}, svg);
          el(
            'rect',
            {
              x: r(x),
              y: r(y),
              width: cw,
              height: r(ch),
              rx: 6,
              fill: colors.bg,
              stroke: on ? colors.itemActive : mode === 'hidden' ? colors.textMuted : colors.text,
              'stroke-width': on ? 2.5 : 1.2,
            },
            g,
          );
          el('text', { x: r(x + cw / 2), y: r(y + 16), 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted }, g, slot.name);
          const yv = y + ch / 2 + valuePx * 0.45;
          const vAttrs = { x: r(x + cw / 2), 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xl };
          if (step && step.kind === 'write' && step.addr === slot.addr && mode !== 'ghost' && ph.flip < 1) {
            // 옛 값이 밀려 올라가고 새 값이 아래에서 들어온다
            const slide = 22;
            el('text', { ...vAttrs, y: r(yv - slide * ph.flip), fill: colors.textMuted, opacity: r(1 - ph.flip) }, g, fmt(step.before));
            el('text', { ...vAttrs, y: r(yv + slide * (1 - ph.flip)), fill: colors.text }, g, fmt(step.value));
          } else {
            el('text', { ...vAttrs, y: r(yv), fill: colors.text }, g, fmt(slot.value));
          }
        };

        const labelUnder = (slot: SceneSlot, hidden: boolean): void => {
          const x = cx(slot.depth);
          const y = cy + ch / 2 + 16;
          const outer = slot.depth === 0;
          el(
            'text',
            { x: r(x), y: r(y), 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted },
            svg,
            outer ? t('label.outer', 'outer') : t('label.inner', 'inner'),
          );
          if (hidden) {
            el(
              'text',
              { x: r(x), y: r(y + smallPx + 3), 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, 'font-style': 'italic', fill: colors.textMuted },
              svg,
              t('label.hidden', 'hidden'),
            );
          }
        };

        // 걷힌 자리가 서 있던 곳 — 점선 테두리
        for (const s of gone) {
          el(
            'rect',
            { x: r(cx(s.depth) - cw / 2), y: r(cy - ch / 2), width: cw, height: r(ch), rx: 6, fill: 'none', stroke: colors.border, 'stroke-dasharray': '4 4' },
            svg,
          );
        }

        const cover = coverers[0];
        for (const s of live) {
          if (cover && !cover.isGone && s.addr === cover.slot.addr) continue;
          const isHidden = cover !== undefined && s.depth < cover.slot.depth;
          drawCard(s, isHidden ? 'hidden' : 'front', dyOf(s.addr, false));
          labelUnder(s, isHidden && !cover.isGone);
        }

        // 그늘 — 앞에 선 자리 뒤로 눈길을 따라 오른쪽 끝까지
        if (cover) {
          const dy = dyOf(cover.slot.addr, cover.isGone);
          const right = cx(cover.slot.depth) + cw / 2;
          const yT = cy - ch / 2 + dy;
          const flare = 10;
          el(
            'polygon',
            {
              points: [
                [right, yT],
                [W - PAD, yT - flare],
                [W - PAD, yT + ch + flare],
                [right, yT + ch],
              ]
                .map(([a, b]) => `${r(a)},${r(b)}`)
                .join(' '),
              fill: colors.textMuted,
              'fill-opacity': 0.2,
            },
            svg,
          );
          if (cover.isGone) {
            drawCard(cover.slot, 'ghost', dy);
          } else {
            drawCard(cover.slot, 'front', dy);
            labelUnder(cover.slot, false);
          }
        }

        // 이름표
        const tagH = 26;
        const onTag = step !== null && hot.some((a) => live.some((s) => s.addr === a));
        el(
          'rect',
          { x: r(sx0), y: r(cy - tagH / 2), width: r(tagW), height: tagH, rx: tagH / 2, fill: colors.bgSubtle, stroke: onTag ? colors.itemActive : colors.border, 'stroke-width': onTag ? 2 : 1 },
          svg,
        );
        el('text', { x: r(sx0 + tagW / 2), y: r(cy + codePx * 0.35), 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: colors.text }, svg, name);

        // 눈길이 뻗어 처음 닿는 자리에서 멈춘다
        for (const addr of hot) {
          const slot = live.find((s) => s.addr === addr);
          if (!slot) continue;
          const end = cx(slot.depth) - cw / 2 - 3;
          const len = (end - eyeR) * ph.ray;
          if (len <= 0.5) continue;
          const xe = eyeR + len;
          el('line', { x1: r(eyeR), y1: r(cy), x2: r(xe - 6), y2: r(cy), stroke: colors.itemActive, 'stroke-width': 2.5 }, svg);
          el('polygon', { points: `${r(xe)},${r(cy)} ${r(xe - 9)},${r(cy - 5)} ${r(xe - 9)},${r(cy + 5)}`, fill: colors.itemActive }, svg);
          if (step && step.kind === 'show') fly.from = { x: cx(slot.depth), y: cy };
        }
      });

      // 출력 줄 — 마지막 것은 이번 걸음의 사본이면 자리에서 날아온다
      scene.outputs.forEach((v, i) => {
        const last = i === scene.outputs.length - 1 && step !== null && step.kind === 'show';
        const text = String(v);
        const w = Math.max(36, measure(text, codePx) + 16);
        let x = chipX(i);
        let y = chipY - chipH / 2;
        if (last && ph.fly < 1) {
          // 눈길이 닿기 전에는 사본이 아직 없다
          if (ph.ray < 1 || !fly.from) return;
          const k = 1 - ph.fly;
          x += (fly.from.x - w / 2 - x) * k;
          y += (fly.from.y - chipH / 2 - y) * k;
        }
        const g = el('g', {}, svg);
        el('rect', { x: r(x), y: r(y), width: r(w), height: chipH, rx: 5, fill: colors.bgSubtle, stroke: last ? colors.itemActive : colors.border }, g);
        el('text', { x: r(x + w / 2), y: r(y + chipH / 2 + codePx * 0.35), 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: colors.text }, g, text);
      });

      // ── 캡션
      const capLines = wrap(caption(t, scene), W - PAD * 2, capPx);
      const capTop = H - 12 - (capLines.length - 1) * (capPx + 5);
      capLines.forEach((line, i) => {
        el('text', { x: PAD, y: r(capTop + i * (capPx + 5)), 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text }, svg, line);
      });
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let settled = false;
        let start = -1;
        let id = 0;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          frames.delete(id);
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) return finish();
          if (start < 0) start = now;
          const p = clamp01((now - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    return {
      async render(next: ShadowingScene, _prev: ShadowingScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || !step) {
          draw(next, DONE);
          return;
        }
        const ms = step.gone.length > 0 ? MOVE_GONE_MS : MOVE_MS;
        draw(next, phaseOf(step, 0));
        await tween(ms, mine, (p) => draw(next, phaseOf(step, p)));
        if (mine !== gen || destroyed) return;
        draw(next, DONE);
      },
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
