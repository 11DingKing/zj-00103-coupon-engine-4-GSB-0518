import { FastifyInstance } from "fastify";
import { Repository } from "typeorm";
import { CouponBatch } from "../entities/CouponBatch";
import { Coupon, CouponType } from "../entities/Coupon";
import { AppDataSource } from "../data-source";
import { authenticate, requireAdmin } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";

function generateCouponCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function batchRoutes(fastify: FastifyInstance) {
  const batchRepository: Repository<CouponBatch> = AppDataSource.getRepository(CouponBatch);
  const couponRepository: Repository<Coupon> = AppDataSource.getRepository(Coupon);

  fastify.get("/", async (request, reply) => {
    const batches = await batchRepository.find({
      relations: ["coupons"],
    });
    return batches;
  });

  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const batch = await batchRepository.findOne({
      where: { id: parseInt(id) },
      relations: ["coupons"],
    });
    if (!batch) {
      return reply.code(404).send({ message: "Batch not found" });
    }
    return batch;
  });

  fastify.post<{
    Body: Partial<CouponBatch>;
  }>(
    "/",
    { preHandler: [authenticate, requireAdmin] },
    async (request: AuthenticatedRequest & { Body: Partial<CouponBatch> }, reply) => {
      const batch = batchRepository.create(request.body);
      await batchRepository.save(batch);
      return reply.code(201).send(batch);
    }
  );

  fastify.post<{
    Params: { id: string };
    Body: {
      count: number;
      couponTemplate: Partial<Coupon>;
    };
  }>(
    "/:id/generate-coupons",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const { count, couponTemplate } = request.body;

      const batch = await batchRepository.findOneBy({ id: parseInt(id) });
      if (!batch) {
        return reply.code(404).send({ message: "Batch not found" });
      }

      const coupons: Coupon[] = [];
      for (let i = 0; i < count; i++) {
        let code: string;
        let exists: boolean;
        do {
          code = generateCouponCode();
          exists = await couponRepository.exist({ where: { code } });
        } while (exists);

        const coupon = couponRepository.create({
          ...couponTemplate,
          code,
          batch,
        });
        coupons.push(coupon);
      }

      await couponRepository.save(coupons);
      return reply.code(201).send({ generated: coupons.length, coupons });
    }
  );

  fastify.put<{
    Params: { id: string };
    Body: Partial<CouponBatch>;
  }>(
    "/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const batch = await batchRepository.findOneBy({ id: parseInt(id) });
      if (!batch) {
        return reply.code(404).send({ message: "Batch not found" });
      }
      batchRepository.merge(batch, request.body);
      await batchRepository.save(batch);
      return batch;
    }
  );

  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const result = await batchRepository.delete(parseInt(id));
      if (result.affected === 0) {
        return reply.code(404).send({ message: "Batch not found" });
      }
      return reply.code(204).send();
    }
  );
}
