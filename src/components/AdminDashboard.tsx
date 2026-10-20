import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Student, Task, SubmissionRecord, DashboardResponse } from '../types';
import { Api, fmtDate, fmtDue, isLate, sessionStore, SESSION_PIN_KEY } from '../services/api';
import { APPS_SCRIPT_CODE } from '../services/appsScriptCode';

interface AdminDashboardProps {
  pin: string;
  onLogout: () => void;
  onNavigateToStaff: () => void;
  onPinChange: (newPin: string) => void;
  showToast: (msg: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  pin,
  onLogout,
  onNavigateToStaff,
  onPinChange,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'tasks' | 'roster' | 'settings'>('status');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [onlyMiss, setOnlyMiss] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Training form state
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  // Roster form state
  const [rosterText, setRosterText] = useState('');
  const [savingRoster, setSavingRoster] = useState(false);
  const [rosterMsg, setRosterMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Settings form state
  const [apiUrlInput, setApiUrlInput] = useState(Api.url);
  const [sheetPinInput, setSheetPinInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [linkMsg, setLinkMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // PIN change form state
  const [newPin1, setNewPin1] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [pinChangeMsg, setPinChangeMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const recordMap = useMemo(() => {
    const map = new Map<string, SubmissionRecord>();
    if (data?.records) {
      data.records.forEach((r) => {
        map.set(`${r.no}|${r.name}|${r.task}`, r);
      });
    }
    return map;
  }, [data?.records]);

  const refreshData = useCallback(
    async (loud = false) => {
      setRefreshing(true);
      try {
        const res = await Api.getDashboard(pin);
        setData(res);
        setAlertError(null);
        setSelectedTask((prev) => {
          if (prev && res.tasks.some((t) => t.name === prev)) return prev;
          return res.tasks[0]?.name || null;
        });
        setRosterText(res.students.map((s) => `${s.no} ${s.name}`).join('\n'));
        if (loud) showToast('새로고침했습니다');
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        if (error.code === 'PIN') {
          onLogout();
          return;
        }
        setAlertError('⚠ ' + (error.message || String(err)));
      } finally {
        setRefreshing(false);
      }
    },
    [pin, onLogout, showToast]
  );

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Auto refresh every 30s on status tab
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'status') {
        refreshData();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, refreshData]);

  // Cross-tab sync for demo mode
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (Api.isDemo && e.key === Api.DEMO_KEY) {
        refreshData();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshData]);

  // Donut chart SVG generator
  const renderDonut = (pct: number) => {
    const r = 26;
    const c = 2 * Math.PI * r;
    const strokeDash = (c * pct) / 100;

    return (
      <svg className="w-16 h-16 flex-none" viewBox="0 0 64 64">
        <circle className="text-[#edf0f5] fill-none stroke-current" strokeWidth="8" cx="32" cy="32" r={r} />
        {pct > 0 && (
          <circle
            className={`fill-none ${pct === 100 ? 'text-[#1f9d55]' : 'text-[#2f6fed]'} stroke-current`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${c}`}
            transform="rotate(-90 32 32)"
            cx="32"
            cy="32"
            r={r}
          />
        )}
        <text x="32" y="37" textAnchor="middle" className="text-sm font-extrabold fill-[#1d2433]">
          {pct}%
        </text>
      </svg>
    );
  };

  /* ───── Cell Toggle Handlers ───── */
  const handleCellClick = async (student: Student, taskName: string) => {
    const key = `${student.no}|${student.name}|${taskName}`;
    const has = recordMap.has(key);
    const confirmMessage = has
      ? `${student.no}번 ${student.name} — ‘${taskName}’ 제출 기록을 취소할까요?`
      : `${student.no}번 ${student.name} — ‘${taskName}’을(를) 제출한 것으로 처리할까요?\n(비고에 ‘담당자 확인’으로 기록됩니다)`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await Api.toggleRecord({
        pin,
        no: student.no,
        name: student.name,
        task: taskName,
      });
      await refreshData();
      showToast(has ? '제출 기록을 취소했습니다' : '제출 처리했습니다');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('처리하지 못했습니다: ' + msg);
    }
  };

  /* ───── Copy Missing Staff ───── */
  const handleCopyMissing = () => {
    if (!data || !selectedTask) return;
    const missing = data.students.filter((s) => !recordMap.has(`${s.no}|${s.name}|${selectedTask}`));
    const text = `[${selectedTask}] 미제출 ${missing.length}명: ` + missing.map((s) => `${s.no}번 ${s.name}`).join(', ');

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => showToast('복사했습니다'))
        .catch(() => window.prompt('복사하세요', text));
    } else {
      window.prompt('복사하세요', text);
    }
  };

  /* ───── CSV Export ───── */
  const handleDownloadCsv = () => {
    if (!data) return;
    const escapeCsv = (val: unknown) => {
      let s = String(val == null ? '' : val);
      if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };

    const lines: string[] = [
      ['번호', '이름', ...data.tasks.map((t) => t.name), '제출 수'].map(escapeCsv).join(','),
    ];

    data.students.forEach((s) => {
      let count = 0;
      const cells = data.tasks.map((t) => {
        const r = recordMap.get(`${s.no}|${s.name}|${t.name}`);
        if (r) count++;
        return r ? '○ ' + r.time : '';
      });
      lines.push([s.no, s.name, ...cells, `${count}/${data.tasks.length}`].map(escapeCsv).join(','));
    });

    const todayStr = fmtDate(new Date()).slice(0, 10);
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `연수이수증_수합현황_${todayStr}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('CSV 파일을 다운로드했습니다');
  };

  /* ───── Add Task ───── */
  const handleAddTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newTaskName.trim();
    if (!name || addingTask) return;

    setAddingTask(true);
    try {
      await Api.addTask({ pin, name, due: newTaskDue });
      setNewTaskName('');
      setNewTaskDue('');
      await refreshData();
      showToast(`‘${name}’ 추가했습니다`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg);
    } finally {
      setAddingTask(false);
    }
  };

  /* ───── Delete Task ───── */
  const handleDeleteTask = async (taskName: string) => {
    if (
      !window.confirm(
        `‘${taskName}’ 연수를 삭제할까요?\n교직원 화면에서 사라집니다. (이미 제출된 기록은 스프레드시트에 남습니다)`
      )
    )
      return;

    try {
      await Api.deleteTask({ pin, name: taskName });
      await refreshData();
      showToast('삭제했습니다');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg);
    }
  };

  /* ───── Save Roster ───── */
  const parseRoster = (text: string): Student[] => {
    let auto = 0;
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = /^(\d+)[\s.,)\t번]*(.+)$/.exec(l);
        auto++;
        return m ? { no: m[1], name: m[2].trim() } : { no: String(auto), name: l };
      });
  };

  const handleSaveRoster = async () => {
    const list = parseRoster(rosterText);
    const seen = new Set<string>();
    const dup = list.find((s) => {
      const k = s.no + '|' + s.name;
      if (seen.has(k)) return true;
      seen.add(k);
      return false;
    });

    if (dup) {
      alert(`같은 교직원이 두 번 있습니다: ${dup.no} ${dup.name}`);
      return;
    }

    if (!window.confirm(`${list.length}명으로 명단을 저장할까요?`)) return;

    setSavingRoster(true);
    setRosterMsg(null);
    try {
      await Api.saveStudents({ pin, students: list });
      await refreshData();
      setRosterMsg({ text: '저장했습니다', ok: true });
      showToast('명단을 저장했습니다');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRosterMsg({ text: msg, ok: false });
    } finally {
      setSavingRoster(false);
    }
  };

  /* ───── Connect Google Sheet ───── */
  const handleConnectSheet = async () => {
    const cleanUrl = apiUrlInput.trim();
    const cleanPin = sheetPinInput.trim();

    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(cleanUrl)) {
      setLinkMsg({
        text: 'https://script.google.com/macros/s/…/exec 형태의 웹 앱 URL을 붙여넣으세요.',
        ok: false,
      });
      return;
    }
    if (!cleanPin) {
      setLinkMsg({
        text: '스프레드시트 쪽 관리자 비밀번호를 입력하세요. (처음엔 1234)',
        ok: false,
      });
      return;
    }

    setConnecting(true);
    setLinkMsg({ text: '연결 확인 중…', ok: true });

    try {
      const info = await Api.test(cleanUrl, cleanPin);
      Api.setUrl(cleanUrl);
      onPinChange(cleanPin);
      setSheetPinInput('');
      setLinkMsg({ text: `연동되었습니다! (${info.sheetName || '연결 성공'})`, ok: true });
      showToast('구글 스프레드시트와 연동되었습니다');
      await refreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLinkMsg({ text: msg, ok: false });
    } finally {
      setConnecting(false);
    }
  };

  /* ───── Disconnect Sheet ───── */
  const handleDisconnectSheet = () => {
    if (
      !window.confirm(
        '이 기기에서 구글 스프레드시트 연동을 해제하고 데모 모드로 돌아갈까요?\n(스프레드시트의 데이터는 지워지지 않습니다)'
      )
    )
      return;

    Api.setUrl('');
    sessionStore.set(SESSION_PIN_KEY, null);
    onPinChange('1234');
    setApiUrlInput('');
    setLinkMsg({ text: '연동을 해제했습니다. 데모 모드(비밀번호: 1234)로 동작합니다.', ok: true });
    showToast('연동을 해제했습니다');
    refreshData();
  };

  /* ───── Change PIN ───── */
  const handleChangePin = async () => {
    const p1 = newPin1.trim();
    const p2 = newPin2.trim();

    if (!/^\d{4,8}$/.test(p1)) {
      setPinChangeMsg({ text: '비밀번호는 숫자 4~8자리로 정하세요.', ok: false });
      return;
    }
    if (p1 !== p2) {
      setPinChangeMsg({ text: '두 비밀번호가 다릅니다.', ok: false });
      return;
    }

    try {
      await Api.changePin({ pin, newPin: p1 });
      onPinChange(p1);
      setNewPin1('');
      setNewPin2('');
      setPinChangeMsg({ text: '비밀번호를 변경했습니다.', ok: true });
      showToast('관리자 비밀번호가 변경되었습니다');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPinChangeMsg({ text: msg, ok: false });
    }
  };

  /* ───── Reset Demo ───── */
  const handleResetDemo = async () => {
    if (!window.confirm('데모 데이터를 처음 상태로 되돌릴까요?')) return;
    Api.resetDemo();
    onPinChange('1234');
    await refreshData();
    showToast('데모 데이터를 초기화했습니다');
  };

  /* ───── Copy Apps Script Code ───── */
  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
        showToast('Apps Script 코드를 복사했습니다');
      } else {
        window.prompt('Apps Script 코드를 복사하세요', APPS_SCRIPT_CODE);
      }
    } catch {
      window.prompt('Apps Script 코드를 복사하세요', APPS_SCRIPT_CODE);
    }
  };

  // Missing staff for selected task
  const missingStaff = useMemo(() => {
    if (!data || !selectedTask) return [];
    return data.students.filter((s) => !recordMap.has(`${s.no}|${s.name}|${selectedTask}`));
  }, [data, selectedTask, recordMap]);

  // Filtered rows for table
  const tableRows = useMemo(() => {
    if (!data) return [];
    if (!onlyMiss) return data.students;
    return data.students.filter((s) =>
      data.tasks.some((t) => !recordMap.has(`${s.no}|${s.name}|${t.name}`))
    );
  }, [data, onlyMiss, recordMap]);

  const totalStudents = data?.students.length || 0;
  const totalTasks = data?.tasks.length || 0;

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {/* Admin Top Header */}
      <header className="bg-white border-b border-[#dfe4ee] px-4 sm:px-6 pt-3 pb-0 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h1 className="text-xl sm:text-2xl font-bold text-[#1d2433] flex items-center gap-2.5 flex-wrap">
            <span>📋 연수 이수증 수합 관리</span>
            <span
              className={`text-xs font-bold rounded-full px-2.5 py-1 ${
                Api.isDemo ? 'bg-[#fff4d6] text-[#7a5200]' : 'bg-[#e6f4ea] text-[#188038]'
              }`}
            >
              {Api.isDemo ? '데모 모드' : '구글 시트 연동됨'}
            </span>
          </h1>

          <div className="flex items-center gap-2 flex-wrap text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="px-3.5 py-1.5 rounded-xl bg-[#188038] hover:brightness-110 text-white font-semibold flex items-center gap-1.5 transition-all shadow-xs"
            >
              🔗 구글 스프레드시트 연동
            </button>
            {data?.sheetUrl && (
              <a
                href={data.sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl border border-[#dfe4ee] hover:border-[#2f6fed] text-[#1d2433] hover:text-[#2f6fed] flex items-center gap-1 transition-colors"
              >
                📄 스프레드시트 열기
              </a>
            )}
            <button
              type="button"
              onClick={onNavigateToStaff}
              className="px-3 py-1.5 rounded-xl border border-[#dfe4ee] hover:border-[#2f6fed] text-[#1d2433] hover:text-[#2f6fed] transition-colors"
            >
              📮 교직원 화면
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-1.5 rounded-xl border border-[#dfe4ee] text-[#d64545] hover:bg-[#fdecec] transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 mt-2">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`py-2.5 px-4 text-sm sm:text-base font-bold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'status'
                ? 'border-[#2f6fed] text-[#2f6fed]'
                : 'border-transparent text-[#5f6b80] hover:text-[#1d2433]'
            }`}
          >
            📊 제출 현황
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`py-2.5 px-4 text-sm sm:text-base font-bold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'tasks'
                ? 'border-[#2f6fed] text-[#2f6fed]'
                : 'border-transparent text-[#5f6b80] hover:text-[#1d2433]'
            }`}
          >
            📝 연수 관리
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`py-2.5 px-4 text-sm sm:text-base font-bold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'roster'
                ? 'border-[#2f6fed] text-[#2f6fed]'
                : 'border-transparent text-[#5f6b80] hover:text-[#1d2433]'
            }`}
          >
            👥 교직원 명단
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`py-2.5 px-4 text-sm sm:text-base font-bold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'settings'
                ? 'border-[#2f6fed] text-[#2f6fed]'
                : 'border-transparent text-[#5f6b80] hover:text-[#1d2433]'
            }`}
          >
            ⚙️ 설정 · 연동
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 pb-20">
        {/* Alert Error Box */}
        {alertError && (
          <div className="bg-[#fdecec] text-[#d64545] rounded-2xl p-4 mb-4 font-semibold text-sm sm:text-base shadow-xs">
            {alertError}
          </div>
        )}

        {/* TAB 1: 📊 제출 현황 */}
        {activeTab === 'status' && (
          <section className="space-y-4">
            {/* Donut cards row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {data?.tasks && data.tasks.length > 0 ? (
                data.tasks.map((task) => {
                  const count =
                    data.students.filter((s) => recordMap.has(`${s.no}|${s.name}|${task.name}`)).length;
                  const pct = totalStudents ? Math.round((count / totalStudents) * 100) : 0;
                  const late = isLate(task.due) && count < totalStudents;
                  const isSelected = task.name === selectedTask;

                  return (
                    <div
                      key={task.name}
                      onClick={() => setSelectedTask(task.name)}
                      className={`bg-white rounded-2xl p-3.5 flex items-center gap-3.5 border-2 cursor-pointer shadow-xs transition-all ${
                        isSelected
                          ? 'border-[#2f6fed] bg-[#f8faff]'
                          : 'border-transparent hover:border-slate-300'
                      }`}
                    >
                      {renderDonut(pct)}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[#1d2433] truncate text-base" title={task.name}>
                          {task.name}
                        </div>
                        <div className="text-xs text-[#5f6b80] mt-0.5">
                          <b className="text-sm font-extrabold text-[#1d2433]">{count}</b> / {totalStudents}명 제출
                        </div>
                        <div className={`text-xs mt-0.5 ${late ? 'text-[#d64545] font-bold' : 'text-[#5f6b80]'}`}>
                          {task.due ? `마감 ${fmtDue(task.due)}${late ? ' (지남)' : ''}` : '마감일 없음'}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full bg-white rounded-2xl p-6 text-center text-[#5f6b80] text-sm">
                  등록된 연수가 없습니다. <b>📝 연수 관리</b> 탭에서 추가하세요.
                </div>
              )}
            </div>

            {/* Missing People Panel */}
            {selectedTask && (
              <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#dfe4ee]">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <h2 className="text-base sm:text-lg font-bold text-[#1d2433] flex items-center gap-2">
                    <span>‘{selectedTask}’ 미제출 {missingStaff.length}명</span>
                  </h2>
                  {missingStaff.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCopyMissing}
                      className="px-3 py-1.5 rounded-xl border border-[#dfe4ee] hover:border-[#2f6fed] text-[#1d2433] text-sm font-semibold hover:bg-slate-50 transition-all flex items-center gap-1"
                    >
                      📋 미제출자 복사
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {missingStaff.length > 0 ? (
                    missingStaff.map((s) => (
                      <span
                        key={`${s.no}-${s.name}`}
                        className="bg-[#fdecec] text-[#d64545] rounded-full px-3 py-1 text-sm font-semibold inline-block"
                      >
                        {s.no} {s.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[#1f9d55] font-bold text-base">🎉 모두 제출했습니다!</span>
                  )}
                </div>
              </div>
            )}

            {/* Table Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#5f6b80] pt-2">
              <div className="flex items-center gap-3.5 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#1f9d55] inline-block shadow-xs" /> 교직원 등록
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#7a5ce0] inline-block shadow-xs" /> 담당자 확인
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full border-2 border-dashed border-[#cdd4e1] inline-block" /> 미제출
                </span>
                <span className="text-xs text-[#5f6b80]">· 칸을 누르면 제출 처리 / 취소</span>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer font-medium select-none">
                  <input
                    type="checkbox"
                    checked={onlyMiss}
                    onChange={(e) => setOnlyMiss(e.target.checked)}
                    className="rounded border-[#dfe4ee] text-[#2f6fed] focus:ring-[#e7efff]"
                  />
                  미제출 교직원만
                </label>
                {data?.updated && <span className="text-xs text-[#5f6b80]">{data.updated} 기준</span>}
                <button
                  type="button"
                  onClick={() => refreshData(true)}
                  disabled={refreshing}
                  className="px-3 py-1.5 rounded-xl border border-[#dfe4ee] hover:border-[#2f6fed] text-[#1d2433] text-sm font-semibold bg-white hover:bg-slate-50 transition-colors"
                >
                  {refreshing ? '새로고침 중…' : '↻ 새로고침'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="px-3 py-1.5 rounded-xl border border-[#dfe4ee] hover:border-[#2f6fed] text-[#1d2433] text-sm font-semibold bg-white hover:bg-slate-50 transition-colors"
                >
                  ⬇ 엑셀(CSV)
                </button>
              </div>
            </div>

            {/* Matrix Status Table */}
            <div className="overflow-auto bg-white rounded-2xl shadow-xs border border-[#dfe4ee] max-h-[72vh]">
              <table className="w-full border-collapse text-sm text-center">
                <thead>
                  <tr className="bg-[#f8f9fc] text-[#5f6b80] sticky top-0 z-20 shadow-xs">
                    <th className="py-2.5 px-3 font-semibold text-left sticky left-0 bg-[#f8f9fc] z-30 min-w-[120px] border-b border-[#dfe4ee]">
                      교직원
                    </th>
                    {data?.tasks.map((task) => (
                      <th
                        key={task.name}
                        onClick={() => setSelectedTask(task.name)}
                        className={`py-2.5 px-3 font-semibold min-w-[110px] cursor-pointer hover:bg-slate-100 border-b border-[#dfe4ee] ${
                          task.name === selectedTask ? 'text-[#2f6fed] font-bold' : ''
                        }`}
                      >
                        {task.name}
                      </th>
                    ))}
                    <th className="py-2.5 px-3 font-semibold min-w-[100px] border-b border-[#dfe4ee]">
                      제출률
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length > 0 ? (
                    tableRows.map((student) => {
                      let completedCount = 0;
                      return (
                        <tr key={`${student.no}-${student.name}`} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 text-left font-semibold sticky left-0 bg-white z-10 border-b border-[#dfe4ee] whitespace-nowrap">
                            <small className="text-[#5f6b80] font-normal mr-2 inline-block w-5 text-right">
                              {student.no}
                            </small>
                            {student.name}
                          </td>
                          {data?.tasks.map((task) => {
                            const rec = recordMap.get(`${student.no}|${student.name}|${task.name}`);
                            if (rec) completedCount++;
                            const tooltip = rec
                              ? `${rec.time} 제출${rec.memo ? ' · ' + rec.memo : ''}`
                              : '미제출';

                            return (
                              <td
                                key={task.name}
                                onClick={() => handleCellClick(student, task.name)}
                                title={tooltip}
                                className="py-2 px-3 border-b border-[#dfe4ee] cursor-pointer hover:bg-[#e7efff] transition-colors"
                              >
                                {rec ? (
                                  <span
                                    className={`inline-block w-5 h-5 rounded-full ${
                                      rec.memo ? 'bg-[#7a5ce0]' : 'bg-[#1f9d55]'
                                    } shadow-xs ring-2 ring-white`}
                                  />
                                ) : (
                                  <span className="inline-block w-5 h-5 rounded-full border-2 border-dashed border-[#cdd4e1]" />
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2 px-3 border-b border-[#dfe4ee] whitespace-nowrap">
                            <div className="flex items-center gap-2 justify-end text-xs text-[#5f6b80]">
                              <span>
                                {completedCount}/{totalTasks}
                              </span>
                              <div className="w-14 h-1.5 rounded-full bg-[#edf0f5] overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    totalTasks > 0 && (completedCount / totalTasks) * 100 < 50
                                      ? 'bg-[#d64545]'
                                      : 'bg-[#1f9d55]'
                                  }`}
                                  style={{
                                    width: `${totalTasks ? Math.round((completedCount / totalTasks) * 100) : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={totalTasks + 2} className="py-12 text-[#5f6b80] text-center">
                        {data?.students.length
                          ? '모든 교직원이 다 제출했습니다 🎉'
                          : '교직원 명단이 비어 있습니다. 👥 교직원 명단 탭에서 등록하세요.'}
                      </td>
                    </tr>
                  )}
                </tbody>
                {totalStudents > 0 && totalTasks > 0 && (
                  <tfoot className="bg-[#f8f9fc] text-[#5f6b80] font-bold sticky bottom-0 z-10 shadow-xs">
                    <tr>
                      <td className="py-2.5 px-3 text-left sticky left-0 bg-[#f8f9fc] z-20">제출 인원</td>
                      {data?.tasks.map((task) => {
                        const count = data.students.filter((s) =>
                          recordMap.has(`${s.no}|${s.name}|${task.name}`)
                        ).length;
                        return (
                          <td key={task.name} className="py-2.5 px-3">
                            {count}/{totalStudents}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        )}

        {/* TAB 2: 📝 연수 관리 */}
        {activeTab === 'tasks' && (
          <section className="space-y-4">
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-[#dfe4ee]">
              <h2 className="text-lg font-bold text-[#1d2433] mb-4">➕ 연수 추가</h2>
              <form onSubmit={handleAddTask} className="grid grid-cols-1 sm:grid-cols-[1fr_170px_auto] gap-3">
                <input
                  type="text"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  placeholder="예: 개인정보 보호 연수"
                  maxLength={40}
                  className="rounded-xl border border-[#dfe4ee] px-3.5 py-2.5 text-sm focus:border-[#2f6fed] focus:ring-2 focus:ring-[#e7efff] outline-none"
                />
                <input
                  type="date"
                  value={newTaskDue}
                  onChange={(e) => setNewTaskDue(e.target.value)}
                  title="마감일 (선택)"
                  className="rounded-xl border border-[#dfe4ee] px-3.5 py-2.5 text-sm focus:border-[#2f6fed] focus:ring-2 focus:ring-[#e7efff] outline-none"
                />
                <button
                  type="submit"
                  disabled={addingTask || !newTaskName.trim()}
                  className="py-2.5 px-5 rounded-xl bg-[#2f6fed] hover:bg-[#2558be] disabled:bg-[#c3cbdb] text-white font-bold text-sm shadow transition-colors cursor-pointer"
                >
                  {addingTask ? '추가 중…' : '추가'}
                </button>
              </form>
              <p className="text-xs text-[#5f6b80] mt-2.5">
                추가하면 교직원 화면의 제출 목록에 바로 나타납니다. 마감일은 선택 사항입니다.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-[#dfe4ee]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#1d2433]">등록된 연수</h2>
                <span className="text-xs text-[#5f6b80] font-semibold">{data?.tasks.length || 0}개</span>
              </div>

              <ul className="divide-y divide-[#dfe4ee]">
                {data?.tasks && data.tasks.length > 0 ? (
                  data.tasks.map((task) => {
                    const count =
                      data.students.filter((s) => recordMap.has(`${s.no}|${s.name}|${task.name}`)).length;

                    return (
                      <li key={task.name} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-base text-[#1d2433] block truncate">
                            {task.name}
                          </span>
                          <span className="text-xs text-[#5f6b80]">
                            {task.due ? `마감 ${fmtDue(task.due)} · ` : ''}
                            {count}/{totalStudents}명 제출
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.name)}
                          className="py-1.5 px-3 rounded-lg border border-[#dfe4ee] text-[#d64545] hover:bg-[#fdecec] text-xs font-semibold transition-colors"
                        >
                          삭제
                        </button>
                      </li>
                    );
                  })
                ) : (
                  <li className="py-6 text-center text-sm text-[#5f6b80]">
                    아직 등록된 연수가 없습니다. 위에서 추가하세요.
                  </li>
                )}
              </ul>
              <p className="text-xs text-[#5f6b80] mt-4 pt-3 border-t border-slate-100">
                삭제하면 교직원 화면과 현황표에서 사라집니다. 이미 제출된 기록은 스프레드시트 ‘제출기록’ 시트에 그대로 남습니다.
              </p>
            </div>
          </section>
        )}

        {/* TAB 3: 👥 교직원 명단 */}
        {activeTab === 'roster' && (
          <section className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-[#dfe4ee]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-[#1d2433]">교직원 명단</h2>
              <span className="text-xs text-[#5f6b80] font-semibold">{totalStudents}명</span>
            </div>
            <p className="text-xs sm:text-sm text-[#5f6b80] leading-relaxed mb-4">
              한 줄에 한 명씩 <b>번호 이름</b> 으로 적으세요 (예: <code>1 김민준</code>). 번호 없이 이름만 적으면 순서대로 번호가 매겨집니다.<br />
              엑셀에서 번호·이름 두 열을 복사해 붙여넣어도 됩니다.
            </p>

            <textarea
              value={rosterText}
              onChange={(e) => setRosterText(e.target.value)}
              spellCheck={false}
              rows={14}
              className="w-full rounded-xl border border-[#dfe4ee] p-3 text-sm font-mono leading-relaxed focus:border-[#2f6fed] focus:ring-2 focus:ring-[#e7efff] outline-none"
              placeholder="1 김민준&#10;2 이영희&#10;3 박지성"
            />

            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <button
                type="button"
                onClick={handleSaveRoster}
                disabled={savingRoster}
                className="py-2.5 px-6 rounded-xl bg-[#2f6fed] hover:bg-[#2558be] disabled:bg-[#c3cbdb] text-white font-bold text-sm shadow transition-colors cursor-pointer"
              >
                {savingRoster ? '저장 중…' : '명단 저장'}
              </button>
              {rosterMsg && (
                <span className={`text-sm font-bold ${rosterMsg.ok ? 'text-[#1f9d55]' : 'text-[#d64545]'}`}>
                  {rosterMsg.text}
                </span>
              )}
            </div>
          </section>
        )}

        {/* TAB 4: ⚙️ 설정 · 연동 */}
        {activeTab === 'settings' && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Connection Form */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-[#dfe4ee] space-y-4">
              <h2 className="text-lg font-bold text-[#1d2433]">🔗 구글 스프레드시트 연동</h2>

              <div
                className={`flex items-center gap-2 p-3.5 rounded-xl font-semibold text-sm ${
                  !Api.isDemo ? 'bg-[#e6f4ea] text-[#188038]' : 'bg-[#fff4d6] text-[#7a5200]'
                }`}
              >
                {!Api.isDemo ? (
                  <span>
                    ✅ 연동됨{data?.sheetName ? ` — ${data.sheetName}` : ''}
                  </span>
                ) : (
                  <span>⚠ 연동 안 됨 — 지금은 데모 모드(이 브라우저에만 저장)입니다</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1d2433] mb-1.5">
                  Apps Script 웹 앱 URL
                </label>
                <input
                  type="url"
                  value={apiUrlInput}
                  onChange={(e) => setApiUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/…/exec"
                  className="w-full rounded-xl border border-[#dfe4ee] px-3.5 py-2.5 text-sm focus:border-[#2f6fed] focus:ring-2 focus:ring-[#e7efff] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1d2433] mb-1.5">
                  스프레드시트 쪽 관리자 비밀번호 <span className="text-[#5f6b80] font-normal">(처음엔 1234)</span>
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={sheetPinInput}
                  onChange={(e) => setSheetPinInput(e.target.value)}
                  autoComplete="off"
                  className="w-full rounded-xl border border-[#dfe4ee] px-3.5 py-2.5 text-sm focus:border-[#2f6fed] focus:ring-2 focus:ring-[#e7efff] outline-none"
                />
              </div>

              <div className="flex gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleConnectSheet}
                  disabled={connecting}
                  className="py-2.5 px-5 rounded-xl bg-[#188038] hover:brightness-110 disabled:opacity-50 text-white font-bold text-sm shadow transition-all cursor-pointer"
                >
                  {connecting ? '연결 중…' : '연동하기'}
                </button>
                {!Api.isDemo && (
                  <button
                    type="button"
                    onClick={handleDisconnectSheet}
                    className="py-2.5 px-4 rounded-xl border border-[#dfe4ee] text-[#d64545] hover:bg-[#fdecec] font-semibold text-sm transition-colors"
                  >
                    연동 해제
                  </button>
                )}
              </div>

              {linkMsg && (
                <div className={`text-sm font-semibold ${linkMsg.ok ? 'text-[#1f9d55]' : 'text-[#d64545]'}`}>
                  {linkMsg.text}
                </div>
              )}

              <p className="text-xs text-[#5f6b80] leading-relaxed pt-2">
                연동 정보는 <b>이 기기</b>에 저장됩니다. 교직원용 태블릿에서도 시계를 눌러 관리자 페이지로 들어와 한 번 연동하세요.
              </p>
            </div>

            {/* Guide Step by Step */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-[#dfe4ee]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-[#1d2433]">📘 처음 연동하는 방법</h2>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="py-1 px-3 rounded-lg border border-[#dfe4ee] hover:border-[#2f6fed] text-xs font-semibold text-[#1d2433] hover:text-[#2f6fed] flex items-center gap-1"
                >
                  📋 코드 복사
                </button>
              </div>

              <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-[#1d2433] leading-relaxed">
                <li>
                  <a
                    href="https://sheets.new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#2f6fed] font-bold underline"
                  >
                    새 구글 스프레드시트 만들기
                  </a>
                </li>
                <li>
                  메뉴 <b>확장 프로그램 → Apps Script</b>
                </li>
                <li>코드를 모두 지우고 위 복사한 코드를 붙여넣기</li>
                <li>
                  함수 <code className="bg-slate-100 px-1 py-0.5 rounded text-[#1d2433]">setup</code> 선택 →{' '}
                  <b>▶ 실행</b> → 권한 허용
                </li>
                <li>
                  <b>배포 → 새 배포 → 웹 앱</b>
                  <br />
                  <span className="text-xs text-[#5f6b80]">
                    실행: <code>나</code> · 액세스: <code>모든 사용자</code>
                  </span>
                </li>
                <li>
                  나온 <b>웹 앱 URL</b>을 왼쪽에 붙여넣고 <b>연동하기</b>
                </li>
              </ol>
            </div>

            {/* Change PIN Panel */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-[#dfe4ee] space-y-3">
              <h2 className="text-lg font-bold text-[#1d2433]">🔑 관리자 비밀번호 변경</h2>
              <div>
                <label className="block text-xs font-bold text-[#1d2433] mb-1">
                  새 비밀번호 (숫자 4~8자리)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={newPin1}
                  onChange={(e) => setNewPin1(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe4ee] px-3.5 py-2 text-sm focus:border-[#2f6fed] focus:ring-2 focus:ring-[#e7efff] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1d2433] mb-1">한 번 더</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={newPin2}
                  onChange={(e) => setNewPin2(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe4ee] px-3.5 py-2 text-sm focus:border-[#2f6fed] focus:ring-2 focus:ring-[#e7efff] outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleChangePin}
                className="py-2.5 px-5 rounded-xl bg-[#2f6fed] hover:bg-[#2558be] text-white font-bold text-sm shadow transition-colors cursor-pointer"
              >
                변경
              </button>

              {pinChangeMsg && (
                <div
                  className={`text-sm font-semibold ${
                    pinChangeMsg.ok ? 'text-[#1f9d55]' : 'text-[#d64545]'
                  }`}
                >
                  {pinChangeMsg.text}
                </div>
              )}

              <p className="text-xs text-[#5f6b80]">
                {!Api.isDemo
                  ? '구글 스프레드시트에 저장된 비밀번호가 바뀝니다. 모든 기기에 적용됩니다.'
                  : '데모 모드의 비밀번호가 바뀝니다.'}
              </p>
            </div>

            {/* Reset Demo Data Panel */}
            {Api.isDemo && (
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-[#dfe4ee] space-y-3">
                <h2 className="text-lg font-bold text-[#1d2433]">🧪 데모 데이터</h2>
                <p className="text-xs sm:text-sm text-[#5f6b80] leading-relaxed">
                  연동 전에는 이 브라우저에만 저장되는 가상 데이터(교직원 6명)로 동작합니다.
                </p>
                <button
                  type="button"
                  onClick={handleResetDemo}
                  className="py-2.5 px-4 rounded-xl border border-[#dfe4ee] text-[#d64545] hover:bg-[#fdecec] font-semibold text-sm transition-colors"
                >
                  데모 데이터 초기화
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
