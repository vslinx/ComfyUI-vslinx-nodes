This node unpacks a <b>pipe</b> connection back into up to 5 individual outputs of any type. It is the counterpart to <code>Any to Pipe</code> and is intended to be placed at the destination end of a pipe wire to retrieve the original values.

This node does the following:
- Accepts a single <b>VSLINX_PIPE</b> input produced by an <code>Any to Pipe</code> node.
- Unpacks the pipe and exposes each of the 5 slot values as individual outputs.
- Slots that were left unconnected on the packing end are output as <code>None</code>.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| pipe | VSLINX_PIPE | A pipe connection produced by an <code>Any to Pipe</code> node. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| slot_1 | ANY | The value that was connected to slot_1 on the <code>Any to Pipe</code> node. |
| slot_2 | ANY | The value that was connected to slot_2 on the <code>Any to Pipe</code> node. |
| slot_3 | ANY | The value that was connected to slot_3 on the <code>Any to Pipe</code> node. |
| slot_4 | ANY | The value that was connected to slot_4 on the <code>Any to Pipe</code> node. |
| slot_5 | ANY | The value that was connected to slot_5 on the <code>Any to Pipe</code> node. |

Notes:
- Only connect outputs that were actually packed on the sending end. Connecting a <code>None</code> slot to a node that requires a real value will cause a runtime error in that downstream node.
- Slot order is preserved: slot_1 always corresponds to slot_1 from the <code>Any to Pipe</code> node.
- The pipe type is <code>VSLINX_PIPE</code> and is only compatible with the <code>Any to Pipe</code> node from this pack.
- Values are passed by reference — no copying or deserialization occurs, so tensors are not duplicated in memory.
