export type ApiError = { code: string; message: string };
export type User = { id: string; username: string; displayName: string };
export type BoardElement = {
  id: string;
  type: "text" | "image";
  text?: string;
  imageId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  lit: boolean;
};
export type Board = {
  version: number;
  height: number;
  elements: BoardElement[];
};
export type ImageInfo = {
  id: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
};
export type Checkin = { id: string; requestId: string; createdAt: string };
export type Task = {
  id: string;
  weekId: string;
  title: string;
  target: number;
  priority: "important" | "normal";
  order: number;
  version: number;
  checkins: Checkin[];
};
export type Week = {
  id: string;
  startDate: string;
  endDate: string;
  goal: string;
  version: number;
  tasks: Task[];
};
export type Journal = {
  id: string;
  date: string;
  body: string;
  createdAt: string;
  version: number;
};
export type ExportJob = {
  id: string;
  status: "pending" | "running" | "ready" | "failed" | "expired";
  createdAt: string;
  expiresAt: string;
  error?: string;
};
