/**
 * clock-sync 무대 — 위에는 프로세스 셋의 어긋남 톱니(분 축 위의 ms), 아래에는 같은 메시지를 두 눈으로 본다.
 *
 *   왼쪽 아래 — 물리 도장. 프로세스 줄 셋 위에 메시지 화살표가 보냄에서 받음으로 난다. 가로는 **참 보낸 때를 0 으로 둔 ms**.
 *              받는 쪽 도장이 보낸 쪽보다 앞서면 화살표가 뒤로 꺾여 거꾸로 선다.
 *   오른쪽 아래 — 램포트 수. 같은 메시지가 가로 = 램포트 수로 늘 앞으로 선다.
 *
 * 운동: 판 머리(clock-init)에서 톱니가 새 모양으로 옮겨 가고, 앞 판의 화살표는 방향 없는 점선 자리만 남는다.
 * 이 판의 보냄 · 받음 걸음이 그 자리에서 꼬리 · 머리를 새 자리로 옮긴다 — 배수를 올리면 물리 쪽 화살표 끝이
 * 옮겨 가 뒤로 꺾이고, 램포트 쪽은 같은 자리로 돌아와 한 획도 움직이지 않는다.
 *
 * 무대는 셈을 다시 하지 않는다 — 어긋남 · 도장 · 거꾸로 여부 · 축은 모두 payload 로 받는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 480;

/** 톱니 판 */
const TOP = { x0: 70, x1: 740, y0: 44, y1: 176 };
/** 물리 도장 판 */
const PHY = { x0: 70, x1: 480, y0: 236, y1: 396 };
/** 램포트 판 */
const LAM = { x0: 530, x1: 740, y0: 236, y1: 396 };
const CAPTION_Y = [434, 458];

export type ClockAxesView = { offMin: number; offMax: number; relMin: number; relMax: number; lamportMax: number };

export type ClockInitView = {
  drift: number;
  resync: number;
  lastMinute: number;
  processes: string[];
  messages: { id: string; src: number; dst: number }[];
  before: number[][];
  after: number[][];
  resyncMinutes: number[];
  offsets: number[];
  axes: ClockAxesView;
};

export type ClockSendView = {
  index: number;
  id: string;
  minute: number;
  src: number;
  dst: number;
  rel: number;
  lamport: number;
  offsets: number[];
  skew: number;
  hi: number;
  lo: number;
};

export type ClockReceiveView = {
  index: number;
  id: string;
  minute: number;
  src: number;
  dst: number;
  rel: number;
  sendRel: number;
  diff: number;
  lamportSend: number;
  lamportRecv: number;
  inverted: boolean;
};

/** projector 가 부르는 무대 표면. */
export type ClockSyncStage = {
  init(view: ClockInitView, ms: number): void;
  send(view: ClockSendView, ms: number): void;
  receive(view: ClockReceiveView, ms: number): void;
  reset(): void;
  destroy(): void;
};

type Pt = { rel: number; row: number };
type ArrowState = {
  g: SVGGElement;
  line: SVGLineElement;
  head: SVGPolygonElement;
  tailDot: SVGCircleElement;
  label: SVGTextElement;
  tail: Pt;
  tip: Pt;
  mode: 'ghost' | 'live' | 'done';
  danger: boolean;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  if (parent) parent.appendChild(e);
  return e;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export const clockSyncStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const fsXs = fontSizes.xs;
    const fsSm = fontSizes.sm;
    const fsMd = fontSizes.md;

    const root = el('g', {}, svg);
    const frames = new Map<string, number>();
    let destroyed = false;

    const cancelAll = (): void => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
    };
    params.onScrubStart?.(() => cancelAll());

    /** key 마다 하나의 운동 — 같은 key 의 새 운동이 앞 것을 끊는다. */
    const tween = (key: string, ms: number, draw: (u: number) => void): void => {
      const prev = frames.get(key);
      if (prev !== undefined) cancelAnimationFrame(prev);
      frames.delete(key);
      if (destroyed || ms <= 0 || isInstant()) {
        draw(1);
        return;
      }
      const start = performance.now();
      const frame = (now: number): void => {
        if (destroyed) return;
        const u = Math.min(1, (now - start) / ms);
        draw(ease(u));
        if (u < 1) frames.set(key, requestAnimationFrame(frame));
        else frames.delete(key);
      };
      draw(0);
      frames.set(key, requestAnimationFrame(frame));
    };

    const text = (
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { size?: string; anchor?: string; fill?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement => {
      const e = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fsSm,
          'text-anchor': opts.anchor ?? 'start',
          fill: opts.fill ?? pal.text,
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      e.textContent = s;
      return e;
    };

    // ── 늘 있는 틀: 판 제목 셋과 테두리
    const frame = el('g', {}, root);
    text(frame, TOP.x0, TOP.y0 - 14, t('label.offset', 'Clock offset (ms)'), { size: fsMd, weight: '600' });
    text(frame, PHY.x0, PHY.y0 - 14, t('label.physical', 'Physical stamp'), { size: fsMd, weight: '600' });
    text(frame, LAM.x0, LAM.y0 - 14, t('label.lamport', 'Lamport number'), { size: fsMd, weight: '600' });
    for (const box of [TOP, PHY, LAM]) {
      el('rect', { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0, fill: 'none', stroke: pal.border }, frame);
    }

    // ── 판마다 다시 짓는 층
    const axisLayer = el('g', {}, root);
    const toothLayer = el('g', {}, root);
    const cursorLayer = el('g', {}, root);
    const arrowLayer = el('g', {}, root);
    const lamLayer = el('g', {}, root);
    const captionLayer = el('g', {}, root);
    const caption = CAPTION_Y.map((y) => text(captionLayer, W / 2, y, '', { size: fsMd, anchor: 'middle' }));

    const cursorLine = el('line', { x1: 0, y1: TOP.y0, x2: 0, y2: TOP.y1, stroke: pal.textMuted, 'stroke-dasharray': '3 3', visibility: 'hidden' }, cursorLayer);
    const skewBar = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: pal.accent, 'stroke-width': 5, 'stroke-linecap': 'round', visibility: 'hidden' }, cursorLayer);
    const skewText = text(cursorLayer, 0, 0, '', { size: fsXs, mono: true });

    let setup: ClockInitView | null = null;
    let procColors: readonly string[] = [];
    let tooth: { lines: SVGPolylineElement[]; dots: SVGCircleElement[]; before: number[][]; after: number[][] } = {
      lines: [],
      dots: [],
      before: [],
      after: [],
    };
    let cursorMinute = 0;
    const phy = new Map<number, ArrowState>();
    const lam = new Map<number, ArrowState>();

    const need = (): ClockInitView => {
      if (!setup) throw new Error('clock-sync 무대: 판 머리(init) 전에 걸음이 왔다');
      return setup;
    };

    // ── 축 셈 (payload 의 축을 픽셀로 옮길 뿐이다)
    const xMinute = (m: number): number => {
      const s = need();
      return TOP.x0 + 16 + ((TOP.x1 - TOP.x0 - 32) * m) / s.lastMinute;
    };
    const yOffset = (v: number): number => {
      const a = need().axes;
      return TOP.y1 - 10 - ((TOP.y1 - TOP.y0 - 20) * (v - a.offMin)) / (a.offMax - a.offMin);
    };
    const rowY = (box: typeof PHY, row: number): number => {
      const n = need().processes.length;
      return box.y0 + 22 + ((box.y1 - box.y0 - 44) * row) / (n - 1);
    };
    const xRel = (v: number): number => {
      const a = need().axes;
      return PHY.x0 + 34 + ((PHY.x1 - PHY.x0 - 50) * (v - a.relMin)) / (a.relMax - a.relMin);
    };
    const xLam = (v: number): number => {
      const a = need().axes;
      return LAM.x0 + 30 + ((LAM.x1 - LAM.x0 - 44) * v) / (a.lamportMax + 1);
    };

    const toothPoints = (p: number, before: number[][], after: number[][]): string => {
      const pts: string[] = [];
      const b = before[p];
      const a = after[p];
      if (!b || !a) throw new Error(`clock-sync 무대: 프로세스 ${p} 의 톱니가 없다`);
      for (let m = 0; m < a.length; m += 1) {
        pts.push(`${xMinute(m)},${yOffset(b[m]!)}`);
        pts.push(`${xMinute(m)},${yOffset(a[m]!)}`);
      }
      return pts.join(' ');
    };

    const drawArrow = (st: ArrowState, box: typeof PHY, xOf: (v: number) => number): void => {
      const x1 = xOf(st.tail.rel);
      const y1 = rowY(box, st.tail.row);
      const x2 = xOf(st.tip.rel);
      const y2 = rowY(box, st.tip.row);
      st.line.setAttribute('x1', String(x1));
      st.line.setAttribute('y1', String(y1));
      st.line.setAttribute('x2', String(x2));
      st.line.setAttribute('y2', String(y2));
      st.tailDot.setAttribute('cx', String(x1));
      st.tailDot.setAttribute('cy', String(y1));
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1) {
        st.head.setAttribute('points', '');
      } else {
        const ux = dx / len;
        const uy = dy / len;
        const bx = x2 - ux * 8;
        const by = y2 - uy * 8;
        st.head.setAttribute('points', `${x2},${y2} ${bx - uy * 4},${by + ux * 4} ${bx + uy * 4},${by - ux * 4}`);
      }
      st.label.setAttribute('x', String(x2 + (dx < 0 ? -4 : 4)));
      st.label.setAttribute('y', String(y2 + (dy < 0 ? -5 : 12)));
      st.label.setAttribute('text-anchor', dx < 0 ? 'end' : 'start');
    };

    const styleArrow = (st: ArrowState, mode: 'ghost' | 'live' | 'done', danger: boolean): void => {
      st.mode = mode;
      st.danger = danger;
      const ink = mode === 'ghost' ? pal.border : danger ? pal.danger : mode === 'live' ? pal.text : pal.textMuted;
      st.line.setAttribute('stroke', ink);
      st.line.setAttribute('stroke-width', mode === 'live' ? '2.5' : mode === 'ghost' ? '1' : '1.5');
      st.line.setAttribute('stroke-dasharray', mode === 'ghost' ? '3 3' : '');
      st.head.setAttribute('fill', ink);
      st.head.setAttribute('visibility', mode === 'ghost' ? 'hidden' : 'visible');
      st.tailDot.setAttribute('fill', ink);
      st.tailDot.setAttribute('visibility', mode === 'ghost' ? 'hidden' : 'visible');
      st.label.setAttribute('fill', danger ? pal.danger : pal.textMuted);
      st.label.setAttribute('visibility', mode === 'ghost' ? 'hidden' : 'visible');
    };

    const makeArrow = (layer: SVGGElement, id: string, at: Pt): ArrowState => {
      const g = el('g', {}, layer);
      const line = el('line', { 'stroke-linecap': 'round' }, g);
      const head = el('polygon', {}, g);
      const tailDot = el('circle', { r: 3 }, g);
      const label = text(g, 0, 0, id, { size: fsXs, mono: true });
      return { g, line, head, tailDot, label, tail: { ...at }, tip: { ...at }, mode: 'live', danger: false };
    };

    /** 앞 판 화살표는 점선 자리만 남긴다 — 방향 · 색 · 이름(결론)은 걷는다. */
    const ghostAll = (): void => {
      for (const st of phy.values()) styleArrow(st, 'ghost', false);
      for (const st of lam.values()) styleArrow(st, 'ghost', false);
    };

    const dimLive = (): void => {
      for (const st of [...phy.values(), ...lam.values()]) {
        if (st.mode === 'live') styleArrow(st, 'done', st.danger);
      }
    };

    /** 끝 → 끝 운동. 꼬리나 머리를 새 자리로 옮긴다. */
    const moveArrow = (
      key: string,
      st: ArrowState,
      box: typeof PHY,
      xOf: (v: number) => number,
      tail: Pt,
      tip: Pt,
      ms: number,
    ): void => {
      const t0 = { ...st.tail };
      const h0 = { ...st.tip };
      tween(key, ms, (u) => {
        st.tail = { rel: lerp(t0.rel, tail.rel, u), row: lerp(t0.row, tail.row, u) };
        st.tip = { rel: lerp(h0.rel, tip.rel, u), row: lerp(h0.row, tip.row, u) };
        drawArrow(st, box, xOf);
      });
    };

    const clearArrows = (): void => {
      for (const st of phy.values()) st.g.remove();
      for (const st of lam.values()) st.g.remove();
      phy.clear();
      lam.clear();
    };

    const reset = (): void => {
      cancelAll();
      clearArrows();
      axisLayer.replaceChildren();
      toothLayer.replaceChildren();
      tooth = { lines: [], dots: [], before: [], after: [] };
      cursorLine.setAttribute('visibility', 'hidden');
      skewBar.setAttribute('visibility', 'hidden');
      skewText.textContent = '';
      for (const c of caption) c.textContent = '';
      cursorMinute = 0;
      setup = null;
    };

    const drawAxes = (s: ClockInitView): void => {
      axisLayer.replaceChildren();
      // 톱니 판 — 0 ms 선, 분 눈금, 맞춤 표
      const y0 = yOffset(0);
      el('line', { x1: TOP.x0, y1: y0, x2: TOP.x1, y2: y0, stroke: pal.border }, axisLayer);
      text(axisLayer, TOP.x0 - 6, y0 + 4, '0', { size: fsXs, anchor: 'end', fill: pal.textMuted, mono: true });
      text(axisLayer, TOP.x0 - 6, yOffset(s.axes.offMax) + 4, signed(s.axes.offMax), { size: fsXs, anchor: 'end', fill: pal.textMuted, mono: true });
      text(axisLayer, TOP.x0 - 6, yOffset(s.axes.offMin) + 4, signed(s.axes.offMin), { size: fsXs, anchor: 'end', fill: pal.textMuted, mono: true });
      for (let m = 0; m <= s.lastMinute; m += 1) {
        const x = xMinute(m);
        el('line', { x1: x, y1: TOP.y1, x2: x, y2: TOP.y1 + 4, stroke: pal.border }, axisLayer);
        if (m % 5 === 0) text(axisLayer, x, TOP.y1 + 15, String(m), { size: fsXs, anchor: 'middle', fill: pal.textMuted, mono: true });
      }
      text(axisLayer, TOP.x1, TOP.y1 + 15, t('label.minute', 'min'), { size: fsXs, anchor: 'end', fill: pal.textMuted });
      for (const m of s.resyncMinutes) {
        const x = xMinute(m);
        el('polygon', { points: `${x},${TOP.y0 + 2} ${x - 4},${TOP.y0 - 5} ${x + 4},${TOP.y0 - 5}`, fill: pal.primary }, axisLayer);
      }
      if (s.resyncMinutes.length > 0) {
        text(axisLayer, TOP.x1, TOP.y0 - 14, t('label.resync', 'resync'), { size: fsXs, anchor: 'end', fill: pal.primary });
      }
      // 프로세스 줄 — 두 판 모두
      s.processes.forEach((name, p) => {
        for (const box of [PHY, LAM]) {
          const y = rowY(box, p);
          el('line', { x1: box.x0 + 26, y1: y, x2: box.x1 - 6, y2: y, stroke: procColors[p]!, 'stroke-opacity': 0.55, 'stroke-width': 2 }, axisLayer);
          text(axisLayer, box.x0 + 6, y + 4, name, { size: fsSm, fill: procColors[p]!, weight: '600', mono: true });
        }
      });
      // 물리 판 — 참 보낸 때 0 ms
      const xz = xRel(0);
      el('line', { x1: xz, y1: PHY.y0 + 6, x2: xz, y2: PHY.y1 - 6, stroke: pal.textMuted, 'stroke-dasharray': '2 3' }, axisLayer);
      text(axisLayer, xz, PHY.y1 + 14, '0 ms', { size: fsXs, anchor: 'middle', fill: pal.textMuted, mono: true });
      text(axisLayer, xRel(s.axes.relMin), PHY.y1 + 14, signed(s.axes.relMin), { size: fsXs, anchor: 'start', fill: pal.textMuted, mono: true });
      text(axisLayer, xRel(s.axes.relMax), PHY.y1 + 14, signed(s.axes.relMax), { size: fsXs, anchor: 'end', fill: pal.textMuted, mono: true });
      // 램포트 판 — 수 눈금
      for (let v = 0; v <= s.axes.lamportMax; v += 5) {
        text(axisLayer, xLam(v), LAM.y1 + 14, String(v), { size: fsXs, anchor: 'middle', fill: pal.textMuted, mono: true });
      }
    };

    const moveCursor = (minute: number, ms: number): void => {
      const from = cursorMinute;
      cursorMinute = minute;
      cursorLine.setAttribute('visibility', 'visible');
      tween('cursor', ms, (u) => {
        const x = xMinute(lerp(from, minute, u));
        cursorLine.setAttribute('x1', String(x));
        cursorLine.setAttribute('x2', String(x));
      });
    };

    const stage: ClockSyncStage & ViewInstance = {
      init(s, ms) {
        if (s.processes.length < 2) throw new Error('clock-sync 무대: 프로세스가 둘 미만이다');
        if (s.before.length !== s.processes.length || s.after.length !== s.processes.length) {
          throw new Error('clock-sync 무대: 톱니 수가 프로세스 수와 다르다');
        }
        if (s.axes.offMax <= s.axes.offMin || s.axes.relMax <= s.axes.relMin || s.lastMinute <= 0) {
          throw new Error('clock-sync 무대: 축 범위가 비었다');
        }
        const sameShape = setup !== null && setup.processes.join() === s.processes.join();
        setup = s;
        procColors = categorical(s.processes.length, 'vivid');
        drawAxes(s);
        dimLive();
        ghostAll();
        for (const c of caption) c.textContent = '';
        caption[0]!.textContent = t('caption.minute', 'minute {minute}', { minute: 0 });
        skewBar.setAttribute('visibility', 'hidden');
        skewText.textContent = '';
        moveCursor(0, ms);

        // 톱니 — 앞 판의 모양에서 새 모양으로 옮겨 간다 (첫 판은 0 선에서 일어선다)
        const fits = (rows: number[][]): boolean =>
          rows.length === s.after.length && rows.every((r, p) => r.length === s.after[p]!.length);
        if (!sameShape || tooth.lines.length !== s.processes.length || !fits(tooth.before) || !fits(tooth.after)) {
          toothLayer.replaceChildren();
          tooth = {
            lines: s.processes.map((_, p) =>
              el('polyline', { fill: 'none', stroke: procColors[p]!, 'stroke-width': 2, 'stroke-linejoin': 'round' }, toothLayer),
            ),
            dots: s.processes.map((_, p) => el('circle', { r: 4, fill: procColors[p]!, visibility: 'hidden' }, toothLayer)),
            before: s.after.map((row) => row.map(() => 0)),
            after: s.after.map((row) => row.map(() => 0)),
          };
        }
        for (const d of tooth.dots) d.setAttribute('visibility', 'hidden');
        const fromB = tooth.before.map((r) => [...r]);
        const fromA = tooth.after.map((r) => [...r]);
        const toB = s.before;
        const toA = s.after;
        tween('tooth', ms, (u) => {
          const curB = toB.map((row, p) => row.map((v, m) => lerp(fromB[p]![m]!, v, u)));
          const curA = toA.map((row, p) => row.map((v, m) => lerp(fromA[p]![m]!, v, u)));
          tooth.before = curB;
          tooth.after = curA;
          tooth.lines.forEach((line, p) => line.setAttribute('points', toothPoints(p, curB, curA)));
        });
      },

      send(v, ms) {
        const s = need();
        const msg = s.messages[v.index];
        if (!msg || msg.id !== v.id) throw new Error(`clock-sync 무대: 메시지 ${v.id} 가 무대에 없다`);
        if (v.offsets.length !== s.processes.length) throw new Error('clock-sync 무대: 어긋남 수가 프로세스 수와 다르다');
        dimLive();
        moveCursor(v.minute, ms);
        tooth.dots.forEach((d, p) => {
          d.setAttribute('visibility', 'visible');
          d.setAttribute('cx', String(xMinute(v.minute)));
          d.setAttribute('cy', String(yOffset(v.offsets[p]!)));
          d.setAttribute('r', p === v.src ? '5' : '3');
        });
        const x = xMinute(v.minute);
        const yHi = yOffset(v.offsets[v.hi]!);
        const yLo = yOffset(v.offsets[v.lo]!);
        skewBar.setAttribute('visibility', 'visible');
        skewBar.setAttribute('x1', String(x + 9));
        skewBar.setAttribute('x2', String(x + 9));
        skewBar.setAttribute('y1', String(yHi));
        skewBar.setAttribute('y2', String(yLo));
        const right = x + 60 < TOP.x1;
        skewText.setAttribute('x', String(right ? x + 16 : x - 16));
        skewText.setAttribute('text-anchor', right ? 'start' : 'end');
        skewText.setAttribute('y', String((yHi + yLo) / 2 + 4));
        skewText.textContent = `${v.skew} ms`;

        // 물리 쪽 — 꼬리를 새 자리로. 머리는 받을 때까지 꼬리에 붙어 간다.
        const tailP: Pt = { rel: v.rel, row: v.src };
        let a = phy.get(v.index);
        if (!a) {
          a = makeArrow(arrowLayer, v.id, tailP);
          phy.set(v.index, a);
        }
        styleArrow(a, 'live', false);
        a.head.setAttribute('visibility', 'hidden');
        moveArrow(`phy-${v.index}`, a, PHY, xRel, tailP, tailP, ms);

        const tailL: Pt = { rel: v.lamport, row: v.src };
        let b = lam.get(v.index);
        if (!b) {
          b = makeArrow(lamLayer, v.id, tailL);
          lam.set(v.index, b);
        }
        styleArrow(b, 'live', false);
        b.head.setAttribute('visibility', 'hidden');
        moveArrow(`lam-${v.index}`, b, LAM, xLam, tailL, tailL, ms);

        caption[0]!.textContent = t('caption.send', '{id} · minute {minute} · {src} → {dst}', {
          id: v.id,
          minute: v.minute,
          src: s.processes[v.src]!,
          dst: s.processes[v.dst]!,
        });
        caption[1]!.textContent = '';
      },

      receive(v, ms) {
        need();
        const a = phy.get(v.index);
        const b = lam.get(v.index);
        if (!a || !b) throw new Error(`clock-sync 무대: 보내지 않은 메시지 ${v.id} 를 받는다`);
        // 받기 전 머리는 꼬리에 있다 — 거기서 받음 자리로 난다
        a.tip = { ...a.tail };
        b.tip = { ...b.tail };
        styleArrow(a, 'live', v.inverted);
        styleArrow(b, 'live', false);
        moveArrow(`phy-${v.index}`, a, PHY, xRel, { rel: v.sendRel, row: v.src }, { rel: v.rel, row: v.dst }, ms);
        moveArrow(`lam-${v.index}`, b, LAM, xLam, { rel: v.lamportSend, row: v.src }, { rel: v.lamportRecv, row: v.dst }, ms);
        tooth.dots.forEach((d, p) => d.setAttribute('r', p === v.dst ? '5' : '3'));
        caption[0]!.textContent = v.inverted
          ? t('caption.receiveInverted', '{id} · receive − send: {ms} ms · inverted', { id: v.id, ms: signed(v.diff) })
          : t('caption.receive', '{id} · receive − send: {ms} ms', { id: v.id, ms: signed(v.diff) });
        caption[1]!.textContent = t('caption.lamport', 'Lamport: {send} → {recv}', { send: v.lamportSend, recv: v.lamportRecv });
      },

      reset,

      destroy() {
        destroyed = true;
        cancelAll();
        root.remove();
      },
    };
    return stage;
  },
};
