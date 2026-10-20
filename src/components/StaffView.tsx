import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Student, Task, SubmissionRecord, StudentDataResponse } from '../types';
import { Api, fmtDue, isLate } from '../services/api';

interface StaffViewProps {
  onRefreshNeeded?: () => void;
}

export const StaffView: React.FC<StaffViewProps> = () => {
  const [screen, setScreen] = useState<'loading' | 'home' | 'step1' | 'step2' | 'done'>('loading');
  const [data, setData] = useState<StudentDataResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedStaff, setSelectedStaff] = useState<Student | null>(null);
  const [pickedTasks, setPickedTasks] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const [doneData, setDoneData] = useState<{
    added: string[];
    dups: string[];
    staffName: string;
  } | null>(null);
  const [countdown, setCountdown] = useState(5);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetState = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (doneTimerRef.current) clearInterval(doneTimerRef.current);
    setSelectedStaff(null);
    setPickedTasks(new Set());
    setConfirmModalOpen(false);
    setDoneData(null);
    setScreen('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Reload quietly to fetch any updates from other tablets or admin
    loadData(true);
  }, []);

  const armIdle = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      resetState();
    }, 60000);
  }, [resetState]);

  const loadData = async (quiet = false) => {
    try {
      const res = await Api.getStudentData();
      setData(res);
      setErrorMsg(null);
      setScreen((prev) => (prev === 'loading' ? 'home' : prev));
    } catch (err: unknown) {
      if (quiet && data) return;
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setScreen('loading');
    }
  };

  useEffect(() => {
    loadData();
    // Periodically update training list every 5 minutes
    const interval = setInterval(() => {
      loadData(true);
    }, 300000);

    return () => {
      clearInterval(interval);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (doneTimerRef.current) clearInterval(doneTimerRef.current);
    };
  }, []);

  // Listen to storage events for cross-tab sync in demo mode
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (Api.isDemo && e.key === Api.DEMO_KEY) {
        loadData(true);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleStart = () => {
    setScreen('step1');
    armIdle();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectStaff = (student: Student) => {
    setSelectedStaff(student);
    setPickedTasks(new Set());
    setScreen('step2');
    armIdle();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleTask = (taskName: string) => {
    setPickedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskName)) {
        next.delete(taskName);
      } else {
        next.add(taskName);
      }
      return next;
    });
    armIdle();
  };

  const handleSubmitClick = () => {
    if (!selectedStaff || pickedTasks.size === 0 || submitting) return;
    setConfirmModalOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!selectedStaff || pickedTasks.size === 0 || submitting) return;
    setConfirmModalOpen(false);
    setSubmitting(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    try {
      const res = await Api.submit({
        no: selectedStaff.no,
        name: selectedStaff.name,
        tasks: Array.from(pickedTasks),
      });

      // Update local records
      if (data) {
        const updatedRecords: SubmissionRecord[] = [
          ...data.records,
          ...res.added.map((task) => ({
            time: res.time,
            no: selectedStaff.no,
            name: selectedStaff.name,
            task,
            memo: '',
          })),
        ];
        setData({ ...data, records: updatedRecords });
      }

      setDoneData({
        added: res.added,
        dups: res.dups,
        staffName: selectedStaff.name,
      });

      setScreen('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // 5-second countdown timer
      setCountdown(5);
      if (doneTimerRef.current) clearInterval(doneTimerRef.current);
      let count = 5;
      doneTimerRef.current = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          if (doneTimerRef.current) clearInterval(doneTimerRef.current);
          resetState();
        }
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('등록하지 못했습니다: ' + msg + '\n다시 시도하거나 연수 담당자께 알려 주세요.');
      armIdle();
    } finally {
      setSubmitting(false);
    }
  };

  // Determine completed tasks for current selected staff
  const staffCompletedTasks = new Set(
    data && selectedStaff
      ? data.records
          .filter((r) => r.no === selectedStaff.no && r.name === selectedStaff.name)
          .map((r) => r.task)
      : []
  );

  return (
    <main className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-6 pb-36">
      {/* Loading & Error Screen */}
      {screen === 'loading' && (
        <div className="text-center text-[#5f6b80] text-xl py-24 leading-relaxed">
          {errorMsg ? (
            <div>
              <p className="text-[#c0392b] font-semibold mb-2">불러오기 실패: {errorMsg}</p>
              <p className="text-sm">연수 담당자께 알려 주세요.</p>
              <button
                type="button"
                onClick={() => loadData()}
                className="mt-6 px-6 py-2.5 rounded-xl bg-[#2f6fed] text-white text-base font-bold shadow hover:bg-[#2558be]"
              >
                다시 시도
              </button>
            </div>
          ) : (
            '명단을 불러오는 중…'
          )}
        </div>
      )}

      {/* Screen 1: Home View */}
      {screen === 'home' && (
        <section className="min-h-[calc(100vh-230px)] flex flex-col items-center justify-center text-center gap-8 py-8 sm:py-16">
          <p className="text-[clamp(36px,7vw,80px)] font-black tracking-tight leading-[1.3] text-[#1d2433] keep-all">
            이수증을 <span className="text-[#2f6fed]">제출하셨나요?</span>
          </p>
          <p className="text-[clamp(15px,1.8vw,19px)] text-[#52627a] leading-relaxed max-w-xl px-4">
            이수증을 별도로 제출한 뒤, 이 화면에서 제출 여부를 등록해 주세요.<br className="hidden sm:inline" />
            이 앱에서는 파일을 업로드하지 않습니다.
          </p>
          <button
            type="button"
            onClick={handleStart}
            className="w-full max-w-[480px] text-2xl sm:text-3xl font-extrabold py-5 sm:py-6 px-8 rounded-3xl bg-[#2f6fed] text-white cursor-pointer shadow-[0_10px_24px_rgba(47,111,237,0.3)] hover:brightness-105 active:scale-[0.98] transition-all"
          >
            제출 여부 등록하기
          </button>
        </section>
      )}

      {/* Screen 2: Step 1 - Select Staff Name */}
      {screen === 'step1' && (
        <section className="py-2">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1d2433] flex items-center gap-3">
              <b className="inline-grid place-items-center w-9 h-9 rounded-full bg-[#2f6fed] text-white text-xl font-bold">
                1
              </b>
              내 이름을 눌러 주세요
            </h2>
            <button
              type="button"
              onClick={resetState}
              className="text-base sm:text-lg border-2 border-[#2f6fed] text-[#2f6fed] bg-white rounded-xl px-4 py-2 font-medium hover:bg-[#e7efff] active:scale-95 transition-all"
            >
              ← 처음으로
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {data?.students && data.students.length > 0 ? (
              data.students.map((student, idx) => (
                <button
                  key={`${student.no}-${student.name}-${idx}`}
                  type="button"
                  onClick={() => handleSelectStaff(student)}
                  className="bg-white border-2 border-[#dfe4ee] hover:border-[#2f6fed] rounded-2xl p-4 sm:p-5 text-xl sm:text-2xl font-bold text-[#1d2433] cursor-pointer flex flex-col items-center gap-1 shadow-sm active:scale-95 transition-all"
                >
                  <span>{student.name}</span>
                  <span className="text-sm sm:text-base text-[#5f6b80] font-normal">{student.no}번</span>
                </button>
              ))
            ) : (
              <div className="col-span-full text-center text-[#5f6b80] text-lg py-16">
                등록된 교직원이 없습니다.<br />
                연수 담당자가 관리자 페이지에서 명단을 등록해 주세요.
              </div>
            )}
          </div>
        </section>
      )}

      {/* Screen 3: Step 2 - Select Training Tasks */}
      {screen === 'step2' && selectedStaff && (
        <section className="py-2">
          {/* User identifier card */}
          <div className="flex items-center justify-between gap-3 bg-[#e7efff] rounded-2xl px-5 sm:px-6 py-4 mb-6 text-xl sm:text-2xl text-[#1d2433] shadow-sm">
            <div>
              <span className="font-medium text-[#2f6fed]">{selectedStaff.no}번</span>{' '}
              <strong className="text-2xl sm:text-3xl font-extrabold">{selectedStaff.name}</strong> 님
            </div>
            <button
              type="button"
              onClick={resetState}
              className="text-base sm:text-lg border-2 border-[#2f6fed] text-[#2f6fed] bg-white rounded-xl px-4 py-2 font-medium hover:bg-[#e7efff] active:scale-95 transition-all whitespace-nowrap"
            >
              ← 내가 아니에요
            </button>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-[#1d2433] flex items-center gap-3 mb-6 flex-wrap">
            <b className="inline-grid place-items-center w-9 h-9 rounded-full bg-[#2f6fed] text-white text-xl font-bold flex-none">
              2
            </b>
            <span>
              이수증을 제출한 연수를 선택해 주세요{' '}
              <small className="text-base font-normal text-[#5f6b80]">(여러 개 선택 가능)</small>
            </span>
          </h2>

          <div className="grid gap-3.5 mb-24">
            {data?.tasks && data.tasks.length > 0 ? (
              data.tasks.map((task, idx) => {
                const isDone = staffCompletedTasks.has(task.name);
                const isSelected = pickedTasks.has(task.name);
                const late = isLate(task.due);

                return (
                  <button
                    key={`${task.name}-${idx}`}
                    type="button"
                    disabled={isDone}
                    onClick={() => !isDone && handleToggleTask(task.name)}
                    className={`w-full flex items-center gap-4 border-2 rounded-2xl p-4 sm:p-5 text-left text-lg sm:text-xl font-semibold transition-all ${
                      isDone
                        ? 'bg-[#f1f3f7] border-[#dfe4ee] text-[#8a94a6] cursor-default'
                        : isSelected
                        ? 'bg-[#e7efff] border-[#2f6fed] text-[#1d2433] shadow-sm'
                        : 'bg-white border-[#dfe4ee] text-[#1d2433] hover:border-[#2f6fed]'
                    }`}
                  >
                    <span
                      className={`flex-none w-8 h-8 rounded-xl border-2 flex items-center justify-center text-lg font-black transition-colors ${
                        isDone
                          ? 'bg-[#1f9d55] border-[#1f9d55] text-white'
                          : isSelected
                          ? 'bg-[#2f6fed] border-[#2f6fed] text-white'
                          : 'border-[#b8c2d6] text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className="flex-1 min-w-0 font-bold truncate">{task.name}</span>
                    {isDone ? (
                      <span className="flex-none text-xs sm:text-sm font-bold text-[#1f9d55] bg-[#e3f6ea] rounded-full px-3 py-1">
                        제출 등록 완료
                      </span>
                    ) : task.due ? (
                      <span
                        className={`flex-none text-xs sm:text-sm font-medium ${
                          late ? 'text-[#c0392b] font-bold' : 'text-[#5f6b80]'
                        }`}
                      >
                        마감 {fmtDue(task.due)}
                        {late ? ' 지남' : ''}
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="text-center text-[#5f6b80] text-lg py-12">
                지금 받는 연수 이수증이 없습니다.
              </div>
            )}
          </div>

          {/* Fixed bottom bar */}
          <div className="fixed left-0 right-0 bottom-0 bg-white border-t border-[#dfe4ee] px-4 sm:px-6 py-4 flex justify-center z-30 shadow-lg">
            <button
              type="button"
              disabled={pickedTasks.size === 0 || submitting}
              onClick={handleSubmitClick}
              className="w-full max-w-[560px] text-xl sm:text-2xl font-extrabold py-4 sm:py-5 px-6 rounded-2xl bg-[#2f6fed] disabled:bg-[#c3cbdb] text-white shadow-md active:scale-[0.99] transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting
                ? '등록하는 중…'
                : pickedTasks.size > 0
                ? `${pickedTasks.size}개 제출 등록하기`
                : '연수를 선택해 주세요'}
            </button>
          </div>
        </section>
      )}

      {/* Screen 4: Done Screen */}
      {screen === 'done' && doneData && (
        <section
          onClick={resetState}
          className="text-center pt-12 sm:pt-16 cursor-pointer select-none max-w-xl mx-auto"
        >
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-[#1f9d55] text-white text-6xl sm:text-8xl flex items-center justify-center mx-auto mb-6 shadow-md animate-pop">
            ✓
          </div>
          <h3 className="text-2xl sm:text-4xl font-extrabold text-[#1d2433] mb-4">
            {doneData.staffName} 님, 제출 여부가 등록되었습니다!
          </h3>

          <ul className="list-none p-0 m-0 mb-4 text-lg sm:text-2xl space-y-2 text-[#1d2433]">
            {doneData.added.map((item, idx) => (
              <li key={idx} className="font-semibold text-[#1f9d55]">
                ✅ {item}
              </li>
            ))}
          </ul>

          {doneData.dups.length > 0 && (
            <div className="text-[#b45309] text-base sm:text-lg mb-4 font-medium">
              이미 제출되어 있던 항목: {doneData.dups.join(', ')}
            </div>
          )}

          <div className="text-[#5f6b80] text-base sm:text-lg mt-8 font-medium">
            <span className="text-[#2f6fed] font-bold text-xl">{countdown}</span>초 후 처음 화면으로 돌아갑니다 · 화면을 누르면 바로 돌아가요
          </div>
        </section>
      )}

      {/* Submit Confirmation Modal */}
      {confirmModalOpen && selectedStaff && (
        <div className="fixed inset-0 bg-slate-900/55 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-[#e7efff] text-[#2f6fed] text-3xl flex items-center justify-center mx-auto mb-4 font-bold">
              ?
            </div>
            <h4 className="text-xl sm:text-2xl font-bold text-[#1d2433] mb-3">
              {selectedStaff.name} 님
            </h4>
            <p className="text-[#52627a] text-base sm:text-lg mb-6 leading-relaxed">
              선택한 <strong className="text-[#2f6fed] font-bold">{pickedTasks.size}개</strong> 연수의 이수증을 별도로 제출하셨나요?<br />
              <span className="text-sm text-[#b45309] font-medium">
                확인을 누르면 제출 여부만 기록됩니다.
              </span>
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="flex-1 py-3.5 px-4 rounded-xl border border-[#dfe4ee] text-[#5f6b80] font-semibold text-base hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="flex-1 py-3.5 px-4 rounded-xl bg-[#2f6fed] text-white font-bold text-base hover:bg-[#2558be] transition-colors shadow"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
