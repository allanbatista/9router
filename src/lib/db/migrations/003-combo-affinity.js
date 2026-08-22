// Combo affinity: comboName + cacheKeyHash -> selectedModel (30m TTL, model-aware)
import { TABLES, buildCreateTableSql } from "../schema.js";

export default {
  version: 3,
  name: "combo-affinity",
  up(db) {
    const def = TABLES.comboAffinity;
    db.exec(buildCreateTableSql("comboAffinity", def));
    for (const idx of def.indexes || []) db.exec(idx);
  },
};
