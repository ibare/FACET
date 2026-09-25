/**
 * 교착 상태 — IR 을 두지 않는다.
 *
 * 이 완제품이 말하는 것은 스레드 · 자물쇠 · 돌림 차례가 엮여 만드는 기다림의 고리다. IR 어휘에는
 * 스레드도 자물쇠도 차례도 없다 — 흉내 셈(배열로 짠 스케줄러)을 코드 패널에 띄우면 독자는 `lock` 이
 * 아니라 흉내를 읽는다. 그래서 코드 패널도 두지 않고, 세 스레드의 프로그램은 stage 가 가상 표기로
 * 그린다 (tasks/pseudo-notation.md 동기화 절).
 */
import type { IR } from '@ffacet/core';

export const deadlockIRs: IR[] = [];
