/**
 * dns 의 무대 — 세로 위임 나무 · 리졸버의 닳는 캐시 줄 · 아래의 질문 눈금 서른.
 *
 * 움직이는 것:
 *   - 판 안: 질문 점이 클라이언트 → 리졸버로 들어와 적중이면 되돌아 나오고, 놓침이면 나무 아래로
 *     내려간다(첫 놓침은 루트부터 끝까지, 뒤 놓침은 맡은 서버 하나로 곧장). 캐시 줄의 수명 막대는
 *     시각 커서를 따라 닳고 놓침에서 다시 찬다
 *   - 손잡이: 앞 판의 놓침 표지 · 수명 막대 · 옛 답 띠가 흐린 자국으로 남았다가, 새 판의 i 번째 놓침이
 *     올 때 앞 판의 i 번째 놓침 자리에서 새 자리로 옮겨 가며 막대 길이가 바뀐다. 남은 자국은 판 끝에서
 *     판 끝(오른쪽)으로 밀려나 사라진다. 질문 눈금은 제자리에서 모양 · 색만 바뀐다
 *
 * 이 view 는 알고리즘을 모른다 — projector 가 아래 `DnsStage` 의 메서드를 부른다.
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

export type DnsStageHop = { name: string; address: string; zone: string };
export type DnsStageRound = {
  ttl: number;
  maxTtl: number;
  name: string;
  playEndSec: number;
  questionSecs: number[];
  answerBefore: string;
  path: DnsStageHop[];
};
export type DnsStageKind = 'walk' | 'owner' | 'hit' | 'stale';
export type DnsStageQuestion = {
  sec: number;
  kind: DnsStageKind;
  answer: string;
  expirySec: number;
  missOrdinal: number;
  queries: number;
};
export type DnsStageChange = {
  atSec: number;
  before: string;
  after: string;
  heldUntilSec: number;
  heldSeconds: number;
};
export type DnsStageWindow = {
  loSec: number;
  last: boolean;
  questions: DnsStageQuestion[];
  missesSoFar: number;
  change: DnsStageChange | null;
};

/** projector 가 부르는 표면 — `views.stage as unknown as DnsStage` 로 좁힌다. */
export type DnsStage = {
  beginRound(round: DnsStageRound, caption: string, ms: number): Promise<void>;
  playWindow(win: DnsStageWindow, caption: string, ms: number): Promise<void>;
  reset(): void;
};

const W = 760;
const H = 454;
const SVG = 'http://www.w3.org/2000/svg';

// 자리 — 위: 클라이언트 · 리졸버 · 나무, 아래: 시간 축
const CLIENT = { x: 20, y: 110, w: 104, h: 40 };
const RESOLVER = { x: 170, y: 96, w: 176, h: 40 };
const CACHE_TEXT_Y = 158;
const CACHE_BAR_Y = 166;
const CACHE_BAR_H = 8;
const CACHE_BAR_W = 250;
const TTL_Y = 190;
const NS_Y = 214;
const TREE = { x: 460, y: 50, w: 280, h: 34, gap: 54 };
const AX = { x0: 50, x1: 730, y: 390 };
const FLAG_TOP = 346;
const BAR_Y = 356;
const BAR_H = 5;
/** 이웃한 수명 막대가 한 줄로 붙어 보이지 않게 놓침 차례의 홀짝으로 두 줄에 번갈아 둔다 */
const BAR_ROW = 8;
const BAND_TOP = 330;
const CHANGE_TOP = 300;
const LEGEND_Y = 440;

type Pt = { x: number; y: number };
type TickState = 'pending' | 'hit' | 'miss' | 'stale';
type Tick = { sec: number; g: SVGGElement; state: TickState; ghost: boolean };
type Marker = {
  g: SVGGElement;
  line: SVGLineElement;
  label: SVGTextElement;
  bar: SVGRectElement;
  sec: number;
  end: number;
  ghost: boolean;
  /** 이 판에서 옮겨 오기 시작한 자리 (앞 판의 같은 차례 놓침 · 없으면 바로 앞 놓침) */
  from: { sec: number; end: number } | null;
  /** 판 끝에서 밀려나기 시작한 자리 */
  base: { sec: number; end: number } | null;
};
type Span = { sec: number; end: number };
type Band = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement; line: SVGLineElement; change: SVGTextElement; from: number; until: number; ghost: boolean };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

/** 꺾은선을 따라 k(0..1) 만큼 간 자리. */
function along(pts: Pt[], k: number): Pt {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const len = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    segs.push(len);
    total += len;
  }
  let d = clamp01(k) * total;
  for (let i = 0; i < segs.length; i += 1) {
    if (d <= segs[i]! || i === segs.length - 1) {
      const u = segs[i]! === 0 ? 1 : Math.min(1, d / segs[i]!);
      return { x: lerp(pts[i]!.x, pts[i + 1]!.x, u), y: lerp(pts[i]!.y, pts[i + 1]!.y, u) };
    }
    d -= segs[i]!;
  }
  return pts[pts.length - 1]!;
}

export const dnsStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const root = el('g');
    svg.appendChild(root);
    const layerStatic = el('g');
    const layerTree = el('g');
    const layerTimeline = el('g');
    const layerGhost = el('g');
    const layerMarks = el('g');
    const layerTicks = el('g');
    const layerTop = el('g');
    // 캡션을 맨 앞에 둔다 — 글자로 읽는 쪽(검사 · 화면 낭독)이 먼저 만난다
    const caption = el('text', { x: 20, y: 28, fill: pal.text, 'font-family': fonts.body, 'font-size': fontSizes.md });
    root.append(caption, layerStatic, layerTree, layerTimeline, layerGhost, layerMarks, layerTicks, layerTop);

    // 클라이언트 · 리졸버
    const box = (b: { x: number; y: number; w: number; h: number }, label: string): void => {
      layerStatic.appendChild(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6, fill: pal.bgSubtle, stroke: pal.border }));
      const tx = el('text', {
        x: b.x + b.w / 2,
        y: b.y + b.h / 2 + smPx / 2 - 1,
        'text-anchor': 'middle',
        fill: pal.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      tx.textContent = label;
      layerStatic.appendChild(tx);
    };
    box(CLIENT, t('label.client', 'client'));
    box(RESOLVER, t('label.resolver', 'resolver'));
    layerStatic.appendChild(
      el('line', {
        x1: CLIENT.x + CLIENT.w,
        y1: CLIENT.y + CLIENT.h / 2,
        x2: RESOLVER.x,
        y2: CLIENT.y + CLIENT.h / 2,
        stroke: pal.border,
      }),
    );

    // 캐시 줄 — 레코드 글자 · 수명 막대(틀 = TTL, 채움 = 남은 시간)
    const cacheText = el('text', { x: RESOLVER.x, y: CACHE_TEXT_Y, fill: pal.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm });
    const cacheFrame = el('rect', { x: RESOLVER.x, y: CACHE_BAR_Y, width: 0, height: CACHE_BAR_H, rx: 2, fill: 'none', stroke: pal.textMuted });
    const cacheFill = el('rect', { x: RESOLVER.x, y: CACHE_BAR_Y, width: 0, height: CACHE_BAR_H, rx: 2, fill: pal.primary });
    const ttlText = el('text', { x: RESOLVER.x, y: TTL_Y, fill: pal.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm });
    const nsText = el('text', { x: RESOLVER.x, y: NS_Y, fill: pal.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
    layerStatic.append(cacheText, cacheFrame, cacheFill, ttlText, nsText);

    const dot = el('circle', { r: 6, cx: 0, cy: 0, fill: pal.primary, visibility: 'hidden' });
    layerTop.appendChild(dot);

    // 범례
    const legend = el('g');
    layerStatic.appendChild(legend);

    // ── 상태
    let destroyed = false;
    let rnd: DnsStageRound | null = null;
    let ticks: Tick[] = [];
    let markers = new Map<number, Marker>();
    let ghosts = new Map<number, Marker>();
    let band: Band | null = null;
    let ghostBand: Band | null = null;
    let cursorSec = 0;
    let cacheAnswer: string | null = null;
    let cacheExpiry = 0;
    let nsShown = false;
    let ttlShown = 0;
    let ownerAnswer: SVGTextElement | null = null;
    let cursor: SVGLineElement | null = null;
    let anchors: { servers: Pt[] } = { servers: [] };
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    function tween(ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
          draw(1);
          resolve();
          return;
        }
        let start: number | null = null;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const step = (now: number): void => {
          if (destroyed || !waiters.has(wake)) {
            wake();
            return;
          }
          if (start === null) start = now;
          const p = Math.min(1, (now - start) / ms);
          draw(p);
          if (p >= 1) {
            wake();
            return;
          }
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            step(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          step(n);
        });
        frames.add(id);
      });
    }

    const xOf = (sec: number): number => {
      if (!rnd) throw new Error('판이 시작되지 않았다');
      return AX.x0 + (sec / rnd.playEndSec) * (AX.x1 - AX.x0);
    };
    const cachePx = (sec: number): number => {
      if (!rnd) throw new Error('판이 시작되지 않았다');
      return (Math.max(0, sec) / rnd.maxTtl) * CACHE_BAR_W;
    };

    function drawLegend(): void {
      while (legend.firstChild) legend.removeChild(legend.firstChild);
      const items: [TickState | 'flag', string][] = [
        ['pending', t('label.pending', 'not yet asked')],
        ['hit', t('label.hit', 'hit')],
        ['miss', t('label.miss', 'miss')],
        ['stale', t('label.stale', 'stale answer')],
        ['flag', t('label.flag', 'queries sent to servers')],
      ];
      let x = AX.x0;
      for (const [kind, text] of items) {
        const g = el('g');
        if (kind === 'flag') {
          g.appendChild(el('line', { x1: x, y1: LEGEND_Y + 5, x2: x, y2: LEGEND_Y - 7, stroke: pal.primary, 'stroke-width': 2 }));
          const lb = el('text', { x: x + 4, y: LEGEND_Y - 1, fill: pal.primary, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
          lb.textContent = t('label.queriesAdded', '+{n}', { n: 1 });
          g.appendChild(lb);
        } else g.appendChild(shape(kind, false, x, LEGEND_Y));
        const tx = el('text', { x: x + (kind === 'flag' ? 22 : 10), y: LEGEND_Y + 4, fill: pal.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs });
        tx.textContent = text;
        g.appendChild(tx);
        legend.appendChild(g);
        let w = 0;
        for (const ch of text) w += ch.charCodeAt(0) < 128 ? 0.6 : 1;
        x += (kind === 'flag' ? 22 : 10) + w * parseFloat(fontSizes.xs) + 22;
      }
    }

    /** 질문 눈금의 모양 — 색 하나로만 가르지 않는다 (속 빈 원 · 찬 원 · 네모 · 빗금 친 원). */
    function shape(state: TickState, ghost: boolean, x: number, y: number): SVGElement {
      const fill = (c: string): string => (ghost ? 'none' : c);
      const stroke = (c: string): string => (ghost ? pal.textMuted : c);
      const dash = ghost ? '2 2' : 'none';
      if (state === 'pending') return el('circle', { cx: x, cy: y, r: 4, fill: 'none', stroke: pal.textMuted });
      if (state === 'hit') return el('circle', { cx: x, cy: y, r: 5, fill: fill(pal.success), stroke: stroke(pal.success), 'stroke-dasharray': dash });
      if (state === 'miss') return el('rect', { x: x - 5, y: y - 5, width: 10, height: 10, fill: fill(pal.primary), stroke: stroke(pal.primary), 'stroke-dasharray': dash });
      // 옛 답도 적중의 하나다 — 같은 원에 빗금을 긋는다
      const g = el('g');
      g.appendChild(el('circle', { cx: x, cy: y, r: 5, fill: fill(pal.danger), stroke: stroke(pal.danger), 'stroke-dasharray': dash }));
      g.appendChild(el('line', { x1: x - 5, y1: y + 5, x2: x + 5, y2: y - 5, stroke: ghost ? pal.textMuted : pal.bg, 'stroke-width': 2 }));
      return g;
    }

    function setTick(tk: Tick, state: TickState, ghost: boolean): void {
      if (tk.state === state && tk.ghost === ghost && tk.g.firstChild) return;
      tk.state = state;
      tk.ghost = ghost;
      while (tk.g.firstChild) tk.g.removeChild(tk.g.firstChild);
      tk.g.appendChild(shape(state, ghost, xOf(tk.sec), AX.y));
    }

    function makeMarker(queries: number, ordinal: number): Marker {
      const g = el('g');
      const line = el('line', { y1: AX.y - 8, y2: FLAG_TOP, stroke: pal.primary, 'stroke-width': 2 });
      const bar = el('rect', { y: BAR_Y + (ordinal % 2) * BAR_ROW, height: BAR_H, fill: pal.primary, 'fill-opacity': 0.35, stroke: pal.primary });
      const label = el('text', { y: FLAG_TOP - 4, 'text-anchor': 'middle', fill: pal.primary, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
      label.textContent = t('label.queriesAdded', '+{n}', { n: queries });
      g.append(bar, line, label);
      layerMarks.appendChild(g);
      return { g, line, label, bar, sec: 0, end: 0, ghost: false, from: null, base: null };
    }

    function placeMarker(m: Marker, sec: number, end: number): void {
      m.sec = sec;
      m.end = end;
      const x = xOf(sec);
      const xe = xOf(Math.min(end, rnd ? rnd.playEndSec : end));
      m.line.setAttribute('x1', String(x));
      m.line.setAttribute('x2', String(x));
      m.label.setAttribute('x', String(x));
      m.bar.setAttribute('x', String(x));
      m.bar.setAttribute('width', String(Math.max(0, xe - x - 1)));
    }

    function ghostify(m: Marker): void {
      m.ghost = true;
      m.line.setAttribute('stroke', pal.textMuted);
      m.line.setAttribute('stroke-dasharray', '3 2');
      m.label.setAttribute('fill', pal.textMuted);
      m.bar.setAttribute('fill', 'none');
      m.bar.setAttribute('stroke', pal.textMuted);
      m.bar.setAttribute('stroke-dasharray', '3 2');
      layerGhost.appendChild(m.g);
    }

    function makeBand(ch: DnsStageChange): Band {
      const g = el('g');
      const rect = el('rect', { y: BAND_TOP, height: AX.y + 8 - BAND_TOP, fill: pal.danger, 'fill-opacity': 0.14, stroke: pal.danger });
      const line = el('line', { y1: CHANGE_TOP + 4, y2: AX.y + 8, stroke: pal.danger, 'stroke-dasharray': '4 3' });
      const change = el('text', { y: CHANGE_TOP, fill: pal.danger, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
      change.textContent = t('label.change', 'origin {before} → {after}', { before: ch.before, after: ch.after });
      const label = el('text', { y: BAND_TOP - 5, fill: pal.danger, 'font-family': fonts.body, 'font-size': fontSizes.xs });
      label.textContent = t('label.staleHeld', 'stale for {n}s', { n: ch.heldSeconds });
      g.append(rect, line, change, label);
      layerMarks.appendChild(g);
      return { g, rect, label, line, change, from: ch.atSec, until: ch.atSec, ghost: false };
    }

    function placeBand(b: Band, until: number): void {
      b.until = until;
      const x = xOf(b.from);
      b.rect.setAttribute('x', String(x));
      b.rect.setAttribute('width', String(Math.max(0, xOf(until) - x)));
      b.line.setAttribute('x1', String(x));
      b.line.setAttribute('x2', String(x));
      const anchorEnd = x > (AX.x0 + AX.x1) / 2;
      b.change.setAttribute('x', String(x));
      b.change.setAttribute('text-anchor', anchorEnd ? 'end' : 'middle');
      b.label.setAttribute('x', String(x + 4));
    }

    function drawCache(): void {
      if (!rnd) return;
      if (cacheAnswer === null) {
        cacheText.textContent = t('label.cacheEmpty', 'cache: empty');
        cacheText.setAttribute('fill', pal.textMuted);
        cacheFill.setAttribute('width', '0');
        return;
      }
      const remaining = cacheExpiry - cursorSec;
      cacheText.textContent = `${rnd.name} A ${cacheAnswer}`;
      cacheText.setAttribute('fill', remaining > 0 ? pal.text : pal.textMuted);
      cacheText.setAttribute('text-decoration', remaining > 0 ? 'none' : 'line-through');
      cacheFill.setAttribute('width', String(cachePx(Math.min(remaining, ttlShown))));
    }

    function drawCursor(): void {
      if (!cursor || !rnd) return;
      const x = xOf(cursorSec);
      cursor.setAttribute('x1', String(x));
      cursor.setAttribute('x2', String(x));
    }

    function buildRound(r: DnsStageRound): void {
      // 나무
      while (layerTree.firstChild) layerTree.removeChild(layerTree.firstChild);
      anchors = { servers: [] };
      ownerAnswer = null;
      r.path.forEach((hop, i) => {
        const y = TREE.y + i * TREE.gap;
        layerTree.appendChild(el('rect', { x: TREE.x, y, width: TREE.w, height: TREE.h, rx: 6, fill: pal.bgSubtle, stroke: pal.border }));
        const nm = el('text', { x: TREE.x + 10, y: y + 14, fill: pal.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm });
        nm.textContent = hop.name;
        const ad = el('text', { x: TREE.x + 10, y: y + 28, fill: pal.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
        ad.textContent = hop.address;
        layerTree.append(nm, ad);
        if (i > 0) {
          const py = y - TREE.gap + TREE.h;
          layerTree.appendChild(el('line', { x1: TREE.x + 24, y1: py, x2: TREE.x + 24, y2: y, stroke: pal.border, 'stroke-width': 2 }));
          const zn = el('text', { x: TREE.x + 32, y: (py + y) / 2 + 4, fill: pal.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
          zn.textContent = `NS ${hop.zone}`;
          layerTree.appendChild(zn);
        }
        if (i === r.path.length - 1) {
          ownerAnswer = el('text', { x: TREE.x + TREE.w - 10, y: y + 28, 'text-anchor': 'end', fill: pal.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
          ownerAnswer.textContent = `A ${r.answerBefore}`;
          layerTree.appendChild(ownerAnswer);
          const orig = el('text', { x: TREE.x + TREE.w - 10, y: y + 14, 'text-anchor': 'end', fill: pal.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs });
          orig.textContent = t('label.origin', 'origin');
          layerTree.appendChild(orig);
        }
        anchors.servers.push({ x: TREE.x, y: y + TREE.h / 2 });
        layerTree.appendChild(
          el('line', {
            x1: RESOLVER.x + RESOLVER.w,
            y1: RESOLVER.y + RESOLVER.h / 2,
            x2: TREE.x,
            y2: y + TREE.h / 2,
            stroke: pal.border,
            'stroke-dasharray': '2 4',
          }),
        );
      });

      // 시간 축
      while (layerTimeline.firstChild) layerTimeline.removeChild(layerTimeline.firstChild);
      layerTimeline.appendChild(el('line', { x1: AX.x0, y1: AX.y, x2: AX.x1, y2: AX.y, stroke: pal.border }));
      for (let s = 0; s <= r.playEndSec; s += 50) {
        const x = AX.x0 + (s / r.playEndSec) * (AX.x1 - AX.x0);
        layerTimeline.appendChild(el('line', { x1: x, y1: AX.y + 8, x2: x, y2: AX.y + 12, stroke: pal.textMuted }));
        const lb = el('text', { x, y: AX.y + 24, 'text-anchor': 'middle', fill: pal.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs });
        lb.textContent = String(s);
        layerTimeline.appendChild(lb);
      }
      const axTitle = el('text', { x: AX.x1, y: AX.y + 38, 'text-anchor': 'end', fill: pal.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs });
      axTitle.textContent = t('label.axis', 'time (s)');
      layerTimeline.appendChild(axTitle);
      cursor = el('line', { y1: BAND_TOP - 20, y2: AX.y + 8, stroke: pal.textMuted, 'stroke-width': 1 });
      layerTimeline.appendChild(cursor);

      // 질문 눈금 — 자리는 판 내내 그대로, 앞 판의 판정은 흐린 자국으로 남긴다
      const sameSecs = ticks.length === r.questionSecs.length && ticks.every((tk, i) => tk.sec === r.questionSecs[i]);
      if (!sameSecs) {
        while (layerTicks.firstChild) layerTicks.removeChild(layerTicks.firstChild);
        ticks = r.questionSecs.map((sec) => {
          const g = el('g');
          layerTicks.appendChild(g);
          return { sec, g, state: 'pending' as TickState, ghost: false };
        });
        for (const tk of ticks) {
          tk.g.appendChild(shape('pending', false, xOf(tk.sec), AX.y));
        }
      } else {
        for (const tk of ticks) setTick(tk, tk.state, tk.state !== 'pending');
      }
    }

    function clearAll(): void {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      for (const layer of [layerTree, layerTimeline, layerGhost, layerMarks, layerTicks]) {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
      }
      rnd = null;
      ticks = [];
      markers = new Map();
      ghosts = new Map();
      band = null;
      ghostBand = null;
      cursorSec = 0;
      cacheAnswer = null;
      cacheExpiry = 0;
      nsShown = false;
      ttlShown = 0;
      ownerAnswer = null;
      cursor = null;
      caption.textContent = '';
      cacheText.textContent = '';
      ttlText.textContent = '';
      nsText.textContent = '';
      cacheFrame.setAttribute('width', '0');
      cacheFill.setAttribute('width', '0');
      dot.setAttribute('visibility', 'hidden');
    }

    function beginRound(r: DnsStageRound, text: string, ms: number): Promise<void> {
      const prevTtl = rnd ? ttlShown : r.ttl;
      // 앞 판의 결과는 흐린 자국으로 — 새 판이 그 자리에서 옮겨 간다
      for (const g of ghosts.values()) g.g.remove();
      ghosts = markers;
      markers = new Map();
      for (const m of ghosts.values()) ghostify(m);
      if (ghostBand) ghostBand.g.remove();
      ghostBand = band;
      band = null;
      if (ghostBand) {
        ghostBand.ghost = true;
        ghostBand.rect.setAttribute('fill', 'none');
        ghostBand.rect.setAttribute('stroke', pal.textMuted);
        ghostBand.rect.setAttribute('stroke-dasharray', '3 2');
        ghostBand.label.setAttribute('fill', pal.textMuted);
        ghostBand.change.setAttribute('visibility', 'hidden');
        ghostBand.line.setAttribute('visibility', 'hidden');
        layerGhost.appendChild(ghostBand.g);
      }
      rnd = r;
      buildRound(r);
      cursorSec = 0;
      cacheAnswer = null;
      cacheExpiry = 0;
      nsShown = false;
      nsText.textContent = '';
      caption.textContent = text;
      ttlText.textContent = t('label.ttl', 'TTL {ttl}s', { ttl: r.ttl });
      drawCursor();
      const from = prevTtl;
      return tween(from === r.ttl ? 0 : ms, (p) => {
        ttlShown = lerp(from, r.ttl, ease(p));
        cacheFrame.setAttribute('width', String(cachePx(ttlShown)));
        drawCache();
      });
    }

    function pathFor(kind: DnsStageKind): Pt[] {
      const cl: Pt = { x: CLIENT.x + CLIENT.w, y: CLIENT.y + CLIENT.h / 2 };
      const rl: Pt = { x: RESOLVER.x, y: CLIENT.y + CLIENT.h / 2 };
      const rr: Pt = { x: RESOLVER.x + RESOLVER.w, y: RESOLVER.y + RESOLVER.h / 2 };
      const sv = anchors.servers;
      if (sv.length === 0) throw new Error('나무가 없다');
      if (kind === 'hit' || kind === 'stale') return [cl, rl, cl];
      if (kind === 'owner') return [cl, rl, rr, sv[sv.length - 1]!, rr, rl, cl];
      return [cl, rl, rr, ...sv, rr, rl, cl];
    }

    function playWindow(w: DnsStageWindow, text: string, ms: number): Promise<void> {
      const r = rnd;
      if (!r) throw new Error('판이 시작되지 않았다');
      caption.textContent = text;
      const qs = w.questions;
      const n = qs.length;
      if (n === 0) throw new Error('빈 창');
      const d = 1 / n;
      const startSec = cursorSec;
      const startAnswer = cacheAnswer;
      const startExpiry = cacheExpiry;
      const prevSecs = qs.map((_, j) => (j === 0 ? startSec : qs[j - 1]!.sec));
      const byTick = new Map<number, Tick>();
      for (const tk of ticks) byTick.set(tk.sec, tk);
      // 바뀜을 지나는 자리
      let changeAt = 2;
      let changeEnd = 2;
      if (w.change) {
        const ch = w.change;
        const j = qs.findIndex((q) => q.sec >= ch.atSec);
        if (j < 0) {
          changeAt = 1;
          changeEnd = 1;
        } else {
          const span = qs[j]!.sec - prevSecs[j]!;
          const u = span <= 0 ? 0 : (ch.atSec - prevSecs[j]!) / span;
          changeAt = j * d + 0.3 * d * clamp01(u);
          changeEnd = (j + 1) * d;
        }
      }
      const ghostBandFrom = ghostBand ? ghostBand.until : null;

      const draw = (p: number): void => {
        // 시각 커서
        const jc = Math.min(n - 1, Math.floor(p / d));
        const local = clamp01((p - jc * d) / (0.3 * d));
        cursorSec = p >= 1 ? qs[n - 1]!.sec : lerp(prevSecs[jc]!, qs[jc]!.sec, local);
        drawCursor();

        // 판정된 질문 — 눈금 · 캐시 · 놓침 표지
        cacheAnswer = startAnswer;
        cacheExpiry = startExpiry;
        let active: number | null = null;
        qs.forEach((q, j) => {
          const judge = j * d + 0.3 * d;
          const end = (j + 1) * d;
          const tk = byTick.get(q.sec);
          if (!tk) throw new Error(`질문 눈금이 없다: ${q.sec}`);
          if (p < judge && p < 1) return;
          setTick(tk, q.kind === 'hit' ? 'hit' : q.kind === 'stale' ? 'stale' : 'miss', false);
          cacheAnswer = q.answer;
          cacheExpiry = q.expirySec;
          if (q.kind === 'walk' && !nsShown) {
            nsShown = true;
            const owner = r.path[r.path.length - 1]!;
            nsText.textContent = `NS ${owner.zone} → ${owner.name}`;
          }
          const k = p >= 1 ? 1 : clamp01((p - judge) / (end - judge));
          if (k < 1) active = j;
          if (q.missOrdinal < 0) return;
          let m = markers.get(q.missOrdinal);
          const gm = ghosts.get(q.missOrdinal);
          if (!m) {
            m = makeMarker(q.queries, q.missOrdinal);
            const prev = markers.get(q.missOrdinal - 1);
            m.from = gm ? { sec: gm.sec, end: gm.end } : prev ? { sec: prev.sec, end: prev.sec } : { sec: q.sec, end: q.sec };
            markers.set(q.missOrdinal, m);
            if (gm) {
              gm.g.remove();
              ghosts.delete(q.missOrdinal);
            }
          }
          const src: Span = m.from ?? { sec: q.sec, end: q.expirySec };
          const e = ease(k);
          placeMarker(m, lerp(src.sec, q.sec, e), lerp(src.end, q.expirySec, e));
        });
        drawCache();

        // 질문 점
        if (active === null) dot.setAttribute('visibility', 'hidden');
        else {
          const q = qs[active]!;
          const judge = active * d + 0.3 * d;
          const k = clamp01((p - judge) / (0.7 * d));
          const pt = along(pathFor(q.kind), ease(k));
          dot.setAttribute('visibility', 'visible');
          dot.setAttribute('cx', String(pt.x));
          dot.setAttribute('cy', String(pt.y));
          dot.setAttribute('fill', q.kind === 'hit' ? pal.success : q.kind === 'stale' ? pal.danger : pal.primary);
        }

        // 원본 바뀜과 옛 답 띠
        if (w.change && (p >= changeAt || p >= 1)) {
          const ch = w.change;
          if (ownerAnswer) ownerAnswer.textContent = `A ${ch.after}`;
          if (!band) {
            band = makeBand(ch);
            placeBand(band, ghostBandFrom !== null ? ghostBandFrom : ch.atSec);
          }
          const k = p >= 1 ? 1 : clamp01((p - changeAt) / Math.max(1e-6, changeEnd - changeAt));
          placeBand(band, lerp(ghostBandFrom !== null ? ghostBandFrom : ch.atSec, ch.heldUntilSec, ease(k)));
          if (ghostBand && k > 0) {
            ghostBand.g.remove();
            ghostBand = null;
          }
        }

        // 판 끝 — 남은 앞 판의 자국을 판 끝으로 밀어낸다
        if (w.last) {
          const e = ease(p);
          for (const [ord, gm] of ghosts) {
            if (ord < w.missesSoFar) continue;
            const base: Span = gm.base ?? { sec: gm.sec, end: gm.end };
            gm.base = base;
            placeMarker(gm, lerp(base.sec, r.playEndSec, e), lerp(base.end, r.playEndSec, e));
            if (p >= 1) {
              gm.g.remove();
              ghosts.delete(ord);
            }
          }
          if (p >= 1 && ghostBand) {
            ghostBand.g.remove();
            ghostBand = null;
          }
        }
      };
      return tween(ms, draw);
    }

    drawLegend();

    // initialData 만 있어도 걸음 0 의 틀을 보인다 (러너 밖 마운트 · 첫 이벤트 전)
    const init = params.initialData;
    if (init && Array.isArray(init.ttlLadder) && typeof init.ttl === 'number') {
      ttlText.textContent = t('label.ttl', 'TTL {ttl}s', { ttl: init.ttl });
    }

    const api: DnsStage & { destroy(): void } = {
      beginRound,
      playWindow,
      reset: clearAll,
      destroy(): void {
        destroyed = true;
        clearAll();
        root.remove();
      },
    };
    void container;
    return api as unknown as ViewInstance;
  },
};
