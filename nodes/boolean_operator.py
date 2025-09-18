class VSLinx_BooleanAndOperator:
    DESCRIPTION = "Outputs True only if both inputs are True."
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "boolean_a": ("BOOLEAN", {"default": False}),
                "boolean_b": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("boolean",)
    FUNCTION = "compute"
    CATEGORY = "vsLinx/boolean"

    def _as_bool(self, v):
        try:
            import numpy as np  
            np_bool = (np.bool_,)
        except Exception:
            np_bool = tuple()

        if isinstance(v, (list, tuple)):
            return all(self._as_bool(x) for x in v)
        if np_bool and isinstance(v, np_bool):
            return bool(v.item())
        return bool(v)

    def compute(self, boolean_a, boolean_b):
        a = self._as_bool(boolean_a)
        b = self._as_bool(boolean_b)
        return (a and b,)

class VSLinx_BooleanOrOperator:
    DESCRIPTION = "Outputs True if either input is True."
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "boolean_a": ("BOOLEAN", {"default": False}),
                "boolean_b": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("boolean",)
    FUNCTION = "compute"
    CATEGORY = "vsLinx/boolean"

    def _as_bool(self, v):
        try:
            import numpy as np
            np_bool = (np.bool_,)
        except Exception:
            np_bool = tuple()

        if isinstance(v, (list, tuple)):
            return any(self._as_bool(x) for x in v)
        if np_bool and isinstance(v, np_bool):
            return bool(v.item())
        return bool(v)

    def compute(self, boolean_a, boolean_b):
        a = self._as_bool(boolean_a)
        b = self._as_bool(boolean_b)
        return (a or b,)

class VSLinx_BooleanFlip:
    DESCRIPTION = "Flips a boolean value: True becomes False, False becomes True."
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "boolean": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("boolean",)
    FUNCTION = "compute"
    CATEGORY = "vsLinx/boolean"

    def _as_bool(self, v):
        try:
            import numpy as np
            np_bool = (np.bool_,)
        except Exception:
            np_bool = tuple()

        if isinstance(v, (list, tuple)):
            return all(self._as_bool(x) for x in v)
        if np_bool and isinstance(v, np_bool):
            return bool(v.item())
        return bool(v)

    def compute(self, boolean):
        return (not self._as_bool(boolean),)


NODE_CLASS_MAPPINGS = {
    "vsLinx_BooleanAndOperator": VSLinx_BooleanAndOperator,
    "vsLinx_BooleanOrOperator": VSLinx_BooleanOrOperator,
    "vsLinx_BooleanFlip": VSLinx_BooleanFlip,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_BooleanAndOperator": "Boolean AND Operator",
    "vsLinx_BooleanOrOperator": "Boolean OR Operator",
    "vsLinx_BooleanFlip": "Boolean Flip",
}