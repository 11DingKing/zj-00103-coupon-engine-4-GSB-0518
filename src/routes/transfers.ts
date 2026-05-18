import { FastifyInstance } from "fastify";
import { Repository, QueryFailedError, OptimisticLockVersionMismatchError } from "typeorm";
import { UserCoupon, UserCouponStatus } from "../entities/UserCoupon";
import { CouponTransferRecord, TransferStatus } from "../entities/CouponTransferRecord";
import { User } from "../entities/User";
import { AppDataSource } from "../data-source";
import { authenticate, requireAdmin } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";

export async function transferRoutes(fastify: FastifyInstance) {
  const userCouponRepository: Repository<UserCoupon> = AppDataSource.getRepository(UserCoupon);
  const transferRecordRepository: Repository<CouponTransferRecord> = AppDataSource.getRepository(CouponTransferRecord);
  const userRepository: Repository<User> = AppDataSource.getRepository(User);

  fastify.post<{
    Body: { userCouponId: number; toUsername: string; remark?: string };
  }>(
    "/transfer",
    { preHandler: [authenticate] },
    async (request: AuthenticatedRequest & { Body: { userCouponId: number; toUsername: string; remark?: string } }, reply) => {
      const { userCouponId, toUsername, remark } = request.body;
      const fromUserId = request.user.userId;

      const toUser = await userRepository.findOneBy({ username: toUsername });
      if (!toUser) {
        return reply.code(404).send({ message: "Recipient user not found" });
      }

      if (toUser.id === fromUserId) {
        return reply.code(400).send({ message: "Cannot transfer to yourself" });
      }

      const userCoupon = await userCouponRepository.findOne({
        where: { id: userCouponId, userId: fromUserId },
        relations: ["coupon"],
      });

      if (!userCoupon) {
        return reply.code(404).send({ message: "User coupon not found" });
      }

      if (userCoupon.status !== UserCouponStatus.AVAILABLE) {
        return reply.code(400).send({ message: "Coupon is not available for transfer" });
      }

      const now = new Date();
      if (userCoupon.coupon.endTime && now > userCoupon.coupon.endTime) {
        return reply.code(400).send({ message: "Coupon has expired" });
      }

      const maxRetries = 5;
      let retries = 0;

      while (retries < maxRetries) {
        try {
          const result = await AppDataSource.transaction(async (transactionalEntityManager) => {
            const freshUserCoupon = await transactionalEntityManager.findOneBy(UserCoupon, { id: userCouponId });

            if (!freshUserCoupon || freshUserCoupon.status !== UserCouponStatus.AVAILABLE) {
              return { status: 400, message: "Coupon is no longer available" };
            }

            if (freshUserCoupon.userId !== fromUserId) {
              return { status: 403, message: "Not authorized to transfer this coupon" };
            }

            freshUserCoupon.status = UserCouponStatus.TRANSFERRED;
            await transactionalEntityManager.save(freshUserCoupon);

            const newUserCoupon = transactionalEntityManager.create(UserCoupon, {
              userId: toUser.id,
              couponId: freshUserCoupon.couponId,
              status: UserCouponStatus.AVAILABLE,
            });
            await transactionalEntityManager.save(newUserCoupon);

            const transferRecord = transactionalEntityManager.create(CouponTransferRecord, {
              fromUserId,
              toUserId: toUser.id,
              couponId: freshUserCoupon.couponId,
              originalUserCouponId: freshUserCoupon.id,
              newUserCouponId: newUserCoupon.id,
              status: TransferStatus.COMPLETED,
              remark,
            });
            await transactionalEntityManager.save(transferRecord);

            return {
              status: 200,
              data: {
                transferRecord,
                originalUserCoupon: freshUserCoupon,
                newUserCoupon,
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

      return reply.code(500).send({ message: "Failed to transfer coupon after multiple attempts" });
    }
  );

  fastify.get(
    "/my-transfers",
    { preHandler: [authenticate] },
    async (request: AuthenticatedRequest, reply) => {
      const userId = request.user.userId;

      const sentTransfers = await transferRecordRepository.find({
        where: { fromUserId: userId },
        relations: ["toUser", "coupon", "newUserCoupon"],
      });

      const receivedTransfers = await transferRecordRepository.find({
        where: { toUserId: userId },
        relations: ["fromUser", "coupon", "newUserCoupon"],
      });

      return {
        sent: sentTransfers,
        received: receivedTransfers,
      };
    }
  );

  fastify.get(
    "/all",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const transfers = await transferRecordRepository.find({
        relations: ["fromUser", "toUser", "coupon", "originalUserCoupon", "newUserCoupon"],
      });
      return transfers;
    }
  );

  fastify.get<{
    Querystring: { days?: string };
  }>(
    "/statistics",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const days = parseInt(request.query.days || "30");
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      const totalTransfers = await transferRecordRepository.count({
        where: {
          transferredAt: startDate && endDate ? { $gte: startDate, $lte: endDate } as any : undefined,
        },
      });

      const dailyTrends = await transferRecordRepository
        .createQueryBuilder("tr")
        .select("DATE(tr.transferredAt)", "date")
        .addSelect("COUNT(*)", "count")
        .where("tr.transferredAt >= :startDate", { startDate })
        .groupBy("DATE(tr.transferredAt)")
        .orderBy("date", "ASC")
        .getRawMany();

      const topSenders = await transferRecordRepository
        .createQueryBuilder("tr")
        .select("tr.fromUserId", "userId")
        .addSelect("COUNT(*)", "count")
        .where("tr.transferredAt >= :startDate", { startDate })
        .groupBy("tr.fromUserId")
        .orderBy("count", "DESC")
        .limit(10)
        .getRawMany();

      const topReceivers = await transferRecordRepository
        .createQueryBuilder("tr")
        .select("tr.toUserId", "userId")
        .addSelect("COUNT(*)", "count")
        .where("tr.transferredAt >= :startDate", { startDate })
        .groupBy("tr.toUserId")
        .orderBy("count", "DESC")
        .limit(10)
        .getRawMany();

      return {
        period: `${days} days`,
        totalTransfers,
        dailyTrends: dailyTrends.map((t) => ({
          date: t.date,
          count: parseInt(t.count),
        })),
        topSenders,
        topReceivers,
      };
    }
  );
}
