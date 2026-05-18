import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm";
import { User } from "./User";
import { CouponBundle } from "./CouponBundle";

@Entity()
@Unique(["userId", "bundleId"])
export class UserCouponBundle {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User)
  @JoinColumn()
  user!: User;

  @Column({ type: "int" })
  userId!: number;

  @ManyToOne(() => CouponBundle)
  @JoinColumn()
  bundle!: CouponBundle;

  @Column({ type: "int" })
  bundleId!: number;

  @CreateDateColumn()
  claimedAt!: Date;
}
