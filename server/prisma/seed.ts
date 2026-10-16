
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

type SampleBook = {
  book_id: string;
  title: string;
  isbn: string | null;
  genre: string | null;
  publication_date: string | null;
  status: string;
  mrp: number | null;
  author_royalty_per_copy: number | null;
  total_copies_sold: number;
  total_royalty_earned: number;
  royalty_paid: number;
  royalty_pending: number;
  last_royalty_payout_date: string | null;
  print_partner: string | null;
  available_on: string[];
};

type SampleAuthor = {
  author_id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  joined_date: string;
  books: SampleBook[];
};

function parseDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

async function main() {
  const authorEmail = process.env.DEMO_AUTHOR_EMAIL?.toLowerCase();
  const authorPassword = process.env.DEMO_AUTHOR_PASSWORD;
  const adminEmail = process.env.DEMO_ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
  const samplePassword = process.env.DEMO_SAMPLE_AUTHOR_PASSWORD;

  if (
    !authorEmail ||
    !authorPassword ||
    !adminEmail ||
    !adminPassword ||
    !samplePassword
  ) {
    throw new Error("Missing demo credentials in server/.env");
  }

  if (
    authorPassword.length < 12 ||
    adminPassword.length < 12 ||
    samplePassword.length < 12
  ) {
    throw new Error("All demo passwords must be at least 12 characters.");
  }

  const datasetPath = resolve(
    process.cwd(),
    "prisma",
    "bookleaf_sample_data.json"
  );

  const dataset = JSON.parse(
    readFileSync(datasetPath, "utf8")
  ) as { authors: SampleAuthor[] };

  if (!Array.isArray(dataset.authors) || dataset.authors.length !== 10) {
    throw new Error("Expected the assignment dataset to contain 10 authors.");
  }

  const totalBooks = dataset.authors.reduce(
    (total, author) => total + author.books.length,
    0
  );

  if (totalBooks !== 18) {
    throw new Error(`Expected 18 sample books; found ${totalBooks}.`);
  }

  const [authorHash, adminHash, sampleHash] = await Promise.all([
    bcrypt.hash(authorPassword, 12),
    bcrypt.hash(adminPassword, 12),
    bcrypt.hash(samplePassword, 12),
  ]);

  // Create or update the two dedicated demo accounts.
  await prisma.user.upsert({
    where: { email: authorEmail },
    update: { name: "Demo Author", role: UserRole.AUTHOR },
    create: {
      name: "Demo Author",
      email: authorEmail,
      password: authorHash,
      role: UserRole.AUTHOR,
    },
  });

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: "Demo Admin", role: UserRole.ADMIN },
    create: {
      name: "Demo Admin",
      email: adminEmail,
      password: adminHash,
      role: UserRole.ADMIN,
    },
  });

  // Import each source author and retain their original source ID.
  for (const author of dataset.authors) {
    const email = author.email.toLowerCase();

    const savedAuthor = await prisma.user.upsert({
      where: { email },
      update: {
        name: author.name,
        role: UserRole.AUTHOR,
        password: sampleHash,
        sourceAuthorId: author.author_id,
        phone: author.phone,
        city: author.city,
        joinedDate: parseDate(author.joined_date),
      },
      create: {
        name: author.name,
        email,
        password: sampleHash,
        role: UserRole.AUTHOR,
        sourceAuthorId: author.author_id,
        phone: author.phone,
        city: author.city,
        joinedDate: parseDate(author.joined_date),
      },
    });

    // Import each book and connect it to its correct author.
    for (const book of author.books) {
      const bookData = {
        title: book.title,
        isbn: book.isbn,
        genre: book.genre,
        publicationDate: parseDate(book.publication_date),
        status: book.status,
        mrp: book.mrp,
        royaltyPerCopy: book.author_royalty_per_copy,
        copiesSold: book.total_copies_sold,
        totalRoyaltyEarned: book.total_royalty_earned,
        royaltyPaid: book.royalty_paid,
        royaltyPending: book.royalty_pending,
        lastRoyaltyPayoutDate: parseDate(book.last_royalty_payout_date),
        printPartner: book.print_partner,
        availableOn: book.available_on ?? [],
        authorId: savedAuthor.id,
      };

      await prisma.book.upsert({
        where: { sourceBookId: book.book_id },
        update: bookData,
        create: {
          ...bookData,
          sourceBookId: book.book_id,
        },
      });
    }
  }

  const [sampleAuthors, sampleBooks, demoUsers] = await Promise.all([
    prisma.user.count({ where: { sourceAuthorId: { not: null } } }),
    prisma.book.count({ where: { sourceBookId: { not: null } } }),
    prisma.user.count({
      where: { email: { in: [authorEmail, adminEmail] } },
    }),
  ]);

  console.log("BookLeaf seed completed successfully.");
  console.log(`Sample authors: ${sampleAuthors}`);
  console.log(`Sample books: ${sampleBooks}`);
  console.log(`Demo accounts: ${demoUsers}`);
}

main()
  .catch((error) => {
    console.error("BookLeaf seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
