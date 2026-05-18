import { Coupon, CouponType } from "../entities/Coupon";
import { CouponCalculationResult } from "../types";

export class CouponCalculator {
  static calculateDiscount(
    coupon: Coupon,
    orderAmount: number,
    productCategories: string[]
  ): CouponCalculationResult {
    const result: CouponCalculationResult = {
      couponId: coupon.id,
      couponName: coupon.name,
      couponType: coupon.type,
      discountAmount: 0,
      originalAmount: orderAmount,
      finalAmount: orderAmount,
      isApplicable: false,
    };

    if (!coupon.isActive) {
      result.reason = "Coupon is not active";
      return result;
    }

    const now = new Date();
    if (coupon.startTime && now < coupon.startTime) {
      result.reason = "Coupon not yet valid";
      return result;
    }
    if (coupon.endTime && now > coupon.endTime) {
      result.reason = "Coupon expired";
      return result;
    }

    if (orderAmount < coupon.minAmount) {
      result.reason = `Minimum amount ${coupon.minAmount} not met`;
      return result;
    }

    if (
      coupon.applicableCategories &&
      coupon.applicableCategories.length > 0
    ) {
      const hasMatchingCategory = productCategories.some((cat) =>
        coupon.applicableCategories!.includes(cat)
      );
      if (!hasMatchingCategory) {
        result.reason = "No matching product category";
        return result;
      }
    }

    result.isApplicable = true;

    switch (coupon.type) {
      case CouponType.FULL_REDUCTION:
        result.discountAmount = Number(coupon.value) || 0;
        break;
      case CouponType.DISCOUNT:
        result.discountAmount = orderAmount * (1 - (Number(coupon.discountRate) || 1));
        break;
      case CouponType.INSTANT_REDUCTION:
        result.discountAmount = Number(coupon.value) || 0;
        break;
      case CouponType.SHIPPING:
        result.discountAmount = Number(coupon.value) || 0;
        break;
    }

    result.discountAmount = Math.min(result.discountAmount, orderAmount);
    result.finalAmount = orderAmount - result.discountAmount;

    return result;
  }

  static findOptimalCoupons(
    coupons: Coupon[],
    orderAmount: number,
    productCategories: string[],
    allowStacking: boolean = true
  ): {
    selectedCoupons: CouponCalculationResult[];
    totalDiscount: number;
    finalAmount: number;
  } {
    const applicableResults: CouponCalculationResult[] = [];

    for (const coupon of coupons) {
      const result = this.calculateDiscount(coupon, orderAmount, productCategories);
      if (result.isApplicable) {
        applicableResults.push(result);
      }
    }

    if (applicableResults.length === 0) {
      return {
        selectedCoupons: [],
        totalDiscount: 0,
        finalAmount: orderAmount,
      };
    }

    if (!allowStacking) {
      applicableResults.sort((a, b) => b.discountAmount - a.discountAmount);
      const best = applicableResults[0];
      return {
        selectedCoupons: [best],
        totalDiscount: best.discountAmount,
        finalAmount: best.finalAmount,
      };
    }

    const couponsByType = new Map<string, CouponCalculationResult[]>();
    for (const result of applicableResults) {
      if (!couponsByType.has(result.couponType)) {
        couponsByType.set(result.couponType, []);
      }
      couponsByType.get(result.couponType)!.push(result);
    }

    const selectedCoupons: CouponCalculationResult[] = [];
    let remainingAmount = orderAmount;

    const typePriority = [
      CouponType.FULL_REDUCTION,
      CouponType.INSTANT_REDUCTION,
      CouponType.DISCOUNT,
      CouponType.SHIPPING,
    ];

    for (const type of typePriority) {
      const typeCoupons = couponsByType.get(type);
      if (typeCoupons && typeCoupons.length > 0) {
        typeCoupons.sort((a, b) => b.discountAmount - a.discountAmount);
        const best = typeCoupons[0];
        if (best.discountAmount > 0) {
          selectedCoupons.push(best);
        }
      }
    }

    let totalDiscount = 0;
    for (const coupon of selectedCoupons) {
      const actualDiscount = Math.min(coupon.discountAmount, remainingAmount);
      totalDiscount += actualDiscount;
      remainingAmount -= actualDiscount;
      coupon.finalAmount = remainingAmount;
    }

    return {
      selectedCoupons,
      totalDiscount,
      finalAmount: Math.max(0, remainingAmount),
    };
  }

  static previewAllCoupons(
    coupons: Coupon[],
    orderAmount: number,
    productCategories: string[]
  ): CouponCalculationResult[] {
    return coupons.map((coupon) =>
      this.calculateDiscount(coupon, orderAmount, productCategories)
    );
  }
}
