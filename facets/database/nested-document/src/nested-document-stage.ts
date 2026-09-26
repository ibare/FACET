/**
 * nested-document stage — 왼쪽에 표 셋, 오른쪽에 자라는 문서 하나.
 *
 * 동사 "접혀 들어간다": 접히는 줄이 표의 제 자리에서 떨어져 나와 문서 안쪽 틀로 날아가며
 * 틀 크기로 줄어든다. 값 칸은 JSON 의 제 자리로 옮겨 가고, 잇는 데만 쓰이던 열쇠 칸은 그 자리에서
 * 납작해져 사라진다. 문서의 틀은 겹칠수록 깊은 색이 되고, 아래 줄들은 새 칸이 들어설 만큼 밀려난다.
 * 표에는 빠져나간 줄의 빈 자리만 남는다.
 */
import {
  categorical,
  depthVeil,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { CellValue } from './algorithm.js';
import type { DocNested, NestedDocumentScene, NestedStep, SceneCell, SceneDoc, SceneTable } from './scene.js';

const H = 460;
const W = PIECE_CANVAS_W;
const PAD = 12;
const CAPTION_Y = 22;
const CAPTION_GAP = 20;
const REGION_Y = 68;
const BODY_Y = 78;
const NAME_H = 18;
const HEAD_H = 18;
const TABLE_GAP = 10;
const ROW_MAX = 22;
const STRIPE = 5;
const CELL_PAD = 12;
const REGION_GAP = 36;
const INDENT = 20;
const MOTION_MS = 720;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Box = { x: number; y: number; w: number; h: number };

type TableLayout = {
  box: Box;
  nameY: number;
  headY: number;
  cols: { x: number; w: number }[];
  rows: number[];
};

type Seg = { x: number; text: string; role: 'punct' | 'key' | 'value'; vid: string | null };
type DocLine = { id: string; y: number; segs: Seg[]; link: boolean };
type DocFrame = { id: string; box: Box; depth: number; table: number | null };
type DocLayout = { lines: DocLine[]; frames: DocFrame[] };

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

/** 문서 안의 값 — JSON 표기 */
function fmt(v: CellValue): string {
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

/** 표 칸의 값 — 날것 */
function raw(v: CellValue): string {
  return String(v);
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 걸음이 실어 온 것만으로 이번 걸음 앞의 문서를 되세운다 (prev 를 읽지 않는다). */
function docBefore(doc: SceneDoc | null, step: NestedStep): SceneDoc | null {
  if (doc === null || step.kind === 'shell') return null;
  if (step.kind !== 'fold') return doc;
  const nested: DocNested[] = [];
  for (const n of doc.nested) {
    if (n.field !== step.field) {
      nested.push(n);
      continue;
    }
    if (n.kind === 'array') {
      const members = n.members.filter((_, i) => i !== step.slot - 1);
      if (members.length > 0) nested.push({ kind: 'array', field: n.field, members });
    }
  }
  return { ...doc, links: [...doc.links, ...step.resolved], nested };
}

export const nestedDocumentStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const monoPx = parseFloat(fontSizes.sm);
    const charW = monoPx * 0.6;
    const bodyPx = parseFloat(fontSizes.md);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tableColor(i: number, count: number): string {
      const pal = categorical(count);
      const c = pal[i];
      if (c === undefined) throw new Error(`nested-document stage: 표 ${i} 의 색이 없다`);
      return c;
    }

    // ---------------------------------------------------------------- 자리 셈
    function layoutTables(tables: SceneTable[]): { layouts: TableLayout[]; rowH: number; width: number } {
      const totalRows = tables.reduce((s, tb) => s + tb.rows.length, 0);
      const fixed = tables.length * (NAME_H + HEAD_H) + Math.max(0, tables.length - 1) * TABLE_GAP;
      const avail = H - BODY_Y - PAD - fixed;
      const rowH = totalRows > 0 ? Math.min(ROW_MAX, avail / totalRows) : ROW_MAX;
      const layouts: TableLayout[] = [];
      let y = BODY_Y;
      let width = 0;
      for (const tb of tables) {
        const cols: { x: number; w: number }[] = [];
        let x = PAD + STRIPE + 4;
        tb.columns.forEach((name, c) => {
          let chars = name.length;
          for (const r of tb.rows) {
            const v = r[c];
            if (v === undefined) throw new Error(`nested-document stage: ${tb.name} 줄에 ${name} 칸이 없다`);
            chars = Math.max(chars, raw(v).length);
          }
          const w = chars * charW + CELL_PAD;
          cols.push({ x, w });
          x += w;
        });
        const w = x - PAD;
        width = Math.max(width, w);
        const nameY = y;
        const headY = y + NAME_H;
        const rows = tb.rows.map((_, i) => headY + HEAD_H + i * rowH);
        const h = NAME_H + HEAD_H + tb.rows.length * rowH;
        layouts.push({ box: { x: PAD, y, w, h }, nameY, headY, cols, rows });
        y += h + TABLE_GAP;
      }
      for (const l of layouts) l.box.w = width;
      return { layouts, rowH, width };
    }

    function layoutDoc(doc: SceneDoc | null, docX: number, lineH: number): DocLayout {
      const lines: DocLine[] = [];
      const frames: DocFrame[] = [];
      if (doc === null) return { lines, frames };
      const docW = W - PAD - docX;
      const right = docX + docW;
      let y = BODY_Y;
      const lineX = (depth: number): number => docX + 12 + depth * INDENT;

      function line(id: string, depth: number, parts: { text: string; role: Seg['role']; vid?: string }[], link = false): DocLine {
        let cx = lineX(depth);
        const segs: Seg[] = parts.map((p) => {
          const s: Seg = { x: cx, text: p.text, role: p.role, vid: p.vid ?? null };
          cx += p.text.length * charW;
          return s;
        });
        const l: DocLine = { id, y, segs, link };
        lines.push(l);
        y += lineH;
        return l;
      }
      function pair(owner: string, c: SceneCell, comma: boolean): { text: string; role: Seg['role']; vid?: string }[] {
        return [
          { text: `${JSON.stringify(c.name)}: `, role: 'key' },
          { text: fmt(c.value), role: 'value', vid: `${owner}|${c.name}` },
          ...(comma ? [{ text: ',', role: 'punct' as const }] : []),
        ];
      }

      const top = y;
      line('open', 0, [{ text: '{', role: 'punct' }]);
      const entries = doc.fields.length + doc.links.length + doc.nested.length;
      let k = 0;
      for (const f of doc.fields) {
        k += 1;
        line(`f:${f.name}`, 1, pair('root', f, k < entries));
      }
      for (const l of doc.links) {
        k += 1;
        line(`l:${l.name}`, 1, pair('root', l, k < entries), true);
      }
      for (const n of doc.nested) {
        k += 1;
        const comma = k < entries;
        if (n.kind === 'object') {
          const owner = `o:${n.field}`;
          const oTop = y;
          line(`${owner}:open`, 1, [{ text: `${JSON.stringify(n.field)}: {`, role: 'key' }]);
          n.member.fields.forEach((f, i) => line(`${owner}:f:${f.name}`, 2, pair(owner, f, i < n.member.fields.length - 1)));
          line(`${owner}:close`, 1, [{ text: comma ? '},' : '}', role: 'punct' }]);
          const fx = lineX(1) - 8;
          frames.push({ id: `fr:${owner}`, box: { x: fx, y: oTop + 1, w: right - 8 - fx, h: y - oTop - 2 }, depth: 2, table: n.member.table });
        } else {
          const owner = `a:${n.field}`;
          const aTop = y;
          line(`${owner}:open`, 1, [{ text: `${JSON.stringify(n.field)}: [`, role: 'key' }]);
          n.members.forEach((m, i) => {
            const mOwner = `${owner}:m${i}`;
            const parts: { text: string; role: Seg['role']; vid?: string }[] = [{ text: '{', role: 'punct' }];
            m.fields.forEach((f, j) => {
              parts.push(...pair(mOwner, f, false));
              if (j < m.fields.length - 1) parts.push({ text: ', ', role: 'punct' });
            });
            parts.push({ text: i < n.members.length - 1 ? '},' : '}', role: 'punct' });
            const ln = line(mOwner, 2, parts);
            const len = parts.reduce((s, p) => s + p.text.length, 0) - (i < n.members.length - 1 ? 1 : 0);
            const mx = lineX(2) - 6;
            frames.push({ id: `fr:${mOwner}`, box: { x: mx, y: ln.y + 2, w: len * charW + 12, h: lineH - 4 }, depth: 3, table: m.table });
          });
          line(`${owner}:close`, 1, [{ text: comma ? '],' : ']', role: 'punct' }]);
          const fx = lineX(1) - 8;
          frames.push({ id: `fr:${owner}`, box: { x: fx, y: aTop + 1, w: right - 8 - fx, h: y - aTop - 2 }, depth: 2, table: null });
        }
      }
      line('close', 0, [{ text: '}', role: 'punct' }]);
      frames.unshift({ id: 'fr:root', box: { x: docX, y: top - 3, w: docW, h: y - top + 6 }, depth: 1, table: doc.table });
      return { lines, frames };
    }

    function countLines(doc: SceneDoc | null): number {
      if (doc === null) return 0;
      let n = 2 + doc.fields.length + doc.links.length;
      for (const x of doc.nested) n += x.kind === 'object' ? 2 + x.member.fields.length : 2 + x.members.length;
      return n;
    }

    // ---------------------------------------------------------------- 정적 그리기
    type Drawn = {
      lines: Map<string, SVGGElement>;
      frames: Map<string, SVGRectElement>;
      anim: SVGGElement;
      tl: TableLayout[];
      doc: DocLayout;
      docX: number;
      lineH: number;
    };

    function wrapCaption(text: string): string[] {
      const maxW = W - 2 * PAD;
      const words = text.split(' ');
      const out: string[] = [];
      let cur = '';
      const width = (s: string): number => {
        let w = 0;
        for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x1100 ? bodyPx : bodyPx * 0.55;
        return w;
      };
      for (const word of words) {
        const cand = cur === '' ? word : `${cur} ${word}`;
        if (width(cand) > maxW && cur !== '') {
          out.push(cur);
          cur = word;
        } else cur = cand;
      }
      if (cur !== '') out.push(cur);
      return out;
    }

    function captionFor(scene: NestedDocumentScene): string {
      const step = scene.step;
      const tableName = (i: number): string => {
        const tb = scene.tables[i];
        if (tb === undefined) throw new Error(`nested-document stage: 표 ${i} 가 없다`);
        return tb.name;
      };
      if (step.kind === 'start') {
        return t('caption.start', 'Order {id}: its rows sit in separate tables. Tables: {tables}.', {
          id: raw(scene.rootValue),
          tables: scene.tables.length,
        });
      }
      if (step.kind === 'shell') {
        const head = t('caption.shell', 'Row {n} of {table} becomes the shell of the document.', {
          n: step.row + 1,
          table: tableName(step.table),
        });
        if (scene.doc === null) throw new Error('nested-document stage: 껍질 걸음에 문서가 없다');
        const links = scene.doc.links;
        if (links.length === 0) return head;
        const keys = links.map((l) => `${tableName(step.table)}.${l.name}`).join(', ');
        return `${head} ${t('caption.pointing', 'Still pointing outside: {keys}.', { keys })}`;
      }
      if (step.kind === 'fold') {
        const vars = { n: step.row + 1, table: tableName(step.table), field: step.field, slot: step.slot };
        const head =
          step.nest === 'object'
            ? t('caption.object', 'Row {n} of {table} folds inside as the {field} object.', vars)
            : t('caption.slot', 'Row {n} of {table} folds into the {field} array. Slot: {slot}.', vars);
        const rootName = scene.doc === null ? '' : tableName(scene.doc.table);
        const gone = [
          ...step.dropped.map((c) => `${tableName(step.table)}.${c.name}`),
          ...step.resolved.map((c) => `${rootName}.${c.name}`),
        ];
        if (gone.length === 0) return head;
        return `${head} ${t('caption.gone', 'Key cells gone: {keys}.', { keys: gone.join(', ') })}`;
      }
      return t(
        'caption.done',
        'Rows folded: {rows} → documents: {docs}. Links turned into nesting: {links}. Rows left in tables: {left}.',
        { rows: step.rows, docs: step.docs, links: step.links, left: step.left },
      );
    }

    function newestFrame(step: NestedStep): string | null {
      if (step.kind === 'shell') return 'fr:root';
      if (step.kind !== 'fold') return null;
      return step.nest === 'object' ? `fr:o:${step.field}` : `fr:a:${step.field}:m${step.slot - 1}`;
    }

    function drawStatic(scene: NestedDocumentScene): Drawn {
      svg.textContent = '';
      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });

      // 캡션
      wrapCaption(captionFor(scene)).forEach((ln, i) => {
          const tx = el(svg, 'text', {
            x: PAD,
            y: CAPTION_Y + i * CAPTION_GAP,
            fill: colors.text,
            'font-family': fonts.body,
            'font-size': fontSizes.md,
          });
          tx.textContent = ln;
        });

      const { layouts: tl, rowH, width } = layoutTables(scene.tables);
      const docX = PAD + width + REGION_GAP;
      const n = countLines(scene.doc);
      const lineH = n > 0 ? Math.min(rowH, (H - BODY_Y - PAD) / n) : rowH;

      const regionLabel = (x: number, text: string): void => {
        const tx = el(svg, 'text', {
          x,
          y: REGION_Y,
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        });
        tx.textContent = text;
      };
      regionLabel(PAD, t('label.tables', 'tables'));
      regionLabel(docX, t('label.document', 'document'));

      // 표
      scene.tables.forEach((tb, ti) => {
        const L = tl[ti]!;
        const color = tableColor(ti, scene.tables.length);
        const name = el(svg, 'text', {
          x: PAD,
          y: L.nameY + NAME_H - 5,
          fill: color,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
        });
        name.textContent = tb.name;
        tb.columns.forEach((col, c) => {
          const C = L.cols[c]!;
          const isLink = tb.links.includes(col);
          const h = el(svg, 'text', {
            x: C.x + 4,
            y: L.headY + HEAD_H - 5,
            fill: colors.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          });
          h.textContent = col;
          if (isLink) {
            el(svg, 'line', {
              x1: C.x + 4,
              x2: C.x + 4 + col.length * parseFloat(fontSizes.xs) * 0.6,
              y1: L.headY + HEAD_H - 2,
              y2: L.headY + HEAD_H - 2,
              stroke: colors.textMuted,
              'stroke-dasharray': '2 2',
            });
          }
        });
        el(svg, 'line', {
          x1: PAD,
          x2: PAD + L.box.w,
          y1: L.headY + HEAD_H,
          y2: L.headY + HEAD_H,
          stroke: colors.border,
        });
        tb.rows.forEach((row, r) => {
          const y = L.rows[r]!;
          if (tb.folded[r] === true) {
            el(svg, 'rect', {
              x: PAD + 1,
              y: y + 2,
              width: L.box.w - 2,
              height: rowH - 4,
              rx: 3,
              fill: 'none',
              stroke: colors.ghostOutline,
              'stroke-dasharray': '3 3',
            });
            return;
          }
          el(svg, 'rect', { x: PAD, y: y + 2, width: STRIPE, height: rowH - 4, rx: 1, fill: color });
          row.forEach((v, c) => {
            const C = L.cols[c]!;
            const isLink = tb.links.includes(tb.columns[c]!);
            const tx = el(svg, 'text', {
              x: C.x + 4,
              y: y + rowH / 2 + monoPx * 0.35,
              fill: isLink ? colors.textMuted : colors.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
            });
            tx.textContent = raw(v);
          });
        });
      });

      // 문서
      const doc = layoutDoc(scene.doc, docX, lineH);
      const frames = new Map<string, SVGRectElement>();
      const newest = newestFrame(scene.step);
      for (const f of doc.frames) {
        const veil = depthVeil(f.depth, params.theme);
        const g = el(svg, 'rect', {
          x: f.box.x,
          y: f.box.y,
          width: f.box.w,
          height: f.box.h,
          rx: 4,
          fill: veil.fill,
          'fill-opacity': veil.alpha * 0.18,
          stroke: f.id === newest ? colors.accent : f.table === null ? colors.textMuted : tableColor(f.table, scene.tables.length),
          'stroke-width': f.id === newest ? 2.5 : 1.5,
        });
        frames.set(f.id, g);
      }
      const lines = new Map<string, SVGGElement>();
      for (const ln of doc.lines) {
        const g = el(svg, 'g', {});
        for (const s of ln.segs) {
          const tx = el(g, 'text', {
            x: s.x,
            y: ln.y + lineH / 2 + monoPx * 0.35,
            fill: ln.link || s.role === 'punct' ? colors.textMuted : s.role === 'key' ? colors.textMuted : colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'xml:space': 'preserve',
          });
          tx.textContent = s.text;
        }
        if (ln.link) {
          const first = ln.segs[0]!;
          const last = ln.segs[ln.segs.length - 1]!;
          el(g, 'line', {
            x1: first.x,
            x2: last.x + last.text.length * charW,
            y1: ln.y + lineH - 3,
            y2: ln.y + lineH - 3,
            stroke: colors.textMuted,
            'stroke-dasharray': '2 2',
          });
        }
        lines.set(ln.id, g);
      }

      const anim = el(svg, 'g', {});
      return { lines, frames, anim, tl, doc, docX, lineH };
    }

    // ---------------------------------------------------------------- 운동
    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    async function fold(next: NestedDocumentScene, d: Drawn, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'shell' && step.kind !== 'fold') return;
      const before = layoutDoc(docBefore(next.doc, step), d.docX, d.lineH);
      const bLines = new Map(before.lines.map((l) => [l.id, l]));
      const bFrames = new Map(before.frames.map((f) => [f.id, f]));
      const target = newestFrame(step);
      const targetFrame = d.doc.frames.find((f) => f.id === target);
      if (targetFrame === undefined) throw new Error('nested-document stage: 접혀 들 틀이 없다');

      const tb = next.tables[step.table];
      const L = d.tl[step.table];
      if (tb === undefined || L === undefined) throw new Error('nested-document stage: 접히는 줄의 표가 없다');
      const rowY = L.rows[step.row];
      const row = tb.rows[step.row];
      if (rowY === undefined || row === undefined) throw new Error('nested-document stage: 접히는 줄이 없다');
      const rowH = L.rows.length > 1 ? L.rows[1]! - L.rows[0]! : d.lineH;
      const color = tableColor(step.table, next.tables.length);
      const from: Box = { x: PAD, y: rowY + 2, w: L.box.w, h: rowH - 4 };
      const to = targetFrame.box;

      // 값 칸이 내려앉을 자리
      const owner =
        step.kind === 'shell'
          ? 'root'
          : step.nest === 'object'
            ? `o:${step.field}`
            : `a:${step.field}:m${step.slot - 1}`;
      const segAt = new Map<string, { x: number; y: number }>();
      for (const ln of d.doc.lines) {
        for (const s of ln.segs) {
          if (s.vid !== null) segAt.set(s.vid, { x: s.x, y: ln.y + d.lineH / 2 + monoPx * 0.35 });
        }
      }

      // 새로 선 것은 운동 동안 숨긴다 — 줄이 날아와 그 자리에 앉는다
      const fresh: Element[] = [];
      for (const [id, g] of d.lines) if (!bLines.has(id)) fresh.push(g);
      for (const [id, r] of d.frames) if (!bFrames.has(id)) fresh.push(r);
      for (const e of fresh) e.setAttribute('opacity', '0');

      // 밀려나는 것
      const shifted: { g: SVGGElement; dy: number }[] = [];
      for (const ln of d.doc.lines) {
        const b = bLines.get(ln.id);
        const g = d.lines.get(ln.id);
        if (b !== undefined && g !== undefined && b.y !== ln.y) shifted.push({ g, dy: b.y - ln.y });
      }
      const grown: { r: SVGRectElement; a: Box; b: Box }[] = [];
      for (const f of d.doc.frames) {
        const b = bFrames.get(f.id);
        const r = d.frames.get(f.id);
        if (b !== undefined && r !== undefined) grown.push({ r, a: f.box, b: b.box });
      }

      // 이번에 풀린 열쇠 줄 — 문서 안에서 납작해져 사라진다
      const goneLines = before.lines.filter((l) => !d.doc.lines.some((a) => a.id === l.id));
      const goneG = el(d.anim, 'g', {});
      for (const ln of goneLines) {
        for (const s of ln.segs) {
          const tx = el(goneG, 'text', {
            x: s.x,
            y: ln.y + d.lineH / 2 + monoPx * 0.35,
            fill: colors.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'xml:space': 'preserve',
          });
          tx.textContent = s.text;
        }
      }
      const goneY = goneLines[0]?.y ?? 0;

      // 날아가는 줄
      const mover = el(d.anim, 'g', {});
      const box = el(mover, 'rect', {
        x: from.x,
        y: from.y,
        width: from.w,
        height: from.h,
        rx: 4,
        fill: color,
        'fill-opacity': 0.12,
        stroke: color,
        'stroke-width': 1.5,
      });
      const dropped = new Set(step.kind === 'fold' ? step.dropped.map((c) => c.name) : []);
      const flying: { tx: SVGTextElement; x0: number; y0: number; x1: number; y1: number; json: string }[] = [];
      const squashing: { tx: SVGTextElement; cx: number; y: number }[] = [];
      tb.columns.forEach((col, c) => {
        const C = L.cols[c]!;
        const v = row[c];
        if (v === undefined) throw new Error(`nested-document stage: ${tb.name} 줄에 ${col} 칸이 없다`);
        const x0 = C.x + 4;
        const y0 = rowY + rowH / 2 + monoPx * 0.35;
        const tx = el(mover, 'text', {
          x: x0,
          y: y0,
          fill: dropped.has(col) ? colors.textMuted : colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        tx.textContent = raw(v);
        if (dropped.has(col)) {
          squashing.push({ tx, cx: x0 + (raw(v).length * charW) / 2, y: y0 });
          return;
        }
        const dest = segAt.get(`${owner}|${col}`);
        if (dest === undefined) throw new Error(`nested-document stage: ${col} 칸이 앉을 자리가 없다`);
        flying.push({ tx, x0, y0, x1: dest.x, y1: dest.y, json: fmt(v) });
      });

      const frameCount = Math.max(1, Math.round(MOTION_MS / FRAME_MS));
      for (let i = 1; i <= frameCount; i += 1) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const e = ease(i / frameCount);
        box.setAttribute('x', String(r2(lerp(from.x, to.x, e))));
        box.setAttribute('y', String(r2(lerp(from.y, to.y, e))));
        box.setAttribute('width', String(r2(lerp(from.w, to.w, e))));
        box.setAttribute('height', String(r2(lerp(from.h, to.h, e))));
        for (const f of flying) {
          f.tx.setAttribute('x', String(r2(lerp(f.x0, f.x1, e))));
          f.tx.setAttribute('y', String(r2(lerp(f.y0, f.y1, e))));
          // 반을 넘으면 표의 날것이 문서의 JSON 값이 된다
          if (e >= 0.5) f.tx.textContent = f.json;
        }
        const squash = Math.max(0, 1 - e * 2);
        for (const s of squashing) {
          s.tx.setAttribute('transform', `translate(${r2(s.cx)} ${r2(s.y)}) scale(${r2(squash)} 1) translate(${r2(-s.cx)} ${r2(-s.y)})`);
          s.tx.setAttribute('opacity', String(r2(squash)));
        }
        const cx = goneLines[0]?.segs[0]?.x ?? 0;
        goneG.setAttribute('transform', `translate(${r2(cx)} ${r2(goneY)}) scale(${r2(squash)} 1) translate(${r2(-cx)} ${r2(-goneY)})`);
        goneG.setAttribute('opacity', String(r2(squash)));
        for (const s of shifted) s.g.setAttribute('transform', `translate(0 ${r2(s.dy * (1 - e))})`);
        for (const gr of grown) {
          gr.r.setAttribute('x', String(r2(lerp(gr.b.x, gr.a.x, e))));
          gr.r.setAttribute('y', String(r2(lerp(gr.b.y, gr.a.y, e))));
          gr.r.setAttribute('width', String(r2(lerp(gr.b.w, gr.a.w, e))));
          gr.r.setAttribute('height', String(r2(lerp(gr.b.h, gr.a.h, e))));
        }
        const show = Math.max(0, (e - 0.65) / 0.35);
        for (const f of fresh) f.setAttribute('opacity', String(r2(show)));
        box.setAttribute('fill-opacity', String(r2(0.12 * (1 - show))));
      }
    }

    async function render(next: NestedDocumentScene, _prev: NestedDocumentScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const d = drawStatic(next);
      if (!opts.animate) return;
      if (next.step.kind !== 'shell' && next.step.kind !== 'fold') return;
      await fold(next, d, mine);
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};

