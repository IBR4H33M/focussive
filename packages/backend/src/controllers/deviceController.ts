// ============================================================
// Focussive Backend — Device Controller
// ============================================================

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import supabase from '../config/supabase';
import { AppError } from '../middleware/errorHandler';
import type { AuthRequest } from '../middleware/auth';

// An extension is considered "connected" if it pinged within the last 60 seconds
const HEARTBEAT_THRESHOLD_MS = 60_000;

export function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'Unknown';
}

export function parseUserAgent(ua: string) {
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';

  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return { browser, os };
}

export function parseDeviceRecord(d: any) {
  let info: Record<string, any> = {};
  if (d.device_token && typeof d.device_token === 'string') {
    try {
      if (d.device_token.startsWith('{')) {
        info = JSON.parse(d.device_token);
      }
    } catch {
      // not json
    }
  }
  if (d.device_info && typeof d.device_info === 'object') {
    info = { ...info, ...d.device_info };
  }

  const lastSeen = d.last_seen_at || info.last_seen_at || d.created_at;
  const isOnline = lastSeen
    ? Date.now() - new Date(lastSeen).getTime() < HEARTBEAT_THRESHOLD_MS
    : false;

  return {
    id: d.id,
    user_id: d.user_id,
    device_type: d.device_type,
    device_name: d.device_name || `${info.browser || 'Browser'} on ${info.os || 'Desktop'}`,
    device_info: info,
    last_seen_at: lastSeen,
    created_at: d.created_at,
    is_online: isOnline,
  };
}

// POST /devices/register
export async function registerDevice(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { device_type, device_token, device_name, device_info } = req.body;

  if (!device_type) {
    throw new AppError('device_type is required', 400, 'VALIDATION_ERROR');
  }

  if (!['mobile', 'extension'].includes(device_type)) {
    throw new AppError('device_type must be "mobile" or "extension"', 400, 'VALIDATION_ERROR');
  }

  // For extensions, remove any previous extension device for this user (only one allowed)
  if (device_type === 'extension') {
    await supabase
      .from('devices')
      .delete()
      .eq('user_id', userId)
      .eq('device_type', 'extension');
  }

  const userAgent = req.headers['user-agent'] || '';
  const parsedUa = parseUserAgent(userAgent);
  const ip = getClientIp(req);

  const fullDeviceInfo = {
    ip,
    browser: parsedUa.browser,
    os: parsedUa.os,
    user_agent: userAgent,
    last_seen_at: new Date().toISOString(),
    paired_at: new Date().toISOString(),
    ...(device_info && typeof device_info === 'object' ? device_info : {}),
  };

  const name =
    device_name ||
    `${fullDeviceInfo.browser} on ${fullDeviceInfo.os}`;

  const deviceId = uuidv4();
  const tokenPayload = JSON.stringify(fullDeviceInfo);

  const { data: device, error } = await supabase
    .from('devices')
    .insert({
      id: deviceId,
      user_id: userId,
      device_type,
      device_token: device_token && typeof device_token === 'string' && !device_token.startsWith('{')
        ? device_token
        : tokenPayload,
      device_name: name,
    })
    .select()
    .single();

  if (error || !device) {
    throw new AppError('Failed to register device', 500, 'CREATE_ERROR');
  }

  res.status(201).json(parseDeviceRecord(device));
}

// GET /devices — list all devices for the authenticated user
export async function listDevices(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { data: devices, error } = await supabase
    .from('devices')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError('Failed to fetch devices', 500, 'FETCH_ERROR');
  }

  const annotated = (devices || []).map(parseDeviceRecord);
  res.json({ data: annotated });
}

// GET /devices/extension/status — quick check for extension connection
export async function extensionStatus(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { data: devices, error } = await supabase
    .from('devices')
    .select('*')
    .eq('user_id', userId)
    .eq('device_type', 'extension')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !devices || devices.length === 0) {
    // No extension paired
    res.json({
      paired: false,
      connected: false,
      device: null,
    });
    return;
  }

  const parsed = parseDeviceRecord(devices[0]);

  res.json({
    paired: true,
    connected: parsed.is_online,
    device: {
      id: parsed.id,
      device_name: parsed.device_name,
      device_info: parsed.device_info,
      last_seen_at: parsed.last_seen_at,
      created_at: parsed.created_at,
    },
  });
}

// POST /devices/heartbeat — extension pings this every ~30s
export async function heartbeat(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { device_id, device_info } = req.body;

  const now = new Date().toISOString();
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const parsedUa = parseUserAgent(userAgent);

  // Fetch current extension device to preserve existing info
  let findQuery = supabase
    .from('devices')
    .select('*')
    .eq('user_id', userId)
    .eq('device_type', 'extension');

  if (device_id) {
    findQuery = findQuery.eq('id', device_id);
  }

  const { data: devices } = await findQuery.limit(1);
  const existing = devices?.[0];

  let existingInfo: Record<string, any> = {};
  if (existing?.device_token && existing.device_token.startsWith('{')) {
    try {
      existingInfo = JSON.parse(existing.device_token);
    } catch {
      // ignore
    }
  }

  const mergedInfo = {
    ...existingInfo,
    ip,
    browser: parsedUa.browser,
    os: parsedUa.os,
    user_agent: userAgent,
    last_seen_at: now,
    ...(device_info && typeof device_info === 'object' ? device_info : {}),
  };

  const deviceName = `${mergedInfo.browser} on ${mergedInfo.os}`;
  const tokenPayload = JSON.stringify(mergedInfo);

  let updateQuery = supabase
    .from('devices')
    .update({
      device_token: tokenPayload,
      device_name: deviceName,
    })
    .eq('user_id', userId)
    .eq('device_type', 'extension');

  if (device_id) {
    updateQuery = updateQuery.eq('id', device_id);
  }

  const { error } = await updateQuery;

  if (error) {
    throw new AppError('Failed to update heartbeat', 500, 'UPDATE_ERROR');
  }

  res.json({ status: 'ok', last_seen_at: now });
}

// DELETE /devices/:id — unpair/remove a device
export async function removeDevice(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;

  const { error } = await supabase
    .from('devices')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new AppError('Failed to remove device', 500, 'DELETE_ERROR');
  }

  res.status(204).send();
}
