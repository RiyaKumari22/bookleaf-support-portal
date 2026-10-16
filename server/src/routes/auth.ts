
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Please provide a valid email and password.",
    });
  }

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret || secret === "replace_with_a_long_random_secret") {
      return res.status(500).json({
        message: "Server authentication is not configured.",
      });
    }

    const token = jwt.sign(
      { role: user.role },
      secret,
      {
        subject: String(user.id),
        expiresIn: "8h",
      }
    );

    return res.json({
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ message: "Unable to log in right now." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "User account not found." });
    }

    return res.json({ user });
  } catch (error) {
    console.error("Unable to retrieve current user:", error);
    return res.status(500).json({ message: "Unable to retrieve user details." });
  }
});

router.get("/admins", requireAuth, async (req, res) => {
  if (req.user!.role !== "ADMIN") {
    return res.status(403).json({
      message: "Only administrators can view administrator accounts.",
    });
  }

  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: "asc" },
    });

    return res.json({ users: admins });
  } catch (error) {
    console.error("Unable to retrieve administrators:", error);

    return res.status(500).json({
      message: "Unable to retrieve administrator accounts.",
    });
  }
});

export default router;
