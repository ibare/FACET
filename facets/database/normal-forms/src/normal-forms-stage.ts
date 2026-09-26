/**
 * normal-forms-stage — 떼어 낸 표들을 한 줄로 세우고, 단계가 바뀌면 칸이 제 표로 옮겨 가며 같은 줄이 한 자리로 접힌다.
 *
 * 무엇이 옮겨 가는가:
 *   - 칸 하나 = (표, 열, 1NF 줄 i). 단계를 올리면 새 표의 칸은 **앞 판에서 그 열의 칸이 있던 자리**에서 출발해
 *     제 표로 떨어져 나가고, 같은 자리(slot)에 앉는 줄들은 한 줄 위로 모이며 사라진다 (접힘). 내리면 거꾸로 펴진다
 *   - 고칠 줄 표시 · 찾은 줄 테두리는 한 벌을 들고 있다가 다른 표의 다른 줄로 **옮겨 간다**
 *   - 종속 딱지는 걸음 3 에서 제 열을 다 가진 표 밑으로 가 앉고, 집이 없으면 아래 줄로 떨어진다
 *
 * 셈은 하지 않는다 — 떼어 내기 · 자리 · 고칠 줄 · 찾은 줄 · 집은 알고리즘이 payload 에 싣는다. 여기서는 글자 폭으로 자리만 잡는다.
 * 문안 조회기는 `t` 하나 (params.t ?? makeTranslator(params.locale)).
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type NfTable = {
  name: string;
  cols: string[];
  nested: string[];
  slots: number[];
  lead: boolean[];
  cells: string[][];
  rowCount: number;
};
export type NfFd = { id: string; lhs: string[]; rhs: string[] };
export type NfHome = NfFd & { home: string | null };
export type NfLayout = {
  stageName: string;
  fact: { fix: string; key: string; value: string };
  tables: NfTable[];
  fds: NfFd[];
};

/** projector 가 부르는 표면 */
export type NormalFormsStageSurface = {
  layout(l: NfLayout, ms: number): void;
  markFix(table: string, slots: number[], ms: number): void;
  markFound(table: string, slots: number[], ms: number): void;
  seat(homes: NfHome[], ms: number): void;
  setCaption(line1: string, line2: string): void;
  reset(): void;
};

const W = 760;
const H = 496;
const M = 16;
const GAP = 14;
const TOP_Y = 26;
const TY = 48;
const NAME_H = 18;
const HEAD_H = 22;
const RH = 22;
const MAX_ROWS = 8;
const ROW_TOP = TY + NAME_H + HEAD_H;
const FY = ROW_TOP + MAX_ROWS * RH + 18;
const CH = 24;
const LY = FY + 5 * CH + 12;
const CAP1 = LY + 44;
const CAP2 = CAP1 + 22;
const COND_X = 250;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pos = { x: number; y: number };
type Cell = { g: SVGGElement; bg: SVGRectElement | null; text: SVGTextElement; col: string; row: number | 'h' };
type Frame = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement; lastCol: string };
type Chip = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; w: number };
type Geo = { x: number; w: number; colX: number[]; colW: number[]; table: NfTable };

export const normalFormsStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const svg = params.canvas;
    const isInstant = params.isInstant ?? (() => false);
    const monoPx = parseFloat(fontSizes.sm);
    const chipPx = parseFloat(fontSizes.xs);
    const monoW = monoPx * 0.6;
    const chipW = chipPx * 0.6;

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };

    const root = el('g', {}, svg);
    const gFrames = el('g', {}, root);
    const gMarks = el('g', {}, root);
    const gCells = el('g', {}, root);
    const gChips = el('g', {}, root);
    const gText = el('g', {}, root);

    // 머리 줄 — 고칠 열 · 조건 (SQL 조건식 그대로) · 단계 이름
    const fixText = el('text', { x: M, y: TOP_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.textMuted }, gText);
    const fixLabel = el('tspan', {}, fixText);
    const fixValue = el('tspan', { dx: 8, 'font-family': fonts.mono, 'font-weight': 700, fill: c.accent }, fixText);
    const condText = el('text', { x: COND_X, y: TOP_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.textMuted }, gText);
    const condLabel = el('tspan', {}, condText);
    const condValue = el('tspan', { dx: 8, 'font-family': fonts.mono, 'font-weight': 700, fill: c.primary }, condText);
    const stageText = el(
      'text',
      { x: W - M, y: TOP_Y, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xl, 'font-weight': 700, fill: c.text },
      gText,
    );
    const declaredText = el('text', { x: M, y: FY + 12, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, gText);
    declaredText.textContent = t('label.declared', 'Declared dependencies');
    const lostText = el('text', { x: M, y: LY + 14, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.danger }, gText);
    lostText.textContent = t('label.lost', 'No home table');
    declaredText.style.opacity = '0';
    lostText.style.opacity = '0';
    const cap1 = el('text', { x: M, y: CAP1, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text }, gText);
    const cap2 = el('text', { x: M, y: CAP2, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, gText);
    const condAnchor: Pos = { x: COND_X + 40, y: TOP_Y - 14 };

    const cells = new Map<string, Cell>();
    const frames = new Map<string, Frame>();
    const chips = new Map<string, Chip>();
    let fixMarks: SVGRectElement[] = [];
    let foundMarks: SVGRectElement[] = [];
    let geo = new Map<string, Geo>();
    let current: NfLayout | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const pending = new Set<() => void>();
    let destroyed = false;

    const later = (fn: () => void, ms: number): void => {
      if (ms <= 0) {
        fn();
        return;
      }
      pending.add(fn);
      const id = setTimeout(() => {
        timers.delete(id);
        pending.delete(fn);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    };
    const flush = (): void => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      const fns = [...pending];
      pending.clear();
      for (const fn of fns) fn();
    };
    params.onScrubStart?.(flush);

    /** 자리 옮김 — CSS transition. 새로 만든 것은 출발 자리를 먼저 박고 스타일을 한 번 흘린 뒤 옮긴다 */
    const move = (node: SVGGraphicsElement, to: Pos, opacity: number, ms: number): void => {
      const d = isInstant() ? 0 : ms;
      node.style.transition = d > 0 ? `transform ${d}ms ease, opacity ${d}ms ease` : 'none';
      node.style.transform = `translate(${to.x}px, ${to.y}px)`;
      node.style.opacity = String(opacity);
    };
    const start = (node: SVGGraphicsElement, from: Pos, opacity: number): void => {
      node.style.transition = 'none';
      node.style.transform = `translate(${from.x}px, ${from.y}px)`;
      node.style.opacity = String(opacity);
      void node.getBoundingClientRect();
    };
    const resize = (rect: SVGRectElement, w: number, h: number, ms: number): void => {
      const d = isInstant() ? 0 : ms;
      rect.style.transition = d > 0 ? `width ${d}ms ease, height ${d}ms ease` : 'none';
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(h));
      rect.style.width = `${w}px`;
      rect.style.height = `${h}px`;
    };

    const textWidth = (s: string, per: number): number => s.length * per;

    function geometry(l: NfLayout): Map<string, Geo> {
      const out = new Map<string, Geo>();
      let x = M;
      for (const tb of l.tables) {
        const colW = tb.cols.map((col, ci) => {
          const texts = tb.cells[ci];
          if (!texts) throw new Error(`normal-forms-stage: ${tb.name}.${col} 칸이 없다`);
          const longest = Math.max(col.length, ...texts.map((s) => s.length));
          return Math.ceil(longest * monoW) + 14;
        });
        const colX: number[] = [];
        let acc = 0;
        for (const w of colW) {
          colX.push(acc);
          acc += w;
        }
        out.set(tb.name, { x, w: acc, colX, colW, table: tb });
        x += acc + GAP;
      }
      return out;
    }

    const cellPos = (g: Geo, ci: number, slot: number | 'h'): Pos => {
      const cx = g.colX[ci];
      if (cx === undefined) throw new Error(`normal-forms-stage: ${g.table.name} 에 열 ${ci} 이 없다`);
      return { x: g.x + cx, y: slot === 'h' ? TY + NAME_H : ROW_TOP + slot * RH };
    };

    /** 열 col 의 줄 row 칸이 이 배치에서 앉는 자리 — 그 열을 가진 첫 표 */
    function firstPos(map: Map<string, Geo>, col: string, row: number | 'h'): Pos | null {
      for (const g of map.values()) {
        const ci = g.table.cols.indexOf(col);
        if (ci < 0) continue;
        if (row === 'h') return cellPos(g, ci, 'h');
        const slot = g.table.slots[row];
        if (slot === undefined) throw new Error(`normal-forms-stage: ${g.table.name} 에 줄 ${row} 의 자리가 없다`);
        return cellPos(g, ci, slot);
      }
      return null;
    }

    function makeCell(col: string, row: number | 'h', w: number): Cell {
      const g = el('g', {}, gCells);
      let bg: SVGRectElement | null = null;
      if (row === 'h') {
        bg = el('rect', { x: 0, y: 0, width: w, height: HEAD_H, fill: c.bgSubtle, stroke: c.border }, g);
      }
      const text = el(
        'text',
        {
          x: 7,
          y: 15,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': row === 'h' ? 700 : 400,
          fill: row === 'h' ? c.textMuted : c.text,
        },
        g,
      );
      return { g, bg, text, col, row };
    }

    function layout(l: NfLayout, ms: number): void {
      const prevGeo = geo;
      const stageChanged = current === null || current.stageName !== l.stageName;
      const next = geometry(l);
      const seen = new Set<string>();

      fixLabel.textContent = t('label.fix', 'Fix');
      fixValue.textContent = l.fact.fix;
      condLabel.textContent = t('label.condition', 'Condition');
      condValue.textContent = `${l.fact.key} = '${l.fact.value}'`;
      stageText.textContent = l.stageName;

      // 표 틀
      const seenFrames = new Set<string>();
      for (const [name, g] of next) {
        seenFrames.add(name);
        const rows = g.table.rowCount;
        const lastCol = g.table.cols[g.table.cols.length - 1];
        if (lastCol === undefined) throw new Error(`normal-forms-stage: ${name} 에 열이 없다`);
        let f = frames.get(name);
        if (!f) {
          const fg = el('g', {}, gFrames);
          const rect = el('rect', { x: 0, y: NAME_H, rx: 3, fill: c.bg, stroke: c.border }, fg);
          const label = el(
            'text',
            { x: 0, y: 12, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700, fill: c.text },
            fg,
          );
          label.textContent = name;
          f = { g: fg, rect, label, lastCol };
          frames.set(name, f);
          const origin = firstPos(prevGeo, lastCol, 'h');
          start(fg, origin ? { x: origin.x, y: TY } : { x: g.x, y: TY }, 0);
          resize(rect, g.w, HEAD_H + rows * RH, 0);
        }
        f.lastCol = lastCol;
        move(f.g, { x: g.x, y: TY }, 1, ms);
        resize(f.rect, g.w, HEAD_H + rows * RH, ms);
      }
      for (const [name, f] of frames) {
        if (seenFrames.has(name)) continue;
        frames.delete(name);
        const to = firstPos(next, f.lastCol, 'h');
        move(f.g, to ? { x: to.x, y: TY } : readPos(f.g), 0, ms);
        later(() => f.g.remove(), ms);
      }

      // 칸 — 머리 칸과 줄 칸
      for (const [name, g] of next) {
        g.table.cols.forEach((col, ci) => {
          const texts = g.table.cells[ci];
          const w = g.colW[ci];
          if (!texts || w === undefined) throw new Error(`normal-forms-stage: ${name}.${col} 칸이 없다`);
          const put = (row: number | 'h', text: string, to: Pos, visible: boolean): void => {
            const key = `${name}|${col}|${row}`;
            seen.add(key);
            let cell = cells.get(key);
            if (!cell) {
              cell = makeCell(col, row, w);
              cells.set(key, cell);
              const origin = firstPos(prevGeo, col, row);
              start(cell.g, origin ?? to, origin ? 1 : 0);
            }
            cell.text.textContent = text;
            if (cell.bg) resize(cell.bg, w, HEAD_H, ms);
            cell.text.setAttribute('fill', row === 'h' ? c.textMuted : c.text);
            move(cell.g, to, visible ? 1 : 0, ms);
          };
          put('h', col, cellPos(g, ci, 'h'), true);
          texts.forEach((text, i) => {
            const slot = g.table.slots[i];
            const lead = g.table.lead[i];
            if (slot === undefined || lead === undefined) throw new Error(`normal-forms-stage: ${name} 줄 ${i} 의 자리가 없다`);
            put(i, text, cellPos(g, ci, slot), lead);
          });
        });
      }
      for (const [key, cell] of cells) {
        if (seen.has(key)) continue;
        cells.delete(key);
        const to = firstPos(next, cell.col, cell.row);
        move(cell.g, to ?? readPos(cell.g), 0, ms);
        later(() => cell.g.remove(), ms);
      }

      // 표시 — 단계가 바뀌면 조건으로 거둬들인다 (가리키던 줄이 옮겨 가므로)
      // 사실만 바뀌었으면 찾은 줄 테두리는 거둬들이고(다른 조건의 답이다), 고칠 줄 표시는 흐리게 두었다가 걸음 1 에서 옮긴다
      const factChanged =
        current !== null &&
        (current.fact.fix !== l.fact.fix || current.fact.key !== l.fact.key || current.fact.value !== l.fact.value);
      if (stageChanged) {
        fixMarks = gather(fixMarks, ms);
        foundMarks = gather(foundMarks, ms);
      } else if (factChanged) {
        foundMarks = gather(foundMarks, ms);
        for (const m of fixMarks) move(m, readPos(m), 0.3, ms);
      }

      // 종속 딱지 — 선언된 자리(대기 줄)로
      declaredText.style.transition = `opacity ${isInstant() ? 0 : ms}ms ease`;
      declaredText.style.opacity = '1';
      lostText.style.transition = `opacity ${isInstant() ? 0 : ms}ms ease`;
      lostText.style.opacity = '0';
      let px = M;
      let py = FY + 20;
      for (const fd of l.fds) {
        const chip = chipOf(fd);
        if (px + chip.w > W - M) {
          px = M;
          py += CH;
        }
        if (!chip.g.style.transform) start(chip.g, { x: px, y: py }, 0);
        move(chip.g, { x: px, y: py }, 1, ms);
        chip.rect.setAttribute('stroke', c.border);
        px += chip.w + 8;
      }

      geo = next;
      current = l;
    }

    function chipOf(fd: NfFd): Chip {
      const found = chips.get(fd.id);
      if (found) return found;
      const label = `${fd.id}  ${fd.lhs.join(', ')} → ${fd.rhs.join(', ')}`;
      const w = Math.ceil(textWidth(label, chipW)) + 14;
      const g = el('g', {}, gChips);
      const rect = el('rect', { x: 0, y: 0, width: w, height: CH - 4, rx: 10, fill: c.bgSubtle, stroke: c.border }, g);
      const text = el('text', { x: 7, y: 14, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text }, g);
      text.textContent = label;
      const chip = { g, rect, text, w };
      chips.set(fd.id, chip);
      return chip;
    }

    /** 표시 한 벌을 조건 자리로 거둬들이고 지운다 */
    function gather(marks: SVGRectElement[], ms: number): SVGRectElement[] {
      for (const m of marks) {
        move(m, condAnchor, 0, ms);
        resize(m, 40, 4, ms);
        later(() => m.remove(), ms);
      }
      return [];
    }

    /** 표시 한 벌을 표 table 의 줄 slots 로 옮긴다. 있던 것은 그 자리에서, 모자라면 첫 표시(없으면 조건)에서 출발 */
    function retarget(marks: SVGRectElement[], table: string, slots: number[], ms: number, style: 'fill' | 'ring'): SVGRectElement[] {
      const g = geo.get(table);
      if (!g) throw new Error(`normal-forms-stage: 표 ${table} 이 화면에 없다`);
      const out: SVGRectElement[] = [];
      const firstFrom: Pos = marks[0] ? readPos(marks[0]) : condAnchor;
      slots.forEach((slot, k) => {
        let m = marks[k];
        if (!m) {
          m =
            style === 'fill'
              ? el('rect', { x: 0, y: 0, rx: 3, fill: c.accent, 'fill-opacity': 0.22 }, gMarks)
              : el('rect', { x: -2, y: -1, rx: 4, fill: 'none', stroke: c.primary, 'stroke-width': 2 }, gMarks);
          start(m, firstFrom, 0);
          resize(m, 40, 4, 0);
        }
        move(m, { x: g.x, y: ROW_TOP + slot * RH }, 1, ms);
        resize(m, style === 'fill' ? g.w : g.w + 4, style === 'fill' ? RH : RH + 2, ms);
        out.push(m);
      });
      const lastSlot = slots[slots.length - 1];
      const to: Pos = lastSlot === undefined ? condAnchor : { x: g.x, y: ROW_TOP + lastSlot * RH };
      for (let k = slots.length; k < marks.length; k += 1) {
        const m = marks[k];
        if (!m) continue;
        move(m, to, 0, ms);
        later(() => m.remove(), ms);
      }
      return out;
    }

    function readPos(node: SVGGraphicsElement): Pos {
      const hit = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(node.style.transform);
      if (!hit) throw new Error(`normal-forms-stage: 자리를 읽지 못했다 (${node.style.transform})`);
      return { x: Number(hit[1]), y: Number(hit[2]) };
    }

    function headerTint(table: string, fix: string | null, key: string | null): void {
      for (const [k, cell] of cells) {
        if (cell.row !== 'h') continue;
        const inTable = k.startsWith(`${table}|`);
        const fill = inTable && cell.col === fix ? c.accent : inTable && cell.col === key ? c.primary : c.textMuted;
        cell.text.setAttribute('fill', fill);
      }
    }

    const surface: NormalFormsStageSurface = {
      layout,
      markFix(table, slots, ms) {
        if (!current) throw new Error('normal-forms-stage: 표가 서기 전에 고칠 줄이 왔다');
        headerTint(table, current.fact.fix, current.fact.key);
        fixMarks = retarget(fixMarks, table, slots, ms, 'fill');
      },
      markFound(table, slots, ms) {
        if (slots.length === 0) {
          foundMarks = gather(foundMarks, ms);
          if (!geo.has(table)) throw new Error(`normal-forms-stage: 표 ${table} 이 화면에 없다`);
          return;
        }
        foundMarks = retarget(foundMarks, table, slots, ms, 'ring');
      },
      seat(homes, ms) {
        let row = 0;
        let lx = M + 150;
        declaredText.style.transition = `opacity ${isInstant() ? 0 : ms}ms ease`;
        declaredText.style.opacity = '0';
        lostText.style.transition = `opacity ${isInstant() ? 0 : ms}ms ease`;
        lostText.style.opacity = homes.some((h) => h.home === null) ? '1' : '0';
        for (const h of homes) {
          const chip = chipOf(h);
          if (h.home === null) {
            move(chip.g, { x: lx, y: LY }, 1, ms);
            chip.rect.setAttribute('stroke', c.danger);
            lx += chip.w + 8;
            continue;
          }
          const g = geo.get(h.home);
          if (!g) throw new Error(`normal-forms-stage: 집 ${h.home} 이 화면에 없다`);
          // 딱지마다 제 줄 — 좁은 표 밑에서 넓은 딱지가 이웃 딱지를 덮지 않게. 가로 자리가 곧 집이다
          move(chip.g, { x: g.x, y: FY + row * CH }, 1, ms);
          row += 1;
          chip.rect.setAttribute('stroke', c.success);
        }
      },
      setCaption(line1, line2) {
        cap1.textContent = line1;
        cap2.textContent = line2;
      },
      reset() {
        flush();
        for (const cell of cells.values()) cell.g.remove();
        cells.clear();
        for (const f of frames.values()) f.g.remove();
        frames.clear();
        for (const ch of chips.values()) ch.g.remove();
        chips.clear();
        for (const m of [...fixMarks, ...foundMarks]) m.remove();
        fixMarks = [];
        foundMarks = [];
        geo = new Map();
        current = null;
        fixLabel.textContent = '';
        fixValue.textContent = '';
        condLabel.textContent = '';
        condValue.textContent = '';
        stageText.textContent = '';
        declaredText.style.opacity = '0';
        lostText.style.opacity = '0';
        cap1.textContent = '';
        cap2.textContent = '';
      },
    };

    return {
      ...surface,
      destroy() {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        pending.clear();
        root.remove();
      },
    };
  },
};
