
import { Router, Request, Response } from "express";
import { PrismaClient, UserRole } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import {
  suggestTicketDetails,
  generateDraftReply,

} from "../services/ai";

const router = Router();
const prisma = new PrismaClient();

// Validate author ticket submissions.
const ticketSchema = z.object({
  subject: z.string().trim().min(4).max(200),
  description: z.string().trim().min(10).max(5000),
  bookId: z.number().int().positive().nullable().optional(),
});

// GET /api/tickets
// Authors see only their own tickets; admins see the full queue.
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    const tickets = await prisma.ticket.findMany({
      where:
        req.user.role === UserRole.ADMIN
          ? {}
          : { authorId: req.user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            isbn: true,
          },
        },
        author:
          req.user.role === UserRole.ADMIN
            ? {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              }
            : false,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    });

    return res.json({ tickets });
  } catch (error) {
    console.error("Failed to fetch tickets:", error);

    return res.status(500).json({
      message: "Unable to fetch tickets.",
    });
  }
});

// POST /api/tickets
// Create a ticket and generate AI classification and reply draft.
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    const parsed = ticketSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Please check the ticket details.",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { subject, description, bookId } = parsed.data;

    // Verify that the selected book belongs to the author,
    // unless the current user is an admin.
    if (bookId !== undefined && bookId !== null) {
      const book = await prisma.book.findFirst({
        where: {
          id: bookId,
          ...(req.user.role === UserRole.ADMIN
            ? {}
            : { authorId: req.user.id }),
        },
        select: { id: true },
      });

      if (!book) {
        return res.status(400).json({
          message:
            "The selected book does not exist or you cannot access it.",
        });
      }
    }

    // Generate AI classification, with a defensive fallback.
    let suggestion: Awaited<
      ReturnType<typeof suggestTicketDetails>
    >;

    try {
      suggestion = await suggestTicketDetails(
        subject,
        description
      );
    } catch (error) {
      console.error("Ticket suggestion failed:", error);

      suggestion = {
        category: "General Inquiry",
        priority: "MEDIUM",
        reason: "Manual review required.",
        aiAvailable: false,
      };
    }

    const category = suggestion.category;
    const priority = suggestion.priority;

    // Generate a response draft using the knowledge base.
    // Draft generation has its own fallback in the AI service.
 // Generate an AI draft without blocking ticket creation.
let aiDraftReply = "";

try {
  aiDraftReply = await generateDraftReply(
    subject,
    description,
    category
  );
} catch (error) {
  console.error("AI draft generation failed:", error);
  // Continue creating the ticket; an admin can reply manually.
}

    // Save the ticket and AI suggestions.
    const ticket = await prisma.ticket.create({
      data: {
        subject,
        description,
        category,
        aiSuggestedCategory: suggestion.category,
        priority,
        aiSuggestedPriority: suggestion.priority,
        aiDraftReply,
        authorId: req.user.id,
        bookId: bookId ?? null,
      },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            isbn: true,
          },
        },
      },
    });

    return res.status(201).json({
      message: "Support ticket created successfully.",
      ticket,
      ai: {
        classificationAvailable: suggestion.aiAvailable,
      },
    });
  } catch (error) {
    console.error("Failed to create ticket:", error);

    return res.status(500).json({
      message: "Unable to create ticket.",
    });
  }
});

// Admin ticket update validation.
const adminUpdateSchema = z
  .object({
    status: z
      .enum([
        "OPEN",
        "IN_PROGRESS",
        "WAITING_ON_AUTHOR",
        "RESOLVED",
        "CLOSED",
      ])
      .optional(),

    priority: z
      .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])
      .optional(),

    category: z
      .enum([
        "Royalty & Payments",
        "ISBN & Metadata Issues",
        "Printing & Quality",
        "Distribution & Availability",
        "Book Status & Production Updates",
        "General Inquiry",
      ])
      .optional(),

    assignedAdminId: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "Provide at least one field to update." }
  );

// PATCH /api/tickets/:id
// Admin-only ticket management and manual AI suggestion overrides.
router.patch(
  "/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Authentication required.",
        });
      }

      if (req.user.role !== UserRole.ADMIN) {
        return res.status(403).json({
          message:
            "Only admins can update ticket management fields.",
        });
      }

      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
          message: "Invalid ticket ID.",
        });
      }

      const parsed = adminUpdateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid ticket update.",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const data = parsed.data;

      // Only an existing administrator can be assigned.
      if (
        data.assignedAdminId !== undefined &&
        data.assignedAdminId !== null
      ) {
        const admin = await prisma.user.findFirst({
          where: {
            id: data.assignedAdminId,
            role: UserRole.ADMIN,
          },
          select: { id: true },
        });

        if (!admin) {
          return res.status(400).json({
            message:
              "The assigned user must be an existing admin.",
          });
        }
      }

      const existing = await prisma.ticket.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          message: "Ticket not found.",
        });
      }

      const updateData: {
        status?:
          | "OPEN"
          | "IN_PROGRESS"
          | "WAITING_ON_AUTHOR"
          | "RESOLVED"
          | "CLOSED";
        priority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
        category?: string;
        assignedAdminId?: number | null;
        resolvedAt?: Date | null;
      } = { ...data };

      // Track when a ticket is resolved or reopened.
      if (
        data.status === "RESOLVED" ||
        data.status === "CLOSED"
      ) {
        updateData.resolvedAt = new Date();
      } else if (data.status !== undefined) {
        updateData.resolvedAt = null;
      }

      // Manual updates change the active fields, not the original
      // AI suggestion fields.
      const ticket = await prisma.ticket.update({
        where: { id },
        data: updateData,
      });

      return res.json({
        message: "Ticket updated successfully.",
        ticket,
      });
    } catch (error) {
      console.error("Failed to update ticket:", error);

      return res.status(500).json({
        message: "Unable to update ticket.",
      });
    }
  }
);

// Validate public conversation messages.
const messageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

// POST /api/tickets/:id/messages
// Public conversation visible to the author and admins.
router.post(
  "/:id/messages",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Authentication required.",
        });
      }

      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
          message: "Invalid ticket ID.",
        });
      }

      const parsed = messageSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: "Message content is required.",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      // Authors may only message their own tickets.
      const ticket = await prisma.ticket.findFirst({
        where: {
          id,
          ...(req.user.role === UserRole.ADMIN
            ? {}
            : { authorId: req.user.id }),
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!ticket) {
        return res.status(404).json({
          message: "Ticket not found.",
        });
      }

      const message = await prisma.message.create({
        data: {
          ticketId: id,
          senderId: req.user.id,
          content: parsed.data.content,
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
      });

      // Update ticket activity so it moves up the queue.
      await prisma.ticket.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      return res.status(201).json({ message });
    } catch (error) {
      console.error("Failed to add message:", error);

      return res.status(500).json({
        message: "Unable to add message.",
      });
    }
  }
);

// Validate private internal notes.
const noteSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

// POST /api/tickets/:id/notes
// Only admins can create internal notes.
router.post(
  "/:id/notes",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Authentication required.",
        });
      }

      if (req.user.role !== UserRole.ADMIN) {
        return res.status(403).json({
          message: "Only admins can add internal notes.",
        });
      }

      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
          message: "Invalid ticket ID.",
        });
      }

      const parsed = noteSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: "Note content is required.",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const ticket = await prisma.ticket.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!ticket) {
        return res.status(404).json({
          message: "Ticket not found.",
        });
      }

      const note = await prisma.internalNote.create({
        data: {
          ticketId: id,
          authorId: req.user.id,
          content: parsed.data.content,
        },
      });

      return res.status(201).json({
        message: "Internal note added successfully.",
        note,
      });
    } catch (error) {
      console.error("Failed to add internal note:", error);

      return res.status(500).json({
        message: "Unable to add internal note.",
      });
    }
  }
);

// GET /api/tickets/:id/notes
// Admin-only retrieval. Internal notes must never be exposed to authors.
router.get(
  "/:id/notes",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Authentication required.",
        });
      }

      if (req.user.role !== UserRole.ADMIN) {
        return res.status(403).json({
          message: "Only admins can view internal notes.",
        });
      }

      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
          message: "Invalid ticket ID.",
        });
      }

      const ticket = await prisma.ticket.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!ticket) {
        return res.status(404).json({
          message: "Ticket not found.",
        });
      }

      const notes = await prisma.internalNote.findMany({
        where: { ticketId: id },
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return res.json({ notes });
    } catch (error) {
      console.error("Failed to fetch internal notes:", error);

      return res.status(500).json({
        message: "Unable to fetch internal notes.",
      });
    }
  }
);

export default router;
