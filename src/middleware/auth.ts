import { FastifyReply, HookHandlerDoneFunction } from "fastify";
import { AuthenticatedRequest } from "../types";
import { UserRole } from "../entities/User";

export async function authenticate(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const user = await request.jwtVerify();
    request.user = user as any;
  } catch (err) {
    reply.code(401).send({ message: "Unauthorized" });
  }
}

export function requireAdmin(
  request: AuthenticatedRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
) {
  if (request.user.role !== UserRole.ADMIN) {
    reply.code(403).send({ message: "Forbidden: Admin role required" });
    return;
  }
  done();
}
