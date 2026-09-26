/**
 * 스코프와 심볼 테이블 무대.
 *
 * 왼쪽은 원시 프로그램 열 줄, 오른쪽은 쌓인 표 더미(맨 위가 먼저 훑인다). 운동은 셋이다.
 * - 표가 **얹히고 걷힌다** — 얹히면 아래 표들이 밀려 내려가고, 걷히면 옆으로 빠져나간다
 * - 찾기가 **맨 위 표부터 한 장씩 내려가며 훑는다** — 훑개 틀이 표를 차례로 옮겨 다닌다
 * - 쓰임에서 뻗은 **선의 끝이 선언 줄로 옮겨 붙는다** — 앞 회차의 선은 걸음 0 에 점선 자국으로
 *   남고, 그 쓰임이 찾아지는 걸음에서 자국 자리에서 새 선언 줄로 휘어 옮겨 간다
 * 선언은 코드의 글자 자리에서 표의 칸으로 날아가 적히고, 두 번 선언은 부딪힌 칸에서 튕겨 걸림
 * 받침으로 떨어진다.
 *
 * 무대는 셈하지 않는다 — 찾은 선언 · 훑은 표 수 · 부딪힌 선언 · 표 더미는 모두 payload 로 온다.
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

// ── 무대가 받는 모양 (projector 가 좁혀 건넨다) ─────────────────────────────

export type StageToken = { start: number; len: number; kind: 'decl' | 'use'; ref: number };
export type StageLine = { no: number; indent: number; text: string; tokens: StageToken[] };
export type StageTable = { scope: number; entries: number[] };
export type StageOp =
  | { k: 'pop'; scope: number }
  | { k: 'lookup'; use: number; found: boolean; decl: number; scanned: number }
  | { k: 'declare'; decl: number; table: number; accepted: boolean; clash: number }
  | { k: 'push'; scope: number; height: number };

export type StageRound = {
  ruleLabel: string;
  lines: StageLine[];
  /** 스코프마다 표 이름 (번역된 것) */
  tableLabels: string[];
  names: string[];
  decls: { name: string; nameId: number; line: number }[];
  uses: { name: string; nameId: number; line: number }[];
  stack: StageTable[];
  caption: string[];
};

export type StageLineStep = {
  line: number;
  ops: StageOp[];
  stack: StageTable[];
  caption: string[];
};

export type ScopeAndSymbolsStage = ViewInstance & {
  startRound(r: StageRound): void;
  showLine(s: StageLineStep, motionMs: number): void;
  reset(): void;
};

// ── 자리 ────────────────────────────────────────────────────────────────

const W = 900;
const H = 460;
const CODE_PX = parseFloat(fontSizes.md);
const SMALL_PX = parseFloat(fontSizes.sm);
const TINY_PX = parseFloat(fontSizes.xs);
/** 고정폭 글자 한 칸 (em 의 0.6) */
const CW = CODE_PX * 0.6;
const LINE_NO_X = 20;
const CODE_X = 60;
const TOP_Y = 64;
const LH = 30;
const INDENT_COLS = 4;

const STACK_X = 500;
const STACK_W = 370;
const STACK_Y = 48;
const HEAD_H = 24;
const ROW_H = 22;
const GAP = 10;

const TRAY_Y = 330;
const CHIP_W = 180;
const CHIP_H = 22;
const CAPTION_Y = 420;

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

type Pt = { x: number; y: number };

type Link = {
  path: SVGPathElement;
  dot: SVGCircleElement;
  from: Pt;
  to: Pt;
  /** 지금 선의 끝이 무엇인가 — 선언 · 선언 없음 · 앞 회차의 자국 */
  mode: 'decl' | 'missing' | 'trace';
};

type TableBox = {
  scope: number;
  g: SVGGElement;
  frame: SVGRectElement;
  rows: Map<number, SVGGElement>;
  /** 지금 그려진 세로 자리 */
  y: number;
  x: number;
};

export const scopeAndSymbolsStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ScopeAndSymbolsStage {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);

    // ── 애니메이션 — 끝 상태를 늘 쥐고, 새 걸음 · 되짚기 앞에서 끝으로 건너뛴다
    type Job = { frame: number; timer: ReturnType<typeof setTimeout> | null; finish: () => void };
    const jobs = new Set<Job>();
    let destroyed = false;
    const animate = (delay: number, dur: number, draw: (p: number) => void): void => {
      if (destroyed) return;
      if (isInstant() || dur <= 0) {
        draw(1);
        return;
      }
      const job: Job = {
        frame: 0,
        timer: null,
        finish: () => {
          if (job.timer !== null) clearTimeout(job.timer);
          cancelAnimationFrame(job.frame);
          jobs.delete(job);
          draw(1);
        },
      };
      jobs.add(job);
      const begin = () => {
        job.timer = null;
        const t0 = performance.now();
        const tick = (now: number) => {
          if (destroyed) return;
          const p = Math.min(1, (now - t0) / dur);
          draw(ease(p));
          if (p < 1) job.frame = requestAnimationFrame(tick);
          else jobs.delete(job);
        };
        job.frame = requestAnimationFrame(tick);
      };
      draw(0);
      if (delay > 0) job.timer = setTimeout(begin, delay);
      else begin();
    };
    const flush = () => {
      for (const job of [...jobs]) job.finish();
    };
    params.onScrubStart?.(flush);

    // ── 층
    const gBand = el('g', {}, svg);
    const gLinks = el('g', {}, svg);
    const gCode = el('g', {}, svg);
    const gStack = el('g', {}, svg);
    const gTray = el('g', {}, svg);
    const gFly = el('g', {}, svg);
    const gCaption = el('g', {}, svg);

    const ruleText = el('text', {
      x: LINE_NO_X,
      y: 26,
      'font-family': fonts.body,
      'font-size': SMALL_PX,
      fill: c.textMuted,
    }, svg);
    const stackTitle = el('text', {
      x: STACK_X,
      y: 26,
      'font-family': fonts.body,
      'font-size': SMALL_PX,
      fill: c.textMuted,
    }, svg);
    stackTitle.textContent = t('label.stack', 'Symbol tables — searched from the top');
    el('line', { x1: STACK_X - 24, y1: 40, x2: STACK_X - 24, y2: TRAY_Y + 50, stroke: c.border }, svg);

    const band = el('rect', {
      x: LINE_NO_X - 8,
      y: 0,
      width: STACK_X - 48 - LINE_NO_X,
      height: LH - 4,
      rx: 4,
      fill: c.bgSubtle,
      stroke: c.border,
      opacity: 0,
    }, gBand);

    const trayTitle = el('text', {
      x: STACK_X,
      y: TRAY_Y,
      'font-family': fonts.body,
      'font-size': SMALL_PX,
      fill: c.danger,
    }, gTray);
    trayTitle.textContent = t('label.errors', 'Errors');
    const gChips = el('g', {}, gTray);

    const scanner = el('rect', {
      x: STACK_X - 4,
      y: STACK_Y,
      width: STACK_W + 8,
      height: HEAD_H,
      rx: 6,
      fill: 'none',
      stroke: c.accent,
      'stroke-width': 3,
      opacity: 0,
    }, gStack);

    const captionLines = [0, 1].map((i) =>
      el('text', {
        x: LINE_NO_X,
        y: CAPTION_Y + i * 22,
        'font-family': fonts.body,
        'font-size': CODE_PX - 1,
        fill: i === 0 ? c.text : c.textMuted,
      }, gCaption),
    );

    // ── 회차 상태
    let round: StageRound | null = null;
    const lineY = (no: number) => TOP_Y + (no - 1) * LH;
    const tokenEls = new Map<string, SVGTSpanElement>();
    const declSpot = new Map<number, { line: number; start: number; len: number }>();
    const useSpot = new Map<number, { line: number; start: number; len: number }>();
    const links = new Map<number, Link>();
    const tables = new Map<number, TableBox>();
    let order: number[] = [];
    const entries = new Map<number, number[]>();
    let chipCount = 0;

    const need = <T>(v: T | undefined | null, what: string): T => {
      if (v === undefined || v === null) throw new Error(`무대: ${what} 가 없다`);
      return v;
    };
    const lineOf = (no: number) => need(round?.lines[no - 1], `L${no}`);
    const codeX = (no: number) => CODE_X + lineOf(no).indent * INDENT_COLS * CW;
    const nameColor = (nameId: number) => {
      const names = need(round, '회차').names;
      return need(categorical(Math.max(names.length, 3), 'deep')[nameId], `이름 색 ${nameId}`);
    };
    const useTop = (u: number): Pt => {
      const s = need(useSpot.get(u), `쓰임 ${u}`);
      return { x: codeX(s.line) + (s.start + s.len / 2) * CW, y: lineY(s.line) - CODE_PX + 2 };
    };
    const declBottom = (d: number): Pt => {
      const s = need(declSpot.get(d), `선언 ${d}`);
      return { x: codeX(s.line) + (s.start + s.len / 2) * CW, y: lineY(s.line) + 5 };
    };
    const missingEnd = (u: number): Pt => {
      const p = useTop(u);
      return { x: p.x + 18, y: p.y - 14 };
    };
    const curve = (a: Pt, b: Pt) => {
      const dy = Math.abs(a.y - b.y);
      const k = Math.max(10, dy * 0.45);
      return `M ${a.x} ${a.y} C ${a.x} ${a.y - k}, ${b.x} ${b.y + k}, ${b.x} ${b.y}`;
    };

    // ── 표 더미 자리
    const tableHeight = (scope: number) => HEAD_H + Math.max(1, need(entries.get(scope), `표 ${scope}`).length) * ROW_H + 6;
    const layoutY = (): Map<number, number> => {
      const out = new Map<number, number>();
      let y = STACK_Y;
      for (let k = order.length - 1; k >= 0; k -= 1) {
        const s = need(order[k], '표 순서');
        out.set(s, y);
        y += tableHeight(s) + GAP;
      }
      return out;
    };
    const rowY = (idx: number) => HEAD_H + idx * ROW_H + 15;

    const drawTableFrame = (box: TableBox) => {
      box.frame.setAttribute('height', String(tableHeight(box.scope)));
      const top = order[order.length - 1] === box.scope;
      box.frame.setAttribute('stroke', top ? c.primary : c.border);
      box.frame.setAttribute('stroke-width', top ? '1.6' : '1');
    };
    const place = (box: TableBox, x: number, y: number) => {
      box.x = x;
      box.y = y;
      box.g.setAttribute('transform', `translate(${x} ${y})`);
    };

    const makeRow = (box: TableBox, d: number, idx: number): SVGGElement => {
      const r = need(round, '회차');
      const decl = need(r.decls[d], `선언 ${d}`);
      const g = el('g', { transform: `translate(0 ${rowY(idx)})` }, box.g);
      el('rect', { x: 12, y: -8, width: 8, height: 8, rx: 2, fill: nameColor(decl.nameId) }, g);
      const nm = el('text', { x: 28, y: 0, 'font-family': fonts.mono, 'font-size': SMALL_PX + 1, fill: c.text }, g);
      nm.textContent = decl.name;
      const ln = el('text', {
        x: STACK_W - 14,
        y: 0,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': SMALL_PX,
        fill: c.textMuted,
      }, g);
      ln.textContent = `L${decl.line}`;
      box.rows.set(d, g);
      return g;
    };

    const makeTable = (scope: number): TableBox => {
      const r = need(round, '회차');
      const g = el('g', {}, gStack);
      const frame = el('rect', { x: 0, y: 0, width: STACK_W, height: HEAD_H, rx: 6, fill: c.bgSubtle, stroke: c.border }, g);
      el('line', { x1: 0, y1: HEAD_H, x2: STACK_W, y2: HEAD_H, stroke: c.border }, g);
      const head = el('text', { x: 12, y: 16, 'font-family': fonts.body, 'font-size': SMALL_PX, fill: c.textMuted }, g);
      head.textContent = need(r.tableLabels[scope], `표 이름 ${scope}`);
      const box: TableBox = { scope, g, frame, rows: new Map(), y: STACK_Y, x: STACK_X };
      tables.set(scope, box);
      gStack.appendChild(scanner);
      return box;
    };

    /** 표 더미를 지금 `order` · `entries` 자리로 옮긴다 */
    const settleStack = (delay: number, dur: number) => {
      const ys = layoutY();
      for (const [scope, box] of tables) {
        const y1 = need(ys.get(scope), `표 자리 ${scope}`);
        const y0 = box.y;
        const x0 = box.x;
        drawTableFrame(box);
        if (y0 === y1 && x0 === STACK_X) continue;
        animate(delay, dur, (p) => place(box, lerp(x0, STACK_X, p), lerp(y0, y1, p)));
      }
    };

    const setStackNow = (stack: StageTable[]) => {
      for (const box of tables.values()) box.g.remove();
      tables.clear();
      entries.clear();
      order = stack.map((s) => s.scope);
      for (const s of stack) entries.set(s.scope, [...s.entries]);
      const ys = layoutY();
      for (const s of stack) {
        const box = makeTable(s.scope);
        s.entries.forEach((d, i) => makeRow(box, d, i));
        place(box, STACK_X, need(ys.get(s.scope), '표 자리'));
        drawTableFrame(box);
      }
    };

    const setCaption = (lines: string[]) => {
      captionLines.forEach((node, i) => {
        const line = lines[i];
        node.textContent = line === undefined ? '' : line;
      });
    };

    const tokenKey = (kind: 'decl' | 'use', ref: number) => `${kind}:${ref}`;

    const drawCode = (r: StageRound) => {
      gCode.textContent = '';
      tokenEls.clear();
      declSpot.clear();
      useSpot.clear();
      for (const ln of r.lines) {
        const y = lineY(ln.no);
        const no = el('text', { x: LINE_NO_X, y, 'font-family': fonts.mono, 'font-size': SMALL_PX, fill: c.textMuted }, gCode);
        no.textContent = `L${ln.no}`;
        const x0 = CODE_X + ln.indent * INDENT_COLS * CW;
        const text = el('text', {
          y,
          'font-family': fonts.mono,
          'font-size': CODE_PX,
          fill: c.text,
          stroke: c.bg,
          'stroke-width': 4,
          'paint-order': 'stroke',
          'xml:space': 'preserve',
        }, gCode);
        // 글자를 토막으로 찍되 토막마다 x 를 박는다 — 빈칸이 접혀도 자리가 어긋나지 않는다
        const cuts = [...ln.tokens].sort((a, b) => a.start - b.start);
        let at = 0;
        const plain = (from: number, to: number) => {
          if (to <= from) return;
          const sp = el('tspan', { x: x0 + from * CW }, text);
          sp.textContent = ln.text.slice(from, to);
        };
        for (const tk of cuts) {
          plain(at, tk.start);
          const sp = el('tspan', {
            x: x0 + tk.start * CW,
            'font-weight': tk.kind === 'decl' ? 700 : 400,
          }, text);
          sp.textContent = ln.text.slice(tk.start, tk.start + tk.len);
          tokenEls.set(tokenKey(tk.kind, tk.ref), sp);
          (tk.kind === 'decl' ? declSpot : useSpot).set(tk.ref, { line: ln.no, start: tk.start, len: tk.len });
          at = tk.start + tk.len;
        }
        plain(at, ln.text.length);
      }
    };

    const clearMarks = () => {
      for (const sp of tokenEls.values()) {
        sp.setAttribute('fill', c.text);
      }
      for (const m of svg.querySelectorAll('[data-miss]')) m.remove();
      gChips.textContent = '';
      chipCount = 0;
      gFly.textContent = '';
    };

    const chipSlot = (k: number): Pt => ({ x: STACK_X + (k % 2) * (CHIP_W + 10), y: TRAY_Y + 12 + Math.floor(k / 2) * (CHIP_H + 6) });

    const makeChip = (label: string, color: string, parent: Element, filled: boolean): SVGGElement => {
      const g = el('g', {}, parent);
      el('rect', {
        x: 0,
        y: 0,
        width: CHIP_W,
        height: CHIP_H,
        rx: 5,
        fill: filled ? c.bg : c.bgSubtle,
        stroke: color,
        'stroke-width': 1.4,
      }, g);
      const tx = el('text', { x: 8, y: 15, 'font-family': fonts.mono, 'font-size': TINY_PX + 1, fill: color }, g);
      tx.textContent = label;
      return g;
    };

    const flyChip = (label: string, color: string, path: Pt[], delay: number, dur: number, onEnd: () => void) => {
      const g = makeChip(label, color, gFly, true);
      const segs = path.length - 1;
      const at = (p: number): Pt => {
        const f = Math.min(segs - 1e-9, p * segs);
        const i = Math.floor(f);
        const a = need(path[i], '날길');
        const b = need(path[i + 1], '날길');
        return { x: lerp(a.x, b.x, f - i), y: lerp(a.y, b.y, f - i) };
      };
      animate(delay, dur, (p) => {
        const q = at(p);
        g.setAttribute('transform', `translate(${q.x} ${q.y})`);
        if (p >= 1) {
          g.remove();
          onEnd();
        }
      });
    };

    const tableRowPoint = (scope: number, idx: number): Pt => {
      const ys = layoutY();
      return { x: STACK_X + 20, y: need(ys.get(scope), '표 자리') + rowY(idx) - 15 };
    };

    const scanTo = (count: number, delay: number, dur: number) => {
      // 맨 위 표부터 count 장을 차례로 — 틀이 표에서 표로 옮겨 다닌다
      const ys = layoutY();
      const boxes: { y: number; h: number }[] = [];
      for (let k = order.length - 1; k >= 0 && boxes.length < count; k -= 1) {
        const s = need(order[k], '표 순서');
        boxes.push({ y: need(ys.get(s), '표 자리') - 4, h: tableHeight(s) + 8 });
      }
      if (boxes.length === 0) return;
      animate(delay, dur, (p) => {
        if (p >= 1) {
          scanner.setAttribute('opacity', '0');
          return;
        }
        const f = Math.min(boxes.length - 1e-9, p * boxes.length);
        const i = Math.floor(f);
        const cur = need(boxes[i], '훑개');
        const prev = i === 0 ? cur : need(boxes[i - 1], '훑개');
        const local = Math.min(1, (f - i) * 3);
        scanner.setAttribute('opacity', '1');
        scanner.setAttribute('y', String(lerp(prev.y, cur.y, i === 0 ? 1 : local)));
        scanner.setAttribute('height', String(lerp(prev.h, cur.h, i === 0 ? 1 : local)));
      });
    };

    const moveLink = (u: number, found: boolean, decl: number, delay: number, dur: number) => {
      const r = need(round, '회차');
      const use = need(r.uses[u], `쓰임 ${u}`);
      const from = useTop(u);
      const to = found ? declBottom(decl) : missingEnd(u);
      const color = found ? nameColor(use.nameId) : c.danger;
      let link = links.get(u);
      if (!link) {
        const path = el('path', { fill: 'none', 'stroke-linecap': 'round' }, gLinks);
        const dot = el('circle', { r: 3 }, gLinks);
        link = { path, dot, from, to: from, mode: 'trace' };
        links.set(u, link);
      }
      const l = link;
      const start = l.to;
      l.from = from;
      l.to = to;
      l.mode = found ? 'decl' : 'missing';
      l.path.setAttribute('stroke', color);
      l.path.setAttribute('stroke-width', '1.8');
      l.path.removeAttribute('stroke-dasharray');
      l.path.setAttribute('opacity', '0.85');
      l.dot.setAttribute('fill', color);
      l.dot.setAttribute('opacity', '1');
      const tok = tokenEls.get(tokenKey('use', u));
      animate(delay, dur, (p) => {
        const q = { x: lerp(start.x, to.x, p), y: lerp(start.y, to.y, p) };
        l.path.setAttribute('d', curve(from, q));
        l.dot.setAttribute('cx', String(q.x));
        l.dot.setAttribute('cy', String(q.y));
        if (p >= 1 && tok) tok.setAttribute('fill', color);
        if (p >= 1 && !found) {
          const mark = el('text', {
            x: to.x + 4,
            y: to.y - 2,
            'font-family': fonts.mono,
            'font-size': CODE_PX,
            'font-weight': 700,
            fill: c.danger,
            'data-miss': '1',
          }, gLinks);
          mark.textContent = '?';
          markToken(useSpot.get(u), 'under');
        }
      });
    };

    /** 걸린 글자에 줄을 긋는다 — 글자 장식은 테두리 그림자와 겹쳐 번지므로 선을 따로 둔다 */
    const markToken = (spot: { line: number; start: number; len: number } | undefined, how: 'strike' | 'under') => {
      const sp = need(spot, '걸린 글자 자리');
      const x1 = codeX(sp.line) + sp.start * CW;
      const y = lineY(sp.line) + (how === 'strike' ? -CODE_PX * 0.33 : 3);
      el('line', {
        x1,
        y1: y,
        x2: x1 + sp.len * CW,
        y2: y,
        stroke: c.danger,
        'stroke-width': 1.6,
        'data-miss': '1',
      }, gCode);
    };

    const addChip = (label: string, from: Pt, via: Pt[], delay: number, dur: number) => {
      const slot = chipSlot(chipCount);
      chipCount += 1;
      flyChip(label, c.danger, [from, ...via, slot], delay, dur, () => {
        const g = makeChip(label, c.danger, gChips, false);
        g.setAttribute('transform', `translate(${slot.x} ${slot.y})`);
      });
    };

    const inst: ScopeAndSymbolsStage = {
      startRound(r) {
        flush();
        const firstRound = round === null || round.lines.length !== r.lines.length;
        round = r;
        ruleText.textContent = t('label.ruleNow', 'Rule: {rule}', { rule: r.ruleLabel });
        if (firstRound) {
          drawCode(r);
          gLinks.textContent = '';
          links.clear();
        }
        clearMarks();
        // 앞 회차의 선은 자국으로 — 끝 자리만 남기고 결론(색 · 점 · ?)은 걷는다
        for (const l of links.values()) {
          l.mode = 'trace';
          l.path.setAttribute('stroke', c.ghostOutline);
          l.path.setAttribute('stroke-width', '1.2');
          l.path.setAttribute('stroke-dasharray', '3 4');
          l.path.setAttribute('opacity', '0.9');
          l.dot.setAttribute('opacity', '0');
        }
        band.setAttribute('opacity', '0');
        scanner.setAttribute('opacity', '0');
        setStackNow(r.stack);
        setCaption(r.caption);
      },
      showLine(s, motionMs) {
        flush();
        const r = need(round, '회차');
        band.setAttribute('y', String(lineY(s.line) - LH + 10));
        band.setAttribute('opacity', '1');
        setCaption(s.caption);
        const slot = s.ops.length > 0 ? motionMs / s.ops.length : 0;
        s.ops.forEach((op, i) => {
          const delay = i * slot;
          switch (op.k) {
            case 'pop': {
              const box = need(tables.get(op.scope), `걷을 표 ${op.scope}`);
              order = order.filter((x) => x !== op.scope);
              entries.delete(op.scope);
              tables.delete(op.scope);
              const x0 = box.x;
              const y0 = box.y;
              animate(delay, slot * 0.8, (p) => {
                place(box, lerp(x0, x0 + 60, p), lerp(y0, y0 - 30, p));
                box.g.setAttribute('opacity', String(1 - p));
                if (p >= 1) box.g.remove();
              });
              settleStack(delay, slot * 0.8);
              break;
            }
            case 'push': {
              order.push(op.scope);
              entries.set(op.scope, []);
              const box = makeTable(op.scope);
              place(box, STACK_X, STACK_Y - 40);
              settleStack(delay, slot * 0.8);
              break;
            }
            case 'lookup': {
              scanTo(op.scanned, delay, slot * 0.55);
              moveLink(op.use, op.found, op.decl, delay + slot * 0.45, slot * 0.55);
              if (!op.found) {
                const use = need(r.uses[op.use], `쓰임 ${op.use}`);
                addChip(
                  `L${use.line} ${use.name} · ${t('label.missing', 'no declaration')}`,
                  useTop(op.use),
                  [],
                  delay + slot * 0.3,
                  slot * 0.7,
                );
              }
              break;
            }
            case 'declare': {
              const decl = need(r.decls[op.decl], `선언 ${op.decl}`);
              const from = declBottom(op.decl);
              const list = need(entries.get(op.table), `표 ${op.table}`);
              const box = need(tables.get(op.table), `표 ${op.table}`);
              const label = `${decl.name}  L${decl.line}`;
              if (op.accepted) {
                const idx = list.length;
                list.push(op.decl);
                settleStack(delay, slot * 0.5);
                const dest = tableRowPoint(op.table, idx);
                flyChip(label, c.primary, [{ x: from.x - 20, y: from.y }, { x: dest.x, y: dest.y - 11 }], delay, slot * 0.9, () => {
                  if (!box.rows.has(op.decl)) makeRow(box, op.decl, idx);
                  drawTableFrame(box);
                });
              } else {
                const hitIdx = list.indexOf(op.clash);
                if (hitIdx < 0) throw new Error(`무대: 부딪힌 선언 ${op.clash} 가 표 ${op.table} 에 없다`);
                const hit = tableRowPoint(op.table, hitIdx);
                const tok = tokenEls.get(tokenKey('decl', op.decl));
                if (tok) tok.setAttribute('fill', c.danger);
                markToken(declSpot.get(op.decl), 'strike');
                addChip(
                  `L${decl.line} ${decl.name} · ${t('label.dup', 'declared twice')}`,
                  { x: from.x - 20, y: from.y },
                  [{ x: hit.x + 150, y: hit.y - 11 }, { x: hit.x + 190, y: hit.y + 18 }],
                  delay,
                  slot,
                );
              }
              break;
            }
          }
        });
        // 걸음 끝 — 더미가 payload 와 같은가
        const want = s.stack.map((x) => `${x.scope}:${x.entries.join(',')}`).join('|');
        const have = order.map((x) => `${x}:${need(entries.get(x), '표').join(',')}`).join('|');
        if (want !== have) throw new Error(`무대: 표 더미가 어긋났다 ${have} ≠ ${want}`);
      },
      reset() {
        flush();
        round = null;
        gCode.textContent = '';
        gLinks.textContent = '';
        links.clear();
        for (const box of tables.values()) box.g.remove();
        tables.clear();
        order = [];
        entries.clear();
        gChips.textContent = '';
        gFly.textContent = '';
        chipCount = 0;
        band.setAttribute('opacity', '0');
        scanner.setAttribute('opacity', '0');
        ruleText.textContent = '';
        setCaption([]);
      },
      destroy() {
        destroyed = true;
        for (const job of [...jobs]) {
          if (job.timer !== null) clearTimeout(job.timer);
          cancelAnimationFrame(job.frame);
        }
        jobs.clear();
        for (const g of [gBand, gLinks, gCode, gStack, gTray, gFly, gCaption, ruleText, stackTitle]) g.remove();
      },
    };
    return inst;
  },
};
