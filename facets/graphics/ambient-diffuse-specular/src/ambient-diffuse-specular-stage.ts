/**
 * 그림 — 왼쪽은 한 점의 단면(면 · 법선 · 빛 · 눈 · 반사 방향), 오른쪽은 그 점의 색을 이루는
 * 세 채널 기둥이다. 몫 하나가 얹힐 때 그 몫의 조각 셋이 **그 몫이 따르는 자리에서 날아와**
 * 채널 기둥 위에 쌓이고, 점의 색이 그만큼 밝아진다.
 *   바탕빛  — 점 자리에서 (방향이 없다)
 *   퍼진빛  — 빛 L 끝에서
 *   번쩍임  — 반사 방향 R 끝에서
 * 반사 방향을 찾는 걸음은 R 이 빛 쪽에서 법선을 건너 거울 자리로 돈다.
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
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { dirOf, type PartId, type Rgb, type Vec3 } from './algorithm.js';
import type { AdsScene } from './scene.js';

const H = 360;
const SVG = 'http://www.w3.org/2000/svg';
const PART_ORDER: readonly PartId[] = ['ambient', 'diffuse', 'specular'];
const MOVE_MS = 700;

type Attrs = Record<string, string | number>;

function put(parent: Element, tag: string, attrs: Attrs, content?: string): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (content !== undefined) e.textContent = content;
  parent.appendChild(e);
  return e;
}

/** 좌표 · 글자용 반올림 (-0 을 0 으로) */
function r2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return v === 0 ? 0 : v;
}

function fmt3(x: number): string {
  const s = x.toFixed(3);
  return s === '-0.000' ? '0.000' : s;
}

/** 감마 없는 선형 값을 그대로 화면 채널로 — 점의 색은 자료에서 셈한 값이지 디자인 색이 아니다. */
function linearFill(c: Rgb): string {
  const ch = c.map((x) => {
    if (x < 0 || x > 1) throw new Error(`점의 색 채널이 0..1 밖이다 (${x})`);
    return Math.round(x * 255);
  });
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}

function degOf(v: Vec3): number {
  return (Math.atan2(v[0], v[1]) * 180) / Math.PI;
}

export const ambientDiffuseSpecularStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const partColor = categorical(3);
    const W = PIECE_CANVAS_W;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    // ── 자리: 캔버스에서 역산한다
    const geoW = W * 0.5;
    const P = { x: r2(geoW * 0.52), y: r2(H - 80) };
    const ARM = Math.min(170, P.y - 110);
    const colLeft = geoW + 30;
    const colRight = W - 30;
    const slot = (colRight - colLeft) / 3;
    const colW = Math.min(48, slot * 0.55);
    const colTop = 80;
    const colBottom = P.y;
    const colH = colBottom - colTop;
    const colX = (ch: number): number => r2(colLeft + slot * ch + (slot - colW) / 2);

    const partName = (p: PartId): string => {
      switch (p) {
        case 'ambient':
          return t('label.ambient', 'ambient');
        case 'diffuse':
          return t('label.diffuse', 'diffuse');
        case 'specular':
          return t('label.specular', 'specular');
      }
    };
    const channelName = (ch: number): string => {
      if (ch === 0) return t('label.red', 'red');
      if (ch === 1) return t('label.green', 'green');
      if (ch === 2) return t('label.blue', 'blue');
      throw new Error(`모르는 채널 ${ch}`);
    };
    const partIndex = (p: PartId): number => PART_ORDER.indexOf(p);

    const tip = (deg: number, len: number): { x: number; y: number } => {
      const d = dirOf(deg);
      return { x: r2(P.x + len * d[0]), y: r2(P.y - len * d[1]) };
    };

    function arrow(parent: Element, deg: number, stroke: string, width: number, label: string, dashed = false): void {
      const end = tip(deg, ARM);
      const line: Attrs = { x1: P.x, y1: P.y, x2: end.x, y2: end.y, stroke, 'stroke-width': width, 'stroke-linecap': 'round' };
      if (dashed) line['stroke-dasharray'] = '5 5';
      put(parent, 'line', line);
      const back = tip(deg, ARM - 12);
      const side = dirOf(deg + 90);
      const a = { x: r2(back.x + side[0] * 6), y: r2(back.y - side[1] * 6) };
      const b = { x: r2(back.x - side[0] * 6), y: r2(back.y + side[1] * 6) };
      put(parent, 'polygon', { points: `${end.x},${end.y} ${a.x},${a.y} ${b.x},${b.y}`, fill: stroke });
      const lp = tip(deg, ARM + 18);
      put(
        parent,
        'text',
        {
          x: lp.x,
          y: r2(lp.y + 4),
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.text,
        },
        label,
      );
    }

    /** 법선에서 잰 두 각 사이의 호 */
    function arc(parent: Element, fromDeg: number, toDeg: number, radius: number, stroke: string): void {
      const a = tip(fromDeg, radius);
      const b = tip(toDeg, radius);
      const sweep = toDeg > fromDeg ? 1 : 0;
      put(parent, 'path', {
        d: `M ${a.x} ${a.y} A ${radius} ${radius} 0 0 ${sweep} ${b.x} ${b.y}`,
        fill: 'none',
        stroke,
        'stroke-width': 2,
      });
    }

    type Handles = { flying: { g: SVGElement; cx: number; cy: number }[]; point: SVGElement | null; reflectLayer: SVGElement | null; rvArc: SVGElement | null };

    function captionFor(s: AdsScene): string {
      const st = s.step;
      switch (st.kind) {
        case 'start':
          return t('caption.start', 'A black point: no part added yet.');
        case 'reflect':
          return t('caption.reflect', 'Reflection R found. R·V: {rv}', { rv: fmt3(st.rv) });
        case 'add': {
          if (st.part === 'ambient') return t('caption.ambient', 'Ambient added.');
          if (st.factor === null) throw new Error(`${st.part}: 따르는 값이 없다`);
          if (st.part === 'diffuse') return t('caption.diffuse', 'Diffuse added. N·L: {nl}', { nl: fmt3(st.factor) });
          return t('caption.specular', 'Specular added. (R·V)^{n}: {p}', {
            n: s.base.shininess,
            p: fmt3(st.factor),
          });
        }
      }
    }

    function drawStatic(s: AdsScene): Handles {
      svg.textContent = '';
      const h: Handles = { flying: [], point: null, reflectLayer: null, rvArc: null };
      const st = s.step;
      const nDeg = degOf(s.base.normal);

      // 캡션
      put(
        svg,
        'text',
        { x: 20, y: 30, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text },
        captionFor(s),
      );

      // ── 단면
      const geo = put(svg, 'g', {});
      put(geo, 'rect', { x: 24, y: P.y, width: r2(geoW - 48), height: 14, fill: colors.bgSubtle });
      put(geo, 'line', { x1: 24, y1: P.y, x2: r2(geoW - 24), y2: P.y, stroke: colors.border, 'stroke-width': 2 });

      const diffuseNow = st.kind === 'add' && st.part === 'diffuse';
      if (diffuseNow) arc(geo, s.base.lightDeg, nDeg, 46, colors.accent);
      arrow(geo, nDeg, colors.textMuted, 2, t('label.normal', 'normal N'), true);
      arrow(geo, s.base.lightDeg, colors.accent, diffuseNow ? 5 : 3, t('label.light', 'light L'));
      arrow(geo, s.base.eyeDeg, colors.primary, 3, t('label.eye', 'eye V'));
      const lightTip = tip(s.base.lightDeg, ARM);
      put(geo, 'circle', { cx: lightTip.x, cy: lightTip.y, r: 9, fill: colors.accent, stroke: colors.border });

      if (s.reflect !== null) {
        const specNow = (st.kind === 'add' && st.part === 'specular') || st.kind === 'reflect';
        const layer = put(geo, 'g', {});
        arrow(layer, degOf(s.reflect.dir), colors.itemComparing, specNow ? 5 : 3, t('label.reflect', 'reflection R'));
        h.reflectLayer = layer;
        const rvLayer = put(geo, 'g', {});
        arc(rvLayer, s.base.eyeDeg, degOf(s.reflect.dir), r2(ARM * 0.7), colors.itemComparing);
        h.rvArc = rvLayer;
      }

      if (s.sum !== null) {
        h.point = put(geo, 'circle', {
          cx: P.x,
          cy: P.y,
          r: 22,
          fill: linearFill(s.sum),
          stroke: colors.text,
          'stroke-width': 1.5,
        });
      } else {
        put(geo, 'circle', { cx: P.x, cy: P.y, r: 22, fill: 'none', stroke: colors.textMuted, 'stroke-dasharray': '3 3' });
      }

      // ── 채널 기둥
      const cols = put(svg, 'g', {});
      for (let ch = 0; ch < 3; ch += 1) {
        const x = colX(ch);
        put(cols, 'rect', { x, y: colTop, width: colW, height: colH, fill: 'none', stroke: colors.border, 'stroke-dasharray': '4 4' });
        put(
          cols,
          'text',
          {
            x: r2(x + colW / 2),
            y: colBottom + 18,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          },
          channelName(ch),
        );
        if (s.sum !== null) {
          put(
            cols,
            'text',
            {
              x: r2(x + colW / 2),
              y: colTop - 10,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              fill: colors.text,
            },
            fmt3(s.sum[ch]!),
          );
        }
        let base = 0;
        for (const part of s.parts) {
          const v = part.amount[ch]!;
          const y = r2(colBottom - (base + v) * colH);
          const hgt = r2(v * colH);
          const g = put(cols, 'g', {});
          put(g, 'rect', {
            x,
            y,
            width: colW,
            height: Math.max(hgt, 0.5),
            fill: partColor[partIndex(part.part)]!,
            stroke: colors.bg,
            'stroke-width': 1,
          });
          if (st.kind === 'add' && st.part === part.part) h.flying.push({ g, cx: r2(x + colW / 2), cy: r2(y + hgt / 2) });
          base += v;
        }
      }

      // ── 얹힌 몫의 이름
      const legendY = H - 22;
      const legendSlot = W / 3;
      s.parts.forEach((part, i) => {
        const x = r2(24 + legendSlot * i);
        put(svg, 'rect', { x, y: legendY - 11, width: 14, height: 14, fill: partColor[partIndex(part.part)]! });
        put(
          svg,
          'text',
          { x: x + 22, y: legendY, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
          partName(part.part),
        );
      });

      return h;
    }

    function tween(mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const k = Math.min(1, (Date.now() - start) / MOVE_MS);
          frame(ease(k));
          if (k >= 1) {
            wake();
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

    async function render(next: AdsScene, prev: AdsScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      const h = drawStatic(next);
      if (!opts.animate || prev === null || destroyed) return;
      const st = next.step;

      if (st.kind === 'add') {
        if (h.flying.length !== 3) throw new Error(`${st.part}: 얹힌 조각이 셋이 아니다 (${h.flying.length})`);
        if (h.point === null || next.sum === null) throw new Error('점의 색이 없다');
        let src: { x: number; y: number };
        if (st.part === 'ambient') src = P;
        else if (st.part === 'diffuse') src = tip(next.base.lightDeg, ARM);
        else {
          if (next.reflect === null) throw new Error('번쩍임인데 반사 방향이 없다');
          src = tip(degOf(next.reflect.dir), ARM);
        }
        const targets = h.flying;
        const point = h.point;
        const before = st.before;
        const after = next.sum;
        await tween(mine, (k) => {
          for (const tg of targets) {
            const dx = r2((src.x - tg.cx) * (1 - k));
            const dy = r2((src.y - tg.cy) * (1 - k));
            const sc = r2(0.25 + 0.75 * k);
            tg.g.setAttribute(
              'transform',
              `translate(${r2(tg.cx + dx)} ${r2(tg.cy + dy)}) scale(${sc}) translate(${r2(-tg.cx)} ${r2(-tg.cy)})`,
            );
          }
          point.setAttribute('fill', linearFill([
            before[0] + (after[0] - before[0]) * k,
            before[1] + (after[1] - before[1]) * k,
            before[2] + (after[2] - before[2]) * k,
          ]));
        });
      } else if (st.kind === 'reflect') {
        const layer = h.reflectLayer;
        const rvArc = h.rvArc;
        if (layer === null || rvArc === null || next.reflect === null) throw new Error('반사 방향 층이 없다');
        const from = next.base.lightDeg;
        const to = degOf(next.reflect.dir);
        rvArc.setAttribute('opacity', '0');
        await tween(mine, (k) => {
          layer.textContent = '';
          arrow(layer, from + (to - from) * k, colors.itemComparing, 5, t('label.reflect', 'reflection R'));
        });
      } else {
        return;
      }
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
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
