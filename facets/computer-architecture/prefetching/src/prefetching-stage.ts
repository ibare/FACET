/**
 * 프리페치 stage — 줄이 메모리를 떠나 캐시에 닿는 길을 시간 위에 그린다.
 *
 * 화면의 모든 움직임은 **보이는 시각(clock) 하나**가 끈다. projector 가 `flowTo` 로
 * 시각을 흘려 보내면, 그 시각에 맞춰
 *   - 배열 위의 커서가 원소를 따라 옮겨 가고
 *   - 떠난 줄(패킷)이 메모리에서 캐시 자리로 내려오며 (앞서 부를수록 일찍 출발한다)
 *   - 밀려나는 줄이 캐시 자리에서 빠져나가고 (안 쓰고 밀려난 것은 오른쪽 통으로)
 *   - 시간 막대가 일 박자와 기다린 박자로 자란다.
 * 판이 바뀌면 앞 판의 막대가 아래로 내려앉아 겨눔자가 되고, 캐시에 남은 줄은 떨어져 나간다.
 *
 * 세로는 사다리와 무관하게 처음부터 고정이다 (줄 수 · 캐시 줄 수 · 최대 박자를 initialData 에서 셈한다).
 */

import {
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const W = 760;
const H = 468;
const PAD = 24;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 메모리 줄 블록 */
const MEM_TOP = 44;
const MEM_H = 30;
/** 캐시 자리 */
const CACHE_TOP = 232;
const CACHE_H = 40;
const SLOT_W = 104;
const SLOT_GAP = 14;
/** 패킷 */
const PACKET_W = 76;
const PACKET_H = 22;
/** 버린 선반입 통 */
const TRAY_X = 540;
const TRAY_W = W - PAD - TRAY_X;
const CHIP_W = 34;
const CHIP_GAP = 4;
/** 시간 막대 */
const TIME_TOP = 322;
const BAR_H = 18;
const BAR_X = PAD;
const BAR_END = 500;
const GHOST_DROP = 30;
/** 거리별 박자 */
const CHART_BASE = 404;
const CHART_H = 68;
/** 캡션 */
const CAPTION_Y = 440;

export type PrefetchingStage = ViewInstance & {
  startRound(distance: number): void;
  fetch(f: { line: number; slot: number; kind: 'demand' | 'prefetch'; issue: number; arrive: number; stamp: number }): void;
  evict(e: { line: number; at: number; wasted: boolean }): void;
  wait(from: number, to: number): void;
  touch(t: { i: number; line: number; start: number; at: number; stamp: number }): void;
  flowTo(t: number, ms: number): void;
  endRound(distance: number, cycles: number): void;
  setCaption(text: string): void;
};

type Block = {
  line: number;
  slot: number;
  kind: 'demand' | 'prefetch';
  issue: number;
  arrive: number;
  stamps: Array<{ at: number; stamp: number }>;
  evictAt: number | null;
  wasted: boolean;
  firstUse: number | null;
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
};

type Touch = { i: number; start: number; at: number };

type Segment = { from: number; to: number; rect: SVGRectElement };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

export const prefetchingStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params) {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const data = params.initialData ?? {};

    const n = num(data.n, 32);
    const lineElems = Math.max(1, num(data.lineElems, 4));
    const latency = Math.max(1, num(data.latency, 8));
    const capacity = Math.max(1, num(data.cacheLines, 4));
    const ladder = Array.isArray(data.distances)
      ? data.distances.filter((d): d is number => typeof d === 'number')
      : [0];
    const lines = Math.floor(n / lineElems);
    /** 가장 긴 판 — 줄마다 도착을 통째로 기다리는 경우 */
    const maxCycles = n + lines * latency;

    // ── 좌표
    const memGap = 10;
    const blockW = (W - 2 * PAD - (lines - 1) * memGap) / lines;
    const cellW = blockW / lineElems;
    const blockX = (line: number) => PAD + line * (blockW + memGap);
    const elemX = (i: number) => blockX(Math.floor(i / lineElems)) + (i % lineElems) * cellW;
    const slotX = (slot: number) => PAD + slot * (SLOT_W + SLOT_GAP);
    const scale = (BAR_END - BAR_X) / maxCycles;
    const chartColW = TRAY_W / Math.max(1, ladder.length);
    const chartX = (d: number) => TRAY_X + ladder.indexOf(d) * chartColW + chartColW / 2;
    const chartY = (cycles: number) => CHART_BASE - (cycles / maxCycles) * CHART_H;

    const font = (size: number, weight = 400) => ({
      'font-family': fonts.body,
      'font-size': size,
      'font-weight': weight,
    });

    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);

    // ── 메모리의 배열
    el('text', { x: PAD, y: 20, fill: c.textMuted, ...font(12, 600) }, svg).textContent = tr(
      'label.memory',
      'Array in memory',
    );
    const cells: SVGRectElement[] = [];
    for (let line = 0; line < lines; line += 1) {
      el('text', { x: blockX(line) + blockW / 2, y: MEM_TOP - 6, 'text-anchor': 'middle', fill: c.textMuted, ...font(11) }, svg).textContent =
        tr('label.line', 'L{line}', { line });
      el('rect', { x: blockX(line), y: MEM_TOP, width: blockW, height: MEM_H, rx: 4, fill: 'none', stroke: c.border, 'stroke-width': 1.5 }, svg);
    }
    for (let i = 0; i < n; i += 1) {
      cells.push(
        el('rect', {
          x: elemX(i) + 2,
          y: MEM_TOP + 4,
          width: cellW - 4,
          height: MEM_H - 8,
          rx: 2,
          fill: c.itemDefault,
          stroke: c.border,
        }, svg),
      );
    }
    const cursor = el('path', { d: 'M0 0 L6 9 L-6 9 Z', fill: c.text, visibility: 'hidden' }, svg);
    cursor.style.transition = 'transform 220ms ease-out';

    // ── 오는 중
    el('text', { x: W - PAD, y: CACHE_TOP - 64, 'text-anchor': 'end', fill: c.textMuted, ...font(12, 600) }, svg).textContent = tr(
      'label.flight',
      'On the way · {latency} cycles',
      { latency },
    );
    const legendY = CACHE_TOP - 44;
    el('rect', { x: W - PAD - 150, y: legendY - 10, width: 12, height: 12, rx: 2, fill: c.itemComparing }, svg);
    el('text', { x: W - PAD - 134, y: legendY, fill: c.textMuted, ...font(11) }, svg).textContent = tr(
      'label.demand',
      'fetched on a miss',
    );
    el('rect', { x: W - PAD - 150, y: legendY + 8, width: 12, height: 12, rx: 2, fill: c.itemPivot }, svg);
    el('text', { x: W - PAD - 134, y: legendY + 18, fill: c.textMuted, ...font(11) }, svg).textContent = tr(
      'label.prefetch',
      'called ahead',
    );
    const pathLayer = el('g', {}, svg);

    // ── 캐시
    el('text', { x: PAD, y: CACHE_TOP - 8, fill: c.textMuted, ...font(12, 600) }, svg).textContent = tr(
      'label.cache',
      'Cache · {lines} lines',
      { lines: capacity },
    );
    for (let s = 0; s < capacity; s += 1) {
      el('rect', {
        x: slotX(s),
        y: CACHE_TOP,
        width: SLOT_W,
        height: CACHE_H,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1.5,
      }, svg);
    }
    const reserveLayer = el('g', {}, svg);
    const nextOut = el('text', { y: CACHE_TOP + CACHE_H + 16, 'text-anchor': 'middle', fill: c.textMuted, ...font(11) }, svg);
    nextOut.textContent = tr('label.nextOut', '▲ next out');
    nextOut.style.transition = 'transform 220ms ease-out';
    nextOut.setAttribute('visibility', 'hidden');

    el('text', { x: TRAY_X, y: CACHE_TOP - 8, fill: c.textMuted, ...font(12, 600) }, svg).textContent = tr(
      'label.wasted',
      'Pushed out unused',
    );
    el('rect', {
      x: TRAY_X,
      y: CACHE_TOP,
      width: TRAY_W,
      height: CACHE_H,
      rx: 6,
      fill: 'none',
      stroke: c.ghostOutline,
      'stroke-dasharray': '4 3',
    }, svg);
    const chipX = (k: number) => TRAY_X + 8 + k * (CHIP_W + CHIP_GAP);

    // 패킷 · 캐시 블록은 모두 이 층에 — 떠나서 내려와 자리에 앉고 밀려난다
    const blockLayer = el('g', {}, svg);
    const leaveLayer = el('g', {}, svg);

    // ── 시간 막대
    const timeLabel = el('text', { x: BAR_X, y: TIME_TOP - 10, fill: c.textMuted, ...font(12, 600) }, svg);
    el('rect', { x: BAR_X + 200, y: TIME_TOP - 20, width: 12, height: 12, fill: c.textMuted }, svg);
    el('text', { x: BAR_X + 216, y: TIME_TOP - 10, fill: c.textMuted, ...font(11) }, svg).textContent = tr('label.work', 'work');
    el('rect', { x: BAR_X + 270, y: TIME_TOP - 20, width: 12, height: 12, fill: c.danger }, svg);
    el('text', { x: BAR_X + 286, y: TIME_TOP - 10, fill: c.textMuted, ...font(11) }, svg).textContent = tr('label.stall', 'waiting');
    el('rect', {
      x: BAR_X,
      y: TIME_TOP,
      width: BAR_END - BAR_X,
      height: BAR_H,
      fill: 'none',
      stroke: c.border,
    }, svg);
    const ghostHolder = el('g', {}, svg);
    let barG = el('g', {}, svg);
    let segments: Segment[] = [];

    // ── 거리별 박자
    el('text', { x: TRAY_X, y: TIME_TOP - 10, fill: c.textMuted, ...font(12, 600) }, svg).textContent = tr(
      'label.byDistance',
      'Cycles by distance',
    );
    el('line', { x1: TRAY_X, x2: W - PAD, y1: CHART_BASE, y2: CHART_BASE, stroke: c.border }, svg);
    const chart = new Map<number, { ghost: SVGRectElement; live: SVGRectElement; value: SVGTextElement; tick: SVGTextElement; result: number | null }>();
    for (const d of ladder) {
      const x = chartX(d);
      const ghost = el('rect', { x: x - 11, y: CHART_BASE, width: 22, height: 0, fill: 'none', stroke: c.ghostOutline, 'stroke-dasharray': '3 2' }, svg);
      const live = el('rect', { x: x - 11, y: CHART_BASE, width: 22, height: 0, fill: c.textMuted }, svg);
      const value = el('text', { x, y: CHART_BASE - 4, 'text-anchor': 'middle', fill: c.text, ...font(11, 600) }, svg);
      const tick = el('text', { x, y: CHART_BASE + 15, 'text-anchor': 'middle', fill: c.textMuted, ...font(11) }, svg);
      tick.textContent = String(d);
      chart.set(d, { ghost, live, value, tick, result: null });
    }

    // ── 캡션
    const caption = el('text', { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', fill: c.text, ...font(13) }, svg);

    // ── 상태
    let clock = 0;
    let flow: Array<{ to: number; ms: number }> = [];
    let flowFrom = 0;
    let flowStart = -1;
    let blocks: Block[] = [];
    let touches: Touch[] = [];
    let roundDistance = ladder[0] ?? 0;
    const tweens = new Set<{ start: number; ms: number; step: (p: number) => void }>();
    let frame: number | null = null;
    let destroyed = false;

    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const kick = () => {
      if (frame !== null || destroyed) return;
      if (typeof requestAnimationFrame === 'undefined') {
        render();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    /** 시계와 무관한 실제 시간 애니메이션 (판이 바뀔 때 떨어져 나가는 것들). */
    const tweenReal = (ms: number, step: (p: number) => void) => {
      if (isInstant() || ms <= 0) {
        step(1);
        return;
      }
      tweens.add({ start: now(), ms, step });
      kick();
    };

    function tick(): void {
      frame = null;
      if (destroyed) return;
      const tNow = now();
      // 시계를 흘린다
      const seg = flow[0];
      if (seg) {
        if (flowStart < 0) flowStart = tNow;
        const p = seg.ms <= 0 || isInstant() ? 1 : clamp01((tNow - flowStart) / seg.ms);
        clock = flowFrom + (seg.to - flowFrom) * p;
        if (p >= 1) {
          clock = seg.to;
          flow.shift();
          flowFrom = clock;
          flowStart = flow.length > 0 ? tNow : -1;
        }
      }
      for (const tw of [...tweens]) {
        const p = clamp01((tNow - tw.start) / tw.ms);
        tw.step(ease(p));
        if (p >= 1) tweens.delete(tw);
      }
      render();
      if (flow.length > 0 || tweens.size > 0) frame = requestAnimationFrame(tick);
    }

    const packetPos = (b: Block, at: number): { x: number; y: number } => {
      const fromX = blockX(b.line) + blockW / 2 - PACKET_W / 2;
      const fromY = MEM_TOP + MEM_H + 4;
      const toX = slotX(b.slot) + (SLOT_W - PACKET_W) / 2;
      const toY = CACHE_TOP + (CACHE_H - PACKET_H) / 2;
      const p = ease(clamp01((at - b.issue) / Math.max(1, b.arrive - b.issue)));
      return { x: fromX + (toX - fromX) * p, y: fromY + (toY - fromY) * p };
    };

    const stampAt = (b: Block, at: number): number => {
      let s = 0;
      for (const st of b.stamps) if (st.at <= at) s = st.stamp;
      return s;
    };

    function render(): void {
      timeLabel.textContent = tr('label.time', 'Time · t {t}', { t: Math.floor(clock + 1e-6) });

      // 커서 · 배열 칸
      let current = -1;
      for (const tc of touches) if (tc.start <= clock + 1e-6) current = tc.i;
      for (const tc of touches) {
        const cell = cells[tc.i];
        if (!cell) continue;
        if (tc.i === current && clock < tc.at + 1 - 1e-6) cell.setAttribute('fill', c.itemSorted);
        else if (tc.start <= clock + 1e-6) cell.setAttribute('fill', c.border);
      }
      if (current >= 0) {
        cursor.setAttribute('visibility', 'visible');
        cursor.style.transform = `translate(${elemX(current) + cellW / 2}px, ${MEM_TOP + MEM_H + 2}px)`;
      }

      // 줄들 — 떠나기 전 / 오는 중 / 자리에 / 밀려나는 중 / 밀려남
      let wastedShown = 0;
      const resident: Block[] = [];
      for (const b of blocks) {
        if (clock < b.issue - 1e-6) {
          b.g.setAttribute('visibility', 'hidden');
          continue;
        }
        b.g.setAttribute('visibility', 'visible');
        const fill = b.kind === 'prefetch' ? c.itemPivot : c.itemComparing;
        const used = b.firstUse !== null && clock >= b.firstUse - 1e-6;
        const seatX = slotX(b.slot) + (SLOT_W - PACKET_W) / 2;
        const seatY = CACHE_TOP + (CACHE_H - PACKET_H) / 2;
        if (b.evictAt !== null && clock >= b.evictAt - 1e-6) {
          const q = ease(clamp01(clock - b.evictAt));
          const from = packetPos(b, b.evictAt);
          if (b.wasted) {
            const k = wastedShown;
            wastedShown += 1;
            const tx = chipX(k);
            const ty = CACHE_TOP + (CACHE_H - PACKET_H) / 2;
            const w = PACKET_W + (CHIP_W - PACKET_W) * q;
            b.g.setAttribute('transform', `translate(${from.x + (tx - from.x) * q}, ${from.y + (ty - from.y) * q})`);
            b.rect.setAttribute('width', String(w));
            b.rect.setAttribute('fill', c.danger);
            b.rect.setAttribute('stroke', 'none');
            b.rect.removeAttribute('stroke-dasharray');
            b.label.setAttribute('x', String(w / 2));
            b.label.setAttribute('fill', c.stateInk);
            b.label.textContent = tr('label.line', 'L{line}', { line: b.line });
            b.g.setAttribute('opacity', '1');
          } else {
            b.g.setAttribute('transform', `translate(${from.x}, ${from.y + 34 * q})`);
            b.g.setAttribute('opacity', String(1 - q));
          }
          continue;
        }
        resident.push(b);
        const inFlight = clock < b.arrive - 1e-6;
        const pos = inFlight ? packetPos(b, clock) : { x: seatX, y: seatY };
        b.g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
        b.g.setAttribute('opacity', '1');
        b.rect.setAttribute('width', String(PACKET_W));
        b.label.setAttribute('x', String(PACKET_W / 2));
        b.rect.setAttribute('fill', used ? c.bg : fill);
        b.rect.setAttribute('stroke', used ? fill : 'none');
        b.label.setAttribute('fill', used ? c.text : c.stateInk);
        b.label.textContent = inFlight
          ? tr('label.arrive', 'L{line} → t {t}', { line: b.line, t: b.arrive })
          : tr('label.line', 'L{line}', { line: b.line });
      }

      // 오는 중인 줄도 자리를 차지한다 — 빈 자리 점선
      while (reserveLayer.firstChild) reserveLayer.removeChild(reserveLayer.firstChild);
      while (pathLayer.firstChild) pathLayer.removeChild(pathLayer.firstChild);
      for (const b of resident) {
        if (clock >= b.arrive - 1e-6) continue;
        const fill = b.kind === 'prefetch' ? c.itemPivot : c.itemComparing;
        el('rect', {
          x: slotX(b.slot) + 3,
          y: CACHE_TOP + 3,
          width: SLOT_W - 6,
          height: CACHE_H - 6,
          rx: 4,
          fill: 'none',
          stroke: fill,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 3',
        }, reserveLayer);
        el('line', {
          x1: blockX(b.line) + blockW / 2,
          y1: MEM_TOP + MEM_H + 4,
          x2: slotX(b.slot) + SLOT_W / 2,
          y2: CACHE_TOP,
          stroke: fill,
          'stroke-width': 1,
          'stroke-dasharray': '2 3',
        }, pathLayer);
      }

      // 캐시가 가득하면 다음에 나갈 줄
      if (resident.length >= capacity) {
        let victim: Block | null = null;
        for (const b of resident) if (!victim || stampAt(b, clock) < stampAt(victim, clock)) victim = b;
        if (victim) {
          nextOut.setAttribute('visibility', 'visible');
          nextOut.style.transform = `translateX(${slotX(victim.slot) + SLOT_W / 2}px)`;
        }
      } else {
        nextOut.setAttribute('visibility', 'hidden');
      }

      // 시간 막대
      for (const s of segments) {
        const w = Math.max(0, Math.min(s.to, clock) - s.from) * scale;
        s.rect.setAttribute('width', String(w));
      }

      // 거리별 박자 — 지금 판의 기둥은 시계를 따라 자란다
      for (const [d, col] of chart) {
        const isNow = d === roundDistance;
        const h = isNow ? clock : col.result ?? 0;
        const liveH = (h / maxCycles) * CHART_H;
        col.live.setAttribute('y', String(CHART_BASE - liveH));
        col.live.setAttribute('height', String(liveH));
        col.live.setAttribute('fill', isNow ? c.text : c.textMuted);
        col.tick.setAttribute('font-weight', isNow ? '700' : '400');
        col.tick.setAttribute('fill', isNow ? c.text : c.textMuted);
        col.value.setAttribute('y', String(chartY(h) - 4));
        col.value.textContent = h > 0 && (!isNow || flow.length === 0) ? String(Math.round(h)) : '';
      }
    }

    const makeBlock = (f: { line: number; slot: number; kind: 'demand' | 'prefetch'; issue: number; arrive: number; stamp: number }): Block => {
      const g = el('g', { visibility: 'hidden' }, blockLayer);
      const rect = el('rect', { x: 0, y: 0, width: PACKET_W, height: PACKET_H, rx: 4, 'stroke-width': 1.5 }, g);
      const label = el('text', { x: PACKET_W / 2, y: PACKET_H / 2 + 4, 'text-anchor': 'middle', ...font(11, 600) }, g);
      return {
        line: f.line,
        slot: f.slot,
        kind: f.kind,
        issue: f.issue,
        arrive: f.arrive,
        stamps: [{ at: f.issue, stamp: f.stamp }],
        evictAt: null,
        wasted: false,
        firstUse: null,
        g,
        rect,
        label,
      };
    };

    const liveBlock = (line: number): Block | undefined => {
      for (let k = blocks.length - 1; k >= 0; k -= 1) {
        const b = blocks[k]!;
        if (b.line === line && b.evictAt === null) return b;
      }
      return undefined;
    };

    const wrapCaption = (text: string) => {
      while (caption.firstChild) caption.removeChild(caption.firstChild);
      const limit = 96;
      let parts = [text];
      if (text.length > limit) {
        const mid = Math.floor(text.length / 2);
        let cut = text.lastIndexOf(' ', mid + 12);
        if (cut < mid - 30) cut = text.indexOf(' ', mid);
        if (cut > 0) parts = [text.slice(0, cut), text.slice(cut + 1)];
      }
      parts.forEach((p, k) => {
        el('tspan', { x: W / 2, dy: k === 0 ? 0 : 18 }, caption).textContent = p;
      });
    };

    const instance: PrefetchingStage = {
      startRound(distance) {
        roundDistance = distance;
        // 앞 판의 막대는 아래로 내려앉아 겨눔자가 된다
        while (ghostHolder.firstChild) ghostHolder.removeChild(ghostHolder.firstChild);
        const old = barG;
        const oldSegments = segments;
        if (oldSegments.length > 0) {
          ghostHolder.appendChild(old);
          const end = Math.max(...oldSegments.map((s) => s.to));
          const note = el('text', {
            x: BAR_X,
            y: TIME_TOP + BAR_H + 15,
            fill: c.textMuted,
            ...font(11),
          }, old);
          note.textContent = tr('label.previous', 'last run · distance {d} · {cycles}', {
            d: old.dataset.distance ?? '',
            cycles: end,
          });
          tweenReal(450, (p) => {
            old.setAttribute('transform', `translate(0, ${GHOST_DROP * p})`);
            old.setAttribute('opacity', String(1 - 0.6 * p));
          });
        } else {
          old.remove();
        }
        barG = el('g', {}, svg);
        barG.dataset.distance = String(distance);
        segments = [];

        // 캐시에 남은 줄은 떨어져 나간다
        for (const b of blocks) {
          if (b.evictAt !== null && !b.wasted) {
            b.g.remove();
            continue;
          }
          leaveLayer.appendChild(b.g);
          const tf = b.g.getAttribute('transform') ?? 'translate(0, 0)';
          const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(tf);
          const x0 = m ? Number(m[1]) : 0;
          const y0 = m ? Number(m[2]) : 0;
          const g = b.g;
          tweenReal(420, (p) => {
            g.setAttribute('transform', `translate(${x0}, ${y0 + 40 * p})`);
            g.setAttribute('opacity', String(1 - p));
            if (p >= 1) g.remove();
          });
        }
        blocks = [];
        touches = [];
        for (const cell of cells) cell.setAttribute('fill', c.itemDefault);
        cursor.style.transform = `translate(${elemX(0) + cellW / 2}px, ${MEM_TOP + MEM_H + 2}px)`;
        flow = [];
        flowStart = -1;
        clock = 0;
        flowFrom = 0;
        const col = chart.get(distance);
        if (col && col.result !== null) {
          const h = (col.result / maxCycles) * CHART_H;
          col.ghost.setAttribute('y', String(CHART_BASE - h));
          col.ghost.setAttribute('height', String(h));
        }
        render();
        kick();
      },
      fetch(f) {
        blocks.push(makeBlock(f));
        render();
      },
      evict(e) {
        const b = liveBlock(e.line);
        if (!b) return;
        b.evictAt = e.at;
        b.wasted = e.wasted;
      },
      wait(from, to) {
        segments.push({ from, to, rect: el('rect', { x: BAR_X + from * scale, y: TIME_TOP, width: 0, height: BAR_H, fill: c.danger }, barG) });
      },
      touch(t) {
        touches.push({ i: t.i, start: t.start, at: t.at });
        const b = liveBlock(t.line);
        if (b) {
          b.stamps.push({ at: t.at, stamp: t.stamp });
          if (b.firstUse === null) b.firstUse = t.at;
        }
        segments.push({
          from: t.at,
          to: t.at + 1,
          rect: el('rect', { x: BAR_X + t.at * scale, y: TIME_TOP, width: 0, height: BAR_H, fill: c.textMuted }, barG),
        });
      },
      flowTo(t, ms) {
        if (isInstant()) {
          flow = [];
          flowStart = -1;
          clock = t;
          flowFrom = t;
          render();
          return;
        }
        if (flow.length === 0) {
          flowFrom = clock;
          flowStart = -1;
        }
        flow.push({ to: t, ms });
        kick();
      },
      endRound(distance, cycles) {
        const col = chart.get(distance);
        if (col) col.result = cycles;
        kick();
      },
      setCaption(text) {
        wrapCaption(text);
      },
      destroy() {
        destroyed = true;
        if (frame !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
        frame = null;
        tweens.clear();
      },
    };

    params.onScrubStart?.(() => {
      if (frame !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
      frame = null;
      for (const tw of tweens) tw.step(1);
      tweens.clear();
    });

    render();
    return instance;
  },
};
