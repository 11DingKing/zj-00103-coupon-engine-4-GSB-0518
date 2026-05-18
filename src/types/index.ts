import { FastifyRequest } from "fastify";
import { UserRole } from "../entities/User";

export interface JwtPayload {
  userId: number;
  username: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: JwtPayload;
}

export interface CouponCalculationResult {
  couponId: number;
  couponName: string;
  couponType: string;
  discountAmount: number;
  originalAmount: number;
  finalAmount: number;
  isApplicable: boolean;
  reason?: string;
}
