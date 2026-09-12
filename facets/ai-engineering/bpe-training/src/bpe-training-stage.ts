/**
 * bpe-training-stage — BPE 학습 한 판을 한 폭에 그린다.
 *
 * 판은 셋이다.
 *
 *   왼쪽   말뭉치. 낱말마다 나온 횟수와 지금의 분할을 조각(chip)으로 놓는다.
 *   오른쪽 **짝 빈도 순위표.** 이 화면의 중심이다 — 걸음마다 줄이 자리를 다투고,
 *          손잡이를 돌리면 밀려 있던 짝이 아래에서 위로 올라온다.
 *   아래   배운 병합을 차례대로 쌓는 여섯 칸.
 *
 * ── 운동
 *
 * 값을 갈아 끼우는 재그리기가 아니다. 순위표의 줄은 `transform: translate` 로
 * 자리를 옮기고, 밀려난 줄은 판 아래 대기 자리로 내려간다 (지워지지 않는다 —
 * 다음 판에서 다시 올라와야 "올라왔다" 로 읽힌다). 말뭉치의 조각은 삼켜질 때
 * 자기를 삼킨 조각의 자리로 미끄러져 들어가고, 규칙 조각은 이긴 줄의 자리에서
 * 아래 칸으로 날아간다.
 *
 * ── 세로
 *
 * `H` 는 상수다. 마운트 뒤 `viewBox` 를 다시 재지 않는다 (S-view).
 *
 * ── 기다림
 *
 * 움직임은 promise 를 돌려주고 projector 가 그것을 기다린다. 그래서 `destroy` 는
 * 타이머를 거두는 것만으로 모자라고 **기다리던 것을 깨워야** 한다 (S-piece 의
 * `waiters`/`timers` 본).
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스. 마운트 뒤 바뀌지 않는다. */
const W = 760;
const H = 380;

const PANEL_TOP = 38;
const HEAD_Y = 24;

// ── 왼쪽: 말뭉치
const WORD_X = 16;
const WORD_ROW_H = 29;
const WORD_FREQ_X = 26;
const CHIP_X0 = 40;
const CHIP_H = 20;
const CHIP_GAP = 4;
const CHIP_UNIT = 11;
const CHIP_PAD = 12;

// ── 오른쪽: 짝 빈도 순위표
const RANK_X = 320;
const RANK_ROW_H = 25;
const RANK_SLOTS = 8;
const RANK_BAR_X = 74;
const RANK_BAR_MAX = 252;
const RANK_BAR_H = 14;
/** 순위 밖으로 밀린 줄이 내려가 기다리는 자리. */
const RANK_PARK_Y = PANEL_TOP + RANK_SLOTS * RANK_ROW_H + 10;

// ── 아래: 배운 병합
const RULE_X = 16;
const RULE_TOP = 276;
const RULE_W = 114;
const RULE_H = 42;
const RULE_GAP = 6;

const CAP_Y = 338;
const CAP_LINE_H = 17;
const CAP_WRAP = 92;

/** 한 낱말의 지금 분할. */
export type StageWord = { word: string; freq: number; tokens: string[] };

/** 순위표의 한 줄. */
export type StageRankRow = { left: string; right: string; count: number; whole: boolean };

/** 아래 칸에 쌓이는 규칙 하나. */
export type StageRule = { token: string; count: number; whole: boolean };

/**
 * 화면에 보일 글자로 바꾼다 — 낱말 끝 표식은 `_` 로 줄여 적는다.
 *
 * projector 도 캡션에 조각 이름을 넣어야 해서 같은 변환이 필요하다. 두 벌이
 * 되지 않게 여기서 내주고 그쪽이 가져다 쓴다.
 */
export function showToken(token: string, endMark: string): string {
  if (token === endMark) return '_';
  return token.endsWith(endMark) ? `${token.slice(0, token.length - endMark.length)}_` : token;
}

/** 짝의 정체. 조각에 공백이 없으므로 이 문자열이 열쇠다. */
export function rankKey(left: string, right: string): string {
  return `${left} ${right}`;
}

type Scene = {
  corpus: { word: string; freq: number }[];
  handleWord: string;
  endMark: string;
  initialFreq: number;
  mergeSteps: number;
};

/**
 * `initialData` 를 좁힌다. 좁히는 자리는 여기 하나다 — projector 가 같은 것을 다시
 * 좁혀 밀어 넣지 않는다 (C9: 단언 뒤에 검사가 따른다).
 */
function readScene(raw: Record<string, unknown> | undefined): Scene {
  const d = (raw ?? {}) as Record<string, unknown>;
  const corpus: { word: string; freq: number }[] = [];
  if (Array.isArray(d.corpus)) {
    for (const item of d.corpus) {
      if (typeof item !== 'object' || item === null) continue;
      const row = item as Record<string, unknown>;
      if (typeof row.word === 'string' && typeof row.freq === 'number') {
        corpus.push({ word: row.word, freq: row.freq });
      }
    }
  }
  return {
    corpus,
    handleWord: typeof d.handleWord === 'string' ? d.handleWord : '',
    endMark: typeof d.endMark === 'string' ? d.endMark : '</w>',
    initialFreq: typeof d.initialFreq === 'number' ? d.initialFreq : 0,
    mergeSteps: typeof d.mergeSteps === 'number' ? d.mergeSteps : 6,
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const bpeTrainingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너를 비우지 않는다 — 러너가 붙여 준 캔버스가 떨어져 나간다 (S-view).
    void container;

    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);
    const wholeToken = scene.handleWord + scene.endMark;
    const show = (token: string): string => showToken(token, scene.endMark);

    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      t(
        'label.aria',
        'BPE training: the corpus on the left, the ranked pair counts on the right, and the merges learned so far along the bottom',
      ),
    );

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /** 걸어 둔 것은 집합에 담고 destroy 에서 일괄로 거둔다 (S-piece). */
    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    function later(fn: () => void, ms: number): void {
      if (destroyed) return;
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    }

    // ── 판 셋
    const frameG = el('g', { class: 'bpe-frame' });
    const wordsG = el('g', { class: 'bpe-words' });
    const rankG = el('g', { class: 'bpe-rank' });
    const rulesG = el('g', { class: 'bpe-rules' });
    const capG = el('g', { class: 'bpe-caption' });
    svg.append(frameG, wordsG, rankG, rulesG, capG);

    function head(x: number, label: string): SVGTextElement {
      const node = el('text', {
        x,
        y: HEAD_Y,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.body,
        'letter-spacing': '0.04em',
      });
      node.textContent = label;
      return node;
    }

    frameG.append(
      head(WORD_X, t('label.corpus', 'words and how often they appear')),
      head(RANK_X, t('label.ranking', 'every neighbouring pair, counted')),
      head(RULE_X, t('label.rules', 'merges learned, in order')),
    );
    frameG.appendChild(
      el('line', {
        x1: RANK_X - 16,
        y1: PANEL_TOP - 22,
        x2: RANK_X - 16,
        y2: RULE_TOP - 28,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );

    // ── 아래 칸의 빈 자리. 규칙 조각은 이 위로 날아와 앉는다.
    for (let i = 0; i < scene.mergeSteps; i += 1) {
      const x = RULE_X + i * (RULE_W + RULE_GAP);
      frameG.appendChild(
        el('rect', {
          x,
          y: RULE_TOP,
          width: RULE_W,
          height: RULE_H,
          rx: 4,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        }),
      );
      const no = el('text', {
        x: x + 7,
        y: RULE_TOP + 13,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
      });
      no.textContent = String(i + 1);
      frameG.appendChild(no);
    }

    // ── 캡션 두 줄
    const capLines: SVGTextElement[] = [0, 1].map((i) =>
      el('text', {
        x: WORD_X,
        y: CAP_Y + i * CAP_LINE_H,
        fill: colors.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.body,
      }),
    );
    for (const line of capLines) capG.appendChild(line);

    // ── 말뭉치 판
    type Chip = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement };
    type WordRow = { freqText: SVGTextElement; chipsG: SVGGElement; chips: Map<number, Chip> };
    const wordRows = new Map<string, WordRow>();

    scene.corpus.forEach((w, i) => {
      const row = el('g', { transform: `translate(${WORD_X},${PANEL_TOP + i * WORD_ROW_H})` });
      row.setAttribute('data-word', w.word);
      const freqText = el('text', {
        x: WORD_FREQ_X,
        y: 14,
        fill: colors.textMuted,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
        'text-anchor': 'end',
      });
      freqText.textContent = String(w.freq);
      const chipsG = el('g', { class: 'bpe-chips' });
      row.append(freqText, chipsG);
      wordsG.appendChild(row);
      wordRows.set(w.word, { freqText, chipsG, chips: new Map() });
    });

    /** 조각 하나가 삼킨 원소의 수. 낱말 끝 표식도 한 자리를 차지한다. */
    function unitsOf(token: string): number {
      if (token === scene.endMark) return 1;
      return token.endsWith(scene.endMark)
        ? token.length - scene.endMark.length + 1
        : token.length;
    }

    function makeChip(): Chip {
      const g = el('g', { transform: 'translate(0,0)', opacity: 0 });
      g.style.transition = 'transform 300ms ease, opacity 200ms ease';
      const rect = el('rect', {
        x: 0,
        y: 0,
        width: CHIP_UNIT + CHIP_PAD,
        height: CHIP_H,
        rx: 4,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1,
      });
      rect.style.transition = 'width 300ms ease, fill 200ms ease';
      const label = el('text', {
        x: 0,
        y: 14,
        fill: colors.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
        'text-anchor': 'middle',
      });
      g.append(rect, label);
      return { g, rect, label };
    }

    /**
     * 말뭉치를 지금 분할로 다시 놓는다. 남는 조각은 자리를 옮기고 폭이 자라며,
     * 삼켜진 조각은 자기를 삼킨 조각의 자리로 미끄러져 들어가 사라진다.
     */
    function paintWords(words: StageWord[], duration: number): Promise<void> {
      // 움직임을 만드는 것은 CSS transition 인데 그 길이는 칩을 만들 때 한 번 박힌다.
      // 그대로 두면 속도를 올려도 기다림(`wait`)만 짧아지고 움직임은 그대로라
      // 걸음 경계를 넘어 이어진다. 넘어온 길이로 매번 맞춘다.
      const fade = Math.max(16, Math.round(duration * 0.67));
      for (const w of words) {
        const row = wordRows.get(w.word);
        if (!row) continue;
        row.freqText.textContent = String(w.freq);

        type Slot = { start: number; token: string; x: number; width: number };
        const slots: Slot[] = [];
        let x = CHIP_X0;
        let start = 0;
        for (const token of w.tokens) {
          const units = unitsOf(token);
          const width = units * CHIP_UNIT + CHIP_PAD;
          slots.push({ start, token, x, width });
          x += width + CHIP_GAP;
          start += units;
        }

        const keep = new Set(slots.map((s) => s.start));
        for (const [at, chip] of [...row.chips]) {
          if (keep.has(at)) continue;
          const host = slots.find((s) => at >= s.start && at < s.start + unitsOf(s.token));
          chip.g.setAttribute('transform', `translate(${host ? host.x : CHIP_X0},0)`);
          chip.g.setAttribute('opacity', '0');
          row.chips.delete(at);
          later(() => chip.g.remove(), Math.max(16, duration));
        }

        for (const slot of slots) {
          let chip = row.chips.get(slot.start);
          if (!chip) {
            chip = makeChip();
            chip.g.setAttribute('transform', `translate(${slot.x},0)`);
            row.chips.set(slot.start, chip);
            row.chipsG.appendChild(chip.g);
          }
          // 갓 만든 칩은 옮겨 갈 옛 자리가 없다. 그래도 여기서 함께 길이를 맞춰 두면
          // 다음 걸음부터 곧바로 지금 속도로 움직인다.
          chip.g.style.transition = `transform ${duration}ms ease, opacity ${fade}ms ease`;
          chip.rect.style.transition = `width ${duration}ms ease, fill ${fade}ms ease`;
          const whole = slot.token === wholeToken;
          chip.g.setAttribute('transform', `translate(${slot.x},0)`);
          chip.g.setAttribute('opacity', '1');
          chip.rect.setAttribute('width', String(slot.width));
          chip.rect.setAttribute('fill', whole ? colors.itemPivot : colors.itemDefault);
          chip.label.setAttribute('x', String(slot.width / 2));
          chip.label.setAttribute('fill', whole ? colors.stateInk : colors.text);
          chip.label.textContent = show(slot.token);
        }
      }
      return wait(duration);
    }

    // ── 짝 빈도 순위표
    type RankRow = {
      g: SVGGElement;
      bar: SVGRectElement;
      pair: SVGTextElement;
      count: SVGTextElement;
      y: number;
    };
    const rankRows = new Map<string, RankRow>();
    let winnerY = RANK_PARK_Y;

    function makeRankRow(key: string): RankRow {
      const g = el('g', { transform: `translate(${RANK_X},${RANK_PARK_Y})`, opacity: 0 });
      g.setAttribute('data-rank-key', key);
      g.style.transition = 'transform 320ms ease, opacity 320ms ease';
      const pair = el('text', {
        x: 0,
        y: 16,
        fill: colors.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
      });
      const bar = el('rect', {
        x: RANK_BAR_X,
        y: 5,
        width: 3,
        height: RANK_BAR_H,
        rx: 2,
        fill: colors.itemSorted,
      });
      bar.style.transition = 'width 320ms ease, fill 200ms ease';
      const count = el('text', {
        x: RANK_BAR_X + 8,
        y: 16,
        fill: colors.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
      });
      count.style.transition = 'x 320ms ease';
      g.append(pair, bar, count);
      rankG.appendChild(g);
      return { g, bar, pair, count, y: RANK_PARK_Y };
    }

    function park(row: RankRow): void {
      row.y = RANK_PARK_Y;
      row.g.setAttribute('transform', `translate(${RANK_X},${RANK_PARK_Y})`);
      row.g.setAttribute('opacity', '0');
    }

    /**
     * 줄을 다시 세운다. 순위 밖으로 밀린 줄은 지우지 않고 아래로 내려보낸다 —
     * 다음 판에서 같은 줄이 다시 올라와야 "올라왔다" 로 읽히기 때문이다.
     */
    function paintRanking(
      rows: StageRankRow[],
      winner: string | null,
      duration: number,
    ): Promise<void> {
      // 줄이 등수를 다투는 움직임도 CSS transition 이 만들고, 그 길이는 줄을 만들 때
      // 한 번 박힌다. 그대로 두면 속도를 올려도 기다림만 짧아지고 움직임은 그대로라
      // 걸음 경계를 넘는다. 넘어온 길이로 매번 맞춘다.
      const fade = Math.max(16, Math.round(duration * 0.625));
      const top = rows.length > 0 ? rows[0].count : 1;
      const seen = new Set<string>();
      rows.forEach((r, i) => {
        const key = rankKey(r.left, r.right);
        seen.add(key);
        let row = rankRows.get(key);
        if (!row) {
          row = makeRankRow(key);
          rankRows.set(key, row);
        }
        const visible = i < RANK_SLOTS;
        const y = visible ? PANEL_TOP + i * RANK_ROW_H : RANK_PARK_Y;
        const width = Math.max(3, Math.round((r.count / Math.max(1, top)) * RANK_BAR_MAX));
        const isWinner = key === winner;
        row.y = y;
        row.g.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
        row.bar.style.transition = `width ${duration}ms ease, fill ${fade}ms ease`;
        row.g.setAttribute('transform', `translate(${RANK_X},${y})`);
        row.g.setAttribute('opacity', visible ? '1' : '0');
        row.pair.textContent = `${show(r.left)}+${show(r.right)}`;
        row.bar.setAttribute('width', String(width));
        row.bar.setAttribute(
          'fill',
          r.whole ? colors.itemPivot : isWinner ? colors.itemActive : colors.itemSorted,
        );
        row.bar.setAttribute('stroke', isWinner ? colors.text : 'none');
        row.bar.setAttribute('stroke-width', isWinner ? '1.5' : '0');
        row.count.setAttribute('x', String(RANK_BAR_X + width + 8));
        row.count.textContent = String(r.count);
        if (isWinner) winnerY = y;
      });
      for (const [key, row] of rankRows) if (!seen.has(key)) park(row);
      return wait(duration);
    }

    function clearRanking(): void {
      for (const [, row] of rankRows) park(row);
    }

    // ── 아래 칸
    const ruleEls: SVGGElement[] = [];

    /** 이긴 줄의 자리에서 아래 칸으로 날아가 앉는다. */
    function placeRule(index: number, rule: StageRule, duration: number): Promise<void> {
      const x = RULE_X + index * (RULE_W + RULE_GAP);
      const g = el('g', { transform: `translate(${RANK_X},${winnerY})`, opacity: 0 });
      g.setAttribute('data-rule-index', String(index));
      g.style.transition = `transform ${Math.max(30, duration)}ms ease, opacity 160ms ease`;
      const rect = el('rect', {
        x: 0,
        y: 0,
        width: RULE_W,
        height: RULE_H,
        rx: 4,
        fill: rule.whole ? colors.itemPivot : colors.bgSubtle,
        stroke: rule.whole ? colors.itemPivot : colors.border,
        'stroke-width': 1,
      });
      const ink = rule.whole ? colors.stateInk : colors.text;
      const token = el('text', {
        x: RULE_W / 2,
        y: 21,
        fill: ink,
        'font-size': fontSizes.md,
        'font-family': fonts.mono,
        'text-anchor': 'middle',
      });
      token.textContent = show(rule.token);
      const count = el('text', {
        x: RULE_W / 2,
        y: 34,
        fill: rule.whole ? colors.stateInk : colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
        'text-anchor': 'middle',
      });
      count.textContent = String(rule.count);
      g.append(rect, token, count);
      rulesG.appendChild(g);
      ruleEls.push(g);
      later(() => {
        g.setAttribute('opacity', '1');
        g.setAttribute('transform', `translate(${x},${RULE_TOP})`);
      }, 16);
      return wait(duration + 16);
    }

    function clearRules(): void {
      for (const g of ruleEls) g.remove();
      ruleEls.length = 0;
    }

    // ── 캡션
    function setCaption(line: string): void {
      const words = line.split(' ');
      const lines: string[] = ['', ''];
      let at = 0;
      for (const word of words) {
        if (at < 1 && lines[at].length > 0 && lines[at].length + word.length + 1 > CAP_WRAP) at += 1;
        lines[at] = lines[at].length === 0 ? word : `${lines[at]} ${word}`;
      }
      capLines[0].textContent = lines[0];
      capLines[1].textContent = lines[1];
    }

    /** 처음 그림 — 마운트 순간 이미 서 있어야 한다. 알고리즘을 기다리지 않는다. */
    function initialWords(): StageWord[] {
      return scene.corpus.map((w) => ({
        word: w.word,
        freq: w.word === scene.handleWord ? scene.initialFreq : w.freq,
        tokens: [...w.word.split(''), scene.endMark],
      }));
    }

    void paintWords(initialWords(), 0);

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const layer of [frameG, wordsG, rankG, rulesG, capG]) layer.remove();
      },
      setWords(words: StageWord[], duration = 300): Promise<void> {
        return paintWords(words, duration);
      },
      setRanking(rows: StageRankRow[], winner: string | null, duration = 320): Promise<void> {
        return paintRanking(rows, winner, duration);
      },
      addRule(index: number, rule: StageRule, duration = 260): Promise<void> {
        return placeRule(index, rule, duration);
      },
      clearRules,
      setCaption,
      reset(): void {
        clearRanking();
        clearRules();
        setCaption('');
        void paintWords(initialWords(), 0);
      },
    };
  },
};
