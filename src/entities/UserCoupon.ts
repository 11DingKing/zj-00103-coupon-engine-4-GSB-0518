import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique, VersionColumn } from "typeorm";
import { User } from "./User";
import { Coupon } from "./Coupon";

export enum UserCouponStatus {
  AVAILABLE = "available",
  USED = "used",
  EXPIRED = "expired",
  TRANSFERRED = "transferred",
}

@Entity()
@Unique(["userId", "couponId"])
export class UserCoupon {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User)
  @JoinColumn()
  user!: User;

  @Column({ type: "int" })
  userId!: number;

  @ManyToOne(() => Coupon)
  @JoinColumn()
  coupon!: Coupon;

  @Column({ type: "int" })
  couponId!: number;

  @Column({
    type: "simple-enum",
    enum: UserCouponStatus,
    default: UserCouponStatus.AVAILABLE,
  })
  status!: UserCouponStatus;

  @Column({ type: "datetime", nullable: true })
  usedAt?: Date;

  @CreateDateColumn()
  claimedAt!: Date;

  @VersionColumn()
  version!: number;
}
