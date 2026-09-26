/**
 * gan 무대 — 두 봉우리의 진짜 앞에서 가짜 넷이 D 곡선을 따라 옮겨 간다.
 *
 * 위에서 아래로
 *   머리      지금 걸음의 문안 · 라운드 · 덧말(건너뛴 라운드 · 판의 끝)
 *   D 곡선    가려내는 쪽이 x 마다 매기는 점수 (0 .. 1). 가려냄 걸음에서 모양을 바꾼다
 *   두 줄     진짜 넷(제자리) · 가짜 넷(만듦 걸음에서 곡선을 따라 옮겨 간다) · 0 의 경계와 쪽별 개수
 *   자취      보인 만듦 걸음마다 가짜 넷의 자리를 한 줄씩 — 봉우리로 끌려가 지나쳤다가 되돌아오며 좁혀지는 길
 *   읽기      a · b · 퍼짐 / v · c
 *
 * 무대는 셈하지 않는다 — 곡선 표본 · 쪽 · 퍼짐 · 높은 쪽 판정은 payload 로 받는다. 운동은 rAF 로
 * 앞 모습에서 새 모습으로 잇고, 길이는 projector 가 재생 속도로 나눠 건넨다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type GanStageSide = 'left' | 'right' | 'none';

export type GanFrame = {
  round: number;
  a: number;
  b: number;
  fakes: number[];
  left: number;
  right: number;
  spread: number;
  mean: number;
  dpar: number[];
  dLeft: number;
  dRight: number;
  higher: GanStageSide;
  curve: number[];
};

export type GanInitFrame = GanFrame & {
  real: number[];
  centers: number[];
  xRange: [number, number];
  start: number;
  rounds: number;
  showEvery: number;
};

export type GanStage = {
  init(f: GanInitFrame, ms: number): Promise<void>;
  discriminate(f: GanFrame, skipped: number[], ms: number): Promise<void>;
  generate(f: GanFrame, final: boolean, oneSide: GanStageSide, ms: number): Promise<void>;
};

const W = 720;
const H = 452;
const PL = 78;
const PR = W - 30;
const Y_NOTE = 44;
const Y_PEAK = 66;
const Y_D1 = 84;
const Y_D0 = 196;
const Y_AXIS = 212;
const Y_REAL = 246;
const Y_FAKE = 268;
const Y_COUNT = 292;
const Y_TRACE_TITLE = 316;
const Y_TRACE0 = 332;
const Y_TRACE1 = 416;
const Y_READ = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 표시 규칙 — toFixed(d), 표시가 0 이 되는 음수는 부호를 뗀다, 음수 부호는 U+2212. */
function fmt(x: number, d: number): string {
  const s = x.toFixed(d);
  if (Number(s) === 0) return s.replace('-', '');
  return s.replace('-', '−');
}

/** 데이터 값은 적힌 모양 그대로 (0.4 · −2.3). */
function raw(x: number): string {
  return String(x).replace('-', '−');
}

type Pose = { curve: number[]; fakes: number[] };

export const ganStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const [realInk, fakeInk] = categorical(2, 'vivid');
    const smPx = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, anchor: string, size: string, fill: string, parent: Element = svg) =>
      el('text', { x, y, 'text-anchor': anchor, 'font-family': fonts.body, 'font-size': size, fill }, parent);

    // 머리 — 마운트에서 바로 자리를 잡는다 (자료가 없어도 던지지 않는다)
    const title = text(20, 24, 'start', fontSizes.md, c.text);
    title.setAttribute('font-weight', '600');
    const roundLabel = text(W - 20, 24, 'end', fontSizes.sm, c.textMuted);
    const note = text(20, Y_NOTE, 'start', fontSizes.sm, c.textMuted);

    // 판마다 다시 짓는 층 (축 · 진짜 · 가짜 · 자취)
    const layer = el('g', {});

    let geo: {
      x0: number;
      x1: number;
      real: number[];
      centers: number[];
      rows: number;
      showEvery: number;
    } | null = null;
    let curveLine: SVGPolylineElement | null = null;
    let fakeDots: SVGCircleElement[] = [];
    let peakLeft: SVGTextElement | null = null;
    let peakRight: SVGTextElement | null = null;
    let peakMark: SVGPathElement | null = null;
    let countLeft: SVGTextElement | null = null;
    let countRight: SVGTextElement | null = null;
    let traceLayer: SVGGElement | null = null;
    let readG: SVGTextElement | null = null;
    let readD: SVGTextElement | null = null;
    let pose: Pose | null = null;

    const need = <T>(v: T | null, name: string): T => {
      if (v === null) throw new Error(`gan-stage: ${name} 가 아직 없다 — init 이 먼저 와야 한다`);
      return v;
    };
    const X = (x: number): number => {
      const g = need(geo, 'geo');
      return PL + ((x - g.x0) / (g.x1 - g.x0)) * (PR - PL);
    };
    const Yd = (d: number): number => Y_D0 - d * (Y_D0 - Y_D1);
    const traceY = (row: number): number => {
      const g = need(geo, 'geo');
      const gap = g.rows > 1 ? (Y_TRACE1 - Y_TRACE0) / (g.rows - 1) : 0;
      return Y_TRACE0 + row * gap;
    };

    const draw = (p: Pose) => {
      const g = need(geo, 'geo');
      const n = p.curve.length;
      const pts: string[] = [];
      for (let i = 0; i < n; i++) {
        const x = g.x0 + (i * (g.x1 - g.x0)) / (n - 1);
        pts.push(`${X(x).toFixed(1)},${Yd(p.curve[i]).toFixed(1)}`);
      }
      need(curveLine, 'curve').setAttribute('points', pts.join(' '));
      if (p.fakes.length !== fakeDots.length) throw new Error('gan-stage: 가짜 수가 판 머리와 다르다');
      p.fakes.forEach((x, i) => fakeDots[i].setAttribute('cx', X(x).toFixed(1)));
    };

    // 운동 — 앞 모습에서 새 모습으로
    let anim: { raf: number | null; timer: ReturnType<typeof setTimeout> | null; finish: () => void } | null = null;
    const stopAnim = () => {
      if (anim) anim.finish();
    };
    const move = (to: Pose, ms: number): Promise<void> => {
      stopAnim();
      const from = pose;
      pose = to;
      if (from === null || ms <= 0 || typeof requestAnimationFrame !== 'function') {
        draw(to);
        return Promise.resolve();
      }
      if (from.curve.length !== to.curve.length || from.fakes.length !== to.fakes.length) {
        throw new Error('gan-stage: 앞 모습과 새 모습의 모양이 다르다');
      }
      return new Promise<void>((resolve) => {
        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const me = {
          raf: null as number | null,
          timer: null as ReturnType<typeof setTimeout> | null,
          finish: () => {
            if (me.raf !== null) cancelAnimationFrame(me.raf);
            if (me.timer !== null) clearTimeout(me.timer);
            me.raf = null;
            me.timer = null;
            if (anim === me) anim = null;
            draw(to);
            resolve();
          },
        };
        anim = me;
        const step = (now: number) => {
          if (anim !== me) return;
          const u = Math.min(1, (now - t0) / ms);
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          draw({
            curve: from.curve.map((v, i) => v + (to.curve[i] - v) * e),
            fakes: from.fakes.map((v, i) => v + (to.fakes[i] - v) * e),
          });
          if (u < 1) me.raf = requestAnimationFrame(step);
          else me.finish();
        };
        me.raf = requestAnimationFrame(step);
        me.timer = setTimeout(() => me.finish(), ms + 200);
      });
    };

    const build = (f: GanInitFrame) => {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      if (f.centers.length !== 3) throw new Error('gan-stage: 가운데가 셋이 아니다');
      geo = {
        x0: f.xRange[0],
        x1: f.xRange[1],
        real: f.real,
        centers: f.centers,
        rows: f.rounds / f.showEvery + 1,
        showEvery: f.showEvery,
      };
      // D 축
      for (const [d, label] of [
        [0, '0'],
        [0.5, '0.5'],
        [1, '1'],
      ] as const) {
        const line = el('line', { x1: PL, x2: PR, y1: Yd(d), y2: Yd(d), stroke: c.border, 'stroke-width': 1 }, layer);
        if (d === 0.5) line.setAttribute('stroke-dasharray', '4 4');
        text(PL - 8, Yd(d) + smPx / 3, 'end', fontSizes.xs, c.textMuted, layer).textContent = label;
      }
      text(PL - 8, Y_D1 - 8, 'end', fontSizes.sm, c.text, layer).textContent = 'D(x)';
      // 가운데 셋의 안내선
      for (const m of f.centers) {
        el('line', { x1: X(m), x2: X(m), y1: Y_D1, y2: Y_FAKE + 10, stroke: c.border, 'stroke-dasharray': '1 3' }, layer);
      }
      // x 축과 0 의 경계
      el('line', { x1: PL, x2: PR, y1: Y_AXIS, y2: Y_AXIS, stroke: c.textMuted, 'stroke-width': 1 }, layer);
      for (let k = Math.ceil(geo.x0); k <= Math.floor(geo.x1); k++) {
        el('line', { x1: X(k), x2: X(k), y1: Y_AXIS, y2: Y_AXIS + 4, stroke: c.textMuted }, layer);
        text(X(k), Y_AXIS + 16, 'middle', fontSizes.xs, c.textMuted, layer).textContent = raw(k);
      }
      el('line', { x1: X(0), x2: X(0), y1: Y_AXIS, y2: Y_TRACE1 + 6, stroke: c.textMuted, 'stroke-dasharray': '3 3' }, layer);
      // 곡선
      curveLine = el('polyline', { fill: 'none', stroke: c.primary, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, layer);
      peakLeft = text(X(f.centers[0]), Y_PEAK, 'middle', fontSizes.sm, c.text, layer);
      peakRight = text(X(f.centers[2]), Y_PEAK, 'middle', fontSizes.sm, c.text, layer);
      peakMark = el('path', { fill: c.primary, stroke: 'none' }, layer);
      // 진짜 · 가짜 줄
      text(PL - 8, Y_REAL + smPx / 3, 'end', fontSizes.sm, c.text, layer).textContent = t('label.real', 'Real');
      text(PL - 8, Y_FAKE + smPx / 3, 'end', fontSizes.sm, c.text, layer).textContent = t('label.fake', 'Fake');
      for (const x of f.real) el('circle', { cx: X(x), cy: Y_REAL, r: 6, fill: realInk }, layer);
      fakeDots = f.fakes.map(() =>
        el('circle', { cx: X(0), cy: Y_FAKE, r: 6, fill: fakeInk, 'fill-opacity': 0.85, stroke: c.bg, 'stroke-width': 1.5 }, layer),
      );
      countLeft = text(X((geo.x0 + 0) / 2), Y_COUNT, 'middle', fontSizes.sm, c.text, layer);
      countRight = text(X((geo.x1 + 0) / 2), Y_COUNT, 'middle', fontSizes.sm, c.text, layer);
      // 자취
      text(20, Y_TRACE_TITLE, 'start', fontSizes.sm, c.textMuted, layer).textContent = t('label.trace', 'Fakes by round');
      traceLayer = el('g', {}, layer);
      // 읽기
      readG = text(20, Y_READ, 'start', fontSizes.sm, c.text, layer);
      readD = text(W - 20, Y_READ, 'end', fontSizes.sm, c.text, layer);
    };

    const setPeaks = (f: GanFrame) => {
      const g = need(geo, 'geo');
      const pl = need(peakLeft, 'peakLeft');
      const pr = need(peakRight, 'peakRight');
      pl.textContent = `D(${raw(g.centers[0])}) ${fmt(f.dLeft, 2)}`;
      pr.textContent = `D(${raw(g.centers[2])}) ${fmt(f.dRight, 2)}`;
      pl.setAttribute('font-weight', f.higher === 'left' ? '700' : '400');
      pr.setAttribute('font-weight', f.higher === 'right' ? '700' : '400');
      const mark = need(peakMark, 'peakMark');
      if (f.higher === 'none') {
        mark.setAttribute('d', '');
      } else {
        const cx = X(f.higher === 'left' ? g.centers[0] : g.centers[2]);
        const y = Y_PEAK + 5;
        mark.setAttribute('d', `M${cx - 5},${y} L${cx + 5},${y} L${cx},${y + 6} Z`);
      }
    };

    const setReadG = (f: GanFrame) => {
      need(readG, 'readG').textContent =
        `a ${fmt(f.a, 2)} · b ${fmt(f.b, 2)} · ${t('label.spread', 'Spread')} ${fmt(f.spread, 2)}`;
    };
    const setReadD = (f: GanFrame) => {
      if (f.dpar.length !== 4) throw new Error('gan-stage: dpar 가 넷이 아니다');
      need(readD, 'readD').textContent =
        `v [${f.dpar
          .slice(0, 3)
          .map((x) => fmt(x, 2))
          .join(', ')}] · c ${fmt(f.dpar[3], 2)}`;
    };
    const setReadout = (f: GanFrame) => {
      setReadG(f);
      setReadD(f);
    };

    const setCounts = (f: GanFrame) => {
      need(countLeft, 'countLeft').textContent = t('label.left', 'Left: {n}', { n: f.left });
      need(countRight, 'countRight').textContent = t('label.right', 'Right: {n}', { n: f.right });
    };

    const addTraceRow = (f: GanFrame) => {
      const g = need(geo, 'geo');
      const row = f.round / g.showEvery;
      if (!Number.isInteger(row) || row < 0 || row >= g.rows) throw new Error(`gan-stage: 자취 줄 ${row} 가 틀 밖이다`);
      const y = traceY(row);
      const parent = need(traceLayer, 'traceLayer');
      const label = text(PL - 8, y + smPx / 3 - 1, 'end', fontSizes.xs, c.textMuted, parent);
      label.textContent = f.round === 0 ? t('label.startRow', 'Start') : String(f.round);
      el('line', { x1: X(Math.min(...f.fakes)), x2: X(Math.max(...f.fakes)), y1: y, y2: y, stroke: fakeInk, 'stroke-opacity': 0.4, 'stroke-width': 2 }, parent);
      for (const x of f.fakes) el('circle', { cx: X(x), cy: y, r: 3, fill: fakeInk }, parent);
    };

    const api: GanStage & ViewInstance = {
      async init(f, ms) {
        stopAnim();
        const prev = pose;
        const sameShape =
          geo !== null &&
          prev !== null &&
          geo.x0 === f.xRange[0] &&
          geo.x1 === f.xRange[1] &&
          prev.curve.length === f.curve.length &&
          prev.fakes.length === f.fakes.length;
        build(f);
        title.textContent = t('caption.start', 'Start: the generator places the fakes');
        roundLabel.textContent = `${t('label.start', 'Start')} · b ${raw(f.start)}`;
        note.textContent = '';
        setPeaks(f);
        setReadout(f);
        setCounts(f);
        addTraceRow(f);
        // 앞 판의 끝 자리에서 새 출발 자리로 옮겨 간다 (처음 마운트면 바로 놓는다)
        pose = sameShape ? prev : null;
        if (pose) draw(pose);
        await move({ curve: f.curve, fakes: f.fakes }, sameShape ? ms : 0);
      },
      async discriminate(f, skipped, ms) {
        const g = need(geo, 'geo');
        roundLabel.textContent = t('label.round', 'Round: {r} / {n}', { r: f.round, n: (g.rows - 1) * g.showEvery });
        note.textContent = '';
        if (skipped.length > 0) {
          // 한 걸음 안에서 운동을 둘로 — 먼저 건너뛴 라운드의 만듦(가짜 · a · b), 그다음 가려냄(D 곡선)
          title.textContent = t('caption.dStepAfterSkip', 'Round {list} generator step passes, then the discriminator learns', {
            list: skipped.join(', '),
          });
          const before = need(pose, 'pose');
          await move({ curve: before.curve, fakes: f.fakes }, ms);
          setReadG(f);
          setCounts(f);
        } else {
          title.textContent = t('caption.dStep', 'The discriminator learns: the D curve reshapes');
          setReadG(f);
          setCounts(f);
        }
        setPeaks(f);
        setReadD(f);
        await move({ curve: f.curve, fakes: f.fakes }, ms);
      },
      async generate(f, final, oneSide, ms) {
        const g = need(geo, 'geo');
        title.textContent = t('caption.gStep', 'The generator learns: fakes move along the curve');
        roundLabel.textContent = t('label.round', 'Round: {r} / {n}', { r: f.round, n: (g.rows - 1) * g.showEvery });
        if (final) {
          note.textContent =
            oneSide === 'left'
              ? t('note.endLeft', 'End: every fake is left of 0')
              : oneSide === 'right'
                ? t('note.endRight', 'End: every fake is right of 0')
                : t('note.endSplit', 'End: fakes on both sides of 0');
        } else {
          note.textContent = '';
        }
        setPeaks(f);
        setReadout(f);
        await move({ curve: f.curve, fakes: f.fakes }, ms);
        setCounts(f);
        addTraceRow(f);
      },
      destroy() {
        stopAnim();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
    return api;
  },
};
