
const OpenAI = require("openai");
const { knowledgeBase } = require("./knowledgeBase");

const ai = new OpenAI({
  baseURL: process.env.AI_BASE_URL || "http://localhost:11434/v1",
  apiKey: "ollama",
});

const model = process.env.AI_MODEL || "llama3.2";

const CATEGORIES = [
  "Royalty & Payments",
  "ISBN & Metadata Issues",
  "Printing & Quality",
  "Distribution & Availability",
  "Book Status & Production Updates",
  "General Inquiry",
];

const PRIORITIES = ["Critical", "High", "Medium", "Low"];

// Type for the ticket fields used by the AI functions.
type TicketInput = {
  subject: string;
  description: string;
  bookTitle?: string | null;
  category?: string | null;
  priority?: string | null;
};

// Send a prompt to the configured AI service.
async function askAI(systemPrompt: string, userPrompt: string) {
  const response = await ai.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI returned an empty response");
  }

  return content;
}

// 1. Automatically classify the ticket and predict priority.
async function classifyTicket(ticket: TicketInput) {
  const prompt = `
Analyze this support ticket.

Subject: ${ticket.subject}
Description: ${ticket.description}

Return ONLY a JSON object in this format:
{
  "category": "one allowed category",
  "priority": "one allowed priority",
  "reason": "brief explanation"
}

Allowed categories: ${CATEGORIES.join(", ")}
Allowed priorities: ${PRIORITIES.join(", ")}

Guidelines:
- Critical: urgent, severe or time-sensitive unresolved issues.
- High: significant payment problems or ISBN errors.
- Medium: normal operational issues requiring investigation.
- Low: general questions or non-urgent requests.
- Use the ticket content, not assumptions.
`;

  try {
    const raw = await askAI(
      "You classify BookLeaf support tickets. Return valid JSON only.",
      prompt
    );

    const result = JSON.parse(
      raw.replace(/```json|```/g, "").trim()
    );

    if (
      !CATEGORIES.includes(result.category) ||
      !PRIORITIES.includes(result.priority)
    ) {
      throw new Error("AI returned an invalid category or priority");
    }

    return {
      ...result,
      aiAvailable: true,
    };
  } catch (error) {
    console.error(
      "Ticket classification failed:",
      error instanceof Error ? error.message : String(error)
    );

    // Let the application continue without AI.
    return {
      category: null,
      priority: null,
      reason: "AI unavailable; manual review required.",
      aiAvailable: false,
    };
  }
}

// 2. Generate an editable response for the admin.
async function draftResponse(ticket: TicketInput) {
  const prompt = `
${knowledgeBase}

Write a helpful draft reply to this author.

Ticket subject: ${ticket.subject}
Ticket description: ${ticket.description}
Book: ${ticket.bookTitle || "General / Account Level"}
Current category: ${ticket.category || "Not classified"}
Current priority: ${ticket.priority || "Not classified"}

Rules:
- Be empathetic, professional and concise.
- Use the relevant BookLeaf policies above.
- Do not invent account-specific information or promise
  an unverified resolution.
- Explain the next step when more investigation is needed.
- Return only the message to the author, without a subject line.
`;

  try {
    const draft = await askAI(
      "You are a professional BookLeaf Publishing support representative.",
      prompt
    );

    return {
      draft: draft.trim(),
      aiAvailable: true,
    };
  } catch (error) {
    console.error(
      "AI draft failed:",
      error instanceof Error ? error.message : String(error)
    );

    return {
      draft: "",
      aiAvailable: false,
      message:
        "AI drafting is temporarily unavailable. Please write a reply manually.",
    };
  }
}

module.exports = {
  classifyTicket,
  draftResponse,
};
