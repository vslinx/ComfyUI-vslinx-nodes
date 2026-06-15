import importlib

from .py import preview_routes
from .nodes.combo_type_fix import apply_combo_type_fix, register_routes

# Apply the combo type fix at import time (before any prompt validation).
# The fix is togglable at runtime via ComfyUI Settings > vsLinx.
apply_combo_type_fix()
register_routes()

# --- Node registration ---
node_list = [
    "multi_image_select",
    "boolean_operator",
    "bypass_helper",
    "inpaint_helper",
    "lora_save_helper",
    "impact_multiline_wildcard_text",
    "upscale_by_factor_with_model",
    "load_last_generated",
    "image_to_pixel_art",
    "group_bookmarks",
    "pipe_utils",
]

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

for module_name in node_list:
    imported_module = importlib.import_module(".nodes.{}".format(module_name), __name__)

    NODE_CLASS_MAPPINGS = {**NODE_CLASS_MAPPINGS, **imported_module.NODE_CLASS_MAPPINGS}
    NODE_DISPLAY_NAME_MAPPINGS = {**NODE_DISPLAY_NAME_MAPPINGS, **imported_module.NODE_DISPLAY_NAME_MAPPINGS}


# --- Conditional nodes (only registered when their dependency is installed) ---

def _impact_pack_installed():
    """
    True if ComfyUI-Impact-Pack appears to be installed.

    Checks the custom_nodes folders by name instead of importing `impact`,
    because custom node load order is not guaranteed (Impact-Pack may not
    have added its modules to sys.path yet when this pack loads). The actual
    `import impact.*` happens lazily inside the node at execution time.
    """
    import os

    try:
        import folder_paths

        for base in folder_paths.get_folder_paths("custom_nodes"):
            if not os.path.isdir(base):
                continue
            for entry in os.listdir(base):
                norm = entry.lower().replace("_", "-")
                if (
                    "impact-pack" in norm
                    and "impact-subpack" not in norm
                    and not norm.endswith(".disabled")
                    and os.path.isdir(os.path.join(base, entry))
                ):
                    return True
    except Exception:
        pass

    # Fallback: Impact-Pack already loaded and importable.
    try:
        import importlib.util

        return importlib.util.find_spec("impact") is not None
    except Exception:
        return False


if _impact_pack_installed():
    imported_module = importlib.import_module(".nodes.interactive_detailer", __name__)
    NODE_CLASS_MAPPINGS = {**NODE_CLASS_MAPPINGS, **imported_module.NODE_CLASS_MAPPINGS}
    NODE_DISPLAY_NAME_MAPPINGS = {**NODE_DISPLAY_NAME_MAPPINGS, **imported_module.NODE_DISPLAY_NAME_MAPPINGS}
else:
    print("[vsLinx] ComfyUI-Impact-Pack not found - skipping the '(Impact-Pack) Interactive Detailer' node. All other vsLinx nodes are unaffected.")

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
