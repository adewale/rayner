export const D = {
  'bug1-before': 'stateDiagram-v2\n  a --> b\n  a --> c',
  'bug1-target': 'stateDiagram-v2\n  c\n  state g {\n    a --> b\n  }',
  'bug2-before': 'stateDiagram-v2\n  state on {\n    idle --> busy\n  }',
  'bug2-target': 'stateDiagram-v2\n  state on {\n    idle --> busy\n    --\n    still\n  }',
};
