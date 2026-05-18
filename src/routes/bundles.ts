import { FastifyInstance } from "fastify";
import { Repository, QueryFailedError, In, OptimisticLockVersionMismatchError } from "typeorm";
import { CouponBundle } from "../entities/CouponBundle";
import { UserCouponBundle } from "../entities/UserCouponBundle";
import { Coupon } from "../entities/Coupon";
import { UserCoupon, UserCouponStatus } from "../entities/UserCoupon";
import { AppDataSource } from "../data-source";
import { authenticate, requireAdmin } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";

export async function bundleRoutes(fastify: FastifyInstance) {
  const bundleRepository: Repository<CouponBundle> = AppDataSource.getRepository(CouponBundle);
  const userBundleRepository: Repository<UserCouponBundle> = AppDataSource.getRepository(UserCouponBundle);
  const couponRepository: Repository<Coupon> = AppDataSource.getRepository(Coupon);
  const userCouponRepository: Repository<UserCoupon> = AppDataSource.getRepository(UserCoupon);

  fastify.get(
    "/",
    async (request, reply) => {
      const bundles = await bundleRepository.find({
        where: { isActive: true },
        relations: ["coupons"],
      });
      return bundles;
    }
  );

  fastify.get(
    "/all",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const bundles = await bundleRepository.find({
        relations: ["coupons"],
      });
      return bundles;
    }
  );

  fastify.get(
    "/:id",
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const bundle = await bundleRepository.findOne({
        where: { id: parseInt(id) },
        relations: ["coupons"],
      });
      if (!bundle) {
        return reply.code(404).send({ message: "Bundle not found" });
      }
      return bundle;
    }
  );

  fastify.post<{
    Body: {
      name: string;
      description?: string;
      couponIds: number[];
      startTime?: string;
      endTime?: string;
      limitPerUser: number;
      totalQuantity: number;
    };
  }>(
    "/",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const { name, description, couponIds, startTime, endTime, limitPerUser, totalQuantity } = request.body;

      const coupons = await couponRepository.find({
        where: { id: In(couponIds) },
      });

      if (coupons.length !== couponIds.length) {
        return reply.code(400).send({ message: "Some coupons not found" });
      }

      const bundle = bundleRepository.create({
        name,
        description,
        couponIds,
        coupons,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        limitPerUser,
        totalQuantity,
        claimedQuantity: 0,
        isActive: true,
      });

      await bundleRepository.save(bundle);
      return reply.code(201).send(bundle);
    }
  );

  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      couponIds?: number[];
      startTime?: string;
      endTime?: string;
      limitPerUser?: number;
      totalQuantity?: number;
      isActive?: boolean;
    };
  }>(
    "/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const bundle = await bundleRepository.findOneBy({ id: parseInt(id) });

      if (!bundle) {
        return reply.code(404).send({ message: "Bundle not found" });
      }

      const { name, description, couponIds, startTime, endTime, limitPerUser, totalQuantity, isActive } = request.body;

      if (name !== undefined) bundle.name = name;
      if (description !== undefined) bundle.description = description;
      if (startTime !== undefined) bundle.startTime = new Date(startTime);
      if (endTime !== undefined) bundle.endTime = new Date(endTime);
      if (limitPerUser !== undefined) bundle.limitPerUser = limitPerUser;
      if (totalQuantity !== undefined) bundle.totalQuantity = totalQuantity;
      if (isActive !== undefined) bundle.isActive = isActive;

      if (couponIds) {
        const coupons = await couponRepository.find({
          where: { id: In(couponIds) },
        });
        if (coupons.length !== couponIds.length) {
          return reply.code(400).send({ message: "Some coupons not found" });
        }
        bundle.couponIds = couponIds;
        bundle.coupons = coupons;
      }

      await bundleRepository.save(bundle);
      return bundle;
    }
  );

  fastify.post<{
    Body: { bundleId: number };
  }>(
    "/claim",
    { preHandler: [authenticate] },
    async (request: AuthenticatedRequest & { Body: { bundleId: number } }, reply) => {
      const { bundleId } = request.body;
      const userId = request.user.userId;

      const bundle = await bundleRepository.findOne({
        where: { id: bundleId },
        relations: ["coupons"],
      });
      if (!bundle) {
        return reply.code(404).send({ message: "Bundle not found" });
      }

      if (!bundle.isActive) {
        return reply.code(400).send({ message: "Bundle is not active" });
      }

      const now = new Date();
      if (bundle.startTime && now < bundle.startTime) {
        return reply.code(400).send({ message: "Bundle not yet valid" });
      }
      if (bundle.endTime && now > bundle.endTime) {
        return reply.code(400).send({ message: "Bundle expired" });
      }

      const maxRetries = 10;
      let retries = 0;

      while (retries < maxRetries) {
        try {
          const result = await AppDataSource.transaction(async (transactionalEntityManager) => {
            const freshBundle = await transactionalEntityManager.findOneBy(CouponBundle, { id: bundleId });

            if (!freshBundle) {
              return { status: 404, message: "Bundle not found" };
            }

            const claimedBundleCount = await transactionalEntityManager.count(UserCouponBundle, {
              where: { userId, bundleId },
            });
            if (claimedBundleCount >= freshBundle.limitPerUser) {
              return { status: 400, message: "Bundle limit reached" };
            }

            if (freshBundle.claimedQuantity >= freshBundle.totalQuantity) {
              return { status: 400, message: "Bundle out of stock" };
            }

            const coupons = await transactionalEntityManager.find(Coupon, {
              where: { id: In(freshBundle.couponIds) },
            });

            for (const coupon of coupons) {
              const freshCoupon = await transactionalEntityManager.findOneBy(Coupon, { id: coupon.id });

              if (!freshCoupon || !freshCoupon.isActive) {
                throw new Error(`Coupon ${coupon.id} is not available`);
              }

              if (freshCoupon.startTime && now < freshCoupon.startTime) {
                throw new Error(`Coupon ${coupon.id} not yet valid`);
              }
              if (freshCoupon.endTime && now > freshCoupon.endTime) {
                throw new Error(`Coupon ${coupon.id} expired`);
              }

              if (freshCoupon.claimedQuantity >= freshCoupon.totalQuantity) {
                throw new Error(`Coupon ${coupon.id} out of stock`);
              }

              freshCoupon.claimedQuantity += 1;
              await transactionalEntityManager.save(freshCoupon);

              const userCoupon = transactionalEntityManager.create(UserCoupon, {
                userId,
                couponId: coupon.id,
                status: UserCouponStatus.AVAILABLE,
              });
              await transactionalEntityManager.save(userCoupon);
            }

            freshBundle.claimedQuantity += 1;
            await transactionalEntityManager.save(freshBundle);

            const userBundle = transactionalEntityManager.create(UserCouponBundle, {
              userId,
              bundleId,
            });
            await transactionalEntityManager.save(userBundle);

            return {
              status: 200,
              data: {
                userBundle,
                bundle: freshBundle,
                couponsClaimed: coupons.length,
              },
            };
          });

          if (result.status === 200) {
            return result.data;
          }
          return reply.code(result.status).send({ message: result.message });
        } catch (error) {
          if (error instanceof OptimisticLockVersionMismatchError) {
            retries++;
            if (retries >= maxRetries) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 50 * retries));
          } else if (error instanceof QueryFailedError) {
            const msg = (error as any).message || '';
            if (msg.includes('UNIQUE constraint') || msg.includes('unique constraint')) {
              return reply.code(400).send({ message: 'Some coupons already claimed' });
            }
            retries++;
            if (retries >= maxRetries) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 50 * retries));
          } else if (error instanceof Error) {
            return reply.code(400).send({ message: error.message });
          } else {
            throw error;
          }
        }
      }

      return reply.code(500).send({ message: "Failed to claim bundle after multiple attempts" });
    }
  );

  fastify.get(
    "/my-bundles",
    { preHandler: [authenticate] },
    async (request: AuthenticatedRequest, reply) => {
      const userBundles = await userBundleRepository.find({
        where: { userId: request.user.userId },
        relations: ["bundle", "bundle.coupons"],
      });
      return userBundles;
    }
  );
}
