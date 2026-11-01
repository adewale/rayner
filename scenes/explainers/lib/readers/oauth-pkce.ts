import { Group, Arrow } from '../../../../src/index.ts';
import { pkceChallenge } from '../models.ts';
import { label, tile, flow, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  guess = 'attacker-does-not-know-the-original-verifier';
export function frames(attacker: boolean): ReaderFrame[] {
  const challenge = pkceChallenge(verifier),
    matches = pkceChallenge(guess) === challenge;
  return [
    {
      id: 'reader-bind',
      title: 'What is the code bound to?',
      line: 'The client keeps a random verifier and sends its S256 challenge.',
      caption:
        'The server stores the S256 challenge with the authorization code. To redeem the code, the client supplies the verifier that produces that challenge. Each authorization gets a fresh verifier; public applications do not embed a reusable client secret here.',
      values: { challenge, verifierKept: true },
      draw: (s) =>
        new Group(
          flow(s, ['Client', 'Auth server', 'Code issued']),
          label('challenge →', -2.6, 2.3, s.emphasis, 0.7),
          label('verifier kept', -5.15, -1.4, s.palette.ink, 0.65),
          label('challenge saved with code', 2.2, -2.8, s.palette.ink, 0.65),
        ),
    },
    {
      id: 'reader-redeem',
      title: attacker ? 'Can the thief redeem the stolen code?' : 'Why does the client’s verifier work?',
      line: 'Same code; compare the submitted verifiers.',
      caption: attacker
        ? 'The attacker submits the stolen code with a guessed verifier. Its hash differs from the saved challenge, so the server returns invalid_grant. The client’s verifier matches and gets a token. This defence assumes the attacker has not also stolen that verifier.'
        : 'The client submits the code and its verifier. Hashing the verifier reproduces the saved challenge, so the server issues a token. The earlier authorization request carried only the challenge.',
      values: { attacker, legitimate: true, guessMatches: matches },
      draw: (s) =>
        table(
          ['Caller', 'S256 matches?', 'Result'],
          [['Client', 'yes', 'token'], ...(attacker ? [['Attacker', matches ? 'yes' : 'no', 'invalid_grant']] : [])],
          s,
          { xs: [-5.2, 0, 5.2], y: 2, gap: 1.6 },
        ),
    },
  ];
}
