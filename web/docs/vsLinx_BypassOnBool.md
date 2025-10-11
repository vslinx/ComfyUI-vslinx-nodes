This node accepts any input type and forwards it unchanged. Its pass-through behavior can be controlled with the built-in boolean switch or by linking an external boolean node. This allows you to create conditional branches in your workflow. The bypass state is applied instantly in the UI, without waiting for workflow execution.  

This node does the following:
- Takes an input of <b>any type</b> (images, masks, numbers, strings, lists, etc.) and forwards it unchanged to the output.
- Toggles <b>BYPASS</b> on directly connected downstream nodes based on the boolean control.
- The toggle can come from the node’s own boolean field or from a linked boolean output elsewhere.
- The BYPASS state change is applied immediately in the graph UI (no execution required).

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| any | ANY | Any value to forward. The value is not modified. |
| bypass | BOOLEAN | If True, sets BYPASS on directly connected downstream nodes. If False, clears BYPASS. Linkable to an external boolean. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| any | ANY | The forwarded value, unchanged. |

Notes:
- “Any” type is implemented with a wildcard type so it can forward whatever you connect (including lists/batches).
- BYPASS affects nodes directly connected to this node’s output. Downstream further nodes may inherit behavior depending on the UI.
- Because BYPASS is a UI/graph state, changes reflect instantly without running the workflow.