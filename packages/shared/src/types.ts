// ============================================================
// Focussive — Shared Type Definitions
// ============================================================

// --- Enums ---

export enum SessionStatus {
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ScheduleType {
  TODAY = 'today',
  SCHEDULED = 'scheduled',   // specific calendar dates (replaces SPECIFIC_DAYS)
  RECURRING = 'recurring',   // repeats weekly on schedule_days (weekdays)
}

/** @deprecated Use ScheduleType.SCHEDULED */
export const SPECIFIC_DAYS = 'specific_days';

export enum Weekday {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday',
}

export enum ViolationAction {
  ALLOW_ANYWAY = 'allow_anyway',
  MARK_NECESSARY = 'mark_necessary',
  CLOSED = 'closed',
}

export enum DeviceType {
  MOBILE = 'mobile',
  EXTENSION = 'extension',
}

// --- Database Models ---

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  age?: number;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  name: string;
  duration: number; // minutes
  schedule: ScheduleType | string;
  /** RECURRING: weekday strings. SCHEDULED: ISO date strings ("2026-07-01"). TODAY: empty. */
  schedule_days: string[];
  start_time: string; // HH:mm format
  mobile_focus: boolean;
  browser_focus: boolean;
  app_group_id?: string;
  blocked_websites?: string[];
  website_group_ids?: string[];
  pause_count?: number;
  status: SessionStatus | string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Violation {
  id: string;
  session_id: string;
  user_id: string;
  app_name?: string;
  website_name?: string;
  timestamp: string;
  duration_seconds: number;
  action_taken: ViolationAction;
  created_at: string;
}

export interface AppGroup {
  id: string;
  user_id: string;
  name: string;
  apps: AppInfo[];
  created_at: string;
  updated_at: string;
}

export interface AppInfo {
  id: string;
  name: string;
  package_name?: string;
  icon?: string;
}

export interface WebsiteGroup {
  id: string;
  user_id: string;
  name: string;
  websites: string[];
  is_default: boolean;
  created_at: string;
}

export interface Device {
  id: string;
  user_id: string;
  device_type: DeviceType;
  device_token?: string;
  device_name?: string;
  created_at: string;
}

export interface QRCode {
  id: string;
  user_id: string;
  code: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}

export interface SessionHistory {
  id: string;
  session_id: string;
  user_id: string;
  session_name: string;
  scheduled_duration: number;
  actual_duration?: number;
  start_time: string;
  end_time?: string;
  status: SessionStatus;
  violations_count: number;
  cancellation_reason?: string;
  cancelled_at?: string;
  created_at: string;
}

// --- API Request Types ---

export interface SignupRequest {
  email: string;
  name: string;
  password: string;
  passwordConfirm: string;
  age?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface QRLoginRequest {
  code: string;
  device_type: DeviceType;
}

export interface CreateSessionRequest {
  name: string;
  duration: number;
  schedule: ScheduleType;
  schedule_days?: Weekday[];
  start_time: string;
  mobile_focus: boolean;
  browser_focus: boolean;
  app_group_id?: string;
  blocked_websites?: string[];
}

export interface UpdateSessionRequest extends Partial<CreateSessionRequest> {}

export interface CancelSessionRequest {
  reason?: string;
}

export interface CreateViolationRequest {
  session_id: string;
  app_name?: string;
  website_name?: string;
  duration_seconds: number;
  action_taken: ViolationAction;
}

export interface CreateAppGroupRequest {
  name: string;
  apps: AppInfo[];
}

export interface UpdateAppGroupRequest extends Partial<CreateAppGroupRequest> {}

export interface UpdateProfileRequest {
  name?: string;
  age?: number;
}

export interface UpdatePasswordRequest {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
}

export interface RegisterDeviceRequest {
  device_type: DeviceType;
  device_token?: string;
  device_name?: string;
}

export interface ExportHistoryRequest {
  session_ids?: string[];
  start_date?: string;
  end_date?: string;
}

// --- API Response Types ---

export interface AuthResponse {
  user: Omit<User, 'password_hash'>;
  token: string;
  refresh_token: string;
}

export interface ApiError {
  error: string;
  code: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ViolationStats {
  total_violations: number;
  by_action: Record<ViolationAction, number>;
  most_violated_apps: Array<{ name: string; count: number }>;
  most_violated_websites: Array<{ name: string; count: number }>;
  average_duration_seconds: number;
}

export interface SessionWithViolations extends Session {
  violations: Violation[];
  violations_count: number;
}

// --- Predefined App List ---

export const PREDEFINED_APPS: AppInfo[] = [
  { id: 'youtube', name: 'YouTube', package_name: 'com.google.android.youtube', icon: '📺' },
  { id: 'tiktok', name: 'TikTok', package_name: 'com.zhiliaoapp.musically', icon: '🎵' },
  { id: 'instagram', name: 'Instagram', package_name: 'com.instagram.android', icon: '📸' },
  { id: 'twitter', name: 'Twitter/X', package_name: 'com.twitter.android', icon: '🐦' },
  { id: 'reddit', name: 'Reddit', package_name: 'com.reddit.frontpage', icon: '🔴' },
  { id: 'discord', name: 'Discord', package_name: 'com.discord', icon: '💬' },
  { id: 'snapchat', name: 'Snapchat', package_name: 'com.snapchat.android', icon: '👻' },
  { id: 'facebook', name: 'Facebook', package_name: 'com.facebook.katana', icon: '📘' },
  { id: 'whatsapp', name: 'WhatsApp', package_name: 'com.whatsapp', icon: '💚' },
  { id: 'telegram', name: 'Telegram', package_name: 'org.telegram.messenger', icon: '✈️' },
  { id: 'netflix', name: 'Netflix', package_name: 'com.netflix.mediaclient', icon: '🎬' },
  { id: 'spotify', name: 'Spotify', package_name: 'com.spotify.music', icon: '🎧' },
  { id: 'twitch', name: 'Twitch', package_name: 'tv.twitch.android.app', icon: '🟣' },
  { id: 'pinterest', name: 'Pinterest', package_name: 'com.pinterest', icon: '📌' },
  { id: 'linkedin', name: 'LinkedIn', package_name: 'com.linkedin.android', icon: '💼' },
];

// --- Predefined Blocked Websites ---

export const PREDEFINED_BLOCKED_WEBSITES: string[] = [
  'youtube.com',
  'tiktok.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'discord.com',
  'snapchat.com',
  'facebook.com',
  'netflix.com',
  'twitch.tv',
  'pinterest.com',
  'linkedin.com',
  'tumblr.com',
  '9gag.com',
];
