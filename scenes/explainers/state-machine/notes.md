# Construction and scope

The model has four accepted pairs: idle:CONNECT, connecting:OPENED, connecting:ERROR and open:CLOSE. The strict InvalidTransition fallback is this reducer's policy, not a requirement of all state-machine libraries. The two histories compare successful connection followed by closure with connection failure; both test the late completion in closed.

This is the session reducer linked through the Lantern example in scene metadata. It models no retry, reconnection, timeout, event queue, request identity or asynchronous scheduling. The diagram and code explain the result of a supplied event sequence rather than simulate a live network connection.
