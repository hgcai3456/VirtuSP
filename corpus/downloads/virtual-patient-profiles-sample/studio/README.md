# Organizer-linked patient documents

These 24 TXT documents split eight synthetic profiles from the **VHS project at Rutgers University** into upload-ready case briefs, clinical records and faculty notes. They are tracked in Git so teammates can use them immediately after pulling.

Source: [joeljames270/virtual-patient-profiles-sample](https://huggingface.co/datasets/joeljames270/virtual-patient-profiles-sample), pinned revision `ee5c260a6e24cd9d6baf5c0ab7ec636788c64c70`. License: **CC BY 4.0**. The split format is an application adaptation; supplied values are preserved. See [dataset metadata](../../../datasets.json) and [corpus guide](../../../../docs/CORPUS.md).

- `case-brief.txt`: patient identity, character and interview material; upload as **Case brief**.
- `clinical-record.txt`: clinical/chart material; upload as **Chart report**. Keep hidden facts protected by disclosure rules.
- `faculty-notes.txt`: assumptions, optional details and authoring notes; faculty reference only. These are not automatically approved patient facts.

These source packages are not published application profiles. Review extraction and disclosure settings when creating your own patient. The preconfigured demo comparison group is separately stored in `corpus/prepared-groups.json` and uses the shorter faculty CSV plus a team-authored identity variant.

`npm run corpus:fetch` can reproduce the original downloads and these splits. Raw downloads, normalized caches and the separate Patient-Doctor corpus remain ignored by Git.
