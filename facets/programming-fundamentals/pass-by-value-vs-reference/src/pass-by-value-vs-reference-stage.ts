/**
 * 값 전달과 참조 전달 — stage.
 *
 * 왼쪽에 코드, 오른쪽에 자리들. 바깥 변수마다 한 칸(열)이 있고 그 아래에 부른 틀이 선다.
 *
 * 동사는 "건너가는 것이 다르다" 다.
 *   - 복사해 넘길 때 — 값 조각이 부른 쪽 자리에서 **떨어져 나와** 틀 안의 새 자리로 내려간다. 부른 쪽 자리는 제 값을 그대로 쥔다
 *   - 자리를 넘길 때 — 아무것도 내려가지 않는다. 틀의 인자 **이름표**가 위로 올라가 부른 쪽 자리에 붙는다
 * 그래서 같은 몸 `n = n + 1` 의 값 바뀜이 앞에서는 틀 안에서, 뒤에서는 바깥 자리에서 일어난다.
 * 돌아올 때 틀은 머리줄 쪽으로 접혀 걷히고, 복사본은 함께 사라지며 이름표는 틀로 되돌아간다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { PassBind, Val } from './algorithm.js';
import type { PassFrame, PassScene, PassStep } from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const PAD = 16;
const MOVE_MS = 400;
const TICK_MS = 16;
const SVG = 'http://www.w3.org/2000/svg';

const CODE_PX = parseFloat(fontSizes.sm);
const VALUE_PX = parseFloat(fontSizes.lg);
const CAPTION_PX = parseFloat(fontSizes.md);
const CODE_CH = CODE_PX * 0.6;

const OUTER_Y = PAD;
const OUTER_H = 92;
const FRAME_Y = OUTER_Y + OUTER_H + 22;
const FRAME_H = 88;
const OUT_Y = FRAME_Y + FRAME_H + 18;
const CAPTION_Y = H - 42;
const BOX_H = 40;
const TAG_W = 26;
const TAG_H = 20;
const CHIP_H = 26;

type Pt = { x: number; y: number };

/** 좌표 · 글자를 만들기 전에 끝자리와 -0 을 걷는다. */
function r(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function fmt(v: Val): string {
  return typeof v === 'number' ? String(v) : `"${v}"`;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el(parent, 'text', { x, y, ...attrs });
  node.textContent = s;
  return node;
}

/** 캡션을 폭에 맞춰 두 줄까지 나눈다. 넓은 글자(한중일)는 한 칸 가까이, 나머지는 반 칸으로 친다. */
function wrap(text: string, maxW: number): string[] {
  const width = (s: string): number => {
    let w = 0;
    for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? CAPTION_PX * 0.95 : CAPTION_PX * 0.5;
    return w;
  };
  const words = text.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && width(next) > maxW) {
      out.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** 자리의 가로 짜임 — 캔버스 폭과 코드 폭에서 역산한다. */
type Geo = {
  codeW: number;
  lineH: number;
  memX: number;
  colW: number;
  boxW: number;
};

function geometry(scene: PassScene): Geo {
  let maxChars = 0;
  for (const l of scene.lines) maxChars = Math.max(maxChars, l.indent * 4 + l.text.length);
  const codeW = Math.min(W * 0.4, maxChars * CODE_CH + 24);
  const n = Math.max(1, scene.lines.length);
  const lineH = Math.min(26, (OUT_Y + CHIP_H + 8 - (PAD + 8)) / n);
  const memX = PAD + codeW + 18;
  const cols = Math.max(1, scene.slots, scene.outer.length);
  const colW = (W - PAD - memX) / cols;
  const boxW = Math.min(84, colW * 0.42);
  return { codeW, lineH, memX, colW, boxW };
}

function lineY(g: Geo, i: number): number {
  return PAD + 8 + i * g.lineH;
}

function colX(g: Geo, c: number): number {
  return g.memX + c * g.colW;
}

/** 바깥 자리 `c` 의 네모 (왼쪽 위). */
function outerBox(g: Geo, c: number): Pt {
  return { x: colX(g, c) + g.colW / 2 - g.boxW / 2, y: OUTER_Y + 36 };
}

/** 틀이 설 열 — 인자가 어느 바깥 자리에서 왔는가. 못 찾으면 틀 번호 차례. */
function frameCol(scene: PassScene, f: PassFrame): number {
  for (const b of f.binds) {
    const src = b.mode === 'place' ? b.place : b.from;
    const c = scene.outer.findIndex((o) => o.place === src);
    if (c >= 0) return c;
  }
  const cols = Math.max(1, scene.slots, scene.outer.length);
  return (f.frame - 1) % cols;
}

function frameTop(f: PassFrame): number {
  return FRAME_Y + (f.depth - 1) * 8;
}

/** 틀 안 인자 `j` 의 자리 네모 (왼쪽 위). 이름표가 떠나고 돌아오는 자리이기도 하다. */
function frameSlot(g: Geo, c: number, f: PassFrame, j: number): Pt {
  const k = f.binds.length;
  const cx = colX(g, c) + g.colW / 2 + (j - (k - 1) / 2) * (g.boxW + 12);
  return { x: cx - g.boxW / 2, y: frameTop(f) + 32 };
}

/** 바깥 자리에 붙은 이름표의 가운데. 같은 자리에 붙은 차례(`k`)만큼 아래로 비낀다. */
function tagAt(g: Geo, c: number, k: number): Pt {
  const b = outerBox(g, c);
  return { x: b.x + g.boxW + 8 + TAG_W / 2, y: b.y + BOX_H / 2 + k * (TAG_H + 4) };
}

function tagHome(g: Geo, c: number, f: PassFrame, j: number): Pt {
  const s = frameSlot(g, c, f, j);
  return { x: s.x + g.boxW / 2, y: s.y + BOX_H / 2 };
}

function outSlot(g: Geo, i: number): Pt {
  return { x: g.memX + 8 + i * (44 + 8), y: OUT_Y + 12 };
}

/** 그린 뒤 운동이 손대는 손잡이. 정적 그리기가 매번 새로 만든다. */
type Handles = {
  hl: SVGRectElement | null;
  value: Map<number, SVGTextElement>;
  center: Map<number, Pt>;
  tags: Map<string, { g: SVGGElement; line: SVGLineElement; home: Pt; at: Pt }>;
  outChips: SVGGElement[];
  overlay: SVGGElement;
};

function drawChip(parent: Element, c: Palette, at: Pt, text: string, fill: string, ink: string): SVGGElement {
  const g = el(parent, 'g', { transform: `translate(${r(at.x)},${r(at.y)})` });
  const w = Math.max(30, text.length * VALUE_PX * 0.62 + 14);
  el(g, 'rect', { x: -w / 2, y: -CHIP_H / 2, width: w, height: CHIP_H, rx: 6, fill, stroke: c.border });
  label(g, 0, 0, text, {
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-family': fonts.mono,
    'font-size': fontSizes.lg,
    'font-weight': 600,
    fill: ink,
  });
  return g;
}

function drawTag(parent: Element, c: Palette, at: Pt, name: string): SVGGElement {
  const g = el(parent, 'g', { transform: `translate(${r(at.x)},${r(at.y)})` });
  el(g, 'rect', { x: -TAG_W / 2, y: -TAG_H / 2, width: TAG_W, height: TAG_H, rx: TAG_H / 2, fill: c.primary });
  label(g, 0, 0, name, {
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-family': fonts.mono,
    'font-size': fontSizes.sm,
    'font-weight': 700,
    fill: c.textInverse,
  });
  return g;
}

function move(g: SVGGElement, at: Pt): void {
  g.setAttribute('transform', `translate(${r(at.x)},${r(at.y)})`);
}

function caption(t: Translate, scene: PassScene): string {
  const s = scene.step;
  if (!s || s.kind === 'start') return t('caption.start', 'Nothing has run yet.');
  if (s.kind === 'declare') {
    return t('caption.declare', 'New place {name}, holding {value}.', { name: s.name, value: fmt(s.value) });
  }
  if (s.kind === 'call') {
    const b = s.frame.binds[0];
    if (!b) return t('caption.callPlain', 'Call {fn}.', { fn: s.frame.fn });
    const vars = { fn: s.frame.fn, arg: b.arg, param: b.param, value: fmt(b.value) };
    if (b.mode === 'copy') {
      const srcValue = b.from === null ? undefined : scene.values[b.from];
      if (srcValue === undefined) {
        return t('caption.callCopyExpr', '{fn}({arg}): the value {value} is copied into a new place {param}.', vars);
      }
      return t('caption.callCopy', '{fn}({arg}): the value {value} is copied into a new place {param}. {arg} is still {srcValue}.', {
        ...vars,
        srcValue: fmt(srcValue),
      });
    }
    return t('caption.callPlace', '{fn}({arg}): nothing is copied. The name {param} is attached to the place of {arg}.', vars);
  }
  if (s.kind === 'assign') {
    const owner = scene.outer.find((o) => o.place === s.place);
    if (owner && owner.name !== s.name) {
      return t('caption.assignThrough', '{name} = {value}: {name} is the place of {owner}, so {owner} is now {value}.', {
        name: s.name,
        value: fmt(s.value),
        owner: owner.name,
      });
    }
    const bind = scene.frames.flatMap((f) => f.binds).find((b) => b.mode === 'copy' && b.place === s.place);
    const src = bind ? scene.outer.find((o) => o.place === bind.from) : undefined;
    const srcValue = src ? scene.values[src.place] : undefined;
    if (src && srcValue !== undefined) {
      return t('caption.assignCopy', '{name} = {value}: only the copy changes. {src} is still {srcValue}.', {
        name: s.name,
        value: fmt(s.value),
        src: src.name,
        srcValue: fmt(srcValue),
      });
    }
    return t('caption.assign', '{name}: {was} becomes {value}.', { name: s.name, was: fmt(s.was), value: fmt(s.value) });
  }
  if (s.kind === 'return') {
    const b = s.frame.binds[0];
    if (!b) return t('caption.returnPlain', 'Back from {fn}, no value returned.', { fn: s.frame.fn });
    const v = s.last[b.place];
    if (b.mode === 'copy') {
      return t('caption.returnCopy', 'Back from {fn}, no value returned. The frame goes, and the copy {param} = {value} goes with it.', {
        fn: s.frame.fn,
        param: b.param,
        value: v === undefined ? '' : fmt(v),
      });
    }
    const kept = scene.values[b.place];
    return t('caption.returnPlace', 'Back from {fn}, no value returned. The name {param} comes off; the place of {arg} keeps {value}.', {
      fn: s.frame.fn,
      param: b.param,
      arg: b.arg,
      value: kept === undefined ? '' : fmt(kept),
    });
  }
  const src = s.from === null ? undefined : scene.outer.find((o) => o.place === s.from);
  if (src) return t('caption.showFrom', 'Output {value}, read from the place of {name}.', { value: fmt(s.value), name: src.name });
  return t('caption.show', 'Output {value}.', { value: fmt(s.value) });
}

export const passByValueVsReferenceStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    // 코드와 값은 장면(init 이벤트)이 싣는다. initialData 는 읽지 않는다 — 없어도 던지지 않는다

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawPlace(parent: Element, g: Geo, at: Pt, name: string, value: Val | undefined, hot: boolean, h: Handles, place: number): void {
      el(parent, 'rect', {
        x: at.x,
        y: at.y,
        width: g.boxW,
        height: BOX_H,
        rx: 4,
        fill: c.bg,
        stroke: hot ? c.accent : c.text,
        'stroke-width': hot ? 2.5 : 1.25,
      });
      label(parent, at.x - 8, at.y + BOX_H / 2, name, {
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: c.text,
      });
      const center = { x: at.x + g.boxW / 2, y: at.y + BOX_H / 2 };
      h.center.set(place, center);
      if (value === undefined) return;
      const txt = label(parent, center.x, center.y, fmt(value), {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': 600,
        fill: c.text,
      });
      h.value.set(place, txt);
    }

    function drawStatic(scene: PassScene): Handles {
      svg.textContent = '';
      const g = geometry(scene);
      const s = scene.step;
      const hotPlace = s && (s.kind === 'declare' || s.kind === 'assign') ? s.place : null;
      const root = el(svg, 'g', {});
      const h: Handles = { hl: null, value: new Map(), center: new Map(), tags: new Map(), outChips: [], overlay: root };

      // 코드
      const cur = s && s.kind !== 'start' ? s.line : null;
      if (scene.lines.length > 0) {
        el(root, 'rect', { x: PAD, y: PAD, width: g.codeW, height: scene.lines.length * g.lineH + 16, rx: 6, fill: c.bgSubtle, stroke: c.border });
      }
      if (cur !== null) {
        h.hl = el(root, 'rect', { x: PAD + 4, y: lineY(g, cur), width: g.codeW - 8, height: g.lineH, rx: 3, fill: c.accent, 'fill-opacity': 0.45 });
      }
      scene.lines.forEach((l, i) => {
        label(root, PAD + 12 + l.indent * 4 * CODE_CH, lineY(g, i) + g.lineH / 2, l.text, {
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
      });

      // 바깥 틀
      const memW = W - PAD - g.memX;
      el(root, 'rect', { x: g.memX, y: OUTER_Y, width: memW, height: OUTER_H, rx: 8, fill: c.bgSubtle, stroke: c.border });
      label(root, g.memX + 10, OUTER_Y + 16, t('label.outer', 'outside'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      scene.outer.forEach((o, i) => {
        drawPlace(root, g, outerBox(g, i), o.name, scene.values[o.place], hotPlace === o.place, h, o.place);
      });

      // 걷힌 틀 — 자취
      for (const f of scene.gone) {
        const col = frameCol(scene, f);
        const fx = colX(g, col) + 8;
        const fy = frameTop(f);
        el(root, 'rect', { x: fx, y: fy, width: g.colW - 16, height: FRAME_H, rx: 8, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '4 4' });
        label(root, fx + 10, fy + 16, f.fn, { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted });
        f.binds.forEach((b, j) => {
          if (b.mode !== 'copy') return;
          const at = frameSlot(g, col, f, j);
          el(root, 'rect', { x: at.x, y: at.y, width: g.boxW, height: BOX_H, rx: 4, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 3' });
          label(root, at.x - 8, at.y + BOX_H / 2, b.param, {
            'text-anchor': 'end',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: c.textMuted,
          });
        });
      }

      // 선 틀
      const attached = new Map<number, number>();
      for (const f of scene.frames) {
        const col = frameCol(scene, f);
        const fx = colX(g, col) + 8;
        const fy = frameTop(f);
        el(root, 'rect', { x: fx, y: fy, width: g.colW - 16, height: FRAME_H, rx: 8, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5 });
        label(root, fx + 10, fy + 16, f.fn, { 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.primary });
        f.binds.forEach((b, j) => {
          if (b.mode === 'copy') {
            drawPlace(root, g, frameSlot(g, col, f, j), b.param, scene.values[b.place], hotPlace === b.place, h, b.place);
            return;
          }
          const oc = scene.outer.findIndex((o) => o.place === b.place);
          if (oc < 0) return;
          const k = attached.get(b.place) ?? 0;
          attached.set(b.place, k + 1);
          const at = tagAt(g, oc, k);
          const home = tagHome(g, col, f, j);
          const line = el(root, 'line', { x1: home.x, y1: fy, x2: at.x, y2: at.y + TAG_H / 2, stroke: c.primary, 'stroke-width': 1.5 });
          const tg = drawTag(root, c, at, b.param);
          h.tags.set(`${f.frame}:${j}`, { g: tg, line, home, at });
        });
      }

      // 출력
      label(root, g.memX + 8, OUT_Y + 2, t('label.output', 'output'), { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
      scene.output.forEach((v, i) => {
        const at = outSlot(g, i);
        h.outChips.push(drawChip(root, c, { x: at.x + 22, y: at.y + CHIP_H / 2 + 6 }, fmt(v), c.bgSubtle, c.text));
      });

      // 캡션
      wrap(caption(t, scene), W - 2 * PAD).slice(0, 2).forEach((ln, i) => {
        label(root, PAD, CAPTION_Y + i * (CAPTION_PX + 6), ln, {
          'dominant-baseline': 'hanging',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        });
      });

      h.overlay = el(root, 'g', {});
      return h;
    }

    function tween(mine: number, frame: (p: number) => void): Promise<void> {
      const total = Math.ceil(MOVE_MS / TICK_MS);
      return new Promise((resolve) => {
        let n = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          n += 1;
          const p = Math.min(1, n / total);
          frame(ease(p));
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, TICK_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, TICK_MS);
        timers.add(id);
      });
    }

    /** 이번 걸음의 운동 — 요소는 이미 끝 자리에 서 있고, 아직 못 온 만큼으로 그린다. */
    function motion(scene: PassScene, s: Exclude<PassStep, { kind: 'start' }>, h: Handles): (p: number) => void {
      const g = geometry(scene);
      const parts: ((p: number) => void)[] = [];
      const hl = h.hl;
      if (hl && s.fromLine !== null && s.fromLine !== s.line) {
        const y0 = lineY(g, s.fromLine);
        const y1 = lineY(g, s.line);
        parts.push((p) => hl.setAttribute('y', String(r(lerp(y0, y1, p)))));
      }
      const fly = (from: Pt, to: Pt, text: string, hide: SVGElement | undefined, fill: string, ink: string): void => {
        if (hide) hide.setAttribute('visibility', 'hidden');
        const chip = drawChip(h.overlay, c, from, text, fill, ink);
        parts.push((p) => {
          move(chip, { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) });
          if (p >= 1 && hide) hide.removeAttribute('visibility');
        });
      };
      const codeEnd = (line: number): Pt => {
        const l = scene.lines[line];
        return { x: PAD + 12 + ((l?.indent ?? 0) * 4 + (l?.text.length ?? 0)) * CODE_CH, y: lineY(g, line) + g.lineH / 2 };
      };

      if (s.kind === 'declare') {
        const to = h.center.get(s.place);
        if (to) fly(codeEnd(s.line), to, fmt(s.value), h.value.get(s.place), c.itemActive, c.textInverse);
      } else if (s.kind === 'call') {
        s.frame.binds.forEach((b: PassBind, j: number) => {
          if (b.mode === 'copy') {
            const to = h.center.get(b.place);
            const from = (b.from !== null ? h.center.get(b.from) : undefined) ?? codeEnd(s.line);
            if (to) fly(from, to, fmt(b.value), h.value.get(b.place), c.itemActive, c.textInverse);
            return;
          }
          const tag = h.tags.get(`${s.frame.frame}:${j}`);
          if (!tag) return;
          const fy = frameTop(s.frame);
          parts.push((p) => {
            const at = { x: lerp(tag.home.x, tag.at.x, p), y: lerp(tag.home.y, tag.at.y, p) };
            move(tag.g, at);
            tag.line.setAttribute('x2', String(r(at.x)));
            tag.line.setAttribute('y2', String(r(Math.max(fy, at.y + TAG_H / 2))));
          });
        });
      } else if (s.kind === 'assign') {
        const txt = h.value.get(s.place);
        const ctr = h.center.get(s.place);
        if (txt && ctr) {
          const old = label(h.overlay, ctr.x, ctr.y, fmt(s.was), {
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            'font-weight': 600,
            fill: c.textMuted,
          });
          parts.push((p) => {
            old.setAttribute('y', String(r(ctr.y - 16 * p)));
            old.setAttribute('opacity', String(r(1 - p)));
            txt.setAttribute('y', String(r(ctr.y + 16 * (1 - p))));
            if (p >= 1) old.remove();
          });
        }
      } else if (s.kind === 'return') {
        const f = s.frame;
        const col = frameCol(scene, f);
        const fx = colX(g, col) + 8;
        const fy = frameTop(f);
        const box = el(h.overlay, 'g', {});
        el(box, 'rect', { x: fx, y: fy, width: g.colW - 16, height: FRAME_H, rx: 8, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5 });
        label(box, fx + 10, fy + 16, f.fn, { 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.primary });
        const scratch: Handles = { hl: null, value: new Map(), center: new Map(), tags: new Map(), outChips: [], overlay: box };
        const hasTag = f.binds.some((b) => b.mode === 'place');
        const tags: { g: SVGGElement; line: SVGLineElement; home: Pt; at: Pt }[] = [];
        const seen = new Map<number, number>();
        f.binds.forEach((b, j) => {
          if (b.mode === 'copy') {
            drawPlace(box, g, frameSlot(g, col, f, j), b.param, s.last[b.place], false, scratch, b.place);
            return;
          }
          const oc = scene.outer.findIndex((o) => o.place === b.place);
          if (oc < 0) return;
          const k = seen.get(b.place) ?? 0;
          seen.set(b.place, k + 1);
          const at = tagAt(g, oc, k);
          const home = tagHome(g, col, f, j);
          const line = el(h.overlay, 'line', { x1: home.x, y1: fy, x2: at.x, y2: at.y + TAG_H / 2, stroke: c.primary, 'stroke-width': 1.5 });
          tags.push({ g: drawTag(h.overlay, c, at, b.param), line, home, at });
        });
        parts.push((p) => {
          const tp = hasTag ? Math.min(1, p * 2) : 1;
          const q = hasTag ? Math.max(0, p * 2 - 1) : p;
          for (const tag of tags) {
            const at = { x: lerp(tag.at.x, tag.home.x, tp), y: lerp(tag.at.y, tag.home.y, tp) };
            move(tag.g, at);
            tag.line.setAttribute('x2', String(r(at.x)));
            tag.line.setAttribute('y2', String(r(Math.max(fy, at.y + TAG_H / 2))));
            if (tp >= 1) {
              tag.g.setAttribute('visibility', 'hidden');
              tag.line.setAttribute('visibility', 'hidden');
            }
          }
          // 틀이 머리줄 쪽으로 접힌다
          const sy = Math.max(0.001, 1 - q);
          box.setAttribute('transform', `translate(0,${r(fy * (1 - sy))}) scale(1,${r(sy)})`);
        });
      } else if (s.kind === 'show') {
        const chip = h.outChips[s.slot];
        if (chip) {
          const at = outSlot(g, s.slot);
          const to = { x: at.x + 22, y: at.y + CHIP_H / 2 + 6 };
          const from = (s.from !== null ? h.center.get(s.from) : undefined) ?? codeEnd(s.line);
          fly(from, to, fmt(s.value), chip, c.bgSubtle, c.text);
        }
      }
      return (p) => {
        for (const part of parts) part(p);
      };
    }

    return {
      async render(next: PassScene, _prev: PassScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        const s = next.step;
        if (!opts.animate || !s || s.kind === 'start') return;
        const frame = motion(next, s, h);
        await tween(mine, frame);
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
