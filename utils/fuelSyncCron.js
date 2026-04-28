import cron from "node-cron";
import logger from "../src/config/logger.js";
import FuelTelemetryService from "../src/module/assets/fueltelemetry/fueltelemetry.service.js";

// Default: every 6 hours on the hour. Override via FUEL_SYNC_CRON env var.
const SCHEDULE = process.env.FUEL_SYNC_CRON || "*/15 * * * *"; // prod: "0 */6 * * *" (every 6 hrs)

export const startFuelSyncCron = () => {
  cron.schedule(SCHEDULE, async () => {
    logger.info(`[fuelSync] cron tick (${SCHEDULE})`);
    try {
      const stats = await FuelTelemetryService.syncAllActive({ source: "CRON" });
      logger.info(`[fuelSync] cron complete: ${JSON.stringify(stats)}`);
    } catch (err) {
      logger.error(`[fuelSync] cron failed: ${err.message}`);
    }
  });
  logger.info(`[fuelSync] scheduled with cron "${SCHEDULE}"`);
};
