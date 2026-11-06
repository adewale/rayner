# When can a locked door open?

- **Reader:** someone starting a machine explainer, who wants to see a model that refuses events with reasons and a last step the reader drives.
- **Answer:** A locked door must unlock before it opens
- **Changed condition:** none: one scenario. The comparison is between the events the door takes and the ones it refuses, which the reader tries at the live step.
- **Reader's own work:** predict whether a locked door can open; at the last step, press the events and read each refusal's reason.
- **Checked against:** nothing external: the model's own tests check what every event does from every state, every refusal's reason, and that every state is reachable from the open door.
- **Leaves out:** keys, handles and anything else about real doors; three states and four events.

## Check yourself

1. The door is open. Which events, in order, leave it locked?
   close, then lock: an open door cannot lock.

## Why this explainer

It is the smallest machine that has a refusal worth explaining: the model, not the scene, decides that open is refused while the door is locked, and says why. The picture is a view of the state, so every state the events reach is drawn and checked, and the last step is live, so the reader can try the refusal themselves. It is a starting point to replace, not a lesson.
