/**
 * vector-normalize 무대.
 *
 * 왼쪽은 원점에서 뻗은 화살표 넷과 길이 1 의 원, 오른쪽은 같은 넷의 길이를 한 자에 눕힌 막대다.
 * 한 걸음에 화살표 하나가 제 줄을 따라 줄거나 늘어 원에 닿고, 그 막대도 같은 시계로 1 의 금에 닿는다.
 * 원래 자리는 점선 자취로 남아 방향이 그대로인 것을 그림이 보인다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { formatPair, formatRaw, formatValue } from './algorithm.js';
import type { VectorNormalizeScene } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 700;
const FRAME_MS = 16;
const EDGE = 16;
/** 평면이 차지하는 가로 몫 — 나머지는 길이의 자 */
const PLANE_SHARE = 0.53;
/** 평면 틀의 여백 (좌표 단위) — 이름 글자가 들어갈 자리 */
const PLANE_PAD = 0.55;
const CAPTION_BLOCK = 66;
const HEAD_PX = 9;
const LABEL_GAP = 14;
const ROW_TOP = 40;
const BAR_TEXT_ROOM = 40;
const RING_LABEL_DEG = -135;

type Handles = {
  shaft: SVGLineElement;
  head: SVGPolygonElement;
  label: SVGTextElement;
  bar: SVGLineElement;
  barText: SVGTextElement;
};

type Frame = {
  ox: number;
  oy: number;
  unit: number;
  barX0: number;
  barScale: number;
  rowH: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const vectorNormalizeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles: Handles[] = [];
    let frame: Frame | null = null;

    function palette(count: number): readonly string[] {
      return categorical(count, params.theme === 'dark' ? 'vivid' : 'deep');
    }

    function colorAt(list: readonly string[], i: number): string {
      const c = list[i];
      if (c === undefined) throw new Error(`vector-normalize-stage: ${i} 번째 색이 없다`);
      return c;
    }

    function makeFrame(scene: VectorNormalizeScene): Frame {
      const base = scene.base;
      if (base === null) throw new Error('vector-normalize-stage: 바탕 없이 틀을 셈할 수 없다');
      const { minX, maxX, minY, maxY } = base.bounds;
      const planeW = W * PLANE_SHARE - EDGE;
      const planeH = H - CAPTION_BLOCK - EDGE;
      const spanX = maxX - minX + 2 * PLANE_PAD;
      const spanY = maxY - minY + 2 * PLANE_PAD;
      const unit = Math.min(planeW / spanX, planeH / spanY);
      const usedW = spanX * unit;
      const usedH = spanY * unit;
      const left = EDGE + (planeW - usedW) / 2;
      const top = EDGE / 2 + (planeH - usedH) / 2;
      const ox = left + (PLANE_PAD - minX) * unit;
      const oy = top + (maxY + PLANE_PAD) * unit;
      const barX0 = W * PLANE_SHARE + EDGE;
      const barScale = (W - EDGE - BAR_TEXT_ROOM - barX0) / base.maxLength;
      const rowH = (H - CAPTION_BLOCK - ROW_TOP) / scene.vectors.length;
      return { ox, oy, unit, barX0, barScale, rowH };
    }

    /** 원래 줄의 방향 — 알고리즘이 init 에 실은 것을 쓴다 */
    function direction(scene: VectorNormalizeScene, i: number): { dx: number; dy: number } {
      const d = scene.base?.directions[i];
      if (d === undefined) throw new Error(`vector-normalize-stage: base.directions[${i}] 가 없다`);
      return { dx: d.x, dy: d.y };
    }

    /** 화살표를 머리 (x, y)(좌표 단위)에 세운다 — 머리 · 이름은 원래 줄의 방향 (dx, dy) 에 맞춘다 */
    function placeArrow(h: Handles, f: Frame, x: number, y: number, dx: number, dy: number): void {
      const px = (x * dx + y * dy) * f.unit;
      const hx = f.ox + x * f.unit;
      const hy = f.oy - y * f.unit;
      const head = Math.min(HEAD_PX, px * 0.45);
      const bx = f.ox + dx * (px - head);
      const by = f.oy - dy * (px - head);
      // 머리 밑변의 두 끝 — 방향에 수직
      const nx = -dy;
      const ny = -dx;
      const half = head * 0.55;
      h.shaft.setAttribute('x2', String(r2(bx)));
      h.shaft.setAttribute('y2', String(r2(by)));
      h.head.setAttribute(
        'points',
        `${r2(hx)},${r2(hy)} ${r2(bx + nx * half)},${r2(by + ny * half)} ${r2(bx - nx * half)},${r2(by - ny * half)}`,
      );
      h.label.setAttribute('x', String(r2(hx + dx * LABEL_GAP)));
      h.label.setAttribute('y', String(r2(hy - dy * LABEL_GAP)));
    }

    function placeBar(h: Handles, f: Frame, len: number): void {
      const x2 = f.barX0 + len * f.barScale;
      h.bar.setAttribute('x2', String(r2(x2)));
      // 1 보다 짧은 막대의 수는 1 의 금 너머에 둔다 — 금과 겹치지 않게
      h.barText.setAttribute('x', String(r2(Math.max(x2, f.barX0 + f.barScale) + 6)));
    }

    function drawStatic(scene: VectorNormalizeScene): void {
      svg.textContent = '';
      handles = [];
      frame = null;
      const base = scene.base;
      if (base === null) return;
      const f = makeFrame(scene);
      frame = f;
      const hues = palette(scene.vectors.length);
      const { minX, maxX, minY, maxY } = base.bounds;

      // 평면 — 축 두 줄과 길이 1 의 원
      const plane = el(svg, 'g', {});
      el(plane, 'line', {
        x1: r2(f.ox + (minX - PLANE_PAD / 2) * f.unit), y1: r2(f.oy),
        x2: r2(f.ox + (maxX + PLANE_PAD / 2) * f.unit), y2: r2(f.oy),
        stroke: colors.border, 'stroke-width': 1,
      });
      el(plane, 'line', {
        x1: r2(f.ox), y1: r2(f.oy - (maxY + PLANE_PAD / 2) * f.unit),
        x2: r2(f.ox), y2: r2(f.oy - (minY - PLANE_PAD / 2) * f.unit),
        stroke: colors.border, 'stroke-width': 1,
      });
      el(plane, 'circle', {
        cx: r2(f.ox), cy: r2(f.oy), r: r2(f.unit),
        fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.25, 'stroke-dasharray': '4 4',
      });
      const ringRad = (RING_LABEL_DEG * Math.PI) / 180;
      const ringLabel = el(plane, 'text', {
        x: r2(f.ox + Math.cos(ringRad) * (f.unit + 10)),
        y: r2(f.oy - Math.sin(ringRad) * (f.unit + 10)),
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted,
      });
      ringLabel.textContent = '1';

      // 길이의 자 — 머리말과 1 의 금
      const ruler = el(svg, 'g', {});
      const lengthHead = el(ruler, 'text', {
        x: r2(f.barX0), y: 22, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted,
      });
      lengthHead.textContent = t('label.length', 'Length');
      const angleHead = el(ruler, 'text', {
        x: W - EDGE, y: 22, 'text-anchor': 'end',
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted,
      });
      angleHead.textContent = t('label.angle', 'Angle');
      const oneX = r2(f.barX0 + f.barScale);
      const rowsBottom = ROW_TOP + f.rowH * scene.vectors.length;
      const oneLabel = el(ruler, 'text', {
        x: oneX, y: r2(rowsBottom + 8), 'text-anchor': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted,
      });
      oneLabel.textContent = '1';

      // 원래 자리의 자취 — 나눈 벡터만
      const ghosts = el(svg, 'g', {});
      const arrows = el(svg, 'g', {});
      const current = scene.step === null ? -1 : scene.step.index;

      scene.vectors.forEach((v, i) => {
        const hue = colorAt(hues, i);
        const unit = scene.units[i];
        if (unit === undefined) throw new Error(`vector-normalize-stage: units[${i}] 가 없다`);
        const length0 = base.lengths[i];
        const angle0 = base.angles[i];
        if (length0 === undefined || angle0 === undefined) {
          throw new Error(`vector-normalize-stage: base 의 ${i} 번째 값이 없다`);
        }
        const { dx, dy } = direction(scene, i);

        if (unit !== null) {
          const gx = f.ox + v.x * f.unit;
          const gy = f.oy - v.y * f.unit;
          el(ghosts, 'line', {
            x1: r2(f.ox), y1: r2(f.oy), x2: r2(gx), y2: r2(gy),
            stroke: hue, 'stroke-width': 1.25, 'stroke-dasharray': '2 4', opacity: 0.6,
          });
          el(ghosts, 'circle', {
            cx: r2(gx), cy: r2(gy), r: 3.5, fill: colors.bg, stroke: hue, 'stroke-width': 1.25,
          });
        }

        const g = el(arrows, 'g', {});
        const shaft = el(g, 'line', {
          x1: r2(f.ox), y1: r2(f.oy), x2: r2(f.ox), y2: r2(f.oy),
          stroke: hue, 'stroke-width': 2.5,
        });
        const head = el(g, 'polygon', { points: '', fill: hue });
        const label = el(g, 'text', {
          x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'font-family': fonts.body, 'font-size': fontSizes.md, 'font-style': 'italic',
          'font-weight': 700, fill: hue,
        });
        label.textContent = v.name;

        // 자의 한 줄
        const rowTop = ROW_TOP + i * f.rowH;
        if (i === current) {
          el(ruler, 'rect', {
            x: r2(f.barX0 - 8), y: r2(rowTop - 4), width: r2(W - EDGE - f.barX0 + 12), height: r2(f.rowH - 8),
            rx: 4, fill: colors.bgSubtle, stroke: colors.accent, 'stroke-width': 1.5,
          });
        }
        const nameY = r2(rowTop + smPx + 2);
        const name = el(ruler, 'text', {
          x: r2(f.barX0), y: nameY, 'font-family': fonts.body, 'font-size': fontSizes.md,
          'font-style': 'italic', 'font-weight': 700, fill: hue,
        });
        name.textContent = v.name;
        const coords = el(ruler, 'text', {
          x: r2(f.barX0 + 18), y: nameY, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text,
        });
        coords.textContent = unit === null
          ? formatPair(formatRaw(v.x), formatRaw(v.y))
          : formatPair(formatValue(unit.x, 2), formatValue(unit.y, 2));
        const angle = el(ruler, 'text', {
          x: W - EDGE, y: nameY, 'text-anchor': 'end',
          'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text,
        });
        angle.textContent = `${formatValue(unit === null ? angle0 : unit.angleAfter, 1)}°`;

        const barY = r2(rowTop + f.rowH * 0.55);
        // 1 의 금 — 막대 높이에만 긋는다 (좌표 글자를 가로지르지 않게)
        el(ruler, 'line', {
          x1: oneX, y1: r2(barY - 9), x2: oneX, y2: r2(barY + 9),
          stroke: colors.textMuted, 'stroke-width': 1.25, 'stroke-dasharray': '3 2',
        });
        const bar = el(ruler, 'line', {
          x1: r2(f.barX0), y1: barY, x2: r2(f.barX0), y2: barY, stroke: hue, 'stroke-width': 6,
        });
        const barText = el(ruler, 'text', {
          x: 0, y: barY, 'dominant-baseline': 'middle',
          'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text,
        });
        const len = unit === null ? length0 : unit.length;
        barText.textContent = formatValue(len, 2);

        const h: Handles = { shaft, head, label, bar, barText };
        if (unit === null) placeArrow(h, f, v.x, v.y, dx, dy);
        else placeArrow(h, f, unit.x, unit.y, dx, dy);
        placeBar(h, f, len);
        handles.push(h);
      });

      drawCaption(scene);
    }

    function drawCaption(scene: VectorNormalizeScene): void {
      const base = scene.base;
      if (base === null) return;
      const lines: { text: string; size: string; ink: string }[] = [];
      const step = scene.step;
      if (step === null) {
        lines.push({ text: t('caption.start', 'Divide each arrow by its own length.'), size: fontSizes.md, ink: colors.text });
      } else {
        const v = scene.vectors[step.index];
        const unit = scene.units[step.index];
        if (v === undefined || unit === undefined || unit === null) {
          throw new Error(`vector-normalize-stage: 걸음 ${step.index} 의 벡터가 장면에 없다`);
        }
        lines.push({
          text: t('caption.divide', '{name} ÷ {length} → {coords}', {
            name: v.name,
            length: formatValue(unit.divisor, 2),
            coords: formatPair(formatValue(unit.x, 2), formatValue(unit.y, 2)),
          }),
          size: fontSizes.md,
          ink: colors.text,
        });
        const vars = {
          length: formatValue(unit.length, 2),
          before: `${formatValue(unit.angleBefore, 1)}°`,
          after: `${formatValue(unit.angleAfter, 1)}°`,
          factor: formatValue(unit.factor, 2),
        };
        let text: string;
        if (unit.factor < 1) {
          text = t('caption.shrinks', 'Length: {length} · Angle: {before} → {after} · Shrinks: ×{factor}', vars);
        } else if (unit.factor > 1) {
          text = t('caption.grows', 'Length: {length} · Angle: {before} → {after} · Grows: ×{factor}', vars);
        } else {
          text = t('caption.stays', 'Length: {length} · Angle: {before} → {after} · Stays: ×{factor}', vars);
        }
        lines.push({ text, size: fontSizes.sm, ink: colors.text });
      }
      if (scene.units.every((u) => u !== null)) {
        const lengths: string[] = [];
        const angles: string[] = [];
        for (const u of scene.units) {
          if (u === null) throw new Error('vector-normalize-stage: 다 나눈 줄 알았는데 빈 칸이 있다');
          lengths.push(formatValue(u.length, 2));
          angles.push(`${formatValue(u.angleAfter, 1)}°`);
        }
        lines.push({
          text: t('caption.all', 'Lengths: {lengths}  ·  Angles: {angles}', {
            lengths: lengths.join(' · '),
            angles: angles.join(' · '),
          }),
          size: fontSizes.sm,
          ink: colors.textMuted,
        });
      }
      const top = H - CAPTION_BLOCK + 14;
      lines.forEach((line, k) => {
        const node = el(svg, 'text', {
          x: EDGE, y: r2(top + k * 20), 'font-family': fonts.body, 'font-size': line.size, fill: line.ink,
        });
        node.textContent = line.text;
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function move(scene: VectorNormalizeScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) throw new Error('vector-normalize-stage: 움직일 걸음이 없다');
      const h = handles[step.index];
      const f = frame;
      if (h === undefined || f === null) {
        throw new Error(`vector-normalize-stage: 걸음 ${step.index} 의 손잡이가 없다`);
      }
      const { dx, dy } = direction(scene, step.index);
      const v = scene.vectors[step.index];
      const unit = scene.units[step.index];
      if (v === undefined || unit === undefined || unit === null) {
        throw new Error(`vector-normalize-stage: 걸음 ${step.index} 의 벡터가 장면에 없다`);
      }
      const frames = Math.ceil(MOTION_MS / FRAME_MS);
      // 정적 그리기가 끝 자리에 세운 것을 아직 못 온 만큼 되돌려 놓고 흘린다
      h.barText.textContent = formatValue(step.from, 2);
      for (let k = 0; k <= frames; k += 1) {
        if (destroyed || mine !== gen) return;
        const e = ease(k / frames);
        // 머리는 원래 머리에서 단위 벡터의 머리로 곧게 간다 — 한 줄 위라 방향을 다시 셈하지 않는다
        placeArrow(h, f, v.x + (unit.x - v.x) * e, v.y + (unit.y - v.y) * e, dx, dy);
        placeBar(h, f, step.from + (step.to - step.from) * e);
        if (k < frames) await wait(FRAME_MS);
      }
    }

    return {
      async render(next: VectorNormalizeScene, prev: VectorNormalizeScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step === null) return;
        // 이번 걸음에 새로 나뉜 벡터일 때만 흘린다
        const justDivided = prev === null || prev.units[next.step.index] === null;
        if (!justDivided) return;
        await move(next, mine);
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
  },
};
