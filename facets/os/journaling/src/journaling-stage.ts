/**
 * 저널링 stage — 두 줄(위 저널 없음 · 아래 저널)이 같은 시각 축 위에서 나란히 나아간다.
 *
 *   쓰기 칸 여덟 자리   쓰기 하나 = 한 칸. 끊김 선 앞의 칸은 적힐 칸, 뒤의 칸은 흐려진 채
 *   끊김 선             손잡이를 돌리면 두 줄의 쓰기 칸 위를 미끄러져 새 자리에 선다
 *   제자리 셋           bitmap · inode · data 의 지금 상태 (옛것 흰 칸 · 새것 검은 칸)
 *   다시 켠 뒤          판정 걸음에 앞 판의 결과에서 새 판의 결과로 옮겨 간다
 *
 * 코드 패널은 저널 줄만 따른다. 그래서 코드 패널이 켜는 자리와 같은 노란 표시는 저널 줄에만
 * 둔다 — 저널 없는 줄의 지금 칸은 회색 점선 테두리다. 저널 줄 이름 옆 노란 표식이 그 약속을 말한다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type BlockState = 'old' | 'new';
export type Verdict = 'old' | 'new' | 'torn';
export type WriteView = { area: 'home' | 'journal'; item: string };

/** projector 가 부르는 표면 — 한 타입으로 모은다 (C9). */
export type JournalingStage = {
  setRound(crash: number, caption: string, ms: number): Promise<void>;
  showWrite(
    index: number,
    journalHome: BlockState[],
    plainHome: BlockState[],
    plainWrote: boolean,
    caption: string,
    ms: number,
  ): Promise<void>;
  showRestart(committed: boolean, scanned: number, caption: string, ms: number): Promise<void>;
  showReplay(block: number, slot: number, journalHome: BlockState[], caption: string, ms: number): Promise<void>;
  showVerdict(
    plain: { home: BlockState[]; verdict: Verdict },
    journal: { home: BlockState[]; verdict: Verdict },
    caption: string,
    ms: number,
  ): Promise<void>;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 860;
const H = 250;
const LABEL_X = 12;
const SLOT_X0 = 150;
const SLOT_W = 52;
const SLOT_PITCH = 56;
const SLOTS = 8;
const CELL_H = 42;
const ROW_Y = { plain: 40, journal: 112 } as const;
const HOME_X0 = SLOT_X0 + SLOTS * SLOT_PITCH + 18;
const HOME_W = 42;
const HOME_PITCH = 46;
const RES_X0 = HOME_X0 + 3 * HOME_PITCH + 20;
const RES_W = 18;
const RES_PITCH = 21;
const CAPTION_Y = 232;

type Row = 'plain' | 'journal';

type Cell = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; strike: SVGLineElement; area: 'home' | 'journal' };
type HomeBox = { rect: SVGRectElement; text: SVGTextElement };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  return e;
}

function slotX(i: number): number {
  return SLOT_X0 + (i - 1) * SLOT_PITCH;
}

/** 끊김 선의 x — 쓰기 c 칸의 오른쪽 틈. c = 0 이면 첫 칸 앞. */
function crashX(c: number): number {
  return SLOT_X0 + c * SLOT_PITCH - (SLOT_PITCH - SLOT_W) / 2;
}

function asWrites(v: unknown, name: string): WriteView[] {
  if (!Array.isArray(v)) return [];
  return v.map((w, i) => {
    if (typeof w !== 'object' || w === null) throw new Error(`${name}[${i}] 가 쓰기가 아니다`);
    const area = (w as { area?: unknown }).area;
    const item = (w as { item?: unknown }).item;
    if ((area !== 'home' && area !== 'journal') || typeof item !== 'string') throw new Error(`${name}[${i}] 모양이 틀렸다`);
    return { area, item };
  });
}

export const journalingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const data = params.initialData ?? {};
    const blocks: string[] = Array.isArray(data.blocks) ? data.blocks.filter((b): b is string => typeof b === 'string') : [];
    const plainWrites = asWrites(data.plainWrites, 'plainWrites');
    const journalWrites = asWrites(data.journalWrites, 'journalWrites');

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    params.onScrubStart?.(() => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0) return resolve();
        const done = () => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
      });

    const ease = (e: SVGElement, props: string, ms: number) => {
      e.style.transition = isInstant() || ms <= 0 ? 'none' : props.split(',').map((p) => `${p.trim()} ${ms}ms ease`).join(', ');
    };

    const text = (x: number, y: number, s: string, opts: { size?: string; anchor?: string; fill?: string; weight?: string; mono?: boolean } = {}) => {
      const e = el('text', {
        x,
        y,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
        fill: opts.fill ?? colors.text,
      });
      if (opts.weight) e.setAttribute('font-weight', opts.weight);
      e.textContent = s;
      return e;
    };

    const root = el('g', {});
    svg.appendChild(root);

    // 머리 — 쓰기 번호 · 제자리 · 다시 켠 뒤
    for (let i = 1; i <= SLOTS; i++) {
      root.appendChild(
        text(slotX(i) + SLOT_W / 2, 22, t('label.writeNo', 'write {n}', { n: i }), {
          size: fontSizes.xs,
          anchor: 'middle',
          fill: colors.textMuted,
        }),
      );
    }
    root.appendChild(text(HOME_X0 + (3 * HOME_PITCH - 4) / 2, 22, t('label.home', 'in place'), { size: fontSizes.xs, anchor: 'middle', fill: colors.textMuted }));
    root.appendChild(text(RES_X0, 22, t('label.afterRestart', 'after restart'), { size: fontSizes.xs, fill: colors.textMuted }));

    // 줄 이름 — 저널 줄에는 코드 패널이 따른다는 노란 표식
    root.appendChild(text(LABEL_X, ROW_Y.plain + CELL_H / 2, t('label.plainRow', 'No journal'), { size: fontSizes.md, weight: '600' }));
    root.appendChild(text(LABEL_X, ROW_Y.journal + CELL_H / 2 - 8, t('label.journalRow', 'Journal'), { size: fontSizes.md, weight: '600' }));
    root.appendChild(el('rect', { x: LABEL_X, y: ROW_Y.journal + CELL_H / 2 + 5, width: 10, height: 10, rx: 2, fill: colors.accent }));
    root.appendChild(
      text(LABEL_X + 14, ROW_Y.journal + CELL_H / 2 + 10, t('label.codeFollows', 'code panel follows'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      }),
    );

    // 저널 줄 아래 묶음 표시 — 저널에 적는 쓰기 · 제자리에 적는 쓰기
    const bracket = (from: number, to: number, label: string) => {
      const y = ROW_Y.journal + CELL_H + 10;
      const x1 = slotX(from);
      const x2 = slotX(to) + SLOT_W;
      root.appendChild(el('path', { d: `M${x1} ${y - 4} V${y} H${x2} V${y - 4}`, fill: 'none', stroke: colors.border, 'stroke-width': 1 }));
      root.appendChild(text((x1 + x2) / 2, y + 11, label, { size: fontSizes.xs, anchor: 'middle', fill: colors.textMuted }));
    };
    const runs: { area: 'home' | 'journal'; from: number; to: number }[] = [];
    journalWrites.forEach((w, i) => {
      const last = runs[runs.length - 1];
      if (last && last.area === w.area) last.to = i + 1;
      else runs.push({ area: w.area, from: i + 1, to: i + 1 });
    });
    for (const r of runs) bracket(r.from, r.to, r.area === 'journal' ? t('label.toJournalArea', 'into the journal') : t('label.toHomeArea', 'in place'));

    // 쓰기 칸
    const makeCells = (row: Row, writes: WriteView[]): Cell[] =>
      writes.map((w, i) => {
        const x = slotX(i + 1);
        const y = ROW_Y[row];
        const g = el('g', {});
        const rect = el('rect', { x, y, width: SLOT_W, height: CELL_H, rx: 4 });
        const label = text(x + SLOT_W / 2, y + CELL_H / 2, w.item, { size: fontSizes.xs, anchor: 'middle', mono: true });
        const strike = el('line', { x1: x + 6, y1: y + CELL_H / 2, x2: x + SLOT_W - 6, y2: y + CELL_H / 2, stroke: colors.textMuted, 'stroke-width': 1.5 });
        strike.style.opacity = '0';
        g.append(rect, label, strike);
        root.appendChild(g);
        return { g, rect, text: label, strike, area: w.area };
      });
    const cells: Record<Row, Cell[]> = { plain: makeCells('plain', plainWrites), journal: makeCells('journal', journalWrites) };

    // 제자리 셋 · 다시 켠 뒤 셋
    const makeBoxes = (row: Row, x0: number, w: number, pitch: number, h: number, withName: boolean): HomeBox[] =>
      blocks.map((b, i) => {
        const x = x0 + i * pitch;
        const y = ROW_Y[row];
        const rect = el('rect', { x, y, width: w, height: h, rx: 4, fill: colors.itemDefault, stroke: colors.text, 'stroke-width': 1.2 });
        const label = text(x + w / 2, y + h / 2, withName ? b : '', { size: fontSizes.xs, anchor: 'middle', mono: true, fill: colors.text });
        root.append(rect, label);
        return { rect, text: label };
      });
    const home: Record<Row, HomeBox[]> = {
      plain: makeBoxes('plain', HOME_X0, HOME_W, HOME_PITCH, CELL_H, true),
      journal: makeBoxes('journal', HOME_X0, HOME_W, HOME_PITCH, CELL_H, true),
    };
    const result: Record<Row, HomeBox[]> = {
      plain: makeBoxes('plain', RES_X0, RES_W, RES_PITCH, RES_W, false),
      journal: makeBoxes('journal', RES_X0, RES_W, RES_PITCH, RES_W, false),
    };
    for (const row of ['plain', 'journal'] as const) for (const b of result[row]) b.rect.setAttribute('stroke-dasharray', '3 2');
    const resultWord: Record<Row, SVGTextElement> = {
      plain: text(RES_X0, ROW_Y.plain + RES_W + 14, '', { size: fontSizes.xs }),
      journal: text(RES_X0, ROW_Y.journal + RES_W + 14, '', { size: fontSizes.xs }),
    };
    const resultFrom: Record<Row, SVGTextElement> = {
      plain: text(RES_X0, ROW_Y.plain + RES_W + 28, '', { size: fontSizes.xs, fill: colors.textMuted }),
      journal: text(RES_X0, ROW_Y.journal + RES_W + 28, '', { size: fontSizes.xs, fill: colors.textMuted }),
    };
    const resultGroup = el('g', {});
    for (const row of ['plain', 'journal'] as const) {
      for (const b of result[row]) resultGroup.append(b.rect);
      resultGroup.append(resultWord[row], resultFrom[row]);
    }
    root.appendChild(resultGroup);

    // 훑기 띠 (저널 줄) · 다시 쓰기 조각
    const scan = el('rect', { x: SLOT_X0 - 3, y: ROW_Y.journal - 4, height: CELL_H + 8, width: 0, rx: 6, fill: colors.accent });
    scan.style.opacity = '0.35';
    scan.style.transformBox = 'fill-box';
    scan.style.transformOrigin = 'left center';
    root.insertBefore(scan, root.firstChild);

    // 지금 칸 표시 — 저널 줄은 노랑(코드 패널과 같은 표시), 저널 없는 줄은 회색 점선
    const markJournal = el('rect', { x: 0, y: ROW_Y.journal - 4, width: SLOT_W + 8, height: CELL_H + 8, rx: 6, fill: colors.accent });
    markJournal.style.opacity = '0';
    const markPlain = el('rect', {
      x: 0,
      y: ROW_Y.plain - 4,
      width: SLOT_W + 8,
      height: CELL_H + 8,
      rx: 6,
      fill: 'none',
      stroke: colors.textMuted,
      'stroke-width': 1.5,
      'stroke-dasharray': '4 3',
    });
    markPlain.style.opacity = '0';
    root.insertBefore(markJournal, root.firstChild);
    root.insertBefore(markPlain, root.firstChild);
    const placeMark = (m: SVGRectElement, x: number, w: number, ms: number) => {
      ease(m, 'transform, opacity', ms);
      m.setAttribute('width', String(w + 8));
      m.style.transform = `translateX(${x - 4}px)`;
      m.style.opacity = m === markJournal ? '0.45' : '1';
    };
    const hideMark = (m: SVGRectElement) => {
      m.style.opacity = '0';
    };

    // 끊김 선 — 두 줄을 가로지른다
    const crashG = el('g', {});
    crashG.append(
      el('line', { x1: 0, y1: 30, x2: 0, y2: ROW_Y.journal + CELL_H + 6, stroke: colors.danger, 'stroke-width': 2.5 }),
      text(0, ROW_Y.journal + CELL_H + 38, t('label.crash', 'crash'), { size: fontSizes.xs, anchor: 'middle', fill: colors.danger, weight: '600' }),
    );
    crashG.style.transform = `translateX(${crashX(0)}px)`;
    root.appendChild(crashG);

    const caption = text(LABEL_X, CAPTION_Y, '', { size: fontSizes.md });
    root.appendChild(caption);

    const paint = (b: HomeBox, s: BlockState, ms: number) => {
      ease(b.rect, 'fill', ms);
      ease(b.text, 'fill', ms);
      b.rect.style.fill = s === 'new' ? colors.primary : colors.itemDefault;
      b.text.style.fill = s === 'new' ? colors.textInverse : colors.text;
    };
    const paintRow = (row: Row, states: BlockState[], ms: number) => {
      if (states.length !== blocks.length) throw new Error(`블록 상태 수가 틀렸다: ${states.length}`);
      states.forEach((s, i) => paint(home[row][i]!, s, ms));
    };
    type CellLook = 'pending' | 'faded' | 'written' | 'dropped';
    const look = (c: Cell, how: CellLook, ms: number) => {
      ease(c.rect, 'fill, opacity', ms);
      ease(c.g, 'opacity', ms);
      c.rect.style.stroke = how === 'written' ? colors.text : colors.textMuted;
      c.rect.setAttribute('stroke-width', how === 'written' ? '1.4' : '1');
      c.rect.setAttribute('stroke-dasharray', how === 'written' ? '' : '4 3');
      c.rect.style.fill = how === 'written' ? colors.bgSubtle : colors.bg;
      c.text.style.fill = how === 'written' ? colors.text : colors.textMuted;
      c.g.style.opacity = how === 'faded' ? '0.3' : '1';
      c.strike.style.opacity = how === 'dropped' ? '1' : '0';
    };
    const verdictWord = (v: Verdict) =>
      v === 'old'
        ? t('label.verdictOld', 'intact · old')
        : v === 'new'
          ? t('label.verdictNew', 'intact · new')
          : t('label.verdictTorn', 'torn');

    let crashNow = 0;
    let hasResult = false;

    const layoutRound = (crash: number, ms: number) => {
      crashNow = crash;
      ease(crashG, 'transform', ms);
      crashG.style.transform = `translateX(${crashX(crash)}px)`;
      for (const row of ['plain', 'journal'] as const) {
        cells[row].forEach((c, i) => look(c, i + 1 <= crash ? 'pending' : 'faded', ms));
        paintRow(row, blocks.map(() => 'old'), ms);
      }
      hideMark(markJournal);
      hideMark(markPlain);
      ease(scan, 'transform', 0);
      scan.style.transform = 'scaleX(0)';
      ease(resultGroup, 'opacity', ms);
      resultGroup.style.opacity = hasResult ? '0.45' : '1';
    };
    const initial = typeof data.crashAfter === 'number' ? data.crashAfter : 0;
    layoutRound(initial, 0);

    const stage: JournalingStage & ViewInstance = {
      async setRound(crash, cap, ms) {
        caption.textContent = cap;
        layoutRound(crash, ms);
        await wait(ms);
      },
      async showWrite(index, journalHome, plainHome, plainWrote, cap, ms) {
        caption.textContent = cap;
        const jc = cells.journal[index - 1];
        if (!jc) throw new Error(`저널 줄에 쓰기 ${index} 칸이 없다`);
        look(jc, 'written', ms);
        placeMark(markJournal, slotX(index), SLOT_W, ms);
        if (plainWrote) {
          const pc = cells.plain[index - 1];
          if (!pc) throw new Error(`저널 없는 줄에 쓰기 ${index} 칸이 없다`);
          look(pc, 'written', ms);
          placeMark(markPlain, slotX(index), SLOT_W, ms);
        } else {
          hideMark(markPlain);
        }
        paintRow('journal', journalHome, ms);
        paintRow('plain', plainHome, ms);
        await wait(ms);
      },
      async showRestart(committed, scanned, cap, ms) {
        caption.textContent = cap;
        hideMark(markJournal);
        hideMark(markPlain);
        if (scanned > 0) {
          scan.setAttribute('width', String(slotX(scanned) + SLOT_W + 3 - (SLOT_X0 - 3)));
          ease(scan, 'transform', 0);
          scan.style.transform = 'scaleX(0)';
          // 한 프레임 뒤에 펼쳐야 transition 이 걸린다
          await wait(16);
          ease(scan, 'transform', ms);
          scan.style.transform = 'scaleX(1)';
        }
        await wait(ms);
        if (!committed) {
          for (let i = 0; i < Math.min(scanned, cells.journal.length); i++) {
            const c = cells.journal[i]!;
            if (c.area === 'journal') look(c, 'dropped', 0);
          }
        }
      },
      async showReplay(block, slot, journalHome, cap, ms) {
        caption.textContent = cap;
        ease(scan, 'transform', 0);
        scan.style.transform = 'scaleX(0)';
        const target = home.journal[block];
        const name = blocks[block];
        if (!target || name === undefined) throw new Error(`제자리 블록 ${block} 이 없다`);
        const from = slotX(slot);
        const to = HOME_X0 + block * HOME_PITCH;
        placeMark(markJournal, from, SLOT_W, 0);
        const token = el('g', {});
        token.append(
          el('rect', { x: 0, y: ROW_Y.journal + 6, width: SLOT_W - 8, height: CELL_H - 12, rx: 3, fill: colors.accent }),
          text((SLOT_W - 8) / 2, ROW_Y.journal + CELL_H / 2, name, { size: fontSizes.xs, anchor: 'middle', mono: true }),
        );
        token.style.transform = `translateX(${from + 4}px)`;
        root.appendChild(token);
        await wait(16);
        ease(token, 'transform', ms);
        token.style.transform = `translateX(${to + (HOME_W - (SLOT_W - 8)) / 2}px)`;
        await wait(ms);
        token.remove();
        placeMark(markJournal, to, HOME_W, 0);
        paintRow('journal', journalHome, 0);
      },
      async showVerdict(plain, journal, cap, ms) {
        caption.textContent = cap;
        ease(scan, 'transform', 0);
        scan.style.transform = 'scaleX(0)';
        hideMark(markPlain);
        placeMark(markJournal, RES_X0 - 2, 3 * RES_PITCH, ms);
        ease(resultGroup, 'opacity', ms);
        resultGroup.style.opacity = '1';
        for (const [row, r] of [
          ['plain', plain],
          ['journal', journal],
        ] as const) {
          if (r.home.length !== blocks.length) throw new Error(`블록 상태 수가 틀렸다: ${r.home.length}`);
          r.home.forEach((s, i) => {
            const b = result[row][i]!;
            b.rect.setAttribute('stroke-dasharray', '');
            paint(b, s, ms);
          });
          resultWord[row].textContent = verdictWord(r.verdict);
          resultWord[row].style.fill = r.verdict === 'torn' ? colors.danger : colors.text;
          resultWord[row].setAttribute('font-weight', r.verdict === 'torn' ? '700' : '400');
          resultFrom[row].textContent = t('label.crashAt', 'crash after write {n}', { n: crashNow });
        }
        hasResult = true;
        await wait(ms);
      },
      destroy() {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
    return stage;
  },
};
