/**
 * ssa-form 무대 — 블록 넷(또는 셋)짜리 세 주소 코드가 SSA 로 바뀌는 자리.
 *
 * 운동
 * - 판 매김: 줄 글자가 판 붙은 글자로 갈린다 (옛 글자는 위로 빠지고 새 글자가 아래에서 올라온다)
 * - 파이 판정: 두 앞선 블록 끝의 판이 **간선을 타고** 만나는 블록 머리로 흘러든다. 다르면 머리에 파이 줄이
 *   솟아오르고 몸 줄이 한 칸 밀려 내려간다(라벨은 첫 파이 줄로 옮겨 붙는다). 같으면 둘이 하나로 겹쳐 몸으로 지나간다
 * - 갈래가 바뀌면: 블록 틀이 새 자리 · 새 높이로 옮겨 가고, else 블록이 빠지거나 들어온다. 파이 줄은 가라앉는다
 * - 돌림: 점 하나가 길의 간선을 따라 내려가고, 파이의 고르는 틀이 들어온 쪽 인자로 넘어간다 (a 만 바뀐 회차는
 *   앞 회차의 틀 자리를 점선으로 남겨 두었다가 그 자리에서 옮겨 간다). 돌려준 값이 return 줄에서 값 칸으로 옮겨 간다
 *
 * 무대는 셈하지 않는다 — 줄 글자 · 판 · 파이 · 길 · 고른 인자 · 값은 모두 projector 가 넘긴다.
 */
import type { CanvasView, Palette, Translate, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { SsaPart, SsaRow } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const WIDTH = 720;
const HEIGHT = 500;
const BOX_W = 236;
const HEAD = 22;
const ROW = 20;
const PAD = 6;
const CODE_PX = parseFloat(fontSizes.sm);
const CHAR_W = CODE_PX * 0.6;
const LABEL_X = 10;
const CODE_X = LABEL_X + CHAR_W * 4;
const TOP_Y = 64;
const MID_Y = 232;
const JOIN_Y = 360;
const X_CENTER = (WIDTH - BOX_W) / 2;
const X_LEFT = 40;
const X_RIGHT = WIDTH - 40 - BOX_W;
const RESULT = { x: X_CENTER + BOX_W + 26, y: JOIN_Y + 40, w: 150, h: 58 };
const CHIP = { x: X_LEFT, y: TOP_Y, w: 120, h: 28 };
/** 걸음 안 운동 상한 (재생 속도 1 에서) */
const MOTION_MS = 480;

export type SsaStageBlock = { name: string; rows: SsaRow[] };
export type SsaStagePick = { rowKey: string; arg: number };

export type SsaStage = {
  setSpeed(speed: number): void;
  setCaption(text: string, mode: 'compile' | 'run'): void;
  showProgram(blocks: SsaStageBlock[], edges: { from: number; to: number }[], join: number, chip: string): void;
  renameBlock(block: number, rows: SsaRow[]): void;
  judgePhi(
    block: number,
    from: { block: number; text: string }[],
    same: boolean,
    result: string,
    rows: SsaRow[],
  ): void;
  keepCompiled(chip: string): void;
  runPath(path: number[], edges: { from: number; to: number }[]): void;
  pick(block: number, from: number, picks: SsaStagePick[], value: number): void;
  reset(): void;
};

type Geo = { x: number; y: number; h: number };

type RowEl = {
  g: SVGGElement;
  bg: SVGRectElement | null;
  label: SVGTextElement;
  code: SVGTextElement;
  y: number;
  sig: string;
  labelText: string;
  parts: SsaPart[];
};

type BlockEl = {
  role: string;
  g: SVGGElement;
  rect: SVGRectElement;
  tag: SVGTextElement;
  rows: Map<string, RowEl>;
  order: string[];
  cur: Geo;
  target: Geo;
  leaving: boolean;
};

type EdgeEl = { from: number; to: number; line: SVGLineElement; head: SVGPolygonElement; lit: boolean };

type MarkerEl = { rect: SVGRectElement; rowKey: string; x: number; w: number; ghost: boolean };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function preserve(node: SVGTextElement): void {
  node.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  node.style.whiteSpace = 'pre';
}

function lerp(p: number, q: number, k: number): number {
  return p + (q - p) * k;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

/** 문안 폭 어림 — 한글 · 한자 · 가나는 한 글자 폭, 그 밖은 반 남짓 */
function textWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    w += code >= 0x1100 && code <= 0xffdc && !(code >= 0x2000 && code <= 0x2bff) ? px : px * 0.56;
  }
  return w;
}

function wrap(text: string, px: number, maxW: number): string[] {
  if (textWidth(text, px) <= maxW) return [text];
  const words = text.split(' ');
  let first = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = first === '' ? words[i] : `${first} ${words[i]}`;
    if (textWidth(next, px) > maxW && first !== '') break;
    first = next;
  }
  return [first, words.slice(i).join(' ')];
}

export const ssaFormStageView: CanvasView = {
  canvas: { width: WIDTH, height: HEIGHT },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    let speed = 1;
    /** 되짚는 중에는 운동 없이 끝 자리로 — 러너가 켜고 끈다 */
    const isInstant = params.isInstant ?? (() => false);
    const dur = (share = 1): number => (MOTION_MS * share) / Math.max(0.25, speed);

    // ───────────────────────── 운동 도구 — 모든 걸음은 앞 걸음의 운동을 끝낸 자리에서 시작한다
    type Anim = { raf: number; frame: (k: number) => void; done: (() => void) | null };
    const anims = new Map<string, Anim>();
    let uid = 0;
    const finish = (key: string): void => {
      const a = anims.get(key);
      if (a === undefined) return;
      anims.delete(key);
      cancelAnimationFrame(a.raf);
      a.frame(1);
      if (a.done !== null) a.done();
    };
    const animate = (key: string, ms: number, frame: (k: number) => void, done: (() => void) | null = null): void => {
      finish(key);
      if (ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        frame(1);
        if (done !== null) done();
        return;
      }
      const start = performance.now();
      const a: Anim = { raf: 0, frame, done };
      const tick = (now: number): void => {
        const k = Math.min(1, (now - start) / ms);
        if (k >= 1) {
          finish(key);
          return;
        }
        frame(ease(k));
        a.raf = requestAnimationFrame(tick);
      };
      a.raf = requestAnimationFrame(tick);
      anims.set(key, a);
    };
    const settleAll = (): void => {
      for (let guard = 0; guard < 12 && anims.size > 0; guard++) for (const key of [...anims.keys()]) finish(key);
    };

    // 되짚기가 시작되면 걸어 둔 운동을 모두 끝 자리로 거둔다
    params.onScrubStart?.(() => settleAll());

    // ───────────────────────── 층
    const root = el('g');
    const captionLayer = el('g');
    const edgeLayer = el('g');
    const blockLayer = el('g');
    const tokenLayer = el('g');
    svg.appendChild(root);
    root.append(captionLayer, edgeLayer, blockLayer, tokenLayer);

    const modeRect = el('rect', { x: 0, y: 6, rx: 4, height: 22, fill: c.bgSubtle, stroke: c.border });
    const modeText = el('text', {
      x: 8,
      y: 21,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    const captionTexts = [0, 1].map((i) =>
      el('text', { x: 0, y: 20 + i * 18, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text }),
    );
    captionLayer.append(modeRect, modeText, ...captionTexts);

    // 인자 칩 — `a = 8`
    const chipG = el('g', { transform: `translate(${CHIP.x} ${CHIP.y})` });
    const chipRect = el('rect', { width: CHIP.w, height: CHIP.h, rx: 14, fill: c.bg, stroke: c.border });
    const chipClip = el('g');
    chipG.append(chipRect, chipClip);
    chipG.setAttribute('display', 'none');
    let chipText: SVGTextElement | null = null;
    let chipValue = '';
    blockLayer.appendChild(chipG);

    // 돌려준 값 칸
    const resultG = el('g', { transform: `translate(${RESULT.x} ${RESULT.y})` });
    const resultRect = el('rect', { width: RESULT.w, height: RESULT.h, rx: 6, fill: c.bg, stroke: c.border, 'stroke-dasharray': '4 3' });
    const resultLabel = el('text', { x: 10, y: 18, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
    resultLabel.textContent = t('label.result', 'Returned value');
    resultG.append(resultRect, resultLabel);
    blockLayer.appendChild(resultG);
    let valueText: SVGTextElement | null = null;

    const blocks: BlockEl[] = [];
    let roleOf: string[] = [];
    let joinIndex = -1;
    let edges: EdgeEl[] = [];
    const markers = new Map<string, MarkerEl>();
    let activeBlocks = new Set<number>();

    const blockAt = (b: number): BlockEl => {
      const role = roleOf[b];
      const found = blocks.find((x) => x.role === role && !x.leaving);
      if (found === undefined) throw new Error(`ssa-form-stage: 블록 ${b} 가 무대에 없다`);
      return found;
    };

    // ───────────────────────── 글자
    const fillCode = (node: SVGTextElement, parts: SsaPart[]): void => {
      while (node.firstChild !== null) node.removeChild(node.firstChild);
      for (const p of parts) {
        const span = el('tspan');
        span.textContent = p.text;
        if (p.ver === true) {
          span.setAttribute('fill', c.itemActive);
          span.setAttribute('font-weight', '700');
        }
        node.appendChild(span);
      }
    };
    const codeText = (parts: SsaPart[]): SVGTextElement => {
      const node = el('text', { x: CODE_X, y: 14, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text });
      preserve(node);
      fillCode(node, parts);
      return node;
    };
    const labelNode = (text: string): SVGTextElement => {
      const node = el('text', { x: LABEL_X, y: 14, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted });
      preserve(node);
      node.textContent = text === '' ? '' : `${text}:`;
      return node;
    };
    const sigOf = (parts: SsaPart[]): string => parts.map((p) => `${p.ver === true ? '^' : ''}${p.text}`).join('|');

    /** 글자를 갈아 끼우되 옛 글자는 위로 빠지고 새 글자는 아래에서 올라온다 */
    const slideSwap = (row: RowEl, which: 'code' | 'label', fresh: SVGTextElement, ms: number): void => {
      const old = which === 'code' ? row.code : row.label;
      row.g.appendChild(fresh);
      if (which === 'code') row.code = fresh;
      else row.label = fresh;
      const key = `swap:${uid++}`;
      animate(
        key,
        ms,
        (k) => {
          old.setAttribute('transform', `translate(0 ${-8 * k})`);
          old.setAttribute('opacity', String(1 - k));
          fresh.setAttribute('transform', `translate(0 ${10 * (1 - k)})`);
          fresh.setAttribute('opacity', String(k));
        },
        () => {
          old.remove();
          fresh.removeAttribute('transform');
          fresh.removeAttribute('opacity');
        },
      );
    };

    const makeRow = (row: SsaRow, isPhi: boolean): RowEl => {
      const g = el('g');
      let bg: SVGRectElement | null = null;
      if (isPhi) {
        bg = el('rect', { x: 4, y: 1, width: BOX_W - 8, height: ROW - 2, rx: 3, fill: c.accent, 'fill-opacity': 0.28 });
        g.appendChild(bg);
      }
      const label = labelNode(row.label ?? '');
      const code = codeText(row.parts);
      g.append(label, code);
      return { g, bg, label, code, y: 0, sig: sigOf(row.parts), labelText: row.label ?? '', parts: row.parts };
    };

    const placeRow = (row: RowEl, y: number): void => {
      row.y = y;
      row.g.setAttribute('transform', `translate(0 ${y})`);
    };

    /** 블록의 줄을 새 목록으로 — 파이 줄은 key, 명령 줄은 블록 안 차례로 알아본다 */
    const setRows = (be: BlockEl, rows: SsaRow[], ms: number): void => {
      let insOrdinal = 0;
      const keyed = rows.map((row) => {
        const isPhi = row.key.startsWith('phi:');
        const key = isPhi ? row.key : `ins#${insOrdinal++}`;
        return { key, isPhi, row };
      });
      const keep = new Set(keyed.map((k) => k.key));
      for (const [key, rowEl] of [...be.rows.entries()]) {
        if (keep.has(key)) continue;
        be.rows.delete(key);
        const from = rowEl.y;
        const m = markers.get(key);
        if (m !== undefined) {
          m.rect.remove();
          markers.delete(key);
        }
        // 가라앉는다
        animate(
          `sink:${uid++}`,
          ms,
          (k) => {
            rowEl.g.setAttribute('transform', `translate(0 ${from + ROW * 0.8 * k})`);
            rowEl.g.setAttribute('opacity', String(1 - k));
          },
          () => rowEl.g.remove(),
        );
      }
      keyed.forEach(({ key, isPhi, row }, r) => {
        const y = HEAD + r * ROW;
        const existing = be.rows.get(key);
        if (existing === undefined) {
          const fresh = makeRow(row, isPhi);
          be.g.appendChild(fresh.g);
          be.rows.set(key, fresh);
          // 파이 줄은 머리 위에서 솟아오르듯, 명령 줄은 아래에서 올라온다
          const startY = isPhi ? y - ROW * 0.9 : y + ROW * 0.6;
          placeRow(fresh, startY);
          fresh.g.setAttribute('opacity', '0');
          animate(
            `rise:${uid++}`,
            ms,
            (k) => {
              placeRow(fresh, lerp(startY, y, k));
              fresh.g.setAttribute('opacity', String(k));
            },
            () => fresh.g.removeAttribute('opacity'),
          );
          return;
        }
        const from = existing.y;
        if (from !== y) animate(`move:${key}:${be.role}`, ms, (k) => placeRow(existing, lerp(from, y, k)));
        const sig = sigOf(row.parts);
        if (sig !== existing.sig) {
          existing.sig = sig;
          existing.parts = row.parts;
          slideSwap(existing, 'code', codeText(row.parts), ms);
        }
        const lab = row.label ?? '';
        if (lab !== existing.labelText) {
          existing.labelText = lab;
          slideSwap(existing, 'label', labelNode(lab), ms);
        }
      });
      be.order = keyed.map((k) => k.key);
      be.target = { ...be.target, h: HEAD + rows.length * ROW + PAD };
    };

    // ───────────────────────── 틀과 간선
    const applyGeo = (be: BlockEl): void => {
      be.g.setAttribute('transform', `translate(${be.cur.x} ${be.cur.y})`);
      be.rect.setAttribute('height', String(be.cur.h));
    };

    const edgeEnds = (e: EdgeEl): { sx: number; sy: number; ex: number; ey: number } => {
      const s = blockAt(e.from).cur;
      const d = blockAt(e.to).cur;
      const scx = s.x + BOX_W / 2;
      const dcx = d.x + BOX_W / 2;
      const off = (dx: number): number => (dx > 1 ? 56 : dx < -1 ? -56 : 64);
      return { sx: scx + off(dcx - scx), sy: s.y + s.h, ex: dcx + off(scx - dcx === 0 ? 0 : scx - dcx), ey: d.y };
    };

    const drawEdges = (): void => {
      for (const e of edges) {
        const { sx, sy, ex, ey } = edgeEnds(e);
        e.line.setAttribute('x1', String(sx));
        e.line.setAttribute('y1', String(sy));
        e.line.setAttribute('x2', String(ex));
        e.line.setAttribute('y2', String(ey - 6));
        const ang = Math.atan2(ey - sy, ex - sx);
        const p = (r: number, a: number): string => `${ex - r * Math.cos(ang + a)},${ey - r * Math.sin(ang + a)}`;
        e.head.setAttribute('points', `${ex},${ey} ${p(8, 0.42)} ${p(8, -0.42)}`);
        const col = e.lit ? c.itemActive : c.textMuted;
        e.line.setAttribute('stroke', col);
        e.line.setAttribute('stroke-width', e.lit ? '2.6' : '1.3');
        e.head.setAttribute('fill', col);
      }
    };

    const relayout = (ms: number): void => {
      const starts = blocks.map((be) => ({ ...be.cur }));
      animate(
        'layout',
        ms,
        (k) => {
          blocks.forEach((be, i) => {
            be.cur = {
              x: lerp(starts[i].x, be.target.x, k),
              y: lerp(starts[i].y, be.target.y, k),
              h: lerp(starts[i].h, be.target.h, k),
            };
            applyGeo(be);
          });
          drawEdges();
        },
        () => {
          for (const be of blocks.filter((x) => x.leaving)) be.g.remove();
          for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].leaving) blocks.splice(i, 1);
        },
      );
    };

    const setActive = (set: Set<number>): void => {
      activeBlocks = set;
      blocks.forEach((be) => {
        const idx = roleOf.indexOf(be.role);
        const on = !be.leaving && idx >= 0 && activeBlocks.has(idx);
        be.rect.setAttribute('stroke', on ? c.itemActive : c.border);
        be.rect.setAttribute('stroke-width', on ? '2' : '1');
      });
    };

    // ───────────────────────── 결론 걷기
    const clearTokens = (): void => {
      while (tokenLayer.firstChild !== null) tokenLayer.removeChild(tokenLayer.firstChild);
    };
    const clearValue = (): void => {
      if (valueText !== null) valueText.remove();
      valueText = null;
      resultRect.setAttribute('stroke-dasharray', '4 3');
      resultRect.setAttribute('stroke', c.border);
    };
    const unlightEdges = (): void => {
      for (const e of edges) e.lit = false;
      drawEdges();
    };

    const setChip = (text: string, ms: number): void => {
      if (text === chipValue) return;
      chipValue = text;
      chipG.removeAttribute('display');
      const fresh = el('text', {
        x: CHIP.w / 2,
        y: 19,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      preserve(fresh);
      fresh.textContent = text;
      const old = chipText;
      chipClip.appendChild(fresh);
      chipText = fresh;
      animate(
        'chip',
        ms,
        (k) => {
          if (old !== null) {
            old.setAttribute('transform', `translate(0 ${-8 * k})`);
            old.setAttribute('opacity', String(1 - k));
          }
          fresh.setAttribute('transform', `translate(0 ${10 * (1 - k)})`);
          fresh.setAttribute('opacity', String(k));
        },
        () => {
          if (old !== null) old.remove();
          fresh.removeAttribute('transform');
          fresh.removeAttribute('opacity');
        },
      );
    };

    const token = (text: string, x: number, y: number): SVGGElement => {
      const g = el('g', { transform: `translate(${x} ${y})` });
      const w = text.length * CHAR_W + 12;
      g.appendChild(el('rect', { x: -w / 2, y: -10, width: w, height: 20, rx: 10, fill: c.bg, stroke: c.itemComparing, 'stroke-width': 1.6 }));
      const tx = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      preserve(tx);
      tx.textContent = text;
      g.appendChild(tx);
      tokenLayer.appendChild(g);
      return g;
    };

    const rowOrigin = (be: BlockEl, key: string): { x: number; y: number } => {
      const r = be.rows.get(key);
      if (r === undefined) throw new Error(`ssa-form-stage: 줄 ${key} 이 없다`);
      return { x: be.target.x, y: be.target.y + r.y };
    };

    /** 인자 자리 — 브라우저에서는 그 인자 tspan 을 직접 재고, 잴 수 없으면 고정폭 어림 */
    const argSpan = (row: RowEl, arg: number): { x: number; w: number } => {
      const idx = row.parts.findIndex((p) => p.arg === arg);
      if (idx < 0) throw new Error(`ssa-form-stage: 파이 줄에 인자 자리 ${arg} 가 없다`);
      const span = row.code.childNodes[idx];
      const measurable = span as unknown as Partial<SVGGraphicsElement> | undefined;
      if (span !== undefined && span.isConnected && measurable !== undefined && typeof measurable.getBBox === 'function') {
        const box = measurable.getBBox();
        if (box.width > 0) return { x: box.x - 4, w: box.width + 8 };
      }
      let chars = 0;
      for (let i = 0; i < idx; i++) chars += row.parts[i].text.length;
      return { x: CODE_X + chars * CHAR_W - 4, w: row.parts[idx].text.length * CHAR_W + 10 };
    };

    const api: SsaStage = {
      setSpeed(s: number): void {
        speed = s;
      },

      setCaption(text: string, mode: 'compile' | 'run'): void {
        const modeLabel = mode === 'compile' ? t('label.compile', 'Compile') : t('label.run', 'Run');
        modeText.textContent = modeLabel;
        const mw = textWidth(modeLabel, parseFloat(fontSizes.xs)) + 16;
        modeRect.setAttribute('width', String(mw));
        modeRect.setAttribute('stroke', mode === 'run' ? c.itemActive : c.border);
        const px = parseFloat(fontSizes.md);
        const lines = wrap(text, px, WIDTH - mw - 14);
        captionTexts.forEach((node, i) => {
          node.setAttribute('x', String(mw + 10));
          node.textContent = lines[i] ?? '';
        });
      },

      showProgram(list, edgeList, join, chip): void {
        settleAll();
        const ms = dur();
        clearTokens();
        clearValue();
        for (const m of markers.values()) m.rect.remove();
        markers.clear();
        joinIndex = join;
        let mid = 0;
        roleOf = list.map((_, b) => (b === 0 ? 'entry' : b === join ? 'join' : `mid${mid++}`));
        const targetOf = (role: string, rows: number): Geo => {
          const h = HEAD + rows * ROW + PAD;
          if (role === 'entry') return { x: X_CENTER, y: TOP_Y, h };
          if (role === 'join') return { x: X_CENTER, y: JOIN_Y, h };
          const x = role === 'mid0' ? X_LEFT : X_RIGHT;
          return { x, y: MID_Y, h };
        };
        // 빠지는 블록은 아래로 가라앉으며 사라진다
        for (const be of blocks) {
          if (roleOf.includes(be.role)) continue;
          be.leaving = true;
          be.target = { x: be.cur.x, y: be.cur.y + 30, h: be.cur.h };
          const g = be.g;
          animate(`leave:${be.role}`, ms, (k) => g.setAttribute('opacity', String(1 - k)));
        }
        list.forEach((blk, b) => {
          const role = roleOf[b];
          let be = blocks.find((x) => x.role === role && !x.leaving);
          const target = targetOf(role, blk.rows.length);
          if (be === undefined) {
            const g = el('g');
            const rect = el('rect', { width: BOX_W, height: target.h, rx: 6, fill: c.bgSubtle, stroke: c.border });
            const tag = el('text', { x: BOX_W - 10, y: 15, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });
            g.append(rect, tag);
            blockLayer.appendChild(g);
            const start: Geo = { x: target.x, y: target.y - 24, h: HEAD + PAD };
            be = { role, g, rect, tag, rows: new Map(), order: [], cur: start, target, leaving: false };
            blocks.push(be);
            applyGeo(be);
            const born = g;
            born.setAttribute('opacity', '0');
            animate(`born:${role}`, ms, (k) => born.setAttribute('opacity', String(k)), () => born.removeAttribute('opacity'));
          }
          be.tag.textContent = blk.name;
          be.target = { ...target };
          setRows(be, blk.rows, ms);
        });
        for (const e of edges) {
          e.line.remove();
          e.head.remove();
        }
        edges = edgeList.map((e) => {
          const line = el('line', { 'stroke-linecap': 'round' });
          const head = el('polygon');
          edgeLayer.append(line, head);
          return { from: e.from, to: e.to, line, head, lit: false };
        });
        setActive(new Set());
        setChip(chip, ms);
        relayout(ms);
      },

      renameBlock(block, rows): void {
        settleAll();
        const ms = dur();
        clearTokens();
        const be = blockAt(block);
        setRows(be, rows, ms);
        setActive(new Set([block]));
        relayout(ms);
      },

      judgePhi(block, from, same, result, rows): void {
        settleAll();
        const ms = dur();
        clearTokens();
        setActive(new Set([block, ...from.map((f) => f.block)]));
        const be = blockAt(block);
        const head = { x: be.target.x + BOX_W / 2, y: be.target.y - 2 };
        const flights = from.map((f) => {
          const edge = edges.find((e) => e.from === f.block && e.to === block);
          if (edge === undefined) throw new Error(`ssa-form-stage: ${f.block} → ${block} 간선이 없다`);
          const { sx, sy, ex, ey } = edgeEnds(edge);
          return { g: token(f.text, sx, sy), sx, sy, ex, ey };
        });
        // (1) 두 끝 판이 간선을 타고 머리로 흘러든다
        animate(
          'phi-flow',
          ms * 0.55,
          (k) => {
            for (const f of flights) f.g.setAttribute('transform', `translate(${lerp(f.sx, f.ex, k)} ${lerp(f.sy, f.ey - 12, k)})`);
          },
          () => {
            // (2) 머리에서 하나로 모인다
            const meet = { x: head.x, y: head.y - 12 };
            const starts = flights.map((f) => ({ x: f.ex, y: f.ey - 12 }));
            animate(
              'phi-meet',
              ms * 0.25,
              (k) => {
                flights.forEach((f, i) => {
                  f.g.setAttribute('transform', `translate(${lerp(starts[i].x, meet.x, k)} ${lerp(starts[i].y, meet.y, k)})`);
                });
              },
              () => {
                clearTokens();
                if (same) {
                  // 같다 — 하나가 되어 몸으로 지나간다
                  const one = token(result, meet.x, meet.y);
                  animate(
                    'phi-pass',
                    ms * 0.45,
                    (k) => {
                      one.setAttribute('transform', `translate(${meet.x} ${lerp(meet.y, head.y + HEAD + ROW * 1.5, k)})`);
                      one.setAttribute('opacity', String(1 - k * 0.85));
                    },
                    () => one.remove(),
                  );
                } else {
                  // 다르다 — 머리에 파이 줄이 솟는다
                  setRows(be, rows, ms * 0.45);
                  relayout(ms * 0.45);
                }
              },
            );
          },
        );
      },

      keepCompiled(chip): void {
        settleAll();
        const ms = dur();
        clearTokens();
        clearValue();
        unlightEdges();
        setActive(new Set());
        // 고른 틀은 자리만 점선으로 남긴다
        for (const m of markers.values()) {
          m.ghost = true;
          m.rect.setAttribute('fill', 'none');
          m.rect.setAttribute('stroke', c.textMuted);
          m.rect.setAttribute('stroke-dasharray', '3 3');
        }
        setChip(chip, ms);
      },

      runPath(path, walked): void {
        settleAll();
        const ms = dur();
        clearTokens();
        unlightEdges();
        setActive(new Set([path[0]]));
        const legs = walked.map((w) => {
          const e = edges.find((x) => x.from === w.from && x.to === w.to);
          if (e === undefined) throw new Error(`ssa-form-stage: 길의 간선 ${w.from} → ${w.to} 이 없다`);
          return e;
        });
        const dot = el('circle', { r: 6, fill: c.itemActive });
        tokenLayer.appendChild(dot);
        const n = Math.max(1, legs.length);
        const lit = new Set<number>([path[0]]);
        animate(
          'path',
          ms,
          (k) => {
            const pos = k * n;
            const leg = Math.min(n - 1, Math.floor(pos));
            const e = legs[leg];
            if (e === undefined) return;
            const { sx, sy, ex, ey } = edgeEnds(e);
            const f = pos - leg;
            dot.setAttribute('cx', String(lerp(sx, ex, Math.min(1, f))));
            dot.setAttribute('cy', String(lerp(sy, ey, Math.min(1, f))));
            for (let i = 0; i < legs.length; i++) {
              if (i < pos && !legs[i].lit) {
                legs[i].lit = true;
                lit.add(legs[i].to);
              }
            }
            drawEdges();
            setActive(new Set(lit));
          },
          () => {
            for (const e of legs) e.lit = true;
            drawEdges();
            setActive(new Set(path));
          },
        );
      },

      pick(block, from, picks, value): void {
        settleAll();
        const ms = dur();
        const be = blockAt(block);
        const incoming = edges.find((e) => e.from === from && e.to === block);
        if (incoming === undefined) throw new Error(`ssa-form-stage: ${from} → ${block} 간선이 없다`);
        const entry = edgeEnds(incoming);
        for (const p of picks) {
          const row = be.rows.get(p.rowKey);
          if (row === undefined) throw new Error(`ssa-form-stage: 파이 줄 ${p.rowKey} 이 없다`);
          const span = argSpan(row, p.arg);
          let m = markers.get(p.rowKey);
          let startX: number;
          let startW: number;
          let startY: number;
          if (m === undefined) {
            const rect = el('rect', { y: 1, height: ROW - 2, rx: 4 });
            row.g.insertBefore(rect, row.label);
            m = { rect, rowKey: p.rowKey, x: span.x, w: span.w, ghost: false };
            markers.set(p.rowKey, m);
            // 들어온 간선 끝에서 인자 자리로 옮겨 간다
            startX = entry.ex - be.target.x - span.w / 2;
            startW = span.w;
            startY = -row.y - 12;
          } else {
            startX = m.x;
            startW = m.w;
            startY = 1;
          }
          const mk = m;
          mk.ghost = false;
          mk.rect.setAttribute('fill', c.itemActive);
          mk.rect.setAttribute('fill-opacity', '0.22');
          mk.rect.setAttribute('stroke', c.itemActive);
          mk.rect.setAttribute('stroke-width', '1.8');
          mk.rect.removeAttribute('stroke-dasharray');
          animate(`pick:${p.rowKey}`, ms * 0.6, (k) => {
            mk.x = lerp(startX, span.x, k);
            mk.w = lerp(startW, span.w, k);
            mk.rect.setAttribute('x', String(mk.x));
            mk.rect.setAttribute('width', String(mk.w));
            mk.rect.setAttribute('y', String(lerp(startY, 1, k)));
          });
        }
        // 값이 return 줄에서 값 칸으로
        const lastKey = be.order[be.order.length - 1];
        if (lastKey === undefined) throw new Error('ssa-form-stage: 만나는 블록에 줄이 없다');
        const src = rowOrigin(be, lastKey);
        clearValue();
        const vt = el('text', {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': '700',
          fill: c.text,
        });
        vt.textContent = String(value);
        tokenLayer.appendChild(vt);
        valueText = vt;
        resultRect.removeAttribute('stroke-dasharray');
        resultRect.setAttribute('stroke', c.text);
        const sx = src.x + BOX_W / 2;
        const sy = src.y + 14;
        const ex = RESULT.x + RESULT.w / 2;
        const ey = RESULT.y + 44;
        animate(`value`, ms, (k) => {
          vt.setAttribute('x', String(lerp(sx, ex, k)));
          vt.setAttribute('y', String(lerp(sy, ey, k)));
        });
        setActive(new Set([block, from]));
      },

      reset(): void {
        settleAll();
        clearTokens();
        clearValue();
        for (const m of markers.values()) m.rect.remove();
        markers.clear();
        for (const e of edges) {
          e.line.remove();
          e.head.remove();
        }
        edges = [];
        for (const be of blocks) be.g.remove();
        blocks.length = 0;
        roleOf = [];
        joinIndex = -1;
        if (chipText !== null) chipText.remove();
        chipText = null;
        chipValue = '';
        chipG.setAttribute('display', 'none');
        modeText.textContent = '';
        for (const node of captionTexts) node.textContent = '';
      },
    };

    return {
      ...api,
      /** 만나는 블록 번호 — 검사용 */
      joinBlock: (): number => joinIndex,
      destroy(): void {
        for (const a of anims.values()) cancelAnimationFrame(a.raf);
        anims.clear();
        root.remove();
      },
    };
  },
};
