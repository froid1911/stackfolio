import {
  createTrigger,
  Property,
  TriggerStrategy,
} from "@powerhousedao/pieces-framework";

/**
 * A clock the workflow runtime honours: the polling trigger asks the engine
 * for exactly the interval the reconciler specified, and every poll fires
 * once. The payload carries `firedAt`, which workflows use as the batch id,
 * import stamp and snapshot id, so every run of one schedule shares one
 * timestamp.
 */
export const ethereumOnIntervalTrigger = createTrigger({
  requireAuth: false,
  // Saved workflows refer to the trigger by name: don't rename it once published
  name: "on-interval",
  displayName: "On Interval",
  description:
    "Fires every N seconds. {{trigger.payload.firedAt}} is the run timestamp; {{trigger.payload.label}} the label set on the workflow.",
  type: TriggerStrategy.POLLING,
  props: {
    seconds: Property.Number({
      displayName: "Interval (seconds)",
      description: "Minimum seconds between fires.",
      required: false,
      defaultValue: 300,
    }),
    label: Property.ShortText({
      displayName: "Label",
      description: "Free-form tag carried in the payload (the workflow key).",
      required: false,
    }),
  },
  sampleData: {
    firedAt: "2026-11-11T10:00:00.000Z",
    label: "live-scan",
  },
  onEnable: (context) => {
    context.setSchedule({
      intervalMs: (context.propsValue.seconds ?? 300) * 1000,
    });
    return Promise.resolve();
  },
  onDisable: () => Promise.resolve(),
  run(context) {
    context.setSchedule({
      intervalMs: (context.propsValue.seconds ?? 300) * 1000,
    });
    return Promise.resolve([
      {
        firedAt: new Date().toISOString(),
        label: context.propsValue.label ?? "tick",
      },
    ]);
  },
});
