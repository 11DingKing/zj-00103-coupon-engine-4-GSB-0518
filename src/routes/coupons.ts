import { FastifyInstance } from "fastify";
import { Repository } from "typeorm";
import { Coupon } from "../entities/Coupon";
import { AppDataSource } from "../data-source";
import { authenticate, requireAdmin } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";

export async function couponRoutes(fastify: FastifyInstance) {
  const couponRepository: Repository<Coupon> = AppDataSource.getRepository(Coupon);

  fastify.get("/", async (request, reply) => {
    const coupons = await couponRepository.find({
      where: { isActive: true },
      relations: ["batch"],
    });
    return coupons;
  });

  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const coupon = await couponRepository.findOne({
      where: { id: parseInt(id) },
      relations: ["batch"],
    });
    if (!coupon) {
      return reply.code(404).send({ message: "Coupon not found" });
    }
    return coupon;
  });

  fastify.post<{
    Body: Partial<Coupon>;
  }>(
    "/",
    { preHandler: [authenticate, requireAdmin] },
    async (request: AuthenticatedRequest & { Body: Partial<Coupon> }, reply) => {
      const coupon = couponRepository.create(request.body);
      await couponRepository.save(coupon);
      return reply.code(201).send(coupon);
    }
  );

  fastify.put<{
    Params: { id: string };
    Body: Partial<Coupon>;
  }>(
    "/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const coupon = await couponRepository.findOneBy({ id: parseInt(id) });
      if (!coupon) {
        return reply.code(404).send({ message: "Coupon not found" });
      }
      couponRepository.merge(coupon, request.body);
      await couponRepository.save(coupon);
      return coupon;
    }
  );

  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const result = await couponRepository.delete(parseInt(id));
      if (result.affected === 0) {
        return reply.code(404).send({ message: "Coupon not found" });
      }
      return reply.code(204).send();
    }
  );
}
