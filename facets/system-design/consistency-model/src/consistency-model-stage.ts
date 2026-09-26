/**
 * consistency-model 무대 — 고리 위 사본 열둘, 가운데 손님, 오른쪽에 라운드 축(옛 사본 곡선 · 같아짐 표지 · 손님 읽기 줄)과 헛 통 더미.
 *
 * 운동
 * - 쓰기: 손님에서 쓰는 사본으로 값이 날아가 그 사본이 물든다.
 * - 퍼뜨림: 가진 사본에서 통이 짝에게 날아간다. 새로 받은 사본은 물들고, 이미 가진 사본에 닿은 통은 튕겨 나와 헛 통 더미로 흩어진다.
 *   옛 사본 곡선의 이 라운드 점은 앞 판(없으면 앞 라운드)의 높이에서 이 판의 높이로 꺼진다. 같아진 라운드 표지는 앞 판의 자리에서 옮겨 온다.
 * - 읽기: 손님의 읽기가 물은 사본으로 가고, 돌려보내지면 고리를 따라 다음 사본으로 옮겨 가 가진 사본에서 멈춘 뒤 값을 들고 돌아온다.
 *
 * 무대는 판정(새로 받음 · 헛 통 · 옛값 · 돌려보냄 · 같아짐)을 하지 않는다 — projector 가 넘긴 payload 를 그린다.
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

export type ConsistencyInitView = {
  replicas: string[];
  key: string;
  client: string;
  writer: string;
  oldValue: number;
  oldVersion: number;
  newValue: number;
  newVersion: number;
  rounds: number;
  rule: number;
  oldAxisMax: number;
  wastedAxisMax: number;
};
export type ConsistencyWriteView = { client: string; writer: string; value: number; version: number; oldCount: number };
export type ConsistencyPushView = {
  round: number;
  sends: { from: string; to: string; wasted: boolean }[];
  newly: string[];
  oldCount: number;
  convergedNow: boolean;
  convergedRound: number;
  wastedTotal: number;
};
export type ConsistencyReadView = {
  round: number;
  rule: number;
  asked: string[];
  bounced: string[];
  served: string;
  value: number;
  stale: boolean;
};

export type ConsistencyModelStage = ViewInstance & {
  reset(): void;
  init(p: ConsistencyInitView): void;
  write(p: ConsistencyWriteView, ms: number): void;
  push(p: ConsistencyPushView, ms: number): void;
  read(p: ConsistencyReadView, ms: number): void;
  setCaption(text: string): void;
};

const W = 760;
const H = 430;
const SVG = 'http://www.w3.org/2000/svg';

const RING_CX = 205;
const RING_CY = 235;
const RING_R = 150;
const NODE_R = 19;

const PLOT_X0 = 470;
const PLOT_X1 = 730;
const PLOT_Y0 = 78;
const PLOT_Y1 = 218;
const READS_Y = 284;

const PILE_X0 = 470;
const PILE_Y0 = 336;
const PILE_COLS = 33;
const PILE_DX = 8;
const PILE_H = 80;

type Point = { x: number; y: number };

type Motion = {
  start: number;
  dur: number;
  frame(p: number): void;
  done(): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

export const consistencyModelStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ConsistencyModelStage {
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);

    const root = el('g', {}, svg);

    // ── 판마다 다시 짓는 상태 ────────────────────────────────────────
    let model: ConsistencyInitView | null = null;
    let nodePos = new Map<string, Point>();
    let nodeCircle = new Map<string, SVGCircleElement>();
    let nodeValue = new Map<string, SVGTextElement>();
    let nodeMark = new Map<string, SVGCircleElement>();
    let fx: SVGGElement | null = null;
    let caption: SVGTextElement | null = null;
    let clientValue: SVGTextElement | null = null;
    let clientBadge: SVGTextElement | null = null;
    let clientBox: SVGRectElement | null = null;
    let curveLine: SVGPolylineElement | null = null;
    let curveDots: SVGGElement | null = null;
    let curvePoints: Point[] = [];
    let marker: SVGGElement | null = null;
    let markerLabel: SVGTextElement | null = null;
    let readsRow: SVGGElement | null = null;
    let pileGroup: SVGGElement | null = null;
    let pileTitle: SVGTextElement | null = null;
    let pileCount = 0;
    let pileDy = PILE_DX;

    // ── 판을 넘어 남는 자리 (결론이 아니라 옮겨 갈 출발점) ──────────────
    let lastCurve = new Map<number, number>(); // 라운드 → 앞 판의 옛 사본 수
    let thisCurve = new Map<number, number>();
    let markerX: number | null = null;

    // ── 운동 ─────────────────────────────────────────────────────────
    let motions: Motion[] = [];
    let raf: number | null = null;
    const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const hasRaf = (): boolean => typeof globalThis.requestAnimationFrame === 'function';

    const tick = (): void => {
      raf = null;
      const time = now();
      const keep: Motion[] = [];
      for (const m of motions) {
        const p = clamp01((time - m.start) / m.dur);
        m.frame(p);
        if (p >= 1) m.done();
        else keep.push(m);
      }
      motions = keep;
      if (motions.length > 0) raf = globalThis.requestAnimationFrame(tick);
    };

    /** 도는 운동을 끝 자리로 붙인다 — 다음 걸음 · 되짚기가 운동을 반쯤 남기지 않게. */
    const settle = (): void => {
      if (raf !== null && hasRaf()) globalThis.cancelAnimationFrame(raf);
      raf = null;
      const list = motions;
      motions = [];
      for (const m of list) {
        m.frame(1);
        m.done();
      }
      if (fx) fx.textContent = '';
    };

    const animate = (dur: number, frame: (p: number) => void, done: () => void = () => {}): void => {
      if (!(dur > 0) || !hasRaf()) {
        frame(1);
        done();
        return;
      }
      motions.push({ start: now(), dur, frame, done });
      if (raf === null) raf = globalThis.requestAnimationFrame(tick);
    };

    const need = <V>(map: Map<string, V>, id: string, what: string): V => {
      const got = map.get(id);
      if (got === undefined) throw new Error(`consistency-model 무대: ${what} ${id} 가 무대에 없다`);
      return got;
    };
    const needModel = (): ConsistencyInitView => {
      if (!model) throw new Error('consistency-model 무대: init 전에 걸음이 왔다');
      return model;
    };
    const plotX = (round: number, m: ConsistencyInitView): number => lerp(PLOT_X0, PLOT_X1, round / m.rounds);
    const plotY = (old: number, m: ConsistencyInitView): number => lerp(PLOT_Y1, PLOT_Y0, old / m.oldAxisMax);
    const pileSlot = (index: number): Point => ({
      x: PILE_X0 + (index % PILE_COLS) * PILE_DX + PILE_DX / 2,
      y: PILE_Y0 + Math.floor(index / PILE_COLS) * pileDy + pileDy / 2,
    });

    const paintNode = (id: string, holdsNew: boolean): void => {
      const m = needModel();
      const circle = need(nodeCircle, id, '사본');
      const value = need(nodeValue, id, '사본');
      circle.setAttribute('fill', holdsNew ? c.itemActive : c.bgSubtle);
      circle.setAttribute('stroke', holdsNew ? c.itemActive : c.border);
      value.textContent = String(holdsNew ? m.newValue : m.oldValue);
      value.setAttribute('fill', holdsNew ? c.textInverse : c.text);
    };

    const drawCurve = (): void => {
      if (!curveLine) return;
      curveLine.setAttribute('points', curvePoints.map((pt) => `${pt.x},${pt.y}`).join(' '));
    };

    const text = (
      parent: Element,
      x: number,
      y: number,
      body: string,
      extra: Record<string, string | number> = {},
    ): SVGTextElement => {
      const node = el(
        'text',
        { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...extra },
        parent,
      );
      node.textContent = body;
      return node;
    };

    const clearBoard = (): void => {
      settle();
      root.textContent = '';
      model = null;
      nodePos = new Map();
      nodeCircle = new Map();
      nodeValue = new Map();
      nodeMark = new Map();
      fx = null;
      caption = null;
      clientValue = null;
      clientBadge = null;
      clientBox = null;
      curveLine = null;
      curveDots = null;
      curvePoints = [];
      marker = null;
      markerLabel = null;
      readsRow = null;
      pileGroup = null;
      pileTitle = null;
      pileCount = 0;
    };

    const stage: ConsistencyModelStage = {
      reset(): void {
        clearBoard();
        lastCurve = new Map();
        thisCurve = new Map();
        markerX = null;
      },

      init(p: ConsistencyInitView): void {
        // 멱등 — 들어오면 비우고 다시 짓는다. 앞 판의 곡선 높이 · 표지 자리만 출발점으로 남긴다.
        if (thisCurve.size > 0) lastCurve = thisCurve;
        thisCurve = new Map();
        clearBoard();
        if (p.oldAxisMax < 1) throw new Error('consistency-model 무대: oldAxisMax 가 1 보다 작다');
        model = p;
        const rows = Math.max(1, Math.ceil(p.wastedAxisMax / PILE_COLS));
        pileDy = Math.min(PILE_DX, PILE_H / rows);

        caption = text(root, 20, 26, '', { 'font-size': fontSizes.md, 'font-weight': 600 });

        // 고리
        el('circle', { cx: RING_CX, cy: RING_CY, r: RING_R, fill: 'none', stroke: c.border, 'stroke-dasharray': '2 5' }, root);
        const nodes = el('g', {}, root);
        const count = p.replicas.length;
        p.replicas.forEach((id, i) => {
          const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
          const pt = { x: RING_CX + RING_R * Math.cos(a), y: RING_CY + RING_R * Math.sin(a) };
          nodePos.set(id, pt);
          const mark = el(
            'circle',
            { cx: pt.x, cy: pt.y, r: NODE_R + 6, fill: 'none', stroke: c.danger, 'stroke-width': 2, 'stroke-dasharray': '3 3', opacity: 0 },
            nodes,
          );
          nodeMark.set(id, mark);
          nodeCircle.set(id, el('circle', { cx: pt.x, cy: pt.y, r: NODE_R, 'stroke-width': 2 }, nodes));
          nodeValue.set(
            id,
            text(nodes, pt.x, pt.y + smPx * 0.38, '', { 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-weight': 600 }),
          );
          const lx = RING_CX + (RING_R + NODE_R + 14) * Math.cos(a);
          const ly = RING_CY + (RING_R + NODE_R + 14) * Math.sin(a);
          text(nodes, lx, ly + smPx * 0.38, id, { 'text-anchor': 'middle', 'font-family': fonts.mono, fill: c.textMuted });
          paintNode(id, false);
        });

        // 손님
        const client = el('g', {}, root);
        clientBox = el(
          'rect',
          { x: RING_CX - 52, y: RING_CY - 34, width: 104, height: 68, rx: 8, fill: c.bg, stroke: c.accent, 'stroke-width': 2 },
          client,
        );
        text(client, RING_CX, RING_CY - 16, `${p.client} · ${p.key}`, { 'text-anchor': 'middle', 'font-family': fonts.mono });
        clientBadge = text(client, RING_CX, RING_CY + 2, '', { 'text-anchor': 'middle', fill: c.textMuted });
        clientValue = text(client, RING_CX, RING_CY + 22, '', { 'text-anchor': 'middle', 'font-weight': 600 });
        text(
          client,
          RING_CX,
          RING_CY + 52,
          p.rule === 1 ? t('label.versionCheck', 'Version check') : t('label.anyCopy', 'Any copy'),
          { 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs },
        );

        // 범례
        const legend = el('g', {}, root);
        el('circle', { cx: 26, cy: 410, r: 6, fill: c.itemActive }, legend);
        text(legend, 38, 414, `${t('label.newValue', 'New value')} ${p.newValue}`);
        el('circle', { cx: 136, cy: 410, r: 6, fill: c.bgSubtle, stroke: c.border }, legend);
        text(legend, 148, 414, `${t('label.oldValue', 'Old value')} ${p.oldValue}`);
        el('circle', { cx: 246, cy: 410, r: 3, fill: c.textMuted }, legend);
        text(legend, 256, 414, t('label.wastedDot', 'Wasted message'));

        // 라운드 축 — 옛 사본 곡선
        const plot = el('g', {}, root);
        text(plot, PLOT_X0 - 34, PLOT_Y0 - 16, t('label.oldCopies', 'Old copies'), { fill: c.textMuted });
        el('line', { x1: PLOT_X0, y1: PLOT_Y1, x2: PLOT_X1, y2: PLOT_Y1, stroke: c.border }, plot);
        el('line', { x1: PLOT_X0, y1: PLOT_Y0, x2: PLOT_X0, y2: PLOT_Y1, stroke: c.border }, plot);
        text(plot, PLOT_X0 - 8, PLOT_Y1 + 4, '0', { 'text-anchor': 'end', fill: c.textMuted, 'font-size': fontSizes.xs });
        text(plot, PLOT_X0 - 8, PLOT_Y0 + 4, String(p.oldAxisMax), {
          'text-anchor': 'end',
          fill: c.textMuted,
          'font-size': fontSizes.xs,
        });
        for (let r = 0; r <= p.rounds; r += 1) {
          text(plot, plotX(r, p), PLOT_Y1 + 16, String(r), {
            'text-anchor': 'middle',
            fill: c.textMuted,
            'font-size': fontSizes.xs,
          });
        }
        text(plot, PLOT_X1, PLOT_Y1 + 32, t('label.round', 'Round'), {
          'text-anchor': 'end',
          fill: c.textMuted,
          'font-size': fontSizes.xs,
        });
        curveLine = el('polyline', { points: '', fill: 'none', stroke: c.itemComparing, 'stroke-width': 2 }, plot);
        curveDots = el('g', {}, plot);

        marker = el('g', { opacity: 0 }, plot);
        el('line', { x1: 0, y1: PLOT_Y0 - 6, x2: 0, y2: PLOT_Y1, stroke: c.text, 'stroke-dasharray': '4 3' }, marker);
        markerLabel = text(marker, 4, PLOT_Y0 - 8, '', { 'font-size': fontSizes.xs });
        marker.setAttribute('transform', `translate(${markerX ?? PLOT_X0},0)`);

        // 손님 읽기 줄
        text(plot, PLOT_X0 - 34, READS_Y - 16, t('label.reads', 'Client reads'), { fill: c.textMuted });
        readsRow = el('g', {}, plot);

        // 헛 통 더미
        pileTitle = text(root, PILE_X0 - 34, PILE_Y0 - 12, '', { fill: c.textMuted });
        pileGroup = el('g', {}, root);

        fx = el('g', {}, root);
      },

      write(p: ConsistencyWriteView, ms: number): void {
        settle();
        const m = needModel();
        const target = need(nodePos, p.writer, '사본');
        if (!fx || !clientBadge || !curveDots || !pileTitle) throw new Error('consistency-model 무대: init 이 덜 지어졌다');
        clientBadge.textContent = t('label.version', 'version {v}', { v: p.version });
        pileTitle.textContent = t('label.wasted', 'Wasted messages: {n}', { n: 0 });
        const token = el('circle', { r: 6, fill: c.itemActive, cx: RING_CX, cy: RING_CY }, fx);
        animate(
          ms,
          (q) => {
            const e = ease(q);
            token.setAttribute('cx', String(lerp(RING_CX, target.x, e)));
            token.setAttribute('cy', String(lerp(RING_CY, target.y, e)));
          },
          () => {
            token.remove();
            paintNode(p.writer, true);
          },
        );
        // 라운드 0 의 곡선 점
        const pt = { x: plotX(0, m), y: plotY(p.oldCount, m) };
        thisCurve.set(0, p.oldCount);
        curvePoints = [pt];
        el('circle', { cx: pt.x, cy: pt.y, r: 3.5, fill: c.itemComparing }, curveDots);
        drawCurve();
      },

      push(p: ConsistencyPushView, ms: number): void {
        settle();
        const m = needModel();
        const layer = fx;
        const dots = curveDots;
        const pile = pileGroup;
        if (!layer || !dots || !pile || !pileTitle) throw new Error('consistency-model 무대: init 이 덜 지어졌다');
        const cut = 0.55;
        let wastedIndex = pileCount;
        for (const s of p.sends) {
          const a = need(nodePos, s.from, '사본');
          const b = need(nodePos, s.to, '사본');
          const token = el('circle', { r: 4, cx: a.x, cy: a.y, fill: s.wasted ? c.textMuted : c.itemActive }, layer);
          if (!s.wasted) {
            const to = s.to;
            animate(
              ms,
              (q) => {
                const e = ease(clamp01(q / cut));
                token.setAttribute('cx', String(lerp(a.x, b.x, e)));
                token.setAttribute('cy', String(lerp(a.y, b.y, e)));
                if (q >= cut) paintNode(to, true);
              },
              () => {
                token.remove();
                paintNode(to, true);
              },
            );
          } else {
            const slot = pileSlot(wastedIndex);
            wastedIndex += 1;
            // 튕김 — 사본에 닿았다가 고리 바깥으로 튀어 더미로 흩어진다
            const out = { x: b.x + (b.x - RING_CX) * 0.35, y: b.y + (b.y - RING_CY) * 0.35 };
            animate(
              ms,
              (q) => {
                if (q < cut) {
                  const e = ease(q / cut);
                  token.setAttribute('cx', String(lerp(a.x, b.x, e)));
                  token.setAttribute('cy', String(lerp(a.y, b.y, e)));
                } else {
                  const e = ease((q - cut) / (1 - cut));
                  const u = 1 - e;
                  token.setAttribute('cx', String(u * u * b.x + 2 * u * e * out.x + e * e * slot.x));
                  token.setAttribute('cy', String(u * u * b.y + 2 * u * e * out.y + e * e * slot.y));
                  token.setAttribute('r', String(lerp(4, 2.5, e)));
                }
              },
              () => {
                token.remove();
                el('circle', { cx: slot.x, cy: slot.y, r: 2.5, fill: c.textMuted }, pile);
              },
            );
          }
        }
        if (wastedIndex !== p.wastedTotal) {
          throw new Error(`consistency-model 무대: 헛 통 누계 ${p.wastedTotal} 와 그린 수 ${wastedIndex} 가 다르다`);
        }
        pileCount = wastedIndex;
        pileTitle.textContent = t('label.wasted', 'Wasted messages: {n}', { n: p.wastedTotal });

        // 옛 사본 곡선 — 앞 판(없으면 앞 라운드)의 높이에서 이 판의 높이로 꺼진다
        const prev = curvePoints[curvePoints.length - 1];
        if (!prev) throw new Error('consistency-model 무대: 쓰기 전에 퍼뜨림이 왔다');
        const fromOld = lastCurve.get(p.round);
        const x = plotX(p.round, m);
        const y0 = fromOld === undefined ? prev.y : plotY(fromOld, m);
        const y1 = plotY(p.oldCount, m);
        thisCurve.set(p.round, p.oldCount);
        const pt = { x, y: y0 };
        curvePoints.push(pt);
        const dot = el('circle', { cx: x, cy: y0, r: 3.5, fill: c.itemComparing }, dots);
        drawCurve();
        animate(ms, (q) => {
          pt.y = lerp(y0, y1, ease(q));
          dot.setAttribute('cy', String(pt.y));
          drawCurve();
        });

        // 같아진 라운드 표지 — 앞 판의 자리에서 옮겨 온다
        if (p.convergedNow) {
          const mk = marker;
          const label = markerLabel;
          if (!mk || !label) throw new Error('consistency-model 무대: 표지가 없다');
          const fromX = markerX ?? x;
          markerX = x;
          label.textContent = t('label.converged', 'Converged: round {r}', { r: p.convergedRound });
          mk.setAttribute('opacity', '1');
          animate(ms, (q) => {
            mk.setAttribute('transform', `translate(${lerp(fromX, x, ease(q))},0)`);
          });
        }
      },

      read(p: ConsistencyReadView, ms: number): void {
        settle();
        const m = needModel();
        const layer = fx;
        const row = readsRow;
        if (!layer || !row || !clientValue || !clientBox) throw new Error('consistency-model 무대: init 이 덜 지어졌다');
        for (const mark of nodeMark.values()) mark.setAttribute('opacity', '0');
        const last = p.asked[p.asked.length - 1];
        if (last !== p.served) throw new Error('consistency-model 무대: 물은 차례의 끝이 준 사본이 아니다');
        const path: Point[] = [{ x: RING_CX, y: RING_CY }];
        for (const id of p.asked) path.push(need(nodePos, id, '사본'));
        path.push({ x: RING_CX, y: RING_CY });
        const bounced = new Set(p.bounced);
        for (const id of p.bounced) need(nodeMark, id, '사본');

        const cv = clientValue;
        const box = clientBox;
        cv.textContent = '';
        box.setAttribute('stroke', c.accent);
        const token = el('circle', { r: 6, cx: RING_CX, cy: RING_CY, fill: c.accent, stroke: c.text }, layer);
        const trail = el('polyline', { points: '', fill: 'none', stroke: c.accent, 'stroke-width': 2 }, layer);
        const segs = path.length - 1;
        const valueTag = text(layer, RING_CX, RING_CY, '', {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-weight': 700,
          fill: p.stale ? c.danger : c.text,
        });
        animate(
          ms,
          (q) => {
            const f = q * segs;
            const seg = Math.min(segs - 1, Math.floor(f));
            const local = ease(f - seg);
            const a = path[seg];
            const b = path[seg + 1];
            if (!a || !b) throw new Error(`consistency-model 무대: 읽기 길 ${seg} 칸이 없다`);
            const x = lerp(a.x, b.x, local);
            const y = lerp(a.y, b.y, local);
            token.setAttribute('cx', String(x));
            token.setAttribute('cy', String(y));
            trail.setAttribute(
              'points',
              [...path.slice(0, Math.min(seg + 1, segs)), { x, y }].map((pt) => `${pt.x},${pt.y}`).join(' '),
            );
            // 지나온 사본 중 돌려보낸 것에 표지
            for (let i = 1; i <= Math.min(seg, p.asked.length); i += 1) {
              const id = p.asked[i - 1];
              if (id !== undefined && bounced.has(id)) need(nodeMark, id, '사본').setAttribute('opacity', '1');
            }
            if (seg === segs - 1) {
              valueTag.textContent = String(p.value);
              valueTag.setAttribute('x', String(x));
              valueTag.setAttribute('y', String(y - 10));
            }
          },
          () => {
            token.remove();
            trail.remove();
            valueTag.remove();
            for (const id of p.bounced) need(nodeMark, id, '사본').setAttribute('opacity', '1');
            cv.textContent = t('label.readValue', 'Read: {v}', { v: p.value });
            cv.setAttribute('fill', p.stale ? c.danger : c.text);
            box.setAttribute('stroke', p.stale ? c.danger : c.accent);
            // 라운드 축 아래 손님 읽기 줄에 이 라운드의 읽은 값
            const x = plotX(p.round, m);
            el(
              'rect',
              {
                x: x - 12,
                y: READS_Y - 10,
                width: 24,
                height: 18,
                rx: 4,
                fill: p.stale ? c.danger : c.bg,
                stroke: p.stale ? c.danger : c.border,
              },
              row,
            );
            text(row, x, READS_Y + 3, String(p.value), {
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: p.stale ? c.textInverse : c.text,
            });
            if (p.bounced.length > 0) {
              text(row, x, READS_Y + 22, `↩${p.bounced.length}`, {
                'text-anchor': 'middle',
                'font-size': fontSizes.xs,
                fill: c.danger,
              });
            }
          },
        );
      },

      setCaption(body: string): void {
        if (!caption) throw new Error('consistency-model 무대: init 전에 캡션이 왔다');
        caption.textContent = body;
      },

      destroy(): void {
        clearBoard();
        root.remove();
      },
    };
    return stage;
  },
};
