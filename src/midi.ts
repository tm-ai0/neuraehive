// MIDI by learning: select a control, turn a knob, it is bound. Bindings
// live in the presets. Everything degrades gracefully — no device plugged,
// no Web MIDI in the browser, no error, the panel simply says so.
// The touch stays, MIDI adds itself.

import type { ParamRef } from "./modmatrix";

export type MidiBindings = Record<string, string>; // "ch:cc" -> param key

export function createMidi(
  params: ParamRef[],
  hooks: {
    /** An authored write landed on this param (update centers, refresh UI). */
    onWrite(key: string, value: number): void;
    /** Learn completed or bindings changed: refresh the panel. */
    onChange(): void;
  }
) {
  const byKey = new Map(params.map((p) => [p.key, p]));
  let access: MIDIAccess | undefined;
  let status: "inactif" | "indisponible" | "actif" | "refusé" = "inactif";
  let armedKey: string | undefined;
  const bindings = new Map<string, string>();

  const inputCount = () => (access ? access.inputs.size : 0);

  function attach() {
    if (!access) return;
    for (const input of access.inputs.values()) {
      input.onmidimessage = onMessage;
    }
  }

  function onMessage(event: MIDIMessageEvent) {
    const data = event.data;
    if (!data || data.length < 3) return;
    const kind = data[0]! & 0xf0;
    if (kind !== 0xb0) return; // control change only
    const id = `${data[0]! & 0x0f}:${data[1]!}`;
    const value = data[2]! / 127;
    if (armedKey) {
      // Learning: this knob now owns the armed control (one knob, one
      // control — a previous binding of the same knob is replaced).
      bindings.set(id, armedKey);
      armedKey = undefined;
      hooks.onChange();
      return;
    }
    const key = bindings.get(id);
    const def = key ? byKey.get(key) : undefined;
    if (!def) return;
    let v = def.min + value * (def.max - def.min);
    if (def.step >= 1) v = Math.round(v / def.step) * def.step;
    def.set(Math.min(def.max, Math.max(def.min, v)));
    hooks.onWrite(def.key, v);
  }

  return {
    get status() {
      return status === "actif" ? `actif · ${inputCount()} entrée(s)` : status;
    },
    get enabled() {
      return status === "actif";
    },
    get armedKey() {
      return armedKey;
    },
    /** Ask the browser for MIDI. Safe to call twice; never throws. */
    async enable() {
      if (access) return;
      if (!navigator.requestMIDIAccess) {
        status = "indisponible";
        hooks.onChange();
        return;
      }
      try {
        access = await navigator.requestMIDIAccess({ sysex: false });
        status = "actif";
        attach();
        access.onstatechange = () => {
          attach();
          hooks.onChange();
        };
      } catch {
        status = "refusé";
      }
      hooks.onChange();
    },
    arm(key: string) {
      armedKey = armedKey === key ? undefined : key;
      hooks.onChange();
    },
    disarm() {
      armedKey = undefined;
    },
    bindingFor(key: string): string | undefined {
      for (const [id, k] of bindings) {
        if (k === key) return `cc ${id.split(":")[1]}`;
      }
      return undefined;
    },
    unbind(key: string) {
      for (const [id, k] of [...bindings]) {
        if (k === key) bindings.delete(id);
      }
      hooks.onChange();
    },
    serialize(): MidiBindings {
      return Object.fromEntries(bindings);
    },
    load(data: MidiBindings | undefined) {
      bindings.clear();
      for (const [id, key] of Object.entries(data ?? {})) {
        if (byKey.has(key)) bindings.set(id, key);
      }
      hooks.onChange();
    },
  };
}

export type Midi = ReturnType<typeof createMidi>;
