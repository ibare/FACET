/**
 * 컬럼 패밀리 무대.
 *
 * 왼쪽에 표 `users` (줄 열쇠 + 칸 넷, 늘 흐린 글자로 남는 논리 표), 그 위에 칸 마흔이 조각(token)으로 얹혀 있다.
 * 담기 걸음에서 조각이 표에서 떼어져 묶음마다의 쪽으로 옮겨 가고, 담는 법을 바꾼 다음 판에서는 앞 판의
 * 쪽에서 새 쪽으로 곧장 옮겨 간다 (갈라지거나 모인다). 질의 걸음에서 묻는 칸이 든 묶음의 쪽이 들어 올려지고,
 * 들린 쪽 안의 쓰지 않는 칸은 흐리게 딸려 온다. 아래 막대 셋은 담는 법마다의 읽은 쪽이며 가장 짧은 막대 표지가
 * 묻는 칸 수에 따라 옮겨 간다.
 *
 * 무대는 셈하지 않는다 — 쪽 배치 · 들린 묶음 · 칸의 상태 · 막대 값 · 가장 적은 자리는 알고리즘이 싣는다.
 * 질의 SQL 은 자료 그대로 띄운다 (`@notation native` — facet.ts).
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 1040;
const H = 610;

// 표
const TX = 16;
const TY = 58;
const KEY_W = 30;
const COL_W = 46;
const ROW_H = 32;
const HEAD_H = 26;

// 칸 조각
const TOK_W = 40;
const TOK_H = 28;

// 쪽
const PAGE_X0 = 270;
const PAGE_AREA_W = W - PAGE_X0 - 16;
const SLOT_W = 42;
const SLOT_H = 32;
const SLOTS_PER_ROW = 4;
const PAGE_PAD = 4;
const PAGE_W = PAGE_PAD + SLOTS_PER_ROW * SLOT_W;
const PAGE_H = PAGE_PAD * 2 + SLOT_H + TOK_H;
const PAGE_PITCH = PAGE_H + 10;
const FAMILY_PITCH = PAGE_W + 12;
const FAMILY_LABEL_Y = 76;
const PAGE_Y0 = 86;
const LIFT = -9;

// 캡션 · 막대
const CAPTION_Y = 496;
const BARS_TITLE_Y = 524;
const BAR_Y0 = 534;
const BAR_PITCH = 24;
const BAR_H = 18;
const BAR_X = 150;
const BAR_TRACK_W = 800;

export type StageCell = { row: string; column: string; value: string };
export type StageFamily = { name: string; label: string; pages: { cells: StageCell[] }[] };
export type StageCellState = { row: string; column: string; state: 'used' | 'fetched' | 'unread' };
export type StageBar = { grouping: number; pages: number };

/** projector 가 부르는 무대의 표면 */
export type ColumnFamilyStage = {
  startRound(p: { sql: string; grouping: number; caption: string; ms: number }): Promise<void>;
  store(p: { families: StageFamily[]; caption: string; ms: number }): Promise<void>;
  lift(p: { lifted: string[]; cells: StageCellState[]; caption: string; ms: number }): Promise<void>;
  count(p: { bars: StageBar[]; fewest: number; scale: number; caption: string; ms: number }): Promise<void>;
  reset(): void;
};

type Token = { g: SVGGElement; rect: SVGRectElement; x: number; y: number; col: number };
type PageBox = { g: SVGGElement; rect: SVGRectElement; family: string; x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function groupingLabel(t: Translate, id: string): string {
  switch (id) {
    case 'one-family':
      return t('label.one-family', 'One family');
    case 'pairs':
      return t('label.pairs', 'Pairs');
    case 'per-column':
      return t('label.per-column', 'Per column');
    default:
      throw new Error(`column-family-stage: 모르는 담는 법 ${id}`);
  }
}

type TableShape = {
  table: string;
  columns: string[];
  rows: { key: string; values: string[] }[];
  groupings: string[];
};

/** initialData 에서 그릴 모양만 읽는다 — 셈은 하지 않는다. 모르는 모양이면 null (빈 마운트). */
function readShape(initial: Record<string, unknown> | undefined): TableShape | null {
  if (!initial) return null;
  const { table, columns, rows, groupings } = initial as Record<string, unknown>;
  if (typeof table !== 'string' || !Array.isArray(columns) || !Array.isArray(rows) || !Array.isArray(groupings)) return null;
  const cols = columns.map((c) => {
    if (typeof c !== 'string') throw new Error('column-family-stage: 칸 이름이 글자가 아니다');
    return c;
  });
  const rs = rows.map((r) => {
    const row = r as { key?: unknown; values?: unknown };
    if (typeof row.key !== 'string' || !Array.isArray(row.values)) throw new Error('column-family-stage: 줄의 모양이 다르다');
    return { key: row.key, values: row.values.map((v) => String(v)) };
  });
  const gs = groupings.map((g) => {
    const id = (g as { id?: unknown }).id;
    if (typeof id !== 'string') throw new Error('column-family-stage: 담는 법에 id 가 없다');
    return id;
  });
  return { table, columns: cols, rows: rs, groupings: gs };
}

export const columnFamilyStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const shape = readShape(params.initialData);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    const cancelPending = () => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    params.onScrubStart?.(cancelPending);

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        if (destroyed || isInstant() || ms <= 0) return resolve();
        const done = () => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
      });

    const dur = (ms: number) => (isInstant() ? 0 : ms);
    const setMove = (node: SVGElement, x: number, y: number, ms: number, delay = 0) => {
      const d = dur(ms);
      node.style.transition = d > 0 ? `transform ${d}ms ease-in-out ${dur(delay)}ms, opacity ${d}ms ease` : 'none';
      node.style.transform = `translate(${x}px, ${y}px)`;
    };

    const root = el('g');
    svg.appendChild(root);

    const vivid = categorical(shape ? shape.columns.length : 1, 'vivid');
    const pastel = categorical(shape ? shape.columns.length : 1, 'pastel');

    // ── 질의
    const sqlText = el('text', { x: TX, y: 30, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text });
    root.appendChild(sqlText);

    // ── 캡션 (글자 차례에서 질의 바로 뒤에 둔다 — 글자 요약 · 화면 읽기기가 표보다 먼저 읽게)
    const caption = el('text', { x: TX, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text });
    root.appendChild(caption);

    // ── 표 (흐린 글자로 늘 남는다)
    const tableLayer = el('g');
    root.appendChild(tableLayer);
    const pageLayer = el('g');
    root.appendChild(pageLayer);
    const tokenLayer = el('g');
    root.appendChild(tokenLayer);

    const tokens = new Map<string, Token>();
    const tokenKey = (row: string, column: string) => `${row}|${column}`;
    const homeOf = (ri: number, ci: number) => ({
      x: TX + KEY_W + ci * COL_W + (COL_W - TOK_W) / 2,
      y: TY + HEAD_H + ri * ROW_H + (ROW_H - TOK_H) / 2,
    });

    if (shape) {
      const label = el('text', { x: TX, y: TY + 16, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
      label.textContent = shape.table;
      tableLayer.appendChild(label);
      shape.columns.forEach((name, ci) => {
        const head = el('text', {
          x: TX + KEY_W + ci * COL_W + COL_W / 2,
          y: TY + 16,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': 600,
          fill: vivid[ci] ?? c.text,
        });
        head.textContent = name;
        tableLayer.appendChild(head);
      });
      tableLayer.appendChild(
        el('line', { x1: TX, y1: TY + HEAD_H - 3, x2: TX + KEY_W + shape.columns.length * COL_W, y2: TY + HEAD_H - 3, stroke: c.border }),
      );
      shape.rows.forEach((row, ri) => {
        const y = TY + HEAD_H + ri * ROW_H + ROW_H / 2 + 4;
        const key = el('text', { x: TX, y, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });
        key.textContent = row.key;
        tableLayer.appendChild(key);
        row.values.forEach((value, ci) => {
          const ghost = el('text', {
            x: TX + KEY_W + ci * COL_W + COL_W / 2,
            y,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.border,
          });
          ghost.textContent = value;
          tableLayer.appendChild(ghost);

          const column = shape.columns[ci];
          if (column === undefined) throw new Error(`column-family-stage: 칸 ${ci} 가 없다`);
          const g = el('g');
          const rect = el('rect', {
            width: TOK_W,
            height: TOK_H,
            rx: 3,
            fill: pastel[ci] ?? c.itemDefault,
            stroke: vivid[ci] ?? c.border,
            'stroke-width': 1,
          });
          const k = el('text', { x: 4, y: 11, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });
          k.textContent = row.key;
          const val = el('text', {
            x: TOK_W / 2,
            y: 24,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.stateInk,
          });
          val.textContent = value;
          g.append(rect, k, val);
          tokenLayer.appendChild(g);
          const home = homeOf(ri, ci);
          const tok: Token = { g, rect, x: home.x, y: home.y, col: ci };
          setMove(g, home.x, home.y, 0);
          tokens.set(tokenKey(row.key, column), tok);
        });
      });
    }


    // ── 막대 — 담는 법마다의 읽은 쪽
    const barsLayer = el('g');
    root.appendChild(barsLayer);
    const barsTitle = el('text', { x: TX, y: BARS_TITLE_Y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
    barsTitle.textContent = t('label.bars', 'Pages read by each layout');
    barsLayer.appendChild(barsTitle);
    type Bar = { rect: SVGRectElement; value: SVGTextElement; name: SVGTextElement; width: number };
    // 쪽 하나의 눈금 — 막대 눈금의 끝(scale)은 알고리즘이 싣는다
    const ticks = el('g');
    let tickScale = 0;
    const bars: Bar[] = [];
    if (shape) {
      shape.groupings.forEach((id, gi) => {
        const y = BAR_Y0 + gi * BAR_PITCH;
        const name = el('text', { x: 24, y: y + 13, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.text });
        name.textContent = groupingLabel(t, id);
        barsLayer.appendChild(el('rect', { x: BAR_X, y, width: BAR_TRACK_W, height: BAR_H, fill: c.bgSubtle, rx: 2 }));
        const rect = el('rect', { x: BAR_X, y, width: 0, height: BAR_H, fill: c.textMuted, rx: 2 });
        const value = el('text', { x: BAR_X + 6, y: y + 13, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text });
        barsLayer.append(name, rect, value);
        bars.push({ rect, value, name, width: 0 });
      });
    }
    barsLayer.appendChild(ticks);
    const drawTicks = (scale: number) => {
      if (scale === tickScale) return;
      tickScale = scale;
      while (ticks.firstChild) ticks.firstChild.remove();
      for (let gi = 0; gi < bars.length; gi += 1) {
        const y = BAR_Y0 + gi * BAR_PITCH;
        for (let p = 1; p < scale; p += 1) {
          const x = BAR_X + (p * BAR_TRACK_W) / scale;
          ticks.appendChild(el('line', { x1: x, y1: y, x2: x, y2: y + BAR_H, stroke: c.bg, 'stroke-width': 2 }));
        }
      }
    };
    const marker = el('path', { d: `M 8 ${BAR_Y0 + 3} L 16 ${BAR_Y0 + BAR_H / 2} L 8 ${BAR_Y0 + BAR_H - 3} Z`, fill: c.primary });
    marker.style.opacity = '0';
    barsLayer.appendChild(marker);
    // 걸음 3 전에는 앞 판의 막대가 흐리게 남는다
    const setBarsFresh = (fresh: boolean, ms: number) => {
      const d = dur(ms);
      barsLayer.style.transition = d > 0 ? `opacity ${d}ms ease` : 'none';
      barsLayer.style.opacity = fresh ? '1' : '0.4';
    };

    const tweenBars = (targets: number[], ms: number) =>
      new Promise<void>((resolve) => {
        const from = bars.map((b) => b.width);
        const apply = (k: number) => {
          bars.forEach((b, i) => {
            const target = targets[i];
            const start = from[i];
            if (target === undefined || start === undefined) throw new Error(`column-family-stage: 막대 ${i} 의 값이 없다`);
            const w = start + (target - start) * k;
            b.rect.setAttribute('width', String(w));
            b.value.setAttribute('x', String(BAR_X + w + 6));
            if (k >= 1) b.width = target;
          });
        };
        const d = dur(ms);
        if (d <= 0 || typeof requestAnimationFrame !== 'function') {
          apply(1);
          return resolve();
        }
        const t0 = performance.now();
        const step = (now: number) => {
          if (destroyed || isInstant()) {
            apply(1);
            return resolve();
          }
          const k = Math.min(1, (now - t0) / d);
          apply(k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
          if (k >= 1) return resolve();
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            step(n);
          });
          frames.add(id);
        };
        const done = () => {
          waiters.delete(done);
          apply(1);
          resolve();
        };
        waiters.add(done);
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          step(n);
        });
        frames.add(id);
      });

    // ── 쪽
    let pages: PageBox[] = [];
    let familySig = '';
    let familyLabels: SVGTextElement[] = [];

    const styleToken = (tok: Token, state: 'stored' | 'used' | 'fetched' | 'unread') => {
      const rect = tok.rect;
      rect.setAttribute('stroke', state === 'used' ? c.stateInk : vivid[tok.col] ?? c.border);
      rect.setAttribute('stroke-width', state === 'used' ? '2' : '1');
      if (state === 'fetched') rect.setAttribute('stroke-dasharray', '3 2');
      else rect.removeAttribute('stroke-dasharray');
      rect.setAttribute('fill', pastel[tok.col] ?? c.itemDefault);
      tok.g.style.opacity = state === 'unread' ? '0.25' : state === 'fetched' ? '0.5' : '1';
    };

    const stylePage = (page: PageBox, lifted: boolean, ms: number) => {
      page.rect.setAttribute('stroke', lifted ? c.primary : c.border);
      page.rect.setAttribute('stroke-width', lifted ? '2' : '1');
      page.rect.setAttribute('fill', lifted ? c.bg : c.bgSubtle);
      setMove(page.g, page.x, page.y + (lifted ? LIFT : 0), ms);
    };

    const tokenAt = (row: string, column: string): Token => {
      const tok = tokens.get(tokenKey(row, column));
      if (!tok) throw new Error(`column-family-stage: 칸 ${row} ${column} 가 표에 없다`);
      return tok;
    };

    const clearPages = () => {
      for (const p of pages) p.g.remove();
      for (const l of familyLabels) l.remove();
      pages = [];
      familyLabels = [];
      familySig = '';
    };

    const toTable = (ms: number) => {
      if (!shape) return;
      shape.rows.forEach((row, ri) => {
        shape.columns.forEach((column, ci) => {
          const tok = tokenAt(row.key, column);
          const home = homeOf(ri, ci);
          tok.x = home.x;
          tok.y = home.y;
          styleToken(tok, 'stored');
          setMove(tok.g, tok.x, tok.y, ms);
        });
      });
    };

    const stage: ColumnFamilyStage = {
      async startRound({ sql, grouping, caption: text, ms }) {
        sqlText.textContent = sql;
        caption.textContent = text;
        for (const tok of tokens.values()) {
          styleToken(tok, 'stored');
          setMove(tok.g, tok.x, tok.y, ms);
        }
        for (const p of pages) stylePage(p, false, ms);
        bars.forEach((b, i) => {
          b.name.setAttribute('font-weight', i === grouping ? '700' : '400');
          b.rect.setAttribute('fill', i === grouping ? c.primary : c.textMuted);
          // 앞 판의 값 글자는 새 질의의 말이 아니다 — 비운다. 폭은 남겨 걸음 3 에 새 값으로 옮겨 가게
          b.value.textContent = '';
        });
        // 앞 판의 "가장 짧은" 표지도 새 질의의 말이 아니다 — 걸음 3 에 다시 드러낸다
        marker.style.opacity = '0';
        // 앞 판의 묶음 이름표(쪽 수)는 담기 걸음 전까지 흐리게
        for (const l of familyLabels) {
          const d = dur(ms);
          l.style.transition = d > 0 ? `opacity ${d}ms ease` : 'none';
          l.style.opacity = '0.3';
        }
        setBarsFresh(false, ms);
        await wait(ms);
      },

      async store({ families, caption: text, ms }) {
        caption.textContent = text;
        const sig = families.map((f) => `${f.name}:${f.pages.length}`).join(',');
        const n = families.length;
        const x0 = PAGE_X0 + (PAGE_AREA_W - (n * FAMILY_PITCH - 12)) / 2;
        if (sig !== familySig) {
          const old = pages;
          const oldLabels = familyLabels;
          pages = [];
          familyLabels = [];
          families.forEach((fam, fi) => {
            const fx = x0 + fi * FAMILY_PITCH;
            const label = el('text', { x: fx, y: FAMILY_LABEL_Y, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text });
            label.textContent = fam.label;
            label.style.opacity = '0';
            pageLayer.appendChild(label);
            familyLabels.push(label);
            fam.pages.forEach((_page, pi) => {
              const g = el('g');
              const rect = el('rect', { width: PAGE_W, height: PAGE_H, rx: 4, fill: c.bgSubtle, stroke: c.border });
              g.appendChild(rect);
              g.style.opacity = '0';
              pageLayer.appendChild(g);
              const box: PageBox = { g, rect, family: fam.name, x: fx, y: PAGE_Y0 + pi * PAGE_PITCH };
              setMove(g, box.x, box.y, 0);
              pages.push(box);
            });
          });
          const d = dur(ms);
          const fade = d > 0 ? `opacity ${d}ms ease` : 'none';
          for (const p of old) {
            p.g.style.transition = fade;
            p.g.style.opacity = '0';
          }
          for (const l of oldLabels) {
            l.style.transition = fade;
            l.style.opacity = '0';
          }
          // 다음 프레임에 새 쪽을 드러낸다 (transition 이 처음 값을 보게)
          const reveal = () => {
            for (const p of pages) {
              p.g.style.transition = fade;
              p.g.style.opacity = '1';
            }
            for (const l of familyLabels) {
              l.style.transition = fade;
              l.style.opacity = '1';
            }
          };
          if (d > 0 && typeof requestAnimationFrame === 'function') {
            const id = requestAnimationFrame(() => {
              frames.delete(id);
              reveal();
            });
            frames.add(id);
          } else reveal();
          const drop = () => {
            for (const p of old) p.g.remove();
            for (const l of oldLabels) l.remove();
          };
          if (d > 0) {
            const id = setTimeout(() => {
              timers.delete(id);
              drop();
            }, d);
            timers.add(id);
          } else drop();
        } else {
          // 같은 묶음이면 이름표만 다시 또렷하게
          const d = dur(ms);
          for (const l of familyLabels) {
            l.style.transition = d > 0 ? `opacity ${d}ms ease` : 'none';
            l.style.opacity = '1';
          }
        }
        familySig = sig;

        // 칸이 제 쪽의 제 자리로 옮겨 간다 — 칸 차례마다 조금씩 늦게 떠나 갈라지는 것이 보이게
        families.forEach((fam, fi) => {
          const fx = x0 + fi * FAMILY_PITCH;
          fam.pages.forEach((page, pi) => {
            page.cells.forEach((cell, si) => {
              const tok = tokenAt(cell.row, cell.column);
              tok.x = fx + PAGE_PAD + (si % SLOTS_PER_ROW) * SLOT_W;
              tok.y = PAGE_Y0 + pi * PAGE_PITCH + PAGE_PAD + Math.floor(si / SLOTS_PER_ROW) * SLOT_H;
              styleToken(tok, 'stored');
              setMove(tok.g, tok.x, tok.y, ms * 0.75, ms * 0.25 * (tok.col / Math.max(1, (shape?.columns.length ?? 1) - 1)));
            });
          });
        });
        await wait(ms);
      },

      async lift({ lifted, cells, caption: text, ms }) {
        caption.textContent = text;
        for (const p of pages) stylePage(p, lifted.includes(p.family), ms);
        for (const cell of cells) {
          const tok = tokenAt(cell.row, cell.column);
          styleToken(tok, cell.state);
          const up = cell.state === 'unread' ? 0 : LIFT;
          setMove(tok.g, tok.x, tok.y + up, ms);
        }
        await wait(ms);
      },

      async count({ bars: values, fewest, scale, caption: text, ms }) {
        caption.textContent = text;
        if (!(scale > 0)) throw new Error(`column-family-stage: 막대 눈금 ${scale} 이 양수가 아니다`);
        drawTicks(scale);
        if (values.length !== bars.length) throw new Error('column-family-stage: 막대 수가 담는 법 수와 다르다');
        const targets = values.map((v, i) => {
          const bar = bars[i];
          if (!bar || v.grouping !== i) throw new Error(`column-family-stage: 막대 ${i} 의 차례가 다르다`);
          bar.value.textContent = String(v.pages);
          bar.value.setAttribute('font-weight', v.grouping === fewest ? '700' : '400');
          return (v.pages * BAR_TRACK_W) / scale;
        });
        if (fewest < 0 || fewest >= bars.length) throw new Error(`column-family-stage: 가장 적은 자리 ${fewest} 가 막대 밖이다`);
        setBarsFresh(true, ms * 0.3);
        marker.style.opacity = '1';
        setMove(marker, 0, fewest * BAR_PITCH, ms);
        await tweenBars(targets, ms);
      },

      reset() {
        cancelPending();
        sqlText.textContent = '';
        caption.textContent = '';
        clearPages();
        toTable(0);
        bars.forEach((b) => {
          b.width = 0;
          b.rect.setAttribute('width', '0');
          b.value.textContent = '';
          b.value.setAttribute('x', String(BAR_X + 6));
        });
        marker.style.opacity = '0';
        setBarsFresh(false, 0);
      },
    };

    stage.reset();

    return {
      ...stage,
      destroy() {
        destroyed = true;
        cancelPending();
        root.remove();
      },
    };
  },
};
