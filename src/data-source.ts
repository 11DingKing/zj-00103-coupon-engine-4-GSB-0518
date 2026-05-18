import "reflect-metadata";
import { DataSource } from "typeorm";
import path from "path";

const isDev = process.env.NODE_ENV !== "production";
const entitiesPath = isDev
  ? path.join(__dirname, "entities/**/*.ts")
  : path.join(__dirname, "entities/**/*.js");

export const AppDataSource = new DataSource({
  type: "better-sqlite3",
  database: "./data/app.db",
  synchronize: true,
  logging: false,
  entities: [entitiesPath],
  migrations: [],
  subscribers: [],
});
