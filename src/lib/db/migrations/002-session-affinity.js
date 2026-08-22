// Add sessionAffinity table for round-robin-affinity (provider:model:hash) — TTL 30m, 10k cap.
import { TABLES, buildCreateTableSql } from "../schema.js";

export default {
  version: 2,
  name: "session-affinity",
  up(db) {
    const def = TABLES.sessionAffinity;
    db.exec(buildCreateTableSql("sessionAffinity", def));
    for (const idx of def.indexes || []) db.exec(idx);
  },
};
