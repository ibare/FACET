/**
 * map-filter-reduce 의 무대.
 *
 * 위에서 아래로 marks → filter 문 → kept → map 문 → squares → reduce 문 → 누적. 원소 여섯은 판 내내 **같은
 * 토큰**이다 — 판이 바뀌면 지난 운명(kept · squares · 떨어진 칸 · 누적 속)에서 출발 자리로 돌아오고, 새 문턱에서
 * 다른 운명으로 옮겨 간다. 떠난 자리에는 흐린 자국이 남는다 (filter 는 marks 를, map 은 kept 를 바꾸지 않는다).
 *
 * 문 셋은 가상 표기 한 줄씩이고, 넘기는 함수는 그 줄에 꽂힌 칩이다. 답 막대는 앞 판 길이를 들고 있다가 답
 * 걸음에서 새 길이로 옮겨 간다. 움직임의 길이는 부르는 쪽(projector)이 재생 속도로 셈해 넘긴다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 472;
const LABEL_X = 24;
const SLOT_X0 = 196;
const SLOT_DX = 60;
const TOKEN_W = 46;
const TOKEN_H = 28;
const Y_MARKS_IDX = 20;
const Y_MARKS = 46;
const Y_STAND = 88;
const BAND_X = 16;
const BAND_W = 548;
const BAND_H = 28;
const BAND_TOP = [110, 232, 340] as const;
const Y_KEPT_IDX = 156;
const Y_KEPT = 180;
const Y_SQ_IDX = 278;
const Y_SQ = 302;
const Y_ACC = 404;
const ACC_W = 60;
const BAR_X = 250;
const BAR_W = 440;
const BAR_H = 16;
const TRAY_X0 = 612;
const TRAY_DX = 54;
const TRAY_DY = 36;
const TRAY_COLS = 3;
const Y_CAPTION = 452;
const FOLD_SCALE = 0.35;

const slotX = (i: number): number => SLOT_X0 + i * SLOT_DX;
const bandMid = (k: 0 | 1 | 2): number => BAND_TOP[k] + BAND_H / 2;
const trayPos = (j: number): { x: number; y: number } => ({
  x: TRAY_X0 + (j % TRAY_COLS) * TRAY_DX,
  y: Y_KEPT + Math.floor(j / TRAY_COLS) * TRAY_DY,
});

type Pose = { x: number; y: number; s: number };
type Look = 'mark' | 'standing' | 'dropped' | 'square' | 'lost' | 'revived';

interface Token {
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  pose: Pose;
  /** 진행 중인 움직임을 곧장 끝내는 손잡이 — 새 움직임이 오면 앞 것을 끝 자리로 보낸다 */
  finish: (() => void) | null;
}

interface CodeLine {
  out: string;
  head: string;
  chip: string;
  tail: string;
}

interface CodeSpec {
  source: string;
  lines: [CodeLine | null, CodeLine | null, CodeLine | null];
}

/** projector 가 부르는 무대의 표면 */
export interface MapFilterReduceStage {
  startRound(o: { marks: number[]; threshold: number; start: number; maxResult: number; caption: string; dur: number }): void;
  filterKeep(o: { index: number; slot: number; revived: boolean; caption: string; tag: string; dur: number }): void;
  filterDrop(o: { index: number; dropSlot: number; lost: boolean; caption: string; tag: string; dur: number }): void;
  mapStep(o: { index: number; slot: number; y: number; caption: string; dur: number }): void;
  foldStep(o: { index: number; slot: number; y: number; next: number; caption: string; dur: number }): void;
  answer(o: { sum: number; caption: string; dur: number }): void;
  reset(): void;
  destroy(): void;
}

function readLine(v: unknown): CodeLine | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.out !== 'string' || typeof o.head !== 'string' || typeof o.chip !== 'string' || typeof o.tail !== 'string') return null;
  return { out: o.out, head: o.head, chip: o.chip, tail: o.tail };
}

function readCode(initialData: unknown): CodeSpec {
  const empty: CodeSpec = { source: '', lines: [null, null, null] };
  if (typeof initialData !== 'object' || initialData === null) return empty;
  const code = (initialData as Record<string, unknown>).code;
  if (typeof code !== 'object' || code === null) return empty;
  const c = code as Record<string, unknown>;
  return {
    source: typeof c.source === 'string' ? c.source : '',
    lines: [readLine(c.filter), readLine(c.map), readLine(c.reduce)],
  };
}

function readMarks(initialData: unknown): number[] {
  if (typeof initialData !== 'object' || initialData === null) return [];
  const m = (initialData as Record<string, unknown>).marks;
  if (!Array.isArray(m)) return [];
  return m.filter((x): x is number => typeof x === 'number');
}

const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

export const mapFilterReduceStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const tr = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const codePx = parseFloat(fontSizes.md);
    const charW = codePx * 0.6;
    const code = readCode(params.initialData);

    const frames = new Set<number>();
    const hasRaf = typeof requestAnimationFrame === 'function';

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    };
    const text = (parent: Element, x: number, y: number, s: string, o: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {}): SVGTextElement => {
      const e = el('text', {
        x,
        y,
        'font-family': o.mono === false ? fonts.body : fonts.mono,
        'font-size': o.size ?? fontSizes.sm,
        fill: o.fill ?? c.text,
        'text-anchor': o.anchor ?? 'start',
        'dominant-baseline': 'central',
      }, parent);
      if (o.weight) e.setAttribute('font-weight', o.weight);
      e.textContent = s;
      return e;
    };

    const root = el('g', {}, svg);
    const bg = el('g', {}, root);
    const ghostLayer = el('g', {}, root);
    const tokenLayer = el('g', {}, root);
    const topLayer = el('g', {}, root);

    // ── 줄 이름과 칸 번호
    const rowName = (y: number, s: string): void => {
      text(bg, LABEL_X, y, s, { size: fontSizes.md, fill: c.textMuted });
    };
    rowName(Y_MARKS, code.source);
    rowName(Y_KEPT, code.lines[0]?.out ?? '');
    rowName(Y_SQ, code.lines[1]?.out ?? '');
    rowName(Y_ACC, code.lines[2]?.out ?? '');
    const marks0 = readMarks(params.initialData);
    for (const y of [Y_MARKS_IDX, Y_KEPT_IDX, Y_SQ_IDX]) {
      for (let i = 0; i < marks0.length; i++) text(bg, slotX(i), y, String(i), { size: fontSizes.xs, fill: c.textMuted, anchor: 'middle' });
    }

    // ── 떨어진 칸
    text(bg, TRAY_X0 - TOKEN_W / 2, BAND_TOP[0] + 32, tr('label.dropped', 'Dropped'), { size: fontSizes.sm, fill: c.textMuted, mono: false });
    el('rect', {
      x: TRAY_X0 - TOKEN_W / 2 - 8,
      y: Y_KEPT - TOKEN_H / 2 - 8,
      width: TRAY_DX * (TRAY_COLS - 1) + TOKEN_W + 16,
      height: TRAY_DY + TOKEN_H + 16,
      rx: 8,
      fill: 'none',
      stroke: c.border,
      'stroke-dasharray': '4 4',
    }, bg);

    // ── 문 셋 — 가상 표기 한 줄과 꽂힌 칩
    const bands: SVGRectElement[] = [];
    const chips: { rect: SVGRectElement; label: SVGTextElement; tail: SVGTextElement; line: CodeLine; x: number }[] = [];
    const heads: (SVGTextElement | null)[] = [];
    for (const k of [0, 1, 2] as const) {
      const top = BAND_TOP[k];
      bands.push(el('rect', { x: BAND_X, y: top, width: BAND_W, height: BAND_H, rx: 6, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1.5 }, bg));
      const line = code.lines[k];
      if (!line) {
        heads.push(null);
        continue;
      }
      const head = text(bg, LABEL_X, bandMid(k), line.head.trimEnd(), { size: fontSizes.md, fill: c.text });
      heads.push(head);
      const chipX = LABEL_X + line.head.length * charW - 3;
      const rect = el('rect', { x: chipX, y: top + 3, width: 10, height: BAND_H - 6, rx: 5, fill: c.itemPivot, stroke: c.stateInk, 'stroke-width': 1 }, bg);
      const label = text(bg, chipX + 5, bandMid(k), '', { size: fontSizes.md, fill: c.stateInk });
      const tail = text(bg, chipX, bandMid(k), line.tail, { size: fontSizes.md, fill: c.text });
      chips.push({ rect, label, tail, line, x: chipX });
    }
    const fillLines = (threshold: number, start: number): void => {
      const vars = (s: string): string => s.split('{threshold}').join(String(threshold)).split('{start}').join(String(start));
      let ci = 0;
      for (let k = 0; k < 3; k++) {
        const line = code.lines[k];
        const head = heads[k];
        if (!line || !head) continue;
        const chip = chips[ci++]!;
        const headText = vars(line.head);
        head.textContent = headText.trimEnd();
        const x = LABEL_X + headText.length * charW - 3;
        const chipText = vars(line.chip);
        const w = chipText.length * charW + 10;
        chip.rect.setAttribute('x', String(x));
        chip.rect.setAttribute('width', String(w));
        chip.label.setAttribute('x', String(x + 5));
        chip.label.textContent = chipText;
        chip.tail.setAttribute('x', String(x + w + 3));
      }
    };
    {
      // 첫 그림 — 첫 판이 오기 전에도 문턱 자리가 비지 않게
      const d = typeof params.initialData === 'object' && params.initialData !== null ? (params.initialData as Record<string, unknown>) : {};
      fillLines(typeof d.threshold === 'number' ? d.threshold : 0, typeof d.start === 'number' ? d.start : 0);
    }

    // ── 누적 칸과 답 막대
    // 누적 칸은 토큰 위에 둔다 — 접혀 드는 원소가 칸 속으로 사라진다
    const accRect = el('rect', { x: SLOT_X0 - ACC_W / 2, y: Y_ACC - 16, width: ACC_W, height: 32, rx: 6, fill: c.bg, stroke: c.primary, 'stroke-width': 2 }, topLayer);
    const accText = text(topLayer, SLOT_X0, Y_ACC, '', { size: fontSizes.lg, fill: c.text, anchor: 'middle', weight: '600' });
    el('rect', { x: BAR_X, y: Y_ACC - BAR_H / 2, width: BAR_W, height: BAR_H, rx: 3, fill: c.bgSubtle, stroke: c.border }, bg);
    const bar = el('rect', { x: BAR_X, y: Y_ACC - BAR_H / 2, width: 0, height: BAR_H, rx: 3, fill: c.primary }, bg);
    const barText = text(bg, BAR_X + 6, Y_ACC, '', { size: fontSizes.sm, fill: c.text });
    let barW = 0;
    let barFinish: (() => void) | null = null;
    let maxResult = 1;

    // ── 캡션과 표식
    const caption = text(topLayer, LABEL_X, Y_CAPTION, '', { size: fontSizes.md, fill: c.text, mono: false });
    const tag = text(topLayer, 0, 0, '', { size: fontSizes.xs, fill: c.text, anchor: 'middle', mono: false, weight: '600' });

    // ── 토큰
    const tokens: Token[] = [];
    const place = (tok: Token, p: Pose): void => {
      tok.pose = p;
      tok.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.s.toFixed(3)})`);
    };
    const look = (tok: Token, l: Look): void => {
      const r = tok.rect;
      r.removeAttribute('stroke-dasharray');
      tok.g.removeAttribute('display');
      switch (l) {
        case 'mark':
          r.setAttribute('fill', c.itemDefault);
          r.setAttribute('stroke', c.text);
          r.setAttribute('stroke-width', '1.5');
          tok.label.setAttribute('fill', c.text);
          break;
        case 'standing':
          r.setAttribute('fill', c.itemDefault);
          r.setAttribute('stroke', c.itemComparing);
          r.setAttribute('stroke-width', '3');
          tok.label.setAttribute('fill', c.text);
          break;
        case 'dropped':
          r.setAttribute('fill', c.bgSubtle);
          r.setAttribute('stroke', c.ghostOutline);
          r.setAttribute('stroke-width', '1.5');
          r.setAttribute('stroke-dasharray', '3 3');
          tok.label.setAttribute('fill', c.textMuted);
          break;
        case 'lost':
          r.setAttribute('fill', c.bgSubtle);
          r.setAttribute('stroke', c.danger);
          r.setAttribute('stroke-width', '3');
          tok.label.setAttribute('fill', c.danger);
          break;
        case 'revived':
          r.setAttribute('fill', c.itemDefault);
          r.setAttribute('stroke', c.itemPivot);
          r.setAttribute('stroke-width', '4');
          tok.label.setAttribute('fill', c.text);
          break;
        case 'square':
          r.setAttribute('fill', c.itemSorted);
          r.setAttribute('stroke', c.itemSorted);
          r.setAttribute('stroke-width', '1.5');
          tok.label.setAttribute('fill', c.textInverse);
          break;
      }
    };
    const build = (marks: number[]): void => {
      if (tokens.length === marks.length) return;
      for (const tok of tokens) tok.g.remove();
      tokens.length = 0;
      marks.forEach((m, i) => {
        const g = el('g', {}, tokenLayer);
        const rect = el('rect', { x: -TOKEN_W / 2, y: -TOKEN_H / 2, width: TOKEN_W, height: TOKEN_H, rx: 6 }, g);
        const label = text(g, 0, 0, String(m), { size: fontSizes.md, anchor: 'middle', weight: '600' });
        const tok: Token = { g, rect, label, pose: { x: slotX(i), y: Y_MARKS, s: 1 }, finish: null };
        place(tok, tok.pose);
        look(tok, 'mark');
        tokens.push(tok);
      });
    };
    build(marks0);

    /**
     * 토큰을 점들을 따라 옮긴다. 다리마다 거리만큼 시간을 나눈다. `onLeg(i)` 는 다리 i 가 시작될 때
     * 한 번 (i = 다리 수 는 끝에서). 앞 움직임이 아직이면 그것을 끝 자리로 보내고 시작한다.
     */
    const move = (tok: Token, points: Pose[], dur: number, onLeg?: (i: number) => void): void => {
      tok.finish?.();
      const from = tok.pose;
      const path = [from, ...points];
      const lens = points.map((p, i) => Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y) + Math.abs(p.s - path[i]!.s) * 40 + 1);
      const total = lens.reduce((a, b) => a + b, 0);
      let fired = -1;
      const fire = (upTo: number): void => {
        while (fired < upTo) {
          fired++;
          onLeg?.(fired);
        }
      };
      let frame = 0;
      const end = (): void => {
        if (frame) {
          cancelAnimationFrame(frame);
          frames.delete(frame);
          frame = 0;
        }
        place(tok, points[points.length - 1] ?? from);
        fire(points.length);
        tok.finish = null;
      };
      if (!hasRaf || dur <= 0 || points.length === 0) {
        end();
        return;
      }
      tok.finish = end;
      fire(0);
      const t0 = performance.now();
      const tick = (now: number): void => {
        frames.delete(frame);
        const u = Math.min(1, (now - t0) / dur);
        let d = u * total;
        let leg = 0;
        while (leg < lens.length - 1 && d > lens[leg]!) {
          d -= lens[leg]!;
          leg++;
        }
        fire(leg);
        const a = path[leg]!;
        const b = path[leg + 1]!;
        const k = ease(Math.min(1, d / lens[leg]!));
        place(tok, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, s: a.s + (b.s - a.s) * k });
        if (u >= 1) {
          frame = 0;
          end();
          return;
        }
        frame = requestAnimationFrame(tick);
        frames.add(frame);
      };
      frame = requestAnimationFrame(tick);
      frames.add(frame);
    };

    const setBar = (value: number, dur: number): void => {
      barFinish?.();
      const target = (Math.max(0, value) / Math.max(1, maxResult)) * BAR_W;
      const from = barW;
      const show = (w: number): void => {
        barW = w;
        bar.setAttribute('width', w.toFixed(1));
        barText.setAttribute('x', String(BAR_X + w + 6));
      };
      barText.textContent = String(value);
      if (!hasRaf || dur <= 0) {
        show(target);
        return;
      }
      let frame = 0;
      const end = (): void => {
        if (frame) {
          cancelAnimationFrame(frame);
          frames.delete(frame);
        }
        show(target);
        barFinish = null;
      };
      barFinish = end;
      const t0 = performance.now();
      const tick = (now: number): void => {
        frames.delete(frame);
        const u = Math.min(1, (now - t0) / dur);
        show(from + (target - from) * ease(u));
        if (u >= 1) {
          frame = 0;
          end();
          return;
        }
        frame = requestAnimationFrame(tick);
        frames.add(frame);
      };
      frame = requestAnimationFrame(tick);
      frames.add(frame);
    };

    // ── 자국 — 떠난 자리에 남는 흐린 틀
    const ghost = (x: number, y: number, value: number): void => {
      const g = el('g', { transform: `translate(${x} ${y})` }, ghostLayer);
      el('rect', { x: -TOKEN_W / 2, y: -TOKEN_H / 2, width: TOKEN_W, height: TOKEN_H, rx: 6, fill: 'none', stroke: c.ghostOutline, 'stroke-dasharray': '3 3' }, g);
      text(g, 0, 0, String(value), { size: fontSizes.md, fill: c.textMuted, anchor: 'middle' });
    };

    // ── 한 걸음짜리 강조를 걷는다
    let transient: { tok: Token; after: Look } | null = null;
    const settle = (): void => {
      if (transient) {
        transient.tok.finish?.();
        look(transient.tok, transient.after);
        transient = null;
      }
      tag.textContent = '';
      for (const b of bands) {
        b.setAttribute('stroke', c.border);
      }
    };
    const lightBand = (k: 0 | 1 | 2): void => {
      bands[k]?.setAttribute('stroke', c.itemComparing);
    };
    const showTag = (s: string, x: number, y: number, fill: string): void => {
      tag.textContent = s;
      tag.setAttribute('x', String(x));
      tag.setAttribute('y', String(y));
      tag.setAttribute('fill', fill);
    };

    const valueOf = (i: number): number => marks0[i] ?? 0;
    let marks: number[] = [...marks0];

    const stage: MapFilterReduceStage & ViewInstance = {
      startRound(o) {
        settle();
        marks = [...o.marks];
        build(marks);
        maxResult = Math.max(1, o.maxResult);
        fillLines(o.threshold, o.start);
        ghostLayer.replaceChildren();
        accText.textContent = String(o.start);
        accRect.setAttribute('stroke', c.primary);
        caption.textContent = o.caption;
        tokens.forEach((tok, i) => {
          // 지난 운명에서 출발 자리로 — 누적 속으로 접혔던 것은 그 칸에서 다시 나온다
          if (tok.g.getAttribute('display') === 'none') {
            tok.g.removeAttribute('display');
            place(tok, { x: SLOT_X0, y: Y_ACC, s: FOLD_SCALE });
          }
          tok.label.textContent = String(marks[i] ?? valueOf(i));
          look(tok, 'mark');
          move(tok, [{ x: slotX(i), y: Y_MARKS, s: 1 }], o.dur);
        });
      },
      filterKeep(o) {
        settle();
        const tok = tokens[o.index];
        if (!tok) return;
        caption.textContent = o.caption;
        lightBand(0);
        const x0 = slotX(o.index);
        ghost(x0, Y_MARKS, marks[o.index] ?? 0);
        look(tok, o.revived ? 'revived' : 'standing');
        const to = { x: slotX(o.slot), y: Y_KEPT, s: 1 };
        move(tok, [{ x: x0, y: Y_STAND, s: 1 }, { x: x0, y: bandMid(0), s: 1 }, to], o.dur);
        transient = { tok, after: 'mark' };
        if (o.revived) showTag(o.tag, to.x, Y_KEPT + TOKEN_H / 2 + 10, c.text);
      },
      filterDrop(o) {
        settle();
        const tok = tokens[o.index];
        if (!tok) return;
        caption.textContent = o.caption;
        lightBand(0);
        const x0 = slotX(o.index);
        ghost(x0, Y_MARKS, marks[o.index] ?? 0);
        look(tok, 'standing');
        const to = trayPos(o.dropSlot);
        move(tok, [{ x: x0, y: Y_STAND, s: 1 }, { x: to.x, y: Y_STAND, s: 1 }, { x: to.x, y: to.y, s: 1 }], o.dur, (leg) => {
          if (leg === 1) look(tok, o.lost ? 'lost' : 'dropped');
        });
        transient = { tok, after: 'dropped' };
        if (o.lost) showTag(o.tag, to.x, to.y + TOKEN_H / 2 + 10, c.danger);
      },
      mapStep(o) {
        settle();
        const tok = tokens[o.index];
        if (!tok) return;
        caption.textContent = o.caption;
        lightBand(1);
        const x = slotX(o.slot);
        ghost(x, Y_KEPT, marks[o.index] ?? 0);
        move(tok, [{ x, y: bandMid(1), s: 1 }, { x, y: Y_SQ, s: 1 }], o.dur, (leg) => {
          if (leg === 1) {
            tok.label.textContent = String(o.y);
            look(tok, 'square');
          }
        });
      },
      foldStep(o) {
        settle();
        const tok = tokens[o.index];
        if (!tok) return;
        caption.textContent = o.caption;
        lightBand(2);
        const x = slotX(o.slot);
        ghost(x, Y_SQ, o.y);
        move(tok, [{ x, y: bandMid(2), s: 1 }, { x: SLOT_X0, y: Y_ACC, s: FOLD_SCALE }], o.dur, (leg) => {
          if (leg === 2) {
            tok.g.setAttribute('display', 'none');
            accText.textContent = String(o.next);
          }
        });
      },
      answer(o) {
        settle();
        caption.textContent = o.caption;
        accText.textContent = String(o.sum);
        accRect.setAttribute('stroke', c.itemComparing);
        setBar(o.sum, o.dur);
      },
      reset() {
        settle();
        for (const tok of tokens) tok.finish?.();
        barFinish?.();
        ghostLayer.replaceChildren();
        tokens.forEach((tok, i) => {
          tok.label.textContent = String(marks[i] ?? valueOf(i));
          look(tok, 'mark');
          place(tok, { x: slotX(i), y: Y_MARKS, s: 1 });
        });
        accText.textContent = '';
        accRect.setAttribute('stroke', c.primary);
        barW = 0;
        bar.setAttribute('width', '0');
        barText.textContent = '';
        caption.textContent = '';
      },
      destroy() {
        for (const f of frames) cancelAnimationFrame(f);
        frames.clear();
        root.remove();
      },
    };
    return stage;
  },
};
