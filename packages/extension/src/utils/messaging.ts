// ============================================================
// Focussive Extension — Message Types
// ============================================================

export interface ShowOverlayMessage {
  type: 'SHOW_OVERLAY';
  sessionId: string;
  websiteName: string;
}

export interface HideOverlayMessage {
  type: 'HIDE_OVERLAY';
}

export interface ViolationResponseMessage {
  type: 'VIOLATION_RESPONSE';
  sessionId: string;
  websiteName: string;
  action: 'allow_anyway' | 'mark_necessary' | 'closed';
  durationSeconds: number;
}

export interface SessionUpdateMessage {
  type: 'SESSION_UPDATE';
  activeSession: unknown | null;
  upcomingSessions: unknown[];
}

export interface GetSessionMessage {
  type: 'GET_SESSION';
}

export type ExtensionMessage =
  | ShowOverlayMessage
  | HideOverlayMessage
  | ViolationResponseMessage
  | SessionUpdateMessage
  | GetSessionMessage;
