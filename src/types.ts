export interface Student {
  no: string;
  name: string;
}

export interface Task {
  name: string;
  due: string;
}

export interface SubmissionRecord {
  time: string;
  no: string;
  name: string;
  task: string;
  memo: string;
}

export interface StudentDataResponse {
  students: Student[];
  tasks: Task[];
  records: SubmissionRecord[];
}

export interface DashboardResponse {
  students: Student[];
  tasks: Task[];
  records: SubmissionRecord[];
  updated: string;
  sheetName: string;
  sheetUrl: string;
}

export interface SubmitPayload {
  no: string;
  name: string;
  tasks: string[];
}

export interface SubmitResponse {
  added: string[];
  dups: string[];
  time: string;
}

export interface VerifyPinResponse {
  sheetName: string;
  sheetUrl: string;
}

export interface AppConfig {
  title: string;
  className: string;
  apiUrl: string;
}
