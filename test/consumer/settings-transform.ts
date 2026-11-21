// Published declarations must preserve literal settings and refuse incompatible Transform modes.
import { Scene, Text, Transform } from 'rayner';
import type { AnimationOptions, Mobject, TransformOptions } from 'rayner';
import { settingsOf } from 'rayner/explain';
import type { ExplainerClass, Setting, Settings } from 'rayner/explain';
import { withSettings } from 'rayner/testing';

class LiteralSettings extends Scene {
  static settings = [
    { id: 'bits', label: 'Memory', default: '16', options: [{ value: '16', label: '16 bits' }, { value: '32', label: '32 bits' }] },
    { id: 'mode', label: 'Mode', default: 'read', options: [{ value: 'read', label: 'Read' }, { value: 'write', label: 'Write' }] },
  ] as const satisfies readonly Setting[];

  override async construct() {
    const values = settingsOf(this, LiteralSettings);
    const bits: '16' | '32' = values.bits;
    const mode: 'read' | 'write' = values.mode;
    const typed: Settings<typeof LiteralSettings.settings> = values;
    // @ts-expect-error The declaration has bits, not bitts.
    void values.bitts;
    // @ts-expect-error The mode's values cannot be used as bit counts.
    const wrongDomain: 'read' | 'write' = values.bits;
    // @ts-expect-error This is not one of the options declared for bits.
    const wrongOption: typeof values.bits = '64';
    // @ts-expect-error Resolved settings are read-only.
    values.bits = '32';
    void [bits, mode, typed, wrongDomain, wrongOption];
  }
}

// Domain interfaces need no string index signature merely to read their scene's settings.
interface DomainState { count: number }
class InterfaceState extends Scene {
  static settings = LiteralSettings.settings;
  override state: DomainState = { count: 0 };
  override async construct() {
    const bits: '16' | '32' = settingsOf(this, InterfaceState).bits;
    const dynamic: Settings = settingsOf(this);
    void [bits, dynamic];
  }
}

// A class witness supplies declarations; the accessor never constructs an abstract base.
abstract class SettingsBase extends Scene {
  override state: DomainState = { count: 0 };

  static settings = LiteralSettings.settings;
  bitCount(): '16' | '32' {
    const values = settingsOf(this, SettingsBase);
    // @ts-expect-error An abstract witness retains literal identifiers too.
    void values.bitts;
    return values.bits;
  }
}
class InheritedSettings extends SettingsBase { override state = { count: 1 }; }
void InheritedSettings;

// URL values remain strings at the boundary; runtime validation chooses a valid scenario.
export function settingsForReaders(scene: LiteralSettings, dynamicScene: Scene, Source: ExplainerClass, query: Record<string, string>) {
  const Bound = withSettings(LiteralSettings, query);
  const inferred = settingsOf(new Bound({ async frame() {} }), LiteralSettings);
  const bits: '16' | '32' = inferred.bits;
  const dynamic: Settings = settingsOf(dynamicScene, Source);
  const legacy: Settings = settingsOf(scene);
  const arbitrary: string | undefined = dynamic['a-key-known-only-at-runtime'];
  return { bits, arbitrary, legacy };
}

export function transformModes(from: Mobject, to: Mobject, dynamicTarget: Mobject | 'saved') {
  const timing: AnimationOptions = { runTime: 1 };
  const copy: TransformOptions = { match: 'text', fromCopy: true, replace: true };
  new Transform(from, to, copy);
  new Transform(from, to, { fromCopy: false, replace: false, match: 'key' });
  new Transform(from, to, { fromCopy: true });
  const dynamicCopy = Math.random() > 0.5;
  new Transform(from, to, { fromCopy: dynamicCopy });
  new Transform(from, to, { fromCopy: dynamicCopy, replace: true });
  new Transform(from, 'saved', timing);
  new Transform(from, 'saved', { ...timing, match: undefined, replace: undefined });
  new Transform(from, dynamicTarget, timing);
  // @ts-expect-error A copy always hands over to its target.
  const contradictory: TransformOptions = { fromCopy: true, replace: false };
  const contradictoryVariable = { fromCopy: true, replace: false } as const;
  // @ts-expect-error A variable cannot bypass the mutually exclusive modes.
  new Transform(from, to, contradictoryVariable);
  // @ts-expect-error A saved-state transform cannot match another target's parts.
  new Transform(from, 'saved', { match: 'text' });
  // @ts-expect-error Even a redundant match mode is not a saved-state option.
  new Transform(from, 'saved', { match: 'index' });
  // @ts-expect-error A saved-state transform changes the original, never a copy.
  new Transform(from, 'saved', { fromCopy: true });
  const noCopy = { fromCopy: false } as const;
  // @ts-expect-error Variables with fromCopy are not saved-state options either.
  new Transform(from, 'saved', noCopy);
  // @ts-expect-error A saved-state transform keeps its original object.
  new Transform(from, 'saved', { replace: true });
  // @ts-expect-error Saved-state callers omit replace, even when false.
  new Transform(from, 'saved', { replace: false });
  // @ts-expect-error Narrow an unknown target before asking to match or copy it.
  new Transform(from, dynamicTarget, copy);
  void contradictory;
  return new Transform(new Text('a'), new Text('b'), { match: 'text', replace: false });
}
