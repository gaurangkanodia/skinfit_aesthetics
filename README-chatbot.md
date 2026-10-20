# Skinfit Aesthetics chatbot

The website chatbot is a Node.js/TypeScript API with a LangChain.js RAG
pipeline. The browser widget is in `ai/`; Google AI and Pinecone credentials,
SMTP settings, and LangSmith configuration stay on the server. The API requires
Node.js 20 or newer. Serve the website and API over HTTPS.

## Knowledge source

No separate approved clinic document was present in the repository. The
starting `ai/knowledge/clinic.md` conservatively summarizes the clinic's
published concerns, treatments, and contact information. Have a qualified
clinic specialist review it before production use, or replace it with the
clinic-approved source. The chatbot uses retrieved passages from this document
for clinic and medical answers and declines unsupported questions. It does not
diagnose, prescribe, give individualized medical instructions, or promise
results.

## Environment and local setup

Copy `.env.example` to the repository-root `.env` and fill in the real values.
The API loads that file for local development; production should inject secrets
through the hosting platform's secret manager.

Required settings:

- `GOOGLE_API_KEY`: Google AI API key used for embeddings and responses.
- `PINECONE_API_KEY` and `PINECONE_INDEX`: Pinecone credentials and index name.
- `CLINIC_EMAIL`: clinic inbox for visitor-confirmed inquiries.
- `MAIL_FROM`: sender address authorized by the SMTP provider.
- `SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE`; optionally set both `SMTP_USER`
  and `SMTP_PASSWORD` for authenticated SMTP.
- `CHATBOT_TOKEN_SECRET`: a private random secret used to protect a reviewed
  appointment inquiry until explicit visitor confirmation.

Optional settings include `GOOGLE_EMBEDDING_MODEL` (defaults to
`gemini-embedding-001`), `GOOGLE_GENERATION_MODEL` (defaults to
`gemini-2.5-flash`), `PINECONE_NAMESPACE` (defaults to `skinfit-clinic`),
`CHATBOT_ALLOWED_ORIGINS`, `TRUST_PROXY`, and `PORT` (defaults to `3001`).

Create a Pinecone index with **1536 dimensions** and **cosine** similarity to
match the configured embedding dimensionality. From PowerShell at the
repository root:

```powershell
Copy-Item .env.example .env
Set-Location ai
npm ci
npm run build
npm start
```

For local development, use `npm run dev` instead of `npm start`. The widget
calls `/ai/api`; configure the website host to reverse proxy that path to the
Node API listening on port `3001`, or set `apiBase` in
`ai/chatbot-config.json` to the separately hosted API URL and add the website
origin to `CHATBOT_ALLOWED_ORIGINS`. Keep secrets out of the public website and
browser code.

## Load or update the knowledge document

1. Edit `ai/knowledge/clinic.md` with clinic-approved information only.
2. Ensure the server-side environment contains `GOOGLE_API_KEY`,
   `PINECONE_API_KEY`, `PINECONE_INDEX`, and (if used) `PINECONE_NAMESPACE`.
3. From the repository root, run:

   ```powershell
   Set-Location ai
   npm run ingest
   ```

   The LangChain splitter chunks the Markdown and the LangChain Pinecone vector
   store embeds and upserts the chunks. The script reports only the chunk count
   and never prints document content or credentials.
4. Deploy the updated knowledge file and API together. The API and ingestion
   script derive the same hash-versioned Pinecone namespace from the document.
   Re-run ingestion after each edit. Old hash-versioned namespaces are not
   queried; remove them from Pinecone when no longer needed.

## Appointment inquiries and email

The visitor provides a name and either an email address or phone number. An
optional note is limited to their stated concern or treatment interest. Before
sending, the visitor reviews the recipient, subject, message, AI-generated
summary, and plain-text conversation transcript attachment, then explicitly
confirms sending. The API sends the email through the configured SMTP provider
and reports success only after that provider accepts it. This is an inquiry,
not an appointment booking.

Contact details are used only to prepare the reviewed email. Chat messages are
sent to Google AI for retrieval embeddings and response generation. When a
visitor requests an appointment inquiry, their supplied conversation and note
are also sent to Google AI to produce the clearly labeled, concise summary.
Conversation state is kept in the browser's `sessionStorage` for the current
tab/session and can be cleared with **New conversation**. Message bodies,
contact details, and retrieved passages are not written to application logs
or sent to LangSmith.

## LangSmith

Tracing is off by default. To enable detailed, content-safe traces, set
`LANGSMITH_METADATA_TRACING=true`, provide `LANGSMITH_API_KEY`, optionally set
`LANGSMITH_PROJECT`, and restart the Node API. If tracing is enabled without an
API key, the server refuses to start.

Each chat appears as a `skinfit-chat-request` trace with nested spans for
`google-query-embedding`, `pinecone-similarity-search`, and
`google-answer-generation`. The spans record provider/model and index names,
timings, embedding dimensions, number of retrieved passages, safe source
labels, relevance scores, and success/error status. Appointment-summary model
calls are traced separately. The spans deliberately exclude the visitor's
message, chat history, generated answer or summary, prompts, contact details,
and retrieved document text. Automatic LangChain tracing stays disabled to
prevent its default prompt/response capture.

In LangSmith, open the configured project (default
`skinfit-chatbot-metadata`) and select a `skinfit-chat-request` run to view its
waterfall. When troubleshooting, compare the embedding, retrieval, and
generation span durations and statuses. Trace submission failures are reported
to the API log without chat content; they do not change a completed chatbot
response.

## Enable or disable

The shared switch for every page and the API is `ai/chatbot-config.json`:

```json
{
  "enabled": true,
  "apiBase": "/ai/api"
}
```

Set `"enabled"` to `false` to hide the greeting and widget and make the API
reject chatbot requests. If the configuration file is missing or invalid, the
feature fails closed. Restart the Node API after changing this file so the
server's startup mode is refreshed. Keep `apiBase` set to the public API URL.

## Deployment checklist

- Deploy the website pages, `ai/` browser files, knowledge document, and
  `ai/chatbot-config.json` together.
- Deploy the Node API on a supported Node.js 20+ host and configure the
  website's `/ai/api` route as a reverse proxy, or configure a public `apiBase`
  and the API's allowed website origins.
- Add production Google AI, Pinecone, clinic email, SMTP, and token-secret
  values to the hosting platform's secret manager. Never publish `.env`.
- Create the 1536-dimensional cosine Pinecone index and run `npm run ingest`
  after each approved document update.
- Verify the SMTP provider and authorized `MAIL_FROM` address before enabling
  appointment inquiries.
- Set `"enabled": false` in `ai/chatbot-config.json` for a shutdown, then
  restart the API. Verify the widget stays hidden and chat/appointment API
  requests return 404.
