import { JwtPayload } from "../utils/jwt.util";

declare module "fastify" {
  interface FastifyRequest {
    admin?: JwtPayload;
  }
}
