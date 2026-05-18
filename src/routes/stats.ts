import { FastifyInstance } from "fastify";
import { Repository } from "typeorm";
import { Coupon } from "../entities/Coupon";
import { UserCoupon } from "../entities/UserCoupon";
import { CouponUsageRecord } from "../entities/CouponUsageRecord";
import { CouponBundle } from "../entities/CouponBundle";
import { UserCouponBundle } from "../entities/UserCouponBundle";
import { CouponTransferRecord } from "../entities/CouponTransferRecord";
import { AppDataSource } from "../data-source";
import { authenticate, requireAdmin } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";

export async function statsRoutes(fastify: FastifyInstance) {
  const couponRepository: Repository<Coupon> = AppDataSource.getRepository(Coupon);
  const userCouponRepository: Repository<UserCoupon> = AppDataSource.getRepository(UserCoupon);
  const usageRecordRepository: Repository<CouponUsageRecord> = AppDataSource.getRepository(CouponUsageRecord);
  const bundleRepository: Repository<CouponBundle> = AppDataSource.getRepository(CouponBundle);
  const userBundleRepository: Repository<UserCouponBundle> = AppDataSource.getRepository(UserCouponBundle);
  const transferRecordRepository: Repository<CouponTransferRecord> = AppDataSource.getRepository(CouponTransferRecord);

  fastify.get(
    "/overview",
    { preHandler: [authenticate, requireAdmin] },
    async (request: AuthenticatedRequest, reply) => {
      const totalCoupons = await couponRepository.count();
      const totalClaimed = await userCouponRepository.count();
      const totalUsed = await usageRecordRepository.count();

      const activeCoupons = await couponRepository.count({ where: { isActive: true } });

      const totalDiscountResult = await usageRecordRepository
        .createQueryBuilder("record")
        .select("SUM(record.discountAmount)", "total")
        .getRawOne();
      const totalDiscount = Number(totalDiscountResult.total) || 0;

      const claimRate = totalCoupons > 0 ? ((totalClaimed / (totalCoupons * 3)) * 100).toFixed(2) : "0.00";
      const usageRate = totalClaimed > 0 ? ((totalUsed / totalClaimed) * 100).toFixed(2) : "0.00";

      const totalBundles = await bundleRepository.count();
      const activeBundles = await bundleRepository.count({ where: { isActive: true } });
      const totalBundlesClaimed = await userBundleRepository.count();

      const totalTransfers = await transferRecordRepository.count();

      return {
        coupons: {
          total: totalCoupons,
          active: activeCoupons,
          claimed: totalClaimed,
          used: totalUsed,
          totalDiscount,
          claimRate: `${claimRate}%`,
          usageRate: `${usageRate}%`,
        },
        bundles: {
          total: totalBundles,
          active: activeBundles,
          claimed: totalBundlesClaimed,
        },
        transfers: {
          total: totalTransfers,
        },
      };
    }
  );

  fastify.get<{
    Querystring: { days?: string };
  }>(
    "/trends",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const days = parseInt(request.query.days || "30");
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      const claimTrends = await userCouponRepository
        .createQueryBuilder("uc")
        .select("DATE(uc.claimedAt)", "date")
        .addSelect("COUNT(*)", "count")
        .where("uc.claimedAt >= :startDate", { startDate })
        .groupBy("DATE(uc.claimedAt)")
        .orderBy("date", "ASC")
        .getRawMany();

      const usageTrends = await usageRecordRepository
        .createQueryBuilder("ur")
        .select("DATE(ur.usedAt)", "date")
        .addSelect("COUNT(*)", "count")
        .addSelect("SUM(ur.discountAmount)", "discount")
        .where("ur.usedAt >= :startDate", { startDate })
        .groupBy("DATE(ur.usedAt)")
        .orderBy("date", "ASC")
        .getRawMany();

      const bundleClaimTrends = await userBundleRepository
        .createQueryBuilder("ub")
        .select("DATE(ub.claimedAt)", "date")
        .addSelect("COUNT(*)", "count")
        .where("ub.claimedAt >= :startDate", { startDate })
        .groupBy("DATE(ub.claimedAt)")
        .orderBy("date", "ASC")
        .getRawMany();

      const transferTrends = await transferRecordRepository
        .createQueryBuilder("tr")
        .select("DATE(tr.transferredAt)", "date")
        .addSelect("COUNT(*)", "count")
        .where("tr.transferredAt >= :startDate", { startDate })
        .groupBy("DATE(tr.transferredAt)")
        .orderBy("date", "ASC")
        .getRawMany();

      return {
        period: `${days} days`,
        couponClaims: claimTrends.map((t) => ({
          date: t.date,
          count: parseInt(t.count),
        })),
        couponUsages: usageTrends.map((t) => ({
          date: t.date,
          count: parseInt(t.count),
          discount: Number(t.discount),
        })),
        bundleClaims: bundleClaimTrends.map((t) => ({
          date: t.date,
          count: parseInt(t.count),
        })),
        transfers: transferTrends.map((t) => ({
          date: t.date,
          count: parseInt(t.count),
        })),
      };
    }
  );

  fastify.get(
    "/coupons/:couponId",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const { couponId } = request.params as { couponId: string };

      const coupon = await couponRepository.findOneBy({ id: parseInt(couponId) });
      if (!coupon) {
        return reply.code(404).send({ message: "Coupon not found" });
      }

      const claimedCount = await userCouponRepository.count({ where: { couponId: parseInt(couponId) } });
      const usedCount = await usageRecordRepository.count({ where: { couponId: parseInt(couponId) } });

      const discountResult = await usageRecordRepository
        .createQueryBuilder("ur")
        .select("SUM(ur.discountAmount)", "total")
        .where("ur.couponId = :couponId", { couponId })
        .getRawOne();
      const totalDiscount = Number(discountResult.total) || 0;

      return {
        coupon,
        statistics: {
          claimed: claimedCount,
          used: usedCount,
          totalDiscount,
          claimRate: coupon.totalQuantity > 0 ? ((claimedCount / coupon.totalQuantity) * 100).toFixed(2) + "%" : "0%",
          usageRate: claimedCount > 0 ? ((usedCount / claimedCount) * 100).toFixed(2) + "%" : "0%",
        },
      };
    }
  );
}
