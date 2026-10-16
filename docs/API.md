# BookLeaf Support Portal — API Documentation

## 1. Overview

The BookLeaf Support Portal API provides authentication, book access, support ticket management, AI-assisted ticket classification, public ticket conversations, and private internal notes.

**Local development URL:** `http://localhost:5000`

### Base endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Check whether the API is running |
| GET | `/api/health` | Check API and database health |

## 2. Authentication

### `POST /api/auth/login`

Authenticates a user using their email and password.

**Request body**
```json
{
  "email": "author@example.com",
  "password": "your-password"
}
```

**Successful response:** Returns a JWT token and user details, including the user's ID, name, email, and role.

**Common errors:** `400` for invalid input, `401` for invalid credentials, and `500` for server or authentication configuration errors.

Use the returned token for protected endpoints:

`Authorization: Bearer <token>`

Tokens expire after eight hours.

### `GET /api/auth/me`

Returns the authenticated user's ID, name, email, and role.

**Access:** Authenticated users.

### `GET /api/auth/admins`

Returns the list of administrator accounts.

**Access:** Administrators only.

## 3. Books

### `GET /api/books`

Retrieves the list of books accessible to the authenticated user.

- **Authors:** See only books associated with their account.
- **Administrators:** Can view all books.

The response includes book details such as title, ISBN, genre, publication date, publication status, MRP, copies sold, total royalty earned, royalty paid, and royalty pending.

**Successful response:** `200 OK`

```json
{
  "books": [
    {
      "id": 1,
      "title": "Example Book",
      "isbn": "9780000000000",
      "genre": "Fiction",
      "status": "PUBLISHED",
      "mrp": 299,
      "copiesSold": 100,
      "totalRoyaltyEarned": 5000,
      "royaltyPaid": 3000,
      "royaltyPending": 2000
    }
  ]
}
```

*The example is illustrative; actual values and date formats depend on the database records.*

### `GET /api/books/:id`

Retrieves detailed information about a specific book.

- **Authors:** Can access only their own books.
- **Administrators:** Can access any existing book.

The response includes additional details such as royalty per copy, last royalty payout date, print partner, and distribution availability.

**Successful response:** `200 OK`

```json
{
  "book": {
    "id": 1,
    "title": "Example Book",
    "isbn": "9780000000000",
    "royaltyPerCopy": 50,
    "copiesSold": 100,
    "totalRoyaltyEarned": 5000,
    "royaltyPaid": 3000,
    "royaltyPending": 2000
  }
}
```

**Common errors:**
- `400 Bad Request` — Invalid book ID.
- `401 Unauthorized` — Authentication required.
- `404 Not Found` — Book does not exist or the user is not permitted to access it.
- `500 Internal Server Error` — Unexpected server error.

## 4. Support Tickets

### `GET /api/tickets`

Retrieves support tickets.

- **Authors:** See only their own tickets.
- **Administrators:** See the full ticket queue.

The response includes ticket details, linked book information, and public conversation messages. Administrator responses also include author details.

### `POST /api/tickets`

Creates a support ticket and attempts AI-assisted classification and reply drafting.

**Request body**
```json
{
  "subject": "Incorrect ISBN on my book",
  "description": "The ISBN shown for my published book appears to be incorrect.",
  "bookId": 1
}
```

`bookId` is optional and can be `null` for a general inquiry.

**Validation**
- Subject: 4–200 characters.
- Description: 10–5,000 characters.
- If a book is selected, it must exist and be accessible to the user.

**Successful response:** `201 Created`, including the created ticket and an indicator of whether AI classification was available.

If AI classification fails, the route falls back to **General Inquiry** and **MEDIUM** priority. AI drafting errors do not prevent ticket creation.

### `PATCH /api/tickets/:id`

Updates ticket management fields.

**Access:** Administrators only.

**Supported fields**
```json
{
  "status": "IN_PROGRESS",
  "priority": "HIGH",
  "category": "Royalty & Payments",
  "assignedAdminId": 1
}
```

All fields are optional, but at least one must be supplied.

**Allowed statuses**
- `OPEN`
- `IN_PROGRESS`
- `WAITING_ON_AUTHOR`
- `RESOLVED`
- `CLOSED`

**Allowed priorities**
- `CRITICAL`
- `HIGH`
- `MEDIUM`
- `LOW`

**Allowed categories**
- `Royalty & Payments`
- `ISBN & Metadata Issues`
- `Printing & Quality`
- `Distribution & Availability`
- `Book Status & Production Updates`
- `General Inquiry`

`assignedAdminId` must identify an existing administrator, or be `null` to unassign the ticket.

The original AI-suggested category and priority are preserved when administrators manually update the active fields.

### `POST /api/tickets/:id/messages`

Adds a public conversation message to a ticket.

**Request body**
```json
{
  "content": "Could you please provide an update on my request?"
}
```

**Access:** Authenticated users. Authors can message only their own tickets; administrators can message tickets across the queue.

**Successful response:** `201 Created`, containing the new message and sender details.

### `GET /api/tickets/:id/notes`

Retrieves private internal notes for a ticket.

**Access:** Administrators only. Authors cannot retrieve internal notes.

### `POST /api/tickets/:id/notes`

Adds a private internal note to a ticket.

**Request body**
```json
{
  "content": "Verify the ISBN details before sending the final response."
}
```

**Access:** Administrators only.

## 5. AI-Assisted Ticket Handling

The portal uses an AI service compatible with the OpenAI Chat Completions API. By default, it connects to a locally running Ollama instance using the `llama3.2` model.

### Ticket classification

When an author creates a ticket, the AI attempts to classify it into one of six support categories and assign a priority.

The classification response includes:
- Suggested category
- Suggested priority
- Brief explanation for the classification
- Indicator of whether AI classification was available

If the AI request fails or returns an invalid response, the service uses rule-based fallback logic to determine a category and priority.

### Suggested replies

The system generates a draft response using the configured BookLeaf knowledge base. Drafts are intended to be concise, empathetic, professional, and grounded in the available policy information.

Administrators should review and edit suggested replies before sending them to authors. The service avoids claiming that actions have been completed without supporting evidence.

If AI drafting fails, the service returns an empty draft, allowing administrators to compose a reply manually.

### Configuration

The AI service supports these environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `AI_BASE_URL` | AI API endpoint | `http://localhost:11434/v1` |
| `AI_MODEL` | Model used for classification and drafting | `llama3.2` |

The configured model must be available through the selected API endpoint. The default setup requires Ollama to be running locally with the selected model available.

### Resilience and limitations

- AI classification failures trigger rule-based fallback logic.
- AI drafting failures do not prevent the ticket route from continuing.
- AI-generated categories and priorities can be overridden by administrators.
- Classification and drafting quality depend on the model and the information provided.
- Fallback classification is based on keyword rules and may not correctly interpret every request.


## 6. Error Handling

The API returns JSON error messages. Depending on the endpoint and failure, common status codes include:

| Status | Meaning |
|---|---|
| `400` | Invalid input or ticket ID |
| `401` | Authentication required or invalid credentials |
| `403` | Insufficient permissions |
| `404` | Requested ticket or account not found |
| `500` | Unexpected server error or service failure |

Validation errors may include field-level details.

## 7. Security Notes

- Protected endpoints require authentication.
- Authors are restricted to their own tickets and accessible books.
- Internal notes are restricted to administrators.
- Passwords are checked using bcrypt.
- JWT signing requires a configured `JWT_SECRET`.
- Never commit real passwords, JWT secrets, database credentials, or other sensitive environment variables to version control.
