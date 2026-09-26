/**
 * hoist-invariant 의 무대.
 *
 * 프로그램 줄이 차례로 서 있고, 반복의 머리줄과 몸이 한 틀 안에 든다. 줄마다 오른쪽에 그 줄의
 * 연산이 한 번 셀 때마다 눈금 하나 — 몸 안의 줄은 바퀴 수만큼 눈금이 선다.
 *
 * 판정 걸음: 재는 줄의 읽는 이름마다 그 이름을 정한 자리로 끈이 뻗는다 (몸 밖 · 불변 줄 · 바뀌는 자리).
 * 옮김 걸음: 줄이 몸에서 들려 틀 왼쪽으로 빠져나와 머리줄 위로 올라가고, 머리줄과 그 사이 줄은 한 칸
 *           내려앉으며 틀의 윗변이 따라 내려온다. 들려 나가는 줄의 눈금은 하나로 모인다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import {
  cell,
  stmtTokens,
  tally,
  type HoistInvariantScene,
  type HoistVerdict,
  type Read,
  type ReadFrom,
  type Tok,
} from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const SVG = 'http://www.w3.org/2000/svg';

const PAD = 16;
const CODE_PX = parseFloat(fontSizes.md);
const SMALL_PX = parseFloat(fontSizes.xs);
const CHAR_W = CODE_PX * 0.6;
const CAPTION_Y = 28;
const ROW_TOP0 = 58;
const METER_Y = H - 18;

const JUDGE_MS = 520;
const LIFT_MS = 900;

type Pt = { x: number; y: number };

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(v: number): number {
  const u = clamp01(v);
  return u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  if (parent) parent.appendChild(node);
  return node;
}

/** 조각마다 시작 글자 칸(들여쓰기 빼고). 빈칸 조각은 칸만 차지한다. */
function placed(toks: Tok[]): { tok: Tok; col: number }[] {
  const out: { tok: Tok; col: number }[] = [];
  let col = 0;
  for (const tok of toks) {
    out.push({ tok, col });
    col += tok.s.length;
  }
  return out;
}

/** 삼차 곡선을 0..u 까지 자른 것 (드 카스텔조). */
function subCubic(p: [Pt, Pt, Pt, Pt], u: number): [Pt, Pt, Pt, Pt] {
  const m = (a: Pt, b: Pt): Pt => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) });
  const [a, b, c, d] = p;
  const ab = m(a, b);
  const bc = m(b, c);
  const cd = m(c, d);
  const abc = m(ab, bc);
  const bcd = m(bc, cd);
  return [a, ab, abc, m(abc, bcd)];
}

function cubicD(p: [Pt, Pt, Pt, Pt]): string {
  const [a, b, c, d] = p;
  return `M${r1(a.x)} ${r1(a.y)} C${r1(b.x)} ${r1(b.y)} ${r1(c.x)} ${r1(c.y)} ${r1(d.x)} ${r1(d.y)}`;
}

function strokeOf(from: ReadFrom, c: Palette): { color: string; width: number; dash: string | null } {
  if (from === 'outer') return { color: c.textMuted, width: 1.5, dash: '4 3' };
  if (from === 'invariant') return { color: c.accent, width: 3, dash: null };
  return { color: c.itemActive, width: 2, dash: null };
}

type RowHandles = { row: SVGGElement; code: SVGGElement; ticks: SVGGElement; badge: SVGGElement | null };
type Tether = { path: SVGPathElement; curve: [Pt, Pt, Pt, Pt]; dot: SVGCircleElement };
type Drawn = { rows: Map<number, RowHandles>; frame: SVGRectElement | null; tethers: Tether[] };

type Layout = {
  rowH: number;
  codeX: number;
  badgeX: number;
  badgeW: number;
  tickX0: number;
  tickGap: number;
  tickSize: number;
  trips: number;
};

function layoutOf(scene: HoistInvariantScene): Layout {
  const n = scene.lines.length;
  const rowH = Math.min(30, (METER_Y - 22 - ROW_TOP0) / n);
  const codeX = PAD + 36;
  let maxCols = 0;
  scene.lines.forEach((ln) => {
    maxCols = Math.max(maxCols, ln.indent * 4 + ln.text.length);
  });
  const codeRight = codeX + maxCols * CHAR_W;
  const badgeX = codeRight + 22;
  const badgeW = Math.min(96, SMALL_PX * 7.5);
  const tickX0 = badgeX + badgeW + 26;
  const tickRight = W - PAD - 10;
  const first = tally(scene);
  let maxTicks = 1;
  scene.lines.forEach((_, li) => {
    maxTicks = Math.max(maxTicks, cell(first.ops, li) * cell(first.runs, li));
  });
  const tickGap = Math.min(44, (tickRight - tickX0) / maxTicks);
  const tickSize = Math.min(14, rowH * 0.45, tickGap * 0.7);
  return { rowH, codeX, badgeX, badgeW, tickX0, tickGap, tickSize, trips: first.trips };
}

export const hoistInvariantStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let layout: Layout | null = null;

    const rowTop = (r: number, L: Layout): number => ROW_TOP0 + r * L.rowH;
    const indentX = (ind: number): number => ind * 4 * CHAR_W;

    function captionOf(scene: HoistInvariantScene): string {
      const s = scene.step;
      if (s.kind === 'start') {
        return t('caption.start', 'Loop body lines: {n}. Checking each one from the top.', { n: tally(scene).body.length });
      }
      if (s.kind === 'lift') {
        const tl = tally(scene);
        return t('caption.lift', 'L{line} is lifted above the loop head. Runs of this line: {before} → {after}', {
          line: s.line + 1,
          before: tl.trips,
          after: cell(tl.runs, s.line),
        });
      }
      const v = scene.verdicts[s.line];
      if (!v) throw new Error(`L${s.line + 1}: 판정 없이 판정 걸음이 왔다`);
      if (v.invariant) {
        const line = s.line + 1;
        const inv = v.reads.filter((rd) => rd.from === 'invariant').map((rd) => rd.name).join(', ');
        const outer = v.reads.filter((rd) => rd.from === 'outer').map((rd) => rd.name).join(', ');
        if (inv && outer) {
          return t('caption.invariantBoth', 'L{line}: invariant. From invariant lines: {inv}. From outside the loop: {outer}', { line, inv, outer });
        }
        if (inv) return t('caption.invariantVia', 'L{line}: invariant. Read from invariant lines: {inv}', { line, inv });
        if (outer) return t('caption.invariant', 'L{line}: invariant. Read from outside the loop: {outer}', { line, outer });
        return t('caption.invariantConst', 'L{line}: invariant. It reads no names.', { line });
      }
      if (v.block === 'reassigned') {
        return t('caption.reassigned', 'L{line}: varies. Set more than once in the loop: {name}', {
          line: s.line + 1,
          name: defName(scene, s.line),
        });
      }
      if (v.block === 'call') {
        return t('caption.call', 'L{line}: varies. A call may give a different value each turn.', { line: s.line + 1 });
      }
      const names = v.reads.filter((rd) => rd.from === 'loop' || rd.from === 'body').map((rd) => rd.name);
      return t('caption.variant', 'L{line}: varies. It reads names that change each turn: {names}', {
        line: s.line + 1,
        names: names.join(', '),
      });
    }

    function defName(scene: HoistInvariantScene, li: number): string {
      const st = scene.lines[li]?.stmt;
      if (!st || (st.k !== 'let' && st.k !== 'set')) throw new Error(`L${li + 1}: 넣는 줄이 아니다`);
      return st.name;
    }

    function tokenCenter(scene: HoistInvariantScene, L: Layout, li: number, pick: (tok: Tok) => boolean): number[] {
      const ln = scene.lines[li];
      const ind = scene.indent[li];
      if (!ln || ind === undefined) throw new Error(`L${li + 1}: 줄이 없다`);
      return placed(stmtTokens(ln.stmt))
        .filter((p) => pick(p.tok))
        .map((p) => L.codeX + indentX(ind) + (p.col + p.tok.s.length / 2) * CHAR_W);
    }

    function drawBadge(parent: SVGGElement, v: HoistVerdict, L: Layout): SVGGElement {
      const g = el('g', { transform: `translate(${r1(L.badgeX)},0)` }, parent);
      const h = Math.min(20, L.rowH - 8);
      const y = (L.rowH - h) / 2;
      if (v.invariant) {
        el('rect', { x: 0, y, width: L.badgeW, height: h, rx: h / 2, fill: c.accent }, g);
      } else {
        el('rect', { x: 0.75, y: y + 0.75, width: L.badgeW - 1.5, height: h - 1.5, rx: h / 2, fill: 'none', stroke: c.itemActive, 'stroke-width': 1.5 }, g);
      }
      const label = el(
        'text',
        {
          x: L.badgeW / 2,
          y: L.rowH / 2 + SMALL_PX * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 600,
          fill: v.invariant ? c.stateInk : c.text,
        },
        g,
      );
      label.textContent = v.invariant ? t('label.invariant', 'invariant') : t('label.variant', 'varies');
      return g;
    }

    function drawStatic(scene: HoistInvariantScene): Drawn {
      svg.textContent = '';
      const L = layout ?? layoutOf(scene);
      layout = L;
      const tl = tally(scene);
      const step = scene.step;

      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);

      // 반복의 틀 — 머리줄과 몸
      const headInd = cell(scene.indent, tl.head);
      const fx = L.codeX + indentX(headInd) - 10;
      const fy = rowTop(tl.headRow, L) + 1;
      const frame = el(
        'rect',
        {
          x: fx,
          y: fy,
          width: W - PAD - fx,
          height: (tl.body.length + 1) * L.rowH - 2,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        },
        svg,
      );

      const rowLayer = el('g', {}, svg);
      const tetherLayer = el('g', {}, svg);
      const rows = new Map<number, RowHandles>();

      // 이번 걸음이 판정이면 — 읽는 이름과 그 출처에 밑줄 색
      const marks = new Map<number, { pick: (tok: Tok) => boolean; color: string }[]>();
      const judged = step.kind === 'judge' ? step.line : null;
      const verdict = judged === null ? null : scene.verdicts[judged] ?? null;
      if (judged !== null && verdict) {
        for (const rd of verdict.reads) {
          const color = strokeOf(rd.from, c).color;
          const at = marks.get(rd.at) ?? [];
          at.push({ pick: (tok) => tok.role === 'def' && tok.s === rd.name, color });
          marks.set(rd.at, at);
          const mine = marks.get(judged) ?? [];
          mine.push({ pick: (tok) => tok.role === 'name' && tok.s === rd.name, color });
          marks.set(judged, mine);
        }
      }

      scene.rows.forEach((li, r) => {
        const ln = scene.lines[li];
        const ind = scene.indent[li];
        if (!ln || ind === undefined) throw new Error(`L${li + 1}: 줄이 없다`);
        const row = el('g', { transform: `translate(0,${r1(rowTop(r, L))})` }, rowLayer);
        const baseY = L.rowH / 2 + CODE_PX * 0.36;

        const no = el(
          'text',
          { x: PAD, y: baseY, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted },
          row,
        );
        no.textContent = t('label.line', 'L{n}', { n: li + 1 });

        if (judged === li) {
          el(
            'rect',
            {
              x: L.codeX + indentX(ind) - 5,
              y: 3,
              width: ln.text.length * CHAR_W + 10,
              height: L.rowH - 6,
              rx: 4,
              fill: 'none',
              stroke: c.text,
              'stroke-width': 1,
            },
            row,
          );
        }

        const code = el('g', { transform: `translate(${r1(L.codeX + indentX(ind))},0)` }, row);
        const lineMarks = marks.get(li) ?? [];
        for (const { tok, col } of placed(stmtTokens(ln.stmt))) {
          if (tok.role === 'space') continue;
          const x = col * CHAR_W;
          const mark = lineMarks.find((m) => m.pick(tok));
          if (mark) {
            el('rect', { x, y: baseY + 3, width: tok.s.length * CHAR_W, height: 2.5, fill: mark.color }, code);
          }
          const tx = el(
            'text',
            {
              x,
              y: baseY,
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              fill: tok.role === 'kw' ? c.textMuted : c.text,
            },
            code,
          );
          tx.textContent = tok.s;
        }

        const v = scene.verdicts[li] ?? null;
        const badge = v ? drawBadge(row, v, L) : null;

        const ticks = el('g', { transform: `translate(${r1(L.tickX0)},0)` }, row);
        const n = cell(tl.ops, li) * cell(tl.runs, li);
        for (let k = 0; k < n; k += 1) {
          el(
            'rect',
            {
              x: k * L.tickGap,
              y: (L.rowH - L.tickSize) / 2,
              width: L.tickSize,
              height: L.tickSize,
              rx: 2,
              fill: c.textMuted,
            },
            ticks,
          );
        }
        rows.set(li, { row, code, ticks, badge });
      });

      // 끈 — 읽는 이름에서 그 이름을 정한 자리로
      const tethers: Tether[] = [];
      if (judged !== null && verdict) {
        const readerRow = scene.rows.indexOf(judged);
        for (const rd of verdict.reads) tethers.push(...drawTethers(scene, L, tetherLayer, judged, readerRow, rd));
      }

      // 셈
      const perTurn = el(
        'text',
        { x: L.codeX, y: METER_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text },
        svg,
      );
      perTurn.textContent = t('meter.perTurn', 'Ops per turn: {n}', { n: tl.perTurn });
      const total = el(
        'text',
        { x: W - PAD, y: METER_Y, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text },
        svg,
      );
      total.textContent = t('meter.executed', 'Ops executed: {n}', { n: tl.executed });

      const cap = el(
        'text',
        { x: PAD, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text },
        svg,
      );
      cap.textContent = captionOf(scene);

      return { rows, frame, tethers };
    }

    function drawTethers(
      scene: HoistInvariantScene,
      L: Layout,
      layer: SVGGElement,
      reader: number,
      readerRow: number,
      rd: Read,
    ): Tether[] {
      const srcRow = scene.rows.indexOf(rd.at);
      if (srcRow < 0) throw new Error(`L${rd.at + 1}: 줄 차례에 없다`);
      const src = tokenCenter(scene, L, rd.at, (tok) => tok.role === 'def' && tok.s === rd.name)[0];
      if (src === undefined) throw new Error(`L${rd.at + 1}: ${rd.name} 을 정하는 자리가 없다`);
      const readers = tokenCenter(scene, L, reader, (tok) => tok.role === 'name' && tok.s === rd.name);
      if (readers.length === 0) throw new Error(`L${reader + 1}: ${rd.name} 을 읽는 자리가 없다`);
      const st = strokeOf(rd.from, c);
      const out: Tether[] = [];
      for (const x1 of readers) {
        const top = rowTop(readerRow, L);
        const sTop = rowTop(srcRow, L);
        let curve: [Pt, Pt, Pt, Pt];
        if (srcRow === readerRow) {
          const y = top + 5;
          curve = [{ x: x1, y }, { x: x1, y: y - 18 }, { x: src, y: y - 18 }, { x: src, y }];
        } else {
          const up = srcRow < readerRow;
          const y1 = up ? top + 5 : top + L.rowH - 5;
          const y2 = up ? sTop + L.rowH - 5 : sTop + 5;
          const d = Math.max(8, Math.abs(y1 - y2) * 0.3) * (up ? 1 : -1);
          const bx = 16 + 6 * Math.abs(srcRow - readerRow);
          curve = [{ x: x1, y: y1 }, { x: x1 + bx, y: y1 - d }, { x: src + bx, y: y2 + d }, { x: src, y: y2 }];
        }
        el('path', { d: cubicD(curve), fill: 'none', stroke: c.bg, 'stroke-width': st.width + 3, 'stroke-linecap': 'round', opacity: 0.85 }, layer);
        const path = el('path', { d: cubicD(curve), fill: 'none', stroke: st.color, 'stroke-width': st.width, 'stroke-linecap': 'round' }, layer);
        if (st.dash) path.setAttribute('stroke-dasharray', st.dash);
        const end = curve[3];
        const dot = el('circle', { cx: end.x, cy: end.y, r: 3, fill: st.color }, layer);
        out.push({ path, curve, dot });
      }
      return out;
    }

    function clock(ms: number, mine: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        let start: number | null = null;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          if (start === null) start = now;
          const u = clamp01((now - start) / ms);
          frame(u);
          if (u >= 1) finish();
          else {
            id = requestAnimationFrame(tick);
            frames.add(id);
          }
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    async function playJudge(scene: HoistInvariantScene, drawn: Drawn, mine: number, line: number): Promise<void> {
      const L = layout;
      if (!L) return;
      const badge = drawn.rows.get(line)?.badge ?? null;
      const ln = scene.lines[line];
      const ind = scene.indent[line];
      if (!ln || ind === undefined) return;
      // 배지는 줄 끝에서 제 칸으로 미끄러져 온다 — 아직 못 온 만큼
      const back = L.badgeX - (L.codeX + indentX(ind) + ln.text.length * CHAR_W + 8);
      const apply = (u: number): void => {
        const grow = ease(u / 0.7);
        for (const th of drawn.tethers) {
          th.path.setAttribute('d', cubicD(subCubic(th.curve, Math.max(0.001, grow))));
          const tip = subCubic(th.curve, Math.max(0.001, grow))[3];
          th.dot.setAttribute('cx', String(r1(tip.x)));
          th.dot.setAttribute('cy', String(r1(tip.y)));
        }
        if (badge) {
          const b = ease((u - 0.45) / 0.55);
          badge.setAttribute('transform', `translate(${r1(L.badgeX - back * (1 - b))},0)`);
          badge.setAttribute('opacity', String(r1(b)));
        }
      };
      apply(0);
      await clock(JUDGE_MS, mine, apply);
    }

    async function playLift(scene: HoistInvariantScene, drawn: Drawn, mine: number): Promise<void> {
      const L = layout;
      const s = scene.step;
      if (!L || s.kind !== 'lift') return;
      const tl = tally(scene);
      const moved = drawn.rows.get(s.line);
      const toIndent = scene.indent[s.line];
      if (!moved || toIndent === undefined) return;

      // 모이는 눈금 — 몸 안에서 바퀴 수만큼이던 것이 하나로
      const ops = cell(tl.ops, s.line);
      const before = ops * tl.trips;
      const ghosts: { node: SVGRectElement; k: number }[] = [];
      for (let k = ops; k < before; k += 1) {
        const node = el(
          'rect',
          { x: k * L.tickGap, y: (L.rowH - L.tickSize) / 2, width: L.tickSize, height: L.tickSize, rx: 2, fill: c.textMuted },
          moved.ticks,
        );
        ghosts.push({ node, k });
      }

      // 한 칸 내려앉는 줄 — 머리줄부터 옮기기 전 자리 바로 위까지
      const shifted: { g: SVGGElement; r: number }[] = [];
      for (let r = s.toRow + 1; r <= s.fromRow; r += 1) {
        const li = scene.rows[r];
        const h = li === undefined ? undefined : drawn.rows.get(li);
        if (h) shifted.push({ g: h.row, r });
      }

      const frame = drawn.frame;
      const frameY = rowTop(tl.headRow, L) + 1;
      const frameH = (tl.body.length + 1) * L.rowH - 2;
      const bulge = indentX(1) * 1.5;

      const apply = (u: number): void => {
        const ex = ease(u / 0.4);
        const ey = ease((u - 0.2) / 0.7);
        const out = Math.sin(Math.PI * clamp01((u - 0.1) / 0.8));
        const y = lerp(rowTop(s.fromRow, L), rowTop(s.toRow, L), ey);
        moved.row.setAttribute('transform', `translate(0,${r1(y)})`);
        const x = L.codeX + indentX(lerp(s.fromIndent, toIndent, ex)) - bulge * out;
        moved.code.setAttribute('transform', `translate(${r1(x)},0)`);
        for (const { node, k } of ghosts) {
          const target = k % Math.max(1, ops);
          node.setAttribute('x', String(r1(lerp(k, target, ex) * L.tickGap)));
          if (ex >= 1) node.setAttribute('opacity', '0');
        }
        for (const { g, r } of shifted) {
          g.setAttribute('transform', `translate(0,${r1(lerp(rowTop(r - 1, L), rowTop(r, L), ey))})`);
        }
        if (frame) {
          const top = lerp(frameY - L.rowH, frameY, ey);
          frame.setAttribute('y', String(r1(top)));
          frame.setAttribute('height', String(r1(frameH + (frameY - top))));
        }
      };
      apply(0);
      await clock(LIFT_MS, mine, apply);
    }

    return {
      async render(next: HoistInvariantScene, _prev: HoistInvariantScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const drawn = drawStatic(next);
        if (!opts.animate) return;
        const s = next.step;
        if (s.kind === 'judge') await playJudge(next, drawn, mine, s.line);
        else if (s.kind === 'lift') await playLift(next, drawn, mine);
        else return;
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
