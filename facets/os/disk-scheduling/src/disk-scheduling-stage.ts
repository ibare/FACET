/**
 * 디스크 스케줄링 stage.
 *
 * 위에 실린더 축(0..top)과 요청 여덟, 그 아래로 시간이 내려가며 팔이 긋는 꺾은선, 맨 아래에
 * 다섯 정책의 거리 합 막대.
 *
 * 운동:
 *   판 시작   앞 판의 꺾은선이 새 판의 받은 차례 모양으로 다시 꺾인다 (꼭짓점이 옮겨 간다).
 *             팔 시작 자리가 축을 따라 미끄러지고, 막대 다섯이 새 거리 합으로 늘거나 줄며,
 *             "가장 짧음" 표시가 옆 막대로 옮겨 간다.
 *   걸음      팔이 축 위를 미끄러지고 꺾은선 끝이 다음 꼭짓점까지 그어진다.
 *             지금 정책의 막대가 움직인 거리만큼 차오른다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 540;
const X0 = 48;
const X1 = 672;
const AXIS_Y = 80;
const ROW0 = 118;
const ROW_H = 25;
const BAR_TITLE_Y = 390;
const BAR_Y0 = 404;
const BAR_ROW = 26;
const BAR_H = 16;
const BAR_X = 116;
const BAR_W = 440;
const MARK_X = 620;

export type RoundView = {
  policy: number;
  start: number;
  top: number;
  requests: number[];
  visits: number[];
  totals: number[];
  shortest: number;
};

export type MoveView = {
  step: number;
  from: number;
  to: number;
  dist: number;
  total: number;
  kind: 'arrival' | 'nearest' | 'ahead' | 'edge' | 'turn' | 'wrap';
  request: number;
  up: boolean;
};

/** projector 가 부르는 표면 */
export type DiskSchedulingStage = {
  setup(top: number, requests: number[], start: number): void;
  round(r: RoundView, ms: number): Promise<void>;
  move(m: MoveView, ms: number): Promise<void>;
  finish(policy: number, served: number): void;
  reset(): void;
};

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function policyName(t: Translate, policy: number): string {
  switch (policy) {
    case 0:
      return t('label.policy.fcfs', 'FCFS');
    case 1:
      return t('label.policy.sstf', 'SSTF');
    case 2:
      return t('label.policy.scan', 'SCAN');
    case 3:
      return t('label.policy.look', 'LOOK');
    case 4:
      return t('label.policy.cLook', 'C-LOOK');
    default:
      throw new Error(`disk-scheduling-stage: 모르는 정책 번호 ${policy}`);
  }
}

export const diskSchedulingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const small = parseFloat(fontSizes.xs);

    const root = el('g', {}, svg);
    const text = (x: number, y: number, size: string, fill: string, anchor = 'start', weight = 'normal', parent: Element = root) => {
      const node = el(
        'text',
        { x, y, 'font-family': fonts.body, 'font-size': size, fill, 'text-anchor': anchor, 'font-weight': weight },
        parent,
      );
      return node;
    };

    // ── 글자 줄
    const caption = text(20, 26, fontSizes.md, c.text);
    const moved = text(W - 20, 26, fontSizes.md, c.primary, 'end', 'bold');

    // ── 축
    const axisLayer = el('g', {}, root);
    const reqLayer = el('g', {}, root);
    // ── 꺾은선
    const guide = el('line', { stroke: c.border, 'stroke-width': 1, 'stroke-dasharray': '2 3', visibility: 'hidden' }, root);
    const ghost = el(
      'polyline',
      { fill: 'none', stroke: c.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '4 4', 'stroke-linejoin': 'round' },
      root,
    );
    const solid = el(
      'polyline',
      { fill: 'none', stroke: c.primary, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' },
      root,
    );
    const vertexLayer = el('g', {}, root);
    const tip = el('circle', { r: 5, fill: c.primary, visibility: 'hidden' }, root);
    const arm = el('g', {}, root);
    el('rect', { x: -7, y: -7, width: 14, height: 14, rx: 3, fill: c.accent, stroke: c.text, 'stroke-width': 1 }, arm);
    const dirLabel = text(0, 30, fontSizes.xs, c.textMuted, 'middle', 'normal', arm);

    // ── 막대
    const barTitle = text(20, BAR_TITLE_Y, fontSizes.sm, c.textMuted);
    const barRows: { name: SVGTextElement; full: SVGRectElement; fill: SVGRectElement; value: SVGTextElement }[] = [];
    for (let j = 0; j < 5; j += 1) {
      const y = BAR_Y0 + j * BAR_ROW;
      const name = text(20, y + BAR_H - 3, fontSizes.sm, c.text, 'start', 'normal');
      name.textContent = policyName(t, j);
      const full = el('rect', { x: BAR_X, y, width: 0, height: BAR_H, rx: 3, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1 }, root);
      const fill = el('rect', { x: BAR_X, y, width: 0, height: BAR_H, rx: 3, fill: c.primary }, root);
      const value = text(BAR_X + 6, y + BAR_H - 3, fontSizes.sm, c.text, 'start', 'normal');
      barRows.push({ name, full, fill, value });
    }
    const mark = el('g', { visibility: 'hidden' }, root);
    const markText = text(0, BAR_H - 3, fontSizes.sm, c.success, 'start', 'bold', mark);
    markText.textContent = `◀ ${t('label.shortest', 'shortest')}`;

    // ── 상태
    let top = 199;
    let requests: number[] = [];
    let start = 0;
    let visits: Pt[] = [];
    let served: Pt[] = [];
    let ghostPts: Pt[] = [];
    let barWidths = [0, 0, 0, 0, 0];
    let markY = 0;
    let policy = -1;
    let scale = 1;
    let shownTotal = 0;
    let armX = X0;
    let dead = false;
    let gen = 0;
    const reqDots: SVGCircleElement[] = [];

    const xOf = (cyl: number): number => X0 + (cyl * (X1 - X0)) / top;
    const rowY = (i: number): number => ROW0 + i * ROW_H;
    const ptsAttr = (pts: Pt[]): string => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const setArm = (x: number, up: boolean | null): void => {
      armX = x;
      arm.setAttribute('transform', `translate(${x.toFixed(1)},${AXIS_Y})`);
      dirLabel.textContent = up === null ? '' : up ? `${t('label.up', 'up')} →` : `← ${t('label.down', 'down')}`;
    };
    const setMoved = (n: number): void => {
      shownTotal = n;
      moved.textContent = t('label.moved', 'Distance moved: {n}', { n: Math.round(n) });
    };
    const setBars = (widths: number[]): void => {
      barWidths = widths;
      widths.forEach((w, j) => {
        const row = barRows[j];
        row.full.setAttribute('width', w.toFixed(1));
        row.value.setAttribute('x', (BAR_X + w + 6).toFixed(1));
      });
    };
    const setMark = (y: number): void => {
      markY = y;
      mark.setAttribute('transform', `translate(${MARK_X},${y.toFixed(1)})`);
    };
    const setFill = (n: number): void => {
      barRows.forEach((row, j) => {
        row.fill.setAttribute('width', j === policy ? Math.max(0, n * scale).toFixed(1) : '0');
      });
    };

    /** rAF 로 ms 동안 frame(0..1) 을 부르고 끝나면 풀린다. 새 운동이 오면 앞 것은 끝값으로 접힌다. */
    const tween = (ms: number, frame: (k: number) => void): Promise<void> => {
      gen += 1;
      const mine = gen;
      return new Promise<void>((resolve) => {
        let finished = false;
        const end = (): void => {
          if (finished) return;
          finished = true;
          if (!dead && mine === gen) frame(1);
          resolve();
        };
        if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
          end();
          return;
        }
        const t0 = performance.now();
        const tick = (now: number): void => {
          if (finished) return;
          if (dead || mine !== gen) {
            end();
            return;
          }
          const k = Math.min(1, (now - t0) / ms);
          if (k >= 1) {
            end();
            return;
          }
          frame(ease(k));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        // 탭이 가려져 rAF 가 멈춰도 걸음은 나아간다
        setTimeout(end, ms + 60);
      });
    };

    const drawAxis = (): void => {
      axisLayer.replaceChildren();
      reqLayer.replaceChildren();
      reqDots.length = 0;
      el('line', { x1: X0, y1: AXIS_Y, x2: X1, y2: AXIS_Y, stroke: c.text, 'stroke-width': 1.5 }, axisLayer);
      for (const cyl of [0, top]) {
        el('line', { x1: xOf(cyl), y1: AXIS_Y - 4, x2: xOf(cyl), y2: AXIS_Y + 4, stroke: c.text }, axisLayer);
        const lab = text(xOf(cyl), AXIS_Y + 16, fontSizes.xs, c.textMuted, 'middle', 'normal', axisLayer);
        lab.textContent = String(cyl);
      }
      const title = text(X1 + 8, AXIS_Y + 4, fontSizes.xs, c.textMuted, 'start', 'normal', axisLayer);
      title.textContent = t('label.axis', 'Cylinder');
      // 요청 — 가까운 이웃과 글자가 겹치면 한 층 위로 올린다
      const order = requests.map((r, i) => ({ r, i })).sort((a, b) => a.r - b.r);
      const lastX = [-Infinity, -Infinity];
      const gap = small * 2.2;
      for (const { r, i } of order) {
        const x = xOf(r);
        const level = x - lastX[0] >= gap ? 0 : 1;
        lastX[level] = x;
        const lab = text(x, AXIS_Y - 10 - level * 12, fontSizes.xs, c.text, 'middle', 'normal', reqLayer);
        lab.textContent = String(r);
        reqDots[i] = el('circle', { cx: x, cy: AXIS_Y, r: 4, fill: c.bg, stroke: c.itemComparing, 'stroke-width': 2 }, reqLayer);
      }
    };

    const drawVertex = (p: Pt, cyl: number, cameRight: boolean, isEdge: boolean): void => {
      el(
        'circle',
        { cx: p.x, cy: p.y, r: 3.5, fill: isEdge ? c.bg : c.primary, stroke: c.primary, 'stroke-width': 1.5 },
        vertexLayer,
      );
      const lab = text(p.x + (cameRight ? 8 : -8), p.y + 4, fontSizes.xs, c.text, cameRight ? 'start' : 'end', 'normal', vertexLayer);
      lab.textContent = String(cyl);
    };

    /** 걸음 0 의 꼭짓점 — 팔 시작 자리 */
    const drawStart = (cyl: number): void => {
      const p = { x: xOf(cyl), y: rowY(0) };
      el('rect', { x: p.x - 4, y: p.y - 4, width: 8, height: 8, fill: c.accent, stroke: c.text, 'stroke-width': 1 }, vertexLayer);
      const lab = text(p.x - 9, p.y + 4, fontSizes.xs, c.text, 'end', 'bold', vertexLayer);
      lab.textContent = String(cyl);
    };

    const planPts = (s: number, vs: number[]): Pt[] => [{ x: xOf(s), y: rowY(0) }, ...vs.map((v, i) => ({ x: xOf(v), y: rowY(i + 1) }))];

    const pad = (pts: Pt[], len: number): Pt[] => {
      if (pts.length === 0) throw new Error('disk-scheduling-stage: 빈 꺾은선');
      const out = pts.slice(0, len);
      while (out.length < len) out.push(out[out.length - 1]);
      return out;
    };

    const clearRun = (): void => {
      vertexLayer.replaceChildren();
      solid.setAttribute('points', '');
      tip.setAttribute('visibility', 'hidden');
      guide.setAttribute('visibility', 'hidden');
      for (const d of reqDots) d?.setAttribute('fill', c.bg);
    };

    const stage: DiskSchedulingStage = {
      setup(nextTop, nextRequests, nextStart) {
        top = nextTop;
        requests = [...nextRequests];
        start = nextStart;
        drawAxis();
        clearRun();
        drawStart(start);
        served = [{ x: xOf(start), y: rowY(0) }];
        ghostPts = [];
        ghost.setAttribute('points', '');
        setArm(xOf(start), null);
        caption.textContent = t('caption.start', 'Arm at cylinder {cyl} · requests waiting: {n}', {
          cyl: start,
          n: requests.length,
        });
        setMoved(0);
      },

      async round(r, ms) {
        const fromGhost = served.length > 1 ? served : ghostPts.length > 0 ? ghostPts : [{ x: xOf(start), y: rowY(0) }];
        if (r.top !== top || r.requests.join() !== requests.join()) {
          top = r.top;
          requests = [...r.requests];
          drawAxis();
        }
        start = r.start;
        policy = r.policy;
        const target = planPts(r.start, r.visits);
        const len = Math.max(fromGhost.length, target.length);
        const a = pad(fromGhost, len);
        const b = pad(target, len);
        visits = target;

        clearRun();
        drawStart(r.start);
        served = [target[0]];
        barRows.forEach((row, j) => {
          const on = j === policy;
          row.name.setAttribute('font-weight', on ? 'bold' : 'normal');
          row.name.setAttribute('fill', on ? c.primary : c.text);
          row.full.setAttribute('stroke', on ? c.primary : c.border);
          row.value.textContent = String(r.totals[j]);
          row.value.setAttribute('font-weight', on ? 'bold' : 'normal');
        });
        const maxTotal = Math.max(...r.totals);
        if (!(maxTotal > 0)) throw new Error('disk-scheduling-stage: 거리 합이 비었다');
        scale = BAR_W / maxTotal;
        setFill(0);
        barTitle.textContent = t('label.bars', 'Distance moved by each policy · start: cylinder {cyl}', { cyl: r.start });
        caption.textContent = t('caption.start', 'Arm at cylinder {cyl} · requests waiting: {n}', {
          cyl: r.start,
          n: r.requests.length,
        });
        const fromBars = [...barWidths];
        const toBars = r.totals.map((v) => v * scale);
        const fromMark = mark.getAttribute('visibility') === 'hidden' ? BAR_Y0 + r.shortest * BAR_ROW : markY;
        const toMark = BAR_Y0 + r.shortest * BAR_ROW;
        mark.setAttribute('visibility', 'visible');
        const fromArm = armX;
        const fromMoved = shownTotal;
        await tween(ms, (k) => {
          ghost.setAttribute('points', ptsAttr(a.map((p, i) => ({ x: lerp(p.x, b[i].x, k), y: lerp(p.y, b[i].y, k) }))));
          setBars(fromBars.map((w, j) => lerp(w, toBars[j], k)));
          setMark(lerp(fromMark, toMark, k));
          setArm(lerp(fromArm, target[0].x, k), policy >= 2 ? true : null);
          setMoved(lerp(fromMoved, 0, k));
        });
        ghostPts = target;
        ghost.setAttribute('points', ptsAttr(target));
      },

      async move(m, ms) {
        const i = m.step;
        if (i < 1 || i >= visits.length) throw new Error(`disk-scheduling-stage: 걸음 ${i} 은 이번 판 밖`);
        const from = served[served.length - 1];
        const to = { x: xOf(m.to), y: rowY(i) };
        const kindKey = m.kind;
        caption.textContent =
          kindKey === 'edge'
            ? t('caption.edge', 'Ran on to end cylinder {cyl} · this move: {d}', { cyl: m.to, d: m.dist })
            : kindKey === 'turn'
              ? t('caption.turn', 'Turned back · served cylinder {cyl} · this move: {d}', { cyl: m.to, d: m.dist })
              : kindKey === 'wrap'
                ? t('caption.wrap', 'Jumped to the lowest request · served cylinder {cyl} · this move: {d}', {
                    cyl: m.to,
                    d: m.dist,
                  })
                : t('caption.serve', 'Served cylinder {cyl} · this move: {d}', { cyl: m.to, d: m.dist });
        tip.setAttribute('visibility', 'visible');
        guide.setAttribute('visibility', 'visible');
        const base = ptsAttr(served);
        const fromTotal = m.total - m.dist;
        await tween(ms, (k) => {
          const p = { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) };
          solid.setAttribute('points', `${base} ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
          tip.setAttribute('cx', p.x.toFixed(1));
          tip.setAttribute('cy', p.y.toFixed(1));
          guide.setAttribute('x1', p.x.toFixed(1));
          guide.setAttribute('x2', p.x.toFixed(1));
          guide.setAttribute('y1', String(AXIS_Y + 8));
          guide.setAttribute('y2', p.y.toFixed(1));
          setArm(p.x, policy >= 2 ? m.up : null);
          const n = lerp(fromTotal, m.total, k);
          setMoved(n);
          setFill(n);
        });
        served = [...served, to];
        solid.setAttribute('points', ptsAttr(served));
        drawVertex(to, m.to, to.x >= from.x, m.kind === 'edge');
        if (m.request >= 0) {
          const dot = reqDots[m.request];
          if (dot === undefined) throw new Error(`disk-scheduling-stage: 요청 ${m.request} 이 없다`);
          dot.setAttribute('fill', c.itemComparing);
        }
        setMoved(m.total);
        setFill(m.total);
      },

      finish(p, n) {
        caption.textContent = t('caption.finish', '{policy} served all {n} requests', { policy: policyName(t, p), n });
        tip.setAttribute('visibility', 'hidden');
      },

      reset() {
        gen += 1;
        served = [];
        ghostPts = [];
        ghost.setAttribute('points', '');
        clearRun();
        mark.setAttribute('visibility', 'hidden');
        setBars([0, 0, 0, 0, 0]);
        barRows.forEach((row) => {
          row.value.textContent = '';
        });
        barTitle.textContent = '';
        policy = -1;
      },
    };

    // 걸음 0 을 비우지 않는다 — 초기 자료가 있으면 축 · 요청 · 팔을 바로 둔다
    const init = params.initialData;
    // 초기 자료가 아예 없으면(전수 검사의 `config: {}` 마운트) 빈 틀로 둔다. 있는데 모양이 틀리면 던진다.
    if (init !== undefined) {
      const reqs = init.requests;
      if (
        typeof init.top !== 'number' ||
        typeof init.armStart !== 'number' ||
        !Array.isArray(reqs) ||
        !reqs.every((x): x is number => typeof x === 'number')
      ) {
        throw new Error('disk-scheduling-stage: 초기 자료의 top · armStart · requests 모양이 틀렸다');
      }
      stage.setup(init.top, reqs, init.armStart);
    }

    return {
      ...stage,
      destroy() {
        dead = true;
        gen += 1;
        root.remove();
      },
    };
  },
};
