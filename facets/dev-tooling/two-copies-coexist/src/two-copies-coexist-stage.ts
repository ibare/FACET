/**
 * two-copies-coexist 의 stage — 폴더 자리와 찾기.
 *
 * 뿌리 폴더 안 꼭대기 `node_modules/` 띠에 놓인 꾸러미가 칸으로 앉고, 부름을 가진 꾸러미는 그 칸 아래로
 * 제 폴더를 늘어뜨린다. 폴더 안에는 제 부름과 제 안쪽 `node_modules/` 가 있다. 안쪽이 아래, 꼭대기가 위라
 * 찾기가 "한 칸 위로" 가면 그림에서도 실제로 올라간다.
 *
 * 운동 — 놓기는 부름 칩에서 칸으로 카드가 날아가 앉는다. 찾기는 부름 칩에서 탐침이 제 안쪽 자리로 내려가고,
 * 없으면 폴더 옆 틈으로 올라가 꼭대기 띠를 따라 건너가 그 이름의 칸으로 들어간다. 지나간 길은 자취로 남는다.
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
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { placePath } from './algorithm.js';
import type { Looked, TwoCopiesCoexistScene } from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const NS = 'http://www.w3.org/2000/svg';
const NODE_MODULES = 'node_modules/';

const PAD = 12;
const FRAME_TOP = 8;
const FRAME_BOTTOM = 266;
const HEADER_Y = 32;
const BAND_Y = 54;
const BAND_H = 88;
const LANE_Y = 80;
const SLOT_Y = 88;
const SLOT_H = 42;
const FOLDER_BOTTOM = 256;
const INNER_BAND_H = 72;
const COL_GAP = 18;
const COL_MAX = 200;
const CHIP_H = 22;
const CAPTION_Y = [288, 308, 327] as const;
const PLACE_MS = 520;
const LOOK_MS = 560;

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);
const MONO_ADVANCE = 0.6;

type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function monoWidth(text: string, px: number): number {
  return text.length * px * MONO_ADVANCE;
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  opts: { size: number; family: string; fill: string; weight?: number; anchor?: string },
): SVGElement {
  const node = el(
    'text',
    {
      x,
      y,
      'font-size': opts.size,
      'font-family': opts.family,
      fill: opts.fill,
      'font-weight': opts.weight ?? 400,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'middle',
    },
    parent,
  );
  node.textContent = text;
  return node;
}

/** 폴리라인의 앞쪽 d 만큼. */
function partial(points: readonly Pt[], k: number): { pts: Pt[]; tip: Pt } {
  const first = points[0] as Pt;
  if (points.length < 2) return { pts: [first], tip: first };
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  let left = total * k;
  const out: Pt[] = [first];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left >= seg) {
      out.push(b);
      left -= seg;
      continue;
    }
    const f = seg === 0 ? 0 : left / seg;
    const tip = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    out.push(tip);
    return { pts: out, tip };
  }
  return { pts: out, tip: out[out.length - 1] as Pt };
}

function pointsAttr(pts: readonly Pt[]): string {
  return pts.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' ');
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

/** 장면의 뼈대에서 자리를 셈한다. 좌표는 여기서만 난다. */
class Geometry {
  readonly cols = new Map<string, number>();
  readonly colW: number;
  private readonly colX0: number;

  constructor(private readonly scene: TwoCopiesCoexistScene) {
    const n = Math.max(1, scene.layout.tops.length);
    const inner = W - 2 * (PAD + 10) - 24;
    this.colW = Math.min(COL_MAX, (inner - COL_GAP * (n - 1)) / n);
    const total = n * this.colW + (n - 1) * COL_GAP;
    this.colX0 = PAD + 10 + 12 + (inner - total) / 2;
    scene.layout.tops.forEach((name, i) => this.cols.set(name, i));
  }

  colX(name: string): number {
    const i = this.cols.get(name);
    if (i === undefined) throw new Error(`two-copies-coexist: 꼭대기 칸이 없는 이름 ${name}`);
    return this.colX0 + i * (this.colW + COL_GAP);
  }

  topSlot(name: string): Rect {
    return { x: this.colX(name), y: SLOT_Y, w: this.colW, h: SLOT_H };
  }

  callsOf(pkg: string): { name: string; range: string }[] {
    return this.scene.calls[pkg] ?? [];
  }

  innerOf(pkg: string): { parent: string; name: string }[] {
    return this.scene.layout.inner.filter((s) => s.parent === pkg);
  }

  hasFolder(pkg: string): boolean {
    return this.callsOf(pkg).length > 0 || this.innerOf(pkg).length > 0;
  }

  chipStep(pkg: string): number {
    const n = Math.max(1, this.callsOf(pkg).length);
    return Math.min(CHIP_H + 6, (FOLDER_BOTTOM - 8 - INNER_BAND_H - (SLOT_Y + SLOT_H + 16)) / n);
  }

  folderChip(pkg: string, name: string): Rect {
    const calls = this.callsOf(pkg);
    const k = calls.findIndex((c) => c.name === name);
    if (k < 0) throw new Error(`two-copies-coexist: ${pkg} 에 ${name} 부름이 없다`);
    const x = this.colX(pkg);
    return { x: x + 8, y: SLOT_Y + SLOT_H + 10 + k * this.chipStep(pkg), w: this.colW - 16, h: CHIP_H };
  }

  innerBand(pkg: string): Rect {
    const n = Math.max(1, this.callsOf(pkg).length);
    const y = SLOT_Y + SLOT_H + 10 + n * this.chipStep(pkg) + 6;
    const x = this.colX(pkg);
    return { x: x + 6, y, w: this.colW - 12, h: INNER_BAND_H };
  }

  innerSlot(parent: string, name: string): Rect {
    const list = this.innerOf(parent);
    const k = list.findIndex((s) => s.name === name);
    if (k < 0) throw new Error(`two-copies-coexist: ${parent} 안쪽에 ${name} 자리가 없다`);
    const band = this.innerBand(parent);
    const gap = 6;
    const w = (band.w - 12 - gap * (list.length - 1)) / list.length;
    return { x: band.x + 6 + k * (w + gap), y: band.y + 8, w, h: SLOT_H };
  }

  slotOf(parent: string | null, name: string): Rect {
    return parent === null ? this.topSlot(name) : this.innerSlot(parent, name);
  }

  headerChips(): { name: string; rect: Rect; text: string }[] {
    const out: { name: string; rect: Rect; text: string }[] = [];
    let x = PAD + 16 + monoWidth(`${this.scene.root}/`, SM) + 14;
    for (const c of this.callsOf(this.scene.root)) {
      const text = `→ ${c.name} ${c.range}`;
      const w = monoWidth(text, SM) + 16;
      out.push({ name: c.name, rect: { x, y: HEADER_Y - CHIP_H / 2, w, h: CHIP_H }, text });
      x += w + 8;
    }
    return out;
  }

  chipOf(pkg: string, name: string): Rect {
    if (pkg === this.scene.root) {
      const hit = this.headerChips().find((c) => c.name === name);
      if (hit === undefined) throw new Error(`two-copies-coexist: ${pkg} 에 ${name} 부름이 없다`);
      return hit.rect;
    }
    return this.folderChip(pkg, name);
  }

  /** 탐침이 앉는 자리 — 칸 가운데서 조금 왼쪽 (이름과 버전 사이의 빈 곳). 부름 칩의 길 시작과 같은 x. */
  anchorIn(rect: Rect): Pt {
    return { x: rect.x + rect.w / 2 - 8, y: rect.y + rect.h / 2 };
  }

  /** 찾기 하나의 길 — 앞 찾기가 끝난 자리(없으면 부름 칩)에서 이번에 본 자리까지. */
  route(looked: readonly Looked[], index: number): Pt[] {
    const look = looked[index] as Looked;
    let start: Pt | null = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = looked[i] as Looked;
      if (prev.seeker === look.seeker) {
        start = this.anchorIn(this.slotOf(prev.parent, prev.name));
        break;
      }
    }
    if (start === null) {
      const chip = this.chipOf(look.seeker, look.name);
      start = { x: chip.x + chip.w / 2 - 8, y: chip.y + chip.h };
    }
    const end = this.anchorIn(this.slotOf(look.parent, look.name));
    if (look.parent !== null) {
      if (start.x === end.x) return [start, end];
      const mid = (start.y + end.y) / 2;
      return [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end];
    }
    const gutter = this.colX(look.seeker) - COL_GAP / 2;
    return [start, { x: gutter, y: start.y }, { x: gutter, y: LANE_Y }, { x: end.x, y: LANE_Y }, end];
  }
}

export const twoCopiesCoexistStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function copyColor(scene: TwoCopiesCoexistScene, index: number): string {
      const palette = categorical(Math.max(1, scene.layout.copies), 'vivid');
      return palette[index % palette.length] as string;
    }

    /** 놓인 것 i 가 찾는 이름의 몇 번째 벌인가 (아니면 -1). */
    function copyIndex(scene: TwoCopiesCoexistScene, i: number): number {
      let k = -1;
      for (let j = 0; j <= i; j += 1) if ((scene.placed[j] as { name: string }).name === scene.target) k += 1;
      return (scene.placed[i] as { name: string }).name === scene.target ? k : -1;
    }

    function card(parent: Element, rect: Rect, name: string, version: string, fill: string, ink: string, stroke: string): SVGElement {
      const g = el('g', {}, parent);
      el('rect', { x: rect.x, y: rect.y, width: rect.w, height: rect.h, rx: 6, fill, stroke, 'stroke-width': 1.5 }, g);
      label(g, rect.x + 10, rect.y + rect.h / 2, `${name}/`, { size: SM, family: fonts.mono, fill: ink, weight: 700 });
      label(g, rect.x + rect.w - 10, rect.y + rect.h / 2, version, {
        size: SM,
        family: fonts.mono,
        fill: ink,
        anchor: 'end',
      });
      return g;
    }

    type Hide = { placed?: number; look?: number };

    function drawStatic(scene: TwoCopiesCoexistScene, hide: Hide = {}): void {
      svg.textContent = '';
      const g = new Geometry(scene);
      const root = el('g', {}, svg);

      // 뿌리 폴더와 머리
      el('rect', {
        x: PAD,
        y: FRAME_TOP,
        width: W - 2 * PAD,
        height: FRAME_BOTTOM - FRAME_TOP,
        rx: 10,
        fill: c.bg,
        stroke: c.border,
        'stroke-width': 1.5,
      }, root);
      label(root, PAD + 16, HEADER_Y, `${scene.root}/`, { size: SM, family: fonts.mono, fill: c.text, weight: 700 });
      for (const chip of g.headerChips()) {
        el('rect', { x: chip.rect.x, y: chip.rect.y, width: chip.rect.w, height: chip.rect.h, rx: 11, fill: c.bgSubtle, stroke: c.border }, root);
        label(root, chip.rect.x + 8, HEADER_Y, chip.text, { size: SM, family: fonts.mono, fill: c.text });
      }

      // 찾는 이름의 벌 수 — 보이는 칸 수와 같다
      const shown = scene.placed.filter((p, i) => p.name === scene.target && i !== hide.placed).length;
      label(root, W - PAD - 14, HEADER_Y, t('label.copies', 'Copies of {name}: {n}', { name: scene.target, n: shown }), {
        size: SM,
        family: fonts.body,
        fill: c.text,
        weight: 700,
        anchor: 'end',
      });

      // 꼭대기 node_modules 띠
      el('rect', {
        x: PAD + 10,
        y: BAND_Y,
        width: W - 2 * (PAD + 10),
        height: BAND_H,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.border,
      }, root);
      label(root, PAD + 20, BAND_Y + 13, NODE_MODULES, { size: XS, family: fonts.mono, fill: c.textMuted });
      const topsShown = scene.placed.filter((p, i) => p.parent === null && i !== hide.placed);
      if (topsShown.length === 0) {
        label(root, W / 2, SLOT_Y + SLOT_H / 2, t('label.empty', 'empty'), {
          size: SM,
          family: fonts.body,
          fill: c.textMuted,
          anchor: 'middle',
        });
      }

      // 폴더 몸 (칸 아래로 늘어진다) — 칸보다 먼저 그려 칸이 위에 앉게
      scene.placed.forEach((p, i) => {
        if (i === hide.placed || p.parent !== null || !g.hasFolder(p.name)) return;
        const x = g.colX(p.name);
        el('rect', {
          x: x + 2,
          y: SLOT_Y + SLOT_H - 6,
          width: g.colW - 4,
          height: FOLDER_BOTTOM - (SLOT_Y + SLOT_H - 6),
          rx: 6,
          fill: c.bg,
          stroke: c.border,
        }, root);
        for (const call of g.callsOf(p.name)) {
          const chip = g.folderChip(p.name, call.name);
          el('rect', { x: chip.x, y: chip.y, width: chip.w, height: chip.h, rx: 11, fill: c.bgSubtle, stroke: c.border }, root);
          label(root, chip.x + 8, chip.y + chip.h / 2, `→ ${call.name} ${call.range}`, {
            size: SM,
            family: fonts.mono,
            fill: c.text,
          });
          const reused = scene.reused.find((u) => u.from === p.name && u.name === call.name);
          if (reused !== undefined) {
            label(root, chip.x + chip.w - 8, chip.y + chip.h / 2, t('label.reused', 'reused {version}', { version: reused.version }), {
              size: XS,
              family: fonts.body,
              fill: c.textMuted,
              anchor: 'end',
            });
          }
        }
        const band = g.innerBand(p.name);
        el('rect', {
          x: band.x,
          y: band.y,
          width: band.w,
          height: band.h,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-dasharray': '4 3',
        }, root);
        label(root, band.x + 8, band.y + band.h - 11, NODE_MODULES, { size: XS, family: fonts.mono, fill: c.textMuted });
        for (const s of g.innerOf(p.name)) {
          const slot = g.innerSlot(s.parent, s.name);
          el('rect', {
            x: slot.x,
            y: slot.y,
            width: slot.w,
            height: slot.h,
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '4 3',
          }, root);
        }
      });

      // 놓인 칸
      scene.placed.forEach((p, i) => {
        if (i === hide.placed) return;
        const rect = g.slotOf(p.parent, p.name);
        const k = copyIndex(scene, i);
        if (k >= 0) card(root, rect, p.name, p.version, copyColor(scene, k), c.stateInk, c.text);
        else card(root, rect, p.name, p.version, c.bg, c.text, c.text);
      });

      // 찾기의 자취
      scene.looked.forEach((_l, i) => {
        if (i === hide.look) return;
        drawLook(root, g, scene, i, 1);
      });

      drawCaption(root, scene);
    }

    function hitColor(scene: TwoCopiesCoexistScene, l: Looked): string {
      const i = scene.placed.findIndex((p) => p.name === l.name && p.parent === l.parent && p.version === l.version);
      if (i < 0) throw new Error(`two-copies-coexist: 찾은 ${l.name} ${String(l.version)} 가 놓인 것에 없다`);
      return copyColor(scene, Math.max(0, copyIndex(scene, i)));
    }

    /** 찾기 i 의 길을 k(0..1) 만큼 그린다. 끝에 닿으면 결과 표시까지. 탐침 끝점을 돌려준다. */
    function drawLook(parent: Element, g: Geometry, scene: TwoCopiesCoexistScene, i: number, k: number): Pt {
      const l = scene.looked[i] as Looked;
      const route = g.route(scene.looked, i);
      const { pts, tip } = partial(route, k);
      const hit = l.version !== null;
      const color = hit ? hitColor(scene, l) : c.textMuted;
      el('polyline', {
        points: pointsAttr(pts),
        fill: 'none',
        stroke: hit ? c.text : c.textMuted,
        'stroke-width': hit ? 4.5 : 1.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        ...(hit ? {} : { 'stroke-dasharray': '5 4' }),
      }, parent);
      if (hit) {
        el('polyline', {
          points: pointsAttr(pts),
          fill: 'none',
          stroke: color,
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        }, parent);
      }
      if (k < 1) return tip;
      const slot = g.slotOf(l.parent, l.name);
      if (hit) {
        el('circle', { cx: tip.x, cy: tip.y, r: 5, fill: color, stroke: c.text, 'stroke-width': 1.5 }, parent);
      } else {
        label(parent, slot.x + slot.w - 10, slot.y + slot.h / 2, t('label.missing', 'none'), {
          size: SM,
          family: fonts.body,
          fill: c.danger,
          weight: 700,
          anchor: 'end',
        });
        el('path', {
          d: `M ${r1(tip.x - 4)} ${r1(tip.y - 4)} L ${r1(tip.x + 4)} ${r1(tip.y + 4)} M ${r1(tip.x + 4)} ${r1(tip.y - 4)} L ${r1(tip.x - 4)} ${r1(tip.y + 4)}`,
          stroke: c.danger,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }, parent);
      }
      return tip;
    }

    function drawCaption(parent: Element, scene: TwoCopiesCoexistScene): void {
      const lines: { text: string; mono: boolean; strong: boolean }[] = [];
      const step = scene.step;
      if (step === null) {
        lines.push({ text: t('caption.start', 'Start — node_modules is empty'), mono: false, strong: true });
      } else if (step.kind === 'place') {
        const p = scene.placed[step.index];
        if (p === undefined) throw new Error('two-copies-coexist: 걸음이 가리키는 놓기가 없다');
        lines.push({
          text: t('caption.call', 'Call: {from} → {name} {range}', { from: p.from, name: p.name, range: p.range }),
          mono: false,
          strong: true,
        });
        if (p.parent === null) {
          lines.push({
            text: t('caption.placeTop', 'No {name} at the top yet — newest in range: {version}', { name: p.name, version: p.version }),
            mono: false,
            strong: false,
          });
        } else {
          lines.push({
            text: t('caption.placeNested', 'Top {name} {was} is outside {range} — placed separately inside {from}: {version}', {
              name: p.name,
              was: String(p.was),
              range: p.range,
              from: p.from,
              version: p.version,
            }),
            mono: false,
            strong: false,
          });
        }
        lines.push({ text: placePath(p.parent, p.name), mono: true, strong: false });
      } else if (step.kind === 'reuse') {
        const u = scene.reused[step.index];
        if (u === undefined) throw new Error('two-copies-coexist: 걸음이 가리키는 다시 씀이 없다');
        lines.push({
          text: t('caption.call', 'Call: {from} → {name} {range}', { from: u.from, name: u.name, range: u.range }),
          mono: false,
          strong: true,
        });
        lines.push({
          text: t('caption.reuse', 'Top {name} {version} is inside {range} — reused', { name: u.name, version: u.version, range: u.range }),
          mono: false,
          strong: false,
        });
        lines.push({ text: placePath(null, u.name), mono: true, strong: false });
      } else {
        const l = scene.looked[step.index];
        if (l === undefined) throw new Error('two-copies-coexist: 걸음이 가리키는 찾기가 없다');
        lines.push({
          text: t('caption.look', 'Lookup: {seeker} → {name}', { seeker: l.seeker, name: l.name }),
          mono: false,
          strong: true,
        });
        lines.push({
          text:
            l.version === null
              ? t('caption.miss', 'Nothing here — one level up')
              : t('caption.hit', 'Found: {version}', { version: l.version }),
          mono: false,
          strong: false,
        });
        lines.push({ text: placePath(l.parent, l.name), mono: true, strong: false });
      }
      lines.forEach((line, i) => {
        label(parent, W / 2, CAPTION_Y[i] as number, line.text, {
          size: line.strong ? parseFloat(fontSizes.md) : SM,
          family: line.mono ? fonts.mono : fonts.body,
          fill: line.mono ? c.textMuted : c.text,
          weight: line.strong ? 700 : 400,
          anchor: 'middle',
        });
      });
    }

    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const t0 = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const k = Math.min(1, (Date.now() - t0) / ms);
          frame(ease(k));
          if (k >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function animatePlace(scene: TwoCopiesCoexistScene, index: number, mine: number): Promise<void> {
      const p = scene.placed[index];
      if (p === undefined) return;
      const g = new Geometry(scene);
      const from = g.chipOf(p.from, p.name);
      const to = g.slotOf(p.parent, p.name);
      const k0 = copyIndex(scene, index);
      const fill = k0 >= 0 ? copyColor(scene, k0) : c.bg;
      const ink = k0 >= 0 ? c.stateInk : c.text;
      const sx = from.x + from.w / 2 - to.w / 2;
      const sy = from.y + from.h / 2 - to.h / 2;
      drawStatic(scene, { placed: index });
      const layer = el('g', {}, svg);
      await tween(PLACE_MS, mine, (k) => {
        layer.textContent = '';
        const rect = { x: sx + (to.x - sx) * k, y: sy + (to.y - sy) * k, w: to.w, h: to.h };
        card(layer, rect, p.name, p.version, fill, ink, c.text);
      });
    }

    async function animateLook(scene: TwoCopiesCoexistScene, index: number, mine: number): Promise<void> {
      if (scene.looked[index] === undefined) return;
      drawStatic(scene, { look: index });
      const layer = el('g', {}, svg);
      const g = new Geometry(scene);
      await tween(LOOK_MS, mine, (k) => {
        layer.textContent = '';
        const tip = drawLook(layer, g, scene, index, k);
        if (k < 1) el('circle', { cx: tip.x, cy: tip.y, r: 6, fill: c.accent, stroke: c.text, 'stroke-width': 1.5 }, layer);
      });
    }

    function progress(s: TwoCopiesCoexistScene): number {
      return s.placed.length + s.reused.length + s.looked.length;
    }

    return {
      async render(next: TwoCopiesCoexistScene, prev: TwoCopiesCoexistScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        const moved = prev !== null && progress(prev) < progress(next);
        if (!opts.animate || step === null || !moved) {
          drawStatic(next);
          return;
        }
        if (step.kind === 'place') await animatePlace(next, step.index, mine);
        else if (step.kind === 'look') await animateLook(next, step.index, mine);
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
