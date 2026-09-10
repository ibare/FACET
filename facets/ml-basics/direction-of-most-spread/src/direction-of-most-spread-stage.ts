/**
 * 가장 넓게 퍼진 방향 — 무대.
 *
 * 화면은 둘로 갈린다. 왼쪽은 점 무리와 **도는 축**이고, 오른쪽은 그 축을 돌리는
 * 동안 퍼짐이 어떻게 오르내리는지를 그리는 **곡선**이다. 산점도는 주인공이
 * 아니라 동사가 일어나는 자리다 — 눈이 따라가야 하는 것은 축이 돌 때마다
 * 오른쪽에서 자라나는 곡선과 그 위를 달리는 읽개(head)다.
 *
 * 오른쪽 아래의 막대는 곁들여 드러나는 것을 진다. 축 방향의 퍼짐과 직각 방향의
 * 퍼짐이 한 막대를 나눠 가지는데, 나누는 자리는 축이 돌 때마다 미끄러져도
 * 막대의 오른쪽 끝은 꿈쩍하지 않는다. 합이 늘 같다는 말이 그것이다.
 *
 * 좌표는 전부 여기서 셈한다 (S-piece). 선언이 주는 것은 점의 데이터 좌표뿐이고,
 * 재어 낸 수(가운데 · 퍼짐 · 합)는 걸음마다 payload 로 온다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 그림이 정한다 (S-view). 마운트한 뒤로 바꾸지 않는다. */
const H = 288;

/** 왼쪽 — 점 무리가 사는 틀. */
const SCAT = { x: 14, y: 42, w: 236, h: 208 };
const SCAT_PAD = 18;

/** 오른쪽 — 퍼짐 곡선과 합 막대가 같은 가로 폭을 쓴다. */
const RIGHT_L = 294;
const RIGHT_R = W - 14;
const CURVE_Y = 46;
const CURVE_H = 116;
const CURVE_BASE = CURVE_Y + CURVE_H;
const TICK_LABEL_Y = 176;
const SUM_LABEL_Y = 198;
const BAR_Y = 206;
const BAR_H = 22;
const SEG_LABEL_Y = 243;
const CAPTION_Y = 272;
const HEADROOM = 1.08;

const PT_R = 3.2;
const FOOT_R = 2.5;

const CENTER_MS = 380;
const TURN_MS = 360;
const NARROW_MS = 900;
const SETTLE_MS = 560;
const FRAME_MS = 16;

const DEG = Math.PI / 180;

/** 마운트마다 다른 clipPath id — 한 글에 조각이 여럿 박히면 id 가 부딪힌다. */
let clipSeq = 0;

type Point = { x: number; y: number };
type Scene = { points: Point[] };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * 선언을 좁히는 자리는 여기 하나다 (S-piece). projector 는 이것을 다시 부르지
 * 않는다 — 걸음마다 오는 payload 는 projector 가 따로 좁힌다.
 */
function readScene(initialData: unknown): Scene {
  const raw = (typeof initialData === 'object' && initialData !== null
    ? initialData
    : {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.points) ? raw.points : [];
  const points: Point[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const x = row[0];
    const y = row[1];
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    points.push({ x, y });
  }
  if (points.length === 0) {
    throw new Error('점 무리가 비었다: direction-of-most-spread-stage 의 initialData.points');
  }
  return { points };
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

export const directionOfMostSpreadStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const scene = readScene(params.initialData);
    const svg = params.canvas;
    svg.textContent = '';

    // ── 기다림 관리 (S-piece). destroy 는 걸어 둔 것을 거두고 기다리던 것을 깨운다.
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function animate(duration: number, apply: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const start = Date.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) return; // destroy 가 waiters 로 깨운다
          const p = Math.min(1, (Date.now() - start) / duration);
          apply(easeInOut(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 왼쪽 틀의 좌표계. 각도가 뜻을 가지려면 가로세로 축척이 같아야 한다.
    const xs = scene.points.map((p) => p.x);
    const ys = scene.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanY = Math.max(maxY - minY, 1e-6);
    const scale = Math.min((SCAT.w - SCAT_PAD * 2) / spanX, (SCAT.h - SCAT_PAD * 2) / spanY);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const toPx = (x: number): number => SCAT.x + SCAT.w / 2 + (x - midX) * scale;
    const toPy = (y: number): number => SCAT.y + SCAT.h / 2 - (y - midY) * scale;
    const REACH = Math.hypot(SCAT.w, SCAT.h);

    const plotX = (deg: number): number => RIGHT_L + (deg / 180) * (RIGHT_R - RIGHT_L);

    // ── 정적인 것
    const clipId = `doms-clip-${(clipSeq += 1)}`;
    const defs = el('defs', {});
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(el('rect', { x: SCAT.x, y: SCAT.y, width: SCAT.w, height: SCAT.h, rx: 8 }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    svg.appendChild(
      el('rect', {
        x: SCAT.x,
        y: SCAT.y,
        width: SCAT.w,
        height: SCAT.h,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      }),
    );

    svg.appendChild(
      el('line', {
        x1: RIGHT_L,
        y1: CURVE_BASE,
        x2: RIGHT_R,
        y2: CURVE_BASE,
        stroke: c.border,
        'stroke-width': 1,
      }),
    );
    svg.appendChild(
      el('line', {
        x1: RIGHT_L,
        y1: CURVE_Y,
        x2: RIGHT_L,
        y2: CURVE_BASE,
        stroke: c.border,
        'stroke-width': 1,
      }),
    );
    for (const deg of [0, 45, 90, 135, 180]) {
      const gx = plotX(deg);
      svg.appendChild(
        el('line', { x1: gx, y1: CURVE_BASE, x2: gx, y2: CURVE_BASE + 4, stroke: c.border, 'stroke-width': 1 }),
      );
      const tick = el('text', {
        x: gx,
        y: TICK_LABEL_Y,
        'text-anchor': deg === 0 ? 'start' : deg === 180 ? 'end' : 'middle',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      // 각도 눈금은 수식 표기라 문안이 아니다 (C10 표식 판정 3).
      tick.textContent = `${deg}°`;
      svg.appendChild(tick);
    }

    const curveTitle = el('text', {
      x: RIGHT_L,
      y: CURVE_Y - 8,
      fill: c.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    curveTitle.textContent = t('label.spread', 'spread');
    svg.appendChild(curveTitle);

    // ── 도는 것 (왼쪽 틀 안. clip 으로 틀 밖을 자른다)
    const scatLayer = el('g', { 'clip-path': `url(#${clipId})` });
    svg.appendChild(scatLayer);

    const mateLine = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: c.auxCursor,
      'stroke-width': 1.4,
      'stroke-dasharray': '5 4',
      visibility: 'hidden',
    });
    scatLayer.appendChild(mateLine);

    const axisLine = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: c.text,
      'stroke-width': 1.2,
      visibility: 'hidden',
    });
    scatLayer.appendChild(axisLine);

    const mateBand = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: c.auxCursor,
      'stroke-width': 5,
      'stroke-linecap': 'round',
      visibility: 'hidden',
    });
    scatLayer.appendChild(mateBand);

    const band = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: c.itemActive,
      'stroke-width': 6,
      'stroke-linecap': 'round',
      visibility: 'hidden',
    });
    scatLayer.appendChild(band);

    const connectors = scene.points.map(() => {
      const line = el('line', {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        stroke: c.border,
        'stroke-width': 1,
        'stroke-dasharray': '2 3',
        visibility: 'hidden',
      });
      scatLayer.appendChild(line);
      return line;
    });

    for (const p of scene.points) {
      scatLayer.appendChild(el('circle', { cx: toPx(p.x), cy: toPy(p.y), r: PT_R, fill: c.textMuted }));
    }

    const feet = scene.points.map(() => {
      const foot = el('circle', { cx: 0, cy: 0, r: FOOT_R, fill: c.itemActive, visibility: 'hidden' });
      scatLayer.appendChild(foot);
      return foot;
    });

    const centerRing = el('circle', {
      cx: 0,
      cy: 0,
      r: 0,
      fill: 'none',
      stroke: c.accent,
      'stroke-width': 1.6,
      visibility: 'hidden',
    });
    scatLayer.appendChild(centerRing);
    const centerDot = el('circle', { cx: 0, cy: 0, r: 2.6, fill: c.accent, visibility: 'hidden' });
    scatLayer.appendChild(centerDot);

    const angleText = el('text', {
      x: SCAT.x,
      y: SCAT.y - 8,
      fill: c.text,
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
    });
    svg.appendChild(angleText);

    // ── 곡선
    const ceilingLine = el('line', {
      x1: RIGHT_L,
      y1: CURVE_Y,
      x2: RIGHT_R,
      y2: CURVE_Y,
      stroke: c.textMuted,
      'stroke-width': 1,
      'stroke-dasharray': '4 4',
      visibility: 'hidden',
    });
    svg.appendChild(ceilingLine);

    const coarseLine = el('polyline', {
      points: '',
      fill: 'none',
      stroke: c.itemActive,
      'stroke-width': 2,
      'stroke-linejoin': 'round',
    });
    svg.appendChild(coarseLine);

    const finePath = el('path', {
      d: '',
      fill: 'none',
      stroke: c.itemActive,
      'stroke-width': 2,
      visibility: 'hidden',
    });
    svg.appendChild(finePath);

    const coarseDots = el('g', {});
    svg.appendChild(coarseDots);

    const peakTick = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: c.accent,
      'stroke-width': 2,
      visibility: 'hidden',
    });
    svg.appendChild(peakTick);
    const peakDot = el('circle', { cx: 0, cy: 0, r: 3.4, fill: c.accent, visibility: 'hidden' });
    svg.appendChild(peakDot);

    const headDrop = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: c.border,
      'stroke-width': 1,
      visibility: 'hidden',
    });
    svg.appendChild(headDrop);
    const head = el('circle', { cx: 0, cy: 0, r: 3.6, fill: c.itemActive, visibility: 'hidden' });
    svg.appendChild(head);

    // ── 합 막대
    const barLeft = el('rect', { x: RIGHT_L, y: BAR_Y, width: 0, height: BAR_H, fill: c.itemActive });
    svg.appendChild(barLeft);
    const barRight = el('rect', { x: RIGHT_L, y: BAR_Y, width: 0, height: BAR_H, fill: c.auxCursor });
    svg.appendChild(barRight);
    svg.appendChild(
      el('rect', {
        x: RIGHT_L,
        y: BAR_Y,
        width: RIGHT_R - RIGHT_L,
        height: BAR_H,
        rx: 3,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1,
      }),
    );

    const sumText = el('text', {
      x: RIGHT_R,
      y: SUM_LABEL_Y,
      'text-anchor': 'end',
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    svg.appendChild(sumText);
    const spreadText = el('text', {
      x: RIGHT_L,
      y: SEG_LABEL_Y,
      fill: c.itemActive,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    svg.appendChild(spreadText);
    const acrossText = el('text', {
      x: RIGHT_R,
      y: SEG_LABEL_Y,
      'text-anchor': 'end',
      fill: c.auxCursor,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    svg.appendChild(acrossText);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    svg.appendChild(caption);

    // ── 상태
    let cx = 0;
    let cy = 0;
    let total = 0;
    let angleDeg = 0;
    let drop = 0;
    let mateGrow = 0;
    const coarse: Array<{ deg: number; value: number }> = [];
    let fineAngles: number[] = [];
    let fineValues: number[] = [];
    /** 성긴 훑기가 도는 동안에만 자취가 읽개를 따라 자란다. */
    let tracing = true;

    const plotY = (v: number): number =>
      total > 0 ? CURVE_BASE - (v / (total * HEADROOM)) * CURVE_H : CURVE_BASE;

    /** 촘촘한 곡선 위의 값. 아직 없으면 null. */
    function fineAt(deg: number): number | null {
      if (fineAngles.length < 2) return null;
      const first = fineAngles[0] ?? 0;
      const step = (fineAngles[1] ?? 1) - first;
      if (step <= 0) return null;
      const raw = (deg - first) / step;
      const i = Math.max(0, Math.min(fineAngles.length - 2, Math.floor(raw)));
      const k = Math.max(0, Math.min(1, raw - i));
      const a = fineValues[i];
      const b = fineValues[i + 1];
      if (typeof a !== 'number' || typeof b !== 'number') return null;
      return lerp(a, b, k);
    }

    /** 축·자국·띠·막대·읽개를 지금 상태대로 다시 그린다. */
    function paint(variance: number, across: number): void {
      const rad = angleDeg * DEG;
      const ux = Math.cos(rad);
      const uy = -Math.sin(rad);
      const ox = toPx(cx);
      const oy = toPy(cy);

      axisLine.setAttribute('x1', String(ox - ux * REACH));
      axisLine.setAttribute('y1', String(oy - uy * REACH));
      axisLine.setAttribute('x2', String(ox + ux * REACH));
      axisLine.setAttribute('y2', String(oy + uy * REACH));
      axisLine.setAttribute('visibility', 'visible');

      const half = Math.sqrt(Math.max(variance, 0)) * scale * drop;
      band.setAttribute('x1', String(ox - ux * half));
      band.setAttribute('y1', String(oy - uy * half));
      band.setAttribute('x2', String(ox + ux * half));
      band.setAttribute('y2', String(oy + uy * half));
      band.setAttribute('visibility', drop > 0 ? 'visible' : 'hidden');

      scene.points.forEach((p, i) => {
        const px = toPx(p.x);
        const py = toPy(p.y);
        const tAlong = (p.x - cx) * Math.cos(rad) + (p.y - cy) * Math.sin(rad);
        const fx = ox + ux * tAlong * scale;
        const fy = oy + uy * tAlong * scale;
        const lx = lerp(px, fx, drop);
        const ly = lerp(py, fy, drop);
        const foot = feet[i];
        const link = connectors[i];
        if (foot) {
          foot.setAttribute('cx', String(lx));
          foot.setAttribute('cy', String(ly));
          foot.setAttribute('visibility', drop > 0 ? 'visible' : 'hidden');
        }
        if (link) {
          link.setAttribute('x1', String(px));
          link.setAttribute('y1', String(py));
          link.setAttribute('x2', String(lx));
          link.setAttribute('y2', String(ly));
          link.setAttribute('visibility', drop > 0 ? 'visible' : 'hidden');
        }
      });

      if (mateGrow > 0) {
        const mx = Math.cos((angleDeg + 90) * DEG);
        const my = -Math.sin((angleDeg + 90) * DEG);
        const reach = REACH * mateGrow;
        mateLine.setAttribute('x1', String(ox - mx * reach));
        mateLine.setAttribute('y1', String(oy - my * reach));
        mateLine.setAttribute('x2', String(ox + mx * reach));
        mateLine.setAttribute('y2', String(oy + my * reach));
        mateLine.setAttribute('visibility', 'visible');
        const mHalf = Math.sqrt(Math.max(across, 0)) * scale * mateGrow;
        mateBand.setAttribute('x1', String(ox - mx * mHalf));
        mateBand.setAttribute('y1', String(oy - my * mHalf));
        mateBand.setAttribute('x2', String(ox + mx * mHalf));
        mateBand.setAttribute('y2', String(oy + my * mHalf));
        mateBand.setAttribute('visibility', 'visible');
      }

      angleText.textContent = `θ = ${angleDeg.toFixed(1)}°`;

      if (total > 0) {
        const wLeft = (variance / total) * (RIGHT_R - RIGHT_L);
        barLeft.setAttribute('width', String(Math.max(0, wLeft)));
        barRight.setAttribute('x', String(RIGHT_L + wLeft));
        barRight.setAttribute('width', String(Math.max(0, RIGHT_R - RIGHT_L - wLeft)));
        ceilingLine.setAttribute('y1', String(plotY(total)));
        ceilingLine.setAttribute('y2', String(plotY(total)));
        ceilingLine.setAttribute('visibility', 'visible');
        sumText.textContent = t('label.sumValue', 'sum = {v}', { v: total.toFixed(2) });
        spreadText.textContent = t('label.spreadValue', 'spread = {v}', { v: variance.toFixed(2) });
        acrossText.textContent = t('label.acrossValue', 'across = {v}', { v: across.toFixed(2) });

        const hx = plotX(angleDeg);
        const hy = plotY(variance);
        head.setAttribute('cx', String(hx));
        head.setAttribute('cy', String(hy));
        head.setAttribute('visibility', 'visible');
        headDrop.setAttribute('x1', String(hx));
        headDrop.setAttribute('y1', String(hy));
        headDrop.setAttribute('x2', String(hx));
        headDrop.setAttribute('y2', String(CURVE_BASE));
        headDrop.setAttribute('visibility', 'visible');
        if (tracing) {
          coarseLine.setAttribute(
            'points',
            [...coarse.map((s) => `${plotX(s.deg)},${plotY(s.value)}`), `${hx},${hy}`].join(' '),
          );
        }
      }
    }

    function fineD(): { d: string; length: number } {
      const pts = fineAngles.map((deg, i) => ({ x: plotX(deg), y: plotY(fineValues[i] ?? 0) }));
      let length = 0;
      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1];
        const b = pts[i];
        if (!a || !b) continue;
        length += Math.hypot(b.x - a.x, b.y - a.y);
      }
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
      return { d, length: Math.max(length, 1) };
    }

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 축이 지날 가운데를 잡는다. 고리가 조여들며 자리를 짚는다. */
      showCenter(nx: number, ny: number): Promise<void> {
        cx = nx;
        cy = ny;
        const ox = toPx(cx);
        const oy = toPy(cy);
        centerRing.setAttribute('cx', String(ox));
        centerRing.setAttribute('cy', String(oy));
        centerDot.setAttribute('cx', String(ox));
        centerDot.setAttribute('cy', String(oy));
        centerRing.setAttribute('visibility', 'visible');
        return animate(CENTER_MS, (k) => {
          centerRing.setAttribute('r', String(lerp(46, 8, k)));
          if (k > 0.55) centerDot.setAttribute('visibility', 'visible');
        });
      },

      /**
       * 축을 새 각도로 돌린다. 첫 걸음에서는 돌리는 대신 자국이 점에서
       * 축까지 내려앉는다 — 잴 것이 무엇인지 먼저 보여야 하기 때문이다.
       */
      turnTo(nextDeg: number, variance: number, across: number, nextTotal: number): Promise<void> {
        total = nextTotal;
        const fromDeg = angleDeg;
        const fromDrop = drop;
        const fromVar = coarse.length > 0 ? (coarse[coarse.length - 1]?.value ?? variance) : variance;
        const fromAcross = total - fromVar;
        const commit = (): void => {
          coarse.push({ deg: nextDeg, value: variance });
          const dot = el('circle', {
            cx: plotX(nextDeg),
            cy: plotY(variance),
            r: 2.6,
            fill: c.itemActive,
          });
          coarseDots.appendChild(dot);
        };
        return animate(TURN_MS, (k) => {
          angleDeg = lerp(fromDeg, nextDeg, k);
          drop = lerp(fromDrop, 1, k);
          paint(lerp(fromVar, variance, k), lerp(fromAcross, across, k));
          if (k >= 1) {
            angleDeg = nextDeg;
            drop = 1;
            paint(variance, across);
            commit();
            coarseLine.setAttribute(
              'points',
              coarse.map((s) => `${plotX(s.deg)},${plotY(s.value)}`).join(' '),
            );
          }
        });
      },

      /**
       * 성긴 자국 사이를 촘촘히 메우고, 축은 봉우리로 되돌아가 멈춘다.
       * 읽개는 그 동안 촘촘한 곡선 위를 그대로 타고 간다.
       */
      narrowTo(
        peakDeg: number,
        variance: number,
        across: number,
        nextTotal: number,
        angles: number[],
        values: number[],
      ): Promise<void> {
        total = nextTotal;
        fineAngles = angles;
        fineValues = values;
        const { d, length } = fineD();
        finePath.setAttribute('d', d);
        finePath.setAttribute('stroke-dasharray', `${length} ${length}`);
        finePath.setAttribute('stroke-dashoffset', String(length));
        finePath.setAttribute('visibility', 'visible');
        // 자취는 여기서 멈춘다 — 촘촘한 곡선이 그 자리를 넘겨받는다.
        tracing = false;
        coarseLine.setAttribute('stroke', c.border);
        coarseLine.setAttribute(
          'points',
          coarse.map((s) => `${plotX(s.deg)},${plotY(s.value)}`).join(' '),
        );
        const fromDeg = angleDeg;
        const peakY = plotY(variance);
        const peakXp = plotX(peakDeg);
        peakTick.setAttribute('x1', String(peakXp));
        peakTick.setAttribute('x2', String(peakXp));
        peakDot.setAttribute('cx', String(peakXp));
        peakDot.setAttribute('cy', String(peakY));
        return animate(NARROW_MS, (k) => {
          finePath.setAttribute(
            'stroke-dashoffset',
            String(length * (1 - Math.min(1, k / 0.6))),
          );
          angleDeg = lerp(fromDeg, peakDeg, k);
          const v = fineAt(angleDeg) ?? lerp(fineAt(fromDeg) ?? variance, variance, k);
          paint(v, total - v);
          const grow = Math.max(0, (k - 0.7) / 0.3);
          if (grow > 0) {
            peakTick.setAttribute('y1', String(CURVE_BASE));
            peakTick.setAttribute('y2', String(lerp(CURVE_BASE, peakY, grow)));
            peakTick.setAttribute('visibility', 'visible');
            peakDot.setAttribute('visibility', grow > 0.9 ? 'visible' : 'hidden');
          }
          if (k >= 1) {
            angleDeg = peakDeg;
            paint(variance, across);
          }
        });
      },

      /** 멈춘 자리에서 직각 방향을 함께 내보인다 — 한쪽이 늘면 다른 쪽이 준다. */
      settle(finalDeg: number, variance: number, across: number, nextTotal: number): Promise<void> {
        total = nextTotal;
        angleDeg = finalDeg;
        return animate(SETTLE_MS, (k) => {
          mateGrow = k;
          paint(variance, across);
        });
      },

      /** 처음으로 되돌린다. 한 걸음씩 되짚기 위한 것이다 (S-piece). */
      rewind(): void {
        total = 0;
        angleDeg = 0;
        drop = 0;
        mateGrow = 0;
        coarse.length = 0;
        tracing = true;
        fineAngles = [];
        fineValues = [];
        coarseDots.textContent = '';
        coarseLine.setAttribute('points', '');
        coarseLine.setAttribute('stroke', c.itemActive);
        finePath.setAttribute('visibility', 'hidden');
        for (const node of [axisLine, mateLine, band, mateBand, centerRing, centerDot, head, headDrop, peakTick, peakDot, ceilingLine]) {
          node.setAttribute('visibility', 'hidden');
        }
        for (const node of [...feet, ...connectors]) node.setAttribute('visibility', 'hidden');
        barLeft.setAttribute('width', '0');
        barRight.setAttribute('width', '0');
        angleText.textContent = '';
        sumText.textContent = '';
        spreadText.textContent = '';
        acrossText.textContent = '';
      },
    };
  },
};
