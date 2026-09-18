/**
 * budget-runs-out 의 그림 — 차오르다 막힌다.
 *
 * 위에는 맥락 창이 가로 한 줄로 누워 있다. 토큰 하나가 가로 한 칸이고, 창 폭이 곧 창 크기다.
 * 아래에는 앉을 것들이 줄지어 있다 — 지시문 · 질문 · 답 몫, 그리고 등수대로 조각 다섯.
 * 줄마다 제 토큰 수만큼의 막대를 가진다 (창과 같은 눈금).
 *
 * 걸음마다 막대가 줄에서 떠올라 창의 제자리로 옮겨 앉는다. 조각은 앞 조각 바로 뒤에 붙어
 * 창이 왼쪽부터 차오른다. 밖에 남는 조각은 떠올라 남은 틈에 걸쳐 보고 — 넘치는 몫이
 * 질문과 답 몫 위를 덮는다 — 도로 제 줄로 내려앉는다.
 *
 * 장면이 정본이다. 정적 그리기가 늘 그 장면 전체를 세우고, 운동은 끝 자리에 선 요소를
 * 아직 못 온 만큼 비켜 놓는 것으로 그린다.
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { budgetView, type BudgetBase, type BudgetScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 412;
const W = PIECE_CANVAS_W;

/** 왼쪽 이름 칸과 오른쪽 여백 */
const LEFT = 96;
const RIGHT = 16;
/** 토큰 한 칸의 상한 폭 */
const UNIT_MAX = 8;
/** 막대 높이 — 줄과 창에서 같다. 옮겨 앉을 때 모양이 아니라 자리만 바뀐다 */
const BAR_H = 20;

const CAPTION_Y = 18;
const CAPTION_LINE = 15;
const WIN_Y = 60;
const WIN_H = BAR_H + 8;
const BRACKET_Y = WIN_Y + WIN_H + 8;
const NEED_Y = BRACKET_Y + 28;
const ROWS_Y = NEED_Y + 26;
const LINE_H = 12;
const ROW_GAP = 4;

const FRAME_MS = 16;
const MOVE_MS = 700;
const BOUNCE_MS = 1300;

type Pos = { x: number; y: number };

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 떠올랐다 머물고 내려앉는 곡선 — 0 에서 시작해 1 에 머물다 0 으로 돌아온다 */
function bounce(p: number): number {
  if (p < 0.4) return ease(p / 0.4);
  if (p < 0.6) return 1;
  return 1 - ease((p - 0.6) / 0.4);
}

/** 글자 폭 어림 — 한글 · 한자권 글자는 한 칸, 나머지는 반 칸 남짓 */
function glyphWidth(ch: string, size: number): number {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x1100 ? size : size * 0.56;
}

function measure(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += glyphWidth(ch, size);
  return w;
}

/** 공백에서 끊어 폭에 담는다. 공백 없는 긴 덩이는 글자 단위로 자른다 */
function wrapLines(s: string, size: number, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of s.split(' ')) {
    const tryLine = cur === '' ? word : `${cur} ${word}`;
    if (measure(tryLine, size) <= maxW) {
      cur = tryLine;
      continue;
    }
    if (cur !== '') lines.push(cur);
    cur = '';
    let piece = '';
    for (const ch of word) {
      if (measure(piece + ch, size) > maxW && piece !== '') {
        lines.push(piece);
        piece = '';
      }
      piece += ch;
    }
    cur = piece;
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

type RowKey = 'ins' | 'q' | 'ans' | `c${number}`;

type Row = {
  key: RowKey;
  top: number;
  height: number;
  tokens: number;
  lines: string[];
};

export const budgetRunsOutStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<BudgetScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    /** 지금 그려진 화면에서 움직일 수 있는 손잡이. drawStatic 이 매번 새로 채운다 */
    const handles = new Map<string, SVGElement>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      s: string,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end' = 'start',
      weight = 400,
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        fill,
        'font-family': fonts.body,
        'font-size': size,
        'font-weight': weight,
        'text-anchor': anchor,
      });
      node.textContent = s;
      return node;
    }

    function unitOf(base: BudgetBase): number {
      return Math.min(UNIT_MAX, (W - LEFT - RIGHT) / Math.max(1, base.window));
    }

    function tokensOf(base: BudgetBase, key: RowKey): number {
      if (key === 'ins') return base.instruction.tokens;
      if (key === 'q') return base.question.tokens;
      if (key === 'ans') return base.answer;
      return base.chunks[Number(key.slice(1)) - 1]?.tokens ?? 0;
    }

    /** 줄 배치 — 바탕만으로 정해진다 */
    function layoutRows(base: BudgetBase): { rows: Row[]; textX: number } {
      const u = unitOf(base);
      let widest = base.answer;
      for (const k of ['ins', 'q'] as const) widest = Math.max(widest, tokensOf(base, k));
      for (const ch of base.chunks) widest = Math.max(widest, ch.tokens);
      const textX = LEFT + widest * u + 12;
      const textW = W - RIGHT - textX;
      const size = parseFloat(fontSizes.xs);
      const entries: { key: RowKey; text: string }[] = [
        { key: 'ins', text: base.instruction.text },
        { key: 'q', text: base.question.text },
        { key: 'ans', text: t('label.empty', '(kept empty for the reply)') },
        ...base.chunks.map((ch) => ({ key: `c${ch.rank}` as RowKey, text: ch.text })),
      ];
      const rows: Row[] = [];
      let top = ROWS_Y;
      for (const e of entries) {
        const lines = wrapLines(e.text, size, textW);
        const height = Math.max(BAR_H + 4, lines.length * LINE_H + 6);
        rows.push({ key: e.key, top, height, tokens: tokensOf(base, e.key), lines });
        top += height + ROW_GAP;
      }
      return { rows, textX };
    }

    function rowBarPos(row: Row): Pos {
      return { x: LEFT, y: row.top + (row.height - BAR_H) / 2 };
    }

    /** 창 안 자리 (토큰 단위 시작점) */
    function winStart(base: BudgetBase, scene: BudgetScene, key: RowKey): number | null {
      if (key === 'ins') return 0;
      if (key === 'q') return base.instruction.tokens + base.budget;
      if (key === 'ans') return base.window - base.answer;
      const rank = Number(key.slice(1));
      let at = base.instruction.tokens;
      for (const r of scene.admitted) {
        if (r === rank) return at;
        at += base.chunks[r - 1]?.tokens ?? 0;
      }
      if (scene.rejected === rank) return at;
      return null;
    }

    function winPos(base: BudgetBase, start: number): Pos {
      return { x: LEFT + start * unitOf(base), y: WIN_Y + (WIN_H - BAR_H) / 2 };
    }

    /** 막대 하나 — 그룹째 옮긴다 */
    function drawBar(
      parent: Element,
      pos: Pos,
      tokens: number,
      u: number,
      look: { fill: string; stroke: string; ink: string; dashed?: boolean; label: string },
    ): SVGGElement {
      const g = el(parent, 'g', {});
      const w = tokens * u;
      const rect = el(g, 'rect', {
        x: pos.x,
        y: pos.y,
        width: w,
        height: BAR_H,
        rx: 3,
        fill: look.fill,
        stroke: look.stroke,
        'stroke-width': 1,
      });
      if (look.dashed === true) rect.setAttribute('stroke-dasharray', '3 3');
      if (look.label !== '') write(g, pos.x + w / 2, pos.y + 14, look.label, fontSizes.xs, look.ink, 'middle', 600);
      return g;
    }

    function caption(scene: BudgetScene, base: BudgetBase): string {
      const v = budgetView(scene);
      const step = scene.step;
      if (step === null || step.kind === 'init') {
        return t('caption.init', 'The context window holds {window} tokens. Retrieval brought back {count} chunks.', {
          window: base.window,
          count: base.chunks.length,
        });
      }
      if (step.kind === 'seat') {
        return t(
          'caption.seat',
          'Seated first: instructions {ins} · question {q} · answer space {ans}. That leaves {budget} for chunks.',
          { ins: base.instruction.tokens, q: base.question.tokens, ans: base.answer, budget: base.budget },
        );
      }
      if (step.kind === 'admit') {
        return t('caption.admit', 'Chunk #{rank} is {tokens} tokens and fits. Used {used} of {budget}, {left} left.', {
          rank: step.rank,
          tokens: base.chunks[step.rank - 1]?.tokens ?? 0,
          used: v.used,
          budget: base.budget,
          left: v.left,
        });
      }
      if (step.kind === 'reject') {
        return t(
          'caption.reject',
          'Chunk #{rank} is {tokens} tokens, but only {left} are left. It stays out, and filling stops here.',
          { rank: step.rank, tokens: base.chunks[step.rank - 1]?.tokens ?? 0, left: v.left },
        );
      }
      return t('caption.tally', 'Kept {kept} of {total} · used {used} · {left} left. Fitting all {total} would take {need}.', {
        kept: v.kept,
        total: v.total,
        used: v.used,
        left: v.left,
        need: v.need,
      });
    }

    function drawStatic(scene: BudgetScene): void {
      svg.textContent = '';
      handles.clear();
      const base = scene.base;
      if (base === null) return;
      const u = unitOf(base);
      const v = budgetView(scene);
      const { rows, textX } = layoutRows(base);

      // 캡션 — 지금 일어나는 일
      const capLines = wrapLines(caption(scene, base), parseFloat(fontSizes.sm), W - 32);
      capLines.slice(0, 2).forEach((line, i) => {
        write(svg, 16, CAPTION_Y + i * CAPTION_LINE, line, fontSizes.sm, c.text);
      });

      // 창
      const winW = base.window * u;
      write(svg, LEFT - 8, WIN_Y + WIN_H / 2 + 4, t('label.window', 'Window {window}', { window: base.window }), fontSizes.xs, c.text, 'end', 600);
      el(svg, 'rect', { x: LEFT, y: WIN_Y, width: winW, height: WIN_H, rx: 4, fill: c.bg, stroke: c.border, 'stroke-width': 1 });
      for (let k = 10; k < base.window; k += 10) {
        const x = LEFT + k * u;
        el(svg, 'line', { x1: x, y1: WIN_Y + WIN_H - 3, x2: x, y2: WIN_Y + WIN_H, stroke: c.border, 'stroke-width': 1 });
      }

      const zoneStart = LEFT + base.instruction.tokens * u;
      const zoneEnd = zoneStart + base.budget * u;

      // 조각 몫 — 앉은 뒤에 생긴다
      if (scene.seated) {
        el(svg, 'path', {
          d: `M ${round(zoneStart)} ${BRACKET_Y - 4} V ${BRACKET_Y} H ${round(zoneEnd)} V ${BRACKET_Y - 4}`,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1,
        });
        write(
          svg,
          (zoneStart + zoneEnd) / 2,
          BRACKET_Y + 13,
          t('label.budget', 'Chunk space {budget} · {left} left', { budget: base.budget, left: v.left }),
          fontSizes.xs,
          c.textMuted,
          'middle',
        );
      }

      // 다 담으려면 — 셈한 뒤에 뻗는다
      if (scene.tallied) {
        const needEnd = zoneStart + v.need * u;
        const line = el(svg, 'line', {
          x1: zoneStart,
          y1: NEED_Y,
          x2: needEnd,
          y2: NEED_Y,
          stroke: c.danger,
          'stroke-width': 2,
          'stroke-dasharray': '4 3',
        });
        handles.set('need', line);
        el(svg, 'line', { x1: zoneEnd, y1: NEED_Y - 5, x2: zoneEnd, y2: NEED_Y + 5, stroke: c.textMuted, 'stroke-width': 1 });
        const label = write(
          svg,
          zoneStart,
          NEED_Y + 14,
          t('label.need', 'All {total} would need {need}', { total: v.total, need: v.need }),
          fontSizes.xs,
          c.danger,
          'start',
          600,
        );
        handles.set('needLabel', label);
      }

      // 줄
      for (const row of rows) {
        const rank = row.key.startsWith('c') ? Number(row.key.slice(1)) : 0;
        const nameY = row.top + 14;
        let name = '';
        if (row.key === 'ins') name = t('label.instruction', 'Instructions');
        else if (row.key === 'q') name = t('label.question', 'Question');
        else if (row.key === 'ans') name = t('label.answer', 'Answer space');
        else name = t('label.rank', '#{rank}', { rank });
        write(svg, LEFT - 8, nameY, name, fontSizes.xs, c.text, 'end', 600);

        const admitted = rank > 0 && scene.admitted.includes(rank);
        const rejected = rank > 0 && scene.rejected === rank;
        const unseen = rank > 0 && scene.rejected !== null && rank > scene.rejected;
        const inWindow = rank > 0 ? admitted : scene.seated;

        let status = '';
        let statusInk = c.textMuted;
        if (admitted) status = t('status.in', 'in');
        else if (rejected) {
          status = t('status.out', 'left out');
          statusInk = c.danger;
        } else if (unseen) status = t('status.unseen', 'not looked at');
        if (status !== '') write(svg, LEFT - 8, nameY + LINE_H, status, fontSizes.xs, statusInk, 'end');

        const textInk = inWindow || unseen ? c.textMuted : c.text;
        row.lines.forEach((line, i) => {
          write(svg, textX, row.top + 12 + i * LINE_H, line, fontSizes.xs, textInk);
        });

        const home = rowBarPos(row);
        if (inWindow) {
          // 떠난 자리 — 빈 자취만 남는다
          drawBar(svg, home, row.tokens, u, { fill: 'none', stroke: c.border, ink: c.textMuted, dashed: true, label: '' });
        } else if (rejected) {
          // 밖에 남은 조각 — 남은 틈에 드는 몫과 넘치는 몫을 가른다
          const g = el(svg, 'g', {});
          const fits = Math.max(0, Math.min(row.tokens, v.left));
          el(g, 'rect', { x: home.x, y: home.y, width: row.tokens * u, height: BAR_H, rx: 3, fill: c.danger, stroke: c.danger, 'stroke-width': 1 });
          if (fits > 0) {
            el(g, 'rect', { x: home.x, y: home.y, width: fits * u, height: BAR_H, rx: 3, fill: c.primary, stroke: c.danger, 'stroke-width': 1 });
          }
          write(g, home.x + (row.tokens * u) / 2, home.y + 14, String(row.tokens), fontSizes.xs, c.textInverse, 'middle', 600);
          handles.set(row.key, g);
        } else {
          const isChunk = rank > 0;
          drawBar(svg, home, row.tokens, u, {
            fill: isChunk ? (unseen ? c.border : c.primary) : row.key === 'ans' ? 'none' : c.bgSubtle,
            stroke: isChunk ? (unseen ? c.border : c.primary) : c.textMuted,
            ink: isChunk ? (unseen ? c.textMuted : c.textInverse) : c.text,
            dashed: row.key === 'ans',
            label: String(row.tokens),
          });
        }
      }

      // 창 안에 앉은 것 — 줄보다 나중에 그려 옮겨 오는 동안 위에 뜬다
      if (scene.seated) {
        for (const key of ['ins', 'q', 'ans'] as const) {
          const start = winStart(base, scene, key) ?? 0;
          const g = drawBar(svg, winPos(base, start), tokensOf(base, key), u, {
            fill: key === 'ans' ? c.bg : c.bgSubtle,
            stroke: c.textMuted,
            ink: c.text,
            dashed: key === 'ans',
            label: String(tokensOf(base, key)),
          });
          handles.set(key, g);
        }
      }
      for (const rank of scene.admitted) {
        const key: RowKey = `c${rank}`;
        const start = winStart(base, scene, key) ?? 0;
        const tokens = tokensOf(base, key);
        const g = drawBar(svg, winPos(base, start), tokens, u, {
          fill: c.primary,
          stroke: c.bg,
          ink: c.textInverse,
          label: t('label.chunkBlock', '#{rank} · {tokens}', { rank, tokens }),
        });
        handles.set(key, g);
      }
      // 밖에 남은 조각은 창 위로 떠오를 때 맨 위에 있어야 한다
      if (scene.rejected !== null) {
        const g = handles.get(`c${scene.rejected}`);
        if (g !== undefined) svg.appendChild(g);
      }
    }

    function play(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const total = Math.max(1, Math.round(ms / FRAME_MS));
        let i = 0;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const schedule = (): void => {
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          i += 1;
          frame(Math.min(1, i / total));
          if (i >= total) {
            done();
            return;
          }
          schedule();
        };
        frame(0);
        schedule();
      });
    }

    function shift(node: SVGElement | undefined, dx: number, dy: number): void {
      if (node === undefined) return;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${round(dx)} ${round(dy)})`);
    }

    async function motion(scene: BudgetScene, mine: number): Promise<void> {
      const base = scene.base;
      const step = scene.step;
      if (base === null || step === null) return;
      const { rows } = layoutRows(base);
      const rowOf = (key: RowKey): Row | undefined => rows.find((r) => r.key === key);

      /** 줄에서 창으로 — 끝 자리에 선 막대를 아직 못 온 만큼 비켜 둔다 */
      const rise = async (keys: RowKey[]): Promise<void> => {
        const moves: { node: SVGElement | undefined; dx: number; dy: number }[] = [];
        for (const key of keys) {
          const row = rowOf(key);
          const start = winStart(base, scene, key);
          if (row === undefined || start === null) continue;
          const from = rowBarPos(row);
          const to = winPos(base, start);
          moves.push({ node: handles.get(key), dx: from.x - to.x, dy: from.y - to.y });
        }
        await play(MOVE_MS, mine, (p) => {
          const k = 1 - ease(p);
          for (const m of moves) shift(m.node, m.dx * k, m.dy * k);
        });
      };

      if (step.kind === 'seat') {
        await rise(['ins', 'q', 'ans']);
        return;
      }
      if (step.kind === 'admit') {
        await rise([`c${step.rank}`]);
        return;
      }
      if (step.kind === 'reject') {
        const key: RowKey = `c${step.rank}`;
        const row = rowOf(key);
        const start = winStart(base, scene, key);
        if (row === undefined || start === null) return;
        const home = rowBarPos(row);
        const up = winPos(base, start);
        const node = handles.get(key);
        await play(BOUNCE_MS, mine, (p) => {
          const k = bounce(p);
          shift(node, (up.x - home.x) * k, (up.y - home.y) * k);
        });
        return;
      }
      if (step.kind === 'tally') {
        const line = handles.get('need');
        const label = handles.get('needLabel');
        const x1 = Number(line?.getAttribute('x1') ?? 0);
        const x2 = Number(line?.getAttribute('x2') ?? 0);
        label?.setAttribute('opacity', '0');
        await play(MOVE_MS, mine, (p) => {
          line?.setAttribute('x2', String(round(x1 + (x2 - x1) * ease(p))));
        });
      }
    }

    return {
      async render(next: BudgetScene, _prev: BudgetScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        await motion(next, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
