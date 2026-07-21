class vsLinx_GroupBookmarks:
    DESCRIPTION = (
        "UI-only node for bookmarking workflow groups and individual nodes. "
        "Click 'Manage Bookmarks' to pick whole groups or expand a group to "
        "bookmark single nodes, then use the side panel to jump to any bookmark "
        "with a single click."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "vsLinx/utility"

    def execute(self):
        return {}


NODE_CLASS_MAPPINGS = {
    "vsLinx_GroupBookmarks": vsLinx_GroupBookmarks,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_GroupBookmarks": "Bookmarks",
}
