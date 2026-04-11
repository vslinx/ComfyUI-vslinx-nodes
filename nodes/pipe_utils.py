class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


any_t = AnyType("*")

PIPE_TYPE = "VSLINX_PIPE"


class vsLinx_AnyToPipe:
    DESCRIPTION = "Packs up to 5 values of any type into a single pipe connection."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "slot_1": (any_t,),
                "slot_2": (any_t,),
                "slot_3": (any_t,),
                "slot_4": (any_t,),
                "slot_5": (any_t,),
            }
        }

    RETURN_TYPES = (PIPE_TYPE,)
    RETURN_NAMES = ("pipe",)
    FUNCTION = "pack"
    CATEGORY = "vsLinx/utility"

    def pack(self, slot_1=None, slot_2=None, slot_3=None, slot_4=None, slot_5=None):
        return ((slot_1, slot_2, slot_3, slot_4, slot_5),)


class vsLinx_PipeToAny:
    DESCRIPTION = "Unpacks a pipe into up to 5 individual values."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "pipe": (PIPE_TYPE,),
            }
        }

    RETURN_TYPES = (any_t, any_t, any_t, any_t, any_t)
    RETURN_NAMES = ("slot_1", "slot_2", "slot_3", "slot_4", "slot_5")
    FUNCTION = "unpack"
    CATEGORY = "vsLinx/utility"

    def unpack(self, pipe):
        slot_1, slot_2, slot_3, slot_4, slot_5 = pipe
        return (slot_1, slot_2, slot_3, slot_4, slot_5)


NODE_CLASS_MAPPINGS = {
    "vsLinx_AnyToPipe": vsLinx_AnyToPipe,
    "vsLinx_PipeToAny": vsLinx_PipeToAny,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_AnyToPipe": "Any to Pipe",
    "vsLinx_PipeToAny": "Pipe to Any",
}
