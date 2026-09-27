/**
 * brdf 무대 — 왼쪽은 면과 윗반구 · 법선을 따라 내려오는 빛 · 로브(제 봉우리로 나눈 단면) · 반폭각 살,
 * 오른쪽은 막대 둘(봉우리 — 로그 축, 총량 — 들어온 빛 1 선).
 *
 * 무대는 payload 로 받은 것만 그린다 — 봉우리 · 총량 · 로브 표본 · 반폭각 · 축 눈금은 algorithm 이 셈해 보낸다.
 *
 * 운동 (손잡이를 돌린 뒤 새 판에서):
 *   - 판 머리: 앞 판 로브가 점선 자리로 남고, 막대 채움은 걷히고 앞 판 높이에 눈금만 남는다.
 *     PBR 이면 면의 미세면 요철이 거칠기만큼 솟거나 가라앉는다(퐁이면 평평해진다)
 *   - 봉우리: 막대가 앞 판 높이에서 새 높이로 옮겨 간다
 *   - 로브: 앞 판 모양에서 새 모양으로 좁아지거나 넓어지고, 반폭각 살이 앞 판 각에서 새 각으로 접힌다
 *   - 총량: 막대가 앞 판 높이에서 새 높이로, 들어온 빛 선 위의 몫은 경고색
 * 운동 길이는 projector 가 재생 속도로 나눠 건넨다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type BrdfTick = { label: string; frac: number };

export type BrdfInitView = {
  model: 'phong' | 'pbr';
  n: number;
  alpha: number;
  roughness: number;
  peakTicks: BrdfTick[];
  totalTicks: BrdfTick[];
  incomingFrac: number;
};

export type BrdfPeakView = { peak: number; peakFrac: number };
export type BrdfLobeView = { samples: { deg: number; shape: number }[]; halfWidthDeg: number; halfLevel: number };
export type BrdfIntegrateView = { total: number; totalFrac: number; incomingFrac: number; exceeds: boolean };

export type BrdfStage = ViewInstance & {
  reset(): void;
  showInit(p: BrdfInitView, ms: number): void;
  showPeak(p: BrdfPeakView, ms: number): void;
  showLobe(p: BrdfLobeView, ms: number): void;
  showIntegrate(p: BrdfIntegrateView, ms: number): void;
  setCaption(text: string): void;
};

const W = 680;
const H = 360;
// 로브 판
const CX = 190;
const CY = 245;
const R = 165;
const SURF_L = 20;
const SURF_R = 360;
const BUMP_PERIOD = 16;
const BUMP_MAX = 12;
// 막대
const BAR_TOP = 60;
const BAR_BOTTOM = 245;
const BAR_W = 44;
const PEAK_X = 450;
const TOTAL_X = 570;

const NS = 'http://www.w3.org/2000/svg';

function fmt3(v: number): string {
  const s = v.toFixed(3);
  return s === '-0.000' ? '0.000' : s;
}

const MODEL_TONE: Record<string, number> = { phong: 0, pbr: 1 };

export const brdfStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): BrdfStage {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const tones = categorical(2, 'vivid');
    const isInstant = params.isInstant ?? (() => false);
    const svg = params.canvas;
    const smPx = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (parent: SVGElement, x: number, y: number, s: string, attrs: Record<string, string | number> = {}) => {
      const node = el(
        'text',
        { x, y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, ...attrs },
        parent,
      );
      node.textContent = s;
      return node;
    };

    const root = el('g', { 'data-role': 'brdf-stage' }, svg);

    // ── 늘 있는 틀: 반구 · 면 · 빛 화살 · 막대 틀 ─────────────────────────────
    const frame = el('g', {}, root);
    el(
      'path',
      {
        d: `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`,
        fill: 'none',
        stroke: c.border,
        'stroke-dasharray': '2 4',
      },
      frame,
    );
    el('line', { x1: CX, y1: CY, x2: CX, y2: CY - R - 8, stroke: c.border, 'stroke-dasharray': '4 3' }, frame);
    const bumps = el('path', { fill: c.bgSubtle, stroke: c.textMuted, 'stroke-width': 1 }, frame);
    el('line', { x1: SURF_L, y1: CY, x2: SURF_R, y2: CY, stroke: c.text, 'stroke-width': 2 }, frame);
    // 빛 — 법선을 따라 내려온다
    const arrowTop = CY - R - 30;
    el('line', { x1: CX - 22, y1: arrowTop, x2: CX - 22, y2: CY - 6, stroke: c.accent, 'stroke-width': 3 }, frame);
    el('path', { d: `M ${CX - 28} ${CY - 16} L ${CX - 22} ${CY - 4} L ${CX - 16} ${CY - 16} Z`, fill: c.accent }, frame);
    text(frame, CX - 28, arrowTop + 4, t('label.light', 'Light'), { 'text-anchor': 'end', fill: c.textMuted });
    for (const x of [PEAK_X, TOTAL_X]) {
      el('rect', { x, y: BAR_TOP, width: BAR_W, height: BAR_BOTTOM - BAR_TOP, fill: 'none', stroke: c.border }, frame);
    }
    text(frame, PEAK_X + BAR_W / 2, BAR_BOTTOM + 20, t('label.peak', 'Peak'), { 'text-anchor': 'middle' });
    text(frame, TOTAL_X + BAR_W / 2, BAR_BOTTOM + 20, t('label.total', 'Total'), { 'text-anchor': 'middle' });

    // ── 판마다 다시 짓는 층 ────────────────────────────────────────────────
    const axisLayer = el('g', {}, root);
    const ghostLayer = el('g', {}, root);
    const lobeLayer = el('g', {}, root);
    const barLayer = el('g', {}, root);
    const infoLayer = el('g', {}, root);
    const caption = text(root, W / 2, H - 14, '', { 'text-anchor': 'middle', fill: c.text });

    // ── 운동 ─────────────────────────────────────────────────────────────
    const frames = new Map<string, number>();
    const finals = new Map<string, () => void>();
    let destroyed = false;
    const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
    const tween = (key: string, ms: number, apply: (k: number) => void): void => {
      const running = frames.get(key);
      if (running !== undefined) cancelAnimationFrame(running);
      frames.delete(key);
      finals.delete(key);
      if (ms <= 0 || destroyed || isInstant() || typeof requestAnimationFrame !== 'function') {
        apply(1);
        return;
      }
      apply(0);
      const start = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, Math.max(0, (now - start) / ms));
        apply(ease(k));
        if (k < 1) frames.set(key, requestAnimationFrame(tick));
        else {
          frames.delete(key);
          finals.delete(key);
        }
      };
      finals.set(key, () => apply(1));
      frames.set(key, requestAnimationFrame(tick));
    };
    const stopAll = (finish: boolean): void => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
      if (finish) for (const f of finals.values()) f();
      finals.clear();
    };
    params.onScrubStart?.(() => stopAll(true));

    // ── 운동의 기억 (자리) ────────────────────────────────────────────────
    type Memory = {
      lobe: number[] | null;
      lobeDeg: number[] | null;
      half: number | null;
      peakFrac: number | null;
      totalFrac: number | null;
      bump: number;
    };
    const blank = (): Memory => ({ lobe: null, lobeDeg: null, half: null, peakFrac: null, totalFrac: null, bump: 0 });
    let mem = blank();
    let tone = c.text;
    let incomingFrac: number | null = null;

    const clear = (g: SVGElement) => {
      while (g.firstChild) g.removeChild(g.firstChild);
    };
    const barY = (frac: number) => BAR_BOTTOM - frac * (BAR_BOTTOM - BAR_TOP);
    const polar = (deg: number, r: number): [number, number] => {
      const a = (deg * Math.PI) / 180;
      return [CX + Math.sin(a) * r, CY - Math.cos(a) * r];
    };
    const lobePath = (degs: number[], shapes: number[]): string => {
      // ±90° 에서 0 으로 닫는다 — 면 위 원점
      const pts = [`M ${CX} ${CY}`];
      degs.forEach((d, i) => {
        const [x, y] = polar(d, shapes[i] * R);
        pts.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
      });
      pts.push('Z');
      return pts.join(' ');
    };
    const bumpPath = (amp: number): string => {
      const pts = [`M ${SURF_L} ${CY}`];
      for (let x = SURF_L; x < SURF_R; x += BUMP_PERIOD) {
        pts.push(`L ${x + BUMP_PERIOD / 2} ${(CY + amp * BUMP_MAX).toFixed(2)}`, `L ${x + BUMP_PERIOD} ${CY}`);
      }
      pts.push('Z');
      return pts.join(' ');
    };
    bumps.setAttribute('d', bumpPath(0));

    const ghostTick = (x: number, frac: number) => {
      el(
        'line',
        {
          x1: x - 6,
          y1: barY(frac),
          x2: x + BAR_W + 6,
          y2: barY(frac),
          stroke: c.ghostOutline,
          'stroke-width': 2,
          'stroke-dasharray': '4 3',
          'data-role': 'ghost-tick',
        },
        ghostLayer,
      );
    };

    const reset = (): void => {
      stopAll(false);
      for (const g of [axisLayer, ghostLayer, lobeLayer, barLayer, infoLayer]) clear(g);
      caption.textContent = '';
      mem = blank();
      tone = c.text;
      incomingFrac = null;
      bumps.setAttribute('d', bumpPath(0));
    };

    const stage: BrdfStage = {
      reset,
      setCaption(s: string) {
        caption.textContent = s;
      },
      showInit(p, ms) {
        // 멱등 — 들어오면 이 판의 층을 비우고 다시 짓는다. 앞 판의 결론은 걷고 자리만 남긴다
        stopAll(false);
        for (const g of [axisLayer, ghostLayer, lobeLayer, barLayer, infoLayer]) clear(g);
        const toneIdx = MODEL_TONE[p.model];
        if (toneIdx === undefined) throw new Error(`brdf-stage: 모르는 모형 ${p.model}`);
        tone = tones[toneIdx];
        incomingFrac = p.incomingFrac;

        // 축 — 봉우리 로그 눈금 · 총량 눈금 · 들어온 빛 선
        for (const tk of p.peakTicks) {
          const y = barY(tk.frac);
          el('line', { x1: PEAK_X - 4, y1: y, x2: PEAK_X, y2: y, stroke: c.textMuted }, axisLayer);
          text(axisLayer, PEAK_X - 7, y + smPx / 3, tk.label, {
            'text-anchor': 'end',
            fill: c.textMuted,
            'font-size': fontSizes.xs,
          });
        }
        for (const tk of p.totalTicks) {
          const y = barY(tk.frac);
          el('line', { x1: TOTAL_X - 4, y1: y, x2: TOTAL_X, y2: y, stroke: c.textMuted }, axisLayer);
          text(axisLayer, TOTAL_X - 7, y + smPx / 3, tk.label, {
            'text-anchor': 'end',
            fill: c.textMuted,
            'font-size': fontSizes.xs,
          });
        }
        const yIn = barY(p.incomingFrac);
        el(
          'line',
          { x1: TOTAL_X - 4, y1: yIn, x2: TOTAL_X + BAR_W + 6, y2: yIn, stroke: c.text, 'stroke-width': 1.5, 'stroke-dasharray': '6 3' },
          axisLayer,
        );
        text(axisLayer, TOTAL_X + BAR_W + 9, yIn + smPx / 3, t('label.incoming', 'Incoming'), {
          fill: c.text,
          'font-size': fontSizes.xs,
        });

        // 앞 판의 자리 — 점선 로브 · 막대 높이 눈금
        if (mem.lobe && mem.lobeDeg) {
          el(
            'path',
            {
              d: lobePath(mem.lobeDeg, mem.lobe),
              fill: 'none',
              stroke: c.ghostOutline,
              'stroke-width': 1.5,
              'stroke-dasharray': '5 4',
              'data-role': 'ghost-lobe',
            },
            ghostLayer,
          );
        }
        if (mem.peakFrac !== null) ghostTick(PEAK_X, mem.peakFrac);
        if (mem.totalFrac !== null) ghostTick(TOTAL_X, mem.totalFrac);

        // 모형 · 광택 표지 — 이름 글자와 면의 미세면 요철
        const modelName = p.model === 'phong' ? t('label.phong', 'Phong') : t('label.pbr', 'PBR');
        text(infoLayer, SURF_L, CY + 32, modelName, { fill: tone, 'font-weight': 700, 'font-size': fontSizes.md });
        text(infoLayer, SURF_L + 60, CY + 32, t('stage.gloss', 'Gloss n = {n}', { n: p.n }), {});
        if (p.model === 'pbr') {
          text(
            infoLayer,
            SURF_L,
            CY + 52,
            t('stage.roughness', 'α = {alpha} · roughness = {roughness}', {
              alpha: fmt3(p.alpha),
              roughness: fmt3(p.roughness),
            }),
            { fill: c.textMuted },
          );
        }
        const fromBump = mem.bump;
        const toBump = p.model === 'pbr' ? p.roughness : 0;
        mem.bump = toBump;
        tween('bump', ms, (k) => bumps.setAttribute('d', bumpPath(fromBump + (toBump - fromBump) * k)));
      },
      showPeak(p, ms) {
        const from = mem.peakFrac ?? 0;
        mem.peakFrac = p.peakFrac;
        // 거울 방향의 점
        const [dx, dy] = polar(0, R);
        el('circle', { cx: dx, cy: dy, r: 5, fill: tone, stroke: c.bg, 'stroke-width': 1.5, 'data-role': 'peak-dot' }, lobeLayer);
        text(lobeLayer, dx + 9, dy - 6, 'θ = 0°', { fill: c.textMuted, 'font-size': fontSizes.xs });
        const bar = el('rect', { x: PEAK_X, width: BAR_W, fill: tone, 'data-role': 'peak-bar' }, barLayer);
        text(barLayer, PEAK_X + BAR_W / 2, BAR_BOTTOM + 38, fmt3(p.peak), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'data-role': 'peak-value',
        });
        tween('peak', ms, (k) => {
          const f = from + (p.peakFrac - from) * k;
          const y = barY(f);
          bar.setAttribute('y', y.toFixed(2));
          bar.setAttribute('height', (BAR_BOTTOM - y).toFixed(2));
        });
      },
      showLobe(p, ms) {
        const degs = p.samples.map((s) => s.deg);
        const to = p.samples.map((s) => s.shape);
        const sameGrid =
          mem.lobe !== null && mem.lobeDeg !== null && mem.lobeDeg.length === degs.length && mem.lobeDeg.every((d, i) => d === degs[i]);
        const from = sameGrid && mem.lobe ? mem.lobe : to.map(() => 0);
        const fromHalf = mem.half ?? 90;
        mem.lobe = to;
        mem.lobeDeg = degs;
        mem.half = p.halfWidthDeg;

        const lobe = el(
          'path',
          { fill: tone, 'fill-opacity': 0.18, stroke: tone, 'stroke-width': 2.5, 'data-role': 'lobe' },
          lobeLayer,
        );
        const ribs = el('g', { 'data-role': 'half-width' }, lobeLayer);
        const ribL = el('line', { x1: CX, y1: CY, stroke: c.text, 'stroke-width': 1.5 }, ribs);
        const ribR = el('line', { x1: CX, y1: CY, stroke: c.text, 'stroke-width': 1.5 }, ribs);
        const dotL = el('circle', { r: 3.5, fill: c.text }, ribs);
        const dotR = el('circle', { r: 3.5, fill: c.text }, ribs);
        const arc = el('path', { fill: 'none', stroke: c.text, 'stroke-width': 1 }, ribs);
        const ribText = text(ribs, 0, 0, t('label.halfWidth', 'Half-width'), { 'font-size': fontSizes.xs });
        const ribLen = R + 14;
        tween('lobe', ms, (k) => {
          lobe.setAttribute('d', lobePath(degs, to.map((s, i) => from[i] + (s - from[i]) * k)));
          const h = fromHalf + (p.halfWidthDeg - fromHalf) * k;
          const [xr, yr] = polar(h, ribLen);
          const [xl, yl] = polar(-h, ribLen);
          ribR.setAttribute('x2', xr.toFixed(2));
          ribR.setAttribute('y2', yr.toFixed(2));
          ribL.setAttribute('x2', xl.toFixed(2));
          ribL.setAttribute('y2', yl.toFixed(2));
          const [hxr, hyr] = polar(h, p.halfLevel * R);
          const [hxl, hyl] = polar(-h, p.halfLevel * R);
          dotR.setAttribute('cx', hxr.toFixed(2));
          dotR.setAttribute('cy', hyr.toFixed(2));
          dotL.setAttribute('cx', hxl.toFixed(2));
          dotL.setAttribute('cy', hyl.toFixed(2));
          const [axr, ayr] = polar(h, 34);
          const [axl, ayl] = polar(-h, 34);
          arc.setAttribute('d', `M ${axl.toFixed(2)} ${ayl.toFixed(2)} A 34 34 0 0 1 ${axr.toFixed(2)} ${ayr.toFixed(2)}`);
          ribText.setAttribute('x', (hxr + 8).toFixed(2));
          ribText.setAttribute('y', (hyr + 4).toFixed(2));
        });
      },
      showIntegrate(p, ms) {
        if (incomingFrac === null) throw new Error('brdf-stage: 판 머리(init) 없이 총량이 왔다');
        const from = mem.totalFrac ?? 0;
        mem.totalFrac = p.totalFrac;
        const inFrac = p.incomingFrac;
        const under = el('rect', { x: TOTAL_X, width: BAR_W, fill: tone, 'data-role': 'total-bar' }, barLayer);
        const over = el('rect', { x: TOTAL_X, width: BAR_W, fill: c.danger, 'data-role': 'total-over' }, barLayer);
        text(barLayer, TOTAL_X + BAR_W / 2, BAR_BOTTOM + 38, fmt3(p.total), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'data-role': 'total-value',
        });
        if (p.exceeds) {
          text(barLayer, TOTAL_X + BAR_W / 2, BAR_BOTTOM + 56, t('label.over', 'More than arrived'), {
            'text-anchor': 'middle',
            fill: c.danger,
            'font-weight': 700,
            'font-size': fontSizes.xs,
            'data-role': 'over-mark',
          });
        }
        tween('total', ms, (k) => {
          const f = from + (p.totalFrac - from) * k;
          const lowTop = barY(Math.min(f, inFrac));
          under.setAttribute('y', lowTop.toFixed(2));
          under.setAttribute('height', (BAR_BOTTOM - lowTop).toFixed(2));
          const top = barY(f);
          const overH = f > inFrac ? barY(inFrac) - top : 0;
          over.setAttribute('y', top.toFixed(2));
          over.setAttribute('height', overH.toFixed(2));
        });
      },
      destroy() {
        destroyed = true;
        stopAll(false);
        root.remove();
      },
    };
    return stage;
  },
};
