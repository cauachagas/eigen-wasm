# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the strings used
in this repo's issue tracker.

The tracker is local markdown under `.scratch/`, so a role is recorded as a `Status:` line in the ticket
file. The mapping is an identity table: no label strings are created anywhere, because there is nowhere
to create them.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), write the corresponding string
into the ticket's `Status:` line.