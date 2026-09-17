/**
 * 스크럽 띠 실험 페이지 — 눈으로 보고, 프레임으로 잰다.
 *
 * happy-dom 은 레이아웃도 페인트도 셈하지 않으므로 두 가지를 잴 수 없다.
 *   - 끄는 감각 (포인터 경로)
 *   - **뒤로 갈 때 중간 상태가 화면에 나오는가**
 *
 * 둘째가 설계의 전제다. 되감기는 `onReset()` 뒤에 목표까지의 발신을 기다리지
 * 않고 몰아 먹이는데, 브라우저가 그 묶음을 한 프레임으로 합쳐 준다는 데 기대고
 * 있다. 합쳐지지 않으면 화면이 처음으로 튕겼다가 다시 채워지는 것이 보인다.
 *
 * 그래서 매 프레임 격자의 상태를 적는다. 뒤로 끄는 동안 "초기 상태" 프레임이
 * 한 번이라도 잡히면 튄 것이고, 잡히지 않으면 합쳐진 것이다.
 */
import { runFacet, getFacetById, getColors } from '@ffacet/core/runtime';
import { registerHashAvalanche } from '@ffacet/algorithm-hash-avalanche';
import { registerSplitAndNumber } from '@ffacet/algorithm-split-and-number';
import { registerBstDegenerate } from '@ffacet/algorithm-bst-degenerate';
import { registerTokensPerLanguage } from '@ffacet/algorithm-tokens-per-language';
import { registerBetweenLetterAndWord } from '@ffacet/algorithm-between-letter-and-word';
import { registerUnknownBecomesKnown } from '@ffacet/algorithm-unknown-becomes-known';
import { registerBoundaryShift } from '@ffacet/algorithm-boundary-shift';
import { registerMergeTheFrequentPair } from '@ffacet/algorithm-merge-the-frequent-pair';
import { registerSpaceIsPartOfIt } from '@ffacet/algorithm-space-is-part-of-it';

registerHashAvalanche();
registerSplitAndNumber();
registerBstDegenerate();
registerTokensPerLanguage();
registerBetweenLetterAndWord();
registerUnknownBecomesKnown();
registerBoundaryShift();
registerMergeTheFrequentPair();
registerSpaceIsPartOfIt();

const mount = document.getElementById('stage-a');
const mountB = document.getElementById('stage-b');
const mountC = document.getElementById('stage-c');
const probeEl = document.getElementById('probe');
if (!mount || !mountB || !mountC || !probeEl) throw new Error('마운트 지점을 찾지 못했다');

function mountFacet(id: string, el: HTMLElement): void {
  const f = getFacetById(id);
  if (!f) throw new Error(`facet 미등록: ${id}`);
  runFacet(f, el);
}

mountFacet('facet:hashAvalanche', mount);
// 걸음이 길고 stage 가 rAF 로 직접 그리는 부류. 되짚을 때 tween 이 겹치는지 본다.
mountFacet('facet:splitAndNumber', mountB);
mountFacet('facet:bstDegenerate', mountC);

/** id 로 자리를 찾아 건다. 토큰화 여섯처럼 수가 많을 때. */
function mountFacetAt(id: string, elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`마운트 지점을 찾지 못했다: ${elementId}`);
  mountFacet(id, el);
}

mountFacetAt('facet:tokensPerLanguage', 'stage-tokens-per-language');
mountFacetAt('facet:betweenLetterAndWord', 'stage-between-letter-and-word');
mountFacetAt('facet:unknownBecomesKnown', 'stage-unknown-becomes-known');
mountFacetAt('facet:boundaryShift', 'stage-boundary-shift');
mountFacetAt('facet:mergeTheFrequentPair', 'stage-merge-the-frequent-pair');
mountFacetAt('facet:spaceIsPartOfIt', 'stage-space-is-part-of-it');

/** 출력 격자에서 칠해진 칸 수 — 걸음이 나아갈수록 늘어난다. */
function paintedCells(): number {
  // accent 값이 바뀌어도 따라오도록 토큰에서 읽는다.
  return mount!.querySelectorAll(`rect[stroke="${getColors('light').accent}"]`).length;
}

/** 켜져 있는 그룹 수 — 걸음의 대략적 진척. */
function shownGroups(): number {
  let n = 0;
  for (const g of Array.from(mount!.querySelectorAll('g'))) {
    const op = (g as SVGGElement).style.opacity;
    if (op === '1') n += 1;
  }
  return n;
}

type Sample = { t: number; painted: number; groups: number };

const probe = {
  /** 프레임마다 적은 표본. */
  samples: [] as Sample[],
  recording: false,
  /** 계측을 시작한다 (CDP 나 콘솔에서 부른다). */
  start(): void {
    this.samples = [];
    this.recording = true;
  },
  stop(): Sample[] {
    this.recording = false;
    return this.samples;
  },
  /** 스크럽 띠를 프로그램으로 끈다 — 키 경로를 쓴다. */
  press(key: string, times = 1): void {
    const track = mount!.querySelector('.facet-control-bar__timeline [role="slider"]');
    if (!track) return;
    for (let i = 0; i < times; i++) {
      track.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }
  },
  state(): { length: number; now: number; seekable: boolean } {
    const track = mount!.querySelector('.facet-control-bar__timeline [role="slider"]');
    return {
      length: Number(track?.getAttribute('aria-valuemax') ?? 0),
      now: Number(track?.getAttribute('aria-valuenow') ?? 0),
      seekable: track?.getAttribute('tabindex') === '0',
    };
  },
};

declare global {
  // 계측 손잡이. CDP 가 이 이름으로 띠를 몰아 본다.
  interface Window { __scrub: typeof probe }
}
window.__scrub = probe;

const started = performance.now();
function tick(): void {
  if (probe.recording) {
    probe.samples.push({
      t: Math.round(performance.now() - started),
      painted: paintedCells(),
      groups: shownGroups(),
    });
  }
  const s = probe.state();
  probeEl!.textContent =
    `걸음 ${s.now} / ${s.length}   ${s.seekable ? '끌 수 있음' : '채우는 중'}\n` +
    `칠해진 칸 ${paintedCells()}   켜진 묶음 ${shownGroups()}\n` +
    (probe.recording ? `표본 ${probe.samples.length}` : '');
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
