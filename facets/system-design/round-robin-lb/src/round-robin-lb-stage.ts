/**
 * round-robin-lb 무대 — 주인공은 둘: 서버 막대(짐)와 사용자 표(붙듦).
 *
 * - 요청 점이 부하 분산기에서 고른 서버로 날아간다 (방식이 바뀌면 길이 바뀐다)
 * - 사용자 표(sess:*)는 마지막으로 간 서버 아래에 붙어 있다가, 그 사용자의 요청이 다른 서버로 가면 새 서버로 건너간다
 * - 서버마다 열린 연결 막대가 오르내린다 (축은 사다리 전체에서 algorithm 이 셈해 준 것 — 돌려도 그대로)
 * - 오른쪽 아래 치우침 누계 선, 링 해시일 때만 오른쪽 위 고리 — 키 자리에서 시계 방향 첫 서버까지 호를 한 번 긋는다
 *
 * 무대는 셈을 다시 하지 않는다 — 고른 서버 · 열린 수 · 사용자마다 마지막 서버 · 치우침 합은 payload 로 받는다.
 * 운동은 CSS transition(transform · stroke-dashoffset) — 마지막 값이 이기므로 되짚기에서 엉키지 않는다.
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

export type BeginInput = {
  policy: number;
  servers: string[];
  keys: string[];
  serverRing: number[];
  keyRing: number[];
  requests: number;
  openAxis: number;
  imbalanceAxis: number;
};
export type DropInput = { tick: number; server: number; alive: number[]; open: number[] };
export type RouteInput = {
  tick: number;
  key: number;
  pick: number;
  moved: boolean;
  imbalanceSum: number;
  open: number[];
  alive: number[];
  lastOf: number[];
};

export type RoundRobinLbStage = {
  reset(): void;
  begin(p: BeginInput, motionMs: number): void;
  drop(p: DropInput, motionMs: number): void;
  route(p: RouteInput, motionMs: number): void;
  setCaption(text: string): void;
  destroy(): void;
};

const W = 720;
const H = 410;
const LEFT_W = 490;
const TAG_W = 42;
const TAG_H = 17;
const WAIT_Y = 10;
const WAIT_X0 = 62;
const WAIT_DX = 43;
const LB_X = 185;
const LB_W = 120;
const LB_Y = 44;
const LB_H = 24;
const SRV_Y = 100;
const SRV_H = 24;
const SRV_W = 96;
const BAR_TOP = 150;
const BAR_BOTTOM = 222;
const BAR_W = 34;
const OPEN_Y = 236;
const STACK_Y = 248;
const STACK_DY = 20;
const CAPTION_Y = 392;
const RING_CX = 610;
const RING_CY = 105;
const RING_R = 60;
const CHART_X0 = 520;
const CHART_X1 = 706;
const CHART_Y0 = 240;
const CHART_Y1 = 350;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: SVGElement,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent.appendChild(node);
  return node;
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`round-robin-lb 무대: ${what} 가 없다`);
  return value;
}

/** 링 자리 0..99 → 고리 위 점 (위에서 시작해 시계 방향). */
function ringPoint(pos: number, r: number): { x: number; y: number } {
  const a = (pos / 100) * Math.PI * 2 - Math.PI / 2;
  return { x: RING_CX + r * Math.cos(a), y: RING_CY + r * Math.sin(a) };
}

type Built = {
  servers: string[];
  keys: string[];
  requests: number;
  openAxis: number;
  imbalanceAxis: number;
  serverRing: number[];
  keyRing: number[];
  serverCx: number[];
  serverBox: SVGRectElement[];
  downLabel: SVGTextElement[];
  bars: SVGRectElement[];
  openText: SVGTextElement[];
  tags: SVGGElement[];
  tagRect: SVGRectElement[];
  tagHome: number[];
  dot: SVGCircleElement;
  ringGroup: SVGGElement;
  keyDots: SVGCircleElement[];
  serverDots: SVGCircleElement[];
  ringArc: SVGPathElement;
  ringKeyLabel: SVGTextElement;
  line: SVGPolylineElement;
  dropMark: SVGLineElement;
  points: string[];
};

export const roundRobinLbStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const svg = params.canvas;
    const root = el('g', {}, svg);
    const caption = el(
      'text',
      { x: 8, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text },
      svg,
    );
    let built: Built | null = null;

    const move = (node: SVGElement, x: number, y: number, ms: number): void => {
      const dur = isInstant() ? 0 : Math.max(0, ms);
      node.style.transition = dur > 0 ? `transform ${dur}ms ease-in-out` : 'none';
      node.style.transform = `translate(${x}px, ${y}px)`;
    };

    const scaleBar = (bar: SVGRectElement, frac: number, ms: number): void => {
      const dur = isInstant() ? 0 : Math.max(0, ms);
      bar.style.transition = dur > 0 ? `transform ${dur}ms ease-out` : 'none';
      bar.style.transform = `scaleY(${frac})`;
    };

    const serverColor = (s: number, n: number): string => need(categorical(n, 'vivid')[s], `서버 ${s} 의 색`);

    /** 사용자 표 자리 — 아직 없으면 위 줄 제 칸, 있으면 그 서버 아래에 번호 차례로 두 줄씩 쌓는다. */
    const layoutTags = (b: Built, lastOf: number[], ms: number): void => {
      const stack = b.servers.map(() => 0);
      for (let k = 0; k < b.keys.length; k++) {
        const s = need(lastOf[k], `사용자 ${k} 의 서버`);
        const g = need(b.tags[k], `사용자 표 ${k}`);
        const rect = need(b.tagRect[k], `사용자 표 틀 ${k}`);
        if (s === -1) {
          move(g, need(b.tagHome[k], `사용자 ${k} 의 자리`), WAIT_Y, ms);
          rect.setAttribute('stroke', c.border);
        } else {
          const cx = need(b.serverCx[s], `서버 ${s}`);
          const slot = need(stack[s], `서버 ${s} 의 칸`);
          stack[s] = slot + 1;
          move(g, cx - TAG_W - 2 + (slot % 2) * (TAG_W + 4), STACK_Y + Math.floor(slot / 2) * STACK_DY, ms);
          rect.setAttribute('stroke', serverColor(s, b.servers.length));
        }
        rect.setAttribute('stroke-width', '1.5');
      }
    };

    const setBars = (b: Built, open: number[], alive: number[], ms: number): void => {
      for (let s = 0; s < b.servers.length; s++) {
        const v = need(open[s], `서버 ${s} 의 열린 수`);
        const a = need(alive[s], `서버 ${s} 의 살아 있음`);
        if (v > b.openAxis) throw new Error(`round-robin-lb 무대: 열린 수 ${v} 가 축 ${b.openAxis} 를 넘는다`);
        const bar = need(b.bars[s], `막대 ${s}`);
        scaleBar(bar, v / b.openAxis, ms);
        bar.setAttribute('fill', a === 1 ? serverColor(s, b.servers.length) : c.textMuted);
        need(b.openText[s], `열린 수 글자 ${s}`).textContent = String(v);
      }
    };

    const build = (p: BeginInput): Built => {
      root.replaceChildren();
      const nS = p.servers.length;
      const ringG = el('g', {}, root);
      const chartG = el('g', {}, root);
      const flowG = el('g', {}, root);

      // 위 줄 — 아직 오지 않은 사용자
      const waitLabel = el(
        'text',
        { x: 6, y: WAIT_Y + 13, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        flowG,
      );
      waitLabel.textContent = t('label.waiting', 'Not yet');

      // 부하 분산기
      el('rect', { x: LB_X, y: LB_Y, width: LB_W, height: LB_H, rx: 4, fill: c.bgSubtle, stroke: c.text }, flowG);
      const lbText = el(
        'text',
        {
          x: LB_X + LB_W / 2,
          y: LB_Y + 16,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        },
        flowG,
      );
      lbText.textContent = t('label.balancer', 'Load balancer');

      const openLabel = el(
        'text',
        { x: 6, y: BAR_TOP - 8, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        flowG,
      );
      openLabel.textContent = t('label.open', 'Open connections');

      const serverCx: number[] = [];
      const serverBox: SVGRectElement[] = [];
      const downLabel: SVGTextElement[] = [];
      const bars: SVGRectElement[] = [];
      const openText: SVGTextElement[] = [];
      for (let s = 0; s < nS; s++) {
        const cx = (LEFT_W / nS) * (s + 0.5) + 8;
        serverCx.push(cx);
        const color = serverColor(s, nS);
        serverBox.push(
          el('rect', { x: cx - SRV_W / 2, y: SRV_Y, width: SRV_W, height: SRV_H, rx: 4, fill: c.bg, stroke: color, 'stroke-width': 2 }, flowG),
        );
        const name = el(
          'text',
          { x: cx, y: SRV_Y + 16, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text },
          flowG,
        );
        name.textContent = need(p.servers[s], `서버 이름 ${s}`);
        const down = el(
          'text',
          { x: cx, y: SRV_Y - 6, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.danger, 'font-weight': 600 },
          flowG,
        );
        downLabel.push(down);
        el('line', { x1: cx - BAR_W, x2: cx + BAR_W, y1: BAR_BOTTOM, y2: BAR_BOTTOM, stroke: c.border }, flowG);
        const bar = el('rect', { x: cx - BAR_W / 2, y: BAR_TOP, width: BAR_W, height: BAR_BOTTOM - BAR_TOP, fill: color }, flowG);
        bar.style.transformBox = 'fill-box';
        bar.style.transformOrigin = 'center bottom';
        bars.push(bar);
        openText.push(
          el('text', { x: cx, y: OPEN_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text }, flowG),
        );
      }

      // 사용자 표
      const tags: SVGGElement[] = [];
      const tagRect: SVGRectElement[] = [];
      const tagHome: number[] = [];
      for (let k = 0; k < p.keys.length; k++) {
        const g = el('g', {}, flowG);
        tagRect.push(el('rect', { x: 0, y: 0, width: TAG_W, height: TAG_H, rx: 3, fill: c.bg, stroke: c.border }, g));
        const label = el(
          'text',
          { x: TAG_W / 2, y: 12, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text },
          g,
        );
        label.textContent = need(p.keys[k], `사용자 이름 ${k}`);
        tags.push(g);
        tagHome.push(WAIT_X0 + k * WAIT_DX);
      }

      const dot = el('circle', { cx: 0, cy: 0, r: 5, fill: c.accent, stroke: c.text, 'stroke-width': 1 }, flowG);
      dot.style.opacity = '0';

      // 링 — 링 해시일 때만 보인다
      el('circle', { cx: RING_CX, cy: RING_CY, r: RING_R, fill: 'none', stroke: c.border, 'stroke-width': 1.5 }, ringG);
      const ringTitle = el(
        'text',
        { x: RING_CX, y: RING_CY + 4, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
        ringG,
      );
      ringTitle.textContent = t('label.ring', 'Ring');
      const ringArc = el('path', { d: '', fill: 'none', stroke: c.accent, 'stroke-width': 4, 'stroke-linecap': 'round' }, ringG);
      const keyDots: SVGCircleElement[] = [];
      for (let k = 0; k < p.keys.length; k++) {
        const pt = ringPoint(need(p.keyRing[k], `키 링 자리 ${k}`), RING_R);
        keyDots.push(el('circle', { cx: pt.x, cy: pt.y, r: 3, fill: c.bg, stroke: c.textMuted }, ringG));
      }
      const serverDots: SVGCircleElement[] = [];
      for (let s = 0; s < nS; s++) {
        const pos = need(p.serverRing[s], `서버 링 자리 ${s}`);
        const pt = ringPoint(pos, RING_R);
        serverDots.push(el('circle', { cx: pt.x, cy: pt.y, r: 6, fill: serverColor(s, nS), stroke: c.text }, ringG));
        const lp = ringPoint(pos, RING_R + 18);
        const lab = el(
          'text',
          { x: lp.x, y: lp.y + 4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text },
          ringG,
        );
        lab.textContent = `${need(p.servers[s], `서버 이름 ${s}`)} ${pos}`;
      }
      const ringKeyLabel = el(
        'text',
        { x: RING_CX, y: RING_CY + 20, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text },
        ringG,
      );

      // 치우침 누계 선
      const chartTitle = el(
        'text',
        { x: CHART_X0, y: CHART_Y0 - 8, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        chartG,
      );
      chartTitle.textContent = t('label.imbalanceSum', 'Imbalance sum');
      el('line', { x1: CHART_X0, x2: CHART_X0, y1: CHART_Y0, y2: CHART_Y1, stroke: c.border }, chartG);
      el('line', { x1: CHART_X0, x2: CHART_X1, y1: CHART_Y1, y2: CHART_Y1, stroke: c.border }, chartG);
      const axisTop = el(
        'text',
        { x: CHART_X0 - 4, y: CHART_Y0 + 4, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted },
        chartG,
      );
      axisTop.textContent = String(p.imbalanceAxis);
      const tickLab = el(
        'text',
        { x: CHART_X1, y: CHART_Y1 + 14, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        chartG,
      );
      tickLab.textContent = t('label.tick', 'Tick {n}', { n: p.requests - 1 });
      const dropMark = el('line', { x1: 0, x2: 0, y1: CHART_Y0, y2: CHART_Y1, stroke: c.danger, 'stroke-dasharray': '3 3' }, chartG);
      dropMark.style.display = 'none';
      const line = el('polyline', { points: '', fill: 'none', stroke: c.primary, 'stroke-width': 2 }, chartG);

      return {
        servers: [...p.servers],
        keys: [...p.keys],
        requests: p.requests,
        openAxis: p.openAxis,
        imbalanceAxis: p.imbalanceAxis,
        serverRing: [...p.serverRing],
        keyRing: [...p.keyRing],
        serverCx,
        serverBox,
        downLabel,
        bars,
        openText,
        tags,
        tagRect,
        tagHome,
        dot,
        ringGroup: ringG,
        keyDots,
        serverDots,
        ringArc,
        ringKeyLabel,
        line,
        dropMark,
        points: [],
      };
    };

    const sameShape = (b: Built, p: BeginInput): boolean =>
      b.servers.join('|') === p.servers.join('|') &&
      b.keys.join('|') === p.keys.join('|') &&
      b.requests === p.requests &&
      b.openAxis === p.openAxis &&
      b.imbalanceAxis === p.imbalanceAxis &&
      b.serverRing.join('|') === p.serverRing.join('|') &&
      b.keyRing.join('|') === p.keyRing.join('|');

    const chartX = (b: Built, tick: number): number =>
      CHART_X0 + (tick / Math.max(1, b.requests - 1)) * (CHART_X1 - CHART_X0);

    const clearConclusions = (b: Built): void => {
      for (let s = 0; s < b.servers.length; s++) {
        need(b.downLabel[s], `빠짐 글자 ${s}`).textContent = '';
        need(b.serverBox[s], `서버 틀 ${s}`).removeAttribute('stroke-dasharray');
        need(b.serverDots[s], `링 서버 점 ${s}`).setAttribute('fill', serverColor(s, b.servers.length));
      }
      b.dot.style.transition = 'none';
      b.dot.style.opacity = '0';
      b.ringArc.setAttribute('d', '');
      b.ringKeyLabel.textContent = '';
      for (const d of b.keyDots) d.setAttribute('fill', c.bg);
      b.points = [];
      b.line.setAttribute('points', '');
      b.dropMark.style.display = 'none';
      caption.textContent = '';
    };

    const stage: RoundRobinLbStage & ViewInstance = {
      reset() {
        root.replaceChildren();
        built = null;
        caption.textContent = '';
      },
      begin(p, motionMs) {
        // 멱등 — 같은 모양이면 요소를 다시 짓지 않고 결론만 걷는다 (표는 제 자리로 돌아간다)
        if (built === null || !sameShape(built, p)) {
          built = build(p);
          layoutTags(built, p.keys.map(() => -1), 0);
          setBars(built, p.servers.map(() => 0), p.servers.map(() => 1), 0);
        } else {
          layoutTags(built, p.keys.map(() => -1), motionMs);
          setBars(built, p.servers.map(() => 0), p.servers.map(() => 1), motionMs);
        }
        clearConclusions(built);
        built.ringGroup.style.display = p.policy === 3 ? '' : 'none';
      },
      drop(p, motionMs) {
        const b = need(built ?? undefined, '첫 그림');
        need(b.downLabel[p.server], `빠진 서버 ${p.server}`).textContent = t('label.down', 'Down');
        need(b.serverBox[p.server], `서버 틀 ${p.server}`).setAttribute('stroke-dasharray', '4 3');
        need(b.serverDots[p.server], `링 서버 점 ${p.server}`).setAttribute('fill', c.bgSubtle);
        setBars(b, p.open, p.alive, motionMs);
        const x = chartX(b, p.tick);
        b.dropMark.setAttribute('x1', String(x));
        b.dropMark.setAttribute('x2', String(x));
        b.dropMark.style.display = '';
        b.dot.style.opacity = '0';
        b.ringArc.setAttribute('d', '');
      },
      route(p, motionMs) {
        const b = need(built ?? undefined, '첫 그림');
        const cx = need(b.serverCx[p.pick], `고른 서버 ${p.pick}`);
        if (p.key < 0 || p.key >= b.keys.length) throw new Error(`round-robin-lb 무대: 모르는 사용자 ${p.key}`);
        // 요청 점 — 부하 분산기에서 고른 서버로 날아간다
        b.dot.style.opacity = '1';
        move(b.dot, LB_X + LB_W / 2, LB_Y + LB_H, 0);
        void b.dot.getBoundingClientRect();
        move(b.dot, cx, SRV_Y, motionMs);
        setBars(b, p.open, p.alive, motionMs);
        layoutTags(b, p.lastOf, motionMs);
        const rect = need(b.tagRect[p.key], `사용자 표 틀 ${p.key}`);
        rect.setAttribute('stroke-width', p.moved ? '3' : '2.5');
        if (p.moved) rect.setAttribute('stroke', c.accent);
        // 누계 선
        if (p.imbalanceSum > b.imbalanceAxis) throw new Error(`round-robin-lb 무대: 치우침 합 ${p.imbalanceSum} 가 축을 넘는다`);
        b.points.push(`${chartX(b, p.tick)},${CHART_Y1 - (p.imbalanceSum / b.imbalanceAxis) * (CHART_Y1 - CHART_Y0)}`);
        b.line.setAttribute('points', b.points.join(' '));
        // 링 — 키 자리에서 고른 서버 자리까지 시계 방향 호
        for (let k = 0; k < b.keyDots.length; k++) {
          need(b.keyDots[k], `키 점 ${k}`).setAttribute('fill', k === p.key ? c.accent : c.bg);
        }
        const from = need(b.keyRing[p.key], `키 링 자리 ${p.key}`);
        const to = need(b.serverRing[p.pick], `서버 링 자리 ${p.pick}`);
        const span = (to - from + 100) % 100;
        const a = ringPoint(from, RING_R);
        const z = ringPoint(to, RING_R);
        const len = (span / 100) * Math.PI * 2 * RING_R;
        b.ringArc.setAttribute('d', `M ${a.x} ${a.y} A ${RING_R} ${RING_R} 0 ${span > 50 ? 1 : 0} 1 ${z.x} ${z.y}`);
        b.ringKeyLabel.textContent = `${need(b.keys[p.key], `키 ${p.key}`)} ${from}`;
        const dur = isInstant() ? 0 : Math.max(0, motionMs);
        b.ringArc.style.transition = 'none';
        b.ringArc.style.strokeDasharray = `${len} ${len}`;
        b.ringArc.style.strokeDashoffset = dur > 0 ? String(len) : '0';
        void b.ringArc.getBoundingClientRect();
        b.ringArc.style.transition = dur > 0 ? `stroke-dashoffset ${dur}ms ease-out` : 'none';
        b.ringArc.style.strokeDashoffset = '0';
      },
      setCaption(text) {
        caption.textContent = text;
      },
      destroy() {
        root.remove();
        caption.remove();
        built = null;
      },
    };
    return stage;
  },
};
