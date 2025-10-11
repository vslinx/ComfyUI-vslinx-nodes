Just like the AND Operator, this node provides 2 boolean inputs. Outputs True if <b>either</b> input is True. Returns False only if both are False.

This node does the following:
- Accepts two boolean inputs and converts them safely to booleans (supports Python bools, NumPy bools, and lists/tuples).
- For lists/tuples, evaluates each element and applies <code>any(...)</code> (i.e., at least one element must be True).
- Returns True if either evaluated input is True.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| boolean_a | BOOLEAN | First input value. Accepts Python bools, NumPy bools, or lists/tuples of those. |
| boolean_b | BOOLEAN | Second input value. Accepts Python bools, NumPy bools, or lists/tuples of those. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| boolean | BOOLEAN | Result of logical OR. True if either input is True (with list/tuple inputs using <code>any(...)</code>). |

Notes:
- NumPy booleans are converted via <code>.item()</code>.
- If an input is a list/tuple, each element is converted to bool and aggregated with <code>any</code>.