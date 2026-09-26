/**
 * self-attention 무대 — 토큰 표(x · q · k · v · 결과)와 머리마다의 점수 · 무게 격자.
 *
 * 운동:
 *   - 머리 수가 바뀌면 q · k · v · 결과의 네 칸이 머리 무리로 갈라지거나(칸 사이가 벌어진다) 다시 붙는다.
 *   - 격자가 하나에서 둘로 갈라진다 — 새 격자는 앞 격자 자리에서 앞 판의 막대 자리를 들고 나와 제 자리로
 *     미끄러진다. 둘에서 하나로 갈 때는 둘째 격자가 첫째 위로 모여 사라진다.
 *   - 무게 막대는 앞 판의 폭(점선 자리)에서 이 판의 폭으로 늘거나 준다 — 두 짝에 반씩 걸린 무게가 한 짝으로
 *     몰리거나, 한 짝의 무게가 두 짝으로 나뉜다.
 *   - 결과 막대도 앞 판의 자리에서 이 판의 값으로 옮겨 간다.
 *
 * 걸음 0(frame)에서 앞 판의 결론(값 글자 · 짝 표지 · 채운 막대)을 걷고, 막대 폭은 점선 자리로만 남긴다.
 * 무대는 셈하지 않는다 — 무게 · 짝 · 동률 · 축(valueMax)은 모두 payload 로 받는다.
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

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 960;
const H = 540;

// 토큰 표
const CW = 34;
const CH = 22;
const ROW = 28;
const TABLE_TOP = 100;
const GROUP_GAP = 14;
const BLOCK_X = { x: 56, q: 216, k: 376, v: 536, result: 700 } as const;
type BlockName = keyof typeof BLOCK_X;
/** 칸 폭 — 결과는 소수 둘째 자리와 빼기 기호가 들어가도록 넓다. */
const cellW = (block: BlockName): number => (block === 'result' ? 48 : CW);

// 격자
const GRID_TOP = 262;
const GCW = 60;
const GCH = 44;
const GRID_CELLS_Y = 30;
const BAR_MAX = GCW - 8;
const NOTE_W = 90;
const ROW_LABEL_W = 16;
const GRID_GAP = 40;

// 계기 줄
const STAT_Y = 506;

export type FrameInput = {
  tokens: string[];
  x: number[][];
  heads: number;
  dk: number;
  sqrtDk: number;
  maxHeads: number;
};
export type ProjectInput = { q: number[][]; k: number[][]; v: number[][] };
export type ScoreInput = { raw: number[][][]; score: number[][][] };
export type SoftmaxInput = { weights: number[][][]; topLow: number };
export type PickInput = { picks: { keys: number[]; tied: boolean }[][]; clear: number; tied: number; rows: number };
export type MixInput = { result: number[][]; valueMax: number };

type TableCell = { rect: SVGRectElement; text: SVGTextElement; bar: SVGRectElement | null };
type TableColumn = { g: SVGGElement; band: SVGRectElement; cells: TableCell[] };
type GridCell = {
  raw: SVGTextElement;
  score: SVGTextElement;
  bar: SVGRectElement;
  weight: SVGTextElement;
  ring: SVGRectElement;
};
type Grid = { g: SVGGElement; header: SVGTextElement; cells: GridCell[][]; notes: SVGTextElement[] };

type Built = {
  tokens: string[];
  n: number;
  dm: number;
  maxHeads: number;
  headColors: readonly string[];
  caption: SVGTextElement;
  info: SVGTextElement;
  columns: Record<BlockName, TableColumn[]>;
  grids: Grid[];
  statValues: SVGTextElement[];
};

/** 음수는 빼기 기호(U+2212)로. */
function signed(s: string): string {
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}
const fmt2 = (v: number): string => signed(v.toFixed(2));
const fmtInt = (v: number): string => signed(String(v));

/** 머리 수에 맞춘 격자 h 의 x 자리. 보이지 않는 격자(h ≥ heads)는 첫 격자 자리에 겹쳐 둔다. */
function gridX(h: number, heads: number): number {
  const block = ROW_LABEL_W + 4 * GCW + NOTE_W;
  const total = heads * block + (heads - 1) * GRID_GAP;
  const start = (W - total) / 2 + ROW_LABEL_W;
  return start + (h < heads ? h : 0) * (block + GRID_GAP);
}

/** 머리 수에 맞춘 표 칸 c 의 x 자리 (칸 무리 사이가 벌어진다). */
function columnX(block: BlockName, c: number, dk: number): number {
  const group = block === 'x' ? 0 : Math.floor(c / dk);
  return BLOCK_X[block] + c * cellW(block) + group * GROUP_GAP;
}

type Tween = { from: number; to: number; start: number; ms: number };

export const selfAttentionStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const fsXs = fontSizes.xs;
    const fsSm = fontSizes.sm;
    const fsMd = fontSizes.md;
    const root = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(root);

    let destroyed = false;
    let built: Built | null = null;
    let heads = 0;
    let dk = 0;

    // ── 운동: 요소마다 수치 속성을 들고 rAF 하나로 옮긴다 ─────────────────────────
    const values = new Map<SVGElement, Map<string, number>>();
    const tweens = new Map<SVGElement, Map<string, Tween>>();
    let frameId: number | null = null;

    const write = (el: SVGElement, key: string, val: number): void => {
      let bag = values.get(el);
      if (bag === undefined) {
        bag = new Map();
        values.set(el, bag);
      }
      bag.set(key, val);
      if (key === 'tx' || key === 'ty') {
        const tx = bag.get('tx');
        const ty = bag.get('ty');
        el.setAttribute('transform', `translate(${tx === undefined ? 0 : tx} ${ty === undefined ? 0 : ty})`);
      } else {
        el.setAttribute(key, String(val));
      }
    };
    const read = (el: SVGElement, key: string): number | undefined => values.get(el)?.get(key);

    const finishAll = (): void => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      for (const [el, bag] of tweens) for (const [key, tw] of bag) write(el, key, tw.to);
      tweens.clear();
    };

    const tick = (now: number): void => {
      frameId = null;
      if (destroyed) return;
      for (const [el, bag] of tweens) {
        for (const [key, tw] of bag) {
          const p = tw.ms <= 0 ? 1 : Math.min(1, (now - tw.start) / tw.ms);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          write(el, key, tw.from + (tw.to - tw.from) * e);
          if (p >= 1) bag.delete(key);
        }
        if (bag.size === 0) tweens.delete(el);
      }
      if (tweens.size > 0) frameId = requestAnimationFrame(tick);
    };

    /** 수치 속성 하나를 ms 에 걸쳐 옮긴다. 처음 놓이는 값이면 바로 놓는다. */
    const move = (el: SVGElement, key: string, to: number, ms: number): void => {
      const from = read(el, key);
      const running = tweens.get(el)?.get(key);
      if (running !== undefined) tweens.get(el)?.delete(key);
      const start = running !== undefined ? read(el, key) : from;
      if (start === undefined || ms <= 0 || isInstant() || destroyed || start === to) {
        write(el, key, to);
        return;
      }
      let bag = tweens.get(el);
      if (bag === undefined) {
        bag = new Map();
        tweens.set(el, bag);
      }
      bag.set(key, { from: start, to, start: performance.now(), ms });
      if (frameId === null) frameId = requestAnimationFrame(tick);
    };

    params.onScrubStart?.(finishAll);

    // ── 그리기 도우미 ──────────────────────────────────────────────────────────
    const make = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (
      parent: SVGElement,
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
      family: string,
      content = '',
    ): SVGTextElement => {
      const node = make('text', { x, y, 'font-size': size, fill, 'text-anchor': anchor, 'font-family': family }, parent);
      node.textContent = content;
      return node;
    };

    const setGhost = (bar: SVGRectElement): void => {
      bar.setAttribute('fill', 'none');
      // 폭이 거의 없는 자리는 점선 테두리가 티끌처럼 보여 그리지 않는다
      const width = read(bar, 'width');
      bar.setAttribute('stroke', width !== undefined && width > 1 ? c.textMuted : 'none');
      bar.setAttribute('stroke-dasharray', '3 2');
    };
    const setFilled = (bar: SVGRectElement, color: string): void => {
      bar.setAttribute('fill', color);
      bar.setAttribute('stroke', 'none');
      bar.removeAttribute('stroke-dasharray');
    };

    const build = (tokens: string[], dm: number, maxHeads: number): Built => {
      const n = tokens.length;
      if (TABLE_TOP + n * ROW > GRID_TOP - 30) throw new Error('self-attention-stage: 토큰이 너무 많아 표가 격자와 겹친다');
      if (gridX(maxHeads - 1, maxHeads) + 4 * GCW + NOTE_W > W) {
        throw new Error('self-attention-stage: 머리 수 사다리 끝값의 격자가 캔버스를 넘는다');
      }
      const headColors = categorical(Math.max(2, maxHeads), 'vivid');
      const caption = text(root, 24, 30, fsMd, c.text, 'start', fonts.body);
      caption.setAttribute('font-weight', '600');
      const info = text(root, 24, 52, fsSm, c.textMuted, 'start', fonts.body);

      const headLabel: Record<BlockName, string> = {
        x: t('sym.x', 'x'),
        q: t('sym.q', 'q'),
        k: t('sym.k', 'k'),
        v: t('sym.v', 'v'),
        result: t('label.result', 'result'),
      };
      const columns = {} as Record<BlockName, TableColumn[]>;
      for (const block of Object.keys(BLOCK_X) as BlockName[]) {
        const cw = cellW(block);
        const blockW = dm * cw + GROUP_GAP;
        text(root, BLOCK_X[block] + blockW / 2, TABLE_TOP - 18, fsSm, c.text, 'middle', fonts.body, headLabel[block]);
        const cols: TableColumn[] = [];
        for (let col = 0; col < dm; col += 1) {
          const g = make('g', {}, root);
          const band = make('rect', { x: 1, y: TABLE_TOP - 9, width: cw - 2, height: 4, rx: 1, fill: c.border }, g);
          const cells: TableCell[] = [];
          for (let i = 0; i < n; i += 1) {
            const y = TABLE_TOP + i * ROW;
            const rect = make(
              'rect',
              { x: 1, y, width: cw - 2, height: CH, rx: 3, fill: c.bgSubtle, stroke: c.border },
              g,
            );
            const bar = block === 'result' ? make('rect', { y: y + CH - 5, height: 3, fill: 'none' }, g) : null;
            if (bar !== null) {
              write(bar, 'x', cw / 2);
              write(bar, 'width', 0);
            }
            const tx = text(g, cw / 2, y + 15, fsXs, c.text, 'middle', fonts.mono);
            cells.push({ rect, text: tx, bar });
          }
          cols.push({ g, band, cells });
        }
        columns[block] = cols;
      }
      tokens.forEach((tok, i) => {
        text(root, 36, TABLE_TOP + i * ROW + 15, fsSm, c.text, 'middle', fonts.mono, tok);
      });

      text(root, 24, GRID_TOP - 12, fsXs, c.textMuted, 'start', fonts.body, t('label.axes', 'rows: query · columns: key'));
      const grids: Grid[] = [];
      for (let h = 0; h < maxHeads; h += 1) {
        const g = make('g', {}, root);
        const header = text(g, 0, 10, fsSm, headColors[h]!, 'start', fonts.body);
        header.setAttribute('font-weight', '600');
        tokens.forEach((tok, j) => {
          text(g, j * GCW + GCW / 2, GRID_CELLS_Y - 6, fsXs, c.textMuted, 'middle', fonts.mono, tok);
        });
        const cells: GridCell[][] = [];
        const notes: SVGTextElement[] = [];
        for (let i = 0; i < n; i += 1) {
          const y = GRID_CELLS_Y + i * GCH;
          text(g, -ROW_LABEL_W / 2, y + GCH / 2 + 4, fsXs, c.textMuted, 'middle', fonts.mono, tokens[i]!);
          const row: GridCell[] = [];
          for (let j = 0; j < n; j += 1) {
            const x = j * GCW;
            make('rect', { x: x + 1, y: y + 1, width: GCW - 2, height: GCH - 2, rx: 3, fill: c.bgSubtle, stroke: c.border }, g);
            const raw = text(g, x + 5, y + 13, fsXs, c.textMuted, 'start', fonts.mono);
            const score = text(g, x + GCW - 5, y + 13, fsXs, c.text, 'end', fonts.mono);
            const bar = make('rect', { x: x + 4, y: y + 18, height: 9, rx: 2 }, g);
            write(bar, 'width', 0);
            setGhost(bar);
            const weight = text(g, x + GCW / 2, y + 39, fsSm, c.text, 'middle', fonts.mono);
            const ring = make(
              'rect',
              { x: x + 2, y: y + 2, width: GCW - 4, height: GCH - 4, rx: 4, fill: 'none', 'stroke-width': 2.5, visibility: 'hidden' },
              g,
            );
            row.push({ raw, score, bar, weight, ring });
          }
          cells.push(row);
          notes.push(text(g, n * GCW + 8, y + GCH / 2 + 4, fsXs, c.text, 'start', fonts.body));
        }
        grids.push({ g, header, cells, notes });
      }

      const statLabels = [
        t('stat.clear', 'rows whose pair stands alone'),
        t('stat.tied', 'rows whose pairs tie'),
        t('stat.topWeight', 'smallest of the row-top weights'),
      ];
      const statValues = statLabels.map((label, s) => {
        const x = 60 + s * 300;
        text(root, x, STAT_Y, fsXs, c.textMuted, 'start', fonts.body, label);
        const val = text(root, x, STAT_Y + 22, fsMd, c.text, 'start', fonts.mono);
        val.setAttribute('font-weight', '600');
        return val;
      });

      return { tokens, n, dm, maxHeads, headColors, caption, info, columns, grids, statValues };
    };

    const need = (): Built => {
      if (built === null) throw new Error('self-attention-stage: frame 보다 먼저 걸음이 왔다');
      return built;
    };
    const checkHeadsShape = (arr: unknown[][], what: string): void => {
      const b = need();
      if (arr.length !== heads) throw new Error(`self-attention-stage: ${what} 의 머리 수가 ${heads} 가 아니다`);
      for (const rows of arr) if (rows.length !== b.n) throw new Error(`self-attention-stage: ${what} 의 줄 수가 다르다`);
    };
    const checkTokenMatrix = (m: number[][], what: string): void => {
      const b = need();
      if (m.length !== b.n || m.some((row) => row.length !== b.dm)) {
        throw new Error(`self-attention-stage: ${what} 는 ${b.n} × ${b.dm} 이어야 한다`);
      }
    };
    const setCaption = (s: string): void => {
      need().caption.textContent = s;
    };

    return {
      frame(p: FrameInput, ms: number): void {
        if (destroyed) return;
        if (built === null) built = build(p.tokens, p.x[0]!.length, p.maxHeads);
        const b = built;
        if (p.tokens.join('\u0000') !== b.tokens.join('\u0000')) throw new Error('self-attention-stage: 토큰이 바뀌었다');
        if (p.heads < 1 || p.heads > b.maxHeads || p.dk * p.heads !== b.dm) {
          throw new Error('self-attention-stage: 머리 수와 d_k 가 d_model 과 맞지 않는다');
        }
        checkTokenMatrix(p.x, 'x');
        const prevHeads = heads;
        heads = p.heads;
        dk = p.dk;

        // 표 — 칸 무리가 갈라지거나 붙는다. 값 글자는 걷는다 (x 는 입력이라 놓는다).
        for (const block of Object.keys(BLOCK_X) as BlockName[]) {
          b.columns[block].forEach((col, ci) => {
            move(col.g, 'tx', columnX(block, ci, dk), ms);
            const tone = block === 'x' ? c.border : b.headColors[Math.floor(ci / dk)]!;
            col.band.setAttribute('fill', tone);
            col.cells.forEach((cell, i) => {
              cell.text.textContent = block === 'x' ? fmtInt(p.x[i]![ci]!) : '';
              if (cell.bar !== null) setGhost(cell.bar);
            });
          });
        }

        // 격자 — 하나에서 둘로 갈라지거나 둘에서 하나로 모인다.
        b.grids.forEach((grid, h) => {
          if (prevHeads === 0) {
            write(grid.g, 'tx', gridX(h, heads));
            write(grid.g, 'ty', GRID_TOP);
            write(grid.g, 'opacity', h < heads ? 1 : 0);
          } else if (h < heads && h >= prevHeads) {
            // 새로 나오는 격자는 첫 격자 자리에서 앞 판의 막대 자리를 들고 나온다
            const firstX = read(b.grids[0]!.g, 'tx');
            if (firstX === undefined) throw new Error('self-attention-stage: 첫 격자의 자리가 없다');
            write(grid.g, 'tx', firstX);
            grid.cells.forEach((row, i) =>
              row.forEach((cell, j) => {
                const src = read(b.grids[0]!.cells[i]![j]!.bar, 'width');
                if (src === undefined) throw new Error('self-attention-stage: 첫 격자의 막대 자리가 없다');
                write(cell.bar, 'width', src);
              }),
            );
            move(grid.g, 'tx', gridX(h, heads), ms);
            move(grid.g, 'opacity', 1, ms);
          } else {
            move(grid.g, 'tx', gridX(h, heads), ms);
            move(grid.g, 'opacity', h < heads ? 1 : 0, ms);
          }
          grid.header.textContent =
            h < heads
              ? t('label.headCols', 'head {h} · columns {a}–{b}', { h: h + 1, a: h * dk + 1, b: (h + 1) * dk })
              : '';
          for (const row of grid.cells) {
            for (const cell of row) {
              cell.raw.textContent = '';
              cell.score.textContent = '';
              cell.weight.textContent = '';
              cell.ring.setAttribute('visibility', 'hidden');
              setGhost(cell.bar);
            }
          }
          for (const note of grid.notes) note.textContent = '';
        });
        for (const v of b.statValues) v.textContent = '';

        setCaption(
          t('caption.frame', 'Input {x} per token · projection columns grouped by head', { x: t('sym.x', 'x') }),
        );
        b.info.textContent = t('info.frame', 'heads {h} · {dkSym} {dk} · {sqrtSym} {s}', {
          h: heads,
          dkSym: t('sym.dk', 'd_k'),
          dk: dk,
          sqrtSym: t('sym.sqrtDk', '√d_k'),
          s: fmt2(p.sqrtDk),
        });
      },

      project(p: ProjectInput): void {
        if (destroyed) return;
        const b = need();
        checkTokenMatrix(p.q, 'q');
        checkTokenMatrix(p.k, 'k');
        checkTokenMatrix(p.v, 'v');
        const src: Record<'q' | 'k' | 'v', number[][]> = { q: p.q, k: p.k, v: p.v };
        for (const block of ['q', 'k', 'v'] as const) {
          b.columns[block].forEach((col, ci) => {
            col.cells.forEach((cell, i) => {
              cell.text.textContent = fmtInt(src[block][i]![ci]!);
            });
          });
        }
        setCaption(
          t('caption.project', 'Projection: {q} · {k} · {v} for every token at once', {
            q: t('sym.q', 'q'),
            k: t('sym.k', 'k'),
            v: t('sym.v', 'v'),
          }),
        );
      },

      score(p: ScoreInput): void {
        if (destroyed) return;
        const b = need();
        checkHeadsShape(p.raw, 'raw');
        checkHeadsShape(p.score, 'score');
        for (let h = 0; h < heads; h += 1) {
          b.grids[h]!.cells.forEach((row, i) =>
            row.forEach((cell, j) => {
              cell.raw.textContent = fmtInt(p.raw[h]![i]![j]!);
              cell.score.textContent = fmt2(p.score[h]![i]![j]!);
            }),
          );
        }
        setCaption(
          t('caption.score', 'Scores: {qk} divided by {sqrtDk}, every head and every row at once', {
            qk: t('sym.qk', 'q·k'),
            sqrtDk: t('sym.sqrtDk', '√d_k'),
          }),
        );
      },

      softmax(p: SoftmaxInput, ms: number): void {
        if (destroyed) return;
        const b = need();
        checkHeadsShape(p.weights, 'weights');
        for (let h = 0; h < heads; h += 1) {
          b.grids[h]!.cells.forEach((row, i) =>
            row.forEach((cell, j) => {
              const w = p.weights[h]![i]![j]!;
              if (!(w >= 0 && w <= 1)) throw new Error('self-attention-stage: 무게가 0..1 밖이다');
              setFilled(cell.bar, b.headColors[h]!);
              move(cell.bar, 'width', BAR_MAX * w, ms);
              cell.weight.textContent = fmt2(w);
            }),
          );
        }
        b.statValues[2]!.textContent = fmt2(p.topLow);
        setCaption(t('caption.softmax', 'Weights: {softmax} across each row', { softmax: t('sym.softmax', 'softmax') }));
      },

      pick(p: PickInput): void {
        if (destroyed) return;
        const b = need();
        checkHeadsShape(p.picks, 'picks');
        for (let h = 0; h < heads; h += 1) {
          const grid = b.grids[h]!;
          p.picks[h]!.forEach((pick, i) => {
            if (pick.keys.length === 0) throw new Error('self-attention-stage: 짝이 비었다');
            const tone = pick.tied ? c.itemComparing : c.text;
            for (const j of pick.keys) {
              const ring = grid.cells[i]![j]!.ring;
              ring.setAttribute('stroke', tone);
              if (pick.tied) ring.setAttribute('stroke-dasharray', '4 3');
              else ring.removeAttribute('stroke-dasharray');
              ring.setAttribute('visibility', 'visible');
            }
            const keys = pick.keys.map((j) => b.tokens[j]!).join('·');
            const note = grid.notes[i]!;
            note.setAttribute('fill', tone);
            note.textContent = pick.tied
              ? t('label.pairTied', 'tie {keys}', { keys })
              : t('label.pairClear', 'pair {keys}', { keys });
          });
        }
        b.statValues[0]!.textContent = t('value.ofTotal', '{n} / {total}', { n: p.clear, total: p.rows });
        b.statValues[1]!.textContent = t('value.ofTotal', '{n} / {total}', { n: p.tied, total: p.rows });
        setCaption(
          t('caption.pick', 'Pairs: the largest {qk} in each row, compared as integers', { qk: t('sym.qk', 'q·k') }),
        );
      },

      mix(p: MixInput, ms: number): void {
        if (destroyed) return;
        const b = need();
        checkTokenMatrix(p.result, 'result');
        if (!(p.valueMax > 0)) throw new Error('self-attention-stage: 결과 축이 양수가 아니다');
        const rw = cellW('result');
        const half = rw / 2 - 3;
        b.columns.result.forEach((col, ci) => {
          const tone = b.headColors[Math.floor(ci / dk)]!;
          col.cells.forEach((cell, i) => {
            const val = p.result[i]![ci]!;
            cell.text.textContent = fmt2(val);
            if (cell.bar === null) throw new Error('self-attention-stage: 결과 칸에 막대가 없다');
            const len = (half * Math.abs(val)) / p.valueMax;
            setFilled(cell.bar, tone);
            move(cell.bar, 'x', val >= 0 ? rw / 2 : rw / 2 - len, ms);
            move(cell.bar, 'width', len, ms);
          });
        });
        setCaption(
          t('caption.mix', 'Result: weights times {v}, summed; head results joined per token', { v: t('sym.v', 'v') }),
        );
      },

      destroy(): void {
        destroyed = true;
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
        tweens.clear();
        root.remove();
      },
    };
  },
};
