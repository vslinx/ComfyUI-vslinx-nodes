This node packs up to 5 values of any type into a single <b>pipe</b> connection. It is the counterpart to <code>Pipe to Any</code> and is intended to reduce visual clutter in large workflows by bundling multiple unrelated values into a single wire that can be routed across the canvas and unpacked later.

This node does the following:
- Accepts up to 5 inputs of <b>any type</b> (images, masks, numbers, strings, models, etc.). All slots are optional.
- Packs the 5 values into a single <b>VSLINX_PIPE</b> output that can be passed through the graph as one connection.
- Unconnected slots are passed as <code>None</code> and are preserved in their positions so the receiving <code>Pipe to Any</code> node outputs them at the correct slot index.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| slot_1 | ANY | First value to pack into the pipe. Optional. |
| slot_2 | ANY | Second value to pack into the pipe. Optional. |
| slot_3 | ANY | Third value to pack into the pipe. Optional. |
| slot_4 | ANY | Fourth value to pack into the pipe. Optional. |
| slot_5 | ANY | Fifth value to pack into the pipe. Optional. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| pipe | VSLINX_PIPE | A single pipe connection carrying all 5 slot values. Connect this to a <code>Pipe to Any</code> node to retrieve them. |

Notes:
- All 5 input slots are optional — you can leave any number of them unconnected and only use the slots you need.
- Slot positions are preserved: slot_1 in always comes out as slot_1 in the receiving <code>Pipe to Any</code> node, regardless of which slots are populated.
- The pipe type is <code>VSLINX_PIPE</code> and is only compatible with the <code>Pipe to Any</code> node from this pack.
- The node does not modify, copy, or serialize any of the values — references are passed as-is, so tensors are not duplicated in memory.
