import { test } from 'node:test';
import { Text } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import Refusals from './scene.ts';

await loadFonts();

test('the replacement keys clear the API and MCP lettering as they travel to their hooks', async () => {
  const project = await loadProject(Refusals, import.meta.dirname);
  const api = routeInkCheck(), mcp = routeInkCheck();
  for (const scenario of project.scenarios) {
    await new scenario.Scene({
      async frame(scene) {
        const at = scene.currentStep?.path;
        if (at !== 'slip' && at !== 'one-door') return;
        const words = scene.familyMembers().filter((word): word is Text => word instanceof Text &&
          (word.key?.startsWith('lane:') && word.key.endsWith(':name') || word.key === 'agent:name' || word.key === 'agent:mcp-key:name'));
        if (at === 'slip') api.frame(scene, 'agent:key:flight', words);
        else mcp.frame(scene, 'agent:mcp-key:flight', words);
      },
    }).run();
  }
  api.assertClear('API key', ['API', 'your agent']);
  mcp.assertClear('MCP key', ['API', 'MCP', 'your agent', 'for MCP']);
});
