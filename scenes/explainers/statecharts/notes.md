# Construction and scope

The coffee machine exposes repeated transitions; the player exposes repeated combinations. Keeping these separate avoids introducing hierarchy and concurrency as an unexplained taxonomy. The frother applies both ideas to the opening machine.

The model in `../lib/statecharts.ts` covers compound and parallel states with event transitions. It omits guards, actions, history, final states and delays. Its inner-state-first selection follows XState and SCXML for this subset; Statemate uses different priority rules. The missing POWER_OFF is a deliberately incomplete hand copy, not behaviour taken from a real appliance. The page draws up to two independent features; count tests extend to five. The frother cases in the checks are not drawn.

Sources: [Harel's statecharts paper](https://www.state-machine.com/doc/Harel87.pdf), [SCXML](https://www.w3.org/TR/2015/REC-scxml-20150901/) and [XState 5.33.3](https://www.npmjs.com/package/xstate/v/5.33.3). The model's reachable configurations and transitions are compared with XState.
