/**
 * mutex 의 IR — 두지 않는다.
 *
 * IR 에는 스레드 · 자물쇠 · 차례가 없다. 끼워 드는 차례를 배열 · 반복으로 흉내 내면 여섯 언어로 펴지기는
 * 하지만, 코드 패널이 `lock` 이 아니라 흉내(스케줄러 시뮬레이터)를 보이게 된다. 독자가 읽어야 할 프로그램은
 * 화면이 가진 두 스레드의 가상 표기다. 그래서 `blocks` 에 codePanel 도 없다.
 */
import type { IR } from '@ffacet/core';

export const mutexIRs: IR[] = [];
