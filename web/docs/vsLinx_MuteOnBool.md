This node works the same way as <code>Forward/Bypass on Boolean (Any)</code>, but instead of bypassing the connected nodes it <b>mutes</b> them. The mute state can be controlled with the built-in boolean switch or by linking an external boolean, and changes are applied instantly in the UI.

This node does the following:
- Takes an input of <b>any type</b> and forwards it unchanged to the output.
- Toggles <b>MUTE</b> on directly connected downstream nodes based on the boolean control.
- The toggle can come from the node’s own boolean field or from a linked boolean output elsewhere.
- The MUTE state change is applied immediately in the graph UI (no execution required).

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| any | ANY | Any value to forward. The value is not modified. |
| mute | BOOLEAN | If True, sets MUTE on directly connected downstream nodes. If False, clears MUTE. Linkable to an external boolean. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| any | ANY | The forwarded value, unchanged. |

Notes:
- “Any” type is implemented via a wildcard type to forward any connected data (images, masks, numbers, strings, lists, etc.).
- MUTE differs from BYPASS in that muted nodes remain in place but are disabled from executing/producing outputs as per the UI’s mute behavior.
- Because MUTE is a UI/graph state, changes reflect instantly without running the workflow.