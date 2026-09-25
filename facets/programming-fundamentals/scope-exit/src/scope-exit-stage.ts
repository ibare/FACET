/**
 * 스코프 종료의 무대.
 *
 * 왼쪽은 프로그램, 오른쪽은 이름이 사는 틀이다. 바깥 틀 안에 몸의 틀이 몸의 줄 높이에 맞춰
 * 열리고, 몸 안에서 선 이름은 그 틀 안에 자리를 잡는다. 흐름이 몸을 벗어나면 몸의 틀이 자리를
 * 품은 채 머리줄 쪽으로 접혀 올라가 걷힌다. 뒤에서 그 이름을 부르면 찾는 이름표가 바깥 틀을
 * 훑고 빈손으로 돌아와 멈춘다.
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { SceneBody, SceneValue, ScopeExitScene } from './scene.js';

const H = 320;
const SVG = 'http://www.w3.org/2000/svg';
const MOVE_MS = 400;
const PAD = 16;
const FRAME_TOP = 14;
const ROWS_TOP = 24;
const ROWS_BOTTOM = 216;
const ROW_MAX = 32;
const OUT_Y = 244;
const CAPTION_Y = 274;
const CAPTION_LH = 20;

function rd(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function fmt(v: SceneValue): string {
  return typeof v === 'string' ? '"' + v + '"' : String(v);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

type Geo = {
  W: number;
  charW: number;
  codeX: number;
  codeRight: number;
  fx0: number;
  fx1: number;
  boxW: number;
  boxX: number;
  rowH: number;
  rowY(i: number): number;
  rowTop(i: number): number;
};

function geometry(scene: ScopeExitScene): Geo {
  const W = PIECE_CANVAS_W;
  const charW = parseFloat(fontSizes.md) * 0.6;
  const n = Math.max(scene.lines.length, 1);
  const rowH = Math.min(ROW_MAX, (ROWS_BOTTOM - ROWS_TOP) / n);
  const maxChars = scene.lines.reduce((m, ln) => Math.max(m, ln.indent * 4 + ln.text.length), 0);
  const codeX = PAD + 22;
  const codeRight = codeX + maxChars * charW;
  const fx0 = Math.max(codeRight + 28, W * 0.5);
  const fx1 = W - PAD;
  const boxW = Math.min(88, (fx1 - fx0) * 0.3);
  return {
    W,
    charW,
    codeX,
    codeRight,
    fx0,
    fx1,
    boxW,
    boxX: fx1 - 22 - boxW,
    rowH,
    rowY: (i) => ROWS_TOP + rowH * (i + 0.5),
    rowTop: (i) => ROWS_TOP + rowH * i,
  };
}

/** 몸이 몇 겹 안에 있는가 — 바깥 = 0. */
function depthOf(line: number, bodies: SceneBody[], open: number[]): number {
  return bodies.filter((b) => open.includes(b.head) && b.from <= line && line <= b.to).length;
}

/** 글자 폭 어림 — 한글 · 한자권은 넓게, 라틴 밖 문자는 조금 넓게. */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    w += cp >= 0x1100 ? px * 0.95 : cp >= 0x0370 ? px * 0.7 : px * 0.56;
  }
  return w;
}

function wrap(s: string, px: number, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  const push = (tok: string, sep: string) => {
    const cand = cur === '' ? tok : cur + sep + tok;
    if (textWidth(cand, px) <= max || cur === '') {
      cur = cand;
    } else {
      out.push(cur);
      cur = tok;
    }
  };
  for (const word of s.split(' ')) {
    if (textWidth(word, px) <= max) {
      push(word, ' ');
      continue;
    }
    for (const ch of word) {
      if (textWidth(cur + ch, px) > max && cur !== '') {
        out.push(cur);
        cur = '';
      }
      cur += ch;
    }
  }
  if (cur !== '') out.push(cur);
  return out;
}

export const scopeExitStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const codePx = parseFloat(fontSizes.md);
    const smallPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(rd(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opt: { fill: string; font: string; size: string; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          fill: opt.fill,
          'font-family': opt.font,
          'font-size': opt.size,
          'text-anchor': opt.anchor ?? 'start',
          'dominant-baseline': 'middle',
          'font-weight': opt.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = s;
      return node;
    }

    /** 틀 이름표 — 틀의 윗변 위에 바탕색 받침을 깔고 얹는다. */
    function legend(parent: Element, x: number, y: number, s: string, fill: string): void {
      const w = textWidth(s, smallPx) + 10;
      el('rect', { x: x - 5, y: y - 7, width: w, height: 14, fill: c.bg }, parent);
      label(parent, x, y, s, { fill, font: fonts.body, size: fontSizes.xs });
    }

    /** 자리 하나 — 이름과 값 칸. */
    function drawSlot(
      parent: Element,
      g: Geo,
      name: string,
      value: SceneValue,
      nameX: number,
      y: number,
      stroke: string,
    ): SVGTextElement {
      label(parent, nameX, y, name, { fill: c.text, font: fonts.mono, size: fontSizes.md });
      el(
        'rect',
        { x: g.boxX, y: y - 11, width: g.boxW, height: 22, rx: 4, fill: c.bg, stroke, 'stroke-width': 1.5 },
        parent,
      );
      return label(parent, g.boxX + g.boxW / 2, y, fmt(value), {
        fill: c.text,
        font: fonts.mono,
        size: fontSizes.md,
        anchor: 'middle',
      });
    }

    function bodyRect(g: Geo, b: SceneBody, depth: number): { x: number; y: number; w: number; h: number } {
      const x = g.fx0 + 12 * depth;
      const y = g.rowTop(b.from) - 4; // 머리줄 쪽으로 조금 올려 이름표와 첫 자리 이름 사이를 띄운다
      return { x, y, w: g.fx1 - 8 * depth - x, h: g.rowTop(b.to + 1) - 1 - y };
    }

    /** 몸의 틀 — 품은 자리까지 한 무리로. */
    function drawBody(
      parent: Element,
      g: Geo,
      b: SceneBody,
      depth: number,
      slots: { name: string; value: SceneValue; slot: number }[],
      strokeOf: (slot: number) => string,
      values: Map<number, SVGTextElement>,
    ): SVGGElement {
      const grp = el('g', {}, parent);
      const r = bodyRect(g, b, depth);
      el(
        'rect',
        { x: r.x, y: r.y, width: r.w, height: r.h, rx: 6, fill: c.bgSubtle, stroke: c.primary, 'stroke-width': 1.5 },
        grp,
      );
      legend(grp, r.x + 10, r.y, t('label.body', 'body'), c.primary);
      for (const s of slots) {
        values.set(s.slot, drawSlot(grp, g, s.name, s.value, r.x + 14, g.rowY(s.slot), strokeOf(s.slot)));
      }
      return grp;
    }

    type Handles = {
      g: Geo;
      fx: SVGGElement;
      values: Map<number, SVGTextElement>;
      bodies: Map<number, SVGGElement>;
      outputs: SVGTextElement[];
      outX(i: number): number;
      probe: SVGGElement | null;
    };

    function drawStatic(scene: ScopeExitScene): Handles {
      svg.textContent = '';
      const g = geometry(scene);
      const root = el('g', {}, svg);
      const step = scene.step;
      const values = new Map<number, SVGTextElement>();
      const bodies = new Map<number, SVGGElement>();
      const outputs: SVGTextElement[] = [];
      const outX = (i: number) => PAD + 64 + i * 64;
      if (scene.lines.length === 0) {
        return { g, fx: el('g', {}, root), values, bodies, outputs, outX, probe: null };
      }
      const halted = scene.halted;

      // 지금 밟은 줄
      const current = step && 'line' in step ? step.line : -1;
      if (current >= 0) {
        const bad = step?.kind === 'unknown';
        el(
          'rect',
          {
            x: PAD - 6,
            y: g.rowTop(current) + 3,
            width: g.codeRight - PAD + 12,
            height: g.rowH - 6,
            rx: 4,
            fill: c.bgSubtle,
            stroke: bad ? c.danger : 'none',
            'stroke-width': 1.5,
          },
          root,
        );
        el(
          'rect',
          { x: PAD - 6, y: g.rowTop(current) + 3, width: 3, height: g.rowH - 6, fill: bad ? c.danger : c.itemActive },
          root,
        );
      }

      // 코드 줄
      scene.lines.forEach((ln, i) => {
        label(root, PAD, g.rowY(i), String(i + 1), { fill: c.textMuted, font: fonts.mono, size: fontSizes.xs });
        const bad = halted !== null && halted.line === i;
        label(root, g.codeX + ln.indent * 4 * g.charW, g.rowY(i), ln.text, {
          fill: bad ? c.danger : c.text,
          font: fonts.mono,
          size: fontSizes.md,
        });
      });

      // 코드 쪽 몸의 줄기 — 벗어나는 걸음에는 그 몸을 짚는다
      for (const b of scene.bodies) {
        if (b.from > b.to) continue;
        const headIndent = scene.lines[b.head]?.indent ?? 0;
        const x = g.codeX + headIndent * 4 * g.charW + g.charW * 0.5;
        const closing = step?.kind === 'exit' && step.head === b.head;
        el(
          'line',
          {
            x1: x,
            y1: g.rowTop(b.from) + 5,
            x2: x,
            y2: g.rowTop(b.to + 1) - 5,
            stroke: closing ? c.primary : c.border,
            'stroke-width': closing ? 3 : 2,
            'stroke-linecap': 'round',
          },
          root,
        );
      }

      // 바깥 틀
      const outerH = g.rowTop(scene.lines.length) + 6 - FRAME_TOP;
      el(
        'rect',
        { x: g.fx0, y: FRAME_TOP, width: g.fx1 - g.fx0, height: outerH, rx: 6, fill: 'none', stroke: c.border, 'stroke-width': 1.5 },
        root,
      );
      legend(root, g.fx0 + 10, FRAME_TOP, t('label.outer', 'outside'), c.textMuted);

      // 이번 걸음이 짚는 자리
      const touched = new Set<number>();
      if (step?.kind === 'assign') touched.add(step.slot);
      if (step?.kind === 'show' && step.from) touched.add(step.from.slot);
      const strokeOf = (slot: number) => (touched.has(slot) ? c.itemActive : c.border);

      for (const s of scene.slots) {
        if (depthOf(s.slot, scene.bodies, scene.open) > 0) continue;
        values.set(s.slot, drawSlot(root, g, s.name, s.value, g.fx0 + 14, g.rowY(s.slot), strokeOf(s.slot)));
      }
      // 열린 몸 — 바깥 것부터
      for (const b of scene.bodies) {
        if (!scene.open.includes(b.head)) continue;
        const depth = depthOf(b.head, scene.bodies, scene.open) + 1;
        const inner = scene.slots.filter((s) => b.from <= s.slot && s.slot <= b.to && depthOf(s.slot, scene.bodies, scene.open) === depth);
        bodies.set(b.head, drawBody(root, g, b, depth, inner, strokeOf, values));
      }

      // 출력
      el('line', { x1: PAD, y1: OUT_Y - 20, x2: g.W - PAD, y2: OUT_Y - 20, stroke: c.border, 'stroke-width': 1 }, root);
      label(root, PAD, OUT_Y, t('label.output', 'output'), { fill: c.textMuted, font: fonts.body, size: fontSizes.sm });
      scene.outputs.forEach((v, i) => {
        el('rect', { x: outX(i), y: OUT_Y - 11, width: 56, height: 22, rx: 4, fill: c.bgSubtle, stroke: c.border }, root);
        outputs.push(
          label(root, outX(i) + 28, OUT_Y, fmt(v), { fill: c.text, font: fonts.mono, size: fontSizes.md, anchor: 'middle' }),
        );
      });
      let probe: SVGGElement | null = null;
      if (halted) {
        const hx = outX(scene.outputs.length);
        const hs = t('label.halt', 'stopped');
        const hw = Math.max(56, textWidth(hs, parseFloat(fontSizes.sm)) + 16);
        el('rect', { x: hx, y: OUT_Y - 11, width: hw, height: 22, rx: 4, fill: c.bg, stroke: c.danger, 'stroke-width': 1.5 }, root);
        label(root, hx + hw / 2, OUT_Y, hs, { fill: c.danger, font: fonts.body, size: fontSizes.sm, anchor: 'middle' });

        // 찾다 만 이름표 — 바깥 틀 안, 부른 줄 높이에
        probe = el('g', {}, root);
        const y = g.rowY(halted.line);
        const w = (halted.name.length + 2) * g.charW + 16;
        el('rect', { x: g.fx0 + 10, y: y - 11, width: w, height: 22, rx: 11, fill: c.bg, stroke: c.danger, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, probe);
        label(probe, g.fx0 + 18, y, halted.name, { fill: c.danger, font: fonts.mono, size: fontSizes.md });
        label(probe, g.fx0 + 18 + (halted.name.length + 1) * g.charW, y, '?', {
          fill: c.danger,
          font: fonts.mono,
          size: fontSizes.md,
          weight: 'bold',
        });
      }

      // 캡션 — 지금 일어나는 일만
      const cap = caption(scene);
      if (cap !== '') {
        const lines = wrap(cap, codePx, g.W - 2 * PAD);
        lines.slice(0, 3).forEach((s, i) => {
          label(root, PAD, CAPTION_Y + i * CAPTION_LH, s, { fill: c.text, font: fonts.body, size: fontSizes.md });
        });
      }

      const fx = el('g', {}, root);
      return { g, fx, values, bodies, outputs, outX, probe };
    }

    function caption(scene: ScopeExitScene): string {
      const step = scene.step;
      if (!step) return '';
      if (step.kind === 'start') {
        return t('caption.start', 'Lines: {n}. No line has run yet.', { n: scene.lines.length });
      }
      if (step.kind === 'assign') {
        if (step.declare) {
          const vars = { name: step.name, value: fmt(step.value) };
          return depthOf(step.slot, scene.bodies, scene.open) > 0
            ? t('caption.declareBody', 'Inside the body, a new slot opens: {name}, holding {value}.', vars)
            : t('caption.declare', 'A new slot opens: {name}, holding {value}.', vars);
        }
        const vars = { name: step.name, was: fmt(step.was ?? 0), value: fmt(step.value) };
        if (step.reads.length > 0) {
          return t('caption.assignRead', '{name}: {was} → {value}. It took the value of {read}.', {
            ...vars,
            read: step.reads.map((r) => r.name).join(', '),
          });
        }
        return t('caption.assign', '{name}: {was} → {value}.', vars);
      }
      if (step.kind === 'branch') {
        const vars = { l: fmt(step.l), op: step.op, r: fmt(step.r) };
        return step.result
          ? t('caption.branchTrue', '{l} {op} {r} is true. Flow enters the body, and the body opens.', vars)
          : t('caption.branchFalse', '{l} {op} {r} is false. Flow skips the body.', vars);
      }
      if (step.kind === 'exit') {
        return t('caption.exit', 'Flow leaves the body. The body is cleared away, taking {names} with it — name and slot.', {
          names: step.gone.map((s) => s.name).join(', '),
        });
      }
      if (step.kind === 'show') {
        return t('caption.show', 'Shows {value}.', { value: fmt(step.value) });
      }
      return t('caption.unknown', 'No name {name} to be found anywhere. The program stops here.', { name: step.name });
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const t0 = Date.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = () => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - t0) / ms);
          frame(ease(p));
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    /** 옮겨 가는 값 조각. */
    function chip(h: Handles, s: string, stroke: string): SVGGElement {
      const grp = el('g', {}, h.fx);
      const w = Math.max(30, s.length * h.g.charW + 14);
      el('rect', { x: -w / 2, y: -11, width: w, height: 22, rx: 4, fill: c.bg, stroke, 'stroke-width': 1.5 }, grp);
      label(grp, 0, 0, s, { fill: c.text, font: fonts.mono, size: fontSizes.md, anchor: 'middle' });
      return grp;
    }

    function place(node: Element, x: number, y: number): void {
      node.setAttribute('transform', 'translate(' + rd(x) + ',' + rd(y) + ')');
    }

    function lerp(a: number, b: number, p: number): number {
      return a + (b - a) * p;
    }

    /** 코드 줄에서 글자 k 번째의 x. */
    function codeCharX(h: Handles, scene: ScopeExitScene, line: number, k: number): number {
      const ln = scene.lines[line];
      return h.g.codeX + ((ln?.indent ?? 0) * 4 + k) * h.g.charW;
    }

    async function animate(scene: ScopeExitScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      const g = h.g;
      if (!step) return;
      const boxCx = g.boxX + g.boxW / 2;

      if (step.kind === 'assign') {
        const target = h.values.get(step.slot);
        const ty = g.rowY(step.slot);
        const text = scene.lines[step.line]?.text ?? '';
        const eq = text.indexOf(' = ');
        const fromCode = { x: codeCharX(h, scene, step.line, eq >= 0 ? eq + 3 : 0) + g.charW, y: g.rowY(step.line) };
        const sources =
          !step.declare && step.reads.length > 0
            ? step.reads.map((r) => ({ x: boxCx, y: g.rowY(r.slot), s: fmt(scene.slots.find((x) => x.slot === r.slot)?.value ?? '') }))
            : [{ ...fromCode, s: fmt(step.value) }];
        if (target) {
          if (step.declare) target.setAttribute('visibility', 'hidden');
          else target.textContent = fmt(step.was ?? 0);
        }
        const chips = sources.map((src) => ({ src, node: chip(h, src.s, c.itemActive) }));
        await tween(mine, MOVE_MS, (p) => {
          for (const k of chips) place(k.node, lerp(k.src.x, boxCx, p), lerp(k.src.y, ty, p));
        });
        return;
      }

      if (step.kind === 'branch') {
        const grp = h.bodies.get(step.line);
        const b = scene.bodies.find((x) => x.head === step.line);
        if (!grp || !b || !step.result) return;
        const top = bodyRect(g, b, depthOf(step.line, scene.bodies, scene.open) + 1).y;
        await tween(mine, MOVE_MS, (p) => {
          const s = Math.max(0.001, p);
          grp.setAttribute('transform', 'translate(0,' + rd(top) + ') scale(1,' + s.toFixed(3) + ') translate(0,' + rd(-top) + ')');
        });
        return;
      }

      if (step.kind === 'exit') {
        const b = scene.bodies.find((x) => x.head === step.head);
        if (!b) return;
        const depth = depthOf(step.head, scene.bodies, scene.open) + 1;
        const ghost = drawBody(h.fx, g, b, depth, step.gone, () => c.border, new Map());
        const top = bodyRect(g, b, depth).y;
        await tween(mine, MOVE_MS, (p) => {
          const s = Math.max(0.001, 1 - p);
          ghost.setAttribute('transform', 'translate(0,' + rd(top) + ') scale(1,' + s.toFixed(3) + ') translate(0,' + rd(-top) + ')');
        });
        return;
      }

      if (step.kind === 'show') {
        const i = scene.outputs.length - 1;
        const out = h.outputs[i];
        if (!out || !step.from) return;
        out.setAttribute('visibility', 'hidden');
        const node = chip(h, fmt(step.value), c.itemActive);
        const sx = boxCx;
        const sy = g.rowY(step.from.slot);
        const ex = h.outX(i) + 28;
        await tween(mine, MOVE_MS, (p) => place(node, lerp(sx, ex, p), lerp(sy, OUT_Y, p)));
        return;
      }

      if (step.kind === 'unknown') {
        const probe = h.probe;
        if (!probe) return;
        const text = scene.lines[step.line]?.text ?? '';
        const k = Math.max(0, text.indexOf(step.name));
        const dx0 = codeCharX(h, scene, step.line, k) - (g.fx0 + 18);
        const sweep = g.rowY(step.line) - g.rowY(0);
        await tween(mine, MOVE_MS, (p) => {
          if (p < 0.45) {
            place(probe, lerp(dx0, 0, p / 0.45), 0);
          } else {
            const q = (p - 0.45) / 0.55;
            place(probe, 0, q >= 1 ? 0 : -sweep * Math.sin(Math.PI * q));
          }
        });
      }
    }

    return {
      async render(next: ScopeExitScene, prev: ScopeExitScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || !prev || !next.step || next.step.kind === 'start') return;
        await animate(next, h, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
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
