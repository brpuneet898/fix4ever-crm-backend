import jwt from "jsonwebtoken";
import { env } from "../../config/env.config";

export interface JwtPayload {
  userId: string;
  email: string;
  /** Base role: user | vendor | admin | captain */
  role: string;
  /** Assignable admin sub-roles: crm_manager | regional_manager | editor */
  roles: string[];
  /** Merged deduplicated permissions from role + all assigned sub-roles */
  permissions: string[];
  /** For regional_manager: scoped region */
  region?: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET!, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_REFRESH_SECRET!, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET!) as unknown as JwtPayload;
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET!) as unknown as {
    userId: string;
  };
}
