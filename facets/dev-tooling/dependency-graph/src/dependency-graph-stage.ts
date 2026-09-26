/**
 * dependency-graph stage — 왼쪽은 대상과 입력의 그래프, 오른쪽은 일꾼 줄 위의 시간 막대.
 *
 * 주인공은 **끝 시각 선과 가장 긴 사슬의 바닥 선의 관계**다.
 * - 바닥 선: 일꾼 줄 아래에 가장 긴 사슬의 대상들을 초만큼 이어 놓은 띠와 그 끝에서 위로 선 점선.
 *   codegen.o 의 초를 바꾸면 띠의 칸이 들고 나며 바닥 선이 옮겨 간다.
 * - 끝 시각 선: stop 걸음에 앞 판의 자리에서 이 판의 끝 시각으로 미끄러진다. 바닥 선과의 사이를 띠로 칠한다.
 * - 시간 막대: 새 판의 걸음 0 에 앞 판의 막대는 빈 틀로 남고, 이 판에서 시작할 때 새 줄 · 새 시각으로 옮겨 간다.
 *
 * 무대는 스케줄을 셈하지 않는다 — 시작 · 끝 · 줄 · 사슬 · 끝 시각 · 차이는 모두 payload 로 받는다.
 * 그래프의 자리(열 = 입력을 따라 내려간 깊이)만 무대가 정한다. 그것은 답이 아니라 배치다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StageTarget = { id: string; seconds: number; needs: string[] };
export type StageRound = {
  workers: number;
  laneMax: number;
  axisMax: number;
  targets: StageTarget[];
  chain: { id: string; seconds: number }[];
  chainSeconds: number;
};
export type StageStart = { id: string; lane: number; start: number; end: number };
export type StageTick = { t: number; finished: string[]; started: StageStart[]; waiting: string[] };
export type StageStop = { finishTime: number; finished: string[]; chainSeconds: number; gap: number };

export type DependencyGraphStage = ViewInstance & {
  round(p: StageRound, ms: number): void;
  tick(p: StageTick, ms: number): void;
  stop(p: StageStop, ms: number): void;
  reset(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 940;
const H = 372;
const CAPTION_Y = 24;
const HEAD_Y = 52;
const GRAPH_X0 = 10;
const GRAPH_X1 = 298;
const NODE_H = 36;
const COL_GAP = 26;
const TX0 = 350;
const TX1 = 924;
const AXIS_Y = 68;
const LANE_TOP = 78;
const LANES_H = 228;
const BAR_H = 21;
const STRIP_Y = LANE_TOP + LANES_H + 12;
const STRIP_H = 22;

type Tween = { from: number[]; to: number[]; start: number; ms: number; apply: (v: number[]) => void; raf: number };

type Bar = {
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  pos: number[]; // x, y, w
  state: 'ghost' | 'running' | 'done';
};

type Block = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement; pos: number[] };

export const dependencyGraphStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container, params): DependencyGraphStage {
    void container;
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const monoPx = parseFloat(fontSizes.xs);
    const charW = monoPx * 0.62;

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG, tag);
      for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
      parent.appendChild(e);
      return e;
    };
    const text = (s: string, attrs: Record<string, string | number>, parent: Element): SVGTextElement => {
      const e = el('text', { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...attrs }, parent);
      e.textContent = s;
      return e;
    };

    // ── 움직임 (rAF). 요소마다 하나만 — 새로 부르면 앞 것은 멈추고 지금 값에서 이어 간다
    const tweens = new Map<object, Tween>();
    const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tween = (key: object, from: number[], to: number[], ms: number, apply: (v: number[]) => void): void => {
      const prev = tweens.get(key);
      if (prev) cancelAnimationFrame(prev.raf);
      tweens.delete(key);
      if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
        apply(to);
        return;
      }
      const tw: Tween = { from, to, start: now(), ms, apply, raf: 0 };
      const frame = (): void => {
        const k = Math.min(1, (now() - tw.start) / tw.ms);
        const e = 1 - (1 - k) * (1 - k) * (1 - k);
        tw.apply(tw.from.map((a, i) => a + (tw.to[i]! - a) * e));
        if (k < 1) tw.raf = requestAnimationFrame(frame);
        else tweens.delete(key);
      };
      tw.apply(from);
      tw.raf = requestAnimationFrame(frame);
      tweens.set(key, tw);
    };
    const stopAll = (): void => {
      for (const tw of tweens.values()) cancelAnimationFrame(tw.raf);
      tweens.clear();
    };

    // ── 바탕
    const root = el('g', {}, svg);
    const caption = text('', { x: GRAPH_X0, y: CAPTION_Y, 'font-size': fontSizes.md, 'font-weight': 600 }, root);
    text(t('label.graph', 'Target → its inputs'), { x: GRAPH_X0, y: HEAD_Y, fill: c.textMuted, 'font-size': fontSizes.xs }, root);
    text(t('label.lanes', 'Worker lanes'), { x: TX0, y: HEAD_Y, fill: c.textMuted, 'font-size': fontSizes.xs }, root);
    text(t('label.axis', 'time (s)'), { x: TX1, y: HEAD_Y, fill: c.textMuted, 'font-size': fontSizes.xs, 'text-anchor': 'end' }, root);
    const gGraph = el('g', {}, root);
    const gAxis = el('g', {}, root);
    const gLanes = el('g', {}, root);
    const gGap = el('g', {}, root);
    const gBars = el('g', {}, root);
    const gStrip = el('g', {}, root);
    const gLines = el('g', {}, root);

    let layout: { laneMax: number; axisMax: number } | null = null;
    const xOf = (sec: number): number => {
      if (!layout) throw new Error('dependency-graph stage: round 전에 시각을 그리려 한다');
      return TX0 + ((TX1 - TX0) * sec) / layout.axisMax;
    };
    const laneH = (): number => {
      if (!layout) throw new Error('dependency-graph stage: round 전에 줄을 그리려 한다');
      return LANES_H / layout.laneMax;
    };
    const barY = (lane: number): number => LANE_TOP + lane * laneH() + Math.max(2, laneH() - BAR_H - 4);
    const linesBottom = LANE_TOP + LANES_H;

    // 줄 · 축은 laneMax · axisMax 가 처음 올 때 한 번 그린다
    const laneRows: { rect: SVGRectElement; label: SVGTextElement }[] = [];
    const drawFrame = (laneMax: number, axisMax: number): void => {
      if (layout && layout.laneMax === laneMax && layout.axisMax === axisMax) return;
      layout = { laneMax, axisMax };
      gAxis.replaceChildren();
      gLanes.replaceChildren();
      laneRows.length = 0;
      for (let s = 0; s <= axisMax; s += 1) {
        const x = xOf(s);
        el('line', { x1: x, x2: x, y1: LANE_TOP - 4, y2: linesBottom, stroke: c.border, 'stroke-width': s % 2 === 0 ? 1 : 0.5 }, gAxis);
        if (s % 2 === 0 || s === axisMax) {
          text(String(s), { x, y: AXIS_Y, 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs, 'font-family': fonts.mono }, gAxis);
        }
      }
      for (let lane = 0; lane < laneMax; lane += 1) {
        const y = LANE_TOP + lane * laneH();
        const rect = el('rect', { x: TX0, y: y + 2, width: TX1 - TX0, height: laneH() - 4, rx: 3, fill: c.bgSubtle, stroke: c.border }, gLanes);
        rect.style.transition = 'opacity 300ms';
        const label = text(String(lane + 1), { x: TX0 - 10, y: y + laneH() / 2 + 4, 'text-anchor': 'end', fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, gLanes);
        label.style.transition = 'opacity 300ms';
        laneRows.push({ rect, label });
      }
    };

    // ── 그래프 (대상 → 입력). 열 = 입력을 따라 내려간 깊이, 첫 열의 행 = 데이터 차례
    const nodes = new Map<string, { box: SVGRectElement; badge: SVGTextElement }>();
    const drawGraph = (targets: StageTarget[]): void => {
      gGraph.replaceChildren();
      nodes.clear();
      const byId = new Map(targets.map((tg) => [tg.id, tg]));
      const depth = new Map<string, number>();
      const depthOf = (id: string, seen: Set<string>): number => {
        const known = depth.get(id);
        if (known !== undefined) return known;
        const tg = byId.get(id);
        if (!tg) throw new Error(`dependency-graph stage: 모르는 입력 ${id}`);
        if (seen.has(id)) throw new Error(`dependency-graph stage: 고리 ${id}`);
        seen.add(id);
        const d = tg.needs.length === 0 ? 0 : 1 + Math.max(...tg.needs.map((m) => depthOf(m, seen)));
        seen.delete(id);
        depth.set(id, d);
        return d;
      };
      for (const tg of targets) depthOf(tg.id, new Set());
      const cols = Math.max(...depth.values()) + 1;
      const nodeW = (GRAPH_X1 - GRAPH_X0 - COL_GAP * (cols - 1)) / cols;
      const leaves = targets.filter((tg) => depth.get(tg.id) === 0);
      const rowH = LANES_H / leaves.length;
      const cy = new Map<string, number>();
      leaves.forEach((tg, k) => cy.set(tg.id, LANE_TOP + rowH * (k + 0.5)));
      const dOf = (id: string): number => {
        const d = depth.get(id);
        if (d === undefined) throw new Error(`dependency-graph stage: ${id} 의 깊이가 없다`);
        return d;
      };
      const ordered = [...targets].sort((a, b) => dOf(a.id) - dOf(b.id));
      for (const tg of ordered) {
        if (cy.has(tg.id)) continue;
        const ys = tg.needs.map((m) => {
          const y = cy.get(m);
          if (y === undefined) throw new Error(`dependency-graph stage: ${m} 의 자리가 아직 없다`);
          return y;
        });
        cy.set(tg.id, ys.reduce((a, b) => a + b, 0) / ys.length);
      }
      const xOfNode = (id: string): number => GRAPH_X0 + dOf(id) * (nodeW + COL_GAP);
      const yOfNode = (id: string): number => {
        const y = cy.get(id);
        if (y === undefined) throw new Error(`dependency-graph stage: ${id} 의 자리가 없다`);
        return y;
      };
      // 화살: 대상의 왼쪽 가장자리에서 입력의 오른쪽 가장자리로
      for (const tg of targets) {
        for (const m of tg.needs) {
          const x1 = xOfNode(tg.id);
          const y1 = yOfNode(tg.id);
          const x2 = xOfNode(m) + nodeW;
          const y2 = yOfNode(m);
          el('line', { x1, y1, x2: x2 + 5, y2, stroke: c.textMuted, 'stroke-width': 1.2 }, gGraph);
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const ax = (a: number, r: number): string => `${x2 + Math.cos(ang + a) * r},${y2 + Math.sin(ang + a) * r}`;
          el('polygon', { points: `${x2},${y2} ${ax(Math.PI - 0.45, 7)} ${ax(Math.PI + 0.45, 7)}`, fill: c.textMuted }, gGraph);
        }
      }
      for (const tg of targets) {
        const x = xOfNode(tg.id);
        const y = yOfNode(tg.id) - NODE_H / 2;
        const box = el('rect', { x, y, width: nodeW, height: NODE_H, rx: 4, fill: c.bg, stroke: c.text, 'stroke-width': 1.2 }, gGraph);
        text(tg.id, { x: x + nodeW / 2, y: y + 15, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs }, gGraph);
        text(t('label.seconds', '{n} s', { n: tg.seconds }), { x: x + nodeW / 2, y: y + 29, 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs }, gGraph);
        const badge = text('', { x: x + nodeW, y: y - 4, 'text-anchor': 'end', fill: c.itemComparing, 'font-size': fontSizes.xs, 'font-weight': 600 }, gGraph);
        nodes.set(tg.id, { box, badge });
      }
    };
    const markWaiting = (ids: string[]): void => {
      for (const [id, nd] of nodes) {
        const on = ids.includes(id);
        nd.box.setAttribute('stroke', on ? c.itemComparing : c.text);
        nd.box.setAttribute('stroke-dasharray', on ? '4 3' : '');
        nd.box.setAttribute('stroke-width', on ? '2' : '1.2');
        nd.badge.textContent = on ? t('label.waiting', 'waiting') : '';
      }
      for (const id of ids) if (!nodes.has(id)) throw new Error(`dependency-graph stage: 기다리는 ${id} 가 그래프에 없다`);
    };

    // ── 시간 막대
    const bars = new Map<string, Bar>();
    const fits = (label: string, w: number): boolean => label.length * charW + 8 <= w;
    const placeBar = (b: Bar, id: string, v: number[]): void => {
      const [x, y, w] = v as [number, number, number];
      b.pos = [x, y, w];
      b.g.setAttribute('transform', `translate(${x},${y})`);
      b.rect.setAttribute('width', String(Math.max(0, w)));
      if (fits(id, w)) {
        b.label.setAttribute('x', '4');
        b.label.setAttribute('y', String(BAR_H / 2 + monoPx * 0.35));
      } else {
        b.label.setAttribute('x', '0');
        b.label.setAttribute('y', '-3');
      }
    };
    const paintBar = (b: Bar, id: string): void => {
      const inside = fits(id, b.pos[2]!);
      if (b.state === 'ghost') {
        b.rect.setAttribute('fill', 'none');
        b.rect.setAttribute('stroke', c.ghostOutline);
        b.rect.setAttribute('stroke-dasharray', '4 3');
        b.label.setAttribute('fill', c.ghostOutline);
      } else {
        const fill = b.state === 'running' ? c.itemActive : c.itemSorted;
        b.rect.setAttribute('fill', fill);
        b.rect.setAttribute('stroke', c.stateInk);
        b.rect.setAttribute('stroke-dasharray', '');
        b.label.setAttribute('fill', inside ? c.textInverse : c.text);
      }
    };
    const startBar = (s: StageStart, ms: number): void => {
      const to = [xOf(s.start), barY(s.lane), xOf(s.end) - xOf(s.start)];
      let b = bars.get(s.id);
      if (!b) {
        const g = el('g', {}, gBars);
        const rect = el('rect', { x: 0, y: 0, height: BAR_H, rx: 3, 'stroke-width': 1 }, g);
        const label = text(s.id, { 'font-family': fonts.mono, 'font-size': fontSizes.xs }, g);
        b = { g, rect, label, pos: [to[0]!, to[1]!, 0], state: 'running' };
        bars.set(s.id, b);
      }
      const bar = b;
      bar.state = 'running';
      // 옮겨 갈 동안에도 채움은 바로 — 무엇이 막 올랐는지가 먼저 보인다
      placeBar(bar, s.id, bar.pos);
      paintBar(bar, s.id);
      tween(bar, [...bar.pos], to, ms, (v) => {
        placeBar(bar, s.id, v);
        paintBar(bar, s.id);
      });
    };
    const finishBar = (id: string): void => {
      const b = bars.get(id);
      if (!b || b.state !== 'running') throw new Error(`dependency-graph stage: 끝난 ${id} 가 일하는 막대가 아니다`);
      b.state = 'done';
      paintBar(b, id);
    };

    // ── 바닥 띠 (가장 긴 사슬) · 바닥 선 · 끝 시각 선 · 시계 선
    const blocks = new Map<string, Block>();
    const floorLine = el('line', { y1: LANE_TOP - 4, y2: STRIP_Y + STRIP_H, stroke: c.stateInk, 'stroke-width': 2, 'stroke-dasharray': '6 4', visibility: 'hidden' }, gLines);
    const floorLabel = text(t('label.chain', '← longest chain'), { y: STRIP_Y + STRIP_H / 2 + 4, 'font-size': fontSizes.xs, 'font-weight': 600, visibility: 'hidden' }, gLines);
    const clockLine = el('line', { y1: LANE_TOP - 4, y2: linesBottom, stroke: c.textMuted, 'stroke-width': 1.5, visibility: 'hidden' }, gLines);
    const finishLine = el('line', { y1: LANE_TOP - 8, y2: linesBottom, 'stroke-width': 3, visibility: 'hidden' }, gLines);
    const floorMark = text(t('label.onFloor', 'stopped at the floor'), { y: STRIP_Y + STRIP_H + 20, 'font-size': fontSizes.xs, 'font-weight': 600, fill: c.danger, visibility: 'hidden' }, gLines);
    const gapBand = el('rect', { y: LANE_TOP, height: LANES_H, fill: c.accent, 'fill-opacity': 0.28, width: 0, visibility: 'hidden' }, gGap);
    let floorX: number | null = null;
    let clockX: number | null = null;
    let finishX: number | null = null;

    const placeFloor = (x: number): void => {
      floorX = x;
      floorLine.setAttribute('x1', String(x));
      floorLine.setAttribute('x2', String(x));
      floorLabel.setAttribute('x', String(x + 6));
    };
    const placeClock = (x: number): void => {
      clockX = x;
      clockLine.setAttribute('x1', String(x));
      clockLine.setAttribute('x2', String(x));
    };
    const placeFinish = (x: number): void => {
      finishX = x;
      finishLine.setAttribute('x1', String(x));
      finishLine.setAttribute('x2', String(x));
    };
    const placeGap = (a: number, b: number): void => {
      gapBand.setAttribute('x', String(Math.min(a, b)));
      gapBand.setAttribute('width', String(Math.abs(b - a)));
    };

    const drawChain = (chain: { id: string; seconds: number }[], chainSeconds: number, ms: number): void => {
      let acc = 0;
      const keep = new Set<string>();
      for (const link of chain) {
        const to = [xOf(acc), STRIP_Y, xOf(acc + link.seconds) - xOf(acc)];
        acc += link.seconds;
        keep.add(link.id);
        let bl = blocks.get(link.id);
        const entering = !bl;
        if (!bl) {
          const g = el('g', {}, gStrip);
          const rect = el('rect', { x: 0, y: 0, height: STRIP_H, rx: 3, fill: c.accent, stroke: c.stateInk, 'stroke-width': 1 }, g);
          const label = text(link.id, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text }, g);
          bl = { g, rect, label, pos: [to[0]!, STRIP_Y + STRIP_H * 2, to[2]!] };
          blocks.set(link.id, bl);
        }
        const block = bl;
        const apply = (v: number[]): void => {
          const [x, y, w] = v as [number, number, number];
          block.pos = [x, y, w];
          block.g.setAttribute('transform', `translate(${x},${y})`);
          block.rect.setAttribute('width', String(Math.max(0, w)));
          block.g.setAttribute('opacity', String(Math.max(0, Math.min(1, 1 - (y - STRIP_Y) / (STRIP_H * 2)))));
          const inside = fits(link.id, w);
          block.label.setAttribute('x', inside ? '4' : '0');
          block.label.setAttribute('y', inside ? String(STRIP_H / 2 + monoPx * 0.35) : String(STRIP_H + monoPx + 2));
        };
        tween(block, entering ? [...block.pos] : [...block.pos], to, ms, apply);
      }
      if (acc !== chainSeconds) throw new Error(`dependency-graph stage: 사슬 칸의 합 ${acc} 이 사슬 ${chainSeconds} 과 다르다`);
      for (const [id, bl] of blocks) {
        if (keep.has(id)) continue;
        blocks.delete(id);
        const leaving = bl;
        tween(leaving, [...leaving.pos], [leaving.pos[0]!, STRIP_Y + STRIP_H * 2, leaving.pos[2]!], ms, (v) => {
          const [x, y, w] = v as [number, number, number];
          leaving.pos = [x, y, w];
          leaving.g.setAttribute('transform', `translate(${x},${y})`);
          leaving.g.setAttribute('opacity', String(Math.max(0, 1 - (y - STRIP_Y) / (STRIP_H * 2))));
          if (y >= STRIP_Y + STRIP_H * 2) leaving.g.remove();
        });
      }
      const target = xOf(chainSeconds);
      floorLine.setAttribute('visibility', 'visible');
      floorLabel.setAttribute('visibility', 'visible');
      tween(floorLine, [floorX ?? target], [target], ms, ([x]) => placeFloor(x!));
    };

    const instance: DependencyGraphStage = {
      round(p, ms) {
        drawFrame(p.laneMax, p.axisMax);
        laneRows.forEach((row, lane) => {
          const on = lane < p.workers;
          row.rect.style.opacity = on ? '1' : '0.25';
          row.rect.setAttribute('stroke-dasharray', on ? '' : '4 3');
          row.label.style.opacity = on ? '1' : '0.3';
        });
        drawGraph(p.targets);
        markWaiting([]);
        // 앞 판의 막대는 빈 틀로 남는다 — 이 판에서 시작할 때 새 자리로 옮겨 간다
        const ids = new Set(p.targets.map((tg) => tg.id));
        for (const [id, b] of bars) {
          if (!ids.has(id)) {
            b.g.remove();
            bars.delete(id);
            continue;
          }
          b.state = 'ghost';
          paintBar(b, id);
        }
        drawChain(p.chain, p.chainSeconds, ms);
        // 결론(끝 시각 선의 색 · 멈춤 표지 · 차이 띠)은 걷고, 끝 시각 선의 자리는 빈 틀로 남긴다
        floorMark.setAttribute('visibility', 'hidden');
        gapBand.setAttribute('visibility', 'hidden');
        if (finishX !== null) {
          finishLine.setAttribute('visibility', 'visible');
          finishLine.setAttribute('stroke', c.ghostOutline);
          finishLine.setAttribute('stroke-dasharray', '4 3');
        }
        clockLine.setAttribute('visibility', 'visible');
        tween(clockLine, [clockX ?? xOf(0)], [xOf(0)], ms, ([x]) => placeClock(x!));
        caption.textContent = t('caption.round', '{workers} workers — nothing has started yet', { workers: p.workers });
      },
      tick(p, ms) {
        for (const id of p.finished) finishBar(id);
        for (const s of p.started) startBar(s, ms);
        markWaiting(p.waiting);
        tween(clockLine, [clockX ?? xOf(p.t)], [xOf(p.t)], ms, ([x]) => placeClock(x!));
        const parts = [t('caption.at', 'At {t} s', { t: p.t })];
        if (p.finished.length > 0) parts.push(t('caption.finished', 'finished: {names}', { names: p.finished.join(', ') }));
        if (p.started.length > 0) parts.push(t('caption.started', 'started: {names}', { names: p.started.map((s) => s.id).join(', ') }));
        caption.textContent = parts.join(' · ');
      },
      stop(p, ms) {
        for (const id of p.finished) finishBar(id);
        markWaiting([]);
        clockLine.setAttribute('visibility', 'hidden');
        const target = xOf(p.finishTime);
        const from = finishX ?? clockX ?? target;
        const floor = xOf(p.chainSeconds);
        finishLine.setAttribute('visibility', 'visible');
        finishLine.setAttribute('stroke', c.danger);
        finishLine.setAttribute('stroke-dasharray', '');
        gapBand.setAttribute('visibility', p.gap > 0 ? 'visible' : 'hidden');
        floorMark.setAttribute('x', String(floor + 6));
        floorMark.setAttribute('visibility', p.gap === 0 ? 'visible' : 'hidden');
        tween(finishLine, [from], [target], ms, ([x]) => {
          placeFinish(x!);
          placeGap(floor, x!);
        });
        caption.textContent =
          p.gap === 0
            ? t('caption.stopFloor', 'Finish at {finish} s — equal to the longest chain, {chain} s', { finish: p.finishTime, chain: p.chainSeconds })
            : t('caption.stopAbove', 'Finish at {finish} s — {gap} s above the longest chain, {chain} s', {
                finish: p.finishTime,
                gap: p.gap,
                chain: p.chainSeconds,
              });
      },
      reset() {
        stopAll();
        gBars.replaceChildren();
        bars.clear();
        gStrip.replaceChildren();
        blocks.clear();
        gGraph.replaceChildren();
        nodes.clear();
        floorX = null;
        clockX = null;
        finishX = null;
        for (const e of [floorLine, floorLabel, clockLine, finishLine, floorMark, gapBand]) e.setAttribute('visibility', 'hidden');
        caption.textContent = '';
      },
      destroy() {
        stopAll();
        root.remove();
      },
    };
    return instance;
  },
};
