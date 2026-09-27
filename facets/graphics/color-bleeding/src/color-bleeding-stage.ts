import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import type { Rgb, Vec2 } from './algorithm.js';
import type { ColorBleedingScene } from './scene.js';

/**
 * 색 번짐 무대.
 *
 * 왼쪽은 방(y 가 위인 자료를 화면으로 뒤집는다), 바닥 조각 밑에는 조각마다 R · G · B 막대,
 * 오른쪽은 패치마다 지금 내보내는 빛 B. 움직임은 빛 알갱이다 — 직접광 걸음에는 천장에서
 * 패치 다섯으로 떨어지고, 모음 걸음에는 두 벽에서 받는 바닥 조각으로 건너간다. 알갱이가
 * 닿으면 그 조각의 막대가 자라고, 빨간 벽에서 온 몫만큼 R 막대가 G 위로 솟는다.
 */

const H = 520;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 방 한 변의 상한 */
const ROOM_MAX = 240;
const ROOM_LEFT = 78;
const ROOM_TOP = 52;
/** 오른쪽 목록이 차지하는 최소 폭 */
const PANEL_MIN_W = 232;
const PANEL_GAP = 48;
/** 패치 띠 두께 */
const BAND = 9;
/** 막대 영역 — 값 1 이 이 높이 */
const BAR_H = 160;
const BAR_GAP_TOP = 20;
const BAR_W = 15;
const BAR_SPACE = 5;
const DOT_R = 4;

const MOTION_MS = 1100;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

function fmt(x: number, digits: number): string {
  const s = x.toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : s;
}

function fmtRgb(c: Rgb): string {
  return `(${fmt(c[0], 3)}, ${fmt(c[1], 3)}, ${fmt(c[2], 3)})`;
}

/** 선형 0..1 RGB 를 그대로 화면 색으로 (감마 없음 — 셈의 값을 그대로 보인다) */
function rgbCss(c: Rgb): string {
  const to = (x: number): number => {
    if (!(x >= 0 && x <= 1)) throw new Error(`color-bleeding stage: 색 성분이 0..1 밖이다 (${x})`);
    return Math.round(x * 255);
  };
  return `rgb(${to(c[0])}, ${to(c[1])}, ${to(c[2])})`;
}

/** 채널을 가르는 색 — 셈의 값이 아니라 식별 색이라 categorical 에서 받는다. 글자 R · G · B 가 함께 가른다 */
const CHANNEL_COLORS = categorical(3, 'vivid');

function channelColor(ch: 0 | 1 | 2): string {
  const c = CHANNEL_COLORS[ch];
  if (c === undefined) throw new Error(`color-bleeding stage: 채널 색이 없다 (${ch})`);
  return c;
}

function mix(a: Rgb, b: Rgb, k: number): Rgb {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function scale(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function ease(x: number): number {
  const u = clamp01(x);
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function r2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return v === 0 ? 0 : v;
}

export const colorBleedingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

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

    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: number; rotate?: number; halo?: boolean } = {},
    ): SVGTextElement {
      const attrs: Record<string, string | number> = {
        x: r2(x),
        y: r2(y),
        'font-family': o.mono === true ? fonts.mono : fonts.body,
        'font-size': o.size ?? fontSizes.sm,
        fill: o.fill ?? colors.text,
        'text-anchor': o.anchor ?? 'start',
      };
      if (o.weight !== undefined) attrs['font-weight'] = o.weight;
      if (o.rotate !== undefined) attrs.transform = `rotate(${o.rotate} ${r2(x)} ${r2(y)})`;
      if (o.halo === true) {
        attrs.stroke = colors.bg;
        attrs['stroke-width'] = 3;
        attrs['paint-order'] = 'stroke';
      }
      const node = el('text', attrs, parent);
      node.textContent = s;
      return node;
    }

    function labelOf(id: string): string {
      switch (id) {
        case 'light':
          return t('label.light', 'Light');
        case 'red-wall':
          return t('label.red-wall', 'Red wall');
        case 'white-wall':
          return t('label.white-wall', 'White wall');
        case 'f1':
          return t('label.f1', 'Floor 1');
        case 'f2':
          return t('label.f2', 'Floor 2');
        case 'f3':
          return t('label.f3', 'Floor 3');
        default:
          throw new Error(`color-bleeding stage: 표시 이름이 없는 식별자 ${id}`);
      }
    }

    /** 자료 좌표 → 화면. 방의 테두리 상자를 방 한 변에 맞춘다 */
    type Frame = {
      side: number;
      toScreen(p: Vec2): Pt;
      center: Pt;
      floorY: number;
    };

    function frameOf(scene: ColorBleedingScene): Frame {
      const pts: Vec2[] = [scene.emitter.a, scene.emitter.b];
      for (const p of scene.patches) pts.push(p.a, p.b);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
      }
      const span = Math.max(maxX - minX, maxY - minY);
      if (!(span > 0)) throw new Error('color-bleeding stage: 방의 크기가 0 이다');
      const side = Math.min(ROOM_MAX, W - ROOM_LEFT - PANEL_GAP - PANEL_MIN_W);
      const k = side / span;
      const toScreen = (p: Vec2): Pt => ({ x: ROOM_LEFT + (p[0] - minX) * k, y: ROOM_TOP + (maxY - p[1]) * k });
      return {
        side,
        toScreen,
        center: toScreen([(minX + maxX) / 2, (minY + maxY) / 2]),
        floorY: ROOM_TOP + (maxY - minY) * k,
      };
    }

    /** 선분의 화면 끝점 · 방 안쪽 법선 */
    function segOf(fr: Frame, s: { a: Vec2; b: Vec2 }): { a: Pt; b: Pt; n: Pt; d: Pt } {
      const a = fr.toScreen(s.a);
      const b = fr.toScreen(s.b);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len === 0) throw new Error('color-bleeding stage: 길이 0 인 패치');
      const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      let n = { x: -d.y, y: d.x };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (n.x * (fr.center.x - mid.x) + n.y * (fr.center.y - mid.y) < 0) n = { x: -n.x, y: -n.y };
      return { a, b, n, d };
    }

    /** 선분 위 비율 u 자리에서 안쪽으로 off 만큼 들어간 점 */
    function along(sg: { a: Pt; b: Pt; n: Pt }, u: number, off: number): Pt {
      return {
        x: sg.a.x + (sg.b.x - sg.a.x) * u + sg.n.x * off,
        y: sg.a.y + (sg.b.y - sg.a.y) * u + sg.n.y * off,
      };
    }

    function poly(pts: Pt[]): string {
      return pts.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');
    }

    /** 걸음의 진행률 p 에서 패치마다 보이는 B (null = 아직 빛 없음) */
    function shownB(scene: ColorBleedingScene, p: number, barK: number): Map<string, Rgb | null> {
      const out = new Map<string, Rgb | null>();
      for (const patch of scene.patches) out.set(patch.id, null);
      if (scene.direct === null) return out;
      const directNow = scene.step.kind === 'direct' && p < 1;
      for (const d of scene.direct) {
        if (!out.has(d.id)) throw new Error(`color-bleeding stage: 없는 패치 ${d.id}`);
        out.set(d.id, directNow ? (barK > 0 ? scale(d.value, barK) : null) : d.value);
      }
      const step = scene.step;
      for (const g of scene.gathered) {
        const isNow = step.kind === 'gather' && step.id === g.id && p < 1;
        out.set(g.id, isNow ? mix(g.before, g.after, barK) : g.after);
      }
      return out;
    }

    type Dot = { from: Pt; to: Pt; fill: string };

    function dotsOf(scene: ColorBleedingScene, fr: Frame): Dot[] {
      const step = scene.step;
      const dots: Dot[] = [];
      if (step.kind === 'direct') {
        const src = segOf(fr, scene.emitter);
        const fill = rgbCss(scene.emitter.emission);
        for (const patch of scene.patches) {
          const dst = segOf(fr, patch);
          for (let j = 0; j < 3; j += 1) {
            const u = (j + 0.5) / 3;
            dots.push({ from: along(src, u, BAND + DOT_R), to: along(dst, u, BAND + DOT_R), fill });
          }
        }
      } else if (step.kind === 'gather') {
        const g = scene.gathered[scene.gathered.length - 1];
        if (g === undefined || g.id !== step.id) throw new Error('color-bleeding stage: 이번 모음이 자취에 없다');
        const receiver = scene.patches.find((x) => x.id === g.id);
        if (receiver === undefined) throw new Error(`color-bleeding stage: 없는 패치 ${g.id}`);
        const dst = segOf(fr, receiver);
        for (const part of g.parts) {
          const sender = scene.patches.find((x) => x.id === part.from);
          if (sender === undefined) throw new Error(`color-bleeding stage: 없는 패치 ${part.from}`);
          const src = segOf(fr, sender);
          const n = Math.max(1, Math.round(part.form * 10));
          for (let j = 0; j < n; j += 1) {
            const u = (j + 0.5) / n;
            dots.push({ from: along(src, u, BAND + DOT_R), to: along(dst, u, BAND + DOT_R), fill: rgbCss(sender.rho) });
          }
        }
      }
      return dots;
    }

    /** 장면 전체를 진행률 p 로 세운다. p = 1 이 정적 화면 */
    function draw(scene: ColorBleedingScene, p: number): void {
      svg.textContent = '';
      const fr = frameOf(scene);
      const dotK = ease(p / 0.65);
      const barK = ease((p - 0.55) / 0.45);
      const shown = shownB(scene, p, barK);
      const step = scene.step;

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (step.kind === 'start') caption = t('caption.start', 'Six patches in a room. No light has spread yet.');
      else if (step.kind === 'direct') caption = t('caption.direct', 'Direct light only: each patch gets ρ · F(→light) · E.');
      else {
        const g = scene.gathered[scene.gathered.length - 1];
        if (g === undefined) throw new Error('color-bleeding stage: 모음 걸음인데 자취가 비었다');
        caption = t('caption.gather', 'Gathering the walls’ light: {name}. Added light: {added}', {
          name: labelOf(g.id),
          added: fmtRgb(g.added),
        });
      }
      text(svg, 20, 26, caption, { size: fontSizes.md });

      // 방 바닥면
      const tl = { x: ROOM_LEFT, y: ROOM_TOP };
      el('rect', { x: tl.x, y: tl.y, width: r2(fr.side), height: r2(fr.side), fill: colors.bgSubtle, stroke: colors.border }, svg);

      // 모음 걸음 — 벽에서 받는 조각으로 빛이 건너가는 띠 (글자는 패치 띠 위에 따로)
      const formLabels: { x: number; y: number; form: number }[] = [];
      if (step.kind === 'gather') {
        const g = scene.gathered[scene.gathered.length - 1];
        if (g === undefined) throw new Error('color-bleeding stage: 모음 걸음인데 자취가 비었다');
        const receiver = scene.patches.find((x) => x.id === g.id);
        if (receiver === undefined) throw new Error(`color-bleeding stage: 없는 패치 ${g.id}`);
        const dst = segOf(fr, receiver);
        for (const part of g.parts) {
          const sender = scene.patches.find((x) => x.id === part.from);
          if (sender === undefined) throw new Error(`color-bleeding stage: 없는 패치 ${part.from}`);
          const src = segOf(fr, sender);
          const sa = along(src, 0, BAND);
          const sb = along(src, 1, BAND);
          const ra = along(dst, 0, BAND);
          const rb = along(dst, 1, BAND);
          // 교차하지 않은 끈 둘을 변으로 — 두 합의 작은 쪽 짝
          const straight = Math.hypot(sa.x - ra.x, sa.y - ra.y) + Math.hypot(sb.x - rb.x, sb.y - rb.y);
          const swapped = Math.hypot(sa.x - rb.x, sa.y - rb.y) + Math.hypot(sb.x - ra.x, sb.y - ra.y);
          const quad = straight <= swapped ? [sa, sb, rb, ra] : [sa, sb, ra, rb];
          el('polygon', { points: poly(quad), fill: rgbCss(sender.rho), 'fill-opacity': 0.16, stroke: 'none' }, svg);
          formLabels.push({ x: (sa.x + sb.x + ra.x + rb.x) / 4, y: (sa.y + sb.y + ra.y + rb.y) / 4, form: part.form });
        }
      }

      // 패치 띠 — 지금 내보내는 빛의 색
      const emit = segOf(fr, scene.emitter);
      el(
        'polygon',
        {
          points: poly([emit.a, emit.b, along(emit, 1, BAND), along(emit, 0, BAND)]),
          fill: rgbCss(scene.emitter.emission),
          stroke: colors.accent,
          'stroke-width': 2,
        },
        svg,
      );
      text(svg, (emit.a.x + emit.b.x) / 2, emit.a.y - 8, labelOf(scene.emitter.id), { anchor: 'middle', fill: colors.textMuted });
      const receiverNow = step.kind === 'gather' ? step.id : null;
      for (const patch of scene.patches) {
        const sg = segOf(fr, patch);
        const inset = 1.5;
        const a = { x: sg.a.x + sg.d.x * inset, y: sg.a.y + sg.d.y * inset };
        const b = { x: sg.b.x - sg.d.x * inset, y: sg.b.y - sg.d.y * inset };
        const s2 = { a, b, n: sg.n };
        const value = shown.get(patch.id);
        if (value === undefined) throw new Error(`color-bleeding stage: 없는 패치 ${patch.id}`);
        el(
          'polygon',
          {
            points: poly([a, b, along(s2, 1, BAND), along(s2, 0, BAND)]),
            fill: value === null ? colors.bg : rgbCss(value),
            stroke: patch.id === receiverNow ? colors.accent : colors.textMuted,
            'stroke-width': patch.id === receiverNow ? 2 : 1,
          },
          svg,
        );
      }

      const xsPx = parseFloat(fontSizes.xs);
      for (const fl of formLabels) {
        // 글자가 벽 띠에 걸리지 않게 방 안쪽으로 들인다 (글자 자리만 — 값은 그대로)
        const half = (6 + fmt(fl.form, 3).length) * xsPx * 0.3;
        const lo = ROOM_LEFT + BAND + half + 2;
        const hi = ROOM_LEFT + fr.side - BAND - half - 2;
        const lx = Math.min(hi, Math.max(lo, fl.x));
        text(svg, lx, fl.y, t('value.form', 'F {v}', { v: fmt(fl.form, 3) }), {
          mono: true,
          size: fontSizes.xs,
          anchor: 'middle',
          halo: true,
        });
      }

      // 벽 이름 (바깥쪽, 세로)
      for (const patch of scene.patches) {
        if (scene.receivers.includes(patch.id)) continue;
        const sg = segOf(fr, patch);
        const mid = { x: (sg.a.x + sg.b.x) / 2 - sg.n.x * 14, y: (sg.a.y + sg.b.y) / 2 - sg.n.y * 14 };
        const vertical = Math.abs(sg.d.y) > Math.abs(sg.d.x);
        text(svg, mid.x, mid.y, labelOf(patch.id), {
          anchor: 'middle',
          fill: colors.textMuted,
          rotate: vertical ? (sg.n.x > 0 ? -90 : 90) : undefined,
        });
      }

      // 바닥 조각 밑 — 조각마다 R · G · B 막대 (값 1 이 BAR_H)
      const base = fr.floorY + BAR_GAP_TOP + BAR_H;
      el('line', { x1: ROOM_LEFT, y1: r2(base), x2: r2(ROOM_LEFT + fr.side), y2: r2(base), stroke: colors.border }, svg);
      // 값 1 의 자리 — 막대 위 빈자리가 색 범위의 나머지임을 보인다
      el(
        'line',
        { x1: ROOM_LEFT, y1: r2(base - BAR_H), x2: r2(ROOM_LEFT + fr.side), y2: r2(base - BAR_H), stroke: colors.border, 'stroke-dasharray': '2 3' },
        svg,
      );
      text(svg, ROOM_LEFT - 6, base + 4, fmt(0, 0), { anchor: 'end', mono: true, size: fontSizes.xs, fill: colors.textMuted });
      text(svg, ROOM_LEFT - 6, base - BAR_H + 4, fmt(1, 0), { anchor: 'end', mono: true, size: fontSizes.xs, fill: colors.textMuted });
      for (const rid of scene.receivers) {
        const patch = scene.patches.find((x) => x.id === rid);
        if (patch === undefined) throw new Error(`color-bleeding stage: 없는 패치 ${rid}`);
        const sg = segOf(fr, patch);
        const cx = (sg.a.x + sg.b.x) / 2;
        text(svg, cx, fr.floorY - BAND - 6, labelOf(rid), { anchor: 'middle', size: fontSizes.xs, fill: colors.textMuted });
        const value = shown.get(rid);
        if (value === undefined) throw new Error(`color-bleeding stage: 없는 패치 ${rid}`);
        const groupW = 3 * BAR_W + 2 * BAR_SPACE;
        const x0 = cx - groupW / 2;
        const letters: readonly [string, string, string] = [t('channel.r', 'R'), t('channel.g', 'G'), t('channel.b', 'B')];
        for (const ch of [0, 1, 2] as const) {
          const x = x0 + ch * (BAR_W + BAR_SPACE);
          const h = value === null ? 0 : value[ch] * BAR_H;
          if (h > 0) {
            el(
              'rect',
              { x: r2(x), y: r2(base - h), width: BAR_W, height: r2(h), fill: channelColor(ch), stroke: colors.textMuted, 'stroke-width': 0.5 },
              svg,
            );
          }
          text(svg, x + BAR_W / 2, base + 13, letters[ch], { anchor: 'middle', size: fontSizes.xs, fill: colors.textMuted, mono: true });
        }
        if (value !== null) {
          const gapH = (value[0] - value[1]) * BAR_H;
          if (gapH > 0.5) {
            // R 이 G 위로 솟은 몫 — 묻어난 빨강
            const yG = base - value[1] * BAR_H;
            el(
              'line',
              { x1: r2(x0 - 3), y1: r2(yG), x2: r2(x0 + groupW + 3), y2: r2(yG), stroke: colors.textMuted, 'stroke-dasharray': '3 2' },
              svg,
            );
            el(
              'rect',
              { x: r2(x0 - 1.5), y: r2(yG - gapH), width: BAR_W + 3, height: r2(gapH), fill: 'none', stroke: colors.accent, 'stroke-width': 2 },
              svg,
            );
          }
          text(svg, cx, base + 30, t('value.redMinusGreen', 'R−G {v}', { v: fmt(value[0] - value[1], 3) }), {
            anchor: 'middle',
            mono: true,
            size: fontSizes.xs,
            weight: receiverNow === rid ? 700 : 400,
          });
        }
      }

      // 빛 알갱이
      if (p < 1 && dotK < 1) {
        for (const d of dotsOf(scene, fr)) {
          el(
            'circle',
            {
              cx: r2(d.from.x + (d.to.x - d.from.x) * dotK),
              cy: r2(d.from.y + (d.to.y - d.from.y) * dotK),
              r: DOT_R,
              fill: d.fill,
              stroke: colors.text,
              'stroke-width': 0.75,
            },
            svg,
          );
        }
      }

      // 오른쪽 — 패치마다 지금 내보내는 빛 B
      const px = ROOM_LEFT + fr.side + PANEL_GAP;
      const right = W - 16;
      text(svg, px, ROOM_TOP + 8, t('panel.title', 'Light leaving each patch (B)'), { weight: 600 });
      const rowH = Math.min(42, (fr.floorY - ROOM_TOP - 24) / scene.patches.length);
      scene.patches.forEach((patch, i) => {
        const y = ROOM_TOP + 26 + i * rowH;
        const value = shown.get(patch.id);
        if (value === undefined) throw new Error(`color-bleeding stage: 없는 패치 ${patch.id}`);
        const now = patch.id === receiverNow;
        el(
          'rect',
          {
            x: px,
            y: r2(y),
            width: 24,
            height: 24,
            fill: value === null ? colors.bg : rgbCss(value),
            stroke: now ? colors.accent : colors.textMuted,
            'stroke-width': now ? 2 : 1,
          },
          svg,
        );
        text(svg, px + 34, y + 10, labelOf(patch.id), { weight: now ? 700 : 400 });
        if (value !== null) {
          text(svg, px + 34, y + 10 + smPx + 2, fmtRgb(value), { mono: true, size: fontSizes.xs });
        }
        const lit = scene.direct?.find((d) => d.id === patch.id);
        if (lit !== undefined && value !== null) {
          text(svg, right, y + 10, t('value.formToLight', 'F(→light) {v}', { v: fmt(lit.formToLight, 3) }), {
            anchor: 'end',
            mono: true,
            size: fontSizes.xs,
            fill: colors.textMuted,
          });
        }
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function flow(scene: ColorBleedingScene, mine: number): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (destroyed || mine !== gen) return;
        const p = Math.min(1, (Date.now() - start) / MOTION_MS);
        if (p >= 1) break;
        draw(scene, p);
        await wait(FRAME_MS);
      }
      if (destroyed || mine !== gen) return;
      draw(scene, 1);
    }

    return {
      render(next: ColorBleedingScene, prev: ColorBleedingScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return Promise.resolve();
        if (!opts.animate || prev === null || next.step.kind === 'start') {
          draw(next, 1);
          return Promise.resolve();
        }
        draw(next, 0);
        return flow(next, mine);
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
