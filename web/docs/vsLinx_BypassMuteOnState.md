This node accepts any input type and forwards it unchanged, while mirroring the <b>bypass / mute state of another node</b> onto its directly connected downstream node(s). Use it when you don't have a boolean to drive a bypass, but you do have another node whose state should decide it: if the watched node is bypassed, the downstream node is bypassed; if it's muted, the downstream node is muted; otherwise it runs normally. The state change is applied instantly in the UI, without waiting for workflow execution.

This node does the following:
- Takes an input of <b>any type</b> and forwards it unchanged to the output.
- Reads the state of the node connected to the <b>trigger</b> input and mirrors it onto the directly connected downstream node(s): <b>bypass → bypass</b>, <b>mute → mute</b>, <b>normal → normal</b>.
- When the trigger input is left unconnected, the downstream node(s) are left running normally (the node acts as a plain pass-through).
- The state change is applied immediately in the graph UI (no execution required).

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| any | ANY | Any value to forward. The value is not modified. |
| ignore_subgraph_boundary | BOOLEAN | Display label: <i>"Ignore subgraph boundary"</i>. When enabled, the trigger lookup crosses subgraph boundaries (both inbound and outbound) until it reaches a real node, instead of stopping at the boundary. When disabled, only the node directly wired into ``trigger`` in the same graph is read. |
| mirror_own_state | BOOLEAN | Display label: <i>"Mirror this node's own bypass/mute"</i>. When enabled, this node also mirrors its <b>own</b> bypass/mute state onto the downstream node(s). Its own state takes precedence over the trigger node's state. |
| trigger | ANY (optional) | Connect this to any output of the node whose bypass/mute state you want to follow. The value itself is never used — only the link matters. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| any | ANY | The forwarded value, unchanged. |

Notes:
- The trigger value is never read during execution; the node is a pure pass-through and all bypass/mute mirroring happens in the graph UI, so changes reflect instantly without running the workflow.
- With ``ignore_subgraph_boundary`` enabled, the lookup drills through subgraph <b>container</b> nodes to the real node inside. Bypassing the whole subgraph container (rather than the inner node) is therefore not mirrored — the inner node's own state is what counts.
- ``mirror_own_state`` is useful for chaining: bypassing/muting this node then propagates that same state to whatever it feeds. Note that because the mirroring runs in the UI, it works even while this node is itself bypassed/muted.
- Like the other forward nodes, mirroring affects nodes directly connected to this node's output, and is pipe-aware (it follows ``Any to Pipe`` → ``Pipe to Any``).
