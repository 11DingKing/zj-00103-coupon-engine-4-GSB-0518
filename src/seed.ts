import "reflect-metadata";
import bcrypt from "bcryptjs";
import { AppDataSource } from "./data-source";
import { User, UserRole } from "./entities/User";
import { CouponBatch } from "./entities/CouponBatch";
import { Coupon, CouponType } from "./entities/Coupon";

async function seed() {
  try {
    await AppDataSource.initialize();
    console.log("Database connected");

    const userRepository = AppDataSource.getRepository(User);
    const batchRepository = AppDataSource.getRepository(CouponBatch);
    const couponRepository = AppDataSource.getRepository(Coupon);

    const existingUsers = await userRepository.find();
    if (existingUsers.length > 0) {
      console.log("Database already seeded, skipping...");
      process.exit(0);
    }

    const hashedAdminPassword = await bcrypt.hash("admin123456", 10);
    const admin = userRepository.create({
      username: "admin",
      password: hashedAdminPassword,
      role: UserRole.ADMIN,
    });
    await userRepository.save(admin);
    console.log("Created admin user: admin / admin123456");

    const hashedUserPassword = await bcrypt.hash("user123456", 10);
    const user1 = userRepository.create({
      username: "user1",
      password: hashedUserPassword,
      role: UserRole.USER,
    });
    await userRepository.save(user1);
    console.log("Created user: user1 / user123456");

    const batch1 = batchRepository.create({
      name: "Spring Sale 2024",
      description: "Spring promotion campaign",
      isActive: true,
    });
    await batchRepository.save(batch1);
    console.log("Created batch: Spring Sale 2024");

    const couponsBatch1 = [
      couponRepository.create({
        name: "满100减20",
        type: CouponType.FULL_REDUCTION,
        value: 20,
        minAmount: 100,
        applicableCategories: ["clothing", "electronics"],
        limitPerUser: 1,
        totalQuantity: 100,
        claimedQuantity: 0,
        usedQuantity: 0,
        isStackable: true,
        isActive: true,
        batch: batch1,
      }),
      couponRepository.create({
        name: "8折优惠券",
        type: CouponType.DISCOUNT,
        discountRate: 0.8,
        minAmount: 50,
        applicableCategories: ["books", "stationery"],
        limitPerUser: 2,
        totalQuantity: 200,
        claimedQuantity: 0,
        usedQuantity: 0,
        isStackable: true,
        isActive: true,
        batch: batch1,
      }),
    ];
    await couponRepository.save(couponsBatch1);
    console.log("Created 2 coupons for Batch 1");

    const batch2 = batchRepository.create({
      name: "Summer Special",
      description: "Summer special offers",
      isActive: true,
    });
    await batchRepository.save(batch2);
    console.log("Created batch: Summer Special");

    const couponsBatch2 = [
      couponRepository.create({
        name: "立减10元",
        type: CouponType.INSTANT_REDUCTION,
        value: 10,
        minAmount: 0,
        applicableCategories: ["food", "beverages"],
        limitPerUser: 3,
        totalQuantity: 500,
        claimedQuantity: 0,
        usedQuantity: 0,
        isStackable: true,
        isActive: true,
        batch: batch2,
      }),
      couponRepository.create({
        name: "免运费券",
        type: CouponType.SHIPPING,
        value: 15,
        minAmount: 0,
        applicableCategories: [],
        limitPerUser: 1,
        totalQuantity: 300,
        claimedQuantity: 0,
        usedQuantity: 0,
        isStackable: true,
        isActive: true,
        batch: batch2,
      }),
    ];
    await couponRepository.save(couponsBatch2);
    console.log("Created 2 coupons for Batch 2");

    console.log("\n=== Seed completed successfully! ===");
    console.log("\nAvailable coupons:");
    console.log("1. 满100减20 - 满减券 (满100可用, 服装/电子)");
    console.log("2. 8折优惠券 - 折扣券 (满50可用, 图书/文具)");
    console.log("3. 立减10元 - 立减券 (无门槛, 食品/饮料)");
    console.log("4. 免运费券 - 运费券 (无门槛)");
    console.log("\nRun 'npm run dev' to start the server");
    console.log("API docs: http://localhost:3000/api/docs");
    console.log("Health check: http://localhost:3000/api/health");

    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seed();
