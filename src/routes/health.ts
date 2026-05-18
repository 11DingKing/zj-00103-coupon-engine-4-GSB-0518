import { FastifyInstance } from "fastify";
import { AppDataSource } from "../data-source";

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (request, reply) => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: AppDataSource.isInitialized ? "connected" : "disconnected",
    };
  });
}
