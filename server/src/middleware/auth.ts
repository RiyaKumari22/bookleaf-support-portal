
import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { UserRole } from "@prisma/client";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const token = authorization.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return res.status(500).json({ message: "Server authentication is not configured." });
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    const id = Number(decoded.sub);
    const role = decoded.role;

    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      (role !== UserRole.AUTHOR && role !== UserRole.ADMIN)
    ) {
      return res.status(401).json({ message: "Invalid authentication token." });
    }

    req.user = { id, role };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "You don't have permission to access this resource." });
    }

    next();
  };
}
