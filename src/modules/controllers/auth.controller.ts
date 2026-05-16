import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  googleLoginService,
  emailLoginService,
  registerService,
  refreshTokenService,
  getMeService,
  devCreateAdminService,
} from "../../shared/services/auth.service";
import { successResponse } from "../../shared/utils/response.util";

const googleLoginSchema = z.object({ credential: z.string().min(1) });

const emailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  username: z.string().min(2).max(50),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

const devAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(2).max(50),
});

export async function googleLoginController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { credential } = googleLoginSchema.parse(request.body);
  const result = await googleLoginService(credential);
  return reply.status(200).send(successResponse(result, "Login successful"));
}

export async function emailLoginController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { email, password } = emailLoginSchema.parse(request.body);
  const result = await emailLoginService(email, password);
  return reply.status(200).send(successResponse(result, "Login successful"));
}

export async function registerController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { email, password, username } = registerSchema.parse(request.body);
  const result = await registerService(email, password, username);
  return reply
    .status(201)
    .send(successResponse(result, "Registration successful"));
}

export async function refreshTokenController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { refreshToken } = refreshSchema.parse(request.body);
  const result = await refreshTokenService(refreshToken);
  return reply.status(200).send(successResponse(result, "Token refreshed"));
}

export async function getMeController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await getMeService(request.admin!.userId);
  return reply.status(200).send(successResponse(user, "Profile fetched"));
}

export async function devCreateAdminController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { email, password, username } = devAdminSchema.parse(request.body);
  const result = await devCreateAdminService(email, password, username);
  return reply.status(200).send(successResponse(result, result.message));
}
