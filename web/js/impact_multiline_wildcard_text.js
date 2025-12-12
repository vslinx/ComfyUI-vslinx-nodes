// ComfyUI/web/extensions/impact_multiline_wildcard_text.js

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

let wildcards_list = [];
let wildcards_loaded = false;

async function loadWildcards() {
    if (wildcards_loaded) return wildcards_list;

    try {
        const res = await api.fetchApi("/impact/wildcards/list");
        const data = await res.json();

        if (Array.isArray(data)) {
            wildcards_list = data;
        } else if (Array.isArray(data?.data)) {
            wildcards_list = data.data;
        } else if (Array.isArray(data?.list)) {
            wildcards_list = data.list;
        } else {
            wildcards_list = [];
        }

        wildcards_loaded = true;
    } catch (err) {
        console.error("vsLinx_ImpactMultilineWildcardText: failed to load wildcards:", err);
        wildcards_list = [];
    }

    return wildcards_list;
}

function insertWildcardIntoText(node, wildcard) {
    if (!wildcard) return;

    const textWidget =
        node.widgets?.find((w) => w.name === "text") ?? node.widgets?.[0];
    if (!textWidget) return;

    const current = textWidget.value || "";
    let newText = current;

    if (current.trim() !== "" && !current.trim().endsWith(",")) {
        newText += ", ";
    }

    newText += wildcard;

    textWidget.value = newText;

    if (Array.isArray(node.widgets_values)) {
        node.widgets_values[0] = newText;
    }

    app.canvas.setDirty(true);
}

function setupWildcardDropdown(node) {
    if (node.comfyClass !== "vsLinx_ImpactMultilineWildcardText") return;

    const textWidget =
        node.widgets?.find((w) => w.name === "text") ?? node.widgets?.[0];
    if (textWidget && textWidget.inputEl) {
        textWidget.inputEl.placeholder =
            "Text (multiline)";
    }

    const dropdown = node.addWidget(
        "combo",
        "Add wildcard",
        "Select wildcard",
        (value) => {
            if (!value || value === "Select wildcard") return;
            insertWildcardIntoText(node, value);
        },
        {
            values: ["Select wildcard"], 
        }
    );

    loadWildcards().then((list) => {
        if (!dropdown.options) dropdown.options = {};

        if (!list || list.length === 0) {
            dropdown.options.values = ["Select wildcard", "<no wildcards found>"];
            dropdown.value = "Select wildcard";
        } else {
            dropdown.options.values = ["Select wildcard", ...list];
            dropdown.value = "Select wildcard";
        }

        app.canvas.setDirty(true);
    });
}

app.registerExtension({
    name: "User.vsLinx_ImpactMultilineWildcardText",

    async nodeCreated(node) {
        if (node.comfyClass === "vsLinx_ImpactMultilineWildcardText") {
            setupWildcardDropdown(node);
        }
    },
});
