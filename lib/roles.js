// Kept out of app/(site)/admin/actions.js on purpose: a 'use server' module may
// only export async functions, so constants exported from there are a build
// error. Both the server actions and the client picker import from here.

export const ROLES = ['user', 'admin', 'super_admin'];

export const ROLE_LABELS = {
  user: '普通用户',
  admin: '管理员',
  super_admin: '超级管理员'
};

export const canUpload = (role) => role === 'admin' || role === 'super_admin';

export const canManage = (viewer) => canUpload(viewer?.role);
