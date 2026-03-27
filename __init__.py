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
    "load_last_generated"
]

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

for module_name in node_list:
    imported_module = importlib.import_module(".nodes.{}".format(module_name), __name__)

    NODE_CLASS_MAPPINGS = {**NODE_CLASS_MAPPINGS, **imported_module.NODE_CLASS_MAPPINGS}
    NODE_DISPLAY_NAME_MAPPINGS = {**NODE_DISPLAY_NAME_MAPPINGS, **imported_module.NODE_DISPLAY_NAME_MAPPINGS}

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
