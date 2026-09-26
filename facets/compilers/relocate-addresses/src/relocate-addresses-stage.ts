/**
 * relocate-addresses 무대 — 왼쪽에 파일마다 0 부터 센 절, 오른쪽에 이어 붙인 메모리.
 *
 * 동사는 "옮겨지고 고쳐 적힌다".
 *  - 놓기 걸음: 절 하나가 파일에서 떨어져 나와 메모리의 제자리로 **실제로 옮겨 간다**.
 *    파일 안 자리(+0 · +4 …)는 빈 틀로 남고, 옮겨 온 줄에는 절대 주소가 붙는다.
 *  - 고치기 걸음: 심볼의 주소(절대) 또는 명령에서 심볼까지 잰 거리(상대)가 **칸으로 날아와**
 *    비어 있던 0 을 밀어내고 그 자리에 적힌다. 상대 칸은 P 와 S 사이를 재는 꺾쇠가 선다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import {
  fieldText,
  instrParts,
  relocAt,
  sectionSize,
  type ObjFile,
  type RelocKind,
  type SectionName,
} from './algorithm.js';
import type { RelocScene } from './scene.js';

const H = 410;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PLACE_MS = 520;
const FIX_MS = 520;

const PAD = 12;
const TOP = 32; // 두 기둥 이름 아래
const SUB = 15; // 절 이름 줄
const BOX_PAD = 5;
const FILE_GAP = 8;
const REGION_GAP = 14;
const CAPTION_BAND = 40;

const SM = parseFloat(fontSizes.sm);
const CW = SM * 0.6; // 고정폭 글자 한 칸

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  if (parent) parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  attrs: Attrs,
): SVGTextElement {
  const node = el('text', { x, y, 'dominant-baseline': 'central', ...attrs }, parent);
  node.textContent = body;
  return node;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

// ─── 자리 셈 ───

type Layout = {
  R: number;
  colW: number;
  FX: number;
  MX: number;
  /** 파일마다 상자 위 · text 줄 첫 위 · data 줄 첫 위 · 상자 아래 */
  files: Map<string, { boxTop: number; textTop: number; dataTop: number; boxBottom: number }>;
  memTextTop: number;
  memDataTop: number;
  textRows: number;
  dataRows: number;
};

/** 기둥 안 가로 자리 (기둥 왼쪽에서). 기둥 폭에 비례한다. */
function cols(colW: number): { flagR: number; addrX: number; instrX: number; tagX: number } {
  const k = colW / 280;
  return { flagR: 42 * k, addrX: 52 * k, instrX: 96 * k, tagX: 212 * k };
}

function layout(scene: RelocScene): Layout {
  const files = scene.base.files;
  let units = 0;
  let textRows = 0;
  let dataRows = 0;
  for (const f of files) {
    units += 1 + f.text.length + f.data.length;
    textRows += f.text.length;
    dataRows += f.data.length;
  }
  const fixed = files.length * (2 * SUB + 2 * BOX_PAD + FILE_GAP);
  const avail = H - TOP - CAPTION_BAND;
  const R = Math.min(22, (avail - fixed) / units, (avail - 2 * SUB - REGION_GAP) / (textRows + dataRows));
  const colW = Math.min(280, (W - 2 * PAD - 36) / 2);
  const FX = PAD;
  const MX = W - PAD - colW;
  const map = new Map<string, { boxTop: number; textTop: number; dataTop: number; boxBottom: number }>();
  let y = TOP;
  for (const f of files) {
    const boxTop = y;
    const textTop = boxTop + BOX_PAD + R + SUB;
    const dataTop = textTop + f.text.length * R + SUB;
    const boxBottom = dataTop + f.data.length * R + BOX_PAD;
    map.set(f.name, { boxTop, textTop, dataTop, boxBottom });
    y = boxBottom + FILE_GAP;
  }
  const memTextTop = TOP + SUB;
  const memDataTop = memTextTop + textRows * R + REGION_GAP + SUB;
  return { R, colW, FX, MX, files: map, memTextTop, memDataTop, textRows, dataRows };
}

function fileBox(L: Layout, name: string): { boxTop: number; textTop: number; dataTop: number; boxBottom: number } {
  const b = L.files.get(name);
  if (!b) throw new Error(`relocate-addresses stage: 파일 ${name} 의 자리가 없다`);
  return b;
}

function fileOf(scene: RelocScene, name: string): ObjFile {
  const f = scene.base.files.find((x) => x.name === name);
  if (!f) throw new Error(`relocate-addresses stage: 모르는 파일 ${name}`);
  return f;
}

/** 놓인 절의 메모리 첫 줄 위. data 는 앞서 놓인 data 절의 항목 수만큼 내려간다. */
function memTop(scene: RelocScene, L: Layout, file: string, section: SectionName): number {
  const idx = scene.placements.findIndex((p) => p.file === file && p.section === section);
  if (idx < 0) throw new Error(`relocate-addresses stage: ${file} ${section} 가 놓이지 않았다`);
  const pl = scene.placements[idx]!;
  if (section === 'text') return L.memTextTop + ((pl.at - scene.base.textBase) / scene.base.instrBytes) * L.R;
  let rows = 0;
  for (const q of scene.placements.slice(0, idx)) {
    if (q.section === 'data') rows += fileOf(scene, q.file).data.length;
  }
  return L.memDataTop + rows * L.R;
}

function placedAt(scene: RelocScene, file: string, section: SectionName): number | null {
  const p = scene.placements.find((q) => q.file === file && q.section === section);
  return p ? p.at : null;
}

function fixedValue(scene: RelocScene, file: string, offset: number): number | null {
  const f = scene.fixes.find((q) => q.file === file && q.offset === offset);
  return f ? f.value : null;
}

// ─── 그리기 ───

type Handles = {
  /** 이번 걸음에 옮겨 온 절 (메모리 자리에 그려져 있다) */
  moving?: { group: SVGGElement; addrs: SVGGElement; dx: number; dy: number };
  /** 이번 걸음에 고친 칸 */
  fixing?: {
    newText: SVGTextElement;
    oldBody: string;
    at: { x: number; y: number };
    from: { x: number; y: number };
    layer: SVGGElement;
  };
};

type Row = {
  flag: string;
  addr: string;
  pre: string;
  field: string | null;
  fieldState: 'blank' | 'fixed' | 'now';
  post: string;
  tag: string;
  isData: boolean;
};

function drawRow(g: SVGGElement, addrG: SVGGElement, x: number, y: number, row: Row, L: Layout, c: Palette): SVGTextElement | null {
  const C = cols(L.colW);
  const cy = y + L.R / 2;
  if (row.flag !== '') {
    label(g, x + C.flagR, cy, row.flag, {
      'text-anchor': 'end',
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      'font-weight': 600,
      fill: c.primary,
    });
  }
  label(addrG, x + C.addrX, cy, row.addr, { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted });
  if (row.isData) {
    label(g, x + C.instrX, cy, row.pre, { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
    return null;
  }
  label(g, x + C.instrX, cy, row.pre, { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text });
  let fieldEl: SVGTextElement | null = null;
  if (row.field !== null) {
    const fx = x + C.instrX + row.pre.length * CW;
    const fw = row.field.length * CW;
    el(
      'rect',
      {
        x: fx - 2,
        y: cy - SM * 0.72,
        width: fw + 4,
        height: SM * 1.44,
        rx: 2,
        fill: row.fieldState === 'now' ? c.accent : 'none',
        stroke: row.fieldState === 'blank' ? c.textMuted : row.fieldState === 'now' ? c.accent : c.border,
        'stroke-dasharray': row.fieldState === 'blank' ? '2 2' : 'none',
      },
      g,
    );
    fieldEl = label(g, fx, cy, row.field, {
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      'font-weight': row.fieldState === 'blank' ? 400 : 700,
      fill: row.fieldState === 'blank' ? c.textMuted : row.fieldState === 'now' ? c.stateInk : c.text,
    });
    if (row.post !== '') {
      label(g, fx + fw, cy, row.post, { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text });
    }
  }
  if (row.tag !== '') {
    label(g, x + C.tagX, cy, row.tag, {
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: row.fieldState === 'now' ? c.text : c.textMuted,
    });
  }
  return fieldEl;
}

/** 절 하나의 줄들. 자리 글자는 파일 안이면 +자리, 메모리면 @주소. */
function sectionRows(
  scene: RelocScene,
  f: ObjFile,
  section: SectionName,
  base: number | null,
  bytes: (n: number) => string,
): Row[] {
  const d = scene.base;
  const step = scene.step;
  const flags = (off: number): string =>
    f.symbols
      .filter((s) => s.section === section && s.offset === off)
      .map((s) => s.name)
      .join(' ');
  const at = (off: number): string => (base === null ? `+${off}` : `@${base + off}`);
  if (section === 'text') {
    return f.text.map((ins, k): Row => {
      const off = k * d.instrBytes;
      const r = relocAt(f, off);
      const where = `${f.name}+${off}`;
      if (r === null) {
        const parts = instrParts(ins, where);
        return { flag: flags(off), addr: at(off), pre: parts.pre, field: null, fieldState: 'blank', post: '', tag: '', isData: false };
      }
      const v = fixedValue(scene, f.name, off);
      const now = step.kind === 'fix' && step.file === f.name && step.offset === off;
      const parts = instrParts(ins, where, fieldText(r.kind, v === null ? 0 : v));
      return {
        flag: flags(off),
        addr: at(off),
        pre: parts.pre,
        field: parts.field,
        fieldState: v === null ? 'blank' : now ? 'now' : 'fixed',
        post: parts.post,
        tag: `${r.symbol} ${r.kind}`,
        isData: false,
      };
    });
  }
  let off = 0;
  return f.data.map((item): Row => {
    const row: Row = { flag: flags(off), addr: at(off), pre: bytes(item.size), field: null, fieldState: 'blank', post: '', tag: '', isData: true };
    off += item.size;
    return row;
  });
}

function drawStatic(root: SVGSVGElement, scene: RelocScene, c: Palette, t: Translate): Handles {
  root.textContent = '';
  const L = layout(scene);
  const C = cols(L.colW);
  const d = scene.base;
  const step = scene.step;
  const handles: Handles = {};
  const bytesOf = (n: number): string => t('label.bytes', 'Bytes: {n}', { n });
  el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, root);

  // 기둥 이름
  label(root, L.FX, 16, t('label.files', 'Object files'), {
    'font-family': fonts.body,
    'font-size': fontSizes.sm,
    'font-weight': 600,
    fill: c.textMuted,
  });
  label(root, L.MX, 16, t('label.memory', 'Memory'), {
    'font-family': fonts.body,
    'font-size': fontSizes.sm,
    'font-weight': 600,
    fill: c.textMuted,
  });

  // 메모리 바탕 — 두 구역의 빈 틀과 시작 주소
  const regions: { section: SectionName; top: number; rows: number; base: number }[] = [
    { section: 'text', top: L.memTextTop, rows: L.textRows, base: d.textBase },
    { section: 'data', top: L.memDataTop, rows: L.dataRows, base: d.dataBase },
  ];
  for (const rg of regions) {
    label(root, L.MX + C.addrX, rg.top - SUB / 2, rg.section, {
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    el(
      'rect',
      {
        x: L.MX + C.addrX - 6,
        y: rg.top,
        width: L.colW - C.addrX + 6,
        height: rg.rows * L.R,
        fill: 'none',
        stroke: c.border,
        'stroke-dasharray': '3 3',
      },
      root,
    );
    label(root, L.MX + C.addrX - 10, rg.top + L.R / 2, `@${rg.base}`, {
      'text-anchor': 'end',
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
      opacity: placedAt(scene, d.files[0]!.name, rg.section) === null ? 1 : 0,
    });
  }

  // 파일 상자
  for (const f of d.files) {
    const b = fileBox(L, f.name);
    el(
      'rect',
      { x: L.FX, y: b.boxTop, width: L.colW, height: b.boxBottom - b.boxTop, rx: 4, fill: c.bgSubtle, stroke: c.border },
      root,
    );
    label(root, L.FX + 8, b.boxTop + BOX_PAD + L.R / 2, f.name, {
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      'font-weight': 700,
      fill: c.text,
    });
    for (const section of ['text', 'data'] as const) {
      const top = section === 'text' ? b.textTop : b.dataTop;
      const n = section === 'text' ? f.text.length : f.data.length;
      label(root, L.FX + C.addrX, top - SUB / 2, section, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });
      const at = placedAt(scene, f.name, section);
      if (at === null) {
        // 아직 파일 안 — 0 부터 센 자리로 선다
        const g = el('g', {}, root);
        const ag = el('g', {}, root);
        el('rect', { x: L.FX + C.addrX - 6, y: top, width: L.colW - C.addrX, height: n * L.R, fill: c.bg, stroke: c.border }, g);
        const rows = sectionRows(scene, f, section, null, bytesOf);
        rows.forEach((row, k) => drawRow(g, ag, L.FX, top + k * L.R, row, L, c));
      } else {
        // 떠난 자리 — 빈 틀, 파일 안 자리, 어디로 갔는지
        el(
          'rect',
          {
            x: L.FX + C.addrX - 6,
            y: top,
            width: L.colW - C.addrX,
            height: n * L.R,
            fill: 'none',
            stroke: c.textMuted,
            'stroke-dasharray': '3 3',
          },
          root,
        );
        const size = sectionSize(d, f, section);
        const offs: number[] = [];
        if (section === 'text') {
          for (let k = 0; k < f.text.length; k += 1) offs.push(k * d.instrBytes);
        } else {
          let o = 0;
          for (const item of f.data) {
            offs.push(o);
            o += item.size;
          }
        }
        offs.forEach((o, k) =>
          label(root, L.FX + C.addrX, top + k * L.R + L.R / 2, `+${o}`, {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
            opacity: 0.6,
          }),
        );
        label(root, L.FX + L.colW - 8, top + (n * L.R) / 2, `→ @${at}~@${at + size - 1}`, {
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
      }
    }
  }

  // 메모리 — 놓인 절
  const fieldPos = new Map<string, { x: number; y: number; el: SVGTextElement }>();
  for (const pl of scene.placements) {
    const f = fileOf(scene, pl.file);
    const top = memTop(scene, L, pl.file, pl.section);
    const n = pl.section === 'text' ? f.text.length : f.data.length;
    const g = el('g', {}, root);
    const ag = el('g', {}, root);
    const now = step.kind === 'place' && step.file === pl.file && step.section === pl.section;
    el(
      'rect',
      {
        x: L.MX + C.addrX - 6,
        y: top,
        width: L.colW - C.addrX + 6,
        height: n * L.R,
        fill: c.bgSubtle,
        stroke: now ? c.accent : c.border,
        'stroke-width': now ? 2 : 1,
      },
      g,
    );
    const rows = sectionRows(scene, f, pl.section, pl.at, bytesOf);
    rows.forEach((row, k) => {
      const y = top + k * L.R;
      const fe = drawRow(g, ag, L.MX, y, row, L, c);
      if (fe !== null && pl.section === 'text') {
        const off = k * d.instrBytes;
        fieldPos.set(`${pl.file}:${off}`, { x: L.MX + C.instrX + row.pre.length * CW, y: y + L.R / 2, el: fe });
      }
    });
    if (now) {
      const b = fileBox(L, pl.file);
      const fromTop = pl.section === 'text' ? b.textTop : b.dataTop;
      handles.moving = { group: g, addrs: ag, dx: L.FX - L.MX, dy: fromTop - top };
    }
  }

  // 고치기 걸음 — 어디서 온 수인가
  if (step.kind === 'fix') {
    const pos = fieldPos.get(`${step.file}:${step.offset}`);
    if (!pos) throw new Error(`relocate-addresses stage: ${step.file}+${step.offset} 칸이 메모리에 없다`);
    const sRow = symbolRowY(scene, L, step.symbol);
    const layer = el('g', {}, root);
    const gx = L.MX - 2; // 두 기둥 사이 틈 — P · S 표시와 꺾쇠가 선다
    // S 줄의 주소 글자를 짚는다
    el('rect', { x: L.MX + C.addrX - 3, y: sRow - SM * 0.72, width: fieldText('ABS', step.s).length * CW + 6, height: SM * 1.44, rx: 2, fill: 'none', stroke: c.accent, 'stroke-width': 2 }, layer);
    let from: { x: number; y: number };
    if (step.reloc === 'ABS') {
      from = { x: L.MX + C.addrX, y: sRow };
      label(layer, gx - 3, sRow, t('label.s', 'S'), { 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 700, fill: c.text });
    } else {
      // P 에서 S 까지 재는 꺾쇠
      const pY = pos.y;
      const bx = gx;
      el('path', { d: `M ${r2(bx + 6)} ${r2(pY)} H ${r2(bx)} V ${r2(sRow)} H ${r2(bx + 6)}`, fill: 'none', stroke: c.text, 'stroke-width': 1.5 }, layer);
      label(layer, bx - 3, pY, t('label.p', 'P'), { 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 700, fill: c.text });
      label(layer, bx - 3, sRow, t('label.s', 'S'), { 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 700, fill: c.text });
      const midY = (pY + sRow) / 2;
      const dist = fieldText('REL', step.value);
      el('rect', { x: bx - 3 - dist.length * CW - 6, y: midY - SM * 0.72, width: dist.length * CW + 6, height: SM * 1.44, rx: 2, fill: c.accent }, layer);
      label(layer, bx - 6, midY, dist, { 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700, fill: c.stateInk });
      from = { x: bx - 6 - dist.length * CW, y: midY };
    }
    // 온 길 — 원천에서 칸까지 옅은 선
    el(
      'path',
      {
        d: `M ${r2(step.reloc === 'ABS' ? from.x + fieldText('ABS', step.s).length * CW + 3 : gx)} ${r2(from.y)} C ${r2(pos.x - 20)} ${r2(from.y)}, ${r2(pos.x - 20)} ${r2(pos.y)}, ${r2(pos.x - 3)} ${r2(pos.y)}`,
        fill: 'none',
        stroke: c.textMuted,
        'stroke-dasharray': '2 3',
      },
      layer,
    );
    handles.fixing = {
      newText: pos.el,
      oldBody: fieldText(step.reloc, 0),
      at: { x: pos.x, y: pos.y },
      from,
      layer,
    };
  }

  // 캡션 — 지금 일어나는 일
  label(root, W / 2, H - CAPTION_BAND / 2, captionOf(scene, t), {
    'text-anchor': 'middle',
    'font-family': fonts.body,
    'font-size': fontSizes.md,
    fill: c.text,
  });
  return handles;
}

/** 심볼이 놓인 메모리 줄의 가운데 y. */
function symbolRowY(scene: RelocScene, L: Layout, name: string): number {
  for (const f of scene.base.files) {
    const s = f.symbols.find((x) => x.name === name);
    if (!s) continue;
    const top = memTop(scene, L, f.name, s.section);
    let k: number;
    if (s.section === 'text') {
      k = s.offset / scene.base.instrBytes;
    } else {
      let o = 0;
      k = f.data.findIndex((item) => {
        const hit = o === s.offset;
        o += item.size;
        return hit;
      });
      if (k < 0) throw new Error(`relocate-addresses stage: ${name} 가 data 항목 머리에 있지 않다`);
    }
    return top + k * L.R + L.R / 2;
  }
  throw new Error(`relocate-addresses stage: 심볼 ${name} 를 정의한 파일이 없다`);
}

function captionOf(scene: RelocScene, t: Translate): string {
  const step = scene.step;
  if (step.kind === 'start') {
    let n = 0;
    for (const f of scene.base.files) n += f.relocs.length;
    return t('caption.start', 'Each file counts from 0 · address fields still at 0: {n}', { n });
  }
  if (step.kind === 'place') {
    return t('caption.place', 'Placed {file} {section} at @{from}–@{to}', {
      file: step.file,
      section: step.section,
      from: step.at,
      to: step.at + step.size - 1,
    });
  }
  const kind: RelocKind = step.reloc;
  if (kind === 'ABS') {
    return t('caption.abs', 'Rewrote {file}+{offset} · absolute {symbol}: S = @{s}', {
      file: step.file,
      offset: step.offset,
      symbol: step.symbol,
      s: step.s,
    });
  }
  return t('caption.rel', 'Rewrote {file}+{offset} · relative {symbol}: S − P = {s} − {p} = {field}', {
    file: step.file,
    offset: step.offset,
    symbol: step.symbol,
    s: step.s,
    p: step.p,
    field: fieldText('REL', step.value),
  });
}

// ─── 마운트 ───

export const relocateAddressesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const root = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** ms 동안 draw(0→1) 를 흘린다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function flow(ms: number, mine: number, draw: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const u = Math.min(1, (Date.now() - start) / ms);
          draw(ease(u));
          if (u >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: RelocScene, prev: RelocScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(root, next, c, t);
      if (!opts.animate || prev === null) return;
      const step = next.step;
      if (step.kind === 'place' && h.moving && prev.placements.length + 1 === next.placements.length) {
        const m = h.moving;
        m.addrs.setAttribute('opacity', '0');
        await flow(PLACE_MS, mine, (u) => {
          m.group.setAttribute('transform', `translate(${r2(m.dx * (1 - u))} ${r2(m.dy * (1 - u))})`);
          m.addrs.setAttribute('opacity', String(r2(Math.max(0, (u - 0.7) / 0.3))));
        });
      } else if (step.kind === 'fix' && h.fixing && prev.fixes.length + 1 === next.fixes.length) {
        const fx = h.fixing;
        const old = label(fx.layer, fx.at.x, fx.at.y, fx.oldBody, {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
        const token = label(fx.layer, fx.from.x, fx.from.y, fieldText(step.reloc, step.value), {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: c.text,
        });
        fx.newText.setAttribute('opacity', '0');
        await flow(FIX_MS, mine, (u) => {
          token.setAttribute('x', String(r2(fx.from.x + (fx.at.x - fx.from.x) * u)));
          token.setAttribute('y', String(r2(fx.from.y + (fx.at.y - fx.from.y) * u)));
          old.setAttribute('y', String(r2(fx.at.y - L_RISE * u)));
          old.setAttribute('opacity', String(r2(1 - u)));
        });
      } else {
        return;
      }
      if (destroyed || mine !== gen) return;
      drawStatic(root, next, c, t);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.textContent = '';
      },
    };
  },
};

/** 밀려나는 옛 0 이 오르는 높이. */
const L_RISE = SM;
