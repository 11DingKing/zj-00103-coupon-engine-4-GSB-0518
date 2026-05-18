import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, VersionColumn } from "typeorm";
import { CouponBatch } from "./CouponBatch";

export enum CouponType {
  FULL_REDUCTION = "full_reduction",
  DISCOUNT = "discount",
  INSTANT_REDUCTION = "instant_reduction",
  SHIPPING = "shipping",
}

@Entity()
export class Coupon {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", unique: true, nullable: true })
  code?: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({
    type: "simple-enum",
    enum: CouponType,
  })
  type!: CouponType;

  @Column({ type: "float", nullable: true })
  value?: number;

  @Column({ type: "float", nullable: true })
  discountRate?: number;

  @Column({ type: "float", default: 0 })
  minAmount!: number;

  @Column({ type: "simple-array", nullable: true })
  applicableCategories?: string[];

  @Column({ type: "datetime", nullable: true })
  startTime?: Date;

  @Column({ type: "datetime", nullable: true })
  endTime?: Date;

  @Column({ type: "int", default: 1 })
  limitPerUser!: number;

  @Column({ type: "int" })
  totalQuantity!: number;

  @Column({ type: "int", default: 0 })
  claimedQuantity!: number;

  @Column({ type: "int", default: 0 })
  usedQuantity!: number;

  @Column({ type: "boolean", default: true })
  isStackable!: boolean;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @ManyToOne(() => CouponBatch, (batch) => batch.coupons, { nullable: true })
  @JoinColumn()
  batch?: CouponBatch;

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
