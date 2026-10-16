
import { Router, Request, Response } from "express";
import { PrismaClient, UserRole } from "@prisma/client";
import { requireAuth } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/books — list books the logged-in user is allowed to see
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const books = await prisma.book.findMany({
      where:
        req.user.role === UserRole.ADMIN
          ? {}
          : { authorId: req.user.id },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        isbn: true,
        genre: true,
        publicationDate: true,
        status: true,
        mrp: true,
        copiesSold: true,
        totalRoyaltyEarned: true,
        royaltyPaid: true,
        royaltyPending: true,
        authorId: true,
      },
    });

    return res.json({ books });
  } catch (error) {
    console.error("Failed to fetch books:", error);
    return res.status(500).json({ message: "Unable to fetch books." });
  }
});

// GET /api/books/:id — get one book, subject to ownership permissions
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Invalid book ID." });
    }

    const book = await prisma.book.findFirst({
      where: {
        id,
        ...(req.user.role === UserRole.ADMIN
          ? {}
          : { authorId: req.user.id }),
      },
      select: {
        id: true,
        title: true,
        isbn: true,
        genre: true,
        publicationDate: true,
        status: true,
        mrp: true,
        copiesSold: true,
        royaltyPerCopy: true,
        totalRoyaltyEarned: true,
        royaltyPaid: true,
        royaltyPending: true,
        lastRoyaltyPayoutDate: true,
        printPartner: true,
        availableOn: true,
        authorId: true,
      },
    });

    if (!book) {
      return res.status(404).json({ message: "Book not found." });
    }

    return res.json({ book });
  } catch (error) {
    console.error("Failed to fetch book:", error);
    return res.status(500).json({ message: "Unable to fetch book." });
  }
});

export default router;
