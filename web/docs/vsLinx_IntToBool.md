Converts an integer into a boolean using a threshold. Outputs True if the input <code>value</code> is greater than or equal to <code>threshold</code>, otherwise False. With the default <code>threshold</code> of 1 this behaves like a classic "is this value truthy / 1 or above" check, but the threshold lets you gate on any cutoff you like.

This node does the following:
- Takes an integer <code>value</code> and an integer <code>threshold</code>.
- Compares them with <code>value &gt;= threshold</code>.
- Returns the resulting boolean.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| value | INT | The input value to evaluate. |
| threshold | INT | The cutoff to compare against. If <code>value</code> is this number or higher, the node returns True; otherwise False. Defaults to 1. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| boolean | BOOLEAN | True when <code>value &gt;= threshold</code>, otherwise False. |

Notes:
- With <code>threshold</code> = 1, any value of 1 or above returns True and 0 (or negative values) return False.
- The comparison is inclusive: a <code>value</code> exactly equal to <code>threshold</code> returns True.
