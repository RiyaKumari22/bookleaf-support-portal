# BookLeaf Author Support Portal

A full-stack support portal for BookLeaf authors and administrators to manage book information, support tickets, and author communications. The application combines role-based access control with AI-assisted ticket classification and reply drafting.

## Features

### Author Portal
- Secure login with role-based access.
- View book information, publication status, sales, and royalty details.
- Create support tickets linked to a book or submitted as a general inquiry.
- Track ticket status and view public conversations with administrators.

### Administrator Portal
- View and manage the support ticket queue.
- Filter tickets and prioritize unresolved or high-priority requests.
- Update ticket status, category, and priority.
- Assign tickets to administrators.
- Send public responses and maintain private internal notes.

### AI-Assisted Support
- Classify tickets into predefined support categories.
- Suggest ticket priority and provide a brief classification reason.
- Generate draft replies using the BookLeaf knowledge base.
- Allow administrators to review and edit AI-generated drafts.
- Fall back to rule-based classification or manual replies when AI assistance is unavailable.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | JWT, bcrypt |
| Input validation | Zod |
| AI integration | Ollama with an OpenAI-compatible API |

## Project Structure

```text
bookleaf/
├── client/          # React frontend
├── server/          # Express API and database integration
├── docs/
│   └── API.md       # API documentation
└── README.md
```

## Prerequisites

- Node.js and npm
- PostgreSQL
- Ollama, if using local AI features

## Running Locally

### 1. Configure the backend

Open a terminal in the `server/` directory:

```bash
npm install
```

Configure the backend environment variables using your existing environment example and project configuration. These include the database connection and JWT authentication settings.

Ensure PostgreSQL is running and the required database is available. Apply the Prisma migrations and seed the database using the commands configured in the project.

### 2. Start the backend

From the `server/` directory:

```bash
npm run dev
```

The default API port is `5000`.

Check backend health at:

- API status: `http://localhost:5000/`
- API and database health: `http://localhost:5000/api/health`

### 3. Start the frontend

Open a second terminal in the `client/` directory:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, typically `http://localhost:5173`.

### 4. Configure local AI

Start Ollama and ensure the model configured in `AI_MODEL` is available.

The backend supports these settings:

| Variable | Default | Purpose |
|---|---|---|
| `AI_BASE_URL` | `http://localhost:11434/v1` | AI API endpoint |
| `AI_MODEL` | `llama3.2` | AI model name |

The AI service uses an OpenAI-compatible client. The default configuration targets a local Ollama instance.

If AI is unavailable, classification uses fallback rules and draft generation can return an empty draft so that an administrator can respond manually.

### 5. Run production build checks

In the `client/` directory:

```bash
npm run build
```

In the `server/` directory:

```bash
npm run build
```

## API Documentation

See [`docs/API.md`](docs/API.md) for available endpoints, authentication requirements, ticket categories, priorities, and access restrictions.

## AI Design and Reliability

The application uses AI to assist administrators rather than automatically sending responses to authors.

Ticket classification returns a suggested category, priority, and brief reason. If classification fails or returns invalid data, keyword-based fallback rules provide a category and priority.

Reply drafting uses the configured BookLeaf knowledge base and instructs the model not to invent account-specific facts or claim that an action has been completed without evidence. Administrators should review drafts before sending them.

AI requests use a 30-second timeout, with automatic client retries disabled. The application is designed to retain its core ticket workflow when AI assistance is unavailable.

## Security

- Protected endpoints require authentication.
- Authors can access only their own tickets and permitted book records.
- Administrator-only actions are protected by role checks.
- Passwords are verified using bcrypt.
- JWT authentication requires a configured `JWT_SECRET`.
- Input validation is applied to login, ticket creation, ticket updates, messages, and internal notes.
- Internal notes are restricted to administrators and are separate from public ticket conversations.
- Environment files, passwords, database credentials, JWT secrets, and other sensitive values must not be committed to version control.

## Limitations and Future Improvements

Potential future improvements include attachment uploads, automated API tests, more extensive audit logging, and additional validation of AI-generated suggestions.

## Submission Notes

Before sharing the repository, verify the setup instructions against the actual database migration and seed scripts. Use demonstration accounts and sample data, and do not include real author information or credentials.
