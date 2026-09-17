/**
 * Server start hook (Next.js instrumentation): a tiny in-process scheduler for the nightly pricing job.
 * Every minute it checks the shop's local time; at 04:00 Asia/Ho_Chi_Minh (or on the first tick after a restart when
 * today's run is still missing) it refreshes the exchange rate, the ¥→VND cost prices and, when enabled, selling prices.
 * Set LIEN_SCHEDULER=off to disable (e.g. when an external cron calls /api/cron/pricing instead).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.LIEN_SCHEDULER === "off") return;
  const { runPricingJob, shopDay, shopHour } = await import("./lib/fx");
  const { getDb, getSetting } = await import("./lib/sqlite");
  let running = false;
  const tick = async () => {
    if (running) return;
    try {
      const today = shopDay();
      const last = getSetting(getDb(), "pricing_last_run_at");
      const lastDay = last ? shopDay(new Date(last)) : "";
      if (lastDay === today || shopHour() < 4) return;
      running = true;
      const r = await runPricingJob();
      console.info(`[pricing] nightly run: rate ${r.rate} (${r.rateSource}), costs ${r.costsUpdated}, prices ${r.pricesUpdated}`);
    } catch (e) {
      console.warn(`[pricing] nightly run failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 15_000); // catch-up shortly after start
  setInterval(tick, 60_000);
  // one-time: re-price default import legs written with the whole-parcel tariff (see lib/leg-fix-job.ts)
  setTimeout(async () => {
    try {
      const { fixDefaultImportLegs } = await import("./lib/leg-fix-job");
      const r = await fixDefaultImportLegs();
      if (r) console.info(`[legs] re-priced ${r.updated} default import legs pro-rata`);
    } catch (e) {
      console.warn(`[legs] fix failed: ${e instanceof Error ? e.message : e}`);
    }
  }, 8_000);
  // one-time: pin ¥→đ at 170 and recompute costs + formula prices at that rate (see lib/fixed-rate-job.ts)
  setTimeout(async () => {
    try {
      const { applyFixedRateOnce } = await import("./lib/fixed-rate-job");
      const r = await applyFixedRateOnce();
      if (r) console.info(`[fx] fixed rate ${r.rate}: costs ${r.costsUpdated}, prices ${r.pricesUpdated}, skipped on sale ${r.skippedSale}`);
    } catch (e) {
      console.warn(`[fx] fixed-rate job failed: ${e instanceof Error ? e.message : e}`);
    }
  }, 10_000);
  // one-time: iHerb source, hide products outside OS Drug / iHerb, reset warehouse data (see lib/catalog-scope-job.ts)
  setTimeout(async () => {
    try {
      const { applyCatalogScopeOnce } = await import("./lib/catalog-scope-job");
      const r = await applyCatalogScopeOnce();
      if (r) console.info(`[catalog] iherb ${r.iherb}, hidden ${r.hidden}, lots removed ${r.lotsRemoved}, purchases removed ${r.purchasesRemoved}, untracked ${r.untracked}`);
    } catch (e) {
      console.warn(`[catalog] scope job failed: ${e instanceof Error ? e.message : e}`);
    }
  }, 14_000);
  // one-time: re-shape the OS Drug import descriptions into headed sections (see lib/description-fix-job.ts)
  setTimeout(async () => {
    try {
      const { restructureImportedDescriptions } = await import("./lib/description-fix-job");
      const r = await restructureImportedDescriptions();
      if (r) console.info(`[desc] restructured ${r.updated} imported descriptions (${r.skipped} left as-is)`);
    } catch (e) {
      console.warn(`[desc] restructure failed: ${e instanceof Error ? e.message : e}`);
    }
  }, 12_000);
  // one-time: even out uploaded product thumbnails (white margins trimmed) — public/ thumbs are trimmed in the repo
  setTimeout(async () => {
    try {
      const { trimUploadedThumbs } = await import("./lib/thumb-trim-job");
      const r = await trimUploadedThumbs();
      if (r) console.info(`[thumbs] trimmed ${r.trimmed} uploaded thumbnails (${r.skipped} unchanged)`);
    } catch (e) {
      console.warn(`[thumbs] trim failed: ${e instanceof Error ? e.message : e}`);
    }
  }, 5_000);
}
