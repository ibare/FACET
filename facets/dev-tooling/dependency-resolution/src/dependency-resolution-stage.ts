/**
 * dependency-resolution 무대.
 *
 * 위: 차례 간격 수직선 — 두 범위 띠(charts 고정 · table 손잡이)가 눈금 위에 서고, 두 띠의 겹침 칸이
 *     table 띠를 따라 좁아지다 사라진다. check-top 은 꼭대기 버전 자리에서 table 띠로 올라가는 탐침,
 *     shared-range 는 두 끝이 한 걸음에 서는 괄호, 끝 걸음은 두 범위를 함께 채우는 공개 버전의 고리.
 * 아래: app → charts · table 상자와 color 가 놓일 두 자리(꼭대기 · table 안쪽).
 *     고른 color 상자는 수직선의 그 버전 자리에서 떠나 꼭대기로 옮겨 앉고, 중첩이 두 벌을 깔면
 *     한 벌이 꼭대기에서 table 안쪽으로 떨어져 나간다. 끝 걸음에 누가 무엇을 쓰는지 잇는 선.
 *
 * 무대는 셈하지 않는다 — 눈금 · 띠 끝 · 겹침 칸 · 판정 · 고른 버전 · 벌 수 · 고리 자리는 모두 payload 로 받는다.
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

export type AxisPayload = {
  ticks: string[];
  published: number[];
  root: string;
  callers: { name: string; version: string }[];
  target: string;
  slots: { top: string; inner: string };
};
export type BandPayload = { from: string; range: string; lo: number; hi: number };
export type RoundPayload = {
  solver: 'nested' | 'single';
  bands: BandPayload[];
  overlap: { lo: number; hi: number } | null;
};
export type PickPayload = { version: string; tick: number; by: string; range: string };
export type CheckPayload = { version: string; range: string; tick: number; inside: boolean };
export type ReusePayload = { version: string; tick: number };
export type NestPayload = { version: string; tick: number; range: string };
export type SharedRangePayload = { lo: string; hi: string; loTick: number; hiTick: number; empty: boolean };
export type PickSharedPayload = { version: string; tick: number };
export type FailPayload = { reason: 'empty-range' | 'nothing-published' };
export type DonePayload = { copies: number; uses: { from: string; slot: 'top' | 'inner' }[]; shared: number[] };

/** projector 가 부르는 무대의 표면 */
export type DependencyResolutionStage = {
  setAxis(p: AxisPayload): void;
  beginRound(p: RoundPayload, ms: number): void;
  pick(p: PickPayload, ms: number): void;
  check(p: CheckPayload, ms: number): void;
  reuse(p: ReusePayload, ms: number): void;
  nest(p: NestPayload, ms: number): void;
  sharedRange(p: SharedRangePayload, ms: number): void;
  pickShared(p: PickSharedPayload, ms: number): void;
  fail(p: FailPayload, ms: number): void;
  done(p: DonePayload, ms: number): void;
  clearRound(): void;
};

const W = 720;
const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 수직선
const AXIS_X0 = 180;
const AXIS_X1 = 690;
const AXIS_Y = 132;
const BAND_Y = [40, 76];
const BAND_H = 18;
// 상자
const BOX_W = 150;
const BOX_H = 34;
const COL_X = 170;
const ROW_Y = { first: 238, second: 296, top: 368 };
const INNER = { x: 430, y: 296, w: BOX_W };
const APP = { x: 24, y: 296, w: 84 };

type Box = { g: SVGGElement; frame: SVGRectElement; name: SVGTextElement; ver: SVGTextElement; x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

export const dependencyResolutionStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const [firstColor, secondColor] = categorical(2, 'vivid');
    const mono = fonts.mono;
    const body = fonts.body;
    const xs = parseFloat(fontSizes.xs);
    const sm = parseFloat(fontSizes.sm);
    const md = parseFloat(fontSizes.md);

    // ── 애니메이션 ─────────────────────────────────────────────
    const frames = new Map<string, number>();
    let destroyed = false;
    const cancelAll = (): void => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
    };
    params.onScrubStart?.(cancelAll);
    const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    /** key 별로 하나 — 새 운동이 옛 운동을 거두고 지금 값에서 이어 간다 */
    const tween = (key: string, ms: number, draw: (k: number) => void): void => {
      const old = frames.get(key);
      if (old !== undefined) cancelAnimationFrame(old);
      frames.delete(key);
      if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return;
      }
      const start = performance.now();
      const step = (now: number): void => {
        if (destroyed) return;
        const k = Math.min(1, (now - start) / ms);
        draw(ease(k));
        if (k < 1) frames.set(key, requestAnimationFrame(step));
        else frames.delete(key);
      };
      frames.set(key, requestAnimationFrame(step));
    };
    const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

    // ── 층 ─────────────────────────────────────────────────────
    const root = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, root);
    const axisLayer = el('g', {}, root);
    const treeLayer = el('g', {}, root);
    const linkLayer = el('g', {}, root);
    const boxLayer = el('g', {}, root);
    const markLayer = el('g', {}, root);
    const caption = el('text', { x: 24, y: 206, 'font-family': body, 'font-size': md, fill: c.text }, root);

    let ticks: string[] = [];
    let names = { root: '', first: '', second: '', target: '' };
    let slots = { top: '', inner: '' };
    const tickX = (i: number): number => {
      if (!Number.isInteger(i) || i < 0 || i >= ticks.length) throw new Error(`dependency-resolution-stage: 눈금 밖의 자리 ${i}`);
      return ticks.length === 1 ? AXIS_X0 : AXIS_X0 + ((AXIS_X1 - AXIS_X0) * i) / (ticks.length - 1);
    };

    // 띠 · 겹침 칸 · 탐침 · 괄호 · 고리
    const overlap = el('rect', { x: 0, y: BAND_Y[0] - 8, width: 0, height: AXIS_Y - BAND_Y[0] + 8, fill: c.accent, 'fill-opacity': 0.28 }, axisLayer);
    const overlapNow = { x0: 0, x1: 0 };
    const bands = BAND_Y.map((y, i) => {
      const color = i === 0 ? firstColor : secondColor;
      const rect = el('rect', { x: 0, y, width: 0, height: BAND_H, rx: 4, fill: color, 'fill-opacity': 0.25, stroke: color, 'stroke-width': 1.5 }, axisLayer);
      const label = el('text', { x: 16, y: y + BAND_H - 4, 'font-family': mono, 'font-size': sm, fill: c.text }, axisLayer);
      return { rect, label, now: { x0: 0, x1: 0 } };
    });
    const drawBand = (i: number, x0: number, x1: number): void => {
      const b = bands[i];
      b.now = { x0, x1 };
      b.rect.setAttribute('x', String(x0));
      b.rect.setAttribute('width', String(Math.max(0, x1 - x0)));
    };
    const drawOverlap = (x0: number, x1: number): void => {
      overlapNow.x0 = x0;
      overlapNow.x1 = x1;
      overlap.setAttribute('x', String(x0));
      overlap.setAttribute('width', String(Math.max(0, x1 - x0)));
    };
    const axisGroup = el('g', {}, axisLayer);
    const probe = el('g', { opacity: 0 }, axisLayer);
    const probeLine = el('line', { x1: 0, y1: AXIS_Y, x2: 0, y2: AXIS_Y, stroke: c.text, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, probe);
    const probeText = el('text', { x: 0, y: (BAND_Y[1] + BAND_H + AXIS_Y) / 2 + 4, 'font-family': body, 'font-size': sm, 'font-weight': 700, fill: c.text }, probe);
    const bracket = el('g', { opacity: 0 }, axisLayer);
    const bracketY = AXIS_Y + 34;
    const bracketPath = el('path', { d: '', fill: 'none', stroke: c.text, 'stroke-width': 2 }, bracket);
    const bracketText = el('text', { x: 0, y: bracketY + 14, 'text-anchor': 'middle', 'font-family': body, 'font-size': xs, fill: c.textMuted }, bracket);
    const rings = el('g', {}, axisLayer);

    // 상자
    const makeBox = (x: number, y: number, w: number, stroke: string, parent: Element): Box => {
      const g = el('g', { transform: `translate(${x},${y})` }, parent);
      const frame = el('rect', { x: 0, y: 0, width: w, height: BOX_H, rx: 5, fill: c.bgSubtle, stroke, 'stroke-width': 1.5 }, g);
      const name = el('text', { x: 10, y: BOX_H / 2 + 4, 'font-family': mono, 'font-size': sm, fill: c.text }, g);
      const ver = el('text', { x: w - 10, y: BOX_H / 2 + 4, 'text-anchor': 'end', 'font-family': mono, 'font-size': md, 'font-weight': 700, fill: c.text }, g);
      return { g, frame, name, ver, x, y };
    };
    const moveBox = (b: Box, x: number, y: number): void => {
      b.x = x;
      b.y = y;
      b.g.setAttribute('transform', `translate(${x},${y})`);
    };
    const appBox = makeBox(APP.x, ROW_Y.second, APP.w, c.border, treeLayer);
    const firstBox = makeBox(COL_X, ROW_Y.first, BOX_W, firstColor, treeLayer);
    const secondBox = makeBox(COL_X, ROW_Y.second, BOX_W, secondColor, treeLayer);

    // 자리 틀 (늘 선다) — 역할 이름은 위, node_modules 자리는 아래
    const slotFrame = (x: number, y: number, w: number): SVGRectElement =>
      el('rect', { x, y, width: w, height: BOX_H, rx: 5, fill: 'none', stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '5 4' }, treeLayer);
    const topFrame = slotFrame(COL_X, ROW_Y.top, BOX_W);
    const innerFrame = slotFrame(INNER.x, INNER.y, INNER.w);
    const topRole = el('text', { x: COL_X, y: ROW_Y.top - 6, 'font-family': body, 'font-size': xs, fill: c.textMuted }, treeLayer);
    const innerRole = el('text', { x: INNER.x, y: INNER.y - 6, 'font-family': body, 'font-size': xs, fill: c.textMuted }, treeLayer);
    const topPath = el('text', { x: COL_X, y: ROW_Y.top + BOX_H + 15, 'font-family': mono, 'font-size': xs, fill: c.textMuted }, treeLayer);
    const innerPath = el('text', { x: INNER.x, y: INNER.y + BOX_H + 15, 'font-family': mono, 'font-size': xs, fill: c.textMuted }, treeLayer);
    const failMark = el('g', { opacity: 0 }, markLayer);
    el('line', { x1: COL_X + 12, y1: ROW_Y.top + 8, x2: COL_X + 30, y2: ROW_Y.top + BOX_H - 8, stroke: c.danger, 'stroke-width': 2.5 }, failMark);
    el('line', { x1: COL_X + 30, y1: ROW_Y.top + 8, x2: COL_X + 12, y2: ROW_Y.top + BOX_H - 8, stroke: c.danger, 'stroke-width': 2.5 }, failMark);
    const failText = el('text', { x: COL_X + 40, y: ROW_Y.top + BOX_H / 2 + 5, 'font-family': body, 'font-size': md, 'font-weight': 700, fill: c.danger }, failMark);

    // color 상자 둘 — 꼭대기(main)와 안쪽(inner). 판 사이에 자리를 남겨 옮겨 간다
    const main = makeBox(COL_X, ROW_Y.top, BOX_W, c.primary, boxLayer);
    const inner = makeBox(COL_X, ROW_Y.top, BOX_W, c.primary, boxLayer);
    main.g.setAttribute('opacity', '0');
    inner.g.setAttribute('opacity', '0');

    // 구조선 (app → 셋, table → 안쪽)
    const trunkX = APP.x + APP.w + 24;
    const treeLine = (d: string): void => {
      el('path', { d, fill: 'none', stroke: c.border, 'stroke-width': 1.5 }, treeLayer);
    };
    treeLine(`M${APP.x + APP.w},${ROW_Y.second + BOX_H / 2} H${trunkX}`);
    treeLine(`M${trunkX},${ROW_Y.first + BOX_H / 2} V${ROW_Y.top + BOX_H / 2}`);
    for (const y of [ROW_Y.first, ROW_Y.second, ROW_Y.top]) treeLine(`M${trunkX},${y + BOX_H / 2} H${COL_X}`);
    treeLine(`M${COL_X + BOX_W},${ROW_Y.second + BOX_H / 2} H${INNER.x}`);
    treeLayer.appendChild(topFrame);
    treeLayer.appendChild(innerFrame);

    let ready = false;
    const need = (what: string): void => {
      if (!ready) throw new Error(`dependency-resolution-stage: setAxis 전에 ${what}`);
    };

    const setAxis = (p: AxisPayload): void => {
      if (p.callers.length !== 2) throw new Error('dependency-resolution-stage: 부르는 쪽은 둘이다');
      ticks = p.ticks;
      slots = { ...p.slots };
      names = { root: p.root, first: p.callers[0].name, second: p.callers[1].name, target: p.target };
      axisGroup.replaceChildren();
      el('line', { x1: AXIS_X0 - 14, y1: AXIS_Y, x2: AXIS_X1 + 14, y2: AXIS_Y, stroke: c.textMuted, 'stroke-width': 1.5 }, axisGroup);
      ticks.forEach((label, i) => {
        const x = tickX(i);
        const isPublished = p.published.includes(i);
        if (isPublished) el('circle', { cx: x, cy: AXIS_Y, r: 4.5, fill: c.text }, axisGroup);
        else el('line', { x1: x, y1: AXIS_Y - 5, x2: x, y2: AXIS_Y + 5, stroke: c.textMuted, 'stroke-width': 1.5 }, axisGroup);
        el('text', { x, y: AXIS_Y + 20, 'text-anchor': 'middle', 'font-family': mono, 'font-size': xs, fill: isPublished ? c.text : c.textMuted }, axisGroup).textContent = label;
      });
      appBox.name.textContent = p.root;
      firstBox.name.textContent = p.callers[0].name;
      firstBox.ver.textContent = p.callers[0].version;
      secondBox.name.textContent = p.callers[1].name;
      secondBox.ver.textContent = p.callers[1].version;
      main.name.textContent = p.target;
      inner.name.textContent = p.target;
      topRole.textContent = t('label.top', 'Top');
      innerRole.textContent = t('label.inner', 'Inside {name}', { name: p.callers[1].name });
      topPath.textContent = p.slots.top;
      innerPath.textContent = p.slots.inner;
      failText.textContent = t('label.failed', 'failed');
      ready = true;
    };

    const clearRound = (): void => {
      probe.setAttribute('opacity', '0');
      bracket.setAttribute('opacity', '0');
      rings.replaceChildren();
      linkLayer.replaceChildren();
      failMark.setAttribute('opacity', '0');
      topFrame.setAttribute('stroke', c.textMuted);
      main.ver.textContent = '';
      inner.ver.textContent = '';
      caption.textContent = '';
    };

    const beginRound = (p: RoundPayload, ms: number): void => {
      need('beginRound');
      if (p.bands.length !== 2) throw new Error('dependency-resolution-stage: 범위 띠는 둘이다');
      clearRound();
      // 띠가 새 두 끝으로 미끄러진다
      p.bands.forEach((band, i) => {
        const from = { ...bands[i].now };
        const to = { x0: tickX(band.lo), x1: tickX(band.hi) };
        bands[i].label.textContent = `${band.from} ${band.range}`;
        if (from.x1 - from.x0 <= 0) drawBand(i, to.x0, to.x1);
        else tween(`band${i}`, ms, (k) => drawBand(i, lerp(from.x0, to.x0, k), lerp(from.x1, to.x1, k)));
      });
      // 겹침 칸 — 없으면 가운데로 오므라든다
      const from = { ...overlapNow };
      const mid = (from.x0 + from.x1) / 2;
      const to = p.overlap === null ? { x0: mid, x1: mid } : { x0: tickX(p.overlap.lo), x1: tickX(p.overlap.hi) };
      if (from.x1 - from.x0 <= 0 && p.overlap !== null) {
        const c0 = (to.x0 + to.x1) / 2;
        tween('overlap', ms, (k) => drawOverlap(lerp(c0, to.x0, k), lerp(c0, to.x1, k)));
      } else {
        tween('overlap', ms, (k) => drawOverlap(lerp(from.x0, to.x0, k), lerp(from.x1, to.x1, k)));
      }
      // 앞 판의 color 상자 — 안쪽 벌은 꼭대기로 거둬 들이고, 둘 다 글자 없는 빈 틀로
      const innerFrom = { x: inner.x, y: inner.y };
      tween('inner', ms, (k) => moveBox(inner, lerp(innerFrom.x, COL_X, k), lerp(innerFrom.y, ROW_Y.top, k)));
      inner.g.setAttribute('opacity', '0');
      main.g.setAttribute('opacity', '0');
      const solverName = p.solver === 'nested' ? t('label.nested', 'nested') : t('label.single', 'single copy');
      caption.textContent = t('caption.round', '{caller} → {target} {range} · resolver: {solver}', {
        caller: p.bands[1].from,
        target: names.target,
        range: p.bands[1].range,
        solver: solverName,
      });
    };

    /** 고른 상자가 수직선의 그 버전 자리에서 떠나 꼭대기로 옮겨 앉는다 */
    const landTop = (version: string, tick: number, ms: number): void => {
      const sx = tickX(tick) - BOX_W / 2;
      const sy = AXIS_Y + 8;
      main.ver.textContent = version;
      main.frame.setAttribute('stroke-dasharray', '');
      main.g.setAttribute('opacity', '1');
      moveBox(main, sx, sy);
      tween('main', ms, (k) => moveBox(main, lerp(sx, COL_X, k), lerp(sy, ROW_Y.top, k)));
    };

    const pick = (p: PickPayload, ms: number): void => {
      need('pick');
      landTop(p.version, p.tick, ms);
      caption.textContent = t('caption.pickFirst', '{by} {range} → largest in range: {version} → {path}', {
        by: p.by,
        range: p.range,
        version: p.version,
        path: slots.top,
      });
    };

    const check = (p: CheckPayload, ms: number): void => {
      need('check');
      const x = tickX(p.tick);
      const color = p.inside ? c.text : c.danger;
      probeLine.setAttribute('x1', String(x));
      probeLine.setAttribute('x2', String(x));
      probeLine.setAttribute('stroke', color);
      probeText.setAttribute('x', String(x + 7));
      probeText.setAttribute('fill', color);
      const verdict = p.inside ? t('label.inside', 'inside') : t('label.outside', 'outside');
      probeText.textContent = verdict;
      probe.setAttribute('opacity', '1');
      // 탐침이 꼭대기 버전 자리에서 table 띠까지 올라간다
      const top = BAND_Y[1] - 4;
      tween('probe', ms, (k) => probeLine.setAttribute('y2', String(lerp(AXIS_Y, top, k))));
      caption.textContent = t('caption.check', 'Top copy {version} against {caller} {range} → {verdict}', {
        version: p.version,
        caller: names.second,
        range: p.range,
        verdict,
      });
    };

    const useLink = (from: 'first' | 'second', slot: 'top' | 'inner', ms: number): void => {
      const sy = from === 'first' ? ROW_Y.first + BOX_H / 2 : ROW_Y.second + BOX_H / 2;
      const color = from === 'first' ? firstColor : secondColor;
      const x0 = COL_X + BOX_W;
      let d: string;
      if (slot === 'top') {
        const bulge = from === 'first' ? 64 : 36;
        d = `M${x0},${sy} C${x0 + bulge},${sy} ${x0 + bulge},${ROW_Y.top + BOX_H / 2} ${x0},${ROW_Y.top + BOX_H / 2}`;
      } else {
        d = `M${x0},${sy - 8} C${x0 + 40},${sy - 40} ${INNER.x - 40},${sy - 40} ${INNER.x},${sy - 8}`;
      }
      const path = el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.5 }, linkLayer);
      el('circle', { cx: slot === 'top' ? x0 : INNER.x, cy: slot === 'top' ? ROW_Y.top + BOX_H / 2 : sy - 8, r: 4, fill: color }, linkLayer);
      const len = 260;
      path.setAttribute('stroke-dasharray', `${len}`);
      tween(`link-${from}`, ms, (k) => path.setAttribute('stroke-dashoffset', String(lerp(len, 0, k))));
    };

    const reuse = (p: ReusePayload, ms: number): void => {
      need('reuse');
      useLink('second', 'top', ms);
      caption.textContent = t('caption.reuse', '{caller} reuses the top copy: {version}', { caller: names.second, version: p.version });
    };

    const nest = (p: NestPayload, ms: number): void => {
      need('nest');
      // 한 벌이 꼭대기에서 table 안쪽으로 떨어져 나간다
      inner.ver.textContent = p.version;
      inner.g.setAttribute('opacity', '1');
      moveBox(inner, main.x, main.y);
      const sx = main.x;
      const sy = main.y;
      tween('inner', ms, (k) => moveBox(inner, lerp(sx, INNER.x, k), lerp(sy, INNER.y, k)));
      probe.setAttribute('opacity', '0');
      caption.textContent = t('caption.nest', '{caller} {range} → its own copy: {version} → {path}', {
        caller: names.second,
        range: p.range,
        version: p.version,
        path: slots.inner,
      });
    };

    const sharedRange = (p: SharedRangePayload, ms: number): void => {
      need('sharedRange');
      const x0 = tickX(p.loTick);
      const x1 = tickX(p.hiTick);
      const color = p.empty ? c.danger : c.text;
      bracketPath.setAttribute('stroke', color);
      bracketText.setAttribute('fill', color);
      bracketText.setAttribute('x', String((x0 + x1) / 2));
      bracketText.textContent = p.empty ? t('label.empty', 'empty') : t('label.sharedRange', 'shared range');
      bracket.setAttribute('opacity', '1');
      // 두 끝이 한 걸음에 선다
      tween('bracket', ms, (k) => {
        const h = lerp(0, 10, k);
        bracketPath.setAttribute('d', `M${x0},${bracketY - h} V${bracketY} H${x1} V${bracketY - h}`);
      });
      caption.textContent = p.empty
        ? t('caption.sharedEmpty', 'Shared range [{lo}, {hi}) is empty', { lo: p.lo, hi: p.hi })
        : t('caption.shared', 'Shared range [{lo}, {hi})', { lo: p.lo, hi: p.hi });
    };

    const pickShared = (p: PickSharedPayload, ms: number): void => {
      need('pickShared');
      landTop(p.version, p.tick, ms);
      caption.textContent = t('caption.pickShared', 'Largest in the shared range: {version} → {path}, used by both', {
        version: p.version,
        path: slots.top,
      });
    };

    const fail = (p: FailPayload, _ms: number): void => {
      need('fail');
      failMark.setAttribute('opacity', '1');
      topFrame.setAttribute('stroke', c.danger);
      main.g.setAttribute('opacity', '0');
      caption.textContent =
        p.reason === 'empty-range'
          ? t('caption.failEmpty', 'No copy can satisfy both ranges → failed')
          : t('caption.failNone', 'Nothing published inside the range → failed');
    };

    const done = (p: DonePayload, ms: number): void => {
      need('done');
      probe.setAttribute('opacity', '0');
      linkLayer.replaceChildren();
      for (const u of p.uses) {
        const from = u.from === names.first ? 'first' : u.from === names.second ? 'second' : null;
        if (from === null) throw new Error(`dependency-resolution-stage: 모르는 부르는 쪽 '${u.from}'`);
        useLink(from, u.slot, ms);
      }
      rings.replaceChildren();
      for (const i of p.shared) {
        el('circle', { cx: tickX(i), cy: AXIS_Y, r: 9, fill: 'none', stroke: c.text, 'stroke-width': 2 }, rings);
      }
      caption.textContent = t('caption.done', 'Copies: {copies} · published versions in both ranges: {shared}', {
        copies: p.copies,
        shared: p.shared.length,
      });
    };

    const instance: ViewInstance & DependencyResolutionStage = {
      setAxis,
      beginRound,
      pick,
      check,
      reuse,
      nest,
      sharedRange,
      pickShared,
      fail,
      done,
      clearRound,
      destroy() {
        destroyed = true;
        cancelAll();
        root.remove();
      },
    };
    return instance;
  },
};
