import { app } from "../../../scripts/app.js";

const SETTING_ID = "vslinx.comboTypeFix";

app.registerExtension({
  name: "vslinx.comboTypeFix",
  settings: [
    {
      id: SETTING_ID,
      name: "Fix combo type mismatches between custom nodes",
      type: "boolean",
      defaultValue: true,
      category: ["vslinx", "Compatibility", "Combo type fix"],
      tooltip:
        'Fixes "Return type mismatch between linked nodes" errors caused by ' +
        "custom nodes like RES4LYF extending combo lists (e.g. schedulers) differently. " +
        "Disable if you experience unexpected behavior.",
      onChange: async (newVal) => {
        try {
          await fetch("/vslinx/combo_type_fix", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: !!newVal }),
          });
        } catch (e) {
          console.warn("[vsLinx] Failed to update combo type fix setting:", e);
        }
      },
    },
  ],
  async setup() {
    const v = app.extensionManager?.setting?.get?.(SETTING_ID);
    try {
      await fetch("/vslinx/combo_type_fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: v !== false }),
      });
    } catch (e) {
      // Server route may not be ready yet, that's fine — defaults to enabled
    }
  },
});
