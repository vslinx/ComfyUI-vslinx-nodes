Provides a node with 2 boolean inputs. Outputs True only if <b>both</b> inputs are True. Otherwise returns False.  
<img width="1284" height="182" alt="Image" src="https://github.com/user-attachments/assets/a7c0a40b-8246-4aa5-806a-ba4d7b749ad9" />

This node does the following:
- Accepts two boolean inputs and converts them safely to booleans (supports Python bools, NumPy bools, and lists/tuples).
- For lists/tuples, evaluates each element and applies <code>all(...)</code> (i.e., every element must be True).
- Returns True only when both evaluated inputs are True.

Parameters:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| boolean_a | BOOLEAN | First input value. Accepts Python bools, NumPy bools, or lists/tuples of those. |
| boolean_b | BOOLEAN | Second input value. Accepts Python bools, NumPy bools, or lists/tuples of those. |

Outputs:
| Parameter | Type | Description |
| -------- | ---- | ----------- |
| boolean | BOOLEAN | Result of logical AND. True only if both inputs are True (with list/tuple inputs using <code>all(...)</code>). |

Notes:
- NumPy booleans are converted via <code>.item()</code> to avoid type issues.
- If an input is a list/tuple, each element is converted to bool and aggregated with <code>all</code>.