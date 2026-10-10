Feature: Patient Studio
  Faculty author a case in the browser. Only a published profile can be interviewed.

  Scenario: A seed case validates and both patients can be selected
    When the faculty picks "Marcus Lee"
    Then the field "Name" is "Marcus Lee"
    And the field "Age" is "67"
    And the page shows "Patient Studio"
    When the faculty picks "Denise Carter"
    Then the field "Name" is "Denise Carter"
    And the field "Age" is "58"
    And the field "Opening line" is "Hi, I'm Denise."
    When the faculty presses "Check"
    Then the page shows "Case looks ready to publish."

  Scenario: An unpublished edit does not change the live visit
    When the faculty sets "Opening line" to "Draft opening, not yet live."
    And the student has launched "Denise Carter"
    Then the transcript shows "Hi, I'm Denise."
    And the page does not show "Draft opening, not yet live."
    When the user opens the "Patient Studio" workspace
    Then the field "Opening line" is "Draft opening, not yet live."
    When the faculty presses "Publish"
    Then the page shows "Published Denise Carter v2 (immutable). Ready to launch."
    And the page shows "58 · v2"
    When the student has launched "Denise Carter"
    Then the transcript shows "Draft opening, not yet live."
    And the page does not show "Hi, I'm Denise."

  Scenario: Faculty can author, publish, and interview a new patient
    When the faculty presses "New patient"
    Then the page shows "Fill in the case fields, then Check and Publish."
    When the faculty sets "Name" to "Alex Rivera"
    And the faculty sets "Age" to "44"
    And the faculty sets "Opening line" to "Hello, I am Alex."
    And the faculty sets "Personality" to "Calm and concrete"
    And the faculty sets "Emotional state" to "Worried"
    And the faculty sets "Communication style" to "Brief"
    And the faculty sets "Chief complaint / symptoms" to "Morning headaches for three weeks"
    And the faculty sets "Medical history" to "High blood pressure"
    And the faculty sets "Diagnosis" to "Hypertension"
    And the faculty sets "Medications" to "Lisinopril 10 mg daily"
    And the faculty sets "Allergies" to "Penicillin rash"
    And the faculty sets "Labs (one per line: name | value | unit | reference)" to "BP | 150/90 | mmHg | <120/80"
    And the faculty sets "What the patient says" to "I take my pill every day."
    And the faculty sets "What the chart says (intentional conflict)" to "Fill history shows a missed refill."
    And the faculty sets "Learning objectives (one per line)" to:
      """
      Gather the chief complaint
      Review the blood pressure
      Reconcile the missed refill
      """
    And the faculty presses "Check"
    Then the page shows "Case looks ready to publish."
    And the field "Personality" is "Calm and concrete"
    And the field "Allergies" is "Penicillin rash"
    And the field "Diagnosis" is "Hypertension"
    When the faculty presses "Publish"
    Then the page shows "Published Alex Rivera v1 (immutable). Ready to launch."
    And the page shows "44 · v1"
    When the student has launched "Alex Rivera"
    Then the transcript shows "Hello, I am Alex."
    And the page shows "Alex Rivera, 44"
    When the student asks "What is the problem?"
    Then the transcript shows "Morning headaches for three weeks"
    When the student opens the "Labs" chart section
    Then the page shows "150/90"

  Scenario: Incomplete labs block publish
    When the faculty presses "New patient"
    And the faculty sets "Labs (one per line: name | value | unit | reference)" to "eGFR | 58"
    And the faculty presses "Check"
    Then the page shows "Validation found errors."
    And the page shows "Lab missing unit or reference range"
    When the faculty presses "Publish"
    Then the page shows "Publish blocked: fix errors and rerun validation."

  Scenario: Reset asks for confirmation, and accepting it restores the demo
    When the faculty sets "Name" to "Temporary Patient"
    And the student has launched "Denise Carter"
    Then the page shows "Denise Carter, 58"
    And the page does not show "Temporary Patient"
    When the user opens the "Patient Studio" workspace
    Then the field "Name" is "Temporary Patient"
    When the faculty cancels reset
    Then the field "Name" is "Temporary Patient"
    When the faculty confirms reset
    Then the field "Name" is "Denise Carter"
    And the page shows "58 · v1"
    And the page does not show "Temporary Patient"
    When the user opens the "Encounter" workspace
    Then the page shows "Start a visit"
    And the page does not show "Tap to talk"
