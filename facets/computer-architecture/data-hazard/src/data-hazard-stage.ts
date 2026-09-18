/**
 * data-hazard stage — 명령어 띠가 박자 축을 따라 밀려나고 당겨진다.
 *
 * 행 하나가 명령어 하나다. 행의 띠(IF · ID · EX · MEM · WB)가 박자 칸 위에 놓이고,
 * 대처가 바뀌면 띠가 **오른쪽으로 밀려나거나 왼쪽으로 당겨진다.** 멈춘 박자는 ID
 * (그 뒤 명령어는 IF) 가 늘어난 점선 칸이다. 순서 바꿈이면 행 자체가 **위로 자리를
 * 옮긴다.** 값은 둘 중 한 길로 건너간다 — 레지스터 파일을 거치거나(기다림 · 옛 값),
 * 옆길로 곧장(포워딩). 옛 값이면 오른쪽 레지스터 파일에서 **옛 수가 끌려 들어가고**
 * 결과 칸이 틀린 수로 바뀐 채 옳은 값과 나란히 남는다.
 *
 * 메서드 (projector 가 부른다):
 *   showPlan({ order, columns, caption })
 *   place({ index, pos, ifStart, idStart, ex, caption })
 *   lookup({ index, producer, reg, caption })
 *   operand({ index, producer, reg, kind, value, producerEx, producerLoad, readCycle, ex, caption })
 *   write({ index, reg, value, correct, wb, caption })
 *   finish({ wrong, caption })
 *   reset()
 *
 * 세로는 명령어 수 · 레지스터 수로 마운트 때 정해지고 바뀌지 않는다. 가로 박자 칸 수가
 * 늘면 칸 폭이 좁아질 뿐이다.
 */

import { categorical, fonts, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 840;
const LX = 12;
const GX = 176;
const GW = 450;
const PX = 652;
const PW = 176;
const TOP = 30;
const RY0 = 46;
const RH = 42;
const CH = 26;
const MOVE_MS = 420;

type OperandKind = 'wait' | 'forward' | 'stale' | 'fresh';

/** projector 가 부르는 표면. projector 는 이 타입으로 좁혀 쓴다 (C9). */
export type DataHazardStage = {
  showPlan(p: { order: number[]; columns: number; caption: string }): void;
  place(p: { index: number; pos: number; ifStart: number; idStart: number; ex: number; caption: string }): void;
  lookup(p: { index: number; producer: number; reg: number; caption: string }): void;
  operand(p: {
    index: number;
    producer: number;
    reg: number;
    kind: OperandKind;
    value: number;
    producerEx: number;
    producerLoad: boolean;
    readCycle: number;
    ex: number;
    caption: string;
  }): void;
  write(p: { index: number; reg: number; value: number; correct: number; wb: number; caption: string }): void;
  finish(p: { wrong: number[]; caption: string }): void;
  reset(): void;
};

type StripState = { y: number; ifs: number; ids: number; ex: number };

type Strip = {
  g: SVGGElement;
  cells: SVGRectElement[];
  labels: SVGTextElement[];
  ifHold: SVGRectElement;
  idHold: SVGRectElement;
  now: StripState;
  target: StripState;
  pos: number;
  /** 이번 판에서 이미 자리를 잡았는가. */
  placed: boolean;
};

type RegRow = { bg: SVGRectElement; value: SVGTextElement; note: SVGTextElement };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

type Instr = { text: string; dst: number };

function readInstructions(data: Record<string, unknown> | undefined): Instr[] {
  const raw = data?.instructions;
  if (!Array.isArray(raw)) return [];
  const out: Instr[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    const text = (r as { text?: unknown }).text;
    const dst = (r as { dst?: unknown }).dst;
    out.push({ text: typeof text === 'string' ? text : '', dst: typeof dst === 'number' ? dst : -1 });
  }
  return out;
}

function readNumbers(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? x : 0)) : [];
}

export const dataHazardStageView: CanvasView = {
  canvas: { width: W, height: 336, fit: 'fill' },
  mount(container, params): ViewInstance {
    const svg = params.canvas;
    const tr = params.t ?? makeTranslator(params.locale);
    const pal = getColors(params.theme);
    const stageFill = categorical(5, 'pastel');
    const isInstant = params.isInstant ?? (() => false);
    void container;

    const instrs = readInstructions(params.initialData);
    const initRegs = readNumbers(params.initialData?.registers);
    const regCount = Math.max(0, initRegs.length - 1); // r0 은 그리지 않는다
    const n = instrs.length;
    let columns = n + 4;

    const RRH = regCount > 0 ? Math.min(21, (RH * Math.max(n, 5)) / regCount) : 21;
    const rowsBottom = RY0 + RH * Math.max(n, 5);
    const legendY = rowsBottom + 22;
    const captionY = legendY + 26;

    let destroyed = false;
    const frames = new Map<string, number>();
    const tokens = new Set<SVGGElement>();

    params.onScrubStart?.(() => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
      for (const s of strips) {
        s.now = { ...s.target };
        drawStrip(s);
      }
      for (const t of tokens) t.remove();
      tokens.clear();
    });

    /** 같은 key 의 앞 애니메이션을 끊고 새로 건다. 되짚는 중이면 끝 상태로 건너뛴다. */
    function animate(key: string, ms: number, draw: (t: number) => void, done?: () => void): void {
      const prev = frames.get(key);
      if (prev !== undefined) cancelAnimationFrame(prev);
      frames.delete(key);
      if (destroyed || isInstant() || typeof requestAnimationFrame !== 'function') {
        draw(1);
        done?.();
        return;
      }
      const start = performance.now();
      const tick = (): void => {
        if (destroyed) return;
        const t = Math.min(1, (performance.now() - start) / ms);
        draw(ease(t));
        if (t < 1) frames.set(key, requestAnimationFrame(tick));
        else {
          frames.delete(key);
          done?.();
        }
      };
      frames.set(key, requestAnimationFrame(tick));
    }

    // ── 층
    const gridLayer = el('g', {}, svg);
    const stripLayer = el('g', {}, svg);
    const pathLayer = el('g', {}, svg);
    const tokenLayer = el('g', {}, svg);
    const textLayer = el('g', {}, svg);

    const cw = (): number => GW / columns;
    const cx = (c: number): number => GX + (c - 1) * cw();
    const rowTop = (pos: number): number => RY0 + pos * RH + (RH - CH) / 2;
    const rowMid = (pos: number): number => rowTop(pos) + CH / 2;
    const regMid = (reg: number): number => RY0 + (reg - 1) * RRH + RRH / 2;

    // ── 박자 머리줄과 세로 격자 (칸 수가 바뀌면 다시 그린다)
    function drawGrid(): void {
      while (gridLayer.firstChild) gridLayer.removeChild(gridLayer.firstChild);
      const head = el('text', { x: LX, y: TOP, 'font-family': fonts.body, 'font-size': 11, fill: pal.textMuted }, gridLayer);
      head.textContent = tr('label.cycle', 'cycle');
      for (let c = 1; c <= columns; c += 1) {
        const x = cx(c);
        el('rect', { x, y: RY0 - 4, width: cw(), height: rowsBottom - RY0 + 4, fill: c % 2 === 0 ? pal.bgSubtle : pal.bg }, gridLayer);
        const t = el('text', { x: x + cw() / 2, y: TOP, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': 10, fill: pal.textMuted }, gridLayer);
        t.textContent = String(c);
      }
    }

    // ── 명령어 띠
    const stageNames = [
      tr('stage.if', 'IF'),
      tr('stage.id', 'ID'),
      tr('stage.ex', 'EX'),
      tr('stage.mem', 'MEM'),
      tr('stage.wb', 'WB'),
    ];

    const strips: Strip[] = instrs.map((ins, i) => {
      const g = el('g', {}, stripLayer);
      const label = el('text', { x: LX, y: CH / 2 + 4, 'font-family': fonts.mono, 'font-size': 12, fill: pal.text }, g);
      const tag = el('tspan', { 'font-weight': 700 }, label);
      tag.textContent = `${tr('label.instr', 'I{n}', { n: i + 1 })} `;
      const body = el('tspan', {}, label);
      body.textContent = ins.text;
      const ifHold = el('rect', { y: 1, height: CH - 2, rx: 3, fill: 'none', stroke: pal.itemComparing, 'stroke-dasharray': '3 2' }, g);
      const idHold = el('rect', { y: 1, height: CH - 2, rx: 3, fill: 'none', stroke: pal.itemComparing, 'stroke-dasharray': '3 2' }, g);
      const cells: SVGRectElement[] = [];
      const labels: SVGTextElement[] = [];
      for (let k = 0; k < 5; k += 1) {
        cells.push(el('rect', { y: 1, height: CH - 2, rx: 3, fill: stageFill[k]!, stroke: pal.border }, g));
        const t = el('text', { y: CH / 2 + 4, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': 10, fill: pal.stateInk }, g);
        t.textContent = stageNames[k]!;
        labels.push(t);
      }
      const start: StripState = { y: rowTop(i), ifs: i + 1, ids: i + 2, ex: i + 3 };
      return { g, cells, labels, ifHold, idHold, now: { ...start }, target: { ...start }, pos: i, placed: false };
    });

    function drawStrip(s: Strip): void {
      const w = cw();
      const { y, ifs, ids, ex } = s.now;
      s.g.setAttribute('transform', `translate(0 ${y.toFixed(2)})`);
      const starts = [ifs, ids, ex, ex + 1, ex + 2];
      for (let k = 0; k < 5; k += 1) {
        const x = cx(starts[k]!);
        s.cells[k]!.setAttribute('x', (x + 1).toFixed(2));
        s.cells[k]!.setAttribute('width', Math.max(0, w - 2).toFixed(2));
        s.labels[k]!.setAttribute('x', (x + w / 2).toFixed(2));
      }
      const holdIf = ids - ifs - 1;
      s.ifHold.setAttribute('x', (cx(ifs + 1) + 1).toFixed(2));
      s.ifHold.setAttribute('width', Math.max(0, holdIf * w - 2).toFixed(2));
      s.ifHold.setAttribute('display', holdIf > 0.05 ? 'inline' : 'none');
      const holdId = ex - ids - 1;
      s.idHold.setAttribute('x', (cx(ids + 1) + 1).toFixed(2));
      s.idHold.setAttribute('width', Math.max(0, holdId * w - 2).toFixed(2));
      s.idHold.setAttribute('display', holdId > 0.05 ? 'inline' : 'none');
    }

    function moveStrip(s: Strip, to: StripState): void {
      const from = { ...s.now };
      s.target = { ...to };
      animate(`strip${strips.indexOf(s)}`, MOVE_MS, (t) => {
        s.now = {
          y: from.y + (to.y - from.y) * t,
          ifs: from.ifs + (to.ifs - from.ifs) * t,
          ids: from.ids + (to.ids - from.ids) * t,
          ex: from.ex + (to.ex - from.ex) * t,
        };
        drawStrip(s);
      });
    }

    function setActive(index: number | null): void {
      strips.forEach((s, i) => {
        s.g.setAttribute('opacity', index === null || i === index || s.placed ? '1' : '0.4');
        for (const c of s.cells) c.setAttribute('stroke', i === index ? pal.accent : pal.border);
        for (const c of s.cells) c.setAttribute('stroke-width', i === index ? '2' : '1');
      });
    }

    // ── 레지스터 파일
    const regTitle = el('text', { x: PX, y: TOP, 'font-family': fonts.body, 'font-size': 11, fill: pal.textMuted }, textLayer);
    regTitle.textContent = tr('label.regfile', 'register file');
    const regGroup = el('g', {}, svg);
    el('rect', { x: PX - 6, y: RY0 - 4, width: PW + 4, height: regCount * RRH + 8, rx: 6, fill: 'none', stroke: pal.border }, regGroup);
    const regRows: RegRow[] = [];
    for (let r = 1; r <= regCount; r += 1) {
      const y = RY0 + (r - 1) * RRH;
      const bg = el('rect', { x: PX - 2, y: y + 1, width: PW - 4, height: RRH - 2, rx: 3, fill: pal.bg, stroke: 'none' }, regGroup);
      const name = el('text', { x: PX + 4, y: y + RRH / 2 + 4, 'font-family': fonts.mono, 'font-size': 11, fill: pal.textMuted }, regGroup);
      // 레지스터 이름은 어셈블리 표식(자료)이라 번역하지 않는다 — 명령어 글의 `r1` 과 같은 글자다.
      name.textContent = `r${r}`;
      const value = el('text', { x: PX + 70, y: y + RRH / 2 + 4, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': 12, fill: pal.text }, regGroup);
      const note = el('text', { x: PX + 80, y: y + RRH / 2 + 4, 'font-family': fonts.body, 'font-size': 10, fill: pal.textMuted }, regGroup);
      regRows.push({ bg, value, note });
    }
    const memRaw = params.initialData?.memory;
    if (Array.isArray(memRaw) && memRaw.length > 0) {
      const m = memRaw[0] as { address?: unknown; value?: unknown };
      const mem = el('text', { x: PX + PW - 4, y: TOP, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': 11, fill: pal.textMuted }, textLayer);
      mem.textContent = tr('label.memory', 'mem[{address}] = {value}', {
        address: typeof m.address === 'number' ? m.address : 0,
        value: typeof m.value === 'number' ? m.value : 0,
      });
    }

    function resetRegs(): void {
      for (let r = 1; r <= regCount; r += 1) {
        const row = regRows[r - 1]!;
        row.value.textContent = String(initRegs[r] ?? 0);
        row.value.setAttribute('fill', pal.text);
        row.value.setAttribute('text-decoration', 'none');
        row.note.textContent = '';
        row.note.setAttribute('fill', pal.textMuted);
        row.bg.setAttribute('fill', pal.bg);
        row.bg.setAttribute('fill-opacity', '1');
        row.bg.setAttribute('stroke', 'none');
      }
    }

    function flashReg(reg: number, color: string): void {
      const row = regRows[reg - 1];
      if (!row) return;
      row.bg.setAttribute('fill', color);
      row.bg.setAttribute('fill-opacity', '0.25');
    }

    // ── 범례와 캡션
    const legend = el('g', {}, textLayer);
    const legendItems: [string, string, string][] = [
      [tr('legend.forward', 'side path (forwarding)'), pal.itemActive, ''],
      [tr('legend.regfile', 'through the register file'), pal.textMuted, '4 3'],
      [tr('legend.stale', 'old value read'), pal.danger, ''],
      [tr('legend.stall', 'stall'), pal.itemComparing, '3 2'],
    ];
    let lx = LX;
    for (const [text, color, dash] of legendItems) {
      el('line', { x1: lx, y1: legendY - 4, x2: lx + 22, y2: legendY - 4, stroke: color, 'stroke-width': 2, 'stroke-dasharray': dash }, legend);
      const t = el('text', { x: lx + 28, y: legendY, 'font-family': fonts.body, 'font-size': 11, fill: pal.textMuted }, legend);
      t.textContent = text;
      lx += 38 + text.length * 6;
    }
    const caption = el('text', { x: LX, y: captionY, 'font-family': fonts.body, 'font-size': 12.5, fill: pal.text }, textLayer);
    const CAPTION_W = W - 2 * LX;

    /** 글자 폭 어림 — 넓은 글자(한글 · 가나 · 한자)는 1em, 나머지는 0.56em. */
    const glyphW = (ch: string): number => (/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 12.5 : 7);

    /** 두 줄까지 접는다. 띄어쓰기가 없는 글은 글자 단위로 끊는다. */
    function setCaption(text: string): void {
      while (caption.firstChild) caption.removeChild(caption.firstChild);
      const parts = text.includes(' ') ? text.split(/(?<= )/) : Array.from(text);
      const lines: string[] = [''];
      let width = 0;
      for (const part of parts) {
        const pw = Array.from(part).reduce((acc, ch) => acc + glyphW(ch), 0);
        if (width + pw > CAPTION_W && lines[lines.length - 1]!.length > 0 && lines.length < 2) {
          lines.push('');
          width = 0;
        }
        lines[lines.length - 1] += part;
        width += pw;
      }
      lines.forEach((line, k) => {
        const span = el('tspan', { x: LX, dy: k === 0 ? 0 : 18 }, caption);
        span.textContent = line.trimEnd();
      });
    }

    // ── 값이 건너가는 길
    type Pt = { x: number; y: number };
    function curve(a: Pt, b: Pt, bend: number): { d: string; at: (t: number) => Pt } {
      const c1 = { x: a.x + bend, y: a.y };
      const c2 = { x: b.x - bend, y: b.y };
      const at = (t: number): Pt => {
        const u = 1 - t;
        return {
          x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
        };
      };
      return { d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`, at };
    }

    let tokenSeq = 0;
    function sendToken(path: { at: (t: number) => Pt }, text: string, color: string, done?: () => void): void {
      const g = el('g', {}, tokenLayer);
      el('circle', { r: 11, fill: color, stroke: pal.bg, 'stroke-width': 1.5 }, g);
      const t = el('text', { y: 4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': 10, 'font-weight': 700, fill: pal.textInverse }, g);
      t.textContent = text;
      tokens.add(g);
      animate(`token${tokenSeq++}`, MOVE_MS + 80, (k) => {
        const p = path.at(k);
        g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      }, () => {
        g.remove();
        tokens.delete(g);
        done?.();
      });
    }

    function drawPath(d: string, color: string, dash: string): void {
      el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-dasharray': dash, 'stroke-linecap': 'round' }, pathLayer);
    }

    function clearPaths(): void {
      while (pathLayer.firstChild) pathLayer.removeChild(pathLayer.firstChild);
      for (const t of tokens) t.remove();
      tokens.clear();
    }

    // ── 처음 상태
    function initial(): void {
      columns = n + 4;
      drawGrid();
      strips.forEach((s, i) => {
        s.pos = i;
        s.placed = false;
        s.now = { y: rowTop(i), ifs: i + 1, ids: i + 2, ex: i + 3 };
        s.target = { ...s.now };
        drawStrip(s);
      });
      setActive(null);
      clearPaths();
      resetRegs();
      setCaption('');
    }

    initial();

    const regEdge = PX - 6;

    const surface: DataHazardStage & ViewInstance = {
      showPlan(p: { order: number[]; columns: number; caption: string }): void {
        if (p.columns > columns) {
          columns = p.columns;
          drawGrid();
          for (const s of strips) drawStrip(s);
        }
        clearPaths();
        resetRegs();
        p.order.forEach((index, pos) => {
          const s = strips[index];
          if (!s) return;
          s.pos = pos;
          s.placed = false;
          // 행만 새 자리로 옮긴다 — 가로 자리는 앞 판의 것을 들고 있다가 place 에서 옮긴다.
          moveStrip(s, { ...s.target, y: rowTop(pos) });
        });
        setActive(-1);
        setCaption(p.caption);
      },

      place(p: { index: number; pos: number; ifStart: number; idStart: number; ex: number; caption: string }): void {
        const s = strips[p.index];
        if (!s) return;
        s.placed = true;
        moveStrip(s, { y: rowTop(p.pos), ifs: p.ifStart, ids: p.idStart, ex: p.ex });
        setActive(p.index);
        setCaption(p.caption);
      },

      lookup(p: { index: number; producer: number; reg: number; caption: string }): void {
        const prod = strips[p.producer];
        setActive(p.index);
        // 찾은 생산자의 띠와 그 레지스터 칸을 밝힌다.
        if (prod) {
          for (const c of prod.cells) {
            c.setAttribute('stroke', pal.itemActive);
            c.setAttribute('stroke-width', '2');
          }
        }
        flashReg(p.reg, pal.accent);
        setCaption(p.caption);
      },

      operand(p: {
        index: number;
        producer: number;
        reg: number;
        kind: OperandKind;
        value: number;
        producerEx: number;
        producerLoad: boolean;
        readCycle: number;
        ex: number;
        caption: string;
      }): void {
        const s = strips[p.index];
        const prod = strips[p.producer];
        if (!s || !prod) return;
        const w = cw();
        // 이 원천까지 본 자리로 띠를 민다 — 멈춘 박자만큼 ID 가 늘어난다.
        moveStrip(s, { ...s.target, ex: p.ex });
        if (p.kind === 'forward') {
          const readyEnd = p.producerEx + (p.producerLoad ? 2 : 1);
          const a = { x: cx(readyEnd), y: rowMid(prod.pos) };
          const b = { x: cx(p.ex) + 2, y: rowMid(s.pos) };
          const c = curve(a, b, Math.max(18, w));
          drawPath(c.d, pal.itemActive, '');
          sendToken(c, String(p.value), pal.itemActive);
        } else {
          const a = { x: regEdge, y: regMid(p.reg) };
          const b = { x: cx(p.readCycle) + w / 2, y: rowMid(s.pos) };
          const c = curve(a, b, -60);
          const color = p.kind === 'stale' ? pal.danger : pal.textMuted;
          drawPath(c.d, color, p.kind === 'stale' ? '' : '4 3');
          flashReg(p.reg, color);
          const row = regRows[p.reg - 1];
          if (row && p.kind === 'stale') {
            row.note.textContent = tr('label.old', 'old');
            row.note.setAttribute('fill', pal.danger);
          }
          sendToken(c, String(p.value), color);
        }
        setActive(p.index);
        setCaption(p.caption);
      },

      write(p: { index: number; reg: number; value: number; correct: number; wb: number; caption: string }): void {
        const s = strips[p.index];
        if (!s) return;
        const w = cw();
        const a = { x: cx(p.wb) + w / 2, y: rowMid(s.pos) };
        const b = { x: regEdge, y: regMid(p.reg) };
        const c = curve(a, b, 40);
        const wrong = p.value !== p.correct;
        const row = regRows[p.reg - 1];
        setActive(p.index);
        setCaption(p.caption);
        sendToken(c, String(p.value), wrong ? pal.danger : pal.primary, () => {
          if (!row) return;
          row.value.textContent = String(p.value);
          row.value.setAttribute('fill', wrong ? pal.danger : pal.text);
          row.value.setAttribute('text-decoration', wrong ? 'line-through' : 'none');
          row.note.textContent = wrong ? tr('label.should', 'should be {correct}', { correct: p.correct }) : '';
          row.note.setAttribute('fill', wrong ? pal.danger : pal.textMuted);
          row.bg.setAttribute('fill', wrong ? pal.danger : pal.accent);
          row.bg.setAttribute('fill-opacity', '0.18');
          row.bg.setAttribute('stroke', wrong ? pal.danger : 'none');
        });
      },

      finish(p: { wrong: number[]; caption: string }): void {
        setActive(null);
        for (const reg of p.wrong) {
          const row = regRows[reg - 1];
          if (!row) continue;
          row.bg.setAttribute('stroke', pal.danger);
          row.bg.setAttribute('stroke-width', '1.5');
        }
        setCaption(p.caption);
      },

      reset(): void {
        for (const id of frames.values()) cancelAnimationFrame(id);
        frames.clear();
        initial();
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames.values()) cancelAnimationFrame(id);
        frames.clear();
        for (const node of [gridLayer, stripLayer, pathLayer, tokenLayer, textLayer, regGroup]) node.remove();
      },
    };
    return surface;
  },
};
