import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.config";
import { userRepository } from "../repositories/user.repository";
import { IUserDocument } from "../models/user.model";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.util";
import {
  hashPassword,
  comparePassword,
} from "../utils/password.util";
import { buildEffectivePermissions } from "../../access";
import { ApiError } from "../errors/ApiError";

const oauthClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

function buildTokenPair(user: IUserDocument) {
  const permissions = buildEffectivePermissions({
    role: user.role,
    permissionOverrides: user.permissionOverrides,
  });

  const accessToken = signAccessToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    roles: user.roles ?? [],
    permissions,
    region: user.region,
  });
  const refreshToken = signRefreshToken(user._id.toString());
  return { accessToken, refreshToken };
}

export function sanitizeUser(user: IUserDocument) {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    role: user.role,
    roles: user.roles,
    permissions: buildEffectivePermissions({
      role: user.role,
      permissionOverrides: user.permissionOverrides,
    }),
    avatar: user.avatar,
    isActive: user.isActive,
  };
}

export async function googleLoginService(credential: string) {
  const ticket = await oauthClient.verifyIdToken({
    idToken: credential,
    audience: env.GOOGLE_CLIENT_ID!,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw ApiError.badRequest("Invalid Google credential — no email found");
  }

  let user = await userRepository.findByGoogleId(payload.sub);

  if (!user) {
    user = await userRepository.findByEmail(payload.email);
    if (user) {
      user.googleId = payload.sub;
      if (!user.avatar && payload.picture) user.avatar = payload.picture;
      await user.save();
    } else {
      user = await userRepository.create({
        email: payload.email,
        username: payload.name ?? payload.email.split("@")[0],
        googleId: payload.sub,
        avatar: payload.picture,
        role: "user",
        roles: [],
        isVendor: false,
        isActive: true,
      });
    }
  }

  if (!user.isActive) throw ApiError.forbidden("Account is deactivated");

  return { tokens: buildTokenPair(user), user: sanitizeUser(user) };
}

export async function emailLoginService(email: string, password: string) {
  const user = await userRepository.findByEmailWithPassword(email);
  if (!user || !user.password)
    throw ApiError.unauthorized("Invalid email or password");

  const valid = await comparePassword(password, user.password);
  if (!valid) throw ApiError.unauthorized("Invalid email or password");

  if (!user.isActive) throw ApiError.forbidden("Account is deactivated");

  return { tokens: buildTokenPair(user), user: sanitizeUser(user) };
}

export async function registerService(
  email: string,
  password: string,
  username: string,
) {
  const existing = await userRepository.findByEmail(email);
  if (existing) throw ApiError.conflict("Email is already registered");

  const hashed = await hashPassword(password);
  const user = await userRepository.create({
    email,
    username,
    password: hashed,
    role: "user",
    roles: [],
    isVendor: false,
    isActive: true,
  });

  return { tokens: buildTokenPair(user), user: sanitizeUser(user) };
}

export async function refreshTokenService(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const user = await userRepository.findById(payload.userId);
  if (!user) throw ApiError.unauthorized("User not found");
  if (!user.isActive) throw ApiError.forbidden("Account is deactivated");

  return { tokens: buildTokenPair(user), user: sanitizeUser(user) };
}

export async function getMeService(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  return sanitizeUser(user);
}

export async function devCreateAdminService(
  email: string,
  password: string,
  username: string,
) {
  if (env.NODE_ENV !== "development") {
    throw ApiError.forbidden(
      "This endpoint is only available in development mode",
    );
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    const promoted = await userRepository.promoteToAdmin(email);
    if (!promoted) throw ApiError.internal("Failed to promote user to admin");
    return {
      message: "Existing user promoted to admin",
      user: sanitizeUser(promoted),
    };
  }

  const hashed = await hashPassword(password);
  const user = await userRepository.create({
    email,
    username,
    password: hashed,
    role: "admin",
    roles: [],
    isVendor: false,
    isActive: true,
  });

  return { message: "Admin account created", user: sanitizeUser(user) };
}
