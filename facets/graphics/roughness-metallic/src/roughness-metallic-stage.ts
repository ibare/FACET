/**
 * roughness-metallic 무대.
 *
 * 동사는 "물든다 · 번진다". 면은 가로 한 줄, 점 아홉은 그 위의 칸이다. 칸은 그 점의 값(퍼진빛 + 번쩍임)을
 * 표시 색(채널마다 값/(1+값))으로 칠한다 — 눈이 면 위에서 보는 색이다. 면 위 공중에는 번쩍임(빨강)의
 * 높이를 이은 윤곽과 봉우리의 절반 선이 서고, 칸 아래에는 절반 이상인 점의 띠가 선다.
 * 재질 값 하나가 바뀌는 걸음마다 칸의 색 · 윤곽 · 절반 선 · 띠 · 봉우리로 가는 거울 길 · 재질 눈금이
 * 한 시계로 앞 재질의 값에서 새 값으로 흐른다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { displayTone, type ShadedRow, type Vec3 } from './algorithm.js';
import type { RoughnessMetallicScene, RoughnessMetallicState } from './scene.js';

const H = 490;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 한 걸음의 운동 길이 */
const MOVE_MS = 900;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function fmt3(v: number): string {
  const s = (Math.round(v * 1000) / 1000).toFixed(3);
  return s === '-0.000' ? '0.000' : s;
}

function triple(c: Vec3): string {
  return `(${fmt3(c[0])}, ${fmt3(c[1])}, ${fmt3(c[2])})`;
}

/** 선형 값 (r, g, b) → 칠하는 색. 채널마다 값/(1+값) — 자료에서 셈한 색이라 토큰이 아니다. */
function paint(c: Vec3): string {
  const pct = (v: number): number => Math.round(displayTone(v) * 1000) / 10;
  return `rgb(${pct(c[0])}%, ${pct(c[1])}%, ${pct(c[2])}%)`;
}

function mixNum(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function mixVec(a: Vec3, b: Vec3, k: number): Vec3 {
  return [mixNum(a[0], b[0], k), mixNum(a[1], b[1], k), mixNum(a[2], b[2], k)];
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** 한 프레임에 그릴 값 — 흐름의 k 에서 섞인 것 */
type Frame = {
  readonly rows: readonly ShadedRow[];
  /** 칸 채움의 불투명도 (첫 재질이 얹힐 때만 0 → 1) */
  readonly fillAlpha: number;
  readonly half: number;
  readonly peakX: number;
  /** 점마다 절반 이상 띠의 너비 몫 0..1 */
  readonly spreadShare: readonly number[];
  readonly metallic: number;
  readonly roughness: number;
  readonly knobAlpha: number;
};

function frameOf(now: RoughnessMetallicState): Frame {
  return {
    rows: now.rows,
    fillAlpha: 1,
    half: now.half,
    peakX: now.peakX,
    spreadShare: now.rows.map((r) => (now.spread.includes(r.x) ? 1 : 0)),
    metallic: now.metallic,
    roughness: now.roughness,
    knobAlpha: 1,
  };
}

function mixFrame(was: RoughnessMetallicState | null, now: RoughnessMetallicState, k: number): Frame {
  const end = frameOf(now);
  if (was === null) {
    const zero: Vec3 = [0, 0, 0];
    return {
      ...end,
      rows: now.rows.map((r) => ({
        x: r.x,
        diffuse: mixVec(zero, r.diffuse, k),
        specular: mixVec(zero, r.specular, k),
        total: mixVec(zero, r.total, k),
      })),
      fillAlpha: k,
      half: mixNum(0, now.half, k),
      spreadShare: end.spreadShare.map((s) => s * k),
      knobAlpha: k,
    };
  }
  const start = frameOf(was);
  return {
    rows: now.rows.map((r, i) => {
      const w = was.rows[i];
      if (w === undefined || w.x !== r.x) throw new Error(`roughness-metallic stage: 앞 재질에 점 x=${r.x} 가 없다`);
      return {
        x: r.x,
        diffuse: mixVec(w.diffuse, r.diffuse, k),
        specular: mixVec(w.specular, r.specular, k),
        total: mixVec(w.total, r.total, k),
      };
    }),
    fillAlpha: 1,
    half: mixNum(start.half, end.half, k),
    peakX: mixNum(start.peakX, end.peakX, k),
    spreadShare: end.spreadShare.map((s, i) => {
      const w = start.spreadShare[i];
      if (w === undefined) throw new Error(`roughness-metallic stage: 앞 재질에 ${i} 번째 띠 몫이 없다`);
      return mixNum(w, s, k);
    }),
    metallic: mixNum(start.metallic, end.metallic, k),
    roughness: mixNum(start.roughness, end.roughness, k),
    knobAlpha: 1,
  };
}

export const roughnessMetallicStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    // 크기는 캔버스에서 역산한다 — 상수는 상한만
    const unitMax = 60;
    const cx = W / 2;
    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Attrs, parent: Element = svg): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function put(x: number, y: number, s: string, attrs: Attrs = {}): SVGElement {
      const node = el('text', {
        x: round2(x),
        y: round2(y),
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        ...attrs,
      });
      node.textContent = s;
      return node;
    }

    function draw(scene: RoughnessMetallicScene, frame: Frame | null): void {
      svg.textContent = '';
      const pts = scene.base.points;
      const minX = Math.min(...pts);
      const maxX = Math.max(...pts);
      const span = maxX - minX + 1;
      const u = Math.min(unitMax, (W - 60) / span);
      const worldTop = Math.max(scene.base.light[1], scene.base.eye[1]);
      const topY = 36;
      const SY = topY + worldTop * u;
      const sx = (x: number): number => cx + (x - (minX + maxX) / 2) * u;
      const sy = (y: number): number => SY - y * u;
      const glowMax = SY - (topY + 80);
      const glowY = (v: number): number => SY - displayTone(v) * glowMax;
      const left = sx(minX) - u / 2;
      const right = sx(maxX) + u / 2;

      // 빛 · 눈 — 자료의 자리 그대로
      const lx = sx(scene.base.light[0]);
      const ly = sy(scene.base.light[1]);
      const ex = sx(scene.base.eye[0]);
      const ey = sy(scene.base.eye[1]);

      // 봉우리로 가는 거울 길 (빛 → 봉우리 점 → 눈)
      if (frame !== null) {
        const px = sx(frame.peakX);
        el('polyline', {
          points: `${round2(lx)},${round2(ly)} ${round2(px)},${round2(SY)} ${round2(ex)},${round2(ey)}`,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '4 4',
        });
      }

      for (let a = 0; a < 8; a += 1) {
        const ang = (a * Math.PI) / 4;
        el('line', {
          x1: round2(lx + Math.cos(ang) * 12),
          y1: round2(ly + Math.sin(ang) * 12),
          x2: round2(lx + Math.cos(ang) * 17),
          y2: round2(ly + Math.sin(ang) * 17),
          stroke: colors.accent,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
      }
      el('circle', { cx: round2(lx), cy: round2(ly), r: 8, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 });
      put(lx, ly + 32, t('label.light', 'Light'), { 'text-anchor': 'middle' });

      el('path', {
        d: `M${round2(ex - 14)},${round2(ey)} Q${round2(ex)},${round2(ey - 11)} ${round2(ex + 14)},${round2(ey)} Q${round2(ex)},${round2(ey + 11)} ${round2(ex - 14)},${round2(ey)} Z`,
        fill: colors.bg,
        stroke: colors.text,
        'stroke-width': 1.5,
      });
      el('circle', { cx: round2(ex), cy: round2(ey), r: 4, fill: colors.text });
      put(ex, ey + 32, t('label.eye', 'Eye'), { 'text-anchor': 'middle' });

      // 재질 눈금 둘 — 0..1 막대 위의 손잡이
      const trackL = cx - 40;
      const trackR = cx + 70;
      const gauge = (y: number, name: string, value: number | null, lit: boolean, alpha: number, shown: number | null): void => {
        put(trackL - 10, y + smPx / 3, name, { 'text-anchor': 'end' });
        el('line', { x1: trackL, y1: y, x2: trackR, y2: y, stroke: colors.border, 'stroke-width': 4, 'stroke-linecap': 'round' });
        if (value === null || shown === null) return;
        const kx = trackL + value * (trackR - trackL);
        el('circle', {
          cx: round2(kx),
          cy: y,
          r: 7,
          fill: lit ? colors.accent : colors.primary,
          stroke: colors.text,
          'stroke-width': 1,
          opacity: round2(alpha),
        });
        put(trackR + 14, y + smPx / 3, String(shown), { 'font-family': fonts.mono, opacity: round2(alpha) });
      };
      const now = scene.now;
      const changed = scene.step.kind === 'material' ? scene.step.changed : null;
      if (frame === null || now === null) {
        gauge(26, t('label.metallic', 'Metallic'), null, false, 0, null);
        gauge(54, t('label.roughness', 'Roughness'), null, false, 0, null);
      } else {
        gauge(26, t('label.metallic', 'Metallic'), frame.metallic, changed === 'metallic', frame.knobAlpha, now.metallic);
        gauge(54, t('label.roughness', 'Roughness'), frame.roughness, changed === 'roughness', frame.knobAlpha, now.roughness);
      }

      // 번쩍임(빨강)의 윤곽과 봉우리의 절반 선
      if (frame !== null) {
        const tops = frame.rows.map((r) => `${round2(sx(r.x))},${round2(glowY(r.specular[0]))}`);
        el('polygon', {
          points: [`${round2(left)},${round2(SY)}`, `${round2(sx(minX))},${round2(SY)}`, ...tops, `${round2(sx(maxX))},${round2(SY)}`, `${round2(right)},${round2(SY)}`].join(' '),
          fill: colors.bgSubtle,
          stroke: 'none',
        });
        el('polyline', {
          points: tops.join(' '),
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 1.5,
          'stroke-linejoin': 'round',
        });
        const hy = glowY(frame.half);
        el('line', {
          x1: round2(left),
          y1: round2(hy),
          x2: round2(right),
          y2: round2(hy),
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '6 4',
        });
        put(right, hy - 6, t('label.half', 'Half of peak'), { 'text-anchor': 'end', fill: colors.textMuted, 'font-size': fontSizes.xs });
        for (const r of frame.rows) {
          el('circle', {
            cx: round2(sx(r.x)),
            cy: round2(glowY(r.specular[0])),
            r: 5,
            fill: paint(r.specular),
            stroke: colors.text,
            'stroke-width': 1,
          });
        }
      }

      // 면과 그 위의 칸 — 눈이 보는 색
      const tileY = SY + 3;
      const tileH = 24;
      for (const [i, x] of pts.entries()) {
        const tx0 = sx(x) - u / 2 + 2;
        el('rect', { x: round2(tx0), y: tileY, width: round2(u - 4), height: tileH, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 });
        if (frame !== null) {
          const row = frame.rows[i];
          if (row === undefined || row.x !== x) throw new Error(`roughness-metallic stage: 점 x=${x} 의 값이 없다`);
          el('rect', {
            x: round2(tx0),
            y: tileY,
            width: round2(u - 4),
            height: tileH,
            fill: paint(row.total),
            stroke: colors.border,
            'stroke-width': 1,
            'fill-opacity': round2(frame.fillAlpha),
          });
        }
        put(sx(x), tileY + tileH + 16, String(x), { 'text-anchor': 'middle', fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
      }
      el('line', { x1: round2(left), y1: round2(SY), x2: round2(right), y2: round2(SY), stroke: colors.text, 'stroke-width': 2 });

      // 절반 이상인 점의 띠
      const bandY = tileY + tileH + 26;
      if (frame !== null && now !== null) {
        for (const [i, x] of pts.entries()) {
          const share = frame.spreadShare[i];
          if (share === undefined) throw new Error(`roughness-metallic stage: 점 x=${x} 의 띠 몫이 없다`);
          if (share <= 0) continue;
          const w = (u - 4) * share;
          el('rect', { x: round2(sx(x) - w / 2), y: bandY, width: round2(w), height: 5, rx: 2, fill: colors.accent, stroke: colors.text, 'stroke-width': 0.5 });
        }
        put(cx, bandY + 22, t('label.spread', 'Points at half or above: {n}', { n: now.spread.length }), { 'text-anchor': 'middle' });

        // 봉우리 점 하나의 값
        const peak = now.rows.find((r) => r.x === now.peakX);
        if (peak === undefined) throw new Error(`roughness-metallic stage: 봉우리 x=${now.peakX} 의 값이 없다`);
        const ry = bandY + 50;
        const colL = left;
        put(colL, ry, t('label.peakAt', 'Peak: x = {x}', { x: now.peakX }), { 'font-weight': 600 });
        const line = (y: number, name: string, c: Vec3): void => {
          put(colL + 16, y, name);
          el('rect', { x: round2(colL + 120), y: round2(y - 12), width: 28, height: 16, fill: paint(c), stroke: colors.border, 'stroke-width': 1 });
          put(colL + 160, y, triple(c), { 'font-family': fonts.mono });
        };
        line(ry + 24, t('label.diffuse', 'Diffuse'), peak.diffuse);
        line(ry + 48, t('label.specular', 'Highlight'), peak.specular);
      }

      // 지금 일어나는 일
      let caption: string;
      const step = scene.step;
      if (step.kind === 'start' || now === null) {
        caption = t('caption.start', 'One surface, one light, one eye. No material yet.');
      } else if (step.changed === 'first') {
        caption = t('caption.first', 'Material on: metallic {metallic}, roughness {roughness}.', { metallic: now.metallic, roughness: now.roughness });
      } else if (step.from === null) {
        throw new Error('roughness-metallic stage: 바뀐 값의 앞 값이 없다');
      } else if (step.changed === 'metallic') {
        caption = t('caption.metallic', 'Metallic: {from} → {to}. Roughness stays.', { from: step.from, to: now.metallic });
      } else {
        caption = t('caption.roughness', 'Roughness: {from} → {to}. Metallic stays.', { from: step.from, to: now.roughness });
      }
      put(cx, H - 14, caption, { 'text-anchor': 'middle', 'font-size': fontSizes.md });
    }

    function drawStatic(scene: RoughnessMetallicScene): void {
      draw(scene, scene.now === null ? null : frameOf(scene.now));
    }

    function flow(scene: RoughnessMetallicScene, was: RoughnessMetallicState | null, now: RoughnessMetallicState, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const began = Date.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const k = Math.min(1, (Date.now() - began) / MOVE_MS);
          draw(scene, mixFrame(was, now, ease(k)));
          if (k >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next: RoughnessMetallicScene, _prev: RoughnessMetallicScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || step.kind !== 'material' || next.now === null) {
          drawStatic(next);
          return;
        }
        // 정적 그리기가 정본 — 운동은 앞 재질의 값(장면이 step.was 로 말한다)에서 출발해 그 자리로 온다
        draw(next, mixFrame(step.was, next.now, 0));
        await flow(next, step.was, next.now, mine);
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
