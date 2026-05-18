import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./User";
import { Coupon } from "./Coupon";

@Entity()
export class CouponUsageRecord {
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

  @Column({ type: "float" })
  orderAmount!: number;

  @Column({ type: "float" })
  discountAmount!: number;

  @Column({ type: "simple-array", nullable: true })
  productCategories?: string[];

  @CreateDateColumn()
  usedAt!: Date;
}
