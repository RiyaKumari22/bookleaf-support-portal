# BookLeaf Support Portal — Technical Approach

## 1. Architecture

The application uses a React and TypeScript frontend with a Node.js, Express, and TypeScript backend. PostgreSQL stores application data, with Prisma providing database access. The frontend communicates with the backend through REST endpoints.

## 2. Authentication and Access Control

JWT-based authentication protects the API, while bcrypt verifies user passwords. Role-based checks distinguish authors from administrators. Authors can access their own books and tickets, while administrators can manage the wider support queue. Private internal notes are restricted to administrators and remain separate from public conversations.

## 3. Ticket Management

Authors can submit tickets linked to their books or raise general inquiries. Administrators can review tickets, change categories and priorities, update statuses, assign tickets, send public replies, and add private internal notes. Input validation helps reject invalid requests before database operations.

## 4. AI Integration

The AI service uses an OpenAI-compatible client configured for Ollama by default. It assists with ticket categorization, priority suggestions, and draft response generation. Classification uses predefined categories and priorities, while reply drafting incorporates the configured BookLeaf knowledge base.

AI output is treated as a suggestion, not an automatically authorized action. Administrators can review and edit drafts before sending responses.

## 5. Reliability and Fallbacks

If AI classification fails or returns invalid output, keyword-based rules provide a fallback category and priority. If reply generation fails, the service returns an empty draft so an administrator can respond manually. This reduces dependence on AI availability for core ticket handling.

## 6. Key Trade-offs and Future Improvements

Local Ollama integration supports experimentation without requiring paid model API credits, provided a compatible local model is available. Rule-based fallbacks improve resilience but are less context-aware than AI classification. Future improvements could include automated tests, attachment storage, stronger audit logging, and more extensive monitoring of AI quality.
