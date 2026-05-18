import { FastifyInstance } from "fastify";
import { Repository } from "typeorm";
import bcrypt from "bcryptjs";
import { User } from "../entities/User";
import { AppDataSource } from "../data-source";
import { authenticate } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";

export async function authRoutes(fastify: FastifyInstance) {
  const userRepository: Repository<User> = AppDataSource.getRepository(User);

  fastify.post<{
    Body: { username: string; password: string };
  }>("/login", async (request, reply) => {
    const { username, password } = request.body;

    const user = await userRepository.findOne({ where: { username } });
    if (!user) {
      return reply.code(401).send({ message: "Invalid credentials" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return reply.code(401).send({ message: "Invalid credentials" });
    }

    const token = fastify.jwt.sign({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return { token, user: { id: user.id, username: user.username, role: user.role } };
  });

  fastify.get(
    "/me",
    { preHandler: [authenticate] },
    async (request: AuthenticatedRequest, reply) => {
      return { user: request.user };
    }
  );
}
