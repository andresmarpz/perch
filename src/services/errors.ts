import { Schema } from "effect"

export class PipUnsupported extends Schema.TaggedError<PipUnsupported>()("PipUnsupported", {}) {}

export class PlayerNotFound extends Schema.TaggedError<PlayerNotFound>()("PlayerNotFound", {
  what: Schema.String,
}) {}

export class PipOpenFailed extends Schema.TaggedError<PipOpenFailed>()("PipOpenFailed", {
  cause: Schema.Defect(),
}) {}

export class SettingsWriteFailed extends Schema.TaggedError<SettingsWriteFailed>()("SettingsWriteFailed", {
  cause: Schema.Defect(),
}) {}

export class SettingsReadFailed extends Schema.TaggedError<SettingsReadFailed>()("SettingsReadFailed", {
  cause: Schema.Defect(),
}) {}
