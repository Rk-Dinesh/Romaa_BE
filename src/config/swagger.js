import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Romaa Finance API",
      version: "1.0.0",
      description: "Enterprise finance module — purchase bills, vouchers, journal entries, reports, bulk ops",
    },
    servers: [
      { url: "/api/v1", description: "Versioned API" },
      { url: "/",       description: "Legacy (unversioned)" },
    ],
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        CookieAuth: { type: "apiKey", in: "cookie", name: "accessToken" },
      },
      schemas: {
        PaginatedResponse: {
          type: "object",
          properties: {
            status: { type: "boolean" },
            data:   { type: "array", items: {} },
            pagination: {
              type: "object",
              properties: {
                current_page:  { type: "integer" },
                page_size:     { type: "integer" },
                total_items:   { type: "integer" },
                total_pages:   { type: "integer" },
              },
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            status:  { type: "boolean", example: false },
            message: { type: "string" },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: [
    "./src/module/finance/purchasebill/purchasebill.route.js",
    "./src/module/finance/paymentvoucher/paymentvoucher.route.js",
    "./src/module/finance/journalentry/journalentry.route.js",
    "./src/module/finance/bulk/bulk.route.js",
    "./src/module/finance/reports/reports.route.js",
    "./src/module/finance/currency/currency.route.js",
    "./src/module/finance/audit/auditlog.route.js",
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
