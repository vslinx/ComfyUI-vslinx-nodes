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


NODE_CLASS_MAPPINGS = {
    "vsLinx_BypassOnBool": vsLinx_BypassOnBool,
    "vsLinx_MuteOnBool": vsLinx_MuteOnBool,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_BypassOnBool": "Forward/Bypass on Boolean (Any)",
    "vsLinx_MuteOnBool": "Forward/Mute on Boolean (Any)",
}