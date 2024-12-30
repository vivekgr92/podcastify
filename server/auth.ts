import bcrypt from "bcrypt";
import { users, insertUserSchema, type User as SelectUser } from "@db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

// Extend express User type
declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const crypto = {
  hash: async (password: string) => {
    return bcrypt.hash(password, 10);
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    return bcrypt.compare(suppliedPassword, storedPassword);
  },
};