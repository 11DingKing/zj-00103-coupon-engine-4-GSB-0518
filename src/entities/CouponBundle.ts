import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  VersionColumn,
} from "typeorm";
import { Coupon } from "./Coupon";

@Entity()
export class CouponBundle {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @ManyToMany(() => Coupon)
  @JoinTable()
  coupons!: Coupon[];

  @Column({ type: "simple-array" })
  couponIds!: number[];

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

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
