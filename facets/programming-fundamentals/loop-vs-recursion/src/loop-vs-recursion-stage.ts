/**
 * loop-vs-recursion stage — 왼쪽 반복 한 틀, 오른쪽 재귀 틀 탑, 바닥에 바깥(두 답 자리).
 *
 * 움직임은 **높이**다. 재귀 쪽 틀은 부른 틀 자리에서 한 층 위로 솟아 쌓이고, 걷힐 때 위로 떠나며 돌려준
 * 값 조각이 한 층 아래 틀의 빈자리 □ 로 내려앉는다. 탑 옆의 최고 표식은 앞 판의 높이에 남아 있다가
 * 새 판의 탑에 밀려 오르거나, 바닥에 닿은 높이로 내려앉는다. 반복 쪽은 틀 하나에 머물고 흐름 점이 몸
 * 칸에서 둥근 길을 따라 조건 칸으로 되돌아 올라간다. 바깥의 답 자리는 앞 판의 답을 두었다가 새 답이
 * 내려앉을 때 갈아 탄다.
 *
 * 층은 아래에서 위로 — 먼저 선 틀이 아래(1층). 화면에 코드 줄은 두지 않는다. 지금 수와 함수 이름표만.
 * 운동의 길이는 projector 가 걸음마다 재생 속도를 읽어 넘긴다.
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

/** projector 가 부르는 표면. */
export type LoopVsRecursionStage = {
  reset(): void;
  startRound(): void;
  loopInit(n: number, acc: number, k: number, ms: number): void;
  loopCheck(k: number, n: number, pass: boolean, count: number, back: boolean, backs: number, ms: number): void;
  loopAdd(square: number, to: number, kNext: number, ms: number): void;
  loopReturn(answer: number, ms: number): void;
  recCheck(level: number, arg: number, base: boolean, count: number, height: number, ms: number): void;
  recCall(level: number, square: number, child: number, height: number, ms: number): void;
  recBase(level: number, height: number, ms: number): void;
  recReturn(level: number, square: number, got: number, result: number, outside: boolean, height: number, ms: number): void;
  settlePeak(height: number, ms: number): void;
  setCaption(text: string): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 548;
const PITCH = 52;
const FH = 46;
const MAX_LEVELS = 7; // 사다리 끝 n = 6 의 탑 높이 n + 1
const GROUND = 64 + PITCH * MAX_LEVELS; // 7 층 탑의 꼭대기가 64 에 닿는다
const LOOP_X = 20;
const LOOP_W = 300;
const REC_X = 360;
const REC_W = 340;
const HOLE_CX = REC_X + 250;
const HOLE_W = 34;
const HOLE_H = 24;
const BAND_Y = GROUND + 12;
const SLOT_Y = BAND_Y + 22;
const SLOT_W = 96;
const SLOT_H = 30;
const LOOP_SLOT_CX = LOOP_X + LOOP_W / 2;
const REC_SLOT_CX = REC_X + REC_W / 2;
const CAPTION_Y = H - 14;
const COND = { x: LOOP_X + 14, w: 128 };
const BODY = { x: LOOP_X + 160, w: 126 };

/** level 층 틀의 윗변 y. */
const levelTop = (level: number): number => GROUND - level * PITCH + (PITCH - FH);

type Frame = {
  g: SVGGElement;
  box: SVGRectElement;
  left: SVGTextElement;
  hole: SVGRectElement;
  holeText: SVGTextElement;
  right: SVGTextElement;
  y: number;
};

type Job = { id: number; finish: () => void };

export const loopVsRecursionStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const svg = params.canvas;
    const sm = parseFloat(fontSizes.sm);

    let destroyed = false;
    const jobs = new Map<string, Job>();
    let chipSeq = 0;

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (parent: Element, x: number, y: number, s: string, opts: { anchor?: string; mono?: boolean; size?: string; fill?: string; weight?: number } = {}): SVGTextElement => {
      const node = el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'font-weight': opts.weight ?? 400,
        fill: opts.fill ?? c.text,
      }, parent);
      node.textContent = s;
      return node;
    };

    /** 진행률 0..1 을 그린다. 같은 key 의 앞 운동은 끝 상태로 마친다. */
    const tween = (key: string, ms: number, draw: (p: number) => void, done?: () => void): void => {
      const prev = jobs.get(key);
      if (prev) {
        cancelAnimationFrame(prev.id);
        jobs.delete(key);
        prev.finish();
      }
      const finish = (): void => {
        draw(1);
        done?.();
      };
      if (destroyed || ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        finish();
        return;
      }
      const start = performance.now();
      const job: Job = { id: 0, finish };
      const frame = (now: number): void => {
        const raw = Math.min(1, (now - start) / ms);
        const p = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        if (raw < 1) {
          draw(p);
          job.id = requestAnimationFrame(frame);
        } else {
          jobs.delete(key);
          finish();
        }
      };
      jobs.set(key, job);
      draw(0);
      job.id = requestAnimationFrame(frame);
    };
    const flush = (): void => {
      const all = [...jobs.values()];
      jobs.clear();
      for (const job of all) {
        cancelAnimationFrame(job.id);
        job.finish();
      }
    };
    params.onScrubStart?.(flush);

    const moveTo = (node: Element, x: number, y: number): void => {
      node.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    };

    // ── 바탕: 두 기둥 머리 · 바닥 · 바깥 띠 · 캡션
    const back = el('g', {}, svg);
    text(back, LOOP_X, 16, t('label.loop', 'Loop'), { weight: 600, fill: c.text });
    text(back, REC_X, 16, t('label.recursion', 'Recursion'), { weight: 600, fill: c.text });
    const loopFramesText = text(back, LOOP_X, 38, '', { fill: c.textMuted });
    const loopChecksText = text(back, LOOP_X + 100, 38, '', { fill: c.textMuted });
    const loopBacksText = text(back, LOOP_X + 200, 38, '', { fill: c.textMuted });
    const recFramesText = text(back, REC_X, 38, '', { fill: c.textMuted });
    const recChecksText = text(back, REC_X + 100, 38, '', { fill: c.textMuted });
    el('line', { x1: LOOP_X, x2: REC_X + REC_W, y1: GROUND, y2: GROUND, stroke: c.border, 'stroke-width': 2 }, back);
    el('rect', { x: LOOP_X, y: BAND_Y, width: REC_X + REC_W - LOOP_X, height: SLOT_H + 34, rx: 6, fill: c.bgSubtle, stroke: c.border }, back);
    text(back, LOOP_X + 10, BAND_Y + 12, t('label.outside', 'Outside'), { size: fontSizes.xs, fill: c.textMuted });
    const slotBox = (cx: number): void => {
      el('rect', { x: cx - SLOT_W / 2, y: SLOT_Y, width: SLOT_W, height: SLOT_H, rx: 4, fill: c.bg, stroke: c.border }, back);
      text(back, cx - SLOT_W / 2 - 8, SLOT_Y + SLOT_H / 2, t('label.answer', 'Answer'), { anchor: 'end', size: fontSizes.xs, fill: c.textMuted });
    };
    slotBox(LOOP_SLOT_CX);
    slotBox(REC_SLOT_CX);
    const caption = text(back, W / 2, CAPTION_Y, '', { anchor: 'middle', fill: c.text });

    // 최고 표식 — 앞 판의 높이에 남는다
    const peakG = el('g', { opacity: 0 }, svg);
    el('line', { x1: REC_X - 6, x2: REC_X + REC_W, y1: 0, y2: 0, stroke: c.accent, 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }, peakG);
    const peakText = text(peakG, REC_X + REC_W, -8, '', { anchor: 'end', size: fontSizes.xs, fill: c.accent, weight: 600 });
    let peakLevel = 0;
    const peakY = (level: number): number => levelTop(level) - 3;

    const layer = el('g', {}, svg);
    const answers = el('g', {}, svg);
    const chips = el('g', {}, svg);

    // ── 답 자리
    const answerText: { loop: SVGTextElement | null; rec: SVGTextElement | null } = { loop: null, rec: null };
    const land = (side: 'loop' | 'rec', value: number, ms: number): void => {
      const cx = side === 'loop' ? LOOP_SLOT_CX : REC_SLOT_CX;
      const old = answerText[side];
      if (old) {
        tween(`old-${side}`, ms * 0.6, (p) => {
          moveTo(old, 0, p * 14);
          old.setAttribute('opacity', String(1 - p));
        }, () => old.remove());
      }
      const node = text(answers, cx, SLOT_Y + SLOT_H / 2, String(value), { anchor: 'middle', mono: true, size: fontSizes.md, weight: 600 });
      answerText[side] = node;
    };
    const dimAnswers = (): void => {
      for (const node of [answerText.loop, answerText.rec]) node?.setAttribute('fill', c.textMuted);
    };

    /** 값 조각이 (x0,y0) 에서 (x1,y1) 로 날아가 내려앉는다. */
    const fly = (value: string, x0: number, y0: number, x1: number, y1: number, ms: number, done: () => void): void => {
      const g = el('g', {}, chips);
      const w = Math.max(26, value.length * sm * 0.62 + 12);
      el('rect', { x: -w / 2, y: -11, width: w, height: 22, rx: 11, fill: c.accent }, g);
      text(g, 0, 0, value, { anchor: 'middle', mono: true, fill: c.textInverse, weight: 600 });
      chipSeq += 1;
      tween(`chip-${chipSeq}`, ms, (p) => {
        const lift = Math.sin(Math.PI * p) * 18;
        moveTo(g, x0 + (x1 - x0) * p, y0 + (y1 - y0) * p - lift);
      }, () => {
        g.remove();
        done();
      });
    };

    // ── 반복 쪽 틀 하나
    let loopG: SVGGElement | null = null;
    let condText: SVGTextElement | null = null;
    let condTag: SVGTextElement | null = null;
    let bodyText: SVGTextElement | null = null;
    let dot: SVGCircleElement | null = null;
    let dotAt: { x: number; y: number } = { x: 0, y: 0 };
    const loopY = levelTop(1);
    const cellY = loopY + 18;
    const cellH = 24;
    // 흐름 점은 칸의 윗변 가운데에 앉는다 — 되돌아 올라가는 길이 두 윗변을 잇는다
    const condPt = { x: COND.x + COND.w / 2, y: cellY };
    const bodyPt = { x: BODY.x + BODY.w / 2, y: cellY };
    const archTop = loopY - 34;

    const placeDot = (x: number, y: number): void => {
      dotAt = { x, y };
      dot?.setAttribute('cx', x.toFixed(1));
      dot?.setAttribute('cy', y.toFixed(1));
    };

    const clearLoop = (): void => {
      loopG?.remove();
      loopG = null;
      condText = null;
      condTag = null;
      bodyText = null;
      dot = null;
    };

    // ── 재귀 쪽 탑
    const frames = new Map<number, Frame>();
    const makeFrame = (level: number, arg: number, fromY: number, ms: number): Frame => {
      const y = levelTop(level);
      const g = el('g', {}, layer);
      const box = el('rect', { x: REC_X, y: 0, width: REC_W, height: FH, rx: 6, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1.5 }, g);
      text(g, REC_X + 12, FH / 2, `sumSquaresRec(${arg})`, { mono: true, fill: c.text });
      const left = text(g, HOLE_CX - HOLE_W / 2 - 6, FH / 2, '', { anchor: 'end', mono: true, fill: c.text });
      const hole = el('rect', { x: HOLE_CX - HOLE_W / 2, y: (FH - HOLE_H) / 2, width: HOLE_W, height: HOLE_H, rx: 4, fill: c.bg, stroke: c.accent, 'stroke-dasharray': '3 3', opacity: 0 }, g);
      const holeText = text(g, HOLE_CX, FH / 2, '', { anchor: 'middle', mono: true, fill: c.text, weight: 600 });
      const right = text(g, HOLE_CX + HOLE_W / 2 + 6, FH / 2, '', { anchor: 'start', mono: true, fill: c.text });
      const frame: Frame = { g, box, left, hole, holeText, right, y };
      frames.set(level, frame);
      tween(`frame-${level}`, ms, (p) => {
        moveTo(g, 0, fromY + (y - fromY) * p);
      });
      return frame;
    };
    const liftOff = (level: number, ms: number): void => {
      const f = frames.get(level);
      if (!f) throw new Error(`loop-vs-recursion-stage: 걷을 ${level} 층 틀이 없다`);
      frames.delete(level);
      tween(`frame-${level}`, ms, (p) => {
        moveTo(f.g, 0, f.y - p * 26);
        f.g.setAttribute('opacity', String(1 - p));
      }, () => f.g.remove());
    };
    const frameAt = (level: number): Frame => {
      const f = frames.get(level);
      if (!f) throw new Error(`loop-vs-recursion-stage: ${level} 층 틀이 없다`);
      return f;
    };
    const activate = (level: number): void => {
      for (const [l, f] of frames) f.box.setAttribute('stroke', l === level ? c.primary : c.border);
    };
    const movePeak = (level: number, ms: number): void => {
      const from = peakLevel;
      peakLevel = level;
      peakText.textContent = t('label.peak', 'Peak: {n}', { n: level });
      peakG.setAttribute('opacity', '1');
      const y0 = from === 0 ? peakY(level) : peakY(from);
      const y1 = peakY(level);
      tween('peak', ms, (p) => moveTo(peakG, 0, y0 + (y1 - y0) * p));
    };

    const setLoopReadouts = (framesNow: number, checks: number, backs: number): void => {
      loopFramesText.textContent = t('label.frames', 'Frames: {n}', { n: framesNow });
      loopChecksText.textContent = t('label.checks', 'Checks: {n}', { n: checks });
      loopBacksText.textContent = t('label.backs', 'Loop-backs: {n}', { n: backs });
    };
    const setRecReadouts = (framesNow: number, checks: number): void => {
      recFramesText.textContent = t('label.frames', 'Frames: {n}', { n: framesNow });
      recChecksText.textContent = t('label.checks', 'Checks: {n}', { n: checks });
    };
    let loopChecks = 0;
    let loopBacks = 0;
    let recChecks = 0;

    const clearRound = (): void => {
      flush();
      clearLoop();
      for (const f of frames.values()) f.g.remove();
      frames.clear();
      chips.textContent = '';
      loopChecks = 0;
      loopBacks = 0;
      recChecks = 0;
      setLoopReadouts(0, 0, 0);
      setRecReadouts(0, 0);
      caption.textContent = '';
    };
    clearRound();

    const stage: LoopVsRecursionStage = {
      reset() {
        clearRound();
        answerText.loop?.remove();
        answerText.rec?.remove();
        answerText.loop = null;
        answerText.rec = null;
        peakLevel = 0;
        peakG.setAttribute('opacity', '0');
      },
      startRound() {
        clearRound();
        dimAnswers();
      },
      loopInit(n, acc, k, ms) {
        clearLoop();
        const g = el('g', {}, layer);
        loopG = g;
        el('path', {
          d: `M ${BODY.x + BODY.w / 2} ${cellY} C ${BODY.x + BODY.w / 2} ${archTop}, ${COND.x + COND.w / 2} ${archTop}, ${COND.x + COND.w / 2} ${cellY}`,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 4',
        }, g);
        const frameG = el('g', {}, g);
        el('rect', { x: LOOP_X, y: loopY, width: LOOP_W, height: FH, rx: 6, fill: c.bgSubtle, stroke: c.primary, 'stroke-width': 1.5 }, frameG);
        text(frameG, LOOP_X + 10, loopY + 10, `sumSquaresLoop(${n})`, { mono: true, size: fontSizes.xs, fill: c.textMuted });
        el('rect', { x: COND.x, y: cellY, width: COND.w, height: cellH, rx: 4, fill: c.bg, stroke: c.border }, frameG);
        el('rect', { x: BODY.x, y: cellY, width: BODY.w, height: cellH, rx: 4, fill: c.bg, stroke: c.border }, frameG);
        condText = text(frameG, COND.x + 22, cellY + cellH / 2, '', { mono: true });
        condTag = text(frameG, COND.x + COND.w - 6, cellY + cellH / 2, '', { anchor: 'end', size: fontSizes.xs, weight: 600 });
        bodyText = text(frameG, BODY.x + 22, cellY + cellH / 2, `acc ${acc}  k ${k}`, { mono: true });
        dot = el('circle', { r: 5, fill: c.accent }, g);
        placeDot(condPt.x, loopY - 8);
        tween('loop-frame', ms, (p) => moveTo(frameG, 0, (1 - p) * (PITCH * 0.8)));
        setLoopReadouts(1, loopChecks, loopBacks);
      },
      loopCheck(k, n, pass, count, backNow, backs, ms) {
        if (!condText || !condTag) throw new Error('loop-vs-recursion-stage: 반복 틀이 서기 전에 검사가 왔다');
        loopChecks = count;
        loopBacks = backs;
        setLoopReadouts(1, loopChecks, loopBacks);
        condText.textContent = `${k} <= ${n}`;
        condTag.textContent = pass ? t('label.true', 'true') : t('label.false', 'false');
        condTag.setAttribute('fill', pass ? c.success : c.danger);
        const from = { ...dotAt };
        // 거짓이면 도착한 뒤 아래로 빠져나간다 — 한 걸음 안에 둘을 잇는다
        const arrive = pass ? ms : ms * 0.6;
        const drop = (): void => {
          placeDot(condPt.x, condPt.y);
          if (pass) return;
          tween('dot-exit', ms * 0.4, (p) => placeDot(condPt.x, condPt.y + p * (GROUND - condPt.y + 6)));
        };
        if (backNow) {
          // 몸 끝에서 둥근 길을 따라 조건 칸으로 되돌아 올라간다
          const x0 = BODY.x + BODY.w / 2;
          const x1 = COND.x + COND.w / 2;
          tween('dot', arrive, (p) => {
            const q = 1 - p;
            const x = q * q * q * x0 + 3 * q * q * p * x0 + 3 * q * p * p * x1 + p * p * p * x1;
            const y = q * q * q * cellY + 3 * q * q * p * archTop + 3 * q * p * p * archTop + p * p * p * cellY;
            placeDot(x, y);
          }, drop);
        } else {
          tween('dot', arrive, (p) => placeDot(from.x + (condPt.x - from.x) * p, from.y + (condPt.y - from.y) * p), drop);
        }
      },
      loopAdd(square, to, kNext, ms) {
        if (!bodyText) throw new Error('loop-vs-recursion-stage: 반복 틀이 서기 전에 몸이 왔다');
        const target = bodyText;
        tween('dot', ms * 0.5, (p) => placeDot(condPt.x + (bodyPt.x - condPt.x) * p, condPt.y));
        fly(`+${square}`, condPt.x, cellY + cellH / 2, bodyPt.x, cellY + cellH / 2, ms * 0.7, () => {
          target.textContent = `acc ${to}  k ${kNext}`;
        });
      },
      loopReturn(answer, ms) {
        const g = loopG;
        if (!g) throw new Error('loop-vs-recursion-stage: 걷을 반복 틀이 없다');
        setLoopReadouts(0, loopChecks, loopBacks);
        dot?.remove();
        dot = null;
        fly(String(answer), bodyPt.x, cellY + cellH / 2, LOOP_SLOT_CX, SLOT_Y + SLOT_H / 2, ms * 0.8, () => land('loop', answer, ms));
        loopG = null;
        tween('loop-frame', ms * 0.8, (p) => {
          moveTo(g, 0, -p * 26);
          g.setAttribute('opacity', String(1 - p));
        }, () => g.remove());
      },
      recCheck(level, arg, base, count, height, ms) {
        recChecks = count;
        setRecReadouts(height, recChecks);
        if (level === 1) {
          makeFrame(1, arg, GROUND + 20, ms * 0.7);
          if (peakLevel < 1) movePeak(1, ms * 0.7);
        }
        const f = frameAt(level);
        activate(level);
        f.left.textContent = `${arg} == 0`;
        f.right.textContent = base ? t('label.true', 'true') : t('label.false', 'false');
        f.right.setAttribute('fill', base ? c.success : c.danger);
        f.hole.setAttribute('opacity', '0');
        f.holeText.textContent = '';
      },
      recCall(level, square, child, height, ms) {
        const f = frameAt(level);
        setRecReadouts(height, recChecks);
        f.left.textContent = `${square} +`;
        f.hole.setAttribute('opacity', '1');
        f.holeText.textContent = '□';
        f.holeText.setAttribute('fill', c.textMuted);
        f.right.textContent = '';
        makeFrame(level + 1, child, f.y, ms * 0.8);
        activate(level + 1);
        if (level + 1 > peakLevel) movePeak(level + 1, ms * 0.8);
      },
      recBase(level, height, ms) {
        const f = frameAt(level);
        const below = frameAt(level - 1);
        setRecReadouts(height, recChecks);
        f.left.textContent = '';
        f.right.textContent = '';
        f.hole.setAttribute('opacity', '0');
        f.holeText.textContent = '0';
        activate(level - 1);
        fly('0', HOLE_CX, f.y + FH / 2, HOLE_CX, below.y + FH / 2, ms * 0.8, () => {
          below.holeText.textContent = '0';
          below.holeText.setAttribute('fill', c.text);
        });
        liftOff(level, ms * 0.8);
      },
      recReturn(level, square, got, result, outside, height, ms) {
        const f = frameAt(level);
        setRecReadouts(height, recChecks);
        f.left.textContent = `${square} +`;
        f.holeText.textContent = String(got);
        f.holeText.setAttribute('fill', c.text);
        f.right.textContent = `= ${result}`;
        f.right.setAttribute('fill', c.text);
        const x0 = HOLE_CX + HOLE_W / 2 + 30;
        if (outside) {
          activate(0);
          fly(String(result), x0, f.y + FH / 2, REC_SLOT_CX, SLOT_Y + SLOT_H / 2, ms * 0.8, () => land('rec', result, ms));
        } else {
          const below = frameAt(level - 1);
          activate(level - 1);
          fly(String(result), x0, f.y + FH / 2, HOLE_CX, below.y + FH / 2, ms * 0.8, () => {
            below.holeText.textContent = String(result);
            below.holeText.setAttribute('fill', c.text);
          });
        }
        liftOff(level, ms * 0.8);
      },
      settlePeak(height, ms) {
        if (height !== peakLevel) movePeak(height, ms);
      },
      setCaption(s) {
        caption.textContent = s;
      },
    };

    return {
      ...stage,
      destroy() {
        destroyed = true;
        flush();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
  },
};
