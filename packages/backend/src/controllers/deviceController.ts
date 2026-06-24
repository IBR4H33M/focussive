// ============================================================
// Focussive Backend — Device Controller
// ============================================================

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import supabase from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';

// POST /devices/register
export async function registerDevice(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { device_type, device_token, device_name } = req.body;

  if (!device_type) {
    throw new AppError('device_type is required', 400, 'VALIDATION_ERROR');
  }

  if (!['mobile', 'extension'].includes(device_type)) {
    throw new AppError('device_type must be "mobile" or "extension"', 400, 'VALIDATION_ERROR');
  }

  const { data: device, error } = await supabase
    .from('devices')
    .insert({
      id: uuidv4(),
      user_id: userId,
      device_type,
      device_token: device_token || null,
      device_name: device_name || null,
    })
    .select()
    .single();

  if (error || !device) {
    throw new AppError('Failed to register device', 500, 'CREATE_ERROR');
  }

  res.status(201).json(device);
}

// DELETE /devices/:id
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
