Flips the input value: True → False, False → True. Useful for inverting conditions.

This node does the following:
- Accepts a boolean input and converts it safely to a Python bool (supports Python bools, NumPy bools, and lists/tuples).
- For lists/tuples, evaluates each element and applies <code>all(...)</code> first, then flips the final result with <code>not</code>.
- Returns the inverted boolean value.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| boolean | BOOLEAN | Input value to flip. Accepts Python bools, NumPy bools, or lists/tuples. Lists/tuples are aggregated with <code>all(...)</code> before flipping. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| boolean | BOOLEAN | Inverted value. True becomes False; False becomes True. |

Notes:
- NumPy booleans are converted via <code>.item()</code>.
- For lists/tuples, the node computes <code>all(elements)</code> first, then applies <code>not</code> to that result.