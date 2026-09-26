/**
 * pin-what-was-chosen 의 stage.
 *
 * 위는 공개된 버전의 선반(꾸러미마다 한 줄), 아래는 왼쪽에서 오른쪽으로 흐르는 세 칸 —
 * 첫 설치 · 잠금 파일 · 둘째 설치. 동사는 "적히고 먼저 읽힌다":
 *   고름     선반의 버전이 첫 설치 칸으로 내려온다
 *   적음     첫 설치의 줄이 오른쪽 잠금 파일로 옮겨 적힌다
 *   나옴     새 버전이 선반에 끼어들고 옆 버전이 밀려난다
 *   읽음     잠금 파일의 줄이 둘째 설치 칸으로 건너간다 — 선반의 새 버전은 그 자리에 남는다
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { PinScene, Pinned } from './scene.js';

const H = 304;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 16;
const CAPTION_Y = 22;
const SUMMARY_Y = 42;
const SHELF_TITLE_Y = 70;
const SHELF_TOP = 80;
const ROW_PITCH = 46;
const CHIP_H = 26;
const CHIP_W_MAX = 92;
const PANEL_GAP = 34;
const PANEL_HEAD = 24;
const PANEL_ROW = 34;
const MOTION_MS = 440;
const FRAME_MS = 16;

type Handle = { g: SVGGElement; x: number; y: number };

function num(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, body: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el(parent, 'text', { x, y, ...attrs });
  node.textContent = body;
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 자리 셈 — 장면의 바탕(요구 수 · 칸 수 · 이름 길이)에서만 나온다. */
function layoutOf(scene: PinScene) {
  const monoW = parseFloat(fontSizes.sm) * 0.6;
  const nameW = Math.max(...scene.wants.map((w) => w.name.length), 1) * monoW;
  const rangeW = Math.max(...scene.wants.map((w) => w.range.length), 1) * monoW;
  const rangeX = MARGIN + nameW + 10;
  const chipsX = rangeX + rangeW + 18;
  const slotW = (W - MARGIN - chipsX) / Math.max(scene.capacity, 1);
  const chipW = Math.min(slotW - 8, CHIP_W_MAX);
  const rows = scene.wants.length;
  const panelTop = SHELF_TOP + rows * ROW_PITCH + 10;
  const panelW = (W - 2 * MARGIN - 2 * PANEL_GAP) / 3;
  const panelH = PANEL_HEAD + rows * PANEL_ROW + 6;
  return { rangeX, chipsX, slotW, chipW, panelTop, panelW, panelH, monoW };
}

type Layout = ReturnType<typeof layoutOf>;

function rowY(i: number): number {
  return SHELF_TOP + i * ROW_PITCH;
}

function shelfChipX(lay: Layout, slot: number): number {
  return lay.chipsX + slot * lay.slotW + (lay.slotW - lay.chipW) / 2;
}

function panelX(lay: Layout, col: number): number {
  return MARGIN + col * (lay.panelW + PANEL_GAP);
}

function panelRowY(lay: Layout, i: number): number {
  return lay.panelTop + PANEL_HEAD + i * PANEL_ROW;
}

function find(list: readonly Pinned[] | null, name: string): Pinned | undefined {
  return list ? list.find((p) => p.name === name) : undefined;
}

export const pinWhatWasChosenStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** 한 줄짜리 버전 알 — 이름(흐린 글자)과 버전. 이름을 빼면 선반의 알이다. */
    function chip(
      parent: Element,
      x: number,
      y: number,
      w: number,
      entry: { name: string | null; version: string },
      look: { fill: string; ink: string; stroke: string; width: number; dash?: boolean },
    ): SVGGElement {
      const g = el(parent, 'g', { transform: `translate(${num(x)},${num(y)})` });
      const box: Record<string, string | number> = {
        x: 0,
        y: 0,
        width: w,
        height: CHIP_H,
        rx: 5,
        fill: look.fill,
        stroke: look.stroke,
        'stroke-width': look.width,
      };
      if (look.dash) box['stroke-dasharray'] = '4 3';
      el(g, 'rect', box);
      const mid = CHIP_H / 2 + 4;
      if (entry.name === null) {
        label(g, w / 2, mid, entry.version, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: look.ink,
        });
      } else {
        label(g, 10, mid, entry.name, {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: look.ink,
          'fill-opacity': 0.72,
        });
        label(g, w - 10, mid, entry.version, {
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: look.ink,
        });
      }
      return g;
    }

    function arrow(x1: number, x2: number, y: number): void {
      el(svg, 'line', { x1, y1: y, x2: x2 - 6, y2: y, stroke: c.textMuted, 'stroke-width': 1.5 });
      el(svg, 'path', { d: `M${num(x2)},${num(y)} L${num(x2 - 8)},${num(y - 5)} L${num(x2 - 8)},${num(y + 5)} Z`, fill: c.textMuted });
    }

    function drawStatic(scene: PinScene): Map<string, Handle> {
      svg.textContent = '';
      const handles = new Map<string, Handle>();
      const lay = layoutOf(scene);
      const step = scene.step;
      const plain = { fill: c.bgSubtle, ink: c.text, stroke: c.border, width: 1 };
      const lit = { fill: c.accent, ink: c.stateInk, stroke: c.accent, width: 1 };

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (step.kind === 'start') {
        caption = t('caption.start', 'No lockfile yet. Requirements are ranges.');
      } else if (step.kind === 'pick') {
        caption = t('caption.pick', 'First install — {name} {range}: highest in range, {version}.', {
          name: step.name,
          range: step.range,
          version: step.version,
        });
      } else if (step.kind === 'write') {
        caption = t('caption.write', 'Written to the lockfile — lines: {n}.', { n: step.count });
      } else if (step.kind === 'release') {
        caption = t('caption.release', 'New versions published: {n} · inside the range: {inRange}.', {
          n: step.count,
          inRange: step.inRange,
        });
      } else {
        caption = t('caption.read', 'Second install — {name}: read from the lockfile first, {version}.', {
          name: step.name,
          version: step.version,
        });
      }
      label(svg, MARGIN, CAPTION_Y, caption, {
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      if (scene.second.length > 0 && scene.second.length === scene.wants.length) {
        const same = scene.second.filter((s) => find(scene.first, s.name)?.version === s.version).length;
        const left = scene.fresh.filter((f) => {
          const got = find(scene.second, f.name);
          return f.inRange && got !== undefined && got.version !== f.version;
        }).length;
        label(
          svg,
          MARGIN,
          SUMMARY_Y,
          t('caption.summary', 'Same as first install: {same}/{total} · new in range, not picked: {left}.', {
            same,
            total: scene.wants.length,
            left,
          }),
          { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
        );
      }

      // 선반 — 공개된 버전
      label(svg, MARGIN, SHELF_TITLE_Y, t('label.published', 'Published'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      scene.wants.forEach((want, i) => {
        const y = rowY(i);
        label(svg, MARGIN, y + CHIP_H / 2 + 4, want.name, {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        label(svg, lay.rangeX, y + CHIP_H / 2 + 4, want.range, {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: c.primary,
        });
        const shelf = scene.published.find((s) => s.name === want.name);
        if (!shelf) throw new Error(`pin-what-was-chosen stage: ${want.name} 의 선반이 없다`);
        const picked = find(scene.first, want.name);
        const got = find(scene.second, want.name);
        shelf.versions.forEach((version, slot) => {
          const x = shelfChipX(lay, slot);
          const fresh = scene.fresh.find((f) => f.name === want.name && f.version === version);
          const pickNow = step.kind === 'pick' && step.name === want.name && step.version === version;
          const freshNow = step.kind === 'release' && fresh !== undefined;
          let look = plain;
          if (pickNow || freshNow) look = lit;
          else if (picked && picked.version === version) look = { ...plain, stroke: c.primary, width: 2 };
          else if (fresh) look = { ...plain, stroke: c.textMuted, width: 1.2 };
          const g = chip(svg, x, y, lay.chipW, { name: null, version }, { ...look, dash: fresh !== undefined });
          handles.set(`shelf:${want.name}:${version}`, { g, x, y });
          if (fresh && fresh.inRange) {
            const passed = got !== undefined && got.version !== version;
            const last = slot === shelf.versions.length - 1;
            label(
              g,
              last ? lay.chipW : lay.chipW / 2,
              CHIP_H + 13,
              passed ? t('label.notPicked', 'in range, not picked') : t('label.inRange', 'in range'),
              {
                'text-anchor': last ? 'end' : 'middle',
                'font-family': fonts.body,
                'font-size': fontSizes.xs,
                fill: passed ? c.text : c.textMuted,
              },
            );
          }
        });
      });

      // 아래 세 칸 — 첫 설치 · 잠금 파일 · 둘째 설치
      const titles = [
        t('label.firstInstall', 'First install'),
        t('label.lockfile', 'Lockfile'),
        t('label.secondInstall', 'Second install'),
      ];
      const inner = lay.panelW - 20;
      for (let col = 0; col < 3; col += 1) {
        const x = panelX(lay, col);
        const empty = col === 1 && scene.lock === null;
        const frame: Record<string, string | number> = {
          x,
          y: lay.panelTop,
          width: lay.panelW,
          height: lay.panelH,
          rx: 6,
          fill: col === 1 && !empty ? c.bg : 'none',
          stroke: col === 1 ? c.text : c.border,
          'stroke-width': col === 1 ? 1.5 : 1,
        };
        if (empty) {
          frame['stroke-dasharray'] = '5 4';
          frame['stroke'] = c.border;
        }
        el(svg, 'rect', frame);
        label(svg, x + 10, lay.panelTop + 16, titles[col]!, {
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': col === 1 ? 600 : 400,
          fill: col === 1 ? c.text : c.textMuted,
        });
        if (empty) {
          label(svg, x + lay.panelW / 2, lay.panelTop + PANEL_HEAD + (lay.panelH - PANEL_HEAD) / 2 + 2, t('label.none', 'none yet'), {
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          });
        }
      }
      const arrowY = lay.panelTop + PANEL_HEAD + (lay.panelH - PANEL_HEAD) / 2 - 3;
      if (scene.lock !== null) arrow(panelX(lay, 0) + lay.panelW + 6, panelX(lay, 1) - 6, arrowY);
      if (scene.second.length > 0) arrow(panelX(lay, 1) + lay.panelW + 6, panelX(lay, 2) - 6, arrowY);

      scene.wants.forEach((want, i) => {
        const y = panelRowY(lay, i);
        const first = find(scene.first, want.name);
        if (first) {
          const x = panelX(lay, 0) + 10;
          const now = step.kind === 'pick' && step.name === want.name;
          handles.set(`first:${want.name}`, { g: chip(svg, x, y, inner, first, now ? lit : plain), x, y });
        }
        const line = find(scene.lock, want.name);
        if (line) {
          const x = panelX(lay, 1) + 10;
          const now = step.kind === 'write' || (step.kind === 'read' && step.name === want.name);
          const look = now ? lit : { fill: c.bg, ink: c.text, stroke: c.bg, width: 0 };
          handles.set(`lock:${want.name}`, { g: chip(svg, x, y, inner, line, look), x, y });
        }
        const second = find(scene.second, want.name);
        if (second) {
          const x = panelX(lay, 2) + 10;
          const now = step.kind === 'read' && step.name === want.name;
          handles.set(`second:${want.name}`, { g: chip(svg, x, y, inner, second, now ? lit : plain), x, y });
        }
      });
      return handles;
    }

    /** 이번 걸음에 움직일 것 — 끝 자리(정적 그리기)에서 아직 못 온 만큼. */
    function motionFor(scene: PinScene, handles: Map<string, Handle>): { h: Handle; dx: number; dy: number }[] {
      const step = scene.step;
      const out: { h: Handle; dx: number; dy: number }[] = [];
      const from = (target: string, source: string): void => {
        const h = handles.get(target);
        const s = handles.get(source);
        if (h && s) out.push({ h, dx: s.x - h.x, dy: s.y - h.y });
      };
      if (step.kind === 'pick') {
        from(`first:${step.name}`, `shelf:${step.name}:${step.version}`);
      } else if (step.kind === 'write') {
        for (const w of scene.wants) from(`lock:${w.name}`, `first:${w.name}`);
      } else if (step.kind === 'release') {
        const lay = layoutOf(scene);
        for (const shelf of scene.published) {
          const freshHere = new Set(scene.fresh.filter((f) => f.name === shelf.name).map((f) => f.version));
          const before = shelf.versions.filter((v) => !freshHere.has(v));
          shelf.versions.forEach((version, slot) => {
            const h = handles.get(`shelf:${shelf.name}:${version}`);
            if (!h) return;
            if (freshHere.has(version)) out.push({ h, dx: 0, dy: -ROW_PITCH / 2 });
            else {
              const was = before.indexOf(version);
              if (was !== slot) out.push({ h, dx: (was - slot) * lay.slotW, dy: 0 });
            }
          });
        }
      } else if (step.kind === 'read') {
        from(`second:${step.name}`, `lock:${step.name}`);
      }
      return out;
    }

    function tween(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const total = Math.max(1, Math.round(MOTION_MS / FRAME_MS));
        let i = 0;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          i += 1;
          frame(ease(i / total));
          if (i >= total) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    const renderer: SceneRenderer<PinScene> & ViewInstance = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || prev === null) return;
        const moves = motionFor(next, handles);
        if (moves.length === 0) return;
        await tween(mine, (p) => {
          if (destroyed || mine !== gen) return;
          const rest = 1 - p;
          for (const m of moves) {
            m.h.g.setAttribute('transform', `translate(${num(m.h.x + m.dx * rest)},${num(m.h.y + m.dy * rest)})`);
          }
        });
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
