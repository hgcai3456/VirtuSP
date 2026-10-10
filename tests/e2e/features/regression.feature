@live @regression
Feature: Regression
  Headless checks for the paths the visit scenarios do not finish:
  an unfinished interview, ignored blanks, reload, publishing, validation,
  the library, storage, and the files the page actually loads.

  Scenario: An untouched visit scores the gaps and keeps the chart locked
    Given the student has launched "Denise Carter"
    Then the selected chart section is "Overview"
    And the chart sections are "Overview, History, Medications, Labs, Imaging, Notes, Social"
    And the page shows "Laboratory report LR-0914"
    And the page shows "12-lead ECG"
    And the page shows "Abdominal CT"
    And the page shows "Locked · ask the right question or open labs"
    And the page shows "Locked · ask the right question or open img"
    And the page shows "Hidden faculty keys stay hidden"
    And the patient photo has loaded
    When the student opens the "History" chart section
    Then the page shows "Nothing released yet."
    And the page shows "Ask why they came in, about symptoms, or about their diagnosis."
    When the user opens the "Assessment" workspace
    Then the objective score is "0%"
    And the page shows "60 of 100 weight"
    And the page shows "0 turns logged"
    And the page shows "Not assessed"
    And the page shows "No turns"
    And the page shows "No handoff submitted"
    And the page shows "Discrepancy never surfaced (open the chart sources)"
    And the page shows "No interview yet"
    And the page shows "None yet."
    And the page shows "No reports opened."
    And the page shows "Did not unlock Laboratory report LR-0914"
    And the page shows "Did not unlock 12-lead ECG"
    And the page shows "Did not unlock Abdominal CT"
    And the page shows "Chief complaint: thirst and fatigue for months"
    And the page shows "Ask open, nonjudgmental questions about missed doses."

  Scenario: A partial interview records the miss and an empty handoff omits the finding
    Given the student has launched "Denise Carter"
    When the student asks "What brings you in today?"
    Then the transcript shows "I've been really thirsty and tired for a few months. My doctor says it's diabetes."
    When the user opens the "Team" workspace
    Then the selected role is "Primary care physician"
    And the page shows "Chief complaint: thirst and fatigue for months"
    And the handoff includes "Chief complaint: thirst and fatigue for months"
    And the handoff includes "S: Follow-up for Denise Carter, 58."
    When the student clears the handoff
    And the student submits the handoff
    Then the page shows "Submitted: 0/1"
    And the page shows "Omitted: Chief complaint: thirst and fatigue for months"
    When the user opens the "Assessment" workspace
    Then the objective score is "0%"
    And the page shows "75 of 100 weight"
    And the page shows "1 turns logged"
    And the page shows "Opened with the reason for the visit."
    And the page shows "Sensitive findings were not reached yet."
    And the page shows "Next attempt: open labs or imaging before deciding what is true."
    And the page shows "Next attempt: name the feeling before asking a harder question."
    And the page shows "Next attempt: ask how / what / tell me instead of closed questions."
    And the page shows "No judgmental wording logged."
    And the page shows "Did not unlock Laboratory report LR-0914"
    And the page shows "SBAR submitted by Primary care physician"

  Scenario: A blocked prescribing ask does not count as a turn or open the chart
    Given the student has launched "Denise Carter"
    When the student asks "What dose of metformin should I prescribe?"
    Then the transcript shows "Request blocked: no journal or medical_data row supports this clinical ask."
    And the transcript has 3 lines
    When the student opens the "History" chart section
    Then the page shows "Nothing released yet."
    When the user opens the "Assessment" workspace
    Then the objective score is "0%"
    And the page shows "0 turns logged"
    And the page shows "60 of 100 weight"
    And the page shows "No turns"
    And the page shows "No reports opened."
    And the page shows "Next attempt: start with why the patient is here before medications or conclusions."
    And the page shows "Reviewed chart evidence during the visit."

  Scenario: Blank questions, notes, and care-plan items are ignored
    Given the student has launched "Denise Carter"
    When the student sends ""
    And the student sends "   "
    Then the transcript has 1 lines
    And the transcript shows "Hi, I'm Denise."
    When the student opens the "Medications" chart section
    And the student saves a blank note
    And the student opens the "Notes" chart section
    Then the page does not show "clinician claim"
    When the user opens the "Team" workspace
    And the student adds a blank care plan item
    Then the care plan is empty

  Scenario: A note that misses the discrepancy is stored without credit
    Given the student has launched "Denise Carter"
    When the student asks "Tell me how you take your metformin."
    And the student opens the "Notes" chart section
    Then the page shows "Authored conflict"
    When the student opens the "Medications" chart section
    And the student documents "The weather is fine today."
    And the student opens the "Notes" chart section
    Then the page shows "The weather is fine today."
    And the page shows "clinician claim"
    And the page does not show "addresses discrepancy"
    When the user opens the "Assessment" workspace
    Then the page does not show "Reconciliation documented"
    And the page shows "Clinician claim documented: The weather is fine today."

  Scenario: The open visit survives a reload
    Given the student has launched "Denise Carter"
    When the student asks "What brings you in today?"
    And the user opens the "Team" workspace
    And the student switches role to "Nurse"
    And the student adds the care plan item "Call about the evening dose"
    And the page is reloaded
    Then the page shows "Call about the evening dose"
    And the selected role is "Nurse"
    And the page shows "Nurse"
    When the user opens the "Encounter" workspace
    Then the transcript shows "I've been really thirsty and tired for a few months. My doctor says it's diabetes."

  Scenario: An unpublished edit survives reload and stays off the live visit
    When the faculty sets "Name" to "Denise Draft"
    And the page is reloaded
    Then the field "Name" is "Denise Draft"
    When the student has launched "Denise Carter"
    Then the page shows "Denise Carter, 58"
    And the transcript shows "Hi, I'm Denise."
    And the page does not show "Denise Draft"

  Scenario: A newly published version does not rewrite the visit already open
    Given the student has launched "Denise Carter"
    Then the transcript shows "Hi, I'm Denise."
    When the user opens the "Patient Studio" workspace
    And the faculty sets "Opening line" to "Version two hello."
    And the faculty presses "Publish"
    Then the page shows "Published Denise Carter v2 (immutable). Ready to launch."
    And the page shows "58 · v2"
    When the user opens the "Encounter" workspace
    Then the transcript shows "Hi, I'm Denise."
    And the page does not show "Version two hello."
    When the user opens the "Patient Studio" workspace
    And the student has launched "Denise Carter"
    Then the transcript shows "Version two hello."
    And the page does not show "Hi, I'm Denise."

  Scenario: A blank age and opening line still publish a case the student can interview
    When the faculty presses "New patient"
    And the faculty sets "Name" to "Blank Line"
    And the faculty clears "Age"
    And the faculty clears "Opening line"
    Then the field "Age" is "0"
    And the field "Opening line" is ""
    When the faculty presses "Publish"
    Then the field "Opening line" is "Hi, I'm Blank."
    And the page shows "Published Blank Line v1 (immutable). Ready to launch."
    And the page shows "0 · v1"
    When the student has launched "Blank Line"
    Then the transcript shows "Hi, I'm Blank."
    And the page shows "Blank Line, 0"
    When the student asks "What is the problem?"
    Then the transcript shows "I'm not sure about that. Could you ask me another way?"

  Scenario: Switching patients keeps each draft
    When the faculty sets "Name" to "Denise Draft"
    And the faculty picks "Marcus Lee"
    Then the field "Name" is "Marcus Lee"
    And the field "Age" is "67"
    When the faculty picks "Denise Carter"
    Then the field "Name" is "Denise Draft"
    And the field "Opening line" is "Hi, I'm Denise."
    When the student has launched "Denise Carter"
    Then the page shows "Denise Carter, 58"
    And the page does not show "Denise Draft"

  Scenario: Launching another patient replaces the encounter
    Given the student has launched "Denise Carter"
    Then the transcript shows "Hi, I'm Denise."
    When the user opens the "Patient Studio" workspace
    And the student has launched "Marcus Lee"
    Then the transcript shows "Morning, doc. I'm Marcus."
    And the page shows "Marcus Lee, 67"
    And the page does not show "Hi, I'm Denise."
    And the patient photo points at "img/marcus.jpg"
    And the patient photo has loaded

  Scenario: Pause and the type box can be toggled, then the patient still answers
    Given the student has launched "Denise Carter"
    When the student pauses the conversation
    Then the page shows "Conversation paused."
    When the student toggles typing
    Then the question box is visible
    When the student toggles typing
    Then the question box is hidden
    When the student toggles typing
    And the student asks "What brings you in today?"
    Then the transcript shows "I've been really thirsty and tired for a few months. My doctor says it's diabetes."

  Scenario: The encounter workspace can start a visit and open a sample
    When the user opens the "Encounter" workspace
    Then the page shows "Start a visit"
    And the page shows "Choose a patient to begin the conversation."
    When the faculty watches "Nisha Patel"
    Then the page shows "Sample teaching conversation"
    And the sample video source contains "video/nisha.mp4"
    When the faculty closes the sample conversation
    Then the sample conversation is closed
    When the student has launched "Denise Carter"
    Then the transcript shows "Hi, I'm Denise."
    And the page shows "Chart · Denise Carter"

  Scenario: Faculty validation lists every authoring error and blocks publish
    When the faculty plants an invalid Denise draft
    And the faculty presses "Check"
    Then the page shows "Validation found errors."
    And the page shows "Duplicate fact id"
    And the page shows "Missing source"
    And the page shows "Disclosable fact has no approved patient wording (model could not ground it)"
    And the page shows "Lab missing unit or reference range"
    And the page shows "Chart fact has no release section"
    And the page shows "Unverified source: faculty must confirm"
    And the page shows "Allergy conflicts with medication"
    And the page shows "Objective references unknown fact missing-fact"
    And the page shows "Objective weights sum to 105, not 100"
    And the page shows "Mismatch references unknown facts"
    When the faculty presses "Publish"
    Then the page shows "Publish blocked: fix errors and rerun validation."
    And the page shows "58 · v1"

  @local-only
  Scenario: A repeated seed adds nothing, an ungrounded quote is rejected, and an unknown search is empty
    When the user opens the "Ground Truth" workspace
    And the faculty waits for the library to load
    And the faculty loads the seed publications until they are present
    When the faculty ingests this publication JSON:
      """
      {"title":"Ungrounded regression paper","year":2026,"abstract":"This abstract does not contain the supplied quote.","facts":[{"claim":"A quote that is not in the abstract at all.","quote":"A quote that is not in the abstract at all."}]}
      """
    Then the page shows "Ingested 1 publication(s) and added 0 grounded fact(s)."
    And the ungrounded publication adds a journal and no facts
    And the page shows "Ungrounded regression paper"
    When the faculty searches grounded facts for "zzzznomatch"
    Then the page shows "No grounded medical_data rows match this search."
    And the page shows "Ungrounded regression paper"

  Scenario: Pictures, the icon, and sample media load
    Given the landing page is open
    Then every image on the page has loaded
    When the user follows "Open simulator"
    Then the page shows "Patient Studio"
    And every patient portrait has loaded
    And every image on the page has loaded
    And these HTTP responses match:
      | path                 | status | type             |
      | /api/health          | 200    | application/json |
      | /favicon.svg         | 200    | image/svg+xml    |
      | /img/denise.jpg      | 200    | image/jpeg       |
      | /img/denise-ecg.jpg  | 200    | image/jpeg       |
      | /img/denise-ct.jpg   | 200    | image/jpeg       |
      | /img/marcus.jpg      | 200    | image/jpeg       |
      | /img/nisha.jpg       | 200    | image/jpeg       |
      | /img/yvette.jpg      | 200    | image/jpeg       |
      | /img/mramirez.jpg    | 200    | image/jpeg       |
      | /img/wyatt.jpg       | 200    | image/jpeg       |
      | /img/dominic.jpg     | 200    | image/jpeg       |
      | /img/walter.jpg      | 200    | image/jpeg       |
      | /img/vadko.jpg       | 200    | image/jpeg       |
      | /img/omar.jpg        | 200    | image/jpeg       |
      | /video/nisha.mp4     | 200    | video/mp4        |
      | /missing-page.html   | 404    | text/plain       |

  Scenario: Imaging pictures render after the section is opened
    Given the student has launched "Denise Carter"
    When the student opens the "Imaging" chart section
    Then the page shows "12-lead ECG"
    And the page shows "Abdominal CT"
    And the page shows "SYNTHETIC"
    And the released chart images have loaded

  Scenario: Corrupt storage rebuilds the demo, and a saved case ignores the legacy key
    When the saved case data is corrupt
    And the page is reloaded
    Then the page shows "Patient Studio"
    And the field "Name" is "Denise Carter"
    And the page shows "58 · v1"
    When the faculty stores the Denise draft under the legacy key as "Legacy Denise"
    And the page is reloaded
    Then the field "Name" is "Legacy Denise"
    When the faculty sets "Name" to "Legacy Denise"
    And the faculty points the legacy key at "Ignored Legacy"
    And the page is reloaded
    Then the field "Name" is "Legacy Denise"
    And the page does not show "Ignored Legacy"

  Scenario: The visit stays usable on a phone-width window
    When the window is 390 by 844
    And the student has launched "Denise Carter"
    Then the page shows "Denise Carter, 58"
    And the page shows "Tap to talk"
    When the student asks "What brings you in today?"
    Then the transcript shows "I've been really thirsty and tired for a few months. My doctor says it's diabetes."
    When the student opens the "Labs" chart section
    Then the page shows "eGFR"
    And the page shows "8.4"
