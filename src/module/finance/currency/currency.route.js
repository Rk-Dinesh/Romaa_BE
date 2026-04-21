import express from "express";
import {
  getCurrencies,
  getCurrencyByCode,
  upsertCurrency,
  setInactive,
  getRates,
  upsertRate,
} from "./currency.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const currencyRouter = express.Router();

// ── Static routes BEFORE param routes (:code) to avoid shadowing ─────────────

// GET  /finance/currency/list          — list all active currencies
currencyRouter.get(
  "/list",
  verifyJWT,
  verifyPermission("finance", "company_bank_details", "read"),
  getCurrencies
);

// GET  /finance/currency/rates         — list rates (?currency=USD&limit=50)
currencyRouter.get(
  "/rates",
  verifyJWT,
  verifyPermission("finance", "company_bank_details", "read"),
  getRates
);

// POST /finance/currency/upsert        — create or update a currency
currencyRouter.post(
  "/upsert",
  verifyJWT,
  verifyPermission("finance", "company_bank_details", "create"),
  upsertCurrency
);

// POST /finance/currency/rates/upsert  — insert or update a rate
currencyRouter.post(
  "/rates/upsert",
  verifyJWT,
  verifyPermission("finance", "company_bank_details", "create"),
  upsertRate
);

// ── Param routes ──────────────────────────────────────────────────────────────

// GET  /finance/currency/:code         — get a single currency by code
currencyRouter.get(
  "/:code",
  verifyJWT,
  verifyPermission("finance", "company_bank_details", "read"),
  getCurrencyByCode
);

// PATCH /finance/currency/:code/inactive — deactivate a currency
currencyRouter.patch(
  "/:code/inactive",
  verifyJWT,
  verifyPermission("finance", "company_bank_details", "edit"),
  setInactive
);

export default currencyRouter;
