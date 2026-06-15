class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False

any_t = AnyType("*")


class vsLinx_BypassOnBool:
    DESCRIPTION = "Forwards a value and toggles BYPASS on directly connected downstream nodes based on a boolean (linkable)."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"any": (any_t,), "bypass": ("BOOLEAN", {"default": False})}}

    RETURN_TYPES = (any_t,)
    RETURN_NAMES = ("any",)
    FUNCTION = "forward"
    CATEGORY = "vsLinx/utility"

    def forward(self, any, bypass=False):
        return (any,)


class vsLinx_MuteOnBool:
    DESCRIPTION = "Forwards a value and toggles MUTE on directly connected downstream nodes based on a boolean (linkable)."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"any": (any_t,), "mute": ("BOOLEAN", {"default": False})}}

    RETURN_TYPES = (any_t,)
    RETURN_NAMES = ("any",)
    FUNCTION = "forward"
    CATEGORY = "vsLinx/utility"

    def forward(self, any, mute=False):
        return (any,)


class vsLinx_BypassMuteOnState:
    DESCRIPTION = (
        "Forwards a value and mirrors the BYPASS/MUTE state of the node connected "
        "to 'trigger' onto directly connected downstream nodes: if the trigger node "
        "is bypassed the downstream node is bypassed, if it's muted it's muted, "
        "otherwise it runs normally."
    )

    SEARCH_ALIASES = [
        "bypass on state",
        "mute on state",
        "bypass on bypass",
        "mirror bypass",
        "mirror state",
        "follow bypass",
        "bypass follows node",
    ]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any": (any_t,),
                "ignore_subgraph_boundary": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "When enabled, the trigger lookup crosses subgraph "
                               "boundaries (inbound and outbound) until it reaches a "
                               "real node, instead of stopping at the boundary.",
                }),
                "mirror_own_state": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "When enabled, this node also mirrors its OWN "
                               "bypass/mute state onto the downstream node(s): if "
                               "this node is bypassed/muted, the output node is too. "
                               "Its own state takes precedence over the trigger.",
                }),
            },
            "optional": {"trigger": (any_t,)},
        }

    RETURN_TYPES = (any_t,)
    RETURN_NAMES = ("any",)
    FUNCTION = "forward"
    CATEGORY = "vsLinx/utility"

    def forward(self, any, ignore_subgraph_boundary=False, mirror_own_state=False, trigger=None):
        return (any,)


NODE_CLASS_MAPPINGS = {
    "vsLinx_BypassOnBool": vsLinx_BypassOnBool,
    "vsLinx_MuteOnBool": vsLinx_MuteOnBool,
    "vsLinx_BypassMuteOnState": vsLinx_BypassMuteOnState,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_BypassOnBool": "Forward/Bypass on Boolean (Any)",
    "vsLinx_MuteOnBool": "Forward/Mute on Boolean (Any)",
    "vsLinx_BypassMuteOnState": "Forward/Bypass-Mute on State (Any)",
}