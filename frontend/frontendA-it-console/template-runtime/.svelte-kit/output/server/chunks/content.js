const docsByPath = Object.freeze({
  "/": {
    title: "Operations Overview",
    summary: "Operate Mayple policy, HITL approvals, audit, and runtime health from a single IT console.",
    ctas: [
      { label: "Open Policy Center", href: "/maple?category=admin&view=policy&route=%2Fmaple%2Faudit" },
      { label: "Review HITL Queue", href: "/maple?category=analyze&view=control&route=%2Fmaple%2Fhitl" }
    ],
    sections: [
      {
        id: "control-plane",
        title: "Control Plane",
        body: "Frontend A is the monitoring and intervention console. Frontend B remains orchestration authoring and execution. Use Frontend A to observe B-origin runtime state and issue stop/intervention actions."
      },
      {
        id: "workflow",
        title: "Workflow",
        bullets: [
          "Check runtime posture in Monitor/Live.",
          "Use Chat for monitoring-agent guidance.",
          "Move to Intervene/Control to pause, resume, or stop.",
          "Use Intervene/Topology for runtime path inspection.",
          "Use System/Policy for approvals, guardrails, and recovery."
        ]
      },
      {
        id: "live-endpoints",
        title: "Live Endpoints",
        code: `GET /api/observability/orchestrations/summary
GET /api/observability/orchestrations/slo
GET /api/observability/orchestrations/audit-log
POST /api/orchestrations/executions/:executionId/pause
POST /api/orchestrations/executions/:executionId/resume
POST /api/orchestrations/executions/:executionId/cancel`
      }
    ]
  },
  "/quickstart": {
    title: "Quickstart",
    summary: "Connect to Mayple APIs, validate auth, and execute your first monitoring and intervention workflow.",
    sections: [
      {
        id: "choose-client",
        title: "Choose a Client",
        body: "Use cURL for direct calls or your preferred SDK for scripted operations.",
        code: `curl --version
npm install @example/protocol-api --save
pip install protocol_api
composer require protocol/sdk`
      },
      {
        id: "first-request",
        title: "First Request",
        body: "Request initial runtime visibility from observability endpoints.",
        code: `curl -G http://localhost:4101/api/observability/orchestrations/summary \\
  -H "Authorization: Bearer {token}"`
      },
      {
        id: "next-steps",
        title: "What's Next",
        bullets: [
          "Review Conversations and Messages references for payload shape.",
          "Configure Authentication and Webhooks.",
          "Use /maple for live runtime interventions."
        ]
      }
    ]
  },
  "/sdks": {
    title: "Protocol SDKs",
    summary: "Official JavaScript, Ruby, PHP, Python, and Go libraries are supported for API integration.",
    sections: [
      {
        id: "official-libraries",
        title: "Official Libraries",
        bullets: ["JavaScript/TypeScript", "Ruby", "PHP", "Python", "Go"]
      }
    ]
  },
  "/messages": {
    title: "Messages",
    summary: "Manage message lifecycle: list, send, retrieve, update, and delete.",
    sections: [
      {
        id: "message-model",
        title: "Message Model",
        bullets: ["id", "conversation_id", "contact", "message", "reactions", "attachments", "read_at", "created_at", "updated_at"]
      },
      {
        id: "endpoints",
        title: "Endpoints",
        code: `GET /v1/messages
POST /v1/messages
GET /v1/messages/:id
PUT /v1/messages/:id
DELETE /v1/messages/:id`
      }
    ]
  },
  "/conversations": {
    title: "Conversations",
    summary: "Manage conversation lifecycle: list, create, retrieve, update, and delete.",
    sections: [
      {
        id: "conversation-model",
        title: "Conversation Model",
        bullets: ["id", "contact_id", "group_id", "pinned_message_id", "is_pinned", "is_muted", "last_active_at", "created_at"]
      },
      {
        id: "endpoints",
        title: "Endpoints",
        code: `GET /v1/conversations
POST /v1/conversations
GET /v1/conversations/:id
PUT /v1/conversations/:id
DELETE /v1/conversations/:id`
      }
    ]
  },
  "/contacts": {
    title: "Contacts",
    summary: "Manage contact records and associated conversation identity.",
    sections: [
      {
        id: "contact-model",
        title: "Contact Model",
        bullets: ["id", "username", "phone_number", "avatar_url", "display_name", "conversation_id", "last_active_at", "created_at"]
      },
      {
        id: "endpoints",
        title: "Endpoints",
        code: `GET /v1/contacts
POST /v1/contacts
GET /v1/contacts/:id
PUT /v1/contacts/:id
DELETE /v1/contacts/:id`
      }
    ]
  },
  "/attachments": {
    title: "Attachments",
    summary: "Manage file attachments tied to messages and conversations.",
    sections: [
      {
        id: "attachment-model",
        title: "Attachment Model",
        bullets: ["id", "message_id", "filename", "file_url", "file_type", "file_size", "created_at"]
      },
      {
        id: "endpoints",
        title: "Endpoints",
        code: `GET /v1/attachments
POST /v1/attachments
GET /v1/attachments/:id
PUT /v1/attachments/:id
DELETE /v1/attachments/:id`
      }
    ]
  },
  "/authentication": {
    title: "Authentication",
    summary: "Authenticate requests with bearer tokens (recommended) or basic auth.",
    sections: [
      {
        id: "basic-auth",
        title: "Basic Authentication",
        code: `curl https://api.protocol.chat/v1/conversations \\
  -u username:password`
      },
      {
        id: "oauth",
        title: "OAuth2 Bearer Token",
        code: `curl https://api.protocol.chat/v1/conversations \\
  -H "Authorization: Bearer {token}"`
      }
    ]
  },
  "/errors": {
    title: "Errors",
    summary: "Use status codes and error type payloads to diagnose request failures.",
    sections: [
      {
        id: "status-codes",
        title: "Status Codes",
        bullets: ["2xx: success", "4xx: client/request issue", "5xx: server issue"]
      },
      {
        id: "error-types",
        title: "Error Types",
        code: `{
  "type": "invalid_request",
  "message": "Detailed failure message",
  "documentation_url": "https://protocol.chat/docs/errors/invalid_request"
}`
      }
    ]
  },
  "/groups": {
    title: "Groups",
    summary: "Manage group lifecycle and membership inside conversation contexts.",
    sections: [
      {
        id: "group-model",
        title: "Group Model",
        bullets: ["id", "name", "description", "avatar_url", "conversation_id", "contacts", "created_at", "archived_at"]
      },
      {
        id: "endpoints",
        title: "Endpoints",
        code: `GET /v1/groups
POST /v1/groups
GET /v1/groups/:id
PUT /v1/groups/:id
DELETE /v1/groups/:id`
      }
    ]
  },
  "/pagination": {
    title: "Pagination",
    summary: "Use cursors to navigate large collections without losing ordering context.",
    sections: [
      {
        id: "cursor-model",
        title: "Cursor Parameters",
        bullets: ["starting_after: fetch next page", "ending_before: fetch previous page", "limit: page size (up to 100)"]
      },
      {
        id: "example",
        title: "Example",
        code: `curl -G https://api.protocol.chat/v1/conversations \\
  -H "Authorization: Bearer {token}" \\
  -d starting_after="s4WycXedwhQrEFuM" \\
  -d limit=10`
      }
    ]
  },
  "/webhooks": {
    title: "Webhooks",
    summary: "Register webhook destinations and verify signatures for inbound events.",
    sections: [
      {
        id: "event-types",
        title: "Event Types",
        bullets: [
          "contact.created | contact.updated | contact.deleted",
          "conversation.created | conversation.updated | conversation.deleted",
          "message.created | message.updated | message.deleted",
          "group.created | group.updated | group.deleted",
          "attachment.created | attachment.updated | attachment.deleted"
        ]
      },
      {
        id: "security",
        title: "Signature Verification",
        code: `const signature = req.headers['x-protocol-signature']
const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex')
const verified = hash === signature`
      }
    ]
  }
});
const docsBySlug = Object.freeze(
  Object.fromEntries(
    Object.entries(docsByPath).map(([path, doc]) => [path === "/" ? "index" : path.slice(1), doc])
  )
);
export {
  docsBySlug as a,
  docsByPath as d
};
