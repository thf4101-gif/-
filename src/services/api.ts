import {
  Student,
  Task,
  SubmissionRecord,
  StudentDataResponse,
  DashboardResponse,
  SubmitPayload,
  SubmitResponse,
  VerifyPinResponse,
  AppConfig,
} from '../types';

export const URL_KEY = 'trainingCertificateTracker.apiUrl';
export const DEMO_KEY = 'trainingCertificateTracker.demo.v1';
export const SESSION_PIN_KEY = 'trainingAdminPin';

export const defaultConfig: AppConfig = {
  title: '교직원 연수 이수증 수합',
  className: '',
  apiUrl: '',
};

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null): void {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {}
  },
};

export const sessionStore = {
  get(k: string): string | null {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null): void {
    try {
      if (v == null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    } catch {}
  },
};

const p2 = (n: number) => String(n).padStart(2, '0');

export const fmtDate = (d: Date): string =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(
    d.getMinutes()
  )}:${p2(d.getSeconds())}`;

export const fmtDue = (s: string | undefined): string => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(s || '');
  return m ? `${+m[1]}/${+m[2]}` : s || '';
};

export const isLate = (dueStr: string | undefined): boolean => {
  if (!dueStr || !/^\d{4}-\d{2}-\d{2}$/.test(dueStr)) return false;
  const today = fmtDate(new Date()).slice(0, 10);
  return dueStr < today;
};

/* ───── 구글 시트 API 연동 ───── */
async function remote<T>(url: string, action: string, params: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action, ...params }),
    });
  } catch {
    throw new Error('구글 스프레드시트에 연결할 수 없습니다. 인터넷 연결과 웹 앱 URL을 확인하세요.');
  }

  let j: { ok: boolean; data: T; error?: string; code?: string };
  try {
    j = await res.json();
  } catch {
    throw new Error('구글 시트 응답을 읽을 수 없습니다. 웹 앱 URL과 배포 설정(액세스: 모든 사용자)을 확인하세요.');
  }

  if (!j.ok) {
    const err = new Error(j.error || '알 수 없는 오류') as Error & { code?: string };
    err.code = j.code;
    throw err;
  }
  return j.data;
}

/* ───── 데모 (브라우저 로컬 저장소) ───── */
interface DemoDatabase {
  pin: string;
  students: Student[];
  tasks: Task[];
  records: SubmissionRecord[];
}

let mem: DemoDatabase | null = null;

function dsave(d: DemoDatabase): void {
  mem = d;
  store.set(DEMO_KEY, JSON.stringify(d));
}

function dload(): DemoDatabase {
  const s = store.get(DEMO_KEY);
  if (s) {
    try {
      mem = JSON.parse(s);
      if (mem) return mem;
    } catch {}
  }
  if (mem) return mem;

  const names = '예시교직원A 예시교직원B 예시교직원C 예시교직원D 예시교직원E 예시교직원F'.split(' ');
  const today = new Date();
  const day = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return fmtDate(d).slice(0, 10);
  };

  const d: DemoDatabase = {
    pin: '1234',
    students: names.map((n, i) => ({ no: String(i + 1), name: n })),
    tasks: [
      { name: '개인정보 보호 연수', due: day(-1) },
      { name: '아동학대 신고의무자 교육', due: day(2) },
      { name: '장애인식 개선 교육', due: day(4) },
      { name: '청렴 교육', due: day(7) },
    ],
    records: [],
  };
  dsave(d);
  return d;
}

function pinErr(): Error & { code: string } {
  const e = new Error('비밀번호가 올바르지 않습니다. (데모 비밀번호: 1234)') as Error & { code: string };
  e.code = 'PIN';
  return e;
}

const hasRecord = (d: DemoDatabase, no: string, name: string, task: string) =>
  d.records.some((r) => r.no === no && r.name === name && r.task === task);

export const Api = {
  get url(): string {
    const v = store.get(URL_KEY);
    if (v === 'demo') return '';
    return v || defaultConfig.apiUrl || '';
  },

  get isDemo(): boolean {
    return !this.url;
  },

  setUrl(u: string): void {
    store.set(URL_KEY, u ? u.trim() : 'demo');
  },

  async getStudentData(): Promise<StudentDataResponse> {
    if (this.url) {
      return remote<StudentDataResponse>(this.url, 'getStudentData');
    }
    await new Promise((r) => setTimeout(r, 120));
    const d = dload();
    return {
      students: d.students,
      tasks: d.tasks,
      records: d.records,
    };
  },

  async submit(payload: SubmitPayload): Promise<SubmitResponse> {
    if (this.url) {
      return remote<SubmitResponse>(this.url, 'submit', payload as unknown as Record<string, unknown>);
    }
    await new Promise((r) => setTimeout(r, 150));
    const d = dload();
    const time = fmtDate(new Date());
    const added: string[] = [];
    const dups: string[] = [];

    payload.tasks.forEach((t) => {
      if (hasRecord(d, payload.no, payload.name, t)) {
        dups.push(t);
      } else {
        added.push(t);
        d.records.push({
          time,
          no: payload.no,
          name: payload.name,
          task: t,
          memo: '',
        });
      }
    });

    dsave(d);
    return { added, dups, time };
  },

  async verifyPin(pin: string): Promise<VerifyPinResponse> {
    if (this.url) {
      return remote<VerifyPinResponse>(this.url, 'verifyPin', { pin });
    }
    await new Promise((r) => setTimeout(r, 120));
    const d = dload();
    if (String(pin) !== d.pin) throw pinErr();
    return { sheetName: '', sheetUrl: '' };
  },

  async getDashboard(pin: string): Promise<DashboardResponse> {
    if (this.url) {
      return remote<DashboardResponse>(this.url, 'getDashboard', { pin });
    }
    await new Promise((r) => setTimeout(r, 150));
    const d = dload();
    if (String(pin) !== d.pin) throw pinErr();
    return {
      students: d.students,
      tasks: d.tasks,
      records: d.records,
      updated: fmtDate(new Date()).slice(11),
      sheetName: '',
      sheetUrl: '',
    };
  },

  async toggleRecord(params: { pin: string; no: string; name: string; task: string }): Promise<{ submitted: boolean }> {
    if (this.url) {
      return remote<{ submitted: boolean }>(this.url, 'toggleRecord', params as unknown as Record<string, unknown>);
    }
    await new Promise((r) => setTimeout(r, 120));
    const d = dload();
    if (String(params.pin) !== d.pin) throw pinErr();
    const i = d.records.findIndex((r) => r.no === params.no && r.name === params.name && r.task === params.task);
    if (i >= 0) {
      d.records.splice(i, 1);
      dsave(d);
      return { submitted: false };
    } else {
      d.records.push({
        time: fmtDate(new Date()),
        no: params.no,
        name: params.name,
        task: params.task,
        memo: '담당자 확인',
      });
      dsave(d);
      return { submitted: true };
    }
  },

  async addTask(params: { pin: string; name: string; due: string }): Promise<Task[]> {
    if (this.url) {
      return remote<Task[]>(this.url, 'addTask', params as unknown as Record<string, unknown>);
    }
    await new Promise((r) => setTimeout(r, 120));
    const d = dload();
    if (String(params.pin) !== d.pin) throw pinErr();
    const name = String(params.name || '').trim();
    if (!name) throw new Error('연수명을 입력하세요.');
    if (d.tasks.some((t) => t.name === name)) throw new Error('같은 이름의 연수가 이미 있습니다.');
    d.tasks.push({ name, due: params.due || '' });
    dsave(d);
    return d.tasks;
  },

  async deleteTask(params: { pin: string; name: string }): Promise<Task[]> {
    if (this.url) {
      return remote<Task[]>(this.url, 'deleteTask', params as unknown as Record<string, unknown>);
    }
    await new Promise((r) => setTimeout(r, 120));
    const d = dload();
    if (String(params.pin) !== d.pin) throw pinErr();
    d.tasks = d.tasks.filter((t) => t.name !== params.name);
    dsave(d);
    return d.tasks;
  },

  async saveStudents(params: { pin: string; students: Student[] }): Promise<Student[]> {
    if (this.url) {
      return remote<Student[]>(this.url, 'saveStudents', params as unknown as Record<string, unknown>);
    }
    await new Promise((r) => setTimeout(r, 150));
    const d = dload();
    if (String(params.pin) !== d.pin) throw pinErr();
    d.students = params.students.filter((s) => s.name);
    dsave(d);
    return d.students;
  },

  async changePin(params: { pin: string; newPin: string }): Promise<boolean> {
    if (!/^\d{4,8}$/.test(String(params.newPin))) {
      throw new Error('비밀번호는 숫자 4~8자리로 정하세요.');
    }
    if (this.url) {
      return remote<boolean>(this.url, 'changePin', params as unknown as Record<string, unknown>);
    }
    await new Promise((r) => setTimeout(r, 120));
    const d = dload();
    if (String(params.pin) !== d.pin) throw pinErr();
    d.pin = String(params.newPin);
    dsave(d);
    return true;
  },

  async test(url: string, pin: string): Promise<VerifyPinResponse> {
    return remote<VerifyPinResponse>(url.trim(), 'verifyPin', { pin });
  },

  resetDemo(): void {
    store.set(DEMO_KEY, null);
    mem = null;
    dload();
  },
  DEMO_KEY,
};
