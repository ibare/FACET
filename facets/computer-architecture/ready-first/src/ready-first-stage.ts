/**
 * 준비된 것부터 — 무대.
 *
 * 위는 명령어마다 한 줄의 실행 길이다. 원천이 준비된 명령어는 대기창을 떠나 길을
 * 달리고, 지연이 짧은 것은 한 사이클에 길 끝까지 가서 **앞 명령어를 앞지른다.**
 * 아래는 원래 순서로 자리가 정해진 줄이다. 끝난 명령어는 제 자리로 내려가 서고,
 * 줄의 머리부터 차례로 문을 지나 커밋된다. 먼저 끝난 것은 앞자리가 찰 때까지 줄에서
 * 기다린다.
 *
 * 자리는 전부 장면의 자취(시작 · 끝 · 커밋 사이클)와 지금 사이클에서 파생된다.
 * 운동은 "한 사이클 전의 자리 → 지금 자리" 이고, 한 사이클 전의 자리도 같은 장면의
 * 자취에서 셈한다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ReadyFirstScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const H = 334;
const PAD = 12;
/** 칩 가로의 상한 — 실제 폭은 캔버스에서 역산한다 */
const CHIP_W_MAX = 120;
const CHIP_H = 32;
const SLOT_GAP = 6;
const TAG_W = 32;
const TAG_GAP = 4;
const GATE_GAP = 16;
const HEAD_Y = 16;
const LANE_TOP = 26;
const LANE_H = 40;
const LINE_LABEL_Y = 210;
const LINE_Y = 218;
const CAPTION_Y = 282;
const CAPTION_DY = 20;
/** 칩에 글자 둘(번호 · 명령어)을 다 담는 최소 폭 */
const FULL_CHIP_MIN = 60;
const TRACK_GAP = 20;

const MOVE_MS = 700;
const FRAME_MS = 16;

type Zone = 'window' | 'exec' | 'line' | 'retired';
type Box = { x: number; y: number; w: number; h: number };
type Place = { zone: Zone; box: Box };

type Layout = {
  n: number;
  chipW: number;
  x0: number;
  x1: number;
  gateX: number;
  retX0: number;
};

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function layoutFor(n: number): Layout {
  const W = PIECE_CANVAS_W;
  const count = Math.max(1, n);
  const retW = count * (TAG_W + TAG_GAP);
  const room = W - 2 * PAD - GATE_GAP - retW - (count - 1) * SLOT_GAP;
  const chipW = Math.min(CHIP_W_MAX, Math.floor(room / count));
  const gateX = PAD + count * (chipW + SLOT_GAP) - SLOT_GAP + GATE_GAP / 2;
  return {
    n: count,
    chipW,
    x0: PAD + chipW + TRACK_GAP,
    x1: W - PAD - chipW,
    gateX,
    retX0: gateX + GATE_GAP / 2,
  };
}

function laneChipY(i: number): number {
  return LANE_TOP + i * LANE_H + (LANE_H - CHIP_H) / 2;
}

/** 사이클 c 가 끝났을 때 명령어 i 가 서 있는 자리. */
function placeAt(scene: ReadyFirstScene, L: Layout, i: number, c: number): Place {
  const cm = scene.commit[i];
  const e = scene.end[i];
  const s = scene.start[i];
  if (cm !== null && cm !== undefined && cm <= c) {
    return {
      zone: 'retired',
      box: { x: L.retX0 + i * (TAG_W + TAG_GAP), y: LINE_Y, w: TAG_W, h: CHIP_H },
    };
  }
  if (e !== null && e !== undefined && e <= c) {
    return {
      zone: 'line',
      box: { x: PAD + (L.n - 1 - i) * (L.chipW + SLOT_GAP), y: LINE_Y, w: L.chipW, h: CHIP_H },
    };
  }
  if (s !== null && s !== undefined && s <= c) {
    const lat = Math.max(1, scene.instrs[i]?.lat ?? 1);
    const f = Math.min(1, (c - s + 1) / lat);
    return {
      zone: 'exec',
      box: { x: L.x0 + f * (L.x1 - L.x0), y: laneChipY(i), w: L.chipW, h: CHIP_H },
    };
  }
  return { zone: 'window', box: { x: PAD, y: laneChipY(i), w: L.chipW, h: CHIP_H } };
}

function trackEnd(L: Layout, i: number): Box {
  return { x: L.x1, y: laneChipY(i), w: L.chipW, h: CHIP_H };
}

function done(scene: ReadyFirstScene, i: number, c: number): boolean {
  const e = scene.end[i];
  return e !== null && e !== undefined && e <= c;
}

function committed(scene: ReadyFirstScene, i: number, c: number): boolean {
  const cm = scene.commit[i];
  return cm !== null && cm !== undefined && cm <= c;
}

/** 줄에서 모두가 기다리는 명령어 — 커밋되지 않은 것 가운데 가장 앞의, 아직 안 끝난 것. */
function aheadAt(scene: ReadyFirstScene, c: number): number | null {
  for (let i = 0; i < scene.instrs.length; i += 1) {
    if (committed(scene, i, c)) continue;
    return done(scene, i, c) ? null : i;
  }
  return null;
}

/** 끝났지만 커밋하지 못하고 줄에 서 있는 것 가운데, 앞의 안 끝난 명령어를 기다리는 것. */
function waitersAt(scene: ReadyFirstScene, c: number, exclude: number[]): number[] {
  let blocker: number | null = null;
  const out: number[] = [];
  for (let i = 0; i < scene.instrs.length; i += 1) {
    if (committed(scene, i, c)) continue;
    if (!done(scene, i, c)) {
      if (blocker === null) blocker = i;
      continue;
    }
    if (blocker !== null && !exclude.includes(i)) out.push(i);
  }
  return out;
}

function firstBlocker(scene: ReadyFirstScene, c: number): number | null {
  for (let i = 0; i < scene.instrs.length; i += 1) {
    if (committed(scene, i, c)) continue;
    if (!done(scene, i, c)) return i;
  }
  return null;
}

function narrowPalette(theme: unknown): Palette {
  return getColors(theme === 'dark' ? 'dark' : 'light');
}

export const readyFirstStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance & SceneRenderer<ReadyFirstScene> {
    const svg = params.canvas;
    const C = narrowPalette(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.xs,
        fill: opts.fill ?? C.text,
        'text-anchor': opts.anchor ?? 'start',
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = body;
      return node;
    }

    function sleep(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          timers.delete(handle);
          waiters.delete(wake);
          resolve();
        };
        const handle = setTimeout(wake, ms);
        timers.add(handle);
        waiters.add(wake);
      });
    }

    function chipStyle(
      scene: ReadyFirstScene,
      i: number,
      zone: Zone,
      c: number,
    ): { fill: string; stroke: string; ink: string; dash: string | null; sw: number } {
      const ahead = zone !== 'retired' && zone !== 'line' && waitersAt(scene, c, []).length > 0
        ? aheadAt(scene, c)
        : null;
      const hot = ahead === i;
      if (zone === 'exec') {
        return { fill: C.itemActive, stroke: hot ? C.accent : C.itemActive, ink: C.stateInk, dash: null, sw: hot ? 3 : 1 };
      }
      if (zone === 'line') {
        return { fill: C.itemSorted, stroke: C.itemSorted, ink: C.textInverse, dash: null, sw: 1 };
      }
      if (zone === 'retired') {
        return { fill: C.bg, stroke: C.success, ink: C.text, dash: null, sw: 1.5 };
      }
      const blocked = c >= 1 && scene.instrs[i]?.dep !== null;
      return {
        fill: C.bgSubtle,
        stroke: hot ? C.accent : C.textMuted,
        ink: C.textMuted,
        dash: blocked && !hot ? '4 3' : null,
        sw: hot ? 3 : 1,
      };
    }

    function drawChip(
      parent: Element,
      scene: ReadyFirstScene,
      i: number,
      box: Box,
      style: ReturnType<typeof chipStyle>,
    ): void {
      const ins = scene.instrs[i];
      if (!ins) return;
      const g = el(parent, 'g', {});
      const rect = el(g, 'rect', {
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rx: 5,
        fill: style.fill,
        stroke: style.stroke,
        'stroke-width': style.sw,
      });
      if (style.dash) rect.setAttribute('stroke-dasharray', style.dash);
      if (box.w >= FULL_CHIP_MIN) {
        label(g, box.x + 8, box.y + 13, ins.id, { fill: style.ink, weight: '700' });
        label(g, box.x + 8, box.y + 26, ins.asm, { fill: style.ink, mono: true });
      } else {
        label(g, box.x + box.w / 2, box.y + box.h / 2 + 4, ins.id, {
          fill: style.ink,
          weight: '700',
          anchor: 'middle',
        });
      }
    }

    function captionLines(scene: ReadyFirstScene): string[] {
      const step = scene.step;
      if (!step) return [];
      if (step.kind === 'init') {
        return [t('caption.init', 'The instructions sit in the window, in program order.')];
      }
      const c = step.cycle;
      const ids = (list: number[]): string =>
        list.map((i) => scene.instrs[i]?.id ?? '').join(', ');
      const out: string[] = [];
      if (step.committed.length > 0) {
        out.push(t('caption.commit', 'Commit in program order: {ids}', { ids: ids(step.committed) }));
      }
      if (step.finished.length > 0) {
        const lead = Math.min(...step.finished);
        let ahead: number | null = null;
        for (let k = 0; k < lead; k += 1) {
          if (!done(scene, k, c)) {
            ahead = k;
            break;
          }
        }
        if (ahead !== null) {
          out.push(
            t('caption.overtake', 'Done ahead of {ahead}: {ids} — into the line', {
              ahead: scene.instrs[ahead]?.id ?? '',
              ids: ids(step.finished),
            }),
          );
        } else {
          out.push(t('caption.finish', 'Done: {ids} — into the line', { ids: ids(step.finished) }));
        }
      }
      const waiting = waitersAt(scene, c, step.finished);
      const blocker = firstBlocker(scene, c);
      if (waiting.length > 0 && blocker !== null) {
        out.push(
          t('caption.wait', 'Waiting in line for {ahead}: {ids}', {
            ahead: scene.instrs[blocker]?.id ?? '',
            ids: ids(waiting),
          }),
        );
      }
      return out;
    }

    /** 장면의 화면 전체. skip 에 든 명령어의 칩만 빼고 그린다 (운동이 그린다). */
    function drawStatic(scene: ReadyFirstScene, skip: ReadonlySet<number> = new Set()): Element {
      svg.textContent = '';
      const n = scene.instrs.length;
      const L = layoutFor(n);
      const c = scene.cycle;
      const base = el(svg, 'g', {});

      label(base, PAD, HEAD_Y, t('label.window', 'Window'), { fill: C.textMuted, weight: '600' });
      label(base, L.x0, HEAD_Y, t('label.executing', 'Executing'), { fill: C.textMuted, weight: '600' });
      if (c >= 1) {
        label(base, PIECE_CANVAS_W - PAD, HEAD_Y, t('label.cycle', 'Cycle {n}', { n: c }), {
          size: fontSizes.sm,
          weight: '700',
          anchor: 'end',
        });
      }

      // 실행 길 — 지연만큼 칸을 나눈다
      for (let i = 0; i < n; i += 1) {
        const y = laneChipY(i);
        const left = L.x0;
        const right = L.x1 + L.chipW;
        el(base, 'rect', {
          x: left,
          y,
          width: right - left,
          height: CHIP_H,
          rx: 5,
          fill: C.bgSubtle,
          stroke: C.border,
        });
        const lat = Math.max(1, scene.instrs[i]?.lat ?? 1);
        for (let k = 1; k < lat; k += 1) {
          const x = L.x0 + L.chipW + (k / lat) * (L.x1 - L.x0);
          el(base, 'line', {
            x1: x,
            y1: y + 4,
            x2: x,
            y2: y + CHIP_H - 4,
            stroke: C.border,
            'stroke-dasharray': '3 3',
          });
        }
        const dep = scene.instrs[i]?.dep;
        const s = scene.start[i];
        const notStarted = s === null || s === undefined || s > c;
        if (c >= 1 && dep && notStarted) {
          label(base, L.x0 + 10, y + CHIP_H / 2 + 4, t('label.waits', 'waits for {reg}', { reg: dep.reg }), {
            fill: C.textMuted,
            mono: false,
          });
        }
      }

      // 줄 — 원래 순서로 자리가 정해져 있다. 머리는 문 쪽
      label(base, PAD, LINE_LABEL_Y, t('label.line', 'Line — program order'), {
        fill: C.textMuted,
        weight: '600',
      });
      label(base, L.retX0, LINE_LABEL_Y, t('label.committed', 'Committed'), {
        fill: C.textMuted,
        weight: '600',
      });
      for (let i = 0; i < n; i += 1) {
        const x = PAD + (n - 1 - i) * (L.chipW + SLOT_GAP);
        el(base, 'rect', {
          x,
          y: LINE_Y,
          width: L.chipW,
          height: CHIP_H,
          rx: 5,
          fill: 'none',
          stroke: C.ghostOutline,
          'stroke-dasharray': '4 3',
        });
        label(base, x + L.chipW / 2, LINE_Y + CHIP_H / 2 + 4, scene.instrs[i]?.id ?? '', {
          fill: C.ghostOutline,
          anchor: 'middle',
        });
      }
      el(base, 'line', {
        x1: L.gateX,
        y1: LINE_Y - 6,
        x2: L.gateX,
        y2: LINE_Y + CHIP_H + 6,
        stroke: C.text,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      });

      const lines = captionLines(scene);
      lines.forEach((line, k) => {
        label(base, PAD, CAPTION_Y + k * CAPTION_DY, line, { size: fontSizes.sm });
      });

      const chips = el(svg, 'g', {});
      for (let i = 0; i < n; i += 1) {
        if (skip.has(i)) continue;
        const place = placeAt(scene, L, i, c);
        drawChip(chips, scene, i, place.box, chipStyle(scene, i, place.zone, c));
      }
      return el(svg, 'g', {});
    }

    function lerpBox(a: Box, b: Box, p: number): Box {
      return {
        x: a.x + (b.x - a.x) * p,
        y: a.y + (b.y - a.y) * p,
        w: a.w + (b.w - a.w) * p,
        h: a.h + (b.h - a.h) * p,
      };
    }

    function along(path: Box[], p: number): Box {
      if (path.length === 1) return path[0]!;
      const lens: number[] = [];
      let total = 0;
      for (let k = 1; k < path.length; k += 1) {
        const d = Math.hypot(path[k]!.x - path[k - 1]!.x, path[k]!.y - path[k - 1]!.y) + 1;
        lens.push(d);
        total += d;
      }
      let at = p * total;
      for (let k = 0; k < lens.length; k += 1) {
        const len = lens[k]!;
        if (at <= len || k === lens.length - 1) {
          return lerpBox(path[k]!, path[k + 1]!, Math.min(1, at / len));
        }
        at -= len;
      }
      return path[path.length - 1]!;
    }

    function ease(p: number): number {
      return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    }

    async function render(
      next: ReadyFirstScene,
      _prev: ReadyFirstScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || !step || step.kind !== 'cycle') {
        drawStatic(next);
        return;
      }

      const L = layoutFor(next.instrs.length);
      const c = next.cycle;
      const moves: { i: number; path: Box[]; zone: Zone }[] = [];
      for (let i = 0; i < next.instrs.length; i += 1) {
        const from = placeAt(next, L, i, c - 1);
        const to = placeAt(next, L, i, c);
        if (from.zone === to.zone && from.box.x === to.box.x && from.box.y === to.box.y) continue;
        const path =
          to.zone === 'line' && from.zone !== 'line'
            ? [from.box, trackEnd(L, i), to.box]
            : [from.box, to.box];
        moves.push({ i, path, zone: to.zone });
      }
      if (moves.length === 0) {
        drawStatic(next);
        return;
      }

      const skip = new Set(moves.map((m) => m.i));
      const layer = drawStatic(next, skip);
      const frames = Math.max(1, Math.ceil(MOVE_MS / FRAME_MS));
      // 첫 프레임은 출발 자리에 — 끝 자리가 번쩍이지 않게
      for (let k = 0; k <= frames; k += 1) {
        if (mine !== gen || destroyed) return;
        const p = ease(k / frames);
        layer.textContent = '';
        for (const m of moves) {
          const box = along(m.path, p);
          drawChip(layer, next, m.i, box, chipStyle(next, m.i, m.zone, c));
        }
        if (k < frames) await sleep(FRAME_MS);
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const h of timers) clearTimeout(h);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
