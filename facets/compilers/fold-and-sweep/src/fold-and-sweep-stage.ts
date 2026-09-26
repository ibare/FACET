/**
 * fold-and-sweep 무대 — 한 프로그램이 두 패스를 지나며 고쳐 쓰이는 자리.
 *
 * 운동
 * - 폴딩: 접힌 마디의 자식 토막이 그 마디 자리로 **오그라들어** 수 하나가 되고, 뒤의 토막이 옆으로 당겨진다
 * - 전파: 알려짐 칸의 수가 아래 줄의 이름 자리로 **날아 들어가** 그 이름을 수로 바꾼다
 * - DCE: 쓰임 뱃지가 서고, 지운 줄이 **떨어져 나가며** 아래 줄이 올라와 빈자리를 메운다
 * - 새 판: 떨어졌던 줄이 제자리로 **미끄러져 돌아오고**, 접혔던 수가 다시 식으로 펴진다
 *
 * 무대는 셈하지 않는다 — 줄 · 식 · 쓰임 · 알려짐은 payload 로 받고, 글자 토막은 algorithm 의 찍개(`rowTokens`)로 얻는다.
 * 운동 길이는 projector 가 재생 속도로 나눠 넘긴다. 되짚기(isInstant · onScrubStart) 중에는 운동을 끊는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { rowTokens, type SnapRow, type Token } from './algorithm.js';

const SVG = 'http://www.w3.org/2000/svg';

const W = 620;
const CODE_PX = parseFloat(fontSizes.md);
const CW = CODE_PX * 0.6; // 고정폭 글자 한 칸
const SMALL_PX = parseFloat(fontSizes.sm);
const LABEL_X = 18;
const CODE_X = 52;
const KNOWN_X = 356;
const KNOWN_W = 110;
const USES_X = 494;
const USES_W = 60;
const HEAD_Y = 68;
const ROW0_Y = 96;
const ROW_H = 30;
const FALL = 22; // 지운 줄이 떨어지는 거리
const MAX_ROWS = 7; // 가장 긴 프로그램 — 원래의 일곱 줄. 세로는 처음부터 이 자리를 잡는다
const CAPTION_Y = ROW0_Y + (MAX_ROWS - 1) * ROW_H + 42;

type Active = 'fold' | 'sweep' | null;

/** projector 가 부르는 표면. */
export type FoldAndSweepStage = ViewInstance & {
  reset(): void;
  setPasses(fold: number, sweep: number, active: Active): void;
  round(rows: SnapRow[], ms: number): void;
  foldLine(line: number, rows: SnapRow[], subst: { node: number; from: number }[], known: { name: string; val: number } | null, ms: number): void;
  showUses(uses: { line: number; count: number }[], ms: number): void;
  removeLines(rows: SnapRow[], ms: number): void;
  countOps(rows: SnapRow[], ms: number): void;
  caption(text: string): void;
};

// ─────────────────────────────────────────────── 운동 (rAF)

type Anim = { delay: number; dur: number; apply(k: number): void; start?(): void; end?(): void; started: boolean; done: boolean };

const ease = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

type TokView = { node: SVGTextElement; text: string; cx: number; s: number; o: number; anc: number[] };
type RowView = {
  g: SVGGElement;
  y: number;
  o: number;
  dead: boolean;
  x0: number;
  tokens: Map<string, TokView>;
  known: SVGGElement | null;
  badge: SVGGElement | null;
  marks: SVGGElement | null;
};

export const foldAndSweepStageView: CanvasView = {
  canvas: { width: W, height: CAPTION_Y + 22 },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): FoldAndSweepStage {
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;
    const root = el('g', {}, svg);
    root.setAttribute('font-family', fonts.body);

    // 패스 띠 — 차례는 늘 폴딩 → DCE
    const strip = el('g', {}, root);
    const passFold = el('g', { transform: 'translate(18, 14)' }, strip);
    const passFoldBox = el('rect', { width: 200, height: 28, rx: 14 }, passFold);
    const passFoldText = el('text', { x: 100, y: 14, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': SMALL_PX }, passFold);
    el('text', { x: 236, y: 28, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': CODE_PX, fill: c.textMuted }, strip).textContent = '→';
    const passSweep = el('g', { transform: 'translate(254, 14)' }, strip);
    const passSweepBox = el('rect', { width: 220, height: 28, rx: 14 }, passSweep);
    const passSweepText = el('text', { x: 110, y: 14, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': SMALL_PX }, passSweep);

    // 칸 머리
    const head = { 'font-size': SMALL_PX, fill: c.textMuted, 'dominant-baseline': 'central', 'text-anchor': 'middle' };
    el('text', { ...head, x: KNOWN_X + KNOWN_W / 2, y: HEAD_Y }, root).textContent = t('label.known', 'Known');
    el('text', { ...head, x: USES_X + USES_W / 2, y: HEAD_Y }, root).textContent = t('label.uses', 'Uses');
    el('line', { x1: CODE_X - 4, x2: W - 18, y1: HEAD_Y + 12, y2: HEAD_Y + 12, stroke: c.border }, root);

    const rowLayer = el('g', {}, root);
    const ghostLayer = el('g', {}, root);
    const captionNode = el('text', { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fontSizes.md, fill: c.text }, root);

    const rows = new Map<number, RowView>();

    // ── 운동 엔진
    let anims: Anim[] = [];
    let raf = 0;
    let t0 = 0;
    const settle = (): void => {
      for (const a of anims) {
        if (!a.started) a.start?.();
        a.apply(1);
        a.end?.();
      }
      anims = [];
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      raf = 0;
    };
    const instant = (): boolean => params.isInstant?.() === true;
    params.onScrubStart?.(() => settle());
    const tick = (now: number): void => {
      const e = now - t0;
      for (const a of anims) {
        if (a.done) continue;
        if (e < a.delay) continue;
        if (!a.started) {
          a.started = true;
          a.start?.();
        }
        const k = a.dur <= 0 ? 1 : Math.min(1, (e - a.delay) / a.dur);
        a.apply(ease(k));
        if (k >= 1) {
          a.done = true;
          a.end?.();
        }
      }
      anims = anims.filter((a) => !a.done);
      raf = anims.length > 0 ? requestAnimationFrame(tick) : 0;
    };
    const play = (list: Omit<Anim, 'started' | 'done'>[], ms: number): void => {
      const items = list.map((a) => ({ ...a, started: false, done: false }));
      anims.push(...items);
      if (ms <= 0 || instant() || typeof requestAnimationFrame !== 'function') {
        settle();
        return;
      }
      t0 = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    // ── 그리기 도우미
    const rowY = (rank: number): number => ROW0_Y + rank * ROW_H;
    const placeRow = (r: RowView): void => {
      r.g.setAttribute('transform', `translate(0, ${r.y})`);
      r.g.setAttribute('opacity', String(r.o));
    };
    const placeTok = (tv: TokView): void => {
      tv.node.setAttribute('transform', `translate(${tv.cx}, 0) scale(${tv.s})`);
      tv.node.setAttribute('opacity', String(tv.o));
    };
    const tokCx = (r: RowView, tok: Token): number => r.x0 + (tok.col + tok.text.length / 2) * CW;
    const makeTok = (r: RowView, tok: Token, cx: number, s: number, o: number): TokView => {
      const node = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': CODE_PX, fill: c.text }, r.g);
      node.textContent = tok.text;
      const tv: TokView = { node, text: tok.text, cx, s, o, anc: tok.anc };
      placeTok(tv);
      return tv;
    };
    const ensureRow = (line: number, row: SnapRow): RowView => {
      const have = rows.get(line);
      if (have) return have;
      const g = el('g', {}, rowLayer);
      el('text', { x: LABEL_X, y: 0, 'dominant-baseline': 'central', 'font-size': SMALL_PX, fill: c.textMuted }, g).textContent = `L${line + 1}`;
      const r: RowView = { g, y: rowY(line), o: 1, dead: false, x0: CODE_X + row.indent * 4 * CW, tokens: new Map(), known: null, badge: null, marks: null };
      rows.set(line, r);
      placeRow(r);
      return r;
    };
    const dropExtra = (r: RowView): void => {
      for (const key of ['known', 'badge', 'marks'] as const) {
        r[key]?.remove();
        r[key] = null;
      }
    };

    /**
     * 줄 목록을 새 모습으로 옮긴다. 같은 키의 토막은 자리를 옮기고, 사라지는 토막은 살아남은 가장 가까운 조상 자리로
     * 오그라들고, 새 토막은 앞 모습의 가장 가까운 조상 자리에서 펴진다. 줄은 산 줄 차례로 자리를 잡고, 지운 줄은 떨어진다.
     */
    const morph = (list: SnapRow[], delay: number, dur: number, out: Omit<Anim, 'started' | 'done'>[]): void => {
      let rank = 0;
      list.forEach((row, line) => {
        const r = ensureRow(line, row);
        // 줄 자리
        const fromY = r.y;
        const fromO = r.o;
        let toY: number;
        let toO: number;
        if (row.alive) {
          toY = rowY(rank);
          toO = 1;
          rank += 1;
        } else {
          toY = r.dead ? r.y : r.y + FALL;
          toO = 0;
        }
        r.dead = !row.alive;
        if (fromY !== toY || fromO !== toO) {
          out.push({
            delay,
            dur,
            apply: (k) => {
              r.y = mix(fromY, toY, k);
              r.o = mix(fromO, toO, k);
              placeRow(r);
            },
          });
        }
        if (!row.alive) return;
        // 토막
        const next = rowTokens(row, line);
        const nextKeys = new Map(next.map((tok) => [tok.key, tok] as const));
        const newCx = new Map(next.map((tok) => [tok.key, tokCx(r, tok)] as const));
        const oldCx = new Map([...r.tokens].map(([k, tv]) => [k, tv.cx] as const));
        const ancestorAt = (anc: number[], at: Map<string, number>): number | undefined => {
          for (const id of anc) {
            const x = at.get(`n${id}`);
            if (x !== undefined) return x;
          }
          return undefined;
        };
        // 사라지는 토막 — 새 모습에 살아남은 가장 가까운 조상 자리로 오그라든다
        for (const [key, tv] of r.tokens) {
          if (nextKeys.has(key)) continue;
          const target = ancestorAt(tv.anc, newCx) ?? tv.cx;
          const from = { cx: tv.cx, s: tv.s, o: tv.o };
          r.tokens.delete(key);
          out.push({
            delay,
            dur,
            apply: (k) => {
              tv.cx = mix(from.cx, target, k);
              tv.s = mix(from.s, 0.2, k);
              tv.o = mix(from.o, 0, k);
              placeTok(tv);
            },
            end: () => tv.node.remove(),
          });
        }
        for (const tok of next) {
          const to = newCx.get(tok.key)!;
          const have = r.tokens.get(tok.key);
          if (have) {
            const from = { cx: have.cx, s: have.s, o: have.o };
            const changed = have.text !== tok.text;
            have.anc = tok.anc;
            if (from.cx === to && !changed && from.s === 1 && from.o === 1) continue;
            out.push({
              delay,
              dur,
              start: () => {
                if (changed) {
                  have.text = tok.text;
                  have.node.textContent = tok.text;
                }
              },
              apply: (k) => {
                have.cx = mix(from.cx, to, k);
                // 글자가 바뀐 토막(수로 접힌 마디 · 수가 든 이름)은 작게 시작해 커진다
                have.s = changed ? mix(0.5, 1, k) : mix(from.s, 1, k);
                have.o = mix(from.o, 1, k);
                placeTok(have);
              },
            });
          } else {
            const start = ancestorAt(tok.anc, oldCx) ?? to;
            const tv = makeTok(r, tok, start, 0.2, 0);
            r.tokens.set(tok.key, tv);
            out.push({
              delay,
              dur,
              apply: (k) => {
                tv.cx = mix(start, to, k);
                tv.s = mix(0.2, 1, k);
                tv.o = k;
                placeTok(tv);
              },
            });
          }
        }
      });
    };

    const knownChip = (r: RowView, label: string, fromCx: number): { g: SVGGElement; apply(k: number): void } => {
      const g = el('g', {}, r.g);
      el('rect', { x: KNOWN_X, y: -11, width: KNOWN_W, height: 22, rx: 4, fill: c.accent, stroke: c.accent }, g);
      const tx = el('text', { x: KNOWN_X + KNOWN_W / 2, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': SMALL_PX, fill: c.stateInk }, g);
      tx.textContent = label;
      const dx = fromCx - (KNOWN_X + KNOWN_W / 2);
      const apply = (k: number): void => {
        g.setAttribute('transform', `translate(${mix(dx, 0, k)}, 0)`);
        g.setAttribute('opacity', String(k));
      };
      apply(0);
      return { g, apply };
    };

    const api: FoldAndSweepStage = {
      destroy() {
        settle();
        root.remove();
      },
      reset() {
        settle();
        rowLayer.replaceChildren();
        ghostLayer.replaceChildren();
        rows.clear();
        captionNode.textContent = '';
      },
      setPasses(fold, sweep, active) {
        const foldText = fold === 0 ? t('label.foldOff', 'Folding off') : fold === 1 ? t('label.foldPlain', 'Folding') : t('label.foldProp', 'Propagate + fold');
        const sweepText = sweep === 0 ? t('label.sweepOff', 'Dead-code removal off') : t('label.sweepOn', 'Dead-code removal');
        const paint = (box: SVGRectElement, text: SVGTextElement, on: boolean, now: boolean, label: string): void => {
          text.textContent = label;
          box.setAttribute('fill', now ? c.text : c.bg);
          box.setAttribute('stroke', on ? c.text : c.border);
          box.setAttribute('stroke-dasharray', on ? '' : '4 3');
          text.setAttribute('fill', now ? c.bg : on ? c.text : c.textMuted);
          text.setAttribute('text-decoration', on ? '' : 'line-through');
        };
        paint(passFoldBox, passFoldText, fold > 0, active === 'fold', foldText);
        paint(passSweepBox, passSweepText, sweep > 0, active === 'sweep', sweepText);
      },
      round(list, ms) {
        settle();
        ghostLayer.replaceChildren();
        // 앞 판의 결론(알려짐 · 쓰임 · 연산 표시)은 걸음 0 에서 걷는다. 줄 자리는 남겨 옮겨 간다
        for (const r of rows.values()) dropExtra(r);
        const out: Omit<Anim, 'started' | 'done'>[] = [];
        morph(list, 0, ms, out);
        play(out, ms);
      },
      foldLine(line, list, subst, known, ms) {
        settle();
        const r = rows.get(line);
        if (!r) throw new Error(`fold-and-sweep 무대: L${line + 1} 줄이 없다`);
        const out: Omit<Anim, 'started' | 'done'>[] = [];
        // 전파 — 알려짐 칸의 수가 이름 자리로 날아간다 (앞 절반), 이어 접기 (뒤 절반)
        const flyDur = subst.length > 0 ? ms * 0.5 : 0;
        const nextTok = new Map(rowTokens(list[line]!, line).map((tok) => [tok.key, tok] as const));
        for (const s of subst) {
          const src = rows.get(s.from);
          const dst = r.tokens.get(`n${s.node}`);
          const def = list[s.from]?.stmt;
          if (!src || !dst || def?.k !== 'let' || def.value.k !== 'num') throw new Error(`fold-and-sweep 무대: 전파 자리를 찾지 못했다 (마디 ${s.node})`);
          const ghost = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': CODE_PX, fill: c.text, 'font-weight': 700 }, ghostLayer);
          ghost.textContent = String(def.value.v);
          const from = { x: KNOWN_X + KNOWN_W / 2, y: src.y };
          const to = { x: dst.cx, y: r.y };
          const apply = (k: number): void => {
            ghost.setAttribute('transform', `translate(${mix(from.x, to.x, k)}, ${mix(from.y, to.y, k) - Math.sin(k * Math.PI) * 14})`);
          };
          apply(0);
          out.push({ delay: 0, dur: flyDur, apply, end: () => ghost.remove() });
        }
        const foldDur = ms - flyDur;
        morph(list, flyDur, foldDur, out);
        if (known) {
          const s = list[line]!.stmt;
          if (s.k !== 'let') throw new Error(`fold-and-sweep 무대: L${line + 1} — let 줄이 아니다`);
          const tok = nextTok.get(`n${s.value.id}`);
          if (!tok) throw new Error(`fold-and-sweep 무대: L${line + 1} — 값 토막이 없다`);
          const fromCx = tokCx(r, tok);
          r.known?.remove();
          const chip = knownChip(r, `${known.name} = ${known.val}`, fromCx);
          r.known = chip.g;
          out.push({ delay: flyDur + foldDur * 0.4, dur: foldDur * 0.6, apply: chip.apply });
        }
        play(out, ms);
      },
      showUses(uses, ms) {
        settle();
        const out: Omit<Anim, 'started' | 'done'>[] = [];
        for (const r of rows.values()) {
          r.badge?.remove();
          r.badge = null;
        }
        for (const u of uses) {
          const r = rows.get(u.line);
          if (!r) throw new Error(`fold-and-sweep 무대: L${u.line + 1} 줄이 없다`);
          const g = el('g', {}, r.g);
          const zero = u.count === 0;
          el('rect', { x: USES_X, y: -11, width: USES_W, height: 22, rx: 11, fill: c.bg, stroke: zero ? c.danger : c.text, 'stroke-width': zero ? 2 : 1 }, g);
          const tx = el('text', { x: USES_X + USES_W / 2, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': SMALL_PX, fill: zero ? c.danger : c.text, 'font-weight': zero ? 700 : 400 }, g);
          tx.textContent = String(u.count);
          r.badge = g;
          const apply = (k: number): void => {
            g.setAttribute('transform', `translate(0, ${mix(-10, 0, k)})`);
            g.setAttribute('opacity', String(k));
          };
          apply(0);
          out.push({ delay: 0, dur: ms * 0.6, apply });
        }
        play(out, ms);
      },
      removeLines(list, ms) {
        settle();
        const out: Omit<Anim, 'started' | 'done'>[] = [];
        morph(list, 0, ms, out);
        play(out, ms);
      },
      countOps(list, ms) {
        settle();
        const out: Omit<Anim, 'started' | 'done'>[] = [];
        list.forEach((row, line) => {
          const r = rows.get(line);
          if (!r) throw new Error(`fold-and-sweep 무대: L${line + 1} 줄이 없다`);
          r.marks?.remove();
          r.marks = null;
          if (!row.alive) return;
          const g = el('g', {}, r.g);
          r.marks = g;
          for (const tok of rowTokens(row, line)) {
            if (!tok.op) continue;
            const cx = tokCx(r, tok);
            const bar = el('rect', { x: cx, y: 9, width: 0, height: 3, fill: c.itemActive }, g);
            out.push({
              delay: 0,
              dur: ms,
              apply: (k) => {
                bar.setAttribute('x', String(cx - CW * k));
                bar.setAttribute('width', String(2 * CW * k));
              },
            });
          }
        });
        play(out, ms);
      },
      caption(text) {
        captionNode.textContent = text;
      },
    };
    return api;
  },
};
