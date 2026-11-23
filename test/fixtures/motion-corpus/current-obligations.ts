/** Current construction obligations are separate from the immutable historical
 * CAUGHT IDs and their diagnostic targets. They never earn a detection point. */
export const CURRENT_CONSTRUCTION_OBLIGATIONS = {
  'sign-in-ask-people-slide': {
    owner: 'test/signin-layout-construction.test.ts',
    route: ['ask','approve-read','collect','ask'], scenario: {flow:'direct'},
    context: ['agent:station','agent:ring','agent:name','tag'],
    credential: 'pat_8Hk2', victim: 'page:orders:write:line', literal: 'Exchange items',
    policy: 'The baseline and original edit retain stable prior credentials and clear actual scope glyphs; a displaced physical tag must obscure those glyphs. No diagnostic credit for the native no-op.',
  },
} as const;
