import { FastifyInstance } from "fastify";
import { Repository, QueryFailedError, OptimisticLockVersionMismatchError } from "typeorm";
import { Coupon } from "../entities/Coupon";
import { UserCoupon, UserCouponStatus } from "../entities/UserCoupon";
import { CouponUsageRecord } from "../entities/CouponUsageRecord";
import { AppDataSource } from "../data-source";
import { authenticate } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";
import { CouponCalculator } from "../services/coupon-calculator";

export async function userCouponRoutes(fastify: FastifyInstance) {
  const couponRepository: Repository<Coupon> = AppDataSource.getRepository(Coupon);
  const userCouponRepository: Repository<UserCoupon> = AppDataSource.getRepository(UserCoupon);
  const usageRecordRepository: Repository<CouponUsageRecord> = AppDataSource.getRepository(CouponUsageRecord);

  fastify.get(
    "/my-coupons",
    { preHandler: [authenticate] },
    async (request: AuthenticatedRequest, reply) => {
      const userCoupons = await userCouponRepository.find({
        where: { userId: request.user.userId },
        relations: ["coupon"],
      });
      return userCoupons;
    }
  );

  fastify.post<{
    Body: { couponId: number };
  }>(
    "/claim",
    { preHandler: [authenticate] },
    async (request: AuthenticatedRequest & { Body: { couponId: number } }, reply) => {
      const { couponId } = request.body;
      const userId = request.user.userId;

      const coupon = await couponRepository.findOneBy({ id: couponId });
      if (!coupon) {
        return reply.code(404).send({ message: "Coupon not found" });
      }

      if (!coupon.isActive) {
        return reply.code(400).send({ message: "Coupon is not active" });
      }

      const now = new Date();
      if (coupon.startTime && now < coupon.startTime) {
        return reply.code(400).send({ message: "Coupon not yet valid" });
      }
      if (coupon.endTime && now > coupon.endTime) {
        return reply.code(400).send({ message: "Coupon expired" });
      }

      const maxRetries = 10;
      let retries = 0;

      while (retries < maxRetries) {
        try {
          const result = await AppDataSource.transaction(async (transactionalEntityManager) => {
            const freshCoupon = await transactionalEntityManager.findOneBy(Coupon, { id: couponId });

            if (!freshCoupon) {
              return { status: 404, message: "Coupon not found" };
            }

            const claimedCount = await transactionalEntityManager.count(UserCoupon, {
              where: { userId, couponId },
            });
            if (claimedCount >= freshCoupon.limitPerUser) {
              return { status: 400, message: "Coupon limit reached" };
            }

            if (freshCoupon.claimedQuantity >= freshCoupon.totalQuantity) {
              return { status: 400, message: "Coupon out of stock" };
            }

            freshCoupon.claimedQuantity += 1;
            await transactionalEntityManager.save(freshCoupon);

            const userCoupon = transactionalEntityManager.create(UserCoupon, {
              userId,
              couponId,
              status: UserCouponStatus.AVAILABLE,
            });
            await transactionalEntityManager.save(userCoupon);

            return { status: 201, data: userCoupon };
          });

          return reply.code(result.status).send(result.data || { message: result.message });
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
              return reply.code(400).send({ message: 'Coupon already claimed' });
            }
            retries++;
            if (retries >= maxRetries) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 50 * retries));
          } else {
            throw error;
          }
        }
      }

      return reply.code(500).send({ message: "Failed to claim coupon after multiple attempts" });
    }
  );

  fastify.post<{
    Body: { orderAmount: number; productCategories: string[]; allowStacking?: boolean };
  }>(
    "/use",
    { preHandler: [authenticate] },
    async (request: AuthenticatedRequest & { Body: { orderAmount: number; productCategories: string[]; allowStacking?: boolean } }, reply) => {
      const { orderAmount, productCategories, allowStacking = true } = request.body;
      const userId = request.user.userId;

      const maxRetries = 5;
      let retries = 0;

      while (retries < maxRetries) {
        try {
          const result = await AppDataSource.transaction(async (transactionalEntityManager) => {
            const userCoupons = await transactionalEntityManager.find(UserCoupon, {
              where: { userId, status: UserCouponStatus.AVAILABLE },
              relations: ["coupon"],
            });

            if (userCoupons.length === 0) {
              return { status: 400, message: "No available coupons" };
            }

            const coupons = userCoupons.map((uc) => uc.coupon);
            const calculationResult = CouponCalculator.findOptimalCoupons(
              coupons,
              orderAmount,
              productCategories,
              allowStacking
            );

            if (calculationResult.selectedCoupons.length === 0) {
              return { status: 400, message: "No applicable coupons for this order" };
            }

            const usedUserCoupons: UserCoupon[] = [];
            const usageRecords: CouponUsageRecord[] = [];

            for (const selected of calculationResult.selectedCoupons) {
              const userCoupon = userCoupons.find((uc) => uc.couponId === selected.couponId);
              if (userCoupon) {
                if (userCoupon.status !== UserCouponStatus.AVAILABLE) {
                  throw new Error(`Coupon ${userCoupon.id} is not available`);
                }

                userCoupon.status = UserCouponStatus.USED;
                userCoupon.usedAt = new Date();
                usedUserCoupons.push(userCoupon);

                const coupon = coupons.find((c) => c.id === selected.couponId);
                if (coupon) {
                  coupon.usedQuantity += 1;
                  await transactionalEntityManager.save(coupon);
                }

                const record = transactionalEntityManager.create(CouponUsageRecord, {
                  userId,
                  couponId: selected.couponId,
                  orderAmount,
                  discountAmount: selected.discountAmount,
                  productCategories,
                });
                usageRecords.push(record);
              }
            }

            await transactionalEntityManager.save(usedUserCoupons);
            await transactionalEntityManager.save(usageRecords);

            return {
              status: 200,
              data: {
                ...calculationResult,
                usedCoupons: usedUserCoupons,
                usageRecords,
              },
            };
          });

          if (result.status === 200) {
            return result.data;
          }
          return reply.code(result.status).send({ message: result.message });
        } catch (error) {
          if (error instanceof QueryFailedError || error instanceof OptimisticLockVersionMismatchError) {
            retries++;
            if (retries >= maxRetries) {
              if (error instanceof Error) {
                return reply.code(400).send({ message: error.message });
              }
              return reply.code(500).send({ message: "Failed to use coupons after multiple attempts" });
            }
            await new Promise((resolve) => setTimeout(resolve, 50 * retries));
          } else if (error instanceof Error) {
            return reply.code(400).send({ message: error.message });
          } else {
            throw error;
          }
        }
      }

      return reply.code(500).send({ message: "Failed to use coupons after multiple attempts" });
    }
  );

  fastify.post<{
    Body: { orderAmount: number; productCategories: string[] };
  }>(
    "/preview",
    { preHandler: [authenticate] },
    async (request: AuthenticatedRequest & { Body: { orderAmount: number; productCategories: string[] } }, reply) => {
      const { orderAmount, productCategories } = request.body;
      const userId = request.user.userId;

      const userCoupons = await userCouponRepository.find({
        where: { userId, status: UserCouponStatus.AVAILABLE },
        relations: ["coupon"],
      });

      const coupons = userCoupons.map((uc) => uc.coupon);
      const allResults = CouponCalculator.previewAllCoupons(coupons, orderAmount, productCategories);
      const optimalResult = CouponCalculator.findOptimalCoupons(coupons, orderAmount, productCategories, true);

      return {
        allCoupons: allResults,
        optimalSelection: optimalResult,
      };
    }
  );
}
