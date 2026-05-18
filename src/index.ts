import "reflect-metadata";
import fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { AppDataSource } from "./data-source";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { couponRoutes } from "./routes/coupons";
import { batchRoutes } from "./routes/batches";
import { userCouponRoutes } from "./routes/user-coupons";
import { statsRoutes } from "./routes/stats";
import { bundleRoutes } from "./routes/bundles";
import { transferRoutes } from "./routes/transfers";

const app = fastify({ logger: true });

app.register(fastifyJwt, {
  secret: "coupon-engine-secret-key-change-in-production",
});

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Coupon Engine API",
      description: "Coupon rule engine with Fastify + TypeORM + SQLite",
      version: "1.0.0",
    },
    servers: [{ url: "http://localhost:3000" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
});

app.register(fastifySwaggerUi, {
  routePrefix: "/api/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: false,
  },
});

app.register(healthRoutes, { prefix: "/api/health" });
app.register(authRoutes, { prefix: "/api/auth" });
app.register(couponRoutes, { prefix: "/api/coupons" });
app.register(batchRoutes, { prefix: "/api/batches" });
app.register(userCouponRoutes, { prefix: "/api/user-coupons" });
app.register(statsRoutes, { prefix: "/api/stats" });
app.register(bundleRoutes, { prefix: "/api/bundles" });
app.register(transferRoutes, { prefix: "/api/transfers" });

const start = async () => {
  try {
    await AppDataSource.initialize();
    app.log.info("Database connected");

    await app.listen({ port: 3000, host: "0.0.0.0" });
    app.log.info("Server running on http://localhost:3000");
    app.log.info("API docs: http://localhost:3000/api/docs");
    app.log.info("Health check: http://localhost:3000/api/health");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
