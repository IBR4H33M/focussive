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

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export enum ViolationAction {
  ALLOW_ANYWAY = 'allow_anyway',
  MARK_NECESSARY = 'mark_necessary',
  CLOSED = 'closed',
}

export enum DeviceType {
  MOBILE = 'mobile',
  EXTENSION = 'extension',
}

export type SubscriptionTier = 'free' | 'premium' | 'trial';
export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'cancelled';

export interface User {
  id: string;
  clerk_id?: string;
  email: string;
  name: string;
  password_hash?: string;
  age?: number;
  avatar_url?: string;
  email_verified?: boolean;
  subscription_tier?: SubscriptionTier;
  subscription_status?: SubscriptionStatus;
  trial_used?: boolean;
  trial_ends_at?: string | null;
  revenuecat_customer_id?: string;
  overlay_quote_enabled?: boolean;
  overlay_gif_enabled?: boolean;
  overlay_gif_url?: string;
  monthly_skip_limit?: number;
  skips_used_this_month?: number;
  skips_remaining?: number;
  active_archetype?: string | null;
  earned_badges?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionStatusResponse {
  is_premium: boolean;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  is_trial_active: boolean;
  trial_used: boolean;
  trial_ends_at?: string | null;
  trial_days_remaining: number;
}

export interface SkipStatusResponse {
  monthly_skip_limit: number;
  skips_used_this_month: number;
  skips_remaining: number;
}

export interface SessionTimeSlot {
  start_time: string; // HH:mm format
  end_time: string;   // HH:mm format
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
  time_slots?: SessionTimeSlot[];
  skipped_until?: string | null;
  mobile_focus: boolean;
  browser_focus: boolean;
  app_group_ids?: string[];
  blocked_websites?: string[];
  website_group_ids?: string[];
  // Break settings
  allow_breaks: boolean;
  max_break_minutes?: number;
  break_used_seconds: number;
  status: SessionStatus | string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SessionBreak {
  id: string;
  session_id: string;
  user_id: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  source: 'manual' | 'violation';
  created_at: string;
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

export type QualityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

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
  app_violations_count: number;
  web_violations_count: number;
  quality_tier?: QualityTier;
  breaks_count?: number;
  emergency_breaks_count?: number;
  is_on_schedule?: boolean;
  blocked_apps?: string[];
  apps_count?: number;
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
  app_group_ids?: string[];
  blocked_websites?: string[];
  allow_breaks?: boolean;
  max_break_minutes?: number;
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

export interface CreateBreakRequest {
  source?: 'manual' | 'violation';
}

export interface EndBreakRequest {
  break_id: string;
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

// --- Motivational Productivity Quotes for Block Overlay ---

export const MOTIVATIONAL_QUOTES: string[] = [
  "Focus is a muscle. Every time you resist a distraction, you make it stronger.",
  "You do not rise to the level of your goals. You fall to the level of your systems. — James Clear",
  "The secret of getting ahead is getting started. — Mark Twain",
  "It is not that we have a short time to live, but that we waste a lot of it. — Seneca",
  "Action is the foundational key to all success. — Pablo Picasso",
  "Do what you have to do until you can do what you want to do. — Oprah Winfrey",
  "Starve your distractions, feed your focus.",
  "Your future is created by what you do today, not tomorrow.",
  "Deep work is the ability to focus without distraction on a cognitively demanding task. — Cal Newport",
  "Stay focused, go after your dreams, and keep moving toward your goals.",
  "You can have results or excuses. Not both.",
  "Small disciplines repeated with consistency every day lead to great achievements.",
  "Don't count the days, make the days count. — Muhammad Ali",
  "Discipline is choosing between what you want now and what you want most. — Abraham Lincoln",
  "Turn down the noise. Focus on what truly moves the needle.",
];
