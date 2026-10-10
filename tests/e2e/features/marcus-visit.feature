@live
Feature: Marcus visit
  The same interview, chart, handoff, and scoring engine runs Marcus without a code change.

  Scenario: A student completes Marcus's visit
    Given the student has launched "Marcus Lee"
    Then the transcript shows "Morning, doc. I'm Marcus."
    And the patient photo points at "img/marcus.jpg"
    And the page shows "Marcus Lee, 67"
    When the student asks "What brings you in today?"
    Then the transcript shows "I get winded climbing one flight of stairs. It's worse than last winter."
    When the student asks "Tell me about your inhaler."
    Then the transcript shows "I use my blue inhaler maybe four times a week."
    When the student asks "I am sorry this has been hard. How do you use it?"
    Then the transcript shows "I use it fine."
    When the student asks "I am sorry this has been hard. How do you use it?"
    Then the transcript shows "Truth is, nobody showed me. I just puff and breathe in quick."
    When the student asks "Can you tell me about smoking?"
    Then the transcript shows "I still have about half a pack a day. I didn't want to say."
    When the student opens the "Labs" chart section
    Then the page shows "FEV1"
    And the page shows "52"
    And the page shows "Spirometry SP-0830"
    When the student opens the "Imaging" chart section
    Then the page shows "12-lead ECG"
    And the page shows "Chest CT"
    When the student asks "Tell me about your habits and lifestyle."
    Then the transcript shows "I quit smoking years ago."
    When the student opens the "Notes" chart section
    Then the page shows "current smoker, 0.5 ppd, pack-years 30"
    And the page shows "Authored conflict"
    When the student opens the "History" chart section
    Then the page shows "Chief complaint: breathless on stairs"
    When the student opens the "Social" chart section
    Then the page shows "Smoking: half pack/day"
    When the student opens the "Medications" chart section
    And the student documents "Patient says he quit but the chart shows current smoking."
    And the student opens the "Notes" chart section
    Then the page shows "Patient says he quit but the chart shows current smoking."
    When the user opens the "Team" workspace
    And the student switches role to "Nurse"
    And the student adds the care plan item "Teach inhaler technique with a spacer"
    And the student submits the handoff
    Then the page shows "Submitted:"
    And the page shows "Teach inhaler technique with a spacer"
    When the user opens the "Assessment" workspace
    Then the objective score is "100%"
    And the page shows "Uncover true smoking status (critical)"
    And the page shows "Assess inhaler technique"
    And the page shows "Review spirometry"
    And the page shows "Reconcile smoking status discrepancy"
    And the page shows "Empathic communication"
    And the page shows "No interview findings left on the table."
    And the page does not show "Did not unlock"
    And the page shows "SBAR submitted by Nurse"
