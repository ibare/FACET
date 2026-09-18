/**
 * draft-then-verify 무대.
 *
 * 문장은 레일 위에 놓인다. 작은 모형의 초안은 레일 끝 너머로 미끄러져 나가 점선으로
 * 놓이고(앞서 나간다), 큰 모형 한 번이 위에서 내려와 한 커서로 앞에서부터 훑는다.
 * 붙이는 걸음에서 처음 틀린 자리부터 뒤는 굴러 떨어지고(잘린다), 그 자리로 큰 모형의
 * 토큰이 내려와 앉으며 레일이 늘어난다.
 *
 * 자리는 여기서 셈한다. 초안의 자리는 받았을 때 문장에 앉을 자리와 같다 — 받은 초안은
 * 제자리에서 레일을 얻고, 거절 자리에는 큰 모형의 토큰이 그대로 내려앉는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { DraftThenVerifyScene, SceneRound } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MX = 20;
/** 낱말 폭 = (글자 수 + PAD) 칸, 낱말 사이 GAP 칸 — 칸 하나가 고정폭 글자 하나 */
const PAD = 1.4;
const GAP = 0.6;
/** 칸 폭의 상한 (px) — 실제 폭은 가장 넓게 벌어지는 판에서 역산한다 */
const CW_MAX = 8.4;

const TALLY_Y = 20;
const LEGEND_Y = 40;
const BIG_LABEL_Y = 62;
const BRACKET_Y = 76;
const BIG_Y = 96;
const MARK_Y = 126;
const RAIL_Y = 158;
const RAIL_LINE_Y = 174;
const GAIN_BR_Y = 186;
const GAIN_Y = 202;
const CAP_Y = 234;
const LINE_H = 18;

const DRAFT_MS = 720;
const DROP_MS = 320;
const SCAN_MS = 300;
const COMMIT_MS = 900;
const FALL_PX = 72;

/** 판정 1 — 도형에 새긴 글자: 범례의 색 견본 점이다. */
const SWATCH = '● ';
/** 판정 3 — 기호 표기: 받음 표시. */
const MARK_OK = '✓';
/** 판정 3 — 기호 표기: 거절 표시. */
const MARK_BAD = '✕';
/** 판정 3 — 기호 표기: 모두 받은 판의 덤 표시. */
const MARK_BONUS = '+';

type Geometry = { cw: number; fontPx: number };

type Handles = {
  words: SVGTextElement[];
  rail: SVGLineElement | null;
  gains: Map<number, SVGGElement>;
  chips: { g: SVGGElement; rect: SVGRectElement; stroke: string }[];
  big: SVGGElement | null;
  marks: SVGTextElement[];
  cut: SVGLineElement | null;
  anim: SVGGElement;
};

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return Object.is(n, -0) ? 0 : n;
}

function units(word: string): number {
  return word.length + PAD;
}

/** 낱말 len 개가 놓인 뒤 다음 낱말이 설 자리 (칸 단위, 왼쪽 여백 제외) */
function cursorUnits(ws: readonly string[], len: number): number {
  let u = 0;
  for (let i = 0; i < len && i < ws.length; i += 1) u += units(ws[i] ?? '') + GAP;
  return u;
}

/** 폭을 가장 넓게 쓰는 순간(초안과 덤이 문장 끝 너머에 놓였을 때)에서 칸 폭을 역산한다. */
function geometryOf(scene: DraftThenVerifyScene): Geometry {
  const ws = [...scene.prompt];
  let widest = cursorUnits(ws, ws.length);
  for (const round of scene.rounds) {
    let u = cursorUnits(ws, ws.length);
    for (const d of round.draft) u += units(d) + GAP;
    const bonus = round.verdict.bonus ? round.picks[round.draft.length] : undefined;
    if (bonus !== undefined) u += units(bonus) + GAP;
    widest = Math.max(widest, u - GAP);
    for (const t of round.verdict.tokens) ws.push(t.word);
  }
  widest = Math.max(widest, cursorUnits(ws, ws.length) - GAP);
  const cw = widest > 0 ? Math.min(CW_MAX, (PIECE_CANVAS_W - 2 * MX) / widest) : CW_MAX;
  return { cw, fontPx: Math.min(14, cw / 0.6) };
}

type Slot = { x: number; w: number };

/** 판 하나의 자리 — 초안 i 와 (모두 받았을 때) 덤 자리. 거절 자리는 큰 모형 토큰의 폭을 쓴다. */
function slotsOf(round: SceneRound, startX: number, g: Geometry): { drafts: Slot[]; picks: Slot[] } {
  const drafts: Slot[] = [];
  let x = startX;
  for (const d of round.draft) {
    drafts.push({ x, w: units(d) * g.cw });
    x += (units(d) + GAP) * g.cw;
  }
  const picks: Slot[] = [];
  const shown = Math.min(round.picks.length, round.verdict.accepted + 1);
  for (let i = 0; i < shown; i += 1) {
    const at = i < drafts.length ? drafts[i]!.x : x;
    picks.push({ x: at, w: units(round.picks[i] ?? '') * g.cw });
  }
  return { drafts, picks };
}

function charPx(ch: string, fs: number): number {
  const cp = ch.codePointAt(0) ?? 0;
  return cp >= 0x1100 ? fs * 0.98 : fs * 0.56;
}

/** 캡션을 폭에 맞춰 줄로 나눈다 — 띄어쓰기가 없는 글은 글자 단위로 끊는다. */
function wrap(text: string, maxPx: number, fs: number): string[] {
  const lines: string[] = [];
  let line = '';
  let width = 0;
  const pieces = text.split(/(\s+)/).filter((p) => p.length > 0);
  for (const piece of pieces) {
    const pw = [...piece].reduce((s, ch) => s + charPx(ch, fs), 0);
    if (width + pw <= maxPx) {
      line += piece;
      width += pw;
      continue;
    }
    if (/^\s+$/.test(piece)) {
      if (line.trim()) lines.push(line.trim());
      line = '';
      width = 0;
      continue;
    }
    if (pw <= maxPx) {
      if (line.trim()) lines.push(line.trim());
      line = piece;
      width = pw;
      continue;
    }
    for (const ch of piece) {
      const cwid = charPx(ch, fs);
      if (width + cwid > maxPx && line.trim()) {
        lines.push(line.trim());
        line = '';
        width = 0;
      }
      line += ch;
      width += cwid;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

function mountStage(
  _container: HTMLElement,
  params: ViewMountParams & { canvas: SVGSVGElement },
): ViewInstance & SceneRenderer<DraftThenVerifyScene> {
  const svg = params.canvas;
  const c: Palette = getColors(params.theme);
  const t: Translate = params.t ?? makeTranslator(params.locale);

  let destroyed = false;
  let gen = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const waiters = new Set<() => void>();

  function el<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number>,
    parent: Element,
    text?: string,
  ): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
    }
    if (text !== undefined) node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function wordText(parent: Element, word: string, slot: Slot, y: number, fill: string, g: Geometry) {
    return el(
      'text',
      {
        x: slot.x + slot.w / 2,
        y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': `${r1(g.fontPx)}px`,
        fill,
      },
      parent,
      word,
    );
  }

  function captionLines(scene: DraftThenVerifyScene): string[] {
    const round = scene.rounds[scene.current];
    const out: string[] = [];
    if (round) {
      const v = round.verdict;
      const count = round.draft.length;
      if (scene.phase === 'drafted') {
        out.push(
          t('caption.draft', 'Round {round}: the small model drafts {count} tokens past the end of the sentence.', {
            round: scene.current + 1,
            count,
          }),
        );
      } else if (scene.phase === 'verified') {
        out.push(
          v.bonus
            ? t('caption.all', 'One large-model call checks all {count} at once. All {accepted} match, and the same call yields the next token.', {
                count,
                accepted: v.accepted,
              })
            : t('caption.reject', 'One large-model call checks all {count} at once, front to back. Matches: {accepted}. Draft {pos} differs, so the check stops there.', {
                count,
                accepted: v.accepted,
                pos: v.accepted + 1,
              }),
        );
      } else if (scene.phase === 'committed') {
        const added = v.tokens.length;
        if (v.bonus) {
          out.push(
            t('caption.commitAll', 'All {accepted} drafts attach, plus the large model’s next token: +{added}.', {
              accepted: v.accepted,
              added,
            }),
          );
        } else if (v.accepted === 0) {
          out.push(
            t('caption.commitNone', 'No draft attaches. The whole draft falls away and the large model’s token takes its place: +{added}.', {
              added,
            }),
          );
        } else {
          out.push(
            t('caption.commitReject', 'The {accepted} matching drafts attach. From draft {pos} on, the rest falls away and the large model’s token takes its place: +{added}.', {
              accepted: v.accepted,
              pos: v.accepted + 1,
              added,
            }),
          );
        }
        if (scene.current === scene.rounds.length - 1) {
          const total = scene.sentence.length - scene.prompt.length;
          out.push(
            t('caption.summary', '{added} tokens from {calls} large-model calls; one token per call would take {added} calls. Drafts accepted: {accepted} of {drafted}.', {
              added: total,
              calls: scene.calls,
              accepted: scene.accepted,
              drafted: scene.drafted,
            }),
          );
        }
      }
    }
    return out;
  }

  function drawStatic(scene: DraftThenVerifyScene): Handles {
    svg.textContent = '';
    const g = geometryOf(scene);
    const root = el('g', {}, svg);
    const ws = scene.sentence.map((w) => w.word);
    const originFill = (o: string) => (o === 'draft' ? c.success : o === 'large' ? c.primary : c.text);

    // 셈과 범례
    el(
      'text',
      { x: MX, y: TALLY_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text },
      root,
      t('label.tally', 'Large-model calls: {calls} · tokens added: {added}', {
        calls: scene.calls,
        added: scene.sentence.length - scene.prompt.length,
      }),
    );
    const legend = el(
      'text',
      { x: MX, y: LEGEND_Y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
      root,
    );
    el('tspan', { fill: c.success }, legend, SWATCH);
    el('tspan', {}, legend, t('legend.draft', 'accepted draft'));
    el('tspan', { fill: c.primary, dx: 14 }, legend, SWATCH);
    el('tspan', {}, legend, t('legend.large', 'large-model token'));

    // 문장과 레일
    const words: SVGTextElement[] = [];
    const wordSlots: Slot[] = scene.sentence.map((w, i) => ({
      x: MX + cursorUnits(ws, i) * g.cw,
      w: units(w.word) * g.cw,
    }));
    let rail: SVGLineElement | null = null;
    const endX = MX + (cursorUnits(ws, ws.length) - GAP) * g.cw;
    if (ws.length > 0) {
      rail = el(
        'line',
        { x1: MX, y1: RAIL_LINE_Y, x2: endX, y2: RAIL_LINE_Y, stroke: c.text, 'stroke-width': 2, 'stroke-linecap': 'round' },
        root,
      );
    }
    scene.sentence.forEach((w, i) => {
      words.push(wordText(root, w.word, wordSlots[i]!, RAIL_Y, originFill(w.origin), g));
    });

    // 판마다 붙은 토큰 묶음 — 큰 모형 한 번에 몇이 늘었는가
    const gains = new Map<number, SVGGElement>();
    scene.rounds.forEach((_round, ri) => {
      const idx = scene.sentence.flatMap((w, i) => (w.round === ri ? [i] : []));
      if (idx.length === 0) return;
      const a = wordSlots[idx[0]!]!;
      const b = wordSlots[idx[idx.length - 1]!]!;
      const x0 = a.x + 2;
      const x1 = b.x + b.w - 2;
      const grp = el('g', {}, root);
      el(
        'path',
        {
          d: `M${r1(x0)} ${GAIN_BR_Y - 5}V${GAIN_BR_Y}H${r1(x1)}V${GAIN_BR_Y - 5}`,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1,
        },
        grp,
      );
      el(
        'text',
        {
          x: (x0 + x1) / 2,
          y: GAIN_Y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        grp,
        t('label.gain', '+{n}', { n: idx.length }),
      );
      gains.set(ri, grp);
    });

    // 지금 판의 초안과 판정
    const chips: Handles['chips'] = [];
    const marks: SVGTextElement[] = [];
    let big: SVGGElement | null = null;
    let cut: SVGLineElement | null = null;
    const round = scene.rounds[scene.current];
    if (round && (scene.phase === 'drafted' || scene.phase === 'verified')) {
      const v = round.verdict;
      const startX = MX + cursorUnits(ws, ws.length) * g.cw;
      const { drafts, picks } = slotsOf(round, startX, g);
      const judged = scene.phase === 'verified';
      round.draft.forEach((d, i) => {
        const slot = drafts[i]!;
        const status = !judged ? 'pending' : i < v.accepted ? 'ok' : i === v.accepted ? 'bad' : 'unseen';
        const stroke =
          status === 'ok' ? c.success : status === 'bad' ? c.danger : c.textMuted;
        const grp = el('g', status === 'unseen' ? { opacity: 0.4 } : {}, root);
        const rect = el(
          'rect',
          {
            x: slot.x + 1,
            y: RAIL_Y - 14,
            width: slot.w - 2,
            height: 28,
            rx: 6,
            fill: 'none',
            stroke,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          },
          grp,
        );
        wordText(grp, d, slot, RAIL_Y, status === 'ok' ? c.success : c.textMuted, g);
        chips.push({ g: grp, rect, stroke });
      });

      if (judged && picks.length > 0) {
        big = el('g', {}, root);
        const first = picks[0]!;
        const last = picks[picks.length - 1]!;
        el(
          'text',
          { x: first.x, y: BIG_LABEL_Y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.primary },
          big,
          t('label.large', 'large model · one call'),
        );
        el(
          'path',
          {
            d: `M${r1(first.x + 1)} ${BRACKET_Y + 5}V${BRACKET_Y}H${r1(last.x + last.w - 1)}V${BRACKET_Y + 5}`,
            fill: 'none',
            stroke: c.primary,
            'stroke-width': 1.5,
          },
          big,
        );
        picks.forEach((slot, i) => {
          wordText(big!, round.picks[i] ?? '', slot, BIG_Y, c.primary, g);
          const mark = i < v.accepted ? MARK_OK : i === round.draft.length ? MARK_BONUS : MARK_BAD;
          const fill = i < v.accepted ? c.success : i === round.draft.length ? c.primary : c.danger;
          marks.push(
            el(
              'text',
              {
                x: slot.x + slot.w / 2,
                y: MARK_Y,
                'text-anchor': 'middle',
                'dominant-baseline': 'central',
                'font-family': fonts.body,
                'font-size': fontSizes.lg,
                fill,
              },
              root,
              mark,
            ),
          );
        });
        if (!v.bonus) {
          const at = drafts[v.accepted]!;
          const x = at.x - (GAP * g.cw) / 2;
          cut = el(
            'line',
            {
              x1: x,
              y1: MARK_Y - 12,
              x2: x,
              y2: RAIL_LINE_Y + 6,
              stroke: c.danger,
              'stroke-width': 1.5,
              'stroke-dasharray': '3 3',
            },
            root,
          );
        }
      }
    }

    // 캡션
    const fs = parseFloat(fontSizes.sm);
    let y = CAP_Y;
    for (const para of captionLines(scene)) {
      for (const line of wrap(para, PIECE_CANVAS_W - 2 * MX, fs)) {
        el('text', { x: MX, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, root, line);
        y += LINE_H;
      }
    }

    const anim = el('g', {}, svg);
    return { words, rail, gains, chips, big, marks, cut, anim };
  }

  function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        waiters.delete(finish);
        resolve();
      };
      waiters.add(finish);
      const start = Date.now();
      const tick = () => {
        if (destroyed || mine !== gen) {
          finish();
          return;
        }
        const p = ms > 0 ? clamp01((Date.now() - start) / ms) : 1;
        frame(p);
        if (p >= 1) {
          finish();
          return;
        }
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, 16);
        timers.add(id);
      };
      tick();
    });
  }

  function translate(node: Element, dx: number, dy: number, rot = 0, cx = 0, cy = 0): void {
    const base = `translate(${r1(dx)} ${r1(dy)})`;
    node.setAttribute('transform', rot ? `${base} rotate(${r1(rot)} ${r1(cx)} ${r1(cy)})` : base);
  }

  /** 초안이 문장 끝에서 앞으로 미끄러져 나가 제 자리에 놓인다. */
  function playDraft(scene: DraftThenVerifyScene, h: Handles, mine: number): Promise<void> {
    const round = scene.rounds[scene.current];
    if (!round) return Promise.resolve();
    const g = geometryOf(scene);
    const ws = scene.sentence.map((w) => w.word);
    const endX = MX + cursorUnits(ws, ws.length) * g.cw;
    const { drafts } = slotsOf(round, endX, g);
    return tween(DRAFT_MS, mine, (p) => {
      h.chips.forEach((chip, i) => {
        const pi = easeOut(clamp01((p - i * 0.12) / 0.64));
        const back = (drafts[i]!.x - endX) * (1 - pi);
        translate(chip.g, -back, 0);
        chip.g.setAttribute('opacity', String(r1(Math.min(1, pi * 2.5))));
      });
    });
  }

  /** 큰 모형이 한 번 내려오고, 커서 하나가 앞에서부터 초안을 훑는다. */
  function playVerify(scene: DraftThenVerifyScene, h: Handles, mine: number): Promise<void> {
    const round = scene.rounds[scene.current];
    if (!round) return Promise.resolve();
    const g = geometryOf(scene);
    const ws = scene.sentence.map((w) => w.word);
    const { picks } = slotsOf(round, MX + cursorUnits(ws, ws.length) * g.cw, g);
    const k = picks.length;
    if (k === 0) return Promise.resolve();
    const total = DROP_MS + SCAN_MS * k;
    const drop = DROP_MS / total;
    const cursor = el(
      'rect',
      { y: BIG_Y - 15, height: RAIL_Y + 15 - (BIG_Y - 15), rx: 6, fill: 'none', stroke: c.accent, 'stroke-width': 2 },
      h.anim,
    );
    return tween(total, mine, (p) => {
      if (h.big) {
        const e = easeOut(clamp01(p / drop));
        translate(h.big, 0, -18 * (1 - e));
        h.big.setAttribute('opacity', String(r1(e)));
      }
      // s: 커서가 지난 자리 수 (0 … k)
      const s = clamp01((p - drop) / (1 - drop)) * k;
      const at = Math.min(k - 1, Math.floor(s));
      const inSlot = clamp01((s - at) * 2.2);
      const from = picks[Math.max(0, at - 1)]!;
      const to = picks[at]!;
      const q = at === 0 ? 1 : easeInOut(inSlot);
      const x = from.x + (to.x - from.x) * q;
      const w = from.w + (to.w - from.w) * q;
      cursor.setAttribute('x', String(r1(x)));
      cursor.setAttribute('width', String(r1(w)));
      cursor.setAttribute('opacity', p < drop ? '0' : '1');
      h.marks.forEach((m, i) => {
        m.setAttribute('opacity', s >= i + 0.6 ? '1' : '0');
      });
      h.chips.forEach((chip, i) => {
        chip.rect.setAttribute('stroke', s >= i + 0.6 ? chip.stroke : c.textMuted);
      });
      if (h.cut) h.cut.setAttribute('opacity', s >= k - 0.4 ? '1' : '0');
    });
  }

  /** 거절 자리부터 뒤는 굴러 떨어지고, 큰 모형 토큰이 내려와 앉으며 레일이 늘어난다. */
  function playCommit(scene: DraftThenVerifyScene, h: Handles, mine: number, from: number): Promise<void> {
    const round = scene.rounds[scene.current];
    if (!round) return Promise.resolve();
    const g = geometryOf(scene);
    const ws = scene.sentence.map((w) => w.word);
    const { drafts } = slotsOf(round, MX + cursorUnits(ws, from) * g.cw, g);
    const v = round.verdict;
    const oldEnd = MX + (cursorUnits(ws, from) - GAP) * g.cw;
    const newEnd = MX + (cursorUnits(ws, ws.length) - GAP) * g.cw;

    const fallers: { g: SVGGElement; cx: number }[] = [];
    if (!v.bonus) {
      for (let i = v.accepted; i < round.draft.length; i += 1) {
        const slot = drafts[i]!;
        const grp = el('g', {}, h.anim);
        el(
          'rect',
          {
            x: slot.x + 1,
            y: RAIL_Y - 14,
            width: slot.w - 2,
            height: 28,
            rx: 6,
            fill: 'none',
            stroke: i === v.accepted ? c.danger : c.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          },
          grp,
        );
        wordText(grp, round.draft[i] ?? '', slot, RAIL_Y, c.textMuted, g);
        fallers.push({ g: grp, cx: slot.x + slot.w / 2 });
      }
    }
    const gain = h.gains.get(scene.current);
    const lift = RAIL_Y - BIG_Y;

    return tween(COMMIT_MS, mine, (p) => {
      const fall = clamp01(p / 0.55);
      const fe = fall * fall;
      fallers.forEach((f, j) => {
        translate(f.g, 6 * fe * (j + 1), FALL_PX * fe, 18 * fe * (j % 2 === 0 ? 1 : -1), f.cx, RAIL_Y);
        f.g.setAttribute('opacity', String(r1(1 - fall)));
      });
      const down = easeInOut(clamp01((p - 0.35) / 0.65));
      for (let i = from; i < scene.sentence.length; i += 1) {
        if (scene.sentence[i]?.origin === 'large') translate(h.words[i]!, 0, -lift * (1 - down));
      }
      const grow = easeInOut(clamp01((p - 0.2) / 0.8));
      if (h.rail) h.rail.setAttribute('x2', String(r1(from > 0 ? oldEnd + (newEnd - oldEnd) * grow : newEnd)));
      if (gain) gain.setAttribute('opacity', p >= 1 ? '1' : '0');
    });
  }

  const renderer: ViewInstance & SceneRenderer<DraftThenVerifyScene> = {
    async render(next, _prev, opts) {
      if (destroyed) return;
      const mine = (gen += 1);
      const h = drawStatic(next);
      const step = next.step;
      if (!opts.animate || !step) return;
      if (step.kind === 'draft') await playDraft(next, h, mine);
      else if (step.kind === 'verify') await playVerify(next, h, mine);
      else await playCommit(next, h, mine, step.from);
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    },
    destroy() {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    },
  };
  return renderer;
}

export const draftThenVerifyStageView: CanvasView = {
  canvas: { height: H },
  mount: mountStage,
};
