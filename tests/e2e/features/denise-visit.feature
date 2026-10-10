@live
Feature: Denise visit
  A student interviews Denise, opens the chart as facts are earned, reconciles the
  metformin discrepancy, hands off in SBAR, and reads an evidence-linked score.

  Scenario: A student completes Denise's visit
    Given the student has launched "Denise Carter"
    Then the transcript shows "Hi, I'm Denise."
    And the patient photo points at "img/denise.jpg"
    When the student asks "What brings you in today?"
    Then the transcript shows "I've been really thirsty and tired for a few months. My doctor says it's diabetes."
    And the transcript shows "grounded: d1"
    When the student asks "Tell me how you take your metformin."
    Then the transcript shows "I take my metformin every day, like I'm supposed to."
    When the student opens the "History" chart section
    Then the selected chart section is "History"
    And the page shows "Chief complaint: thirst and fatigue for months"
    When the student opens the "Medications" chart section
    Then the page shows "metformin 500 mg PO BID"
    And the page shows "Document the conflict"
    When the student opens the "Labs" chart section
    Then the page shows "eGFR"
    And the page shows "8.4"
    And the page shows "released"
    When the student opens the "Imaging" chart section
    Then the page shows "12-lead ECG"
    And the page shows "Abdominal CT"
    When the student opens the "Notes" chart section
    Then the page shows "45-day gap in metformin refills"
    And the page shows "Authored conflict"
    When the student asks "I am sorry this has been hard. What gets in the way of every dose?"
    Then the transcript shows "I take it. Like I said."
    When the student asks "I am sorry this has been hard. What gets in the way of every dose?"
    Then the transcript shows "honestly I skip the evening one a lot"
    When the student asks "Can you tell me about the cost of refills?"
    Then the transcript shows "Money is tight. Sometimes I wait to refill until payday."
    When the student asks "What do you usually eat and drink?"
    Then the transcript shows "I drink a lot of sweet tea and eat out a lot because of my work hours."
    When the student opens the "Social" chart section
    Then the page shows "Diet: sweet tea, frequent takeout"
    And the page shows "Cost barrier: delays refills until payday"
    When the student opens the "Overview" chart section
    Then the page shows "Clinical artifacts"
    And the page shows "Authored conflict"
    And the page shows "Laboratory report LR-0914"
    When the student opens the "Medications" chart section
    And the student documents "The refill gap conflicts with her story of taking every dose."
    And the student opens the "Notes" chart section
    Then the page shows "The refill gap conflicts with her story of taking every dose."
    And the page shows "clinician claim"
    When the user opens the "Team" workspace
    Then the page shows "Role and SBAR handoff"
    And the page shows "Shared team record"
    When the student switches role to "Nephrologist/Specialist"
    And the student switches role to "Dietitian"
    And the student switches role to "Nurse"
    And the student switches role to "Pharmacist"
    And the student switches role to "Primary care physician"
    And the student switches role to "Pharmacist"
    And the student adds the care plan item "Review the evening dose and the refill barrier"
    And the student adds " Recommend a pharmacist review." to the handoff
    And the student submits the handoff
    Then the page shows "Submitted:"
    And the page shows "Review the evening dose and the refill barrier"
    And the page shows "Pharmacist"
    When the user opens the "Assessment" workspace
    Then the objective score is "100%"
    And the page shows "Elicit adherence barrier (critical)"
    And the page shows "Explore cost and diet barriers"
    And the page shows "Review eGFR and HbA1c"
    And the page shows "Recognize and reconcile adherence discrepancy"
    And the page shows "Empathic, open-ended communication"
    And the page shows "Structured SBAR handoff"
    And the page shows "Reconciliation documented"
    And the page shows "Follow-up elicited: d4"
    And the page shows "Opened labs"
    And the page shows "Opened with the reason for the visit."
    And the page shows "Built rapport before asking the harder question."
    And the page shows "Reviewed chart evidence during the visit."
    And the page shows "Empathic language used."
    And the page shows "No judgmental wording logged."
    And the page shows "Understanding of diagnosis"
    And the page shows "Allergy: sulfa drugs (rash)"
    And the page does not show "Did not unlock"
    And the page shows "Interaction log"
    And the page shows "addresses discrepancy"
    And the page shows "Switched role to Pharmacist"
    And the page shows "SBAR submitted by Pharmacist"
