import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';

let cachedApp: Express | null = null;

export const getApp = (): Express => {
  if (!cachedApp) cachedApp = buildApp();
  return cachedApp;
};

/**
 * Truncate every domain table in dependency-safe order. Sessions are kept
 * because removing them mid-test invalidates supertest agents that hold
 * cookies.
 */
export const truncateAll = async (): Promise<void> => {
  // Order matters: children before parents.
  await prisma.gameMember.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.creation.deleteMany();
  await prisma.game.deleteMany();
  await prisma.group.deleteMany();
  await prisma.userSetting.deleteMany();
  // Profiles are owned by Users, deleting users cascades to profiles+setting.
  await prisma.session.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.user.deleteMany();
};

/**
 * Returns a Supertest agent that persists cookies between calls. Each call
 * to this helper creates a fresh user + agent so tests don't share state.
 */
export interface AuthedAgent {
  agent: ReturnType<typeof request.agent>;
  user: { id: string; email: string; username: string };
}

export const registerAndAuth = async (
  overrides: Partial<{ email: string; username: string; password: string }> = {},
): Promise<AuthedAgent> => {
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = overrides.email ?? `user_${suffix}@test.local`;
  const username = overrides.username ?? `user_${suffix}`;
  const password = overrides.password ?? 'hunter2hunter2';

  const app = getApp();
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, username, password })
    .expect(201);

  return { agent, user: res.body.user };
};

export const closeDb = async (): Promise<void> => {
  await prisma.$disconnect();
};
