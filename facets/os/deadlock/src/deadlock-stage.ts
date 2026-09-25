/**
 * deadlock-stage — 세 스레드의 프로그램 · 기다림 화살 · 몫 × 사이 일 지도.
 *
 * 셈하지 않는다. projector 가 넘긴 장면(줄 글자 · 쥔 자물쇠 · 화살 · 지도 칸)을 그리고, 앞 장면에서
 * 새 장면으로 **옮겨 간다**:
 *   - 프로그램 줄은 글자로 이어져 있어, 사이 일이 늘면 둘째 잡기 줄이 아래로 밀리고 잠금 순서를 바꾸면
 *     C 의 두 잡기 줄이 자리를 바꾼다
 *   - 자물쇠 표는 주인 곁으로 건너가고, 넘겨주면 준 쪽에서 받은 쪽으로 옮겨 간다
 *   - 기다림 화살은 잠든 스레드에서 주인 쪽으로 자라나고, 주인이 놓으면 거둬들여진다
 *   - 지도의 지금 칸 표식이 새 칸으로 건너가고, 칸의 결과가 바뀌면 그 칸이 뒤집힌다
 *
 * 운동 길이는 projector 가 재생 속도로 셈해 넘긴다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type StageCell = { slice: number; gap: number; deadlock: boolean; ticks: number };
export type StageArrow = { from: number; to: number; lock: number };
export type ThreadState = 'running' | 'ready' | 'asleep' | 'done';

export type RoundView = {
  slice: number;
  gap: number;
  threads: string[];
  locks: string[];
  programs: string[][];
  sliceLadder: number[];
  gapLadder: number[];
  cells: StageCell[];
};

export type ChunkView = {
  thread: number;
  lines: { line: number; outcome: 'ran' | 'blocked' }[];
  pc: number[];
  states: ThreadState[];
  held: number[][];
  arrows: StageArrow[];
};

export type ResultView = { deadlock: boolean; cycle: number[] };

export type DeadlockStage = {
  showRound(r: RoundView, ms: number): Promise<void>;
  showChunk(c: ChunkView, ms: number): Promise<void>;
  showResult(r: ResultView, ms: number): Promise<void>;
  setCaption(line1: string, line2: string): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 752;
const H = 310;

// 프로그램 카드
const CARD_X = 16;
const CARD_W = 96;
const CARD_STEP = 104;
const CARD_TOP = 66;
const CARD_H = 206;
const LINE_TOP = CARD_TOP + 34;
const LINE_H = 20;

// 기다림 그림
const G_CX = 436;
const G_CY = 176;
const G_R = 68;
const NODE_R = 20;
const TOKEN_W = 34;
const TOKEN_H = 18;
const POOL_Y = 286;

// 지도
const MAP_X = 604;
const MAP_Y = 104;
const CELL_W = 34;
const CELL_H = 26;

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

type Pt = { x: number; y: number };

export const deadlockStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const sm = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (parent: Element, s: string, attrs: Record<string, string | number>): SVGTextElement => {
      const n = el('text', { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text, ...attrs }, parent);
      n.textContent = s;
      return n;
    };

    // ── 운동 — 진행률을 스스로 그린다. 되짚기면 끝 상태로 건너뛴다.
    type Anim = { draw: (p: number) => void; done: () => void };
    const running = new Set<Anim>();
    const frames = new Set<number>();
    let destroyed = false;
    const finishAll = (): void => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const a of [...running]) {
        a.draw(1);
        a.done();
      }
      running.clear();
    };
    params.onScrubStart?.(finishAll);
    const animate = (ms: number, draw: (p: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
          draw(1);
          resolve();
          return;
        }
        const anim: Anim = {
          draw,
          done: () => {
            running.delete(anim);
            resolve();
          },
        };
        running.add(anim);
        const start = performance.now();
        const tick = (now: number): void => {
          if (!running.has(anim)) return;
          const p = Math.min(1, (now - start) / ms);
          draw(ease(p));
          if (p >= 1 || destroyed || isInstant()) {
            if (p < 1) draw(1);
            anim.done();
            return;
          }
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        draw(0);
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });

    // ── 머리 캡션
    const cap1 = text(svg, '', { x: 16, y: 26, 'font-size': fontSizes.lg, 'font-weight': 600 });
    const cap2 = text(svg, '', { x: 16, y: 48, fill: pal.textMuted });

    // ── 층
    const cardLayer = el('g', {});
    const arrowLayer = el('g', {});
    const nodeLayer = el('g', {});
    const tokenLayer = el('g', {});
    const mapLayer = el('g', {});

    // ── 장면 상태
    let threads: string[] = [];
    let locks: string[] = [];
    let colorsOf: readonly string[] = categorical(3, 'vivid');

    type LineEl = { g: SVGGElement; bg: SVGRectElement; label: SVGTextElement; y: number; row: number };
    type Card = {
      frame: SVGRectElement;
      name: SVGTextElement;
      state: SVGTextElement;
      body: SVGGElement;
      pointer: SVGPolygonElement;
      pointerY: number;
      lines: Map<string, LineEl>;
      order: string[];
    };
    const cards: Card[] = [];

    type NodeEl = { g: SVGGElement; disc: SVGCircleElement; pos: Pt };
    const nodes: NodeEl[] = [];

    type TokenEl = { g: SVGGElement; pos: Pt };
    const tokens: TokenEl[] = [];

    type ArrowEl = { g: SVGGElement; line: SVGLineElement; head: SVGPolygonElement; label: SVGTextElement; a: StageArrow };
    const arrows = new Map<string, ArrowEl>();

    type CellEl = { g: SVGGElement; box: SVGRectElement; label: SVGTextElement; deadlock: boolean; ticks: number; cx: number; cy: number };
    let cells = new Map<string, CellEl>();
    let marker: SVGRectElement | null = null;
    let markerPos: Pt | null = null;
    let mapKey = '';

    const nodePos = (i: number, n: number): Pt => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return { x: G_CX + G_R * Math.cos(ang), y: G_CY + G_R * Math.sin(ang) };
    };
    const slotPos = (i: number, slot: number): Pt => {
      const p = nodePos(i, threads.length);
      const ux = (p.x - G_CX) / G_R;
      const uy = (p.y - G_CY) / G_R;
      const side = slot === 0 ? -1 : 1;
      return { x: p.x + ux * 42 + -uy * 19 * side, y: p.y + uy * 42 + ux * 19 * side };
    };
    const poolPos = (m: number): Pt => ({ x: G_CX + (m - (locks.length - 1) / 2) * (TOKEN_W + 8), y: POOL_Y });

    const placeToken = (tk: TokenEl, p: Pt): void => {
      tk.g.setAttribute('transform', `translate(${p.x - TOKEN_W / 2}, ${p.y - TOKEN_H / 2})`);
    };

    const buildScene = (): void => {
      for (const layer of [cardLayer, arrowLayer, nodeLayer, tokenLayer]) layer.textContent = '';
      cards.length = 0;
      nodes.length = 0;
      tokens.length = 0;
      arrows.clear();
      colorsOf = categorical(Math.max(3, threads.length), 'vivid');
      threads.forEach((name, i) => {
        const x = CARD_X + i * CARD_STEP;
        const g = el('g', { transform: `translate(${x}, ${CARD_TOP})` }, cardLayer);
        const frame = el('rect', { x: 0, y: 0, width: CARD_W, height: CARD_H, rx: 6, fill: pal.bg, stroke: pal.border, 'stroke-width': 1.5 }, g);
        el('circle', { cx: 12, cy: 16, r: 5, fill: colorsOf[i] ?? pal.primary }, g);
        const nameEl = text(g, name, { x: 22, y: 20, 'font-weight': 700, 'font-family': fonts.mono });
        const state = text(g, '', { x: CARD_W - 8, y: 20, 'text-anchor': 'end', 'font-size': fontSizes.xs, fill: pal.textMuted });
        const body = el('g', {}, g);
        const pointer = el('polygon', { points: '0,-5 7,0 0,5', fill: pal.accent, opacity: 0 }, g);
        cards.push({ frame, name: nameEl, state, body, pointer, pointerY: LINE_TOP - CARD_TOP, lines: new Map(), order: [] });

        const p = nodePos(i, threads.length);
        const ng = el('g', {}, nodeLayer);
        const disc = el('circle', { cx: p.x, cy: p.y, r: NODE_R, fill: colorsOf[i] ?? pal.primary, stroke: pal.bg, 'stroke-width': 2 }, ng);
        text(ng, name, { x: p.x, y: p.y + 5, 'text-anchor': 'middle', 'font-weight': 700, 'font-family': fonts.mono, 'font-size': fontSizes.md });
        nodes.push({ g: ng, disc, pos: p });
      });
      text(tokenLayer, t('label.noOwner', 'No owner'), {
        x: G_CX,
        y: POOL_Y - TOKEN_H / 2 - 6,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: pal.textMuted,
      });
      locks.forEach((name, m) => {
        const g = el('g', {}, tokenLayer);
        el('rect', { x: 0, y: 0, width: TOKEN_W, height: TOKEN_H, rx: 4, fill: pal.bgSubtle, stroke: pal.text, 'stroke-width': 1.2 }, g);
        text(g, name, { x: TOKEN_W / 2, y: TOKEN_H / 2 + sm / 2 - 1, 'text-anchor': 'middle', 'font-family': fonts.mono });
        const tk: TokenEl = { g, pos: poolPos(m) };
        placeToken(tk, tk.pos);
        tokens.push(tk);
      });
    };

    const buildMap = (r: RoundView): void => {
      mapLayer.textContent = '';
      cells = new Map();
      const gridW = r.gapLadder.length * CELL_W;
      const gridH = r.sliceLadder.length * CELL_H;
      text(mapLayer, t('label.mapCols', 'Work between locks'), {
        x: MAP_X + gridW / 2,
        y: MAP_Y - 24,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: pal.textMuted,
      });
      const rowTitleX = MAP_X - 26;
      text(mapLayer, t('label.mapRows', 'Time slice'), {
        x: rowTitleX,
        y: MAP_Y + gridH / 2,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: pal.textMuted,
        transform: `rotate(-90 ${rowTitleX} ${MAP_Y + gridH / 2})`,
      });
      r.gapLadder.forEach((g, c) => {
        text(mapLayer, String(g), { x: MAP_X + c * CELL_W + CELL_W / 2, y: MAP_Y - 7, 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: pal.textMuted });
      });
      r.sliceLadder.forEach((k, row) => {
        text(mapLayer, String(k), { x: MAP_X - 8, y: MAP_Y + row * CELL_H + CELL_H / 2 + 4, 'text-anchor': 'end', 'font-size': fontSizes.xs, fill: pal.textMuted });
      });
      r.sliceLadder.forEach((k, row) => {
        r.gapLadder.forEach((g, c) => {
          const x = MAP_X + c * CELL_W;
          const y = MAP_Y + row * CELL_H;
          const cg = el('g', {}, mapLayer);
          const box = el('rect', { x: x + 1, y: y + 1, width: CELL_W - 2, height: CELL_H - 2, rx: 3, 'fill-opacity': 0.28 }, cg);
          const label = text(cg, '', { x: x + CELL_W / 2, y: y + CELL_H / 2 + 4, 'text-anchor': 'middle', 'font-size': fontSizes.xs, 'font-family': fonts.mono });
          cells.set(`${k}:${g}`, { g: cg, box, label, deadlock: false, ticks: -1, cx: x + CELL_W / 2, cy: y + CELL_H / 2 });
        });
      });
      const legendY = MAP_Y + gridH + 18;
      const legend: [boolean, string][] = [
        [true, t('label.deadlock', 'Deadlock')],
        [false, t('label.finished', 'Finished')],
      ];
      legend.forEach(([dl, name], idx) => {
        const y = legendY + idx * 18;
        el('rect', { x: MAP_X, y: y - 10, width: 12, height: 12, rx: 2, fill: dl ? pal.danger : pal.success, 'fill-opacity': 0.4 }, mapLayer);
        text(mapLayer, name, { x: MAP_X + 18, y, 'font-size': fontSizes.xs, fill: pal.textMuted });
      });
      marker = el('rect', { width: CELL_W, height: CELL_H, rx: 4, fill: 'none', stroke: pal.text, 'stroke-width': 2.5 }, mapLayer);
      markerPos = null;
    };

    const paintCell = (c: CellEl, deadlock: boolean, ticks: number): void => {
      c.deadlock = deadlock;
      c.ticks = ticks;
      c.box.setAttribute('fill', deadlock ? pal.danger : pal.success);
      c.label.textContent = String(ticks);
      c.label.setAttribute('fill', deadlock ? pal.danger : pal.text);
    };
    const flipCell = (c: CellEl, s: number): void => {
      c.g.setAttribute('transform', `translate(${c.cx} ${c.cy}) scale(1 ${Math.max(0.001, s)}) translate(${-c.cx} ${-c.cy})`);
    };

    const lineKeys = (lines: string[]): string[] => {
      const seen = new Map<string, number>();
      return lines.map((s) => {
        const n = seen.get(s) ?? 0;
        seen.set(s, n + 1);
        return `${s}#${n}`;
      });
    };
    const rowY = (row: number): number => LINE_TOP - CARD_TOP + row * LINE_H;

    const arrowGeom = (a: StageArrow): { s: Pt; e: Pt; d: Pt; n: Pt } => {
      const P = nodes[a.from]?.pos;
      const Q = nodes[a.to]?.pos;
      if (P === undefined || Q === undefined) throw new Error(`화살 끝의 스레드가 없다: ${a.from} → ${a.to}`);
      const len = Math.hypot(Q.x - P.x, Q.y - P.y);
      const d = { x: (Q.x - P.x) / len, y: (Q.y - P.y) / len };
      const n = { x: -d.y, y: d.x };
      const off = 7;
      return {
        s: { x: P.x + d.x * (NODE_R + 3) + n.x * off, y: P.y + d.y * (NODE_R + 3) + n.y * off },
        e: { x: Q.x - d.x * (NODE_R + 4) + n.x * off, y: Q.y - d.y * (NODE_R + 4) + n.y * off },
        d,
        n,
      };
    };
    const drawArrow = (ae: ArrowEl, p: number): void => {
      const { s, e, d, n } = arrowGeom(ae.a);
      const tip = { x: lerp(s.x, e.x, p), y: lerp(s.y, e.y, p) };
      ae.line.setAttribute('x1', String(s.x));
      ae.line.setAttribute('y1', String(s.y));
      ae.line.setAttribute('x2', String(tip.x));
      ae.line.setAttribute('y2', String(tip.y));
      const b = { x: tip.x - d.x * 9, y: tip.y - d.y * 9 };
      ae.head.setAttribute('points', `${tip.x},${tip.y} ${b.x + n.x * 5},${b.y + n.y * 5} ${b.x - n.x * 5},${b.y - n.y * 5}`);
      ae.head.setAttribute('opacity', p < 0.05 ? '0' : '1');
      const mid = { x: lerp(s.x, e.x, 0.5) - n.x * 12, y: lerp(s.y, e.y, 0.5) - n.y * 12 + 4 };
      ae.label.setAttribute('x', String(mid.x));
      ae.label.setAttribute('y', String(mid.y));
      ae.label.setAttribute('opacity', String(p));
    };
    const tintArrow = (ae: ArrowEl, hot: boolean): void => {
      const c = hot ? pal.danger : pal.textMuted;
      ae.line.setAttribute('stroke', c);
      ae.line.setAttribute('stroke-width', hot ? '3' : '2');
      ae.head.setAttribute('fill', c);
      ae.label.setAttribute('fill', c);
    };

    /** 화살 · 표 · 줄 표식을 새 장면으로 옮긴다. 한 번의 진행률로 모두 움직인다. */
    const moveTo = (held: number[][], nextArrows: StageArrow[], ms: number, extra: ((p: number) => void)[] = []): Promise<void> => {
      // 자물쇠 표 — 주인 곁 칸(잡은 차례) 또는 주인 없음 줄
      const target: Pt[] = locks.map((_, m) => poolPos(m));
      held.forEach((hs, i) => hs.forEach((m, slot) => {
        if (target[m] === undefined) throw new Error(`모르는 자물쇠 색인 ${m}`);
        target[m] = slotPos(i, slot);
      }));
      const tokenMoves = tokens.map((tk, m) => ({ tk, from: tk.pos, to: target[m]! }));
      // 화살 — 새로 선 것은 자라나고, 사라진 것은 거둬들여진다
      const keyOf = (a: StageArrow): string => `${a.from}>${a.to}:${a.lock}`;
      const nextKeys = new Set(nextArrows.map(keyOf));
      const growing: ArrowEl[] = [];
      const shrinking: ArrowEl[] = [];
      for (const [k, ae] of arrows) if (!nextKeys.has(k)) shrinking.push(ae);
      for (const a of nextArrows) {
        const k = keyOf(a);
        if (arrows.has(k)) continue;
        const g = el('g', {}, arrowLayer);
        const line = el('line', { 'stroke-linecap': 'round' }, g);
        const head = el('polygon', {}, g);
        const lockName = locks[a.lock];
        if (lockName === undefined) throw new Error(`모르는 자물쇠 색인 ${a.lock}`);
        const label = text(g, lockName, { 'text-anchor': 'middle', 'font-size': fontSizes.xs, 'font-family': fonts.mono });
        const ae: ArrowEl = { g, line, head, label, a };
        tintArrow(ae, false);
        drawArrow(ae, 0);
        arrows.set(k, ae);
        growing.push(ae);
      }
      for (const ae of arrows.values()) tintArrow(ae, false);
      return animate(ms, (p) => {
        for (const { tk, from, to } of tokenMoves) {
          tk.pos = { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) };
          placeToken(tk, tk.pos);
        }
        for (const ae of growing) drawArrow(ae, p);
        for (const ae of shrinking) drawArrow(ae, 1 - p);
        for (const f of extra) f(p);
      }).then(() => {
        for (const ae of shrinking) {
          ae.g.remove();
          arrows.delete(`${ae.a.from}>${ae.a.to}:${ae.a.lock}`);
        }
      });
    };

    const stateLabel = (s: ThreadState): string => {
      if (s === 'running') return t('label.running', 'Running');
      if (s === 'ready') return t('label.ready', 'Ready');
      if (s === 'asleep') return t('label.asleep', 'Asleep');
      return t('label.done', 'Done');
    };
    const paintStates = (states: ThreadState[]): void => {
      states.forEach((s, i) => {
        const card = cards[i];
        const node = nodes[i];
        if (card === undefined || node === undefined) throw new Error(`스레드 ${i} 의 카드가 없다`);
        card.state.textContent = stateLabel(s);
        card.frame.setAttribute('stroke', s === 'running' ? (colorsOf[i] ?? pal.primary) : pal.border);
        card.frame.setAttribute('stroke-width', s === 'running' ? '3' : '1.5');
        card.frame.setAttribute('stroke-dasharray', s === 'asleep' ? '4 3' : 'none');
        card.name.setAttribute('opacity', s === 'done' ? '0.45' : '1');
        node.disc.setAttribute('fill-opacity', s === 'done' ? '0.3' : '1');
        node.disc.setAttribute('stroke', s === 'asleep' ? pal.danger : pal.bg);
        node.disc.setAttribute('stroke-dasharray', s === 'asleep' ? '4 3' : 'none');
      });
    };

    const pointerMove = (card: Card, row: number | null): ((p: number) => void) => {
      const from = card.pointerY;
      const to = row === null ? from : rowY(row);
      card.pointer.setAttribute('opacity', row === null ? '0' : '1');
      return (p) => {
        card.pointerY = lerp(from, to, p);
        card.pointer.setAttribute('transform', `translate(4, ${card.pointerY - 4})`);
      };
    };

    const api: DeadlockStage & ViewInstance = {
      setCaption(line1: string, line2: string) {
        cap1.textContent = line1;
        cap2.textContent = line2;
      },

      async showRound(r: RoundView, ms: number) {
        finishAll();
        const sameCast = r.threads.join('|') === threads.join('|') && r.locks.join('|') === locks.join('|');
        threads = r.threads.slice();
        locks = r.locks.slice();
        if (!sameCast || cards.length === 0) buildScene();
        const key = `${r.sliceLadder.join(',')}/${r.gapLadder.join(',')}`;
        if (key !== mapKey) {
          buildMap(r);
          mapKey = key;
        }
        const steps: ((p: number) => void)[] = [];

        // 프로그램 줄 — 글자로 이어 옮긴다
        r.programs.forEach((lines, i) => {
          const card = cards[i];
          if (card === undefined) throw new Error(`스레드 ${i} 의 카드가 없다`);
          const keys = lineKeys(lines);
          const keep = new Set(keys);
          const leaving: LineEl[] = [];
          for (const [k, le] of card.lines) if (!keep.has(k)) leaving.push(le);
          const moves: { le: LineEl; from: number; to: number; fresh: boolean }[] = [];
          keys.forEach((k, row) => {
            let le = card.lines.get(k);
            const to = rowY(row);
            const fresh = le === undefined;
            if (le === undefined) {
              const g = el('g', { transform: `translate(0, ${to})`, opacity: 0 }, card.body);
              const bg = el('rect', { x: 12, y: -13, width: CARD_W - 18, height: LINE_H - 2, rx: 3, fill: pal.itemActive, 'fill-opacity': 0, stroke: 'none' }, g);
              const label = text(g, lines[row]!, { x: 16, y: 0, 'font-family': fonts.mono });
              le = { g, bg, label, y: to, row };
              card.lines.set(k, le);
            }
            le.row = row;
            le.bg.setAttribute('fill-opacity', '0');
            le.bg.setAttribute('stroke', 'none');
            moves.push({ le, from: fresh ? to - 8 : le.y, to, fresh });
          });
          card.order = keys;
          steps.push((p) => {
            for (const m of moves) {
              m.le.y = lerp(m.from, m.to, p);
              m.le.g.setAttribute('transform', `translate(${m.fresh ? lerp(-10, 0, p) : 0}, ${m.le.y})`);
              if (m.fresh) m.le.g.setAttribute('opacity', String(p));
            }
            for (const le of leaving) le.g.setAttribute('opacity', String(1 - p));
          });
          steps.push(pointerMove(card, 0));
          steps.push((p) => {
            if (p >= 1) for (const le of leaving) le.g.remove();
          });
          for (const le of leaving) {
            for (const [k, v] of card.lines) if (v === le) card.lines.delete(k);
          }
        });
        paintStates(r.threads.map(() => 'ready'));

        // 지도 — 결과가 바뀐 칸은 뒤집히고, 표식은 새 칸으로 건너간다
        const flips: { c: CellEl; deadlock: boolean; ticks: number }[] = [];
        for (const cell of r.cells) {
          const c = cells.get(`${cell.slice}:${cell.gap}`);
          if (c === undefined) throw new Error(`지도에 없는 칸 ${cell.slice}:${cell.gap}`);
          if (c.ticks < 0) paintCell(c, cell.deadlock, cell.ticks);
          else if (c.deadlock !== cell.deadlock || c.ticks !== cell.ticks) flips.push({ c, deadlock: cell.deadlock, ticks: cell.ticks });
        }
        const here = cells.get(`${r.slice}:${r.gap}`);
        if (here === undefined) throw new Error(`지도에 지금 칸 ${r.slice}:${r.gap} 이 없다`);
        const mTo = { x: here.cx - CELL_W / 2, y: here.cy - CELL_H / 2 };
        const mFrom = markerPos ?? mTo;
        steps.push((p) => {
          for (const f of flips) {
            if (p >= 0.5 && f.c.deadlock !== f.deadlock) paintCell(f.c, f.deadlock, f.ticks);
            if (p >= 0.5 && f.c.ticks !== f.ticks) paintCell(f.c, f.deadlock, f.ticks);
            flipCell(f.c, Math.abs(1 - 2 * p));
          }
          markerPos = { x: lerp(mFrom.x, mTo.x, p), y: lerp(mFrom.y, mTo.y, p) };
          marker?.setAttribute('x', String(markerPos.x));
          marker?.setAttribute('y', String(markerPos.y));
        });

        await moveTo(r.threads.map(() => []), [], ms, steps);
      },

      async showChunk(c: ChunkView, ms: number) {
        finishAll();
        const steps: ((p: number) => void)[] = [];
        cards.forEach((card, i) => {
          const ranHere = new Map<number, 'ran' | 'blocked'>();
          if (i === c.thread) for (const l of c.lines) ranHere.set(l.line, l.outcome);
          card.order.forEach((k, row) => {
            const le = card.lines.get(k);
            if (le === undefined) throw new Error(`줄 ${k} 이 없다`);
            const out = ranHere.get(row);
            le.bg.setAttribute('fill', out === 'blocked' ? pal.danger : pal.itemActive);
            le.bg.setAttribute('fill-opacity', out === undefined ? '0' : out === 'blocked' ? '0.18' : '0.3');
            le.bg.setAttribute('stroke', out === 'blocked' ? pal.danger : 'none');
          });
          const pc = c.pc[i];
          if (pc === undefined) throw new Error(`스레드 ${i} 의 줄 번호가 없다`);
          steps.push(pointerMove(card, pc < card.order.length ? pc : null));
        });
        paintStates(c.states);
        await moveTo(c.held, c.arrows, ms, steps);
      },

      async showResult(r: ResultView, ms: number) {
        finishAll();
        if (!r.deadlock) return;
        const inCycle = (a: StageArrow): boolean => {
          const idx = r.cycle.indexOf(a.from);
          return idx >= 0 && r.cycle[(idx + 1) % r.cycle.length] === a.to;
        };
        const hot = [...arrows.values()].filter((ae) => inCycle(ae.a));
        for (const ae of hot) tintArrow(ae, true);
        // 고리가 닫히는 순간 — 고리 위 화살이 한 번 더 자라 꽂힌다
        await animate(ms, (p) => {
          for (const ae of hot) drawArrow(ae, 0.6 + 0.4 * p);
        });
      },

      destroy() {
        destroyed = true;
        finishAll();
        svg.textContent = '';
      },
    };
    return api;
  },
};
