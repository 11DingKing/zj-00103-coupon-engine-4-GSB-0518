import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { Coupon } from "./Coupon";
import { UserCoupon } from "./UserCoupon";

export enum TransferStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

@Entity()
export class CouponTransferRecord {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User)
  @JoinColumn()
  fromUser!: User;

  @Column({ type: "int" })
  fromUserId!: number;

  @ManyToOne(() => User)
  @JoinColumn()
  toUser!: User;

  @Column({ type: "int" })
  toUserId!: number;

  @ManyToOne(() => Coupon)
  @JoinColumn()
  coupon!: Coupon;

  @Column({ type: "int" })
  couponId!: number;

  @ManyToOne(() => UserCoupon, { nullable: true })
  @JoinColumn()
  originalUserCoupon?: UserCoupon;

  @Column({ type: "int", nullable: true })
  originalUserCouponId?: number;

  @ManyToOne(() => UserCoupon, { nullable: true })
  @JoinColumn()
  newUserCoupon?: UserCoupon;

  @Column({ type: "int", nullable: true })
  newUserCouponId?: number;

  @Column({
    type: "simple-enum",
    enum: TransferStatus,
    default: TransferStatus.COMPLETED,
  })
  status!: TransferStatus;

  @Column({ type: "text", nullable: true })
  remark?: string;

  @CreateDateColumn()
  transferredAt!: Date;
}
