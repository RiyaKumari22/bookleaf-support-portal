
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";
import "./bookleaf-theme.css";


const API = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "") + "/api";


type User = {
  id: number;
  name: string;
  email: string;
  role: "AUTHOR" | "ADMIN";
};

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: "ADMIN";
};

type Book = {
  id: number;
  title: string;
  isbn: string | null;
  genre?: string | null;
  publicationDate?: string | null;
  status: string;
  mrp?: string | number | null;
  copiesSold?: number | null;
  totalRoyaltyEarned: string | number | null;
  royaltyPaid: string | number | null;
  royaltyPending: string | number | null;
};

type Message = {
  id: number;
  content?: string;
  body?: string;
  message?: string;
  createdAt?: string;
  createdBy?: { name?: string; role?: string };
  author?: { name?: string };
  sender?: { name?: string; role?: string };
};

type Ticket = {
  id: number;
  subject: string;
  description?: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  book?: { title: string } | null;
  author?: { id?: number; name?: string; email?: string } | null;
  messages?: Message[];
  assignedAdminId?: number | null;
  assignedAdmin?: { id: number; name: string; email?: string } | null;
  aiDraftReply?: string | null;
};

type InternalNote = {
  id: number;
  content?: string;
  body?: string;
  note?: string;
  createdAt?: string;
  author?: { name?: string };
  createdBy?: { name?: string };
};

const CATEGORIES = [
  "Royalty & Payments",
  "ISBN & Metadata Issues",
  "Printing & Quality",
  "Distribution & Availability",
  "Book Status & Production Updates",
  "General Inquiry",
];

const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_AUTHOR",
  "RESOLVED",
  "CLOSED",
];

function readSavedUser(): User | null {
  const saved = sessionStorage.getItem("bookleaf_user");

  if (!saved) return null;

  try {
    return JSON.parse(saved) as User;
  } catch {
    sessionStorage.removeItem("bookleaf_user");
    return null;
  }
}

function formatCurrency(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

function formatStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function getList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];

  if (data && typeof data === "object" && key in data) {
    const list = (data as Record<string, unknown>)[key];

    if (Array.isArray(list)) return list as T[];
  }

  return [];
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;

    if (typeof message === "string") return message;
  }

  return fallback;
}

function getMessageText(message: Message): string {
  return message.content ?? message.body ?? message.message ?? "";
}

function getNoteText(note: InternalNote): string {
  return note.content ?? note.body ?? note.note ?? "";
}

function getDateKey(value: string | undefined): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [token, setToken] = useState(
    () => sessionStorage.getItem("bookleaf_token") || "",
  );
  const [user, setUser] = useState<User | null>(readSavedUser);

  const [books, setBooks] = useState<Book[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [adminLoadError, setAdminLoadError] = useState("");

  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    null,
  );

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);

  // Author query form
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [selectedBookId, setSelectedBookId] = useState("");

  // Ticket conversation and AI-assisted reply draft
  const [replyText, setReplyText] = useState("");
  const [draftReply, setDraftReply] = useState("");
  const [internalNoteText, setInternalNoteText] = useState("");
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);

  // Admin ticket controls
  const [editStatus, setEditStatus] = useState("OPEN");
  const [editPriority, setEditPriority] = useState("MEDIUM");
  const [editCategory, setEditCategory] = useState("General Inquiry");
  const [editAssignedAdminId, setEditAssignedAdminId] = useState("");

  // Support queue filters
  const [ticketSearch, setTicketSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token],
  );

  const selectedTicket =
    tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  const filteredTickets = useMemo(() => {
    const query = ticketSearch.trim().toLowerCase();

    const filtered = tickets.filter((ticket) => {
      const matchesSearch =
        !query ||
        String(ticket.id).includes(query) ||
        ticket.subject.toLowerCase().includes(query) ||
        (ticket.description ?? "").toLowerCase().includes(query) ||
        (ticket.author?.name ?? "").toLowerCase().includes(query) ||
        (ticket.author?.email ?? "").toLowerCase().includes(query) ||
        (ticket.book?.title ?? "").toLowerCase().includes(query);

      const matchesStatus =
        filterStatus === "ALL" || ticket.status === filterStatus;

      const matchesPriority =
        filterPriority === "ALL" || ticket.priority === filterPriority;

      const matchesCategory =
        filterCategory === "ALL" || ticket.category === filterCategory;

      const createdDate = getDateKey(ticket.createdAt);

      const matchesDateFrom =
        !filterDateFrom ||
        (createdDate !== "" && createdDate >= filterDateFrom);

      const matchesDateTo =
        !filterDateTo ||
        (createdDate !== "" && createdDate <= filterDateTo);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesCategory &&
        matchesDateFrom &&
        matchesDateTo
      );
    });

    // Admin queue: unresolved tickets first, oldest first.
    // Resolved and closed tickets appear after unresolved tickets.
    if (user?.role === "ADMIN") {
      const resolvedStatuses = ["RESOLVED", "CLOSED"];

      filtered.sort((a, b) => {
        const aResolved = resolvedStatuses.includes(a.status);
        const bResolved = resolvedStatuses.includes(b.status);

        if (aResolved !== bResolved) {
          return aResolved ? 1 : -1;
        }

        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();

        return aTime - bTime;
      });
    }

    return filtered;
  }, [
    tickets,
    ticketSearch,
    filterStatus,
    filterPriority,
    filterCategory,
    filterDateFrom,
    filterDateTo,
    user?.role,
  ]);

  function clearFilters() {
    setTicketSearch("");
    setFilterStatus("ALL");
    setFilterPriority("ALL");
    setFilterCategory("ALL");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  function handleLogout() {
    sessionStorage.removeItem("bookleaf_token");
    sessionStorage.removeItem("bookleaf_user");

    setToken("");
    setUser(null);
    setBooks([]);
    setTickets([]);
    setAdmins([]);
    setSelectedTicketId(null);
    setEmail("");
    setPassword("");
    setSubject("");
    setDescription("");
    setSelectedBookId("");
    setReplyText("");
    setDraftReply("");
    setInternalNoteText("");
    setInternalNotes([]);
    setEditAssignedAdminId("");
    clearFilters();
    setError("");
    setNotice("");
    setAdminLoadError("");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Login failed."));
      }

      sessionStorage.setItem("bookleaf_token", data.token);
      sessionStorage.setItem("bookleaf_user", JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user as User);
      setPassword("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the server.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadAdmins(currentToken: string) {
    setLoadingAdmins(true);
    setAdminLoadError("");

    try {
      const response = await fetch(`${API}/auth/admins`, {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            data,
            "Unable to load administrator accounts.",
          ),
        );
      }

      const userList = getList<User>(data, "users");

      const adminList: AdminUser[] = userList
        .filter((account) => account.role === "ADMIN")
        .map((account) => ({
          id: account.id,
          name: account.name,
          email: account.email,
          role: "ADMIN",
        }));

      setAdmins(adminList);

      if (adminList.length === 0) {
        setAdminLoadError(
          "No administrator accounts were returned by the API.",
        );
      }
    } catch (err) {
      setAdmins([]);

      setAdminLoadError(
        err instanceof Error
          ? err.message
          : "Unable to load administrator accounts.",
      );
    } finally {
      setLoadingAdmins(false);
    }
  }

  async function loadDashboard(
    currentToken: string,
    role: User["role"],
    showLoading = true,
  ) {
    if (showLoading) {
      setLoadingDashboard(true);
      setError("");
    }

    try {
      const headers = {
        Authorization: `Bearer ${currentToken}`,
      };

      if (role === "AUTHOR") {
        const [bookResponse, ticketResponse] = await Promise.all([
          fetch(`${API}/books`, { headers }),
          fetch(`${API}/tickets`, { headers }),
        ]);

        if (
          bookResponse.status === 401 ||
          ticketResponse.status === 401
        ) {
          handleLogout();
          setError("Your session has expired. Please sign in again.");
          return;
        }

        if (!bookResponse.ok || !ticketResponse.ok) {
          throw new Error("Unable to load your books and support tickets.");
        }

        const bookData = await bookResponse.json();
        const ticketData = await ticketResponse.json();

        setBooks(getList<Book>(bookData, "books"));
        setTickets(getList<Ticket>(ticketData, "tickets"));
      } else {
        const response = await fetch(`${API}/tickets`, { headers });

        if (response.status === 401) {
          handleLogout();
          setError("Your session has expired. Please sign in again.");
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load the support queue.");
        }

        const data = await response.json();
        setTickets(getList<Ticket>(data, "tickets"));
      }
    } catch (err) {
      if (showLoading) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load the dashboard.",
        );
      }
    } finally {
      if (showLoading) setLoadingDashboard(false);
    }
  }

  // Load data after login or when a saved session is restored.
  useEffect(() => {
    if (!token || !user) return;

    void loadDashboard(token, user.role);

    if (user.role === "ADMIN") {
      void loadAdmins(token);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role]);

  // Refresh ticket and book information every five seconds.
  useEffect(() => {
    if (!token || !user) return;

    const intervalId = window.setInterval(() => {
      void loadDashboard(token, user.role, false);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role]);

  // Load controls and internal notes when a ticket is selected.
  useEffect(() => {
    if (!selectedTicket) return;

    setEditStatus(selectedTicket.status);
    setEditPriority(selectedTicket.priority);
    setEditCategory(selectedTicket.category);
    setEditAssignedAdminId(
      selectedTicket.assignedAdminId == null
        ? ""
        : String(selectedTicket.assignedAdminId),
    );

    setReplyText("");
    setDraftReply(selectedTicket.aiDraftReply ?? "");
    setInternalNoteText("");
    setInternalNotes([]);

    if (user?.role !== "ADMIN" || !token) return;

    let cancelled = false;

  async function loadInternalNotes() {
  if (!selectedTicket) {
    setInternalNotes([]);
    return;
  }

  try {
    const response = await fetch(
      `${API}/tickets/${selectedTicket.id}/notes`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) return;

    const data = await response.json();

    if (!cancelled) {
      setInternalNotes(getList<InternalNote>(data, "notes"));
    }
  } catch {
    if (!cancelled) setInternalNotes([]);
  }
}

    void loadInternalNotes();

    return () => {
      cancelled = true;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketId, token, user?.role]);

  async function handleCreateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!token || !user || user.role !== "AUTHOR") {
      setError("Please sign in with an author account.");
      return;
    }

    setCreatingTicket(true);

    try {
      const payload: {
        subject: string;
        description: string;
        bookId?: number;
      } = {
        subject: subject.trim(),
        description: description.trim(),
      };

      if (selectedBookId) {
        payload.bookId = Number(selectedBookId);
      }

      const response = await fetch(`${API}/tickets`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Unable to create your support ticket."),
        );
      }

      const createdId = data.ticket?.id ?? data.id;

      setSubject("");
      setDescription("");
      setSelectedBookId("");

      setNotice(
        `Your support ticket was created successfully${
          createdId ? ` (#${createdId})` : ""
        }.`,
      );

      await loadDashboard(token, user.role, false);

      if (createdId) {
        setSelectedTicketId(Number(createdId));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create your support ticket.",
      );
    } finally {
      setCreatingTicket(false);
    }
  }

  async function updateTicket() {
    if (!token || !selectedTicket) return;

    setSavingTicket(true);
    setError("");
    setNotice("");

    try {
      const payload: {
        status: string;
        priority: string;
        category: string;
        assignedAdminId?: number | null;
      } = {
        status: editStatus,
        priority: editPriority,
        category: editCategory,
      };

      const originalAssignment =
        selectedTicket.assignedAdminId == null
          ? ""
          : String(selectedTicket.assignedAdminId);

      if (editAssignedAdminId !== originalAssignment) {
        if (editAssignedAdminId.trim() === "") {
          payload.assignedAdminId = null;
        } else {
          const adminId = Number(editAssignedAdminId);

          if (!Number.isInteger(adminId) || adminId < 1) {
            throw new Error("Select a valid administrator.");
          }

          payload.assignedAdminId = adminId;
        }
      }

      const response = await fetch(
        `${API}/tickets/${selectedTicket.id}`,
        {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Unable to update the ticket."),
        );
      }

      setNotice(`Ticket #${selectedTicket.id} was updated.`);

      if (user) {
        await loadDashboard(token, user.role, false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update the ticket.",
      );
    } finally {
      setSavingTicket(false);
    }
  }

  function useDraftInReplyBox() {
    if (!draftReply.trim()) {
      setError("The suggested reply is empty. Enter some text first.");
      return;
    }

    setReplyText(draftReply);
    setError("");
    setNotice("Draft copied to the reply box. Review it before sending.");
  }

  async function sendPublicReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !user || !selectedTicket || !replyText.trim()) return;

    setSendingReply(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API}/tickets/${selectedTicket.id}/messages`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ content: replyText.trim() }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Unable to send your reply."),
        );
      }

      setReplyText("");
      setNotice("Your reply was sent.");

      await loadDashboard(token, user.role, false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to send your reply.",
      );
    } finally {
      setSendingReply(false);
    }
  }

  async function addInternalNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !token ||
      user?.role !== "ADMIN" ||
      !selectedTicket ||
      !internalNoteText.trim()
    ) {
      return;
    }

    setSavingNote(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API}/tickets/${selectedTicket.id}/notes`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ content: internalNoteText.trim() }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Unable to save the internal note."),
        );
      }

      setInternalNoteText("");
      setNotice("Internal note saved.");

      const notesResponse = await fetch(
        `${API}/tickets/${selectedTicket.id}/notes`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (notesResponse.ok) {
        const notesData = await notesResponse.json();
        setInternalNotes(getList<InternalNote>(notesData, "notes"));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save the internal note.",
      );
    } finally {
      setSavingNote(false);
    }
  }

  const totalEarned = books.reduce(
    (sum, book) => sum + Number(book.totalRoyaltyEarned ?? 0),
    0,
  );

  const totalPaid = books.reduce(
    (sum, book) => sum + Number(book.royaltyPaid ?? 0),
    0,
  );

  const totalPending = books.reduce(
    (sum, book) => sum + Number(book.royaltyPending ?? 0),
    0,
  );

  const earnedIsComplete = books.every(
    (book) =>
      book.totalRoyaltyEarned !== null &&
      book.totalRoyaltyEarned !== undefined,
  );

  const paidIsComplete = books.every(
    (book) =>
      book.royaltyPaid !== null && book.royaltyPaid !== undefined,
  );

  const pendingIsComplete = books.every(
    (book) =>
      book.royaltyPending !== null &&
      book.royaltyPending !== undefined,
  );

  if (!token || !user) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand-mark">B</div>
          <p className="eyebrow">BOOKLEAF PUBLISHING</p>
          <h1>Author Support Portal</h1>
          <p className="subtitle">
            Your books, royalties, and support requests — all in one place.
          </p>

          <form onSubmit={handleLogin}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="footer-note">
            Secure access for BookLeaf authors and support administrators.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="brand-lockup">
          <div className="brand-mark">B</div>
          <div>
            <strong>BookLeaf</strong>
            <p>Support Portal</p>
          </div>
        </div>

        <div className="user-area">
          <div>
            <strong>{user.name}</strong>
            <p>
              {user.role === "ADMIN"
                ? "Support Administrator"
                : "Author account"}
            </p>
          </div>

          <button className="secondary-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        <p className="eyebrow">
          {user.role === "ADMIN" ? "ADMIN WORKSPACE" : "AUTHOR WORKSPACE"}
        </p>

        <h1>
          {user.role === "ADMIN"
            ? "Support overview"
            : `Welcome back, ${user.name}`}
        </h1>

        <p className="subtitle">
          {user.role === "ADMIN"
            ? "Review and manage author support requests."
            : "Your books and support requests, in one place."}
        </p>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        {notice && (
          <p className="success-message" role="status">
            {notice}
          </p>
        )}

        {loadingDashboard && (
          <p className="subtitle">Loading the latest information...</p>
        )}

        {user.role === "AUTHOR" ? (
          <>
            <div className="stats-grid">
              <article className="stat-card">
                <span>Total books</span>
                <strong>{books.length}</strong>
              </article>

              <article className="stat-card">
                <span>Royalties earned</span>
                <strong>
                  {earnedIsComplete ? formatCurrency(totalEarned) : "—"}
                </strong>
              </article>

              <article className="stat-card">
                <span>Royalties paid</span>
                <strong>
                  {paidIsComplete ? formatCurrency(totalPaid) : "—"}
                </strong>
              </article>

              <article className="stat-card">
                <span>Royalties pending</span>
                <strong>
                  {pendingIsComplete ? formatCurrency(totalPending) : "—"}
                </strong>
              </article>
            </div>

            <section className="panel">
              <div className="panel-heading">
                <h2>My books</h2>
                <span>{books.length} books</span>
              </div>

              {books.length === 0 ? (
                <p>No books found for this account.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Book title</th>
                        <th>ISBN</th>
                        <th>Genre</th>
                        <th>Status</th>
                        <th>Earned</th>
                        <th>Paid</th>
                        <th>Pending</th>
                      </tr>
                    </thead>

                    <tbody>
                      {books.map((book) => (
                        <tr key={book.id}>
                          <td>{book.title}</td>
                          <td>{book.isbn || "Not provided"}</td>
                          <td>{book.genre || "—"}</td>
                          <td>
                            <span className="status-pill">
                              {formatStatus(book.status)}
                            </span>
                          </td>
                          <td>{formatCurrency(book.totalRoyaltyEarned)}</td>
                          <td>{formatCurrency(book.royaltyPaid)}</td>
                          <td>{formatCurrency(book.royaltyPending)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Submit a Query</h2>
                <span>Author support</span>
              </div>

              <p className="subtitle">
                Tell us what you need help with. Our support team will review
                your request.
              </p>

              <form className="ticket-form" onSubmit={handleCreateTicket}>
                <label htmlFor="ticket-book">Related book</label>
                <select
                  id="ticket-book"
                  value={selectedBookId}
                  onChange={(event) => setSelectedBookId(event.target.value)}
                >
                  <option value="">General query / account-level issue</option>
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}
                    </option>
                  ))}
                </select>

                <label htmlFor="ticket-subject">Subject</label>
                <input
                  id="ticket-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="e.g. Incorrect ISBN on my book"
                  minLength={4}
                  maxLength={200}
                  required
                />

                <label htmlFor="ticket-description">Describe your issue</label>
                <textarea
                  id="ticket-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Provide details so our support team can help you."
                  minLength={10}
                  maxLength={5000}
                  rows={5}
                  required
                />

                <button type="submit" disabled={creatingTicket}>
                  {creatingTicket ? "Submitting..." : "Submit support ticket"}
                </button>
              </form>
            </section>
          </>
        ) : (
          <div className="stats-grid">
            <article className="stat-card">
              <span>All support tickets</span>
              <strong>{tickets.length}</strong>
            </article>

            <article className="stat-card">
              <span>Open tickets</span>
              <strong>
                {tickets.filter((ticket) => ticket.status === "OPEN").length}
              </strong>
            </article>

            <article className="stat-card">
              <span>High / critical priority</span>
              <strong>
                {
                  tickets.filter((ticket) =>
                    ["HIGH", "CRITICAL"].includes(ticket.priority),
                  ).length
                }
              </strong>
            </article>
          </div>
        )}

        <section className="panel">
          <div className="panel-heading">
            <h2>
              {user.role === "ADMIN" ? "Support queue" : "My support tickets"}
            </h2>
            <span>
              {filteredTickets.length} of {tickets.length} tickets
            </span>
          </div>

          <div className="ticket-filters">
            <label htmlFor="ticket-search">Search tickets</label>
            <input
              id="ticket-search"
              type="search"
              value={ticketSearch}
              onChange={(event) => setTicketSearch(event.target.value)}
              placeholder="Search subject, description, author, book or ID..."
            />

            <div className="filter-grid">
              <div>
                <label htmlFor="filter-status">Status</label>
                <select
                  id="filter-status"
                  value={filterStatus}
                  onChange={(event) => setFilterStatus(event.target.value)}
                >
                  <option value="ALL">All statuses</option>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filter-priority">Priority</label>
                <select
                  id="filter-priority"
                  value={filterPriority}
                  onChange={(event) => setFilterPriority(event.target.value)}
                >
                  <option value="ALL">All priorities</option>
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filter-category">Category</label>
                <select
                  id="filter-category"
                  value={filterCategory}
                  onChange={(event) => setFilterCategory(event.target.value)}
                >
                  <option value="ALL">All categories</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filter-date-from">Created from</label>
                <input
                  id="filter-date-from"
                  type="date"
                  value={filterDateFrom}
                  max={filterDateTo || undefined}
                  onChange={(event) => setFilterDateFrom(event.target.value)}
                />
              </div>

              <div>
                <label htmlFor="filter-date-to">Created to</label>
                <input
                  id="filter-date-to"
                  type="date"
                  value={filterDateTo}
                  min={filterDateFrom || undefined}
                  onChange={(event) => setFilterDateTo(event.target.value)}
                />
              </div>
            </div>

            <button
              className="secondary-button"
              type="button"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>

          {filteredTickets.length === 0 ? (
            <p>No tickets match your search and filters.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    {user.role === "ADMIN" && <th>Author</th>}
                    <th>Book</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>
                        #{ticket.id} · {ticket.subject}
                      </td>

                      {user.role === "ADMIN" && (
                        <td>
                          {ticket.author?.name ||
                            ticket.author?.email ||
                            "—"}
                        </td>
                      )}

                      <td>{ticket.book?.title || "General query"}</td>
                      <td>{ticket.category}</td>

                      <td>
                        <span
                          className={`status-pill ${
                            ticket.priority === "CRITICAL"
                              ? "priority-critical"
                              : ticket.priority === "HIGH"
                                ? "priority-high"
                                : ""
                          }`}
                        >
                          {ticket.priority}
                        </span>
                      </td>

                      <td>
                        <span className="status-pill">
                          {formatStatus(ticket.status)}
                        </span>
                      </td>

                      <td>
                        {ticket.createdAt
                          ? new Date(ticket.createdAt).toLocaleDateString(
                              "en-IN",
                            )
                          : "—"}
                      </td>

                      <td>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            setSelectedTicketId(ticket.id);
                            setError("");
                            setNotice("");
                          }}
                        >
                          View ticket
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedTicket && (
          <section className="panel ticket-details-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">TICKET #{selectedTicket.id}</p>
                <h2>{selectedTicket.subject}</h2>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={() => setSelectedTicketId(null)}
              >
                Close details
              </button>
            </div>

            <p>
              <strong>Book:</strong>{" "}
              {selectedTicket.book?.title || "General query"}
            </p>

            {user.role === "ADMIN" && (
              <p>
                <strong>Author:</strong>{" "}
                {selectedTicket.author?.name ||
                  selectedTicket.author?.email ||
                  "—"}
              </p>
            )}

            {user.role === "ADMIN" && (
              <p>
                <strong>Currently assigned to:</strong>{" "}
                {admins.find(
                  (admin) => admin.id === selectedTicket.assignedAdminId,
                )?.name ||
                  selectedTicket.assignedAdmin?.name ||
                  (selectedTicket.assignedAdminId
                    ? `Admin ID ${selectedTicket.assignedAdminId}`
                    : "Unassigned")}
              </p>
            )}

            <p>
              <strong>Submitted:</strong>{" "}
              {selectedTicket.createdAt
                ? new Date(selectedTicket.createdAt).toLocaleString("en-IN")
                : "—"}
            </p>

            {selectedTicket.description && (
              <div className="ticket-description">
                <h3>Issue description</h3>
                <p>{selectedTicket.description}</p>
              </div>
            )}

            {user.role === "ADMIN" && (
              <div className="ticket-admin-controls">
                <h3>Manage ticket</h3>

                <div className="ticket-form">
                  <label htmlFor="edit-status">Status</label>
                  <select
                    id="edit-status"
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value)}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatStatus(status)}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="edit-priority">Priority</label>
                  <select
                    id="edit-priority"
                    value={editPriority}
                    onChange={(event) => setEditPriority(event.target.value)}
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="edit-category">Category</label>
                  <select
                    id="edit-category"
                    value={editCategory}
                    onChange={(event) => setEditCategory(event.target.value)}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="edit-assignment">
                    Assign to administrator
                  </label>

                  <select
                    id="edit-assignment"
                    value={editAssignedAdminId}
                    onChange={(event) =>
                      setEditAssignedAdminId(event.target.value)
                    }
                    disabled={loadingAdmins || admins.length === 0}
                  >
                    <option value="">Unassigned</option>
                    {admins.map((admin) => (
                      <option key={admin.id} value={String(admin.id)}>
                        {admin.name} ({admin.email})
                      </option>
                    ))}
                  </select>

                  {loadingAdmins && (
                    <p className="subtitle">Loading administrators...</p>
                  )}

                  {adminLoadError && (
                    <p className="error-message" role="alert">
                      {adminLoadError}
                    </p>
                  )}

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      if (token) void loadAdmins(token);
                    }}
                    disabled={loadingAdmins}
                  >
                    {loadingAdmins
                      ? "Refreshing..."
                      : "Refresh administrator list"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void updateTicket()}
                    disabled={savingTicket}
                  >
                    {savingTicket ? "Saving..." : "Save ticket changes"}
                  </button>
                </div>
              </div>
            )}

            {user.role === "ADMIN" && (
              <section className="ticket-admin-controls">
                <h3>AI-Assisted Reply Draft</h3>

                <p className="subtitle">
                  Review this suggested response carefully. You can edit it
                  before inserting it into the public reply box.
                </p>

                {selectedTicket.aiDraftReply?.trim() ? (
                  <>
                    <label htmlFor="ai-draft-reply">
                      Suggested reply (editable)
                    </label>

                    <textarea
                      id="ai-draft-reply"
                      value={draftReply}
                      onChange={(event) => setDraftReply(event.target.value)}
                      placeholder="Review or edit the suggested reply..."
                      maxLength={5000}
                      rows={5}
                    />

                    <button
                      type="button"
                      onClick={useDraftInReplyBox}
                      disabled={!draftReply.trim()}
                    >
                      Use Draft in Reply Box
                    </button>
                  </>
                ) : (
                  <p>
                    No suggested reply is available for this ticket. You can
                    still write a response in the public reply box below.
                  </p>
                )}
              </section>
            )}

            <div className="ticket-conversation">
              <h3>Conversation</h3>

              {selectedTicket.messages &&
              selectedTicket.messages.length > 0 ? (
                selectedTicket.messages.map((message) => (
                  <article className="conversation-message" key={message.id}>
                    <div className="conversation-message-heading">
                      <strong>
                        {message.createdBy?.name ||
                          message.author?.name ||
                          message.sender?.name ||
                          "Support participant"}
                      </strong>

                      <span>
                        {message.createdAt
                          ? new Date(message.createdAt).toLocaleString(
                              "en-IN",
                            )
                          : ""}
                      </span>
                    </div>

                    <p>
                      {getMessageText(message) ||
                        "No message text provided."}
                    </p>
                  </article>
                ))
              ) : (
                <p>No public replies have been added to this ticket yet.</p>
              )}
            </div>

            <form className="ticket-form" onSubmit={sendPublicReply}>
              <h3>
                {user.role === "ADMIN" ? "Reply to author" : "Send a reply"}
              </h3>

              <label htmlFor="public-reply">Message</label>

              <textarea
                id="public-reply"
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder="Write a response..."
                minLength={1}
                maxLength={5000}
                rows={4}
                required
              />

              <button type="submit" disabled={sendingReply}>
                {sendingReply ? "Sending..." : "Send public reply"}
              </button>
            </form>

            {user.role === "ADMIN" && (
              <div className="ticket-internal-notes">
                <h3>Internal notes</h3>

                <p>
                  Internal notes are for the support team and are not visible
                  to authors.
                </p>

                {internalNotes.length > 0 ? (
                  internalNotes.map((note) => (
                    <article className="conversation-message" key={note.id}>
                      <div className="conversation-message-heading">
                        <strong>
                          {note.author?.name ||
                            note.createdBy?.name ||
                            "Admin"}
                        </strong>

                        <span>
                          {note.createdAt
                            ? new Date(note.createdAt).toLocaleString(
                                "en-IN",
                              )
                            : ""}
                        </span>
                      </div>

                      <p>{getNoteText(note) || "No note text provided."}</p>
                    </article>
                  ))
                ) : (
                  <p>No internal notes for this ticket yet.</p>
                )}

                <form className="ticket-form" onSubmit={addInternalNote}>
                  <label htmlFor="internal-note">Add internal note</label>

                  <textarea
                    id="internal-note"
                    value={internalNoteText}
                    onChange={(event) =>
                      setInternalNoteText(event.target.value)
                    }
                    placeholder="Add context for other support administrators..."
                    minLength={1}
                    maxLength={5000}
                    rows={3}
                    required
                  />

                  <button type="submit" disabled={savingNote}>
                    {savingNote ? "Saving..." : "Save internal note"}
                  </button>
                </form>
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
