/**
 * three-way-merge 무대 — 세 파일 (우리 쪽 · 조상 · 그쪽) 을 나란히, 그 아래 결과 파일.
 *
 * 운동:
 * - 그쪽 고침 표시가 조상 줄을 따라 오르내린다 (theirs 손잡이).
 * - "손댄 줄" 띠 둘이 조상 줄 위에서 앞 판 자리부터 새 자리로 미끄러져 붙었다 떨어진다.
 * - 덩이 옮김 칸에서 옮긴 두 줄이 우리 쪽 파일 안에서 날아간다.
 * - 결과 파일의 충돌 덩이가 부풀고, 결과 틀이 줄 수만큼 늘었다 줄며, 이어지는 줄은 앞 판 자리에서 새 자리로,
 *   새 줄은 제 원본 파일의 줄 자리에서 날아든다.
 *
 * 무대는 셈하지 않는다 — 손댄 줄 · 안정 줄 · 덩이 · 판정 · 결과 줄은 모두 projector 가 넘긴다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StageVerdict = 'stable' | 'ours' | 'theirs' | 'same' | 'conflict';
export type StageSide = 'base' | 'ours' | 'theirs';

export type StageChunk = {
  verdict: StageVerdict;
  baseStart: number;
  baseEnd: number;
  oursStart: number;
  oursEnd: number;
  theirsStart: number;
  theirsEnd: number;
};

export type StageLine = {
  text: string;
  key: string;
  role: 'line' | 'marker' | 'ours' | 'theirs';
  from: StageSide | null;
  row: number;
};

export type StageRound = {
  act: 'edit' | 'move';
  line: number;
  base: string[];
  ours: string[];
  theirs: string[];
  theirsEdited: number;
  move: { first: number; last: number; below: number } | null;
};

export type StageTouched = {
  oursTouched: number[];
  theirsTouched: number[];
  oursAdded: number[];
  theirsAdded: number[];
  stable: number[];
};

export type StageConflict = { resultStart: number; lines: StageLine[] };

/** projector 가 부르는 표면 전부. */
export type ThreeWayMergeStage = {
  round(p: StageRound, ms: number): void;
  touched(p: StageTouched, ms: number): void;
  chunks(chunks: StageChunk[], ms: number): void;
  conflict(blocks: StageConflict[], ranges: string, oursLines: number, theirsLines: number, ms: number): void;
  result(lines: StageLine[], conflicts: number, ms: number): void;
  clear(): void;
  destroy(): void;
};

const W = 1000;
const H = 500;
const TOP_ROWS = 6;
const RESULT_ROWS = 12;
const ROW0 = 46;
const LH = 22;
const RES0 = ROW0 + TOP_ROWS * LH + 54;
const RLH = 19;
const PILL_H = 14;
/** 빈 덩이 (조상 줄 0) 의 표지 높이 — 두 줄 경계에 서므로 곁 덩이 딱지 (PILL_H) 와 겹치지 않게 낮춘다. */
const SLIM_H = 6;
const OURS_X = 12;
const PANEL_W = 250;
const BASE_X = 322;
const BASE_W = 260;
const VERDICT_W = 90;
const THEIRS_X = 736;
const RESULT_X = BASE_X;
const RESULT_W = BASE_W + VERDICT_W;
const CAPTION_Y = RES0 + RESULT_ROWS * RLH + 30;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pos = { x: number; y: number };

export const threeWayMergeStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container, params): ViewInstance {
    const svg = params.canvas;
    const pal = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const [oursColor, theirsColor] = categorical(2, 'vivid');
    if (!oursColor || !theirsColor) throw new Error('three-way-merge-stage: categorical(2) 가 색 둘을 주지 않았다');
    const mono = fonts.mono;
    const codePx = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const group = (): SVGGElement => el('g', {}, svg);

    // ─── 움직임 — rAF 로 수를 옮기고, 새 움직임은 같은 대상의 앞 움직임을 끊는다
    const frames = new Set<number>();
    const gen = new WeakMap<object, number>();
    const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
    const animate = (owner: object, ms: number, draw: (k: number) => void): void => {
      const my = (gen.get(owner) ?? 0) + 1;
      gen.set(owner, my);
      if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return;
      }
      draw(0);
      const start = performance.now();
      const tick = (now: number): void => {
        if (gen.get(owner) !== my) return;
        const k = Math.min(1, (now - start) / ms);
        draw(ease(k));
        if (k < 1) {
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        }
      };
      const id = requestAnimationFrame((n) => {
        frames.delete(id);
        tick(n);
      });
      frames.add(id);
    };
    const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
    const place = (node: SVGElement, p: Pos): void => node.setAttribute('transform', `translate(${p.x} ${p.y})`);
    const glide = (node: SVGElement, from: Pos, to: Pos, ms: number): void =>
      animate(node, ms, (k) => place(node, { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) }));

    const rowY = (i: number): number => ROW0 + i * LH;
    const resY = (i: number): number => RES0 + i * RLH;

    // ─── 틀 (자리) — 마운트에서 한 번
    const gFrames = group();
    const frame = (x: number, w: number, title: string): void => {
      el('rect', { x, y: ROW0 - 4, width: w, height: TOP_ROWS * LH + 8, rx: 6, fill: pal.bgSubtle, stroke: pal.border }, gFrames);
      const tx = el('text', { x: x + 4, y: ROW0 - 12, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: pal.text }, gFrames);
      tx.textContent = title;
    };
    frame(OURS_X, PANEL_W, t('label.side.ours', 'Ours'));
    frame(BASE_X, BASE_W, t('label.side.base', 'Ancestor'));
    frame(THEIRS_X, PANEL_W, t('label.side.theirs', 'Theirs'));
    const resultTitle = el('text', { x: RESULT_X + 4, y: RES0 - 14, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: pal.text }, gFrames);
    resultTitle.textContent = t('label.side.result', 'Merged result');
    const resultFrame = el('rect', { x: RESULT_X, y: RES0 - 4, width: RESULT_W, height: 8, rx: 6, fill: pal.bgSubtle, stroke: pal.border }, gFrames);
    let frameRows = 0;
    const setFrameRows = (rows: number, ms: number): void => {
      const from = frameRows;
      frameRows = rows;
      animate(resultFrame, ms, (k) => resultFrame.setAttribute('height', String(lerp(from, rows, k) * RLH + 8)));
    };

    const gTint = group();
    const gRibbons = group();
    const gChunks = group();
    const gBands = group();
    const gOurs = group();
    const gBase = group();
    const gTheirs = group();
    const gMarker = group();
    const gPills = group();
    const gConflict = group();
    const gResult = group();
    const caption = el('text', { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: pal.text }, svg);

    const wipe = (g: Element): void => {
      while (g.firstChild) g.removeChild(g.firstChild);
    };

    const codeText = (parent: Element, text: string, color: string, weight = 400): SVGTextElement => {
      const node = el('text', { x: 0, y: 0, 'font-family': mono, 'font-size': codePx, fill: color, 'font-weight': weight }, parent);
      node.style.whiteSpace = 'pre';
      node.textContent = text;
      return node;
    };
    const lineNo = (parent: Element, x: number, y: number, n: number): void => {
      const node = el('text', { x, y, 'text-anchor': 'end', 'font-family': mono, 'font-size': fontSizes.xs, fill: pal.textMuted }, parent);
      node.textContent = String(n);
    };
    const textPos = (x: number, i: number): Pos => ({ x: x + 30, y: rowY(i) + 15 });

    // ─── 지금 판의 상태 (그림 자리만 — 셈한 값은 받은 것)
    let round: StageRound | null = null;
    let oursPos = new Map<string, Pos>();
    let markerRow: number | null = null;
    const marker = el('g', { opacity: 0 }, gMarker);
    el('line', { x1: BASE_X + BASE_W + VERDICT_W, y1: 0, x2: THEIRS_X, y2: 0, stroke: theirsColor, 'stroke-width': 2 }, marker);
    el('path', { d: `M ${BASE_X + BASE_W + VERDICT_W} 0 l 9 -6 l 0 12 z`, fill: theirsColor }, marker);

    type Band = { bar: SVGRectElement; tint: SVGRectElement; y: number; h: number };
    const bands: Record<'ours' | 'theirs', Band[]> = { ours: [], theirs: [] };
    let resultPos = new Map<string, Pos>();

    const runs = (rows: number[]): [number, number][] => {
      const out: [number, number][] = [];
      for (const r of rows) {
        const last = out[out.length - 1];
        if (last && last[1] === r) last[1] = r + 1;
        else out.push([r, r + 1]);
      }
      return out;
    };

    const verdictColor = (v: StageVerdict): string => {
      switch (v) {
        case 'stable':
          return pal.textMuted;
        case 'ours':
          return oursColor;
        case 'theirs':
          return theirsColor;
        case 'same':
          return pal.text;
        case 'conflict':
          return pal.danger;
        default:
          throw new Error(`three-way-merge-stage: 모르는 판정 ${String(v)}`);
      }
    };
    const verdictName = (v: StageVerdict): string => {
      switch (v) {
        case 'stable':
          return t('label.verdict.stable', 'stable');
        case 'ours':
          return t('label.verdict.ours', 'take ours');
        case 'theirs':
          return t('label.verdict.theirs', 'take theirs');
        case 'same':
          return t('label.verdict.same', 'same change');
        case 'conflict':
          return t('label.verdict.conflict', 'conflict');
        default:
          throw new Error(`three-way-merge-stage: 모르는 판정 ${String(v)}`);
      }
    };
    const sourceX = (side: StageSide): number => {
      switch (side) {
        case 'base':
          return BASE_X;
        case 'ours':
          return OURS_X;
        case 'theirs':
          return THEIRS_X;
        default:
          throw new Error(`three-way-merge-stage: 모르는 쪽 ${String(side)}`);
      }
    };

    const clearConclusions = (): void => {
      wipe(gTint);
      wipe(gRibbons);
      wipe(gChunks);
      wipe(gPills);
      wipe(gConflict);
      wipe(gResult);
      for (const side of ['ours', 'theirs'] as const) {
        for (const b of bands[side]) {
          b.bar.setAttribute('opacity', '0');
          b.tint.setAttribute('opacity', '0');
        }
      }
      for (const node of Array.from(gBase.querySelectorAll('[data-stable]'))) node.remove();
      caption.textContent = '';
    };

    const tint = (x: number, row: number, color: string): void => {
      el('rect', { x: x + 2, y: rowY(row) + 1, width: PANEL_W - 4, height: LH - 2, rx: 3, fill: color, 'fill-opacity': 0.18 }, gTint);
    };

    const api: ThreeWayMergeStage = {
      round(p, ms) {
        if (p.base.length > TOP_ROWS || p.ours.length > TOP_ROWS || p.theirs.length > TOP_ROWS) {
          throw new Error(`three-way-merge-stage: 파일이 ${TOP_ROWS} 줄 자리를 넘는다`);
        }
        clearConclusions();

        // 조상 — 글자는 늘 같으므로 다시 적는다
        wipe(gBase);
        p.base.forEach((line, i) => {
          lineNo(gBase, BASE_X + 20, rowY(i) + 15, i + 1);
          place(codeText(gBase, line, pal.text), textPos(BASE_X, i));
        });

        // 우리 쪽 — 줄을 글자로 잇는다. 옮김 칸이면 조상 차례에서 우리 차례로 날아간다
        const seen = new Map<string, number>();
        const keyOf = (line: string): string => {
          const n = seen.get(line) ?? 0;
          seen.set(line, n + 1);
          return `${line}#${n}`;
        };
        const baseSeen = new Map<string, number>();
        const baseRow = new Map<string, number>();
        p.base.forEach((line, i) => {
          const n = baseSeen.get(line) ?? 0;
          baseSeen.set(line, n + 1);
          baseRow.set(`${line}#${n}`, i);
        });
        wipe(gOurs);
        const nextOurs = new Map<string, Pos>();
        p.ours.forEach((line, i) => {
          lineNo(gOurs, OURS_X + 20, rowY(i) + 15, i + 1);
          const key = keyOf(line);
          const edited = !baseRow.has(key);
          const node = codeText(gOurs, line, edited ? oursColor : pal.text, edited ? 600 : 400);
          const to = textPos(OURS_X, i);
          const fromRow = p.move ? baseRow.get(key) : undefined;
          const from = fromRow !== undefined ? textPos(OURS_X, fromRow) : (oursPos.get(key) ?? to);
          nextOurs.set(key, to);
          glide(node, from, to, ms);
        });
        oursPos = nextOurs;

        // 그쪽 — 고친 줄 하나에 표시
        wipe(gTheirs);
        p.theirs.forEach((line, i) => {
          lineNo(gTheirs, THEIRS_X + 20, rowY(i) + 15, i + 1);
          const edited = i === p.theirsEdited;
          place(codeText(gTheirs, line, edited ? theirsColor : pal.text, edited ? 600 : 400), textPos(THEIRS_X, i));
        });
        const toY = rowY(p.theirsEdited) + LH / 2;
        const fromY = markerRow === null ? toY : rowY(markerRow) + LH / 2;
        markerRow = p.theirsEdited;
        marker.setAttribute('opacity', '1');
        glide(marker, { x: 0, y: fromY }, { x: 0, y: toY }, ms);

        round = p;
        const act = p.act === 'move' ? t('label.act.move', 'moved a block') : t('label.act.edit', 'edited one line');
        caption.textContent = t('caption.round', 'Ours: {act} · theirs edited ancestor line {line}', { act, line: p.line });
      },

      touched(p, ms) {
        if (!round) throw new Error('three-way-merge-stage: touched 가 round 보다 먼저 왔다');
        // 우리 쪽 · 그쪽 파일에서 남김이 아닌 줄을 물들인다
        for (const r of p.oursAdded) tint(OURS_X, r, oursColor);
        for (const r of p.theirsAdded) tint(THEIRS_X, r, theirsColor);
        // 안정 줄 표지
        for (const r of p.stable) {
          el('rect', { x: BASE_X + BASE_W - 16, y: rowY(r) + LH / 2 - 4, width: 8, height: 8, rx: 2, fill: pal.textMuted, 'data-stable': 1 }, gBase);
        }
        // 손댄 줄 띠 — 앞 판 자리에서 새 자리로
        const lay = (side: 'ours' | 'theirs', rows: number[], color: string, barX: number): void => {
          const want = runs(rows);
          const pool = bands[side];
          while (pool.length < want.length) {
            const tintRect = el('rect', { x: BASE_X + 2, y: 0, width: BASE_W - 4, height: 0, rx: 3, fill: color, 'fill-opacity': 0.2, opacity: 0 }, gBands);
            const bar = el('rect', { x: barX, y: 0, width: 6, height: 0, rx: 3, fill: color, opacity: 0 }, gBands);
            pool.push({ bar, tint: tintRect, y: rowY(0), h: 0 });
          }
          pool.forEach((b, k) => {
            const run = want[k];
            if (!run) {
              b.bar.setAttribute('opacity', '0');
              b.tint.setAttribute('opacity', '0');
              return;
            }
            const y1 = rowY(run[0]);
            const h1 = (run[1] - run[0]) * LH;
            const y0 = b.h > 0 ? b.y : y1;
            const h0 = b.h > 0 ? b.h : 0;
            b.y = y1;
            b.h = h1;
            b.bar.setAttribute('opacity', '1');
            b.tint.setAttribute('opacity', '1');
            animate(b.bar, ms, (k2) => {
              const y = lerp(y0, y1, k2);
              const h = lerp(h0, h1, k2);
              for (const r of [b.bar, b.tint]) {
                r.setAttribute('y', String(y + 1));
                r.setAttribute('height', String(Math.max(0, h - 2)));
              }
            });
          });
        };
        lay('ours', p.oursTouched, oursColor, BASE_X - 9);
        lay('theirs', p.theirsTouched, theirsColor, BASE_X + BASE_W + 3);
        const list = (rows: number[]): string => (rows.length === 0 ? '—' : rows.map((r) => String(r + 1)).join(', '));
        caption.textContent = t('caption.touched', 'Ancestor lines touched — ours {ours} · theirs {theirs}', {
          ours: list(p.oursTouched),
          theirs: list(p.theirsTouched),
        });
      },

      chunks(chunks, ms) {
        if (!round) throw new Error('three-way-merge-stage: chunks 가 round 보다 먼저 왔다');
        // 딱지는 제 덩이 가운데에 선다. 빈 덩이 (조상 줄 0) 는 두 줄 경계에 낮은 색 표지만 — 글자 딱지는 곁 덩이와 겹친다
        for (const c of chunks) {
          const color = verdictColor(c.verdict);
          const weak = c.verdict === 'stable';
          const ribbon = (x0: number, a0: number, a1: number, x1: number, b0: number, b1: number): void => {
            el('path', {
              d: `M ${x0} ${rowY(a0)} L ${x1} ${rowY(b0)} L ${x1} ${rowY(b1)} L ${x0} ${rowY(a1)} Z`,
              fill: color,
              'fill-opacity': weak ? 0.08 : 0.25,
              stroke: color,
              'stroke-opacity': weak ? 0.2 : 0.6,
            }, gRibbons);
          };
          ribbon(OURS_X + PANEL_W, c.oursStart, c.oursEnd, BASE_X, c.baseStart, c.baseEnd);
          ribbon(BASE_X + BASE_W + VERDICT_W, c.baseStart, c.baseEnd, THEIRS_X, c.theirsStart, c.theirsEnd);
          const y0 = rowY(c.baseStart);
          const h = (c.baseEnd - c.baseStart) * LH;
          if (h > 0) {
            el('rect', { x: BASE_X, y: y0, width: BASE_W + VERDICT_W, height: h, rx: 4, fill: 'none', stroke: color, 'stroke-width': weak ? 1 : 2 }, gChunks);
          } else {
            el('line', { x1: BASE_X, y1: y0, x2: BASE_X + BASE_W + VERDICT_W, y2: y0, stroke: color, 'stroke-width': 3 }, gChunks);
          }
          const pill = el('g', {}, gPills);
          if (h > 0) {
            el('rect', { x: 0, y: -PILL_H / 2, width: VERDICT_W - 10, height: PILL_H, rx: PILL_H / 2, fill: weak ? pal.bg : color, stroke: color }, pill);
            const label = el('text', { x: (VERDICT_W - 10) / 2, y: 4, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, 'font-weight': 600, fill: weak ? pal.textMuted : pal.textInverse }, pill);
            label.textContent = verdictName(c.verdict);
          } else {
            el('rect', { x: 0, y: -SLIM_H / 2, width: VERDICT_W - 10, height: SLIM_H, rx: SLIM_H / 2, fill: color }, pill);
            el('title', {}, pill).textContent = verdictName(c.verdict);
          }
          const to = { x: BASE_X + BASE_W + 5, y: y0 + h / 2 };
          glide(pill, { x: BASE_X + 30, y: to.y }, to, ms);
        }
        caption.textContent = t('caption.chunks', 'Stable lines cut the files into {n} chunks', { n: chunks.length });
      },

      conflict(blocks, ranges, oursLines, theirsLines, ms) {
        if (!round) throw new Error('three-way-merge-stage: conflict 가 round 보다 먼저 왔다');
        let last = 0;
        for (const b of blocks) {
          const top = resY(b.resultStart);
          const size = b.lines.length;
          if (b.resultStart + size > RESULT_ROWS) throw new Error('three-way-merge-stage: 결과가 자리를 넘는다');
          last = Math.max(last, b.resultStart + size);
          const fill = el('rect', { x: RESULT_X + 2, y: top, width: RESULT_W - 4, height: 0, rx: 3, fill: pal.danger, 'fill-opacity': 0.12, stroke: pal.danger }, gConflict);
          const mid = top + (size * RLH) / 2;
          animate(fill, ms, (k) => {
            const h = size * RLH * k;
            fill.setAttribute('y', String(mid - h / 2));
            fill.setAttribute('height', String(h));
          });
          b.lines.forEach((line, i) => {
            const node = drawResultLine(line);
            const to = { x: RESULT_X + 30, y: resY(b.resultStart + i) + 14 };
            node.setAttribute('data-key', line.key);
            glide(node, { x: to.x, y: mid + 4 }, to, ms);
            resultPos.set(`__live:${line.key}`, to);
          });
        }
        if (last > frameRows) setFrameRows(last, ms);
        caption.textContent = t('caption.conflict', 'Conflict at ancestor lines {lines} · lines from ours: {ours} · from theirs: {theirs}', {
          lines: ranges,
          ours: oursLines,
          theirs: theirsLines,
        });
      },

      result(lines, conflicts, ms) {
        if (!round) throw new Error('three-way-merge-stage: result 가 round 보다 먼저 왔다');
        if (lines.length > RESULT_ROWS) throw new Error(`three-way-merge-stage: 결과 ${lines.length} 줄이 ${RESULT_ROWS} 줄 자리를 넘는다`);
        const live = new Map<string, SVGTextElement>();
        for (const node of Array.from(gResult.querySelectorAll('text[data-key]'))) {
          const key = node.getAttribute('data-key');
          if (key === null) throw new Error('three-way-merge-stage: 충돌 줄에 data-key 가 없다');
          live.set(key, node as SVGTextElement);
        }
        const nextPos = new Map<string, Pos>();
        const nums = el('g', {}, gResult);
        lines.forEach((line, i) => {
          lineNo(nums, RESULT_X + 20, resY(i) + 14, i + 1);
          const to = { x: RESULT_X + 30, y: resY(i) + 14 };
          nextPos.set(line.key, to);
          const existing = live.get(line.key);
          if (existing) {
            const from = resultPos.get(`__live:${line.key}`) ?? to;
            glide(existing, from, to, ms);
            return;
          }
          const node = drawResultLine(line);
          node.setAttribute('data-key', line.key);
          const prev = resultPos.get(line.key);
          if (prev) {
            glide(node, prev, to, ms);
            return;
          }
          if (line.from === null) throw new Error(`three-way-merge-stage: 결과 줄 ${line.key} 의 원본이 없다`);
          glide(node, textPos(sourceX(line.from), line.row), to, ms);
        });
        resultPos = nextPos;
        setFrameRows(lines.length, ms);
        caption.textContent =
          conflicts > 0
            ? t('caption.result.conflict', 'The merge stops: a person has to choose between the markers')
            : t('caption.result.clean', 'No conflict: every chunk had a side to take');
      },

      clear() {
        // 되감기 — 앞 운동을 끊고 자리 기억까지 처음 값으로
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        frameRows = 0;
        gen.set(resultFrame, (gen.get(resultFrame) ?? 0) + 1);
        resultFrame.setAttribute('height', '8');
        resultPos = new Map();
        oursPos = new Map();
        markerRow = null;
        for (const side of ['ours', 'theirs'] as const) {
          for (const b of bands[side]) {
            b.y = rowY(0);
            b.h = 0;
          }
        }
        clearConclusions();
        wipe(gOurs);
        wipe(gBase);
        wipe(gTheirs);
        marker.setAttribute('opacity', '0');
        round = null;
      },

      destroy() {
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };

    function drawResultLine(line: StageLine): SVGTextElement {
      switch (line.role) {
        case 'marker':
          return codeText(gResult, line.text, pal.danger, 600);
        case 'ours':
          return codeText(gResult, line.text, oursColor, 600);
        case 'theirs':
          return codeText(gResult, line.text, theirsColor, 600);
        case 'line':
          return codeText(gResult, line.text, pal.text);
        default:
          throw new Error(`three-way-merge-stage: 모르는 결과 줄 역할 ${String(line.role)}`);
      }
    }

    void container;
    return api as unknown as ViewInstance;
  },
};
